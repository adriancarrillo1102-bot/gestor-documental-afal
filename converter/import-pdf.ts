import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {PDF_LIMIT,isPdf,sourcePath,readBounded} from './pdf-core.mjs';
const origin='https://adriancarrillo1102-bot.github.io';
const sha=async(b:Uint8Array)=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',b))].map(x=>x.toString(16).padStart(2,'0')).join('');
const headers={'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const reply=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json'}});
export async function handler(req:Request){
 if(req.headers.get('Origin')!==origin)return reply({error:'Origen no autorizado'},403);
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return reply({error:'Método no permitido'},405);
 try{
  const url=Deno.env.get('SUPABASE_URL')||'';let key='';try{key=Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}'))[0] as string||''}catch{}key=key||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(url!=='https://onaojhysbppyktczghbx.supabase.co'||!key)return reply({error:'Proyecto no configurado'},503);
  const db=createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false}}),authorization=req.headers.get('Authorization')||'';
  if(!authorization.startsWith('Bearer '))return reply({error:'Inicia sesión'},401);
  const user=await db.auth.getUser(authorization.slice(7));if(user.error||!user.data.user)return reply({error:'Sesión no válida'},401);
  const member=await db.from('gd_members').select('role').eq('email',user.data.user.email?.toLowerCase()).eq('active',true).maybeSingle();
  if(member.error||member.data?.role!=='admin')return reply({error:'Se requiere una sesión de administrador'},403);
  const raw=await readBounded(req.body,PDF_LIMIT+65536),form=await new Response(raw,{headers:{'Content-Type':req.headers.get('Content-Type')||''}}).formData();
  const id=String(form.get('file_id')||''),sourceHash=String(form.get('source_sha256')||''),pdfHash=String(form.get('pdf_sha256')||''),pdf=form.get('pdf');
  if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(id)||!([sourceHash,pdfHash].every(x=>/^[a-f0-9]{64}$/.test(x)))||!(pdf instanceof File)||pdf.size<5||pdf.size>PDF_LIMIT)return reply({error:'Datos de PDF inválidos'},400);
  const f=await db.from('gd_files').select('*').eq('id',id).eq('state','ready').maybeSingle();if(f.error||!f.data||f.data.sha256!==sourceHash)return reply({error:'El original no coincide con el registro'},409);
  const d=await db.from('gd_documents').select('id,type,code').eq('id',f.data.document_id).is('deleted_at',null).maybeSingle();
  if(d.error||!d.data||!['FOR','DDS','MAN'].includes(d.data.type))return reply({error:'Documento no disponible para esta carga'},409);
  const bytes=new Uint8Array(await pdf.arrayBuffer());if(!isPdf(bytes)||await sha(bytes)!==pdfHash)return reply({error:'El PDF no coincide con su huella de verificación'},409);
  const bucket='gd-vistas-pdf',path=sourcePath(f.data),old=await db.storage.from(bucket).download(path);let previousHash=null,backupPath=null;
  if(old.data){
   const previous=new Uint8Array(await old.data.arrayBuffer());previousHash=await sha(previous);
   if(previousHash===pdfHash)return reply({state:'ready',code:d.data.code,bucket,path,pdf_sha256:pdfHash,pdf_bytes:bytes.length,already_saved:true});
   if(form.get('replace')!=='true'||form.get('expected_existing_sha256')!==previousHash)return reply({error:'El PDF existente cambió; se requiere revisión antes de reemplazarlo'},409);
   backupPath=path+'.backup.'+previousHash+'.pdf';const saved=await db.storage.from(bucket).upload(backupPath,previous,{contentType:'application/pdf',upsert:false});
   if(saved.error){const check=await db.storage.from(bucket).download(backupPath);if(!check.data||await sha(new Uint8Array(await check.data.arrayBuffer()))!==previousHash)return reply({error:'No se pudo respaldar la vista anterior'},502)}
  }
  const active=await db.from('gd_documents').select('id').eq('id',f.data.document_id).is('deleted_at',null).maybeSingle();if(!active.data)return reply({error:'Registro cancelado durante la carga'},409);
  const saved=await db.storage.from(bucket).upload(path,bytes,{contentType:'application/pdf',upsert:!!old.data,cacheControl:'0'});if(saved.error)return reply({error:'No se pudo guardar el PDF'},502);
  const verified=await db.storage.from(bucket).download(path);if(!verified.data||await sha(new Uint8Array(await verified.data.arrayBuffer()))!==pdfHash)return reply({error:'La verificación del PDF guardado falló'},502);
  const audit=await db.from('gd_audit').insert({document_id:f.data.document_id,action:old.data?'PDF de consulta corregido':'PDF de consulta importado',actor:user.data.user.id,reason:JSON.stringify({file_id:id,source_sha256:sourceHash,pdf_sha256:pdfHash,pdf_bytes:bytes.length,previous_sha256:previousHash,backup_path:backupPath,original_unchanged:true})});
  if(audit.error)return reply({error:'PDF guardado y verificado; no se pudo completar la bitácora'},502);
  return reply({state:'ready',code:d.data.code,bucket,path,pdf_sha256:pdfHash,pdf_bytes:bytes.length,backup_created:!!backupPath,verified:true});
 }catch(e){return reply({error:e instanceof Error?e.message:'No se pudo cargar el PDF'},500)}
}
Deno.serve(handler);
