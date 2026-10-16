export const SOURCE_LIMIT=10*1024*1024,PDF_LIMIT=30*1024*1024;
export function sourcePath(file){if(!/^[a-f0-9]{64}$/.test(file.sha256))throw Error('Huella inválida');return `${file.document_id}/${file.id}/${file.sha256}.pdf`}
export function extension(name){return String(name).split('.').pop().toLowerCase()}
export function supported(name){return ['xlsx','xls','xlsm','docx','doc','pptx','ppt','txt'].includes(extension(name))}
export function isPdf(bytes){return bytes.length>5&&new TextDecoder().decode(bytes.subarray(0,5))==='%PDF-'}
export async function readBounded(stream,max){if(!stream)throw Error('Respuesta vacía');const reader=stream.getReader(),chunks=[];let size=0;try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>max){await reader.cancel();throw Error('La respuesta supera el tamaño permitido')}chunks.push(part.value)}}finally{reader.releaseLock()}const out=new Uint8Array(size);let offset=0;for(const c of chunks){out.set(c,offset);offset+=c.length}return out}
