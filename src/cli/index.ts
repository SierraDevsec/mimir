#!/usr/bin/env node
import { Command } from "commander";
import { spawn, execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const program = new Command();

const MIMIR_PORT = parseInt(process.env.MIMIR_PORT ?? "3100", 10);
const MIMIR_URL = `http://localhost:${MIMIR_PORT}`;
const MIMIR_API_TOKEN = process.env.MIMIR_API_TOKEN;
function authHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    ...extra,
    ...(MIMIR_API_TOKEN ? { Authorization: `Bearer ${MIMIR_API_TOKEN}` } : {}),
  };
}
const DATA_DIR = path.resolve(
  import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
  "../../data"
);
const PID_FILE = path.join(DATA_DIR, "mimir.pid");
const LOG_FILE = path.join(DATA_DIR, "mimir.log");

program
  .name("mimir")
  .description("Claude Code hook monitoring daemon")
  .version("0.1.6"); // TODO: read from package.json

// mimir start
program
  .command("start")
  .description("Start the mimir daemon")
  .option("-p, --port <port>", "Port number", String(MIMIR_PORT))
  .action(async (opts) => {
    // 이미 실행 중인지 확인 (PID file)
    if (isRunning()) {
      console.log(`[mimir] Already running (PID: ${readPid()})`);
      return;
    }

    // Port already in use by orphan process? Kill it first.
    try {
      const lsofOutput = execSync(`lsof -ti :${opts.port}`, { encoding: "utf-8" }).trim();
      if (lsofOutput) {
        const pids = lsofOutput.split("\n").map((p: string) => p.trim()).filter(Boolean);
        for (const p of pids) {
          try {
            process.kill(parseInt(p, 10), "SIGTERM");
            console.log(`[mimir] Killed orphan process on port ${opts.port} (PID: ${p})`);
          } catch { /* already dead */ }
        }
        // Wait for port to free up
        await new Promise(r => setTimeout(r, 1000));
      }
    } catch { /* lsof found nothing — port is free */ }

    const serverEntry = path.resolve(
      import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
      "../server/index.js"
    );

    // tsx로 실행 (dev) 또는 node로 실행 (build)
    const isTs = serverEntry.endsWith(".ts");
    const cmd = isTs ? "tsx" : "node";
    const actualEntry = isTs
      ? serverEntry
      : serverEntry;

    const env = { ...process.env, MIMIR_PORT: opts.port };
    fs.mkdirSync(DATA_DIR, { recursive: true });
    const logFd = fs.openSync(LOG_FILE, "a");
    const child = spawn(cmd, [actualEntry], {
      env,
      detached: true,
      stdio: ["ignore", logFd, logFd],
    });
    fs.closeSync(logFd);

    child.unref();

    if (child.pid) {
      const dataDir = path.dirname(PID_FILE);
      fs.mkdirSync(dataDir, { recursive: true });
      fs.writeFileSync(PID_FILE, String(child.pid));
      console.log(`[mimir] Daemon started (PID: ${child.pid}, Port: ${opts.port})`);
    } else {
      console.error("[mimir] Failed to start daemon");
      process.exit(1);
    }
  });

// mimir stop
program
  .command("stop")
  .description("Stop the mimir daemon")
  .action(() => {
    let killed = false;

    // 1) Try PID file first
    const pid = readPid();
    if (pid) {
      try {
        process.kill(pid, "SIGTERM");
        console.log(`[mimir] Daemon stopped (PID: ${pid})`);
        killed = true;
      } catch {
        console.log(`[mimir] PID ${pid} not running`);
      }
      try { fs.unlinkSync(PID_FILE); } catch { /* ignore */ }
    }

    // 2) Fallback: kill whatever is on the port (handles stale/orphan processes)
    if (!killed) {
      try {
        const port = process.env.MIMIR_PORT || "3100";
        const lsofOutput = execSync(`lsof -ti :${port}`, { encoding: "utf-8" }).trim();
        if (lsofOutput) {
          const pids = lsofOutput.split("\n").map((p: string) => p.trim()).filter(Boolean);
          for (const p of pids) {
            try {
              process.kill(parseInt(p, 10), "SIGTERM");
              console.log(`[mimir] Killed orphan process on port ${port} (PID: ${p})`);
              killed = true;
            } catch { /* already dead */ }
          }
        }
      } catch {
        /* lsof found nothing — port is free */
      }
    }

    if (!killed) {
      console.log("[mimir] No running daemon found");
    }
  });

