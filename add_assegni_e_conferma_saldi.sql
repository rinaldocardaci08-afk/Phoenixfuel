-- ═════════════════════════════════════════════════════════════════════════════
-- ADD ASSEGNI NON IN VALUTA + CONFERMA GIORNATA + OVERRIDE TRACKING (30/04/2026)
-- Phoenix Fuel — modulo Banche & Mutui · Situazione saldi
-- ═════════════════════════════════════════════════════════════════════════════
-- Aggiunge alla tabella esistente banche_saldi_giornalieri:
--   - assegni_non_valuta: importo degli assegni emessi ma non ancora in valuta
--     (decurtano il saldo disponibile teorico)
--   - confermato: flag "giornata archiviata"; finché false, i dati sono bozza
--     (persistente in DB ma non ancora "chiusa"). True dopo click "Conferma giornata".
--   - confermato_at: timestamp di conferma per audit
--   - saldo_disponibile_override: true se il valore inserito a mano differisce
--     dal calcolato (saldo_contabile + fido_cassa - assegni_non_valuta) di > 1€.
--     Tracciato per evidenziare in UI le righe override + audit.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE banche_saldi_giornalieri
  ADD COLUMN IF NOT EXISTS assegni_non_valuta NUMERIC(14,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confermato BOOLEAN DEFAULT false,
  ADD COLUMN IF NOT EXISTS confermato_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS saldo_disponibile_override BOOLEAN DEFAULT false;

-- Mantengo RLS disabilitata come da regola costituzionale Phoenix Fuel
ALTER TABLE banche_saldi_giornalieri DISABLE ROW LEVEL SECURITY;

-- Verifica colonne aggiunte
SELECT column_name, data_type, column_default
FROM information_schema.columns
WHERE table_name = 'banche_saldi_giornalieri'
ORDER BY ordinal_position;
