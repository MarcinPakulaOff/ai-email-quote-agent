import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildVisionRequest, mergeVision } from '../src/vision.mjs';

test('one request with PDFs as files and images as data URLs; failed downloads skipped', () => {
  const meta = [{ filename: 'r.pdf', mimeType: 'application/pdf' }, { filename: 'x.jpg', mimeType: 'image/jpeg' }, { filename: 'y.jpg', mimeType: 'image/jpeg' }];
  const r = buildVisionRequest(meta, [{ data: 'AB-_' }, { error: 'timeout' }, { data: 'CD' }], 'SYS');
  assert.equal(r.count, 2);
  const parts = r.body.messages[1].content;
  assert.equal(parts[2].file.file_data, 'data:application/pdf;base64,AB+/');
  assert.equal(parts[4].image_url.url, 'data:image/jpeg;base64,CD');
  assert.equal(r.body.temperature, 0);
});

test('nothing downloaded → a tiny request that returns BRAK', () => {
  assert.equal(buildVisionRequest([{}], [{ error: 'x' }], 'SYS').empty, true);
});

test('BRAK or a failed call keeps the email text and leaves a note for the owner', () => {
  assert.equal(mergeVision('T', 'a.jpg', { choices: [{ message: { content: 'BRAK' } }] }).tresc, 'T');
  assert.match(mergeVision('T', 'a.jpg', { error: { message: 'x' } }).note, /odczyt nie powiódł się/);
  const ok = mergeVision('T', 'a.jpg', { choices: [{ message: { content: 'a.jpg: szerokość 1200 mm' } }] });
  assert.match(ok.tresc, /ODCZYT Z ZAŁĄCZNIKÓW \(a\.jpg\)[\s\S]*1200 mm/);
});
