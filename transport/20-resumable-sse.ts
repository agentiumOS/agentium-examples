/**
 * Resumable SSE + graceful drain.
 *
 * Each agent run writes events to an `InMemoryEventLog`. Clients reconnect with
 * the `Last-Event-ID` header and get any events they missed - good for flaky
 * mobile networks and proxies that drop idle connections.
 *
 * `DrainController.requestDrain()` cooperatively stops in-flight work so
 * Kubernetes can roll-restart pods without losing partial output.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/transport/20-resumable-sse.ts
 */

import { Agent, DrainController, openai } from "@agentium/core";
import { defaultEventLog, formatSSEEvent } from "@agentium/transport";
import express from "express";

const agent = new Agent({
  name: "resumable",
  model: openai("gpt-4o-mini"),
  instructions: "Tell a short story when asked.",
});

// One global drain controller for the process.
const drain = new DrainController();
process.on("SIGTERM", () => drain.requestDrain());

const app = express();
app.use(express.json());

app.post("/run", async (req, res) => {
  const runId = req.body.runId ?? `run-${Date.now()}`;
  const lastSeen = Number(req.header("last-event-id") ?? "0");

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  // Replay missed events.
  for (const ev of defaultEventLog.since(runId, lastSeen)) {
    res.write(formatSSEEvent(ev));
  }

  // Stream new chunks, recording each into the event log so the next reconnect
  // can resume from this point.
  for await (const chunk of agent.stream(req.body.input)) {
    if (drain.drained) break; // honor SIGTERM
    const ev = defaultEventLog.record(runId, { payload: chunk });
    res.write(formatSSEEvent(ev));
  }
  defaultEventLog.finalize(runId);
  res.write("data: [DONE]\n\n");
  res.end();
});

app.listen(3000, () => {
  console.log("Resumable SSE endpoint:  POST /run");
  console.log("Reconnect example:");
  console.log("  curl -N -H 'last-event-id: 3' -X POST localhost:3000/run \\");
  console.log("    -H 'content-type: application/json' -d '{\"input\":\"hi\",\"runId\":\"r1\"}'");
});
