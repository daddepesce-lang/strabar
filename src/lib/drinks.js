// Catalogo drink condiviso.
// QUICK_DRINKS: selezioni veloci dei più usati (mostrati sempre).
// EXTRA_DRINKS: catalogo esteso (mostrato sotto "Altri drink").
//
// units = Unità Alcoliche stimate (1 U.A. ≈ 8g di alcol puro).
// Per le birre vale la formula coerente:  units ≈ litri × gradi(%)
//   (es. 0,4L a 5% = 2,0 U.A.).  Così le tre taglie sono proporzionate tra loro.
//
// TAGLIE BIRRA (standard bar italiano):
//   • Piccola = 0,2 L   • Media = 0,4 L   • Grande = 0,66 L
// Le etichette (label) dicono SEMPRE tipo + taglia, così "media" e il tipo sono chiari.
//
// i18n: ogni voce ha un `id` STABILE. Le traduzioni NON stanno qui (verrebbero spalmate
// nel JSON della sessione con `{...preset}` → egress) ma in src/lib/drinkLabel.js, mappate
// per `id`. In display si usa localizeDrink(drink, locale). I nomi/label qui sono la
// sorgente italiana e il fallback per ogni lingua.

export const QUICK_DRINKS = [
  { id: 'spritz', name: 'Spritz (Campari/Aperol/Select)', abv: 11, units: 1.3, label: '🍹 Spritz' },
  { id: 'beer_blonde_med', name: 'Birra Bionda Media (0,4L)', abv: 5, units: 2.0, label: '🍺 Birra Media' },
  { id: 'wine_glass', name: 'Calice Vino (Rosso/Bianco/Prosecco)', abv: 12.5, units: 1.3, label: '🍷 Vino' },
  { id: 'shot', name: 'Shot (Tequila/Rhum/Chupito)', abv: 40, units: 1.3, label: '🥃 Shot' },
  { id: 'water', name: 'Acqua Fresca', abv: 0, units: 0, label: '💧 Acqua' },
  { id: 'soda', name: 'Coca Cola / Soda', abv: 0, units: 0, label: '🥤 Soda' },
];

export const EXTRA_DRINKS = [
  // Cocktail
  { id: 'negroni', name: 'Negroni', abv: 24, units: 2.4, label: '🍸 Negroni' },
  { id: 'americano', name: 'Americano', abv: 15, units: 1.4, label: '🍸 Americano' },
  { id: 'gin_tonic', name: 'Gin Tonic', abv: 12, units: 1.6, label: '🍸 Gin Tonic' },
  { id: 'mojito', name: 'Mojito', abv: 13, units: 1.6, label: '🍹 Mojito' },
  { id: 'margarita', name: 'Margarita', abv: 20, units: 1.8, label: '🍸 Margarita' },
  { id: 'cosmopolitan', name: 'Cosmopolitan', abv: 18, units: 1.6, label: '🍸 Cosmopolitan' },
  { id: 'hugo', name: 'Aperol/Hugo Spritz Leggero', abv: 9, units: 1.1, label: '🍹 Hugo' },
  { id: 'sangria', name: 'Sangria', abv: 12, units: 1.5, label: '🍹 Sangria' },
  { id: 'rum_cola', name: 'Rum & Cola', abv: 15, units: 1.6, label: '🥃 Rum&Cola' },
  { id: 'vodka_lemon', name: 'Vodka Lemon', abv: 15, units: 1.6, label: '🥃 Vodka Lemon' },
  // Vino / bollicine
  { id: 'wine_red', name: 'Calice Vino Rosso', abv: 13, units: 1.4, label: '🍷 Rosso' },
  { id: 'wine_white', name: 'Calice Vino Bianco', abv: 12, units: 1.3, label: '🍷 Bianco' },
  { id: 'sparkling', name: 'Prosecco / Spumante', abv: 11, units: 1.2, label: '🥂 Bollicine' },
  { id: 'bellini', name: 'Bellini / Mimosa', abv: 8, units: 1.0, label: '🍾 Bellini' },
  { id: 'wine_sweet', name: 'Vino Dolce / Passito', abv: 15, units: 1.2, label: '🍷 Passito' },
  // Le birre con varietà (Bionda/Rossa/IPA/Doppio Malto) NON stanno qui: hanno un
  // selettore di TAGLIA dedicato (vedi BEER_FAMILIES + componente BeerPicker).
  { id: 'beer_nonalcoholic', name: 'Birra Analcolica (0,4L)', abv: 0.4, units: 0.2, label: '🍺 Analcolica 0,4L' },
  { id: 'cider', name: 'Sidro (0,33L)', abv: 4.5, units: 1.5, label: '🍏 Sidro 0,33L' },
  // Distillati / amari
  { id: 'whisky', name: 'Whisky (liscio)', abv: 40, units: 1.0, label: '🥃 Whisky' },
  { id: 'grappa', name: 'Grappa', abv: 40, units: 1.0, label: '🍶 Grappa' },
  { id: 'amaro', name: 'Amaro', abv: 30, units: 1.0, label: '🍶 Amaro' },
  { id: 'limoncello', name: 'Limoncello', abv: 28, units: 0.9, label: '🍋 Limoncello' },
  { id: 'spiked_coffee', name: 'Caffè Corretto', abv: 36, units: 0.7, label: '☕ Corretto' },
  // Analcolici
  { id: 'spritz_nonalcoholic', name: 'Spritz Analcolico', abv: 0, units: 0, label: '🍹 Analcolico' },
  { id: 'juice_tea', name: 'Succo / Tè', abv: 0, units: 0, label: '🧃 Succo' },
];

