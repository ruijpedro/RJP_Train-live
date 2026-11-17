// CP direct travel API — ON-DEMAND NATIONAL OPERATIONAL DATA (LAB ONLY).
// Timetable, delay and stop status are NOT GPS. No automatic queries, secrets,
// locations, or fake confirmations are stored or exported.
export const CP_CONFIG_URL="https://www.cp.pt/fe-config.json";
export const CP_API_HOST="api-gateway.cp.pt";

export function validateCpLookup(number,date){
 const id=String(number??"").trim();
 if(!/^\d{1,6}$/.test(id))throw new Error("Indica um número de comboio válido (1 a 6 algarismos).");
 const d=String(date??"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(d)||Number.isNaN(Date.parse(d+"T12:00:00Z"))||
   new Date(d+"T12:00:00Z").toISOString().slice(0,10)!==d)throw new Error("Data inválida.");
 return {number:id,date:d};
}
function compact(s,max=120){
 return String(s??"").trim().slice(0,max);
}
export function normalizeCpOperational(payload,{number,date,now=Date.now()}){
 const stops=Array.isArray(payload?.trainStops)?payload.trainStops:[];
 if(!payload||typeof payload!=="object"||!Array.isArray(payload.trainStops))
  throw new Error("A CP não devolveu um percurso reconhecível.");
 const delay=typeof payload.delay==="number"&&Number.isFinite(payload.delay)?payload.delay:null;
 const entries=stops.map((s,i)=>({
  index:i+1,stationCode:compact(s?.station?.code,50),
  station:compact(s?.station?.designation||s?.station?.name||"Estação",110),
  scheduledArrival:compact(s?.arrival,20)||null,
  scheduledDeparture:compact(s?.departure,20)||null,
  eta:compact(s?.ETA??s?.eta,20)||null,
  etd:compact(s?.ETD??s?.etd,20)||null,
  delayMinutes:Number.isFinite(s?.delay)?s.delay:null,
  platform:compact(s?.platform,20)||null
 }));
 const type=compact(payload?.serviceCode?.code,20)||"CP";
 const last=compact(payload?.lastStationCode,60)||null;
 return {
  schema:"rjp.cp.operational.v1",number,date,type,
  serviceName:compact(payload?.serviceCode?.designation,100)||null,
  status:compact(payload?.status,50)||"não indicado",
  delayMinutes:delay,lastStationCode:last,
  hasDisruptions:typeof payload?.hasDisruptions==="boolean"?payload.hasDisruptions:null,
  stops:entries,
  lastReportedStation:last?entries.find(x=>x.stationCode===last)?.station??null:null,
  messages:Array.isArray(payload.messages)?payload.messages.slice(0,8).map(m=>({
   type:compact(m?.messageType,35),text:compact(m?.messageText,250)
  })).filter(m=>m.text):[],
  obtainedAt:new Date(now).toISOString(),
  source:"CP — sistema oficial de informação ao passageiro",
  gpsCoordinates:null,hasRealGps:false,isEstimatedPosition:false,
  note:"Consulta operacional de um comboio; não inclui localização GPS do veículo."
 };
}
export function cpApiRoot(config){
 const raw=String(config?.travelApiUrl??"");
 const url=new URL(raw);
 if(url.protocol!=="https:"||url.hostname!==CP_API_HOST||url.username||url.password||url.search||url.hash)
   throw new Error("Configuração da CP: origem da API inesperada.");
 const root=url.toString().replace(/\/+$/,"");
 return root.endsWith("/services/travel-api")?root:root+"/services/travel-api";
}
export async function lookupCpOperational({number,date,transport,now=Date.now()}){
 const req=validateCpLookup(number,date);
 if(typeof transport!=="function")throw new Error("Transporte HTTP indisponível.");
 const config=await transport(CP_CONFIG_URL);
 const root=cpApiRoot(config);
 const fields=["travelApiKey","xcck","xccs"];
 if(fields.some(k=>typeof config?.[k]!=="string"||!config[k]))
  throw new Error("Configuração de acesso CP não disponível.");
 const payload=await transport(root+"/trains/"+encodeURIComponent(req.number)+"/timetable/"+req.date,{
  headers:{
   Accept:"application/json",
   Origin:"https://www.cp.pt",
   Referer:"https://www.cp.pt/",
   "x-api-key":config.travelApiKey,
   "x-cp-connect-id":config.xcck,
   "x-cp-connect-secret":config.xccs
  }
 });
 return normalizeCpOperational(payload,{...req,now});
}
