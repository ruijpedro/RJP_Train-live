import L from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";

const BASE = import.meta.env.BASE_URL;
const TYPES = ["U","R","IR","IC","AP","SUD","CP"];
const COLORS = {U:"#3b82f6",R:"#22c55e",IR:"#a78bfa",IC:"#fb923c",AP:"#fb7185",SUD:"#2dd4bf",CP:"#94a3b8"};
const el = document.getElementById("app");
el.innerHTML = `
<header>
 <div class="brand"><div class="brandIcon">🚆</div><div><h1>RJP TRAIN LIVE <span>2.0</span></h1><p>Laboratório CP • plataforma ferroviária independente</p></div></div>
 <div class="headRight"><strong>HORÁRIOS CP</strong><small>Versão experimental</small></div>
</header>
<div class="sourceNote"><strong>Dados oficiais GTFS da CP</strong><span>Horários programados, sem atrasos em direto e sem localização GPS. Os comboios ainda não são representados no mapa.</span></div>
<div class="controls">
 <label><span>Data</span><select id="day"><option>A carregar…</option></select></label>
 <label class="searchBox"><span>Pesquisar comboio ou estação</span><input id="q" placeholder="Número, origem, destino ou paragem" autocomplete="off"/></label>
 <button id="reload">Atualizar dados</button>
</div>
<div class="types" id="types"></div>
<div class="stats"><span id="count">A carregar horários CP…</span><span id="freshness"></span></div>
<div class="workspace">
 <div id="map" aria-label="Mapa de estações CP"></div>
 <section class="results"><h2>Circulações programadas</h2><div id="trains"></div></section>
</div>
<footer><b>RJP Train Live 2.0</b> · Desenvolvimento independente · As linhas entre paragens são esquemáticas; não representam posições reais de comboios nem o traçado exato da via.</footer>
`;

const dom = Object.fromEntries(["q","day","types","reload","count","freshness","trains"].map(id=>[id,document.getElementById(id)]));
let manifest=null,data=null,selected="ALL",stationMarkers=L.layerGroup(),routeLayer=L.layerGroup(),stationIndex=new Map();
const map=L.map("map",{zoomControl:true}).setView([39.65,-8.15],7);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19,attribution:"© OpenStreetMap"}).addTo(map);
L.tileLayer("https://{s}.tiles.openrailwaymap.org/standard/{z}/{x}/{y}.png",{maxZoom:19,opacity:.88,attribution:"OpenRailwayMap"}).addTo(map);
stationMarkers.addTo(map);
routeLayer.addTo(map);

