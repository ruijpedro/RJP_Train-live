// Public JSON published separately by scheduled CP GTFS importer.
// A fresh timetable is NOT evidence of current operating status or GPS.
export const REMOTE_CP_GTFS="https://raw.githubusercontent.com/ruijpedro/RJP-Train-Live-2/rjp-train-2-gtfs-live/data/cp/";
export function usableManifest(m,{date,now=Date.now(),maxAgeMs=72*3600000}={}){
 if(!m||!Array.isArray(m.days)||!m.days.length||m.realtime!==false||m.gps!==false)return false;
 if(!m.days.some(d=>d.date===date&&typeof d.file==="string"))return false;
 const timestamp=Date.parse(m.generatedAt);
 if(!Number.isFinite(timestamp)||timestamp>now+300000||now-timestamp>maxAgeMs)return false;
 return true;
}
