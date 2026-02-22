import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";

/**
 * Auto-initialize mimir hooks for the current workspace.
 * Checks if .claude/settings.local.json has hooks configured.
 * If not, runs `mimir init` or writes hooks config directly.
 */
export async function autoInitWorkspace(port: number): Promise<void> {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders?.length) return;

  for (const folder of folders) {
    const workspacePath = folder.uri.fsPath;
    const hooks = hasHooksInstalled(workspacePath);
    const agents = hasAgents(workspacePath);

    // Always ensure project is registered in DB
    await registerProject(workspacePath, port);

    // Everything already set up
    if (hooks && agents) continue;

    // Decide init mode
    // hooks 없음 + agents 없음 → full init (hooks + templates)
    // hooks 없음 + agents 있음 → hooks only
    // hooks 있음 + agents 없음 → templates only (no hooks reinstall)
    const needsHooks = !hooks;
    const needsTemplates = !agents;

    if (needsHooks) {
      const hooksOnly = !needsTemplates;
      const initOk = await tryMimirInit(workspacePath, port, hooksOnly);
      if (initOk) {
        const msg = hooksOnly
          ? `Mimir: hooks installed for "${folder.name}". Restart Claude CLI to activate.`
          : `Mimir: hooks + agents/skills installed for "${folder.name}". Restart Claude CLI to activate.`;
        vscode.window.showInformationMessage(msg);
        continue;
      }

      // Fallback: write hooks config directly
      const hookScript = findHookScript();
      if (!hookScript) continue;

      writeHooksConfig(workspacePath, hookScript, port);
      await registerProject(workspacePath, port);
      vscode.window.showInformationMessage(
        `Mimir: hooks installed for "${folder.name}". Restart Claude CLI to activate.`
      );
    } else if (needsTemplates) {
      // Hooks exist but no agents → install templates only
      const ok = await tryMimirInit(workspacePath, port, false);
      if (ok) {
        vscode.window.showInformationMessage(
          `Mimir: agents/skills templates installed for "${folder.name}".`
        );
      }
    }
  }
}

function hasHooksInstalled(workspacePath: string): boolean {
  const settingsPath = path.join(workspacePath, ".claude", "settings.local.json");
  try {
    const content = fs.readFileSync(settingsPath, "utf-8");
    const settings = JSON.parse(content);
    return !!settings?.hooks?.SessionStart;
  } catch {
    return false;
  }
}

function hasAgents(workspacePath: string): boolean {
  const agentsDir = path.join(workspacePath, ".claude", "agents");
  try {
    const files = fs.readdirSync(agentsDir);
    return files.some((f) => f.endsWith(".md"));
  } catch {
    return false;
  }
}

async function tryMimirInit(workspacePath: string, port: number, hooksOnly: boolean): Promise<boolean> {
  const flag = hooksOnly ? " --hooks-only" : "";
  const commands = [
    `npx mimir init "${workspacePath}"${flag} -p ${port}`,
    `mimir init "${workspacePath}"${flag} -p ${port}`,
  ];

  for (const cmd of commands) {
    try {
      await execAsync(cmd);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

function findHookScript(): string | null {
  // Common locations for hook.sh
  const candidates = [
    // Global npm install
    ...getGlobalNodeModulesPaths().map((p) => path.join(p, "mimir", "src", "hooks", "hook.sh")),
    // npx cache / local
    path.join(process.env.HOME ?? "", ".local", "share", "mimir", "hook.sh"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Try `which mimir` to find the install path
  try {
    const { execSync } = require("node:child_process");
    const mimirBin = execSync("which mimir", { encoding: "utf-8" }).trim();
    if (mimirBin) {
      // mimir bin is at <prefix>/bin/mimir, hook.sh is at <prefix>/lib/node_modules/mimir/src/hooks/hook.sh
      const prefix = path.resolve(path.dirname(mimirBin), "..");
      const hookPath = path.join(prefix, "lib", "node_modules", "mimir", "src", "hooks", "hook.sh");
      if (fs.existsSync(hookPath)) return hookPath;
    }
  } catch { /* ignore */ }

  return null;
}

function getGlobalNodeModulesPaths(): string[] {
  const paths: string[] = [];
  try {
    const { execSync } = require("node:child_process");
    const npmRoot = execSync("npm root -g", { encoding: "utf-8" }).trim();
    if (npmRoot) paths.push(npmRoot);
  } catch { /* ignore */ }
  return paths;
}

function writeHooksConfig(workspacePath: string, hookScript: string, port: number): void {
  const claudeDir = path.join(workspacePath, ".claude");
  fs.mkdirSync(claudeDir, { recursive: true });

  const hookCommand = port === 3100 ? hookScript : `MIMIR_PORT=${port} ${hookScript}`;

  const events = [
    "SessionStart", "SessionEnd", "SubagentStart", "SubagentStop",
    "PostToolUse", "Stop", "UserPromptSubmit",
  ];

  const hooks: Record<string, unknown[]> = {};
  for (const event of events) {
    hooks[event] = [{ hooks: [{ type: "command", command: hookCommand }] }];
  }

  const settingsPath = path.join(claudeDir, "settings.local.json");
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
  } catch { /* new file */ }

  settings.hooks = hooks;

  // Agent Teams required settings (same as `mimir init`)
  const env = (settings.env ?? {}) as Record<string, string>;
  env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
  settings.env = env;
  settings.teammateMode = "tmux";
  settings.enableAllProjectMcpServers = true;

  // MCP tool permissions
  const mcpPermissions = [
    "mcp__mimir-messaging__send_message",
    "mcp__mimir-messaging__read_messages",
    "mcp__mimir-messaging__list_agents",
    "mcp__mimir-messaging__register_agent",
  ];
  const perms = (settings.permissions ?? {}) as { allow?: string[] };
  const existingPerms = new Set(perms.allow ?? []);
  for (const perm of mcpPermissions) {
    existingPerms.add(perm);
  }
  perms.allow = [...existingPerms];
  settings.permissions = perms;

  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

async function registerProject(workspacePath: string, port: number): Promise<void> {
  const projectName = path.basename(workspacePath);
  const projectId = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  try {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = process.env.MIMIR_API_TOKEN;
    if (token) headers["Authorization"] = `Bearer ${token}`;

    await fetch(`http://localhost:${port}/hooks/RegisterProject`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        project_id: projectId,
        project_name: projectName,
        project_path: workspacePath,
      }),
    });
  } catch { /* daemon might not be running yet */ }
}

function execAsync(cmd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout: 15000 }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}
