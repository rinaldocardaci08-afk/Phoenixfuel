-- PhoenixFuel — Tabella giacenze annuali (chiusura fine anno)

CREATE TABLE IF NOT EXISTS giacenze_annuali (
  id bigint generated always as identity primary key,
  anno int NOT NULL,
  sede text NOT NULL,
  prodotto text NOT NULL,
  giacenza_inizio numeric(12,2) DEFAULT 0,
  totale_entrate numeric(12,2) DEFAULT 0,
  totale_uscite numeric(12,2) DEFAULT 0,
  giacenza_stimata numeric(12,2) DEFAULT 0,
  giacenza_reale numeric(12,2),
  differenza numeric(12,2),
  convalidata boolean DEFAULT false,
  convalidata_da text,
  convalidata_il timestamptz,
  note text,
  updated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(anno, sede, prodotto)
);

CREATE INDEX IF NOT EXISTS idx_giacann_anno ON giacenze_annuali(anno, sede);

ALTER TABLE giacenze_annuali ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS giacann_select ON giacenze_annuali;
DROP POLICY IF EXISTS giacann_insert ON giacenze_annuali;
DROP POLICY IF EXISTS giacann_update ON giacenze_annuali;
DROP POLICY IF EXISTS giacann_delete ON giacenze_annuali;
CREATE POLICY giacann_select ON giacenze_annuali FOR SELECT USING (true);
CREATE POLICY giacann_insert ON giacenze_annuali FOR INSERT WITH CHECK (true);
CREATE POLICY giacann_update ON giacenze_annuali FOR UPDATE USING (true);
CREATE POLICY giacann_delete ON giacenze_annuali FOR DELETE USING (get_ruolo()='admin');

-- Inserisci chiusura 2025 stazione (giacenza reale convalidata)
INSERT INTO giacenze_annuali (anno, sede, prodotto, giacenza_reale, convalidata, convalidata_da, convalidata_il, note)
VALUES 
  (2025, 'stazione_oppido', 'Gasolio Autotrazione', 12383, true, 'Import registro', now(), 'Chiusura registro 31/12/2025'),
  (2025, 'stazione_oppido', 'Benzina', 9436, true, 'Import registro', now(), 'Chiusura registro 31/12/2025')
ON CONFLICT (anno, sede, prodotto) DO UPDATE SET 
  giacenza_reale = EXCLUDED.giacenza_reale,
  convalidata = true,
  convalidata_da = 'Import registro',
  convalidata_il = now(),
  note = EXCLUDED.note;
