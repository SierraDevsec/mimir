---
name: mimir-agents
description: Discover installed agents/skills/rules and create new agents
version: 2.0.0
---

# Agent Discovery & Generator

## Quick Create Mode (JSON args)

If args contain JSON like `{"name":"my-agent","model":"sonnet","description":"...","persona":"..."}`:
1. **Do NOT ask any questions or request confirmation. Execute ALL file writes immediately.**
2. Skip Phase 1, 2, 3-1 — go directly to **Step 3-2** with the provided values
3. Use `persona` as agent body text (fall back to `description` if empty)
4. Skip duplicate check (Step 3-2) — overwrite if exists
5. Run Phase 4 (Update team.md) after creation

---

## Interactive Mode

Execute all phases below in order. Use the specified tools at each step.

---

## Phase 1: Discovery (interactive only)

Scan the project's `.claude/` directory to show what's installed.

### Step 1-1: Scan files

Use **Glob** to find:
- `.claude/agents/*.md` — agent definitions
- `.claude/skills/*/SKILL.md` — installed skills
- `.claude/rules/*.md` — active rules

### Step 1-2: Extract agent details

For each file found in `.claude/agents/*.md`, use **Read** to extract YAML frontmatter fields:
- `name`
- `description`
- `model` (default: sonnet)
- `skills` (list)

### Step 1-3: Display results

Output a summary in this format:

```
## Installed Agents (N)

| Name | Model | Description | Skills |
|------|-------|-------------|--------|
| backend-dev | sonnet | Backend development | compress-output |
| reviewer | opus | Code review | compress-review |

## Installed Skills (N)
- compress-output
- compress-review
- ...

## Installed Rules (N)
- team.md
- typescript.md
- ...
```

---

## Phase 2: Ask User

Use **AskUserQuestion** to ask:

```
question: "What would you like to do?"
header: "Action"
options:
  - label: "Create new agent"
    description: "Generate a new agent definition file with proper frontmatter and structure"
  - label: "Done"
    description: "Exit — discovery complete"
```

If the user selects "Done", stop here.

---

## Phase 3: Generate Agent

### Step 3-1: Gather info

Use **AskUserQuestion** with these questions (all in one call):

**Question 1:**
```
question: "What should the agent be named? (use kebab-case, e.g., api-tester)"
header: "Name"
options:
  - label: "custom name"
    description: "Enter a custom agent name"
```

**Question 2:**
```
question: "What is this agent's role?"
header: "Role"
options:
  - label: "Implementer"
    description: "Writes code — backend, frontend, CLI, etc."
  - label: "Reviewer"
    description: "Reviews code for quality, security, patterns"
  - label: "Architect"
    description: "Designs systems, makes technical decisions"
  - label: "Specialist"
    description: "Domain-specific tasks (testing, docs, DevOps, etc.)"
```

**Question 3:**
```
question: "Which model should this agent use?"
header: "Model"
options:
  - label: "sonnet (Recommended)"
    description: "Best for implementation tasks — fast and capable"
  - label: "opus"
    description: "Best for review, architecture, complex reasoning"
  - label: "haiku"
    description: "Best for simple, repetitive, mechanical tasks"
```

### Step 3-2: Check for duplicates

Use **Glob** to check if `.claude/agents/{name}.md` already exists.
If it does, warn the user and ask for confirmation before overwriting.

### Step 3-3: Determine skills

Apply these rules:
- If role is **Reviewer** → `skills: [compress-review, self-mark, self-search]`
- All other roles → `skills: [compress-output, self-mark, self-search]`

### Step 3-4: Determine tools

Apply these rules:
- If role is **Reviewer** or **Architect** → `tools: Read, Grep, Glob, Bash`
- If role is **Implementer** or **Specialist** → `tools: Read, Edit, Write, Bash, Grep, Glob`

### Step 3-5: Write agent file

Use **Write** to create `.claude/agents/{name}.md` with this template:

```markdown
---
name: {name}
description: {role description from user}
tools: {tools from Step 3-4}
model: {model}
memory: project
skills:
  - {skills from Step 3-3}
---

# {Name} Agent

{Brief role description based on user input}

## Responsibilities
- {Generate 3-4 responsibilities based on the role}

## Before Returning

MANDATORY: Before returning your final response, compress your output:
- List changed files with 1-line summary each
- Key decisions made (1-2 sentences)
- Issues encountered (if any)
- Total output MUST be under 10 lines
```

---

## Phase 4: Update team.md

### Step 4-1: Check if team.md exists

Use **Glob** to check for `.claude/rules/team.md`.
If it does NOT exist, skip this phase entirely.

### Step 4-2: Scan all agents

Use **Glob** for `.claude/agents/*.md`, then **Read** each file to extract `name`, `model`, and `description` from frontmatter.

### Step 4-3: Rebuild Team Structure

Generate a new Team Structure block from the scanned agents:

```
Leader (Main Session / Opus)
├── {agent-1} ({Model}) — {description}
├── {agent-2} ({Model}) — {description}
...
└── {last-agent} ({Model}) — {description}
```

Rules:
- Capitalize the model name display: `sonnet` → `Sonnet`, `opus` → `Opus`, `haiku` → `Haiku`
- Use `├──` for all agents except the last
- Use `└──` for the last agent
- Sort alphabetically by agent name

### Step 4-4: Edit team.md

Use **Read** to get the current content of `.claude/rules/team.md`.
Use **Edit** to replace the existing Team Structure code block (the content between the ``` markers under `## Team Structure`) with the newly generated block.

---

## Model Recommendation Guide

| Role | Recommended Model | Reason |
|------|-------------------|--------|
| Reviewer | opus | Needs deep reasoning for code quality analysis |
| Architect | opus | Complex system design decisions |
| Curator | opus | Cross-domain knowledge synthesis |
| Implementer (backend) | sonnet | Fast, capable code generation |
| Implementer (frontend) | sonnet | Fast, capable code generation |
| Implementer (CLI) | sonnet | Fast, capable code generation |
| Test writer | sonnet | Straightforward test generation |
| Simple/mechanical tasks | haiku | Cost-efficient for repetitive work |

## Reference

Claude Code agent documentation: https://docs.anthropic.com/en/docs/claude-code/agents
