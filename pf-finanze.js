// PhoenixFuel — Finanze: Calendario Entrate/Uscite
// v2 (24/05/2026): modo settimana / mese / anno + click cella + fix timezone griglia

'use strict';

var _finCalAnno = new Date().getFullYear();
var _finCalMese = new Date().getMonth();
var _finCalAncora = new Date().toISOString().split('T')[0]; // ancora ISO per modo settimana
var _finCalModo = 'mese';   // 'settimana' | 'mese' | 'anno'
var _finCalDati = null;
var _finForColori = {};

var _FIN_MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

// ── Navigazione: si adatta al modo corrente ──
function finCalMese(dir) {
  if (_finCalModo === 'settimana') {
    var a = new Date(_finCalAncora + 'T12:00:00');
    a.setDate(a.getDate() + (7 * dir));
    _finCalAncora = a.toISOString().split('T')[0];
    _finCalAnno = a.getFullYear();
    _finCalMese = a.getMonth();
  } else if (_finCalModo === 'mese') {
    _finCalMese += dir;
    if (_finCalMese < 0)  { _finCalMese = 11; _finCalAnno--; }
    if (_finCalMese > 11) { _finCalMese = 0;  _finCalAnno++; }
    _finCalAncora = new Date(_finCalAnno, _finCalMese, 1, 12, 0, 0).toISOString().split('T')[0];
  } else { // anno
    _finCalAnno += dir;
    _finCalMese = 0;
    _finCalAncora = new Date(_finCalAnno, 0, 1, 12, 0, 0).toISOString().split('T')[0];
  }
  caricaFinanze();
}

// ── Toggle modo (chiamato dai 3 bottoni vista) ──
function finCalCambiaModo(modo) {
  if (modo === _finCalModo) return;
  _finCalModo = modo;
  caricaFinanze();
}

// ── Salta a un mese specifico (dal click sulle mini-card anno) ──
function finCalVaiAlMese(anno, mese) {
  _finCalAnno = anno;
  _finCalMese = mese;
  _finCalAncora = new Date(anno, mese, 1, 12, 0, 0).toISOString().split('T')[0];
  _finCalModo = 'mese';
  caricaFinanze();
}

// ── Calcolo range e label in base al modo ──
function _finCalRange() {
  var daISO, aISO, inizioMeseISO, fineMeseISO, label;
  if (_finCalModo === 'settimana') {
    var anc = new Date(_finCalAncora + 'T12:00:00');
    var dow = anc.getDay();
    var diffLun = dow === 0 ? -6 : 1 - dow;
    var lun = new Date(anc); lun.setDate(anc.getDate() + diffLun);
    var dom = new Date(lun); dom.setDate(lun.getDate() + 6);
    daISO = lun.toISOString().split('T')[0];
    aISO = dom.toISOString().split('T')[0];
    inizioMeseISO = daISO;
    fineMeseISO = aISO;
    label = 'Settimana ' + _finFmtDataBreve(daISO) + ' – ' + _finFmtDataBreve(aISO);
  } else if (_finCalModo === 'anno') {
    daISO = _finCalAnno + '-01-01';
    aISO = _finCalAnno + '-12-31';
    inizioMeseISO = daISO;
    fineMeseISO = aISO;
    label = 'Anno ' + _finCalAnno;
  } else { // mese
    var inizioMese = new Date(_finCalAnno, _finCalMese, 1, 12, 0, 0);
    var fineMese = new Date(_finCalAnno, _finCalMese + 1, 0, 12, 0, 0);
    inizioMeseISO = inizioMese.toISOString().split('T')[0];
    fineMeseISO = fineMese.toISOString().split('T')[0];
    daISO = new Date(_finCalAnno, _finCalMese, -7, 12, 0, 0).toISOString().split('T')[0];
    aISO = new Date(_finCalAnno, _finCalMese + 1, 7, 12, 0, 0).toISOString().split('T')[0];
    label = _FIN_MESI[_finCalMese] + ' ' + _finCalAnno;
  }
  return { daISO: daISO, aISO: aISO, inizioMeseISO: inizioMeseISO, fineMeseISO: fineMeseISO, label: label };
}

function _finFmtDataBreve(iso) {
  var p = iso.split('-');
  return p[2] + '/' + p[1];
}

