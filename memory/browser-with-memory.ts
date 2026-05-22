/**
 * Browser Agent with Unified Memory — persistent context across browser tasks.
 *
 * The BrowserAgent uses the same unified memory config as Agent and VoiceAgent.
 * Session history from browser actions is persisted, and facts/entities
 * are auto-extracted after each run.
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/browser-with-memory.ts
 */

import { BrowserAgent } from "@agentium/browser";
import { openai, InMemoryStorage } from "@agentium/core";

const storage = new InMemoryStorage();

const browser = new BrowserAgent({
  name: "research-bot",
  model: openai("gpt-4o"),
  headless: true,
  maxSteps: 10,
  startUrl: "https://news.ycombinator.com",
  useDOM: true,
  memory: {
    storage,
    summaries: true,
    entities: true,
    model: openai("gpt-4o-mini"),
  },
  logLevel: "info",
});

console.log("=== Browser Agent with Memory ===\n");

const r1 = await browser.run(
  "Find the top 3 stories on Hacker News and summarize them.",
  { sessionId: "research-1", userId: "researcher" },
);

console.log("Result:", r1.result);
console.log("Steps:", r1.steps.length);
console.log("Duration:", `${(r1.durationMs / 1000).toFixed(1)}s`);

// Wait for background extraction
await new Promise((r) => setTimeout(r, 2000));

console.log("\n=== Second task (same session context) ===\n");

const r2 = await browser.run(
  "Based on the stories we found earlier, which one has the most comments?",
  { sessionId: "research-1", userId: "researcher" },
);

console.log("Result:", r2.result);
