import {Capacitor} from '@capacitor/core';
import {CapacitorUpdater} from '@capgo/capacitor-updater';

// OTA é manual nesta fase piloto. Não altera o Worker, FCM nem regras de alertas.
const URL=(import.meta.env.VITE_OTA_MANIFEST_URL||'').trim();
const APP='pt.rjp.trainlive';
const VERSION='2.12.0';
export async function confirmOtaReady(){
 if(!Capacitor.isNativePlatform())return;
 // Confirma que o JavaScript iniciou; permite recuperação pelo atualizador.
 await CapacitorUpdater.notifyAppReady();
}
export async function checkOtaUpdate(){
 if(!Capacitor.isNativePlatform())throw Error('OTA apenas disponível na APK Android.');
 if(!URL)throw Error('Configura VITE_OTA_MANIFEST_URL no GitHub Actions.');
 const r=await fetch(URL,{cache:'no-store'});
 if(!r.ok)throw Error(`Manifesto HTTP ${r.status}`);
 const m=await r.json();
 if(m.appId!==APP||typeof m.version!=='string'||!/^https:\/\//.test(m.url||''))throw Error('Manifesto OTA inválido.');
 if(m.version===VERSION)return null;
 // O piloto exige autorização explícita do utilizador; nunca instala sozinho.
 return {version:m.version,url:m.url};
}
export async function installOtaUpdate(m){
 if(!Capacitor.isNativePlatform())throw Error('Apenas Android.');
 if(!m||!/^https:\/\//.test(m.url||''))throw Error('Pacote OTA inválido.');
 const bundle=await CapacitorUpdater.download({url:m.url,version:m.version});
 await CapacitorUpdater.set({id:bundle.id});
}
