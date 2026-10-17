// @inline vision
const P = $('Przygotuj dane maila').first().json;
const names = (P.zalaczniki || []).map((a) => a.filename).join(', ');
const r = mergeVision(P.tresc, names, $json);
return [{ json: { ...P, tresc: r.tresc, odczyt_zalacznikow: r.note } }];
