/**
 * Token-Aware Rate Limiting with Degradation
 *
 * Demonstrates sliding-window token rate limiting with per-tenant scoping
 * and graceful degradation to cheaper models.
 *
 * Usage: npx tsx examples/rate-limiting/token-aware.ts
 */
import { TokenRateLimiter, ConcurrencyLimiter } from "@agentium/core";

async function main() {
  // Token rate limiter
  const limiter = new TokenRateLimiter({
    maxTokensPerMinute: 10_000,
    maxRequestsPerMinute: 20,
    perTenant: true,
    perUser: true,
  });

  console.log("=== Token Rate Limiter ===\n");

  // Simulate requests from different tenants
  const scopes = [
    { tenantId: "acme", userId: "alice" },
    { tenantId: "acme", userId: "bob" },
    { tenantId: "globex", userId: "charlie" },
  ];

  for (const scope of scopes) {
    for (let i = 0; i < 5; i++) {
      const tokens = 500 + Math.round(Math.random() * 1000);
      const status = limiter.acquire(tokens, scope);
      console.log(
        `  ${scope.tenantId}/${scope.userId} request ${i + 1}: ${status.allowed ? "✓" : "✗"} ` +
        `(${tokens} tokens, ${status.remaining} remaining)`,
      );
    }
  }

  // Check usage
  console.log("\nUsage per scope:");
  for (const scope of scopes) {
    const usage = limiter.getUsage(scope);
    console.log(`  ${scope.tenantId}/${scope.userId}: ${usage.minuteTokens} tokens, ${usage.minuteRequests} requests`);
  }

  // Concurrency limiter
  console.log("\n=== Concurrency Limiter ===\n");
  const concurrency = new ConcurrencyLimiter(3, 5000);

  console.log(`Active: ${concurrency.active}, Available: ${concurrency.available}, Pending: ${concurrency.pending}`);

  const releases: (() => void)[] = [];
  for (let i = 0; i < 3; i++) {
    const release = await concurrency.acquire();
    releases.push(release);
    console.log(`Acquired slot ${i + 1}. Active: ${concurrency.active}`);
  }

  console.log(`\nAll slots taken. Active: ${concurrency.active}, Available: ${concurrency.available}`);

  // Release one
  releases[0]();
  console.log(`Released one slot. Active: ${concurrency.active}, Available: ${concurrency.available}`);

  // Acquire again
  const release = await concurrency.acquire();
  console.log(`Acquired again. Active: ${concurrency.active}`);

  // Clean up
  release();
  releases[1]();
  releases[2]();
  console.log(`All released. Active: ${concurrency.active}`);
}

main().catch(console.error);
