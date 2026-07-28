/**
 * Primary app navigation — desktop sidebar or mobile drawer content.
 *
 * Educational walkthrough: uses Next.js `<Link>` so Cmd/Ctrl-click and
 * prefetch work. Semantic icon colors match each feature's SectionHeading.
 */

"use client";

import { Bell, History, Inbox, LayoutDashboard, LogOut, Radar, Settings } from "lucide-react";
import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { toast } from "sonner";
import { SafeImage } from "@/components/safe-image";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/", label: "Overview", icon: LayoutDashboard, color: "text-sky-500" },
  { href: "/recommendations", label: "Recommendations", icon: Bell, color: "text-amber-500" },
  { href: "/drafts", label: "Drafts", icon: Inbox, color: "text-emerald-500" },
  { href: "/runs", label: "Pipeline Runs", icon: History, color: "text-violet-500" },
  { href: "/opportunities", label: "Opportunities", icon: Radar, color: "text-rose-500" },
  // muted-foreground keeps Settings neutral vs feature-accent nav items
  { href: "/settings", label: "Settings", icon: Settings, color: "text-muted-foreground" },
];

function handleSignOut(name: string | null | undefined) {
  toast.success(`Goodbye, ${name ?? "there"} 👋`, {
    description: "Hope to see you again soon — happy coding!",
  });
  signOut({ callbackUrl: "/sign-in" });
}

export function NavSidebar({
  onNavigate,
  className,
}: {
  onNavigate?: () => void;
  className?: string;
}) {
  const pathname = usePathname();
  const { data: session } = useSession();

  return (
    <nav className={cn("flex w-56 shrink-0 flex-col gap-1 border-r p-4", className)}>
      {NAV_ITEMS.map(({ href, label, icon: Icon, color }) => {
        const active = pathname === href;
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-gray-700 dark:text-white",
              active ? "bg-muted" : "hover:bg-muted/50",
            )}
          >
            <Icon className={`h-4 w-4 ${color}`} aria-hidden="true" />
            {label}
          </Link>
        );
      })}

      {session?.user && (
        <div className="mt-auto flex items-center gap-2 border-t pt-4">
          <SafeImage
            src={session.user.image ?? ""}
            alt={session.user.name ?? "Account"}
            width={28}
            height={28}
            className="rounded-full"
          />
          <span className="flex-1 truncate text-sm font-medium text-gray-700 dark:text-white">
            {session.user.name}
          </span>
          <button
            type="button"
            onClick={() => handleSignOut(session.user.name)}
            aria-label="Sign out"
            className="rounded-md p-1.5 hover:bg-muted/50"
          >
            <LogOut className="h-4 w-4 text-rose-500" aria-hidden="true" />
          </button>
        </div>
      )}
    </nav>
  );
}
