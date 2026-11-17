// RJP Train Live 2.0: only map positions with recorded coordinates and recent timestamps.
// Never create a marker from GTFS times, route shapes or historical positions.
export const CP_AGENCY="N18KL";
export const FT_AGENCY="7NTB1";
export const TML_URL="https://go.tmlmobilidade.pt/hub/api/v1/0XJC9/vehicles/positions";
export const FT_FALLBACK_URL="https://rjp-train-live-api.rjpedro.workers.dev/api/fertagus/positions";

export function asRows(value){
 if(Array.isArray(value))return value;
 for(const key of ["data","positions","vehicles"]){
  if(Array.isArray(value?.[key]))return value[key];
 }
 return [];
}
export function millis(raw){
 if(raw==null||raw==="")return NaN;
 if(typeof raw==="string"&&!/^\d+(?:\.\d+)?$/.test(raw))return Date.parse(raw);
 const n=Number(raw);
 return Number.isFinite(n)?(n<1e11?n*1000:n):NaN;
}
export function classifyCp(row){
 const type=String(row.route_short_name??row.service_code??"").trim().toUpperCase();
 if(["U","R","IR","IC","AP","SUD"].includes(type))return type;
 const match=type.match(/^(AP|IC|IR|SUD|U|R)[ -]?\d+$/);
 return match?match[1]:"CP";
}
export function normalizePositions(payload,{now=Date.now(),maxAgeMs=180000,agencyAllowlist=[CP_AGENCY,FT_AGENCY]}={}){
 const output=[], seen=new Set();
 for(const p of asRows(payload)){
  const agency=String(p?.agency_id??"");
  if(!agencyAllowlist.includes(agency))continue;
  const latitude=Number(p.latitude),longitude=Number(p.longitude);
  const timestamp=millis(p.received_at??p.created_at);
  if(!Number.isFinite(latitude)||!Number.isFinite(longitude)||latitude<36||latitude>43||longitude< -10||longitude> -6)continue;
  if(!Number.isFinite(timestamp)||timestamp>now+15000||now-timestamp>maxAgeMs)continue;
  const vehicleId=String(p.vehicle_id??"").trim();
  if(!vehicleId)continue;
  const key=agency+"/"+vehicleId;
  if(seen.has(key))continue;
  seen.add(key);
  output.push({
   key, agency,vehicleId,
   type:agency===FT_AGENCY?"FT":classifyCp(p),
   operator:agency===FT_AGENCY?"Fertagus":"CP",
   latitude,longitude,timestamp,
   tripId:String(p.trip_id??""),
   route:String(p.route_short_name??p.route_id??""),
   bearing:Number.isFinite(Number(p.bearing))?Number(p.bearing):null,
   speed:Number.isFinite(Number(p.speed))?Number(p.speed):null
  });
 }
 return output;
}
export async function fetchJson(url,timeout=12000){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeout);
 try{
  const response=await fetch(url,{headers:{"Accept":"application/json"},cache:"no-store",signal:controller.signal});
  if(!response.ok)throw Error("HTTP "+response.status);
  return await response.json();
 }finally{clearTimeout(timer)}
}
