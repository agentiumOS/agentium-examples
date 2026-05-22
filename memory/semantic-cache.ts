/**
 * Semantic Cache — Cache LLM responses by semantic similarity.
 *
 * Similar queries return cached responses without calling the LLM,
 * dramatically reducing costs and latency.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/semantic-cache.ts
 */

import { Agent, openai, InMemoryVectorStore, OpenAIEmbedding } from "@agentium/core";

const vectorStore = new InMemoryVectorStore(new OpenAIEmbedding());
const embedding = new OpenAIEmbedding();

const agent = new Agent({
  name: "cached-agent",
  model: openai("gpt-4o-mini"),
  instructions: "You are a helpful assistant.",
  semanticCache: {
    vectorStore,
    embedding,
    similarityThreshold: 0.9,
    scope: "agent",
  },
  logLevel: "info",
});

// Listen for cache events
agent.eventBus.on("cache.hit" as any, (data: any) => {
  console.log(`  [Cache HIT] "${data.input.slice(0, 50)}..."`);
});
agent.eventBus.on("cache.miss" as any, (data: any) => {
  console.log(`  [Cache MISS] "${data.input.slice(0, 50)}..."`);
});

console.log("=== Semantic Cache Demo ===\n");

console.log("--- First query (cache miss, calls LLM) ---");
const r1 = await agent.run("What is the capital of France?");
console.log("Response:", r1.text);
console.log("Duration:", r1.durationMs, "ms\n");

console.log("--- Same query again (cache hit, no LLM call) ---");
const r2 = await agent.run("What is the capital of France?");
console.log("Response:", r2.text);
console.log("Duration:", r2.durationMs, "ms\n");

console.log("--- Similar query (may hit cache) ---");
const r3 = await agent.run("Tell me the capital city of France");
console.log("Response:", r3.text);
console.log("Duration:", r3.durationMs, "ms\n");

console.log("--- Different query (cache miss) ---");
const r4 = await agent.run("What is quantum computing?");
console.log("Response:", r4.text);
console.log("Duration:", r4.durationMs, "ms");

process.exit(0);
