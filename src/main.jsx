
import React,{useEffect,useRef,useState}from"react";
import{createRoot}from"react-dom/client";
import L from"leaflet";import"./style.css";
const API=localStorage.getItem("rjp_api")||"http://localhost:3000/api";
const n=v=>v??"—";
function App(){
 const mapRef=useRef(),layers=useRef({}); const[trains,setTrains]=useState([]),[sel,setSel]=useState(),[q,setQ]=useState(""),[status,setStatus]=useState("A ligar…"),[updated,setUpdated]=useState();
 useEffect(()=>{let m=L.map("map",{zoomControl:true}).setView([39.65,-8.15],7);mapRef.current=m;
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap"}).addTo(m);
 layers.current.rail=L.geoJSON(null,{style:{weight:3,opacity:.8}}).addTo(m);
 layers.current.st=L.geoJSON(null,{pointToLayer:(f,ll)=>L.circleMarker(ll,{radius:4,weight:1,fillOpacity:.9}),onEachFeature:(f,l)=>l.bindTooltip(f.properties?.name||f.properties?.designacao||"Estação")}).addTo(m);
 layers.current.tr=L.layerGroup().addTo(m);
 Promise.all([fetch("/data/railways.geojson").then(r=>r.ok?r.json():null),fetch("/data/stations.geojson").then(r=>r.ok?r.json():null)]).then(([r,s])=>{if(r)layers.current.rail.addData(r);if(s)layers.current.st.addData(s)});
 return()=>m.remove()},[]);
 async function load(){
  try{let r=await fetch(`${API}/trains/active`);if(!r.ok)throw Error(r.status);let j=await r.json();let a=Array.isArray(j)?j:(j.data||j.trains||[]);setTrains(a);setUpdated(new Date());setStatus(`Online · ${j.primary||"Live"}`);
   let g=layers.current.tr;g.clearLayers();a.forEach(t=>{let lat=+(t.latitude??t.lat),lon=+(t.longitude??t.lng??t.lon);if(!Number.isFinite(lat)||!Number.isFinite(lon))return;
    let d=+(t.delayMinutes??t.delay??0),mk=L.marker([lat,lon]).addTo(g);mk.bindTooltip(`🚆 ${n(t.trainNumber??t.number??t.id)} ${d>0?`+${d} min`:""}`);mk.on("click",()=>setSel(t));
   })
  }catch(e){setStatus("Fonte dinâmica indisponível")}
 }
 useEffect(()=>{load();let i=setInterval(load,30000);return()=>clearInterval(i)},[]);
 let filtered=trains.filter(t=>JSON.stringify(t).toLowerCase().includes(q.toLowerCase()));
 return <main><header><div><div className="brand"><img src="/icons/icon-192.png" className="brandIcon" alt="RJP Train Live"/><h1>RJP TRAIN LIVE <em>V2</em></h1></div><small>Rede Ferroviária Nacional • Comboios • Estações • Atrasos</small></div><div className="live"><i className={status==="Online"?"on":""}/>{status}</div></header>
 <nav><input placeholder="Pesquisar comboio, estação ou linha…" value={q} onChange={e=>setQ(e.target.value)}/><button onClick={load}>↻ Atualizar</button></nav>
 <section className="stats"><div><b>{trains.length}</b><small>comboios recebidos</small></div><div><b>{trains.filter(t=>+(t.delayMinutes??t.delay??0)>0).length}</b><small>com atraso</small></div><div><b>{updated?updated.toLocaleTimeString("pt-PT"):"—"}</b><small>última atualização</small></div></section>
 <div id="map"/>
 <aside><h3>Comboios</h3>{filtered.slice(0,100).map((t,i)=>{let d=+(t.delayMinutes??t.delay??0);return <article key={i} onClick={()=>setSel(t)}><b>🚆 {n(t.trainNumber??t.number??t.id)}</b><span className={d>0?"late":"ok"}>{d>0?`+${d} min`:"A horas"}</span><small>{n(t.origin?.designation??t.origin)} → {n(t.destination?.designation??t.destination)}</small></article>})}</aside>
 {sel&&<div className="card"><button onClick={()=>setSel()}>×</button><h2>🚆 {n(sel.trainNumber??sel.number??sel.id)}</h2><p><b>{n(sel.origin?.designation??sel.origin)}</b> → <b>{n(sel.destination?.designation??sel.destination)}</b></p><p>Atraso: <strong className={+(sel.delayMinutes??sel.delay??0)>0?"late":"ok"}>{+(sel.delayMinutes??sel.delay??0)>0?`+${sel.delayMinutes??sel.delay} min`:"A horas"}</strong></p><p>Serviço: <b>{n(sel.service??sel.serviceCode)}</b></p><p>Estado: {n(sel.status)} · Última: {n(sel.lastStation)}</p><p>Próxima: {n(sel.nextStop?.designation??sel.nextStop)}</p><p>Fonte: <b>{n(sel.source)}</b></p><small>Posição e estado dependem da fonte dinâmica disponível. Informação não destinada a segurança da exploração.</small></div>}
 </main>
}
createRoot(document.getElementById("root")).render(<App/>);
