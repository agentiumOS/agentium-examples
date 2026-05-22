/**
 * Webhooks — Push agent events to external destinations.
 *
 * Shows how to configure HTTP, Slack, and custom webhook destinations.
 * Events flow automatically from the agent's EventBus.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/webhooks/webhook-destinations.ts
 */

import { Agent, openai, httpWebhook, type WebhookDestination } from "@agentium/core";

// Custom in-process destination for demo purposes
function consoleWebhook(): WebhookDestination {
  return {
    name: "console",
    async send(event: string, payload: unknown) {
      const p = payload as Record<string, unknown>;
      console.log(`  [Webhook] ${event} | agent=${p.agentName ?? "?"} | run=${(p.runId as string)?.slice(0, 8) ?? "?"}`);
    },
  };
}

const agent = new Agent({
  name: "assistant",
  model: openai("gpt-4o-mini"),
  instructions: "You are a helpful assistant.",
  webhooks: {
    destinations: [
      consoleWebhook(),
      // Uncomment to send to a real HTTP endpoint:
      // httpWebhook({ url: "https://your-webhook.example.com/events", secret: "my-secret" }),
      // Uncomment to send to Slack:
      // slackWebhook({ webhookUrl: "https://hooks.slack.com/services/T.../B.../..." }),
    ],
    events: ["run.start", "run.complete", "run.error", "tool.call"],
  },
  logLevel: "info",
});

console.log("=== Webhook Demo ===\n");

const r1 = await agent.run("What is 2 + 2?");
console.log("\nResponse:", r1.text);

// Give webhooks time to fire
await new Promise((r) => setTimeout(r, 200));

process.exit(0);
