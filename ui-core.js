(function(root){
const norm=v=>String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const words=v=>norm(v).split(' ').filter(w=>w&&!['de','del','la','el','los','las','para','y','en','un','una','al','por','con','a','manual','formato','documento'].includes(w)).map(w=>({hacer:'procesar',realizar:'procesar',gestionar:'procesar',solicitudes:'solicitud',compras:'compra'}[w]||w));
const score=(a,b)=>{if(norm(a)===norm(b))return 1;const aa=new Set(words(a)),bb=new Set(words(b));return aa.size+bb.size?2*[...aa].filter(w=>bb.has(w)).length/(aa.size+bb.size):0};
const ready=d=>d.files.some(f=>f.state==='ready');
const related=(d,docs)=>d.type==='PRO'?docs.filter(x=>(x.meta.procedureIds||[]).includes(d.id)):docs.filter(x=>(d.meta.procedureIds||[]).includes(x.id));
const missing=d=>{const m=d.meta;return [...(!m.wave?['Ola']:[]),...(!m.date?['Fecha']:[]),...(!m.owner?['Responsable']:[]),...(m.recordKnown!==true?['Control de registro']:[]),...(!m.version||m.version==='Sin identificar'?['Versi�n']:[]),...(d.type!=='PRO'&&!(m.procedureIds||[]).length?['Procedimiento']:[]),...(m.record&&(!m.period||!m.retention||!m.custody)?['Datos del registro']:[])]};
const review=d=>(d.meta.validationReview?.reasons||[]).length>0;
const validation=d=>review(d)?'review':!ready(d)?'pending':missing(d).length?'metadata':'validated';
function filter(docs,f){return docs.filter(d=>{const text=norm([d.code,d.name,d.meta.owner,d.meta.notes].join(' '));return (!f.search||norm(f.search).split(' ').every(w=>text.includes(w)))&&(!f.macro||d.macro===f.macro)&&(!f.type||d.type===f.type)&&(!f.wave||(f.wave==='unknown'?!d.meta.wave:String(d.meta.wave)===f.wave))&&(!f.procedure||d.id===f.procedure||(d.meta.procedureIds||[]).includes(f.procedure))&&(!f.status||(f.status==='ready'?ready(d):validation(d)===f.status))})}
const nextNumber=(macro,type,free,high)=>{const k=macro+'|'+type;return free[k]?.length?Math.min(...free[k]):(high[k]||0)+1};
const stats=docs=>({total:docs.length,ready:docs.filter(ready).length,pending:docs.filter(d=>!ready(d)).length,procedures:docs.filter(d=>d.type==='PRO').length,links:docs.reduce((n,d)=>n+(d.meta.procedureIds||[]).length,0)});
function waveCounts(docs,types){return ['Piloto','1','2','3','4','5','unknown'].map(w=>{const ds=docs.filter(d=>w==='unknown'?!['Piloto','1','2','3','4','5'].includes(String(d.meta.wave)):String(d.meta.wave)===w);return {wave:w,label:w==='unknown'?'Sin registrar':w==='Piloto'?'Piloto':'Ola '+w,total:ds.length,counts:types.map(t=>({type:t.id,count:ds.filter(d=>d.type===t.id).length}))}})}
const api={norm,words,score,ready,related,missing,filter,nextNumber,stats,waveCounts,review,validation};if(typeof module!=='undefined')module.exports=api;else root.PreviewCore=api;
})(typeof window!=='undefined'?window:this);
