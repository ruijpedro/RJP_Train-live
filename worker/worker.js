const FEED="https://comboios.ruicosta.pt/api/cache/trains/active";
function cors(origin){
 return {
  "Access-Control-Allow-Origin": origin || "*",
  "Access-Control-Allow-Methods":"GET,OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type",
  "Cache-Control":"public, max-age=30"
 };
}
export default {
 async fetch(request){
  const u=new URL(request.url);
  const origin=request.headers.get("Origin")||"*";
  if(request.method==="OPTIONS") return new Response(null,{status:204,headers:cors(origin)});
  if(u.pathname==="/health") return Response.json({ok:true,service:"RJP Train Live Proxy"});
  if(u.pathname!=="/api/trains/active") return new Response("Not found",{status:404,headers:cors(origin)});
  try{
   const r=await fetch(FEED,{headers:{"Accept":"application/json","User-Agent":"RJP-Train-Live/2.4"}});
   if(!r.ok) return Response.json({error:`upstream ${r.status}`},{status:502,headers:cors(origin)});
   const body=await r.text();
   return new Response(body,{status:200,headers:{...cors(origin),"Content-Type":"application/json; charset=utf-8"}});
  }catch(e){
   return Response.json({error:"upstream unavailable"},{status:502,headers:cors(origin)});
  }
 }
};