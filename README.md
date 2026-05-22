# Agentium Examples

Runnable examples organized by feature area.

```
npx tsx examples/<category>/<file>.ts
```

## Categories

### `basics/` — Getting Started

| File | Description |
|------|-------------|
| `01-basic-agent.ts` | Minimal agent with a single prompt |
| `02-agent-with-tools.ts` | Agent with tool calling (weather + calculator) |
| `13-multimodal-structured.ts` | Multi-modal input + structured output (Zod) |
| `14-audio-analysis-gemini.ts` | Audio analysis with Gemini |
| `22-reasoning.ts` | Extended thinking with Gemini |
| `24-tool-caching.ts` | Tool result caching with TTL |

### `memory/` — Unified Memory & Caching

| File | Description |
|------|-------------|
| `unified-memory.ts` | Full-feature demo: sessions, summaries, facts, profile, entities, decisions, curator |
| `23-user-memory.ts` | Cross-session personalization with user facts and profile |
| `25-ask-about-me.ts` | Interactive REPL with recall tools |
| `browser-with-memory.ts` | BrowserAgent with persistent context |
| `semantic-cache.ts` | Cache LLM responses by semantic similarity |

### `skills/` — Skills System

| File | Description |
|------|-------------|
| `basic-skill.ts` | Define and load a Skill (tool bundle + instructions) |
| `learned-skills.ts` | Save and replay successful multi-step workflows |

### `handoff/` — Agent Handoff

| File | Description |
|------|-------------|
| `agent-handoff.ts` | Transfer conversations to specialist agents mid-conversation |

### `cost/` — Cost Tracking

| File | Description |
|------|-------------|
| `cost-tracking.ts` | Track token usage, costs, and enforce budgets |

### `eval/` — Evaluation Framework

| File | Description |
|------|-------------|
| `eval-suite.ts` | Automated agent quality testing with scorers and reporters |

### `webhooks/` — Event Destinations

| File | Description |
|------|-------------|
| `webhook-destinations.ts` | Push agent events to HTTP, Slack, and custom destinations |

### `telemetry/` — Observability

| File | Description |
|------|-------------|
| `basic-tracing.ts` | Trace agent runs with ConsoleExporter, metrics, and structured logs |
| `otel-export.ts` | Export traces to an OpenTelemetry collector (Jaeger, Grafana Tempo) |
| `langfuse.ts` | Export traces to Langfuse |

### `teams/` — Multi-Agent Teams

| File | Description |
|------|-------------|
| `03-team-coordinate.ts` | Team of agents in Coordinate mode |

### `workflows/` — Sequential Workflows

| File | Description |
|------|-------------|
| `04-workflow.ts` | Workflow with sequential steps and state |

### `transport/` — HTTP, Socket.IO, A2A

| File | Description |
|------|-------------|
| `05-express-server.ts` | Agent behind Express REST endpoints |
| `06-socketio-realtime.ts` | Socket.IO real-time streaming with unified memory |
| `15-express-swagger.ts` | Express + Swagger UI with multi-model agents |
| `17-a2a-server.ts` | A2A-compliant agent server |
| `18-a2a-client.ts` | A2A remote agent client (direct, tool, team) |

### `voice/` — Voice Agents

| File | Description |
|------|-------------|
| `26-voice-openai.ts` | Voice agent with OpenAI Realtime (mic + speaker) |
| `26-voice-openai-test.ts` | Voice test: text-in, WAV-out |
| `27-voice-google.ts` | Voice agent with Google Gemini Live |
| `27-voice-google-test.ts` | Voice test: Google Gemini Live |
| `29-voice-socketio.ts` | Voice over Socket.IO with unified memory |

### `browser/` — Browser Automation

| File | Description |
|------|-------------|
| `30-browser-agent.ts` | Vision + DOM hybrid with stealth & video |
| `31-browser-as-tool.ts` | BrowserAgent composed as a tool |
| `32-browser-gateway.ts` | Browser agent streamed via Socket.IO |
| `33-browser-auth.ts` | Browser agent with CredentialVault |

### `knowledge/` — RAG & Knowledge Bases

| File | Description |
|------|-------------|
| `10-rag-agent.ts` | RAG agent with InMemory KnowledgeBase |
| `11-rag-qdrant.ts` | RAG agent with Qdrant |
| `12-rag-mongodb.ts` | RAG agent with MongoDB Atlas |
| `28-hybrid-search.ts` | Hybrid search (vector + BM25 + RRF) |

### `toolkits/` — External Toolkits

| File | Description |
|------|-------------|
| `16-mcp-tools.ts` | MCP tool provider (GitHub) |
| `19-hackernews-toolkit.ts` | HackerNews toolkit |
| `20-gmail-toolkit.ts` | Gmail toolkit |
| `21-whatsapp-toolkit.ts` | WhatsApp toolkit |

### `storage/` — Storage & Vector Stores

| File | Description |
|------|-------------|
| `08-storage-drivers.ts` | KV storage (InMemory, SQLite, Postgres, MongoDB) |
| `09-vector-stores.ts` | Vector similarity search across backends |

### `safety/` — Safety & Approvals

| File | Description |
|------|-------------|
| `34-sandbox-tools.ts` | Sandboxed tool execution (timeout, memory limits) |
| `35-human-in-the-loop.ts` | Human-in-the-loop approval for sensitive tools |

### `queue/` — Background Jobs

| File | Description |
|------|-------------|
| `07-background-job.ts` | Agent jobs via BullMQ queue/worker |
