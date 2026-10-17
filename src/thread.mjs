// Thread memory. Customers rarely quote the earlier messages properly (they cut them, or send HTML only),
// so instead of trusting quoted lines the agent fetches the WHOLE Gmail thread and rebuilds one
// chronological transcript. Both models read this transcript, so dimensions given three emails ago still count.
//
// No imports on purpose: scripts/build-workflow.mjs inlines this file into an n8n Code node.

export const LIMITS = { maxMsg: 4000, maxTotal: 16000 };

// Attachments worth sending to the vision model.
export const ATTACHMENTS = {
  images: ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'],
  maxFile: 12 * 1024 * 1024,     // larger files would not fit into one model request
  minImage: 30 * 1024,           // smaller images are logos and icons from email signatures
  minPdf: 5 * 1024,
  maxCount: 4,
  base64Budget: 18 * 1024 * 1024, // total base64 per request
};

const decode = (d) => {
  if (!d) return '';
  try { return Buffer.from(String(d).replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8'); }
  catch { return ''; }
};

function textParts(payload, acc = []) {
  if (!payload) return acc;
  if (payload.body?.data && String(payload.mimeType || '').startsWith('text/')) acc.push({ mime: payload.mimeType, data: payload.body.data });
  (payload.parts || []).forEach((p) => textParts(p, acc));
  return acc;
}

/** Plain text of one Gmail message (format=full): text/plain first, HTML stripped as a fallback, snippet last. */
export function bodyOf(message) {
  const parts = textParts(message.payload);
  const plain = parts.find((a) => a.mime === 'text/plain');
  if (plain) return decode(plain.data);
  const html = parts.find((a) => a.mime === 'text/html');
  if (html) {
    return decode(html.data)
      .replace(/<br\s*\/?>(?:\r?\n)?/gi, '\n')
      .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;/g, "'");
  }
  return message.snippet || '';
}

/** Drops quoted lines and everything after a reply separator (Gmail, Outlook, Polish clients). */
export function stripQuoted(text) {
  const out = [];
  for (const line of String(text).replace(/\r/g, '').split('\n')) {
    if (/^\s*>/.test(line)) continue;
    if (/^\s*(On .+wrote:|.*<[^>]+>\s+wrote:|Dnia .+napisał|W dniu .+napisał|-{3,}\s*Original Message|________+|Od:\s.+Wysłano:)/i.test(line)) break;
    out.push(line);
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** One chronological transcript of the thread, with per-message and total limits (newest part kept). */
export function buildTranscript(messages, limits = LIMITS) {
  const msgs = [...messages].sort((a, b) => Number(a.internalDate || 0) - Number(b.internalDate || 0));
  const blocks = msgs.map((m, i) => {
    const from = m.From || m.from || '(nieznany nadawca)';
    const dt = m.internalDate ? new Date(Number(m.internalDate)).toISOString().slice(0, 16).replace('T', ' ') : '';
    let body = stripQuoted(bodyOf(m));
    if (body.length > limits.maxMsg) body = body.slice(0, limits.maxMsg) + ' […]';
    return `--- Wiadomość ${i + 1}/${msgs.length}${dt ? ` [${dt} UTC]` : ''} • Od: ${from} ---\n${body || '(pusta treść)'}`;
  });
  const transcript = blocks.join('\n\n');
  return transcript.length > limits.maxTotal
    ? '[…wcześniejsza część wątku pominięta…]\n\n' + transcript.slice(-limits.maxTotal)
    : transcript;
}

/** Attachments from the whole thread for the vision step: PDFs (technical drawings) first, then the largest images. */
export function pickAttachments(messages, rules = ATTACHMENTS) {
  const all = [];
  const walk = (payload, messageId) => {
    if (!payload) return;
    if (payload.filename && payload.body?.attachmentId) {
      all.push({ messageId, attachmentId: payload.body.attachmentId, filename: payload.filename,
        mimeType: String(payload.mimeType || '').toLowerCase(), size: Number(payload.body.size || 0) });
    }
    (payload.parts || []).forEach((p) => walk(p, messageId));
  };
  messages.forEach((m) => walk(m.payload, m.id));

  const candidates = all
    .filter((a) => a.size && a.size <= rules.maxFile &&
      (a.mimeType === 'application/pdf' ? a.size >= rules.minPdf : rules.images.includes(a.mimeType) && a.size >= rules.minImage))
    .sort((a, b) => ((b.mimeType === 'application/pdf') - (a.mimeType === 'application/pdf')) || (b.size - a.size));

  const picked = [];
  let budget = 0;
  for (const a of candidates) {
    if (picked.length >= rules.maxCount) break;
    const b64 = Math.ceil((a.size * 4) / 3);
    if (budget + b64 > rules.base64Budget) continue;
    budget += b64;
    picked.push(a);
  }
  return picked;
}

/** Gmail Trigger returns `from` either as a string or as { value: [{ address, name }], text }. */
export function parseFrom(raw) {
  let display, email;
  if (raw && typeof raw === 'object') {
    const v = Array.isArray(raw.value) ? raw.value[0] : null;
    if (v && (v.address || v.name)) {
      email = String(v.address || '').trim();
      display = v.name ? `${v.name} <${email}>` : email;
    } else if (raw.text) display = String(raw.text).trim();
  }
  if (!display) display = String(raw || '(brak nadawcy)');
  if (!email) { const m = display.match(/<([^>]+)>/); email = (m ? m[1] : display).trim(); }
  return { display, email };
}
