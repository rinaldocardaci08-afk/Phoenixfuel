CREATE TABLE das_documenti (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  numero_progressivo serial,
  anno integer NOT NULL DEFAULT EXTRACT(YEAR FROM now()),
  ordine_id uuid REFERENCES ordini(id),
  carico_id uuid,
  data date NOT NULL DEFAULT CURRENT_DATE,
  -- Mittente (fisso Phoenix Fuel)
  mittente_codice text DEFAULT 'IT00VVY00165B',
  mittente_ragsoc text DEFAULT 'PHOENIX FUEL S.R.L.',
  mittente_indirizzo text DEFAULT 'Porto Salvo Zona Industriale SNC',
  mittente_citta text DEFAULT '89900 Vibo Valentia',
  mittente_piva text DEFAULT 'IT02744150802',
  -- Destinatario
  dest_piva text,
  dest_ragsoc text,
  dest_indirizzo text,
  dest_citta text,
  -- Trasporto
  mezzo_targa text,
  autista text,
  -- Prodotto
  prodotto text,
  codice_prodotto text,
  descrizione_adr text,
  litri_ambiente numeric(10,0),
  litri_15 numeric(10,0),
  peso_netto_kg numeric(10,0),
  densita_ambiente numeric(8,2) DEFAULT 826.20,
  densita_15 numeric(8,2) DEFAULT 828.90,
  -- Stato
  note text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE das_documenti ENABLE ROW LEVEL SECURITY;
CREATE POLICY "das_select" ON das_documenti FOR SELECT USING (true);
CREATE POLICY "das_insert" ON das_documenti FOR INSERT WITH CHECK (true);
CREATE POLICY "das_update" ON das_documenti FOR UPDATE USING (true);
CREATE POLICY "das_delete" ON das_documenti FOR DELETE USING (true);

CREATE INDEX idx_das_ordine ON das_documenti (ordine_id);
CREATE INDEX idx_das_data ON das_documenti (data DESC);
