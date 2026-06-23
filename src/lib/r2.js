import 'server-only';
import {
  S3Client,
  PutObjectCommand,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';

// Client Cloudflare R2 (S3-compatibile). SOLO server: usa le chiavi segrete R2_* che NON
// devono mai arrivare al browser. R2 ha egress gratuito → i file multimediali stanno qui,
// così l'egress di Supabase Storage si azzera. Il Postgres conserva solo le stringhe URL.
const BUCKET = process.env.R2_BUCKET_NAME;
const PUBLIC_URL = (process.env.R2_PUBLIC_URL || '').replace(/\/+$/, '');

export const isR2Configured = !!(
  process.env.R2_ENDPOINT &&
  process.env.R2_ACCESS_KEY_ID &&
  process.env.R2_SECRET_ACCESS_KEY &&
  BUCKET &&
  PUBLIC_URL
);

let _client = null;
function client() {
  if (!_client) {
    _client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return _client;
}

// URL pubblico (immutabile) di un oggetto R2.
export function r2PublicUrl(key) {
  return `${PUBLIC_URL}/${key.replace(/^\/+/, '')}`;
}

// Carica un oggetto e ritorna la sua URL pubblica. Cache lunga: i nomi file sono unici →
// 1 anno di cache su browser/CDN, niente ri-download della stessa foto.
export async function r2Put(key, body, contentType) {
  await client().send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: body,
    ContentType: contentType || 'application/octet-stream',
    CacheControl: 'public, max-age=31536000, immutable',
  }));
  return r2PublicUrl(key);
}

// Cancella tutti gli oggetti sotto un prefisso (es. media/<userId>/). Usato per il diritto
// all'oblio quando un utente elimina l'account.
export async function r2DeletePrefix(prefix) {
  let token;
  let deleted = 0;
  do {
    const list = await client().send(new ListObjectsV2Command({ Bucket: BUCKET, Prefix: prefix, ContinuationToken: token }));
    const objs = (list.Contents || []).map((o) => ({ Key: o.Key }));
    if (objs.length) {
      await client().send(new DeleteObjectsCommand({ Bucket: BUCKET, Delete: { Objects: objs } }));
      deleted += objs.length;
    }
    token = list.IsTruncated ? list.NextContinuationToken : undefined;
  } while (token);
  return deleted;
}
