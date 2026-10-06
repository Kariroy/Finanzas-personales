-- Planes (planificador de tareas) — tabla propia, independiente del Libro de Gastos.
-- Usa las mismas cuentas (auth.users) pero no toca ninguna tabla de gastos.
-- Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede volver a correr sin romper nada.

-- Una fila por persona con todos sus programas, proyectos y tareas (JSON).
create table if not exists public.planes_datos (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 5000000),
  updated_at timestamptz not null default now()
);

-- updated_at lo pone siempre la base (así dos dispositivos comparan la misma hora).
create or replace function public.planes_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists planes_touch on public.planes_datos;
create trigger planes_touch before insert or update on public.planes_datos
  for each row execute function public.planes_touch();

-- Seguridad (RLS): cada persona ve y cambia solo su propia fila.
alter table public.planes_datos enable row level security;

drop policy if exists "planes: ver lo propio" on public.planes_datos;
create policy "planes: ver lo propio" on public.planes_datos
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "planes: crear lo propio" on public.planes_datos;
create policy "planes: crear lo propio" on public.planes_datos
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "planes: cambiar lo propio" on public.planes_datos;
create policy "planes: cambiar lo propio" on public.planes_datos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "planes: borrar lo propio" on public.planes_datos;
create policy "planes: borrar lo propio" on public.planes_datos
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.planes_datos from anon;
grant select, insert, update, delete on public.planes_datos to authenticated;
