/**
 * Workflow time travel - checkpoint after every step, replay or fork from any
 * point.
 *
 * Use cases:
 *   - "What if step 3 said X instead?"  -> fork with mutations
 *   - "Resume after crash"               -> replay from last checkpoint
 *   - "A/B test branches of the same run" -> multiple forks
 *
 * Run:
 *   npx tsx examples/workflows/05-time-travel.ts
 */

import { InMemoryStorage, StorageBackedCheckpointStore, Workflow } from "@agentium/core";

interface State extends Record<string, unknown> {
  history: string[];
  total: number;
}

const store = new StorageBackedCheckpointStore<State>(new InMemoryStorage(), { keepLastN: 50 });

const wf = new Workflow<State>({
  name: "math-pipeline",
  initialState: { history: [], total: 0 },
  checkpointStore: store,
  steps: [
    { name: "step-add-5",    run: async (s) => ({ history: [...s.history, "+5"], total: s.total + 5 }) },
    { name: "step-mul-3",    run: async (s) => ({ history: [...s.history, "*3"], total: s.total * 3 }) },
    { name: "step-add-100",  run: async (s) => ({ history: [...s.history, "+100"], total: s.total + 100 }) },
  ],
});

const initial = await wf.runWithCheckpoints();
console.log(`Initial run total: ${initial.state.total}  (history: ${initial.state.history.join(", ")})`);

// List checkpoints.
const checkpoints = await wf.listCheckpoints(initial.runId);
checkpoints.sort((a, b) => a.stepIndex - b.stepIndex);
for (const cp of checkpoints) {
  console.log(`  cp #${cp.stepIndex}  after "${cp.stepName}"  total=${cp.state.total}`);
}

// Replay from the first checkpoint (after "step-add-5") - runs steps 2 + 3.
const replayed = await wf.replay(checkpoints[0].id);
console.log(`\nReplay from cp #0: total=${replayed.state.total}`);

// Fork: change total to 100 before continuing.
const forked = await wf.fork(checkpoints[0].id, (s) => ({ total: 100, history: s.history }));
console.log(`Fork  from cp #0 with total=100 override: total=${forked.state.total}`);
