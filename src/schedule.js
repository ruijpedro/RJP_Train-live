// Regras de calendário: compatível com alertas antigos sem scheduleType.
export function activeSchedule(rule, now=new Date(), timeZone='Europe/Lisbon') {
  const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',weekday:'short'}).formatToParts(now).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
  const date=`${parts.year}-${parts.month}-${parts.day}`;
  const kind=rule.scheduleType||'weekly';
  if(kind==='date')return typeof rule.date==='string' && rule.date===date;
  if(kind==='monthly')return Number(rule.monthDay)===Number(parts.day) && (!rule.year || Number(rule.year)===Number(parts.year));
  const day=['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].indexOf(parts.weekday);
  return !Array.isArray(rule.days)||rule.days.includes(day);
}
export function scheduleLabel(rule){
  if(rule.scheduleType==='date')return `Apenas ${String(rule.date||'').split('-').reverse().join('/')}`;
  if(rule.scheduleType==='monthly')return `Dia ${rule.monthDay} de cada mês${rule.year?' de '+rule.year:''}`;
  return Array.isArray(rule.days)?rule.days.map(i=>['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'][i]).join(', '):'Todos os dias';
}
