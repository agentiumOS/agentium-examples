/**
 * Agent with Tools — Demonstrates tool calling with colorful logging.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/basics/02-agent-with-tools.ts
 */

import { Agent, defineTool, openai } from "@agentium/core";
import { z } from "zod";

const weatherTool = defineTool({
  name: "getWeather",
  description: "Get the current weather for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async ({ city }) => {
    const conditions = ["sunny", "cloudy", "rainy", "snowy"];
    const temp = Math.floor(Math.random() * 30) + 5;
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    return `${city}: ${temp}°C, ${condition}`;
  },
});

const calculator = defineTool({
  name: "calculator",
  description: "Evaluate a math expression",
  parameters: z.object({
    expression: z.string().describe("Math expression to evaluate"),
  }),
  execute: async ({ expression }) => {
    const result = new Function(`return (${expression})`)();
    return String(result);
  },
});

const agent = new Agent({
  name: "ToolBot",
  model: openai("gpt-4o"),
  tools: [weatherTool, calculator],
  instructions: "You help with weather queries and math. Use tools when needed.",
  logLevel: "debug",
});

const result = await agent.run(
  "What's the weather in Tokyo? Also, what's 42 * 17?"
);
console.log("\nFinal output:", result.text);
