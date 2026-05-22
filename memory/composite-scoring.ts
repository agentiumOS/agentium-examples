/**
 * Composite Scoring — Demonstrates computeCompositeScore and recencyDecay.
 *
 * Creates sample memories with different ages, importance levels, and
 * semantic similarity scores. Computes composite scores, shows ranking,
 * and visualizes how recency decay works over time.
 *
 * Usage:
 *   npx tsx examples/memory/composite-scoring.ts
 */

import { computeCompositeScore, recencyDecay } from "@agentium/core";

const now = new Date();
const daysAgo = (d: number) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);

const memories = [
  { label: "User's name (today, high importance)", createdAt: daysAgo(0), importance: 0.95, semantic: 0.9 },
  { label: "Favorite color (3 days ago, low importance)", createdAt: daysAgo(3), importance: 0.2, semantic: 0.85 },
  { label: "Work project (7 days ago, medium importance)", createdAt: daysAgo(7), importance: 0.6, semantic: 0.7 },
  { label: "Dietary restriction (30 days ago, high importance)", createdAt: daysAgo(30), importance: 0.9, semantic: 0.5 },
  { label: "Weather chat (60 days ago, trivial)", createdAt: daysAgo(60), importance: 0.1, semantic: 0.3 },
  { label: "Career goal (14 days ago, high importance)", createdAt: daysAgo(14), importance: 0.85, semantic: 0.75 },
];

console.log("=== 1. Recency Decay over time ===\n");
console.log("Days ago  | Decay (30d half-life) | Decay (7d half-life)");
console.log("----------|----------------------|---------------------");
for (const d of [0, 1, 7, 14, 30, 60, 90]) {
  const decay30 = recencyDecay(daysAgo(d), 30);
  const decay7 = recencyDecay(daysAgo(d), 7);
  console.log(`${String(d).padStart(6)}    | ${decay30.toFixed(4).padStart(20)} | ${decay7.toFixed(4).padStart(19)}`);
}

console.log("\n=== 2. Composite Scores (default weights: semantic=0.4, recency=0.3, importance=0.3) ===\n");

const scored = memories.map((m) => ({
  ...m,
  score: computeCompositeScore({
    semanticSimilarity: m.semantic,
    createdAt: m.createdAt,
    importance: m.importance,
  }),
}));

scored.sort((a, b) => b.score - a.score);

for (const m of scored) {
  console.log(`  ${m.score.toFixed(4)}  ${m.label}`);
}

console.log("\n=== 3. Custom weights (importance-heavy: semantic=0.2, recency=0.1, importance=0.7) ===\n");

const importanceHeavy = memories.map((m) => ({
  ...m,
  score: computeCompositeScore({
    semanticSimilarity: m.semantic,
    createdAt: m.createdAt,
    importance: m.importance,
    weights: { semantic: 0.2, recency: 0.1, importance: 0.7 },
  }),
}));

importanceHeavy.sort((a, b) => b.score - a.score);

for (const m of importanceHeavy) {
  console.log(`  ${m.score.toFixed(4)}  ${m.label}`);
}

process.exit(0);
