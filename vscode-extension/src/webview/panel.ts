import * as vscode from "vscode";
import { getWebviewHtml } from "./html-provider";
import { getOrchestrationHtml } from "./orchestration-html";
import { getClaudeUsageHtml } from "./claude-usage-html";
import type { ClaudeAccountInfo, ClaudeUsage } from "../claude-usage";

let currentPanel: vscode.WebviewPanel | undefined;
let currentPort: number;
let currentRoute: string;

/** Callback for webview → extension messages (e.g. launchSwarm from orchestration) */
let onWebviewMessage: ((msg: { command: string }) => void) | undefined;

export function setWebviewMessageHandler(handler: (msg: { command: string }) => void): void {
  onWebviewMessage = handler;
}

export function openWebviewPanel(port: number, route: string = "/", title?: string, projectId?: string | null): void {
  const column = vscode.window.activeTextEditor
    ? vscode.ViewColumn.Beside
    : vscode.ViewColumn.One;

  currentPort = port;
  currentRoute = route;

  const isOrchestration = route === "/swarm";
  const isClaudeUsage = route === "/claude-usage";
  const html = isClaudeUsage
    ? getClaudeUsageHtml(null, null)
    : isOrchestration && projectId
      ? getOrchestrationHtml(port, projectId)
      : getWebviewHtml(port, route, projectId);

  if (currentPanel) {
    currentPanel.webview.html = html;
    currentPanel.title = title ?? "Mimir Dashboard";
    currentPanel.reveal(column);
    return;
  }

  currentPanel = vscode.window.createWebviewPanel(
    "mimir-webview",
    title ?? "Mimir Dashboard",
    column,
    {
      enableScripts: true,
      retainContextWhenHidden: true,
    }
  );

  currentPanel.webview.html = html;

  // Forward webview messages to the registered handler
  currentPanel.webview.onDidReceiveMessage((msg) => {
    onWebviewMessage?.(msg);
  });

  currentPanel.onDidDispose(() => {
    currentPanel = undefined;
  });
}

export function updatePanelProject(port: number, projectId: string | null): void {
  if (!currentPanel) return;
  if (currentRoute === "/claude-usage") return; // account-scoped, not project-scoped
  const isOrchestration = currentRoute === "/swarm";
  currentPanel.webview.html = isOrchestration && projectId
    ? getOrchestrationHtml(port, projectId)
    : getWebviewHtml(port, currentRoute || "/", projectId);
}

/** Send a message to the currently open webview panel */
export function postToPanel(message: unknown): void {
  currentPanel?.webview.postMessage(message);
}

/** Check if the panel is showing a specific route */
export function isPanelRoute(route: string): boolean {
  return !!currentPanel && currentRoute === route;
}

export function disposePanel(): void {
  currentPanel?.dispose();
}
