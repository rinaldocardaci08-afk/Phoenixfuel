// v20261029b — barra CO₂: dopo la passata resta ferma 20 secondi prima di ricominciare (prima 4).
// v20261029a — RIEPILOGO IMPIANTO: potenza, produzione stimata, resa e la barra animata CO₂ → alberi e case
//   illuminate (_pfCO2Html, usata anche da pf-fotovoltaico.js per gli impianti venduti).
// v20261028c — RATE: nessuna rata predefinita (prima 30/50/20 se non salvate); si possono anche togliere tutte.
// v20261028b — MASTRINO A LINGUETTE, unico per impianti nostri e venduti (_pfMastrino, usato anche da
//   pf-fotovoltaico.js): in alto riquadri e due barre (fatturato e pagato sul pattuito), sotto le linguette
//   Fatture · Pagamenti · Saldo dare/avere, e qui anche Resoconto cantiere.
// v20261028a — FATTURE DEL FORNITORE nel mastrino: si registrano a mano sul contratto
//   (＋ Fattura fornitore: numero, data, imponibile, IVA, rata facoltativa, nota) e ogni
//   pagamento del foglio giornale si collega a una fattura (colonna "Fattura pagata" del
//   mastrino, ✏️ sulla spesa, o gia' quando si imputa). Ogni fattura mostra pagato, residuo
//   e stato (pagata / acconto / da pagare); i pagamenti senza fattura restano acconti.
//   Il saldo del mastrino parte sempre dal contratto. Numero e data non si scrivono piu'
//   sulle rate: quelli gia' scritti si vedono come fatture "dalla rata" fino a ✏️.
//   SQL: investimenti_preventivi.fatture jsonb, foglio_giornale_movimenti.investimento_fattura text.
// ═══════════════════════════════════════════════════════════════════════════
// pf-investimenti.js — INVESTIMENTI (Finanze)
// v20261023d — SUBTOTALE PER FORNITORE: il gruppo si riconosce dal nome del fornitore senza
//   forma societaria e senza maiuscole ("Ormus Plant" e "ORMUS PLANT S.R.L." sono lo stesso
//   gruppo) e prende il nome come scritto in Fornitori FV. Il trattino separa fornitore e
//   cosa anche senza spazio dopo ("Ormus Plant -Impianto").
// v20261023c — (1) IMPIANTI VENDUTI: si leggono TUTTI gli impianti con destinazione
//   'vendita', di qualsiasi causale (Palmi spariva perche' la pagina vendite leggeva solo la
//   causale selezionata). (2) FORNITORE OBBLIGATORIO sulla spesa: menu con i Fornitori FV
//   (fv_fornitori) piu' "Generico"; la voce si salva come "Fornitore – cosa" cosi' l'elenco
//   raggruppa e fa il subtotale per fornitore senza saltarne. (3) MASTRINO: il saldo e' il
//   RESIDUO DA PAGARE in negativo. Riga contratto = −totale con IVA; ogni pagamento lo
//   riduce (es. −78.000 → pagamento 20.000 → −58.000). Fatture e rate previste restano come
//   riferimento, senza saldo.
// v20261023b — PAGINA RIFATTA A LINGUETTE (layout B scelto da Rinaldo il 23/10).
//   · Due modi: 'nostri' (Fotovoltaico → ☀️ Investimenti, box #inv-content) e 'vendita'
//     (Fotovoltaico → 🤝 Vendita a clienti → Impianti venduti, box #inv-vend-content).
//   · Investimenti: 4 numeri in testa e linguette IMPIANTI (celle) · RISORSE · SPESE
//     (con il numero di quelle da imputare) · TEMPISTICHE (diagramma lavori/pagamenti).
//   · Gli impianti 'vendita' (Palmi) NON stanno piu' qui e NON pesano su prenotato, speso
//     e risorse libere: i soldi delle banche sono per gli investimenti.
//   · Scheda di ogni impianto a linguette: Riepilogo · Spese · Mastrino · Preventivi ·
//     Conto economico · Produzione (le ultime due solo per gli impianti nostri).
// v20261023a — MASTRINO FORNITORE nella scheda impianto. Il contratto e' il PREVENTIVO
//   SCELTO (fornitore + imponibile); sul preventivo si salvano anche aliquota IVA e rate
//   (default 30% firma / 50% merce pronta / 20% collaudo) con numero e data della fattura
//   quando arriva (colonne nuove investimenti_preventivi.aliquota_iva e .rate jsonb).
//   AVERE = rate fatturate (righe piene) e rate ancora previste (in grigio);
//   DARE = pagamenti gia' imputati all'impianto la cui voce contiene il nome del fornitore
//   (nessuna doppia registrazione). Saldo progressivo a debito. Sotto, RESOCONTO
//   preventivo contro fatturato e pagato per gruppo di spesa, sul budget dell'impianto.
// v20261009b — ✏️ della SPESA: oltre alla voce si correggono DATA, IMPORTO CON IVA e
//   ALIQUOTA; l'imponibile si ricalcola e si salva sulla STESSA riga del foglio giornale
//   (nessuna copia: il foglio giornale lo vede gia' cambiato). Conto e metodo restano
//   modificabili solo dal foglio giornale. Ovunque si vede anche il totale CON IVA, che
//   e' quanto esce dalla banca; nel conto economico entra solo l'imponibile.
// v20261009a — VIA LE VOCI DI COSTO FISSE. L'impianto ha un solo budget (spesa prevista)
//   e un ELENCO SPESE: ogni pagamento imputato porta come voce il suo testo libero
//   (foglio_giornale_movimenti.nota_imputazione, scritto in foglio giornale e correggibile
//   qui con ✏️). Le spese si raggruppano per la parte di testo prima del trattino
//   ("Ormus Plant – rata alla firma" e "Ormus Plant – saldo" → gruppo "Ormus Plant") con
//   subtotale. In "Spese da imputare" la voce e' una casella di testo gia' riempita con la
//   nota. La tabella investimenti_voci resta in database ma non si usa piu'; la conferma
//   d'ordine prende l'importo dal preventivo scelto.
// v20261008f — VOCI DI COSTO nella scheda impianto: riga "Pagamenti senza voce" (imputati
//   all'impianto ma non a una voce: prima finivano solo nel totale e le righe non tornavano)
//   e sotto il totale quanto e' uscito davvero CON IVA, da confrontare con l'estratto conto.
// v20261008e — (1) SPESE DA IMPUTARE: sotto ogni movimento la NOTA PER L'IMPUTAZIONE
//   scritta in foglio giornale (colonna foglio_giornale_movimenti.nota_imputazione); se
//   nella nota o nella descrizione c'e' il nome di un impianto, l'impianto e' gia' proposto.
//   Sulla riga si sceglie anche la VOCE DI COSTO e si conferma con "✓ Imputa".
//   (2) TEMPISTICHE rifatte: per ogni impianto una LINEA dei lavori sul calendario (pieno
//   fino a oggi, pallino di fine e di allaccio) e SOTTO una BARRA SEPARATA dei pagamenti
//   sul costo previsto; a destra tempo trascorso, giorni mancanti, pagato e resto.
// v20261008d — STAMPA / PDF del conto economico completo: pulsante nel modale, apre il
//   documento A4 orizzontale su fondo bianco (intestazione, ipotesi, finanziamento, indici,
//   tabella anni Cantiere+1-13 in prima pagina e 14-25 + totale in seconda) e lancia la
//   stampa: da li' "Salva come PDF".
// v20261008c — PREZZO DELL'ENERGIA (PUN) modificabile per impianto a FASCE DI 5 ANNI
//   (anni 1-5, 6-10, 11-15, 16-20, 21-25): 5 valori nel riquadro "Ipotesi" del conto
//   economico completo, salvati in investimenti_impianti.pun_fasce (numeric[5]). Una fascia
//   lasciata vuota usa il prezzo di base (0,116 anni 1-4, 0,100 5-10, 0,090 11-16, 0,080
//   17-25). Produzione stimata e PUN si salvano insieme con un solo pulsante.
// v20261008b — (1) PRODUZIONE STIMATA per impianto (kWh/anno, es. da PVGIS): si scrive
//   nella scheda impianto (✏️ Modifica) o direttamente nel conto economico completo, e
//   sostituisce kW × kWh/kW come produzione del 1° anno (poi il degrado). Colonna nuova
//   investimenti_impianti.produzione_stimata_kwh. (2) Costi operativi di base 1.500 €/anno
//   fissi (contratto manutenzione 600 + 900 guasti/assicurazioni), senza accantonamento
//   dal 6° anno; i parchi tengono i loro valori nelle note. (3) Nella CASSA si parte dal
//   RISULTATO DELL'ANNO, si aggiunge l'ammortamento e si toglie il capitale restituito:
//   la rata intera sta solo nella copertura della rata, cosi' non sembra contata due volte.
// v20261008a — CONTO ECONOMICO COMPLETO in modale grande (pulsante nella scheda
//   impianto): CE a 25 anni con INTERESSI del mutuo, CASSA (EBITDA + CER − rata) con
//   cumulata, COPERTURA DELLA RATA (DSCR solo energia e con CER) e INDICI (DSCR minimo,
//   rientro investimento e mezzi propri, TIR, VAN al TAN, costo del kWh). La rata e' una
//   QUOTA delle rate vere dei mutui collegati alle risorse, in proporzione alla spesa
//   prevista sul totale risorse. Ante imposte, prezzo dell'energia del piano attuale.
// v20261006a — nella schermata centrale, sotto le spese degli impianti, due riquadri
//   nuovi: SPESE DI COMMESSA da imputare a un CONTRATTO (impianti venduti) e INCASSI
//   da collegare al contratto. Cosi' tutto si imputa da dove si apre la pagina.
// v20261005o — Investimenti mostra solo le causali di AMBITO 'investimenti' (impianti
//   di nostra proprieta'). Le spese del ramo VENDITE (acquisto impianti per rivendita,
//   provvigioni) si imputano al CONTRATTO, nella sezione Contratti.
// v20261005n — la tendina in alto mostra solo le causali di SPESA (tipo='spesa'):
//   quelle di incasso servono sulle entrate del foglio giornale e aprivano la pagina
//   su una causale senza impianti, facendo sembrare persi i dati.
// v20261005m — PRODUZIONE REALE per impianto: data di allaccio alla rete (da quando
//   siamo produttori) e, anno per anno, kWh prodotti, €/kWh riconosciuto dal GSE e
//   contributo CER incassato, messi a confronto con il conto economico previsionale.
// v20261005l — barra di avanzamento dei PAGAMENTI sotto le voci di costo: quanto
//   abbiamo gia' pagato rispetto al costo totale dell'opera, col residuo da pagare.
// v20261005i — scelta del fornitore DEFINITIVA: quando un preventivo e' scelto gli
//   altri non si possono piu' selezionare (niente pulsante "scegli"); restano a
//   memoria del confronto. Per cambiare davvero si elimina il preventivo scelto.
// v20261005h — popup del finanziamento rifatto (versione B: fascia blu con capitale,
//   sezioni Condizioni / Preammortamento / Rata / Avanzamento) e aliquota IVA della
//   conferma d'ordine chiesta ogni volta, proposta al 10%.
// v20261005g — CONFERMA D'ORDINE AL FORNITORE per impianto: dal preventivo scelto
//   si genera il documento da mandare al fornitore (dati delle parti, oggetto,
//   descrizione, imponibile/IVA/totale, quote di pagamento, firme).
// v20261005f — blocco PREVENTIVI RICEVUTI nella scheda impianto: i preventivi dei
//   fornitori sullo stesso impianto, con quello scelto in evidenza, cosi' resta
//   scritto il confronto (es. Mungo Bus: Ormus 91.000 scelto, NovaPower 85.000).
// v20261005e — (1) cliccando la riga di una risorsa-mutuo si apre un popup con le
//   CARATTERISTICHE del finanziamento (senza piano di rientro); (2) nella scheda di
//   ogni impianto: Gantt del singolo e CONTO ECONOMICO PREVISIONALE a 10 anni + 25
//   anni per blocchi, con le ipotesi del piano (produzione per kW, degrado, prezzo
//   dell'energia per fasce, costi operativi, accantonamento, ammortamento, CER).
// v20261005d — lo switch delle linguette e il punto d'ingresso della sezione sono
//   passati a pf-fotovoltaico.js: qui resta solo la pagina Investimenti.
// v20261005c — nel Gantt: linea di oggi e percentuale di spesa sul totale previsto degli impianti a diagramma
// v20261005b — la sezione vive ora sotto ☀️ Fotovoltaico (camera stagna), non in Finanze;
//   aggiunto switchFvSubTab per le linguette del ramo.
// v20261005a — 05/10/2026
//
// COME FUNZIONA (regole fissate con Rinaldo):
//  · In foglio giornale l'uscita porta solo la CAUSALE del ramo e l'IVA; il
//    programma ne salva l'IMPONIBILE (l'IVA e' partita di giro e resta fuori
//    da tutti i totali di questa pagina).
//  · L'impianto a cui imputare la spesa si sceglie QUI. Finche' non lo si fa,
//    la spesa e' nel totale del ramo come "spesa generale non imputata".
//    Ogni riga ha anche "lascia come spesa generale": esce dall'elenco da
//    imputare e resta un costo comune del ramo (consulenze, oneri condivisi).
//  · RISORSE = mutui + liquidita' destinata + apporti + INCASSI del ramo
//    (entrate con la stessa causale: la vendita di un impianto rimette
//    disponibilita' per i successivi).
//  · PRENOTATO = somma delle spese previste degli impianti.
//  · Il Gantt compare SOLO se almeno un impianto ha data inizio e fine.
// Nessun calcolo nuovo altrove: tutto parte da foglio_giornale_movimenti.
// ═══════════════════════════════════════════════════════════════════════════

var _invCausale = null;        // causale selezionata
var _invDati = null;           // { causali, risorse, impianti, voci, movimenti }
var _invImpiantoAperto = null; // scheda del singolo impianto
var _invModo = 'nostri';       // v20261023b — 'nostri' (Investimenti) o 'vendita' (Impianti venduti)
var _invTab = 'impianti';      // linguetta della pagina: impianti | risorse | spese | tempi
var _invTabImp = 'riepilogo';  // linguetta della scheda impianto
function _invBox() { return document.getElementById(_invModo === 'vendita' ? 'inv-vend-content' : 'inv-content'); }
function _invIsVend(i) { return i && i.destinazione === 'vendita'; }
function _invImpiantiModo() {
  return ((_invDati && _invDati.impianti) || []).filter(function (i) { return _invModo === 'vendita' ? _invIsVend(i) : !_invIsVend(i); });
}

var _INV_STATI = {
  previsto:     { lab: 'Previsto',     col: '#5F5E5A', bg: '#F1EFE8' },
  in_corso:     { lab: 'In corso',     col: '#633806', bg: '#FAEEDA' },
  collaudato:   { lab: 'Collaudato',   col: '#0C447C', bg: '#E6F1FB' },
  in_esercizio: { lab: 'In esercizio', col: '#27500A', bg: '#EAF3DE' }
};
var _INV_CATEGORIE = [
  ['fornitura', 'Fornitura / impianto'], ['progettazione', 'Progettazione'],
  ['contatore_allaccio', 'Contatore e allaccio'], ['notaio', 'Notaio'],
  ['pratiche', 'Pratiche e autorizzazioni'], ['direzione_lavori', 'Direzione lavori'],
  ['opere_civili', 'Opere civili'], ['altro', 'Altro']
];

function _invEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _invEuro(v) {
  return '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _invEuroK(v) {
  return '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 });
}
function _invData(iso) {
  if (!iso) return '—';
  var s = String(iso).slice(0, 10).split('-');
  return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : String(iso);
}
function _invPuo() {
  if (typeof utenteCorrente === 'undefined' || !utenteCorrente) return false;
  if (utenteCorrente.ruolo === 'admin') return true;
  return (typeof _haPermesso === 'function') ? !!_haPermesso('finanze') : false;
}

// ── CARICAMENTO ────────────────────────────────────────────────────────────
async function caricaInvestimenti(modo) {
  if (modo === 'nostri' || modo === 'vendita') { if (modo !== _invModo) { _invTab = 'impianti'; } _invModo = modo; }
  var box = _invBox();
  if (!box) return;
  box.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">Caricamento…</div>';
  try {
    var rc = await sb.from('causali_investimento').select('*').eq('attiva', true).order('nome');
    var tutte = rc.data || [];
    // solo le causali di spesa: le 'incasso' si usano sulle entrate del foglio giornale
    var causali = tutte.filter(function (c) {
      return (c.tipo || 'spesa') === 'spesa' && (c.ambito || 'investimenti') === 'investimenti';
    });
    if (!causali.length) causali = tutte.filter(function (c) { return (c.tipo || 'spesa') === 'spesa'; });
    if (!causali.length) causali = tutte;
    if (!causali.length) {
      box.innerHTML = '<div class="card" style="padding:20px;font-size:13px">Nessuna causale di investimento impostata.</div>';
      return;
    }
    if (!_invCausale || !causali.some(function (c) { return c.id === _invCausale; })) _invCausale = causali[0].id;

    var _invColsMov = 'id,data,tipo,importo,imponibile,aliquota_iva,descrizione,banca_id,metodo,note,nota_imputazione,investimento_impianto_id,investimento_voce_id,investimento_fattura';
    var _qMov = function (cols) {
      return _invModo === 'vendita'
        ? sb.from('foglio_giornale_movimenti').select(cols).not('investimento_impianto_id', 'is', null).order('data', { ascending: false })
        : sb.from('foglio_giornale_movimenti').select(cols).eq('causale_investimento_id', _invCausale).order('data', { ascending: false });
    };
    var r = await Promise.all([
      sb.from('investimenti_risorse').select('*').eq('causale_id', _invCausale),
      (_invModo === 'vendita'
        ? sb.from('investimenti_impianti').select('*').eq('destinazione', 'vendita').order('nome')
        : sb.from('investimenti_impianti').select('*').eq('causale_id', _invCausale).order('nome')),
      sb.from('fv_fornitori').select('id,ragione_sociale').order('ragione_sociale'),
      _qMov(_invColsMov),
      sb.from('banche_finanziamenti').select('id,descrizione,capitale,tasso,durata_rate,rate_preammortamento,data_prima_rata,numero_contratto'),
      sb.from('investimenti_preventivi').select('*').order('data'),
      sb.from('investimenti_produzione').select('*').order('anno'),
      sb.from('fv_contratti').select('id,numero,anno,cliente_nome,sito_installazione,stato').order('anno', { ascending: false }).order('numero', { ascending: false }),
      sb.from('foglio_giornale_movimenti')
        .select('id,data,tipo,importo,imponibile,aliquota_iva,descrizione,causale_investimento_id,fv_contratto_id')
        .not('causale_investimento_id', 'is', null).is('fv_contratto_id', null)
    ]);
    // colonna investimento_fattura non ancora creata: ricarico i movimenti senza
    var noColFatt = false;
    if (r[3] && r[3].error && /investimento_fattura/.test(r[3].error.message || '')) {
      noColFatt = true;
      r[3] = await _qMov(_invColsMov.replace(',investimento_fattura', ''));
    }
    if (r[3] && r[3].error) throw new Error(r[3].error.message);
    _invDati = {
      noColFatt: noColFatt,
      causali: causali,
      risorse: r[0].data || [],
      impianti: r[1].data || [],
      voci: [],
      fornitori: ((r[2] && r[2].data) || []).map(function (f) { return f.ragione_sociale; }).filter(Boolean),
      movimenti: r[3].data || [],
      finanziamenti: r[4].data || [],
      preventivi: (r[5] && r[5].data) || [],
      produzione: (r[6] && r[6].data) || [],
      contratti: (r[7] && r[7].data) || [],
      movVendite: (((r[8] && r[8].data) || []).filter(function (m) {
        var c = (tutte || []).filter(function (x) { return x.id === m.causale_investimento_id; })[0];
        return c && (c.ambito || 'investimenti') === 'vendite';
      }))
    };
    _invImpiantoAperto = null;
    _invRender();
  } catch (e) {
    box.innerHTML = '<div class="card" style="padding:20px;color:#A32D2D;font-size:13px">Errore: ' + _invEsc(e && e.message) + '</div>';
  }
}

function invCambiaCausale(id) { _invCausale = id; caricaInvestimenti(); }

// ── CONTI ──────────────────────────────────────────────────────────────────
// Imponibile del movimento: se manca si ricava dall'importo con l'aliquota.
function _invImponibile(m) {
  if (m.imponibile != null) return Number(m.imponibile);
  var iva = Number(m.aliquota_iva || 0);
  return Number(m.importo || 0) / (1 + iva / 100);
}
function _invConti() {
  var D = _invDati;
  var usc = D.movimenti.filter(function (m) { return m.tipo === 'uscita'; });
  var ent = D.movimenti.filter(function (m) { return m.tipo === 'entrata'; });
  var speseImp = {}, spesoImputato = 0, spesoGenerale = 0, daImputare = [];
  // v20261023b — gli impianti costruiti per la vendita hanno le loro spese ma non
  // consumano le risorse degli investimenti (mutui e mezzi propri)
  var vend = {};
  (D.impianti || []).forEach(function (i) { if (_invIsVend(i)) vend[i.id] = true; });
  var spesoVendita = 0;
  usc.forEach(function (m) {
    var imp = _invImponibile(m);
    if (m.investimento_impianto_id) {
      if (vend[m.investimento_impianto_id]) spesoVendita += imp; else spesoImputato += imp;
      (speseImp[m.investimento_impianto_id] = speseImp[m.investimento_impianto_id] || []).push(m);
    } else if (String(m.note || '').indexOf('[spesa generale]') >= 0) {
      spesoGenerale += imp;
    } else {
      daImputare.push(m);
    }
  });
  var incassi = ent.reduce(function (s, m) { return s + _invImponibile(m); }, 0);
  var risorse = D.risorse.reduce(function (s, r) { return s + Number(r.importo || 0); }, 0);
  var prenotato = D.impianti.reduce(function (s, i) { return s + (_invIsVend(i) ? 0 : Number(i.spesa_prevista || 0)); }, 0);
  var daImputareTot = daImputare.reduce(function (s, m) { return s + _invImponibile(m); }, 0);
  return {
    risorse: risorse, incassi: incassi, disponibili: risorse + incassi,
    prenotato: prenotato, spesoImputato: spesoImputato, spesoGenerale: spesoGenerale,
    daImputare: daImputare, daImputareTot: daImputareTot,
    spesoTotale: spesoImputato + spesoGenerale + daImputareTot,
    speseImp: speseImp, spesoVendita: spesoVendita
  };
}
function _invSpesoImpianto(impId) {
  var c = _invConti();
  return (c.speseImp[impId] || []).reduce(function (s, m) { return s + _invImponibile(m); }, 0);
}

// ── PAGINA GENERALE ────────────────────────────────────────────────────────
function _invRender() {
  var box = _invBox();
  if (!box || !_invDati) return;
  if (_invImpiantoAperto) { _invRenderImpianto(); return; }
  if (_invModo === 'vendita') { _invRenderVendita(box); return; }
  var D = _invDati, C = _invConti();
  var libere = C.disponibili - C.prenotato;
  var nostri = _invImpiantiModo();

  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
  h += '<div><div style="font-size:17px;font-weight:700">☀️ Investimenti</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Solo gli impianti nostri. Le spese arrivano dal foglio giornale con la causale scelta.</div></div>';
  h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  h += '<select onchange="invCambiaCausale(this.value)" style="font-size:12.5px;padding:7px 11px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-weight:600">'
    + D.causali.map(function (c) { return '<option value="' + c.id + '"' + (c.id === _invCausale ? ' selected' : '') + '>' + _invEsc(c.nome) + '</option>'; }).join('')
    + '</select>';
  h += '</div></div>';

  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:6px">'
    + _invKpi('Risorse disponibili', _invEuroK(C.disponibili), C.incassi ? 'di cui incassi ' + _invEuroK(C.incassi) : D.risorse.length + ' voci')
    + _invKpi('Prenotato dagli impianti', _invEuroK(C.prenotato), nostri.length + ' impianti nostri')
    + _invKpi('Speso (imponibile)', _invEuroK(C.spesoTotale), 'imputato ' + _invEuroK(C.spesoImputato) + (C.daImputareTot ? ' · da imputare ' + _invEuroK(C.daImputareTot) : ''), '#A32D2D')
    + _invKpi('Ancora libere', _invEuroK(libere), libere < 0 ? 'prenotato oltre le risorse' : 'risorse − prenotato', libere < 0 ? '#A32D2D' : '#27500A')
    + '</div>';

  var tabs = [
    { k: 'impianti', lab: '☀️ Impianti' },
    { k: 'risorse', lab: '🏦 Risorse' },
    { k: 'spese', lab: '🧾 Spese', n: C.daImputare.length },
    { k: 'tempi', lab: '📅 Tempistiche' }
  ];
  h += _invBarraTab(tabs, _invTab, 'invVaiTab');

  if (_invTab === 'risorse') h += _invPannelloRisorse(D, C);
  else if (_invTab === 'spese') h += _invPannelloSpese(D, C);
  else if (_invTab === 'tempi') h += (_invGantt(nostri) || '<div class="card" style="padding:14px;font-size:12px;color:var(--text-muted)">Il diagramma compare quando almeno un impianto ha data di inizio e di fine (✏️ Modifica nella scheda).</div>');
  else h += _invCelle(nostri, '+ Nuovo impianto', 'proprio');

  box.innerHTML = h;
}

function invVaiTab(k) { _invTab = k; _invRender(); }

function _invKpi(lab, val, sub, col) {
  return '<div style="flex:1;min-width:150px;background:var(--bg-card,var(--bg));border:0.5px solid var(--border);border-radius:10px;padding:11px 13px">'
    + '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
    + '<div style="font-family:var(--font-mono);font-size:19px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div>'
    + '<div style="font-size:10.5px;color:var(--text-muted)">' + (sub || '&nbsp;') + '</div></div>';
}

// barra di linguette: tabs = [{k, lab, n}], fn = nome della funzione da chiamare col k
function _invBarraTab(tabs, attiva, fn) {
  var h = '<div style="display:flex;gap:4px;border-bottom:1.5px solid var(--border);margin:12px 0 12px;flex-wrap:wrap">';
  tabs.forEach(function (t) {
    var on = t.k === attiva;
    h += '<button onclick="' + fn + '(\'' + t.k + '\')" style="padding:8px 14px;font-size:12.5px;font-weight:600;cursor:pointer;border-radius:8px 8px 0 0;'
      + (on ? 'background:var(--bg-card,#fff);color:#26215C;border:1.5px solid var(--border);border-bottom:1.5px solid var(--bg-card,#fff);margin-bottom:-1.5px'
            : 'background:transparent;color:var(--text-muted);border:1.5px solid transparent') + '">'
      + t.lab + (t.n ? ' <span style="background:#A32D2D;color:#fff;border-radius:9px;padding:0 6px;font-size:10px">' + t.n + '</span>' : '') + '</button>';
  });
  return h + '</div>';
}

