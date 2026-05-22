/**
 * Voice Agent over Socket.IO — with unified memory for persistent sessions.
 *
 * Uses the unified memory config (same as Agent and BrowserAgent):
 *   - sessions + summaries → conversation transcripts auto-saved
 *   - userFacts            → user facts auto-extracted via LLM
 *   - userProfile          → structured profile data (name, role, etc.)
 *
 * All data is stored in MongoDB, so memories survive server restarts.
 * The voice gateway is a thin transport layer — just relays Socket.IO events.
 *
 * Prerequisites:
 *   npm install express socket.io mongodb
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... MONGODB_URI=mongodb://localhost:27017 npx tsx examples/voice/29-voice-socketio.ts
 *
 * Then open http://localhost:3001, enter a User ID, and click "Start Voice".
 */

import express from "express";
import { createServer } from "http";
import { Server as SocketIOServer } from "socket.io";
import {
  VoiceAgent,
  openaiRealtime,
  openai,
  MongoDBStorage,
  defineTool,
} from "@agentium/core";
import { createVoiceGateway } from "@agentium/transport";
import { z } from "zod";

// ── MongoDB-backed storage (persists across restarts) ─────────────────────

const MONGO_URI = process.env.MONGODB_URI ?? "mongodb://localhost:27017";
const mongoStorage = new MongoDBStorage(MONGO_URI, "agentium", "voice_memory");

// ── Tools ─────────────────────────────────────────────────────────────────

const weatherTool = defineTool({
  name: "getWeather",
  description: "Get the current weather for a city",
  parameters: z.object({
    city: z.string().describe("City name"),
  }),
  execute: async ({ city }) => {
    const conditions = ["sunny", "cloudy", "rainy", "snowy"];
    const temp = Math.floor(Math.random() * 30) + 5;
    const condition = conditions[Math.floor(Math.random() * conditions.length)];
    return `${city}: ${temp}°C, ${condition}`;
  },
});

const notepadTool = defineTool({
  name: "saveNote",
  description: "Save a note or reminder for the user",
  parameters: z.object({
    title: z.string().describe("Short title for the note"),
    content: z.string().describe("Content of the note"),
  }),
  execute: async ({ title, content }) => {
    console.log(`  [Note saved] ${title}: ${content}`);
    return `Note saved: "${title}"`;
  },
});

const trackShipmentTool = defineTool({
  name: "trackShipment",
  description:
    "Track a shipment by its tracking number (e.g. XQAMZFCL022619143M). Returns milestones, container info, and current status.",
  parameters: z.object({
    trackingNumber: z
      .string()
      .describe("The shipment tracking number to look up"),
  }),
  execute: async ({ trackingNumber }) => {
    const url = `https://api.xhipment.com/api/v1/utils/publictracking?track=${encodeURIComponent(trackingNumber)}`;
    const res = await fetch(url, {
      headers: {
        accept: "*/*",
        origin: "https://www.xhipment.com",
        referer: "https://www.xhipment.com/",
      },
    });

    if (!res.ok) {
      return `Failed to track shipment: HTTP ${res.status}`;
    }

    const data = await res.json();
    if (!data.success || !data.result) {
      return `No tracking data found for ${trackingNumber}`;
    }

    const r = data.result;
    const milestones = (r.milestones ?? [])
      .filter((m: any) => m.dateTime)
      .map((m: any) => {
        const date = new Date(m.dateTime).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
          year: "numeric",
        });
        return `${m.view?.customer ?? m.value} — ${date}`;
      })
      .join("; ");

    const containers = (r.containerCodes ?? [])
      .map((c: any) => `${c.containerCode} (${c.carrierCode})`)
      .join(", ");

    const lastMilestone = r.milestones
      ?.filter((m: any) => m.dateTime)
      .sort(
        (a: any, b: any) =>
          new Date(b.dateTime).getTime() - new Date(a.dateTime).getTime(),
      )[0];

    const currentStatus = lastMilestone?.view?.customer ?? "Unknown";

    return [
      `Tracking: ${r.QuoteIdentity ?? trackingNumber}`,
      `Booking: ${r.bookingIdentity ?? "N/A"}`,
      `Current Status: ${currentStatus}`,
      `Containers: ${containers || "None assigned"}`,
      `Milestones: ${milestones || "None"}`,
    ].join("\n");
  },
});

