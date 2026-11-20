let documentAlignmentDraft = null;
let alignmentRefreshInFlight = null;
let alignmentLastChecked = Date.parse(parent.afalDocumentCatalog?.checkedAt || '') || 0;
let alignmentFilter = 'all';
let alignmentRenderingMatrix = false;
const ALIGNMENT_FILTERS = [
 ['all','Todos los vínculos'],['alerts','Solo con alertas'],['matched','Coinciden'],
 ['different','Diferencias de código o nombre'],['unlinked','Sin vincular'],['unchecked','Sin comprobar']
];

function alignmentFilterMatches(comparison) {
 if (alignmentFilter === 'all') return true;
 if (alignmentFilter === 'alerts') return ['different','unlinked','ambiguous','retired'].includes(comparison.status);
 return comparison.status === alignmentFilter;
}

const alignmentArchitectureRows = architectureFilteredRows;
architectureFilteredRows = function () {
 const rows = alignmentArchitectureRows();
 if (alignmentRenderingMatrix || alignmentFilter === 'all') return rows;
 const index = documentAlignmentIndex();
 return rows.filter(flow => alignmentFilterMatches(procedureDocumentComparison(flow,index)));
};

function setAlignmentFilter(value) {
 alignmentFilter = ALIGNMENT_FILTERS.some(([key]) => key === value) ? value : 'all';
 updateDocumentAlignmentCells();
 updateAlignmentClearButton();
}

const alignmentPoolFilterActive = poolFilterActive;
poolFilterActive = function (type) {
 return alignmentPoolFilterActive(type) || (type === 'architecture' && alignmentFilter !== 'all');
};
const alignmentClearPoolFilters = clearPoolFilters;
clearPoolFilters = function (type) {
 if (type === 'architecture') alignmentFilter = 'all';
 alignmentClearPoolFilters(type);
};

function updateAlignmentClearButton() {
 const clear = [...document.querySelectorAll('.poolArchitectureTools button')].find(button =>
  /clearArchitectureFilters|clearPoolFilters/.test(button.getAttribute('onclick') || ''));
 if (!clear) return;
 const active = poolFilterActive('architecture');
 clear.disabled = !active;
 clear.classList.toggle('poolFiltersActive',active);
}

function alignmentName(value) {
 return String(value || '').normalize('NFC').trim().replace(/\s+/g,' ').toLocaleLowerCase('es');
}

function documentAlignmentIndex() {
 const catalog = parent.afalDocumentCatalog;
 const index = {available:!!catalog,byId:new Map(),byCode:new Map(),byName:new Map(),links:new Map()};
 for (const document of catalog?.documents || []) {
  index.byId.set(document.id,document);
  if (document.deletedAt) continue;
  for (const [map,key] of [[index.byCode,document.code.trim().toUpperCase()],[index.byName,alignmentName(document.name)]]) {
   if (!map.has(key)) map.set(key,[]);
   map.get(key).push(document);
  }
 }
 for (const link of catalog?.links || []) index.links.set(link.flowId,link.documentId);
 return index;
}

function procedureDocumentComparison(flow,index = documentAlignmentIndex()) {
 if (!index.available) return {status:'unchecked',label:'Sin comprobar',candidates:[]};
 const meta = architectureMatrixDraftMeta(flow);
 const code = String(meta.procedureNumber || '').trim().toUpperCase();
 const name = alignmentName(meta.procedureFinal);
 const codeMatches = code ? index.byCode.get(code) || [] : [];
 const nameMatches = name ? index.byName.get(name) || [] : [];
 const linkedId = index.links.get(flow.id);
 const candidates = [...new Map([...codeMatches,...nameMatches].map(d => [d.id,d])).values()];
 const document = linkedId ? index.byId.get(linkedId) : candidates.length === 1 ? candidates[0] : null;
 if (linkedId && (!document || document.deletedAt)) return {status:'retired',label:'Registro retirado',candidates};
 if (!document) return {status:candidates.length ? 'ambiguous' : 'unlinked',
  label:candidates.length ? 'Revisar coincidencia' : 'Sin vincular',candidates};
 const sameCode = code === document.code.trim().toUpperCase();
 const sameName = !!name && name === alignmentName(document.name);
 const label = sameCode && sameName ? 'Coincide' : !sameCode && !sameName ? 'Código y nombre diferentes' : sameCode ? 'Nombre diferente' : 'Código diferente';
 return {status:sameCode && sameName ? 'matched' : 'different',label,document,candidates,linked:!!linkedId};
}

