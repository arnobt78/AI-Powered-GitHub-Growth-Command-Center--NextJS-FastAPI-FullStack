/**
 * Shared page title row: SectionHeading + optional action.
 * Stacks on narrow screens so CTAs never clip long titles.
 */

import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { SectionHeading } from "@/components/ui/section-heading";

export function PageHeader({
  icon,
  title,
  subtitle,
  iconColor,
  action,
}: {
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  iconColor?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <SectionHeading icon={icon} title={title} subtitle={subtitle} iconColor={iconColor} />
      {action ? <div className="flex shrink-0 flex-wrap items-center gap-2">{action}</div> : null}
    </div>
  );
}
