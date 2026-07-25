"use client";

import { Trophy } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { SectionHeading } from "@/components/ui/section-heading";
import { EmptyState } from "@/components/ui/empty-state";
import { Skeleton } from "@/components/ui/skeleton";
import { useRepoBenchmarks } from "@/hooks/use-repo-benchmarks";
import type { Benchmark } from "@/lib/api-types";

const columns: ColumnDef<Benchmark>[] = [
  { accessorKey: "full_name", header: "Repo" },
  { accessorKey: "stars", header: "Stars", cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.stars}</span> },
  { accessorKey: "forks", header: "Forks", cell: ({ row }) => <span className="font-mono tabular-nums">{row.original.forks}</span> },
  { accessorKey: "topics", header: "Topics", cell: ({ row }) => row.original.topics.join(", ") },
];

export function BenchmarkTable({ repoId }: { repoId: number }) {
  const { data: benchmarks, isPending } = useRepoBenchmarks(repoId);

  return (
    <div className="space-y-3">
      <SectionHeading icon={Trophy} title="Benchmark repos" subtitle="Similar public repos, for comparison" iconColor="text-amber-500" />
      {isPending ? (
        <Skeleton className="h-32 w-full" />
      ) : benchmarks && benchmarks.length === 0 ? (
        <EmptyState icon={Trophy} title="No benchmarks yet" description="These populate on the next pipeline run." />
      ) : (
        <DataTable columns={columns} data={benchmarks ?? []} searchColumnId="full_name" searchPlaceholder="Search repos..." />
      )}
    </div>
  );
}
