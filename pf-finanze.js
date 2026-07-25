// PhoenixFuel — Finanze: Calendario Entrate/Uscite
// v2 (24/05/2026): modo settimana / mese / anno + click cella + fix timezone griglia

'use strict';

var _finCalAnno = new Date().getFullYear();
var _finCalMese = new Date().getMonth();

// Helper "oggi" locale: evita il bug di toISOString() che in fuso UTC+2 di notte ritorna giorno precedente
function _finOggiISO() {
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,'0');
  var dd = String(d.getDate()).padStart(2,'0');
  return y + '-' + m + '-' + dd;
}

var _finCalAncora = _finOggiISO(); // ancora ISO per modo settimana
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

  var [ordCliRes, ordForRes, cassaRes, fornitoriRes, fattScadRes] = await Promise.all([
    sb.from('ordini').select('id,data,cliente,prodotto,litri,costo_litro,trasporto_litro,margine,iva,data_scadenza,giorni_pagamento,pagato,data_pagamento')
      .eq('tipo_ordine','cliente').neq('stato','annullato')
      .gte('data_scadenza',rng.daISO).lte('data_scadenza',rng.aISO),
    sb.from('ordini').select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,giorni_pagamento,pagato_fornitore,data_pagamento_fornitore,fattura_ricevuta_id')
      .neq('stato','annullato')
      .not('fornitore','ilike','%phoenix%').not('fornitore','ilike','%deposito%').not('fornitore','ilike','%rientro%')
      .gte('data',daISOForn),
    sb.from('stazione_cassa').select('data,bancomat,carte_nexi,carte_aziendali,contanti_da_versare,versato')
      .gte('data',rng.inizioMeseISO).lte('data',rng.fineMeseISO).order('data'),
    sb.from('fornitori').select('nome,giorni_pagamento,colore'),
    sb.from('fatture_ricevute').select('id,data_scadenza')
  ]);
  var _finScadFatture = {};
  (fattScadRes && fattScadRes.data ? fattScadRes.data : []).forEach(function (f) { _finScadFatture[f.id] = f.data_scadenza; });

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
      prodotto: o.prodotto, litri: Number(o.litri),
      pagato: !!o.pagato,
      dataPagamento: o.data_pagamento || null
    });
  });

  // 2. Uscite fornitori
  ordFornitori.forEach(function(o) {
    if (!o.data || !o.fornitore) return;
    var fn = o.fornitore.toLowerCase();
    if (fn.indexOf('phoenix') >= 0 || fn.indexOf('deposito') >= 0) return;
    // REGOLA UNICA (pfScadenzaFornitore): giorni SEMPRE del fornitore, mai dell'ordine;
    // se l'ordine sta su una fattura cumulativa comanda la scadenza della fattura.
    var ggPag = (fornitoriMap[o.fornitore] ? fornitoriMap[o.fornitore].giorni_pagamento : 30) || 30;
    var scadFatt = (o.fattura_ricevuta_id && _finScadFatture) ? _finScadFatture[o.fattura_ricevuta_id] : null;
    var scadEffettiva = (typeof pfScadenzaFornitore === 'function')
      ? pfScadenzaFornitore(o.data, ggPag, scadFatt)
      : spostaAlLunedi(o.data);
    // Solo costo_litro: il trasporto è fatturato dal vettore terzo, non dal fornitore carburante
    var importo = Number(o.costo_litro) * Number(o.litri) * (1 + Number(o.iva || 22) / 100);
    getGiorno(scadEffettiva).usciteDettaglio.push({
      fornitore: o.fornitore, importo: importo,
      prodotto: o.prodotto, litri: Number(o.litri),
      pagato: !!o.pagato_fornitore,
      dataPagamento: o.data_pagamento_fornitore || null
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
      g.entrateDettaglio.forEach(function(e) {
        // KPI = SALDO netto previsto → escludo entrate già incassate
        if (!e.pagato) totFattCli += e.importo;
      });
      totStazione += g.stazione;
      g.usciteDettaglio.forEach(function(u) {
        // KPI = SALDO netto previsto → escludo uscite già pagate
        if (!u.pagato) totUscite += u.importo;
      });
    }
  });
  totEntrate = totFattCli + totStazione;
  var saldoColor = (totEntrate - totUscite) >= 0 ? '#639922' : '#E24B4A';
  document.getElementById('fin-kpi').innerHTML =
    '<div class="kpi"><div class="kpi-label">Da incassare ingrosso</div><div class="kpi-value" style="color:#639922">' + fmtE(totFattCli) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Entrate stazione</div><div class="kpi-value" style="color:#378ADD">' + fmtE(totStazione) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Da pagare fornitori</div><div class="kpi-value" style="color:#E24B4A">' + fmtE(totUscite) + '</div></div>' +
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
// ═══════════════════════════════════════════════════════════════════
// SCADENZA FORNITORE NON PAGATA (25/07 — richiesta Rinaldo)
// Un giorno GIA PASSATO che porta ancora uscite fornitore non pagate deve
// saltare all'occhio: cella su fondo rosso tenue e fascia in basso con
// l'icona e l'importo ancora scoperto. Oggi e i giorni futuri non si
// colorano; appena il pagamento viene registrato la cella torna normale.
// ═══════════════════════════════════════════════════════════════════
function _finCalScaduto(g, dataStr) {
  var oggi = new Date(); oggi.setHours(12, 0, 0, 0);
  var oggiStr = new Date(oggi.getTime() - oggi.getTimezoneOffset() * 60000).toISOString().split('T')[0];
  if (!dataStr || dataStr >= oggiStr) return null;
  var tot = 0, n = 0;
  (g.usciteDettaglio || []).forEach(function (u) {
    if (u.pagato) return;
    tot += Number(u.importo || 0);
    n++;
  });
  if (!n) return null;
  return { n: n, tot: Math.round(tot * 100) / 100 };
}

function _finCalHtmlCellaContenuto(g, dataStr, filtro) {
  var html = '';

  // Aggrega uscite per (fornitore, pagato) → max 2 pillole per fornitore (pagato vs no)
  var uscitePerFor = {}; // { fornitore: { tot: 0, totPag: 0 } }
  g.usciteDettaglio.forEach(function(u) {
    if (!uscitePerFor[u.fornitore]) uscitePerFor[u.fornitore] = { tot: 0, totPag: 0 };
    if (u.pagato) uscitePerFor[u.fornitore].totPag += u.importo;
    else uscitePerFor[u.fornitore].tot += u.importo;
  });
  // Aggrega entrate per (pagato/no)
  var totEntrateNonPag = 0, totEntratePag = 0;
  g.entrateDettaglio.forEach(function(e) {
    if (e.pagato) totEntratePag += e.importo;
    else totEntrateNonPag += e.importo;
  });
  var totEntrateGiorno = totEntrateNonPag + totEntratePag;

  var mostraEntrate  = filtro === '' || filtro === 'entrate' || filtro === 'ingrosso';
  var mostraStazione = filtro === '' || filtro === 'entrate' || filtro === 'stazione';
  var mostraUscite   = filtro === '' || filtro === 'uscite';

  if (mostraEntrate) {
    if (totEntrateNonPag > 0) {
      html += '<div onclick="event.stopPropagation();mostraDettaglioFinanze(\'' + dataStr + '\',\'entrate\')" style="cursor:pointer;font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#EAF3DE;color:#27500A;border-left:2px solid #639922">';
      html += '<span>Entrate</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(totEntrateNonPag) + '</span></div>';
    }
    if (totEntratePag > 0) {
      // Pagate in anticipo: trasparenti con ✓
      html += '<div onclick="event.stopPropagation();mostraDettaglioFinanze(\'' + dataStr + '\',\'entrate\')" style="cursor:pointer;font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#EAF3DE;color:#27500A;border-left:2px solid #639922;opacity:0.45">';
      html += '<span>✓ Entrate</span><span style="font-family:var(--font-mono);font-weight:600;text-decoration:line-through">' + _fmtCompact(totEntratePag) + '</span></div>';
    }
  }

  if (mostraStazione && g.stazione > 0) {
    html += '<div style="font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#E6F1FB;color:#0C447C;border-left:2px solid #378ADD">';
    html += '<span>Stazione</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(g.stazione) + '</span></div>';
  }

  if (mostraUscite) {
    Object.keys(uscitePerFor).forEach(function(fornitore) {
      var col = _finForColori[fornitore] || '#FAEEDA';
      var dati = uscitePerFor[fornitore];
      if (dati.tot > 0) {
        // Non pagata: pillola normale
        html += '<div onclick="event.stopPropagation();mostraDettaglioFinanze(\'' + dataStr + '\',\'uscite\')" style="cursor:pointer;font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:' + col + ';color:#791F1F;border-left:2px solid #E24B4A">';
        html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;font-weight:600">' + esc(fornitore) + '</span>';
        html += '<span style="font-family:var(--font-mono);font-weight:600;white-space:nowrap">' + _fmtCompact(dati.tot) + '</span></div>';
      }
      if (dati.totPag > 0) {
        // Pagata in anticipo: trasparente + ✓ + strikethrough
        html += '<div onclick="event.stopPropagation();mostraDettaglioFinanze(\'' + dataStr + '\',\'uscite\')" style="cursor:pointer;font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:' + col + ';color:#791F1F;border-left:2px solid #E24B4A;opacity:0.45">';
        html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;font-weight:600">✓ ' + esc(fornitore) + '</span>';
        html += '<span style="font-family:var(--font-mono);font-weight:600;white-space:nowrap;text-decoration:line-through">' + _fmtCompact(dati.totPag) + '</span></div>';
      }
    });
  }

  // Footer netto: conta SOLO il NON pagato (semantica "ancora da incassare/pagare")
  var totUNonPag = 0;
  Object.values(uscitePerFor).forEach(function(d){ totUNonPag += d.tot; });
  var totE = (mostraEntrate ? totEntrateNonPag : 0) + (mostraStazione ? g.stazione : 0);
  var totU = mostraUscite ? totUNonPag : 0;
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
  var oggiStr = _finOggiISO();

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

    var scad = _finCalScaduto(g, dataStr);
    var bgStyle = isToday ? 'border:2px solid #D85A30;' : (scad ? 'border:1px solid #E24B4A;' : 'border:1px solid #e8e7e3;');
    bgStyle += scad ? 'background:#FCEBEB;' : (isWeekend ? 'background:#fafaf8;' : 'background:#fff;');
    if (!isThisMonth) bgStyle += 'opacity:0.3;';

    html += '<div onclick="mostraDettaglioFinanze(\'' + dataStr + '\',\'tutto\')" style="' + bgStyle + 'border-radius:10px;min-height:110px;padding:6px;cursor:pointer;display:flex;flex-direction:column" onmouseover="this.style.boxShadow=\'0 0 0 2px #185FA533\'" onmouseout="this.style.boxShadow=\'none\'"'
      + (scad ? ' title="Scadenza fornitore non pagata: ' + fmtE(scad.tot) + '"' : '') + '>';
    html += '<div style="font-size:13px;font-weight:600;color:' + (scad ? '#A32D2D' : (isToday ? '#D85A30' : 'var(--text)')) + ';margin-bottom:4px;display:flex;align-items:center;gap:5px">'
      + (scad ? '<span style="width:7px;height:7px;border-radius:50%;background:#E24B4A;display:inline-block"></span>' : '')
      + corrente.getDate() + '</div>';
    html += _finCalHtmlCellaContenuto(g, dataStr, filtro);
    if (scad) {
      html += '<div style="margin-top:auto;padding-top:4px"><div style="display:flex;align-items:center;gap:4px;background:#E24B4A;color:#fff;border-radius:5px;padding:3px 6px;font-size:10.5px;font-weight:600;line-height:1.3">'
        + '<span style="font-size:12px">⏰</span>'
        + (scad.n > 1 ? scad.n + ' scadute ' : 'scaduta ') + fmtE(scad.tot)
        + '</div></div>';
    }
    html += '</div>';

    corrente.setDate(corrente.getDate() + 1);
    if (i >= 27 && corrente.getMonth() !== _finCalMese && corrente.getDay() === 1) break;
  }
  html += '</div>';
  document.getElementById('fin-calendario').innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════
// SETTIMANA IN DASHBOARD (25/07) — la stessa vista settimanale del
// calendario, portata sotto gli Anticipi fatture e navigabile SOLO per
// settimana. Le scadenze fornitore non pagate e gia passate si accendono
// in rosso con l'importo scoperto, come nel calendario grande.
// Uscite fornitore dalla QUERY MADRE (pfDebitoDati); entrate clienti da
// una lettura leggera sulle sole scadenze della settimana.
// ═══════════════════════════════════════════════════════════════════════
var _dashSetAncora = null;

function _dashSetLunedi(iso) {
  var d = new Date(iso + 'T12:00:00');
  var dow = d.getDay();
  d.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
  return d.toISOString().split('T')[0];
}

function dashSettimanaSposta(delta) {
  var base = _dashSetAncora || _finOggiISO();
  var d = new Date(base + 'T12:00:00');
  d.setDate(d.getDate() + delta * 7);
  _dashSetAncora = d.toISOString().split('T')[0];
  caricaSettimanaDashboard();
}

function dashSettimanaOggi() {
  _dashSetAncora = _finOggiISO();
  caricaSettimanaDashboard();
}

function vaiCalendarioSettimana(dataISO) {
  _finCalModo = 'settimana';
  _finCalAncora = dataISO;
  var nav = document.querySelector('.nav-item[onclick*="finanze"]');
  if (typeof setSection === 'function') { try { setSection('finanze', nav); } catch (e) {} }
  setTimeout(function () { if (typeof caricaFinanze === 'function') caricaFinanze(); }, 150);
}

async function caricaSettimanaDashboard() {
  var el = document.getElementById('dash-settimana');
  if (!el) return;
  try {
    var lunISO = _dashSetLunedi(_dashSetAncora || _finOggiISO());
    var lun = new Date(lunISO + 'T12:00:00');
    var dom = new Date(lun); dom.setDate(lun.getDate() + 6);
    var domISO = dom.toISOString().split('T')[0];
    var oggiStr = _finOggiISO();

    var lab = document.getElementById('dash-settimana-label');
    if (lab) lab.textContent = _finFmtDataBreve(lunISO) + ' – ' + _finFmtDataBreve(domISO);

    // uscite fornitore: query madre
    var giorni = {};
    function G(d) { if (!giorni[d]) giorni[d] = { entrate: 0, uscite: 0, uscitePag: 0, usciteDettaglio: [] }; return giorni[d]; }
    var madre = await pfDebitoDati();
    (madre.ordini || []).forEach(function (o) {
      if (!o.scadenza || o.scadenza < lunISO || o.scadenza > domISO) return;
      var g = G(o.scadenza);
      g.usciteDettaglio.push({ fornitore: o.fornitore, importo: o.totale, pagato: (o.pagato || o.fattSaldata) });
      if (o.pagato || o.fattSaldata) g.uscitePag += o.totale; else g.uscite += o.totale;
    });

    // entrate clienti: solo le scadenze della settimana
    var res = await sb.from('ordini')
      .select('cliente,litri,costo_litro,trasporto_litro,margine,iva,data_scadenza,pagato')
      .eq('tipo_ordine', 'cliente').neq('stato', 'annullato')
      .gte('data_scadenza', lunISO).lte('data_scadenza', domISO);
    (res.data || []).forEach(function (o) {
      var p = (Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0) + Number(o.margine || 0)) * (1 + Number(o.iva || 22) / 100);
      var imp = p * Number(o.litri || 0);
      if (!o.pagato) G(o.data_scadenza).entrate += imp;
    });

    var nomiGG = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom'];
    var h = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';
    nomiGG.forEach(function (n) {
      h += '<div style="text-align:center;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;padding:4px 0;letter-spacing:0.5px">' + n + '</div>';
    });

    var cur = new Date(lun);
    for (var i = 0; i < 7; i++) {
      var dataStr = cur.toISOString().split('T')[0];
      var g = giorni[dataStr] || { entrate: 0, uscite: 0, uscitePag: 0, usciteDettaglio: [] };
      var isToday = dataStr === oggiStr;
      var isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
      var scad = _finCalScaduto(g, dataStr);

      var st = isToday ? 'border:2px solid #D85A30;' : (scad ? 'border:1px solid #E24B4A;' : 'border:1px solid var(--border);');
      st += scad ? 'background:#FCEBEB;' : (isWeekend ? 'background:var(--bg-card);' : 'background:var(--bg);');

      h += '<div onclick="vaiCalendarioSettimana(\'' + dataStr + '\')" title="' + (scad ? 'Scadenza fornitore non pagata: ' + fmtE(scad.tot) : 'Apri il calendario su questa settimana') + '" style="' + st + 'border-radius:9px;min-height:104px;padding:7px;cursor:pointer;display:flex;flex-direction:column">';
      h += '<div style="font-size:13px;font-weight:700;color:' + (scad ? '#A32D2D' : (isToday ? '#D85A30' : 'var(--text)')) + ';margin-bottom:5px;display:flex;align-items:center;gap:4px">'
        + (scad ? '<span style="width:7px;height:7px;border-radius:50%;background:#E24B4A;display:inline-block"></span>' : '')
        + cur.getDate() + '</div>';
      if (g.entrate > 0) h += '<div style="font-size:10.5px;font-weight:600;background:#EAF3DE;color:#27500A;border-radius:4px;padding:2px 5px;margin-bottom:3px;text-align:center">+' + _fmtCompact(g.entrate) + '</div>';
      if (g.uscite > 0) h += '<div style="font-size:10.5px;font-weight:600;background:#FCEBEB;color:#791F1F;border-radius:4px;padding:2px 5px;text-align:center">-' + _fmtCompact(g.uscite) + '</div>';
      if (!g.entrate && !g.uscite && !scad) h += '<div style="font-size:10.5px;color:var(--text-muted)">—</div>';
      if (scad) {
        h += '<div style="margin-top:auto;padding-top:5px"><div style="display:flex;align-items:center;gap:3px;background:#E24B4A;color:#fff;border-radius:5px;padding:3px 5px;font-size:10px;font-weight:600;line-height:1.25">'
          + '<span style="font-size:11px">⏰</span>' + (scad.n > 1 ? scad.n + ' scadute ' : 'scaduta ') + _fmtCompact(scad.tot) + '</div></div>';
      }
      h += '</div>';
      cur.setDate(cur.getDate() + 1);
    }
    h += '</div>';
    el.innerHTML = h;
  } catch (e) {
    console.warn('settimana dashboard', e);
    el.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Dati della settimana non disponibili.</div>';
  }
}

