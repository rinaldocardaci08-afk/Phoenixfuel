-- ═════════════════════════════════════════════════════════════════════════════
-- ADD COSTO_PREZZO_DIVERSO A STAZIONE_LETTURE (30/04/2026)
-- Phoenix Fuel — modulo Stazione · Cambio prezzo
-- ═════════════════════════════════════════════════════════════════════════════
-- Aggiunge alla tabella stazione_letture la colonna:
--   costo_prezzo_diverso: costo NETTO €/L valido per i litri venduti al
--   "cambio prezzo". È un valore "una tantum" digitato dall'utente al momento
--   del cambio prezzo (default = CMP corrente del prodotto). Serve solo per
--   calcolare correttamente la marginalità di quel sotto-blocco di vendite,
--   senza modificare il CMP del prodotto (che continua a muoversi solo con
--   le consegne reali).
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE stazione_letture
  ADD COLUMN IF NOT EXISTS costo_prezzo_diverso NUMERIC(8,4) DEFAULT 0;

ALTER TABLE stazione_letture DISABLE ROW LEVEL SECURITY;

-- Verifica
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'stazione_letture'
  AND column_name IN ('litri_prezzo_diverso', 'prezzo_diverso', 'costo_prezzo_diverso')
ORDER BY ordinal_position;
