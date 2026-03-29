// PhoenixFuel — Finanze: Calendario Entrate/Uscite

var _finCalAnno = new Date().getFullYear();
var _finCalMese = new Date().getMonth(); // 0-based
var _finCalDati = null;

function finCalMese(dir) {
  _finCalMese += dir;
  if (_finCalMese < 0) { _finCalMese = 11; _finCalAnno--; }
  if (_finCalMese > 11) { _finCalMese = 0; _finCalAnno++; }
  caricaFinanze();
}

async function caricaFinanze() {
  var meseLabel = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][_finCalMese];
  document.getElementById('fin-cal-mese-label').textContent = meseLabel + ' ' + _finCalAnno;

  // Range mese con margine per catturare scadenze spostate
  var inizioMese = new Date(_finCalAnno, _finCalMese, 1);
  var fineMese = new Date(_finCalAnno, _finCalMese + 1, 0);
  // Carica ordini con scadenza nel range + margine 7 giorni prima (per sab/dom shift)
  var daISO = new Date(_finCalAnno, _finCalMese, -7).toISOString().split('T')[0];
  var aISO = new Date(_finCalAnno, _finCalMese + 1, 7).toISOString().split('T')[0];
  var inizioMeseISO = inizioMese.toISOString().split('T')[0];
  var fineMeseISO = fineMese.toISOString().split('T')[0];

  // Query parallele
  var [ordCliRes, ordForRes, cassaRes, fornitoriRes] = await Promise.all([
    // Entrate ingrosso: ordini clienti non pagati con scadenza nel range
    sb.from('ordini').select('id,data,cliente,prodotto,litri,costo_litro,trasporto_litro,margine,iva,data_scadenza,giorni_pagamento,pagato')
      .eq('tipo_ordine','cliente').neq('stato','annullato').eq('pagato',false)
      .gte('data_scadenza',daISO).lte('data_scadenza',aISO),
    // Uscite fornitori: ordini non pagati al fornitore
    sb.from('ordini').select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,giorni_pagamento,pagato_fornitore')
      .neq('stato','annullato').eq('pagato_fornitore',false)
      .gte('data',daISO),
    // Entrate stazione: cassa del mese
    sb.from('stazione_cassa').select('data,bancomat,carte_nexi,carte_aziendali,contanti_da_versare,versato')
      .gte('data',inizioMeseISO).lte('data',fineMeseISO).order('data'),
    // Fornitori per giorni pagamento
    sb.from('fornitori').select('nome,giorni_pagamento')
  ]);

  var ordClienti = ordCliRes.data || [];
  var ordFornitori = ordForRes.data || [];
  var cassaDati = cassaRes.data || [];
  var fornitoriMap = {};
  (fornitoriRes.data || []).forEach(function(f) { fornitoriMap[f.nome] = f; });

  // Costruisci mappa giorno → eventi
  var giornoMap = {}; // { '2026-03-05': { entrate:[], uscite:[], stazione:0 } }

  function getGiorno(data) {
    if (!giornoMap[data]) giornoMap[data] = { entrate: [], uscite: [], stazione: 0, stazioneDettaglio: null };
    return giornoMap[data];
  }

  // Sposta sabato/domenica a lunedì (solo ingrosso)
  function spostaAlLunedi(dataStr) {
    var d = new Date(dataStr + 'T12:00:00');
    var giorno = d.getDay(); // 0=dom, 6=sab
    if (giorno === 6) d.setDate(d.getDate() + 2); // sab → lun
    if (giorno === 0) d.setDate(d.getDate() + 1); // dom → lun
    return d.toISOString().split('T')[0];
  }

  // 1. Entrate ingrosso (da scadenza ordini clienti → spostati al lunedì)
  ordClienti.forEach(function(o) {
    if (!o.data_scadenza) return;
    var scadEffettiva = spostaAlLunedi(o.data_scadenza);
    var importo = prezzoConIva(o) * Number(o.litri);
    getGiorno(scadEffettiva).entrate.push({
      tipo: 'ingrosso',
      label: o.cliente,
      importo: importo,
      dettaglio: o.prodotto + ' ' + fmtL(o.litri)
    });
  });

  // 2. Uscite fornitori (data + giorni_pagamento fornitore → spostati al lunedì)
  ordFornitori.forEach(function(o) {
    if (!o.data || !o.fornitore) return;
    // Escludi PhoenixFuel (movimenti interni)
    if (o.fornitore.toLowerCase().indexOf('phoenix') >= 0) return;
    var ggPag = o.giorni_pagamento || (fornitoriMap[o.fornitore] ? fornitoriMap[o.fornitore].giorni_pagamento : 30) || 30;
    var scad = new Date(o.data + 'T12:00:00');
    scad.setDate(scad.getDate() + ggPag);
    var scadISO = scad.toISOString().split('T')[0];
    var scadEffettiva = spostaAlLunedi(scadISO);
    var importo = (Number(o.costo_litro) + Number(o.trasporto_litro || 0)) * Number(o.litri);
    // Aggiungi IVA
    importo = importo * (1 + Number(o.iva || 22) / 100);
    getGiorno(scadEffettiva).uscite.push({
      label: o.fornitore,
      importo: importo,
      dettaglio: o.prodotto + ' ' + fmtL(o.litri)
    });
  });

  // 3. Entrate stazione (incasso giornaliero, nessuno spostamento)
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

  // KPI mensili
  var totEntrate = 0, totUscite = 0, totStazione = 0, totFattCli = 0;
  Object.keys(giornoMap).forEach(function(data) {
    if (data >= inizioMeseISO && data <= fineMeseISO) {
      var g = giornoMap[data];
      g.entrate.forEach(function(e) { if (e.tipo === 'ingrosso') totFattCli += e.importo; });
      totStazione += g.stazione;
      g.uscite.forEach(function(u) { totUscite += u.importo; });
    }
  });
  totEntrate = totFattCli + totStazione;

  var kpiWrap = document.getElementById('fin-kpi');
  var saldoColor = (totEntrate - totUscite) >= 0 ? '#639922' : '#E24B4A';
  kpiWrap.innerHTML =
    '<div class="kpi"><div class="kpi-label">Entrate ingrosso</div><div class="kpi-value" style="color:#639922">' + fmtE(totFattCli) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Entrate stazione</div><div class="kpi-value" style="color:#378ADD">' + fmtE(totStazione) + '</div></div>' +
    '<div class="kpi"><div class="kpi-label">Uscite fornitori</div><div class="kpi-value" style="color:#E24B4A">' + fmtE(totUscite) + '</div></div>' +
    '<div class="kpi" style="border:1px solid ' + saldoColor + '"><div class="kpi-label">Saldo netto previsto</div><div class="kpi-value" style="color:' + saldoColor + '">' + (totEntrate - totUscite >= 0 ? '+' : '') + ' ' + fmtE(totEntrate - totUscite) + '</div></div>';

  renderCalendarioFinanze();
}