// mimir status
program
  .command("status")
  .description("Show active sessions and agents")
  .action(async () => {
    try {
      const res = await fetch(`${MIMIR_URL}/api/health`);
      const health = await res.json() as { status: string; uptime: number };
      console.log(`[mimir] Server: ${health.status} (uptime: ${Math.round(health.uptime)}s)`);

      const sessionsRes = await fetch(`${MIMIR_URL}/api/sessions?active=true`, { headers: authHeaders() });
      const sessionsData = await sessionsRes.json();
      const sessions = Array.isArray(sessionsData) ? sessionsData as Array<Record<string, unknown>> : [];
      console.log(`[mimir] Active sessions: ${sessions.length}`);
      for (const s of sessions) {
        console.log(`  - ${s.id} (project: ${s.project_id ?? "none"})`);
      }

      const agentsRes = await fetch(`${MIMIR_URL}/api/agents?active=true`, { headers: authHeaders() });
      const agentsData = await agentsRes.json();
      const agents = Array.isArray(agentsData) ? agentsData as Array<Record<string, unknown>> : [];
      console.log(`[mimir] Active agents: ${agents.length}`);
      for (const a of agents) {
        console.log(`  - ${a.id} [${a.agent_name}] (${a.agent_type ?? "unknown"})`);
      }
    } catch {
      console.log("[mimir] Daemon is not running");
      const pid = readPid();
      if (pid) console.log(`  PID file exists (${pid}), but server unreachable`);
    }
  });

