import { Compass } from "lucide-react";
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

// Branded 404 for both a truly unknown route and `notFound()` calls (e.g.
// repo-detail/page.tsx's owner-scoped 404) — otherwise both fall through to
// Next's generic, unbranded default page.
export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <div className="flex w-full max-w-sm flex-col items-center gap-4 rounded-lg border p-8 text-center">
        <Compass className="h-10 w-10 text-sky-500" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            This page doesn&apos;t exist, or you don&apos;t have access to it.
          </p>
        </div>
        {/* Button (@base-ui/react) defaults to nativeButton, which would warn
            and emit an invalid type="button" if this Link were passed via
            its render prop without also setting nativeButton={false} —
            applying the variant classes directly to the Link sidesteps that. */}
        <Link href="/" className={buttonVariants()}>
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}
