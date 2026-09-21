// Test dell'estrazione CITTÀ da un indirizzo (src/lib/cityFromAddress.js).
//
// Perché ha i suoi test: da questa funzione dipendono il titolo delle pagine pubbliche,
// lo slug dei percorsi condivisi e soprattutto la pagina città dei locali (/locali/dolo).
// Sbagliare significa archiviare un bar di Mira sotto Venezia — cioè una pagina pubblica
// che dice il falso, l'unica cosa che una pagina SEO non può permettersi.
//
// I casi sono indirizzi VERI presi dalla directory dei locali, nei due formati che
// arrivano dai geocoder (Nominatim/OSM e Google) più quelli scritti a mano dai gestori.
//   npm test

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cityFromAddress, cityFromVenueAddress } from '../src/lib/cityFromAddress.js';

test('Nominatim: il comune, non la provincia che lo segue', () => {
  // "…, Mira, Venezia, Veneto, …" → la provincia (Venezia) precede la regione: il comune è Mira.
  assert.equal(
    cityFromAddress("Momi's Pub, 64, Via Botte, Ca' Caldara, Olmo di Mira, Mira, Venezia, Veneto, 30034, Italia"),
    'Mira'
  );
  assert.equal(
    cityFromAddress('Fabbrica di Pedavena, Via Paolo Errera, Mirano, Venezia, Veneto, 30035, Italia'),
    'Mirano'
  );
  assert.equal(
    cityFromAddress('Loredana, Lungomare Alberto Sordi, Lido di Jesolo, Jesolo, Venezia, Veneto, 30016, Italia'),
    'Jesolo'
  );
});

test('Nominatim: capoluogo con città metropolitana esplicita', () => {
  assert.equal(
    cityFromAddress('Cantina Do Mori, Calle Do Mori, San Polo, Venezia, Città Metropolitana di Venezia, Veneto, 30125, Italia'),
    'Venezia'
  );
});

test('indirizzo senza provincia: non si scarta il comune', () => {
  // Guardia: togliendo il segmento pre-regione resterebbe il nome del locale, non un comune.
  assert.equal(cityFromAddress('Bar X, Via Roma, Mirano, Veneto, 30035, Italia'), 'Mirano');
});

test('formato Google (CAP + sigla provincia)', () => {
  assert.equal(cityFromAddress('Calle Do Mori, 429, 30125 Venezia VE, Italia'), 'Venezia');
});

test('mai un quartiere, una via o una regione al posto del comune', () => {
  assert.equal(cityFromAddress('Fondamenta dei Frari, San Polo, Venezia, Veneto, 30125, Italia'), 'Venezia');
  assert.equal(cityFromAddress('Veneto, Italia'), null);
});

test('stringhe che non sono indirizzi → nessuna città', () => {
  assert.equal(cityFromAddress('Momi\'s Pub'), null);
  assert.equal(cityFromAddress('trovato tramite ricerca'), null);
  assert.equal(cityFromAddress(''), null);
  assert.equal(cityFromAddress(null), null);
});

test('indirizzi dei locali scritti a mano: accettati, ma con gli stessi filtri', () => {
  assert.equal(cityFromVenueAddress('Via Belvedere 3, Mirano'), 'Mirano');
  assert.equal(cityFromVenueAddress('Via Cantiere 1, Dolo (VE)'), 'Dolo');
  // Un solo segmento è il nome del locale, non un indirizzo.
  assert.equal(cityFromVenueAddress('Harley\'s Pub'), null);
  // Nessun segmento plausibile come comune.
  assert.equal(cityFromVenueAddress('Via Roma, 12'), null);
});
