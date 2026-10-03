/**
 * Reasoning / extended thinking, plus provider-only request options.
 *
 * Any one key is enough. Each block runs only when its key is set.
 *
 *   GOOGLE_API_KEY=... npx tsx basics/22-reasoning.ts
 *   OPENAI_API_KEY=... npx tsx basics/22-reasoning.ts
 *   ANTHROPIC_API_KEY=... npx tsx basics/22-reasoning.ts
 */

import { Agent, anthropic, defineTool, google, openai } from "@agentium/core";
import { z } from "zod";

const question = "A farmer has 17 sheep. All but 9 die. How many sheep are left alive?";

function show(label: string, text: string, thinking?: string) {
  console.log(`\n=== ${label} ===`);
  console.log("Answer:", text);
  if (thinking) console.log("Thinking:", thinking.slice(0, 300));
}

if (process.env.GOOGLE_API_KEY) {
  const gemini = new Agent({
    name: "Gemini Thinker",
    model: google("gemini-2.5-flash"),
    instructions: "Solve problems step by step.",
    reasoning: { enabled: true, budgetTokens: 8000 },
    providerOptions: { googleSearch: true, mediaResolution: "medium" },
  });
  const result = await gemini.run(question);
  show("Gemini 2.5 Flash", result.text, result.thinking);
}

if (process.env.OPENAI_API_KEY) {
  const gpt = new Agent({
    name: "OpenAI Thinker",
    model: openai("gpt-5.6-terra"),
    instructions: "Solve problems step by step.",
    // Tools put GPT-5.6 on the Responses API, which is what returns thinking text.
    tools: [
      defineTool({
        name: "get_weather",
        description: "Get current weather for a city",
        parameters: z.object({ city: z.string() }),
        execute: async ({ city }) => `${city}: 22°C, sunny`,
      }),
    ],
    reasoning: { enabled: true, effort: "medium", summary: "detailed" },
    providerOptions: { promptCacheRetention: "in_memory" },
  });
  const result = await gpt.run(question);
  show("GPT-5.6", result.text, result.thinking);
}

if (process.env.ANTHROPIC_API_KEY) {
  const claude = new Agent({
    name: "Claude Thinker",
    model: anthropic("claude-sonnet-4-6"),
    instructions: "Solve problems step by step.",
    reasoning: { enabled: true, effort: "high" },
    providerOptions: { promptCache: true },
  });
  const result = await claude.run(question);
  show("Claude Sonnet 4.6", result.text, result.thinking);
}

if (!process.env.GOOGLE_API_KEY && !process.env.OPENAI_API_KEY && !process.env.ANTHROPIC_API_KEY) {
  console.log("Set GOOGLE_API_KEY, OPENAI_API_KEY, or ANTHROPIC_API_KEY.");
}
