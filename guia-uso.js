'use strict';
(() => {
 const search=document.getElementById('faqSearch'),role=document.getElementById('faqRole');
 const questions=[...document.querySelectorAll('.faq-item')],categories=[...document.querySelectorAll('.faq-category')];
 const norm=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().trim();
 const index=new Map(questions.map(item=>[item,norm(item.textContent)]));
 function filter(){
  const words=norm(search.value).split(/\s+/).filter(Boolean);
  for(const item of questions){const matches=words.every(word=>index.get(item).includes(word));const access=role.value==='all'||(role.value==='admin'?item.dataset.role==='admin':item.dataset.role==='all');item.hidden=!(matches&&access)}
  for(const section of categories)section.hidden=![...section.querySelectorAll('.faq-item')].some(item=>!item.hidden);
  const count=questions.filter(item=>!item.hidden).length;
  document.getElementById('faqCount').textContent=count+' de '+questions.length+' preguntas';
  document.getElementById('noResults').hidden=count!==0;
 }
 function revealHash(){
  const id=decodeURIComponent(location.hash.slice(1));if(!id)return;
  const target=document.getElementById(id);if(!target)return;
  search.value='';role.value='all';filter();
  if(target.matches('.faq-item'))target.open=true;
  target.scrollIntoView({block:'start'});
 }
 search.addEventListener('input',filter);role.addEventListener('change',filter);
 document.getElementById('clearSearch').addEventListener('click',()=>{search.value='';role.value='all';filter();search.focus()});
 document.getElementById('expandAll').addEventListener('click',()=>questions.filter(item=>!item.hidden).forEach(item=>item.open=true));
 document.getElementById('collapseAll').addEventListener('click',()=>questions.forEach(item=>item.open=false));
 window.addEventListener('hashchange',revealHash);
 filter();revealHash();
 const dialog=document.getElementById('captureDialog');let captureOpener=null;
 document.addEventListener('click',event=>{
  const button=event.target.closest('.enlarge-capture');if(!button)return;
  const figure=button.closest('.guide-capture'),body=document.getElementById('captureDialogBody');
  body.replaceChildren();const stage=figure.querySelector('.capture-stage').cloneNode(true);
  // Evita duplicar IDs de marcadores SVG al mostrar la imagen ampliada.
  for(const node of stage.querySelectorAll('[id]'))node.id='zoom-'+node.id;
  for(const node of stage.querySelectorAll('[marker-end]'))node.setAttribute('marker-end',node.getAttribute('marker-end').replace('url(#','url(#zoom-'));
  body.append(stage,figure.querySelector('.capture-legend').cloneNode(true));
  document.getElementById('captureDialogTitle').textContent=figure.querySelector('figcaption').textContent;
  captureOpener=button;dialog.showModal();
 });
 document.getElementById('closeCapture').addEventListener('click',()=>dialog.close());
 dialog.addEventListener('close',()=>{document.getElementById('captureDialogBody').replaceChildren();captureOpener?.focus()});
})();
