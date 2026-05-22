/**
 * RAG Agent with Qdrant — Uses KnowledgeBase class for zero-boilerplate RAG.
 *
 * Prerequisites:
 *   - Qdrant running on localhost:6333  (docker run -p 6333:6333 -p 6334:6334 qdrant/qdrant)
 *   - npm install @qdrant/js-client-rest
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/knowledge/11-rag-qdrant.ts
 */

import {
  Agent,
  openai,
  KnowledgeBase,
  OpenAIEmbedding,
  QdrantVectorStore,
} from "@agentium/core";

// ── 1. Create a knowledge base (Qdrant-backed) ───────────────────────────

const kb = new KnowledgeBase({
  name: "Agentium Docs",
  vectorStore: new QdrantVectorStore(
    { url: "http://localhost:6333", dimensions: 1536 },
    new OpenAIEmbedding()
  ),
});

await kb.initialize();

// ── 2. Index documents ────────────────────────────────────────────────────

await kb.addDocuments([
  {
    id: "agentium-overview",
    content:
      "Agentium is an agent orchestration framework for Node.js/TypeScript. It is model-agnostic and supports OpenAI, Anthropic, Google Gemini, and Ollama providers out of the box.",
    metadata: { section: "overview" },
  },
  {
    id: "agentium-agents",
    content:
      "Agents in Agentium are the fundamental unit. Each agent has a model, optional tools, instructions, memory, and lifecycle hooks. Agents support both single-shot and streaming responses.",
    metadata: { section: "agents" },
  },
  {
    id: "agentium-teams",
    content:
      "Teams coordinate multiple agents. They support four modes: Coordinate (leader delegates), Route (auto-select best agent), Broadcast (all agents respond), and Collaborate (round-robin discussion).",
    metadata: { section: "teams" },
  },
  {
    id: "agentium-workflows",
    content:
      "Workflows provide deterministic multi-step execution with shared state. Steps can be agent steps, function steps, condition steps, or parallel steps. Workflows support conditional branching and fan-out/fan-in patterns.",
    metadata: { section: "workflows" },
  },
  {
    id: "agentium-tools",
    content:
      "Tools are defined with defineTool() using Zod schemas for parameter validation. The ToolExecutor handles parallel execution of multiple tool calls. Tools receive a RunContext for accessing session and agent metadata.",
    metadata: { section: "tools" },
  },
  {
    id: "agentium-vector",
    content:
      "Agentium has built-in vector store support with PgVector, Qdrant, MongoDB Atlas, and InMemory backends. Embedding providers include OpenAI and Google. This enables RAG patterns directly within agents.",
    metadata: { section: "vector" },
  },
  {
    id: "agentium-storage",
    content:
      "Storage drivers provide key-value persistence. Options include InMemory, SQLite, PostgreSQL, and MongoDB. Storage is used for session data, memory, and agent state.",
    metadata: { section: "storage" },
  },
  {
    id: "agentium-transport",
    content:
      "The optional transport layer adds Express.js REST/SSE endpoints and Socket.IO real-time gateways. Install @agentium/transport to expose agents, teams, and workflows as HTTP services.",
    metadata: { section: "transport" },
  },
]);
console.log("Indexed 8 documents into Qdrant.\n");

// ── 3. Create agent with knowledge base tool ──────────────────────────────

const agent = new Agent({
  name: "Agentium Docs Assistant",
  model: openai("gpt-4o"),
  tools: [kb.asTool({ topK: 3 })],
  instructions: `You are a helpful assistant for Agentium.
Always use the search tool before answering. Ground your answers in the retrieved documents.
Be concise. Cite the section when possible.`,
});

// ── 4. Ask questions ──────────────────────────────────────────────────────

const questions = [
  "What team modes does Agentium support?",
  "How do I define tools in Agentium?",
  "What vector store backends are available?",
];

for (const question of questions) {
  console.log(`Q: ${question}`);
  const result = await agent.run(question);
  console.log(`A: ${result.text}\n`);
}

// ── Cleanup ───────────────────────────────────────────────────────────────

await kb.clear();
await kb.close();
console.log("Done.");
