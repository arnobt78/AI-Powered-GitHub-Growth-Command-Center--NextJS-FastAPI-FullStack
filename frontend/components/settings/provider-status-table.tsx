"use client";

import { AlertTriangle, Cpu } from "lucide-react";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHeading } from "@/components/ui/section-heading";
import { Skeleton } from "@/components/ui/skeleton";
import { useProviderStatus } from "@/hooks/use-provider-status";
import { semanticColor } from "@/lib/semantic-color";
import type { ProviderStatus } from "@/lib/api-types";

const columns: ColumnDef<ProviderStatus>[] = [
  { accessorKey: "provider", header: "Provider" },
  {
    accessorKey: "calls_today",
    header: "Calls today",
    // Zero calls today reads as neutral (provider simply hasn't been needed
    // yet, not a problem); any real usage is worth calling out as active.
    // filterFn maps the "Active"/"Idle" dropdown values (strings) onto the
    // underlying numeric calls_today column.
    filterFn: (row, columnId, filterValue) => {
      const calls = row.getValue<number>(columnId);
      return filterValue === "active" ? calls > 0 : calls === 0;
    },
    cell: ({ row }) => (
      <span
        className={`font-mono tabular-nums ${row.original.calls_today > 0 ? semanticColor("neutral") : "text-muted-foreground"}`}
      >
        {row.original.calls_today}
      </span>
    ),
  },
];

export function ProviderStatusTable() {
  const { data: statuses, isPending, isError } = useProviderStatus();

  return (
    <div className="space-y-3">
      <SectionHeading icon={Cpu} title="LLM provider usage" subtitle="Calls made today, per free-tier provider" iconColor="text-sky-500" />
      {isPending ? (
        <Skeleton className="h-24 w-full" />
      ) : isError && !statuses ? (
        // Gated on !statuses (not bare isError) so a background-refetch
        // failure doesn't discard already-visible data for an error block.
        <EmptyState icon={AlertTriangle} title="Couldn't load provider usage" description="Please try refreshing the page." />
      ) : statuses && statuses.length === 0 ? (
        <EmptyState icon={Cpu} title="No usage yet today" description="Provider usage resets daily." />
      ) : (
        <DataTable
          columns={columns}
          data={statuses ?? []}
          searchColumnId="provider"
          searchPlaceholder="Search providers..."
          filters={[
            {
              columnId: "calls_today",
              label: "usage",
              options: [
                { label: "Active", value: "active" },
                { label: "Idle", value: "idle" },
              ],
            },
          ]}
        />
      )}
    </div>
  );
}
