"use client";

import { FolderGit2, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { QueryState } from "@/components/ui/query-state";
import { AddRepoDialog } from "@/components/overview/add-repo-dialog";
import { DeleteRepoButton } from "@/components/overview/delete-repo-button";
import { NotificationSettingsCard } from "@/components/settings/notification-settings-card";
import { ProviderStatusTable } from "@/components/settings/provider-status-table";
import { useRepos } from "@/hooks/use-repos";

export function SettingsClient() {
  const { data: repos, isPending, isError } = useRepos();

  return (
    <div className="space-y-8">
      <PageHeader
        icon={SettingsIcon}
        title="Settings"
        subtitle="Manage tracked repos and provider health"
        iconColor="text-muted-foreground"
      />

      <div className="space-y-3">
        <PageHeader
          icon={FolderGit2}
          title="Tracked repos"
          iconColor="text-sky-500"
          action={<AddRepoDialog />}
        />
        <QueryState
          isPending={isPending}
          isError={isError}
          hasData={repos !== undefined}
          errorTitle="Couldn't load repos"
          skeletonCount={2}
          skeletonClassName="h-14 w-full"
        >
          {repos && repos.length === 0 ? (
            <EmptyState
              icon={FolderGit2}
              iconColor="text-sky-500"
              title="No repos tracked yet"
              description="Add a repo to get started."
            />
          ) : (
            <div className="space-y-2">
              {repos?.map((repo) => (
                <Card key={repo.id}>
                  <CardContent className="flex flex-wrap items-center justify-between gap-2 py-3">
                    <span className="break-words font-medium text-gray-700 dark:text-white">
                      {repo.owner}/{repo.name}
                    </span>
                    <DeleteRepoButton repo={repo} />
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </QueryState>
      </div>

      <ProviderStatusTable />

      <NotificationSettingsCard />
    </div>
  );
}
