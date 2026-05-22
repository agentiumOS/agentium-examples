/**
 * Example: Connect to a local MCP server over SSE
 *
 * Connects to the Xhipment logistics MCP server, discovers its tools,
 * and lets an agent query AMS/ISF filings.
 *
 * Prerequisites:
 *   export OPENAI_API_KEY=sk-...
 *   # MCP server running at localhost:3000
 *
 * Usage:
 *   npx tsx examples/toolkits/mcp-local-http.ts
 */
import { Agent, openai, MCPToolProvider } from "@agentium/core";

async function main() {
  const mcp = new MCPToolProvider({
    name: "xhipment",
    transport: "sse",
    url: "http://localhost:3000/mcp/sse",
    headers: {
      "X-MCP-API-Key": process.env.MCP_API_KEY ?? "",
    },
  });

  console.log("Connecting to MCP server...");
  await mcp.connect();

  const tools = await mcp.getTools();
  console.log(`Discovered ${tools.length} tools\n`);

  const agent = new Agent({
    name: "logistics-assistant",
    model: openai("gpt-4o"),
    instructions:
      "You are a logistics operations assistant for Xhipment. " +
      "Use the available tools to answer questions about shipments, bookings, and filings.",
    tools,
  });

  const result = await agent.run("Give me a summary of AMS/ISF filings for the next 7 days.");
  console.log(result.text);

  await mcp.close();
}

main().catch(console.error);
