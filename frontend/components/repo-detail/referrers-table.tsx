"use client";

import { AlertTriangle, Link2 } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepoReferrers } from "@/hooks/use-repo-referrers";
import type { Referrer } from "@/lib/api-types";

const columns: ColumnDef<Referrer>[] = [
  { accessorKey: "referrer", header: "Source" },
  { accessorKey: "count", header: "Views", cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.count}</span> },
  { accessorKey: "uniques", header: "Uniques", cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.uniques}</span> },
];

export function ReferrersTable({ repoId }: { repoId: number }) {
  const { data: referrers, isPending, isError } = useRepoReferrers(repoId);

  return (
    <div className="space-y-3">
      <SectionHeading icon={Link2} title="Referrers" subtitle="Where traffic is coming from" iconColor="text-emerald-500" />
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : isError && !referrers ? (
        // Gated on !referrers (not bare isError) so a background-refetch
        // failure doesn't discard already-visible data for an error block.
        <EmptyState icon={AlertTriangle} title="Couldn't load referrers" description="Please try refreshing the page." />
      ) : referrers && referrers.length === 0 ? (
        <EmptyState icon={Link2} title="No referrer data yet" description="GitHub's traffic API is a rolling 14-day window." />
      ) : (
        <DataTable columns={columns} data={referrers ?? []} searchColumnId="referrer" searchPlaceholder="Search referrers..." />
      )}
    </div>
  );
}
