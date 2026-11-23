// Explicit final identities override historical display aliases; confirmed groups retain their shared key.
let explicitIdentityEdits=null,explicitIdentityCount=-1,explicitIdentityIds=new Set();
function hasExplicitFinalIdentity(id){
 const edits=parent.afalTrialEdits;if(!Array.isArray(edits))return false;
 if(edits!==explicitIdentityEdits||edits.length!==explicitIdentityCount){explicitIdentityEdits=edits;explicitIdentityCount=edits.length;explicitIdentityIds=new Set(edits.filter(e=>e.key.startsWith('matrix:')&&Object.prototype.hasOwnProperty.call(e.payload||{},'procedureFinal')).map(e=>e.key.slice(7)));}
 return explicitIdentityIds.has(id);
}
const currentIdentityDocumentKey=implementationDocumentKey;
implementationDocumentKey=function(flow,confirmed=confirmedMatrixUnifications()){
 if(confirmed.has(flow.id))return currentIdentityDocumentKey(flow,confirmed);
 const explicit=hasExplicitFinalIdentity(flow.id);
 if(!explicit)return currentIdentityDocumentKey(flow,confirmed);
 const meta=ensureFlowMatrixMeta(flow);
 return 'current-identity:'+JSON.stringify([normText(meta.macroFinal||meta.macroOriginal),normText(meta.processFinal||meta.processOriginal),normText(meta.procedureNumber),normText(meta.procedureFinal||meta.procedureOriginal||flow.name)]);
};

// Separation concerns every original member, including inactive origins; this does not change planning eligibility.
function procedureSeparationGroup(id){
 const flow=state.flows.find(f=>f.id===id);if(!flow)return null;
 const meta=ensureFlowMatrixMeta(flow),key=matrixUnifiedKey(meta),known=unifiedProcedure(flow);
 let sources=key?architectureRows(true).filter(f=>matrixUnifiedKey(ensureFlowMatrixMeta(f))===key):known?.sources||[];
 if(!key){
  const history=[...(parent.afalProcedureHistory||[]).map(e=>({ids:e.sourceIds,name:e.final.name,code:e.final.code,anchor:e.destination,key:'explicit-final:'+e.id})),...(parent.afalSeparationHistory||[]).map(e=>({ids:e.final.remainingIds,name:e.final.remainingName,code:e.final.remainingCode,anchor:e.remainingAnchor,key:e.final.remainingKey}))];
  const event=history.reverse().find(e=>!e.code&&e.ids.includes(id)&&e.name===meta.procedureFinal);
  if(event)sources=event.ids.map(source=>state.flows.find(f=>f.id===source)).filter(f=>f&&ensureFlowMatrixMeta(f).procedureNumber===''&&ensureFlowMatrixMeta(f).procedureFinal===event.name);
 }
 if(sources.length<2)return null;
 const ids=sources.map(f=>f.id).sort();
 const confirmed=sources.find(f=>{const team=readImplementationFor(f.id).unifiedDocumentationTeam;try{return !!catalogEntry('person',team?.leadId)&&JSON.stringify(JSON.parse(team.signature)[1])===JSON.stringify(ids);}catch{return false;}});
 const anchor=confirmed||sources.find(f=>f.id===known?.anchor.id)||sources.slice().sort((a,b)=>implementationRecordScore(b.id)-implementationRecordScore(a.id)||a.id.localeCompare(b.id))[0];
 const team=readImplementationFor(anchor.id).unifiedDocumentationTeam;
 return {sources,anchor,key:key||known?.key||'',signature:team?.signature||'',lead:catalogEntry('person',team?.leadId)||known?.lead||null,companion:catalogEntry('person',team?.companionId)||known?.companion||null};
}
function installProcedureSeparationAction(id){
 if(parent.afalCanEdit===false||!procedureSeparationGroup(id))return;
 const modal=document.getElementById('modal');if(!modal)return;
 modal.querySelectorAll('[data-separation-actions]').forEach(el=>el.remove());
 for(const button of modal.querySelectorAll('button'))if(button.textContent.trim()==='Separar procedimiento')button.remove();
 const actions=document.createElement('div');actions.dataset.separationActions='true';actions.style.cssText='display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 0 14px;border-bottom:1px solid #d7e0e6;margin-bottom:12px';
 const button=document.createElement('button');button.type='button';button.className='btn primary';button.textContent='Separar procedimiento';button.dataset.separationFlow=id;button.onclick=()=>openProcedureSeparation(id);
 const note=document.createElement('span');note.className='mini';note.textContent='Revisar qué origen sale del grupo, su código y su titular.';actions.append(button,note);
 const heading=modal.querySelector('h3');if(heading)heading.insertAdjacentElement('afterend',actions);else modal.prepend(actions);
}
const visibleSeparationArchitecture=openArchitectureRecord;
openArchitectureRecord=function(id,edit=false,origin=false){const result=visibleSeparationArchitecture(id,edit,origin);if(!edit)installProcedureSeparationAction(id);return result;};
const visibleSeparationUnified=openUnifiedProcedure;
openUnifiedProcedure=function(group,edit=false){const result=visibleSeparationUnified(group,edit);if(!edit)installProcedureSeparationAction(group.anchor.id);return result;};
const visibleSeparationImplementation=openImplementationDetail;
openImplementationDetail=function(id,focus=false){const result=visibleSeparationImplementation(id,focus);installProcedureSeparationAction(id);return result;};
