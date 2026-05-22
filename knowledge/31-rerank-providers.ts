/**
 * All four built-in rerankers compared side-by-side.
 *
 * - CohereReranker     (rerank-v3.5)             — needs `cohere-ai` + COHERE_API_KEY
 * - VoyageReranker     (rerank-2)                — uses raw HTTP + VOYAGE_API_KEY
 * - JinaReranker       (jina-reranker-v2)        — uses raw HTTP + JINA_API_KEY
 * - ColbertReranker    (local cross-encoder)     — needs `@xenova/transformers`, no API key
 *
 * Each one implements the same `Reranker` interface so they're interchangeable
 * in `VectorStore.search({ rerank })` or `SemanticToolSelector`.
 *
 * Run:
 *   npx tsx examples/knowledge/31-rerank-providers.ts
 */

import {
  ColbertReranker,
  CohereReranker,
  JinaReranker,
  VoyageReranker,
  type Reranker,
} from "@agentium/core";

const query = "Which big cat lives in Asia?";
const docs = [
  { id: "1", content: "Cats are independent animals that often nap in sunbeams." },
  { id: "2", content: "Tigers are large solitary cats found in Asian forests." },
  { id: "3", content: "Lions live in African savannahs." },
  { id: "4", content: "Snow leopards roam the Himalayan mountains." },
];

async function tryReranker(name: string, r: Reranker) {
  try {
    const result = await r.rerank(query, docs, { topK: 3 });
    console.log(`\n--- ${name} ---`);
    for (const x of result) console.log(`  ${x.score.toFixed(4)}  ${x.id}  ${x.content}`);
  } catch (err: any) {
    console.log(`--- ${name}: skipped (${err.message}) ---`);
  }
}

await tryReranker("Cohere", new CohereReranker());
await tryReranker("Voyage", new VoyageReranker());
await tryReranker("Jina", new JinaReranker());
await tryReranker("ColBERT (local)", new ColbertReranker());
