import { useState, useCallback } from "react";
import { api, type Task, type TaskComment, formatDateTime } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";

const COLUMNS = [
  { key: "idea", label: "Idea", color: "purple" },
  { key: "planned", label: "Planned", color: "blue" },
  { key: "pending", label: "Pending", color: "yellow" },
  { key: "in_progress", label: "In Progress", color: "orange" },
  { key: "needs_review", label: "Needs Review", color: "pink" },
  { key: "completed", label: "Completed", color: "green" },
] as const;

const COL_COLORS: Record<string, { bg: string; text: string; border: string; badge: string }> = {
  idea:         { bg: "bg-purple-900/20", text: "text-purple-300", border: "border-purple-800/50", badge: "bg-purple-900 text-purple-300" },
  planned:      { bg: "bg-blue-900/20", text: "text-blue-300", border: "border-blue-800/50", badge: "bg-blue-900 text-blue-300" },
  pending:      { bg: "bg-amber-900/20", text: "text-amber-300", border: "border-amber-800/50", badge: "bg-amber-900 text-amber-300" },
  in_progress:  { bg: "bg-orange-900/20", text: "text-orange-300", border: "border-orange-800/50", badge: "bg-orange-900 text-orange-300" },
  needs_review: { bg: "bg-pink-900/20", text: "text-pink-300", border: "border-pink-800/50", badge: "bg-pink-900 text-pink-300" },
  completed:    { bg: "bg-emerald-900/20", text: "text-emerald-300", border: "border-emerald-800/50", badge: "bg-emerald-900 text-emerald-300" },
};

const TAG_COLORS: Record<string, { bg: string; text: string; dot: string }> = {
  gray:   { bg: "bg-zinc-800", text: "text-zinc-300", dot: "bg-zinc-400" },
  red:    { bg: "bg-red-900/60", text: "text-red-300", dot: "bg-red-400" },
  orange: { bg: "bg-orange-900/60", text: "text-orange-300", dot: "bg-orange-400" },
  yellow: { bg: "bg-amber-900/60", text: "text-amber-300", dot: "bg-amber-400" },
  green:  { bg: "bg-emerald-900/60", text: "text-emerald-300", dot: "bg-emerald-400" },
  blue:   { bg: "bg-blue-900/60", text: "text-blue-300", dot: "bg-blue-400" },
  purple: { bg: "bg-purple-900/60", text: "text-purple-300", dot: "bg-purple-400" },
  pink:   { bg: "bg-pink-900/60", text: "text-pink-300", dot: "bg-pink-400" },
};
const TAG_COLOR_KEYS = Object.keys(TAG_COLORS);

function parseTag(raw: string): { name: string; color: string } {
  const idx = raw.lastIndexOf(":");
  if (idx > 0) {
    const color = raw.slice(idx + 1);
    if (TAG_COLORS[color]) return { name: raw.slice(0, idx), color };
  }
  return { name: raw, color: "gray" };
}

function formatTag(name: string, color: string): string {
  return color === "gray" ? name : `${name}:${color}`;
}

function TagPill({ raw }: { raw: string }) {
  const { name, color } = parseTag(raw);
  const c = TAG_COLORS[color] ?? TAG_COLORS.gray;
  return (
    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] ${c.bg} ${c.text}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {name}
    </span>
  );
}

function getColIdx(status: string): number {
  return COLUMNS.findIndex((c) => c.key === status);
}

