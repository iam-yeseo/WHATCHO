import { afterEach, describe, expect, it, vi } from 'vitest';
import { normalizeIntersection } from './intersections';
import { parseSignal } from './signals';
import { extractRows, extractTotalCount, fetchTData } from './_utils';

afterEach(() => vi.unstubAllGlobals());

describe('T-DATA adapters', () => {
  it('unwraps the standard response envelope', () => {
    const payload = {
      response: {
        body: {
          totalCount: 2,
          items: { item: [{ itstId: '1' }, { itstId: '2' }] },
        },
      },
    };
    expect(extractRows(payload)).toHaveLength(2);
    expect(extractTotalCount(payload)).toBe(2);
  });

  it('normalizes official crossroad map fields', () => {
    expect(normalizeIntersection({
      itstId: '77',
      itstNm: '롯데백화점도곡',
      mapCtptIntLat: '37.968756',
      mapCtptIntLot: '127.547359',
    })).toEqual({
      id: '77',
      name: '롯데백화점도곡',
      latitude: 37.968756,
      longitude: 127.547359,
    });
  });

  it('selects the requested approach and converts tenths of a second', () => {
    const timestamp = 1_724_900_000_000;
    const signal = parseSignal({
      response: {
        body: {
          items: {
            item: [{
              itstId: '1537',
              itstNm: '테스트 교차로',
              etStsgStatNm: 'protected-Movement-Allowed',
              etStsgRmdrCs: 125,
              etLtsgStatNm: 'stop-And-Remain',
              etLtsgRmdrCs: 87,
              ntStsgStatNm: 'stop-And-Remain',
              trsmUtcTime: timestamp,
            }],
          },
        },
      },
    }, '1537', 'E');

    expect(signal?.signal.straight).toEqual({ state: 'GREEN', remainingSeconds: 12.5 });
    expect(signal?.signal.left).toEqual({ state: 'RED', remainingSeconds: 8.7 });
    expect(signal?.timestamp).toBe(new Date(timestamp).toISOString());
  });

  it('does not guess a signal direction when heading is unknown', () => {
    const signal = parseSignal({ items: [{ itstId: '1537', ntStsgRmdrCs: 50 }] }, '1537', 'UNKNOWN');
    expect(signal?.signal.straight).toEqual({ state: 'UNKNOWN', remainingSeconds: null });
  });

  it('maps T-DATA unknown-client 404 responses to an auth failure without exposing the key', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(
      JSON.stringify({ responseCode: 404 }),
      {
        status: 404,
        headers: { 'x-gateway-error': 'No client found for API Key hidden-value' },
      },
    )));

    await expect(fetchTData(
      new URL('https://t-data.example.test/service'),
      'hidden-value',
      'DATA_UNAVAILABLE',
    )).rejects.toMatchObject({
      code: 'UPSTREAM_AUTH_FAILED',
      details: { upstreamStatus: 404 },
    });
  });
});
