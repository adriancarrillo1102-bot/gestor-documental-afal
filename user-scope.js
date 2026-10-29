export const normalizeUsername=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
export const validUsername=v=>typeof v==='string'&&v.trim().length>=3&&v.trim().length<=60&&/^[\p{L}\p{N} _.-]+$/u.test(v.trim());
export const normalizeOwner=v=>String(v??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
export const responsibleKey=p=>p.meta?.ownerId?'id:'+p.meta.ownerId:'text:'+normalizeOwner(p.meta?.owner);
export function sanitizeScope(value={}){
 if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Alcance no válido');
 const out={all:value.all===true,macros:[],responsibles:[],procedures:[]};
 for(const key of ['macros','responsibles','procedures']){
  const list=value[key]??[];if(!Array.isArray(list)||list.length>1000||list.some(x=>typeof x!=='string'||!x||x.length>500))throw Error('Selección de alcance no válida');
  out[key]=[...new Set(list)];
 }
 return out;
}
export function allowedProcedures(documents,scope){
 const s=sanitizeScope(scope);return documents.filter(p=>p.type==='PRO'&&!p.deleted_at&&(s.all||s.macros.includes(p.macro)||s.responsibles.includes(responsibleKey(p))||s.procedures.includes(p.id)));
}
export function scopedDocuments(documents,scope){
 const s=sanitizeScope(scope);if(s.all)return documents.filter(d=>!d.deleted_at);
 const ids=new Set(allowedProcedures(documents,s).map(p=>p.id));
 return documents.filter(d=>!d.deleted_at&&(d.type==='PRO'?ids.has(d.id):(d.meta?.procedureIds||[]).some(id=>ids.has(id))))
  .map(d=>({...d,meta:{...d.meta,procedureIds:(d.meta?.procedureIds||[]).filter(id=>ids.has(id))}}));
}
export function scopeSummary(scope){const s=sanitizeScope(scope);return s.all?'Todos los procedimientos':[['macroproceso',s.macros.length],['responsable',s.responsibles.length],['procedimiento',s.procedures.length]].filter(([,n])=>n).map(([name,n])=>n+' '+name+(n===1?'':'s')).join(' + ')||'Sin procedimientos autorizados'}
