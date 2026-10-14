import { describe, expect, it } from 'vitest';
import {
  displayWeight,
  formatDuration,
  formatScheduleDate,
  formatWeight,
  steppedWeightKg,
  weightUnitLabel,
} from './format';

/** Tap `+` (or `-`) n times from a starting weight, collecting what the user sees. */
function tap(fromKg: number, direction: 1 | -1, taps: number, unit: 'metric' | 'imperial') {
  const seen: number[] = [];
  let kg = fromKg;
  for (let i = 0; i < taps; i++) {
    kg = steppedWeightKg(kg, direction, unit);
    seen.push(displayWeight(kg, unit));
  }
  return seen;
}

describe('weight stepper', () => {
  it('climbs the 5 lb grid without drifting (BUD-7)', () => {
    expect(tap(0, 1, 14, 'imperial')).toEqual([
      5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 65, 70,
    ]);
  });

  it('pulls a weight stored off the grid back onto it', () => {
    // 50 lb is 22.6796 kg, which numeric(6, 2) hands back as 22.68.
    expect(tap(22.68, 1, 4, 'imperial')).toEqual([55, 60, 65, 70]);
    expect(tap(22.7, 1, 4, 'imperial')).toEqual([55, 60, 65, 70]);
  });

  it('walks back down the grid and stops at zero', () => {
    // 9.07 kg is how storage holds 20 lb.
    expect(tap(9.07, -1, 6, 'imperial')).toEqual([15, 10, 5, 0, 0, 0]);
  });

  it('keeps the metric step exactly 2.5 kg', () => {
    expect(tap(0, 1, 6, 'metric')).toEqual([2.5, 5, 7.5, 10, 12.5, 15]);
    expect(tap(100, -1, 3, 'metric')).toEqual([97.5, 95, 92.5]);
  });

  it('leaves an off-grid metric weight off the grid', () => {
    // Metric never drifted, so 20.5 kg dumbbells keep their half kilo.
    expect(tap(20.5, 1, 2, 'metric')).toEqual([23, 25.5]);
    expect(tap(20.5, -1, 2, 'metric')).toEqual([18, 15.5]);
  });
});

describe('weight display', () => {
  it('shows kg as stored and converts for imperial', () => {
    expect(displayWeight(102.5, 'metric')).toBe(102.5);
    expect(displayWeight(100, 'imperial')).toBe(220.5); // 220.462 lb
  });

  it('trims the display to a single decimal', () => {
    expect(displayWeight(60.06, 'metric')).toBe(60.1);
    expect(displayWeight(22.68, 'imperial')).toBe(50);
  });

  it('labels the unit and renders value plus label together', () => {
    expect(weightUnitLabel('metric')).toBe('kg');
    expect(weightUnitLabel('imperial')).toBe('lb');
    expect(formatWeight(60, 'metric')).toBe('60 kg');
    expect(formatWeight(45.36, 'imperial')).toBe('100 lb');
  });
});

describe('formatScheduleDate', () => {
  const now = new Date(2026, 6, 13, 9, 30); // Mon 13 Jul 2026, local

  it('names the day relative to now when it is within a day', () => {
    expect(formatScheduleDate(new Date(2026, 6, 13, 18, 0), now)).toBe('Today');
    expect(formatScheduleDate(new Date(2026, 6, 14, 6, 0), now)).toBe('Tomorrow');
    expect(formatScheduleDate(new Date(2026, 6, 12, 23, 59), now)).toBe('Yesterday');
  });

  it('compares calendar days, not elapsed hours', () => {
    // 20 hours apart, but either side of midnight → still "Tomorrow"
    expect(formatScheduleDate(new Date(2026, 6, 14, 5, 0), new Date(2026, 6, 13, 23, 0))).toBe(
      'Tomorrow',
    );
  });

  it('falls back to a weekday chip further out', () => {
    const chip = formatScheduleDate(new Date(2026, 6, 18, 9, 0), now);
    expect(chip).not.toMatch(/Today|Tomorrow|Yesterday/);
    expect(chip).toContain('18');
  });
});

describe('formatDuration', () => {
  it('shows bare minutes under an hour', () => {
    expect(formatDuration(45 * 60_000)).toBe('45m');
    expect(formatDuration(0)).toBe('0m');
  });

  it('pads the minutes once there are hours', () => {
    expect(formatDuration(62 * 60_000)).toBe('1h 02m');
    expect(formatDuration(130 * 60_000)).toBe('2h 10m');
    expect(formatDuration(120 * 60_000)).toBe('2h 00m');
  });

  it('rounds to the nearest minute and never goes negative', () => {
    expect(formatDuration(89_000)).toBe('1m');
    expect(formatDuration(91_000)).toBe('2m');
    expect(formatDuration(-5_000)).toBe('0m');
  });
});
