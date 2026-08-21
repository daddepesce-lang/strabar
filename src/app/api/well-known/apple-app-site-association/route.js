// Universal Links di iOS: dice ad Apple che l'app `<TEAM_ID>.app.strabar` gestisce i link
// di strabar.app. Servito su /.well-known/apple-app-site-association tramite il rewrite in
// next.config.mjs — così il file esce con Content-Type application/json, come pretende Apple
// (un file senza estensione in /public verrebbe servito come octet-stream).
//
// APPLE_TEAM_ID: il Team ID di 10 caratteri (developer.apple.com → Membership).
// Senza l'env var il file resta sintatticamente valido ma senza appID: i link si aprono in
// Safari invece che nell'app, senza altri effetti.
//
// Nota: Apple mette in cache questo file tramite un proprio CDN. Dopo un cambiamento può
// volerci qualche ora, oppure si reinstalla l'app per forzare il refresh.

export const dynamic = 'force-static';

const BUNDLE_ID = 'app.strabar';

export function GET() {
  const teamId = (process.env.APPLE_TEAM_ID || '').trim();
  const appIDs = teamId ? [`${teamId}.${BUNDLE_ID}`] : [];

  return Response.json(
    {
      applinks: {
        details: [
          {
            appIDs,
            // Tutto il sito apre nell'app: percorsi, profili, itinerari condivisi, reset
            // password. Il guscio nativo traduce l'URL in una navigazione interna.
            components: [{ '/': '/*', comment: 'tutti i link di strabar.app' }],
          },
        ],
      },
      // Autofill delle credenziali dal Portachiavi iCloud nel login email/password.
      webcredentials: { apps: appIDs },
    },
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
