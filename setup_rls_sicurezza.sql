-- ═══════════════════════════════════════════════════════════════════
-- PhoenixFuel — M1: Sicurezza RLS + Validazione server-side
-- Eseguire su Supabase SQL Editor (ATTENZIONE: esegui in ordine)
-- ═══════════════════════════════════════════════════════════════════
-- RUOLI: admin (tutto), operatore/contabilita/logistica (per permessi), cliente (solo suoi dati)

-- ─── STEP 1: FUNZIONI HELPER ────────────────────────────────────

-- Restituisce il ruolo dell'utente corrente
CREATE OR REPLACE FUNCTION public.get_ruolo()
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT ruolo FROM public.utenti
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$;

-- Restituisce l'id dell'utente corrente (tabella utenti)
CREATE OR REPLACE FUNCTION public.get_utente_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT id FROM public.utenti
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$;

-- Verifica se l'utente ha il permesso su una sezione
CREATE OR REPLACE FUNCTION public.ha_permesso(p_sezione text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT CASE
    WHEN public.get_ruolo() = 'admin' THEN true
    WHEN EXISTS (
      SELECT 1 FROM public.permessi
      WHERE utente_id = public.get_utente_id()
        AND sezione = p_sezione
        AND abilitato = true
    ) THEN true
    ELSE false
  END;
$$;

-- Restituisce il cliente_id associato all'utente (per ruolo cliente)
CREATE OR REPLACE FUNCTION public.get_cliente_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
AS $$
  SELECT cliente_id FROM public.utenti
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid())
  LIMIT 1;
$$;

-- ─── STEP 2: PULIZIA VECCHIE POLICIES ──────────────────────────
-- Rimuove tutte le policy "aperte" esistenti per ricrearle sicure

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN (
    SELECT schemaname, tablename, policyname
    FROM pg_policies
    WHERE schemaname = 'public'
  ) LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON %I.%I', r.policyname, r.schemaname, r.tablename);
  END LOOP;
END $$;

-- ─── STEP 3: POLICIES PER TABELLA ──────────────────────────────

-- ════ UTENTI (solo admin modifica, tutti leggono il proprio) ════
ALTER TABLE utenti ENABLE ROW LEVEL SECURITY;
CREATE POLICY utenti_select ON utenti FOR SELECT USING (
  get_ruolo() = 'admin'
  OR email = (SELECT email FROM auth.users WHERE id = auth.uid())
);
CREATE POLICY utenti_insert ON utenti FOR INSERT WITH CHECK (get_ruolo() = 'admin');
CREATE POLICY utenti_update ON utenti FOR UPDATE USING (get_ruolo() = 'admin');
CREATE POLICY utenti_delete ON utenti FOR DELETE USING (get_ruolo() = 'admin');

-- ════ PERMESSI (solo admin) ════
ALTER TABLE permessi ENABLE ROW LEVEL SECURITY;
CREATE POLICY permessi_select ON permessi FOR SELECT USING (
  get_ruolo() = 'admin' OR utente_id = get_utente_id()
);
CREATE POLICY permessi_write ON permessi FOR ALL USING (get_ruolo() = 'admin') WITH CHECK (get_ruolo() = 'admin');

-- ════ ORDINI (admin+chi ha permesso ordini, cliente vede solo i suoi) ════
ALTER TABLE ordini ENABLE ROW LEVEL SECURITY;
CREATE POLICY ordini_select ON ordini FOR SELECT USING (
  get_ruolo() = 'admin'
  OR ha_permesso('ordini')
  OR ha_permesso('deposito')
  OR ha_permesso('consegne')
  OR ha_permesso('vendite')
  OR ha_permesso('stazione')
  OR ha_permesso('finanze')
  OR ha_permesso('dashboard')
  OR (get_ruolo() = 'cliente' AND cliente = (SELECT nome FROM clienti WHERE id = get_cliente_id()))
);
CREATE POLICY ordini_insert ON ordini FOR INSERT WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('ordini')
);
CREATE POLICY ordini_update ON ordini FOR UPDATE USING (
  get_ruolo() = 'admin' OR ha_permesso('ordini') OR ha_permesso('consegne') OR ha_permesso('deposito')
);
CREATE POLICY ordini_delete ON ordini FOR DELETE USING (get_ruolo() = 'admin');

