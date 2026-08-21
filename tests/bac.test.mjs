// Test del MODELLO ALCOLEMICO (src/lib/bac.js) — il numero su cui un utente decide se
// guidare. Nessuna dipendenza: `node --test`, modello puro, niente mock.
//   npm test
//
// Due tipi di asserzione, di proposito:
//  • VALORI GOLDEN (es. picco 0,46 per una media di doppio malto): fissano la calibrazione
//    attuale. Se un giorno la si ricalibra, questi test DEVONO cambiare — ma solo di
//    proposito, mai per sbaglio.
//  • INVARIANTI (monotonia, il passato non si riscrive, l'acqua non alza niente): valgono
//    per qualsiasi calibrazione futura e sono la vera rete di sicurezza.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { bacModel as bac } from '../src/lib/bac.js';

// --- helper -----------------------------------------------------------------
const T0 = new Date('2026-08-21T21:00:00.000Z').getTime();
const at = (min) => new Date(T0 + min * 60000).toISOString();
const ISO0 = new Date(T0).toISOString();

// Un drink loggato in live: orario esplicito + timbro stomaco, come lo scrive l'app.
const live = ({ units, min = 0, full = false, log = null, name = 'drink' }) => ({
  name, units, qty: 1,
  added_at: at(min), added_times: [at(min)],
  full, added_stomach: [full],
  ...(log ? { stomach_log: log } : {}),
});

const UOMO = { w: 70, sex: 'm' };
const peak = (drinks, { w, sex } = UOMO, fullSession = false, residual = 0) =>
  bac.calculatePeakBAC(drinks, ISO0, 120, w, fullSession, sex, residual);
const bacAt = (drinks, min, { w, sex } = UOMO, fullSession = false, residual = 0) =>
  bac.calculateCurrentBAC(drinks, ISO0, 120, at(min), w, fullSession, sex, residual);

// Doppio Malto Media 0,4L = 3,2 U.A. (catalogo: litri × gradi%)
const DM_MEDIA = 3.2;

// --- grammi e costanti ------------------------------------------------------
test('U.A. → grammi di alcol puro (8 g per unità)', () => {
  assert.equal(bac.GRAMS_PER_UNIT, 8);
  assert.equal(bac._drinkGrams({ units: DM_MEDIA, qty: 1 }), 25.6);
  assert.equal(bac._drinkGrams({ units: 2.0, qty: 3 }), 48);
  // units assente → default prudente 1,3 U.A. (non 0: un drink sconosciuto non è acqua)
  assert.equal(bac._drinkGrams({ qty: 1 }), 1.3 * 8);
});

test('costanti di Widmark per sesso', () => {
  assert.equal(bac._widmarkR('m'), 0.68);
  assert.equal(bac._widmarkR('f'), 0.55);
  assert.equal(bac._beta('m'), 0.15);
  assert.equal(bac._beta('f'), 0.14);
  ['f', 'female', 'donna', 'F'].forEach((s) => assert.equal(bac._isFemale(s), true, s));
  ['m', 'male', 'uomo', '', null, undefined].forEach((s) => assert.equal(bac._isFemale(s), false, String(s)));
});

// --- picco: valori golden ---------------------------------------------------
test('picco di una media di doppio malto (uomo 70 kg)', () => {
  assert.equal(peak([live({ units: DM_MEDIA })]), 0.46);                  // stomaco vuoto
  assert.equal(peak([live({ units: DM_MEDIA, full: true })]), 0.38);      // stomaco pieno
});

test('a parità di drink la donna arriva più in alto (r minore)', () => {
  const d = [live({ units: DM_MEDIA })];
  assert.ok(peak(d, { w: 70, sex: 'f' }) > peak(d, { w: 70, sex: 'm' }));
});

test('più peso corporeo → picco più basso', () => {
  const d = [live({ units: DM_MEDIA })];
  assert.ok(peak(d, { w: 95, sex: 'm' }) < peak(d, { w: 55, sex: 'm' }));
});

