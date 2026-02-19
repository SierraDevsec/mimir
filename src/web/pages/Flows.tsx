import { useState, useCallback, useEffect, useRef } from "react";
import { api, type Flow, formatDateTime } from "../lib/api";
import { useProject } from "../lib/ProjectContext";
import { useQuery } from "../lib/useQuery";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:     { bg: "bg-zinc-800",        text: "text-zinc-300" },
  ready:     { bg: "bg-emerald-900/60",  text: "text-emerald-300" },
  running:   { bg: "bg-amber-900/60",    text: "text-amber-300" },
  completed: { bg: "bg-blue-900/60",     text: "text-blue-300" },
  failed:    { bg: "bg-red-900/60",      text: "text-red-300" },
};

const STARTER_MERMAID = `graph TD
    A[Research] --> B[Implement]
    B --> C[Review]
    C --> D[Deploy]`;

export default function Flows() {
  const [editing, setEditing] = useState<Flow | null | "new">(null);
  const { selected: projectId } = useProject();

  if (!projectId) {
    return (
      <div className="flex items-center justify-center h-64 text-zinc-500">
        Select a project to view flows
      </div>
    );
  }

  if (editing !== null) {
    return (
      <FlowEditor
        flow={editing === "new" ? null : editing}
        projectId={projectId}
        onBack={() => setEditing(null)}
      />
    );
  }

  return (
    <FlowList
      projectId={projectId}
      onSelect={(flow) => setEditing(flow)}
      onNew={() => setEditing("new")}
    />
  );
}

// ─── Flow List ───────────────────────────────────────────────

