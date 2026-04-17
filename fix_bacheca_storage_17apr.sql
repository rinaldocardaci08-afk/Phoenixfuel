-- ═══════════════════════════════════════════════════════════════════
-- FIX 17 APR 2026 — Bacheca sentinelle + Storage versamenti
-- Da lanciare su Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

-- ─── PARTE 1: DIAGNOSI BACHECA SENTINELLE ─────────────────────────
-- Vediamo lo schema reale e se gli avvisi sentinelle ci sono davvero.

-- 1a) Schema attuale di bacheca_avvisi
SELECT column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_name = 'bacheca_avvisi'
ORDER BY ordinal_position;

-- 1b) Ultimi 10 avvisi di tipo sistema (quelli delle sentinelle notturne)
SELECT id, tipo, priorita,
       COALESCE(mittente_nome, NULL) AS mittente_nome_col,
       -- Prova anche mittente (schema vecchio): se la colonna non esiste, questa riga errora
       LEFT(messaggio, 100) AS msg_short,
       letto, created_at
FROM bacheca_avvisi
WHERE tipo = 'sistema'
ORDER BY created_at DESC
LIMIT 10;

-- 1c) Policy RLS su bacheca_avvisi
SELECT polname, polcmd, pg_get_expr(polqual, polrelid) AS using_clause
FROM pg_policy
WHERE polrelid = 'bacheca_avvisi'::regclass;


-- ─── PARTE 2: FIX SCHEMA BACHECA (se necessario) ──────────────────
-- Se la Edge Function sentinelle-nightly inserisce nella colonna `mittente`
-- invece di `mittente_nome`, aggiungiamo la colonna come alias.
-- Se la colonna esiste già, l'IF NOT EXISTS la salta.

ALTER TABLE bacheca_avvisi ADD COLUMN IF NOT EXISTS mittente text;

-- Copia valori esistenti: ovunque mittente_nome sia popolato e mittente no, allinea
UPDATE bacheca_avvisi
SET mittente = mittente_nome
WHERE mittente IS NULL AND mittente_nome IS NOT NULL;

-- Copia al contrario (per i record inseriti dalle sentinelle che usano solo `mittente`)
UPDATE bacheca_avvisi
SET mittente_nome = mittente
WHERE mittente_nome IS NULL AND mittente IS NOT NULL;


-- ─── PARTE 3: FIX POLICY STORAGE PER VERSAMENTI BANCARI ───────────
-- Il bucket 'allegati' deve permettere upload/read nel path 'versamenti-banca/'

-- 3a) Verifica policy esistenti sul bucket 'allegati'
SELECT id, name, bucket_id,
       (definition::text) AS def,
       operation
FROM storage.policies
WHERE bucket_id = 'allegati'
ORDER BY operation, name;

-- 3b) Crea policy per 'versamenti-banca/' (INSERT: upload ricevuta)
-- Usa DROP + CREATE per essere idempotente
DROP POLICY IF EXISTS "allegati_versamenti_insert" ON storage.objects;
CREATE POLICY "allegati_versamenti_insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'allegati'
  AND (storage.foldername(name))[1] = 'versamenti-banca'
);

-- 3c) Policy SELECT (lettura/download ricevuta)
DROP POLICY IF EXISTS "allegati_versamenti_select" ON storage.objects;
CREATE POLICY "allegati_versamenti_select"
ON storage.objects
FOR SELECT
TO authenticated, anon
USING (
  bucket_id = 'allegati'
  AND (storage.foldername(name))[1] = 'versamenti-banca'
);

-- 3d) Policy DELETE (per rollback quando insert DB fallisce)
DROP POLICY IF EXISTS "allegati_versamenti_delete" ON storage.objects;
CREATE POLICY "allegati_versamenti_delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'allegati'
  AND (storage.foldername(name))[1] = 'versamenti-banca'
);


-- ─── PARTE 4: VERIFICA FINALE ─────────────────────────────────────
-- Rilancia per confermare che tutto sia a posto

SELECT 'Colonne bacheca_avvisi' AS check_,
       STRING_AGG(column_name, ', ' ORDER BY ordinal_position) AS result_
FROM information_schema.columns
WHERE table_name = 'bacheca_avvisi'
UNION ALL
SELECT 'Policy allegati (versamenti-banca)',
       STRING_AGG(name, ', ')
FROM storage.policies
WHERE bucket_id = 'allegati' AND name LIKE 'allegati_versamenti%'
UNION ALL
SELECT 'Avvisi sistema ultimi 7gg',
       COUNT(*)::text
FROM bacheca_avvisi
WHERE tipo = 'sistema' AND created_at >= now() - interval '7 days';
