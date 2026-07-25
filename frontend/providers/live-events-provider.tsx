"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { useSession } from "next-auth/react";
import { toast } from "sonner";
import { useLiveEvents } from "@/hooks/use-live-events";

export function LiveEventsProvider({ children }: { children: ReactNode }) {
  useLiveEvents();

  const { status, data } = useSession();
  // Fires once per browser session, not on every re-render while
  // authenticated (a ref, not state, since this shouldn't itself trigger a
  // re-render) — next-auth's session hook re-fires on focus/interval polling,
  // and repeating the welcome toast on every poll would be noisy, not welcoming.
  const welcomedRef = useRef(false);

  useEffect(() => {
    if (status === "authenticated" && !welcomedRef.current) {
      welcomedRef.current = true;
      const name = data?.user?.name ?? "there";
      toast.success(`Welcome back, ${name} 👋`, { description: "Enjoy browsing your dashboard..." });
    }
    if (status === "unauthenticated") {
      welcomedRef.current = false;
    }
  }, [status, data?.user?.name]);

  return <>{children}</>;
}