// ────────────────────────────────────────────────────────────────────────
// CARICAMENTO DATI
// ────────────────────────────────────────────────────────────────────────
async function caricaFinanze() {
  var rng = _finCalRange();
  document.getElementById('fin-cal-mese-label').textContent = rng.label;

  // Aggiorna stato visuale bottoni modo
  ['settimana','mese','anno'].forEach(function(m){
    var b = document.getElementById('fin-cal-modo-' + m);
    if (b) {
      var attivo = (_finCalModo === m);
      b.style.background = attivo ? '#185FA5' : 'var(--bg)';
      b.style.color = attivo ? '#fff' : 'var(--text)';
      b.style.borderColor = attivo ? '#185FA5' : 'var(--border)';
      b.style.fontWeight = attivo ? '600' : '400';
    }
  });

  // Finestra estesa ordini fornitori: copre dilazioni fino a 90gg
  var daISOForn;
  if (_finCalModo === 'anno') {
    daISOForn = new Date(_finCalAnno - 1, 9, 1, 12, 0, 0).toISOString().split('T')[0];
  } else if (_finCalModo === 'settimana') {
    daISOForn = new Date(new Date(rng.daISO + 'T12:00:00').getTime() - 90*86400000).toISOString().split('T')[0];
  } else {
    daISOForn = new Date(_finCalAnno, _finCalMese, -90, 12, 0, 0).toISOString().split('T')[0];
  }

  var [ordCliRes, ordForRes, cassaRes, fornitoriRes] = await Promise.all([
    sb.from('ordini').select('id,data,cliente,prodotto,litri,costo_litro,trasporto_litro,margine,iva,data_scadenza,giorni_pagamento,pagato')
      .eq('tipo_ordine','cliente').neq('stato','annullato').eq('pagato',false)
      .gte('data_scadenza',rng.daISO).lte('data_scadenza',rng.aISO),
    sb.from('ordini').select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,giorni_pagamento,pagato_fornitore')
      .neq('stato','annullato').eq('pagato_fornitore',false)
      .not('fornitore','ilike','%phoenix%').not('fornitore','ilike','%deposito%').not('fornitore','ilike','%rientro%')
      .gte('data',daISOForn),
    sb.from('stazione_cassa').select('data,bancomat,carte_nexi,carte_aziendali,contanti_da_versare,versato')
      .gte('data',rng.inizioMeseISO).lte('data',rng.fineMeseISO).order('data'),
    sb.from('fornitori').select('nome,giorni_pagamento,colore')
  ]);

  var ordClienti = ordCliRes.data || [];
  var ordFornitori = ordForRes.data || [];
  var cassaDati = cassaRes.data || [];
  var fornitoriMap = {};
  _finForColori = {};
  (fornitoriRes.data || []).forEach(function(f) {
    fornitoriMap[f.nome] = f;
    _finForColori[f.nome] = f.colore || '#FAEEDA';
  });

  var giornoMap = {};
  function getGiorno(data) {
    if (!giornoMap[data]) giornoMap[data] = { entrateDettaglio: [], usciteDettaglio: [], stazione: 0, stazioneDettaglio: null };
    return giornoMap[data];
  }

  function spostaAlLunedi(dataStr) {
    var d = new Date(dataStr + 'T12:00:00');
    var giorno = d.getDay();
    if (giorno === 6) d.setDate(d.getDate() + 2);
    if (giorno === 0) d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  }

  function prezzoConIva(o) {
    var p = Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0) + Number(o.margine || 0);
    return p * (1 + Number(o.iva || 22) / 100);
  }

  // 1. Entrate ingrosso
  ordClienti.forEach(function(o) {
    if (!o.data_scadenza) return;
    var scadEffettiva = spostaAlLunedi(o.data_scadenza);
    getGiorno(scadEffettiva).entrateDettaglio.push({
      cliente: o.cliente, importo: prezzoConIva(o) * Number(o.litri),
      prodotto: o.prodotto, litri: Number(o.litri)
    });
  });

  // 2. Uscite fornitori
  ordFornitori.forEach(function(o) {
    if (!o.data || !o.fornitore) return;
    var fn = o.fornitore.toLowerCase();
    if (fn.indexOf('phoenix') >= 0 || fn.indexOf('deposito') >= 0) return;
    var ggPag = o.giorni_pagamento || (fornitoriMap[o.fornitore] ? fornitoriMap[o.fornitore].giorni_pagamento : 30) || 30;
    var scad = new Date(o.data + 'T12:00:00');
    scad.setDate(scad.getDate() + ggPag);
    var scadEffettiva = spostaAlLunedi(scad.toISOString().split('T')[0]);
    var importo = (Number(o.costo_litro) + Number(o.trasporto_litro || 0)) * Number(o.litri) * (1 + Number(o.iva || 22) / 100);
    getGiorno(scadEffettiva).usciteDettaglio.push({
      fornitore: o.fornitore, importo: importo,
      prodotto: o.prodotto, litri: Number(o.litri)
    });
  });

  // 3. Entrate stazione
  cassaDati.forEach(function(c) {
    var totIncasso = Number(c.bancomat || 0) + Number(c.carte_nexi || 0) + Number(c.carte_aziendali || 0) + Number(c.versato || 0);
    if (totIncasso > 0) {
      getGiorno(c.data).stazione = totIncasso;
      getGiorno(c.data).stazioneDettaglio = {
        carte: Number(c.bancomat || 0) + Number(c.carte_nexi || 0) + Number(c.carte_aziendali || 0),
        contanti: Number(c.versato || 0)
      };
    }
  });

  _finCalDati = giornoMap;

  // KPI: sommano sul periodo visibile
  var totEntrate = 0, totUscite = 0, totStazione = 0, totFattCli = 0;
  Object.keys(giornoMap).forEach(function(data) {
    if (data >= rng.inizioMeseISO && data <= rng.fineMeseISO) {
      var g = giornoMap[data];
      g.entrateDettaglio.forEach(function(e) { totFattCli += e.importo; });
      totStazione += g.stazione;
      g.usciteDettaglio.forEach(function(u) { totUscite += u.importo; });
    }
  });
  totEntrate = totFattCli + totStazione;
  var saldoColor = (totEntrate - totUscite) >= 0 ? '#639922' : '#E24B4A';
  document.getElementById('fin-kpi').innerHTML =
    '<div class="kpi"><div class="kpi-label">Entrate ingrosso</div><div class="kpi-value" style="color:#639922">' + fmtE(totFattCli) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Entrate stazione</div><div class="kpi-value" style="color:#378ADD">' + fmtE(totStazione) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Uscite fornitori</div><div class="kpi-value" style="color:#E24B4A">' + fmtE(totUscite) + '</div></div>' +
    '<div class="kpi" style="border:1px solid ' + saldoColor + '"><div class="kpi-label">Saldo netto previsto</div><div class="kpi-value" style="color:' + saldoColor + '">' + (totEntrate - totUscite >= 0 ? '+' : '') + ' ' + fmtE(totEntrate - totUscite) + '</div></div>';

  renderCalendarioFinanze();
}

