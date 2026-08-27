export interface Env{TDATA_API_KEY?:string;TDATA_SIGNAL_API_URL?:string;TDATA_INTERSECTION_API_URL?:string}
export const json=(data:unknown,status=200,headers:HeadersInit={})=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json;charset=UTF-8','cache-control':'no-store',...headers}});
export const error=(code:string,status:number)=>json({error:code},status);
export function validateId(id:string|null){return id&&/^[\w가-힣-]{1,80}$/.test(id)?id:null}
export async function upstream(url:URL,key:string){url.searchParams.set('apiKey',key);const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),4500);try{return await fetch(url,{headers:{accept:'application/json'},signal:controller.signal})}finally{clearTimeout(timer)}}
