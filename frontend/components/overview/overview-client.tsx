/**
 * Overview client UI — shell titles stay visible; cards hydrate from RQ cache.
 */

"use client";

import { FolderGit2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { useRepos } from "@/hooks/use-repos";
import { staggerDelay } from "@/lib/stagger";
import { AddRepoDialog } from "@/components/overview/add-repo-dialog";
import { RepoCard } from "@/components/overview/repo-card";

export function OverviewClient() {
  const { data: repos, isPending, isError } = useRepos();

  return (
    <div className="space-y-6">
      <PageHeader
        icon={FolderGit2}
        title="Tracked repos"
        subtitle="Star/fork/watcher trends at a glance"
        iconColor="text-sky-500"
        action={<AddRepoDialog />}
      />
      <QueryState
        isPending={isPending}
        isError={isError}
        hasData={repos !== undefined}
        errorTitle="Couldn't load repos"
        skeletonCount={3}
        skeletonClassName="h-36 w-full"
      >
        {repos && repos.length === 0 ? (
          <EmptyState
            icon={FolderGit2}
            iconColor="text-sky-500"
            title="No repos tracked yet"
            description="Add a repo to start tracking its growth."
            action={<AddRepoDialog />}
          />
        ) : (
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {repos?.map((repo, index) => (
              <div
                key={repo.id}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards motion-reduce:animate-none"
                style={staggerDelay(index)}
              >
                <RepoCard repo={repo} />
              </div>
            ))}
          </div>
        )}
      </QueryState>
    </div>
  );
}
