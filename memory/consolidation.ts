/**
 * Consolidation — Merges semantically similar user facts via LLM.
 *
 * Creates user facts that are semantically similar (not exact duplicates),
 * runs curator.consolidate() with a model, and shows how separate facts
 * get merged into a single authoritative entry.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/consolidation.ts
 */

import { MemoryManager, InMemoryStorage, openai } from "@agentium/core";

const storage = new InMemoryStorage();
const model = openai("gpt-4o-mini");

const mm = new MemoryManager({
  storage,
  userFacts: true,
  summaries: false,
  model,
});

await mm.ensureReady();

const userId = "consolidation-user";

console.log("=== 1. Store semantically similar facts ===\n");

const facts = [
  { fact: "Prefers dark mode in all applications", topics: ["preference"], importance: 0.6 },
  { fact: "Likes dark themes and avoids light UIs", topics: ["preference"], importance: 0.5 },
  { fact: "Works as a senior backend engineer", topics: ["career"], importance: 0.8 },
  { fact: "Is a senior engineer specializing in backend systems", topics: ["career"], importance: 0.7 },
  { fact: "Enjoys hiking on weekends", topics: ["hobby"], importance: 0.4 },
  { fact: "Loves weekend hikes in the mountains", topics: ["hobby"], importance: 0.4 },
  { fact: "Allergic to shellfish", topics: ["health"], importance: 0.9 },
];

const userFacts = mm.getUserFacts()!;
await userFacts.addFacts(userId, facts, "manual");

const before = await userFacts.getActiveFacts(userId);
console.log(`Before consolidation (${before.length} facts):`);
for (const f of before) console.log(`  - ${f.fact}`);

console.log("\n=== 2. Run consolidation ===\n");

const merged = await mm.curator.consolidate({ userId, model });
console.log(`Merged ${merged} fact(s).`);

console.log("\n=== 3. Facts after consolidation ===\n");

const after = await userFacts.getActiveFacts(userId);
console.log(`After consolidation (${after.length} facts):`);
for (const f of after) console.log(`  - ${f.fact}`);

console.log(`\nReduction: ${before.length} → ${after.length} facts`);

process.exit(0);
