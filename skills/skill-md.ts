/**
 * SKILL.md — name + description first, full booklet only when asked.
 *
 *   OPENAI_API_KEY=sk-... npx tsx skills/skill-md.ts
 */

import { Agent, openai } from "@agentium/core";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));

const agent = new Agent({
  name: "skilled",
  model: openai("gpt-4o"),
  instructions: "If a skill fits the job, call get_skill_instructions before answering.",
  skillDirs: [join(here, "../harness/skills")],
  register: false,
});

console.log("tools:", agent.listTools().join(", "));
const r = await agent.run("How should you greet people in this project?");
console.log(r.text);
