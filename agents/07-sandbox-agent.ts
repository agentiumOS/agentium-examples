/**
 * SandboxAgent - persistent workspace agent.
 *
 * Provides an isolated FS + shell + git that survives across runs. Use it for
 * code-execution agents, research agents that take notes to disk, or anything
 * that needs file IO between turns.
 *
 * Backends:
 *   - "unix-local"  spawn shells in a tempdir on this machine (default; no deps)
 *   - "docker"      same workspace, but commands run in a container
 *   - "remote"      delegate to a CloudSandbox (E2B / Daytona)
 *
 * Run:
 *   npx tsx examples/agents/07-sandbox-agent.ts
 */

import { SandboxAgent } from "@agentium/core";

const agent = new SandboxAgent({
  backend: "unix-local",
  workspace: {
    env: { PROJECT_NAME: "demo" },
    files: [
      { path: "data.csv", contents: "name,score\nalice,9\nbob,7\ncarol,8\n" },
      { path: "analyze.js", contents: `
        const csv = require('fs').readFileSync('data.csv', 'utf8');
        const lines = csv.trim().split('\\n').slice(1);
        const avg = lines.map((l) => Number(l.split(',')[1])).reduce((a,b)=>a+b,0)/lines.length;
        console.log("avg:", avg);
      ` },
    ],
  },
});

await agent.start();

// Run code that uses the seeded files.
const r = await agent.run("require('./analyze.js')", { language: "node" });
console.log(`output: ${r.output.trim()}`);

// Take a snapshot so we can resume later.
const snap = await agent.snapshot();
console.log(`Snapshot has ${snap.files.length} files`);

// Tear down.
await agent.close();

// Rebuild a fresh agent from the snapshot - the original `data.csv` is there.
const replay = new SandboxAgent({ backend: "unix-local" });
await replay.resume(snap);
console.log(`After resume: data.csv = "${(await replay.readFile("data.csv"))?.slice(0, 40)}..."`);
await replay.close();
