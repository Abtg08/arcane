import { Badge } from '@/components/ui/badge';
import type { ExecutionStatus } from '@/types/api';

const STATUS_VARIANTS: Record<ExecutionStatus, 'success' | 'destructive' | 'warning' | 'muted' | 'default'> = {
  SUCCEEDED: 'success',
  FAILED: 'destructive',
  REJECTED: 'destructive',
  TIMED_OUT: 'destructive',
  RUNNING: 'warning',
  AUTHORIZING: 'muted',
  PENDING: 'muted',
};

export function StatusBadge({ status }: { status: ExecutionStatus }) {
  return (
    <Badge variant={STATUS_VARIANTS[status] ?? 'default'}>
      {status}
    </Badge>
  );
}
