import { describe, expect, it } from 'vitest';
import { displayWeight, steppedWeightKg } from './format';

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