test('monotonia: più alcol non può abbassare il picco', () => {
  const uno = peak([live({ units: DM_MEDIA })]);
  const due = peak([live({ units: DM_MEDIA }), live({ units: DM_MEDIA, min: 30, name: 'b' })]);
  assert.ok(due > uno);
});

test('gli analcolici non muovono niente', () => {
  const acqua = [live({ units: 0, name: 'acqua' }), live({ units: 0, min: 20, name: 'soda' })];
  assert.equal(peak(acqua), 0);
  assert.equal(bacAt(acqua, 30), 0);
});

test('nessun drink e nessun residuo → zero (non NaN)', () => {
  assert.equal(peak([]), 0);
  assert.equal(bacAt([], 60), 0);
});

// --- stomaco: cambio a metà assorbimento ------------------------------------
test('mangiare NON riscrive il passato ma abbassa il picco ancora da venire', () => {
  const vuoto = [live({ units: DM_MEDIA })];
  const mangiaA10 = [live({ units: DM_MEDIA, log: [[at(10), 1]] })];

  // prima del cambio: curva identica al millesimo
  [2, 5, 10].forEach((m) => assert.equal(bacAt(mangiaA10, m), bacAt(vuoto, m), `min ${m}`));
  // dopo: più bassa, ma non quanto se avesse bevuto già a stomaco pieno
  assert.ok(peak(mangiaA10) < peak(vuoto));
  assert.ok(peak(mangiaA10) > peak([live({ units: DM_MEDIA, full: true })]));
  assert.equal(peak(mangiaA10), 0.42);
});

test('mangiare quando il drink è già assorbito non cambia nulla', () => {
  const vuoto = [live({ units: DM_MEDIA })];
  const mangiaA30 = [live({ units: DM_MEDIA, log: [[at(30), 1]] })];
  assert.equal(peak(mangiaA30), peak(vuoto));
  assert.equal(bacAt(mangiaA30, 120), bacAt(vuoto, 120));
});

test('annullare il cambio (tocco per errore) riporta al valore di prima', () => {
  const vuoto = [live({ units: DM_MEDIA })];
  const avantiIndietro = [live({ units: DM_MEDIA, log: [[at(2), 1], [at(4), 0]] })];
  assert.equal(peak(avantiIndietro), peak(vuoto));
});

test('lo smaltimento non dipende dallo stomaco: le curve si ricongiungono', () => {
  const vuoto = [live({ units: DM_MEDIA })];
  const pieno = [live({ units: DM_MEDIA, full: true })];
  assert.equal(bacAt(vuoto, 150), bacAt(pieno, 150));
});

test('lo stato stomaco è PER DRINK, non per sessione', () => {
  // Primo drink a stomaco vuoto, secondo dopo cena: il misto sta in mezzo ai due estremi.
  const misto = [live({ units: DM_MEDIA }), live({ units: DM_MEDIA, min: 30, full: true, name: 'b' })];
  const tuttoVuoto = [live({ units: DM_MEDIA }), live({ units: DM_MEDIA, min: 30, name: 'b' })];
  const tuttoPieno = [live({ units: DM_MEDIA, full: true }), live({ units: DM_MEDIA, min: 30, full: true, name: 'b' })];
  assert.ok(peak(misto) < peak(tuttoVuoto));
  // >= e non >: qui il picco cade sul SECONDO drink, che nei due casi è bevuto nello
  // stesso stato — il primo a quel punto è già in circolo. Il confronto stretto vale
  // sul singolo drink (vedi "picco di una media di doppio malto").
  assert.ok(peak(misto) >= peak(tuttoPieno));
  // il default di sessione non deve poter sovrascrivere un timbro esplicito
  assert.equal(peak(tuttoVuoto, UOMO, true), peak(tuttoVuoto, UOMO, false));
});

test('dati vecchi senza timbro: vale il default della sessione', () => {
  const legacy = [{ name: 'x', units: DM_MEDIA, qty: 1, added_at: ISO0, added_times: [ISO0] }];
  assert.equal(peak(legacy, UOMO, false), 0.46);
  assert.equal(peak(legacy, UOMO, true), 0.38);
});

