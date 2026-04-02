// PhoenixFuel — Finanze: Calendario Entrate/Uscite

var _finCalAnno = new Date().getFullYear();
var _finCalMese = new Date().getMonth();
var _finCalDati = null;
var _finForColori = {};

function finCalMese(dir) {
  _finCalMese += dir;
  if (_finCalMese < 0) { _finCalMese = 11; _finCalAnno--; }
  if (_finCalMese > 11) { _finCalMese = 0; _finCalAnno++; }
  caricaFinanze();
}

async function caricaFinanze() {
  var meseLabel = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][_finCalMese];
  document.getElementById('fin-cal-mese-label').textContent = meseLabel + ' ' + _finCalAnno;

  var inizioMese = new Date(_finCalAnno, _finCalMese, 1);
  var fineMese = new Date(_finCalAnno, _finCalMese + 1, 0);
  var daISO = new Date(_finCalAnno, _finCalMese, -7).toISOString().split('T')[0];
  var aISO = new Date(_finCalAnno, _finCalMese + 1, 7).toISOString().split('T')[0];
  var inizioMeseISO = inizioMese.toISOString().split('T')[0];
  var fineMeseISO = fineMese.toISOString().split('T')[0];

  var [ordCliRes, ordForRes, cassaRes, fornitoriRes] = await Promise.all([
    sb.from('ordini').select('id,data,cliente,prodotto,litri,costo_litro,trasporto_litro,margine,iva,data_scadenza,giorni_pagamento,pagato')
      .eq('tipo_ordine','cliente').neq('stato','annullato').eq('pagato',false)
      .gte('data_scadenza',daISO).lte('data_scadenza',aISO),
    sb.from('ordini').select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,giorni_pagamento,pagato_fornitore')
      .neq('stato','annullato').eq('pagato_fornitore',false).not('fornitore','ilike','%phoenix%').not('fornitore','ilike','%deposito%').gte('data',daISO),
    sb.from('stazione_cassa').select('data,bancomat,carte_nexi,carte_aziendali,contanti_da_versare,versato')
      .gte('data',inizioMeseISO).lte('data',fineMeseISO).order('data'),
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

  // 1. Entrate ingrosso
  ordClienti.forEach(function(o) {
    if (!o.data_scadenza) return;
    var scadEffettiva = spostaAlLunedi(o.data_scadenza);
    getGiorno(scadEffettiva).entrateDettaglio.push({
      cliente: o.cliente, importo: prezzoConIva(o) * Number(o.litri),
      prodotto: o.prodotto, litri: Number(o.litri)
    });
  });

  // 2. Uscite fornitori (solo acquisti reali, esclusi movimenti interni deposito)
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

  // KPI
  var totEntrate = 0, totUscite = 0, totStazione = 0, totFattCli = 0;
  Object.keys(giornoMap).forEach(function(data) {
    if (data >= inizioMeseISO && data <= fineMeseISO) {
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

function renderCalendarioFinanze() {
  var filtro = document.getElementById('fin-cal-filtro')?.value || '';
  var giornoMap = _finCalDati || {};
  var primoGiorno = new Date(_finCalAnno, _finCalMese, 1);
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

    // Aggrega uscite per fornitore
    var uscitePerFor = {};
    g.usciteDettaglio.forEach(function(u) {
      if (!uscitePerFor[u.fornitore]) uscitePerFor[u.fornitore] = 0;
      uscitePerFor[u.fornitore] += u.importo;
    });
    var totEntrateGiorno = g.entrateDettaglio.reduce(function(s, e) { return s + e.importo; }, 0);

    var mostraEntrate = filtro === '' || filtro === 'entrate' || filtro === 'ingrosso';
    var mostraStazione = filtro === '' || filtro === 'entrate' || filtro === 'stazione';
    var mostraUscite = filtro === '' || filtro === 'uscite';

    var bgStyle = isToday ? 'border:2px solid #D85A30;' : 'border:1px solid #e8e7e3;';
    bgStyle += isWeekend ? 'background:#fafaf8;' : 'background:#fff;';
    if (!isThisMonth) bgStyle += 'opacity:0.3;';

    html += '<div style="' + bgStyle + 'border-radius:10px;min-height:110px;padding:6px">';
    html += '<div style="font-size:13px;font-weight:600;color:' + (isToday ? '#D85A30' : 'var(--text)') + ';margin-bottom:4px">' + corrente.getDate() + '</div>';

    // Entrate ingrosso (totale, cliccabile)
    if (mostraEntrate && totEntrateGiorno > 0) {
      html += '<div onclick="mostraDettaglioFinanze(\'' + dataStr + '\',\'entrate\')" style="cursor:pointer;font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#EAF3DE;color:#27500A;border-left:2px solid #639922">';
      html += '<span>Entrate</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(totEntrateGiorno) + '</span></div>';
    }

    // Stazione
    if (mostraStazione && g.stazione > 0) {
      html += '<div style="font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#E6F1FB;color:#0C447C;border-left:2px solid #378ADD">';
      html += '<span>Stazione</span><span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(g.stazione) + '</span></div>';
    }

    // Uscite per fornitore (cliccabili, con colore)
    if (mostraUscite) {
      Object.keys(uscitePerFor).forEach(function(fornitore) {
        var col = _finForColori[fornitore] || '#FAEEDA';
        html += '<div onclick="mostraDettaglioFinanze(\'' + dataStr + '\',\'uscite\')" style="cursor:pointer;font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:' + col + ';color:#791F1F;border-left:2px solid #E24B4A">';
        html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%;font-weight:600">' + esc(fornitore) + '</span>';
        html += '<span style="font-family:var(--font-mono);font-weight:600;white-space:nowrap">' + _fmtCompact(uscitePerFor[fornitore]) + '</span></div>';
      });
    }

    // Totali giorno
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

    html += '</div>';
    corrente.setDate(corrente.getDate() + 1);
    if (i >= 27 && corrente.getMonth() !== _finCalMese && corrente.getDay() === 1) break;
  }
  html += '</div>';
  document.getElementById('fin-calendario').innerHTML = html;
}

function mostraDettaglioFinanze(dataStr, tipo) {
  var g = (_finCalDati || {})[dataStr];
  if (!g) return;
  var dataFmt = new Date(dataStr + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  var html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">' + (tipo === 'entrate' ? '🟢 Dettaglio entrate' : '🔴 Dettaglio uscite fornitori') + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + dataFmt + '</div>';

  if (tipo === 'entrate') {
    var perCliente = {};
    g.entrateDettaglio.forEach(function(e) {
      if (!perCliente[e.cliente]) perCliente[e.cliente] = { importo: 0, dettagli: [] };
      perCliente[e.cliente].importo += e.importo;
      perCliente[e.cliente].dettagli.push(e.prodotto + ' ' + fmtL(e.litri));
    });
    var totale = 0;
    html += '<div style="max-height:400px;overflow-y:auto">';
    Object.keys(perCliente).sort(function(a, b) { return perCliente[b].importo - perCliente[a].importo; }).forEach(function(cl) {
      var c = perCliente[cl];
      totale += c.importo;
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:var(--bg);border-left:3px solid #639922;border-radius:0 8px 8px 0;margin-bottom:4px">';
      html += '<div><div style="font-weight:500">' + esc(cl) + '</div><div style="font-size:10px;color:var(--text-muted)">' + c.dettagli.join(' · ') + '</div></div>';
      html += '<div style="font-family:var(--font-mono);font-weight:600;font-size:14px;color:#639922;white-space:nowrap;margin-left:10px">' + fmtE(c.importo) + '</div></div>';
    });
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;padding:12px;margin-top:8px;background:#EAF3DE;border-radius:8px;font-weight:700"><span>TOTALE ENTRATE</span><span style="font-family:var(--font-mono);color:#27500A;font-size:16px">' + fmtE(totale) + '</span></div>';
  } else {
    var perFornitore = {};
    g.usciteDettaglio.forEach(function(u) {
      if (!perFornitore[u.fornitore]) perFornitore[u.fornitore] = { importo: 0, dettagli: [] };
      perFornitore[u.fornitore].importo += u.importo;
      perFornitore[u.fornitore].dettagli.push(u.prodotto + ' ' + fmtL(u.litri));
    });
    var totale = 0;
    html += '<div style="max-height:400px;overflow-y:auto">';
    Object.keys(perFornitore).sort(function(a, b) { return perFornitore[b].importo - perFornitore[a].importo; }).forEach(function(fo) {
      var f = perFornitore[fo];
      totale += f.importo;
      var col = _finForColori[fo] || '#FAEEDA';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:' + col + ';border-left:3px solid #E24B4A;border-radius:0 8px 8px 0;margin-bottom:4px">';
      html += '<div><div style="font-weight:600">' + esc(fo) + '</div><div style="font-size:10px;color:var(--text-muted)">' + f.dettagli.join(' · ') + '</div></div>';
      html += '<div style="font-family:var(--font-mono);font-weight:600;font-size:14px;color:#E24B4A;white-space:nowrap;margin-left:10px">' + fmtE(f.importo) + '</div></div>';
    });
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;padding:12px;margin-top:8px;background:#FCEBEB;border-radius:8px;font-weight:700"><span>TOTALE USCITE</span><span style="font-family:var(--font-mono);color:#791F1F;font-size:16px">' + fmtE(totale) + '</span></div>';
  }
  apriModal(html);
}

function _fmtCompact(n) {
  if (Math.abs(n) >= 1000) return '€' + Math.round(n / 1000) + 'k';
  return '€' + Math.round(n);
}
