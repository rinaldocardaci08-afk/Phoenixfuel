-- ═══════════════════════════════════════════════════════════════════
-- PhoenixFuel — Giacenze mensili stazione
-- Eseguire su Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS giacenze_mensili (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  anno integer NOT NULL,
  mese integer NOT NULL CHECK (mese BETWEEN 1 AND 12),
  prodotto text NOT NULL,
  giacenza_inizio numeric DEFAULT 0,
  eccedenze_viaggio numeric DEFAULT 0,
  cali_viaggio numeric DEFAULT 0,
  scatti_vuoto numeric DEFAULT 0,
  cali_tecnici numeric DEFAULT 0,
  giacenza_rilevata numeric,
  note text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(anno, mese, prodotto)
);

CREATE INDEX IF NOT EXISTS idx_gm_anno ON giacenze_mensili(anno);
CREATE INDEX IF NOT EXISTS idx_gm_prodotto ON giacenze_mensili(prodotto);

ALTER TABLE giacenze_mensili ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='giacenze_mensili' AND policyname='gm_select') THEN
    CREATE POLICY gm_select ON giacenze_mensili FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='giacenze_mensili' AND policyname='gm_insert') THEN
    CREATE POLICY gm_insert ON giacenze_mensili FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='giacenze_mensili' AND policyname='gm_update') THEN
    CREATE POLICY gm_update ON giacenze_mensili FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='giacenze_mensili' AND policyname='gm_delete') THEN
    CREATE POLICY gm_delete ON giacenze_mensili FOR DELETE USING (true);
  END IF;
END $$;
