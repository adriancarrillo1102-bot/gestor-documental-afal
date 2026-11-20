// Isolated browser regression test. No production accounts, data or network writes.
const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict'),vm=require('node:vm');
const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'C:/Users/afigueroa/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root=path.resolve(__dirname,'..');
const html=fs.readFileSync(path.join(root,'afal/workspace.html'),'utf8');
for(const match of html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g))if(match[1].trim())new vm.Script(match[1]);
const flow=(id,wave)=>({id,name:'Procedimiento '+id,architectureRow:true,macroId:'macro',processId:'process',laneId:'lane',sources:[],matrix:{macroOriginal:'Macro',macroFinal:'Macro',processOriginal:'Proceso',processFinal:'Proceso',procedureOriginal:'Procedimiento '+id,procedureFinal:'Procedimiento '+id,procedureNumber:'TEST-'+id,implementationWave:wave,status:'No Iniciado',completedDate:''}});
const values=[flow('one','Ola 1'),flow('two','Ola 1'),flow('three','Ola 3'),flow('four','Ola 3')];
const snapshot={docs:[...values.map(value=>({_docId:'flow_'+value.id,entityType:'flow',value})),{_docId:'macro_macro',entityType:'macro',value:{id:'macro',name:'Macro',lanes:[{id:'mlane',name:'Carril'}]}},{_docId:'process_process',entityType:'process',value:{id:'process',macroId:'macro',name:'Proceso',lanes:[{id:'lane',name:'Carril'}]}},{_docId:'settings_project',entityType:'settings',value:{prework:Object.fromEntries(['one','two','three'].map(id=>[id,{flowAdjustmentStatus:'completed'}])),implementation:{one:{completedDate:'2026-11-10',sections:{cover:'Validado'}}}}}]};
const server=http.createServer((req,res)=>{
 const file=req.url.split('?')[0];
 if(file.startsWith('/afal/')){const target=path.join(root,file);if(fs.existsSync(target)){res.setHeader('Content-Type',file.endsWith('.js')?'application/javascript':'text/html; charset=utf-8');return res.end(fs.readFileSync(target));}res.writeHead(404);return res.end();}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.end(`<script>window.afalTrialSnapshot=${JSON.stringify(snapshot)};window.afalTrialEdits=[];window.afalCanEdit=true;window.afalProcedureHistory=[];window.savedChanges=[];window.failWrites=false;window.afalTrialCommit=async changes=>{if(window.failWrites)throw Error('Prueba de fallo de guardado');for(const c of changes){window.savedChanges.push(c);const old=window.afalTrialEdits.find(e=>e.key===c.key);if(old)old.payload={...old.payload,...c.payload};else window.afalTrialEdits.push({...c,version:1})}};</script><iframe src="/afal/workspace.html" style="width:100%;height:950px;border:0"></iframe>`);
});
(async()=>{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const browser=await chromium.launch({executablePath:process.env.EDGE_BINARY||'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',headless:true});
 try{
  const page=await browser.newPage({viewport:{width:1600,height:1050}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.route(/^https?:\/\/(?!127\.0\.0\.1)/,r=>r.abort());
  await page.goto('http://127.0.0.1:'+server.address().port);
  await page.frameLocator('iframe').locator('body').waitFor();
  const frame=page.frames().find(f=>f.url().includes('/afal/workspace.html'));
  await frame.waitForFunction(()=>state.flows.length===4);
  const before=await frame.evaluate(()=>{
   const f=state.flows.find(f=>f.id==='one');
   state.projectImplementation.one={...implementationDefault(),sections:Object.fromEntries(IMPLEMENTATION_SECTION_KEYS.map(k=>[k,'Validado'])),completedDate:'2026-11-10',releasedBy:'reviewer'};
   f.matrix.status='Validado';f.matrix.completedDate='2026-11-10';
   state.projectWave='General';state.view='bank';pool9BeginUnlocked();
   return {active:architectureRows().length,ledger:architectureRows(true).length,implementation:implementationRows().length};
  });
  assert.deepEqual(before,{active:4,ledger:4,implementation:3});
  const status=frame.locator('[data-arch-row="one"][data-arch-cell="status"] select');
  assert.equal(await status.isEnabled(),true);
  assert.deepEqual(await status.locator('option').evaluateAll(es=>es.map(e=>e.value)),['','Validado','Inactivo']);
  await status.selectOption('Inactivo');
  await frame.locator('[data-arch-row="four"][data-arch-cell="status"] select').selectOption('Inactivo');
  assert.equal(await frame.evaluate(()=>architectureRows().length),4,'drafts must not alter totals');
  await frame.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await page.evaluate(()=>window.failWrites=true);
  await frame.getByRole('button',{name:'Confirmar y guardar',exact:true}).click();
  assert.equal(await frame.evaluate(()=>architectureRows().length),4,'failed save must retain active data');
  assert.equal(await frame.evaluate(()=>architectureMatrixEditActive()),true);
  await frame.getByRole('button',{name:'Cerrar',exact:true}).click();
  await page.evaluate(()=>window.failWrites=false);
  await frame.getByRole('button',{name:'Guardar cambios',exact:true}).click();
  await frame.getByRole('button',{name:'Confirmar y guardar',exact:true}).click();
  await frame.waitForFunction(()=>!architectureMatrixEditActive());
  const after=await frame.evaluate(()=>({active:architectureRows().length,ledger:architectureRows(true).length,implementation:implementationRows().length,weights:implementationDocumentUnits(architectureRows()).reduce((n,u)=>n+u.architectureWeight,0),status:architectureStatusSnapshot(state.flows.find(f=>f.id==='one')).status,completed:state.flows.find(f=>f.id==='one').matrix.completedDate,counts:inactiveProcedureCounts(),notes:inactiveReportLabel(),wave:inactiveReportLabel(inactiveProcedureCounts(),'Ola 3'),process:orderedFlows('process').length,people:personReportData().length}));
  assert.deepEqual(after,{active:2,ledger:4,implementation:2,weights:2,status:'Inactivo',completed:'2026-11-10',counts:{all:2,byWave:{'Ola 1':1,'Ola 3':1}},notes:'Inactivos: 02',wave:'Inactivos: 01',process:2,people:2});
  assert.equal(await frame.locator('.architectureInactiveRow').count(),2);
  const columnCounts=await frame.locator('.bankMatrix').evaluate(table=>({header:table.querySelector('thead tr').cells.length,rows:[...table.querySelectorAll('tbody tr')].map(row=>row.cells.length)}));
  assert.equal(columnCounts.rows.every(count=>count===columnCounts.header),true,'all history rows must retain every column');
  const colors=await frame.locator('.architectureInactiveRow .archStatusInactive .architectureStatusBadge').first().evaluate(el=>({background:getComputedStyle(el).backgroundColor,color:getComputedStyle(el).color,row:getComputedStyle(el.closest('td')).backgroundColor}));
  assert.deepEqual(colors,{background:'rgb(0, 0, 0)',color:'rgb(255, 255, 255)',row:'rgb(226, 228, 231)'});
  const rowColors=await frame.locator('.architectureInactiveRow').first().locator('td').evaluateAll(es=>es.map(e=>({key:e.dataset.archCell||e.className,color:getComputedStyle(e).backgroundColor})));
  assert.equal(rowColors.every(c=>c.color==='rgb(226, 228, 231)'),true,JSON.stringify(rowColors));
  const notes=await frame.evaluate(()=>{
   executiveUI.wave='all';const monthly=executiveContent();state.reportExportMode='architecture';const helper=buildBankDownloadHelperHtml();
   const match=helper.match(/var REPORT_DATA=(.*?);\n/);const report=JSON.parse(match[1]);
   weeklyUI.wave='all';const week=weeklySnapshot();const weekly=weeklySheetHtml(week,weeklyDefaults());
   return {monthly:monthly.includes('Inactivos: 02'),weekly:weekly.includes('Inactivos: 02'),reportRows:report.sheets[0].rows.length,meta:report.sheets[0].meta,person:renderPersonReport().includes('inactiveNote'),cut:inactiveReportLabel({all:5,byWave:{'Ola 1':3}},'all'),legacy:inactiveReportLabel(null)};
  });
  assert.equal(notes.monthly,true);assert.equal(notes.weekly,true);assert.equal(notes.reportRows,2);assert.match(notes.meta,/Inactivos: 02/);assert.equal(notes.person,true);assert.equal(notes.cut,'Inactivos: 05');assert.match(notes.legacy,/sin registro/);
  await frame.evaluate(()=>{state.view='bank';render()});
  await frame.locator('.bankMatrixWrap').evaluate(el=>{el.scrollLeft=1850});
  await page.screenshot({path:path.join(root,'tests/inactive-matrix.png')});
  await frame.evaluate(()=>{state.projectSection='reports';weeklyUI.tab='people';state.view='project';renderProjectView()});
  const peopleFrame=frame.frameLocator('iframe[title="Avance por persona"]');
  await assert.doesNotReject(()=>peopleFrame.locator('#inactiveNote').waitFor());
  assert.equal(await peopleFrame.locator('#inactiveNote').innerText(),'Inactivos: 02');
  await peopleFrame.locator('#wave').selectOption({label:'Ola 1'});
  assert.equal(await peopleFrame.locator('#inactiveNote').innerText(),'Inactivos: 01');
  await frame.goto(frame.url());await frame.waitForFunction(()=>state.flows.length===4);
  assert.equal(await frame.evaluate(()=>architectureRows().length),2,'inactive status must survive reload');
  assert.equal(await frame.evaluate(()=>architectureRows(true).length),4);
  await frame.evaluate(()=>{state.view='bank';pool9BeginUnlocked()});
  await frame.locator('[data-arch-row="four"][data-arch-cell="status"] select').selectOption('No Iniciado');
  await frame.getByRole('button',{name:'Guardar cambios',exact:true}).click();await frame.getByRole('button',{name:'Confirmar y guardar',exact:true}).click();
  await frame.waitForFunction(()=>architectureRows().length===3);
  assert.equal(await frame.evaluate(()=>inactiveReportLabel()),'Inactivos: 01');
  const unified=await frame.evaluate(()=>{
   const sources=state.flows.filter(f=>['two','three'].includes(f.id));
   for(const f of sources){f.matrix.procedureNumber='TEST-UNIFIED';f.matrix.procedureFinal='Procedimiento compartido'}
   state.personCatalog.push({id:'lead',name:'Documentador prueba',active:true});
   const key=matrixUnifiedKey(sources[0].matrix);
   state.projectImplementation.two={...implementationDefault(),unifiedDocumentationTeam:{signature:matrixUnifiedSignature(key,sources),leadId:'lead'}};
   const before=implementationDocumentUnits(architectureRows()).length;
   sources[0].matrix.status='Inactivo';
   const units=implementationDocumentUnits(architectureRows());
   return {before,after:units.length,gross:units.reduce((n,u)=>n+u.architectureWeight,0),inactiveShown:units.some(u=>u.f.id==='two'||u.sourceIds.includes('two')),history:state.flows.length};
  });
  assert.deepEqual(unified,{before:2,after:2,gross:2,inactiveShown:false,history:4});
  assert.deepEqual(errors,[]);
  console.log(JSON.stringify({pass:true,before,after,notes,checks:'draft isolation, failed save, commit, retained history/date, active counts and units, scoped report notes, styling, reload, reactivation'}));
 }finally{await browser.close();server.close()}
})().catch(error=>{console.error(error);server.close();process.exitCode=1});
