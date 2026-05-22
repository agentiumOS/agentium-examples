/**
 * Browser Gateway — Stream BrowserAgent execution over Socket.IO
 * with secure credential support from the UI.
 *
 * Credentials entered in the UI are stored in a CredentialVault on the server.
 * The LLM only sees placeholders like {{username}}, {{password}}.
 * Real values are injected at execution time and scrubbed from all output.
 *
 * Prerequisites:
 *   npm install playwright express socket.io
 *   npx playwright install chromium
 *
 * Usage:
 *   OPENAI_API_KEY=sk-... npx tsx examples/browser/32-browser-gateway.ts
 *
 * Then open http://localhost:3003 in your browser.
 */

import express from "express";
import { createServer } from "node:http";
import { Server } from "socket.io";
import { openai } from "@agentium/core";
import { BrowserAgent, CredentialVault } from "@agentium/browser";

const PORT = 3003;

const app = express();
const server = createServer(app);
const io = new Server(server, { cors: { origin: "*" }, maxHttpBufferSize: 10e6 });

const ns = io.of("/agentium-browser");
const activeRuns = new Map<string, AbortController>();

ns.on("connection", (socket) => {
  socket.on("browser.start", async (data: {
    task: string;
    startUrl?: string;
    credentials?: Record<string, string>;
  }) => {
    if (activeRuns.has(socket.id)) {
      socket.emit("browser.error", { error: "A task is already running" });
      return;
    }

    const abort = new AbortController();
    activeRuns.set(socket.id, abort);

    const vault = new CredentialVault(data.credentials ?? {});
    const credKeys = vault.keys();

    const agent = new BrowserAgent({
      name: "web-agent",
      model: openai("gpt-4o"),
      headless: true,
      maxSteps: 20,
      useDOM: true,
      maxRepeats: 3,
      credentials: credKeys.length > 0 ? vault : undefined,
      logLevel: "info",
    });

    const onScreenshot = (ev: { data: Buffer }) => {
      if (!abort.signal.aborted) {
        socket.emit("browser.screenshot", {
          data: ev.data.toString("base64"),
          mimeType: "image/png",
        });
      }
    };
    const onAction = (ev: { action: unknown }) => {
      if (!abort.signal.aborted) socket.emit("browser.action", { action: ev.action });
    };
    const onStep = (ev: { index: number; action: unknown; pageUrl: string; screenshot: Buffer }) => {
      if (!abort.signal.aborted) {
        socket.emit("browser.step", {
          index: ev.index, action: ev.action, pageUrl: ev.pageUrl,
          screenshot: ev.screenshot.toString("base64"),
        });
      }
    };

    agent.eventBus.on("browser.screenshot", onScreenshot);
    agent.eventBus.on("browser.action", onAction);
    agent.eventBus.on("browser.step", onStep);

    const cleanup = () => {
      agent.eventBus.off("browser.screenshot", onScreenshot);
      agent.eventBus.off("browser.action", onAction);
      agent.eventBus.off("browser.step", onStep);
      activeRuns.delete(socket.id);
    };

    socket.emit("browser.started", {
      task: data.task,
      credentialPlaceholders: credKeys.length > 0 ? credKeys.map(k => `{{${k}}}`) : [],
    });

    try {
      const result = await agent.run(data.task, {
        startUrl: data.startUrl,
      });

      cleanup();
      if (!abort.signal.aborted) {
        socket.emit("browser.done", {
          result: result.result,
          success: result.success,
          finalUrl: result.finalUrl,
          durationMs: result.durationMs,
          totalSteps: result.steps.length,
        });
      }
    } catch (error: any) {
      cleanup();
      if (!abort.signal.aborted) {
        socket.emit("browser.error", { error: error.message });
      }
    }
  });

  socket.on("browser.stop", () => {
    const abort = activeRuns.get(socket.id);
    if (abort) { abort.abort(); activeRuns.delete(socket.id); socket.emit("browser.stopped"); }
  });

  socket.on("disconnect", () => {
    const abort = activeRuns.get(socket.id);
    if (abort) { abort.abort(); activeRuns.delete(socket.id); }
  });
});

