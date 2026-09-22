import type { ReactNode } from "react";
import { useRouter } from "@tanstack/react-router";
import { AlertTriangle, RotateCw, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-foreground">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageError({ error }: { error: Error }) {
  const router = useRouter();
  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-3 rounded-lg border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <AlertTriangle className="size-6 text-destructive" />
      <p className="text-sm font-medium text-foreground">This page failed to load</p>
      <p className="font-mono text-xs text-muted-foreground">{error.message}</p>
      <button
        type="button"
        onClick={() => router.invalidate()}
        className="mt-2 inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
      >
        <RotateCw className="size-3.5" />
        Retry
      </button>
    </div>
  );
}

export function StatCard({
  label,
  value,
  trend,
  hint,
  loading,
  tone = "flame",
}: {
  label: string;
  value: string | number;
  trend?: number;
  hint?: string;
  loading?: boolean;
  tone?: "ember" | "flame" | "amber" | "copper";
}) {
  const up = (trend ?? 0) >= 0;
  return (
    <div className={cn("kpi-card group relative overflow-hidden rounded-lg border border-border bg-card p-4", `tone-${tone}`)}>
      <span className="kpi-trace" aria-hidden="true" />
      <p className="kpi-label relative font-mono text-[10px] uppercase tracking-wider text-muted-foreground transition-colors duration-300">{label}</p>
      <div className="relative mt-2 flex items-baseline gap-2">
        <span className="font-mono text-2xl font-semibold tabular-nums text-foreground">
          {loading ? "—" : value}
        </span>
        {trend !== undefined && !loading && (
          <span
            className={cn(
              "inline-flex items-center gap-0.5 font-mono text-[11px]",
              "kpi-accent",
            )}
          >
            {up ? <TrendingUp className="size-3" /> : <TrendingDown className="size-3" />}
            {up ? "+" : ""}
            {trend}%
          </span>
        )}
      </div>
      {hint && <p className="relative mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
