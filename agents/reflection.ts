/**
 * Self-Correcting Agent with Reflection
 *
 * Demonstrates the ReflectionManager critiquing agent outputs
 * and detecting tool call loops.
 *
 * Usage: npx tsx examples/agents/reflection.ts
 */
import { Agent, openai, ReflectionManager, EventBus } from "@agentium/core";

async function main() {
  const eventBus = new EventBus();
  const model = openai("gpt-4o");

  eventBus.on("reflection.critique", ({ pass, score, feedback }) => {
    console.log(`📝 Critique: ${pass ? "PASS" : "FAIL"} (score: ${score.toFixed(2)})`);
    if (feedback) console.log(`   Feedback: ${feedback}`);
  });

  eventBus.on("reflection.loop.escaped", ({ tool, repeatCount }) => {
    console.log(`🔄 Loop detected: ${tool} called ${repeatCount} times`);
  });

  const reflector = new ReflectionManager(
    {
      enabled: true,
      maxReflections: 2,
      loopEscapeDetection: true,
      postMortemLearning: true,
      customCriteria: "Ensure the response includes specific numbers or data points when available.",
    },
    model,
  );

  const agent = new Agent({
    name: "reflective-agent",
    model,
    instructions: "You are a research assistant. Always cite sources and be precise.",
    eventBus,
    reflection: {
      enabled: true,
      maxReflections: 2,
      loopEscapeDetection: true,
      postMortemLearning: true,
    },
  });

  console.log("Running reflective agent...\n");

  const result = await agent.run("What is the population of Tokyo?");
  console.log("\nFinal response:", result.text);

  // Demonstrate critique
  const critique = await reflector.critiqueOutput(
    result,
    "What is the population of Tokyo?",
    [],
  );
  console.log("\nCritique result:", critique);

  // Demonstrate loop detection
  const loopResult = reflector.detectLoopEscape([
    { id: "1", name: "search", arguments: { query: "tokyo population" } },
    { id: "2", name: "search", arguments: { query: "tokyo population" } },
    { id: "3", name: "search", arguments: { query: "tokyo population" } },
  ]);
  if (loopResult?.detected) {
    console.log("\nLoop escape:", loopResult.escapePrompt);
  }
}

main().catch(console.error);