// ── UI ─────────────────────────────────────────────────────────────────

app.get("/", (_req, res) => {
  res.send(HTML);
});

server.listen(PORT, () => {
  console.log(`\n  Agentium Browser Gateway running at http://localhost:${PORT}\n`);
  console.log("  Open the URL in your browser, then click Start to run a task.\n");
});

const HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Agentium — Browser Gateway</title>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a; color: #e0e0e0; min-height: 100vh;
      display: flex; flex-direction: column;
    }
    header {
      background: #111; border-bottom: 1px solid #222; padding: 14px 24px;
      display: flex; align-items: center; gap: 16px;
    }
    header h1 { font-size: 18px; color: #fff; font-weight: 600; }
    header .badge {
      font-size: 11px; padding: 3px 10px; border-radius: 12px;
      font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px;
    }
    .badge-idle { background: #1a1a2e; color: #666; }
    .badge-running { background: #0d2818; color: #4ade80; animation: pulse 1.5s infinite; }
    .badge-done { background: #1a2332; color: #60a5fa; }
    .badge-error { background: #2d1215; color: #f87171; }
    @keyframes pulse { 0%,100% { opacity: 1; } 50% { opacity: 0.6; } }

    .container { display: flex; flex: 1; overflow: hidden; }
    .sidebar {
      width: 400px; background: #111; border-right: 1px solid #222;
      display: flex; flex-direction: column;
    }
    .controls { padding: 16px; border-bottom: 1px solid #222; overflow-y: auto; }
    .controls label { display: block; font-size: 12px; color: #888; margin-bottom: 4px; }
    .controls input, .controls textarea {
      width: 100%; padding: 8px 12px; border-radius: 6px; border: 1px solid #333;
      background: #1a1a1a; color: #fff; font-size: 13px; outline: none;
      transition: border-color 0.2s;
    }
    .controls input:focus, .controls textarea:focus { border-color: #4ade80; }
    .controls textarea { resize: vertical; min-height: 60px; font-family: inherit; }
    .field { margin-bottom: 10px; }

    .cred-section {
      border: 1px solid #222; border-radius: 8px; padding: 12px; margin-bottom: 10px;
      background: #0d0d0d;
    }
    .cred-section .section-title {
      font-size: 12px; color: #f59e0b; font-weight: 600; margin-bottom: 8px;
      display: flex; align-items: center; gap: 6px;
    }
    .cred-row { display: flex; gap: 8px; margin-bottom: 6px; align-items: end; }
    .cred-row input { flex: 1; }
    .cred-row .cred-key { max-width: 120px; }
    .btn-add-cred {
      font-size: 11px; padding: 4px 10px; background: #1a1a2e; color: #a78bfa;
      border: 1px solid #333; border-radius: 4px; cursor: pointer;
    }
    .btn-add-cred:hover { background: #252547; }
    .btn-rm {
      padding: 6px 10px; background: #2d1215; color: #f87171; border: none;
      border-radius: 4px; cursor: pointer; font-size: 13px;
    }
    .btn-rm:hover { background: #3d1a1e; }

    .btn-row { display: flex; gap: 8px; margin-top: 8px; }
    button {
      padding: 8px 20px; border-radius: 6px; border: none; cursor: pointer;
      font-size: 13px; font-weight: 600; transition: all 0.2s;
    }
    .btn-start { background: #16a34a; color: #fff; flex: 1; }
    .btn-start:hover { background: #15803d; }
    .btn-start:disabled { background: #333; color: #666; cursor: not-allowed; }
    .btn-stop { background: #dc2626; color: #fff; }
    .btn-stop:hover { background: #b91c1c; }
    .btn-stop:disabled { background: #333; color: #666; cursor: not-allowed; }

    .log-container { flex: 1; overflow-y: auto; padding: 12px; }
    .log-entry {
      font-size: 12px; padding: 6px 10px; margin-bottom: 4px; border-radius: 4px;
      font-family: 'SF Mono', Monaco, Consolas, monospace; line-height: 1.5;
      word-break: break-word;
    }
    .log-action { background: #1a1a2e; color: #a78bfa; }
    .log-step { background: #0d1b2a; color: #60a5fa; }
    .log-done { background: #0d2818; color: #4ade80; }
    .log-error { background: #2d1215; color: #f87171; }
    .log-info { background: #1a1a1a; color: #888; }
    .log-secure { background: #1a1508; color: #f59e0b; }

    .viewer {
      flex: 1; display: flex; align-items: center; justify-content: center;
      background: #0d0d0d; position: relative; overflow: hidden;
    }
    .viewer img {
      max-width: 100%; max-height: 100%; object-fit: contain;
      border-radius: 4px; transition: opacity 0.3s;
    }
    .viewer .placeholder { color: #333; font-size: 14px; text-align: center; }
    .viewer .placeholder span { font-size: 48px; display: block; margin-bottom: 12px; }

    .result-bar {
      background: #111; border-top: 1px solid #222; padding: 12px 24px;
      font-size: 13px; max-height: 140px; overflow-y: auto;
    }
    .result-bar strong { color: #4ade80; }
  </style>
</head>
<body>
  <header>
    <h1>Agentium Browser Gateway</h1>
    <span id="status" class="badge badge-idle">Idle</span>
  </header>

  <div class="container">
    <div class="sidebar">
      <div class="controls">
        <div class="field">
          <label>Start URL</label>
          <input id="url" type="text" value="https://practicetestautomation.com/practice-test-login/" placeholder="https://..." />
        </div>
        <div class="field">
          <label>Task</label>
          <textarea id="task" placeholder="What should the agent do?">Log in using {{username}} and {{password}}, then tell me the text shown on the success page.</textarea>
        </div>

        <div class="cred-section">
          <div class="section-title">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0110 0v4"/></svg>
            Secure Credentials
          </div>
          <div id="credRows">
            <div class="cred-row">
              <input class="cred-key" type="text" placeholder="key" value="username" />
              <input class="cred-val" type="password" placeholder="value (hidden from LLM)" value="student" />
              <button class="btn-rm" onclick="this.parentElement.remove()">×</button>
            </div>
            <div class="cred-row">
              <input class="cred-key" type="text" placeholder="key" value="password" />
              <input class="cred-val" type="password" placeholder="value (hidden from LLM)" value="Password123" />
              <button class="btn-rm" onclick="this.parentElement.remove()">×</button>
            </div>
          </div>
          <button class="btn-add-cred" onclick="addCredRow()">+ Add credential</button>
        </div>

        <div class="btn-row">
          <button id="startBtn" class="btn-start" onclick="startTask()">Start</button>
          <button id="stopBtn" class="btn-stop" onclick="stopTask()" disabled>Stop</button>
        </div>
      </div>
      <div class="log-container" id="log"></div>
    </div>

    <div class="viewer" id="viewer">
      <div class="placeholder"><span>&#128421;</span>Live browser view will appear here</div>
    </div>
  </div>

  <div class="result-bar" id="resultBar" style="display:none;"></div>

  <script>
    const socket = io("/agentium-browser");
    const logEl = document.getElementById("log");
    const viewerEl = document.getElementById("viewer");
    const statusEl = document.getElementById("status");
    const resultBar = document.getElementById("resultBar");
    const startBtn = document.getElementById("startBtn");
    const stopBtn = document.getElementById("stopBtn");
    let imgEl = null;

    function addCredRow() {
      const row = document.createElement("div");
      row.className = "cred-row";
      row.innerHTML =
        '<input class="cred-key" type="text" placeholder="key" />' +
        '<input class="cred-val" type="password" placeholder="value (hidden from LLM)" />' +
        '<button class="btn-rm" onclick="this.parentElement.remove()">×</button>';
      document.getElementById("credRows").appendChild(row);
    }

    function getCredentials() {
      const creds = {};
      document.querySelectorAll("#credRows .cred-row").forEach(row => {
        const key = row.querySelector(".cred-key").value.trim();
        const val = row.querySelector(".cred-val").value;
        if (key && val) creds[key] = val;
      });
      return creds;
    }

    function addLog(cls, text) {
      const d = document.createElement("div");
      d.className = "log-entry " + cls;
      d.textContent = text;
      logEl.appendChild(d);
      logEl.scrollTop = logEl.scrollHeight;
    }

    function setStatus(label, cls) {
      statusEl.textContent = label;
      statusEl.className = "badge badge-" + cls;
    }

    function startTask() {
      const task = document.getElementById("task").value.trim();
      const url = document.getElementById("url").value.trim();
      if (!task) return;

      const creds = getCredentials();
      const credKeys = Object.keys(creds);

      logEl.innerHTML = "";
      resultBar.style.display = "none";
      viewerEl.innerHTML = '<div class="placeholder"><span>&#9203;</span>Launching browser...</div>';
      imgEl = null;

      setStatus("Running", "running");
      startBtn.disabled = true;
      stopBtn.disabled = false;

      socket.emit("browser.start", {
        task,
        startUrl: url || undefined,
        credentials: credKeys.length > 0 ? creds : undefined,
      });

      addLog("log-info", "Task sent: " + task);
      if (credKeys.length > 0) {
        addLog("log-secure",
          "Credentials loaded: " + credKeys.map(k => "{{" + k + "}}").join(", ") +
          " — values are NEVER sent to the LLM");
      }
    }

    function stopTask() {
      socket.emit("browser.stop");
      addLog("log-info", "Stop requested");
    }

    socket.on("browser.started", ({ task, credentialPlaceholders }) => {
      addLog("log-info", "Agent accepted task");
      if (credentialPlaceholders && credentialPlaceholders.length > 0) {
        addLog("log-secure", "Placeholders active: " + credentialPlaceholders.join(", "));
      }
    });

    socket.on("browser.screenshot", ({ data }) => {
      if (!imgEl) {
        viewerEl.innerHTML = "";
        imgEl = document.createElement("img");
        viewerEl.appendChild(imgEl);
      }
      imgEl.src = "data:image/png;base64," + data;
    });

    socket.on("browser.action", ({ action }) => {
      let desc = action.action;
      if (action.action === "click") desc += " (" + action.x + "," + action.y + ") " + (action.description || "");
      else if (action.action === "type") desc += ' "' + action.text + '"';
      else if (action.action === "scroll") desc += " " + action.direction;
      else if (action.action === "navigate") desc += " " + action.url;
      else if (action.action === "done") desc += ": " + action.result?.slice(0, 120);
      else if (action.action === "fail") desc += ": " + action.reason;
      addLog("log-action", "Action: " + desc);
    });

    socket.on("browser.step", ({ index, pageUrl }) => {
      addLog("log-step", "Step " + (index + 1) + " — " + pageUrl);
    });

    socket.on("browser.done", ({ result, success, durationMs, totalSteps }) => {
      setStatus(success ? "Done" : "Failed", success ? "done" : "error");
      addLog(success ? "log-done" : "log-error",
        (success ? "\\u2713 " : "\\u2717 ") + result);
      addLog("log-info", totalSteps + " steps in " + (durationMs / 1000).toFixed(1) + "s");

      resultBar.style.display = "block";
      resultBar.innerHTML = "<strong>" + (success ? "Result:" : "Failed:") + "</strong> " + result;

      startBtn.disabled = false;
      stopBtn.disabled = true;
    });

    socket.on("browser.error", ({ error }) => {
      setStatus("Error", "error");
      addLog("log-error", "Error: " + error);
      startBtn.disabled = false;
      stopBtn.disabled = true;
    });

    socket.on("browser.stopped", () => {
      setStatus("Stopped", "idle");
      addLog("log-info", "Task cancelled");
      startBtn.disabled = false;
      stopBtn.disabled = true;
    });
  </script>
</body>
</html>`;
