/**
 * Streaming Progress Protocol
 *
 * Demonstrates the ProgressEvent types and progress estimation
 * for real-time visibility during agent execution.
 *
 * Usage: npx tsx examples/agents/progress-stream.ts
 */
import { estimateProgress, toolResultPreview, type ProgressEvent } from "@agentium/core";

function simulateProgressStream(): ProgressEvent[] {
  return [
    { type: "run.started", runId: "run-123", agentName: "research-agent" },
    { type: "step.started", step: "llm-call-1", description: "Analyzing query" },
    { type: "thinking", content: "I need to search for the latest data on renewable energy..." },
    { type: "step.finished", step: "llm-call-1", durationMs: 1200 },
    { type: "progress", percent: 15, message: "Planning search strategy" },
    { type: "tool.executing", toolName: "web_search", args: { query: "renewable energy 2025 statistics" } },
    {
      type: "tool.completed",
      toolName: "web_search",
      durationMs: 850,
      preview: "Found 12 results. Top: 'Global renewable energy capacity reached 4,500 GW in 2025'",
    },
    { type: "progress", percent: 40, message: "Processing search results" },
    { type: "step.started", step: "llm-call-2", description: "Synthesizing findings" },
    { type: "text.delta", text: "Based on the latest data, " },
    { type: "text.delta", text: "global renewable energy capacity " },
    { type: "text.delta", text: "reached 4,500 GW in 2025..." },
    { type: "step.finished", step: "llm-call-2", durationMs: 2100 },
    { type: "intermediate.result", content: "Draft analysis of renewable energy trends compiled" },
    { type: "progress", percent: 75, message: "Finalizing report" },
    { type: "tool.executing", toolName: "format_report" },
    { type: "tool.completed", toolName: "format_report", durationMs: 120, preview: "Report formatted with 5 sections" },
    { type: "progress", percent: 95, message: "Final review" },
    { type: "run.finished", runId: "run-123", durationMs: 4500, tokenCount: 2800 },
  ];
}

function main() {
  console.log("=== Progress Stream Simulation ===\n");

  const events = simulateProgressStream();
  let streamedText = "";

  for (const event of events) {
    switch (event.type) {
      case "run.started":
        console.log(`🚀 Run started: ${event.agentName} (${event.runId})`);
        break;
      case "step.started":
        console.log(`  📋 Step: ${event.step}${event.description ? ` - ${event.description}` : ""}`);
        break;
      case "step.finished":
        console.log(`  ✅ Step done: ${event.step} (${event.durationMs}ms)`);
        break;
      case "thinking":
        console.log(`  💭 ${event.content.slice(0, 60)}...`);
        break;
      case "tool.executing":
        console.log(`  🔧 Executing: ${event.toolName}`);
        break;
      case "tool.completed":
        console.log(`  ✅ ${event.toolName} (${event.durationMs}ms): ${event.preview}`);
        break;
      case "progress":
        const bar = "█".repeat(Math.round(event.percent / 5)) + "░".repeat(20 - Math.round(event.percent / 5));
        console.log(`  [${bar}] ${event.percent}% ${event.message ?? ""}`);
        break;
      case "text.delta":
        streamedText += event.text;
        break;
      case "intermediate.result":
        console.log(`  📄 Intermediate: ${event.content}`);
        break;
      case "run.finished":
        console.log(`\n🏁 Run finished: ${event.durationMs}ms, ${event.tokenCount} tokens`);
        break;
    }
  }

  console.log(`\nStreamed text: "${streamedText}"`);

  // Demonstrate progress estimation
  console.log("\n=== Progress Estimation ===");
  for (let i = 0; i <= 10; i++) {
    const pctLlm = estimateProgress(i, 10, "llm");
    const pctTools = estimateProgress(i, 10, "tools");
    console.log(`  Round ${i}/10: LLM=${pctLlm}%, Tools=${pctTools}%`);
  }

  // Demonstrate tool result preview
  console.log("\n=== Tool Result Preview ===");
  const longResult = '{"results": [' + Array(50).fill('{"id": 1, "title": "Test item", "status": "active"}').join(",") + "]}";
  console.log(`  Full length: ${longResult.length} chars`);
  console.log(`  Preview: "${toolResultPreview(longResult)}"`);
}

main();
