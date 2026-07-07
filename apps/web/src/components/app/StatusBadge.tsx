import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

export type WorkoutStatus = 'planned' | 'in_progress' | 'completed' | 'cancelled';

/**
 * The one place workout statuses map to colors (design-system.md status table).
 * Status is never color-alone: every badge carries its label.
 */
const STATUS: Record<WorkoutStatus, { label: string; className: string; dot?: boolean }> = {
  planned: { label: 'Planned', className: 'border-border bg-transparent text-muted-foreground' },
  in_progress: { label: 'In progress', className: 'bg-primary/15 text-primary', dot: true },
  completed: { label: 'Completed', className: 'bg-primary text-primary-foreground' },
  cancelled: { label: 'Cancelled', className: 'bg-destructive/15 text-destructive' },
};

export function StatusBadge({ status, className }: { status: WorkoutStatus; className?: string }) {
  const { label, className: statusClass, dot } = STATUS[status];
  return (
    <Badge variant="outline" className={cn('border-transparent', statusClass, className)}>
      {dot && (
        <span aria-hidden className="size-1.5 rounded-full bg-current motion-safe:animate-pulse" />
      )}
      {label}
    </Badge>
  );
}
