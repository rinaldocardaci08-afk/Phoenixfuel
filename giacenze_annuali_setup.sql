-- ============================================================
-- PHOENIXFUEL — Giacenze Fine Anno
-- ============================================================
-- Esegui in Supabase → SQL Editor → New query → Incolla → Run
-- ============================================================

-- 1. Tabella giacenze annuali
CREATE TABLE IF NOT EXISTS giacenze_annuali (
  id              uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  anno            integer NOT NULL,
  sede            text NOT NULL,        -- 'deposito_vibo' | 'stazione_oppido' | 'autoconsumo'
  prodotto        text NOT NULL,
  cisterna_id     uuid REFERENCES cisterne(id) ON DELETE SET NULL,
  giacenza_inizio numeric DEFAULT 0,    -- da convalida anno precedente (o 0 se primo anno)
  totale_entrate  numeric DEFAULT 0,
  totale_uscite   numeric DEFAULT 0,
  giacenza_stimata numeric DEFAULT 0,   -- inizio + entrate - uscite
  giacenza_reale  numeric,              -- inserita manualmente dall'utente
  differenza      numeric,              -- reale - stimata
  convalidata     boolean DEFAULT false,
  convalidata_da  text,
  convalidata_il  timestamptz,
  note            text,
  created_at      timestamptz DEFAULT now(),
  updated_at      timestamptz DEFAULT now(),
  UNIQUE(anno, sede, prodotto, cisterna_id)
);

COMMENT ON TABLE giacenze_annuali IS 'Chiusura giacenze fine anno per deposito, stazione e autoconsumo';

-- 2. Indici
CREATE INDEX IF NOT EXISTS idx_giacenze_anno_sede ON giacenze_annuali(anno, sede);
CREATE INDEX IF NOT EXISTS idx_giacenze_convalidata ON giacenze_annuali(convalidata);

-- 3. RLS
ALTER TABLE giacenze_annuali ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'giacenze_annuali'
      AND policyname = 'Authenticated full access giacenze'
  ) THEN
    CREATE POLICY "Authenticated full access giacenze"
      ON giacenze_annuali
      FOR ALL
      TO authenticated
      USING (true)
      WITH CHECK (true);
  END IF;
END $$;

-- ============================================================
-- VERIFICA:
-- SELECT * FROM giacenze_annuali LIMIT 5;
-- ============================================================