-- ════ PREZZI (admin+chi ha permesso prezzi, cliente vede) ════
ALTER TABLE prezzi ENABLE ROW LEVEL SECURITY;
CREATE POLICY prezzi_select ON prezzi FOR SELECT USING (true);
CREATE POLICY prezzi_write ON prezzi FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('prezzi')
) WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('prezzi')
);

-- ════ CLIENTI (admin+permesso clienti, cliente vede solo se stesso) ════
ALTER TABLE clienti ENABLE ROW LEVEL SECURITY;
CREATE POLICY clienti_select ON clienti FOR SELECT USING (
  get_ruolo() = 'admin'
  OR ha_permesso('clienti')
  OR ha_permesso('ordini')
  OR ha_permesso('consegne')
  OR ha_permesso('vendite')
  OR (get_ruolo() = 'cliente' AND id = get_cliente_id())
);
CREATE POLICY clienti_write ON clienti FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('clienti')
) WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('clienti')
);

-- ════ FORNITORI (admin+permesso fornitori/ordini/prezzi) ════
ALTER TABLE fornitori ENABLE ROW LEVEL SECURITY;
CREATE POLICY fornitori_select ON fornitori FOR SELECT USING (
  get_ruolo() != 'cliente'
);
CREATE POLICY fornitori_write ON fornitori FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('fornitori')
) WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('fornitori')
);

-- ════ PRODOTTI (tutti leggono, solo admin modifica) ════
ALTER TABLE prodotti ENABLE ROW LEVEL SECURITY;
CREATE POLICY prodotti_select ON prodotti FOR SELECT USING (true);
CREATE POLICY prodotti_write ON prodotti FOR ALL USING (get_ruolo() = 'admin') WITH CHECK (get_ruolo() = 'admin');

-- ════ BASI DI CARICO + FORNITORI_BASI ════
ALTER TABLE basi_carico ENABLE ROW LEVEL SECURITY;
CREATE POLICY basi_select ON basi_carico FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY basi_write ON basi_carico FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('basi')
) WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('basi')
);

ALTER TABLE fornitori_basi ENABLE ROW LEVEL SECURITY;
CREATE POLICY fornbasi_select ON fornitori_basi FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY fornbasi_write ON fornitori_basi FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('fornitori')
) WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('fornitori')
);

-- ════ DEPOSITO (cisterne, movimenti, rettifiche, giacenze) ════
ALTER TABLE cisterne ENABLE ROW LEVEL SECURITY;
CREATE POLICY cisterne_select ON cisterne FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('deposito') OR ha_permesso('stazione') OR ha_permesso('dashboard')
);
CREATE POLICY cisterne_write ON cisterne FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('deposito')
) WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('deposito')
);

ALTER TABLE movimenti_cisterne ENABLE ROW LEVEL SECURITY;
CREATE POLICY movcist_select ON movimenti_cisterne FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('deposito') OR ha_permesso('stazione')
);
CREATE POLICY movcist_write ON movimenti_cisterne FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('deposito') OR ha_permesso('ordini')
) WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('deposito') OR ha_permesso('ordini')
);

ALTER TABLE rettifiche_inventario ENABLE ROW LEVEL SECURITY;
CREATE POLICY rett_select ON rettifiche_inventario FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('deposito') OR ha_permesso('stazione')
);
CREATE POLICY rett_write ON rettifiche_inventario FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('deposito') OR ha_permesso('stazione')
) WITH CHECK (
  get_ruolo() = 'admin' OR ha_permesso('deposito') OR ha_permesso('stazione')
);

ALTER TABLE giacenze_annuali ENABLE ROW LEVEL SECURITY;
CREATE POLICY giacann_select ON giacenze_annuali FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('deposito') OR ha_permesso('stazione')
);
CREATE POLICY giacann_write ON giacenze_annuali FOR ALL USING (get_ruolo() = 'admin') WITH CHECK (get_ruolo() = 'admin');

-- ════ STAZIONE (tutte le tabelle stazione_*) ════
ALTER TABLE stazione_pompe ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzpompe_select ON stazione_pompe FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('dashboard')
);
CREATE POLICY stzpompe_write ON stazione_pompe FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

ALTER TABLE stazione_letture ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzlett_select ON stazione_letture FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('dashboard') OR ha_permesso('vendite')
);
CREATE POLICY stzlett_write ON stazione_letture FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

