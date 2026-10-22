import {Capacitor} from '@capacitor/core';
import {PushNotifications} from '@capacitor/push-notifications';
let api='',token='',registered=false,initialized=false,status='Push ainda não ativado';
const key='rjp_push_device_v27';
function device(){let d;try{d=JSON.parse(localStorage.getItem(key)||'null')}catch{}if(!d?.id||!d?.secret){d={id:crypto.randomUUID(),secret:crypto.randomUUID()+crypto.randomUUID()};localStorage.setItem(key,JSON.stringify(d))}return d}
async function call(path,body){const r=await fetch(`${api}/push/${path}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...device(),...body})});if(!r.ok)throw Error(`${path}: ${r.status} ${await r.text()}`);return r.json()}
export function pushState(){return status}
export async function savePushRules(rules){if(!registered||!token)return;await call('rules',{token,rules})}
export async function initPush(apiUrl,rules=[]){
 if(!Capacitor.isNativePlatform())throw Error('Push Android requer a APK; a WebApp mantém alertas locais.');
 api=apiUrl.replace(/\/$/,'');
 const perm=await PushNotifications.requestPermissions();if(perm.receive!=='granted')throw Error('Permissão de notificações não concedida');
 if(!initialized){
  await PushNotifications.addListener('registration',async t=>{try{token=t.value;await call('register',{token});registered=true;status='Push ativo · notificações em segundo plano';await savePushRules(JSON.parse(localStorage.getItem('rjp_train_alerts_v26')||'[]'))}catch(e){status='Falha ao registar push: '+e.message;console.error(e)}});
  await PushNotifications.addListener('registrationError',e=>{status='Erro Firebase: '+(e.error||JSON.stringify(e));console.error(e)});
  initialized=true;
 }
 await PushNotifications.createChannel({id:'rail_push',name:'Alertas ferroviários (push)',description:'Chegadas e partidas previstas',importance:4,visibility:1,vibration:true});
 status='A registar dispositivo no Firebase…';await PushNotifications.register();return status;
}
