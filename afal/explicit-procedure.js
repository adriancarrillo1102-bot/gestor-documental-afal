// Review procedure identity before changing its shared name or merging origins.
let procedureFlowDraft = null;
const procedureSelection = new Set();

const originalConfirmedUnifications = confirmedMatrixUnifications;
confirmedMatrixUnifications = function () {
 const groups = originalConfirmedUnifications();
 for (const event of parent.afalProcedureHistory || []) {
  if (event.final.code || event.sourceIds.length < 2) continue;
  const flows = event.sourceIds.map(id => state.flows.find(f => f.id === id));
  if (flows.some(flow => !flow || ensureFlowMatrixMeta(flow).procedureNumber !== '' ||
   ensureFlowMatrixMeta(flow).procedureFinal !== event.final.name)) continue;
  const key = 'explicit-final:' + event.id;
  const destination = flows.find(f => f.id === event.destination);
  const team = destination && readImplementationFor(destination.id).unifiedDocumentationTeam;
  if (team?.signature !== matrixUnifiedSignature(key,flows) || !catalogEntry('person',team.leadId)) continue;
  for (const flow of flows) groups.set(flow.id,{key,destination});
 }
 return groups;
};

function procedureSelectionChanged(id, checked) {
 if (isInactiveProcedure(state.flows.find(flow => flow.id === id))) {
  procedureSelection.delete(id);
  return;
 }
 if (checked) procedureSelection.add(id);
 else procedureSelection.delete(id);
 const button = document.getElementById('explicitUnifyButton');
 if (button) {
  button.disabled = procedureSelection.size < 2;
  button.textContent = `Unificar procedimientos (${procedureSelection.size})`;
 }
}

const originalArchitectureEditBar = architectureMatrixEditBar;
architectureMatrixEditBar = function () {
 const bar = originalArchitectureEditBar();
 if (!architectureMatrixEditActive()) return bar;
 return bar + `<button class="btn" id="explicitUnifyButton" type="button"
  onclick="openExplicitProcedure([...procedureSelection],'unify')" ${procedureSelection.size < 2 ? 'disabled' : ''}>
  Unificar procedimientos (${procedureSelection.size})</button>`;
};

const originalArchitectureMatrix = renderBankMatrix;
renderBankMatrix = function () {
 const html = originalArchitectureMatrix();
 if (!architectureMatrixEditActive()) return html;
 const template = document.createElement('template');
 template.innerHTML = html;
 const table = template.content.querySelector('table');
 const col = document.createElement('col');
 col.style.width = '44px';
 table.querySelector('colgroup').prepend(col);
 const header = document.createElement('th');
 header.scope = 'col';
 header.textContent = 'Elegir';
 table.querySelector('thead tr').prepend(header);
 for (const row of table.querySelectorAll('tbody tr')) {
  const id = row.querySelector('[data-arch-row]')?.dataset.archRow;
  if (!id) continue;
  const cell = document.createElement('td');
  const check = document.createElement('input');
  check.type = 'checkbox';
  check.disabled = isInactiveProcedure(state.flows.find(flow => flow.id === id));
  check.checked = procedureSelection.has(id);
  check.setAttribute('aria-label', 'Seleccionar procedimiento para unificar');
  check.setAttribute('onchange', 'procedureSelectionChanged(this.dataset.id,this.checked)');
  check.dataset.id = id;
  cell.append(check);
  row.prepend(cell);
 }
 table.style.width = (parseFloat(table.style.width) + 44) + 'px';
 return template.innerHTML;
};

const originalArchitectureEditControl = architectureMatrixEditControl;
architectureMatrixEditControl = function (flow, key) {
 if (key !== 'procedureFinal') return originalArchitectureEditControl(flow, key);
 return `<div>${esc(architectureMatrixValue(flow,key) || 'Sin nombre final')}</div>
  <button class="btn" type="button" data-id="${esc(flow.id)}"
   onclick="event.stopPropagation();openExplicitProcedure([this.dataset.id],'rename')">Cambiar nombre</button>`;
};

function procedureOriginLabel(source) {
 const flow = state.flows.find(f => f.id === source.id);
 return flow ? ensureFlowMatrixMeta(flow).procedureOriginal || flow.name : source.title;
}

