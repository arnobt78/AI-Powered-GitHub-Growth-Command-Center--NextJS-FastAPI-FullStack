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
});
