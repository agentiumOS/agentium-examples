/**
 * Scheduled Agent with Cron
 *
 * Recurring runs are repeatable queue jobs: the producer registers a cron
 * pattern, a worker picks the runs up. The schedule lives in Redis, so
 * restarting either process does not lose it.
 *
 * Requires a Redis instance on localhost:6379.
 *
 * Usage: npx tsx examples/scheduling/cron-agent.ts
 */
import { Agent, openai } from "@agentium/core";
import { AgentQueue, AgentWorker } from "@agentium/queue";

const reportAgent = new Agent({
  name: "report-agent",
  model: openai("gpt-4o-mini"),
  instructions: "You generate concise status reports.",
});

const connection = { host: "localhost", port: 6379 };

// --- Producer side: register the schedules ---

const queue = new AgentQueue({ connection, queueName: "scheduled-runs" });

await queue.schedule({
  id: "status-check",
  cron: "*/5 * * * *",
  agent: { name: "report-agent", input: "Generate a brief system status check." },
});

await queue.schedule({
  id: "daily-report",
  cron: "0 9 * * *",
  timezone: "Asia/Kolkata",
  agent: {
    name: "report-agent",
    input: "Generate the daily report.",
    // Same sessionId on every run, so the agent sees yesterday's report
    // in its history and can write "unchanged since yesterday".
    sessionId: "daily-report",
  },
});

console.log("Active schedules:");
for (const s of await queue.listSchedules()) {
  console.log(`  ${s.id}: ${s.pattern} (next: ${s.next.toISOString()})`);
}

queue.onCompleted((id, result) => {
  console.log(`Job ${id} completed: ${result.text.slice(0, 120)}...`);
});

queue.onFailed((id, error) => {
  console.error(`Job ${id} failed:`, error.message);
});

// --- Worker side: this is what actually runs the agent ---

const worker = new AgentWorker({
  connection,
  queueName: "scheduled-runs",
  agentRegistry: { "report-agent": reportAgent },
});

worker.start();
console.log("Worker started. Waiting for the next cron tick...");

process.on("SIGINT", async () => {
  await queue.unschedule("status-check");
  await queue.unschedule("daily-report");
  await worker.stop();
  await queue.close();
  process.exit(0);
});
