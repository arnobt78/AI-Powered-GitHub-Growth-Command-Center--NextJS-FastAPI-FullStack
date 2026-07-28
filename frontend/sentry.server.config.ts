// Server-side (Node.js runtime) Sentry init — imported by instrumentation.ts's
// register(), never directly. Covers Server Components, Route Handlers, and
// Server Actions running in the Node runtime.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Mirror instrumentation-client.ts noise filters. SSE peer-close during
  // backend restart still sometimes surfaces as Next's "failed to pipe
  // response" even after the route swallows the body error — drop those so
  // they don't burn free-tier quota / look like High production bugs.
  ignoreErrors: ["failed to pipe response"],

  beforeSend(event, hint) {
    const message = String(
      hint.originalException instanceof Error
        ? hint.originalException.message
        : (event.exception?.values?.[0]?.value ?? event.message ?? ""),
    ).toLowerCase();
    const transaction = String(event.transaction ?? "");
    const url = String(event.request?.url ?? event.tags?.url ?? "");
    const isEventsRoute =
      transaction.includes("/api/events") || url.includes("/api/events");
    if (
      isEventsRoute &&
      (message.includes("failed to pipe response") ||
        message.includes("other side closed") ||
        message.includes("econnreset"))
    ) {
      return null;
    }
    return event;
  },
});
