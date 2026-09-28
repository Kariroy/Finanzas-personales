-- Libro de Gastos — parte 3 de 3: seguridad (RLS)
-- Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Correr las partes en orden (1, 2, 3). Se pueden volver a correr sin romper nada.

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
