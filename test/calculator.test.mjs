import { test } from 'node:test';
import assert from 'node:assert/strict';
import { screenRate, roundQuote, price, quote, RATES } from '../src/calculator.mjs';

const q = (produkty, montaz_sygnal = 'brak') => quote(JSON.stringify({ produkty, montaz_sygnal, brak_danych: null }));

test('screen rate: flat inside the small tier, the large rate from the large tier up', () => {
  assert.equal(screenRate(1.5), RATES.moskitiera.m2_small);
  assert.equal(screenRate(10), RATES.moskitiera.m2_large);
  const mid = screenRate(3.5);
  assert.ok(mid < RATES.moskitiera.m2_small && mid > RATES.moskitiera.m2_large);
});

test('screen price never drops when the area grows (smoothed small-format surcharge)', () => {
  let prev = 0;
  for (let a = 0.1; a <= 10; a = Math.round((a + 0.05) * 100) / 100) {
    const total = a * screenRate(a);
    assert.ok(total >= prev - 0.01, `price fell at ${a} m²: ${total} < ${prev}`);
    prev = total;
  }
});

test('small format costs more per m², and the minimum price applies', () => {
  assert.ok(screenRate(0.2) > RATES.moskitiera.m2_small);
  const r = price([{ typ: 'moskitiera', szer: 0.4, wys: 0.5 }]);
  assert.equal(r.priced[0].perPiece, RATES.moskitiera.min);
  assert.match(r.breakdown, /Dopłata do minimum/);
});

test('rounding: nearest 10 below 500, nearest 50 above', () => {
  assert.deepEqual([283, 494, 601, 1211, 2539].map(roundQuote), [280, 490, 600, 1200, 2550]);
});

test('installation: included by default, separate when the customer installs, skipped on "bez"', () => {
  const blind = [{ typ: 'roleta', szer: 1, wys: 1, ilosc: 2 }];
  const included = q(blind), separate = q(blind, 'sam'), none = q(blind, 'bez');
  assert.equal(included.installSeparate, 0);
  assert.ok(included.total > separate.total);
  assert.equal(separate.installSeparate, RATES.roleta.install_min); // 2 pcs x 60 < minimum 200
  assert.equal(none.total, separate.total);
  assert.match(none.installNote, /nie chce montażu/);
});

test('several products in one email are priced separately and summed', () => {
  const r = price([{ typ: 'roleta', szer: 1.2, wys: 1.5, ilosc: 2, tkanina: 'B' }, { typ: 'moskitiera', szer: 0.6, wys: 1.2 }], 'sam');
  assert.equal(r.priced.length, 2);
  assert.equal(r.priced[0].total, r.priced[0].perPiece * 2);
  assert.match(r.breakdown, /x 1\.2 \(grupa B\)/);
});

test('a missing dimension does not block the rest of the quote', () => {
  const r = q([{ typ: 'roleta', etykieta: 'salon', szer: 2, wys: 1.8 }, { typ: 'plisa', etykieta: 'kuchnia', szer: 0.8 }]);
  assert.equal(r.typ, 'wycena');
  assert.match(r.notPricedNote, /kuchnia: brak wymiarów: wys/);
});

test('only missing dimensions → ask for data; only products we do not make → decline', () => {
  assert.equal(q([{ typ: 'plisa', szer: 0.8 }]).typ, 'prosba_o_dane');
  const d = q([{ typ: 'zaluzja_drewniana', etykieta: 'żaluzja' }]);
  assert.equal(d.typ, 'odmowa');
  assert.match(d.brak_danych, /nie wykonujemy/);
});

test('unreadable or empty parser output asks for data instead of guessing', () => {
  assert.equal(quote('not json').typ, 'prosba_o_dane');
  assert.equal(quote('').typ, 'prosba_o_dane');
  assert.equal(quote(JSON.stringify({ produkty: [], brak_danych: 'Podaj wymiary.' })).brak_danych, 'Podaj wymiary.');
});

test('markdown fences around the JSON are tolerated', () => {
  assert.equal(quote('```json\n{"produkty":[{"typ":"roleta","szer":1,"wys":1}]}\n```').typ, 'wycena');
});

test('blinds always come with the alternative cassette variant', () => {
  const without = q([{ typ: 'roleta', szer: 1, wys: 1 }]);
  const withC = q([{ typ: 'roleta', szer: 1, wys: 1, kaseta: true }]);
  assert.match(without.variant.opis, /z kasetą/);
  assert.match(withC.variant.opis, /bez kasety/);
  assert.ok(without.variant.kwota > without.total && withC.variant.kwota < withC.total);
});

test('nonsense quantities and dimensions are not priced', () => {
  const r = price([{ typ: 'roleta', szer: -1, wys: 1 }, { typ: 'roleta', szer: 1, wys: 1, ilosc: 0 }]);
  assert.equal(r.notPriced.length, 1);
  assert.equal(r.priced[0].qty, 1);
});