function alignmentCellContent(flow,index) {
 const comparison = procedureDocumentComparison(flow,index);
 const icon = comparison.status === 'matched' ? '✓' : comparison.status === 'unchecked' ? '…' : '⚠';
 const tone = comparison.status === 'matched' ? 'matchOk' : 'matchWarn';
 return `<button class="archSourceBadge ${tone}" type="button" data-flow="${esc(flow.id)}"
  aria-label="${esc(comparison.label)} con el Gestor Documental"
  onclick="event.stopPropagation();openDocumentAlignment(this.dataset.flow)">${icon} ${esc(comparison.label)}</button>`;
}

const alignmentMatrixRenderer = renderBankMatrix;
renderBankMatrix = function () {
 const template = document.createElement('template');
 alignmentRenderingMatrix = true;
 try {template.innerHTML = alignmentMatrixRenderer();}
 finally {alignmentRenderingMatrix = false;}
 const table = template.content.querySelector('table');
 if (!table) return template.innerHTML;
 const finalHeader = table.querySelector('th[data-matrix-key="procedureFinal"]');
 if (!finalHeader) return template.innerHTML;
 const index = documentAlignmentIndex();
 const header = document.createElement('th');
 header.scope = 'col';
 header.dataset.matrixKey = '_documentAlignment';
 header.innerHTML = '<div>Vínculo documental</div><button class="btn" type="button" onclick="refreshDocumentAlignment(true)">↻ Comprobar</button>';
 finalHeader.after(header);
 const column = document.createElement('col');
 column.dataset.colKey = '_documentAlignment';
 column.style.width = '170px';
 table.querySelector('colgroup').children[[...finalHeader.parentElement.children].indexOf(finalHeader)]?.after(column);
 const flowIndex = new Map(architectureRows(true).map(flow => [flow.id,flow]));
 for (const cell of table.querySelectorAll('td[data-arch-cell="procedureFinal"]')) {
  const flow = flowIndex.get(cell.dataset.archRow);
  if (!flow) continue;
  const indicator = document.createElement('td');
  indicator.className = 'bankCell';
  indicator.dataset.alignmentId = flow.id;
  indicator.innerHTML = alignmentCellContent(flow,index);
  cell.after(indicator);
 }
 table.style.width = (parseFloat(table.style.width) + 170) + 'px';
 return template.innerHTML;
};

function updateDocumentAlignmentCells() {
 const index = documentAlignmentIndex();
 const flows = new Map(architectureRows(true).map(flow => [flow.id,flow]));
 let total = 0;
 let visible = 0;
 let unchecked = 0;
 for (const cell of document.querySelectorAll('[data-alignment-id]')) {
  const flow = flows.get(cell.dataset.alignmentId);
  const button = cell.querySelector('button');
  if (!flow || !button) continue;
  const comparison = procedureDocumentComparison(flow,index);
  total++;
  if (comparison.status === 'unchecked') unchecked++;
  const show = alignmentFilterMatches(comparison);
  cell.parentElement.hidden = !show;
  cell.parentElement.style.display = show ? '' : 'none';
  if (show) visible++;
  const icon = comparison.status === 'matched' ? '✓' : comparison.status === 'unchecked' ? '…' : '⚠';
  button.className = 'archSourceBadge '+(comparison.status === 'matched' ? 'matchOk' : 'matchWarn');
  button.textContent = icon+' '+comparison.label;
  button.setAttribute('aria-label',comparison.label+' con el Gestor Documental');
 }
 const count = document.getElementById('alignmentFilterCount');
 if (count) count.textContent = `${visible} de ${total} filas`;
 const table = document.querySelector('.bankMatrix');
 if (!table) return;
 table.querySelector('[data-alignment-empty]')?.remove();
 if (total && !visible) {
  const row = table.tBodies[0].insertRow();
  row.dataset.alignmentEmpty = 'true';
  const cell = row.insertCell();
  cell.colSpan = table.tHead.rows[0].cells.length;
  cell.className = 'emptyState';
  cell.textContent = unchecked ? 'Hay filas sin comprobar. Pulsa Comprobar para consultar el Gestor.' : 'No hay filas que coincidan con este filtro de vínculo documental.';
 }
}

