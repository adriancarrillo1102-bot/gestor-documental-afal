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
 const tutorials=[...document.querySelectorAll('.context-tutorial')];
 function render(t){const steps=t._steps,s=steps[t._current],r=s.rect;
 t.querySelector('img').src=s.src;t.querySelector('img').alt='Pantalla de referencia: '+s.path;
 t.querySelector('.context-path').textContent=s.path;
 const box=t.querySelector('.context-focus');['left','top','width','height'].forEach((key,i)=>box.style[key]=r[i]+'%');
 t.querySelector('.context-number').textContent=t._current+1;
 t.querySelector('.context-count').textContent='PASO '+(t._current+1)+' DE '+steps.length;
 t.querySelector('h3').textContent=s.label;t.querySelector('.context-bubble p').textContent=s.instruction;
 t.querySelector('.context-position').textContent=(t._current+1)+' / '+steps.length;
 t.querySelector('.context-prev').disabled=t._current===0;
 t.querySelector('.context-next').textContent=t._current===steps.length-1?'Volver al inicio':'Siguiente paso';
 }
 tutorials.forEach(t=>{t._steps=JSON.parse(t.dataset.steps);t._current=0;render(t);
 t.querySelector('.context-prev').onclick=()=>{if(t._current>0)t._current--;render(t)};
 t.querySelector('.context-next').onclick=()=>{t._current=(t._current+1)%t._steps.length;render(t)};
 t.querySelector('.context-zoom').onclick=()=>{const body=document.getElementById('captureDialogBody');
 body.replaceChildren(t.querySelector('.context-frame').cloneNode(true),t.querySelector('.context-bubble').cloneNode(true));
 document.getElementById('captureDialogTitle').textContent=t._steps[t._current].path;captureOpener=t.querySelector('.context-zoom');dialog.showModal()};
 });
 document.getElementById('closeCapture').onclick=()=>dialog.close();
 dialog.addEventListener('close',()=>{document.getElementById('captureDialogBody').replaceChildren();captureOpener?.focus()});
})();
