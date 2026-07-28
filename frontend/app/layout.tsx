/**
 * Root layout — providers + AppShell chrome on every page (incl. sign-in).
 *
 * WHY shell on sign-in: Product Owner wants consistent sidebar/header everywhere;
 * unauthenticated nav clicks still bounce via proxy to /sign-in.
 */

import type { Metadata } from "next";
import { SessionProvider } from "next-auth/react";
import { Toaster } from "@/components/ui/sonner";
import { AppShell } from "@/components/app-shell";
import { QueryProvider } from "@/providers/query-provider";
import { LiveEventsProvider } from "@/providers/live-events-provider";
import { ThemeProvider } from "@/providers/theme-provider";
import { geistSans, geistMono } from "@/lib/fonts";
import { siteMetadata } from "@/lib/site-metadata";
import "./globals.css";

export const metadata: Metadata = siteMetadata;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      data-scroll-behavior="smooth"
      className={`${geistSans.variable} ${geistMono.variable}`}
    >
      {/* suppressHydrationWarning: extensions (e.g. ColorZilla) inject body attrs. */}
      <body suppressHydrationWarning className="overflow-x-hidden">
        <SessionProvider>
          <ThemeProvider>
            <QueryProvider>
              <LiveEventsProvider>
                <AppShell>{children}</AppShell>
                <Toaster />
              </LiveEventsProvider>
            </QueryProvider>
          </ThemeProvider>
        </SessionProvider>
      </body>
    </html>
  );
}
