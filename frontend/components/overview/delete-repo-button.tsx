"use client";

import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useDeleteRepo } from "@/hooks/use-repos";
import type { Repo } from "@/lib/api-types";

// Shared by RepoCard (Overview) and SettingsClient (Settings) — same
// stop-tracking action, same error toast, both rendered next to a repo row.
export function DeleteRepoButton({ repo }: { repo: Repo }) {
  const deleteRepo = useDeleteRepo();

  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={`Stop tracking ${repo.owner}/${repo.name}`}
      onClick={() =>
        deleteRepo.mutate(repo.id, {
          onError: () => toast.error("Could not stop tracking repo", { description: `${repo.owner}/${repo.name} — please try again.` }),
        })
      }
      disabled={deleteRepo.isPending}
    >
      <Trash2 className="h-4 w-4 text-red-500" aria-hidden="true" />
    </Button>
  );
}
