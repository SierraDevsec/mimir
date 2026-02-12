interface FilterButtonProps {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}

export function FilterButton({ active, onClick, children }: FilterButtonProps) {
  return (
    <button
      onClick={onClick}
      data-active={active}
      className="px-3 py-1 rounded-lg text-xs transition-colors bg-zinc-800 text-zinc-400 hover:bg-zinc-700 data-[active=true]:bg-emerald-900/60 data-[active=true]:text-emerald-300"
    >
      {children}
    </button>
  );
}
