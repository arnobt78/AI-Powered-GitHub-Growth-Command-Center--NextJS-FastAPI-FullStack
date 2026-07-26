"use client";

import { useEffect } from "react";
import * as Sentry from "@sentry/nextjs";

// Only fires if the root layout itself throws (rare — layout.tsx has no
// data-fetching), so it must render its own <html>/<body> since it replaces
// the entire root layout rather than nesting inside it like app/error.tsx.
// It's a separate boundary from error.tsx (the layout crashing means
// error.tsx's own nesting inside that layout is gone too), so it needs its
// own Sentry.captureException call — the app/error.tsx one never fires here.
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body>
        <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", fontFamily: "sans-serif" }}>
          <div style={{ textAlign: "center" }}>
            <h1 style={{ fontSize: "1.125rem", fontWeight: 600 }}>Something went wrong</h1>
            <p style={{ marginTop: "0.25rem", fontSize: "0.875rem", color: "#71717a" }}>
              {error.message || "An unexpected error occurred."}
            </p>
            <button
              onClick={reset}
              style={{ marginTop: "1rem", padding: "0.5rem 1rem", borderRadius: "0.375rem", border: "1px solid #71717a" }}
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
