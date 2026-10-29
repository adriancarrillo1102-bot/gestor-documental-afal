// Completeness concerns uploaded files, independently of metadata validation.
export function procedureLoadDetails(document,related=[],pairs=[]){
 const files=(document.files||[]).filter(f=>f.state==='ready'),excel=files.filter(f=>/\.(xlsx?|xlsm)$/i.test(f.name)).at(-1);
 const finalPdf=excel?pairs.some(p=>p.source_id===excel.id&&p.version===excel.version&&p.storage_path===`${document.id}/${excel.id}/${excel.sha256}.pdf`)||files.some(f=>/\.pdf$/i.test(f.name)&&f.version===excel.version):files.some(f=>/\.pdf$/i.test(f.name));
 const missing=[];
 if(!excel)missing.push({documentId:document.id,code:document.code,name:document.name,kind:'excel',description:'Excel original del procedimiento'});
 if(!finalPdf)missing.push({documentId:document.id,code:document.code,name:document.name,kind:'pdf',description:'PDF final del procedimiento'+(excel?.version?' · versión '+excel.version:'')});
 for(const d of related)if(!(d.files||[]).some(f=>f.state==='ready'))missing.push({documentId:d.id,code:d.code,name:d.name,kind:'related',description:'Archivo del documento relacionado'});
 const any=files.length||related.some(d=>(d.files||[]).some(f=>f.state==='ready'));
 return {state:!missing.length?'loaded':any?'partial':'pending',missing};
}
export function documentLoadState(document,related=[],pairs=[]){
 if(document.type==='PRO')return procedureLoadDetails(document,related,pairs).state;
 return (document.files||[]).some(f=>f.state==='ready')?'loaded':'pending';
}
