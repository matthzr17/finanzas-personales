// Tareas programadas de Mis Finanzas
//  - aviso:    lunes 9:00 am (Mérida). Notificación con el cierre de la semana anterior.
//  - respaldo: domingo 8:00 pm (Mérida). Envía el respaldo completo por correo (Resend).
//  - prueba:   el usuario con sesión pide una notificación de prueba.
// Llaves privadas en public.config_privada (RLS sin políticas: solo service_role la lee).
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.45.4";
import webpush from "npm:web-push@3.6.7";

const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
  auth: { persistSession: false },
});
const APP_URL = "https://matthzr17.github.io/finanzas-personales/";
const TABLAS = ["cuentas", "categorias", "deudas", "metas", "recurrentes", "movimientos"];
const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret",
};
const json = (b: unknown, status = 200) => new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });

async function config(): Promise<Record<string, string>> {
  const { data, error } = await sb.from("config_privada").select("clave, valor");
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((r) => [r.clave, r.valor]));
}

const mxn = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
// Fecha local de Mérida (UTC-6 todo el año)
const hoyMerida = () => new Date(Date.now() - 6 * 3600 * 1000).toISOString().slice(0, 10);
const addDias = (f: string, n: number) => { const d = new Date(f + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const lunesDe = (f: string) => { const d = new Date(f + "T12:00:00Z"); return addDias(f, -((d.getUTCDay() + 6) % 7)); };
const rango = (l: string) => { const a = new Date(l + "T12:00:00Z"), b = new Date(addDias(l, 6) + "T12:00:00Z");
  return a.getUTCMonth() === b.getUTCMonth() ? `${a.getUTCDate()}–${b.getUTCDate()} ${MESES[b.getUTCMonth()]}` : `${a.getUTCDate()} ${MESES[a.getUTCMonth()]} – ${b.getUTCDate()} ${MESES[b.getUTCMonth()]}`; };

async function enviarPush(cfg: Record<string, string>, userId: string, payload: Record<string, string>) {
  webpush.setVapidDetails(cfg.vapid_subject || "mailto:contacto@example.com", cfg.vapid_public, cfg.vapid_private);
  const { data: subs } = await sb.from("push_subs").select("*").eq("user_id", userId);
  let enviadas = 0;
  const errores: string[] = [];
  for (const s of subs ?? []) {
    try {
      await webpush.sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, JSON.stringify(payload), { TTL: 86400 });
      enviadas++;
    } catch (e) {
      const code = (e as { statusCode?: number }).statusCode;
      errores.push(String(code || (e as Error).message));
      if (code === 404 || code === 410) await sb.from("push_subs").delete().eq("id", s.id); // suscripción vencida
    }
  }
  return { suscripciones: subs?.length ?? 0, enviadas, errores };
}

async function avisoSemanal(cfg: Record<string, string>) {
  const lunes = addDias(lunesDe(hoyMerida()), -7);
  const domingo = addDias(lunes, 6);
  const { data: usuarios } = await sb.from("push_subs").select("user_id");
  const ids = [...new Set((usuarios ?? []).map((u) => u.user_id))];
  const res: unknown[] = [];
  for (const uid of ids) {
    const [{ data: aj }, { data: cats }, { data: movs }] = await Promise.all([
      sb.from("ajustes").select("presupuesto_semanal").eq("user_id", uid).maybeSingle(),
      sb.from("categorias").select("presupuesto_semanal, tipo, archivada").eq("user_id", uid),
      sb.from("movimientos").select("tipo, monto, msi_meses").eq("user_id", uid).gte("fecha", lunes).lte("fecha", domingo),
    ]);
    const total = Number(aj?.presupuesto_semanal) ||
      (cats ?? []).filter((c) => c.tipo === "gasto" && !c.archivada).reduce((a, c) => a + Number(c.presupuesto_semanal || 0), 0);
    if (!total || !(movs ?? []).some((m) => !m.msi_meses)) { res.push({ uid, omitido: true }); continue; }
    const gastado = (movs ?? []).filter((m) => m.tipo === "gasto" && !m.msi_meses).reduce((a, m) => a + Number(m.monto), 0);
    const sobra = Math.round((total - gastado) * 100) / 100;
    const payload = sobra > 0
      ? { title: "¡Semana cumplida! 🎉", body: `Semana ${rango(lunes)}: gastaste ${mxn(gastado)} de ${mxn(total)}. Te sobraron ${mxn(sobra)}: apártalos en tu cuenta de ahorro para no gastarlos.`, url: APP_URL, tag: "aviso-" + lunes }
      : { title: "Rebasaste tu presupuesto ⚠️", body: `Semana ${rango(lunes)}: gastaste ${mxn(gastado)} de ${mxn(total)} (+${mxn(-sobra)}). Esta semana intenta compensarlo.`, url: APP_URL, tag: "aviso-" + lunes };
    res.push({ uid, ...(await enviarPush(cfg, uid, payload)) });
  }
  return res;
}

async function respaldoSemanal(cfg: Record<string, string>) {
  if (!cfg.resend_api_key) return { omitido: "Falta resend_api_key en config_privada" };
  const { data: lista, error } = await sb.auth.admin.listUsers({ perPage: 100 });
  if (error) throw error;
  const res: unknown[] = [];
  for (const u of lista.users) {
    const { data: aj } = await sb.from("ajustes").select("*").eq("user_id", u.id).maybeSingle();
    if (aj && aj.respaldo_correo === false) { res.push({ email: u.email, omitido: "desactivado" }); continue; }
    const datos: Record<string, unknown> = { app: "mis-finanzas", version: 2, exportado: new Date().toISOString() };
    for (const t of TABLAS) {
      const { data } = await sb.from(t).select("*").eq("user_id", u.id);
      datos[t] = (data ?? []).map(({ user_id: _u, ...r }) => r);
    }
    if (aj) { const { user_id: _u, actualizado: _a, ...resto } = aj; datos.ajustes = resto; }
    const fecha = hoyMerida();
    const contenido = btoa(unescape(encodeURIComponent(JSON.stringify(datos))));
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${cfg.resend_api_key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: cfg.resend_from || "Mis Finanzas <onboarding@resend.dev>",
        to: [u.email],
        subject: `Respaldo semanal de Mis Finanzas · ${fecha}`,
        html: `<p>Hola,</p><p>Adjunto va el respaldo completo de tus finanzas al ${fecha} (${(datos.movimientos as unknown[]).length} movimientos).</p>
               <p>Para restaurarlo: Mis Finanzas → Más → Respaldo → Importar respaldo.</p>`,
        attachments: [{ filename: `respaldo_finanzas_${fecha}.json`, content: contenido }],
      }),
    });
    res.push({ email: u.email, status: r.status, respuesta: (await r.text()).slice(0, 200) });
  }
  return res;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  try {
    const cfg = await config();
    const body = await req.json().catch(() => ({}));
    const tarea = body.tarea as string;

    if (tarea === "prueba") {
      const token = (req.headers.get("Authorization") || "").replace("Bearer ", "");
      const { data, error } = await sb.auth.getUser(token);
      if (error || !data.user) return json({ error: "Sesión no válida" }, 401);
      const r = await enviarPush(cfg, data.user.id, { title: "Mis Finanzas", body: "¡Las notificaciones funcionan! Cada lunes a las 9:00 am te aviso cómo cerraste la semana.", url: APP_URL, tag: "prueba" });
      if (!r.enviadas) return json({ error: r.suscripciones ? "No se pudo entregar la notificación" : "Este dispositivo no tiene notificaciones activadas", ...r }, 400);
      return json(r);
    }

    if (!cfg.cron_secret || req.headers.get("x-cron-secret") !== cfg.cron_secret) return json({ error: "No autorizado" }, 401);
    if (tarea === "aviso") return json({ tarea, resultado: await avisoSemanal(cfg) });
    if (tarea === "respaldo") return json({ tarea, resultado: await respaldoSemanal(cfg) });
    if (tarea === "diagnostico") return json({ tarea, resultado: await enviarPush(cfg, String(body.user_id), { title: "Mis Finanzas", body: "Notificación de diagnóstico", url: APP_URL, tag: "diag" }) });
    return json({ error: "Tarea desconocida" }, 400);
  } catch (e) {
    console.error(e);
    return json({ error: (e as Error).message }, 500);
  }
});
