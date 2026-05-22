/**
 * Browser Agent — Vision + DOM hybrid with stealth & human-like behavior.
 *
 * Demonstrates: useDOM, video recording, stealth mode (anti-detection),
 * and humanize (jittered clicks, variable typing, mouse curves).
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/browser/30-browser-agent.ts
 */

import { BrowserAgent } from "@agentium/browser";
import { openai } from "@agentium/core";

const browser = new BrowserAgent({
  name: "web-navigator",
  model: openai("gpt-4o"),
  headless: true,
  maxSteps: 10,
  startUrl: "https://news.ycombinator.com",
  useDOM: true,
  recordVideo: true,
  maxRepeats: 3,
  stealth: true,
  humanize: true,
  logLevel: "info",
});

browser.eventBus.on("browser.action", ({ action }: any) => {
  console.log(`  → Action: ${JSON.stringify(action)}`);
});

console.log("Starting browser agent (hybrid vision+DOM, video recording ON)...\n");

const result = await browser.run(
  "Tell me the top 5 story titles currently on the front page of Hacker News."
);

console.log("\n" + "=".repeat(60));
console.log("Success:", result.success);
console.log("Steps:", result.steps.length);
console.log("Duration:", `${(result.durationMs / 1000).toFixed(1)}s`);
console.log("Final URL:", result.finalUrl);
if (result.videoPath) {
  console.log("Video:", result.videoPath);
}
console.log("\nResult:");
console.log(result.result);
