(() => {
'use strict';

/* =====================================================================
   Utilidades
   ===================================================================== */
const $ = (s, r = document) => r.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtMXN = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const money = n => { const v = Number(n) || 0; return fmtMXN.format(Math.abs(v) < 0.005 ? 0 : v); };
const num = v => { const n = parseFloat(String(v ?? '').replace(/[−–]/g, '-').replace(/[^0-9.\-]/g, '')); return Number.isFinite(n) ? n : 0; };
const round2 = n => Math.round(n * 100) / 100;
const pad = n => String(n).padStart(2, '0');
const ymd = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const hoy = () => ymd(new Date());
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const parseF = f => { const [y, m, d] = f.split('-').map(Number); return new Date(y, m - 1, d); };
const mesLabel = ym => { const [y, m] = ym.split('-').map(Number); return `${cap(MESES[m - 1])} ${y}`; };
const shiftMes = (ym, d) => { const [y, m] = ym.split('-').map(Number); const dt = new Date(y, m - 1 + d, 1); return `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`; };
const fechaCorta = f => { if (!f) return ''; const d = parseF(f); return `${d.getDate()} ${MESES[d.getMonth()].slice(0, 3)}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
const fechaLarga = f => {
  if (f === hoy()) return 'Hoy';
  if (f === ymd(new Date(Date.now() - 864e5))) return 'Ayer';
  const d = parseF(f);
  return `${cap(DIAS[d.getDay()])} ${d.getDate()} de ${MESES[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`;
};
const diasHasta = f => Math.round((parseF(f) - parseF(hoy())) / 864e5);
const sumMonto = arr => arr.reduce((a, m) => a + num(m.monto), 0);
const addDias = (f, n) => { const d = parseF(f); d.setDate(d.getDate() + n); return ymd(d); };
const lunesDe = f => { const d = parseF(f); return addDias(f, -((d.getDay() + 6) % 7)); };
const rangoSemana = lunes => {
  const a = parseF(lunes); const b = parseF(addDias(lunes, 6));
  return a.getMonth() === b.getMonth()
    ? `${a.getDate()}–${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)}`
    : `${a.getDate()} ${MESES[a.getMonth()].slice(0, 3)} – ${b.getDate()} ${MESES[b.getMonth()].slice(0, 3)}`;
};
const pct = (a, b) => (b ? Math.round(a / b * 100) : 0);
const nz = v => (v === '' || v === undefined || v === null ? null : v);

const pref = {
  get(k, d) { try { const v = localStorage.getItem('mf_pref_' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
  set(k, v) { try { localStorage.setItem('mf_pref_' + k, JSON.stringify(v)); } catch (e) { /* sin almacenamiento */ } }
};

let toastT;
function toast(msg, kind = '') {
  const t = $('#toast');
  t.textContent = msg;
  t.className = 'show ' + kind;
  clearTimeout(toastT);
  toastT = setTimeout(() => { t.className = ''; }, kind === 'err' ? 5000 : 2600);
}

/* =====================================================================
   Estado
   ===================================================================== */
const TABLES = Store.TABLES;
const S = { cuentas: [], categorias: [], deudas: [], metas: [], recurrentes: [], movimientos: [] };
let AJ = {};
let C = { saldo: new Map(), abonado: new Map(), aportado: new Map() };
const ui = { view: 'inicio', mes: hoy().slice(0, 7), filtroTipo: 'todos', filtroCuenta: '', session: null, loading: true, lastLoad: 0, error: null };

const TIPOS_CUENTA = { debito: 'Débito', credito: 'Tarjeta de crédito', ahorro: 'Ahorro', efectivo: 'Efectivo', inversion: 'Inversión', otro: 'Otro' };
const ORDEN_TIPOS = ['debito', 'ahorro', 'efectivo', 'inversion', 'credito', 'otro'];
const COLORES = ['#0F3D3E', '#2F5DA8', '#1F7A4D', '#B4441F', '#7A3FB5', '#C9821B', '#C2366B', '#4B5563'];
const EMOJIS = ['🍽️', '🛒', '🚗', '⛽', '🚌', '💡', '📱', '🏠', '🎉', '🎬', '👕', '💊', '🎓', '🐶', '✈️', '🎁', '💼', '💰', '📈', '🧾', '🔧', '☕'];

const SEMILLA = {
  categorias: [
    { nombre: 'Alimento', tipo: 'gasto', icono: '🍽️', color: '#C9821B' },
    { nombre: 'Transporte', tipo: 'gasto', icono: '🚗', color: '#2F5DA8' },
    { nombre: 'Servicios', tipo: 'gasto', icono: '💡', color: '#7A3FB5' },
    { nombre: 'Renta', tipo: 'gasto', icono: '🏠', color: '#B4441F' },
    { nombre: 'Ocio', tipo: 'gasto', icono: '🎉', color: '#C2366B' },
    { nombre: 'Sueldo', tipo: 'ingreso', icono: '💼', color: '#1F7A4D' },
    { nombre: 'Extras', tipo: 'ingreso', icono: '💰', color: '#0F3D3E' },
    { nombre: 'Proyectos', tipo: 'ingreso', icono: '📈', color: '#2F5DA8' }
  ],
  cuentas: [
    { nombre: 'Santander', tipo: 'debito', banco: 'Santander', color: '#B4441F', orden: 1 },
    { nombre: 'Nu Débito', tipo: 'debito', banco: 'Nu', color: '#7A3FB5', orden: 2 },
    { nombre: 'Nu Ahorro', tipo: 'ahorro', banco: 'Nu', color: '#C2366B', orden: 3 },
    { nombre: 'Efectivo', tipo: 'efectivo', banco: null, color: '#1F7A4D', orden: 4 },
    { nombre: 'Like U', tipo: 'credito', banco: 'Santander', color: '#0F3D3E', dia_corte: 3, orden: 5 },
    { nombre: 'AMEX', tipo: 'credito', banco: 'American Express', color: '#2F5DA8', dia_corte: 3, orden: 6 }
  ]
};

const byId = (t, id) => (id ? S[t].find(x => x.id === id) : undefined);
const cuentasActivas = () => S.cuentas.filter(c => !c.archivada).sort(ordenCuentas);
function ordenCuentas(a, b) {
  return (ORDEN_TIPOS.indexOf(a.tipo) - ORDEN_TIPOS.indexOf(b.tipo)) || ((a.orden || 0) - (b.orden || 0)) || a.nombre.localeCompare(b.nombre);
}

/* =====================================================================
   Cálculos: los saldos SIEMPRE se derivan de los movimientos
   ===================================================================== */
function efectos(m) {
  const a = num(m.monto);
  const d = m.deuda_id ? byId('deudas', m.deuda_id) : null;
  switch (m.tipo) {
    case 'gasto': return [[m.cuenta_id, -a]];
    case 'ingreso': return [[m.cuenta_id, a]];
    case 'ajuste': return [[m.cuenta_id, a]];
    case 'transferencia': return [[m.cuenta_id, -a], [m.cuenta_destino_id, a]];
    case 'aportacion': return m.cuenta_destino_id && m.cuenta_destino_id !== m.cuenta_id ? [[m.cuenta_id, -a], [m.cuenta_destino_id, a]] : [];
    case 'abono_deuda': return [[m.cuenta_id, d && d.direccion === 'me_deben' ? a : -a]];
    case 'desembolso': return [[m.cuenta_id, d && d.direccion === 'me_deben' ? -a : a]];
    default: return [];
  }
}

function calc() {
  const saldo = new Map(S.cuentas.map(c => [c.id, num(c.saldo_inicial)]));
  const abonado = new Map();
  const aportado = new Map();
  for (const m of S.movimientos) {
    for (const [id, v] of efectos(m)) if (id && saldo.has(id)) saldo.set(id, saldo.get(id) + v);
    if (m.tipo === 'abono_deuda' && m.deuda_id) abonado.set(m.deuda_id, (abonado.get(m.deuda_id) || 0) + num(m.monto));
    if (m.tipo === 'aportacion' && m.meta_id) aportado.set(m.meta_id, (aportado.get(m.meta_id) || 0) + num(m.monto));
  }
  saldo.forEach((v, k) => saldo.set(k, round2(v)));
  return { saldo, abonado, aportado };
}

const saldoDeuda = d => Math.max(0, round2(num(d.monto) - (C.abonado.get(d.id) || 0)));
const cuentasDeMeta = m => (m.cuenta_ids || []).filter(id => byId('cuentas', id));
function progresoMeta(m) {
  const ids = cuentasDeMeta(m);
  if (ids.length) return ids.reduce((a, id) => a + (C.saldo.get(id) || 0), 0);
  return num(m.ahorrado_inicial) + (C.aportado.get(m.id) || 0);
}

// Estado de cuenta de una tarjeta de crédito según su día de corte
function estadoTarjeta(c) {
  const corte = Number(c.dia_corte);
  if (!corte) return null;
  const fechaDia = (y, mo, dia) => new Date(y, mo, Math.min(dia, new Date(y, mo + 1, 0).getDate()));
  const t = new Date();
  let ult = fechaDia(t.getFullYear(), t.getMonth(), corte);
  if (ymd(ult) > hoy()) ult = fechaDia(t.getFullYear(), t.getMonth() - 1, corte);
  const ultS = ymd(ult);
  const prox = ymd(fechaDia(ult.getFullYear(), ult.getMonth() + 1, corte));
  let fechaPago = null;
  if (c.dia_pago) {
    let fp = fechaDia(ult.getFullYear(), ult.getMonth(), Number(c.dia_pago));
    if (ymd(fp) <= ultS) fp = fechaDia(ult.getFullYear(), ult.getMonth() + 1, Number(c.dia_pago));
    fechaPago = ymd(fp);
  }
  let saldoCorte = num(c.saldo_inicial);
  let pagos = 0;
  let cargos = 0;
  let msiRestante = 0;
  let msiMensual = 0;
  for (const m of S.movimientos) {
    // Compras a meses sin intereses: al estado de cuenta solo entra la mensualidad de cada corte
    if (m.tipo === 'gasto' && m.msi_meses && m.cuenta_id === c.id) {
      const n = Number(m.msi_meses);
      const cuota = num(m.monto) / n;
      const b = Math.min(n, cortesEntre(m.fecha, ultS, corte));
      const bProx = Math.min(n, cortesEntre(m.fecha, prox, corte));
      saldoCorte -= cuota * b;
      cargos += cuota * (bProx - b);
      msiRestante += num(m.monto) - cuota * b;
      if (b < n) msiMensual += cuota;
      continue;
    }
    for (const [id, v] of efectos(m)) {
      if (id !== c.id) continue;
      // Los ajustes cuadran la deuda contra el banco: se consideran parte del periodo cerrado
      if (m.fecha <= ultS || m.tipo === 'ajuste') saldoCorte += v;
      else if (v > 0) pagos += v;
      else cargos -= v;
    }
  }
  const deudaCorte = Math.max(0, round2(-saldoCorte));
  return { ultS, prox, fechaPago, deudaCorte, porPagar: Math.max(0, round2(deudaCorte - pagos)), pagos: round2(pagos), nuevoPeriodo: round2(cargos), msiRestante: round2(msiRestante), msiMensual: round2(msiMensual) };
}

// Cuántas fechas de corte (día `dia` de cada mes) caen entre `desde` y `hasta`, ambos incluidos
function cortesEntre(desde, hasta, dia) {
  if (hasta < desde) return 0;
  const a = parseF(desde);
  const b = parseF(hasta);
  let n = 0;
  for (let y = a.getFullYear(), mo = a.getMonth(); y < b.getFullYear() || (y === b.getFullYear() && mo <= b.getMonth()); mo++) {
    if (mo > 11) { mo = 0; y++; }
    const f = ymd(new Date(y, mo, Math.min(dia, new Date(y, mo + 1, 0).getDate())));
    if (f >= desde && f <= hasta) n++;
  }
  return n;
}

/* ---------- presupuesto semanal ---------- */
const esGastoPresupuesto = m => m.tipo === 'gasto' && !m.msi_meses;
const gastoSemana = (lunes, catId) => {
  const fin = addDias(lunes, 6);
  return round2(S.movimientos.filter(m => esGastoPresupuesto(m) && m.fecha >= lunes && m.fecha <= fin && (catId === undefined || m.categoria_id === catId))
    .reduce((a, m) => a + num(m.monto), 0));
};
const sumaLimitesCategorias = () => S.categorias.filter(c => c.tipo === 'gasto' && !c.archivada).reduce((a, c) => a + num(c.presupuesto_semanal), 0);
const presupuestoSemanal = () => num(AJ.presupuesto_semanal) || sumaLimitesCategorias();
const cuentasAhorro = () => cuentasActivas().filter(c => c.tipo === 'ahorro');
function cuentaAhorroDefault() {
  const ah = cuentasAhorro();
  return (ah.find(c => c.id === AJ.cuenta_ahorro_id) || ah[0])?.id || null;
}

function signo(m, cuentaRef) {
  if (cuentaRef) {
    const e = efectos(m).filter(([id]) => id === cuentaRef).reduce((a, [, v]) => a + v, 0);
    return Math.sign(e);
  }
  if (m.tipo === 'transferencia' || m.tipo === 'aportacion') return 0;
  const e = efectos(m).reduce((a, [, v]) => a + v, 0);
  return Math.sign(e);
}

function descMov(m) {
  const cta = id => byId('cuentas', id)?.nombre || '—';
  let r;
  switch (m.tipo) {
    case 'gasto':
    case 'ingreso': {
      const c = byId('categorias', m.categoria_id);
      r = { icon: c?.icono || (m.tipo === 'gasto' ? '↘' : '↗'), color: c?.color, base: c?.nombre || 'Sin categoría', ruta: cta(m.cuenta_id) };
      break;
    }
    case 'transferencia': {
      const dest = byId('cuentas', m.cuenta_destino_id);
      r = { icon: '⇄', color: '#2F5DA8', base: dest?.tipo === 'credito' ? 'Pago de tarjeta' : 'Transferencia', ruta: `${cta(m.cuenta_id)} → ${cta(m.cuenta_destino_id)}` };
      break;
    }
    case 'abono_deuda': {
      const d = byId('deudas', m.deuda_id);
      r = { icon: '🧾', color: '#B4441F', base: d ? (d.direccion === 'debo' ? 'Pago: ' : 'Cobro: ') + d.nombre : 'Abono a deuda', ruta: cta(m.cuenta_id) };
      break;
    }
    case 'desembolso': {
      const d = byId('deudas', m.deuda_id);
      r = { icon: '🤝', color: '#C9821B', base: d ? (d.direccion === 'debo' ? 'Préstamo recibido: ' + d.nombre : `Por cobrar a ${d.persona || '—'}: ${d.nombre}`) : 'Préstamo', ruta: cta(m.cuenta_id) };
      break;
    }
    case 'aportacion': {
      const mt = byId('metas', m.meta_id);
      const mueve = m.cuenta_destino_id && m.cuenta_destino_id !== m.cuenta_id;
      r = { icon: '🎯', color: '#1F7A4D', base: 'Meta: ' + (mt?.nombre || '—'), ruta: mueve ? `${cta(m.cuenta_id)} → ${cta(m.cuenta_destino_id)}` : cta(m.cuenta_id) };
      break;
    }
    case 'ajuste':
      r = { icon: '⚖️', color: '#4B5563', base: 'Ajuste de saldo', ruta: cta(m.cuenta_id) };
      break;
    default:
      r = { icon: '•', base: m.tipo, ruta: '' };
  }
  if (m.msi_meses) r.ruta += ` · ${m.msi_meses} MSI de ${money(num(m.monto) / m.msi_meses)}`;
  if (m.recurrente_id) r.ruta += ' · fijo';
  return { ...r, titulo: m.nota || r.base, sub: m.nota ? `${r.base} · ${r.ruta}` : r.ruta };
}

/* =====================================================================
   Datos
   ===================================================================== */
async function cargar() {
  const [res, aj] = await Promise.all([Promise.all(TABLES.map(t => Store.list(t))), Store.getAjustes()]);
  TABLES.forEach((t, i) => { S[t] = res[i]; });
  AJ = aj || {};
  if (!S.categorias.length && !pref.get('sembrado_cat_' + userKey(), false)) {
    S.categorias = await Store.insertMany('categorias', SEMILLA.categorias.map(c => ({ ...c, archivada: false })));
    pref.set('sembrado_cat_' + userKey(), true);
  }
  if (!S.cuentas.length && !pref.get('sembrado_cta_' + userKey(), false)) {
    S.cuentas = await Store.insertMany('cuentas', SEMILLA.cuentas.map(c => ({ saldo_inicial: 0, archivada: false, ...c })));
    const nu = S.cuentas.filter(c => c.nombre === 'Nu Débito' || c.nombre === 'Nu Ahorro').map(c => c.id);
    if (!S.metas.length) S.metas = [await Store.insert('metas', { nombre: 'Meta $80k', monto_objetivo: 80000, ahorrado_inicial: 0, cuenta_ids: nu, color: '#1F7A4D', completada: false })];
    pref.set('sembrado_cta_' + userKey(), true);
  }
  ui.lastLoad = Date.now();
}
const userKey = () => (Store.remote ? (ui.session?.user?.id || 'x') : 'demo');

async function guardar(t, row, id) {
  const saved = id ? await Store.update(t, id, row) : await Store.insert(t, row);
  const i = S[t].findIndex(x => x.id === saved.id);
  if (i >= 0) S[t][i] = saved; else S[t].push(saved);
  return saved;
}
async function borrar(t, id) {
  await Store.remove(t, id);
  S[t] = S[t].filter(x => x.id !== id);
}
async function run(fn, okMsg) {
  try {
    await fn();
    if (okMsg) toast(okMsg, 'ok');
    return true;
  } catch (e) {
    console.error(e);
    toast('Error: ' + (e.message || e), 'err');
    return false;
  }
}

/* =====================================================================
   Componentes
   ===================================================================== */
const ICONS = {
  inicio: '<svg viewBox="0 0 24 24"><path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z"/></svg>',
  movs: '<svg viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h10"/></svg>',
  cuentas: '<svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 10h18M7 15h4"/></svg>',
  mas: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>'
};
const TITULOS = {
  inicio: 'Mis finanzas', movs: 'Movimientos', cuentas: 'Cuentas', mas: 'Más', metas: 'Metas de ahorro', deudas: 'Deudas',
  porcobrar: 'Por cobrar', categorias: 'Categorías', respaldo: 'Respaldo', recurrentes: 'Gastos fijos', consejos: 'Tu consultor',
  reportes: 'Reportes', ajustes: 'Ajustes'
};
const SUBVISTAS = ['metas', 'deudas', 'porcobrar', 'categorias', 'respaldo', 'recurrentes', 'consejos', 'reportes', 'ajustes'];

const mesNav = () => `<div class="mes-nav">
  <button class="icon-btn" data-act="mes" data-d="-1" aria-label="Mes anterior">‹</button>
  <strong>${mesLabel(ui.mes)}</strong>
  <button class="icon-btn" data-act="mes" data-d="1" aria-label="Mes siguiente" ${ui.mes >= hoy().slice(0, 7) ? 'disabled' : ''}>›</button>
</div>`;

const bar = (pct, color, cls = '') => `<div class="bar ${cls}"><span style="width:${Math.max(0, Math.min(100, pct)).toFixed(1)}%;${color ? `background:${color}` : ''}"></span></div>`;

function movRow(m, cuentaRef) {
  const d = descMov(m);
  const s = signo(m, cuentaRef);
  return `<button class="mov" data-act="edit-mov" data-id="${m.id}">
    <span class="mov-ic" style="--c:${d.color || 'var(--muted)'}">${esc(d.icon)}</span>
    <span class="mov-main"><span class="mov-t">${esc(d.titulo)}</span><span class="mov-s">${esc(d.sub)}</span></span>
    <span class="mov-a ${s > 0 ? 'pos' : s < 0 ? 'neg' : ''}">${s > 0 ? '+' : s < 0 ? '−' : ''}${money(Math.abs(num(m.monto)))}</span>
  </button>`;
}

const ordenMovs = (a, b) => (b.fecha.localeCompare(a.fecha)) || String(b.creado || '').localeCompare(String(a.creado || ''));

function vacio(icon, texto, act, label) {
  return `<div class="empty"><div class="empty-ic">${icon}</div><p>${texto}</p>${act ? `<button class="btn" data-act="${act}">${label}</button>` : ''}</div>`;
}

/* =====================================================================
   Vistas
   ===================================================================== */
function vInicio() {
  const act = cuentasActivas();
  const enCuentas = act.reduce((a, c) => a + (C.saldo.get(c.id) || 0), 0);
  const pend = S.deudas.filter(d => !d.saldada);
  const debo = pend.filter(d => d.direccion === 'debo').reduce((a, d) => a + saldoDeuda(d), 0);
  const meDeben = pend.filter(d => d.direccion === 'me_deben').reduce((a, d) => a + saldoDeuda(d), 0);
  const neto = enCuentas + meDeben - debo;
  const liquidez = act.filter(c => c.tipo !== 'credito').reduce((a, c) => a + (C.saldo.get(c.id) || 0), 0);
  const tdc = act.filter(c => c.tipo === 'credito').reduce((a, c) => a + Math.max(0, -(C.saldo.get(c.id) || 0)), 0);

  const movs = S.movimientos.filter(m => m.fecha.startsWith(ui.mes));
  const ing = sumMonto(movs.filter(m => m.tipo === 'ingreso'));
  const gas = sumMonto(movs.filter(m => m.tipo === 'gasto'));

  // tarjetas de crédito
  const tarjetas = act.filter(c => c.tipo === 'credito');
  const tdcHtml = tarjetas.map(c => {
    const deuda = Math.max(0, -(C.saldo.get(c.id) || 0));
    const e = estadoTarjeta(c);
    const lim = num(c.limite_credito);
    return `<button class="tdc" data-act="acct" data-id="${c.id}">
      <div class="tdc-top"><b>${esc(c.nombre)}</b><span class="${deuda > 0 ? '' : 'zero'}">${money(deuda)}</span></div>
      ${e ? `<div class="tdc-grid">
        <div><small>Pagar del corte ${fechaCorta(e.ultS)}</small><b class="${e.porPagar > 0 ? 'neg' : 'pos'}">${e.porPagar > 0 ? money(e.porPagar) : (e.deudaCorte > 0 ? 'Pagado ✓' : 'Sin saldo')}</b></div>
        <div><small>Nuevo periodo</small><b>${money(e.nuevoPeriodo)}</b></div>
      </div>
      <small class="tdc-foot">${e.fechaPago ? `Fecha límite de pago: ${fechaCorta(e.fechaPago)} · ` : ''}Próximo corte: ${fechaCorta(e.prox)}${e.msiRestante > 0 ? ` · MSI por pagar ${money(e.msiRestante)}` : ''}</small>` : '<small class="tdc-foot">Agrega el día de corte para ver lo que debes pagar.</small>'}
      ${lim ? bar(deuda / lim * 100, null, deuda / lim > 0.8 ? 'warn' : '') + `<small class="tdc-foot">Disponible ${money(lim - deuda)} de ${money(lim)}</small>` : ''}
    </button>`;
  }).join('');

  const tips = consejos().slice(0, 3);
  const proximos = recurrentesProximos();
  const metas = S.metas.filter(m => !m.completada).slice(0, 3);
  const recientes = [...S.movimientos].sort(ordenMovs).slice(0, 5);

  return `
  <section class="hero">
    <div class="hero-label">Patrimonio neto</div>
    <div class="hero-num">${money(neto)}</div>
    <div class="hero-split">
      <div><span>Disponible</span><b>${money(liquidez)}</b></div>
      <div><span>Tarjetas</span><b>${money(tdc)}</b></div>
      <div><span>Debo</span><b>${money(debo)}</b></div>
      <button class="hero-link" data-act="go" data-v="porcobrar"><span>Por cobrar ›</span><b>${money(meDeben)}</b></button>
    </div>
  </section>

  ${cardSemana()}

  ${tips.length ? `<section class="card">
    <div class="card-head"><h3>Tu consultor</h3><button class="link" data-act="go" data-v="consejos">Ver todos</button></div>
    ${tips.map(tipHtml).join('')}
  </section>` : ''}

  ${proximos.length ? `<section class="card">
    <div class="card-head"><h3>Gastos fijos por registrar</h3><button class="link" data-act="go" data-v="recurrentes">Ver todos</button></div>
    ${proximos.map(recRow).join('')}
  </section>` : ''}

  ${mesNav()}
  <section class="stats3">
    <div class="stat"><span>Ingresos</span><b class="pos">${money(ing)}</b></div>
    <div class="stat"><span>Gastos</span><b class="neg">${money(gas)}</b></div>
    <div class="stat"><span>Balance</span><b class="${ing - gas >= 0 ? 'pos' : 'neg'}">${money(ing - gas)}</b></div>
  </section>
  <button class="link-row" data-act="go" data-v="reportes">📊 Ver reporte del mes y tendencias <span class="chev">›</span></button>

  ${tarjetas.length ? `<section class="card dark"><div class="card-head"><h3>Tarjetas de crédito</h3></div>${tdcHtml}</section>` : ''}

  <section class="card">
    <div class="card-head"><h3>Metas</h3><button class="link" data-act="go" data-v="metas">Ver todas</button></div>
    ${metas.length ? metas.map(metaMini).join('') : vacio('🎯', 'Aún no tienes metas de ahorro.', 'new-meta', 'Crear meta')}
  </section>

  <section class="card">
    <div class="card-head"><h3>Últimos movimientos</h3><button class="link" data-act="go" data-v="movs">Ver todos</button></div>
    ${recientes.length ? `<div class="mov-list">${recientes.map(m => movRow(m)).join('')}</div>` : vacio('🧾', 'Registra tu primer gasto con el botón +', 'new-mov', 'Registrar')}
  </section>`;
}

/* ---------- tarjeta "Esta semana" ---------- */
function cardSemana() {
  const lunes = lunesDe(hoy());
  const total = presupuestoSemanal();
  const gastado = gastoSemana(lunes);
  const diasRest = 7 - ((parseF(hoy()).getDay() + 6) % 7); // incluye hoy
  const cats = S.categorias.filter(c => c.tipo === 'gasto' && !c.archivada);
  const conLimite = cats.filter(c => num(c.presupuesto_semanal) > 0);
  const sinLimiteGasto = cats.filter(c => !num(c.presupuesto_semanal)).map(c => ({ c, g: gastoSemana(lunes, c.id) })).filter(x => x.g > 0);
  if (!total) {
    return `<section class="card">
      <div class="card-head"><h3>Esta semana · ${rangoSemana(lunes)}</h3></div>
      <p class="big-line">${money(gastado)} <small class="muted">gastados</small></p>
      <p class="hint">Define tu presupuesto semanal para ver cuánto te queda por día y recibir el aviso de ahorro de cada lunes.</p>
      <button class="btn sm primary" data-act="go" data-v="ajustes">Definir presupuesto</button>
    </section>`;
  }
  const queda = total - gastado;
  const p = gastado / total * 100;
  const estado = p > 100 ? 'over' : p >= 85 ? 'warn' : '';
  const filas = conLimite.map(c => {
    const g = gastoSemana(lunes, c.id);
    const l = num(c.presupuesto_semanal);
    const pc = g / l * 100;
    return `<div class="cat-row">
      <div class="cat-top"><span class="cat-n"><span class="cat-ic">${esc(c.icono || '•')}</span>${esc(c.nombre)}</span><span class="cat-v"><b>${money(g)}</b><small> de ${money(l)}</small></span></div>
      ${bar(pc, null, pc > 100 ? 'over' : pc >= 85 ? 'warn' : '')}
    </div>`;
  }).join('') + sinLimiteGasto.map(({ c, g }) => `<div class="cat-row slim"><div class="cat-top"><span class="cat-n"><span class="cat-ic">${esc(c.icono || '•')}</span>${esc(c.nombre)}</span><span class="cat-v"><b>${money(g)}</b><small> sin límite</small></span></div></div>`).join('');
  return `<section class="card semana">
    <div class="card-head"><h3>Esta semana · ${rangoSemana(lunes)}</h3><button class="link" data-act="go" data-v="ajustes">Ajustar</button></div>
    <div class="semana-top">
      <div><small>${queda >= 0 ? 'Te quedan' : 'Te pasaste por'}</small><b class="${queda >= 0 ? '' : 'neg'}">${money(Math.abs(queda))}</b></div>
      <div class="right"><small>${queda > 0 ? 'Puedes gastar al día' : 'Gastado'}</small><b>${queda > 0 ? money(queda / diasRest) : money(gastado)}</b></div>
    </div>
    ${bar(p, null, estado)}
    <small class="muted">${money(gastado)} de ${money(total)} · ${diasRest === 1 ? 'último día' : `quedan ${diasRest} días`}</small>
    ${filas ? `<div class="semana-cats">${filas}</div>` : ''}
  </section>`;
}

function metaMini(m) {
  const p = progresoMeta(m);
  const o = num(m.monto_objetivo);
  const pct = o ? p / o * 100 : 0;
  return `<button class="meta-mini" data-act="go" data-v="metas">
    <div class="cat-top"><span class="cat-n">${esc(m.nombre)}</span><span class="cat-v"><b>${pct.toFixed(1)}%</b></span></div>
    ${bar(pct, m.color)}
    <small class="muted">${money(p)} de ${money(o)}</small>
  </button>`;
}

function vMovs() {
  let movs = S.movimientos.filter(m => m.fecha.startsWith(ui.mes));
  const ft = ui.filtroTipo;
  if (ft !== 'todos') movs = movs.filter(m => (ft === 'deudas' ? (m.tipo === 'abono_deuda' || m.tipo === 'desembolso') : m.tipo === ft));
  const fc = ui.filtroCuenta && byId('cuentas', ui.filtroCuenta) ? ui.filtroCuenta : '';
  if (fc) movs = movs.filter(m => m.cuenta_id === fc || m.cuenta_destino_id === fc);
  movs.sort(ordenMovs);

  let entra = 0;
  let sale = 0;
  movs.forEach(m => {
    const v = fc ? efectos(m).filter(([id]) => id === fc).reduce((a, [, x]) => a + x, 0)
      : (m.tipo === 'ingreso' ? num(m.monto) : m.tipo === 'gasto' ? -num(m.monto) : 0);
    if (v > 0) entra += v; else sale -= v;
  });

  const grupos = [];
  movs.forEach(m => { const g = grupos[grupos.length - 1]; if (g && g.f === m.fecha) g.items.push(m); else grupos.push({ f: m.fecha, items: [m] }); });

  const chips = [['todos', 'Todos'], ['gasto', 'Gastos'], ['ingreso', 'Ingresos'], ['transferencia', 'Transferencias'], ['deudas', 'Deudas'], ['aportacion', 'Metas'], ['ajuste', 'Ajustes']];
  const fcCuenta = byId('cuentas', fc);
  return `
  ${mesNav()}
  <div class="filters">
    <div class="chips scroll">${chips.map(([k, l]) => `<button class="chip ${ft === k ? 'on' : ''}" data-act="filtro" data-t="${k}">${l}</button>`).join('')}</div>
    <select class="select-sm" data-change="filtro-cuenta" aria-label="Filtrar por cuenta">
      <option value="">Todas las cuentas</option>
      ${S.cuentas.slice().sort(ordenCuentas).map(c => `<option value="${c.id}" ${c.id === fc ? 'selected' : ''}>${esc(c.nombre)}</option>`).join('')}
    </select>
  </div>
  <section class="stats3 compact">
    <div class="stat"><span>${fc ? 'Entradas' : 'Ingresos'}</span><b class="pos">${money(entra)}</b></div>
    <div class="stat"><span>${fc ? 'Salidas' : 'Gastos'}</span><b class="neg">${money(sale)}</b></div>
    <div class="stat"><span>${fcCuenta ? (fcCuenta.tipo === 'credito' ? 'Deuda hoy' : 'Saldo hoy') : 'Neto'}</span><b>${fcCuenta ? money(Math.abs(C.saldo.get(fc) || 0)) : money(entra - sale)}</b></div>
  </section>
  ${grupos.length ? grupos.map(g => `<div class="day"><div class="day-h"><span>${fechaLarga(g.f)}</span></div><div class="mov-list">${g.items.map(m => movRow(m, fc)).join('')}</div></div>`).join('')
    : vacio('🔍', 'No hay movimientos con estos filtros en ' + mesLabel(ui.mes).toLowerCase() + '.', null)}`;
}

function cuentaCard(c) {
  const s = C.saldo.get(c.id) || 0;
  if (c.tipo === 'credito') {
    const deuda = Math.max(0, -s);
    const lim = num(c.limite_credito);
    return `<button class="acct" data-act="acct" data-id="${c.id}" style="--c:${c.color}">
      <span class="acct-main"><b>${esc(c.nombre)}</b><small>${esc(c.banco || 'Tarjeta de crédito')}${c.dia_corte ? ` · corte día ${c.dia_corte}` : ''}</small></span>
      <span class="acct-v"><b class="${deuda > 0 ? 'neg' : ''}">${s > 0 ? money(s) + ' a favor' : money(deuda)}</b><small>${lim ? 'Disponible ' + money(lim - deuda) : 'deuda'}</small></span>
    </button>`;
  }
  return `<button class="acct" data-act="acct" data-id="${c.id}" style="--c:${c.color}">
    <span class="acct-main"><b>${esc(c.nombre)}</b><small>${esc(c.banco || TIPOS_CUENTA[c.tipo])}</small></span>
    <span class="acct-v"><b class="${s < 0 ? 'neg' : ''}">${money(s)}</b></span>
  </button>`;
}

function vCuentas() {
  const act = cuentasActivas();
  const arch = S.cuentas.filter(c => c.archivada);
  const grupos = ORDEN_TIPOS.map(t => ({ t, items: act.filter(c => c.tipo === t) })).filter(g => g.items.length);
  const total = act.reduce((a, c) => a + (C.saldo.get(c.id) || 0), 0);
  return `
  <section class="stats3 compact two">
    <div class="stat"><span>Saldo neto (con tarjetas)</span><b>${money(total)}</b></div>
    <div class="stat"><span>Cuentas activas</span><b>${act.length}</b></div>
  </section>
  ${grupos.map(g => `<div class="group"><h4>${TIPOS_CUENTA[g.t]}</h4>${g.items.map(cuentaCard).join('')}</div>`).join('')}
  ${!act.length ? vacio('🏦', 'Agrega tus cuentas de banco, efectivo y tarjetas.', 'new-acct', 'Nueva cuenta') : ''}
  ${arch.length ? `<details class="group"><summary>Archivadas (${arch.length})</summary>${arch.map(cuentaCard).join('')}</details>` : ''}
  <p class="hint center">Toca una cuenta para depositar, transferir, pagar la tarjeta o ajustar su saldo.</p>`;
}

function vMas() {
  const item = (v, ic, t, s) => `<button class="list-item" data-act="go" data-v="${v}"><span class="li-ic">${ic}</span><span class="li-main"><b>${t}</b><small>${s}</small></span><span class="chev">›</span></button>`;
  const metasAct = S.metas.filter(m => !m.completada).length;
  const deudasPend = S.deudas.filter(d => !d.saldada && d.direccion === 'debo').length;
  const cobrar = S.deudas.filter(d => !d.saldada && d.direccion === 'me_deben');
  const fijos = S.recurrentes.filter(r => r.activo).length;
  return `
  <div class="list">
    ${item('reportes', '📊', 'Reportes', 'Mes a mes, tendencias y semanas')}
    ${item('consejos', '💡', 'Tu consultor', 'Consejos según tus gastos')}
  </div>
  <div class="list">
    ${item('porcobrar', '🤝', 'Por cobrar', cobrar.length ? `${money(cobrar.reduce((a, d) => a + saldoDeuda(d), 0))} pendientes` : 'Personas que te deben')}
    ${item('deudas', '🧾', 'Deudas', deudasPend ? `${deudasPend} pendiente${deudasPend > 1 ? 's' : ''}` : 'Préstamos que debes')}
    ${item('metas', '🎯', 'Metas de ahorro', metasAct ? `${metasAct} en curso` : 'Define cuánto quieres ahorrar')}
    ${item('recurrentes', '🔁', 'Gastos fijos', fijos ? `${fijos} activos` : 'Renta, servicios, suscripciones')}
  </div>
  <div class="list">
    ${item('ajustes', '⚙️', 'Ajustes', 'Presupuesto semanal, ahorro y notificaciones')}
    ${item('categorias', '🏷️', 'Categorías', `${S.categorias.filter(c => !c.archivada).length} categorías · límites semanales`)}
    ${item('respaldo', '💾', 'Respaldo', 'Exportar a Excel o JSON, importar')}
  </div>
  <div class="list">
    ${Store.remote ? `<button class="list-item" data-act="sync"><span class="li-ic">🔄</span><span class="li-main"><b>Sincronizar</b><small>Traer cambios hechos en otro dispositivo</small></span></button>
    <button class="list-item" data-act="logout"><span class="li-ic">🚪</span><span class="li-main"><b>Cerrar sesión</b><small>${esc(ui.session?.user?.email || '')}</small></span></button>`
    : `<div class="list-item static"><span class="li-ic">🧪</span><span class="li-main"><b>Modo demo</b><small>Los datos viven solo en este navegador.</small></span></div>
       <button class="list-item" data-act="reset-demo"><span class="li-ic">🗑️</span><span class="li-main"><b>Borrar datos demo</b><small>Empezar de cero</small></span></button>`}
  </div>
  <p class="hint center">Mis Finanzas · v2.0</p>`;
}


function vMetas() {
  const act = S.metas.filter(m => !m.completada);
  const hechas = S.metas.filter(m => m.completada);
  const card = m => {
    const p = progresoMeta(m);
    const o = num(m.monto_objetivo);
    const pct = o ? p / o * 100 : 0;
    const falta = Math.max(0, o - p);
    const ids = cuentasDeMeta(m);
    let plan = '';
    if (falta > 0 && m.fecha_objetivo) {
      const dias = diasHasta(m.fecha_objetivo);
      const meses = Math.max(1, Math.ceil(dias / 30.44));
      plan = dias > 0 ? `Ahorra <b>${money(falta / meses)}</b> al mes para llegar el ${fechaCorta(m.fecha_objetivo)}` : `La fecha objetivo (${fechaCorta(m.fecha_objetivo)}) ya pasó`;
    } else if (falta <= 0) plan = '¡Meta alcanzada! 🎉';
    return `<div class="card meta" style="--c:${m.color}">
      <div class="card-head"><h3>${esc(m.nombre)}</h3><b>${pct.toFixed(1)}%</b></div>
      ${bar(pct, m.color)}
      <div class="meta-nums"><span>${money(p)}</span><span class="muted">de ${money(o)}</span></div>
      ${falta > 0 ? `<p class="hint">Faltan ${money(falta)}</p>` : ''}
      ${plan ? `<p class="hint">${plan}</p>` : ''}
      <p class="hint">${ids.length ? 'Avance = saldo de ' + ids.map(id => esc(byId('cuentas', id).nombre)).join(' + ') : 'Avance = aportaciones registradas'}</p>
      <div class="btn-row">
        <button class="btn primary sm" data-act="new-mov" data-tipo="aportacion" data-meta="${m.id}">Aportar</button>
        <button class="btn sm" data-act="edit-meta" data-id="${m.id}">Editar</button>
      </div>
    </div>`;
  };
  return `
  ${act.length ? act.map(card).join('') : vacio('🎯', 'Crea una meta: fondo de emergencia, viaje, enganche…', 'new-meta', 'Nueva meta')}
  ${hechas.length ? `<details class="group"><summary>Completadas (${hechas.length})</summary>${hechas.map(card).join('')}</details>` : ''}`;
}

function deudaCard(d) {
  const pend = saldoDeuda(d);
  const total = num(d.monto);
  const pagado = total - pend;
  let venc = '';
  if (d.fecha_limite && !d.saldada) {
    const dd = diasHasta(d.fecha_limite);
    venc = dd < 0 ? `<span class="tag neg">⚠ Vencida hace ${-dd} día${dd === -1 ? '' : 's'}</span>` : `<span class="tag">Vence en ${dd} día${dd === 1 ? '' : 's'}</span>`;
  }
  const debo = d.direccion === 'debo';
  return `<div class="card deuda">
    <div class="card-head"><h3>${esc(d.nombre)}</h3>${venc}</div>
    ${d.persona && debo ? `<p class="hint">A: ${esc(d.persona)}</p>` : ''}
    <div class="meta-nums"><span class="${debo ? 'neg' : 'pos'}">${money(pend)}</span><span class="muted">pendiente de ${money(total)}</span></div>
    ${bar(total ? pagado / total * 100 : 0, debo ? 'var(--neg)' : 'var(--pos)')}
    <div class="btn-row">
      ${!d.saldada ? `<button class="btn primary sm" data-act="new-mov" data-tipo="abono_deuda" data-deuda="${d.id}">${debo ? 'Abonar' : 'Registrar cobro'}</button>` : `<span class="tag pos">✓ ${debo ? 'Saldada' : 'Cobrada'}</span>`}
      <button class="btn sm" data-act="edit-deuda" data-id="${d.id}">Editar</button>
    </div>
  </div>`;
}

function vDeudas() {
  const debo = S.deudas.filter(d => !d.saldada && d.direccion === 'debo');
  const saldadas = S.deudas.filter(d => d.saldada && d.direccion === 'debo');
  return `
  <p class="hint">Préstamos que tú debes fuera de tus tarjetas. Las tarjetas se manejan como cuentas; lo que te deben a ti está en <button class="link inline" data-act="go" data-v="porcobrar">Por cobrar</button>.</p>
  ${debo.length ? `<div class="group"><h4>Total que debo · ${money(debo.reduce((a, d) => a + saldoDeuda(d), 0))}</h4>${debo.map(deudaCard).join('')}</div>` : vacio('🧾', 'No tienes deudas pendientes.', 'new-deuda', 'Registrar deuda')}
  ${saldadas.length ? `<details class="group"><summary>Saldadas (${saldadas.length})</summary>${saldadas.map(deudaCard).join('')}</details>` : ''}`;
}

/* ---------- Por cobrar: agrupado por persona ---------- */
const clavePersona = d => (d.persona || d.nombre || 'Sin nombre').trim().toLowerCase();
function waLink(tel, texto) {
  let t = String(tel || '').replace(/\D/g, '');
  if (t.length === 10) t = '52' + t;
  return `https://wa.me/${t}?text=${encodeURIComponent(texto)}`;
}
function vPorCobrar() {
  const pend = S.deudas.filter(d => d.direccion === 'me_deben' && !d.saldada);
  const cobradas = S.deudas.filter(d => d.direccion === 'me_deben' && d.saldada);
  const grupos = new Map();
  pend.forEach(d => { const k = clavePersona(d); if (!grupos.has(k)) grupos.set(k, []); grupos.get(k).push(d); });
  const lista = [...grupos.values()].map(items => ({ items, nombre: (items[0].persona || items[0].nombre).trim(), total: items.reduce((a, d) => a + saldoDeuda(d), 0) }))
    .sort((a, b) => b.total - a.total);
  const total = lista.reduce((a, g) => a + g.total, 0);
  const persona = g => {
    const tel = g.items.find(d => d.telefono)?.telefono;
    const detalle = g.items.map(d => `• ${d.nombre}: ${money(saldoDeuda(d))}`).join('\n');
    const msg = `Hola ${g.nombre}, ¿cómo estás? Te escribo para recordarte el saldo pendiente de ${money(g.total)}:\n${detalle}\n¡Gracias!`;
    return `<div class="card persona">
      <div class="card-head"><h3>${esc(g.nombre)}</h3><b class="pos">${money(g.total)}</b></div>
      ${g.items.map(d => {
        const dd = d.fecha_limite ? diasHasta(d.fecha_limite) : null;
        const dias = diasHasta(d.fecha_inicio || hoy());
        return `<div class="cobro-row">
          <button class="cobro-main" data-act="edit-deuda" data-id="${d.id}"><b>${esc(d.nombre)}</b>
            <small>${money(saldoDeuda(d))} de ${money(d.monto)} · desde hace ${-dias} día${dias === -1 ? '' : 's'}${dd !== null ? (dd < 0 ? ` · <span class="neg">⚠ prometió pagar hace ${-dd} días</span>` : ` · paga en ${dd} días`) : ''}</small></button>
          <button class="btn sm" data-act="new-mov" data-tipo="abono_deuda" data-deuda="${d.id}">Cobrar</button>
        </div>`;
      }).join('')}
      <a class="btn sm wa" href="${waLink(tel, msg)}" target="_blank" rel="noopener">💬 Recordar por WhatsApp</a>
    </div>`;
  };
  return `
  <section class="stats3 compact two">
    <div class="stat"><span>Te deben en total</span><b class="pos">${money(total)}</b></div>
    <div class="stat"><span>Personas</span><b>${lista.length}</b></div>
  </section>
  ${lista.length ? lista.map(persona).join('') : vacio('🤝', 'Nadie te debe dinero. Registra un préstamo o divide un gasto desde el botón +.', 'new-cobro', 'Registrar préstamo')}
  ${cobradas.length ? `<details class="group"><summary>Cobrados (${cobradas.length})</summary>${cobradas.map(deudaCard).join('')}</details>` : ''}`;
}

/* ---------- Gastos fijos ---------- */
const FRECUENCIAS = { semanal: 'Semanal', quincenal: 'Quincenal (15 y fin de mes)', mensual: 'Mensual', anual: 'Anual' };
const equivalenteMensual = r => num(r.monto) * ({ semanal: 52 / 12, quincenal: 2, mensual: 1, anual: 1 / 12 }[r.frecuencia] || 1);
function avanzarFecha(f, frecuencia) {
  const d = parseF(f);
  const finMes = (y, mo) => new Date(y, mo + 1, 0).getDate();
  if (frecuencia === 'semanal') return addDias(f, 7);
  if (frecuencia === 'anual') return ymd(new Date(d.getFullYear() + 1, d.getMonth(), Math.min(d.getDate(), finMes(d.getFullYear() + 1, d.getMonth()))));
  if (frecuencia === 'quincenal') {
    if (d.getDate() < 15) return ymd(new Date(d.getFullYear(), d.getMonth(), 15));
    if (d.getDate() < finMes(d.getFullYear(), d.getMonth())) return ymd(new Date(d.getFullYear(), d.getMonth(), finMes(d.getFullYear(), d.getMonth())));
    return ymd(new Date(d.getFullYear(), d.getMonth() + 1, 15));
  }
  const y = d.getMonth() === 11 ? d.getFullYear() + 1 : d.getFullYear();
  const mo = (d.getMonth() + 1) % 12;
  return ymd(new Date(y, mo, Math.min(d.getDate(), finMes(y, mo))));
}
const recurrentesProximos = () => S.recurrentes.filter(r => r.activo && r.proxima <= addDias(hoy(), 3)).sort((a, b) => a.proxima.localeCompare(b.proxima));
function recRow(r) {
  const dd = diasHasta(r.proxima);
  const cuando = dd < 0 ? `<span class="neg">⚠ vencido hace ${-dd} día${dd === -1 ? '' : 's'}</span>` : dd === 0 ? '<b>hoy</b>' : dd === 1 ? 'mañana' : `en ${dd} días (${fechaCorta(r.proxima)})`;
  const cat = byId('categorias', r.categoria_id);
  return `<div class="rec-row">
    <button class="rec-main" data-act="edit-rec" data-id="${r.id}">
      <span class="mov-ic" style="--c:${cat?.color || 'var(--muted)'}">${esc(cat?.icono || (r.tipo === 'gasto' ? '🔁' : '💼'))}</span>
      <span class="mov-main"><span class="mov-t">${esc(r.nombre)}${r.es_suscripcion ? ' <span class="tag">suscripción</span>' : ''}</span>
      <span class="mov-s">${r.activo ? cuando : 'pausado'} · ${FRECUENCIAS[r.frecuencia].split(' ')[0].toLowerCase()}</span></span>
      <span class="mov-a ${r.tipo === 'gasto' ? 'neg' : 'pos'}">${money(r.monto)}</span>
    </button>
    ${r.activo ? `<div class="rec-btns"><button class="btn sm primary" data-act="rec-registrar" data-id="${r.id}">Registrar</button><button class="btn sm" data-act="rec-omitir" data-id="${r.id}">Omitir</button></div>` : ''}
  </div>`;
}
function vRecurrentes() {
  const act = S.recurrentes.filter(r => r.activo).sort((a, b) => a.proxima.localeCompare(b.proxima));
  const pausados = S.recurrentes.filter(r => !r.activo);
  const gastoMensual = act.filter(r => r.tipo === 'gasto').reduce((a, r) => a + equivalenteMensual(r), 0);
  const subs = act.filter(r => r.tipo === 'gasto' && r.es_suscripcion);
  return `
  <section class="stats3 compact two">
    <div class="stat"><span>Gastos fijos al mes</span><b class="neg">${money(gastoMensual)}</b></div>
    <div class="stat"><span>Suscripciones al mes</span><b>${money(subs.reduce((a, r) => a + equivalenteMensual(r), 0))}</b></div>
  </section>
  <p class="hint">Cuando llegue la fecha aparecen en Inicio para registrarlos con un toque. "Omitir" salta al siguiente periodo sin registrar.</p>
  ${act.length ? `<div class="card flush">${act.map(recRow).join('')}</div>` : vacio('🔁', 'Agrega tu renta, servicios, suscripciones o tu sueldo.', 'new-rec', 'Nuevo gasto fijo')}
  ${pausados.length ? `<details class="group"><summary>Pausados (${pausados.length})</summary><div class="card flush">${pausados.map(recRow).join('')}</div></details>` : ''}`;
}

function vCategorias() {
  const lunes = lunesDe(hoy());
  const row = c => {
    const g = gastoSemana(lunes, c.id);
    const l = num(c.presupuesto_semanal);
    return `<button class="list-item" data-act="edit-cat" data-id="${c.id}">
    <span class="li-ic" style="background:color-mix(in srgb, ${c.color} 16%, transparent)">${esc(c.icono || '•')}</span>
    <span class="li-main"><b>${esc(c.nombre)}</b><small>${c.tipo === 'gasto' ? (l ? `Esta semana ${money(g)} de ${money(l)}` : `Esta semana ${money(g)} · sin límite`) : 'Ingreso'}</small></span>
    <span class="chev">›</span></button>`;
  };
  const sec = (tipo, titulo) => {
    const act = S.categorias.filter(c => c.tipo === tipo && !c.archivada);
    return `<div class="group"><h4>${titulo}</h4><div class="list">${act.map(row).join('') || '<p class="hint">Sin categorías.</p>'}</div>
      <button class="btn sm ghost" data-act="new-cat" data-tipo="${tipo}">+ Categoría de ${tipo}</button></div>`;
  };
  const arch = S.categorias.filter(c => c.archivada);
  return `<p class="hint">Los límites semanales por categoría son opcionales. Tu presupuesto semanal total se define en <button class="link inline" data-act="go" data-v="ajustes">Ajustes</button>.</p>
  ${sec('gasto', 'Gastos')}${sec('ingreso', 'Ingresos')}
  ${arch.length ? `<details class="group"><summary>Archivadas (${arch.length})</summary><div class="list">${arch.map(row).join('')}</div></details>` : ''}`;
}

/* ---------- Ajustes ---------- */
function vAjustes() {
  const ah = cuentasAhorro();
  const sumaCats = sumaLimitesCategorias();
  const perm = 'Notification' in window ? Notification.permission : 'no';
  const iosSinInstalar = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.navigator.standalone;
  let notif;
  if (!Store.remote) notif = '<p class="hint">Disponible en la versión conectada a Supabase.</p>';
  else if (iosSinInstalar) notif = '<p class="hint">Para recibir notificaciones en el iPhone, primero instala la app: en Safari toca Compartir → <b>Agregar a pantalla de inicio</b> y ábrela desde ese ícono.</p>';
  else if (!('PushManager' in window) || !('serviceWorker' in navigator)) notif = '<p class="hint">Este navegador no admite notificaciones.</p>';
  else if (perm === 'denied') notif = '<p class="hint">Bloqueaste las notificaciones. Actívalas en Configuración → Notificaciones → Finanzas.</p>';
  else notif = `<div class="btn-col">${perm === 'granted' && pref.get('push_ok', false)
    ? '<p class="hint">✓ Notificaciones activas en este dispositivo.</p><button class="btn" data-act="push-probar">Enviar notificación de prueba</button>'
    : '<button class="btn primary" data-act="push-activar">Activar notificaciones</button>'}</div>`;
  return `
  <form id="ajustes-form" class="card form-plain">
    <h3>Presupuesto semanal</h3>
    <p class="hint">De lunes a domingo. Sin contar compras a meses sin intereses.</p>
    <label class="field"><span class="lbl">Presupuesto semanal total</span>
      <input name="presupuesto_semanal" inputmode="decimal" autocomplete="off" placeholder="${sumaCats ? sumaCats.toFixed(2) : 'Ej. 3000'}" value="${num(AJ.presupuesto_semanal) ? num(AJ.presupuesto_semanal) : ''}"></label>
    ${sumaCats ? `<p class="hint">Tus límites por categoría suman ${money(sumaCats)}. Si dejas vacío el total, se usa esa suma.</p>` : ''}
    <h3 class="mt">Ahorro del lunes</h3>
    <p class="hint">Si al cerrar la semana te sobró presupuesto, el lunes te avisamos cuánto apartar. Esta es la cuenta que aparece preseleccionada; en el aviso puedes elegir cualquier cuenta de tipo Ahorro.</p>
    ${ah.length ? selCuenta('cuenta_ahorro_id', 'Cuenta de ahorro preferida', cuentaAhorroDefault(), { filtro: c => c.tipo === 'ahorro' })
      : '<p class="hint warn-t">No tienes cuentas de tipo Ahorro. Crea una en Cuentas.</p>'}
    <button class="btn primary" type="submit">Guardar ajustes</button>
  </form>
  <div class="card">
    <h3>Notificaciones</h3>
    <p class="hint">Cada lunes a las 9:00 am te avisamos cómo cerraste la semana y cuánto apartar.</p>
    ${notif}
  </div>`;
}

/* ---------- Aviso del lunes (flotante, se puede descartar) ---------- */
function avisoSemanal() {
  const total = presupuestoSemanal();
  if (!total) return null;
  const lunesPrev = addDias(lunesDe(hoy()), -7);
  if (AJ.semana_revisada && AJ.semana_revisada >= lunesPrev) return null;
  const primer = S.movimientos.filter(x => !x.msi_meses).reduce((m, x) => (!m || x.fecha < m ? x.fecha : m), null);
  if (!primer || primer > addDias(lunesPrev, 6)) return null; // aún no usabas la app esa semana
  const gastado = gastoSemana(lunesPrev);
  return { lunes: lunesPrev, gastado, total, sobra: round2(total - gastado) };
}
function avisoHtml() {
  const a = avisoSemanal();
  if (!a) return '';
  const ok = a.sobra > 0;
  return `<div class="float-card ${ok ? 'ok' : 'bad'}" role="status">
    <button class="float-x" data-act="aviso-cerrar" data-lunes="${a.lunes}" aria-label="Descartar aviso">✕</button>
    <div class="float-ic">${ok ? '🎉' : '⚠️'}</div>
    <div class="float-body">
      <b>${ok ? '¡Semana cumplida!' : 'Rebasaste tu presupuesto'}</b>
      <p>Semana ${rangoSemana(a.lunes)}: gastaste ${money(a.gastado)} de ${money(a.total)}.
      ${ok ? `Te sobraron <b>${money(a.sobra)}</b>. Apártalos para no gastarlos.` : `Te pasaste por <b>${money(-a.sobra)}</b>. Esta semana intenta compensarlo.`}</p>
      ${ok ? `<button class="btn sm primary" data-act="aviso-apartar" data-lunes="${a.lunes}" data-monto="${a.sobra}">Apartar ${money(a.sobra)}</button>` : `<button class="btn sm" data-act="aviso-cerrar" data-lunes="${a.lunes}">Entendido</button>`}
    </div>
  </div>`;
}
async function marcarSemanaRevisada(lunes) {
  AJ.semana_revisada = lunes;
  render();
  try { AJ = { ...AJ, ...(await Store.saveAjustes({ semana_revisada: lunes })) }; } catch (e) { toast('No se pudo guardar: ' + e.message, 'err'); }
}

/* =====================================================================
   Consultor con reglas: analiza tus propios datos (sin conexión)
   ===================================================================== */
const mesesAtras = (ym, n) => Array.from({ length: n }, (_, i) => shiftMes(ym, -(i + 1)));
const gastoMes = (ym, catId) => sumMonto(S.movimientos.filter(m => m.tipo === 'gasto' && m.fecha.startsWith(ym) && (catId === undefined || m.categoria_id === catId)));
const ingresoMes = ym => sumMonto(S.movimientos.filter(m => m.tipo === 'ingreso' && m.fecha.startsWith(ym)));
const mesesConDatos = yms => yms.filter(ym => S.movimientos.some(m => m.fecha.startsWith(ym) && (m.tipo === 'gasto' || m.tipo === 'ingreso')));

function consejos() {
  const out = [];
  const add = (prio, icon, titulo, texto, tono = '') => out.push({ prio, icon, titulo, texto, tono });
  const h = hoy();
  const mesAct = h.slice(0, 7);
  const lunes = lunesDe(h);
  const diaSem = (parseF(h).getDay() + 6) % 7; // 0 = lunes
  const act = cuentasActivas();
  const prev = mesesConDatos(mesesAtras(mesAct, 3));
  const promGasto = prev.length ? prev.reduce((a, ym) => a + gastoMes(ym), 0) / prev.length : 0;
  const promIng = prev.length ? prev.reduce((a, ym) => a + ingresoMes(ym), 0) / prev.length : 0;

  // 1. Ritmo del presupuesto semanal
  const total = presupuestoSemanal();
  if (total) {
    const g = gastoSemana(lunes);
    const quedan = 7 - diaSem;
    if (g > total) add(95, '🛑', 'Ya rebasaste tu presupuesto de la semana', `Llevas ${money(g)} de ${money(total)}. Evita gastos no esenciales hasta el domingo.`, 'bad');
    else if (g / total > (diaSem + 1) / 7 + 0.15) add(90, '🏃', 'Vas rápido esta semana', `Llevas ${pct(g, total)}% del presupuesto y apenas va ${diaSem + 1} de 7 días. Para no rebasarlo, gasta máximo ${money((total - g) / quedan)} al día.`, 'warn');
    S.categorias.filter(c => c.tipo === 'gasto' && num(c.presupuesto_semanal) > 0).forEach(c => {
      const gc = gastoSemana(lunes, c.id);
      const l = num(c.presupuesto_semanal);
      if (gc > l) add(85, c.icono || '•', `${c.nombre}: límite semanal rebasado`, `Llevas ${money(gc)} de ${money(l)} esta semana.`, 'bad');
      else if (gc / l >= 0.85) add(80, c.icono || '•', `${c.nombre} casi en el límite`, `Llevas ${money(gc)} de ${money(l)}. Te quedan ${money(l - gc)} hasta el domingo.`, 'warn');
    });
  }

  // 2. Tarjetas: fecha de pago, corte próximo, uso del crédito
  act.filter(c => c.tipo === 'credito').forEach(c => {
    const e = estadoTarjeta(c);
    const deuda = Math.max(0, -(C.saldo.get(c.id) || 0));
    if (e && e.fechaPago && e.porPagar > 0) {
      const dd = diasHasta(e.fechaPago);
      if (dd >= 0 && dd <= 5) add(100, '💳', `Paga ${c.nombre} antes del ${fechaCorta(e.fechaPago)}`, `Te faltan ${money(e.porPagar)} del corte. Pagar el total evita intereses (que en tarjetas suelen superar 50% anual).`, 'bad');
    }
    if (e) {
      const dc = diasHasta(e.prox);
      if (dc >= 0 && dc <= 3) add(30, '📅', `${c.nombre} corta en ${dc === 0 ? 'hoy' : dc + ' día' + (dc === 1 ? '' : 's')}`, `Si una compra puede esperar, hazla después del ${fechaCorta(e.prox)}: se cobrará hasta el siguiente estado de cuenta y tendrás más días para pagarla.`);
    }
    const lim = num(c.limite_credito);
    if (lim && deuda / lim > 0.3) add(50, '📉', `Usas ${pct(deuda, lim)}% del límite de ${c.nombre}`, 'Mantener el uso por debajo de 30% del límite ayuda a tu historial en Buró de Crédito.');
    if (e && e.msiMensual > 0 && promIng > 0 && e.msiMensual / promIng > 0.3) add(60, '🧮', `Mucho comprometido en meses sin intereses`, `Pagas ${money(e.msiMensual)} al mes de MSI en ${c.nombre}, más de 30% de tu ingreso promedio. Evita nuevas compras a meses hasta liberar algunas.`, 'warn');
  });
  const msiTotal = act.filter(c => c.tipo === 'credito').reduce((a, c) => a + (estadoTarjeta(c)?.msiMensual || 0), 0);
  if (msiTotal > 0 && !(promIng > 0 && msiTotal / promIng > 0.3)) add(20, '🧮', 'Mensualidades de MSI', `Tienes ${money(msiTotal)} al mes comprometidos en compras a meses sin intereses. Tómalos en cuenta antes de comprometer más.`);

  // 3. Gastos hormiga del mes
  const hormiga = S.movimientos.filter(m => m.tipo === 'gasto' && m.fecha.startsWith(mesAct) && num(m.monto) < 150);
  const sumH = sumMonto(hormiga);
  if (hormiga.length >= 8 && sumH >= 500) add(60, '🐜', 'Gastos hormiga', `Llevas ${hormiga.length} gastos menores a $150 este mes que suman ${money(sumH)}. Al año serían unos ${money(sumH / Math.max(1, parseF(h).getDate()) * 365)}.`, 'warn');

  // 4. Categorías por encima de su promedio
  if (prev.length) {
    S.categorias.filter(c => c.tipo === 'gasto').forEach(c => {
      const prom = prev.reduce((a, ym) => a + gastoMes(ym, c.id), 0) / prev.length;
      const ahora = gastoMes(mesAct, c.id);
      if (prom > 0 && ahora > prom && ahora - prom > 300) add(70, c.icono || '•', `${c.nombre} arriba de lo normal`, `Este mes llevas ${money(ahora)} y tu promedio mensual es ${money(prom)} (+${money(ahora - prom)}).`, 'warn');
    });
  }

  // 5. Fondo de emergencia y dinero sin rendimiento
  const liquido = act.filter(c => ['debito', 'ahorro', 'efectivo'].includes(c.tipo)).reduce((a, c) => a + Math.max(0, C.saldo.get(c.id) || 0), 0);
  const corriente = act.filter(c => ['debito', 'efectivo'].includes(c.tipo)).reduce((a, c) => a + Math.max(0, C.saldo.get(c.id) || 0), 0);
  if (promGasto > 0) {
    const meses = liquido / promGasto;
    if (meses < 3) add(55, '🛟', `Tu fondo de emergencia cubre ${meses.toFixed(1)} meses`, `Lo recomendable es de 3 a 6 meses de gastos (${money(promGasto * 3)} a ${money(promGasto * 6)}). Aparta un monto fijo cada quincena hasta llegar.`);
    else add(35, '📈', 'Ya tienes fondo de emergencia: pon a trabajar el excedente', 'Opciones comunes en México: CETES (cetesdirecto.com, desde $100 y respaldados por el gobierno), pagarés bancarios o cuentas con rendimiento diario. Compara la GAT real (rendimiento menos inflación) antes de elegir.');
    if (corriente > promGasto * 1.5) add(45, '💤', 'Dinero sin rendimiento', `Tienes ${money(corriente - promGasto)} más de lo que gastas en un mes en cuentas de débito y efectivo. Muévelo a tu cuenta de ahorro o a inversión para que genere intereses.`);
  }

  // 6. Tasa de ahorro del último mes completo
  const ultimo = mesesConDatos([shiftMes(mesAct, -1)])[0];
  if (ultimo) {
    const i = ingresoMes(ultimo);
    const g = gastoMes(ultimo);
    if (i > 0) {
      const tasa = (i - g) / i;
      if (tasa < 0.1) add(50, '⚖️', `En ${MESES[parseF(ultimo + '-01').getMonth()]} ahorraste ${Math.round(tasa * 100)}% de tus ingresos`, 'Una guía útil es la regla 50/30/20: 50% necesidades, 30% gustos y 20% ahorro o pago de deudas.', 'warn');
      else if (tasa >= 0.2) add(12, '🌟', `Ahorraste ${Math.round(tasa * 100)}% de tus ingresos el mes pasado`, '¡Excelente! Sigue así y considera aumentar tus aportaciones a metas o inversión.', 'ok');
    }
  }

  // 7. Por cobrar viejas o vencidas
  S.deudas.filter(d => d.direccion === 'me_deben' && !d.saldada).forEach(d => {
    const vencida = d.fecha_limite && diasHasta(d.fecha_limite) < 0;
    const dias = -diasHasta(d.fecha_inicio || h);
    if (vencida || dias > 30) add(65, '🤝', `${d.persona || d.nombre} te debe ${money(saldoDeuda(d))}`, vencida ? `La fecha prometida (${fechaCorta(d.fecha_limite)}) ya pasó. Mándale un recordatorio desde Por cobrar.` : `Lleva ${dias} días pendiente. Un recordatorio amable ayuda.`);
  });

  // 8. Gastos fijos vencidos y suscripciones
  const vencidos = S.recurrentes.filter(r => r.activo && r.proxima < h);
  if (vencidos.length) add(75, '🔁', `${vencidos.length} gasto${vencidos.length > 1 ? 's' : ''} fijo${vencidos.length > 1 ? 's' : ''} sin registrar`, vencidos.map(r => r.nombre).join(', ') + '. Regístralos o márcalos como omitidos para que tus saldos sean reales.', 'warn');
  const subs = S.recurrentes.filter(r => r.activo && r.tipo === 'gasto' && r.es_suscripcion);
  if (subs.length) add(25, '📺', `Pagas ${money(subs.reduce((a, r) => a + equivalenteMensual(r), 0))} al mes en suscripciones`, `${subs.map(r => r.nombre).join(', ')}. ¿Usas todas? Cancelar una que no usas es ahorro inmediato.`);

  // 9. Metas atrasadas
  const ahorroMensual = promIng - promGasto;
  S.metas.filter(m => !m.completada && m.fecha_objetivo).forEach(m => {
    const falta = num(m.monto_objetivo) - progresoMeta(m);
    const dias = diasHasta(m.fecha_objetivo);
    if (falta <= 0 || dias <= 0) return;
    const necesario = falta / Math.max(1, Math.ceil(dias / 30.44));
    if (prev.length && necesario > ahorroMensual) add(40, '🎯', `"${m.nombre}" va atrasada`, `Necesitas ${money(necesario)} al mes y tu ahorro promedio es ${money(Math.max(0, ahorroMensual))}. Ajusta la fecha o recorta gastos.`, 'warn');
  });

  // 10. Semana anterior cumplida
  const a = avisoSemanal() || (total ? { sobra: total - gastoSemana(addDias(lunes, -7)), revisada: true } : null);
  if (a && a.sobra > 0 && S.movimientos.some(m => m.fecha >= addDias(lunes, -7) && m.fecha < lunes)) add(15, '✅', 'Cumpliste tu presupuesto la semana pasada', `Te sobraron ${money(a.sobra)}. ¡Bien hecho!`, 'ok');

  if (!out.length) add(1, '👍', 'Todo en orden', S.movimientos.length < 10 ? 'Registra tus gastos unos días para que pueda darte consejos con base en tus hábitos.' : 'No veo alertas por ahora. Sigue registrando tus movimientos.', 'ok');
  return out.sort((x, y) => y.prio - x.prio);
}
const tipHtml = t => `<div class="tip ${t.tono}"><span class="tip-ic">${esc(t.icon)}</span><div><b>${esc(t.titulo)}</b><p>${esc(t.texto)}</p></div></div>`;
function vConsejos() {
  const t = consejos();
  return `${t.map(tipHtml).join('')}
  <p class="hint center">Consejos generales calculados con tus propios datos. No sustituyen la asesoría de un profesional financiero.</p>`;
}

/* =====================================================================
   Reportes
   ===================================================================== */
function delta(actual, anterior, menosEsMejor) {
  if (!anterior) return '<small class="muted">sin mes anterior</small>';
  const d = (actual - anterior) / Math.abs(anterior) * 100;
  const bueno = menosEsMejor ? d <= 0 : d >= 0;
  return `<small class="${bueno ? 'pos' : 'neg'}">${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(0)}% vs mes anterior</small>`;
}
function vReportes() {
  const ym = ui.mes;
  const ant = shiftMes(ym, -1);
  const ing = ingresoMes(ym); const gas = gastoMes(ym);
  const ingA = ingresoMes(ant); const gasA = gastoMes(ant);
  const ahorro = ing - gas; const ahorroA = ingA - gasA;
  const tasa = ing ? ahorro / ing * 100 : 0;

  // 6 meses: barras agrupadas ingresos vs gastos
  const meses = [...mesesAtras(shiftMes(ym, 1), 6)].reverse();
  const datos = meses.map(m => ({ m, i: ingresoMes(m), g: gastoMes(m) }));
  const max = Math.max(1, ...datos.map(d => Math.max(d.i, d.g)));
  const W = 340, H = 170, pl = 6, pb = 22, colW = (W - pl) / 6, bw = Math.min(16, colW / 3);
  const y = v => (H - pb) - v / max * (H - pb - 10);
  const barra = (x, v, cls) => {
    const top = y(v); const h = (H - pb) - top;
    if (h <= 0.5) return '';
    const r = Math.min(4, h);
    return `<path class="${cls}" d="M${x},${H - pb} V${top + r} Q${x},${top} ${x + r},${top} H${x + bw - r} Q${x + bw},${top} ${x + bw},${top + r} V${H - pb} Z"/>`;
  };
  const svg = `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Ingresos y gastos de los últimos 6 meses">
    <line class="axis" x1="${pl}" x2="${W}" y1="${H - pb}" y2="${H - pb}"/>
    ${datos.map((d, k) => {
      const x0 = pl + k * colW + (colW - bw * 2 - 2) / 2;
      const [yy, mm] = d.m.split('-').map(Number);
      return `<g class="col${d.m === ym ? ' sel' : ''}" data-tip="${cap(MESES[mm - 1])} ${yy}|${money(d.i)}|${money(d.g)}">
        <rect class="hit" x="${pl + k * colW}" y="0" width="${colW}" height="${H}"/>
        ${barra(x0, d.i, 'b-ing')}${barra(x0 + bw + 2, d.g, 'b-gas')}
        <text x="${pl + k * colW + colW / 2}" y="${H - 6}" text-anchor="middle">${MESES[mm - 1].slice(0, 3)}</text>
      </g>`;
    }).join('')}
  </svg>`;

  // categorías: este mes vs anterior
  const cats = S.categorias.filter(c => c.tipo === 'gasto').map(c => ({ c, a: gastoMes(ym, c.id), b: gastoMes(ant, c.id) }))
    .filter(r => r.a || r.b).sort((p, q) => q.a - p.a);
  const sinCat = gastoMes(ym) - cats.reduce((s, r) => s + r.a, 0);
  const maxC = Math.max(1, ...cats.map(r => r.a));
  const top = S.movimientos.filter(m => m.tipo === 'gasto' && m.fecha.startsWith(ym)).sort((p, q) => num(q.monto) - num(p.monto)).slice(0, 5);

  // semanas
  const total = presupuestoSemanal();
  const semanas = Array.from({ length: 8 }, (_, k) => addDias(lunesDe(hoy()), -7 * (k + 1)))
    .filter(l => S.movimientos.some(m => !m.msi_meses && m.fecha >= l && m.fecha <= addDias(l, 6)));

  return `
  ${mesNav()}
  <section class="kpis">
    <div class="stat"><span>Ingresos</span><b>${money(ing)}</b>${delta(ing, ingA, false)}</div>
    <div class="stat"><span>Gastos</span><b>${money(gas)}</b>${delta(gas, gasA, true)}</div>
    <div class="stat"><span>Ahorro</span><b class="${ahorro >= 0 ? 'pos' : 'neg'}">${money(ahorro)}</b>${delta(ahorro, ahorroA, false)}</div>
    <div class="stat"><span>Tasa de ahorro</span><b>${ing ? tasa.toFixed(0) + '%' : '—'}</b><small class="muted">meta sugerida: 20%</small></div>
  </section>

  <section class="card">
    <div class="card-head"><h3>Últimos 6 meses</h3></div>
    <div class="legend"><span><i class="sw-ing"></i>Ingresos</span><span><i class="sw-gas"></i>Gastos</span></div>
    <div class="chart-wrap">${svg}<div class="chart-tip" hidden></div></div>
    <p class="hint">Toca un mes para ver los montos.</p>
  </section>

  <section class="card">
    <div class="card-head"><h3>Gastos por categoría</h3></div>
    ${cats.length ? `<table class="tbl"><thead><tr><th>Categoría</th><th>${MESES[parseF(ym + '-01').getMonth()].slice(0, 3)}</th><th>Cambio</th></tr></thead><tbody>
      ${cats.map(r => `<tr><td><span class="cat-ic">${esc(r.c.icono || '•')}</span>${esc(r.c.nombre)}<div class="mini-bar"><span style="width:${(r.a / maxC * 100).toFixed(1)}%;background:${r.c.color}"></span></div></td>
        <td><b>${money(r.a)}</b></td>
        <td>${r.b ? `<span class="${r.a > r.b ? 'neg' : 'pos'}">${r.a > r.b ? '▲' : '▼'} ${money(Math.abs(r.a - r.b))}</span>` : '<span class="muted">nuevo</span>'}</td></tr>`).join('')}
      ${sinCat > 0.5 ? `<tr><td>Sin categoría</td><td><b>${money(sinCat)}</b></td><td></td></tr>` : ''}
    </tbody></table>` : '<p class="hint">Sin gastos en este mes.</p>'}
  </section>

  <section class="card">
    <div class="card-head"><h3>Gastos más grandes del mes</h3></div>
    ${top.length ? `<div class="mov-list">${top.map(m => movRow(m)).join('')}</div>` : '<p class="hint">Sin gastos en este mes.</p>'}
  </section>

  <section class="card">
    <div class="card-head"><h3>Presupuesto por semana</h3></div>
    ${!total ? '<p class="hint">Define tu presupuesto semanal en Ajustes para ver este historial.</p>'
      : semanas.length ? semanas.map(l => {
        const g = gastoSemana(l);
        const okS = g <= total;
        return `<div class="week-row"><span>${rangoSemana(l)}</span><span class="${okS ? 'pos' : 'neg'}">${okS ? '✓ Cumplida' : '✕ Rebasada'}</span><b>${money(g)}</b><small class="muted">${okS ? 'sobró ' + money(total - g) : '+' + money(g - total)}</small></div>`;
      }).join('') : '<p class="hint">Aún no hay semanas completas registradas.</p>'}
  </section>
  <p class="hint center">Las compras a meses sin intereses cuentan completas en el mes de compra y no cuentan para el presupuesto semanal.</p>`;
}

function vRespaldo() {
  return `
  <div class="card">
    <h3>Exportar</h3>
    <p class="hint">${S.movimientos.length} movimientos · ${S.cuentas.length} cuentas · ${S.metas.length} metas · ${S.deudas.length} deudas</p>
    <div class="btn-col">
      <button class="btn" data-act="export-csv">⬇︎ Movimientos para Excel (.csv)</button>
      <button class="btn" data-act="export-json">⬇︎ Respaldo completo (.json)</button>
    </div>
    <p class="hint">${Store.remote ? 'El plan gratuito de Supabase no hace respaldos automáticos: descarga el respaldo completo al menos una vez al mes.' : 'En modo demo, si borras los datos del navegador se pierde todo. Descarga un respaldo antes de conectar Supabase y luego impórtalo allá.'}</p>
  </div>
  <div class="card">
    <h3>Importar respaldo</h3>
    <p class="hint">Reemplaza <b>todos</b> los datos actuales por los del archivo .json.</p>
    <label class="btn danger-outline file-btn">Elegir archivo .json<input type="file" accept="application/json,.json" data-change="import-json" hidden></label>
  </div>`;
}

function vLogin() {
  return `<div class="login">
    <div class="login-mark">$</div>
    <h1>Mis finanzas</h1>
    <p class="muted">Inicia sesión para ver tus cuentas.</p>
    <form id="login-form" class="form">
      <label class="field"><span class="lbl">Correo</span><input type="email" name="email" autocomplete="email" required></label>
      <label class="field"><span class="lbl">Contraseña</span><input type="password" name="pw" autocomplete="current-password" required></label>
      <button class="btn primary big" type="submit">Entrar</button>
    </form>
    <p class="hint center">El usuario se crea desde el panel de Supabase (Authentication → Users).</p>
  </div>`;
}

const VIEWS = {
  inicio: vInicio, movs: vMovs, cuentas: vCuentas, mas: vMas, metas: vMetas, deudas: vDeudas, porcobrar: vPorCobrar,
  categorias: vCategorias, respaldo: vRespaldo, recurrentes: vRecurrentes, consejos: vConsejos, reportes: vReportes, ajustes: vAjustes
};

function header() {
  const sub = SUBVISTAS.includes(ui.view);
  const accion = { cuentas: 'new-acct', metas: 'new-meta', deudas: 'new-deuda', porcobrar: 'new-cobro', categorias: 'new-cat', recurrentes: 'new-rec' }[ui.view];
  return `<header class="top">
    ${sub ? '<button class="icon-btn back" data-act="go" data-v="mas" aria-label="Regresar">‹</button>' : ''}
    <h1>${TITULOS[ui.view]}</h1>
    ${accion ? `<button class="btn sm" data-act="${accion}">+ Nueva</button>` : ''}
  </header>`;
}

function tabbar() {
  const activo = SUBVISTAS.includes(ui.view) ? 'mas' : ui.view;
  const tab = (v, l) => `<button class="tab ${activo === v ? 'on' : ''}" data-act="go" data-v="${v}" aria-label="${l}">${ICONS[v]}<span>${l}</span></button>`;
  return `<nav class="tabbar"><div class="tabbar-in">
    ${tab('inicio', 'Inicio')}${tab('movs', 'Movimientos')}
    <button class="fab" data-act="new-mov" aria-label="Registrar movimiento">${ICONS.plus}</button>
    ${tab('cuentas', 'Cuentas')}${tab('mas', 'Más')}
  </div></nav>`;
}

let lastView = null;
function render() {
  const app = $('#app');
  if (ui.loading) { app.innerHTML = '<div class="splash"><div class="spinner"></div></div>'; return; }
  if (Store.remote && !ui.session) { app.innerHTML = vLogin(); lastView = null; return; }
  C = calc();
  const keep = lastView === ui.view ? window.scrollY : 0;
  const banner = Store.configuredButOffline
    ? '<div class="banner warn">Sin conexión a Supabase: no se pudo cargar la librería. Revisa tu internet.</div>'
    : (!Store.remote ? '<div class="banner">Modo demo · datos solo en este navegador</div>' : '');
  const errBanner = ui.error ? `<div class="banner err"><span>No se pudieron cargar tus datos: ${esc(ui.error)}</span><button class="btn sm" data-act="retry">Reintentar</button></div>` : '';
  app.innerHTML = banner + errBanner + header() + `<main class="view v-${ui.view}">${VIEWS[ui.view]()}</main>` + avisoHtml() + tabbar();
  lastView = ui.view;
  window.scrollTo(0, keep);
}

/* =====================================================================
   Hojas (bottom sheets) y formularios
   ===================================================================== */
const sheetRoot = () => $('#sheet-root');
function openSheet(title, body) {
  const root = sheetRoot();
  root.innerHTML = `<div class="sheet-backdrop" data-act="close-sheet"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-handle"></div>
      <div class="sheet-head"><h2>${esc(title)}</h2><button class="icon-btn" data-act="close-sheet" aria-label="Cerrar">✕</button></div>
      <div class="sheet-body">${body}</div>
    </div>`;
  document.body.classList.add('no-scroll');
  requestAnimationFrame(() => root.classList.add('open'));
  const sheet = $('.sheet', root);
  habilitarDeslizar(sheet);
  return sheet;
}
function habilitarDeslizar(sheet) {
  let y0 = null;
  let dy = 0;
  const zona = e => e.target.closest('.sheet-handle, .sheet-head') || sheet.scrollTop <= 0 && e.target.closest('.sheet-head');
  sheet.addEventListener('touchstart', e => { if (zona(e)) { y0 = e.touches[0].clientY; dy = 0; sheet.style.transition = 'none'; } }, { passive: true });
  sheet.addEventListener('touchmove', e => { if (y0 === null) return; dy = Math.max(0, e.touches[0].clientY - y0); sheet.style.transform = `translateY(${dy}px)`; }, { passive: true });
  sheet.addEventListener('touchend', () => {
    if (y0 === null) return;
    sheet.style.transition = '';
    if (dy > 90) closeSheet(); else sheet.style.transform = '';
    y0 = null;
  });
}
function closeSheet() {
  const root = sheetRoot();
  root.classList.remove('open');
  root.innerHTML = '';
  document.body.classList.remove('no-scroll');
}

function openForm(title, inner, onSubmit, onMount) {
  const sheet = openSheet(title, `<form class="form" novalidate>${inner}</form>`);
  const form = $('form', sheet);
  form.addEventListener('submit', async e => {
    e.preventDefault();
    const btn = form.querySelector('[type=submit]');
    if (btn.disabled) return;
    btn.disabled = true;
    try { await onSubmit(Object.fromEntries(new FormData(form)), form); } finally { btn.disabled = false; }
  });
  if (onMount) onMount(form);
  return form;
}

const fText = (name, label, val, attrs = '') => `<label class="field"><span class="lbl">${label}</span><input name="${name}" value="${esc(val ?? '')}" ${attrs}></label>`;
const fNum = (name, label, val, attrs = '') => `<label class="field"><span class="lbl">${label}</span><input name="${name}" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${val === null || val === undefined || val === '' ? '' : esc(val)}" ${attrs}></label>`;
const fDate = (name, label, val) => `<label class="field"><span class="lbl">${label}</span><input type="date" name="${name}" value="${esc(val || '')}"></label>`;
const segRadio = (name, opts, val) => `<div class="seg">${opts.map(([k, l]) => `<label><input type="radio" name="${name}" value="${k}" ${k === val ? 'checked' : ''}><span>${l}</span></label>`).join('')}</div>`;
const swatches = val => `<div class="field"><span class="lbl">Color</span><div class="swatches">${COLORES.map(c => `<label class="sw" style="--c:${c}"><input type="radio" name="color" value="${c}" ${c === (val || COLORES[0]) ? 'checked' : ''}><span></span></label>`).join('')}</div></div>`;
const acciones = (editando, txt = 'Guardar') => `<div class="form-actions">${editando ? '<button type="button" class="btn danger" data-f="del">Eliminar</button>' : ''}<button class="btn primary" type="submit">${txt}</button></div>`;

function selCuenta(name, label, val, opts = {}) {
  const list = S.cuentas.filter(c => (!c.archivada || c.id === val) && (!opts.filtro || opts.filtro(c))).sort(ordenCuentas);
  const sal = c => { const s = C.saldo.get(c.id) || 0; return c.tipo === 'credito' ? `debe ${money(Math.max(0, -s))}` : money(s); };
  return `<label class="field"><span class="lbl">${label}</span><select name="${name}">
    ${opts.blank ? `<option value="">${opts.blank}</option>` : ''}
    ${list.map(c => `<option value="${c.id}" ${c.id === val ? 'selected' : ''}>${esc(c.nombre)} · ${sal(c)}</option>`).join('')}
  </select></label>`;
}

function defaultCuenta(tipo) {
  const act = cuentasActivas();
  const ult = pref.get('cta_' + tipo, null);
  if (ult && act.some(c => c.id === ult)) return ult;
  const noCred = act.find(c => c.tipo !== 'credito');
  return (tipo === 'gasto' ? act[0] : noCred || act[0])?.id || null;
}

/* ---------- Movimiento ---------- */
function abrirMov(mov = null, preset = {}) {
  if (!S.cuentas.some(c => !c.archivada)) { toast('Primero crea una cuenta', 'err'); ui.view = 'cuentas'; render(); return; }
  const f = mov ? { ...mov, dividir: false, personas: '' } : {
    tipo: preset.tipo || 'gasto', fecha: preset.fecha || hoy(), monto: preset.monto ?? '', nota: preset.nota || '',
    categoria_id: preset.categoria_id || null, cuenta_id: preset.cuenta_id || null, cuenta_destino_id: preset.cuenta_destino_id || null,
    deuda_id: preset.deuda_id || null, meta_id: preset.meta_id || null, recurrente_id: preset.recurrente_id || null,
    msi_meses: null, dividir: false, personas: ''
  };
  f.soloAhorro = Boolean(preset.soloAhorro);
  if (!mov && !f.cuenta_id) f.cuenta_id = defaultCuenta(f.tipo);
  if (!mov && f.tipo === 'transferencia' && f.cuenta_destino_id && f.cuenta_id === f.cuenta_destino_id) {
    f.cuenta_id = cuentasActivas().find(c => c.id !== f.cuenta_destino_id && c.tipo !== 'credito')?.id || null;
  }
  const sheet = openSheet(mov ? 'Editar movimiento' : 'Nuevo movimiento', '<div id="movf"></div>');
  const host = $('#movf', sheet);
  const leer = () => {
    const form = $('form', host);
    if (!form) return;
    for (const [k, v] of new FormData(form)) f[k] = v;
    if (form.elements.dividir) f.dividir = form.elements.dividir.checked;
  };
  const draw = () => { host.innerHTML = movFormHtml(f, !!mov); };
  draw();
  if (!mov) $('[name=monto]', host)?.focus({ preventScroll: true });

  host.addEventListener('click', async e => {
    const seg = e.target.closest('[data-seg]');
    if (seg) {
      leer();
      f.tipo = seg.dataset.seg;
      f.categoria_id = null;
      if (!mov) f.cuenta_id = preset.cuenta_id || defaultCuenta(f.tipo);
      draw();
      return;
    }
    const chip = e.target.closest('[data-cat]');
    if (chip) {
      f.categoria_id = chip.dataset.cat;
      host.querySelectorAll('[data-cat]').forEach(x => x.classList.toggle('on', x === chip));
      return;
    }
    if (e.target.closest('[data-f=del]')) {
      if (!confirm('¿Eliminar este movimiento? Los saldos se recalculan.')) return;
      if (await run(() => borrar('movimientos', mov.id), 'Movimiento eliminado')) { closeSheet(); render(); }
    }
  });
  host.addEventListener('change', e => {
    if (['meta_id', 'deuda_id', 'cuenta_id', 'dividir'].includes(e.target.name)) { leer(); if (e.target.name === 'meta_id') f.cuenta_destino_id = null; draw(); }
  });
  host.addEventListener('input', e => {
    if (e.target.name !== 'monto' && e.target.name !== 'personas') return;
    const prev = $('.split-prev', host);
    if (prev) { leer(); prev.innerHTML = textoDivision(f); }
  });
  host.addEventListener('submit', async e => {
    e.preventDefault();
    leer();
    const btn = $('[type=submit]', host);
    if (btn.disabled) return;
    const monto = round2(num(f.monto));
    if (f.tipo === 'ajuste' ? monto === 0 : !(monto > 0)) return toast('Escribe un monto válido', 'err');
    const row = {
      tipo: f.tipo, monto, fecha: f.fecha || hoy(), nota: (f.nota || '').trim() || null,
      cuenta_id: nz(f.cuenta_id), cuenta_destino_id: null, categoria_id: null, deuda_id: null, meta_id: null,
      recurrente_id: f.recurrente_id || null, msi_meses: null
    };
    if (f.tipo === 'gasto' || f.tipo === 'ingreso') {
      if (!f.categoria_id) return toast('Elige una categoría', 'err');
      row.categoria_id = f.categoria_id;
      const cta = byId('cuentas', row.cuenta_id);
      if (f.tipo === 'gasto' && cta?.tipo === 'credito' && Number(f.msi_meses) > 1 && !f.dividir) row.msi_meses = Number(f.msi_meses);
    } else if (f.tipo === 'transferencia') {
      row.cuenta_destino_id = nz(f.cuenta_destino_id);
      if (!row.cuenta_destino_id) return toast('Elige la cuenta destino', 'err');
      if (row.cuenta_destino_id === row.cuenta_id) return toast('Origen y destino deben ser distintos', 'err');
    } else if (f.tipo === 'abono_deuda' || f.tipo === 'desembolso') {
      row.deuda_id = nz(f.deuda_id);
      if (!row.deuda_id) return toast('Elige la deuda', 'err');
    } else if (f.tipo === 'aportacion') {
      row.meta_id = nz(f.meta_id);
      if (!row.meta_id) return toast('Elige la meta', 'err');
      row.cuenta_destino_id = nz(f.cuenta_destino_id);
    }
    if (!row.cuenta_id) return toast('Elige una cuenta', 'err');
    const division = !mov && f.tipo === 'gasto' && f.dividir ? personasDivision(f.personas) : null;
    if (division && !division.length) return toast('Escribe los nombres de quienes te deben', 'err');
    btn.disabled = true;
    let saved = null;
    const ok = await run(async () => {
      if (division) {
        // Tu parte es gasto; la de cada persona sale de tu cuenta como préstamo por cobrar
        const n = division.length + 1;
        const parte = round2(monto / n);
        const mia = round2(monto - parte * division.length);
        saved = await guardar('movimientos', { ...row, monto: mia });
        for (const persona of division) {
          const d = await guardar('deudas', { direccion: 'me_deben', nombre: row.nota || 'Gasto compartido', persona, monto: parte, fecha_inicio: row.fecha, saldada: false });
          await guardar('movimientos', { tipo: 'desembolso', monto: parte, fecha: row.fecha, cuenta_id: row.cuenta_id, deuda_id: d.id, nota: null });
        }
      } else {
        saved = await guardar('movimientos', row, mov?.id);
      }
    }, division ? `Gasto dividido: ${division.length} persona${division.length > 1 ? 's' : ''} te deben` : (mov ? 'Movimiento actualizado' : 'Movimiento guardado'));
    btn.disabled = false;
    if (!ok) return;
    pref.set('cta_' + row.tipo, row.cuenta_id);
    closeSheet();
    C = calc();
    if (preset.onSaved) await preset.onSaved(saved);
    if (row.deuda_id) {
      const d = byId('deudas', row.deuda_id);
      if (d && !d.saldada && saldoDeuda(d) <= 0) { await run(() => guardar('deudas', { saldada: true }, d.id), '¡Deuda liquidada! 🎉'); }
    }
    if (row.meta_id) {
      const m = byId('metas', row.meta_id);
      if (m && progresoMeta(m) >= num(m.monto_objetivo)) toast('¡Alcanzaste tu meta "' + m.nombre + '"! 🎉', 'ok');
    }
    render();
  });
}

const personasDivision = txt => String(txt || '').split(/[,\n]/).map(x => x.trim()).filter(Boolean).slice(0, 20);
function textoDivision(f) {
  const ps = personasDivision(f.personas);
  const monto = round2(num(f.monto));
  if (!ps.length || !(monto > 0)) return 'Escribe los nombres separados por coma. Tú cuentas como una persona más.';
  const parte = round2(monto / (ps.length + 1));
  return `Entre ${ps.length + 1}: tu gasto es <b>${money(monto - parte * ps.length)}</b> y cada quien te debe <b>${money(parte)}</b> (se agrega a Por cobrar).`;
}

function movFormHtml(f, editando) {
  const segs = [['gasto', 'Gasto'], ['ingreso', 'Ingreso'], ['transferencia', 'Mover'], ['abono_deuda', 'Deuda'], ['aportacion', 'Meta']];
  const fijo = { desembolso: 'Préstamo ligado a una deuda', ajuste: 'Ajuste de saldo (positivo suma, negativo resta)' }[f.tipo];
  let campos = '';

  if (f.tipo === 'gasto' || f.tipo === 'ingreso') {
    const cats = S.categorias.filter(c => c.tipo === f.tipo && (!c.archivada || c.id === f.categoria_id));
    campos += `<div class="field"><span class="lbl">Categoría</span><div class="chips wrap">
      ${cats.map(c => `<button type="button" class="chip cat ${c.id === f.categoria_id ? 'on' : ''}" data-cat="${c.id}" style="--c:${c.color}"><span>${esc(c.icono || '')}</span>${esc(c.nombre)}</button>`).join('') || '<p class="hint">Crea categorías en Más → Categorías.</p>'}
    </div></div>`;
    campos += selCuenta('cuenta_id', f.tipo === 'gasto' ? 'Pagado con' : 'Depositado en', f.cuenta_id);
    const cta = byId('cuentas', f.cuenta_id);
    if (f.tipo === 'gasto' && cta?.tipo === 'credito' && !f.dividir) {
      const ops = [['', 'De contado'], ...[3, 6, 9, 12, 18, 24].map(n => [String(n), `${n} meses sin intereses`])];
      campos += `<label class="field"><span class="lbl">Forma de pago</span><select name="msi_meses">${ops.map(([v, l]) => `<option value="${v}" ${String(f.msi_meses || '') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
        <p class="hint">A meses: a tu estado de cuenta solo entra la mensualidad de cada corte y no cuenta para el presupuesto semanal.</p>`;
    }
    if (f.tipo === 'gasto' && !editando) {
      campos += `<label class="check"><input type="checkbox" name="dividir" ${f.dividir ? 'checked' : ''}> Dividir con otras personas</label>`;
      if (f.dividir) {
        campos += `<label class="field"><span class="lbl">¿Con quién? (separa con comas)</span><input name="personas" value="${esc(f.personas || '')}" placeholder="Ej. Juan, Ana" autocomplete="off"></label>
          <p class="hint split-prev">${textoDivision(f)}</p>`;
      }
    }
  } else if (f.tipo === 'transferencia') {
    if (!f.cuenta_destino_id || f.cuenta_destino_id === f.cuenta_id) f.cuenta_destino_id = cuentasActivas().find(c => c.id !== f.cuenta_id)?.id || null;
    const dest = byId('cuentas', f.cuenta_destino_id);
    campos += selCuenta('cuenta_id', 'Sale de', f.cuenta_id);
    campos += selCuenta('cuenta_destino_id', f.soloAhorro ? 'Apartar en (cuentas de ahorro)' : 'Entra a', f.cuenta_destino_id, f.soloAhorro ? { filtro: c => c.tipo === 'ahorro' } : {});
    campos += `<p class="hint">${f.soloAhorro ? 'Elige cualquiera de tus cuentas de tipo Ahorro. Queda registrado como traspaso, no como gasto.' : dest?.tipo === 'credito' ? 'Pago de tarjeta: reduce la deuda de ' + esc(dest.nombre) + '.' : 'Traspaso entre tus cuentas, depósitos de efectivo al banco o retiros del cajero. No cuenta como gasto ni ingreso.'}</p>`;
  } else if (f.tipo === 'abono_deuda' || f.tipo === 'desembolso') {
    const deudas = S.deudas.filter(d => !d.saldada || d.id === f.deuda_id);
    if (!deudas.length) {
      campos += `<div class="empty small"><p>No tienes deudas pendientes.</p><button type="button" class="btn sm" data-act="new-deuda">Registrar deuda</button></div>`;
    } else {
      if (!f.deuda_id) f.deuda_id = deudas[0].id;
      const d = byId('deudas', f.deuda_id);
      campos += `<label class="field"><span class="lbl">Deuda</span><select name="deuda_id">${deudas.map(x => `<option value="${x.id}" ${x.id === f.deuda_id ? 'selected' : ''}>${esc(x.nombre)} · ${x.direccion === 'debo' ? 'debo' : 'me deben'} ${money(saldoDeuda(x))}</option>`).join('')}</select></label>`;
      const sale = (f.tipo === 'abono_deuda') === (d?.direccion === 'debo');
      campos += selCuenta('cuenta_id', sale ? 'Sale de' : 'Entra a', f.cuenta_id);
    }
  } else if (f.tipo === 'aportacion') {
    const metas = S.metas.filter(m => !m.completada || m.id === f.meta_id);
    if (!metas.length) {
      campos += `<div class="empty small"><p>No tienes metas activas.</p><button type="button" class="btn sm" data-act="new-meta">Crear meta</button></div>`;
    } else {
      if (!f.meta_id) f.meta_id = metas[0].id;
      const m = byId('metas', f.meta_id);
      const ids = cuentasDeMeta(m);
      campos += `<label class="field"><span class="lbl">Meta</span><select name="meta_id">${metas.map(x => `<option value="${x.id}" ${x.id === f.meta_id ? 'selected' : ''}>${esc(x.nombre)}</option>`).join('')}</select></label>`;
      campos += selCuenta('cuenta_id', 'Sale de', f.cuenta_id);
      if (ids.length) {
        if (!f.cuenta_destino_id || !ids.includes(f.cuenta_destino_id)) f.cuenta_destino_id = ids.find(id => id !== f.cuenta_id) || ids[0];
        campos += selCuenta('cuenta_destino_id', 'Entra a', f.cuenta_destino_id, { filtro: c => ids.includes(c.id) });
        if (ids.includes(f.cuenta_id)) campos += '<p class="hint warn-t">El dinero ya está en una cuenta de la meta: elige otra cuenta de origen para que el avance suba.</p>';
      } else {
        campos += '<p class="hint">Esta meta no está ligada a una cuenta: la aportación solo se registra como apartado y no mueve saldos.</p>';
      }
    }
  } else {
    campos += selCuenta('cuenta_id', 'Cuenta', f.cuenta_id);
  }

  const montoVal = f.monto === '' || f.monto === null || f.monto === undefined ? '' : esc(f.monto);
  return `<form class="form" novalidate>
    ${fijo ? `<p class="hint fixed-type">${fijo}</p>` : `<div class="seg mov-seg">${segs.map(([k, l]) => `<button type="button" class="${f.tipo === k ? 'on' : ''}" data-seg="${k}">${l}</button>`).join('')}</div>`}
    <label class="amount t-${f.tipo}"><span>$</span><input name="monto" inputmode="${f.tipo === 'ajuste' ? 'text' : 'decimal'}" autocomplete="off" placeholder="0.00" value="${montoVal}" aria-label="Monto"></label>
    ${campos}
    <label class="field"><span class="lbl">Concepto (opcional)</span><input name="nota" maxlength="140" value="${esc(f.nota || '')}" placeholder="Ej. Súper semanal"></label>
    ${fDate('fecha', 'Fecha', f.fecha)}
    ${acciones(editando)}
  </form>`;
}

/* ---------- Detalle de cuenta ---------- */
function verCuenta(id) {
  const c = byId('cuentas', id);
  if (!c) return;
  const s = C.saldo.get(id) || 0;
  const n = S.movimientos.filter(m => m.cuenta_id === id || m.cuenta_destino_id === id).length;
  const cred = c.tipo === 'credito';
  const e = cred ? estadoTarjeta(c) : null;
  const lim = num(c.limite_credito);
  const deuda = Math.max(0, -s);
  openSheet(c.nombre, `
    <div class="acct-detail" style="--c:${c.color}">
      <small>${esc(c.banco ? c.banco + ' · ' : '')}${TIPOS_CUENTA[c.tipo]}</small>
      <div class="big">${cred ? money(deuda) : money(s)}</div>
      <small>${cred ? (s > 0 ? `Saldo a favor ${money(s)}` : 'Deuda total') : 'Saldo actual'}</small>
      ${cred && lim ? bar(deuda / lim * 100, null, deuda / lim > 0.8 ? 'warn' : '') + `<small>Disponible ${money(lim - deuda)} de ${money(lim)}</small>` : ''}
      ${e ? `<div class="tdc-grid light">
        <div><small>Pagar del corte ${fechaCorta(e.ultS)}</small><b>${e.porPagar > 0 ? money(e.porPagar) : 'Pagado ✓'}</b></div>
        <div><small>Nuevo periodo</small><b>${money(e.nuevoPeriodo)}</b></div>
      </div><small>${e.fechaPago ? `Fecha límite de pago ${fechaCorta(e.fechaPago)} · ` : ''}próximo corte ${fechaCorta(e.prox)}</small>
      ${e.msiRestante > 0 ? `<small>Meses sin intereses por pagar: ${money(e.msiRestante)} (${money(e.msiMensual)} al mes)</small>` : ''}` : ''}
    </div>
    <div class="btn-grid">
      ${cred
        ? `<button class="btn primary" data-act="new-mov" data-tipo="transferencia" data-destino="${id}">Pagar tarjeta</button>
           <button class="btn" data-act="new-mov" data-tipo="gasto" data-cuenta="${id}">Registrar compra</button>`
        : `<button class="btn primary" data-act="new-mov" data-tipo="ingreso" data-cuenta="${id}">Depositar</button>
           <button class="btn" data-act="new-mov" data-tipo="transferencia" data-cuenta="${id}">Transferir</button>
           <button class="btn" data-act="new-mov" data-tipo="gasto" data-cuenta="${id}">Registrar gasto</button>`}
      <button class="btn" data-act="ajustar" data-id="${id}">Ajustar saldo</button>
      <button class="btn" data-act="acct-movs" data-id="${id}">Movimientos (${n})</button>
      <button class="btn" data-act="edit-acct" data-id="${id}">Editar cuenta</button>
    </div>`);
}

function ajustarSaldo(id) {
  const c = byId('cuentas', id);
  const cred = c.tipo === 'credito';
  const actual = C.saldo.get(id) || 0;
  openForm('Ajustar saldo · ' + c.nombre, `
    <p class="hint">Escribe ${cred ? 'la deuda real que muestra tu banco' : 'el saldo real que muestra tu banco'}. Se registra un movimiento de ajuste por la diferencia, así no pierdes el historial.</p>
    ${fNum('real', cred ? 'Deuda real hoy' : 'Saldo real hoy', cred ? Math.max(0, -actual).toFixed(2) : actual.toFixed(2))}
    <p class="hint">En la app: ${cred ? money(Math.max(0, -actual)) : money(actual)}</p>
    ${acciones(false, 'Ajustar')}`, async d => {
    const real = num(d.real);
    const objetivo = cred ? -real : real;
    const delta = round2(objetivo - actual);
    if (Math.abs(delta) < 0.005) { toast('El saldo ya cuadra ✓', 'ok'); closeSheet(); return; }
    if (await run(() => guardar('movimientos', { tipo: 'ajuste', monto: delta, fecha: hoy(), cuenta_id: id, nota: null }), `Ajuste de ${delta > 0 ? '+' : '−'}${money(Math.abs(delta))} registrado`)) { closeSheet(); render(); }
  });
}

/* ---------- Cuenta ---------- */
function formCuenta(c = null) {
  const tipo = c?.tipo || 'debito';
  const saldoVal = c ? (tipo === 'credito' ? -num(c.saldo_inicial) : num(c.saldo_inicial)) : '';
  const inner = `
    ${fText('nombre', 'Nombre', c?.nombre, 'maxlength="40" placeholder="Ej. BBVA Nómina" required')}
    <label class="field"><span class="lbl">Tipo</span><select name="tipo">${Object.entries(TIPOS_CUENTA).map(([k, l]) => `<option value="${k}" ${k === tipo ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${fText('banco', 'Banco (opcional)', c?.banco, 'maxlength="40" placeholder="Ej. BBVA"')}
    <label class="field"><span class="lbl"><span class="no-credito">${c ? 'Saldo inicial' : 'Saldo actual'}</span><span class="only-credito">${c ? 'Deuda inicial' : 'Deuda actual de la tarjeta'}</span></span>
      <input name="saldo" inputmode="decimal" autocomplete="off" placeholder="0.00" value="${saldoVal === '' ? '' : saldoVal}"></label>
    ${c ? '<p class="hint">El saldo de hoy = este monto inicial + todos los movimientos. Para cuadrar contra el banco usa "Ajustar saldo".</p>' : ''}
    <div class="only-credito">
      ${fNum('limite_credito', 'Límite de crédito (opcional)', c?.limite_credito)}
      <div class="row2">
        ${fText('dia_corte', 'Día de corte', c?.dia_corte, 'inputmode="numeric" maxlength="2" placeholder="Ej. 3"')}
        ${fText('dia_pago', 'Día límite de pago', c?.dia_pago, 'inputmode="numeric" maxlength="2" placeholder="Ej. 23"')}
      </div>
    </div>
    ${swatches(c?.color)}
    ${c ? `<label class="check"><input type="checkbox" name="archivada" ${c.archivada ? 'checked' : ''}> Archivar (ocultar sin borrar el historial)</label>` : ''}
    ${acciones(!!c)}`;
  openForm(c ? 'Editar cuenta' : 'Nueva cuenta', inner, async d => {
    if (!d.nombre?.trim()) return toast('Ponle un nombre a la cuenta', 'err');
    const cred = d.tipo === 'credito';
    const v = round2(num(d.saldo));
    const dia = x => { const n = parseInt(x, 10); return n >= 1 && n <= 31 ? n : null; };
    const row = {
      nombre: d.nombre.trim(), tipo: d.tipo, banco: d.banco?.trim() || null,
      saldo_inicial: cred ? (v ? -v : 0) : v,
      limite_credito: cred && d.limite_credito !== '' ? round2(num(d.limite_credito)) : null,
      dia_corte: cred ? dia(d.dia_corte) : null, dia_pago: cred ? dia(d.dia_pago) : null,
      color: d.color || COLORES[0], archivada: d.archivada === 'on'
    };
    if (!c) row.orden = S.cuentas.length + 1;
    if (await run(() => guardar('cuentas', row, c?.id), c ? 'Cuenta actualizada' : 'Cuenta creada')) { closeSheet(); render(); }
  }, form => {
    const sync = () => form.classList.toggle('is-credito', form.elements.tipo.value === 'credito');
    form.elements.tipo.addEventListener('change', sync);
    sync();
    form.querySelector('[data-f=del]')?.addEventListener('click', async () => {
      if (S.movimientos.some(m => m.cuenta_id === c.id || m.cuenta_destino_id === c.id)) return toast('Tiene movimientos: mejor archívala', 'err');
      if (!confirm(`¿Eliminar la cuenta "${c.nombre}"?`)) return;
      if (await run(() => borrar('cuentas', c.id), 'Cuenta eliminada')) {
        for (const m of S.metas.filter(x => (x.cuenta_ids || []).includes(c.id))) await run(() => guardar('metas', { cuenta_ids: m.cuenta_ids.filter(i => i !== c.id) }, m.id));
        closeSheet(); render();
      }
    });
  });
}

/* ---------- Categoría ---------- */
function formCategoria(c = null, tipoDef = 'gasto') {
  const tipo = c?.tipo || tipoDef;
  const usada = c && S.movimientos.some(m => m.categoria_id === c.id);
  const inner = `
    ${usada ? `<input type="hidden" name="tipo" value="${tipo}"><p class="hint">Categoría de ${tipo} (ya tiene movimientos, el tipo no se puede cambiar).</p>` : segRadio('tipo', [['gasto', 'Gasto'], ['ingreso', 'Ingreso']], tipo)}
    <div class="row2 icon-row">
      ${fText('icono', 'Ícono', c?.icono || '🏷️', 'maxlength="4" class="emoji-in"')}
      ${fText('nombre', 'Nombre', c?.nombre, 'maxlength="30" placeholder="Ej. Mascotas"')}
    </div>
    <div class="emoji-pick">${EMOJIS.map(e => `<button type="button" data-emoji="${e}">${e}</button>`).join('')}</div>
    <div class="only-gasto">${fNum('presupuesto', 'Límite semanal (opcional)', c?.presupuesto_semanal)}</div>
    ${swatches(c?.color)}
    ${c ? `<label class="check"><input type="checkbox" name="archivada" ${c.archivada ? 'checked' : ''}> Archivar</label>` : ''}
    ${acciones(!!c)}`;
  openForm(c ? 'Editar categoría' : 'Nueva categoría', inner, async d => {
    if (!d.nombre?.trim()) return toast('Escribe un nombre', 'err');
    const row = {
      nombre: d.nombre.trim(), tipo: d.tipo, icono: d.icono?.trim() || '🏷️', color: d.color || COLORES[0],
      presupuesto_semanal: d.tipo === 'gasto' && d.presupuesto !== '' && num(d.presupuesto) > 0 ? round2(num(d.presupuesto)) : null,
      archivada: d.archivada === 'on'
    };
    if (await run(() => guardar('categorias', row, c?.id), c ? 'Categoría actualizada' : 'Categoría creada')) { closeSheet(); render(); }
  }, form => {
    const sync = () => form.classList.toggle('is-ingreso', (form.elements.tipo.value || tipo) === 'ingreso');
    form.querySelectorAll('[name=tipo]').forEach(r => r.addEventListener('change', sync));
    sync();
    form.querySelector('.emoji-pick').addEventListener('click', e => { const b = e.target.closest('[data-emoji]'); if (b) form.elements.icono.value = b.dataset.emoji; });
    form.querySelector('[data-f=del]')?.addEventListener('click', async () => {
      if (usada) return toast('Tiene movimientos: mejor archívala', 'err');
      if (!confirm(`¿Eliminar la categoría "${c.nombre}"?`)) return;
      if (await run(() => borrar('categorias', c.id), 'Categoría eliminada')) { closeSheet(); render(); }
    });
  });
}

/* ---------- Meta ---------- */
function formMeta(m = null) {
  const ids = m ? cuentasDeMeta(m) : [];
  const ctas = S.cuentas.filter(c => (!c.archivada || ids.includes(c.id)) && c.tipo !== 'credito').sort(ordenCuentas);
  const inner = `
    ${fText('nombre', 'Nombre', m?.nombre, 'maxlength="60" placeholder="Ej. Fondo de emergencia"')}
    <div class="row2">
      ${fNum('monto_objetivo', 'Objetivo', m?.monto_objetivo)}
      ${fDate('fecha_objetivo', 'Fecha objetivo (opcional)', m?.fecha_objetivo)}
    </div>
    <div class="field"><span class="lbl">¿Dónde guardas este ahorro? (opcional)</span>
      <div class="checks">${ctas.map(c => `<label class="check"><input type="checkbox" name="cta_${c.id}" ${ids.includes(c.id) ? 'checked' : ''}> ${esc(c.nombre)} <small class="muted">${money(C.saldo.get(c.id) || 0)}</small></label>`).join('')}</div>
      <p class="hint">Si eliges cuentas, el avance es la suma de sus saldos. Si no, el avance son tus aportaciones registradas.</p>
    </div>
    <div class="only-virtual">${fNum('ahorrado_inicial', 'Ya llevo ahorrado', m?.ahorrado_inicial)}</div>
    ${swatches(m?.color || '#1F7A4D')}
    ${m ? `<label class="check"><input type="checkbox" name="completada" ${m.completada ? 'checked' : ''}> Marcar como completada</label>` : ''}
    ${acciones(!!m)}`;
  openForm(m ? 'Editar meta' : 'Nueva meta', inner, async (d, form) => {
    if (!d.nombre?.trim()) return toast('Escribe un nombre', 'err');
    const obj = round2(num(d.monto_objetivo));
    if (!(obj > 0)) return toast('Escribe el monto objetivo', 'err');
    const sel = ctas.filter(c => form.elements['cta_' + c.id]?.checked).map(c => c.id);
    const row = {
      nombre: d.nombre.trim(), monto_objetivo: obj, fecha_objetivo: nz(d.fecha_objetivo), cuenta_ids: sel,
      ahorrado_inicial: sel.length ? 0 : round2(num(d.ahorrado_inicial)), color: d.color || '#1F7A4D', completada: d.completada === 'on'
    };
    if (await run(() => guardar('metas', row, m?.id), m ? 'Meta actualizada' : 'Meta creada')) { closeSheet(); render(); }
  }, form => {
    const sync = () => form.classList.toggle('has-cuentas', [...form.querySelectorAll('.checks input')].some(i => i.checked));
    form.querySelectorAll('.checks input').forEach(i => i.addEventListener('change', sync));
    sync();
    form.querySelector('[data-f=del]')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar la meta "${m.nombre}"? Sus aportaciones se conservan como movimientos.`)) return;
      if (await run(() => borrar('metas', m.id), 'Meta eliminada')) {
        S.movimientos.forEach(x => { if (x.meta_id === m.id) x.meta_id = null; });
        closeSheet(); render();
      }
    });
  });
}

/* ---------- Deuda ---------- */
function formDeuda(d = null, dirDef = 'debo') {
  const dir = d?.direccion || dirDef;
  const inner = `
    ${segRadio('direccion', [['debo', 'Yo debo'], ['me_deben', 'Me deben']], dir)}
    ${fText('nombre', 'Concepto', d?.nombre, 'maxlength="60" placeholder="Ej. Préstamo para el coche"')}
    ${fText('persona', '<span class="only-debo">Persona o institución (opcional)</span><span class="only-medeben">¿Quién te debe?</span>', d?.persona, 'maxlength="60" autocomplete="off"')}
    <div class="only-medeben">${fText('telefono', 'WhatsApp (opcional, 10 dígitos)', d?.telefono, 'inputmode="tel" maxlength="16" placeholder="Ej. 9991234567"')}</div>
    <div class="row2">
      ${fNum('monto', 'Monto total', d?.monto)}
      ${fDate('fecha_limite', 'Fecha límite (opcional)', d?.fecha_limite)}
    </div>
    ${!d ? `${fDate('fecha_inicio', 'Fecha del préstamo', hoy())}
      <div class="field"><span class="lbl"><span class="only-debo">¿Recibiste el dinero en una cuenta?</span><span class="only-medeben">¿De qué cuenta salió el dinero?</span></span>
      ${selCuenta('cuenta_mov', '', null, { blank: 'No registrar movimiento' }).replace('<span class="lbl"></span>', '')}</div>
      <p class="hint">Si eliges una cuenta, se registra la entrada o salida del dinero (no cuenta como ingreso ni gasto).</p>` : ''}
    <label class="field"><span class="lbl">Notas (opcional)</span><textarea name="notas" rows="2" maxlength="300">${esc(d?.notas || '')}</textarea></label>
    ${d ? `<label class="check"><input type="checkbox" name="saldada" ${d.saldada ? 'checked' : ''}> Marcar como saldada</label>` : ''}
    ${acciones(!!d)}`;
  openForm(d ? 'Editar deuda' : 'Nueva deuda', inner, async f => {
    if (!f.nombre?.trim()) return toast('Escribe el concepto', 'err');
    if (f.direccion === 'me_deben' && !f.persona?.trim()) return toast('Escribe quién te debe', 'err');
    const monto = round2(num(f.monto));
    if (!(monto > 0)) return toast('Escribe el monto', 'err');
    const row = {
      direccion: f.direccion, nombre: f.nombre.trim(), persona: f.persona?.trim() || null, monto,
      telefono: f.direccion === 'me_deben' ? (f.telefono || '').replace(/[^\d+]/g, '') || null : null,
      fecha_limite: nz(f.fecha_limite), notas: f.notas?.trim() || null, saldada: f.saldada === 'on'
    };
    if (!d) row.fecha_inicio = f.fecha_inicio || hoy();
    await run(async () => {
      const saved = await guardar('deudas', row, d?.id);
      if (!d && f.cuenta_mov) await guardar('movimientos', { tipo: 'desembolso', monto, fecha: row.fecha_inicio, cuenta_id: f.cuenta_mov, deuda_id: saved.id, nota: null });
      closeSheet(); render();
    }, d ? 'Deuda actualizada' : 'Deuda registrada');
  }, form => {
    const sync = () => form.classList.toggle('is-medeben', form.elements.direccion.value === 'me_deben');
    form.querySelectorAll('[name=direccion]').forEach(r => r.addEventListener('change', sync));
    sync();
    form.querySelector('[data-f=del]')?.addEventListener('click', async () => {
      if (S.movimientos.some(m => m.deuda_id === d.id)) return toast('Tiene pagos registrados: márcala como saldada', 'err');
      if (!confirm(`¿Eliminar la deuda "${d.nombre}"?`)) return;
      if (await run(() => borrar('deudas', d.id), 'Deuda eliminada')) { closeSheet(); render(); }
    });
  });
}

/* ---------- Gasto fijo ---------- */
function formRecurrente(r = null) {
  const tipo = r?.tipo || 'gasto';
  const cats = t => S.categorias.filter(c => c.tipo === t && (!c.archivada || c.id === r?.categoria_id));
  const catSel = t => `<select name="categoria_${t}"><option value="">Sin categoría</option>${cats(t).map(c => `<option value="${c.id}" ${c.id === r?.categoria_id ? 'selected' : ''}>${esc(c.icono || '')} ${esc(c.nombre)}</option>`).join('')}</select>`;
  const inner = `
    ${segRadio('tipo', [['gasto', 'Gasto fijo'], ['ingreso', 'Ingreso fijo']], tipo)}
    ${fText('nombre', 'Nombre', r?.nombre, 'maxlength="60" placeholder="Ej. Renta, Netflix, CFE, Sueldo"')}
    ${fNum('monto', 'Monto', r?.monto)}
    <label class="field"><span class="lbl">Categoría</span><span class="only-gasto">${catSel('gasto')}</span><span class="only-ingreso">${catSel('ingreso')}</span></label>
    ${selCuenta('cuenta_id', 'Cuenta', r?.cuenta_id || defaultCuenta(tipo))}
    <label class="field"><span class="lbl">Frecuencia</span><select name="frecuencia">${Object.entries(FRECUENCIAS).map(([k, l]) => `<option value="${k}" ${k === (r?.frecuencia || 'mensual') ? 'selected' : ''}>${l}</option>`).join('')}</select></label>
    ${fDate('proxima', 'Próxima fecha', r?.proxima || hoy())}
    <label class="check only-gasto"><input type="checkbox" name="es_suscripcion" ${r?.es_suscripcion ? 'checked' : ''}> Es una suscripción (Netflix, Spotify, gimnasio…)</label>
    ${r ? `<label class="check"><input type="checkbox" name="pausado" ${r.activo ? '' : 'checked'}> Pausar</label>` : ''}
    ${acciones(!!r)}`;
  openForm(r ? 'Editar gasto fijo' : 'Nuevo gasto fijo', inner, async d => {
    if (!d.nombre?.trim()) return toast('Escribe un nombre', 'err');
    const monto = round2(num(d.monto));
    if (!(monto > 0)) return toast('Escribe el monto', 'err');
    if (!d.proxima) return toast('Elige la próxima fecha', 'err');
    const row = {
      tipo: d.tipo, nombre: d.nombre.trim(), monto, categoria_id: nz(d['categoria_' + d.tipo]), cuenta_id: nz(d.cuenta_id),
      frecuencia: d.frecuencia, proxima: d.proxima, es_suscripcion: d.tipo === 'gasto' && d.es_suscripcion === 'on', activo: d.pausado !== 'on'
    };
    if (await run(() => guardar('recurrentes', row, r?.id), r ? 'Gasto fijo actualizado' : 'Gasto fijo creado')) { closeSheet(); render(); }
  }, form => {
    const sync = () => form.classList.toggle('is-ingreso', form.elements.tipo.value === 'ingreso');
    form.querySelectorAll('[name=tipo]').forEach(x => x.addEventListener('change', sync));
    sync();
    form.querySelector('[data-f=del]')?.addEventListener('click', async () => {
      if (!confirm(`¿Eliminar "${r.nombre}"? Los movimientos ya registrados se conservan.`)) return;
      if (await run(() => borrar('recurrentes', r.id), 'Gasto fijo eliminado')) {
        S.movimientos.forEach(m => { if (m.recurrente_id === r.id) m.recurrente_id = null; });
        closeSheet(); render();
      }
    });
  });
}
function registrarRecurrente(r) {
  abrirMov(null, {
    tipo: r.tipo, monto: r.monto, categoria_id: r.categoria_id, cuenta_id: r.cuenta_id || defaultCuenta(r.tipo), nota: r.nombre,
    fecha: r.proxima <= hoy() ? r.proxima : hoy(), recurrente_id: r.id,
    onSaved: async () => { await run(() => guardar('recurrentes', { proxima: avanzarFecha(r.proxima, r.frecuencia) }, r.id)); }
  });
}
async function omitirRecurrente(r) {
  const sig = avanzarFecha(r.proxima, r.frecuencia);
  if (await run(() => guardar('recurrentes', { proxima: sig }, r.id), `Omitido · próximo: ${fechaCorta(sig)}`)) render();
}

/* ---------- Ajustes y notificaciones ---------- */
async function guardarAjustes(form) {
  const d = Object.fromEntries(new FormData(form));
  const patch = { presupuesto_semanal: d.presupuesto_semanal !== '' && num(d.presupuesto_semanal) > 0 ? round2(num(d.presupuesto_semanal)) : null };
  if ('cuenta_ahorro_id' in d) patch.cuenta_ahorro_id = nz(d.cuenta_ahorro_id);
  if (await run(async () => { AJ = { ...AJ, ...(await Store.saveAjustes(patch)) }; }, 'Ajustes guardados')) render();
}
const VAPID = () => (window.APP_CONFIG || {}).VAPID_PUBLIC_KEY || '';
function b64aBytes(b64) {
  const pad = '='.repeat((4 - b64.length % 4) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(raw, ch => ch.charCodeAt(0));
}
async function activarPush() {
  if (!VAPID()) return toast('Falta la llave pública de notificaciones en config.js', 'err');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') { render(); return toast('No se dio permiso de notificaciones', 'err'); }
  await run(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = (await reg.pushManager.getSubscription()) || await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64aBytes(VAPID()) });
    const j = sub.toJSON();
    await Store.savePushSub({ endpoint: j.endpoint, p256dh: j.keys.p256dh, auth: j.keys.auth });
    pref.set('push_ok', true);
  }, 'Notificaciones activadas ✓');
  render();
}

/* ---------- Gráfica: tooltip al tocar ---------- */
function mostrarTipGrafica(g) {
  const wrap = g.closest('.chart-wrap');
  const tip = $('.chart-tip', wrap);
  const [mes, i, gs] = g.dataset.tip.split('|');
  wrap.querySelectorAll('.col').forEach(x => x.classList.toggle('on', x === g));
  tip.innerHTML = `<b>${esc(mes)}</b><span><i class="sw-ing"></i>Ingresos ${esc(i)}</span><span><i class="sw-gas"></i>Gastos ${esc(gs)}</span>`;
  tip.hidden = false;
}

/* =====================================================================
   Respaldo
   ===================================================================== */
function descargar(nombre, contenido, tipo) {
  const blob = new Blob([contenido], { type: tipo });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}
function exportCSV() {
  const q = v => { const s = String(v ?? ''); return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  const cta = id => byId('cuentas', id)?.nombre || '';
  const TIPO = { gasto: 'Gasto', ingreso: 'Ingreso', transferencia: 'Transferencia', abono_deuda: 'Abono deuda', desembolso: 'Préstamo', aportacion: 'Aportación meta', ajuste: 'Ajuste' };
  const head = ['Fecha', 'Tipo', 'Monto', 'Cuenta', 'Cuenta destino', 'Categoría', 'Deuda', 'Meta', 'Meses sin intereses', 'Concepto'];
  const rows = [...S.movimientos].sort((a, b) => a.fecha.localeCompare(b.fecha)).map(m => [
    m.fecha, TIPO[m.tipo] || m.tipo, num(m.monto).toFixed(2), cta(m.cuenta_id), cta(m.cuenta_destino_id),
    byId('categorias', m.categoria_id)?.nombre || '', byId('deudas', m.deuda_id)?.nombre || '', byId('metas', m.meta_id)?.nombre || '', m.msi_meses || '', m.nota || ''
  ]);
  descargar(`movimientos_${hoy()}.csv`, '﻿' + [head, ...rows].map(r => r.map(q).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
function exportJSON() {
  const data = { app: 'mis-finanzas', version: 2, exportado: new Date().toISOString() };
  TABLES.forEach(t => { data[t] = S[t].map(({ user_id, ...r }) => r); });
  const { user_id, actualizado, ...aj } = AJ;
  data.ajustes = aj;
  descargar(`respaldo_finanzas_${hoy()}.json`, JSON.stringify(data, null, 1), 'application/json');
}
async function importJSON(input) {
  const file = input.files?.[0];
  input.value = '';
  if (!file) return;
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { return toast('El archivo no es un JSON válido', 'err'); }
  if (data.app !== 'mis-finanzas' || !['cuentas', 'categorias', 'deudas', 'metas', 'movimientos'].every(t => Array.isArray(data[t]))) return toast('El archivo no es un respaldo de esta app', 'err');
  if (!confirm(`Se reemplazarán TODOS tus datos por el respaldo del ${String(data.exportado || '').slice(0, 10)} (${data.movimientos.length} movimientos). ¿Continuar?`)) return;
  ui.loading = true; render();
  await run(async () => { await Store.replaceAll(data); await cargar(); }, 'Respaldo importado');
  ui.loading = false; render();
}

/* =====================================================================
   Eventos
   ===================================================================== */
const ACT = {
  go: d => { ui.view = d.v; closeSheet(); render(); window.scrollTo(0, 0); },
  mes: d => { ui.mes = shiftMes(ui.mes, Number(d.d)); render(); },
  filtro: d => { ui.filtroTipo = d.t; render(); },
  'new-mov': d => abrirMov(null, { tipo: d.tipo, cuenta_id: d.cuenta, cuenta_destino_id: d.destino, deuda_id: d.deuda, meta_id: d.meta }),
  'edit-mov': d => { const m = byId('movimientos', d.id); if (m) abrirMov(m); },
  acct: d => verCuenta(d.id),
  'acct-movs': d => { closeSheet(); ui.filtroCuenta = d.id; ui.filtroTipo = 'todos'; ui.view = 'movs'; render(); window.scrollTo(0, 0); },
  ajustar: d => ajustarSaldo(d.id),
  'new-acct': () => formCuenta(),
  'edit-acct': d => formCuenta(byId('cuentas', d.id)),
  'new-cat': d => formCategoria(null, d.tipo || 'gasto'),
  'edit-cat': d => formCategoria(byId('categorias', d.id)),
  'new-meta': () => formMeta(),
  'edit-meta': d => formMeta(byId('metas', d.id)),
  'new-deuda': () => formDeuda(),
  'new-cobro': () => formDeuda(null, 'me_deben'),
  'new-rec': () => formRecurrente(),
  'edit-rec': d => formRecurrente(byId('recurrentes', d.id)),
  'rec-registrar': d => { const r = byId('recurrentes', d.id); if (r) registrarRecurrente(r); },
  'rec-omitir': d => { const r = byId('recurrentes', d.id); if (r) omitirRecurrente(r); },
  'aviso-cerrar': d => marcarSemanaRevisada(d.lunes),
  'aviso-apartar': d => {
    if (!cuentasAhorro().length) { toast('Crea primero una cuenta de tipo Ahorro', 'err'); return; }
    const destino = cuentaAhorroDefault();
    const origen = cuentasActivas().find(c => c.tipo === 'debito' && c.id !== destino)?.id || defaultCuenta('transferencia');
    abrirMov(null, {
      tipo: 'transferencia', monto: Number(d.monto), cuenta_id: origen, cuenta_destino_id: destino, soloAhorro: true,
      nota: 'Ahorro semana ' + rangoSemana(d.lunes), onSaved: () => marcarSemanaRevisada(d.lunes)
    });
  },
  'push-activar': () => activarPush(),
  'push-probar': () => run(() => Store.invoke('tareas-programadas', { tarea: 'prueba' }), 'Notificación enviada: debería llegarte en unos segundos'),
  'edit-deuda': d => formDeuda(byId('deudas', d.id)),
  'close-sheet': () => closeSheet(),
  'export-csv': () => exportCSV(),
  'export-json': () => exportJSON(),
  sync: async () => { if (await run(cargar, 'Datos actualizados')) { ui.error = null; render(); } },
  retry: () => cargarYMostrar(),
  logout: async () => { if (confirm('¿Cerrar sesión?')) await Store.signOut(); },
  'reset-demo': async () => {
    if (!confirm('¿Borrar todos los datos del modo demo?')) return;
    Store.resetDemo();
    pref.set('sembrado_cat_demo', false);
    pref.set('sembrado_cta_demo', false);
    await cargar(); ui.view = 'inicio'; render();
  }
};

document.addEventListener('click', e => {
  const el = e.target.closest('[data-act]');
  if (!el || el.disabled) return;
  const fn = ACT[el.dataset.act];
  if (fn) { e.preventDefault(); fn(el.dataset, el); }
});
document.addEventListener('change', e => {
  const k = e.target.dataset?.change;
  if (k === 'filtro-cuenta') { ui.filtroCuenta = e.target.value; render(); }
  if (k === 'import-json') importJSON(e.target);
  if (k === 'respaldo-correo') {
    const v = e.target.checked;
    run(async () => { AJ = { ...AJ, ...(await Store.saveAjustes({ respaldo_correo: v })) }; }, v ? 'Respaldo semanal activado' : 'Respaldo semanal desactivado');
  }
});
document.addEventListener('click', e => {
  const g = e.target.closest('.chart .col');
  if (g) mostrarTipGrafica(g);
});
document.addEventListener('submit', async e => {
  if (e.target.id === 'ajustes-form') { e.preventDefault(); guardarAjustes(e.target); return; }
  if (e.target.id !== 'login-form') return;
  e.preventDefault();
  const f = e.target;
  const btn = f.querySelector('button[type=submit]');
  btn.disabled = true; btn.textContent = 'Entrando…';
  try { await Store.signIn(f.email.value.trim(), f.pw.value); } catch (err) { toast(err.message, 'err'); btn.disabled = false; btn.textContent = 'Entrar'; }
});
document.addEventListener('keydown', e => { if (e.key === 'Escape' && sheetRoot().innerHTML) closeSheet(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || !Store.remote || !ui.session || sheetRoot().innerHTML) return;
  if (Date.now() - ui.lastLoad > 60000) cargar().then(render).catch(() => {});
});

/* =====================================================================
   Arranque
   ===================================================================== */
async function cargarYMostrar() {
  ui.loading = true; render();
  try { await cargar(); ui.error = null; } catch (e) { console.error(e); ui.error = e.message || String(e); }
  ui.loading = false; render();
}

async function boot() {
  render();
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => {});
  if (Store.remote) {
    try { ui.session = await Store.session(); } catch (e) { ui.session = null; }
    Store.onAuth(session => {
      const tenia = Boolean(ui.session);
      ui.session = session;
      setTimeout(() => {
        if (session && !tenia) cargarYMostrar();
        if (!session) { TABLES.forEach(t => { S[t] = []; }); closeSheet(); ui.view = 'inicio'; render(); }
      }, 0);
    });
    if (!ui.session) { ui.loading = false; render(); return; }
  }
  await cargarYMostrar();
}

boot();
})();
