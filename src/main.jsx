
import React,{useEffect,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Capacitor}from"@capacitor/core";
import{LocalNotifications}from"@capacitor/local-notifications";
import{PushNotifications}from"@capacitor/push-notifications";
import{initPush,savePushRules,pushState,scheduleRemotePushTest}from"./push.js";
import{trainStopsEta,minutesUntil,etaProgress}from"./eta.js";
import {checkOtaUpdate,installOtaUpdate,confirmOtaReady,getOtaVersionStatus,APP_VERSION} from"./ota.js";
import L from"leaflet";import"./style.css";
import{discoverFertagus,normalizeFertagusPositions}from"./fertagus-tml.js";
import{getSavedAlerts,dispatchAlerts,ALERTS_KEY}from"./alerts.js";
import{scheduleLabel}from"./schedule.js";
import {formFromAlert,makeAlertRule,replaceAlert} from "./alert-editor.js";
import {fetchIndependentTrains} from "./v2/independent-feed.js";
import OnboardPanel from "./OnboardPanel.jsx";
import {onboardTrainId} from "./onboard.js";
const DEFAULT_API="https://rjp-train-live-api.rjpedro.workers.dev/api";
const BUILD_API=(import.meta.env.VITE_API_URL||"").replace(/\/$/,"");
// Prefer the deployed/build API. Old localhost values saved in the browser must never override production.
const SAVED_API=(localStorage.getItem("rjp_api")||"").replace(/\/$/,"");
const LOCAL_API=(BUILD_API||DEFAULT_API||SAVED_API).replace(/\/$/,"");
const RUI_FEED="https://comboios.ruicosta.pt/api/cache/trains/active";
// In this review branch, the original app stays in legacy mode by default.
// Enable ONLY in a verified preview build; production OTA needs a separate release.
const V2_MIGRATION=import.meta.env.VITE_RJP_V2_MIGRATION==="1";
const V2_PILOT_KEY="rjp_train_v2_pilot_opt_in";
// This only controls the display/data source; no alert, FCM or OTA key changes.
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

const TRAIN_TYPES=['U','R','IR','IC','AP','SUD','FT'];
function trainType(t){
 if(t?.positionKind&&TRAIN_TYPES.includes(t.type))return t.type;
 if(t?.type==='FT'||t?.service==='FT')return 'FT';
 const raw=String(t?.service?.designation??t?.service??'').trim().toUpperCase();
 const code=String(t?.fixed?.trainService?.code??'').toUpperCase();
 if(raw.includes('SUD')||raw.includes('SUREXPRESSO'))return 'SUD';
 if(raw.includes('INTERREGIONAL')||raw==='IR')return 'IR';
 if(raw.includes('INTERCIDADES')||raw==='IC')return 'IC';
 if(raw.includes('ALFA PENDULAR')||raw==='AP')return 'AP';
 if(raw.includes('URBANO')||raw.includes('SUBURBANO')||raw==='U')return 'U';
 if(raw.includes('REGIONAL')||raw==='R')return 'R';
 return ['U','R','IR','IC','AP','SUD'].includes(code)?code:'R';
}
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
 const body=`${c.station}: ${c.time} (previsto)${c.delay>0?` · atraso +${c.delay} min`:''}. Fonte: ${c.feedSource||'Comboios Live — Rui Costa'}.`;
 showNotification(title,body,c.key).catch(console.error);
}


async function fetchOriginalFeed(){
 const feeds=[
  {name:"RJP API · Comboios Live",url:LOCAL_API+"/trains/active"},
  {name:"Comboios Live · Rui Costa",url:RUI_FEED}
 ];
 const errors=[];
 for(const feed of feeds){
  try{
   const response=await fetch(feed.url,{headers:{accept:"application/json"},cache:"no-store"});
   if(!response.ok)throw Error("HTTP "+response.status);
   const payload=await response.json();
   const raw=Array.isArray(payload)?payload:(Array.isArray(payload?.data)?payload.data:Array.isArray(payload?.trains)?payload.trains:[]);
   if(!raw.length)throw Error("sem comboios na resposta");
   const trains=raw.map(x=>(x?.data?.status||x?.fixed||x?.db)?directTrain(x):x);
   if(!trains.some(t=>t.latitude!=null&&t.longitude!=null&&Number.isFinite(Number(t.latitude))&&Number.isFinite(Number(t.longitude))))
    throw Error("sem coordenadas CP");
   return {trains,source:feed.name};
  }catch(e){errors.push(feed.name+": "+String(e?.message||e))}
 }
 throw Error(errors.join(" | "));
}

