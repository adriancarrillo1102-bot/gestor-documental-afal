// Consultation uses a canvas viewer, never a browser PDF iframe with save/print controls.
let library;
const contexts=new WeakMap();
export async function mountConsultationPdf(host,blob,isCurrent=()=>true){
 const old=contexts.get(host);if(old){old.cancelled=true;old.render?.cancel();await old.pdf?.destroy()}
 const ctx={page:1,zoom:1,cancelled:false,serial:0,pdf:null,render:null};contexts.set(host,ctx);
 host.innerHTML='<div class="empty-detail" role="status">Preparando vista de consulta…</div>';
 library ||= import('./vendor/pdf.min.mjs');const lib=await library;lib.GlobalWorkerOptions.workerSrc=new URL('./vendor/pdf.worker.min.mjs',import.meta.url).href;
 const pdf=await lib.getDocument({data:new Uint8Array(await blob.arrayBuffer()),isEvalSupported:false,enableXfa:false}).promise;
 if(!isCurrent()||ctx.cancelled){await pdf.destroy();return}ctx.pdf=pdf;
 host.innerHTML='<div class="consultation-pdf-controls"><button type="button" class="secondary" data-page="prev" aria-label="Página anterior">←</button><span class="consultation-page-label" role="status"></span><button type="button" class="secondary" data-page="next" aria-label="Página siguiente">→</button><button type="button" class="secondary" data-page="out" aria-label="Reducir documento">−</button><button type="button" class="secondary" data-page="in" aria-label="Ampliar documento">+</button><span class="status">Solo consulta</span></div><div class="consultation-canvas-wrap"><canvas aria-label="Página del documento"></canvas></div>';
 const canvas=host.querySelector('canvas'),wrap=host.querySelector('.consultation-canvas-wrap'),label=host.querySelector('.consultation-page-label'),buttons=[...host.querySelectorAll('[data-page]')];
 host.oncontextmenu=e=>e.preventDefault();
 async function draw(){if(ctx.cancelled||!isCurrent())return;const serial=++ctx.serial;buttons.forEach(b=>b.disabled=true);try{
  const p=await pdf.getPage(ctx.page),base=p.getViewport({scale:1}),scale=Math.max(.2,Math.min(2.5,(Math.max(260,wrap.clientWidth-32)/base.width)*ctx.zoom)),vp=p.getViewport({scale}),ratio=Math.min(window.devicePixelRatio||1,2);
  if(serial!==ctx.serial||!isCurrent()||ctx.cancelled)return;
  canvas.width=Math.floor(vp.width*ratio);canvas.height=Math.floor(vp.height*ratio);canvas.style.width=vp.width+'px';canvas.style.height=vp.height+'px';
  ctx.render=p.render({canvasContext:canvas.getContext('2d'),viewport:vp,transform:ratio===1?null:[ratio,0,0,ratio,0,0]});await ctx.render.promise;
  label.textContent=`Página ${ctx.page} de ${pdf.numPages}`;
 }finally{if(!ctx.cancelled&&serial===ctx.serial){buttons.forEach(b=>b.disabled=false);host.querySelector('[data-page="prev"]').disabled=ctx.page===1;host.querySelector('[data-page="next"]').disabled=ctx.page===pdf.numPages}}}
 for(const b of buttons)b.onclick=async()=>{if(b.dataset.page==='prev')ctx.page=Math.max(1,ctx.page-1);if(b.dataset.page==='next')ctx.page=Math.min(pdf.numPages,ctx.page+1);if(b.dataset.page==='in')ctx.zoom=Math.min(2,ctx.zoom+.2);if(b.dataset.page==='out')ctx.zoom=Math.max(.5,ctx.zoom-.2);try{await draw()}catch{label.textContent='No se pudo mostrar esta página'}};
 await draw();
}
