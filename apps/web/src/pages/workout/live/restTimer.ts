/**
 * Rest timer math, pure and clock-injected so it's testable and immune to
 * setInterval drift (remaining time is always derived from timestamps, never
 * decremented — design-system.md wants smooth countdowns).
 */
export interface RestTimerState {
  /** Epoch ms when the rest ends; null = idle. */
  endsAt: number | null;
  /** Total planned rest for the progress arc. */
  totalSeconds: number;
}

export const idleTimer: RestTimerState = { endsAt: null, totalSeconds: 0 };

export function startTimer(seconds: number, now: number): RestTimerState {
  if (seconds <= 0) return idleTimer;
  return { endsAt: now + seconds * 1000, totalSeconds: seconds };
}

/** ±15s adjustments clamp at zero (hitting zero = done). */
export function extendTimer(
  state: RestTimerState,
  deltaSeconds: number,
  now: number,
): RestTimerState {
  if (state.endsAt === null) return state;
  const endsAt = Math.max(now, state.endsAt + deltaSeconds * 1000);
  return {
    endsAt,
    totalSeconds: Math.max(1, state.totalSeconds + deltaSeconds),
  };
}

export function remainingSeconds(state: RestTimerState, now: number): number {
  if (state.endsAt === null) return 0;
  return Math.max(0, Math.ceil((state.endsAt - now) / 1000));
}

export function isRunning(state: RestTimerState, now: number): boolean {
  return state.endsAt !== null && state.endsAt > now;
}

/** mm:ss for the countdown readout. */
export function formatSeconds(totalSeconds: number): string {
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

// Event-handler conveniences: the wall clock lives here, keeping components
// pure in the React Compiler's eyes (impure calls stay out of render scope).
export const startTimerNow = (seconds: number) => startTimer(seconds, Date.now());
export const extendTimerNow = (state: RestTimerState, deltaSeconds: number) =>
  extendTimer(state, deltaSeconds, Date.now());