ALTER TABLE stazione_prezzi ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzprezzi_select ON stazione_prezzi FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('dashboard')
);
CREATE POLICY stzprezzi_write ON stazione_prezzi FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

ALTER TABLE stazione_cassa ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzcassa_select ON stazione_cassa FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('finanze')
);
CREATE POLICY stzcassa_write ON stazione_cassa FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

ALTER TABLE stazione_spese_contanti ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzspese_select ON stazione_spese_contanti FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('finanze')
);
CREATE POLICY stzspese_write ON stazione_spese_contanti FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

ALTER TABLE stazione_versamenti ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzvers_select ON stazione_versamenti FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('finanze')
);
CREATE POLICY stzvers_write ON stazione_versamenti FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

ALTER TABLE stazione_costi ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzcosti_select ON stazione_costi FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
);
CREATE POLICY stzcosti_write ON stazione_costi FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

ALTER TABLE stazione_cmp_storico ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzcmp_select ON stazione_cmp_storico FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
);
CREATE POLICY stzcmp_write ON stazione_cmp_storico FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('ordini')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('ordini'));

ALTER TABLE stazione_crediti ENABLE ROW LEVEL SECURITY;
CREATE POLICY stzcred_select ON stazione_crediti FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
);
CREATE POLICY stzcred_write ON stazione_crediti FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

ALTER TABLE giacenze_mensili ENABLE ROW LEVEL SECURITY;
CREATE POLICY giacmens_select ON giacenze_mensili FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
);
CREATE POLICY giacmens_write ON giacenze_mensili FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione'));

-- ════ LOGISTICA (carichi, mezzi, trasportatori, autisti, DAS) ════
ALTER TABLE carichi ENABLE ROW LEVEL SECURITY;
CREATE POLICY carichi_select ON carichi FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica') OR ha_permesso('consegne')
);
CREATE POLICY carichi_write ON carichi FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('logistica'));

ALTER TABLE carico_ordini ENABLE ROW LEVEL SECURITY;
CREATE POLICY caricord_select ON carico_ordini FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica') OR ha_permesso('consegne')
);
CREATE POLICY caricord_write ON carico_ordini FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('logistica'));

ALTER TABLE mezzi ENABLE ROW LEVEL SECURITY;
CREATE POLICY mezzi_select ON mezzi FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY mezzi_write ON mezzi FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('logistica'));

ALTER TABLE scomparti_mezzo ENABLE ROW LEVEL SECURITY;
CREATE POLICY scomp_select ON scomparti_mezzo FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY scomp_write ON scomparti_mezzo FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('logistica'));

ALTER TABLE trasportatori ENABLE ROW LEVEL SECURITY;
CREATE POLICY trasp_select ON trasportatori FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY trasp_write ON trasportatori FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('logistica'));

ALTER TABLE autisti ENABLE ROW LEVEL SECURITY;
CREATE POLICY autisti_select ON autisti FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY autisti_write ON autisti FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('logistica'));

ALTER TABLE mezzi_trasportatori ENABLE ROW LEVEL SECURITY;
CREATE POLICY mezztr_select ON mezzi_trasportatori FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY mezztr_write ON mezzi_trasportatori FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('logistica'));

ALTER TABLE das_documenti ENABLE ROW LEVEL SECURITY;
CREATE POLICY das_select ON das_documenti FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica') OR ha_permesso('ordini') OR ha_permesso('deposito')
);
CREATE POLICY das_write ON das_documenti FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('logistica') OR ha_permesso('ordini')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('logistica') OR ha_permesso('ordini'));

ALTER TABLE documenti_ordine ENABLE ROW LEVEL SECURITY;
CREATE POLICY docord_select ON documenti_ordine FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('ordini') OR ha_permesso('stazione') OR ha_permesso('deposito')
);
CREATE POLICY docord_write ON documenti_ordine FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('ordini') OR ha_permesso('stazione') OR ha_permesso('deposito')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('ordini') OR ha_permesso('stazione') OR ha_permesso('deposito'));

-- ════ AUTOCONSUMO ════
ALTER TABLE prelievi_autoconsumo ENABLE ROW LEVEL SECURITY;
CREATE POLICY prelac_select ON prelievi_autoconsumo FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('autoconsumo')
);
CREATE POLICY prelac_write ON prelievi_autoconsumo FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('autoconsumo')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('autoconsumo'));

