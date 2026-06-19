/**
 * TTS (Text-to-Speech) Processing Routes
 * =======================================
 * Express routes that accept text and return synthesized speech audio
 * using OpenAI's TTS API.
 *
 * All routes are protected by the auth middleware.
 */

import { Router } from "express";
import { authMiddleware } from "../middleware/auth";
import { synthesizeSpeech } from "../services/ttsClient";

const router = Router();

// All TTS routes require authentication
router.use(authMiddleware);

/**
 * POST /api/tts/synthesize
 *
 * Synthesizes text to speech using OpenAI TTS.
 * Body: { text: string, voice?: string, model?: string, responseFormat?: string, speed?: number }
 *
 * Returns base64-encoded audio data with content type metadata.
 */
router.post("/synthesize", async (req, res, next) => {
  try {
    const { text, voice, model, responseFormat, speed } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'text' must be a non-empty string (max 4096 characters).",
      });
      return;
    }

    if (text.length > 4096) {
      res.status(400).json({
        success: false,
        error: "TEXT_TOO_LONG",
        message: `Text exceeds maximum length of 4096 characters (${text.length} chars).`,
      });
      return;
    }

    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const selectedVoice = voice || "alloy";
    if (!validVoices.includes(selectedVoice)) {
      res.status(400).json({
        success: false,
        error: "INVALID_VOICE",
        message: `Invalid voice '${selectedVoice}'. Valid: ${validVoices.join(", ")}`,
      });
      return;
    }

    console.log(
      `[ttsRoutes] Synthesizing: voice=${selectedVoice}, ${text.length} chars`,
    );

    const result = await synthesizeSpeech({
      text: text.trim(),
      voice: selectedVoice as any,
      model: model || "tts-1",
      responseFormat: responseFormat || "mp3",
      speed: speed || 1.0,
    });

    res.json(result);
  } catch (error) {
    console.error("[ttsRoutes] TTS synthesis failed:", error);
    next(error);
  }
});

/**
 * POST /api/tts/synthesize-stream
 *
 * Synthesizes text to speech and returns the raw audio stream directly.
 * This is useful for playing audio directly in the browser without base64 decoding.
 * Reuses the ttsClient service for API interaction, then returns raw binary.
 *
 * Body: { text: string, voice?: string, model?: string, responseFormat?: string, speed?: number }
 *
 * Returns audio binary with the appropriate Content-Type header.
 */
router.post("/synthesize-stream", async (req, res, next) => {
  try {
    const { text, voice, model, responseFormat, speed } = req.body;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: "INVALID_ARGUMENT",
        message: "'text' must be a non-empty string (max 4096 characters).",
      });
      return;
    }

    if (text.length > 4096) {
      res.status(400).json({
        success: false,
        error: "TEXT_TOO_LONG",
        message: `Text exceeds maximum length of 4096 characters (${text.length} chars).`,
      });
      return;
    }

    const validVoices = ["alloy", "echo", "fable", "onyx", "nova", "shimmer"];
    const selectedVoice = voice || "alloy";
    if (!validVoices.includes(selectedVoice)) {
      res.status(400).json({
        success: false,
        error: "INVALID_VOICE",
        message: `Invalid voice '${selectedVoice}'. Valid: ${validVoices.join(", ")}`,
      });
      return;
    }

    console.log(
      `[ttsRoutes] Synthesizing (stream): voice=${selectedVoice}, ${text.length} chars`,
    );

    // Use the ttsClient service to call OpenAI, then return raw binary
    const result = await synthesizeSpeech({
      text: text.trim(),
      voice: selectedVoice as any,
      model: (model || "tts-1") as any,
      responseFormat: (responseFormat || "mp3") as any,
      speed: speed || 1.0,
    });

    // Decode the base64 result and send as raw binary
    const audioBuffer = Buffer.from(result.audioBase64, "base64");
    const format = responseFormat || "mp3";
    const mimeMap: Record<string, string> = {
      mp3: "audio/mpeg",
      opus: "audio/opus",
      aac: "audio/aac",
      flac: "audio/flac",
      wav: "audio/wav",
      pcm: "audio/l16",
    };

    res.setHeader("Content-Type", mimeMap[format] || "audio/mpeg");
    res.setHeader("Content-Length", audioBuffer.length);
    res.setHeader("X-TTS-Voice", selectedVoice);
    res.setHeader("X-TTS-Model", model || "tts-1");
    res.send(audioBuffer);
  } catch (error) {
    console.error("[ttsRoutes] TTS stream failed:", error);
    next(error);
  }
});

export default router;
