// ═══════════════════════════════════════════════════════════════════
// pf-estratto-fornitore.js — Estratto conto fornitore (linguetta in Fornitori)
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
    var r = await Promise.all([
      sb.from('fornitori').select('id,nome,fido_massimo,giorni_pagamento').order('nome'),
      sb.from('banche_conti').select('id,istituto_id,iban,descrizione'),
      sb.from('banche_istituti').select('id,nome')
    ]);
    _ecfFornitori = r[0].data || [];
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

// Calcolo CONDIVISO (panoramica + dashboard): un solo posto, dati sempre uguali
async function _ecfCalcolaFornitori(annoSel) {
  var annoG = Number(annoSel) || new Date().getFullYear();
  var da = (new Date().getFullYear() - 1) + '-01-01';
  var r = await Promise.all([
    _pfFetchAllPages(function () {
      return sb.from('ordini').select('fornitore,data,litri,costo_litro,iva,pagato_fornitore,fattura_ricevuta_id')
        .neq('stato','annullato').gte('data', da).order('data', { ascending: false });
    }),
    sb.from('fatture_ricevute').select('id,fornitore_nome,importo_dichiarato'),
    sb.from('pagamenti_fornitori').select('fattura_ricevuta_id,importo')
  ]);
  var ordini = r[0] || [], fatture = r[1].data || [], pagam = r[2].data || [];
  _ecfOrdiniTutti = ordini;
  var pagPerFatt = {};
  pagam.forEach(function (p) { pagPerFatt[p.fattura_ricevuta_id] = (pagPerFatt[p.fattura_ricevuta_id] || 0) + Number(p.importo || 0); });
  var residuoPerForn = {};
  fatture.forEach(function (f) {
    var res = Number(f.importo_dichiarato || 0) - (pagPerFatt[f.id] || 0);
    if (res > 0.01) residuoPerForn[String(f.fornitore_nome || '').toLowerCase()] = (residuoPerForn[String(f.fornitore_nome || '').toLowerCase()] || 0) + res;
  });

  var oggi = new Date().toISOString().slice(0, 10);
  var cards = _ecfFornitori.map(function (f) {
    var nome = String(f.nome || ''), gg = Number(f.giorni_pagamento || 30), fido = Number(f.fido_massimo || 0);
    var suoi = ordini.filter(function (o) { return String(o.fornitore || '').toLowerCase() === nome.toLowerCase(); });
    var aperti = suoi.filter(function (o) { return !o.pagato_fornitore && !o.fattura_ricevuta_id; });
    var esp = aperti.reduce(function (s, o) { return s + Number(o.costo_litro || 0) * Number(o.litri || 0) * (1 + Number(o.iva == null ? 22 : o.iva) / 100); }, 0)
            + (residuoPerForn[nome.toLowerCase()] || 0);
    esp = Math.round(esp * 100) / 100;
    var scad = aperti.map(function (o) { return _ecfAddGiorni(o.data, gg); }).filter(Boolean).sort();
    var prossima = scad.length ? scad[0] : null;
    var scadute = scad.filter(function (d) { return d < oggi; }).length;
    var annoOrd = suoi.filter(function (o) { return String(o.data).slice(0,4) === String(annoG); });
    var acq = annoOrd.reduce(function (s, o) { return s + Number(o.costo_litro || 0) * Number(o.litri || 0); }, 0);
    var litriAnno = annoOrd.reduce(function (s, o) { return s + Number(o.litri || 0); }, 0);
    return { id: f.id, nome: nome, gg: gg, fido: fido, esp: esp, nAperti: aperti.length, prossima: prossima, scadute: scadute, acq: acq, litri: litriAnno };
  }).filter(function (c) { return c.fido > 0 || c.nAperti > 0 || c.acq > 0; })
    .sort(function (a, b) { return b.esp - a.esp; });
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
          + (c.fido > 0 ? _ecfBarra(c.esp, c.fido, false)
                        : '<div style="font-size:11px;color:var(--text-muted)">Esposizione ' + fmtE(c.esp) + ' · nessun fido assegnato</div>')
          + (c.fido > 0 ? '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:7px">'
              + '<span style="color:var(--text-muted)">Fido disponibile</span>'
              + '<span style="font-family:var(--font-mono);font-weight:700;color:' + ((c.fido - c.esp) < 0 ? '#A32D2D' : '#3B6D11') + '">' + fmtE(c.fido - c.esp) + '</span></div>' : '')
          + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:7px">'
            + '<span style="color:var(--text-muted)">' + c.nAperti + ' ordini aperti</span>'
            + (c.scadute ? '<span style="color:#A32D2D;font-weight:700">' + c.scadute + ' scaduti</span>'
                         : '<span style="color:var(--text-muted)">prossima ' + (c.prossima ? _pfIsoToIt(c.prossima) : '—') + '</span>')
          + '</div></div>';
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
  var da = (new Date().getFullYear() - 1) + '-01-01';
  var qd = await _pfFetchAllPages(function () {
    return sb.from('ordini')
      .select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,stato,pagato_fornitore,fattura_ricevuta_id')
      .ilike('fornitore', _ecfSel.nome).neq('stato', 'annullato').gte('data', da).order('data', { ascending: false });
  });
  var q = { data: qd };
  _ecfOrdini = (q.data || []).map(function (o) {
    return {
      id: o.id, data: o.data, prodotto: o.prodotto, litri: Number(o.litri || 0),
      costoL: Number(o.costo_litro || 0),
      imponibile: Math.round(Number(o.costo_litro || 0) * Number(o.litri || 0) * 100) / 100,
      totale: Math.round(Number(o.costo_litro || 0) * Number(o.litri || 0) * (1 + Number(o.iva == null ? 22 : o.iva) / 100) * 100) / 100,
      scadenza: _ecfAddGiorni(o.data, _ecfSel.gg),
      pagato: !!o.pagato_fornitore, fatturaId: o.fattura_ricevuta_id || null
    };
  });

  var fIds = [];
  _ecfOrdini.forEach(function (o) { if (o.fatturaId && fIds.indexOf(o.fatturaId) < 0) fIds.push(o.fatturaId); });
  _ecfFatture = [];
  if (fIds.length) {
    var rf = await Promise.all([
      sb.from('fatture_ricevute').select('*').in('id', fIds),
      sb.from('pagamenti_fornitori').select('fattura_ricevuta_id,importo,data_pagamento').in('fattura_ricevuta_id', fIds)
    ]);
    var pag = {};
    (rf[1].data || []).forEach(function (p) {
      if (!pag[p.fattura_ricevuta_id]) pag[p.fattura_ricevuta_id] = { tot: 0, n: 0, ultima: null };
      var m = pag[p.fattura_ricevuta_id];
      m.tot += Number(p.importo || 0); m.n++;
      if (!m.ultima || String(p.data_pagamento) > String(m.ultima)) m.ultima = p.data_pagamento;
    });
    _ecfFatture = (rf[0].data || []).map(function (x) {
      var ords = _ecfOrdini.filter(function (o) { return o.fatturaId === x.id; });
      var tot = Number(x.importo_dichiarato || 0) || ords.reduce(function (s, o) { return s + o.totale; }, 0);
      var pg = pag[x.id] || { tot: 0, n: 0, ultima: null };
      var residuo = Math.round((tot - pg.tot) * 100) / 100;
      return {
        id: x.id, numero: x.numero_fattura, data: x.data_fattura, scadenza: x.data_scadenza,
        totale: tot, pagato: pg.tot, nPag: pg.n, ultimoPag: pg.ultima,
        residuo: residuo, saldata: residuo <= 0.01, ordini: ords
      };
    }).sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });

    // REGOLA: se l'ordine è agganciato a una fattura, comanda la scadenza
    // scritta sulla fattura (il fornitore può averla variata sul cumulativo).
    var scadFatt = {};
    (rf[0].data || []).forEach(function (x) { if (x.data_scadenza) scadFatt[x.id] = x.data_scadenza; });
    _ecfOrdini.forEach(function (o) {
      if (o.fatturaId && scadFatt[o.fatturaId]) o.scadenza = _ecfAddGiorni(o.data, _ecfSel.gg, scadFatt[o.fatturaId]);
    });
  }
}

