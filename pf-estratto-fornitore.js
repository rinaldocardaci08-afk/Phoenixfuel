// ═══════════════════════════════════════════════════════════════════
// pf-estratto-fornitore.js — Estratto conto fornitore (linguetta in Fornitori)
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
  var cards = await _ecfCalcolaFornitori();
  if (!cards.length) { body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">Nessun fornitore con movimenti.</div>'; return; }
  _ecfDisegnaOverview(body, cards);
}

// Calcolo CONDIVISO (panoramica + dashboard): un solo posto, dati sempre uguali
async function _ecfCalcolaFornitori() {
  var da = (new Date().getFullYear() - 1) + '-01-01';
  var r = await Promise.all([
    _pfFetchAllPages(function () {
      return sb.from('ordini').select('fornitore,data,litri,costo_litro,pagato_fornitore,fattura_ricevuta_id')
        .neq('stato','annullato').gte('data', da).order('data', { ascending: false });
    }),
    sb.from('fatture_ricevute').select('id,fornitore_nome,importo_dichiarato'),
    sb.from('pagamenti_fornitori').select('fattura_ricevuta_id,importo')
  ]);
  var ordini = r[0] || [], fatture = r[1].data || [], pagam = r[2].data || [];
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
    var esp = aperti.reduce(function (s, o) { return s + Number(o.costo_litro || 0) * Number(o.litri || 0); }, 0)
            + (residuoPerForn[nome.toLowerCase()] || 0);
    esp = Math.round(esp * 100) / 100;
    var scad = aperti.map(function (o) { return _ecfAddGiorni(o.data, gg); }).filter(Boolean).sort();
    var prossima = scad.length ? scad[0] : null;
    var scadute = scad.filter(function (d) { return d < oggi; }).length;
    var annoOrd = suoi.filter(function (o) { return String(o.data).slice(0,4) === String(new Date().getFullYear()); });
    var acq = annoOrd.reduce(function (s, o) { return s + Number(o.costo_litro || 0) * Number(o.litri || 0); }, 0);
    return { id: f.id, nome: nome, gg: gg, fido: fido, esp: esp, nAperti: aperti.length, prossima: prossima, scadute: scadute, acq: acq };
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
          + '<div style="font-size:11px;color:var(--text-muted);margin:2px 0 10px">acquistato ' + fmtE(c.acq) + '</div>'
          + (c.fido > 0 ? _ecfBarra(c.esp, c.fido, false)
                        : '<div style="font-size:11px;color:var(--text-muted)">Esposizione ' + fmtE(c.esp) + ' · nessun fido assegnato</div>')
          + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:9px">'
            + '<span style="color:var(--text-muted)">' + c.nAperti + ' ordini aperti</span>'
            + (c.scadute ? '<span style="color:#A32D2D;font-weight:700">' + c.scadute + ' scaduti</span>'
                         : '<span style="color:var(--text-muted)">prossima ' + (c.prossima ? _pfIsoToIt(c.prossima) : '—') + '</span>')
          + '</div></div>';
      }).join('') + '</div>';
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

function _ecfAddGiorni(dataISO, gg) {
  if (!dataISO) return null;
  var d = new Date(String(dataISO).slice(0, 10));
  d.setDate(d.getDate() + Number(gg || 0));
  return d.toISOString().slice(0, 10);
}

