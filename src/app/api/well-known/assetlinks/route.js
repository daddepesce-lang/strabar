// Digital Asset Links: dice ad Android che l'app `app.strabar` può aprire i link di
// strabar.app (App Links verificati → i link condivisi su WhatsApp aprono l'app, non il
// browser). Servito su /.well-known/assetlinks.json tramite il rewrite in next.config.mjs.
//
// ANDROID_CERT_SHA256: impronte SHA-256 dei certificati di firma, separate da virgola.
// Ne servono DUE quando si usa Play App Signing: la chiave di upload e quella con cui
// Google ri-firma l'app (Play Console → Integrità dell'app → Firma dell'app).
// Senza l'env var il file resta valido ma con lista vuota: la verifica non passa e i link
// continuano semplicemente ad aprirsi nel browser (nessuna rottura).

// File statico: generato al build e servito dalla CDN, zero invocazioni serverless.
export const dynamic = 'force-static';

const PACKAGE_NAME = 'app.strabar';

export function GET() {
  const fingerprints = (process.env.ANDROID_CERT_SHA256 || '')
    .split(',')
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);

  return Response.json(
    [
      {
        relation: ['delegate_permission/common.handle_all_urls'],
        target: {
          namespace: 'android_app',
          package_name: PACKAGE_NAME,
          sha256_cert_fingerprints: fingerprints,
        },
      },
    ],
    { headers: { 'Cache-Control': 'public, max-age=3600' } }
  );
}
