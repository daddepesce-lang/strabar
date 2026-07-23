// Supabase Edge Function: invia notifiche Web Push ai dispositivi di uno o più utenti.
// Deploy:  supabase functions deploy send-push
// Secrets richiesti (supabase secrets set ...):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (es. mailto:tua@email)
//   SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY sono già disponibili nelle Edge Functions.
//
// Body atteso (JSON): { user_ids: string[], title: string, body: string, url?: string }

import webpush from "npm:web-push@3.6.7";
import { createClient } from "jsr:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    const { user_ids, title, body, url, tag, renotify, platforms } = await req.json();
    if (!Array.isArray(user_ids) || user_ids.length === 0) {
      return new Response(JSON.stringify({ error: "user_ids mancanti" }), { status: 400, headers: cors });
    }

    const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY");
    const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY");
    const VAPID_SUBJECT = Deno.env.get("VAPID_SUBJECT") || "mailto:admin@strabar.app";
    if (!VAPID_PUBLIC || !VAPID_PRIVATE) {
      return new Response(JSON.stringify({ error: "VAPID keys non configurate" }), { status: 500, headers: cors });
    }
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC, VAPID_PRIVATE);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    let query = supabase
      .from("push_subscriptions")
      .select("id, subscription, platform")
      .in("user_id", user_ids);
    // Filtro piattaforma opzionale (es. notifica live → solo 'android'). Le subscription
    // storiche senza platform (null) vengono escluse quando si filtra.
    if (Array.isArray(platforms) && platforms.length > 0) query = query.in("platform", platforms);
    const { data: subs, error } = await query;
    if (error) throw error;

    const payload = JSON.stringify({
      title: title || "Strabar 🍻",
      body: body || "",
      url: url || "/",
      ...(tag ? { tag } : {}),
      ...(renotify != null ? { renotify: !!renotify } : {}),
    });

    let sent = 0;
    const stale: string[] = [];
    await Promise.all((subs || []).map(async (row) => {
      try {
        await webpush.sendNotification(row.subscription, payload);
        sent++;
      } catch (err) {
        // 404/410 = subscription scaduta → la rimuoviamo
        const code = (err as { statusCode?: number }).statusCode;
        if (code === 404 || code === 410) stale.push(row.id);
      }
    }));

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
