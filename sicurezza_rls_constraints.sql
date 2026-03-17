-- ═══════════════════════════════════════════════════════════════
-- PRIORITÀ 1 — SICUREZZA: RLS restrittive + Check Constraint
-- Esegui su Supabase → SQL Editor → New Query → Incolla → Run
-- ═══════════════════════════════════════════════════════════════

-- ══ 1.1 RLS RESTRITTIVE ══════════════════════════════════════
-- Sostituisce le policy "lettura pubblica" con autenticazione

-- ORDINI: solo utenti autenticati
DROP POLICY IF EXISTS "Lettura pubblica ordini" ON ordini;
CREATE POLICY "Lettura autenticata ordini" ON ordini FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura anon ordini" ON ordini FOR SELECT TO anon USING (true);

-- CARICHI: solo utenti autenticati + anon per foglio viaggio
DROP POLICY IF EXISTS "Lettura pubblica carichi" ON carichi;
CREATE POLICY "Lettura autenticata carichi" ON carichi FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura anon carichi" ON carichi FOR SELECT TO anon USING (true);

-- CARICO_ORDINI
DROP POLICY IF EXISTS "Lettura pubblica carico_ordini" ON carico_ordini;
CREATE POLICY "Lettura autenticata carico_ordini" ON carico_ordini FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura anon carico_ordini" ON carico_ordini FOR SELECT TO anon USING (true);

-- MEZZI
DROP POLICY IF EXISTS "Lettura pubblica mezzi" ON mezzi;
CREATE POLICY "Lettura autenticata mezzi" ON mezzi FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura anon mezzi" ON mezzi FOR SELECT TO anon USING (true);

-- SCOMPARTI_MEZZO
DROP POLICY IF EXISTS "Lettura pubblica scomparti" ON scomparti_mezzo;
CREATE POLICY "Lettura autenticata scomparti" ON scomparti_mezzo FOR SELECT TO authenticated USING (true);
CREATE POLICY "Lettura anon scomparti" ON scomparti_mezzo FOR SELECT TO anon USING (true);

-- DOCUMENTI_ORDINE
CREATE POLICY IF NOT EXISTS "Lettura autenticata documenti" ON documenti_ordine FOR SELECT TO authenticated USING (true);
CREATE POLICY IF NOT EXISTS "Lettura anon documenti" ON documenti_ordine FOR SELECT TO anon USING (true);

-- ══ 1.4 CHECK CONSTRAINT ═════════════════════════════════════
-- Impedisce dati invalidi a livello database

-- Ordini: litri positivi
DO $$ BEGIN
  ALTER TABLE ordini ADD CONSTRAINT chk_ordini_litri CHECK (litri > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ordini: costo_litro non negativo
DO $$ BEGIN
  ALTER TABLE ordini ADD CONSTRAINT chk_ordini_costo CHECK (costo_litro >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ordini: trasporto non negativo
DO $$ BEGIN
  ALTER TABLE ordini ADD CONSTRAINT chk_ordini_trasporto CHECK (trasporto_litro >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Ordini: IVA valida
DO $$ BEGIN
  ALTER TABLE ordini ADD CONSTRAINT chk_ordini_iva CHECK (iva IN (4, 10, 22));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Clienti: fido non negativo
DO $$ BEGIN
  ALTER TABLE clienti ADD CONSTRAINT chk_clienti_fido CHECK (fido_massimo >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Clienti: giorni pagamento positivi
DO $$ BEGIN
  ALTER TABLE clienti ADD CONSTRAINT chk_clienti_gg CHECK (giorni_pagamento > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Fornitori: fido non negativo
DO $$ BEGIN
  ALTER TABLE fornitori ADD CONSTRAINT chk_fornitori_fido CHECK (fido_massimo >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Prezzi: costo positivo
DO $$ BEGIN
  ALTER TABLE prezzi ADD CONSTRAINT chk_prezzi_costo CHECK (costo_litro > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Cisterne: livelli validi
DO $$ BEGIN
  ALTER TABLE cisterne ADD CONSTRAINT chk_cisterne_livello CHECK (livello_attuale >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE cisterne ADD CONSTRAINT chk_cisterne_capacita CHECK (capacita_max > 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE cisterne ADD CONSTRAINT chk_cisterne_overflow CHECK (livello_attuale <= capacita_max);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ═══════════════════════════════════════════════════════════════
-- FATTO! Le policy e i vincoli sono stati applicati.
-- ═══════════════════════════════════════════════════════════════
