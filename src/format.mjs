// Builds the reply. The writer model returns only the wording around a [WYCENA] token and is told to
// use no numbers at all; every amount, the lead time and the conditions are inserted here from the
// calculator. The reply goes back to the OWNER's mailbox (reply in the thread that the owner forwarded),
// with a customer-ready part on top and an internal breakdown below. The owner checks it and sends it on.
//
// No imports on purpose: scripts/build-workflow.mjs inlines this file into an n8n Code node.

export const SIGNATURE = 'Pozdrawiamy\nZespół Rolety na Wymiar';

const plk = (x) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** Parses the model's JSON; tolerates ```json fences. Returns `fallback` when the text is not JSON. */
export function parseModelJson(raw, fallback) {
  try { return JSON.parse(String(raw ?? '').replace(/```json/gi, '').replace(/```/g, '').trim()); }
  catch { return fallback; }
}

/** Classifier output → "wycena" | "inne". Anything unexpected is "inne": the email stays in the inbox for a human. */
export function classification(raw) {
  const d = parseModelJson(raw, null);
  return d && (d.akcja === 'wycena' || d.akcja === 'inne') ? d.akcja : 'inne';
}

/** Customer-facing amounts block. */
export function quoteBlock(C) {
  const b = [`Koszt wykonania: ${plk(C.total)} zł netto.`];
  if (C.variant) b.push(`Wariant ${C.variant.opis}: ${plk(C.variant.kwota)} zł netto.`);
  if (C.installSeparate) b.push(`Montaż: ${plk(C.installSeparate)} zł netto.`);
  else if (C.install) b.push('Montaż jest wliczony w podaną cenę.');
  if ((C.included || []).length) b.push('', 'W cenie:', ...C.included.map((x) => `- ${x}`));
  b.push('', ...(C.material ? [`Materiał: ${C.material}.`] : []), `Czas realizacji: ${C.leadTime}.`);
  b.push('', 'Wycena wstępna — po pomiarze cena może ulec zmianie. Wycena ważna 30 dni.', 'Wszystkie ceny podane są netto.');
  return b.join('\n');
}

/**
 * writerRaw = writer model output, C = quote() result, vision = note from mergeVision().
 * Returns the email body (plain text) plus a short summary for the owner's Telegram alert.
 */
export function formatReply(writerRaw, C, vision = '') {
  const d = parseModelJson(writerRaw, { tresc_maila: String(writerRaw || ''), krotki_opis: '(nie rozpoznano)' });
  const typ = C.typ || d.typ || 'wycena';
  let customer = String(d.tresc_maila || '').trim();

  if (typ === 'wycena') {
    const block = quoteBlock(C);
    // If the model forgot the token, the block is appended: the amounts must reach the email either way.
    customer = customer.includes('[WYCENA]') ? customer.replace(/\[WYCENA\]/g, block) : `${customer}\n\n${block}`;
  } else {
    customer = customer.replace(/\[WYCENA\]/g, '').trim();
  }
  customer += `\n\n${SIGNATURE}`;

  const internal = ['', '——————————————————————————', 'DO WEWNĘTRZNEGO UŻYTKU (nie wysyłaj klientowi)', ''];
  if (typ === 'wycena') {
    internal.push(C.breakdown || ''); // includes the installation line
  } else {
    internal.push(`Typ odpowiedzi: ${typ}`, C.brak_danych || '');
  }
  if (C.notPricedNote) internal.push('', 'NIE POLICZONO:', ...C.notPricedNote.split('; ').map((x) => `- ${x}`));
  if (C.declinedNote) internal.push('', 'ODMOWA:', ...C.declinedNote.split('; ').map((x) => `- ${x}`));
  if (vision) internal.push('', 'ODCZYT Z ZAŁĄCZNIKÓW (automat, zweryfikuj z rysunkiem):', vision);
  internal.push('', 'Wyliczone automatem według cennika. Sprawdź przed wysłaniem.');

  return {
    typ,
    body: `${customer}\n${internal.join('\n')}`,
    amount: typ === 'wycena' && C.total != null ? `${plk(C.total)} zł` : 'do ustalenia',
    summary: d.krotki_opis || '',
  };
}