// ────────────────────────────────────────────────────────────────────────
// RENDERING — dispatch in base a _finCalModo
// ────────────────────────────────────────────────────────────────────────
function renderCalendarioFinanze() {
  if (_finCalModo === 'settimana') return _finCalRenderSettimana();
  if (_finCalModo === 'anno')      return _finCalRenderAnno();
  return _finCalRenderMese();
}

// ── Helper: HTML interno della cella giorno (entrate/stazione/uscite pillole) ──
function _finCalHtmlCellaContenuto(g, dataStr, filtro) {
  var html = '';

  var uscitePerFor = {};
  g.usciteDettaglio.forEach(function(u) {
    if (!uscitePerFor[u.fornitore]) uscitePerFor[u.fornitore] = 0;
    uscitePerFor[u.fornitore] += u.importo;
  });
  var totEntrateGiorno = g.entrateDettaglio.reduce(function(s, e) { return s + e.importo; }, 0);

  var mostraEntrate  = filtro === '' || filtro === 'entrate' || filtro === 'ingrosso';
  var mostraStazione = filtro === '' || filtro === 'entrate' || filtro === 'stazione';
  var mostraUscite   = filtro === '' || filtro === 'uscite';

  if (mostraEntrate && totEntrateGiorno > 0) {
    html += '<div onclick="event.stopPropagation();mostraDettaglioFinanze(\'' + dataStr + '\',\'entrate\')" style="cursor:pointer;font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#EAF3DE;color:#27500A;border-left:2px solid #639922">';
    html += '<span>Entrate</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(totEntrateGiorno) + '</span></div>';
  }

  if (mostraStazione && g.stazione > 0) {
    html += '<div style="font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#E6F1FB;color:#0C447C;border-left:2px solid #378ADD">';
    html += '<span>Stazione</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(g.stazione) + '</span></div>';
  }

  if (mostraUscite) {
    Object.keys(uscitePerFor).forEach(function(fornitore) {
      var col = _finForColori[fornitore] || '#FAEEDA';
      html += '<div onclick="event.stopPropagation();mostraDettaglioFinanze(\'' + dataStr + '\',\'uscite\')" style="cursor:pointer;font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:' + col + ';color:#791F1F;border-left:2px solid #E24B4A">';
      html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;font-weight:600">' + esc(fornitore) + '</span>';
      html += '<span style="font-family:var(--font-mono);font-weight:600;white-space:nowrap">' + _fmtCompact(uscitePerFor[fornitore]) + '</span></div>';
    });
  }

  var totE = (mostraEntrate ? totEntrateGiorno : 0) + (mostraStazione ? g.stazione : 0);
  var totU = mostraUscite ? Object.values(uscitePerFor).reduce(function(s, v) { return s + v; }, 0) : 0;
  if (totE > 0 || totU > 0) {
    var netto = totE - totU;
    var nColor = netto >= 0 ? 'background:#EEEDFE;color:#26215C' : 'background:#FCEBEB;color:#791F1F';
    html += '<div style="display:flex;gap:3px;margin-top:3px;padding-top:3px;border-top:1px dashed #e8e7e3">';
    if (totE > 0) html += '<div style="flex:1;text-align:center;font-size:7px;font-weight:600;padding:1px 0;border-radius:2px;background:#EAF3DE;color:#27500A">+' + _fmtCompact(totE) + '</div>';
    if (totU > 0) html += '<div style="flex:1;text-align:center;font-size:7px;font-weight:600;padding:1px 0;border-radius:2px;background:#FCEBEB;color:#791F1F">-' + _fmtCompact(totU) + '</div>';
    html += '<div style="flex:1;text-align:center;font-size:7px;font-weight:700;padding:1px 0;border-radius:2px;' + nColor + '">' + (netto >= 0 ? '+' : '') + _fmtCompact(netto) + '</div>';
    html += '</div>';
  }

  return html;
}

