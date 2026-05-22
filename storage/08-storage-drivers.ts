/**
 * Storage Drivers — KV storage with InMemory, SQLite, PostgreSQL, and MongoDB.
 *
 * Usage:
 *   npx tsx examples/storage/08-storage-drivers.ts                       # in-memory (default)
 *   npx tsx examples/storage/08-storage-drivers.ts sqlite                # SQLite
 *   npx tsx examples/storage/08-storage-drivers.ts postgres              # PostgreSQL (needs PG_URL)
 *   npx tsx examples/storage/08-storage-drivers.ts mongodb               # MongoDB   (needs MONGO_URL)
 */

import {
  InMemoryStorage,
  SqliteStorage,
  PostgresStorage,
  MongoDBStorage,
  type StorageDriver,
} from "@agentium/core";

const driver = process.argv[2] ?? "memory";

async function createStorage(): Promise<StorageDriver> {
  switch (driver) {
    case "sqlite": {
      const store = new SqliteStorage("./agentium-example.db");
      await (store as any).initialize?.();
      return store;
    }
    case "postgres": {
      const url = process.env.PG_URL ?? "postgres://localhost:5432/agentium";
      const store = new PostgresStorage(url);
      await store.initialize();
      return store;
    }
    case "mongodb": {
      const url = process.env.MONGO_URL ?? "mongodb://localhost:27017";
      const store = new MongoDBStorage(url, "agentium_example");
      await store.initialize();
      return store;
    }
    default: {
      return new InMemoryStorage();
    }
  }
}

const storage = await createStorage();
console.log(`Using storage driver: ${driver}\n`);

// --- SET ---
await storage.set("users", "alice", { name: "Alice", role: "admin" });
await storage.set("users", "bob", { name: "Bob", role: "member" });
await storage.set("config", "theme", { dark: true, accent: "#5a9" });
console.log("SET  3 entries across 'users' and 'config' namespaces");

// --- GET ---
const alice = await storage.get("users", "alice");
console.log("GET  users/alice →", alice);

const theme = await storage.get("config", "theme");
console.log("GET  config/theme →", theme);

const missing = await storage.get("users", "charlie");
console.log("GET  users/charlie →", missing, "(expected null)");

// --- LIST ---
const allUsers = await storage.list("users");
console.log("LIST users →", allUsers.map((u) => u.key));

// --- UPDATE ---
await storage.set("users", "alice", { name: "Alice", role: "superadmin" });
const updated = await storage.get("users", "alice");
console.log("UPD  users/alice →", updated);

// --- DELETE ---
await storage.delete("users", "bob");
const afterDelete = await storage.list("users");
console.log("DEL  users/bob → remaining:", afterDelete.map((u) => u.key));

// --- CLEANUP ---
await storage.close();
console.log("\nDone.");
