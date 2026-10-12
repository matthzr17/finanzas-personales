-- =====================================================================
--  Mis Finanzas · esquema de base de datos para Supabase
--  Ejecutar completo en: Supabase → SQL Editor → New query → Run
--  Cada fila pertenece a un usuario (user_id) y las políticas RLS
--  impiden que alguien lea o modifique datos que no son suyos.
-- =====================================================================

create extension if not exists pgcrypto;

-- ---------- Cuentas (bancos, efectivo, tarjetas de crédito, ahorro) ----------
create table if not exists public.cuentas (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre          text not null check (char_length(nombre) between 1 and 40),
  tipo            text not null check (tipo in ('efectivo','debito','credito','ahorro','inversion','otro')),
  banco           text,
  saldo_inicial   numeric(14,2) not null default 0,   -- en crédito: negativo = deuda
  limite_credito  numeric(14,2),
  dia_corte       smallint check (dia_corte between 1 and 31),
  dia_pago        smallint check (dia_pago between 1 and 31),
  color           text not null default '#0F3D3E',
  orden           integer not null default 0,
  archivada       boolean not null default false,
  creado          timestamptz not null default now()
);

-- ---------- Categorías de gasto e ingreso ----------
create table if not exists public.categorias (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre               text not null check (char_length(nombre) between 1 and 30),
  tipo                 text not null check (tipo in ('gasto','ingreso')),
  icono                text,
  color                text not null default '#0F3D3E',
  presupuesto_mensual  numeric(14,2) check (presupuesto_mensual is null or presupuesto_mensual >= 0),
  archivada            boolean not null default false,
  creado               timestamptz not null default now()
);

-- ---------- Deudas personales (préstamos que debo o que me deben) ----------
create table if not exists public.deudas (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre        text not null check (char_length(nombre) between 1 and 60),
  persona       text,
  direccion     text not null check (direccion in ('debo','me_deben')),
  monto         numeric(14,2) not null check (monto > 0),
  fecha_inicio  date not null default current_date,
  fecha_limite  date,
  notas         text,
  saldada       boolean not null default false,
  creado        timestamptz not null default now()
);

-- ---------- Metas de ahorro ----------
create table if not exists public.metas (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,
  nombre            text not null check (char_length(nombre) between 1 and 60),
  monto_objetivo    numeric(14,2) not null check (monto_objetivo > 0),
  ahorrado_inicial  numeric(14,2) not null default 0,
  fecha_objetivo    date,
  cuenta_ids        uuid[] not null default '{}',   -- si tiene cuentas, el avance = saldo de esas cuentas
  color             text not null default '#1F7A4D',
  completada        boolean not null default false,
  creado            timestamptz not null default now()
);

-- ---------- Movimientos ----------
--  gasto        : sale de cuenta_id (con categoría)
--  ingreso      : entra a cuenta_id (con categoría)
--  transferencia: de cuenta_id a cuenta_destino_id (incluye pago de tarjeta)
--  abono_deuda  : pago o cobro de una deuda personal
--  desembolso   : dinero que recibí o presté al crear una deuda
--  aportacion   : ahorro hacia una meta
--  ajuste       : cuadre contra el saldo real del banco (monto con signo)
create table if not exists public.movimientos (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users(id) on delete cascade,
  fecha              date not null default current_date,
  tipo               text not null check (tipo in ('gasto','ingreso','transferencia','abono_deuda','desembolso','aportacion','ajuste')),
  monto              numeric(14,2) not null,
  cuenta_id          uuid references public.cuentas(id) on delete restrict,
  cuenta_destino_id  uuid references public.cuentas(id) on delete restrict,
  categoria_id       uuid references public.categorias(id) on delete restrict,
  deuda_id           uuid references public.deudas(id) on delete restrict,
  meta_id            uuid references public.metas(id) on delete set null,
  nota               text check (nota is null or char_length(nota) <= 140),
  creado             timestamptz not null default now(),
  constraint monto_valido check (monto > 0 or (tipo = 'ajuste' and monto <> 0)),
  constraint transferencia_valida check (
    tipo <> 'transferencia'
    or (cuenta_id is not null and cuenta_destino_id is not null and cuenta_id <> cuenta_destino_id)
  )
);

create index if not exists movimientos_user_fecha_idx on public.movimientos (user_id, fecha desc);
create index if not exists movimientos_cuenta_idx     on public.movimientos (cuenta_id);
create index if not exists movimientos_destino_idx    on public.movimientos (cuenta_destino_id);
create index if not exists movimientos_categoria_idx  on public.movimientos (categoria_id);
create index if not exists movimientos_deuda_idx      on public.movimientos (deuda_id);
create index if not exists movimientos_meta_idx       on public.movimientos (meta_id);
create index if not exists cuentas_user_idx           on public.cuentas (user_id);
create index if not exists categorias_user_idx        on public.categorias (user_id);
create index if not exists deudas_user_idx            on public.deudas (user_id);
create index if not exists metas_user_idx             on public.metas (user_id);

-- ---------- Seguridad: cada usuario solo ve y modifica sus filas ----------
do $$
declare t text;
begin
  foreach t in array array['cuentas','categorias','deudas','metas','movimientos'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "solo_dueno" on public.%I', t);
    execute format(
      'create policy "solo_dueno" on public.%I for all to authenticated
         using (user_id = (select auth.uid()))
         with check (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- Evita que un movimiento apunte a cuentas, categorías, deudas o metas de otro usuario
create or replace function public.validar_movimiento()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  if new.cuenta_id is not null and not exists (select 1 from public.cuentas where id = new.cuenta_id and user_id = new.user_id) then
    raise exception 'Cuenta no válida';
  end if;
  if new.cuenta_destino_id is not null and not exists (select 1 from public.cuentas where id = new.cuenta_destino_id and user_id = new.user_id) then
    raise exception 'Cuenta destino no válida';
  end if;
  if new.categoria_id is not null and not exists (select 1 from public.categorias where id = new.categoria_id and user_id = new.user_id) then
    raise exception 'Categoría no válida';
  end if;
  if new.deuda_id is not null and not exists (select 1 from public.deudas where id = new.deuda_id and user_id = new.user_id) then
    raise exception 'Deuda no válida';
  end if;
  if new.meta_id is not null and not exists (select 1 from public.metas where id = new.meta_id and user_id = new.user_id) then
    raise exception 'Meta no válida';
  end if;
  return new;
end $$;

drop trigger if exists movimientos_validar on public.movimientos;
create trigger movimientos_validar before insert or update on public.movimientos
  for each row execute function public.validar_movimiento();

-- ---------- Bloqueo de registros ----------
-- Ejecutar DESPUÉS de crear tu usuario: impide que alguien más se registre.
create or replace function public.bloquear_registros()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if exists (select 1 from auth.users) then
    raise exception 'El registro de nuevos usuarios está deshabilitado';
  end if;
  return new;
end $$;
revoke execute on function public.bloquear_registros() from public, anon, authenticated;
drop trigger if exists bloquear_registros on auth.users;
create trigger bloquear_registros before insert on auth.users
  for each row execute function public.bloquear_registros();
