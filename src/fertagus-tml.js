// GO Hub v1 (TML) — discovery only. No production feed is enabled until verified.
// Documentation: https://go.tmlmobilidade.pt/reference/hub/v1/vehicles
export const TML_BASE = "https://go.tmlmobilidade.pt/hub/api";
export const FERTAGUS_AGENCY_ID = "7NTB1";
export function findFertagusOrganizations(organizations) {
  return (Array.isArray(organizations) ? organizations : []).filter(o =>
    Array.isArray(o.agency_ids) && o.agency_ids.includes(FERTAGUS_AGENCY_ID));
}
export function normalizeFertagusPositions(positions, now=Date.now(), maxAgeMs=120000) {
  if (!Array.isArray(positions)) return [];
  return positions.filter(p => {
    if (p?.agency_id !== FERTAGUS_AGENCY_ID) return false;
    const lat=Number(p.latitude), lon=Number(p.longitude);
    const stamp=Number(p.created_at ?? p.received_at);
    return Number.isFinite(lat) && lat>=-90 && lat<=90 &&
      Number.isFinite(lon) && lon>=-180 && lon<=180 &&
      Number.isFinite(stamp) && stamp<=now+10000 && now-stamp<=maxAgeMs;
  }).map(p => ({
    id:"FT:"+String(p.vehicle_id), vehicleId:String(p.vehicle_id),
    tripId:p.trip_id||null, service:"FT", type:"FT",
    latitude:Number(p.latitude), longitude:Number(p.longitude),
    positionTimestamp:Number(p.created_at ?? p.received_at),
    positionSource:"TML GO Hub", positionKind:"gps"
  }));
}
export async function discoverFertagus(fetchJson) {
 const organizations=await fetchJson(TML_BASE+"/v1/organizations");
 return findFertagusOrganizations(organizations?.data).map(o=>({
  organizationId:o._id,
  positionsEnabled:null, // The global /v1/agencies endpoint returns 404; do not infer disabled.
  positionsUrl:TML_BASE+"/v1/"+encodeURIComponent(o._id)+"/vehicles/positions"
 }));
}

// Fetch once for diagnostics. Never use cached or estimated positions as live GPS.
export async function probeFertagusPositions(fetchJson, now=Date.now()) {
 const organizations=await discoverFertagus(fetchJson);
 const diagnostics=[];
 for(const org of organizations) {
  if(!org.positionsEnabled){diagnostics.push({...org,status:org.status||"not-published",count:0});continue}
  try {
   const response=await fetchJson(org.positionsUrl);
   if(!Array.isArray(response?.data))throw Error("Unexpected TML response");
   const positions=normalizeFertagusPositions(response.data,now);
   diagnostics.push({...org,status:positions.length?"gps-available":"no-fresh-gps",count:positions.length,positions});
  }catch(e){diagnostics.push({...org,status:"request-failed",error:String(e?.message||e),count:0})}
 }
 return diagnostics;
}
