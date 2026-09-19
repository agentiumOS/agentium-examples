/**
 * Voice + Jev-planned BrowserAgent.
 *
 *   OPENAI_API_KEY=... TYPESAFE_API_KEY=... npx tsx examples/voice/30-voice-jev.ts
 */

import { BrowserAgent } from "@agentium/browser";
import { VoiceAgent, openai, openaiRealtime } from "@agentium/core";

const browser = new BrowserAgent({
  name: "hands",
  model: openai("gpt-4o-mini"),
  planner: "jev",
  searchEngine: "bing",
  headless: false,
  maxSteps: 12,
});

const voice = new VoiceAgent({
  name: "assistant",
  provider: openaiRealtime("gpt-realtime-2.1"),
  voice: "marin",
  toolCallBehavior: "speakBeforeAndAfter",
  instructions:
    "You talk to the user. When they want something on the web, call browse_web. Then read the result in one short sentence.",
  tools: [browser.asTool()],
  logLevel: "info",
});

const session = await voice.connect();
session.on("transcript", ({ role, text }) => process.stdout.write(`[${role}] ${text}`));
session.sendText("Search Bing for TypeScript agent framework and tell me the top 3 titles");
