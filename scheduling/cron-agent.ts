/**
 * Scheduled Agent with Cron
 *
 * Demonstrates scheduling an agent to run on a cron schedule
 * and triggering agent runs based on events.
 *
 * Usage: npx tsx examples/scheduling/cron-agent.ts
 */
import { Agent, AgentScheduler, EventBus, openai } from "@agentium/core";

async function main() {
  const eventBus = new EventBus();

  eventBus.on("schedule.fired", ({ scheduleId, agentName }) => {
    console.log(`⏰ Schedule fired: ${scheduleId} (${agentName})`);
  });

  eventBus.on("schedule.completed", ({ scheduleId, runCount }) => {
    console.log(`✅ Schedule completed: ${scheduleId} (run #${runCount})`);
  });

  eventBus.on("trigger.fired", ({ triggerId, event }) => {
    console.log(`🎯 Trigger fired: ${triggerId} on "${event}"`);
  });

  const agent = new Agent({
    name: "report-agent",
    model: openai("gpt-4o-mini"),
    instructions: "You generate concise status reports.",
    eventBus,
  });

  const scheduler = new AgentScheduler(eventBus);

  // Schedule: every 5 minutes
  const scheduleId = scheduler.schedule(agent, {
    cron: "*/5 * * * *",
    input: "Generate a brief system status check.",
    maxRetries: 1,
  });

  // Schedule with context continuity
  scheduler.schedule(agent, {
    id: "daily-report",
    cron: "0 9 * * *",
    input: (lastResult) =>
      lastResult
        ? `Previous report summary: ${lastResult.text.slice(0, 200)}. Generate an updated report.`
        : "Generate the first daily report.",
    contextContinuity: true,
  });

  // Event trigger: run agent when errors occur
  scheduler.trigger(agent, {
    event: "run.error",
    input: (eventData) =>
      `An error occurred: ${eventData.error?.message}. Analyze the error and suggest fixes.`,
    debounceMs: 60_000,
  });

  // List schedules
  const { schedules, triggers } = scheduler.list();
  console.log("\nActive schedules:");
  for (const s of schedules) {
    console.log(`  ${s.id}: ${s.cron} (enabled: ${s.enabled})`);
  }
  console.log("\nActive triggers:");
  for (const t of triggers) {
    console.log(`  ${t.id}: on "${t.event}" (enabled: ${t.enabled})`);
  }

  // Pause and resume
  scheduler.pause(scheduleId);
  console.log(`\nPaused schedule ${scheduleId}`);

  scheduler.resume(scheduleId);
  console.log(`Resumed schedule ${scheduleId}`);

  // Clean up (in real app, let it run)
  scheduler.cancelAll();
  console.log("\nAll schedules cancelled.");
}

main().catch(console.error);
