
import React,{useEffect,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import L from"leaflet";import"./style.css";
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
 const delaySec=Number(live.delay);
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
function App(){
 const mapRef=useRef(),layers=useRef({}); const[trains,setTrains]=useState([]),[sel,setSel]=useState(),[q,setQ]=useState(""),[status,setStatus]=useState("A ligar…"),[updated,setUpdated]=useState(),[loading,setLoading]=useState(false);
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
   setTrains(a);setUpdated(new Date());setStatus(`Online · ${primary}`);
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
 let filtered=trains.filter(t=>JSON.stringify(t).toLowerCase().includes(q.toLowerCase()));
 return <main><header><div><div className="brand"><img src={`${BASE}icons/icon-192.png`} className="brandIcon" alt="RJP Train Live"/><h1>RJP TRAIN LIVE <em>V2.5.1</em></h1></div><small>Tráfego Ferroviário em Portugal • Rede • Comboios • Estações • Atrasos</small></div><div className="sourceBox"><div className="live"><i className={status.startsWith("Online")?"on":""}/>{status}</div><small>Fonte dos dados: <b>WebApp Comboios Live — Rui Costa</b></small></div></header>
 <nav><input placeholder="Pesquisar comboio, estação ou linha…" value={q} onChange={e=>setQ(e.target.value)}/><button className={loading?"refresh loading":"refresh"} onClick={load} disabled={loading}><span>↻</span>{loading?" A atualizar…":" Atualizar agora"}</button></nav>
 <section className="stats"><div><b>{trains.length}</b><small>comboios recebidos</small></div><div><b>{trains.filter(t=>+(t.delayMinutes??t.delay??0)>0).length}</b><small>com atraso</small></div><div><b>{updated?updated.toLocaleTimeString("pt-PT"):"—"}</b><small>última atualização</small></div></section>
 <div id="map"/>
 <aside><h3>Comboios</h3>{filtered.slice(0,100).map((t,i)=>{let d=+(t.delayMinutes??t.delay??0);return <article key={i} onClick={()=>setSel(t)}><b>🚆 {n(t.trainNumber??t.number??t.id)}</b><span className={d>0?"late":"ok"}>{d>0?`+${d} min`:"A horas"}</span><small>{n(t.origin?.designation??t.origin)} → {n(t.destination?.designation??t.destination)}</small></article>})}</aside>
 {sel&&<div className="card"><button onClick={()=>setSel()}>×</button><h2>🚆 {n(sel.trainNumber??sel.number??sel.id)}</h2><p><b>{n(sel.origin?.designation??sel.origin)}</b> → <b>{n(sel.destination?.designation??sel.destination)}</b></p><p>Atraso: <strong className={+(sel.delayMinutes??sel.delay??0)>0?"late":"ok"}>{+(sel.delayMinutes??sel.delay??0)>0?`+${sel.delayMinutes??sel.delay} min`:"A horas"}</strong></p><p>Serviço: <b>{n(sel.service??sel.serviceCode)}</b></p><p>Estado: {n(sel.status)} · Última: {n(sel.lastStation)}</p><p>Próxima: {n(sel.nextStop?.designation??sel.nextStop)}</p><p>Fonte dos dados: <b>WebApp Comboios Live — Rui Costa</b></p><p className="via">Ligação: RJP API / Cloudflare Worker</p><small>Posição e estado dependem da fonte dinâmica disponível. Informação não destinada a segurança da exploração.</small></div>}
 <footer>Fonte dos dados de circulação: <b>WebApp Comboios Live — Rui Costa</b> · A RJP Train Live apresenta e organiza a informação recebida através da RJP API. · Não destinada à segurança da exploração.</footer></main>
}
createRoot(document.getElementById("root")).render(<App/>);
