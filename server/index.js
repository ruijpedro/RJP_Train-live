
import express from "express";
import cors from "cors";
const app=express(); app.use(cors());

const RUI=process.env.RUI_COSTA_API||"https://comboios.ruicosta.pt/api/cache/trains/active";
const CP_MAP=process.env.CP_MAP_URL||"https://cptrainmap.duckdns.org/api/trains/active";
const COMBOIOS=process.env.COMBOIOS_API||"http://localhost:3001";

async function getJson(url,ms=12000){
 const c=new AbortController(); const timer=setTimeout(()=>c.abort(),ms);
 try{
  const r=await fetch(url,{signal:c.signal,headers:{accept:"application/json","user-agent":"RJP-Train-Live/2.3"}});
  if(!r.ok) throw Error(`${r.status} ${r.statusText}`);
  const ct=r.headers.get("content-type")||"";
  const text=await r.text();
  try{return JSON.parse(text)}catch{throw Error(`Resposta não JSON (${ct})`)}
 }finally{clearTimeout(timer)}
}
const arr=j=>Array.isArray(j)?j:(j?.trains||j?.data||j?.results||[]);

function ruicosta(x){
 const raw=x?.data||{}, live=raw?.status||{}, fixed=x?.fixed||{}, db=x?.db||{};
 const lat=Number(live.latitude ?? fixed.latitude);
 const lon=Number(live.longitude ?? fixed.longitude);
 const stops=Array.isArray(fixed.trainStops)?fixed.trainStops:[];
 const number=live.trainNumber??fixed.trainNumber??db.trainNumber??x.train_id;
 const delaySec=Number(live.delay);
 const delayMin=Number.isFinite(delaySec)?Math.round(delaySec/60):Number(fixed.delay||0);
 const status=live.status??fixed.status??x.status;
 const lastCode=live.lastStation??fixed.lastStationCode;
 let lastStop=stops.find(s=>s?.station?.code===lastCode);
 let idx=lastStop?stops.indexOf(lastStop):-1;
 let next=idx>=0&&idx<stops.length-1?stops[idx+1]:null;
 return {
   id:String(number??""),
   trainNumber:number,
   service:db?.trainService?.designation??fixed?.trainService?.designation,
   serviceCode:fixed?.trainService?.code??db?.trainService?.code,
   origin:db?.trainOrigin?.designation??fixed?.trainOrigin?.designation??stops[0]?.station?.designation,
   destination:db?.trainDestination?.designation??fixed?.trainDestination?.designation??stops.at(-1)?.station?.designation,
   latitude:Number.isFinite(lat)?lat:null,
   longitude:Number.isFinite(lon)?lon:null,
   delayMinutes:delayMin,
   delaySeconds:Number.isFinite(delaySec)?delaySec:null,
   status,
   lastStation:lastStop?.station?.designation??lastCode,
   lastStationCode:lastCode,
   nextStop:next?.station?.designation??null,
   nextStopCode:next?.station?.code??null,
   hasDisruptions:!!(live.hasDisruptions??fixed.hasDisruptions),
   runDate:live.runDate??null,
   platforms:raw.platforms||{},
   suppressions:raw.suppressions||{},
   trainStops:stops,
   source:"Comboios Live / Rui Costa",
   sourceStatus:x.status,
   ttl:x.ttl
 };
}
function generic(t,source){
 const lat=Number(t.latitude??t.lat??t.position?.latitude);
 const lon=Number(t.longitude??t.lng??t.lon??t.position?.longitude);
 return {...t,
  id:String(t.id??t.trainNumber??t.number??""),
  trainNumber:t.trainNumber??t.number??t.id,
  latitude:Number.isFinite(lat)?lat:null,longitude:Number.isFinite(lon)?lon:null,
  delayMinutes:Number(t.delayMinutes??t.delay??0)||0,source};
}
async function source(name,url,parser=generic){
 try{let j=await getJson(url);return{name,ok:true,trains:arr(j).map(x=>parser(x,name))}}
 catch(e){return{name,ok:false,error:e.message,trains:[]}}
}
function merge(primary,fallback){
 const m=new Map();
 for(const t of [...primary,...fallback]){
  const k=String(t.trainNumber??t.id);
  if(!m.has(k))m.set(k,t);
  else{
   const old=m.get(k);
   // Primary (Rui Costa) remains authoritative; fill only missing coordinates/fields.
   m.set(k,{...t,...old,
    latitude:old.latitude??t.latitude,longitude:old.longitude??t.longitude,
    source:old.source===t.source?old.source:`${old.source} + ${t.source}`
   });
  }
 }
 return [...m.values()];
}
app.get("/api/health",async(req,res)=>{
 const [r,c]=await Promise.all([source("Comboios Live / Rui Costa",RUI,ruicosta),source("CP Map",CP_MAP,generic)]);
 let cr=false,crError=null;try{await getJson(`${COMBOIOS}/ping`,3000);cr=true}catch(e){crError=e.message}
 res.json({ok:r.ok||c.ok||cr,sources:{
  ruiCosta:{ok:r.ok,count:r.trains.length,error:r.error,url:RUI},
  cpMap:{ok:c.ok,count:c.trains.length,error:c.error,url:CP_MAP},
  comboiosRS:{ok:cr,error:crError}
 }});
});
app.get("/api/sources",async(req,res)=>{
 const [r,c]=await Promise.all([source("Comboios Live / Rui Costa",RUI,ruicosta),source("CP Map",CP_MAP,generic)]);
 res.json([{name:r.name,ok:r.ok,count:r.trains.length,error:r.error,primary:true},
 {name:c.name,ok:c.ok,count:c.trains.length,error:c.error,fallback:true},
 {name:"comboios-rs",role:"CP/IP — percursos e atrasos",base:COMBOIOS}]);
});
app.get("/api/trains/active",async(req,res)=>{
 const [r,c]=await Promise.all([source("Comboios Live / Rui Costa",RUI,ruicosta),source("CP Map",CP_MAP,generic)]);
 const trains=merge(r.trains,c.trains);
 if(!trains.length)return res.status(502).json({error:"Nenhuma fonte respondeu",sources:[r,c].map(x=>({name:x.name,ok:x.ok,error:x.error}))});
 res.json({updatedAt:new Date().toISOString(),primary:r.ok?"Comboios Live / Rui Costa":"CP Map",
 sources:[r,c].map(x=>({name:x.name,ok:x.ok,count:x.trains.length,error:x.error})),trains});
});
app.get("/api/train/:id",async(req,res)=>{
 try{
  const data=arr(await getJson(RUI));
  const x=data.find(v=>String(v.train_id??v?.data?.status?.trainNumber??v?.fixed?.trainNumber)===String(req.params.id));
  if(!x)return res.status(404).json({error:"Comboio não encontrado"});
  res.json(ruicosta(x));
 }catch(e){res.status(502).json({error:e.message})}
});
app.listen(process.env.PORT||3000,()=>console.log("RJP Train Live V2.3 API :3000"));