// --- espansione dei drink ---------------------------------------------------
test('stessa birra aggiunta 3 volte = 3 scalini, non 3 drink allo stesso istante', () => {
  const tre = [{
    name: 'Bionda Media', units: 2.0, qty: 3,
    added_at: at(0), added_times: [at(0), at(20), at(40)],
    full: false, added_stomach: [false, false, false],
  }];
  const parsed = bac.getDrinksWithTimestamps(tre, ISO0, 60);
  assert.equal(parsed.length, 3);
  assert.deepEqual(parsed.map((d) => d.qty), [1, 1, 1]);
  assert.deepEqual([...new Set(parsed.map((d) => d.added_at))].length, 3);

  // Gli stessi tre drink versati tutti insieme fanno un picco PIÙ ALTO: la
  // distribuzione nel tempo deve contare.
  const insieme = [{ name: 'Bionda', units: 2.0, qty: 3, added_at: at(0), added_times: [at(0), at(0), at(0)] }];
  assert.ok(peak(insieme) > peak(tre));
});

test('sessione a posteriori senza orari: i drink si distribuiscono sulla durata', () => {
  const retro = [{ name: 'a', units: 2, qty: 2 }, { name: 'b', units: 1.3, qty: 1 }];
  const parsed = bac.getDrinksWithTimestamps(retro, ISO0, 120);
  assert.equal(parsed.length, 3);                                   // espansi per qty
  const ms = parsed.map((d) => new Date(d.added_at).getTime()).sort((x, y) => x - y);
  assert.equal(ms[0], T0);                                          // il primo all'inizio
  assert.equal(ms[ms.length - 1], T0 + 120 * 60000);                // l'ultimo alla fine
});

// --- curva ------------------------------------------------------------------
test('la curva coincide col picco mostrato e torna a zero', () => {
  const drinks = [live({ units: DM_MEDIA }), live({ units: 1.3, min: 40, name: 'shot' })];
  const curve = bac.calculateBACCurve(drinks, ISO0, 120, 70, false, 'm', 0);
  assert.equal(curve.peak.val, peak(drinks));                       // niente numeri discordanti
  assert.ok(curve.series.length > 10);
  assert.equal(curve.series[0].t, T0);                              // parte dal primo drink
  assert.ok(curve.series.at(-1).val <= 0.01);                       // finisce da sobrio
  // nessun campione può superare il picco dichiarato (con la tolleranza di arrotondamento)
  curve.series.forEach((p) => assert.ok(p.val <= curve.peak.val + 0.005));
});

test('con un solo drink la curva sale, tocca il picco e scende senza rimbalzi', () => {
  // Con più drink il doppio picco è LEGITTIMO (ogni drink riapre una salita), quindi la
  // monotonia si verifica sul caso in cui è fisicamente garantita.
  const curve = bac.calculateBACCurve([live({ units: DM_MEDIA })], ISO0, 120, 70, false, 'm', 0);
  const iPeak = curve.series.findIndex((p) => p.t >= curve.peak.t);
  for (let i = 1; i < iPeak; i++) assert.ok(curve.series[i].val >= curve.series[i - 1].val, `salita ${i}`);
  for (let i = iPeak + 1; i < curve.series.length; i++) {
    assert.ok(curve.series[i].val <= curve.series[i - 1].val + 1e-9, `discesa ${i}`);
  }
});

test('curva col solo residuo: sola discesa, nessun drink', () => {
  const curve = bac.calculateBACCurve([], ISO0, 60, 70, false, 'm', 30);
  assert.equal(curve.residualOnly, true);
  assert.ok(curve.peak.val > 0);
  assert.ok(curve.series.at(-1).val <= 0.01);
  assert.equal(bac.calculateBACCurve([], ISO0, 60, 70, false, 'm', 0), null); // niente da mostrare
});

test('la soglia 0,5 viene segnata solo se la si supera davvero', () => {
  const forte = bac.calculateBACCurve([live({ units: 5.3 })], ISO0, 60, 70, false, 'm', 0);
  assert.ok(forte.peak.val > 0.5);
  assert.ok(forte.belowLimit && forte.belowLimit.t > forte.peak.t);   // istante di rientro
  const leggero = bac.calculateBACCurve([live({ units: 1.0 })], ISO0, 60, 70, false, 'm', 0);
  assert.ok(leggero.peak.val < 0.5);
  assert.equal(leggero.belowLimit, null);
});

