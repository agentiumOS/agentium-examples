/**
 * Example 20: Gmail Toolkit
 *
 * Agent that can send, search, and read Gmail emails.
 *
 * Prerequisites:
 *   1. Create OAuth2 credentials at https://console.cloud.google.com
 *   2. Enable the Gmail API
 *   3. Download credentials.json
 *   4. Generate token.json via OAuth flow
 *   npm install googleapis
 *   export OPENAI_API_KEY=sk-...
 *   export GMAIL_CREDENTIALS_PATH=./credentials.json
 *   export GMAIL_TOKEN_PATH=./token.json
 *
 * Usage:
 *   npx tsx examples/toolkits/20-gmail-toolkit.ts
 */
import { Agent, openai, GmailToolkit } from "@agentium/core";

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Agentium — Gmail Toolkit              ║");
  console.log("╚════════════════════════════════════════╝\n");

  const gmail = new GmailToolkit({
    credentialsPath: process.env.GMAIL_CREDENTIALS_PATH,
    tokenPath: process.env.GMAIL_TOKEN_PATH,
  });

  const agent = new Agent({
    name: "email-assistant",
    model: openai("gpt-4o"),
    instructions:
      "You are an email assistant. You can search, read, and send emails via Gmail. " +
      "When sending emails, always confirm the recipient and content before sending.",
    tools: [...gmail.getTools()],
    logLevel: "info",
  });

  // Search for recent emails
  console.log("🔍 Searching for recent emails...\n");
  const result = await agent.run(
    "Search for my 3 most recent unread emails and summarize them."
  );

  console.log("\n📝 Response:");
  console.log(result.text);
}

main().catch(console.error);
