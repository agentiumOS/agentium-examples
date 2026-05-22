/**
 * Express Server with Swagger UI — Multi-model agents with auto-generated API docs.
 *
 * This example creates multiple agents using different LLM providers and
 * exposes them via Express with Swagger UI at /docs, including file upload
 * support for multi-modal inputs.
 *
 * Prerequisites:
 *   npm install express swagger-ui-express multer
 *
 * Usage:
 *   OPENAI_API_KEY=... GOOGLE_API_KEY=... npx tsx examples/transport/15-express-swagger.ts
 *
 * Then open http://localhost:3000/api/docs in your browser.
 */

import express from "express";
import { createServer } from "http";
import { Agent, openai, google, defineTool } from "@agentium/core";
import { createAgentRouter, requestLogger } from "@agentium/transport";
import { z } from "zod";

// ── Tools ─────────────────────────────────────────────────────────────────

const weatherTool = defineTool({
  name: "getWeather",
  description: "Get current weather for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async ({ city }) => `Sunny and 24°C in ${city}`,
});

const calculatorTool = defineTool({
  name: "calculate",
  description: "Evaluate a math expression",
  parameters: z.object({
    expression: z.string().describe("Math expression to evaluate"),
  }),
  execute: async ({ expression }) => {
    try {
      const result = new Function(`return (${expression})`)();
      return String(result);
    } catch {
      return "Error evaluating expression";
    }
  },
});

// ── Agents (multi-model) ──────────────────────────────────────────────────

const assistant = new Agent({
  name: "assistant",
  model: openai("gpt-4o"),
  tools: [weatherTool, calculatorTool],
  instructions: "You are a helpful assistant. You can check weather and do calculations.",
  logLevel: "info",
});

const analyst = new Agent({
  name: "analyst",
  model: openai("gpt-4o-mini"),
  instructions: "You are a data analyst. Provide concise, data-driven insights.",
  structuredOutput: z.object({
    summary: z.string(),
    keyPoints: z.array(z.string()),
    confidence: z.number().min(0).max(1),
  }),
  logLevel: "info",
});

const visionAgent = new Agent({
  name: "vision",
  model: google("gemini-2.5-flash"),
  instructions: "You are an image and audio analyzer. Describe what you see or hear in detail.",
  logLevel: "info",
});

// ── Express app ───────────────────────────────────────────────────────────

const app = express();
app.use(express.json({ limit: "50mb" }));
app.use(requestLogger());

const apiRouter = createAgentRouter({
  agents: {
    assistant,
    analyst,
    vision: visionAgent,
  },
  swagger: {
    enabled: true,
    title: "Agentium Multi-Model API",
    description: [
      "Auto-generated API for Agentium agents powered by multiple LLM providers.",
      "",
      "## Agents",
      "- **assistant** — GPT-4o with weather and calculator tools",
      "- **analyst** — GPT-4o-mini with structured JSON output",
      "- **vision** — Gemini 2.5 Flash for image and audio analysis",
      "",
      "## Multi-Modal Input",
      "Use `multipart/form-data` to upload files (images, audio) for the vision agent,",
      "or pass base64-encoded data in the JSON body.",
    ].join("\n"),
    version: "1.0.0",
    servers: [{ url: "http://localhost:3000", description: "Local dev" }],
    routePrefix: "/api",
  },
  fileUpload: {
    maxFileSize: 50 * 1024 * 1024,
    maxFiles: 5,
  },
});

app.use("/api", apiRouter);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", agents: ["assistant", "analyst", "vision"] });
});

// ── Start server ──────────────────────────────────────────────────────────

const httpServer = createServer(app);
httpServer.listen(3000, () => {
  console.log("");
  console.log("  🚀 Agentium server running on http://localhost:3000");
  console.log("");
  console.log("  📖 Swagger UI:  http://localhost:3000/api/docs");
  console.log("  📋 OpenAPI spec: http://localhost:3000/api/docs/spec.json");
  console.log("");
  console.log("  Endpoints:");
  console.log("    POST /api/agents/assistant/run     (GPT-4o + tools)");
  console.log("    POST /api/agents/assistant/stream");
  console.log("    POST /api/agents/analyst/run       (GPT-4o-mini + structured output)");
  console.log("    POST /api/agents/analyst/stream");
  console.log("    POST /api/agents/vision/run        (Gemini 2.5 Flash + file upload)");
  console.log("    POST /api/agents/vision/stream");
  console.log("");
});
