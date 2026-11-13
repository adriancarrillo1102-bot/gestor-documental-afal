export const isExcel = file => /\.(xlsx?|xlsm)$/i.test(file.name);

export function publishedFiles(document, pairs = []) {
 const ready = document?.files.filter(file => file.state === 'ready') ?? [];
 const newest = files => files.toSorted((a, b) =>
  String(b.created_at ?? '').localeCompare(String(a.created_at ?? '')) ||
  String(b.id).localeCompare(String(a.id))
 )[0];
 if (document?.type !== 'PRO') return [newest(ready)].filter(Boolean);

 const complete = ready.filter(file => isExcel(file) && pairs.some(pair =>
  pair.source_id === file.id && pair.version === file.version &&
  pair.storage_path === `${document.id}/${file.id}/${file.sha256}.pdf`
 ));
 const legacyPdf = ready.filter(file => /\.pdf$/i.test(file.name));
 return [newest(complete) ?? newest(legacyPdf) ?? newest(ready.filter(isExcel))].filter(Boolean);
}
