/**
 * Socket.IO Real-Time Agent — Stream agent responses over WebSockets.
 *
 * Uses the unified memory config for persistent sessions, summaries,
 * and user facts — all backed by MongoDB.
 *
 * Users can provide their own LLM API key in the browser UI.
 * The key is sent with each message and used for that request only.
 *
 * Prerequisites:
 *   npm install express socket.io
 *
 * Usage:
 *   npx tsx examples/transport/06-socketio-realtime.ts
 *
 * Then open http://localhost:3000 in your browser.
 */

import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import { Agent, openai, MongoDBStorage } from "@agentium/core";
import { createAgentGateway } from "@agentium/transport";

const MONGO_URI = process.env.MONGO_URI ?? "mongodb://localhost:27017";

const storage = new MongoDBStorage(MONGO_URI, "agentium_realtime", "agent_data");
await storage.initialize();
console.log("  Connected to MongoDB:", MONGO_URI);

const assistant = new Agent({
  name: "assistant",
  model: openai("gpt-4o"),
  instructions: "You are a helpful real-time assistant. Keep responses concise.",
  memory: {
    storage,
    maxMessages: 50,
    summaries: true,
    userFacts: true,
    model: openai("gpt-4o-mini"),
  },
  logLevel: "info",
});

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, {
  cors: { origin: "*" },
});

createAgentGateway({
  agents: { assistant },
  io,
  namespace: "/agentium",
});

