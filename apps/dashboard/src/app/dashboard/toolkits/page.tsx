'use client';

import { useState, useCallback } from 'react';
import { useToolkits, useTools } from '@/hooks/use-toolkits';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, Search, Wrench, ChevronRight } from 'lucide-react';
import type { Toolkit } from '@/types/api';

function ToolkitRow({ toolkit }: { toolkit: Toolkit }) {
  const [open, setOpen] = useState(false);
  const { data, isLoading } = useTools(toolkit.slug, { limit: 20 });
  const tools = data?.data ?? [];

  return (
    <div className="border-b border-border last:border-0">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-4 px-6 py-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm">{toolkit.name}</span>
            <Badge variant={toolkit.status === 'ACTIVE' ? 'success' : 'muted'} className="text-xs">
              {toolkit.status}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            {toolkit.slug} · {toolkit.provider}
          </p>
          {toolkit.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-1">{toolkit.description}</p>
          )}
        </div>
        <ChevronRight
          className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${open ? 'rotate-90' : ''}`}
        />
      </button>

      {open && (
        <div className="border-t border-border bg-muted/20 px-6 py-3">
          {isLoading ? (
            <Spinner className="my-2" />
          ) : tools.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2">No tools</p>
          ) : (
            <ul className="space-y-1">
              {tools.map((tool) => (
                <li key={tool.id} className="flex items-center gap-2 py-1 text-xs">
                  <Wrench className="h-3 w-3 text-muted-foreground shrink-0" />
                  <span className="font-mono font-medium">{tool.slug}</span>
                  <span className="text-muted-foreground">—</span>
                  <span className="text-muted-foreground truncate">{tool.name}</span>
                  <Badge variant={tool.status === 'PUBLISHED' ? 'success' : 'muted'} className="ml-auto shrink-0">
                    {tool.status}
                  </Badge>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

export default function ToolkitsPage() {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const handleSearch = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setQuery(e.target.value);
    // Simple debounce without external deps
    const timer = setTimeout(() => setDebouncedQuery(e.target.value), 300);
    return () => clearTimeout(timer);
  }, []);

  const { data, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } = useToolkits({
    q: debouncedQuery || undefined,
    limit: 20,
  });

  const toolkits = data?.pages.flatMap((p) => p.data) ?? [];

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Toolkits</h1>
        <p className="text-muted-foreground text-sm mt-1">Available tool collections</p>
      </div>

      {/* Search */}
      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search toolkits…"
          value={query}
          onChange={handleSearch}
          className="w-full rounded-md border border-input bg-background pl-9 pr-4 py-2 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
        />
      </div>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">{toolkits.length} toolkit{toolkits.length !== 1 ? 's' : ''}</CardTitle>
          <CardDescription>Click a toolkit to expand its tools</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="flex justify-center py-12">
              <Spinner className="h-6 w-6" />
            </div>
          ) : toolkits.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No toolkits found
            </div>
          ) : (
            <>
              <div>
                {toolkits.map((tk) => (
                  <ToolkitRow key={tk.id} toolkit={tk} />
                ))}
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
