import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { api, REFETCH_INTERVAL } from "@/lib/api";
import type { ListResponse, Trigger } from "@/lib/types";
import { formatDate, formatTimestamp } from "@/lib/format";
import { DataTable, type Column } from "@/components/arcane/data-table";
import { StatusBadge } from "@/components/arcane/badges";
import { PageError, PageHeader } from "@/components/arcane/page-shell";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";

export const Route = createFileRoute("/dashboard/triggers")({
  head: () => ({
    meta: [
      { title: "Triggers — Arcane" },
      { name: "description", content: "Event subscriptions that start agent runs automatically." },
      { property: "og:title", content: "Triggers — Arcane" },
      { property: "og:description", content: "Event subscriptions that start agent runs automatically." },
    ],
  }),
  component: TriggersPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function TriggersPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["triggers"],
    queryFn: () => api.listTriggers(),
    refetchInterval: REFETCH_INTERVAL,
  });

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: Trigger["status"] }) =>
      api.setTriggerStatus(id, status),
    onMutate: async ({ id, status }) => {
      await queryClient.cancelQueries({ queryKey: ["triggers"] });
      const previous = queryClient.getQueryData<ListResponse<Trigger>>(["triggers"]);
      queryClient.setQueryData<ListResponse<Trigger>>(["triggers"], (old) =>
        old ? { ...old, data: old.data.map((t) => (t.id === id ? { ...t, status } : t)) } : old,
      );
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(["triggers"], ctx.previous);
      toast.error("Could not update the trigger");
    },
    onSuccess: (_d, vars) => {
      toast.success(vars.status === "ACTIVE" ? "Trigger enabled" : "Trigger paused");
    },
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["triggers"] }),
  });

  const columns: Column<Trigger>[] = [
    { key: "id", header: "Trigger ID", sortable: true, sortValue: (r) => r.id, cell: (r) => <span className="font-mono text-xs">{r.id}</span> },
    { key: "name", header: "Name", sortable: true, sortValue: (r) => r.name, cell: (r) => <span className="text-xs text-foreground">{r.name}</span> },
    {
      key: "toolkit",
      header: "Toolkit",
      sortable: true,
      sortValue: (r) => r.toolkit_name,
      cell: (r) => <span className="text-xs text-muted-foreground">{r.toolkit_name}</span>,
    },
    {
      key: "event",
      header: "Event type",
      sortable: true,
      sortValue: (r) => r.event_type,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{r.event_type}</span>,
    },
    { key: "status", header: "Status", sortable: true, sortValue: (r) => r.status, cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "fired",
      header: "Last fired",
      sortable: true,
      sortValue: (r) => r.last_fired_at ?? "",
      cell: (r) => (
        <span className="font-mono text-xs text-muted-foreground">
          {r.last_fired_at ? formatTimestamp(r.last_fired_at) : "Never"}
        </span>
      ),
    },
    {
      key: "created",
      header: "Created",
      sortable: true,
      sortValue: (r) => r.created_at,
      cell: (r) => <span className="font-mono text-xs text-muted-foreground">{formatDate(r.created_at)}</span>,
    },
    {
      key: "toggle",
      header: "Enabled",
      className: "w-[90px]",
      cell: (r) => (
        <Switch
          checked={r.status === "ACTIVE"}
          onCheckedChange={(checked) =>
            toggle.mutate({ id: r.id, status: checked ? "ACTIVE" : "PAUSED" })
          }
          aria-label={`Toggle ${r.name}`}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Triggers"
        description="Upstream events that kick off tool executions automatically."
        action={
          <Button size="sm" onClick={() => toast("Trigger builder coming soon")}>
            <Plus className="size-3.5" /> New Trigger
          </Button>
        }
      />
      <DataTable
        columns={columns}
        rows={data?.data ?? []}
        rowKey={(r) => r.id}
        loading={isLoading}
        emptyTitle="No triggers configured"
        emptyDescription="Create a trigger to run tools when something happens upstream."
      />
    </>
  );
}