// Esposizione = ordini senza fattura non pagati + residui delle fatture aperte
function ecfEsposizione() {
  var a = _ecfOrdini.filter(function (o) { return !o.fatturaId && !o.pagato; })
                    .reduce(function (s, o) { return s + o.totale; }, 0);
  var b = _ecfFatture.reduce(function (s, f) { return s + (f.saldata ? 0 : f.residuo); }, 0);
  return Math.round((a + b) * 100) / 100;
}

function _ecfBarra(usato, fido, alta) {
  var pct = fido > 0 ? Math.min(100, (usato / fido) * 100) : 0;
  var col = pct >= 85 ? 'linear-gradient(90deg,#F0564F,#E5342F)' : pct >= 60 ? 'linear-gradient(90deg,#FBAA3E,#F5921E)' : 'linear-gradient(90deg,#5DC33A,#4CAF2E)';
  var txt = pct >= 85 ? '#C0392B' : pct >= 60 ? '#E07B18' : '#3B6D11';
  var h = alta ? 24 : 14;
  return '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">'
    + '<span style="font-size:' + (alta ? 12 : 11) + 'px;color:var(--text-secondary)">Fido utilizzato</span>'
    + '<span style="font-family:var(--font-mono);font-size:' + (alta ? 12.5 : 11) + 'px;font-weight:700;color:' + txt + '">'
    + fmtE(usato) + ' / ' + fmtE(fido) + ' · ' + Math.round(pct) + '%</span></div>'
    + '<div style="height:' + h + 'px;border-radius:' + (h / 2) + 'px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden">'
    + '<div style="height:100%;width:' + pct + '%;border-radius:' + (h / 2) + 'px;background:' + col + '"></div></div>';
}

