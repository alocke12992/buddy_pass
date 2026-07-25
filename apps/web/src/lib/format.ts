import { kgToLb, lbToKg, roundToIncrement, type UnitPreference } from '@buddy-pass/shared';

/**
 * All display formatting lives here: state is kg/UTC canonical everywhere,
 * conversion happens only at render (plans/WEB.md §3).
 */

export function weightUnitLabel(unit: UnitPreference): 'kg' | 'lb' {
  return unit === 'metric' ? 'kg' : 'lb';
}

/** Numeric display value in the user's units, trimmed to one sensible decimal. */
export function displayWeight(weightKg: number, unit: UnitPreference): number {
  const value = unit === 'metric' ? weightKg : kgToLb(weightKg);
  return Math.round(value * 10) / 10;
}

export function formatWeight(weightKg: number, unit: UnitPreference): string {
  return `${displayWeight(weightKg, unit)} ${weightUnitLabel(unit)}`;
}

/** One tap of a weight stepper, in the user's own units. */
const WEIGHT_STEP = { metric: 2.5, imperial: 5 } as const;

/**
 * The weight one stepper tap away.
 *
 * Imperial has to be quantized on the lb grid the user actually sees: 5 lb is
 * 2.26796185 kg, so accumulating the step in kg loses up to 0.005 kg to storage
 * precision every tap until the error surfaces as `60.1 lb` (BUD-7). Snapping
 * discards that error each tap instead of compounding it.
 *
 * Metric needs none of that — 2.5 kg is exact at storage precision — so it keeps
 * a plain delta and a deliberate 20.5 kg stays 20.5.
 */
export function steppedWeightKg(weightKg: number, direction: 1 | -1, unit: UnitPreference): number {
  const step = WEIGHT_STEP[unit];
  const next =
    unit === 'metric'
      ? weightKg + direction * step
      : lbToKg(roundToIncrement(kgToLb(weightKg), step) + direction * step);
  // Clamp, then round to the 2 dp `workout_sets.weight_kg` (numeric(6, 2)) holds.
  return Math.max(0, Math.round(next * 100) / 100);
}

/** "Today" / "Tomorrow" / "Mon, Jul 13" schedule chips. */
export function formatScheduleDate(date: Date, now = new Date()): string {
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const diffDays = Math.round((startOfDay(date) - startOfDay(now)) / 86_400_000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Tomorrow';
  if (diffDays === -1) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

/** "45m" / "1h 02m" elapsed durations. */
export function formatDuration(ms: number): string {
  const totalMinutes = Math.max(0, Math.round(ms / 60_000));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return hours > 0 ? `${hours}h ${String(minutes).padStart(2, '0')}m` : `${minutes}m`;
}
