/**
 * Agent Handoff — Transfer conversations to specialist agents mid-conversation.
 *
 * The main agent detects when a user needs billing or technical help and
 * hands off to the appropriate specialist. Context carries over automatically.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/handoff/agent-handoff.ts
 */

import { Agent, openai, defineTool } from "@agentium/core";
import { z } from "zod";

const billingAgent = new Agent({
  name: "billing",
  model: openai("gpt-4o-mini"),
  instructions:
    "You are a billing specialist. Help users with invoices, payments, and subscription issues. Be precise with numbers.",
  tools: [
    defineTool({
      name: "get_invoice",
      description: "Look up an invoice by user ID",
      parameters: z.object({ userId: z.string() }),
      execute: async ({ userId }) =>
        `Invoice for ${userId}: $49.99/month, next billing date: March 15, 2026`,
    }),
  ],
});

const techAgent = new Agent({
  name: "tech-support",
  model: openai("gpt-4o-mini"),
  instructions:
    "You are a technical support engineer. Help users debug issues, configure settings, and resolve errors.",
});

const frontDesk = new Agent({
  name: "front-desk",
  model: openai("gpt-4o"),
  instructions: `You are the front desk agent. Greet the user and figure out what they need.
If they have billing or payment questions, transfer to the billing agent.
If they have technical issues, transfer to the tech-support agent.
Otherwise, answer their question directly.`,
  handoff: {
    targets: [
      { agent: billingAgent, description: "Billing, invoices, payments, subscriptions" },
      { agent: techAgent, description: "Technical support, debugging, configuration" },
    ],
    maxHandoffs: 3,
  },
  logLevel: "info",
});

// Listen for handoff events
frontDesk.eventBus.on("handoff.transfer" as any, (data: any) => {
  console.log(`\n  [Handoff] ${data.fromAgent} → ${data.toAgent} (${data.reason})\n`);
});

console.log("=== Agent Handoff Demo ===\n");

console.log("--- Question 1: Billing ---");
const r1 = await frontDesk.run("Hi, I need to know my next invoice amount. My user ID is user-42.");
console.log("Response:", r1.text);

console.log("\n--- Question 2: Tech Support ---");
const r2 = await frontDesk.run("My API is returning 502 errors since this morning.");
console.log("Response:", r2.text);

console.log("\n--- Question 3: General (no handoff) ---");
const r3 = await frontDesk.run("What are your business hours?");
console.log("Response:", r3.text);

process.exit(0);
