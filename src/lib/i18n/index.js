'use client';

// i18n leggero e scalabile (client-side), pensato per una PWA fatta quasi tutta di
// client components. Niente routing per-lingua (che gonfierebbe build ed egress): la
// lingua è una preferenza utente in localStorage, con fallback al browser.
//
// Uso:
//   const t = useT();
//   t('nav.feed')                      → "Feed" / "Feed"
//   t('landing.hero.cta', { n: 3 })    → interpolazione {n}
//
// Le chiavi mancanti ricadono su italiano, poi sulla chiave stessa: l'app non si rompe
// mai se una traduzione non c'è ancora. Si migra una sezione alla volta.

import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { it } from './it';
import { en } from './en';
import { fr } from './fr';
import { es } from './es';

export const LOCALES = {
  it: { label: 'Italiano', flag: '🇮🇹' },
  en: { label: 'English', flag: '🇬🇧' },
  fr: { label: 'Français', flag: '🇫🇷' },
  es: { label: 'Español', flag: '🇪🇸' },
};
export const DEFAULT_LOCALE = 'it';
const STORAGE_KEY = 'strabar_lang';
const DICTS = { it, en, fr, es };

// Risolve un percorso "a.b.c" dentro un oggetto annidato.
function lookup(dict, key) {
  return key.split('.').reduce((o, k) => (o && o[k] != null ? o[k] : undefined), dict);
}

// Interpolazione {var} → valore.
function interpolate(str, vars) {
  if (!vars || typeof str !== 'string') return str;
  return str.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
}

export function translate(locale, key, vars) {
  const primary = lookup(DICTS[locale] || DICTS[DEFAULT_LOCALE], key);
  if (primary != null) return interpolate(primary, vars);
  const fallback = lookup(DICTS[DEFAULT_LOCALE], key);
  if (fallback != null) return interpolate(fallback, vars);
  return key; // ultima spiaggia: mostra la chiave (evidenzia cosa manca, senza crash)
}

// Lingua preferita: localStorage → browser → default. Solo client.
export function resolveInitialLocale() {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && DICTS[saved]) return saved;
  } catch { /* noop */ }
  const nav = (navigator.language || navigator.userLanguage || '').toLowerCase();
  if (nav.startsWith('it')) return 'it';
  if (nav.startsWith('en')) return 'en';
  if (nav.startsWith('fr')) return 'fr';
  if (nav.startsWith('es')) return 'es';
  return DEFAULT_LOCALE;
}

const I18nContext = createContext({ locale: DEFAULT_LOCALE, setLocale: () => {}, t: (k) => k });

export function I18nProvider({ children }) {
  // Si parte SEMPRE dal default (= render server) per evitare mismatch di hydration,
  // poi si allinea alla preferenza reale dopo il mount.
  const [locale, setLocaleState] = useState(DEFAULT_LOCALE);

  useEffect(() => {
    const resolved = resolveInitialLocale();
    if (resolved !== locale) setLocaleState(resolved);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tiene <html lang> allineato (SEO/accessibilità).
  useEffect(() => {
    if (typeof document !== 'undefined') document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((next) => {
    if (!DICTS[next]) return;
    try { localStorage.setItem(STORAGE_KEY, next); } catch { /* noop */ }
    setLocaleState(next);
    try { window.dispatchEvent(new CustomEvent('strabar:locale-change', { detail: next })); } catch { /* noop */ }
  }, []);

  const t = useCallback((key, vars) => translate(locale, key, vars), [locale]);

  return <I18nContext.Provider value={{ locale, setLocale, t }}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  return useContext(I18nContext);
}

// Hook comodo: ritorna direttamente la funzione t.
export function useT() {
  return useContext(I18nContext).t;
}