// ────────────────────────────────────────────────────────────────────────
// VISTA SETTIMANA (7 celle in linea, più alte)
// ────────────────────────────────────────────────────────────────────────
function _finCalRenderSettimana() {
  var filtro = document.getElementById('fin-cal-filtro')?.value || '';
  var giornoMap = _finCalDati || {};
  var rng = _finCalRange();
  var lun = new Date(rng.daISO + 'T12:00:00');
  var oggiStr = _finOggiISO();

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

    var scad = _finCalScaduto(g, dataStr);
    var bgStyle = isToday ? 'border:2px solid #D85A30;' : (scad ? 'border:1px solid #E24B4A;' : 'border:1px solid #e8e7e3;');
    bgStyle += scad ? 'background:#FCEBEB;' : (isWeekend ? 'background:#fafaf8;' : 'background:#fff;');

    var dataFmt = corrente.getDate() + ' ' + _FIN_MESI[corrente.getMonth()].substring(0,3).toLowerCase();

    html += '<div onclick="mostraDettaglioFinanze(\'' + dataStr + '\',\'tutto\')" style="' + bgStyle + 'border-radius:10px;min-height:280px;padding:8px;cursor:pointer;display:flex;flex-direction:column" onmouseover="this.style.boxShadow=\'0 0 0 2px #185FA533\'" onmouseout="this.style.boxShadow=\'none\'"'
      + (scad ? ' title="Scadenza fornitore non pagata: ' + fmtE(scad.tot) + '"' : '') + '>';
    html += '<div style="font-size:14px;font-weight:600;color:' + (scad ? '#A32D2D' : (isToday ? '#D85A30' : 'var(--text)')) + ';margin-bottom:6px;display:flex;align-items:center;gap:5px">'
      + (scad ? '<span style="width:8px;height:8px;border-radius:50%;background:#E24B4A;display:inline-block"></span>' : '')
      + dataFmt + '</div>';
    html += _finCalHtmlCellaContenuto(g, dataStr, filtro);
    if (scad) {
      html += '<div style="margin-top:auto;padding-top:6px"><div style="display:flex;align-items:center;gap:4px;background:#E24B4A;color:#fff;border-radius:5px;padding:4px 7px;font-size:11px;font-weight:600;line-height:1.3">'
        + '<span style="font-size:13px">⏰</span>'
        + (scad.n > 1 ? scad.n + ' scadute ' : 'scaduta ') + fmtE(scad.tot)
        + '</div></div>';
    }
    html += '</div>';

    corrente.setDate(corrente.getDate() + 1);
  }
  html += '</div>';
  // Riepilogo settimana per voce/cliente/fornitore (espandibile)
  html += _finCalRenderRiepilogoSettimana();
  document.getElementById('fin-calendario').innerHTML = html;
}