function ecfSetFiltro(v) { _ecfFiltro = v; _ecfRender(); }
function ecfToggleOrdine(id, cb) { if (cb && cb.checked) _ecfSelezione[id] = true; else delete _ecfSelezione[id]; _ecfRender(); }
function ecfDeseleziona() { _ecfSelezione = {}; _ecfRender(); }

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
  var senzaFatt = _ecfOrdini.filter(function (o) { return !o.fatturaId && (_ecfFiltro === 'tutti' || !o.pagato); });
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
  var nDaPagare = senzaFatt.filter(function (o) { return _ecfSelezione[o.id] && !o.pagato; }).length;
  var nGiaPagati = senzaFatt.filter(function (o) { return _ecfSelezione[o.id] && o.pagato; }).length;
  var btnPag = nDaPagare
    ? '<button onclick="ecfApriRegistra()" style="width:100%;margin-top:6px;font-size:12px;padding:8px 10px;border:0.5px solid #0C447C;border-radius:8px;background:var(--bg-card,#fff);color:#0C447C;font-weight:600;cursor:pointer">＋ Pagamento' + (nGiaPagati ? ' (' + nDaPagare + ')' : '') + '</button>'
    : '<div style="margin-top:6px;font-size:10.5px;color:#0C447C;line-height:1.45">Selezione di soli ordini già pagati: puoi agganciare la fattura, non il pagamento.</div>';

  if (typeof pfRfCtx === 'function') {
    pfRfCtx('ecf', {
      ordini: senzaFatt,
      sel: _ecfSelezione,
      fornitore: _ecfSel,
      selezionabile: true,
      onChange: _ecfRender,
      onSaved: async function () { _ecfSelezione = {}; await _ecfCarica(); _ecfRender(); },
      extraBtn: btnPag
    });
  }

  var righeFatt = _ecfFatture.map(function (f) {
    var badge = f.saldata
      ? '<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">pagata</span>'
      : (f.nPag > 0 ? '<span style="background:#E6F1FB;color:#0C447C;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">acconto' + (f.ultimoPag ? ' ' + _pfIsoToIt(f.ultimoPag) : '') + '</span>'
                    : '<span style="background:#FFF1DC;color:#8A4F06;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">aperta</span>');
    return '<tr>'
      + '<td style="text-align:center"><input type="checkbox"' + (f.saldata ? ' checked disabled' : '') + ' onclick="ecfPagaFattura(\'' + f.id + '\')" title="Registra pagamento" style="width:17px;height:17px;cursor:pointer;accent-color:#639922"></td>'
      + '<td style="font-family:var(--font-mono)">' + (f.numero ? esc(f.numero)
          : '<button onclick="ecfNumeraFattura(\'' + f.id + '\')" title="La fattura è arrivata: inserisci il numero" style="font-size:11px;padding:4px 9px;border:0.5px solid #F5921E;border-radius:6px;background:#FFF1DC;color:#8A4F06;cursor:pointer;font-family:inherit;font-weight:600">✎ inserisci n°</button>') + '</td>'
      + '<td style="font-family:var(--font-mono)">' + (f.data ? _pfIsoToIt(f.data) : '—') + '</td>'
      + '<td>' + f.ordini.length + ' ordini <span onclick="ecfInfoFattura(\'' + f.id + '\')" title="Dettaglio ordini" style="display:inline-block;width:19px;height:19px;line-height:19px;text-align:center;border-radius:50%;background:#85B7EB;color:#fff;font-size:11px;font-weight:700;cursor:pointer;user-select:none">i</span></td>'
      + '<td style="text-align:right;font-family:var(--font-mono)">' + fmtE(f.totale) + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);color:#3B6D11">' + (f.pagato > 0 ? fmtE(f.pagato) : '—') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700;color:' + (f.saldata ? 'var(--text-muted)' : '#A32D2D') + '">' + (f.saldata ? '—' : fmtE(f.residuo)) + '</td>'
      + '<td>' + badge + '</td></tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:18px;font-size:12px">Nessuna fattura registrata</td></tr>';

  var th = 'padding:9px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;background:var(--bg)';
  var btnF = function (v, t) {
    var on = _ecfFiltro === v;
    return '<button onclick="ecfSetFiltro(\'' + v + '\')" style="font-size:11.5px;padding:6px 14px;border:0.5px solid ' + (on ? '#0C447C' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#0C447C' : 'var(--bg)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer">' + t + '</button>';
  };

  body.innerHTML =
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">'
      + kpi('Acquistato ' + anno, acquistato, 'imponibile · IVA inc. ' + fmtE(acquistatoIva) + ' · ' + ordAnno.length + ' ordini · dilazione ' + _ecfSel.gg + ' gg', '')
      + kpi('Pagato', pagatoTot, nSaldate + ' fatture saldate', 'ok')
      + kpi('Da pagare', daPagare, nAperti + ' documenti aperti', 'ko')
    + '</div>'
    + (_ecfSel.fido > 0
        ? '<div style="margin-bottom:20px">' + _ecfBarra(ecfEsposizione(), _ecfSel.fido, true)
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-top:11px;padding-top:11px;border-top:0.5px solid var(--border)">'
            + '<span style="font-size:13px;color:var(--text-secondary);font-weight:600">Fido disponibile da usare</span>'
            + '<span style="font-family:var(--font-mono);font-size:21px;font-weight:700;color:' + ((_ecfSel.fido - ecfEsposizione()) < 0 ? '#A32D2D' : '#3B6D11') + '">' + fmtE(_ecfSel.fido - ecfEsposizione()) + '</span></div>'
          + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:5px">calcolato sugli ordini non pagati e sui residui delle fatture</div></div>'
        : '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:16px">Nessun fido assegnato a questo fornitore.</div>')

    // Banner laterale FISSO: resta visibile anche scorrendo in fondo all'elenco
    + _ecfTimelineHtml()
    + (typeof pfRfBox === 'function' ? pfRfBox('ecf') : '')

    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">'
      + '<div style="font-size:13px;font-weight:600">Ordini da pagare — senza fattura</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap">' + btnF('aperti', 'Solo da pagare') + btnF('tutti', 'Tutti')
        + (typeof pfRfBtnVista === 'function' ? pfRfBtnVista('ecf') : '') + '</div></div>'
    + '<div style="margin-bottom:22px">' + (typeof pfRfTabella === 'function' ? pfRfTabella('ecf') : '') + '</div>'

    + '<div style="font-size:13px;font-weight:600;margin-bottom:6px">Fatture registrate</div>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'
      + '<th style="' + th + ';width:52px">Pagata</th><th style="' + th + ';text-align:left">N° fattura</th><th style="' + th + ';text-align:left">Data</th>'
      + '<th style="' + th + ';text-align:left">Ordini</th><th style="' + th + ';text-align:right">Totale</th>'
      + '<th style="' + th + ';text-align:right">Pagato</th><th style="' + th + ';text-align:right">Residuo</th>'
      + '<th style="' + th + ';text-align:left">Stato</th></tr></thead><tbody>' + righeFatt + '</tbody></table></div>';

  window.scrollTo(0, scrollY);
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
  var ords = _ecfOrdini.filter(function (o) { return _ecfSelezione[o.id] && !o.pagato; });
  if (!ords.length) { toast('Seleziona almeno un ordine non ancora pagato'); return; }
  var tot = Math.round(ords.reduce(function (s, o) { return s + o.totale; }, 0) * 100) / 100;
  _ecfMod = { tipo: 'nuova', ordini: ords, totale: tot, modo: 'totale', importo: tot, fatturaId: null };
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
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">data fattura</label><input id="ecf-dfatt" type="date" value="' + _ecfOggi() + '" style="' + box + '"></div>'
      + '</div>'
      + '<div style="background:#E6F1FB;color:#0C447C;padding:8px 12px;border-radius:7px;font-size:11.5px;line-height:1.5;margin-bottom:12px">'
        + 'Puoi pagare anche senza fattura: l\'ordine esce dal fido subito e il numero si inserisce dopo, dal tasto ✎ nella tabella Fatture registrate.</div>';
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
    + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">modalità</label><select id="ecf-mod" style="' + box + ';font-family:inherit"><option>Bonifico</option><option>RIBA</option><option>Assegno</option></select></div>'
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
    }]);
    if (insP.error) throw insP.error;

    // Saldo totale → gli ordini della fattura risultano pagati
    if (importo >= S.totale - 0.01) {
      var idsOk = S.ordini.map(function (o) { return o.id; });
      await sb.from('ordini').update({ pagato_fornitore: true }).in('id', idsOk);
    }

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

