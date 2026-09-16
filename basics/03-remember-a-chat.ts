/**
 * Continue a chat. Same sessionId = the agent remembers earlier turns.
 *
 *   OPENAI_API_KEY=sk-... npx tsx basics/03-remember-a-chat.ts
 *
 * There is no `storage` field on Agent. Put the database on memory.storage
 * if you want this to survive a process restart.
 */

import { Agent, InMemoryStorage, openai } from "@agentium/core";

const agent = new Agent({
  name: "Assistant",
  model: openai("gpt-4o"),
  instructions: "Be concise.",
  memory: { storage: new InMemoryStorage() },
});

const chat = { sessionId: "chat-1", userId: "alex" };

const r1 = await agent.run("My name is Alex and I live in Mumbai.", chat);
console.log("1:", r1.text);

const r2 = await agent.run("What's my name, and where do I live?", chat);
console.log("2:", r2.text);

const r3 = await agent.run("What's my name?", { sessionId: "other-chat", userId: "alex" });
console.log("3 (new session, same user — no transcript):", r3.text);
