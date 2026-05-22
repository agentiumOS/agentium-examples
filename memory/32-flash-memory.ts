/**
 * FlashMemoryStore - tiered storage with LMDB cold tier + in-memory hot tier.
 *
 * - Inspired by Redis Flex / Iris: keep 99% of data on flash, hot working set
 *   in memory.
 * - Falls back to pure-in-memory if `lmdb` peer dep isn't installed.
 *
 * Setup:
 *   npm install lmdb  # optional - enables disk persistence
 *
 * Run:
 *   npx tsx examples/memory/32-flash-memory.ts
 */

import { FlashMemoryStore } from "@agentium/core";

const store = new FlashMemoryStore({
  path: "./.agentium/flash-memory", // omit to run pure in-memory
  hotCacheSize: 1_000,              // up to 1K entries kept hot
  mapSize: 1024 * 1024 * 1024,      // 1 GB max cold size
});

await store.initialize();

// Write a million-ish entries (use smaller N for the demo).
for (let i = 0; i < 5_000; i++) {
  await store.set("users", `user:${i}`, { name: `User ${i}`, signups: i });
}

// Read - hot tier serves recent keys instantly.
const u100 = await store.get("users", "user:100");
console.log(u100);

// Anything beyond hot cache spills to LMDB and gets pulled back when accessed.
const u4999 = await store.get("users", "user:4999");
console.log(u4999);

// Range scan via list(namespace, prefix).
const recent = await store.list<{ name: string }>("users", "user:498");
console.log(`Range hit: ${recent.length} entries`);

await store.close();
