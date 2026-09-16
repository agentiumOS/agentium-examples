/**
 * Smallest possible agent.
 *
 *   OPENAI_API_KEY=sk-... npx tsx basics/01-basic-agent.ts
 *
 * Two required fields: name + model. Then ask with run().
 * run() options (all optional): sessionId, userId, tenantId, metadata, apiKey, signal.
 */

import { Agent, openai } from "@agentium/core";

const agent = new Agent({
  name: "Assistant",
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant. Be concise.",
});

const result = await agent.run("What is the capital of France?");
console.log(result.text);
console.log(`tokens: ${result.usage.totalTokens}  session: ${result.sessionId}`);
