const pending=new Map();
export const supportsPdf=name=>/\.(xlsx?|xlsm|docx?|pptx?|txt)$/i.test(name);
export async function getPdfPreview(db,fileId,onProgress=()=>{}){
 if(pending.has(fileId))return pending.get(fileId);
 const task=(async()=>{for(let attempt=0;attempt<3;attempt++){
  onProgress(attempt?'El convertidor está iniciando. Reintentando…':'Generando PDF de consulta…');
  const {data,error}=await db.functions.invoke('gd-pdf-preview',{body:{file_id:fileId}});
  if(!error&&data?.state==='ready')return data;
  let detail=data;try{if(error?.context)detail=await error.context.json()}catch{}
  if(detail?.state==='retry'&&attempt<2){await new Promise(resolve=>setTimeout(resolve,20000));continue}
  throw Error(detail?.error||error?.message||'No se pudo generar el PDF de consulta. El original sigue disponible.');
 }throw Error('No se pudo completar la conversión.')})();
 pending.set(fileId,task);try{return await task}finally{pending.delete(fileId)}
}
