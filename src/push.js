import {Capacitor} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
let api='',token='',registered=false,initialized=false,status='Push ainda não ativado',pending=null;
const key='rjp_push_device_v27';
function device(){let d;try{d=JSON.parse(localStorage.getItem(key)||'null')}catch{}if(!d?.id||!d?.secret){d={id:crypto.randomUUID(),secret:crypto.randomUUID()+crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(d))}return d}
async function call(path,body){const r=await fetch(`${api}/push/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...device(),...body})});if(!r.ok)throw Error(`${path}: ${r.status} ${await r.text()}`);return r.json()}
export function pushState(){return status}
export async function savePushRules(rules){if(!registered||!token)return {pending:true};return call('rules',{token,rules})}
export async function scheduleRemotePushTest(){if(!registered||!token)throw Error('Ativa primeiro o push Firebase.');return call('test',{token})}
export async function initPush(apiUrl,rules=[]){
 if(!Capacitor.isNativePlatform())throw Error('Push remoto requer a APK Android.');
 api=apiUrl.replace(/\/$/,'');
 const perm=await PushNotifications.requestPermissions();if(perm.receive!=='granted')throw Error('Permissão de notificações não concedida');
 if(registered&&token){await savePushRules(rules);return status}
 if(pending)return pending.promise;
 if(!initialized){
  await PushNotifications.addListener('registration',async t=>{
   try{token=t.value;status='Token Firebase recebido; a registar no servidor…';await call('register',{token});registered=true;
    await savePushRules(JSON.parse(localStorage.getItem('rjp_train_alerts_v26')||'[]'));
    status='Push ativo · dispositivo e regras sincronizados';pending?.resolve(status);
   }catch(e){status='Falha no registo push: '+e.message;pending?.reject(e)}
  });
  await PushNotifications.addListener('registrationError',e=>{status='Erro Firebase: '+(e.error||JSON.stringify(e));pending?.reject(new Error(status))});
  initialized=true;
 }
 await PushNotifications.createChannel({id:'rail_push',name:'Alertas ferroviários (push)',description:'Avisos ferroviários remotos',importance:4,visibility:1,vibration:true});
 let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});
 pending={resolve,reject,promise};status='A registar dispositivo no Firebase…';
 try{await PushNotifications.register();return await Promise.race([promise,new Promise((_,r)=>setTimeout(()=>r(new Error('Firebase sem resposta após 20 segundos. Verifica os serviços Google Play e a configuração Firebase.')),20000))])}
 catch(e){status='Erro: '+e.message;throw e}finally{pending=null}
}
