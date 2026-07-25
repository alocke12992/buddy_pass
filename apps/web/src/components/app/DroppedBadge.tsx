import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';

/**
 * Marks an exercise dropped mid-workout — removed or swapped out (ADR-0004).
 * It only ever appears on a finished workout, where its completed sets remain
 * part of the record. Neutral, never volt: this isn't progress, it's history.
 */
export function DroppedBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('shrink-0 border-border text-muted-foreground', className)}
    >
      Dropped
    </Badge>
  );
}
