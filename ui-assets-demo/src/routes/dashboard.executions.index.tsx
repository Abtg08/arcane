import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { api, REFETCH_INTERVAL } from "@/lib/api";
import type { Execution } from "@/lib/types";
import { formatDuration, formatTimestamp } from "@/lib/format";
import { DataTable, type Column } from "@/components/arcane/data-table";
import { ExecStatusBadge } from "@/components/arcane/badges";
import { PageError, PageHeader } from "@/components/arcane/page-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

const PAGE_SIZE = 15;

interface ExecSearch {
  status: string;
  toolkit: string;
  from: string;
  to: string;
  page: number;
}

export const Route = createFileRoute("/dashboard/executions/")({
  validateSearch: (search: Record<string, unknown>): ExecSearch => ({
    status: typeof search["status"] === "string" ? search["status"] : "all",
    toolkit: typeof search["toolkit"] === "string" ? search["toolkit"] : "all",
    from: typeof search["from"] === "string" ? search["from"] : "",
    to: typeof search["to"] === "string" ? search["to"] : "",
    page: Number(search["page"]) > 0 ? Number(search["page"]) : 1,
  }),
  head: () => ({
    meta: [
      { title: "Executions — Arcane" },
      { name: "description", content: "Browse and filter every tool execution recorded by Arcane." },
      { property: "og:title", content: "Executions — Arcane" },
      { property: "og:description", content: "Browse and filter every tool execution recorded by Arcane." },
    ],
  }),
  component: ExecutionsPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function ExecutionsPage() {
  const { status, toolkit, from, to, page } = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });

  const setSearch = (patch: Partial<ExecSearch>) =>
    navigate({ search: (prev) => ({ ...prev, page: 1, ...patch }) });

  const toolkits = useQuery({ queryKey: ["toolkits"], queryFn: () => api.listToolkits() });
  const executions = useQuery({
    queryKey: ["executions", { status, toolkit, from, to }],
    queryFn: () => api.listExecutions({ status, toolkit, from, to }),
    refetchInterval: REFETCH_INTERVAL,
  });

  const all = executions.data?.data ?? [];
  const pageCount = Math.max(1, Math.ceil(all.length / PAGE_SIZE));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const rows = all.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const columns: Column<Execution>[] = [
    { key: "id", header: "ID", sortable: true, sortValue: (r) => r.id, cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      key: "toolkit",
      header: "Toolkit",
      sortable: true,
      sortValue: (r) => r.toolkit_name,
      cell: (r) => <span className="text-xs text-foreground">{r.toolkit_name}</span>,
    },
    { key: "tool", header: "Tool", sortable: true, sortValue: (r) => r.tool_name, cell: (r) => <span className="font-mono text-xs">{r.tool_name}</span> },
    { key: "status", header: "Status", sortable: true, sortValue: (r) => r.status, cell: (r) => <ExecStatusBadge status={r.status} /> },
    {
      key: "duration",
      header: "Duration",
      sortable: true,
      sortValue: (r) => r.duration_ms,
      className: "text-right",
      cell: (r) => <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(r.duration_ms)}</span>,
    },
    {
      key: "tenant",
      header: "Tenant",
      sortable: true,
      sortValue: (r) => r.tenant,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.tenant}</span>,
    },
    {
      key: "ts",
      header: "Timestamp",
      sortable: true,
      sortValue: (r) => r.created_at,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{formatTimestamp(r.created_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Executions" description="Every tool call, with inputs, outputs and audit history." />

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <Select value={status} onValueChange={(v) => setSearch({ status: v })}>
          <SelectTrigger className="h-9 w-[150px] text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All statuses</SelectItem>
            <SelectItem value="SUCCESS">Success</SelectItem>
            <SelectItem value="FAILED">Failed</SelectItem>
            <SelectItem value="RUNNING">Running</SelectItem>
            <SelectItem value="PENDING">Pending</SelectItem>
          </SelectContent>
        </Select>

        <Select value={toolkit} onValueChange={(v) => setSearch({ toolkit: v })}>
          <SelectTrigger className="h-9 w-[170px] text-xs">
            <SelectValue placeholder="Toolkit" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All toolkits</SelectItem>
            {(toolkits.data?.data ?? []).map((t) => (
              <SelectItem key={t.slug} value={t.slug}>
                {t.icon} {t.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex items-center gap-2">
          <Input
            type="date"
            value={from}
            onChange={(e) => setSearch({ from: e.target.value })}
            className="h-9 w-[150px] font-mono text-xs"
          />
          <span className="text-xs text-muted-foreground">to</span>
          <Input
            type="date"
            value={to}
            onChange={(e) => setSearch({ to: e.target.value })}
            className="h-9 w-[150px] font-mono text-xs"
          />
        </div>

        {(status !== "all" || toolkit !== "all" || from || to) && (
          <Button
            variant="ghost"
            size="sm"
            className="h-9 text-xs"
            onClick={() => setSearch({ status: "all", toolkit: "all", from: "", to: "" })}
          >
            Clear
          </Button>
        )}

        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {all.length} result{all.length === 1 ? "" : "s"}
        </span>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={executions.isLoading}
        skeletonRows={10}
        emptyTitle="No executions match these filters"
        emptyDescription="Try widening the date range or clearing the status and toolkit filters."
        onRowClick={(r) => navigate({ to: "/dashboard/executions/$id", params: { id: r.id } })}
      />

      <div className="mt-3 flex items-center justify-between">
        <span className="font-mono text-[11px] text-muted-foreground">
          Page {safePage} of {pageCount}
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={safePage <= 1}
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: safePage - 1 }) })}
          >
            <ChevronLeft className="size-3.5" /> Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={safePage >= pageCount}
            onClick={() => navigate({ search: (prev) => ({ ...prev, page: safePage + 1 }) })}
          >
            Next <ChevronRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </>
  );
}
