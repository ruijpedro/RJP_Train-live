// Deterministic multi-source reconciliation. This module does not fetch external data.
// Do not merge without operator, service date and a stable matching service identifier.
const str=v=>String(v??"").trim().toLowerCase();
const stamp=v=>{const n=Date.parse(v??"");return Number.isFinite(n)?n:null};
const fields=["delayMinutes","origin","destination","nextStop","lastStation","trainStops","service","status"];
function key(v){
 const operator=str(v.operator),day=str(v.serviceDate),id=str(v.serviceId);
 return operator&&/^\d{4}-\d{2}-\d{2}$/.test(day)&&id?`${operator}|${day}|${id}`:null;
}
function validPosition(v){return Number.isFinite(Number(v.latitude))&&Number.isFinite(Number(v.longitude))&&Number(v.latitude)>=-90&&Number(v.latitude)<=90&&Number(v.longitude)>=-180&&Number(v.longitude)<=180}
export function reconcileVehicles(records,{maxAgeMs=5*60*1000,now=Date.now()}={}){
 const groups=new Map(),unmatched=[];
 for(const raw of records){
  const v={...raw};const k=key(v);
  if(!k){unmatched.push({...v,provenance:v.source?{source:v.source}:null});continue}
  const group=groups.get(k)||[];group.push(v);groups.set(k,group);
 }
 const merged=[...unmatched];
 for(const group of groups.values()){
  const sorted=[...group].sort((a,b)=>(stamp(b.observedAt)??-Infinity)-(stamp(a.observedAt)??-Infinity));
  const latest=sorted[0],out={...latest,sources:[...new Set(group.map(v=>v.source).filter(Boolean))],provenance:{}};
  for(const f of fields){
   const candidate=sorted.find(v=>{
    if(v[f]==null||v[f]==="")return false;
    if(f==="latitude"||f==="longitude")return validPosition(v);
    return true;
   });
   if(candidate){out[f]=candidate[f];out.provenance[f]={source:candidate.source??"unknown",observedAt:candidate.observedAt??null}}
  }
  const location=sorted.find(v=>validPosition(v));
  if(location){out.latitude=Number(location.latitude);out.longitude=Number(location.longitude);out.provenance.latitude={source:location.source??"unknown",observedAt:location.observedAt??null};out.provenance.longitude=out.provenance.latitude}
  else{out.latitude=null;out.longitude=null}
  const locationTime=stamp(out.provenance.latitude?.observedAt);
  if(locationTime===null||locationTime>now+60000||now-locationTime>maxAgeMs){
   out.latitude=null;out.longitude=null;out.positionStatus="unverified";
  }else out.positionStatus="current";
  merged.push(out);
 }
 return merged;
}
