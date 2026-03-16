-- ═══════════════════════════════════════════════════════════════
-- ESEGUI QUESTO SQL NELL'SQL EDITOR DI SUPABASE
-- Vai su: Supabase → SQL Editor → New Query → Incolla → Run
-- ═══════════════════════════════════════════════════════════════

-- 1. Crea tabella scomparti_mezzo (se non esiste)
CREATE TABLE IF NOT EXISTS scomparti_mezzo (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  mezzo_id UUID REFERENCES mezzi(id) ON DELETE CASCADE,
  nome TEXT NOT NULL,
  capacita NUMERIC DEFAULT 0,
  prodotto_default TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Abilita RLS
ALTER TABLE scomparti_mezzo ENABLE ROW LEVEL SECURITY;

-- 3. Policy lettura pubblica per scomparti_mezzo (necessaria per foglio viaggio)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scomparti_mezzo' AND policyname = 'Lettura pubblica scomparti') THEN
    CREATE POLICY "Lettura pubblica scomparti" ON scomparti_mezzo FOR SELECT USING (true);
  END IF;
END $$;

-- 4. Policy inserimento/modifica/cancellazione per utenti autenticati
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'scomparti_mezzo' AND policyname = 'Gestione scomparti autenticati') THEN
    CREATE POLICY "Gestione scomparti autenticati" ON scomparti_mezzo FOR ALL USING (auth.role() = 'authenticated');
  END IF;
END $$;

-- 5. Assicura che le tabelle carichi, carico_ordini, ordini, mezzi siano leggibili
-- (necessario per il foglio viaggio che apre una nuova pagina)

-- carichi
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'carichi' AND policyname = 'Lettura pubblica carichi') THEN
    CREATE POLICY "Lettura pubblica carichi" ON carichi FOR SELECT USING (true);
  END IF;
END $$;

-- carico_ordini
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'carico_ordini' AND policyname = 'Lettura pubblica carico_ordini') THEN
    CREATE POLICY "Lettura pubblica carico_ordini" ON carico_ordini FOR SELECT USING (true);
  END IF;
END $$;

-- ordini
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'ordini' AND policyname = 'Lettura pubblica ordini') THEN
    CREATE POLICY "Lettura pubblica ordini" ON ordini FOR SELECT USING (true);
  END IF;
END $$;

-- mezzi
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'mezzi' AND policyname = 'Lettura pubblica mezzi') THEN
    CREATE POLICY "Lettura pubblica mezzi" ON mezzi FOR SELECT USING (true);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FATTO! Ora puoi usare il foglio viaggio
-- ═══════════════════════════════════════════════════════════════
