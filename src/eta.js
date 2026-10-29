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
