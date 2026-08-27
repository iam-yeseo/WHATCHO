import type { ApiSignalResponse, ApproachDirection, SignalColor, SignalTiming } from '../../src/types';
import {
  error,
  extractRows,
  fetchTData,
  json,
  upstreamFailure,
  validateId,
  type JsonObject,
} from './_utils';

const prefixes: Record<Exclude<ApproachDirection, 'UNKNOWN'>, string> = {
  N: 'nt',
  NE: 'ne',
  E: 'et',
  SE: 'se',
  S: 'st',
  SW: 'sw',
  W: 'wt',
  NW: 'nw',
};

const approaches = new Set<ApproachDirection>([
  'N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW', 'UNKNOWN',
]);

const text = (row: JsonObject, keys: string[]) => {
  for (const key of keys) if (row[key] != null) return String(row[key]);
  return '';
};

const state = (value: string): SignalColor => {
  const normalized = value.trim().toUpperCase();
  if (
    normalized.includes('PROTECTED-MOVEMENT') ||
    normalized.includes('PERMISSIVE-MOVEMENT') ||
    normalized.includes('GREEN') ||
    normalized.includes('녹')
  ) return 'GREEN';
  if (
    normalized.includes('CLEARANCE') ||
    normalized.includes('CAUTION') ||
    normalized.includes('YELLOW') ||
    normalized.includes('황')
  ) return 'YELLOW';
  if (normalized.includes('STOP') || normalized.includes('RED') || normalized.includes('적')) {
    return 'RED';
  }
  return 'UNKNOWN';
};

const timing = (row: JsonObject, prefix: string | undefined, movement: 'Stsg' | 'Ltsg'): SignalTiming => {
  if (!prefix) return { state: 'UNKNOWN', remainingSeconds: null };
  const remaining = Number(row[`${prefix}${movement}RmdrCs`]);
  return {
    state: state(String(row[`${prefix}${movement}StatNm`] ?? '')),
    remainingSeconds: Number.isFinite(remaining) ? remaining / 10 : null,
  };
};

const timestamp = (row: JsonObject) => {
  const value = row.trsmUtcTime ?? row.timestamp ?? row.sendDate ?? row.regDt;
  if (value == null) return new Date().toISOString();
  const numeric = Number(value);
  const date = Number.isFinite(numeric)
    ? new Date(numeric < 10_000_000_000 ? numeric * 1000 : numeric)
    : new Date(String(value));
  return Number.isNaN(date.getTime()) ? new Date().toISOString() : date.toISOString();
};

const approachFrom = (value: string | null): ApproachDirection | null => {
  const normalized = (value ?? 'UNKNOWN').toUpperCase() as ApproachDirection;
  return approaches.has(normalized) ? normalized : null;
};

export function parseSignal(
  raw: unknown,
  id: string,
  approach: ApproachDirection,
): ApiSignalResponse | null {
  const rows = extractRows(raw);
  const row = rows.find((candidate) => String(candidate.itstId ?? candidate.intersectionId ?? '') === id)
    ?? rows[0];
  if (!row) return null;
  const prefix = approach === 'UNKNOWN' ? undefined : prefixes[approach];
  return {
    intersectionId: id,
    intersectionName: text(row, ['intersectionName', 'itstNm', 'crsrdNm']),
    approach,
    signal: {
      straight: timing(row, prefix, 'Stsg'),
      left: timing(row, prefix, 'Ltsg'),
    },
    timestamp: timestamp(row),
  };
}

export async function handleSignals(request: Request, env: Env): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const id = validateId(query.get('intersectionId'));
  if (!id) return error('INVALID_INTERSECTION_ID', 400);
  const approach = approachFrom(query.get('approach'));
  if (!approach) return error('INVALID_APPROACH', 400);

  try {
    const url = new URL(env.TDATA_SIGNAL_API_URL);
    url.searchParams.set('pageNo', '1');
    url.searchParams.set('numOfRows', '10');
    url.searchParams.set('itstId', id);
    const raw = await fetchTData(url, env.TDATA_API_KEY, 'SIGNAL_DATA_UNAVAILABLE');
    const signal = parseSignal(raw, id, approach);
    return signal ? json(signal) : error('SIGNAL_NOT_FOUND', 404);
  } catch (caught) {
    return upstreamFailure(caught, 'SIGNAL_DATA_UNAVAILABLE');
  }
}
