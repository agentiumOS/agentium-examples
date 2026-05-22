/**
 * Path traversal + SSRF hardening in v2.0.
 *
 * - `safeJoin(base, rel)` blocks ../-style escapes, absolute paths, null bytes,
 *   and control characters. Use it everywhere you accept a user-supplied path.
 * - `allowedHosts` on the scraper toolkit blocks fetches to anything except
 *   an allowlist of hostnames (exact + sub-domain match).
 *
 * Run:
 *   npx tsx examples/safety/sandbox-paths-ssrf.ts
 */

import { Agent, openai, PathSecurityError, safeJoin, ScraperToolkit } from "@agentium/core";

// ── 1. safeJoin ───────────────────────────────────────────────────────────
console.log("--- safeJoin ---");

console.log(safeJoin("/var/data", "report.csv"));        // /var/data/report.csv
console.log(safeJoin("/var/data", "users/2024.json"));   // /var/data/users/2024.json

try {
  safeJoin("/var/data", "../../etc/passwd");
} catch (err) {
  console.log(`  blocked: ${(err as PathSecurityError).message}`);
}

try {
  safeJoin("/var/data", "ok\0.txt");
} catch (err) {
  console.log(`  blocked: ${(err as Error).message}`);
}

// ── 2. SSRF allowlist on the scraper toolkit ──────────────────────────────
console.log("\n--- scraper allowedHosts ---");

const scraper = new ScraperToolkit({
  allowedHosts: ["wikipedia.org", "nodejs.org"], // sub-domain match included
});

const tools = scraper.getTools();
const scrapeUrl = tools.find((t) => t.name === "scrape_url")!;

// Allowed:
const ok = await scrapeUrl.execute({ url: "https://en.wikipedia.org/wiki/Node.js" }, {} as any);
console.log(`  OK: fetched ${String(ok).length} chars`);

// Blocked:
try {
  await scrapeUrl.execute({ url: "https://internal.corp.example/admin" }, {} as any);
} catch (err) {
  console.log(`  blocked: ${(err as Error).message}`);
}

// Used together inside an agent the LLM cannot exfiltrate arbitrary URLs.
const agent = new Agent({
  name: "safe-scraper",
  model: openai("gpt-4o"),
  tools: [scrapeUrl],
});
void agent;
