// MODELLO ALCOLEMICO — la parte del prodotto che deve essere GIUSTA.
//
// Vive fuori da db.js perché è codice PURO: nessuna query, nessun localStorage, nessun
// client Supabase. Due conseguenze volute:
//   1. è testabile con `npm test` senza stub né mock (vedi tests/bac.test.mjs);
//   2. resta una SOLA sorgente di verità — picco, livello attuale, curva, residuo e la
//      programmazione del push "0,5" passano tutti da _netGramsAtTime.
// Viene innestato in `db` con lo spread (`...bacModel`), quindi si continua a chiamare
// db.calculatePeakBAC(...) come prima e `this` dentro questi metodi resta `db`.
//
// Modello: assorbimento esponenziale per drink (τ dipende da stomaco pieno/vuoto e sesso)
// + eliminazione lineare di Widmark (β·W·r). Calibrazione e fonti nei commenti sotto.
export const bacModel = {
  getDrinksWithTimestamps(drinks, created_at, durationMinutes) {
    if (!drinks) return [];
    // created_at è l'INIZIO della sessione: i drink senza orario vengono
    // distribuiti in AVANTI lungo la durata (da inizio a inizio+durata).
    const startTime = new Date(created_at || Date.now());
    const durMs = (durationMinutes || 120) * 60 * 1000;

    // Drink con timestamp esplicito (live). Se lo stesso drink è stato aggiunto più
    // volte, `added_times` contiene l'orario di OGNI aggiunta: lo espandiamo in una
    // unità per ciascun orario reale, così la curva fa uno "scalino" a ogni drink
    // (anche se è lo stesso tipo). Dati vecchi senza `added_times` → invariati.
    const withTs = [];
    drinks.forEach(d => {
      if (!d.added_at) return;
      // `stomach_log`: cambi stomaco avvenuti DOPO questo drink (normalizzato una volta sola
      // e passato al modello come `_slog`, vedi _absorbedFractionAt).
      const slog = this._stomachLog(d);
      const times = Array.isArray(d.added_times) && d.added_times.length > 0 ? d.added_times : null;
      if (times) {
        // `added_stomach` è parallelo ad `added_times` (come `added_places`): registra lo
        // stato stomaco pieno/vuoto AL MOMENTO di ogni aggiunta. Così il picco passato non
        // cambia più quando cambi stomaco a metà serata: ogni drink porta con sé il suo stato.
        // Dati vecchi senza `added_stomach` → ricadono su `d.full` (poi sul default sessione).
        const stomachs = Array.isArray(d.added_stomach) && d.added_stomach.length === times.length
          ? d.added_stomach : null;
        times.forEach((t, i) => withTs.push({
          ...d, qty: 1, added_at: t,
          full: stomachs ? stomachs[i] : d.full,
          added_times: undefined, added_stomach: undefined,
          ...(slog ? { _slog: slog } : {}),
        }));
      } else {
        withTs.push(slog ? { ...d, _slog: slog } : d);
      }
    });

    // Drink senza timestamp → espandiamo per qty (ogni unità = uno slot separato)
    // così 2 birre sono distribuite esattamente come 1 birra + 1 spritz.
    const units = [];
    drinks.forEach(d => {
      if (d.added_at) return;
      const slog = this._stomachLog(d);
      const qty = d.qty || 1;
      for (let i = 0; i < qty; i++) units.push({ ...d, qty: 1, ...(slog ? { _slog: slog } : {}) });
    });

    const n = units.length;
    const expanded = units.map((d, i) => ({
      ...d,
      added_at: new Date(startTime.getTime() + (n > 1 ? (durMs * i) / (n - 1) : 0)).toISOString()
    }));

    return [...withTs, ...expanded];
  },

  // Grammi di alcol ANCORA in circolo a un certo istante, derivanti dalle sessioni
  // CHIUSE recenti dell'utente (per riportare il "residuo" su una nuova sessione live).
  // `activities` = sessioni dell'utente (es. myActivities). Pura, niente query.
  residualGramsAtTime(activities, beforeISO, weightKg, sex, windowHours = 6, includeActive = false) {
    const before = new Date(beforeISO).getTime();
    if (!before || !Array.isArray(activities)) return 0;
    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    let grams = 0;
    activities.forEach((a) => {
      // Normalmente la live IN CORSO va ignorata (i suoi drink contano a parte). MA quando
      // calcoliamo il residuo per una NUOVA sessione (includeActive=true), la sessione
      // ancora attiva è quella che stiamo "lasciando" (cambia bar/prosecuzione) e il suo
      // alcol DEVE diventare residuo della nuova → altrimenti il BAC riparte da zero.
      if (!a || (a.is_active && !includeActive)) return;
      const drinks = a.drinks || [];
      if (drinks.length === 0) return;
      const parsed = this.getDrinksWithTimestamps(drinks, a.created_at, a.duration || 120);
      const sStart = Math.min(...parsed.map((d) => new Date(d.added_at).getTime()));
      if (!(sStart < before)) return;                 // solo sessioni iniziate prima
      if ((before - sStart) / 3600000 > windowHours) return; // fuori finestra → trascurabile
      // Stesso modello (assorbimento + eliminazione) delle altre stime: niente più
      // assorbimento istantaneo che gonfiava il "livello attuale" rispetto al picco.
      grams += this._netGramsAtTime(parsed, before, w, a.full_stomach, sex, 0);
    });
    return parseFloat(grams.toFixed(1));
  },

  // Residuo (grammi) da usare nei calcoli del BAC live di UNA sessione.
  // Preferisce il valore CONGELATO sulla sessione (`residual_grams`, scritto all'avvio
  // in createActivity): essendo memorizzato, è identico per il proprietario, il suo
  // profilo, gli spettatori e il radar → tutti vedono lo stesso BAC live.
  // Se assente (vecchie sessioni) ricalcola al volo dal pool disponibile, riferito
  // all'avvio sessione (created_at) per restare coerente col modello di eliminazione.
  sessionResidualGrams(session, fallbackPool, weightKg, sex) {
    const stored = session ? parseFloat(session.residual_grams) : NaN;
    if (Number.isFinite(stored)) return stored;
    return this.residualGramsAtTime(fallbackPool || [], session?.created_at, weightKg, sex);
  },

  // Coefficiente di distribuzione di Widmark in base al sesso (uomo ~0.68, donna ~0.55).
  _isFemale(sex) {
    const s = (sex || '').toString().toLowerCase();
    return s === 'f' || s === 'female' || s === 'donna';
  },

  _widmarkR(sex) {
    return this._isFemale(sex) ? 0.55 : 0.68;
  },

  // β = velocità di smaltimento BAC (g/l/h). Media di letteratura ≈ 0.15 g/l/h.
  // Donna ~0.14, Uomo ~0.15. NB: prima l'uomo era 0.17 (estremo alto del range):
  // combinato con l'assorbimento lento sotto, schiacciava il picco maschile a ~65%
  // del reale (confermato da segnalazioni sul campo → etilometro). Fonte: Jones 2010.
  _beta(sex) {
    return this._isFemale(sex) ? 0.14 : 0.15;
  },

  // Frazione assorbita al tempo dt_h dopo il drink (modello esponenziale, τ = costante di
  // tempo in ore). CALIBRAZIONE v2 su dati reali (200 sessioni) confrontati con la formula
  // Widmark standard degli etilometri  BAC_picco ≈ A/(r·W) − β·T :
  //   • vuoto: i vecchi τ (0.15-0.18) davano solo il 79-93% dello standard (picco sotto il
  //     reale su sessioni corte/singolo drink). τ ridotti (0.10-0.12, emivita ~7-8 min, entro
  //     il range fisiologico dello stomaco vuoto) → ora ~90% dello standard (leggermente cauto).
  //   • pieno: i vecchi τ (0.40-0.45) schiacciavano il picco al 46-87% dello standard, troppo
  //     (il cibo riduce il picco del ~9-23%, non del 50%). τ 0.26-0.30 → riduzione realistica
  //     ~10-15% rispetto allo stomaco vuoto.
  // Sotto-stima = lato PERICOLOSO per un'app anti-guida (dice "sei sotto 0,5" a chi è sopra):
  // meglio allineati/leggermente cauti. Donna: assorbimento un filo più rapido (meno ADH gastrico).
  _absorbedFraction(dt_h, fullStomach, sex) {
    if (dt_h <= 0) return 0;
    return 1 - Math.exp(-dt_h / this._tau(fullStomach, sex));
  },

  // Costante di tempo dell'assorbimento (ore). Vedi calibrazione sopra.
  _tau(fullStomach, sex) {
    const female = this._isFemale(sex);
    return fullStomach ? (female ? 0.26 : 0.30) : (female ? 0.10 : 0.12);
  },

  // Storico dei cambi stomaco di un drink, normalizzato: [{t: ms, full: bool}] ordinato.
  // Salvato compatto sul drink come `stomach_log: [[iso, 1|0], ...]` (pochi byte: i cambi
  // per serata sono 0-2) → nessuna colonna nuova, nessun egress aggiuntivo apprezzabile.
  _stomachLog(d) {
    const raw = d && Array.isArray(d.stomach_log) ? d.stomach_log : null;
    if (!raw || raw.length === 0) return null;
    const out = [];
    raw.forEach((e) => {
      const t = new Date(Array.isArray(e) ? e[0] : e?.t).getTime();
      const full = Array.isArray(e) ? !!e[1] : !!e?.full;
      if (Number.isFinite(t)) out.push({ t, full });
    });
    return out.length ? out.sort((a, b) => a.t - b.t) : null;
  },

  // Frazione assorbita a `refMs` di un drink bevuto a `addedMs`, tenendo conto dei CAMBI
  // di stomaco avvenuti DOPO il drink (es. ceni mentre la birra è ancora nello stomaco).
  // Modello a segmenti: la quota non assorbita decade con dU/dt = −U/τ(t), quindi
  //   assorbito(t) = 1 − exp(−Σ Δt_segmento / τ_segmento)
  // Conseguenze (entrambe fisiologicamente giuste):
  //  • il cibo rallenta SOLO l'alcol ancora nello stomaco → il tratto di curva già passato
  //    non si muove mai (il picco raggiunto non si abbassa a posteriori);
  //  • se premi "stomaco pieno" quando il drink è già assorbito (>~30 min a stomaco vuoto),
  //    non cambia nulla: non c'è più niente da rallentare.
  _absorbedFractionAt(addedMs, refMs, initialFull, changes, sex) {
    if (!(refMs > addedMs)) return 0;
    if (!changes || changes.length === 0) {
      return this._absorbedFraction((refMs - addedMs) / 3600000, initialFull, sex);
    }
    let exponent = 0;
    let cur = !!initialFull;
    let tPrev = addedMs;
    changes.forEach((c) => {
      if (c.t <= addedMs || c.t >= refMs) return;   // cambi prima del drink / dopo `ref`: ignorati
      if (!!c.full === cur) return;                 // nessun cambio effettivo di stato
      exponent += ((c.t - tPrev) / 3600000) / this._tau(cur, sex);
      cur = !!c.full;
      tPrev = c.t;
    });
    exponent += ((refMs - tPrev) / 3600000) / this._tau(cur, sex);
    return 1 - Math.exp(-exponent);
  },

  // Grammi di alcol puro stimati per un drink (quantità inclusa).
  // IMPORTANTE: il catalogo (src/lib/drinks.js) definisce `units` come  litri × gradi%
  // (es. 0,66 L a 5% = 3,3 U.A.). Fisicamente:  grammi = litri × gradi% × 7,89  (densità
  // etanolo 0,789). Quindi ogni "unità" del catalogo vale ~7,9 g di alcol puro — NON 12 g.
  // Usare 12 gonfiava OGNI tasso alcolico di ~1,5× (es. 2 birre 0,66 L → 79 g invece dei
  // reali 52 g), portando ragazze leggere a valori da coma etilico irrealistici.
  // `units` assente → default 1.3.
  // Vale per QUALSIASI drink del catalogo (usa il suo campo `units`), non un caso singolo.
  GRAMS_PER_UNIT: 8,
  _drinkGrams(d) {
    const units = Number.isFinite(d.units) ? d.units : 1.3;
    return units * (d.qty || 1) * this.GRAMS_PER_UNIT;
  },

  // FONTE DI VERITÀ UNICA: grammi NETTI di alcol in circolo a un dato istante.
  // Modello = assorbimento esponenziale per drink + eliminazione lineare (Widmark).
  // Picco, livello attuale, curva e residuo passano TUTTI da qui: così non possono
  // più dare numeri incoerenti tra loro (era la causa di "picco 0,06 vs attuale 0,13").
  _netGramsAtTime(parsedDrinks, refMs, weightKg, fullStomach, sex, priorResidualGrams = 0) {
    const prior = priorResidualGrams || 0;
    if (!parsedDrinks || parsedDrinks.length === 0) return Math.max(0, prior);
    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);
    const eliminationPerHour = this._beta(sex) * w * r;
    const startTime = Math.min(...parsedDrinks.map(d => new Date(d.added_at).getTime()));
    let absorbed = 0;
    parsedDrinks.forEach(d => {
      const dt_h = (refMs - new Date(d.added_at).getTime()) / 3600000;
      // Stato stomaco PER DRINK (timbrato all'aggiunta): un drink bevuto a stomaco vuoto
      // resta "vuoto" anche se più tardi mangi. `fullStomach` (sessione) è solo il fallback
      // per i dati vecchi che non hanno il flag → comportamento invariato su quelli.
      const drinkFull = (d.full === true || d.full === false) ? d.full : fullStomach;
      // `_slog` = cambi di stomaco successivi al drink (vedi _absorbedFractionAt): se cambi
      // stomaco a metà assorbimento, rallenta solo la quota ancora da assorbire.
      absorbed += this._drinkGrams(d) * (d._slog
        ? this._absorbedFractionAt(new Date(d.added_at).getTime(), refMs, drinkFull, d._slog, sex)
        : this._absorbedFraction(dt_h, drinkFull, sex));
    });
    const eliminated = eliminationPerHour * Math.max(0, (refMs - startTime) / 3600000);
    return Math.max(0, prior + absorbed - eliminated);
  },

  calculateCurrentBAC(drinks, created_at, durationMinutes, referenceTime, weightKg, fullStomach, sex, priorResidualGrams = 0) {
    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);

    // Nessun drink in QUESTA sessione: il BAC può comunque essere > 0 per il residuo
    // di sessioni chiuse da poco (es. apro una sessione subito dopo averne chiusa
    // un'altra, o un brindisi all'evento). Prima qui si usciva sempre con 0,
    // ignorando il residuo finché non si aggiungeva il primo drink.
    if (parsedDrinks.length === 0) {
      const prior = priorResidualGrams || 0;
      if (prior <= 0) return 0;
      // Il residuo NON è fisso: si smaltisce nel tempo. Decresce da created_at (quando il
      // residuo è stato calcolato) al momento attuale, allo stesso ritmo del modello.
      const startBac = prior / (w * r);
      const refMs = referenceTime ? new Date(referenceTime).getTime() : Date.now();
      const startMs = new Date(created_at || refMs).getTime();
      const hours = Math.max(0, (refMs - startMs) / 3600000);
      return parseFloat(Math.max(0, startBac - this._beta(sex) * hours).toFixed(2));
    }

    // Per sessioni storiche usa la fine stimata (non "adesso", che darebbe BAC=0)
    const refMs = referenceTime ? new Date(referenceTime).getTime() : Date.now();

    const bac = this._netGramsAtTime(parsedDrinks, refMs, w, fullStomach, sex, priorResidualGrams) / (w * r);
    return parseFloat(bac.toFixed(2));
  },

  // Istante FUTURO in cui il BAC supererà per la prima volta `limit` (default 0,5 g/L),
  // partendo da ADESSO. Serve a PROGRAMMARE il push in background: l'alcol continua ad
  // assorbirsi dopo l'ultimo drink, quindi si può superare il limite ad app chiusa. Il
  // client salva questo istante su `sessions.driving_alert_at`; una pg_cron lato Supabase
  // invia il push quando l'istante è passato (vedi migration *_driving_alerts.sql).
  // Ritorna ISO string, oppure null se: già sopra adesso / non lo supererà più (in discesa).
  projectDrivingCrossingISO(drinks, created_at, durationMinutes, weightKg, fullStomach, sex, priorResidualGrams = 0, limit = 0.5) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);
    const nowMs = Date.now();
    const bacAt = (T) => this._netGramsAtTime(parsedDrinks, T, w, fullStomach, sex, priorResidualGrams) / (w * r);
    if (bacAt(nowMs) >= limit) return null; // già oltre adesso → lo gestisce il notif locale
    const lastDrink = parsedDrinks.length ? Math.max(...parsedDrinks.map(d => new Date(d.added_at).getTime())) : nowMs;
    const endMs = lastDrink + 4 * 60 * 60 * 1000; // il picco cade entro ~3-4h dall'ultimo drink
    const stepMs = 2 * 60 * 1000; // risoluzione 2 min: precisione più che sufficiente
    for (let T = nowMs; T <= endMs; T += stepMs) {
      if (bacAt(T) >= limit) return new Date(T).toISOString();
    }
    return null; // non supererà il limite (o è già in fase di discesa sotto soglia)
  },

  // BAC di PICCO della sessione: il massimo valore raggiunto lungo la curva.
  // Deterministico (a parità di drink/orari/durata dà sempre lo stesso valore),
  // a differenza dello snapshot istantaneo che dipende da QUANDO è stato salvato.
  // È il numero giusto da mostrare nel feed come "Tasso Alcolico Est.".
  calculatePeakBAC(drinks, created_at, durationMinutes, weightKg, fullStomach, sex, priorResidualGrams = 0) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    if (parsedDrinks.length === 0) return 0;

    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);

    const timestamps = parsedDrinks.map(d => new Date(d.added_at).getTime());
    const startTime = Math.min(...timestamps);
    const maxDrinkTime = Math.max(...timestamps);
    // Il picco cade tra l'ultimo drink e ~3h dopo: campioniamo a passi di 5 min.
    const endTime = maxDrinkTime + 3 * 60 * 60 * 1000;
    const stepMs = 5 * 60 * 1000;

    let peak = 0;
    for (let T = startTime; T <= endTime; T += stepMs) {
      const bac = this._netGramsAtTime(parsedDrinks, T, w, fullStomach, sex, priorResidualGrams) / (w * r);
      if (bac > peak) peak = bac;
    }

    return parseFloat(peak.toFixed(2));
  },

  // Serie DENSA per disegnare la vera curva di ebbrezza (salita → picco → smaltimento).
  // Ritorna ~60 campioni {t, val} dal primo drink fino al ritorno a ~0, più il picco
  // e gli orari chiave. Stesso modello unico → la curva coincide sempre col picco mostrato.
  calculateBACCurve(drinks, created_at, durationMinutes, weightKg, fullStomach, sex, priorResidualGrams = 0) {
    const parsedDrinks = this.getDrinksWithTimestamps(drinks, created_at, durationMinutes);
    const wResid = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const rResid = this._widmarkR(sex);

    // Nessun drink ma c'è un RESIDUO: mostra comunque la curva di SMALTIMENTO (discesa
    // dal residuo fino a 0). Così una live aperta col solo residuo ha la sua curva.
    if (parsedDrinks.length === 0) {
      const prior = priorResidualGrams || 0;
      if (prior <= 0) return null;
      const beta = this._beta(sex);
      const startBac = prior / (wResid * rResid);
      const startTime = new Date(created_at || Date.now()).getTime();
      const endT = startTime + Math.max(1, startBac / beta) * 3600000;
      const fmt = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const N = 40;
      const series = [];
      for (let i = 0; i <= N; i++) {
        const T = startTime + ((endT - startTime) * i) / N;
        const h = (T - startTime) / 3600000;
        series.push({ t: T, val: Math.max(0, parseFloat((startBac - beta * h).toFixed(3))) });
      }
      let belowLimit = null;
      if (startBac >= 0.5) { const tt = startTime + ((startBac - 0.5) / beta) * 3600000; belowLimit = { t: tt, label: fmt(tt) }; }
      return {
        series, start: startTime, end: endT,
        peak: { t: startTime, val: parseFloat(startBac.toFixed(2)), label: fmt(startTime) },
        belowLimit, startLabel: fmt(startTime), endLabel: fmt(endT),
        residualOnly: true,
      };
    }

    const w = parseFloat(weightKg) > 0 ? parseFloat(weightKg) : 70;
    const r = this._widmarkR(sex);
    const timestamps = parsedDrinks.map(d => new Date(d.added_at).getTime());
    const startTime = Math.min(...timestamps);
    const maxDrinkTime = Math.max(...timestamps);
    const bacAt = (T) =>
      this._netGramsAtTime(parsedDrinks, T, w, fullStomach, sex, priorResidualGrams) / (w * r);

    // Picco reale (1 min) e primo istante in cui si torna ~sobri.
    const stepFine = 60 * 1000;
    const hardEnd = maxDrinkTime + 10 * 60 * 60 * 1000;
    let peakT = startTime, peakV = bacAt(startTime);
    for (let T = startTime; T <= hardEnd; T += stepFine) {
      const v = bacAt(T);
      if (v > peakV) { peakV = v; peakT = T; }
    }
    let endT = hardEnd;
    for (let T = peakT; T <= hardEnd; T += stepFine) {
      if (bacAt(T) <= 0.005) { endT = T; break; }
    }
    endT = Math.max(endT, startTime + 60 * 60 * 1000); // almeno 1h di arco

    const N = 60;
    const series = [];
    for (let i = 0; i <= N; i++) {
      const T = startTime + ((endT - startTime) * i) / N;
      series.push({ t: T, val: Math.max(0, parseFloat(bacAt(T).toFixed(3))) });
    }
    const fmt = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // Orario in cui, in DISCESA, si scende sotto il limite legale di 0,5 g/l
    // (solo se il picco l'ha superato). Utile per sapere "da che ora potrei guidare".
    let belowLimit = null;
    if (peakV >= 0.5) {
      for (let T = peakT; T <= endT; T += stepFine) {
        if (bacAt(T) < 0.5) { belowLimit = { t: T, label: fmt(T) }; break; }
      }
    }

    return {
      series,
      start: startTime,
      end: endT,
      peak: { t: peakT, val: Math.max(0, parseFloat(peakV.toFixed(2))), label: fmt(peakT) },
      belowLimit,
      startLabel: fmt(startTime),
      endLabel: fmt(endT),
    };
  },
};
