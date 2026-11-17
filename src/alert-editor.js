// Pure, backward-compatible editing of the existing RJP Train Live alert rules.
// Never generate a new ID when editing, so the Firebase server can replace
// the matching remote rule and local deduplication keeps working.
export function formFromAlert(rule={}){
 return {
  scope:["station","train","combined"].includes(rule.scope)?rule.scope:"station",
  target:String(rule.target??""),
  station:String(rule.station??""),
  event:["both","arrival","departure"].includes(rule.event)?rule.event:"both",
  lead:Number.isFinite(Number(rule.lead))?Number(rule.lead):10,
  scheduleType:["weekly","date","monthly"].includes(rule.scheduleType)?rule.scheduleType:"weekly",
  date:String(rule.date??""),
  days:Array.isArray(rule.days)?[...rule.days]:[0,1,2,3,4,5,6],
  monthDay:Number.isFinite(Number(rule.monthDay))?Number(rule.monthDay):1,
  monthYear:rule.year==null?"":String(rule.year),
  notifyBefore:rule.notifyBefore!==false,
  notifyOnArrival:rule.notifyOnArrival!==false,
  enabled:rule.enabled!==false
 };
}
const validDate=date=>{
 if(!/^\d{4}-\d{2}-\d{2}$/.test(String(date)))return false;
 const [year,month,day]=date.split("-").map(Number);
 const utc=new Date(Date.UTC(year,month-1,day));
 return utc.getUTCFullYear()===year&&utc.getUTCMonth()+1===month&&utc.getUTCDate()===day;
};
export function makeAlertRule(form,{existing=null,createId=()=>Date.now().toString(36)}={}){
 const target=String(form.target??"").trim();
 const station=String(form.station??"").trim();
 const scope=String(form.scope??"station");
 const event=String(form.event??"both");
 const scheduleType=String(form.scheduleType??"weekly");
 const lead=Number(form.lead);
 const days=Array.isArray(form.days)?[...form.days]:[];
 const year=String(form.monthYear??"").trim();
 if(!target)throw Error("Indica a estação ou o número do comboio.");
 if(!["station","train","combined"].includes(scope)||!["both","arrival","departure"].includes(event))
  throw Error("Tipo de alerta inválido.");
 if(scope==="combined"&&!station)throw Error("Indica a estação para o alerta combinado.");
 if(!Number.isInteger(lead)||lead<0||lead>1440)throw Error("A antecedência tem de estar entre 0 e 1440 minutos.");
 if(!form.notifyBefore&&!form.notifyOnArrival)throw Error("Escolhe pelo menos um tipo de aviso.");
 if(!["weekly","date","monthly"].includes(scheduleType))throw Error("Periodicidade inválida.");
 if(scheduleType==="weekly"&&(!days.length||days.some(x=>!Number.isInteger(x)||x<0||x>6)))
  throw Error("Escolhe pelo menos um dia da semana.");
 if(scheduleType==="date"&&!validDate(String(form.date??"")))
  throw Error("Seleciona uma data válida.");
 if(scheduleType==="monthly"&&(!Number.isInteger(Number(form.monthDay))||
   Number(form.monthDay)<1||Number(form.monthDay)>31))
  throw Error("Seleciona um dia do mês entre 1 e 31.");
 if(scheduleType==="monthly"&&year!==""&&(!/^\d{4}$/.test(year)||+year<2020||+year>2100))
  throw Error("Ano inválido (2020–2100).");
 const id=existing?.id??createId();
 if(typeof id!=="string"||!id.trim())throw Error("Identificação do alerta inválida.");
 // Preserve unknown fields from old rules for compatibility.
 return {
  ...(existing??{}),id,scope,target,station:scope==="combined"?station:"",
  event,lead,days:scheduleType==="weekly"?days:[],
  scheduleType,date:scheduleType==="date"?String(form.date):undefined,
  monthDay:scheduleType==="monthly"?Number(form.monthDay):undefined,
  year:scheduleType==="monthly"&&year?Number(year):undefined,
  notifyBefore:Boolean(form.notifyBefore),
  notifyOnArrival:Boolean(form.notifyOnArrival),
  enabled:Boolean(form.enabled)
 };
}
export function replaceAlert(rules,newRule){
 if(!Array.isArray(rules))throw Error("Lista de alertas inválida.");
 if(!rules.some(rule=>rule.id===newRule?.id))throw Error("Alerta a editar não encontrado.");
 return rules.map(rule=>rule.id===newRule.id?newRule:rule);
}
