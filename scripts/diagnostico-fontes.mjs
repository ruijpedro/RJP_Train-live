const sources={worker:"https://rjp-train-live-api.rjpedro.workers.dev/api/trains/active",rui:"https://comboios.ruicosta.pt/api/cache/trains/active",fertagus:"https://go.tmlmobilidade.pt/hub/api/v1/0XJC9/vehicles/positions",ftProxy:"https://rjp-train-live-api.rjpedro.workers.dev/api/fertagus/positions"};
for(const [name,url] of Object.entries(sources)){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
 try{
  const response=await fetch(url,{signal:controller.signal,headers:{accept:"application/json"}});
  const body=await response.text();let data;try{data=JSON.parse(body)}catch{}
  const rows=Array.isArray(data)?data:Array.isArray(data?.data)?data.data:Array.isArray(data?.trains)?data.trains:Array.isArray(data?.positions)?data.positions:[];
  const sample=rows[0]||{};
  const coords=rows.filter(x=>{const p=x?.data?.status||x?.fixed||x;return Number.isFinite(Number(p.latitude))&&Number.isFinite(Number(p.longitude))&&p.latitude!=null&&p.longitude!=null}).length;
  console.log(JSON.stringify({name,http:response.status,contentType:response.headers.get("content-type"),total:rows.length,withCoordinates:coords,firstFields:Object.keys(sample).slice(0,15),message:!response.ok?body.slice(0,180):undefined}));
 }catch(e){console.log(JSON.stringify({name,error:String(e?.message||e)}))}
 finally{clearTimeout(timer)}
}
