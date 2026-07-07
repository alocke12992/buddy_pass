import { cn } from '@/lib/utils';

export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn('text-lg font-semibold tracking-tight', className)}>
      Buddy<span className="text-primary">Pass</span>
    </span>
  );
}
