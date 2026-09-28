-- Libro de Gastos — parte 1 de 3: tablas
-- Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Correr las partes en orden (1, 2, 3). Se pueden volver a correr sin romper nada.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Tablas
-- ---------------------------------------------------------------------------

create table if not exists public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (length(trim(name)) between 1 and 60),
  invite_code text not null unique default upper(substr(md5(gen_random_uuid()::text), 1, 8)),
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now()
);

-- Integrantes de un grupo. user_id es null mientras la persona no se haya unido
-- (miembro "placeholder", como en Splitwise); al unirse con el código se completa.
create table if not exists public.group_members (
  id         uuid primary key default gen_random_uuid(),
  group_id   uuid not null references public.groups(id) on delete cascade,
  user_id    uuid references auth.users(id) on delete set null,
  name       text not null check (length(trim(name)) between 1 and 40),
  created_at timestamptz not null default now(),
  unique (group_id, user_id),
  unique (id, group_id)
);

create table if not exists public.expenses (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id    uuid references public.groups(id) on delete cascade,
  date        date not null,
  amount      numeric(14,2) not null check (amount > 0),
  description text not null default '' check (length(description) <= 200),
  category_id text not null,
  split_type  text check (split_type in ('equitativo', 'completo')),
  paid_by     uuid,
  owed_by     uuid,
  created_at  timestamptz not null default now(),
  -- quien pagó / a quién le corresponde tiene que ser del mismo grupo
  foreign key (paid_by, group_id) references public.group_members(id, group_id),
  foreign key (owed_by, group_id) references public.group_members(id, group_id),
  check (
    (group_id is null and split_type is null and paid_by is null and owed_by is null)
    or
    (group_id is not null and split_type is not null and paid_by is not null
      and (split_type = 'completo') = (owed_by is not null))
  )
);

create table if not exists public.settlements (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups(id) on delete cascade,
  from_member uuid not null,
  to_member   uuid not null,
  amount      numeric(14,2) not null check (amount > 0),
  date        date not null default current_date,
  created_by  uuid not null default auth.uid() references auth.users(id) on delete cascade,
  created_at  timestamptz not null default now(),
  foreign key (from_member, group_id) references public.group_members(id, group_id),
  foreign key (to_member, group_id) references public.group_members(id, group_id),
  check (from_member <> to_member)
);

create index if not exists group_members_user_idx on public.group_members(user_id);
create index if not exists expenses_user_idx on public.expenses(user_id);
create index if not exists expenses_group_idx on public.expenses(group_id);
create index if not exists settlements_group_idx on public.settlements(group_id);
