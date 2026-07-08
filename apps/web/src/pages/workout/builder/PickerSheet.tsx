import { useQuery } from '@tanstack/react-query';
import { Check, Info, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorCard } from '@/components/app/ErrorCard';
import { ExerciseImage } from '@/components/app/ExerciseImage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import type { ExerciseIndexEntry } from '@/lib/api-types';
import { useTRPC } from '@/lib/trpc';
import { cn } from '@/lib/utils';
import { ExerciseDetailSheet } from './ExerciseDetailSheet';

const RESULT_CAP = 60;
const LEVELS = ['beginner', 'intermediate', 'expert'] as const;

function ChipRow<T extends { id: string; name: string }>({
  items,
  selected,
  onToggle,
  label,
}: {
  items: T[];
  selected: string | null;
  onToggle: (id: string) => void;
  label: string;
}) {
  return (
    <div aria-label={label} className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none]">
      {items.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={selected === item.id}
          onClick={() => onToggle(item.id)}
          className={cn(
            'h-8 shrink-0 rounded-full border px-3 text-xs font-medium whitespace-nowrap transition-colors',
            selected === item.id
              ? 'border-primary bg-primary/15 text-primary'
              : 'border-border bg-input/30 text-muted-foreground',
          )}
        >
          {item.name}
        </button>
      ))}
    </div>
  );
}

/**
 * The exercise library exists only as this picker (FRONTEND.md §3.2).
 * exercises.list ships whole and is cached forever; all filtering is
 * client-side — do not add server search (plans/API.md §2.1).
 */
export function PickerSheet({
  open,
  onOpenChange,
  onAdd,
  addedCounts,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onAdd: (entry: ExerciseIndexEntry) => void;
  /** exerciseId → how many times it's already in the workout. */
  addedCounts: Map<string, number>;
}) {
  const trpc = useTRPC();
  const library = useQuery(trpc.exercises.list.queryOptions(undefined, { staleTime: Infinity }));
  const filters = useQuery(trpc.exercises.filters.queryOptions(undefined, { staleTime: Infinity }));

  const [search, setSearch] = useState('');
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [level, setLevel] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const results = useMemo(() => {
    if (!library.data) return [];
    const q = search.trim().toLowerCase();
    return library.data.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (level && e.level !== level) return false;
      if (equipment && e.equipment?.id !== equipment) return false;
      if (muscle) {
        const muscles = [...e.primaryMuscles, ...e.secondaryMuscles];
        const name = filters.data?.muscleGroups.find((m) => m.id === muscle)?.name;
        if (!name || !muscles.includes(name)) return false;
      }
      return true;
    });
  }, [library.data, filters.data, search, muscle, equipment, level]);

  const addedTotal = [...addedCounts.values()].reduce((a, b) => a + b, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* h needs ! — the sheet's own data-[side=bottom]:h-auto out-specifies a plain h utility */}
      <SheetContent side="bottom" className="h-[94dvh]! gap-0 overflow-hidden rounded-t-2xl">
        <SheetHeader className="gap-3 pb-2">
          <SheetTitle>Add exercises</SheetTitle>
          <div className="relative">
            <Search
              aria-hidden
              className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-faint"
            />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search exercises"
              aria-label="Search exercises"
              className="h-11 pl-9"
            />
          </div>
          <div className="space-y-1.5">
            <ChipRow
              label="Level"
              items={LEVELS.map((l) => ({ id: l, name: l[0]!.toUpperCase() + l.slice(1) }))}
              selected={level}
              onToggle={(id) => setLevel((v) => (v === id ? null : id))}
            />
            {filters.data && (
              <>
                <ChipRow
                  label="Muscle group"
                  items={filters.data.muscleGroups}
                  selected={muscle}
                  onToggle={(id) => setMuscle((v) => (v === id ? null : id))}
                />
                <ChipRow
                  label="Equipment"
                  items={filters.data.equipments}
                  selected={equipment}
                  onToggle={(id) => setEquipment((v) => (v === id ? null : id))}
                />
              </>
            )}
          </div>
        </SheetHeader>

        {/* min-h-0: flex children won't shrink below content without it → no scroll */}
        <div className="min-h-0 flex-1 overflow-y-auto px-4">
          {library.isPending && (
            <div className="space-y-2 py-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          )}
          {library.isError && (
            <div className="py-4">
              <ErrorCard onRetry={() => void library.refetch()} />
            </div>
          )}
          {library.isSuccess && results.length === 0 && (
            <p className="py-12 text-center text-sm text-muted-foreground">
              No exercises match — try a different search or clear a filter.
            </p>
          )}
          <ul className="divide-y divide-border/60">
            {results.slice(0, RESULT_CAP).map((entry) => {
              const count = addedCounts.get(entry.id) ?? 0;
              return (
                <li key={entry.id}>
                  <div className="flex items-center gap-3 py-2">
                    <button
                      type="button"
                      onClick={() => onAdd(entry)}
                      className="flex min-w-0 flex-1 items-center gap-3 rounded-lg text-left hover:bg-muted/50"
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
                      {count > 0 && (
                        <Badge className="shrink-0 bg-primary/15 text-primary">
                          <Check aria-hidden />
                          {count > 1 ? `×${count}` : 'Added'}
                        </Badge>
                      )}
                    </button>
                    <Button
                      variant="ghost"
                      size="icon-lg"
                      aria-label={`About ${entry.name}`}
                      onClick={() => setDetailId(entry.id)}
                    >
                      <Info className="text-muted-foreground" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {results.length > RESULT_CAP && (
            <p className="py-3 text-center text-xs text-faint">
              Showing {RESULT_CAP} of {results.length} — refine your search
            </p>
          )}
          {filters.isPending && library.isSuccess && (
            <div className="flex justify-center py-2">
              <Spinner className="size-4 text-muted-foreground" />
            </div>
          )}
        </div>

        <div className="border-t p-4">
          <Button size="xl" className="w-full" onClick={() => onOpenChange(false)}>
            Done{addedTotal > 0 ? ` · ${addedTotal} exercise${addedTotal === 1 ? '' : 's'}` : ''}
          </Button>
        </div>

        <ExerciseDetailSheet
          exerciseId={detailId}
          onClose={() => setDetailId(null)}
          onAdd={(entry) => {
            onAdd(entry);
            setDetailId(null);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
