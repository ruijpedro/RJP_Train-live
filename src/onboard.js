import {etaProgress,minutesUntil,trainStopsEta} from './eta.js';

// Pure, presentation-only helpers. No Firebase, persistent alerts or shared GPS.
export function onboardTrainId(train){
  if(!train)return '';
  const number=train.trainNumber??train.number??train.id??train.vehicleId;
  if(number===undefined||number===null||String(number).trim()==='')return '';
  return (train.type==='FT'?'FT:':'CP:')+String(number).trim();
}
export function onboardStops(train){
  return trainStopsEta(train).map((stop,index)=>({
    ...stop,index,
    station:String(stop.station??'').trim()
  })).filter(stop=>stop.station&&stop.station!=='Estação');
}
export function onboardProgress(train){
  const p=etaProgress(train);
  return {lastIndex:p.lastIndex,total:p.stops.length,
    percent:p.lastIndex<0||!p.stops.length?null:Math.round(100*(p.lastIndex+1)/p.stops.length),
    next:p.nextIndex===null?String(train?.nextStop?.designation??train?.nextStop??''):p.stops[p.nextIndex]?.station??''};
}
export function onboardArrivalMinutes(station,train,date=new Date()){
  const stop=onboardStops(train).find(s=>s.station===station);
  return stop?.eta?minutesUntil(stop.eta,date):null;
}
export function gpsSpeedKmh(metersPerSecond){
  const n=Number(metersPerSecond);
  return metersPerSecond===null||metersPerSecond===undefined||!Number.isFinite(n)||n<0?null:Math.round(n*3.6);
}
export function validOnboardPosition(coords){
  const lat=Number(coords?.latitude),lon=Number(coords?.longitude);
  return Number.isFinite(lat)&&Number.isFinite(lon)&&lat>=-90&&lat<=90&&lon>=-180&&lon<=180;
}
