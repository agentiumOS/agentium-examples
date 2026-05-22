/**
 * Unified Memory — Cross-session personalization with auto-extraction.
 *
 * The agent uses the unified memory config to automatically extract and
 * store facts about the user, then uses them in future interactions.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/23-user-memory.ts
 */

import { Agent, openai, MongoDBStorage } from "@agentium/core";

const storage = new MongoDBStorage("mongodb://localhost:27017/agentium");

const agent = new Agent({
  name: "PersonalAssistant",
  model: openai("gpt-4o"),
  instructions:
    "You are a friendly personal assistant. Use what you know about the user to personalize your responses.",
  memory: {
    storage,
    summaries: true,
    userFacts: true,
    userProfile: true,
    model: openai("gpt-4o-mini"),
  },
  logLevel: "info",
});

const userId = "user-42";

console.log("=== Conversation 1: Share personal info ===\n");
const r1 = await agent.run(
  "Hi! I'm a TypeScript developer based in Mumbai. I love building AI tools and prefer concise answers.",
  { userId, sessionId: "session-1" },
);
console.log("\nAssistant:", r1.text);

// Wait briefly for background extraction to complete
await new Promise((r) => setTimeout(r, 3000));

console.log("\n--- Extracted facts (auto-captured) ---");
const facts = await agent.memory?.getUserFacts()?.getFacts(userId);
for (const f of facts ?? []) {
  console.log(`  [${f.source}] ${f.fact}`);
}

console.log("\n--- User profile ---");
const profile = await agent.memory?.getUserProfile()?.getProfile(userId);
if (profile) {
  console.log(`  Name: ${profile.name ?? "unknown"}`);
  console.log(`  Role: ${profile.role ?? "unknown"}`);
  console.log(`  Location: ${profile.location ?? "unknown"}`);
}

console.log("\n=== Conversation 2: New session, agent remembers ===\n");
const r2 = await agent.run("What programming frameworks should I learn next?", {
  userId,
  sessionId: "session-2",
});
console.log("\nAssistant:", r2.text);

await storage.close();
process.exit(0);
