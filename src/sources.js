// Service classification is independent of data provenance.
const TYPES=[["AP",/\b(?:AP|ALFA[ -]?PENDULAR)\b/i,"Alfa Pendular"],["IC",/\b(?:IC|INTERCIDADES)\b/i,"Intercidades"],["IR",/\b(?:IR|INTER[ -]?REGIONAL)\b/i,"InterRegional"],["R",/\b(?:R|REGIONAL)\b/i,"Regional"],["U",/\b(?:U|URBANO|URBANOS)\b/i,"Urbano"]];
export function serviceTypeLabel(value){const text=String(value??"").trim();return TYPES.find(([,rx])=>rx.test(text))?.[2]||text||"Não identificado"}
export function serviceTypeCode(value){const text=String(value??"").trim();return TYPES.find(([,rx])=>rx.test(text))?.[0]||""}
export const DATA_SOURCES=Object.freeze([{id:"comboios-live",name:"Comboios Live — Rui Costa",status:"integrada"},{id:"ja-vou",name:"Já Vou — javou.pt",status:"por validar"}]);
export function sourceNames(){return DATA_SOURCES.map(s=>s.name)}
