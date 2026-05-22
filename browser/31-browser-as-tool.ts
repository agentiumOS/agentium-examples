/**
 * Browser as a Tool — A text agent delegates browser tasks to a BrowserAgent.
 *
 * Demonstrates: useDOM hybrid mode, cookie persistence (saveStorageState),
 * and the asTool() pattern for composing browser + text agents.
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/browser/31-browser-as-tool.ts
 */

import { Agent, openai } from "@agentium/core";
import { BrowserAgent } from "@agentium/browser";

const browser = new BrowserAgent({
  name: "browser",
  model: openai("gpt-4o"),
  headless: true,
  maxSteps: 15,
  useDOM: true,
  maxRepeats: 3,
  logLevel: "info",
});

const agent = new Agent({
  name: "research-assistant",
  model: openai("gpt-4o"),
  instructions: [
    "You are a research assistant with access to a web browser.",
    "When the user asks about current events, live data, or anything you need to look up,",
    "use the browse_web tool to navigate the web and find the information.",
    "Always summarize findings clearly and cite the source URLs when possible.",
  ].join(" "),
  tools: [browser.asTool()],
  logLevel: "info",
});

console.log("Research assistant with browser tool (hybrid DOM mode) ready.\n");

const result = await agent.run(
  "Go to Hacker News (https://news.ycombinator.com) and tell me the top 5 stories on the front page right now."
);

console.log("\n" + "=".repeat(60));
console.log("Result:");
console.log(result.text);
