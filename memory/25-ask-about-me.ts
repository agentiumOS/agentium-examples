/**
 * Ask About Me — Interactive chat where the user shares info and then asks
 * the agent what it knows about them.
 *
 * The unified memory config enables user facts, user profile, and summaries.
 * The agent automatically gets tools like recall_user_facts from enabled
 * memory stores.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/25-ask-about-me.ts
 */

import * as readline from "node:readline";
import { Agent, openai, MongoDBStorage } from "@agentium/core";

const storage = new MongoDBStorage("mongodb://localhost:27017/agentium");

const agent = new Agent({
  name: "MemoryBot",
  model: openai("gpt-4o"),
  instructions: `You are a friendly assistant with a great memory.
When the user asks what you know or remember about them, use the recall_user_facts tool to look it up.
When the user shares new information, acknowledge it warmly.
Always personalize your responses based on what you know.`,
  memory: {
    storage,
    summaries: true,
    userFacts: true,
    userProfile: true,
    entities: true,
    model: openai("gpt-4o-mini"),
  },
  logLevel: "info",
});

const userId = "user-42";
let sessionId = `session-${Date.now()}`;

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║  Ask About Me — Tell me things, then ask what I know!  ║");
console.log("║  Type 'quit' to exit, 'new' for a new session          ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

function prompt() {
  rl.question("You: ", async (input) => {
    const trimmed = input.trim();

    if (!trimmed) return prompt();

    if (trimmed.toLowerCase() === "quit") {
      console.log("\nGoodbye!");
      await storage.close();
      process.exit(0);
    }

    if (trimmed.toLowerCase() === "new") {
      sessionId = `session-${Date.now()}`;
      console.log(`\nNew session started (${sessionId}). Memory persists!\n`);
      return prompt();
    }

    try {
      const result = await agent.run(trimmed, { userId, sessionId });
      console.log(`\nAssistant: ${result.text}\n`);
    } catch (err) {
      console.error(`\nError: ${(err as Error).message}\n`);
    }

    prompt();
  });
}

prompt();
