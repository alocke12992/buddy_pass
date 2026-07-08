import { useQuery } from '@tanstack/react-query';
import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router';
import { useTRPC } from '@/lib/trpc';

/**
 * Persistent in-progress banner above the tab bar on every tabbed screen
 * (FRONTEND.md §2); tapping resumes the live session.
 */
export function ResumeBanner() {
  const trpc = useTRPC();
  const inProgress = useQuery(trpc.workouts.list.queryOptions({ status: 'in_progress', limit: 1 }));
  const workout = inProgress.data?.items[0];
  if (!workout) return null;

  return (
    <div className="fixed inset-x-0 bottom-16 z-40 mb-[env(safe-area-inset-bottom)] px-3 pb-2 lg:bottom-0 lg:pl-63">
      <Link
        to={`/workout/${workout.id}/live`}
        className="mx-auto flex h-12 w-full max-w-2xl items-center gap-3 rounded-xl bg-primary px-4 text-primary-foreground shadow-lg"
      >
        <span
          aria-hidden
          className="size-2 rounded-full bg-primary-foreground motion-safe:animate-pulse"
        />
        <span className="min-w-0 flex-1 truncate text-sm font-semibold">
          {workout.name} — in progress
        </span>
        <span className="text-sm font-medium">Resume</span>
        <ChevronRight aria-hidden className="size-4" />
      </Link>
    </div>
  );
}
