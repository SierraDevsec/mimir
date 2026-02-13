// Query modules for intelligence.ts
// Each query is independently testable and reusable

export { getAssignedTasks } from "./assignedTasks.js";
export { getActiveAgents } from "./activeAgents.js";
export { getOpenTasks } from "./openTasks.js";
export { getDecisions } from "./decisions.js";
export { getCompletedAgents } from "./completedAgents.js";
export { getIncompleteTasks } from "./incompleteTasks.js";
export { getPendingMessages, getPendingMessageCount, getAllPendingMessageCount } from "./pendingMessages.js";
export { getSiblingMarks, getProjectMarks, getFileBasedMarks, getRelevantMarksRAG } from "./relevantMarks.js";
export { getPromotionCandidates } from "./promotionCandidates.js";

// Re-export types for convenience
export type {
  ContextRow,
  AgentRow,
  TaskRow,
  TaskCommentRow,
} from "./types.js";

export type { TaskWithPlan } from "./assignedTasks.js";
export type { OpenTasksResult } from "./openTasks.js";
export type { PendingMessage } from "./pendingMessages.js";
export type { MarkSummary } from "./relevantMarks.js";
export type { PromotionCandidate } from "./promotionCandidates.js";
