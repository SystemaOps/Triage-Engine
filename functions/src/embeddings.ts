/**
 * Embedding Service
 * =================
 * Generates vector embeddings for triage case text using OpenAI's
 * text-embedding-3-small model (1536 dimensions).
 *
 * Environment variables:
 *   OPENAI_API_KEY  — OpenAI API key (required)
 *
 * 🔄 Swap this module to use a different embedding provider
 *    (Vertex AI, Cohere, local transformers, etc.) by implementing
 *    the same `generateEmbedding(text)` / `generateEmbeddings(texts)`
 *    signature.
 */

import { logger } from "firebase-functions/v2";

// ── Configuration ──

const EMBEDDING_MODEL = "text-embedding-3-small";
const EMBEDDING_DIMENSIONS = 1536;

// ── Embedding Generation ──

/**
 * Generates a single embedding vector for the given text.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Set it in your Firebase environment configuration:\n" +
        "  firebase functions:secrets:set OPENAI_API_KEY\n" +
        "Or set the environment variable directly in .env / functions.env.",
    );
  }

  const response = await fetch(
    "https://api.openai.com/v1/embeddings",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        input: text,
        model: EMBEDDING_MODEL,
        dimensions: EMBEDDING_DIMENSIONS,
      }),
    },
  );

  if (!response.ok) {
    const errorBody = await response.text();
    throw new Error(
      `OpenAI embedding API error (${response.status}): ${errorBody}`,
    );
  }

  const data = (await response.json()) as {
    data: Array<{ embedding: number[] }>;
  };

  if (!data.data || data.data.length === 0) {
    throw new Error("OpenAI embedding API returned empty data array");
  }

  return data.data[0].embedding;
}

/**
 * Generates embeddings for multiple texts in parallel batches.
 * Uses batched API calls (up to 20 texts per request) for efficiency.
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set.");
  }

  // Process in batches of 20 to avoid request size limits
  const BATCH_SIZE = 20;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const response = await fetch(
      "https://api.openai.com/v1/embeddings",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          input: batch,
          model: EMBEDDING_MODEL,
          dimensions: EMBEDDING_DIMENSIONS,
        }),
      },
    );

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(
        `OpenAI batch embedding error (${response.status}): ${errorBody}`,
      );
    }

    const data = (await response.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
    };

    // Sort by index to maintain input order
    const sorted = data.data.sort((a, b) => a.index - b.index);
    for (const item of sorted) {
      allEmbeddings.push(item.embedding);
    }

    logger.info(
      `[embeddings] Generated ${batch.length} embeddings (batch ${i / BATCH_SIZE + 1})`,
    );
  }

  return allEmbeddings;
}

/**
 * Builds a searchable text payload from a triage case's clinical data.
 * This text is what gets embedded and searched semantically.
 */
export function buildCaseSearchText(params: {
  patientName?: string;
  triageCategory?: string;
  status?: string;
  aiAnalysis?: string | null;
  rawText?: string | null;
  reviewNote?: string | null;
  reason?: string;
}): string {
  const parts: string[] = [];

  if (params.patientName) parts.push(`Patient: ${params.patientName}`);
  if (params.triageCategory) parts.push(`Triage Category: ${params.triageCategory}`);
  if (params.status) parts.push(`Status: ${params.status}`);
  if (params.aiAnalysis) parts.push(`AI Analysis: ${params.aiAnalysis}`);
  if (params.rawText) parts.push(`Clinical Text: ${params.rawText}`);
  if (params.reviewNote) parts.push(`Review Notes: ${params.reviewNote}`);
  if (params.reason) parts.push(`Reason: ${params.reason}`);

  return parts.join("\n");
}
