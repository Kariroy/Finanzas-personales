-- Libro de Gastos — parte 2 de 3: funciones
-- Supabase → SQL Editor → New query → pegar TODO este archivo → Run.
-- Correr las partes en orden (1, 2, 3). Se pueden volver a correr sin romper nada.

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
  if coalesce(length(trim(other_name)), 0) > 0 then
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
      set user_id = auth.uid(),
          name = case when coalesce(length(trim(my_name)), 0) > 0 then trim(my_name) else name end
      where id = mid;
  else
    insert into public.group_members (group_id, user_id, name)
      values (gid, auth.uid(),
              case when coalesce(length(trim(my_name)), 0) > 0 then trim(my_name) else 'Integrante' end);
  end if;
  return gid;
end;
$$;

revoke all on function public.create_group(text, text, text) from public, anon;
revoke all on function public.join_group(text, text) from public, anon;
grant execute on function public.create_group(text, text, text) to authenticated;
grant execute on function public.join_group(text, text) to authenticated;
