-- ═══════════════════════════════════════════════════════════════════════════
-- Soft-delete prelievi autoconsumo + apertura RLS — 23/04/2026
-- ═══════════════════════════════════════════════════════════════════════════
-- PROBLEMA: eliminaPrelievo faceva HARD DELETE. Se la RLS bocca la DELETE
-- (caso Erika/Simone senza permesso 'autoconsumo'), error=null silenziosamente,
-- il codice prosegue e fa +litri cisterna. L'utente riclicca → doppio rientro.
--
-- FIX:
--  1. Aggiunta 4 colonne per soft-delete (eliminato, eliminato_il, eliminato_da,
--     motivo_eliminazione). Backfill su record legacy a FALSE.
--  2. RLS aperta a tutti i ruoli operativi (tutti tranne cliente esterno).
--     SELECT: non-cliente → così storico visibile a tutti gli operatori.
--     WRITE (incluso DELETE simulato via UPDATE): non-cliente.
--  3. Le guardie in pf-deposito.js (eq('eliminato', false) sulla UPDATE +
--     verifica .select() non vuoto) impediscono doppi rientri anche se in futuro
--     la RLS dovesse cambiare.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Aggiunta colonne soft-delete ──
ALTER TABLE prelievi_autoconsumo
  ADD COLUMN IF NOT EXISTS eliminato BOOLEAN DEFAULT FALSE;
ALTER TABLE prelievi_autoconsumo
  ADD COLUMN IF NOT EXISTS eliminato_il TIMESTAMPTZ;
ALTER TABLE prelievi_autoconsumo
  ADD COLUMN IF NOT EXISTS eliminato_da TEXT;
ALTER TABLE prelievi_autoconsumo
  ADD COLUMN IF NOT EXISTS motivo_eliminazione TEXT;

-- Backfill: record storici senza flag → eliminato=false (necessario perché
-- PostgREST con .neq('eliminato', true) non include righe con valore NULL).
UPDATE prelievi_autoconsumo SET eliminato = FALSE WHERE eliminato IS NULL;

-- Indice per query ricorrenti (storico/riconciliazione filtrano spesso gli attivi)
CREATE INDEX IF NOT EXISTS idx_prelievi_autoconsumo_attivi
  ON prelievi_autoconsumo (data DESC)
  WHERE eliminato = FALSE;

-- ── 2. Verifica policy attuali (pre-fix) ──
SELECT policyname, cmd, qual::text, with_check::text
FROM pg_policies
WHERE tablename = 'prelievi_autoconsumo'
ORDER BY policyname;

-- ── 3. Sostituzione policy: apertura a tutti tranne cliente esterno ──
DROP POLICY IF EXISTS prelac_select ON prelievi_autoconsumo;
DROP POLICY IF EXISTS prelac_write ON prelievi_autoconsumo;

CREATE POLICY prelac_select ON prelievi_autoconsumo FOR SELECT USING (
  get_ruolo() != 'cliente'
);

CREATE POLICY prelac_write ON prelievi_autoconsumo FOR ALL USING (
  get_ruolo() != 'cliente'
) WITH CHECK (
  get_ruolo() != 'cliente'
);

-- ── 4. Verifica policy post-fix (deve mostrare get_ruolo() != 'cliente') ──
SELECT policyname, cmd, qual::text, with_check::text
FROM pg_policies
WHERE tablename = 'prelievi_autoconsumo'
ORDER BY policyname;

-- ── 5. Conteggio record post-backfill (tutti devono avere eliminato NOT NULL) ──
SELECT
  COUNT(*) as totali,
  COUNT(*) FILTER (WHERE eliminato = FALSE) as attivi,
  COUNT(*) FILTER (WHERE eliminato = TRUE) as eliminati,
  COUNT(*) FILTER (WHERE eliminato IS NULL) as null_da_correggere
FROM prelievi_autoconsumo;
