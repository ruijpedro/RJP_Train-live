// Accept only independently supplied geometry for the selected service.
// GeoJSON coordinate order: longitude, latitude. No route means no validation.
export function corridorDistance(sample,geometry){
 if(!Number.isFinite(sample?.latitude)||!Number.isFinite(sample?.longitude))return Infinity;
 const lines=geometry?.type==='LineString'?[geometry.coordinates]:geometry?.type==='MultiLineString'?geometry.coordinates:[];
 const rad=Math.PI/180, k=6371000*rad, x=k*Math.cos(sample.latitude*rad);
 let best=Infinity;
 for(const line of lines||[]){
  if(!Array.isArray(line))continue;
  for(let i=1;i<line.length;i++){
   const a=line[i-1],b=line[i];
   if(!Array.isArray(a)||!Array.isArray(b)||![a[0],a[1],b[0],b[1]].every(Number.isFinite))continue;
   const ax=(a[0]-sample.longitude)*x,ay=(a[1]-sample.latitude)*k,bx=(b[0]-sample.longitude)*x,by=(b[1]-sample.latitude)*k;
   const dx=bx-ax,dy=by-ay,len=dx*dx+dy*dy;
   const t=len?Math.max(0,Math.min(1,-(ax*dx+ay*dy)/len)):0;
   best=Math.min(best,Math.hypot(ax+t*dx,ay+t*dy));
  }
 }
 return best;
}
export function withinCorridor(sample,geometry){
 return Number.isFinite(sample?.accuracy)&&sample.accuracy>0&&sample.accuracy<=50&&corridorDistance(sample,geometry)<=Math.min(80,30+sample.accuracy);
}
