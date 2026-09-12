'use client';

import { useExecutions } from '@/hooks/use-executions';
import { useToolkits } from '@/hooks/use-toolkits';
import { useConnections } from '@/hooks/use-connections';
import { useTriggers } from '@/hooks/use-triggers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/executions/status-badge';
import { formatDate } from '@/lib/utils';
import Link from 'next/link';
import { Play, Wrench, Link2, Zap } from 'lucide-react';
import type { ExecutionStatus } from '@/types/api';

function StatCard({
  title,
  value,
  icon: Icon,
  href,
  loading,
}: {
  title: string;
  value: number | string;
  icon: React.ElementType;
  href: string;
  loading: boolean;
}) {
  return (
    <Link href={href}>
      <Card className="hover:border-primary/30 transition-colors cursor-pointer">
        <CardHeader className="flex flex-row items-center justify-between pb-2">
          <CardTitle className="text-sm font-medium text-muted-foreground">{title}</CardTitle>
          <Icon className="h-4 w-4 text-muted-foreground" />
        </CardHeader>
        <CardContent>
          {loading ? (
            <Spinner />
          ) : (
            <div className="text-2xl font-bold">{value}</div>
          )}
        </CardContent>
      </Card>
    </Link>
  );
}

export default function DashboardOverview() {
  const { data: execData, isLoading: execLoading } = useExecutions({ limit: 5 });
  const { data: tkData, isLoading: tkLoading } = useToolkits({ limit: 1 });
  const { data: connData, isLoading: connLoading } = useConnections({ limit: 1 });
  const { data: trigData, isLoading: trigLoading } = useTriggers({ limit: 1 });

  const recentExecutions = execData?.pages[0]?.data ?? [];
  const execCount = execData?.pages[0]?.data.length ?? 0;

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Overview</h1>
        <p className="text-muted-foreground text-sm mt-1">Your Arcane platform at a glance</p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Recent Executions"
          value={execCount}
          icon={Play}
          href="/dashboard/executions"
          loading={execLoading}
        />
        <StatCard
          title="Toolkits"
          value={tkData?.pages[0]?.data.length ?? 0}
          icon={Wrench}
          href="/dashboard/toolkits"
          loading={tkLoading}
        />
        <StatCard
          title="Connections"
          value={connData?.pages[0]?.data.length ?? 0}
          icon={Link2}
          href="/dashboard/connections"
          loading={connLoading}
        />
        <StatCard
          title="Triggers"
          value={trigData?.pages[0]?.data.length ?? 0}
          icon={Zap}
          href="/dashboard/triggers"
          loading={trigLoading}
        />
      </div>

      {/* Recent executions */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Recent Executions</CardTitle>
            <Link
              href="/dashboard/executions"
              className="text-sm text-primary hover:underline"
            >
              View all →
            </Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {execLoading ? (
            <div className="flex justify-center py-8">
              <Spinner className="h-6 w-6" />
            </div>
          ) : recentExecutions.length === 0 ? (
            <div className="py-8 text-center text-sm text-muted-foreground">
              No executions yet
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">ID</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Tool</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase">Created</th>
                </tr>
              </thead>
              <tbody>
                {recentExecutions.map((exec) => (
                  <tr key={exec.id} className="border-b border-border last:border-0 hover:bg-muted/30">
                    <td className="px-6 py-3">
                      <Link
                        href={`/dashboard/executions/${exec.id}`}
                        className="font-mono text-xs text-primary hover:underline"
                      >
                        {exec.id.slice(0, 12)}…
                      </Link>
                    </td>
                    <td className="px-6 py-3">
                      <StatusBadge status={exec.status as ExecutionStatus} />
                    </td>
                    <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                      {exec.tool_version_id.slice(0, 30)}
                    </td>
                    <td className="px-6 py-3 text-xs text-muted-foreground">
                      {formatDate(exec.created_at)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
