-- ═══════════════════════════════════════════════════════════════════
-- PhoenixFuel — Setup A: Storage allegati scontrini + DAS
-- Eseguire su Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- 1. TABELLA ALLEGATI
-- Traccia tutti i file caricati (scontrini, DAS ricevuti, documenti ordine)
CREATE TABLE IF NOT EXISTS allegati (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL CHECK (tipo IN ('scontrino','das_ricevuto','documento_ordine','altro')),
  riferimento_id text,                -- chiave del record collegato (data per cassa, uuid per ordine)
  riferimento_tabella text,           -- 'stazione_cassa', 'ordini', 'carichi'
  data date NOT NULL,
  nome_file text NOT NULL,
  path_storage text NOT NULL,         -- percorso nel bucket es. scontrini/2026/03/xxx.jpg
  bucket text NOT NULL DEFAULT 'allegati',
  dimensione_bytes integer,
  mime_type text,
  note text,
  fornitore text,                     -- solo per das_ricevuto
  numero_das text,                    -- solo per das_ricevuto: numero documento fornitore
  litri_das numeric,                  -- solo per das_ricevuto: litri dichiarati
  prodotto text,                      -- solo per das_ricevuto
  caricato_da text,                   -- nome utente che ha caricato
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_allegati_tipo ON allegati(tipo);
CREATE INDEX IF NOT EXISTS idx_allegati_data ON allegati(data DESC);
CREATE INDEX IF NOT EXISTS idx_allegati_rif ON allegati(riferimento_tabella, riferimento_id);
CREATE INDEX IF NOT EXISTS idx_allegati_fornitore ON allegati(fornitore) WHERE fornitore IS NOT NULL;

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

-- 3. STORAGE BUCKET
-- ⚠️ IMPORTANTE: Creare il bucket dalla Dashboard Supabase:
--   → Storage → New Bucket → Nome: "allegati" → Public: ON
--
-- Poi aggiungere queste policies di storage:
--
-- Policy SELECT (download): allow all authenticated
--   Target roles: authenticated
--   SELECT using: true
--
-- Policy INSERT (upload): allow all authenticated
--   Target roles: authenticated
--   INSERT with check: true
--
-- Policy DELETE (cancella): allow all authenticated
--   Target roles: authenticated
--   DELETE using: true
--
-- Oppure eseguire da SQL (se supportato dalla versione):
-- INSERT INTO storage.buckets (id, name, public) VALUES ('allegati', 'allegati', true)
-- ON CONFLICT (id) DO NOTHING;
--
-- CREATE POLICY "allegati_storage_select" ON storage.objects FOR SELECT
--   USING (bucket_id = 'allegati');
-- CREATE POLICY "allegati_storage_insert" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'allegati');
-- CREATE POLICY "allegati_storage_delete" ON storage.objects FOR DELETE
--   USING (bucket_id = 'allegati');

-- 4. VERIFICA
-- SELECT * FROM allegati LIMIT 0;  -- verifica struttura
