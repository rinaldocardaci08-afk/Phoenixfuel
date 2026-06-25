// PhoenixFuel — Registri di carico e scarico (prodotti energetici)
// v20260623e — PUNTO 1+2+3: tab "Deposito → 📚 Registri", lettura + apertura editabile.
// ─────────────────────────────────────────────────────────────────────────────
// Cosa fa:
//   - Si auto-inietta il tab "📚 Registri" + il pannello dentro #s-deposito,
//     SENZA modificare index.html né la funzione switchDepositoTab.
//   - Legge la vista v_registro_carico_scarico (carichi/scarichi + giacenza
//     progressiva per prodotto/anno) e registro_apertura (giacenza iniziale).
//   - NON scrive nulla sul database (rischio nullo).
//   - Filtri: tag mesi (Gen…Dic) + periodo libero (dal/al). La giacenza resta
//     progressiva: in un mese/periodo parte dal riporto del periodo precedente.
// Regole costituzionali: date GG/MM/AAAA (T12:00:00, niente shift UTC); input
//   data = picker HTML (ISO interno); pannelli movibili ▲▼ (_wrapPanel, chiave
//   pf-panel-order-registri); navigazione anno con select + ◀▶.
// ─────────────────────────────────────────────────────────────────────────────

var _pfRegState = { prodotto: 'Gasolio Autotrazione', anno: (new Date()).getFullYear(), mese: 0, dal: '', al: '' };
var _PF_REG_PRODOTTI = ['Gasolio Autotrazione', 'Gasolio Agricolo', 'Benzina'];
var _PF_REG_MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
var _PF_REG_MESI_FULL = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
var _pfRegCache = null; // { rows, apertura, prod, anno }

