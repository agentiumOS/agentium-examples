/**
 * Watch a run. The event bus is a mailbox — it does not steer the loop.
 *
 *   OPENAI_API_KEY=sk-... npx tsx basics/04-watch-events.ts
 *
 * To skip a tool or stop early, use loopHooks. See docs: /agents/events
 */

import { Agent, EventBus, openai } from "@agentium/core";

const agent = new Agent({
  name: "Assistant",
  model: openai("gpt-4o"),
  instructions: "Reply in one short sentence.",
  sharedEventBus: true,
});

EventBus.shared.onAny((event, data) => {
  if (event === "run.start" || event === "run.complete" || event === "run.error") {
    console.log(event, data);
  }
});

await agent.run("Say hello.");