function FlowList({
  projectId,
  onSelect,
  onNew,
}: {
  projectId: string;
  onSelect: (flow: Flow) => void;
  onNew: () => void;
}) {
  const [search, setSearch] = useState("");

  const fetcher = useCallback(async () => {
    return api.flows(projectId);
  }, [projectId]);

  const { data: flows, loading } = useQuery<Flow[]>({
    fetcher,
    deps: [projectId],
    reloadOnEvents: (event) =>
      ["flow_created", "flow_updated", "flow_deleted"].includes(event.event),
  });

  const filtered = (flows ?? []).filter(
    (f) =>
      !search ||
      f.name.toLowerCase().includes(search.toLowerCase()) ||
      f.description?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-zinc-50">Flows</h2>
        <button
          onClick={onNew}
          className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors"
        >
          + New Flow
        </button>
      </div>

      <input
        type="text"
        placeholder="Search flows..."
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
      />

      {loading && !flows ? (
        <div className="text-zinc-500 text-sm py-8 text-center">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-zinc-500">
          <div className="text-4xl mb-2">{ search ? "No matches" : "No flows yet" }</div>
          <p className="text-sm">
            {search ? "Try a different search term" : "Create your first flow to get started"}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {filtered.map((flow) => {
            const colors = STATUS_COLORS[flow.status] ?? STATUS_COLORS.draft;
            return (
              <div
                key={flow.id}
                onClick={() => onSelect(flow)}
                className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 cursor-pointer hover:border-zinc-600 transition-colors"
              >
                <div className="flex items-start justify-between mb-2">
                  <h3 className="text-sm font-medium text-zinc-100 leading-tight">
                    {flow.name}
                  </h3>
                  <span
                    className={`px-2 py-0.5 rounded-full text-[10px] font-medium ${colors.bg} ${colors.text}`}
                  >
                    {flow.status}
                  </span>
                </div>
                {flow.description && (
                  <p className="text-xs text-zinc-400 line-clamp-2 mb-3">
                    {flow.description}
                  </p>
                )}
                <div className="text-[10px] text-zinc-500">
                  {formatDateTime(flow.updated_at)}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Mermaid helpers ─────────────────────────────────────────

function extractNodeIds(mermaidCode: string): string[] {
  const ids = new Set<string>();
  const keywords = new Set(["graph", "flowchart", "subgraph", "end", "style", "classdef", "click", "direction", "td", "lr", "bt", "rl", "tb"]);
  // Match node definitions: A[Label], B(Label), C{Label}, D((Label)), E>Label], F[/Label/]
  const pattern = /(?:^|\s|;)([A-Za-z_]\w*)[\[\(\{<>]/gm;
  let match;
  while ((match = pattern.exec(mermaidCode)) !== null) {
    const id = match[1];
    if (!keywords.has(id.toLowerCase())) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}

interface NodeMeta {
  agentType?: string;
  prompt?: string;
  model?: string;
}

// ─── Flow Editor ─────────────────────────────────────────────

function FlowEditor({
  flow,
  projectId,
  onBack,
}: {
  flow: Flow | null;
  projectId: string;
  onBack: () => void;
}) {
  const [name, setName] = useState(flow?.name ?? "");
  const [description, setDescription] = useState(flow?.description ?? "");
  const [mermaidCode, setMermaidCode] = useState(
    flow?.mermaid_code ?? STARTER_MERMAID
  );
  const [metadata, setMetadata] = useState<Record<string, NodeMeta>>(
    flow?.metadata ? JSON.parse(flow.metadata) : {}
  );
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const renderCountRef = useRef(0);

  // Mermaid live preview
  useEffect(() => {
    if (!previewRef.current) return;

    const render = async () => {
      const id = `mermaid-preview-${++renderCountRef.current}`;
      try {
        const mermaid = (await import("mermaid")).default;
        mermaid.initialize({ startOnLoad: false, theme: "dark", securityLevel: "loose" });
        const { svg } = await mermaid.render(id, mermaidCode);
        if (previewRef.current) {
          previewRef.current.innerHTML = svg;
          setRenderError(null);

          // Add click handlers to nodes
          previewRef.current.querySelectorAll(".node").forEach((node) => {
            const el = node as HTMLElement;
            const rawId = el.id ?? "";
            // Mermaid formats node IDs as "flowchart-<id>-<index>"
            const nodeId = rawId.replace(/^flowchart-/, "").replace(/-\d+$/, "");
            if (nodeId) {
              el.style.cursor = "pointer";
              el.addEventListener("click", () => setSelectedNode(nodeId));
            }
          });
        }
      } catch (err) {
        setRenderError(err instanceof Error ? err.message : String(err));
        if (previewRef.current) {
          previewRef.current.innerHTML = "";
        }
      }
    };

    const timer = setTimeout(render, 300);
    return () => clearTimeout(timer);
  }, [mermaidCode]);

  const nodeIds = extractNodeIds(mermaidCode);

  const updateNodeMeta = (nodeId: string, field: keyof NodeMeta, value: string) => {
    setMetadata((prev) => ({
      ...prev,
      [nodeId]: { ...prev[nodeId], [field]: value || undefined },
    }));
  };

  const handleSave = async () => {
    if (!name.trim() || !mermaidCode.trim()) return;
    setSaving(true);
    try {
      if (flow) {
        await api.updateFlow(flow.id, {
          name,
          description: description || undefined,
          mermaid_code: mermaidCode,
          metadata,
        });
      } else {
        await api.createFlow({
          project_id: projectId,
          name,
          mermaid_code: mermaidCode,
          description: description || undefined,
          metadata,
        });
      }
      onBack();
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!flow) return;
    await api.deleteFlow(flow.id);
    onBack();
  };

  const currentMeta = selectedNode ? metadata[selectedNode] ?? {} : {};

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={onBack}
          className="px-2 py-1 text-sm text-zinc-400 hover:text-white transition-colors"
        >
          &larr; Back
        </button>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Flow name..."
          className="flex-1 bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
        />
        <button
          onClick={handleSave}
          disabled={saving || !name.trim()}
          className="px-3 py-1.5 text-sm bg-emerald-600 hover:bg-emerald-500 disabled:opacity-40 text-white rounded-lg transition-colors"
        >
          {saving ? "Saving..." : "Save"}
        </button>
        {flow && (
          <button
            onClick={handleDelete}
            className="px-3 py-1.5 text-sm bg-zinc-800 text-red-400 hover:bg-red-900/50 rounded-lg transition-colors"
          >
            Delete
          </button>
        )}
      </div>

      {/* Description */}
      <input
        type="text"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description (optional)"
        className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-zinc-600"
      />

      {/* Editor: Code + Preview */}
      <div className="grid grid-cols-2 gap-4" style={{ minHeight: "400px" }}>
        {/* Left: Code editor */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500 font-medium">Mermaid Code</label>
          <textarea
            value={mermaidCode}
            onChange={(e) => setMermaidCode(e.target.value)}
            spellCheck={false}
            className="flex-1 min-h-80 bg-zinc-900 border border-zinc-700 rounded-lg px-3 py-2 text-sm text-green-300 font-mono resize-none focus:outline-none focus:border-zinc-600"
          />
        </div>

        {/* Right: Mermaid preview */}
        <div className="flex flex-col gap-1">
          <label className="text-xs text-zinc-500 font-medium">
            Preview
            {selectedNode && (
              <span className="ml-2 text-emerald-400">Selected: {selectedNode}</span>
            )}
          </label>
          <div className="flex-1 min-h-80 bg-zinc-900 border border-zinc-700 rounded-lg overflow-auto p-4">
            {renderError ? (
              <div className="text-red-400 text-xs font-mono whitespace-pre-wrap">
                {renderError}
              </div>
            ) : (
              <div
                ref={previewRef}
                className="flex items-center justify-center [&_svg]:max-w-full"
              />
            )}
          </div>
        </div>
      </div>

      {/* Node Metadata Editor */}
      <div className="bg-zinc-900 border border-zinc-800 rounded-xl p-4 space-y-3">
        <div className="flex items-center gap-3">
          <label className="text-xs text-zinc-500 font-medium">Node Metadata</label>
          <select
            value={selectedNode ?? ""}
            onChange={(e) => setSelectedNode(e.target.value || null)}
            className="bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1 text-sm text-white focus:outline-none focus:border-zinc-600"
          >
            <option value="">Select a node...</option>
            {nodeIds.map((id) => (
              <option key={id} value={id}>
                {id}
              </option>
            ))}
          </select>
          <span className="text-[10px] text-zinc-600 ml-auto">
            Click a node in the preview or select from dropdown
          </span>
        </div>

        {selectedNode && (
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Agent Type</label>
              <select
                value={currentMeta.agentType ?? ""}
                onChange={(e) => updateNodeMeta(selectedNode, "agentType", e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-600"
              >
                <option value="">None</option>
                <option value="backend-dev">backend-dev</option>
                <option value="frontend-dev">frontend-dev</option>
                <option value="researcher">researcher</option>
                <option value="devops">devops</option>
                <option value="designer">designer</option>
                <option value="doc-writer">doc-writer</option>
                <option value="copywriter">copywriter</option>
                <option value="mimir-curator">mimir-curator</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Model</label>
              <select
                value={currentMeta.model ?? ""}
                onChange={(e) => updateNodeMeta(selectedNode, "model", e.target.value)}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white focus:outline-none focus:border-zinc-600"
              >
                <option value="">Default</option>
                <option value="sonnet">sonnet</option>
                <option value="opus">opus</option>
                <option value="haiku">haiku</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-[10px] text-zinc-500 uppercase tracking-wider">Prompt</label>
              <textarea
                value={currentMeta.prompt ?? ""}
                onChange={(e) => updateNodeMeta(selectedNode, "prompt", e.target.value)}
                placeholder="Agent instructions..."
                rows={2}
                className="w-full bg-zinc-800 border border-zinc-700 rounded-lg px-2 py-1.5 text-sm text-white placeholder-zinc-600 resize-none focus:outline-none focus:border-zinc-600"
              />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
