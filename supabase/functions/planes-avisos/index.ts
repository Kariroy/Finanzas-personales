// Supabase Edge Function "planes-avisos": manda las notificaciones de las rutinas de Planes.
//
// - Cada minuto la llama pg_cron (ver supabase/9-planes-avisos.sql) con el header x-cron-secret:
//   avisa las rutinas con hora que tocan ahora y todavía no están marcadas.
// - Desde la app, con la sesión iniciada y { test: true }: manda un aviso de prueba
//   a los dispositivos de esa persona.
//
// Secretos que necesita (Edge Functions → Secrets): VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY,
// CRON_SECRET y, opcional, VAPID_SUBJECT ("mailto:tu@email"). SUPABASE_URL y
// SUPABASE_SERVICE_ROLE_KEY ya los pone Supabase.
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const SLOT_NAMES = { manana: "mañana", tarde: "tarde", noche: "noche", libre: "" };
const WINDOW_MIN = 10;          // si el aviso se atrasa, se manda igual dentro de estos minutos
const DEFAULT_TZ = "America/Montevideo";
const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS"
};

// Fecha y hora local en una zona horaria: { day: "AAAA-MM-DD", minutes, dow (0 = lunes) }.
export function localNow(now, tz) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23"
  }).formatToParts(now);
  const get = (t) => parts.find((p) => p.type === t).value;
  return {
    day: get("year") + "-" + get("month") + "-" + get("day"),
    minutes: Number(get("hour")) * 60 + Number(get("minute")),
    dow: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(get("weekday"))
  };
}

// Rutinas para avisar ahora: con hora, programadas para hoy, ya creadas, sin marcar,
// y cuya hora pasó hace menos de WINDOW_MIN minutos.
export function dueRoutines(data, local) {
  const routines = data && Array.isArray(data.routines) ? data.routines : [];
  const done = (data && data.routineDone && data.routineDone[local.day]) || {};
  return routines.filter((r) => {
    if (!r || typeof r.time !== "string" || !/^\d\d:\d\d$/.test(r.time)) return false;
    if (!Array.isArray(r.days) || r.days.indexOf(local.dow) < 0) return false;
    if (r.created && r.created > local.day) return false;
    if (done[r.id]) return false;
    const [h, m] = r.time.split(":").map(Number);
    const diff = local.minutes - (h * 60 + m);
    return diff >= 0 && diff < WINDOW_MIN;
  });
}

function reply(body, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
}

async function send(sb, sub, payload) {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      payload, { TTL: 3600 }
    );
    return true;
  } catch (e) {
    // El dispositivo ya no existe (desinstalaste la app o borraste los permisos): se olvida.
    if (e && (e.statusCode === 404 || e.statusCode === 410)) await sb.from("planes_push").delete().eq("id", sub.id);
    else console.error("push", e && e.statusCode, e && e.body);
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: CORS });

  const sb = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false } });
  webpush.setVapidDetails(
    Deno.env.get("VAPID_SUBJECT") || "mailto:avisos@planes.app",
    Deno.env.get("VAPID_PUBLIC_KEY"),
    Deno.env.get("VAPID_PRIVATE_KEY")
  );
  let body = {};
  try { body = await req.json(); } catch (_) { /* sin cuerpo */ }

  // Aviso de prueba desde la app (con la sesión de la persona).
  if (body && body.test) {
    const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
    const { data: u, error } = await sb.auth.getUser(token);
    if (error || !u || !u.user) return reply({ error: "Sesión no válida" }, 401);
    const { data: subs } = await sb.from("planes_push").select("*").eq("user_id", u.user.id);
    if (!subs || !subs.length) return reply({ error: "Este usuario no tiene avisos activados" }, 404);
    const payload = JSON.stringify({ title: "✓ Los avisos funcionan", body: "Así te van a llegar los recordatorios de tus rutinas.", tag: "prueba", url: "/planes/?rutinas" });
    let sent = 0;
    for (const s of subs) if (await send(sb, s, payload)) sent++;
    return reply({ sent });
  }

  // Llamada de cada minuto (pg_cron).
  const secret = Deno.env.get("CRON_SECRET");
  if (!secret || req.headers.get("x-cron-secret") !== secret) return reply({ error: "no autorizado" }, 401);

  const { data: subs, error } = await sb.from("planes_push").select("*");
  if (error) return reply({ error: error.message }, 500);
  if (!subs || !subs.length) return reply({ sent: 0 });

  const users = [...new Set(subs.map((s) => s.user_id))];
  const { data: rows, error: e2 } = await sb.from("planes_datos").select("user_id, data").in("user_id", users);
  if (e2) return reply({ error: e2.message }, 500);
  const byUser = new Map((rows || []).map((r) => [r.user_id, r.data]));

  const now = new Date();
  let sent = 0;
  for (const uid of users) {
    const mine = subs.filter((s) => s.user_id === uid);
    let local;
    try { local = localNow(now, mine[0].tz || DEFAULT_TZ); } catch (_) { local = localNow(now, DEFAULT_TZ); }
    for (const r of dueRoutines(byUser.get(uid), local)) {
      // Reservar el aviso: si la fila ya existe, ya se mandó (no se repite).
      const { error: dup } = await sb.from("planes_push_log").insert({ user_id: uid, routine_id: r.id, day: local.day });
      if (dup) continue;
      const when = r.time + (SLOT_NAMES[r.slot] ? " · " + SLOT_NAMES[r.slot] : "");
      const payload = JSON.stringify({
        title: "↻ " + r.name,
        body: when + " — tocá para marcarla",
        tag: "rutina-" + r.id + "-" + local.day,
        url: "/planes/?rutinas"
      });
      for (const s of mine) if (await send(sb, s, payload)) sent++;
    }
  }
  return reply({ sent });
});