// mimir init [path]
program
  .command("init [targetPath]")
  .description("Install lifecycle hooks and templates in the target project")
  .option("-p, --port <port>", "Daemon port (default: 3100)", String(MIMIR_PORT))
  .option("--hooks-only", "Install hooks only, skip all templates")
  .action(async (targetPath: string | undefined, opts: { port?: string; hooksOnly?: boolean }) => {
    const target = targetPath ? path.resolve(targetPath) : process.cwd();
    const projectName = path.basename(target);
    const projectId = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");
    const port = opts.port ?? String(MIMIR_PORT);
    const portUrl = `http://localhost:${port}`;

    const baseDir = import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname);
    // hook.sh lives in src/hooks/ (included in npm package via files field)
    const hookScript = path.resolve(baseDir, "../../src/hooks/hook.sh");
    fs.chmodSync(hookScript, 0o755);

    const claudeDir = path.join(target, ".claude");
    fs.mkdirSync(claudeDir, { recursive: true });

    // Build hook command with port env var if non-default
    const hookCommand = port === "3100"
      ? hookScript
      : `MIMIR_PORT=${port} ${hookScript}`;

    const templatePath = path.resolve(baseDir, "../../src/hooks/hooks-config.json");
    const templateRaw = fs.readFileSync(templatePath, "utf-8");
    const hooksConfig = JSON.parse(templateRaw.replaceAll("HOOK_SCRIPT_PATH", hookCommand));

    const settingsPath = path.join(claudeDir, "settings.local.json");
    let settings: Record<string, unknown> = {};
    if (fs.existsSync(settingsPath)) {
      settings = JSON.parse(fs.readFileSync(settingsPath, "utf-8"));
    }
    settings.hooks = hooksConfig.hooks;

    // Copy statusline.sh from ~/.claude/ if it exists
    const globalStatusline = path.join(process.env.HOME ?? "", ".claude", "statusline.sh");
    const localStatusline = path.join(claudeDir, "statusline.sh");
    if (fs.existsSync(globalStatusline) && !fs.existsSync(localStatusline)) {
      fs.copyFileSync(globalStatusline, localStatusline);
      fs.chmodSync(localStatusline, 0o755);
      settings.statusLine = {
        type: "command",
        command: localStatusline,
        padding: 0,
      };
      console.log(`[mimir] statusline.sh copied to ${localStatusline}`);
    }

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(`[mimir] Hooks installed to ${settingsPath}`);
    console.log(`[mimir] hook.sh path: ${hookScript}`);

    // Setup .mcp.json with mimir-messaging MCP server
    const mcpConfigPath = path.join(target, ".mcp.json");
    const mcpServerPath = path.resolve(baseDir, "../../src/mcp/server.ts");

    let mcpConfig: { mcpServers?: Record<string, unknown> } = {};
    if (fs.existsSync(mcpConfigPath)) {
      try {
        mcpConfig = JSON.parse(fs.readFileSync(mcpConfigPath, "utf-8"));
      } catch {
        // ignore parse errors
      }
    }

    if (!mcpConfig.mcpServers) mcpConfig.mcpServers = {};
    mcpConfig.mcpServers["mimir-messaging"] = {
      command: "npx",
      args: ["tsx", mcpServerPath],
      env: { MIMIR_PROJECT_ID: projectId },
    };

    fs.writeFileSync(mcpConfigPath, JSON.stringify(mcpConfig, null, 2));
    console.log(`[mimir] MCP server configured: ${mcpConfigPath}`);

    // Add MCP tool permissions to settings
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

    // Auto-enable MCP servers from .mcp.json
    settings.enableAllProjectMcpServers = true;

    // Agent Teams required settings
    const env = (settings.env ?? {}) as Record<string, string>;
    env.CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS = "1";
    settings.env = env;
    settings.teammateMode = "tmux";

    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2));
    console.log(`[mimir] MCP permissions added to settings`);

    // Copy skill/agent/rule templates by default (skip with --hooks-only)
    // Source: .claude/ directory with init-manifest.json as selection filter
    if (!opts.hooksOnly) {
      const mimirClaudeDir = path.resolve(baseDir, "../../.claude");
      const manifestPath = path.join(mimirClaudeDir, "init-manifest.json");
      let manifest: { skills?: string[]; agents?: string[]; rules?: string[]; "agent-memory"?: string[] } = {};
      if (fs.existsSync(manifestPath)) {
        manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      }

      // Skills: copy only manifest-listed skills
      const skillsSourceDir = path.join(mimirClaudeDir, "skills");
      const skillsTargetDir = path.join(claudeDir, "skills");
      const skillsList = manifest.skills ?? [];

      if (fs.existsSync(skillsSourceDir) && skillsList.length > 0) {
        fs.mkdirSync(skillsTargetDir, { recursive: true });
        let skillCount = 0;
        for (const dir of skillsList) {
          const skillFile = path.join(skillsSourceDir, dir, "SKILL.md");
          if (fs.existsSync(skillFile)) {
            const destDir = path.join(skillsTargetDir, dir);
            const destFile = path.join(destDir, "SKILL.md");
            if (!fs.existsSync(destFile)) {
              fs.mkdirSync(destDir, { recursive: true });
              fs.copyFileSync(skillFile, destFile);
              // Copy references/ scripts/ assets/ subdirectories if present
              for (const subdir of ["references", "scripts", "assets"]) {
                const srcSub = path.join(skillsSourceDir, dir, subdir);
                if (fs.existsSync(srcSub) && fs.statSync(srcSub).isDirectory()) {
                  const destSub = path.join(destDir, subdir);
                  fs.mkdirSync(destSub, { recursive: true });
                  for (const file of fs.readdirSync(srcSub)) {
                    const srcFile = path.join(srcSub, file);
                    if (fs.statSync(srcFile).isFile()) {
                      fs.copyFileSync(srcFile, path.join(destSub, file));
                    }
                  }
                }
              }
              console.log(`[mimir] Skill installed: ${dir}/`);
              skillCount++;
            }
          }
        }
        console.log(`[mimir] ${skillCount} skills installed to ${skillsTargetDir}`);
      }

      // Agents: copy only manifest-listed agents
      const agentsSourceDir = path.join(mimirClaudeDir, "agents");
      const agentsTargetDir = path.join(claudeDir, "agents");
      const agentsList = manifest.agents ?? [];

      if (fs.existsSync(agentsSourceDir) && agentsList.length > 0) {
        fs.mkdirSync(agentsTargetDir, { recursive: true });
        let agentCount = 0;
        for (const name of agentsList) {
          const file = `${name}.md`;
          const src = path.join(agentsSourceDir, file);
          const dest = path.join(agentsTargetDir, file);
          if (fs.existsSync(src) && !fs.existsSync(dest)) {
            let content = fs.readFileSync(src, "utf-8");
            if (content.includes("HOOK_SCRIPT_PATH")) {
              content = content.replaceAll("HOOK_SCRIPT_PATH", hookCommand);
            }
            fs.writeFileSync(dest, content);
            console.log(`[mimir] Agent installed: ${file}`);
            agentCount++;
          }
        }
        if (agentCount > 0) {
          console.log(`[mimir] ${agentCount} agents installed to ${agentsTargetDir}`);
        }
      }

      // Rules: copy only manifest-listed rules
      const rulesSourceDir = path.join(mimirClaudeDir, "rules");
      const rulesTargetDir = path.join(claudeDir, "rules");
      const rulesList = manifest.rules ?? [];

      if (fs.existsSync(rulesSourceDir) && rulesList.length > 0) {
        fs.mkdirSync(rulesTargetDir, { recursive: true });
        let rulesCount = 0;
        for (const file of rulesList) {
          const src = path.join(rulesSourceDir, file);
          const dest = path.join(rulesTargetDir, file);
          if (fs.existsSync(src) && !fs.existsSync(dest)) {
            fs.copyFileSync(src, dest);
            console.log(`[mimir] Rule installed: ${file}`);
            rulesCount++;
          }
        }
        if (rulesCount > 0) {
          console.log(`[mimir] ${rulesCount} rules installed to ${rulesTargetDir}`);
        }
      }

      // Agent memory: seed MEMORY.md for manifest-listed agents
      const memorySourceDir = path.join(mimirClaudeDir, "agent-memory");
      const memoryTargetDir = path.join(claudeDir, "agent-memory");
      const memoryList = manifest["agent-memory"] ?? [];

      if (fs.existsSync(memorySourceDir) && memoryList.length > 0) {
        // Only copy memory for agents that were actually installed
        const installedAgents = fs.existsSync(agentsTargetDir)
          ? fs.readdirSync(agentsTargetDir).map((f: string) => f.replace(".md", ""))
          : [];
        let memoryCount = 0;
        for (const agent of memoryList) {
          if (!installedAgents.includes(agent)) continue;
          const srcFile = path.join(memorySourceDir, agent, "MEMORY.md");
          const destDir = path.join(memoryTargetDir, agent);
          const destFile = path.join(destDir, "MEMORY.md");
          if (fs.existsSync(srcFile) && !fs.existsSync(destFile)) {
            fs.mkdirSync(destDir, { recursive: true });
            fs.copyFileSync(srcFile, destFile);
            memoryCount++;
          }
        }
        if (memoryCount > 0) {
          console.log(`[mimir] ${memoryCount} agent memory seeds installed to ${memoryTargetDir}`);
        }
      }
    }

    // Auto-start daemon if not running
    let daemonRunning = false;
    try {
      await fetch(`${portUrl}/api/health`);
      daemonRunning = true;
    } catch {
      console.log(`[mimir] Daemon not running on port ${port}, starting...`);
      // Start daemon with specified port
      const serverEntry = path.resolve(baseDir, "../server/index.js");
      const isTs = serverEntry.endsWith(".ts");
      const cmd = isTs ? "tsx" : "node";
      const env = { ...process.env, MIMIR_PORT: port };
      fs.mkdirSync(DATA_DIR, { recursive: true });
      const logFd = fs.openSync(LOG_FILE, "a");
      const child = spawn(cmd, [serverEntry], {
        env,
        detached: true,
        stdio: ["ignore", logFd, logFd],
      });
      fs.closeSync(logFd);
      child.unref();
      if (child.pid) {
        fs.writeFileSync(PID_FILE, String(child.pid));
        console.log(`[mimir] Daemon started (PID: ${child.pid}, Port: ${port})`);
        daemonRunning = true;
        // Wait a bit for daemon to initialize
        await new Promise(r => setTimeout(r, 1000));
      }
    }

    // Register project with retry
    if (daemonRunning) {
      let registered = false;
      for (let attempt = 1; attempt <= 3; attempt++) {
        try {
          const res = await fetch(`${portUrl}/hooks/RegisterProject`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ project_id: projectId, project_name: projectName, project_path: target }),
          });
          if (res.ok) {
            console.log(`[mimir] Project registered: ${projectId} (${target})`);
            registered = true;
            break;
          }
        } catch {
          if (attempt < 3) {
            await new Promise(r => setTimeout(r, 500));
          }
        }
      }
      if (!registered) {
        console.log(`[mimir] Could not register project — will be registered on first hook event`);
      }
    }

    console.log(`\n[mimir] Setup complete!`);
    console.log(`[mimir] Restart your Claude Code session to activate hooks.`);
    if (port !== "3100") {
      console.log(`[mimir] Using custom port: ${port}`);
    }
    console.log(`[mimir] Tip: To create custom agents, use /mimir-agents skill in Claude Code`);
  });

