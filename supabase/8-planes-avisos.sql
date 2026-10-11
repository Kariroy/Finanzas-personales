-- Planes — avisos (notificaciones push) de las rutinas.
-- Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Antes: crear el secreto "planes_cron_secret" (ver README, sección Avisos).
-- Se puede volver a correr sin romper nada.

-- Dispositivos que reciben avisos (uno por navegador / celular donde los activaste).
create table if not exists public.planes_push (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  endpoint   text not null unique check (length(endpoint) < 1000),
  p256dh     text not null check (length(p256dh) < 200),
  auth       text not null check (length(auth) < 100),
  tz         text not null default 'America/Montevideo' check (length(tz) < 64),
  created_at timestamptz not null default now()
);

alter table public.planes_push enable row level security;

drop policy if exists "planes_push: ver lo propio" on public.planes_push;
create policy "planes_push: ver lo propio" on public.planes_push
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "planes_push: crear lo propio" on public.planes_push;
create policy "planes_push: crear lo propio" on public.planes_push
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "planes_push: cambiar lo propio" on public.planes_push;
create policy "planes_push: cambiar lo propio" on public.planes_push
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "planes_push: borrar lo propio" on public.planes_push;
create policy "planes_push: borrar lo propio" on public.planes_push
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.planes_push from anon;
grant select, insert, update, delete on public.planes_push to authenticated;

-- Avisos ya enviados (para no avisar dos veces la misma rutina el mismo día).
-- Solo la función de avisos (service role) la usa: sin políticas = nadie más la ve.
create table if not exists public.planes_push_log (
  user_id    uuid not null references auth.users(id) on delete cascade,
  routine_id text not null,
  day        date not null,
  sent_at    timestamptz not null default now(),
  primary key (user_id, routine_id, day)
);
alter table public.planes_push_log enable row level security;
revoke all on public.planes_push_log from anon, authenticated;

-- Cada minuto, llamar a la función "planes-avisos" (Edge Function).
-- El secreto se lee del Vault, así no queda escrito en este archivo.
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.unschedule('planes-avisos')
  where exists (select 1 from cron.job where jobname = 'planes-avisos');

select cron.schedule('planes-avisos', '* * * * *', $$
  select net.http_post(
    url     := 'https://qfmxdtwjexiobxpysrag.supabase.co/functions/v1/planes-avisos',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'planes_cron_secret')
    ),
    body    := '{}'::jsonb
  );
$$);

-- Limpieza: borrar registros de avisos de más de 30 días (una vez por día).
select cron.unschedule('planes-avisos-limpieza')
  where exists (select 1 from cron.job where jobname = 'planes-avisos-limpieza');
select cron.schedule('planes-avisos-limpieza', '17 4 * * *',
  $$ delete from public.planes_push_log where day < current_date - 30 $$);
