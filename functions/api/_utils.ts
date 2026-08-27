export type JsonObject = Record<string, unknown>;

export class UpstreamError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly details: { upstreamStatus?: number; serviceCode?: string } = {},
  ) {
    super(code);
  }
}

export const json = (data: unknown, status = 200, headers: HeadersInit = {}) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json;charset=UTF-8',
      'cache-control': 'no-store',
      ...headers,
    },
  });

export const error = (code: string, status: number) => json({ error: code }, status);

export const isObject = (value: unknown): value is JsonObject =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const objects = (value: unknown): JsonObject[] => {
  if (Array.isArray(value)) return value.filter(isObject);
  if (!isObject(value)) return [];

  for (const key of ['items', 'item', 'data']) {
    const nested = value[key];
    if (Array.isArray(nested)) return nested.filter(isObject);
    if (isObject(nested)) {
      const rows = objects(nested);
      if (rows.length) return rows;
    }
  }

  return [value];
};

export function extractRows(raw: unknown): JsonObject[] {
  if (Array.isArray(raw)) return raw.filter(isObject);
  if (!isObject(raw)) return [];

  const response = isObject(raw.response) ? raw.response : undefined;
  const candidates = [response?.body, raw.body, raw.data, raw.items];
  for (const candidate of candidates) {
    const rows = objects(candidate);
    if (rows.length) return rows;
  }

  return objects(raw);
}

export function extractTotalCount(raw: unknown): number | null {
  if (!isObject(raw)) return null;
  const response = isObject(raw.response) ? raw.response : undefined;
  const candidates = [response?.body, raw.body, raw];
  for (const candidate of candidates) {
    if (!isObject(candidate)) continue;
    const total = Number(candidate.totalCount ?? candidate.totalCnt);
    if (Number.isFinite(total) && total >= 0) return total;
  }
  return null;
}

const envelopeError = (raw: unknown) => {
  if (!isObject(raw)) return null;
  const response = isObject(raw.response) ? raw.response : undefined;
  const header = isObject(response?.header)
    ? response.header
    : isObject(raw.header)
      ? raw.header
      : undefined;
  if (!header) return null;
  const code = String(header.resultCode ?? header.code ?? '').trim();
  const message = String(header.resultMsg ?? header.message ?? '').trim();
  if (!code || ['0', '00', '0000'].includes(code)) return null;
  return { code, message };
};

export function validateId(id: string | null) {
  return id && /^[\w가-힣-]{1,80}$/.test(id) ? id : null;
}

export async function fetchTData(
  url: URL,
  key: string,
  fallbackCode: string,
): Promise<unknown> {
  url.searchParams.set('apiKey', key);
  url.searchParams.set('type', 'json');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4500);

  try {
    const response = await fetch(url, {
      headers: { accept: 'application/json' },
      signal: controller.signal,
    });
    if (response.status === 401 || response.status === 403) {
      throw new UpstreamError('UPSTREAM_AUTH_FAILED', 502, {
        upstreamStatus: response.status,
      });
    }
    if (response.status === 429) {
      throw new UpstreamError('UPSTREAM_RATE_LIMITED', 503, {
        upstreamStatus: response.status,
      });
    }
    if (!response.ok) {
      throw new UpstreamError(fallbackCode, 502, {
        upstreamStatus: response.status,
      });
    }

    let raw: unknown;
    try {
      raw = await response.json();
    } catch {
      throw new UpstreamError(fallbackCode, 502);
    }

    const serviceError = envelopeError(raw);
    if (serviceError) {
      const authError = /AUTH|KEY|인증/i.test(`${serviceError.code} ${serviceError.message}`);
      throw new UpstreamError(authError ? 'UPSTREAM_AUTH_FAILED' : fallbackCode, 502, {
        serviceCode: serviceError.code,
      });
    }
    return raw;
  } catch (caught) {
    if (caught instanceof UpstreamError) throw caught;
    if (caught instanceof DOMException && caught.name === 'AbortError') {
      throw new UpstreamError('UPSTREAM_TIMEOUT', 504);
    }
    throw new UpstreamError(fallbackCode, 504);
  } finally {
    clearTimeout(timer);
  }
}

export function upstreamFailure(caught: unknown, fallbackCode: string) {
  const failure = caught instanceof UpstreamError
    ? caught
    : new UpstreamError(fallbackCode, 504);
  console.error(JSON.stringify({
    message: 'tdata request failed',
    code: failure.code,
    ...failure.details,
  }));
  return error(failure.code, failure.status);
}
