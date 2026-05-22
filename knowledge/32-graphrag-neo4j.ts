/**
 * GraphRAG with Neo4j - LLM-to-Cypher with schema-aware prompting.
 *
 * Best for questions that need relationship reasoning ("Who manages people
 * working on Project Atlas?") rather than fuzzy similarity. Combine with
 * vector retrieval via HybridRetriever for the best of both worlds.
 *
 * Setup:
 *   docker run -p7687:7687 -p7474:7474 -e NEO4J_AUTH=neo4j/test1234 neo4j:5
 *   npm install neo4j-driver
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/knowledge/32-graphrag-neo4j.ts
 */

import {
  GraphRAGRetriever,
  HybridRetriever,
  InMemoryVectorStore,
  Neo4jCypherStore,
  openai,
  OpenAIEmbedding,
} from "@agentium/core";

const store = new Neo4jCypherStore({
  uri: "bolt://localhost:7687",
  username: "neo4j",
  password: "test1234",
});
await store.connect();

// Seed a tiny graph for the demo.
await store.runCypher(`
  MERGE (alice:Person {name: 'Alice'})
  MERGE (bob:Person {name: 'Bob'})
  MERGE (atlas:Project {name: 'Atlas'})
  MERGE (alice)-[:MANAGES]->(bob)
  MERGE (bob)-[:WORKS_ON]->(atlas)
`);

// Pure GraphRAG
const retriever = new GraphRAGRetriever({
  store,
  model: openai("gpt-4o"),
});

const result = await retriever.retrieve("Who manages someone working on Atlas?");
console.log("Generated Cypher:\n  " + result.cypher);
console.log("\nRows:\n  " + result.text);

// ── Hybrid: vector + graph + rerank ────────────────────────────────────────
const vector = new InMemoryVectorStore(new OpenAIEmbedding());
await vector.upsert("notes", { id: "1", content: "Alice manages Bob and Carol." });
await vector.upsert("notes", { id: "2", content: "Project Atlas is shipping in Q4." });

const hybrid = new HybridRetriever({
  vector: { store: vector, collection: "notes" },
  graph: { retriever },
  topK: 5,
});

const fused = await hybrid.retrieve("Who works on Atlas?");
console.log("\nFused results:");
for (const r of fused) console.log(`  [${r.source}] ${r.score.toFixed(3)}  ${r.content}`);

await store.close();
