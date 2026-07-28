// Edge-runtime Sentry init — imported by instrumentation.ts's register().
// Covers proxy.ts (this Next.js version's renamed middleware.ts, per its own
// file header) and any route explicitly opted into the Edge runtime.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  // Same SSE pipe-noise filter as sentry.server.config.ts (edge may also
  // surface long-lived stream aborts depending on runtime path).
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
