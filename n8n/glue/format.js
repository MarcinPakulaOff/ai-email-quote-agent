// @inline format
const C = $('Policz wycenę').first().json; // the only source of numbers
const P = $('Przygotuj dane maila').first().json;
const r = formatReply($json.output?.[0]?.content?.[0]?.text, C, C.odczyt_zalacznikow);
const html = r.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
return [{ json: { ...r, html: html.slice(0, 12000), temat: P.temat, threadId: P.threadId } }];
