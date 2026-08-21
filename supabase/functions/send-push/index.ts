// Supabase Edge Function: invia notifiche ai dispositivi di uno o più utenti.
//
// Tre trasporti, scelti in base a `push_subscriptions.kind`:
//   'webpush' → Web Push VAPID (PWA e browser: come è sempre stato)
//   'fcm'     → Firebase Cloud Messaging HTTP v1 (app Android dallo store)
//   'apns'    → Apple Push Notification service (app iOS dallo store)
// I chiamanti NON cambiano: l'alert guida (pg_cron), la notifica live, le notifiche social
// e le campagne admin passano tutte da qui e parlano solo di user_id/title/body/url.
//
// Deploy:  supabase functions deploy send-push
//
// Secrets (supabase secrets set ...):
//   Web Push  VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (es. mailto:tua@email)
//   Android   FCM_PROJECT_ID, FCM_CLIENT_EMAIL, FCM_PRIVATE_KEY      (service account Firebase)
//   iOS       APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY, APNS_TOPIC (= app.strabar),
//             APNS_HOST (api.push.apple.com in produzione, api.sandbox.push.apple.com in debug)
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già disponibili nelle Edge Functions.
// Ogni trasporto è indipendente: se i secret di FCM/APNs mancano, quei dispositivi vengono
// saltati e il Web Push continua a funzionare come prima.
//
// Body atteso (JSON): { user_ids: string[], title, body, url?, tag?, renotify?, platforms? }

import webpush from "npm:web-push@3.6.7";
import { importPKCS8, SignJWT } from "npm:jose@5.9.6";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

type Row = {
  id: string;
  kind: string | null;
  token: string | null;
  subscription: unknown;
  platform: string | null;
};

type Payload = {
  title: string;
  body: string;
  url: string;
  tag?: string;
  renotify?: boolean;
};

// Le chiavi PEM nei secret arrivano spesso con i newline scappati ("\n"): li ripristiniamo.
const pem = (value: string) => value.replace(/\\n/g, "\n").trim();

// ---------------------------------------------------------------------------
// Android — FCM HTTP v1
// ---------------------------------------------------------------------------

let fcmToken: { value: string; expiresAt: number } | null = null;

// Access token OAuth2 dal service account. Vale un'ora: lo teniamo in memoria e lo
// riusiamo per tutte le invocazioni che l'istanza della function serve.
async function fcmAccessToken(clientEmail: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (fcmToken && fcmToken.expiresAt > now + 60) return fcmToken.value;

  const key = await importPKCS8(pem(privateKey), "RS256");
  const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
    .setProtectedHeader({ alg: "RS256", typ: "JWT" })
    .setIssuer(clientEmail)
    .setSubject(clientEmail)
    .setAudience("https://oauth2.googleapis.com/token")
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(key);

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!res.ok) throw new Error(`OAuth FCM fallito (${res.status}): ${await res.text()}`);
  const json = await res.json();
  fcmToken = { value: json.access_token, expiresAt: now + (json.expires_in || 3600) };
  return fcmToken.value;
}

/** Invia a un token FCM. Ritorna 'sent' | 'stale' | 'error'. */
async function sendFcm(
  accessToken: string,
  projectId: string,
  token: string,
  p: Payload,
): Promise<"sent" | "stale" | "error"> {
  const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        token,
        notification: { title: p.title, body: p.body },
        // `url` viaggia nei data: il guscio nativo lo legge al tap sulla notifica.
        data: { url: p.url, ...(p.tag ? { tag: p.tag } : {}) },
        android: {
          priority: "HIGH",
          notification: {
            icon: "ic_stat_icon",
            color: "#FF3B2F",
            // Stesso tag = la notifica si SOSTITUISCE invece di accumularsi: è ciò che rende
            // possibile la notifica "live" che si aggiorna durante la sessione.
            ...(p.tag ? { tag: p.tag } : {}),
            // `renotify: false` = aggiornamento silenzioso (notifica live): lo mandiamo sul
            // canale a importanza bassa creato dal guscio nativo, così non suona a ogni
            // refresh. Su Android 8+ è il CANALE a decidere suono e vibrazione.
            ...(p.renotify === false ? { channel_id: "strabar-live" } : {}),
          },
        },
      },
    }),
  });

  if (res.ok) return "sent";
  const text = await res.text();
  // UNREGISTERED / INVALID_ARGUMENT su un token = dispositivo non più raggiungibile.
  if (res.status === 404 || (res.status === 400 && text.includes("INVALID_ARGUMENT"))) return "stale";
  console.error(`FCM ${res.status}: ${text}`);
  return "error";
}

// ---------------------------------------------------------------------------
// iOS — APNs (autenticazione a token, chiave .p8)
// ---------------------------------------------------------------------------

let apnsJwt: { value: string; expiresAt: number } | null = null;

async function apnsAuthToken(keyId: string, teamId: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  if (apnsJwt && apnsJwt.expiresAt > now + 60) return apnsJwt.value;

  const key = await importPKCS8(pem(privateKey), "ES256");
  const value = await new SignJWT({})
    .setProtectedHeader({ alg: "ES256", kid: keyId })
    .setIssuer(teamId)
    .setIssuedAt(now)
    .sign(key);
  // Apple accetta un token per max 1 ora; ne teniamo uno da 50 minuti.
  apnsJwt = { value, expiresAt: now + 3000 };
  return value;
}

