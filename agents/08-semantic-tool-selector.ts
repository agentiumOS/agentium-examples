/**
 * SemanticToolSelector - top-K tool selection for agents with many tools.
 *
 * When you have 50+ tools (e.g. many MCP servers), passing every definition
 * to the model on every turn is expensive and confuses the LLM. The selector
 * embeds each tool's name + description on init, then picks the top-K most
 * relevant tools per user input.
 *
 * Optional rerank for even tighter selection.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/agents/08-semantic-tool-selector.ts
 */

import { Agent, defineTool, OpenAIEmbedding, openai, SemanticToolSelector } from "@agentium/core";
import { z } from "zod";

const everyTool = [
  defineTool({ name: "get_weather", description: "Fetch current weather for a city", parameters: z.object({ city: z.string() }), execute: async () => "ok" }),
  defineTool({ name: "send_email", description: "Send a transactional email", parameters: z.object({ to: z.string(), subject: z.string() }), execute: async () => "ok" }),
  defineTool({ name: "list_files", description: "List files in a directory on the user's machine", parameters: z.object({ path: z.string() }), execute: async () => "ok" }),
  defineTool({ name: "create_calendar_event", description: "Add an event to Google Calendar", parameters: z.object({ title: z.string() }), execute: async () => "ok" }),
  defineTool({ name: "fetch_stock_price", description: "Get the current stock price for a ticker", parameters: z.object({ ticker: z.string() }), execute: async () => "ok" }),
  defineTool({ name: "translate", description: "Translate text from one language to another", parameters: z.object({ text: z.string() }), execute: async () => "ok" }),
  // ... pretend there are 100 more
];

const selector = new SemanticToolSelector({
  embedder: new OpenAIEmbedding({ model: "text-embedding-3-small" }),
  topK: 3,
});

await selector.indexTools(everyTool);
console.log(`Indexed ${selector.size} tools`);

const userInput = "What's the temperature in Tokyo right now?";
const shortlist = await selector.select(userInput, { topK: 3 });
console.log(`\nShortlist for "${userInput}":`);
for (const t of shortlist) console.log(`  - ${t.name}`);

const agent = new Agent({
  name: "scoped",
  model: openai("gpt-4o"),
  tools: shortlist, // shrunk from 100 -> 3
});

const result = await agent.run(userInput);
console.log("\nAgent answer:", result.text);
