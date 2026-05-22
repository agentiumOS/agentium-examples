/**
 * Conversational Testing with Synthetic Users
 *
 * Demonstrates multi-turn conversation testing using synthetic user personas,
 * trajectory scoring, and agent comparison.
 *
 * Usage: npx tsx examples/eval/conversational-test.ts
 */
import { Agent, openai } from "@agentium/core";
import { ConversationSuite, ConversationRunner, scoreTrajectory } from "@agentium/eval";

async function main() {
  const model = openai("gpt-4o-mini");

  const agent = new Agent({
    name: "support-agent",
    model: openai("gpt-4o"),
    instructions: `You are a customer support agent for a SaaS product.
You can help with password resets, billing questions, and feature requests.
Always be helpful and empathetic.`,
  });

  // Define test scenarios
  const suite = new ConversationSuite(
    {
      name: "Customer Support Scenarios",
      scenarios: [
        {
          name: "Password Reset - Happy Path",
          persona: {
            name: "Jane",
            description: "A non-technical user who is locked out of her account",
            goal: "Get instructions for resetting her password",
            maxTurns: 8,
          },
          initialMessage: "Hi, I can't log in to my account. I think I forgot my password.",
          successCriteria: "The agent provides clear password reset instructions",
          expectedTrajectory: {
            forbiddenTools: ["delete_account"],
            maxToolCalls: 5,
          },
        },
        {
          name: "Billing Question - Upgrade",
          persona: {
            name: "Mike",
            description: "A startup CTO evaluating enterprise plans",
            goal: "Understand enterprise pricing and get a comparison with the current plan",
            maxTurns: 6,
          },
          initialMessage: "We're on the Pro plan. What does Enterprise include? What's the price difference?",
          successCriteria: "The agent explains enterprise features and pricing",
        },
      ],
      concurrency: 1,
      timeoutMs: 120_000,
    },
    model,
  );

  console.log("Running conversational test suite...\n");
  const results = await suite.run(agent);

  console.log(`\n=== Results: ${results.name} ===`);
  console.log(`Passed: ${results.passed}/${results.total}`);
  console.log(`Average turns: ${results.averageTurns.toFixed(1)}`);
  console.log(`Duration: ${(results.durationMs / 1000).toFixed(1)}s\n`);

  for (const result of results.results) {
    console.log(`Scenario: ${result.caseName}`);
    console.log(`  Pass: ${result.pass ? "✓" : "✗"}`);
    console.log(`  Turns: ${result.turnCount}`);
    console.log(`  Duration: ${(result.durationMs / 1000).toFixed(1)}s`);
    if (result.trajectoryMatch) {
      console.log(`  Trajectory: ${result.trajectoryMatch.pass ? "✓" : "✗"} - ${result.trajectoryMatch.details}`);
    }
    if (result.error) {
      console.log(`  Error: ${result.error}`);
    }
    console.log();
  }

  // Demonstrate standalone trajectory scoring
  console.log("=== Standalone Trajectory Scoring ===");
  const trajectory = scoreTrajectory(
    [
      { role: "user", content: "Reset my password" },
      { role: "assistant", content: "Let me help", toolCalls: ["search_user", "send_reset_email"] },
      { role: "user", content: "Thanks!" },
    ],
    {
      requiredTools: ["send_reset_email"],
      forbiddenTools: ["delete_account"],
      maxToolCalls: 5,
    },
  );
  console.log("Trajectory:", trajectory);
}

main().catch(console.error);
