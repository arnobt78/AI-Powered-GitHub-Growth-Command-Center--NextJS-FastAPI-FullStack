/**
 * Dashboard chrome: desktop sidebar + mobile drawer + top header.
 * Used on every route (including sign-in) for consistent chrome.
 */

"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import { GithubIcon } from "@/components/icons/github-icon";
import { NavSidebar } from "@/components/nav-sidebar";
import { ThemeToggle } from "@/components/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SITE_TITLE_SHORT } from "@/lib/site-metadata";

export function AppShell({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <div className="relative flex min-h-screen min-w-0 overflow-x-hidden">
      <div className="hidden md:flex">
        <NavSidebar />
      </div>

      <div className="flex min-w-0 flex-1 flex-col overflow-x-hidden">
        <header className="flex min-w-0 items-center justify-between gap-3 border-b px-4 py-3 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="md:hidden"
              aria-label="Open navigation"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" aria-hidden="true" />
            </Button>
            <h1 className="flex min-w-0 items-center gap-2 text-sm font-semibold text-gray-700 dark:text-white sm:text-base">
              <GithubIcon className="h-5 w-5 shrink-0" aria-hidden="true" />
              <span className="break-words">{SITE_TITLE_SHORT}</span>
            </h1>
          </div>
          <ThemeToggle />
        </header>
        <main className="min-w-0 overflow-x-hidden p-4 sm:p-6">{children}</main>
      </div>

      <Dialog open={mobileOpen} onOpenChange={setMobileOpen}>
        <DialogContent
          showCloseButton
          className="fixed top-0 left-0 h-full max-h-none w-[min(18rem,100%)] max-w-none translate-x-0 translate-y-0 rounded-none border-r p-0 data-open:zoom-in-100 data-closed:zoom-out-100 sm:max-w-none"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Navigation</DialogTitle>
          </DialogHeader>
          <NavSidebar onNavigate={() => setMobileOpen(false)} className="h-full w-full border-r-0" />
        </DialogContent>
      </Dialog>
    </div>
  );
}
