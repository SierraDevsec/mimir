import * as vscode from "vscode";
import type { ApiClient } from "./api-client";

export class StatusBar {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private api: ApiClient, private getProjectId: () => string) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = "mimir.openDashboard";
    this.item.show();
  }

  async update(): Promise<void> {
    const projectId = this.getProjectId();
    if (!projectId) {
      this.item.text = "$(pulse) mimir";
      this.item.tooltip = "Select a project to see agent stats";
      return;
    }
    try {
      const stats = await this.api.stats(projectId);
      this.item.text = `$(pulse) mimir: ${stats.active_agents} agents`;
      this.item.tooltip = `Sessions: ${stats.active_sessions} | Agents: ${stats.active_agents} | Click to open dashboard`;
      this.item.backgroundColor = undefined;
    } catch {
      this.item.text = "$(circle-slash) mimir: offline";
      this.item.tooltip = "mimir daemon is not running. Click to open dashboard.";
      this.item.backgroundColor = new vscode.ThemeColor("statusBarItem.warningBackground");
    }
  }

  startPolling(intervalMs: number): void {
    this.update();
    this.timer = setInterval(() => this.update(), intervalMs);
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.item.dispose();
  }
}
