// Browser-side Sentry init. Next.js runs this file automatically (after the
// HTML loads, before hydration — see instrumentation-client.js file
// convention docs) — it is not imported anywhere, so don't delete it as
// "unused". Events are routed through withSentryConfig's tunnelRoute
// (next.config.ts, "/api/monitoring") rather than straight to Sentry's
// ingest domain, so ad blockers (uBlock/Brave/etc.) that block
// *.sentry.io/*.ingest.* don't silently swallow every client error, in both
// normal and incognito browsing.
import * as Sentry from "@sentry/nextjs";

Sentry.init({
  dsn: process.env.NEXT_PUBLIC_SENTRY_DSN,
  environment: process.env.NODE_ENV,

  // Full trace sampling in dev (cheap, low volume); 10% in production to
  // stay within a free-tier event quota on a personal-scale SaaS.
  tracesSampleRate: process.env.NODE_ENV === "development" ? 1.0 : 0.1,

  integrations: [
    Sentry.replayIntegration({
      // Never leak user data (repo names, recommendation text, etc.) into a
      // session recording — mask all text/inputs and block media by default.
      maskAllText: true,
      blockAllMedia: true,
    }),
  ],
  // Only record a sample of normal sessions, but always record ones that hit
  // an error — that's the replay you actually want when debugging a report.
  replaysSessionSampleRate: 0.1,
  replaysOnErrorSampleRate: 1.0,

  // Noise that isn't an actionable bug in this app's own code.
  ignoreErrors: [
    "top.GLOBALS",
    "ResizeObserver loop limit exceeded",
    "Non-Error promise rejection captured",
  ],
});

// Lets Sentry annotate traces/breadcrumbs with App Router navigations.
export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
