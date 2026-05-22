/**
 * Unified Memory — Full-feature demo with all memory stores enabled.
 *
 * Shows: sessions, summaries, user facts, user profile, entities,
 * decisions, and the curator for maintenance.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/unified-memory.ts
 */

import { Agent, openai, InMemoryStorage } from "@agentium/core";

const storage = new InMemoryStorage();

const agent = new Agent({
  name: "FullMemoryAgent",
  model: openai("gpt-4o"),
  instructions: `You are a knowledgeable assistant with full memory capabilities.
You remember user facts, track entities (companies, people, projects),
and log your decisions for future reference.`,
  memory: {
    storage,
    maxMessages: 30,
    summaries: true,
    userFacts: true,
    userProfile: true,
    entities: true,
    decisions: true,
    model: openai("gpt-4o-mini"),
  },
  logLevel: "info",
});

const userId = "demo-user";
const sessionId = "demo-session";

console.log("=== 1. Share personal info ===\n");
const r1 = await agent.run(
  "I'm Sarah Chen, a senior engineer at Acme Corp in San Francisco. I work on the ML platform team.",
  { userId, sessionId },
);
console.log("Assistant:", r1.text);

console.log("\n=== 2. Discuss entities ===\n");
const r2 = await agent.run(
  "We're migrating from TensorFlow to PyTorch for our training pipeline. The project is called Atlas.",
  { userId, sessionId },
);
console.log("Assistant:", r2.text);

console.log("\n=== 3. New session — agent remembers ===\n");
const r3 = await agent.run("What do you know about me and my projects?", {
  userId,
  sessionId: "new-session",
});
console.log("Assistant:", r3.text);

// Wait for background extraction
await new Promise((r) => setTimeout(r, 3000));

console.log("\n=== Memory State ===\n");

const mm = agent.memory!;

const facts = await mm.getUserFacts()?.getFacts(userId);
console.log("User Facts:", facts?.map((f) => f.fact));

const profile = await mm.getUserProfile()?.getProfile(userId);
console.log("User Profile:", profile);

const entities = await mm.getEntityMemory()?.listEntities();
console.log(
  "Entities:",
  entities?.map((e) => `${e.name} (${e.entityType})`),
);

console.log("\n=== Curator: Deduplicate ===\n");
const dupes = await mm.curator.deduplicate({ userId });
console.log(`Removed ${dupes} duplicate facts`);

process.exit(0);
