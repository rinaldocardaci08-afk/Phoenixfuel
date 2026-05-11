-- ════════════════════════════════════════════════════════════════════════════
-- PHOENIX FUEL — SETUP "VALUTAZIONI BANCHE"
-- Data: 11/05/2026
-- Modulo: Banche & Mutui → nuova tab "Valutazioni"
-- ════════════════════════════════════════════════════════════════════════════

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ TABELLA 1: HEADER ANNUALE PER BANCA                                      │
-- │ Una riga per ogni coppia (banca, anno).                                  │
-- │ Contiene KPI di sintesi + voci di costo per natura + note testuali.      │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS banche_valutazioni_periodi (
  id                    BIGSERIAL PRIMARY KEY,
  banca_id              UUID NOT NULL REFERENCES banche_istituti(id) ON DELETE CASCADE,
  anno                  INT NOT NULL,
  -- KPI Header
  esposizione_totale    NUMERIC(14,2) DEFAULT 0,   -- mutui residui + anticipi utilizzati medi
  costo_bancario_totale NUMERIC(14,2) DEFAULT 0,   -- somma di tutte le voci (netto IRS)
  -- Sintesi costo per natura
  interessi_mutui       NUMERIC(14,2) DEFAULT 0,
  interessi_anticipi    NUMERIC(14,2) DEFAULT 0,
  cdf_totali            NUMERIC(14,2) DEFAULT 0,
  canoni_bolli_spese    NUMERIC(14,2) DEFAULT 0,
  differenziali_irs     NUMERIC(14,2) DEFAULT 0,   -- segno negativo se a credito (riduce costo)
  altri_costi_netti     NUMERIC(14,2) DEFAULT 0,   -- impagati, recuperi, oneri vari (netto)
  -- Note testuali
  criticita             TEXT,
  benchmark             TEXT,
  raccomandazioni       TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  updated_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(banca_id, anno)
);
ALTER TABLE banche_valutazioni_periodi DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bvp_banca_anno ON banche_valutazioni_periodi(banca_id, anno);

-- ┌─────────────────────────────────────────────────────────────────────────┐
-- │ TABELLA 2: VOCI DETTAGLIO (Tabelle 1-2-3 del layout)                     │
-- │ Una riga per ogni voce. Colonne valorizzate in modo dipendente           │
-- │ dal valore di "tabella".                                                 │
-- └─────────────────────────────────────────────────────────────────────────┘
CREATE TABLE IF NOT EXISTS banche_valutazioni_voci (
  id                    BIGSERIAL PRIMARY KEY,
  banca_id              UUID NOT NULL REFERENCES banche_istituti(id) ON DELETE CASCADE,
  anno                  INT NOT NULL,
  tabella               TEXT NOT NULL CHECK (tabella IN ('linee_breve','mutui_mlt','cdf')),
  ordine                INT DEFAULT 0,
  descrizione           TEXT NOT NULL,
  -- Tabella 1 (linee_breve)
  accordato             NUMERIC(14,2),
  utilizzo_medio        NUMERIC(14,2),
  saturazione_pct       NUMERIC(6,2),
  tan_pct               NUMERIC(7,3),
  all_in_pct            NUMERIC(7,3),
  -- Tabella 2 (mutui_mlt)
  capitale_originario   NUMERIC(14,2),
  residuo               NUMERIC(14,2),
  rimborsato_pct        NUMERIC(6,2),
  scadenza              DATE,
  anni_residui          NUMERIC(5,2),
  -- Tabella 3 (cdf)
  base_calcolo          NUMERIC(14,2),
  cdf_pct_trim          NUMERIC(6,3),
  cdf_pct_annua         NUMERIC(6,3),
  status                TEXT,
  -- Comune
  costo_anno            NUMERIC(14,2) DEFAULT 0,
  note                  TEXT,
  created_at            TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(banca_id, anno, tabella, descrizione)
);
ALTER TABLE banche_valutazioni_voci DISABLE ROW LEVEL SECURITY;
CREATE INDEX IF NOT EXISTS idx_bvv_banca_anno ON banche_valutazioni_voci(banca_id, anno);

