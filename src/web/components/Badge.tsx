const VARIANTS = {
  success: { bg: "bg-emerald-900/60", text: "text-emerald-300", dot: "bg-emerald-400" },
  warning: { bg: "bg-amber-900/60", text: "text-amber-300", dot: "bg-amber-400" },
  danger: { bg: "bg-red-900/60", text: "text-red-300", dot: "bg-red-400" },
  info: { bg: "bg-blue-900/60", text: "text-blue-300", dot: "bg-blue-400" },
  neutral: { bg: "bg-zinc-800", text: "text-zinc-400", dot: "bg-zinc-500" },
  purple: { bg: "bg-purple-900/60", text: "text-purple-300", dot: "bg-purple-400" },
  cyan: { bg: "bg-cyan-900/60", text: "text-cyan-300", dot: "bg-cyan-400" },
  orange: { bg: "bg-orange-900/60", text: "text-orange-300", dot: "bg-orange-400" },
};

export type Variant = keyof typeof VARIANTS;

export function Badge({ children, variant = "neutral", dot = false, className = "" }: { children: React.ReactNode; variant?: Variant; dot?: boolean; className?: string }) {
  const v = VARIANTS[variant];
  return (
    <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium ${v.bg} ${v.text} ${className}`}>
      {dot && <span className={`w-1.5 h-1.5 rounded-full ${v.dot}`} />}
      {children}
    </span>
  );
}

export function statusVariant(status: string): Variant {
  switch (status) {
    case "active": return "success";
    case "completed": return "info";
    case "in_progress": return "warning";
    case "pending": return "orange";
    case "idea": return "purple";
    case "planned": return "info";
    default: return "neutral";
  }
}