// ── Voice Agent (unified memory config) ───────────────────────────────────

const assistant = new VoiceAgent({
  name: "assistant",
  provider: openaiRealtime("gpt-4o-realtime-preview"),
  model: openai("gpt-4o-mini"),

  memory: {
    storage: mongoStorage,
    summaries: true,
    userFacts: true,
    userProfile: true,
    model: openai("gpt-4o-mini"),
  },

  instructions: `You are a friendly voice assistant for Xhipment, a logistics platform. You have persistent memory across sessions — facts about the user are automatically loaded when they connect.

Key behaviors:
- If you have facts about this user, greet them by name and reference relevant facts naturally.
- You can track shipments — when the user gives a tracking number, use the trackShipment tool.
- You can check weather and save notes.
- Keep responses concise and conversational.
- User facts are automatically saved when the session ends, so just have a natural conversation.`,
  tools: [weatherTool, notepadTool, trackShipmentTool],
  voice: "alloy",
  logLevel: "info",
});

// ── Server (gateway is just a thin transport relay) ───────────────────────

const app = express();
const httpServer = createServer(app);
const io = new SocketIOServer(httpServer, { cors: { origin: "*" } });

createVoiceGateway({
  agents: { assistant },
  io,
  namespace: "/agentium-voice",
});

app.get("/", (_req, res) => {
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Agentium — Voice Agent</title>
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
    .container {
      width: 100%; max-width: 720px; flex: 1; display: flex;
      flex-direction: column; padding: 1rem; gap: 1rem;
    }
    .controls {
      display: flex; gap: 0.75rem; justify-content: center; padding: 1rem;
      flex-wrap: wrap;
    }
    .btn {
      padding: 0.75rem 1.5rem; border-radius: 12px; border: none;
      font-weight: 600; font-size: 0.95rem; cursor: pointer;
      transition: all 0.2s; display: flex; align-items: center; gap: 0.5rem;
    }
    .btn-start { background: #22c55e; color: #fff; }
    .btn-start:hover { background: #16a34a; }
    .btn-stop { background: #ef4444; color: #fff; }
    .btn-stop:hover { background: #dc2626; }
    .btn-mute { background: #334155; color: #e2e8f0; }
    .btn-mute.muted { background: #b91c1c; }
    .btn:disabled { opacity: 0.5; cursor: not-allowed; }
    #transcript {
      flex: 1; min-height: 300px; overflow-y: auto;
      display: flex; flex-direction: column; gap: 0.5rem; padding: 0.5rem 0;
    }
    .turn {
      padding: 0.6rem 1rem; border-radius: 10px; font-size: 0.9rem;
      line-height: 1.5; max-width: 90%;
    }
    .turn.user {
      align-self: flex-end; background: #2563eb; color: #fff;
      border-bottom-right-radius: 4px;
    }
    .turn.assistant {
      align-self: flex-start; background: #1e293b; color: #e2e8f0;
      border: 1px solid #334155; border-bottom-left-radius: 4px;
    }
    .turn.tool {
      align-self: flex-start; background: #064e3b; color: #6ee7b7;
      font-size: 0.8rem; font-family: monospace;
    }
    .turn.memory {
      align-self: center; background: #4c1d95; color: #c4b5fd;
      font-size: 0.8rem; font-style: italic; text-align: center;
    }
    .turn .label {
      font-size: 0.65rem; text-transform: uppercase; letter-spacing: 0.05em;
      opacity: 0.6; margin-bottom: 0.2rem;
    }
    .status {
      font-size: 0.75rem; color: #64748b; text-align: center; padding: 0.5rem;
    }
    .dot {
      display: inline-block; width: 8px; height: 8px; border-radius: 50%;
      margin-right: 4px; vertical-align: middle;
    }
    .dot.on { background: #22c55e; }
    .dot.off { background: #64748b; }
    .dot.listening { background: #22c55e; animation: pulse 1s infinite; }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .config-panel {
      background: #1e293b; border: 1px solid #334155; border-radius: 12px;
      padding: 1rem; display: flex; flex-direction: column; gap: 0.75rem;
    }
    .config-panel .title {
      font-size: 0.85rem; font-weight: 600; color: #94a3b8;
    }
    .config-row {
      display: flex; gap: 0.5rem; align-items: center;
    }
    .config-row label { font-size: 0.75rem; color: #64748b; min-width: 70px; }
    .config-row input {
      flex: 1; padding: 0.5rem; border-radius: 8px; background: #0f172a;
      border: 1px solid #334155; color: #e2e8f0; font-family: monospace;
      font-size: 0.85rem; outline: none;
    }
    .config-row input:focus { border-color: #38bdf8; }
    .session-badge {
      display: inline-block; background: #1e293b; border: 1px solid #334155;
      border-radius: 8px; padding: 0.25rem 0.75rem; font-size: 0.75rem;
      color: #94a3b8; margin-bottom: 0.25rem;
    }
    .session-badge strong { color: #38bdf8; }
  </style>
</head>
<body>
  <header>
    <h1>Agentium Voice Agent</h1>
    <p>Real-time voice with unified memory — sessions, facts, and profile</p>
  </header>
  <div class="container">
    <div class="config-panel">
      <div class="title">Session Config</div>
      <div class="config-row">
        <label>User ID</label>
        <input id="userId" type="text" placeholder="e.g. akash, user-123" value="default" />
      </div>
      <div class="config-row">
        <label>API Key</label>
        <input id="apiKey" type="password" placeholder="sk-... (optional, uses server key)" />
      </div>
    </div>
    <div class="controls">
      <button class="btn btn-start" id="startBtn" onclick="startVoice()">Start Voice</button>
      <button class="btn btn-stop" id="stopBtn" onclick="stopVoice()" disabled>Stop</button>
      <button class="btn btn-mute" id="muteBtn" onclick="toggleMute()" disabled>Mute</button>
    </div>
    <div class="status" id="status"><span class="dot off"></span> Ready — enter a User ID and click Start</div>
    <div id="sessionInfo"></div>
    <div id="transcript"></div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    let socket, audioCtx, micStream, micProcessor, playbackQueue = [], isPlaying = false;
    let muted = false, active = false;
    const transcript = document.getElementById('transcript');

    function addTurn(role, text) {
      const el = document.createElement('div');
      el.className = 'turn ' + role;
      const labels = { user: 'You', assistant: 'Assistant', tool: 'Tool', memory: 'Memory' };
      el.innerHTML = '<div class="label">' + (labels[role] || role) + '</div><div class="text"></div>';
      el.querySelector('.text').textContent = text;
      transcript.appendChild(el);
      transcript.scrollTop = transcript.scrollHeight;
      return el;
    }

    let currentAssistantEl = null;

    async function startVoice() {
      const userId = document.getElementById('userId').value.trim() || 'default';
      const apiKey = document.getElementById('apiKey').value || undefined;

      document.getElementById('startBtn').disabled = true;
      document.getElementById('stopBtn').disabled = false;
      document.getElementById('muteBtn').disabled = false;
      document.getElementById('userId').disabled = true;
      setStatus('listening', 'Connecting...');

      socket = io('/agentium-voice');

      socket.on('connect', () => {
        socket.emit('voice.start', { agentName: 'assistant', apiKey, userId });
      });

      socket.on('voice.started', async (data) => {
        active = true;
        const uid = data?.userId || userId;
        document.getElementById('sessionInfo').innerHTML =
          '<span class="session-badge">Session: <strong>' + uid + '</strong></span>';
        setStatus('listening', 'Listening... speak now!');
        addTurn('memory', 'Session started for user "' + uid + '" — memories loaded');
        await startMic();
      });

      socket.on('voice.transcript', (data) => {
        if (data.role === 'user') {
          addTurn('user', data.text);
          currentAssistantEl = null;
        } else {
          if (!currentAssistantEl) {
            currentAssistantEl = addTurn('assistant', '');
          }
          const textEl = currentAssistantEl.querySelector('.text');
          textEl.textContent += data.text;
          transcript.scrollTop = transcript.scrollHeight;
        }
      });

      socket.on('voice.audio', (data) => {
        const bytes = base64ToArrayBuffer(data.data);
        playbackQueue.push(bytes);
        if (!isPlaying) playNext();
      });

      socket.on('voice.tool.call', (data) => {
        addTurn('tool', data.name + '(' + JSON.stringify(data.args) + ')');
        currentAssistantEl = null;
      });

      socket.on('voice.tool.result', (data) => {
        addTurn('tool', '-> ' + data.result);
      });

      socket.on('voice.interrupted', () => {
        playbackQueue = [];
        isPlaying = false;
        currentAssistantEl = null;
      });

      socket.on('voice.error', (data) => {
        addTurn('tool', 'Error: ' + data.error);
      });

      socket.on('voice.stopped', () => {
        active = false;
        setStatus('off', 'Session ended — memories saved');
        addTurn('memory', 'Session ended — facts extracted and saved for next time');
        cleanup();
      });

      socket.on('disconnect', () => {
        active = false;
        setStatus('off', 'Disconnected');
        cleanup();
      });
    }

    async function startMic() {
      try {
        audioCtx = new AudioContext({ sampleRate: 24000 });
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: { sampleRate: 24000, channelCount: 1, echoCancellation: true }
        });
        micStream = stream;
        const source = audioCtx.createMediaStreamSource(stream);
        micProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
        micProcessor.onaudioprocess = (e) => {
          if (!active || muted) return;
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = float32ToInt16(float32);
          const b64 = arrayBufferToBase64(int16.buffer);
          socket.emit('voice.audio', { data: b64 });
        };
        source.connect(micProcessor);
        micProcessor.connect(audioCtx.destination);
      } catch (err) {
        addTurn('tool', 'Mic error: ' + err.message);
      }
    }

    function playNext() {
      if (playbackQueue.length === 0) { isPlaying = false; return; }
      isPlaying = true;
      const pcmData = playbackQueue.shift();
      const float32 = int16ToFloat32(new Int16Array(pcmData));
      const buffer = audioCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const src = audioCtx.createBufferSource();
      src.buffer = buffer;
      src.connect(audioCtx.destination);
      src.onended = () => playNext();
      src.start();
    }

    function stopVoice() {
      if (socket) socket.emit('voice.stop');
      cleanup();
      setStatus('off', 'Stopped — memories saved');
    }

    function toggleMute() {
      muted = !muted;
      const btn = document.getElementById('muteBtn');
      btn.textContent = muted ? 'Unmute' : 'Mute';
      btn.classList.toggle('muted', muted);
      setStatus(muted ? 'on' : 'listening', muted ? 'Muted' : 'Listening...');
    }

    function cleanup() {
      document.getElementById('startBtn').disabled = false;
      document.getElementById('stopBtn').disabled = true;
      document.getElementById('muteBtn').disabled = true;
      document.getElementById('userId').disabled = false;
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
      if (micProcessor) { micProcessor.disconnect(); micProcessor = null; }
      if (audioCtx) { audioCtx.close(); audioCtx = null; }
      playbackQueue = [];
      isPlaying = false;
      currentAssistantEl = null;
    }

    function setStatus(state, text) {
      document.getElementById('status').innerHTML =
        '<span class="dot ' + state + '"></span> ' + text;
    }

    function float32ToInt16(float32) {
      const int16 = new Int16Array(float32.length);
      for (let i = 0; i < float32.length; i++) {
        const s = Math.max(-1, Math.min(1, float32[i]));
        int16[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      return int16;
    }
    function int16ToFloat32(int16) {
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) {
        float32[i] = int16[i] / (int16[i] < 0 ? 0x8000 : 0x7FFF);
      }
      return float32;
    }
    function arrayBufferToBase64(buffer) {
      const bytes = new Uint8Array(buffer);
      let binary = '';
      for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
      return btoa(binary);
    }
    function base64ToArrayBuffer(base64) {
      const binary = atob(base64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    }
  </script>
</body>
</html>`);
});

async function start() {
  console.log("  Connecting to MongoDB...");
  await mongoStorage.initialize();
  console.log("  MongoDB connected: " + MONGO_URI);

  httpServer.listen(3001, () => {
    console.log("");
    console.log("  Agentium Voice Agent running on http://localhost:3001");
    console.log("");
    console.log("  Unified memory (MongoDB-backed):");
    console.log("    - sessions + summaries → transcripts auto-saved");
    console.log("    - userFacts            → facts auto-extracted & persisted");
    console.log("    - userProfile          → structured user data");
    console.log("");
    console.log("  Try:");
    console.log("    - Tell it your name, preferences, etc.");
    console.log("    - Stop, then reconnect with the same User ID — it remembers");
    console.log("    - Restart the server — memories survive (MongoDB)");
    console.log("    - 'Track XQAMZFCL022619143M'");
    console.log("");
  });
}

start().catch((err) => {
  console.error("Failed to start:", err.message);
  process.exit(1);
});
