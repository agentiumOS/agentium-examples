/**
 * Simplified API — Uses remember / recall / forget directly on MemoryManager.
 *
 * Stores facts, recalls them with composite scoring, forgets some,
 * and verifies the results — all without running an agent.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/simplified-api.ts
 */

import { MemoryManager, InMemoryStorage, openai } from "@agentium/core";

const mm = new MemoryManager({
  storage: new InMemoryStorage(),
  userFacts: true,
  entities: true,
  summaries: false,
  model: openai("gpt-4o"),
});

await mm.ensureReady();

const userId = "demo-user";

console.log("=== 1. Remember facts ===\n");
await mm.remember("Prefers TypeScript over JavaScript", { userId, importance: 0.8 });
await mm.remember("Works at a fintech startup", { userId, importance: 0.7 });
await mm.remember("Uses Neovim as primary editor", { userId, importance: 0.5 });
await mm.remember("Allergic to peanuts", { userId, importance: 0.9 });
await mm.remember("Drinks oat-milk lattes every morning", { userId, importance: 0.3 });
console.log("Stored 5 facts.");

console.log("\n=== 2. Recall facts matching 'editor' ===\n");
const editorHits = await mm.recall("editor", { userId, topK: 3 });
for (const hit of editorHits) {
  console.log(`  [${hit.score.toFixed(3)}] (${hit.source}) ${hit.content}`);
}

console.log("\n=== 3. Recall facts matching 'work' ===\n");
const workHits = await mm.recall("work", { userId, topK: 3 });
for (const hit of workHits) {
  console.log(`  [${hit.score.toFixed(3)}] (${hit.source}) ${hit.content}`);
}

console.log("\n=== 4. Forget all facts for user ===\n");
const removed = await mm.forget({ userId });
console.log(`Removed ${removed} store(s).`);

console.log("\n=== 5. Recall after forget ===\n");
const afterForget = await mm.recall("editor", { userId, topK: 3 });
console.log(`Results: ${afterForget.length} (expected 0)`);

process.exit(0);