// ── Helper formattazione ───────────────────────────────────────────────
function _pfRegN(n) {
  if (n === null || n === undefined || isNaN(Number(n))) return '—';
  return Math.round(Number(n)).toLocaleString('it-IT');
}
function _pfRegData(d) {
  if (!d) return '—';
  try { return new Date(d + 'T12:00:00').toLocaleDateString('it-IT'); }
  catch (e) { return d; }
}
function _pfRegEsc(t) {
  if (t === null || t === undefined) return '';
  return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// ── Auto-iniezione tab + pannello in Deposito ──────────────────────────
function pfRegInit() {
  try {
    var sec = document.getElementById('s-deposito');
    if (!sec) return;
    if (document.getElementById('dep-registri')) return; // già iniettato

    var anyTab = sec.querySelector('.dep-tab');
    if (!anyTab) return;
    var bar = anyTab.parentNode;

    var btn = document.createElement('button');
    btn.className = 'btn-primary dep-tab';
    btn.setAttribute('data-tab', 'dep-registri');
    btn.style.cssText = 'font-size:12px;padding:8px 14px;background:var(--bg);color:var(--text);border:0.5px solid var(--border)';
    btn.textContent = '📚 Registri';
    btn.addEventListener('click', function () {
      if (typeof switchDepositoTab === 'function') switchDepositoTab(btn);
      pfRegCarica();
    });
    bar.appendChild(btn);

    var panel = document.createElement('div');
    panel.className = 'dep-panel';
    panel.id = 'dep-registri';
    panel.style.display = 'none';
    sec.appendChild(panel);

    if (typeof _PANEL_ORDERS_DEFAULT !== 'undefined') {
      _PANEL_ORDERS_DEFAULT['registri'] = ['reg-apertura', 'reg-riepilogo', 'reg-tabella'];
    }
    if (typeof _PANEL_REFRESH_FN !== 'undefined') {
      _PANEL_REFRESH_FN['registri'] = function () { if (_pfRegCache) _pfRegDraw(); else _pfRegRenderPanels(); };
    }
  } catch (e) { console.error('pfRegInit', e); }
}

// ── Entry point ────────────────────────────────────────────────────────
async function pfRegCarica() {
  var panel = document.getElementById('dep-registri');
  if (!panel) return;
  panel.innerHTML = _pfRegHeaderHtml();
  await _pfRegRenderPanels();
}

// Barra prodotti + navigazione anno
function _pfRegHeaderHtml() {
  var subtabs = _PF_REG_PRODOTTI.map(function (p) {
    var active = (p === _pfRegState.prodotto);
    var st = active
      ? 'background:var(--accent,#D85A30);color:#fff;font-weight:600'
      : 'background:var(--bg);color:var(--text)';
    return '<button onclick="_pfRegSetProdotto(\'' + p.replace(/'/g, "\\'") + '\')" '
      + 'style="font-size:12px;padding:6px 12px;border-radius:6px;cursor:pointer;border:0.5px solid var(--border);' + st + '">'
      + p + '</button>';
  }).join('');

  var ora = (new Date()).getFullYear();
  var maxY = Math.max(ora, 2026);
  var opts = '';
  for (var y = 2026; y <= maxY; y++) {
    opts += '<option value="' + y + '"' + (y === _pfRegState.anno ? ' selected' : '') + '>' + y + '</option>';
  }
  var nav = '<div style="display:flex;align-items:center;gap:6px">'
    + '<button onclick="_pfRegSetAnno(' + (_pfRegState.anno - 1) + ')" title="Anno precedente" style="border:0.5px solid var(--border);background:var(--bg);color:var(--text);border-radius:6px;width:30px;height:30px;cursor:pointer">◀</button>'
    + '<select onchange="_pfRegSetAnno(this.value)" style="font-size:13px;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">' + opts + '</select>'
    + '<button onclick="_pfRegSetAnno(' + (_pfRegState.anno + 1) + ')" title="Anno successivo" style="border:0.5px solid var(--border);background:var(--bg);color:var(--text);border-radius:6px;width:30px;height:30px;cursor:pointer">▶</button>'
    + '</div>';

  return '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:14px">'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + subtabs + '</div>'
    + nav + '</div>'
    + '<div id="reg-body"></div>';
}

// ── Setter prodotto/anno (refetch) e filtri (solo redraw) ──────────────
function _pfRegResetFiltri() { _pfRegState.mese = 0; _pfRegState.dal = ''; _pfRegState.al = ''; }
function _pfRegSetProdotto(p) { _pfRegState.prodotto = p; _pfRegResetFiltri(); _pfRegCache = null; pfRegCarica(); }
function _pfRegSetAnno(y) { y = Number(y); if (!y || y < 2000) return; _pfRegState.anno = y; _pfRegResetFiltri(); _pfRegCache = null; pfRegCarica(); }
function _pfRegSetMese(m) { _pfRegState.mese = Number(m) || 0; _pfRegState.dal = ''; _pfRegState.al = ''; _pfRegDraw(); }
function _pfRegApplicaPeriodo() {
  var d = document.getElementById('reg-dal'), a = document.getElementById('reg-al');
  _pfRegState.dal = (d && d.value) || ''; _pfRegState.al = (a && a.value) || ''; _pfRegState.mese = 0; _pfRegDraw();
}
function _pfRegResetFiltro() { _pfRegResetFiltri(); _pfRegDraw(); }
function _pfRegFiltroAttivo() { return !!(_pfRegState.mese || _pfRegState.dal || _pfRegState.al); }

function _pfRegPredicato() {
  var m = _pfRegState.mese, dal = _pfRegState.dal, al = _pfRegState.al;
  if (dal || al) { return function (r) { return r.data && (!dal || r.data >= dal) && (!al || r.data <= al); }; }
  if (m) { var mm = (m < 10 ? '0' : '') + m; return function (r) { return r.data && r.data.substring(5, 7) === mm; }; }
  return function () { return true; };
}
function _pfRegPeriodStart(anno) {
  if (_pfRegState.dal) return _pfRegState.dal;
  if (_pfRegState.mese) { var mm = (_pfRegState.mese < 10 ? '0' : '') + _pfRegState.mese; return anno + '-' + mm + '-01'; }
  return anno + '-01-01';
}
function _pfRegPeriodLabel(anno) {
  if (_pfRegState.dal || _pfRegState.al) return (_pfRegState.dal ? _pfRegData(_pfRegState.dal) : 'inizio') + ' – ' + (_pfRegState.al ? _pfRegData(_pfRegState.al) : 'oggi');
  if (_pfRegState.mese) return _PF_REG_MESI_FULL[_pfRegState.mese - 1] + ' ' + anno;
  return 'anno ' + anno;
}

// ── Caricamento dati (fetch + cache) ───────────────────────────────────
async function _pfRegRenderPanels() {
  var body = document.getElementById('reg-body');
  if (!body) {
    var panel = document.getElementById('dep-registri');
    if (panel) panel.innerHTML = _pfRegHeaderHtml();
    body = document.getElementById('reg-body');
    if (!body) return;
  }
  body.innerHTML = '<div class="loading">Caricamento registro…</div>';

  var prod = _pfRegState.prodotto, anno = _pfRegState.anno;
  try {
    var apRes = await sb.from('registro_apertura').select('*')
      .eq('anno', anno).eq('prodotto', prod).limit(1);
    if (apRes.error) throw apRes.error;
    var apertura = (apRes.data && apRes.data.length) ? apRes.data[0] : null;

    var rowsRes = await sb.from('v_registro_carico_scarico').select('*')
      .eq('prodotto', prod).eq('anno', anno)
      .order('data', { ascending: true })
      .order('numero_progressivo', { ascending: true })
      .limit(10000);
    if (rowsRes.error) throw rowsRes.error;

    var rows = rowsRes.data || [];
    rows.forEach(function (r, i) { r._n = i + 1; }); // progressivo annuale stabile
    _pfRegCache = { rows: rows, apertura: apertura, prod: prod, anno: anno };
    _pfRegDraw();
  } catch (e) {
    console.error('registro', e);
    body.innerHTML = '<div style="padding:16px;color:#A32D2D">Errore nel caricamento del registro: '
      + (e && e.message ? e.message : e) + '</div>';
  }
}

// ── Render dalla cache (applica filtri, niente refetch) ────────────────
function _pfRegDraw() {
  var c = _pfRegCache; if (!c) return;
  var body = document.getElementById('reg-body'); if (!body) return;
  var rows = c.rows, apertura = c.apertura, prod = c.prod, anno = c.anno;
  var open15 = apertura ? Number(apertura.giac_iniziale_15 || 0) : 0;
  var openKg = apertura ? Number(apertura.giac_iniziale_kg || 0) : 0;

  // Totali annuali (per il riepilogo)
  var aC15 = 0, aCkg = 0, aS15 = 0, aSkg = 0;
  rows.forEach(function (r) { aC15 += Number(r.car_15 || 0); aCkg += Number(r.car_kg || 0); aS15 += Number(r.sca_15 || 0); aSkg += Number(r.sca_kg || 0); });
  var aFin15 = open15 + aC15 - aS15, aFinKg = openKg + aCkg - aSkg;

  // Filtro → righe visibili + riporto a inizio periodo
  var pred = _pfRegPredicato();
  var visible = [], firstIdx = -1;
  rows.forEach(function (r, i) { if (pred(r)) { if (firstIdx < 0) firstIdx = i; visible.push(r); } });

  var pOpen15 = open15, pOpenKg = openKg;
  if (_pfRegFiltroAttivo()) {
    if (firstIdx > 0) {
      var prev = rows[firstIdx - 1];
      pOpen15 = open15 + Number(prev.delta_giac_15 || 0);
      pOpenKg = openKg + Number(prev.delta_giac_kg || 0);
    } else if (firstIdx < 0) {
      // mese/periodo senza movimenti: riporto = giacenza all'ultimo movimento precedente
      var start = _pfRegPeriodStart(anno);
      rows.forEach(function (r) { if (r.data < start) { pOpen15 = open15 + Number(r.delta_giac_15 || 0); pOpenKg = openKg + Number(r.delta_giac_kg || 0); } });
    }
  }

  var pC15 = 0, pCkg = 0, pS15 = 0, pSkg = 0;
  visible.forEach(function (r) { pC15 += Number(r.car_15 || 0); pCkg += Number(r.car_kg || 0); pS15 += Number(r.sca_15 || 0); pSkg += Number(r.sca_kg || 0); });

  // Pannello riepilogo (sempre annuale)
  var warn = apertura ? '' :
    '<div style="background:#FFF4E5;border:0.5px solid #E0A040;color:#8A5800;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:10px">'
    + '⚠ Giacenza iniziale ' + anno + ' non impostata per ' + prod + ': i saldi partono da zero. '
    + 'La imposterai dal pannello apertura (prossimo step).</div>';
  function kpi(label, a, b, col) {
    return '<div style="flex:1;min-width:130px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px">'
      + '<div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px">' + label + '</div>'
      + '<div style="font-size:18px;font-weight:600;color:' + (col || 'var(--text)') + ';font-family:monospace">' + _pfRegN(a) + ' <span style="font-size:11px;color:var(--text-hint)">l@15</span></div>'
      + '<div style="font-size:12px;color:var(--text-hint);font-family:monospace">' + _pfRegN(b) + ' kg</div></div>';
  }
  var riep = '<div style="background:var(--card,var(--bg));border:0.5px solid var(--border);border-radius:10px;padding:14px">'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:10px">Riepilogo ' + prod + ' · ' + anno + '</div>'
    + warn
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + kpi('Giacenza iniziale', open15, openKg)
    + kpi('Totale carico', aC15, aCkg, '#1D7A4D')
    + kpi('Totale scarico', aS15, aSkg, '#A32D2D')
    + kpi('Giacenza finale', aFin15, aFinKg, '#185FA5')
    + '</div></div>';

  // Chiusure mensili (giacenza fine mese) — sempre calcolate dai movimenti
  var now = new Date();
  var maxMonth = (anno < now.getFullYear()) ? 12 : (anno === now.getFullYear() ? (now.getMonth() + 1) : 0);
  var lastDataM = 0;
  rows.forEach(function (r) { if (r.data) { var mm = Number(r.data.substring(5, 7)); if (mm > lastDataM) lastDataM = mm; } });
  if (lastDataM > maxMonth) maxMonth = lastDataM;
  var cl15 = [], clkg = [];
  for (var m = 1; m <= 12; m++) {
    var last = null;
    rows.forEach(function (r) { if (r.data && Number(r.data.substring(5, 7)) <= m) last = r; });
    cl15[m] = last ? open15 + Number(last.delta_giac_15 || 0) : open15;
    clkg[m] = last ? openKg + Number(last.delta_giac_kg || 0) : openKg;
  }
  var apBlock = _pfRegAperturaHtml(open15, openKg, apertura, cl15, clkg, maxMonth, prod, anno);

  // Pannello tabella (filtrata) con barra filtri integrata
  var tbl = _pfRegFiltroHtml() + _pfRegTabella(visible, open15, openKg, pOpen15, pOpenKg, pC15, pCkg, pS15, pSkg, prod, anno);

  var blocks = { 'reg-apertura': apBlock, 'reg-riepilogo': riep, 'reg-tabella': tbl };
  var def = ['reg-apertura', 'reg-riepilogo', 'reg-tabella'];
  var html;
  if (typeof _wrapPanel === 'function' && typeof _getPanelOrder === 'function') {
    var order = _getPanelOrder('registri').slice();
    order = order.filter(function (id) { return def.indexOf(id) >= 0; });          // scarta id sconosciuti
    def.forEach(function (id, i) { if (order.indexOf(id) < 0) order.splice(Math.min(i, order.length), 0, id); }); // reintegra mancanti
    html = order.map(function (id) { return _wrapPanel('registri', id, blocks[id] || ''); }).join('');
  } else {
    html = def.map(function (id) { return '<div style="margin-bottom:14px">' + blocks[id] + '</div>'; }).join('');
  }
  body.innerHTML = html;
}

// Barra filtri: tag mesi + periodo libero
function _pfRegPill(active) {
  return 'font-size:11px;padding:4px 9px;border-radius:6px;cursor:pointer;border:0.5px solid var(--border);'
    + (active ? 'background:var(--accent,#D85A30);color:#fff;font-weight:600' : 'background:var(--bg);color:var(--text)');
}
function _pfRegFiltroHtml() {
  var noFiltro = !_pfRegFiltroAttivo();
  var pills = '<button onclick="_pfRegSetMese(0)" style="' + _pfRegPill(noFiltro) + '">Anno intero</button>';
  for (var i = 1; i <= 12; i++) {
    pills += '<button onclick="_pfRegSetMese(' + i + ')" style="' + _pfRegPill(_pfRegState.mese === i) + '">' + _PF_REG_MESI[i - 1] + '</button>';
  }
  var azzera = _pfRegFiltroAttivo()
    ? '<button onclick="_pfRegResetFiltro()" style="font-size:11px;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer">✕ azzera</button>'
    : '';
  var periodo = '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">'
    + '<span style="font-size:10px;color:var(--text-hint)">periodo</span>'
    + '<input type="date" id="reg-dal" value="' + (_pfRegState.dal || '') + '" style="font-size:11px;padding:4px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
    + '<span style="font-size:10px;color:var(--text-hint)">→</span>'
    + '<input type="date" id="reg-al" value="' + (_pfRegState.al || '') + '" style="font-size:11px;padding:4px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
    + '<button onclick="_pfRegApplicaPeriodo()" style="font-size:11px;padding:4px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--accent,#D85A30);color:#fff;cursor:pointer">Applica</button>'
    + azzera + '</div>';
  // Riga 1: tag mesi (con padding-right per non finire sotto le freccette ▲▼ di _wrapPanel a top:6px/right:8px)
  // Riga 2: periodo libero + azzera, su riga propria → nessuna sovrapposizione con i pulsanti di mobilità
  return '<div style="margin-bottom:10px">'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap;padding-right:62px;margin-bottom:8px">' + pills + '</div>'
    + '<div style="display:flex;justify-content:flex-end">' + periodo + '</div>'
    + '</div>';
}

function _pfRegTabella(rows, open15, openKg, pOpen15, pOpenKg, pC15, pCkg, pS15, pSkg, prod, anno) {
  var filtrato = _pfRegFiltroAttivo();
  var pClose15 = pOpen15 + pC15 - pS15;
  var pCloseKg = pOpenKg + pCkg - pSkg;
  var etPeriodo = _pfRegPeriodLabel(anno);

  function th(t, extra) {
    return '<th style="padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-hint);font-weight:600;' + (extra || '') + '">' + t + '</th>';
  }

  var H = '<div style="overflow-x:auto;border:0.5px solid var(--border);border-radius:10px">';
  H += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:840px">';

  H += '<thead><tr>'
    + '<th colspan="4" style="text-align:left;padding:6px 8px;font-size:10px;color:var(--text-hint);text-transform:uppercase">Movimento</th>'
    + '<th colspan="2" style="padding:6px 8px;font-size:10px;text-transform:uppercase;color:#1D7A4D;background:#EAF3DE">Carico (entrata)</th>'
    + '<th colspan="2" style="padding:6px 8px;font-size:10px;text-transform:uppercase;color:#A32D2D;background:#FAECE7">Scarico (uscita)</th>'
    + '<th colspan="2" style="padding:6px 8px;font-size:10px;text-transform:uppercase;color:#185FA5;background:#E6F1FB">Giacenza</th></tr>';
  H += '<tr>'
    + th('N.') + th('Data') + th('Documento') + th('Controparte')
    + th('l@15', 'text-align:right;background:#F4FAEC') + th('kg', 'text-align:right;background:#F4FAEC')
    + th('l@15', 'text-align:right;background:#FBF3EF') + th('kg', 'text-align:right;background:#FBF3EF')
    + th('l@15', 'text-align:right;background:#F0F6FC') + th('kg', 'text-align:right;background:#F0F6FC')
    + '</tr></thead><tbody style="font-family:monospace">';

  // Riga riporto / giacenza iniziale
  var etRiporto = filtrato ? ('Riporto a inizio periodo (' + etPeriodo + ')') : ('Giacenza iniziale al 01/01/' + anno);
  H += '<tr><td colspan="8" style="padding:7px 8px;font-style:italic;color:var(--text-hint);border-top:0.5px solid var(--border);font-family:inherit">' + etRiporto + '</td>'
    + '<td style="padding:7px 8px;text-align:right;border-top:0.5px solid var(--border)">' + _pfRegN(pOpen15) + '</td>'
    + '<td style="padding:7px 8px;text-align:right;border-top:0.5px solid var(--border)">' + _pfRegN(pOpenKg) + '</td></tr>';

  if (!rows.length) {
    H += '<tr><td colspan="10" style="padding:16px;text-align:center;color:var(--text-hint);font-family:inherit">Nessun movimento ' + (filtrato ? 'nel periodo selezionato' : 'per ' + prod + ' nel ' + anno) + '.</td></tr>';
  }

  rows.forEach(function (r) {
    var isCar = (r.direzione === 'E');
    var g15 = open15 + Number(r.delta_giac_15 || 0);
    var gkg = openKg + Number(r.delta_giac_kg || 0);
    var docRef = r.riferimento ? '<div style="font-size:10px;color:var(--text-hint)">' + _pfRegEsc(r.riferimento) + '</div>' : '';
    var dett = (r.controparte_dettaglio && r.controparte_dettaglio !== r.controparte)
      ? '<div style="font-size:10px;color:#639922;margin-top:2px">📍 ' + _pfRegEsc(r.controparte_dettaglio) + '</div>' : '';
    var ambCar = (isCar && r.car_amb != null) ? '<div style="font-size:10px;color:var(--text-hint)">amb ' + _pfRegN(r.car_amb) + '</div>' : '';
    var ambSca = (!isCar && r.sca_amb != null) ? '<div style="font-size:10px;color:var(--text-hint)">amb ' + _pfRegN(r.sca_amb) + '</div>' : '';

    H += '<tr style="border-top:0.5px solid var(--border)">'
      + '<td style="padding:7px 8px;color:var(--text-hint)">' + r._n + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + _pfRegData(r.data) + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + _pfRegEsc(r.tipo_documento || 'e-DAS') + docRef + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + (r.controparte ? _pfRegEsc(r.controparte) : '—') + dett + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (isCar ? '#1D7A4D' : 'var(--text-hint)') + '">' + (isCar ? _pfRegN(r.car_15) + ambCar : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (isCar ? '#1D7A4D' : 'var(--text-hint)') + '">' + (isCar ? _pfRegN(r.car_kg) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (!isCar ? '#A32D2D' : 'var(--text-hint)') + '">' + (!isCar ? _pfRegN(r.sca_15) + ambSca : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (!isCar ? '#A32D2D' : 'var(--text-hint)') + '">' + (!isCar ? _pfRegN(r.sca_kg) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;font-weight:600">' + _pfRegN(g15) + '</td>'
      + '<td style="padding:7px 8px;text-align:right;font-weight:600">' + _pfRegN(gkg) + '</td></tr>';
  });

  H += '</tbody>';
  var etTot = filtrato ? ('Totali ' + etPeriodo) : ('Totali ' + anno);
  H += '<tfoot><tr style="border-top:1px solid var(--border);font-weight:600;font-family:monospace">'
    + '<td colspan="4" style="padding:8px;text-align:right;font-family:inherit;color:var(--text-hint)">' + etTot + '</td>'
    + '<td style="padding:8px;text-align:right;color:#1D7A4D">' + _pfRegN(pC15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#1D7A4D">' + _pfRegN(pCkg) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#A32D2D">' + _pfRegN(pS15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#A32D2D">' + _pfRegN(pSkg) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5">' + _pfRegN(pClose15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5">' + _pfRegN(pCloseKg) + '</td></tr></tfoot>';
  H += '</table></div>';
  H += '<div style="margin-top:8px;font-size:10px;color:var(--text-hint)">Giacenza progressiva = riporto + carichi − scarichi · litri a 15° e kg · il volume ambiente è indicato sotto al dato del movimento.</div>';
  return H;
}

// ── Modal modifica apertura (UNICA scrittura su DB) ────────────────────
var _pfRegApDef = { 'Gasolio Autotrazione': 835, 'Gasolio Agricolo': 835, 'Benzina': 750 };
var _pfRegAp = null;

function _pfRegApDensFmt(d) { if (d === '' || d == null) return ''; return String(d).replace('.', ','); }
function _pfRegApParse(v) {
  if (v == null) return '';
  v = String(v).trim(); if (!v) return '';
  v = v.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  var n = Number(v); return isNaN(n) ? '' : n;
}

function _pfRegModificaApertura() {
  var prod = _pfRegState.prodotto, anno = _pfRegState.anno;
  var ap = (_pfRegCache && _pfRegCache.apertura && _pfRegCache.prod === prod && _pfRegCache.anno === anno) ? _pfRegCache.apertura : null;
  var densEdit = (ap && Number(ap.giac_iniziale_15) > 0 && Number(ap.giac_iniziale_kg) > 0)
    ? Math.round(Number(ap.giac_iniziale_kg) / Number(ap.giac_iniziale_15) * 1000 * 100) / 100 : null;
  _pfRegAp = {
    prod: prod, anno: anno, mode: 'l15',
    dens: (densEdit != null) ? densEdit : (_pfRegApDef[prod] || 835),
    densSugg: !ap,
    l15: ap ? Number(ap.giac_iniziale_15) : '',
    kg: ap ? Number(ap.giac_iniziale_kg) : '',
    rif: (ap && ap.rif_documento) ? ap.rif_documento : '',
    data: (ap && ap.data_apertura) ? ap.data_apertura : (anno + '-01-01')
  };
  var ex = document.getElementById('reg-ap-overlay'); if (ex) ex.remove();
  var div = document.createElement('div');
  div.id = 'reg-ap-overlay';
  div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1006;display:flex;align-items:center;justify-content:center;padding:16px';
  div.innerHTML = '<div style="background:var(--bg-card,var(--bg));width:100%;max-width:560px;max-height:92vh;overflow:auto;border-radius:12px;box-shadow:0 10px 40px rgba(0,0,0,0.3)"><div id="reg-ap-body" style="padding:22px"></div></div>';
  div.addEventListener('click', function (e) { if (e.target === div) _pfRegApChiudi(); });
  document.body.appendChild(div);
  _pfRegApRender();
}

function _pfRegApChiudi() { var ex = document.getElementById('reg-ap-overlay'); if (ex) ex.remove(); _pfRegAp = null; }
function _pfRegApSetMode(m) { if (_pfRegAp) { _pfRegAp.mode = m; _pfRegApRender(); } }
function _pfRegApUpdDerived() {
  var el = document.getElementById('reg-ap-derived');
  if (el && _pfRegAp) el.textContent = _pfRegN(_pfRegAp.mode === 'l15' ? _pfRegAp.kg : _pfRegAp.l15);
}
function _pfRegApOnInput(v) {
  if (!_pfRegAp) return;
  var n = _pfRegApParse(v);
  if (_pfRegAp.mode === 'l15') { _pfRegAp.l15 = n; _pfRegAp.kg = (n !== '' && _pfRegAp.dens > 0) ? Math.round(n * _pfRegAp.dens / 1000) : ''; }
  else { _pfRegAp.kg = n; _pfRegAp.l15 = (n !== '' && _pfRegAp.dens > 0) ? Math.round(n * 1000 / _pfRegAp.dens) : ''; }
  _pfRegApUpdDerived();
}
function _pfRegApOnDens(v) {
  if (!_pfRegAp) return;
  _pfRegAp.dens = _pfRegApParse(v); _pfRegAp.densSugg = false;
  if (_pfRegAp.mode === 'l15') { _pfRegAp.kg = (_pfRegAp.l15 !== '' && _pfRegAp.dens > 0) ? Math.round(_pfRegAp.l15 * _pfRegAp.dens / 1000) : ''; }
  else { _pfRegAp.l15 = (_pfRegAp.kg !== '' && _pfRegAp.dens > 0) ? Math.round(_pfRegAp.kg * 1000 / _pfRegAp.dens) : ''; }
  _pfRegApUpdDerived();
  var el = document.getElementById('reg-ap-dens'); if (el) { el.style.color = 'var(--text)'; el.style.fontStyle = 'normal'; }
}

function _pfRegApRender() {
  var body = document.getElementById('reg-ap-body'); if (!body || !_pfRegAp) return;
  var S = _pfRegAp;
  var primVal = S.mode === 'l15' ? S.l15 : S.kg;
  var derVal = S.mode === 'l15' ? S.kg : S.l15;
  var primLabel = S.mode === 'l15' ? 'litri @15' : 'kg';
  var derLabel = S.mode === 'l15' ? 'kg (calcolato)' : 'litri @15 (calcolato)';
  var densStyle = S.densSugg ? 'color:var(--text-hint);font-style:italic' : 'color:var(--text);font-style:normal';

  var h = '';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:14px">';
  h += '<div><div style="font-size:17px;font-weight:700">Giacenza iniziale ' + S.anno + '</div>';
  h += '<div style="font-size:12px;color:var(--text-muted,var(--text-hint))">' + _pfRegEsc(S.prod) + ' · dal documento di chiusura Dogane</div></div>';
  h += '<button onclick="_pfRegApChiudi()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted,var(--text-hint));line-height:1;padding:2px 8px">×</button></div>';

  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:14px"><span style="font-size:11px;color:var(--text-hint)">inserisco in:</span>';
  h += '<button onclick="_pfRegApSetMode(\'l15\')" style="' + _pfRegPill(S.mode === 'l15') + '">litri @15</button>';
  h += '<button onclick="_pfRegApSetMode(\'kg\')" style="' + _pfRegPill(S.mode === 'kg') + '">kg</button></div>';

  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:flex-end;margin-bottom:6px">';
  h += '<div style="flex:1;min-width:120px"><div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">' + primLabel + ' · inserito</div>';
  h += '<input id="reg-ap-primary" type="text" inputmode="numeric" value="' + (primVal === '' ? '' : Math.round(primVal)) + '" oninput="_pfRegApOnInput(this.value)" style="width:100%;box-sizing:border-box;border:1px solid var(--accent,#D85A30);border-radius:8px;padding:9px 10px;font-family:monospace;font-size:15px;background:var(--bg);color:var(--text)"></div>';
  h += '<div style="font-size:18px;color:var(--text-hint);padding-bottom:9px">→</div>';
  h += '<div style="flex:1;min-width:120px"><div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">' + derLabel + '</div>';
  h += '<div id="reg-ap-derived" style="border:0.5px dashed var(--border);border-radius:8px;padding:9px 10px;font-family:monospace;font-size:15px;color:var(--text-hint);background:var(--bg)">' + _pfRegN(derVal) + '</div></div>';
  h += '<div style="flex:1;min-width:100px"><div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">densità 15°</div>';
  h += '<input id="reg-ap-dens" type="text" inputmode="decimal" value="' + _pfRegApDensFmt(S.dens) + '" oninput="_pfRegApOnDens(this.value)" style="width:100%;box-sizing:border-box;border:1px solid var(--border);border-radius:8px;padding:9px 10px;font-family:monospace;font-size:15px;background:var(--bg);' + densStyle + '"></div>';
  h += '</div>';

  h += '<div style="font-size:11px;color:var(--text-hint);margin-bottom:14px">' + (S.densSugg ? '💡 densità suggerita per il prodotto — sostituiscila col valore del documento · ' : '') + 'kg = litri@15 × densità / 1000</div>';

  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:18px">';
  h += '<div style="flex:2;min-width:160px"><div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">riferimento documento Dogane</div>';
  h += '<input id="reg-ap-rif" type="text" value="' + _pfRegEsc(S.rif) + '" oninput="_pfRegAp.rif=this.value" placeholder="es. Reg. chiusura 2025 n. ..." style="width:100%;box-sizing:border-box;border:0.5px solid var(--border);border-radius:8px;padding:9px 10px;font-size:13px;background:var(--bg);color:var(--text)"></div>';
  h += '<div style="flex:1;min-width:130px"><div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px;margin-bottom:4px">data apertura</div>';
  h += '<input id="reg-ap-data" type="date" value="' + (S.data || '') + '" onchange="_pfRegAp.data=this.value" style="width:100%;box-sizing:border-box;border:0.5px solid var(--border);border-radius:8px;padding:8px 10px;font-size:13px;background:var(--bg);color:var(--text)"></div>';
  h += '</div>';

  h += '<div style="display:flex;justify-content:flex-end;gap:10px">';
  h += '<button onclick="_pfRegApChiudi()" style="padding:9px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-size:13px">Annulla</button>';
  h += '<button id="reg-ap-salva" onclick="_pfRegApSalva()" style="padding:9px 20px;border:none;border-radius:8px;background:var(--accent,#D85A30);color:#fff;cursor:pointer;font-size:13px;font-weight:500">Salva apertura</button>';
  h += '</div>';
  body.innerHTML = h;
}

async function _pfRegApSalva() {
  var S = _pfRegAp; if (!S) return;
  var l15 = Number(S.l15), kg = Number(S.kg);
  if (!(l15 > 0) || !(kg > 0)) {
    if (typeof toast === 'function') toast('Inserisci un valore valido: litri@15 e kg devono essere maggiori di zero');
    else alert('Valore non valido: litri@15 e kg devono essere > 0');
    return;
  }
  var payload = {
    anno: S.anno, prodotto: S.prod,
    giac_iniziale_15: Math.round(l15),
    giac_iniziale_kg: Math.round(kg),
    giac_iniziale_amb: null,
    data_apertura: S.data || (S.anno + '-01-01'),
    rif_documento: S.rif || null
  };
  var btn = document.getElementById('reg-ap-salva');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; }
  try {
    var res = await sb.from('registro_apertura').upsert(payload, { onConflict: 'anno,prodotto' }).select();
    if (res.error) throw res.error;
    if (typeof toast === 'function') toast('✓ Giacenza iniziale salvata');
    _pfRegApChiudi();
    _pfRegCache = null;
    pfRegCarica();
  } catch (e) {
    console.error('salva apertura', e);
    if (btn) { btn.disabled = false; btn.textContent = 'Salva apertura'; }
    alert('Errore nel salvataggio: ' + (e && e.message ? e.message : e));
  }
}

// ── Pannello Apertura & chiusure (sola lettura) ────────────────────────
function _pfRegAperturaHtml(open15, openKg, apertura, cl15, clkg, maxMonth, prod, anno) {
  var dens = (apertura && Number(apertura.giac_iniziale_15) > 0 && Number(apertura.giac_iniziale_kg) > 0)
    ? (Number(apertura.giac_iniziale_kg) / Number(apertura.giac_iniziale_15) * 1000) : null;
  var densTxt = (dens != null) ? dens.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '—';

  var btn = '<button onclick="_pfRegModificaApertura()" style="font-size:12px;padding:7px 14px;border-radius:6px;border:0.5px solid var(--border);background:var(--accent,#D85A30);color:#fff;cursor:pointer">✏️ Modifica apertura</button>';

  var head = '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap;padding-right:62px;margin-bottom:10px">'
    + '<div style="font-size:14px;font-weight:600">📋 Apertura &amp; chiusure — ' + prod + ' · ' + anno + '</div>'
    + btn + '</div>';

  var box = function (label, val, sub, col) {
    return '<div style="flex:1;min-width:120px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:8px 10px">'
      + '<div style="font-size:9px;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px">' + label + '</div>'
      + '<div style="font-size:15px;font-weight:600;font-family:monospace;color:' + (col || 'var(--text)') + '">' + val + (sub ? ' <span style="font-size:10px;color:var(--text-hint)">' + sub + '</span>' : '') + '</div></div>';
  };

  var apRow;
  if (apertura) {
    apRow = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
      + box('Giacenza iniziale', _pfRegN(open15), 'l@15', '#185FA5')
      + box('In massa', _pfRegN(openKg), 'kg')
      + box('Densità 15°', densTxt, 'kg/mc')
      + box('Rif. Dogane', apertura.rif_documento ? _pfRegEsc(apertura.rif_documento) : '—', '')
      + box('Data', apertura.data_apertura ? _pfRegData(apertura.data_apertura) : '—', '')
      + '</div>';
  } else {
    apRow = '<div style="background:#FFF4E5;border:0.5px solid #E0A040;color:#8A5800;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:12px">'
      + '⚠ Giacenza iniziale non impostata: i saldi del registro partono da zero. Usa “Modifica apertura” per inserirla dal documento di chiusura Dogane.</div>';
  }

  // Striscia chiusure mensili — sempre visibile
  var thM = '';
  for (var i = 0; i < 12; i++) {
    var corr = (i + 1 === maxMonth);
    thM += '<th style="padding:6px 8px;text-align:right;font-weight:500;font-size:10px;text-transform:uppercase;' + (corr ? 'color:var(--accent,#D85A30)' : 'color:var(--text-hint)') + '">' + _PF_REG_MESI[i] + '</th>';
  }
  var row15 = '', rowKg = '';
  for (var m = 1; m <= 12; m++) {
    var attivo = (m <= maxMonth);
    row15 += '<td style="padding:6px 8px;text-align:right;' + (attivo ? '' : 'opacity:.35') + (m === maxMonth ? ';font-weight:700;color:#185FA5' : '') + '">' + (attivo ? _pfRegN(cl15[m]) : '—') + '</td>';
    rowKg += '<td style="padding:6px 8px;text-align:right;color:var(--text-secondary,var(--text-hint));' + (attivo ? '' : 'opacity:.35') + (m === maxMonth ? ';font-weight:700' : '') + '">' + (attivo ? _pfRegN(clkg[m]) : '—') + '</td>';
  }
  var strip = '<div style="font-size:11px;color:var(--text-hint);margin-bottom:6px">Giacenza a fine mese (calcolata dai movimenti)</div>'
    + '<div style="overflow-x:auto;border:0.5px solid var(--border);border-radius:8px">'
    + '<table style="width:100%;border-collapse:collapse;font-size:11px;min-width:640px;font-family:monospace">'
    + '<thead><tr><th style="padding:6px 8px;text-align:left;font-weight:500;font-size:10px;text-transform:uppercase;color:var(--text-hint);font-family:var(--font-sans,sans-serif);min-width:90px"></th>' + thM + '</tr></thead>'
    + '<tbody>'
    + '<tr style="background:#F0F6FC"><td style="padding:6px 8px;font-family:var(--font-sans,sans-serif);color:#0C447C;font-size:11px">l@15</td>' + row15 + '</tr>'
    + '<tr><td style="padding:6px 8px;font-family:var(--font-sans,sans-serif);color:var(--text-secondary,var(--text-hint));font-size:11px">kg</td>' + rowKg + '</tr>'
    + '</tbody></table></div>'
    + '<div style="margin-top:6px;font-size:10px;color:var(--text-hint)">La chiusura di dicembre diventa l\'apertura dell\'anno successivo.</div>';

  return '<div style="background:var(--card,var(--bg));border:0.5px solid var(--border);border-radius:10px;padding:14px">'
    + head + apRow + strip + '</div>';
}

// ── Init ───────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pfRegInit);
} else {
  pfRegInit();
}
