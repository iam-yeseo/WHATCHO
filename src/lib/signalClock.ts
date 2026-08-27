import type { ApiSignalResponse, SignalTiming } from '../types';

export interface SignalSnapshot {
  data: ApiSignalResponse;
  receivedAt: number;
}

const tick = (timing: SignalTiming | undefined, elapsedSeconds: number) => {
  if (!timing || timing.remainingSeconds == null) return timing;
  const remainingSeconds = Math.max(0, timing.remainingSeconds - elapsedSeconds);
  return {
    ...timing,
    state: remainingSeconds === 0 ? 'UNKNOWN' as const : timing.state,
    remainingSeconds,
  };
};

export function countdownSignal(snapshot: SignalSnapshot | null, now = Date.now()) {
  if (!snapshot) return null;
  const elapsedSeconds = Math.max(0, now - snapshot.receivedAt) / 1000;
  return {
    ...snapshot.data,
    signal: {
      straight: tick(snapshot.data.signal.straight, elapsedSeconds)!,
      left: tick(snapshot.data.signal.left, elapsedSeconds),
    },
  };
}

export function nextSignalSyncDelay(signal: ApiSignalResponse) {
  const remainingTimes = [
    signal.signal.straight.remainingSeconds,
    signal.signal.left?.remainingSeconds,
  ].filter((value): value is number => value != null && Number.isFinite(value));
  if (remainingTimes.some((value) => value <= 0)) return 5_000;
  const phaseEnds = remainingTimes.filter((value) => value > 0);

  // Re-sync shortly after the first displayed movement should change phase. A
  // one-minute ceiling corrects clock/data drift without returning to a rapid poll.
  const phaseBoundaryMs = phaseEnds.length ? Math.min(...phaseEnds) * 1000 + 1_200 : 30_000;
  return Math.min(60_000, Math.max(5_000, phaseBoundaryMs));
}
