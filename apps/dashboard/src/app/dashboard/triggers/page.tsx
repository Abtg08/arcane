'use client';

export const dynamic = 'force-dynamic';

import { useTriggers } from '@/hooks/use-triggers';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { formatDate } from '@/lib/utils';
import { ChevronDown } from 'lucide-react';
import type { Trigger } from '@/types/api';

const STATUS_VARIANT: Record<Trigger['status'], 'success' | 'warning' | 'muted'> = {
  ACTIVE: 'success',
  PAUSED: 'warning',
  DELETED: 'muted',
};

export default function TriggersPage() {
  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useTriggers({ limit: 25 });

  const triggers = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Triggers</h1>
        <p className="text-muted-foreground text-sm mt-1">Event triggers and webhook subscriptions</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{triggers.length} trigger{triggers.length !== 1 ? 's' : ''}</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-6 w-6" />
            </div>
          ) : triggers.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No triggers configured
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Name</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Slug</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Provider</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Status</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wider">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {triggers.map((trigger) => (
                      <tr key={trigger.id} className="border-b border-border last:border-0 hover:bg-muted/30 transition-colors">
                        <td className="px-6 py-3">
                          <div className="font-medium text-sm">{trigger.name}</div>
                          {trigger.description && (
                            <div className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{trigger.description}</div>
                          )}
                        </td>
                        <td className="px-6 py-3 font-mono text-xs text-muted-foreground">{trigger.slug}</td>
                        <td className="px-6 py-3 text-xs text-muted-foreground">{trigger.provider}</td>
                        <td className="px-6 py-3">
                          <Badge variant={STATUS_VARIANT[trigger.status]}>{trigger.status}</Badge>
                        </td>
                        <td className="px-6 py-3 text-xs text-muted-foreground whitespace-nowrap">{formatDate(trigger.created_at)}</td>
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
