import { describe, expect, it } from 'vitest';
import { relativeDirection, stabilizeDirection } from './compass';

describe('compass', () => {
  it('converts relative turns to compass directions', () => {
    expect(relativeDirection('E', 'straight')).toBe('E');
    expect(relativeDirection('E', 'left')).toBe('N');
    expect(relativeDirection('E', 'right')).toBe('S');
  });

  it('keeps an approach stable around a compass-sector boundary', () => {
    expect(stabilizeDirection('N', 24)).toBe('N');
    expect(stabilizeDirection('N', 34)).toBe('NE');
    expect(stabilizeDirection('E', null)).toBe('E');
  });
});
