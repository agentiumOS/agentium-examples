/**
 * Graph Memory — Knowledge graph with InMemoryGraphStore.
 *
 * Creates an agent that automatically extracts entities and relationships
 * from conversation, then queries the graph store directly to show
 * extracted nodes, edges, and graph traversal.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/graph-memory.ts
 */

import { Agent, openai, InMemoryStorage, InMemoryGraphStore } from "@agentium/core";

const storage = new InMemoryStorage();
const graphStore = new InMemoryGraphStore();

const agent = new Agent({
  name: "GraphAgent",
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant. Answer naturally.",
  memory: {
    storage,
    summaries: false,
    graph: { store: graphStore, autoExtract: true },
    model: openai("gpt-4o-mini"),
  },
});

const sessionId = "graph-demo";

console.log("=== 1. Conversation about people & companies ===\n");
const r1 = await agent.run(
  "Alice works at OpenAI as a research scientist. She reports to Bob, who is VP of Research.",
  { sessionId },
);
console.log("Assistant:", r1.text);

const r2 = await agent.run(
  "OpenAI is based in San Francisco. Alice previously worked at Google DeepMind in London.",
  { sessionId },
);
console.log("Assistant:", r2.text);

await new Promise((r) => setTimeout(r, 3000));

console.log("\n=== 2. Query graph store directly ===\n");

const allNodes = await graphStore.findNodes({});
console.log(`Nodes (${allNodes.length}):`);
for (const n of allNodes) {
  const props = Object.entries(n.properties).map(([k, v]) => `${k}=${v}`).join(", ");
  console.log(`  [${n.id}] ${n.name} (${n.type})${props ? ` {${props}}` : ""}`);
}

console.log("\n=== 3. Search for 'Alice' ===\n");
const hits = await graphStore.search("alice", { limit: 3 });
if (hits.length > 0) {
  const alice = hits[0];
  console.log(`Found: ${alice.name} (${alice.type})`);

  console.log("\n=== 4. Traverse connections from Alice ===\n");
  const { nodes, edges } = await graphStore.traverse(alice.id, { maxDepth: 2 });
  for (const n of nodes) console.log(`  Node: ${n.name} (${n.type})`);
  for (const e of edges) {
    const src = nodes.find((n) => n.id === e.sourceId);
    const tgt = nodes.find((n) => n.id === e.targetId);
    console.log(`  Edge: ${src?.name ?? e.sourceId} --[${e.type}]--> ${tgt?.name ?? e.targetId}`);
  }
}

process.exit(0);
