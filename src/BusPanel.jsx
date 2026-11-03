import React,{useEffect,useRef,useState} from "react";
import L from "leaflet";
const OPERATORS=[{id:"rne",name:"Rede Expressos",timetable:"https://rede-expressos.pt/",tracking:"https://rede-expressos.pt/pt/localizar"},{id:"flix",name:"FlixBus",timetable:"https://www.flixbus.pt/",tracking:"https://www.flixbus.pt/track/"}];
const CITIES=[{name:"Lisboa",lat:38.7223,lon:-9.1393},{name:"Leiria",lat:39.7436,lon:-8.8071},{name:"Porto",lat:41.1579,lon:-8.6291},{name:"Coimbra",lat:40.2033,lon:-8.4103},{name:"Torres Vedras",lat:39.0911,lon:-9.2586},{name:"Caldas da Rainha",lat:39.4033,lon:-9.1362},{name:"Fátima",lat:39.625,lon:-8.665}];
const today=()=>new Date().toLocaleDateString("sv-SE");
export default function BusPanel(){
 const [origin,setOrigin]=useState("Lisboa"),[destination,setDestination]=useState("Leiria"),[date,setDate]=useState(today),[operator,setOperator]=useState("all"),[message,setMessage]=useState("");
 const mapRef=useRef(null),mapInstance=useRef(null),markers=useRef(null);
 useEffect(()=>{
  const map=L.map(mapRef.current,{zoomControl:true}).setView([39.65,-8.15],7);mapInstance.current=map;
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{attribution:"© OpenStreetMap contributors",maxZoom:18}).addTo(map);
  markers.current=L.layerGroup().addTo(map);
  const t=setTimeout(()=>map.invalidateSize(),100);
  return ()=>{clearTimeout(t);map.remove();mapInstance.current=null};
 },[]);
 useEffect(()=>{
  const a=CITIES.find(c=>c.name===origin),b=CITIES.find(c=>c.name===destination),group=markers.current,map=mapInstance.current;
  if(!group||!map)return;group.clearLayers();const points=[];
  for(const [c,label] of [[a,"Origem"],[b,"Destino"]])if(c){L.circleMarker([c.lat,c.lon],{radius:8,color:label==="Origem"?"#2f80ed":"#29a96a",fillOpacity:.9}).bindPopup(label+": "+c.name).addTo(group);points.push([c.lat,c.lon]);}
  if(points.length===2)map.fitBounds(points,{padding:[45,45],maxZoom:10});else if(points.length===1)map.setView(points[0],10);
 },[origin,destination]);
 const valid=origin!==destination;
 return <section className="busPage"><div className="busSidebar"><h2>🚌 BUS</h2><p>Horários e acompanhamento de autocarros interurbanos</p>
 <label>Origem<select value={origin} onChange={e=>setOrigin(e.target.value)}>{CITIES.map(c=><option key={c.name}>{c.name}</option>)}</select></label>
 <label>Destino<select value={destination} onChange={e=>setDestination(e.target.value)}>{CITIES.map(c=><option key={c.name}>{c.name}</option>)}</select></label>
 <label>Data da viagem<input type="date" value={date} onChange={e=>setDate(e.target.value)}/></label>
 <label>Operador<select value={operator} onChange={e=>setOperator(e.target.value)}><option value="all">Todos</option>{OPERATORS.map(o=><option value={o.id} key={o.id}>{o.name}</option>)}</select></label>
 {!valid&&<p role="alert">Escolhe cidades diferentes.</p>}
 <h3>Consultar horários e localização</h3>
 {OPERATORS.filter(o=>operator==="all"||operator===o.id).map(o=><article className="busOperator" key={o.id}><strong>{o.name}</strong><small>{valid?`${origin} → ${destination} · ${date}`:"Seleciona um percurso válido"}</small><div className="busActions"><a href={o.timetable} target="_blank" rel="noopener noreferrer">Horários oficiais ↗</a><a href={o.tracking} target="_blank" rel="noopener noreferrer">Localizar autocarro ↗</a></div></article>)}
 <p className="busNote">As ligações abrem os serviços oficiais. A pesquisa por cidade e data ainda não é transmitida automaticamente ao operador. Não existem posições GPS de RNE/FlixBus integradas nesta versão.</p>
 {message&&<p role="status">{message}</p>}
 <button type="button" onClick={()=>setMessage("Para ver veículos em movimento na aplicação é necessário validar uma fonte de GPS por serviço. Não apresentamos posições simuladas.")}>Estado do tempo real</button>
 </div><div className="busMapWrap"><div ref={mapRef} className="busMap" aria-label="Mapa BUS"/><div className="busMapLegend">● Origem &nbsp; ● Destino <small>Marcadores de cidades, não de autocarros</small></div></div></section>;
}
