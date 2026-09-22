import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api, REFETCH_INTERVAL } from "@/lib/api";
import type { Tool } from "@/lib/types";
import { CategoryBadge, RiskBadge, StatusBadge } from "@/components/arcane/badges";
import { DataTable, type Column } from "@/components/arcane/data-table";
import { PageError } from "@/components/arcane/page-shell";

export const Route = createFileRoute("/dashboard/toolkits/$slug")({
  head: () => ({
    meta: [
      { title: "Toolkit detail — Arcane" },
      { name: "description", content: "Tools exposed by this toolkit and their risk levels." },
      { property: "og:title", content: "Toolkit detail — Arcane" },
      { property: "og:description", content: "Tools exposed by this toolkit and their risk levels." },
    ],
  }),
  component: ToolkitDetail,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function ToolkitDetail() {
  const { slug } = Route.useParams();
  const toolkit = useQuery({ queryKey: ["toolkit", slug], queryFn: () => api.getToolkit(slug) });
  const tools = useQuery({
    queryKey: ["tools", slug],
    queryFn: () => api.listTools(slug),
    refetchInterval: REFETCH_INTERVAL,
  });

  const columns: Column<Tool>[] = [
    {
      key: "name",
      header: "Tool",
      sortable: true,
      sortValue: (r) => r.name,
      cell: (r) => <span className="font-mono text-xs text-foreground">{r.name}</span>,
    },
    { key: "desc", header: "Description", cell: (r) => <span className="text-xs text-muted-foreground">{r.description}</span> },
    {
      key: "risk",
      header: "Risk",
      sortable: true,
      sortValue: (r) => r.risk_level,
      className: "w-[140px]",
      cell: (r) => <RiskBadge risk={r.risk_level} />,
    },
  ];

  return (
    <>
      <Link
        to="/dashboard/toolkits"
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Toolkits
      </Link>

      <div className="mb-5 flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card p-4">
        <span className="flex size-10 items-center justify-center rounded-md border border-border bg-[var(--surface-sunken)] text-lg">
          {toolkit.data?.icon ?? "🧩"}
        </span>
        <div className="min-w-0">
          <h1 className="text-base font-semibold text-foreground">{toolkit.data?.name ?? slug}</h1>
          <p className="text-xs text-muted-foreground">{toolkit.data?.description}</p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {toolkit.data && <CategoryBadge category={toolkit.data.category} />}
          {toolkit.data && <StatusBadge status={toolkit.data.status} />}
        </div>
      </div>

      <DataTable
        columns={columns}
        rows={tools.data?.data ?? []}
        rowKey={(r) => r.slug}
        loading={tools.isLoading}
        skeletonRows={5}
        emptyTitle="No tools exposed"
        emptyDescription="This toolkit has not published any callable tools yet."
      />
    </>
  );
}
