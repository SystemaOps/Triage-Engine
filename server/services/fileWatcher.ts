/**
 * File Ingestion Watcher Daemon
 * =============================
 * A lightweight background process that monitors dedicated directories
 * for flat files (JSON/CSV) containing patient triage records and
 * diagnostic reports.
 *
 * Lifecycle for each dropped file:
 *   1. APPEAR — chokidar detects a new file in ./ingestion/incoming/
 *   2. STABILIZE — waits for the file to finish copying (awaitWriteFinish)
 *   3. READ — parses the file content (JSON array, JSON line-delimited, or CSV)
 *   4. VALIDATE — runs each record through ingestionValidator
 *   5. INDEX — pipes valid records to POST /api/vector/index-all
 *   6. ARCHIVE — on success: move to ./ingestion/archive/
 *                on failure: move to ./ingestion/error/ with violation log
 *
 * Run standalone:
 *   npx tsx server/services/fileWatcher.ts
 *
 * Or import and start from the Express server:
 *   import { startFileWatcher } from "./services/fileWatcher";
 *   startFileWatcher();
 */

import fs from "node:fs/promises";
import path from "node:path";
import chokidar from "chokidar";
import { autoValidate, type ValidationResult } from "./ingestionValidator";
import { buildCaseSearchText } from "./openaiClient";

// ── Directory Layout ──

export const INGESTION_ROOT = path.resolve(process.cwd(), "ingestion");
export const INCOMING_DIR = path.join(INGESTION_ROOT, "incoming");
export const ARCHIVE_DIR = path.join(INGESTION_ROOT, "archive");
export const ERROR_DIR = path.join(INGESTION_ROOT, "error");

// ── File Patterns ──

const SUPPORTED_EXTENSIONS = /\.(json|csv)$/i;

// ── Configuration ──

interface FileWatcherConfig {
  /** Target URL for the vector indexing API (default: local Express server) */
  apiUrl: string;
  /** Milliseconds to wait after a file stops changing before processing it */
  settleMs: number;
  /** Log handler (defaults to console.log) */
  log: (msg: string) => void;
}

const DEFAULT_CONFIG: FileWatcherConfig = {
  apiUrl: `http://localhost:${process.env.PORT || "5001"}/api/vector/index-all`,
  settleMs: 500,
  log: (msg) => console.log(`[fileWatcher] ${msg}`),
};

// ── File Reading & Parsing ──

/**
 * Reads and parses a file. Supports:
 *   - .json: JSON array, single JSON object, or newline-delimited JSON
 *   - .csv: Comma-separated values (first row = headers)
 *
 * Returns an array of record objects (possibly empty).
 */
async function parseFile(filePath: string): Promise<Record<string, unknown>[]> {
  const raw = await fs.readFile(filePath, "utf-8").catch(() => null);
  if (raw === null || raw.trim().length === 0) {
    return [];
  }

  const extension = path.extname(filePath).toLowerCase();

  if (extension === ".json") {
    const trimmed = raw.trim();

    if (trimmed.startsWith("[")) {
      // JSON array of records
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed)) return parsed as Record<string, unknown>[];
      return [];
    }

    if (trimmed.startsWith("{")) {
      // Single JSON object — wrap in array
      return [JSON.parse(trimmed) as Record<string, unknown>];
    }

    // NDJSON: one JSON object per line
    const lines = trimmed.split("\n").map((l) => l.trim()).filter(Boolean);
    return lines.map((line) => JSON.parse(line) as Record<string, unknown>);
  }

  if (extension === ".csv") {
    return parseCsv(raw);
  }

  return [];
}

/**
 * Minimal CSV parser. Expects the first row to be column headers.
 * Returns an array of objects keyed by header names.
 */
function parseCsv(raw: string): Record<string, unknown>[] {
  const lines = raw
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean);

  if (lines.length < 2) return [];

  const headers = parseCsvRow(lines[0]);
  const records: Record<string, unknown>[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvRow(lines[i]);
    if (values.length === 0) continue;

    const record: Record<string, unknown> = {};
    for (let j = 0; j < headers.length; j++) {
      const value = values[j];
      if (value === "true") record[headers[j]] = true;
      else if (value === "false") record[headers[j]] = false;
      else if (/^-?\d+(\.\d+)?$/.test(value)) record[headers[j]] = parseFloat(value);
      else record[headers[j]] = value;
    }
    records.push(record);
  }

  return records;
}

