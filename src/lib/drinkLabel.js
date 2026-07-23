// Localizzazione dei drink (catalogo, personalizzati, bar) SENZA gonfiare il JSON salvato.
//
// Regole:
//  1. I drink loggati in sessione salvano al massimo { id?, typeKey?, volumeMl?, abv, units,
//     name, label, note?, custom? }. NIENTE mappa traduzioni nell'oggetto (egress).
//  2. In display, localizeDrink(drink, locale) risolve il nome/label nella lingua giusta:
//       • se ha `typeKey` (custom/bar) → compone "categoria tradotta + taglia";
//       • altrimenti se ha `id` di catalogo → traduzione da CATALOG_I18N (fallback IT);
//       • altrimenti (storico senza id) → match per nome IT noto, poi il nome salvato.
//
// IT è la sorgente: sta in drinks.js, qui NON si ripete (fallback automatico).

import {
  QUICK_DRINKS, EXTRA_DRINKS, BEER_FAMILIES, DRINK_TYPES, DRINK_TYPE_LABELS,
} from '@/lib/drinks';

// Traduzioni per id — SOLO en/fr/es, e solo dove il testo differisce dall'italiano.
// I nomi "universali" (Negroni, Mojito, Gin Tonic, Grappa, Limoncello, IPA…) sono omessi:
// cadono sul nome IT che è già corretto in ogni lingua.
export const CATALOG_I18N = {
  en: {
    beer_blonde_med: { name: 'Blonde Beer Medium (0.4L)', label: '🍺 Medium Beer' },
    wine_glass: { name: 'Glass of Wine (Red/White/Prosecco)', label: '🍷 Wine' },
    water: { name: 'Fresh Water', label: '💧 Water' },
    soda: { name: 'Coke / Soda', label: '🥤 Soda' },
    hugo: { name: 'Aperol/Hugo Light Spritz', label: '🍹 Hugo' },
    wine_red: { name: 'Glass of Red Wine', label: '🍷 Red' },
    wine_white: { name: 'Glass of White Wine', label: '🍷 White' },
    sparkling: { name: 'Prosecco / Sparkling', label: '🥂 Bubbles' },
    wine_sweet: { name: 'Sweet Wine / Passito', label: '🍷 Sweet' },
    beer_nonalcoholic: { name: 'Non-alcoholic Beer (0.4L)', label: '🍺 Alcohol-free 0.4L' },
    cider: { name: 'Cider (0.33L)', label: '🍏 Cider 0.33L' },
    whisky: { name: 'Whisky (neat)', label: '🥃 Whisky' },
    amaro: { name: 'Amaro (Bitter)', label: '🍶 Amaro' },
    spiked_coffee: { name: 'Spiked Coffee', label: '☕ Spiked' },
    spritz_nonalcoholic: { name: 'Non-alcoholic Spritz', label: '🍹 Alcohol-free' },
    juice_tea: { name: 'Juice / Tea', label: '🧃 Juice' },
    beer_blonde_s: { name: 'Blonde Beer Small (0.2L)', label: '🍺 Blonde Small 0.2L' },
    beer_blonde_m: { name: 'Blonde Beer Medium (0.4L)', label: '🍺 Blonde Medium 0.4L' },
    beer_blonde_l: { name: 'Blonde Beer Large (0.66L)', label: '🍺 Blonde Large 0.66L' },
    beer_red_s: { name: 'Red/Amber Beer Small (0.2L)', label: '🍺 Red Small 0.2L' },
    beer_red_m: { name: 'Red/Amber Beer Medium (0.4L)', label: '🍺 Red Medium 0.4L' },
    beer_red_l: { name: 'Red/Amber Beer Large (0.66L)', label: '🍺 Red Large 0.66L' },
    beer_ipa_s: { name: 'IPA/Craft Beer Small (0.2L)', label: '🍺 IPA Small 0.2L' },
    beer_ipa_m: { name: 'IPA/Craft Beer Medium (0.4L)', label: '🍺 IPA Medium 0.4L' },
    beer_ipa_l: { name: 'IPA/Craft Beer Large (0.5L)', label: '🍺 IPA Large 0.5L' },
    beer_dm_s: { name: 'Double Malt Small (0.2L)', label: '🍺 Double Malt Small 0.2L' },
    beer_dm_m: { name: 'Double Malt Medium (0.4L)', label: '🍺 Double Malt Medium 0.4L' },
    beer_dm_l: { name: 'Double Malt Large (0.66L)', label: '🍺 Double Malt Large 0.66L' },
  },
  fr: {
    beer_blonde_med: { name: 'Bière blonde moyenne (0,4L)', label: '🍺 Bière moyenne' },
    wine_glass: { name: 'Verre de vin (Rouge/Blanc/Prosecco)', label: '🍷 Vin' },
    water: { name: 'Eau fraîche', label: '💧 Eau' },
    soda: { name: 'Coca / Soda', label: '🥤 Soda' },
    hugo: { name: 'Spritz léger Aperol/Hugo', label: '🍹 Hugo' },
    wine_red: { name: 'Verre de vin rouge', label: '🍷 Rouge' },
    wine_white: { name: 'Verre de vin blanc', label: '🍷 Blanc' },
    sparkling: { name: 'Prosecco / Mousseux', label: '🥂 Bulles' },
    wine_sweet: { name: 'Vin doux / Passito', label: '🍷 Doux' },
    beer_nonalcoholic: { name: 'Bière sans alcool (0,4L)', label: '🍺 Sans alcool 0,4L' },
    cider: { name: 'Cidre (0,33L)', label: '🍏 Cidre 0,33L' },
    whisky: { name: 'Whisky (sec)', label: '🥃 Whisky' },
    amaro: { name: 'Amaro (Amer)', label: '🍶 Amaro' },
    spiked_coffee: { name: 'Café arrosé', label: '☕ Arrosé' },
    spritz_nonalcoholic: { name: 'Spritz sans alcool', label: '🍹 Sans alcool' },
    juice_tea: { name: 'Jus / Thé', label: '🧃 Jus' },
    beer_blonde_s: { name: 'Bière blonde petite (0,2L)', label: '🍺 Blonde petite 0,2L' },
    beer_blonde_m: { name: 'Bière blonde moyenne (0,4L)', label: '🍺 Blonde moyenne 0,4L' },
    beer_blonde_l: { name: 'Bière blonde grande (0,66L)', label: '🍺 Blonde grande 0,66L' },
    beer_red_s: { name: 'Bière rousse/ambrée petite (0,2L)', label: '🍺 Rousse petite 0,2L' },
    beer_red_m: { name: 'Bière rousse/ambrée moyenne (0,4L)', label: '🍺 Rousse moyenne 0,4L' },
    beer_red_l: { name: 'Bière rousse/ambrée grande (0,66L)', label: '🍺 Rousse grande 0,66L' },
    beer_ipa_s: { name: 'IPA/Artisanale petite (0,2L)', label: '🍺 IPA petite 0,2L' },
    beer_ipa_m: { name: 'IPA/Artisanale moyenne (0,4L)', label: '🍺 IPA moyenne 0,4L' },
    beer_ipa_l: { name: 'IPA/Artisanale grande (0,5L)', label: '🍺 IPA grande 0,5L' },
    beer_dm_s: { name: 'Double Malt petite (0,2L)', label: '🍺 Double Malt petite 0,2L' },
    beer_dm_m: { name: 'Double Malt moyenne (0,4L)', label: '🍺 Double Malt moyenne 0,4L' },
    beer_dm_l: { name: 'Double Malt grande (0,66L)', label: '🍺 Double Malt grande 0,66L' },
  },
  es: {
    beer_blonde_med: { name: 'Cerveza rubia mediana (0,4L)', label: '🍺 Cerveza mediana' },
    wine_glass: { name: 'Copa de vino (Tinto/Blanco/Prosecco)', label: '🍷 Vino' },
    shot: { name: 'Chupito (Tequila/Ron)', label: '🥃 Chupito' },
    water: { name: 'Agua fresca', label: '💧 Agua' },
    soda: { name: 'Coca Cola / Refresco', label: '🥤 Refresco' },
    hugo: { name: 'Spritz ligero Aperol/Hugo', label: '🍹 Hugo' },
    wine_red: { name: 'Copa de vino tinto', label: '🍷 Tinto' },
    wine_white: { name: 'Copa de vino blanco', label: '🍷 Blanco' },
    sparkling: { name: 'Prosecco / Espumante', label: '🥂 Burbujas' },
    wine_sweet: { name: 'Vino dulce / Passito', label: '🍷 Dulce' },
    beer_nonalcoholic: { name: 'Cerveza sin alcohol (0,4L)', label: '🍺 Sin alcohol 0,4L' },
    cider: { name: 'Sidra (0,33L)', label: '🍏 Sidra 0,33L' },
    whisky: { name: 'Whisky (solo)', label: '🥃 Whisky' },
    amaro: { name: 'Amaro (Amargo)', label: '🍶 Amaro' },
    spiked_coffee: { name: 'Café con licor', label: '☕ Carajillo' },
    spritz_nonalcoholic: { name: 'Spritz sin alcohol', label: '🍹 Sin alcohol' },
    juice_tea: { name: 'Zumo / Té', label: '🧃 Zumo' },
    beer_blonde_s: { name: 'Cerveza rubia pequeña (0,2L)', label: '🍺 Rubia pequeña 0,2L' },
    beer_blonde_m: { name: 'Cerveza rubia mediana (0,4L)', label: '🍺 Rubia mediana 0,4L' },
    beer_blonde_l: { name: 'Cerveza rubia grande (0,66L)', label: '🍺 Rubia grande 0,66L' },
    beer_red_s: { name: 'Cerveza roja/ámbar pequeña (0,2L)', label: '🍺 Roja pequeña 0,2L' },
    beer_red_m: { name: 'Cerveza roja/ámbar mediana (0,4L)', label: '🍺 Roja mediana 0,4L' },
    beer_red_l: { name: 'Cerveza roja/ámbar grande (0,66L)', label: '🍺 Roja grande 0,66L' },
    beer_ipa_s: { name: 'IPA/Artesanal pequeña (0,2L)', label: '🍺 IPA pequeña 0,2L' },
    beer_ipa_m: { name: 'IPA/Artesanal mediana (0,4L)', label: '🍺 IPA mediana 0,4L' },
    beer_ipa_l: { name: 'IPA/Artesanal grande (0,5L)', label: '🍺 IPA grande 0,5L' },
    beer_dm_s: { name: 'Doble Malta pequeña (0,2L)', label: '🍺 Doble Malta pequeña 0,2L' },
    beer_dm_m: { name: 'Doble Malta mediana (0,4L)', label: '🍺 Doble Malta mediana 0,4L' },
    beer_dm_l: { name: 'Doble Malta grande (0,66L)', label: '🍺 Doble Malta grande 0,66L' },
  },
};

