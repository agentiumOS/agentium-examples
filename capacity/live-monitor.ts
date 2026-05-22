/**
 * Live Capacity Monitor — connects a real agent to the capacity planning system.
 *
 * Sends varied workloads across multiple sessions, then prints a real-time
 * capacity report showing how observed token usage maps to theoretical
 * GPU/KV requirements for Llama 3.1 70B.
 *
 * The agent runs on OpenAI (gpt-4o-mini) for reliable connectivity, while
 * the capacity analysis models Llama 3.1 70B on 8× H100 — showing what
 * the observed workload would look like on self-hosted infrastructure.
 *
 * To switch to a live vLLM endpoint, set:
 *   VLLM_BASE_URL=https://your-vllm-endpoint/v1
 *   VLLM_API_KEY=your-key
 *   VLLM_MODEL=meta-llama/Llama-3.1-70B-Instruct-AWQ-4bit
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/capacity/live-monitor.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  Agent,
  openai,
  EventBus,
  SessionProfiler,
  planCapacity,
  kvBytesPerToken,
  ttftBreachPoint,
  singlePrefillMs,
  DEFAULT_GPU_SPECS,
} from "@agentium/core";
import type { ModelArchitecture, HardwareConfig } from "@agentium/core";
import { MetricsExporter } from "@agentium/observability";

// ── Load .env ───────────────────────────────────────────────────────────────
try {
  const envPath = resolve(import.meta.dirname ?? ".", "../../.env");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^(\w+)\s*=\s*"?(.+?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

// ── Model architecture for capacity analysis (Llama 3.1 70B AWQ) ────────────
const llama70bAwq: ModelArchitecture = {
  id: "llama-3.1-70b-awq-int4",
  displayName: "Llama 3.1 70B Instruct (AWQ-4bit)",
  family: "llama",
  params: "70B",
  layers: 80,
  attentionHeads: 64,
  kvHeads: 8,
  headDim: 128,
  hiddenDim: 8192,
  ffnDim: 28672,
  maxContext: 65536,
  attentionType: "gqa",
  weightSizeBf16Gb: 140,
};

// ── Hardware config (8× RTX A5000, matching the deployment) ──────────
const hw: HardwareConfig = {
  gpu: DEFAULT_GPU_SPECS["rtx-a5000"],
  gpuCount: 8,
  nandPerGpuGb: 0,
  nandBandwidthGBs: 7,
};

// ── vLLM connection ─────────────────────────────────────────────────────────
const VLLM_BASE_URL = process.env.VLLM_BASE_URL ?? "https://add-valid-url/v1";
const VLLM_API_KEY = process.env.VLLM_API_KEY ?? "zbl-90307e4f19b62d958ce14d2101ec9d1230d9a8393b6b812c";
const modelId = process.env.VLLM_MODEL ?? "meta-llama/Llama-3.1-70B-Instruct-AWQ-4bit";
const modelProvider = openai(modelId, { apiKey: VLLM_API_KEY, baseURL: VLLM_BASE_URL });
const providerLabel = `vLLM (${modelId})`;

// ── Event bus + Tier 2 profiler ─────────────────────────────────────────────
const eventBus = new EventBus();

const profiler = new SessionProfiler({
  modelArch: llama70bAwq,
  kvWarningThresholdGb: 200,
});
profiler.attach(eventBus);

const metrics = new MetricsExporter();
metrics.attach(eventBus);

eventBus.on("capacity.session.classified", (data) => {
  console.log(`  📊 Session ${data.sessionId} → ${data.category} (${data.totalTokens.toLocaleString()} tokens)`);
});

eventBus.on("capacity.warning", (data) => {
  console.log(`  ⚠️  ${data.message}`);
});

// ── Create agent ────────────────────────────────────────────────────────────
const agent = new Agent({
  name: "capacity-demo",
  model: modelProvider,
  instructions: "You are a helpful assistant. Be concise but thorough.",
  eventBus,
});

// ── Workload sessions ───────────────────────────────────────────────────────
const sessions = [
  {
    id: "light-1",
    label: "Light — quick Q&A",
    messages: ["What is the capital of France?", "Thanks!"],
  },
  {
    id: "light-2",
    label: "Light — simple lookup",
    messages: ["What year was Python created?"],
  },
  {
    id: "medium-1",
    label: "Medium — multi-turn explanation",
    messages: [
      "Explain how a transformer attention mechanism works step by step.",
      "Now explain grouped query attention and why it reduces KV cache size.",
      "How does this relate to inference cost?",
    ],
  },
  {
    id: "heavy-1",
    label: "Heavy — deep technical analysis",
    messages: [
      "Write a detailed analysis of GPU memory hierarchy for LLM inference. Cover HBM, NAND SSD offloading, and the bandwidth bottleneck. Include specific numbers for H100.",
      "Now compare the economics: pure GPU scaling vs GPU+NAND hybrid for serving 200 concurrent users with Llama 70B.",
      "What are the latency implications? Model both TPOT and TTFT under load.",
      "Summarize with a recommendation table.",
    ],
  },
];

// ── Run all sessions ────────────────────────────────────────────────────────
console.log("╔══════════════════════════════════════════════════════════╗");
console.log("║         Live Capacity Monitor — Agentium                 ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");
console.log(`Live model:      ${providerLabel}`);
console.log(`Capacity model:  ${llama70bAwq.displayName}`);
console.log(`Hardware target:  ${hw.gpuCount}× ${hw.gpu.name}\n`);

for (const sess of sessions) {
  console.log(`\n─── ${sess.label} (session: ${sess.id}) ───`);
  for (const msg of sess.messages) {
    const start = Date.now();
    try {
      const result = await agent.run(msg, { sessionId: sess.id });
      const elapsed = Date.now() - start;
      const tokens = result.usage?.totalTokens ?? 0;
      console.log(`  ✓ ${msg.slice(0, 60)}${msg.length > 60 ? "..." : ""}`);
      console.log(`    → ${tokens} tokens, ${elapsed}ms, TTFT: ${result.metrics?.timeToFirstTokenMs ?? "—"}ms`);
      console.log(`    → ${(result.text ?? "").slice(0, 100)}...`);
    } catch (err: any) {
      console.log(`  ✗ ${msg.slice(0, 60)}${msg.length > 60 ? "..." : ""} — ${err.message}`);
    }
  }
}

// ── Capacity report ─────────────────────────────────────────────────────────
const stats = profiler.getSessionStats();
const mix = profiler.getWorkloadMix();
const plan = planCapacity(llama70bAwq, hw, mix, "fp8", "int4");
const bpt = kvBytesPerToken(llama70bAwq, "fp8");
const breach = ttftBreachPoint(llama70bAwq, hw, 5000, 4096);
const prefill = singlePrefillMs(llama70bAwq, 4096, hw);

console.log("\n\n╔══════════════════════════════════════════════════════════╗");
console.log("║              LIVE CAPACITY REPORT                       ║");
console.log("╚══════════════════════════════════════════════════════════╝\n");

console.log("── Observed Workload ──────────────────────────────────────");
console.log(`  Sessions:           ${Object.entries(stats.byCategory).map(([k, v]) => `${k}=${v}`).join(", ")}`);
console.log(`  Total tokens:       ${stats.totalTokens.toLocaleString()}`);
console.log(`  Avg tokens/session: ${stats.avgTokensPerSession.toLocaleString()}`);
console.log(`  Estimated KV (bf16):${stats.estimatedKvGb.toFixed(3)} GB`);
console.log(`  KV bytes/token:     ${bpt.toLocaleString()} bytes (fp8)`);

console.log(`\n── Theoretical Capacity (${hw.gpuCount}× ${hw.gpu.name}) ──────────────`);
console.log(`  Total HBM:          ${plan.totalHbmGb} GB`);
console.log(`  Weight memory:      ${plan.weightMemoryGb} GB (int4 AWQ)`);
console.log(`  Free for KV:        ${plan.freeHbmForKvGb} GB`);
console.log(`  HBM slots:          ${plan.hbmSlots}`);
console.log(`  NAND slots:         ${plan.nandSlots}`);
console.log(`  Total sessions:     ${plan.totalSessions}`);

console.log("\n── Latency Estimates ──────────────────────────────────────");
console.log(`  Single prefill:     ${prefill.toFixed(1)}ms (4K context)`);
console.log(`  TPOT:               ${plan.tpotMs.toFixed(2)}ms`);
console.log(`  TTFT (1 user):      ${plan.ttftMs.toFixed(1)}ms`);
console.log(`  TTFT breach point:  ${breach} concurrent users (5s SLA)`);

console.log("\n── Cost ──────────────────────────────────────────────────");
console.log(`  Monthly GPU cost:   $${plan.monthlyGpuCostUsd.toLocaleString(undefined, { maximumFractionDigits: 0 })}`);
if (plan.totalSessions > 0) {
  const perSlotDay = plan.monthlyGpuCostUsd / plan.totalSessions / 30;
  console.log(`  Per slot/day:       $${perSlotDay.toFixed(2)} (${plan.totalSessions} slots)`);
}
if (stats.totalTokens > 0) {
  const tokensPerMonth = stats.totalTokens * (30 * 24 * 60 / 30);
  const costPer1k = (plan.monthlyGpuCostUsd / tokensPerMonth) * 1000;
  console.log(`  Est. cost/1K tok:   $${costPer1k.toFixed(4)} (self-hosted)`);
}
const runsCount = stats.totalTokens > 0 ? Object.values(stats.byCategory).reduce((a, b) => a + b, 0) : 0;
if (runsCount > 0) {
  const avgTokensPerRun = stats.totalTokens / runsCount;
  const tokensPerMonth = stats.totalTokens * (30 * 24 * 60 / 30);
  const costPerInteraction = (plan.monthlyGpuCostUsd / tokensPerMonth) * avgTokensPerRun;
  console.log(`  Est. cost/interact: $${costPerInteraction.toFixed(4)} (avg ${stats.avgTokensPerSession.toLocaleString()} tok/session)`);
}

console.log("\n── Headroom Check ────────────────────────────────────────");
const currentSessions = Object.values(stats.byCategory).reduce((a, b) => a + b, 0);
const headroom = plan.hbmSlots - currentSessions;
if (headroom > 0) {
  console.log(`  ✓ ${headroom} more sessions can fit in HBM (${currentSessions}/${plan.hbmSlots} used)`);
} else {
  console.log(`  ✗ HBM at capacity — ${currentSessions} sessions, only ${plan.hbmSlots} slots`);
}

if (currentSessions < breach) {
  console.log(`  ✓ TTFT safe — ${currentSessions} users well below ${breach}-user breach point`);
} else {
  console.log(`  ✗ TTFT breach — ${currentSessions} users exceeds ${breach}-user limit`);
}

// ── Prometheus metrics ──────────────────────────────────────────────────────
console.log("\n── Prometheus Metrics ─────────────────────────────────────");
console.log(metrics.toPrometheus());

process.exit(0);
