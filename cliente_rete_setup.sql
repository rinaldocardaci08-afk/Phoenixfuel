-- Aggiunge colonna cliente_rete alla tabella clienti
-- Esegui in Supabase → SQL Editor

ALTER TABLE clienti ADD COLUMN IF NOT EXISTS cliente_rete boolean DEFAULT false;

COMMENT ON COLUMN clienti.cliente_rete IS 'true = Cliente Rete, false = Cliente Consumo';

-- Verifica:
-- SELECT nome, cliente_rete FROM clienti ORDER BY nome LIMIT 10;
