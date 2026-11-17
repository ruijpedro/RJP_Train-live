// In the Android APK use the Capacitor native HTTP bridge rather than
// browser fetch, which can be restricted by cross-origin policy.
// This module does not patch fetch used by Leaflet or bundled assets.
import {Capacitor,CapacitorHttp} from "@capacitor/core";

export const transportLabel=()=>Capacitor.isNativePlatform()?"Android nativo":"Web";
export async function fetchRemoteJson(url,{timeoutMs=15000,headers={}}={}){
 const outgoing={Accept:"application/json",...headers};
 if(Capacitor.isNativePlatform()){
  let result;
  try{
   result=await CapacitorHttp.get({
    url,headers:outgoing,
    connectTimeout:timeoutMs,readTimeout:timeoutMs,
   });
  }catch(e){throw Error("Android HTTP: "+String(e?.message||e))}
  if(result.status<200||result.status>=300)throw Error("Android HTTP "+result.status);
  if(typeof result.data==="string"){
   try{return JSON.parse(result.data)}
   catch{throw Error("Android: resposta não é JSON")}
  }
  if(!result.data||typeof result.data!=="object")throw Error("Android: resposta JSON inválida");
  return result.data;
 }
 const controller=new AbortController(),t=setTimeout(()=>controller.abort(),timeoutMs);
 try{
  const r=await fetch(url,{headers:outgoing,cache:"no-store",signal:controller.signal});
  if(!r.ok)throw Error("Web HTTP "+r.status);
  return await r.json();
 }catch(e){throw Error("Web: "+String(e?.message||e))}
 finally{clearTimeout(t)}
}

// Backward-compatible TML transport for existing GPS refresh.
export const fetchTmlJson=(url,timeoutMs=15000)=>fetchRemoteJson(url,{timeoutMs});
