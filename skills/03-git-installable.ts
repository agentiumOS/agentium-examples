/**
 * Git-installable skills - load Anthropic-style skills from any git repo.
 *
 * Source formats:
 *   git+https://github.com/me/my-skill.git
 *   git+https://github.com/me/my-skill.git#v1.2.3      (tag)
 *   git+https://github.com/me/my-skill.git#main         (branch)
 *   git+https://github.com/me/monorepo.git?subdir=packages%2Fmy-skill
 *
 * The repo must contain a `skill.json` manifest at the root (or in the
 * specified subdir) plus a main module that exports `getTools()` or `tools`.
 *
 * Run:
 *   npx tsx examples/skills/03-git-installable.ts
 */

import { Agent, GitSkillLoader, openai, SkillManager } from "@agentium/core";

const manager = new SkillManager();
// GitSkillLoader is auto-registered alongside Local / Remote / Npm in v2.0.
void GitSkillLoader;

// Load a skill from a public GitHub repo (replace with one that exists).
// const skill = await manager.loadSkill("git+https://github.com/agentiumOS/skill-example.git#v1.0.0");

// Use it in an agent.
// const agent = new Agent({
//   name: "git-skill-demo",
//   model: openai("gpt-4o"),
//   tools: skill.tools,
//   instructions: skill.instructions,
// });
// const result = await agent.run("Hello from a git-installed skill");
// console.log(result.text);

// For demo purposes, just show the SkillManager can resolve a git source.
console.log("Loaders registered:", manager.constructor.name);

// Or install via the CLI in a real project:
//   npm i -g @agentium/cli
//   agentium skills install git+https://github.com/agentiumOS/skill-example.git
void Agent;
void openai;
