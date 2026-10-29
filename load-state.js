// Completeness concerns uploaded files, independently of metadata validation.
export function documentLoadState(document,related=[],pairs=[]){
 const files=(document.files||[]).filter(f=>f.state==='ready');
 if(document.type!=='PRO')return files.length?'loaded':'pending';
 const excel=files.filter(f=>/\.(xlsx?|xlsm)$/i.test(f.name)).at(-1);
 const finalPdf=excel&&(
  pairs.some(p=>p.source_id===excel.id&&p.version===excel.version&&p.storage_path===`${document.id}/${excel.id}/${excel.sha256}.pdf`)||
  files.some(f=>/\.pdf$/i.test(f.name)&&f.version===excel.version)
 );
 if(excel&&finalPdf&&related.every(d=>(d.files||[]).some(f=>f.state==='ready')))return 'loaded';
 return files.length||related.some(d=>(d.files||[]).some(f=>f.state==='ready'))?'partial':'pending';
}
