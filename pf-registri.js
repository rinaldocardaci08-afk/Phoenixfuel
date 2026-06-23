// PhoenixFuel — Registri di carico e scarico (prodotti energetici)
// v20260623a — PUNTO 1: tab "Deposito → 📚 Registri", SOLA LETTURA.
// ─────────────────────────────────────────────────────────────────────────────
// Cosa fa:
//   - Si auto-inietta il tab "📚 Registri" + il pannello dentro #s-deposito,
//     SENZA modificare index.html né la funzione switchDepositoTab.
//   - Legge la vista v_registro_carico_scarico (carichi/scarichi + giacenza
//     progressiva per prodotto/anno) e la tabella registro_apertura (giacenza
//     iniziale per prodotto/anno).
//   - NON scrive nulla sul database (rischio nullo).
// Regole costituzionali rispettate:
//   - Date sempre GG/MM/AAAA (toLocaleDateString it-IT con T12:00:00 → niente
//     shift UTC).
//   - Navigazione temporale: select anno + frecce ◀ ▶.
//   - Pannelli movibili ▲▼ via _wrapPanel (chiave localStorage:
//     pf-panel-order-registri).
//   - Tab interno a Deposito (permesso a livello sezione, come gli altri
//     sotto-tab Giacenze/Movimenti/Ricezione DAS).
// ─────────────────────────────────────────────────────────────────────────────

var _pfRegState = { prodotto: 'Gasolio Autotrazione', anno: (new Date()).getFullYear() };
var _PF_REG_PRODOTTI = ['Gasolio Autotrazione', 'Gasolio Agricolo', 'Benzina'];

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

    // Registra l'ordine dei pannelli movibili per questa sezione
    if (typeof _PANEL_ORDERS_DEFAULT !== 'undefined') {
      _PANEL_ORDERS_DEFAULT['registri'] = ['reg-riepilogo', 'reg-tabella'];
    }
    if (typeof _PANEL_REFRESH_FN !== 'undefined') {
      _PANEL_REFRESH_FN['registri'] = function () { _pfRegRenderPanels(); };
    }
  } catch (e) { console.error('pfRegInit', e); }
}

// ── Entry point: header + caricamento dati ─────────────────────────────
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

function _pfRegSetProdotto(p) { _pfRegState.prodotto = p; pfRegCarica(); }
function _pfRegSetAnno(y) { y = Number(y); if (!y || y < 2000) return; _pfRegState.anno = y; pfRegCarica(); }

// ── Caricamento dati e render pannelli ─────────────────────────────────
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
    // Giacenza iniziale (apertura) — niente maybeSingle per compatibilità versioni
    var apRes = await sb.from('registro_apertura').select('*')
      .eq('anno', anno).eq('prodotto', prod).limit(1);
    if (apRes.error) throw apRes.error;
    var apertura = (apRes.data && apRes.data.length) ? apRes.data[0] : null;

    // Righe registro dalla vista
    var rowsRes = await sb.from('v_registro_carico_scarico').select('*')
      .eq('prodotto', prod).eq('anno', anno)
      .order('data', { ascending: true })
      .order('numero_progressivo', { ascending: true })
      .limit(10000);
    if (rowsRes.error) throw rowsRes.error;

    _pfRegBuild(body, rowsRes.data || [], apertura, prod, anno);
  } catch (e) {
    console.error('registro', e);
    body.innerHTML = '<div style="padding:16px;color:#A32D2D">Errore nel caricamento del registro: '
      + (e && e.message ? e.message : e) + '</div>';
  }
}

