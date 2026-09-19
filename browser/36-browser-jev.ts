/**
 * Browser Agent — Jev planner.
 *
 * Each step is a TypeSafe `choice` over this frame's controls
 * (`click_12`, `type_3`, `back`, `done`, …). Playwright executes the click.
 * Do not set `model: jev()` — Jev cannot see screenshots.
 *
 * Prerequisites:
 *   npm install playwright @typesafe-ai/sdk
 *   npx playwright install chromium
 *
 * Usage:
 *   TYPESAFE_API_KEY=... OPENAI_API_KEY=... npx tsx examples/browser/36-browser-jev.ts
 */

import { BrowserAgent } from "@agentium/browser";
import { openai } from "@agentium/core";

const browser = new BrowserAgent({
  name: "jev-browser",
  model: openai("gpt-4o-mini"),
  planner: "jev",
  jevModel: "jev-latest",
  searchEngine: "bing",
  headless: false,
  stealth: true,
  useVision: false,
  maxSteps: 12,
  logLevel: "info",
});

browser.eventBus.on("browser.action", ({ action }: { action: unknown }) => {
  console.log(`  → ${JSON.stringify(action)}`);
});

console.log("Starting BrowserAgent with planner: jev\n");

const result = await browser.run(
  'Search Bing for "TypeScript agent framework" and return the first 3 titles',
);

console.log("\n" + "=".repeat(60));
console.log("Success:", result.success);
console.log("Steps:", result.steps.length);
console.log("Duration:", `${(result.durationMs / 1000).toFixed(1)}s`);
console.log("Final URL:", result.finalUrl);
console.log("\nResult:");
console.log(result.result);
