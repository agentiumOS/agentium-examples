/**
 * E2B cloud sandbox toolkit - let an agent execute Python / Node / shell
 * commands in an isolated cloud VM.
 *
 * Setup:
 *   npm install @e2b/sdk
 *   export E2B_API_KEY=...   (get one at https://e2b.dev)
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/toolkits/22-sandbox-e2b.ts
 *
 * Daytona is identical - swap E2BSandboxToolkit for DaytonaSandboxToolkit.
 */

import { Agent, E2BSandboxToolkit, openai } from "@agentium/core";

const sandbox = new E2BSandboxToolkit({ template: "base", defaultTimeoutSeconds: 30 });

const agent = new Agent({
  name: "data-analyst",
  model: openai("gpt-4o"),
  tools: sandbox.getTools(),
  instructions:
    "When asked to analyze data, write Python code and run it in the sandbox. " +
    "Tools: sandbox_e2b_run, sandbox_e2b_shell, sandbox_e2b_write_file, sandbox_e2b_read_file.",
});

const result = await agent.run(
  "Compute the first 20 prime numbers and return them as a comma-separated string.",
);
console.log(result.text);

await sandbox.close();
