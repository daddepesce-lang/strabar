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

export const QUICK_DRINKS = [
  { name: 'Spritz (Campari/Aperol/Select)', abv: 11, units: 1.3, label: '🍹 Spritz' },
  { name: 'Birra Bionda Media (0,4L)', abv: 5, units: 2.0, label: '🍺 Birra Media' },
  { name: 'Calice Vino (Rosso/Bianco/Prosecco)', abv: 12.5, units: 1.3, label: '🍷 Vino' },
  { name: 'Shot (Tequila/Rhum/Chupito)', abv: 40, units: 1.3, label: '🥃 Shot' },
  { name: 'Acqua Fresca', abv: 0, units: 0, label: '💧 Acqua' },
  { name: 'Coca Cola / Soda', abv: 0, units: 0, label: '🥤 Soda' },
];

export const EXTRA_DRINKS = [
  // Cocktail
  { name: 'Negroni', abv: 24, units: 2.4, label: '🍸 Negroni' },
  { name: 'Americano', abv: 15, units: 1.4, label: '🍸 Americano' },
  { name: 'Gin Tonic', abv: 12, units: 1.6, label: '🍸 Gin Tonic' },
  { name: 'Mojito', abv: 13, units: 1.6, label: '🍹 Mojito' },
  { name: 'Margarita', abv: 20, units: 1.8, label: '🍸 Margarita' },
  { name: 'Cosmopolitan', abv: 18, units: 1.6, label: '🍸 Cosmopolitan' },
  { name: 'Aperol/Hugo Spritz Leggero', abv: 9, units: 1.1, label: '🍹 Hugo' },
  { name: 'Sangria', abv: 12, units: 1.5, label: '🍹 Sangria' },
  { name: 'Rum & Cola', abv: 15, units: 1.6, label: '🥃 Rum&Cola' },
  { name: 'Vodka Lemon', abv: 15, units: 1.6, label: '🥃 Vodka Lemon' },
  // Vino / bollicine
  { name: 'Calice Vino Rosso', abv: 13, units: 1.4, label: '🍷 Rosso' },
  { name: 'Calice Vino Bianco', abv: 12, units: 1.3, label: '🍷 Bianco' },
  { name: 'Prosecco / Spumante', abv: 11, units: 1.2, label: '🥂 Bollicine' },
  { name: 'Bellini / Mimosa', abv: 8, units: 1.0, label: '🍾 Bellini' },
  { name: 'Vino Dolce / Passito', abv: 15, units: 1.2, label: '🍷 Passito' },
  // Birre — tipo + taglia espliciti (Piccola 0,2L · Media 0,4L · Grande 0,66L)
  { name: 'Birra Bionda Piccola (0,2L)', abv: 5, units: 1.0, label: '🍺 Bionda Piccola 0,2L' },
  { name: 'Birra Bionda Media (0,4L)', abv: 5, units: 2.0, label: '🍺 Bionda Media 0,4L' },
  { name: 'Birra Bionda Grande (0,66L)', abv: 5, units: 3.3, label: '🍺 Bionda Grande 0,66L' },
  { name: 'Birra Rossa/Ambrata Media (0,4L)', abv: 5.5, units: 2.2, label: '🍺 Rossa Media 0,4L' },
  { name: 'Doppio Malto Piccola (0,2L)', abv: 8, units: 1.6, label: '🍺 Doppio Malto Piccola 0,2L' },
  { name: 'Doppio Malto Media (0,4L)', abv: 8, units: 3.2, label: '🍺 Doppio Malto Media 0,4L' },
  { name: 'Doppio Malto Grande (0,66L)', abv: 8, units: 5.3, label: '🍺 Doppio Malto Grande 0,66L' },
  { name: 'IPA/Artigianale Piccola (0,2L)', abv: 6.5, units: 1.3, label: '🍺 IPA Piccola 0,2L' },
  { name: 'IPA/Artigianale Media (0,4L)', abv: 6.5, units: 2.6, label: '🍺 IPA Media 0,4L' },
  { name: 'IPA/Artigianale Grande (0,5L)', abv: 6.5, units: 3.3, label: '🍺 IPA Grande 0,5L' },
  { name: 'Birra Analcolica (0,4L)', abv: 0.4, units: 0.2, label: '🍺 Analcolica 0,4L' },
  { name: 'Sidro (0,33L)', abv: 4.5, units: 1.5, label: '🍏 Sidro 0,33L' },
  // Distillati / amari
  { name: 'Whisky (liscio)', abv: 40, units: 1.0, label: '🥃 Whisky' },
  { name: 'Grappa', abv: 40, units: 1.0, label: '🍶 Grappa' },
  { name: 'Amaro', abv: 30, units: 1.0, label: '🍶 Amaro' },
  { name: 'Limoncello', abv: 28, units: 0.9, label: '🍋 Limoncello' },
  { name: 'Caffè Corretto', abv: 36, units: 0.7, label: '☕ Corretto' },
  // Analcolici
  { name: 'Spritz Analcolico', abv: 0, units: 0, label: '🍹 Analcolico' },
  { name: 'Succo / Tè', abv: 0, units: 0, label: '🧃 Succo' },
];
