/**
 * Temporal Facts — Fact superseding demo.
 *
 * Creates an agent with userFacts enabled. The user shares a preference,
 * then changes it in a later message. Inspects the fact store to show
 * that the old fact was invalidated and replaced by the new one.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/temporal-facts.ts
 */

import { Agent, openai, InMemoryStorage } from "@agentium/core";

const storage = new InMemoryStorage();

const agent = new Agent({
  name: "TemporalAgent",
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant that remembers user preferences.",
  memory: {
    storage,
    summaries: false,
    userFacts: true,
    model: openai("gpt-4o-mini"),
  },
});

const userId = "user-temporal";

console.log("=== 1. Share initial location ===\n");
const r1 = await agent.run("I live in Mumbai and I love spicy food.", { userId, sessionId: "s1" });
console.log("Assistant:", r1.text);
await new Promise((r) => setTimeout(r, 3000));

console.log("\n=== Facts after round 1 ===");
const facts1 = await agent.memory!.getUserFacts()!.getFacts(userId);
for (const f of facts1) {
  console.log(`  [${f.invalidatedAt ? "INVALID" : "ACTIVE"}] ${f.fact}`);
}

console.log("\n=== 2. User moves to London ===\n");
const r2 = await agent.run("I just moved to London! Still love spicy food though.", {
  userId,
  sessionId: "s2",
});
console.log("Assistant:", r2.text);
await new Promise((r) => setTimeout(r, 3000));

console.log("\n=== Facts after round 2 ===");
const facts2 = await agent.memory!.getUserFacts()!.getFacts(userId);
for (const f of facts2) {
  const status = f.invalidatedAt ? "SUPERSEDED" : "ACTIVE";
  console.log(`  [${status}] ${f.fact}`);
}

const active = facts2.filter((f) => !f.invalidatedAt);
const superseded = facts2.filter((f) => f.invalidatedAt);
console.log(`\nActive: ${active.length}, Superseded: ${superseded.length}`);

process.exit(0);
