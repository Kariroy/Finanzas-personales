-- Libro de Gastos — parte 12: comentario en las deudas y pagos atados a una deuda
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede volver a correr.

-- Comentario libre (lo ven los dos, igual que la descripción).
alter table public.debts add column if not exists note text check (length(note) <= 500);
-- Un pago ("Liquidar" en una deuda puntual) puede decir qué deuda salda.
alter table public.debts add column if not exists settles_id uuid references public.debts(id) on delete set null;
-- La parte 5 solo deja editar ciertas columnas de debts: sumar las nuevas.
grant update (note, settles_id) on public.debts to authenticated;
