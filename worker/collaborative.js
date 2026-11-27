// Experimental pure helpers; no public endpoint or storage enabled.
export const TTL_MS=45000;
export function validateSample(s,now=Date.now()){
 if(!s||!['CP','FT'].includes(s.operator)||typeof s.train!=='string'||!/^\d{1,8}$/.test(s.train))return false;
 if(typeof s.session!=='string'||!/^[a-f0-9-]{36}$/i.test(s.session))return false;
 if(![s.latitude,s.longitude,s.accuracy,s.timestamp].every(Number.isFinite))return false;
 return s.latitude>=36.8&&s.latitude<=42.2&&s.longitude>=-9.6&&s.longitude<=-6&&s.accuracy>0&&s.accuracy<=50&&s.timestamp<=now+5000&&s.timestamp>=now-TTL_MS;
}
export function distance(a,b){
 const rad=Math.PI/180, dlat=(b.latitude-a.latitude)*rad,dlon=(b.longitude-a.longitude)*rad;
 const h=Math.sin(dlat/2)**2+Math.cos(a.latitude*rad)*Math.cos(b.latitude*rad)*Math.sin(dlon/2)**2;
 return 6371000*2*Math.asin(Math.sqrt(Math.min(1,h)));
}
// Agreement is not authentication. Require independently verified route checks
// before publishing any result; session IDs alone cannot prevent Sybil attacks.
export function consensus(samples,now=Date.now()){
 const unique=new Map();
 for(const s of samples){if(!validateSample(s,now))continue;const key=s.operator+'|'+s.train+'|'+s.session; if(!unique.has(key)||unique.get(key).timestamp<s.timestamp)unique.set(key,s);}
 const groups=new Map();
 for(const s of unique.values()){const key=s.operator+'|'+s.train;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(s);}
 const results=[];
 for(const group of groups.values()){
  if(group.length<2||group.some(a=>group.some(b=>distance(a,b)>150||Math.abs(a.timestamp-b.timestamp)>5000)))continue;
  results.push({operator:group[0].operator,train:group[0].train,latitude:group.reduce((n,s)=>n+s.latitude,0)/group.length,longitude:group.reduce((n,s)=>n+s.longitude,0)/group.length,contributors:group.length,timestamp:Math.min(...group.map(s=>s.timestamp)),verified:false});
 }
 return results;
}
