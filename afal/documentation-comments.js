function documentationCommentResolved(entry) {
 return entry.resolved === true || (entry.resolved !== false && !!entry.resolvedAt);
}

function documentationCommentSummary(value) {
 const entries = afalCommentEntries(value);
 const resolved = entries.filter(documentationCommentResolved).length;
 return {total:entries.length,resolved,active:entries.length-resolved};
}

function documentationCommentIndicatorClass(summary) {
 return 'commentIndicator documentationCommentIndicator '+(summary.active ? 'commentsActive' : summary.total ? 'commentsResolved' : 'noComments');
}

function documentationCommentIndicatorContent(summary) {
 return summary.total ? `<b>${summary.total}</b>` : '<span class="commentDot"></span>';
}

function documentationCommentIndicatorLabel(summary) {
 return `${summary.total} comentarios · ${summary.active} activos · ${summary.resolved} resueltos`;
}

const originalCommentIndicator = afalCommentIndicator;
afalCommentIndicator = function (scope,id,value,label) {
 if (scope !== 'implementation') return originalCommentIndicator(scope,id,value,label);
 const summary = documentationCommentSummary(value);
 return `<button class="${documentationCommentIndicatorClass(summary)}" data-documentation-comment-id="${esc(id)}"
  type="button" onclick="openAfalCommentViewer('implementation','${esc(id)}')"
  aria-label="${esc(documentationCommentIndicatorLabel(summary))} · ${esc(label || 'procedimiento')}">
  ${documentationCommentIndicatorContent(summary)}</button>`;
};

const originalRefreshCommentIndicator = refreshProjectCommentIndicator;
refreshProjectCommentIndicator = function (scope,id,value) {
 if (scope !== 'implementation') return originalRefreshCommentIndicator(scope,id,value);
 const summary = documentationCommentSummary(value);
 for (const button of document.querySelectorAll('[data-documentation-comment-id]')) {
  if (button.dataset.documentationCommentId !== String(id)) continue;
  button.className = documentationCommentIndicatorClass(summary);
  button.innerHTML = documentationCommentIndicatorContent(summary);
  button.setAttribute('aria-label',documentationCommentIndicatorLabel(summary));
 }
 for (const cell of document.querySelectorAll('.implProcedure[data-implementation-flow]')) {
  if (cell.dataset.implementationFlow === String(id)) cell.classList.toggle('hasActiveComments',summary.active > 0);
 }
};

const originalManagedComments = renderManagedComments;
renderManagedComments = function (scope,id,value) {
 if (scope !== 'implementation') return originalManagedComments(scope,id,value);
 const entries = afalCommentEntries(value);
 if (!entries.length) return '<div class="empty">Sin comentarios.</div>';
 return entries.map((entry,index) => ({entry,index})).reverse().map(({entry,index}) => {
  const resolved = documentationCommentResolved(entry);
  const resolutionDate = entry.resolvedAt ? new Date(entry.resolvedAt).toLocaleString('es-MX') : 'Fecha no disponible';
  const history = Array.isArray(entry.resolutionHistory) ? entry.resolutionHistory : [];
  return `<article class="quickComment documentationComment ${resolved ? 'commentResolved' : ''}">
   <time>${entry.at ? esc(new Date(entry.at).toLocaleString('es-MX')) : 'Fecha no disponible'}${entry.editedAt ? ' · Editado '+esc(new Date(entry.editedAt).toLocaleString('es-MX')) : ''}</time>
   <span class="documentationCommentState ${resolved ? 'resolved' : 'active'}">${resolved ? '✓ Resuelto' : 'Activo'}</span>
   <p>${esc(entry.text)}</p>
   ${resolved ? `<p class="documentationResolutionDate">Resuelto ${esc(resolutionDate)}${entry.resolvedByName ? ' · '+esc(entry.resolvedByName) : ''}</p>` : ''}
   ${history.length ? `<details class="documentationResolutionHistory"><summary>Historial de resolución</summary>${history.map(event =>
    `<div><time>${esc(new Date(event.at).toLocaleString('es-MX'))}${event.byName ? ' · '+esc(event.byName) : ''}</time><span>✓ Resuelto</span><p>${esc(event.text || entry.text)}</p></div>`).join('')}</details>` : ''}
   <div class="poolCommentActions">
    ${!resolved ? `<button class="btn" data-record="${esc(id)}" onclick="openCommentMutation('implementation',this.dataset.record,${index},'resolve')">Resuelto</button>` : ''}
    <button class="btn" data-record="${esc(id)}" onclick="openCommentMutation('implementation',this.dataset.record,${index},'edit')">Editar</button>
    <button class="btn danger" data-record="${esc(id)}" onclick="openCommentMutation('implementation',this.dataset.record,${index},'delete')">Eliminar</button>
   </div></article>`;
 }).join('');
};

