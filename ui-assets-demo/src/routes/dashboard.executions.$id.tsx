import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft } from "lucide-react";
import { api, REFETCH_INTERVAL } from "@/lib/api";
import { formatDuration, formatTimestamp } from "@/lib/format";
import { ExecStatusBadge } from "@/components/arcane/badges";
import { JsonViewer } from "@/components/arcane/json-viewer";
import { PageError } from "@/components/arcane/page-shell";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/dashboard/executions/$id")({
  head: () => ({
    meta: [
      { title: "Execution detail — Arcane" },
      { name: "description", content: "Inputs, outputs and audit trail for a single tool execution." },
      { property: "og:title", content: "Execution detail — Arcane" },
      { property: "og:description", content: "Inputs, outputs and audit trail for a single tool execution." },
    ],
  }),
  component: ExecutionDetail,
  errorComponent: ({ error }) => <PageError error={error} />,
  notFoundComponent: () => <p className="text-sm text-muted-foreground">Execution not found.</p>,
});

function ExecutionDetail() {
  const { id } = Route.useParams();
  const { data, isLoading } = useQuery({
    queryKey: ["execution", id],
    queryFn: () => api.getExecution(id),
    refetchInterval: REFETCH_INTERVAL,
  });

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-16 w-full" />
        <div className="grid gap-4 lg:grid-cols-2">
          <Skeleton className="h-64 w-full" />
          <Skeleton className="h-64 w-full" />
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-lg border border-border bg-card px-6 py-12 text-center">
        <p className="text-sm font-medium">Execution not found</p>
        <p className="mt-1 font-mono text-xs text-muted-foreground">{id}</p>
        <Link to="/dashboard/executions" search={{ status: "all", toolkit: "all", from: "", to: "", page: 1 }} className="mt-4 inline-block text-xs text-primary hover:underline">
          Back to executions
        </Link>
      </div>
    );
  }

  return (
    <>
      <Link
        to="/dashboard/executions"
        search={{ status: "all", toolkit: "all", from: "", to: "", page: 1 }}
        className="mb-4 inline-flex items-center gap-1.5 font-mono text-[11px] uppercase tracking-wider text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-3" /> Executions
      </Link>

      <div className="mb-5 rounded-lg border border-border bg-card p-4">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-mono text-base font-semibold text-foreground">{data.id}</h1>
          <ExecStatusBadge status={data.status} />
          <span className="font-mono text-xs text-muted-foreground">
            {data.toolkit_slug}.{data.tool_name}
          </span>
        </div>
        <dl className="mt-4 grid gap-4 text-xs sm:grid-cols-4">
          {[
            ["Started", formatTimestamp(data.created_at)],
            ["Finished", formatTimestamp(data.finished_at)],
            ["Duration", formatDuration(data.duration_ms)],
            ["Tenant", data.tenant],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">{label}</dt>
              <dd className="mt-1 font-mono text-foreground">{value}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <JsonViewer title="Input" value={data.input ?? null} />
        <JsonViewer title="Output" value={data.output ?? null} />
      </div>

      <div className="mt-6 rounded-lg border border-border bg-card">
        <div className="border-b border-border px-4 py-2.5">
          <h2 className="font-mono text-xs uppercase tracking-wider text-muted-foreground">Audit trail</h2>
        </div>
        <ol className="p-4">
          {(data.audit_trail ?? []).map((entry, i, arr) => (
            <li key={`${entry.at}-${i}`} className="relative flex gap-3 pb-5 last:pb-0">
              {i < arr.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-border" />}
              <span className="mt-1.5 size-2.5 shrink-0 rounded-full border border-primary bg-background" />
              <div className="min-w-0">
                <p className="font-mono text-xs text-foreground">{entry.event}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{entry.detail}</p>
                <p className="mt-1 font-mono text-[10px] text-muted-foreground">
                  {formatTimestamp(entry.at)} · {entry.actor}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}
