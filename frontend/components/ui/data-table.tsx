"use client";

import {
  type ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDown, ArrowUp, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { staggerDelay } from "@/lib/stagger";

// Shared table shell for every list-of-rows view in this app (provider
// status, popular paths, referrers, benchmarks) — one search input + zero or
// more filter dropdowns above a TanStack-Table-driven <table>, instead of
// each table hand-rolling its own toolbar.
export function DataTable<TData, TValue>({
  columns,
  data,
  searchColumnId,
  searchPlaceholder,
  filters,
}: {
  columns: ColumnDef<TData, TValue>[];
  data: TData[];
  searchColumnId: string;
  searchPlaceholder: string;
  filters?: { columnId: string; label: string; options: { label: string; value: string }[] }[];
}) {
  // eslint-disable-next-line react-hooks/incompatible-library -- known, harmless React Compiler / TanStack Table interaction (useReactTable() returns functions the compiler can't safely memoize); confirmed non-blocking by two independent task reviewers during this plan's implementation.
  const table = useReactTable({
    data,
    columns,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-40">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            placeholder={searchPlaceholder}
            className="pl-8"
            value={(table.getColumn(searchColumnId)?.getFilterValue() as string) ?? ""}
            onChange={(e) => table.getColumn(searchColumnId)?.setFilterValue(e.target.value)}
          />
        </div>
        {filters?.map((filter) => (
          <Select
            key={filter.columnId}
            // Base UI's Select.Root only resolves the trigger's displayed
            // label from this `items` prop (a value -> label record/array) —
            // it does NOT infer labels from mounted SelectItem children.
            // Without it, the trigger falls back to stringifying the raw
            // filter value ("all"/"active"/"idle") instead of showing
            // "All usage"/"Active"/"Idle". Verified directly against
            // node_modules/@base-ui/react/select/root/SelectRoot.d.ts (the
            // `items` prop's own doc comment shows this exact
            // Record<string, ReactNode> shape) and
            // .../internals/resolveValueLabel.js's resolveSelectedLabel,
            // which SelectValue calls with the store's `items`.
            items={{
              all: `All ${filter.label}`,
              ...Object.fromEntries(filter.options.map((option) => [option.value, option.label])),
            }}
            value={(table.getColumn(filter.columnId)?.getFilterValue() as string) ?? "all"}
            onValueChange={(value) =>
              table.getColumn(filter.columnId)?.setFilterValue(value === "all" ? undefined : value)
            }
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder={filter.label} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All {filter.label}</SelectItem>
              {filter.options.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ))}
      </div>
      <Table>
        <TableHeader>
          {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                // TanStack Table columns are sortable by default unless a
                // column explicitly opts out (`enableSorting: false`) — no
                // per-column wiring needed for the 4 tables that consume
                // DataTable, sorting just works once it's here.
                const canSort = header.column.getCanSort();
                const sortDirection = header.column.getIsSorted();
                return (
                  <TableHead key={header.id}>
                    {header.isPlaceholder ? null : canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="flex items-center gap-1 hover:text-foreground"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        {sortDirection === "asc" && <ArrowUp className="h-3.5 w-3.5" aria-hidden="true" />}
                        {sortDirection === "desc" && <ArrowDown className="h-3.5 w-3.5" aria-hidden="true" />}
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <TableBody>
          {table.getRowModel().rows.length > 0 ? (
            table.getRowModel().rows.map((row) => (
              // Staggered mount using TanStack's own row.index (not a fresh
              // counter, since a filtered row model's positions can differ
              // from the underlying data array) — see lib/stagger.ts.
              // motion-reduce:animate-none opts out for prefers-reduced-motion.
              <TableRow
                key={row.id}
                className="animate-in fade-in slide-in-from-bottom-2 duration-300 fill-mode-backwards motion-reduce:animate-none"
                style={staggerDelay(row.index)}
              >
                {row.getVisibleCells().map((cell) => (
                  <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                ))}
              </TableRow>
            ))
          ) : (
            <TableRow>
              <TableCell colSpan={columns.length} className="py-6 text-center text-sm text-muted-foreground">
                No results.
              </TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
    </div>
  );
}
