import {Capacitor} from '@capacitor/core';
import {CapacitorUpdater} from '@capgo/capacitor-updater';

// Manual pilot. Existing push, Firebase, D1 and alert storage are untouched.
const URL=(import.meta.env.VITE_OTA_MANIFEST_URL||'https://raw.githubusercontent.com/ruijpedro/RJP_Train-live/main/ota/manifest.json').trim();
const APP='pt.rjp.trainlive';
const VERSION='2.12.0';
function parts(s){return /^\d+\.\d+\.\d+$/.test(s||'')?s.split('.').map(Number):null}
function isNewer(candidate,current){
 const a=parts(candidate),b=parts(current);
 if(!a||!b)return false;
 for(let i=0;i<3;i++){if(a[i]!==b[i])return a[i]>b[i]}
 return false;
}
export async function confirmOtaReady(){
 if(!Capacitor.isNativePlatform())return;
 await CapacitorUpdater.notifyAppReady();
}
export async function checkOtaUpdate(){
 if(!Capacitor.isNativePlatform())throw Error('OTA apenas disponível na APK Android.');
 const r=await fetch(URL,{cache:'no-store'});
 if(!r.ok)throw Error(`Manifesto HTTP ${r.status}`);
 const m=await r.json();
 if(m.appId!==APP||!parts(m.version))throw Error('Manifesto OTA inválido.');
 if(!isNewer(m.version,VERSION))return null;
 if(typeof m.url!=='string'||!/^https:\/\/(github\.com|objects\.githubusercontent\.com|rjp-train-live-ota\.rjpedro\.workers\.dev)\//.test(m.url))throw Error('URL OTA inválido.');
 return {version:m.version,url:m.url};
}
export async function installOtaUpdate(m){
 if(!Capacitor.isNativePlatform())throw Error('Apenas Android.');
 if(!m||!isNewer(m.version,VERSION)||!/^https:\/\/(github\.com|objects\.githubusercontent\.com|rjp-train-live-ota\.rjpedro\.workers\.dev)\//.test(m.url||''))throw Error('Pacote OTA inválido.');
 let bundle;
 // Sonda leve na WebView: permite distinguir falha de rede/HTTP de falha no plugin nativo.
 let preflight='não executado';
 try {
  const ctrl=new AbortController();
  const timer=setTimeout(()=>ctrl.abort(),12000);
  try {
   const r=await fetch(m.url,{method:'GET',headers:{Range:'bytes=0-99'},cache:'no-store',signal:ctrl.signal});
   const bytes=(await r.arrayBuffer()).byteLength;
   preflight=`WebView HTTP ${r.status}, bytes=${bytes}, tipo=${r.headers.get('content-type')||'?'}, range=${r.headers.get('content-range')||'nenhum'}`;
  } finally {clearTimeout(timer)}
 } catch(e) {
  preflight='WebView '+(e?.name||'erro')+': '+(e?.message||String(e));
 }
 console.info('[RJP OTA] preflight',preflight);
 try {
  bundle=await CapacitorUpdater.download({url:m.url,version:m.version});
 } catch(e) {
  const detail=[e?.message,e?.code,e?.status,e?.statusCode].filter(v=>v!==undefined&&v!==null).join(' | ');
  console.error('[RJP OTA] native download failed', {version:m.version,url:m.url,error:e});
  throw Error('Falha na descarga nativa Capgo: '+(detail||String(e))+' | Teste HTTP: '+preflight);
 }
 if(!bundle?.id)throw Error('Capgo não devolveu um identificador de pacote.');
 try {
  await CapacitorUpdater.set({id:bundle.id});
 } catch(e) {
  console.error('[RJP OTA] bundle activation failed',e);
  throw Error('Descarga concluída mas ativação falhou: '+(e?.message||String(e)));
 }
}

export async function diagnoseOta(){
 const lines=['RJP Train Live · Diagnóstico OTA',new Date().toISOString(),'Plataforma: '+Capacitor.getPlatform()];
 const probe=async(label,url,method='GET')=>{
  const ctrl=new AbortController();const timer=setTimeout(()=>ctrl.abort(),15000);
  try{
   const r=await fetch(url,{method,cache:'no-store',signal:ctrl.signal});
   lines.push(label+': HTTP '+r.status+' | tipo='+ (r.headers.get('content-type')||'?')+' | tamanho='+ (r.headers.get('content-length')||'?')+' | URL final='+r.url);
   if(label==='Manifesto'&&r.ok){const m=await r.json();lines.push('Versão remota: '+String(m.version||'?'));lines.push('ZIP: '+String(m.url||'?'));return m.url;}
  }catch(e){lines.push(label+': '+(e?.name||'Erro')+' '+(e?.message||String(e)));}
  finally{clearTimeout(timer);}
  return null;
 };
 const zip=await probe('Manifesto',URL);
 if(zip)await probe('ZIP HTTP HEAD',zip,'HEAD');
 lines.push('Nota: HEAD testa acesso pela WebView, não substitui a descarga nativa Capgo.');
 return lines.join('\n');
}