/**
 * Parses a single CSV row, respecting double-quoted fields.
 */
function parseCsvRow(line: string): string[] {
  const fields: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (ch === "," && !inQuotes) {
      fields.push(current.trim());
      current = "";
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());

  return fields;
}

// ── API Client ──

/**
 * Sends validated records to the Express vector indexing endpoint.
 * Separates records into patients and reports by signature, builds
 * the vector payload, and POSTs to the /api/vector/index-all endpoint.
 */
async function indexRecords(
  apiUrl: string,
  records: Record<string, unknown>[],
  log: (msg: string) => void,
): Promise<boolean> {
  const patients: Record<string, unknown>[] = [];
  const reports: Record<string, unknown>[] = [];

  for (const record of records) {
    const hasPatientSig =
      typeof record.patientName === "string" &&
      typeof record.triageCategory === "string";
    const hasReportSig =
      typeof record.patientId === "string" &&
      typeof record.category === "string" &&
      typeof record.subType === "string";

    if (hasPatientSig) {
      patients.push({
        id: (record.id as string) ?? `ingested-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: buildCaseSearchText({
          patientName: record.patientName as string,
          triageCategory: record.triageCategory as string,
          status: record.status as string | undefined,
          reason: extractReason(record),
        }),
        metadata: {
          patientName: record.patientName as string,
          triageCategory: record.triageCategory as string,
          status: record.status as string | undefined,
          confidence: (record.confidence as number) ?? 0,
          timestamp: (record.timestamp as string) ?? new Date().toISOString(),
          sourceType: "patient",
        },
      });
    } else if (hasReportSig) {
      const content = record.content as Record<string, unknown> | undefined;
      reports.push({
        id: (record.id as string) ?? `report_ingested-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        text: buildCaseSearchText({
          patientName: record.patientName as string,
          triageCategory: record.category as string,
          status: record.status as string | undefined,
          aiAnalysis: (content?.aiAnalysis as string | undefined) ?? null,
          rawText: (content?.rawText as string | undefined) ?? null,
          reviewNote: (record.reviewNote as string | undefined) ?? null,
        }),
        metadata: {
          patientName: record.patientName as string,
          triageCategory: record.category as string,
          status: record.status as string | undefined,
          confidence: (record.confidence as number) ?? 0,
          timestamp: (record.createdAt as string) ?? new Date().toISOString(),
          sourceType: "report",
          reportCategory: record.category as string | undefined,
          subType: record.subType as string | undefined,
          verified: record.status === "verified" ? true : null,
          clinicianOverride: (record.clinicianTriageOverride as string | undefined) ?? null,
        },
      });
    }
  }

  if (patients.length === 0 && reports.length === 0) {
    log("No valid patient or report records to index.");
    return false;
  }

  const payload: Record<string, unknown> = {};
  if (patients.length > 0) payload.patients = patients;
  if (reports.length > 0) payload.reports = reports;

  log(`Indexing ${patients.length} patient(s) + ${reports.length} report(s)...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.ADMIN_API_KEY
          ? { Authorization: `Bearer ${process.env.ADMIN_API_KEY}` }
          : {}),
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      const errorBody = await response.text().catch(() => "unknown");
      log(`Index API returned ${response.status}: ${errorBody}`);
      return false;
    }

    const result = (await response.json()) as { success: boolean; indexedCount: number };
    log(`Index API success: ${result.indexedCount ?? "?"} vectors upserted.`);
    return true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log(`Index API request failed: ${message}`);
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Extracts the first trace event reason from a record, if present.
 */
function extractReason(record: Record<string, unknown>): string | undefined {
  const traceEvents = record.traceEvents as Array<{ reason?: string }> | undefined;
  return traceEvents?.[0]?.reason;
}

// ── File Processing Pipeline ──

interface ProcessResult {
  file: string;
  recordsFound: number;
  recordsValid: number;
  indexed: boolean;
  archived: boolean;
}

/**
 * Full processing pipeline for a single dropped file:
 *   1. Parse → 2. Validate → 3. Index → 4. Archive or Error
 *
 * Error handling is unified: if any step fails, the file is moved to
 * error/ with a descriptive log. This function does NOT throw — errors
 * are captured and returned in the ProcessResult.
 */
async function processFile(
  filePath: string,
  config: FileWatcherConfig,
): Promise<ProcessResult> {
  const { apiUrl, log } = config;
  const fileName = path.basename(filePath);
  log(`Processing: ${fileName}`);

  // ── Step 1: Parse ──
  const rawRecords = await parseFile(filePath);
  if (rawRecords.length === 0) {
    log(`Empty or unreadable file: ${fileName}`);
    await moveToError(filePath, "Empty or unreadable file.");
    return { file: fileName, recordsFound: 0, recordsValid: 0, indexed: false, archived: false };
  }
  log(`Parsed ${rawRecords.length} record(s) from ${fileName}`);

  // ── Step 2: Validate ──
  const validRecords: Record<string, unknown>[] = [];
  const validationErrors: Array<{ index: number; errors: string[] }> = [];

  for (let i = 0; i < rawRecords.length; i++) {
    const result: ValidationResult = autoValidate(rawRecords[i]);
    if (result.valid) {
      validRecords.push(rawRecords[i]);
    } else {
      validationErrors.push({ index: i, errors: result.errors });
    }
  }

  if (validationErrors.length > 0) {
    const errorSummary = validationErrors
      .map((v) => `  [${v.index}] ${v.errors.join("; ")}`)
      .join("\n");
    log(`Schema violations in ${fileName}:\n${errorSummary}`);
  }

  if (validRecords.length === 0) {
    log(`No valid records in ${fileName} — moving to error/`);
    await moveToError(filePath, `All ${rawRecords.length} record(s) failed schema validation.`);
    return {
      file: fileName,
      recordsFound: rawRecords.length,
      recordsValid: 0,
      indexed: false,
      archived: false,
    };
  }

  // ── Step 3: Index ──
  const indexed = await indexRecords(apiUrl, validRecords, log);

  // ── Step 4: Archive or Error ──
  if (indexed) {
    await moveToArchive(filePath);
    log(`Archived: ${fileName}`);
  } else {
    await moveToError(
      filePath,
      `Indexing failed after ${rawRecords.length} record(s) parsed, ${validRecords.length} valid.`,
    );
    log(`Moved to error/: ${fileName} (indexing failed)`);
  }

  return {
    file: fileName,
    recordsFound: rawRecords.length,
    recordsValid: validRecords.length,
    indexed,
    archived: indexed,
  };
}

// ── File Operations ──

/**
 * Moves a file to the archive directory, appending a timestamp
 * to prevent name collisions.
 */
async function moveToArchive(filePath: string): Promise<void> {
  const base = path.basename(filePath);
  const stamp = Date.now();
  const dest = path.join(ARCHIVE_DIR, `${stamp}-${base}`);
  await fs.mkdir(ARCHIVE_DIR, { recursive: true });
  await fs.rename(filePath, dest);
}

/**
 * Moves a file to the error directory, appending a timestamp
 * and writing a sidecar .error.log file with details.
 *
 * Handles cross-device rename failures (e.g., Docker bind mounts)
 * by falling back to copy + delete.
 */
async function moveToError(filePath: string, reason: string): Promise<void> {
  const base = path.basename(filePath);
  const stamp = Date.now();
  const dest = path.join(ERROR_DIR, `${stamp}-${base}`);
  await fs.mkdir(ERROR_DIR, { recursive: true });

  try {
    await fs.rename(filePath, dest);
  } catch {
    // Cross-device rename fallback (Docker bind mounts, NFS, etc.)
    const content = await fs.readFile(filePath);
    await fs.writeFile(dest, content);
    await fs.unlink(filePath).catch(() => {});
  }

  // Write error log sidecar
  const logPath = `${dest}.error.log`;
  const logContent = [
    `Failed at: ${new Date().toISOString()}`,
    `Original file: ${base}`,
    `Reason: ${reason}`,
  ].join("\n");
  await fs.writeFile(logPath, logContent);
}

// ── Directory Initialization ──

/**
 * Ensures the ingestion directory structure exists.
 */
async function ensureDirectories(): Promise<void> {
  for (const dir of [INCOMING_DIR, ARCHIVE_DIR, ERROR_DIR]) {
    await fs.mkdir(dir, { recursive: true });
  }
}

// ── Watcher ──

let watcher: ReturnType<typeof chokidar.watch> | null = null;

/**
 * Starts the file watcher daemon.
 *
 * Uses chokidar's built-in `awaitWriteFinish` to handle the settle
 * period — no manual change-tracking or event-listener management needed.
 *
 * @param customConfig — Override defaults (e.g., different API URL)
 * @returns The chokidar watcher instance (call .close() to stop)
 */
export async function startFileWatcher(
  customConfig?: Partial<FileWatcherConfig>,
): Promise<ReturnType<typeof chokidar.watch>> {
  const config = { ...DEFAULT_CONFIG, ...customConfig };
  const { settleMs, log } = config;

  if (watcher) {
    log("File watcher is already running.");
    return watcher;
  }

  await ensureDirectories();

  log(`Watching for files in: ${INCOMING_DIR}`);
  log(`Archive to: ${ARCHIVE_DIR}`);
  log(`Errors to: ${ERROR_DIR}`);
  log(`Index API: ${config.apiUrl}`);

  watcher = chokidar.watch(INCOMING_DIR, {
    ignoreInitial: true,
    depth: 0,
    // awaitWriteFinish eliminates the need for manual settle timers
    // and change-event tracking — chokidar waits until the file size
    // stops changing before emitting the 'add' event.
    awaitWriteFinish: {
      stabilityThreshold: settleMs,
      pollInterval: 100,
    },
    // Fall back to polling on production (e.g., Docker, NFS) where
    // filesystem events may not be reliable
    usePolling: process.env.NODE_ENV === "production",
    interval: 1000,
  });

  watcher.on("add", async (filePath: string) => {
    if (!SUPPORTED_EXTENSIONS.test(filePath)) {
      log(`Ignored unsupported file: ${path.basename(filePath)}`);
      return;
    }

    const fileName = path.basename(filePath);
    log(`Detected: ${fileName}`);

    try {
      const result = await processFile(filePath, config);
      log(
        `Done: ${result.file} | ` +
          `records: ${result.recordsFound} found, ${result.recordsValid} valid | ` +
          `indexed: ${result.indexed} | archived: ${result.archived}`,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      log(`Fatal error processing ${fileName}: ${message}`);
      // This catch is only for unexpected exceptions that escape processFile
      await moveToError(filePath, `Unexpected error: ${message}`).catch(() => {});
    }
  });

  watcher.on("error", (error: Error) => {
    log(`Watcher error: ${error.message}`);
  });

  log("File watcher daemon started.");
  return watcher;
}

/**
 * Stops the file watcher daemon.
 */
export async function stopFileWatcher(): Promise<void> {
  if (watcher) {
    await watcher.close();
    watcher = null;
    console.log("[fileWatcher] File watcher daemon stopped.");
  }
}

// ── Standalone Entry Point ──

/**
 * When run directly as `npx tsx server/services/fileWatcher.ts`,
 * starts the daemon and keeps the process alive.
 */
if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  startFileWatcher()
    .then(() => {
      console.log("[fileWatcher] Standalone daemon running. Press Ctrl+C to stop.");

      const shutdown = async () => {
        console.log("\n[fileWatcher] Shutting down...");
        await stopFileWatcher();
        process.exit(0);
      };

      process.on("SIGINT", shutdown);
      process.on("SIGTERM", shutdown);
    })
    .catch((err) => {
      console.error("[fileWatcher] Failed to start:", err);
      process.exit(1);
    });
}
