-- ═══════════════════════════════════════════════════════════════════
-- PhoenixFuel — Aggiunge colonne conteggio banconote a stazione_cassa
-- Eseguire su Supabase SQL Editor
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE stazione_cassa ADD COLUMN IF NOT EXISTS banconote_100 integer DEFAULT 0;
ALTER TABLE stazione_cassa ADD COLUMN IF NOT EXISTS banconote_50 integer DEFAULT 0;
ALTER TABLE stazione_cassa ADD COLUMN IF NOT EXISTS banconote_20 integer DEFAULT 0;
ALTER TABLE stazione_cassa ADD COLUMN IF NOT EXISTS banconote_10 integer DEFAULT 0;
ALTER TABLE stazione_cassa ADD COLUMN IF NOT EXISTS banconote_5 integer DEFAULT 0;
ALTER TABLE stazione_cassa ADD COLUMN IF NOT EXISTS banconote_2 integer DEFAULT 0;
ALTER TABLE stazione_cassa ADD COLUMN IF NOT EXISTS banconote_1 integer DEFAULT 0;
ALTER TABLE stazione_cassa ADD COLUMN IF NOT EXISTS monete_varie numeric DEFAULT 0;

-- Verifica
-- SELECT banconote_100, banconote_50, banconote_20, banconote_10, banconote_5, banconote_2, banconote_1, monete_varie FROM stazione_cassa LIMIT 1;