function App(){
 const [pilotMode,setPilotMode]=useState(()=>V2_MIGRATION&&localStorage.getItem(V2_PILOT_KEY)==="1");
 const pilotModeRef=useRef(pilotMode),loadEpoch=useRef(0);
 const [versionStatus,setVersionStatus]=useState({state:"checking",latest:null});
 useEffect(()=>{let active=true;const refresh=()=>getOtaVersionStatus().then(v=>{if(active)setVersionStatus({state:v.updateAvailable?"available":"current",latest:v.latest})}).catch(()=>{if(active)setVersionStatus({state:"offline",latest:null})});refresh();const timer=setInterval(refresh,15*60*1000);return()=>{active=false;clearInterval(timer)}},[]);
 const [otaState,setOtaState]=useState(""),[otaCandidate,setOtaCandidate]=useState(null),[otaBusy,setOtaBusy]=useState(false);
 useEffect(()=>{confirmOtaReady().catch(console.warn)},[]);
 async function checkOta(){setOtaBusy(true);try{const candidate=await checkOtaUpdate();setOtaCandidate(candidate);setOtaState(candidate?`Atualização ${candidate.version} disponível.`:"Sem atualização OTA disponível.")}catch(e){setOtaState(`OTA: ${e.message}`)}finally{setOtaBusy(false)}}
 async function applyOta(){if(!otaCandidate)return;setOtaBusy(true);try{setOtaState("A descarregar atualização OTA…");await installOtaUpdate(otaCandidate);setOtaState("Atualização aplicada. A reiniciar…")}catch(e){setOtaState(`OTA falhou: ${e.message}`)}finally{setOtaBusy(false)}}
 const [scheduleType,setScheduleType]=useState("weekly"),[alertDate,setAlertDate]=useState(""),[monthDay,setMonthDay]=useState(1),[monthYear,setMonthYear]=useState(""); const [clock,setClock]=useState(()=>new Date()); const mapRef=useRef(),layers=useRef({}); const [alertDays,setAlertDays]=useState([0,1,2,3,4,5,6]),[notifyBefore,setNotifyBefore]=useState(true),[notifyOnArrival,setNotifyOnArrival]=useState(true),[alerts,setAlerts]=useState(getSavedAlerts),[alertOpen,setAlertOpen]=useState(false),[alertScope,setAlertScope]=useState("station"),[alertStation,setAlertStation]=useState(""),[alertTarget,setAlertTarget]=useState(""),[alertEvent,setAlertEvent]=useState("both"),[alertLead,setAlertLead]=useState(10),[alertMsg,setAlertMsg]=useState(""),[editingAlertId,setEditingAlertId]=useState(null),[alertEnabled,setAlertEnabled]=useState(true);
 const alertsPanelRef=useRef(null); const [enabledTypes,setEnabledTypes]=useState(()=>{try{const saved=JSON.parse(localStorage.getItem('rjp_train_types'));return Array.isArray(saved)?saved.filter(x=>TRAIN_TYPES.includes(x)):TRAIN_TYPES}catch{return TRAIN_TYPES}}); const[trains,setTrains]=useState([]),[sel,setSel]=useState(),[onboardSession,setOnboardSession]=useState(null),[q,setQ]=useState(""),[status,setStatus]=useState("A ligar…"),[updated,setUpdated]=useState(),[loading,setLoading]=useState(false);
 useEffect(()=>{let m=L.map("map",{zoomControl:true}).setView([39.65,-8.15],7);mapRef.current=m;
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap",opacity:.72}).addTo(m);
 // Railway-first overlay: visible immediately when the app opens.
 L.tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",{
   attribution:"Railway overlay © OpenRailwayMap contributors",opacity:.95,maxZoom:19
 }).addTo(m);
 layers.current.rail=L.geoJSON(null,{style:{color:"#ff8a00",weight:5,opacity:.95}}).addTo(m);
 layers.current.st=L.geoJSON(null,{pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:4,weight:1,fillOpacity:.9}),onEachFeature:(f,l)=>l.bindTooltip(f.properties?.name||f.properties?.designacao||"Estação")}).addTo(m);
 layers.current.tr=L.layerGroup().addTo(m);
 layers.current.ft=L.layerGroup().addTo(m);
 Promise.all([fetch(`${BASE}data/railways.geojson`).then(r=>r.ok?r.json():null),fetch(`${BASE}data/stations.geojson`).then(r=>r.ok?r.json():null)]).then(([r,s])=>{if(r)layers.current.rail.addData(r);if(s)layers.current.st.addData(s)});
 return()=>m.remove()},[]);
 async function loadFertagus(){
  // Separate optional layer: CP loading and alert dispatch must not depend on TML.
  const layer=layers.current.ft;
  if(!layer)return;
  try{
   const fetchJson=async url=>{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),10000);
    try{const response=await fetch(url,{headers:{accept:"application/json"},cache:"no-store",signal:controller.signal});if(!response.ok)throw Error("TML HTTP "+response.status);return await response.json()}
    finally{clearTimeout(timeout)}
   };
   let positions=null;
   try{
    const proxied=await fetchJson(LOCAL_API+"/fertagus/positions");
    if(proxied?.ok&&Array.isArray(proxied.positions))positions=proxied.positions;
   }catch(error){console.warn("Proxy Fertagus ainda indisponível:",error)}
   if(!positions){
    const organizations=await discoverFertagus(fetchJson);
    const results=await Promise.allSettled(organizations.map(o=>fetchJson(o.positionsUrl)));
    if(!results.some(result=>result.status==="fulfilled"))return;
    positions=results.flatMap(result=>result.status==="fulfilled"?(Array.isArray(result.value?.data)?result.value.data:[]):[]);
   }
   const fresh=normalizeFertagusPositions(positions);
   layer.clearLayers();
   fresh.forEach(t=>{
    const marker=L.marker([t.latitude,t.longitude],{icon:L.divIcon({className:"rjp-ft-marker",html:'<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:#06b6d4;border:2px solid #155e75;color:#052f40;font:bold 13px Arial,sans-serif;box-shadow:0 2px 6px #0006">FT</span>',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(layer);
    const time=new Date(t.positionTimestamp).toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit"});
    marker.bindTooltip("🚆 FT "+t.vehicleId+" · GPS "+time);
    marker.on("click",()=>setSel({...t,trainNumber:t.vehicleId,source:"TML · GPS Fertagus"}));
   });
  }catch(error){console.warn("Fertagus GPS indisponível:",error)}
 }
 async function load(){
  const epoch=++loadEpoch.current;
  setLoading(true);
  try{
   if(V2_MIGRATION&&pilotModeRef.current){
    try{
     const independent=await fetchIndependentTrains();
     if(epoch!==loadEpoch.current)return;
     setTrains(independent.trains);
     setUpdated(new Date());
     setStatus("Online · CP GTFS/TML · "+independent.gpsCount+" GPS · "+
      independent.estimateCount+" estimativas");
     // The original alert source is preserved independently of the new
     // map feed. Neither GTFS-only schedules nor interpolations may trigger
     // old local notifications. Remote Firebase rules stay unchanged.
     void fetchOriginalFeed().then(({trains})=>{
      if(epoch===loadEpoch.current&&pilotModeRef.current)
       dispatchAlerts(trains,getSavedAlerts(),new Date(),sendAlert);
     }).catch(e=>console.warn("Fonte dos alertas legados indisponível:",e?.message));
     return;
    }catch(e){
     console.warn("Motor CP/TML indisponível; regressão automática à fonte anterior:",e);
    }
   }
   // Original source used normally, or only as last-resort for the
   // independent pilot when CP GTFS/TML cannot produce map positions.
   const original=await fetchOriginalFeed();
   if(epoch!==loadEpoch.current)return;
   setTrains(original.trains);
   dispatchAlerts(original.trains,getSavedAlerts(),new Date(),sendAlert);
   setUpdated(new Date());
   setStatus("Online · "+original.source+(pilotModeRef.current?" (reserva automática)":""));
  }catch(e){
   if(epoch!==loadEpoch.current)return;
   console.error("RJP Train Live feed error:",e);
   const msg=e instanceof TypeError?"CORS/rede":e?.message||"erro";
   setStatus("CP indisponível · "+msg);
  }finally{
   if(epoch===loadEpoch.current)setLoading(false);
  }
 }
 function switchPilot(){
  if(!V2_MIGRATION)return;
  const next=!pilotModeRef.current;
  pilotModeRef.current=next;
  localStorage.setItem(V2_PILOT_KEY,next?"1":"0");
  setPilotMode(next);
  setSel(null);
  load();
 }
 useEffect(()=>{
  localStorage.setItem('rjp_train_types',JSON.stringify(enabledTypes));
  const group=layers.current.tr;
  if(group){group.clearLayers();trains.filter(t=>enabledTypes.includes(trainType(t))).forEach(t=>{
   const lat=Number(t.latitude??t.lat),lon=Number(t.longitude??t.lng??t.lon);
   if(!Number.isFinite(lat)||!Number.isFinite(lon)||lat<35||lat>43||lon< -11||lon> -5)return;
   const d=Number(t.delayMinutes??t.delay??0);
   const type=trainType(t);
   const markerColors={U:'#2563eb',R:'#16a34a',IR:'#7c3aed',IC:'#ea580c',AP:'#b91c1c',SUD:'#0f766e',FT:'#0891b2'};
   const color=markerColors[type]||'#2563eb';
   const border=(t.positionKind==="timetable-estimated"||t.positionKind==="cp-estimated")?"dashed":"solid";
   const mk=L.marker([lat,lon],{icon:L.divIcon({className:'rjp-cp-marker',html:'<span style="display:flex;align-items:center;justify-content:center;width:30px;height:30px;border-radius:50%;background:'+color+';border:2px '+border+' #fff;color:#fff;font:bold '+(type.length>2?'10':'13')+'px Arial,sans-serif;box-shadow:0 2px 6px #0007">'+type+'</span>',iconSize:[30,30],iconAnchor:[15,15]})}).addTo(group);
   mk.bindTooltip('🚆 '+trainType(t)+' '+n(t.trainNumber??t.number??t.id)+
    (t.positionKind?' · '+t.source:'')+(d>0?' +'+d+' min':''));
   mk.on('click',()=>setSel(t));
  })}
  const ft=layers.current.ft,m=mapRef.current;
  if(ft&&m){if(enabledTypes.includes('FT')){if(!m.hasLayer(ft))ft.addTo(m)}else if(m.hasLayer(ft))m.removeLayer(ft)}
 },[trains,enabledTypes]);
 useEffect(()=>{load();loadFertagus();let i=setInterval(()=>{load();loadFertagus()},30000);return()=>clearInterval(i)},[]);
 useEffect(()=>{const i=setInterval(()=>setClock(new Date()),30000);return()=>clearInterval(i)},[]);
 useEffect(()=>{if(!sel)return;const fresh=trains.find(t=>String(t.trainNumber??t.id)===String(sel.trainNumber??sel.id));if(fresh&&fresh!==sel)setSel(fresh)},[trains]);
 function resetAlertEditor(){
  setEditingAlertId(null);
  setAlertScope("station");setAlertTarget("");setAlertStation("");
  setAlertEvent("both");setAlertLead(10);setScheduleType("weekly");
  setAlertDate("");setMonthDay(1);setMonthYear("");
  setAlertDays([0,1,2,3,4,5,6]);
  setNotifyBefore(true);setNotifyOnArrival(true);setAlertEnabled(true);
 }
 function editAlert(rule){
  if(!rule?.id)return;
  const form=formFromAlert(rule);
  setEditingAlertId(rule.id);setAlertScope(form.scope);
  setAlertTarget(form.target);setAlertStation(form.station);
  setAlertEvent(form.event);setAlertLead(form.lead);
  setScheduleType(form.scheduleType);setAlertDate(form.date);
  setMonthDay(form.monthDay);setMonthYear(form.monthYear);
  setAlertDays(form.days);setNotifyBefore(form.notifyBefore);
  setNotifyOnArrival(form.notifyOnArrival);setAlertEnabled(form.enabled);
  setAlertMsg("A editar alerta · "+(rule.target??""));
  alertsPanelRef.current?.scrollTo({top:0,behavior:"smooth"});
 }
 async function synchronizeAlertChanges(rules,{success,localOnly}={}){
  try{
   let result=await savePushRules(rules);
   // After an OTA the JS runtime restarts and an existing FCM token may need
   // a fresh registration in this session. Never prompt without permission:
   // only reuse push authorization that was already granted.
   if(result?.pending&&Capacitor.isNativePlatform()){
    const permission=await PushNotifications.checkPermissions();
    if(permission.receive==="granted"){
     await initPush(LOCAL_API,rules);
     result={pending:false};
    }
   }
   setAlertMsg(result?.pending?
    (localOnly??"Alerta guardado no dispositivo. Ativa push para sincronizar."):
    (success??"Alertas sincronizados com o servidor."));
  }catch(error){
   setAlertMsg("Alteração guardada no dispositivo, mas a sincronização falhou: "+error.message);
  }
 }
 async function addAlert(){
  const editing=editingAlertId!==null;
  const old=editing?alerts.find(a=>a.id===editingAlertId):null;
  if(editing&&!old){setAlertMsg("O alerta a editar já não existe. Volta a abrir a edição.");return}
  let rule;
  try{
   rule=makeAlertRule({
    scope:alertScope,target:alertTarget,station:alertStation,event:alertEvent,
    lead:alertLead,days:alertDays,scheduleType,date:alertDate,
    monthDay,monthYear,notifyBefore,notifyOnArrival,enabled:alertEnabled
   },{existing:old});
  }catch(error){setAlertMsg(error.message);return}
  const next=editing?replaceAlert(alerts,rule):[...alerts,rule];
  try{
   localStorage.setItem(ALERTS_KEY,JSON.stringify(next));
  }catch(error){setAlertMsg("Não foi possível guardar o alerta: "+error.message);return}
  setAlerts(next);
  resetAlertEditor();
  setAlertMsg(editing?"Alterações guardadas no dispositivo. A sincronizar…":"Alerta criado. A sincronizar…");
  void synchronizeAlertChanges(next,{
   success:editing?"Alerta editado e sincronizado com o servidor.":"Alerta guardado e sincronizado com o servidor.",
   localOnly:editing?"Alerta editado localmente. Ativa push para sincronizar.":"Alerta criado localmente. Ativa push para sincronizar."
  });
  if(!editing&&Capacitor.isNativePlatform())await enableNotifications();
 }
 function removeAlert(id){
  const next=alerts.filter(a=>a.id!==id);
  try{localStorage.setItem(ALERTS_KEY,JSON.stringify(next))}
  catch(error){setAlertMsg("Não foi possível remover alerta: "+error.message);return}
  setAlerts(next);
  if(editingAlertId===id)resetAlertEditor();
  void synchronizeAlertChanges(next,{
   success:"Alerta removido e sincronizado.",
   localOnly:"Alerta removido localmente. Ativa push para sincronizar."
  });
 }
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

 function updateOnboardGps(point){
   const map=mapRef.current;if(!map)return;
   if(!point){
     if(layers.current.onboardGps){map.removeLayer(layers.current.onboardGps);layers.current.onboardGps=null;}
     return;
   }
   const latlng=[point.latitude,point.longitude];
   if(!layers.current.onboardGps){
     layers.current.onboardGps=L.circleMarker(latlng,{radius:9,color:'#ffffff',weight:3,fillColor:'#38bdf8',fillOpacity:.9})
       .addTo(map).bindTooltip('O meu GPS · apenas neste dispositivo');
   }else layers.current.onboardGps.setLatLng(latlng);
 }
 function centerOnboard(point){
   if(point&&mapRef.current)mapRef.current.setView([point.latitude,point.longitude],14,{animate:true});
 }
 function startOnboard(train){
   const id=onboardTrainId(train);
   if(!id)return;
   setOnboardSession({id,snapshot:train});
   setSel(null);
 }
 const onboardTrain=onboardSession?
   trains.find(t=>onboardTrainId(t)===onboardSession.id)||onboardSession.snapshot:null;
 let filtered=trains.filter(t=>enabledTypes.includes(trainType(t))&&JSON.stringify(t).toLowerCase().includes(q.toLowerCase()));
 return <main><header><div><div className="brand"><img src={`${BASE}icons/icon-192.png`} className="brandIcon" alt="RJP Train Live"/><h1>RJP TRAIN LIVE <em>v{APP_VERSION}</em></h1></div><small>Tráfego Ferroviário em Portugal • Rede • Comboios • Estações • Atrasos</small></div><div className="sourceBox"><div className="live"><i className={status.startsWith("Online")?"on":""}/>{status}</div><small>CP: <b>{pilotMode?"CP GTFS + TML · Rui Costa em reserva":"Comboios Live — Rui Costa"}</b> · Fertagus: <b>TML GO Hub (GPS direto)</b></small></div></header>
 <nav><input placeholder="Pesquisar comboio, estação ou linha…" value={q} onChange={e=>setQ(e.target.value)}/><button className={loading?"refresh loading":"refresh"} onClick={load} disabled={loading}><span>↻</span>{loading?" A atualizar…":" Atualizar agora"}</button><button className="alertsButton" onClick={()=>setAlertOpen(v=>!v)}>🔔 Alertas ({alerts.length})</button><button onClick={checkOta} disabled={otaBusy}>⬇ Verificar OTA</button>{otaCandidate&&<button onClick={applyOta} disabled={otaBusy}>Instalar {otaCandidate.version}</button>}</nav><div className="versionStatus" role="status"><b>Versão instalada: {APP_VERSION}</b><span className={"versionStatusLabel "+versionStatus.state}>{versionStatus.state==="checking"?"A verificar atualização…":versionStatus.state==="offline"?"Não foi possível verificar":versionStatus.state==="available"?"Atualização disponível: "+versionStatus.latest:"Aplicação atualizada"}</span>
 {V2_MIGRATION&&<details className="v2PilotPanel"><summary>Fonte de dados · Ensaio da versão 2.0</summary>
 <div className="v2PilotContent">
 <p><b>Modo atual: {pilotMode?"Motor 2.0 (experimental)":"Original (estável)"}</b></p>
 <p>{pilotMode?"Horários CP + TML e estimativas; Comboios Live em reserva.":"A usar a fonte original e os alertas existentes."}</p>
 <button type="button" onClick={switchPilot} className={pilotMode?"v2Revert":"v2Enable"}>
 {pilotMode?"Voltar à original (estável)":"Experimentar motor 2.0"}
 </button>
 <small>Não desinstala a aplicação nem apaga alertas. Posições estimadas não são GPS e não comprovam circulação.</small>
 </div></details>}
 </div>{otaState&&<p role="status" className="otaStatus">{otaState}</p>}
 <div className="trainTypeFilters" role="group" aria-label="Filtrar tipos de comboio">{TRAIN_TYPES.map(type=><button key={type} type="button" className={enabledTypes.includes(type)?"typeActive":"typeInactive"} aria-pressed={enabledTypes.includes(type)} onClick={()=>setEnabledTypes(current=>current.includes(type)?current.filter(x=>x!==type):[...current,type])}>{type}</button>)}</div>
 <section className="stats"><div><b>{trains.length}</b><small>comboios recebidos</small></div><div><b>{trains.filter(t=>+(t.delayMinutes??t.delay??0)>0).length}</b><small>com atraso</small></div><div><b>{updated?updated.toLocaleTimeString("pt-PT"):"—"}</b><small>última atualização</small></div></section>
 {alertOpen&&<section className="alertsPanel" ref={alertsPanelRef}><div className="alertsHeading"><h2>🔔 Alertas ferroviários</h2><button onClick={()=>setAlertOpen(false)} aria-label="Fechar alertas">×</button></div>
 <p>{editingAlertId?"A editar um alerta existente. As alterações mantêm o mesmo número de identificação.":"Cria um alerta novo ou seleciona Editar num dos alertas guardados."}</p><p>Alertas de horários previstos, baseados na WebApp Comboios Live — Rui Costa. Com Firebase e o Worker configurados, os avisos push podem chegar mesmo com a aplicação fechada. Os horários são previstos, não confirmações de circulação.</p>
 <div className="alertsForm"><label>Monitorizar<select value={alertScope} onChange={e=>setAlertScope(e.target.value)}><option value="station">Estação</option><option value="train">Comboio</option><option value="combined">Comboio + estação</option></select></label>
 <label>{alertScope==='station'?'Nome exato da estação':'Número do comboio'}<input value={alertTarget} onChange={e=>setAlertTarget(e.target.value)} placeholder={alertScope==='station'?'Ex.: Leiria':'Ex.: 6450'} list={alertScope==='station'?'stationsList':undefined}/></label>
 {alertScope==='combined'&&<label>Estação de destino do alerta<input value={alertStation} onChange={e=>setAlertStation(e.target.value)} placeholder='Ex.: Monte Real' list='stationsList'/></label>}
 <datalist id="stationsList">{[...new Set(trains.flatMap(t=>(t.trainStops||[]).map(s=>s?.station?.designation).filter(Boolean)))].sort().map(st=><option key={st} value={st}/>)}</datalist>
 <label>Evento<select value={alertEvent} onChange={e=>setAlertEvent(e.target.value)}><option value="both">Chegada e partida</option><option value="arrival">Chegada</option><option value="departure">Partida</option></select></label>
 <label>Antecedência livre (minutos, 0–1440)<input type="number" min="0" max="1440" step="1" value={alertLead} onChange={e=>setAlertLead(e.target.value)}/></label>
 <label>Periodicidade<select value={scheduleType} onChange={e=>setScheduleType(e.target.value)}><option value="weekly">Dias da semana</option><option value="date">Data específica</option><option value="monthly">Dia do mês</option></select></label>
 {scheduleType==='date'&&<label>Data do alerta<input type="date" value={alertDate} onChange={e=>setAlertDate(e.target.value)}/></label>}
 {scheduleType==='monthly'&&<><label>Dia do mês<select value={monthDay} onChange={e=>setMonthDay(e.target.value)}>{Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label><label>Ano (opcional)<input type="number" min="2020" max="2100" placeholder="Todos os anos" value={monthYear} onChange={e=>setMonthYear(e.target.value)}/></label><small>Nos meses sem esse dia, o alerta não é executado.</small></>}
 {scheduleType==='weekly'&&<fieldset><legend>Dias da semana</legend>{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d,i)=><label key={d} style={{display:'inline-flex',gap:4,marginRight:12,alignItems:'center'}}><input type="checkbox" checked={alertDays.includes(i)} onChange={e=>setAlertDays(v=>e.target.checked?[...v,i].sort():v.filter(x=>x!==i))}/>{d}</label>)}</fieldset>}
 <label><input type="checkbox" checked={notifyBefore} onChange={e=>setNotifyBefore(e.target.checked)}/> Pré-aviso antes da chegada prevista</label>
 <label><input type="checkbox" checked={notifyOnArrival} onChange={e=>setNotifyOnArrival(e.target.checked)}/> Avisar quando a passagem pela estação for detetada (não confirma paragem)</label>
 {editingAlertId&&<label><input type="checkbox" checked={alertEnabled} onChange={e=>setAlertEnabled(e.target.checked)}/> Alerta ativo</label>}
 <div className="alertFormActions"><button onClick={addAlert}>{editingAlertId?"Guardar alterações":"+ Guardar alerta"}</button>
 {editingAlertId&&<button type="button" onClick={()=>{resetAlertEditor();setAlertMsg("Edição cancelada. Nenhum alerta foi alterado.")}} className="secondary">Cancelar edição</button>}</div><button onClick={enableNotifications} className="secondary">Autorizar notificações</button><button onClick={testNotification} className="secondary">🔔 Testar notificação local</button><button onClick={async()=>{setAlertMsg('A verificar o registo Firebase…');try{setAlertMsg(await initPush(LOCAL_API,getSavedAlerts()))}catch(e){setAlertMsg(`Push não configurado: ${e.message}`)}}} className="secondary">☁️ Ativar push em segundo plano</button><button onClick={async()=>{try{const r=await scheduleRemotePushTest();setAlertMsg(`Teste remoto agendado para daqui a ${r.delay_seconds} segundos. Fecha agora a APK e bloqueia o ecrã.`)}catch(e){setAlertMsg('Teste remoto: '+e.message)}}} className="secondary">📡 Testar push remoto (60 segundos)</button></div>
 {alertMsg&&<p role="status">{alertMsg}</p>}
 <div className="alertRules">{alerts.length===0?<p>Sem alertas configurados.</p>:alerts.map(a=><div className="alertRule" key={a.id}><span><b>{a.scope==='station'?'Estação':a.scope==='combined'?'Comboio + estação':'Comboio'}: {a.target}{a.station?' → '+a.station:''}</b>{a.enabled===false&&<small className="alertPaused">Pausado</small>}<small>{a.event==='both'?'Chegada e partida':a.event==='arrival'?'Chegada':'Partida'} · {a.notifyBefore!==false?`${a.lead} min antes`:''}{a.notifyOnArrival?' · passagem detetada':''} · {scheduleLabel(a)}</small></span><div className="alertRuleActions"><button type="button" onClick={()=>editAlert(a)} aria-label={`Editar alerta ${a.target}`}>Editar</button><button type="button" onClick={()=>removeAlert(a.id)} aria-label={`Remover alerta ${a.target}`}>Remover</button></div></div>)}</div>
 </section>}
 <div id="map"/>
 <aside><h3>Comboios</h3>{filtered.slice(0,100).map((t,i)=>{let d=+(t.delayMinutes??t.delay??0);return <article key={i} onClick={()=>setSel(t)}><b>🚆 {n(t.trainNumber??t.number??t.id)}</b><span className={d>0?"late":"ok"}>{d>0?`+${d} min`:"A horas"}</span><small>{n(t.origin?.designation??t.origin)} → {n(t.destination?.designation??t.destination)}</small></article>})}</aside>
 {onboardTrain&&<OnboardPanel key={onboardSession.id} train={onboardTrain} onEnd={()=>{setOnboardSession(null);updateOnboardGps(null)}} onPosition={updateOnboardGps} onCenter={centerOnboard} onRequestNotification={requestAlertPermission} onNotify={showNotification}/>}
 {sel&&<div className="trainDialogBackdrop" onClick={()=>setSel(null)}><div className="card trainDialog" role="dialog" aria-modal="true" aria-label="Detalhes do comboio" onClick={e=>e.stopPropagation()}><button type="button" className="trainDialogClose" aria-label="Fechar detalhes do comboio" onClick={()=>setSel(null)}>×</button><button type="button" className="onboardStart" onClick={()=>startOnboard(sel)}>🚆 Estou a bordo</button><h2>🚆 {n(sel.trainNumber??sel.number??sel.id)}</h2><p><b>{n(sel.origin?.designation??sel.origin)}</b> → <b>{n(sel.destination?.designation??sel.destination)}</b></p>{sel.type==="FT"?<><p><b>Fertagus · GPS TML GO Hub</b></p><p>Veículo: {n(sel.vehicleId)} · Viagem: {n(sel.tripId)}</p><p>Última posição: {new Date(sel.positionTimestamp).toLocaleTimeString("pt-PT")}</p><p>Latitude: {Number(sel.latitude).toFixed(5)} · Longitude: {Number(sel.longitude).toFixed(5)}</p><small>Destino, atraso e ETA não disponíveis nesta fonte.</small></>:<><p>Atraso: <strong className={+(sel.delayMinutes??sel.delay??0)>0?"late":"ok"}>{+(sel.delayMinutes??sel.delay??0)>0?`+${sel.delayMinutes??sel.delay} min`:"A horas"}</strong></p><p>Serviço: <b>{n(sel.service??sel.serviceCode)}</b></p><p>Estado: {n(sel.status)} · Última: {n(sel.lastStation)}</p><p>Próxima: {n(sel.nextStop?.designation??sel.nextStop)}</p><section className="etaSection"><h3>🕒 Chegadas estimadas (ETA)</h3><p className="etaNote">Atualizado: {updated?updated.toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"} · {updated&&clock-updated>120000?"⚠️ Dados com mais de 2 minutos":"Dados da última consulta"}</p><p className="etaNote">Percurso: {etaProgress(sel).lastIndex>=0?`${etaProgress(sel).lastIndex+1} de ${etaProgress(sel).stops.length} estações alcançadas (última conhecida)` :"posição no percurso não confirmada"}</p><p className="etaNote">Horário previsto + atraso atual, quando disponível. Estimativa sujeita a alterações. *Contagem aproximada, dependente do dia de circulação.</p>{trainStopsEta(sel).length? <div className="etaStops">{trainStopsEta(sel).map(stop=><div className="etaStop" key={stop.key}><b>{stop.station}</b><span>Horário: {stop.scheduled??'—'}</span><strong>ETA: {stop.eta??'indisponível'}</strong>{stop.eta&&minutesUntil(stop.eta,clock)!==null&&<span className="etaCountdown">Dentro de {minutesUntil(stop.eta,clock)} min*</span>}<small>{stop.source==='calculado'?'Calculado com o atraso atual':stop.source==='fonte'?'Estimativa fornecida pela fonte':'Dados insuficientes'}</small></div>)}</div>:<p>Não há horários de paragem disponíveis para calcular o ETA.</p>}</section><p>Fonte dos dados: <b>{sel.source||"WebApp Comboios Live — Rui Costa"}</b></p>
 {sel.positionKind?.includes("estimated")&&<small>Posição estimada por horário/estado CP, não GPS; circulação não necessariamente confirmada.</small>}<p className="via">Ligação: {sel.positionKind?"CP/TML independente":"RJP API / Cloudflare Worker"}</p><small>Posição e estado dependem da fonte dinâmica disponível. Informação não destinada a segurança da exploração.</small></>}</div></div>}
 <footer>Fontes: {pilotMode?<><b>CP GTFS + TML independentes</b> · <b>Comboios Live (reserva; fonte dos alertas legados)</b></>:<b>Comboios Live — Rui Costa (CP)</b>} · <b>TML GO Hub (Fertagus)</b> · As posições estimadas não são GPS nem confirmam circulação. · Não destinada à segurança da exploração.</footer></main>
}
createRoot(document.getElementById("root")).render(<App/>);
