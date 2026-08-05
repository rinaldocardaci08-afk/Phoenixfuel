// ═══════════════════════════════════════════════════════════════════
// v20260804c — il filtro non partiva: chiamavo renderEstrattoFornitore, che
//              NON ESISTE (la funzione vera e _ecfRender). Aggiunto Filtra
// v20260804b — il filtro regge anche il giorno singolo (le date con l'ora
//              venivano escluse) e non ha piu le scorciatoie mese/anno
// v20260804a — filtro per data ORDINE sull'elenco, accanto a Solo da pagare
// v20260803a — contestazione prezzi al fornitore, riga per riga sulla singola
//              fattura, con lettera da allegare alla PEC
// v20260801b — corretto l escape del pulsante Modifica: l onclick usciva con
//               le barre rovesciate e il clic non faceva nulla
// v20260801a — modifica di un pagamento fornitore: data, importo, modalita,
//               banca e riferimento. Il movimento in banca segue l'importo
//               sempre, il resto solo con la spunta.
// pf-estratto-fornitore.js — Estratto conto fornitore (linguetta in Fornitori)
// v20260724c — PONTE FOGLIO GIORNALE (verifica aperta dal 22/07, ora chiusa):
//   il pagamento dall'estratto conto crea anche il MOVIMENTO in
//   foglio_giornale_movimenti (uscita, banca = istituto del conto, origine
//   'estratto_conto'), la RICONCILIAZIONE con la fattura e il link
//   movimento_foglio_id sul pagamento — lo stesso schema del modale ufficiale
//   pf-pagamento-fornitore-modale.js, che il mio modale non replicava: per
//   questo i pagamenti fatti da qui non giravano sul Foglio giornale.
//   L'ANNULLO di un pagamento rimuove anche movimento e riconciliazioni.
// v20260724b — la STAMPA deduce gli acconti: in fondo "Acconti già versati
//   −€X" e "NETTO DA PAGARE €Y" (= totale elenco − acconti sulle fatture
//   aperte, lo stesso numero del fido). Le righe con acconto lo indicano.
// v20260724a — STAMPA ELENCO (solo vista "Solo da pagare"): pulsante in basso
//   a destra che apre l'elenco dei soli ordini da pagare in una pagina pulita
//   pronta per la stampa/PDF del browser, da condividere col fornitore per
//   conferma (intestazione, numeri fattura, scadenze, totali, firma).
// v20260723j — MODIFICA PAGAMENTO (Rinaldo: "ho messo pagata una fattura che
//   non lo è"): clic sul badge PAGATO → popup con i pagamenti registrati
//   (annullabili uno per uno, con ritorno degli ordini a "da pagare") e, per
//   gli ordini pagati solo via flag (avvio dati), il pulsante che riporta
//   l'ordine a DA PAGARE. Ogni annullo passa dall'audit e invalida la madre.
// v20260723i — PAGAMENTO DALLA SELEZIONE anche per ordini GIÀ FATTURATI:
//   selezione tutta sulla STESSA fattura → si apre il pagamento di QUELLA
//   fattura (numero visibile, mai richiesto di nuovo); selezione di soli
//   ordini liberi → pagamento con contenitore come prima; selezione mista o
//   su fatture diverse → messaggio (un pagamento = una fattura).
// v20260723h — OVERRIDE QUADRATURA nella scheda fornitore: sotto i KPI un
//   valore cliccabile = Σ (importo dichiarato fattura − Σ ordini agganciati)
//   dell'anno corrente; il clic apre il dettaglio mese per mese. Serve a
//   tenere d'occhio abbuoni/sconti accumulati rispetto agli ordini.
// v20260723g — ELENCO UNICO nell'estratto conto (Rinaldo): un solo elenco di
//   TUTTI gli ordini per scadenza PURA crescente — pagati e no, con e senza
//   fattura, la prima riga è la prima scadenza da affrontare. Il numero
//   fattura sta in riga (cliccabile → dettaglio); la tabella separata
//   "Fatture registrate" NON esiste più. Le azioni sulla fattura (pagamento,
//   ✎ numero) vivono nella modale di dettaglio del numero.
// v20260723f — TRE FIX dal collaudo: (1) modalità pagamento coi CODICI
//   minuscoli bonifico/riba/assegno come nel resto del programma — il check
//   a DB li pretende e il modale mandava le etichette maiuscole; (2) la data
//   fattura proposta = DATA DELL'ORDINE (la più recente tra i selezionati),
//   mai oggi; (3) ROLLBACK nel pagamento: se l'insert del pagamento fallisce
//   dopo la creazione della fattura contenitore, la fattura viene cancellata
//   e gli ordini sganciati — niente orfani a DB.
// v20260723e — RAMO della QUERY MADRE pf-debito-fornitori.js: questo modulo
//   non legge più ordini/fatture/pagamenti con query proprie — deriva tutto
//   da pfDebitoDati/pfDebitoCards/pfDebitoFornitore. pfScadenzaFornitore è
//   stata SPOSTATA nella madre. Le scritture invalidano con pfDebitoInvalida().
// v20260723d — selettore anno sempre visibile (prima spariva con la torta vuota),
//   badge anno sulle card, e la numerazione aggiorna anche la linguetta Senza fattura.
// v20260723c — IBRIDO PURO (Rinaldo 23/07): qui comanda la SCADENZA, non il
//   documento. Ordini elencati per scadenza crescente; il pulsante è
//   "Pagamento" (non più "fattura + pagamento") e il n° fattura è FACOLTATIVO:
//   si può pagare un ordine di cui non è ancora arrivata la fattura, per
//   liberare fido. Il numero si inserisce dopo, dalla riga in Fatture
//   registrate (✎ inserisci n°). Selezionabili anche gli ordini già pagati,
//   perché il loro numero fattura può arrivare dopo il pagamento.
//   + selettore ANNO (2025/2026) su torta e grafico mensile: i dati c'erano
//   già in memoria (il caricamento parte dal 1° gennaio dell'anno precedente).
// v20260723b — REGISTRA FATTURA senza pagamento: la tabella "Ordini da pagare —
//   senza fattura" è ora disegnata dal motore condiviso pf-reg-fattura.js
//   (elenco o Σ raggruppa per scadenza, sgancio del singolo ordine dal gruppo).
//   Il vecchio pulsante "Registra fattura e pagamento" resta come seconda scelta.
//   Inoltre: sugli ordini già agganciati a una fattura la scadenza mostrata è
//   quella DELLA FATTURA (comanda lei), non più data ordine + giorni fornitore.
// v20260723a — barre mensili AFFIANCATE (non impilate) e solo fornitori anagrafica
//   (niente Phoenix, che siamo noi); Fido disponibile grande nella scheda singola.
// v20260722b — IBRIDO su ORDINI (decisione Rinaldo 22/07):
//   • l'estratto si popola dagli ORDINI di acquisto: la scadenza è nota subito
//     (data ordine + giorni pagamento) e il FIDO è preciso senza aspettare la fattura;
//   • l'ordine "diventa fattura" quando si registra il pagamento e si inserisce
//     il n° fattura: UNA fattura può raggruppare PIÙ ordini e ne somma i totali;
//   • tasto (i) sulla riga fattura → dettaglio degli ordini che la compongono;
//   • pagamento totale o PARZIALE (acconto): la fattura resta aperta col residuo;
//   • nel modale barra fido in piccolo, aggiornata mentre si digita l'importo.
// Imponibile ordine = costo_litro × litri (stessa formula del fido in anagrafica).
// ═══════════════════════════════════════════════════════════════════
let _ecfFornitori = [], _ecfPop = false;
let _ecfSel = null;          // { id, nome, fido, gg }
let _ecfOrdini = [];         // ordini del fornitore (con imponibile e scadenza)
let _ecfFatture = [];        // fatture con totale/pagato/residuo e ordini collegati
let _ecfSelezione = {};      // ordini spuntati per la nuova fattura
let _ecfFiltro = 'aperti';   // 'aperti' | 'tutti'
let _ecfConti = [], _ecfIstituti = {};
let _ecfMod = null;          // stato del modale
let _ecfOrdiniTutti = [];    // tutti gli ordini caricati (per il grafico mensile)
let _ecfMeseUnit = 'euro';   // 'euro' | 'litri'
let _ecfAnnoGraf = new Date().getFullYear();  // anno mostrato da torta e grafico mensile

