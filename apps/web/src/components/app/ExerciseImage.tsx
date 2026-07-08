import { useState } from 'react';
import { exerciseImageUrl } from '@/lib/images';
import { cn } from '@/lib/utils';

/**
 * Exercise thumbnail with a mandatory initial-letter fallback — prod serves
 * no images until INFRA milestone 6 syncs S3, so 404s must degrade gracefully
 * (plans/WEB.md §5).
 */
export function ExerciseImage({
  path,
  name,
  className,
}: {
  /** Relative image path from the exercise record; null → fallback tile. */
  path: string | null;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);

  if (!path || failed) {
    return (
      <div
        aria-hidden
        className={cn(
          'flex items-center justify-center rounded-lg bg-muted text-lg font-semibold text-muted-foreground select-none',
          className,
        )}
      >
        {name.charAt(0).toUpperCase()}
      </div>
    );
  }

  return (
    <img
      src={exerciseImageUrl(path)}
      alt={name}
      loading="lazy"
      onError={() => setFailed(true)}
      className={cn('rounded-lg bg-muted object-cover', className)}
    />
  );
}