// BIRRE CON VARIETÀ + TAGLIA: queste quattro famiglie si scelgono prima per TIPO e poi
// per TAGLIA (Piccola 0,2L · Media 0,4L · Grande). Ogni taglia è un drink completo con le
// sue U.A. (units ≈ litri × gradi%). Renderizzate dal componente <BeerPicker/>.
export const BEER_FAMILIES = [
  {
    key: 'bionda', label: '🍺 Bionda', abv: 5,
    sizes: [
      { id: 'beer_blonde_s', name: 'Birra Bionda Piccola (0,2L)', abv: 5, units: 1.0, label: '🍺 Bionda Piccola 0,2L', size: 'Piccola 0,2L' },
      { id: 'beer_blonde_m', name: 'Birra Bionda Media (0,4L)', abv: 5, units: 2.0, label: '🍺 Bionda Media 0,4L', size: 'Media 0,4L' },
      { id: 'beer_blonde_l', name: 'Birra Bionda Grande (0,66L)', abv: 5, units: 3.3, label: '🍺 Bionda Grande 0,66L', size: 'Grande 0,66L' },
    ],
  },
  {
    key: 'rossa', label: '🍺 Rossa', abv: 5.5,
    sizes: [
      { id: 'beer_red_s', name: 'Birra Rossa/Ambrata Piccola (0,2L)', abv: 5.5, units: 1.1, label: '🍺 Rossa Piccola 0,2L', size: 'Piccola 0,2L' },
      { id: 'beer_red_m', name: 'Birra Rossa/Ambrata Media (0,4L)', abv: 5.5, units: 2.2, label: '🍺 Rossa Media 0,4L', size: 'Media 0,4L' },
      { id: 'beer_red_l', name: 'Birra Rossa/Ambrata Grande (0,66L)', abv: 5.5, units: 3.6, label: '🍺 Rossa Grande 0,66L', size: 'Grande 0,66L' },
    ],
  },
  {
    key: 'ipa', label: '🍺 IPA', abv: 6.5,
    sizes: [
      { id: 'beer_ipa_s', name: 'IPA/Artigianale Piccola (0,2L)', abv: 6.5, units: 1.3, label: '🍺 IPA Piccola 0,2L', size: 'Piccola 0,2L' },
      { id: 'beer_ipa_m', name: 'IPA/Artigianale Media (0,4L)', abv: 6.5, units: 2.6, label: '🍺 IPA Media 0,4L', size: 'Media 0,4L' },
      { id: 'beer_ipa_l', name: 'IPA/Artigianale Grande (0,5L)', abv: 6.5, units: 3.3, label: '🍺 IPA Grande 0,5L', size: 'Grande 0,5L' },
    ],
  },
  {
    key: 'doppiomalto', label: '🍺 Doppio Malto', abv: 8,
    sizes: [
      { id: 'beer_dm_s', name: 'Doppio Malto Piccola (0,2L)', abv: 8, units: 1.6, label: '🍺 Doppio Malto Piccola 0,2L', size: 'Piccola 0,2L' },
      { id: 'beer_dm_m', name: 'Doppio Malto Media (0,4L)', abv: 8, units: 3.2, label: '🍺 Doppio Malto Media 0,4L', size: 'Media 0,4L' },
      { id: 'beer_dm_l', name: 'Doppio Malto Grande (0,66L)', abv: 8, units: 5.3, label: '🍺 Doppio Malto Grande 0,66L', size: 'Grande 0,66L' },
    ],
  },
];

