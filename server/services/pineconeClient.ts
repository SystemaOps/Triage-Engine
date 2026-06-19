/**
 * Pinecone Vector Store Service
 * ==============================
 * Pinecone client wrapper for indexing and querying triage case vectors.
 *
 * Environment variables (.env):
 *   PINECONE_API_KEY  — Pinecone API key (required)
 *   PINECONE_INDEX    — Pinecone index name (default: "triage-cases")
 *
 * The index should be configured with:
 *   - Dimensions: 1536 (OpenAI text-embedding-3-small)
 *   - Metric: cosine
 *   - Pod type: serverless
 */

import { Pinecone, type PineconeRecord } from "@pinecone-database/pinecone";

// ── Types ──

export interface TriageCaseVectorMetadata {
  patientName: string;
  triageCategory: string;
  status: string;
  confidence: number;
  timestamp: string;
  sourceType: "patient" | "report";
  reportCategory: string | null;
  subType: string | null;
  verified: boolean | null;
  clinicianOverride: string | null;
}

export interface TriageCaseVector {
  id: string;
  values: number[];
  metadata: TriageCaseVectorMetadata;
}

export interface VectorSearchMatch {
  id: string;
  score: number;
  metadata: TriageCaseVectorMetadata;
}

export interface VectorSearchResult {
  matches: VectorSearchMatch[];
  query: string;
}

// ── Pinecone Client Singleton ──

let pineconeClient: Pinecone | null = null;

function getClient(): Pinecone {
  if (!pineconeClient) {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error(
        "PINECONE_API_KEY is not set. Add it to your .env file:\n" +
          "  PINECONE_API_KEY=\"your-pinecone-key\"\n" +
          "Or export it as an environment variable.",
      );
    }
    pineconeClient = new Pinecone({ apiKey });
  }
  return pineconeClient;
}

function getIndexName(): string {
  return process.env.PINECONE_INDEX || "triage-cases";
}

// ── Upsert Operations ──

/**
 * Upserts one or more triage case vectors into the Pinecone index.
 * Batches in chunks of 500 to stay within the Pinecone API limit of 1000.
 */
export async function upsertVectors(vectors: TriageCaseVector[]): Promise<void> {
  const pc = getClient();
  const indexName = getIndexName();
  const index = pc.index(indexName);
  const BATCH_SIZE = 500;

  for (let i = 0; i < vectors.length; i += BATCH_SIZE) {
    const batch = vectors.slice(i, i + BATCH_SIZE);
    await index.upsert({ records: batch as unknown as PineconeRecord[] });
    console.log(
      `[pineconeClient] Upserted batch ${Math.floor(i / BATCH_SIZE) + 1}: ${batch.length} vectors`,
    );
  }

  console.log(
    `[pineconeClient] Upsert complete: ${vectors.length} vectors to index '${indexName}'`,
  );
}

/**
 * Upserts a single vector into the Pinecone index.
 */
export async function upsertVector(vector: TriageCaseVector): Promise<void> {
  await upsertVectors([vector]);
}

/**
 * Deletes vectors by their IDs from the index.
 */
export async function deleteVectors(ids: string[]): Promise<void> {
  const pc = getClient();
  const index = pc.index(getIndexName());
  await index.deleteMany(ids);
  console.log(`[pineconeClient] Deleted ${ids.length} vectors`);
}

// ── Query Operations ──

/**
 * Searches the vector index for the most similar triage cases.
 */
export async function querySimilar(
  embedding: number[],
  topK: number = 10,
  filter?: Record<string, unknown>,
): Promise<VectorSearchMatch[]> {
  const pc = getClient();
  const index = pc.index(getIndexName());

  const response = await index.query({
    vector: embedding,
    topK,
    includeMetadata: true,
    filter: filter as Record<string, string | number | boolean | string[]> | undefined,
  });

  const matches: VectorSearchMatch[] = (response.matches ?? []).map(
    (match) => ({
      id: match.id,
      score: match.score ?? 0,
      metadata: match.metadata as unknown as TriageCaseVectorMetadata,
    }),
  );

  return matches;
}

// ── Index Health ──

/**
 * Returns the total number of records in the Pinecone index.
 */
export async function getVectorCount(): Promise<number> {
  const pc = getClient();
  const index = pc.index(getIndexName());
  const stats = await index.describeIndexStats();
  return stats.totalRecordCount ?? 0;
}
