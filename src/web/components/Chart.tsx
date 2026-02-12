interface BarData {
  label: string;
  value: number;
  color: string;
}

export function BarChart({ data, title }: { data: BarData[]; title?: string }) {
  const max = Math.max(...data.map(d => d.value), 1);

  return (
    <div className="space-y-3">
      {title && <h4 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">{title}</h4>}
      <div className="space-y-2">
        {data.map((d) => (
          <div key={d.label} className="flex items-center gap-3">
            <span className="text-xs text-zinc-400 w-24 truncate shrink-0">{d.label}</span>
            <div className="flex-1 bg-zinc-800 rounded-full h-2 overflow-hidden">
              <div
                className={`h-full rounded-full ${d.color} transition-all duration-500`}
                style={{ width: `${(d.value / max) * 100}%` }}
              />
            </div>
            <span className="text-xs text-zinc-500 shrink-0 text-right tabular-nums">{d.value.toLocaleString()}</span>
          </div>
        ))}
        {data.length === 0 && <p className="text-xs text-zinc-600">No data</p>}
      </div>
    </div>
  );
}
