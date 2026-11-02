// CP official replacement-road-service stop information, valid through 2026-11-14.
// Never infer GPS coordinates or real-time vehicle location from these records.
export const WEST_REPLACEMENT={
 title:"Linha do Oeste — transporte rodoviário de substituição",
 validThrough:"2026-11-14",
 source:"CP — Comboios de Portugal",
 infoUrl:"https://www.cp.pt/info/w/oeste-line",
 stopsUrl:"https://www.cp.pt/info/documents/d/cp/locais-paragem-oeste",
 stops:[
  {station:"Caldas da Rainha",place:"Largo da Estação"},
  {station:"Óbidos",place:"Rua da Praça, em frente à Caixa Geral de Depósitos"},
  {station:"Bombarral",place:"Largo da Estação"},
  {station:"Outeiro",place:"Junto à Junta de Freguesia, cruzamento da Rua da Estação com a Rua da Igreja"},
  {station:"Ramalhal",place:"Cruzamento da N8 com a Av. 25 de Abril"},
  {station:"Torres Vedras",place:"Largo da Estação"}
 ]
};
export function replacementStops(direction="caldas-torres"){
 const stops=WEST_REPLACEMENT.stops;
 return direction==="torres-caldas"?[...stops].reverse():[...stops];
}

// TR = transbordo rodoviário in the official CP Oeste timetable dated 22 March 2026.
// These are service identifiers, not proof of a tracked bus or live position.
export const WEST_ROAD_SERVICES=Object.freeze({
 "caldas-torres":["36400","30810","36404","36406","36408","36410","36412","36414"],
 "torres-caldas":["36403","36405","36413","36407","36409","36411","30811","36415","36417"]
});
export const WEST_TIMETABLE_URL="https://www.cp.pt/info/documents/d/cp/comboios-regionais-lisboa-figueira-da-foz-oeste";
export function findWestRoadService(value){
 const id=String(value??"").trim();
 const direction=Object.keys(WEST_ROAD_SERVICES).find(k=>WEST_ROAD_SERVICES[k].includes(id));
 return direction?{id,direction,stops:replacementStops(direction),kind:"scheduled",hasLivePosition:false}:null;
}
export function jaVouServiceUrl(number,date){
 const id=String(number??"").trim();
 if(!/^\\d{4,6}$/.test(id))return null;
 const day=String(date??"").replace(/-/g,"");
 if(!/^\\d{8}$/.test(day))return null;
 return "https://javou.pt/vehicle/cp/"+encodeURIComponent(id+"_"+day);
}
