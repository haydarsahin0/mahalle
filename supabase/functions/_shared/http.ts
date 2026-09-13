// Shared HTTP plumbing: CORS for the published site and a single error shape for the client.
const ALLOWED=(Deno.env.get('CLIENT_ORIGIN')||'*').split(',').map(o=>o.trim());

export function cors(request:Request){
 const origin=request.headers.get('origin')||'';
 const allow=ALLOWED.includes('*')?'*':ALLOWED.includes(origin)?origin:ALLOWED[0]||'';
 return {'Access-Control-Allow-Origin':allow,'Access-Control-Allow-Headers':'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods':'POST, OPTIONS','Vary':'Origin'};}

export const json=(body:unknown,request:Request,status=200)=>
 new Response(JSON.stringify(body),{status,headers:{...cors(request),'Content-Type':'application/json','Cache-Control':'no-store'}});

export const fail=(message:string,request:Request,status=400)=>json({error:message},request,status);

export function preflight(request:Request){return request.method==='OPTIONS'?new Response('ok',{headers:cors(request)}):null;}
