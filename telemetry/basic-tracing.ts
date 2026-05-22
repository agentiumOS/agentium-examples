/**
 * Observability — Trace agent runs with the ConsoleExporter.
 *
 * Attaches tracing, metrics, and structured logging to an agent
 * without modifying the agent itself. Everything is opt-in.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/telemetry/basic-tracing.ts
 */

import { Agent, openai, defineTool } from "@agentium/core";
import { instrument } from "@agentium/observability";
import { z } from "zod";

const agent = new Agent({
  name: "assistant",
  model: openai("gpt-4o-mini"),
  instructions: "You are a helpful assistant. Use tools when needed.",
  tools: [
    defineTool({
      name: "get_weather",
      description: "Get current weather for a city",
      parameters: z.object({ city: z.string() }),
      execute: async ({ city }) => `${city}: 72°F, sunny`,
    }),
  ],
  logLevel: "info",
});

// One-liner: attach full observability
const obs = instrument(agent, {
  exporters: ["console"],
  metrics: true,
  structuredLogs: "console",
});

console.log("=== Observability Demo ===\n");

await agent.run("What's the weather in Tokyo?");

// Print metrics summary
console.log("\n--- Metrics ---");
const m = obs.metrics!.getMetrics();
console.log(`Runs: ${m.counters.runs_total} (${m.counters.runs_success} ok, ${m.counters.runs_error} err)`);
console.log(`Tool calls: ${m.counters.tool_calls_total}`);
console.log(`Total tokens: ${m.gauges.total_tokens}`);

if (m.histograms.run_duration_ms.length > 0) {
  console.log(`Run latency: ${m.histograms.run_duration_ms[0]}ms`);
}

// Clean up
obs.detach();

process.exit(0);