// ────────────────────────────────────────────────────────────────────────
// VISTA MESE (default)
// ────────────────────────────────────────────────────────────────────────
function _finCalRenderMese() {
  var filtro = document.getElementById('fin-cal-filtro')?.value || '';
  var giornoMap = _finCalDati || {};
  // Mezzogiorno locale per evitare shift UTC che sfaserebbe la griglia
  var primoGiorno = new Date(_finCalAnno, _finCalMese, 1, 12, 0, 0);
  var inizioGriglia = new Date(primoGiorno);
  var offset = (primoGiorno.getDay() + 6) % 7;
  inizioGriglia.setDate(inizioGriglia.getDate() - offset);
  var oggiStr = new Date().toISOString().split('T')[0];

  var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(function(g) {
    html += '<div style="text-align:center;font-size:10px;font-weight:600;color:var(--text-hint);text-transform:uppercase;padding:6px 0;letter-spacing:0.5px">' + g + '</div>';
  });

  var corrente = new Date(inizioGriglia);
  for (var i = 0; i < 42; i++) {
    var dataStr = corrente.toISOString().split('T')[0];
    var isThisMonth = corrente.getMonth() === _finCalMese;
    var isToday = dataStr === oggiStr;
    var isWeekend = corrente.getDay() === 0 || corrente.getDay() === 6;
    var g = giornoMap[dataStr] || { entrateDettaglio: [], usciteDettaglio: [], stazione: 0 };

    var bgStyle = isToday ? 'border:2px solid #D85A30;' : 'border:1px solid #e8e7e3;';
    bgStyle += isWeekend ? 'background:#fafaf8;' : 'background:#fff;';
    if (!isThisMonth) bgStyle += 'opacity:0.3;';

    html += '<div onclick="mostraDettaglioFinanze(\'' + dataStr + '\',\'tutto\')" style="' + bgStyle + 'border-radius:10px;min-height:110px;padding:6px;cursor:pointer" onmouseover="this.style.boxShadow=\'0 0 0 2px #185FA533\'" onmouseout="this.style.boxShadow=\'none\'">';
    html += '<div style="font-size:13px;font-weight:600;color:' + (isToday ? '#D85A30' : 'var(--text)') + ';margin-bottom:4px">' + corrente.getDate() + '</div>';
    html += _finCalHtmlCellaContenuto(g, dataStr, filtro);
    html += '</div>';

    corrente.setDate(corrente.getDate() + 1);
    if (i >= 27 && corrente.getMonth() !== _finCalMese && corrente.getDay() === 1) break;
  }
  html += '</div>';
  document.getElementById('fin-calendario').innerHTML = html;
}

