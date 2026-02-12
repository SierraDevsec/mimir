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

export async function isMimirInstalled(): Promise<boolean> {
  try {
    await execAsync("mimir --version");
    return true;
  } catch {
    try {
      await execAsync("npx mimir --version");
      return true;
    } catch {
      return false;
    }
  }
}

export async function installMimir(): Promise<boolean> {
  const action = await vscode.window.showWarningMessage(
    "Mimir is not installed. Install it now?",
    "Install (npm -g)",
    "Dismiss"
  );

  if (action !== "Install (npm -g)") return false;

  return vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: "Installing Mimir..." },
    async () => {
      try {
        await execAsync("npm install -g mimir", 60000);
        vscode.window.showInformationMessage("Mimir installed successfully.");
        return true;
      } catch (e) {
        vscode.window.showErrorMessage(
          `Failed to install Mimir: ${e}. Try manually: npm i -g mimir`
        );
        return false;
      }
    }
  );
}

export async function startDaemon(): Promise<boolean> {
  const commands = ["npx mimir start", "mimir start"];
  for (const cmd of commands) {
    try {
      await execAsync(cmd);
      await new Promise((r) => setTimeout(r, 2000));
      return true;
    } catch {
      continue;
    }
  }
  vscode.window.showErrorMessage("Failed to start Mimir daemon.");
  return false;
}

export async function stopDaemon(): Promise<void> {
  const commands = ["npx mimir stop", "mimir stop"];
  for (const cmd of commands) {
    try {
      await execAsync(cmd);
      return;
    } catch {
      continue;
    }
  }
  vscode.window.showErrorMessage("Failed to stop Mimir daemon.");
}

/**
 * Full setup: check installed → install → start daemon → return alive status
 */
export async function ensureDaemon(baseUrl: string, autoStart: boolean): Promise<boolean> {
  // 1. Already running?
  if (await checkDaemon(baseUrl)) return true;

  // 2. mimir installed?
  const installed = await isMimirInstalled();
  if (!installed) {
    const ok = await installMimir();
    if (!ok) return false;
  }

  // 3. Start daemon
  if (autoStart) {
    return startDaemon();
  }

  const action = await vscode.window.showWarningMessage(
    "Mimir daemon is not running.",
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
