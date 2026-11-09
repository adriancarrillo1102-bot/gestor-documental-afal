import {config} from '../config.js';

const afalClient=window.supabase.createClient(config.url,config.publishableKey,{auth:{storageKey:"afal-module-session"}});
const gestorClient=window.supabase.createClient(config.url,config.publishableKey);
let client=afalClient;
const login=document.getElementById('login');
const status=document.getElementById('status');
const frame=document.getElementById('module');
const exit=document.getElementById('exit');
const expectedHash='3b724e4e51789deefb7f301f7a514f5b04c1feb69c3c152f154a2226296fd1f0';

async function openTrial(){
 const [{data:role,error:roleError},{data:auth,error:authError}]=await Promise.all([client.rpc('afal_trial_access_role'),client.auth.getUser()]);
 if(roleError||authError||!role)throw Error('La cuenta no tiene acceso a AFAL.');
 const labels={manager:'Administrador general',admin:'Administrador',viewer:'Consultante'};
 document.getElementById('identity').textContent=auth.user.email.replace(/@afal-users\.invalid$/i,'')+' · '+labels[role];
 status.textContent='Leyendo la copia privada de Supabase…';
 const chunks=[];
 for(let i=0;i<13;i++){
  const {data,error}=await client.rpc('afal_trial_snapshot',{p_part:i});
  if(error||typeof data!=='string')throw Error(error?.message||'Falta un bloque de la copia.');
  chunks.push(Uint8Array.from(atob(data),c=>c.charCodeAt(0)));
 }
 const packed=new Blob(chunks);
 const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',await packed.arrayBuffer())),b=>b.toString(16).padStart(2,'0')).join('');
 if(hash!==expectedHash)throw Error('La huella de la copia de prueba no coincide.');
 const snapshot=JSON.parse(await new Response(packed.stream().pipeThrough(new DecompressionStream('gzip'))).text());
 if(snapshot.docs?.length!==2004)throw Error('El número de registros no coincide.');
 const edits=await client.rpc('afal_trial_read_edits');
 if(edits.error)throw Error(edits.error.message);
 const firstOrganization=await client.rpc('afal_organization_read',{p_offset:0,p_limit:500});
 if(firstOrganization.error)throw Error('No se pudo cargar el catálogo de dependencias. '+firstOrganization.error.message);
 const total=firstOrganization.data.total;
 const pages=await Promise.all(Array.from({length:Math.max(0,Math.ceil(total/500)-1)},(_,i)=>client.rpc('afal_organization_read',{p_offset:(i+1)*500,p_limit:500})));
 if(pages.some(page=>page.error))throw Error('No se pudo completar el catálogo de dependencias. Recarga AFAL.');
 const organization=[...firstOrganization.data.rows,...pages.flatMap(page=>page.data.rows)];
 if(organization.length!==total||new Set(organization.map(r=>r.id)).size!==total)throw Error('El catálogo de dependencias está incompleto. Recarga AFAL.');
 window.afalOrganization=organization;
 const versions=new Map(edits.data.map(x=>[x.key,x.version]));
 window.afalTrialEdits=edits.data;
 window.afalTrialCommit=async changes=>{
  if(role==='viewer')throw Error('Tu cuenta tiene acceso de sólo lectura.');
  const batch=changes.map(c=>({...c,version:versions.get(c.key)||0}));
  const saved=await client.rpc('afal_trial_write_edits',{p_changes:batch}).abortSignal(AbortSignal.timeout(15000));
  if(saved.error){
   const error=saved.error;
   if(error.code==='40001'||error.code==='PT409')throw Error('Otro guardado cambió este registro. Recarga AFAL antes de reintentar.');
   if(/abort|timeout/i.test(error.message||''))throw Error('No se pudo confirmar el guardado a tiempo. Recarga AFAL para comprobar si se aplicó antes de reintentar.');
   throw Error(error.message);
  }
  for(const [key,version] of Object.entries(saved.data))versions.set(key,version);
 };
 window.afalTrialSnapshot=snapshot;
 login.hidden=true;
 exit.hidden=false;
 frame.src='workspace.html?v=20261109-stakeholders-1';
 frame.hidden=false;
 document.getElementById('account').hidden=false;
 document.getElementById('accounts').hidden=role!=='manager';
 status.textContent='Copia verificada · '+labels[role];
}

function loginAddress(value){
 const name=value.trim().toLowerCase();
 if(name.includes('@'))return name;
 if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(name))throw Error('Ingresa un nombre de usuario válido.');
 return name+'@afal-users.invalid';
}
login.onsubmit=async event=>{
 event.preventDefault();
 const button=login.querySelector('button');button.disabled=true;
 try{
  const identifier=login.elements.identifier.value.trim();
  client=identifier.includes('@')?gestorClient:afalClient;
  const {error}=await client.auth.signInWithPassword({email:loginAddress(identifier),password:login.elements.password.value});
  login.elements.password.value='';
  if(error)throw error;
  await openTrial();
 }catch(e){status.textContent=e.message}finally{button.disabled=false}
};
exit.onclick=async()=>{await client.auth.signOut({scope:'local'});location.reload()};
const {data:gestor}=await gestorClient.auth.getSession();
if(gestor.session){
 const {data:role}=await gestorClient.rpc('afal_trial_access_role');
 if(role==='manager')client=gestorClient;
}
const {data}=await client.auth.getSession();
if(data.session)try{await openTrial()}catch(e){status.textContent=e.message}

const createForm=document.getElementById('createAccount');
const reveal=document.getElementById('showInitial');
reveal.onchange=()=>{createForm.elements.password.type=reveal.checked?'text':'password'};
function bindAccountForm(id,submit){
 const form=document.getElementById(id);
 form.onsubmit=async event=>{
  event.preventDefault();
  const button=form.querySelector('button'),message=form.parentElement.querySelector('[role=status]');
  button.disabled=true;
  message.textContent='Procesando…';
  try{
   message.textContent=await submit(form.elements);
   form.reset();
   form.elements.password.type='password';
  }catch(e){message.textContent=e.message;}finally{button.disabled=false;}
 };
}
bindAccountForm('createAccount',async fields=>{
 const {data,error}=await client.functions.invoke('afal-trial-create-account',{body:{username:fields.username.value.trim(),role:fields.role.value,password:fields.password.value}});
 if(error){let detail;try{detail=await error.context?.json()}catch{}throw Error(detail?.error||error.message);}
 return 'Cuenta creada: '+data.username;
});
bindAccountForm('changePassword',async fields=>{
 const {error}=await client.auth.updateUser({password:fields.password.value});
 if(error)throw Error(error.message);
 return 'Contraseña actualizada.';
});
