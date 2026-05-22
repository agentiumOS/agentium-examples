/**
 * Example 19: Hacker News Toolkit
 *
 * Agent with Hacker News search — no API key required!
 *
 * Prerequisites:
 *   export OPENAI_API_KEY=sk-...
 *
 * Usage:
 *   npx tsx examples/toolkits/19-hackernews-toolkit.ts
 */
import { Agent, openai, HackerNewsToolkit } from "@agentium/core";

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Agentium — Hacker News Toolkit        ║");
  console.log("╚════════════════════════════════════════╝\n");

  const hn = new HackerNewsToolkit();

  const agent = new Agent({
    name: "hn-reader",
    model: openai("gpt-4o"),
    instructions:
      "You are a tech news assistant. Use Hacker News tools to find top stories " +
      "and user information. Provide engaging summaries.",
    tools: [...hn.getTools()],
    logLevel: "info",
  });

  const result = await agent.run(
    "Write an engaging summary of the users with the top 2 stories on Hacker News. " +
      "Please mention the stories as well."
  );

  console.log("\n📝 Response:");
  console.log(result.text);
}

main().catch(console.error);