// ────────────────────────────────────────────────────────────────────────
// VISTA SETTIMANA (7 celle in linea, più alte)
// ────────────────────────────────────────────────────────────────────────
function _finCalRenderSettimana() {
  var filtro = document.getElementById('fin-cal-filtro')?.value || '';
  var giornoMap = _finCalDati || {};
  var rng = _finCalRange();
  var lun = new Date(rng.daISO + 'T12:00:00');
  var oggiStr = new Date().toISOString().split('T')[0];

  var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(function(g) {
    html += '<div style="text-align:center;font-size:10px;font-weight:600;color:var(--text-hint);text-transform:uppercase;padding:6px 0;letter-spacing:0.5px">' + g + '</div>';
  });

  var corrente = new Date(lun);
  for (var i = 0; i < 7; i++) {
    var dataStr = corrente.toISOString().split('T')[0];
    var isToday = dataStr === oggiStr;
    var isWeekend = corrente.getDay() === 0 || corrente.getDay() === 6;
    var g = giornoMap[dataStr] || { entrateDettaglio: [], usciteDettaglio: [], stazione: 0 };

    var bgStyle = isToday ? 'border:2px solid #D85A30;' : 'border:1px solid #e8e7e3;';
    bgStyle += isWeekend ? 'background:#fafaf8;' : 'background:#fff;';

    var dataFmt = corrente.getDate() + ' ' + _FIN_MESI[corrente.getMonth()].substring(0,3).toLowerCase();

    html += '<div onclick="mostraDettaglioFinanze(\'' + dataStr + '\',\'tutto\')" style="' + bgStyle + 'border-radius:10px;min-height:280px;padding:8px;cursor:pointer" onmouseover="this.style.boxShadow=\'0 0 0 2px #185FA533\'" onmouseout="this.style.boxShadow=\'none\'">';
    html += '<div style="font-size:14px;font-weight:600;color:' + (isToday ? '#D85A30' : 'var(--text)') + ';margin-bottom:6px">' + dataFmt + '</div>';
    html += _finCalHtmlCellaContenuto(g, dataStr, filtro);
    html += '</div>';

    corrente.setDate(corrente.getDate() + 1);
  }
  html += '</div>';
  document.getElementById('fin-calendario').innerHTML = html;
}

// ────────────────────────────────────────────────────────────────────────
// VISTA ANNO (12 mini-card mese, click → vista mese)
// ────────────────────────────────────────────────────────────────────────
function _finCalRenderAnno() {
  var giornoMap = _finCalDati || {};
  var perMese = [];
  for (var m = 0; m < 12; m++) {
    perMese.push({ mese: m, entrate: 0, stazione: 0, uscite: 0 });
  }
  Object.keys(giornoMap).forEach(function(data) {
    if (data.substring(0, 4) !== String(_finCalAnno)) return;
    var mm = parseInt(data.substring(5, 7)) - 1;
    if (mm < 0 || mm > 11) return;
    var g = giornoMap[data];
    g.entrateDettaglio.forEach(function(e) { perMese[mm].entrate += e.importo; });
    perMese[mm].stazione += g.stazione;
    g.usciteDettaglio.forEach(function(u) { perMese[mm].uscite += u.importo; });
  });

  var oggiMese = (new Date().getFullYear() === _finCalAnno) ? new Date().getMonth() : -1;

  var html = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:10px">';
  for (var i = 0; i < 12; i++) {
    var mc = perMese[i];
    var totE = mc.entrate + mc.stazione;
    var netto = totE - mc.uscite;
    var nettoColor = netto >= 0 ? '#27500A' : '#791F1F';
    var nettoBg = netto >= 0 ? '#EAF3DE' : '#FCEBEB';
    var isOggi = (i === oggiMese);
    var border = isOggi ? '2px solid #D85A30' : '1px solid #e8e7e3';

    html += '<div onclick="finCalVaiAlMese(' + _finCalAnno + ',' + i + ')" style="border:' + border + ';border-radius:10px;padding:12px;cursor:pointer;background:#fff;transition:transform 0.1s" onmouseover="this.style.transform=\'translateY(-2px)\';this.style.boxShadow=\'0 4px 12px rgba(0,0,0,0.08)\'" onmouseout="this.style.transform=\'translateY(0)\';this.style.boxShadow=\'none\'">';
    html += '<div style="font-size:13px;font-weight:600;color:' + (isOggi ? '#D85A30' : 'var(--text)') + ';margin-bottom:10px">' + _FIN_MESI[i] + '</div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#27500A"><span>↑ Entrate</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(mc.entrate) + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#0C447C"><span>↑ Stazione</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(mc.stazione) + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;font-size:11px;padding:3px 0;color:#791F1F"><span>↓ Uscite</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(mc.uscite) + '</span></div>';
    html += '<div style="display:flex;justify-content:space-between;margin-top:8px;padding:6px 8px;border-radius:6px;background:' + nettoBg + ';color:' + nettoColor + ';font-size:12px;font-weight:700"><span>Netto</span><span style="font-family:var(--font-mono)">' + (netto >= 0 ? '+' : '') + _fmtCompact(netto) + '</span></div>';
    html += '</div>';
  }
  html += '</div>';
  document.getElementById('fin-calendario').innerHTML = html;
}

