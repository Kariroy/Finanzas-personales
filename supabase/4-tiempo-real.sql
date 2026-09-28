-- Libro de Gastos — parte 4: actualización al instante (Realtime)
-- Supabase → SQL Editor → New query → pegar → Run.
-- Si dice que alguna tabla "is already member of publication", ya estaba activado: está bien.

alter publication supabase_realtime add table public.expenses, public.settlements, public.group_members, public.groups;
