import * as vscode from "vscode";

export class SidebarViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = "mimir-sidebar-webview";

  private _view?: vscode.WebviewView;
  private _onCommand?: (command: string, args?: Record<string, string>) => void;
  private _lastUsage: { fiveHour?: number; fiveHourReset?: string; sevenDay?: number; sevenDaySonnet?: number; extraUsage?: { isEnabled: boolean; utilization?: number } } | null = null;
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
    extraUsage?: { isEnabled: boolean; utilization?: number };
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
      } else if (msg.command === "webviewReady") {
        // Webview JS has loaded — safe to send cached data
        if (this._lastUsage) {
          webviewView.webview.postMessage({ type: "claudeUsage", usage: this._lastUsage });
        }
        this._onViewReady?.();
      }
    });

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
      const projects = await res.json() as Array<{ id: string; path: string }>;
      if (this.workspacePaths.length > 0) {
        const match = projects.find((p) => this.workspacePaths.includes(p.path));
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
      opacity: 0.8;
    }
    .nav-btn .icon svg { width: 15px; height: 15px; }
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
      width: 48px; flex-shrink: 0; font-size: 10px;
    }
    .usage-bar {
      flex: 1; height: 6px; border-radius: 3px;
      background: var(--vscode-editor-background);
      border: 1px solid var(--vscode-panel-border);
      overflow: hidden;
    }
    .usage-bar-fill { height: 100%; border-radius: 3px; transition: width 0.3s; }
    .usage-pct { min-width: 32px; text-align: right; font-size: 10px; font-weight: 600; flex-shrink: 0; }
    .usage-reset {
      font-size: 11px; color: var(--vscode-descriptionForeground);
      padding: 0 0 6px 0; opacity: 0.9;
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
  <div class="nav-main" id="nav-main">
    <button class="nav-btn active" data-page="agents" onclick="handleNav('agents')">
      <span class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 4.05493C17.5 4.55237 21 8.36745 21 13V22H3V13C3 8.36745 6.50005 4.55237 11 4.05493V1H13V4.05493ZM19 20V13C19 9.13401 15.866 6 12 6C8.13401 6 5 9.13401 5 13V20H19ZM12 18C9.23858 18 7 15.7614 7 13C7 10.2386 9.23858 8 12 8C14.7614 8 17 10.2386 17 13C17 15.7614 14.7614 18 12 18ZM12 16C13.6569 16 15 14.6569 15 13C15 11.3431 13.6569 10 12 10C10.3431 10 9 11.3431 9 13C9 14.6569 10.3431 16 12 16ZM12 14C11.4477 14 11 13.5523 11 13C11 12.4477 11.4477 12 12 12C12.5523 12 13 12.4477 13 13C13 13.5523 12.5523 14 12 14Z"/></svg></span>
      <span class="label">Agents</span>
    </button>
    <button class="nav-btn" data-page="orchestration" onclick="handleNav('orchestration')">
      <span class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 11C14.7614 11 17 13.2386 17 16V22H15V16C15 14.4023 13.7511 13.0963 12.1763 13.0051L12 13C10.4023 13 9.09634 14.2489 9.00509 15.8237L9 16V22H7V16C7 13.2386 9.23858 11 12 11ZM5.5 14C5.77885 14 6.05009 14.0326 6.3101 14.0942C6.14202 14.594 6.03873 15.122 6.00896 15.6693L6 16L6.0007 16.0856C5.88757 16.0456 5.76821 16.0187 5.64446 16.0069L5.5 16C4.7203 16 4.07955 16.5949 4.00687 17.3555L4 17.5V22H2V17.5C2 15.567 3.567 14 5.5 14ZM18.5 14C20.433 14 22 15.567 22 17.5V22H20V17.5C20 16.7203 19.4051 16.0796 18.6445 16.0069L18.5 16C18.3248 16 18.1566 16.03 18.0003 16.0852L18 16C18 15.3343 17.8916 14.694 17.6915 14.0956C17.9499 14.0326 18.2211 14 18.5 14ZM5.5 8C6.88071 8 8 9.11929 8 10.5C8 11.8807 6.88071 13 5.5 13C4.11929 13 3 11.8807 3 10.5C3 9.11929 4.11929 8 5.5 8ZM18.5 8C19.8807 8 21 9.11929 21 10.5C21 11.8807 19.8807 13 18.5 13C17.1193 13 16 11.8807 16 10.5C16 9.11929 17.1193 8 18.5 8ZM5.5 10C5.22386 10 5 10.2239 5 10.5C5 10.7761 5.22386 11 5.5 11C5.77614 11 6 10.7761 6 10.5C6 10.2239 5.77614 10 5.5 10ZM18.5 10C18.2239 10 18 10.2239 18 10.5C18 10.7761 18.2239 11 18.5 11C18.7761 11 19 10.7761 19 10.5C19 10.2239 18.7761 10 18.5 10ZM12 2C14.2091 2 16 3.79086 16 6C16 8.20914 14.2091 10 12 10C9.79086 10 8 8.20914 8 6C8 3.79086 9.79086 2 12 2ZM12 4C10.8954 4 10 4.89543 10 6C10 7.10457 10.8954 8 12 8C13.1046 8 14 7.10457 14 6C14 4.89543 13.1046 4 12 4Z"/></svg></span>
      <span class="label">Orchestration</span>
      <span class="badge" id="agent-badge" style="display:none">0</span>
    </button>
    <button class="nav-btn" data-page="tasks" onclick="handleNav('tasks')">
      <span class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M19 4H5V20H19V4ZM3 2.9918C3 2.44405 3.44749 2 3.9985 2H19.9997C20.5519 2 20.9996 2.44772 20.9997 3L21 20.9925C21 21.5489 20.5551 22 20.0066 22H3.9934C3.44476 22 3 21.5447 3 21.0082V2.9918ZM11.2929 13.1213L15.5355 8.87868L16.9497 10.2929L11.2929 15.9497L7.40381 12.0607L8.81802 10.6464L11.2929 13.1213Z"/></svg></span>
      <span class="label">Tasks</span>
    </button>
    <button class="nav-btn" data-page="marks" onclick="handleNav('marks')">
      <span class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.0003 3C17.3924 3 21.8784 6.87976 22.8189 12C21.8784 17.1202 17.3924 21 12.0003 21C6.60812 21 2.12215 17.1202 1.18164 12C2.12215 6.87976 6.60812 3 12.0003 3ZM12.0003 19C16.2359 19 19.8603 16.052 20.7777 12C19.8603 7.94803 16.2359 5 12.0003 5C7.7646 5 4.14022 7.94803 3.22278 12C4.14022 16.052 7.7646 19 12.0003 19ZM12.0003 16.5C9.51498 16.5 7.50026 14.4853 7.50026 12C7.50026 9.51472 9.51498 7.5 12.0003 7.5C14.4855 7.5 16.5003 9.51472 16.5003 12C16.5003 14.4853 14.4855 16.5 12.0003 16.5ZM12.0003 14.5C13.381 14.5 14.5003 13.3807 14.5003 12C14.5003 10.6193 13.381 9.5 12.0003 9.5C10.6196 9.5 9.50026 10.6193 9.50026 12C9.50026 13.3807 10.6196 14.5 12.0003 14.5Z"/></svg></span>
      <span class="label">Marks</span>
    </button>
    <button class="nav-btn" data-page="skills" onclick="handleNav('skills')">
      <span class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M15.1986 9.94435C14.7649 9.53358 14.4859 8.98601 14.4859 8.39371C14.4859 7.17135 15.6073 6 17.0713 6C18.5353 6 19.6567 7.17135 19.6567 8.39371C19.6567 8.98601 19.3777 9.53358 18.944 9.94435L20.8 21H13.3426L15.1986 9.94435ZM17.0713 8C16.6986 8 16.4859 8.22486 16.4859 8.39371C16.4859 8.46498 16.5234 8.58462 16.6894 8.74462L17.0713 9.10607L17.4532 8.74462C17.6192 8.58462 17.6567 8.46498 17.6567 8.39371C17.6567 8.22486 17.444 8 17.0713 8ZM4.5 10C3.11929 10 2 8.88071 2 7.5C2 6.11929 3.11929 5 4.5 5C5.88071 5 7 6.11929 7 7.5C7 8.88071 5.88071 10 4.5 10ZM4.5 7C4.22386 7 4 7.22386 4 7.5C4 7.77614 4.22386 8 4.5 8C4.77614 8 5 7.77614 5 7.5C5 7.22386 4.77614 7 4.5 7ZM8 21H1L3.5 12H5.5L8 21ZM11.5 4C10.6716 4 10 3.32843 10 2.5C10 1.67157 10.6716 1 11.5 1C12.3284 1 13 1.67157 13 2.5C13 3.32843 12.3284 4 11.5 4ZM13.5 21H9.5L10 7H13L13.5 21Z"/></svg></span>
      <span class="label">Skills</span>
    </button>
    <button class="nav-btn" data-page="curation" onclick="handleNav('curation')">
      <span class="icon"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M4 3H20C20.5523 3 21 3.44772 21 4V20C21 20.5523 20.5523 21 20 21H4C3.44772 21 3 20.5523 3 20V4C3 3.44772 3.44772 3 4 3ZM5 5V19H19V5H5ZM7 7H9V9H7V7ZM7 11H9V13H7V11ZM7 15H9V17H7V15ZM11 7H17V9H11V7ZM11 11H17V13H11V11ZM11 15H17V17H11V15Z"/></svg></span>
      <span class="label">Curation</span>
    </button>
  </div>

  <div class="agents-section" id="agents-list" style="display:none">
    <div class="section-header">Active Agents</div>
    <div id="agents-container"></div>
  </div>

  <div class="offline" id="offline" style="display:none">
    <div class="icon">\u{26A1}</div>
    <div>Daemon offline</div>
  </div>

  <div style="flex:1"></div>

  <div class="claude-usage" id="claude-usage" style="display:none" onclick="openPage('ClaudeUsage')">
    <div class="section-header">Claude Usage</div>
    <div class="usage-reset" id="usage-5h-reset" style="display:none"></div>
    <div class="usage-row">
      <span class="usage-label">5 Hours</span>
      <div class="usage-bar"><div class="usage-bar-fill ub-green" id="usage-5h-bar" style="width:0%"></div></div>
      <span class="usage-pct u-green" id="usage-5h-pct">-</span>
    </div>
    <div class="usage-row">
      <span class="usage-label">7 Days</span>
      <div class="usage-bar"><div class="usage-bar-fill ub-green" id="usage-7d-bar" style="width:0%"></div></div>
      <span class="usage-pct u-green" id="usage-7d-pct">-</span>
    </div>
    <div class="usage-row">
      <span class="usage-label">Sonnet</span>
      <div class="usage-bar"><div class="usage-bar-fill ub-green" id="usage-son-bar" style="width:0%"></div></div>
      <span class="usage-pct u-green" id="usage-son-pct">-</span>
    </div>
    <div class="usage-row" id="usage-extra-row">
      <span class="usage-label">Extra</span>
      <div class="usage-bar" id="usage-extra-bar-wrap"><div class="usage-bar-fill ub-green" id="usage-extra-bar" style="width:0%"></div></div>
      <span class="usage-pct u-green" id="usage-extra-pct">-</span>
    </div>
  </div>

  <script>
    const vscode = acquireVsCodeApi();
    const state = vscode.getState() || { activePage: 'agents' };
    let currentPage = state.activePage || 'agents';
    if (currentPage === 'claude') currentPage = 'agents';
    updateActiveNav(currentPage);

    // Signal that webview JS is ready to receive messages
    vscode.postMessage({ command: 'webviewReady' });

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
      } else if (page === 'skills') {
        vscode.postMessage({ command: 'navigate', page: 'skills' });
      } else if (page === 'curation') {
        vscode.postMessage({ command: 'navigate', page: 'curation' });
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
      const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      const timeStr = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true }) + ' ' + tz;
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
          const extraBarWrap = document.getElementById('usage-extra-bar-wrap');
          const extraPct = document.getElementById('usage-extra-pct');
          if (msg.usage.extraUsage && msg.usage.extraUsage.isEnabled) {
            extraBarWrap.style.display = '';
            updateUsageBar('extra', (msg.usage.extraUsage.utilization ?? 0) * 100);
          } else {
            extraBarWrap.style.display = 'none';
            extraPct.className = 'usage-pct';
            extraPct.style.color = 'var(--vscode-descriptionForeground)';
            extraPct.style.marginLeft = 'auto';
            extraPct.textContent = 'Not enabled';
          }
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
