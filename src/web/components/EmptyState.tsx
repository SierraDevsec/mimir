interface EmptyStateProps {
  title: string;
  description?: string;
}

export function EmptyState({ title, description }: EmptyStateProps) {
  return (
    <div className="text-zinc-600 text-sm">
      <p>{title}</p>
      {description && <p className="text-xs text-zinc-700 mt-1">{description}</p>}
    </div>
  );
}
