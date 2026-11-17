// RJP Train Live 2.0 LAB — scheduled/CP-anchored estimated positions.
// They are NOT GNSS/GPS, operator-reported coordinates, or confirmations of
// actual movement. Straight lines between adjacent GTFS stations are only
// geographical approximations; in particular they may not follow the tracks.
const TERM=new Set(["COMPLETED","ARRIVED","CANCELLED","CANCELED","SUPPRESSED","DELETED","PASSED"]);
export const ESTIMATE_CP_MAX_AGE_MS=300000;
const validGeo=p=>Array.isArray(p)&&p.length===2&&Number.isFinite(p[0])&&Number.isFinite(p[1])&&p[0]>=36&&p[0]<=43&&p[1]>=-11&&p[1]<=-5;
const number=v=>String(v??"").trim();
const canon=v=>number(v).replace(/\D/g,"");
const clamp=v=>Math.max(0,Math.min(1,v));
const norm=v=>number(v).normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g," ").trim();
export function timeMinutes(v){
 const m=number(v).match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
 if(!m||+m[1]>47||+m[2]>59)return null;
 return +m[1]*60+(+m[2]);
}
export function currentLisbon(now=Date.now()){
 const parts=new Intl.DateTimeFormat("en-GB",{timeZone:"Europe/Lisbon",hourCycle:"h23",
  year:"numeric",month:"2-digit",day:"2-digit",hour:"2-digit",minute:"2-digit"}).formatToParts(new Date(now));
 const o=Object.fromEntries(parts.filter(p=>p.type!=="literal").map(p=>[p.type,p.value]));
 return {date:o.year+"-"+o.month+"-"+o.day,minutes:+o.hour*60+(+o.minute)};
}
export function previousServiceDate(today){
 const value=String(today??"");
 if(!/^\d{4}-\d{2}-\d{2}$/.test(value))return null;
 const d=new Date(value+"T12:00:00Z");
 if(!Number.isFinite(d.getTime()))return null;
 return new Date(d.getTime()-86400000).toISOString().slice(0,10);
}
export function interpolateCoords(start,end,fraction){
 return [start[0]+(end[0]-start[0])*fraction,start[1]+(end[1]-start[1])*fraction];
}
function baseResult(train,date,pos,more){
 return {
  kind:"estimated",isGps:false,isEstimate:true,number:number(train.number),tripId:number(train.id),
  type:train.type??"CP",origin:train.origin??"",destination:train.destination??"",
  date,latitude:pos[0],longitude:pos[1],updatedAt:more.updatedAt??null,
  source:more.source,level:more.level,basis:more.basis,
  fromStation:more.fromStation??null,toStation:more.toStation??null,
  progress:more.progress??null,cpStatus:more.cpStatus??null,cpDelayMinutes:more.cpDelayMinutes??null,
  lastCpStation:more.lastCpStation??null,
  note:"Localização APROXIMADA. Não é GPS nem prova de passagem; a reta entre estações pode afastar-se da via férrea."
 };
}
function stopCodeMatch(stop,code,stationName){
 const id=canon(stop?.id),needle=canon(code);
 if(needle&&id&&needle===id)return true;
 return !!stationName&&norm(stop?.name)&&norm(stop?.name)===norm(stationName);
}
function anchorFor(stops,cp){
 const id=cp?.lastStationCode,name=cp?.lastReportedStation;
 const matches=stops.map((s,i)=>stopCodeMatch(s,id,name)?i:-1).filter(i=>i>=0);
 return matches.length===1?matches[0]:-1;
}
function timetablePosition(stops,effective){
 for(let i=0;i<stops.length;i++){
  const here=stops[i];
  const arr=timeMinutes(here.arrival??here.departure);
  const dep=timeMinutes(here.departure??here.arrival);
  if(arr===null||dep===null||!validGeo(here.location))continue;
  if(effective>=arr&&effective<=dep){
   return {point:here.location,fromStation:here.name,toStation:here.name,progress:0};
  }
  if(i+1>=stops.length)continue;
  const next=stops[i+1];
  const end=timeMinutes(next.arrival??next.departure);
  if(end===null||end<=dep||!validGeo(next.location))continue;
  if(effective>=dep&&effective<=end)
   return {point:interpolateCoords(here.location,next.location,clamp((effective-dep)/(end-dep))),
    fromStation:here.name,toStation:next.name,progress:clamp((effective-dep)/(end-dep))};
 }
 return null;
}
export function estimateTrain(train,{date,now=Date.now(),cp=null,cpQueriedAt=null}={}){
 if(!train||!Array.isArray(train.stops)||train.stops.length<2||!number(train.number))return null;
 const clock=currentLisbon(now);
 // A trip starting yesterday may still be running after 00:00 with GTFS
 // stop_times 24:xx / 25:xx. Never show unrelated historic or future dates.
 const today=date===clock.date,overnight=date===previousServiceDate(clock.date);
 if(!today&&!overnight)return null;
 const minutes=clock.minutes+(overnight?1440:0);
 const stops=train.stops;
 const first=timeMinutes(stops[0].departure??stops[0].arrival);
 const last=timeMinutes(stops.at(-1).arrival??stops.at(-1).departure);
 if(first===null||last===null||last<=first)return null;
 const cpTime=Number(new Date(cpQueriedAt??cp?.obtainedAt??0));
 const fresh=cp&&Number.isFinite(cpTime)&&cpTime>0&&cpTime<=now+30000&&now-cpTime<=ESTIMATE_CP_MAX_AGE_MS;
 const status=fresh?number(cp.status).toUpperCase():null;
 if(status&&TERM.has(status))return null;
 const delay=fresh&&Number.isFinite(cp?.delayMinutes)?Math.max(0,Math.min(cp.delayMinutes,180)):0;
 const progressTime=minutes-delay;
 // Outside timetable: only a fresh CP 'in transit' observation can extend
 // a journey up to 60 minutes, never assert it is actually moving from GTFS.
 if(minutes<first-2)return null;
 if(minutes>last+(status==="IN_TRANSIT"?60:0)+delay)return null;
 const cpi=fresh?anchorFor(stops,cp):-1;
 if(fresh&&cpi>=0&&(status==="AT_STATION"||status==="AT_ORIGIN"||status==="NEAR_NEXT")&&validGeo(stops[cpi].location)){
  const s=stops[cpi];
  return baseResult(train,date,s.location,{
   source:"CP + GTFS",level:"cp-anchored",basis:"Estado da CP e última estação indicada (sem GPS)",
   updatedAt:cpTime,fromStation:s.name,toStation:s.name,progress:0,
   cpStatus:status,cpDelayMinutes:cp.delayMinutes,lastCpStation:s.name
  });
 }
 if(fresh&&status==="IN_TRANSIT"&&cpi>=0&&cpi+1<stops.length){
  const a=stops[cpi],b=stops[cpi+1];
  const depart=timeMinutes(a.departure??a.arrival),arrive=timeMinutes(b.arrival??b.departure);
  if(validGeo(a.location)&&validGeo(b.location)&&depart!==null&&arrive!==null&&arrive>depart){
   const ratio=clamp((progressTime-depart)/(arrive-depart));
   return baseResult(train,date,interpolateCoords(a.location,b.location,ratio),{
    source:"CP + GTFS",level:"cp-anchored",basis:"Última estação indicada pela CP + tempos GTFS ajustados pelo atraso comunicado, quando existe",
    updatedAt:cpTime,fromStation:a.name,toStation:b.name,progress:ratio,
    cpStatus:status,cpDelayMinutes:cp.delayMinutes,lastCpStation:a.name
   });
  }
 }
 if(minutes>last+delay||progressTime<first)return null;
 const where=timetablePosition(stops,progressTime);
 if(!where)return null;
 return baseResult(train,date,where.point,{
  source:"GTFS CP",level:"timetable",basis:fresh?
   "Interpolação pelo horário GTFS; estado CP consultado mas sem estação de ancoragem":
   "Interpolação exclusivamente pelo horário GTFS; circulação não confirmada",
  ...where,updatedAt:fresh?cpTime:null,cpStatus:status,
  cpDelayMinutes:fresh?cp.delayMinutes:null,lastCpStation:fresh?cp.lastReportedStation:null
 });
}
export function buildEstimatedPositions({trains=[],date,previousDay=null,now=Date.now(),queries=[],gpsVehicles=[]}={}){
 const clock=currentLisbon(now);
 // No forecast for dates other than today and immediately previous service day.
 if(date!==clock.date)return [];
 const realGps=new Set(gpsVehicles
  .filter(v=>v.agency==="N18KL"&&number(v.trainNumber))
  .map(v=>number(v.trainNumber)));
 const latest=new Map();
 for(const q of queries){
  if(q?.date===date&&q.number)latest.set(number(q.number),q);
 }
 const out=[],seen=new Set();
 const sources=[{date,trains},...(
  previousDay?.date===previousServiceDate(date)&&Array.isArray(previousDay?.trains)
   ?[{date:previousDay.date,trains:previousDay.trains}]:[])];
 for(const source of sources){
  for(const train of source.trains){
   const id=number(train?.number);
   const key=source.date+":"+number(train?.id||id);
   if(!id||seen.has(key)||realGps.has(id))continue;
   seen.add(key);
   // CP status reports for today are not applied to yesterday's service
   // because identical numeric train ids may be reused across dates.
   const q=source.date===date?latest.get(id):null;
   const pos=estimateTrain(train,{date:source.date,now,
    cp:q?.success?q.result:null,cpQueriedAt:q?.result?.obtainedAt});
   if(pos)out.push(pos);
  }
 }
 return out;
}
