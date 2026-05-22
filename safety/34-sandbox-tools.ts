/**
 * Example 34 — Sandbox Execution
 *
 * Demonstrates running tools in isolated subprocesses with timeout and memory limits.
 * Sandbox is fully optional and off by default.
 */

import { Agent, openai, defineTool } from "@agentium/core";
import { z } from "zod";

const safeMathTool = defineTool({
  name: "calculate",
  description: "Evaluate a math expression safely in a sandbox",
  parameters: z.object({ expression: z.string() }),
  execute: async ({ expression }) => {
    const result = new Function(`return (${expression})`)();
    return `Result: ${result}`;
  },
  sandbox: {
    timeout: 5_000,
    maxMemoryMB: 64,
    allowNetwork: false,
    allowFS: false,
  },
});

const unsandboxedTool = defineTool({
  name: "getTime",
  description: "Get the current time (runs normally, no sandbox)",
  parameters: z.object({}),
  execute: async () => {
    return `Current time: ${new Date().toISOString()}`;
  },
  sandbox: false,
});

const slowTool = defineTool({
  name: "slowTask",
  description: "A task that takes too long and gets killed by the sandbox timeout",
  parameters: z.object({}),
  execute: async () => {
    await new Promise((r) => setTimeout(r, 60_000));
    return "This should never return";
  },
  sandbox: { timeout: 3_000 },
});

async function main() {
  // --- Per-tool sandbox ---
  console.log("=== Per-tool sandbox ===\n");

  const agent = new Agent({
    name: "SandboxDemo",
    model: openai("gpt-4o-mini"),
    tools: [safeMathTool, unsandboxedTool, slowTool],
    instructions:
      "You are a helpful assistant. Use the calculate tool for math, getTime for the current time.",
  });

  console.log("Asking agent to calculate 2 + 2...");
  const out1 = await agent.run("What is 2 + 2?");
  console.log("Response:", out1.text);
  console.log();

  console.log("Asking for current time (unsandboxed)...");
  const out2 = await agent.run("What time is it?");
  console.log("Response:", out2.text);
  console.log();

  // --- Agent-level sandbox (all tools sandboxed by default) ---
  console.log("=== Agent-level sandbox ===\n");

  const agentWithGlobalSandbox = new Agent({
    name: "GlobalSandbox",
    model: openai("gpt-4o-mini"),
    tools: [safeMathTool, unsandboxedTool],
    sandbox: {
      timeout: 10_000,
      maxMemoryMB: 128,
    },
    instructions:
      "You are a helpful assistant. Use calculate for math and getTime for time. " +
      "Note: getTime has sandbox: false so it opts out of the agent-level sandbox.",
  });

  console.log("Asking agent (agent-level sandbox) to calculate 10 * 5...");
  const out3 = await agentWithGlobalSandbox.run("What is 10 * 5?");
  console.log("Response:", out3.text);
  console.log();

  console.log("Done!");
}

main().catch(console.error);
