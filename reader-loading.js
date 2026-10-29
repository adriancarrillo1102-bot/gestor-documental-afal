// Share only concurrent reads. Completed consultation requests always reauthorize.
export function createReadQueue(){
 const pending=new Map();
 return async function read(key,load){
  if(pending.has(key))return pending.get(key);
  const task=Promise.resolve().then(load);pending.set(key,task);
  try{return await task}finally{if(pending.get(key)===task)pending.delete(key)}
 };
}
export function isMissingObject(error){
 // Storage may return HTTP 400 with an embedded 404. Never convert on 401/403,
 // network failures or generic errors: the private Storage policy remains authoritative.
 if([401,403].includes(Number(error?.status))||[401,403].includes(Number(error?.statusCode)))return false;
 const status=Number(error?.statusCode??error?.status);
 return status===404||error?.code==='NoSuchKey'||error?.code==='not_found';
}
export async function existingPdfOrConvert(read,convert){
 try{return await read()}catch(error){if(!isMissingObject(error))throw error}
 return convert();
}
