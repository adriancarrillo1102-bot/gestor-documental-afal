export const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function tokens(value){const stop=new Set(['de','del','la','el','los','las','para','y','en','un','una','al','por','con','a','manual','formato','documento','procedimiento']);const aliases={procesar:'tramitar',procesamiento:'tramitar',hacer:'tramitar',realizar:'tramitar',gestionar:'tramitar',gestion:'tramitar',solicitudes:'solicitud',compras:'compra',adquisicion:'compra',adquisiciones:'compra',pagos:'pago',proveedores:'proveedor',empleados:'empleado',registros:'registro',inventarios:'inventario',reportes:'reporte'};return [...new Set(norm(value).split(' ').filter(w=>w&&!stop.has(w)).map(w=>aliases[w]||w))]}
export function score(a,b){if(!norm(a)||!norm(b))return 0;if(norm(a)===norm(b))return 1;const aa=tokens(a),bb=new Set(tokens(b));return aa.length&&bb.size?2*aa.filter(w=>bb.has(w)).length/(aa.length+bb.size):0}
export const isComplete=d=>(d.files||[]).some(f=>f.state==='ready');
export const status=d=>isComplete(d)?'Registro completo':'Carga de documento pendiente';
export function matchesSearch(d,q){if(!norm(q))return true;const text=[d.name,d.code,d.meta?.owner,d.meta?.notes].join(' '),words=tokens(q),indexed=tokens(text);return norm(text).includes(norm(q))||(words.length>0&&words.every(w=>indexed.includes(w)))||score(q,d.name)>=.6}
export const localDate=()=>{const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`};
export const csvCell=v=>'"'+String(v??'').replace(/^[=+@-]/,"'$&").replace(/"/g,'""')+'"';
export const procedureIds=d=>Array.isArray(d.meta?.procedureIds)?d.meta.procedureIds:(d.procedure_ids||[]);
export function relatedRecords(d,catalog){return d.type==='PRO'?catalog.filter(x=>!x.deleted_at&&procedureIds(x).includes(d.id)):catalog.filter(p=>!p.deleted_at&&p.type==='PRO'&&procedureIds(d).includes(p.id))}
export const waveMatches=(d,w)=>!w||(w==='unassigned'?!d.meta?.wave:String(d.meta?.wave)===String(w));
export const procedureSelectionValid=(ids,catalog,selfId)=>ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>id!==selfId&&catalog.some(p=>p.id===id&&p.type==='PRO'&&!p.deleted_at));
