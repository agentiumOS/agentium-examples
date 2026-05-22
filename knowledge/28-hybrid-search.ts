/**
 * Hybrid Search — Compares vector, keyword (BM25), and hybrid (RRF) search modes.
 *
 * Demonstrates how hybrid search combines semantic understanding with exact keyword
 * matching to deliver better results than either approach alone.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/knowledge/28-hybrid-search.ts
 */

import {
  Agent,
  openai,
  KnowledgeBase,
  OpenAIEmbedding,
  InMemoryVectorStore,
} from "@agentium/core";

const kb = new KnowledgeBase({
  name: "Company Policies",
  vectorStore: new InMemoryVectorStore(new OpenAIEmbedding()),
  searchMode: "hybrid",
  hybridConfig: {
    vectorWeight: 1.0,
    keywordWeight: 1.0,
    rrfK: 60,
  },
});

await kb.initialize();

// ── Index documents with specific terminology ─────────────────────────────

await kb.addDocuments([
  {
    id: "pto-policy",
    content:
      "Employees accrue 20 days of PTO per year. Unused PTO carries over up to 5 days. PTO requests must be submitted 2 weeks in advance via the HR portal.",
    metadata: { category: "hr", topic: "pto" },
  },
  {
    id: "remote-work",
    content:
      "The company supports a hybrid work model. Employees may work remotely up to 3 days per week. Remote work arrangements must be approved by the direct manager.",
    metadata: { category: "hr", topic: "remote" },
  },
  {
    id: "401k-plan",
    content:
      "The company matches 401(k) contributions up to 6% of base salary. Vesting follows a 3-year graded schedule: 33% after year 1, 66% after year 2, 100% after year 3.",
    metadata: { category: "benefits", topic: "retirement" },
  },
  {
    id: "parental-leave",
    content:
      "New parents receive 16 weeks of paid parental leave. Adoptive parents receive the same benefits. Leave must begin within 12 months of birth or adoption.",
    metadata: { category: "hr", topic: "leave" },
  },
  {
    id: "expense-policy",
    content:
      "Business expenses over $500 require VP approval. Submit receipts within 30 days via Concur. The company reimburses mileage at $0.67/mile for 2024.",
    metadata: { category: "finance", topic: "expenses" },
  },
  {
    id: "security-protocol",
    content:
      "All employees must complete SOC 2 compliance training annually. Two-factor authentication (2FA) is mandatory for all internal systems. Report security incidents to security@company.com within 24 hours.",
    metadata: { category: "it", topic: "security" },
  },
  {
    id: "performance-review",
    content:
      "Performance reviews occur biannually in June and December. Reviews use a 1-5 scale across four dimensions: impact, collaboration, technical skill, and leadership. Self-assessments are due 2 weeks before the review cycle.",
    metadata: { category: "hr", topic: "performance" },
  },
  {
    id: "equity-grants",
    content:
      "RSU grants vest over 4 years with a 1-year cliff. Refresher grants are evaluated annually during the performance review cycle. Stock options exercise window is 90 days post-departure.",
    metadata: { category: "benefits", topic: "equity" },
  },
]);

console.log("Indexed 8 company policy documents.\n");
console.log("=".repeat(70));

// ── Compare search modes ─────────────────────────────────────────────────

const queries = [
  "401k matching",              // Exact term that benefits from keyword matching
  "time off vacation days",     // Semantic query — no doc says "vacation"
  "SOC 2 2FA security",        // Mix of acronyms + semantic meaning
];

for (const query of queries) {
  console.log(`\nQuery: "${query}"\n`);

  const vectorResults = await kb.search(query, { topK: 3, searchMode: "vector" });
  const keywordResults = await kb.search(query, { topK: 3, searchMode: "keyword" });
  const hybridResults = await kb.search(query, { topK: 3, searchMode: "hybrid" });

  console.log("  Vector (semantic) results:");
  for (const r of vectorResults) {
    console.log(`    [${r.score.toFixed(3)}] ${r.id} — ${r.content.substring(0, 80)}...`);
  }

  console.log("\n  Keyword (BM25) results:");
  for (const r of keywordResults) {
    console.log(`    [${r.score.toFixed(3)}] ${r.id} — ${r.content.substring(0, 80)}...`);
  }

  console.log("\n  Hybrid (RRF) results:");
  for (const r of hybridResults) {
    console.log(`    [${r.score.toFixed(3)}] ${r.id} — ${r.content.substring(0, 80)}...`);
  }

  console.log("\n" + "-".repeat(70));
}

// ── Use hybrid KB with an agent ──────────────────────────────────────────

console.log("\n\nAgent with hybrid search:\n");

const agent = new Agent({
  name: "Policy Assistant",
  model: openai("gpt-4o"),
  tools: [kb.asTool({ topK: 3, searchMode: "hybrid" })],
  instructions:
    "You answer questions about company policies. Always search the knowledge base first. Be specific and cite policy details.",
});

const result = await agent.run("What's the 401k match and how does vesting work?");
console.log(`Q: What's the 401k match and how does vesting work?`);
console.log(`A: ${result.text}\n`);

await kb.close();
console.log("Done.");