// mimir logs
program
  .command("logs")
  .description("Tail daemon logs")
  .option("-n, --lines <lines>", "Number of lines to show", "50")
  .option("-f, --follow", "Follow log output")
  .action((opts) => {
    if (!fs.existsSync(LOG_FILE)) {
      console.log("[mimir] No log file found. Start the daemon first.");
      return;
    }

    const args = ["-n", opts.lines];
    if (opts.follow) args.push("-f");
    args.push(LOG_FILE);

    const tail = spawn("tail", args, { stdio: "inherit" });
    tail.on("error", () => {
      console.error("[mimir] Failed to run tail command");
    });
  });

// mimir ui
program
  .command("ui")
  .description("Open Web UI in browser")
  .action(() => {
    const url = MIMIR_URL;
    console.log(`[mimir] Opening ${url} ...`);
    try {
      if (process.platform === "darwin") {
        execSync(`open ${url}`);
      } else if (process.platform === "linux") {
        execSync(`xdg-open ${url}`);
      } else {
        execSync(`start ${url}`);
      }
    } catch {
      console.log(`[mimir] Could not open browser. Visit: ${url}`);
    }
  });

// mimir swarm
program
  .command("swarm")
  .description("Launch multi-agent swarm in tmux panes")
  .requiredOption("-a, --agents <names>", "Comma-separated agent names with optional model (e.g. '기획팀:opus,개발팀:sonnet')")
  .option("-t, --task <task>", "Initial task to send to all agents")
  .option("-m, --model <model>", "Default model for agents without :model suffix", "claude-sonnet-4-5")
  .option("--leader-model <model>", "Model for orchestrator", "claude-opus-4-6")
  .option("--project <id>", "Project ID for messaging")
  .option("--layout <layout>", "tmux layout: even-horizontal, even-vertical, tiled", "even-horizontal")
  .action(async (opts: { agents: string; task?: string; model: string; leaderModel: string; project?: string; layout: string }) => {
    // Parse "name:model" format
    const MODEL_MAP: Record<string, string> = {
      opus: "claude-opus-4-6",
      sonnet: "claude-sonnet-4-5",
      haiku: "claude-haiku-4-5-20251001",
    };
    const agents: Array<{ name: string; model: string }> = [];
    for (const entry of opts.agents.split(",").map(s => s.trim()).filter(Boolean)) {
      const [name, modelKey] = entry.split(":");
      const model = modelKey ? (MODEL_MAP[modelKey] ?? modelKey) : opts.model;
      agents.push({ name, model });
    }
    if (agents.length === 0) {
      console.error("[mimir] No agents specified");
      process.exit(1);
    }
    const leaderModel = MODEL_MAP[opts.leaderModel] ?? opts.leaderModel;

    // Check tmux is available
    try {
      execSync("tmux -V", { stdio: "ignore" });
    } catch {
      console.error("[mimir] tmux is not installed. Install tmux first.");
      process.exit(1);
    }

    // Detect project ID from current directory
    const projectName = path.basename(process.cwd());
    const projectId = opts.project ?? projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    // Ensure daemon is running
    try {
      await fetch(`${MIMIR_URL}/api/health`);
    } catch {
      console.log("[mimir] Daemon not running, starting...");
      execSync(`node ${path.resolve(import.meta.dirname ?? ".", "../cli/index.js")} start`, { stdio: "inherit" });
      await new Promise(r => setTimeout(r, 2000));
    }

    const sessionName = `mimir-swarm-${Date.now()}`;

    // Pane 0: orchestrator (always opus)
    execSync(
      `tmux new-session -d -s '${sessionName}' -e MIMIR_AGENT_NAME='orchestrator' -e MIMIR_PROJECT_ID='${projectId}'`,
      { stdio: "ignore" }
    );
    execSync(
      `tmux send-keys -t '${sessionName}' 'unset CLAUDECODE && claude --model ${leaderModel}' Enter`,
      { stdio: "ignore" }
    );
    console.log(`[mimir] tmux session: ${sessionName}`);
    console.log(`[mimir] Orchestrator (${leaderModel}) → pane 0`);

    // Create agent panes
    for (let i = 0; i < agents.length; i++) {
      const { name, model } = agents[i];
      execSync(
        `tmux split-window -t '${sessionName}' -e MIMIR_AGENT_NAME='${name}' -e MIMIR_PROJECT_ID='${projectId}'`,
        { stdio: "ignore" }
      );
      execSync(
        `tmux send-keys -t '${sessionName}' 'unset CLAUDECODE && claude --model ${model}' Enter`,
        { stdio: "ignore" }
      );
      console.log(`[mimir] Agent "${name}" (${model}) → pane ${i + 1}`);
    }

    // Apply layout
    execSync(
      `tmux select-layout -t '${sessionName}' '${opts.layout}'`,
      { stdio: "ignore" }
    );

    // Wait for Claude sessions to start
    console.log("[mimir] Waiting for Claude sessions to initialize...");
    await new Promise(r => setTimeout(r, 5000));

    // Build team roster for context
    const agentNames = agents.map(a => a.name);
    const teamList = agents.map(a => `${a.name}(${a.model.includes("opus") ? "opus" : a.model.includes("haiku") ? "haiku" : "sonnet"})`).join(", ");

    // Send initial task via messages if provided
    if (opts.task) {
      console.log(`[mimir] Sending initial task to all agents...`);

      // Task to each agent with clear instructions
      for (const { name: agent } of agents) {
        const otherAgents = agentNames.filter(a => a !== agent);
        try {
          await fetch(`${MIMIR_URL}/api/messages`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({
              project_id: projectId,
              from_name: "orchestrator",
              to_name: agent,
              content: [
                `[작업 지시] ${opts.task}`,
                ``,
                `팀 구성: ${teamList}`,
                `협업 대상: ${otherAgents.join(", ")}`,
                ``,
                `규칙:`,
                `- 작업이 완료되면 orchestrator에게 최종 결과만 간단히 보고하세요`,
                `- 상대 팀과 메시지는 필요한 경우에만 보내세요`,
                `- 보고 후에는 새 지시가 올 때까지 대기하세요`,
              ].join("\n"),
              priority: "high",
            }),
          });
        } catch {
          console.error(`[mimir] Failed to send task to ${agent}`);
        }
      }

      // Instruct leader to wait for reports
      try {
        await fetch(`${MIMIR_URL}/api/messages`, {
          method: "POST",
          headers: authHeaders({ "Content-Type": "application/json" }),
          body: JSON.stringify({
            project_id: projectId,
            from_name: "system",
            to_name: "orchestrator",
            content: [
              `[orchestration 시작] ${agentNames.length}개 팀에게 작업을 배정했습니다.`,
              ``,
              `팀 구성: ${teamList}`,
              `작업 내용: ${opts.task}`,
              ``,
              `각 팀이 완료 보고를 보내면 read_messages로 확인하세요.`,
              `모든 팀의 보고가 오면 종합 결과를 정리해주세요.`,
            ].join("\n"),
            priority: "high",
          }),
        });
      } catch {
        console.error("[mimir] Failed to send leader instructions");
      }

      console.log("[mimir] Initial tasks sent.");
    }

    console.log(`\n[mimir] Swarm launched! 1 leader + ${agents.length} agents in tmux session "${sessionName}"`);
    console.log(`[mimir] Kill: tmux kill-session -t '${sessionName}'`);

    // Auto-attach to tmux session
    const attach = spawn("tmux", ["attach", "-t", sessionName], {
      stdio: "inherit",
    });
    attach.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });

