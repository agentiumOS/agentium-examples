/**
 * Vision Agent — Gemini 3.1 Flash Live (audio + video)
 *
 * Connects to Gemini 3.1 Flash Live and sends image frames alongside audio.
 * The model can see and hear, responding with spoken audio.
 *
 * Prerequisites:
 *   npm install @google/genai
 *
 * Usage:
 *   GOOGLE_API_KEY=... npx tsx examples/voice/vision-agent.ts
 *
 * To send a camera frame from a browser, use the Socket.IO vision gateway
 * with `vision.image` events (see docs/voice/vision-agents.mdx).
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { VisionAgent, geminiVisionLive, defineTool } from "@agentium/core";
import { z } from "zod";

// Load .env
try {
  const envPath = resolve(import.meta.dirname ?? ".", "../../.env");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^(\w+)\s*=\s*"?(.+?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

const describeTool = defineTool({
  name: "analyzeScene",
  description: "Analyze the current visual scene and provide structured observations",
  parameters: z.object({
    focus: z.string().describe("What aspect to focus on (objects, text, people, colors)"),
  }),
  execute: async ({ focus }) => {
    return `Scene analysis requested with focus: ${focus}. The model should describe what it sees in the most recent image frame.`;
  },
});

const agent = new VisionAgent({
  name: "VisionAssistant",
  provider: geminiVisionLive("gemini-3.1-flash-live-preview"),
  instructions: [
    "You are a vision-capable assistant that can see images and hear audio.",
    "When you receive an image, describe what you see clearly and concisely.",
    "Respond with spoken audio. Keep responses brief and natural.",
  ].join(" "),
  tools: [describeTool],
  fps: 1,
  thinkingLevel: "minimal",
  logLevel: "info",
});

console.log("Connecting to Gemini 3.1 Flash Live (vision + audio)...\n");

try {
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

  // Send a sample image if available, otherwise use text
  const sampleImagePath = resolve(import.meta.dirname ?? ".", "sample-frame.jpg");
  try {
    const imageData = readFileSync(sampleImagePath);
    console.log(`Sending image: ${sampleImagePath} (${(imageData.length / 1024).toFixed(0)} KB)\n`);
    session.sendImage(imageData, "image/jpeg");

    // Give the model time to process, then ask about it
    setTimeout(() => {
      session.sendText("What do you see in this image? Describe it briefly.");
    }, 2000);
  } catch {
    console.log("No sample-frame.jpg found. Sending text-only prompt.\n");
    session.sendText("Hello! I'm testing the vision agent. Can you confirm you're connected and ready to receive images?");
  }

  // Set up microphone if available
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const Mic = require("mic");
    const mic = Mic({ rate: "16000", channels: "1", bitwidth: "16" });
    const micStream = mic.getAudioStream();
    micStream.on("data", (data: Buffer) => session.sendAudio(data));
    mic.start();
    console.log("Microphone started. Speak or send images! (Ctrl+C to exit)\n");
  } catch {
    console.log("Mic not available (install `mic` package). Text + image mode only.\n");
  }

  // Set up speaker if available
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    const Speaker = require("speaker");
    const speaker = new Speaker({ channels: 1, bitDepth: 16, sampleRate: 24000 });
    session.on("audio", ({ data }) => speaker.write(data));
  } catch {
    console.log("Speaker not available (install `speaker` package). Audio output disabled.\n");
  }

  process.on("SIGINT", async () => {
    console.log("\nClosing vision session...");
    await session.close();
    process.exit(0);
  });
} catch (err: any) {
  console.error("Failed to connect:", err.message);
  process.exit(1);
}
