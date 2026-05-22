/**
 * A/B Testing Agent Versions
 *
 * Demonstrates deterministic traffic splitting between two agent versions
 * with metric tracking and auto-rollback detection.
 *
 * Usage: npx tsx examples/agents/ab-testing.ts
 */
import { Agent, openai, ABRouter, VersionStore, InMemoryStorage } from "@agentium/core";

async function main() {
  const storage = new InMemoryStorage();
  const versionStore = new VersionStore(storage);

  // Create two agent versions
  const v1 = await versionStore.save({
    agentName: "support-agent",
    instructions: "Be concise and professional.",
    modelId: "gpt-4o-mini",
    providerId: "openai",
    toolNames: ["search"],
    temperature: 0.5,
  });

  const v2 = await versionStore.save({
    agentName: "support-agent",
    instructions: "Be warm, empathetic, and thorough.",
    modelId: "gpt-4o",
    providerId: "openai",
    toolNames: ["search", "create_ticket"],
    temperature: 0.7,
  });

  console.log("Version diff:", versionStore.diff(v1, v2));

  // Set up A/B router
  const router = new ABRouter({
    name: "support-instructions-test",
    control: { agentName: "support-agent", versionId: v1.versionId },
    variant: { agentName: "support-agent", versionId: v2.versionId },
    trafficSplit: 0.2,
    routing: "user",
    autoRollback: { errorRateThreshold: 0.15, windowMs: 300_000 },
  });

  // Simulate requests
  const users = ["user-1", "user-2", "user-3", "user-4", "user-5", "user-6", "user-7", "user-8", "user-9", "user-10"];

  for (const userId of users) {
    const variant = router.route({ userId });
    const success = Math.random() > 0.1;
    const latency = 500 + Math.random() * 2000;
    const tokens = 100 + Math.random() * 500;

    router.recordRun(variant, success, latency, Math.round(tokens));
    console.log(`  ${userId}: routed to ${variant} (${success ? "✓" : "✗"})`);
  }

  const metrics = router.getMetrics();
  console.log("\nA/B Test Metrics:");
  console.log("  Control:", {
    runs: metrics.control.totalRuns,
    successRate: (metrics.control.successCount / Math.max(1, metrics.control.totalRuns) * 100).toFixed(1) + "%",
    avgLatency: metrics.control.avgLatencyMs.toFixed(0) + "ms",
  });
  console.log("  Variant:", {
    runs: metrics.variant.totalRuns,
    successRate: (metrics.variant.successCount / Math.max(1, metrics.variant.totalRuns) * 100).toFixed(1) + "%",
    avgLatency: metrics.variant.avgLatencyMs.toFixed(0) + "ms",
  });

  console.log("\nShould rollback?", router.shouldAutoRollback());
}

main().catch(console.error);
