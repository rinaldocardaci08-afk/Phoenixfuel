// ═══════════════════════════════════════════════════════════════════
// pf-estratto-fornitore.js — Estratto conto fornitore (sezione Fornitori)
// Scegli il fornitore → dashboard (acquistato anno, pagate, da pagare),
// barra del fido utilizzato/assegnato (verde→arancio→rosso) e elenco fatture
// con spunta "pagata" che apre il modale pagamento già esistente
// (apriModalePagamentoFornitore: totale/parziale, data, banca).
// Dopo il salvataggio si ridisegna restando NELLO STESSO PUNTO della pagina.
// Residuo fattura = importo_dichiarato − somma pagamenti.
// ═══════════════════════════════════════════════════════════════════
let _ecfFornitori = [];
let _ecfPop = false;
let _ecfSel = null;        // { id, nome, fido, gg }
let _ecfFatture = [];      // fatture del fornitore con residuo calcolato
let _ecfFiltro = 'aperte'; // 'aperte' | 'tutte'

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
    var { data } = await sb.from('fornitori').select('id,nome,fido_massimo,giorni_pagamento').order('nome');
    _ecfFornitori = data || [];
    sel.innerHTML = '<option value="">— scegli un fornitore —</option>' +
      _ecfFornitori.map(function (f) { return '<option value="' + f.id + '">' + esc(f.nome) + '</option>'; }).join('');
    _ecfPop = true;
  }
  if (_ecfSel) ecfCambiaFornitore();
}

async function ecfCambiaFornitore() {
  var sel = document.getElementById('ecf-fornitore');
  var id = sel ? sel.value : '';
  var body = document.getElementById('ecf-body');
  if (!id) {
    _ecfSel = null;
    if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">Seleziona un fornitore per vedere l\'estratto conto.</div>';
    return;
  }
  var f = _ecfFornitori.filter(function (x) { return x.id === id; })[0];
  _ecfSel = { id: id, nome: f ? f.nome : '', fido: Number(f && f.fido_massimo || 0), gg: Number(f && f.giorni_pagamento || 30) };
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">⏳ Caricamento fatture...</div>';
  await _ecfCarica();
  _ecfRender();
}

async function _ecfCarica() {
  var q = await sb.from('fatture_ricevute').select('*').eq('fornitore_id', _ecfSel.id).order('data_fattura', { ascending: false });
  var fatt = q.data || [];
  if (!fatt.length) {
    var q2 = await sb.from('fatture_ricevute').select('*').eq('fornitore_nome', _ecfSel.nome).order('data_fattura', { ascending: false });
    fatt = q2.data || [];
  }
  var ids = fatt.map(function (x) { return x.id; });
  var pagMap = {};
  if (ids.length) {
    var qp = await sb.from('pagamenti_fornitori').select('fattura_ricevuta_id,importo,data_pagamento').in('fattura_ricevuta_id', ids);
    (qp.data || []).forEach(function (p) {
      if (!pagMap[p.fattura_ricevuta_id]) pagMap[p.fattura_ricevuta_id] = { tot: 0, n: 0, ultima: null };
      var m = pagMap[p.fattura_ricevuta_id];
      m.tot += Number(p.importo || 0); m.n++;
      if (!m.ultima || String(p.data_pagamento) > String(m.ultima)) m.ultima = p.data_pagamento;
    });
  }
  _ecfFatture = fatt.map(function (x) {
    var tot = Number(x.importo_dichiarato || 0);
    var pg = pagMap[x.id] || { tot: 0, n: 0, ultima: null };
    var residuo = Math.round((tot - pg.tot) * 100) / 100;
    return {
      id: x.id, numero: x.numero_fattura, data: x.data_fattura, scadenza: x.data_scadenza,
      totale: tot, pagato: pg.tot, nPag: pg.n, ultimoPag: pg.ultima,
      residuo: residuo, saldata: residuo <= 0.01
    };
  });
}