// Etichette famiglia birra (BeerPicker) — solo dove differiscono dall'IT.
export const BEER_FAMILY_I18N = {
  en: { bionda: '🍺 Blonde', rossa: '🍺 Red/Amber', doppiomalto: '🍺 Double Malt' },
  fr: { bionda: '🍺 Blonde', rossa: '🍺 Rousse', doppiomalto: '🍺 Double Malt' },
  es: { bionda: '🍺 Rubia', rossa: '🍺 Roja', doppiomalto: '🍺 Doble Malta' },
};

// Indice id → voce di catalogo (dalla sorgente statica: garantisce l'i18n anche se il
// catalogo "live" è un override admin senza id/traduzioni).
const INDEX = {};
const BY_NAME = {};
for (const d of QUICK_DRINKS) { INDEX[d.id] = d; BY_NAME[d.name] = d; }
for (const d of EXTRA_DRINKS) { INDEX[d.id] = d; BY_NAME[d.name] = d; }
for (const f of BEER_FAMILIES) for (const s of f.sizes) { INDEX[s.id] = s; BY_NAME[s.name] = s; }

const TYPE_BY_KEY = {};
for (const t of DRINK_TYPES) TYPE_BY_KEY[t.key] = t;

// Formatta un volume in litri con separatore decimale coerente con la lingua.
export function formatVolume(volumeMl, locale = 'it') {
  if (!volumeMl && volumeMl !== 0) return '';
  const liters = Math.round((volumeMl / 1000) * 100) / 100;
  const sep = locale === 'en' ? '.' : ',';
  return String(liters).replace('.', sep) + 'L';
}

