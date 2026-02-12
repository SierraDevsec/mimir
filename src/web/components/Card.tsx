export function Card({ children, className = "", hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) {
  return (
    <div className={`bg-zinc-900 border border-zinc-800 rounded-xl p-4 ${hover ? "hover:border-zinc-700 transition-colors" : ""} ${className}`}>
      {children}
    </div>
  );
}
