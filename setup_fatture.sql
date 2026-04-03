-- ╔══════════════════════════════════════════════════════════════╗
-- ║  SETUP FATTURE - PhoenixFuel                                ║
-- ║  Tabelle: fatture, fattura_righe                            ║
-- ║  + colonne aggiuntive su clienti per FatturaPA              ║
-- ╚══════════════════════════════════════════════════════════════╝

-- ── Colonne aggiuntive su clienti per FatturaPA ───────────────
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS codice_destinatario VARCHAR(7);
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS pec_cliente TEXT;
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS cap VARCHAR(10);
ALTER TABLE clienti ADD COLUMN IF NOT EXISTS codice_fiscale TEXT;

-- ── Tabella fatture ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS fatture (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  numero          INTEGER NOT NULL,
  anno            INTEGER NOT NULL,
  data            DATE NOT NULL,
  cliente_id      UUID REFERENCES clienti(id),
  cliente_nome    TEXT,
  imponibile      NUMERIC(12,2) NOT NULL DEFAULT 0,
  iva             NUMERIC(12,2) NOT NULL DEFAULT 0,
  totale          NUMERIC(12,2) NOT NULL DEFAULT 0,
  stato           TEXT NOT NULL DEFAULT 'bozza',
    -- bozza | emessa | pagata | annullata
  tipo_documento  TEXT NOT NULL DEFAULT 'TD01',
    -- TD01=fattura, TD04=nota credito, TD06=parcella
  giorni_pagamento INTEGER DEFAULT 30,
  data_scadenza   DATE,
  modalita_pagamento TEXT DEFAULT 'MP05', -- MP05=bonifico
  note            TEXT,
  xml_fatturapa   TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON COLUMN fatture.stato IS 'bozza | emessa | pagata | annullata';
COMMENT ON COLUMN fatture.tipo_documento IS 'TD01=fattura ordinaria';

-- Numero univoco per anno
CREATE UNIQUE INDEX IF NOT EXISTS idx_fatture_numero_anno
  ON fatture (numero, anno);

CREATE INDEX IF NOT EXISTS idx_fatture_cliente
  ON fatture (cliente_id);

CREATE INDEX IF NOT EXISTS idx_fatture_data
  ON fatture (data);

CREATE INDEX IF NOT EXISTS idx_fatture_stato
  ON fatture (stato);

-- ── Tabella fattura_righe ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS fattura_righe (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  fattura_id      UUID NOT NULL REFERENCES fatture(id) ON DELETE CASCADE,
  ordine_id       UUID,            -- riferimento all'ordine origine
  numero_riga     INTEGER NOT NULL,
  descrizione     TEXT NOT NULL,
  prodotto        TEXT,
  unita_misura    TEXT DEFAULT 'LT',
  quantita        NUMERIC(12,3) NOT NULL,
  prezzo_unitario NUMERIC(12,5) NOT NULL,
  aliquota_iva    INTEGER NOT NULL DEFAULT 22,
  imponibile      NUMERIC(12,2) NOT NULL,
  iva_importo     NUMERIC(12,2) NOT NULL,
  data_ordine     DATE,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fattura_righe_fattura
  ON fattura_righe (fattura_id);

-- ── Funzione: prossimo numero fattura per anno ────────────────
CREATE OR REPLACE FUNCTION prossimo_numero_fattura(p_anno INTEGER)
RETURNS INTEGER AS $$
DECLARE v_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(numero), 0) + 1
    INTO v_num
    FROM fatture
   WHERE anno = p_anno;
  RETURN v_num;
END;
$$ LANGUAGE plpgsql;

-- ── RLS (se Supabase RLS abilitato) ──────────────────────────
-- ALTER TABLE fatture ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE fattura_righe ENABLE ROW LEVEL SECURITY;
-- Aggiungere policy in base al proprio schema auth

-- ── Verifica ──────────────────────────────────────────────────
SELECT 'Setup fatture completato ✓' AS risultato;
SELECT column_name, data_type FROM information_schema.columns
 WHERE table_name = 'fatture' ORDER BY ordinal_position;

-- ── Tabella configurazione numerazione (offset Danea) ─────────
CREATE TABLE IF NOT EXISTS fatture_config (
  anno            INTEGER PRIMARY KEY,
  numero_iniziale INTEGER NOT NULL CHECK (numero_iniziale >= 1),
  note            TEXT,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE fatture_config IS 'Offset numerazione fatture per anno — es. continuazione da Danea';

-- Inserimento esempio (togli il commento e modifica con il tuo valore):
-- INSERT INTO fatture_config (anno, numero_iniziale, note)
-- VALUES (2025, 188, 'Continuazione da Danea - ultima fattura 187')
-- ON CONFLICT (anno) DO UPDATE SET numero_iniziale = EXCLUDED.numero_iniziale, updated_at = NOW();

SELECT 'Setup fatture_config completato ✓' AS risultato;
