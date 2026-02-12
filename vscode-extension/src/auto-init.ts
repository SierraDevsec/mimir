import * as vscode from "vscode";
import * as fs from "node:fs";
import * as path from "node:path";
import { exec } from "node:child_process";

/**
 * Auto-initialize clnode hooks for the current workspace.
 * Checks if .claude/settings.local.json has hooks configured.
 * If not, runs `clnode init` or writes hooks config directly.
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
      const initOk = await tryClnodeInit(workspacePath, port, hooksOnly);
      if (initOk) {
        const msg = hooksOnly
          ? `clnode: hooks installed for "${folder.name}". Restart Claude CLI to activate.`
          : `clnode: hooks + agents/skills installed for "${folder.name}". Restart Claude CLI to activate.`;
        vscode.window.showInformationMessage(msg);
        continue;
      }

      // Fallback: write hooks config directly
      const hookScript = findHookScript();
      if (!hookScript) continue;

      writeHooksConfig(workspacePath, hookScript, port);
      await registerProject(workspacePath, port);
      vscode.window.showInformationMessage(
        `clnode: hooks installed for "${folder.name}". Restart Claude CLI to activate.`
      );
    } else if (needsTemplates) {
      // Hooks exist but no agents → install templates only
      const ok = await tryClnodeInit(workspacePath, port, false);
      if (ok) {
        vscode.window.showInformationMessage(
          `clnode: agents/skills templates installed for "${folder.name}".`
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

async function tryClnodeInit(workspacePath: string, port: number, hooksOnly: boolean): Promise<boolean> {
  const flag = hooksOnly ? " --hooks-only" : "";
  const commands = [
    `npx clnode init "${workspacePath}"${flag} -p ${port}`,
    `clnode init "${workspacePath}"${flag} -p ${port}`,
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
    ...getGlobalNodeModulesPaths().map((p) => path.join(p, "clnode", "src", "hooks", "hook.sh")),
    // npx cache / local
    path.join(process.env.HOME ?? "", ".local", "share", "clnode", "hook.sh"),
  ];

  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }

  // Try `which clnode` to find the install path
  try {
    const { execSync } = require("node:child_process");
    const clnodeBin = execSync("which clnode", { encoding: "utf-8" }).trim();
    if (clnodeBin) {
      // clnode bin is at <prefix>/bin/clnode, hook.sh is at <prefix>/lib/node_modules/clnode/src/hooks/hook.sh
      const prefix = path.resolve(path.dirname(clnodeBin), "..");
      const hookPath = path.join(prefix, "lib", "node_modules", "clnode", "src", "hooks", "hook.sh");
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

  const hookCommand = port === 3100 ? hookScript : `CLNODE_PORT=${port} ${hookScript}`;

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
  fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
}

async function registerProject(workspacePath: string, port: number): Promise<void> {
  const projectName = path.basename(workspacePath);
  const projectId = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
  try {
    await fetch(`http://localhost:${port}/hooks/RegisterProject`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
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
