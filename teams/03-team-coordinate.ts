import { Agent, Team, TeamMode, openai } from "@agentium/core";

const researcher = new Agent({
  name: "Researcher",
  model: openai("gpt-4o"),
  instructions: "You research topics and provide detailed findings.",
});

const writer = new Agent({
  name: "Writer",
  model: openai("gpt-4o"),
  instructions: "You write polished, engaging content from research findings.",
});

const reviewer = new Agent({
  name: "Reviewer",
  model: openai("gpt-4o"),
  instructions:
    "You review content for accuracy, clarity, and suggest improvements.",
});

const team = new Team({
  name: "Content Team",
  mode: TeamMode.Coordinate,
  model: openai("gpt-4o"),
  members: [researcher, writer, reviewer],
  instructions:
    "Coordinate the team to produce high-quality content. Research first, then write, then review.",
});

const result = await team.run(
  "Write a short article about the future of renewable energy."
);
console.log(result.text);
