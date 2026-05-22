/**
 * Voice Agent — Google Gemini Live API
 *
 * Streams mic audio to Google's Gemini Live API and plays back the response.
 * Supports tool calling (weather example) automatically handled by VoiceAgent.
 *
 * Prerequisites:
 *   npm install @google/genai mic speaker
 *
 * Usage:
 *   GOOGLE_API_KEY=... npx tsx examples/voice/27-voice-google.ts
 */

import {
  VoiceAgent,
  googleLive,
  defineTool,
} from "@agentium/core";
import { z } from "zod";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

const weatherTool = defineTool({
  name: "getWeather",
  description: "Get the current weather for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async ({ city }) => {
    const conditions = ["sunny", "cloudy", "rainy", "snowy"];
    const temp = Math.floor(Math.random() * 30) + 5;
    const condition =
      conditions[Math.floor(Math.random() * conditions.length)];
    return `${city}: ${temp}°C, ${condition}`;
  },
});

const agent = new VoiceAgent({
  name: "GeminiVoice",
  provider: googleLive("gemini-2.5-flash-native-audio-preview-12-2025"),
  instructions:
    "You are a friendly voice assistant. Keep responses concise. You can check the weather using tools.",
  tools: [weatherTool],
  logLevel: "info",
});

console.log("Connecting to Google Gemini Live API...\n");
const session = await agent.connect();

session.on("transcript", ({ text, role }) => {
  const label = role === "user" ? "You" : "Assistant";
  console.log(`[${label}] ${text}`);
});

session.on("text", ({ text }) => {
  process.stdout.write(text);
});

session.on("tool_call_start", ({ name, args }) => {
  console.log(`[Tool] ${name}(${JSON.stringify(args)})`);
});

session.on("tool_result", ({ name, result }) => {
  console.log(`[Tool Result] ${name} -> ${result}`);
});

session.on("error", ({ error }) => {
  console.error("[Error]", error.message);
});

session.on("disconnected", () => {
  console.log("\nSession disconnected.");
  process.exit(0);
});

// Set up microphone input (16kHz for Google)
let mic: any;
try {
  const Mic = require("mic");
  mic = Mic({
    rate: "16000",
    channels: "1",
    bitwidth: "16",
  });

  const micStream = mic.getAudioStream();
  micStream.on("data", (data: Buffer) => {
    session.sendAudio(data);
  });

  micStream.on("error", (err: Error) => {
    console.error("Mic error:", err.message);
  });

  mic.start();
  console.log("Microphone started. Speak now! (Ctrl+C to exit)\n");
} catch {
  console.log(
    "Mic not available (install `mic` package). Sending text instead.\n"
  );
  session.sendText("Hello! What's the weather in Tokyo?");
}

// Set up speaker output (24kHz from Google)
try {
  const Speaker = require("speaker");
  const speaker = new Speaker({
    channels: 1,
    bitDepth: 16,
    sampleRate: 24000,
  });

  session.on("audio", ({ data }) => {
    speaker.write(data);
  });
} catch {
  console.log("Speaker not available (install `speaker` package). Audio output disabled.\n");
}

process.on("SIGINT", async () => {
  console.log("\nClosing voice session...");
  if (mic) mic.stop();
  await session.close();
  process.exit(0);
});
