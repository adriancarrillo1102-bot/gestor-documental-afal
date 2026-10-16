export function consultationPath(file){if(!/^[a-f0-9]{64}$/.test(file.sha256||''))throw Error('Huella del original no válida');return file.document_id+'/'+file.id+'/'+file.sha256+'.pdf'}
export function getManualPdf(file,links){return links.find(p=>p.source_id===file.id&&p.version===file.version&&p.storage_path===consultationPath(file))||null}
export function validatePairSelection({original,pdf,existing,version}){
 if(!version?.trim())throw Error('Indica la versión.');
 if(!original&&!existing&&!pdf)throw Error('Selecciona un archivo.');
 if(existing&&original)throw Error('Selecciona un original existente o uno nuevo.');
 if(existing&&existing.version!==version)throw Error('El PDF debe tener la misma versión que el original.');
 if(existing&&!pdf)throw Error('Selecciona el PDF final.');
 if(original&&pdf&&/\.pdf$/i.test(original.name))throw Error('El original ya es PDF; no necesita otro PDF de consulta.');
 if(pdf&&!/\.pdf$/i.test(pdf.name))throw Error('La vista de consulta debe ser PDF.');
 if(pdf&&pdf.size>30*1048576)throw Error('El PDF de consulta admite hasta 30 MB.');
 for(const f of [original,pdf].filter(Boolean))if(!f.size||f.size>50*1048576)throw Error('Cada archivo debe contener datos y pesar hasta 50 MB.');
}
