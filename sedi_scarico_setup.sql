-- ============================================================
-- PHOENIXFUEL — Sedi di Scarico Clienti
-- ============================================================
-- Esegui in Supabase → SQL Editor → New query → Incolla → Run
-- ============================================================

-- 1. Tabella sedi di scarico
CREATE TABLE IF NOT EXISTS sedi_scarico (
  id          uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  cliente_id  uuid NOT NULL REFERENCES clienti(id) ON DELETE CASCADE,
  nome        text NOT NULL,            -- Es: "Cantiere Via Roma", "Sede secondaria Cosenza"
  indirizzo   text,
  citta       text,
  provincia   text,
  nota        text,
  predefinita boolean DEFAULT false,    -- Se true = sede di scarico default
  attiva      boolean DEFAULT true,
  created_at  timestamptz DEFAULT now()
);

COMMENT ON TABLE sedi_scarico IS 'Sedi di scarico/consegna per clienti con destinazioni multiple';

-- 2. Indici
CREATE INDEX IF NOT EXISTS idx_sedi_scarico_cliente ON sedi_scarico(cliente_id);
CREATE INDEX IF NOT EXISTS idx_sedi_scarico_attiva ON sedi_scarico(cliente_id, attiva);

-- 3. RLS
ALTER TABLE sedi_scarico ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'sedi_scarico'
      AND policyname = 'Authenticated full access sedi_scarico'
  ) THEN
    CREATE POLICY "Authenticated full access sedi_scarico"
      ON sedi_scarico FOR ALL TO authenticated
      USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 4. Colonna sede_scarico sugli ordini (per tracciare la destinazione scelta)
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS sede_scarico_id uuid REFERENCES sedi_scarico(id) ON DELETE SET NULL;
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS sede_scarico_nome text;

-- ============================================================
-- VERIFICA:
-- SELECT * FROM sedi_scarico LIMIT 5;
-- SELECT sede_scarico_id, sede_scarico_nome FROM ordini LIMIT 5;
-- ============================================================
