/**
 * Reasoning / Extended Thinking — Enable model thinking for complex problems.
 *
 * Usage:
 *   GOOGLE_API_KEY=... npx tsx examples/basics/22-reasoning.ts
 */

import { Agent, google } from "@agentium/core";

const agent = new Agent({
  name: "Thinker",
  model: google("gemini-2.5-flash"),
  instructions: "You are a math and logic expert. Solve problems step by step.",
  reasoning: { enabled: true, budgetTokens: 8000 },
  logLevel: "info",
});

console.log("=== Reasoning Example (Gemini 2.5 Flash) ===\n");

const result = await agent.run(
  "A farmer has 17 sheep. All but 9 die. How many sheep are left alive? Think carefully."
);

console.log("\nAnswer:", result.text);
if (result.thinking) {
  console.log("\nThinking:", result.thinking.slice(0, 300) + "…");
}
console.log("\nUsage:", JSON.stringify(result.usage, null, 2));
