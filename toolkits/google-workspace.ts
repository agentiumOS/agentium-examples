/**
 * Example: Google Workspace Toolkit
 *
 * Agent with access to Drive, Gmail, Calendar, and Sheets via the gws CLI.
 * Dynamically discovers 100+ tools from Google Workspace APIs at runtime
 * through the Model Context Protocol — zero hardcoded API surface.
 *
 * ─── SETUP (one-time) ───────────────────────────────────────────────
 *
 *   Step 1 — Install the gws CLI (Rust binary, distributed via npm):
 *
 *     npm install -g @googleworkspace/cli
 *
 *   Step 2 — Authenticate with Google (interactive browser flow):
 *
 *     gws auth setup          # First time: creates GCP project, enables APIs, logs in
 *                              # Requires gcloud CLI. If you don't have gcloud, use:
 *                              #   - Manual setup: https://github.com/googleworkspace/cli#manual-oauth-setup-google-cloud-console
 *
 *     gws auth login --scopes drive,gmail,calendar,sheets
 *                              # Subsequent logins — pick only the scopes you need.
 *                              # Unverified (testing mode) apps are limited to ~25 scopes.
 *
 *   Step 2b — Alternative auth methods:
 *
 *     # Service account (no browser needed):
 *     export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=/path/to/service-account.json
 *
 *     # Pre-obtained access token (e.g., from gcloud):
 *     export GOOGLE_WORKSPACE_CLI_TOKEN=$(gcloud auth print-access-token)
 *
 *     # Headless / CI — export credentials from an authenticated machine:
 *     gws auth export --unmasked > credentials.json
 *     export GOOGLE_WORKSPACE_CLI_CREDENTIALS_FILE=./credentials.json
 *
 *   Step 3 — Verify auth works:
 *
 *     gws drive files list --params '{"pageSize": 3}'
 *     # Should return JSON with your recent Drive files
 *
 *   Step 4 — Install the MCP SDK (peer dependency for Agentium):
 *
 *     npm install @modelcontextprotocol/sdk
 *
 *   Step 5 — Set your LLM API key:
 *
 *     export OPENAI_API_KEY=sk-...
 *
 * ─── RUN ─────────────────────────────────────────────────────────────
 *
 *   npx tsx examples/toolkits/google-workspace.ts
 *
 */
import { Agent, openai, GoogleWorkspaceToolkit } from "@agentium/core";
import { execSync } from "node:child_process";

function checkGwsInstalled(): boolean {
  try {
    execSync("gws --version", { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║  Agentium — Google Workspace Toolkit    ║");
  console.log("╚════════════════════════════════════════╝\n");

  // ── Preflight: verify gws is installed and authenticated ──
  if (!checkGwsInstalled()) {
    console.error("ERROR: gws CLI not found on PATH.");
    console.error("");
    console.error("  Install it:   npm install -g @googleworkspace/cli");
    console.error("  Then auth:    gws auth setup");
    console.error("  Then verify:  gws drive files list --params '{\"pageSize\": 1}'");
    process.exit(1);
  }
  console.log("✓ gws CLI found on PATH");

  // ── Create the toolkit with selected services ──
  // Only enable the services you need — each adds 10-80 tools.
  const gw = new GoogleWorkspaceToolkit({
    services: ["drive", "gmail", "calendar", "sheets"],
    // gwsBinaryPath: "/usr/local/bin/gws",   // Override if gws is not on PATH
    // includeWorkflows: true,                 // Higher-level workflow tools
    // includeHelpers: true,                   // Helper tools for common operations
  });

  console.log("🔌 Connecting to gws MCP server...");
  await gw.connect();

  const tools = gw.getTools();
  console.log(`✅ Discovered ${tools.length} Google Workspace tools:`);
  for (const tool of tools.slice(0, 15)) {
    console.log(`   • ${tool.name}: ${tool.description.slice(0, 80)}`);
  }
  if (tools.length > 15) {
    console.log(`   ... and ${tools.length - 15} more\n`);
  }

  // ── Create an agent with all Workspace tools ──
  // ToolRouter auto-selects relevant tools per query to keep prompts small
  const agent = new Agent({
    name: "workspace-assistant",
    model: openai("gpt-4o"),
    instructions: [
      "You are a Google Workspace assistant with access to Drive, Gmail, Calendar, and Sheets.",
      "Help users manage their files, emails, events, and spreadsheets.",
      "IMPORTANT: Never set page_all to true — it fetches every page and is extremely slow.",
      "Instead, use the params object with pageSize to limit results (e.g. params: { pageSize: 5 }).",
      "Always confirm before performing destructive operations (delete, send).",
    ].join(" "),
    tools,
    toolRouter: {
      model: openai("gpt-4o-mini"),
      maxTools: 10,
    },
    logLevel: "info",
  });

  // ── Example queries ──
  console.log("\n💬 Asking: List my 5 most recent Drive files...\n");
  const result = await agent.run("List my 5 most recent Google Drive files with their names and last modified dates.");

  console.log("\n📝 Response:");
  console.log(result.text);
  console.log(`\n📊 Tokens: ${result.usage.totalTokens} | Duration: ${result.durationMs}ms`);

  // ── Clean up ──
  await gw.close();
  console.log("\n✅ Done! gws connection closed.");
}

main().catch(console.error);
