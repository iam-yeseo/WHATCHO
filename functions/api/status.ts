import { json } from './_utils';

export const handleStatus = (env: Env) => json({
  ok: true,
  configured: Boolean(
    env.TDATA_API_KEY && env.TDATA_SIGNAL_API_URL && env.TDATA_INTERSECTION_API_URL
  ),
  timestamp: new Date().toISOString(),
});