async function refreshDocumentAlignment(force = false) {
 if (alignmentRefreshInFlight) return alignmentRefreshInFlight;
 if (!force && Date.now() - alignmentLastChecked < 15000) return;
 if (typeof parent.afalReadDocumentCatalog !== 'function') return;
 alignmentRefreshInFlight = (async () => {
  try {
   await parent.afalReadDocumentCatalog();
   alignmentLastChecked = Date.now();
   updateDocumentAlignmentCells();
  } catch (error) {
   parent.afalDocumentCatalog = null;
   updateDocumentAlignmentCells();
   if (force) inputAlert('No se pudo comprobar el Gestor Documental. '+error.message);
  } finally { alignmentRefreshInFlight = null; }
 })();
 return alignmentRefreshInFlight;
}

const alignmentBankView = renderBankView;
renderBankView = function () {
 alignmentBankView();
 const toolbar = document.querySelector('.poolArchitectureTools');
 if (toolbar) toolbar.insertAdjacentHTML('beforeend',
  `<label>Vínculo documental <select class="select" id="alignmentFilter" aria-label="Filtrar vínculo documental"
   onchange="setAlignmentFilter(this.value)">${ALIGNMENT_FILTERS.map(([key,label]) =>
    `<option value="${key}" ${alignmentFilter === key ? 'selected' : ''}>${label}</option>`).join('')}</select></label>
   <span id="alignmentFilterCount" class="mini" role="status"></span>`);
 updateDocumentAlignmentCells();
 updateAlignmentClearButton();
 refreshDocumentAlignment();
};
const alignmentSetDraft = architectureMatrixSetDraft;
architectureMatrixSetDraft = function (...args) {
 const result = alignmentSetDraft(...args);
 if (args[1] === 'procedureNumber' || args[1] === 'procedureFinal') updateDocumentAlignmentCells();
 return result;
};
window.addEventListener('focus',() => {if (state.view === 'bank') refreshDocumentAlignment(true);});
document.addEventListener('visibilitychange',() => {
 if (!document.hidden && state.view === 'bank') refreshDocumentAlignment(true);
});
setInterval(() => {
 if (!document.hidden && state.view === 'bank') refreshDocumentAlignment();
},60000);

async function openDocumentAlignment(flowId) {
 if (architectureMatrixEditActive() && architectureMatrixRecount().cells) {
  return inputAlert('Guarda o descarta los cambios de la matriz antes de conciliar ambos registros.');
 }
 const flow = state.flows.find(f => f.id === flowId);
 if (!flow) return;
 openModal('<h3>Comparando con el Gestor Documental…</h3>');
 try {
  await parent.afalReadDocumentCatalog();
  updateDocumentAlignmentCells();
  const comparison = procedureDocumentComparison(flow);
  documentAlignmentDraft = {flowId,documentId:comparison.document?.id || '',preview:null};
  await alignmentDocumentPicked(documentAlignmentDraft.documentId);
 } catch (error) { inputAlert('No se pudo consultar la comparación. '+error.message); }
}

async function alignmentDocumentPicked(documentId) {
 const draft = documentAlignmentDraft;
 if (!draft) return;
 try {
  draft.documentId = documentId;
  draft.preview = await parent.afalAlignmentPreview([draft.flowId],documentId || null);
  draft.requestId = crypto.randomUUID();
  const group = unifiedProcedure(state.flows.find(f => f.id === draft.flowId));
  const savedDestination = draft.preview.architecture.sources.find(source => {
   const team = source.implementation?.unifiedDocumentationTeam;
   if (!team?.signature) return false;
   try {
    const signature = JSON.parse(team.signature);
    const current = alignmentPreviewSource(source.id);
    const key = matrixUnifiedKey({procedureNumber:current.code,procedureFinal:current.title});
    const explicitEvent = (parent.afalProcedureHistory || []).find(event =>
     'explicit-final:'+event.id === signature[0] && event.final.code === current.code && event.final.name === current.title);
    return (signature[0] === key || !!explicitEvent) && JSON.stringify(signature[1]) === JSON.stringify(draft.preview.architecture.ids);
   } catch {return false;}
  });
  const savedTeam = savedDestination?.implementation.unifiedDocumentationTeam;
  draft.destination = savedDestination?.id || group?.anchor.id || draft.flowId;
  draft.leadId = savedTeam?.leadId || group?.lead?.id || '';
  draft.companionId = savedTeam?.companionId || group?.companion?.id || '';
  showDocumentAlignment();
 } catch (error) { inputAlert(error.message); }
}

