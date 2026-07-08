import { describe, expect, it } from 'vitest';
import {
  extendTimer,
  formatSeconds,
  idleTimer,
  isRunning,
  remainingSeconds,
  startTimer,
} from './restTimer';

const T0 = 1_000_000;

describe('rest timer', () => {
  it('counts down from the started duration', () => {
    const t = startTimer(90, T0);
    expect(remainingSeconds(t, T0)).toBe(90);
    expect(remainingSeconds(t, T0 + 30_000)).toBe(60);
    expect(isRunning(t, T0 + 30_000)).toBe(true);
  });

  it('hits zero and stops', () => {
    const t = startTimer(90, T0);
    expect(remainingSeconds(t, T0 + 90_000)).toBe(0);
    expect(isRunning(t, T0 + 90_000)).toBe(false);
    expect(remainingSeconds(t, T0 + 120_000)).toBe(0);
  });

  it('+15s extends the deadline', () => {
    const t = extendTimer(startTimer(90, T0), 15, T0 + 10_000);
    expect(remainingSeconds(t, T0 + 10_000)).toBe(95);
  });

  it('-15s clamps at zero instead of going negative', () => {
    const t = extendTimer(startTimer(20, T0), -15, T0 + 10_000);
    expect(remainingSeconds(t, T0 + 10_000)).toBe(0);
    expect(isRunning(t, T0 + 10_000)).toBe(false);
  });

  it('zero-second rests never start', () => {
    expect(startTimer(0, T0)).toEqual(idleTimer);
    expect(isRunning(startTimer(0, T0), T0)).toBe(false);
  });

  it('formats mm:ss', () => {
    expect(formatSeconds(90)).toBe('1:30');
    expect(formatSeconds(5)).toBe('0:05');
    expect(formatSeconds(600)).toBe('10:00');
  });
});