// U.A. da volume + gradazione. Modello coerente col catalogo: units = litri × gradi%.
// (equivalente a grammi_alcol/8 con densità 0,8 → vedi commento in drinks.js).
export function drinkUnits(volumeMl, abv) {
  const v = parseFloat(volumeMl) || 0;
  const a = parseFloat(abv) || 0;
  return Math.round((v / 1000) * a * 10) / 10;
}

// Opzioni categoria localizzate per i <select> del form "aggiungi drink".
export function drinkTypeOptions(locale = 'it') {
  const labels = DRINK_TYPE_LABELS[locale] || DRINK_TYPE_LABELS.it;
  return DRINK_TYPES.map((t) => ({
    key: t.key,
    emoji: t.emoji,
    defaultAbv: t.defaultAbv,
    label: labels[t.key] || DRINK_TYPE_LABELS.it[t.key] || t.key,
  }));
}

// Compone nome/label di un drink definito da categoria (custom o bar).
function composeTyped(drink, locale) {
  const type = TYPE_BY_KEY[drink.typeKey];
  const emoji = type?.emoji || '🍹';
  const labels = DRINK_TYPE_LABELS[locale] || DRINK_TYPE_LABELS.it;
  const catLabel = labels[drink.typeKey] || DRINK_TYPE_LABELS.it[drink.typeKey] || drink.typeKey;
  const size = drink.volumeMl ? ' ' + formatVolume(drink.volumeMl, locale) : '';
  const name = `${catLabel}${size}`;
  return { name, label: `${emoji} ${name}` };
}

