import { test } from 'node:test';
import assert from 'node:assert/strict';
import { quote } from '../src/calculator.mjs';
import { formatReply, classification } from '../src/format.mjs';

const C = quote(JSON.stringify({ produkty: [{ typ: 'roleta', etykieta: 'salon', szer: 2, wys: 1.8 }] }));
const writer = (tresc_maila, typ = 'wycena') => JSON.stringify({ typ, tresc_maila, krotki_opis: 'roleta do salonu' });

test('amounts come from the calculator and replace the token', () => {
  const r = formatReply(writer('Dzień dobry,\nponiżej wycena:\n[WYCENA]'), C);
  assert.doesNotMatch(r.body, /\[WYCENA\]/);
  assert.ok(r.body.includes(`Koszt wykonania: ${C.total_pl} netto.`));
  assert.equal(r.amount, C.total_pl);
});

test('if the writer forgets the token, the amounts are still in the email', () => {
  assert.match(formatReply(writer('Dzień dobry, wycena poniżej.'), C).body, /Koszt wykonania/);
});

test('internal breakdown is separated from the customer part', () => {
  const [customer, internal] = formatReply(writer('Dzień dobry,\n[WYCENA]'), C).body.split('DO WEWNĘTRZNEGO UŻYTKU');
  assert.doesNotMatch(customer, /PO ZAOKRĄGLENIU/);
  assert.match(internal, /PO ZAOKRĄGLENIU/);
});

test('a non-JSON writer answer is used as plain text, never dropped', () => {
  assert.match(formatReply('Dzień dobry, zwykły tekst', C).body, /zwykły tekst/);
});

test('classifier: anything but a clear "wycena" leaves the email for a human', () => {
  assert.equal(classification('{"akcja":"wycena"}'), 'wycena');
  assert.equal(classification('```json\n{"akcja":"wycena"}\n```'), 'wycena');
  assert.equal(classification('{"akcja":"wyślij rabat"}'), 'inne');
  assert.equal(classification('Sure! Here is the JSON'), 'inne');
  assert.equal(classification(undefined), 'inne');
});
