/**
 * Voice Agent test — writes response audio to a WAV file and plays it via afplay.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/voice/26-voice-openai-test.ts
 */

import { VoiceAgent, openaiRealtime, defineTool } from "@agentium/core";
import { z } from "zod";
import { writeFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { join } from "node:path";

const weatherTool = defineTool({
  name: "getWeather",
  description: "Get the current weather for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async ({ city }) => {
    const conditions = ["sunny", "cloudy", "rainy", "snowy"];
    const temp = Math.floor(Math.random() * 30) + 5;
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    return `${city}: ${temp}°C, ${condition}`;
  },
});

const agent = new VoiceAgent({
  name: "VoiceAssistant",
  provider: openaiRealtime("gpt-4o-realtime-preview"),
  instructions:
    "You are a friendly voice assistant. Keep responses very concise (1-2 sentences max).",
  tools: [weatherTool],
  voice: "alloy",
  logLevel: "info",
});

function writeWav(pcmData: Buffer, sampleRate: number, filePath: string): void {
  const numChannels = 1;
  const bitsPerSample = 16;
  const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
  const blockAlign = numChannels * (bitsPerSample / 8);
  const dataSize = pcmData.length;
  const headerSize = 44;

  const header = Buffer.alloc(headerSize);
  header.write("RIFF", 0);
  header.writeUInt32LE(dataSize + headerSize - 8, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(dataSize, 40);

  writeFileSync(filePath, Buffer.concat([header, pcmData]));
}

console.log("Connecting to OpenAI Realtime API...\n");
const session = await agent.connect({
  apiKey: process.env.OPENAI_API_KEY,
});

const audioChunks: Buffer[] = [];
let responseComplete = false;

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

session.on("audio", ({ data }) => {
  audioChunks.push(data);
});

session.on("error", ({ error }) => {
  console.error("[Error]", error.message);
});

console.log('Sending: "Hello! What\'s the weather in Paris?"\n');
session.sendText("Hello! What's the weather in Paris?");

// Wait for the response to finish (audio stops arriving)
let silenceTimer: ReturnType<typeof setTimeout>;
const resetSilence = () => {
  clearTimeout(silenceTimer);
  silenceTimer = setTimeout(async () => {
    if (audioChunks.length > 0 && !responseComplete) {
      responseComplete = true;
      const pcm = Buffer.concat(audioChunks);
      const wavPath = join(process.cwd(), "voice-response.wav");
      writeWav(pcm, 24000, wavPath);
      console.log(`\nAudio saved to ${wavPath} (${(pcm.length / 1024).toFixed(1)} KB)`);
      console.log("Playing audio...\n");

      try {
        execSync(`afplay "${wavPath}"`, { stdio: "inherit" });
      } catch {
        console.log("Could not play audio with afplay.");
      }

      await session.close();
      process.exit(0);
    }
  }, 3000);
};

session.on("audio", resetSilence);
resetSilence();

setTimeout(async () => {
  if (!responseComplete) {
    console.log("\nTimeout reached. Closing session.");
    await session.close();
    process.exit(0);
  }
}, 30000);
