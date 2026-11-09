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
  const matching=findFertagusOrganizations(organizations?.data);
  const results=[];
  for(const organization of matching) {
    const url=TML_BASE+"/v1/"+encodeURIComponent(organization._id)+"/agencies";
    const response=await fetchJson(url);
    const agency=(response?.data||[]).find(a=>a._id===FERTAGUS_AGENCY_ID);
    results.push({organizationId:organization._id,positionsEnabled:agency?.services?.positions_enabled===true});
  }
  return results;
}
