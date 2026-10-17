// @inline calculator
// .first() instead of .item: after the attachment branch n8n can lose item pairing, and one run = one email anyway.
let src;
try { src = $('Rysunki — scal').first().json; } catch { src = $('Bez rysunków').first().json; }
const C = quote($json.output?.[0]?.content?.[0]?.text);
return [{ json: { ...C, tresc: src.tresc, odczyt_zalacznikow: src.odczyt_zalacznikow || '' } }];
