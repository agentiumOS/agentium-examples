/**
 * Browser Agent — v2.1.0 advanced features.
 *
 * Demonstrates the action vocabulary parity with browser-use:
 *   - indexed clicks / typing (preferred over coordinates)
 *   - batched actions per step (maxActionsPerStep)
 *   - cheap secondary model for `extract` (pageExtractionLLM)
 *   - vision-optional ("auto" — sends a screenshot only on step 1 and when
 *     the model explicitly requests one)
 *   - initialActions (skip boilerplate without LLM cost)
 *   - allowedDomains (navigation policy)
 *   - directlyOpenUrl (auto-navigate to a URL found in the task string)
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/browser/35-browser-advanced.ts
 */

import { BrowserAgent } from "@agentium/browser";
import { openai } from "@agentium/core";

const browser = new BrowserAgent({
  name: "advanced-scraper",
  // Strong vision/reasoning model for navigation decisions...
  model: openai("gpt-4o"),
  // ...paired with a cheap text-only model for page extraction.
  pageExtractionLLM: openai("gpt-4o-mini"),

  // v2.1.0 loop controls
  maxSteps: 12,
  maxActionsPerStep: 3, // batch up to 3 actions per LLM round-trip
  maxFailures: 3,
  useVision: "auto",    // screenshot only when needed — saves vision tokens
  useDOM: true,
  directlyOpenUrl: true,

  // Run before the LLM loop starts — no LLM cost.
  initialActions: [
    // No initial actions here; HN starts ready to use.
  ],

  // Security: lock navigation to news.ycombinator.com
  allowedDomains: ["news.ycombinator.com", "*.ycombinator.com"],

  // Production hygiene
  stealth: true,
  humanize: true,
  logLevel: "info",
});

browser.eventBus.on("browser.action", ({ action }: any) => {
  console.log(`  → ${JSON.stringify(action)}`);
});

console.log("Running advanced browser agent (vision auto, extract via mini)...\n");

const result = await browser.run(
  "Go to https://news.ycombinator.com and use the extract action to return " +
    "the top 5 story titles, point counts, and submitter usernames as a markdown table.",
);

console.log(`\n${"=".repeat(60)}`);
console.log("Success:", result.success);
console.log("Steps:", result.steps.length);
console.log("Duration:", `${(result.durationMs / 1000).toFixed(1)}s`);
console.log("Final URL:", result.finalUrl);
console.log("\nExtract results (chronological):");
for (const [i, e] of (result.extractedContent ?? []).entries()) {
  console.log(`\n— extract #${i + 1} —`);
  console.log(e);
}
console.log("\nFinal result:");
console.log(result.result);
