/**
 * Standing notes — tiny MEMORY.md / USER.md with a hard character cap.
 *
 *   OPENAI_API_KEY=sk-... npx tsx memory/file-memory.ts
 *
 * This sits next to memory: { storage }. It does not replace sessions.
 */

import { Agent, openai } from "@agentium/core";

const agent = new Agent({
  name: "notes-bot",
  model: openai("gpt-4o"),
  instructions:
    "When the user tells you a standing fact, save it with the memory tool (target=user for people, target=memory for the project).",
  fileMemory: true,
  register: false,
});

const user = { sessionId: "s1", userId: "alex" };

await agent.run("Please remember that I prefer bullet points and hate long intros.", user);
const r = await agent.run("How should you format answers for me?", user);
console.log(r.text);
