/**
 * Multi-Tenant Storage Isolation
 *
 * Demonstrates tenant-scoped storage that transparently prefixes
 * all keys to prevent cross-tenant data access.
 *
 * Usage: npx tsx examples/multi-tenant/isolation.ts
 */
import {
  InMemoryStorage,
  TenantScopedStorage,
  withTenant,
  requireTenant,
  extractTenantFromHeaders,
} from "@agentium/core";

async function main() {
  const baseStorage = new InMemoryStorage();

  // Create tenant-scoped storage for two tenants
  const acmeStorage = new TenantScopedStorage(baseStorage, "acme");
  const globexStorage = new TenantScopedStorage(baseStorage, "globex");

  // Each tenant stores data in isolated namespaces
  await acmeStorage.set("sessions", "s1", { user: "alice", data: "acme-data" });
  await globexStorage.set("sessions", "s1", { user: "bob", data: "globex-data" });

  // Same key, different data
  const acmeSession = await acmeStorage.get("sessions", "s1");
  const globexSession = await globexStorage.get("sessions", "s1");

  console.log("Acme session:", acmeSession);
  console.log("Globex session:", globexSession);

  // Under the hood, keys are prefixed:
  // acme:  "t:acme:sessions" → "s1"
  // globex: "t:globex:sessions" → "s1"

  // Tenant extraction from headers
  const tenantId = extractTenantFromHeaders({
    "x-tenant-id": "acme",
    "content-type": "application/json",
  });
  console.log("\nExtracted tenant from headers:", tenantId);

  // Require tenant (throws if missing)
  try {
    requireTenant(undefined, { required: true, isolation: "namespace" });
  } catch (e) {
    console.log("Expected error:", (e as Error).message);
  }

  // Create tenant context
  const ctx = withTenant("acme", { plan: "enterprise" });
  console.log("\nTenant context:", ctx);

  // List items for a tenant
  await acmeStorage.set("sessions", "s2", { user: "charlie" });
  const acmeSessions = await acmeStorage.list("sessions");
  console.log(`\nAcme sessions (${acmeSessions.length}):`, acmeSessions.map(s => s.key));

  const globexSessions = await globexStorage.list("sessions");
  console.log(`Globex sessions (${globexSessions.length}):`, globexSessions.map(s => s.key));
}

main().catch(console.error);
