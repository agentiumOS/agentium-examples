/**
 * Cost Tracking — Full token and cost breakdown across agent runs.
 *
 * Demonstrates per-category cost breakdown (input, output, reasoning, cached, audio),
 * budget enforcement, and summary reporting by agent/model/user.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/cost/cost-tracking.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { Agent, openai, CostTracker } from "@agentium/core";
import type { CostBreakdown } from "@agentium/core";

// Load .env
try {
  const envPath = resolve(import.meta.dirname ?? ".", "../../.env");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^(\w+)\s*=\s*"?(.+?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env file */ }

function fmtCost(n: number): string {
  return `$${n.toFixed(6)}`;
}

function printBreakdown(b: CostBreakdown, indent = "  "): void {
  console.log(`${indent}Input:     ${fmtCost(b.input)}`);
  console.log(`${indent}Output:    ${fmtCost(b.output)}`);
  if (b.reasoning > 0) console.log(`${indent}Reasoning: ${fmtCost(b.reasoning)}`);
  if (b.cached > 0) console.log(`${indent}Cached:    ${fmtCost(b.cached)}`);
  if (b.audioInput > 0) console.log(`${indent}Audio In:  ${fmtCost(b.audioInput)}`);
  if (b.audioOutput > 0) console.log(`${indent}Audio Out: ${fmtCost(b.audioOutput)}`);
  console.log(`${indent}Total:     ${fmtCost(b.total)}`);
}

const tracker = new CostTracker({
  budget: {
    maxCostPerSession: 1.0,
    maxCostPerUser: 5.0,
    onBudgetExceeded: "throw",
  },
});

const agent = new Agent({
  name: "assistant",
  model: openai("gpt-4o-mini"),
  instructions: "You are a helpful assistant. Keep responses concise.",
  costTracker: tracker,
});

console.log("╔══════════════════════════════════════╗");
console.log("║      Cost Tracking Breakdown Demo    ║");
console.log("╚══════════════════════════════════════╝\n");

// --- Run 1 ---
const r1 = await agent.run("What is the capital of France? Give me 3 fun facts about it.", {
  sessionId: "s1",
  userId: "user-42",
});
console.log("Run 1:", r1.text?.slice(0, 120), "...\n");

const e1 = tracker.getEntries().at(-1)!;
console.log("Run 1 — Token Usage:");
console.log(`  Prompt:     ${e1.usage.promptTokens}`);
console.log(`  Completion: ${e1.usage.completionTokens}`);
console.log(`  Total:      ${e1.usage.totalTokens}`);
if (e1.usage.reasoningTokens) console.log(`  Reasoning:  ${e1.usage.reasoningTokens}`);
if (e1.usage.cachedTokens) console.log(`  Cached:     ${e1.usage.cachedTokens}`);

console.log("\nRun 1 — Cost Breakdown:");
printBreakdown(e1.breakdown);

// --- Run 2 ---
const r2 = await agent.run("Now tell me about Berlin — same format.", {
  sessionId: "s1",
  userId: "user-42",
});
console.log("\nRun 2:", r2.text?.slice(0, 120), "...\n");

// --- Run 3 (different agent) ---
const agent2 = new Agent({
  name: "translator",
  model: openai("gpt-4o-mini"),
  instructions: "Translate input to French. Return only the translation.",
  costTracker: tracker,
});

const r3 = await agent2.run("The weather is beautiful today.", {
  sessionId: "s1",
  userId: "user-42",
});
console.log("Run 3 (translator):", r3.text, "\n");

// --- Full Summary ---
const summary = tracker.getSummary();

console.log("═══════════════════════════════════════");
console.log("          FULL COST SUMMARY");
console.log("═══════════════════════════════════════\n");

console.log(`Runs:         ${summary.entries}`);
console.log(`Total Cost:   ${fmtCost(summary.totalCost)}`);
console.log(`Total Tokens: ${summary.totalTokens.totalTokens}`);
console.log(`  Prompt:     ${summary.totalTokens.promptTokens}`);
console.log(`  Completion: ${summary.totalTokens.completionTokens}`);
if (summary.totalTokens.reasoningTokens) console.log(`  Reasoning:  ${summary.totalTokens.reasoningTokens}`);
if (summary.totalTokens.cachedTokens) console.log(`  Cached:     ${summary.totalTokens.cachedTokens}`);

console.log("\n--- Cost Breakdown (all runs) ---");
printBreakdown(summary.totalBreakdown);

console.log("\n--- By Agent ---");
for (const [name, data] of Object.entries(summary.byAgent)) {
  console.log(`\n  ${name} (${data.runs} runs):`);
  console.log(`    Tokens: ${data.tokens.totalTokens} (prompt: ${data.tokens.promptTokens}, completion: ${data.tokens.completionTokens})`);
  printBreakdown(data.breakdown, "    ");
}

console.log("\n--- By Model ---");
for (const [model, data] of Object.entries(summary.byModel)) {
  console.log(`\n  ${model}:`);
  console.log(`    Tokens: ${data.tokens.totalTokens}`);
  printBreakdown(data.breakdown, "    ");
}

console.log("\n--- By User ---");
for (const [user, data] of Object.entries(summary.byUser)) {
  console.log(`\n  ${user}:`);
  console.log(`    Tokens: ${data.tokens.totalTokens}`);
  printBreakdown(data.breakdown, "    ");
}

// --- Budget remaining ---
const remaining = tracker.estimateRemaining(e1.runId);
console.log("\n--- Budget Status ---");
console.log(`  Session budget: $1.00 | Spent: ${fmtCost(summary.totalCost)} | Remaining: ${fmtCost(1.0 - summary.totalCost)}`);

process.exit(0);