-- ════════════════════════════════════════════════════════════════════════════
-- SEED DATI INTESA SP 2025
-- Fonte: 12 estratti conto Intesa SP 2025 + prospetti liquidazione anticipi Q1-Q4
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_banca_id UUID;
BEGIN
  -- Recupero id Intesa SP dall'anagrafica esistente
  SELECT id INTO v_banca_id FROM banche_istituti
   WHERE UPPER(nome) LIKE '%INTESA%' LIMIT 1;
  IF v_banca_id IS NULL THEN
    RAISE NOTICE '⚠ Banca INTESA non trovata in banche_istituti — seed saltato.';
    RETURN;
  END IF;

  -- ── 1) HEADER ANNUALE INTESA SP 2025 ──────────────────────────────────────
  INSERT INTO banche_valutazioni_periodi (
    banca_id, anno, esposizione_totale, costo_bancario_totale,
    interessi_mutui, interessi_anticipi, cdf_totali,
    canoni_bolli_spese, differenziali_irs, altri_costi_netti,
    criticita, benchmark, raccomandazioni
  ) VALUES (
    v_banca_id, 2025,
    1180000.00,
    73706.00,
    35207.43,
    27291.79,
    13359.06,
    995.00,
    -3028.63,
    -119.05,
    -- Criticità
    'TAN anticipi sbf medio annuo 4,00% + CDF 2,00% = all-in 6,00% — sopra mercato (5,0-5,5%). Saturazione anticipi Q3-Q4 vicina al 100% del fido (€700k). Fido c/c €50k mai utilizzato durante l''anno: costo CDF €1.000/anno improduttivo. Differenziale IRS in calo strutturale: Q1 +1.834 → Q4 +120. Probabile inversione a debito nel 2026 con Euribor stabile. 8 assegni clienti impagati nei 12 mesi per €62k lordi (€57k netti dopo storno).',
    -- Benchmark mercato 2026
    'Euribor 3M apr 2026: 3,12% (in calo da 3,28% Q2 2025). Mutui PMI mercato 3,42% (Bollettino ABI feb 2026). Anticipi PMI buon profilo: all-in 5,0-5,5% (TAN 3,5-4,5% + CDF 0,25-0,375% trim). Gap Phoenix Fuel vs mercato: anticipi +50/+100 bps, mutuo 17093326 +80/+120 bps.',
    -- Raccomandazioni quantificate
    'A) Chiudere fido c/c €50k non utilizzato → risparmio €1.000/anno. Tempi: 1 settimana. Difficoltà: bassa.
B) Rinegoziare CDF anticipi da 0,500% a 0,300% trim → risparmio €5.450/anno. Tempi: 60-90 gg. Difficoltà: media.
C) Rinegoziare TAN anticipi da 4,00% a 3,40% → risparmio €4.090/anno. Tempi: 60-90 gg. Difficoltà: media.
D) Valutare estinzione anticipata mutuo 46100504 (scadenza 12/2025 estinto) — DSCR già liberato.
E) Richiedere ristrutturazione IRS prima dell''inversione differenziale (verificare notional residuo e fair value).
TOTALE RISPARMIO STIMATO: €10.540/anno.'
  )
  ON CONFLICT (banca_id, anno) DO UPDATE SET
    esposizione_totale    = EXCLUDED.esposizione_totale,
    costo_bancario_totale = EXCLUDED.costo_bancario_totale,
    interessi_mutui       = EXCLUDED.interessi_mutui,
    interessi_anticipi    = EXCLUDED.interessi_anticipi,
    cdf_totali            = EXCLUDED.cdf_totali,
    canoni_bolli_spese    = EXCLUDED.canoni_bolli_spese,
    differenziali_irs     = EXCLUDED.differenziali_irs,
    altri_costi_netti     = EXCLUDED.altri_costi_netti,
    criticita             = EXCLUDED.criticita,
    benchmark             = EXCLUDED.benchmark,
    raccomandazioni       = EXCLUDED.raccomandazioni,
    updated_at            = NOW();

  -- ── 2) TABELLA 1 — LINEE CREDITO A BREVE ──────────────────────────────────
  INSERT INTO banche_valutazioni_voci (
    banca_id, anno, tabella, ordine, descrizione,
    accordato, utilizzo_medio, saturazione_pct, tan_pct, all_in_pct, costo_anno, note
  ) VALUES
    (v_banca_id, 2025, 'linee_breve', 1, 'Fido c/c €50k a revoca',
     50000.00, 0.00, 0.00, NULL, 2.000, 1000.00,
     'Fido MAI utilizzato durante l''anno. CDF improduttiva.'),
    (v_banca_id, 2025, 'linee_breve', 2, 'Anticipo Fatture Italia',
     700000.00, 681300.00, 97.33, 4.000, 6.000, 40918.00,
     'Saturazione molto alta. Q3 raddoppio liquidazione interessi (€9.130 vs €4.959 Q1) → picco utilizzo.')
  ON CONFLICT (banca_id, anno, tabella, descrizione) DO UPDATE SET
    accordato       = EXCLUDED.accordato,
    utilizzo_medio  = EXCLUDED.utilizzo_medio,
    saturazione_pct = EXCLUDED.saturazione_pct,
    tan_pct         = EXCLUDED.tan_pct,
    all_in_pct      = EXCLUDED.all_in_pct,
    costo_anno      = EXCLUDED.costo_anno,
    note            = EXCLUDED.note;

  -- ── 3) TABELLA 2 — MUTUI MLT ──────────────────────────────────────────────
  INSERT INTO banche_valutazioni_voci (
    banca_id, anno, tabella, ordine, descrizione,
    capitale_originario, residuo, rimborsato_pct, scadenza, anni_residui, tan_pct, costo_anno, note
  ) VALUES
    (v_banca_id, 2025, 'mutui_mlt', 1, 'Mutuo 17093326',
     1000000.00, 449000.00, 55.10, '2030-01-09', 4.10, 4.20, 29324.08,
     'Interessi mensili in discesa da €3.155 (gen) a €2.018 (dic). Sensibile a Euribor.'),
    (v_banca_id, 2025, 'mutui_mlt', 2, 'Mutuo 75738765',
     300000.00, 56000.00, 81.30, '2028-09-27', 2.75, 3.06, 3184.89,
     'Ammortamento regolare. Rata costante €2.937.'),
    (v_banca_id, 2025, 'mutui_mlt', 3, 'Mutuo 46100504',
     400000.00, 0.00, 100.00, '2025-12-29', 0.00, 2.40, 2698.46,
     'ESTINTO 29/12/2025. Ultimo anno di residuo.')
  ON CONFLICT (banca_id, anno, tabella, descrizione) DO UPDATE SET
    capitale_originario = EXCLUDED.capitale_originario,
    residuo             = EXCLUDED.residuo,
    rimborsato_pct      = EXCLUDED.rimborsato_pct,
    scadenza            = EXCLUDED.scadenza,
    anni_residui        = EXCLUDED.anni_residui,
    tan_pct             = EXCLUDED.tan_pct,
    costo_anno          = EXCLUDED.costo_anno,
    note                = EXCLUDED.note;

  -- ── 4) TABELLA 3 — COMMISSIONI DISPONIBILITÀ FONDI ────────────────────────
  INSERT INTO banche_valutazioni_voci (
    banca_id, anno, tabella, ordine, descrizione,
    base_calcolo, cdf_pct_trim, cdf_pct_annua, costo_anno, status, note
  ) VALUES
    (v_banca_id, 2025, 'cdf', 1, 'CDF Fido c/c €50k',
     50000.00, 0.500, 2.000, 1000.00, 'da_rinegoziare',
     'CDF su fido MAI utilizzato — €1.000 puramente improduttivi.'),
    (v_banca_id, 2025, 'cdf', 2, 'CDF Anticipi Fatture',
     681300.00, 0.500, 2.000, 13626.00, 'da_rinegoziare',
     'Q1 €3.250 + Q2 €3.365 + Q3 €3.511 + Q4 €3.233. Mercato PMI: 0,25-0,375% trim.')
  ON CONFLICT (banca_id, anno, tabella, descrizione) DO UPDATE SET
    base_calcolo  = EXCLUDED.base_calcolo,
    cdf_pct_trim  = EXCLUDED.cdf_pct_trim,
    cdf_pct_annua = EXCLUDED.cdf_pct_annua,
    costo_anno    = EXCLUDED.costo_anno,
    status        = EXCLUDED.status,
    note          = EXCLUDED.note;

  RAISE NOTICE '✓ SEED Intesa SP 2025 completato (banca_id=%)', v_banca_id;
END $$;
