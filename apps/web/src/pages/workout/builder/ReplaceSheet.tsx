import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useMemo } from 'react';
import { ExerciseImage } from '@/components/app/ExerciseImage';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import type { ExerciseIndexEntry } from '@/lib/api-types';
import { useTRPC } from '@/lib/trpc';
import { rankReplacements } from './replaceRanking';
import type { BuilderExercise } from './state';

/**
 * Replace flow, step 1: similar exercises (same primary muscle, closest
 * equipment/mechanic first). The footer hands off to the full picker
 * pre-filtered to the same muscle group.
 */
export function ReplaceSheet({
  exercise,
  addedIds,
  onOpenChange,
  onPick,
  onSearchAll,
}: {
  exercise: BuilderExercise;
  addedIds: ReadonlySet<string>;
  onOpenChange: (open: boolean) => void;
  onPick: (entry: ExerciseIndexEntry) => void;
  /** Open the full picker filtered to this muscle group id (null = unfiltered). */
  onSearchAll: (muscleGroupId: string | null) => void;
}) {
  const trpc = useTRPC();
  const library = useQuery(trpc.exercises.list.queryOptions(undefined, { staleTime: Infinity }));
  const filters = useQuery(trpc.exercises.filters.queryOptions(undefined, { staleTime: Infinity }));

  const target = exercise.exercise;
  const suggestions = useMemo(
    () => (library.data ? rankReplacements(target, library.data, addedIds) : []),
    [library.data, target, addedIds],
  );

  const primaryMuscle = target.primaryMuscles[0] ?? null;
  const muscleGroupId =
    filters.data?.muscleGroups.find((m) => m.name === primaryMuscle)?.id ?? null;

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] gap-0 overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>Replace {target.name}</SheetTitle>
          <SheetDescription>Similar movements — sets and weights carry over.</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {library.isPending && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 5 }, (_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          )}
          {library.isSuccess && suggestions.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              No close matches — try the full search below.
            </p>
          )}
          <ul className="divide-y divide-border/60">
            {suggestions.map((entry) => (
              <li key={entry.id}>
                <button
                  type="button"
                  onClick={() => onPick(entry)}
                  className="flex w-full items-center gap-3 rounded-lg py-2 text-left hover:bg-muted/50"
                >
                  <ExerciseImage
                    path={entry.thumbnail}
                    name={entry.name}
                    className="size-12 shrink-0"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-foreground">
                      {entry.name}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {entry.primaryMuscles.join(', ')}
                      {entry.equipment ? ` · ${entry.equipment.name}` : ''}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        <div className="border-t p-4">
          <Button
            variant="outline"
            size="xl"
            className="w-full"
            onClick={() => onSearchAll(muscleGroupId)}
          >
            <Search data-icon="inline-start" />
            Search all {primaryMuscle ?? ''} exercises
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
