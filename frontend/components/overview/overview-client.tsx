"use client";

import { FolderGit2 } from "lucide-react";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { useRepos } from "@/hooks/use-repos";
import { staggerDelay } from "@/lib/stagger";
import { AddRepoDialog } from "@/components/overview/add-repo-dialog";
import { RepoCard } from "@/components/overview/repo-card";

export function OverviewClient() {
  const { data: repos } = useRepos();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <SectionHeading icon={FolderGit2} title="Tracked repos" subtitle="Star/fork/watcher trends at a glance" />
        <AddRepoDialog />
      </div>
      {repos && repos.length === 0 ? (
        <EmptyState
          icon={FolderGit2}
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
    </div>
  );
}
