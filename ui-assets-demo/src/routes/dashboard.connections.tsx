import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, REFETCH_INTERVAL } from "@/lib/api";
import type { Connection } from "@/lib/types";
import { formatDate } from "@/lib/format";
import { DataTable, type Column } from "@/components/arcane/data-table";
import { StatusBadge } from "@/components/arcane/badges";
import { PageError, PageHeader } from "@/components/arcane/page-shell";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/dashboard/connections")({
  head: () => ({
    meta: [
      { title: "Connections — Arcane" },
      { name: "description", content: "Connected accounts authorising tool calls for each toolkit." },
      { property: "og:title", content: "Connections — Arcane" },
      { property: "og:description", content: "Connected accounts authorising tool calls for each toolkit." },
    ],
  }),
  component: ConnectionsPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function ConnectionsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.listConnections(),
    refetchInterval: REFETCH_INTERVAL,
  });

  const columns: Column<Connection>[] = [
    { key: "id", header: "Connection ID", sortable: true, sortValue: (r) => r.id, cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
    {
      key: "toolkit",
      header: "Toolkit",
      sortable: true,
      sortValue: (r) => r.toolkit_name,
      cell: (r) => (
        <span className="flex items-center gap-2 text-xs text-foreground">
          <span className="text-sm">{r.toolkit_icon}</span>
          {r.toolkit_name}
        </span>
      ),
    },
    {
      key: "account",
      header: "Connected account",
      sortable: true,
      sortValue: (r) => r.account_label,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.account_label}</span>,
    },
    { key: "status", header: "Status", sortable: true, sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "created",
      header: "Created",
      sortable: true,
      sortValue: (r) => r.created_at,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Connections"
        description="Authorised accounts that Arcane uses when executing tools."
        action={
          <Button size="sm" onClick={() => toast("Connection flow coming soon")}>
            <Plus className="size-3.5" /> Add Connection
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No connections yet"
        emptyDescription="Connect an account to let agents call tools on your behalf."
      />
    </>
  );
}
