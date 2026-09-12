'use client';

import { useConnections } from '@/hooks/use-connections';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import type { Connection } from '@/types/api';

const STATUS_VARIANT: Record<Connection['status'], 'success' | 'warning' | 'destructive' | 'muted'> = {
  ACTIVE: 'success',
  PENDING: 'warning',
  EXPIRED: 'destructive',
  REVOKED: 'muted',
};

export default function ConnectionsPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useConnections({ limit: 25 });

  const connections = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Connections</h1>
        <p className="text-muted-foreground text-sm mt-1">OAuth and API key connections to external providers</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{connections.length} connection{connections.length !== 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-6 w-6" />
            </div>
          ) : connections.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No connections yet
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">ID</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">External User</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Last Used</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.map((conn) => (
                      <tr key={conn.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-3 font-mono text-xs">{conn.id.slice(0, 16)}…</td>
                        <td className="px-6 py-3">
                          <Badge variant={STATUS_VARIANT[conn.status]}>{conn.status}</Badge>
                        </td>
                        <td className="px-6 py-3 text-xs text-muted-foreground font-mono">{conn.external_user_id}</td>
                        <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(conn.created_at)}</td>
                        <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(conn.last_used_at)}</td>
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
                    {isFetchingNextPage ? <Spinner className="mr-2" /> : <ChevronDown className="mr-2 h-4 w-4" />}
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
