import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowUpRight } from "lucide-react";
import { api, REFETCH_INTERVAL } from "@/lib/api";
import type { Execution } from "@/lib/types";
import { formatDuration, formatTimestamp } from "@/lib/format";
import { DataTable, type Column } from "@/components/arcane/data-table";
import { ExecStatusBadge } from "@/components/arcane/badges";
import { PageError, PageHeader, StatCard } from "@/components/arcane/page-shell";

export const Route = createFileRoute("/dashboard/")({
  head: () => ({
    meta: [
      { title: "Overview — Arcane" },
      { name: "description", content: "Execution volume, connections, toolkits and triggers at a glance." },
      { property: "og:title", content: "Overview — Arcane" },
      { property: "og:description", content: "Execution volume, connections, toolkits and triggers at a glance." },
    ],
  }),
  component: OverviewPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function OverviewPage() {
  const navigate = useNavigate();
  const executions = useQuery({
    queryKey: ["executions", {}],
    queryFn: () => api.listExecutions(),
    refetchInterval: REFETCH_INTERVAL,
  });
  const connections = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.listConnections(),
    refetchInterval: REFETCH_INTERVAL,
  });
  const toolkits = useQuery({
    queryKey: ["toolkits"],
    queryFn: () => api.listToolkits(),
    refetchInterval: REFETCH_INTERVAL,
  });
  const triggers = useQuery({
    queryKey: ["triggers"],
    queryFn: () => api.listTriggers(),
    refetchInterval: REFETCH_INTERVAL,
  });

  const rows = (executions.data?.data ?? []).slice(0, 10);
  const activeConnections = (connections.data?.data ?? []).filter((c) => c.status === "ACTIVE").length;
  const activeTriggers = (triggers.data?.data ?? []).filter((t) => t.status === "ACTIVE").length;

  const columns: Column<Execution>[] = [
    {
      key: "id",
      header: "Execution",
      sortable: true,
      sortValue: (r) => r.id,
      cell: (r) => <span className="font-mono text-xs text-foreground">{r.id}</span>,
    },
    {
      key: "tool",
      header: "Tool",
      sortable: true,
      sortValue: (r) => r.tool_name,
      cell: (r) => (
        <span className="font-mono text-xs">
          <span className="text-muted-foreground">{r.toolkit_slug}.</span>
          {r.tool_name}
        </span>
      ),
    },
    { key: "status", header: "Status", sortable: true, sortValue: (r) => r.status, cell: (r) => <ExecStatusBadge status={r.status} /> },
    {
      key: "duration",
      header: "Duration",
      sortable: true,
      sortValue: (r) => r.duration_ms,
      cell: (r) => <span className="font-mono text-xs tabular-nums text-muted-foreground">{formatDuration(r.duration_ms)}</span>,
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
      <PageHeader title="Overview" description="Live view of tool execution across every tenant." />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="flame" label="Total Executions" value={executions.data?.data.length ?? 0} trend={12} hint="Last 30 days" loading={executions.isLoading} />
        <StatCard tone="amber" label="Active Connections" value={activeConnections} trend={4} hint={`${connections.data?.data.length ?? 0} total`} loading={connections.isLoading} />
        <StatCard tone="copper" label="Toolkits" value={toolkits.data?.data.length ?? 0} trend={0} hint="Installed" loading={toolkits.isLoading} />
        <StatCard tone="ember" label="Triggers" value={activeTriggers} trend={-2} hint={`${triggers.data?.data.length ?? 0} configured`} loading={triggers.isLoading} />
      </div>

      <div className="mt-6 mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-foreground">Recent Executions</h2>
        <Link
          to="/dashboard/executions"
        search={{ status: "all", toolkit: "all", from: "", to: "", page: 1 }}
          className="inline-flex items-center gap-1 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
        >
          View all <ArrowUpRight className="size-3" />
        </Link>
      </div>

      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(r) => r.id}
        loading={executions.isLoading}
        skeletonRows={6}
        emptyTitle="No executions yet"
        emptyDescription="Once an agent calls a tool, its run will show up here within seconds."
        onRowClick={(r) => navigate({ to: "/dashboard/executions/$id", params: { id: r.id } })}
      />
    </>
  );
}