// --- residuo tra sessioni ---------------------------------------------------
test('il residuo si smaltisce e rispetta la finestra temporale', () => {
  const sess = (minutesAgo, units) => ({
    is_active: false, created_at: new Date(Date.now() - minutesAgo * 60000).toISOString(),
    duration: 60, full_stomach: false,
    drinks: [{ name: 'x', units, qty: 1, added_at: new Date(Date.now() - minutesAgo * 60000).toISOString() }],
  });
  const nowISO = new Date().toISOString();
  const fresca = bac.residualGramsAtTime([sess(30, 5.3)], nowISO, 70, 'm');
  const vecchia = bac.residualGramsAtTime([sess(180, 5.3)], nowISO, 70, 'm');
  assert.ok(fresca > 0);
  assert.ok(vecchia < fresca);                                        // smaltito nel frattempo
  // fuori finestra (7h > 6h di default) → trascurabile
  assert.equal(bac.residualGramsAtTime([sess(420, 5.3)], nowISO, 70, 'm'), 0);
  // una sessione ANCORA ATTIVA non conta due volte, salvo richiesta esplicita
  const attiva = { ...sess(30, 5.3), is_active: true };
  assert.equal(bac.residualGramsAtTime([attiva], nowISO, 70, 'm'), 0);
  assert.ok(bac.residualGramsAtTime([attiva], nowISO, 70, 'm', 6, true) > 0);
});

test('il residuo congelato sulla sessione vince sul ricalcolo', () => {
  assert.equal(bac.sessionResidualGrams({ residual_grams: 12.5, created_at: ISO0 }, [], 70, 'm'), 12.5);
  assert.equal(bac.sessionResidualGrams({ residual_grams: 0, created_at: ISO0 }, [], 70, 'm'), 0);
  assert.equal(bac.sessionResidualGrams({ created_at: ISO0 }, [], 70, 'm'), 0); // assente → ricalcolo
});

test('con il solo residuo il BAC non è zero e scende nel tempo', () => {
  const a = bacAt([], 0, UOMO, false, 30);
  const b = bacAt([], 120, UOMO, false, 30);
  assert.ok(a > 0);
  assert.ok(b < a);
});

// --- previsione del superamento di 0,5 (push in background) ------------------
test('previsione 0,5: null se già sopra, istante futuro se salirà', () => {
  const nowMin = -1; // drink bevuto un minuto fa
  const grosso = [{
    name: 'g', units: 5.3, qty: 1,
    added_at: new Date(Date.now() + nowMin * 60000).toISOString(),
    added_times: [new Date(Date.now() + nowMin * 60000).toISOString()],
    full: true, added_stomach: [true],
  }];
  const iso = bac.projectDrivingCrossingISO(grosso, new Date(Date.now() - 60000).toISOString(), 60, 70, true, 'm', 0);
  assert.ok(iso === null || new Date(iso).getTime() > Date.now() - 1000);

  // Un solo bicchiere leggero non supererà mai la soglia → niente push programmato.
  const leggero = [{
    name: 'l', units: 1.0, qty: 1,
    added_at: new Date().toISOString(), added_times: [new Date().toISOString()],
    full: false, added_stomach: [false],
  }];
  assert.equal(bac.projectDrivingCrossingISO(leggero, new Date().toISOString(), 60, 70, false, 'm', 0), null);
});

// --- robustezza -------------------------------------------------------------
test('input sporchi non producono NaN', () => {
  assert.equal(bac.getDrinksWithTimestamps(null, ISO0, 60).length, 0);
  assert.equal(peak([live({ units: DM_MEDIA })], { w: null, sex: null }), 0.46);   // peso assente → 70 kg
  assert.equal(peak([live({ units: DM_MEDIA })], { w: 0, sex: 'm' }), 0.46);
  const v = bacAt([live({ units: DM_MEDIA })], 30, { w: 'abc', sex: 'm' });
  assert.ok(Number.isFinite(v));
});
