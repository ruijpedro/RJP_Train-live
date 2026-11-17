// Independent train data for original RJP Train Live. Feature-gated, no native changes.
// No timetable estimate is GPS or confirmation of circulation.
import {REMOTE_CP_GTFS,usableManifest} from "./gtfs-sync.js";
import {TML_URL,CP_AGENCY} from "./live-positions.js";
import {buildUnifiedFeed} from "./unified-feed.js";
import {buildEstimatedPositions,currentLisbon} from "./estimated-positions.js";
import {fetchRemoteJson} from "./native-http.js";
import {lookupCpOperational} from "./cp-operational.js";
const CP_SERVICE={U:"Urbano",R:"Regional",IR:"InterRegional",IC:"Intercidades",AP:"Alfa Pendular",SUD:"Sud Expresso",FT:"Fertagus"};
let dayCache=null,lastCPBatch=0,config=null,configAt=0;
const queries=new Map();
export function adaptTrain(v,train=null,{gps=false}={}){
 const lat=Number(v.latitude??v.position?.latitude),lon=Number(v.longitude??v.position?.longitude);
 if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<36||lat>43||lon< -11||lon> -5)return null;
 const type=String(v.type??v.serviceType??train?.type??"R").toUpperCase();
 const num=String(v.number??v.trainNumber??v.vehicleId??"");
 const kind=gps?"operator-gps":v.level==="cp-anchored"?"cp-estimated":"timetable-estimated";
 return {id:num,trainNumber:num,type,service:CP_SERVICE[type]??type,
  latitude:lat,longitude:lon,origin:train?.origin??v.origin??v.journey?.origin??"—",
  destination:train?.destination??v.destination??v.journey?.destination??"—",
  trainStops:(train?.stops??[]).map(s=>({station:{code:s.id,designation:s.name},
   arrival:s.arrival,departure:s.departure,ETA:null,ETD:null})),
  delayMinutes:Number.isFinite(v.cpDelayMinutes)?v.cpDelayMinutes:null,
  lastStation:v.lastCpStation??null,nextStop:v.toStation??null,
  status:gps?"Posição TML publicada, estado CP não verificado":
   v.cpStatus??"Previsão horária; circulação não confirmada",
  source:gps?"TML GO Hub (posições reais)":
    kind==="cp-estimated"?"CP + GTFS (estimativa)":"GTFS CP (previsão horária)",
  positionKind:kind,isGps:gps,estimateBasis:gps?null:v.basis??null,
  positionTimestamp:v.position?.observedAt??null
 };
}
async function getDay(now,transport){
 const date=currentLisbon(now).date;
 if(dayCache?.date===date&&now-dayCache.cachedAt<900000)return dayCache.day;
 const manifest=await transport(REMOTE_CP_GTFS+"manifest.json",{timeoutMs:17000});
 if(!usableManifest(manifest,{date,now}))throw Error("Horários CP atuais indisponíveis");
 const file=manifest.days.find(x=>x.date===date)?.file;
 if(!/^20\d{2}-\d{2}-\d{2}\.json$/.test(String(file??"")))throw Error("GTFS dia inválido");
 const day=await transport(REMOTE_CP_GTFS+file,{timeoutMs:17000});
 if(day?.date!==date||day.realtime!==false||day.gps!==false||!Array.isArray(day.trains))throw Error("GTFS inválido");
 dayCache={day,date,cachedAt:now};return day;
}
async function refreshSmallCpSample(trains,date,now,transport){
 if(now-lastCPBatch<300000)return;
 lastCPBatch=now;
 const types=["IR","IC","AP","R","U"],selected=[];
 for(const type of types){
  const t=trains.find(t=>t.type===type&&/^\d{1,6}$/.test(String(t.number))&&
   !selected.some(x=>x.number===t.number)&&
   (!queries.has(String(t.number))||now-queries.get(String(t.number)).checkedAt>900000));
  if(t)selected.push(t);
 }
 const wrapped=async(url,opts)=>{
  if(url==="https://www.cp.pt/fe-config.json"&&config&&now-configAt<120000)return config;
  const v=await transport(url,opts);
  if(url==="https://www.cp.pt/fe-config.json"){config=v;configAt=now}
  return v;
 };
 for(const t of selected){
  const number=String(t.number);
  try{
   const result=await lookupCpOperational({number,date,transport:wrapped,now:Date.now()});
   queries.set(number,{number,date,success:true,result,checkedAt:Date.now()});
  }catch(e){queries.set(number,{number,date,success:false,checkedAt:Date.now()})}
 }
}
export async function fetchIndependentTrains({now=Date.now(),transport=fetchRemoteJson,sampleCP=true}={}){
 const day=await getDay(now,transport);
 let live=null;
 try{live=await transport(TML_URL,{timeoutMs:12000})}catch(e){console.warn("TML indisponível:",e?.message)}
 if(sampleCP)await refreshSmallCpSample(day.trains,day.date,now,transport);
 const unified=buildUnifiedFeed({cpDay:day,positionsPayload:live,now});
 const byTrip=new Map(day.trains.map(t=>[String(t.id),t]));
 const byNumber=new Map();
 for(const t of day.trains)if(!byNumber.has(String(t.number)))byNumber.set(String(t.number),t);
 const cpGps=unified.vehicles.filter(v=>v.agencyId===CP_AGENCY);
 const gps=cpGps.map(v=>adaptTrain({trainNumber:v.trainNumber??v.vehicleId,
   type:v.serviceType,position:v.position,origin:v.journey?.origin,destination:v.journey?.destination},
   byTrip.get(String(v.journey?.gtfsTripId))??byNumber.get(String(v.trainNumber)),{gps:true})).filter(Boolean);
 const estimates=buildEstimatedPositions({trains:day.trains,date:day.date,now,
  queries:[...queries.values()].filter(q=>q.date===day.date),
  gpsVehicles:cpGps.map(v=>({agency:CP_AGENCY,trainNumber:v.trainNumber}))});
 const scheduled=estimates.map(v=>adaptTrain(v,byTrip.get(String(v.tripId))??byNumber.get(String(v.number)))).filter(Boolean);
 const unique=new Map();
 for(const v of [...scheduled,...gps])unique.set(String(v.trainNumber),v); // GPS has precedence
 if(!unique.size)throw Error("Sem posições CP independentes neste instante");
 const trainList=[...unique.values()];
 return {trains:trainList,source:"CP GTFS + TML",
  gpsCount:gps.length,estimateCount:scheduled.length,
  // Do not pass schedule-only trains as actual movements to notification rules.
  alertEligible:trainList.filter(t=>t.positionKind==="operator-gps"||t.positionKind==="cp-estimated")
 };
}
