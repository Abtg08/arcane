'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useExecutions } from '@/hooks/use-executions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/executions/status-badge';
import { formatDate } from '@/lib/utils';
import type { ExecutionStatus } from '@/types/api';
import { ChevronDown } from 'lucide-react';

const STATUS_FILTERS = ['All', 'SUCCEEDED', 'FAILED', 'RUNNING', 'PENDING', 'REJECTED', 'TIMED_OUT'] as const;

export default function ExecutionsPage() {
  const [statusFilter, setStatusFilter] = useState<string>('All');
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useExecutions({
    limit: 25,
    status: statusFilter === 'All' ? undefined : statusFilter,
  });

  const executions = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Executions</h1>
          <p className="text-muted-foreground text-sm mt-1">Tool execution history</p>
        </div>
      </div>

      {/* Status filter chips */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition-colors ${
              statusFilter === s
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/70'
            }`}
          >
            {s}
          </button>
        ))}
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">
            {executions.length} execution{executions.length !== 1 ? 's' : ''}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-6 w-6" />
            </div>
          ) : executions.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No executions found
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Tool Version</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Connection</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {executions.map((exec) => (
                      <tr
                        key={exec.id}
                        className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors"
                      >
                        <td className="px-6 py-3">
                          <Link
                            href={`/dashboard/executions/${exec.id}`}
                            className="font-mono text-xs text-primary hover:underline"
                          >
                            {exec.id.slice(0, 16)}…
                          </Link>
                        </td>
                        <td className="px-6 py-3">
                          <StatusBadge status={exec.status as ExecutionStatus} />
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-muted-foreground max-w-[200px] truncate">
                          {exec.tool_version_id}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-muted-foreground">
                          {exec.connection_id.slice(0, 16)}…
                        </td>
                        <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">
                          {formatDate(exec.created_at)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {hasNextPage && (
                <div className="flex justify-center py-4">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void fetchNextPage()}
                    disabled={isFetchingNextPage}
                  >
                    {isFetchingNextPage ? (
                      <Spinner className="mr-2" />
                    ) : (
                      <ChevronDown className="mr-2 h-4 w-4" />
                    )}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
