// Reconcile only facts already confirmed by Storage and the database.
export function consultationReady(document,pairs){
 return document.files.some(f=>f.state==='ready'&&(/\.pdf$/i.test(f.name)||pairs.some(p=>p.source_id===f.id&&p.version===f.version&&p.storage_path===`${document.id}/${f.id}/${f.sha256}.pdf`)));
}
export function mergeConfirmedUpload(documents,pairs,documentId,source,pair=null){
 const nextPairs=pair?[...pairs.filter(p=>p.source_id!==pair.source_id),pair]:pairs;
 const nextDocs=documents.map(d=>{
  if(d.id!==documentId)return d;
  const file={...source,document_id:documentId,state:'ready'},found=d.files.some(f=>f.id===file.id);
  const files=found?d.files.map(f=>f.id===file.id?{...f,...file}:f):[...d.files,file];
  const updated={...d,files};return {...updated,consultationReady:consultationReady(updated,nextPairs)};
 });
 return {documents:nextDocs,pairs:nextPairs};
}
export async function synchronizeConfirmedUpload({render,refresh}){
 let displayError=null,syncError=null;
 try{await render(true)}catch(error){displayError=error}
 try{await refresh()}catch(error){syncError=error}
 // Reapply the confirmed result even if a broad refresh returned stale data or failed.
 try{await render(false);displayError=null}catch(error){displayError=error}
 return {displayError,syncError};
}
