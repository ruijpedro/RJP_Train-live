const FEED='https://comboios.ruicosta.pt/api/cache/trains/active';
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Methods':'GET,POST,OPTIONS','Access-Control-Allow-Headers':'Content-Type','Cache-Control':'no-store'};
const json=(x,status=200)=>Response.json(x,{status,headers:cors});
const clean=s=>String(s??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').trim().toLowerCase();
function b64url(bytes){return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'')}
function fromPem(pem){return Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s/g,'')),c=>c.charCodeAt(0))}
async function firebaseToken(env){
 const sa=JSON.parse((env.FIREBASE_SERVICE_ACCOUNT||env.FIREBASE_SERVICE_ACCOUNT_JSON));
 const now=Math.floor(Date.now()/1000);
 const header=b64url(new TextEncoder().encode(JSON.stringify({alg:'RS256',typ:'JWT'})));
 const payload=b64url(new TextEncoder().encode(JSON.stringify({iss:sa.client_email,scope:'https://www.googleapis.com/auth/firebase.messaging',aud:'https://oauth2.googleapis.com/token',iat:now,exp:now+3500})));
 const key=await crypto.subtle.importKey('pkcs8',fromPem(sa.private_key),{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['sign']);
 const signature=b64url(new Uint8Array(await crypto.subtle.sign('RSASSA-PKCS1-v1_5',key,new TextEncoder().encode(`${header}.${payload}`))));
 const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion:`${header}.${payload}.${signature}`});
 const r=await fetch('https://oauth2.googleapis.com/token',{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body});
 if(!r.ok)throw Error('Firebase OAuth '+r.status);return {access:(await r.json()).access_token,project:sa.project_id};
}
function timeToMs(clock,now){
 if(typeof clock!=='string'||!/^(?:[01]?\d|2[0-3]):[0-5]\d$/.test(clock))return null;
 const [h,m]=clock.split(':').map(Number);
 const parts=new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now);
 const p=Object.fromEntries(parts.map(x=>[x.type,x.value]));
 // Lisbon wall time offset derived from current instant; use this only for same-day predictions.
 const localAsUtc=Date.UTC(+p.year,+p.month-1,+p.day,+p.hour,+p.minute);
 const offset=localAsUtc-(Math.floor(now.getTime()/60000)*60000);
 return Date.UTC(+p.year,+p.month-1,+p.day,h,m)-offset;
}
function matches(raw,rule,now){
 const fixed=raw.fixed||{},live=raw.data?.status||{},db=raw.db||{};
 const num=String(live.trainNumber??fixed.trainNumber??db.trainNumber??raw.train_id??'');
 if(rule.scope==='train'&&clean(rule.target)!==clean(num))return [];
 const result=[];
 for(const stop of fixed.trainStops||[]){
  const station=stop.station?.designation||'';
  if(rule.scope==='station'&&clean(rule.target)!==clean(station))continue;
  for(const type of ['arrival','departure']){
   if(rule.event!=='both'&&rule.event!==type)continue;
   const clock=type==='arrival'?(stop.ETA||stop.arrival):(stop.ETD||stop.departure);
   const t=timeToMs(clock,now);if(t===null)continue;
   const diff=(t-now.getTime())/60000;
   if(diff<0||diff>Number(rule.lead||10))continue;
   const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
   result.push({key:`${date}|${rule.id}|${num}|${stop.station?.code||station}|${type}|${clock}`,num,station,type,clock});
  }
 }
 return result;
}
async function sendFCM(auth,token,c){
 const title=`Comboio ${c.num} · ${c.type==='arrival'?'chegada':'partida'} prevista`;
 const body=`${c.station} às ${c.clock}. Fonte: WebApp Comboios Live — Rui Costa.`;
 const r=await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${auth.access}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token,notification:{title,body},android:{priority:'high',notification:{channel_id:'rail_push'}}}})});
 return {ok:r.ok,status:r.status};
}
async function check(env){
 if(!env.DB||!(env.FIREBASE_SERVICE_ACCOUNT||env.FIREBASE_SERVICE_ACCOUNT_JSON))return;
 const res=await fetch(FEED,{headers:{Accept:'application/json'}});if(!res.ok)throw Error('Fonte '+res.status);
 const trains=await res.json();if(!Array.isArray(trains))throw Error('Formato da fonte inválido');
 const devices=await env.DB.prepare('SELECT id, token, rules FROM devices').all();
 let auth=null,sent=0;const now=new Date();
 for(const d of devices.results){
  let rules;try{rules=JSON.parse(d.rules)}catch{continue}
  for(const rule of rules){
   if(!rule.enabled)continue;
   for(const raw of trains){
    for(const c of matches(raw,rule,now)){
     const prior=await env.DB.prepare('SELECT 1 FROM deliveries WHERE device_id=? AND alert_key=?').bind(d.id,c.key).first();if(prior)continue;
     if(!auth)auth=await firebaseToken(env);
     const r=await sendFCM(auth,d.token,c);
     if(r.ok){await env.DB.prepare('INSERT OR IGNORE INTO deliveries(device_id,alert_key,created_at) VALUES(?,?,?)').bind(d.id,c.key,Date.now()).run();sent++}
     else if(r.status===404||r.status===400){console.warn('FCM rejected token',r.status)}
    }
   }
  }
 }
 await env.DB.prepare('DELETE FROM deliveries WHERE created_at < ?').bind(Date.now()-4*86400000).run();
 console.log('Rail push notifications sent',sent);
}
export default {
 async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const u=new URL(request.url);
  if(u.pathname==='/'||u.pathname==='/health')return json({ok:true,service:'RJP Train Live API',version:'2.7',source:'Comboios Live — Rui Costa'});
  if(u.pathname==='/api/trains/active'&&request.method==='GET'){
   try{const r=await fetch(FEED,{headers:{Accept:'application/json'}});if(!r.ok)return json({error:'Fonte indisponível'},502);return new Response(r.body,{status:200,headers:{...cors,'Content-Type':'application/json','Cache-Control':'public,max-age=30'}})}catch{return json({error:'Fonte indisponível'},502)}
  }
  if(['/api/push/register','/api/push/rules'].includes(u.pathname)&&request.method==='POST'){
   if(!env.DB)return json({error:'D1 não configurado'},503);
   let b;try{b=await request.json()}catch{return json({error:'JSON inválido'},400)}
   if(typeof b.id!=='string'||b.id.length>100||typeof b.secret!=='string'||b.secret.length<30||b.secret.length>150||typeof b.token!=='string'||b.token.length<20||b.token.length>4096)return json({error:'Dados inválidos'},400);
   const old=await env.DB.prepare('SELECT secret FROM devices WHERE id=?').bind(b.id).first();
   if(old&&old.secret!==b.secret)return json({error:'Sem autorização'},403);
   if(u.pathname.endsWith('/register')){
    await env.DB.prepare('INSERT INTO devices(id,secret,token,rules,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET token=excluded.token,updated_at=excluded.updated_at').bind(b.id,b.secret,b.token,'[]',Date.now()).run();return json({ok:true});
   }
   if(!old)return json({error:'Dispositivo não registado'},404);
   if(!Array.isArray(b.rules)||b.rules.length>30)return json({error:'Máximo de 30 alertas'},400);
   const rules=b.rules.map(r=>({id:String(r.id||'').slice(0,80),scope:r.scope,target:String(r.target||'').slice(0,120),event:r.event,lead:Number(r.lead),enabled:!!r.enabled}));
   if(rules.some(r=>!r.id||!['station','train'].includes(r.scope)||!r.target||!['arrival','departure','both'].includes(r.event)||![5,10,15].includes(r.lead)))return json({error:'Regra inválida'},400);
   await env.DB.prepare('UPDATE devices SET token=?,rules=?,updated_at=? WHERE id=?').bind(b.token,JSON.stringify(rules),Date.now(),b.id).run();return json({ok:true,count:rules.length});
  }
  return json({error:'Not found'},404);
 },
 async scheduled(event,env,ctx){ctx.waitUntil(check(env).catch(e=>console.error('Rail push cron',e)))}
};