// ────────────────────────────────────────────────────────────────────────
// MODALE DETTAGLIO GIORNO — accetta 'entrate' | 'uscite' | 'tutto'
// ────────────────────────────────────────────────────────────────────────
function mostraDettaglioFinanze(dataStr, tipo) {
  var g = (_finCalDati || {})[dataStr];
  var dataFmt = new Date(dataStr + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  if (!g) {
    var emptyHtml = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">📅 Dettaglio giornata</div>';
    emptyHtml += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + dataFmt + '</div>';
    emptyHtml += '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px;background:var(--bg);border-radius:8px">Nessun movimento previsto per questa data.</div>';
    apriModal(emptyHtml);
    return;
  }

  var titolo = (tipo === 'entrate') ? '🟢 Dettaglio entrate'
             : (tipo === 'uscite')  ? '🔴 Dettaglio uscite fornitori'
             : '📅 Dettaglio giornata';

  var html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">' + titolo + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + dataFmt + '</div>';

  // ENTRATE
  if (tipo === 'entrate' || tipo === 'tutto') {
    var perCliente = {};
    g.entrateDettaglio.forEach(function(e) {
      if (!perCliente[e.cliente]) perCliente[e.cliente] = { importo: 0, dettagli: [] };
      perCliente[e.cliente].importo += e.importo;
      perCliente[e.cliente].dettagli.push(e.prodotto + ' ' + fmtL(e.litri));
    });
    var totaleEnt = 0;
    if (Object.keys(perCliente).length > 0) {
      if (tipo === 'tutto') html += '<div style="font-size:12px;font-weight:600;color:#27500A;margin:14px 0 6px">🟢 ENTRATE INGROSSO</div>';
      html += '<div style="max-height:300px;overflow-y:auto">';
      Object.keys(perCliente).sort(function(a, b) { return perCliente[b].importo - perCliente[a].importo; }).forEach(function(cl) {
        var c = perCliente[cl];
        totaleEnt += c.importo;
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg);border-left:3px solid #639922;border-radius:0 8px 8px 0;margin-bottom:4px">';
        html += '<div><div style="font-weight:500">' + esc(cl) + '</div><div style="font-size:10px;color:var(--text-muted)">' + c.dettagli.join(' · ') + '</div></div>';
        html += '<div style="font-family:var(--font-mono);font-weight:600;font-size:14px;color:#639922;white-space:nowrap;margin-left:10px">' + fmtE(c.importo) + '</div></div>';
      });
      html += '</div>';
      html += '<div style="display:flex;justify-content:space-between;padding:10px 12px;margin-top:6px;background:#EAF3DE;border-radius:8px;font-weight:700"><span>TOTALE ENTRATE</span><span style="font-family:var(--font-mono);color:#27500A;font-size:15px">' + fmtE(totaleEnt) + '</span></div>';
    } else if (tipo === 'entrate') {
      html += '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Nessuna entrata prevista per questa data.</div>';
    }
  }

  // STAZIONE (solo in 'tutto')
  if (tipo === 'tutto' && g.stazione > 0) {
    html += '<div style="font-size:12px;font-weight:600;color:#0C447C;margin:14px 0 6px">↑ INCASSI STAZIONE</div>';
    var det = g.stazioneDettaglio || { carte: 0, contanti: 0 };
    html += '<div style="display:flex;justify-content:space-between;padding:10px 12px;background:#E6F1FB;border-left:3px solid #378ADD;border-radius:0 8px 8px 0;font-weight:600">';
    html += '<div>Carte ' + fmtE(det.carte) + ' · Contanti ' + fmtE(det.contanti) + '</div>';
    html += '<div style="font-family:var(--font-mono);color:#378ADD">' + fmtE(g.stazione) + '</div>';
    html += '</div>';
  }

  // USCITE
  if (tipo === 'uscite' || tipo === 'tutto') {
    var perFornitore = {};
    g.usciteDettaglio.forEach(function(u) {
      if (!perFornitore[u.fornitore]) perFornitore[u.fornitore] = { importo: 0, dettagli: [] };
      perFornitore[u.fornitore].importo += u.importo;
      perFornitore[u.fornitore].dettagli.push(u.prodotto + ' ' + fmtL(u.litri));
    });
    var totaleUsc = 0;
    if (Object.keys(perFornitore).length > 0) {
      if (tipo === 'tutto') html += '<div style="font-size:12px;font-weight:600;color:#791F1F;margin:14px 0 6px">🔴 USCITE FORNITORI</div>';
      html += '<div style="max-height:300px;overflow-y:auto">';
      Object.keys(perFornitore).sort(function(a, b) { return perFornitore[b].importo - perFornitore[a].importo; }).forEach(function(fo) {
        var f = perFornitore[fo];
        totaleUsc += f.importo;
        var col = _finForColori[fo] || '#FAEEDA';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:' + col + ';border-left:3px solid #E24B4A;border-radius:0 8px 8px 0;margin-bottom:4px">';
        html += '<div><div style="font-weight:600">' + esc(fo) + '</div><div style="font-size:10px;color:var(--text-muted)">' + f.dettagli.join(' · ') + '</div></div>';
        html += '<div style="font-family:var(--font-mono);font-weight:600;font-size:14px;color:#E24B4A;white-space:nowrap;margin-left:10px">' + fmtE(f.importo) + '</div></div>';
      });
      html += '</div>';
      html += '<div style="display:flex;justify-content:space-between;padding:10px 12px;margin-top:6px;background:#FCEBEB;border-radius:8px;font-weight:700"><span>TOTALE USCITE</span><span style="font-family:var(--font-mono);color:#791F1F;font-size:15px">' + fmtE(totaleUsc) + '</span></div>';
    } else if (tipo === 'uscite') {
      html += '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Nessuna uscita prevista per questa data.</div>';
    }
  }

  // Netto in 'tutto'
  if (tipo === 'tutto') {
    var tE = g.entrateDettaglio.reduce(function(s,e){return s+e.importo;},0) + g.stazione;
    var tU = g.usciteDettaglio.reduce(function(s,u){return s+u.importo;},0);
    var nettoG = tE - tU;
    var nettoColorG = nettoG >= 0 ? '#27500A' : '#791F1F';
    var nettoBgG = nettoG >= 0 ? '#EAF3DE' : '#FCEBEB';
    html += '<div style="display:flex;justify-content:space-between;padding:12px;margin-top:14px;background:' + nettoBgG + ';border-radius:8px;font-weight:700;font-size:14px"><span>NETTO GIORNATA</span><span style="font-family:var(--font-mono);color:' + nettoColorG + ';font-size:16px">' + (nettoG >= 0 ? '+' : '') + fmtE(nettoG) + '</span></div>';
  }

  apriModal(html);
}

function _fmtCompact(n) {
  if (Math.abs(n) >= 1000) return '€' + Math.round(n / 1000) + 'k';
  return '€' + Math.round(n);
}

// Export globals per onclick inline
window.finCalMese              = finCalMese;
window.finCalCambiaModo        = finCalCambiaModo;
window.finCalVaiAlMese         = finCalVaiAlMese;
window.caricaFinanze           = caricaFinanze;
window.renderCalendarioFinanze = renderCalendarioFinanze;
window.mostraDettaglioFinanze  = mostraDettaglioFinanze;
