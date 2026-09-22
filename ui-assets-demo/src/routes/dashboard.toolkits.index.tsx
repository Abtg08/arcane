import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { api, REFETCH_INTERVAL } from "@/lib/api";
import { CategoryBadge, StatusBadge } from "@/components/arcane/badges";
import { PageError, PageHeader } from "@/components/arcane/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard/toolkits/")({
  head: () => ({
    meta: [
      { title: "Toolkits — Arcane" },
      { name: "description", content: "Installed toolkits and the tools each one exposes to your agents." },
      { property: "og:title", content: "Toolkits — Arcane" },
      { property: "og:description", content: "Installed toolkits and the tools each one exposes to your agents." },
    ],
  }),
  component: ToolkitsPage,
  errorComponent: ({ error }) => <PageError error={error} />,
});

function ToolkitsPage() {
  const { data, isLoading } = useQuery({
    queryKey: ["toolkits"],
    queryFn: () => api.listToolkits(),
    refetchInterval: REFETCH_INTERVAL,
  });

  const toolkits = data?.data ?? [];

  return (
    <>
      <PageHeader title="Toolkits" description="Every integration available to agents on this workspace." />

      {isLoading ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : toolkits.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border px-6 py-16 text-center">
          <p className="text-sm font-medium">No toolkits installed</p>
          <p className="mt-1 text-xs text-muted-foreground">Install a toolkit to give your agents tools to call.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {toolkits.map((tk) => (
            <Link
              key={tk.slug}
              to="/dashboard/toolkits/$slug"
              params={{ slug: tk.slug }}
              className="group rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-accent/30"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="flex size-9 items-center justify-center rounded-md border border-border bg-[var(--surface-sunken)] text-base">
                    {tk.icon}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-foreground">{tk.name}</p>
                    <p className="font-mono text-[10px] text-muted-foreground">{tk.slug}</p>
                  </div>
                </div>
                <StatusBadge status={tk.status} />
              </div>
              <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{tk.description}</p>
              <div className="mt-3 flex items-center justify-between">
                <CategoryBadge category={tk.category} />
                <span className="font-mono text-[11px] text-muted-foreground">{tk.tool_count} tools</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
