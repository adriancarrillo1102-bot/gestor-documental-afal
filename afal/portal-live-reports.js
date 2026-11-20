// The reporting catalog is read-only and separate from imported files and historical cuts.
const portalLive = {raw:null,catalog:null,signature:'',busy:null,error:'',attempted:false,source:'live',lastFetched:0};
const importedPortalCatalog = portalCatalog;
function portalRowMatchesWave(row,wave) {
 return wave==='all'||(row.waves||[row.wave]).some(w=>projectWaveKey(w)===projectWaveKey(wave));
}
function portalLiveCatalog() {
 if(!portalLive.raw)return null;
 const flows=architectureRows().map(f=>({id:f.id,meta:ensureFlowMatrixMeta(f)}));
 const signature=JSON.stringify(flows.map(f=>[f.id,f.meta.procedureNumber,f.meta.implementationWave]));
 if(portalLive.catalog&&signature===portalLive.signature)return portalLive.catalog;
 const byFlow=new Map(flows.map(f=>[f.id,f])),byCode=new Map(),linked=new Map();
 for(const f of flows){const code=String(f.meta.procedureNumber||'').trim().toUpperCase();if(code){if(!byCode.has(code))byCode.set(code,[]);byCode.get(code).push(f);}}
 for(const link of portalLive.raw.links){if(!linked.has(link.documentId))linked.set(link.documentId,[]);if(byFlow.has(link.flowId))linked.get(link.documentId).push(byFlow.get(link.flowId));}
 const documents=new Map(portalLive.raw.documents.map(d=>[d.id,d]));
 const procedureWaves=new Map();
 for(const d of documents.values())if(d.type==='PRO'){
  const matches=linked.get(d.id)?.length?linked.get(d.id):byCode.get(String(d.code).trim().toUpperCase())||[];
  procedureWaves.set(d.id,[...new Set(matches.map(f=>normalizeWaveDisplay(f.meta.implementationWave)).filter(Boolean))]);
 }
 const rows=[...documents.values()].map(d=>{
  const refs=d.type==='PRO'?[d.id]:(Array.isArray(d.meta?.procedureIds)?d.meta.procedureIds:[]);
  let waves=[...new Set(refs.flatMap(id=>procedureWaves.get(id)||[]))];
  const linkedToAfal=waves.length>0;
  if(!waves.length&&d.meta?.wave!==null&&d.meta?.wave!==undefined&&String(d.meta.wave).trim())waves=[portalNormalizeWave(d.meta.wave)];
  if(!waves.length)waves=['Sin ola'];
  return {id:d.id,code:d.code,name:d.name,macro:d.macro,type:d.type,owner:d.meta?.owner||'',
   wave:waves.length===1?waves[0]:'Varias olas',waves,linkedToAfal,registeredDate:d.registeredDate,dateOrigin:d.dateOrigin,
   controlledDate:'',status:d.hasFile?'Archivo cargado':'Carga pendiente'};
 });
 portalLive.signature=signature;
 return portalLive.catalog={format:'afal-portal-catalog-1',rows,pending:[],mapping:{completeIsControlled:false,dateBasis:'unknown'},
  fileName:'Gestor Documental · consulta directa',importedAt:portalLive.raw.checkedAt,checkedAt:portalLive.raw.checkedAt,source:'supabase'};
}
portalCatalog=function(){return typeof parent.afalReadPortalReport==='function'&&portalLive.source==='live'?portalLiveCatalog():importedPortalCatalog();};
const importedPortalPeriod=portalDocumentPeriod;
portalDocumentPeriod=function(start,end,wave='all',catalog=portalCatalog()){
 if(!catalog)return null;
 const rows=catalog.rows.filter(r=>portalRowMatchesWave(r,wave));
 const result=importedPortalPeriod(start,end,'all',{...catalog,rows});
 result.wave=wave;result.source=catalog.source;result.checkedAt=catalog.checkedAt;
 result.registeredTypes={};for(const row of result.registeredRows)result.registeredTypes[row.type]=(result.registeredTypes[row.type]||0)+1;
 result.unlinked=result.registeredRows.filter(r=>r.linkedToAfal===false).length;
 result.noWave=result.registeredRows.filter(r=>r.wave==='Sin ola').length;
 return result;
};
function portalLiveNotice(){
 if(typeof parent.afalReadPortalReport!=='function')return '';
 const at=portalLive.raw?.checkedAt;
 const state=portalLive.source==='csv'?'Fuente: CSV importado':portalLive.busy?'Consultando altas del Gestor…':portalLive.error?
  (at?'No se pudo actualizar. Se conserva la última consulta: ':'No se pudo consultar el Gestor: ')+portalLive.error:
  at?'Gestor Documental · actualizado '+new Date(at).toLocaleString('es-MX',{timeZone:'America/Tijuana'}):'Consultando altas del Gestor…';
 return '<div class="portalLiveTools" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap;padding:8px 12px;color:#536e80;font-size:11px" role="status">'+
  '<span>'+esc(state)+'</span><button class="btn" type="button" onclick="refreshPortalReport(true)" '+(portalLive.busy?'disabled':'')+'>Actualizar datos documentales</button>'+
  '<label>Fuente <select aria-label="Fuente documental" onchange="setPortalReportSource(this.value)"><option value="live" '+(portalLive.source==='live'?'selected':'')+'>Gestor Documental automático</option><option value="csv" '+(portalLive.source==='csv'?'selected':'')+'>CSV importado</option></select></label></div>';
}
function portalReportRerender(){if(state.view==='project'&&state.projectSection==='reports')renderProjectView();}
async function refreshPortalReport(force=false){
 if(typeof parent.afalReadPortalReport!=='function')return false;
 if(portalLive.busy)return portalLive.busy;
 if(!force&&portalLive.attempted)return !!portalLive.raw;
 portalLive.attempted=true;portalLive.error='';
 const job=(async()=>{try{const data=await parent.afalReadPortalReport();
  portalLive.raw=data;portalLive.catalog=null;portalLive.lastFetched=Date.now();return true;
 }catch(error){portalLive.error=error.message;return false;}})();
 portalLive.busy=job;portalReportRerender();
 const success=await job;portalLive.busy=null;portalReportRerender();return success;
}
function setPortalReportSource(source){portalLive.source=source==='csv'?'csv':'live';portalReportRerender();if(source==='live')refreshPortalReport(true);}
function requestPortalReport(){const stale=portalLive.raw&&!portalLive.error&&Date.now()-portalLive.lastFetched>30000;if((!portalLive.attempted||stale)&&!portalLive.busy&&typeof parent.afalReadPortalReport==='function')setTimeout(()=>refreshPortalReport(!!stale),0);}
const originalLiveExecutiveRender=renderExecutiveReports;
renderExecutiveReports=function(){requestPortalReport();return portalLiveNotice()+originalLiveExecutiveRender();};
const originalLiveWeeklyRender=renderWeeklyReport;
renderWeeklyReport=function(){requestPortalReport();return portalLiveNotice()+originalLiveWeeklyRender();};
const originalLiveExecutiveOption=setExecutiveOption;
setExecutiveOption=function(key,value){originalLiveExecutiveOption(key,value);if(executiveUI.cut==='live')refreshPortalReport(true);};
const originalLiveWeeklySelect=weeklySelect;
weeklySelect=async function(field,value){const changed=await originalLiveWeeklySelect(field,value);if(changed!==false&&weeklyUI.view!=='cut')await refreshPortalReport(true);return changed;};
const originalLiveWeeklyTab=weeklySelectTab;
weeklySelectTab=async function(tab){await originalLiveWeeklyTab(tab);if(tab!=='people')await refreshPortalReport(true);};
const originalLiveWeeklyWeeks=weeklyWeeks;
weeklyWeeks=function(){const weeks=new Set(originalLiveWeeklyWeeks());for(const row of portalCatalog()?.rows||[])if(portalRowMatchesWave(row,weeklyUI.wave)&&validSanitationDate(row.registeredDate))weeks.add(weeklyMonday(row.registeredDate));return [...weeks].sort();};
const previousLiveMonthlyDocuments=reportMonthlyDocumentsHtml;
reportMonthlyDocumentsHtml=function(snapshot,legacy){
 const catalog=reportCatalogForSnapshot(snapshot);if(!snapshot.createdAt&&!catalog&&portalLive.source==='live'&&typeof parent.afalReadPortalReport==='function')return '<section><h2>Altas documentales del portal</h2>'+portalSummaryHtml(null)+'</section>';if(catalog?.source!=='supabase')return previousLiveMonthlyDocuments(snapshot,legacy);
 const bounds=reportMonthBounds(snapshot.month),stats=portalDocumentPeriod(bounds.start,bounds.end,executiveUI.wave,catalog);
 const docs=catalog.rows.filter(r=>portalRowMatchesWave(r,executiveUI.wave));
 const first=docs.map(r=>r.registeredDate).filter(d=>d&&d<=bounds.end).sort()[0]||bounds.start;
 const graph=dashboardBars(dashboardPeriods([],docs,executiveUI.wave==='all'?first.slice(0,7)+'-01':bounds.start,bounds.end,executiveUI.wave==='all'?'month':'week'),'documents');
 return '<section class="execPortalDocuments"><h2>'+iconSvg('note')+' Altas documentales del portal · '+esc(snapshot.month)+'</h2>'+portalSummaryHtml(stats)+graph+'</section>';
};
const previousLivePortalSummary=portalSummaryHtml;
portalSummaryHtml=function(stats,compact=false){
 if(!stats){if(typeof parent.afalReadPortalReport==='function'&&portalLive.source==='live')return '<p>'+esc(portalLive.error?'No se pudieron consultar las altas. Usa Actualizar datos documentales.':'Consultando altas del Gestor Documental…')+'</p>';return previousLivePortalSummary(stats,compact);}
 if(stats.source!=='supabase')return previousLivePortalSummary(stats,compact);
 const cls=compact?'weeklyDocumentCount':'execDocumentTotal',types=Object.entries(stats.registeredTypes||{}).sort(([a],[b])=>a.localeCompare(b));
 return '<div class="'+cls+'"><strong>'+stats.registered+'</strong><span>Documentos dados de alta en '+(compact?'la semana':'el mes')+'</span></div>'+
 '<div class="'+(compact?'weeklyDocumentTypes':'execBreakdown')+'">'+(types.map(([type,n])=>'<span>'+esc(type)+': <b>'+n+'</b></span>').join('')||'<span>Sin altas en el periodo y la ola seleccionados.</span>')+'</div>'+
 '<p class="'+(compact?'minor':'execNote')+'">Fuente: Gestor Documental · '+esc(stats.wave==='all'?'Todas las olas':stats.wave)+' · Fecha de alta del portal (incluye Carga pendiente). Consulta: '+esc(new Date(stats.checkedAt).toLocaleString('es-MX',{timeZone:'America/Tijuana'}))+'.'+
 (stats.unlinked?' '+stats.unlinked+' altas sin vínculo AFAL; se usa su ola declarada en el portal.':'')+(stats.noWave?' '+stats.noWave+' sin ola identificada.':'')+'</p>'+
 '<p class="'+(compact?'minor':'execNote')+'">Documentos controlados: sin fecha de control explícita; no se infieren desde la carga del archivo.</p>'+
 '<details><summary>Ver '+stats.registered+' documentos dados de alta</summary><table class="stakeholderDetailTable"><thead><tr><th>Código</th><th>Documento</th><th>Tipo</th><th>Ola</th><th>Fecha de alta</th><th>Carga</th></tr></thead><tbody>'+
 stats.registeredRows.map(r=>'<tr><td>'+esc(r.code)+'</td><td>'+esc(r.name)+'</td><td>'+esc(r.type)+'</td><td>'+esc((r.waves||[r.wave]).join(' · '))+'</td><td>'+esc(r.registeredDate)+'</td><td>'+esc(r.status)+'</td></tr>').join('')+'</tbody></table></details>';
};
