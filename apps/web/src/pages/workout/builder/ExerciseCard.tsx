import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import type { UnitPreference } from '@buddy-pass/shared';
import { lbToKg } from '@buddy-pass/shared';
import { Copy, GripVertical, Link2, Plus, Trash2, Unlink2, X } from 'lucide-react';
import { ExerciseImage } from '@/components/app/ExerciseImage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { displayWeight, weightUnitLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { BuilderExercise, BuilderSet } from './state';

function SetRow({
  set,
  index,
  unit,
  onPatch,
  onDuplicate,
  onRemove,
}: {
  set: BuilderSet;
  index: number;
  unit: UnitPreference;
  onPatch: (patch: Partial<Omit<BuilderSet, 'key'>>) => void;
  onDuplicate: () => void;
  onRemove: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        aria-label={set.isWarmup ? 'Warm-up set — tap to make working' : 'Tap to mark as warm-up'}
        aria-pressed={set.isWarmup}
        onClick={() => onPatch({ isWarmup: !set.isWarmup })}
        className={cn(
          'numeric flex size-9 shrink-0 items-center justify-center rounded-full border text-xs font-semibold',
          set.isWarmup
            ? 'border-warning/50 bg-warning/15 text-warning'
            : 'border-border text-muted-foreground',
        )}
      >
        {set.isWarmup ? 'W' : index + 1}
      </button>
      <Input
        type="number"
        inputMode="numeric"
        aria-label="Reps"
        min={0}
        value={set.reps === 0 ? '' : set.reps}
        placeholder="0"
        onChange={(e) => onPatch({ reps: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })}
        className="numeric h-11 flex-1 text-center"
      />
      <Input
        type="number"
        inputMode="decimal"
        step="0.5"
        min={0}
        aria-label={`Weight (${weightUnitLabel(unit)})`}
        value={set.weightKg === 0 ? '' : displayWeight(set.weightKg, unit)}
        placeholder="0"
        onChange={(e) => {
          const raw = Math.max(0, Number(e.target.value) || 0);
          const kg = unit === 'metric' ? raw : lbToKg(raw);
          onPatch({ weightKg: Math.round(kg * 100) / 100 });
        }}
        className="numeric h-11 flex-1 text-center"
      />
      <Input
        type="number"
        inputMode="numeric"
        aria-label="Rest (seconds)"
        min={0}
        step={15}
        value={set.restSeconds === 0 ? '' : set.restSeconds}
        placeholder="0"
        onChange={(e) =>
          onPatch({ restSeconds: Math.max(0, Math.trunc(Number(e.target.value) || 0)) })
        }
        className="numeric h-11 w-16 text-center"
      />
      <div className="flex shrink-0">
        <Button variant="ghost" size="icon-sm" aria-label="Duplicate set" onClick={onDuplicate}>
          <Copy className="text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Remove set" onClick={onRemove}>
          <X className="text-muted-foreground" />
        </Button>
      </div>
    </div>
  );
}

export function ExerciseCard({
  item,
  index,
  unit,
  grouped,
  canLinkWithPrevious,
  onLink,
  onUnlink,
  onRemove,
  onPatchSet,
  onAddSet,
  onDuplicateSet,
  onRemoveSet,
}: {
  item: BuilderExercise;
  index: number;
  unit: UnitPreference;
  /** Position within a rendered superset group, for the bracket rail. */
  grouped: 'none' | 'first' | 'middle' | 'last';
  canLinkWithPrevious: boolean;
  onLink: () => void;
  onUnlink: () => void;
  onRemove: () => void;
  onPatchSet: (setKey: string, patch: Partial<Omit<BuilderSet, 'key'>>) => void;
  onAddSet: () => void;
  onDuplicateSet: (setKey: string) => void;
  onRemoveSet: (setKey: string) => void;
}) {
  const { setNodeRef, transform, transition, isDragging, attributes, listeners } = useSortable({
    id: item.key,
  });

  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn('relative', isDragging && 'z-10 opacity-80')}
    >
      {grouped !== 'none' && (
        <div
          aria-hidden
          className={cn(
            'absolute -left-2 w-0.5 bg-primary/50',
            grouped === 'first' && 'top-4 bottom-0',
            grouped === 'middle' && 'inset-y-0',
            grouped === 'last' && 'top-0 bottom-4',
          )}
        />
      )}
      <div className="rounded-xl border bg-card p-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label={`Reorder ${item.exercise.name}`}
            className="cursor-grab touch-none text-faint active:cursor-grabbing"
            {...attributes}
            {...listeners}
          >
            <GripVertical className="size-5" />
          </button>
          <ExerciseImage
            path={item.exercise.thumbnail}
            name={item.exercise.name}
            className="size-10 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{item.exercise.name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {item.exercise.primaryMuscles.join(', ')}
              {grouped !== 'none' && <span className="text-primary"> · superset</span>}
            </p>
          </div>
          {index > 0 &&
            (item.superSetId !== null ? (
              <Button
                variant="ghost"
                size="icon-lg"
                aria-label="Unlink from superset"
                onClick={onUnlink}
              >
                <Unlink2 className="text-primary" />
              </Button>
            ) : (
              canLinkWithPrevious && (
                <Button
                  variant="ghost"
                  size="icon-lg"
                  aria-label="Link with previous exercise (superset)"
                  onClick={onLink}
                >
                  <Link2 className="text-muted-foreground" />
                </Button>
              )
            ))}
          <Button
            variant="ghost"
            size="icon-lg"
            aria-label={`Remove ${item.exercise.name}`}
            onClick={onRemove}
          >
            <Trash2 className="text-muted-foreground" />
          </Button>
        </div>

        <div className="mt-3 space-y-2">
          <div className="flex items-center gap-2 pr-16 pl-11 text-center">
            <span className="text-label flex-1 text-faint">Reps</span>
            <span className="text-label flex-1 text-faint">{weightUnitLabel(unit)}</span>
            <span className="text-label w-16 text-faint">Rest</span>
          </div>
          {item.sets.map((set, i) => (
            <SetRow
              key={set.key}
              set={set}
              index={i}
              unit={unit}
              onPatch={(patch) => onPatchSet(set.key, patch)}
              onDuplicate={() => onDuplicateSet(set.key)}
              onRemove={() => onRemoveSet(set.key)}
            />
          ))}
          <Button
            variant="ghost"
            size="lg"
            className="w-full text-muted-foreground"
            onClick={onAddSet}
          >
            <Plus data-icon="inline-start" />
            Add set
          </Button>
        </div>
      </div>
    </div>
  );
}
