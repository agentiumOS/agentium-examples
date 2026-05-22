/**
 * Smart Model Router
 *
 * Routes requests to the cheapest capable model based on complexity.
 * Simple queries go to GPT-4o-mini, complex ones to GPT-4o.
 *
 * Usage: npx tsx examples/models/smart-router.ts
 */
import { Agent, openai, ModelRouter, classifyComplexity } from "@agentium/core";

async function main() {
  const router = new ModelRouter({
    tiers: [
      { model: openai("gpt-4o-mini"), maxComplexity: 0.3 },
      { model: openai("gpt-4o"), maxComplexity: 0.7 },
    ],
    outcomeTracking: true,
    rules: [
      {
        condition: (_msgs, opts) => (opts?.tools?.length ?? 0) > 10,
        tier: 1,
      },
    ],
  });

  const agent = new Agent({
    name: "cost-efficient-agent",
    model: router,
    instructions: "You are a helpful assistant.",
  });

  const queries = [
    "What is 2 + 2?",
    "Explain quantum computing step by step, comparing different qubit architectures and their trade-offs for building fault-tolerant systems.",
    "Who wrote Hamlet?",
  ];

  for (const query of queries) {
    const complexity = classifyComplexity(
      [{ role: "user", content: query }],
    );
    const { tierIndex, model } = router.selectTier(
      [{ role: "user", content: query }],
    );

    console.log(`\nQuery: "${query.slice(0, 60)}..."`);
    console.log(`  Complexity: ${complexity.toFixed(2)} → Tier ${tierIndex} (${model.modelId})`);

    const result = await agent.run(query);
    console.log(`  Response: ${result.text.slice(0, 80)}...`);
    console.log(`  Tokens: ${result.usage.totalTokens}`);
  }

  console.log("\nOutcome stats:", router.getOutcomeStats());
}

main().catch(console.error);
