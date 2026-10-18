-- Libro de Gastos — parte 14: compras con tarjeta que ya venían en cuotas
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede volver a correr.
--
-- Una compra en cuotas puede anotarse "por la mitad": inst_from es la primera cuota
-- que se sigue en la app (ej. 7 de 10) e inst_start el mes en que se paga esa cuota.
-- Las cuotas anteriores ya estaban pagas: no suman como gasto ni como deuda.

alter table public.fin_movements add column if not exists inst_from  int not null default 1 check (inst_from >= 1);
alter table public.fin_movements add column if not exists inst_start date;
