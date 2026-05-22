/**
 * Memory Pointer Pattern - keep huge tool outputs out of the LLM context.
 *
 * When `artifacts.enabled` is on, any tool result over `maxToolOutputBytes`
 * (default 50KB) is automatically stored as an artifact and replaced with a
 * short `{ pointer, preview }` JSON that the LLM sees. Subsequent tools can
 * read the full value via the auto-injected `getArtifact(pointer)` tool.
 *
 * IBM reported a 20,000,000 -> 1,234 token reduction with this pattern.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/30-memory-pointers.ts
 */

import { Agent, defineTool, openai, storeArtifact, listArtifacts } from "@agentium/core";
import { z } from "zod";

const fetchLogs = defineTool({
  name: "fetchLogs",
  description: "Fetch a large server log dump.",
  parameters: z.object({ service: z.string() }),
  execute: async ({ service }) => {
    // Simulate a 100KB log dump.
    return `[${service}] ${"error: something went wrong\n".repeat(3000)}`;
  },
});

const summarize = defineTool({
  name: "summarize",
  description: "Summarize a log dump given either inline text or an artifact pointer.",
  parameters: z.object({ logs: z.string().describe("Log text or 'art:...' pointer") }),
  execute: async ({ logs }) => {
    // Auto-pointer replacement means logs will be JSON like { pointer, preview, sizeBytes }.
    // The agent can call getArtifact(pointer) to fetch the full value first if needed.
    const preview = logs.length > 200 ? logs.slice(0, 200) : logs;
    return `Summary (from ${preview}...)`;
  },
});

const agent = new Agent({
  name: "log-investigator",
  model: openai("gpt-4o"),
  tools: [fetchLogs, summarize],
  artifacts: {
    enabled: true,
    maxToolOutputBytes: 4 * 1024, // small threshold so the example triggers immediately
    previewChars: 100,
  },
  instructions: "Use fetchLogs, then if the result is a pointer, call getArtifact(pointer) before summarizing.",
});

const result = await agent.run("Fetch the auth-service logs and summarize them.");
console.log("Final answer:\n", result.text);

// Inspect what got stored.
const ctx = (result as any).runContext;
if (ctx) {
  console.log("\nArtifacts stored during this run:");
  for (const a of listArtifacts(ctx)) {
    console.log(`  ${a.id}  ${a.sizeBytes}B  ${a.preview.slice(0, 80)}...`);
  }
}

// You can also store artifacts manually from any tool:
//   const ptr = storeArtifact(ctx, bigValue, { name: "report-2024-q4" });
//   return JSON.stringify({ pointer: ptr.pointer, preview: ptr.preview });
void storeArtifact;
