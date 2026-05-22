/**
 * Example 21: WhatsApp Toolkit
 *
 * Agent that can send WhatsApp messages via Meta's Cloud API.
 *
 * Prerequisites:
 *   1. Create a Meta Developer account: https://developers.facebook.com
 *   2. Set up WhatsApp Business API: https://developers.facebook.com/docs/whatsapp/cloud-api/get-started
 *   3. Get your access token and phone number ID
 *
 *   export OPENAI_API_KEY=sk-...
 *   export WHATSAPP_ACCESS_TOKEN=your_access_token
 *   export WHATSAPP_PHONE_NUMBER_ID=your_phone_number_id
 *   export WHATSAPP_RECIPIENT_WAID=919876543210  # default recipient (optional)
 *
 * Usage:
 *   npx tsx examples/toolkits/21-whatsapp-toolkit.ts
 */
import { Agent, openai, WhatsAppToolkit } from "@agentium/core";

async function main() {
  console.log("╔════════════════════════════════════════╗");
  console.log("║   Agentium — WhatsApp Toolkit           ║");
  console.log("╚════════════════════════════════════════╝\n");

  const whatsapp = new WhatsAppToolkit();

  const agent = new Agent({
    name: "whatsapp-agent",
    model: openai("gpt-4o"),
    instructions:
      "You are a WhatsApp messaging assistant. You can send text messages and " +
      "template messages via WhatsApp Business API. " +
      "For first-time outreach to a number, use template messages. " +
      "Always confirm the recipient number before sending.",
    tools: [...whatsapp.getTools()],
    logLevel: "info",
  });

  // Send a template message (required for first contact)
  console.log("📱 Sending a WhatsApp template message...\n");
  const result = await agent.run(
    'Send a "hello_world" template message in English to +91 9876543210'
  );

  console.log("\n📝 Response:");
  console.log(result.text);
}

main().catch(console.error);
