-- ═════════════════════════════════════════════════════════════════════════════
-- NUOVA TABELLA stazione_cambio_prezzo (30/04/2026)
-- Phoenix Fuel — modulo Stazione · Cambio prezzo per prodotto
-- ═════════════════════════════════════════════════════════════════════════════
-- Sostituisce il vecchio approccio "per pompa" (campi litri_prezzo_diverso /
-- prezzo_diverso / costo_prezzo_diverso su stazione_letture) con un evento
-- contabile a livello di PRODOTTO. Una sola riga per (data, prodotto).
--
-- Campi:
--   data:                          giorno del cambio prezzo
--   prodotto:                      'Benzina' | 'Gasolio Autotrazione' | ...
--   prezzo_iva_nuovo:              prezzo IVA inclusa applicato dopo il cambio
--   costo_netto_nuovo:             costo netto associato (=> margine cambio prezzo)
--   litri_al_nuovo_prezzo:         litri totali venduti al nuovo prezzo (somma su tutte
--                                  le pompe del prodotto in quel giorno; tolleranza 5 L
--                                  sui litri erogati totali del prodotto)
--
-- I campi vecchi su stazione_letture NON vengono usati più dalla logica nuova
-- (restano per back-compatibility con storico già salvato).
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS stazione_cambio_prezzo (
  id                     UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  data                   DATE NOT NULL,
  prodotto               TEXT NOT NULL,
  prezzo_iva_nuovo       NUMERIC(8,4) NOT NULL,
  costo_netto_nuovo      NUMERIC(8,4) NOT NULL DEFAULT 0,
  litri_al_nuovo_prezzo  NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at             TIMESTAMPTZ DEFAULT NOW(),
  updated_at             TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uniq_data_prodotto UNIQUE (data, prodotto)
);

CREATE INDEX IF NOT EXISTS idx_stazione_cambio_prezzo_data
  ON stazione_cambio_prezzo (data DESC);

ALTER TABLE stazione_cambio_prezzo DISABLE ROW LEVEL SECURITY;

-- Verifica
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'stazione_cambio_prezzo'
ORDER BY ordinal_position;
