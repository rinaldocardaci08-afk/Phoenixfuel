-- ============================================================
-- PHOENIXFUEL — Import Sedi di Scarico da Access
-- Solo per clienti attivi con ordini negli ultimi 2 anni
-- ============================================================
-- Esegui in Supabase → SQL Editor
-- ============================================================

DO $$
DECLARE
  v_cliente_id uuid;
  v_count integer;
BEGIN

  -- A.D.S.S.E. Srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'A.D.S.S.E. Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'A.D.S.S.E. Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Lamezia', 'SS 280 Bivio Aeroporto C.da Bellafemmina', 'Lamezia Terme', 'CZ', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Lamezia' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Via Toscanini, 16', 'Gioia Tauro', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: A.D.S.S.E. Srl';
    END IF;
  END IF;

  -- A.P. oil Petroleum srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'A.P. oil Petroleum srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'A.P. oil Petroleum srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Cantiere', 'Via Prova, 12', 'Catanzaro', 'CZ', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Cantiere' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'viale Magna Grecia 199', 'Catanzaro', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: A.P. oil Petroleum srl';
    END IF;
  END IF;

  -- AP PETROLI SRL (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'AP PETROLI SRL' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'AP PETROLI SRL') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Saline', 'Fraz. Saline SS 106 KM 23+450', 'Montebello Jonico', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Saline' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico RC', 'Via Vecchia Provinciale SNC', 'Reggio Calabria', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico RC' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: AP PETROLI SRL';
    END IF;
  END IF;

  -- Allera srl Costruzioni Metalmeccaniche (1 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Allera srl Costruzioni Metalmeccaniche' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Allera srl Costruzioni Metalmeccaniche') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'I Zona industriale Gioia Tauro-San Ferdinando', 'San Ferdinando', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Allera srl Costruzioni Metalmeccaniche';
    END IF;
  END IF;

  -- Amministrazione Giudiziaria Musolino in Confisca (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Amministrazione Giudiziaria Musolino in Confisca' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Amministrazione Giudiziaria Musolino in Confisca') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'C/da Mannoli SNC', 'Santo Stefano in Aspromonte', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Corso Garibaldi, 50', 'Santo Stefano in Aspromonte', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Amministrazione Giudiziaria Musolino in Confisca';
    END IF;
  END IF;

  -- Az.Agr. Industria Boschiva Spadafora Rosaria (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Az.Agr. Industria Boschiva Spadafora Rosaria' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Az.Agr. Industria Boschiva Spadafora Rosaria') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Cosenza', 'Settimo Di Montalto', 'Montalto Uffugo', 'CS', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Cosenza' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Catanzaro', 'Via salita Monti 31', 'Sersale', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Catanzaro' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Az.Agr. Industria Boschiva Spadafora Rosaria';
    END IF;
  END IF;

  -- Bruzzaniti Domenico (1 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Bruzzaniti Domenico' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Bruzzaniti Domenico') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Via Provinciale', 'Africo', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Bruzzaniti Domenico';
    END IF;
  END IF;

  -- C&T S.p.A. (1 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'C&T S.p.A.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'C&T S.p.A.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Contrada Vatoni', 'Taurianova', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: C&T S.p.A.';
    END IF;
  END IF;

  -- CMT s.a.s. di Chiaravalloti G.&C. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'CMT s.a.s. di Chiaravalloti G.&C.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'CMT s.a.s. di Chiaravalloti G.&C.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Operativa', 'Via Salvo d''Acquisto', 'Cortale', 'CZ', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Operativa' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Legale', 'C.da Salica', 'Cortale', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Legale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: CMT s.a.s. di Chiaravalloti G.&C.';
    END IF;
  END IF;

  -- COSTRUZIONI METALMECCANICHE CASTAGNA S.r.l. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'COSTRUZIONI METALMECCANICHE CASTAGNA S.r.l.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'COSTRUZIONI METALMECCANICHE CASTAGNA S.r.l.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico 2', 'Via della pace', 'Ionadi', 'VV', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico 2' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Z.I. Porto Salvo S.S. 522', 'Vibo Valentia', 'VV', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: COSTRUZIONI METALMECCANICHE CASTAGNA S.r.l.';
    END IF;
  END IF;

  -- Comune di Falerna (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Comune di Falerna' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Comune di Falerna') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Plesso Scolastico Falerna Marina', 'Plesso scolastico di Falerna Marina', 'Falerna', 'CZ', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Plesso Scolastico Falerna Marina' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Plesso Scolastico Falerna Paese', 'Plesso Scolastico di Falerna Paese', 'Falerna', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Plesso Scolastico Falerna Paese' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Comune di Falerna';
    END IF;
  END IF;

  -- Costruzioni Generali srl (4 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Costruzioni Generali srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Costruzioni Generali srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Giffone', 'Loc. Paglia Marcato snc', 'Giffone', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Giffone' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Quarantana', 'loc. Quarantana snc', 'Oppido Mamertina', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Quarantana' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Via G. Bruno n.13', 'Polistena', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Polistena', 'c/da sangiovanni snc', 'Polistena', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Polistena' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Costruzioni Generali srl';
    END IF;
  END IF;

  -- Costruzioni Perrone SRL (5 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Costruzioni Perrone SRL' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Costruzioni Perrone SRL') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Cantiere Metro Germaneto', 'Cantiere Metro FC snc', 'Germaneto', 'CZ', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Cantiere Metro Germaneto' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede San Ferdinando', 'Zona Industriale', 'San Ferdinando', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede San Ferdinando' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Rizziconi Cavallaro', 'Contrada Cavallaro', 'Rizziconi', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Rizziconi Cavallaro' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Rizziconi Cirello', 'Strada Provinciale Bivio Cirello snc', 'Rizziconi', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Rizziconi Cirello' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Santa Teresa VR', 'SP 47 - LOC. NEGRI 1-2 C', 'Santa Teresa', 'VR', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Santa Teresa VR' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Costruzioni Perrone SRL';
    END IF;
  END IF;

  -- Detercart lombardo srl (3 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Detercart lombardo srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Detercart lombardo srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Campo Calabro', 'zona industriale 8 B', 'Campo Calabro', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Campo Calabro' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'c.da S.Fili n.38', 'Melicucco', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Rosarno', 'SS. 281 - Km 1 Uscita A3 Rosarno', 'Rosarno', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Rosarno' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Detercart lombardo srl';
    END IF;
  END IF;

  -- Edil San Pantaleone s.n.c. di Prossomariti e Pettè (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Edil San Pantaleone s.n.c. di Prossomariti e Pettè' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Edil San Pantaleone s.n.c. di Prossomariti e Pettè') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Via Belvedere, 6', 'Serrata', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Contrada reschia', 'Laureana di Borello', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Edil San Pantaleone s.n.c. di Prossomariti e Pettè';
    END IF;
  END IF;

  -- Eurospin Sicilia Spa (5 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Eurospin Sicilia Spa' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Eurospin Sicilia Spa') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Lazzaro', 'SS 106 Località Fornace Snc Lazzaro', 'Motta San Giovanni', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Lazzaro' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Crotone via Scopelliti', 'via Scopelliti snc', 'Crotone', 'KR', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Crotone via Scopelliti' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Crotone Passovecchio', 'Località Passovecchio ex SS 107', 'Crotone', 'KR', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Crotone Passovecchio' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Satriano', 'Viale Europa Svincolo SS 106', 'Satriano', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Satriano' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Gallico', 'via Nazionale Loc. Gallico', 'Gallico', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Gallico' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Eurospin Sicilia Spa';
    END IF;
  END IF;

  -- Fersalento Srl (3 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Fersalento Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Fersalento Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Catona Bolano', 'Catona Bolano', 'Reggio Calabria', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Catona Bolano' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Cantiere Stazione Condofuri', 'Cantiere Stazione', 'Condofuri', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Cantiere Stazione Condofuri' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Via Galvani RC', 'Via Luigi Galvani', 'Reggio Calabria', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Via Galvani RC' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Fersalento Srl';
    END IF;
  END IF;

  -- G.R.E. TRASPORTI S.R.L. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'G.R.E. TRASPORTI S.R.L.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'G.R.E. TRASPORTI S.R.L.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Cittanova', 'Contrada Barletta', 'Cittanova', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Cittanova' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Pellegrina', 'C/da Catena snc', 'Pellegrina di Bagnara Calabra', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Pellegrina' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: G.R.E. TRASPORTI S.R.L.';
    END IF;
  END IF;

  -- General Gas Srl (3 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'General Gas Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'General Gas Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Cliente Lacinia', 'SS 18 n2', 'Gioia Tauro', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Cliente Lacinia' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'SS 18 n2', 'Gioia Tauro', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Alfa Distribuzione', 'SS 18 n2', 'Gioia Tauro', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Alfa Distribuzione' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: General Gas Srl';
    END IF;
  END IF;

  -- Giantransport S.R.L. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Giantransport S.R.L.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Giantransport S.R.L.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Cittanova', 'Contrada Barletta', 'Cittanova', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Cittanova' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Pellegrina', 'C/da Catena snc', 'Pellegrina di Bagnara Calabra', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Pellegrina' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Giantransport S.R.L.';
    END IF;
  END IF;

  -- Gruppo PSC SPA (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Gruppo PSC SPA' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Gruppo PSC SPA') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Campo Calabro', 'Zona Industriale Snc', 'Campo Calabro', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Campo Calabro' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Grotteria', 'Contrada Gagliano 3/A', 'Grotteria', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Grotteria' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Gruppo PSC SPA';
    END IF;
  END IF;

  -- H&AD srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'H&AD srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'H&AD srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Via Ronchi snc', 'Polistena', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Produzione', 'Località Chiusi-zona industriale', 'Bianco', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Produzione' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: H&AD srl';
    END IF;
  END IF;

  -- IELASI TRASPORTI SRL (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'IELASI TRASPORTI SRL' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'IELASI TRASPORTI SRL') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Via XXIV Maggio, 143', 'Bovalino', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Secondaria', 'Zona Industriale A.S.I., snc', 'Gioia Tauro', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Secondaria' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: IELASI TRASPORTI SRL';
    END IF;
  END IF;

  -- IMPRESIG SRL (5 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'IMPRESIG SRL' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'IMPRESIG SRL') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Rizziconi Cavallaro', 'Strada Provinciale C.da Cavallaro Snc', 'Rizziconi', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Rizziconi Cavallaro' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Catanzaro Metro', 'Cantiere Metro FC snc', 'Germaneto', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Catanzaro Metro' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Rizziconi Cirello', 'Strada Provinciale Bivio Cirello snc', 'Rizziconi', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Rizziconi Cirello' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Santa Teresa VR', 'SP 47 - LOC. NEGRI 1-2 C', 'Santa Teresa', 'VR', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Santa Teresa VR' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede San Ferdinando', 'Zona Industriale', 'San Ferdinando', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede San Ferdinando' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: IMPRESIG SRL';
    END IF;
  END IF;

  -- INERTI F & R s.r.l. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'INERTI F & R s.r.l.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'INERTI F & R s.r.l.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'VIA S.S. 111, 64', 'Gioia Tauro', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Rizziconi', 'Loc. Foresta', 'Rizziconi', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Rizziconi' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: INERTI F & R s.r.l.';
    END IF;
  END IF;

  -- Imeda Soc. Coop. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Imeda Soc. Coop.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Imeda Soc. Coop.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Viale Sandro Pertini 125', 'Cinquefrondi', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'strada Provinciale snc', 'Galatro', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Imeda Soc. Coop.';
    END IF;
  END IF;

  -- Ingrosso Alimentari e Bevande di Sabatino Alessio (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Ingrosso Alimentari e Bevande di Sabatino Alessio' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Ingrosso Alimentari e Bevande di Sabatino Alessio') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Via 1° Maggio', 'Soriano Calabro', 'VV', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Via M. Bianchi 95', 'Gerocarne', 'VV', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Ingrosso Alimentari e Bevande di Sabatino Alessio';
    END IF;
  END IF;

  -- Lacinia Srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Lacinia Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Lacinia Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Via Ss18 n2', 'Gioia Tauro', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Alfa Distribuzione', 'Via Ss18 n2', 'Gioia Tauro', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Alfa Distribuzione' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Lacinia Srl';
    END IF;
  END IF;

  -- Mediterraneo Logistica Srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Mediterraneo Logistica Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Mediterraneo Logistica Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Via Casarene snc Area Industriale', 'Anagni', 'FR', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Locri', 'contrada Verga', 'Locri', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Locri' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Mediterraneo Logistica Srl';
    END IF;
  END IF;

  -- Metalsud Lo Gatto Srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Metalsud Lo Gatto Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Metalsud Lo Gatto Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Pignone', 'Zona Industriale Portosalvo', 'Vibo Valentia', 'VV', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Pignone' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Aeroporto', 'Zona Industriale Aeroporto', 'Vibo Valentia', 'VV', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Aeroporto' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Metalsud Lo Gatto Srl';
    END IF;
  END IF;

  -- Napoli Michele (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Napoli Michele' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Napoli Michele') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Rosarno', 'C/da Campizzi', 'Rosarno', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Rosarno' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Melicucco', 'C/da San Fili', 'Melicucco', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Melicucco' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Napoli Michele';
    END IF;
  END IF;

  -- Nartransport Srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Nartransport Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Nartransport Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'via Santa Maria inferiore snc', 'Rizziconi', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Legale', 'Via Fiume 32', 'Poncarale', 'BS', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Legale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Nartransport Srl';
    END IF;
  END IF;

  -- O.P. Calabria Soc. Coop. a.r.l. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'O.P. Calabria Soc. Coop. a.r.l.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'O.P. Calabria Soc. Coop. a.r.l.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'C/da Ludicello', 'San Ferdinando', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Contrada Fiolo', 'Laureana di Borrello', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: O.P. Calabria Soc. Coop. a.r.l.';
    END IF;
  END IF;

  -- Ortofrutta F.lli Attisano s.r.l. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Ortofrutta F.lli Attisano s.r.l.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Ortofrutta F.lli Attisano s.r.l.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Seminara', 'Via A. Ferrarese, 9', 'Seminara', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Seminara' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Taurianova', 'Viale San Martino', 'Taurianova', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Taurianova' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Ortofrutta F.lli Attisano s.r.l.';
    END IF;
  END IF;

  -- Prestanicola Giuseppe (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Prestanicola Giuseppe' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Prestanicola Giuseppe') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Località Alario', 'Soriano Calabro', 'VV', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Via Cavaliere Daffinà', 'Soriano Calabro', 'VV', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Prestanicola Giuseppe';
    END IF;
  END IF;

  -- Rocco Guerrisi Costruzioni srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Rocco Guerrisi Costruzioni srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Rocco Guerrisi Costruzioni srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Cittanova', 'Via S.P. 1 KM 19+876', 'Cittanova', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Cittanova' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale Roma', 'Via Tuscolana 741', 'Roma', 'RM', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale Roma' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Rocco Guerrisi Costruzioni srl';
    END IF;
  END IF;

  -- S.E.A. srl  servizi ecologici ambientali (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'S.E.A. srl  servizi ecologici ambientali' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'S.E.A. srl  servizi ecologici ambientali') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Via Pilieri 10', 'Oppido Mamertina', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'via Mazzini 26', 'Oppido Mamertina', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: S.E.A. srl  servizi ecologici ambientali';
    END IF;
  END IF;

  -- Sabatino Trasporti&Logistica (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Sabatino Trasporti&Logistica' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Sabatino Trasporti&Logistica') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Stilo', 'Zona Industriale da Tavoleria Snc', 'Stilo', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Stilo' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Lamezia', 'zona industriale Sir Pad. 13', 'Lamezia Terme', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Lamezia' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Sabatino Trasporti&Logistica';
    END IF;
  END IF;

  -- Sitem Srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Sitem Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Sitem Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Principale', 'Area Industriale PIP C.da Rotoli snc', 'Lamezia Terme', 'CZ', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Principale' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Taranto', 'SS 106 Km 485.651 zona Piccole Imprese', 'Taranto', 'TA', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Taranto' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Sitem Srl';
    END IF;
  END IF;

  -- Società Agricola calabrese srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Società Agricola calabrese srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Società Agricola calabrese srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico VV', 'Contrada Limpidi Acquaro', 'Acquaro', 'VV', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico VV' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'contrada Lago strada Iuldicello Snc', 'San Ferdinando', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Società Agricola calabrese srl';
    END IF;
  END IF;

  -- Soseteg S.R.L. (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Soseteg S.R.L.' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Soseteg S.R.L.') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Via Largo Calopinace', 'Reggio Calabria', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico 2', 'Via Nazionale San Leo', 'Reggio Calabria', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico 2' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Soseteg S.R.L.';
    END IF;
  END IF;

  -- Stil.Tra.Com.Srl Società Unipersonale (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Stil.Tra.Com.Srl Società Unipersonale' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Stil.Tra.Com.Srl Società Unipersonale') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Stilo', 'Contrada Caldarella', 'Stilo', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Stilo' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Lamezia', 'Zona Industriale Papa Benedetto XVI', 'Lamezia Terme', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Lamezia' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Stil.Tra.Com.Srl Società Unipersonale';
    END IF;
  END IF;

  -- Stiltrasporti Distribuzione & Logistica Srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Stiltrasporti Distribuzione & Logistica Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Stiltrasporti Distribuzione & Logistica Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Lamezia', 'Zona Industriale Papa Benedetto XVI snc', 'Lamezia Terme', 'CZ', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Lamezia' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Stilo', 'Contrada Caldarella', 'Stilo', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Stilo' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Stiltrasporti Distribuzione & Logistica Srl';
    END IF;
  END IF;

  -- Tidra Srl (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Tidra Srl' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Tidra Srl') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico Soveria', 'Via Europa Unita, 14', 'Soveria Simeri', 'CZ', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico Soveria' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Legale', 'Piazza del Popolo, 5', 'Zagarise', 'CZ', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Legale' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Tidra Srl';
    END IF;
  END IF;

  -- Trasporti Spirato Carmela (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'Trasporti Spirato Carmela' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'Trasporti Spirato Carmela') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Scarico', 'Contrada Ligoni Snc', 'Reggio Calabria', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Scarico' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede San Ferdinando', 'II Zona Industriale Ex Cedisisa', 'San Ferdinando', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede San Ferdinando' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: Trasporti Spirato Carmela';
    END IF;
  END IF;

  -- UK GROUP S.R.L. - A SOCIO UNICO - (2 sedi)
  SELECT id INTO v_cliente_id FROM clienti WHERE nome ILIKE 'UK GROUP S.R.L. - A SOCIO UNICO -' LIMIT 1;
  IF v_cliente_id IS NOT NULL THEN
    -- Verifica ordini ultimi 2 anni
    SELECT COUNT(*) INTO v_count FROM ordini WHERE (cliente_id = v_cliente_id OR cliente ILIKE 'UK GROUP S.R.L. - A SOCIO UNICO -') AND data >= (CURRENT_DATE - INTERVAL '2 years') AND stato != 'annullato';
    IF v_count > 0 THEN
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede San Ferdinando', 'II Zona Industriale', 'San Ferdinando', 'RC', true, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede San Ferdinando' AND attivo = true);
      INSERT INTO sedi_scarico (cliente_id, nome, indirizzo, citta, provincia, is_default, attivo)
        SELECT v_cliente_id, 'Sede Gioia Tauro', 'Via Pozzillo N 30', 'Gioia Tauro', 'RC', false, true
        WHERE NOT EXISTS (SELECT 1 FROM sedi_scarico WHERE cliente_id = v_cliente_id AND nome = 'Sede Gioia Tauro' AND attivo = true);
      RAISE NOTICE 'Inserite sedi per: UK GROUP S.R.L. - A SOCIO UNICO -';
    END IF;
  END IF;

END $$;

-- Verifica:
-- SELECT c.nome, s.nome as sede, s.indirizzo, s.citta FROM sedi_scarico s JOIN clienti c ON c.id = s.cliente_id WHERE s.attivo = true ORDER BY c.nome, s.is_default DESC;