// La fattura pagata prima del documento riceve il numero dopo: ✎ nella riga
async function ecfNumeraFattura(fatturaId) {
  var f = _ecfFatture.filter(function (x) { return x.id === fatturaId; })[0];
  if (!f) return;
  var n = prompt('Numero fattura — ' + _ecfSel.nome + ' · ' + (f.data ? _pfIsoToIt(f.data) : '—') + ' · ' + fmtE(f.totale), f.numero || '');
  if (n === null) return;
  n = String(n).trim();
  if (!n) { toast('Numero non inserito'); return; }
  try {
    var up = await sb.from('fatture_ricevute').update({ numero_fattura: n }).eq('id', fatturaId);
    if (up.error) throw up.error;
    if (typeof _auditLog === 'function') _auditLog('fattura_fornitore', 'fatture_ricevute', _ecfSel.nome + ' numerata ' + n);
    toast('✓ Fattura numerata: ' + n);
    await _ecfCarica();
    _ecfRender();
    if (typeof _rfRenderTab === 'function' && document.getElementById('rf-body')) _rfRenderTab();
  } catch (e) {
    var m = (e && e.message) ? e.message : String(e);
    if (m.indexOf('duplicate') >= 0 || m.indexOf('unique') >= 0) m = 'Esiste già una fattura ' + n + ' per ' + _ecfSel.nome + '.';
    toast('Errore: ' + m);
  }
}