// mimir tmux (low-level tmux session/pane management via API)
const tmux = program.command("tmux").description("Tmux session/pane management");

tmux
  .command("session-create <project-id>")
  .description("Create a new tmux session for a project")
  .action(async (projectId: string) => {
    try {
      const res = await fetch(`${MIMIR_URL}/api/tmux/sessions`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({ project_id: projectId }),
      });
      const result = await res.json() as { ok?: boolean; session_name?: string; error?: string };
      if (result.ok) {
        console.log(`[mimir] Tmux session created: ${result.session_name}`);
      } else {
        console.error(`[mimir] Error: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`[mimir] Failed to connect to daemon: ${error}`);
      process.exit(1);
    }
  });

tmux
  .command("pane-create <session-name> <agent-name>")
  .description("Create a new pane in a tmux session")
  .option("--start-claude", "Start Claude session in the pane")
  .action(async (sessionName: string, agentName: string, opts: { startClaude?: boolean }) => {
    try {
      const res = await fetch(`${MIMIR_URL}/api/tmux/panes`, {
        method: "POST",
        headers: authHeaders({ "Content-Type": "application/json" }),
        body: JSON.stringify({
          session_name: sessionName,
          agent_name: agentName,
          start_claude: opts.startClaude ?? false,
        }),
      });
      const result = await res.json() as { ok?: boolean; pane_id?: string; error?: string };
      if (result.ok) {
        console.log(`[mimir] Pane created: ${result.pane_id} (agent: ${agentName})`);
      } else {
        console.error(`[mimir] Error: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`[mimir] Failed to connect to daemon: ${error}`);
      process.exit(1);
    }
  });

