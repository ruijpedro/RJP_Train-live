
import React,{useEffect,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Capacitor}from"@capacitor/core";
import{LocalNotifications}from"@capacitor/local-notifications";
import{PushNotifications}from"@capacitor/push-notifications";
import{initPush,savePushRules,pushState,scheduleRemotePushTest}from"./push.js";
import{trainStopsEta}from"./eta.js";
import L from"leaflet";import"./style.css";
import{getSavedAlerts,dispatchAlerts,ALERTS_KEY}from"./alerts.js";
const DEFAULT_API="https://rjp-train-live-api.rjpedro.workers.dev/api";
const BUILD_API=(import.meta.env.VITE_API_URL||"").replace(/\/$/,"");
// Prefer the deployed/build API. Old localhost values saved in the browser must never override production.
const SAVED_API=(localStorage.getItem("rjp_api")||"").replace(/\/$/,"");
const LOCAL_API=(BUILD_API||DEFAULT_API||SAVED_API).replace(/\/$/,"");
const RUI_FEED="https://comboios.ruicosta.pt/api/cache/trains/active";
const BASE=import.meta.env.BASE_URL;
function directTrain(x){
 const raw=x?.data||{},live=raw?.status||{},fixed=x?.fixed||{},db=x?.db||{};
 const lat=Number(live.latitude??fixed.latitude),lon=Number(live.longitude??fixed.longitude);
 const stops=Array.isArray(fixed.trainStops)?fixed.trainStops:[];
 const num=live.trainNumber??fixed.trainNumber??db.trainNumber??x.train_id;
 const delaySec=live.delay==null?NaN:Number(live.delay);
 const delayMinutes=Number.isFinite(delaySec)?Math.round(delaySec/60):(Number(fixed.delay)||0);
 const lastCode=live.lastStation??fixed.lastStationCode;
 const ix=stops.findIndex(s=>s?.station?.code===lastCode), next=ix>=0?stops[ix+1]:null;
 return {id:String(num??""),trainNumber:num,latitude:Number.isFinite(lat)?lat:null,longitude:Number.isFinite(lon)?lon:null,
 delayMinutes,origin:db?.trainOrigin?.designation??stops[0]?.station?.designation,
 destination:db?.trainDestination?.designation??stops.at(-1)?.station?.designation,
 service:db?.trainService?.designation??fixed?.trainService?.designation,status:live.status??fixed.status??x.status,
 lastStation:stops[ix]?.station?.designation??lastCode,nextStop:next?.station?.designation??null,
 trainStops:stops,source:"Comboios Live / Rui Costa"}}

const n=v=>v??"—";
async function requestAlertPermission(){
 if(Capacitor.isNativePlatform()){
  const state=await LocalNotifications.requestPermissions();
  if(state.display==='granted'){
   await LocalNotifications.createChannel({id:'rail_alerts',name:'Alertas Ferroviários',description:'Chegadas, partidas e atrasos ferroviários',importance:4,visibility:1,vibration:true,sound:'default'}).catch(console.warn);
  }
  return state.display==='granted';
 }
 if(!('Notification'in window))return false;
 return (await Notification.requestPermission())==='granted';
}
async function showNotification(title,body,tag){
 if(Capacitor.isNativePlatform()){
  const permission=await LocalNotifications.checkPermissions();
  if(permission.display!=='granted')return false;
  const id=(Math.abs([...String(tag)].reduce((n,c)=>(n*31+c.charCodeAt(0))|0,17))%2147483646)+1;
  await LocalNotifications.schedule({notifications:[{id,title,body,channelId:'rail_alerts',smallIcon:'ic_stat_rail',schedule:{at:new Date(Date.now()+1000)},extra:{source:'Comboios Live — Rui Costa'}}]});
  return true;
 }
 if('Notification'in window&&Notification.permission==='granted'){
  new Notification(title,{body,icon:`${BASE}icons/icon-192.png`,tag});return true;
 }
 return false;
}
function sendAlert(c){
 const action=c.type==='arrival'?'chegada':'partida';
 const title=`🚆 Comboio ${c.train} · ${action}`;
 const body=`${c.station}: ${c.time} (previsto)${c.delay>0?` · atraso +${c.delay} min`:''}. Fonte: Comboios Live — Rui Costa.`;
 showNotification(title,body,c.key).catch(console.error);
}

