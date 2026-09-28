-- Libro de Gastos — esquema de Supabase
-- Pegar completo en Supabase → SQL Editor → Run. Se puede volver a correr sin romper nada.

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

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------

-- security definer para poder consultar group_members desde sus propias políticas
-- sin recursión.
create or replace function public.is_group_member(g uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = g and user_id = auth.uid()
  );
$$;

-- Crea un grupo con vos como integrante y, opcionalmente, un integrante pendiente.
create or replace function public.create_group(group_name text, my_name text, other_name text default null)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  insert into public.groups (name, created_by) values (trim(group_name), auth.uid()) returning id into gid;
  insert into public.group_members (group_id, user_id, name) values (gid, auth.uid(), trim(my_name));
  if coalesce(trim(other_name), '') <> '' then
    insert into public.group_members (group_id, user_id, name) values (gid, null, trim(other_name));
  end if;
  return gid;
end;
$$;

-- Unirse a un grupo con su código. Ocupa el primer lugar pendiente (si hay)
-- para heredar los gastos que ya se cargaron a su nombre.
create or replace function public.join_group(code text, my_name text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  gid uuid;
  mid uuid;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  select id into gid from public.groups where invite_code = upper(trim(code));
  if gid is null then
    raise exception 'Código inválido';
  end if;
  if exists (select 1 from public.group_members where group_id = gid and user_id = auth.uid()) then
    return gid;
  end if;
  select id into mid from public.group_members
    where group_id = gid and user_id is null
    order by created_at
    limit 1
    for update;
  if mid is not null then
    update public.group_members
      set user_id = auth.uid(), name = coalesce(nullif(trim(my_name), ''), name)
      where id = mid;
  else
    insert into public.group_members (group_id, user_id, name)
      values (gid, auth.uid(), coalesce(nullif(trim(my_name), ''), 'Integrante'));
  end if;
  return gid;
end;
$$;

revoke all on function public.create_group(text, text, text) from public, anon;
revoke all on function public.join_group(text, text) from public, anon;
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.join_group(text, text) to authenticated;

-- ---------------------------------------------------------------------------
-- Seguridad (Row Level Security)
-- ---------------------------------------------------------------------------

alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.expenses      enable row level security;
alter table public.settlements   enable row level security;

-- Solo usuarios logueados; anon no ve nada.
revoke all on public.groups, public.group_members, public.expenses, public.settlements from anon;

-- groups: los integrantes lo ven y pueden renombrarlo. Se crean con create_group().
drop policy if exists groups_select on public.groups;
create policy groups_select on public.groups for select to authenticated
  using (public.is_group_member(id));

drop policy if exists groups_update on public.groups;
create policy groups_update on public.groups for update to authenticated
  using (public.is_group_member(id)) with check (public.is_group_member(id));

revoke insert, update, delete on public.groups from authenticated;
grant update (name) on public.groups to authenticated;

-- group_members: los integrantes ven a los demás, pueden cambiar nombres y
-- agregar integrantes pendientes. Unirse se hace con join_group().
drop policy if exists members_select on public.group_members;
create policy members_select on public.group_members for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists members_update on public.group_members;
create policy members_update on public.group_members for update to authenticated
  using (public.is_group_member(group_id)) with check (public.is_group_member(group_id));

drop policy if exists members_insert on public.group_members;
create policy members_insert on public.group_members for insert to authenticated
  with check (user_id is null and public.is_group_member(group_id));

revoke insert, update, delete on public.group_members from authenticated;
grant insert (group_id, name) on public.group_members to authenticated;
grant update (name) on public.group_members to authenticated;

-- expenses: los personales solo los ve su dueño; los compartidos, todo el grupo.
drop policy if exists expenses_select on public.expenses;
create policy expenses_select on public.expenses for select to authenticated
  using (user_id = auth.uid() or (group_id is not null and public.is_group_member(group_id)));

drop policy if exists expenses_insert on public.expenses;
create policy expenses_insert on public.expenses for insert to authenticated
  with check (user_id = auth.uid() and (group_id is null or public.is_group_member(group_id)));

drop policy if exists expenses_update on public.expenses;
create policy expenses_update on public.expenses for update to authenticated
  using (user_id = auth.uid() or (group_id is not null and public.is_group_member(group_id)))
  with check (
    (group_id is null and user_id = auth.uid())
    or (group_id is not null and public.is_group_member(group_id))
  );

drop policy if exists expenses_delete on public.expenses;
create policy expenses_delete on public.expenses for delete to authenticated
  using (user_id = auth.uid() or (group_id is not null and public.is_group_member(group_id)));

revoke update on public.expenses from authenticated;
grant update (group_id, date, amount, description, category_id, split_type, paid_by, owed_by)
  on public.expenses to authenticated;

-- settlements: visibles y editables por el grupo.
drop policy if exists settlements_select on public.settlements;
create policy settlements_select on public.settlements for select to authenticated
  using (public.is_group_member(group_id));

drop policy if exists settlements_insert on public.settlements;
create policy settlements_insert on public.settlements for insert to authenticated
  with check (created_by = auth.uid() and public.is_group_member(group_id));

drop policy if exists settlements_delete on public.settlements;
create policy settlements_delete on public.settlements for delete to authenticated
  using (public.is_group_member(group_id));

revoke update on public.settlements from authenticated;