tmux
  .command("pane-kill <pane-id>")
  .description("Kill a tmux pane")
  .action(async (paneId: string) => {
    try {
      const res = await fetch(`${MIMIR_URL}/api/tmux/panes/${encodeURIComponent(paneId)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (result.ok) {
        console.log(`[mimir] Pane killed: ${paneId}`);
      } else {
        console.error(`[mimir] Error: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`[mimir] Failed to connect to daemon: ${error}`);
      process.exit(1);
    }
  });

tmux
  .command("session-kill <session-name>")
  .description("Kill a tmux session and all its panes")
  .action(async (sessionName: string) => {
    try {
      const res = await fetch(`${MIMIR_URL}/api/tmux/sessions/${encodeURIComponent(sessionName)}`, {
        method: "DELETE",
        headers: authHeaders(),
      });
      const result = await res.json() as { ok?: boolean; error?: string };
      if (result.ok) {
        console.log(`[mimir] Session killed: ${sessionName}`);
      } else {
        console.error(`[mimir] Error: ${result.error}`);
        process.exit(1);
      }
    } catch (error) {
      console.error(`[mimir] Failed to connect to daemon: ${error}`);
      process.exit(1);
    }
  });

tmux
  .command("list")
  .description("List all tmux sessions and panes")
  .option("-s, --sessions", "List sessions only")
  .option("-p, --panes", "List panes only")
  .option("--project <id>", "Filter by project ID")
  .option("--session <name>", "Filter panes by session name")
  .action(async (opts: { sessions?: boolean; panes?: boolean; project?: string; session?: string }) => {
    try {
      if (!opts.panes) {
        const query = opts.project ? `?project_id=${encodeURIComponent(opts.project)}` : "";
        const res = await fetch(`${MIMIR_URL}/api/tmux/sessions${query}`, { headers: authHeaders() });
        const sessions = await res.json() as Array<{ session_name: string; project_id: string; status: string; created_at: string }>;
        console.log(`\n[Sessions] (${sessions.length})`);
        for (const s of sessions) {
          console.log(`  ${s.session_name} (project: ${s.project_id}, status: ${s.status})`);
        }
      }

      if (!opts.sessions) {
        const query = opts.session ? `?session_name=${encodeURIComponent(opts.session)}` : "";
        const res = await fetch(`${MIMIR_URL}/api/tmux/panes${query}`, { headers: authHeaders() });
        const panes = await res.json() as Array<{ pane_id: string; session_name: string; agent_name: string | null; status: string }>;
        console.log(`\n[Panes] (${panes.length})`);
        for (const p of panes) {
          console.log(`  ${p.pane_id} (session: ${p.session_name}, agent: ${p.agent_name ?? "none"}, status: ${p.status})`);
        }
      }
    } catch (error) {
      console.error(`[mimir] Failed to connect to daemon: ${error}`);
      process.exit(1);
    }
  });

