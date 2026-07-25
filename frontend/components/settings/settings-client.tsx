"use client";

import { FolderGit2, Settings as SettingsIcon } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { AddRepoDialog } from "@/components/overview/add-repo-dialog";
import { DeleteRepoButton } from "@/components/overview/delete-repo-button";
import { NotificationSettingsCard } from "@/components/settings/notification-settings-card";
import { ProviderStatusTable } from "@/components/settings/provider-status-table";
import { useRepos } from "@/hooks/use-repos";

export function SettingsClient() {
  const { data: repos } = useRepos();

  return (
    <div className="space-y-8">
      <SectionHeading icon={SettingsIcon} title="Settings" subtitle="Manage tracked repos and provider health" />

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <SectionHeading icon={FolderGit2} title="Tracked repos" iconColor="text-sky-500" />
          <AddRepoDialog />
        </div>
        {repos && repos.length === 0 ? (
          <EmptyState icon={FolderGit2} title="No repos tracked yet" description="Add a repo to get started." />
        ) : (
          <div className="space-y-2">
            {repos?.map((repo) => (
              <Card key={repo.id}>
                <CardContent className="flex items-center justify-between py-3">
                  <span>
                    {repo.owner}/{repo.name}
                  </span>
                  <DeleteRepoButton repo={repo} />
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      <ProviderStatusTable />

      <NotificationSettingsCard />
    </div>
  );
}