function ecfFidoUsato() {
  return _ecfFatture.reduce(function (s, f) { return s + (f.saldata ? 0 : f.residuo); }, 0);
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

function ecfSetFiltro(v) { _ecfFiltro = v; _ecfRender(true); }

function _ecfRender(mantieniPosizione) {
  var body = document.getElementById('ecf-body');
  if (!body || !_ecfSel) return;
  var scrollY = window.scrollY;

  var anno = new Date().getFullYear();
  var delAnno = _ecfFatture.filter(function (f) { return String(f.data).slice(0, 4) === String(anno); });
  var acquistato = delAnno.reduce(function (s, f) { return s + f.totale; }, 0);
  var pagate = delAnno.reduce(function (s, f) { return s + f.pagato; }, 0);
  var nSaldate = delAnno.filter(function (f) { return f.saldata; }).length;
  var daPagare = _ecfFatture.reduce(function (s, f) { return s + (f.saldata ? 0 : f.residuo); }, 0);
  var nAperte = _ecfFatture.filter(function (f) { return !f.saldata; }).length;

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

  var lista = _ecfFiltro === 'aperte' ? _ecfFatture.filter(function (f) { return !f.saldata; }) : _ecfFatture;
  var oggi = new Date().toISOString().slice(0, 10);

  var righe = lista.map(function (f) {
    var scaduta = !f.saldata && f.scadenza && String(f.scadenza) < oggi;
    var badge = f.saldata
      ? '<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">pagata</span>'
      : (scaduta ? '<span style="background:#FCEBEB;color:#791F1F;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">scaduta</span>'
                 : '<span style="background:#FFF1DC;color:#8A4F06;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">aperta</span>');
    var nota = (f.nPag > 0 && !f.saldata)
      ? '<div style="font-size:10px;color:#8A4F06;margin-top:2px">acconto ' + fmtE(f.pagato) + (f.ultimoPag ? ' del ' + _pfIsoToIt(f.ultimoPag) : '') + '</div>'
      : '';
    return '<tr>'
      + '<td style="text-align:center"><input type="checkbox"' + (f.saldata ? ' checked disabled' : '') + ' onclick="ecfPaga(\'' + f.id + '\')" title="Registra pagamento" style="width:17px;height:17px;cursor:pointer;accent-color:#639922"></td>'
      + '<td style="font-family:var(--font-mono)">' + _pfIsoToIt(f.data) + '</td>'
      + '<td style="font-family:var(--font-mono)">' + esc(f.numero || '—') + '</td>'
      + '<td style="font-family:var(--font-mono);' + (scaduta ? 'color:#A32D2D;font-weight:600' : '') + '">' + (f.scadenza ? _pfIsoToIt(f.scadenza) : '—') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono)">' + fmtE(f.totale) + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);color:#3B6D11">' + (f.pagato > 0 ? fmtE(f.pagato) : '—') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-weight:600;color:' + (f.saldata ? 'var(--text-muted)' : '#A32D2D') + '">' + (f.saldata ? '—' : fmtE(f.residuo)) + '</td>'
      + '<td>' + badge + nota + '</td></tr>';
  }).join('');
  if (!righe) righe = '<tr><td colspan="8" style="text-align:center;color:var(--text-muted);padding:20px;font-size:12px">Nessuna fattura</td></tr>';

  var btnF = function (v, t) {
    var on = _ecfFiltro === v;
    return '<button onclick="ecfSetFiltro(\'' + v + '\')" style="font-size:11.5px;padding:6px 14px;border:0.5px solid ' + (on ? '#0C447C' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#0C447C' : 'var(--bg)') + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer">' + t + '</button>';
  };

  body.innerHTML =
    '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">'
    + kpi('Acquistato ' + anno, acquistato, delAnno.length + ' fatture', '')
    + kpi('Pagate', pagate, nSaldate + ' fatture saldate', 'ok')
    + kpi('Da pagare', daPagare, nAperte + ' fatture aperte', 'ko')
    + '</div>'
    + (_ecfSel.fido > 0
        ? '<div style="margin-bottom:18px">' + _ecfBarra(ecfFidoUsato(), _ecfSel.fido, true) + '</div>'
        : '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:16px">Nessun fido assegnato a questo fornitore (impostalo nella scheda anagrafica).</div>')
    + '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:600">Fatture</div>'
    + '<div style="display:flex;gap:8px">' + btnF('aperte', 'Solo da pagare') + btnF('tutte', 'Tutte') + '</div></div>'
    + '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
    + '<thead><tr style="background:var(--bg);color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.5px">'
    + '<th style="padding:9px 8px;width:70px">Pagata</th><th style="padding:9px 8px;text-align:left">Data</th><th style="padding:9px 8px;text-align:left">Numero</th>'
    + '<th style="padding:9px 8px;text-align:left">Scadenza</th><th style="padding:9px 8px;text-align:right">Totale</th>'
    + '<th style="padding:9px 8px;text-align:right">Pagato</th><th style="padding:9px 8px;text-align:right">Residuo</th>'
    + '<th style="padding:9px 8px;text-align:left">Stato</th></tr></thead><tbody>' + righe + '</tbody>'
    + '<tfoot><tr style="border-top:2px solid var(--accent)"><td colspan="6" style="padding:12px 8px;font-weight:700">Totale da pagare</td>'
    + '<td style="padding:12px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:#A32D2D">' + fmtE(daPagare) + '</td><td></td></tr></tfoot>'
    + '</table></div>';

  if (mantieniPosizione !== false) window.scrollTo(0, scrollY);
}

// Spunta → modale pagamento esistente (totale/parziale, data, banca)
function ecfPaga(fatturaId) {
  if (typeof apriModalePagamentoFornitore !== 'function') { toast('Modale pagamento non caricato: ricarica la pagina'); return; }
  var f = _ecfFatture.filter(function (x) { return x.id === fatturaId; })[0];
  window._ecfFidoCtx = _ecfSel ? { fido: _ecfSel.fido, usato: ecfFidoUsato(), nome: _ecfSel.nome, residuo: f ? f.residuo : 0 } : null;
  apriModalePagamentoFornitore(fatturaId, {
    onSaved: async function () {
      await _ecfCarica();
      _ecfRender();   // ridisegna restando nello stesso punto
    }
  });
}

// ── Barra fido dentro il modale di pagamento, in diretta ──
// Mostra quanto si rientra nel fido del fornitore mentre si digita l'importo
// (o si sceglie il saldo totale). Alimentata da window._ecfFidoCtx.
function _pfpAggiornaFido() {
  var box = document.getElementById('pfp-fido-box');
  var ctx = window._ecfFidoCtx;
  if (!box || !ctx || !(Number(ctx.fido) > 0)) return;
  var inp = document.getElementById('pfp-importo');
  var importo = inp ? (parseFloat(inp.value) || 0) : 0;
  if (importo < 0) importo = 0;
  var usatoDopo = Math.max(0, Number(ctx.usato || 0) - importo);
  var pct = Math.min(100, (usatoDopo / Number(ctx.fido)) * 100);
  var pctPrima = Math.min(100, (Number(ctx.usato || 0) / Number(ctx.fido)) * 100);
  box.innerHTML = '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Fido ' + (ctx.nome || '') + '</div>'
    + _ecfBarra(usatoDopo, Number(ctx.fido), false)
    + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:5px">prima del pagamento ' + Math.round(pctPrima) + '% · dopo ' + Math.round(pct) + '% · rientri di ' + fmtE(importo) + '</div>';
}
