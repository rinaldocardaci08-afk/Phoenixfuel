-- PhoenixFuel — Giacenze giornaliere deposito Vibo (v2)

CREATE TABLE IF NOT EXISTS giacenze_giornaliere (
  id bigint generated always as identity primary key,
  data date NOT NULL,
  prodotto text NOT NULL,
  sede text NOT NULL DEFAULT 'deposito_vibo',
  giacenza_inizio numeric(12,2) DEFAULT 0,
  entrate numeric(12,2) DEFAULT 0,
  uscite numeric(12,2) DEFAULT 0,
  cali_eccedenze numeric(12,2) DEFAULT 0,
  giacenza_teorica numeric(12,2) DEFAULT 0,
  giacenza_rilevata numeric(12,2),
  differenza numeric(12,2),
  note text,
  rilevata_da text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(data, prodotto, sede)
);

CREATE INDEX IF NOT EXISTS idx_giacgg_data ON giacenze_giornaliere(data DESC, sede, prodotto);

ALTER TABLE giacenze_giornaliere ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS giacgg_select ON giacenze_giornaliere;
DROP POLICY IF EXISTS giacgg_insert ON giacenze_giornaliere;
DROP POLICY IF EXISTS giacgg_update ON giacenze_giornaliere;
DROP POLICY IF EXISTS giacgg_delete ON giacenze_giornaliere;
CREATE POLICY giacgg_select ON giacenze_giornaliere FOR SELECT USING (true);
CREATE POLICY giacgg_insert ON giacenze_giornaliere FOR INSERT WITH CHECK (true);
CREATE POLICY giacgg_update ON giacenze_giornaliere FOR UPDATE USING (true);
CREATE POLICY giacgg_delete ON giacenze_giornaliere FOR DELETE USING (get_ruolo()='admin');