export default function Tasks() {
  const [showCreate, setShowCreate] = useState(false);
  const [expandedTask, setExpandedTask] = useState<number | null>(null);
  const [comments, setComments] = useState<TaskComment[]>([]);
  const [newComment, setNewComment] = useState("");
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const { selected: projectId } = useProject();

  const fetcher = useCallback(() => {
    return api.tasks(projectId ?? undefined);
  }, [projectId]);

  const { data: tasks = [], reload } = useQuery<Task[]>({
    fetcher,
    deps: [projectId],
    reloadOnEvents: (event) =>
      ["SubagentStart", "SubagentStop", "task_created", "task_updated", "task_deleted"].includes(event.event),
  });

  const loadComments = useCallback((taskId: number) => {
    api.taskComments(taskId).then(setComments).catch(() => {});
  }, []);

  const toggleExpand = (taskId: number) => {
    if (expandedTask === taskId) {
      setExpandedTask(null);
      setComments([]);
    } else {
      setExpandedTask(taskId);
      loadComments(taskId);
    }
  };

  const moveTask = async (task: Task, direction: -1 | 1) => {
    const idx = getColIdx(task.status);
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= COLUMNS.length) return;
    try { await api.updateTask(task.id, { status: COLUMNS[newIdx].key }); reload(); } catch {}
  };

  const moveTaskToStatus = async (taskId: number, newStatus: string) => {
    try { await api.updateTask(taskId, { status: newStatus }); reload(); } catch {}
  };

  const removeTask = async (id: number) => {
    try {
      await api.deleteTask(id);
      if (expandedTask === id) { setExpandedTask(null); setComments([]); }
      reload();
    } catch {}
  };

  const addComment = async (taskId: number) => {
    if (!newComment.trim()) return;
    try { await api.addTaskComment(taskId, { content: newComment, comment_type: "note" }); setNewComment(""); loadComments(taskId); } catch {}
  };

  const byStatus = (status: string) => tasks
    .filter((t) => t.status === status)
    .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());

  const handleDrop = (e: React.DragEvent, targetStatus: string) => {
    e.preventDefault();
    setDragOverCol(null);
    const taskId = parseInt(e.dataTransfer.getData("taskId"), 10);
    if (!isNaN(taskId)) {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.status !== targetStatus) {
        moveTaskToStatus(taskId, targetStatus);
      }
    }
    setDraggedTaskId(null);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-zinc-50">Tasks</h2>
        <button
          onClick={() => setShowCreate(true)}
          className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
        >
          + Add Task
        </button>
      </div>

      {showCreate && <CreateTaskModal onClose={() => setShowCreate(false)} onCreated={reload} />}

      <div className="flex gap-3 overflow-x-auto pb-4" style={{ minHeight: "calc(100vh - 12rem)" }}>
        {COLUMNS.map((col) => {
          const colTasks = byStatus(col.key);
          const colors = COL_COLORS[col.key];
          const isDropTarget = dragOverCol === col.key;
          return (
            <div
              key={col.key}
              className="flex-1 min-w-48"
              onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key); }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={(e) => handleDrop(e, col.key)}
            >
              <div className="flex items-center gap-2 mb-3 px-2">
                <h3 className={`text-xs font-semibold uppercase tracking-wider ${colors.text}`}>
                  {col.label}
                </h3>
                <span className={`${colors.badge} px-1.5 py-0.5 rounded-full text-[10px] font-medium`}>
                  {colTasks.length}
                </span>
              </div>
              <div className={`space-y-2 p-2 rounded-xl ${colors.bg} border ${isDropTarget ? "border-2 border-dashed border-emerald-400/50" : colors.border} min-h-24 transition-colors`}>
                {colTasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    expanded={expandedTask === task.id}
                    comments={expandedTask === task.id ? comments : []}
                    newComment={expandedTask === task.id ? newComment : ""}
                    onToggle={() => toggleExpand(task.id)}
                    onMoveLeft={() => moveTask(task, -1)}
                    onMoveRight={() => moveTask(task, 1)}
                    onDelete={() => removeTask(task.id)}
                    onCommentChange={setNewComment}
                    onAddComment={() => addComment(task.id)}
                    canMoveLeft={getColIdx(task.status) > 0}
                    canMoveRight={getColIdx(task.status) < COLUMNS.length - 1}
                    isDragging={draggedTaskId === task.id}
                    onDragStart={() => setDraggedTaskId(task.id)}
                    onDragEnd={() => { setDraggedTaskId(null); setDragOverCol(null); }}
                  />
                ))}
                {colTasks.length === 0 && (
                  <p className="text-zinc-600 text-xs text-center py-6">No tasks</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function TaskCard({
  task, expanded, comments, newComment,
  onToggle, onMoveLeft, onMoveRight, onDelete, onCommentChange, onAddComment,
  canMoveLeft, canMoveRight, isDragging, onDragStart, onDragEnd,
}: {
  task: Task;
  expanded: boolean;
  comments: TaskComment[];
  newComment: string;
  onToggle: () => void;
  onMoveLeft: () => void;
  onMoveRight: () => void;
  onDelete: () => void;
  onCommentChange: (v: string) => void;
  onAddComment: () => void;
  canMoveLeft: boolean;
  canMoveRight: boolean;
  isDragging: boolean;
  onDragStart: () => void;
  onDragEnd: () => void;
}) {
  return (
    <div
      className={`bg-zinc-900 border border-zinc-800 rounded-xl overflow-hidden transition-opacity ${isDragging ? "opacity-50" : ""}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("taskId", String(task.id));
        onDragStart();
      }}
      onDragEnd={onDragEnd}
    >
      <div className="p-3 cursor-pointer" onClick={onToggle}>
        <div className="text-sm font-medium text-zinc-100 leading-tight">{task.title}</div>
        {task.description && (
          <div className="text-xs text-zinc-400 mt-1 line-clamp-2">{task.description}</div>
        )}
        {task.tags && task.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {task.tags.map((tag) => <TagPill key={tag} raw={tag} />)}
          </div>
        )}
        <div className="flex items-center gap-2 mt-2 text-xs text-zinc-500">
          {task.assigned_to && (
            <span className="px-1.5 py-0.5 rounded-full bg-blue-900/50 text-blue-300 text-[10px]">
              {task.assigned_to}
            </span>
          )}
          <span className="ml-auto text-[10px]">{formatDateTime(task.updated_at)}</span>
        </div>
      </div>

      <div className="flex items-center gap-1 px-2 pb-2">
        <button
          onClick={(e) => { e.stopPropagation(); onMoveLeft(); }}
          disabled={!canMoveLeft}
          className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          ←
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onMoveRight(); }}
          disabled={!canMoveRight}
          className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 text-zinc-400 hover:bg-zinc-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          →
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-800 text-red-400 hover:bg-red-900/50 ml-auto transition-colors"
        >
          ×
        </button>
      </div>

      {expanded && (
        <div className="border-t border-zinc-800 p-3 space-y-2">
          <div className="text-[10px] font-medium text-zinc-500 uppercase tracking-wider">Comments</div>
          {comments.length === 0 && <p className="text-xs text-zinc-600">No comments yet</p>}
          {comments.map((c) => (
            <div key={c.id} className="text-xs space-y-0.5">
              <div className="flex items-center gap-2 text-zinc-500">
                <span className="px-1 py-0.5 rounded bg-zinc-800 text-[10px]">{c.comment_type}</span>
                {c.author && <span className="text-zinc-400">{c.author}</span>}
                <span className="ml-auto text-[10px]">{formatDateTime(c.created_at)}</span>
              </div>
              <div className="text-zinc-300">{c.content}</div>
            </div>
          ))}
          <div className="flex gap-1 mt-2">
            <input
              type="text"
              value={newComment}
              onChange={(e) => onCommentChange(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onAddComment()}
              placeholder="Add a comment..."
              className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white placeholder-zinc-600 focus:outline-none focus:border-zinc-600"
              onClick={(e) => e.stopPropagation()}
            />
            <button
              onClick={(e) => { e.stopPropagation(); onAddComment(); }}
              className="px-2 py-1 text-xs bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 transition-colors"
            >
              Send
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function TagInput({ tags, onChange }: { tags: string[]; onChange: (tags: string[]) => void }) {
  const [input, setInput] = useState("");
  const [selectedColor, setSelectedColor] = useState("gray");

  const addTag = () => {
    const name = input.trim();
    if (!name) return;
    const formatted = formatTag(name, selectedColor);
    if (!tags.includes(formatted)) onChange([...tags, formatted]);
    setInput("");
  };

  const removeTag = (idx: number) => onChange(tags.filter((_, i) => i !== idx));

  return (
    <div className="space-y-2">
      <div className="text-xs text-zinc-500">Tags</div>
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {tags.map((tag, i) => (
            <span key={i} className="flex items-center gap-1">
              <TagPill raw={tag} />
              <button onClick={() => removeTag(i)} className="text-zinc-600 hover:text-red-400 text-[10px]">x</button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-1.5 items-center">
        <div className="flex gap-1">
          {TAG_COLOR_KEYS.map((c) => (
            <button
              key={c}
              onClick={() => setSelectedColor(c)}
              className={`w-4 h-4 rounded-full ${TAG_COLORS[c].dot} transition-all ${selectedColor === c ? "ring-2 ring-white ring-offset-1 ring-offset-zinc-900 scale-110" : "opacity-60 hover:opacity-100"}`}
            />
          ))}
        </div>
        <input
          type="text"
          placeholder="Tag name"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
        />
        <button
          onClick={addTag}
          disabled={!input.trim()}
          className="px-2 py-1 text-xs bg-zinc-800 text-zinc-300 rounded-lg hover:bg-zinc-700 disabled:opacity-30 transition-colors"
        >
          +
        </button>
      </div>
    </div>
  );
}

function CreateTaskModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tags, setTags] = useState<string[]>([]);

  const handleCreate = async () => {
    if (!title.trim()) return;
    try {
      await api.createTask({
        title,
        description: description || undefined,
        status: "idea",
        tags: tags.length > 0 ? tags : undefined,
      });
      onCreated();
      onClose();
    } catch {}
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-zinc-900 border border-zinc-700 rounded-xl p-5 w-full max-w-md space-y-4" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold text-zinc-100">New Task</h3>
        <input
          type="text"
          placeholder="Title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && handleCreate()}
          autoFocus
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500"
        />
        <textarea
          placeholder="Description (optional)"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-500 resize-none"
        />
        <TagInput tags={tags} onChange={setTags} />
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-sm text-zinc-400 hover:text-white transition-colors">
            Cancel
          </button>
          <button
            onClick={handleCreate}
            disabled={!title.trim()}
            className="px-4 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition-colors"
          >
            Create
          </button>
        </div>
      </div>
    </div>
  );
}
