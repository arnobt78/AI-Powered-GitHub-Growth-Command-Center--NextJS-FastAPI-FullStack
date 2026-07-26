import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), geolocation=()" },
];

const nextConfig: NextConfig = {
  images: {
    remotePatterns: [{ protocol: "https", hostname: "avatars.githubusercontent.com", pathname: "/**" }],
  },
  async headers() {
    // Static-asset Cache-Control is set at the Vercel edge (vercel.json) instead of
    // here — overriding it via next.config.ts's headers() triggers a Next.js build
    // warning ("can break Next.js development behavior") for no benefit in prod.
    return [{ source: "/(.*)", headers: securityHeaders }];
  },
};

export default withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  authToken: process.env.SENTRY_AUTH_TOKEN,

  // Only print Sentry's own build-time upload logs in CI, not local dev.
  silent: !process.env.CI,

  // Upload a wider set of source maps for readable production stack traces.
  widenClientFileUpload: true,

  // Proxies browser Sentry events through this app's own /api/monitoring
  // route instead of straight to Sentry's ingest domain — ad blockers that
  // block *.sentry.io/*.ingest.* (both normal and incognito browsing, per
  // the ad-blocker-safe path convention CLAUDE.md already uses for the
  // backend API) never see this path, since it's same-origin. proxy.ts's
  // matcher already excludes every /api/* route from the auth gate, so no
  // change needed there. Sentry's Next.js build plugin wires the route
  // itself — no manual Route Handler file required.
  tunnelRoute: "/api/monitoring",
});
