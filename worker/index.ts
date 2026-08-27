import { handleIntersections } from '../functions/api/intersections';
import { error } from '../functions/api/_utils';
import { handleSignals } from '../functions/api/signals';
import { handleStatus } from '../functions/api/status';

const methodNotAllowed = () =>
  new Response(JSON.stringify({ error: 'METHOD_NOT_ALLOWED' }), {
    status: 405,
    headers: {
      allow: 'GET',
      'content-type': 'application/json;charset=UTF-8',
      'cache-control': 'no-store',
    },
  });

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname.startsWith('/api/') && request.method !== 'GET') return methodNotAllowed();

    try {
      if (pathname === '/api/status') return handleStatus(env);
      if (pathname === '/api/intersections') return handleIntersections(request, env, ctx);
      if (pathname === '/api/signals') return handleSignals(request, env);
      if (pathname.startsWith('/api/')) return error('NOT_FOUND', 404);
      return env.ASSETS.fetch(request);
    } catch (caught) {
      console.error(JSON.stringify({
        message: 'unhandled worker error',
        path: pathname,
        error: caught instanceof Error ? caught.name : 'UnknownError',
      }));
      return error('INTERNAL_ERROR', 500);
    }
  },
} satisfies ExportedHandler<Env>;