function _pfRegBuild(body, rows, apertura, prod, anno) {
  var open15 = apertura ? Number(apertura.giac_iniziale_15 || 0) : 0;
  var openKg = apertura ? Number(apertura.giac_iniziale_kg || 0) : 0;

  var tC15 = 0, tCkg = 0, tS15 = 0, tSkg = 0;
  rows.forEach(function (r) {
    tC15 += Number(r.car_15 || 0); tCkg += Number(r.car_kg || 0);
    tS15 += Number(r.sca_15 || 0); tSkg += Number(r.sca_kg || 0);
  });
  var fin15 = open15 + tC15 - tS15;
  var finKg = openKg + tCkg - tSkg;

  // Pannello riepilogo (KPI)
  var warn = apertura ? '' :
    '<div style="background:#FFF4E5;border:0.5px solid #E0A040;color:#8A5800;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:10px">'
    + '⚠ Giacenza iniziale ' + anno + ' non impostata per ' + prod + ': i saldi partono da zero. '
    + 'La imposterai dal modulo di apertura (prossimo step).</div>';

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
    + kpi('Totale carico', tC15, tCkg, '#1D7A4D')
    + kpi('Totale scarico', tS15, tSkg, '#A32D2D')
    + kpi('Giacenza finale', fin15, finKg, '#185FA5')
    + '</div></div>';

  // Pannello tabella registro
  var tbl = _pfRegTabella(rows, open15, openKg, tC15, tCkg, tS15, tSkg, fin15, finKg, prod, anno);

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

function _pfRegTabella(rows, open15, openKg, tC15, tCkg, tS15, tSkg, fin15, finKg, prod, anno) {
  function th(t, extra) {
    return '<th style="padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-hint);font-weight:600;' + (extra || '') + '">' + t + '</th>';
  }

  var H = '<div style="overflow-x:auto;border:0.5px solid var(--border);border-radius:10px">';
  H += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:840px">';

  // Intestazione di gruppo
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

  // Riga giacenza iniziale
  H += '<tr><td colspan="8" style="padding:7px 8px;font-style:italic;color:var(--text-hint);border-top:0.5px solid var(--border);font-family:inherit">Giacenza iniziale al 01/01/' + anno + '</td>'
    + '<td style="padding:7px 8px;text-align:right;border-top:0.5px solid var(--border)">' + _pfRegN(open15) + '</td>'
    + '<td style="padding:7px 8px;text-align:right;border-top:0.5px solid var(--border)">' + _pfRegN(openKg) + '</td></tr>';

  if (!rows.length) {
    H += '<tr><td colspan="10" style="padding:16px;text-align:center;color:var(--text-hint);font-family:inherit">Nessun movimento registrato per ' + prod + ' nel ' + anno + '.</td></tr>';
  }

  var n = 0;
  rows.forEach(function (r) {
    n++;
    var isCar = (r.direzione === 'E');
    var g15 = open15 + Number(r.delta_giac_15 || 0);
    var gkg = openKg + Number(r.delta_giac_kg || 0);
    var docRef = r.riferimento ? '<div style="font-size:10px;color:var(--text-hint)">' + r.riferimento + '</div>' : '';
    var ambCar = (isCar && r.car_amb != null) ? '<div style="font-size:10px;color:var(--text-hint)">amb ' + _pfRegN(r.car_amb) + '</div>' : '';
    var ambSca = (!isCar && r.sca_amb != null) ? '<div style="font-size:10px;color:var(--text-hint)">amb ' + _pfRegN(r.sca_amb) + '</div>' : '';
    var zebra = (n % 2 === 0) ? ';background:rgba(0,0,0,0.02)' : '';

    H += '<tr style="border-top:0.5px solid var(--border)' + zebra + '">'
      + '<td style="padding:7px 8px;color:var(--text-hint)">' + n + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + _pfRegData(r.data) + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + (r.tipo_documento || 'e-DAS') + docRef + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + (r.controparte || '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (isCar ? '#1D7A4D' : 'var(--text-hint)') + '">' + (isCar ? _pfRegN(r.car_15) + ambCar : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (isCar ? '#1D7A4D' : 'var(--text-hint)') + '">' + (isCar ? _pfRegN(r.car_kg) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (!isCar ? '#A32D2D' : 'var(--text-hint)') + '">' + (!isCar ? _pfRegN(r.sca_15) + ambSca : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (!isCar ? '#A32D2D' : 'var(--text-hint)') + '">' + (!isCar ? _pfRegN(r.sca_kg) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;font-weight:600">' + _pfRegN(g15) + '</td>'
      + '<td style="padding:7px 8px;text-align:right;font-weight:600">' + _pfRegN(gkg) + '</td></tr>';
  });

  H += '</tbody>';
  H += '<tfoot><tr style="border-top:1px solid var(--border);font-weight:600;font-family:monospace">'
    + '<td colspan="4" style="padding:8px;text-align:right;font-family:inherit;color:var(--text-hint)">Totali ' + anno + '</td>'
    + '<td style="padding:8px;text-align:right;color:#1D7A4D">' + _pfRegN(tC15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#1D7A4D">' + _pfRegN(tCkg) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#A32D2D">' + _pfRegN(tS15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#A32D2D">' + _pfRegN(tSkg) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5">' + _pfRegN(fin15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5">' + _pfRegN(finKg) + '</td></tr></tfoot>';
  H += '</table></div>';
  H += '<div style="margin-top:8px;font-size:10px;color:var(--text-hint)">Giacenza progressiva = iniziale + carichi − scarichi · valori in litri a 15° e kg · l\'eventuale volume ambiente è indicato sotto al dato del movimento.</div>';
  return H;
}

// ── Init ───────────────────────────────────────────────────────────────
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', pfRegInit);
} else {
  pfRegInit();
}