function safeText(v){return String(v??"").replace(/[&<>"']/g,ch=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[ch]));}
function sameLocation(p){return Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);}
function setMessage(msg){dom.count.textContent=msg;}
function renderTypes(){
 dom.types.innerHTML=["ALL",...TYPES].map(t=>`<button class="type ${selected===t?"active":""}" data-type="${t}" style="--type-color:${COLORS[t]||"#38bdf8"}">${t==="ALL"?"Todos":t}</button>`).join("");
 dom.types.querySelectorAll("button").forEach(b=>b.onclick=()=>{selected=b.dataset.type;renderTypes();renderTrains();});
}
function renderStations(){
 stationMarkers.clearLayers();
 stationIndex=new Map();
 for(const station of data?.stations||[]){
  if(!sameLocation(station.location))continue;
  stationIndex.set(station.id,station);
  const mk=L.circleMarker(station.location,{radius:3.5,weight:1,color:"#60a5fa",fillColor:"#c4e9ff",fillOpacity:.85});
  mk.bindTooltip(safeText(station.name),{direction:"top"});
  mk.on("click",()=>{dom.q.value=station.name;renderTrains();});
  mk.addTo(stationMarkers);
 }
}
function viewTrain(t){
 routeLayer.clearLayers();
 const points=(t.stops||[]).filter(s=>sameLocation(s.location)).map(s=>s.location);
 if(points.length>=2){
  L.polyline(points,{color:COLORS[t.type]||COLORS.CP,weight:3,opacity:.8,dashArray:"6 7"}).addTo(routeLayer);
  map.fitBounds(L.latLngBounds(points).pad(.12),{maxZoom:11});
 }else if(points.length===1)map.setView(points[0],12);
 const panel=document.createElement("div");
 panel.className="details";
 panel.innerHTML=`<div><strong>${safeText(t.type)} ${safeText(t.number)}</strong> · ${safeText(t.origin)} → ${safeText(t.destination)}</div><p>Paragens programadas (não há confirmação de passagem em direto)</p>`+
 (t.stops||[]).map(s=>`<div class="stop"><span>${safeText(s.name)}</span><span>${safeText(s.departure||s.arrival)}</span></div>`).join("");
 const existing=document.querySelector(".details");if(existing)existing.remove();
 document.querySelector(".results").append(panel);
 panel.scrollIntoView({behavior:"smooth",block:"nearest"});
}
function renderTrains(){
 if(!data)return;
 const q=dom.q.value.trim().toLocaleLowerCase("pt-PT");
 const matches=data.trains.filter(t=>(selected==="ALL"||t.type===selected)&&(!q||[t.number,t.route,t.headsign,t.origin,t.destination,...(t.stops||[]).map(s=>s.name)].some(v=>String(v||"").toLocaleLowerCase("pt-PT").includes(q))));
 dom.count.textContent=`${matches.length} circulações programadas de ${data.trains.length} no dia ${data.date}`;
 const visible=matches.slice(0,100);
 dom.trains.innerHTML=visible.map((t,i)=>`<button class="train" data-index="${i}">
 <span class="pill" style="--type-color:${COLORS[t.type]||COLORS.CP}">${safeText(t.type)}</span>
 <span class="trainInfo"><strong>${safeText(t.number)}</strong><small>${safeText(t.origin)} → ${safeText(t.destination)}</small></span>
 <span class="hours"><b>${safeText(t.departure)} → ${safeText(t.arrival)}</b><small>previsto</small></span></button>`).join("");
 if(matches.length>100)dom.trains.innerHTML+=`<p class="limit">A mostrar 100 resultados. Pesquisa um comboio ou uma estação para restringir.</p>`;
 if(!matches.length)dom.trains.innerHTML='<p class="empty">Nenhuma circulação programada corresponde aos filtros.</p>';
 dom.trains.querySelectorAll("button[data-index]").forEach(b=>b.onclick=()=>viewTrain(visible[Number(b.dataset.index)]));
 document.querySelector(".details")?.remove();
 routeLayer.clearLayers();
}
async function fetchJson(path){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),18000);
 try{
  const r=await fetch(BASE+"data/cp/"+path,{cache:"no-store",signal:controller.signal});
  if(!r.ok)throw Error("HTTP "+r.status+" em "+path);
  return await r.json();
 }finally{clearTimeout(timer);}
}
async function loadDay(date){
 setMessage("A ler horários CP…");
 try{
  data=await fetchJson(date+".json");
  if(data.realtime!==false||data.gps!==false)throw Error("Tipo de dados inesperado");
  dom.freshness.textContent="GTFS importado: "+new Date(data.generatedAt).toLocaleString("pt-PT");
  renderStations();renderTrains();map.invalidateSize();
 }catch(e){setMessage("Horários indisponíveis: "+e.message);dom.trains.innerHTML="<p class='empty'>A importação GTFS tem de terminar com sucesso no GitHub Actions.</p>";}
}
async function load(){
 setMessage("A consultar índice oficial…");
 try{
  manifest=await fetchJson("manifest.json");
  if(!manifest?.days?.length||manifest.realtime!==false)throw Error("Índice GTFS inválido");
  dom.day.innerHTML=manifest.days.map(d=>`<option value="${safeText(d.date)}">${safeText(d.date)} · ${d.trains} comboios</option>`).join("");
  await loadDay(dom.day.value);
 }catch(e){setMessage("Não foi possível obter a base CP: "+e.message);dom.trains.innerHTML="<p class='empty'>Sem base GTFS importada. Compila o projeto através do workflow da versão 2.0.</p>";}
}
dom.q.addEventListener("input",renderTrains);
dom.day.addEventListener("change",()=>loadDay(dom.day.value));
dom.reload.onclick=load;
renderTypes();
load();
