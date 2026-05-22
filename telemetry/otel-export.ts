/**
 * Observability — Export traces to an OpenTelemetry collector.
 *
 * Sends traces in OTLP/HTTP JSON format to Jaeger, Grafana Tempo,
 * Datadog, or any OTel-compatible backend.
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... OTEL_ENDPOINT=http://localhost:4318 npx tsx examples/telemetry/otel-export.ts
 */

import { Agent, openai } from "@agentium/core";
import { instrument, OTelExporter, ConsoleExporter } from "@agentium/observability";

const agent = new Agent({
  name: "assistant",
  model: openai("gpt-4o-mini"),
  instructions: "You are a helpful assistant.",
});

const endpoint = process.env.OTEL_ENDPOINT ?? "http://localhost:4318";

const obs = instrument(agent, {
  exporters: [
    new OTelExporter({
      endpoint,
      serviceName: "my-agent-service",
      headers: {
        // "Authorization": "Bearer ...",  // for authenticated collectors
      },
    }),
    new ConsoleExporter(),
  ],
  metrics: true,
});

console.log(`Exporting traces to ${endpoint}\n`);

await agent.run("Explain quantum computing in one sentence.");

await obs.tracer.flush();
obs.detach();

process.exit(0);
