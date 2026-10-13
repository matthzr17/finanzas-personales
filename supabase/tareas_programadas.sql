-- =====================================================================
--  Mis Finanzas · tareas programadas (ejecutar después de migracion_v2.sql)
--  Requiere desplegar la Edge Function supabase/functions/tareas-programadas
--  con verify_jwt = false (la función valida su propio secreto).
-- =====================================================================

-- Llaves privadas: solo las lee service_role (RLS activo y sin políticas)
create table if not exists public.config_privada (clave text primary key, valor text not null);
alter table public.config_privada enable row level security;
revoke all on public.config_privada from anon, authenticated;
grant select, insert, update, delete on public.config_privada to service_role;

-- Valores (NO los subas a GitHub; ejecútalos solo en el SQL Editor):
-- insert into public.config_privada (clave, valor) values
--   ('vapid_public',  '<llave pública VAPID>'),
--   ('vapid_private', '<llave privada VAPID>'),
--   ('vapid_subject', 'https://TU-USUARIO.github.io/TU-REPO/'),
--   ('cron_secret',   '<texto aleatorio largo>'),
--   ('resend_api_key','re_...')          -- para el respaldo por correo
-- on conflict (clave) do update set valor = excluded.valor;

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

create or replace function public.llamar_tarea(p_tarea text, p_extra jsonb default '{}'::jsonb)
returns bigint language plpgsql security definer set search_path = '' as $$
declare v_secreto text; v_id bigint;
begin
  select valor into v_secreto from public.config_privada where clave = 'cron_secret';
  select net.http_post(
    url := 'https://enmqirfghjdxpkdqxnvz.supabase.co/functions/v1/tareas-programadas',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secreto),
    body := jsonb_build_object('tarea', p_tarea) || p_extra,
    timeout_milliseconds := 30000
  ) into v_id;
  return v_id;
end $$;
revoke execute on function public.llamar_tarea(text, jsonb) from public, anon, authenticated;

-- Lunes 9:00 am Mérida (UTC-6) = 15:00 UTC
select cron.schedule('aviso-semanal', '0 15 * * 1', $$ select public.llamar_tarea('aviso') $$);
-- Domingo 8:00 pm Mérida = lunes 02:00 UTC
select cron.schedule('respaldo-semanal', '0 2 * * 1', $$ select public.llamar_tarea('respaldo') $$);
