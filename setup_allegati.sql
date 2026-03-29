-- ═══════════════════════════════════════════════════════════════════
-- PhoenixFuel — Setup A: Storage allegati scontrini
-- Eseguire su Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. TABELLA ALLEGATI (scontrini e altri documenti generici)
--    I DAS fornitore vanno nella tabella documenti_ordine già esistente
CREATE TABLE IF NOT EXISTS allegati (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('scontrino','altro')),
  riferimento_id text,                -- chiave del record collegato (es. data per cassa)
  riferimento_tabella text,           -- 'stazione_cassa'
  data date NOT NULL,
  nome_file text NOT NULL,
  path_storage text NOT NULL,         -- percorso nel bucket es. scontrini/2026/03/xxx.jpg
  bucket text NOT NULL DEFAULT 'allegati',
  dimensione_bytes integer,
  mime_type text,
  note text,
  caricato_da text,                   -- nome utente che ha caricato
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allegati_tipo ON allegati(tipo);
CREATE INDEX IF NOT EXISTS idx_allegati_data ON allegati(data DESC);
CREATE INDEX IF NOT EXISTS idx_allegati_rif ON allegati(riferimento_tabella, riferimento_id);

-- 2. RLS POLICIES
ALTER TABLE allegati ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allegati' AND policyname = 'allegati_select') THEN
    CREATE POLICY allegati_select ON allegati FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allegati' AND policyname = 'allegati_insert') THEN
    CREATE POLICY allegati_insert ON allegati FOR INSERT WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allegati' AND policyname = 'allegati_update') THEN
    CREATE POLICY allegati_update ON allegati FOR UPDATE USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'allegati' AND policyname = 'allegati_delete') THEN
    CREATE POLICY allegati_delete ON allegati FOR DELETE USING (true);
  END IF;
END $$;

-- 3. STORAGE BUCKETS
-- ⚠️ IMPORTANTE: Creare il bucket dalla Dashboard Supabase:
--
-- BUCKET "allegati" (per scontrini):
--   → Storage → New Bucket → Nome: "allegati" → Public: ON
--   → Policies: SELECT/INSERT/DELETE per authenticated
--
-- BUCKET "Das" (per DAS ordini — probabilmente esiste già):
--   → Verificare che accetti anche immagini, non solo PDF
--   → Se non esiste, crearlo con le stesse policies
--
-- Per creare policies da SQL (alternativa):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('allegati', 'allegati', true)
-- ON CONFLICT (id) DO NOTHING;
-- CREATE POLICY "allegati_storage_all" ON storage.objects
--   FOR ALL USING (bucket_id = 'allegati') WITH CHECK (bucket_id = 'allegati');

-- 4. VERIFICA
-- SELECT * FROM allegati LIMIT 0;
-- SELECT * FROM documenti_ordine LIMIT 5;  -- DAS vanno qui
