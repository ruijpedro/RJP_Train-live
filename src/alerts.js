export const ALERTS_KEY='rjp_train_alerts_v26';
export const ALERT_LOG_KEY='rjp_train_alert_log_v26';
export function clean(s){return String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase()}
export function timeToday(hhmm,now=new Date()){
 if(!/^\d{1,2}:\d{2}$/.test(String(hhmm??'')))return null;
 const [h,m]=hhmm.split(':').map(Number);if(h>23||m>59)return null;
 const d=new Date(now);d.setHours(h,m,0,0);return d;
}
export function alertCandidates(trains,alerts,now=new Date()){
 const result=[];
 for(const rule of alerts){
  if(!rule.enabled||!rule.target?.trim())continue;
  for(const train of trains){
   const id=String(train.trainNumber??train.id??'');
   if(['train','combined'].includes(rule.scope)&&clean(id)!==clean(rule.target))continue;
   for(const stop of train.trainStops||[]){
    const station=stop?.station?.designation||'';
    if(rule.scope==='station'&&clean(station)!==clean(rule.target))continue;
    if(rule.scope==='combined'&&clean(station)!==clean(rule.station))continue;
    for(const type of ['arrival','departure']){
     if(rule.event!=='both'&&rule.event!==type)continue;
     const time=type==='arrival'?(stop.ETA||stop.arrival):(stop.ETD||stop.departure);
     const dt=timeToday(time,now);if(!dt)continue;
     // Timetable clock-only values: avoid assuming a service date across midnight.
     const remaining=(dt.getTime()-now.getTime())/60000;
     if(remaining<0||remaining>Number(rule.lead??10))continue;
     const key=[now.toLocaleDateString('sv-SE'),rule.id,id,stop?.station?.code||station,type,time].join('|');
     result.push({key,train:id,station,type,time,remaining,delay:Number(train.delayMinutes||0)});
    }
   }
  }
 }
 return result;
}
export function getSavedAlerts(){try{const a=JSON.parse(localStorage.getItem(ALERTS_KEY)||'[]');return Array.isArray(a)?a:[]}catch{return []}}
export function getAlertLog(){try{return JSON.parse(localStorage.getItem(ALERT_LOG_KEY)||'{}')||{}}catch{return {}}}
export function dispatchAlerts(trains,alerts,now=new Date(),notify=()=>{}){
 const log=getAlertLog();let count=0;
 for(const c of alertCandidates(trains,alerts,now)){
  if(log[c.key])continue;
  log[c.key]=now.getTime();count++;
  notify(c);
 }
 const cutoff=now.getTime()-3*86400000;
 for(const key of Object.keys(log))if(log[key]<cutoff)delete log[key];
 localStorage.setItem(ALERT_LOG_KEY,JSON.stringify(log));return count;
}
