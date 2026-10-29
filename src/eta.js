// Presentation-only ETA calculations. Never changes push rules or server scheduling.
export function clockMinutes(value){
 if(value==null)return null;
 const raw=String(value).trim();
 const match=raw.match(/(?:^|T|\s)(\d{1,2}):(\d{2})(?::\d{2})?(?:$|[Z+\-])/i)||raw.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
 if(!match)return null;
 const h=Number(match[1]),m=Number(match[2]);
 return h<24&&m<60?h*60+m:null;
}
export function formatMinutes(minutes){
 if(!Number.isFinite(minutes))return '—';
 const value=((Math.round(minutes)%1440)+1440)%1440;
 return `${String(Math.floor(value/60)).padStart(2,'0')}:${String(value%60).padStart(2,'0')}`;
}
export function trainDelay(train){
 const value=train?.delayMinutes??train?.delay;
 if(value===null||value===undefined||value==='')return null;
 const delay=Number(value);
 return Number.isFinite(delay)?delay:null;
}
export function stopEta(stop,train){
 const scheduled=clockMinutes(stop?.arrival??stop?.scheduledArrival??stop?.arrivalTime??stop?.ETA);
 const delay=trainDelay(train);
 const reported=clockMinutes(stop?.estimatedArrival??stop?.predictedArrival);
 return {scheduled:scheduled===null?null:formatMinutes(scheduled),eta:reported!==null?formatMinutes(reported):(scheduled!==null&&delay!==null?formatMinutes(scheduled+delay):null),delay,source:reported!==null?'fonte':scheduled!==null&&delay!==null?'calculado':'indisponível'};
}
export function trainStopsEta(train){return (Array.isArray(train?.trainStops)?train.trainStops:[]).map((stop,index)=>({key:String(stop?.station?.code??index)+'-'+index,station:stop?.station?.designation??stop?.station?.code??'Estação',...stopEta(stop,train)}));}

// Presentation helpers: no mutation of alert rules, Firebase tokens or Worker state.
export function minutesUntil(hhmm, now=new Date()){
 const target=clockMinutes(hhmm);
 if(target===null)return null;
 const current=now.getHours()*60+now.getMinutes()+now.getSeconds()/60;
 const delta=target-current;
 // A clock-only timetable cannot identify the service day reliably.
 // Only present a countdown for the near future, including midnight rollover.
 const candidate=delta < -720 ? delta+1440 : delta;
 return candidate>=0&&candidate<=360?Math.ceil(candidate):null;
}
export function etaProgress(train){
 const stops=trainStopsEta(train);
 const last=String(train?.lastStation??'').trim().toLocaleLowerCase('pt-PT');
 const index=stops.findIndex(s=>s.station.toLocaleLowerCase('pt-PT')===last);
 return {stops,lastIndex:index,nextIndex:index>=0&&index+1<stops.length?index+1:null};
}
