'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import { connectionsApi } from '@/lib/api';

export function useConnections(params?: { limit?: number }) {
  return useInfiniteQuery({
    queryKey: ['connections', params],
    queryFn: ({ pageParam }) =>
      connectionsApi.list({
        limit: params?.limit ?? 20,
        cursor: pageParam as string | undefined,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.next_cursor ?? undefined,
  });
}
