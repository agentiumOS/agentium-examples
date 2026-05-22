/**
 * Example 17: A2A Server
 *
 * Exposes Agentium agents as A2A-compliant HTTP endpoints.
 * Other A2A-compatible agents (LangGraph, CrewAI, etc.) can call these agents.
 *
 * Prerequisites:
 *   export OPENAI_API_KEY=sk-...
 *
 * Usage:
 *   npx tsx examples/transport/17-a2a-server.ts
 *
 * Endpoints:
 *   GET  /.well-known/agent.json   — Agent Card (discovery)
 *   POST /                          — JSON-RPC (message/send, message/stream, tasks/get, tasks/cancel)
 */
import express from "express";
import { Agent, openai, defineTool } from "@agentium/core";
import { createA2AServer } from "@agentium/transport";
import { z } from "zod";

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Agentium — A2A Server Example         ║");
  console.log("╚════════════════════════════════════════╝\n");

  // ── Create agents ──
  const assistant = new Agent({
    name: "assistant",
    model: openai("gpt-4o"),
    instructions:
      "You are a helpful assistant. Answer questions concisely and accurately.",
    logLevel: "info",
  });

  const calculator = new Agent({
    name: "calculator",
    model: openai("gpt-4o-mini"),
    instructions: "You are a math calculator agent. Use the calculate tool for math.",
    tools: [
      defineTool({
        name: "calculate",
        description: "Evaluate a math expression",
        parameters: z.object({
          expression: z.string().describe("The math expression to evaluate"),
        }),
        execute: async (args) => {
          try {
            const result = new Function(`return (${args.expression})`)();
            return String(result);
          } catch {
            return "Error: invalid expression";
          }
        },
      }),
    ],
    logLevel: "info",
  });

  // ── Mount A2A server ──
  const app = express();

  createA2AServer(app, {
    agents: { assistant, calculator },
    basePath: "/",
    provider: {
      organization: "Agentium",
      url: "https://agentium.dev",
    },
  });

  const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3001;

  app.listen(PORT, () => {
    console.log(`\n🚀 A2A Server running at http://localhost:${PORT}`);
    console.log(`📋 Agent Card: http://localhost:${PORT}/.well-known/agent.json`);
    console.log(`📡 JSON-RPC endpoint: http://localhost:${PORT}/`);
    console.log(`\nTest with curl:`);
    console.log(`  curl http://localhost:${PORT}/.well-known/agent.json | jq .`);
    console.log(
      `  curl -X POST http://localhost:${PORT}/ \\`,
      `\n    -H "Content-Type: application/json" \\`,
      `\n    -d '{"jsonrpc":"2.0","id":1,"method":"message/send","params":{"message":{"role":"user","parts":[{"kind":"text","text":"Hello!"}]}}}'`
    );
  });
}

main().catch(console.error);
