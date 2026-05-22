/**
 * Context Pollution Prevention
 *
 * Demonstrates the ContextCurator cleaning conversation context
 * by handling failed results, applying relevance decay, and clean-room mode.
 *
 * Usage: npx tsx examples/agents/context-curator.ts
 */
import { ContextCurator, type ChatMessage } from "@agentium/core";

function main() {
  // Build a polluted conversation
  const messages: ChatMessage[] = [
    { role: "system", content: "You are a helpful assistant." },
    { role: "user", content: "Search for Q1 revenue data" },
    {
      role: "tool",
      content: "[ERROR] Connection timeout to database server. ECONNREFUSED",
      toolCallId: "tc1",
    },
    { role: "assistant", content: "Let me try again..." },
    { role: "user", content: "Also look for marketing spend" },
    {
      role: "tool",
      content: "HTTP 500: Internal Server Error - database unavailable",
      toolCallId: "tc2",
    },
    { role: "assistant", content: "The database seems down..." },
    { role: "user", content: "Try the backup system" },
    {
      role: "tool",
      content: '{"revenue": "$2.3M", "growth": "15%"}',
      toolCallId: "tc3",
    },
    { role: "assistant", content: "Q1 revenue was $2.3M, up 15%." },
    { role: "user", content: "What were the Q4 results?" },
  ];

  console.log("Original messages:", messages.length);
  console.log();

  // Strategy 1: Deprioritize failed results
  const deprioritizer = new ContextCurator({
    enabled: true,
    failedResultHandling: "deprioritize",
    maxFailedResults: 1,
  });

  const deprioritized = deprioritizer.curate(messages, "What were the Q4 results?");
  console.log("=== Deprioritize Strategy ===");
  console.log(`Messages: ${messages.length} → ${deprioritized.length}`);
  for (const m of deprioritized) {
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    console.log(`  [${m.role}] ${text?.slice(0, 80)}`);
  }

  // Strategy 2: Summarize failed results
  console.log();
  const summarizer = new ContextCurator({
    enabled: true,
    failedResultHandling: "summarize",
  });

  const summarized = summarizer.curate(messages, "What were the Q4 results?");
  console.log("=== Summarize Strategy ===");
  console.log(`Messages: ${messages.length} → ${summarized.length}`);
  for (const m of summarized) {
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    console.log(`  [${m.role}] ${text?.slice(0, 80)}`);
  }

  // Strategy 3: Remove + Relevance Decay
  console.log();
  const remover = new ContextCurator({
    enabled: true,
    failedResultHandling: "remove",
    maxFailedResults: 0,
    relevanceDecay: {
      enabled: true,
      halfLifeTurns: 5,
      minWeight: 0.2,
    },
  });

  const cleaned = remover.curate(messages, "What were the Q4 results?");
  console.log("=== Remove + Decay Strategy ===");
  console.log(`Messages: ${messages.length} → ${cleaned.length}`);
  for (const m of cleaned) {
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    console.log(`  [${m.role}] ${text?.slice(0, 80)}`);
  }

  // Strategy 4: Clean-room mode
  console.log();
  const cleanRoom = new ContextCurator({
    enabled: true,
    cleanRoomMode: true,
    failedResultHandling: "remove",
  });

  const cleanResult = cleanRoom.curate(messages, "What were the Q4 results?");
  console.log("=== Clean-Room Mode ===");
  console.log(`Messages: ${messages.length} → ${cleanResult.length}`);
  for (const m of cleanResult) {
    const text = typeof m.content === "string" ? m.content : JSON.stringify(m.content);
    console.log(`  [${m.role}] ${text?.slice(0, 80)}`);
  }
}

main();