function renderCalendarioFinanze() {
  var filtro = document.getElementById('fin-cal-filtro')?.value || '';
  var giornoMap = _finCalDati || {};

  // Calcola griglia calendario
  var primoGiorno = new Date(_finCalAnno, _finCalMese, 1);
  var ultimoGiorno = new Date(_finCalAnno, _finCalMese + 1, 0);
  var inizioGriglia = new Date(primoGiorno);
  var offset = (primoGiorno.getDay() + 6) % 7; // Lunedì = 0
  inizioGriglia.setDate(inizioGriglia.getDate() - offset);

  var oggiStr = new Date().toISOString().split('T')[0];

  var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px">';

  // Header giorni
  ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'].forEach(function(g) {
    html += '<div style="text-align:center;font-size:10px;font-weight:600;color:var(--text-hint);text-transform:uppercase;padding:6px 0;letter-spacing:0.5px">' + g + '</div>';
  });

  // Celle
  var corrente = new Date(inizioGriglia);
  for (var i = 0; i < 42; i++) {
    var dataStr = corrente.toISOString().split('T')[0];
    var isThisMonth = corrente.getMonth() === _finCalMese;
    var isToday = dataStr === oggiStr;
    var isWeekend = corrente.getDay() === 0 || corrente.getDay() === 6;
    var g = giornoMap[dataStr] || { entrate: [], uscite: [], stazione: 0 };

    // Filtro
    var entrateVis = g.entrate;
    var usciteVis = g.uscite;
    var stazioneVis = g.stazione;
    if (filtro === 'entrate') { usciteVis = []; }
    if (filtro === 'uscite') { entrateVis = []; stazioneVis = 0; }
    if (filtro === 'ingrosso') { usciteVis = []; stazioneVis = 0; }
    if (filtro === 'stazione') { entrateVis = []; usciteVis = []; }

    var bgStyle = isToday ? 'border:2px solid #D85A30;' : 'border:1px solid #e8e7e3;';
    if (isWeekend) bgStyle += 'background:#fafaf8;';
    else bgStyle += 'background:#fff;';
    if (!isThisMonth) bgStyle += 'opacity:0.3;';

    html += '<div style="' + bgStyle + 'border-radius:10px;min-height:110px;padding:6px;position:relative">';
    html += '<div style="font-size:13px;font-weight:600;color:' + (isToday ? '#D85A30' : 'var(--text)') + ';margin-bottom:4px">' + corrente.getDate() + '</div>';

    // Entrate ingrosso
    entrateVis.forEach(function(e) {
      html += '<div style="font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#EAF3DE;color:#27500A;border-left:2px solid #639922">';
      html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">' + esc(e.label) + '</span>';
      html += '<span style="font-family:var(--font-mono);font-weight:600;white-space:nowrap">' + _fmtCompact(e.importo) + '</span></div>';
    });

    // Stazione
    if (stazioneVis > 0) {
      html += '<div style="font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#E6F1FB;color:#0C447C;border-left:2px solid #378ADD">';
      html += '<span>Stazione</span>';
      html += '<span style="font-family:var(--font-mono);font-weight:600">' + _fmtCompact(stazioneVis) + '</span></div>';
    }

    // Uscite
    usciteVis.forEach(function(u) {
      html += '<div style="font-size:8px;padding:2px 5px;border-radius:3px;margin-bottom:2px;display:flex;justify-content:space-between;background:#FCEBEB;color:#791F1F;border-left:2px solid #E24B4A">';
      html += '<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:60%">' + esc(u.label) + '</span>';
      html += '<span style="font-family:var(--font-mono);font-weight:600;white-space:nowrap">' + _fmtCompact(u.importo) + '</span></div>';
    });

    // Totali giorno
    var totE = entrateVis.reduce(function(s, e) { return s + e.importo; }, 0) + stazioneVis;
    var totU = usciteVis.reduce(function(s, u) { return s + u.importo; }, 0);
    if (totE > 0 || totU > 0) {
      var netto = totE - totU;
      html += '<div style="display:flex;gap:3px;margin-top:3px;padding-top:3px;border-top:1px dashed #e8e7e3">';
      if (totE > 0) html += '<div style="flex:1;text-align:center;font-size:7px;font-weight:600;padding:1px 0;border-radius:2px;background:#EAF3DE;color:#27500A">+' + _fmtCompact(totE) + '</div>';
      if (totU > 0) html += '<div style="flex:1;text-align:center;font-size:7px;font-weight:600;padding:1px 0;border-radius:2px;background:#FCEBEB;color:#791F1F">-' + _fmtCompact(totU) + '</div>';
      if (totE > 0 || totU > 0) {
        var nColor = netto >= 0 ? 'background:#EEEDFE;color:#26215C' : 'background:#FCEBEB;color:#791F1F';
        html += '<div style="flex:1;text-align:center;font-size:7px;font-weight:700;padding:1px 0;border-radius:2px;' + nColor + '">' + (netto >= 0 ? '+' : '') + _fmtCompact(netto) + '</div>';
      }
      html += '</div>';
    }

    html += '</div>';

    corrente.setDate(corrente.getDate() + 1);
    // Stop after ultimo giorno + rest of week
    if (i >= 27 && corrente.getMonth() !== _finCalMese && corrente.getDay() === 1) break;
  }

  html += '</div>';
  document.getElementById('fin-calendario').innerHTML = html;
}

// Formato compatto per importi in calendario
function _fmtCompact(n) {
  if (Math.abs(n) >= 1000) return '€' + Math.round(n / 1000) + 'k';
  return '€' + Math.round(n);
}
