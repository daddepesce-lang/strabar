'use client';

import { useEffect, useState } from 'react';
import { QUICK_DRINKS, EXTRA_DRINKS, BEER_FAMILIES } from '@/lib/drinks';
import { db } from '@/lib/db';

// Catalogo drink reattivo per i componenti che registrano i drink.
// Parte SUBITO dal catalogo statico (nessuna attesa, niente UI vuota), poi lo aggiorna
// con l'override gestito da admin (se presente). Il fetch è cache-ato 24h → egress ~0.
const STATIC = { quick: QUICK_DRINKS, extra: EXTRA_DRINKS, beerFamilies: BEER_FAMILIES };

export function useDrinkCatalog() {
  const [cat, setCat] = useState(STATIC);
  useEffect(() => {
    let alive = true;
    db.getDrinkCatalog()
      .then((c) => { if (alive && c && c.quick && c.extra && c.beerFamilies) setCat(c); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return cat;
}