// ────────────────────────────────────────────────────────────────────────
// RIEPILOGO SETTIMANALE — sotto la griglia 7-giorni
// Aggregato per cliente (entrate), per fornitore (uscite), con dettaglio
// transazioni espandibile da freccetta
// ────────────────────────────────────────────────────────────────────────
function _finCalRenderRiepilogoSettimana() {
  var giornoMap = _finCalDati || {};
  var rng = _finCalRange();

  var perCliente = {};
  var perFornitore = {};
  var totStazione = 0;
  var stazioneDett = [];

  // Itera i 7 giorni della settimana
  var cur = new Date(rng.daISO + 'T12:00:00');
  for (var i = 0; i < 7; i++) {
    var dataStr = cur.toISOString().split('T')[0];
    var g = giornoMap[dataStr];
    if (g) {
      g.entrateDettaglio.forEach(function(e) {
        var key = e.cliente || '—';
        if (!perCliente[key]) perCliente[key] = { tot:0, totPag:0, dettagli:[] };
        if (e.pagato) perCliente[key].totPag += e.importo;
        else perCliente[key].tot += e.importo;
        perCliente[key].dettagli.push({ data:dataStr, prodotto:e.prodotto, litri:e.litri, importo:e.importo, pagato:!!e.pagato });
      });
      g.usciteDettaglio.forEach(function(u) {
        var key = u.fornitore || '—';
        if (!perFornitore[key]) perFornitore[key] = { tot:0, totPag:0, dettagli:[] };
        if (u.pagato) perFornitore[key].totPag += u.importo;
        else perFornitore[key].tot += u.importo;
        perFornitore[key].dettagli.push({ data:dataStr, prodotto:u.prodotto, litri:u.litri, importo:u.importo, pagato:!!u.pagato });
      });
      if (g.stazione > 0) {
        totStazione += g.stazione;
        stazioneDett.push({
          data: dataStr,
          carte: g.stazioneDettaglio ? g.stazioneDettaglio.carte : 0,
          contanti: g.stazioneDettaglio ? g.stazioneDettaglio.contanti : 0,
          tot: g.stazione
        });
      }
    }
    cur.setDate(cur.getDate() + 1);
  }

  // Ordina per importo TOTALE (pagato + non pagato) decrescente
  var ordCli  = Object.keys(perCliente).sort(function(a,b){ return (perCliente[b].tot + perCliente[b].totPag) - (perCliente[a].tot + perCliente[a].totPag); });
  var ordForn = Object.keys(perFornitore).sort(function(a,b){ return (perFornitore[b].tot + perFornitore[b].totPag) - (perFornitore[a].tot + perFornitore[a].totPag); });

  // KPI strip in alto: SOLO da incassare/da pagare (esclude le già fatte) per coerenza coi KPI mese
  var totClienti  = Object.values(perCliente).reduce(function(s,c){ return s + c.tot; }, 0);
  var totUscite   = Object.values(perFornitore).reduce(function(s,f){ return s + f.tot; }, 0);
  var totIn       = totClienti + totStazione;
  var netto       = totIn - totUscite;
  var nettoColor  = netto >= 0 ? '#27500A' : '#791F1F';

  var h = '<div style="border-top:0.5px solid var(--border);padding-top:14px;margin-top:16px">';

  // Header con totali strip (DA incassare / DA pagare)
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px">';
  h += '<span>📊 Riepilogo settimana</span>';
  h += '<div style="display:flex;gap:14px;font-family:var(--font-mono);font-size:12px;flex-wrap:wrap">';
  h += '<span style="color:#639922" title="Da incassare ingrosso">↑ ' + _fmtCompact(totClienti) + '</span>';
  h += '<span style="color:#0C447C" title="Stazione">↑ ' + _fmtCompact(totStazione) + '</span>';
  h += '<span style="color:#A32D2D" title="Da pagare fornitori">↓ ' + _fmtCompact(totUscite) + '</span>';
  h += '<span style="color:' + nettoColor + ';font-weight:700" title="Saldo netto previsto">= ' + (netto >= 0 ? '+' : '') + _fmtCompact(netto) + '</span>';
  h += '</div></div>';

  // 3 sezioni master collassabili (default = collassate)
  var totClientiCompleto = Object.values(perCliente).reduce(function(s,c){ return s + c.tot + (c.totPag || 0); }, 0);
  var totUsciteCompleto  = Object.values(perFornitore).reduce(function(s,f){ return s + f.tot + (f.totPag || 0); }, 0);

  h += _finSettSezione('master-ent', 'Entrate per cliente', totClientiCompleto, ordCli.length, '#EAF3DE', '#27500A', '#639922', function() {
    if (ordCli.length === 0) return '<div style="font-size:11px;color:var(--text-muted);padding:8px;font-style:italic">Nessuna entrata cliente</div>';
    var inner = '';
    ordCli.forEach(function(nome, idx) {
      inner += _finSettRiga('cli-' + idx, nome, perCliente[nome], '#EAF3DE', '#27500A', '#639922');
    });
    return inner;
  });

  h += _finSettSezione('master-staz', 'Stazione Oppido', totStazione, stazioneDett.length, '#E6F1FB', '#0C447C', '#378ADD', function() {
    if (stazioneDett.length === 0) return '<div style="font-size:11px;color:var(--text-muted);padding:8px;font-style:italic">Nessun incasso stazione</div>';
    var inner = '';
    stazioneDett.forEach(function(s) {
      var df = new Date(s.data + 'T12:00:00').toLocaleDateString('it-IT', { day:'2-digit', month:'short' });
      inner += '<div style="display:flex;justify-content:space-between;padding:4px 10px;color:var(--text-muted);font-size:11px;border-radius:4px;margin-bottom:2px">';
      inner += '<span>' + esc(df) + ' · Carte ' + fmtE(s.carte) + ' · Contanti ' + fmtE(s.contanti) + '</span>';
      inner += '<span style="font-family:var(--font-mono);color:var(--text)">' + fmtE(s.tot) + '</span>';
      inner += '</div>';
    });
    return inner;
  });

  h += _finSettSezione('master-usc', 'Uscite per fornitore', totUsciteCompleto, ordForn.length, '#FAEEDA', '#854F0B', '#BA7517', function() {
    if (ordForn.length === 0) return '<div style="font-size:11px;color:var(--text-muted);padding:8px;font-style:italic">Nessuna uscita fornitore</div>';
    var inner = '';
    ordForn.forEach(function(nome, idx) {
      var col = _finForColori[nome] || '#FAEEDA';
      inner += _finSettRiga('forn-' + idx, nome, perFornitore[nome], col, '#791F1F', '#E24B4A');
    });
    return inner;
  });

  h += '</div>';
  return h;
}

