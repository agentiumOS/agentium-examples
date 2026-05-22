/**
 * ComputerUseAgent - Claude's `computer_20251124` tool with full agent loop.
 *
 * The agent receives screenshots and returns desktop actions (mouse / keyboard
 * / zoom); your `ComputerExecutor` performs them and returns the next
 * screenshot. The loop continues until Claude returns a final text turn.
 *
 * The executor is pluggable - point it at any backend:
 *   - local desktop via screencapture + xdotool
 *   - remote VNC
 *   - sandboxed Linux (compose with SandboxAgent)
 *
 * Setup:
 *   npm install @anthropic-ai/sdk
 *   export ANTHROPIC_API_KEY=...
 *
 * Run:
 *   npx tsx examples/agents/06-computer-use.ts
 */

import { ComputerUseAgent, type ComputerExecutor } from "@agentium/core";

// Minimal stub executor - replace with a real screen + input driver.
const executor: ComputerExecutor = {
  displayWidth: 1280,
  displayHeight: 800,
  execute: async (action) => {
    console.log(`  -> action: ${action.action}`, JSON.stringify(action).slice(0, 200));
    // Return a placeholder 1x1 black PNG so the loop has something to feed back.
    return {
      output: `executed ${action.action}`,
      screenshotBase64:
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
    };
  },
};

const agent = new ComputerUseAgent({
  model: "claude-sonnet-4-20250514",
  executor,
  enableZoom: true,
  maxIterations: 10,
  systemPrompt: "You are operating a Linux desktop. Be concise and decisive.",
});

const result = await agent.run("Open the calculator app and compute 17 * 23.");
console.log("\nFinal answer:", result.text);
console.log(`Iterations used: ${result.iterations}`);
console.log(`Actions taken:    ${result.actions.length}`);
