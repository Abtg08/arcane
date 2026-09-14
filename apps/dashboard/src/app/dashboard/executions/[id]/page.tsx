'use client';

export const dynamic = 'force-dynamic';

import { use } from 'react';
import Link from 'next/link';
import { useExecution, useExecutionAudit } from '@/hooks/use-executions';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge } from '@/components/executions/status-badge';
import { formatDate, formatDuration } from '@/lib/utils';
import type { ExecutionStatus } from '@/types/api';
import { ChevronLeft, Clock, Cpu, Link2, AlertCircle, CheckCircle2, XCircle } from 'lucide-react';

function JsonBlock({ data }: { data: unknown }) {
  return (
    <pre className="overflow-x-auto rounded-md bg-muted p-4 text-xs font-mono text-foreground whitespace-pre-wrap break-words">
      {JSON.stringify(data, null, 2)}
    </pre>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex gap-4 py-2 border-b border-border last:border-0">
      <dt className="w-32 shrink-0 text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground flex-1 min-w-0">{value}</dd>
    </div>
  );
}

function TimelineIcon({ eventType }: { eventType: string }) {
  if (eventType.includes('COMPLETED') || eventType.includes('SUCCEEDED')) {
    return <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0" />;
  }
  if (eventType.includes('FAILED') || eventType.includes('ERROR') || eventType.includes('REJECTED')) {
    return <XCircle className="h-4 w-4 text-destructive shrink-0" />;
  }
  return <Clock className="h-4 w-4 text-muted-foreground shrink-0" />;
}

export default function ExecutionInspectorPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const { data: exec, isLoading, error } = useExecution(id);
  const { data: auditData } = useExecutionAudit(id);

  const auditEvents = auditData?.data ?? [];

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Spinner className="h-8 w-8" />
      </div>
    );
  }

  if (error || !exec) {
    return (
      <div className="p-6">
        <div className="flex items-center gap-2 text-destructive">
          <AlertCircle className="h-5 w-5" />
          <p className="font-medium">
            {error instanceof Error ? error.message : 'Execution not found'}
          </p>
        </div>
      </div>
    );
  }

  const status = exec.status as ExecutionStatus;
  const isTerminal = ['SUCCEEDED', 'FAILED', 'REJECTED', 'TIMED_OUT'].includes(status);

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard/executions" className="flex items-center gap-1 hover:text-foreground transition-colors">
          <ChevronLeft className="h-4 w-4" />
          Executions
        </Link>
        <span>/</span>
        <span className="font-mono text-xs">{exec.id}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold font-mono">{exec.id}</h1>
          <p className="text-sm text-muted-foreground mt-1">{formatDate(exec.created_at)}</p>
        </div>
        <div className="flex items-center gap-3">
          {!isTerminal && <Spinner className="h-4 w-4 text-primary" />}
          <StatusBadge status={status} />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* Details */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Cpu className="h-4 w-4" />
              Details
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl>
              <DetailRow label="Tool Version" value={
                <span className="font-mono text-xs break-all">{exec.tool_version_id}</span>
              } />
              <DetailRow label="Connection" value={
                <span className="font-mono text-xs break-all">{exec.connection_id}</span>
              } />
              <DetailRow label="Started" value={formatDate(exec.started_at)} />
              <DetailRow label="Completed" value={formatDate(exec.completed_at)} />
              <DetailRow label="Duration" value={formatDuration(exec.started_at, exec.completed_at)} />
              {exec.error && (
                <DetailRow label="Error" value={
                  <span className="text-destructive break-all">{exec.error}</span>
                } />
              )}
            </dl>
          </CardContent>
        </Card>

        {/* Timeline */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="h-4 w-4" />
              Audit Timeline
            </CardTitle>
          </CardHeader>
          <CardContent>
            {auditEvents.length === 0 ? (
              <p className="text-sm text-muted-foreground">No audit events</p>
            ) : (
              <ol className="relative border-l border-border ml-2 space-y-4">
                {auditEvents.map((event) => (
                  <li key={event.id} className="ml-4">
                    <div className="absolute -left-[9px] mt-0.5">
                      <TimelineIcon eventType={event.event_type} />
                    </div>
                    <div>
                      <p className="text-xs font-semibold text-foreground">{event.event_type}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(event.created_at)}</p>
                      {Object.keys(event.metadata).length > 0 && (
                        <details className="mt-1">
                          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                            Metadata
                          </summary>
                          <pre className="mt-1 text-xs font-mono text-muted-foreground whitespace-pre-wrap">
                            {JSON.stringify(event.metadata, null, 2)}
                          </pre>
                        </details>
                      )}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Input / Output */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Input</CardTitle>
          </CardHeader>
          <CardContent>
            <JsonBlock data={exec.input} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Output</CardTitle>
          </CardHeader>
          <CardContent>
            {exec.output ? (
              <JsonBlock data={exec.output} />
            ) : (
              <p className="text-sm text-muted-foreground">
                {isTerminal ? 'No output' : 'Awaiting completion…'}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Connection link */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Link2 className="h-4 w-4" />
            Connection
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Link
            href="/dashboard/connections"
            className="font-mono text-xs text-primary hover:underline"
          >
            {exec.connection_id}
          </Link>
          <p className="mt-1 text-xs text-muted-foreground">View all connections →</p>
        </CardContent>
      </Card>
    </div>
  );
}
