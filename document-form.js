// Public form rules only. Responsible names are fetched from the private catalog.
export function numericVersion(value){
 const text=String(value??'').trim();
 return /^\d+$/.test(text)&&Number.isSafeInteger(Number(text))?String(Number(text)).padStart(2,'0'):'';
}
export function versionChoices(value='',allowLegacy=false,exact=false){
 const raw=String(value??'').trim(),normalized=numericVersion(raw);
 const options=Array.from({length:100},(_,i)=>({value:String(i).padStart(2,'0'),label:String(i).padStart(2,'0')}));
 const selected=exact?raw:normalized||(allowLegacy?raw:'');
 if(selected&&!options.some(o=>o.value===selected))options.push({value:selected,label:selected+(normalized?'':' · Actual')});
 return {options,value:selected};
}
export function nextVersion(files,metadataVersion=''){
 const ready=files.filter(f=>f.state==='ready'),numbers=ready.map(f=>numericVersion(f.version)).filter(Boolean).map(Number);
 if(numbers.length)return String(Math.max(...numbers)+1).padStart(2,'0');
 if(ready.length)return '';
 if(!metadataVersion||metadataVersion==='Sin identificar')return '00';
 return numericVersion(metadataVersion);
}
export function calendarDate(value){
 const text=String(value??'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(text))return '';
 const date=new Date(text+'T12:00:00Z');
 return !Number.isNaN(date.getTime())&&date.toISOString().slice(0,10)===text?text:'';
}
export function emissionDate(input,previous=''){
 return input||previous||'';
}
export function choiceWithHistory(values,current=''){
 const raw=String(current??'').trim(),options=values.map(v=>({value:String(v),label:String(v)}));
 if(raw&&!options.some(o=>o.value===raw))options.push({value:raw,label:raw+' · Actual'});
 return {options,value:raw};
}
export function responsibleOptions(catalog){
 return catalog.map(r=>({value:r.id,label:r.position+' · '+r.name}));
}
export function ownerMetadata(catalog,id,previous={}){
 if(id==='legacy')return {owner:previous.owner||'',ownerId:previous.ownerId||null,ownerPosition:previous.ownerPosition||'',ownerName:previous.ownerName||''};
 const row=catalog.find(r=>r.id===id);
 if(id&&!row)throw Error('Selecciona un responsable del catálogo.');
 return {owner:row?row.position+' · '+row.name:'',ownerId:row?.id||null,ownerPosition:row?.position||'',ownerName:row?.name||''};
}
