/**
 * Tool loop detection (DebounceHook).
 *
 * Detects when the LLM calls the same tool with identical arguments more
 * than `maxRepeats` times within a single run. Action options:
 *
 *   - `"abort"` raises a ToolLoopError and stops the run
 *   - `"hint"`  returns a synthetic message reminding the model to try
 *               a different approach
 *
 * Useful as a backstop against agents that get stuck in retry loops.
 *
 * Run:
 *   npx tsx examples/agents/10-debounce-loops.ts
 */

import { defineTool, ToolExecutor, ToolLoopError } from "@agentium/core";
import { z } from "zod";
import { RunContext } from "@agentium/core";
import { EventBus } from "@agentium/core";

const echo = defineTool({
  name: "echo",
  description: "Echo input back",
  parameters: z.object({ q: z.string() }),
  execute: async ({ q }) => `echo: ${q}`,
});

// ── Variant 1: abort on loop ──────────────────────────────────────────────
const aborter = new ToolExecutor([echo], {
  loopDetection: { maxRepeats: 2, action: "abort" },
});

const ctx = new RunContext({ sessionId: "s1", eventBus: new EventBus() });

try {
  for (let i = 0; i < 5; i++) {
    await aborter.executeAll([{ id: `c${i}`, name: "echo", arguments: { q: "hello" } }], ctx);
  }
} catch (err) {
  if (err instanceof ToolLoopError) {
    console.log(`Aborted at repeat ${err.repeats} of "${err.toolName}"`);
  } else throw err;
}

// ── Variant 2: hint instead of abort ──────────────────────────────────────
const hinter = new ToolExecutor([echo], {
  loopDetection: { maxRepeats: 1, action: "hint" },
});

const ctx2 = new RunContext({ sessionId: "s2", eventBus: new EventBus() });
const [first] = await hinter.executeAll([{ id: "a", name: "echo", arguments: { q: "x" } }], ctx2);
const [second] = await hinter.executeAll([{ id: "b", name: "echo", arguments: { q: "x" } }], ctx2);
console.log(`\nFirst call: ${first.result}`);
console.log(`Second call (should hint): ${second.result}`);
