import React,{useEffect,useMemo,useRef,useState} from 'react';
import {onboardStops,onboardProgress,onboardArrivalMinutes,gpsSpeedKmh,validOnboardPosition} from './onboard.js';

export default function OnboardPanel({train,onEnd,onPosition,onCenter,onRequestNotification,onNotify}){
  const [expanded,setExpanded]=useState(true);
  const [gps,setGps]=useState({state:'requesting'});
  const [destination,setDestination]=useState('');
  const [lead,setLead]=useState(5);
  const [notifyEnabled,setNotifyEnabled]=useState(false);
  const [warning,setWarning]=useState('');
  const notifiedRef=useRef('');
  const followRef=useRef(false);
  const [following,setFollowing]=useState(false);
  const [now,setNow]=useState(()=>new Date());
  const stations=useMemo(()=>onboardStops(train),[train]);
  const progress=onboardProgress(train);
  const selected=stations.find(s=>s.station===destination);
  const remaining=destination?onboardArrivalMinutes(destination,train,now):null;
  const validPosition=gps.state==='ready'&&validOnboardPosition(gps)?gps:null;

  useEffect(()=>{
    if(!('geolocation' in navigator)){
      setGps({state:'unavailable',message:'GPS indisponível neste dispositivo.'});
      return;
    }
    let alive=true;
    const id=navigator.geolocation.watchPosition(
      p=>{
        if(!alive)return;
        const coords=p.coords;
        if(!validOnboardPosition(coords))return;
        const next={state:'ready',latitude:coords.latitude,longitude:coords.longitude,
          accuracy:coords.accuracy,speed:gpsSpeedKmh(coords.speed),timestamp:p.timestamp};
        setGps(next);
        onPosition(next);
        if(followRef.current)onCenter(next);
      },
      e=>{if(alive)setGps({state:'error',message:e.code===1?'Permissão de localização recusada.':e.code===2?'Sem sinal GPS.':'GPS não respondeu.'})},
      {enableHighAccuracy:true,maximumAge:10000,timeout:20000}
    );
    return()=>{alive=false;navigator.geolocation.clearWatch(id);onPosition(null)};
  },[]);

  useEffect(()=>{const id=setInterval(()=>setNow(new Date()),15000);return()=>clearInterval(id)},[]);
  useEffect(()=>{notifiedRef.current='';setWarning('')},[destination,lead]);
  useEffect(()=>{
    if(!destination||remaining===null||remaining>lead)return;
    setWarning(remaining===0?'A hora prevista da estação de saída foi atingida.':`A estação de saída está prevista dentro de ${remaining} min.`);
    const key=destination+'|'+lead;
    if(!notifyEnabled||notifiedRef.current===key)return;
    notifiedRef.current=key;
    Promise.resolve(onNotify('🚆 RJP Train Live · Preparar saída',
      `${destination}: chegada prevista dentro de ${remaining} min. Confirma os anúncios a bordo.`,
      'onboard-'+key)).catch(console.warn);
  },[destination,remaining,lead,notifyEnabled,onNotify]);

  const positionLabel=validPosition?
    `GPS do telemóvel · precisão ±${Math.round(gps.accuracy||0)} m`:
    gps.state==='requesting'?'A obter GPS do telemóvel…':
    (gps.message||'GPS indisponível');
  const nextStation=progress.next||'Indisponível';

  return <section className={'onboardPanel'+(expanded?' onboardExpanded':'')} aria-label="Estou a bordo">
    <header className="onboardHeader">
      <button type="button" className="onboardCollapse" onClick={()=>setExpanded(v=>!v)}
        aria-expanded={expanded}>🚆 A bordo · {String(train?.trainNumber??train?.number??train?.id??'Comboio')} {expanded?'▾':'▴'}</button>
      <button type="button" className="onboardEnd" onClick={onEnd}>Terminar</button>
    </header>
    {expanded&&<div className="onboardBody">
      <div className="onboardNext"><small>Próxima estação (segundo a fonte)</small><strong>{nextStation}</strong></div>
      <div className="onboardProgress" role="progressbar" aria-label="Percurso estimado" aria-valuemin={0}
        aria-valuemax={100} aria-valuenow={progress.percent??undefined}>
        {progress.percent!==null&&<span style={{width:progress.percent+'%'}}/>}
      </div>
      <small>{progress.percent===null?'Progresso não confirmado':`Última estação conhecida: ${progress.lastIndex+1} de ${progress.total}. Progresso aproximado.`}</small>
      <label className="onboardLabel">Estação onde vou sair
        <select value={destination} onChange={e=>setDestination(e.target.value)}>
          <option value="">Escolher estação</option>
          {stations.map(s=><option key={s.key} value={s.station}>{s.station}</option>)}
        </select>
      </label>
      {stations.length===0&&<small>Esta fonte não fornece a lista de estações. Podes continuar a acompanhar a localização.</small>}
      {selected&&<div className="onboardEta"><span>Chegada prevista: <b>{selected.eta||'indisponível'}</b></span>
        <span>{remaining===null?'Contagem indisponível':`Faltam aproximadamente ${remaining} min`}</span>
        <small>ETA da fonte/horário; pode mudar. Não confirma paragem nem circulação.</small></div>}
      <div className="onboardGps"><b>📍 {positionLabel}</b>
        <span>Velocidade do telemóvel: {validPosition&&gps.speed!==null?gps.speed+' km/h':'indisponível'}</span>
        <small>Localização usada apenas neste dispositivo. Não enviada para o servidor.</small></div>
      <div className="onboardMapActions"><button type="button" className="onboardCenter" disabled={!validPosition}
        onClick={()=>onCenter(validPosition)}>◎ Centrar no meu GPS</button>
        <button type="button" className="onboardCenter" onClick={()=>{followRef.current=!followRef.current;setFollowing(followRef.current);if(followRef.current&&validPosition)onCenter(validPosition)}}>{following?'■ Parar seguimento':'▶ Seguir no mapa'}</button></div>
      <div className="onboardAlert"><label>Pré-aviso de saída
        <select value={lead} onChange={e=>setLead(Number(e.target.value))}>
          {[3,5,10,15].map(n=><option key={n} value={n}>{n} min antes</option>)}
        </select></label>
        <button type="button" disabled={notifyEnabled} onClick={async()=>{
          const ok=await onRequestNotification();
          setNotifyEnabled(ok);
          if(!ok)setWarning('Notificações não autorizadas. O aviso visual continua disponível.');
        }}>{notifyEnabled?'🔔 Notificações ativas':'🔔 Ativar aviso'}</button>
      </div>
      {warning&&<p className="onboardWarning" role="status">{warning}</p>}
      <small>O GPS e o aviso por ETA são acompanhados enquanto a aplicação está ativa. Esta versão não garante GPS em segundo plano nem avisos com a aplicação fechada.</small>
    </div>}
  </section>;
}
