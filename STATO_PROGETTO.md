# PhoenixFuel Gestionale — Stato al 26/03/2026

## Stack
- Frontend: HTML/CSS/JS statico (app.js ~3750 righe, index.html ~810 righe)
- Backend: Supabase (PostgreSQL + Auth)
- Hosting: Render (auto-deploy da GitHub)
- Supabase URL: https://jpugeakgpitbxdswbucj.supabase.co
- Supabase Key: sb_publishable_xMFZND8_vBl5Z5eEA-2guA_kVME1Iz-
- Progetto locale: C:\Users\rinal\OneDrive\Desktop\progetto

## File principali
app.js, index.html, login.html, style.css, sw.js, manifest.json
Report HTML: report_vendite.html, report_mensile.html, report_acquisti.html, conferma_ordine.html, foglio_viaggio.html, listino_pdf.html, setpassword.html

## Sezioni del gestionale
1. Dashboard — KPI vendite, giacenze deposito
2. Ordini — CRUD con 4 tipi: cliente/entrata_deposito/stazione_servizio/autoconsumo
3. Prezzi giornalieri — per fornitore/base/prodotto, PhoenixFuel da costo medio deposito
4. Deposito — cisterne benzine (KPI solo benzine per fiscale) + magazzino altri prodotti + rettifiche
5. Consegne — conferma ordini, caricamento cisterne deposito
6. Vendite — riepilogo vendite
7. Clienti — CRUD con fido, scheda cliente, pagamenti
8. Fornitori — CRUD con basi associate
9. Basi di carico — CRUD con ✏️ modifica + gestione fornitori associati
10. Prodotti — CRUD dinamico (nome, categoria, IVA, colore, tipo_cisterna)
11. Logistica — vettore→mezzi→autisti, carichi, report viaggi per vettore con proforma
12. Stazione Oppido — 6 tab (dashboard, letture, prezzi pompa, versamenti, magazzino, report)
13. Autoconsumo — cisterna 3000L separata, prelievi verso camion propri, registro stampabile
14. Utenti — gestione ruoli e permessi

## Logica chiave implementata
- **Franco destino/partenza**: trasporto_litro=0 su deposito/stazione → franco destino (conferma diretta). trasporto_litro>0 → franco partenza (logistica)
- **Costo viaggio vettore**: trasporto_litro × litri per ogni ordine del carico
- **Prodotti dinamici**: cacheProdotti da tabella DB, dropdown/colori/tabelle generati dinamicamente
- **Deposito**: KPI (capacità, giacenza, %) contano SOLO cisterne categoria 'benzine'
- **Autoconsumo**: sede 'autoconsumo' separata, non in deposito
- **Stazione**: sede 'stazione_oppido', ricezione con split cisterne
- **caricato_deposito**: flag per tracciare se cisterne caricate (indipendente da stato ordine)
- **Performance**: cache margini, cache prodotti stazione, clienti precaricati, ordini limit(500)

## Tabelle DB principali
- ordini (19.000+ storici) — tipo_ordine, stato, caricato_deposito, ricevuto_stazione, trasporto_litro, costo_ritiro(deprecato)
- cisterne — sede: deposito_vibo | stazione_oppido | autoconsumo
- prodotti — nome, categoria(benzine|altro), colore, tipo_cisterna, ordine_visualizzazione
- carichi, carico_ordini — logistica viaggi
- trasportatori, autisti, mezzi_trasportatori — vettori esterni
- mezzi, scomparti_mezzo — mezzi propri
- stazione_pompe, stazione_letture, stazione_prezzi, stazione_versamenti
- pompe_cisterne — collegamento N:N pompe→cisterne
- rettifiche_inventario — tipo deposito|stazione
- prelievi_autoconsumo — data, mezzo_id, mezzo_targa, litri, note
- prezzi, prezzi_cliente — listini
- clienti, fornitori, basi_carico, fornitori_basi

## PENDING / DA FARE
- SQL autoconsumo da eseguire su Supabase (cisterna + tabella prelievi) - VERIFICARE se già fatto
- Clienti senza indirizzi (importati da Access senza) — aggiungibili via ✏️ o SQL in blocco
- foglio_viaggio.html colori prodotto hardcoded — da rendere dinamico
- 122 ordini Oppido non matchati (date spostate ±1-2 giorni)
- Prodotti storici: solo Gasolio Aut. e Benzina negli ordini, altri non distinguibili
