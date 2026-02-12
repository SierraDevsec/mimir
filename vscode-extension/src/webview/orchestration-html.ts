/**
 * Orchestration webview HTML with StatusBar + Chat/Terminal tab toggle.
 * Matches Electron's Layout.tsx: StatusBar + swarm tab bar + content area.
 */
export function getOrchestrationHtml(port: number, projectId: string): string {
  const iframeUrl = `http://localhost:${port}/swarm?embed=true&project=${encodeURIComponent(projectId)}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; frame-src http://localhost:${port}; connect-src http://localhost:${port}; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body, html {
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #0a0a0a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e5e5e5;
    }
    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

    /* StatusBar — matches Electron's StatusBar.tsx */
    .statusbar {
      display: flex;
      align-items: center;
      gap: 16px;
      padding: 0 16px;
      height: 24px;
      flex-shrink: 0;
      background: rgba(23,23,23,0.8);
      border-bottom: 1px solid #262626;
      font-size: 11px;
      font-family: 'Menlo', 'Monaco', 'Courier New', monospace;
      user-select: none;
    }
    .statusbar .logo {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .statusbar .logo svg { width: 14px; height: 14px; }
    .statusbar .logo .name { color: #a3a3a3; font-weight: 500; }
    .statusbar .project-name { color: #525252; }
    .statusbar .spacer { flex: 1; }
    .statusbar .sep { color: #404040; }
    .statusbar .metric {
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .statusbar .metric-label { color: #737373; }
    .statusbar .metric-value { font-weight: 600; }
    .statusbar .minibar {
      display: inline-flex;
      align-items: center;
      width: 50px;
      height: 5px;
      border-radius: 2px;
      background: #404040;
      overflow: hidden;
    }
    .statusbar .minibar-fill {
      height: 100%;
      border-radius: 2px;
      transition: width 0.3s;
    }
    .pct-green { color: #4ade80; }
    .pct-yellow { color: #facc15; }
    .pct-red { color: #f87171; }
    .bar-green { background: #4ade80; }
    .bar-yellow { background: #facc15; }
    .bar-red { background: #f87171; }

    /* Tab bar — matches Electron's Layout.tsx swarm tab toggle */
    .tabbar {
      display: flex;
      align-items: center;
      padding: 0 8px;
      height: 36px;
      flex-shrink: 0;
      background: #171717;
      border-bottom: 1px solid #262626;
      gap: 4px;
    }
    .tab-btn {
      padding: 5px 12px;
      font-size: 12px;
      font-weight: 500;
      border: none;
      border-radius: 4px;
      cursor: pointer;
      transition: all 0.15s;
      background: transparent;
      color: #a3a3a3;
    }
    .tab-btn:hover {
      background: #262626;
      color: #e5e5e5;
    }
    .tab-btn.active {
      background: #404040;
      color: #f5f5f5;
    }
    .tab-spacer { flex: 1; }
    .tab-hint {
      font-size: 10px;
      color: #525252;
      padding-right: 4px;
    }

    /* Content */
    .content {
      flex: 1;
      overflow: hidden;
    }
    .content iframe {
      border: none;
      width: 100%;
      height: 100%;
    }
    .terminal-placeholder {
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 100%;
      gap: 12px;
      color: #737373;
    }
    .terminal-placeholder .icon { font-size: 36px; }
    .terminal-placeholder .text { font-size: 13px; }
    .terminal-placeholder .hint { font-size: 11px; color: #525252; }
    .open-terminal-btn {
      margin-top: 8px;
      padding: 8px 20px;
      font-size: 12px;
      font-weight: 500;
      border: 1px solid #404040;
      border-radius: 6px;
      background: #262626;
      color: #e5e5e5;
      cursor: pointer;
      transition: all 0.15s;
    }
    .open-terminal-btn:hover {
      background: #404040;
      border-color: #525252;
    }
  </style>
</head>
<body>
  <div class="container">
    <!-- StatusBar -->
    <div class="statusbar" id="statusbar">
      <div class="logo">
        <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
          <line x1="16" y1="6" x2="7" y2="18" stroke="#a3a3a3" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="16" y1="6" x2="25" y2="18" stroke="#a3a3a3" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="7" y1="18" x2="25" y2="18" stroke="#a3a3a3" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="7" y1="18" x2="16" y2="27" stroke="#a3a3a3" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="25" y1="18" x2="16" y2="27" stroke="#a3a3a3" stroke-width="1.5" stroke-linecap="round"/>
          <line x1="16" y1="6" x2="16" y2="27" stroke="#a3a3a3" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="16" cy="6" r="3" fill="#a3a3a3"/>
          <circle cx="7" cy="18" r="2.5" fill="#a3a3a3"/>
          <circle cx="25" cy="18" r="2.5" fill="#a3a3a3"/>
          <circle cx="16" cy="27" r="2.5" fill="#a3a3a3"/>
        </svg>
        <span class="name">CLNODE</span>
      </div>
      <span class="project-name" id="project-name">${projectId}</span>
      <span class="spacer"></span>

      <span class="metric">
        <span class="metric-label">Context:</span>
        <span class="metric-value pct-green" id="context-pct">0%</span>
        <span class="minibar"><span class="minibar-fill bar-green" id="context-bar" style="width:0%"></span></span>
      </span>
      <span class="sep">|</span>
      <span class="metric">
        <span class="metric-label">Session:</span>
        <span class="metric-value pct-green" id="session-pct">0%</span>
        <span class="minibar"><span class="minibar-fill bar-green" id="session-bar" style="width:0%"></span></span>
        <span class="metric-label" id="session-reset"></span>
      </span>
      <span class="sep">|</span>
      <span class="metric">
        <span class="metric-label">Week:</span>
        <span class="metric-value pct-green" id="week-pct">0%</span>
        <span class="minibar"><span class="minibar-fill bar-green" id="week-bar" style="width:0%"></span></span>
      </span>
    </div>

    <!-- Chat/Terminal Tab Bar -->
    <div class="tabbar">
      <button class="tab-btn active" id="tab-chat" onclick="switchTab('chat')">Chat</button>
      <button class="tab-btn" id="tab-terminal" onclick="switchTab('terminal')">Terminal</button>
      <span class="tab-spacer"></span>
      <span class="tab-hint" id="tab-hint"></span>
    </div>

    <!-- Content -->
    <div class="content">
      <iframe id="chat-frame" src="${iframeUrl}"></iframe>
      <div class="terminal-placeholder" id="terminal-view">
        <div class="icon">\u{1F4DF}</div>
        <div class="text">Swarm Terminal (tmux)</div>
        <div class="hint">tmux session: clnode-${projectId}</div>
        <button class="open-terminal-btn" onclick="openTerminal()">Open in Editor Tab</button>
        <div class="hint" style="margin-top:8px">The Swarm terminal opens as a separate editor tab.<br/>You can split-view it alongside this page.</div>
      </div>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    let currentTab = 'chat';

    function switchTab(tab) {
      currentTab = tab;
      document.getElementById('tab-chat').classList.toggle('active', tab === 'chat');
      document.getElementById('tab-terminal').classList.toggle('active', tab === 'terminal');
      document.getElementById('chat-frame').style.display = tab === 'chat' ? 'block' : 'none';
      document.getElementById('terminal-view').style.display = tab === 'terminal' ? 'flex' : 'none';

      if (tab === 'terminal') {
        document.getElementById('tab-hint').textContent = 'tmux session in editor tab';
      } else {
        document.getElementById('tab-hint').textContent = '';
      }
    }

    function openTerminal() {
      vscode.postMessage({ command: 'launchSwarm' });
    }

    // Poll statusline data
    async function pollStatusline() {
      try {
        const resp = await fetch('http://localhost:${port}/api/statusline/${encodeURIComponent(projectId)}');
        if (!resp.ok) return;
        const data = await resp.json();
        if (!data) return;

        updateMetric('context', data.context_pct);
        updateMetric('session', data.rolling_5h_pct);
        updateMetric('week', data.weekly_pct);

        const resetEl = document.getElementById('session-reset');
        if (data.session_reset) {
          resetEl.textContent = 'reset ' + data.session_reset;
        }
      } catch { /* ignore */ }
    }

    function updateMetric(name, pct) {
      const p = Math.max(0, Math.min(100, pct || 0));
      const colorClass = p > 80 ? 'red' : p > 50 ? 'yellow' : 'green';

      const pctEl = document.getElementById(name + '-pct');
      const barEl = document.getElementById(name + '-bar');

      pctEl.textContent = p + '%';
      pctEl.className = 'metric-value pct-' + colorClass;
      barEl.className = 'minibar-fill bar-' + colorClass;
      barEl.style.width = p + '%';
    }

    // Handle messages from extension
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'switchTab') {
        switchTab(msg.tab);
      }
    });

    // Start polling
    pollStatusline();
    setInterval(pollStatusline, 2000);
  </script>
</body>
</html>`;
}
