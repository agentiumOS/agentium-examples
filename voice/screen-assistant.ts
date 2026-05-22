/**
 * Vision Assistant — Gemini 3.1 Flash Live
 *
 * A real-time multimodal assistant that can SEE (screen share + camera) and
 * HEAR (microphone) while speaking back via audio + text. No screen control —
 * purely observational.
 *
 * Features:
 *   - Screen sharing via getDisplayMedia
 *   - Camera feed via getUserMedia (video)
 *   - Microphone input via getUserMedia (audio)
 *   - Audio playback of assistant responses
 *   - Text chat
 *
 * Usage:
 *   GOOGLE_API_KEY=... npx tsx examples/voice/screen-assistant.ts
 *   Then open http://localhost:4200 in your browser
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createServer } from "node:http";
import { VisionAgent, geminiVisionLive } from "@agentium/core";

try {
  const envPath = resolve(import.meta.dirname ?? ".", "../../.env");
  for (const line of readFileSync(envPath, "utf-8").split("\n")) {
    const m = line.match(/^(\w+)\s*=\s*"?(.+?)"?\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2];
  }
} catch { /* no .env */ }

const PORT = 4200;
const modelId = process.env.GEMINI_LIVE_MODEL ?? "gemini-3.1-flash-live-preview";
console.log(`Using model: ${modelId}`);
console.log(`GOOGLE_API_KEY: ${process.env.GOOGLE_API_KEY ? "set (" + process.env.GOOGLE_API_KEY.slice(0, 10) + "...)" : "NOT SET"}`);

const AGENT_INSTRUCTIONS = [
  "You are a helpful multilingual vision assistant. You can see the user's screen and/or camera feed, and hear them speak.",
  "LANGUAGE RULE: Always detect the language the user is speaking and respond in that same language. If the user switches languages mid-conversation, switch with them immediately. For example, if they speak Hindi, respond in Hindi; if they speak Spanish, respond in Spanish; if they speak Japanese, respond in Japanese. Match their language naturally without asking.",
  "Describe what you see when asked. Provide helpful guidance based on what is visible.",
  "If the user asks about their screen, describe the UI, content, and layout you observe.",
  "If the user shows their camera, describe the scene, objects, people, or documents visible.",
  "Keep responses conversational and concise. Speak naturally in the user's language.",
].join(" ");

