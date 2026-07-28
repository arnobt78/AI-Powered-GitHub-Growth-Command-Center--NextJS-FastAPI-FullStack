/**
 * Sign-in page — GitHub OAuth entry; redirects home if already authenticated.
 */

import { Rocket } from "lucide-react";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { GithubIcon } from "@/components/icons/github-icon";
import { SignInButton } from "@/components/sign-in/sign-in-button";
import { SITE_TITLE_SHORT } from "@/lib/site-metadata";

export const dynamic = "force-dynamic";

export default async function SignInPage() {
  // Already signed in? Skip the form — proxy would also protect other routes.
  const session = await auth();
  if (session?.user) {
    redirect("/");
  }

  return (
    <div className="flex items-center justify-center py-8 sm:py-12">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 rounded-lg border p-8 text-center">
        <Rocket className="h-10 w-10 text-sky-500" aria-hidden="true" />
        <div className="space-y-1">
          <h1 className="text-lg font-semibold text-gray-700 dark:text-white">{SITE_TITLE_SHORT}</h1>
          <p className="text-sm text-muted-foreground">
            Sign in with GitHub to track your repos and get AI-synthesized growth recommendations.
          </p>
        </div>
        <SignInButton />
        <p className="flex flex-wrap items-center justify-center gap-1.5 text-xs text-muted-foreground">
          <GithubIcon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
          Public-repo read access only — we never touch private repos or write to GitHub.
        </p>
      </div>
    </div>
  );
}
