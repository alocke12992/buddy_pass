import { useQuery } from '@tanstack/react-query';
import { Check, ChevronDown, Info, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { ErrorCard } from '@/components/app/ErrorCard';
import { ExerciseImage } from '@/components/app/ExerciseImage';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
import { cn } from '@/lib/utils';
import { ExerciseDetailSheet } from './ExerciseDetailSheet';

const RESULT_CAP = 60;
const LEVELS = [
  { id: 'beginner', name: 'Beginner' },
  { id: 'intermediate', name: 'Intermediate' },
  { id: 'expert', name: 'Expert' },
] as const;

type FilterKind = 'difficulty' | 'muscle' | 'equipment';

interface FilterOption {
  id: string;
  name: string;
}

/** Top-level filter menu button: shows the selection when one is active. */
function FilterButton({
  label,
  selection,
  onClick,
}: {
  label: string;
  selection: string | null;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-haspopup="dialog"
      className={cn(
        'flex h-11 min-w-0 items-center justify-between gap-1 rounded-lg border px-3 text-sm font-medium transition-colors',
        selection
          ? 'border-primary bg-primary/10 text-primary'
          : 'border-border bg-input/30 text-muted-foreground hover:bg-muted',
      )}
    >
      <span className="truncate">{selection ?? label}</span>
      <ChevronDown aria-hidden className="size-4 shrink-0" />
    </button>
  );
}

/** Pop-up option list for one filter dimension; "All …" clears it. */
function FilterSheet({
  title,
  clearLabel,
  options,
  selected,
  open,
  onOpenChange,
  onSelect,
}: {
  title: string;
  clearLabel: string;
  options: readonly FilterOption[];
  selected: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSelect: (id: string | null) => void;
}) {
  const pick = (id: string | null) => {
    onSelect(id);
    onOpenChange(false);
  };
  const row = (id: string | null, name: string) => {
    const isSelected = selected === id;
    return (
      <button
        key={id ?? '__all'}
        type="button"
        role="option"
        aria-selected={isSelected}
        onClick={() => pick(id)}
        className={cn(
          'flex h-11 w-full items-center justify-between rounded-lg border px-3 text-sm font-medium transition-colors',
          isSelected
            ? 'border-primary bg-primary/10 text-primary'
            : 'border-transparent text-foreground hover:bg-muted',
        )}
      >
        {name}
        {isSelected && <Check aria-hidden className="size-4" />}
      </button>
    );
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[70dvh] gap-0 overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>{title}</SheetTitle>
          <SheetDescription className="sr-only">Pick a filter</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4 pb-4">
          {row(null, clearLabel)}
          {options.map((option) => row(option.id, option.name))}
        </div>
      </SheetContent>
    </Sheet>
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
  onToggle,
  addedIds,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Tapping toggles membership: adds when absent, removes when already in the workout. */
  onToggle: (entry: ExerciseIndexEntry) => void;
  addedIds: ReadonlySet<string>;
}) {
  const trpc = useTRPC();
  const library = useQuery(trpc.exercises.list.queryOptions(undefined, { staleTime: Infinity }));
  const filters = useQuery(trpc.exercises.filters.queryOptions(undefined, { staleTime: Infinity }));

  const [search, setSearch] = useState('');
  const [difficulty, setDifficulty] = useState<string | null>(null);
  const [muscle, setMuscle] = useState<string | null>(null);
  const [equipment, setEquipment] = useState<string | null>(null);
  const [openMenu, setOpenMenu] = useState<FilterKind | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  const muscleGroups = useMemo(() => filters.data?.muscleGroups ?? [], [filters.data]);
  const equipments = useMemo(() => filters.data?.equipments ?? [], [filters.data]);

  const results = useMemo(() => {
    if (!library.data) return [];
    const q = search.trim().toLowerCase();
    const muscleName = muscleGroups.find((m) => m.id === muscle)?.name;
    return library.data.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      if (difficulty && e.level !== difficulty) return false;
      if (equipment && e.equipment?.id !== equipment) return false;
      if (muscle) {
        if (!muscleName) return false;
        if (![...e.primaryMuscles, ...e.secondaryMuscles].includes(muscleName)) return false;
      }
      return true;
    });
  }, [library.data, muscleGroups, search, difficulty, muscle, equipment]);

  const addedTotal = addedIds.size;

  const menuConfig: Record<
    FilterKind,
    {
      title: string;
      clearLabel: string;
      options: readonly FilterOption[];
      selected: string | null;
      onSelect: (id: string | null) => void;
    }
  > = {
    difficulty: {
      title: 'Difficulty',
      clearLabel: 'All difficulties',
      options: LEVELS,
      selected: difficulty,
      onSelect: setDifficulty,
    },
    muscle: {
      title: 'Muscle group',
      clearLabel: 'All muscle groups',
      options: muscleGroups,
      selected: muscle,
      onSelect: setMuscle,
    },
    equipment: {
      title: 'Equipment',
      clearLabel: 'All equipment',
      options: equipments,
      selected: equipment,
      onSelect: setEquipment,
    },
  };

  const selectionName = (options: readonly FilterOption[], id: string | null) =>
    options.find((o) => o.id === id)?.name ?? null;

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
          <div className="grid grid-cols-3 gap-2">
            <FilterButton
              label="Difficulty"
              selection={selectionName(LEVELS, difficulty)}
              onClick={() => setOpenMenu('difficulty')}
            />
            <FilterButton
              label="Muscle group"
              selection={selectionName(muscleGroups, muscle)}
              onClick={() => setOpenMenu('muscle')}
            />
            <FilterButton
              label="Equipment"
              selection={selectionName(equipments, equipment)}
              onClick={() => setOpenMenu('equipment')}
            />
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
              const added = addedIds.has(entry.id);
              return (
                <li key={entry.id}>
                  <div className="flex items-center gap-3 py-2">
                    <button
                      type="button"
                      aria-pressed={added}
                      onClick={() => onToggle(entry)}
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
                      {added && (
                        <Badge className="shrink-0 bg-primary/15 text-primary">
                          <Check aria-hidden />
                          Added
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
        </div>

        <div className="border-t p-4">
          <Button size="xl" className="w-full" onClick={() => onOpenChange(false)}>
            Done{addedTotal > 0 ? ` · ${addedTotal} selected` : ''}
          </Button>
        </div>

        {openMenu && (
          <FilterSheet
            title={menuConfig[openMenu].title}
            clearLabel={menuConfig[openMenu].clearLabel}
            options={menuConfig[openMenu].options}
            selected={menuConfig[openMenu].selected}
            open
            onOpenChange={(next) => !next && setOpenMenu(null)}
            onSelect={menuConfig[openMenu].onSelect}
          />
        )}

        <ExerciseDetailSheet
          exerciseId={detailId}
          added={detailId !== null && addedIds.has(detailId)}
          onClose={() => setDetailId(null)}
          onToggle={(entry) => {
            onToggle(entry);
            setDetailId(null);
          }}
        />
      </SheetContent>
    </Sheet>
  );
}
