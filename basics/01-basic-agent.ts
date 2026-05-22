import { Agent, openai } from "@agentium/core";

const agent = new Agent({
  name: "Assistant",
  model: openai("gpt-4o"),
  instructions: "You are a helpful assistant. Be concise.",
});

const result = await agent.run("What is the capital of France?");
console.log(result.text);
