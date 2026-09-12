'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { triggersApi } from '@/lib/api';

export function useTriggers(params?: { limit?: number; status?: string }) {
  return useInfiniteQuery({
    queryKey: ['triggers', params],
    queryFn: ({ pageParam }) =>
      triggersApi.list({
        limit: params?.limit ?? 20,
        ...(params?.status !== undefined ? { status: params.status } : {}),
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}
