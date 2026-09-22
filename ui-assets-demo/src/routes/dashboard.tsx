import { useState } from "react";
import { Outlet, createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";
import { AppSidebar } from "@/components/arcane/app-sidebar";
import { USING_MOCK_DATA } from "@/lib/api";
import { useIsMobile } from "@/hooks/use-mobile";

export const Route = createFileRoute("/dashboard")({
  component: DashboardLayout,
});

const LABELS: Record<string, string> = {
  dashboard: "Overview",
  executions: "Executions",
  toolkits: "Toolkits",
  connections: "Connections",
  triggers: "Triggers",
};

function DashboardLayout() {
  const [expanded, setExpanded] = useState(true);
  const isMobile = useIsMobile();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const segments = pathname.split("/").filter(Boolean);

  return (
    <div className="flex min-h-screen w-full bg-background">
      <AppSidebar expanded={!isMobile && expanded} onToggle={() => setExpanded((v) => !v)} />
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-10 flex h-14 items-center gap-2 border-b border-border bg-background/95 px-6 backdrop-blur">
          <nav className="flex min-w-0 items-center gap-1.5 font-mono text-xs text-muted-foreground">
            {segments.map((seg, i) => {
              const isLast = i === segments.length - 1;
              const label = LABELS[seg] ?? seg;
              return (
                <span key={`${seg}-${i}`} className="flex min-w-0 items-center gap-1.5">
                  {i > 0 && <ChevronRight className="size-3 shrink-0 opacity-50" />}
                  {isLast ? (
                    <span className="truncate text-foreground">{label}</span>
                  ) : (
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ to: `/${segments.slice(0, i + 1).join("/")}` } as never)
                      }
                      className="truncate transition-colors hover:text-foreground"
                    >
                      {label}
                    </button>
                  )}
                </span>
              );
            })}
          </nav>
          {USING_MOCK_DATA && (
            <span className="ml-auto inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/5 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wider text-primary">
              <span className="size-1.5 rounded-full bg-primary motion-pulse" /> sample data
            </span>
          )}
        </header>
        <main className="flex-1 overflow-y-auto p-4 sm:p-6">
          <div className="mx-auto w-full max-w-[1400px]">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