async function openExplicitProcedure(ids, mode) {
 if (mode === 'unify' && ids.some(id => isInactiveProcedure(state.flows.find(flow => flow.id === id)))) {
  return inputAlert('Los procedimientos inactivos se conservan como historial y no se pueden unificar.');
 }
 if (architectureMatrixEditActive() && architectureMatrixRecount().cells) {
  return inputAlert('Guarda o descarta los cambios pendientes de la matriz antes de revisar esta operación.');
 }
 if (mode === 'unify' && ids.length < 2) return;
 openModal('<h3>Consultando procedimientos y documentos relacionados…</h3>');
 try {
  const preview = await parent.afalProcedurePreview(ids);
  const destination = state.flows.find(f => f.id === preview.ids[0]);
  const group = destination && unifiedProcedure(destination);
  procedureFlowDraft = {
   mode, preview, requestId: crypto.randomUUID(), destination: group?.anchor.id || preview.ids[0],
   name: preview.sources[0].title, code: preview.sources[0].code,
   leadId: group?.lead?.id || '', companionId: group?.companion?.id || '', releaseCodes: false
  };
  showProcedureConfiguration();
 } catch (error) {
  inputAlert('No se pudo preparar la revisión. ' + error.message);
 }
}

function procedurePersonOptions(current, emptyLabel) {
 return `<option value="">${emptyLabel}</option>` + catalogList('person')
  .filter(p => p.active !== false || p.id === current)
  .slice().sort((a,b) => a.name.localeCompare(b.name,'es'))
  .map(p => `<option value="${esc(p.id)}" ${p.id === current ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

function showProcedureConfiguration() {
 const d = procedureFlowDraft;
 if (!d) return;
 const codes = [...new Set(d.preview.sources.map(s => s.code).filter(Boolean))];
 const documents = d.preview.documents;
 const sources = d.preview.sources.map(s => `<tr><td>${esc(procedureOriginLabel(s))}</td>
  <td>${esc(s.code || 'Sin código')}</td><td>${esc(s.title || 'Sin nombre final')}</td></tr>`).join('');
 openModal(`<h3>${d.mode === 'unify' ? 'Unificar procedimientos' : 'Cambiar nombre del procedimiento'}</h3>
  <section class="procedureSection"><div class="procedureSectionHead">Procedimiento final · ${d.preview.ids.length} fila(s) de origen</div>
  <div class="recordEditGrid">
   <div class="field"><label for="explicitDestination">Procedimiento destino y seguimiento vigente</label>
    <select id="explicitDestination" onchange="procedureDestinationChanged(this.value)">${d.preview.sources.map(s =>
     `<option value="${esc(s.id)}" ${s.id === d.destination ? 'selected' : ''}>${esc(procedureOriginLabel(s))}</option>`).join('')}</select></div>
   <div class="field"><label for="explicitCode">Código que se conserva</label><select id="explicitCode">
    ${codes.map(code => `<option ${code === d.code ? 'selected' : ''}>${esc(code)}</option>`).join('')}
    ${codes.length ? '' : '<option value="">Sin código asignado</option>'}</select></div>
   <div class="field"><label for="explicitName">Nombre final</label><input id="explicitName" maxlength="300" value="${esc(d.name)}"></div>
   ${d.preview.ids.length > 1 ? `<div class="field"><label for="explicitLead">Documentador titular obligatorio</label>
    <select id="explicitLead" required>${procedurePersonOptions(d.leadId,'Seleccionar titular…')}</select></div>
    <div class="field"><label for="explicitCompanion">Documentador acompañante</label>
    <select id="explicitCompanion">${procedurePersonOptions(d.companionId,'Sin acompañante')}</select></div>` : ''}
  </div></section>
  <section class="procedureSection"><div class="procedureSectionHead">Procedimientos que se integran</div>
   <div class="stakeholderDetailTableWrap"><table class="stakeholderDetailTable"><thead><tr><th>Origen</th><th>Código actual</th><th>Nombre final actual</th></tr></thead><tbody>${sources}</tbody></table></div></section>
  <section class="procedureSection"><div class="procedureSectionHead">Documentos y nomenclatura del Gestor</div>
   <p>${documents.filter(x => x.type === 'PRO').length} registros de procedimiento · ${documents.filter(x => x.type !== 'PRO').length} documentos relacionados · ${d.preview.files.length} archivos</p>
   ${codes.length > 1 ? `<label class="candidateItem"><input type="checkbox" id="explicitRelease" ${d.releaseCodes ? 'checked' : ''}>
    <span>Liberar los códigos del Gestor que se retiren por esta unificación</span></label>` : ''}
   <details><summary>Ver documentos involucrados</summary>${documents.map(x => `<p><b>${esc(x.code)}</b> · ${esc(x.name)}</p>`).join('') || '<p>Sin registros vinculados en el Gestor.</p>'}</details>
   ${d.preview.files.length ? `<label class="candidateItem"><input type="checkbox" id="explicitFiles" ${d.acknowledgeFiles ? 'checked' : ''}>
    <span>Revisaré los códigos y nombres dentro de los archivos. Los archivos de procedimientos retirados quedarán en su historial.</span></label>` : ''}
  </section>
  <p id="explicitError" class="mini" role="alert"></p>
  <div class="modalactions"><button class="btn" onclick="closeModal()">Cancelar</button>
   <button class="btn primary" onclick="reviewExplicitProcedure()">Revisar y confirmar →</button></div>`, {backdropDismissible:false});
 $('#modal').classList.add('architectureRecordModal');
}

function procedureDestinationChanged(id) {
 const source = procedureFlowDraft.preview.sources.find(s => s.id === id);
 if (!source) return;
 $('#explicitName').value = source.title;
 $('#explicitCode').value = source.code;
}

function reviewExplicitProcedure() {
 const d = procedureFlowDraft;
 Object.assign(d, {
  destination: $('#explicitDestination').value, name: $('#explicitName').value.trim(), code: $('#explicitCode').value,
  leadId: $('#explicitLead')?.value || '', companionId: $('#explicitCompanion')?.value || '',
  releaseCodes: !!$('#explicitRelease')?.checked, acknowledgeFiles: !!$('#explicitFiles')?.checked
 });
 const needsTeam = d.preview.ids.length > 1;
 if (!d.name || (needsTeam && !d.leadId) || (d.companionId && d.companionId === d.leadId)) {
  $('#explicitError').textContent = 'Define el nombre y un titular válido. El acompañante debe ser otra persona.';
  return;
 }
 if (d.preview.files.length && !d.acknowledgeFiles) {
  $('#explicitError').textContent = 'Confirma la revisión de la nomenclatura de los archivos.';
  return;
 }
 const retired = d.preview.documents.filter(x => x.type === 'PRO' && x.code !== d.code);
 openModal(`<h3>Confirmar ${d.mode === 'unify' ? 'unificación' : 'cambio de nombre'}</h3>
  <section class="procedureSection"><div class="procedureSectionHead">Identificación final</div>
   <div class="recordGrid"><div class="recordField"><b>Código</b><span>${esc(d.code || 'Pendiente de asignación')}</span></div>
   <div class="recordField"><b>Nombre final</b><span>${esc(d.name)}</span></div>
   <div class="recordField"><b>Seguimiento vigente</b><span>${esc(procedureOriginLabel(d.preview.sources.find(s => s.id === d.destination)))}</span></div>
   ${needsTeam ? `<div class="recordField"><b>Titular confirmado</b><span>${esc(catalogEntry('person',d.leadId)?.name)}</span></div>` : ''}</div></section>
  <section class="procedureSection"><div class="procedureSectionHead">Resultado de la operación</div>
   <p>${d.preview.ids.length} fila(s) conservarán su historial bajo la identificación final.</p>
   <p>${retired.length ? retired.map(x => esc(x.code)).join(' · ') + (d.releaseCodes ? ' · números que se liberarán' : ' · registros retirados con número reservado') : 'Se conserva la nomenclatura actual.'}</p>
   <p>Los documentos relacionados se reasignarán al registro final del Gestor.</p></section>
  <label class="candidateItem"><input type="checkbox" id="explicitConfirm" onchange="document.getElementById('explicitSave').disabled=!this.checked">
   <span>Confirmo el destino, el equipo final y el tratamiento de los códigos.</span></label>
  <p id="explicitSaveError" role="alert"></p><div class="modalactions">
   <button class="btn" onclick="showProcedureConfiguration()">← Volver</button>
   <button class="btn primary" id="explicitSave" disabled onclick="saveExplicitProcedure()">Confirmar y guardar</button></div>`,{backdropDismissible:false});
}

async function saveExplicitProcedure() {
 const d = procedureFlowDraft;
 const button = $('#explicitSave');
 if (!d || !button || button.disabled || !$('#explicitConfirm').checked) return;
 button.disabled = true;
 try {
  await parent.afalConfirmProcedure({
   ids:d.preview.ids, fingerprint:d.preview.fingerprint, requestId:d.requestId, mode:d.mode,
   destination:d.destination, name:d.name, code:d.code, leadId:d.leadId, companionId:d.companionId,
   releaseCodes:d.releaseCodes, acknowledgeFiles:d.acknowledgeFiles
  });
  // A complete reread applies the committed versions in both the matrix and planning.
  const target = d.destination;
  procedureFlowDraft = null;
  procedureSelection.clear();
  state.bankEdit = null;
  if (!await loadShared()) throw Error('El guardado terminó. Recarga AFAL para actualizar la vista.');
  openArchitectureRecord(target);
 } catch (error) {
  const notice = $('#explicitSaveError');
  if (notice) {
   notice.textContent = error.message;
   const refresh = document.createElement('button');
   refresh.className = 'btn';
   refresh.textContent = 'Actualizar revisión';
   refresh.addEventListener('click',() => openExplicitProcedure(d.preview.ids,d.mode));
   notice.append(document.createElement('br'),refresh);
  }
  else inputAlert(error.message);
  if (procedureFlowDraft) button.disabled = false;
 }
}

// Keep older entry points on the same reviewed transaction.
unifySelected = function () { openExplicitProcedure(state.selected,'unify'); };
openUnifySubprocess = function (id) {
 openModal(`<h3>Unificar procedimientos</h3><p>Selecciona las filas de origen en Editar matriz y pulsa Unificar procedimientos.</p>
  <div class="modalactions"><button class="btn" onclick="closeModal();state.view='bank';render()">Ir a la matriz</button></div>`);
};

const originalUnifiedProcedureCard = openUnifiedProcedure;
openUnifiedProcedure = function (group, edit = false) {
 originalUnifiedProcedureCard(group, edit);
 const actions = $('#modal .modalactions');
 if (!edit && actions) actions.insertAdjacentHTML('afterbegin',
  `<button class="btn" data-id="${esc(group.anchor.id)}" onclick="openExplicitProcedure([this.dataset.id],'rename')">Cambiar nombre / revisar unificación</button>`);
 const events = (parent.afalProcedureHistory || []).filter(event => event.sourceIds.includes(group.anchor.id));
 if (!events.length) return;
 const summary = $('#modal .procedureSummary');
 summary?.insertAdjacentHTML('beforeend', `<section class="procedureSection"><div class="procedureSectionHead">Confirmaciones y códigos anteriores</div>
  ${events.map(event => `<details><summary>${esc(new Date(event.createdAt).toLocaleString('es-MX'))} · ${esc(event.final.code)}</summary>
   <p>${esc(event.final.name)}</p>${event.before.sources.map(source => `<p>${esc(procedureOriginLabel(source))} · ${esc(source.code || 'Sin código')} · ${esc(source.title)}</p>`).join('')}
   <p>${event.final.releaseCodes ? 'Códigos anteriores liberados según confirmación.' : 'Códigos anteriores conservados según confirmación.'}</p></details>`).join('')}</section>`);
};

const originalEditUnifiedTeam = editUnifiedProcedureTeam;
editUnifiedProcedureTeam = function (id) {
 if ((parent.afalProcedureHistory || []).some(event => event.sourceIds.includes(id))) {
  return openExplicitProcedure([id],'rename');
 }
 return originalEditUnifiedTeam(id);
};

const originalArchitectureRecord = openArchitectureRecord;
openArchitectureRecord = function (id, edit = false, origin = false) {
 originalArchitectureRecord(id,edit,origin);
 const nameInput = $('#recordProcedureFinal');
 if (edit && nameInput) {
  nameInput.readOnly = true;
  nameInput.setAttribute('aria-label','Nombre final; usa Cambiar nombre desde la ficha');
 }
 const flow = state.flows.find(f => f.id === id);
 if (!edit && !origin && flow && !unifiedProcedure(flow)) {
  $('#modal .modalactions')?.insertAdjacentHTML('afterbegin',
   `<button class="btn" data-id="${esc(id)}" onclick="openExplicitProcedure([this.dataset.id],'rename')">Cambiar nombre</button>`);
 }
};
