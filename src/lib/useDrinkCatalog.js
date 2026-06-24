'use client';

import { useEffect, useState } from 'react';
import { QUICK_DRINKS, EXTRA_DRINKS, BEER_FAMILIES } from '@/lib/drinks';
import { db } from '@/lib/db';

// Catalogo drink reattivo per i componenti che registrano i drink.
// Parte SUBITO dal catalogo statico (nessuna attesa, niente UI vuota), poi lo aggiorna
// con l'override gestito da admin (se presente).
const STATIC = { quick: QUICK_DRINKS, extra: EXTRA_DRINKS, beerFamilies: BEER_FAMILIES };

export function useDrinkCatalog() {
  const [cat, setCat] = useState(STATIC);
  useEffect(() => {
    let alive = true;
    // 1. Mostra subito la cache locale (istantaneo, nessuna query, niente UI vuota).
    const cached = db._cachedDrinkCatalog?.();
    if (cached?.v) setCat(cached.v);
    // 2. Stale-while-revalidate: se la cache è più vecchia di 60s, rivalida in background.
    //    Così i drink/tagli aggiunti da un admin compaiono a TUTTI gli utenti entro pochi
    //    secondi dall'apertura (prima restavano nascosti fino a 24h per la cache locale).
    const stale = !cached || (Date.now() - cached.t > 60 * 1000);
    if (stale) {
      db.getDrinkCatalog({ force: true })
        .then((c) => { if (alive && c && c.quick && c.extra && c.beerFamilies) setCat(c); })
        .catch(() => {});
    }
    return () => { alive = false; };
  }, []);
  return cat;
}
