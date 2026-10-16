export function chooseConsultation(document,file,links){
 const files=document.files.filter(f=>f.state==='ready');
 const link=links.find(p=>p.source_id===file.id),pdf=link&&files.find(f=>f.id===link.pdf_id&&f.version===file.version&&/\.pdf$/i.test(f.name));
 return pdf||file;
}
export function validatePairSelection({original,pdf,existing,version}){
 if(!version?.trim())throw Error('Indica la versión.');
 if(!original&&!existing&&!pdf)throw Error('Selecciona un archivo.');
 if(existing&&original)throw Error('Selecciona un original existente o uno nuevo.');
 if(existing&&existing.version!==version)throw Error('El PDF debe tener la misma versión que el original.');
 if(existing&&!pdf)throw Error('Selecciona el PDF final.');
 if(original&&pdf&&/\.pdf$/i.test(original.name))throw Error('El original ya es PDF; no necesita otro PDF de consulta.');
 if(pdf&&!/\.pdf$/i.test(pdf.name))throw Error('La vista de consulta debe ser PDF.');
 for(const f of [original,pdf].filter(Boolean))if(!f.size||f.size>50*1048576)throw Error('Cada archivo debe contener datos y pesar hasta 50 MB.');
}
