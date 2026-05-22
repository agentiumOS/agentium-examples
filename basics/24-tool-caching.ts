/**
 * Tool Caching — Cache tool results to avoid redundant calls.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/basics/24-tool-caching.ts
 */

import { Agent, openai, defineTool } from "@agentium/core";
import { z } from "zod";

let callCount = 0;

const weatherTool = defineTool({
  name: "getWeather",
  description: "Get current weather for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async ({ city }) => {
    callCount++;
    console.log(`  [Tool Execute #${callCount}] getWeather("${city}")`);
    return `Sunny and 28°C in ${city}`;
  },
  cache: { ttl: 60_000 },
});

const agent = new Agent({
  name: "WeatherBot",
  model: openai("gpt-4o-mini"),
  instructions: "You check weather. Always use the getWeather tool.",
  tools: [weatherTool],
  logLevel: "info",
});

console.log("=== Call 1: Fresh weather lookup ===\n");
const r1 = await agent.run("What's the weather in Mumbai?");
console.log("\nResult:", r1.text);
console.log(`Tool executions so far: ${callCount}`);

console.log("\n=== Call 2: Same query, should use cache ===\n");
const r2 = await agent.run("What's the weather in Mumbai?");
console.log("\nResult:", r2.text);
console.log(`Tool executions so far: ${callCount} (should still be 1)`);

console.log("\n=== Call 3: Different city, no cache ===\n");
const r3 = await agent.run("What's the weather in Delhi?");
console.log("\nResult:", r3.text);
console.log(`Tool executions so far: ${callCount} (should be 2)`);
