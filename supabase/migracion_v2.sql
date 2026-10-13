-- =====================================================================
--  Mis Finanzas v2 · ejecutar después de schema.sql
--  Presupuesto semanal, cuentas por cobrar, meses sin intereses,
--  gastos fijos recurrentes, ajustes por usuario y notificaciones push.
-- =====================================================================

alter table public.categorias  add column if not exists presupuesto_semanal numeric(14,2)
  check (presupuesto_semanal is null or presupuesto_semanal >= 0);
alter table public.deudas      add column if not exists telefono text;
alter table public.movimientos add column if not exists msi_meses smallint
  check (msi_meses is null or msi_meses between 2 and 48);

-- ---------- Ajustes (una fila por usuario) ----------
create table if not exists public.ajustes (
  user_id              uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  presupuesto_semanal  numeric(14,2) check (presupuesto_semanal is null or presupuesto_semanal >= 0),
  cuenta_ahorro_id     uuid references public.cuentas(id) on delete set null,
  semana_revisada      date,            -- lunes de la última semana cuyo aviso ya se descartó
  respaldo_correo      boolean not null default true,
  actualizado          timestamptz not null default now()
);

-- ---------- Gastos e ingresos fijos ----------
create table if not exists public.recurrentes (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre          text not null check (char_length(nombre) between 1 and 60),
  tipo            text not null check (tipo in ('gasto','ingreso')),
  monto           numeric(14,2) not null check (monto > 0),
  categoria_id    uuid references public.categorias(id) on delete set null,
  cuenta_id       uuid references public.cuentas(id) on delete set null,
  frecuencia      text not null check (frecuencia in ('semanal','quincenal','mensual','anual')),
  proxima         date not null,
  es_suscripcion  boolean not null default false,
  activo          boolean not null default true,
  creado          timestamptz not null default now()
);
create index if not exists recurrentes_user_idx on public.recurrentes (user_id);

alter table public.movimientos add column if not exists recurrente_id uuid
  references public.recurrentes(id) on delete set null;
create index if not exists movimientos_recurrente_idx on public.movimientos (recurrente_id);

-- ---------- Suscripciones a notificaciones push ----------
create table if not exists public.push_subs (
  id        uuid primary key default gen_random_uuid(),
  user_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint  text not null unique,
  p256dh    text not null,
  auth      text not null,
  creado    timestamptz not null default now()
);
create index if not exists push_subs_user_idx on public.push_subs (user_id);

-- ---------- Seguridad ----------
alter table public.ajustes     enable row level security;
alter table public.recurrentes enable row level security;
alter table public.push_subs   enable row level security;

create policy "solo_dueno" on public.ajustes     for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "solo_dueno" on public.recurrentes for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy "solo_dueno" on public.push_subs   for all to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

grant select, insert, update, delete on public.ajustes, public.recurrentes, public.push_subs to authenticated, service_role;
