// Etichette di sessione localizzate: STATO/SFORZO (feeling) e NOME della sessione libera.
//
// Problema storico: sia il feeling ("Sobrio", "Allegro"…) sia la sessione libera
// ("Sessione Libera") venivano SALVATI in italiano nel DB e ri-mostrati grezzi → un utente
// francese vedeva testo italiano. Da ora si salva una CHIAVE stabile e si traduce in
// display; per lo storico già scritto in italiano c'è una reverse-map.

// --- FEELING / STATO ---------------------------------------------------------

// Chiavi canoniche salvate d'ora in poi.
export const FEELING_KEYS = ['sober', 'happy', 'tipsy_happy', 'connoisseur', 'very_hot', 'full', 'hangover', 'normal'];

// Chiave canonica → chiave i18n (logpage.*).
const I18N_BY_KEY = {
  sober: 'feelingSober',
  happy: 'feelingHappy',
  tipsy_happy: 'feelingTipsyHappy',
  connoisseur: 'feelingConnoisseur',
  very_hot: 'feelingVeryHot',
  full: 'feelingFull',
  hangover: 'feelingHangover',
  normal: 'feelingNormal',
};

// Reverse-map per lo storico salvato in italiano (con e senza emoji).
const KEY_BY_LEGACY = {
  'Sobrio': 'sober',
  'Allegro': 'happy',
  'Brillo Felice': 'tipsy_happy',
  'Intenditore': 'connoisseur',
  'Molto Caldo': 'very_hot',
  'Molto Caldo 🔥': 'very_hot',
  'Pieno Raso': 'full',
  'Pieno Raso 💀': 'full',
  'Postumi Assicurati': 'hangover',
  'Postumi Assicurati 🤕': 'hangover',
  'Normale': 'normal',
};

// Ritorna la chiave canonica del feeling, o null se sconosciuto (valore libero storico).
export function feelingKey(feeling) {
  if (!feeling) return null;
  if (I18N_BY_KEY[feeling]) return feeling; // già una chiave canonica
  return KEY_BY_LEGACY[feeling] || null;
}

// Feeling "neutro" (Normale / non impostato): sul feed non si mostra.
export function isNeutralFeeling(feeling) {
  const k = feelingKey(feeling);
  return !feeling || k === 'normal';
}

// Etichetta localizzata del feeling. Valori sconosciuti (storico non mappato) → grezzi.
export function localizeFeeling(feeling, t) {
  const k = feelingKey(feeling);
  if (!k) return feeling || '';
  return t('logpage.' + I18N_BY_KEY[k]);
}

// --- SESSIONE LIBERA ---------------------------------------------------------

// Letterali storici salvati come nome della sessione libera (tutte le lingue viste).
const FREE_SESSION_LITERALS = new Set([
  'Sessione Libera', 'Sessione libera', 'Session libre', 'Free session', 'Sesión libre',
]);

// True se questa location rappresenta una sessione libera (freeform o nome-letterale).
export function isFreeSession(location) {
  if (!location) return true;
  if (location.freeform) return true;
  return FREE_SESSION_LITERALS.has((location.name || '').trim());
}

// Nome della location da mostrare: "Sessione Libera" tradotta se è freeform, altrimenti
// il nome reale del locale.
export function locationDisplayName(location, t) {
  if (isFreeSession(location)) return t('session.freeSession');
  return location.name || t('session.freeSession');
}
