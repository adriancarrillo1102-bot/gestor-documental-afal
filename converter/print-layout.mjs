export const LAYOUT_VERSION='afal-print-20261016-1';
function setAttr(tag,name,value){const re=new RegExp('\\s'+name+'="[^"]*"','g');return tag.replace(re,'').replace(/\s*(\/?)>$/,` ${name}="${value}"$1>`)}
function bounded(value,min,max,fallback){const n=Number(value);return Number.isFinite(n)?Math.max(min,Math.min(max,n)):fallback}
export function normalizeSheet(xml){
 let changes=0;const prefix=xml.match(/<((?:[\w-]+:)?)(?:worksheet)\b/)?.[1]||'',attrs=(tag,k)=>tag.match(new RegExp('\\s'+k+'="([^"]*)"'))?.[1];
 const m=xml.match(/<(?:\w+:)?pageMargins\b[^>]*\/>/),old=m?.[0]||`<${prefix}pageMargins/>`;
 let margins=old;
 for(const [k,min,max,fallback] of [['left',.35,1,.4],['right',.35,1,.4],['top',.5,1,.5],['bottom',.5,1,.5],['header',.15,.3,.2],['footer',.15,.3,.2]])margins=setAttr(margins,k,bounded(attrs(old,k),min,max,fallback));
 const later='headerFooter|rowBreaks|colBreaks|customProperties|cellWatches|ignoredErrors|smartTags|drawing|legacyDrawing|legacyDrawingHF|picture|oleObjects|controls|webPublishItems|tableParts|extLst';
 if(m)xml=xml.replace(old,margins);else xml=xml.replace(new RegExp('(<(?:\\w+:)?(?:pageSetup|'+later+')\\b|<\\/(?:\\w+:)?worksheet>)'),margins+'$1');
 const p=xml.match(/<(?:\w+:)?pageSetup\b[^>]*\/>/);let setup=p?.[0]||`<${prefix}pageSetup/>`;
 setup=setup.replace(/\sscale="[^"]*"/g,'');setup=setAttr(setAttr(setup,'fitToWidth',1),'fitToHeight',0);
 if(!/\sorientation="(?:portrait|landscape)"/.test(setup)){
  const last=xml.match(/<dimension\b[^>]*ref="(?:[^:"]+:)?([A-Z]+)\d+"/)?.[1]||'A';let cols=0;for(const c of last)cols=cols*26+c.charCodeAt(0)-64;setup=setAttr(setup,'orientation',cols>8?'landscape':'portrait');
 }
 if(p)xml=xml.replace(p[0],setup);else xml=xml.replace(new RegExp('(<(?:\\w+:)?(?:'+later+')\\b|<\\/(?:\\w+:)?worksheet>)'),setup+'$1');
 if(/<(?:\w+:)?sheetPr\b/.test(xml)){
  xml=xml.replace(/<((?:\w+:)?sheetPr)\b([^>]*)\/>/,`<$1$2><${prefix}pageSetUpPr fitToPage="1"/></$1>`);
  if(/<(?:\w+:)?pageSetUpPr\b/.test(xml))xml=xml.replace(/<(?:\w+:)?pageSetUpPr\b[^>]*>/,t=>setAttr(t,'fitToPage',1));
  else xml=xml.replace(/(<\/(?:\w+:)?sheetPr>)/,`<${prefix}pageSetUpPr fitToPage="1"/>$1`);
 }else xml=xml.replace(/(<(?:\w+:)?worksheet\b[^>]*>)/,`$1<${prefix}sheetPr><${prefix}pageSetUpPr fitToPage="1"/></${prefix}sheetPr>`);
 return {xml,marginPolicy:'laterales 8.9-25.4 mm; superior/inferior 12.7-25.4 mm',fit:'un ancho de página, alto libre',changed:++changes};
}
export function normalizeWord(xml){return xml.replace(/<w:pgMar\b[^>]*\/>/g,tag=>{for(const k of ['top','right','bottom','left']){const v=tag.match(new RegExp('w:'+k+'="([^"]*)"'))?.[1];tag=setAttr(tag,'w:'+k,bounded(v,720,1800,720))}return tag})}
