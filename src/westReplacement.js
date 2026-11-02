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
