import { render, screen, fireEvent } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { ColumnDef } from "@tanstack/react-table";
import { DataTable } from "@/components/ui/data-table";

type Row = { name: string; status: string };

const columns: ColumnDef<Row>[] = [
  { accessorKey: "name", header: "Name" },
  { accessorKey: "status", header: "Status" },
];

const data: Row[] = [
  { name: "groq", status: "active" },
  { name: "gemini", status: "idle" },
];

describe("DataTable", () => {
  it("renders every row by default", () => {
    render(<DataTable columns={columns} data={data} searchColumnId="name" searchPlaceholder="Search..." />);
    expect(screen.getByText("groq")).toBeInTheDocument();
    expect(screen.getByText("gemini")).toBeInTheDocument();
  });

  it("filters rows by the search input", () => {
    render(<DataTable columns={columns} data={data} searchColumnId="name" searchPlaceholder="Search..." />);
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "groq" } });
    expect(screen.getByText("groq")).toBeInTheDocument();
    expect(screen.queryByText("gemini")).not.toBeInTheDocument();
  });

  it("renders an empty state when no rows match", () => {
    render(<DataTable columns={columns} data={data} searchColumnId="name" searchPlaceholder="Search..." />);
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "nonexistent" } });
    expect(screen.getByText(/no results/i)).toBeInTheDocument();
  });

  // Regression test for a real shipped bug: the filter dropdown's trigger
  // and options rendered the raw column values ("all"/"active"/"idle")
  // instead of their display labels, because Base UI's Select.Root only
  // resolves label text from an `items` prop passed to <Select> itself — it
  // does not infer labels from mounted SelectItem children. This both
  // exercises the filter's actual row-filtering behavior and asserts the
  // dropdown shows real labels, which is exactly what would have caught the
  // bug before it shipped.
  const filterColumns: ColumnDef<Row>[] = [
    { accessorKey: "name", header: "Name" },
    { accessorKey: "status", header: "Status" },
  ];
  const filters = [
    {
      columnId: "status",
      label: "status",
      options: [
        { label: "Active", value: "active" },
        { label: "Idle", value: "idle" },
      ],
    },
  ];

  it("filters rows via the filter dropdown and displays real option labels, not raw values", () => {
    render(
      <DataTable
        columns={filterColumns}
        data={data}
        searchColumnId="name"
        searchPlaceholder="Search..."
        filters={filters}
      />,
    );

    // Closed trigger shows "All status" (a real label), never the literal "all".
    const trigger = screen.getByRole("combobox");
    expect(trigger).toHaveTextContent("All status");
    expect(trigger).not.toHaveTextContent(/^all$/i);

    fireEvent.click(trigger);

    // Options in the open popup show real labels ("Active"/"Idle"), not the
    // raw underlying values ("active"/"idle") the old, items-less <Select>
    // fell back to stringifying.
    const activeOption = screen.getByRole("option", { name: "Active" });
    expect(activeOption).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Idle" })).toBeInTheDocument();

    // Base UI's SelectItem only commits a plain `click` as a real selection
    // if a `pointerdown` preceded it (this guards against accidentally
    // selecting whatever item ends up under the cursor when the popup first
    // opens) — fire both, mirroring a real mouse click's event sequence.
    fireEvent.pointerDown(activeOption);
    fireEvent.click(activeOption);

    // Selecting "Active" actually filters the row list down to matching rows.
    expect(screen.getByText("groq")).toBeInTheDocument();
    expect(screen.queryByText("gemini")).not.toBeInTheDocument();

    // The trigger now reflects the selected option's real label.
    expect(trigger).toHaveTextContent("Active");
  });

  // Fix 4: the design spec committed to getSortedRowModel + clickable
  // headers, but the shipped DataTable only wired getFilteredRowModel — no
  // way to sort at all. This asserts clicking a header actually reorders
  // the rendered rows (TanStack Table columns sort by default; no per-column
  // opt-in needed).
  it("sorts rows when a column header is clicked", () => {
    render(<DataTable columns={columns} data={data} searchColumnId="name" searchPlaceholder="Search..." />);

    const rowsBefore = screen.getAllByRole("row").slice(1); // drop the header row
    expect(rowsBefore[0]).toHaveTextContent("groq");
    expect(rowsBefore[1]).toHaveTextContent("gemini");

    fireEvent.click(screen.getByRole("button", { name: "Name" }));

    const rowsAscending = screen.getAllByRole("row").slice(1);
    expect(rowsAscending[0]).toHaveTextContent("gemini");
    expect(rowsAscending[1]).toHaveTextContent("groq");

    fireEvent.click(screen.getByRole("button", { name: "Name" }));

    const rowsDescending = screen.getAllByRole("row").slice(1);
    expect(rowsDescending[0]).toHaveTextContent("groq");
    expect(rowsDescending[1]).toHaveTextContent("gemini");
  });
});
