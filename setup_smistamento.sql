-- PhoenixFuel — Smistamento diretto ordini

-- Aggiungi colonne per tracciabilità smistamento
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS smistamento boolean DEFAULT false;
ALTER TABLE ordini ADD COLUMN IF NOT EXISTS ordine_fornitore_id uuid REFERENCES ordini(id);

CREATE INDEX IF NOT EXISTS idx_ordini_smistamento ON ordini(ordine_fornitore_id) WHERE smistamento = true;