// Helper: sezione master collassabile (livello macro)
function _finSettSezione(idSuffix, titolo, totale, conteggio, bgColor, textColor, borderColor, contentFn) {
  var rowId = 'fin-sett-' + idSuffix;
  var contConteggio = conteggio > 0 ? ' (' + conteggio + ')' : '';
  var h = '<div onclick="_finSettToggle(\'' + rowId + '\',this)" style="cursor:pointer;background:' + bgColor + ';color:' + textColor + ';border-left:3px solid ' + borderColor + ';display:flex;justify-content:space-between;align-items:center;padding:9px 12px;border-radius:0 8px 8px 0;margin-bottom:6px;font-size:13px;font-weight:600">';
  h += '<span style="display:flex;align-items:center;gap:8px;overflow:hidden">';
  h += '<span class="caret" style="font-size:10px;transition:transform 0.15s;display:inline-block">▶</span>';
  h += '<span>' + esc(titolo) + '<span style="font-weight:400;opacity:0.7">' + contConteggio + '</span></span></span>';
  h += '<span style="font-family:var(--font-mono);white-space:nowrap;margin-left:10px;font-size:14px">' + fmtE(totale) + '</span>';
  h += '</div>';
  h += '<div id="' + rowId + '" style="display:none;padding:4px 0 12px 14px">';
  h += contentFn();
  h += '</div>';
  return h;
}

