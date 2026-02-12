import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db.js";

export interface AgentDefinition {
  name: string;
  description: string;
  model: string;
  tools: string[];
  skills: string[];
  memory: string;
  permissionMode: string;
  body: string;
}

/**
 * Get the project path from DB by project ID.
 */
async function getProjectPath(projectId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.all(`SELECT path FROM projects WHERE id = ?`, projectId) as Array<{ path: string }>;
  return rows.length > 0 ? rows[0].path : null;
}

/**
 * Parse frontmatter from a .md file content.
 * Returns { frontmatter, body }.
 */
function parseFrontmatter(content: string): { attrs: Record<string, string | string[]>; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { attrs: {}, body: content };

  const rawFrontmatter = match[1];
  const body = match[2];
  const attrs: Record<string, string | string[]> = {};

  let currentKey: string | null = null;
  let listValues: string[] = [];

  for (const line of rawFrontmatter.split("\n")) {
    // List item under current key
    if (currentKey && /^\s+-\s+/.test(line)) {
      listValues.push(line.replace(/^\s+-\s+/, "").trim());
      continue;
    }

    // Save previous list if any
    if (currentKey && listValues.length > 0) {
      attrs[currentKey] = listValues;
      currentKey = null;
      listValues = [];
    }

    // Key-value pair
    const kvMatch = line.match(/^(\w[\w-]*)\s*:\s*(.*)$/);
    if (kvMatch) {
      const key = kvMatch[1];
      const value = kvMatch[2].trim();
      if (value === "") {
        // Start of a list
        currentKey = key;
        listValues = [];
      } else {
        attrs[key] = value.replace(/^["']|["']$/g, "");
      }
    }
  }

  // Flush last list
  if (currentKey && listValues.length > 0) {
    attrs[currentKey] = listValues;
  }

  return { attrs, body };
}

/**
 * Serialize an AgentDefinition to frontmatter + body markdown.
 */
function serializeAgent(def: AgentDefinition): string {
  const lines = ["---"];
  lines.push(`name: ${def.name}`);
  lines.push(`description: ${JSON.stringify(def.description)}`);

  if (def.tools.length > 0) {
    lines.push(`tools:`);
    for (const tool of def.tools) {
      lines.push(`  - ${tool}`);
    }
  }

  if (def.model && def.model !== "sonnet") {
    lines.push(`model: ${def.model}`);
  }

  if (def.memory && def.memory !== "none") {
    lines.push(`memory: ${def.memory}`);
  }

  if (def.skills.length > 0) {
    lines.push(`skills:`);
    for (const skill of def.skills) {
      lines.push(`  - ${skill}`);
    }
  }

  if (def.permissionMode && def.permissionMode !== "default") {
    lines.push(`permissionMode: ${def.permissionMode}`);
  }

  lines.push("---");
  lines.push("");

  if (def.body.trim()) {
    lines.push(def.body.trim());
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Parse a single agent .md file into an AgentDefinition.
 */
function parseAgentFile(filePath: string): AgentDefinition {
  const content = fs.readFileSync(filePath, "utf-8");
  const { attrs, body } = parseFrontmatter(content);
  const name = path.basename(filePath, ".md");

  const tools = Array.isArray(attrs.tools)
    ? attrs.tools
    : typeof attrs.tools === "string"
      ? attrs.tools.split(",").map(s => s.trim())
      : [];

  const skills = Array.isArray(attrs.skills)
    ? attrs.skills
    : typeof attrs.skills === "string"
      ? attrs.skills.split(",").map(s => s.trim())
      : [];

  return {
    name,
    description: (attrs.description as string) ?? "",
    model: (attrs.model as string) ?? "sonnet",
    tools,
    skills,
    memory: (attrs.memory as string) ?? "project",
    permissionMode: (attrs.permissionMode as string) ?? "default",
    body: body.trim(),
  };
}

/**
 * List all agent definitions from .claude/agents/*.md in the project.
 */
export async function listAgentDefinitions(projectId: string): Promise<AgentDefinition[]> {
  const projectPath = await getProjectPath(projectId);
  if (!projectPath) return [];

  const agentsDir = path.join(projectPath, ".claude", "agents");
  if (!fs.existsSync(agentsDir)) return [];

  const files = fs.readdirSync(agentsDir).filter(f => f.endsWith(".md"));
  return files.map(f => parseAgentFile(path.join(agentsDir, f)));
}

/**
 * Get a single agent definition by name.
 */
export async function getAgentDefinition(projectId: string, name: string): Promise<AgentDefinition | null> {
  const projectPath = await getProjectPath(projectId);
  if (!projectPath) return null;

  const filePath = path.join(projectPath, ".claude", "agents", `${name}.md`);
  if (!fs.existsSync(filePath)) return null;

  return parseAgentFile(filePath);
}

/**
 * Create a new agent definition file.
 */
export async function createAgentDefinition(projectId: string, def: AgentDefinition): Promise<void> {
  const projectPath = await getProjectPath(projectId);
  if (!projectPath) throw new Error("Project not found");

  const agentsDir = path.join(projectPath, ".claude", "agents");
  fs.mkdirSync(agentsDir, { recursive: true });

  const filePath = path.join(agentsDir, `${def.name}.md`);
  if (fs.existsSync(filePath)) {
    throw new Error(`Agent "${def.name}" already exists`);
  }

  fs.writeFileSync(filePath, serializeAgent(def));

  // Create agent-memory directory
  const memDir = path.join(projectPath, ".claude", "agent-memory", def.name);
  const memFile = path.join(memDir, "MEMORY.md");
  if (!fs.existsSync(memFile)) {
    fs.mkdirSync(memDir, { recursive: true });
    fs.writeFileSync(memFile, `# ${def.name} Memory\n\n<!-- Agent learnings will be recorded here -->\n`);
  }
}

/**
 * Update an existing agent definition.
 */
export async function updateAgentDefinition(projectId: string, name: string, partial: Partial<AgentDefinition>): Promise<void> {
  const projectPath = await getProjectPath(projectId);
  if (!projectPath) throw new Error("Project not found");

  const filePath = path.join(projectPath, ".claude", "agents", `${name}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent "${name}" not found`);
  }

  const existing = parseAgentFile(filePath);
  const updated: AgentDefinition = {
    ...existing,
    ...partial,
    name, // name is immutable
  };

  fs.writeFileSync(filePath, serializeAgent(updated));
}

/**
 * Delete an agent definition file.
 * Agent memory directory is preserved.
 */
export async function deleteAgentDefinition(projectId: string, name: string): Promise<void> {
  const projectPath = await getProjectPath(projectId);
  if (!projectPath) throw new Error("Project not found");

  const filePath = path.join(projectPath, ".claude", "agents", `${name}.md`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Agent "${name}" not found`);
  }

  fs.unlinkSync(filePath);
}
