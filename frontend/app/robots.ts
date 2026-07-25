/**
 * robots.txt — authenticated product surfaces stay out of search indexes by default.
 *
 * Educational walkthrough: once you ship a public marketing landing, allow that
 * path explicitly and set NEXT_PUBLIC_SITE_URL for a Sitemap if needed.
 */

import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