// IMPIANTI IN CELLE
function _invCelle(lista, testoNuovo, dest) {
  var h = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px">';
  lista.forEach(function (i) {
    var sp = _invSpesoImpianto(i.id), prev = Number(i.spesa_prevista || 0);
    var st = _INV_STATI[i.stato] || _INV_STATI.previsto;
    var pct = prev > 0 ? Math.min(100, sp / prev * 100) : 0;
    var col = _invIsVend(i) ? '#E0A458' : (i.stato === 'in_esercizio' ? '#639922' : (i.stato === 'previsto' ? '#888780' : '#378ADD'));
    var pr = (_invDati.preventivi || []).filter(function (p) { return p.impianto_id === i.id && p.scelto; })[0];
    h += '<div onclick="invApriImpianto(\'' + i.id + '\')" style="cursor:pointer;background:var(--bg-card,var(--bg));border:0.5px solid var(--border);border-left:4px solid ' + col + ';border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:6px">'
      + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><div style="font-size:17px;font-weight:600">' + _invEsc(i.nome) + '</div>'
      + '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:' + st.bg + ';color:' + st.col + ';white-space:nowrap">' + st.lab + '</span></div>'
      + '<div style="font-size:12px;color:var(--text-muted)">' + _invEsc(i.luogo || '—') + (i.kw ? ' · ' + Number(i.kw).toLocaleString('it-IT') + ' kW' : '')
      + ((pr && pr.fornitore) || i.fornitore ? ' · ' + _invEsc((pr && pr.fornitore) || i.fornitore) : '') + '</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px;margin-top:4px"><span>' + (_invIsVend(i) ? 'Costo previsto' : 'Budget') + '</span><b style="font-family:var(--font-mono)">' + _invEuro(prev) + '</b></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:12px"><span>Pagato</span><b style="font-family:var(--font-mono);color:#A32D2D">' + _invEuro(sp) + '</b></div>'
      + '<div style="height:8px;border-radius:4px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden"><div style="width:' + pct.toFixed(1) + '%;height:100%;background:' + (sp > prev && prev > 0 ? '#854F0B' : '#A32D2D') + '"></div></div>';
    if (_invIsVend(i)) {
      var ric = Number(i.ricavo_previsto || 0);
      h += '<div style="display:flex;justify-content:space-between;font-size:12px"><span>Ricavo previsto</span><b style="font-family:var(--font-mono);color:#27500A">' + (ric ? _invEuro(ric) : '—') + '</b></div>'
        + '<div style="display:flex;justify-content:space-between;font-size:12px;border-top:0.5px solid var(--border);padding-top:5px"><span>Margine atteso</span><b style="font-family:var(--font-mono);color:' + (ric - prev >= 0 ? '#27500A' : '#A32D2D') + '">' + (ric ? _invEuro(ric - prev) : '—') + '</b></div>';
    } else {
      h += '<div style="font-size:11px;color:var(--text-muted);border-top:0.5px solid var(--border);padding-top:5px">' + pct.toFixed(0) + '% del budget'
        + (i.data_allaccio ? ' · in rete dal ' + _invData(i.data_allaccio) : (i.data_fine ? ' · fine lavori ' + _invData(i.data_fine) : '')) + '</div>';
    }
    h += '</div>';
  });
  if (_invPuo()) {
    h += '<div onclick="invNuovoImpianto(\'' + dest + '\')" style="cursor:pointer;border:1.5px dashed var(--border);border-radius:8px;display:flex;align-items:center;justify-content:center;min-height:150px;color:var(--text-muted);font-weight:700;font-size:13px">' + testoNuovo + '</div>';
  }
  h += '</div>';
  if (!lista.length && !_invPuo()) h += '<div style="font-size:12px;color:var(--text-muted)">Nessun impianto.</div>';
  return h;
}

function invNuovoImpianto(dest) {
  invModaleImpianto();
  setTimeout(function () { var s = document.getElementById('inv-i-dest'); if (s) s.value = dest || 'proprio'; }, 30);
}

// RISORSE
function _invPannelloRisorse(D, C) {
  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Da dove vengono le risorse</div>'
    + (_invPuo() ? '<button onclick="invModaleRisorsa()" style="font-size:12px;padding:6px 12px;border:0.5px solid #185FA5;border-radius:7px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Risorsa</button>' : '')
    + '</div>';
  if (!D.risorse.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna risorsa inserita.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    D.risorse.forEach(function (r) {
      var fin = (D.finanziamenti || []).filter(function (f) { return f.id === r.finanziamento_id; })[0];
      h += '<tr style="border-bottom:0.5px solid var(--border)' + (fin ? ';cursor:pointer' : '') + '"'
        + (fin ? ' onclick="invPopupFinanziamento(\'' + fin.id + '\')" title="Vedi le caratteristiche del finanziamento"' : '') + '>'
        + '<td style="padding:7px 4px"><strong>' + _invEsc(r.descrizione) + '</strong>'
        + '<span style="font-size:10px;color:var(--text-muted);margin-left:6px">' + _invEsc(r.tipo) + '</span>'
        + (fin ? '<div style="font-size:10.5px;color:var(--text-muted)">' + _invEsc(fin.numero_contratto || '') + ' · TAN ' + fin.tasso + '% · ' + fin.durata_rate + ' rate'
            + (fin.rate_preammortamento ? ' (di cui ' + fin.rate_preammortamento + ' di preammortamento)' : '') + '</div>' : '')
        + '</td>'
        + '<td style="padding:7px 4px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(r.importo) + '</td>'
        + '<td style="padding:7px 4px;text-align:right;width:40px">' + (_invPuo() ? '<button onclick="event.stopPropagation();invEliminaRisorsa(\'' + r.id + '\')" title="Togli" style="border:0;background:transparent;cursor:pointer;color:#A32D2D">×</button>' : '') + '</td></tr>';
    });
    if (C.incassi > 0) {
      h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:7px 4px"><strong>Incassi del ramo</strong>'
        + '<div style="font-size:10.5px;color:var(--text-muted)">entrate registrate con questa causale</div></td>'
        + '<td style="padding:7px 4px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">+ ' + _invEuro(C.incassi) + '</td><td></td></tr>';
    }
    h += '<tr style="font-weight:700"><td style="padding:8px 4px">TOTALE DISPONIBILE</td>'
      + '<td style="padding:8px 4px;text-align:right;font-family:var(--font-mono)">' + _invEuro(C.disponibili) + '</td><td></td></tr>';
    h += '</table>';
  }
  // come si usano
  var pct = C.disponibili > 0 ? Math.min(100, C.spesoTotale / C.disponibili * 100) : 0;
  var pctP = C.disponibili > 0 ? Math.min(100, C.prenotato / C.disponibili * 100) : 0;
  h += '<div style="margin-top:14px;padding-top:10px;border-top:0.5px solid var(--border)">'
    + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:5px"><span style="font-weight:600">Come si usano</span>'
    + '<span style="color:var(--text-muted)">speso ' + pct.toFixed(1) + '% · prenotato ' + pctP.toFixed(1) + '%</span></div>'
    + '<div style="height:16px;border-radius:8px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden;position:relative">'
    + '<div style="position:absolute;left:0;top:0;bottom:0;width:' + pctP.toFixed(1) + '%;background:#CFE1F3"></div>'
    + '<div style="position:absolute;left:0;top:0;bottom:0;width:' + pct.toFixed(1) + '%;background:#185FA5"></div></div>'
    + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">Blu pieno = speso · azzurro = prenotato dagli impianti nostri · al netto dell\'IVA. Gli impianti per la vendita non usano queste risorse.</div></div>';
  h += '</div>';
  return h;
}

// SPESE
function _invPannelloSpese(D, C) {
  var h = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    + _invKpi('Imputate agli impianti', _invEuro(C.spesoImputato), 'impianti nostri')
    + _invKpi('Spese generali', _invEuro(C.spesoGenerale), 'costi comuni del ramo')
    + _invKpi('Da imputare', _invEuro(C.daImputareTot), C.daImputare.length + ' movimenti', C.daImputare.length ? '#A32D2D' : '#27500A')
    + (C.spesoVendita ? _invKpi('Impianti in vendita', _invEuro(C.spesoVendita), 'fuori dalle risorse') : '')
    + '</div>';
  h += '<div class="card" style="padding:12px 14px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Spese da imputare</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">' + C.daImputare.length + ' movimenti · ' + _invEuro(C.daImputareTot) + ' di imponibile</div></div>';
  if (!C.daImputare.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna spesa in attesa: tutte imputate o segnate come generali.</div>';
  } else {
    h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">';
    C.daImputare.forEach(function (m) {
      var sug = _invSuggerisciImpianto((m.nota_imputazione || '') + ' ' + (m.descrizione || ''));
      var testoVoce = m.nota_imputazione || (_invTestoGenerico(m.descrizione) ? '' : (m.descrizione || ''));
      var sv = _invSplitVoce(testoVoce);
      var fornSug = _invFornDaTesto(sv.forn) || _invFornDaTesto(testoVoce.split(' ').slice(0, 2).join(' '));
      if (fornSug && sv.forn) testoVoce = sv.cosa;
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:7px;white-space:nowrap;vertical-align:top">' + _invData(m.data) + '</td>'
        + '<td style="padding:7px;vertical-align:top">' + _invEsc(m.descrizione || '')
        + '<div style="font-size:10.5px;color:var(--text-muted)">totale ' + _invEuro(m.importo) + ' · IVA ' + (m.aliquota_iva != null ? m.aliquota_iva + '%' : 'n.d.') + '</div>'
        + (m.nota_imputazione ? '<div style="display:inline-block;margin-top:4px;background:#FFF8E1;border:0.5px solid #E8C873;color:#6b4e00;border-radius:6px;padding:3px 8px;font-size:11.5px">📝 ' + _invEsc(m.nota_imputazione) + '</div>' : '')
        + '</td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600;vertical-align:top">' + _invEuro(_invImponibile(m)) + '</td>'
        + '<td style="padding:7px;text-align:right;white-space:nowrap;vertical-align:top">'
        + '<select id="inv-imp-' + m.id + '" style="font-size:11.5px;padding:5px 8px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:var(--text);max-width:170px">'
        + '<option value="">— imputa a… —</option>'
        + D.impianti.map(function (i) { return '<option value="' + i.id + '"' + (sug && sug.id === i.id ? ' selected' : '') + '>' + _invEsc(i.nome) + (_invIsVend(i) ? ' (vendita)' : '') + '</option>'; }).join('')
        + '</select> '
        + _invSelForn('inv-forn-' + m.id, fornSug) + ' '
        + (D.noColFatt ? '' : _invSelFattTutte('inv-fatt-' + m.id) + ' ')
        + '<input id="inv-voce-' + m.id + '" value="' + _invEsc(testoVoce) + '" placeholder="cosa (es. rata alla firma 30%)" style="font-size:11.5px;padding:5px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);width:190px"> '
        + '<button onclick="invImputaRiga(\'' + m.id + '\')" class="btn-primary" style="font-size:11.5px;padding:5px 10px">✓ Imputa</button> '
        + '<button onclick="invSegnaGenerale(\'' + m.id + '\')" title="Resta un costo comune del ramo" style="font-size:11.5px;padding:5px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-muted);cursor:pointer">spesa generale</button>'
        + (sug ? '<div style="font-size:10.5px;color:#27500A;margin-top:3px">✓ proposto "' + _invEsc(sug.nome) + '": il nome è nella nota</div>'
               : (m.nota_imputazione ? '<div style="font-size:10.5px;color:#854F0B;margin-top:3px">nessun impianto riconosciuto nella nota: scegli tu</div>' : ''))
        + '</td></tr>';
    });
    h += '</table></div>';
  }
  if (C.spesoGenerale > 0) {
    h += '<div style="margin-top:10px;font-size:11.5px;color:var(--text-muted)">Spese generali del ramo (non attribuite a un impianto): <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(C.spesoGenerale) + '</strong> '
      + '<button onclick="invMostraGenerali()" style="font-size:11px;padding:3px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;margin-left:6px">vedi</button></div>';
  }
  h += '</div>';
  return h;
}

// VENDITA A CLIENTI → IMPIANTI VENDUTI
function _invRenderVendita(box) {
  var lista = _invImpiantiModo();
  var costo = 0, speso = 0, ricavo = 0;
  lista.forEach(function (i) { costo += Number(i.spesa_prevista || 0); speso += _invSpesoImpianto(i.id); ricavo += Number(i.ricavo_previsto || 0); });
  var h = '<div style="margin-bottom:10px"><div style="font-size:15px;font-weight:700">Impianti venduti</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Impianti costruiti per un cliente: non usano le risorse degli investimenti. Le spese si imputano da ☀️ Investimenti → Spese.</div></div>';
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    + _invKpi('Costo previsto', _invEuroK(costo), lista.length + ' impiant' + (lista.length === 1 ? 'o' : 'i'))
    + _invKpi('Pagato (imponibile)', _invEuroK(speso), '', '#A32D2D')
    + _invKpi('Ricavo previsto', _invEuroK(ricavo), '', '#27500A')
    + _invKpi('Margine atteso', _invEuroK(ricavo - costo), '', ricavo - costo >= 0 ? '#27500A' : '#A32D2D')
    + '</div>';
  h += _invCelle(lista, '+ Impianto venduto', 'vendita');
  h += '<div style="margin-top:14px">' + _invBloccoVendite() + '</div>';
  box.innerHTML = h;
}

// ── GANTT ──────────────────────────────────────────────────────────────────
function _invGantt(impianti) {
  var conDate = (impianti || []).filter(function (i) { return i.data_inizio && i.data_fine; });
  if (!conDate.length) return '';   // niente date, niente diagramma
  var D12 = function (iso) { return new Date(String(iso).slice(0, 10) + 'T12:00:00'); };
  var oggiD = new Date(); oggiD.setHours(12, 0, 0, 0);
  var min = null, max = null;
  conDate.forEach(function (i) {
    var a = D12(i.data_inizio), b = D12(i.data_fine), c = i.data_allaccio ? D12(i.data_allaccio) : null;
    if (!min || a < min) min = a;
    if (!max || b > max) max = b;
    if (c && c > max) max = c;
  });
  if (oggiD < min) min = new Date(oggiD);
  if (oggiD > max) max = new Date(oggiD);
  min = new Date(min.getFullYear(), min.getMonth(), 1, 12);
  max = new Date(max.getFullYear(), max.getMonth() + 1, 0, 12);
  var span = Math.max(1, (max - min));
  var pos = function (d) { return ((d - min) / span * 100); };
  var mesi = [];
  var cur = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cur <= max) { mesi.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }
  var MM = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];
  var gg = function (ms) { return Math.round(ms / 86400000); };
  var oggiPct = pos(oggiD);

  var prevTot = conDate.reduce(function (a, i) { return a + Number(i.spesa_prevista || 0); }, 0);
  var spesoTot = conDate.reduce(function (a, i) { return a + _invSpesoImpianto(i.id); }, 0);
  var pctTot = prevTot > 0 ? (spesoTot / prevTot * 100) : 0;
  var BLU = '#185FA5', ROSSO = '#A32D2D', VERDE = '#27500A';
  var dlS = 'position:absolute;top:24px;font-size:9.5px;color:var(--text-muted);white-space:nowrap';
  // etichetta sotto la linea: ai bordi si allinea verso l'interno per non uscire
  var lab = function (p, testo, col) {
    var tr = p < 8 ? 'translateX(0)' : (p > 92 ? 'translateX(-100%)' : 'translateX(-50%)');
    return '<div style="' + dlS + ';left:' + p.toFixed(2) + '%;transform:' + tr + (col ? ';color:' + col : '') + '">' + testo + '</div>';
  };
  var dot = function (p, pieno, col) {
    return '<div style="position:absolute;top:6px;left:' + p.toFixed(2) + '%;width:11px;height:11px;margin-left:-7px;border-radius:50%;border:2px solid ' + col + ';background:' + (pieno ? col : 'var(--bg-card,#fff)') + '"></div>';
  };

  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:10px">'
    + '<div style="font-size:13px;font-weight:700">Tempistiche</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">pagato <strong style="font-family:var(--font-mono);color:var(--text)">'
      + _invEuro(spesoTot) + '</strong> su <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(prevTot)
      + '</strong> previsti · <strong style="color:' + (pctTot > 100 ? ROSSO : 'var(--text)') + '">' + pctTot.toFixed(1) + '%</strong></div></div>';
  h += '<div style="overflow-x:auto"><div style="min-width:720px">';
  h += '<div style="display:grid;grid-template-columns:160px 1fr 190px;gap:12px;font-size:9.5px;color:var(--text-muted)"><div></div><div style="display:flex">'
    + mesi.map(function (d) { return '<div style="flex:1;text-align:center;border-left:0.5px solid var(--border)">' + MM[d.getMonth()] + (d.getMonth() === 0 || mesi.length < 2 ? ' ' + String(d.getFullYear()).slice(2) : '') + '</div>'; }).join('')
    + '</div><div></div></div>';

  conDate.forEach(function (i, idx) {
    var a = D12(i.data_inizio), b = D12(i.data_fine), c = i.data_allaccio ? D12(i.data_allaccio) : null;
    var pa = pos(a), pb = pos(b);
    var fattoFino = Math.min(Math.max(oggiD, a), b);
    var pf = pos(fattoFino);
    var st = _INV_STATI[i.stato] || _INV_STATI.previsto;
    var finito = i.stato === 'collaudato' || i.stato === 'in_esercizio';
    var durata = Math.max(1, b - a);
    var pctT = Math.max(0, Math.min(100, (oggiD - a) / durata * 100));
    var lavori;
    if (finito) lavori = '<strong>Lavori</strong> · conclusi<div style="color:var(--text-muted)">' + st.lab.toLowerCase() + '</div>';
    else if (oggiD < a) lavori = '<strong>Lavori</strong> · non iniziati<div style="color:var(--text-muted)">partono fra ' + gg(a - oggiD) + ' giorni</div>';
    else if (oggiD > b) lavori = '<strong>Lavori</strong> · <span style="color:' + ROSSO + '">fine superata</span><div style="color:' + ROSSO + '">da ' + gg(oggiD - b) + ' giorni</div>';
    else lavori = '<strong>Lavori</strong> · ' + pctT.toFixed(0) + '% del tempo<div style="color:var(--text-muted)">mancano ' + gg(b - oggiD) + ' giorni</div>';

    var sp = _invSpesoImpianto(i.id), prev = Number(i.spesa_prevista || 0);
    var pctP = prev > 0 ? sp / prev * 100 : 0;
    var res = prev - sp;

    h += '<div style="display:grid;grid-template-columns:160px 1fr 190px;gap:12px;align-items:center;padding:10px 0' + (idx < conDate.length - 1 ? ';border-bottom:0.5px solid var(--border)' : '') + '">';
    h += '<div><div style="font-weight:600;font-size:12.5px">' + _invEsc(i.nome) + '</div><div style="font-size:10.5px;color:var(--text-muted)">' + st.lab + (i.fornitore ? ' · ' + _invEsc(i.fornitore) : '') + '</div></div>';
    // linea dei lavori sul calendario
    h += '<div><div style="position:relative;height:22px">'
      + '<div style="position:absolute;top:10px;left:' + pa.toFixed(2) + '%;width:' + Math.max(0.5, pb - pa).toFixed(2) + '%;height:3px;background:var(--border);border-radius:2px"></div>'
      + (pf > pa ? '<div style="position:absolute;top:9px;left:' + pa.toFixed(2) + '%;width:' + (pf - pa).toFixed(2) + '%;height:5px;background:' + BLU + ';border-radius:3px"></div>' : '')
      + (c ? '<div style="position:absolute;top:11px;left:' + pb.toFixed(2) + '%;width:' + Math.max(0, pos(c) - pb).toFixed(2) + '%;border-top:1.5px dashed ' + VERDE + '"></div>' : '')
      + dot(pa, oggiD >= a, BLU) + dot(pb, finito || oggiD >= b, BLU)
      + (c ? dot(pos(c), oggiD >= c, VERDE) : '')
      + '<div title="oggi" style="position:absolute;top:0;left:' + oggiPct.toFixed(2) + '%;width:2px;height:22px;background:' + ROSSO + '"></div>'
      + lab(pa, 'inizio ' + _invData(i.data_inizio).slice(0, 5))
      + lab(pb, 'fine ' + _invData(i.data_fine).slice(0, 5))
      + (c ? lab(pos(c), 'allaccio', VERDE) : '')
      + '</div><div style="height:18px"></div>';
    // barra separata dei pagamenti
    h += '<div style="font-size:10.5px;color:var(--text-muted)">💶 Pagamenti sul costo previsto</div>'
      + '<div style="height:14px;border-radius:7px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden;margin-top:4px">'
      + '<div style="width:' + Math.min(100, pctP).toFixed(1) + '%;height:100%;background:' + (pctP > 100 ? '#854F0B' : ROSSO) + '"></div></div></div>';
    // riassunto
    h += '<div style="font-size:11px">' + lavori
      + '<div style="margin-top:9px"><strong>Pagato</strong> <span style="font-family:var(--font-mono)">' + _invEuroK(sp) + '</span> · ' + pctP.toFixed(1) + '%</div>'
      + '<div style="color:' + (res < 0 ? ROSSO : 'var(--text-muted)') + '">' + (prev > 0 ? (res >= 0 ? 'resta da pagare ' : 'oltre il previsto di ') + '<span style="font-family:var(--font-mono)">' + _invEuroK(Math.abs(res)) + '</span>' : 'spesa prevista non indicata') + '</div></div>';
    h += '</div>';
  });
  h += '</div></div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Linea <span style="color:' + BLU + ';font-weight:600">blu</span> = tempo dei lavori sul calendario (pieno fino a oggi) · pallino <span style="color:' + VERDE + ';font-weight:600">verde</span> = allaccio · '
    + 'barra <span style="color:' + ROSSO + ';font-weight:600">rossa</span> = pagato sul costo previsto (pagamenti imputati, imponibile) · linea rossa verticale = oggi. Gli impianti senza date non compaiono.</div>';
  h += '</div>';
  return h;
}