// apns-collapse-id deve stare in 64 byte ASCII, mentre i nostri tag contengono URL ed emoji:
// li riduciamo a un hash breve e stabile (stesso tag → stesso id → notifica sostituita).
function collapseId(tag?: string): string | null {
  if (!tag) return null;
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < tag.length; i++) {
    h1 = (h1 ^ tag.charCodeAt(i)) * 0x01000193 >>> 0;
    h2 = (h2 + tag.charCodeAt(i) * 31) >>> 0;
  }
  return `t${h1.toString(36)}${h2.toString(36)}`;
}

/** Invia a un token APNs. Ritorna 'sent' | 'stale' | 'error'. */
async function sendApns(
  jwt: string,
  host: string,
  topic: string,
  token: string,
  p: Payload,
): Promise<"sent" | "stale" | "error"> {
  const cid = collapseId(p.tag);
  const res = await fetch(`https://${host}/3/device/${token}`, {
    method: "POST",
    headers: {
      authorization: `bearer ${jwt}`,
      "apns-topic": topic,
      "apns-push-type": "alert",
      "apns-priority": "10",
      ...(cid ? { "apns-collapse-id": cid } : {}),
    },
    body: JSON.stringify({
      aps: {
        alert: { title: p.title, body: p.body },
        sound: p.renotify === false ? undefined : "default",
        "mutable-content": 1,
      },
      url: p.url,
    }),
  });

  if (res.ok) return "sent";
  const text = await res.text();
  // 410 Unregistered, 400 BadDeviceToken = il dispositivo non esiste più.
  if (res.status === 410 || text.includes("BadDeviceToken") || text.includes("Unregistered")) return "stale";
  console.error(`APNs ${res.status}: ${text}`);
  return "error";
}

// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { user_ids, title, body, url, tag, renotify, platforms } = await req.json();
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids mancanti" }), { status: 400, headers: cors });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = supabase
      .from("push_subscriptions")
      .select("id, kind, token, subscription, platform")
      .in("user_id", user_ids);
    // Filtro piattaforma opzionale (es. notifica live → solo 'android'). Le subscription
    // storiche senza platform (null) vengono escluse quando si filtra.
    if (Array.isArray(platforms) && platforms.length > 0) query = query.in("platform", platforms);
    const { data, error } = await query;
    if (error) throw error;
    const rows: Row[] = data || [];

    const payload: Payload = {
      title: title || "Strabar 🍻",
      body: body || "",
      url: url || "/",
      ...(tag ? { tag } : {}),
      ...(renotify != null ? { renotify: !!renotify } : {}),
    };

    let sent = 0;
    const stale: string[] = [];
    const jobs: Promise<void>[] = [];

    // --- Web Push (PWA e browser) -------------------------------------------
    const webRows = rows.filter((r) => (r.kind || "webpush") === "webpush" && r.subscription);
    if (webRows.length) {
      const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
      const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
      const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@strabar.app";
      if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
        console.error("VAPID keys non configurate: Web Push saltato");
      } else {
        webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);
        const json = JSON.stringify(payload);
        for (const row of webRows) {
          jobs.push(
            webpush
              .sendNotification(row.subscription, json)
              .then(() => {
                sent++;
              })
              .catch((err: { statusCode?: number }) => {
                // 404/410 = subscription scaduta → la rimuoviamo
                if (err.statusCode === 404 || err.statusCode === 410) stale.push(row.id);
              }),
          );
        }
      }
    }

    // --- Android nativo (FCM) ------------------------------------------------
    const fcmRows = rows.filter((r) => r.kind === "fcm" && r.token);
    if (fcmRows.length) {
      const projectId = Deno.env.get("FCM_PROJECT_ID");
      const clientEmail = Deno.env.get("FCM_CLIENT_EMAIL");
      const privateKey = Deno.env.get("FCM_PRIVATE_KEY");
      if (!projectId || !clientEmail || !privateKey) {
        console.error("Secret FCM mancanti: dispositivi Android nativi saltati");
      } else {
        try {
          const accessToken = await fcmAccessToken(clientEmail, privateKey);
          for (const row of fcmRows) {
            jobs.push(
              sendFcm(accessToken, projectId, row.token!, payload).then((outcome) => {
                if (outcome === "sent") sent++;
                else if (outcome === "stale") stale.push(row.id);
              }),
            );
          }
        } catch (err) {
          console.error("FCM non disponibile:", (err as Error).message);
        }
      }
    }

    // --- iOS nativo (APNs) --------------------------------------------------
    const apnsRows = rows.filter((r) => r.kind === "apns" && r.token);
    if (apnsRows.length) {
      const keyId = Deno.env.get("APNS_KEY_ID");
      const teamId = Deno.env.get("APNS_TEAM_ID");
      const privateKey = Deno.env.get("APNS_PRIVATE_KEY");
      const topic = Deno.env.get("APNS_TOPIC") || "app.strabar";
      const host = Deno.env.get("APNS_HOST") || "api.push.apple.com";
      if (!keyId || !teamId || !privateKey) {
        console.error("Secret APNs mancanti: dispositivi iOS nativi saltati");
      } else {
        try {
          const jwt = await apnsAuthToken(keyId, teamId, privateKey);
          for (const row of apnsRows) {
            jobs.push(
              sendApns(jwt, host, topic, row.token!, payload).then((outcome) => {
                if (outcome === "sent") sent++;
                else if (outcome === "stale") stale.push(row.id);
              }),
            );
          }
        } catch (err) {
          console.error("APNs non disponibile:", (err as Error).message);
        }
      }
    }

    await Promise.all(jobs);
    if (stale.length) await supabase.from("push_subscriptions").delete().in("id", stale);

    return new Response(JSON.stringify({ sent, removed: stale.length }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String((err as Error).message || err) }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
