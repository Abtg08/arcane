import { Link, useRouterState } from "@tanstack/react-router";
import {
  Activity,
  Blocks,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Plug,
  Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { BrandLogo } from "@/components/arcane/brand-logo";

const EXEC_SEARCH = { status: "all", toolkit: "all", from: "", to: "", page: 1 } as const;

const NAV = [
  { to: "/dashboard", label: "Overview", icon: LayoutDashboard, exact: true, search: {} },
  { to: "/dashboard/executions", label: "Executions", icon: Activity, exact: false, search: EXEC_SEARCH },
  { to: "/dashboard/toolkits", label: "Toolkits", icon: Blocks, exact: false, search: {} },
  { to: "/dashboard/connections", label: "Connections", icon: Plug, exact: false, search: {} },
  { to: "/dashboard/triggers", label: "Triggers", icon: Zap, exact: false, search: {} },
] as const;

export function AppSidebar({
  expanded,
  onToggle,
}: {
  expanded: boolean;
  onToggle: () => void;
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <aside
      className={cn(
        "sticky top-0 flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200",
        expanded ? "w-[220px]" : "w-14",
      )}
    >
      <div className="flex h-14 items-center overflow-hidden border-b border-sidebar-border px-3">
        <Link to="/" aria-label="Arcane home" title="Go to landing page">
          <BrandLogo compact={!expanded} />
        </Link>
      </div>

      <nav className="flex flex-1 flex-col gap-1 p-2">
        {NAV.map((item) => {
          const active = item.exact ? pathname === item.to : pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              search={item.search as never}
              title={item.label}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm transition-colors",
                active
                  ? "bg-primary/10 text-primary shadow-[inset_2px_0_0_var(--primary)]"
                  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
                !expanded && "justify-center px-0",
              )}
            >
              <item.icon className="size-4 shrink-0" />
              {expanded && <span className="truncate">{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2">
        <button
          type="button"
          onClick={onToggle}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-md px-2.5 py-2 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
            !expanded && "justify-center px-0",
          )}
        >
          {expanded ? <PanelLeftClose className="size-4" /> : <PanelLeftOpen className="size-4" />}
          {expanded && <span>Collapse</span>}
        </button>
        <p
          className={cn(
            "mt-1 px-2.5 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground",
            !expanded && "text-center px-0",
          )}
        >
          {expanded ? "v0.1.0" : "v0.1"}
        </p>
      </div>
    </aside>
  );
}
