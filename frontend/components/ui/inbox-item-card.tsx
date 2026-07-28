/**
 * Glass inbox row: meta + body + trailing action (dismiss / approve).
 */

"use client";

import type { ReactNode } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { staggerDelay } from "@/lib/stagger";

export function InboxItemCard({
  index,
  meta,
  children,
  action,
}: {
  index: number;
  meta?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card
      className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards motion-reduce:animate-none"
      style={staggerDelay(index)}
    >
      <CardContent className="flex items-start justify-between gap-4 py-4">
        <div className="min-w-0 flex-1">
          {meta ? <div className="text-xs font-medium text-muted-foreground">{meta}</div> : null}
          <div className={meta ? "mt-1" : undefined}>{children}</div>
        </div>
        {action ? <div className="flex shrink-0 items-center gap-1">{action}</div> : null}
      </CardContent>
    </Card>
  );
}
