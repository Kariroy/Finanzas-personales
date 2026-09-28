-- Libro de Gastos — parte 6: borrar grupos
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede volver a correr.
--
-- Solo quien creó el grupo puede borrarlo. Al borrarlo se borran también sus
-- integrantes, gastos y pagos (on delete cascade), para todos.
-- Renombrar el grupo ya lo puede hacer cualquier integrante (parte 3).

grant delete on public.groups to authenticated;

drop policy if exists groups_delete on public.groups;
create policy groups_delete on public.groups for delete to authenticated
  using (created_by = auth.uid());
