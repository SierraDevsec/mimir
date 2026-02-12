import * as vscode from "vscode";

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mimir-sidebar-webview";

  private _view?: vscode.WebviewView;
  private _onCommand?: (command: string, args?: Record<string, string>) => void;
  private _lastUsage: { fiveHour?: number; fiveHourReset?: string; sevenDay?: number; sevenDaySonnet?: number } | null = null;
  private _onViewReady?: () => void;
  private _projectId: string | null = null;

  constructor(private port: number, private workspacePaths: string[] = []) {}

  onViewReady(cb: () => void): void {
    this._onViewReady = cb;
  }

  onCommand(cb: (command: string, args?: Record<string, string>) => void): void {
    this._onCommand = cb;
  }

  postClaudeUsage(usage: {
    fiveHour?: number; fiveHourReset?: string;
    sevenDay?: number;
    sevenDaySonnet?: number;
  } | null): void {
    this._lastUsage = usage;
    this._view?.webview.postMessage({ type: "claudeUsage", usage });
  }

  resolveWebviewView(
    webviewView: vscode.WebviewView,
    _context: vscode.WebviewViewResolveContext,
    _token: vscode.CancellationToken
  ): void {
    this._view = webviewView;

    webviewView.webview.options = {
      enableScripts: true,
    };

    webviewView.webview.html = this.getHtml();

    webviewView.webview.onDidReceiveMessage((msg) => {
      if (msg.command === "open") {
        vscode.commands.executeCommand(`mimir.open${msg.page}`);
      } else if (msg.command === "navigate") {
        this._onCommand?.("navigate", { page: msg.page });
      }
    });

    if (this._lastUsage) {
      webviewView.webview.postMessage({ type: "claudeUsage", usage: this._lastUsage });
    }
    this._onViewReady?.();

    this.autoDetectProject().then(() => this.refreshStats());
    const timer = setInterval(() => this.refreshStats(), 5000);
    webviewView.onDidDispose(() => clearInterval(timer));
  }

  getProjectId(): string | null {
    return this._projectId;
  }

  private async autoDetectProject(): Promise<void> {
    try {
      const res = await fetch(`http://localhost:${this.port}/api/projects`);
      if (!res.ok) return;
      const projects = await res.json();
      if (this.workspacePaths.length > 0) {
        const match = projects.find((p: { path: string }) => this.workspacePaths.includes(p.path));
        if (match) this._projectId = String(match.id);
      }
    } catch { /* offline */ }
  }

  private async refreshStats(): Promise<void> {
    if (!this._view) return;
    try {
      const pq = this._projectId ? `?project_id=${this._projectId}` : "";
      const aq = this._projectId ? `&project_id=${this._projectId}` : "";
      const [statsRes, agentsRes] = await Promise.all([
        fetch(`http://localhost:${this.port}/api/stats${pq}`),
        fetch(`http://localhost:${this.port}/api/agents?active=true${aq}`),
      ]);

      if (!statsRes.ok) throw new Error();
      const stats = await statsRes.json();
      const agents = agentsRes.ok ? await agentsRes.json() : [];

      this._view.webview.postMessage({ type: "stats", stats, agents });
    } catch {
      this._view.webview.postMessage({ type: "offline" });
    }
  }

  private getHtml(): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family);
      font-size: var(--vscode-font-size);
      color: var(--vscode-foreground);
      padding: 12px;
      display: flex;
      flex-direction: column;
      min-height: 100vh;
    }

    .header {
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 12px;
      padding-bottom: 10px;
      border-bottom: 1px solid var(--vscode-panel-border);
    }
    .header svg { width: 18px; height: 18px; flex-shrink: 0; }
    .header span { font-weight: 600; font-size: 13px; color: #34d399; }

    .nav-main { margin-bottom: 14px; }
    .nav-btn {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      padding: 8px 10px;
      margin-bottom: 2px;
      background: transparent;
      border: none;
      border-radius: 6px;
      color: var(--vscode-foreground);
      font-size: 12px;
      cursor: pointer;
      text-align: left;
      transition: background 0.15s;
    }
    .nav-btn:hover { background: var(--vscode-list-hoverBackground); }
    .nav-btn.active {
      background: var(--vscode-list-activeSelectionBackground);
      color: var(--vscode-list-activeSelectionForeground);
    }
    .nav-btn .icon {
      width: 18px; height: 18px;
      display: flex; align-items: center; justify-content: center;
      opacity: 0.8; font-size: 14px;
    }
    .nav-btn .label { font-weight: 500; }
    .nav-btn .badge {
      margin-left: auto;
      background: #34d399; color: #000;
      font-size: 9px; font-weight: 700;
      padding: 1px 5px; border-radius: 8px;
      min-width: 16px; text-align: center;
    }

    .section-header {
      font-size: 9px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground);
      margin-bottom: 6px;
      margin-top: 4px;
    }

    /* Claude Usage */
    .claude-usage { margin-bottom: 14px; cursor: pointer; }
    .claude-usage:hover { opacity: 0.85; }
    .usage-row {
      display: flex; align-items: center; gap: 6px;
      padding: 4px 0; font-size: 11px;
    }
    .usage-label {
      color: var(--vscode-descriptionForeground);
      width: 28px; flex-shrink: 0; font-size: 10px;
    }
    .usage-bar {
      flex: 1; height: 6px; border-radius: 3px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      overflow: hidden;
    }
    .usage-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .usage-pct { width: 32px; text-align: right; font-size: 10px; font-weight: 600; flex-shrink: 0; }
    .usage-reset {
      font-size: 9px; color: var(--vscode-descriptionForeground);
      padding: 0 0 2px 34px; opacity: 0.8;
    }
    .u-green { color: #4ade80; } .u-yellow { color: #facc15; } .u-red { color: #f87171; }
    .ub-green { background: #4ade80; } .ub-yellow { background: #facc15; } .ub-red { background: #f87171; }

    /* Active agents */
    .agents-section { margin-bottom: 14px; }
    .agent-item {
      display: flex; align-items: center; gap: 6px;
      padding: 3px 10px; font-size: 11px;
    }
    .agent-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: #34d399; flex-shrink: 0;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    .agent-name { color: var(--vscode-foreground); }
    .agent-type { color: var(--vscode-descriptionForeground); font-size: 10px; }

    .offline {
      text-align: center; padding: 20px;
      color: var(--vscode-descriptionForeground); font-size: 11px;
    }
    .offline .icon { font-size: 24px; margin-bottom: 8px; }
  </style>
</head>
<body>
  <div class="header">
    <svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
      <line x1="16" y1="6" x2="7" y2="18" stroke="#34d399" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="16" y1="6" x2="25" y2="18" stroke="#34d399" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="7" y1="18" x2="25" y2="18" stroke="#34d399" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="7" y1="18" x2="16" y2="27" stroke="#34d399" stroke-width="1.5" stroke-linecap="round"/>
      <line x1="25" y1="18" x2="16" y2="27" stroke="#34d399" stroke-width="1.5" stroke-linecap="round"/>
      <circle cx="16" cy="6" r="3" fill="#34d399"/>
      <circle cx="7" cy="18" r="2.5" fill="#34d399" opacity="0.85"/>
      <circle cx="25" cy="18" r="2.5" fill="#34d399" opacity="0.85"/>
      <circle cx="16" cy="27" r="2.5" fill="#34d399" opacity="0.7"/>
    </svg>
    <span>Mimir</span>
  </div>

  <div class="nav-main" id="nav-main">
    <button class="nav-btn active" data-page="agents" onclick="handleNav('agents')">
      <span class="icon">\u{1F4E6}</span>
      <span class="label">Agents</span>
    </button>
    <button class="nav-btn" data-page="orchestration" onclick="handleNav('orchestration')">
      <span class="icon">\u{2699}\u{FE0F}</span>
      <span class="label">Orchestration</span>
      <span class="badge" id="agent-badge" style="display:none">0</span>
    </button>
    <button class="nav-btn" data-page="tasks" onclick="handleNav('tasks')">
      <span class="icon">\u{2705}</span>
      <span class="label">Tasks</span>
    </button>
    <button class="nav-btn" data-page="marks" onclick="handleNav('marks')">
      <span class="icon">\u{1F4CC}</span>
      <span class="label">Marks</span>
    </button>
  </div>

  <div class="claude-usage" id="claude-usage" style="display:none" onclick="openPage('ClaudeUsage')">
    <div class="section-header">Claude Usage</div>
    <div class="usage-row">
      <span class="usage-label">5h</span>
      <div class="usage-bar"><div class="usage-bar-fill ub-green" id="usage-5h-bar" style="width:0%"></div></div>
      <span class="usage-pct u-green" id="usage-5h-pct">-</span>
    </div>
    <div class="usage-reset" id="usage-5h-reset" style="display:none"></div>
    <div class="usage-row">
      <span class="usage-label">7d</span>
      <div class="usage-bar"><div class="usage-bar-fill ub-green" id="usage-7d-bar" style="width:0%"></div></div>
      <span class="usage-pct u-green" id="usage-7d-pct">-</span>
    </div>
    <div class="usage-row">
      <span class="usage-label">Son</span>
      <div class="usage-bar"><div class="usage-bar-fill ub-green" id="usage-son-bar" style="width:0%"></div></div>
      <span class="usage-pct u-green" id="usage-son-pct">-</span>
    </div>
  </div>

  <div class="agents-section" id="agents-list" style="display:none">
    <div class="section-header">Active Agents</div>
    <div id="agents-container"></div>
  </div>

  <div class="offline" id="offline" style="display:none">
    <div class="icon">\u{26A1}</div>
    <div>Daemon offline</div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const state = vscode.getState() || { activePage: 'agents' };
    let currentPage = state.activePage || 'agents';
    if (currentPage === 'claude') currentPage = 'agents';
    updateActiveNav(currentPage);

    function handleNav(page) {
      currentPage = page;
      state.activePage = page;
      vscode.setState(state);
      updateActiveNav(page);
      if (page === 'agents') {
        vscode.postMessage({ command: 'open', page: 'Agents' });
      } else if (page === 'orchestration') {
        vscode.postMessage({ command: 'navigate', page: 'orchestration' });
      } else if (page === 'tasks') {
        vscode.postMessage({ command: 'open', page: 'Tasks' });
      } else if (page === 'marks') {
        vscode.postMessage({ command: 'navigate', page: 'marks' });
      }
    }

    function updateActiveNav(page) {
      document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.page === page);
      });
    }

    function openPage(page) {
      vscode.postMessage({ command: 'open', page: page });
    }

    function formatResetTime(ts) {
      if (!ts) return '';
      const d = typeof ts === 'string' ? new Date(ts) : new Date(ts * 1000);
      const now = new Date();
      const diff = d - now;
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZoneName: 'short' });
      if (diff <= 0) return 'now';
      const hours = Math.floor(diff / 3600000);
      const mins = Math.floor((diff % 3600000) / 60000);
      const remaining = hours > 0 ? hours + 'h ' + mins + 'm' : mins + 'm';
      return remaining + ' · ' + timeStr;
    }

    function updateUsageBar(name, pct) {
      const p = Math.max(0, Math.min(100, Math.round(pct)));
      const cls = p > 80 ? 'red' : p > 50 ? 'yellow' : 'green';
      document.getElementById('usage-' + name + '-bar').className = 'usage-bar-fill ub-' + cls;
      document.getElementById('usage-' + name + '-bar').style.width = p + '%';
      document.getElementById('usage-' + name + '-pct').className = 'usage-pct u-' + cls;
      document.getElementById('usage-' + name + '-pct').textContent = p + '%';
    }

    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'stats') {
        document.getElementById('offline').style.display = 'none';

        const badge = document.getElementById('agent-badge');
        if (msg.stats.active_agents > 0) {
          badge.textContent = msg.stats.active_agents;
          badge.style.display = 'inline';
        } else {
          badge.style.display = 'none';
        }

        const list = document.getElementById('agents-list');
        const container = document.getElementById('agents-container');
        if (msg.agents && msg.agents.length > 0) {
          list.style.display = 'block';
          container.innerHTML = msg.agents.map(a =>
            '<div class="agent-item">' +
              '<div class="agent-dot"></div>' +
              '<span class="agent-name">' + a.agent_name + '</span>' +
              '<span class="agent-type">' + (a.agent_type || '') + '</span>' +
            '</div>'
          ).join('');
        } else {
          list.style.display = 'none';
        }
      } else if (msg.type === 'claudeUsage') {
        const usageSection = document.getElementById('claude-usage');
        if (msg.usage) {
          usageSection.style.display = 'block';
          if (msg.usage.fiveHour != null) updateUsageBar('5h', msg.usage.fiveHour);
          if (msg.usage.sevenDay != null) updateUsageBar('7d', msg.usage.sevenDay);
          if (msg.usage.sevenDaySonnet != null) updateUsageBar('son', msg.usage.sevenDaySonnet);
          const resetEl = document.getElementById('usage-5h-reset');
          if (msg.usage.fiveHourReset) {
            resetEl.style.display = 'block';
            resetEl.textContent = 'resets in ' + formatResetTime(msg.usage.fiveHourReset);
          }
        }
      } else if (msg.type === 'offline') {
        document.getElementById('agents-list').style.display = 'none';
        document.getElementById('offline').style.display = 'block';
      }
    });
  </script>
</body>
</html>`;
  }
}
