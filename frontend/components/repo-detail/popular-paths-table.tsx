"use client";

import { Route } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepoPopularPaths } from "@/hooks/use-repo-popular-paths";
import type { PopularPath } from "@/lib/api-types";

const columns: ColumnDef<PopularPath>[] = [
  { accessorKey: "path", header: "Path", cell: ({ row }) => <span className="font-mono text-xs">{row.original.path}</span> },
  { accessorKey: "count", header: "Views" },
  { accessorKey: "uniques", header: "Uniques" },
];

export function PopularPathsTable({ repoId }: { repoId: number }) {
  const { data: paths, isPending } = useRepoPopularPaths(repoId);

  return (
    <div className="space-y-3">
      <SectionHeading icon={Route} title="Popular content" subtitle="Most-viewed paths in this repo" iconColor="text-sky-500" />
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : paths && paths.length === 0 ? (
        <EmptyState icon={Route} title="No path data yet" description="GitHub's traffic API is a rolling 14-day window." />
      ) : (
        <DataTable columns={columns} data={paths ?? []} searchColumnId="path" searchPlaceholder="Search paths..." />
      )}
    </div>
  );
}