async function _ecfCarica() {
  var da = (new Date().getFullYear() - 1) + '-01-01';
  var qd = await _pfFetchAllPages(function () {
    return sb.from('ordini')
      .select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,stato,pagato_fornitore,fattura_ricevuta_id')
      .ilike('fornitore', _ecfSel.nome).neq('stato', 'annullato').gte('data', da).order('data', { ascending: false });
  });
  var q = { data: qd };
  _ecfOrdini = (q.data || []).map(function (o) {
    return {
      id: o.id, data: o.data, prodotto: o.prodotto, litri: Number(o.litri || 0),
      costoL: Number(o.costo_litro || 0),
      imponibile: Math.round(Number(o.costo_litro || 0) * Number(o.litri || 0) * 100) / 100,
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
      var tot = Number(x.importo_dichiarato || 0) || ords.reduce(function (s, o) { return s + o.imponibile; }, 0);
      var pg = pag[x.id] || { tot: 0, n: 0, ultima: null };
      var residuo = Math.round((tot - pg.tot) * 100) / 100;
      return {
        id: x.id, numero: x.numero_fattura, data: x.data_fattura, scadenza: x.data_scadenza,
        totale: tot, pagato: pg.tot, nPag: pg.n, ultimoPag: pg.ultima,
        residuo: residuo, saldata: residuo <= 0.01, ordini: ords
      };
    }).sort(function (a, b) { return String(b.data).localeCompare(String(a.data)); });
  }
}

