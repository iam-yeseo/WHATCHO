import type { ApproachDirection } from '../types';
import { angleDifference, normalizeDirection } from './geo';

export const compassDirections = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'] as const;

export const directionName: Record<ApproachDirection, string> = {
  N: '북쪽',
  NE: '북동쪽',
  E: '동쪽',
  SE: '남동쪽',
  S: '남쪽',
  SW: '남서쪽',
  W: '서쪽',
  NW: '북서쪽',
  UNKNOWN: '방향 확인 중',
};

export function relativeDirection(
  approach: ApproachDirection,
  turn: 'left' | 'straight' | 'right' | 'back',
): ApproachDirection {
  if (approach === 'UNKNOWN') return 'UNKNOWN';
  const offsets = { left: -2, straight: 0, right: 2, back: 4 } as const;
  const index = compassDirections.indexOf(approach);
  return compassDirections[(index + offsets[turn] + compassDirections.length) % compassDirections.length];
}

export function stabilizeDirection(
  previous: ApproachDirection,
  heading: number | null,
  hysteresisDegrees = 10,
): ApproachDirection {
  if (heading == null || !Number.isFinite(heading)) return previous;
  const next = normalizeDirection(heading);
  if (previous === 'UNKNOWN' || next === 'UNKNOWN' || previous === next) return next;
  const previousCenter = compassDirections.indexOf(previous) * 45;
  return angleDifference(previousCenter, heading) <= 22.5 + hysteresisDegrees ? previous : next;
}
