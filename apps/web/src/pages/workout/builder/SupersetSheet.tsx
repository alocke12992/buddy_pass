import { Check } from 'lucide-react';
import { useState } from 'react';
import { ExerciseImage } from '@/components/app/ExerciseImage';
import { Button } from '@/components/ui/button';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import { cn } from '@/lib/utils';
import type { BuilderExercise } from './state';

/**
 * Superset membership picker: check which exercises pair with the anchor.
 * Selected members are pulled adjacent on save; unchecking everything
 * dissolves the group. Mount fresh per open so selection seeds correctly.
 */
export function SupersetSheet({
  anchor,
  others,
  onOpenChange,
  onConfirm,
}: {
  anchor: BuilderExercise;
  others: BuilderExercise[];
  onOpenChange: (open: boolean) => void;
  onConfirm: (memberKeys: string[]) => void;
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () =>
      new Set(
        anchor.superSetId === null
          ? []
          : others.filter((e) => e.superSetId === anchor.superSetId).map((e) => e.key),
      ),
  );

  const toggle = (key: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  return (
    <Sheet open onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="max-h-[80dvh] gap-0 overflow-hidden rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
      >
        <SheetHeader>
          <SheetTitle>Superset with {anchor.exercise.name}</SheetTitle>
          <SheetDescription>
            Pick the exercises to alternate with — they'll move next to it.
          </SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 space-y-1 overflow-y-auto px-4">
          {others.length === 0 && (
            <p className="py-8 text-center text-sm text-muted-foreground">
              Add another exercise first — supersets need at least two.
            </p>
          )}
          {others.map((e) => {
            const isSelected = selected.has(e.key);
            return (
              <button
                key={e.key}
                type="button"
                role="checkbox"
                aria-checked={isSelected}
                onClick={() => toggle(e.key)}
                className={cn(
                  'flex w-full items-center gap-3 rounded-lg border p-2 text-left transition-colors',
                  isSelected ? 'border-primary bg-primary/10' : 'border-transparent hover:bg-muted',
                )}
              >
                <ExerciseImage
                  path={e.exercise.thumbnail}
                  name={e.exercise.name}
                  className="size-10 shrink-0"
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium">
                  {e.exercise.name}
                </span>
                <span
                  aria-hidden
                  className={cn(
                    'flex size-6 shrink-0 items-center justify-center rounded-full border-2',
                    isSelected
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-faint text-transparent',
                  )}
                >
                  <Check className="size-4" strokeWidth={3} />
                </span>
              </button>
            );
          })}
        </div>
        <div className="border-t p-4">
          <Button size="xl" className="w-full" onClick={() => onConfirm([...selected])}>
            {selected.size === 0
              ? anchor.superSetId
                ? 'Remove superset'
                : 'Save'
              : `Save superset · ${selected.size + 1} exercises`}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
