/**
 * Context Providers - data sources that auto-inject into the system prompt
 * every turn, no LLM tool call required.
 *
 * Use this when you want the agent to "always know" something (current user's
 * Slack channel topics, today's calendar, recent log entries) instead of
 * making the LLM decide to call a tool.
 *
 * Built-ins:
 *   - FilesystemContextProvider  (read local files matching a glob)
 *   - HttpContextProvider        (fetch a URL with allowlist)
 *   - DatabaseContextProvider    (run any callback per turn)
 *
 * Run:
 *   npx tsx examples/agents/11-context-providers.ts
 */

import {
  DatabaseContextProvider,
  FilesystemContextProvider,
  HttpContextProvider,
  resolveContextProviders,
} from "@agentium/core";
import { RunContext, EventBus } from "@agentium/core";

const fsProvider = new FilesystemContextProvider({
  basePath: "./notes",
  glob: "*.md",
  maxCharsPerFile: 1_000,
  maxTotalChars: 4_000,
});

const httpProvider = new HttpContextProvider({
  url: "https://api.example.com/status",
  allowedHosts: ["example.com"],
  maxChars: 500,
});

const dbProvider = new DatabaseContextProvider({
  label: "user-profile",
  fetch: async (ctx) => `userId=${ctx.userId ?? "anon"}; tier=premium`,
});

// Resolve all providers into a single context block (called once per agent run
// internally; this shows how to do it manually).
const ctx = new RunContext({ sessionId: "demo", userId: "alice", eventBus: new EventBus() });
const context = await resolveContextProviders([fsProvider, httpProvider, dbProvider], "what's the status?", ctx);
console.log("--- pre-fetched context ---");
console.log(context.slice(0, 800), "\n...");

// In a real agent, just pass them via `Agent({ context: [...] })` (once the
// Agent runtime wires this in - currently consumed manually as shown above).