-- ════ ALLEGATI ════
ALTER TABLE allegati ENABLE ROW LEVEL SECURITY;
CREATE POLICY alleg_select ON allegati FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY alleg_write ON allegati FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('deposito')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('stazione') OR ha_permesso('deposito'));

-- ════ BENCHMARK ════
ALTER TABLE benchmark_prezzi ENABLE ROW LEVEL SECURITY;
CREATE POLICY bench_select ON benchmark_prezzi FOR SELECT USING (
  get_ruolo() = 'admin' OR ha_permesso('benchmark') OR ha_permesso('prezzi')
);
CREATE POLICY bench_write ON benchmark_prezzi FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('benchmark') OR ha_permesso('prezzi')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('benchmark') OR ha_permesso('prezzi'));

-- ════ PREZZI CLIENTE ════
ALTER TABLE prezzi_cliente ENABLE ROW LEVEL SECURITY;
CREATE POLICY przcli_select ON prezzi_cliente FOR SELECT USING (true);
CREATE POLICY przcli_write ON prezzi_cliente FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('prezzi')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('prezzi'));

-- ════ SEDI SCARICO ════
ALTER TABLE sedi_scarico ENABLE ROW LEVEL SECURITY;
CREATE POLICY sedi_select ON sedi_scarico FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY sedi_write ON sedi_scarico FOR ALL USING (
  get_ruolo() = 'admin' OR ha_permesso('clienti')
) WITH CHECK (get_ruolo() = 'admin' OR ha_permesso('clienti'));

-- ════ POMPE-CISTERNE ════
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'pompe_cisterne') THEN
    ALTER TABLE pompe_cisterne ENABLE ROW LEVEL SECURITY;
    CREATE POLICY pompcist_all ON pompe_cisterne FOR ALL USING (get_ruolo() != 'cliente') WITH CHECK (get_ruolo() != 'cliente');
  END IF;
END $$;

-- ════ ADMIN: AUDIT LOG (tutti inseriscono, solo admin legge tutto) ════
ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_select ON audit_log FOR SELECT USING (get_ruolo() = 'admin');
CREATE POLICY audit_insert ON audit_log FOR INSERT WITH CHECK (true);

-- ════ BACHECA AVVISI (tutti leggono e scrivono) ════
ALTER TABLE bacheca_avvisi ENABLE ROW LEVEL SECURITY;
CREATE POLICY bacheca_select ON bacheca_avvisi FOR SELECT USING (get_ruolo() != 'cliente');
CREATE POLICY bacheca_write ON bacheca_avvisi FOR ALL USING (get_ruolo() != 'cliente') WITH CHECK (get_ruolo() != 'cliente');

-- ─── STEP 4: ALERT FIDO SERVER-SIDE (non blocca, avvisa) ────────
-- L'ordine passa SEMPRE. Se il fido è superato, crea un avviso
-- urgente in bacheca per l'admin che deciderà se cancellare.

CREATE OR REPLACE FUNCTION public.alert_fido_ordine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_fido_max numeric;
  v_fido_usato numeric;
  v_totale_ordine numeric;
  v_percentuale numeric;
  v_utente_nome text;
