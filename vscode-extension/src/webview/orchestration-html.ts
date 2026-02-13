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
      padding: 0 !important;
      background: #0a0a0a;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      color: #e5e5e5;
    }
    .container {
      display: flex;
      flex-direction: column;
      height: 100vh;
    }

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
        <div class="hint">tmux session: mimir-${projectId}</div>
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

    // Handle messages from extension
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'switchTab') {
        switchTab(msg.tab);
      }
    });

  </script>
</body>
</html>`;
}
