/**
 * Learned Skills — Agent saves successful workflows for future replay.
 *
 * Shows the LearnedSkillStore: saving multi-step patterns and searching them.
 *
 * Usage:
 *   npx tsx examples/skills/learned-skills.ts
 */

import { LearnedSkillStore, InMemoryStorage } from "@agentium/core";

const storage = new InMemoryStorage();
const store = new LearnedSkillStore(storage);

console.log("=== Learned Skills Demo ===\n");

// Save a deployment workflow
const deploySkill = await store.saveSkill({
  name: "deploy-to-production",
  description: "Build, test, and deploy a service to production",
  steps: [
    { toolName: "run_tests", args: { suite: "all" } },
    { toolName: "build", args: { target: "prod", minify: true } },
    { toolName: "deploy", args: { env: "production", region: "us-east-1" } },
    { toolName: "notify_team", args: { channel: "#deployments", message: "Deployed!" } },
  ],
});
console.log(`Saved: "${deploySkill.name}" (${deploySkill.steps.length} steps)`);

// Save a data pipeline skill
const pipelineSkill = await store.saveSkill({
  name: "refresh-analytics",
  description: "Pull latest data, transform, and update dashboards",
  steps: [
    { toolName: "fetch_data", args: { source: "warehouse", range: "last_7d" } },
    { toolName: "transform", args: { format: "parquet" } },
    { toolName: "update_dashboard", args: { dashboard: "weekly-metrics" } },
  ],
});
console.log(`Saved: "${pipelineSkill.name}" (${pipelineSkill.steps.length} steps)`);

// Search for skills
console.log("\n--- Search 'deploy' ---");
const results = await store.searchSkills("deploy");
for (const s of results) {
  console.log(`  [${s.id}] ${s.name}: ${s.description}`);
  console.log(`    Steps: ${s.steps.map((st) => st.toolName).join(" -> ")}`);
}

// Record outcomes
await store.recordOutcome(deploySkill.id, true);
await store.recordOutcome(deploySkill.id, true);
await store.recordOutcome(deploySkill.id, false);

const updated = await store.getSkill(deploySkill.id);
console.log(`\n--- ${updated!.name} stats ---`);
console.log(`  Success: ${updated!.successCount}, Fail: ${updated!.failCount}`);

// List all skills
console.log("\n--- All Skills ---");
const all = await store.listSkills();
for (const s of all) {
  console.log(`  ${s.name} v${s.successCount}/${s.failCount} — ${s.description}`);
}

// Tools exposed by the store
console.log("\n--- Available Tools ---");
const tools = store.getTools();
for (const t of tools) {
  console.log(`  ${t.name}: ${t.description}`);
}
