/**
 * MCP Chat UI — HTML interface with streaming, memory, cost tracking,
 * dynamic MCP server management, and voice agent support.
 *
 * MCP servers can be added/removed/connected at runtime via the settings panel.
 * The agent automatically picks up tools from all connected MCP servers.
 * Voice mode uses OpenAI Realtime via Socket.IO for real-time speech.
 *
 * Prerequisites:
 *   export ANTHROPIC_API_KEY=sk-ant-...
 *   export OPENAI_API_KEY=sk-...          # for embeddings + voice (OpenAI Realtime)
 *
 * Usage:
 *   npx tsx examples/toolkits/mcp-chat-ui.ts
 *   # Open http://localhost:4000
 */
import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import {
  Agent, anthropic, MongoDBStorage, CostTracker,
  VoiceAgent, openaiRealtime, openai,
} from "@agentium/core";
import type { CostSummary } from "@agentium/core";
import { MCPManager, createAdminRouter, createVoiceGateway } from "@agentium/transport";

const PORT = 4000;
const MONGO_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/agentium";
const MCP_URL = "https://api.xhipment.com/mcp";
const MCP_API_KEY = process.env.MCP_API_KEY ?? "";

async function main() {
  // ── MCP Manager (shared between admin routes and agent) ──
  const mcpManager = new MCPManager();

  // Pre-connect the Xhipment MCP server
  mcpManager.add({
    name: "xhipment",
    transport: "http",
    url: MCP_URL,
    headers: { "X-MCP-API-Key": MCP_API_KEY },
    
  });
  console.log("Connecting to Xhipment MCP server...");
  const xhipment = await mcpManager.connect("xhipment");
  console.log(`Connected — ${xhipment.toolCount} tools discovered`);

  // ── Storage, Memory & Cost ──
  const storage = new MongoDBStorage(MONGO_URI);
  const costTracker = new CostTracker({
    budget: { maxCostPerSession: 5.0, onBudgetExceeded: "warn" },
  });

  // ── Agent (tools are injected dynamically from connected MCP servers) ──
  const agent = new Agent({
    name: "logistics-assistant",
    model: anthropic("claude-sonnet-4-6"),
    maxTokens: 1024,
    reasoning: { enabled: true, budgetTokens: 2000 },
    instructions: `You are a logistics operations assistant for Xhipment.
Use the available MCP tools to answer questions about shipments, bookings, AMS/ISF filings, containers, and operations.
Be concise. Keep responses under 300 words. Use bullet points or short tables — never dump raw JSON.
Summarize tool results instead of echoing them verbatim.
Remember context from earlier in the conversation.`,
    tools: [],
    memory: {
      storage,
      maxMessages: 3,
      summaries: true,
      userProfile: true,
      model: anthropic("claude-haiku-4-5-20251001"),
    },
    maxToolRoundtrips: 2,
    toolRouter: { model: anthropic("claude-haiku-4-5-20251001"), maxTools: 5 },
    toolResultLimit: {
      maxChars: 20_000,
      strategy: "summarize",
      model: anthropic("claude-haiku-4-5-20251001"),
    },
    costTracker,
  });

  // ── Voice Agent (OpenAI Realtime, shares storage + MCP tools) ──
  const mcpTools = await mcpManager.getAllTools();
  const voiceAgent = new VoiceAgent({
    name: "logistics-voice",
    provider: openaiRealtime(),
    model: openai("gpt-4o-mini"),
    instructions: `You are a voice assistant for Xhipment logistics.
Answer questions about shipments, bookings, AMS/ISF filings, containers, and operations.
Use available tools to look up real data. Keep responses concise and conversational.
Remember context from earlier in the conversation.`,
    tools: mcpTools,
    voice: "alloy",
    memory: {
      storage,
      summaries: true,
      userFacts: true,
      userProfile: true,
      model: openai("gpt-4o-mini"),
    },
    costTracker,
    logLevel: "info",
  });

  // ── Express + Socket.IO server ──
  const app = express();
  const httpServer = createServer(app);
  const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });
  app.use(express.json());

  createVoiceGateway({
    agents: { "logistics-voice": voiceAgent },
    io,
    namespace: "/agentium-voice",
  });


  // Admin routes for MCP + toolkit management at /admin/*
  const { router: adminRouter } = createAdminRouter({ mcpManager });
  app.use("/admin", adminRouter);

  app.get("/", (_req, res) => {
    res.setHeader("Content-Type", "text/html");
    res.send(HTML);
  });

  app.post("/chat", async (req, res) => {
    const { message, sessionId, userId } = req.body;
    if (!message) return res.status(400).json({ error: "message required" });

    // Inject latest tools from all connected MCP servers
    const mcpTools = await mcpManager.getAllTools();
    agent.setTools(mcpTools);

    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    try {
      const stream = agent.stream(message, { sessionId, userId });
      for await (const chunk of stream) {
        res.write(`data: ${JSON.stringify(chunk)}\n\n`);
      }
      res.write(`data: [DONE]\n\n`);
    } catch (err: any) {
      res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    }
    res.end();
  });

  app.get("/cost", (_req, res) => {
    const summary: CostSummary = costTracker.getSummary();
    res.json(summary);
  });

  httpServer.listen(PORT, () => {
    console.log(`\n  Chat UI: http://localhost:${PORT}\n`);
  });
}

