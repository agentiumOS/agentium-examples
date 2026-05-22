/**
 * Browser Agent with Secure Credentials — Login without exposing secrets to the LLM.
 *
 * The CredentialVault stores email/password in memory. The LLM only sees
 * placeholders like {{email}} and {{password}}. Real values are injected
 * at execution time and scrubbed from all logs and results.
 *
 * This example logs in to https://practicetestautomation.com (a safe test site).
 *
 * Prerequisites:
 *   npm install playwright
 *   npx playwright install chromium
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/browser/33-browser-auth.ts
 */

import { BrowserAgent, CredentialVault } from "@agentium/browser";
import { openai } from "@agentium/core";

const vault = new CredentialVault({
  username: "student",
  password: "Password123",
});

const browser = new BrowserAgent({
  name: "auth-agent",
  model: openai("gpt-4o"),
  headless: true,
  maxSteps: 15,
  useDOM: true,
  maxRepeats: 3,
  credentials: vault,
  startUrl: "https://practicetestautomation.com/practice-test-login/",
  logLevel: "info",
});

browser.eventBus.on("browser.action", ({ action }: any) => {
  console.log(`  → Action: ${JSON.stringify(action)}`);
});

console.log("Starting browser auth agent...");
console.log("Credential placeholders available:", vault.keys());
console.log("LLM will NEVER see the real values.\n");

const result = await browser.run(
  "Log in using {{username}} and {{password}}, then tell me the text shown on the success page."
);

console.log("\n" + "=".repeat(60));
console.log("Success:", result.success);
console.log("Steps:", result.steps.length);
console.log("Duration:", `${(result.durationMs / 1000).toFixed(1)}s`);
console.log("Final URL:", result.finalUrl);
console.log("\nResult:");
console.log(result.result);

const leaked = result.result.includes("student") || result.result.includes("Password123");
console.log("\nCredential leak check:", leaked ? "⚠ LEAKED" : "✓ Clean — no raw credentials in result");
