// PhoenixFuel — Registro di carico e scarico (prodotti energetici)
// v20260626a — registro kg+l@15+l amb, cruscotto calo 3‰, REPORT PERIODO (totali + tolleranza rettifiche).
// ─────────────────────────────────────────────────────────────────────────────
// FONTE UNICA: vista v_registro_movimenti (tabella registro_movimenti).
//   Dato fiscale = KG. litri@15 e litri amb sono colonne di servizio.
//   La giacenza progressiva è in KG, ordinata per "seq" (ordine di stampa del
//   registro depositato): combacia al kg col vidimato.
//   L'apertura è la prima riga (is_apertura=true), già dentro la vista.
// SOLA LETTURA: il modulo non scrive nulla (rischio nullo). I dati entrano via
//   import (storico) o, dal 26/06, via DAS generati in PhoenixFuel.
// ─────────────────────────────────────────────────────────────────────────────

var _pfRegState = { prodotto: 'Gasolio Autotrazione', anno: 2026, mese: 0, dal: '', al: '' };
var _PF_REG_PRODOTTI = ['Gasolio Autotrazione', 'Gasolio Agricolo', 'Benzina'];
var _PF_REG_MESI = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic'];
var _PF_REG_MESI_FULL = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
var _pfRegCache = null;

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

