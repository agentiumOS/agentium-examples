/**
 * Voice Agent — OpenAI Realtime API
 *
 * Streams mic audio to OpenAI's Realtime API and plays back the response.
 * Supports tool calling (weather example) automatically handled by VoiceAgent.
 *
 * Prerequisites:
 *   npm install ws mic speaker
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/voice/26-voice-openai.ts
 */

import {
  VoiceAgent,
  openaiRealtime,
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
  name: "VoiceAssistant",
  provider: openaiRealtime("gpt-4o-realtime-preview"),
  instructions:
    "You are a friendly voice assistant. Keep responses concise. You can check the weather using tools.",
  tools: [weatherTool],
  voice: "alloy",
  logLevel: "info",
});

console.log("Connecting to OpenAI Realtime API...\n");
const session = await agent.connect();

session.on("transcript", ({ text, role }) => {
  const label = role === "user" ? "You" : "Assistant";
  console.log(`[${label}] ${text}`);
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

// Set up microphone input
let mic: any;
try {
  const Mic = require("mic");
  mic = Mic({
    rate: "24000",
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
  session.sendText("Hello! What's the weather in Paris?");
}

// Set up speaker output
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
