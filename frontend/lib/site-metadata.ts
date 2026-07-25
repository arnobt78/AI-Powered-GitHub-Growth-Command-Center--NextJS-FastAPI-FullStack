/**
 * Site-wide SEO / Open Graph metadata for the Next.js App Router.
 *
 * Set `NEXT_PUBLIC_SITE_URL` to the production frontend origin after deploy.
 * Falls back to Vercel URL or localhost — never another site's origin.
 */

import type { Metadata } from "next";

/** README-aligned long title (docs/marketing only — not used as OG title). */
const SITE_TITLE_FULL =
  "AI-Powered GitHub Growth Command Center — Next.js, TypeScript, FastAPI, PostgreSQL, Tailwind CSS, Multi-LLM Full-Stack Project (Insights, Benchmarks, Recommendations, Draft-and-Approve Automation, Opportunities Inbox, SSE Live Sync)";

/** Shorter title for `<title>` tabs, UI chrome, and Open Graph. */
export const SITE_TITLE_SHORT = "AI-Powered GitHub Growth Command Center";

const SITE_DESCRIPTION =
  "Multi-tenant GitHub growth command center by Arnob Mahmud: track stars, forks, watchers, and traffic; benchmark repos; get multi-LLM recommendations; human-approved content drafts; opportunities inbox; SSE live sync — organic growth only, never fake engagement.";

const SITE_AUTHOR = {
  name: "Arnob Mahmud",
  url: "https://www.arnobmahmud.com",
  email: "contact@arnobmahmud.com",
} as const;

const SITE_KEYWORDS = [
  "GitHub growth",
  "GitHub analytics",
  "repository insights",
  "star tracking",
  "repo benchmarks",
  "organic GitHub growth",
  "draft and approve",
  "multi-LLM",
  "LLM router",
  "Next.js",
  "TypeScript",
  "FastAPI",
  "PostgreSQL",
  "Tailwind CSS",
  "TanStack Query",
  "SSE",
  "Auth.js",
  "GitHub OAuth",
  "open source",
  "Arnob Mahmud",
] as const;

/** Canonical site origin for absolute metadata URLs. */
function getSiteUrl(): URL {
  const fromEnv = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (fromEnv) {
    return new URL(fromEnv.replace(/\/$/, ""));
  }
  const vercel = process.env.VERCEL_URL?.trim();
  if (vercel) {
    const host = vercel.replace(/^https?:\/\//, "");
    return new URL(`https://${host}`);
  }
  return new URL("http://localhost:3000");
}

export const siteMetadata: Metadata = {
  metadataBase: getSiteUrl(),
  title: {
    default: SITE_TITLE_SHORT,
    template: `%s | ${SITE_TITLE_SHORT}`,
  },
  description: SITE_DESCRIPTION,
  applicationName: SITE_TITLE_SHORT,
  authors: [{ name: SITE_AUTHOR.name, url: SITE_AUTHOR.url }],
  creator: SITE_AUTHOR.name,
  publisher: SITE_AUTHOR.name,
  keywords: [...SITE_KEYWORDS],
  category: "technology",
  referrer: "origin-when-cross-origin",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  icons: {
    icon: [{ url: "/favicon.ico", sizes: "any" }],
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: SITE_TITLE_SHORT,
    title: SITE_TITLE_SHORT,
    description: SITE_DESCRIPTION,
    url: "/",
    // Dedicated ~1200×630 OG image not added yet — omit until /public/og.png exists.
  },
  twitter: {
    card: "summary",
    title: SITE_TITLE_SHORT,
    description: SITE_DESCRIPTION,
    creator: "@arnobt78",
  },
  alternates: {
    canonical: "/",
  },
  other: {
    "contact:email": SITE_AUTHOR.email,
    "author:url": SITE_AUTHOR.url,
    "og:title:full": SITE_TITLE_FULL,
  },
  robots: {
    index: false,
    follow: false,
    googleBot: {
      index: false,
      follow: false,
    },
  },
};
