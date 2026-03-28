-- Tabella bacheca avvisi
CREATE TABLE bacheca_avvisi (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tipo text NOT NULL DEFAULT 'comunicazione',
  priorita text NOT NULL DEFAULT 'normale',
  messaggio text NOT NULL,
  mittente_id uuid REFERENCES utenti(id),
  mittente_nome text,
  postazione text,
  letto boolean DEFAULT false,
  data_lettura timestamptz,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE bacheca_avvisi ENABLE ROW LEVEL SECURITY;
CREATE POLICY "bacheca_select" ON bacheca_avvisi FOR SELECT USING (true);
CREATE POLICY "bacheca_insert" ON bacheca_avvisi FOR INSERT WITH CHECK (true);
CREATE POLICY "bacheca_update" ON bacheca_avvisi FOR UPDATE USING (true);
CREATE POLICY "bacheca_delete" ON bacheca_avvisi FOR DELETE USING (true);

CREATE INDEX idx_bacheca_letto ON bacheca_avvisi (letto, created_at DESC);
