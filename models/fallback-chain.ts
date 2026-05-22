/**
 * Model Fallback Chain with Circuit Breaker
 *
 * Demonstrates a 3-provider fallback chain that automatically cascades
 * through providers when failures occur, with per-provider circuit breakers.
 *
 * Usage: npx tsx examples/models/fallback-chain.ts
 */
import { Agent, openai, anthropic, google, withFallback, EventBus } from "@agentium/core";

async function main() {
  const eventBus = new EventBus();

  eventBus.on("model.fallback", ({ from, to, error }) => {
    console.log(`⚡ Fallback: ${from} → ${to} (${error})`);
  });

  eventBus.on("model.circuit.open", ({ provider, modelId }) => {
    console.log(`🔴 Circuit opened: ${provider}/${modelId}`);
  });

  const resilientModel = withFallback(
    [openai("gpt-4o"), anthropic("claude-sonnet-4-20250514"), google("gemini-2.5-flash")],
    {
      circuitBreaker: {
        failureThreshold: 3,
        cooldownMs: 30_000,
        halfOpenMaxAttempts: 1,
      },
      onFallback: (from, to, error) => {
        eventBus.emit("model.fallback", { from, to, error: String(error) });
      },
    },
  );

  const agent = new Agent({
    name: "resilient-agent",
    model: resilientModel,
    instructions: "You are a helpful assistant. Keep responses concise.",
    eventBus,
  });

  console.log("Running agent with 3-provider fallback chain...\n");

  const result = await agent.run("What is the capital of France?");
  console.log("Response:", result.text);
  console.log("Model:", result.model);
  console.log("Tokens:", result.usage.totalTokens);
}

main().catch(console.error);
