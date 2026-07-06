import { describe, expect, it } from 'vitest';
import { kgToLb, lbToKg, roundToIncrement } from './units';

describe('unit conversion', () => {
  it('converts kg to lb', () => {
    expect(kgToLb(100)).toBeCloseTo(220.462, 3);
  });

  it('converts lb to kg', () => {
    expect(lbToKg(225)).toBeCloseTo(102.058, 3);
  });

  it('round-trips without drift', () => {
    expect(lbToKg(kgToLb(87.5))).toBeCloseTo(87.5, 10);
  });

  it('rounds to display increments', () => {
    expect(roundToIncrement(102.058, 2.5)).toBe(102.5);
    expect(roundToIncrement(220.462, 5)).toBe(220);
  });
});