function pfRegInit() {
  try {
    var sec = document.getElementById('s-deposito');
    if (!sec) return;
    if (document.getElementById('dep-registri')) return;
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

async function pfRegCarica() {
  var panel = document.getElementById('dep-registri');
  if (!panel) return;
  panel.innerHTML = _pfRegHeaderHtml();
  await _pfRegRenderPanels();
}

function _pfRegHeaderHtml() {
  var subtabs = _PF_REG_PRODOTTI.map(function (p) {
    var active = (p === _pfRegState.prodotto);
    var st = active ? 'background:var(--accent,#D85A30);color:#fff;font-weight:600' : 'background:var(--bg);color:var(--text)';
    return '<button onclick="_pfRegSetProdotto(\'' + p.replace(/'/g, "\\'") + '\')" style="font-size:12px;padding:6px 12px;border-radius:6px;cursor:pointer;border:0.5px solid var(--border);' + st + '">' + p + '</button>';
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
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">' + subtabs + '</div>' + nav + '</div>'
    + '<div id="reg-body"></div>';
}

function _pfRegResetFiltri() { _pfRegState.mese = 0; _pfRegState.dal = ''; _pfRegState.al = ''; }
function _pfRegSetProdotto(p) { _pfRegState.prodotto = p; _pfRegResetFiltri(); _pfRegCache = null; pfRegCarica(); }
function _pfRegSetAnno(y) { y = Number(y); if (!y || y < 2000) return; _pfRegState.anno = y; _pfRegResetFiltri(); _pfRegCache = null; pfRegCarica(); }
function _pfRegSetMese(m) { _pfRegState.mese = Number(m) || 0; _pfRegState.dal = ''; _pfRegState.al = ''; _pfRegDraw(); }
function _pfRegApplicaPeriodo() {
  var dal = document.getElementById('reg-dal'), al = document.getElementById('reg-al');
  _pfRegState.dal = dal ? dal.value : ''; _pfRegState.al = al ? al.value : ''; _pfRegState.mese = 0; _pfRegDraw();
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
    var rows = [];
    var page = 0, size = 1000;
    while (true) {
      var res = await sb.from('v_registro_movimenti').select('*')
        .eq('prodotto', prod).eq('anno', anno)
        .order('data', { ascending: true })
        .order('seq', { ascending: true })
        .range(page * size, page * size + size - 1);
      if (res.error) throw res.error;
      var batch = res.data || [];
      rows = rows.concat(batch);
      if (batch.length < size) break;
      page++;
      if (page > 50) break;
    }
    var apertura = null, movimenti = [];
    rows.forEach(function (r) { if (r.is_apertura) apertura = r; else movimenti.push(r); });
    movimenti.forEach(function (r, i) { r._n = i + 1; });

    // Giacenza fisica del deposito per il prodotto (somma cisterne, litri ambiente).
    // Solo per l'anno corrente (il confronto ha senso sul saldo attuale).
    var giacFisica = null;
    try {
      var cisRes = await sb.from('cisterne').select('livello_attuale').eq('sede', 'deposito_vibo').eq('prodotto', prod);
      if (cisRes.data && cisRes.data.length) {
        giacFisica = cisRes.data.reduce(function (s, c) { return s + Number(c.livello_attuale || 0); }, 0);
      }
    } catch (eCis) { /* niente cruscotto se non leggibile */ }

    _pfRegCache = { rows: movimenti, apertura: apertura, prod: prod, anno: anno, giacFisica: giacFisica };
    _pfRegDraw();
  } catch (e) {
    console.error('registro', e);
    body.innerHTML = '<div style="padding:16px;color:#A32D2D">Errore nel caricamento del registro: ' + (e && e.message ? e.message : e) + '</div>';
  }
}

function _pfRegDraw() {
  var c = _pfRegCache; if (!c) return;
  var body = document.getElementById('reg-body'); if (!body) return;
  var rows = c.rows, apertura = c.apertura, prod = c.prod, anno = c.anno;
  var openKg = apertura ? Number(apertura.giac_kg || 0) : 0;
  var open15 = apertura ? Number(apertura.giac_lt15 || 0) : 0;
  var openAmb = apertura ? Number(apertura.giac_ltamb || 0) : 0;

  var aCkg = 0, aC15 = 0, aSkg = 0, aS15 = 0, aCamb = 0, aSamb = 0;
  rows.forEach(function (r) {
    aCkg += Number(r.car_kg || 0); aC15 += Number(r.car_lt15 || 0); aCamb += Number(r.car_ltamb || 0);
    aSkg += Number(r.sca_kg || 0); aS15 += Number(r.sca_lt15 || 0); aSamb += Number(r.sca_ltamb || 0);
  });
  var aFinKg = rows.length ? Number(rows[rows.length - 1].giac_kg || 0) : openKg;
  var aFin15 = rows.length ? Number(rows[rows.length - 1].giac_lt15 || 0) : open15;
  var aFinAmb = rows.length ? Number(rows[rows.length - 1].giac_ltamb || 0) : openAmb;

  var pred = _pfRegPredicato();
  var visible = [], firstIdx = -1;
  rows.forEach(function (r, i) { if (pred(r)) { if (firstIdx < 0) firstIdx = i; visible.push(r); } });

  var pOpenKg = openKg, pOpen15 = open15, pOpenAmb = openAmb;
  if (_pfRegFiltroAttivo()) {
    if (firstIdx > 0) {
      var prev = rows[firstIdx - 1];
      pOpenKg = Number(prev.giac_kg || 0); pOpen15 = Number(prev.giac_lt15 || 0); pOpenAmb = Number(prev.giac_ltamb || 0);
    } else if (firstIdx < 0) {
      var start = _pfRegPeriodStart(anno);
      rows.forEach(function (r) { if (r.data < start) { pOpenKg = Number(r.giac_kg || 0); pOpen15 = Number(r.giac_lt15 || 0); pOpenAmb = Number(r.giac_ltamb || 0); } });
    }
  }

  var pCkg = 0, pC15 = 0, pSkg = 0, pS15 = 0, pCamb = 0, pSamb = 0;
  visible.forEach(function (r) {
    pCkg += Number(r.car_kg || 0); pC15 += Number(r.car_lt15 || 0); pCamb += Number(r.car_ltamb || 0);
    pSkg += Number(r.sca_kg || 0); pS15 += Number(r.sca_lt15 || 0); pSamb += Number(r.sca_ltamb || 0);
  });

  var warn = apertura ? '' :
    '<div style="background:#FFF4E5;border:0.5px solid #E0A040;color:#8A5800;padding:8px 12px;border-radius:8px;font-size:12px;margin-bottom:10px">'
    + '⚠ Nessuna giacenza iniziale per ' + _pfRegEsc(prod) + ' nel ' + anno + ': i saldi partono da zero.</div>';
  function kpi(label, kg, l15, col, lamb) {
    return '<div style="flex:1;min-width:130px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px">'
      + '<div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;letter-spacing:.4px">' + label + '</div>'
      + '<div style="font-size:18px;font-weight:600;color:' + (col || 'var(--text)') + ';font-family:monospace">' + _pfRegN(kg) + ' <span style="font-size:11px;color:var(--text-hint)">kg</span></div>'
      + '<div style="font-size:12px;color:var(--text-hint);font-family:monospace">' + _pfRegN(l15) + ' l@15</div>'
      + '<div style="font-size:12px;color:var(--text-hint);font-family:monospace">' + _pfRegN(lamb) + ' l amb</div></div>';
  }
  var riep = '<div style="background:var(--card,var(--bg));border:0.5px solid var(--border);border-radius:10px;padding:14px">'
    + '<div style="font-size:14px;font-weight:600;margin-bottom:4px">Riepilogo ' + _pfRegEsc(prod) + ' · ' + anno + '</div>'
    + '<div style="font-size:11px;color:var(--text-hint);margin-bottom:10px">registro carburanti denaturati · dato fiscale: <strong>kg</strong></div>'
    + warn
    + '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + kpi('Giacenza iniziale', openKg, open15, null, openAmb)
    + kpi('Totale carico', aCkg, aC15, '#1D7A4D', aCamb)
    + kpi('Totale scarico', aSkg, aS15, '#A32D2D', aSamb)
    + kpi('Giacenza finale', aFinKg, aFin15, '#185FA5', aFinAmb)
    + '</div>'
    + _pfRegCoerenzaHtml({ regKg: aFinKg, regAmb: aFinAmb, caricoKg: aCkg, giacFisicaLamb: c.giacFisica, prodotto: prod, anno: anno, densita: _pfRegUltimaDensita(rows) })
    + '</div>';

  var tbl = _pfRegFiltroHtml() + _pfRegTabella(visible, pOpenKg, pOpen15, pOpenAmb, pCkg, pC15, pCamb, pSkg, pS15, pSamb, prod, anno);

  var blocks = { 'reg-riepilogo': riep, 'reg-tabella': tbl };
  var def = ['reg-riepilogo', 'reg-tabella'];
  var html;
  if (typeof _wrapPanel === 'function' && typeof _getPanelOrder === 'function') {
    var order = _getPanelOrder('registri').slice();
    order = order.filter(function (id) { return def.indexOf(id) >= 0; });
    def.forEach(function (id, i) { if (order.indexOf(id) < 0) order.splice(Math.min(i, order.length), 0, id); });
    html = order.map(function (id) { return _wrapPanel('registri', id, blocks[id] || ''); }).join('');
  } else {
    html = def.map(function (id) { return '<div style="margin-bottom:14px">' + blocks[id] + '</div>'; }).join('');
  }
  body.innerHTML = html;
}

// Densità più recente nota nei movimenti (per convertire litri deposito -> kg)
function _pfRegUltimaDensita(rows) {
  for (var i = rows.length - 1; i >= 0; i--) {
    var d = Number(rows[i].dens_amb);
    if (d && !isNaN(d)) { return d > 100 ? d / 1000 : d; } // normalizza kg/mc -> kg/L
  }
  return 0.835;
}

// Cruscotto coerenza: confronto giacenza registro vs deposito fisico,
// con il calo consentito di legge. Per Gasolio Autotrazione: 3‰ in peso (kg)
// del totale carico dell'anno. (Benzina/agricolo: in litri@15, da attivare poi.)
function _pfRegCoerenzaHtml(o) {
  var annoCorrente = (new Date()).getFullYear();
  if (o.giacFisicaLamb === null || o.giacFisicaLamb === undefined) return '';
  if (o.anno !== annoCorrente) return '';

  var isAuto = (o.prodotto.indexOf('Autotrazione') >= 0);
  // per ora il cruscotto col calo è attivo solo su Autotrazione (kg)
  if (!isAuto) return '';

  var dens = o.densita || 0.835;
  var regKg = Math.round(Number(o.regKg || 0));
  var fisKg = Math.round(Number(o.giacFisicaLamb || 0) * dens);
  var scarto = Math.abs(regKg - fisKg);
  var caloMax = Math.round(Number(o.caricoKg || 0) * 0.003); // 3‰ del totale carico
  var pctUso = caloMax > 0 ? (scarto / caloMax * 100) : 0;
  var entro = scarto <= caloMax;

  var col = entro ? '#639922' : '#E24B4A';
  var bg = entro ? '#EAF3DE' : '#FCEBEB';
  var txt = entro ? '#27500A' : '#A32D2D';
  var nf = function (n) { return Math.round(n).toLocaleString('it-IT'); };
  var barW = Math.max(0, Math.min(100, pctUso));

  var h = '<div style="margin-top:12px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:12px 14px">';
  h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">'
    + '<span style="font-size:13px;font-weight:600">⚖ Controllo coerenza giacenza</span>'
    + '<span style="font-size:11px;color:var(--text-hint)">registro vs deposito fisico · calo consentito D.M. 55/2000</span></div>';

  h += '<div style="display:flex;flex-wrap:wrap;gap:20px;align-items:center;margin-bottom:14px">'
    + '<div><div style="font-size:11px;color:var(--text-hint)">Giacenza registro</div><div style="font-size:17px;font-family:monospace">' + nf(regKg) + ' <span style="font-size:11px;color:var(--text-hint)">kg</span></div></div>'
    + '<span style="font-size:18px;color:var(--text-hint)">↔</span>'
    + '<div><div style="font-size:11px;color:var(--text-hint)">Giacenza deposito (cisterne)</div><div style="font-size:17px;font-family:monospace">' + nf(fisKg) + ' <span style="font-size:11px;color:var(--text-hint)">kg</span></div></div>'
    + '<div style="margin-left:auto;text-align:right"><div style="font-size:11px;color:var(--text-hint)">Scarto</div><div style="font-size:17px;font-family:monospace;font-weight:600">' + nf(scarto) + ' <span style="font-size:11px;color:var(--text-hint)">kg</span></div></div>'
    + '</div>';

  h += '<div style="margin-bottom:6px;display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted)">'
    + '<span>Calo consentito (3‰ del carico ' + nf(o.caricoKg) + ' kg)</span>'
    + '<span style="font-family:monospace">max ' + nf(caloMax) + ' kg</span></div>';
  h += '<div style="position:relative;height:22px;background:var(--bg-card,var(--bg));border-radius:6px;overflow:hidden;border:0.5px solid var(--border)">'
    + '<div style="position:absolute;left:0;top:0;bottom:0;width:' + barW + '%;background:' + col + ';opacity:.85"></div>'
    + '<div style="position:absolute;left:0;top:0;bottom:0;width:100%;display:flex;align-items:center;padding-left:10px;font-size:11px;font-family:monospace;color:var(--text)">' + nf(scarto) + ' / ' + nf(caloMax) + ' kg</div>'
    + '</div>';

  h += '<div style="margin-top:12px;display:flex;align-items:center;gap:8px;background:' + bg + ';padding:8px 12px;border-radius:8px">'
    + '<span style="width:10px;height:10px;border-radius:50%;background:' + col + ';display:inline-block"></span>'
    + '<span style="font-size:13px;color:' + txt + ';font-weight:500">'
    + (entro ? 'Entro tolleranza — scarto ' + nf(scarto) + ' kg sotto il calo consentito di ' + nf(caloMax) + ' kg (' + pctUso.toFixed(1).replace('.', ',') + '% del massimo)'
             : 'Oltre il calo consentito — scarto ' + nf(scarto) + ' kg supera il massimo di ' + nf(caloMax) + ' kg, da giustificare')
    + '</span></div>';

  h += '<div style="margin-top:8px;font-size:10px;color:var(--text-hint)">Gasolio autotrazione: calo 3‰ in peso del totale carico · deposito convertito in kg con densità ' + dens.toFixed(3).replace('.', ',') + ' · durante l\'anno è indicativo, la verifica fiscale si fa a fine anno con l\'inventario.</div>';
  h += '</div>';
  return h;
}

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
    ? '<button onclick="_pfRegResetFiltro()" style="font-size:11px;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer">✕ azzera</button>' : '';
  var stampa = '<button onclick="_pfRegStampa()" title="Stampa registro del periodo" style="font-size:11px;padding:4px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer">🖨 Stampa</button>';
  var report = '<button onclick="_pfRegReportPeriodo()" title="Report sintetico del periodo" style="font-size:11px;padding:4px 10px;border:0.5px solid var(--accent,#D85A30);border-radius:6px;background:var(--accent,#D85A30);color:#fff;cursor:pointer">📊 Report periodo</button>';
  var periodo = '<div style="display:flex;align-items:center;gap:5px;flex-wrap:wrap">'
    + '<span style="font-size:10px;color:var(--text-hint)">periodo</span>'
    + '<input type="date" id="reg-dal" value="' + (_pfRegState.dal || '') + '" style="font-size:11px;padding:4px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
    + '<span style="font-size:10px;color:var(--text-hint)">→</span>'
    + '<input type="date" id="reg-al" value="' + (_pfRegState.al || '') + '" style="font-size:11px;padding:4px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
    + '<button onclick="_pfRegApplicaPeriodo()" style="font-size:11px;padding:4px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--accent,#D85A30);color:#fff;cursor:pointer">Applica</button>'
    + azzera + '</div>';
  return '<div style="margin-bottom:10px">'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap;padding-right:62px;margin-bottom:8px">' + pills + '</div>'
    + '<div style="display:flex;justify-content:flex-end;gap:8px;align-items:center">' + report + stampa + periodo + '</div></div>';
}

function _pfRegTabella(rows, pOpenKg, pOpen15, pOpenAmb, pCkg, pC15, pCamb, pSkg, pS15, pSamb, prod, anno) {
  var filtrato = _pfRegFiltroAttivo();
  var pCloseKg = pOpenKg + pCkg - pSkg;
  var pClose15 = pOpen15 + pC15 - pS15;
  var pCloseAmb = pOpenAmb + pCamb - pSamb;
  var etPeriodo = _pfRegPeriodLabel(anno);
  function th(t, extra) {
    return '<th style="padding:6px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.3px;color:var(--text-hint);font-weight:600;' + (extra || '') + '">' + t + '</th>';
  }
  var H = '<div style="overflow-x:auto;border:0.5px solid var(--border);border-radius:10px">';
  H += '<table style="width:100%;border-collapse:collapse;font-size:12px;min-width:1040px">';
  H += '<thead><tr>'
    + '<th colspan="4" style="text-align:left;padding:6px 8px;font-size:10px;color:var(--text-hint);text-transform:uppercase">Movimento</th>'
    + '<th colspan="3" style="padding:6px 8px;font-size:10px;text-transform:uppercase;color:#1D7A4D;background:#EAF3DE">Carico (entrata)</th>'
    + '<th colspan="3" style="padding:6px 8px;font-size:10px;text-transform:uppercase;color:#A32D2D;background:#FAECE7">Scarico (uscita)</th>'
    + '<th colspan="3" style="padding:6px 8px;font-size:10px;text-transform:uppercase;color:#185FA5;background:#E6F1FB">Giacenza</th></tr>';
  H += '<tr>' + th('N.') + th('Data') + th('Documento') + th('Controparte')
    + th('kg', 'text-align:right;background:#F4FAEC') + th('l@15', 'text-align:right;background:#F4FAEC') + th('l amb', 'text-align:right;background:#F4FAEC')
    + th('kg', 'text-align:right;background:#FBF3EF') + th('l@15', 'text-align:right;background:#FBF3EF') + th('l amb', 'text-align:right;background:#FBF3EF')
    + th('kg', 'text-align:right;background:#F0F6FC') + th('l@15', 'text-align:right;background:#F0F6FC') + th('l amb', 'text-align:right;background:#F0F6FC')
    + '</tr></thead><tbody style="font-family:monospace">';
  var etRiporto = filtrato ? ('Riporto a inizio periodo (' + etPeriodo + ')') : ('Giacenza iniziale al 31/12/' + (anno - 1));
  H += '<tr><td colspan="4" style="padding:7px 8px;font-style:italic;color:var(--text-hint);border-top:0.5px solid var(--border);font-family:inherit">' + etRiporto + '</td>'
    + '<td colspan="6"></td>'
    + '<td style="padding:7px 8px;text-align:right;border-top:0.5px solid var(--border);font-weight:600">' + _pfRegN(pOpenKg) + '</td>'
    + '<td style="padding:7px 8px;text-align:right;border-top:0.5px solid var(--border)">' + _pfRegN(pOpen15) + '</td>'
    + '<td style="padding:7px 8px;text-align:right;border-top:0.5px solid var(--border)">' + _pfRegN(pOpenAmb) + '</td></tr>';
  if (!rows.length) {
    H += '<tr><td colspan="13" style="padding:16px;text-align:center;color:var(--text-hint);font-family:inherit">Nessun movimento ' + (filtrato ? 'nel periodo selezionato' : 'per ' + _pfRegEsc(prod) + ' nel ' + anno) + '.</td></tr>';
  }
  rows.forEach(function (r) {
    var isCar = (r.direzione === 'E');
    var gkg = Number(r.giac_kg || 0);
    var g15 = Number(r.giac_lt15 || 0);
    var gamb = Number(r.giac_ltamb || 0);
    var docTipo = r.tipo_doc || '—';
    var docRef = r.arc ? '<div style="font-size:10px;color:var(--text-hint)">' + _pfRegEsc(r.arc) + '</div>' : '';
    var prog = r.progressivo ? '<div style="font-size:10px;color:var(--text-hint)">' + _pfRegEsc(r.progressivo) + '</div>' : '';
    var dens = (r.dens_15 != null) ? '<div style="font-size:10px;color:var(--text-hint)">ρ15 ' + Number(r.dens_15).toFixed(3).replace('.', ',') + '</div>' : '';
    H += '<tr style="border-top:0.5px solid var(--border)">'
      + '<td style="padding:7px 8px;color:var(--text-hint)">' + r._n + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + _pfRegData(r.data) + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + _pfRegEsc(docTipo) + docRef + prog + '</td>'
      + '<td style="padding:7px 8px;font-family:inherit">' + (r.controparte ? _pfRegEsc(r.controparte) : '—') + dens + '</td>'
      + '<td style="padding:7px 8px;text-align:right;font-weight:600;color:' + (isCar ? '#1D7A4D' : 'var(--text-hint)') + '">' + (isCar ? _pfRegN(r.car_kg) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (isCar ? '#1D7A4D' : 'var(--text-hint)') + '">' + (isCar ? _pfRegN(r.car_lt15) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (isCar ? '#1D7A4D' : 'var(--text-hint)') + '">' + (isCar ? _pfRegN(r.car_ltamb) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;font-weight:600;color:' + (!isCar ? '#A32D2D' : 'var(--text-hint)') + '">' + (!isCar ? _pfRegN(r.sca_kg) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (!isCar ? '#A32D2D' : 'var(--text-hint)') + '">' + (!isCar ? _pfRegN(r.sca_lt15) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:' + (!isCar ? '#A32D2D' : 'var(--text-hint)') + '">' + (!isCar ? _pfRegN(r.sca_ltamb) : '—') + '</td>'
      + '<td style="padding:7px 8px;text-align:right;font-weight:600">' + _pfRegN(gkg) + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:var(--text-hint)">' + _pfRegN(g15) + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:var(--text-hint)">' + _pfRegN(gamb) + '</td></tr>';
  });
  H += '</tbody>';
  var etTot = filtrato ? ('Totali ' + etPeriodo) : ('Totali ' + anno);
  H += '<tfoot><tr style="border-top:1px solid var(--border);font-weight:600;font-family:monospace">'
    + '<td colspan="4" style="padding:8px;text-align:right;font-family:inherit;color:var(--text-hint)">' + etTot + '</td>'
    + '<td style="padding:8px;text-align:right;color:#1D7A4D">' + _pfRegN(pCkg) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#1D7A4D;font-weight:400">' + _pfRegN(pC15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#1D7A4D;font-weight:400">' + _pfRegN(pCamb) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#A32D2D">' + _pfRegN(pSkg) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#A32D2D;font-weight:400">' + _pfRegN(pS15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#A32D2D;font-weight:400">' + _pfRegN(pSamb) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5">' + _pfRegN(pCloseKg) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5;font-weight:400">' + _pfRegN(pClose15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5;font-weight:400">' + _pfRegN(pCloseAmb) + '</td></tr></tfoot>';
  H += '</table></div>';
  H += '<div style="margin-top:8px;font-size:10px;color:var(--text-hint)">Dato fiscale = <strong>kg</strong> · giacenza progressiva in kg · l@15 e l amb indicativi per controllo.</div>';
  return H;
}

function _pfRegStampa() {
  var c = _pfRegCache; if (!c) return;
  var prod = c.prod, anno = c.anno;
  var pred = _pfRegPredicato();
  var visible = c.rows.filter(pred);
  var openKg = c.apertura ? Number(c.apertura.giac_kg || 0) : 0;
  var pOpenKg = openKg;
  if (_pfRegFiltroAttivo() && visible.length) {
    var idx = c.rows.indexOf(visible[0]);
    if (idx > 0) pOpenKg = Number(c.rows[idx - 1].giac_kg || 0);
  }
  var codNC = (prod.indexOf('Benzina') >= 0) ? '2710 12 45' : '2710 19 43';
  var rowsHtml = '';
  visible.forEach(function (r) {
    var isCar = (r.direzione === 'E');
    rowsHtml += '<tr><td>' + r._n + '</td><td>' + _pfRegData(r.data) + '</td>'
      + '<td>' + _pfRegEsc((r.tipo_doc || '') + ' ' + (r.arc || r.progressivo || '')) + '</td>'
      + '<td>' + (r.controparte ? _pfRegEsc(r.controparte) : '') + '</td>'
      + '<td class="num">' + (isCar ? _pfRegN(r.car_kg) : '') + '</td>'
      + '<td class="num">' + (!isCar ? _pfRegN(r.sca_kg) : '') + '</td>'
      + '<td class="num b">' + _pfRegN(r.giac_kg) + '</td></tr>';
  });
  var pCkg = 0, pSkg = 0;
  visible.forEach(function (r) { pCkg += Number(r.car_kg || 0); pSkg += Number(r.sca_kg || 0); });
  var pCloseKg = pOpenKg + pCkg - pSkg;
  var win = window.open('', '_blank');
  if (!win) { if (typeof toast === 'function') toast('Abilita i popup per stampare'); return; }
  var html = '<!doctype html><html><head><meta charset="utf-8"><title>Registro ' + _pfRegEsc(prod) + ' ' + anno + '</title>'
    + '<style>body{font-family:Arial,sans-serif;font-size:11px;color:#000;margin:18px}'
    + 'h1{font-size:15px;margin:0 0 2px}.sub{font-size:11px;color:#333;margin:0 0 12px}'
    + 'table{width:100%;border-collapse:collapse}th,td{border:0.5px solid #555;padding:3px 5px}'
    + 'th{background:#eee;font-size:9px;text-transform:uppercase;text-align:left}'
    + 'td.num{text-align:right;font-variant-numeric:tabular-nums}td.b{font-weight:bold}'
    + 'tr.rip td{font-style:italic;background:#fafafa}tfoot td{font-weight:bold;border-top:1.5px solid #000}'
    + '@media print{body{margin:0}}</style></head><body>'
    + '<h1>Registro di carico e scarico — ' + _pfRegEsc(prod) + '</h1>'
    + '<p class="sub">Phoenix Fuel S.r.l. — Deposito di Vibo Valentia (Porto Salvo Z.I.) · Codice NC ' + codNC
    + ' · Periodo: ' + _pfRegPeriodLabel(anno) + ' · unità fiscale: kg</p>'
    + '<table><thead><tr><th>N.</th><th>Data</th><th>Documento</th><th>Controparte</th>'
    + '<th>Carico kg</th><th>Scarico kg</th><th>Giacenza kg</th></tr></thead><tbody>'
    + '<tr class="rip"><td colspan="6">Riporto a inizio periodo</td><td class="num b">' + _pfRegN(pOpenKg) + '</td></tr>'
    + rowsHtml + '</tbody><tfoot><tr><td colspan="4" style="text-align:right">Totali</td>'
    + '<td class="num">' + _pfRegN(pCkg) + '</td><td class="num">' + _pfRegN(pSkg) + '</td>'
    + '<td class="num">' + _pfRegN(pCloseKg) + '</td></tr></tfoot></table></body></html>';
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(function () { try { win.print(); } catch (e) {} }, 300);
}

// ── Report periodo: modale sintetico (totali + tolleranza rettifiche) ──
var _pfRegReportData = null;
function _pfRegReportPeriodo() {
  var c = _pfRegCache;
  if (!c) { if (typeof toast === 'function') toast('Apri prima un registro'); return; }
  _pfRegReportData = c;
  _pfRegReportRender('mese');
}

function _pfRegReportCalc(modo, mese, dal, al) {
  var c = _pfRegReportData;
  var rows = c.rows, apertura = c.apertura, anno = c.anno;
  // predicato periodo
  var pred;
  if (modo === 'periodo' && (dal || al)) {
    pred = function (r) { return r.data && (!dal || r.data >= dal) && (!al || r.data <= al); };
  } else if (modo === 'mese' && mese) {
    var mm = (mese < 10 ? '0' : '') + mese;
    pred = function (r) { return r.data && r.data.substring(5, 7) === mm; };
  } else {
    pred = function () { return true; }; // anno intero
  }
  var vis = rows.filter(pred);

  // giacenza iniziale del periodo = giac della riga precedente alla prima visibile
  var openKg, open15, openAmb;
  if (vis.length) {
    var idx = rows.indexOf(vis[0]);
    if (idx > 0) {
      var p = rows[idx - 1];
      openKg = Number(p.giac_kg || 0); open15 = Number(p.giac_lt15 || 0); openAmb = Number(p.giac_ltamb || 0);
    } else {
      openKg = apertura ? Number(apertura.giac_kg || 0) : 0;
      open15 = apertura ? Number(apertura.giac_lt15 || 0) : 0;
      openAmb = apertura ? Number(apertura.giac_ltamb || 0) : 0;
    }
  } else {
    openKg = apertura ? Number(apertura.giac_kg || 0) : 0;
    open15 = apertura ? Number(apertura.giac_lt15 || 0) : 0;
    openAmb = apertura ? Number(apertura.giac_ltamb || 0) : 0;
  }

  var eKg = 0, e15 = 0, eAmb = 0, uKg = 0, u15 = 0, uAmb = 0, rKg = 0, r15 = 0, rAmb = 0;
  vis.forEach(function (r) {
    var isRett = (r.tipo_doc === 'RETT');
    if (isRett) {
      // rettifica: contributo netto (E somma, U sottrae) — campi car_/sca_ dalla vista
      if (r.direzione === 'E') {
        rKg += Number(r.car_kg || 0); r15 += Number(r.car_lt15 || 0); rAmb += Number(r.car_ltamb || 0);
      } else {
        rKg -= Number(r.sca_kg || 0); r15 -= Number(r.sca_lt15 || 0); rAmb -= Number(r.sca_ltamb || 0);
      }
    } else if (r.direzione === 'E') {
      eKg += Number(r.car_kg || 0); e15 += Number(r.car_lt15 || 0); eAmb += Number(r.car_ltamb || 0);
    } else {
      uKg += Number(r.sca_kg || 0); u15 += Number(r.sca_lt15 || 0); uAmb += Number(r.sca_ltamb || 0);
    }
  });
  var finKg = openKg + eKg - uKg + rKg;
  var fin15 = open15 + e15 - u15 + r15;
  var finAmb = openAmb + eAmb - uAmb + rAmb;

  return {
    openKg: openKg, open15: open15, openAmb: openAmb,
    eKg: eKg, e15: e15, eAmb: eAmb, uKg: uKg, u15: u15, uAmb: uAmb,
    rKg: rKg, r15: r15, rAmb: rAmb, finKg: finKg, fin15: fin15, finAmb: finAmb,
    anno: anno
  };
}

function _pfRegReportRender(modo) {
  var c = _pfRegReportData; if (!c) return;
  var prod = c.prod, anno = c.anno;
  modo = modo || 'mese';
  var mese = _pfRegReportState ? _pfRegReportState.mese : ((new Date()).getMonth() + 1);
  var dal = _pfRegReportState ? _pfRegReportState.dal : '';
  var al = _pfRegReportState ? _pfRegReportState.al : '';
  _pfRegReportState = { modo: modo, mese: mese, dal: dal, al: al };

  var d = _pfRegReportCalc(modo, mese, dal, al);
  var isAuto = (prod.indexOf('Autotrazione') >= 0);
  var nf = function (n) { return (n == null || isNaN(Number(n))) ? '—' : Math.round(Number(n)).toLocaleString('it-IT'); };
  var nfS = function (n) { var v = Math.round(Number(n || 0)); return (v > 0 ? '+' : '') + v.toLocaleString('it-IT'); };

  // selettori
  var mesiOpt = '';
  for (var i = 1; i <= 12; i++) mesiOpt += '<option value="' + i + '"' + (i === mese ? ' selected' : '') + '>' + _PF_REG_MESI_FULL[i - 1] + ' ' + anno + '</option>';
  var btnMese = 'font-size:12px;padding:5px 12px;border-radius:6px;cursor:pointer;border:0.5px solid var(--border);' + (modo === 'mese' ? 'background:var(--accent,#D85A30);color:#fff' : 'background:var(--bg);color:var(--text)');
  var btnPer = 'font-size:12px;padding:5px 12px;border-radius:6px;cursor:pointer;border:0.5px solid var(--border);' + (modo === 'periodo' ? 'background:var(--accent,#D85A30);color:#fff' : 'background:var(--bg);color:var(--text)');

  var sel = '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px;align-items:center">'
    + '<button onclick="_pfRegReportSetModo(\'mese\')" style="' + btnMese + '">Per mese</button>'
    + '<button onclick="_pfRegReportSetModo(\'periodo\')" style="' + btnPer + '">Per periodo</button>';
  if (modo === 'mese') {
    sel += '<select onchange="_pfRegReportSetMese(this.value)" style="font-size:12px;padding:5px 8px;border-radius:6px;border:0.5px solid var(--border);background:var(--bg);color:var(--text)">' + mesiOpt + '</select>';
  } else {
    sel += '<input type="date" id="rep-dal" value="' + (dal || '') + '" style="font-size:12px;padding:4px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
      + '<span style="font-size:11px;color:var(--text-hint)">→</span>'
      + '<input type="date" id="rep-al" value="' + (al || '') + '" style="font-size:12px;padding:4px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
      + '<button onclick="_pfRegReportApplica()" style="font-size:12px;padding:5px 12px;border:none;border-radius:6px;background:var(--accent,#D85A30);color:#fff;cursor:pointer">Applica</button>';
  }
  sel += '</div>';

  function rowT(label, kg, l15, lamb, col, segno) {
    var fmt = segno ? nfS : nf;
    return '<tr style="border-top:0.5px solid var(--border)">'
      + '<td style="padding:7px 8px;font-family:inherit' + (col ? ';color:' + col : '') + '">' + label + '</td>'
      + '<td style="padding:7px 8px;text-align:right' + (col ? ';color:' + col : '') + '">' + fmt(kg) + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:var(--text-hint)">' + fmt(l15) + '</td>'
      + '<td style="padding:7px 8px;text-align:right;color:var(--text-hint)">' + fmt(lamb) + '</td></tr>';
  }
  var tbl = '<table style="width:100%;border-collapse:collapse;font-size:13px;margin-bottom:16px;font-family:monospace">'
    + '<thead><tr style="color:var(--text-hint)"><th></th>'
    + '<th style="text-align:right;padding:6px 8px;font-size:10px;text-transform:uppercase">kg</th>'
    + '<th style="text-align:right;padding:6px 8px;font-size:10px;text-transform:uppercase">l@15</th>'
    + '<th style="text-align:right;padding:6px 8px;font-size:10px;text-transform:uppercase">l amb</th></tr></thead><tbody>'
    + rowT('Giacenza iniziale', d.openKg, d.open15, d.openAmb)
    + rowT('Totale entrate', d.eKg, d.e15, d.eAmb, '#1D7A4D')
    + rowT('Totale uscite', d.uKg, d.u15, d.uAmb, '#A32D2D')
    + rowT('Rettifiche', d.rKg, d.r15, d.rAmb, '#854F0B', true)
    + '</tbody><tfoot><tr style="border-top:1px solid var(--border);font-weight:600">'
    + '<td style="padding:8px;font-family:inherit">Totale periodo</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5">' + nf(d.finKg) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5;font-weight:400">' + nf(d.fin15) + '</td>'
    + '<td style="padding:8px;text-align:right;color:#185FA5;font-weight:400">' + nf(d.finAmb) + '</td></tr></tfoot></table>';

  // tolleranza rettifiche (solo Autotrazione, in kg, 3‰ entrate)
  var tol = '';
  if (isAuto) {
    var rettAbs = Math.abs(d.rKg);
    var maxTol = Math.round(d.eKg * 0.003);
    var pct = maxTol > 0 ? (rettAbs / maxTol * 100) : 0;
    var entro = rettAbs <= maxTol;
    var col = entro ? '#639922' : '#E24B4A', bg = entro ? '#EAF3DE' : '#FCEBEB', txt = entro ? '#27500A' : '#A32D2D';
    var barW = Math.max(0, Math.min(100, pct));
    tol = '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:14px">'
      + '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Se eseguo rettifiche — valore entro tolleranza</div>'
      + '<div style="font-size:11px;color:var(--text-hint);margin-bottom:12px">rettifiche del periodo vs 3‰ del totale entrate (' + nf(d.eKg) + ' kg) = max ' + nf(maxTol) + ' kg</div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-bottom:4px"><span>rettificato ' + nf(rettAbs) + ' kg</span><span style="font-family:monospace">max ' + nf(maxTol) + ' kg · 100%</span></div>'
      + '<div style="position:relative;height:24px;background:var(--bg-card,var(--bg));border-radius:6px;overflow:hidden;border:0.5px solid var(--border)">'
      + '<div style="position:absolute;left:0;top:0;bottom:0;width:' + barW + '%;background:' + col + ';opacity:.85"></div>'
      + '<div style="position:absolute;left:0;top:0;bottom:0;width:100%;display:flex;align-items:center;padding-left:10px;font-size:12px;font-family:monospace;color:var(--text)">' + pct.toFixed(0) + '% del tollerabile</div></div>'
      + '<div style="margin-top:12px;display:flex;align-items:center;gap:8px;background:' + bg + ';padding:8px 12px;border-radius:8px">'
      + '<span style="width:10px;height:10px;border-radius:50%;background:' + col + ';display:inline-block"></span>'
      + '<span style="font-size:13px;color:' + txt + ';font-weight:500">' + (entro ? 'Entro tolleranza — ' + nf(rettAbs) + ' kg rettificati sotto il massimo di ' + nf(maxTol) + ' kg' : 'Oltre tolleranza — ' + nf(rettAbs) + ' kg superano il massimo di ' + nf(maxTol) + ' kg') + '</span></div>'
      + '</div>';
  } else {
    tol = '<div style="font-size:11px;color:var(--text-hint);padding:8px">Il controllo tolleranza in kg è attivo per il Gasolio Autotrazione. Per ' + _pfRegEsc(prod) + ' sarà calcolato in litri@15.</div>';
  }

  var periodoLbl = (modo === 'periodo') ? ((dal ? _pfRegData(dal) : 'inizio') + ' – ' + (al ? _pfRegData(al) : 'oggi')) : (_PF_REG_MESI_FULL[mese - 1] + ' ' + anno);

  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">📊 Report periodo — ' + _pfRegEsc(prod) + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">' + periodoLbl + ' · dato fiscale: kg</div>'
    + sel + tbl + tol
    + '<div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">'
    + '<button onclick="_pfRegReportStampa()" style="font-size:12px;padding:8px 16px;border:0.5px solid var(--border);background:var(--bg);color:var(--text);border-radius:8px;cursor:pointer">🖨 Stampa report</button>'
    + '<button onclick="chiudiModalePermessi&&chiudiModalePermessi()" style="font-size:12px;padding:8px 16px;border:none;background:var(--accent,#D85A30);color:#fff;border-radius:8px;cursor:pointer">Chiudi</button></div>';
  apriModal(h);
}

var _pfRegReportState = null;
function _pfRegReportSetModo(m) { if (_pfRegReportState) _pfRegReportState.modo = m; _pfRegReportRender(m); }
function _pfRegReportSetMese(m) { if (_pfRegReportState) _pfRegReportState.mese = Number(m); _pfRegReportRender('mese'); }
function _pfRegReportApplica() {
  var dal = document.getElementById('rep-dal'), al = document.getElementById('rep-al');
  if (_pfRegReportState) { _pfRegReportState.dal = dal ? dal.value : ''; _pfRegReportState.al = al ? al.value : ''; }
  _pfRegReportRender('periodo');
}
function _pfRegReportStampa() {
  var c = _pfRegReportData; if (!c) return;
  var st = _pfRegReportState || { modo: 'mese', mese: 1 };
  var d = _pfRegReportCalc(st.modo, st.mese, st.dal, st.al);
  var prod = c.prod, anno = c.anno;
  var isAuto = (prod.indexOf('Autotrazione') >= 0);
  var nf = function (n) { return Math.round(Number(n || 0)).toLocaleString('it-IT'); };
  var periodoLbl = (st.modo === 'periodo') ? ((st.dal ? _pfRegData(st.dal) : 'inizio') + ' – ' + (st.al ? _pfRegData(st.al) : 'oggi')) : (_PF_REG_MESI_FULL[st.mese - 1] + ' ' + anno);
  var tolHtml = '';
  if (isAuto) {
    var rettAbs = Math.abs(d.rKg), maxTol = Math.round(d.eKg * 0.003);
    var entro = rettAbs <= maxTol;
    tolHtml = '<p><strong>Tolleranza rettifiche:</strong> rettificato ' + nf(rettAbs) + ' kg su max ' + nf(maxTol) + ' kg (3‰ entrate) — ' + (entro ? 'ENTRO tolleranza' : 'OLTRE tolleranza') + '</p>';
  }
  var win = window.open('', '_blank'); if (!win) return;
  win.document.write('<!doctype html><html><head><meta charset="utf-8"><title>Report ' + _pfRegEsc(prod) + '</title>'
    + '<style>body{font-family:Arial,sans-serif;font-size:12px;margin:20px}h1{font-size:15px;margin:0 0 2px}.sub{color:#555;margin:0 0 14px}'
    + 'table{width:100%;border-collapse:collapse;margin-bottom:14px}th,td{border:0.5px solid #777;padding:5px 8px}th{background:#eee;text-transform:uppercase;font-size:10px}td.n{text-align:right;font-variant-numeric:tabular-nums}tfoot td{font-weight:bold}</style></head><body>'
    + '<h1>Report periodo — ' + _pfRegEsc(prod) + '</h1><p class="sub">Phoenix Fuel S.r.l. · Deposito Vibo Valentia · ' + periodoLbl + ' · dato fiscale: kg</p>'
    + '<table><thead><tr><th></th><th>kg</th><th>l@15</th><th>l amb</th></tr></thead><tbody>'
    + '<tr><td>Giacenza iniziale</td><td class="n">' + nf(d.openKg) + '</td><td class="n">' + nf(d.open15) + '</td><td class="n">' + nf(d.openAmb) + '</td></tr>'
    + '<tr><td>Totale entrate</td><td class="n">' + nf(d.eKg) + '</td><td class="n">' + nf(d.e15) + '</td><td class="n">' + nf(d.eAmb) + '</td></tr>'
    + '<tr><td>Totale uscite</td><td class="n">' + nf(d.uKg) + '</td><td class="n">' + nf(d.u15) + '</td><td class="n">' + nf(d.uAmb) + '</td></tr>'
    + '<tr><td>Rettifiche</td><td class="n">' + nf(d.rKg) + '</td><td class="n">' + nf(d.r15) + '</td><td class="n">' + nf(d.rAmb) + '</td></tr>'
    + '</tbody><tfoot><tr><td>Totale periodo</td><td class="n">' + nf(d.finKg) + '</td><td class="n">' + nf(d.fin15) + '</td><td class="n">' + nf(d.finAmb) + '</td></tr></tfoot></table>'
    + tolHtml + '</body></html>');
  win.document.close(); win.focus();
  setTimeout(function () { try { win.print(); } catch (e) {} }, 300);
}

// ── Auto-init: inietta il tab appena la sezione Deposito è nel DOM ──────
(function _pfRegBootstrap() {
  function tryInit() {
    try {
      var sec = document.getElementById('s-deposito');
      var hasTabs = sec && sec.querySelector('.dep-tab');
      if (hasTabs && !document.getElementById('dep-registri')) {
        pfRegInit();
      }
      return !!document.getElementById('dep-registri');
    } catch (e) { return false; }
  }
  if (tryInit()) return;
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInit);
  }
  // retry breve finché la sezione Deposito non è pronta (max ~10s)
  var tries = 0;
  var iv = setInterval(function () {
    tries++;
    if (tryInit() || tries > 40) clearInterval(iv);
  }, 250);
})();
