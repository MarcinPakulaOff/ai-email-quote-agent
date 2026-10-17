// Drawings and photos. Customers often send only "see attachment" and a sketch with dimensions,
// so attachments go through a vision model whose ONLY job is to transcribe what is visible.
// The branch is fail-safe: any error lets the run continue with the email text alone.
//
// No imports on purpose: scripts/build-workflow.mjs inlines this file into an n8n Code node.

/**
 * One chat-completions request with every downloaded attachment.
 * `meta` = the list from pickAttachments(), `downloads` = Gmail attachment responses in the same order.
 */
export function buildVisionRequest(meta, downloads, systemPrompt, model = 'gpt-4.1') {
  const content = [{ type: 'text', text: 'Oto załączniki do zapytania. Wypisz z nich wszystko, co widać — zwłaszcza wymiary.' }];
  let count = 0;
  downloads.forEach((d, i) => {
    if (!d || typeof d.data !== 'string') return; // download failed: skip this attachment
    const m = meta[i] || {};
    const b64 = d.data.replace(/-/g, '+').replace(/_/g, '/'); // Gmail returns base64url
    const mime = String(m.mimeType || 'image/jpeg').toLowerCase();
    const name = m.filename || `zalacznik-${i + 1}`;
    content.push({ type: 'text', text: `Załącznik: ${name}` });
    content.push(mime === 'application/pdf'
      ? { type: 'file', file: { filename: name, file_data: `data:application/pdf;base64,${b64}` } }
      : { type: 'image_url', image_url: { url: `data:${mime};base64,${b64}`, detail: 'high' } });
    count++;
  });
  if (!count) return { empty: true, body: { model: 'gpt-4.1-mini', max_tokens: 5, messages: [{ role: 'user', content: 'Odpowiedz jednym słowem: BRAK' }] } };
  return { count, body: { model, temperature: 0, max_tokens: 1200, messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content }] } };
}

/**
 * Appends the transcription to the thread transcript. Text from the email wins over the drawing
 * (the parser prompt says so); when the vision step failed, the owner gets a note to check the files manually.
 */
export function mergeVision(transcript, filenames, response) {
  let reading = String(response?.choices?.[0]?.message?.content || '').trim();
  if (/^brak\.?$/i.test(reading)) reading = '';
  if (reading) {
    return { tresc: `${transcript}\n\n--- ODCZYT Z ZAŁĄCZNIKÓW (${filenames}) ---\n`
      + 'Poniższy opis powstał automatycznie ze zdjęć i rysunków dołączonych do wątku.\n'
      + 'Traktuj go jak treść od klienta, ale wymiary stamtąd są mniej pewne niż podane w tekście.\n\n' + reading,
    note: reading };
  }
  if (!filenames) return { tresc: transcript, note: '' };
  const why = response && (response.error || !response.choices) ? ' (odczyt nie powiódł się)' : ' (nic użytecznego do wyceny)';
  return { tresc: transcript, note: `W wątku były załączniki: ${filenames} — automat ich nie wykorzystał${why}. Sprawdź samodzielnie.` };
}
