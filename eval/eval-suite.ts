/**
 * Eval Framework — Automated agent quality testing.
 *
 * Defines test cases and scorers, then evaluates the agent's output quality.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/eval/eval-suite.ts
 */

import { Agent, openai } from "@agentium/core";
import { EvalSuite, contains, regexMatch, custom, ConsoleReporter } from "@agentium/eval";

const agent = new Agent({
  name: "eval-target",
  model: openai("gpt-4o-mini"),
  instructions: "You are a helpful assistant. Be factual and concise.",
});

const suite = new EvalSuite({
  name: "Basic Quality Suite",
  agent,
  cases: [
    {
      name: "Capital of France",
      input: "What is the capital of France?",
      expected: "Paris",
    },
    {
      name: "Simple math",
      input: "What is 15 * 7?",
      expected: "105",
    },
    {
      name: "Programming language",
      input: "What programming language is TypeScript based on?",
      expected: "JavaScript",
    },
  ],
  scorers: [
    contains("Paris"),
    regexMatch(/\d+/),
    custom("non-empty", async (_input, output) => {
      const pass = output.text.length > 10;
      return { score: pass ? 1 : 0, pass, reason: pass ? undefined : "Response too short" };
    }),
  ],
  threshold: 0.5,
  concurrency: 2,
});

console.log("Running eval suite...\n");

const result = await suite.run([new ConsoleReporter()]);

console.log(`\nOverall: ${result.passed}/${result.total} passed (${(result.averageScore * 100).toFixed(1)}% avg score)`);

process.exit(result.failed > 0 ? 1 : 0);
