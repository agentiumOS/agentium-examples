/**
 * Hash-Chained Audit Trail
 *
 * Demonstrates tamper-evident audit logging with SHA-256 hash chains,
 * chain verification, and compliance reporting.
 *
 * Usage: npx tsx examples/compliance/audit-trail.ts
 */
import {
  AuditLogger,
  RetentionManager,
  ComplianceReporter,
  ErasureManager,
  InMemoryStorage,
} from "@agentium/core";

async function main() {
  const storage = new InMemoryStorage();
  const auditLogger = new AuditLogger(storage, { hashAlgorithm: "sha256" });

  // Log some audit entries
  const entry1 = await auditLogger.log({
    traceId: "run-001",
    agentName: "support-agent",
    action: "llm.call",
    userId: "user-123",
    input: "How do I reset my password?",
    output: "To reset your password, go to Settings > Security > Reset Password.",
    metadata: { model: "gpt-4o", tokens: 150 },
  });
  console.log("Entry 1:", { id: entry1.id, hash: entry1.hash.slice(0, 16) + "..." });

  const entry2 = await auditLogger.log({
    traceId: "run-001",
    agentName: "support-agent",
    action: "tool.exec",
    userId: "user-123",
    input: "search_kb({query: 'password reset'})",
    output: '{"results": [{"title": "Password Reset Guide"}]}',
  });
  console.log("Entry 2:", { id: entry2.id, previousHash: entry2.previousHash.slice(0, 16) + "..." });

  await auditLogger.log({
    traceId: "run-002",
    agentName: "sales-agent",
    action: "llm.call",
    tenantId: "tenant-acme",
    input: "What are our Q4 numbers?",
    output: "Q4 revenue was $2.3M, up 15% YoY.",
  });

  // Verify chain integrity
  const verification = await auditLogger.verify();
  console.log("\nChain verification:", verification);

  // Query entries
  const userEntries = await auditLogger.query({ userId: "user-123" });
  console.log(`\nEntries for user-123: ${userEntries.length}`);

  // Retention management
  const retention = new RetentionManager(storage, {
    defaultRetentionDays: 365,
    anonymizeAfterDays: 180,
  });

  const status = await retention.getRetentionStatus();
  console.log("Retention status:", status);

  // Compliance report
  const reporter = new ComplianceReporter(auditLogger, retention);
  const report = await reporter.generateReport();
  console.log("\nCompliance Report:");
  console.log("  Period:", report.period.from.toISOString(), "→", report.period.to.toISOString());
  console.log("  Total entries:", report.totalEntries);
  console.log("  By action:", report.entriesByAction);
  console.log("  By agent:", report.entriesByAgent);
  console.log("  Hash chain:", report.hashChainIntegrity.verified ? "✓ Verified" : "✗ Broken");
  console.log("  Retention:", report.retentionStatus.compliant ? "✓ Compliant" : "✗ Non-compliant");

  // GDPR erasure
  const erasure = new ErasureManager(storage);
  const result = await erasure.eraseUser("user-123");
  console.log("\nErasure result:", {
    userId: result.userId,
    stores: result.stores,
    auditEntriesAnonymized: result.auditEntriesAnonymized,
  });
}

main().catch(console.error);
