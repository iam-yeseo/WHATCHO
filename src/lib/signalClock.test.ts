import { describe, expect, it } from 'vitest';
import { countdownSignal, nextSignalSyncDelay } from './signalClock';

const response = {
  intersectionId: '1',
  signal: {
    straight: { state: 'GREEN' as const, remainingSeconds: 42.5 },
    left: { state: 'RED' as const, remainingSeconds: 18 },
  },
  timestamp: '2026-08-27T00:00:00.000Z',
};

describe('signalClock', () => {
  it('counts down from the client receipt time', () => {
    const signal = countdownSignal({ data: response, receivedAt: 10_000 }, 12_500);
    expect(signal?.signal.straight.remainingSeconds).toBe(40);
    expect(signal?.signal.left?.remainingSeconds).toBe(15.5);
  });

  it('never counts below zero', () => {
    const signal = countdownSignal({ data: response, receivedAt: 10_000 }, 100_000);
    expect(signal?.signal.straight.remainingSeconds).toBe(0);
    expect(signal?.signal.straight.state).toBe('UNKNOWN');
  });

  it('syncs after the nearest phase boundary instead of every few seconds', () => {
    expect(nextSignalSyncDelay(response)).toBe(19_200);
    expect(nextSignalSyncDelay({
      ...response,
      signal: { straight: { state: 'GREEN', remainingSeconds: 120 } },
    })).toBe(60_000);
    expect(nextSignalSyncDelay({
      ...response,
      signal: { straight: { state: 'GREEN', remainingSeconds: 0 } },
    })).toBe(5_000);
  });
});
