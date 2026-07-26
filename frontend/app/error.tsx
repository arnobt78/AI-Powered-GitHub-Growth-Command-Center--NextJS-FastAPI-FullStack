"use client";

import { AlertTriangle, RotateCw } from "lucide-react";
import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";
import { Button } from "@/components/ui/button";

// Catches any error thrown while rendering a page or its Server Component
// data-fetching (e.g. the backend fully down mid-Promise.all prefetch) that
// isn't already special-cased (repo-detail's own 404 handling). Without this,
// an uncaught throw here falls through to Next's generic, unbranded default.
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  // Next's error.tsx render doesn't itself report to Sentry — must be
  // captured explicitly, once per distinct error instance.
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border p-8 text-center">
        <AlertTriangle className="h-10 w-10 text-red-500" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            {error.message || "An unexpected error occurred while loading this page."}
          </p>
        </div>
        <Button onClick={reset}>
          <RotateCw className="h-4 w-4" aria-hidden="true" />
          Try again
        </Button>
      </div>
    </div>
  );
}
