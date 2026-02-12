import * as vscode from "vscode";
import type { ApiClient } from "./api-client";

export class StatusBar {
  private item: vscode.StatusBarItem;
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private api: ApiClient) {
    this.item = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 50);
    this.item.command = "clnode.openDashboard";
    this.item.show();
  }

  async update(): Promise<void> {
    try {
      const stats = await this.api.stats();
      this.item.text = `$(pulse) clnode: ${stats.active_agents} agents`;
      this.item.tooltip = `Sessions: ${stats.active_sessions} | Agents: ${stats.active_agents} | Click to open dashboard`;
      this.item.backgroundColor = undefined;
    } catch {
      this.item.text = "$(circle-slash) clnode: offline";
      this.item.tooltip = "clnode daemon is not running. Click to open dashboard.";
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
