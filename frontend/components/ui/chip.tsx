import type { ReactNode } from "react";

export function Chip({ children }: { children: ReactNode }) {
  return (
    // .glass supplies background + border (replaces the old bg-muted/ring-1
    // pairing) so chips pick up the same translucent surface as other primitives.
    <span className="glass inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium text-muted-foreground">
      {children}
    </span>
  );
}
