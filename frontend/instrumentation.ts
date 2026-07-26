// Runs once when a new server instance starts — routes to the correct
// runtime-specific Sentry config (Node vs Edge each need their own SDK
// transport, hence two files rather than one shared init).
import * as Sentry from "@sentry/nextjs";

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    await import("./sentry.server.config");
  }

  if (process.env.NEXT_RUNTIME === "edge") {
    await import("./sentry.edge.config");
  }
}

// Captures errors from Server Components, Route Handlers, and proxy.ts that
// error.tsx/global-error.tsx (client-side boundaries) never see.
export const onRequestError = Sentry.captureRequestError;
