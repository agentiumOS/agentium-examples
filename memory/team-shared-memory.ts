/**
 * Team Shared Memory — Two agents sharing memory through a Team.
 *
 * Agent 1 learns user facts from conversation. Agent 2 can access
 * those facts in a separate session, demonstrating cross-agent
 * knowledge sharing via shared memory.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/memory/team-shared-memory.ts
 */

import { Agent, Team, TeamMode, openai, InMemoryStorage } from "@agentium/core";

const storage = new InMemoryStorage();

const intake = new Agent({
  name: "IntakeAgent",
  model: openai("gpt-4o"),
  instructions: `You are an onboarding assistant. Greet the user warmly and
gather information about their preferences, role, and goals.`,
  register: false,
});

const advisor = new Agent({
  name: "AdvisorAgent",
  model: openai("gpt-4o"),
  instructions: `You are a personalized advisor. Use what you know about the
user to give tailored recommendations. Reference specific facts you know.`,
  register: false,
});

const team = new Team({
  name: "SharedMemoryTeam",
  mode: TeamMode.Route,
  model: openai("gpt-4o"),
  members: [intake, advisor],
  instructions: `Route onboarding questions to IntakeAgent.
Route advice/recommendation requests to AdvisorAgent.`,
  memory: {
    storage,
    summaries: true,
    userFacts: true,
    model: openai("gpt-4o-mini"),
  },
});

const userId = "shared-user";

console.log("=== 1. IntakeAgent gathers info ===\n");
const r1 = await team.run(
  "Hi! I'm a backend engineer who works with Go and PostgreSQL. I'm interested in learning Rust.",
  { userId, sessionId: "onboard-1" },
);
console.log("Team:", r1.text);
await new Promise((r) => setTimeout(r, 3000));

console.log("\n=== 2. AdvisorAgent uses shared knowledge ===\n");
const r2 = await team.run("Can you recommend some resources for me based on what you know?", {
  userId,
  sessionId: "advice-1",
});
console.log("Team:", r2.text);

await new Promise((r) => setTimeout(r, 2000));

console.log("\n=== Shared Memory State ===\n");
const mm = intake.memory ?? advisor.memory;
if (mm) {
  const facts = await mm.getUserFacts()?.getActiveFacts(userId);
  console.log("Shared facts:");
  for (const f of facts ?? []) console.log(`  - ${f.fact}`);
} else {
  console.log("(Memory lives on the team — checking team-level extraction)");
}

process.exit(0);
