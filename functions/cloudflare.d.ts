interface EventContext<Env> { request: Request; env: Env }
type PagesFunction<Env = unknown> = (context: EventContext<Env>) => Response | Promise<Response>;
interface RequestInitCfProperties { cacheTtl?: number }
