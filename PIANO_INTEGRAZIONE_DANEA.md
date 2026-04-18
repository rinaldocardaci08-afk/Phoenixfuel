# PIANO INTEGRAZIONE DANEA — PhoenixFuel

**Versione**: 1.0  
**Data**: 17 aprile 2026  
**Stato**: progettazione, non ancora avviato

## OBIETTIVO
Fare coesistere temporaneamente PhoenixFuel e Danea Easyfatt Enterprise importando fatture e pagamenti, senza sostituire Danea. Obiettivo operativo: avere sotto controllo in tempo reale **flusso ordini/fatture**, **fido clienti**, **fido fornitori**, **margini reali**.

## PRINCIPIO GUIDA
**I litri sono l'unità di verità**. Tutti i match ordine↔fattura si basano su `cliente + data (±N gg) + prodotto + litri`. Non su numero conferma (Danea e PhoenixFuel hanno numerazioni separate), non su numero DAS (PhoenixFuel usa applicativo esterno temporaneamente).

Il DAS firmato allegato in PhoenixFuel è quello reale da abbinare alla fattura.

## CHECK IMPORTANTI DA GARANTIRE
1. **Flusso ordini → fatture**: ogni ordine cliente deve avere un fine vita in fattura
2. **Prezzi corretti**: quanto digitato in Danea = quanto calcolato in PhoenixFuel (litri × prezzo)
3. **Fido clienti**: esposizione reale = ordini non fatturati + fatture non incassate
4. **Fido fornitori**: stesso principio sugli acquisti
5. **Margini reali**: CMP × litri vs incasso fattura

---

## FASE 1 — Fondamenta DB + import XML
**Stima**: ~3 ore  
**Priorità**: 1 (bloccante per tutto il resto)

### Tabelle nuove
- `fatture_danea`: numero, data, cliente (nome + P.IVA + CF), totali (imponibile/IVA/totale), metodo_pagamento_raw, metodo_pagamento_std (FK a `pagamenti_standard`), banca, hash_file (per evitare doppioni), created_at, file_import_id
- `pagamenti_danea`: fattura_danea_id, data_scadenza, importo, paid (bool), data_incasso, is_advance, **stato_manuale** ('auto'|'manuale'|'annullato'), note
- `pagamenti_standard`: codice (es. 'rimessa_20gg'), descrizione, giorni, metodo ('contanti'|'bonifico'|'riba'|'assegno'), fine_mese (bool)
- `pagamenti_mapping_danea`: raw_text (es. "Rimessa Diretta 20 gg"), pagamento_standard_id — popolata al primo incontro, editabile
- `import_danea_log`: file_name, hash_file, data_import, utente, n_fatture, n_pagamenti, esito

### Campo nuovo su `ordini`
- `fattura_danea_id` UUID nullable REFERENCES fatture_danea(id)

### Parser + UI
- Parser XML Easyfatt-XML vanilla JS (come resto programma)
- Bottone "📥 Importa Danea" in sezione Fatture → upload .xml/.DefXml
- Anteprima: quante fatture nuove, quante già presenti (hash match), quante pagamenti nuovi/aggiornati
- Conferma → salva

### Risultato
Tabella "Fatture Danea" consultabile, nessun collegamento ordini ancora.

---

## FASE 2 — Matching ordini ↔ fatture clienti
**Stima**: ~3 ore  
**Priorità**: 2

### Algoritmo match "litri-first"
- Esclude `tipo_ordine` IN ('stazione_servizio') — quelli sono corrispettivi, non fatture cliente
- Include cliente + autoconsumo
- Raggruppa ordini per (cliente canonico via P.IVA, data, prodotto, litri)
- Stessa cosa per righe fattura Danea
- Match cascata:
  1. Stessa data + P.IVA + prodotto + litri totali → match 100%
  2. ±1 giorno → match 90%
  3. ±2 giorni → match 70%
  4. Stessa settimana + litri totali combacianti → match 50%
  5. Se nessuno → "non matchato"