const HTML = `<!DOCTYPE html>
<html>
<head>
  <title>Agentium Vision Assistant</title>
  <style>
    * { margin: 0; box-sizing: border-box; }
    body { font-family: system-ui, sans-serif; background: #0a0a0a; color: #e5e5e5; padding: 24px; max-width: 960px; margin: 0 auto; }
    h1 { font-size: 20px; margin-bottom: 16px; }
    .status { padding: 8px 16px; border-radius: 8px; margin-bottom: 16px; font-size: 14px; }
    .status.connected { background: #052e16; color: #4ade80; }
    .status.disconnected { background: #1c1917; color: #a8a29e; }
    .status.sharing { background: #172554; color: #60a5fa; }
    .controls { display: flex; flex-wrap: wrap; gap: 8px; margin-bottom: 16px; }
    button { padding: 8px 20px; border-radius: 8px; border: 1px solid #333; background: #1a1a1a; color: #fff; cursor: pointer; font-size: 14px; }
    button:hover:not(:disabled) { background: #2a2a2a; }
    button:disabled { opacity: 0.4; cursor: default; }
    button.primary { background: #2563eb; border-color: #2563eb; }
    button.primary:hover:not(:disabled) { background: #1d4ed8; }
    button.danger { background: #991b1b; border-color: #991b1b; }
    button.active { background: #166534; border-color: #22c55e; color: #4ade80; }
    .transcript { background: #111; border: 1px solid #222; border-radius: 8px; padding: 16px; height: 350px; overflow-y: auto; font-size: 14px; line-height: 1.6; }
    .msg { margin-bottom: 8px; }
    .msg.user { color: #60a5fa; }
    .msg.assistant { color: #4ade80; }
    .msg.system { color: #a8a29e; font-style: italic; }
    .previews { display: flex; gap: 16px; margin-top: 16px; flex-wrap: wrap; }
    .preview-box { flex: 1; min-width: 200px; }
    .preview-box p { font-size: 12px; color: #666; margin-top: 4px; }
    .preview-box canvas, .preview-box video { border: 1px solid #333; border-radius: 8px; width: 100%; max-width: 420px; background: #111; }
  </style>
</head>
<body>
  <h1>Agentium Vision Assistant</h1>
  <div class="status disconnected" id="status">Disconnected</div>
  <div class="controls">
    <select id="voiceSelect" style="padding:8px 12px; border-radius:8px; border:1px solid #333; background:#1a1a1a; color:#fff; font-size:14px;">
      <option value="">Default Voice</option>
      <optgroup label="Popular">
        <option value="Puck">Puck — Upbeat</option>
        <option value="Kore">Kore — Firm</option>
        <option value="Charon">Charon — Informative</option>
        <option value="Fenrir">Fenrir — Excitable</option>
        <option value="Aoede">Aoede — Breezy</option>
        <option value="Zephyr">Zephyr — Bright</option>
        <option value="Orus">Orus — Firm</option>
      </optgroup>
      <optgroup label="More Voices">
        <option value="Autonoe">Autonoe — Bright</option>
        <option value="Umbriel">Umbriel — Easy-going</option>
        <option value="Erinome">Erinome — Clear</option>
        <option value="Laomedeia">Laomedeia — Upbeat</option>
        <option value="Schedar">Schedar — Even</option>
        <option value="Achird">Achird — Friendly</option>
        <option value="Sadachbia">Sadachbia — Lively</option>
        <option value="Enceladus">Enceladus — Breathy</option>
        <option value="Algieba">Algieba — Smooth</option>
        <option value="Algenib">Algenib — Gravelly</option>
        <option value="Achernar">Achernar — Soft</option>
        <option value="Gacrux">Gacrux — Mature</option>
        <option value="Zubenelgenubi">Zubenelgenubi — Casual</option>
        <option value="Sadaltager">Sadaltager — Knowledgeable</option>
        <option value="Leda">Leda — Youthful</option>
        <option value="Callirrhoe">Callirrhoe — Easy-going</option>
        <option value="Iapetus">Iapetus — Clear</option>
        <option value="Despina">Despina — Smooth</option>
        <option value="Rasalgethi">Rasalgethi — Informative</option>
        <option value="Alnilam">Alnilam — Firm</option>
        <option value="Pulcherrima">Pulcherrima — Forward</option>
        <option value="Vindemiatrix">Vindemiatrix — Gentle</option>
        <option value="Sulafat">Sulafat — Warm</option>
      </optgroup>
    </select>
    <button class="primary" id="startBtn" onclick="startSession()">Start Session</button>
    <button id="screenBtn" onclick="toggleScreen()" disabled>Share Screen</button>
    <button id="camBtn" onclick="toggleCamera()" disabled>Enable Camera</button>
    <button id="micBtn" onclick="toggleMic()" disabled>Enable Mic</button>
    <button class="danger" id="stopBtn" onclick="stopSession()" disabled>Stop</button>
  </div>
  <div style="display:flex; gap:8px; margin-bottom:16px;">
    <input type="text" id="textInput" placeholder="Type a message..." style="flex:1; padding:8px 12px; border-radius:8px; border:1px solid #333; background:#1a1a1a; color:#fff; font-size:14px;" onkeydown="if(event.key==='Enter')sendTextMsg()" disabled />
    <button onclick="sendTextMsg()" id="sendBtn" disabled>Send</button>
  </div>
  <div class="transcript" id="transcript"></div>
  <div class="previews">
    <div class="preview-box" id="screenPreviewBox" style="display:none;">
      <canvas id="screenPreview" width="420" height="260"></canvas>
      <p>Screen share</p>
    </div>
    <div class="preview-box" id="camPreviewBox" style="display:none;">
      <video id="camPreview" autoplay muted playsinline></video>
      <p>Camera feed</p>
    </div>
  </div>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io("/agentium-vision");
    const transcript = document.getElementById("transcript");
    const statusEl = document.getElementById("status");

    function log(text, cls = "system") {
      const div = document.createElement("div");
      div.className = "msg " + cls;
      div.textContent = text;
      transcript.appendChild(div);
      transcript.scrollTop = transcript.scrollHeight;
    }

    function setStatus(text, cls) {
      statusEl.textContent = text;
      statusEl.className = "status " + cls;
    }

    // ── Session ──────────────────────────────────────────────
    function startSession() {
      const voice = document.getElementById("voiceSelect").value;
      socket.emit("vision.start", { agentName: "VisionAssistant", voice: voice || undefined });
      log("Connecting..." + (voice ? " (voice: " + voice + ")" : ""));
    }

    function stopSession() {
      stopScreen();
      stopCamera();
      stopMic();
      socket.emit("vision.stop");
      setStatus("Disconnected", "disconnected");
      document.getElementById("startBtn").disabled = false;
      document.getElementById("voiceSelect").disabled = false;
      ["screenBtn","camBtn","micBtn","stopBtn","textInput","sendBtn"].forEach(id => document.getElementById(id).disabled = true);
      log("Session ended.");
    }

    socket.on("vision.started", () => {
      setStatus("Connected — share your screen or camera", "connected");
      log("Connected to vision agent. Share your screen, enable camera, or both.");
      document.getElementById("startBtn").disabled = true;
      document.getElementById("voiceSelect").disabled = true;
      ["screenBtn","camBtn","micBtn","stopBtn","textInput","sendBtn"].forEach(id => document.getElementById(id).disabled = false);
    });

    socket.on("vision.transcript", (data) => log(data.role + ": " + data.text, data.role));
    socket.on("vision.text", (data) => log("Assistant: " + data.text, "assistant"));
    socket.on("vision.error", (data) => log("Error: " + data.error, "system"));
    socket.on("vision.stopped", () => setStatus("Disconnected", "disconnected"));
    socket.on("vision.tool.call", (data) => log("[Tool] " + data.name + ": " + JSON.stringify(data.args), "system"));

    // ── Text ─────────────────────────────────────────────────
    function sendTextMsg() {
      const input = document.getElementById("textInput");
      const text = input.value.trim();
      if (!text) return;
      socket.emit("vision.text", { text });
      log("You: " + text, "user");
      input.value = "";
    }

    // ── Screen Share ─────────────────────────────────────────
    let screenStream = null;
    let screenInterval = null;

    async function toggleScreen() {
      if (screenStream) { stopScreen(); return; }
      try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const btn = document.getElementById("screenBtn");
        btn.textContent = "Stop Screen";
        btn.classList.add("active");

        const video = document.createElement("video");
        video.srcObject = screenStream;
        video.play();
        await new Promise(r => { video.onloadedmetadata = r; setTimeout(r, 2000); });
        await new Promise(r => setTimeout(r, 500));

        const nw = video.videoWidth || 1920;
        const nh = video.videoHeight || 1080;
        const scale = Math.min(1, 1280 / nw);
        const sw = Math.round(nw * scale);
        const sh = Math.round(nh * scale);

        const canvas = document.createElement("canvas");
        canvas.width = sw;
        canvas.height = sh;
        const ctx = canvas.getContext("2d");

        const previewCanvas = document.getElementById("screenPreview");
        const previewCtx = previewCanvas.getContext("2d");
        document.getElementById("screenPreviewBox").style.display = "";

        log("Screen sharing started (" + nw + "x" + nh + " native, sending " + sw + "x" + sh + ").");
        setStatus("Sharing screen", "sharing");

        let first = true;
        screenInterval = setInterval(() => {
          ctx.drawImage(video, 0, 0, sw, sh);
          previewCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
          canvas.toBlob((blob) => {
            if (!blob) return;
            blob.arrayBuffer().then((buf) => {
              const bytes = new Uint8Array(buf);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              socket.emit("vision.image", { data: btoa(binary), mimeType: "image/jpeg", source: "screen" });
              if (first) { log("First screen frame sent (" + (blob.size / 1024).toFixed(0) + " KB)"); first = false; }
            });
          }, "image/jpeg", 0.7);
        }, 2000);

        screenStream.getVideoTracks()[0].onended = () => stopScreen();
      } catch (err) {
        log("Screen share cancelled: " + err.message);
      }
    }

    function stopScreen() {
      if (screenInterval) { clearInterval(screenInterval); screenInterval = null; }
      if (screenStream) { screenStream.getTracks().forEach(t => t.stop()); screenStream = null; }
      const btn = document.getElementById("screenBtn");
      btn.textContent = "Share Screen";
      btn.classList.remove("active");
      document.getElementById("screenPreviewBox").style.display = "none";
      if (!camStream) setStatus("Connected — share your screen or camera", "connected");
      log("Screen sharing stopped.");
    }

    // ── Camera ───────────────────────────────────────────────
    let camStream = null;
    let camInterval = null;

    async function toggleCamera() {
      if (camStream) { stopCamera(); return; }
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480, facingMode: "user" }, audio: false });
        const btn = document.getElementById("camBtn");
        btn.textContent = "Stop Camera";
        btn.classList.add("active");

        const camPreview = document.getElementById("camPreview");
        camPreview.srcObject = camStream;
        document.getElementById("camPreviewBox").style.display = "";

        const video = document.createElement("video");
        video.srcObject = camStream;
        video.play();
        await new Promise(r => { video.onloadedmetadata = r; setTimeout(r, 1500); });

        const cw = video.videoWidth || 640;
        const ch = video.videoHeight || 480;
        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");

        log("Camera enabled (" + cw + "x" + ch + ").");
        setStatus("Camera active", "sharing");

        let first = true;
        camInterval = setInterval(() => {
          ctx.drawImage(video, 0, 0, cw, ch);
          canvas.toBlob((blob) => {
            if (!blob) return;
            blob.arrayBuffer().then((buf) => {
              const bytes = new Uint8Array(buf);
              let binary = "";
              for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
              socket.emit("vision.image", { data: btoa(binary), mimeType: "image/jpeg", source: "camera" });
              if (first) { log("First camera frame sent (" + (blob.size / 1024).toFixed(0) + " KB)"); first = false; }
            });
          }, "image/jpeg", 0.7);
        }, 2000);
      } catch (err) {
        log("Camera error: " + err.message);
      }
    }

    function stopCamera() {
      if (camInterval) { clearInterval(camInterval); camInterval = null; }
      if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
      const btn = document.getElementById("camBtn");
      btn.textContent = "Enable Camera";
      btn.classList.remove("active");
      document.getElementById("camPreviewBox").style.display = "none";
      document.getElementById("camPreview").srcObject = null;
      if (!screenStream) setStatus("Connected — share your screen or camera", "connected");
      log("Camera stopped.");
    }

    // ── Microphone ───────────────────────────────────────────
    let micStream = null;
    let micProcessor = null;
    let audioCtx = null;
    let micOn = false;

    async function toggleMic() {
      if (micOn) { stopMic(); return; }
      try {
        micStream = await navigator.mediaDevices.getUserMedia({ audio: { sampleRate: 16000, channelCount: 1 } });
        audioCtx = new AudioContext({ sampleRate: 16000 });
        const source = audioCtx.createMediaStreamSource(micStream);
        micProcessor = audioCtx.createScriptProcessor(4096, 1, 1);
        source.connect(micProcessor);
        micProcessor.connect(audioCtx.destination);
        micProcessor.onaudioprocess = (e) => {
          const float32 = e.inputBuffer.getChannelData(0);
          const int16 = new Int16Array(float32.length);
          for (let i = 0; i < float32.length; i++) {
            int16[i] = Math.max(-32768, Math.min(32767, Math.round(float32[i] * 32767)));
          }
          const bytes = new Uint8Array(int16.buffer);
          let binary = "";
          for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
          socket.emit("vision.audio", { data: btoa(binary) });
        };
        micOn = true;
        const btn = document.getElementById("micBtn");
        btn.textContent = "Disable Mic";
        btn.classList.add("active");
        log("Microphone enabled — speak to the assistant.");
      } catch (err) {
        log("Mic error: " + err.message);
      }
    }

    function stopMic() {
      if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null; }
      if (audioCtx) { audioCtx.close(); audioCtx = null; }
      micProcessor = null;
      micOn = false;
      const btn = document.getElementById("micBtn");
      btn.textContent = "Enable Mic";
      btn.classList.remove("active");
      log("Microphone disabled.");
    }

    // ── Audio playback ───────────────────────────────────────
    let playbackCtx = null;
    let nextPlayTime = 0;

    let activeSources = [];

    socket.on("vision.audio", (data) => {
      if (!playbackCtx) playbackCtx = new AudioContext({ sampleRate: 24000 });
      const bytes = atob(data.data);
      const int16 = new Int16Array(bytes.length / 2);
      for (let i = 0; i < int16.length; i++) {
        int16[i] = bytes.charCodeAt(i * 2) | (bytes.charCodeAt(i * 2 + 1) << 8);
      }
      const float32 = new Float32Array(int16.length);
      for (let i = 0; i < int16.length; i++) float32[i] = int16[i] / 32768;
      const buffer = playbackCtx.createBuffer(1, float32.length, 24000);
      buffer.getChannelData(0).set(float32);
      const source = playbackCtx.createBufferSource();
      source.buffer = buffer;
      source.connect(playbackCtx.destination);
      const now = playbackCtx.currentTime;
      const startTime = Math.max(now, nextPlayTime);
      source.start(startTime);
      nextPlayTime = startTime + buffer.duration;
      activeSources.push(source);
      source.onended = () => { activeSources = activeSources.filter(s => s !== source); };
    });

    socket.on("vision.interrupted", () => {
      activeSources.forEach(s => { try { s.stop(); } catch(e) {} });
      activeSources = [];
      nextPlayTime = 0;
    });
  </script>
</body>
</html>`;

