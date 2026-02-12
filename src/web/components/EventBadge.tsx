import { Badge, type Variant } from "./Badge";

export const EVENT_VARIANTS: Record<string, Variant> = {
  SessionStart: "success",
  SessionEnd: "danger",
  SubagentStart: "info",
  SubagentStop: "purple",
  PostToolUse: "warning",
  UserPromptSubmit: "cyan",
  Stop: "orange",
};

export function EventBadge({ type }: { type: string }) {
  return <Badge variant={EVENT_VARIANTS[type] ?? "neutral"}>{type}</Badge>;
}
