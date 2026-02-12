// Query modules for intelligence.ts
// Each query is independently testable and reusable

export { getSiblingAgents } from "./siblings.js";
export { getSameTypeAgents } from "./sameType.js";
export { getCrossSessionContext } from "./crossSession.js";
export { getTaggedContext } from "./taggedContext.js";
export { getRecentContext } from "./recentContext.js";
export { getAssignedTasks } from "./assignedTasks.js";
export { getActiveAgents } from "./activeAgents.js";
export { getOpenTasks } from "./openTasks.js";
export { getDecisions } from "./decisions.js";
export { getCompletedAgents } from "./completedAgents.js";
export { getIncompleteTasks } from "./incompleteTasks.js";
export { getPendingMessages, getPendingMessageCount, getAllPendingMessageCount } from "./pendingMessages.js";
export { getSiblingMarks, getProjectMarks, getFileBasedMarks } from "./relevantMarks.js";
export { getPromotionCandidates } from "./promotionCandidates.js";

// Re-export types for convenience
export type {
  ContextRow,
  AgentRow,
  TaskRow,
  TaskCommentRow,
} from "./types.js";

export type { CrossSessionContext } from "./crossSession.js";
export type { TaskWithPlan } from "./assignedTasks.js";
export type { OpenTasksResult } from "./openTasks.js";
export type { PendingMessage } from "./pendingMessages.js";
export type { MarkSummary } from "./relevantMarks.js";
export type { PromotionCandidate } from "./promotionCandidates.js";
