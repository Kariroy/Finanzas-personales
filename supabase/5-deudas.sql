-- Libro de Gastos — parte 5: deudas entre personas (fuera de los grupos)
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede volver a correr.
--
-- Cada fila dice "deudor le debe a acreedor":
--   gasto    = el acreedor pagó algo que era 100% del deudor (cuenta como gasto del deudor)
--   prestamo = el acreedor le prestó plata al deudor
--   pago     = el deudor le devolvió plata al acreedor (resta deuda)
-- Cada lado es un usuario de la app (debe compartir algún grupo con quien anota)
-- o un nombre suelto (ej. "Papá"), que solo ve quien lo anotó.

create table if not exists public.debts (
  id            uuid primary key default gen_random_uuid(),
  created_by    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('gasto', 'prestamo', 'pago')),
  date          date not null,
  amount        numeric(14,2) not null check (amount > 0),
  description   text not null default '' check (length(description) <= 200),
  category_id   text,
  creditor_user uuid references auth.users(id) on delete set null,
  creditor_name text check (length(creditor_name) <= 40),
  debtor_user   uuid references auth.users(id) on delete set null,
  debtor_name   text check (length(debtor_name) <= 40),
  created_at    timestamptz not null default now(),
  check (creditor_user is not null or creditor_name is not null),
  check (debtor_user is not null or debtor_name is not null),
  check (creditor_user is null or debtor_user is null or creditor_user <> debtor_user)
);

create index if not exists debts_creditor_idx on public.debts(creditor_user);
create index if not exists debts_debtor_idx on public.debts(debtor_user);
create index if not exists debts_created_by_idx on public.debts(created_by);

-- ¿Comparto algún grupo con este usuario?
create or replace function public.shares_group(other uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on b.group_id = a.group_id
    where a.user_id = auth.uid() and b.user_id = other
  );
$$;

alter table public.debts enable row level security;
revoke all on public.debts from anon;

drop policy if exists debts_select on public.debts;
create policy debts_select on public.debts for select to authenticated
  using (auth.uid() in (created_by, creditor_user, debtor_user));

-- Quien anota tiene que ser uno de los dos lados; el otro lado, si es usuario,
-- tiene que compartir un grupo con quien anota.
drop policy if exists debts_insert on public.debts;
create policy debts_insert on public.debts for insert to authenticated
  with check (
    created_by = auth.uid()
    and (creditor_user = auth.uid() or debtor_user = auth.uid())
    and (creditor_user is null or creditor_user = auth.uid() or public.shares_group(creditor_user))
    and (debtor_user is null or debtor_user = auth.uid() or public.shares_group(debtor_user))
  );

drop policy if exists debts_update on public.debts;
create policy debts_update on public.debts for update to authenticated
  using (auth.uid() in (created_by, creditor_user, debtor_user))
  with check (
    (creditor_user = auth.uid() or debtor_user = auth.uid())
    and (creditor_user is null or creditor_user = auth.uid() or public.shares_group(creditor_user))
    and (debtor_user is null or debtor_user = auth.uid() or public.shares_group(debtor_user))
  );

drop policy if exists debts_delete on public.debts;
create policy debts_delete on public.debts for delete to authenticated
  using (auth.uid() in (created_by, creditor_user, debtor_user));

revoke update on public.debts from authenticated;
grant update (kind, date, amount, description, category_id, creditor_user, creditor_name, debtor_user, debtor_name)
  on public.debts to authenticated;

-- Tiempo real para las deudas (si ya estaba agregada, no hace nada).
do $rt$
begin
  alter publication supabase_realtime add table public.debts;
exception when duplicate_object then null;
end
$rt$;
