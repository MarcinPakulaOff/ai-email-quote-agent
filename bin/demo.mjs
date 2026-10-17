#!/usr/bin/env node
// Offline demo: fictional emails → (canned parser output) → calculator → reply. No model, no Gmail, no keys.
import { readFileSync } from 'node:fs';
import { quote } from '../src/calculator.mjs';
import { formatReply } from '../src/format.mjs';

const cases = JSON.parse(readFileSync(new URL('../examples/cases.json', import.meta.url), 'utf8'));
// What the writer model returns for each reply type (it never writes numbers).
const WRITER = {
  wycena: 'Dzień dobry,\ndziękujemy za zapytanie, poniżej wycena:\n[WYCENA]',
  prosba_o_dane: 'Dzień dobry,\ndziękujemy za zapytanie. Żeby przygotować wycenę, prosimy o uzupełnienie wymiarów.',
  odmowa: 'Dzień dobry,\ndziękujemy za zapytanie, niestety tego produktu nie wykonujemy.',
};

for (const c of cases) {
  const C = quote(JSON.stringify(c.parser));
  const r = formatReply(JSON.stringify({ typ: C.typ, tresc_maila: WRITER[C.typ], krotki_opis: c.name }), C);
  console.log(`\n${'═'.repeat(72)}\n${c.name}\n${'═'.repeat(72)}\n> ${c.email}\n\n[${r.typ} · ${r.amount}]\n\n${r.body}`);
}
