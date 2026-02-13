import fs from "node:fs";
import path from "node:path";
import { getDb } from "../db.js";
import { listAgentDefinitions } from "./agent-definition.js";

export interface SkillInfo {
  name: string;
  description: string;
  hasReferences: boolean;
  preloadedBy: string[];
  body: string;
}

async function getProjectPath(projectId: string): Promise<string | null> {
  const db = await getDb();
  const rows = await db.all(`SELECT path FROM projects WHERE id = ?`, projectId) as Array<{ path: string }>;
  return rows.length > 0 ? rows[0].path : null;
}

function parseSkillFrontmatter(content: string): { description: string; body: string } {
  const match = content.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { description: "", body: content };

  const raw = match[1];
  const body = match[2];
  let description = "";

  for (const line of raw.split("\n")) {
    const kv = line.match(/^description\s*:\s*(.*)$/);
    if (kv) {
      description = kv[1].trim().replace(/^["']|["']$/g, "");
    }
  }

  return { description, body: body.trim() };
}

export async function listSkills(projectId: string): Promise<SkillInfo[]> {
  const projectPath = await getProjectPath(projectId);
  if (!projectPath) return [];

  const skillsDir = path.join(projectPath, ".claude", "skills");
  if (!fs.existsSync(skillsDir)) return [];

  // Get agent definitions to determine preloadedBy
  const agents = await listAgentDefinitions(projectId);
  const skillToAgents = new Map<string, string[]>();
  for (const agent of agents) {
    for (const skill of agent.skills) {
      const list = skillToAgents.get(skill) ?? [];
      list.push(agent.name);
      skillToAgents.set(skill, list);
    }
  }

  const dirs = fs.readdirSync(skillsDir).filter((f) => {
    const full = path.join(skillsDir, f);
    return fs.statSync(full).isDirectory();
  });

  const skills: SkillInfo[] = [];
  for (const dir of dirs) {
    const skillFile = path.join(skillsDir, dir, "SKILL.md");
    if (!fs.existsSync(skillFile)) continue;

    const content = fs.readFileSync(skillFile, "utf-8");
    const { description, body } = parseSkillFrontmatter(content);
    const refsDir = path.join(skillsDir, dir, "references");
    const hasReferences = fs.existsSync(refsDir) && fs.statSync(refsDir).isDirectory();

    skills.push({
      name: dir,
      description,
      hasReferences,
      preloadedBy: skillToAgents.get(dir) ?? [],
      body,
    });
  }

  return skills.sort((a, b) => a.name.localeCompare(b.name));
}
