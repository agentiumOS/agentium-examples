/**
 * AgentFactory + ScopedStorage - per-request agent construction with tenant /
 * user-scoped memory and sessions.
 *
 * Each call to `factory.create({ tenantId, userId })` returns a new Agent
 * whose memory and session storage are namespaced so two tenants on the
 * SAME inner StorageDriver never see each other's data.
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/multi-tenant/02-agent-factory.ts
 */

import express from "express";
import { AgentFactory, InMemoryStorage, openai } from "@agentium/core";

// One process-wide storage driver shared by every tenant.
const storage = new InMemoryStorage();

const factory = new AgentFactory({
  name: "assistant",
  model: openai("gpt-4o"),
  memory: { storage },
  instructions: "You are a helpful assistant scoped to one user.",
});

const app = express();
app.use(express.json());

app.post("/chat", async (req, res) => {
  // Pull scope from your auth middleware - JWT, session, etc.
  const tenantId = req.header("x-tenant") ?? "default";
  const userId = req.header("x-user-id") ?? "anonymous";

  const agent = factory.create({ tenantId, userId });
  const result = await agent.run(req.body.input, { sessionId: `${tenantId}:${userId}` });
  res.json({ text: result.text });
});

app.listen(3000, () => {
  console.log("Listening on :3000");
  console.log("Try:");
  console.log(`  curl -X POST localhost:3000/chat -H 'content-type: application/json' \\`);
  console.log(`    -H 'x-tenant: acme' -H 'x-user-id: alice' \\`);
  console.log(`    -d '{"input":"remember my favorite color is blue"}'`);
});
