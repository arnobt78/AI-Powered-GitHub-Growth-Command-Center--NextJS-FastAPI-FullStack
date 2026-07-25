/**
 * Root layout — persistent shell across navigations (nav, theme, providers).
 *
 * Educational walkthrough
 * -----------------------
 * Layout stays mounted when moving between pages → instant chrome.
 * Providers (session, React Query, SSE live events, theme) wrap all pages once.
 * No `loading.tsx` — feature pages skeleton data slots only, not this shell.
 * SEO / Open Graph fields live in `lib/site-metadata.ts` (imported below).
 */

import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { GithubIcon } from "@/components/icons/github-icon";
import { NavSidebar } from "@/components/nav-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { QueryProvider } from "@/providers/query-provider";
import { LiveEventsProvider } from "@/providers/live-events-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { geistSans, geistMono } from "@/lib/fonts";
import { SITE_TITLE_SHORT, siteMetadata } from "@/lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = siteMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      // Applying next/font/local's .variable classes here (not next/font/google)
      // is what makes the preload/self-hosting actually take effect app-wide —
      // globals.css's --font-sans/--font-mono just reference these variable names.
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      <body>
        <SessionProvider>
          <ThemeProvider>
            <QueryProvider>
              <LiveEventsProvider>
                <div className="flex min-h-screen">
                  <NavSidebar />
                  <div className="flex-1">
                    <header className="flex items-center justify-between border-b px-6 py-3">
                      <h1 className="flex items-center gap-2 text-base font-semibold">
                        <GithubIcon className="h-5 w-5" aria-hidden="true" />
                        {SITE_TITLE_SHORT}
                      </h1>
                      <ThemeToggle />
                    </header>
                    <main className="p-6">{children}</main>
                  </div>
                </div>
                <Toaster />
              </LiveEventsProvider>
            </QueryProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
