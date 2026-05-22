import { Agent, openai } from "@agentium/core";
import { AgentQueue, AgentWorker } from "@agentium/queue";

const reportAgent = new Agent({
  name: "report-gen",
  model: openai("gpt-4o"),
  instructions:
    "You generate detailed reports. Include sections, bullet points, and summaries.",
});

// --- Producer side (e.g., your API handler) ---

const queue = new AgentQueue({
  connection: { host: "localhost", port: 6379 },
});

const { jobId } = await queue.enqueueAgentRun({
  agentName: "report-gen",
  input: "Generate a Q4 2025 performance report for the engineering team.",
  priority: 1,
  attempts: 3,
});

console.log(`Job enqueued: ${jobId}`);

// --- Worker side (same or separate process) ---

const worker = new AgentWorker({
  connection: { host: "localhost", port: 6379 },
  concurrency: 3,
  agentRegistry: {
    "report-gen": reportAgent,
  },
});

worker.start();
console.log("Worker started, processing jobs...");

queue.onCompleted((id, result) => {
  console.log(`Job ${id} completed:`);
  console.log(result.text.slice(0, 200) + "...");
});

queue.onFailed((id, error) => {
  console.error(`Job ${id} failed:`, error.message);
});
