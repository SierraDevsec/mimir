import type { ClaudeAccountInfo, ClaudeUsage } from "../claude-usage";

/**
 * Generates the full HTML for the Claude Account & Usage webview panel.
 * Data is injected server-side and refreshed via postMessage from extension.
 */
export function getClaudeUsageHtml(
  account: ClaudeAccountInfo | null,
  usage: ClaudeUsage | null
): string {
  const acctJson = JSON.stringify(account ?? {});
  const usageJson = JSON.stringify(usage ?? {});

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
        content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline';">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif);
      font-size: var(--vscode-font-size, 13px);
      color: var(--vscode-foreground, #e5e5e5);
      background: var(--vscode-editor-background, #1e1e1e);
      padding: 24px;
      max-width: 640px;
      margin: 0 auto;
    }

    h1 {
      font-size: 18px;
      font-weight: 600;
      margin-bottom: 20px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    h1 .icon { font-size: 22px; }

    .card {
      background: var(--vscode-editorWidget-background, #252526);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }

    .card-title {
      font-size: 11px;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      color: var(--vscode-descriptionForeground, #9ca3af);
      margin-bottom: 12px;
      font-weight: 600;
    }

    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 6px 0;
      font-size: 12px;
      border-bottom: 1px solid var(--vscode-panel-border, #3c3c3c);
    }
    .info-row:last-child { border-bottom: none; }
    .info-key { color: var(--vscode-descriptionForeground, #9ca3af); }
    .info-val { font-weight: 500; }

    .usage-item {
      margin-bottom: 14px;
    }
    .usage-item:last-child { margin-bottom: 0; }
    .usage-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 6px;
    }
    .usage-name {
      font-size: 12px;
      font-weight: 500;
    }
    .usage-detail {
      font-size: 11px;
      color: var(--vscode-descriptionForeground, #9ca3af);
    }
    .usage-pct {
      font-size: 13px;
      font-weight: 700;
    }
    .bar {
      width: 100%;
      height: 8px;
      border-radius: 4px;
      background: var(--vscode-editor-background, #1e1e1e);
      border: 1px solid var(--vscode-panel-border, #3c3c3c);
      overflow: hidden;
    }
    .bar-fill {
      height: 100%;
      border-radius: 4px;
      transition: width 0.4s ease;
    }
    .reset-info {
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #9ca3af);
      margin-top: 4px;
    }

    .c-green { color: #4ade80; }
    .c-yellow { color: #facc15; }
    .c-red { color: #f87171; }
    .bg-green { background: #4ade80; }
    .bg-yellow { background: #facc15; }
    .bg-red { background: #f87171; }

    .extra-usage {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      padding: 4px 0;
    }

    .no-data {
      text-align: center;
      padding: 20px;
      color: var(--vscode-descriptionForeground, #9ca3af);
      font-size: 12px;
    }

    .refresh-hint {
      text-align: center;
      font-size: 10px;
      color: var(--vscode-descriptionForeground, #9ca3af);
      margin-top: 8px;
    }
  </style>
</head>
<body>
  <h1><span class="icon">\u{1F4CA}</span> Account & Usage</h1>

  <!-- Account Info -->
  <div class="card" id="account-card">
    <div class="card-title">Account</div>
    <div id="account-content"><div class="no-data">Loading...</div></div>
  </div>

  <!-- Usage -->
  <div class="card" id="usage-card">
    <div class="card-title">Usage</div>
    <div id="usage-content"><div class="no-data">Loading...</div></div>
  </div>

  <div class="refresh-hint">Auto-refreshes every 10 minutes</div>

  <script>
    const vscode = acquireVsCodeApi();
    let account = ${acctJson};
    let usage = ${usageJson};

    function colorClass(pct) {
      return pct > 80 ? 'red' : pct > 50 ? 'yellow' : 'green';
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

    function formatPlan(billingType, subscriptionType) {
      if (subscriptionType) {
        return subscriptionType.replace(/_/g, ' ').replace(/\\b\\w/g, c => c.toUpperCase());
      }
      if (billingType === 'stripe_subscription') return 'Pro';
      return billingType || 'Unknown';
    }

    function renderAccount() {
      const el = document.getElementById('account-content');
      if (!account || !account.email) {
        el.innerHTML = '<div class="no-data">No account info available</div>';
        return;
      }
      el.innerHTML =
        '<div class="info-row"><span class="info-key">Name</span><span class="info-val">' + (account.displayName || '-') + '</span></div>' +
        '<div class="info-row"><span class="info-key">Email</span><span class="info-val">' + account.email + '</span></div>' +
        '<div class="info-row"><span class="info-key">Organization</span><span class="info-val">' + (account.organizationName || '-') + '</span></div>' +
        '<div class="info-row"><span class="info-key">Plan</span><span class="info-val">' + formatPlan(account.billingType, account.subscriptionType) + '</span></div>' +
        (account.rateLimitTier ? '<div class="info-row"><span class="info-key">Rate Limit</span><span class="info-val">' + account.rateLimitTier.replace(/_/g, ' ') + '</span></div>' : '');
    }

    function renderUsageItem(label, data) {
      if (!data || data.utilization == null) return '';
      const pct = Math.round(data.utilization);
      const cls = colorClass(pct);
      const reset = data.resetsAt ? '<div class="reset-info">Resets in ' + formatResetTime(data.resetsAt) + '</div>' : '';
      return '<div class="usage-item">' +
        '<div class="usage-header">' +
          '<span class="usage-name">' + label + '</span>' +
          '<span class="usage-pct c-' + cls + '">' + pct + '%</span>' +
        '</div>' +
        '<div class="bar"><div class="bar-fill bg-' + cls + '" style="width:' + pct + '%"></div></div>' +
        reset +
      '</div>';
    }

    function renderUsage() {
      const el = document.getElementById('usage-content');
      if (!usage || (!usage.fiveHour && !usage.sevenDay && !usage.sevenDaySonnet)) {
        el.innerHTML = '<div class="no-data">No usage data available</div>';
        return;
      }
      let html = '';
      html += renderUsageItem('5-Hour Limit', usage.fiveHour);
      html += renderUsageItem('7-Day Limit', usage.sevenDay);
      html += renderUsageItem('7-Day Sonnet Limit', usage.sevenDaySonnet);

      if (usage.extraUsage) {
        if (usage.extraUsage.isEnabled) {
          const epct = Math.round(usage.extraUsage.utilization || 0);
          const ecls = colorClass(epct);
          html += '<div class="usage-item">' +
            '<div class="usage-header">' +
              '<span class="usage-name">Extra Usage (Monthly)</span>' +
              '<span class="usage-pct c-' + ecls + '">' + epct + '%</span>' +
            '</div>' +
            '<div class="bar"><div class="bar-fill bg-' + ecls + '" style="width:' + epct + '%"></div></div>' +
            '<div class="extra-usage">' +
              '<span>Used: $' + ((usage.extraUsage.usedCredits || 0) / 100).toFixed(2) + '</span>' +
              '<span>Limit: $' + ((usage.extraUsage.monthlyLimit || 0) / 100).toFixed(2) + '</span>' +
            '</div>' +
          '</div>';
        } else {
          html += '<div class="usage-item">' +
            '<div class="usage-header">' +
              '<span class="usage-name">Extra Usage</span>' +
              '<span class="usage-detail">Not enabled</span>' +
            '</div>' +
          '</div>';
        }
      }

      el.innerHTML = html;
    }

    // Initial render
    renderAccount();
    renderUsage();

    // Listen for updates from extension
    window.addEventListener('message', (e) => {
      const msg = e.data;
      if (msg.type === 'usageUpdate') {
        if (msg.account) { account = msg.account; renderAccount(); }
        if (msg.usage) { usage = msg.usage; renderUsage(); }
      }
    });

    // Request periodic updates
    function requestUpdate() {
      vscode.postMessage({ command: 'refreshClaudeUsage' });
    }
    setInterval(requestUpdate, 10 * 60 * 1000);
    requestUpdate();
  </script>
</body>
</html>`;
}
