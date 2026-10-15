import {config} from './config.js?v=20261015-olas-relaciones-1';
const db=window.supabase.createClient(config.url,config.publishableKey,{auth:{persistSession:true,autoRefreshToken:true}}),$=id=>document.getElementById(id);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let plan=null,inputs=[],allowed=false,running=false,paused=false,results=[],catalog=[];
const sha=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
async function rpc(name,args){const {data,error}=await db.rpc(name,args);if(error)throw error;return data}
async function rows(table){let all=[];for(let n=0;;n+=1000){const {data,error}=await db.from(table).select('*').range(n,n+999);if(error)throw error;all.push(...data);if(data.length<1000)return all}}
function render(){const done=results.filter(r=>['verified','already_verified','error'].includes(r.state)).length,verified=results.filter(r=>['verified','already_verified'].includes(r.state)).length,errors=results.filter(r=>r.state==='error').length;const bytes=results.filter(r=>['verified','already_verified'].includes(r.state)).reduce((n,r)=>n+r.size,0);$('loadSummary').textContent=`${done} de ${results.length||plan?.records?.length||0} procesados · ${verified} archivos cargados y verificados · ${errors} errores · ${(bytes/1048576).toFixed(2)} MiB verificados${paused?' · Pausa solicitada':''}`;$('loadProgress').max=results.length||1;$('loadProgress').value=done;$('loadRows').innerHTML=results.map(r=>`<tr><td class="code">${esc(r.code)}</td><td>${esc(r.name)}</td><td>${esc(r.message)}</td></tr>`).join('');$('downloadLoadReport').disabled=!results.length;$('startLoad').disabled=!allowed||!plan||!inputs.length||running}
function chooseFile(record){const exact=inputs.find(f=>f.webkitRelativePath.split('/').slice(1).join('/')===record.relativePath);if(exact)return [exact];return inputs.filter(f=>f.name===record.filename)}
async function processRecord(record,index){const result=results[index];let reservation;
 try{
  const doc=catalog.find(d=>d.code===record.code&&!d.deleted_at);if(!doc)throw Error('El registro no está activo en el catálogo');
  if(doc.name!==record.expectedName)throw Error('El nombre del registro cambió desde la revisión. No se adjuntó el archivo.');
  result.message='Leyendo y verificando el archivo original…';render();
  let file=null;for(const candidate of chooseFile(record)){if(candidate.size===record.size&&candidate.size<=config.maxFileSize&&await sha(await candidate.arrayBuffer())===record.sha256){file=candidate;break}}
  if(!file)throw Error('No se encontró en la carpeta un archivo con el tamaño y SHA-256 revisados');
  const {data:matches,error:lookupError}=await db.from('gd_files').select('*').eq('sha256',record.sha256).in('state',['ready','pending']);if(lookupError)throw lookupError;
  if(matches.some(f=>f.document_id!==doc.id))throw Error('El mismo archivo pertenece a otro registro. Revisión de identidad pendiente.');
  let saved=matches.find(f=>f.state==='ready');
  if(!saved){
   reservation=matches.find(f=>f.state==='pending');
   if(reservation){try{await rpc('gd_finish_upload',{p_file:reservation.id});saved=reservation}catch{/* La carga anterior puede no haber enviado el objeto. */}}
   if(!saved){
    if(!reservation){const response=await rpc('gd_begin_upload',{p_id:doc.id,p_name:file.name,p_hash:record.sha256,p_size:file.size,p_mime:file.type||'application/octet-stream',p_version:record.version||doc.meta.version||'Sin identificar'});reservation=Array.isArray(response)?response[0]:response}
    result.message='Cargando original en almacenamiento privado…';render();
    const {error}=await db.storage.from(config.bucket).upload(reservation.storage_path,file,{contentType:file.type||'application/octet-stream',upsert:false});
    if(error){try{await rpc('gd_finish_upload',{p_file:reservation.id});saved=reservation}catch{throw error}}
    if(!saved){await rpc('gd_finish_upload',{p_file:reservation.id});saved=reservation}
   }
  }
  result.message='Descargando para comprobar integridad…';render();
  const {data:download,error:downloadError}=await db.storage.from(config.bucket).download(saved.storage_path);if(downloadError)throw downloadError;
  if(download.size!==record.size||await sha(await download.arrayBuffer())!==record.sha256)throw Error('La descarga no coincide con el archivo original');
  result.state=matches.some(f=>f.state==='ready')?'already_verified':'verified';result.fileId=saved.id;result.documentId=doc.id;result.message='✓ Cargado, vinculado y descarga SHA-256 verificada';
 }catch(error){result.state='error';result.message=error.message;result.fileId=reservation?.id||null}
 render();
}
async function phase(indexes){let next=0;async function worker(){while(!paused&&next<indexes.length){const i=indexes[next++];await processRecord(plan.records[i],i)}}await Promise.all([worker(),worker(),worker()])}
$('loadPlan').onchange=async()=>{if(running)return;try{const file=$('loadPlan').files[0];if(!file)return;const data=JSON.parse(await file.text());if(data.schema!==1||data.project!=='onaojhysbppyktczghbx'||!Array.isArray(data.records)||data.records.length>2000)throw Error('Plan no compatible con este proyecto');const codes=new Set(),hashes=new Set();for(const r of data.records){if(!/^GA-[A-Z0-9]+-[A-Z]+-\d+$/.test(r.code)||!r.expectedName||!r.filename||!/^[a-f0-9]{64}$/.test(r.sha256)||!Number.isInteger(r.size)||r.size<=0||r.size>config.maxFileSize||codes.has(r.code)||hashes.has(r.sha256))throw Error('El plan contiene una identidad, tamaño o duplicidad sin resolver');codes.add(r.code);hashes.add(r.sha256)}plan=data;results=[];render()}catch(error){plan=null;$('loadSummary').textContent=error.message}};
$('loadFolder').onchange=()=>{if(!running){inputs=[...$('loadFolder').files];render()}};
$('startLoad').onclick=async()=>{if(running||!allowed||!plan||!inputs.length)return;running=true;paused=false;$('loadPlan').disabled=$('loadFolder').disabled=true;$('pauseLoad').disabled=false;try{catalog=await rows('gd_documents');results=plan.records.map(r=>({code:r.code,name:r.filename,size:r.size,sha256:r.sha256,state:'waiting',message:'En espera'}));render();await phase(plan.records.map((r,i)=>r.code.includes('-PRO-')?i:-1).filter(i=>i>=0));if(!paused)await phase(plan.records.map((r,i)=>!r.code.includes('-PRO-')?i:-1).filter(i=>i>=0))}catch(error){$('loadAccess').textContent=error.message}finally{running=false;$('loadPlan').disabled=$('loadFolder').disabled=false;$('pauseLoad').disabled=true;render()}};
$('pauseLoad').onclick=()=>{paused=true;render()};
$('downloadLoadReport').onclick=()=>{const report={project:plan?.project,at:new Date().toISOString(),results};const url=URL.createObjectURL(new Blob([JSON.stringify(report,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='Resultado_carga_documental.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),10000)};
async function init(){try{const {data,error}=await db.auth.getSession();if(error)throw error;if(!data.session)throw Error('Entra primero al catálogo con el acceso compartido del equipo y vuelve a esta página.');allowed=await rpc('gd_is_member',{});if(!allowed)throw Error('La cuenta no está habilitada para el gestor');$('loadAccess').textContent='Sesión autorizada. Los archivos se cargarán en el proyecto documental privado.';render()}catch(error){$('loadAccess').textContent=error.message}}
init();