app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agentium — Real-Time Agent</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f172a; color: #e2e8f0; min-height: 100vh;
      display: flex; flex-direction: column; align-items: center;
    }
    header {
      width: 100%; padding: 1.5rem 2rem; text-align: center;
      background: linear-gradient(135deg, #1e293b, #0f172a);
      border-bottom: 1px solid #1e293b;
    }
    header h1 { font-size: 1.5rem; font-weight: 700; color: #38bdf8; }
    header p { font-size: 0.85rem; color: #64748b; margin-top: 0.25rem; }
    .chat-container {
      width: 100%; max-width: 720px; flex: 1; display: flex;
      flex-direction: column; padding: 1rem;
    }
    .key-panel {
      background: #1e293b; border: 1px solid #334155; border-radius: 12px;
      padding: 1rem; margin-bottom: 1rem;
    }
    .key-panel summary {
      cursor: pointer; color: #94a3b8; font-size: 0.85rem; font-weight: 600;
      user-select: none;
    }
    .key-panel summary:hover { color: #e2e8f0; }
    .key-panel .key-fields { margin-top: 0.75rem; display: flex; flex-direction: column; gap: 0.5rem; }
    .key-field { display: flex; align-items: center; gap: 0.5rem; }
    .key-field label {
      font-size: 0.75rem; color: #64748b; min-width: 80px; text-transform: uppercase;
      letter-spacing: 0.05em;
    }
    .key-field input {
      flex: 1; padding: 0.5rem 0.75rem; border-radius: 8px;
      background: #0f172a; border: 1px solid #334155; color: #e2e8f0;
      font-size: 0.85rem; font-family: monospace; outline: none;
    }
    .key-field input:focus { border-color: #38bdf8; }
    .key-field input::placeholder { color: #475569; }
    .key-saved {
      font-size: 0.7rem; color: #22c55e; margin-top: 0.25rem; opacity: 0;
      transition: opacity 0.3s;
    }
    .key-saved.show { opacity: 1; }
    #messages {
      flex: 1; overflow-y: auto; display: flex; flex-direction: column;
      gap: 0.75rem; padding: 1rem 0; min-height: 300px;
    }
    .msg {
      max-width: 85%; padding: 0.75rem 1rem; border-radius: 12px;
      line-height: 1.5; font-size: 0.95rem; white-space: pre-wrap; word-break: break-word;
    }
    .msg.user {
      align-self: flex-end; background: #2563eb; color: #fff; border-bottom-right-radius: 4px;
    }
    .msg.assistant {
      align-self: flex-start; background: #1e293b; color: #e2e8f0;
      border: 1px solid #334155; border-bottom-left-radius: 4px;
    }
    .msg.error {
      align-self: flex-start; background: #7f1d1d; color: #fca5a5;
      border: 1px solid #991b1b;
    }
    .msg .label {
      font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em;
      margin-bottom: 0.25rem; opacity: 0.6;
    }
    .input-row {
      display: flex; gap: 0.5rem; padding: 0.75rem 0;
      border-top: 1px solid #1e293b;
    }
    #input {
      flex: 1; padding: 0.75rem 1rem; border-radius: 10px;
      background: #1e293b; border: 1px solid #334155; color: #e2e8f0;
      font-size: 0.95rem; outline: none; transition: border-color 0.2s;
    }
    #input:focus { border-color: #38bdf8; }
    #input::placeholder { color: #475569; }
    button {
      padding: 0.75rem 1.5rem; border-radius: 10px; border: none;
      background: #2563eb; color: #fff; font-weight: 600; font-size: 0.95rem;
      cursor: pointer; transition: background 0.2s;
    }
    button:hover { background: #1d4ed8; }
    button:disabled { background: #334155; cursor: not-allowed; }
    .status {
      font-size: 0.75rem; color: #64748b; text-align: center; padding: 0.5rem;
    }
    .status .dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      margin-right: 4px; vertical-align: middle;
    }
    .status .dot.connected { background: #22c55e; }
    .status .dot.disconnected { background: #ef4444; }
  </style>
</head>
<body>
  <header>
    <h1>Agentium Real-Time Agent</h1>
    <p>Powered by GPT-4o via Socket.IO — with unified memory</p>
  </header>

  <div class="chat-container">
    <details class="key-panel">
      <summary>API Keys</summary>
      <div class="key-fields">
        <div class="key-field">
          <label>OpenAI</label>
          <input id="openaiKey" type="password" placeholder="sk-..." />
        </div>
        <div class="key-field">
          <label>Google</label>
          <input id="googleKey" type="password" placeholder="AIza..." />
        </div>
        <div class="key-field">
          <label>Anthropic</label>
          <input id="anthropicKey" type="password" placeholder="sk-ant-..." />
        </div>
        <div class="key-saved" id="keySaved">Keys saved to session</div>
      </div>
    </details>

    <div id="messages"></div>
    <div class="input-row">
      <input id="input" placeholder="Type a message..." autocomplete="off" />
      <button id="sendBtn" onclick="send()">Send</button>
    </div>
    <div class="status" id="status">
      <span class="dot disconnected" id="dot"></span> Connecting...
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io('/agentium');
    const messages = document.getElementById('messages');
    const input = document.getElementById('input');
    const sendBtn = document.getElementById('sendBtn');
    const statusEl = document.getElementById('status');
    const keySaved = document.getElementById('keySaved');
    let currentAssistantEl = null;

    const keyInputs = {
      openai: document.getElementById('openaiKey'),
      google: document.getElementById('googleKey'),
      anthropic: document.getElementById('anthropicKey'),
    };

    for (const [provider, el] of Object.entries(keyInputs)) {
      const stored = sessionStorage.getItem('agentium_key_' + provider);
      if (stored) el.value = stored;
      el.addEventListener('input', () => {
        sessionStorage.setItem('agentium_key_' + provider, el.value);
        keySaved.classList.add('show');
        setTimeout(() => keySaved.classList.remove('show'), 1500);
      });
    }

    function getApiKey() {
      return keyInputs.openai.value || keyInputs.google.value || keyInputs.anthropic.value || undefined;
    }

    socket.on('connect', () => {
      statusEl.innerHTML = '<span class="dot connected"></span> Connected';
    });
    socket.on('disconnect', () => {
      statusEl.innerHTML = '<span class="dot disconnected"></span> Disconnected';
    });

    socket.on('agent.chunk', (data) => {
      if (!currentAssistantEl) {
        currentAssistantEl = addMessage('assistant', '');
      }
      const content = currentAssistantEl.querySelector('.content');
      content.textContent += data.chunk;
      messages.scrollTop = messages.scrollHeight;
    });

    socket.on('agent.done', () => {
      currentAssistantEl = null;
      sendBtn.disabled = false;
      input.disabled = false;
      input.focus();
    });

    socket.on('agent.error', (data) => {
      addMessage('error', data.error);
      currentAssistantEl = null;
      sendBtn.disabled = false;
      input.disabled = false;
    });

    function addMessage(role, text) {
      const el = document.createElement('div');
      el.className = 'msg ' + role;
      const label = role === 'user' ? 'You' : role === 'error' ? 'Error' : 'Assistant';
      el.innerHTML = '<div class="label">' + label + '</div><div class="content"></div>';
      el.querySelector('.content').textContent = text;
      messages.appendChild(el);
      messages.scrollTop = messages.scrollHeight;
      return el;
    }

    function send() {
      const text = input.value.trim();
      if (!text) return;
      addMessage('user', text);
      input.value = '';
      sendBtn.disabled = true;
      input.disabled = true;
      currentAssistantEl = null;
      socket.emit('agent.run', {
        name: 'assistant',
        input: text,
        apiKey: getApiKey(),
      });
    }

    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !sendBtn.disabled) send();
    });
  </script>
</body>
</html>`);
});

httpServer.listen(3000, () => {
  console.log("");
  console.log("  Agentium real-time server running on http://localhost:3000");
  console.log("");
  console.log("  Open in your browser to chat with the agent via Socket.IO");
  console.log("  Users can enter their own API key in the UI");
  console.log("");
});