function App(){
 const mapRef=useRef(),layers=useRef({}); const [alertDays,setAlertDays]=useState([0,1,2,3,4,5,6]),[notifyBefore,setNotifyBefore]=useState(true),[notifyOnArrival,setNotifyOnArrival]=useState(true),[alerts,setAlerts]=useState(getSavedAlerts),[alertOpen,setAlertOpen]=useState(false),[alertScope,setAlertScope]=useState("station"),[alertStation,setAlertStation]=useState(""),[alertTarget,setAlertTarget]=useState(""),[alertEvent,setAlertEvent]=useState("both"),[alertLead,setAlertLead]=useState(10),[alertMsg,setAlertMsg]=useState(""); const[trains,setTrains]=useState([]),[sel,setSel]=useState(),[q,setQ]=useState(""),[status,setStatus]=useState("A ligar…"),[updated,setUpdated]=useState(),[loading,setLoading]=useState(false);
 useEffect(()=>{let m=L.map("map",{zoomControl:true}).setView([39.65,-8.15],7);mapRef.current=m;
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap",opacity:.72}).addTo(m);
 // Railway-first overlay: visible immediately when the app opens.
 L.tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",{
   attribution:"Railway overlay © OpenRailwayMap contributors",opacity:.95,maxZoom:19
 }).addTo(m);
 layers.current.rail=L.geoJSON(null,{style:{color:"#ff8a00",weight:5,opacity:.95}}).addTo(m);
 layers.current.st=L.geoJSON(null,{pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:4,weight:1,fillOpacity:.9}),onEachFeature:(f,l)=>l.bindTooltip(f.properties?.name||f.properties?.designacao||"Estação")}).addTo(m);
 layers.current.tr=L.layerGroup().addTo(m);
 Promise.all([fetch(`${BASE}data/railways.geojson`).then(r=>r.ok?r.json():null),fetch(`${BASE}data/stations.geojson`).then(r=>r.ok?r.json():null)]).then(([r,s])=>{if(r)layers.current.rail.addData(r);if(s)layers.current.st.addData(s)});
 return()=>m.remove()},[]);
 async function load(){
  setLoading(true);
  try{
   let j,a,primary;
   if(LOCAL_API){
     let r=await fetch(`${LOCAL_API}/trains/active`);if(!r.ok)throw Error(r.status);j=await r.json();
     const raw=Array.isArray(j)?j:(j.data||j.trains||[]);
     // The Cloudflare Worker returns the original Comboios Live schema.
     // Normalize it here so the map always receives top-level coordinates.
     a=raw.map(x=>(x?.data?.status||x?.fixed||x?.db)?directTrain(x):x);
     primary=j?.primary||"RJP API · Comboios Live";
   }else{
     let r=await fetch(RUI_FEED,{headers:{accept:"application/json"}});if(!r.ok)throw Error(r.status);j=await r.json();
     a=(Array.isArray(j)?j:(j.data||j.trains||[])).map(directTrain);primary="Comboios Live";
   }
   setTrains(a);dispatchAlerts(a,getSavedAlerts(),new Date(),sendAlert);setUpdated(new Date());setStatus(`Online · ${primary}`);
   let g=layers.current.tr;g.clearLayers();a.forEach(t=>{let lat=+(t.latitude??t.lat),lon=+(t.longitude??t.lng??t.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    let d=+(t.delayMinutes??t.delay??0),mk=L.marker([lat,lon]).addTo(g);mk.bindTooltip(`🚆 ${n(t.trainNumber??t.number??t.id)} ${d>0?`+${d} min`:""}`);mk.on("click",()=>setSel(t));
   })
   }catch(e){
   console.error("RJP Train Live feed error:",e);
   const msg=e instanceof TypeError?"CORS/rede":(e?.message||"erro");
   setStatus(`Fonte indisponível · ${msg}`)
  } finally { setLoading(false); }
 }
 useEffect(()=>{load();let i=setInterval(load,30000);return()=>clearInterval(i)},[]);
 async function addAlert(){
  const target=alertTarget.trim();if(!target){setAlertMsg('Indica a estação ou o número do comboio.');return}
  const rule={id:Date.now().toString(36),scope:alertScope,target,station:alertScope==='combined'?alertStation.trim():'',event:alertEvent,lead:Number(alertLead),days:alertDays,notifyBefore,notifyOnArrival,enabled:true};
  if(!Number.isInteger(rule.lead)||rule.lead<0||rule.lead>1440||!alertDays.length||(!notifyBefore&&!notifyOnArrival)){setAlertMsg('Escolhe pelo menos um dia e um aviso; antecedência de 0 a 1440 minutos.');return}
  if(alertScope==='combined'&&!rule.station){setAlertMsg('Indica a estação para o alerta combinado.');return}
  const next=[...alerts,rule];setAlerts(next);localStorage.setItem(ALERTS_KEY,JSON.stringify(next));savePushRules(next).then(r=>setAlertMsg(r?.pending?'Alerta guardado localmente. Ativa push para sincronizar.':'Alerta guardado e sincronizado com o servidor.')).catch(e=>setAlertMsg('Alerta local guardado, mas sincronização falhou: '+e.message));setAlertTarget('');if(Capacitor.isNativePlatform())await enableNotifications();
 }
 function removeAlert(id){const next=alerts.filter(a=>a.id!==id);setAlerts(next);localStorage.setItem(ALERTS_KEY,JSON.stringify(next));savePushRules(next).catch(console.warn)}
 async function enableNotifications(){
  try{const ok=await requestAlertPermission();if(ok&&Capacitor.isNativePlatform())await initPush(LOCAL_API,getSavedAlerts());setAlertMsg(ok?(Capacitor.isNativePlatform()?pushState():'Notificações autorizadas.'):'Permissão não concedida. Verifica as definições da aplicação.')}catch(e){console.error(e);setAlertMsg('Não foi possível ativar as notificações.')} 
 }
 async function testNotification(){
  try{
   const ok=await requestAlertPermission();if(!ok){setAlertMsg('Autoriza as notificações para realizar o teste.');return}
   const sent=await showNotification('🚆 RJP Train Live · Teste','Notificações ferroviárias ativas. Fonte: WebApp Comboios Live — Rui Costa.',`test-${Date.now()}`);
   setAlertMsg(sent?'Notificação de teste enviada. Confirma na barra de notificações.':'Não foi possível apresentar a notificação.');
  }catch(e){console.error(e);setAlertMsg('Falha no teste de notificação.')} 
 }

 let filtered=trains.filter(t=>JSON.stringify(t).toLowerCase().includes(q.toLowerCase()));
 return <main><header><div><div className="brand"><img src={`${BASE}icons/icon-192.png`} className="brandIcon" alt="RJP Train Live"/><h1>RJP TRAIN LIVE <em>V2.9.2</em></h1></div><small>Tráfego Ferroviário em Portugal • Rede • Comboios • Estações • Atrasos</small></div><div className="sourceBox"><div className="live"><i className={status.startsWith("Online")?"on":""}/>{status}</div><small>Fonte dos dados: <b>WebApp Comboios Live — Rui Costa</b></small></div></header>
 <nav><input placeholder="Pesquisar comboio, estação ou linha…" value={q} onChange={e=>setQ(e.target.value)}/><button className={loading?"refresh loading":"refresh"} onClick={load} disabled={loading}><span>↻</span>{loading?" A atualizar…":" Atualizar agora"}</button><button className="alertsButton" onClick={()=>setAlertOpen(v=>!v)}>🔔 Alertas ({alerts.length})</button></nav>
 <section className="stats"><div><b>{trains.length}</b><small>comboios recebidos</small></div><div><b>{trains.filter(t=>+(t.delayMinutes??t.delay??0)>0).length}</b><small>com atraso</small></div><div><b>{updated?updated.toLocaleTimeString("pt-PT"):"—"}</b><small>última atualização</small></div></section>
 {alertOpen&&<section className="alertsPanel"><div className="alertsHeading"><h2>🔔 Alertas ferroviários</h2><button onClick={()=>setAlertOpen(false)} aria-label="Fechar alertas">×</button></div>
 <p>Alertas de horários previstos, baseados na WebApp Comboios Live — Rui Costa. Com Firebase e o Worker configurados, os avisos push podem chegar mesmo com a aplicação fechada. Os horários são previstos, não confirmações de circulação.</p>
 <div className="alertsForm"><label>Monitorizar<select value={alertScope} onChange={e=>setAlertScope(e.target.value)}><option value="station">Estação</option><option value="train">Comboio</option><option value="combined">Comboio + estação</option></select></label>
 <label>{alertScope==='station'?'Nome exato da estação':'Número do comboio'}<input value={alertTarget} onChange={e=>setAlertTarget(e.target.value)} placeholder={alertScope==='station'?'Ex.: Leiria':'Ex.: 6450'} list={alertScope==='station'?'stationsList':undefined}/></label>
 {alertScope==='combined'&&<label>Estação de destino do alerta<input value={alertStation} onChange={e=>setAlertStation(e.target.value)} placeholder='Ex.: Monte Real' list='stationsList'/></label>}
 <datalist id="stationsList">{[...new Set(trains.flatMap(t=>(t.trainStops||[]).map(s=>s?.station?.designation).filter(Boolean)))].sort().map(st=><option key={st} value={st}/>)}</datalist>
 <label>Evento<select value={alertEvent} onChange={e=>setAlertEvent(e.target.value)}><option value="both">Chegada e partida</option><option value="arrival">Chegada</option><option value="departure">Partida</option></select></label>
 <label>Antecedência livre (minutos, 0–1440)<input type="number" min="0" max="1440" step="1" value={alertLead} onChange={e=>setAlertLead(e.target.value)}/></label>
 <fieldset><legend>Dias da semana</legend>{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d,i)=><label key={d} style={{display:'inline-flex',gap:4,marginRight:12,alignItems:'center'}}><input type="checkbox" checked={alertDays.includes(i)} onChange={e=>setAlertDays(v=>e.target.checked?[...v,i].sort():v.filter(x=>x!==i))}/>{d}</label>)}</fieldset>
 <label><input type="checkbox" checked={notifyBefore} onChange={e=>setNotifyBefore(e.target.checked)}/> Pré-aviso antes da chegada prevista</label>
 <label><input type="checkbox" checked={notifyOnArrival} onChange={e=>setNotifyOnArrival(e.target.checked)}/> Avisar quando a passagem pela estação for detetada (não confirma paragem)</label>
 <button onClick={addAlert}>+ Guardar alerta</button><button onClick={enableNotifications} className="secondary">Autorizar notificações</button><button onClick={testNotification} className="secondary">🔔 Testar notificação local</button><button onClick={async()=>{setAlertMsg('A verificar o registo Firebase…');try{setAlertMsg(await initPush(LOCAL_API,getSavedAlerts()))}catch(e){setAlertMsg(`Push não configurado: ${e.message}`)}}} className="secondary">☁️ Ativar push em segundo plano</button><button onClick={async()=>{try{const r=await scheduleRemotePushTest();setAlertMsg(`Teste remoto agendado para daqui a ${r.delay_seconds} segundos. Fecha agora a APK e bloqueia o ecrã.`)}catch(e){setAlertMsg('Teste remoto: '+e.message)}}} className="secondary">📡 Testar push remoto (60 segundos)</button></div>
 {alertMsg&&<p role="status">{alertMsg}</p>}
 <div className="alertRules">{alerts.length===0?<p>Sem alertas configurados.</p>:alerts.map(a=><div className="alertRule" key={a.id}><span><b>{a.scope==='station'?'Estação':a.scope==='combined'?'Comboio + estação':'Comboio'}: {a.target}{a.station?' → '+a.station:''}</b><small>{a.event==='both'?'Chegada e partida':a.event==='arrival'?'Chegada':'Partida'} · {a.notifyBefore!==false?`${a.lead} min antes`:''}{a.notifyOnArrival?' · passagem detetada':''} · {Array.isArray(a.days)?a.days.map(i=>['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]).join(', '):'Todos os dias'}</small></span><button onClick={()=>removeAlert(a.id)} aria-label={`Remover alerta ${a.target}`}>Remover</button></div>)}</div>
 </section>}
 <div id="map"/>
 <aside><h3>Comboios</h3>{filtered.slice(0,100).map((t,i)=>{let d=+(t.delayMinutes??t.delay??0);return <article key={i} onClick={()=>setSel(t)}><b>🚆 {n(t.trainNumber??t.number??t.id)}</b><span className={d>0?"late":"ok"}>{d>0?`+${d} min`:"A horas"}</span><small>{n(t.origin?.designation??t.origin)} → {n(t.destination?.designation??t.destination)}</small></article>})}</aside>
 {sel&&<div className="card"><button onClick={()=>setSel()}>×</button><h2>🚆 {n(sel.trainNumber??sel.number??sel.id)}</h2><p><b>{n(sel.origin?.designation??sel.origin)}</b> → <b>{n(sel.destination?.designation??sel.destination)}</b></p><p>Atraso: <strong className={+(sel.delayMinutes??sel.delay??0)>0?"late":"ok"}>{+(sel.delayMinutes??sel.delay??0)>0?`+${sel.delayMinutes??sel.delay} min`:"A horas"}</strong></p><p>Serviço: <b>{n(sel.service??sel.serviceCode)}</b></p><p>Estado: {n(sel.status)} · Última: {n(sel.lastStation)}</p><p>Próxima: {n(sel.nextStop?.designation??sel.nextStop)}</p><section className="etaSection"><h3>🕒 Chegadas estimadas (ETA)</h3><p className="etaNote">Horário previsto + atraso atual, quando disponível. Estimativa sujeita a alterações.</p>{trainStopsEta(sel).length? <div className="etaStops">{trainStopsEta(sel).map(stop=><div className="etaStop" key={stop.key}><b>{stop.station}</b><span>Horário: {stop.scheduled??'—'}</span><strong>ETA: {stop.eta??'indisponível'}</strong><small>{stop.source==='calculado'?'Calculado com o atraso atual':stop.source==='fonte'?'Estimativa fornecida pela fonte':'Dados insuficientes'}</small></div>)}</div>:<p>Não há horários de paragem disponíveis para calcular o ETA.</p>}</section><p>Fonte dos dados: <b>WebApp Comboios Live — Rui Costa</b></p><p className="via">Ligação: RJP API / Cloudflare Worker</p><small>Posição e estado dependem da fonte dinâmica disponível. Informação não destinada a segurança da exploração.</small></div>}
 <footer>Fonte dos dados de circulação: <b>WebApp Comboios Live — Rui Costa</b> · A RJP Train Live apresenta e organiza a informação recebida através da RJP API. · Não destinada à segurança da exploração.</footer></main>
}
createRoot(document.getElementById("root")).render(<App/>);