BEGIN
  IF NEW.tipo_ordine != 'cliente' THEN RETURN NEW; END IF;
  IF NEW.stato = 'annullato' THEN RETURN NEW; END IF;
  IF NEW.cliente IS NULL OR NEW.cliente = '' THEN RETURN NEW; END IF;

  SELECT COALESCE(fido_max, 0) INTO v_fido_max
  FROM clienti WHERE nome = NEW.cliente LIMIT 1;

  IF v_fido_max = 0 THEN RETURN NEW; END IF;

  SELECT COALESCE(SUM(
    (COALESCE(costo_litro,0) + COALESCE(trasporto_litro,0) + COALESCE(margine,0))
    * (1 + COALESCE(iva,22)/100.0) * COALESCE(litri,0)
  ), 0) INTO v_fido_usato
  FROM ordini
  WHERE cliente = NEW.cliente
    AND tipo_ordine = 'cliente'
    AND pagato = false
    AND stato != 'annullato'
    AND id != COALESCE(NEW.id, '00000000-0000-0000-0000-000000000000'::uuid);

  v_totale_ordine := (COALESCE(NEW.costo_litro,0) + COALESCE(NEW.trasporto_litro,0) + COALESCE(NEW.margine,0))
    * (1 + COALESCE(NEW.iva,22)/100.0) * COALESCE(NEW.litri,0);

  v_percentuale := CASE WHEN v_fido_max > 0 THEN ROUND(((v_fido_usato + v_totale_ordine) / v_fido_max) * 100) ELSE 0 END;

  SELECT nome INTO v_utente_nome FROM utenti
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid()) LIMIT 1;

  -- Alert se supera 100% del fido
  IF (v_fido_usato + v_totale_ordine) > v_fido_max THEN
    INSERT INTO bacheca_avvisi (tipo, priorita, messaggio, mittente, letto)
    VALUES (
      'criticita', 'urgente',
      '⚠️ FIDO SUPERATO: Cliente "' || NEW.cliente || '" ha fido max € ' || ROUND(v_fido_max,2)
      || ' ma impegnato € ' || ROUND(v_fido_usato + v_totale_ordine,2)
      || ' (' || v_percentuale || '%). Ordine ' || NEW.prodotto || ' ' || NEW.litri || 'L inserito da ' || COALESCE(v_utente_nome, 'sistema')
      || '. Verificare e cancellare se necessario.',
      'Sistema automatico', false
    );
  -- Alert se supera 80% del fido (avviso preventivo)
  ELSIF (v_fido_usato + v_totale_ordine) > (v_fido_max * 0.8) THEN
    INSERT INTO bacheca_avvisi (tipo, priorita, messaggio, mittente, letto)
    VALUES (
      'anomalia', 'normale',
      '⚡ Fido al ' || v_percentuale || '%: Cliente "' || NEW.cliente || '" — fido max € ' || ROUND(v_fido_max,2)
      || ', impegnato € ' || ROUND(v_fido_usato + v_totale_ordine,2) || '.',
      'Sistema automatico', false
    );
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_valida_fido ON ordini;
DROP TRIGGER IF EXISTS trg_alert_fido ON ordini;
CREATE TRIGGER trg_alert_fido
  AFTER INSERT OR UPDATE ON ordini
  FOR EACH ROW EXECUTE FUNCTION alert_fido_ordine();

-- ─── STEP 5: CANCELLAZIONE ORDINE CON ROLLBACK COMPLETO ────────
-- Quando un admin cancella un ordine, il trigger:
-- 1. Ripristina i litri nelle cisterne (se erano stati caricati)
-- 2. Elimina i DAS collegati
-- 3. Elimina i documenti allegati
-- 4. Elimina dal carico se era pianificato
-- 5. Registra tutto nell'audit log

CREATE OR REPLACE FUNCTION public.rollback_ordine()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_utente text;
  v_mov RECORD;
BEGIN
  -- Solo admin può eliminare
  IF get_ruolo() != 'admin' THEN
    RAISE EXCEPTION 'Solo gli amministratori possono eliminare ordini';
  END IF;

  SELECT nome INTO v_utente FROM utenti
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid()) LIMIT 1;

  -- 1. Ripristina cisterne: inverti i movimenti collegati
  FOR v_mov IN SELECT * FROM movimenti_cisterne WHERE ordine_id = OLD.id LOOP
    IF v_mov.tipo = 'entrata' THEN
      UPDATE cisterne SET livello_attuale = GREATEST(0, livello_attuale - v_mov.litri) WHERE id = v_mov.cisterna_id;
    ELSIF v_mov.tipo = 'uscita' THEN
      UPDATE cisterne SET livello_attuale = livello_attuale + v_mov.litri WHERE id = v_mov.cisterna_id;
    END IF;
  END LOOP;
  DELETE FROM movimenti_cisterne WHERE ordine_id = OLD.id;

  -- 2. Elimina DAS generati per questo ordine
  DELETE FROM das_documenti WHERE ordine_id = OLD.id;

  -- 3. Elimina documenti allegati (i file su Storage vanno eliminati dal JS)
  DELETE FROM documenti_ordine WHERE ordine_id = OLD.id;

  -- 4. Rimuovi dal carico
  DELETE FROM carico_ordini WHERE ordine_id = OLD.id;

  -- 5. Audit dettagliato
  INSERT INTO audit_log (utente, azione, tabella, dettaglio)
  VALUES (
    COALESCE(v_utente, 'admin'),
    'DELETE_ORDINE_ROLLBACK',
    'ordini',
    'Ordine eliminato con rollback: ' || OLD.data || ' | ' || COALESCE(OLD.tipo_ordine,'') || ' | '
    || COALESCE(OLD.cliente, OLD.fornitore, '') || ' | ' || COALESCE(OLD.prodotto,'') || ' | '
    || COALESCE(OLD.litri::text,'0') || 'L | Stato: ' || COALESCE(OLD.stato,'')
  );

  -- 6. Avviso in bacheca
  INSERT INTO bacheca_avvisi (tipo, priorita, messaggio, mittente, letto)
  VALUES (
    'sistema', 'urgente',
    '🗑️ Ordine eliminato con rollback da ' || COALESCE(v_utente,'admin') || ': '
    || OLD.data || ' — ' || COALESCE(OLD.cliente, OLD.fornitore,'') || ' — '
    || COALESCE(OLD.prodotto,'') || ' ' || COALESCE(OLD.litri::text,'0') || 'L. '
    || 'Cisterne ripristinate, DAS e documenti rimossi.',
    'Sistema automatico', false
  );

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteggi_del_ordini ON ordini;
DROP TRIGGER IF EXISTS trg_rollback_ordine ON ordini;
CREATE TRIGGER trg_rollback_ordine
  BEFORE DELETE ON ordini
  FOR EACH ROW EXECUTE FUNCTION rollback_ordine();

