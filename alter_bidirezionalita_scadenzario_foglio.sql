-- ╔══════════════════════════════════════════════════════════════════╗
-- ║  ALTER: bidirezionalità scadenzario ↔ foglio giornale (24/05/2026) ║
-- ║                                                                  ║
-- ║  • pagamenti_fornitori.movimento_foglio_id FK → foglio_giornale_movimenti
-- ║  • foglio_giornale_riconciliazioni.fattura_ricevuta_id FK → fatture_ricevute
-- ║                                                                  ║
-- ║  Step 1: il modale pagamento crea automaticamente un movimento   ║
-- ║          di uscita nel foglio del giorno (additive, non rompe    ║
-- ║          niente del Modo A esistente del foglio).                ║
-- ║                                                                  ║
-- ║  Step 2 (prossimo turno): refactor Modo A foglio per cercare in  ║
-- ║          fatture_ricevute + nuovo bottone Cerca ordine da pagare.║
-- ╚══════════════════════════════════════════════════════════════════╝


-- ═══════════════════════════════════════════════════════════════════
-- 1. pagamenti_fornitori.movimento_foglio_id
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE pagamenti_fornitori
  ADD COLUMN IF NOT EXISTS movimento_foglio_id UUID
    REFERENCES foglio_giornale_movimenti(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pagamenti_forn_movimento_foglio
  ON pagamenti_fornitori (movimento_foglio_id);

COMMENT ON COLUMN pagamenti_fornitori.movimento_foglio_id IS
  'Movimento generato automaticamente in foglio_giornale_movimenti. Bidirezionalità scadenzario ↔ foglio: il pagamento appare anche come uscita nel foglio del giorno.';


-- ═══════════════════════════════════════════════════════════════════
-- 2. foglio_giornale_riconciliazioni.fattura_ricevuta_id
-- ═══════════════════════════════════════════════════════════════════
ALTER TABLE foglio_giornale_riconciliazioni
  ADD COLUMN IF NOT EXISTS fattura_ricevuta_id UUID
    REFERENCES fatture_ricevute(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_foglio_ric_fattura_ricevuta
  ON foglio_giornale_riconciliazioni (fattura_ricevuta_id);

COMMENT ON COLUMN foglio_giornale_riconciliazioni.fattura_ricevuta_id IS
  'Riferimento alla fattura ricevuta pagata. Predisposto per Step 2: refactor Modo A foglio per usare fatture_ricevute al posto degli ordini singoli.';


-- ═══════════════════════════════════════════════════════════════════
-- Verifiche
-- ═══════════════════════════════════════════════════════════════════
SELECT 'Alter bidirezionalità OK ✓' AS risultato;

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'pagamenti_fornitori' AND column_name = 'movimento_foglio_id';

SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'foglio_giornale_riconciliazioni' AND column_name = 'fattura_ricevuta_id';
