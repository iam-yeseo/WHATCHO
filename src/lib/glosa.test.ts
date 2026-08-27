import { describe, expect, it } from 'vitest';
import { calculateGlosaAdvice } from './glosa';

describe('GLOSA guidance', () => {
  it('recommends a reachable speed while the light is green', () => {
    const advice = calculateGlosaAdvice({
      distanceMeters: 180,
      currentSpeedMetersPerSecond: 8.3,
      signal: { state: 'GREEN', remainingSeconds: 25 },
      stale: false,
    });

    expect(advice.tone).toBe('go');
    expect(advice.recommendedSpeedKph).toBe(30);
  });

  it('never recommends unsafe acceleration for a short green window', () => {
    const advice = calculateGlosaAdvice({
      distanceMeters: 400,
      currentSpeedMetersPerSecond: 10,
      signal: { state: 'GREEN', remainingSeconds: 8 },
      stale: false,
    });

    expect(advice.label).toBe('무리한 가속 금지');
    expect(advice.recommendedSpeedKph).toBeNull();
  });

  it('times a gentle approach to the end of a red light', () => {
    const advice = calculateGlosaAdvice({
      distanceMeters: 150,
      currentSpeedMetersPerSecond: 11,
      signal: { state: 'RED', remainingSeconds: 30 },
      stale: false,
    });

    expect(advice.tone).toBe('slow');
    expect(advice.recommendedSpeedKph).toBe(15);
  });

  it('withholds guidance for stale data', () => {
    const advice = calculateGlosaAdvice({
      distanceMeters: 150,
      currentSpeedMetersPerSecond: 8,
      signal: { state: 'GREEN', remainingSeconds: 20 },
      stale: true,
    });

    expect(advice.tone).toBe('idle');
    expect(advice.recommendedSpeedKph).toBeNull();
  });

  it('asks the driver to prepare to stop on yellow', () => {
    const advice = calculateGlosaAdvice({
      distanceMeters: 100,
      currentSpeedMetersPerSecond: 8,
      signal: { state: 'YELLOW', remainingSeconds: 4 },
      stale: false,
    });

    expect(advice.label).toBe('감속 후 정지 준비');
    expect(advice.recommendedSpeedKph).toBeNull();
  });
});