// Helper: render singola riga espandibile del riepilogo settimana
function _finSettRiga(idSuffix, nome, data, bgColor, textColor, borderColor) {
  var rowId = 'fin-sett-' + idSuffix;
  var totale = (data.tot || 0) + (data.totPag || 0);
  // Se TUTTO è pagato → opacity ridotta sull'intera riga + ✓
  var tuttoPagato = data.totPag > 0 && data.tot === 0;
  var rowOpa = tuttoPagato ? 'opacity:0.55;' : '';
  var checkIcon = tuttoPagato ? '<span style="margin-right:2px">✓</span>' : '';
  var subInfo = '';
  if (!tuttoPagato && data.totPag > 0) {
    // Mix pagato+non pagato → mostra "di cui pagato"
    subInfo = '<span style="font-size:10px;opacity:0.75;margin-left:8px;font-weight:400">(di cui pagato ' + fmtE(data.totPag) + ')</span>';
  }
  var totStrike = tuttoPagato ? 'text-decoration:line-through;' : '';

  var h = '<div onclick="_finSettToggle(\'' + rowId + '\',this)" style="cursor:pointer;background:' + bgColor + ';color:' + textColor + ';border-left:3px solid ' + borderColor + ';display:flex;justify-content:space-between;align-items:center;padding:6px 10px;border-radius:0 6px 6px 0;margin-bottom:3px;font-size:12px;font-weight:500;' + rowOpa + '">';
  h += '<span style="display:flex;align-items:center;gap:6px;overflow:hidden">';
  h += '<span class="caret" style="font-size:9px;transition:transform 0.15s;display:inline-block">▶</span>';
  h += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + checkIcon + esc(nome) + subInfo + '</span></span>';
  h += '<span style="font-family:var(--font-mono);white-space:nowrap;margin-left:10px;' + totStrike + '">' + fmtE(totale) + '</span>';
  h += '</div>';
  h += '<div id="' + rowId + '" style="display:none;padding:4px 0 8px 18px;font-size:11px">';
  data.dettagli.sort(function(a,b){ return a.data < b.data ? -1 : 1; }).forEach(function(d) {
    var df = new Date(d.data + 'T12:00:00').toLocaleDateString('it-IT', { day:'2-digit', month:'short' });
    var detOpa = d.pagato ? 'opacity:0.55;' : '';
    var detStrike = d.pagato ? 'text-decoration:line-through;' : '';
    var detIcon = d.pagato ? '<span style="color:#27500A;margin-right:4px">✓</span>' : '';
    h += '<div style="display:flex;justify-content:space-between;padding:3px 0;color:var(--text-muted);' + detOpa + '">';
    h += '<span>' + detIcon + esc(df) + ' · ' + esc(d.prodotto || '—') + ' ' + fmtL(d.litri) + '</span>';
    h += '<span style="font-family:var(--font-mono);' + detStrike + '">' + fmtE(d.importo) + '</span>';
    h += '</div>';
  });
  h += '</div>';
  return h;
}

