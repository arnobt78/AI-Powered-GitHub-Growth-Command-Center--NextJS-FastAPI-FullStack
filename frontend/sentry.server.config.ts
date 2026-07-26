// Server-side (Node.js runtime) Sentry init — imported by instrumentation.ts's
// register(), never directly. Covers Server Components, Route Handlers, and
// Server Actions running in the Node runtime.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
