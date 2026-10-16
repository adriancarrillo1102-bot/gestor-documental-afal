export const pdfHash=async bytes=>[...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(x=>x.toString(16).padStart(2,'0')).join('');
export async function importConsultationPdf(db,source,file,confirmReplace=()=>false){
 if(!source?.id||!/^[a-f0-9]{64}$/.test(source.sha256||''))throw Error('Original no válido.');
 if(!file?.size||file.size>30*1048576)throw Error('El PDF de consulta admite hasta 30 MB.');
 const bytes=await file.arrayBuffer();if(new TextDecoder().decode(bytes.slice(0,5))!=='%PDF-')throw Error('Selecciona un PDF válido.');
 const hash=await pdfHash(bytes),path=`${source.document_id}/${source.id}/${source.sha256}.pdf`,form=new FormData();
 form.append('file_id',source.id);form.append('source_sha256',source.sha256);form.append('pdf_sha256',hash);form.append('pdf',file);
 const previous=await db.storage.from('gd-vistas-pdf').download(path);
 if(previous.data){const oldHash=await pdfHash(await previous.data.arrayBuffer());if(oldHash!==hash){if(!await confirmReplace())throw Error('Carga de PDF cancelada.');form.append('replace','true');form.append('expected_existing_sha256',oldHash)}}
 const response=await db.functions.invoke('gd-import-pdf',{body:form});let data=response.data;
 if(response.error?.context){try{data=await response.error.context.json()}catch{}}
 if(response.error||data?.state!=='ready')throw Error(data?.error||response.error?.message||'No se pudo guardar el PDF de consulta.');
 if(data.bucket!=='gd-vistas-pdf'||data.path!==path||data.pdf_sha256!==hash)throw Error('La respuesta no coincide con el original seleccionado.');
 const saved=await db.storage.from(data.bucket).download(data.path);if(saved.error||!saved.data||await pdfHash(await saved.data.arrayBuffer())!==hash)throw Error('El PDF guardado no pasó la verificación.');
 return data;
}
