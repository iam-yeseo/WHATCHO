import { distanceMeters } from '../../src/lib/geo';
import type { Intersection } from '../../src/types';
import {
  error,
  extractRows,
  extractTotalCount,
  fetchTData,
  isObject,
  json,
  upstreamFailure,
  type JsonObject,
} from './_utils';

const PAGE_SIZE = 1000;
const MAX_PAGES = 5;
const CATALOG_CACHE_SECONDS = 60 * 60;
const CATALOG_CACHE_KEY = new Request('https://cache.whatcho.internal/tdata/intersections-v2');

export function normalizeIntersection(row: JsonObject): Intersection | null {
  const id = String(row.intersectionId ?? row.itstId ?? row.id ?? '').trim();
  const name = String(
    row.intersectionName ?? row.itstNm ?? row.name ?? '이름 없는 교차로',
  );
  const latitude = Number(row.mapCtptIntLat ?? row.latitude ?? row.lat ?? row.y);
  const longitude = Number(row.mapCtptIntLot ?? row.longitude ?? row.lng ?? row.x);
  if (!id || !Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
  return { id, name, latitude, longitude };
}

const readCachedCatalog = async (response: Response): Promise<Intersection[] | null> => {
  const raw: unknown = await response.json();
  if (!isObject(raw) || !Array.isArray(raw.intersections)) return null;
  const rows = raw.intersections.filter(isObject);
  const intersections = rows.map(normalizeIntersection).filter((item): item is Intersection => Boolean(item));
  return intersections.length ? intersections : null;
};

async function fetchCatalog(env: Env): Promise<Intersection[]> {
  const catalog: Intersection[] = [];
  let totalCount: number | null = null;

  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const url = new URL(env.TDATA_INTERSECTION_API_URL);
    url.searchParams.set('pageNo', String(page));
    url.searchParams.set('numOfRows', String(PAGE_SIZE));
    const raw = await fetchTData(url, env.TDATA_API_KEY, 'INTERSECTION_DATA_UNAVAILABLE');
    const rows = extractRows(raw);
    totalCount ??= extractTotalCount(raw);
    catalog.push(
      ...rows.map(normalizeIntersection).filter((item): item is Intersection => Boolean(item)),
    );

    if (rows.length === 0) break;
    if (totalCount !== null && catalog.length >= totalCount) break;
    if (totalCount === null && rows.length < PAGE_SIZE) break;
  }

  const unique = new Map(catalog.map((intersection) => [intersection.id, intersection]));
  return [...unique.values()];
}

async function intersectionCatalog(env: Env, ctx: ExecutionContext) {
  const cache = await caches.open('whatcho-intersections');
  const cached = await cache.match(CATALOG_CACHE_KEY);
  if (cached) {
    const catalog = await readCachedCatalog(cached);
    if (catalog) return catalog;
  }

  const catalog = await fetchCatalog(env);
  const response = json(
    { intersections: catalog },
    200,
    { 'cache-control': `public, max-age=${CATALOG_CACHE_SECONDS}` },
  );
  ctx.waitUntil(cache.put(CATALOG_CACHE_KEY, response));
  return catalog;
}

export async function handleIntersections(
  request: Request,
  env: Env,
  ctx: ExecutionContext,
): Promise<Response> {
  const query = new URL(request.url).searchParams;
  const latitude = Number(query.get('lat'));
  const longitude = Number(query.get('lng'));
  const requestedRadius = Number(query.get('radius')) || 1500;
  const radius = Math.min(Math.max(requestedRadius, 100), 3000);
  if (
    !Number.isFinite(latitude) || latitude < -90 || latitude > 90 ||
    !Number.isFinite(longitude) || longitude < -180 || longitude > 180
  ) {
    return error('INVALID_LOCATION', 400);
  }

  try {
    const catalog = await intersectionCatalog(env, ctx);
    const intersections = catalog
      .map((intersection) => ({
        ...intersection,
        distanceMeters: distanceMeters({ latitude, longitude }, intersection),
      }))
      .filter((intersection) => intersection.distanceMeters <= radius)
      .sort((a, b) => a.distanceMeters - b.distanceMeters)
      .map(({ distanceMeters: _distanceMeters, ...intersection }) => intersection);
    return json({ intersections });
  } catch (caught) {
    return upstreamFailure(caught, 'INTERSECTION_DATA_UNAVAILABLE');
  }
}