const originalOpenCommentMutation = openCommentMutation;
openCommentMutation = function (scope,id,index,mode) {
 if (scope !== 'implementation' || mode !== 'resolve') return originalOpenCommentMutation(scope,id,index,mode);
 const target = projectCommentTarget(scope,id);
 if (!target) return;
 const entries = afalCommentEntries(target.owner[target.key]);
 const entry = entries[index];
 if (!entry || documentationCommentResolved(entry)) return;
 poolCommentPending = {scope,id,index,mode,wave:state.projectWave,expected:JSON.stringify(entries)};
 openModal(`<h3>Resolver comentario</h3><p>${esc(entry.text)}</p>
  <p>El comentario quedará en el historial con su fecha de resolución.</p><p id="documentationResolveError" role="alert"></p>
  <div class="modalactions"><button class="btn" onclick="cancelCommentMutation()">Cancelar</button>
   <button class="btn primary" onclick="commitCommentMutation()">Marcar como resuelto</button></div>`,{backdropDismissible:false});
};

let documentationResolutionSaving = false;
const originalCommitCommentMutation = commitCommentMutation;
commitCommentMutation = async function () {
 const pending = poolCommentPending;
 if (pending?.scope !== 'implementation' || pending.mode !== 'resolve') return originalCommitCommentMutation();
 if (documentationResolutionSaving) return false;
 const error = document.getElementById('documentationResolveError');
 const target = projectCommentTarget('implementation',pending.id);
 const entries = target && afalCommentEntries(target.owner[target.key]);
 if (!entries || pending.wave !== state.projectWave || JSON.stringify(entries) !== pending.expected) {
  if (error) error.textContent = 'El comentario o la ola cambió. Abre nuevamente el detalle.';
  return false;
 }
 const entry = entries[pending.index];
 if (!entry || documentationCommentResolved(entry)) return false;
 const at = new Date().toISOString();
 const actor = parent.afalCurrentUser || {};
 const event = {action:'resolved',at,by:actor.id || '',byName:actor.label || '',text:entry.text};
 entries[pending.index] = {...entry,id:entry.id || crypto.randomUUID(),resolved:true,resolvedAt:at,
  resolvedBy:actor.id || '',resolvedByName:actor.label || '',
  resolutionHistory:[...(Array.isArray(entry.resolutionHistory) ? entry.resolutionHistory : []),event]};
 const controls = [...document.querySelectorAll('#modal button')].map(button => ({button,disabled:button.disabled}));
 documentationResolutionSaving = true;
 controls.forEach(({button}) => {button.disabled = true;});
 try {
  await saveDocumentationPatch(pending.id,{comments:entries,updatedAt:at});
  const data = implementationFor(pending.id);
  data.comments = entries;
  data.updatedAt = at;
  poolCommentPending = null;
  refreshProjectCommentIndicator('implementation',pending.id,entries);
  reopenProjectCommentDetail('implementation',pending.id,true);
  return true;
 } catch (failure) {
  if (error?.isConnected) error.textContent = 'No se guardó la resolución. '+failure.message;
  return false;
 } finally {
  documentationResolutionSaving = false;
  controls.forEach(({button,disabled}) => {if (button.isConnected) button.disabled = disabled;});
 }
};

// Keep resolved state readable in exports and compatible with existing comment imports.
const originalCommentExportText = afalCommentExportText;
afalCommentExportText = function (value) {
 return afalCommentEntries(value).map(entry => {
  const text = documentationCommentResolved(entry) ? `[Resuelto${entry.resolvedAt ? ' '+entry.resolvedAt : ''}] ${entry.text}` : entry.text;
  return originalCommentExportText([{...entry,text}]);
 }).join('\n');
};
const originalCommentImportText = afalCommentImportText;
afalCommentImportText = function (value) {
 return originalCommentImportText(value).map(entry => {
  const marker = entry.text.match(/^\[Resuelto(?: (\d{4}-\d{2}-\d{2}T[^\]]+))?\] ([\s\S]*)$/);
  if (!marker) return entry;
  return {...entry,text:marker[2],resolved:true,resolvedAt:marker[1] || ''};
 });
};
