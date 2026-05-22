/**
 * Audio Analysis with Gemini — Send an audio file to Gemini for transcription & analysis.
 *
 * This example downloads a short public-domain audio clip, sends it as a
 * multi-modal input to Gemini, and gets a structured analysis back.
 *
 * Prerequisites:
 *   - npm install @google/genai
 *
 * Usage:
 *   GOOGLE_API_KEY=... npx tsx examples/basics/14-audio-analysis-gemini.ts
 */

import { Agent, google, type ContentPart } from "@agentium/core";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

// ── 1. Structured output schema ──────────────────────────────────────────

const AudioAnalysis = z.object({
  transcription: z.string().describe("Full transcription of the spoken content"),
  language: z.string().describe("Detected language"),
  speakerCount: z.number().describe("Estimated number of speakers"),
  summary: z.string().describe("Brief summary of the audio content"),
  mood: z.string().describe("Overall tone or mood"),
  topics: z.array(z.string()).describe("Key topics discussed"),
});

// ── 2. Create the Gemini agent ───────────────────────────────────────────

const agent = new Agent({
  name: "AudioAnalyzer",
  model: google("gemini-2.5-flash"),
  instructions: `You are an expert audio analyzer. When given audio content, provide a detailed analysis including transcription, language detection, speaker count, summary, mood, and key topics.
Always respond with valid JSON matching the requested schema.`,
  structuredOutput: AudioAnalysis,
  logLevel: "info",
});

// ── 3. Prepare the audio input ───────────────────────────────────────────

const __dirname = dirname(fileURLToPath(import.meta.url));
const sampleAudioPath = resolve(__dirname, "audio/sample.mp3");

console.log(`Reading audio from ${sampleAudioPath}...`);
const audioData = readFileSync(sampleAudioPath);
const base64Audio = audioData.toString("base64");
console.log(`Audio loaded: ${(audioData.length / 1024).toFixed(1)} KB\n`);

const result = await agent.run([
  { type: "text", text: "Analyze this audio clip in detail. Provide transcription, language, speaker count, summary, mood, and key topics." },
  { type: "audio", data: base64Audio, mimeType: "audio/mp3" },
] as ContentPart[]);

console.log("\nStructured analysis:");
console.log(JSON.stringify(result.structured, null, 2));
console.log(`\nTokens: ${result.usage.totalTokens} | Duration: ${result.durationMs}ms`);
