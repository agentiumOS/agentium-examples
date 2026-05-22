/**
 * Procedural Memory — Records successful multi-step workflows.
 *
 * Creates an agent with procedures enabled and custom tools. After the
 * agent completes a multi-step task, shows the recorded procedure and
 * demonstrates how it's suggested for similar future tasks.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/procedures.ts
 */

import { Agent, openai, InMemoryStorage, defineTool } from "@agentium/core";
import { z } from "zod";

const storage = new InMemoryStorage();

const fetchPrice = defineTool({
  name: "fetch_stock_price",
  description: "Fetch the current price of a stock by ticker symbol.",
  parameters: z.object({ ticker: z.string() }),
  execute: async ({ ticker }) => `${ticker}: $${(150 + Math.random() * 50).toFixed(2)}`,
});

const calculateReturn = defineTool({
  name: "calculate_return",
  description: "Calculate return given buy price, current price, and shares.",
  parameters: z.object({ buyPrice: z.number(), currentPrice: z.number(), shares: z.number() }),
  execute: async ({ buyPrice, currentPrice, shares }) => {
    const gain = (currentPrice - buyPrice) * shares;
    return `Return: $${gain.toFixed(2)} (${(((currentPrice - buyPrice) / buyPrice) * 100).toFixed(1)}%)`;
  },
});

const agent = new Agent({
  name: "StockBot",
  model: openai("gpt-4o"),
  instructions: "You help users analyze stock investments. Use the provided tools.",
  tools: [fetchPrice, calculateReturn],
  memory: {
    storage,
    summaries: false,
    procedures: true,
    model: openai("gpt-4o-mini"),
  },
});

console.log("=== 1. Run a multi-step task ===\n");
const r1 = await agent.run(
  "I bought 100 shares of AAPL at $142. What's the current price and my return?",
  { sessionId: "proc-1" },
);
console.log("Assistant:", r1.text);
await new Promise((r) => setTimeout(r, 3000));

console.log("\n=== 2. Inspect stored procedures ===\n");
const procedures = await agent.memory!.getProcedureMemory()!.getProcedures();
for (const proc of procedures) {
  console.log(`Procedure: "${proc.trigger}" (used ${proc.successCount}x)`);
  for (const step of proc.steps) {
    console.log(`  -> ${step.toolName}: ${step.resultSummary.slice(0, 80)}`);
  }
}

console.log("\n=== 3. Suggest procedure for similar task ===\n");
const suggestion = await agent.memory!.getProcedureMemory()!.suggestProcedure(
  "What's my return on MSFT shares?",
);
if (suggestion) {
  console.log(`Suggested: "${suggestion.trigger}"`);
  console.log(`Steps: ${suggestion.steps.map((s) => s.toolName).join(" → ")}`);
} else {
  console.log("No procedure suggested (agent may not have used 2+ tools).");
}

process.exit(0);
