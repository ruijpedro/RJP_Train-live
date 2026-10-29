// Worker independente para distribuir OTA a partir de Cloudflare R2.
// Binding R2 obrigatório: OTA_BUCKET. Não altera o Worker de comboios.
const OBJECT='rjp-train-live-ota-v2.12.1.zip';
export default {
 async fetch(request,env){
  const url=new URL(request.url);
  const headers={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET, HEAD, OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'public, max-age=300'};
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers});
  if(url.pathname==='/health')return Response.json({ok:true,service:'RJP Train Live OTA',storage:!!env.OTA_BUCKET},{headers});
  if(url.pathname!='/ota/v2.12.1.zip'||!['GET','HEAD'].includes(request.method))return new Response('Not found',{status:404,headers});
  if(!env.OTA_BUCKET)return new Response('R2 binding OTA_BUCKET missing',{status:503,headers});
  const object=await env.OTA_BUCKET.head(OBJECT);
  if(!object)return new Response('OTA package not uploaded',{status:404,headers});
  const h=new Headers(headers);
  h.set('Content-Type','application/zip');
  h.set('Content-Length',String(object.size));
  h.set('Accept-Ranges','bytes');
  if(request.method==='HEAD')return new Response(null,{status:200,headers:h});
  const file=await env.OTA_BUCKET.get(OBJECT);
  if(!file)return new Response('OTA package missing',{status:404,headers});
  return new Response(file.body,{status:200,headers:h});
 }
};
