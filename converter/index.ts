import {createClient} from 'npm:@supabase/supabase-js@2.118.0';
import {SOURCE_LIMIT,PDF_LIMIT,sourcePath,extension,supported,isPdf,readBounded} from './pdf-core.mjs';
const TARGET='https://afal-convertidor-pdf.onrender.com';
const origins=new Set(['https://adriancarrillo1102-bot.github.io','https://supabase.com']);
const bucket='gd-vistas-pdf';
function json(body:unknown,status:number,headers:Record<string,string>){return new Response(JSON.stringify(body),{status,headers:{...headers,'Content-Type':'application/json','Cache-Control':'no-store'}})}
function secretKeys(){try{return Object.values(JSON.parse(Deno.env.get('SUPABASE_SECRET_KEYS')||'{}')) as string[]}catch{return []}}
export async function handler(req:Request){
 const origin=req.headers.get('Origin');const headers={'Access-Control-Allow-Origin':origin&&origins.has(origin)?origin:'https://adriancarrillo1102-bot.github.io','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS',Vary:'Origin'};
 if(origin&&!origins.has(origin))return json({error:'Origen no autorizado'},403,headers);
 if(req.method==='OPTIONS')return new Response('ok',{headers});
 if(req.method!=='POST')return json({error:'Método no permitido'},405,headers);
 try{
  const url=Deno.env.get('SUPABASE_URL')||'',keys=secretKeys(),serverKey=keys[0]||Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')||'';
  if(url!=='https://onaojhysbppyktczghbx.supabase.co'||!serverKey)return json({error:'Proyecto no configurado'},503,headers);
  const db=createClient(url,serverKey,{auth:{persistSession:false,autoRefreshToken:false}});
  const authorization=req.headers.get('Authorization')||'',token=authorization.replace(/^Bearer\s+/i,'');
  let actor:string|null=null;
   if(!authorization.startsWith('Bearer '))return json({error:'Inicia sesión'},401,headers);
   const {data,error}=await db.auth.getUser(token);if(error||!data.user)return json({error:'Sesión no válida'},401,headers);
   const member=await db.from('gd_members').select('email').eq('email',data.user.email?.toLowerCase()).eq('active',true).maybeSingle();
   if(member.error||!member.data)return json({error:'Acceso no habilitado'},403,headers);actor=data.user.id;
  const body=JSON.parse(new TextDecoder().decode(await readBounded(req.body,4096)));
  const configured=Deno.env.get('AFAL_CONVERTER_URL'),password=Deno.env.get('AFAL_CONVERTER_PASSWORD');
  if(configured!==TARGET||!password)return json({error:'Convertidor no configurado'},503,headers);
  const auth='Basic '+btoa('afal-converter:'+password);
  if(body.action==='health'){
   const denied=await fetch(TARGET+'/forms/libreoffice/convert',{method:'POST',body:new FormData(),redirect:'error',signal:AbortSignal.timeout(65000)});await denied.body?.cancel();
   const health=await fetch(TARGET+'/health',{headers:{Authorization:auth},redirect:'error',signal:AbortSignal.timeout(65000)});await health.body?.cancel();
   return json({state:health.ok&&denied.status===401?'ready':'failed',health_status:health.status,unauthorized_status:denied.status},health.ok&&denied.status===401?200:502,headers);
  }
  if(!/^[a-f0-9]{8}-[a-f0-9-]{27}$/i.test(body.file_id||''))return json({error:'Identificador de archivo inválido'},400,headers);
  const result=await db.from('gd_files').select('*').eq('id',body.file_id).eq('state','ready').maybeSingle();const file=result.data;
  if(result.error||!file)return json({error:'Archivo no disponible'},404,headers);
  const doc=await db.from('gd_documents').select('id').eq('id',file.document_id).is('deleted_at',null).maybeSingle();
  if(doc.error||!doc.data)return json({error:'Registro no disponible'},404,headers);
  if(!supported(file.name))return json({error:'Formato no compatible con conversión Office'},415,headers);
  const path=sourcePath(file);const response={state:'ready',bucket,path,source_file_id:file.id,source_sha256:file.sha256};
  const cached=await db.storage.from(bucket).download(path);
  if(cached.data){if(!isPdf(new Uint8Array(await cached.data.slice(0,8).arrayBuffer())))return json({error:'Vista previa inválida'},502,headers);return json({...response,cached:true},200,headers)}
  if(file.size>SOURCE_LIMIT)return json({error:'La prueba gratuita admite originales Office de hasta 10 MB. El original está conservado.',state:'size_limit'},413,headers);
  const original=await db.storage.from('gd-documentos').download(file.storage_path);
  if(original.error||!original.data)return json({error:'No se pudo leer el original'},502,headers);
  const bytes=new Uint8Array(await original.data.arrayBuffer());
  const hash=[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  if(bytes.length!==file.size||hash!==file.sha256)return json({error:'El original no coincide con su registro'},409,headers);
  const form=new FormData();form.append('files',new Blob([bytes],{type:file.mime}),'documento.'+extension(file.name));
  form.append('singlePageSheets','false');form.append('updateIndexes','false');
  const converted=await fetch(TARGET+'/forms/libreoffice/convert',{method:'POST',headers:{Authorization:auth,'Gotenberg-Output-Filename':file.id},body:form,redirect:'error',signal:AbortSignal.timeout(105000)});
  if(!converted.ok){await converted.body?.cancel();return json({state:'retry',error:converted.status===401?'Credencial del convertidor no válida':'El convertidor está iniciando, ocupado o no pudo procesar el archivo.',converter_status:converted.status},converted.status===401?502:503,headers)}
  const pdf=await readBounded(converted.body,PDF_LIMIT);if(!isPdf(pdf))return json({error:'El convertidor no devolvió un PDF'},502,headers);
  const active=await db.from('gd_documents').select('id').eq('id',file.document_id).is('deleted_at',null).maybeSingle();if(!active.data)return json({error:'Registro cancelado durante la conversión'},409,headers);
  const saved=await db.storage.from(bucket).upload(path,pdf,{contentType:'application/pdf',upsert:false});
  if(saved.error){const existing=await db.storage.from(bucket).download(path);if(!existing.data||!isPdf(new Uint8Array(await existing.data.slice(0,8).arrayBuffer())))return json({error:'No se pudo guardar el PDF'},502,headers)}
  if(!saved.error)await db.from('gd_audit').insert({document_id:file.document_id,action:'PDF de consulta generado',reason:file.id+' · SHA-256 original '+file.sha256,actor});
  return json({...response,cached:false,pdf_bytes:pdf.length},200,headers);
 }catch(error){const timed=error instanceof Error&&['TimeoutError','AbortError'].includes(error.name);return json({state:'retry',error:timed?'El convertidor está iniciando o agotó el tiempo. Puedes reintentar.':'No se pudo generar la vista PDF.'},timed?503:500,headers)}
}
Deno.serve(handler);
