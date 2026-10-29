import {config} from './config.js';
export async function consultationRequest(action,body={},sessionToken=''){
 const headers={'Content-Type':'application/json','apikey':config.publishableKey};if(sessionToken)headers.Authorization='Bearer '+sessionToken;
 const r=await fetch(config.url+'/functions/v1/gd-users',{method:'POST',headers,body:JSON.stringify({action,...body}),cache:'no-store',referrerPolicy:'no-referrer'});
 if(!r.ok){let message='No se pudo completar la consulta.';try{message=(await r.json()).error||message}catch{}const error=new Error(message);error.status=r.status;throw error}
 return action==='file'?r.blob():r.json();
}
