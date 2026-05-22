import { Agent, Workflow, openai } from "@agentium/core";

interface PipelineState extends Record<string, unknown> {
  topic: string;
  research: string;
  draft: string;
  final: string;
}

const searchAgent = new Agent({
  name: "SearchAgent",
  model: openai("gpt-4o"),
  instructions: "You research topics and return key findings as bullet points.",
});

const writerAgent = new Agent({
  name: "WriterAgent",
  model: openai("gpt-4o"),
  instructions:
    "You write engaging articles based on research. Output the full article.",
});

const workflow = new Workflow<PipelineState>({
  name: "ContentPipeline",
  initialState: {
    topic: "AI in healthcare",
    research: "",
    draft: "",
    final: "",
  },
  steps: [
    {
      name: "research",
      agent: searchAgent,
      inputFrom: (state) => `Research this topic: ${state.topic}`,
    },
    {
      name: "validate",
      condition: (state) => state.research_output !== undefined,
      steps: [
        {
          name: "write",
          agent: writerAgent,
          inputFrom: (state) =>
            `Write an article about "${state.topic}" using this research:\n${state.research_output}`,
        },
      ],
    },
    {
      name: "finalize",
      run: async (state) => {
        return {
          final: (state.write_output as string) ?? state.draft,
        };
      },
    },
  ],
});

const result = await workflow.run();
console.log("Final state:", result.state.final);
console.log(
  "Steps completed:",
  result.stepResults.map((s) => `${s.stepName}: ${s.status}`)
);
