// PhoenixFuel — Registri di carico e scarico (prodotti energetici)
// v20260623c — PUNTO 1: tab "Deposito → 📚 Registri", SOLA LETTURA.
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
      _PANEL_ORDERS_DEFAULT['registri'] = ['reg-riepilogo', 'reg-tabella'];
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

  // Pannello tabella (filtrata) con barra filtri integrata
  var tbl = _pfRegFiltroHtml() + _pfRegTabella(visible, open15, openKg, pOpen15, pOpenKg, pC15, pCkg, pS15, pSkg, prod, anno);

  var html;
  if (typeof _wrapPanel === 'function' && typeof _getPanelOrder === 'function') {
    var order = _getPanelOrder('registri');
    var blocks = { 'reg-riepilogo': riep, 'reg-tabella': tbl };
    html = order.map(function (id) { return _wrapPanel('registri', id, blocks[id] || ''); }).join('');
  } else {
    html = '<div style="margin-bottom:14px">' + riep + '</div>' + tbl;
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
  return '<div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:center;margin-bottom:10px">'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap">' + pills + '</div>' + periodo + '</div>';
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

// ── Init ───────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pfRegInit);
} else {
  pfRegInit();
}
