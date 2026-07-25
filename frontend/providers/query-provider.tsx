/**
 * App-wide TanStack Query client.
 *
 * Educational walkthrough: create the client once with `useState` so React
 * Strict Mode / remounts do not wipe the cache. `staleTime` reduces refetch
 * thrash; window-focus refetch is off because SSE already pushes freshness.
 */

"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";

export function QueryProvider({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: false,
          },
        },
      }),
  );

  return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
}
