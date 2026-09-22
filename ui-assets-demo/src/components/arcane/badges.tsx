import { cn } from "@/lib/utils";
import type { ExecStatus, RiskLevel, Status } from "@/lib/types";

const pill =
  "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-medium uppercase tracking-wider";

const tones = {
  green: "border-success/30 bg-success/10 text-success",
  red: "border-destructive/30 bg-destructive/10 text-destructive",
  yellow: "border-warning/30 bg-warning/10 text-warning",
  gray: "border-border bg-muted/40 text-muted-foreground",
  blue: "border-info/30 bg-info/10 text-info",
} as const;

type Tone = keyof typeof tones;

function Pill({ tone, label, dot = true }: { tone: Tone; label: string; dot?: boolean }) {
  return (
    <span className={cn(pill, tones[tone])}>
      {dot && <span className={cn("size-1.5 rounded-full bg-current", tone === "yellow" && "animate-pulse")} />}
      {label}
    </span>
  );
}

const execTone: Record<ExecStatus, Tone> = {
  SUCCESS: "green",
  FAILED: "red",
  RUNNING: "yellow",
  PENDING: "gray",
};

const statusTone: Record<Status, Tone> = {
  ACTIVE: "green",
  PAUSED: "yellow",
  INACTIVE: "gray",
};

const riskTone: Record<RiskLevel, Tone> = {
  READ_ONLY: "blue",
  WRITE: "yellow",
  DESTRUCTIVE: "red",
};

export function ExecStatusBadge({ status }: { status: ExecStatus }) {
  return <Pill tone={execTone[status]} label={status} />;
}

export function StatusBadge({ status }: { status: Status }) {
  return <Pill tone={statusTone[status]} label={status} />;
}

export function RiskBadge({ risk }: { risk: RiskLevel }) {
  return <Pill tone={riskTone[risk]} label={risk.replace("_", " ")} dot={false} />;
}

export function CategoryBadge({ category }: { category: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border bg-muted/30 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
      {category}
    </span>
  );
}
