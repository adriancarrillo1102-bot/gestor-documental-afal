export function platformRegistrationDate(value){
 if(!value)return '';const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
 const parts=new Intl.DateTimeFormat('en',{timeZone:'America/Tijuana',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date),part=type=>parts.find(p=>p.type===type).value;
 return part('year')+'-'+part('month')+'-'+part('day');
}
export function validHistoricalDate(value){
 if(typeof value!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(value))return false;
 const date=new Date(value+'T00:00:00Z');return Number.isFinite(date.getTime())&&date.toISOString().slice(0,10)===value;
}
export function documentRegistrationDate(document){return validHistoricalDate(document.meta?.historicalDate)?document.meta.historicalDate:platformRegistrationDate(document.created_at)}
export function registrationOrigin(document){
 if(!validHistoricalDate(document.meta?.historicalDate))return 'Registro en plataforma; sin fecha histórica asignada';
 return (document.meta.historicalDateOrigin||'Referencia histórica documental')+(document.meta.historicalDateNeedsReview?' · Revisar código o documento compartido':'');
}
