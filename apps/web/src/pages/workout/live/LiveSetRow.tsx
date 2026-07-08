import { lbToKg, type UnitPreference } from '@buddy-pass/shared';
import { Check, Minus, Plus } from 'lucide-react';
import { displayWeight, weightUnitLabel } from '@/lib/format';
import { cn } from '@/lib/utils';
import type { DisplayRow } from './order';

/** Weight steps in the user's units: 2.5 kg or 5 lb per tap. */
function weightStepKg(unit: UnitPreference): number {
  return unit === 'metric' ? 2.5 : lbToKg(5);
}

function Stepper({
  value,
  suffix,
  onDelta,
  decLabel,
  incLabel,
  size,
}: {
  value: string;
  suffix: string;
  onDelta: (direction: 1 | -1) => void;
  decLabel: string;
  incLabel: string;
  size: 'current' | 'compact';
}) {
  const btn =
    size === 'current'
      ? 'size-14 [&_svg]:size-7' // 56px mid-workout targets (design-system.md)
      : 'size-11 [&_svg]:size-5';
  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        aria-label={decLabel}
        onClick={() => onDelta(-1)}
        className={cn(
          btn,
          'flex items-center justify-center rounded-lg border border-border bg-input/30 text-muted-foreground active:bg-muted',
        )}
      >
        <Minus aria-hidden />
      </button>
      <div
        className={cn(
          'numeric flex flex-col items-center justify-center',
          size === 'current' ? 'min-w-20' : 'min-w-14',
        )}
      >
        <span className={cn('font-bold', size === 'current' ? 'text-display' : 'text-xl')}>
          {value}
        </span>
        <span className="text-label text-faint">{suffix}</span>
      </div>
      <button
        type="button"
        aria-label={incLabel}
        onClick={() => onDelta(1)}
        className={cn(
          btn,
          'flex items-center justify-center rounded-lg border border-border bg-input/30 text-muted-foreground active:bg-muted',
        )}
      >
        <Plus aria-hidden />
      </button>
    </div>
  );
}

export function LiveSetRow({
  row,
  label,
  isCurrent,
  unit,
  editable,
  onDeltaReps,
  onDeltaWeight,
  onToggleComplete,
}: {
  row: DisplayRow;
  /** e.g. "Set 2" or the exercise name inside a superset group. */
  label: string;
  isCurrent: boolean;
  unit: UnitPreference;
  editable: boolean;
  onDeltaReps: (deltaReps: number) => void;
  onDeltaWeight: (deltaKg: number) => void;
  onToggleComplete: () => void;
}) {
  const completed = row.set.completedAt !== null;
  const weightValue = displayWeight(row.set.weightKg ?? 0, unit);

  return (
    <div
      className={cn(
        'rounded-xl border p-3 transition-colors',
        isCurrent ? 'border-primary/60 bg-card ring-2 ring-primary/30' : 'border-border bg-card/60',
        completed && 'opacity-70',
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={cn(
            'min-w-0 truncate text-sm font-medium',
            completed ? 'text-muted-foreground' : 'text-foreground',
          )}
        >
          {label}
          {row.set.isWarmup && <span className="ml-1.5 text-xs text-warning">warm-up</span>}
        </span>
        <button
          type="button"
          aria-label={completed ? 'Mark set incomplete' : 'Complete set'}
          aria-pressed={completed}
          disabled={!editable}
          onClick={onToggleComplete}
          className={cn(
            'flex size-14 shrink-0 items-center justify-center rounded-full border-2 transition-all',
            completed
              ? 'border-primary bg-primary text-primary-foreground'
              : 'border-faint text-transparent active:border-primary',
            !editable && 'opacity-50',
          )}
        >
          <Check
            aria-hidden
            className={cn('size-7', completed && 'motion-safe:animate-in motion-safe:zoom-in-50')}
            strokeWidth={3}
          />
        </button>
      </div>

      <div
        className={cn(
          'mt-2 flex items-center justify-between gap-2',
          isCurrent ? 'flex-col gap-3 sm:flex-row' : '',
        )}
      >
        {editable && !completed ? (
          <>
            <Stepper
              value={String(row.set.reps)}
              suffix="reps"
              onDelta={(d) => onDeltaReps(d)}
              decLabel="One rep less"
              incLabel="One rep more"
              size={isCurrent ? 'current' : 'compact'}
            />
            <Stepper
              value={String(weightValue)}
              suffix={weightUnitLabel(unit)}
              onDelta={(d) => onDeltaWeight(d * weightStepKg(unit))}
              decLabel="Lower weight"
              incLabel="Raise weight"
              size={isCurrent ? 'current' : 'compact'}
            />
          </>
        ) : (
          <p className="numeric text-lg text-muted-foreground">
            {row.set.reps} reps · {weightValue} {weightUnitLabel(unit)}
          </p>
        )}
      </div>
    </div>
  );
}
