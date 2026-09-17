# Agentium examples

Short, runnable TypeScript. Docs (kid-language, every option): [docs.agentium.in](https://docs.agentium.in).

```bash
git clone https://github.com/agentiumOS/agentium-examples.git
cd agentium-examples
export OPENAI_API_KEY=sk-...
npx tsx basics/01-basic-agent.ts
```

## Start here

| File | What it shows |
|------|----------------|
| `basics/01-basic-agent.ts` | Ask a question. That's it. |
| `basics/02-agent-with-tools.ts` | Give the agent hands. |
| `basics/03-remember-a-chat.ts` | Same `sessionId` = it remembers. |
| `basics/04-watch-events.ts` | Mailbox of "stuff that happened". |
| `harness/01-deep-agent.ts` | `Agent.deep()` — project files, skills, notes, helpers. |
| `memory/file-memory.ts` | Tiny MEMORY.md / USER.md sticky notes. |

`run()` extras (all optional): `sessionId`, `userId`, `tenantId`, `metadata`, `apiKey`, `signal`, `dependencies`. Full list: [Agents](https://docs.agentium.in/agents/overview).

## Everything else

### `basics/`

| File | Description |
|------|-------------|
| `01-basic-agent.ts` | Minimal agent |
| `02-agent-with-tools.ts` | Weather + calculator tools |
| `03-remember-a-chat.ts` | Multi-turn `sessionId` |
| `04-watch-events.ts` | `eventBus.onAny` |
| `13-multimodal-structured.ts` | Image + Zod structured output |
| `14-audio-analysis-gemini.ts` | Audio with Gemini |
| `22-reasoning.ts` | Extended thinking |
| `24-tool-caching.ts` | Tool result TTL cache |

### `harness/`

| File | Description |
|------|-------------|
| `01-deep-agent.ts` | `Agent.deep()` with `AGENTS.md` + a `SKILL.md` |

### `memory/`

| File | Description |
|------|-------------|
| `file-memory.ts` | Standing MEMORY.md / USER.md |
| `unified-memory.ts` | Sessions + summaries + facts + entities |
| `23-user-memory.ts` | Cross-session `userFacts` / `userProfile` |
| `25-ask-about-me.ts` | Interactive recall |
| `semantic-cache.ts` | Similar-question cache |

### `skills/`

| File | Description |
|------|-------------|
| `basic-skill.ts` | `skill.json`-style Skill object |
| `skill-md.ts` | Progressive `SKILL.md` folders |

### Other folders

`teams/`, `workflows/`, `transport/`, `voice/`, `browser/`, `knowledge/`, `toolkits/`, `storage/`, `safety/`, `queue/`, `telemetry/`, `cost/`, `eval/`, `handoff/`, `scheduling/`, `multi-tenant/`, `rate-limiting/`, `webhooks/`.
