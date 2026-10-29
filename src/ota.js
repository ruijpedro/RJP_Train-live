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
 if(typeof m.url!=='string'||!/^https:\/\/(github\.com|objects\.githubusercontent\.com)\//.test(m.url))throw Error('URL OTA inválido.');
 return {version:m.version,url:m.url};
}
export async function installOtaUpdate(m){
 if(!Capacitor.isNativePlatform())throw Error('Apenas Android.');
 if(!m||!isNewer(m.version,VERSION)||!/^https:\/\/(github\.com|objects\.githubusercontent\.com)\//.test(m.url||''))throw Error('Pacote OTA inválido.');
 let bundle;
 try {
  bundle=await CapacitorUpdater.download({url:m.url,version:m.version});
 } catch(e) {
  const detail=[e?.message,e?.code,e?.status,e?.statusCode].filter(v=>v!==undefined&&v!==null).join(' | ');
  console.error('[RJP OTA] native download failed', {version:m.version,url:m.url,error:e});
  throw Error('Falha na descarga nativa Capgo: '+(detail||String(e)));
 }
 if(!bundle?.id)throw Error('Capgo não devolveu um identificador de pacote.');
 try {
  await CapacitorUpdater.set({id:bundle.id});
 } catch(e) {
  console.error('[RJP OTA] bundle activation failed',e);
  throw Error('Descarga concluída mas ativação falhou: '+(e?.message||String(e)));
 }
}