// mimir mcp
program
  .command("mcp")
  .description("Run MCP server (stdio mode for Claude Code)")
  .action(() => {
    const mcpEntry = path.resolve(
      import.meta.dirname ?? path.dirname(new URL(import.meta.url).pathname),
      "../mcp/server.js"
    );

    const child = spawn("node", [mcpEntry], {
      stdio: "inherit",
      env: process.env,
    });

    child.on("error", (err) => {
      console.error("[mimir] Failed to start MCP server:", err.message);
      process.exit(1);
    });

    child.on("exit", (code) => {
      process.exit(code ?? 0);
    });
  });

// mimir curate
program
  .command("curate")
  .description("Run mimir-curator agent for knowledge curation")
  .option("--background", "Run in tmux background pane")
  .action(async (opts: { background?: boolean }) => {
    // Ensure daemon is running
    if (!isRunning()) {
      console.error("[mimir] Daemon not running. Start with: mimir start");
      process.exit(1);
    }

    // Detect project
    const projectName = path.basename(process.cwd());
    const projectId = projectName.toLowerCase().replace(/[^a-z0-9-]/g, "-");

    // Fetch curation stats
    let statsText = "";
    try {
      const res = await fetch(`${MIMIR_URL}/api/curation/stats?project_id=${encodeURIComponent(projectId)}`, { headers: authHeaders() });
      if (res.ok) {
        const stats = await res.json() as {
          last_curated: string | null;
          sessions_since: number;
          marks_since: number;
          promotion_candidates: number;
          agent_memories: Array<{ name: string; size_bytes: number; last_modified: string }>;
        };
        const memoryList = stats.agent_memories
          .map((m) => `  - ${m.name}: ${(m.size_bytes / 1024).toFixed(1)}KB (updated: ${m.last_modified.slice(0, 10)})`)
          .join("\n");
        statsText = [
          `Curation context:`,
          `- Last curation: ${stats.last_curated ?? "never"}`,
          `- Sessions since last curation: ${stats.sessions_since}`,
          `- New marks since last curation: ${stats.marks_since}`,
          `- Promotion candidates: ${stats.promotion_candidates}`,
          `- Agent memories:`,
          memoryList || "  (none)",
          ``,
          `Please run a full curation cycle.`,
        ].join("\n");
      }
    } catch {
      // Proceed without stats
    }

    if (!statsText) {
      statsText = "Please run a full curation cycle.";
    }

    console.log("[mimir] Starting mimir-curator agent...");
    console.log(`[mimir] Project: ${projectId}`);

    if (opts.background) {
      // Run in tmux background
      try {
        execSync("tmux -V", { stdio: "ignore" });
      } catch {
        console.error("[mimir] tmux is not installed. Install tmux first.");
        process.exit(1);
      }

      const sessionName = `mimir-curate-${Date.now()}`;
      const escapedPrompt = statsText.replace(/'/g, "'\\''");
      execSync(
        `tmux new-session -d -s '${sessionName}' "claude --agent=mimir-curator --prompt '${escapedPrompt}'"`,
        { stdio: "ignore" }
      );
      console.log(`[mimir] Curator running in tmux session: ${sessionName}`);
      console.log(`[mimir] Attach: tmux attach -t '${sessionName}'`);
      console.log(`[mimir] Kill: tmux kill-session -t '${sessionName}'`);
    } else {
      // Interactive mode
      const child = spawn("claude", ["--agent=mimir-curator", "--prompt", statsText], {
        stdio: "inherit",
        env: process.env,
      });

      child.on("error", (err) => {
        console.error("[mimir] Failed to start curator:", err.message);
        process.exit(1);
      });

      child.on("exit", async (code) => {
        // Record curation completion
        try {
          await fetch(`${MIMIR_URL}/api/curation/complete`, {
            method: "POST",
            headers: authHeaders({ "Content-Type": "application/json" }),
            body: JSON.stringify({ project_id: projectId }),
          });
          console.log("[mimir] Curation recorded in activity log.");
        } catch {
          // Best-effort
        }
        process.exit(code ?? 0);
      });
    }
  });

function readPid(): number | null {
  try {
    const pid = parseInt(fs.readFileSync(PID_FILE, "utf-8").trim(), 10);
    return isNaN(pid) ? null : pid;
  } catch {
    return null;
  }
}

function isRunning(): boolean {
  const pid = readPid();
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

program.parse();
