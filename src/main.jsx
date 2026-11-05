
import React,{useEffect,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import{Capacitor}from"@capacitor/core";
import{LocalNotifications}from"@capacitor/local-notifications";
import{PushNotifications}from"@capacitor/push-notifications";
import{initPush,savePushRules,pushState,scheduleRemotePushTest}from"./push.js";
import{trainStopsEta,minutesUntil,etaProgress}from"./eta.js";
import {checkOtaUpdate,installOtaUpdate,prepareAutomaticOta,confirmOtaReady} from"./ota.js";
import {serviceTypeCode,serviceTypeLabel,DATA_SOURCES} from "./sources.js";
import L from"leaflet";import"./style.css";
import{getSavedAlerts,dispatchAlerts,ALERTS_KEY}from"./alerts.js";
import{scheduleLabel}from"./schedule.js";
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
 service:db?.trainService?.designation??db?.trainService?.name??fixed?.trainService?.designation??fixed?.trainService?.name??live?.trainService?.designation,status:live.status??fixed.status??x.status,
 lastStation:stops[ix]?.station?.designation??lastCode,nextStop:next?.station?.designation??null,
 trainStops:stops,source:"Comboios Live / Rui Costa"}}

const n=v=>v??"—";
const stopClock=(stop,kind)=>{
 const fields=kind==="departure"?["departure","scheduledDeparture","departureTime","ETD"]:["arrival","scheduledArrival","arrivalTime","ETA"];
 for(const field of fields){const value=stop?.[field];if(value==null||value==="")continue;
  if(typeof value==="string"){const match=value.match(/(?:^|T|\s)(\d{1,2}:\d{2})(?::\d{2})?/);if(match)return match[1].padStart(5,"0");}
  if(typeof value==="number"&&Number.isFinite(value)&&value>=0&&value<1440){return String(Math.floor(value/60)).padStart(2,"0")+":"+String(value%60).padStart(2,"0");}
 }
 return null;
};
const terminalTimes=t=>{const stops=Array.isArray(t?.trainStops)?t.trainStops:[];return {departure:stopClock(stops[0],"departure"),arrival:stopClock(stops[stops.length-1],"arrival")}};
const terminalScheduleText=t=>{const times=terminalTimes(t);return "Partida "+(times.departure??"não disponível")+" · Chegada "+(times.arrival??"não disponível")};
const stationScheduleText=(train,stationKey)=>{
 const stops=Array.isArray(train?.trainStops)?train.trainStops:[];
 const clean=value=>String(value??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
 const stop=stops.find(st=>[st?.station?.designation,st?.station?.name,st?.designation].some(name=>clean(name)===clean(stationKey)))??stops.find(st=>[st?.station?.designation,st?.station?.name,st?.designation].some(name=>clean(name).includes(clean(stationKey))));
 if(!stop)return "Sem horário para a estação pesquisada";
 return "Nesta estação · chegada "+(stopClock(stop,"arrival")??"não disponível")+" · partida "+(stopClock(stop,"departure")??"não disponível");
};

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

 const [railFilters,setRailFilters]=useState(()=>{try{const v=JSON.parse(localStorage.getItem("rjp_rail_filters")||"null");return Array.isArray(v)?v:["U","R","IR","IC","AP","SUD"]}catch{return ["U","R","IR","IC","AP","SUD"]}});
 useEffect(()=>{localStorage.setItem("rjp_rail_filters",JSON.stringify(railFilters))},[railFilters]);
 const [otaState,setOtaState]=useState(""),[otaCandidate,setOtaCandidate]=useState(null),[otaBusy,setOtaBusy]=useState(false);
 useEffect(()=>{
  let cancelled=false;
  (async()=>{
   try{
    await confirmOtaReady();
    if(!Capacitor.isNativePlatform()||cancelled)return;
    const candidate=await checkOtaUpdate();
    if(!candidate||cancelled)return;
    setOtaState('A preparar automaticamente a versão '+candidate.version+'…');
    await prepareAutomaticOta(candidate);
    if(!cancelled){setOtaCandidate(null);setOtaState('Versão '+candidate.version+' preparada. Fecha e volta a abrir a aplicação para atualizar.');}
   }catch(e){console.warn('OTA automática:',e);if(!cancelled&&Capacitor.isNativePlatform())setOtaState('OTA automática indisponível: '+e.message);}
  })();
  return()=>{cancelled=true};
 },[]);
 async function checkOta(){setOtaBusy(true);try{const candidate=await checkOtaUpdate();setOtaCandidate(candidate);setOtaState(candidate?`Atualização ${candidate.version} disponível.`:"Sem atualização OTA disponível.")}catch(e){setOtaState(`OTA: ${e.message}`)}finally{setOtaBusy(false)}}
 async function applyOta(){if(!otaCandidate)return;setOtaBusy(true);try{setOtaState("A descarregar atualização OTA…");await installOtaUpdate(otaCandidate);setOtaState("Atualização aplicada. A reiniciar…")}catch(e){setOtaState(`OTA falhou: ${e.message}`)}finally{setOtaBusy(false)}}
 const [scheduleType,setScheduleType]=useState("weekly"),[alertDate,setAlertDate]=useState(""),[monthDay,setMonthDay]=useState(1),[monthYear,setMonthYear]=useState(""); const [clock,setClock]=useState(()=>new Date()); const mapRef=useRef(),layers=useRef({}); const [alertDays,setAlertDays]=useState([0,1,2,3,4,5,6]),[notifyBefore,setNotifyBefore]=useState(true),[notifyOnArrival,setNotifyOnArrival]=useState(true),[alerts,setAlerts]=useState(getSavedAlerts),[alertOpen,setAlertOpen]=useState(false),[alertScope,setAlertScope]=useState("station"),[alertStation,setAlertStation]=useState(""),[alertTarget,setAlertTarget]=useState(""),[alertEvent,setAlertEvent]=useState("both"),[alertLead,setAlertLead]=useState(10),[alertMsg,setAlertMsg]=useState(""); const[trains,setTrains]=useState([]),[sel,setSel]=useState(),[q,setQ]=useState(""),[submittedQuery,setSubmittedQuery]=useState(""),[status,setStatus]=useState("A ligar…"),[updated,setUpdated]=useState(),[loading,setLoading]=useState(false);
 useEffect(()=>{let m=L.map("map",{zoomControl:true}).setView([39.65,-8.15],7);mapRef.current=m;
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap",opacity:.72}).addTo(m);
 // Railway-first overlay: visible immediately when the app opens.
 L.tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",{
   attribution:"Railway overlay © OpenRailwayMap contributors",opacity:.95,maxZoom:19
 }).addTo(m);
 layers.current.rail=L.geoJSON(null,{style:{color:"#ff8a00",weight:5,opacity:.95}}).addTo(m);
 layers.current.st=L.geoJSON(null,{pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:4,weight:1,fillOpacity:.9}),onEachFeature:(f,l)=>{l.bindTooltip(f.properties?.name||f.properties?.designacao||"Estação");l.on("click",()=>focusStation(l));}}).addTo(m);
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
    let d=+(t.delayMinutes??t.delay??0),code=serviceTypeCode([t.service,t.trainService,t.serviceCode,t.trainServiceName,t.category,t.type,t.db?.trainService?.designation].filter(Boolean).join(" ")),mk=L.marker([lat,lon],{icon:L.divIcon({className:"rjp-service-icon",html:`<span class="rjp-service-badge">${code||"🚆"}</span>`,iconSize:[36,36],iconAnchor:[18,18]}),rjpCode:code}).addTo(g);if(code&&!railFilters.includes(code)){const el=mk.getElement?.();if(el)el.style.display="none"}mk.bindTooltip(`🚆 ${code?code+" ":""}${n(t.trainNumber??t.number??t.id)} ${d>0?`+${d} min`:""}`);mk.on("click",()=>setSel(t));
   })
   }catch(e){
   console.error("RJP Train Live feed error:",e);
   const msg=e instanceof TypeError?"CORS/rede":(e?.message||"erro");
   setStatus(`Fonte indisponível · ${msg}`)
  } finally { setLoading(false); }
 }
 useEffect(()=>{const group=layers.current.tr;if(group)group.eachLayer(layer=>{const el=layer.getElement?.();if(el)el.style.display=(!layer.options?.rjpCode||railFilters.includes(layer.options.rjpCode))?"":"none"})},[railFilters,trains]);
 useEffect(()=>{load();let i=setInterval(load,30000);return()=>clearInterval(i)},[]);
 useEffect(()=>{const i=setInterval(()=>setClock(new Date()),30000);return()=>clearInterval(i)},[]);
 useEffect(()=>{if(!sel)return;const fresh=trains.find(t=>String(t.trainNumber??t.id)===String(sel.trainNumber??sel.id));if(fresh&&fresh!==sel)setSel(fresh)},[trains]);
 async function addAlert(){
  const target=alertTarget.trim();if(!target){setAlertMsg('Indica a estação ou o número do comboio.');return}
  const rule={id:Date.now().toString(36),scope:alertScope,target,station:alertScope==='combined'?alertStation.trim():'',event:alertEvent,lead:Number(alertLead),days:alertDays,scheduleType,date:scheduleType==='date'?alertDate:undefined,monthDay:scheduleType==='monthly'?Number(monthDay):undefined,year:scheduleType==='monthly'&&monthYear?Number(monthYear):undefined,notifyBefore,notifyOnArrival,enabled:true};
  if(!Number.isInteger(rule.lead)||rule.lead<0||rule.lead>1440||(scheduleType==='weekly'&&!alertDays.length)||(!notifyBefore&&!notifyOnArrival)){setAlertMsg('Escolhe pelo menos um dia e um aviso; antecedência de 0 a 1440 minutos.');return}
  if(scheduleType==='date'&&!/^\d{4}-\d{2}-\d{2}$/.test(alertDate)){setAlertMsg('Seleciona uma data válida.');return}
  if(scheduleType==='monthly'&&(!Number.isInteger(Number(monthDay))||Number(monthDay)<1||Number(monthDay)>31)){setAlertMsg('Seleciona um dia do mês entre 1 e 31.');return}
  if(alertScope==='combined'&&!rule.station){setAlertMsg('Indica a estação para o alerta combinado.');return}
  const next=editingAlertId?alerts.map(a=>a.id===editingAlertId?{...rule,id:a.id}:a):[...alerts,rule];setAlerts(next);setEditingAlertId(null);localStorage.setItem(ALERTS_KEY,JSON.stringify(next));savePushRules(next).then(r=>setAlertMsg(r?.pending?'Alerta guardado localmente. Ativa push para sincronizar.':'Alerta guardado e sincronizado com o servidor.')).catch(e=>setAlertMsg('Alerta local guardado, mas sincronização falhou: '+e.message));setAlertTarget('');if(Capacitor.isNativePlatform())await enableNotifications();
 }
 function editAlert(a){setEditingAlertId(a.id);setAlertScope(a.scope);setAlertTarget(a.target||"");setAlertStation(a.station||"");setAlertEvent(a.event||"both");setAlertLead(a.lead??10);setAlertDays(a.days||[0,1,2,3,4,5,6]);setScheduleType(a.scheduleType||"weekly");setAlertDate(a.date||"");setMonthDay(a.monthDay||1);setMonthYear(a.year||"");setNotifyBefore(a.notifyBefore!==false);setNotifyOnArrival(a.notifyOnArrival===true);setAlertMsg("A editar alerta existente. Guarda para sincronizar a alteração.");}
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

 const normalizeSearch=v=>String(v??"").normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLocaleLowerCase("pt-PT").trim();
 const [alertTrainStation,setAlertTrainStation]=useState("");
 const [editingAlertId,setEditingAlertId]=useState(null);
 const [selectedStation,setSelectedStation]=useState("");
 const stationLookup=alertScope==='combined'?alertStation:alertTrainStation;
 const stationLookupKey=normalizeSearch(stationLookup);
 const availableTrainOptions=stationLookupKey.length>=2?trains.filter(t=>(Array.isArray(t.trainStops)?t.trainStops:[]).some(st=>[st?.station?.designation,st?.station?.name,st?.designation].some(name=>normalizeSearch(name).includes(stationLookupKey)))).filter(t=>String(t.trainNumber??t.number??t.id??"").trim()):[];
 function selectAlertTrain(t){setAlertTarget(String(t.trainNumber??t.number??t.id));setAlertMsg("Comboio selecionado. Confirma a estação, os dias e o evento antes de guardar.");}
 const query=normalizeSearch(submittedQuery);
 const filtered=trains.filter(t=>{
  if(!query)return true;
  const number=normalizeSearch(t.trainNumber??t.number??t.id);
  if(/^\\d+$/.test(query))return number===query;
  return [number,t.service,t.serviceCode,t.origin?.designation??t.origin,t.destination?.designation??t.destination,t.lastStation,t.nextStop?.designation??t.nextStop,...(Array.isArray(t.trainStops)?t.trainStops.flatMap(st=>[st?.station?.designation,st?.station?.name,st?.designation]):[])].some(v=>normalizeSearch(v).includes(query));
 });
 const stationName=layer=>String(layer.feature?.properties?.name??layer.feature?.properties?.designacao??"");
 const stationScore=(name,term)=>{
  const normalized=normalizeSearch(name).replace(/[^a-z0-9]+/g," ").trim();
  const words=normalizeSearch(term).replace(/[^a-z0-9]+/g," ").trim().split(/\\s+/).filter(Boolean);
  if(!words.length)return 0;
  if(normalized===words.join(" "))return 100;
  if(normalized.startsWith(words.join(" ")))return 90;
  if(normalized.includes(words.join(" ")))return 80;
  return words.every(word=>normalized.split(" ").some(token=>token.startsWith(word)))?60:0;
 };
 const matchingStations=query&&!/^\\d+$/.test(query)?Object.values(layers.current.st?._layers||{}).map(layer=>({layer,score:stationScore(stationName(layer),query)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score||stationName(a.layer).localeCompare(stationName(b.layer),"pt")).slice(0,30).map(x=>x.layer):[];
 function submitSearch(e){
  e?.preventDefault?.();const term=q.trim();setSubmittedQuery(term);if(!term)return;
  const key=normalizeSearch(term),numeric=/^\\d+$/.test(key);
  const tr=trains.find(t=>normalizeSearch(t.trainNumber??t.number??t.id)===key);
  if(tr){focusTrain(tr);return;}
  if(numeric){setSel(null);return;}
  const stations=Object.values(layers.current.st?._layers||{});
  const matches=stations.map(layer=>({layer,score:stationScore(stationName(layer),term)})).filter(x=>x.score>0).sort((a,b)=>b.score-a.score);
  if(matches.length===1)focusStation(matches[0].layer);
 }
 function focusStation(layer){setSelectedStation(stationName(layer));const p=layer.getLatLng?.();if(p){mapRef.current?.setView(p,14,{animate:true});layer.openTooltip?.();}}
 function focusTrain(t){const lat=Number(t.latitude??t.lat),lon=Number(t.longitude??t.lng??t.lon);if(Number.isFinite(lat)&&Number.isFinite(lon))mapRef.current?.setView([lat,lon],14,{animate:true});setSel(t);}
 return <main><header><div><div className="brand"><img src={`${BASE}icons/icon-192.png`} className="brandIcon" alt="RJP Train Live"/><h1>RJP TRAIN LIVE <em>V2.12.27</em></h1></div><small>Tráfego Ferroviário em Portugal • Rede • Comboios • Estações • Atrasos</small></div><div className="sourceBox"><div className="live"><i className={status.startsWith("Online")?"on":""}/>{status}</div><small>Fontes: <b>{DATA_SOURCES.map(s=>s.name).join(" · ")}</b></small></div></header>
 <nav><form className="trainSearchForm" onSubmit={submitSearch}><input aria-label="Pesquisar comboio ou estação" placeholder="N.º comboio ou estação…" value={q} onChange={e=>setQ(e.target.value)}/><button type="submit" className="searchSubmit">🔎 Procurar</button>{submittedQuery&&<button type="button" onClick={()=>{setQ("");setSubmittedQuery("")}}>Limpar</button>}</form><button className={loading?"refresh loading":"refresh"} onClick={load} disabled={loading}><span>↻</span>{loading?" A atualizar…":" Atualizar"}</button><button className="alertsButton" onClick={()=>setAlertOpen(v=>!v)}>🔔 Alertas ({alerts.length})</button><button onClick={checkOta} disabled={otaBusy}>Verificar atualização</button>{otaCandidate&&<button onClick={applyOta} disabled={otaBusy}>Instalar {otaCandidate.version}</button>}</nav><section aria-label="Filtros de comboios" style={{display:"flex",gap:6,flexWrap:"wrap",padding:"8px 16px",alignItems:"center"}}><strong>🚆 Tipos no mapa</strong><button type="button" onClick={()=>setRailFilters(["U","R","IR","IC","AP","SUD"])}>Todos</button>{["U","R","IR","IC","AP","SUD"].map(code=><button type="button" key={code} aria-pressed={railFilters.includes(code)} onClick={()=>setRailFilters(v=>v.includes(code)?v.filter(x=>x!==code):[...v,code])} style={{opacity:railFilters.includes(code)?1:.45,fontWeight:railFilters.includes(code)?700:400}}>{code}</button>)}</section>{otaState&&<p role="status" className="otaStatus">{otaState}</p>}
 <section className="stats"><div><b>{trains.length}</b><small>comboios recebidos</small></div><div><b>{trains.filter(t=>+(t.delayMinutes??t.delay??0)>0).length}</b><small>com atraso</small></div><div><b>{updated?updated.toLocaleTimeString("pt-PT"):"—"}</b><small>última atualização</small></div></section>
 {alertOpen&&<section className="alertsPanel"><div className="alertsHeading"><h2>🔔 Alertas ferroviários</h2><button onClick={()=>setAlertOpen(false)} aria-label="Fechar alertas">×</button></div>
 <p>Alertas de horários previstos, baseados na WebApp Comboios Live — Rui Costa. Com Firebase e o Worker configurados, os avisos push podem chegar mesmo com a aplicação fechada. Os horários são previstos, não confirmações de circulação.</p>
 <div className="alertsForm"><label>Monitorizar<select value={alertScope} onChange={e=>setAlertScope(e.target.value)}><option value="station">Estação</option><option value="train">Comboio</option><option value="combined">Comboio + estação</option></select></label>
 {alertScope==='train'&&<label>Pesquisar comboios por estação<input value={alertTrainStation} onChange={e=>setAlertTrainStation(e.target.value)} placeholder="Ex.: Monte Real" list="stationsList"/></label>}
  <label>{alertScope==='station'?'Nome exato da estação':'Número do comboio'}<input value={alertTarget} onChange={e=>setAlertTarget(e.target.value)} placeholder={alertScope==='station'?'Ex.: Leiria':'Ex.: 6450'} list={alertScope==='station'?'stationsList':undefined}/></label>
 {alertScope==='combined'&&<label>Estação de destino do alerta<input value={alertStation} onChange={e=>setAlertStation(e.target.value)} placeholder='Ex.: Monte Real' list='stationsList'/></label>}
 {alertScope!=='station'&&stationLookupKey.length>=2&&<div className="alertTrainPicker"><strong>Comboios identificados em {stationLookup}</strong><p>Circulação recebida pela API; não inclui necessariamente todos os horários.</p>{availableTrainOptions.length?availableTrainOptions.map(t=>{const num=String(t.trainNumber??t.number??t.id);const code=serviceTypeCode(t.service??t.trainService??t.serviceCode);return <button type="button" className="alertTrainChoice" key={num} onClick={()=>selectAlertTrain(t)}><b>{code?code+" ":""}{num}</b> · {n(t.origin?.designation??t.origin)} → {n(t.destination?.designation??t.destination)}<small style={{display:"block",fontSize:".85em",marginTop:4}}>{terminalScheduleText(t)} · {stationScheduleText(t,stationLookup)}</small></button>}):<p>Nenhum comboio identificado nesta estação nos dados atuais. Podes inserir o número manualmente.</p>}</div>}
  <datalist id="stationsList">{[...new Set(trains.flatMap(t=>(t.trainStops||[]).map(s=>s?.station?.designation).filter(Boolean)))].sort().map(st=><option key={st} value={st}/>)}</datalist>
 <label>Evento<select value={alertEvent} onChange={e=>setAlertEvent(e.target.value)}><option value="both">Chegada e partida</option><option value="arrival">Chegada</option><option value="departure">Partida</option></select></label>
 <label>Antecedência livre (minutos, 0–1440)<input type="number" min="0" max="1440" step="1" value={alertLead} onChange={e=>setAlertLead(e.target.value)}/></label>
 <label>Periodicidade<select value={scheduleType} onChange={e=>setScheduleType(e.target.value)}><option value="weekly">Dias da semana</option><option value="date">Data específica</option><option value="monthly">Dia do mês</option></select></label>
 {scheduleType==='date'&&<label>Data do alerta<input type="date" value={alertDate} onChange={e=>setAlertDate(e.target.value)}/></label>}
 {scheduleType==='monthly'&&<><label>Dia do mês<select value={monthDay} onChange={e=>setMonthDay(e.target.value)}>{Array.from({length:31},(_,i)=><option key={i+1} value={i+1}>{i+1}</option>)}</select></label><label>Ano (opcional)<input type="number" min="2020" max="2100" placeholder="Todos os anos" value={monthYear} onChange={e=>setMonthYear(e.target.value)}/></label><small>Nos meses sem esse dia, o alerta não é executado.</small></>}
 {scheduleType==='weekly'&&<fieldset><legend>Dias da semana</legend>{['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'].map((d,i)=><label key={d} style={{display:'inline-flex',gap:4,marginRight:12,alignItems:'center'}}><input type="checkbox" checked={alertDays.includes(i)} onChange={e=>setAlertDays(v=>e.target.checked?[...v,i].sort():v.filter(x=>x!==i))}/>{d}</label>)}</fieldset>}
 <label><input type="checkbox" checked={notifyBefore} onChange={e=>setNotifyBefore(e.target.checked)}/> Pré-aviso antes da chegada prevista</label>
 <label><input type="checkbox" checked={notifyOnArrival} onChange={e=>setNotifyOnArrival(e.target.checked)}/> Avisar quando a passagem pela estação for detetada (não confirma paragem)</label>
 <button onClick={addAlert}>{editingAlertId?"Guardar alterações":"+ Guardar alerta"}</button>{editingAlertId&&<button className="secondary" onClick={()=>{setEditingAlertId(null);setAlertMsg("Edição cancelada.")}}>Cancelar edição</button>}<button onClick={enableNotifications} className="secondary">Autorizar notificações</button><button onClick={testNotification} className="secondary">🔔 Testar notificação local</button><button onClick={async()=>{setAlertMsg('A verificar o registo Firebase…');try{setAlertMsg(await initPush(LOCAL_API,getSavedAlerts()))}catch(e){setAlertMsg(`Push não configurado: ${e.message}`)}}} className="secondary">☁️ Ativar push em segundo plano</button><button onClick={async()=>{try{const r=await scheduleRemotePushTest();setAlertMsg(`Teste remoto agendado para daqui a ${r.delay_seconds} segundos. Fecha agora a APK e bloqueia o ecrã.`)}catch(e){setAlertMsg('Teste remoto: '+e.message)}}} className="secondary">📡 Testar push remoto (60 segundos)</button></div>
 {alertMsg&&<p role="status">{alertMsg}</p>}
 <div className="alertRules">{alerts.length===0?<p>Sem alertas configurados.</p>:alerts.map(a=><div className="alertRule" key={a.id}><span><b>{a.scope==='station'?'Estação':a.scope==='combined'?'Comboio + estação':'Comboio'}: {a.target}{a.station?' → '+a.station:''}</b><small>{a.event==='both'?'Chegada e partida':a.event==='arrival'?'Chegada':'Partida'} · {a.notifyBefore!==false?`${a.lead} min antes`:''}{a.notifyOnArrival?' · passagem detetada':''} · {scheduleLabel(a)}</small></span><button onClick={()=>editAlert(a)} aria-label={`Editar alerta ${a.target}`}>Editar</button><button onClick={()=>removeAlert(a.id)} aria-label={`Remover alerta ${a.target}`}>Remover</button></div>)}</div>
 </section>}
 <div id="map"/>{selectedStation&&<section className="searchResults" style={{padding:16}}><h3>🚉 {selectedStation} · comboios identificados</h3><p>Serviços presentes nos dados de circulação recebidos. Não é o horário completo da estação.</p>{trains.filter(t=>(t.trainStops||[]).some(st=>normalizeSearch(st?.station?.designation||st?.station?.name||"")===normalizeSearch(selectedStation))).sort((a,b)=>stationScheduleText(a,selectedStation).localeCompare(stationScheduleText(b,selectedStation))).map(t=><button type="button" className="alertTrainChoice" key={String(t.trainNumber??t.id)} onClick={()=>focusTrain(t)}><b>🚆 {n(t.trainNumber??t.id)}</b> · {n(t.origin?.designation??t.origin)} → {n(t.destination?.designation??t.destination)}<small style={{display:"block"}}>{stationScheduleText(t,selectedStation)}</small></button>)}<button className="secondary" onClick={()=>setSelectedStation("")}>Fechar</button></section>}
 <aside>{query&&<section className="searchResults"><h3>Resultados da pesquisa</h3><small>{filtered.length} comboio(s) · {matchingStations.length} estação(ões){matchingStations.length===12?" (primeiros resultados)":""}</small>{matchingStations.map((layer,i)=><button className="searchStation" key={i} onClick={()=>focusStation(layer)}>📍 {layer.feature?.properties?.name??layer.feature?.properties?.designacao}</button>)}{filtered.length===0&&matchingStations.length===0&&<p>Sem resultados nos dados carregados. Os comboios sem circulação ativa podem não aparecer.</p>}</section>}<h3>Comboios</h3>{filtered.slice(0,100).map((t,i)=>{let d=+(t.delayMinutes??t.delay??0);return <article key={i} onClick={()=>focusTrain(t)}><b>🚆 {serviceTypeCode(t.service||t.trainService)?serviceTypeCode(t.service||t.trainService)+" ":""}{n(t.trainNumber??t.number??t.id)}</b><span className={d>0?"late":"ok"}>{d>0?`+${d} min`:"A horas"}</span><small>{n(t.origin?.designation??t.origin)} → {n(t.destination?.designation??t.destination)}</small></article>})}</aside>
 {sel&&<div className="trainModalBackdrop" onClick={()=>setSel(null)}><div className="card" role="dialog" aria-modal="true" aria-label="Informação do comboio" onClick={e=>e.stopPropagation()}><button className="trainModalClose" aria-label="Fechar informação do comboio" onClick={()=>setSel(null)}>×</button><h2>🚆 {n(sel.trainNumber??sel.number??sel.id)}</h2><p><b>{n(sel.origin?.designation??sel.origin)}</b> → <b>{n(sel.destination?.designation??sel.destination)}</b></p><p>Partida da origem: <b>{terminalTimes(sel).departure??"Horário não disponível"}</b> · Chegada ao destino: <b>{terminalTimes(sel).arrival??"Horário não disponível"}</b></p><p>Atraso (indicativo): <strong className={+(sel.delayMinutes??sel.delay??0)>0?"late":"ok"}>{+(sel.delayMinutes??sel.delay??0)>0?`+${sel.delayMinutes??sel.delay} min`:"A horas"}</strong></p><p>Serviço: <b>{n(sel.service??sel.serviceCode)}</b></p><p>Estado: {n(sel.status)} · Última: {n(sel.lastStation)}</p><p>Próxima: {n(sel.nextStop?.designation??sel.nextStop)}</p><section className="etaSection"><h3>🕒 ETA (indicativo)</h3><p className="etaNote">Atualizado: {updated?updated.toLocaleTimeString("pt-PT",{hour:"2-digit",minute:"2-digit",second:"2-digit"}):"—"} · {updated&&clock-updated>120000?"⚠️ Dados com mais de 2 minutos":"Dados da última consulta"}</p><p className="etaNote">Percurso: {etaProgress(sel).lastIndex>=0?`${etaProgress(sel).lastIndex+1} de ${etaProgress(sel).stops.length} estações alcançadas (última conhecida)` :"posição no percurso não confirmada"}</p><p className="etaNote">ETA e minutos de atraso são indicativos, sujeitos a alterações. *Contagem aproximada, dependente do dia de circulação.</p>{trainStopsEta(sel).length? <div className="etaStops">{trainStopsEta(sel).map(stop=><div className="etaStop" key={stop.key}><b>{stop.station}</b><span>Horário: {stop.scheduled??'—'}</span><strong>ETA: {stop.eta??'indisponível'}</strong>{stop.eta&&minutesUntil(stop.eta,clock)!==null&&<span className="etaCountdown">Dentro de {minutesUntil(stop.eta,clock)} min*</span>}<small>{stop.source==='calculado'?'Calculado com o atraso atual':stop.source==='fonte'?'Estimativa fornecida pela fonte':'Dados insuficientes'}</small></div>)}</div>:<p>Não há horários de paragem disponíveis para calcular o ETA.</p>}</section><p>Fonte dos dados: <b>WebApp Comboios Live — Rui Costa</b></p><small>Posição e estado dependem da fonte dinâmica disponível. Informação não destinada a segurança da exploração.</small></div></div>}
 <footer>Fonte dos dados de circulação: <b>WebApp Comboios Live — Rui Costa</b> · A RJP Train Live apresenta e organiza a informação recebida através da RJP API. · Não destinada à segurança da exploração.</footer></main>
}
class RjpErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){console.error("[RJP Train Live] render",error,info)}
 render(){return this.state.error?<div style={{minHeight:"100vh",padding:24,background:"#07111d",color:"#edf5ff",fontFamily:"system-ui"}}><h2>RJP Train Live · Erro na interface</h2><p>Não apagues os dados da aplicação. Envia esta mensagem para diagnóstico:</p><pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere"}}>{String(this.state.error?.message||this.state.error)}</pre><button onClick={()=>window.location.reload()}>Tentar novamente</button></div>:this.props.children}
}
window.addEventListener("error",e=>{console.error("[RJP Train Live] JavaScript",e.message,e.error)});
window.addEventListener("unhandledrejection",e=>{console.error("[RJP Train Live] promise",e.reason)});
createRoot(document.getElementById("root")).render(<RjpErrorBoundary><App/></RjpErrorBoundary>);