// ── Server setup ────────────────────────────────────────────────────────────

const express = await import("express").then((m) => m.default);
const { Server } = await import("socket.io");

const app = express();
const server = createServer(app);
const io = new Server(server);

app.get("/", (_req: any, res: any) => {
  res.type("html").send(HTML);
});

const visionNs = io.of("/agentium-vision");
const sessions = new Map<string, any>();

visionNs.on("connection", (socket) => {
  socket.on("vision.start", async (data: { agentName: string; voice?: string }) => {
    try {
      const selectedVoice = data.voice || undefined;
      if (selectedVoice) console.log(`[VisionAssistant] Voice: ${selectedVoice}`);

      const sessionAgent = new VisionAgent({
        name: "VisionAssistant",
        provider: geminiVisionLive(modelId),
        instructions: AGENT_INSTRUCTIONS,
        voice: selectedVoice,
        fps: 1,
        thinkingLevel: "low",
        logLevel: "info",
      });
      const session = await sessionAgent.connect();
      sessions.set(socket.id, session);

      session.on("transcript", (ev: { text: string; role: string }) => {
        socket.emit("vision.transcript", { text: ev.text, role: ev.role });
      });
      session.on("text", (ev: { text: string }) => {
        socket.emit("vision.text", { text: ev.text });
      });
      session.on("audio", (ev: { data: Buffer }) => {
        socket.emit("vision.audio", { data: ev.data.toString("base64") });
      });
      session.on("tool_call_start", (ev: { name: string; args: unknown }) => {
        socket.emit("vision.tool.call", { name: ev.name, args: ev.args });
      });
      session.on("interrupted", () => {
        console.log("[VisionAssistant] Interrupted by user speech");
        socket.emit("vision.interrupted");
      });
      session.on("error", (ev: { error: Error }) => {
        console.error("[VisionAssistant] Error:", ev.error.message);
        socket.emit("vision.error", { error: ev.error.message });
      });
      session.on("disconnected", () => {
        console.log("[VisionAssistant] Session disconnected");
        sessions.delete(socket.id);
        socket.emit("vision.stopped");
      });

      socket.emit("vision.started", {});
    } catch (err: any) {
      socket.emit("vision.error", { error: err.message });
    }
  });

  socket.on("vision.image", (data: { data: string; mimeType?: string; source?: string }) => {
    const s = sessions.get(socket.id);
    if (s && typeof data?.data === "string") {
      const buf = Buffer.from(data.data, "base64");
      console.log(`[Server] ${data.source || "image"} frame: ${(buf.length / 1024).toFixed(0)} KB`);
      s.sendImage(buf, data.mimeType ?? "image/jpeg");
    }
  });

  socket.on("vision.text", (data: { text: string }) => {
    const s = sessions.get(socket.id);
    if (s && typeof data?.text === "string") {
      console.log(`[Server] Text: ${data.text}`);
      s.sendText(data.text);
    }
  });

  socket.on("vision.audio", (data: { data: string }) => {
    const s = sessions.get(socket.id);
    if (s && typeof data?.data === "string") {
      s.sendAudio(Buffer.from(data.data, "base64"));
    }
  });

  socket.on("vision.stop", async () => {
    const s = sessions.get(socket.id);
    if (s) { await s.close(); sessions.delete(socket.id); }
    socket.emit("vision.stopped");
  });

  socket.on("disconnect", async () => {
    const s = sessions.get(socket.id);
    if (s) { try { await s.close(); } catch {} sessions.delete(socket.id); }
  });
});

server.listen(PORT, () => {
  console.log(`\n  Vision Assistant running at http://localhost:${PORT}\n`);
  console.log("  1. Open the URL in Chrome");
  console.log("  2. Click 'Start Session' to connect to Gemini 3.1 Flash Live");
  console.log("  3. Share your screen, enable camera, or both");
  console.log("  4. Enable mic to speak, or type messages");
  console.log("  5. The assistant sees + hears everything and responds via voice + text");
  console.log("  6. Speak in any language — the assistant auto-detects and responds in kind\n");
});
