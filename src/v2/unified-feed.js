// RJP unified railway feed v1 — pure, source-attributed merger.
// No timetable interpolation or invented GPS. Third-party position timestamps
// are respected; GTFS does not prove an actual train ran.
import {asRows,normalizePositions,CP_AGENCY,FT_AGENCY,TML_URL} from "./live-positions.js";
export const TML_ETA_URL="https://go.tmlmobilidade.pt/hub/api/v1/0XJC9/eta";
export const TML_ALERTS_URL="https://go.tmlmobilidade.pt/hub/api/v1/alerts";
export const CP_GTFS_URL="https://publico.cp.pt/gtfs/gtfs.zip";
export const IP_STATIONS_URL="https://servicos.infraestruturasdeportugal.pt/pt-pt/estacoes";

const value=v=>String(v??"").trim();
function numericNumber(v) {
 const s=value(v).toUpperCase().replace(/^(?:\[[^\]]+\])+/, "");
 // TML trip ids may include [ORG][AGENCY] prefixes; never use vehicle_id as train number.
 const m=s.match(/^(?:(?:SUD|AP|IC|IR|R|U)\s*)?(\d{3,6})(?:_(\d{8}))?$/);
 return m?m[1]:null;
}
function indexSchedules(trains){
 const trip=new Map(),number=new Map();
 for(const t of trains){
  const id=value(t.id),num=numericNumber(t.number);
  if(id)trip.set(id,t);
  if(num){const a=number.get(num)||[];a.push(t);number.set(num,a)}
 }
 return {trip,number};
}
export function matchCpSchedule(v,schedules){
 if(v.agency!==CP_AGENCY)return {train:null,method:"not-cp"};
 const idx=indexSchedules(schedules);
 const id=value(v.tripId);
 const unprefixed=id.replace(/^(?:\[[^\]]+\])+/, "");
 if(unprefixed&&idx.trip.has(unprefixed))return {train:idx.trip.get(unprefixed),method:"exact-gtfs-trip-id"};
 if(id&&idx.trip.has(id))return {train:idx.trip.get(id),method:"exact-trip-id"};
 // A train number is accepted ONLY when it appears in a dedicated service
 // identity field and maps to a unique GTFS service for the same date.
 for(const [field,input] of [["trip-id-number",id],["route-short-name",v.routeShortName]]){
  const num=numericNumber(input),found=num?idx.number.get(num):null;
  if(found?.length===1)return {train:found[0],method:field};
 }
 return {train:null,method:"unmatched"};
}
function normalizeEta(payload,now,railPositions){
 const tripIds=new Set(railPositions.map(r=>value(r?.trip_id)).filter(Boolean));
 const vehicleIds=new Set(railPositions.map(r=>value(r?.vehicle_id)).filter(Boolean));
 // TML ETA is a global transport feed. Never import bus ETA into a rail package.
 return asRows(payload).filter(r=>{
  if(!r||r.trip_id==null||r.stop_id==null)return false;
  const trip=value(r.trip_id),vehicle=value(r.vehicle_id);
  if(trip&&tripIds.has(trip))return !vehicle||vehicleIds.has(vehicle);
  return !!vehicle&&vehicleIds.has(vehicle)&&(!trip||tripIds.has(trip));
 }).map(r=>{
  const at=Number(r.eta_at);
  return {tripId:value(r.trip_id),vehicleId:value(r.vehicle_id),stopId:value(r.stop_id),
   stopName:value(r.stop_name),stopSequence:Number.isFinite(Number(r.stop_sequence))?Number(r.stop_sequence):null,
   etaAt:Number.isFinite(at)&&at>now-3600000&&at<now+86400000?new Date(at).toISOString():null,
   source:"TML GO Hub ETA",isEstimate:true};
 }).filter(r=>r.etaAt);
}
function normalizeAlerts(payload){
 return asRows(payload).filter(r=>[CP_AGENCY,FT_AGENCY].includes(value(r?.agency_id)))
 .map(r=>({id:value(r._id),agencyId:value(r.agency_id),operator:String(r.agency_id)===FT_AGENCY?"Fertagus":"CP",
 title:value(r.title),description:value(r.description),cause:value(r.cause),effect:value(r.effect),
 validFrom:r.active_period_start_date??null,validUntil:r.active_period_end_date??null,
 references:Array.isArray(r.references)?r.references:[],source:"TML GO Hub Alerts"}));
}
export function buildUnifiedFeed({
 cpDay=null,positionsPayload=null,etaPayload=null,alertsPayload=null,now=Date.now(),sourceResults={}
}={}){
 const generatedAt=new Date(now).toISOString();
 const today=new Intl.DateTimeFormat("en-CA",{timeZone:"Europe/Lisbon",year:"numeric",month:"2-digit",day:"2-digit"}).format(new Date(now));
 const dayMatches=cpDay?.date===today&&Array.isArray(cpDay?.trains);
 const scheduledTrains=dayMatches?cpDay.trains:[];
 const raw=asRows(positionsPayload);
 const visible=normalizePositions(positionsPayload,{now,maxAgeMs:180000});
 const cpRows=raw.filter(r=>value(r?.agency_id)===CP_AGENCY);
 const ftRows=raw.filter(r=>value(r?.agency_id)===FT_AGENCY);
 const eta=normalizeEta(etaPayload,now,[...cpRows,...ftRows]);
 const alerts=normalizeAlerts(alertsPayload);
 const etaByTrip=new Map(),etaByVehicle=new Map();
 for(const e of eta){
  if(e.tripId){const a=etaByTrip.get(e.tripId)||[];a.push(e);etaByTrip.set(e.tripId,a)}
  if(e.vehicleId){const a=etaByVehicle.get(e.vehicleId)||[];a.push(e);etaByVehicle.set(e.vehicleId,a)}
 }
 const vehicles=visible.map(p=>{
  const original=raw.find(r=>value(r?.agency_id)===p.agency&&value(r?.vehicle_id)===p.vehicleId)??{};
  const v={...p,routeShortName:value(original.route_short_name),rideId:value(original.ride_id),
   currentStatus:value(original.current_status)||null,stopId:value(original.stop_id)||null};
  const linked=matchCpSchedule(v,scheduledTrains);
  const train=linked.train;
  const tripEta=etaByTrip.get(v.tripId);
  const etas=tripEta?.length?tripEta:etaByVehicle.get(v.vehicleId)||[];
  return {operator:v.operator,agencyId:v.agency,vehicleId:v.vehicleId,
   trainNumber:train?value(train.number):null,
   serviceType:train?value(train.type):v.type,
   tripId:v.tripId||null,tripIdFromTml:v.tripId||null,
   rideId:v.rideId||null,route:v.route||null,
   position:{latitude:v.latitude,longitude:v.longitude,observedAt:new Date(v.timestamp).toISOString(),
    ageSeconds:Math.max(0,Math.round((now-v.timestamp)/1000)),kind:"operator_reported_coordinates",
    source:"TML GO Hub VehiclePositions",isInterpolated:false},
   journey:train?{gtfsTripId:train.id,origin:train.origin,destination:train.destination,
    scheduledDeparture:train.departure,scheduledArrival:train.arrival}:null,
   match:{method:linked.method,validated:!!train},
   operatingStatus:v.currentStatus,stopId:v.stopId,
   eta:etas.slice(0,30),delayMinutes:null,confirmedCancelled:false};
 });
 const cpValid=vehicles.filter(v=>v.agencyId===CP_AGENCY);
 const ftValid=vehicles.filter(v=>v.agencyId===FT_AGENCY);
 const cpLinked=cpValid.filter(v=>v.match.validated);
 const stat=key=>sourceResults[key]??{status:"not-queried"};
 return {schema:"rjp.trains.unified.v1",generatedAt,expiresAt:new Date(now+180000).toISOString(),
  serviceDate:today,snapshotOnly:true,realTimeAtBuild:true,
  purpose:"Independent evidence package; NOT the production Train Live feed",
  sources:{
   cpGtfs:{url:CP_GTFS_URL,status:dayMatches?"ok":"not-available-for-today",
    kind:"scheduled",providesGps:false,providesOperationalStatus:false},
   tmlPositions:{url:TML_URL,...stat("positions"),kind:"operator_reported_coordinates"},
   tmlEta:{url:TML_ETA_URL,...stat("eta"),kind:"estimated_arrivals"},
   tmlAlerts:{url:TML_ALERTS_URL,...stat("alerts"),kind:"service_alerts"},
   ipStations:{url:IP_STATIONS_URL,status:"reference-only; no API integration verified"},
   cpTravelApi:{status:"authorization-required; not integrated"}
  },
  coverage:{
   cpScheduledToday:scheduledTrains.length,
   cpPositionsPublished:cpRows.length,ftPositionsPublished:ftRows.length,
   cpFreshPositions:cpValid.length,ftFreshPositions:ftValid.length,
   cpMatchedToGtfs:cpLinked.length,cpUnmatched:cpValid.length-cpLinked.length,
   tmlEtaPublishedTotal:asRows(etaPayload).length,tmlRailEtaRecords:eta.length,
   tmlEtaRecords:eta.length,railAlerts:alerts.length,
   cpPositionIsNationalCoverage:false
  },
  vehicles,eta,alerts,
  schedules:{date:dayMatches?today:null,count:scheduledTrains.length,
   // Full scheduled services remain separately in public/data/cp/<date>.json
   location:"public/data/cp/"+today+".json"},
  diagnostics:{
   cpUnmatchedSample:cpValid.filter(v=>!v.match.validated).slice(0,10).map(v=>({
    vehicleId:v.vehicleId,tripId:v.tripId,route:v.route,match:v.match.method})),
   notes:["Only TML coordinates with timestamps <= 3 minutes old are included.",
    "A vehicle ID is not a CP train number.",
    "Unmatched CP positions remain visible, labelled CP, without a fictitious train number.",
    "GTFS scheduled services do not prove circulation, punctuality or GPS location.",
    "Snapshot is invalid after expiresAt; live consumers must fetch again."]}};
}
