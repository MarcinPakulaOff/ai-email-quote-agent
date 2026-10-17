// Deterministic quote calculator. The language model NEVER computes prices: it only turns the email into
// structured dimensions (prompts/parser.txt), and every number in the reply comes from this file.
//
// The price list below is FICTIONAL (made-to-measure roller blinds, pleated blinds and insect screens).
// The production deployment uses the client's own catalogue and rates; the structure is the same:
// per-product calculators, tiered area pricing, a small-format surcharge, a minimum price, installation
// rules, products quoted by hand and products the business does not make.
//
// No imports on purpose: scripts/build-workflow.mjs inlines this file into an n8n Code node.

const z2 = (x) => Math.round((x + Number.EPSILON) * 100) / 100;
const pl = (x) => z2(x).toFixed(2).replace('.', ',');
const plk = (x) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const num = (x) => (x == null || x === '' ? null : Number(x));

// ---------- RATES (fictional, PLN net) ----------
export const RATES = {
  roleta: { base: 120, m2: 90, cassette: 80, motor: 450, install_pc: 60, install_min: 200 },
  plisa: { base: 150, m2: 130, install_pc: 60, install_min: 200 },
  // Insect screens: tiered price per m², falling with area (log-interpolated between the two tiers),
  // plus a percentage surcharge for small formats: rate = m2_small * (small_threshold / area) ^ small_k.
  // The exponent is fitted to a reference price list by least squares and smoothed so the total
  // price never drops when the area grows (raw reference curves have steps).
  moskitiera: {
    m2_small: 110, tier_small: 2, m2_large: 80, tier_large: 6,
    small_threshold: 1, small_k: 0.38,
    min: 90,
    clip_pc: 3.5, clip_spacing: 0.5, // mounting clips every 50 cm of the perimeter
  },
  // Fabric group multiplier (A = basic, B = blackout, C = premium).
  fabric: { A: 1.0, B: 1.2, C: 1.45 },
};
const FABRIC_LABEL = { A: 'tkanina grupy A (podstawowa)', B: 'tkanina grupy B (zaciemniająca)', C: 'tkanina grupy C (premium)' };

// Quoted by hand: no approved rule yet.
export const NO_RATE = {
  markiza: 'markizy — wycena po pomiarze, brak reguły ogólnej',
  inne: 'produkt spoza cennika',
};
// Not made at all: the reply politely declines.
export const NOT_MADE = {
  zaluzja_drewniana: 'żaluzji drewnianych nie wykonujemy',
  naprawa: 'naprawy rolet innych producentów — nie wykonujemy',
};

// Rounding the way the owner rounds by hand: to the nearest 50 PLN, below 500 PLN to the nearest 10.
export const roundQuote = (x) => (x < 500 ? Math.round(x / 10) * 10 : Math.round(x / 50) * 50);
const fabric = (g) => RATES.fabric[String(g || 'A').toUpperCase()] || 1.0;

/** Price per m² of an insect screen as a function of its area. */
export function screenRate(area) {
  const S = RATES.moskitiera;
  if (!(area > 0)) return S.m2_small;
  if (area < S.small_threshold) return z2(S.m2_small * Math.pow(S.small_threshold / area, S.small_k));
  if (area <= S.tier_small) return S.m2_small;
  if (area >= S.tier_large) return S.m2_large;
  const t = (Math.log(area) - Math.log(S.tier_small)) / (Math.log(S.tier_large) - Math.log(S.tier_small));
  return z2(S.m2_small + t * (S.m2_large - S.m2_small));
}

