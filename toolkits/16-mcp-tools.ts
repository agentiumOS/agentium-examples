/**
 * Example 16: MCP Tools
 *
 * Connects to an MCP server (GitHub) and uses its tools as native agent tools.
 *
 * Prerequisites:
 *   npm install @modelcontextprotocol/sdk
 *   export OPENAI_API_KEY=sk-...
 *   export GITHUB_TOKEN=ghp_...
 *
 * Usage:
 *   npx tsx examples/toolkits/16-mcp-tools.ts
 */
import { Agent, openai, MCPToolProvider, defineTool } from "@agentium/core";
import { z } from "zod";

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Agentium — MCP Tools Example          ║");
  console.log("╚════════════════════════════════════════╝\n");

  // ── Connect to a GitHub MCP server via stdio ──
  const githubMcp = new MCPToolProvider({
    name: "github",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@modelcontextprotocol/server-github"],
    env: { GITHUB_TOKEN: process.env.GITHUB_TOKEN ?? "" },
  });

  console.log("🔌 Connecting to GitHub MCP server...");
  await githubMcp.connect();

  // List all available tools
  const allTools = await githubMcp.getTools();
  console.log(`✅ Discovered ${allTools.length} MCP tools:`);
  for (const tool of allTools) {
    console.log(`   • ${tool.name}: ${tool.description.slice(0, 80)}`);
  }
  console.log();

  // Filter to only the tools we need (saves ~60k+ input tokens!)
  const mcpTools = await githubMcp.getTools({
    include: [
      "list_releases",
      "get_latest_release",
      "search_repositories",
      "get_file_contents",
    ],
  });
  console.log(`🔧 Using ${mcpTools.length} filtered tools (of ${allTools.length} available)\n`);

  // ── Mix MCP tools with local tools ──
  const localTool = defineTool({
    name: "current_time",
    description: "Returns the current date and time",
    parameters: z.object({}),
    execute: async () => new Date().toISOString(),
  });

  // ── Create an agent with both MCP and local tools ──
  const agent = new Agent({
    name: "dev-assistant",
    model: openai("gpt-4o"),
    instructions:
      "You are a developer assistant with access to GitHub tools and local utilities. " +
      "Use the available tools to help with GitHub-related tasks.",
    tools: [...mcpTools, localTool],
    logLevel: "info",
  });

  console.log("💬 Asking the agent to search GitHub...\n");

  const result = await agent.run(
    "What is the latest release of the nodejs/node repository?"
  );

  console.log("\n📝 Response:");
  console.log(result.text);

  // ── Clean up ──
  await githubMcp.close();
  console.log("\n✅ Done! MCP connection closed.");
}

main().catch(console.error);
