/**
 * Agent harness — one switch for project files, skills, notes, helpers.
 *
 *   OPENAI_API_KEY=sk-... npx tsx harness/01-deep-agent.ts
 *
 * Agent.deep() is still a normal Agent. Your config overrides the defaults.
 */

import { Agent, openai } from "@agentium/core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const agent = Agent.deep({
  name: "coder",
  model: openai("gpt-4o"),
  instructions: "You are a coding assistant. Follow AGENTS.md.",
  workspace: here,
  skillDirs: [join(here, "skills")],
  contextFiles: { cwd: here },
  register: false,
});

console.log("tools:", agent.listTools().join(", "));

const result = await agent.run(
  "What project rules did you load, and which skills are available?",
  { sessionId: "harness-1", userId: "dev" },
);
console.log(result.text);
