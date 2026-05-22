/**
 * Observability — Export traces to Langfuse.
 *
 * Just set env vars and pass "langfuse" — credentials are read automatically:
 *   LANGFUSE_PUBLIC_KEY, LANGFUSE_SECRET_KEY, LANGFUSE_BASE_URL (optional)
 *
 * Usage:
 *   npx tsx --env-file=.env examples/telemetry/langfuse.ts
 */

import { Agent, openai } from "@agentium/core";
import { instrument } from "@agentium/observability";

const agent = new Agent({
  name: "assistant",
  model: openai("gpt-4o-mini"),
  instructions: "You are a helpful assistant.",
});

const obs = instrument(agent, {
  exporters: ["langfuse", "console"],
});

console.log("Tracing to Langfuse...\n");

await agent.run("What are the benefits of TypeScript over JavaScript?");

await obs.tracer.flush();
obs.detach();

process.exit(0);
