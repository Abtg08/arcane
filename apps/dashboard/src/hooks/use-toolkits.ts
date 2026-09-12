'use client';

import { useQuery, useInfiniteQuery } from '@tanstack/react-query';
import { toolkitsApi } from '@/lib/api';

export function useToolkits(params?: { q?: string; limit?: number }) {
  return useInfiniteQuery({
    queryKey: ['toolkits', params],
    queryFn: ({ pageParam }) =>
      toolkitsApi.list({
        ...params,
        limit: params?.limit ?? 20,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}

export function useTools(toolkit: string, params?: { limit?: number }) {
  return useQuery({
    queryKey: ['tools', toolkit, params],
    queryFn: () => toolkitsApi.getTools(toolkit, params),
    enabled: !!toolkit,
  });
}

export function useTool(toolkit: string, tool: string) {
  return useQuery({
    queryKey: ['tool', toolkit, tool],
    queryFn: () => toolkitsApi.getTool(toolkit, tool),
    enabled: !!(toolkit && tool),
  });
}
