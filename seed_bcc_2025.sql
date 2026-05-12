-- ════════════════════════════════════════════════════════════════════════════
-- PHOENIX FUEL — SEED VALUTAZIONE BCC 2025
-- Fonte: 4 PDF ufficiali estratti conto BCC trim 2025 (Q1-Q2-Q3-Q4)
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  v_banca_id           UUID;
  v_interessi_mutui    NUMERIC := 45486.57;   -- 12 rate × Int. (da PDF Q1-Q4)
  v_interessi_anticipi NUMERIC := 1800.00;    -- 4 trim × €450 (acconti)
  v_cdf_totali         NUMERIC := 1540.00;    -- 4 trim × €385 (acconti CDF c/c)
  v_canoni_bolli       NUMERIC := 266.49;     -- bolli E/C 100 + canone HB 73,20 + carta 93,29
  v_altri_costi        NUMERIC := 5500.00;    -- fidejussioni pro-rata 2025
  v_volume_anticipi    NUMERIC := 668102.39;  -- 6 presentazioni 2025
  v_esposizione        NUMERIC := 1034000.00; -- mutuo residuo 884k + anticipi medi 150k
  v_costo_totale       NUMERIC;
BEGIN
  SELECT id INTO v_banca_id FROM banche_istituti
   WHERE UPPER(nome) LIKE '%BCC%' OR UPPER(nome) LIKE '%CALABRIA ULTERIORE%' LIMIT 1;
  IF v_banca_id IS NULL THEN
    RAISE NOTICE '⚠ Banca BCC non trovata in banche_istituti — seed saltato.';
    RETURN;
  END IF;
  RAISE NOTICE '── BCC banca_id = %', v_banca_id;

  v_costo_totale := v_interessi_mutui + v_interessi_anticipi + v_cdf_totali + v_canoni_bolli + v_altri_costi;
  RAISE NOTICE '── Costo bancario BCC 2025 (competenza): %', v_costo_totale;

  -- ── 1) Header ──────────────────────────────────────────────────────────
  INSERT INTO banche_valutazioni_periodi (
    banca_id, anno, esposizione_totale, costo_bancario_totale,
    interessi_mutui, interessi_anticipi, cdf_totali,
    canoni_bolli_spese, differenziali_irs, altri_costi_netti,
    volume_anticipi_lavorato, volume_anticipi_fonte,
    costi_accessori_dettaglio, criticita, benchmark, raccomandazioni
  ) VALUES (
    v_banca_id, 2025,
    v_esposizione, v_costo_totale,
    v_interessi_mutui, v_interessi_anticipi, v_cdf_totali,
    v_canoni_bolli, 0.00, v_altri_costi,
    v_volume_anticipi, 'manuale',
    '[
      {"voce": "Bolli E/C trimestrali (4 × €25)", "importo": 100.00},
      {"voce": "Canone home banking (12 mesi × €6,10)", "importo": 73.20},
      {"voce": "Canone carta credito BCC", "importo": 93.29},
      {"voce": "Commissioni crediti di firma — fidejussioni pro-rata 2025", "importo": 5500.00},
      {"voce": "Stima saldo annuo Rap. anticipi 2025 (cassa marzo 2026)", "importo": 4314.67},
      {"voce": "Stima saldo annuo CDF c/c 2025 (cassa marzo 2026)", "importo": 1043.76}
    ]'::jsonb,
    -- Criticità
    'Quota interessi mutuo Finanz. ZES Deposito (12 rate mensili) pesa 83% del costo bancario totale: €45.487 su €54.593. Struttura anticipi BCC con commissioni FISSE trimestrali (€450/trim anticipi + €385/trim CDF c/c) anziché TAN variabile — vantaggiosa al volume attuale (€668k) ma non scalabile linearmente. Tasso fido c/c variato 3 volte nel 2025 seguendo Euribor: gen 4,178% → apr 3,836% → ott 3,532% (decrescente). ATTENZIONE: i saldi annuali competenze 2025 (Rap. anticipi + CDF c/c) arriveranno cassa marzo 2026 — stima conservativa su dato 2024: ~€5.358 ulteriori, che porterebbero il costo bancario 2025 a competenza piena a €59.951. Commissioni crediti di firma 2025 (fidejussioni/avalli): pro-rata €5.500 da 3 rate annuali con periodi sfalsati.',
    -- Benchmark
    'Anticipi BCC: costo per €1.000 anticipato = €12,74 (€8.514 commissioni anticipi / €668k volume) → MOLTO più conveniente di MPS (€18,67) e Intesa (€20,33). Mutuo ZES Deposito agevolato: TAN medio 2025 ~4,92% (calcolato su capitale medio €924k e interessi €45.487) — alto in valore assoluto ma incluso garanzia ZES/Mediocredito Centrale. Spread vs PMI top profilo 2026 (Euribor + 1,5-2%): in linea con BCC profilo Sud Italia.',
    -- Raccomandazioni
    'A) Sfruttare le commissioni fisse anticipi BCC fintanto che il volume non triplica: vantaggio strutturale.
