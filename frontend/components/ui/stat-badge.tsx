import type { LucideIcon } from "lucide-react";

export function StatBadge({
  icon: Icon,
  label,
  value,
  color,
  mono = false,
}: {
  icon: LucideIcon;
  label: string;
  value: string | number;
  color: string;
  // Opt-in, not inferred from typeof value — some callers pass a full
  // sentence built around a number (e.g. "3 open recommendations"), and
  // that shouldn't render entirely in a monospace/tabular-nums font.
  mono?: boolean;
}) {
  return (
    <span className="flex items-center gap-1 text-sm" aria-label={label}>
      <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
      <span className={mono ? "font-mono tabular-nums" : undefined}>{value}</span>
    </span>
  );
}
