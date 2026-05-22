/**
 * Async HandleId pattern - long-running tools return a handle synchronously;
 * the agent polls for the real result instead of blocking the LLM loop.
 *
 * Great for:
 *   - Slow APIs (web scraping, video processing)
 *   - Batch jobs
 *   - Anything > 5-10s
 *
 * Run:
 *   OPENAI_API_KEY=sk-... npx tsx examples/agents/09-async-tools.ts
 */

import { Agent, createPollResultTool, defineAsyncTool, openai } from "@agentium/core";
import { z } from "zod";

const renderVideo = defineAsyncTool({
  name: "renderVideo",
  description: "Render a video clip from a script. Takes 5-10 seconds.",
  parameters: z.object({ script: z.string() }),
  ttlSeconds: 600, // result cached 10 minutes
  execute: async ({ script }) => {
    // Pretend this is a real video render job.
    await new Promise((r) => setTimeout(r, 7_000));
    return `Rendered video for: ${script.slice(0, 40)}...`;
  },
});

const agent = new Agent({
  name: "video-bot",
  model: openai("gpt-4o"),
  tools: [renderVideo, createPollResultTool()],
  instructions:
    "When the user asks for a video, call renderVideo (returns a handle). " +
    "Then call pollResult(handle, waitMs: 10000) to retrieve the result.",
});

const result = await agent.run("Make me a 5-second clip of a sunset over the mountains.");
console.log(result.text);
