import { kgToLb, type UnitPreference } from '@buddy-pass/shared';

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
