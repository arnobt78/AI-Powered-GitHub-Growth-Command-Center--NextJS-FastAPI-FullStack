/**
 * Shared query triad for list pages: pending skeleton | error empty | children.
 * Only gates on isPending / (isError && !data) — background refetch never blanks UI.
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { AlertTriangle } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";

export function QueryState({
  isPending,
  isError,
  hasData,
  errorIcon = AlertTriangle,
  errorTitle = "Couldn't load data",
  errorDescription = "Please try refreshing the page.",
  skeletonCount = 3,
  skeletonClassName = "h-20 w-full",
  children,
}: {
  isPending: boolean;
  isError: boolean;
  /** True when we already have usable cached/SSR data to render. */
  hasData: boolean;
  errorIcon?: LucideIcon;
  errorTitle?: string;
  errorDescription?: string;
  skeletonCount?: number;
  skeletonClassName?: string;
  children: ReactNode;
}) {
  if (isPending && !hasData) {
    return (
      <div className="space-y-2">
        {Array.from({ length: skeletonCount }, (_, i) => (
          <Skeleton key={i} className={skeletonClassName} />
        ))}
      </div>
    );
  }

  if (isError && !hasData) {
    return (
      <EmptyState icon={errorIcon} title={errorTitle} description={errorDescription} />
    );
  }

  return <>{children}</>;
}