// Toggle espansione riga riepilogo
function _finSettToggle(id, header) {
  var el = document.getElementById(id);
  if (!el) return;
  var aperto = el.style.display !== 'none';
  el.style.display = aperto ? 'none' : 'block';
  var caret = header.querySelector('.caret');
  if (caret) caret.style.transform = aperto ? 'rotate(0deg)' : 'rotate(90deg)';
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
    // Aggrega per (cliente, pagato) → max 2 voci per cliente
    var perCliente = {};
    g.entrateDettaglio.forEach(function(e) {
      var key = e.cliente + '||' + (e.pagato ? 'P' : 'N');
      if (!perCliente[key]) perCliente[key] = { cliente: e.cliente, pagato: !!e.pagato, importo: 0, dettagli: [], dataPag: e.dataPagamento };
      perCliente[key].importo += e.importo;
      perCliente[key].dettagli.push(e.prodotto + ' ' + fmtL(e.litri));
    });
    var totaleEnt = 0;
    var keysCli = Object.keys(perCliente);
    if (keysCli.length > 0) {
      if (tipo === 'tutto') html += '<div style="font-size:12px;font-weight:600;color:#27500A;margin:14px 0 6px">🟢 ENTRATE INGROSSO</div>';
      html += '<div style="max-height:300px;overflow-y:auto">';
      keysCli.sort(function(a, b) { return perCliente[b].importo - perCliente[a].importo; }).forEach(function(k) {
        var c = perCliente[k];
        totaleEnt += c.importo;
        var opa = c.pagato ? 'opacity:0.5;' : '';
        var strike = c.pagato ? 'text-decoration:line-through;' : '';
        var checkIcon = c.pagato ? '<span style="color:#639922;margin-right:6px">✓</span>' : '';
        var dataPagInfo = c.pagato && c.dataPag ? ' · pagato il ' + _fmtDataIt(c.dataPag) : (c.pagato ? ' · già pagato' : '');
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg);border-left:3px solid #639922;border-radius:0 8px 8px 0;margin-bottom:4px;' + opa + '">';
        html += '<div><div style="font-weight:500">' + checkIcon + esc(c.cliente) + '</div><div style="font-size:10px;color:var(--text-muted)">' + c.dettagli.join(' · ') + esc(dataPagInfo) + '</div></div>';
        html += '<div style="font-family:var(--font-mono);font-weight:600;font-size:14px;color:#639922;white-space:nowrap;margin-left:10px;' + strike + '">' + fmtE(c.importo) + '</div></div>';
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
    // Aggrega per (fornitore, pagato) → max 2 voci per fornitore
    var perFornitore = {};
    g.usciteDettaglio.forEach(function(u) {
      var key = u.fornitore + '||' + (u.pagato ? 'P' : 'N');
      if (!perFornitore[key]) perFornitore[key] = { fornitore: u.fornitore, pagato: !!u.pagato, importo: 0, dettagli: [], dataPag: u.dataPagamento };
      perFornitore[key].importo += u.importo;
      perFornitore[key].dettagli.push(u.prodotto + ' ' + fmtL(u.litri));
    });
    var totaleUsc = 0;
    var keysFor = Object.keys(perFornitore);
    if (keysFor.length > 0) {
      if (tipo === 'tutto') html += '<div style="font-size:12px;font-weight:600;color:#791F1F;margin:14px 0 6px">🔴 USCITE FORNITORI</div>';
      html += '<div style="max-height:300px;overflow-y:auto">';
      keysFor.sort(function(a, b) { return perFornitore[b].importo - perFornitore[a].importo; }).forEach(function(k) {
        var f = perFornitore[k];
        totaleUsc += f.importo;
        var col = _finForColori[f.fornitore] || '#FAEEDA';
        var opa = f.pagato ? 'opacity:0.5;' : '';
        var strike = f.pagato ? 'text-decoration:line-through;' : '';
        var checkIcon = f.pagato ? '<span style="color:#27500A;margin-right:6px">✓</span>' : '';
        var dataPagInfo = f.pagato && f.dataPag ? ' · pagato il ' + _fmtDataIt(f.dataPag) : (f.pagato ? ' · già pagato' : '');
        html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:' + col + ';border-left:3px solid #E24B4A;border-radius:0 8px 8px 0;margin-bottom:4px;' + opa + '">';
        html += '<div><div style="font-weight:600">' + checkIcon + esc(f.fornitore) + '</div><div style="font-size:10px;color:var(--text-muted)">' + f.dettagli.join(' · ') + esc(dataPagInfo) + '</div></div>';
        html += '<div style="font-family:var(--font-mono);font-weight:600;font-size:14px;color:#E24B4A;white-space:nowrap;margin-left:10px;' + strike + '">' + fmtE(f.importo) + '</div></div>';
      });
      html += '</div>';
      html += '<div style="display:flex;justify-content:space-between;padding:10px 12px;margin-top:6px;background:#FCEBEB;border-radius:8px;font-weight:700"><span>TOTALE USCITE</span><span style="font-family:var(--font-mono);color:#791F1F;font-size:15px">' + fmtE(totaleUsc) + '</span></div>';
    } else if (tipo === 'uscite') {
      html += '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:13px">Nessuna uscita prevista per questa data.</div>';
    }
  }

  // Netto in 'tutto' (considera SOLO non pagate per coerenza coi KPI)
  if (tipo === 'tutto') {
    var tE = g.entrateDettaglio.reduce(function(s,e){ return s + (e.pagato ? 0 : e.importo); },0) + g.stazione;
    var tU = g.usciteDettaglio.reduce(function(s,u){ return s + (u.pagato ? 0 : u.importo); },0);
    var nettoG = tE - tU;
    var nettoColorG = nettoG >= 0 ? '#27500A' : '#791F1F';
    var nettoBgG = nettoG >= 0 ? '#EAF3DE' : '#FCEBEB';
    html += '<div style="display:flex;justify-content:space-between;padding:12px;margin-top:14px;background:' + nettoBgG + ';border-radius:8px;font-weight:700;font-size:14px"><span>NETTO GIORNATA (al netto delle già pagate)</span><span style="font-family:var(--font-mono);color:' + nettoColorG + ';font-size:16px">' + (nettoG >= 0 ? '+' : '') + fmtE(nettoG) + '</span></div>';
  }

  apriModal(html);
}

function _fmtCompact(n) {
  if (Math.abs(n) >= 1000) return '€' + Math.round(n / 1000) + 'k';
  return '€' + Math.round(n);
}

function _fmtDataIt(iso) {
  // ISO YYYY-MM-DD → DD/MM/AAAA
  if (!iso) return '';
  var p = String(iso).split('T')[0].split('-');
  if (p.length < 3) return iso;
  return p[2] + '/' + p[1] + '/' + p[0];
}

// Export globals per onclick inline
window.finCalMese              = finCalMese;
window.finCalCambiaModo        = finCalCambiaModo;
window.finCalVaiAlMese         = finCalVaiAlMese;
window.caricaFinanze           = caricaFinanze;
window.renderCalendarioFinanze = renderCalendarioFinanze;
window.mostraDettaglioFinanze  = mostraDettaglioFinanze;
window._finSettToggle          = _finSettToggle;
