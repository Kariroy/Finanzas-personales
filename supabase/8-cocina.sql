-- Cocina (planificador de comidas, stock y recetas) — tabla propia, independiente del Libro de Gastos y de Planes.
-- Usa las mismas cuentas (auth.users) pero no toca ninguna otra tabla.
-- Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Se puede volver a correr sin romper nada.

-- Una fila por persona con sus recetas, stock y plan de comidas (JSON).
create table if not exists public.cocina_datos (
  user_id    uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  data       jsonb not null default '{}'::jsonb check (pg_column_size(data) < 5000000),
  updated_at timestamptz not null default now()
);

-- updated_at lo pone siempre la base (así dos dispositivos comparan la misma hora).
create or replace function public.cocina_touch()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists cocina_touch on public.cocina_datos;
create trigger cocina_touch before insert or update on public.cocina_datos
  for each row execute function public.cocina_touch();

-- Seguridad (RLS): cada persona ve y cambia solo su propia fila.
alter table public.cocina_datos enable row level security;

drop policy if exists "cocina: ver lo propio" on public.cocina_datos;
create policy "cocina: ver lo propio" on public.cocina_datos
  for select to authenticated using (user_id = auth.uid());

drop policy if exists "cocina: crear lo propio" on public.cocina_datos;
create policy "cocina: crear lo propio" on public.cocina_datos
  for insert to authenticated with check (user_id = auth.uid());

drop policy if exists "cocina: cambiar lo propio" on public.cocina_datos;
create policy "cocina: cambiar lo propio" on public.cocina_datos
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "cocina: borrar lo propio" on public.cocina_datos;
create policy "cocina: borrar lo propio" on public.cocina_datos
  for delete to authenticated using (user_id = auth.uid());

revoke all on public.cocina_datos from anon;
grant select, insert, update, delete on public.cocina_datos to authenticated;
