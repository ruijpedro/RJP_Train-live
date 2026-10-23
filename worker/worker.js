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
const lisbonDay = now => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
const lisbonWeekday = now => {const wd=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Lisbon',weekday:'short'}).format(now);return ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(wd)};
function activeDay(rule,now){return !Array.isArray(rule.days)||rule.days.includes(lisbonWeekday(now))}
function trainNumber(raw){return String(raw.data?.status?.trainNumber??raw.fixed?.trainNumber??raw.db?.trainNumber??raw.train_id??'')}
function matches(raw,rule,now){
 const fixed=raw.fixed||{},live=raw.data?.status||{},db=raw.db||{};
 const num=String(live.trainNumber??fixed.trainNumber??db.trainNumber??raw.train_id??'');
 if(['train','combined'].includes(rule.scope)&&clean(rule.target)!==clean(num))return [];
 if(!activeDay(rule,now)||rule.notifyBefore===false)return [];
 const result=[];
 for(const stop of fixed.trainStops||[]){
  const station=stop.station?.designation||'';
  if(rule.scope==='station'&&clean(rule.target)!==clean(station))continue;
  if(rule.scope==='combined'&&clean(rule.station)!==clean(station))continue;
  for(const type of ['arrival','departure']){
   if(rule.event!=='both'&&rule.event!==type)continue;
   const clock=type==='arrival'?(stop.ETA||stop.arrival):(stop.ETD||stop.departure);
   const t=timeToMs(clock,now);if(t===null)continue;
   const diff=(t-now.getTime())/60000;
   if(diff<0||diff>Number(rule.lead??10))continue;
   const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit'}).format(now);
   result.push({key:`${date}|${rule.id}|${num}|${stop.station?.code||station}|${type}|pre`,num,station,type,clock,kind:'pre'});
  }
 }
 return result;
}
async function sendFCM(auth,token,c){
 const title=c.test?'RJP Train Live · Teste remoto':c.kind==='detected'?`Comboio ${c.num} · passagem detetada`:`Comboio ${c.num} · ${c.type==='arrival'?'chegada':'partida'} prevista`;
 const body=c.test?'Notificação enviada pelo Cloudflare e Firebase com a APK fechada.':c.kind==='detected'?`Monte Real: atualização da última estação reportada para ${c.station}. Não é confirmação de paragem. Fonte: Comboios Live.`:`${c.station} às ${c.clock}. Fonte: WebApp Comboios Live — Rui Costa.`;
 const r=await fetch(`https://fcm.googleapis.com/v1/projects/${auth.project}/messages:send`,{method:'POST',headers:{Authorization:`Bearer ${auth.access}`,'Content-Type':'application/json'},body:JSON.stringify({message:{token,notification:{title,body},android:{priority:'high',notification:{channel_id:'rail_push'}}}})});
 if(!r.ok)console.error('FCM envio falhou',r.status,(await r.text()).slice(0,400));return {ok:r.ok,status:r.status};
}
async function runTests(env){
 const rows=await env.DB.prepare("SELECT q.device_id AS id,s.fcm_token AS token FROM push_test_queue q JOIN push_subscriptions s ON s.device_id=q.device_id WHERE q.due_at <= CURRENT_TIMESTAMP AND s.enabled=1 LIMIT 20").all();
 let auth=null;
 for(const d of rows.results){
  try{if(!auth)auth=await firebaseToken(env);const r=await sendFCM(auth,d.token,{test:true});
   if(r.ok)await env.DB.prepare('DELETE FROM push_test_queue WHERE device_id=?').bind(d.id).run();
   else console.error('Push teste recusado',d.id,r.status);
  }catch(e){console.error('Push teste falhou',d.id,e.message)}
 }
}
async function check(env){
 if(!env.DB||!(env.FIREBASE_SERVICE_ACCOUNT||env.FIREBASE_SERVICE_ACCOUNT_JSON))return;
 await runTests(env);
 const res=await fetch(FEED,{headers:{Accept:'application/json'}});if(!res.ok)throw Error('Fonte '+res.status);
 const trains=await res.json();if(!Array.isArray(trains))throw Error('Formato da fonte inválido');
 const devices=await env.DB.prepare('SELECT device_id AS id, fcm_token AS token, rules FROM push_subscriptions WHERE enabled=1').all();
 let auth=null,sent=0;const now=new Date();
 // Compare the last reported station with the previous cron observation.
 // This is a detected station passage, NOT a confirmed arrival or stop.
 const transitions=new Map();
 for(const raw of trains){
  const num=trainNumber(raw),last=String(raw.data?.status?.lastStation??'').trim();
  if(!num||!last)continue;
  const old=await env.DB.prepare('SELECT last_station, service_day FROM train_observations WHERE train_number=?').bind(num).first();
  const day=lisbonDay(now);
  if(old?.service_day===day && old.last_station!==last)transitions.set(num,last);
  await env.DB.prepare('INSERT INTO train_observations(train_number,last_station,service_day,updated_at) VALUES(?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(train_number) DO UPDATE SET last_station=excluded.last_station,service_day=excluded.service_day,updated_at=CURRENT_TIMESTAMP').bind(num,last,day).run();
 }
 for(const d of devices.results){
  let rules;try{rules=JSON.parse(d.rules)}catch{continue}
  for(const rule of rules){
   if(!rule.enabled)continue;
   for(const raw of trains){
    const candidates=matches(raw,rule,now);
    if(rule.notifyOnArrival===true&&rule.event!=='departure'&&activeDay(rule,now)){
     const num=trainNumber(raw),last=transitions.get(num);
     if(last&&(['train','combined'].includes(rule.scope)?clean(rule.target)===clean(num):true)){
      for(const stop of raw.fixed?.trainStops||[]){
       const station=stop.station?.designation||'',code=String(stop.station?.code||'');
       if(clean(code)!==clean(last))continue;
       if(rule.scope==='station'&&clean(rule.target)!==clean(station))continue;
       if(rule.scope==='combined'&&clean(rule.station)!==clean(station))continue;
       candidates.push({key:`${lisbonDay(now)}|${rule.id}|${num}|${code}|detected`,num,station,type:'arrival',kind:'detected'});
      }
     }
    }
    for(const c of candidates){
     const prior=await env.DB.prepare('SELECT 1 FROM notification_history WHERE device_id=? AND event_key=?').bind(d.id,c.key).first();if(prior)continue;
     if(!auth)auth=await firebaseToken(env);
     const r=await sendFCM(auth,d.token,c);
     if(r.ok){await env.DB.prepare('INSERT OR IGNORE INTO notification_history(device_id,alert_id,train_number,station_code,event_type,event_key) VALUES(?,?,?,?,?,?)').bind(d.id,Number(rule.dbid)||0,c.num,c.station,c.type,c.key).run();sent++}
     else if(r.status===404||r.status===400){console.warn('FCM rejected token',r.status)}
    }
   }
  }
 }
 await env.DB.prepare("DELETE FROM notification_history WHERE sent_at < datetime('now','-4 days')").run();
 console.log('Rail push notifications sent',sent);
}
export default {
 async fetch(request,env){
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:cors});
  const u=new URL(request.url);
  if(u.pathname==='/'||u.pathname==='/health')return json({ok:true,service:'RJP Train Live API',version:'2.9.0',source:'Comboios Live — Rui Costa'});
  if(u.pathname==='/api/trains/active'&&request.method==='GET'){
   try{const r=await fetch(FEED,{headers:{Accept:'application/json'}});if(!r.ok)return json({error:'Fonte indisponível'},502);return new Response(r.body,{status:200,headers:{...cors,'Content-Type':'application/json','Cache-Control':'public,max-age=30'}})}catch{return json({error:'Fonte indisponível'},502)}
  }
  if(['/api/push/register','/api/push/rules','/api/push/test'].includes(u.pathname)&&request.method==='POST'){
   if(!env.DB)return json({error:'D1 não configurado'},503);
   let b;try{b=await request.json()}catch{return json({error:'JSON inválido'},400)}
   if(typeof b.id!=='string'||b.id.length>100||typeof b.secret!=='string'||b.secret.length<30||b.secret.length>150||typeof b.token!=='string'||b.token.length<20||b.token.length>4096)return json({error:'Dados inválidos'},400);
   const old=await env.DB.prepare('SELECT device_secret AS secret FROM push_subscriptions WHERE device_id=?').bind(b.id).first();
   if(old&&old.secret!==b.secret)return json({error:'Sem autorização'},403);
   if(u.pathname.endsWith('/register')){
    await env.DB.prepare('INSERT INTO push_subscriptions(device_id,device_secret,fcm_token,rules,updated_at) VALUES(?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(device_id) DO UPDATE SET fcm_token=excluded.fcm_token,updated_at=CURRENT_TIMESTAMP').bind(b.id,b.secret,b.token,'[]').run();return json({ok:true});
   }
   if(!old)return json({error:'Dispositivo não registado'},404);
   if(u.pathname.endsWith('/test')){await env.DB.prepare("INSERT INTO push_test_queue(device_id,due_at) VALUES(?,datetime('now','+60 seconds')) ON CONFLICT(device_id) DO UPDATE SET due_at=excluded.due_at").bind(b.id).run();return json({ok:true,delay_seconds:60})}
   if(!Array.isArray(b.rules)||b.rules.length>30)return json({error:'Máximo de 30 alertas'},400);
   const rules=b.rules.map(r=>({id:String(r.id||'').slice(0,80),scope:r.scope,target:String(r.target||'').slice(0,120),station:String(r.station||'').slice(0,120),event:r.event,lead:Number(r.lead),enabled:!!r.enabled,days:Array.isArray(r.days)?r.days.map(Number):[0,1,2,3,4,5,6],notifyBefore:r.notifyBefore!==false,notifyOnArrival:r.notifyOnArrival===true}));
   if(rules.some(r=>!r.id||!['station','train','combined'].includes(r.scope)||(r.scope==='combined'&&!r.station)||!r.target||!['arrival','departure','both'].includes(r.event)||!Number.isInteger(r.lead)||r.lead<0||r.lead>1440||!Array.isArray(r.days)||r.days.length===0||r.days.some(d=>!Number.isInteger(d)||d<0||d>6)||(!r.notifyBefore&&!r.notifyOnArrival)))return json({error:'Regra inválida'},400);
   await env.DB.prepare('UPDATE push_subscriptions SET fcm_token=?,rules=?,updated_at=CURRENT_TIMESTAMP WHERE device_id=?').bind(b.token,JSON.stringify(rules),b.id).run();return json({ok:true,count:rules.length});
  }
  return json({error:'Not found'},404);
 },
 async scheduled(event,env,ctx){ctx.waitUntil(check(env).catch(e=>console.error('Rail push cron',e)))}
};
