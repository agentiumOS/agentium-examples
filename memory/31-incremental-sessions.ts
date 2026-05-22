/**
 * IncrementalSessionManager - append-only writes per turn, snapshot every N.
 *
 * The default SessionManager re-serializes the whole conversation on every
 * append. For long sessions with multimodal payloads that gets expensive.
 * IncrementalSessionManager writes one entry per turn and rolls up into a
 * snapshot every `snapshotFrequency` appends.
 *
 * Run:
 *   npx tsx examples/memory/31-incremental-sessions.ts
 */

import { IncrementalSessionManager, InMemoryStorage } from "@agentium/core";

const storage = new InMemoryStorage();
const sessions = new IncrementalSessionManager(storage, {
  snapshotFrequency: 5, // collapse loose entries into a snapshot every 5 appends
  maxMessages: 100,     // trim oldest beyond 100
});

await sessions.appendMessage("chat-1", { role: "user", content: "Hi!" });
await sessions.appendMessage("chat-1", { role: "assistant", content: "Hello!" });
await sessions.appendMessage("chat-1", { role: "user", content: "What's 2+2?" });
await sessions.appendMessage("chat-1", { role: "assistant", content: "4" });
await sessions.appendMessage("chat-1", { role: "user", content: "Thanks." });
// Snapshot triggered at append #5.

const history = await sessions.getHistory("chat-1");
console.log(`Messages in chat-1: ${history.length}`);

// Add a few more "loose" entries on top of the snapshot.
await sessions.appendMessage("chat-1", { role: "assistant", content: "You're welcome." });
await sessions.appendMessage("chat-1", { role: "user", content: "Goodbye!" });

// Inspect the raw storage layout - one snapshot + 2 loose messages.
const loose = await storage.list("sessions:msg", "chat-1:");
console.log(`Loose message entries since last snapshot: ${loose.length}`);

// Force an early snapshot (e.g. before graceful drain).
await sessions.snapshotNow("chat-1");
const afterSnap = await storage.list("sessions:msg", "chat-1:");
console.log(`After snapshotNow(): ${afterSnap.length} loose entries (should be 0)`);
