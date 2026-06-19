/**
 * STT (Speech-to-Text) Client Service
 * =====================================
 * Client for the external STT microservice hosted on Railway.
 * Uploads audio files and returns transcribed text.
 *
 * Endpoints:
 *   POST /transcribe        — Upload audio file for transcription
 *   GET  /health            — Service health check
 *   GET  /session/{id}      — Get session details
 *   GET  /logs?lines=N      — Get service logs
 *
 * Environment variables:
 *   STT_API_BASE_URL — defaults to https://stt-tts-service-production.up.railway.app
 */

const DEFAULT_STT_BASE_URL = "https://stt-tts-service-production.up.railway.app";

function baseUrl(): string {
  return process.env.STT_API_BASE_URL || DEFAULT_STT_BASE_URL;
}

// ── Types ──

export interface SttTranscribeRequest {
  /** Audio file buffer */
  buffer: Buffer;
  /** Original file name (e.g., "consultation.wav") */
  originalname: string;
  /** MIME type (e.g., "audio/wav", "audio/mp3", "audio/m4a") */
  mimetype: string;
  /** Whisper model to use (default: "base") */
  model?: string;
  /** Language code (default: "en") */
  language?: string;
  /** Use higher-accuracy STT mode (slower but more precise) */
  accuracyMode?: boolean;
}

export interface SttTranscribeResponse {
  success: boolean;
  /** Transcribed text */
  text: string;
  /** Detected or requested language */
  language: string | null;
  /** Processing timestamp */
  timestamp: string;
  /** Model used for transcription */
  model: string;
  /** Processing time in seconds */
  processingTime: number | null;
  /** Session ID for follow-up queries */
  sessionId: string;
  /** Path to the stored audio file on the server */
  audioFile: string | null;
  /** Path to the stored transcript file on the server */
  transcriptFile: string | null;
  /** Path to the stored metadata file on the server */
  metadataFile: string | null;
}

export interface SttHealthResponse {
  status: string;
  model: string;
  service: string;
}

// ── Transcription ──

/**
 * POST /transcribe
 *
 * Uploads an audio file to the external STT microservice for transcription.
 * Returns the transcribed text along with session metadata.
 */
export async function transcribeAudio(
  request: SttTranscribeRequest,
): Promise<SttTranscribeResponse> {
  const { buffer, originalname, mimetype, model, language, accuracyMode } = request;
  const params = new URLSearchParams();
  params.set("model", model || "base");
  params.set("language", language || "en");
  if (accuracyMode) {
    params.set("accuracy_mode", "true");
  }
  const url = `${baseUrl()}/transcribe?${params.toString()}`;

  console.log(
    `[sttClient] Sending audio to STT API: ${originalname} (${buffer.length} bytes, model=${model || "base"}, lang=${language || "en"})`,
  );

  // Build multipart form-data payload using native FormData + Blob
  const form = new FormData();
  const blob = new Blob([buffer], { type: mimetype });
  form.append("file", blob, originalname);

  const response = await fetch(url, {
    method: "POST",
    body: form,
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(
      `STT API error (${response.status}): ${errorBody}`,
    );
  }

  const rawData = (await response.json()) as {
    status: string;
    text: string;
    language: string | null;
    timestamp: string;
    model: string;
    processing_time: number | null;
    session_id: string;
    audio_file: string | null;
    transcript_file: string | null;
    metadata_file: string | null;
  };

  console.log("[sttClient] Transcription complete:", {
    originalname,
    sessionId: rawData.session_id,
    textLength: rawData.text?.length ?? 0,
    processingTime: rawData.processing_time,
  });

  return {
    success: rawData.status === "ok",
    text: rawData.text ?? "",
    language: rawData.language,
    timestamp: rawData.timestamp,
    model: rawData.model,
    processingTime: rawData.processing_time,
    sessionId: rawData.session_id,
    audioFile: rawData.audio_file,
    transcriptFile: rawData.transcript_file,
    metadataFile: rawData.metadata_file,
  };
}

// ── Health Check ──

/**
 * GET /health
 *
 * Checks if the external STT API is reachable and healthy.
 */
export async function checkSttHealth(): Promise<{
  reachable: boolean;
  status: string;
  model: string;
  service: string;
}> {
  try {
    const response = await fetch(`${baseUrl()}/health`, {
      method: "GET",
    });

    if (!response.ok) {
      return {
        reachable: false,
        status: `HTTP ${response.status}`,
        model: "unknown",
        service: "unknown",
      };
    }

    const data = (await response.json()) as SttHealthResponse;
    return {
      reachable: true,
      status: data.status,
      model: data.model,
      service: data.service,
    };
  } catch (error) {
    return {
      reachable: false,
      status: error instanceof Error ? error.message : String(error),
      model: "unknown",
      service: "unknown",
    };
  }
}

// ── Session Details ──

/**
 * GET /session/{session_id}
 *
 * Retrieves details for a specific transcription session.
 */
export async function getSession(
  sessionId: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(`${baseUrl()}/session/${encodeURIComponent(sessionId)}`, {
    method: "GET",
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(
      `STT session API error (${response.status}): ${errorBody}`,
    );
  }

  return response.json() as Promise<Record<string, unknown>>;
}
