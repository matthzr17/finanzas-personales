// Capa de datos: misma interfaz para Supabase (modo real) y localStorage (modo demo).
(() => {
  'use strict';

  const TABLES = ['cuentas', 'categorias', 'deudas', 'metas', 'recurrentes', 'movimientos'];
  const COLS = {
    cuentas: ['id', 'nombre', 'tipo', 'banco', 'saldo_inicial', 'limite_credito', 'dia_corte', 'dia_pago', 'color', 'orden', 'archivada', 'creado'],
    categorias: ['id', 'nombre', 'tipo', 'icono', 'color', 'presupuesto_mensual', 'presupuesto_semanal', 'archivada', 'creado'],
    deudas: ['id', 'nombre', 'persona', 'direccion', 'monto', 'fecha_inicio', 'fecha_limite', 'notas', 'telefono', 'saldada', 'creado'],
    metas: ['id', 'nombre', 'monto_objetivo', 'ahorrado_inicial', 'fecha_objetivo', 'cuenta_ids', 'color', 'completada', 'creado'],
    recurrentes: ['id', 'nombre', 'tipo', 'monto', 'categoria_id', 'cuenta_id', 'frecuencia', 'proxima', 'es_suscripcion', 'activo', 'creado'],
    movimientos: ['id', 'fecha', 'tipo', 'monto', 'cuenta_id', 'cuenta_destino_id', 'categoria_id', 'deuda_id', 'meta_id', 'recurrente_id', 'msi_meses', 'nota', 'creado'],
    ajustes: ['presupuesto_semanal', 'cuenta_ahorro_id', 'semana_revisada', 'respaldo_correo'],
    push_subs: ['endpoint', 'p256dh', 'auth']
  };
  // Orden seguro para insertar (padres antes que hijos) y borrar (al revés)
  const INSERT_ORDER = ['cuentas', 'categorias', 'deudas', 'metas', 'recurrentes', 'movimientos'];

  const pick = (t, row) => {
    const out = {};
    for (const k of COLS[t]) if (row[k] !== undefined) out[k] = row[k];
    return out;
  };

  const cfg = window.APP_CONFIG || {};
  const remote = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const configuredButOffline = Boolean(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !window.supabase);
  const sb = remote ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  // ---------- modo demo (localStorage) ----------
  const LKEY = 'misfinanzas_demo_v1';
  const emptyDb = () => ({ ...Object.fromEntries(TABLES.map(t => [t, []])), ajustes: {} });
  let local = emptyDb();
  try {
    const saved = JSON.parse(localStorage.getItem(LKEY) || 'null');
    if (saved) { TABLES.forEach(t => { local[t] = Array.isArray(saved[t]) ? saved[t] : []; }); local.ajustes = saved.ajustes || {}; }
  } catch (e) { /* almacenamiento no disponible: se usa memoria */ }
  const saveLocal = () => { try { localStorage.setItem(LKEY, JSON.stringify(local)); } catch (e) { console.warn('No se pudo guardar', e); } };
  const newId = () => (crypto.randomUUID ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => { const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 3 | 8)).toString(16); }));
  const clone = v => JSON.parse(JSON.stringify(v));

  const traducir = msg => {
    const m = String(msg || '');
    if (/permission denied/i.test(m)) return 'La base de datos rechazó el permiso. Avísale al administrador.';
    if (/row-level security/i.test(m)) return 'No tienes permiso para guardar este dato.';
    if (/JWT|token/i.test(m)) return 'Tu sesión expiró. Vuelve a iniciar sesión.';
    if (/Failed to fetch|NetworkError|Load failed|network/i.test(m)) return 'Sin conexión. Revisa tu internet e inténtalo de nuevo.';
    if (/violates foreign key/i.test(m)) return 'Este registro está en uso por otros movimientos.';
    if (/violates check constraint/i.test(m)) return 'Algún dato no es válido. Revisa los campos.';
    return m;
  };
  const check = ({ data, error }) => { if (error) throw new Error(traducir(error.message)); return data; };

  window.Store = {
    TABLES,
    remote,
    configuredButOffline,

    async session() {
      if (!remote) return { user: { email: 'demo' } };
      const { data } = await sb.auth.getSession();
      return data.session;
    },
    onAuth(cb) {
      if (!remote) return;
      sb.auth.onAuthStateChange((_evt, session) => cb(session));
    },
    async signIn(email, password) {
      const { error } = await sb.auth.signInWithPassword({ email, password });
      if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Correo o contraseña incorrectos' : traducir(error.message));
    },
    async signOut() { if (remote) await sb.auth.signOut(); },

    async list(t) {
      if (!remote) return clone(local[t]);
      const size = 1000; let from = 0; let out = [];
      for (;;) {
        const data = check(await sb.from(t).select('*').order('creado', { ascending: true }).range(from, from + size - 1));
        out = out.concat(data);
        if (data.length < size) break;
        from += size;
      }
      return out;
    },

    async insert(t, row) {
      if (!remote) {
        const r = { id: newId(), creado: new Date().toISOString(), ...pick(t, row) };
        local[t].push(r); saveLocal(); return clone(r);
      }
      return check(await sb.from(t).insert(pick(t, row)).select().single());
    },

    async insertMany(t, rows) {
      if (!rows.length) return [];
      if (!remote) {
        const now = Date.now();
        const rs = rows.map((row, i) => ({ id: newId(), creado: new Date(now + i).toISOString(), ...pick(t, row) }));
        local[t].push(...rs); saveLocal(); return clone(rs);
      }
      let out = [];
      for (let i = 0; i < rows.length; i += 500) {
        out = out.concat(check(await sb.from(t).insert(rows.slice(i, i + 500).map(r => pick(t, r))).select()));
      }
      return out;
    },

    async update(t, id, patch) {
      const p = pick(t, patch); delete p.id; delete p.creado;
      if (!remote) {
        const i = local[t].findIndex(x => x.id === id);
        if (i < 0) throw new Error('Registro no encontrado');
        local[t][i] = { ...local[t][i], ...p }; saveLocal(); return clone(local[t][i]);
      }
      return check(await sb.from(t).update(p).eq('id', id).select().single());
    },

    async remove(t, id) {
      if (!remote) { local[t] = local[t].filter(x => x.id !== id); saveLocal(); return; }
      check(await sb.from(t).delete().eq('id', id));
    },

    async getAjustes() {
      if (!remote) return clone(local.ajustes || {});
      const { data, error } = await sb.from('ajustes').select('*').maybeSingle();
      if (error) throw new Error(traducir(error.message));
      return data || {};
    },
    async saveAjustes(patch) {
      const p = pick('ajustes', patch);
      if (!remote) { local.ajustes = { ...local.ajustes, ...p }; saveLocal(); return clone(local.ajustes); }
      return check(await sb.from('ajustes').upsert({ ...p, actualizado: new Date().toISOString() }, { onConflict: 'user_id' }).select().single());
    },
    async savePushSub(sub) {
      if (!remote) throw new Error('Las notificaciones requieren la versión conectada a Supabase');
      check(await sb.from('push_subs').upsert(pick('push_subs', sub), { onConflict: 'endpoint' }));
    },
    async invoke(name, body) {
      if (!remote) throw new Error('Disponible solo en la versión conectada a Supabase');
      const { data, error } = await sb.functions.invoke(name, { body });
      if (error) throw new Error(traducir(error.message));
      return data;
    },

    // Reemplaza TODOS los datos del usuario por los de un respaldo
    async replaceAll(data) {
      if (!remote) {
        local = emptyDb();
        TABLES.forEach(t => { local[t] = (data[t] || []).map(r => ({ id: newId(), creado: new Date().toISOString(), ...pick(t, r) })); });
        local.ajustes = pick('ajustes', data.ajustes || {});
        saveLocal(); return;
      }
      for (const t of [...INSERT_ORDER].reverse()) check(await sb.from(t).delete().not('id', 'is', null));
      for (const t of INSERT_ORDER) {
        const rows = data[t] || [];
        for (let i = 0; i < rows.length; i += 500) check(await sb.from(t).insert(rows.slice(i, i + 500).map(r => pick(t, r))));
      }
      if (data.ajustes) check(await sb.from('ajustes').upsert(pick('ajustes', data.ajustes), { onConflict: 'user_id' }));
    },

    resetDemo() { local = emptyDb(); saveLocal(); }
  };
})();
