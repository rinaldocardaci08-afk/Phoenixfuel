-- ═══════════════════════════════════════════════════════════════
-- FIX UTENTI — Policy INSERT + recupero utenti mancanti
-- Esegui su: Supabase → SQL Editor → New Query → Incolla → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Assicura che RLS sia abilitato
ALTER TABLE utenti ENABLE ROW LEVEL SECURITY;

-- 2. Policy lettura per utenti autenticati
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'utenti' AND policyname = 'Lettura autenticata utenti') THEN
    CREATE POLICY "Lettura autenticata utenti" ON utenti FOR SELECT TO authenticated USING (true);
  END IF;
END $$;

-- 3. Policy INSERT per utenti autenticati (necessaria per creare nuovi utenti)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'utenti' AND policyname = 'Inserimento autenticato utenti') THEN
    CREATE POLICY "Inserimento autenticato utenti" ON utenti FOR INSERT TO authenticated WITH CHECK (true);
  END IF;
END $$;

-- 4. Policy UPDATE per utenti autenticati
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'utenti' AND policyname = 'Modifica autenticata utenti') THEN
    CREATE POLICY "Modifica autenticata utenti" ON utenti FOR UPDATE TO authenticated USING (true);
  END IF;
END $$;

-- 5. Policy DELETE per utenti autenticati
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'utenti' AND policyname = 'Eliminazione autenticata utenti') THEN
    CREATE POLICY "Eliminazione autenticata utenti" ON utenti FOR DELETE TO authenticated USING (true);
  END IF;
END $$;

-- 6. Policy per permessi (se non esiste)
ALTER TABLE permessi ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'permessi' AND policyname = 'Gestione permessi autenticati') THEN
    CREATE POLICY "Gestione permessi autenticati" ON permessi FOR ALL TO authenticated USING (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- 7. DIAGNOSTICA — Mostra utenti Auth che NON hanno record in utenti
-- Questo ti fa vedere chi manca
-- ═══════════════════════════════════════════════════════════════

SELECT 
  au.email,
  au.created_at AS creato_il,
  CASE WHEN u.id IS NULL THEN '❌ MANCA in tabella utenti' ELSE '✅ OK' END AS stato
FROM auth.users au
LEFT JOIN utenti u ON LOWER(u.email) = LOWER(au.email)
ORDER BY au.created_at DESC;

-- ═══════════════════════════════════════════════════════════════
-- FATTO! Ora controlla la lista sopra.
-- Per ogni utente con ❌, devi inserirlo manualmente:
--
-- INSERT INTO utenti (email, nome, ruolo, attivo) 
-- VALUES ('email@esempio.it', 'Nome Cognome', 'operatore', true);
--
-- Ruoli disponibili: admin, operatore, contabilita, logistica, cliente
-- ═══════════════════════════════════════════════════════════════
