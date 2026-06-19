/**
 * TTS (Text-to-Speech) Client Service
 * =====================================
 * Client for OpenAI's Text-to-Speech API.
 * Converts text to natural-sounding audio using OpenAI's tts-1 or tts-1-hd models.
 *
 * Endpoint:
 *   POST https://api.openai.com/v1/audio/speech
 *
 * Environment variables:
 *   OPENAI_API_KEY — OpenAI API key (required, shared with embeddings service)
 */

// ── Configuration ──

const TTS_MODEL = "tts-1";
const TTS_MODEL_HD = "tts-1-hd";

// ── Types ──

export interface TtsSynthesizeRequest {
  /** Text to convert to speech (max 4096 characters) */
  text: string;
  /** Voice to use: alloy, echo, fable, onyx, nova, shimmer */
  voice: TtsVoice;
  /** Model: tts-1 (faster) or tts-1-hd (higher quality) */
  model?: TtsModel;
  /** Audio format: mp3, opus, aac, flac, wav, pcm */
  responseFormat?: TtsAudioFormat;
  /** Speed (0.25 to 4.0, default 1.0) */
  speed?: number;
}

export type TtsVoice = "alloy" | "echo" | "fable" | "onyx" | "nova" | "shimmer";
export type TtsModel = "tts-1" | "tts-1-hd";
export type TtsAudioFormat = "mp3" | "opus" | "aac" | "flac" | "wav" | "pcm";

export interface TtsSynthesizeResponse {
  success: boolean;
  /** Audio data as a base64-encoded string */
  audioBase64: string;
  /** MIME type of the audio (e.g., "audio/mpeg") */
  contentType: string;
  /** Original text that was synthesized */
  text: string;
  /** Voice used */
  voice: string;
  /** Model used */
  model: string;
}

// Voice display names for UI
export const TTS_VOICES: Array<{ id: TtsVoice; label: string; description: string }> = [
  { id: "alloy", label: "Alloy", description: "Versatile, balanced voice" },
  { id: "echo", label: "Echo", description: "Warm, expressive voice" },
  { id: "fable", label: "Fable", description: "Bright, engaging voice" },
  { id: "onyx", label: "Onyx", description: "Deep, authoritative voice" },
  { id: "nova", label: "Nova", description: "Clear, professional voice" },
  { id: "shimmer", label: "Shimmer", description: "Soft, calm voice" },
];

// ── MIME type mapping ──

const MIME_MAP: Record<TtsAudioFormat, string> = {
  mp3: "audio/mpeg",
  opus: "audio/opus",
  aac: "audio/aac",
  flac: "audio/flac",
  wav: "audio/wav",
  pcm: "audio/l16",
};

// ── TTS Synthesis ──

/**
 * POST https://api.openai.com/v1/audio/speech
 *
 * Synthesizes text to speech using OpenAI's TTS API.
 * Returns the audio as a base64-encoded buffer with metadata.
 */
export async function synthesizeSpeech(
  request: TtsSynthesizeRequest,
): Promise<TtsSynthesizeResponse> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENAI_API_KEY is not set. Add it to your .env file:\n" +
        "  OPENAI_API_KEY=\"sk-your-key-here\"\n" +
        "Or export it as an environment variable.",
    );
  }

  const { text, voice, model, responseFormat, speed } = request;
  const ttsModel = model || TTS_MODEL;
  const format = responseFormat || "mp3";

  if (!text || text.trim().length === 0) {
    throw new Error("Text input must be a non-empty string.");
  }

  if (text.length > 4096) {
    throw new Error(`Text exceeds 4096 character limit (${text.length} chars).`);
  }

  console.log(
    `[ttsClient] Synthesizing speech: voice=${voice}, model=${ttsModel}, format=${format}, ${text.length} chars`,
  );

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: ttsModel,
      input: text,
      voice,
      response_format: format,
      speed: speed ?? 1.0,
    }),
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "unknown");
    throw new Error(
      `OpenAI TTS API error (${response.status}): ${errorBody}`,
    );
  }

  // Get audio as ArrayBuffer and convert to base64
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);
  const audioBase64 = buffer.toString("base64");

  console.log(
    `[ttsClient] Speech synthesized: ${buffer.length} bytes, format=${format}`,
  );

  const contentType = MIME_MAP[format] || "audio/mpeg";

  return {
    success: true,
    audioBase64,
    contentType,
    text: text.substring(0, 100) + (text.length > 100 ? "..." : ""),
    voice,
    model: ttsModel,
  };
}
