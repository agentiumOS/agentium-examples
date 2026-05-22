/**
 * Reranking with Cohere - upgrades any VectorStore.search to two-stage retrieval.
 *
 * Stage 1: vector search returns topK * rerankMultiplier candidates (default 3x).
 * Stage 2: Cohere's `rerank-v3.5` reorders them and returns the final topK.
 *
 * Setup:
 *   npm install @agentium/core cohere-ai
 *   export COHERE_API_KEY=...
 *
 * Run:
 *   npx tsx examples/knowledge/30-rerank-cohere.ts
 */

import { CohereReranker, InMemoryVectorStore, OpenAIEmbedding } from "@agentium/core";

const embedder = new OpenAIEmbedding();
const store = new InMemoryVectorStore(embedder);
const reranker = new CohereReranker({ model: "rerank-v3.5" });

// Index a small corpus.
const docs = [
  { id: "1", content: "Cats are independent animals that often nap in sunbeams." },
  { id: "2", content: "Dogs are loyal companions that love long walks." },
  { id: "3", content: "Tigers are large solitary cats found in Asian forests." },
  { id: "4", content: "Goldfish are common pets kept in glass bowls." },
  { id: "5", content: "Sphynx cats have no fur but love affection." },
  { id: "6", content: "Beagles are friendly hound dogs bred for hunting." },
];

for (const d of docs) await store.upsert("animals", d);

// Vector-only result.
const baseline = await store.search("animals", "Tell me about cats.", { topK: 3 });
console.log("\n--- vector only ---");
for (const r of baseline) console.log(`  ${r.score.toFixed(3)}  ${r.id}  ${r.content}`);

// Reranked result.
const reranked = await store.search("animals", "Tell me about cats.", {
  topK: 3,
  rerank: reranker,
  rerankMultiplier: 3, // fetch 9 candidates, rerank down to 3
});
console.log("\n--- after Cohere rerank ---");
for (const r of reranked) console.log(`  ${r.score.toFixed(3)}  ${r.id}  ${r.content}`);
