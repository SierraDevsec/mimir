import * as vscode from "vscode";
import { exec } from "node:child_process";

export async function checkDaemon(baseUrl: string): Promise<boolean> {
  try {
    const res = await fetch(`${baseUrl}/api/health`);
    return res.ok;
  } catch {
    return false;
  }
}

export async function isClnodeInstalled(): Promise<boolean> {
  try {
    await execAsync("clnode --version");
    return true;
  } catch {
    try {
      await execAsync("npx clnode --version");
      return true;
    } catch {
      return false;
    }
  }
}

export async function installClnode(): Promise<boolean> {
  const action = await vscode.window.showWarningMessage(
    "clnode is not installed. Install it now?",
    "Install (npm -g)",
    "Dismiss"
  );

  if (action !== "Install (npm -g)") return false;

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Installing clnode..." },
    async () => {
      try {
        await execAsync("npm install -g clnode", 60000);
        vscode.window.showInformationMessage("clnode installed successfully.");
        return true;
      } catch (e) {
        vscode.window.showErrorMessage(
          `Failed to install clnode: ${e}. Try manually: npm i -g clnode`
        );
        return false;
      }
    }
  );
}

export async function startDaemon(): Promise<boolean> {
  const commands = ["npx clnode start", "clnode start"];
  for (const cmd of commands) {
    try {
      await execAsync(cmd);
      await new Promise((r) => setTimeout(r, 2000));
      return true;
    } catch {
      continue;
    }
  }
  vscode.window.showErrorMessage("Failed to start clnode daemon.");
  return false;
}

export async function stopDaemon(): Promise<void> {
  const commands = ["npx clnode stop", "clnode stop"];
  for (const cmd of commands) {
    try {
      await execAsync(cmd);
      return;
    } catch {
      continue;
    }
  }
  vscode.window.showErrorMessage("Failed to stop clnode daemon.");
}

/**
 * Full setup: check installed → install → start daemon → return alive status
 */
export async function ensureDaemon(baseUrl: string, autoStart: boolean): Promise<boolean> {
  // 1. Already running?
  if (await checkDaemon(baseUrl)) return true;

  // 2. clnode installed?
  const installed = await isClnodeInstalled();
  if (!installed) {
    const ok = await installClnode();
    if (!ok) return false;
  }

  // 3. Start daemon
  if (autoStart) {
    return startDaemon();
  }

  const action = await vscode.window.showWarningMessage(
    "clnode daemon is not running.",
    "Start Daemon",
    "Dismiss"
  );
  if (action === "Start Daemon") {
    return startDaemon();
  }
  return false;
}

function execAsync(cmd: string, timeout = 15000): Promise<string> {
  return new Promise((resolve, reject) => {
    exec(cmd, { timeout }, (err, stdout) => {
      if (err) reject(err);
      else resolve(stdout);
    });
  });
}
