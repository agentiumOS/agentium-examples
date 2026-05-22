import express from "express";
import { createServer } from "http";
import { Agent, openai, defineTool } from "@agentium/core";
import { createAgentRouter, requestLogger } from "@agentium/transport";
import { z } from "zod";

const weatherTool = defineTool({
  name: "getWeather",
  description: "Get weather for a city",
  parameters: z.object({ city: z.string() }),
  execute: async ({ city }) => `It is sunny and 22°C in ${city}`,
});

const assistant = new Agent({
  name: "assistant",
  model: openai("gpt-4o"),
  tools: [weatherTool],
  instructions: "You are a helpful assistant.",
});

const app = express();
app.use(express.json());
app.use(requestLogger());

app.use(
  "/api",
  createAgentRouter({
    agents: { assistant },
  })
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const httpServer = createServer(app);
httpServer.listen(3000, () => {
  console.log("Agentium server running on http://localhost:3000");
  console.log("Endpoints:");
  console.log("  POST /api/agents/assistant/run");
  console.log("  POST /api/agents/assistant/stream");
});