// API principale: ritorna { name, label } del drink nella lingua richiesta.
export function localizeDrink(drink, locale = 'it') {
  if (!drink) return { name: '', label: '' };

  // 1. Drink CUSTOM dell'utente: definiti da categoria + volume → nome interamente
  //    composto e tradotto ("Bière 0,4L"). Richiede volumeMl: i drink dei BAR hanno un
  //    typeKey ma un NOME proprio (es. "IPA della Casa") e nessun volume → NON si compongono
  //    (perderebbero l'identità): cadono sul ramo nome qui sotto, con l'emoji di categoria
  //    già inclusa nel label salvato dal gestore.
  if (drink.typeKey && drink.volumeMl && (DRINK_TYPE_LABELS[locale] || DRINK_TYPE_LABELS.it)[drink.typeKey]) {
    return composeTyped(drink, locale);
  }

  // 2. Catalogo: risolvi la voce (per id, o per nome IT per lo storico).
  const entry = (drink.id && INDEX[drink.id]) || (drink.name && BY_NAME[drink.name]) || null;
  const id = drink.id || entry?.id;
  const tr = locale !== 'it' && id ? CATALOG_I18N[locale]?.[id] : null;

  return {
    name: tr?.name || drink.name || entry?.name || '',
    label: tr?.label || drink.label || entry?.label || drink.name || '',
  };
}

// Etichetta breve localizzata di una FAMIGLIA birra (per il BeerPicker).
export function localizeBeerFamilyLabel(family, locale = 'it') {
  if (!family) return '';
  if (locale === 'it') return family.label;
  return BEER_FAMILY_I18N[locale]?.[family.key] || family.label;
}
