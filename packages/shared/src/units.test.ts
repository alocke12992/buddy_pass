import { describe, expect, it } from 'vitest';
import { cmToFeetInches, feetInchesToCm, kgToLb, lbToKg, roundToIncrement } from './units';

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

  it('converts height between cm and feet/inches', () => {
    expect(cmToFeetInches(178)).toEqual({ feet: 5, inches: 10 });
    expect(feetInchesToCm(5, 10)).toBe(178);
    expect(cmToFeetInches(183)).toEqual({ feet: 6, inches: 0 });
  });

  it('height round-trips within an inch', () => {
    const { feet, inches } = cmToFeetInches(180);
    expect(Math.abs(feetInchesToCm(feet, inches) - 180)).toBeLessThanOrEqual(2);
  });
});