// Esposizione = ordini senza fattura non pagati + residui delle fatture aperte
function ecfEsposizione() {
  var a = _ecfOrdini.filter(function (o) { return !o.fatturaId && !o.pagato; })
                    .reduce(function (s, o) { return s + o.imponibile; }, 0);
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

  var selIds = Object.keys(_ecfSelezione);
  var totSel = _ecfOrdini.filter(function (o) { return _ecfSelezione[o.id]; }).reduce(function (s, o) { return s + o.imponibile; }, 0);

  var righeOrd = senzaFatt.map(function (o) {
    var scaduto = !o.pagato && o.scadenza && o.scadenza < oggi;
    var gg = scaduto ? Math.round((new Date(oggi) - new Date(o.scadenza)) / 86400000) : 0;
    var badge = o.pagato
      ? '<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">pagato</span>'
      : (scaduto ? '<span style="background:#FCEBEB;color:#791F1F;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">scaduto ' + gg + ' gg</span>'
                 : '<span style="background:#FFF1DC;color:#8A4F06;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">da pagare</span>');
    return '<tr>'
      + '<td style="text-align:center">' + (o.pagato ? '' : '<input type="checkbox"' + (_ecfSelezione[o.id] ? ' checked' : '') + ' onclick="ecfToggleOrdine(\'' + o.id + '\',this)" style="width:17px;height:17px;cursor:pointer;accent-color:#639922">') + '</td>'
      + '<td style="font-family:var(--font-mono)">' + _pfIsoToIt(o.data) + '</td>'
      + '<td>' + esc(o.prodotto || '—') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-size:12px">' + o.costoL.toFixed(4).replace('.', ',') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-weight:600">' + fmtE(o.imponibile) + '</td>'
      + '<td style="font-family:var(--font-mono);' + (scaduto ? 'color:#A32D2D;font-weight:700' : '') + '">' + (o.scadenza ? _pfIsoToIt(o.scadenza) : '—') + '</td>'
      + '<td>' + badge + '</td></tr>';
  }).join('') || '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:18px;font-size:12px">Nessun ordine</td></tr>';

  var righeFatt = _ecfFatture.map(function (f) {
    var badge = f.saldata
      ? '<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">pagata</span>'
      : (f.nPag > 0 ? '<span style="background:#E6F1FB;color:#0C447C;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">acconto' + (f.ultimoPag ? ' ' + _pfIsoToIt(f.ultimoPag) : '') + '</span>'
                    : '<span style="background:#FFF1DC;color:#8A4F06;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">aperta</span>');
    return '<tr>'
      + '<td style="text-align:center"><input type="checkbox"' + (f.saldata ? ' checked disabled' : '') + ' onclick="ecfPagaFattura(\'' + f.id + '\')" title="Registra pagamento" style="width:17px;height:17px;cursor:pointer;accent-color:#639922"></td>'
      + '<td style="font-family:var(--font-mono)">' + esc(f.numero || '—') + '</td>'
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
      + kpi('Acquistato ' + anno, acquistato, ordAnno.length + ' ordini · dilazione ' + _ecfSel.gg + ' gg', '')
      + kpi('Pagato', pagatoTot, nSaldate + ' fatture saldate', 'ok')
      + kpi('Da pagare', daPagare, nAperti + ' documenti aperti', 'ko')
    + '</div>'
    + (_ecfSel.fido > 0
        ? '<div style="margin-bottom:20px">' + _ecfBarra(ecfEsposizione(), _ecfSel.fido, true)
          + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:5px">calcolato sugli ordini non pagati e sui residui delle fatture</div></div>'
        : '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:16px">Nessun fido assegnato a questo fornitore.</div>')

    // Banner laterale FISSO: resta visibile anche scorrendo in fondo all'elenco
    + (selIds.length
        ? '<div style="position:fixed;right:18px;top:120px;z-index:900;width:230px;background:#E6F1FB;border:1px solid #378ADD;border-radius:12px;padding:13px 14px;box-shadow:0 6px 18px rgba(0,0,0,.16)">'
          + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#0C447C;font-weight:700;margin-bottom:6px">Selezione</div>'
          + '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:#0C447C">' + selIds.length + ' ordini</div>'
          + '<div style="font-family:var(--font-mono);font-size:15px;font-weight:700;margin:2px 0 10px">' + fmtE(totSel) + '</div>'
          + '<button onclick="ecfApriRegistra()" style="width:100%;font-size:12px;padding:9px 10px;border:none;border-radius:8px;background:#0C447C;color:#fff;font-weight:600;cursor:pointer">＋ Registra fattura e pagamento</button>'
          + '<button onclick="ecfDeseleziona()" style="width:100%;margin-top:6px;font-size:12px;padding:7px 10px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Deseleziona</button>'
          + '</div>'
        : '')

    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:6px">'
      + '<div style="font-size:13px;font-weight:600">Ordini da pagare — senza fattura</div>'
      + '<div style="display:flex;gap:8px">' + btnF('aperti', 'Solo da pagare') + btnF('tutti', 'Tutti') + '</div></div>'
    + '<div style="overflow-x:auto;margin-bottom:22px"><table style="width:100%;border-collapse:collapse;font-size:13px"><thead><tr>'
      + '<th style="' + th + ';width:52px">Sel.</th><th style="' + th + ';text-align:left">Data</th><th style="' + th + ';text-align:left">Prodotto</th>'
      + '<th style="' + th + ';text-align:right">Litri</th><th style="' + th + ';text-align:right">€/L</th>'
      + '<th style="' + th + ';text-align:right">Imponibile</th><th style="' + th + ';text-align:left">Scadenza</th>'
      + '<th style="' + th + ';text-align:left">Stato</th></tr></thead><tbody>' + righeOrd + '</tbody></table></div>'

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
  var ords = _ecfOrdini.filter(function (o) { return _ecfSelezione[o.id]; });
  if (!ords.length) { toast('Seleziona almeno un ordine'); return; }
  var tot = Math.round(ords.reduce(function (s, o) { return s + o.imponibile; }, 0) * 100) / 100;
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

  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">' + (esistente ? 'Pagamento fattura ' + esc(S.fattura.numero || '') : 'Registra fattura e pagamento') + ' — ' + esc(_ecfSel.nome) + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + S.ordini.length + ' ordini · ' + (esistente ? 'residuo ' : 'totale ') + fmtE(S.totale) + '</div>';

  if (!esistente) {
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">n° fattura</label><input id="ecf-nfatt" type="text" placeholder="es. 64920" style="' + box + '"></div>'
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">data fattura</label><input id="ecf-dfatt" type="date" value="' + _ecfOggi() + '" style="' + box + '"></div>'
      + '</div>';
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
    if (!nFatt) { toast('Inserisci il numero della fattura'); return; }
  }
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; }

  try {
    var fatturaId = S.fatturaId;
    if (S.tipo === 'nuova') {
      var ins = await sb.from('fatture_ricevute').insert([{
        fornitore_id: _ecfSel.id,
        fornitore_nome: _ecfSel.nome,
        numero_fattura: nFatt,
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
            + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:8px">'
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