- **Criterio secondario**: quando due ordini dello stesso cliente/data/prodotto hanno stessi litri (es. 2 × 5.000 L in giornata per destinazioni diverse), usare `sede_scarico` o `destinazione` come discriminante per evitare match ambigui
- Salva match in tabella `match_ordine_fattura`: ordine_id, fattura_id (oppure **fattura_riga_id** per match 1:N), confidence, metodo_match, manual (bool)

### Gestione raggruppamenti 1:N (VERIFICARE CON CHIARA PRIMA)
Chiara fa fatture raggruppate quindicinali/mensili per alcuni clienti (una fattura = N DDT)?
Se SÌ → la tabella match deve essere relazione **molti-a-molti**: più ordini PhoenixFuel possono puntare a una stessa fattura Danea (magari a righe diverse). 
Se NO → match 1:1 semplice come sopra.
**Azione**: chiedere a Chiara prima di scrivere codice — cambia l'architettura della tabella.

### Apprendimento da feedback manuale
Quando Chiara fa match manuale (forza associazione sfuggita all'algoritmo), salvare la "regola":
- Tabella `match_regole_cliente`: cliente_id, pattern ("litri con scarto fino a N", "±3 gg", "prodotto alias X"), attiva (bool)
- Al prossimo import, il motore legge queste regole per quel cliente e applica tolleranze ad hoc
- Esempio: cliente X ha sempre scarto di 500 L (cali tecnici), il sistema lo sa e non chiede più conferma
- Evita lavoro ripetuto ogni mese

### UI "Flusso ordini → fatture"
Nuova tab in Logistica o sezione Fatture. 4 schede:
- Ordini senza fattura (filtro età giorni)
- Fatture senza ordine
- Match automatici ad alta confidence
- Match manuali da validare (confidence < 90%)
- Bottone "Forza match manuale" + "Ignora match"

### Risultato
Visibilità completa su cosa manca, cosa è in più, cosa è allineato.

---

## FASE 3 — Controllo prezzi + margini reali
**Stima**: ~1.5 ore  
**Priorità**: 5

- Per ogni ordine matchato: calcola `delta = ordine.totale - fattura.totale`
- Soglia configurabile (es. ±€1 o ±0.5%)
- Se supera soglia → flag "anomalia prezzo"
- Report "Margini reali" per periodo: `(fattura.totale - costo_CMP × litri) / fattura.totale`
- Filtri: cliente, prodotto, data, fornitore carico

---

## FASE 4 — Fido clienti tempo reale
**Stima**: ~2 ore  
**Priorità**: 3 (ALTO GUADAGNO OPERATIVO)

### Formula esposizione reale
```
esposizione_cliente = 
    SUM(ordini non ancora in Danea) 
  + SUM(fatture Danea con pagamenti non_paid o saldo residuo)
  - SUM(pagamenti paid non ancora riflessi su ordini)
```

### Tolleranza comportamentale cliente
Non tutti i clienti sono uguali. Clienti storici pagano sistematicamente a 90gg anche se fattura dice 60gg: sarebbero sempre in rosso con calcolo secco.
- Campo nuovo su `clienti`: `tolleranza_giorni_pagamento` (default 0, editabile da admin)
- L'esposizione pesa "normalmente" se il ritardo è entro tolleranza
- Oltre tolleranza → penalità sul fido residuo proporzionale ai giorni di sforamento
- Così il semaforo riflette il **rischio reale**, non il rigore teorico

### Visualizzazione
- Anagrafica clienti: colonna "Esposizione reale" + "Fido residuo" + semaforo (verde >30%, giallo 10-30%, rosso <10%)
- **Modale nuovo ordine**: al cambio cliente → pop-up semaforo fido con messaggio ("Fido 60%, restano €12.450") — se rosso, richiede conferma admin prima di salvare
- Sentinella giornaliera "clienti_oltre_fido"

### Indicatore freshness dato
Critico per evitare che Simone prenda ordini basandosi su dati obsoleti.
- Sulla card cliente (e nel modale nuovo ordine), mostrare "Ultimo import Danea: X ore fa"
- Se > 24 ore (o giorno lavorativo successivo) → banner giallo "Dato non aggiornato, verificare manualmente"
- Se > 48 ore → banner rosso
- Protegge da responsabilità: il venditore sa quando fidarsi del sistema e quando telefonare a Chiara

---

## FASE 5 — Import fatture fornitori
**Stima**: ~2 ore  
**Priorità**: 6

- XML fornitori dalla sezione separata di Danea
- Tabelle `fatture_danea_fornitori` + `pagamenti_danea_fornitori` (struttura gemella)
- Match con `tipo_ordine = 'entrata_deposito'` usando stessa logica litri-first su P.IVA fornitore

---

## FASE 6 — Fido fornitori + alert acquisto
**Stima**: ~1.5 ore  
**Priorità**: 7

- Formula esposizione fornitore (acquisti non saldati)
- Alert quando si crea nuovo ordine di acquisto Eni/Ludoil/Q8 oltre fido concesso
- Visualizzazione nella card fornitore

---

## FASE 7 — Automatismo + alert bacheca
**Stima**: ~1.5 ore  
**Priorità**: 4

### Automatismo con finestra di tolleranza (NO "grido al lupo")
- Edge Function schedulata (es. 18:00 giorni lavorativi)
- **NON** manda avviso ogni sera: verifica ordini non ancora in Danea solo se **più vecchi di N giorni** (configurabile, default 3-4 giorni)
- Chiara fattura ogni 2-3 giorni in giornate normali → se l'avviso parte la sera stessa, si assuefà e smette di leggerlo
- L'avviso scatta solo quando c'è **davvero** un ritardo anomalo
- Meglio avviso raro e rumoroso che giornaliero e ignorato
- Pop-up al login operatori contabilità se ci sono avvisi importazione pendenti

### Sentinella disallineamento
Dopo ogni import Danea, la sentinella "disallineamento" verifica:
- Ordini con pagato=true ma fattura Paid=false → segnalazione
- Ordini con pagato=false ma fattura Paid=true → segnalazione (importo + data)
- Ordini con delta importo > soglia → segnalazione
- Output: avviso bacheca con lista anomalie → operatore sceglie dove intervenire (programma o Danea)

### Tracking anomalie risolte (CRITICO per non impazzire)
Se non memorizziamo quali anomalie sono già state gestite, ogni import ripresenta gli stessi mille avvisi. Dopo 3 giorni nessuno li guarda più.
- Nuova tabella `anomalie_risolte`:
  - `anomalia_id` (hash deterministico della tupla `ordine_id + fattura_id + tipo_anomalia`)
  - `risolta_da` (utente)
  - `data_risoluzione`
  - `decisione` ('corretto_programma' | 'corretto_danea' | 'accettata_differenza' | 'ignora_sempre')
  - `nota` (testo libero)
- La sentinella distingue "anomalia nuova" da "anomalia già risolta in precedenza"
- Mostra in bacheca solo le nuove. Se una rientra, è perché qualcosa è cambiato e va rivista.
- Filtro UI "Mostra anche anomalie risolte" per storico completo

---

## TABELLA PAGAMENTI STANDARD — esempio base iniziale

Da popolare manualmente la prima volta, poi espandibile.

| codice | descrizione | giorni | metodo | fine_mese |
|---|---|---|---|---|
| rimessa_diretta | Rimessa diretta immediata | 0 | contanti | false |
| rimessa_5 | Rimessa 5 giorni | 5 | bonifico | false |
| rimessa_10 | Rimessa 10 giorni | 10 | bonifico | false |
| rimessa_20 | Rimessa 20 giorni | 20 | bonifico | false |
| rimessa_30 | Rimessa 30 giorni | 30 | bonifico | false |
| rimessa_60 | Rimessa 60 giorni | 60 | bonifico | false |
| rimessa_80 | Rimessa 80 giorni | 80 | bonifico | false |
| rimessa_90 | Rimessa 90 giorni | 90 | bonifico | false |
| bonifico_anticipato | Bonifico anticipato | -1 | bonifico | false |
| bonifico_15 | Bonifico 15 giorni | 15 | bonifico | false |
| bonifico_30 | Bonifico 30 giorni | 30 | bonifico | false |
| bonifico_45 | Bonifico 45 giorni | 45 | bonifico | false |
| bonifico_60 | Bonifico 60 giorni | 60 | bonifico | false |
| bonifico_60_fm | Bonifico 60 gg fine mese | 60 | bonifico | true |
| bonifico_90_fm | Bonifico 90 gg fine mese | 90 | bonifico | true |
| riba_70 | RIBA 70 giorni | 70 | riba | false |
| riba_generica | RIBA (giorni variabili) | null | riba | false |
| assegno | Assegno | 0 | assegno | false |

La tabella `pagamenti_mapping_danea` associa ogni variante testuale Danea al codice standard. Al primo import, Chiara risolve i casi non mappati una tantum.

---

## ORDINE ESECUZIONE CONSIGLIATO
1. **FASE 1** — fondamenta
2. **FASE 2** — matching ordini/fatture
3. **FASE 4** — fido clienti tempo reale (ALTO GUADAGNO)
4. **FASE 7** — automatismo + sentinella disallineamento
5. **FASE 3** — controllo prezzi + margini
6. **FASE 5** — import fornitori
7. **FASE 6** — fido fornitori

## STIMA TOTALE
**~15 ore di lavoro effettivo** spezzate in 7 sessioni indipendenti.

**Stima realistica con imprevisti**: ~20 ore distribuite su 3-4 settimane (1-2 sessioni/settimana). Piani di questa complessità sforano tipicamente del 30-40% per bug emersi dai test, casi particolari da gestire, raffinamenti richiesti dall'uso reale.

Meglio ragionare per **fasi chiuse e rilasciate** che per deadline globale.

---

## VISIONE LUNGO TERMINE (post-integrazione Danea)

L'integrazione Danea + refactoring deposito sono i prerequisiti per arrivare a una vera **differenziazione competitiva di mercato**: un'app cliente (PWA prima, nativa dopo) che nessun concorrente distributore carburanti in Calabria/Sud Italia oggi offre.

### App cliente — funzioni target
- **Prezzi personalizzati del giorno** per fascia contrattuale
- **Ordine in 2 click** dalle sedi già censite → backend come tipo_ordine=cliente stato "richiesta"
- **Fido residuo visibile** (trasparenza = fiducia)
- **Storico acquisti**: DAS, fatture scaricabili, litri annui, andamento prezzi pagati
- **Benchmark ICE Gasoil + future** con indicazione trend (risponde alla domanda implicita "conviene comprare oggi?")
- **Push strategiche**: scadenza fatture, segnali rialzo mercato, nuovo listino
- Eventuale area documenti PDF

### Sequenza consigliata
1. PWA pilota con 2-3 clienti fiducia → test senza store
2. Se funziona dopo 6 mesi → nativa iOS+Android

### Perché è differenziante
Oggi i clienti carburanti ricevono prezzi per WhatsApp/telefono. Un'app che dà loro visibilità su storico + fido + trend mercato sposta la percezione da "fornitore" a "partner strategico".

### Stima (indicativa, da rivedere)
- PWA: 40-60 ore
- Nativa: 150-250 ore

**Non ora, ma è la direzione.** Tutto quello che costruiamo oggi (matching litri-first, fido in tempo reale, margini reali) serve ANCHE a rendere quest'app possibile domani.

## VINCOLI / NOTE
- Ogni fase deve essere **rilasciabile da sola** senza rompere funzionalità esistenti
- Ogni fase deve avere **rollback facile** (no modifiche distruttive DB)
- Prima di ogni fase: snapshot manuale
- Test con dati reali (Chiara) al termine di ogni fase prima di passare alla successiva
