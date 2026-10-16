import {unzipSync,zipSync,strFromU8,strToU8} from 'npm:fflate@0.8.3';
import {normalizeSheet,normalizeWord,LAYOUT_VERSION} from './print-layout.mjs';
export function prepareOffice(bytes:Uint8Array,extension:string){
 if(!['xlsx','xlsm','docx'].includes(extension))return {bytes,layout:{version:LAYOUT_VERSION,mode:'native'}};
 let total=0,count=0;const files=unzipSync(bytes,{filter:file=>{total+=file.originalSize;count++;if(total>64*1024*1024||count>5000)throw Error('El contenido descomprimido supera el límite de preparación');return true}});
 let sheets=0,sections=0;
 for(const name of Object.keys(files)){
  if(/^xl\/worksheets\/sheet\d+\.xml$/.test(name)){files[name]=strToU8(normalizeSheet(strFromU8(files[name])).xml);sheets++}
  if(name==='word/document.xml'){files[name]=strToU8(normalizeWord(strFromU8(files[name])));sections++}
 }
 const entries:Record<string,any>={};for(const [name,data] of Object.entries(files))entries[name]=[data,{level:/\.xml$|\.rels$/.test(name)?1:0}];
 return {bytes:zipSync(entries),layout:{version:LAYOUT_VERSION,mode:'normalized',sheets,sections,original_unchanged:true}};
}
