// Edge-runtime Sentry init — imported by instrumentation.ts's register().
// Covers proxy.ts (this Next.js version's renamed middleware.ts, per its own
// file header) and any route explicitly opted into the Edge runtime.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,
});