// ── HTML / CSS / JS ──────────────────────────────────────────────────────────

const HTML = /* html */ `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Xhipment AI Assistant</title>
<script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"><\/script>
<script src="https://cdn.jsdelivr.net/npm/dompurify@3/dist/purify.min.js"><\/script>
<script src="/socket.io/socket.io.js"><\/script>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg: #0f1117; --surface: #1a1d27; --surface2: #242836; --border: #2e3347;
    --text: #e1e4ed; --text-dim: #8b8fa3;
    --accent: #6366f1; --accent-light: #818cf8;
    --user-bg: #6366f1; --assistant-bg: #1e2235;
    --green: #22c55e; --orange: #f59e0b; --red: #ef4444;
  }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: var(--bg); color: var(--text); height: 100vh; display: flex; flex-direction: column; }

  header { background: var(--surface); border-bottom: 1px solid var(--border); padding: 14px 24px; display: flex; align-items: center; justify-content: space-between; flex-shrink: 0; }
  header h1 { font-size: 18px; font-weight: 600; display: flex; align-items: center; gap: 10px; }
  header h1 em { color: var(--accent-light); font-style: normal; }
  .header-actions { display: flex; gap: 8px; align-items: center; }

  .badge { font-size: 12px; background: var(--surface2); border: 1px solid var(--border); border-radius: 20px; padding: 5px 14px; color: var(--text-dim); cursor: pointer; transition: background .2s; }
  .badge:hover { background: var(--border); }

  #messages { flex: 1; overflow-y: auto; padding: 20px 24px; display: flex; flex-direction: column; gap: 16px; }
  .msg { max-width: 80%; padding: 12px 16px; border-radius: 16px; line-height: 1.6; font-size: 14px; white-space: pre-wrap; word-wrap: break-word; }
  .msg.user { align-self: flex-end; background: var(--user-bg); color: #fff; border-bottom-right-radius: 4px; }
  .msg.assistant { align-self: flex-start; background: var(--assistant-bg); border: 1px solid var(--border); border-bottom-left-radius: 4px; }
  .msg .tool-call { display: inline-block; background: var(--surface2); border: 1px solid var(--border); border-radius: 6px; padding: 2px 8px; font-size: 12px; color: var(--accent-light); margin: 4px 2px; font-family: 'SF Mono', Monaco, monospace; }

  .typing-indicator { display: flex; gap: 4px; padding: 12px 16px; align-self: flex-start; }
  .typing-indicator span { width: 8px; height: 8px; background: var(--text-dim); border-radius: 50%; animation: bounce .6s infinite alternate; }
  .typing-indicator span:nth-child(2) { animation-delay: .2s; }
  .typing-indicator span:nth-child(3) { animation-delay: .4s; }
  @keyframes bounce { to { transform: translateY(-6px); opacity: .4; } }

  #input-area { background: var(--surface); border-top: 1px solid var(--border); padding: 16px 24px; display: flex; gap: 12px; flex-shrink: 0; }
  #input-area textarea { flex: 1; background: var(--surface2); border: 1px solid var(--border); border-radius: 12px; padding: 12px 16px; color: var(--text); font-size: 14px; font-family: inherit; resize: none; outline: none; min-height: 44px; max-height: 120px; transition: border-color .2s; }
  #input-area textarea:focus { border-color: var(--accent); }
  #input-area textarea::placeholder { color: var(--text-dim); }
  #send-btn { background: var(--accent); color: #fff; border: none; border-radius: 12px; padding: 0 20px; font-size: 14px; font-weight: 600; cursor: pointer; transition: background .2s; white-space: nowrap; }
  #send-btn:hover { background: var(--accent-light); }
  #send-btn:disabled { opacity: .4; cursor: default; }

  /* ── Panels (cost + MCP settings) ── */
  .panel { display: none; position: fixed; top: 60px; right: 24px; background: var(--surface); border: 1px solid var(--border); border-radius: 12px; padding: 16px 20px; font-size: 13px; z-index: 100; box-shadow: 0 8px 32px rgba(0,0,0,.4); }
  .panel h3 { font-size: 14px; margin-bottom: 12px; color: var(--accent-light); }
  .panel .row { display: flex; justify-content: space-between; padding: 3px 0; }
  .panel .row .label { color: var(--text-dim); }
  #cost-panel { min-width: 220px; }

  /* ── MCP Panel ── */
  #mcp-panel { min-width: 420px; max-width: 480px; max-height: 80vh; overflow-y: auto; right: 24px; }
  #mcp-panel .server-card { background: var(--surface2); border: 1px solid var(--border); border-radius: 8px; padding: 10px 14px; margin-bottom: 8px; }
  #mcp-panel .server-card .server-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  #mcp-panel .server-card .server-name { font-weight: 600; font-size: 13px; }
  #mcp-panel .server-card .server-meta { font-size: 11px; color: var(--text-dim); }
  .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 6px; }
  .status-dot.connected { background: var(--green); }
  .status-dot.disconnected { background: var(--text-dim); }
  .status-dot.connecting { background: var(--orange); }
  .status-dot.error { background: var(--red); }
  .server-actions { display: flex; gap: 6px; }
  .server-actions button { font-size: 11px; padding: 3px 10px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text-dim); cursor: pointer; transition: all .2s; }
  .server-actions button:hover { background: var(--border); color: var(--text); }
  .server-actions button.danger:hover { background: #3b1520; color: var(--red); border-color: var(--red); }

  /* ── Add MCP Form ── */
  #mcp-form { border-top: 1px solid var(--border); padding-top: 12px; margin-top: 4px; }
  #mcp-form input, #mcp-form select { width: 100%; background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 8px 12px; color: var(--text); font-size: 13px; margin-bottom: 8px; outline: none; font-family: inherit; }
  #mcp-form input:focus, #mcp-form select:focus { border-color: var(--accent); }
  #mcp-form input::placeholder { color: var(--text-dim); }
  #mcp-form .form-row { display: flex; gap: 8px; }
  #mcp-form .form-row > * { flex: 1; }
  #add-mcp-btn { width: 100%; background: var(--accent); color: #fff; border: none; border-radius: 8px; padding: 8px; font-size: 13px; font-weight: 600; cursor: pointer; transition: background .2s; }
  #add-mcp-btn:hover { background: var(--accent-light); }
  #add-mcp-btn:disabled { opacity: .4; cursor: default; }
  #mcp-error { color: var(--red); font-size: 12px; margin-bottom: 6px; display: none; }

  /* ── Markdown rendering ── */
  .msg.assistant { white-space: normal; }
  .msg.assistant p { margin: 0 0 10px 0; }
  .msg.assistant p:last-child { margin-bottom: 0; }
  .msg.assistant ul, .msg.assistant ol { margin: 0 0 10px 20px; padding: 0; }
  .msg.assistant li { margin-bottom: 4px; }
  .msg.assistant h1, .msg.assistant h2, .msg.assistant h3, .msg.assistant h4 {
    margin: 14px 0 8px 0; font-weight: 600;
  }
  .msg.assistant h1 { font-size: 18px; }
  .msg.assistant h2 { font-size: 16px; }
  .msg.assistant h3 { font-size: 15px; }
  .msg.assistant h4 { font-size: 14px; }
  .msg.assistant code {
    background: var(--surface2); border: 1px solid var(--border); border-radius: 4px;
    padding: 1px 5px; font-size: 12px; font-family: 'SF Mono', Monaco, Consolas, monospace;
  }
  .msg.assistant pre {
    background: var(--bg); border: 1px solid var(--border); border-radius: 8px;
    padding: 12px; margin: 8px 0; overflow-x: auto;
  }
  .msg.assistant pre code { background: none; border: none; padding: 0; font-size: 13px; }
  .msg.assistant table {
    width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 13px;
  }
  .msg.assistant th, .msg.assistant td {
    border: 1px solid var(--border); padding: 6px 10px; text-align: left;
  }
  .msg.assistant th { background: var(--surface2); font-weight: 600; }
  .msg.assistant blockquote {
    border-left: 3px solid var(--accent); padding: 4px 12px; margin: 8px 0;
    color: var(--text-dim); font-style: italic;
  }
  .msg.assistant a { color: var(--accent-light); text-decoration: none; }
  .msg.assistant a:hover { text-decoration: underline; }
  .msg.assistant hr { border: none; border-top: 1px solid var(--border); margin: 12px 0; }
  .msg.assistant strong { font-weight: 600; }

  /* ── Voice UI ── */
  #mic-btn { width: 44px; height: 44px; border-radius: 50%; border: 1px solid var(--border); background: var(--surface2); color: var(--text-dim); cursor: pointer; display: flex; align-items: center; justify-content: center; transition: all .2s; flex-shrink: 0; }
  #mic-btn:hover { background: var(--border); color: var(--text); }
  #mic-btn.active { background: var(--red); border-color: var(--red); color: #fff; animation: pulse-mic 1.5s ease-in-out infinite; }
  @keyframes pulse-mic { 0%,100% { box-shadow: 0 0 0 0 rgba(239,68,68,.4); } 50% { box-shadow: 0 0 0 10px rgba(239,68,68,0); } }
  #voice-bar { display: none; background: var(--surface); border-bottom: 1px solid var(--border); padding: 8px 24px; font-size: 12px; color: var(--text-dim); flex-shrink: 0; align-items: center; gap: 8px; }
  #voice-bar.active { display: flex; }
  #voice-bar .voice-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--green); animation: pulse-mic 1.5s ease-in-out infinite; }
  .msg.voice-transcript { border-left: 3px solid var(--green); opacity: 0.85; }

  #messages::-webkit-scrollbar { width: 6px; }
  #messages::-webkit-scrollbar-track { background: transparent; }
  #messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
</style>
</head>
<body>
  <header>
    <h1><em>Xhipment</em> AI Assistant</h1>
    <div class="header-actions">
      <div class="badge" id="mcp-badge" onclick="togglePanel('mcp-panel')">0 MCP servers</div>
      <div class="badge" id="cost-badge" onclick="togglePanel('cost-panel')">$0.000 &middot; 0 tokens</div>
    </div>
  </header>

  <!-- Voice status bar -->
  <div id="voice-bar"><span class="voice-dot"></span><span id="voice-status">Listening...</span></div>

  <!-- Cost Panel -->
  <div class="panel" id="cost-panel">
    <h3>Cost Breakdown</h3>
    <div id="cost-details"></div>
  </div>

  <!-- MCP Settings Panel -->
  <div class="panel" id="mcp-panel">
    <h3>MCP Servers</h3>
    <div id="mcp-servers"></div>
    <div id="mcp-form">
      <div id="mcp-error"></div>
      <input id="mcp-name" placeholder="Server name (e.g. xhipment)" />
      <div class="form-row">
        <select id="mcp-transport">
          <option value="sse">SSE</option>
          <option value="http">HTTP</option>
          <option value="stdio">Stdio</option>
        </select>
      </div>
      <input id="mcp-url" placeholder="URL (e.g. http://localhost:3000/mcp/sse)" />
      <input id="mcp-command" placeholder="Command (stdio only)" style="display:none" />
      <input id="mcp-args" placeholder="Args, comma-separated (stdio only)" style="display:none" />
      <input id="mcp-headers" placeholder="Headers as JSON (e.g. {&quot;X-API-Key&quot;:&quot;...&quot;})" />
      <button id="add-mcp-btn" onclick="addMCP()">Add &amp; Connect</button>
    </div>
  </div>

  <div id="messages"></div>
  <div id="input-area">
    <textarea id="input" rows="1" placeholder="Ask about shipments, filings, bookings..." autofocus></textarea>
    <button id="send-btn" onclick="send()">Send</button>
    <button id="mic-btn" onclick="toggleVoice()" title="Voice mode">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"></path>
        <path d="M19 10v2a7 7 0 0 1-14 0v-2"></path>
        <line x1="12" y1="19" x2="12" y2="23"></line>
        <line x1="8" y1="23" x2="16" y2="23"></line>
      </svg>
    </button>
  </div>

<script>
const SESSION_ID = 'session-' + Math.random().toString(36).slice(2, 10);
const USER_ID = 'user-' + SESSION_ID.slice(8);
const messagesEl = document.getElementById('messages');
const inputEl = document.getElementById('input');
const sendBtn = document.getElementById('send-btn');
let busy = false;

// ── Transport toggle ──
document.getElementById('mcp-transport').addEventListener('change', function() {
  const isStdio = this.value === 'stdio';
  document.getElementById('mcp-url').style.display = isStdio ? 'none' : '';
  document.getElementById('mcp-command').style.display = isStdio ? '' : 'none';
  document.getElementById('mcp-args').style.display = isStdio ? '' : 'none';
});

// ── MCP Server Management ──
async function loadMCPServers() {
  try {
    const resp = await fetch('/admin/mcp');
    const servers = await resp.json();
    const container = document.getElementById('mcp-servers');
    const badge = document.getElementById('mcp-badge');
    const connected = servers.filter(s => s.status === 'connected');
    const totalTools = connected.reduce((sum, s) => sum + s.toolCount, 0);
    badge.textContent = connected.length + ' MCP servers \\u00b7 ' + totalTools + ' tools';

    if (servers.length === 0) {
      container.innerHTML = '<div style="color:var(--text-dim);font-size:12px;margin-bottom:8px">No servers configured. Add one below.</div>';
      return;
    }

    container.innerHTML = servers.map(s => {
      return '<div class="server-card">' +
        '<div class="server-header">' +
          '<div><span class="status-dot ' + s.status + '"></span><span class="server-name">' + esc(s.name) + '</span></div>' +
          '<div class="server-actions">' +
            (s.status === 'connected'
              ? '<button onclick="mcpAction(\\'' + esc(s.id) + '\\',\\'disconnect\\')">Disconnect</button>'
              : '<button onclick="mcpAction(\\'' + esc(s.id) + '\\',\\'connect\\')">Connect</button>') +
            '<button class="danger" onclick="mcpAction(\\'' + esc(s.id) + '\\',\\'remove\\')">Remove</button>' +
          '</div>' +
        '</div>' +
        '<div class="server-meta">' + esc(s.transport) + (s.url ? ' &middot; ' + esc(s.url) : '') +
          ' &middot; ' + s.toolCount + ' tools' +
          (s.error ? ' &middot; <span style="color:var(--red)">' + esc(s.error) + '</span>' : '') +
        '</div>' +
      '</div>';
    }).join('');
  } catch {}
}

async function mcpAction(id, action) {
  try {
    if (action === 'remove') {
      await fetch('/admin/mcp/' + encodeURIComponent(id), { method: 'DELETE' });
    } else {
      await fetch('/admin/mcp/' + encodeURIComponent(id) + '/' + action, { method: 'POST' });
    }
    await loadMCPServers();
  } catch {}
}

async function addMCP() {
  const errEl = document.getElementById('mcp-error');
  errEl.style.display = 'none';
  const name = document.getElementById('mcp-name').value.trim();
  const transport = document.getElementById('mcp-transport').value;
  const url = document.getElementById('mcp-url').value.trim();
  const command = document.getElementById('mcp-command').value.trim();
  const argsStr = document.getElementById('mcp-args').value.trim();
  const headersStr = document.getElementById('mcp-headers').value.trim();

  if (!name) { showMCPError('Name is required'); return; }
  if (transport !== 'stdio' && !url) { showMCPError('URL is required'); return; }

  const body = { name, transport, autoConnect: true };
  if (url) body.url = url;
  if (command) body.command = command;
  if (argsStr) body.args = argsStr.split(',').map(s => s.trim());
  if (headersStr) {
    try { body.headers = JSON.parse(headersStr); }
    catch { showMCPError('Invalid headers JSON'); return; }
  }

  const btn = document.getElementById('add-mcp-btn');
  btn.disabled = true;
  btn.textContent = 'Connecting...';

  try {
    const resp = await fetch('/admin/mcp', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await resp.json();
    if (!resp.ok) { showMCPError(data.error || 'Failed'); return; }
    if (data.status === 'error') { showMCPError('Connected with error: ' + (data.error || 'unknown')); }

    document.getElementById('mcp-name').value = '';
    document.getElementById('mcp-url').value = '';
    document.getElementById('mcp-command').value = '';
    document.getElementById('mcp-args').value = '';
    document.getElementById('mcp-headers').value = '';
    await loadMCPServers();
  } catch (e) {
    showMCPError(e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add & Connect';
  }
}

function showMCPError(msg) {
  const el = document.getElementById('mcp-error');
  el.textContent = msg;
  el.style.display = 'block';
}

// ── Chat ──
inputEl.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
});
inputEl.addEventListener('input', () => {
  inputEl.style.height = 'auto';
  inputEl.style.height = Math.min(inputEl.scrollHeight, 120) + 'px';
});

function addMessage(role, html) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.innerHTML = html;
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
  return div;
}
function showTyping() {
  const div = document.createElement('div');
  div.className = 'typing-indicator'; div.id = 'typing';
  div.innerHTML = '<span></span><span></span><span></span>';
  messagesEl.appendChild(div);
  messagesEl.scrollTop = messagesEl.scrollHeight;
}
function hideTyping() { const el = document.getElementById('typing'); if (el) el.remove(); }

async function send() {
  const text = inputEl.value.trim();
  if (!text || busy) return;
  busy = true; sendBtn.disabled = true;
  inputEl.value = ''; inputEl.style.height = 'auto';
  addMessage('user', esc(text));
  showTyping();

  try {
    const resp = await fetch('/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: text, sessionId: SESSION_ID, userId: USER_ID }),
    });
    hideTyping();
    const msgDiv = addMessage('assistant', '');
    let fullText = '', toolCalls = [];
    const reader = resp.body.getReader();
    const dec = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      const lines = buf.split('\\n');
      buf = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const data = line.slice(6);
        if (data === '[DONE]') continue;
        try {
          const chunk = JSON.parse(data);
          if (chunk.type === 'text') {
            fullText += chunk.text;
            msgDiv.innerHTML = fmtMsg(fullText, toolCalls);
            messagesEl.scrollTop = messagesEl.scrollHeight;
          } else if (chunk.type === 'tool_call_start') {
            toolCalls.push(chunk.toolCall.name);
            msgDiv.innerHTML = fmtMsg(fullText, toolCalls);
          } else if (chunk.type === 'error') {
            msgDiv.innerHTML += '<div style="color:var(--red)">Error: ' + esc(chunk.error) + '</div>';
          }
        } catch {}
      }
    }
    msgDiv.innerHTML = fmtMsg(fullText, toolCalls);
    updateCost();
  } catch (err) {
    hideTyping();
    addMessage('assistant', '<span style="color:var(--red)">Connection error: ' + esc(err.message) + '</span>');
  }
  busy = false; sendBtn.disabled = false; inputEl.focus();
}

marked.setOptions({ breaks: true, gfm: true });

function fmtMsg(text, toolCalls) {
  let h = '';
  if (toolCalls.length) h += toolCalls.map(t => '<span class="tool-call">' + esc(t) + '</span>').join(' ');
  if (text) {
    if (toolCalls.length) h += '<br>';
    h += DOMPurify.sanitize(marked.parse(text));
  }
  return h;
}
function esc(s) { return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

// ── Cost ──
async function updateCost() {
  try {
    const data = await (await fetch('/cost')).json();
    const tokens = data.totalTokens?.totalTokens || 0;
    document.getElementById('cost-badge').textContent = '$' + (data.totalCost||0).toFixed(4) + ' \\u00b7 ' + tokens.toLocaleString() + ' tokens';
    document.getElementById('cost-details').innerHTML =
      row('Total Cost','$'+(data.totalCost||0).toFixed(6)) +
      row('Prompt Tokens',(data.totalTokens?.promptTokens||0).toLocaleString()) +
      row('Completion Tokens',(data.totalTokens?.completionTokens||0).toLocaleString()) +
      row('Total Tokens',tokens.toLocaleString()) +
      row('Requests',(data.entries||0).toString());
  } catch {}
}
function row(l,v) { return '<div class="row"><span class="label">'+l+'</span><span>'+v+'</span></div>'; }

// ── Panel toggle ──
function togglePanel(id) {
  document.querySelectorAll('.panel').forEach(p => { if (p.id !== id) p.style.display = 'none'; });
  const panel = document.getElementById(id);
  const show = panel.style.display !== 'block';
  panel.style.display = show ? 'block' : 'none';
  if (show && id === 'mcp-panel') loadMCPServers();
  if (show && id === 'cost-panel') updateCost();
}
document.addEventListener('click', e => {
  document.querySelectorAll('.panel').forEach(panel => {
    if (panel.style.display === 'block' && !panel.contains(e.target) && !e.target.classList.contains('badge')) {
      panel.style.display = 'none';
    }
  });
});

// ── Voice Agent (Socket.IO + Web Audio) ──
let voiceActive = false;
let voiceSocket = null;
let audioCtx = null;
let micStream = null;
let micProcessor = null;
const SAMPLE_RATE = 24000;
let playQueue = [];
let isPlaying = false;

function toggleVoice() {
  if (voiceActive) stopVoice();
  else startVoice();
}

async function startVoice() {
  try {
    micStream = await navigator.mediaDevices.getUserMedia({
      audio: { sampleRate: SAMPLE_RATE, channelCount: 1, echoCancellation: true, noiseSuppression: true }
    });
  } catch (e) {
    addMessage('assistant', '<span style="color:var(--red)">Microphone access denied: ' + esc(e.message) + '</span>');
    return;
  }

  audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: SAMPLE_RATE });

  voiceSocket = io('/agentium-voice', { transports: ['websocket'] });

  voiceSocket.on('connect', () => {
    voiceSocket.emit('voice.start', { agentName: 'logistics-voice', userId: USER_ID, sessionId: SESSION_ID });
  });

  voiceSocket.on('voice.started', () => {
    voiceActive = true;
    document.getElementById('mic-btn').classList.add('active');
    document.getElementById('voice-bar').classList.add('active');
    setVoiceStatus('Listening...');
    startMicCapture();
  });

  voiceSocket.on('voice.audio', (data) => {
    playAudioChunk(data.data);
  });

  let voiceMsgDiv = null;
  let voiceMsgRole = '';
  let voiceFullText = '';

  voiceSocket.on('voice.transcript', (data) => {
    const role = data.role === 'user' ? 'user' : 'assistant';
    if (data.role === 'user') {
      setVoiceStatus('Processing...');
    } else {
      setVoiceStatus('Assistant speaking...');
    }
    if (role !== voiceMsgRole || !voiceMsgDiv) {
      voiceFullText = data.text;
      voiceMsgDiv = addMessage(role, esc(data.text));
      voiceMsgDiv.classList.add('voice-transcript');
      voiceMsgRole = role;
    } else {
      voiceFullText += data.text;
      voiceMsgDiv.innerHTML = esc(voiceFullText);
      messagesEl.scrollTop = messagesEl.scrollHeight;
    }
  });

  voiceSocket.on('voice.text', (data) => {
    voiceMsgDiv = addMessage('assistant', DOMPurify.sanitize(marked.parse(data.text)));
    voiceMsgRole = 'assistant';
    voiceFullText = '';
  });

  voiceSocket.on('voice.tool.call', (data) => {
    voiceMsgDiv = null;
    voiceMsgRole = '';
    voiceFullText = '';
    addMessage('assistant', '<span class="tool-call">' + esc(data.name) + '</span>');
  });

  voiceSocket.on('voice.tool.result', (data) => {
    voiceMsgDiv = null;
    voiceMsgRole = '';
    voiceFullText = '';
    setVoiceStatus('Listening...');
  });

  voiceSocket.on('voice.interrupted', () => {
    playQueue = [];
    voiceMsgDiv = null;
    voiceMsgRole = '';
    voiceFullText = '';
    setVoiceStatus('Listening...');
  });

  voiceSocket.on('voice.usage', () => {
    updateCost();
  });

  voiceSocket.on('voice.error', (data) => {
    addMessage('assistant', '<span style="color:var(--red)">Voice error: ' + esc(data.error) + '</span>');
  });

  voiceSocket.on('voice.stopped', () => {
    cleanupVoice();
    updateCost();
  });

  voiceSocket.on('disconnect', () => {
    cleanupVoice();
  });
}

function stopVoice() {
  if (voiceSocket) {
    voiceSocket.emit('voice.stop');
    voiceSocket.disconnect();
  }
  cleanupVoice();
}

function cleanupVoice() {
  voiceActive = false;
  document.getElementById('mic-btn').classList.remove('active');
  document.getElementById('voice-bar').classList.remove('active');
  if (micProcessor) { micProcessor.disconnect(); micProcessor = null; }
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
  if (audioCtx) { audioCtx.close().catch(() => {}); audioCtx = null; }
  playQueue = [];
  isPlaying = false;
  voiceSocket = null;
}

function setVoiceStatus(text) {
  document.getElementById('voice-status').textContent = text;
}

function startMicCapture() {
  if (!audioCtx || !micStream) return;
  const source = audioCtx.createMediaStreamSource(micStream);
  micProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
  micProcessor.onaudioprocess = (e) => {
    if (!voiceActive || !voiceSocket) return;
    const float32 = e.inputBuffer.getChannelData(0);
    const int16 = new Int16Array(float32.length);
    for (let i = 0; i < float32.length; i++) {
      const s = Math.max(-1, Math.min(1, float32[i]));
      int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    const bytes = new Uint8Array(int16.buffer);
    let b64 = '';
    for (let i = 0; i < bytes.length; i++) b64 += String.fromCharCode(bytes[i]);
    voiceSocket.emit('voice.audio', { data: btoa(b64) });
  };
  source.connect(micProcessor);
  micProcessor.connect(audioCtx.destination);
}

function playAudioChunk(base64) {
  if (!audioCtx) return;
  const raw = atob(base64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 0x8000;

  const buffer = audioCtx.createBuffer(1, float32.length, SAMPLE_RATE);
  buffer.getChannelData(0).set(float32);
  playQueue.push(buffer);
  if (!isPlaying) drainPlayQueue();
}

function drainPlayQueue() {
  if (!audioCtx || playQueue.length === 0) { isPlaying = false; return; }
  isPlaying = true;
  const buffer = playQueue.shift();
  const src = audioCtx.createBufferSource();
  src.buffer = buffer;
  src.connect(audioCtx.destination);
  src.onended = () => drainPlayQueue();
  src.start();
}

loadMCPServers();
</script>
</body>
</html>`;

main().catch(console.error);
