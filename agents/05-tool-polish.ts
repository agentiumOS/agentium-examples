/**
 * Tool polish v2.0: strict mode, inputExamples, and toModelOutput.
 *
 * - `strict: true`   adds `additionalProperties: false` to the JSON schema and
 *                    enables OpenAI structured outputs for tool calls.
 * - `inputExamples`  injects N-shot examples into the tool's description so
 *                    the LLM sees what valid arguments look like.
 * - `toModelOutput`  transforms the tool result *after* execution but before
 *                    it's appended to the LLM context (e.g. summarize / redact).
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/agents/05-tool-polish.ts
 */

import { Agent, defineTool, openai } from "@agentium/core";
import { z } from "zod";

const lookupOrder = defineTool({
  name: "lookupOrder",
  description: "Look up an order by ID. Returns full row.",
  parameters: z.object({
    orderId: z.string().describe("Order identifier (UUID or short code)"),
  }),
  strict: true,
  inputExamples: [
    { orderId: "ord_abc123" },
    { orderId: "ord_9f3-2025" },
  ],
  execute: async ({ orderId }) => {
    // Pretend we hit a database and got a 200KB row.
    return JSON.stringify({
      orderId,
      items: Array.from({ length: 500 }).map((_, i) => ({ sku: `SKU-${i}`, qty: i })),
      customerNotes: "lorem ipsum ".repeat(200),
    });
  },
  // Reshape the result before the LLM sees it - keep totals + first 3 items.
  toModelOutput: async (raw) => {
    const text = typeof raw === "string" ? raw : raw.content;
    try {
      const j = JSON.parse(text);
      const compact = {
        orderId: j.orderId,
        itemCount: j.items.length,
        firstFew: j.items.slice(0, 3),
      };
      return JSON.stringify(compact);
    } catch {
      return text.slice(0, 500);
    }
  },
});

const agent = new Agent({
  name: "polish-demo",
  model: openai("gpt-4o"),
  tools: [lookupOrder],
});

const out = await agent.run("How many items are in order ord_abc123?");
console.log(out.text);
