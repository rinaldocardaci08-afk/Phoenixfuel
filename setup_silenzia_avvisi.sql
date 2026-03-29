-- PhoenixFuel — Silenziamento avvisi ripetuti

-- 1. Aggiungi chiave dedup agli avvisi
ALTER TABLE bacheca_avvisi ADD COLUMN IF NOT EXISTS chiave_dedup text;
CREATE INDEX IF NOT EXISTS idx_bacheca_dedup ON bacheca_avvisi(chiave_dedup);

-- 2. Tabella avvisi silenziati
CREATE TABLE IF NOT EXISTS avvisi_silenziati (
  id bigint generated always as identity primary key,
  chiave text NOT NULL UNIQUE,
  messaggio_esempio text,
  silenziato_da text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE avvisi_silenziati ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS silenz_select ON avvisi_silenziati;
DROP POLICY IF EXISTS silenz_insert ON avvisi_silenziati;
DROP POLICY IF EXISTS silenz_delete ON avvisi_silenziati;
CREATE POLICY silenz_select ON avvisi_silenziati FOR SELECT USING (true);
CREATE POLICY silenz_insert ON avvisi_silenziati FOR INSERT WITH CHECK (true);
CREATE POLICY silenz_delete ON avvisi_silenziati FOR DELETE USING (true);

-- 3. Popola chiave_dedup per avvisi esistenti (normalizza il messaggio)
UPDATE bacheca_avvisi 
SET chiave_dedup = md5(LOWER(TRIM(
  regexp_replace(
    regexp_replace(messaggio, '[0-9]{2}/[0-9]{2}/[0-9]{4}', '', 'g'),
    '€\s*[\d\.,]+', '', 'g'
  )
)))
WHERE chiave_dedup IS NULL;
