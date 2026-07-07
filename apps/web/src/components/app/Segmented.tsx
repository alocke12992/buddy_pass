import { cn } from '@/lib/utils';

export interface SegmentedOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

/** Single-choice control for 2–3 options — bigger targets than a dropdown. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  columns,
  'aria-label': ariaLabel,
}: {
  options: readonly SegmentedOption<T>[];
  value: T | undefined;
  onChange: (value: T) => void;
  columns?: number;
  'aria-label'?: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={ariaLabel}
      className="grid gap-2"
      style={{ gridTemplateColumns: `repeat(${columns ?? options.length}, minmax(0, 1fr))` }}
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(option.value)}
            className={cn(
              'flex min-h-11 flex-col items-center justify-center gap-0.5 rounded-lg border px-3 py-2 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
              selected
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border bg-input/30 text-muted-foreground hover:bg-muted',
            )}
          >
            {option.label}
            {option.description && (
              <span
                className={cn('text-xs font-normal', selected ? 'text-primary/80' : 'text-faint')}
              >
                {option.description}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