// ---------- PER-PRODUCT CALCULATORS: [label, amount, how it was computed] ----------
function roleta(p) {
  const S = RATES.roleta, w = num(p.szer), h = num(p.wys), f = fabric(p.tkanina);
  const lines = [['Roleta — baza', S.base, 'mechanizm, rura nawojowa, listwa dolna']];
  lines.push(['Tkanina', z2(w * h * S.m2 * f), `${pl(w)} x ${pl(h)} m = ${pl(w * h)} m² x ${S.m2} zł/m²${f !== 1 ? ` x ${f} (grupa ${String(p.tkanina).toUpperCase()})` : ''}`]);
  if (p.kaseta) lines.push(['Kaseta aluminiowa', S.cassette, 'zamiast montażu na uchwytach']);
  if (p.naped === 'silnik') lines.push(['Napęd elektryczny', S.motor, 'silnik + pilot']);
  return lines;
}
function plisa(p) {
  const S = RATES.plisa, w = num(p.szer), h = num(p.wys), f = fabric(p.tkanina);
  return [['Plisa — baza', S.base, 'profile, linki, uchwyty'],
    ['Tkanina', z2(w * h * S.m2 * f), `${pl(w)} x ${pl(h)} m = ${pl(w * h)} m² x ${S.m2} zł/m²${f !== 1 ? ` x ${f}` : ''}`]];
}
function moskitiera(p) {
  const S = RATES.moskitiera, w = num(p.szer), h = num(p.wys), area = w * h, rate = screenRate(area);
  const lines = [['Moskitiera ramkowa', z2(area * rate), `${pl(w)} x ${pl(h)} m = ${pl(area)} m² x ${pl(rate)} zł/m²`]];
  if (p.uchwyty) {
    const perimeter = 2 * (w + h), pcs = Math.ceil(perimeter / S.clip_spacing);
    lines.push(['Uchwyty montażowe', z2(pcs * S.clip_pc),
      `${pcs} szt. co ${Math.round(S.clip_spacing * 100)} cm na ${pl(perimeter)} mb obwodu x ${pl(S.clip_pc)} zł/szt.`]);
  }
  const sum = lines.reduce((s, x) => s + x[1], 0);
  if (sum < S.min) lines.push(['Dopłata do minimum', z2(S.min - sum), `minimum za moskitierę: ${S.min} zł`]);
  return lines;
}

const CALC = { roleta, plisa, moskitiera };
const REQUIRED = { roleta: ['szer', 'wys'], plisa: ['szer', 'wys'], moskitiera: ['szer', 'wys'] };
const missing = (p) => (REQUIRED[p.typ] || []).filter((k) => p[k] == null || isNaN(Number(p[k])) || Number(p[k]) <= 0);

/**
 * Prices every product from the parser. Products with missing dimensions, without a rate or not made
 * are listed separately instead of blocking the whole quote.
 * installSignal: "brak" (default: installation included) | "sam" (quoted separately) | "bez" (skipped).
 */
export function price(products, installSignal = 'brak') {
  const priced = [], notPriced = [], declined = [];
  products.forEach((p, i) => {
    const label = p.etykieta || `Pozycja ${i + 1}`;
    const qty = Math.max(1, Math.round(Number(p.ilosc) || 1));
    if (NOT_MADE[p.typ]) return declined.push({ label, reason: NOT_MADE[p.typ] });
    if (NO_RATE[p.typ] || !CALC[p.typ]) return notPriced.push({ label, reason: NO_RATE[p.typ] || `nieznany produkt (${p.typ || '—'})` });
    const miss = missing(p);
    if (miss.length) return notPriced.push({ label, reason: `brak wymiarów: ${miss.join(', ')}` });
    const lines = CALC[p.typ](p).map(([name, amount, how]) => ({ name, amount, how }));
    const perPiece = z2(lines.reduce((s, x) => s + x.amount, 0));
    priced.push({ label, typ: p.typ, qty, lines, perPiece, total: z2(perPiece * qty) });
  });

  const sum = z2(priced.reduce((s, x) => s + x.total, 0));

  // Installation: per piece with a minimum, only for blinds (screens are clipped on by the customer).
  let install = 0;
  for (const typ of ['roleta', 'plisa']) {
    const pcs = priced.filter((x) => x.typ === typ).reduce((s, x) => s + x.qty, 0);
    if (pcs) install += pcs * RATES[typ].install_pc;
  }
  if (install > 0) install = Math.max(install, RATES.roleta.install_min);

  let total, installSeparate = 0, installNote;
  if (installSignal === 'bez' || install === 0) {
    total = roundQuote(sum);
    installNote = install > 0 ? 'klient nie chce montażu — pominięty' : 'brak montażu dla tych produktów';
  } else if (installSignal === 'sam') {
    total = roundQuote(sum); installSeparate = roundQuote(install);
    installNote = 'klient rozważa montaż własny — podajemy osobno';
  } else {
    total = roundQuote(sum + install); installNote = `montaż ${plk(install)} zł wliczony w kwotę`;
  }

  // Internal breakdown: for the owner only, never sent to the customer.
  const out = [];
  priced.forEach((q) => {
    out.push(`${q.label}${q.qty > 1 ? ` — ${q.qty} szt.` : ''}`);
    q.lines.forEach((x) => out.push(`  - ${x.name}: ${x.how}${x.how ? ' = ' : ''}${pl(x.amount)} zł`));
    if (q.qty > 1) out.push(`  razem za ${q.qty} szt.: ${pl(q.total)} zł`);
  });
  if (install > 0) out.push(`Montaż: ${plk(install)} zł (${installNote})`);
  out.push(`Suma przed zaokrągleniem: ${pl(sum + (installSignal === 'sam' || installSignal === 'bez' ? 0 : install))} zł`);
  out.push(`PO ZAOKRĄGLENIU: ${plk(total)} zł netto`);

  return { priced, notPriced, declined, total, install, installSeparate, installNote, breakdown: out.join('\n') };
}

