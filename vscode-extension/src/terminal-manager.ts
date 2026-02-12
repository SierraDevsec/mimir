import * as vscode from "vscode";
import * as path from "node:path";

interface ManagedTerminal {
  terminal: vscode.Terminal;
  type: "claude" | "swarm";
  projectId: string;
  location: "panel" | "editor";
}

export class TerminalManager {
  private terminals = new Map<string, ManagedTerminal>();
  private disposables: vscode.Disposable[] = [];

  constructor() {
    // Track terminal closures
    this.disposables.push(
      vscode.window.onDidCloseTerminal((terminal) => {
        for (const [key, managed] of this.terminals) {
          if (managed.terminal === terminal) {
            this.terminals.delete(key);
            break;
          }
        }
      })
    );
  }

  /**
   * Launch Claude Code in a VSCode terminal **in the editor area**.
   *
   * Electron equivalent: claude page — full-screen xterm.js terminal.
   * VSCode approach: create terminal → move to editor area → gets its own tab
   * like a file editor. This way Claude gets the main content area,
   * not the bottom terminal panel.
   */
  launchClaude(projectId: string, projectPath: string, port: number): vscode.Terminal {
    const key = `claude-${projectId}`;
    const existing = this.terminals.get(key);
    if (existing && existing.terminal.exitStatus === undefined) {
      // Focus existing terminal — if in editor area, it acts like switching tabs
      existing.terminal.show();
      return existing.terminal;
    }

    const settingsJson = JSON.stringify({
      enableAllProjectMcpServers: true,
      permissions: {
        allow: [
          "mcp__clnode-messaging__send_message",
          "mcp__clnode-messaging__read_messages",
          "mcp__clnode-messaging__list_agents",
          "mcp__clnode-messaging__register_agent",
        ],
      },
    });

    const terminal = vscode.window.createTerminal({
      name: `Claude [${projectId}]`,
      cwd: projectPath,
      env: {
        CLNODE_AGENT_NAME: "ROOTCLAUDE",
        CLNODE_PROJECT_ID: projectId,
        CLNODE_PORT: String(port),
      },
      iconPath: new vscode.ThemeIcon("hubot"),
      // Place directly in editor area (not bottom panel)
      // This makes Claude a tab in the editor group, like Electron's full-screen terminal
      location: vscode.TerminalLocation.Editor,
    });

    // Launch claude CLI
    terminal.sendText(
      `claude --model opus --settings '${settingsJson}'`
    );
    terminal.show();

    this.terminals.set(key, { terminal, type: "claude", projectId, location: "editor" });
    return terminal;
  }

  /**
   * Launch tmux swarm terminal **in the bottom panel**.
   *
   * Electron equivalent: orchestration page "Terminal" tab.
   * VSCode approach: stays in the terminal panel (bottom). User can
   * view orchestration webview in editor + swarm terminal in panel
   * simultaneously — better than Electron's one-at-a-time toggle.
   */
  launchSwarm(projectId: string, projectPath: string): vscode.Terminal {
    const key = `swarm-${projectId}`;
    const existing = this.terminals.get(key);
    if (existing && existing.terminal.exitStatus === undefined) {
      existing.terminal.show();
      return existing.terminal;
    }

    const terminal = vscode.window.createTerminal({
      name: `Swarm [${projectId}]`,
      cwd: projectPath,
      iconPath: new vscode.ThemeIcon("server-process"),
      location: vscode.TerminalLocation.Editor,
    });

    // Attach to tmux session with tiled layout
    terminal.sendText(
      `tmux -L clnode attach -t clnode-${projectId} \\; ` +
      `set-option -g window-size latest \\; ` +
      `set-option aggressive-resize on \\; ` +
      `set-hook -g client-resized select-layout\\ tiled \\; ` +
      `select-layout tiled`
    );
    terminal.show();

    this.terminals.set(key, { terminal, type: "swarm", projectId, location: "panel" });
    return terminal;
  }

  /**
   * Send a command to the Claude terminal for a project.
   * Equivalent to Electron's tmux:sendKeys IPC.
   */
  sendToClaudeTerminal(projectId: string, text: string): boolean {
    const key = `claude-${projectId}`;
    const managed = this.terminals.get(key);
    if (!managed || managed.terminal.exitStatus !== undefined) {
      return false;
    }
    managed.terminal.sendText(text);
    return true;
  }

  /**
   * Check if a Claude terminal exists and is alive for a project.
   */
  hasClaudeTerminal(projectId: string): boolean {
    const key = `claude-${projectId}`;
    const managed = this.terminals.get(key);
    return !!managed && managed.terminal.exitStatus === undefined;
  }

  /**
   * Check if a swarm terminal exists and is alive for a project.
   */
  hasSwarmTerminal(projectId: string): boolean {
    const key = `swarm-${projectId}`;
    const managed = this.terminals.get(key);
    return !!managed && managed.terminal.exitStatus === undefined;
  }

  /**
   * Get all active terminals for a project.
   */
  getProjectTerminals(projectId: string): ManagedTerminal[] {
    return [...this.terminals.values()].filter(
      (t) => t.projectId === projectId && t.terminal.exitStatus === undefined
    );
  }

  dispose(): void {
    this.disposables.forEach((d) => d.dispose());
    // Don't kill terminals on extension deactivate — user may want to keep them
  }
}