// ── IMPUTAZIONE ────────────────────────────────────────────────────────────
async function invImputa(movId, impiantoId) {
  if (!impiantoId) return;
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var r = await sb.from('foglio_giornale_movimenti').update({ investimento_impianto_id: impiantoId }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  if (typeof _auditLog === 'function') _auditLog('investimenti', 'foglio_giornale_movimenti', 'imputata spesa ' + movId + ' a impianto ' + impiantoId);
  toast('✓ Spesa imputata');
  caricaInvestimenti();
}

// impianto il cui nome compare nel testo (parole di almeno 4 lettere); solo se uno vince
function _invSuggerisciImpianto(testo) {
  var t = ' ' + String(testo || '').toLowerCase().replace(/[^a-z0-9àèéìòù]+/g, ' ') + ' ';
  if (!t.trim()) return null;
  var best = null, bestN = 0, pari = false;
  (_invDati.impianti || []).forEach(function (i) {
    var parole = String(i.nome || '').toLowerCase().replace(/[^a-z0-9àèéìòù]+/g, ' ').split(' ').filter(function (w) { return w.length >= 4; });
    var n = parole.filter(function (w) { return t.indexOf(' ' + w + ' ') >= 0; }).length;
    if (n > bestN) { best = i; bestN = n; pari = false; } else if (n && n === bestN) pari = true;
  });
  return (best && !pari) ? best : null;
}
// descrizione automatica del foglio giornale (nome della causale): non e' una voce
function _invTestoGenerico(t) {
  t = String(t || '').trim().toLowerCase();
  if (!t) return true;
  return (_invDati.causali || []).some(function (c) { return String(c.nome || '').trim().toLowerCase() === t; })
    || t === 'spesa investimenti' || t.indexOf('pagamenti investimenti') === 0;
}
// voce mostrata nell'elenco spese
function _invVoceMov(m) {
  if (m.nota_imputazione && String(m.nota_imputazione).trim()) return String(m.nota_imputazione).trim();
  return _invTestoGenerico(m.descrizione) ? '' : String(m.descrizione || '').trim();
}
// ── FORNITORE DELLA SPESA (23/10) ──────────────────────────────────────────
// La voce si salva come "Fornitore – cosa": il gruppo (e il subtotale) e' il fornitore.
function _invSplitVoce(t) {
  t = String(t || '');
  // trattino lungo con o senza spazi; trattino corto con almeno uno spazio accanto
  var m = t.match(/^(.*?)\s*[–—]\s*(.*)$/) || t.match(/^(.*?)\s+-\s*(.*)$/) || t.match(/^(.*?)\s*-\s+(.*)$/);
  return m ? { forn: m[1].trim(), cosa: m[2].trim() } : { forn: '', cosa: t.trim() };
}
// fornitore della lista che corrisponde al testo (uguale, o stesso nome senza forma societaria)
function _invFornDaTesto(t) {
  var lista = (_invDati && _invDati.fornitori) || [];
  var k = _invChiaveForn(t);
  if (!k) return '';
  if (k === 'generico') return 'Generico';
  for (var i = 0; i < lista.length; i++) {
    var kf = _invChiaveForn(lista[i]);
    if (kf === k || kf.indexOf(k) === 0 || k.indexOf(kf) === 0) return lista[i];
  }
  return '';
}
function _invSelForn(id, scelto) {
  var lista = (_invDati && _invDati.fornitori) || [];
  var h = '<select id="' + id + '" style="font-size:11.5px;padding:5px 8px;border:0.5px solid #A32D2D;border-radius:6px;background:var(--bg);color:var(--text);max-width:190px">'
    + '<option value="">— fornitore —</option>';
  lista.forEach(function (f) { h += '<option value="' + _invEsc(f) + '"' + (f === scelto ? ' selected' : '') + '>' + _invEsc(f) + '</option>'; });
  h += '<option value="Generico"' + (scelto === 'Generico' ? ' selected' : '') + '>Generico (non in elenco)</option></select>';
  return h;
}
function _invComponiVoce(forn, cosa) {
  forn = String(forn || '').trim(); cosa = String(cosa || '').trim();
  if (!forn) return cosa;
  return cosa ? forn + ' – ' + cosa : forn;
}

async function invImputaRiga(movId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var imp = (document.getElementById('inv-imp-' + movId) || {}).value;
  var forn = (document.getElementById('inv-forn-' + movId) || {}).value || '';
  var voce = _invComponiVoce(forn, (document.getElementById('inv-voce-' + movId) || {}).value);
  // la fattura scelta porta con se' l'impianto: "impiantoId|fatturaId"
  var fsel = ((document.getElementById('inv-fatt-' + movId) || {}).value || '').split('|');
  var fattId = fsel.length === 2 ? fsel[1] : '';
  if (fattId) {
    if (imp && imp !== fsel[0]) { toast('La fattura scelta è di un altro impianto'); return; }
    imp = fsel[0];
  }
  if (!imp) { toast('Scegli l\'impianto'); return; }
  if (!forn) { toast('Scegli il fornitore (o Generico se non è in elenco)'); return; }
  var updI = { investimento_impianto_id: imp, nota_imputazione: voce || null };
  if (fattId) updI.investimento_fattura = fattId;
  var r = await sb.from('foglio_giornale_movimenti').update(updI).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  if (typeof _auditLog === 'function') _auditLog('investimenti', 'foglio_giornale_movimenti', 'imputata spesa ' + movId + ' a impianto ' + imp + (voce ? ' — ' + voce : ''));
  toast('✓ Spesa imputata');
  caricaInvestimenti();
}
// correggere il testo della voce di una spesa gia' imputata
function invModaleVoceSpesa(movId) {
  var m = (_invDati.movimenti || []).filter(function (x) { return x.id === movId; })[0];
  if (!m) return;
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var aliq = m.aliquota_iva != null ? Number(m.aliquota_iva) : 10;
  var h = '<div style="max-width:520px"><div style="font-size:16px;font-weight:600;margin-bottom:4px">✏️ Spesa del ' + _invData(m.data) + '</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">Le modifiche si salvano sul movimento del foglio giornale: non ci sono copie da allineare. Conto e metodo di pagamento si cambiano dal foglio giornale.</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr 0.6fr;gap:10px">'
    + (function () {
        var sv = _invSplitVoce(_invVoceMov(m)), f = _invFornDaTesto(sv.forn);
        var cosa = f ? sv.cosa : _invVoceMov(m);
        return '<div style="grid-column:1/4"><label style="' + lb + '">Fornitore *</label>' + _invSelForn('inv-vs-forn', f).replace('font-size:11.5px;padding:5px 8px', 'width:100%;max-width:none;font-size:13px;padding:8px 10px') + '</div>'
          + '<div style="grid-column:1/4"><label style="' + lb + '">Cosa</label><input id="inv-vs-testo" value="' + _invEsc(cosa) + '" style="' + inp + '" placeholder="es. rata alla firma 30%"></div>';
      })()
    + '<div><label style="' + lb + '">Data</label><input id="inv-vs-data" type="date" value="' + _invEsc(String(m.data || '').slice(0, 10)) + '" style="' + inp + '"></div>'
    + '<div><label style="' + lb + '">Importo con IVA €</label><input id="inv-vs-importo" type="number" step="0.01" min="0.01" value="' + Number(m.importo || 0).toFixed(2) + '" oninput="invVsCalcola()" style="' + inp + ';font-family:var(--font-mono)"></div>'
    + '<div><label style="' + lb + '">IVA %</label><input id="inv-vs-iva" type="number" step="0.1" min="0" value="' + aliq + '" oninput="invVsCalcola()" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>'
    + '</div>'
    + (m.investimento_impianto_id && !_invDati.noColFatt && _invPrevScelto(m.investimento_impianto_id)
        ? '<div style="margin-top:10px"><label style="' + lb + '">Fattura pagata</label>' + _invSelFatt('inv-vs-fatt', m.investimento_impianto_id, m.investimento_fattura || '').replace('font-size:11px;padding:3px 6px', 'width:100%;font-size:13px;padding:8px 10px').replace('max-width:210px', 'max-width:none') + '</div>'
        : '')
    + '<div id="inv-vs-calc" style="font-size:12px;margin-top:8px;color:var(--text-muted)"></div>'
    + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Le spese si raggruppano e si sommano per fornitore. Se il fornitore non è in elenco scegli Generico, oppure aggiungilo in 🏭 Fornitori FV.</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaVoceSpesa(\'' + m.id + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
  invVsCalcola();
}
function invVsCalcola() {
  var box = document.getElementById('inv-vs-calc');
  if (!box) return;
  var tot = parseFloat((document.getElementById('inv-vs-importo') || {}).value) || 0;
  var iva = parseFloat((document.getElementById('inv-vs-iva') || {}).value);
  if (!isFinite(iva) || iva < 0) iva = 0;
  var imp = Math.round(tot / (1 + iva / 100) * 100) / 100;
  box.innerHTML = 'Imponibile <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(imp) + '</strong>'
    + ' · IVA ' + iva + '% <span style="font-family:var(--font-mono)">' + _invEuro(tot - imp) + '</span>'
    + ' — nel conto economico entra solo l\'imponibile.';
}
async function invSalvaVoceSpesa(movId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var fornVs = g('inv-vs-forn');
  if (!fornVs) { toast('Scegli il fornitore (o Generico se non è in elenco)'); return; }
  var t = _invComponiVoce(fornVs, g('inv-vs-testo'));
  var data = g('inv-vs-data');
  var tot = parseFloat(g('inv-vs-importo')) || 0;
  var iva = parseFloat(g('inv-vs-iva'));
  if (!data) { toast('Indica la data'); return; }
  if (tot <= 0) { toast('Indica un importo maggiore di zero'); return; }
  if (!isFinite(iva) || iva < 0) { toast('Aliquota IVA non valida'); return; }
  var upd = {
    nota_imputazione: t || null, data: data, importo: Math.round(tot * 100) / 100,
    aliquota_iva: iva, imponibile: Math.round(tot / (1 + iva / 100) * 100) / 100
  };
  if (document.getElementById('inv-vs-fatt')) upd.investimento_fattura = g('inv-vs-fatt') || null;
  var r = await sb.from('foglio_giornale_movimenti').update(upd).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  if (typeof _auditLog === 'function') _auditLog('investimenti', 'foglio_giornale_movimenti', 'modificata spesa ' + movId + ' — ' + _invEuro(upd.importo) + ' IVA ' + iva + '%');
  var m = (_invDati.movimenti || []).filter(function (x) { return x.id === movId; })[0];
  if (m) { Object.keys(upd).forEach(function (k) { m[k] = upd[k]; }); }
  chiudiModal();
  toast('✓ Spesa aggiornata, anche nel foglio giornale');
  if (_invImpiantoAperto) _invRenderImpianto(); else _invRender();
}

async function invSegnaGenerale(movId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var m = (_invDati.movimenti || []).filter(function (x) { return x.id === movId; })[0];
  var note = String((m && m.note) || '');
  if (note.indexOf('[spesa generale]') < 0) note = (note ? note + ' · ' : '') + '[spesa generale]';
  var r = await sb.from('foglio_giornale_movimenti').update({ note: note }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  toast('✓ Segnata come spesa generale del ramo');
  caricaInvestimenti();
}

function invMostraGenerali() {
  var gen = (_invDati.movimenti || []).filter(function (m) {
    return m.tipo === 'uscita' && !m.investimento_impianto_id && String(m.note || '').indexOf('[spesa generale]') >= 0;
  });
  var h = '<div style="max-width:620px"><div style="font-size:16px;font-weight:600;margin-bottom:10px">Spese generali del ramo</div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  gen.forEach(function (m) {
    h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:6px 4px">' + _invData(m.data) + '</td>'
      + '<td style="padding:6px 4px">' + _invEsc(m.descrizione || '') + '</td>'
      + '<td style="padding:6px 4px;text-align:right;font-family:var(--font-mono)">' + _invEuro(_invImponibile(m)) + '</td>'
      + '<td style="padding:6px 4px;text-align:right"><button onclick="invRiportaDaImputare(\'' + m.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">rimetti da imputare</button></td></tr>';
  });
  h += '</table></div>';
  apriModal(h);
}

async function invRiportaDaImputare(movId) {
  var m = (_invDati.movimenti || []).filter(function (x) { return x.id === movId; })[0];
  var note = String((m && m.note) || '').replace(/\s*·?\s*\[spesa generale\]/, '').trim();
  var r = await sb.from('foglio_giornale_movimenti').update({ note: note || null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  caricaInvestimenti();
}

async function invTogliImputazione(movId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var r = await sb.from('foglio_giornale_movimenti')
    .update({ investimento_impianto_id: null, investimento_voce_id: null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  toast('Spesa rimessa fra quelle da imputare');
  caricaInvestimenti();
}

async function invImputaVoce(movId, voceId) {
  var r = await sb.from('foglio_giornale_movimenti').update({ investimento_voce_id: voceId || null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

// ── SCHEDA DEL SINGOLO IMPIANTO ────────────────────────────────────────────
function invApriImpianto(id) { _invImpiantoAperto = id; _invTabImp = 'riepilogo'; _invRenderImpianto(); }
function invChiudiImpianto() { _invImpiantoAperto = null; _invRender(); }

function _invRenderImpianto() {
  var box = _invBox();
  var D = _invDati;
  var i = (D.impianti || []).filter(function (x) { return x.id === _invImpiantoAperto; })[0];
  if (!box || !i) { _invImpiantoAperto = null; _invRender(); return; }
  var C = _invConti();
  var spese = (C.speseImp[i.id] || []);
  var speso = spese.reduce(function (s, m) { return s + _invImponibile(m); }, 0);
  var prev = Number(i.spesa_prevista || 0), res = prev - speso;
  var st = _INV_STATI[i.stato] || _INV_STATI.previsto;
  var vend = _invIsVend(i);

  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
  h += '<div><div style="font-size:17px;font-weight:700">' + _invEsc(i.nome)
    + ' <span style="font-size:11px;background:' + st.bg + ';color:' + st.col + ';padding:2px 9px;border-radius:9px;vertical-align:middle">' + st.lab + '</span>'
    + (vend ? ' <span style="font-size:11px;background:#FAEEDA;color:#854F0B;padding:2px 9px;border-radius:9px">per la vendita</span>' : '') + '</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">' + _invEsc(i.luogo || '—')
    + (i.kw ? ' · ' + Number(i.kw).toLocaleString('it-IT') + ' kW' : '')
    + (i.fornitore ? ' · ' + _invEsc(i.fornitore) : '')
    + (i.data_inizio || i.data_fine ? ' · ' + _invData(i.data_inizio) + ' → ' + _invData(i.data_fine) : '')
    + (i.data_allaccio ? ' · <strong style="color:#27500A">in rete dal ' + _invData(i.data_allaccio) + '</strong>' : '') + '</div></div>';
  h += '<div style="display:flex;gap:8px">';
  if (_invPuo()) {
    if (!vend) h += '<button onclick="invModaleProduzione(\'' + i.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid #639922;border-radius:7px;background:var(--bg);color:#3B6D11;font-weight:600;cursor:pointer">⚡ Produzione</button>';
    h += '<button onclick="invModaleImpianto(\'' + i.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">✏️ Modifica</button>';
  }
  h += '<button onclick="invChiudiImpianto()" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);cursor:pointer">← ' + (vend ? 'Impianti venduti' : 'Tutti gli impianti') + '</button>';
  h += '</div></div>';

  var tabs = [
    { k: 'riepilogo', lab: 'Riepilogo' },
    { k: 'spese', lab: '🧾 Spese (' + spese.length + ')' },
    { k: 'mastrino', lab: '📒 Mastrino fornitore' },
    { k: 'preventivi', lab: 'Preventivi' }
  ];
  if (!vend) { tabs.push({ k: 'ce', lab: 'Conto economico' }); tabs.push({ k: 'produzione', lab: '⚡ Produzione' }); }
  if (!tabs.some(function (t) { return t.k === _invTabImp; })) _invTabImp = 'riepilogo';
  h += _invBarraTab(tabs, _invTabImp, 'invVaiTabImp');

  if (_invTabImp === 'spese') h += _invBloccoElencoSpese(i, spese, speso, prev);
  else if (_invTabImp === 'mastrino') h += _invBloccoMastrino(i, spese, prev);
  else if (_invTabImp === 'preventivi') h += _invBloccoPreventivi(i);
  else if (_invTabImp === 'ce') h += _invBloccoCE(i, prev);
  else if (_invTabImp === 'produzione') h += _invBloccoProduzione(i, prev);
  else {
    h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      + _invKpi(vend ? 'Costo previsto' : 'Spesa prevista', _invEuro(prev))
      + _invKpi('Speso (imponibile)', _invEuro(speso), '', '#A32D2D')
      + _invKpi('Uscito con IVA', _invEuro(spese.reduce(function (s5, m) { return s5 + Number(m.importo || 0); }, 0)), '', 'var(--text-muted)')
      + _invKpi('Residuo', _invEuro(res), '', res < 0 ? '#A32D2D' : '#27500A');
    if (vend) {
      var ric = Number(i.ricavo_previsto || 0);
      h += _invKpi('Ricavo previsto', ric ? _invEuro(ric) : '—')
        + _invKpi('Margine atteso', ric ? _invEuro(ric - prev) : '—', '', (ric - prev) >= 0 ? '#27500A' : '#A32D2D');
    }
    h += '</div>';
    // dati dell'impianto e beneficio ambientale (29/10)
    var kwhS = Number(i.produzione_stimata_kwh || 0), kwI = Number(i.kw || 0);
    h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
      + _invKpi('Potenza', kwI ? kwI.toLocaleString('it-IT', { maximumFractionDigits: 2 }) + ' kW' : '—')
      + _invKpi('Produzione stimata', kwhS ? kwhS.toLocaleString('it-IT') + ' kWh/anno' : '—')
      + _invKpi('Resa', kwhS && kwI ? Math.round(kwhS / kwI).toLocaleString('it-IT') + ' kWh/kW' : '—')
      + '</div>';
    if (kwhS > 0) h += _pfCO2Html(kwhS, 'Produzione stimata di ' + _invEsc(i.nome));
    else h += '<div class="card" style="padding:10px 14px;margin-bottom:12px;font-size:12px;color:var(--text-muted)">🌍 Scrivi la <strong>produzione stimata kWh/anno</strong> in ✏️ Modifica: qui compare cosa cambia per l\'ambiente (CO₂ evitata, alberi, famiglie).</div>';
    h += _invGanttSingolo(i);
  }

  box.innerHTML = h;
}
function invVaiTabImp(k) { _invTabImp = k; _invRenderImpianto(); }

// ═══ BARRA CO₂ → ALBERI E LUCE (29/10) ═══════════════════════════════════════
// Usata nel Riepilogo degli impianti nostri (qui) e venduti (pf-fotovoltaico.js).
// Nuvole di CO₂ che il sole, passando da destra a sinistra in 12 secondi, sostituisce con
// alberi e casette che si accendono; sotto, i contatori salgono fino ai valori dell'impianto.
// Stime: 0,25 kg CO₂ per kWh (rete italiana), 22 kg CO₂ l'anno per albero adulto,
// 2.700 kWh l'anno per famiglia.
var _PF_CO2 = { kgKwh: 0.25, kgAlbero: 22, kwhFamiglia: 2700, durata: 12, pausa: 20 }, _pfCo2N = 0;
function _pfCO2Valori(kwh) {
  kwh = Number(kwh || 0);
  return { co2: kwh * _PF_CO2.kgKwh / 1000, alberi: kwh * _PF_CO2.kgKwh / _PF_CO2.kgAlbero, famiglie: kwh / _PF_CO2.kwhFamiglia };
}
function _pfCO2Html(kwh, sotto) {
  var id = 'pfco2-' + (++_pfCo2N), v = _pfCO2Valori(kwh);
  var cella = function (cls, col, lab) {
    return '<div style="background:var(--bg-card,var(--bg));padding:10px 14px;display:flex;align-items:baseline;gap:10px;min-width:0">'
      + '<b data-n="' + cls + '" style="font-family:var(--font-mono);font-size:24px;font-weight:700;line-height:1;color:' + col + ';min-width:4.2ch">0</b>'
      + '<span style="font-size:12px;color:var(--text-muted);line-height:1.25">' + lab + '</span></div>';
  };
  var h = '<div class="card" style="padding:0;margin-bottom:12px;overflow:hidden">'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;padding:10px 14px 8px">'
    + '<div style="font-size:13px;font-weight:700">🌍 Cosa cambia per l\'ambiente</div>'
    + '<button onclick="_pfCO2Rivedi(\'' + id + '\')" style="font-size:11.5px;padding:4px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer">↻ Rivedi</button></div>'
    + '<svg id="' + id + '" viewBox="0 0 1200 190" style="display:block;width:100%;height:auto" role="img" aria-label="La CO2 sostituita da alberi e case illuminate"></svg>'
    + '<div id="' + id + '-n" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:1px;background:var(--border);border-top:0.5px solid var(--border)">'
    + cella('co2', '#5b6066', 'tonnellate di CO₂<br>evitate ogni anno')
    + cella('alberi', '#2e7d32', 'alberi che servirebbero<br>per assorbirle')
    + cella('famiglie', '#C98A00', 'famiglie con la luce<br>prodotta dall\'impianto') + '</div>'
    + '<div style="font-size:10.5px;color:var(--text-muted);padding:6px 14px 9px">'
    + (sotto ? sotto + ' · ' : '') + 'stime: ' + Number(kwh).toLocaleString('it-IT', { maximumFractionDigits: 0 }) + ' kWh/anno × 0,25 kg CO₂/kWh; un albero adulto ≈ 22 kg CO₂/anno; una famiglia ≈ 2.700 kWh/anno.</div></div>';
  setTimeout(function () { _pfCO2Avvia(id, v); }, 0);
  return h;
}
var _pfCo2Stato = {};
function _pfCO2Rivedi(id) { if (_pfCo2Stato[id]) _pfCo2Stato[id].t0 = performance.now(); }
function _pfCO2Avvia(id, val) {
  var sv = document.getElementById(id);
  if (!sv) return;
  var W = 1200, H = 190, TERRA = 150, N = 20, NS = 'http://www.w3.org/2000/svg';
  var el = function (t, a, p) { var e = document.createElementNS(NS, t); for (var k in a) e.setAttribute(k, a[k]); if (p) p.appendChild(e); return e; };
  var u = function (s) { return id + '-' + s; };
  el('defs', {}, sv).innerHTML =
    '<linearGradient id="' + u('cielo') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#bfe0f5"/><stop offset="1" stop-color="#eef7fb"/></linearGradient>'
    + '<linearGradient id="' + u('smog') + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7d8288"/><stop offset="1" stop-color="#b9bcbf"/></linearGradient>'
    + '<linearGradient id="' + u('raggio') + '" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff6c8" stop-opacity="0"/><stop offset=".55" stop-color="#fff2a8" stop-opacity=".9"/><stop offset="1" stop-color="#fff6c8" stop-opacity="0"/></linearGradient>'
    + '<radialGradient id="' + u('luce') + '"><stop offset="0" stop-color="#ffe066" stop-opacity=".9"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient>'
    + '<clipPath id="' + u('clip') + '"><rect id="' + u('clipR') + '" x="1200" y="0" width="1200" height="190"/></clipPath>';
  el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#' + u('smog') + ')' }, sv);
  el('rect', { x: 0, y: TERRA, width: W, height: H - TERRA, fill: '#8e9184' }, sv);
  var pulito = el('g', { 'clip-path': 'url(#' + u('clip') + ')' }, sv);
  el('rect', { x: 0, y: 0, width: W, height: H, fill: 'url(#' + u('cielo') + ')' }, pulito);
  el('rect', { x: 0, y: TERRA, width: W, height: H - TERRA, fill: '#7fb24e' }, pulito);
  el('rect', { x: 0, y: TERRA, width: W, height: 4, fill: '#6a9a3e' }, pulito);
  var albero = function (g, s) {
    var t = el('g', { transform: 'scale(' + s + ')' }, g);
    el('path', { d: 'M-5 0 L-4 -30 L-14 -44 L-11 -46 L-3 -36 L-2 -52 L2 -52 L3 -38 L12 -48 L15 -45 L4 -30 L5 0 Z', fill: '#7a4a2a' }, t);
    [['#2f7d32', 0, -62, 22], ['#3f9a3c', -16, -55, 15], ['#3f9a3c', 16, -55, 15], ['#4fb047', -8, -70, 14], ['#4fb047', 9, -71, 13], ['#6cc35a', -3, -78, 9], ['#2f7d32', 0, -46, 13]]
      .forEach(function (c) { el('circle', { cx: c[1], cy: c[2], r: c[3], fill: c[0] }, t); });
    [[-10, -72], [6, -80], [13, -62]].forEach(function (c) { el('circle', { cx: c[0], cy: c[1], r: 3, fill: '#8fd67a' }, t); });
    return {};
  };
  var casa = function (g) {
    var alone = el('circle', { cx: 0, cy: -20, r: 34, fill: 'url(#' + u('luce') + ')', opacity: 0 }, g);
    el('rect', { x: -20, y: -34, width: 40, height: 34, fill: '#e6e6e6' }, g);
    el('rect', { x: 8, y: -62, width: 7, height: 18, fill: '#a87a50' }, g);
    el('path', { d: 'M-26 -32 L0 -56 L26 -32 Z', fill: '#33339a' }, g);
    el('rect', { x: -9, y: -27, width: 18, height: 16, fill: '#cfcfcf' }, g);
    var vetro = el('rect', { x: -7, y: -25, width: 14, height: 12, fill: '#1f6fb8' }, g);
    el('path', { d: 'M0 -25 V-13 M-7 -19 H7', stroke: '#cfcfcf', 'stroke-width': 1.6 }, g);
    return { vetro: vetro, alone: alone };
  };
  var nuvola = function (g) {
    [[-18, 4, 15], [0, -4, 20], [18, 3, 15], [-6, 10, 14], [9, 11, 13]].forEach(function (c) { el('circle', { cx: c[0], cy: c[1], r: c[2], fill: '#4b4f55' }, g); });
    el('circle', { cx: -4, cy: -10, r: 7, fill: '#5d6268' }, g);
    var tx = el('text', { x: 0, y: 8, 'text-anchor': 'middle', 'font-family': 'Arial,sans-serif', 'font-size': 14, 'font-weight': '700', fill: '#c9ccd0' }, g);
    tx.textContent = 'CO₂';
  };
  var slot = [], passo = W / N;
  for (var i = 0; i < N; i++) {
    var x = passo * (i + 0.5), tipo = (i % 3 === 1) ? 'casa' : 'albero';
    var gi = el('g', { transform: 'translate(' + x + ',' + TERRA + ') scale(0.001)' }, sv);
    var it = tipo === 'casa' ? casa(gi) : albero(gi, 0.85 + ((i * 37) % 5) * 0.06);
    var gc = el('g', {}, sv); nuvola(gc);
    slot.push({ x: x, tipo: tipo, it: it, gi: gi, gc: gc, cy: 62 + ((i * 53) % 4) * 9 });
  }
  var raggio = el('rect', { x: 0, y: 0, width: 140, height: H, fill: 'url(#' + u('raggio') + ')' }, sv);
  var sole = el('g', {}, sv);
  el('circle', { r: 16, fill: '#ffd23a' }, sole);
  for (var k = 0; k < 8; k++) { var a = k * Math.PI / 4; el('line', { x1: Math.cos(a) * 21, y1: Math.sin(a) * 21, x2: Math.cos(a) * 28, y2: Math.sin(a) * 28, stroke: '#ffd23a', 'stroke-width': 3, 'stroke-linecap': 'round' }, sole); }
  var clipR = document.getElementById(u('clipR'));
  var nBox = document.getElementById(id + '-n');
  var nEl = { co2: nBox.querySelector('[data-n=co2]'), alberi: nBox.querySelector('[data-n=alberi]'), famiglie: nBox.querySelector('[data-n=famiglie]') };
  var eb = function (t) { var c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
  var cl = function (v) { return Math.max(0, Math.min(1, v)); };
  var mix = function (t) { var a = [31, 111, 184], b = [255, 216, 77]; return 'rgb(' + a.map(function (v, j) { return Math.round(v + (b[j] - v) * t); }).join(',') + ')'; };
  var fmt = function (n) { return Math.round(n).toLocaleString('it-IT'); };
  var D = _PF_CO2.durata, st = _pfCo2Stato[id] = { t0: performance.now() };
  (function frame(now) {
    if (!sv.isConnected) { delete _pfCo2Stato[id]; return; }   // scheda chiusa: l'animazione si ferma
    var t = (now - st.t0) / 1000;
    if (t > D + _PF_CO2.pausa) { st.t0 = now; t = 0; }
    var p = cl(t / D), sx = W + 70 - (W + 140) * p;
    clipR.setAttribute('x', Math.max(0, sx));
    raggio.setAttribute('x', sx - 20);
    sole.setAttribute('transform', 'translate(' + sx + ',' + (34 - Math.sin(p * Math.PI) * 10) + ')');
    slot.forEach(function (s) {
      var lt = sx < s.x ? (s.x - sx) / (W / D) : -1;
      var tc = cl(lt / 0.9), ti = cl((lt - 0.25) / 0.7);
      s.gc.setAttribute('transform', 'translate(' + (s.x - tc * 30) + ',' + (s.cy - tc * 26) + ') scale(' + (1 - tc * 0.5) + ')');
      s.gc.setAttribute('opacity', 1 - tc);
      s.gi.setAttribute('transform', 'translate(' + s.x + ',' + TERRA + ') scale(' + Math.max(0.001, lt < 0 ? 0 : eb(ti)) + ')');
      if (s.tipo === 'casa') { var tl = cl((lt - 0.8) / 0.5); s.it.vetro.setAttribute('fill', mix(tl)); s.it.alone.setAttribute('opacity', tl * 0.9); }
    });
    var q = cl((t - 0.4) / (D - 0.4));
    nEl.co2.textContent = val.co2 * q < 10 && val.co2 >= 1 ? (val.co2 * q).toLocaleString('it-IT', { maximumFractionDigits: 1 }) : fmt(val.co2 * q);
    nEl.alberi.textContent = fmt(val.alberi * q);
    nEl.famiglie.textContent = fmt(val.famiglie * q);
    requestAnimationFrame(frame);
  })(performance.now());
}

// ── ELENCO SPESE DELL'IMPIANTO (09/10) ──────────────────────────────────────
// Gruppo = testo della voce prima del trattino (– — -). Subtotale solo se il gruppo
// ha almeno due spese, cosi' l'elenco non si appesantisce.
function _invGruppoVoce(t) {
  var sp = _invSplitVoce(t);
  var g = sp.forn || sp.cosa;   // senza trattino il gruppo e' tutta la voce
  if (!g) return '';
  return _invFornDaTesto(g) || g;   // nome come in Fornitori FV, se c'e'
}
// chiave del gruppo: stesso fornitore anche se scritto in modo diverso
function _invChiaveGruppo(t) {
  var g = _invGruppoVoce(t);
  return g ? (_invChiaveForn(g) || g.toLowerCase()) : '';
}
function _invBloccoElencoSpese(i, spese, speso, prev) {
  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Elenco spese (' + spese.length + ')</div>'
    + '<div style="font-size:11px;color:var(--text-muted)">budget <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(prev) + '</strong> (spesa prevista)</div></div>';
  if (!spese.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna spesa imputata: le spese si imputano dalla schermata degli impianti, in "Spese da imputare".</div>';
  } else {
    // gruppi in ordine di prima data
    var gruppi = [], idx = {};
    spese.slice().sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); }).forEach(function (m) {
      var v = _invVoceMov(m), g = _invChiaveGruppo(v) || ('·' + m.id);
      if (idx[g] == null) { idx[g] = gruppi.length; gruppi.push({ nome: _invGruppoVoce(v), righe: [] }); }
      gruppi[idx[g]].righe.push(m);
    });
    var th = 'padding:6px 7px;border-bottom:1.5px solid var(--border)';
    h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">';
    h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
      + '<th style="text-align:left;' + th + '">Data</th><th style="text-align:left;' + th + '">Voce</th>'
      + '<th style="text-align:right;' + th + '">Con IVA</th><th style="text-align:right;' + th + '">IVA</th>'
      + '<th style="text-align:right;' + th + '">Imponibile</th><th style="' + th + ';width:90px"></th></tr>';
    var totIvato = 0;
    gruppi.forEach(function (g) {
      var subI = 0, subN = 0;
      g.righe.forEach(function (m) {
        var v = _invVoceMov(m), imp = _invImponibile(m);
        subI += Number(m.importo || 0); subN += imp; totIvato += Number(m.importo || 0);
        h += '<tr style="border-bottom:0.5px solid var(--border)">'
          + '<td style="padding:7px;white-space:nowrap">' + _invData(m.data) + '</td>'
          + '<td style="padding:7px">' + (v ? _invEsc(v) : '<span style="color:#854F0B">senza voce</span>')
          + (m.descrizione && !_invTestoGenerico(m.descrizione) && m.descrizione !== v ? '<div style="font-size:10.5px;color:var(--text-muted)">' + _invEsc(m.descrizione) + '</div>' : '') + '</td>'
          + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(m.importo) + '</td>'
          + '<td style="padding:7px;text-align:right;color:var(--text-muted);font-family:var(--font-mono)">' + _invEuro(Number(m.importo || 0) - imp) + '<div style="font-size:10px">' + (m.aliquota_iva != null ? m.aliquota_iva + '%' : 'n.d.') + '</div></td>'
          + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(imp) + '</td>'
          + '<td style="padding:7px;text-align:right;white-space:nowrap">'
          + (_invPuo() ? '<button onclick="invModaleVoceSpesa(\'' + m.id + '\')" title="Correggi la voce" style="border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;padding:3px 7px">✏️</button> '
              + '<button onclick="invTogliImputazione(\'' + m.id + '\')" title="Togli dall\'impianto" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-muted);cursor:pointer">togli</button>' : '')
          + '</td></tr>';
      });
      if (true) {   // v20261023c — subtotale per OGNI fornitore, anche con una sola spesa
        h += '<tr style="background:var(--bg-kpi,var(--bg));font-weight:600;color:#185FA5">'
          + '<td></td><td style="padding:6px 7px">Totale ' + _invEsc(g.nome) + ' (' + g.righe.length + ')</td>'
          + '<td style="padding:6px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(subI) + '</td>'
          + '<td style="padding:6px 7px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + _invEuro(subI - subN) + '</td>'
          + '<td style="padding:6px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(subN) + '</td><td></td></tr>';
      }
    });
    h += '<tr style="font-weight:700"><td colspan="2" style="padding:8px 7px">TOTALE PAGATO</td>'
      + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(totIvato) + '</td>'
      + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + _invEuro(totIvato - speso) + '</td>'
      + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(speso) + '</td><td></td></tr>';
    h += '</table></div>';
  }
  // pagato sul budget
  if (prev > 0) {
    var pctP = Math.min(100, speso / prev * 100), res = prev - speso;
    h += '<div style="margin-top:12px;padding-top:10px;border-top:0.5px solid var(--border)">'
      + '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:11.5px;margin-bottom:5px">'
      + '<span style="font-weight:600">💶 Pagato sul budget</span>'
      + '<span style="color:var(--text-muted)">' + _invEuro(speso) + ' su ' + _invEuro(prev) + ' · ' + (speso / prev * 100).toFixed(1) + '%</span></div>'
      + '<div style="height:14px;border-radius:7px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden">'
      + '<div style="width:' + pctP.toFixed(1) + '%;height:100%;background:' + (res < 0 ? '#854F0B' : '#A32D2D') + '"></div></div>'
      + '<div style="font-size:10.5px;margin-top:4px;color:' + (res < 0 ? '#A32D2D' : 'var(--text-muted)') + '">'
      + (res >= 0 ? 'Resta da pagare <strong style="font-family:var(--font-mono)">' + _invEuro(res) + '</strong>' : 'Oltre il budget di <strong style="font-family:var(--font-mono)">' + _invEuro(-res) + '</strong>')
      + ' · importi al netto dell\'IVA, partita di giro.</div></div>';
  }
  h += '</div>';
  return h;
}

// ── MASTRINO FORNITORE (23/10) ─────────────────────────────────────────────
// Convenzione del conto fornitore: le FATTURE vanno in AVERE (fanno nascere il
// debito), i PAGAMENTI in DARE (lo chiudono). Saldo positivo = ancora da pagare.
// v20261028c — nessuna rata predefinita: le rate esistono solo se le inserisce l'utente
// (da contratto o preventivo). Prima, senza rate salvate, si proponeva 30/50/20.
function _invRatePrev(p) {
  var r = p && p.rate;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch (e) { r = null; } }
  return Array.isArray(r) ? r : [];
}
function _invAliqPrev(p) {
  var a = p && p.aliquota_iva != null ? Number(p.aliquota_iva) : 10;
  return isFinite(a) ? a : 10;
}
// nome del fornitore senza forma societaria, per riconoscere i pagamenti dalla voce
function _invChiaveForn(f) {
  var t = String(f || '').toLowerCase().replace(/[.,]/g, ' ')
    .replace(/\b(s\s*a\s*s|s\s*r\s*l\s*s?|s\s*p\s*a|s\s*n\s*c|sas|srl|srls|spa|snc|di)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  return t;
}
function _invMovDelForn(m, chiave) {
  if (!chiave) return false;
  var t = (_invVoceMov(m) + ' ' + (m.descrizione || '')).toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ');
  if (t.indexOf(chiave) >= 0) return true;
  var primo = chiave.split(' ')[0];
  return primo.length >= 4 && t.indexOf(primo) >= 0;
}

// ── FATTURE DEL FORNITORE (28/10) ──────────────────────────────────────────
// Le fatture si scrivono a mano sul contratto (preventivo scelto), colonna
// investimenti_preventivi.fatture (jsonb): [{id, num, data, imponibile, aliq, rata, nota}].
// Ogni pagamento del foglio giornale si collega a UNA fattura con
// foglio_giornale_movimenti.investimento_fattura (l'id della fattura): il
// collegamento lo fa solo l'utente, il programma non abbina niente da solo.
// Le fatture scritte nel vecchio modo (numero e data sulla rata) si vedono come
// fatture "dalla rata" finche' non le si salva con ✏️.
function _invNuovoIdFatt() {
  return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
function _invFattureSalvate(pr) {
  var f = pr && pr.fatture;
  if (typeof f === 'string') { try { f = JSON.parse(f); } catch (e) { f = null; } }
  return Array.isArray(f) ? f : [];
}
function _invFattureContratto(pr) {
  if (!pr) return [];
  var tot = Number(pr.importo || 0), aliq = _invAliqPrev(pr), rate = _invRatePrev(pr);
  var out = _invFattureSalvate(pr).map(function (x) {
    return { id: x.id, num: x.num || '', data: x.data || '', imponibile: Number(x.imponibile || 0),
             aliq: x.aliq != null ? Number(x.aliq) : aliq, rata: (x.rata === 0 || x.rata) ? Number(x.rata) : null,
             nota: x.nota || '', legacy: false };
  });
  rate.forEach(function (r, k) {
    if (!(r.fattura_num || r.fattura_data)) return;
    if (out.some(function (x) { return x.rata === k; })) return;
    out.push({ id: 'r' + k + '-' + String(pr.id).slice(0, 8), num: r.fattura_num || '', data: r.fattura_data || '',
               imponibile: tot * Number(r.perc || 0) / 100, aliq: aliq, rata: k, nota: '', legacy: true });
  });
  out.forEach(function (x) { x.totale = Math.round(x.imponibile * (1 + x.aliq / 100) * 100) / 100; });
  out.sort(function (a, b) { return String(a.data || '9999').localeCompare(String(b.data || '9999')); });
  return out;
}
function _invPrevScelto(impiantoId) {
  return (_invDati.preventivi || []).filter(function (p) { return p.impianto_id === impiantoId && p.scelto; })[0] || null;
}
function _invEtichettaFatt(f) {
  return 'n. ' + (f.num || '?') + (f.data ? ' del ' + _invData(f.data) : '');
}
// elenco a tendina delle fatture di un impianto (per ✏️ spesa e per le righe del mastrino)
function _invSelFatt(id, impiantoId, scelta, onchange) {
  var pr = _invPrevScelto(impiantoId);
  var ff = _invFattureContratto(pr);
  var h = '<select id="' + id + '"' + (onchange ? ' onchange="' + onchange + '"' : '')
    + ' style="font-size:11px;padding:3px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);max-width:210px">'
    + '<option value="">— senza fattura (acconto) —</option>';
  ff.forEach(function (f) {
    h += '<option value="' + _invEsc(f.id) + '"' + (f.id === scelta ? ' selected' : '') + '>Fatt. ' + _invEsc(_invEtichettaFatt(f)) + ' · ' + _invEuro(f.totale) + '</option>';
  });
  if (scelta && !ff.some(function (f) { return f.id === scelta; })) h += '<option value="' + _invEsc(scelta) + '" selected>fattura non più presente</option>';
  return h + '</select>';
}
// tendina per la riga "da imputare": tutte le fatture di tutti gli impianti, raggruppate
function _invSelFattTutte(id) {
  var h = '<select id="' + id + '" title="Fattura del fornitore pagata con questo movimento" style="font-size:11.5px;padding:5px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);max-width:200px">'
    + '<option value="">— fattura (facoltativa) —</option>';
  (_invDati.impianti || []).forEach(function (i) {
    var ff = _invFattureContratto(_invPrevScelto(i.id));
    if (!ff.length) return;
    h += '<optgroup label="' + _invEsc(i.nome) + '">';
    ff.forEach(function (f) { h += '<option value="' + _invEsc(i.id + '|' + f.id) + '">' + _invEsc(_invEtichettaFatt(f)) + ' · ' + _invEuro(f.totale) + '</option>'; });
    h += '</optgroup>';
  });
  return h + '</select>';
}

// ── MASTRINO A LINGUETTE, UNICO PER IMPIANTI NOSTRI E VENDUTI (28/10) ──────
// Usato da pf-investimenti.js (mastrino fornitore dell'impianto) e da
// pf-fotovoltaico.js (mastrino fornitori e fatture/incassi cliente del contratto).
// In alto, sempre: riquadri e due barre (fatturato e pagato/incassato sul pattuito).
// Sotto, linguette: Fatture · Pagamenti/Incassi · Saldo dare/avere (+ eventuali extra).
// o = { chiave, verso:'forn'|'cli', titolo, sotto, btns, pattImp, aliq,
//       fatture:[{id,num,data,imponibile,aliq,totale,nota,rata,legacy}],
//       rateGrigie:[{lab,totale}], rataLab:function(f)->testo,
//       movs:[{id,data,importo,descr,fattId}], selFatt:function(m)->html|'' ,
//       azioniFatt:function(f)->html, daCollegare:[movs], daCollegareSel:function(m)->html,
//       extraMov:html, avvisi:[testi], extraTabs:[{k,lab,html}], nota:testo }
var _pfMastTabSt = {};
function pfMastTab(btn, chiave, k) {
  _pfMastTabSt[chiave] = k;
  var box = btn.closest('.pf-mast');
  if (!box) return;
  box.querySelectorAll('.pf-mast-tab').forEach(function (b) {
    var on = b.getAttribute('data-k') === k;
    b.style.background = on ? 'var(--card, #fff)' : 'transparent';
    b.style.color = on ? '#185FA5' : 'var(--text-muted)';
    b.style.border = on ? '1.5px solid var(--border)' : '1.5px solid transparent';
    b.style.borderBottom = on ? '1.5px solid var(--card, #fff)' : '1.5px solid transparent';
  });
  box.querySelectorAll('.pf-mast-pane').forEach(function (p) { p.style.display = p.getAttribute('data-k') === k ? '' : 'none'; });
}
function _pfMastrino(o) {
  var E = _invEsc, EU = _invEuro, D = _invData;
  var forn = o.verso === 'forn';
  var colMov = forn ? '#185FA5' : '#27500A';
  var pattIva = Math.round(o.pattImp * (1 + o.aliq / 100) * 100) / 100;
  var ff = o.fatture || [], movs = (o.movs || []).slice().sort(function (a, b) { return String(a.data).localeCompare(String(b.data)); });
  var idx = {}; ff.forEach(function (f) { idx[f.id] = f; f.mov = []; f.pagato = 0; });
  var movTot = 0, senza = [];
  movs.forEach(function (m) {
    movTot += Number(m.importo || 0);
    var f = m.fattId && idx[m.fattId];
    if (f) { f.mov.push(m); f.pagato += Number(m.importo || 0); } else senza.push(m);
  });
  var etich = {};
  ff.forEach(function (f) {
    var cum = 0;
    f.mov.forEach(function (m) { cum += Number(m.importo || 0); etich[m.id] = cum >= f.totale - 0.5 ? 'saldo' : 'acconto'; });
    f.residuo = f.totale - f.pagato;
  });
  var fattTot = ff.reduce(function (s, f) { return s + f.totale; }, 0);
  var fattAperte = ff.reduce(function (s, f) { return s + Math.max(0, f.residuo); }, 0);
  var saldo = movTot - pattIva;
  var pill = function (t, bg, col) { return '<span style="font-size:9.5px;font-weight:700;padding:1px 7px;border-radius:9px;white-space:nowrap;background:' + bg + ';color:' + col + '">' + t + '</span>'; };
  var td = 'padding:7px;border-bottom:0.5px solid var(--border);vertical-align:top';
  var th = 'padding:6px 7px;border-bottom:1.5px solid var(--border)';
  var num = ';text-align:right;font-family:var(--font-mono)';
  var rif = function (t) { return '<div style="font-size:10.5px;color:var(--text-muted)">' + t + '</div>'; };
  var L = forn
    ? { patt: 'Pattuito', mov: 'Pagato', aperte: 'Fatture da pagare', tabF: '🧾 Fatture ricevute', tabM: '💸 Pagamenti effettuati', movS: 'pagament', fattW: 'ricevuta', ok: 'pagata', no: 'da pagare' }
    : { patt: 'Contratto', mov: 'Incassato', aperte: 'Fatture da incassare', tabF: '🧾 Fatture emesse', tabM: '💶 Incassi ricevuti', movS: 'incass', fattW: 'emessa', ok: 'incassata', no: 'da incassare' };
  var plur = function (n, rad, s, p) { return n + ' ' + rad + (n === 1 ? s : p); };

  var h = '<div class="card pf-mast" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div><div style="font-size:13px;font-weight:700">' + o.titolo + '</div><div style="font-size:11px;color:var(--text-muted)">' + (o.sotto || '') + '</div></div>'
    + (o.btns ? '<div style="display:flex;gap:6px;flex-wrap:wrap">' + o.btns + '</div>' : '') + '</div>';
  var k = function (lab, val, sub, col) {
    return '<div style="flex:1;min-width:130px;background:var(--bg);border-radius:8px;padding:8px 10px">'
      + '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:15px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div>'
      + '<div style="font-size:10.5px;color:var(--text-muted)">' + sub + '</div></div>';
  };
  var pc = function (x) { return pattIva > 0 ? Math.round(x / pattIva * 100) : 0; };
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">'
    + k(L.patt, EU(pattIva), EU(o.pattImp) + ' + IVA ' + o.aliq + '%')
    + k('Fatturato', EU(fattTot), plur(ff.length, 'fattur', 'a', 'e') + ' · ' + pc(fattTot) + '%', '#A32D2D')
    + k(L.mov, EU(movTot), plur(movs.length, L.movS, 'o', 'i') + ' · ' + pc(movTot) + '%', colMov)
    + k(L.aperte, EU(fattAperte), 'fatture non ancora saldate', fattAperte > 0.5 ? '#A32D2D' : '#27500A')
    + k('Saldo', EU(saldo), L.patt.toLowerCase() + ' − ' + L.mov.toLowerCase(), saldo < -0.5 ? '#A32D2D' : '#27500A')
    + '</div>';
  var barra = function (lab, val, col, resto) {
    var p = pattIva > 0 ? Math.min(100, val / pattIva * 100) : 0;
    return '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:4px"><span>' + lab + '</span>'
      + '<span><b style="font-family:var(--font-mono);color:var(--text)">' + EU(val) + '</b> · ' + p.toFixed(0) + '% · ' + resto + ' ' + EU(Math.max(0, pattIva - val)) + '</span></div>'
      + '<div style="height:12px;border-radius:6px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden;margin-top:2px"><div style="width:' + p.toFixed(1) + '%;height:100%;background:' + col + '"></div></div>';
  };
  h += barra('Fatturato su ' + L.patt.toLowerCase(), fattTot, '#E8B4B4', 'da fatturare')
    + barra(L.mov + ' su ' + L.patt.toLowerCase(), movTot, colMov, forn ? 'da pagare' : 'da incassare');

  // linguette
  var tabs = [{ k: 'fatt', lab: L.tabF + ' (' + ff.length + ')' }, { k: 'mov', lab: L.tabM + ' (' + movs.length + ')' }, { k: 'saldo', lab: '⚖️ Saldo dare / avere' }]
    .concat((o.extraTabs || []).map(function (t) { return { k: t.k, lab: t.lab }; }));
  var att = _pfMastTabSt[o.chiave];
  if (!tabs.some(function (t) { return t.k === att; })) att = 'fatt';
  h += '<div style="display:flex;gap:4px;flex-wrap:wrap;border-bottom:1.5px solid var(--border);margin:14px 0 10px">';
  tabs.forEach(function (t) {
    var on = t.k === att;
    h += '<button class="pf-mast-tab" data-k="' + t.k + '" onclick="pfMastTab(this,\'' + E(o.chiave) + '\',\'' + t.k + '\')" style="font-size:12.5px;font-weight:600;padding:8px 13px;border-radius:8px 8px 0 0;cursor:pointer;margin-bottom:-1.5px;'
      + (on ? 'background:var(--card, #fff);color:#185FA5;border:1.5px solid var(--border);border-bottom:1.5px solid var(--card, #fff)' : 'background:transparent;color:var(--text-muted);border:1.5px solid transparent') + '">' + t.lab + '</button>';
  });
  h += '</div>';
  var pane = function (key, html) { return '<div class="pf-mast-pane" data-k="' + key + '"' + (key === att ? '' : ' style="display:none"') + '>' + html + '</div>'; };

  // 1) fatture
  var t = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px">'
    + '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;' + th + '">Fattura</th>' + (o.rataLab ? '<th style="text-align:left;' + th + '">Rata</th>' : '')
    + '<th style="text-align:right;' + th + '">Totale</th><th style="text-align:right;' + th + '">' + L.mov + '</th>'
    + '<th style="text-align:right;' + th + '">Residuo</th><th style="text-align:left;' + th + '">Stato</th><th style="' + th + '"></th></tr>';
  var ncol = o.rataLab ? 7 : 6;
  if (!ff.length) t += '<tr><td colspan="' + ncol + '" style="' + td + ';color:var(--text-muted);font-size:11.5px">Nessuna fattura ' + L.fattW + '.</td></tr>';
  ff.forEach(function (f) {
    var stato = f.pagato <= 0.005 ? pill(L.no, '#FCEBEB', '#791F1F') : (f.residuo <= 0.5 ? pill(L.ok, '#EAF3DE', '#27500A') : pill('acconto', '#FAEEDA', '#854F0B'));
    var dett = f.mov.map(function (m) { return etich[m.id] + ' ' + D(m.data) + ' <b style="font-family:var(--font-mono);color:' + colMov + '">' + EU(m.importo) + '</b>'; }).join(' · ');
    if (f.residuo > 0.5 && f.pagato > 0) dett += ' · manca <b style="font-family:var(--font-mono);color:#A32D2D">' + EU(f.residuo) + '</b>';
    if (f.residuo < -0.5) dett += ' · <b style="color:#854F0B">' + EU(-f.residuo) + ' in più</b>';
    t += '<tr><td style="' + td + ';white-space:nowrap"><strong>n. ' + E(f.num || '?') + '</strong>' + (f.data ? ' del ' + D(f.data) : '')
      + rif(EU(f.imponibile) + ' + IVA ' + f.aliq + '%' + (f.nota ? ' · ' + E(f.nota) : ''))
      + (f.legacy ? rif('<span style="color:#854F0B">scritta sulla rata: ✏️ per completarla</span>') : '') + '</td>'
      + (o.rataLab ? '<td style="' + td + '">' + (o.rataLab(f) || '<span style="color:var(--text-muted)">—</span>') + '</td>' : '')
      + '<td style="' + td + num + ';color:#A32D2D;font-weight:700">' + EU(f.totale) + '</td>'
      + '<td style="' + td + num + ';color:' + colMov + ';font-weight:700">' + (f.pagato ? EU(f.pagato) : '') + '</td>'
      + '<td style="' + td + num + ';font-weight:700;color:' + (f.residuo > 0.5 ? '#A32D2D' : '#27500A') + '">' + EU(Math.max(0, f.residuo)) + '</td>'
      + '<td style="' + td + '">' + stato + (dett ? '<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px;line-height:1.5">' + dett + '</div>' : '') + '</td>'
      + '<td style="' + td + ';white-space:nowrap;text-align:right">' + (o.azioniFatt ? o.azioniFatt(f) : '') + '</td></tr>';
  });
  (o.rateGrigie || []).forEach(function (r) {
    t += '<tr style="color:#9A988F;font-style:italic"><td style="' + td + '">—</td>' + (o.rataLab ? '<td style="' + td + '">◌ ' + r.lab + '</td>' : '')
      + '<td style="' + td + num + '">' + EU(r.totale) + '</td><td style="' + td + '"></td><td style="' + td + '"></td>'
      + '<td style="' + td + '">' + pill('da fatturare', '#EEEDE6', '#6B6A64') + '</td><td style="' + td + '"></td></tr>';
  });
  if (ff.length) {
    t += '<tr style="font-weight:700;background:var(--bg)"><td style="padding:8px 7px">Totale fatture</td>' + (o.rataLab ? '<td></td>' : '')
      + '<td style="padding:8px 7px' + num + ';color:#A32D2D">' + EU(fattTot) + '</td>'
      + '<td style="padding:8px 7px' + num + ';color:' + colMov + '">' + EU(movTot - senza.reduce(function (s, m) { return s + Number(m.importo || 0); }, 0)) + '</td>'
      + '<td style="padding:8px 7px' + num + ';color:' + (fattAperte > 0.5 ? '#A32D2D' : '#27500A') + '">' + EU(fattAperte) + '</td><td></td><td></td></tr>';
  }
  t += '</table></div>';
  h += pane('fatt', t);

  // 2) pagamenti / incassi
  t = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px">'
    + '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;' + th + '">Data</th><th style="text-align:left;' + th + '">' + (forn ? 'Pagamento' : 'Incasso') + ' (foglio giornale)</th>'
    + '<th style="text-align:left;' + th + '">Fattura</th><th style="text-align:right;' + th + '">Importo</th></tr>';
  if (!movs.length) t += '<tr><td colspan="4" style="' + td + ';color:var(--text-muted);font-size:11.5px">Nessun ' + (forn ? 'pagamento' : 'incasso') + '.</td></tr>';
  movs.forEach(function (m) {
    var f = m.fattId && idx[m.fattId];
    var tag = f ? pill(etich[m.id] + ' fatt. ' + E(f.num || '?'), etich[m.id] === 'saldo' ? '#EAF3DE' : '#FAEEDA', etich[m.id] === 'saldo' ? '#27500A' : '#854F0B') : pill('senza fattura', '#E6F1FB', '#0C447C');
    var sel = o.selFatt ? o.selFatt(m) : '';
    t += '<tr><td style="' + td + ';white-space:nowrap">' + D(m.data) + '</td><td style="' + td + '">' + E(m.descr || '') + ' ' + tag + '</td>'
      + '<td style="' + td + '">' + (sel || (f ? E('n. ' + (f.num || '?')) : '—')) + '</td>'
      + '<td style="' + td + num + ';color:' + colMov + ';font-weight:700">' + EU(m.importo) + '</td></tr>';
  });
  if (movs.length) t += '<tr style="font-weight:700;background:var(--bg)"><td></td><td style="padding:8px 7px">Totale ' + L.mov.toLowerCase() + '</td><td></td><td style="padding:8px 7px' + num + ';color:' + colMov + '">' + EU(movTot) + '</td></tr>';
  t += '</table></div>';
  if ((o.daCollegare || []).length) {
    t += '<div style="margin-top:12px;padding:9px 11px;background:#FFF7E0;border-left:3px solid #BA7517;border-radius:0 6px 6px 0">'
      + '<div style="font-size:12px;font-weight:700;margin-bottom:4px">Da collegare a una fattura (' + o.daCollegare.length + ')</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    o.daCollegare.forEach(function (m) {
      t += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:5px 4px;white-space:nowrap">' + D(m.data) + '</td><td style="padding:5px 4px">' + E(m.descr || '') + '</td>'
        + '<td style="padding:5px 4px;text-align:right;font-family:var(--font-mono);font-weight:600;color:' + colMov + '">' + EU(m.importo) + '</td>'
        + '<td style="padding:5px 4px;text-align:right">' + (o.daCollegareSel ? o.daCollegareSel(m) : '') + '</td></tr>';
    });
    t += '</table></div>';
  }
  t += o.extraMov || '';
  h += pane('mov', t);

  // 3) saldo dare / avere
  var righe = [];
  ff.forEach(function (f) { righe.push({ data: f.data || '', tipo: 'f', f: f }); });
  movs.forEach(function (m) { righe.push({ data: m.data, tipo: 'm', m: m }); });
  righe.sort(function (a, b) { var c = String(a.data || '9999').localeCompare(String(b.data || '9999')); return c !== 0 ? c : (a.tipo === 'f' ? -1 : 1); });
  var run = -pattIva;
  t = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:600px">'
    + '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;' + th + '">Data</th><th style="text-align:left;' + th + '">Descrizione</th>'
    + '<th style="text-align:right;' + th + '">Dare<br>' + (forn ? 'pagamenti' : 'incassi') + '</th><th style="text-align:right;' + th + '">Avere<br>' + L.patt.toLowerCase() + '</th>'
    + '<th style="text-align:right;' + th + '">Saldo</th></tr>'
    + '<tr style="background:var(--bg)"><td style="' + td + '">' + (o.dataPatto ? D(o.dataPatto) : '—') + '</td><td style="' + td + '"><strong>' + (forn ? 'Contratto / costo pattuito' : 'Totale contratto') + '</strong>' + rif(EU(o.pattImp) + ' + IVA ' + o.aliq + '%') + '</td>'
    + '<td style="' + td + '"></td><td style="' + td + num + ';color:#A32D2D;font-weight:700">' + EU(pattIva) + '</td><td style="' + td + num + ';color:#A32D2D;font-weight:700">' + EU(run) + '</td></tr>';
  righe.forEach(function (x) {
    if (x.tipo === 'f') {
      t += '<tr style="color:#9A988F;font-style:italic"><td style="' + td + ';white-space:nowrap">' + (x.f.data ? D(x.f.data) : '—') + '</td><td style="' + td + '">🧾 Fattura n. ' + E(x.f.num || '?') + ' · ' + EU(x.f.totale) + '</td><td style="' + td + '"></td><td style="' + td + '"></td><td style="' + td + '"></td></tr>';
    } else {
      run += Number(x.m.importo || 0);
      t += '<tr><td style="' + td + ';white-space:nowrap">' + D(x.m.data) + '</td><td style="' + td + '">' + E(x.m.descr || '') + '</td>'
        + '<td style="' + td + num + ';color:' + colMov + ';font-weight:700">' + EU(x.m.importo) + '</td><td style="' + td + '"></td>'
        + '<td style="' + td + num + ';font-weight:700;color:' + (run < -0.5 ? '#A32D2D' : '#27500A') + '">' + EU(run) + '</td></tr>';
    }
  });
  t += '<tr style="font-weight:700;background:var(--bg)"><td></td><td style="padding:8px 7px">Totali</td><td style="padding:8px 7px' + num + ';color:' + colMov + '">' + EU(movTot) + '</td>'
    + '<td style="padding:8px 7px' + num + ';color:#A32D2D">' + EU(pattIva) + '</td><td style="padding:8px 7px' + num + ';color:' + (run < -0.5 ? '#A32D2D' : '#27500A') + '">' + EU(run) + '</td></tr></table></div>'
    + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Avere = ' + (forn ? 'contratto firmato' : 'contratto col cliente') + ', dare = ' + (forn ? 'pagamenti' : 'incassi') + ', saldo progressivo. Le fatture in grigio sono solo riferimento.</div>';
  h += pane('saldo', t);
  (o.extraTabs || []).forEach(function (x) { h += pane(x.k, x.html); });

  // avvisi
  var avv = (o.avvisi || []).slice();
  if (senza.length) avv.push(plur(senza.length, L.movS, 'o', 'i') + ' per ' + EU(senza.reduce(function (s, m) { return s + Number(m.importo || 0); }, 0)) + ' senza fattura collegata: collegali nella linguetta ' + L.tabM.slice(3) + '.');
  ff.forEach(function (f) { if (f.residuo < -0.5) avv.push('Fattura n. ' + (f.num || '?') + ': ' + L.mov.toLowerCase() + ' ' + EU(-f.residuo) + ' più del totale (spese di bonifico, bollo, IVA diversa o collegamento sbagliato?).'); });
  if (fattTot > pattIva + 0.5) avv.push('Le fatture superano ' + (forn ? 'il pattuito' : 'il contratto') + ' di ' + EU(fattTot - pattIva) + '.');
  if (avv.length) h += '<div style="margin-top:10px;background:#FFF1DC;border-left:3px solid #E0A458;border-radius:0 6px 6px 0;padding:8px 10px;font-size:11.5px;color:#633806">⚠ ' + avv.join('<br>⚠ ') + '</div>';
  if (o.nota) h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:8px">' + o.nota + '</div>';
  h += '</div>';
  return h;
}

function _invBloccoMastrino(i, spese, budget) {
  var pr = _invPrevScelto(i.id);
  if (!pr) {
    return '<div class="card" style="padding:12px 14px;margin-bottom:12px"><div style="font-size:13px;font-weight:700;margin-bottom:4px">📒 Mastrino fornitore</div>'
      + '<div style="font-size:12px;color:var(--text-muted)">Si attiva quando in "Preventivi ricevuti" c\'è un preventivo <strong>scelto</strong>: il suo imponibile è il contratto.</div></div>';
  }
  var tot = Number(pr.importo || 0), aliq = _invAliqPrev(pr), rate = _invRatePrev(pr);
  var chiave = _invChiaveForn(pr.fornitore);
  var FF = _invFattureContratto(pr);
  var idsF = {}; FF.forEach(function (f) { idsF[f.id] = f; });
  // pagamenti del contratto: collegati a una sua fattura o con il nome del fornitore nella voce
  var pag = spese.filter(function (m) { return (m.investimento_fattura && idsF[m.investimento_fattura]) || _invMovDelForn(m, chiave); });
  var rateFatt = {}; FF.forEach(function (f) { if (f.rata != null) rateFatt[f.rata] = 1; });
  var percTot = rate.reduce(function (s, r) { return s + Number(r.perc || 0); }, 0);
  var bt = function (onclick, txt) {
    return '<button onclick="' + onclick + '" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">' + txt + '</button>';
  };
  var puo = _invPuo(), conCol = puo && !_invDati.noColFatt;
  var avv = [];
  if (_invDati.noColFatt) avv.push('Per collegare i pagamenti alle fatture va lanciato l\'SQL della colonna investimento_fattura.');
  if (rate.length && Math.abs(percTot - 100) > 0.01) avv.push('Le rate sommano al ' + percTot.toLocaleString('it-IT') + '%, non al 100%.');

  var h = _pfMastrino({
    chiave: 'inv-' + i.id, verso: 'forn', dataPatto: pr.data,
    titolo: '📒 Mastrino fornitore — ' + _invEsc(pr.fornitore),
    sotto: 'Contratto = preventivo scelto' + (pr.numero ? ' n. ' + _invEsc(pr.numero) : '') + (pr.data ? ' del ' + _invData(pr.data) : '') + ' · ' + _invEuro(tot) + ' + IVA ' + aliq + '%',
    btns: puo ? bt('invModaleFattura(\'' + pr.id + '\')', '＋ Fattura fornitore') + bt('invModaleRate(\'' + pr.id + '\')', '✏️ Rate e IVA') : '',
    pattImp: tot, aliq: aliq,
    fatture: FF.map(function (f) { return { id: f.id, num: f.num, data: f.data, imponibile: f.imponibile, aliq: f.aliq, totale: f.totale, nota: f.nota, rata: f.rata, legacy: f.legacy }; }),
    rataLab: function (f) { var r = f.rata != null ? rate[f.rata] : null; return r ? Number(r.perc) + '% ' + _invEsc(r.evento || '') : ''; },
    rateGrigie: rate.map(function (r, k) { return rateFatt[k] ? null : { lab: Number(r.perc) + '% ' + _invEsc(r.evento || ''), totale: tot * Number(r.perc || 0) / 100 * (1 + aliq / 100) }; }).filter(Boolean),
    azioniFatt: puo ? function (f) {
      return '<button onclick="invModaleFattura(\'' + pr.id + '\',\'' + _invEsc(f.id) + '\')" title="Modifica la fattura" style="border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;padding:3px 7px">✏️</button> '
        + '<button onclick="invEliminaFattura(\'' + pr.id + '\',\'' + _invEsc(f.id) + '\')" title="Elimina la fattura" style="border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;padding:3px 7px">🗑️</button>';
    } : null,
    movs: pag.map(function (m) { return { id: m.id, data: m.data, importo: Number(m.importo || 0), descr: _invVoceMov(m) || m.descrizione || 'Pagamento', fattId: m.investimento_fattura || '' }; }),
    selFatt: conCol ? function (m) { return _invSelFatt('inv-mf-' + m.id, i.id, m.fattId || '', 'invCollegaFattura(\'' + m.id + '\',this.value)'); } : null,
    avvisi: avv,
    extraTabs: [{ k: 'resoconto', lab: '📊 Resoconto cantiere', html: _invResocontoCantiere(pr, spese, budget, idsF, chiave, FF) }],
    nota: 'I pagamenti sono quelli già imputati all\'impianto: collegati a una fattura di questo contratto, oppure con “' + _invEsc(pr.fornitore) + '” nella voce. Non si registrano una seconda volta.'
  });
  return h;
}

// RESOCONTO: preventivo contro fatturato e pagato, per gruppo di spesa (imponibili)
function _invResocontoCantiere(pr, spese, budget, idsF, chiave, FF) {
  var tot = Number(pr.importo || 0);
  var fattImp = FF.reduce(function (s, f) { return s + f.imponibile; }, 0);
  var th = 'padding:6px 7px;border-bottom:1.5px solid var(--border)';
  var td = 'padding:7px;border-bottom:0.5px solid var(--border)';
  var num = ';text-align:right;font-family:var(--font-mono)';
  var gruppi = [], idx = {};
  spese.forEach(function (m) {
    var g = _invGruppoVoce(_invVoceMov(m)) || 'Senza voce';
    var delForn = (m.investimento_fattura && idsF[m.investimento_fattura]) || _invMovDelForn(m, chiave);
    var k = delForn ? '§forn' : (_invChiaveGruppo(_invVoceMov(m)) || g.toLowerCase());
    if (idx[k] == null) { idx[k] = gruppi.length; gruppi.push({ nome: k === '§forn' ? pr.fornitore : g, forn: k === '§forn', pag: 0 }); }
    gruppi[idx[k]].pag += _invImponibile(m);
  });
  if (idx['§forn'] == null) gruppi.unshift({ nome: pr.fornitore, forn: true, pag: 0 });
  else { var gf = gruppi.splice(idx['§forn'], 1)[0]; gruppi.unshift(gf); }
  var tPrev = 0, tFatt = 0, tPag = 0;
  var h = '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:560px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;' + th + '">Voce / fornitore</th><th style="text-align:right;' + th + '">Preventivo</th>'
    + '<th style="text-align:right;' + th + '">Fatturato</th><th style="text-align:right;' + th + '">Pagato</th><th style="text-align:right;' + th + '">Residuo</th></tr>';
  gruppi.forEach(function (g) {
    var pv = g.forn ? tot : null, ft = g.forn ? fattImp : null;
    tPrev += pv || 0; tFatt += ft || 0; tPag += g.pag;
    h += '<tr><td style="' + td + '">' + _invEsc(g.nome) + (g.forn ? ' <span style="font-size:9.5px;color:#185FA5;font-weight:700">contratto</span>' : '') + '</td>'
      + '<td style="' + td + num + '">' + (pv != null ? _invEuro(pv) : '<span style="color:var(--text-muted)">—</span>') + '</td>'
      + '<td style="' + td + num + '">' + (ft != null ? _invEuro(ft) : '<span style="color:var(--text-muted)">—</span>') + '</td>'
      + '<td style="' + td + num + '">' + _invEuro(g.pag) + '</td>'
      + '<td style="' + td + num + '">' + (pv != null ? _invEuro(pv - g.pag) : '<span style="color:var(--text-muted)">—</span>') + '</td></tr>';
  });
  var altro = budget - tPrev;
  h += '<tr style="color:var(--text-muted)"><td style="' + td + '">Resto del budget (connessione, diritto di superficie, altro)</td>'
    + '<td style="' + td + num + '">' + _invEuro(altro) + '</td><td style="' + td + '"></td><td style="' + td + '"></td><td style="' + td + '"></td></tr>';
  h += '<tr style="font-weight:700;background:var(--bg)"><td style="padding:8px 7px">Totale impianto (budget)</td>'
    + '<td style="padding:8px 7px' + num + '">' + _invEuro(budget) + '</td>'
    + '<td style="padding:8px 7px' + num + '">' + _invEuro(tFatt) + '</td>'
    + '<td style="padding:8px 7px' + num + '">' + _invEuro(tPag) + '</td>'
    + '<td style="padding:8px 7px' + num + (budget - tPag < 0 ? ';color:#A32D2D' : '') + '">' + _invEuro(budget - tPag) + '</td></tr>';
  h += '</table></div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Importi senza IVA, come nel conto economico. Il fatturato è quello delle fatture registrate.'
    + (altro < -0.5 ? ' <strong style="color:#A32D2D">Il contratto supera il budget dell\'impianto di ' + _invEuro(-altro) + '.</strong>' : '') + '</div>';
  return h;
}

// ── MODALE FATTURA FORNITORE ──
function invModaleFattura(prevId, fattId) {
  var pr = (_invDati.preventivi || []).filter(function (p) { return p.id === prevId; })[0];
  if (!pr) { toast('Contratto non trovato'); return; }
  var f = fattId ? _invFattureContratto(pr).filter(function (x) { return x.id === fattId; })[0] : null;
  var rate = _invRatePrev(pr), aliq = _invAliqPrev(pr), tot = Number(pr.importo || 0);
  var occupate = {};
  _invFattureContratto(pr).forEach(function (x) { if (x.rata != null && (!f || x.id !== f.id)) occupate[x.rata] = x; });
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:2px">' + (f ? '✏️ Fattura ' + _invEsc(_invEtichettaFatt(f)) : '＋ Fattura fornitore') + '</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">' + _invEsc(pr.fornitore) + ' · contratto ' + _invEuro(tot) + ' + IVA ' + aliq + '%</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div><label style="' + lb + '">Numero fattura *</label><input id="invf-num" value="' + _invEsc(f ? f.num : '') + '" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '<div><label style="' + lb + '">Data fattura *</label><input id="invf-data" type="date" value="' + _invEsc(f ? f.data : '') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Rata del contratto <span style="font-weight:400">(facoltativa)</span></label><select id="invf-rata" onchange="invFattRata(\'' + prevId + '\')" style="' + inp + '">'
    + '<option value="">— nessuna rata —</option>';
  rate.forEach(function (r, k) {
    var occ = occupate[k];
    h += '<option value="' + k + '"' + (f && f.rata === k ? ' selected' : '') + (occ ? ' disabled' : '') + '>'
      + Number(r.perc) + '% ' + _invEsc(r.evento || '') + ' · ' + _invEuro(tot * Number(r.perc || 0) / 100) + (occ ? ' (già fatturata: ' + _invEsc(_invEtichettaFatt(occ)) + ')' : '') + '</option>';
  });
  h += '</select></div>';
  h += '<div><label style="' + lb + '">Imponibile € *</label><input id="invf-imp" type="number" step="0.01" min="0" value="' + (f ? f.imponibile.toFixed(2) : '') + '" oninput="invFattCalc()" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>';
  h += '<div><label style="' + lb + '">IVA %</label><input id="invf-iva" type="number" step="0.1" min="0" value="' + (f ? f.aliq : aliq) + '" oninput="invFattCalc()" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Nota</label><input id="invf-nota" value="' + _invEsc(f ? f.nota : '') + '" maxlength="200" style="' + inp + '" placeholder="es. fattura emessa in due parti per l\'IVA"></div>';
  h += '</div>';
  h += '<div id="invf-calc" style="font-size:12px;margin-top:8px;color:var(--text-muted)"></div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">I pagamenti si collegano alla fattura dal mastrino (colonna “Fattura pagata”) o con ✏️ sulla spesa.</div>';
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaFattura(\'' + prevId + '\',\'' + _invEsc(fattId || '') + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
  invFattCalc();
}
// scegliendo la rata, se l'imponibile e' vuoto si propone quello della rata
function invFattRata(prevId) {
  var pr = (_invDati.preventivi || []).filter(function (p) { return p.id === prevId; })[0];
  var s = document.getElementById('invf-rata'), e = document.getElementById('invf-imp');
  if (!pr || !s || !e || s.value === '' || e.value) return;
  var r = _invRatePrev(pr)[Number(s.value)];
  if (r) e.value = (Number(pr.importo || 0) * Number(r.perc || 0) / 100).toFixed(2);
  invFattCalc();
}
function invFattCalc() {
  var box = document.getElementById('invf-calc');
  if (!box) return;
  var imp = parseFloat((document.getElementById('invf-imp') || {}).value) || 0;
  var iva = parseFloat((document.getElementById('invf-iva') || {}).value);
  if (!isFinite(iva) || iva < 0) iva = 0;
  var t = Math.round(imp * (1 + iva / 100) * 100) / 100;
  box.innerHTML = 'Totale fattura <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(t) + '</strong> · IVA <span style="font-family:var(--font-mono)">' + _invEuro(t - imp) + '</span>';
}
async function _invScriviFatture(pr, fatture, rate) {
  var upd = { fatture: fatture };
  if (rate) upd.rate = rate;
  var r = await sb.from('investimenti_preventivi').update(upd).eq('id', pr.id);
  if (r.error) { toast('Errore: ' + r.error.message + (/column/i.test(r.error.message) ? ' — lancia prima l\'SQL della colonna fatture' : '')); return false; }
  pr.fatture = fatture;
  if (rate) pr.rate = rate;
  return true;
}
async function invSalvaFattura(prevId, fattId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var pr = (_invDati.preventivi || []).filter(function (p) { return p.id === prevId; })[0];
  if (!pr) return;
  var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var numF = g('invf-num').trim(), data = g('invf-data'), imp = parseFloat(g('invf-imp')), iva = parseFloat(g('invf-iva'));
  var rata = g('invf-rata') === '' ? null : Number(g('invf-rata'));
  if (!numF) { toast('Scrivi il numero della fattura'); return; }
  if (!data) { toast('Indica la data della fattura'); return; }
  if (!isFinite(imp) || imp <= 0) { toast('Indica l\'imponibile'); return; }
  if (!isFinite(iva) || iva < 0) { toast('Aliquota IVA non valida'); return; }
  var salvate = _invFattureSalvate(pr).slice();
  var doppia = _invFattureContratto(pr).filter(function (x) { return x.id !== fattId && String(x.num).trim().toLowerCase() === numF.toLowerCase(); })[0];
  if (doppia && !confirm('C\'è già una fattura n. ' + numF + ' su questo contratto. Salvo lo stesso?')) return;
  var nuova = { id: fattId || _invNuovoIdFatt(), num: numF, data: data, imponibile: Math.round(imp * 100) / 100, aliq: iva, rata: rata, nota: g('invf-nota').trim() || null };
  var pos = -1;
  salvate.forEach(function (x, k) { if (x.id === nuova.id) pos = k; });
  if (pos >= 0) salvate[pos] = nuova; else salvate.push(nuova);
  // una fattura scritta sulla rata (vecchio modo) diventa fattura vera: tolgo numero e data dalla rata
  var rate = null;
  if (fattId && fattId.charAt(0) === 'r') {
    var k = parseInt(fattId.slice(1), 10);
    rate = _invRatePrev(pr).map(function (r) { return Object.assign({}, r); });
    if (rate[k]) { rate[k].fattura_num = null; rate[k].fattura_data = null; }
  }
  if (!(await _invScriviFatture(pr, salvate, rate))) return;
  if (typeof _auditLog === 'function') _auditLog('investimenti', 'investimenti_preventivi', (fattId ? 'modificata' : 'registrata') + ' fattura fornitore ' + numF + ' ' + _invEuro(nuova.imponibile) + ' su contratto ' + pr.id);
  chiudiModal();
  toast('✓ Fattura salvata');
  if (_invImpiantoAperto) _invRenderImpianto();
}
async function invEliminaFattura(prevId, fattId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var pr = (_invDati.preventivi || []).filter(function (p) { return p.id === prevId; })[0];
  if (!pr) return;
  var f = _invFattureContratto(pr).filter(function (x) { return x.id === fattId; })[0];
  if (!f) return;
  var collegati = (_invDati.movimenti || []).filter(function (m) { return m.investimento_fattura === fattId; });
  if (!confirm('Elimino la fattura ' + _invEtichettaFatt(f) + '?' + (collegati.length ? '\n' + collegati.length + ' pagament' + (collegati.length === 1 ? 'o resta' : 'i restano') + ' imputat' + (collegati.length === 1 ? 'o' : 'i') + ' all\'impianto, senza fattura.' : ''))) return;
  var salvate = _invFattureSalvate(pr).filter(function (x) { return x.id !== fattId; });
  var rate = null;
  if (fattId.charAt(0) === 'r') {
    var k = parseInt(fattId.slice(1), 10);
    rate = _invRatePrev(pr).map(function (r) { return Object.assign({}, r); });
    if (rate[k]) { rate[k].fattura_num = null; rate[k].fattura_data = null; }
  }
  if (!(await _invScriviFatture(pr, salvate, rate))) return;
  if (collegati.length) {
    var r = await sb.from('foglio_giornale_movimenti').update({ investimento_fattura: null }).eq('investimento_fattura', fattId);
    if (r.error) { toast('Errore sui pagamenti collegati: ' + r.error.message); }
    else collegati.forEach(function (m) { m.investimento_fattura = null; });
  }
  if (typeof _auditLog === 'function') _auditLog('investimenti', 'investimenti_preventivi', 'eliminata fattura fornitore ' + f.num + ' su contratto ' + pr.id);
  toast('✓ Fattura eliminata');
  if (_invImpiantoAperto) _invRenderImpianto();
}
async function invCollegaFattura(movId, fattId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var r = await sb.from('foglio_giornale_movimenti').update({ investimento_fattura: fattId || null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message + (/column/i.test(r.error.message) ? ' — lancia prima l\'SQL della colonna investimento_fattura' : '')); return; }
  var m = (_invDati.movimenti || []).filter(function (x) { return x.id === movId; })[0];
  if (m) m.investimento_fattura = fattId || null;
  if (typeof _auditLog === 'function') _auditLog('investimenti', 'foglio_giornale_movimenti', 'pagamento ' + movId + (fattId ? ' collegato alla fattura ' + fattId : ' scollegato dalla fattura'));
  toast(fattId ? '✓ Pagamento collegato alla fattura' : '✓ Pagamento senza fattura');
  if (_invImpiantoAperto) _invRenderImpianto();
}

// ── RATE E IVA DEL CONTRATTO ──
// Numero e data della fattura non si scrivono piu' qui: si registrano con
// "＋ Fattura fornitore". Quelli gia' scritti sulle rate restano salvati.
function invModaleRate(prevId) {
  var pr = (_invDati.preventivi || []).filter(function (p) { return p.id === prevId; })[0];
  if (!pr) { toast('Preventivo non trovato'); return; }
  var rate = _invRatePrev(pr), aliq = _invAliqPrev(pr);
  var inp = 'width:100%;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px';
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:2px">Rate e IVA del contratto</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">' + _invEsc(pr.fornitore) + ' · contratto ' + _invEuro(pr.importo) + ' imponibile</div>';
  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted)">Aliquota IVA %</label>'
    + '<input id="invr-iva" type="number" step="0.1" value="' + aliq + '" style="' + inp + ';width:90px;font-family:var(--font-mono);text-align:right"></div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px" id="invr-tab">'
    + '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase"><th style="text-align:left;padding:4px;width:80px">%</th><th style="text-align:left;padding:4px">Quando</th><th style="width:28px"></th></tr>';
  rate.forEach(function (r, k) { h += _invRigaRata(r, k, inp); });
  h += '</table>';
  h += '<button onclick="invAggiungiRata()" style="margin-top:8px;font-size:11.5px;padding:5px 11px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">+ Rata</button>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:8px">Inserisci le rate solo se sono scritte nel contratto o nel preventivo; senza rate il mastrino lavora sulle sole fatture. Per toglierle tutte, cancella le righe e salva. Le fatture vere si registrano con “＋ Fattura fornitore”.</div>';
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaRate(\'' + prevId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}
function _invRigaRata(r, k, inp) {
  return '<tr class="invr-riga" data-num="' + _invEsc(r.fattura_num || '') + '" data-dt="' + _invEsc(r.fattura_data || '') + '">'
    + '<td style="padding:4px"><input class="invr-perc" type="number" step="0.01" value="' + (r.perc != null ? r.perc : '') + '" style="' + inp + ';font-family:var(--font-mono);text-align:right"></td>'
    + '<td style="padding:4px"><input class="invr-ev" value="' + _invEsc(r.evento || '') + '" style="' + inp + '"></td>'
    + '<td style="padding:4px;text-align:center"><button onclick="this.closest(\'tr\').remove()" title="Togli la rata" style="border:0;background:transparent;color:#A32D2D;cursor:pointer;font-size:15px">×</button></td></tr>';
}
function invAggiungiRata() {
  var tab = document.getElementById('invr-tab');
  if (!tab) return;
  var inp = 'width:100%;padding:7px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px';
  tab.insertAdjacentHTML('beforeend', _invRigaRata({ perc: '', evento: '' }, 0, inp));
}
async function invSalvaRate(prevId) {
  var aliq = parseFloat((document.getElementById('invr-iva') || {}).value);
  if (!isFinite(aliq) || aliq < 0) { toast('Aliquota IVA non valida'); return; }
  var rate = [];
  var errore = '';
  document.querySelectorAll('#invr-tab .invr-riga').forEach(function (tr) {
    var perc = parseFloat(tr.querySelector('.invr-perc').value);
    var ev = (tr.querySelector('.invr-ev').value || '').trim();
    var num = tr.getAttribute('data-num') || '';
    var dt = tr.getAttribute('data-dt') || '';
    if (!isFinite(perc) && !ev) return;   // riga vuota
    if (!isFinite(perc) || perc <= 0) { errore = 'Ogni rata deve avere una percentuale'; return; }
    rate.push({ perc: perc, evento: ev, fattura_num: num || null, fattura_data: dt || null });
  });
  if (errore) { toast(errore); return; }
  var somma = rate.reduce(function (s, r) { return s + r.perc; }, 0);
  if (rate.length && Math.abs(somma - 100) > 0.01 && !confirm('Le rate sommano al ' + somma + '%, non al 100%. Salvo lo stesso?')) return;
  var r = await sb.from('investimenti_preventivi').update({ aliquota_iva: aliq, rate: rate }).eq('id', prevId);
  if (r.error) { toast('Errore: ' + r.error.message + (/column/i.test(r.error.message) ? ' — lancia prima l\'SQL delle colonne nuove' : '')); return; }
  var pr = (_invDati.preventivi || []).filter(function (p) { return p.id === prevId; })[0];
  if (pr) { pr.aliquota_iva = aliq; pr.rate = rate; }
  chiudiModal();
  toast('✓ Rate salvate');
  if (_invImpiantoAperto) _invRenderImpianto();
}

// ── MODALI ─────────────────────────────────────────────────────────────────
function invModaleImpianto(id) {
  var i = id ? (_invDati.impianti || []).filter(function (x) { return x.id === id; })[0] : null;
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">' + (i ? 'Modifica impianto' : 'Nuovo impianto') + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Nome *</label><input id="inv-i-nome" value="' + _invEsc(i && i.nome || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Luogo</label><input id="inv-i-luogo" value="' + _invEsc(i && i.luogo || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">kW installati</label><input id="inv-i-kw" type="number" step="0.01" value="' + (i && i.kw != null ? i.kw : '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Fornitore incaricato</label><input id="inv-i-forn" value="' + _invEsc(i && i.fornitore || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Spesa prevista €</label><input id="inv-i-spesa" type="number" step="0.01" value="' + (i && i.spesa_prevista != null ? i.spesa_prevista : '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Destinazione</label><select id="inv-i-dest" style="' + inp + '">'
    + '<option value="proprio"' + (i && i.destinazione === 'proprio' ? ' selected' : '') + '>Impianto nostro</option>'
    + '<option value="vendita"' + (i && i.destinazione === 'vendita' ? ' selected' : '') + '>Costruito per la vendita</option></select></div>';
  h += '<div><label style="' + lb + '">Ricavo previsto € <span style="font-weight:400">(se in vendita)</span></label><input id="inv-i-ricavo" type="number" step="0.01" value="' + (i && i.ricavo_previsto != null ? i.ricavo_previsto : '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Stato</label><select id="inv-i-stato" style="' + inp + '">'
    + Object.keys(_INV_STATI).map(function (k) { return '<option value="' + k + '"' + (i && i.stato === k ? ' selected' : '') + '>' + _INV_STATI[k].lab + '</option>'; }).join('')
    + '</select></div>';
  h += '<div><label style="' + lb + '">Inizio previsto</label><input id="inv-i-dal" type="date" value="' + (i && i.data_inizio || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Fine prevista</label><input id="inv-i-al" type="date" value="' + (i && i.data_fine || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Allaccio alla rete</label><input id="inv-i-allaccio" type="date" value="' + (i && i.data_allaccio || '') + '" style="' + inp + '">'
    + '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Da questa data l\'impianto produce e vende energia.</div></div>';
  h += '<div><label style="' + lb + '">Produzione stimata kWh/anno</label><input id="inv-i-stima" type="number" step="1" value="' + (i && i.produzione_stimata_kwh != null ? i.produzione_stimata_kwh : '') + '" style="' + inp + '">'
    + '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Es. dal PVGIS. Vuoto = ' + _INV_CE_DEF.kwh_per_kw + ' kWh/kW × kW.</div></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Note</label><input id="inv-i-note" value="' + _invEsc(i && i.note || '') + '" style="' + inp + '"></div>';
  h += '</div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:8px">Le date servono solo al diagramma delle tempistiche: senza entrambe, l\'impianto non compare nel Gantt.</div>';
  h += '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px">';
  h += i ? '<button onclick="invEliminaImpianto(\'' + i.id + '\')" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid #A32D2D;color:#A32D2D;border-radius:6px;cursor:pointer">Elimina</button>' : '<span></span>';
  h += '<div style="display:flex;gap:8px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaImpianto(' + (i ? '\'' + i.id + '\'' : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div></div>';
  apriModal(h);
}

async function invSalvaImpianto(id) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var nome = (g('inv-i-nome') || '').trim();
  if (!nome) { toast('Il nome è obbligatorio'); return; }
  var p = {
    causale_id: _invCausale,
    nome: nome,
    luogo: g('inv-i-luogo') || null,
    kw: parseFloat(g('inv-i-kw')) || null,
    fornitore: g('inv-i-forn') || null,
    spesa_prevista: parseFloat(g('inv-i-spesa')) || 0,
    destinazione: g('inv-i-dest') || 'proprio',
    ricavo_previsto: parseFloat(g('inv-i-ricavo')) || null,
    stato: g('inv-i-stato') || 'previsto',
    data_inizio: g('inv-i-dal') || null,
    data_fine: g('inv-i-al') || null,
    data_allaccio: g('inv-i-allaccio') || null,
    produzione_stimata_kwh: parseFloat(g('inv-i-stima')) || null,
    note: g('inv-i-note') || null,
    updated_at: new Date().toISOString()
  };
  var r = id ? await sb.from('investimenti_impianti').update(p).eq('id', id)
             : await sb.from('investimenti_impianti').insert([p]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  toast(id ? '✓ Impianto aggiornato' : '✓ Impianto creato');
  caricaInvestimenti();
}

async function invEliminaImpianto(id) {
  var sp = _invSpesoImpianto(id);
  if (sp > 0) { toast('Ci sono pagamenti imputati: toglili prima di eliminare l\'impianto'); return; }
  if (!confirm('Elimino questo impianto?')) return;
  var r = await sb.from('investimenti_impianti').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  _invImpiantoAperto = null;
  caricaInvestimenti();
}

function invModaleVoce(impiantoId) {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:480px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Nuova voce di costo</div>';
  h += '<div style="display:grid;gap:10px">';
  h += '<div><label style="' + lb + '">Descrizione *</label><input id="inv-v-descr" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Categoria</label><select id="inv-v-cat" style="' + inp + '">'
    + _INV_CATEGORIE.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></div>';
  h += '<div><label style="' + lb + '">Fornitore</label><input id="inv-v-forn" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Importo previsto €</label><input id="inv-v-imp" type="number" step="0.01" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaVoce(\'' + impiantoId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

async function invSalvaVoce(impiantoId) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var d = (g('inv-v-descr') || '').trim();
  if (!d) { toast('La descrizione è obbligatoria'); return; }
  var voci = (_invDati.voci || []).filter(function (v) { return v.impianto_id === impiantoId; });
  var r = await sb.from('investimenti_voci').insert([{
    impianto_id: impiantoId,
    categoria: g('inv-v-cat') || 'altro',
    descrizione: d,
    fornitore: g('inv-v-forn') || null,
    importo_previsto: parseFloat(g('inv-v-imp')) || 0,
    ordine: voci.length + 1
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  caricaInvestimenti();
}

async function invEliminaVoce(id) {
  if (!confirm('Elimino questa voce di costo?')) return;
  var r = await sb.from('investimenti_voci').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

function invModaleRisorsa() {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var fin = _invDati.finanziamenti || [];
  var h = '<div style="max-width:480px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Nuova risorsa destinata</div>';
  h += '<div style="display:grid;gap:10px">';
  h += '<div><label style="' + lb + '">Tipo</label><select id="inv-r-tipo" onchange="invRisorsaTipo()" style="' + inp + '">'
    + '<option value="mutuo">Mutuo / finanziamento</option><option value="liquidita">Liquidità aziendale</option>'
    + '<option value="apporto">Apporto soci</option><option value="altro">Altro</option></select></div>';
  h += '<div id="inv-r-fin-box"><label style="' + lb + '">Finanziamento collegato</label><select id="inv-r-fin" onchange="invRisorsaFin()" style="' + inp + '">'
    + '<option value="">— nessuno —</option>'
    + fin.map(function (f) { return '<option value="' + f.id + '" data-cap="' + f.capitale + '" data-desc="' + _invEsc(f.descrizione || '') + '">' + _invEsc(f.descrizione || f.numero_contratto) + ' · ' + _invEuroK(f.capitale) + '</option>'; }).join('')
    + '</select></div>';
  h += '<div><label style="' + lb + '">Descrizione *</label><input id="inv-r-descr" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Importo destinato €</label><input id="inv-r-imp" type="number" step="0.01" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Data</label><input id="inv-r-data" type="date" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaRisorsa()" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

function invRisorsaTipo() {
  var t = (document.getElementById('inv-r-tipo') || {}).value;
  var box = document.getElementById('inv-r-fin-box');
  if (box) box.style.display = (t === 'mutuo') ? 'block' : 'none';
}
function invRisorsaFin() {
  var s = document.getElementById('inv-r-fin');
  if (!s || !s.value) return;
  var o = s.options[s.selectedIndex];
  var d = document.getElementById('inv-r-descr'), i = document.getElementById('inv-r-imp');
  if (d && !d.value) d.value = o.getAttribute('data-desc') || '';
  if (i && !i.value) i.value = o.getAttribute('data-cap') || '';
}

async function invSalvaRisorsa() {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var d = (g('inv-r-descr') || '').trim();
  var imp = parseFloat(g('inv-r-imp')) || 0;
  if (!d) { toast('La descrizione è obbligatoria'); return; }
  if (imp <= 0) { toast('Indica l\'importo destinato'); return; }
  var r = await sb.from('investimenti_risorse').insert([{
    causale_id: _invCausale,
    tipo: g('inv-r-tipo') || 'altro',
    descrizione: d,
    importo: imp,
    finanziamento_id: g('inv-r-fin') || null,
    data: g('inv-r-data') || null
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  caricaInvestimenti();
}

async function invEliminaRisorsa(id) {
  if (!confirm('Tolgo questa risorsa dal totale destinato?')) return;
  var r = await sb.from('investimenti_risorse').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

// ── POPUP CARATTERISTICHE DEL FINANZIAMENTO (05/10) ────────────────────────
// Solo i dati del mutuo, senza piano di rientro: capitale, tasso, rate pagate,
// preammortamento, rata attuale e rata dopo, capitale residuo.
async function invPopupFinanziamento(finId) {
  var f = (_invDati.finanziamenti || []).filter(function (x) { return x.id === finId; })[0];
  if (!f) { toast('Finanziamento non trovato'); return; }
  var rr = await sb.from('banche_finanziamenti_rate').select('*').eq('finanziamento_id', finId).order('numero');
  var rate = rr.data || [];
  var oggi = new Date().toISOString().slice(0, 10);
  var pagate = rate.filter(function (r) { return r.data_scadenza <= oggi; });
  var prossima = rate.filter(function (r) { return r.data_scadenza > oggi; })[0];
  var pre = Number(f.rate_preammortamento || 0);
  var finePre = (pre > 0 && rate[pre - 1]) ? rate[pre - 1].data_scadenza : null;
  var rataDopo = (pre > 0 && rate[pre]) ? rate[pre].rata : (rate[0] ? rate[0].rata : null);
  var rataOggi = prossima ? prossima.rata : (rate[0] ? rate[0].rata : null);
  var residuo = prossima ? prossima.residuo_capitale : (rate.length ? 0 : f.capitale);
  var tot = rate.length || Number(f.durata_rate || 0);
  var pct = tot > 0 ? (pagate.length / tot * 100) : 0;
  var inPre = pre > 0 && pagate.length < pre;

  var sez = function (titolo, dentro) {
    return '<div style="display:flex;border-bottom:0.5px solid var(--border);padding:11px 0">'
      + '<div style="width:150px;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;padding-top:3px">' + titolo + '</div>'
      + '<div style="flex:1;display:flex;gap:22px;flex-wrap:wrap;align-items:center">' + dentro + '</div></div>';
  };
  var voce = function (lab, val, grande) {
    return '<div><div style="font-size:10px;color:var(--text-muted)">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-weight:600' + (grande ? ';font-size:15px' : '') + '">' + val + '</div></div>';
  };

  var h = '<div style="max-width:540px;margin:-24px -24px 0;border-radius:8px;overflow:hidden">';
  h += '<div style="background:#185FA5;color:#fff;padding:14px 18px">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">'
    + '<div><div style="font-size:15px;font-weight:600">' + _invEsc(f.descrizione || 'Finanziamento') + '</div>'
    + '<div style="font-size:11px;opacity:.85">' + _invEsc(f.numero_contratto || '') + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:10px;opacity:.8;text-transform:uppercase">Capitale</div>'
    + '<div style="font-size:21px;font-weight:600;font-family:var(--font-mono)">' + _invEuro(f.capitale) + '</div></div>'
    + '</div></div>';
  h += '<div style="padding:0 18px;background:var(--bg-card,var(--bg))">';
  h += sez('Condizioni',
      voce('TAN', (f.tasso != null ? Number(f.tasso).toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 4 }) + ' %' : '—'))
    + voce('Tipo', _invEsc(f.tipo_tasso || 'fisso'))
    + voce('Durata', (tot ? tot + ' mesi' : '—'))
    + voce('Erogato', _invData(f.data_erogazione)));
  if (pre > 0) {
    h += sez('Preammortamento',
        voce('Fino al', finePre ? _invData(finePre) : '—')
      + voce('Rate di soli interessi', String(pre))
      + (inPre ? '<span style="font-size:10px;background:#FAEEDA;color:#854F0B;padding:3px 9px;border-radius:9px;font-weight:600">in corso</span>'
               : '<span style="font-size:10px;background:#EAF3DE;color:#27500A;padding:3px 9px;border-radius:9px;font-weight:600">concluso</span>'));
  }
  h += sez('Rata',
      voce('Oggi', rataOggi != null ? _invEuro(rataOggi) : '—', true)
    + (pre > 0 ? voce('Dopo il preamm.', rataDopo != null ? _invEuro(rataDopo) : '—', true) : '')
    + voce('Prossima scadenza', prossima ? _invData(prossima.data_scadenza) : '—'));
  h += '<div style="display:flex;padding:11px 0 14px">'
    + '<div style="width:150px;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;padding-top:3px">Avanzamento</div>'
    + '<div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px">'
    + '<span>' + pagate.length + ' rat' + (pagate.length === 1 ? 'a pagata' : 'e pagate') + ' su ' + (tot || '—') + '</span>'
    + '<span style="font-family:var(--font-mono)">residuo ' + _invEuro(residuo) + '</span></div>'
    + '<div style="height:10px;border-radius:5px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden">'
    + '<div style="width:' + pct.toFixed(1) + '%;height:100%;background:#185FA5"></div></div></div></div>';
  h += '</div>';
  h += '<div style="display:flex;justify-content:flex-end;padding:12px 18px;background:var(--bg-card,var(--bg))">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 16px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Chiudi</button></div>';
  h += '</div>';
  apriModal(h);
}

// ── CONTO ECONOMICO PREVISIONALE DELL'IMPIANTO (05/10) ─────────────────────
// Ipotesi dal piano di ottobre 2026: produzione per kW, degrado annuo, prezzo
// dell'energia a fasce, costi operativi, accantonamento manutenzione dal 6° anno,
// ammortamento su 25 anni e contributo CER. Si possono cambiare per impianto.
var _INV_CE_DEF = {
  kwh_per_kw: 1350, degrado: 0.2, costi_op: 1500, acc_dal: 6, acc_importo: 0,
  anni_amm: 25, cer_eur: 0.0365, cer_quota: 60, cer_anni: 20
};
var _INV_PREZZI = [
  { da: 1, a: 4, p: 0.116 }, { da: 5, a: 10, p: 0.100 },
  { da: 11, a: 16, p: 0.090 }, { da: 17, a: 25, p: 0.080 }
];
// prezzo dell'anno n: la fascia di 5 anni inserita sull'impianto, se c'e'
function _invPunFascia(i, n) {
  var f = i && i.pun_fasce;
  if (!f || !f.length) return null;
  var v = f[Math.min(4, Math.floor((n - 1) / 5))];
  return (v != null && Number(v) > 0) ? Number(v) : null;
}
function _invPrezzoAnno(n, i) {
  var pf = _invPunFascia(i, n);
  if (pf != null) return pf;
  for (var i = 0; i < _INV_PREZZI.length; i++) {
    if (n >= _INV_PREZZI[i].da && n <= _INV_PREZZI[i].a) return _INV_PREZZI[i].p;
  }
  return _INV_PREZZI[_INV_PREZZI.length - 1].p;
}

// Parametri dell'impianto: quelli salvati, altrimenti i valori del piano
function _invCeParam(i) {
  var n = (i.note || '');
  var get = function (k, d) {
    var m = n.match(new RegExp('\\[' + k + '=([0-9.]+)\\]'));
    return m ? Number(m[1]) : d;
  };
  return {
    kwh_per_kw: get('kwhkw', _INV_CE_DEF.kwh_per_kw),
    degrado: get('degrado', _INV_CE_DEF.degrado),
    costi_op: get('costiop', _INV_CE_DEF.costi_op),
    acc_importo: get('accant', _INV_CE_DEF.acc_importo),
    acc_dal: _INV_CE_DEF.acc_dal,
    anni_amm: get('anniamm', _INV_CE_DEF.anni_amm),
    cer_eur: get('cereur', _INV_CE_DEF.cer_eur),
    cer_quota: get('cerquota', _INV_CE_DEF.cer_quota),
    cer_anni: _INV_CE_DEF.cer_anni
  };
}

function _invCeCalcola(i, costoNetto) {
  var P = _invCeParam(i);
  var kw = Number(i.kw || 0);
  var stima = Number(i.produzione_stimata_kwh || 0);
  if (!kw && !stima) return null;
  // produzione del 1° anno: la stima inserita (PVGIS) se c'e', altrimenti kW × kWh/kW
  var base = stima > 0 ? stima : kw * P.kwh_per_kw;
  P.stima = stima > 0 ? stima : null;
  P.base_kwh = base;
  if (stima > 0 && kw) P.kwh_per_kw = Math.round(stima / kw);
  var amm = Number(costoNetto || 0) / P.anni_amm;
  var anni = [];
  for (var n = 1; n <= 25; n++) {
    var mwh = base * Math.pow(1 - P.degrado / 100, n - 1) / 1000;
    var prezzo = _invPrezzoAnno(n, i);
    var ricavi = mwh * 1000 * prezzo;
    var costi = P.costi_op + (n >= P.acc_dal ? P.acc_importo : 0);
    var ebitda = ricavi - costi;
    var cer = (n <= P.cer_anni) ? (mwh * 1000 * P.cer_quota / 100 * P.cer_eur) : 0;
    anni.push({ n: n, mwh: mwh, prezzo: prezzo, ricavi: ricavi, costi: costi,
                ebitda: ebitda, amm: amm, utile: ebitda - amm, cer: cer, utile2: ebitda - amm + cer });
  }
  return { P: P, amm: amm, anni: anni };
}

function _invBloccoCE(i, costoNetto) {
  var CE = _invCeCalcola(i, costoNetto);
  if (!CE) {
    return '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Conto economico previsionale</div>'
      + '<div style="font-size:12px;color:var(--text-muted)">Per calcolarlo servono i <strong>kW installati</strong> o la <strong>produzione stimata</strong>: inseriscili con ✏️ Modifica.</div></div>';
  }
  var P = CE.P, a = CE.anni;
  var tot25 = a.reduce(function (s, x) { return s + x.utile2; }, 0);
  var kpi = function (lab, val, col) {
    return '<div style="flex:1;min-width:140px;border:0.5px solid var(--border);border-radius:9px;padding:9px 11px">'
      + '<div style="font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:17px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div></div>';
  };
  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
    + '<div><div style="font-size:13px;font-weight:700">Conto economico previsionale</div>'
    + '<div style="font-size:11px;color:var(--text-muted)">' + _invTestoProd(i, P)
    + ' · degrado ' + String(P.degrado).replace('.', ',') + '%/anno · costi ' + _invEuroK(P.costi_op) + '/anno'
    + ' · CER ' + String(P.cer_eur).replace('.', ',') + ' €/kWh sul ' + P.cer_quota + '%</div></div>'
    + '<button onclick="invApriCE(\'' + i.id + '\')" class="btn-primary" style="font-size:12px;padding:7px 14px">📊 Conto economico completo</button></div>';
  h += '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-top:10px">'
    + kpi('EBITDA 1° anno', _invEuroK(a[0].ebitda))
    + kpi('Utile 1° anno (prima del mutuo)', _invEuroK(a[0].utile), a[0].utile >= 0 ? '#27500A' : '#A32D2D')
    + kpi('Utile con CER 1° anno', _invEuroK(a[0].utile2), '#27500A')
    + kpi('Utile 25 anni con CER', _invEuroK(tot25), '#27500A')
    + '</div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:8px">Interessi, rata del mutuo, cassa, copertura della rata e indici nel conto economico completo.</div>';
  h += '</div>';
  return h;
}

// ── CONTO ECONOMICO COMPLETO IN MODALE GRANDE (08/10) ──────────────────────
// Regole fissate con Rinaldo l'08/10/2026:
//  · RATA: per gli impianti su tetto si prende una QUOTA delle rate vere dei mutui
//    collegati alle risorse della causale, in proporzione alla spesa prevista
//    dell'impianto sul totale delle risorse (Mungo Bus 101.700 / 600.000 = 16,95%).
//    Le rate sono quelle di banche_finanziamenti_rate (preammortamento compreso).
//  · Il secondo mutuo Intesa da 100.000 NON entra nel fotovoltaico.
//  · Prezzo dell'energia: piano attuale (1.350 kWh/kW, 0,116 per 4 anni poi a scendere).
//  · Niente imposte: tutto ante imposte, come nel dossier per la banca.
//  · DSCR sul solo ricavo dell'energia (EBITDA / rata); con la CER in colonna a parte.
//  · L'anno 1 parte dall'allaccio alla rete; se manca, dalla fine prevista dei lavori;
//    se manca anche quella, da oggi. Le rate pagate prima stanno nella colonna "Cantiere".
//  · I parchi con finanziamento proprio (BCC) sono ancora da definire: per ora prendono
//    la quota della causale come gli altri.

// testo della produzione usata: stima inserita oppure kW × kWh/kW
function _invTestoProd(i, P) {
  var kwT = i.kw ? Number(i.kw).toLocaleString('it-IT') + ' kW · ' : '';
  if (P.stima) return kwT + 'produzione stimata <strong>' + Math.round(P.stima).toLocaleString('it-IT') + ' kWh/anno</strong>'
    + (i.kw ? ' (' + P.kwh_per_kw.toLocaleString('it-IT') + ' kWh/kW)' : '');
  return kwT + P.kwh_per_kw.toLocaleString('it-IT') + ' kWh/kW (nessuna stima inserita: valore di base)';
}

// prezzi usati, raggruppati per periodi con lo stesso valore
function _invTestoPrezzi(i) {
  var out = [], da = 1, cur = _invPrezzoAnno(1, i);
  for (var n = 2; n <= 26; n++) {
    var p = n <= 25 ? _invPrezzoAnno(n, i) : null;
    if (p !== cur) { out.push(cur.toFixed(3).replace('.', ',') + ' €/kWh anni ' + da + '-' + (n - 1)); da = n; cur = p; }
  }
  return out.join(', ') + (_invPunFascia(i, 1) != null || (i.pun_fasce && i.pun_fasce.some(function (x) { return x != null; })) ? ' (PUN inserito sull\'impianto)' : ' (prezzi di base)');
}

function _invAddAnni(iso, n) {
  var y = Number(iso.slice(0, 4)) + n, md = iso.slice(5, 10);
  if (md === '02-29') md = '02-28';
  return y + '-' + md;
}

// Quota dei mutui della causale attribuita all'impianto
function _invQuotaDebito(i) {
  var D = _invDati;
  var risTot = (D.risorse || []).reduce(function (s, r) { return s + Number(r.importo || 0); }, 0);
  var spesa = Number(i.spesa_prevista || 0);
  var q = (risTot > 0 && spesa > 0) ? spesa / risTot : 0;
  var mutui = [];
  (D.risorse || []).forEach(function (r) {
    if (!r.finanziamento_id) return;
    var f = (D.finanziamenti || []).filter(function (x) { return x.id === r.finanziamento_id; })[0];
    if (!f || !Number(f.capitale)) return;
    // parte del mutuo destinata alla causale (di solito tutto) × quota dell'impianto
    var quotaRata = q * Math.min(1, Number(r.importo || 0) / Number(f.capitale));
    mutui.push({ fin: f, risorsa: r, quotaRata: quotaRata, debito: q * Number(r.importo || 0) });
  });
  var debito = mutui.reduce(function (s, m) { return s + m.debito; }, 0);
  return { q: q, risTot: risTot, mutui: mutui, debito: debito, propri: Math.max(0, spesa - debito) };
}

function _invTir(flussi) {
  var van = function (r) { return flussi.reduce(function (s, f, t) { return s + f / Math.pow(1 + r, t); }, 0); };
  var lo = -0.99, hi = 1;
  if (van(lo) * van(hi) > 0) return null;
  for (var k = 0; k < 200; k++) {
    var mid = (lo + hi) / 2;
    if (van(lo) * van(mid) <= 0) hi = mid; else lo = mid;
  }
  return (lo + hi) / 2;
}

// Calcolo completo: CE con interessi, cassa, DSCR, indici
function _invCeCompleto(i, rateFin) {
  var spesa = Number(i.spesa_prevista || 0);
  var CE = _invCeCalcola(i, spesa);
  if (!CE) return null;
  var Q = _invQuotaDebito(i);
  var oggi = new Date().toISOString().slice(0, 10);
  var inizio = i.data_allaccio || i.data_fine || oggi;
  var origine = i.data_allaccio ? 'allaccio alla rete' : (i.data_fine ? 'fine prevista dei lavori' : 'oggi (mancano allaccio e fine lavori)');
  var limiti = [];
  for (var n = 0; n <= 25; n++) limiti.push(_invAddAnni(inizio, n));

  // rate dell'impianto per anno (0 = cantiere, prima dell'anno 1)
  var fin = [];
  for (var k = 0; k <= 25; k++) fin.push({ rata: 0, interessi: 0, capitale: 0 });
  Q.mutui.forEach(function (m) {
    (rateFin[m.fin.id] || []).forEach(function (r) {
      var d = String(r.data_scadenza).slice(0, 10), idx = 0;
      if (d >= limiti[0]) {
        idx = -1;
        for (var n2 = 1; n2 <= 25; n2++) if (d >= limiti[n2 - 1] && d < limiti[n2]) { idx = n2; break; }
        if (idx < 0) return;
      }
      fin[idx].rata += Number(r.rata || 0) * m.quotaRata;
      fin[idx].interessi += Number(r.quota_interessi || 0) * m.quotaRata;
      fin[idx].capitale += Number(r.quota_capitale || 0) * m.quotaRata;
    });
  });

  var cum = -Q.propri - fin[0].rata;
  var cumProg = -spesa, rientroProg = null, rientroPropri = null;
  var anni = CE.anni.map(function (x) {
    var f = fin[x.n];
    var utileFin = x.ebitda - x.amm - f.interessi;
    var flusso = x.ebitda + x.cer - f.rata;
    var cumPrima = cum; cum += flusso;
    if (rientroPropri == null && cumPrima < 0 && cum >= 0 && flusso > 0) rientroPropri = x.n - 1 + (-cumPrima / flusso);
    var progPrima = cumProg; cumProg += x.ebitda + x.cer;
    if (rientroProg == null && progPrima < 0 && cumProg >= 0) rientroProg = x.n - 1 + (-progPrima / (x.ebitda + x.cer));
    return Object.assign({}, x, {
      anno: Number(limiti[x.n - 1].slice(0, 4)),
      interessi: f.interessi, rata: f.rata, capitale: f.capitale,
      utileFin: utileFin, utileFin2: utileFin + x.cer,
      flusso: flusso, cumulata: cum,
      dscr: f.rata > 0.5 ? x.ebitda / f.rata : null,
      dscr2: f.rata > 0.5 ? (x.ebitda + x.cer) / f.rata : null
    });
  });
  if (rientroPropri == null && Q.propri + fin[0].rata <= 0) rientroPropri = 0;

  var conRata = anni.filter(function (x) { return x.dscr != null; });
  var minD = conRata.length ? conRata.reduce(function (m, x) { return x.dscr < m.dscr ? x : m; }) : null;
  var minD2 = conRata.length ? conRata.reduce(function (m, x) { return x.dscr2 < m.dscr2 ? x : m; }) : null;
  var tir = spesa > 0 ? _invTir([-spesa].concat(anni.map(function (x) { return x.ebitda + x.cer; }))) : null;
  var tan = Q.mutui.length ? Number(Q.mutui[0].fin.tasso || 0) / 100 : null;
  var van = (tan != null && spesa > 0)
    ? anni.reduce(function (s, x) { return s + (x.ebitda + x.cer) / Math.pow(1 + tan, x.n); }, -spesa) : null;
  var kwh = anni.reduce(function (s, x) { return s + x.mwh * 1000; }, 0);
  var costiTot = anni.reduce(function (s, x) { return s + x.costi; }, 0);
  var intTot = anni.reduce(function (s, x) { return s + x.interessi; }, 0) + fin[0].interessi;
  return {
    CE: CE, Q: Q, anni: anni, cantiere: fin[0], inizio: inizio, origine: origine, spesa: spesa,
    minD: minD, minD2: minD2, tir: tir, tan: tan, van: van,
    costoKwh: kwh > 0 ? (spesa + costiTot + intTot) / kwh : null,
    rientroProg: rientroProg, rientroPropri: rientroPropri,
    intTot: intTot, rataTot: anni.reduce(function (s, x) { return s + x.rata; }, 0) + fin[0].rata,
    utile25: anni.reduce(function (s, x) { return s + x.utileFin2; }, 0)
  };
}

async function invApriCE(impId) {
  var i = (_invDati.impianti || []).filter(function (x) { return x.id === impId; })[0];
  if (!i) return;
  var Q = _invQuotaDebito(i);
  var ids = Q.mutui.map(function (m) { return m.fin.id; });
  var rateFin = {};
  if (ids.length) {
    var rr = await sb.from('banche_finanziamenti_rate').select('finanziamento_id,numero,data_scadenza,rata,quota_capitale,quota_interessi,residuo_capitale')
      .in('finanziamento_id', ids).order('numero').limit(5000);
    if (rr.error) { toast('Errore rate: ' + rr.error.message); return; }
    (rr.data || []).forEach(function (r) { (rateFin[r.finanziamento_id] = rateFin[r.finanziamento_id] || []).push(r); });
  }
  var R = _invCeCompleto(i, rateFin);
  if (!R) { toast('Servono i kW installati'); return; }
  _invCeUltimo = { i: i, R: R };
  _invMostraOverlayCE(_invHtmlCE(i, R));
}
var _invCeUltimo = null;

// ── STAMPA / PDF DEL CONTO ECONOMICO (08/10) ──────────────────────────────
function invStampaCE() {
  if (!_invCeUltimo) { toast('Apri prima il conto economico'); return; }
  var i = _invCeUltimo.i, R = _invCeUltimo.R, a = R.anni, Q = R.Q, P = R.CE.P, A = _INV_AZIENDA;
  var e0 = function (v) { return Math.round(v).toLocaleString('it-IT'); };
  var neg = function (v) { return Math.abs(v) < 0.5 ? '—' : '−' + e0(v); };
  var dec = function (v, d) { return v == null ? '—' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var x2 = function (v) { return v == null ? '—' : dec(v, 2) + 'x'; };
  var anniTxt = function (v) { return v == null ? 'oltre 25 anni' : dec(v, 1) + ' anni'; };
  var ROSSO = '#A32D2D', VERDE = '#27500A';
  var colD = function (v) { return v == null ? '#777' : (v >= 1.25 ? VERDE : (v >= 1 ? '#854F0B' : ROSSO)); };
  var cant = R.cantiere.rata > 0.5;
  var oggi = _invData(new Date().toISOString().slice(0, 10));

  // righe della tabella: [etichetta, valore(x), formato, opzioni]
  var RIGHE = [
    ['S', 'Conto economico'],
    ['Energia (MWh)', function (x) { return x.mwh; }, function (v) { return dec(v, 1); }],
    ['Prezzo €/kWh', function (x) { return x.prezzo; }, function (v) { return dec(v, 3); }, { tot: false, col: '#777' }],
    ['Ricavi energia', function (x) { return x.ricavi; }, e0],
    ['Manutenzione e costi', function (x) { return x.costi; }, neg, { col: ROSSO }],
    ['EBITDA', function (x) { return x.ebitda; }, e0, { b: true }],
    ['Ammortamento', function (x) { return x.amm; }, neg, { col: ROSSO }],
    ['Interessi mutuo', function (x) { return x.interessi; }, neg, { col: ROSSO, cv: R.cantiere.interessi }],
    ['Utile ante imposte', function (x) { return x.utileFin; }, e0, { b: true, neg: true }],
    ['Contributo CER', function (x) { return x.cer; }, e0, { col: VERDE }],
    ['Utile con CER', function (x) { return x.utileFin2; }, e0, { b: true, neg: true }],
    ['S', 'Cassa'],
    ['Risultato dell\'anno', function (x) { return x.utileFin2; }, e0, { b: true, neg: true, cv: -R.cantiere.interessi }],
    ['+ Ammortamento', function (x) { return x.amm; }, e0, { col: VERDE }],
    ['− Capitale restituito', function (x) { return x.capitale; }, neg, { col: ROSSO, cv: R.cantiere.capitale }],
    ['Flusso di cassa', function (x) { return x.flusso; }, e0, { b: true, neg: true, cv: -R.cantiere.rata }],
    ['Cassa cumulata', function (x) { return x.cumulata; }, e0, { tot: false, segno: true }],
    ['S', 'Copertura della rata'],
    ['Rata alla banca', function (x) { return x.rata; }, neg, { col: '#777', cv: R.cantiere.rata }],
    ['DSCR solo energia', function (x) { return x.dscr; }, x2, { tot: false, dscr: true }],
    ['DSCR con CER', function (x) { return x.dscr2; }, x2, { tot: false, dscr: true }]
  ];
  var tabella = function (da, al, conCant, conTot) {
    var sub = a.slice(da - 1, al);
    var nCol = sub.length + 1 + (conCant ? 1 : 0) + (conTot ? 1 : 0);
    var t = '<table><tr><th class="l">€</th>' + (conCant ? '<th>Cantiere</th>' : '')
      + sub.map(function (x) { return '<th>Anno ' + x.n + '<br><span>' + x.anno + '</span></th>'; }).join('')
      + (conTot ? '<th>Tot. 25</th>' : '') + '</tr>';
    RIGHE.forEach(function (r) {
      if (r[0] === 'S') { t += '<tr class="sez"><td colspan="' + nCol + '">' + r[1] + '</td></tr>'; return; }
      var o = r[3] || {};
      t += '<tr' + (o.b ? ' class="b"' : '') + '><td class="l"' + (o.col ? ' style="color:' + o.col + '"' : '') + '>' + r[0] + '</td>';
      if (conCant) t += '<td' + (o.col ? ' style="color:' + o.col + '"' : '') + '>' + (o.cv != null ? r[2](o.cv) : '') + '</td>';
      sub.forEach(function (x) {
        var v = r[1](x);
        var c = o.dscr ? colD(v) : (o.segno ? (v < 0 ? ROSSO : VERDE) : (o.neg && v < 0 ? ROSSO : o.col));
        t += '<td' + (c ? ' style="color:' + c + '"' : '') + '>' + r[2](v) + '</td>';
      });
      if (conTot) {
        var tot = a.reduce(function (s2, x) { return s2 + (r[1](x) || 0); }, 0) + (cant && o.cv != null ? o.cv : 0);
        t += '<td class="tot">' + (o.tot === false ? '' : r[2](tot)) + '</td>';
      }
      t += '</tr>';
    });
    return t + '</table>';
  };
  var ind = function (lab, val, sub, col) {
    return '<div class="ind"><div class="il">' + lab + '</div><div class="iv"' + (col ? ' style="color:' + col + '"' : '') + '>' + val + '</div><div class="is">' + (sub || '&nbsp;') + '</div></div>';
  };
  var testa = '<div class="head"><div><div class="az">' + A.nome + '</div><div class="az2">' + A.indirizzo + ' · ' + A.citta + ' · P.IVA ' + A.piva + '</div></div>'
    + '<div style="text-align:right"><div class="tit">Conto economico previsionale</div><div class="az2">' + _invEsc(i.nome) + (i.luogo ? ' — ' + _invEsc(i.luogo) : '') + ' · stampato il ' + oggi + '</div></div></div>';

  var doc = '<!doctype html><html><head><meta charset="utf-8"><title>Conto economico ' + _invEsc(i.nome) + '</title><style>'
    + '@page{size:A4 landscape;margin:10mm}'
    + 'body{font-family:Arial,Helvetica,sans-serif;color:#222;font-size:9px;margin:0;background:#fff}'
    + '.head{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:1.5px solid #185FA5;padding-bottom:5px;margin-bottom:7px}'
    + '.az{font-size:13px;font-weight:700}.az2{font-size:8.5px;color:#666}.tit{font-size:15px;font-weight:700;color:#185FA5}'
    + '.box{border:0.5px solid #bbb;border-radius:5px;padding:5px 8px;margin-bottom:6px;line-height:1.45}'
    + '.inds{display:grid;grid-template-columns:repeat(8,1fr);gap:5px;margin-bottom:7px}'
    + '.ind{border:0.5px solid #bbb;border-radius:5px;padding:4px 6px}.il{font-size:7px;color:#777;text-transform:uppercase;letter-spacing:.3px}'
    + '.iv{font-size:12.5px;font-weight:700;font-family:Consolas,monospace}.is{font-size:7px;color:#777}'
    + 'table{width:100%;border-collapse:collapse;font-size:9.5px;margin-bottom:5px}'
    + 'th{font-size:8px;color:#666;text-transform:uppercase;text-align:right;padding:3px 3px;border-bottom:1px solid #999;font-weight:600}th span{font-weight:400}'
    + 'td{text-align:right;padding:3.5px 3px;font-family:Consolas,monospace;border-bottom:0.3px solid #e3e3e3;white-space:nowrap}'
    + '.l{text-align:left;font-family:Arial,Helvetica,sans-serif;white-space:nowrap}'
    + 'tr.b td{font-weight:700;background:#f4f4f2}tr.sez td{text-align:left;font-family:Arial,sans-serif;font-weight:700;color:#185FA5;font-size:8px;text-transform:uppercase;padding-top:5px;border-bottom:0}'
    + '.tot{font-weight:700}.nota{font-size:7.5px;color:#666;line-height:1.45;margin-top:4px}'
    + '.pb{page-break-before:always}'
    + '</style></head><body>';
  doc += testa;
  doc += '<div class="box"><strong>' + _invEsc(i.nome) + '</strong> · ' + _invTestoProd(i, P).replace(/<[^>]+>/g, '')
    + ' · degrado ' + String(P.degrado).replace('.', ',') + '%/anno · manutenzione e costi ' + _invEuroK(P.costi_op) + '/anno'
    + ' · CER ' + String(P.cer_eur).replace('.', ',') + ' €/kWh sul ' + P.cer_quota + '% per ' + P.cer_anni + ' anni · anno 1 dal ' + _invData(R.inizio) + ' (' + R.origine + ')'
    + '<br>Prezzo dell\'energia: ' + _invTestoPrezzi(i) + '.'
    + (R.spesa ? '<br><strong>Investimento ' + _invEuro(R.spesa) + '</strong> · mutuo ' + _invEuro(Q.debito) + ' · mezzi propri ' + _invEuro(Q.propri)
        + Q.mutui.map(function (m) { return ' · ' + _invEsc(m.fin.descrizione || '') + ' ' + _invEsc(m.fin.numero_contratto || '') + ', TAN ' + m.fin.tasso + '%, quota ' + dec(m.quotaRata * 100, 2) + '% di ogni rata'; }).join('')
        + (cant ? ' · rate pagate in cantiere ' + _invEuro(R.cantiere.rata) : '') : '')
    + '</div>';
  doc += '<div class="inds">'
    + ind('DSCR minimo', R.minD ? x2(R.minD.dscr) : '—', R.minD ? 'anno ' + R.minD.n + ' · solo energia' : 'nessuna rata', colD(R.minD && R.minD.dscr))
    + ind('DSCR min. con CER', R.minD2 ? x2(R.minD2.dscr2) : '—', R.minD2 ? 'anno ' + R.minD2.n : '', colD(R.minD2 && R.minD2.dscr2))
    + ind('Rientro investimento', anniTxt(R.rientroProg), 'EBITDA + CER sul costo')
    + ind('Rientro mezzi propri', anniTxt(R.rientroPropri), 'cassa dopo le rate')
    + ind('TIR progetto', R.tir != null ? dec(R.tir * 100, 1) + '%' : '—', '25 anni, con CER')
    + ind('VAN', R.van != null ? _invEuroK(R.van) : '—', R.tan != null ? 'al TAN ' + dec(R.tan * 100, 3) + '%' : '', R.van != null ? (R.van >= 0 ? VERDE : ROSSO) : null)
    + ind('Costo del kWh', R.costoKwh != null ? dec(R.costoKwh, 4) + ' €' : '—', 'inv. + costi + interessi / kWh')
    + ind('Utile 25 anni con CER', _invEuroK(R.utile25), 'dopo amm. e interessi', R.utile25 >= 0 ? VERDE : ROSSO)
    + '</div>';
  doc += tabella(1, 13, cant, false);
  doc += '<div class="pb"></div>' + testa + tabella(14, 25, false, true);
  doc += '<div class="nota">Rate reali del mutuo, attribuite all\'impianto in proporzione alla sua spesa prevista sulle risorse destinate; sommate per anno di esercizio. '
    + 'Flusso di cassa = risultato dell\'anno + ammortamento − capitale restituito (cioè EBITDA + CER − rata). '
    + 'La cassa cumulata parte dai mezzi propri investiti' + (cant ? ' e dalle rate pagate in cantiere' : '') + '. '
    + 'DSCR = EBITDA / rata: verde da 1,25x, giallo fra 1 e 1,25x, rosso sotto 1. Ammortamento su ' + P.anni_amm + ' anni. Valori in euro, ante imposte.</div>';
  doc += '</body></html>';

  var w = window.open('', '_blank');
  if (!w) { toast('Abilita i popup per stampare'); return; }
  w.document.write(doc); w.document.close(); w.focus();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

function _invNum(v) {
  v = String(v == null ? '' : v).trim().replace(/\s/g, '');
  if (v === '') return null;
  if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
  var n = parseFloat(v);
  return isFinite(n) ? n : NaN;
}

// Salva le ipotesi del conto economico: produzione stimata e PUN a fasce di 5 anni
async function invSalvaIpotesi(impId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var v = _invNum((document.getElementById('inv-ce-stima') || {}).value);
  if (v !== null && !(v > 0)) { toast('Produzione non valida'); return; }
  var pun = [], almeno = false;
  for (var k = 0; k < 5; k++) {
    var x = _invNum((document.getElementById('inv-ce-pun' + k) || {}).value);
    if (x !== null && !(x > 0 && x < 2)) { toast('Prezzo anni ' + (k * 5 + 1) + '-' + (k * 5 + 5) + ' non valido (in €/kWh, es. 0,10)'); return; }
    pun.push(x); if (x !== null) almeno = true;
  }
  var upd = { produzione_stimata_kwh: v, pun_fasce: almeno ? pun : null, updated_at: new Date().toISOString() };
  var r = await sb.from('investimenti_impianti').update(upd).eq('id', impId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  var i = (_invDati.impianti || []).filter(function (x) { return x.id === impId; })[0];
  if (i) { i.produzione_stimata_kwh = upd.produzione_stimata_kwh; i.pun_fasce = upd.pun_fasce; }
  toast('✓ Ipotesi salvate');
  await invApriCE(impId);
  if (_invImpiantoAperto === impId) _invRenderImpianto();
}
var invSalvaStima = invSalvaIpotesi;

function invChiudiCE() {
  var o = document.getElementById('inv-ce-overlay');
  if (o) o.remove();
  document.removeEventListener('keydown', _invCeEsc);
}
function _invCeEsc(e) { if (e.key === 'Escape') invChiudiCE(); }
function _invMostraOverlayCE(html) {
  invChiudiCE();
  var o = document.createElement('div');
  o.id = 'inv-ce-overlay';
  o.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.45);z-index:1050;display:flex;align-items:flex-start;justify-content:center;padding:18px 10px;overflow-y:auto';
  o.onclick = function (e) { if (e.target === o) invChiudiCE(); };
  o.innerHTML = '<div style="background:var(--bg-card,var(--bg));color:var(--text);border-radius:12px;width:min(1280px,100%);padding:18px 20px;box-shadow:0 10px 40px rgba(0,0,0,.25)">' + html + '</div>';
  document.body.appendChild(o);
  document.addEventListener('keydown', _invCeEsc);
}

function _invHtmlCE(i, R) {
  var a = R.anni, Q = R.Q, P = R.CE.P;
  var e0 = function (v) { return Math.round(v).toLocaleString('it-IT'); };
  var neg = function (v) { return Math.abs(v) < 0.5 ? '—' : '−' + e0(v); };
  var dec = function (v, d) { return v == null ? '—' : v.toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d }); };
  var anniTxt = function (v) { return v == null ? 'oltre 25 anni' : dec(v, 1) + ' anni'; };
  var ROSSO = '#A32D2D', VERDE = '#27500A';
  var colD = function (v) { return v == null ? 'var(--text-muted)' : (v >= 1.25 ? VERDE : (v >= 1 ? '#854F0B' : ROSSO)); };

  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    + '<div><div style="font-size:18px;font-weight:700">Conto economico — ' + _invEsc(i.nome) + '</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">' + _invTestoProd(i, P) + ' · degrado ' + String(P.degrado).replace('.', ',') + '%/anno · costi ' + _invEuroK(P.costi_op) + '/anno'
    + (P.acc_importo ? ' (+' + _invEuroK(P.acc_importo) + ' dal ' + P.acc_dal + '° anno)' : '') + ' · CER ' + String(P.cer_eur).replace('.', ',') + ' €/kWh sul ' + P.cer_quota + '% per ' + P.cer_anni + ' anni · ante imposte</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Anno 1 dal <strong>' + _invData(R.inizio) + '</strong> (' + R.origine + ')</div></div>'
    + '<div style="display:flex;gap:8px"><button onclick="invStampaCE()" style="font-size:13px;padding:7px 14px;border:0.5px solid #185FA5;border-radius:7px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">🖨 Stampa / PDF</button>'
    + '<button onclick="invChiudiCE()" style="font-size:13px;padding:7px 14px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">✕ Chiudi</button></div></div>';

  // ── ipotesi modificabili qui: produzione stimata e PUN a fasce di 5 anni
  if (_invPuo()) {
    var inpS = 'padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font-mono)';
    var lbS = 'display:block;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;margin-bottom:3px';
    h += '<div style="border:0.5px solid #639922;border-radius:10px;padding:10px 13px;margin-bottom:10px;font-size:12px">'
      + '<div style="font-weight:600;color:#3B6D11;margin-bottom:8px">Ipotesi del conto economico</div>'
      + '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end">'
      + '<div><label style="' + lbS + '">⚡ Produzione 1° anno kWh</label>'
      + '<input id="inv-ce-stima" inputmode="decimal" value="' + (i.produzione_stimata_kwh ? Math.round(i.produzione_stimata_kwh) : '') + '" placeholder="' + Math.round(P.base_kwh) + '" style="' + inpS + ';width:120px"></div>';
    for (var k = 0; k < 5; k++) {
      var da = k * 5 + 1, al = k * 5 + 5;
      var salv = (i.pun_fasce && i.pun_fasce[k] != null && Number(i.pun_fasce[k]) > 0) ? Number(i.pun_fasce[k]) : null;
      var base = [];
      for (var y = da; y <= al; y++) { var pb = _invPrezzoAnno(y, null); if (base.indexOf(pb) < 0) base.push(pb); }
      h += '<div><label style="' + lbS + '">PUN anni ' + da + '-' + al + '</label>'
        + '<input id="inv-ce-pun' + k + '" inputmode="decimal" value="' + (salv != null ? String(salv).replace('.', ',') : '') + '"'
        + ' placeholder="' + base.map(function (b2) { return b2.toFixed(3).replace('.', ','); }).join('→') + '" style="' + inpS + ';width:118px"></div>';
    }
    h += '<button onclick="invSalvaIpotesi(\'' + i.id + '\')" class="btn-primary" style="font-size:12px;padding:7px 14px">Salva e ricalcola</button></div>'
      + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Produzione: es. "Produzione annuale FV" del PVGIS; vuoto = ' + _INV_CE_DEF.kwh_per_kw + ' kWh/kW × kW. '
      + 'PUN in €/kWh (es. 0,10); una fascia vuota usa il prezzo di base scritto in grigio.</div></div>';
  }

  // ── finanziamento dell'impianto
  h += '<div style="border:0.5px solid var(--border);border-radius:10px;padding:10px 13px;margin-bottom:12px;font-size:12px">';
  if (!R.spesa) {
    h += '<span style="color:' + ROSSO + '">Spesa prevista a zero: senza investimento non ci sono ammortamento, quota di mutuo e indici.</span>';
  } else {
    h += '<strong>Investimento ' + _invEuro(R.spesa) + '</strong> = ' + dec(Q.q * 100, 2) + '% delle risorse della causale (' + _invEuroK(Q.risTot) + ')'
      + ' → <strong>mutuo ' + _invEuro(Q.debito) + '</strong> · <strong>mezzi propri ' + _invEuro(Q.propri) + '</strong>';
    Q.mutui.forEach(function (m) {
      h += '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">' + _invEsc(m.fin.descrizione || m.fin.numero_contratto) + ' ' + _invEsc(m.fin.numero_contratto || '')
        + ' · TAN ' + m.fin.tasso + '% · all\'impianto il ' + dec(m.quotaRata * 100, 2) + '% di ogni rata</div>';
    });
    if (!Q.mutui.length) h += '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">Nessun mutuo collegato alle risorse della causale: niente rata.</div>';
    if (R.cantiere.rata > 0.5) {
      h += '<div style="font-size:11px;color:#854F0B;margin-top:3px">Prima dell\'anno 1 (cantiere) si pagano ' + _invEuro(R.cantiere.rata)
        + ' di rate, di cui interessi ' + _invEuro(R.cantiere.interessi) + '.</div>';
    }
  }
  h += '</div>';

  // ── indici
  var kpi = function (lab, val, sub, col) {
    return '<div style="flex:1;min-width:150px;border:0.5px solid var(--border);border-radius:10px;padding:10px 12px">'
      + '<div style="font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div>'
      + '<div style="font-size:10.5px;color:var(--text-muted)">' + (sub || '&nbsp;') + '</div></div>';
  };
  h += '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:14px">'
    + kpi('DSCR minimo', R.minD ? dec(R.minD.dscr, 2) + 'x' : '—', R.minD ? 'anno ' + R.minD.n + ' · solo energia' : 'nessuna rata', colD(R.minD && R.minD.dscr))
    + kpi('DSCR minimo con CER', R.minD2 ? dec(R.minD2.dscr2, 2) + 'x' : '—', R.minD2 ? 'anno ' + R.minD2.n : '&nbsp;', colD(R.minD2 && R.minD2.dscr2))
    + kpi('Rientro investimento', anniTxt(R.rientroProg), 'EBITDA + CER sul costo')
    + kpi('Rientro mezzi propri', anniTxt(R.rientroPropri), 'cassa dopo le rate')
    + kpi('TIR progetto', R.tir != null ? dec(R.tir * 100, 1) + '%' : '—', '25 anni, con CER')
    + kpi('VAN', R.van != null ? _invEuroK(R.van) : '—', R.tan != null ? 'scontato al TAN ' + dec(R.tan * 100, 3) + '%' : 'manca il tasso', R.van != null ? (R.van >= 0 ? VERDE : ROSSO) : null)
    + kpi('Costo del kWh', R.costoKwh != null ? dec(R.costoKwh, 4) + ' €' : '—', 'investimento + costi + interessi / kWh')
    + kpi('Utile 25 anni con CER', _invEuroK(R.utile25), 'dopo ammortamento e interessi', R.utile25 >= 0 ? VERDE : ROSSO)
    + '</div>';

  // ── tabella anno per anno (25 anni, scorre in orizzontale)
  var th = 'padding:5px 7px;border-bottom:1.5px solid var(--border);text-align:right;white-space:nowrap';
  var td = 'padding:5px 7px;text-align:right;font-family:var(--font-mono);white-space:nowrap';
  var tdL = 'padding:5px 9px;text-align:left;white-space:nowrap;position:sticky;left:0;background:var(--bg-card,var(--bg));z-index:1';
  var cant = R.cantiere.rata > 0.5;
  var t = '<div style="overflow-x:auto;border:0.5px solid var(--border);border-radius:10px">'
    + '<table style="border-collapse:collapse;font-size:11px;min-width:100%">';
  t += '<tr style="color:var(--text-muted);font-size:9.5px;text-transform:uppercase"><th style="' + th + ';' + tdL + '">€</th>'
    + (cant ? '<th style="' + th + '">Cantiere</th>' : '')
    + a.map(function (x) { return '<th style="' + th + '">Anno ' + x.n + '<div style="font-weight:400">' + x.anno + '</div></th>'; }).join('')
    + '<th style="' + th + '">Tot. 25</th></tr>';
  var sez = function (tit) {
    return '<tr><td colspan="' + (a.length + 2 + (cant ? 1 : 0)) + '" style="padding:9px 9px 4px;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.4px;color:#185FA5">'
      + '<span style="position:sticky;left:9px">' + tit + '</span></td></tr>';
  };
  // riga: fn(x) -> valore, fmt, opzioni { tot, col, b, cantVal }
  var riga = function (lab, fn, fmt, o) {
    o = o || {};
    var st = o.b ? 'font-weight:700;background:var(--bg-kpi,var(--bg))' : 'border-bottom:0.5px solid var(--border)';
    var r = '<tr style="' + st + '"><td style="' + tdL + (o.b ? ';font-weight:700;background:var(--bg-kpi,var(--bg-card,var(--bg)))' : '') + (o.col ? ';color:' + o.col : '') + '">' + lab + '</td>';
    if (cant) r += '<td style="' + td + (o.col ? ';color:' + o.col : '') + '">' + (o.cantVal != null ? fmt(o.cantVal) : '') + '</td>';
    var tot = 0;
    a.forEach(function (x) {
      var v = fn(x); tot += (v || 0);
      var c = o.colFn ? o.colFn(v) : o.col;
      r += '<td style="' + td + (c ? ';color:' + c : '') + '">' + fmt(v) + '</td>';
    });
    r += '<td style="' + td + ';font-weight:700">' + (o.tot === false ? '' : fmt(tot + (o.cantVal || 0))) + '</td></tr>';
    return r;
  };
  t += sez('Conto economico');
  t += riga('Energia (MWh)', function (x) { return x.mwh; }, function (v) { return dec(v, 1); });
  t += riga('Prezzo €/kWh', function (x) { return x.prezzo; }, function (v) { return dec(v, 3); }, { tot: false, col: 'var(--text-muted)' });
  t += riga('Ricavi energia', function (x) { return x.ricavi; }, e0);
  t += riga('Manutenzione e costi', function (x) { return x.costi; }, neg, { col: ROSSO });
  t += riga('EBITDA', function (x) { return x.ebitda; }, e0, { b: true });
  t += riga('Ammortamento', function (x) { return x.amm; }, neg, { col: ROSSO });
  t += riga('Interessi mutuo', function (x) { return x.interessi; }, neg, { col: ROSSO, cantVal: cant ? R.cantiere.interessi : null });
  t += riga('Utile ante imposte', function (x) { return x.utileFin; }, e0, { b: true, colFn: function (v) { return v < 0 ? ROSSO : null; } });
  t += riga('Contributo CER', function (x) { return x.cer; }, e0, { col: VERDE });
  t += riga('Utile con CER', function (x) { return x.utileFin2; }, e0, { b: true, colFn: function (v) { return v < 0 ? ROSSO : null; } });
  t += sez('Cassa');
  t += riga('Risultato dell\'anno', function (x) { return x.utileFin2; }, e0, { b: true, colFn: function (v) { return v < 0 ? ROSSO : null; }, cantVal: cant ? -R.cantiere.interessi : null });
  t += riga('+ Ammortamento (non è un\'uscita)', function (x) { return x.amm; }, e0, { col: VERDE });
  t += riga('− Capitale restituito alla banca', function (x) { return x.capitale; }, neg, { col: ROSSO, cantVal: cant ? R.cantiere.capitale : null });
  t += riga('Flusso di cassa', function (x) { return x.flusso; }, e0, { b: true, colFn: function (v) { return v < 0 ? ROSSO : null; }, cantVal: cant ? -R.cantiere.rata : null });
  t += riga('Cassa cumulata', function (x) { return x.cumulata; }, e0, { tot: false, colFn: function (v) { return v < 0 ? ROSSO : VERDE; } });
  t += sez('Copertura della rata');
  t += riga('Rata alla banca (capitale + interessi)', function (x) { return x.rata; }, neg, { col: 'var(--text-muted)', cantVal: cant ? R.cantiere.rata : null });
  t += riga('DSCR solo energia', function (x) { return x.dscr; }, function (v) { return v == null ? '—' : dec(v, 2) + 'x'; }, { tot: false, colFn: colD });
  t += riga('DSCR con CER', function (x) { return x.dscr2; }, function (v) { return v == null ? '—' : dec(v, 2) + 'x'; }, { tot: false, colFn: colD });
  t += '</table></div>';
  h += t;

  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:10px;line-height:1.5">'
    + 'Rate vere del mutuo dalla tabella banche, attribuite all\'impianto in proporzione alla sua spesa prevista sulle risorse della causale; sommate per anno di esercizio. '
    + 'La cassa cumulata parte dai mezzi propri messi nell\'impianto (' + _invEuro(Q.propri) + ')' + (cant ? ' e dalle rate del cantiere' : '') + '. '
    + 'DSCR = EBITDA / rata: verde da 1,25x, giallo fra 1 e 1,25x, rosso sotto 1. '
    + 'Prezzo dell\'energia: ' + _invTestoPrezzi(i) + '. '
    + 'Flusso di cassa = risultato dell\'anno + ammortamento − capitale restituito (cioè EBITDA + CER − rata intera). '
    + 'Ammortamento su ' + P.anni_amm + ' anni. Imposte escluse.</div>';
  return h;
}

// Gantt del singolo impianto: la sua barra con la linea di oggi
function _invGanttSingolo(i) {
  if (!i.data_inizio || !i.data_fine) return '';
  return _invGantt([i]);
}

// ── PREVENTIVI RICEVUTI (05/10) ────────────────────────────────────────────
// I preventivi dei fornitori sullo stesso impianto: serve a tenere memoria del
// confronto e della scelta fatta, anche quando non si prende il piu' economico.
function _invBloccoPreventivi(i) {
  var prev = (_invDati.preventivi || []).filter(function (p) { return p.impianto_id === i.id; });
  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div><div style="font-size:13px;font-weight:700">Preventivi ricevuti</div>'
    + '<div style="font-size:11px;color:var(--text-muted)">Le offerte dei fornitori per questo impianto e quella scelta.</div></div>'
    + (_invPuo() ? '<button onclick="invModalePreventivo(\'' + i.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Preventivo</button>' : '')
    + '</div>';
  if (!prev.length) { h += '<div style="font-size:12px;color:var(--text-muted)">Nessun preventivo registrato.</div></div>'; return h; }
  var min = Math.min.apply(null, prev.map(function (p) { return Number(p.importo || 0); }));
  var giaScelto = prev.some(function (p) { return p.scelto; });
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Fornitore</th>'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Documento</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Imponibile</th>'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Esito</th>'
    + '<th style="width:36px;border-bottom:1.5px solid var(--border)"></th></tr>';
  prev.forEach(function (p) {
    var piuBasso = Math.abs(Number(p.importo || 0) - min) < 0.01;
    h += '<tr style="border-bottom:0.5px solid var(--border)' + (p.scelto ? ';background:#EAF3DE' : '') + '">'
      + '<td style="padding:7px"><strong>' + _invEsc(p.fornitore) + '</strong>'
      + (p.note ? '<div style="font-size:10.5px;color:var(--text-muted)">' + _invEsc(p.note) + '</div>' : '') + '</td>'
      + '<td style="padding:7px;font-size:11.5px;color:var(--text-muted)">'
      + (p.numero ? 'n. ' + _invEsc(p.numero) : '—') + (p.data ? ' del ' + _invData(p.data) : '') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(p.importo)
      + (piuBasso && prev.length > 1 ? '<div style="font-size:9.5px;color:#27500A">il più basso</div>' : '') + '</td>'
      + '<td style="padding:7px">' + (p.scelto
          ? '<span style="font-size:10px;background:#EAF3DE;color:#27500A;padding:2px 9px;border-radius:9px;font-weight:700">scelto</span>'
            + ' <button onclick="invConfermaOrdine(\'' + i.id + '\',\'' + p.id + '\')" title="Genera la conferma d\'ordine da mandare al fornitore" style="font-size:10.5px;padding:3px 8px;border:0.5px solid #A32D2D;border-radius:6px;background:var(--bg);color:#A32D2D;font-weight:600;cursor:pointer;margin-left:4px">📄 Conferma d\'ordine</button>'
          : (giaScelto
              ? '<span style="font-size:10.5px;color:var(--text-muted)">non scelto</span>'
              : (_invPuo() ? '<button onclick="invScegliPreventivo(\'' + p.id + '\',\'' + i.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">scegli</button>' : ''))) + '</td>'
      + '<td style="padding:7px;text-align:right">' + (_invPuo() ? '<button onclick="invEliminaPreventivo(\'' + p.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button>' : '') + '</td></tr>';
  });
  h += '</table>';
  var scelto = prev.filter(function (p) { return p.scelto; })[0];
  if (scelto && prev.length > 1 && Math.abs(Number(scelto.importo) - min) > 0.01) {
    h += '<div style="font-size:11px;color:#854F0B;margin-top:8px">Il preventivo scelto costa ' + _invEuro(Number(scelto.importo) - min) + ' in più del più basso.</div>';
  }
  if (scelto) {
    h += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">Fornitore già scelto: la fornitura è definitiva. '
      + 'Per cambiarla va eliminato il preventivo scelto.</div>';
  }
  h += '</div>';
  return h;
}

function invModalePreventivo(impiantoId) {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:480px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Preventivo ricevuto</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Fornitore *</label><input id="invp-forn" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Numero</label><input id="invp-num" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Data</label><input id="invp-data" type="date" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Imponibile €</label><input id="invp-imp" type="number" step="0.01" style="' + inp + ';font-family:var(--font-mono)"></div>';
  var giaScelto = (_invDati.preventivi || []).some(function (x) { return x.impianto_id === impiantoId && x.scelto; });
  h += '<div><label style="' + lb + '">Scelto</label>'
    + (giaScelto
        ? '<div style="' + inp + ';color:var(--text-muted)">no — fornitore già scelto</div><input type="hidden" id="invp-scelto" value="">'
        : '<select id="invp-scelto" style="' + inp + '"><option value="">No</option><option value="1">Sì</option></select>')
    + '</div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Note (cosa comprende, perché scelto o scartato)</label><input id="invp-note" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaPreventivo(\'' + impiantoId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

async function invSalvaPreventivo(impiantoId) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var f = (g('invp-forn') || '').trim();
  var imp = parseFloat(g('invp-imp')) || 0;
  if (!f) { toast('Il fornitore è obbligatorio'); return; }
  if (imp <= 0) { toast('Indica l\'imponibile del preventivo'); return; }
  var scelto = !!g('invp-scelto');
  if (scelto) await sb.from('investimenti_preventivi').update({ scelto: false }).eq('impianto_id', impiantoId);
  var r = await sb.from('investimenti_preventivi').insert([{
    impianto_id: impiantoId, fornitore: f, numero: g('invp-num') || null,
    data: g('invp-data') || null, importo: imp, scelto: scelto, note: g('invp-note') || null
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  caricaInvestimenti();
}

async function invScegliPreventivo(id, impiantoId) {
  await sb.from('investimenti_preventivi').update({ scelto: false }).eq('impianto_id', impiantoId);
  var r = await sb.from('investimenti_preventivi').update({ scelto: true }).eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

async function invEliminaPreventivo(id) {
  if (!confirm('Elimino questo preventivo?')) return;
  var r = await sb.from('investimenti_preventivi').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

// ── CONFERMA D'ORDINE AL FORNITORE (05/10) ─────────────────────────────────
// Documento da mandare al fornitore una volta scelto il preventivo: parti,
// oggetto, voci, imponibile/IVA/totale, quote di pagamento e firme.
var _INV_AZIENDA = {
  nome: 'PHOENIX FUEL S.R.L.',
  indirizzo: 'Zona Industriale Portosalvo snc',
  citta: '89900 Vibo Valentia (VV)',
  piva: '02744150802', email: 'info@phoenixfuel.it',
  pec: 'phoenixfuel@legalmail.it', tel: '0966 1906397'
};

function invConfermaOrdine(impiantoId, preventivoId, aliquota) {
  var i = (_invDati.impianti || []).filter(function (x) { return x.id === impiantoId; })[0];
  var p = (_invDati.preventivi || []).filter(function (x) { return x.id === preventivoId; })[0];
  if (!i || !p) { toast('Dati non trovati'); return; }
  // l'aliquota si conferma ogni volta: sugli impianti e' il 10%, ma non sempre
  if (aliquota == null) {
    var hA = '<div style="max-width:380px"><div style="font-size:16px;font-weight:600;margin-bottom:4px">Conferma d\'ordine</div>'
      + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">' + _invEsc(p.fornitore) + ' · ' + _invEsc(i.nome) + '</div>'
      + '<label style="display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px">Aliquota IVA %</label>'
      + '<input id="inv-ord-iva" type="number" step="0.1" value="10" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;font-family:var(--font-mono);text-align:right">'
      + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Sugli impianti fotovoltaici è il 10%: controlla il preventivo del fornitore prima di generare.</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
      + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
      + '<button onclick="chiudiModal();invConfermaOrdine(\'' + impiantoId + '\',\'' + preventivoId + '\', parseFloat(document.getElementById(\'inv-ord-iva\') ? document.getElementById(\'inv-ord-iva\').value : 10) || 10)" class="btn-primary" style="font-size:12px;padding:8px 16px">📄 Genera</button></div></div>';
    apriModal(hA);
    return;
  }
  var ALIQ = Number(aliquota) || 10;
  var voci = (_invDati.voci || []).filter(function (v) {
    return v.impianto_id === i.id && (v.fornitore || '').toLowerCase().indexOf(String(p.fornitore).toLowerCase().slice(0, 6)) >= 0;
  });
  var imponibile = voci.length
    ? voci.reduce(function (s2, v) { return s2 + Number(v.importo_previsto || 0); }, 0)
    : Number(p.importo || 0);
  var iva = imponibile * ALIQ / 100;
  var tot = imponibile + iva;

  var corpo = (voci.length ? voci : [{ descrizione: 'Fornitura e installazione impianto fotovoltaico'
      + (i.kw ? ' da ' + Number(i.kw).toLocaleString('it-IT') + ' kW' : ''), importo_previsto: imponibile }])
    .map(function (v) {
      return '<tr><td class="l">' + _invEsc(v.descrizione) + '</td><td>1</td><td>' + ALIQ + '%</td>'
        + '<td>' + _invEuro(v.importo_previsto) + '</td><td>' + _invEuro(Number(v.importo_previsto) * (1 + ALIQ / 100)) + '</td></tr>';
    }).join('');

  var quote = [
    { perc: 30, evento: 'Alla firma della conferma d\'ordine' },
    { perc: 50, evento: 'All\'avviso di consegna dei materiali' },
    { perc: 20, evento: 'Al collaudo dell\'impianto' }
  ];
  var qh = quote.map(function (q) {
    return '<tr><td class="l" style="width:60px">' + q.perc + '%</td><td class="l">' + q.evento + '</td>'
      + '<td>' + _invEuro(tot * q.perc / 100) + '</td></tr>';
  }).join('');

  var A = _INV_AZIENDA;
  var oggi = new Date().toLocaleDateString('it-IT');
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Conferma d\'ordine ' + _invEsc(i.nome) + '</title><style>'
    + '@page{size:A4;margin:14mm}body{font-family:Calibri,Arial,sans-serif;font-size:10.5px;color:#222;margin:0}'
    + '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C8102E;padding-bottom:8px;margin-bottom:14px}'
    + '.az{font-size:15px;font-weight:700}.az small{display:block;font-size:9px;color:#666;font-weight:400;line-height:1.4}'
    + '.ti{text-align:right;font-size:13px;font-weight:600}.ti small{display:block;font-size:9.5px;color:#666;font-weight:400}'
    + '.parti{display:flex;gap:30px;margin-bottom:14px}.parti>div{flex:1;font-size:10px;line-height:1.5}'
    + '.parti .et{font-size:9px;color:#777;text-transform:uppercase;letter-spacing:.3px}.parti strong{font-size:11.5px}'
    + 'table{width:100%;border-collapse:collapse;font-size:10px}'
    + 'th{background:#F1EFE8;padding:6px 7px;font-size:8.5px;text-transform:uppercase;letter-spacing:.3px;color:#5F5E5A;text-align:right;border-bottom:1px solid #999}'
    + 'th.l{text-align:left}td{padding:6px 7px;border-bottom:0.5px solid #e8e8e8;text-align:right}td.l{text-align:left}'
    + '.tot{margin-top:10px;margin-left:auto;width:46%}.tot td{border:0;padding:3px 7px}'
    + '.tot .gr{font-size:13px;font-weight:700;border-top:1px solid #333}'
    + '.box{border:1px solid #ddd;border-radius:5px;padding:9px 11px;margin-top:12px;font-size:9.5px;line-height:1.5}'
    + '.firme{display:flex;justify-content:space-between;gap:40px;margin-top:32px;font-size:10px}'
    + '.firme>div{flex:1}.firme .riga{border-bottom:1px solid #333;height:40px;margin-top:8px}'
    + '.foot{margin-top:16px;border-top:0.5px solid #ddd;padding-top:5px;font-size:8px;color:#777;text-align:center}'
    + '</style></head><body>'
    + '<div class="hd"><div class="az">' + A.nome + '<small>' + A.indirizzo + ' · ' + A.citta
    + '<br>P.IVA ' + A.piva + ' · ' + A.email + ' · ' + A.pec + '</small></div>'
    + '<div class="ti">Conferma d\'ordine<small>' + oggi + '</small></div></div>'
    + '<div class="parti">'
    + '<div><div class="et">Committente</div><strong>' + A.nome + '</strong><br>' + A.indirizzo + '<br>' + A.citta
    + '<br>P.IVA ' + A.piva + '<br>' + A.tel + '</div>'
    + '<div><div class="et">Spettabile fornitore</div><strong>' + _invEsc(p.fornitore) + '</strong>'
    + (p.numero || p.data ? '<br>Vs. preventivo ' + (p.numero ? 'n. ' + _invEsc(p.numero) : '') + (p.data ? ' del ' + _invData(p.data) : '') : '')
    + '</div></div>'
    + '<div style="font-size:11px;margin-bottom:10px"><strong>Oggetto:</strong> impianto fotovoltaico <strong>' + _invEsc(i.nome) + '</strong>'
    + (i.luogo ? ' — ' + _invEsc(i.luogo) : '') + (i.kw ? ' · ' + Number(i.kw).toLocaleString('it-IT') + ' kW' : '')
    + '<br>Con la presente confermiamo l\'ordine alle condizioni del Vs. preventivo sopra richiamato.</div>'
    + '<table><tr><th class="l">Descrizione</th><th>Quantità</th><th>IVA</th><th>Imponibile</th><th>Totale</th></tr>' + corpo + '</table>'
    + '<table class="tot"><tr><td class="l">Imponibile</td><td>' + _invEuro(imponibile) + '</td></tr>'
    + '<tr><td class="l">IVA ' + ALIQ + '%</td><td>' + _invEuro(iva) + '</td></tr>'
    + '<tr class="gr"><td class="l">Totale</td><td>' + _invEuro(tot) + '</td></tr></table>'
    + '<div style="clear:both"></div>'
    + '<div style="font-weight:700;font-size:11px;margin:14px 0 5px">Termini di pagamento</div>'
    + '<table><tr><th class="l">Quota</th><th class="l">Scadenza</th><th>Importo (IVA incl.)</th></tr>' + qh + '</table>'
    + '<div class="box">I pagamenti saranno effettuati a mezzo bonifico bancario a vista fattura. '
    + 'Eventuali varianti ai materiali indicati nel preventivo dovranno essere concordate per iscritto. '
    + 'I termini di consegna e installazione decorrono dalla data della presente conferma.'
    + (i.data_fine ? ' Fine lavori prevista entro il ' + _invData(i.data_fine) + '.' : '') + '</div>'
    + '<div class="firme"><div><div style="font-size:9px;color:#777">Il Committente</div><strong>' + A.nome + '</strong>'
    + '<div class="riga"></div><div style="font-size:9px;color:#777">Luogo e data</div></div>'
    + '<div><div style="font-size:9px;color:#777">Il Fornitore — per accettazione</div><strong>' + _invEsc(p.fornitore) + '</strong>'
    + '<div class="riga"></div><div style="font-size:9px;color:#777">Luogo e data</div></div></div>'
    + '<div class="foot">' + A.nome + ' · ' + A.indirizzo + ', ' + A.citta + ' · P.IVA ' + A.piva + ' · ' + A.email + '</div>'
    + '</body></html>';

  var w = window.open('', '_blank');
  if (!w) { toast('Abilita i popup per stampare'); return; }
  w.document.write(doc); w.document.close(); w.focus();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

// ── PRODUZIONE REALE (05/10) ───────────────────────────────────────────────
// Anno per anno: kWh prodotti, €/kWh riconosciuto dal GSE e contributo CER
// incassato. Si confrontano con il conto economico previsionale, cosi' si vede
// se l'impianto rende come previsto. Il primo anno parte dall'allaccio alla rete.
function _invProdImpianto(id) {
  return (_invDati.produzione || []).filter(function (p) { return p.impianto_id === id; })
    .sort(function (a, b) { return a.anno - b.anno; });
}

function _invBloccoProduzione(i, costoNetto) {
  var righe = _invProdImpianto(i.id);
  var CE = _invCeCalcola(i, costoNetto);
  var annoAllaccio = i.data_allaccio ? Number(String(i.data_allaccio).slice(0, 4)) : null;

  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div><div style="font-size:13px;font-weight:700">⚡ Produzione reale</div>'
    + '<div style="font-size:11px;color:var(--text-muted)">'
    + (i.data_allaccio ? 'In rete dal ' + _invData(i.data_allaccio) + ': da qui si contano gli anni di esercizio.'
                       : 'Manca la data di allaccio alla rete: inseriscila con ✏️ Modifica.') + '</div></div>'
    + (_invPuo() ? '<button onclick="invModaleProduzione(\'' + i.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #639922;border-radius:6px;background:var(--bg);color:#3B6D11;font-weight:600;cursor:pointer">+ Anno</button>' : '')
    + '</div>';
  if (!righe.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessun dato di produzione registrato.</div></div>';
    return h;
  }
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Anno</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">kWh prodotti</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">€/kWh GSE</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Ricavo energia</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Contributo CER</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Totale</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Su previsto</th>'
    + '<th style="width:36px;border-bottom:1.5px solid var(--border)"></th></tr>';
  var tK = 0, tR = 0, tC = 0;
  righe.forEach(function (p) {
    var ric = Number(p.kwh || 0) * Number(p.eur_kwh || 0);
    var cer = Number(p.cer_incassato || 0);
    tK += Number(p.kwh || 0); tR += ric; tC += cer;
    // anno di esercizio = differenza dall'anno di allaccio
    var nEs = annoAllaccio ? (p.anno - annoAllaccio + 1) : null;
    var budget = (CE && nEs && CE.anni[nEs - 1]) ? CE.anni[nEs - 1] : null;
    var scost = budget ? ((ric + cer) - (budget.ricavi + budget.cer)) : null;
    var col = scost == null ? 'var(--text-muted)' : (scost >= 0 ? '#27500A' : '#A32D2D');
    h += '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:7px"><strong>' + p.anno + '</strong>' + (nEs ? '<div style="font-size:10px;color:var(--text-muted)">anno ' + nEs + ' di esercizio</div>' : '') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + Math.round(p.kwh || 0).toLocaleString('it-IT') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + Number(p.eur_kwh || 0).toFixed(4).replace('.', ',') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(ric) + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _invEuro(cer) + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(ric + cer) + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);color:' + col + '">'
      + (budget ? (scost >= 0 ? '+' : '') + _invEuro(scost) + '<div style="font-size:10px">previsto ' + _invEuroK(budget.ricavi + budget.cer) + '</div>' : '—') + '</td>'
      + '<td style="padding:7px;text-align:right">' + (_invPuo() ? '<button onclick="invEliminaProduzione(\'' + p.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button>' : '') + '</td></tr>';
  });
  h += '<tr style="font-weight:700"><td style="padding:8px 7px">TOTALE</td>'
    + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + Math.round(tK).toLocaleString('it-IT') + '</td><td></td>'
    + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(tR) + '</td>'
    + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(tC) + '</td>'
    + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(tR + tC) + '</td><td></td><td></td></tr>';
  h += '</table></div></div>';
  return h;
}

function invModaleProduzione(impiantoId) {
  var i = (_invDati.impianti || []).filter(function (x) { return x.id === impiantoId; })[0];
  var righe = _invProdImpianto(impiantoId);
  var annoNuovo = righe.length ? (righe[righe.length - 1].anno + 1) : (i && i.data_allaccio ? Number(String(i.data_allaccio).slice(0, 4)) : new Date().getFullYear());
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:500px"><div style="font-size:16px;font-weight:600;margin-bottom:2px">⚡ Produzione dell\'anno</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">' + _invEsc(i ? i.nome : '')
    + (i && i.data_allaccio ? ' · in rete dal ' + _invData(i.data_allaccio) : ' · manca la data di allaccio') + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div><label style="' + lb + '">Anno *</label><input id="invpr-anno" type="number" value="' + annoNuovo + '" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '<div><label style="' + lb + '">kWh prodotti *</label><input id="invpr-kwh" type="number" step="1" oninput="_invProdCalc()" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>';
  h += '<div><label style="' + lb + '">€/kWh riconosciuto (GSE)</label><input id="invpr-eur" type="number" step="0.0001" oninput="_invProdCalc()" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>';
  h += '<div><label style="' + lb + '">Contributo CER incassato €</label><input id="invpr-cer" type="number" step="0.01" oninput="_invProdCalc()" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Note</label><input id="invpr-note" style="' + inp + '"></div>';
  h += '</div>';
  h += '<div id="invpr-calc" style="font-size:12px;color:var(--text-muted);margin-top:10px"></div>';
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaProduzione(\'' + impiantoId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

function _invProdCalc() {
  var g = function (x) { var e = document.getElementById(x); return e ? parseFloat(e.value) || 0 : 0; };
  var box = document.getElementById('invpr-calc');
  if (!box) return;
  var ric = g('invpr-kwh') * g('invpr-eur');
  var tot = ric + g('invpr-cer');
  box.innerHTML = ric > 0 || g('invpr-cer') > 0
    ? 'Ricavo energia <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(ric) + '</strong>'
      + ' + CER <strong style="font-family:var(--font-mono);color:#27500A">' + _invEuro(g('invpr-cer')) + '</strong>'
      + ' = <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(tot) + '</strong>'
    : '';
}

async function invSalvaProduzione(impiantoId) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var anno = parseInt(g('invpr-anno'), 10);
  var kwh = parseFloat(g('invpr-kwh')) || 0;
  if (!anno) { toast('Indica l\'anno'); return; }
  if (kwh <= 0) { toast('Indica i kWh prodotti'); return; }
  var r = await sb.from('investimenti_produzione').upsert({
    impianto_id: impiantoId, anno: anno, kwh: kwh,
    eur_kwh: parseFloat(g('invpr-eur')) || 0,
    cer_incassato: parseFloat(g('invpr-cer')) || 0,
    note: g('invpr-note') || null
  }, { onConflict: 'impianto_id,anno' });
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  toast('✓ Produzione ' + anno + ' salvata');
  caricaInvestimenti();
}

async function invEliminaProduzione(id) {
  if (!confirm('Elimino i dati di produzione di questo anno?')) return;
  var r = await sb.from('investimenti_produzione').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

// ── DA IMPUTARE AI CONTRATTI (06/10) ───────────────────────────────────────
// Gli impianti venduti non stanno fra gli investimenti: le loro spese e i loro
// incassi si imputano al contratto. Qui si fa dalla stessa schermata, senza
// doverli cercare dentro la scheda della commessa.
function _invBloccoVendite() {
  var D = _invDati;
  var mov = (D.movVendite || []);
  var spese = mov.filter(function (m) { return m.tipo === 'uscita'; });
  var incassi = mov.filter(function (m) { return m.tipo === 'entrata'; });
  if (!spese.length && !incassi.length) return '';
  var contratti = (D.contratti || []);

  var tendina = function (m, verbo) {
    if (!contratti.length) {
      return '<span style="font-size:11px;color:#A32D2D">nessun contratto: crealo da Offerte</span>';
    }
    return '<select onchange="invImputaContratto(\'' + m.id + '\', this.value)" style="font-size:11.5px;padding:5px 8px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:var(--text)">'
      + '<option value="">— ' + verbo + ' a contratto… —</option>'
      + contratti.map(function (c) {
          return '<option value="' + c.id + '">' + (c.numero || '—') + '/' + c.anno + ' · ' + _invEsc(c.cliente_nome)
            + (c.sito_installazione ? ' · ' + _invEsc(String(c.sito_installazione).slice(0, 28)) : '') + '</option>';
        }).join('')
      + '</select>';
  };
  var riga = function (m, verbo, colore) {
    return '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:7px;white-space:nowrap">' + _invData(m.data) + '</td>'
      + '<td style="padding:7px">' + _invEsc(m.descrizione || '')
      + '<div style="font-size:10.5px;color:var(--text-muted)">totale ' + _invEuro(m.importo)
      + (m.aliquota_iva != null ? ' · IVA ' + m.aliquota_iva + '%' : '') + '</div></td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600'
      + (colore ? ';color:' + colore : '') + '">' + _invEuro(m.tipo === 'entrata' ? m.importo : _invImponibile(m)) + '</td>'
      + '<td style="padding:7px;text-align:right;white-space:nowrap">' + tendina(m, verbo) + '</td></tr>';
  };

  var h = '';
  if (spese.length) {
    var tot = spese.reduce(function (s2, m) { return s2 + _invImponibile(m); }, 0);
    h += '<div class="card" style="padding:12px 14px;margin-top:12px;border-left:4px solid #BA7517">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
      + '<div style="font-size:13px;font-weight:700">Spese di commessa da imputare</div>'
      + '<div style="font-size:11.5px;color:var(--text-muted)">' + spese.length + ' moviment' + (spese.length === 1 ? 'o' : 'i') + ' · ' + _invEuro(tot) + ' di imponibile</div></div>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin:4px 0 10px">Impianti venduti ai clienti: si imputano al contratto, non a un impianto nostro.</div>';
    h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">'
      + spese.map(function (m) { return riga(m, 'imputa'); }).join('') + '</table></div></div>';
  }
  if (incassi.length) {
    var totI = incassi.reduce(function (s2, m) { return s2 + Number(m.importo || 0); }, 0);
    h += '<div class="card" style="padding:12px 14px;margin-top:12px;border-left:4px solid #639922">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
      + '<div style="font-size:13px;font-weight:700">Incassi da collegare</div>'
      + '<div style="font-size:11.5px;color:var(--text-muted)">' + incassi.length + ' moviment' + (incassi.length === 1 ? 'o' : 'i') + ' · ' + _invEuro(totI) + '</div></div>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin:4px 0 10px">Pagamenti ricevuti dai clienti: si collegano al contratto e riempiono la sua barra incassi.</div>';
    h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">'
      + incassi.map(function (m) { return riga(m, 'collega', '#27500A'); }).join('') + '</table></div></div>';
  }
  return h;
}

async function invImputaContratto(movId, contrattoId) {
  if (!contrattoId) return;
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var r = await sb.from('foglio_giornale_movimenti').update({ fv_contratto_id: contrattoId }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  if (typeof _auditLog === 'function') _auditLog('fotovoltaico', 'foglio_giornale_movimenti', 'movimento ' + movId + ' imputato al contratto ' + contrattoId);
  toast('✓ Movimento collegato al contratto');
  caricaInvestimenti();
}
