import * as vscode from "vscode";
import * as path from "node:path";
import { ApiClient } from "./api-client";
import { StatusBar } from "./status-bar";
import { SidebarViewProvider } from "./sidebar-view";
import { openWebviewPanel, disposePanel, setWebviewMessageHandler, postToPanel, isPanelRoute } from "./webview/panel";
import { fetchClaudeUsage, getClaudeAccountInfo } from "./claude-usage";
import { ensureDaemon, startDaemon, stopDaemon } from "./daemon";
import { autoInitWorkspace } from "./auto-init";
import { TerminalManager } from "./terminal-manager";

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  const config = vscode.workspace.getConfiguration("mimir");
  const port = config.get<number>("port", 3100);
  const autoStart = config.get<boolean>("autoStartDaemon", false);
  const pollingInterval = config.get<number>("pollingInterval", 5000);

  const getPort = () => vscode.workspace.getConfiguration("mimir").get<number>("port", 3100);
  const baseUrl = `http://localhost:${port}`;
  const api = new ApiClient(baseUrl);

  const workspacePaths = (vscode.workspace.workspaceFolders ?? []).map(f => f.uri.fsPath);
  const getProjectPath = (): string => workspacePaths[0] ?? process.env.HOME ?? "/";
  const getProjectId = (): string => {
    return sidebarProvider.getProjectId()
      ?? path.basename(getProjectPath()).toLowerCase().replace(/[^a-z0-9-]/g, "-");
  };

  // Terminal manager
  const terminalManager = new TerminalManager();
  context.subscriptions.push({ dispose: () => terminalManager.dispose() });

  // Sidebar webview (auto-detects project from workspace path)
  const sidebarProvider = new SidebarViewProvider(port, workspacePaths);
  sidebarProvider.onViewReady(() => refreshClaudeUsageData());

  sidebarProvider.onCommand((command, args) => {
    if (command === "navigate" && args?.page === "orchestration") {
      openWebviewPanel(getPort(), "/swarm", "Mimir Orchestration", getProjectId());
    } else if (command === "navigate" && args?.page === "marks") {
      openWebviewPanel(getPort(), "/observations", "Mimir Marks", getProjectId());
    }
  });

  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(SidebarViewProvider.viewType, sidebarProvider)
  );

  // Claude usage data fetcher
  async function refreshClaudeUsageData(): Promise<void> {
    try {
      const usage = await fetchClaudeUsage();
      sidebarProvider.postClaudeUsage(
        usage
          ? {
              fiveHour: usage.fiveHour?.utilization,
              fiveHourReset: usage.fiveHour?.resetsAt,
              sevenDay: usage.sevenDay?.utilization,
              sevenDaySonnet: usage.sevenDaySonnet?.utilization,
              extraUsage: usage.extraUsage,
            }
          : null
      );
      if (isPanelRoute("/claude-usage")) {
        const account = await getClaudeAccountInfo();
        postToPanel({ type: "usageUpdate", account, usage });
      }
    } catch { /* silent */ }
  }

  refreshClaudeUsageData();
  const usageTimer = setInterval(refreshClaudeUsageData, 3 * 60 * 1000);
  context.subscriptions.push({ dispose: () => clearInterval(usageTimer) });

  // Handle messages from webview panels
  setWebviewMessageHandler((msg) => {
    if (msg.command === "launchSwarm") {
      terminalManager.launchSwarm(getProjectId(), getProjectPath());
    } else if (msg.command === "refreshClaudeUsage") {
      refreshClaudeUsageData();
    }
  });

  // Status bar
  const statusBar = new StatusBar(api);
  statusBar.startPolling(pollingInterval);
  context.subscriptions.push({ dispose: () => statusBar.dispose() });

  // Commands
  context.subscriptions.push(
    vscode.commands.registerCommand("mimir.openTasks", () =>
      openWebviewPanel(getPort(), "/tasks", "Mimir Tasks", getProjectId())),
    vscode.commands.registerCommand("mimir.openAgents", () =>
      openWebviewPanel(getPort(), "/agents", "Mimir Agents", getProjectId())),
    vscode.commands.registerCommand("mimir.openClaudeUsage", async () => {
      openWebviewPanel(getPort(), "/claude-usage", "Claude Account & Usage", getProjectId());
      refreshClaudeUsageData();
    }),
    vscode.commands.registerCommand("mimir.openOrchestration", () =>
      openWebviewPanel(getPort(), "/swarm", "Mimir Orchestration", getProjectId())),
    vscode.commands.registerCommand("mimir.openMarks", () =>
      openWebviewPanel(getPort(), "/observations", "Mimir Marks", getProjectId())),

    // Terminal commands
    vscode.commands.registerCommand("mimir.launchClaude", () =>
      terminalManager.launchClaude(getProjectId(), getProjectPath(), getPort())),
    vscode.commands.registerCommand("mimir.launchSwarm", () =>
      terminalManager.launchSwarm(getProjectId(), getProjectPath())),

    // Daemon commands
    vscode.commands.registerCommand("mimir.startDaemon", async () => {
      const ok = await startDaemon();
      if (ok) vscode.window.showInformationMessage("Mimir daemon started.");
    }),
    vscode.commands.registerCommand("mimir.stopDaemon", async () => {
      await stopDaemon();
      vscode.window.showInformationMessage("Mimir daemon stopped.");
    }),
  );

  // Async setup (non-blocking)
  ensureDaemon(baseUrl, autoStart).catch(() => {});
  autoInitWorkspace(port).catch(() => {});
}

export function deactivate(): void {
  disposePanel();
}