const LEAD_TIME = { roleta: '2-3 tygodnie od zamówienia', plisa: '3-4 tygodnie od zamówienia', moskitiera: '1-2 tygodnie od zamówienia' };

/**
 * Turns the raw parser output (a JSON string from the model) into one of three reply types:
 * "wycena" (quote), "prosba_o_dane" (ask for missing data) or "odmowa" (we do not make this).
 * Anything unreadable falls back to asking for data: a wrong number is worse than a question.
 */
export function quote(rawParserOutput) {
  let data = null, parseError = null;
  try { data = JSON.parse(String(rawParserOutput ?? '').replace(/```json/gi, '').replace(/```/g, '').trim()); }
  catch (e) { parseError = e.message; }

  const products = data && Array.isArray(data.produkty) ? data.produkty : [];
  if (parseError || products.length === 0) {
    return { typ: 'prosba_o_dane', total: null,
      brak_danych: (data && data.brak_danych) || (parseError ? 'Nie udało się odczytać wymiarów z wiadomości.' : 'Brak danych do wyceny.') };
  }

  const r = price(products, (data && data.montaz_sygnal) || 'brak');
  const notPricedNote = r.notPriced.map((x) => `${x.label}: ${x.reason}`).join('; ');
  const declinedNote = r.declined.map((x) => `${x.label}: ${x.reason}`).join('; ');

  if (r.priced.length === 0) {
    return { typ: declinedNote && !notPricedNote ? 'odmowa' : 'prosba_o_dane', total: null,
      brak_danych: notPricedNote || declinedNote || 'Brak kompletu wymiarów do wyceny.', notPricedNote, declinedNote };
  }

  // Alternative variant the owner always offers for roller blinds: with or without a cassette.
  const blinds = r.priced.filter((x) => x.typ === 'roleta').reduce((s, x) => s + x.qty, 0);
  const withCassette = products.some((p) => p.typ === 'roleta' && p.kaseta);
  let variant = null;
  if (blinds > 0) {
    const diff = blinds * RATES.roleta.cassette;
    variant = withCassette
      ? { opis: 'bez kasety, na uchwytach', kwota: roundQuote(r.total - diff) }
      : { opis: 'z kasetą aluminiową', kwota: roundQuote(r.total + diff) };
  }

  const included = [];
  if (blinds > 0) included.push('uchwyty montażowe', 'łańcuszek z obciążnikiem');
  if (r.priced.some((x) => x.typ === 'moskitiera')) included.push('rama aluminiowa', 'siatka z włókna szklanego');
  if (withCassette) included.push('kaseta aluminiowa');
  if (products.some((p) => p.naped === 'silnik')) included.push('silnik z pilotem');

  const group = String(products.find((p) => p.tkanina)?.tkanina || 'A').toUpperCase();
  return { typ: 'wycena', total: r.total, total_pl: plk(r.total) + ' zł',
    install: r.install, installSeparate: r.installSeparate, installNote: r.installNote,
    variant, included, leadTime: LEAD_TIME[r.priced[0].typ],
    material: r.priced.some((x) => x.typ !== 'moskitiera') ? FABRIC_LABEL[group] || FABRIC_LABEL.A : null,
    breakdown: r.breakdown, notPricedNote, declinedNote, priced: r.priced };
}
