import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Inline retry card for failed queries (FRONTEND.md §5) — errors never dead-end. */
export function ErrorCard({
  message = "Couldn't load this — check your connection.",
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-8 text-center">
      <p className="text-sm text-muted-foreground">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCcw data-icon="inline-start" />
          Retry
        </Button>
      )}
    </div>
  );
}