function switchFornitoriTab(btn) {
  document.querySelectorAll('.forn-tab').forEach(function (t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
  btn.classList.add('active');
  document.querySelectorAll('.forn-panel').forEach(function (p) { p.style.display = 'none'; });
  var el = document.getElementById(btn.dataset.tab);
  if (el) el.style.display = '';
  if (btn.dataset.tab === 'forn-estratto') caricaEstrattoFornitore();
}

async function caricaEstrattoFornitore() {
  var sel = document.getElementById('ecf-fornitore');
  if (sel && !_ecfPop) {
    // fornitori dalla QUERY MADRE; conti/istituti non sono debito e restano qui
    var r = await Promise.all([
      pfDebitoDati(),
      sb.from('banche_conti').select('id,istituto_id,iban,descrizione'),
      sb.from('banche_istituti').select('id,nome')
    ]);
    _ecfFornitori = r[0].fornitori;
    _ecfConti = r[1].data || [];
    (r[2].data || []).forEach(function (i) { _ecfIstituti[i.id] = i.nome; });
    sel.innerHTML = '<option value="">— scegli un fornitore —</option>' +
      _ecfFornitori.map(function (f) { return '<option value="' + f.id + '">' + esc(f.nome) + '</option>'; }).join('');
    _ecfPop = true;
  }
  if (_ecfSel) ecfCambiaFornitore(); else _ecfOverview();
}

// ── Colpo d'occhio: un pannello per fornitore attivo con fido e dilazione ──
async function _ecfOverview() {
  var body = document.getElementById('ecf-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:30px;font-size:12px">⏳ Caricamento fornitori...</div>';
  var cards = await _ecfCalcolaFornitori(_ecfAnnoGraf);
  if (!cards.length) { body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">Nessun fornitore con movimenti.</div>'; return; }
  _ecfDisegnaOverview(body, cards);
}

// Calcolo CONDIVISO (panoramica + dashboard) — ora è il ramo pfDebitoCards
// della QUERY MADRE. Il nome resta per i chiamanti esistenti.
async function _ecfCalcolaFornitori(annoSel) {
  var cards = await pfDebitoCards(annoSel);
  _ecfOrdiniTutti = (await pfDebitoDati()).ordini;  // per il grafico mensile
  return cards;
}

function _ecfDisegnaOverview(body, cards) {
  body.innerHTML = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Clicca un fornitore per aprire il suo estratto conto.</div>'
    + '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px">'
    + cards.map(function (c) {
        var pct = c.fido > 0 ? Math.min(100, (c.esp / c.fido) * 100) : 0;
        var bordo = c.fido > 0 ? (pct >= 85 ? '#C0392B' : pct >= 60 ? '#F5921E' : '#639922') : 'var(--border)';
        return '<div onclick="ecfApriFornitore(\'' + c.id + '\')" style="cursor:pointer;border:1px solid ' + bordo + ';border-left:5px solid ' + bordo + ';border-radius:12px;padding:14px 15px;background:var(--bg)">'
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">'
            + '<div style="font-size:15px;font-weight:700">' + esc(c.nome) + '</div>'
            + '<div style="font-size:11px;color:var(--text-muted);white-space:nowrap">' + c.gg + ' gg</div></div>'
          + '<div style="font-size:11px;color:var(--text-muted);margin:2px 0 10px">acquistato ' + _ecfAnnoGraf + ' · ' + fmtE(c.acq) + '</div>'
          + (c.fido > 0 ? _ecfBarra(c.esp, c.fido, false, c.espDaFatturare)
                        : '<div style="font-size:11px;color:var(--text-muted)">Esposizione ' + fmtE(c.esp) + ' · nessun fido assegnato</div>')
          + (c.fido > 0 ? '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:7px">'
              + '<span style="color:var(--text-muted)">Fido disponibile</span>'
              + '<span style="font-family:var(--font-mono);font-weight:700;color:' + ((c.fido - c.esp) < 0 ? '#A32D2D' : '#3B6D11') + '">' + fmtE(c.fido - c.esp) + '</span></div>' : '')
          + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:7px">'
            + '<span style="color:var(--text-muted)">Prossima scadenza</span>'
            + (c.prossima
                ? '<span style="font-family:var(--font-mono);font-weight:700;color:' + (c.scadute ? '#A32D2D' : 'var(--text)') + '">'
                    + _pfIsoToIt(c.prossima) + (c.prossimaImporto ? ' · ' + fmtE(c.prossimaImporto) : '') + '</span>'
                : '<span style="color:var(--text-muted)">—</span>')
          + '</div>'
          + (c.scadute ? '<div style="font-size:11px;color:#A32D2D;font-weight:700;text-align:right;margin-top:2px">' + c.scadute + ' scaduti</div>' : '')
          + '</div>';
      }).join('') + '</div>'
    + '<div style="display:flex;justify-content:flex-end;align-items:center;gap:8px;margin-top:16px">'
      + '<span style="font-size:11.5px;color:var(--text-muted)">Anno dei grafici</span>' + _ecfBtnAnno() + '</div>'
    + _ecfTortaHtml(cards)
    + _ecfMesiHtml(cards);
  setTimeout(function () { _ecfDisegnaTorta(cards); _ecfDisegnaMesi(cards); }, 0);
}

// ── Torta acquisti dell'anno per fornitore (litri ed euro) ──
function _ecfTortaHtml(cards) {
  var anno = _ecfAnnoGraf;
  var conAcq = cards.filter(function (c) { return c.acq > 0; });
  if (!conAcq.length) return '<div class="card" style="margin-top:12px"><div class="card-title">Acquisti ' + anno + ' per fornitore</div>'
    + '<div style="color:var(--text-muted);font-size:12.5px;padding:6px 0">Nessun acquisto registrato nel ' + anno + ' per i fornitori in anagrafica.</div></div>';
  var totE = conAcq.reduce(function (s, c) { return s + c.acq; }, 0);
  var totL = conAcq.reduce(function (s, c) { return s + c.litri; }, 0);
  var col = ['#185FA5', '#639922', '#F5921E', '#6B5FCC', '#E5342F', '#0FA3A3', '#B4B2A9'];
  var righe = conAcq.slice().sort(function (a, b) { return b.acq - a.acq; }).map(function (c, i) {
    var pct = totE > 0 ? (c.acq / totE) * 100 : 0;
    return '<div style="display:flex;align-items:center;gap:9px;padding:7px 0;border-bottom:0.5px solid var(--border)">'
      + '<span style="width:11px;height:11px;border-radius:3px;background:' + col[i % col.length] + ';flex:none"></span>'
      + '<span style="flex:1;font-size:12.5px;font-weight:600">' + esc(c.nome) + '</span>'
      + '<span style="font-family:var(--font-mono);font-size:12px;min-width:96px;text-align:right">' + fmtL(c.litri) + ' L</span>'
      + '<span style="font-family:var(--font-mono);font-size:12px;font-weight:700;min-width:104px;text-align:right">' + fmtE(c.acq) + '</span>'
      + '<span style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);min-width:44px;text-align:right">' + pct.toFixed(1) + '%</span>'
      + '</div>';
  }).join('');
  return '<div class="card" style="margin-top:18px">'
    + '<div class="card-title">Acquisti ' + anno + ' per fornitore</div>'
    + '<div style="display:flex;gap:22px;flex-wrap:wrap;align-items:center">'
      + '<div style="flex:0 0 240px;max-width:240px"><canvas id="ecf-torta" height="240"></canvas></div>'
      + '<div style="flex:1;min-width:300px">' + righe
        + '<div style="display:flex;align-items:center;gap:9px;padding:9px 0;border-top:2px solid var(--accent);font-weight:700">'
        + '<span style="width:11px;flex:none"></span><span style="flex:1;font-size:12.5px">Totale</span>'
        + '<span style="font-family:var(--font-mono);font-size:12px;min-width:96px;text-align:right">' + fmtL(totL) + ' L</span>'
        + '<span style="font-family:var(--font-mono);font-size:12.5px;min-width:104px;text-align:right">' + fmtE(totE) + '</span>'
        + '<span style="min-width:44px"></span></div>'
      + '</div></div></div>';
}

var _ecfChartTorta = null;
function _ecfDisegnaTorta(cards) {
  var ctx = document.getElementById('ecf-torta');
  if (!ctx || typeof Chart === 'undefined') return;
  var conAcq = cards.filter(function (c) { return c.acq > 0; }).sort(function (a, b) { return b.acq - a.acq; });
  if (!conAcq.length) return;
  var col = ['#185FA5', '#639922', '#F5921E', '#6B5FCC', '#E5342F', '#0FA3A3', '#B4B2A9'];
  if (_ecfChartTorta) _ecfChartTorta.destroy();
  _ecfChartTorta = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: conAcq.map(function (c) { return c.nome; }),
      datasets: [{ data: conAcq.map(function (c) { return Math.round(c.acq); }),
                   backgroundColor: conAcq.map(function (c, i) { return col[i % col.length]; }),
                   borderWidth: 2, borderColor: '#fff' }]
    },
    options: {
      responsive: true, maintainAspectRatio: true, cutout: '52%',
      plugins: { legend: { display: false }, tooltip: { callbacks: { label: function (c) {
        var f = conAcq[c.dataIndex];
        return f.nome + ': ' + fmtE(f.acq) + ' · ' + fmtL(f.litri) + ' L';
      } } } }
    }
  });
}

function ecfApriFornitore(id) {
  var sel = document.getElementById('ecf-fornitore');
  if (sel) sel.value = id;
  ecfCambiaFornitore();
}

async function ecfCambiaFornitore() {
  var sel = document.getElementById('ecf-fornitore');
  var id = sel ? sel.value : '';
  var body = document.getElementById('ecf-body');
  _ecfSelezione = {};
  if (!id) {
    _ecfSel = null;
    _ecfOverview();
    return;
  }
  var f = _ecfFornitori.filter(function (x) { return x.id === id; })[0] || {};
  _ecfSel = { id: id, nome: f.nome || '', fido: Number(f.fido_massimo || 0), gg: Number(f.giorni_pagamento || 30) };
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">⏳ Caricamento ordini...</div>';
  await _ecfCarica();
  _ecfRender();
}

function _ecfAddGiorni(dataISO, gg, scadFattura) {
  return pfScadenzaFornitore(dataISO, gg, scadFattura);
}

async function _ecfCarica() {
  // RAMO della QUERY MADRE: nessuna query propria. La regola "la scadenza
  // della fattura comanda" è già applicata dalla madre sugli ordini.
  var d = await pfDebitoFornitore(_ecfSel.nome, true);
  _ecfOrdini = d.ordini;
  _ecfFatture = d.fatture;
}

// Esposizione = ramo condiviso della QUERY MADRE (stessa regola ovunque)
function ecfEsposizione() { return pfDebitoEsposizione(_ecfOrdini, _ecfFatture); }

// Quanta parte dell'esposizione e' ancora SENZA fattura: stessa regola del
// fido (ordini vivi = non pagati e non su fattura saldata).
function _ecfDaFatturare() {
  return (_ecfOrdini || []).filter(function (o) {
    return !o.pagato && !o.fattSaldata && !o.fatturaId;
  }).reduce(function (a, o) { return a + Number(o.totale || 0); }, 0);
}

// La barra distingue la parte GIA' FATTURATA (tinta piena) da quella ANCORA
// DA FATTURARE (tratteggiata): sono due nature diverse dello stesso debito.
// daFatturare e' opzionale — senza, la barra resta come prima.
function _ecfBarra(usato, fido, alta, daFatturare) {
  var pct = fido > 0 ? Math.min(100, (usato / fido) * 100) : 0;
  var col = pct >= 85 ? 'linear-gradient(90deg,#F0564F,#E5342F)' : pct >= 60 ? 'linear-gradient(90deg,#FBAA3E,#F5921E)' : 'linear-gradient(90deg,#5DC33A,#4CAF2E)';
  var tinta = pct >= 85 ? '#E5342F' : pct >= 60 ? '#F5921E' : '#4CAF2E';
  var chiaro = pct >= 85 ? '#F0A9A6' : pct >= 60 ? '#FBD3A0' : '#A8DF95';
  var txt = pct >= 85 ? '#C0392B' : pct >= 60 ? '#E07B18' : '#3B6D11';
  var h = alta ? 24 : 14;

  var df = Number(daFatturare || 0);
  var pctDF = (fido > 0 && df > 0) ? Math.min(pct, (df / fido) * 100) : 0;
  var pctFatt = Math.max(0, pct - pctDF);

  var out = '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">'
    + '<span style="font-size:' + (alta ? 12 : 11) + 'px;color:var(--text-secondary)">Fido utilizzato</span>'
    + '<span style="font-family:var(--font-mono);font-size:' + (alta ? 12.5 : 11) + 'px;font-weight:700;color:' + txt + '">'
    + fmtE(usato) + ' / ' + fmtE(fido) + ' · ' + Math.round(pct) + '%</span></div>'
    + '<div style="display:flex;height:' + h + 'px;border-radius:' + (h / 2) + 'px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden">';

  if (pctDF > 0) {
    out += '<div style="height:100%;width:' + pctFatt.toFixed(1) + '%;background:' + col + '"></div>'
      + '<div title="ordini ancora da fatturare" style="height:100%;width:' + pctDF.toFixed(1) + '%;background:repeating-linear-gradient(45deg,' + tinta + ',' + tinta + ' 4px,' + chiaro + ' 4px,' + chiaro + ' 8px)"></div>';
  } else {
    out += '<div style="height:100%;width:' + pct + '%;border-radius:' + (h / 2) + 'px;background:' + col + '"></div>';
  }
  out += '</div>';

  if (df > 0) {
    out += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:' + (alta ? 11.5 : 10.5) + 'px;color:var(--text-muted);margin-top:5px">'
      + '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:' + tinta + ';margin-right:4px"></span>Fatturato ' + fmtE(usato - df) + '</span>'
      + '<span><span style="display:inline-block;width:9px;height:9px;border-radius:2px;background:repeating-linear-gradient(45deg,' + tinta + ',' + tinta + ' 3px,' + chiaro + ' 3px,' + chiaro + ' 6px);margin-right:4px"></span>Da fatturare ' + fmtE(df) + '</span>'
      + '</div>';
  }
  return out;
}

function ecfSetFiltro(v) { _ecfFiltro = v; _ecfRender(); }
function ecfToggleOrdine(id, cb) { if (cb && cb.checked) _ecfSelezione[id] = true; else delete _ecfSelezione[id]; _ecfRender(); }
function ecfDeseleziona() { _ecfSelezione = {}; _ecfRender(); }

// ═══════════════════════════════════════════════════════════════════════════
// FASCIA FORNITORE (30/07) — fusione delle proposte B e C scelta da Rinaldo.
// In cima: pillole di tutti i fornitori, l'attivo grande, e a destra il da
// pagare. Appena si scorre la fascia si restringe e resta attaccata in alto
// (position:sticky), perché il problema nasce proprio scorrendo le scadenze:
// prima il nome stava in una tendina in alto a destra e si perdeva di vista.
// ═══════════════════════════════════════════════════════════════════════════
function _ecfFascia(daPagare, nAperti) {
  if (!_ecfSel) return '';
  var pct = _ecfSel.fido > 0 ? Math.round((daPagare / _ecfSel.fido) * 100) : null;

  var pillole = (_ecfFornitori || []).map(function (f) {
    var on = f.id === _ecfSel.id;
    return '<span onclick="ecfVaiFornitore(\'' + f.id + '\')" title="' + esc(f.nome) + '" style="cursor:pointer;'
      + (on ? 'font-size:21px;font-weight:700;padding:4px 16px;background:rgba(255,255,255,0.22);'
            : 'font-size:13px;padding:6px 13px;background:rgba(255,255,255,0.10);opacity:.9;')
      + 'border-radius:9px;white-space:nowrap">' + esc(f.nome) + '</span>';
  }).join('');

  return '<div id="ecf-fascia" style="position:sticky;top:0;z-index:40;background:#0C447C;color:#fff;'
      + 'border-radius:11px;padding:11px 16px;margin-bottom:14px;box-shadow:0 2px 10px rgba(0,0,0,.12)">'
    // riga aperta: tutte le pillole
    + '<div id="ecf-fascia-full" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
      + pillole
      + '<span style="flex:1"></span>'
      + '<span style="font-size:12px;opacity:.85">da pagare</span>'
      + '<span style="font-family:var(--font-mono);font-size:19px;font-weight:700">' + fmtE(daPagare) + '</span>'
    + '</div>'
    + '<div id="ecf-fascia-sub" style="font-size:11.5px;opacity:.85;margin-top:5px">dilazione ' + _ecfSel.gg + ' gg'
      + (_ecfSel.fido > 0 ? ' · fido ' + fmtE(_ecfSel.fido) : ' · fido non impostato')
      + ' · ' + nAperti + ' documenti aperti</div>'
    // riga ristretta: compare solo quando la fascia si attacca in alto
    + '<div id="ecf-fascia-mini" style="display:none;align-items:center;gap:10px;flex-wrap:wrap">'
      + '<span style="font-size:16px;font-weight:700">' + esc(_ecfSel.nome) + '</span>'
      + '<span style="font-size:11.5px;opacity:.8">' + _ecfSel.gg + ' gg</span>'
      + '<span style="flex:1"></span>'
      + (pct != null ? '<span style="font-size:11.5px;opacity:.85">fido ' + pct + '%</span>' : '')
      + '<span style="font-family:var(--font-mono);font-size:15px;font-weight:700">' + fmtE(daPagare) + '</span>'
      + '<span onclick="_ecfFasciaApri()" style="font-size:11.5px;background:rgba(255,255,255,0.22);padding:3px 10px;border-radius:7px;cursor:pointer">cambia ▾</span>'
    + '</div></div>';
}

// Passa da fascia aperta a ristretta seguendo lo scorrimento.
function _ecfFasciaOsserva() {
  var f = document.getElementById('ecf-fascia');
  if (!f || f._osservata) return;
  f._osservata = true;
  var sentinella = document.createElement('div');
  sentinella.style.height = '1px';
  f.parentNode.insertBefore(sentinella, f);
  var io = new IntersectionObserver(function (voci) {
    var attaccata = !voci[0].isIntersecting;
    var full = document.getElementById('ecf-fascia-full');
    var sub  = document.getElementById('ecf-fascia-sub');
    var mini = document.getElementById('ecf-fascia-mini');
    if (!full || !mini) return;
    if (attaccata && !f._forzataAperta) {
      full.style.display = 'none'; if (sub) sub.style.display = 'none';
      mini.style.display = 'flex'; f.style.padding = '8px 16px';
    } else {
      full.style.display = 'flex'; if (sub) sub.style.display = '';
      mini.style.display = 'none'; f.style.padding = '11px 16px';
    }
  }, { threshold: 0 });
  io.observe(sentinella);
}

// "cambia ▾" nella fascia ristretta: riapre le pillole finche non si sceglie
function _ecfFasciaApri() {
  var f = document.getElementById('ecf-fascia');
  if (!f) return;
  f._forzataAperta = true;
  var full = document.getElementById('ecf-fascia-full');
  var sub  = document.getElementById('ecf-fascia-sub');
  var mini = document.getElementById('ecf-fascia-mini');
  if (full) full.style.display = 'flex';
  if (sub) sub.style.display = '';
  if (mini) mini.style.display = 'none';
  f.style.padding = '11px 16px';
}

// Cambio fornitore dalle pillole: allinea anche la tendina esistente.
function ecfVaiFornitore(id) {
  if (!id || (_ecfSel && id === _ecfSel.id)) return;
  var sel = document.getElementById('ecf-fornitore');
  if (sel) sel.value = id;
  var f = document.getElementById('ecf-fascia');
  if (f) f._forzataAperta = false;
  ecfCambiaFornitore();
}

function _ecfRender() {
  var body = document.getElementById('ecf-body');
  if (!body || !_ecfSel) return;
  var scrollY = window.scrollY;
  var anno = new Date().getFullYear(), oggi = new Date().toISOString().slice(0, 10);

  var ordAnno = _ecfOrdini.filter(function (o) { return String(o.data).slice(0, 4) === String(anno); });
  var acquistato = ordAnno.reduce(function (s, o) { return s + o.imponibile; }, 0);
  var acquistatoIva = ordAnno.reduce(function (s, o) { return s + o.totale; }, 0);
  var pagatoTot = _ecfFatture.reduce(function (s, f) { return s + f.pagato; }, 0);
  var nSaldate = _ecfFatture.filter(function (f) { return f.saldata; }).length;
  var daPagare = ecfEsposizione();
  // ELENCO UNICO: tutti gli ordini. "Solo da pagare" = debito ancora vivo
  // (né ordine flag-pagato né fattura saldata).
  var elenco = _ecfOrdini.filter(function (o) { return _ecfFiltro === 'tutti' || (!o.pagato && !o.fattSaldata); });
  var nAperti = _ecfOrdini.filter(function (o) { return !o.fatturaId && !o.pagato; }).length
              + _ecfFatture.filter(function (f) { return !f.saldata; }).length;

  var kpi = function (lab, val, sub, tipo) {
    var bg = tipo === 'ok' ? '#EAF3DE' : tipo === 'ko' ? '#FCEBEB' : 'var(--bg)';
    var bd = tipo === 'ok' ? '#639922' : tipo === 'ko' ? '#C0392B' : 'var(--border)';
    var cv = tipo === 'ok' ? '#3B6D11' : tipo === 'ko' ? '#A32D2D' : 'var(--text)';
    var cl = tipo === 'ok' ? '#27500A' : tipo === 'ko' ? '#791F1F' : 'var(--text-muted)';
    return '<div style="flex:1;min-width:200px;border:1px solid ' + bd + ';border-radius:11px;padding:13px 15px;background:' + bg + '">'
      + '<div style="font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:600;color:' + cl + '">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:24px;font-weight:700;margin-top:6px;color:' + cv + '">' + fmtE(val) + '</div>'
      + '<div style="font-size:11px;margin-top:3px;color:' + cl + '">' + sub + '</div></div>';
  };

  // Motore condiviso di registrazione fattura (pf-reg-fattura.js): stessa
  // tabella e stesso modale della linguetta "Senza fattura" in Fatture Fornitori.
  var nDaPagare = elenco.filter(function (o) { return _ecfSelezione[o.id] && !o.pagato; }).length;
  var nGiaPagati = elenco.filter(function (o) { return _ecfSelezione[o.id] && o.pagato; }).length;
  var btnPag = nDaPagare
    ? '<button onclick="ecfApriRegistra()" style="width:100%;margin-top:6px;font-size:12px;padding:8px 10px;border:0.5px solid #0C447C;border-radius:8px;background:var(--bg-card,#fff);color:#0C447C;font-weight:600;cursor:pointer">＋ Pagamento' + (nGiaPagati ? ' (' + nDaPagare + ')' : '') + '</button>'
    : '<div style="margin-top:6px;font-size:10.5px;color:#0C447C;line-height:1.45">Selezione di soli ordini già pagati: puoi agganciare la fattura, non il pagamento.</div>';
  // Stampa dei dettagli della selezione (30/07): solo nella scheda del SINGOLO
  // fornitore — nella vista "Tutti i fornitori" servirebbe una colonna in piu'
  // e mischiare fornitori diversi non serve a nulla.
  btnPag += '<button onclick="ecfStampaSelezione()" style="width:100%;margin-top:6px;font-size:11.5px;padding:7px 10px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg-card,#fff);color:var(--text);cursor:pointer">🖨 Visualizza dettagli</button>';

  // il filtro per data tocca SOLO l'elenco: i totali in cima restano interi
  _ecfElencoTutti = elenco;
  _ecfElencoFiltrato = (_ecfDal || _ecfAl) ? elenco.filter(_ecfNelPeriodo) : elenco;

  if (typeof pfRfCtx === 'function') {
    pfRfCtx('ecf', {
      ordini: _ecfElencoFiltrato,
      sel: _ecfSelezione,
      fornitore: _ecfSel,
      selezionabile: true,
      pagatiInFondo: false,   // scadenza PURA: la prima riga è la prossima scadenza
      // con "Tutti" comandano i piu recenti: fra i vecchi gia pagati la
      // prossima scadenza non e' piu la cosa utile da vedere in cima (30/07)
      ordine: _ecfFiltro === 'tutti' ? 'recenti' : 'scadenza',
      onChange: _ecfRender,
      onSaved: async function () { _ecfSelezione = {}; await _ecfCarica(); _ecfRender(); },
      extraBtn: btnPag
    });
  }

  var th = 'padding:9px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;background:var(--bg)';
  var btnF = function (v, t) {
    var on = _ecfFiltro === v;
    return '<button onclick="ecfSetFiltro(\'' + v + '\')" style="font-size:11.5px;padding:6px 14px;border:0.5px solid ' + (on ? '#0C447C' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#0C447C' : 'var(--bg)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer">' + t + '</button>';
  };

  // OVERRIDE QUADRATURA anno: Σ (dichiarato − Σ ordini) delle fatture con
  // importo dichiarato, per data fattura nell'anno corrente.
  var ovrAnno = 0, ovrN = 0;
  _ecfFatture.forEach(function (f) {
    if (!(Number(f.importo_dichiarato) > 0) || String(f.data || '').slice(0, 4) !== String(anno)) return;
    var so = (f.ordini || []).reduce(function (t, o) { return t + Number(o.totale || 0); }, 0);
    var d = Math.round((Number(f.importo_dichiarato) - so) * 100) / 100;
    if (Math.abs(d) >= 0.01) { ovrAnno += d; ovrN++; }
  });
  ovrAnno = Math.round(ovrAnno * 100) / 100;

  body.innerHTML =
    _ecfFascia(daPagare, nAperti)
    + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">'
      + kpi('Acquistato ' + anno, acquistato, 'imponibile · IVA inc. ' + fmtE(acquistatoIva) + ' · ' + ordAnno.length + ' ordini · dilazione ' + _ecfSel.gg + ' gg', '')
      + kpi('Pagato', pagatoTot, nSaldate + ' fatture saldate', 'ok')
      + kpi('Da pagare', daPagare, nAperti + ' documenti aperti', 'ko')
    + '</div>'
    + '<div onclick="ecfApriOverride()" title="Differenze tra importo dichiarato in fattura e somma degli ordini — clicca per il dettaglio mensile"'
      + ' style="display:inline-flex;align-items:baseline;gap:10px;margin-bottom:16px;padding:9px 14px;border:0.5px solid var(--border);border-radius:9px;background:var(--bg);cursor:pointer">'
      + '<span style="font-size:10px;letter-spacing:1px;text-transform:uppercase;font-weight:600;color:var(--text-muted)">Override quadratura ' + anno + '</span>'
      + '<span style="font-family:var(--font-mono);font-size:17px;font-weight:700;color:' + (ovrAnno > 0 ? '#A32D2D' : ovrAnno < 0 ? '#3B6D11' : 'var(--text-muted)') + '">'
        + (ovrAnno > 0 ? '+' : '') + fmtE(ovrAnno) + '</span>'
      + '<span style="font-size:11px;color:var(--text-muted)">' + ovrN + ' fatture con scarto · dettaglio per mese ▸</span>'
    + '</div>'
    + (_ecfSel.fido > 0
        ? '<div style="margin-bottom:20px">' + _ecfBarra(ecfEsposizione(), _ecfSel.fido, true, _ecfDaFatturare())
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:11px;padding-top:11px;border-top:0.5px solid var(--border)">'
            + '<span style="font-size:13px;color:var(--text-secondary);font-weight:600">Fido disponibile da usare</span>'
            + '<span style="font-family:var(--font-mono);font-size:21px;font-weight:700;color:' + ((_ecfSel.fido - ecfEsposizione()) < 0 ? '#A32D2D' : '#3B6D11') + '">' + fmtE(_ecfSel.fido - ecfEsposizione()) + '</span></div>'
          + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:5px">calcolato sugli ordini non pagati e sui residui delle fatture</div></div>'
        : '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:16px">Nessun fido assegnato a questo fornitore.</div>')

    // Banner laterale FISSO: resta visibile anche scorrendo in fondo all'elenco
    + _ecfTimelineHtml()
    + (typeof pfRfBox === 'function' ? pfRfBox('ecf') : '')

    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">'
      + '<div style="font-size:13px;font-weight:600">Ordini e fatture — per scadenza</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">' + _ecfBarraData()
        + btnF('aperti', 'Solo da pagare') + btnF('tutti', 'Tutti')
        + (typeof pfRfBtnVista === 'function' ? pfRfBtnVista('ecf') : '') + '</div></div>'
    + _ecfRiepilogoData(_ecfElencoTutti || [], _ecfElencoFiltrato || [])
    + '<div style="margin-bottom:22px">' + (typeof pfRfTabella === 'function' ? pfRfTabella('ecf') : '') + '</div>'
    + '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px">'
      + '<div style="font-size:10.5px;color:var(--text-muted)">Clicca il numero fattura in riga per il dettaglio, il pagamento o la modifica del numero.</div>'
      + (_ecfFiltro === 'aperti'
          ? '<button onclick="ecfStampaElenco()" style="font-size:12px;padding:8px 16px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-weight:600;white-space:nowrap">🖨 Stampa elenco</button>'
          : '')
    + '</div>';

  window.scrollTo(0, scrollY);
  if (typeof IntersectionObserver === 'function') _ecfFasciaOsserva();
}

// ── Banche: ordine costituzionale Intesa → MPS → BNL → BCC → altri ──
function _ecfPrioBanca(n) {
  n = String(n || '').toLowerCase();
  if (n.indexOf('intesa') >= 0) return 1;
  if (n.indexOf('mps') >= 0 || n.indexOf('monte') >= 0) return 2;
  if (n.indexOf('bnl') >= 0 || n.indexOf('bnp') >= 0) return 3;
  if (n.indexOf('bcc') >= 0 || n.indexOf('credito coop') >= 0) return 4;
  return 9;
}
function _ecfOpzioniConti(sel) {
  var l = _ecfConti.map(function (c) {
    return { id: c.id, nome: (_ecfIstituti[c.istituto_id] || 'Banca') + (c.descrizione ? ' · ' + c.descrizione : (c.iban ? ' · ' + String(c.iban).slice(-6) : '')) };
  }).sort(function (a, b) { return _ecfPrioBanca(a.nome) - _ecfPrioBanca(b.nome) || a.nome.localeCompare(b.nome); });
  return l.map(function (c) { return '<option value="' + c.id + '"' + (sel === c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>'; }).join('');
}
function _ecfOggi() { return new Date().toISOString().slice(0, 10); }
function _ecfNum(v) {
  if (v == null) return 0;
  v = String(v).trim().replace(/\s/g, '').replace(/€/g, ''); if (!v) return 0;
  if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
  var n = Number(v); return isNaN(n) ? 0 : n;
}

// Nuova fattura sugli ordini selezionati
function ecfApriRegistra() {
  var ords = _ecfOrdini.filter(function (o) { return _ecfSelezione[o.id] && !o.pagato && !o.fattSaldata; });
  if (!ords.length) { toast('Seleziona almeno un ordine non ancora pagato'); return; }

  // Ordini GIÀ FATTURATI nella selezione: il pagamento è quello della fattura.
  var fattIds = [];
  ords.forEach(function (o) { var v = o.fatturaId || ''; if (fattIds.indexOf(v) < 0) fattIds.push(v); });
  var conFattura = fattIds.filter(function (v) { return v; });
  if (conFattura.length) {
    if (fattIds.length === 1) { ecfPagaFattura(conFattura[0]); return; }  // tutti sulla stessa fattura
    toast('Un pagamento riguarda una fattura sola: selezione su ' + (fattIds.indexOf('') >= 0 ? 'ordini liberi e fatturati insieme' : conFattura.length + ' fatture diverse') + ' — paga una fattura alla volta (anche dal suo numero in riga)');
    return;
  }
  var tot = Math.round(ords.reduce(function (s, o) { return s + o.totale; }, 0) * 100) / 100;
  // data fattura proposta = data dell'ORDINE (la più recente), mai oggi
  var dOrd = ords.map(function (o) { return o.data; }).sort();
  _ecfMod = { tipo: 'nuova', ordini: ords, totale: tot, modo: 'totale', importo: tot, fatturaId: null, dataOrdine: dOrd[dOrd.length - 1] };
  _ecfRenderModale();
}

// Pagamento su fattura già registrata (saldo o nuovo acconto)
function ecfPagaFattura(fatturaId) {
  var f = _ecfFatture.filter(function (x) { return x.id === fatturaId; })[0];
  if (!f) return;
  if (f.saldata) { toast('Fattura già saldata'); return; }
  _ecfMod = { tipo: 'esistente', fattura: f, ordini: f.ordini, totale: f.residuo, modo: 'totale', importo: f.residuo, fatturaId: f.id };
  _ecfRenderModale();
}

function ecfSetModo(m) {
  if (!_ecfMod) return;
  _ecfMod.modo = m;
  if (m === 'totale') _ecfMod.importo = _ecfMod.totale;
  _ecfRenderModale();
}
function ecfOnImporto() {
  if (!_ecfMod) return;
  var el = document.getElementById('ecf-imp');
  _ecfMod.importo = el ? _ecfNum(el.value) : 0;
  _ecfAggiornaFidoBox();
}
function _ecfAggiornaFidoBox() {
  var box = document.getElementById('ecf-fidobox');
  if (!box || !_ecfSel || !(_ecfSel.fido > 0)) return;
  var usato = ecfEsposizione();
  var imp = Math.max(0, Number(_ecfMod && _ecfMod.importo || 0));
  var dopo = Math.max(0, usato - imp);
  var pPrima = Math.min(100, (usato / _ecfSel.fido) * 100);
  var pDopo = Math.min(100, (dopo / _ecfSel.fido) * 100);
  box.innerHTML = '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Fido ' + esc(_ecfSel.nome) + '</div>'
    + _ecfBarra(dopo, _ecfSel.fido, false)
    + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:5px">prima del pagamento ' + Math.round(pPrima) + '% · dopo ' + Math.round(pDopo) + '% · rientri di ' + fmtE(imp) + '</div>';
}

function _ecfRenderModale() {
  var S = _ecfMod; if (!S) return;
  var box = 'width:100%;box-sizing:border-box;padding:8px 10px;font-size:14px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-family:var(--font-mono)';
  var lbl = 'display:block;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-bottom:4px';
  var esistente = S.tipo === 'esistente';

  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">' + (esistente ? 'Pagamento fattura ' + esc(S.fattura.numero || '(da numerare)') : 'Registra pagamento') + ' — ' + esc(_ecfSel.nome) + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + S.ordini.length + ' ordini · ' + (esistente ? 'residuo ' : 'totale ') + fmtE(S.totale) + '</div>';

  if (!esistente) {
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">n° fattura <span style="font-weight:400;text-transform:none;letter-spacing:0">(facoltativo)</span></label><input id="ecf-nfatt" type="text" placeholder="lascia vuoto se non è ancora arrivata" style="' + box + '"></div>'
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">data fattura</label><input id="ecf-dfatt" type="date" value="' + (S.dataOrdine || _ecfOggi()) + '" style="' + box + '"></div>'
      + '</div>'
      + '<div style="background:#E6F1FB;color:#0C447C;padding:8px 12px;border-radius:7px;font-size:11.5px;line-height:1.5;margin-bottom:12px">'
        + 'Puoi pagare anche senza fattura: l\'ordine esce dal fido subito e il numero si inserisce dopo dal tasto ✎ nella riga dell\'elenco.</div>';
  }

  h += '<div style="display:inline-flex;border:0.5px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:12px">'
    + '<span onclick="ecfSetModo(\'totale\')" style="padding:7px 18px;font-size:13px;cursor:pointer;' + (S.modo === 'totale' ? 'background:#0C447C;color:#fff;font-weight:600' : 'color:var(--text)') + '">Totale</span>'
    + '<span onclick="ecfSetModo(\'parziale\')" style="padding:7px 18px;font-size:13px;cursor:pointer;' + (S.modo === 'parziale' ? 'background:#0C447C;color:#fff;font-weight:600' : 'color:var(--text)') + '">Parziale</span>'
    + '</div>'
    + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">importo' + (S.modo === 'parziale' ? ' (acconto)' : '') + '</label>'
    + '<input id="ecf-imp" type="text" inputmode="decimal" value="' + String(S.importo).replace('.', ',') + '"' + (S.modo === 'totale' ? ' readonly' : '') + ' oninput="ecfOnImporto()" style="' + box + (S.modo === 'totale' ? ';opacity:.7' : '') + '"></div>'
    + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">data pagamento</label><input id="ecf-dpag" type="date" value="' + _ecfOggi() + '" style="' + box + '"></div>'
    + '</div>'
    + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
    + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">modalità</label><select id="ecf-mod" style="' + box + ';font-family:inherit"><option value="bonifico">Bonifico</option><option value="riba">RIBA</option><option value="assegno">Assegno</option></select></div>'
    + '<div style="flex:1;min-width:180px"><label style="' + lbl + '">banca</label><select id="ecf-conto" style="' + box + ';font-family:inherit">' + _ecfOpzioniConti() + '</select></div>'
    + '</div>';

  if (_ecfSel.fido > 0) h += '<div id="ecf-fidobox" style="border:0.5px solid var(--border);border-radius:9px;padding:10px 12px;background:var(--bg);margin-bottom:14px"></div>';

  h += '<div style="display:flex;justify-content:flex-end;gap:10px">'
    + '<button onclick="chiudiModalePermessi()" style="padding:9px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-size:13px">Annulla</button>'
    + '<button id="ecf-conferma" onclick="ecfConferma()" style="padding:9px 20px;border:none;border-radius:8px;background:#0C447C;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Conferma</button></div>';

  apriModal(h);
  setTimeout(_ecfAggiornaFidoBox, 0);
}

async function ecfConferma() {
  var S = _ecfMod; if (!S) return;
  var btn = document.getElementById('ecf-conferma');
  var importo = _ecfNum(document.getElementById('ecf-imp').value);
  var dataPag = document.getElementById('ecf-dpag').value || _ecfOggi();
  var modalita = document.getElementById('ecf-mod').value;
  var contoId = document.getElementById('ecf-conto').value || null;
  if (!(importo > 0)) { toast('Inserisci un importo valido'); return; }
  if (importo > S.totale + 0.01) { toast('L\'importo supera il totale da pagare'); return; }

  var nFatt = null, dFatt = null;
  if (S.tipo === 'nuova') {
    nFatt = (document.getElementById('ecf-nfatt').value || '').trim();
    dFatt = document.getElementById('ecf-dfatt').value || _ecfOggi();
    // n° fattura FACOLTATIVO: si può pagare prima che la fattura arrivi
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; }

  try {
    var fatturaId = S.fatturaId;
    if (S.tipo === 'nuova') {
      var ins = await sb.from('fatture_ricevute').insert([{
        fornitore_id: _ecfSel.id,
        fornitore_nome: _ecfSel.nome,
        numero_fattura: nFatt || null,
        data_fattura: dFatt,
        data_scadenza: _ecfAddGiorni(dFatt, _ecfSel.gg),
        importo_dichiarato: S.totale,
        tipo_ingresso: 'estratto_conto'
      }]).select().single();
      if (ins.error) throw ins.error;
      fatturaId = ins.data.id;
      var ids = S.ordini.map(function (o) { return o.id; });
      var up = await sb.from('ordini').update({ fattura_ricevuta_id: fatturaId }).in('id', ids);
      if (up.error) throw up.error;
    }

    var insP = await sb.from('pagamenti_fornitori').insert([{
      fattura_ricevuta_id: fatturaId,
      importo: importo,
      data_pagamento: dataPag,
      modalita: modalita,
      conto_id: contoId,
      riferimento_esterno: (importo < S.totale - 0.01) ? 'acconto su fattura' : null
    }]).select('id').single();
    if (insP.error) {
      // ROLLBACK: la fattura contenitore appena creata non deve restare
      // orfana se il pagamento non passa.
      if (S.tipo === 'nuova' && fatturaId) {
        await sb.from('ordini').update({ fattura_ricevuta_id: null }).eq('fattura_ricevuta_id', fatturaId);
        await sb.from('fatture_ricevute').delete().eq('id', fatturaId);
      }
      throw insP.error;
    }

    // PONTE FOGLIO GIORNALE — stesso schema del modale ufficiale. Non-critico:
    // il pagamento è già salvato, un errore qui va solo a log.
    try {
      var contoSel = _ecfConti.filter(function (c) { return c.id === contoId; })[0];
      var descMov = 'Pagamento ' + _ecfSel.nome + ' · FT ' + (nFatt || (S.fattura && S.fattura.numero) || '(da numerare)')
        + (importo < S.totale - 0.01 ? ' (parziale)' : '');
      var movIns = await sb.from('foglio_giornale_movimenti').insert([{
        data: dataPag,
        tipo: 'uscita',
        importo: importo,
        descrizione: descMov,
        banca_id: contoSel ? contoSel.istituto_id : null,
        cassa_tipo: null,
        metodo: modalita,
        origine: 'auto-fattura',   // valore ammesso dal vincolo: prima era 'estratto_conto' e l'insert falliva in silenzio
        note: null
      }]).select('id').single();
      if (movIns.error) {
        console.warn('[ecf] pagamento salvato ma movimento foglio non creato:', movIns.error.message);
      } else if (movIns.data) {
        await sb.from('foglio_giornale_riconciliazioni').insert([{
          movimento_id: movIns.data.id,
          fattura_emessa_id: null,
          ordine_id: null,
          fattura_ricevuta_id: fatturaId,
          importo_imputato: importo
        }]);
        if (insP.data && insP.data.id) {
          await sb.from('pagamenti_fornitori').update({ movimento_foglio_id: movIns.data.id }).eq('id', insP.data.id);
        }
      }
    } catch (eMov) { console.warn('[ecf] ponte foglio giornale:', eMov); }

    // Saldo totale → gli ordini della fattura risultano pagati
    if (importo >= S.totale - 0.01) {
      var idsOk = S.ordini.map(function (o) { return o.id; });
      await sb.from('ordini').update({ pagato_fornitore: true }).in('id', idsOk);
    }

    pfDebitoInvalida();
    if (typeof _auditLog === 'function') _auditLog('pagamento_fornitore', 'pagamenti_fornitori', _ecfSel.nome + ' ' + fmtE(importo) + ' · fattura ' + (nFatt || (S.fattura && S.fattura.numero) || '—'));
    toast('✓ ' + (importo >= S.totale - 0.01 ? 'Pagamento registrato' : 'Acconto registrato'));
    chiudiModalePermessi();
    _ecfSelezione = {};
    await _ecfCarica();
    _ecfRender();
  } catch (e) {
    console.error('ecfConferma', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Conferma'; }
    toast('Errore: ' + (e && e.message ? e.message : e));
  }
}

// STAMPA ELENCO — pagina pulita dei soli ordini da pagare, per il fornitore
function ecfStampaElenco() {
  var vivi = _ecfOrdini.filter(function (o) { return !o.pagato && !o.fattSaldata; })
    .slice().sort(function (a, b) {
      var sa = String(a.scadenza || '9999'), sb2 = String(b.scadenza || '9999');
      if (sa !== sb2) return sa < sb2 ? -1 : 1;
      return String(a.data || '').localeCompare(String(b.data || ''));
    });
  if (!vivi.length) { toast('Nessun ordine da pagare da stampare'); return; }
  var oggiIt = _pfIsoToIt(new Date().toISOString().slice(0, 10));
  // acconti versati: una volta per fattura (non per ordine, o si duplicano)
  var acconti = 0, _fv = {};
  vivi.forEach(function (o) {
    if (o.fattAcconti && o.fatturaId && !_fv[o.fatturaId]) { _fv[o.fatturaId] = true; acconti += Number(o.fattPagatoVal || 0); }
  });
  var lit = 0, imp = 0, tot = 0;
  var righe = vivi.map(function (o) {
    lit += Number(o.litri || 0); imp += o.imponibile; tot += o.totale;
    return '<tr>'
      + '<td>' + _pfIsoToIt(o.data) + '</td>'
      + '<td>' + esc(o.prodotto || '—') + '</td>'
      + '<td class="n">' + Number(o.litri || 0).toLocaleString('it-IT') + '</td>'
      + '<td class="n">' + Number(o.costoL || 0).toFixed(4).replace('.', ',') + '</td>'
      + '<td class="n">' + fmtE(o.imponibile) + '</td>'
      + '<td class="n">' + fmtE(o.totale) + '</td>'
      + '<td>' + (o.numeroFattura ? esc(o.numeroFattura) : (o.fatturaId ? 'da numerare' : '—'))
        + (o.fattAcconti ? '<div style="font-size:10px;color:#555">acconto ' + fmtE(o.fattPagatoVal || 0) + '</div>' : '') + '</td>'
      + '<td class="s">' + (o.scadenza ? _pfIsoToIt(o.scadenza) : '—') + '</td>'
      + '</tr>';
  }).join('');
  var w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra di stampa: consenti i pop-up'); return; }
  w.document.write('<!DOCTYPE html><html lang="it"><head><meta charset="utf-8">'
    + '<title>Ordini da pagare — ' + esc(_ecfSel.nome) + ' — ' + oggiIt + '</title>'
    + '<style>'
    + 'body{font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1B2430;margin:28px}'
    + 'h1{font-size:17px;margin:0 0 2px} .sub{color:#555;font-size:11.5px;margin-bottom:16px}'
    + 'table{width:100%;border-collapse:collapse} '
    + 'th{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;text-align:left;background:#F0F2F4;padding:7px 6px;border-bottom:1px solid #999}'
    + 'td{padding:6px;border-bottom:0.5px solid #ccc} .n{text-align:right;font-variant-numeric:tabular-nums} .s{font-weight:700}'
    + 'tfoot td{font-weight:700;border-top:2px solid #333;border-bottom:none}'
    + '.firma{margin-top:44px;display:flex;justify-content:space-between;font-size:11.5px}'
    + '.firma div{width:44%;border-top:1px solid #333;padding-top:5px}'
    + '@media print{body{margin:12mm}}'
    + '</style></head><body>'
    + '<h1>Phoenix Fuel S.r.l. — Ordini da pagare · ' + esc(_ecfSel.nome) + '</h1>'
    + '<div class="sub">Situazione al ' + oggiIt + ' · ' + vivi.length + (vivi.length === 1 ? ' ordine' : ' ordini')
      + ' · dilazione ' + _ecfSel.gg + ' gg · documento di riscontro da confermare con il fornitore</div>'
    + '<table><thead><tr><th>Data</th><th>Prodotto</th><th>Litri</th><th>€/L</th><th>Imponibile</th><th>Tot. IVA inc.</th><th>N. fattura</th><th>Scadenza</th></tr></thead>'
    + '<tbody>' + righe + '</tbody>'
    + '<tfoot><tr><td colspan="2">Totale ordini</td><td class="n">' + lit.toLocaleString('it-IT') + '</td><td></td>'
      + '<td class="n">' + fmtE(imp) + '</td><td class="n">' + fmtE(tot) + '</td><td colspan="2"></td></tr>'
      + (acconti > 0.009
          ? '<tr><td colspan="5">Acconti già versati su fatture aperte</td><td class="n">− ' + fmtE(acconti) + '</td><td colspan="2"></td></tr>'
            + '<tr><td colspan="5">NETTO DA PAGARE</td><td class="n">' + fmtE(Math.max(0, tot - acconti)) + '</td><td colspan="2"></td></tr>'
          : '') + '</tfoot></table>'
    + '<div class="firma"><div>Phoenix Fuel S.r.l.</div><div>Per conferma — ' + esc(_ecfSel.nome) + '</div></div>'
    + '<script>window.onload=function(){window.print()}<\/script>'
    + '</body></html>');
  w.document.close();
}

// MODIFICA PAGAMENTO — dal badge PAGATO in riga
async function ecfModificaPagamento(ordineId) {
  var o = _ecfOrdini.filter(function (x) { return x.id === ordineId; })[0];
  if (!o) return;
  var f = o.fatturaId ? _ecfFatture.filter(function (x) { return x.id === o.fatturaId; })[0] : null;
  var pags = [];
  if (f) {
    var d = await pfDebitoDati();
    pags = d.pagamenti.filter(function (p) { return p.fattura_ricevuta_id === f.id; });
  }
  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">Modifica pagamento — ' + esc(_ecfSel.nome) + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">ordine ' + _pfIsoToIt(o.data) + ' · ' + esc(o.prodotto || '') + ' · ' + fmtE(o.totale)
      + (f ? ' · fattura ' + (f.numero ? esc(f.numero) : '(da numerare)') : ' · senza fattura') + '</div>';

  if (pags.length) {
    h += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Pagamenti registrati</div>'
      + '<div style="border:0.5px solid var(--border);border-radius:8px;margin-bottom:14px">'
      + pags.map(function (p) {
          var conto = _ecfConti.filter(function (c) { return c.id === p.conto_id; })[0];
          var banca = conto ? (_ecfIstituti[conto.istituto_id] || '') : '';
          return '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;border-bottom:0.5px solid var(--border);font-size:12.5px">'
            + '<span style="font-family:var(--font-mono)">' + _pfIsoToIt(p.data_pagamento) + '</span>'
            + '<span style="flex:1;color:var(--text-muted)">' + esc(p.modalita || '') + (banca ? ' · ' + esc(banca) : '') + '</span>'
            + '<span style="font-family:var(--font-mono);font-weight:700">' + fmtE(p.importo) + '</span>'
            + '<button onclick="ecfApriModificaPagamento(\'' + p.id + '\',\'' + o.id + '\')" style="font-size:11px;color:#0C447C;border:0.5px solid #A9C9EC;background:var(--bg-card,#fff);border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600;margin-right:4px">✎ Modifica</button>'
            + '<button onclick="ecfAnnullaPagamento(\'' + p.id + '\',\'' + f.id + '\')" style="font-size:11px;color:#A32D2D;border:0.5px solid #E4B7B7;background:var(--bg-card,#fff);border-radius:6px;padding:4px 10px;cursor:pointer;font-weight:600">✕ Annulla</button>'
            + '</div>';
        }).join('')
      + '</div>'
      + '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Annullando un pagamento gli ordini della fattura tornano DA PAGARE e il fido si rioccupa subito.</div>';
  }

  if (o.pagato && !pags.length) {
    h += '<div style="background:#FFF1DC;color:#633806;padding:10px 12px;border-radius:7px;font-size:12px;line-height:1.5;margin-bottom:14px">'
      + 'Quest\'ordine risulta pagato dal caricamento iniziale (nessun pagamento registrato con data e banca).</div>'
      + '<div style="display:flex;justify-content:flex-end;margin-bottom:4px">'
      + '<button onclick="ecfAnnullaFlag(\'' + o.id + '\')" style="padding:9px 16px;font-size:12px;border:none;border-radius:8px;background:#A32D2D;color:#fff;font-weight:600;cursor:pointer">Riporta a DA PAGARE</button></div>';
  }

  if (!pags.length && !o.pagato) h += '<div style="color:var(--text-muted);font-size:12.5px">Nessun pagamento da modificare su quest\'ordine.</div>';
  apriModal(h);
}


// ═══ v20260801a · MODIFICA DI UN PAGAMENTO FORNITORE ════════════════
// Prima si poteva solo ANNULLARE e rifare. Ora si corregge sul posto:
// data, importo, modalita, banca, riferimento.
// Regola di Rinaldo (01/08/2026): il movimento nel foglio giornale
// segue la modifica SOLO quando cambia l'importo. Se cambiano data,
// banca o modalita il movimento resta com'e — ma il modale lo dice e
// offre una spunta per allinearlo lo stesso, perche altrimenti in
// banca la riga resta al vecchio giorno e la riconciliazione non torna.
var _ecfModPag = null;

async function ecfApriModificaPagamento(pagId, ordineId) {
  var d = await pfDebitoDati();
  var p = (d.pagamenti || []).filter(function (x) { return x.id === pagId; })[0];
  if (!p) { toast('Pagamento non trovato'); return; }
  var f = (_ecfFatture || []).filter(function (x) { return x.id === p.fattura_ricevuta_id; })[0];

  // Quanto pesa questa fattura e quanto e gia stato pagato con ALTRI pagamenti:
  // serve per dire subito se la fattura resta scoperta o va in pari.
  var totFattura = 0;
  if (f) {
    totFattura = Number(f.importo_dichiarato || 0);
    if (!totFattura) {
      totFattura = (_ecfOrdini || []).filter(function (o) { return o.fatturaId === f.id; })
        .reduce(function (s, o) { return s + Number(o.totale || 0); }, 0);
    }
  }
  var altri = (d.pagamenti || [])
    .filter(function (x) { return x.fattura_ricevuta_id === p.fattura_ricevuta_id && x.id !== pagId; })
    .reduce(function (s, x) { return s + Number(x.importo || 0); }, 0);

  _ecfModPag = { pagId: pagId, ordineId: ordineId, fatturaId: p.fattura_ricevuta_id,
                 importoOrig: Number(p.importo || 0), dataOrig: p.data_pagamento,
                 contoOrig: p.conto_id, modalitaOrig: p.modalita,
                 movId: p.movimento_foglio_id || null, totFattura: totFattura, altri: altri };

  var inp = 'width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lab = 'font-size:11px;color:var(--text-muted);font-weight:500';

  var h = '<div style="max-width:520px">';
  h += '<div style="font-size:16px;font-weight:600;margin-bottom:2px">&#9998; Modifica pagamento — ' + esc(_ecfSel.nome) + '</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">fattura '
     + (f && f.numero ? esc(f.numero) : '(da numerare)')
     + (totFattura ? ' · totale ' + fmtE(totFattura) : '')
     + (altri ? ' · altri pagamenti ' + fmtE(altri) : '') + '</div>';

  h += '<div style="display:grid;gap:10px">';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div><label style="' + lab + '">Data pagamento</label>'
     + '<input id="ecf-mp-data" type="date" value="' + esc(p.data_pagamento || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lab + '">Importo &euro;</label>'
     + '<input id="ecf-mp-importo" type="number" step="0.01" value="' + Number(p.importo || 0).toFixed(2) + '" oninput="_ecfModPagAnteprima()" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '</div>';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div><label style="' + lab + '">Modalita</label><select id="ecf-mp-modalita" style="' + inp + '">';
  ['bonifico', 'assegno', 'riba', 'contanti', 'compensazione', 'altro'].forEach(function (m) {
    h += '<option value="' + m + '"' + (String(p.modalita || '') === m ? ' selected' : '') + '>' + m.charAt(0).toUpperCase() + m.slice(1) + '</option>';
  });
  h += '</select></div>';
  h += '<div><label style="' + lab + '">Banca</label><select id="ecf-mp-conto" style="' + inp + '">';
  h += '<option value="">— nessuna —</option>';
  (_ecfConti || []).forEach(function (c) {
    var nome = (_ecfIstituti[c.istituto_id] || '') + (c.numero_conto ? ' · ' + c.numero_conto : '');
    h += '<option value="' + c.id + '"' + (p.conto_id === c.id ? ' selected' : '') + '>' + esc(nome) + '</option>';
  });
  h += '</select></div></div>';

  h += '<div><label style="' + lab + '">Riferimento (assegno, CRO, nota)</label>'
     + '<input id="ecf-mp-rif" type="text" value="' + esc(p.riferimento_esterno || '') + '" style="' + inp + '"></div>';
  h += '</div>';

  h += '<div id="ecf-mp-anteprima" style="background:var(--bg-kpi);border-radius:8px;padding:11px 13px;margin-top:12px;font-size:12.5px"></div>';

  h += '<label style="display:flex;align-items:center;gap:7px;margin-top:10px;font-size:11.5px;color:var(--text-muted);cursor:pointer">'
     + '<input id="ecf-mp-allinea" type="checkbox" style="cursor:pointer"> Allinea anche data, banca e modalita del movimento in banca'
     + '</label>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:3px">L\'importo del movimento viene sempre aggiornato quando cambia.</div>';

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  h += '<button onclick="chiudiModalePermessi()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  h += '<button onclick="ecfSalvaModificaPagamento()" class="btn-primary" style="font-size:12px;padding:8px 14px">&#128190; Salva</button>';
  h += '</div></div>';

  apriModal(h);
  _ecfModPagAnteprima();
}

// Dice in diretta che effetto ha il nuovo importo sulla fattura.
function _ecfModPagAnteprima() {
  var box = document.getElementById('ecf-mp-anteprima');
  if (!box || !_ecfModPag) return;
  var el = document.getElementById('ecf-mp-importo');
  var nuovo = el ? Number(el.value || 0) : _ecfModPag.importoOrig;
  var S = _ecfModPag;
  var pagatoDopo = S.altri + nuovo;
  var residuo = S.totFattura ? (S.totFattura - pagatoDopo) : 0;
  var righe = '';
  righe += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Importo</span>'
        + '<span style="font-family:var(--font-mono)"><span style="color:var(--text-muted)">' + fmtE(S.importoOrig) + '</span> &rarr; <strong>' + fmtE(nuovo) + '</strong></span></div>';
  if (S.totFattura) {
    var saldata = residuo <= 0.01;
    righe += '<div style="display:flex;justify-content:space-between;margin-top:4px"><span style="color:var(--text-muted)">Residuo della fattura</span>'
          + '<span style="font-family:var(--font-mono);font-weight:700;color:' + (saldata ? '#27500A' : '#854F0B') + '">'
          + fmtE(Math.max(0, residuo)) + (saldata ? ' · saldata' : ' · ancora scoperta') + '</span></div>';
    righe += '<div style="font-size:11px;color:var(--text-muted);margin-top:5px">'
          + (saldata ? 'Gli ordini della fattura restano PAGATI.' : 'Gli ordini della fattura tornano DA PAGARE e il fido si rioccupa.') + '</div>';
  }
  box.innerHTML = righe;
}

async function ecfSalvaModificaPagamento() {
  var S = _ecfModPag;
  if (!S) return;
  var data = (document.getElementById('ecf-mp-data') || {}).value || null;
  var importo = Number((document.getElementById('ecf-mp-importo') || {}).value || 0);
  var modalita = (document.getElementById('ecf-mp-modalita') || {}).value || null;
  var contoId = (document.getElementById('ecf-mp-conto') || {}).value || null;
  var rif = (((document.getElementById('ecf-mp-rif') || {}).value) || '').trim() || null;
  var allinea = !!((document.getElementById('ecf-mp-allinea') || {}).checked);

  if (!data) { toast('Indica la data del pagamento'); return; }
  if (!(importo > 0)) { toast('L\'importo deve essere maggiore di zero'); return; }
  if (S.totFattura && (S.altri + importo) > S.totFattura + 0.01) {
    if (!confirm('Con questo importo la fattura risulterebbe pagata piu del dovuto ('
      + fmtE(S.altri + importo) + ' su ' + fmtE(S.totFattura) + '). Procedo lo stesso?')) return;
  }

  var importoCambiato = Math.abs(importo - S.importoOrig) > 0.005;

  try {
    var up = await sb.from('pagamenti_fornitori').update({
      data_pagamento: data, importo: importo, modalita: modalita,
      conto_id: contoId || null, riferimento_esterno: rif
    }).eq('id', S.pagId);
    if (up.error) throw up.error;

    // Movimento in banca: l'importo lo segue sempre, il resto solo su richiesta.
    if (S.movId && (importoCambiato || allinea)) {
      var payMov = {};
      if (importoCambiato) payMov.importo = importo;
      if (allinea) {
        payMov.data = data;
        payMov.metodo = modalita;
        var contoSel = (_ecfConti || []).filter(function (c) { return c.id === contoId; })[0];
        payMov.banca_id = contoSel ? contoSel.istituto_id : null;
      }
      var upMov = await sb.from('foglio_giornale_movimenti').update(payMov).eq('id', S.movId);
      if (upMov.error) toast('Pagamento salvato, ma il movimento in banca non e stato aggiornato: ' + upMov.error.message);
      else if (importoCambiato) {
        await sb.from('foglio_giornale_riconciliazioni')
          .update({ importo_imputato: importo }).eq('movimento_id', S.movId);
      }
    }

    // Gli ordini della fattura seguono il saldo: pagati se copre tutto,
    // di nuovo da pagare se l'importo e sceso sotto il totale.
    if (importoCambiato && S.fatturaId && S.totFattura) {
      var saldata = (S.altri + importo) >= S.totFattura - 0.01;
      var upOrd = await sb.from('ordini').update({ pagato_fornitore: saldata })
        .eq('fattura_ricevuta_id', S.fatturaId);
      if (upOrd.error) toast('Attenzione: lo stato degli ordini non e stato aggiornato: ' + upOrd.error.message);
    }

    pfDebitoInvalida();
    if (typeof _auditLog === 'function') {
      _auditLog('modifica_pagamento', 'pagamenti_fornitori', _ecfSel.nome
        + ' — pagamento ' + S.pagId.substring(0, 8)
        + ': ' + fmtE(S.importoOrig) + ' del ' + S.dataOrig + ' -> ' + fmtE(importo) + ' del ' + data
        + (importoCambiato ? ' (movimento in banca aggiornato)' : ''));
    }
    toast('\u2713 Pagamento aggiornato');
    _ecfModPag = null;
    chiudiModalePermessi();
    await _ecfCarica(); _ecfRender();
    if (typeof _rfRenderTab === 'function' && document.getElementById('rf-body')) _rfRenderTab();
  } catch (e) {
    toast('Errore: ' + ((e && e.message) || e));
  }
}

async function ecfAnnullaPagamento(pagId, fattId) {
  if (!confirm('Annullare questo pagamento? Gli ordini della fattura torneranno DA PAGARE.')) return;
  try {
    // il movimento di foglio giornale collegato va rimosso con il pagamento
    var pRow = await sb.from('pagamenti_fornitori').select('movimento_foglio_id').eq('id', pagId).single();
    var movId = (pRow.data && pRow.data.movimento_foglio_id) || null;
    var del = await sb.from('pagamenti_fornitori').delete().eq('id', pagId);
    if (del.error) throw del.error;
    if (movId) {
      await sb.from('foglio_giornale_riconciliazioni').delete().eq('movimento_id', movId);
      await sb.from('foglio_giornale_movimenti').delete().eq('id', movId);
    }
    var up = await sb.from('ordini').update({ pagato_fornitore: false }).eq('fattura_ricevuta_id', fattId);
    if (up.error) throw up.error;
    pfDebitoInvalida();
    if (typeof _auditLog === 'function') _auditLog('annullo_pagamento', 'pagamenti_fornitori', _ecfSel.nome + ' — pagamento annullato su fattura ' + fattId);
    toast('✓ Pagamento annullato: ordini di nuovo da pagare');
    chiudiModalePermessi();
    await _ecfCarica(); _ecfRender();
    if (typeof _rfRenderTab === 'function' && document.getElementById('rf-body')) _rfRenderTab();
  } catch (e) { toast('Errore: ' + ((e && e.message) || e)); }
}

async function ecfAnnullaFlag(ordineId) {
  if (!confirm('Riportare quest\'ordine a DA PAGARE?')) return;
  try {
    var up = await sb.from('ordini').update({ pagato_fornitore: false }).eq('id', ordineId);
    if (up.error) throw up.error;
    pfDebitoInvalida();
    if (typeof _auditLog === 'function') _auditLog('annullo_flag_pagato', 'ordini', _ecfSel.nome + ' — ordine ' + ordineId + ' riportato a da pagare');
    toast('✓ Ordine di nuovo DA PAGARE');
    chiudiModalePermessi();
    await _ecfCarica(); _ecfRender();
    if (typeof _rfRenderTab === 'function' && document.getElementById('rf-body')) _rfRenderTab();
  } catch (e) { toast('Errore: ' + ((e && e.message) || e)); }
}

// OVERRIDE QUADRATURA — popup: differenza dichiarato − Σ ordini, per mese
function ecfApriOverride() {
  var anno = new Date().getFullYear();
  var mesi = {};   // 'YYYY-MM' -> { n, ordini, dichiarato }
  _ecfFatture.forEach(function (f) {
    if (!(Number(f.importo_dichiarato) > 0) || String(f.data || '').slice(0, 4) !== String(anno)) return;
    var so = (f.ordini || []).reduce(function (t, o) { return t + Number(o.totale || 0); }, 0);
    var d = Math.round((Number(f.importo_dichiarato) - so) * 100) / 100;
    if (Math.abs(d) < 0.01) return;
    var m = String(f.data).slice(0, 7);
    if (!mesi[m]) mesi[m] = { n: 0, ordini: 0, dich: 0 };
    mesi[m].n++; mesi[m].ordini += so; mesi[m].dich += Number(f.importo_dichiarato);
  });
  var chiavi = Object.keys(mesi).sort();
  var nomiMese = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
  var th = 'padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;background:var(--bg)';
  var totD = 0;
  var righe = chiavi.map(function (k) {
    var m = mesi[k];
    var diff = Math.round((m.dich - m.ordini) * 100) / 100;
    totD += diff;
    return '<tr>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border);font-weight:600">' + nomiMese[Number(k.slice(5, 7)) - 1] + ' ' + k.slice(0, 4) + '</td>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border);text-align:right;font-family:var(--font-mono)">' + m.n + '</td>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border);text-align:right;font-family:var(--font-mono)">' + fmtE(m.ordini) + '</td>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border);text-align:right;font-family:var(--font-mono)">' + fmtE(m.dich) + '</td>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border);text-align:right;font-family:var(--font-mono);font-weight:700;color:' + (diff > 0 ? '#A32D2D' : '#3B6D11') + '">' + (diff > 0 ? '+' : '') + fmtE(diff) + '</td></tr>';
  }).join('');
  totD = Math.round(totD * 100) / 100;
  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">Override quadratura ' + anno + ' — ' + esc(_ecfSel.nome) + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">differenza tra importo dichiarato in fattura e somma degli ordini agganciati</div>'
    + (righe
        ? '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'
          + '<th style="' + th + ';text-align:left">Mese</th><th style="' + th + ';text-align:right">Fatture</th>'
          + '<th style="' + th + ';text-align:right">Σ ordini</th><th style="' + th + ';text-align:right">Dichiarato</th>'
          + '<th style="' + th + ';text-align:right">Δ</th></tr></thead><tbody>' + righe + '</tbody>'
          + '<tfoot><tr><td colspan="4" style="padding:11px 8px;border-top:2px solid var(--accent);font-weight:700">Totale anno</td>'
          + '<td style="padding:11px 8px;border-top:2px solid var(--accent);text-align:right;font-family:var(--font-mono);font-weight:700;color:' + (totD > 0 ? '#A32D2D' : '#3B6D11') + '">' + (totD > 0 ? '+' : '') + fmtE(totD) + '</td></tr></tfoot></table></div>'
        : '<div style="color:var(--text-muted);font-size:12.5px;padding:8px 0">Nessuno scarto: tutte le fatture dell\'anno quadrano con gli ordini.</div>');
  apriModal(h);
}

// La fattura pagata prima del documento riceve il numero dopo: ✎ nella riga
async function ecfNumeraFattura(fatturaId) {
  var f = _ecfFatture.filter(function (x) { return x.id === fatturaId; })[0];
  if (!f) return;
  var n = prompt('Numero fattura — ' + _ecfSel.nome + ' · ' + (f.data ? _pfIsoToIt(f.data) : '—') + ' · ' + fmtE(f.totale), f.numero || '');
  if (n === null) return;
  n = String(n).trim();
  if (!n) { toast('Numero non inserito'); return; }
  try {
    // NUMERO GIA' USATO (27/07): quel numero appartiene gia a un'altra fattura
    // dello stesso fornitore. Non si duplica: si spostano gli ordini di QUESTO
    // contenitore su quella fattura e il contenitore vuoto si elimina.
    if (typeof pfFatturaConNumero === 'function') {
      var esistente = await pfFatturaConNumero(f.fornitore_id || null, _ecfSel.nome, n);
      if (esistente && esistente.id !== fatturaId) {
        var idsMove = (f.ordini || []).map(function (o) { return o.id; });
        var okM = await pfChiediAggancioFattura(esistente, idsMove.length, fmtE);
        if (!okM) { toast('Operazione annullata'); return; }
        if (idsMove.length) await pfAgganciaOrdiniAFattura(esistente.id, idsMove);
        // il contenitore resta senza ordini: via, altrimenti sporca gli elenchi
        var pagRes = await sb.from('pagamenti_fornitori').select('id').eq('fattura_ricevuta_id', fatturaId);
        if ((pagRes.data || []).length) {
          await sb.from('pagamenti_fornitori').update({ fattura_ricevuta_id: esistente.id }).eq('fattura_ricevuta_id', fatturaId);
        }
        await sb.from('fatture_ricevute').delete().eq('id', fatturaId);
        pfDebitoInvalida();
        if (typeof _auditLog === 'function') _auditLog('fusione_fattura', 'fatture_ricevute', _ecfSel.nome + ' · ' + idsMove.length + ' ordini spostati sulla fattura ' + n);
        toast('✓ Uniti alla fattura ' + n + ': ' + idsMove.length + (idsMove.length === 1 ? ' ordine' : ' ordini'));
        await _ecfCarica();
        _ecfRender();
        if (typeof _rfRenderTab === 'function' && document.getElementById('rf-body')) _rfRenderTab();
        return;
      }
    }

    var up = await sb.from('fatture_ricevute').update({ numero_fattura: n }).eq('id', fatturaId);
    if (up.error) throw up.error;
    pfDebitoInvalida();
    if (typeof _auditLog === 'function') _auditLog('fattura_fornitore', 'fatture_ricevute', _ecfSel.nome + ' numerata ' + n);
    toast('✓ Fattura numerata: ' + n);
    await _ecfCarica();
    _ecfRender();
    if (typeof _rfRenderTab === 'function' && document.getElementById('rf-body')) _rfRenderTab();
  } catch (e) {
    var m = (e && e.message) ? e.message : String(e);
    if (m.indexOf('duplicate') >= 0 || m.indexOf('unique') >= 0) m = 'Numero già usato: ricarica la pagina e riprova.';
    toast('Errore: ' + m);
  }
}

// Tasto (i) — ordini che compongono la fattura
// ═══════════════════════════════════════════════════════════════════════════
// DETTAGLI DELLA SELEZIONE (30/07) — stessa impaginazione della stampa
// "ordini del giorno", ma raggruppata per GIORNO e, dentro il giorno, per
// FATTURA: la testata porta la data e il numero in grassetto ben visibile,
// oppure "SENZA FATTURA" in ambra quando gli ordini non sono ancora
// documentati. Vale solo per il singolo fornitore.
// ═══════════════════════════════════════════════════════════════════════════
function ecfStampaSelezione() {
  var sel = (_ecfOrdini || []).filter(function (o) { return _ecfSelezione[o.id]; });
  if (!sel.length) { toast('Nessun ordine selezionato'); return; }

  sel.sort(function (a, b) {
    if (a.data !== b.data) return a.data < b.data ? -1 : 1;
    return String(a.numeroFattura || '') < String(b.numeroFattura || '') ? -1 : 1;
  });

  // gruppi: un blocco per (giorno + fattura)
  var gruppi = [], chiaveCorr = null;
  sel.forEach(function (o) {
    var k = o.data + '|' + (o.fatturaId || 'nessuna');
    if (k !== chiaveCorr) {
      gruppi.push({ data: o.data, numero: o.numeroFattura || null, fatturaId: o.fatturaId || null,
                    scadenza: o.scadenza || null, righe: [] });
      chiaveCorr = k;
    }
    gruppi[gruppi.length - 1].righe.push(o);
  });

  var totLitri = sel.reduce(function (a, o) { return a + Number(o.litri || 0); }, 0);
  var totImp = sel.reduce(function (a, o) { return a + Number(o.imponibile || 0); }, 0);
  var totIva = sel.reduce(function (a, o) { return a + Number(o.totale || 0); }, 0);
  var daPag = sel.filter(function (o) { return !o.pagato && !o.fattSaldata; })
                 .reduce(function (a, o) { return a + Number(o.totale || 0); }, 0);
  var giorniDiversi = {};
  sel.forEach(function (o) { giorniDiversi[o.data] = 1; });

  var w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra di stampa: consenti i pop-up'); return; }

  var H = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dettaglio selezione — ' + esc(_ecfSel.nome) + '</title><style>'
    + 'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;margin:24px;font-size:12px}'
    + '.head{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #0C447C;padding-bottom:10px;margin-bottom:14px}'
    + '.az{font-size:17px;font-weight:700;color:#0C447C}'
    + '.pic{font-size:9px;color:#666}'
    + '.kpis{display:flex;gap:8px;margin-bottom:16px}'
    + '.k{flex:1;border-radius:5px;padding:7px 9px}'
    + '.k .et{font-size:8px;text-transform:uppercase;letter-spacing:.4px}'
    + '.k .v{font-size:19px;font-weight:700;font-family:Courier New,monospace}'
    + '.gh{display:flex;align-items:center;gap:9px;padding-bottom:5px;margin-bottom:7px}'
    + '.gd{font-size:14px;font-weight:700}'
    + '.gn{font-size:11px;font-weight:700;font-family:Courier New,monospace;padding:3px 10px;border-radius:5px}'
    + 'table{width:100%;border-collapse:collapse;font-size:10.5px;margin-bottom:16px}'
    + 'th{text-align:left;padding:5px 6px;font-size:9px;text-transform:uppercase;letter-spacing:.4px;color:#0C447C;background:#0C447C10}'
    + 'td{padding:4px 6px;border-bottom:1px solid #eee}'
    + '.r{text-align:right;font-family:Courier New,monospace}'
    + 'th.r{text-align:right}'
    + '.tot td{font-weight:700;border-bottom:none}'
    + '.firme{display:flex;gap:40px;margin-top:34px;font-size:10px;color:#555}'
    + '.firme>div{flex:1;border-top:1px solid #999;padding-top:4px}'
    + '@media print{body{margin:12mm}}'
    + '</style></head><body>';

  H += '<div class="head"><div><div class="az">PHOENIX FUEL S.R.L.</div><div class="pic">Vibo Valentia — Calabria</div></div>'
    + '<div style="text-align:right"><div style="font-size:13px;font-weight:700">Dettaglio selezione — ' + esc(_ecfSel.nome) + '</div>'
    + '<div class="pic">' + sel.length + ' ordini · ' + Object.keys(giorniDiversi).length + ' giorni · dilazione ' + _ecfSel.gg + ' gg</div>'
    + '<div class="pic">Stampato: ' + new Date().toLocaleDateString('it-IT') + ' ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }) + '</div></div></div>';

  H += '<div class="kpis">'
    + '<div class="k" style="background:#FDF3D0;border:1px solid #D4A017"><div class="et" style="color:#633806">Litri totali</div><div class="v">' + fmtL(totLitri) + '</div></div>'
    + '<div class="k" style="background:#EAF3DE;border:1px solid #639922"><div class="et" style="color:#27500A">Imponibile</div><div class="v">' + fmtE(totImp) + '</div></div>'
    + '<div class="k" style="background:#EAF3DE;border:1px solid #639922"><div class="et" style="color:#27500A">Totale IVA incl.</div><div class="v">' + fmtE(totIva) + '</div></div>'
    + '<div class="k" style="background:#FCEBEB;border:1px solid #E24B4A"><div class="et" style="color:#791F1F">Da pagare</div><div class="v">' + fmtE(daPag) + '</div></div>'
    + '</div>';

  gruppi.forEach(function (g) {
    var col = g.numero ? '#0C447C' : '#8A4F06';
    var gl = g.righe.reduce(function (a, o) { return a + Number(o.litri || 0); }, 0);
    var gi = g.righe.reduce(function (a, o) { return a + Number(o.imponibile || 0); }, 0);
    H += '<div class="gh" style="border-bottom:1.5px solid ' + col + '">'
      + '<div class="gd" style="color:' + col + '">' + _pfIsoToIt(g.data) + '</div>'
      + (g.numero
          ? '<div class="gn" style="background:#E6F1FB;color:#0C447C">FATTURA ' + esc(g.numero) + '</div>'
          : '<div class="gn" style="background:#FFF1DC;color:#8A4F06;border:1px solid #F5921E">SENZA FATTURA</div>')
      + (g.scadenza ? '<div style="font-size:10px;color:#666">scadenza ' + _pfIsoToIt(g.scadenza) + '</div>' : '')
      + '<div style="margin-left:auto;font-size:11px;color:#666">' + g.righe.length + (g.righe.length === 1 ? ' ordine · ' : ' ordini · ')
      + '<strong style="font-family:Courier New,monospace">' + fmtL(gl) + '</strong></div></div>';

    H += '<table><thead><tr><th>Cliente</th><th>Sede di scarico</th><th>Prodotto</th>'
      + '<th class="r">Litri</th><th class="r">€/L</th><th class="r">Imponibile</th></tr></thead><tbody>';
    g.righe.forEach(function (o) {
      H += '<tr><td>' + esc(o.cliente || '—') + '</td>'
        + '<td>' + esc(o.sede_scarico_nome || o.destinazione || '—') + '</td>'
        + '<td>' + esc(o.prodotto || '') + '</td>'
        + '<td class="r">' + fmtL(o.litri) + '</td>'
        + '<td class="r">' + Number(o.costoL || 0).toFixed(5).replace('.', ',') + '</td>'
        + '<td class="r">' + fmtE(o.imponibile) + '</td></tr>';
    });
    H += '<tr class="tot"><td colspan="3" style="border-top:1.5px solid ' + col + '">Totale ' + _pfIsoToIt(g.data) + '</td>'
      + '<td class="r" style="border-top:1.5px solid ' + col + '">' + fmtL(gl) + '</td>'
      + '<td style="border-top:1.5px solid ' + col + '"></td>'
      + '<td class="r" style="border-top:1.5px solid ' + col + '">' + fmtE(gi) + '</td></tr>';
    H += '</tbody></table>';
  });

  H += '<div class="firme"><div>Verificato da</div><div>Note</div></div></body></html>';
  w.document.write(H);
  w.document.close();
  setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 400);
}

// ═══════════════════════════════════════════════════════════════════════════
// STAMPA DELLA FATTURA (30/07) — riepilogo di come quella fattura e' COMPOSTA
// secondo Phoenix: intestazione, dati del fornitore, numero e data, l'elenco
// delle consegne con DDT/cliente/sede di scarico e i totali imponibile, IVA e
// documento. Non e' la riproduzione della fattura del fornitore, che e' un suo
// documento: serve per controllare e per contestare.
// ═══════════════════════════════════════════════════════════════════════════
function ecfStampaFattura(fatturaId) {
      + (f.ordini && f.ordini.length ? '<button onclick="ecfContestaFattura(\'' + f.id + '\')" style="padding:8px 14px;font-size:12px;border:0.5px solid #E4B7B7;border-radius:8px;background:var(--bg);color:#A32D2D;font-weight:600;cursor:pointer">⚖ Contesta prezzi</button>' : '')
  var f = _ecfFatture.filter(function (x) { return x.id === fatturaId; })[0];
  if (!f) return;
  var iva = 0, imp = 0;
  (f.ordini || []).forEach(function (o) {
    imp += Number(o.imponibile || 0);
    iva += Number(o.totale || 0) - Number(o.imponibile || 0);
  });

  var righe = (f.ordini || []).map(function (o) {
    return '<tr>'
      + '<td>' + _pfIsoToIt(o.data) + '</td>'
      + '<td>' + esc(o.prodotto || '') + '</td>'
      + '<td class="r">' + fmtL(o.litri) + '</td>'
      + '<td class="r">' + Number(o.costoL || 0).toFixed(5).replace('.', ',') + '</td>'
      + '<td class="r">' + fmtE(o.imponibile) + '</td>'
      + '<td>' + esc(o.cliente || '—') + '</td>'
      + '<td>' + esc(o.sede_scarico_nome || o.destinazione || '—') + '</td>'
      + '</tr>';
  }).join('');

  var w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra di stampa: consenti i pop-up'); return; }
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Fattura '
    + esc(f.numero || '') + ' — ' + esc(_ecfSel.nome) + '</title><style>'
    + 'body{font-family:-apple-system,Segoe UI,Roboto,sans-serif;color:#222;margin:26px;font-size:12px}'
    + 'h1{font-size:17px;margin:0 0 2px}'
    + '.sub{color:#666;font-size:11.5px;margin-bottom:16px}'
    + '.box{display:flex;gap:14px;margin-bottom:16px}'
    + '.box>div{flex:1;border:1px solid #ccc;border-radius:6px;padding:9px 11px}'
    + '.et{font-size:9.5px;text-transform:uppercase;letter-spacing:.5px;color:#777;margin-bottom:3px}'
    + 'table{width:100%;border-collapse:collapse;font-size:11px}'
    + 'th{background:#f2f2ee;text-align:left;padding:6px 7px;border-bottom:1.5px solid #999;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;color:#555}'
    + 'td{padding:6px 7px;border-bottom:0.5px solid #e2e2dc}'
    + '.r{text-align:right;font-variant-numeric:tabular-nums}'
    + 'th.r{text-align:right}'
    + 'tfoot td{border-top:1.5px solid #999;font-weight:700;border-bottom:none;padding-top:8px}'
    + '.firme{display:flex;gap:40px;margin-top:44px;font-size:11px;color:#555}'
    + '.firme>div{flex:1;border-top:1px solid #999;padding-top:5px}'
    + '@media print{body{margin:12mm}}'
    + '</style></head><body>');
  w.document.write('<h1>PHOENIX FUEL S.R.L.</h1>'
    + '<div class="sub">Zona Industriale · 89900 Vibo Valentia (VV) · P.IVA 02744150802</div>'
    + '<div class="box">'
      + '<div><div class="et">Fornitore</div><strong>' + esc(_ecfSel.nome) + '</strong>'
        + '<div style="color:#666;margin-top:2px">dilazione ' + _ecfSel.gg + ' giorni</div></div>'
      + '<div><div class="et">Documento</div><strong>' + esc(f.numero || 'senza numero') + '</strong>'
        + '<div style="color:#666;margin-top:2px">del ' + (f.data ? _pfIsoToIt(f.data) : '—')
        + (f.dataScadenza ? ' · scadenza ' + _pfIsoToIt(f.dataScadenza) : '') + '</div></div>'
      + '<div><div class="et">Consegne che la compongono</div><strong>' + (f.ordini || []).length + '</strong>'
        + '<div style="color:#666;margin-top:2px">stampato il ' + _pfIsoToIt(new Date().toISOString().slice(0, 10)) + '</div></div>'
    + '</div>');
  w.document.write('<table><thead><tr>'
    + '<th>Data</th><th>Prodotto</th><th class="r">Litri</th><th class="r">€/L</th>'
    + '<th class="r">Imponibile</th><th>Cliente</th><th>Sede di scarico</th></tr></thead>'
    + '<tbody>' + righe + '</tbody>'
    + '<tfoot>'
      + '<tr><td colspan="4">Totale imponibile</td><td class="r">' + fmtE(imp) + '</td><td colspan="2"></td></tr>'
      + '<tr><td colspan="4">IVA</td><td class="r">' + fmtE(iva) + '</td><td colspan="2"></td></tr>'
      + '<tr><td colspan="4">Totale documento</td><td class="r">' + fmtE(f.totale) + '</td><td colspan="2"></td></tr>'
    + '</tfoot></table>');
  if (f.pagato > 0) {
    w.document.write('<div style="margin-top:12px;font-size:11.5px">Pagato ' + fmtE(f.pagato)
      + (f.saldata ? ' — saldata' : ' · residuo ' + fmtE(f.residuo)) + '</div>');
  }
  w.document.write('<div class="firme"><div>Verificato da</div><div>Note</div></div>');
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(function () { try { w.focus(); w.print(); } catch (e) {} }, 400);
}

// Apre e chiude la riga di dettaglio dell'ordine dentro il modale fattura.
function ecfInfoOrdine(i) {
  var tr = document.getElementById('ecf-ord-' + i);
  if (tr) tr.style.display = (tr.style.display === 'none' || !tr.style.display) ? 'table-row' : 'none';
}

function ecfInfoFattura(fatturaId) {
  var f = _ecfFatture.filter(function (x) { return x.id === fatturaId; })[0];
  if (!f) return;
  var th = 'padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;background:var(--bg)';
  var righe = f.ordini.map(function (o, i) {
    var bt = 'border-top:0.5px solid var(--border)';
    return '<tr><td style="padding:9px 4px;' + bt + ';text-align:center">'
        + '<span onclick="ecfInfoOrdine(' + i + ')" title="Dettagli dell\'ordine" style="cursor:pointer;display:inline-block;width:19px;height:19px;line-height:18px;border-radius:50%;background:#E6F1FB;color:#0C447C;font-size:11px;font-weight:700;font-family:Georgia,serif;font-style:italic">i</span></td>'
      + '<td style="padding:9px 8px;' + bt + ';font-family:var(--font-mono)">' + _pfIsoToIt(o.data) + '</td>'
      + '<td style="padding:9px 8px;' + bt + '">' + esc(o.prodotto || '—') + '</td>'
      + '<td style="padding:9px 8px;' + bt + ';text-align:right;font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>'
      + '<td style="padding:9px 8px;' + bt + ';text-align:right;font-family:var(--font-mono)">' + o.costoL.toFixed(4).replace('.', ',') + '</td>'
      + '<td style="padding:9px 8px;' + bt + ';text-align:right;font-family:var(--font-mono);font-weight:600">' + fmtE(o.imponibile) + '</td></tr>'
      // riga di dettaglio, chiusa: si apre col pulsante info
      + '<tr id="ecf-ord-' + i + '" style="display:none;background:#FAF8F2"><td colspan="6" style="padding:8px 12px;font-size:12px;color:var(--text-secondary)">'
        + '<span style="color:var(--text-muted)">Data</span> <strong>' + _pfIsoToIt(o.data) + '</strong>'
        + ' · <span style="color:var(--text-muted)">Litri</span> <strong style="font-family:var(--font-mono)">' + fmtL(o.litri) + '</strong>'
        + ' · <span style="color:var(--text-muted)">Cliente</span> <strong>' + esc(o.cliente || '—') + '</strong>'
        + ' · <span style="color:var(--text-muted)">Sede di scarico</span> <strong>' + esc(o.sede_scarico_nome || o.destinazione || '—') + '</strong>'
        + '</td></tr>';
  }).join('');
  // ✎ accanto al numero (30/07): la stessa finestrella che lo inserisce sa
  // anche modificarlo — si apre precompilata e controlla i duplicati.
  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">Fattura ' + esc(f.numero || '—')
    + ' <span onclick="ecfNumeraFattura(\'' + f.id + '\')" title="Modifica il numero" style="cursor:pointer;font-size:13px;color:#8A4F06;background:#FFF1DC;border:0.5px solid #F5921E;border-radius:6px;padding:1px 7px;margin-left:4px;font-weight:600">✎</span>'
    + ' — ' + esc(_ecfSel.nome) + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + (f.data ? _pfIsoToIt(f.data) : '—') + ' · ' + f.ordini.length + ' ordini · ' + fmtE(f.totale) + '</div>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'
    + '<th style="' + th + ';width:28px"></th><th style="' + th + ';text-align:left">Data</th><th style="' + th + ';text-align:left">Prodotto</th>'
    + '<th style="' + th + ';text-align:right">Litri</th><th style="' + th + ';text-align:right">€/L</th>'
    + '<th style="' + th + ';text-align:right">Imponibile</th></tr></thead><tbody>' + righe + '</tbody>'
    + '<tfoot><tr><td colspan="5" style="padding:11px 8px;border-top:2px solid var(--accent);font-weight:700">Totale fattura</td>'
    + '<td style="padding:11px 8px;border-top:2px solid var(--accent);text-align:right;font-family:var(--font-mono);font-weight:700">' + fmtE(f.totale) + '</td></tr></tfoot></table></div>'
    + (f.pagato > 0 ? '<div style="font-size:12px;color:#3B6D11;margin-top:10px">Pagato ' + fmtE(f.pagato) + (f.saldata ? ' — saldata' : ' · residuo ' + fmtE(f.residuo)) + '</div>' : '')
    + '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:16px">'
      + (!f.numero ? '<button onclick="ecfNumeraFattura(\'' + f.id + '\')" style="padding:8px 14px;font-size:12px;border:0.5px solid #F5921E;border-radius:8px;background:#FFF1DC;color:#8A4F06;font-weight:600;cursor:pointer">✎ Inserisci numero</button>' : '')
      + '<button onclick="ecfStampaFattura(\'' + f.id + '\')" style="padding:8px 14px;font-size:12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer">🖨 Stampa</button>'
      + (!f.saldata ? '<button onclick="ecfPagaFattura(\'' + f.id + '\')" style="padding:8px 16px;font-size:12px;border:none;border-radius:8px;background:#0C447C;color:#fff;font-weight:600;cursor:pointer">Registra pagamento</button>' : '')
    + '</div>';
  apriModal(h);
}

// ══════════════════════════════════════════════════════════════════
// FIDO FORNITORI IN DASHBOARD (22/07/2026)
// Stessi identici dati dell'Estratto conto fornitore: un solo calcolo,
// così dashboard, panoramica e scheda del singolo fornitore non divergono.
// ══════════════════════════════════════════════════════════════════
async function caricaFidoFornitoriDashboard() {
  var el = document.getElementById('dash-fido-fornitori');
  if (!el) return;
  try {
    if (!_ecfPop) _ecfFornitori = (await pfDebitoDati()).fornitori;
    var cards = await _ecfCalcolaFornitori();
    var conFido = cards.filter(function (c) { return c.fido > 0; });
    if (!conFido.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Nessun fornitore con fido assegnato.</div>'; return; }
    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">'
      + conFido.map(function (c) {
          var pct = Math.min(100, (c.esp / c.fido) * 100);
          var bordo = pct >= 85 ? '#C0392B' : pct >= 60 ? '#F5921E' : '#639922';
          return '<div onclick="vaiEstrattoFornitore(\'' + c.id + '\')" style="cursor:pointer;border:1px solid ' + bordo + ';border-left:5px solid ' + bordo + ';border-radius:11px;padding:12px 14px;background:var(--bg)">'
            + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px">'
              + '<span style="font-size:14px;font-weight:700">' + esc(c.nome) + '</span>'
              + '<span style="font-size:11px;color:var(--text-muted)">' + c.gg + ' gg</span></div>'
            + _ecfBarra(c.esp, c.fido, false, c.espDaFatturare)
            + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:8px">'
              + '<span style="color:var(--text-muted)">Acquistato ' + new Date().getFullYear() + '</span>'
              + '<span style="font-family:var(--font-mono);font-weight:700">' + fmtE(c.acq) + '</span></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:4px">'
              + '<span style="color:var(--text-muted)">Fido disponibile</span>'
              + '<span style="font-family:var(--font-mono);font-weight:700;color:' + ((c.fido - c.esp) < 0 ? '#A32D2D' : '#3B6D11') + '">' + fmtE(c.fido - c.esp) + '</span></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px">'
              + '<span style="color:var(--text-muted)">Prossima scadenza</span>'
              + (c.prossima
                  ? '<span style="font-family:var(--font-mono);font-weight:700;color:' + (c.scadute ? '#A32D2D' : 'var(--text)') + '">'
                      + _pfIsoToIt(c.prossima) + (c.prossimaImporto ? ' · ' + fmtE(c.prossimaImporto) : '') + '</span>'
                  : '<span style="color:var(--text-muted)">—</span>')
            + '</div>'
            + (c.scadute ? '<div style="font-size:11px;color:#A32D2D;font-weight:700;text-align:right;margin-top:2px">' + c.scadute + ' scaduti</div>' : '')
            + '</div>';
        }).join('') + '</div>';
  } catch (e) {
    console.warn('fido fornitori dashboard', e);
    el.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Dati non disponibili.</div>';
  }
}

// Dalla dashboard: apre Fornitori → Estratto conto sul fornitore scelto
function vaiEstrattoFornitore(id) {
  var nav = document.querySelector('.nav-item[onclick*="fornitori"]');
  if (typeof setSection === 'function') { try { setSection('fornitori', nav); } catch (e) {} }
  setTimeout(function () {
    var tab = document.querySelector('.forn-tab[data-tab="forn-estratto"]');
    if (tab) switchFornitoriTab(tab);
    setTimeout(function () { ecfApriFornitore(id); }, 120);
  }, 120);
}

// ══════════════════════════════════════════════════════════════════
// REGOLA UNICA SCADENZA FORNITORE (22/07/2026) — matrice per TUTTO
// Deve essere usata ovunque (estratto conto, calendario, foglio giornale):
//   1. i giorni sono SEMPRE quelli del FORNITORE, mai quelli salvati sull'ordine
//      (non esistono deroghe per singolo ordine);
//   2. UNICA eccezione: se l'ordine è su una fattura cumulativa con una data di
//      scadenza propria, comanda quella (il fornitore ha unificato più giorni);
//   3. le scadenze di sabato e domenica slittano al lunedì (giorno bancabile).
// ══════════════════════════════════════════════════════════════════
// pfScadenzaFornitore è definita nella QUERY MADRE pf-debito-fornitori.js

// ══════════════════════════════════════════════════════════════════
// TIMELINE SCADENZE (22/07/2026) — variante compatta a barra unica.
// Un pallino per data di scadenza: data sopra, importo sotto.
// Le etichette vicine vengono disposte su livelli sfalsati, così non
// si accavallano mai; sotto: primo pagamento, ultimo e giorno più alto.
// ══════════════════════════════════════════════════════════════════
function _ecfScadenzeAperte() {
  var perData = {};
  _ecfOrdini.forEach(function (o) {
    if (o.pagato) return;
    var f = o.fatturaId ? _ecfFatture.filter(function (x) { return x.id === o.fatturaId; })[0] : null;
    if (f && f.saldata) return;
    var d = o.fatturaId && f ? _ecfAddGiorni(o.data, _ecfSel.gg, f.scadenza) : o.scadenza;
    if (!d) return;
    if (!perData[d]) perData[d] = { data: d, importo: 0, n: 0 };
    perData[d].importo += o.totale;
    perData[d].n++;
  });
  return Object.keys(perData).sort().map(function (k) { return perData[k]; });
}

function _ecfTimelineHtml() {
  var sc = _ecfScadenzeAperte();
  if (!sc.length) return '';
  var oggi = new Date().toISOString().slice(0, 10);
  var giorni = function (a, b) { return Math.round((new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00')) / 86400000); };
  var minD = sc[0].data < oggi ? sc[0].data : oggi;
  var maxD = sc[sc.length - 1].data > oggi ? sc[sc.length - 1].data : oggi;
  var span = Math.max(1, giorni(minD, maxD));
  var pos = function (d) { return Math.min(100, Math.max(0, (giorni(minD, d) / span) * 100)); };
  var pOggi = pos(oggi);

  // livelli sfalsati: se due etichette distano meno di 11% le alterno
  var liv = [], ultimo = -99;
  sc.forEach(function (s, i) {
    var p = pos(s.data);
    if (p - ultimo < 11) liv[i] = (liv[i - 1] === 0 ? 1 : 0);
    else liv[i] = 0;
    ultimo = p;
  });

  var maxImp = sc.reduce(function (m, s) { return s.importo > m.importo ? s : m; }, sc[0]);
  var entro7 = new Date(); entro7.setDate(entro7.getDate() + 7);
  var entro7ISO = entro7.toISOString().slice(0, 10);

  // Troppe scadenze o troppo ravvicinate → niente etichette: solo pallini,
  // i valori compaiono passando sopra col mouse (altrimenti non si capisce nulla)
  var minGap = 999;
  for (var k = 1; k < sc.length; k++) minGap = Math.min(minGap, pos(sc[k].data) - pos(sc[k - 1].data));
  var etichette = !(sc.length > 8 || minGap < 6);

  var pallini = sc.map(function (s, i) {
    var scaduta = s.data < oggi, vicina = !scaduta && s.data <= entro7ISO;
    var c = scaduta ? '#E5342F' : vicina ? '#F5921E' : '#4CAF2E';
    var colTxt = scaduta ? '#A32D2D' : (s === maxImp ? '#0C447C' : 'var(--text)');
    var dy = liv[i] * 20;
    var tip = _pfIsoToIt(s.data) + ' · ' + fmtE(s.importo) + ' · ' + s.n + (s.n === 1 ? ' ordine' : ' ordini');
    var h = '<div style="position:absolute;left:' + pos(s.data) + '%;top:48px;width:' + (etichette ? 14 : 16) + 'px;margin-left:-' + (etichette ? 7 : 8) + 'px;z-index:4;cursor:help" title="' + esc(tip) + '">'
      + '<div style="width:' + (etichette ? 14 : 16) + 'px;height:' + (etichette ? 14 : 16) + 'px;border-radius:50%;background:' + c + ';border:3px solid var(--bg-card,#fff);box-shadow:0 1px 3px rgba(0,0,0,.25)"></div>';
    if (etichette) {
      h += '<div style="position:absolute;bottom:' + (26 + dy) + 'px;left:50%;transform:translateX(-50%);font-family:var(--font-mono);font-size:10.5px;font-weight:700;white-space:nowrap;color:' + colTxt + '">' + _pfIsoToIt(s.data) + '</div>'
        + '<div style="position:absolute;top:' + (20 + dy) + 'px;left:50%;transform:translateX(-50%);font-family:var(--font-mono);font-size:11.5px;font-weight:700;white-space:nowrap;color:' + colTxt + '">' + fmtE(s.importo) + '</div>';
    }
    return h + '</div>';
  }).join('');

  var box = function (lab, data, imp, tipo) {
    var bg = tipo === 'first' ? '#FCEBEB' : tipo === 'max' ? '#E6F1FB' : 'var(--bg)';
    var bd = tipo === 'first' ? '#C0392B' : tipo === 'max' ? '#0C447C' : 'var(--border)';
    var cv = tipo === 'first' ? '#A32D2D' : tipo === 'max' ? '#0C447C' : 'var(--text)';
    return '<div style="flex:1;min-width:190px;border:1px solid ' + bd + ';border-radius:11px;padding:12px 14px;background:' + bg + '">'
      + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.8px;font-weight:600;color:' + cv + ';opacity:.85">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;margin-top:5px;color:' + cv + '">' + _pfIsoToIt(data) + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:19px;font-weight:700;color:' + cv + '">' + fmtE(imp) + '</div></div>';
  };

  var primo = sc[0], ultimoP = sc[sc.length - 1];
  var pctScad = pos(oggi);
  return '<div class="card" style="margin-bottom:18px">'
    + '<div class="card-title">Scadenze aperte</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:' + (etichette ? 26 : 10) + 'px">' + sc.length + ' pagamenti dal ' + _pfIsoToIt(primo.data) + ' al ' + _pfIsoToIt(ultimoP.data) + ' · dilazione ' + _ecfSel.gg + ' giorni'
      + (etichette ? '' : ' · <strong>passa sui pallini per data e importo</strong>') + '</div>'
    + '<div style="position:relative;height:' + (etichette ? (118 + Math.max.apply(null, liv) * 20) : 88) + 'px;margin:0 14px">'
      + '<div style="position:absolute;left:0;right:0;top:54px;height:14px;border-radius:7px;background:#EDEAE4;border:0.5px solid var(--border);overflow:hidden">'
        + (pctScad > 0 ? '<div style="position:absolute;left:0;width:' + pctScad + '%;height:100%;background:linear-gradient(90deg,#F0564F,#E5342F)"></div>' : '')
        + '<div style="position:absolute;left:' + pctScad + '%;right:0;height:100%;background:linear-gradient(90deg,#5DC33A,#4CAF2E)"></div>'
      + '</div>'
      + '<div style="position:absolute;left:' + pOggi + '%;top:40px;height:42px;width:2px;background:#111;z-index:5">'
        + '<b style="position:absolute;top:-15px;left:50%;transform:translateX(-50%);font-size:9px;background:#111;color:#fff;padding:1px 6px;border-radius:8px">oggi</b></div>'
      + pallini
    + '</div>'
    + '<div style="display:flex;gap:14px;flex-wrap:wrap;margin-top:18px">'
      + box('Primo pagamento', primo.data, primo.importo, 'first')
      + box('Ultimo pagamento', ultimoP.data, ultimoP.importo, '')
      + box('Giorno più alto', maxImp.data, maxImp.importo, 'max')
    + '</div></div>';
}

// ══════════════════════════════════════════════════════════════════
// ACQUISTI PER MESE (22/07/2026) — anno corrente, un colore per fornitore.
// Pulsante per passare da € a litri. Gli euro sono SEMPRE il totale
// IVA compresa, come il fido e l'esposizione.
// ══════════════════════════════════════════════════════════════════
const _ECF_MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];

function _ecfBtnAnno() {
  var ora = new Date().getFullYear();
  return [ora - 1, ora].map(function (a) {
    var on = _ecfAnnoGraf === a;
    return '<button onclick="ecfSetAnnoGraf(' + a + ')" style="font-size:12px;padding:6px 16px;border:0.5px solid '
      + (on ? '#185FA5' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#185FA5' : 'var(--bg)')
      + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (on ? '600' : '400') + '">' + a + '</button>';
  }).join('');
}
function ecfSetAnnoGraf(a) { _ecfAnnoGraf = Number(a); _ecfOverview(); }

function _ecfMesiHtml(cards) {
  var attivi = cards.filter(function (c) { return c.acq > 0; });
  if (!attivi.length) return '';
  var b = function (u, t) {
    var on = _ecfMeseUnit === u;
    return '<button onclick="ecfSetMeseUnit(\'' + u + '\')" style="font-size:12px;padding:6px 16px;border:0.5px solid ' + (on ? '#0C447C' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#0C447C' : 'var(--bg)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (on ? '600' : '400') + '">' + t + '</button>';
  };
  return '<div class="card" style="margin-top:18px">'
    + '<div class="card-title" style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">'
      + '<span>Acquisti per mese ' + _ecfAnnoGraf + '</span>'
      + '<div style="display:flex;gap:8px">' + b('euro', '€ IVA inc.') + b('litri', 'Litri') + '</div></div>'
    + '<div style="position:relative;width:100%;height:300px"><canvas id="ecf-mesi"></canvas></div></div>';
}

function ecfSetMeseUnit(u) {
  _ecfMeseUnit = u;
  var wrap = document.getElementById('ecf-mesi');
  if (!wrap) return;
  // ridisegna solo i pulsanti e il grafico, senza ricaricare i dati
  var card = wrap.closest('.card');
  if (card) {
    var btns = card.querySelectorAll('.card-title button');
    if (btns && btns.length === 2) {
      var set = function (el, on) {
        el.style.background = on ? '#0C447C' : 'var(--bg)';
        el.style.color = on ? '#fff' : 'var(--text)';
        el.style.borderColor = on ? '#0C447C' : 'var(--border)';
        el.style.fontWeight = on ? '600' : '400';
      };
      set(btns[0], u === 'euro'); set(btns[1], u === 'litri');
    }
  }
  _ecfDisegnaMesi();
}

var _ecfChartMesi = null;
function _ecfDisegnaMesi(cards) {
  var ctx = document.getElementById('ecf-mesi');
  if (!ctx || typeof Chart === 'undefined') return;
  var anno = _ecfAnnoGraf;
  var col = ['#185FA5', '#639922', '#F5921E', '#6B5FCC', '#E5342F', '#0FA3A3', '#B4B2A9'];

  // SOLO i fornitori dell'anagrafica (come la torta e le card). Phoenix siamo NOI,
  // non è un fornitore: leggendo il nome grezzo dell'ordine ci finiva dentro.
  var _ammessi = {};
  _ecfFornitori.forEach(function (f) { _ammessi[String(f.nome || '').toLowerCase().trim()] = true; });
  var nomi = {};
  _ecfOrdiniTutti.forEach(function (o) {
    if (String(o.data).slice(0, 4) !== String(anno)) return;
    var n = String(o.fornitore || '').trim(); if (!n) return;
    if (!_ammessi[n.toLowerCase()]) return;
    if (!nomi[n]) nomi[n] = { euro: new Array(12).fill(0), litri: new Array(12).fill(0), tot: 0 };
    var m = Number(String(o.data).slice(5, 7)) - 1; if (m < 0 || m > 11) return;
    var l = Number(o.litri || 0);
    var e = Number(o.costo_litro || 0) * l * (1 + Number(o.iva == null ? 22 : o.iva) / 100);
    nomi[n].euro[m] += e; nomi[n].litri[m] += l; nomi[n].tot += e;
  });
  var lista = Object.keys(nomi).map(function (n) { return { nome: n, d: nomi[n] }; })
    .sort(function (a, b) { return b.d.tot - a.d.tot; }).slice(0, 7);
  if (!lista.length) return;

  var isEuro = _ecfMeseUnit === 'euro';
  if (_ecfChartMesi) _ecfChartMesi.destroy();
  _ecfChartMesi = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: _ECF_MESI,
      datasets: lista.map(function (f, i) {
        return {
          label: f.nome,
          data: (isEuro ? f.d.euro : f.d.litri).map(function (v) { return Math.round(v); }),
          backgroundColor: col[i % col.length], borderRadius: 4, maxBarThickness: 22
        };
      })
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      scales: {
        x: { stacked: false, grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { stacked: false, beginAtZero: true, ticks: { font: { size: 11 }, callback: function (v) {
          return isEuro ? ('€' + Math.round(v / 1000) + 'k') : (Math.round(v / 1000) + 'k L');
        } } }
      },
      plugins: {
        legend: { position: 'bottom', labels: { boxWidth: 12, font: { size: 11 } } },
        tooltip: { callbacks: { label: function (c) {
          return c.dataset.label + ': ' + (isEuro ? fmtE(c.parsed.y) : (fmtL(c.parsed.y) + ' L'));
        } } }
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// TUTTI I FORNITORI (30/07) — la vista che oggi vive nello Scadenzario, qui
// dentro: scadenze di TUTTI i fornitori insieme, per pianificare la cassa.
// Stesso motore delle altre viste (spazio dei nomi 'tf'), stessa query madre.
// Una fattura riguarda un fornitore solo: il contesto del modale si ricava da
// cio che e' spuntato, come nello Scadenzario.
// ═══════════════════════════════════════════════════════════════════════════
var _ecfTuttiOn = false;
var _ecfTuttiMese = null;                       // null = tutto l'anno
var _ecfTuttiAnno = new Date().getFullYear();
var _ecfTuttiStato = 'da-pagare';               // 'da-pagare' | 'tutti'
var _ecfTuttiSel = {};                          // si muta in loco

function ecfApriTutti() { _ecfTuttiOn = true; _ecfSel = null; ecfTuttiRender(); }
function ecfChiudiTutti() { _ecfTuttiOn = false; _ecfOverview(); }
function ecfTuttiPeriodo(v) { _ecfTuttiMese = (v === '' ? null : parseInt(v, 10)); ecfTuttiRender(); }
function ecfTuttiAnno(v) { _ecfTuttiAnno = parseInt(v, 10); ecfTuttiRender(); }
function ecfTuttiStato(v) { _ecfTuttiStato = v; ecfTuttiRender(); }

// fornitore ricavato dalla selezione; null se vuota o se ne mescola piu di uno
function _ecfFornDaSel(ordini) {
  var nomi = [];
  (ordini || []).forEach(function (o) {
    if (!_ecfTuttiSel[o.id]) return;
    var n = String(o.fornitore || '').trim();
    if (n && nomi.indexOf(n) < 0) nomi.push(n);
  });
  if (nomi.length !== 1) {
    if (nomi.length > 1 && typeof toast === 'function') toast('Una fattura riguarda un fornitore solo: hai selezionato ' + nomi.length + ' fornitori');
    return null;
  }
  var f = (_ecfFornitori || []).filter(function (x) {
    return String(x.nome || '').toLowerCase().trim() === nomi[0].toLowerCase();
  })[0];
  return { id: f ? f.id : null, nome: nomi[0], gg: f ? (f.giorni_pagamento || 30) : 30, fido: f ? (f.fido_massimo || 0) : 0 };
}

async function ecfTuttiRender() {
  var body = document.getElementById('ecf-body');
  if (!body) return;
  body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:34px;font-size:12px">Caricamento…</div>';

  var d;
  try { d = await pfDebitoDati(true); }
  catch (e) { body.innerHTML = '<div style="color:#A32D2D;font-size:12.5px">Errore: ' + esc((e && e.message) || e) + '</div>'; return; }
  _ecfFornitori = d.fornitori;

  // ordini VIVI di tutti i fornitori (stesso perimetro del fido)
  var tutti = (d.ordini || []).filter(function (o) { return _ecfTuttiStato === 'tutti' || (!o.pagato && !o.fattSaldata); });
  var elenco = tutti.filter(function (o) {
    var sc = String(o.scadenza || o.data || '');
    if (!sc) return _ecfTuttiMese === null;
    if (Number(sc.slice(0, 4)) !== _ecfTuttiAnno) return false;
    if (_ecfTuttiMese !== null && Number(sc.slice(5, 7)) !== _ecfTuttiMese + 1) return false;
    return true;
  });

  var oggi = new Date().toISOString().slice(0, 10);
  var tot = elenco.reduce(function (a, o) { return a + Number(o.totale || 0); }, 0);
  var scaduto = elenco.filter(function (o) { return o.scadenza && o.scadenza < oggi; })
                      .reduce(function (a, o) { return a + Number(o.totale || 0); }, 0);
  var prossime = elenco.filter(function (o) { return o.scadenza && o.scadenza >= oggi; })
                       .sort(function (a, b) { return a.scadenza < b.scadenza ? -1 : 1; });
  var pross = prossime[0] || null;
  var impPross = pross ? prossime.filter(function (o) { return o.scadenza === pross.scadenza; })
                                 .reduce(function (a, o) { return a + Number(o.totale || 0); }, 0) : 0;

  if (typeof pfRfCtx === 'function') {
    pfRfCtx('tf', {
      ordini: elenco,
      sel: _ecfTuttiSel,
      fornitore: _ecfFornDaSel(elenco),
      selezionabile: true,
      pagatiInFondo: false,
      onChange: ecfTuttiRender,
      onSaved: async function () { _ecfTuttiSel = {}; await ecfTuttiRender(); }
    });
  }

  var MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  var anni = []; for (var a = _ecfTuttiAnno + 1; a >= _ecfTuttiAnno - 2; a--) anni.push(a);
  var selStile = 'font-size:11.5px;padding:6px 10px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer';

  var kpi = function (lab, val, sub, col) {
    return '<div style="flex:1;min-width:170px;border:0.5px solid var(--border);border-radius:10px;padding:11px 13px;background:var(--bg)">'
      + '<div style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:19px;font-weight:700;color:' + (col || 'var(--text)') + '">' + val + '</div>'
      + (sub ? '<div style="font-size:10.5px;color:var(--text-muted)">' + sub + '</div>' : '') + '</div>';
  };

  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">'
    + '<div style="font-size:15px;font-weight:700">🗂 Tutti i fornitori · per scadenza</div>'
    + '<button onclick="ecfChiudiTutti()" style="font-size:11.5px;padding:6px 13px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);cursor:pointer">← Panoramica fornitori</button>'
    + '</div>';

  h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:12px">'
    + ['da-pagare', 'tutti'].map(function (v) {
        var on = _ecfTuttiStato === v;
        return '<button onclick="ecfTuttiStato(\'' + v + '\')" style="font-size:11.5px;padding:6px 14px;border:0.5px solid ' + (on ? '#0C447C' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#0C447C' : 'var(--bg)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer">' + (v === 'da-pagare' ? 'Da pagare' : 'Tutti') + '</button>';
      }).join('')
    + '<span style="width:8px"></span>'
    + '<select onchange="ecfTuttiPeriodo(this.value)" style="' + selStile + '">'
      + '<option value=""' + (_ecfTuttiMese === null ? ' selected' : '') + '>Tutto l\'anno</option>'
      + MESI.map(function (m, i) { return '<option value="' + i + '"' + (_ecfTuttiMese === i ? ' selected' : '') + '>' + m + '</option>'; }).join('')
    + '</select>'
    + '<select onchange="ecfTuttiAnno(this.value)" style="' + selStile + '">'
      + anni.map(function (x) { return '<option value="' + x + '"' + (x === _ecfTuttiAnno ? ' selected' : '') + '>' + x + '</option>'; }).join('')
    + '</select>'
    + '<span style="font-size:11px;color:var(--text-muted)">per data di scadenza, dalla più vicina</span>'
    + '</div>';

  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:14px">'
    + kpi('Totale periodo', fmtE(tot), elenco.length + ' documenti')
    + kpi('Scaduto', scaduto > 0 ? fmtE(scaduto) : '—', scaduto > 0 ? 'da sistemare' : 'niente scaduto', scaduto > 0 ? '#A32D2D' : '#888')
    + kpi('Prossima scadenza', pross ? _pfIsoToIt(pross.scadenza) : '—', pross ? fmtE(impPross) : '')
    + kpi('Fornitori coinvolti', String(new Set(elenco.map(function (o) { return o.fornitore; })).size), 'nel periodo scelto')
    + '</div>';

  if (typeof pfRfCtx === 'function') {
    h += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-bottom:10px">' + pfRfBtnVista('tf') + '</div>'
      + pfRfTabella('tf') + pfRfBox('tf');
  }
  body.innerHTML = h;
}

// ═══ v20260803a · CONTESTAZIONE PREZZI AL FORNITORE ════════════════
// Si contesta il PREZZO, non i litri: quelli li certifica il DAS.
// Il confronto e sul COSTO PURO (`costo_litro`), senza trasporto —
// in fattura il trasporto e spesso una riga a parte, e mescolarlo
// darebbe al fornitore il primo appiglio per smontare la contestazione.
// Riga per riga sulla singola fattura, e in fondo una lettera da
// allegare alla PEC.
var _contStato = null;

// ═══ v20260804a · FILTRO PER DATA ORDINE ═══════════════════════════
// Filtra per la data dell'ORDINE, non per la scadenza. Vale SOLO
// sull'elenco: il debito verso il fornitore in cima resta quello che e,
// e vederlo cambiare mentre si filtra per data confonderebbe. Il totale
// del periodo si legge nella riga di riepilogo sotto la barra.
var _ecfElencoTutti = [];
var _ecfElencoFiltrato = [];
var _ecfDal = '';
var _ecfAl = '';

// v20260804c — Le date si scrivono nello stato SENZA ridisegnare: il
// ridisegno a ogni cifra ricreava i campi e faceva perdere il fuoco
// mentre si digitava. Si applica con il pulsante Filtra o uscendo dal
// campo dopo aver scelto dal calendario.
function ecfFiltroData(campo, valore) {
  if (campo === 'dal') _ecfDal = valore || '';
  else _ecfAl = valore || '';
}

function ecfApplicaFiltroData() {
  var d = document.getElementById('ecf-data-dal');
  var a = document.getElementById('ecf-data-al');
  if (d) _ecfDal = d.value || '';
  if (a) _ecfAl = a.value || '';
  _ecfRender();
}

function ecfFiltroDataPulisci() { _ecfDal = ''; _ecfAl = ''; _ecfRender(); }

function _ecfNelPeriodo(o) {
  // v20260804b — SOLO I PRIMI DIECI CARATTERI.
  // Se la data porta anche l'ora ("2026-07-08T00:00:00") il confronto con
  // l'estremo finale la escludeva: cercando un giorno solo non usciva
  // niente, perche "2026-07-08T00:00:00" > "2026-07-08".
  var d = String(o.data || '').substring(0, 10);
  if (!d) return true;
  if (_ecfDal && d < _ecfDal) return false;
  if (_ecfAl && d > _ecfAl) return false;
  return true;
}

function _ecfBarraData() {
  // v20260804b — senza le scorciatoie mese/anno: le fatture si pagano a 30
  // giorni, quei due pulsanti non servivano e rubavano spazio. Il filtro
  // parte da solo appena si sceglie una data.
  var inp = 'width:104px;padding:4px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:11.5px;font-family:var(--font-mono)';
  var h = '<div style="display:flex;gap:3px;align-items:center;background:var(--bg-kpi);border-radius:7px;padding:3px 7px">';
  h += '<span style="font-size:10.5px;color:var(--text-muted);white-space:nowrap">dal</span>';
  h += '<input type="date" id="ecf-data-dal" value="' + _ecfDal + '" onchange="ecfFiltroData(\'dal\', this.value)" style="' + inp + '">';
  h += '<span style="font-size:10.5px;color:var(--text-muted)">al</span>';
  h += '<input type="date" id="ecf-data-al" value="' + _ecfAl + '" onchange="ecfFiltroData(\'al\', this.value)" style="' + inp + '">';
  h += '<button onclick="ecfApplicaFiltroData()" style="font-size:11px;padding:4px 11px;border:0.5px solid #185FA5;border-radius:6px;background:#185FA5;color:#fff;font-weight:600;cursor:pointer;white-space:nowrap">Filtra</button>';
  if (_ecfDal || _ecfAl) {
    h += '<button onclick="ecfFiltroDataPulisci()" title="Togli il filtro" style="font-size:12px;padding:2px 6px;border:none;border-radius:5px;background:transparent;color:var(--text-muted);cursor:pointer">&#10005;</button>';
  }
  h += '</div>';
  h += '<span style="width:1px;height:20px;background:var(--border)"></span>';
  return h;
}

function _ecfRiepilogoData(tutti, filtrati) {
  if (!_ecfDal && !_ecfAl) return '';
  var imp = filtrati.reduce(function (a, o) { return a + Number(o.imponibile || o.totale || 0); }, 0);
  return '<div style="background:var(--bg-kpi);border-radius:8px;padding:9px 12px;margin-bottom:10px;font-size:11.5px;color:var(--text-muted)">'
    + 'Filtrati per <strong>data ordine</strong>'
    + (_ecfDal ? ' dal ' + _pfIsoToIt(_ecfDal) : '') + (_ecfAl ? ' al ' + _pfIsoToIt(_ecfAl) : '')
    + ' &middot; <strong style="color:var(--text)">' + filtrati.length + ' ordini</strong> su ' + tutti.length
    + ' &middot; imponibile <strong style="color:var(--text);font-family:var(--font-mono)">' + fmtE(imp) + '</strong></div>';
}

function ecfContestaFattura(fatturaId) {
  var f = (_ecfFatture || []).filter(function (x) { return x.id === fatturaId; })[0];
  if (!f || !(f.ordini || []).length) { toast('Fattura senza ordini agganciati'); return; }
  _contStato = {
    fatturaId: fatturaId,
    numero: f.numero || null,
    dataFattura: f.data || null,
    fornitore: _ecfSel ? _ecfSel.nome : '',
    righe: f.ordini.map(function (o) {
      return { ordineId: o.id, data: o.data, prodotto: o.prodotto,
               litri: Number(o.litri || 0), prezzoOrdine: Number(o.costo_litro || 0),
               prezzoFatt: null };
    })
  };
  _contRender();
}

function _contRender() {
  var S = _contStato; if (!S) return;
  var inp = 'width:112px;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px;text-align:right;font-family:var(--font-mono)';
  var h = '<div style="max-width:820px">';
  h += '<div style="font-size:16px;font-weight:600">Contestazione prezzi &mdash; ' + esc(S.fornitore) + '</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:6px">Fattura '
     + (S.numero ? esc(S.numero) : '(da numerare)') + (S.dataFattura ? ' del ' + _pfIsoToIt(S.dataFattura) : '')
     + ' &middot; ' + S.righe.length + ' ordini</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">Confronto sul <strong>costo puro</strong>, senza trasporto. '
     + 'Scrivi il prezzo che ti hanno fatturato: la differenza si calcola da sola.</div>';

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  h += '<tr style="color:var(--text-muted);text-align:right">'
     + '<th style="text-align:left;padding:6px 8px;font-weight:500">Data</th>'
     + '<th style="text-align:left;padding:6px 8px;font-weight:500">Prodotto</th>'
     + '<th style="padding:6px 8px;font-weight:500">Litri</th>'
     + '<th style="padding:6px 8px;font-weight:500">Prezzo ordine</th>'
     + '<th style="padding:6px 8px;font-weight:500">Prezzo fatturato</th>'
     + '<th style="padding:6px 8px;font-weight:500">Differenza</th>'
     + '<th style="padding:6px 8px;font-weight:500">Importo</th></tr>';

  S.righe.forEach(function (r, i) {
    var d = (r.prezzoFatt === null) ? null : Math.round((r.prezzoFatt - r.prezzoOrdine) * 1000000) / 1000000;
    var imp = (d === null) ? null : Math.round(d * r.litri * 100) / 100;
    var col = (d === null) ? 'var(--text-muted)' : (d > 0 ? '#A32D2D' : (d < 0 ? '#27500A' : 'var(--text-muted)'));
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right">'
      + '<td style="text-align:left;padding:7px 8px">' + _pfIsoToIt(r.data) + '</td>'
      + '<td style="text-align:left;padding:7px 8px">' + esc(r.prodotto || '') + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono)">' + Number(r.litri).toLocaleString('it-IT') + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono)">' + r.prezzoOrdine.toFixed(6) + '</td>'
      + '<td style="padding:7px 8px"><input type="number" step="0.000001" value="' + (r.prezzoFatt === null ? '' : r.prezzoFatt) + '"'
        + ' oninput="_contImposta(' + i + ', this.value)" placeholder="' + r.prezzoOrdine.toFixed(6) + '" style="' + inp + '"></td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono);color:' + col + '">' + (d === null ? '&mdash;' : (d > 0 ? '+' : '') + d.toFixed(6)) + '</td>'
      + '<td style="padding:7px 8px;font-family:var(--font-mono);font-weight:700;color:' + col + '">' + (imp === null ? '&mdash;' : fmtE(imp)) + '</td></tr>';
  });
  var tot = _contTotale();
  h += '<tr style="border-top:0.5px solid var(--border);background:var(--bg-kpi);text-align:right">'
    + '<td colspan="6" style="text-align:left;padding:9px 8px;font-weight:700">Totale contestato</td>'
    + '<td style="padding:9px 8px;font-family:var(--font-mono);font-weight:700;font-size:14px;color:' + (tot > 0 ? '#A32D2D' : 'var(--text-muted)') + '">' + fmtE(tot) + '</td></tr>';
  h += '</table></div>';

  h += '<div style="margin-top:12px"><label style="font-size:11px;color:var(--text-muted)">Nota per il fornitore</label>'
     + '<textarea id="cont-nota" rows="2" placeholder="Prezzi applicati difformi da quelli concordati" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;resize:vertical"></textarea></div>';

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">';
  h += '<button onclick="chiudiModal()" style="padding:8px 14px;font-size:12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Annulla</button>';
  h += '<button onclick="_contStampa()" style="padding:8px 14px;font-size:12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">&#128424; Lettera da inviare</button>';
  h += '<button onclick="_contSalva()" class="btn-primary" style="padding:8px 16px;font-size:12px">&#128190; Registra contestazione</button>';
  h += '</div></div>';
  apriModal(h);
}

function _contImposta(i, v) {
  var S = _contStato; if (!S) return;
  S.righe[i].prezzoFatt = (v === '' || isNaN(Number(v))) ? null : Number(v);
  // ridisegno solo i due valori della riga e il totale, senza rifare la
  // modale: rifacendola si perderebbe il cursore mentre si digita
  var celle = document.querySelectorAll('table tr');
  _contAggiornaTotale();
}

function _contTotale() {
  var S = _contStato; if (!S) return 0;
  return Math.round(S.righe.reduce(function (a, r) {
    if (r.prezzoFatt === null) return a;
    return a + (r.prezzoFatt - r.prezzoOrdine) * r.litri;
  }, 0) * 100) / 100;
}

function _contAggiornaTotale() {
  var S = _contStato; if (!S) return;
  var righe = document.querySelectorAll('table tr');
  for (var i = 0; i < S.righe.length; i++) {
    var r = S.righe[i];
    var tr = righe[i + 1];
    if (!tr) continue;
    var td = tr.querySelectorAll('td');
    if (td.length < 7) continue;
    var d = (r.prezzoFatt === null) ? null : Math.round((r.prezzoFatt - r.prezzoOrdine) * 1000000) / 1000000;
    var imp = (d === null) ? null : Math.round(d * r.litri * 100) / 100;
    var col = (d === null) ? 'var(--text-muted)' : (d > 0 ? '#A32D2D' : (d < 0 ? '#27500A' : 'var(--text-muted)'));
    td[5].innerHTML = (d === null ? '&mdash;' : (d > 0 ? '+' : '') + d.toFixed(6));
    td[5].style.color = col;
    td[6].innerHTML = (imp === null ? '&mdash;' : fmtE(imp));
    td[6].style.color = col;
  }
  var tot = _contTotale();
  var ultima = righe[S.righe.length + 1];
  if (ultima) {
    var c = ultima.querySelectorAll('td');
    if (c.length >= 2) { c[1].innerHTML = fmtE(tot); c[1].style.color = tot > 0 ? '#A32D2D' : 'var(--text-muted)'; }
  }
}

async function _contSalva() {
  var S = _contStato; if (!S) return;
  var righe = S.righe.filter(function (r) {
    return r.prezzoFatt !== null && Math.abs(r.prezzoFatt - r.prezzoOrdine) > 0.0000005;
  });
  if (!righe.length) { toast('Nessuna differenza di prezzo da contestare'); return; }
  var tot = _contTotale();
  var nota = ((document.getElementById('cont-nota') || {}).value || '').trim() || null;
  try {
    var ins = await sb.from('contestazioni_fornitore').insert([{
      fattura_ricevuta_id: S.fatturaId, fornitore: S.fornitore,
      numero_fattura: S.numero, data_fattura: S.dataFattura,
      importo_contestato: tot, motivo: 'prezzo', nota: nota, stato: 'aperta'
    }]).select('id').single();
    if (ins.error) throw ins.error;
    var payload = righe.map(function (r) {
      var d = Math.round((r.prezzoFatt - r.prezzoOrdine) * 1000000) / 1000000;
      return { contestazione_id: ins.data.id, ordine_id: r.ordineId, data_ordine: r.data,
               prodotto: r.prodotto, litri: r.litri, prezzo_ordine: r.prezzoOrdine,
               prezzo_fatturato: r.prezzoFatt, differenza: d,
               importo: Math.round(d * r.litri * 100) / 100 };
    });
    var insR = await sb.from('contestazioni_righe').insert(payload);
    if (insR.error) throw insR.error;
    if (typeof _auditLog === 'function') {
      _auditLog('contestazione_prezzi', 'contestazioni_fornitore',
        S.fornitore + ' fattura ' + (S.numero || 's.n.') + ' — ' + righe.length + ' righe per ' + fmtE(tot));
    }
    toast('\u2713 Contestazione registrata: ' + fmtE(tot));
    chiudiModal();
  } catch (e) {
    toast('Errore: ' + ((e && e.message) || e));
  }
}

// Lettera da allegare a una PEC. Deve reggere davanti al fornitore:
// riferimento alla fattura, ogni riga con prezzo concordato e prezzo
// fatturato, il totale e la richiesta di nota di credito.
function _contStampa() {
  var S = _contStato; if (!S) return;
  var righe = S.righe.filter(function (r) {
    return r.prezzoFatt !== null && Math.abs(r.prezzoFatt - r.prezzoOrdine) > 0.0000005;
  });
  if (!righe.length) { toast('Nessuna differenza da riportare nella lettera'); return; }
  var tot = _contTotale();
  var nota = ((document.getElementById('cont-nota') || {}).value || '').trim();
  var w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra: consenti i popup e riprova'); return; }
  var oggi = new Date().toLocaleDateString('it-IT');
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Contestazione fattura '
    + (S.numero || '') + '</title><style>'
    + 'body{font-family:Calibri,Arial,sans-serif;color:#222;margin:2cm;font-size:12.5px;line-height:1.6}'
    + 'h1{font-size:17px;margin:0 0 4px}.mitt{font-size:11px;color:#555;margin-bottom:22px}'
    + '.dest{margin-bottom:18px}.ogg{font-weight:700;margin-bottom:14px}'
    + 'table{width:100%;border-collapse:collapse;margin:14px 0}'
    + 'th{font-size:10.5px;color:#555;font-weight:600;border-bottom:1.5px solid #999;padding:6px 8px;text-align:right}'
    + 'th.l{text-align:left}td{border-bottom:1px solid #eee;padding:6px 8px;text-align:right;font-family:Consolas,monospace}'
    + 'td.l{text-align:left;font-family:Calibri,Arial,sans-serif}'
    + 'tr.tot td{border-top:1.5px solid #999;border-bottom:none;font-weight:700;font-size:13.5px}'
    + '.firma{margin-top:34px}@media print{body{margin:1.6cm}}</style></head><body>';
  doc += '<h1>PHOENIX FUEL S.R.L.</h1>';
  doc += '<div class="mitt">Zona Industriale &mdash; 89900 Vibo Valentia (VV) &middot; P.IVA 02744150802 &middot; phoenixfuel@legalmail.it</div>';
  doc += '<div class="dest">Spett.le<br><strong>' + S.fornitore + '</strong></div>';
  doc += '<div style="text-align:right;margin-bottom:14px">Vibo Valentia, ' + oggi + '</div>';
  doc += '<div class="ogg">Oggetto: contestazione prezzi &mdash; fattura ' + (S.numero || 'in oggetto')
      + (S.dataFattura ? ' del ' + S.dataFattura.split('-').reverse().join('/') : '') + '</div>';
  doc += '<p>Con la presente si contesta l\'applicazione di prezzi difformi da quelli concordati '
      + 'e registrati nei relativi ordini, come di seguito dettagliato.</p>';
  doc += '<table><tr><th class="l">Data</th><th class="l">Prodotto</th><th>Litri</th>'
      + '<th>Prezzo concordato</th><th>Prezzo fatturato</th><th>Differenza</th><th>Importo &euro;</th></tr>';
  righe.forEach(function (r) {
    var d = r.prezzoFatt - r.prezzoOrdine;
    doc += '<tr><td class="l">' + r.data.split('-').reverse().join('/') + '</td>'
      + '<td class="l">' + (r.prodotto || '') + '</td>'
      + '<td>' + Number(r.litri).toLocaleString('it-IT') + '</td>'
      + '<td>' + r.prezzoOrdine.toFixed(6) + '</td>'
      + '<td>' + r.prezzoFatt.toFixed(6) + '</td>'
      + '<td>' + (d > 0 ? '+' : '') + d.toFixed(6) + '</td>'
      + '<td>' + (d * r.litri).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td></tr>';
  });
  doc += '<tr class="tot"><td class="l" colspan="6">TOTALE CONTESTATO</td><td>'
      + tot.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td></tr></table>';
  if (nota) doc += '<p>' + nota + '</p>';
  doc += '<p>Si richiede pertanto l\'emissione di nota di credito per l\'importo sopra indicato, '
      + 'restando a disposizione per ogni chiarimento.</p>';
  doc += '<p>I prezzi indicati come concordati sono quelli registrati nei nostri ordini alla data di ciascuna consegna, '
      + 'al netto del trasporto.</p>';
  doc += '<div class="firma">Distinti saluti<br><br>Phoenix Fuel S.r.l.<br>_______________________</div>';
  doc += '</body></html>';
  w.document.write(doc);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}
