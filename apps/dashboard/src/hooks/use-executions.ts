'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { executionsApi } from '@/lib/api';

export function useExecutions(params?: { limit?: number; status?: string }) {
  return useInfiniteQuery({
    queryKey: ['executions', params],
    queryFn: ({ pageParam }) =>
      executionsApi.list({
        ...params,
        limit: params?.limit ?? 25,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export function useExecution(id: string) {
  return useQuery({
    queryKey: ['execution', id],
    queryFn: () => executionsApi.get(id),
    enabled: !!id,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (!status) return false;
      const terminal = new Set(['SUCCEEDED', 'FAILED', 'REJECTED', 'TIMED_OUT']);
      return terminal.has(status) ? false : 2000;
    },
  });
}

export function useExecutionAudit(executionId: string) {
  return useQuery({
    queryKey: ['execution-audit', executionId],
    queryFn: () => executionsApi.getAuditEvents(executionId),
    enabled: !!executionId,
  });
}
