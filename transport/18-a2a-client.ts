/**
 * Example 18: A2A Client
 *
 * Connects to a remote A2A-compliant agent and uses it as:
 *   1. A direct call (run / stream)
 *   2. A tool for another agent
 *   3. A member of a Team
 *
 * Prerequisites:
 *   Start the A2A server first:  npx tsx examples/transport/17-a2a-server.ts
 *   export OPENAI_API_KEY=sk-...
 *
 * Usage:
 *   npx tsx examples/transport/18-a2a-client.ts
 */
import { Agent, openai, A2ARemoteAgent, Team, TeamMode } from "@agentium/core";

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Agentium — A2A Client Example         ║");
  console.log("╚════════════════════════════════════════╝\n");

  const A2A_URL = process.env.A2A_URL ?? "http://localhost:3001";

  // ── 1. Discover the remote agent ──
  console.log(`🔍 Discovering agent at ${A2A_URL}...`);
  const remote = new A2ARemoteAgent({ url: A2A_URL });
  const card = await remote.discover();

  console.log(`✅ Agent: ${card.name}`);
  console.log(`   Description: ${card.description?.slice(0, 100)}`);
  console.log(`   Skills: ${card.skills?.map((s) => s.name).join(", ")}`);
  console.log(`   Streaming: ${card.capabilities?.streaming ? "Yes" : "No"}\n`);

  // ── 2. Direct call (synchronous) ──
  console.log("── Direct Call (message/send) ──");
  const result = await remote.run("What is 42 * 17?");
  console.log(`Response: ${result.text}\n`);

  // ── 3. Streaming call ──
  console.log("── Streaming Call (message/stream) ──");
  process.stdout.write("Response: ");
  for await (const chunk of remote.stream("Tell me a short joke")) {
    if (chunk.type === "text") {
      process.stdout.write(chunk.text);
    }
  }
  console.log("\n");

  // ── 4. Use remote agent as a tool ──
  console.log("── Remote Agent as Tool ──");
  const orchestrator = new Agent({
    name: "orchestrator",
    model: openai("gpt-4o"),
    instructions:
      "You have access to a remote assistant via A2A. " +
      "Delegate tasks to it when appropriate using the a2a tool.",
    tools: [remote.asTool()],
    logLevel: "info",
  });

  const toolResult = await orchestrator.run(
    "Use the remote agent to calculate 2^10"
  );
  console.log(`Orchestrator response: ${toolResult.text}\n`);

  // ── 5. Use in a Team ──
  console.log("── Remote Agent in a Team ──");
  const localAgent = new Agent({
    name: "local-writer",
    model: openai("gpt-4o-mini"),
    instructions: "You are a creative writer. Write short, engaging content.",
  });

  const team = new Team({
    name: "hybrid-team",
    mode: TeamMode.Coordinate,
    model: openai("gpt-4o"),
    members: [localAgent, remote as any],
    instructions:
      "You coordinate between a local writer and a remote assistant. " +
      "Use the writer for creative tasks and the remote agent for factual questions.",
  });

  const teamResult = await team.run(
    "Write a haiku about AI collaboration"
  );
  console.log(`Team response: ${teamResult.text}\n`);

  console.log("✅ Done!");
}

main().catch(console.error);
