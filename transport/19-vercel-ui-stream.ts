/**
 * Vercel UI Message Stream adapter - drop-in compat with the AI SDK's `useChat`.
 *
 * `createAgentUIStreamResponse()` returns a fetch-Response whose body streams
 * UI message chunks in the protocol Vercel's React hooks already understand.
 * Works in Next.js Route Handlers, Hono, edge runtimes, or any Web-API server.
 *
 * For Express, use `pipeAgentUIStreamToResponse(agent, input, res)`.
 *
 * Run (Node 20 native fetch):
 *   OPENAI_API_KEY=sk-... npx tsx examples/transport/19-vercel-ui-stream.ts
 */

import { Agent, openai } from "@agentium/core";
import { createAgentUIStreamResponse, pipeAgentUIStreamToResponse } from "@agentium/transport";
import express from "express";

const agent = new Agent({
  name: "ui-stream-demo",
  model: openai("gpt-4o-mini"),
  instructions: "You are a friendly assistant.",
});

// ── Web / Edge runtimes (Next.js Route Handler) ───────────────────────────
//
// export async function POST(req: Request) {
//   const { input, sessionId } = await req.json();
//   return createAgentUIStreamResponse(agent, input, { sessionId });
// }
void createAgentUIStreamResponse;

// ── Express / Node ServerResponse ──────────────────────────────────────────
const app = express();
app.use(express.json());

app.post("/api/chat", async (req, res) => {
  await pipeAgentUIStreamToResponse(agent, req.body.input, res, {
    sessionId: req.body.sessionId,
  });
});

app.listen(3000, () => {
  console.log("Stream endpoint ready at POST http://localhost:3000/api/chat");
  console.log("\nWire it to the Vercel AI SDK in a Next.js app:");
  console.log(`  import { useChat } from "ai/react";`);
  console.log(`  const { messages, input, handleSubmit } = useChat({ api: "/api/chat" });`);
});
