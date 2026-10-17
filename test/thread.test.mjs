import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildTranscript, stripQuoted, bodyOf, pickAttachments, parseFrom } from '../src/thread.mjs';

const b64 = (s) => Buffer.from(s).toString('base64url');
const msg = (id, date, from, text, extra = {}) => ({ id, internalDate: String(date), From: from,
  payload: { mimeType: 'multipart/alternative', parts: [{ mimeType: 'text/plain', body: { data: b64(text) } }, ...(extra.parts || [])] } });

test('transcript is chronological and keeps what the customer said earlier', () => {
  const t = buildTranscript([
    msg('b', 2000, 'Biuro', 'Jaka wysokość?'),
    msg('a', 1000, 'Klient', 'Roleta, szerokość 120 cm.'),
    msg('c', 3000, 'Klient', 'Wysokość 150 cm.\n\nW dniu 1.01 Biuro napisał:\n> Jaka wysokość?'),
  ]);
  assert.ok(t.indexOf('120 cm') < t.indexOf('Jaka wysokość') && t.indexOf('Jaka wysokość') < t.indexOf('150 cm'));
  assert.match(t, /Wiadomość 3\/3/);
  assert.equal(t.match(/Jaka wysokość/g).length, 1); // the quoted copy is gone
});

test('quoted lines and reply separators are removed', () => {
  assert.equal(stripQuoted('Nowe\n> stare\nOn Mon, X wrote:\nstare'), 'Nowe');
});

test('HTML-only messages are turned into text', () => {
  const m = { payload: { mimeType: 'text/html', body: { data: b64('<p>Roleta&nbsp;120</p>x') } } };
  assert.equal(bodyOf(m), 'Roleta 120\nx');
});

test('long threads keep the newest part', () => {
  const t = buildTranscript([msg('a', 1, 'K', 'stare '.repeat(500)), msg('b', 2, 'K', 'NOWE')], { maxMsg: 4000, maxTotal: 500 });
  assert.match(t, /pominięta/);
  assert.match(t, /NOWE$/);
});

test('attachments: signature logos dropped, PDFs first, at most 4', () => {
  const att = (name, mime, size) => ({ filename: name, mimeType: mime, body: { attachmentId: name, size } });
  const m = msg('a', 1, 'K', 'w załączeniu', { parts: [
    att('logo.png', 'image/png', 8_000),
    att('okno1.jpg', 'image/jpeg', 900_000), att('okno2.jpg', 'image/jpeg', 700_000),
    att('okno3.jpg', 'image/jpeg', 600_000), att('okno4.jpg', 'image/jpeg', 500_000),
    att('rysunek.pdf', 'application/pdf', 200_000), att('umowa.docx', 'application/msword', 50_000),
  ] });
  assert.deepEqual(pickAttachments([m]).map((a) => a.filename), ['rysunek.pdf', 'okno1.jpg', 'okno2.jpg', 'okno3.jpg']);
});

test('sender is read from both shapes Gmail Trigger returns', () => {
  assert.deepEqual(parseFrom({ value: [{ address: 'a@example.com', name: 'Anna' }] }), { display: 'Anna <a@example.com>', email: 'a@example.com' });
  assert.deepEqual(parseFrom('Jan <j@example.com>'), { display: 'Jan <j@example.com>', email: 'j@example.com' });
});
