-- Libro de Gastos — parte 13: marcar gastos y deudas como "solo registro"
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede volver a correr.
--
-- Un gasto o deuda marcado como solo registro se sigue viendo, pero no suma en
-- los saldos de deudas ni en el Resumen. (La fecha "contar desde" de cada uno se
-- guarda en su cuenta, no hace falta tabla.)

alter table public.expenses add column if not exists ignored boolean not null default false;
alter table public.debts    add column if not exists ignored boolean not null default false;

-- Estas tablas solo dejan editar ciertas columnas: sumar la nueva.
grant update (ignored) on public.expenses to authenticated;
grant update (ignored) on public.debts    to authenticated;