function alignmentPreviewSource(id) {
 const source = documentAlignmentDraft.preview.architecture.sources.find(s => s.id === id);
 // Older approved display corrections predate persisted matrix fields.
 // A newer saved field always takes precedence over that legacy display name.
 const title = Object.hasOwn(source.matrix || {},'procedureFinal') ? source.title : nomenclatureDisplayTitles[id] || source.title;
 return {...source,title};
}

function showDocumentAlignment() {
 const d = documentAlignmentDraft;
 const preview = d.preview;
 const source = alignmentPreviewSource(d.flowId);
 const doc = preview.document;
 const records = (parent.afalDocumentCatalog?.documents || []).filter(x => !x.deletedAt);
 const same = doc && source.code.trim().toUpperCase() === doc.code && alignmentName(source.title) === alignmentName(doc.name);
 openModal(`<h3>Código y nombre · AFAL y Gestor Documental</h3>
  <div class="field"><label>Registro del Gestor que corresponde a este procedimiento</label>
   ${genericSearchPicker('alignmentDocumentPicker',records.map(x => ({value:x.id,label:x.code+' · '+x.name})),d.documentId,
    'Buscar por código o nombre…','Seleccionar registro del Gestor','alignmentDocumentPicked')}</div>
  ${doc ? `<p><span class="archSourceBadge ${same ? 'matchOk' : 'matchWarn'}">${same ? '✓ Código y nombre coinciden' : '⚠ Diferencias por conciliar'}</span></p>` :
   '<p>No hay un registro confirmado. Selecciona el procedimiento del Gestor para comparar.</p><p><a href="../" target="_top">Abrir Gestor Documental</a></p>'}
  <div class="stakeholderDetailTableWrap"><table class="stakeholderDetailTable"><thead><tr><th>Campo</th><th>Arquitectura AFAL</th><th>Gestor Documental</th></tr></thead>
   <tbody><tr><th>Código</th><td>${esc(source.code || 'Sin código')}${doc ? '<br><button class="btn" onclick="useAlignmentValue(\'code\',\'afal\')">Usar código AFAL</button>' : ''}</td>
    <td>${esc(doc?.code || 'Sin registro')}${doc ? '<br><button class="btn" onclick="useAlignmentValue(\'code\',\'gestor\')">Usar código del Gestor</button>' : ''}</td></tr>
   <tr><th>Nombre final</th><td>${esc(source.title || 'Sin nombre final')}${doc ? '<br><button class="btn" onclick="useAlignmentValue(\'name\',\'afal\')">Usar nombre AFAL</button>' : ''}</td>
    <td>${esc(doc?.name || 'Sin registro')}${doc ? '<br><button class="btn" onclick="useAlignmentValue(\'name\',\'gestor\')">Usar nombre del Gestor</button>' : ''}</td></tr></tbody></table></div>
  ${doc ? `<section class="procedureSection"><div class="procedureSectionHead">Valores que quedarán en ambas plataformas</div>
   <div class="recordEditGrid"><div class="field"><label for="alignmentCode">Código definitivo</label><input id="alignmentCode" maxlength="80" value="${esc(source.code || doc.code)}"></div>
    <div class="field"><label for="alignmentName">Nombre definitivo</label><input id="alignmentName" maxlength="300" value="${esc(source.title || doc.name)}"></div>
    ${preview.architecture.ids.length > 1 ? `<div class="field"><label>Titular del procedimiento final</label><select id="alignmentLead">${procedurePersonOptions(d.leadId,'Seleccionar titular…')}</select></div>
     <div class="field"><label>Acompañante</label><select id="alignmentCompanion">${procedurePersonOptions(d.companionId,'Sin acompañante')}</select></div>` : ''}</div>
   <p>${preview.architecture.ids.length} fila(s) de AFAL vinculadas al mismo procedimiento.</p>
   <details><summary>Ver filas que se actualizarán</summary>${preview.architecture.sources.map(s => `<p>${esc(procedureOriginLabel(s))} · ${esc(s.code)} · ${esc(s.title)}</p>`).join('')}</details>
   <label class="candidateItem"><input id="alignmentRelease" type="checkbox"><span>Si cambia el código del Gestor, liberar su número anterior.</span></label>
   ${preview.files.length ? '<label class="candidateItem"><input id="alignmentFiles" type="checkbox"><span>Revisaré la nomenclatura dentro de los PDF y Excel vinculados.</span></label>' : ''}
   </section>` : ''}
  <p id="alignmentError" role="alert"></p><div class="modalactions"><button class="btn" onclick="closeModal()">Cerrar</button>
   ${doc ? `<button class="btn primary" ${parent.afalCanEdit === false ? 'disabled' : ''} onclick="reviewDocumentAlignment()">Revisar actualización de ambas plataformas →</button>` : ''}</div>`,{backdropDismissible:false});
 $('#modal').classList.add('architectureRecordModal');
}

