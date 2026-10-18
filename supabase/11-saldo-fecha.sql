-- Libro de Gastos — parte 11: fecha del saldo inicial de cada cuenta
-- Supabase → SQL Editor → New query → pegar TODO → Run. Se puede volver a correr.
--
-- El saldo inicial de una cuenta es "lo que había a esta fecha y hora". Lo anterior
-- se puede asignar a la cuenta (para los reportes) pero ya no cambia el saldo.
-- Las cuentas que ya existen toman como fecha el momento en que se crearon.

alter table public.fin_accounts add column if not exists balance_at timestamptz;
update public.fin_accounts set balance_at = created_at where balance_at is null;
alter table public.fin_accounts alter column balance_at set default now();
