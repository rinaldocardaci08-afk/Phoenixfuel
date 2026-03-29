-- PhoenixFuel — Tabella Futures ICE
CREATE TABLE IF NOT EXISTS futures_prezzi (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  data date NOT NULL,
  prodotto text NOT NULL DEFAULT 'Gasolio Autotrazione',
  scadenza text NOT NULL,
  prezzo numeric(10,4) NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(data, prodotto, scadenza)
);

CREATE INDEX IF NOT EXISTS idx_futures_data ON futures_prezzi(data DESC, prodotto);

ALTER TABLE futures_prezzi ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS futures_select ON futures_prezzi;
DROP POLICY IF EXISTS futures_insert ON futures_prezzi;
DROP POLICY IF EXISTS futures_update ON futures_prezzi;
DROP POLICY IF EXISTS futures_delete ON futures_prezzi;
CREATE POLICY futures_select ON futures_prezzi FOR SELECT USING (get_ruolo()='admin' OR ha_permesso('benchmark') OR ha_permesso('prezzi'));
CREATE POLICY futures_insert ON futures_prezzi FOR INSERT WITH CHECK (get_ruolo()='admin' OR ha_permesso('benchmark') OR ha_permesso('prezzi'));
CREATE POLICY futures_update ON futures_prezzi FOR UPDATE USING (get_ruolo()='admin' OR ha_permesso('benchmark'));
CREATE POLICY futures_delete ON futures_prezzi FOR DELETE USING (get_ruolo()='admin');