// Tasto (i) — ordini che compongono la fattura
function ecfInfoFattura(fatturaId) {
  var f = _ecfFatture.filter(function (x) { return x.id === fatturaId; })[0];
  if (!f) return;
  var th = 'padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;background:var(--bg)';
  var righe = f.ordini.map(function (o) {
    return '<tr><td style="padding:9px 8px;border-top:0.5px solid var(--border);font-family:var(--font-mono)">' + _pfIsoToIt(o.data) + '</td>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border)">' + esc(o.prodotto || '—') + '</td>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border);text-align:right;font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border);text-align:right;font-family:var(--font-mono)">' + o.costoL.toFixed(4).replace('.', ',') + '</td>'
      + '<td style="padding:9px 8px;border-top:0.5px solid var(--border);text-align:right;font-family:var(--font-mono);font-weight:600">' + fmtE(o.imponibile) + '</td></tr>';
  }).join('');
  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">Fattura ' + esc(f.numero || '—') + ' — ' + esc(_ecfSel.nome) + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + (f.data ? _pfIsoToIt(f.data) : '—') + ' · ' + f.ordini.length + ' ordini · ' + fmtE(f.totale) + '</div>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'
    + '<th style="' + th + ';text-align:left">Data</th><th style="' + th + ';text-align:left">Prodotto</th>'
    + '<th style="' + th + ';text-align:right">Litri</th><th style="' + th + ';text-align:right">€/L</th>'
    + '<th style="' + th + ';text-align:right">Imponibile</th></tr></thead><tbody>' + righe + '</tbody>'
    + '<tfoot><tr><td colspan="4" style="padding:11px 8px;border-top:2px solid var(--accent);font-weight:700">Totale fattura</td>'
    + '<td style="padding:11px 8px;border-top:2px solid var(--accent);text-align:right;font-family:var(--font-mono);font-weight:700">' + fmtE(f.totale) + '</td></tr></tfoot></table></div>'
    + (f.pagato > 0 ? '<div style="font-size:12px;color:#3B6D11;margin-top:10px">Pagato ' + fmtE(f.pagato) + (f.saldata ? ' — saldata' : ' · residuo ' + fmtE(f.residuo)) + '</div>' : '')
    + '<div style="display:flex;justify-content:flex-end;margin-top:14px"><button onclick="chiudiModalePermessi()" style="padding:9px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-size:13px">Chiudi</button></div>';
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
    if (!_ecfPop) {
      var r0 = await sb.from('fornitori').select('id,nome,fido_massimo,giorni_pagamento').order('nome');
      _ecfFornitori = r0.data || [];
    }
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
            + _ecfBarra(c.esp, c.fido, false)
            + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:8px">'
              + '<span style="color:var(--text-muted)">Acquistato ' + new Date().getFullYear() + '</span>'
              + '<span style="font-family:var(--font-mono);font-weight:700">' + fmtE(c.acq) + '</span></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:4px">'
              + '<span style="color:var(--text-muted)">Fido disponibile</span>'
              + '<span style="font-family:var(--font-mono);font-weight:700;color:' + ((c.fido - c.esp) < 0 ? '#A32D2D' : '#3B6D11') + '">' + fmtE(c.fido - c.esp) + '</span></div>'
            + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px">'
              + '<span style="color:var(--text-muted)">' + c.nAperti + ' ordini aperti</span>'
              + (c.scadute ? '<span style="color:#A32D2D;font-weight:700">' + c.scadute + ' scaduti</span>'
                           : '<span style="color:var(--text-muted)">prossima ' + (c.prossima ? _pfIsoToIt(c.prossima) : '—') + '</span>')
            + '</div></div>';
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
function pfScadenzaFornitore(dataOrdine, ggFornitore, dataScadenzaFattura) {
  var base = dataScadenzaFattura ? String(dataScadenzaFattura).slice(0, 10) : null;
  if (!base) {
    if (!dataOrdine) return null;
    var d = new Date(String(dataOrdine).slice(0, 10) + 'T12:00:00');
    d.setDate(d.getDate() + Number(ggFornitore || 30));
    base = d.toISOString().slice(0, 10);
  }
  var x = new Date(base + 'T12:00:00');
  var g = x.getDay();
  if (g === 6) x.setDate(x.getDate() + 2);
  if (g === 0) x.setDate(x.getDate() + 1);
  return x.toISOString().slice(0, 10);
}

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
