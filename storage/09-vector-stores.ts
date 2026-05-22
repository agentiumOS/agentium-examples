/**
 * Vector Stores — Similarity search with InMemory, PgVector, Qdrant, and MongoDB Atlas.
 *
 * Usage:
 *   npx tsx examples/storage/09-vector-stores.ts                         # in-memory (default)
 *   npx tsx examples/storage/09-vector-stores.ts pgvector                # PgVector  (needs PG_URL)
 *   npx tsx examples/storage/09-vector-stores.ts qdrant                  # Qdrant    (needs QDRANT_URL)
 *   npx tsx examples/storage/09-vector-stores.ts mongodb                 # MongoDB   (needs MONGO_URL)
 */

import {
  InMemoryVectorStore,
  PgVectorStore,
  QdrantVectorStore,
  MongoDBVectorStore,
  type VectorStore,
  type EmbeddingProvider,
} from "@agentium/core";

// ---------------------------------------------------------------------------
// Fake embedder for demonstration — maps text to a deterministic vector.
// Replace with a real embedder (OpenAI, Cohere, etc.) in production.
// ---------------------------------------------------------------------------
const DIMS = 64;

class FakeEmbedder implements EmbeddingProvider {
  readonly dimensions = DIMS;

  async embed(text: string): Promise<number[]> {
    const vec = new Array(DIMS).fill(0);
    for (let i = 0; i < text.length; i++) {
      vec[i % DIMS] += text.charCodeAt(i) / 1000;
    }
    const norm = Math.sqrt(vec.reduce((s: number, v: number) => s + v * v, 0)) || 1;
    return vec.map((v: number) => v / norm);
  }

  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map((t) => this.embed(t)));
  }
}

const embedder = new FakeEmbedder();
const backend = process.argv[2] ?? "memory";

async function createStore(): Promise<VectorStore> {
  switch (backend) {
    case "pgvector": {
      const store = new PgVectorStore(
        {
          connectionString: process.env.PG_URL ?? "postgres://localhost:5432/agentium",
          dimensions: DIMS,
        },
        embedder
      );
      await store.initialize();
      return store;
    }
    case "qdrant": {
      const store = new QdrantVectorStore(
        {
          url: process.env.QDRANT_URL ?? "http://localhost:6333",
          dimensions: DIMS,
        },
        embedder
      );
      await store.initialize();
      return store;
    }
    case "mongodb": {
      const store = new MongoDBVectorStore(
        {
          uri: process.env.MONGO_URL ?? "mongodb://localhost:27017",
          dbName: "agentium_vector_example",
        },
        embedder
      );
      await store.initialize();
      return store;
    }
    default: {
      const store = new InMemoryVectorStore(embedder);
      await store.initialize();
      return store;
    }
  }
}

const store = await createStore();
const COLLECTION = "articles";
console.log(`Using vector store: ${backend}\n`);

// --- UPSERT ---
const docs = [
  { id: "1", content: "TypeScript is a typed superset of JavaScript", metadata: { topic: "programming" } },
  { id: "2", content: "Python is great for machine learning and data science", metadata: { topic: "programming" } },
  { id: "3", content: "The capital of France is Paris", metadata: { topic: "geography" } },
  { id: "4", content: "Neural networks are inspired by the human brain", metadata: { topic: "ai" } },
  { id: "5", content: "Rust provides memory safety without garbage collection", metadata: { topic: "programming" } },
  { id: "6", content: "Tokyo is the most populous metropolitan area in the world", metadata: { topic: "geography" } },
];

await store.upsertBatch(COLLECTION, docs);
console.log(`UPSERT  ${docs.length} documents\n`);

// --- SEARCH ---
console.log("--- Search: 'JavaScript programming language' ---");
const results1 = await store.search(COLLECTION, "JavaScript programming language", { topK: 3 });
for (const r of results1) {
  console.log(`  [${r.score.toFixed(4)}] ${r.id}: ${r.content}`);
}

console.log("\n--- Search: 'cities and countries' ---");
const results2 = await store.search(COLLECTION, "cities and countries", { topK: 3 });
for (const r of results2) {
  console.log(`  [${r.score.toFixed(4)}] ${r.id}: ${r.content}`);
}

// --- GET ---
console.log("\n--- Get document by ID ---");
const doc = await store.get(COLLECTION, "4");
console.log(`GET  id=4 →`, doc);

// --- DELETE ---
await store.delete(COLLECTION, "6");
console.log("\nDEL  id=6");

const afterDelete = await store.search(COLLECTION, "Tokyo metropolitan", { topK: 2 });
console.log("Search after delete:");
for (const r of afterDelete) {
  console.log(`  [${r.score.toFixed(4)}] ${r.id}: ${r.content}`);
}

// --- CLEANUP ---
await store.dropCollection(COLLECTION);
await store.close();
console.log("\nDone.");
