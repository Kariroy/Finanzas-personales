-- Libro de Gastos — parte 10: finanzas personales (cuentas, ingresos, transferencias)
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede volver a correr.
--
-- Todo es PRIVADO de cada usuario: nadie más lo ve, ni siquiera los de tus grupos.
-- Solo agrega tablas nuevas; no cambia ninguna tabla existente.

-- Cuentas: dónde está tu plata. Una tarjeta puede tener saldo en pesos y en dólares.
create table if not exists public.fin_accounts (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name        text not null check (length(trim(name)) between 1 and 60),
  kind        text not null check (kind in ('efectivo', 'banco', 'billetera', 'tarjeta', 'ahorro', 'inversion')),
  currency    text not null check (currency in ('UYU', 'USD', 'AMBAS')),
  initial_uyu numeric(14,2) not null default 0,
  initial_usd numeric(14,2) not null default 0,
  archived    boolean not null default false,
  sort        int not null default 0,
  created_at  timestamptz not null default now()
);

-- Movimientos propios: ingresos, gastos que no están en la app de gastos (ej. en dólares),
-- transferencias entre cuentas (incluye pagar la tarjeta y comprar dólares) y ajustes de saldo.
create table if not exists public.fin_movements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind          text not null check (kind in ('ingreso', 'gasto', 'transferencia', 'ajuste')),
  date          date not null,
  amount        numeric(14,2) not null check (amount <> 0),
  currency      text not null check (currency in ('UYU', 'USD')),
  account_id    uuid references public.fin_accounts(id) on delete set null,
  to_account_id uuid references public.fin_accounts(id) on delete set null,
  to_amount     numeric(14,2),
  to_currency   text check (to_currency in ('UYU', 'USD')),
  category      text,
  description   text not null default '' check (length(description) <= 200),
  installments  int not null default 1 check (installments between 1 and 60),
  created_at    timestamptz not null default now(),
  check (kind = 'ajuste' or amount > 0),
  check (kind <> 'transferencia' or (to_account_id is not null and to_amount > 0 and to_currency is not null))
);

-- De qué cuenta salió (o entró) la plata de algo registrado en la app de gastos:
-- un gasto, un pago de grupo (settlement) o una deuda. Es tuyo: el grupo no lo ve.
create table if not exists public.fin_links (
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ref_kind     text not null check (ref_kind in ('expense', 'settlement', 'debt')),
  ref_id       uuid not null,
  account_id   uuid references public.fin_accounts(id) on delete set null,
  installments int not null default 1 check (installments between 1 and 60),
  created_at   timestamptz not null default now(),
  primary key (user_id, ref_kind, ref_id)
);

-- Preferencias: si la opción está activada, valor del dólar y categorías de ingreso.
create table if not exists public.fin_settings (
  user_id           uuid primary key default auth.uid() references auth.users(id) on delete cascade,
  enabled           boolean not null default false,
  usd_rate          numeric(10,2) not null default 40 check (usd_rate > 0),
  income_categories jsonb not null default '["Sueldo","Freelance","Aguinaldo","Ventas","Regalos","Otros"]'::jsonb,
  updated_at        timestamptz not null default now()
);

create index if not exists fin_accounts_user_idx on public.fin_accounts(user_id);
create index if not exists fin_movements_user_idx on public.fin_movements(user_id, date);

-- ---------------------------------------------------------------------------
-- Seguridad: cada uno ve y toca solo lo suyo.
-- ---------------------------------------------------------------------------
alter table public.fin_accounts  enable row level security;
alter table public.fin_movements enable row level security;
alter table public.fin_links     enable row level security;
alter table public.fin_settings  enable row level security;

revoke all on public.fin_accounts, public.fin_movements, public.fin_links, public.fin_settings from anon;

drop policy if exists fin_accounts_own on public.fin_accounts;
create policy fin_accounts_own on public.fin_accounts for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists fin_movements_own on public.fin_movements;
create policy fin_movements_own on public.fin_movements for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists fin_links_own on public.fin_links;
create policy fin_links_own on public.fin_links for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists fin_settings_own on public.fin_settings;
create policy fin_settings_own on public.fin_settings for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Las cuentas que uses en un movimiento tienen que ser tuyas.
create or replace function public.fin_own_account(a uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select a is null or exists (select 1 from public.fin_accounts where id = a and user_id = auth.uid());
$$;

drop policy if exists fin_movements_accounts on public.fin_movements;
create policy fin_movements_accounts on public.fin_movements as restrictive for all to authenticated
  using (true)
  with check (public.fin_own_account(account_id) and public.fin_own_account(to_account_id));

drop policy if exists fin_links_accounts on public.fin_links;
create policy fin_links_accounts on public.fin_links as restrictive for all to authenticated
  using (true)
  with check (public.fin_own_account(account_id));

-- Tiempo real (celular y compu se actualizan entre sí).
do $rt$
begin
  begin alter publication supabase_realtime add table public.fin_accounts;  exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.fin_movements; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.fin_links;     exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.fin_settings;  exception when duplicate_object then null; end;
end
$rt$;
