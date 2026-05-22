/**
 * Example 35 — Human-in-the-Loop (HITL)
 *
 * Demonstrates requiring human approval before executing sensitive tools.
 * Uses CLI readline for the approval callback.
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { Agent, openai, defineTool } from "@agentium/core";
import type { ApprovalRequest } from "@agentium/core";
import { z } from "zod";

const rl = readline.createInterface({ input: stdin, output: stdout });

const readFileTool = defineTool({
  name: "readFile",
  description: "Read a file from disk",
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }) => {
    const fs = await import("node:fs/promises");
    return await fs.readFile(path, "utf-8");
  },
});

const deleteFileTool = defineTool({
  name: "deleteFile",
  description: "Delete a file from disk",
  parameters: z.object({ path: z.string() }),
  execute: async ({ path }) => {
    const fs = await import("node:fs/promises");
    await fs.unlink(path);
    return `Deleted ${path}`;
  },
  requiresApproval: true,
});

const sendEmailTool = defineTool({
  name: "sendEmail",
  description: "Send an email",
  parameters: z.object({
    to: z.string(),
    subject: z.string(),
    body: z.string(),
  }),
  execute: async ({ to, subject }) => {
    return `[simulated] Email sent to ${to}: "${subject}"`;
  },
  requiresApproval: (args) => {
    const to = args.to as string;
    return !to.endsWith("@internal.com");
  },
});

async function askHuman(request: ApprovalRequest) {
  console.log("\n╔══════════════════════════════════════════╗");
  console.log("║        🛡️  APPROVAL REQUIRED             ║");
  console.log("╠══════════════════════════════════════════╣");
  console.log(`║ Tool:  ${request.toolName}`);
  console.log(`║ Args:  ${JSON.stringify(request.args, null, 2)}`);
  console.log("╚══════════════════════════════════════════╝");

  const answer = await rl.question("\nApprove this tool call? (y/n): ");
  return {
    approved: answer.trim().toLowerCase() === "y",
    reason: answer.trim().toLowerCase() === "y" ? "Approved by user" : "Denied by user",
  };
}

async function main() {
  console.log("=== Human-in-the-Loop Demo ===\n");
  console.log("The agent has 3 tools:");
  console.log("  - readFile       → auto-approved (no approval needed)");
  console.log("  - deleteFile     → always requires approval");
  console.log("  - sendEmail      → requires approval for external emails\n");

  const agent = new Agent({
    name: "HITL-Agent",
    model: openai("gpt-4o-mini"),
    tools: [readFileTool, deleteFileTool, sendEmailTool],
    instructions:
      "You are a helpful assistant that can read files, delete files, and send emails. " +
      "Always confirm what you did after using a tool.",
    approval: {
      policy: ["deleteFile", "sendEmail"],
      onApproval: askHuman,
      timeout: 60_000,
    },
  });

  // Listen to approval events for observability
  agent.eventBus.on("tool.approval.request", (req) => {
    console.log(`\n[event] Approval requested for "${req.toolName}" (id: ${req.requestId})`);
  });
  agent.eventBus.on("tool.approval.response", (res) => {
    console.log(`[event] Approval ${res.approved ? "GRANTED" : "DENIED"} (id: ${res.requestId})`);
  });

  // Test 1: readFile — no approval needed
  console.log("\n--- Test 1: Read package.json (no approval needed) ---");
  const out1 = await agent.run("Read the file package.json and tell me the project name.");
  console.log("\nAgent:", out1.text);

  // Test 2: deleteFile — always requires approval
  console.log("\n--- Test 2: Delete a file (requires approval) ---");
  const out2 = await agent.run("Delete the file /tmp/test-hitl-delete.txt");
  console.log("\nAgent:", out2.text);

  // Test 3: sendEmail — conditional approval
  console.log("\n--- Test 3: Send email to external address (requires approval) ---");
  const out3 = await agent.run("Send an email to alice@example.com with subject 'Hello' and body 'Testing HITL'");
  console.log("\nAgent:", out3.text);

  rl.close();
  console.log("\nDone!");
}

main().catch((err) => {
  console.error(err);
  rl.close();
});