B) Monitorare il saldo annuale di marzo 2026 — se eccede stima €5.358 rivedere l''importo competenza 2025.
C) Valutare in 2026 la rinegoziazione TAN del mutuo ZES: il trend Euribor decrescente potrebbe consentire un risparmio di 50-100 bps.
D) Le commissioni crediti di firma €5.500 sono significative: verificare ogni rinnovo se le fidejussioni sono ancora necessarie o ridimensionabili.
E) Importare il piano ammortamento del mutuo ZES nel modulo Finanziamenti per dati 2026 più precisi sulla quota interessi.'
  )
  ON CONFLICT (banca_id, anno) DO UPDATE SET
    esposizione_totale       = EXCLUDED.esposizione_totale,
    costo_bancario_totale    = EXCLUDED.costo_bancario_totale,
    interessi_mutui          = EXCLUDED.interessi_mutui,
    interessi_anticipi       = EXCLUDED.interessi_anticipi,
    cdf_totali               = EXCLUDED.cdf_totali,
    canoni_bolli_spese       = EXCLUDED.canoni_bolli_spese,
    differenziali_irs        = EXCLUDED.differenziali_irs,
    altri_costi_netti        = EXCLUDED.altri_costi_netti,
    volume_anticipi_lavorato = EXCLUDED.volume_anticipi_lavorato,
    volume_anticipi_fonte    = EXCLUDED.volume_anticipi_fonte,
    costi_accessori_dettaglio= EXCLUDED.costi_accessori_dettaglio,
    criticita                = EXCLUDED.criticita,
    benchmark                = EXCLUDED.benchmark,
    raccomandazioni          = EXCLUDED.raccomandazioni,
    updated_at               = NOW();

  -- ── 2) Tabella 1 — Linee breve ─────────────────────────────────────────
  INSERT INTO banche_valutazioni_voci (
    banca_id, anno, tabella, ordine, descrizione,
    accordato, utilizzo_medio, saturazione_pct, tan_pct, all_in_pct, costo_anno, note
  ) VALUES
    (v_banca_id, 2025, 'linee_breve', 1, 'Anticipo Effetti/Documenti SBF',
     300000.00, 150000.00, 50.00, 0.000, 1.276, 8514.00,
     'Accordato €300k. Volume 2025 €668k (6 presentazioni: gen 86k, lug 115k, ago 141k, ott 101k, nov 151k, dic 74k). BCC NON applica TAN variabile sull''utilizzo ma commissioni FISSE: €450/trim rapporto anticipi + €385/trim CDF c/c. All-in 1,276% sul volume = €12,74/€1k — molto più conveniente di MPS (€18,67) e Intesa (€20,33), ma non scalabile linearmente.')
  ON CONFLICT (banca_id, anno, tabella, descrizione) DO UPDATE SET
    accordato       = EXCLUDED.accordato,
    utilizzo_medio  = EXCLUDED.utilizzo_medio,
    saturazione_pct = EXCLUDED.saturazione_pct,
    tan_pct         = EXCLUDED.tan_pct,
    all_in_pct      = EXCLUDED.all_in_pct,
    costo_anno      = EXCLUDED.costo_anno,
    note            = EXCLUDED.note;

  -- ── 3) Tabella 2 — Mutui MLT ───────────────────────────────────────────
  INSERT INTO banche_valutazioni_voci (
    banca_id, anno, tabella, ordine, descrizione,
    capitale_originario, residuo, rimborsato_pct, scadenza, anni_residui, tan_pct, costo_anno, note
  ) VALUES
    (v_banca_id, 2025, 'mutui_mlt', 1, 'Finanz. ZES Deposito 107859/92',
     1000000.00, 884077.07, 11.59, '2034-10-23', 8.83, 4.920, 45486.57,
     'Mutuo ZES Deposito agevolato/finalizzato. Decorrenza 23/10/2024. Rate MENSILI (decadi 23). 12 rate pagate nel 2025 (003-014), totale rata 2025 €125.903,59 di cui capitale €80.387,02 + interessi €45.486,57 + spese €30. TAN medio 2025 implicito 4,92% (calcolato su capitale medio €924k). TAN gennaio 5,45% → dicembre 4,59% (variabile, indicizzato Euribor). Quota interessi DATO CERTO dal PDF ufficiale (Cap/Int/Spese separati riga per riga).')
  ON CONFLICT (banca_id, anno, tabella, descrizione) DO UPDATE SET
    capitale_originario = EXCLUDED.capitale_originario,
    residuo             = EXCLUDED.residuo,
    rimborsato_pct      = EXCLUDED.rimborsato_pct,
    scadenza            = EXCLUDED.scadenza,
    anni_residui        = EXCLUDED.anni_residui,
    tan_pct             = EXCLUDED.tan_pct,
    costo_anno          = EXCLUDED.costo_anno,
    note                = EXCLUDED.note;

  -- ── 4) Tabella 3 — CDF ─────────────────────────────────────────────────
  INSERT INTO banche_valutazioni_voci (
    banca_id, anno, tabella, ordine, descrizione,
    base_calcolo, cdf_pct_trim, cdf_pct_annua, costo_anno, status, note
  ) VALUES
    (v_banca_id, 2025, 'cdf', 1, 'Commissioni anticipi + CDF c/c (acconti trim fissi)',
     300000.00, 0.283, 1.113, 3340.00, 'ok',
     'Struttura BCC differente dalle altre banche: NON ha CDF % su accordato ma commissioni FISSE trimestrali. Anticipi Rap.matur.1342: €450/trim × 4 = €1.800/anno. CDF c/c Liq.comp.0002: €385/trim × 4 = €1.540/anno. Totale €3.340 (acconti). A marzo 2026 arriverà il SALDO annuale (esigibili 2025), stima conservativa €5.358 basata su saldo 2024.')
  ON CONFLICT (banca_id, anno, tabella, descrizione) DO UPDATE SET
    base_calcolo  = EXCLUDED.base_calcolo,
    cdf_pct_trim  = EXCLUDED.cdf_pct_trim,
    cdf_pct_annua = EXCLUDED.cdf_pct_annua,
    costo_anno    = EXCLUDED.costo_anno,
    status        = EXCLUDED.status,
    note          = EXCLUDED.note;

  RAISE NOTICE '✓ SEED BCC 2025 completato — costo totale: % €', v_costo_totale;
END $$;

-- ── Verifica finale (3 banche a confronto) ─────────────────────────────────
SELECT
  bi.nome,
  bvp.anno,
  bvp.costo_bancario_totale          AS costo_totale,
  bvp.volume_anticipi_lavorato       AS volume_anticipi,
  bvp.interessi_mutui,
  bvp.interessi_anticipi,
  bvp.cdf_totali,
  ROUND((bvp.interessi_anticipi + bvp.cdf_totali) / NULLIF(bvp.volume_anticipi_lavorato, 0) * 1000, 2) AS costo_per_1k_anticipato
FROM banche_valutazioni_periodi bvp
JOIN banche_istituti bi ON bi.id = bvp.banca_id
WHERE bvp.anno = 2025
ORDER BY
  CASE UPPER(bi.nome)
    WHEN 'INTESA SANPAOLO' THEN 1
    WHEN 'MPS' THEN 2
    WHEN 'BNL' THEN 3
    ELSE 4
  END;
