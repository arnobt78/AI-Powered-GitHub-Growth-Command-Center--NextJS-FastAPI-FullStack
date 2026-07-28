import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  iconColor = "text-muted-foreground",
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: ReactNode;
  /** Feature accent — defaults muted so error states stay neutral. */
  iconColor?: string;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-16 text-center">
      <Icon className={`h-10 w-10 ${iconColor}`} aria-hidden="true" />
      <div>
        <p className="font-medium text-gray-700 dark:text-white">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      {action}
    </div>
  );
}