-- Protezione eliminazione su altre tabelle critiche (solo admin)
CREATE OR REPLACE FUNCTION public.proteggi_eliminazione()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  IF get_ruolo() != 'admin' THEN
    RAISE EXCEPTION 'Solo gli amministratori possono eliminare record da questa tabella';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteggi_del_clienti ON clienti;
CREATE TRIGGER trg_proteggi_del_clienti BEFORE DELETE ON clienti FOR EACH ROW EXECUTE FUNCTION proteggi_eliminazione();

DROP TRIGGER IF EXISTS trg_proteggi_del_fornitori ON fornitori;
CREATE TRIGGER trg_proteggi_del_fornitori BEFORE DELETE ON fornitori FOR EACH ROW EXECUTE FUNCTION proteggi_eliminazione();

DROP TRIGGER IF EXISTS trg_proteggi_del_cisterne ON cisterne;
CREATE TRIGGER trg_proteggi_del_cisterne BEFORE DELETE ON cisterne FOR EACH ROW EXECUTE FUNCTION proteggi_eliminazione();

-- ─── STEP 6: AUDIT AUTOMATICO SU OPERAZIONI SENSIBILI ──────────

CREATE OR REPLACE FUNCTION public.audit_auto()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_utente text;
  v_azione text;
  v_dettaglio text;
BEGIN
  SELECT nome INTO v_utente FROM utenti
  WHERE email = (SELECT email FROM auth.users WHERE id = auth.uid()) LIMIT 1;

  v_azione := TG_OP;
  IF TG_OP = 'INSERT' THEN
    v_dettaglio := 'Nuovo record inserito';
  ELSIF TG_OP = 'UPDATE' THEN
    v_dettaglio := 'Record aggiornato';
  ELSIF TG_OP = 'DELETE' THEN
    v_dettaglio := 'Record eliminato';
  END IF;

  INSERT INTO audit_log (utente, azione, tabella, dettaglio)
  VALUES (COALESCE(v_utente, 'sistema'), v_azione, TG_TABLE_NAME, v_dettaglio);

  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

-- Audit automatico su tabelle critiche
DROP TRIGGER IF EXISTS trg_audit_ordini ON ordini;
CREATE TRIGGER trg_audit_ordini AFTER INSERT OR UPDATE OR DELETE ON ordini FOR EACH ROW EXECUTE FUNCTION audit_auto();

DROP TRIGGER IF EXISTS trg_audit_clienti ON clienti;
CREATE TRIGGER trg_audit_clienti AFTER INSERT OR UPDATE OR DELETE ON clienti FOR EACH ROW EXECUTE FUNCTION audit_auto();

DROP TRIGGER IF EXISTS trg_audit_utenti ON utenti;
CREATE TRIGGER trg_audit_utenti AFTER INSERT OR UPDATE OR DELETE ON utenti FOR EACH ROW EXECUTE FUNCTION audit_auto();

-- ─── VERIFICA FINALE ────────────────────────────────────────────
-- Testa con:  SELECT get_ruolo();
-- Dovrebbe restituire il ruolo dell'utente loggato