function useAlignmentValue(field, platform) {
 const d = documentAlignmentDraft;
 const source = alignmentPreviewSource(d.flowId);
 const value = platform === 'gestor' ? d.preview.document[field] : field === 'name' ? source.title : source.code;
 document.getElementById(field === 'name' ? 'alignmentName' : 'alignmentCode').value = value;
}

function reviewDocumentAlignment() {
 const d = documentAlignmentDraft;
 const code = $('#alignmentCode').value.trim().toUpperCase();
 const name = $('#alignmentName').value.trim();
 const leadId = $('#alignmentLead')?.value || '';
 if (!code || !name || (d.preview.architecture.ids.length > 1 && !leadId)) {
  $('#alignmentError').textContent = 'Confirma el código, el nombre y el titular cuando corresponda.';
  return;
 }
 if (d.preview.files.length && !$('#alignmentFiles').checked) {
  $('#alignmentError').textContent = 'Confirma la revisión de los archivos vinculados.';
  return;
 }
 d.request = {requestId:d.requestId,ids:d.preview.architecture.ids,documentId:d.documentId,
  fingerprint:d.preview.fingerprint,destination:d.destination,code,name,leadId,
  companionId:$('#alignmentCompanion')?.value || '',releaseOldCode:!!$('#alignmentRelease').checked,
  acknowledgeFiles:!!$('#alignmentFiles')?.checked};
 openModal(`<h3>Confirmar actualización en ambas plataformas</h3><section class="procedureSection">
  <div class="procedureSectionHead">Identificación definitiva</div><p><b>${esc(code)}</b><br>${esc(name)}</p>
  <p>${d.preview.architecture.ids.length} fila(s) de AFAL y el registro del Gestor se actualizarán en conjunto.</p>
  ${code !== d.preview.document.code ? `<p>Código anterior ${esc(d.preview.document.code)} · ${d.request.releaseOldCode ? 'se liberará' : 'quedará reservado'}.</p>` : ''}</section>
  <label class="candidateItem"><input id="alignmentConfirm" type="checkbox" onchange="document.getElementById('alignmentSave').disabled=!this.checked">
   <span>Confirmo el código, el nombre y el registro documental seleccionado.</span></label>
  <p id="alignmentSaveError" role="alert"></p><div class="modalactions"><button class="btn" onclick="showDocumentAlignment()">← Volver</button>
   <button class="btn primary" id="alignmentSave" disabled onclick="saveDocumentAlignment()">Actualizar AFAL y Gestor</button></div>`,{backdropDismissible:false});
}

async function saveDocumentAlignment() {
 const d = documentAlignmentDraft;
 const button = $('#alignmentSave');
 if (!d || !button || button.disabled || !$('#alignmentConfirm').checked) return;
 button.disabled = true;
 try {
  await parent.afalConfirmAlignment(d.request);
  state.bankEdit = null;
  if (!await loadShared()) throw Error('La conciliación se guardó. Recarga AFAL para ver el resultado.');
  await openDocumentAlignment(d.flowId);
 } catch (error) {
  const notice = $('#alignmentSaveError');
  if (notice) {
   notice.textContent = error.message;
   const refresh = document.createElement('button');
   refresh.className = 'btn';
   refresh.textContent = 'Actualizar comparación';
   refresh.addEventListener('click',() => openDocumentAlignment(d.flowId));
   notice.append(document.createElement('br'),refresh);
   button.disabled = false;
  } else inputAlert(error.message);
 }
}