// ---------------------------------------------------------------------------
// CATEGORIE per i drink PERSONALIZZATI (utente) e per i drink dei BAR.
// Un drink custom NON ha un nome libero come identità: è definito da una CATEGORIA
// (traducibile) + volume + gradazione. In display si compone "categoria tradotta + taglia",
// così un francese vede "Bière 0,4L" anche se l'ha creato un italiano. Il nome libero
// eventuale è solo una nota (mostrata in corsivo), mai l'identità mostrata sul feed.
//
// `defaultAbv` è solo un valore iniziale suggerito nel form (l'utente lo può cambiare).
export const DRINK_TYPES = [
  { key: 'beer', emoji: '🍺', defaultAbv: 5 },
  { key: 'wine_red', emoji: '🍷', defaultAbv: 13 },
  { key: 'wine_white', emoji: '🍷', defaultAbv: 12 },
  { key: 'sparkling', emoji: '🥂', defaultAbv: 11 },
  { key: 'cocktail', emoji: '🍸', defaultAbv: 15 },
  { key: 'shot', emoji: '🥃', defaultAbv: 33 },
  { key: 'spirit', emoji: '🥃', defaultAbv: 40 },
  { key: 'amaro', emoji: '🍶', defaultAbv: 30 },
  { key: 'liqueur', emoji: '🍋', defaultAbv: 25 },
  { key: 'cider', emoji: '🍏', defaultAbv: 4.5 },
  { key: 'soft', emoji: '🥤', defaultAbv: 0 },
  { key: 'water', emoji: '💧', defaultAbv: 0 },
];

// Etichette categoria per lingua (usate per comporre il nome mostrato).
export const DRINK_TYPE_LABELS = {
  it: { beer: 'Birra', wine_red: 'Vino rosso', wine_white: 'Vino bianco', sparkling: 'Bollicine', cocktail: 'Cocktail', shot: 'Shot', spirit: 'Distillato', amaro: 'Amaro', liqueur: 'Liquore', cider: 'Sidro', soft: 'Analcolico', water: 'Acqua' },
  en: { beer: 'Beer', wine_red: 'Red wine', wine_white: 'White wine', sparkling: 'Sparkling', cocktail: 'Cocktail', shot: 'Shot', spirit: 'Spirit', amaro: 'Amaro', liqueur: 'Liqueur', cider: 'Cider', soft: 'Soft drink', water: 'Water' },
  fr: { beer: 'Bière', wine_red: 'Vin rouge', wine_white: 'Vin blanc', sparkling: 'Mousseux', cocktail: 'Cocktail', shot: 'Shot', spirit: 'Spiritueux', amaro: 'Amaro', liqueur: 'Liqueur', cider: 'Cidre', soft: 'Sans alcool', water: 'Eau' },
  es: { beer: 'Cerveza', wine_red: 'Vino tinto', wine_white: 'Vino blanco', sparkling: 'Espumante', cocktail: 'Cóctel', shot: 'Chupito', spirit: 'Destilado', amaro: 'Amaro', liqueur: 'Licor', cider: 'Sidra', soft: 'Refresco', water: 'Agua' },
};
