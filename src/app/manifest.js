export default function manifest() {
  return {
    name: 'Strabar | Il Social Network degli Atleti da Bar',
    short_name: 'Strabar',
    description:
      'Traccia le tue sessioni alcoliche in tempo reale, tagga gli amici, fai check-in nei locali reali e pianifica i tuoi pub crawl.',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0f1117',
    theme_color: '#FF5E00',
    lang: 'it',
    categories: ['social', 'lifestyle', 'food'],
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any',
      },
      {
        src: '/icon-maskable.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'maskable',
      },
    ],
  };
}
