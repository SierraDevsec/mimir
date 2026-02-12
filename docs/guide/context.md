---
title: Smart Context
layout: default
parent: Guide
nav_order: 3
---

# Smart Context Injection

When an agent starts, clnode doesn't just dump recent context — it selects **relevant** context based on the agent's role and relationships.

## Context Sources

| Type | Description | When Used |
|------|-------------|-----------|
| **Sibling Summaries** | Results from agents with the same parent | Agent B sees Agent A's results if they share a parent |
| **Same-Type History** | What previous agents of the same role accomplished | A new `reviewer` agent sees what the last reviewer found |
| **Cross-Session** | Summaries from previous sessions on the same project | Knowledge persists across Claude Code sessions |
| **Tagged Context** | Entries explicitly tagged for specific agents or roles | Target context to specific agents with tags |

## How It Works

The `SubagentStart` hook calls `buildSmartContext()` which:

1. Finds sibling agents (same parent, same session) and their summaries
2. Finds previous agents of the same type across sessions
3. Queries context entries by entry type (decision, blocker, handoff, agent_summary)
4. Finds context tagged with the agent's name, type, or "all"
5. Finds tasks assigned to the agent

The assembled context is returned as `additionalContext` in the hook response, which Claude Code automatically injects into the agent's prompt.

## Context Entry Types

| Type | Purpose | Persists Cross-Session |
|------|---------|----------------------|
| `decision` | Architecture/technical decisions | Yes |
| `blocker` | Issues blocking progress | Yes |
| `handoff` | Work for another agent to pick up | Yes |
| `agent_summary` | Agent's work summary | Yes |
| `note` | General notes | No |

## Prompt Auto-Attach

Every user prompt (`UserPromptSubmit` hook) automatically receives:
- Active agents and their status
- Open tasks (prioritized: pending > in_progress > needs_review)
- Recent decisions and blockers
- Completed agent summaries
