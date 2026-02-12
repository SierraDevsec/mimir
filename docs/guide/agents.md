---
title: Agent Management
layout: default
parent: Guide
nav_order: 2
---

# Agent Management

Mimir installs two default agents and provides the `/mimir-agents` skill for discovery and custom agent creation.

## Default Agents

| Agent | Model | Role |
|-------|-------|------|
| **mimir-reviewer** | opus | Code review — quality, security, pattern consistency |
| **mimir-curator** | opus | Knowledge curation — audits memories, cross-pollinates learnings |

## /mimir-agents Skill

Run `/mimir-agents` in Claude Code to:

### Phase 1: Discovery

Scans your `.claude/` directory and shows a summary table of:
- Installed agents (name, model, description, skills)
- Installed skills
- Installed rules

### Phase 2: Create New Agent

Interactive wizard that asks for:
1. **Name** (kebab-case, e.g., `api-tester`)
2. **Role** (Implementer / Reviewer / Architect / Specialist)
3. **Model** (sonnet / opus / haiku)

Then generates `.claude/agents/{name}.md` with:
- Proper YAML frontmatter
- Appropriate tools based on role
- `compress-output` skill (or `compress-review` for reviewers)
- "Before Returning" compression section

### Phase 3: Update team.md

If `.claude/rules/team.md` exists, automatically rebuilds the Team Structure section based on all installed agents.

## Model Recommendations

| Role | Model | Reason |
|------|-------|--------|
| Reviewer / Architect / Curator | **opus** | Deep reasoning needed |
| Implementer (backend/frontend/CLI) | **sonnet** | Fast, capable code generation |
| Simple / mechanical tasks | **haiku** | Cost-efficient |

## Agent File Structure

Agents are markdown files in `.claude/agents/` with YAML frontmatter:

```yaml
---
name: my-agent
description: What this agent does
tools: Read, Edit, Write, Bash, Grep, Glob
model: sonnet
memory: project
skills:
  - compress-output
---

# My Agent

Role description and responsibilities...
```

Key frontmatter fields:
- `tools` — Which Claude Code tools the agent can use
- `model` — Which Claude model to use (opus/sonnet/haiku)
- `memory: project` — Enables persistent memory in `.claude/agent-memory/`
- `skills` — Skills preloaded into the agent's context
