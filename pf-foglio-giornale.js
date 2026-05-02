// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Foglio Giornale Aziendale (movimenti monetari)
// Patch v20260502b — STEP 2 SKELETON
// ═══════════════════════════════════════════════════════════════════════════
// Modulo nuovo per la sub-tab "📓 Foglio giornale" dentro la sezione Finanze.
// Vista calendario settimanale (default) + dettaglio giorno in formato
// partita doppia (entrate sx / uscite dx).
//
// QUESTO STEP È READ-ONLY: i bottoni "+ Entrata / + Uscita" sono placeholder
// che mostrano alert "Disponibile dal prossimo step". L'inserimento vero
// (modali con i 3 modi) arriva nel STEP 4.
//
// File invariati: pf-finanze.js (calendario mensile esistente) resta intatto.
// ═══════════════════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────────────────
// Stato globale (vivo solo per la sessione corrente)
// ────────────────────────────────────────────────────────────────────────
var _fgStato = {
  modo: 'settimana',  // 'settimana' | 'mese' | 'anno'
  dataAncora: null,   // ISO della data attorno a cui ruota il calendario
  giornoSelezionato: null  // ISO del giorno selezionato per il dettaglio
};


// ────────────────────────────────────────────────────────────────────────
// Helper formattazione date
// ────────────────────────────────────────────────────────────────────────
function _fgIsoToDate(iso) {
  if (!iso) return null;
  return new Date(iso + 'T12:00:00');
}

function _fgDateToIso(d) {
  return d.toISOString().split('T')[0];
}

function _fgFmtData(iso) {
  if (!iso) return '—';
  var p = String(iso).substring(0, 10).split('-');
  if (p.length !== 3) return iso;
  return p[2] + '/' + p[1] + '/' + p[0];
}

function _fgFmtImporto(n) {
  return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

var _FG_GIORNI = ['Dom','Lun','Mar','Mer','Gio','Ven','Sab'];
var _FG_GIORNI_FULL = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
var _FG_MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];


// ────────────────────────────────────────────────────────────────────────
// Calcolo periodo corrente in base a stato
// ────────────────────────────────────────────────────────────────────────
function _fgCalcolaPeriodo() {
  if (!_fgStato.dataAncora) {
    _fgStato.dataAncora = _fgDateToIso(new Date());
  }
  if (!_fgStato.giornoSelezionato) {
    _fgStato.giornoSelezionato = _fgDateToIso(new Date());
  }

  var ancora = _fgIsoToDate(_fgStato.dataAncora);
  var daISO, aISO, label;

  if (_fgStato.modo === 'settimana') {
    // Settimana lun-dom contenente la data ancora
    var dow = ancora.getDay();
    var diffLun = dow === 0 ? -6 : 1 - dow;
    var lunedi = new Date(ancora);
    lunedi.setDate(ancora.getDate() + diffLun);
    var domenica = new Date(lunedi);
    domenica.setDate(lunedi.getDate() + 6);
    daISO = _fgDateToIso(lunedi);
    aISO = _fgDateToIso(domenica);
    label = 'Settimana ' + _fgFmtData(daISO).substring(0, 5) + ' - ' + _fgFmtData(aISO);
  } else if (_fgStato.modo === 'mese') {
    var primo = new Date(ancora.getFullYear(), ancora.getMonth(), 1);
    var ultimo = new Date(ancora.getFullYear(), ancora.getMonth() + 1, 0);
    daISO = _fgDateToIso(primo);
    aISO = _fgDateToIso(ultimo);
    label = _FG_MESI[ancora.getMonth()] + ' ' + ancora.getFullYear();
  } else { // anno
    daISO = ancora.getFullYear() + '-01-01';
    aISO = ancora.getFullYear() + '-12-31';
    label = 'Anno ' + ancora.getFullYear();
  }

  return { daISO: daISO, aISO: aISO, label: label };
}


// ────────────────────────────────────────────────────────────────────────
// Navigazione frecce
// ────────────────────────────────────────────────────────────────────────
function fgNavigaPeriodo(direzione) {
  var ancora = _fgIsoToDate(_fgStato.dataAncora);
  if (_fgStato.modo === 'settimana') {
    ancora.setDate(ancora.getDate() + (7 * direzione));
  } else if (_fgStato.modo === 'mese') {
    ancora.setMonth(ancora.getMonth() + direzione);
  } else {
    ancora.setFullYear(ancora.getFullYear() + direzione);
  }
  _fgStato.dataAncora = _fgDateToIso(ancora);
  caricaFoglioGiornale();
}

function fgCambiaModo(modo) {
  _fgStato.modo = modo;
  caricaFoglioGiornale();
}

function fgSelezionaGiorno(iso) {
  _fgStato.giornoSelezionato = iso;
  caricaFoglioGiornale();
}


// ────────────────────────────────────────────────────────────────────────
// Caricamento dati: movimenti del periodo + saldi
// ────────────────────────────────────────────────────────────────────────
async function _fgCaricaMovimenti(daISO, aISO) {
  var res = await sb.from('foglio_giornale_movimenti')
    .select('*')
    .gte('data', daISO).lte('data', aISO)
    .order('data', { ascending: true })
    .order('created_at', { ascending: true });
  if (res.error) {
    console.error('[_fgCaricaMovimenti]', res.error);
    return [];
  }
  return res.data || [];
}


// ────────────────────────────────────────────────────────────────────────
// Caricamento e render principale
// ────────────────────────────────────────────────────────────────────────
async function caricaFoglioGiornale() {
  var el = document.getElementById('fg-content');
  if (!el) return;

  var p = _fgCalcolaPeriodo();
  var movimenti = await _fgCaricaMovimenti(p.daISO, p.aISO);

  // Aggrega per giorno
  var perGiorno = {};
  movimenti.forEach(function(m) {
    if (!perGiorno[m.data]) perGiorno[m.data] = { entrate: [], uscite: [], totEnt: 0, totUsc: 0 };
    if (m.tipo === 'entrata') {
      perGiorno[m.data].entrate.push(m);
      perGiorno[m.data].totEnt += Number(m.importo || 0);
    } else {
      perGiorno[m.data].uscite.push(m);
      perGiorno[m.data].totUsc += Number(m.importo || 0);
    }
  });

  var html = '';

  // Header con navigazione e toggle modo
  html += _fgRenderHeader(p);

  // Calendario in alto
  if (_fgStato.modo === 'settimana') {
    html += _fgRenderCalendarioSettimana(p, perGiorno);
  } else if (_fgStato.modo === 'mese') {
    html += _fgRenderCalendarioMese(p, perGiorno);
  } else {
    html += _fgRenderCalendarioAnno(p, perGiorno);
  }

  // Dettaglio giorno selezionato
  html += _fgRenderDettaglioGiorno(perGiorno);

  el.innerHTML = html;
}


// ────────────────────────────────────────────────────────────────────────
// Render header (navigazione + toggle)
// ────────────────────────────────────────────────────────────────────────
function _fgRenderHeader(p) {
  function btn(modo, label) {
    var attivo = _fgStato.modo === modo;
    return '<button onclick="fgCambiaModo(\'' + modo + '\')" style="font-size:12px;padding:6px 12px;background:' +
      (attivo ? '#185FA5' : 'var(--bg)') + ';color:' + (attivo ? 'white' : 'var(--text)') +
      ';border:0.5px solid ' + (attivo ? '#185FA5' : 'var(--border)') + ';border-radius:4px;cursor:pointer;font-weight:' +
      (attivo ? '500' : '400') + '">' + label + '</button>';
  }

  var html = '<div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;margin-bottom:14px">';
  html += '<div><div style="font-size:15px;font-weight:500;color:var(--text)">' + esc(p.label) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Foglio giornale aziendale — movimenti monetari</div></div>';
  html += '<div style="display:flex;gap:6px;align-items:center">';
  html += '<button onclick="fgNavigaPeriodo(-1)" style="font-size:14px;padding:4px 10px;background:var(--bg);border:0.5px solid var(--border);border-radius:4px;cursor:pointer">◀</button>';
  html += btn('settimana', 'Settimana');
  html += btn('mese', 'Mese');
  html += btn('anno', 'Anno');
  html += '<button onclick="fgNavigaPeriodo(1)" style="font-size:14px;padding:4px 10px;background:var(--bg);border:0.5px solid var(--border);border-radius:4px;cursor:pointer">▶</button>';
  html += '</div></div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render calendario SETTIMANA (7 giorni in fila)
// ────────────────────────────────────────────────────────────────────────
function _fgRenderCalendarioSettimana(p, perGiorno) {
  var oggiISO = _fgDateToIso(new Date());
  var lun = _fgIsoToDate(p.daISO);
  var html = '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:6px;margin-bottom:18px">';

  for (var i = 0; i < 7; i++) {
    var d = new Date(lun);
    d.setDate(lun.getDate() + i);
    var iso = _fgDateToIso(d);
    var dati = perGiorno[iso] || { totEnt: 0, totUsc: 0 };
    var isOggi = iso === oggiISO;
    var isSelez = iso === _fgStato.giornoSelezionato;
    var isWeekend = d.getDay() === 0 || d.getDay() === 6;

    var bg, border, color;
    if (isSelez) { bg = '#BFDFF7'; border = '2px solid #185FA5'; color = '#0C447C'; }
    else if (isOggi) { bg = '#EAF3DE'; border = '1.5px solid #639922'; color = '#173404'; }
    else if (isWeekend) { bg = '#F5F1E8'; border = '0.5px solid var(--border)'; color = 'var(--text-muted)'; }
    else { bg = 'var(--bg)'; border = '0.5px solid var(--border)'; color = 'var(--text)'; }

    html += '<div onclick="fgSelezionaGiorno(\'' + iso + '\')" style="background:' + bg + ';border:' + border + ';border-radius:6px;padding:10px 8px;cursor:pointer;min-height:80px;color:' + color + ';transition:transform 0.1s" onmouseover="this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.transform=\'\'">';
    html += '<div style="font-size:11px;font-weight:500;margin-bottom:4px">' + _FG_GIORNI[d.getDay()] + ' ' + d.getDate() + '</div>';
    if (dati.totEnt > 0) {
      html += '<div style="font-size:10px;color:#173404;font-family:var(--font-mono)">+ ' + _fgFmtImporto(dati.totEnt) + '</div>';
    }
    if (dati.totUsc > 0) {
      html += '<div style="font-size:10px;color:#501313;font-family:var(--font-mono)">− ' + _fgFmtImporto(dati.totUsc) + '</div>';
    }
    if (dati.totEnt === 0 && dati.totUsc === 0) {
      html += '<div style="font-size:10px;color:var(--text-muted);font-style:italic">—</div>';
    }
    html += '</div>';
  }
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render calendario MESE (griglia 7 colonne x N righe)
// ────────────────────────────────────────────────────────────────────────
function _fgRenderCalendarioMese(p, perGiorno) {
  var oggiISO = _fgDateToIso(new Date());
  var primoMese = _fgIsoToDate(p.daISO);
  var ultimoMese = _fgIsoToDate(p.aISO);
  // Inizio griglia: lunedì <= primo del mese
  var inizio = new Date(primoMese);
  var dow = inizio.getDay();
  var diffLun = dow === 0 ? -6 : 1 - dow;
  inizio.setDate(inizio.getDate() + diffLun);

  var html = '';
  // Header giorni della settimana
  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:6px;font-size:10px;color:var(--text-muted);text-align:center;font-weight:500">';
  html += '<div>Lun</div><div>Mar</div><div>Mer</div><div>Gio</div><div>Ven</div><div>Sab</div><div>Dom</div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(7,1fr);gap:4px;margin-bottom:18px">';
  var d = new Date(inizio);
  for (var i = 0; i < 42; i++) {
    var iso = _fgDateToIso(d);
    var dati = perGiorno[iso] || { totEnt: 0, totUsc: 0 };
    var isOggi = iso === oggiISO;
    var isSelez = iso === _fgStato.giornoSelezionato;
    var isFuoriMese = d.getMonth() !== primoMese.getMonth();

    var bg, border, color, opacity;
    if (isSelez) { bg = '#BFDFF7'; border = '2px solid #185FA5'; color = '#0C447C'; opacity = '1'; }
    else if (isOggi) { bg = '#EAF3DE'; border = '1.5px solid #639922'; color = '#173404'; opacity = '1'; }
    else { bg = 'var(--bg)'; border = '0.5px solid var(--border)'; color = isFuoriMese ? 'var(--text-muted)' : 'var(--text)'; opacity = isFuoriMese ? '0.4' : '1'; }

    html += '<div onclick="fgSelezionaGiorno(\'' + iso + '\')" style="background:' + bg + ';border:' + border + ';border-radius:4px;padding:6px 5px;cursor:pointer;min-height:56px;color:' + color + ';opacity:' + opacity + '">';
    html += '<div style="font-size:11px;font-weight:500">' + d.getDate() + '</div>';
    if (dati.totEnt > 0) {
      html += '<div style="font-size:9px;color:#173404;font-family:var(--font-mono)">+' + (Math.round(dati.totEnt / 1000) > 0 ? Math.round(dati.totEnt / 100) / 10 + 'k' : Math.round(dati.totEnt)) + '</div>';
    }
    if (dati.totUsc > 0) {
      html += '<div style="font-size:9px;color:#501313;font-family:var(--font-mono)">−' + (Math.round(dati.totUsc / 1000) > 0 ? Math.round(dati.totUsc / 100) / 10 + 'k' : Math.round(dati.totUsc)) + '</div>';
    }
    html += '</div>';
    d.setDate(d.getDate() + 1);
    // Stop dopo l'ultima domenica che contiene l'ultimo del mese
    if (d > ultimoMese && d.getDay() === 1) break;
  }
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render calendario ANNO (12 mini-mesi compatti)
// ────────────────────────────────────────────────────────────────────────
function _fgRenderCalendarioAnno(p, perGiorno) {
  // Riepilogo per mese
  var perMese = {};
  Object.keys(perGiorno).forEach(function(iso) {
    var mese = iso.substring(0, 7);
    if (!perMese[mese]) perMese[mese] = { totEnt: 0, totUsc: 0 };
    perMese[mese].totEnt += perGiorno[iso].totEnt;
    perMese[mese].totUsc += perGiorno[iso].totUsc;
  });

  var anno = _fgIsoToDate(p.daISO).getFullYear();
  var html = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:18px">';
  for (var m = 0; m < 12; m++) {
    var meseISO = anno + '-' + String(m + 1).padStart(2, '0');
    var dati = perMese[meseISO] || { totEnt: 0, totUsc: 0 };
    var saldo = dati.totEnt - dati.totUsc;
    html += '<div onclick="(function(){_fgStato.modo=\'mese\';_fgStato.dataAncora=\'' + meseISO + '-15\';caricaFoglioGiornale();})()" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:10px 12px;cursor:pointer">';
    html += '<div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:6px">' + _FG_MESI[m] + '</div>';
    html += '<div style="font-size:10px;color:#173404;font-family:var(--font-mono)">+ ' + _fgFmtImporto(dati.totEnt) + '</div>';
    html += '<div style="font-size:10px;color:#501313;font-family:var(--font-mono)">− ' + _fgFmtImporto(dati.totUsc) + '</div>';
    html += '<div style="font-size:11px;font-family:var(--font-mono);font-weight:500;color:' + (saldo >= 0 ? '#173404' : '#501313') + ';margin-top:4px;border-top:0.5px solid var(--border);padding-top:4px">Saldo: ' + (saldo >= 0 ? '+' : '−') + ' ' + _fgFmtImporto(Math.abs(saldo)) + '</div>';
    html += '</div>';
  }
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Render dettaglio giorno selezionato (foglio giornale partita doppia)
// ────────────────────────────────────────────────────────────────────────
function _fgRenderDettaglioGiorno(perGiorno) {
  var iso = _fgStato.giornoSelezionato;
  var dati = perGiorno[iso] || { entrate: [], uscite: [], totEnt: 0, totUsc: 0 };
  var d = _fgIsoToDate(iso);
  var labelGiorno = _FG_GIORNI_FULL[d.getDay()] + ' ' + d.getDate() + ' ' + _FG_MESI[d.getMonth()] + ' ' + d.getFullYear();
  var saldo = dati.totEnt - dati.totUsc;

  var html = '<div style="border-top:0.5px solid var(--border);padding-top:14px">';

  // Header giorno + bottoni inserimento
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  html += '<div><div style="font-size:13px;font-weight:500;color:var(--text)">' + esc(labelGiorno) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + (dati.entrate.length + dati.uscite.length) + ' movimenti</div></div>';
  html += '<div style="display:flex;gap:6px">';
  html += '<button onclick="alert(\'+ Entrata: disponibile dal prossimo step (modali)\')" style="font-size:11px;padding:6px 10px;background:transparent;border:0.5px solid #639922;color:#27500A;border-radius:4px;cursor:pointer">+ Entrata</button>';
  html += '<button onclick="alert(\'+ Uscita: disponibile dal prossimo step (modali)\')" style="font-size:11px;padding:6px 10px;background:transparent;border:0.5px solid #A32D2D;color:#791F1F;border-radius:4px;cursor:pointer">+ Uscita</button>';
  html += '</div></div>';

  // 2 colonne entrate / uscite
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">';

  // Colonna entrate
  html += '<div>';
  html += '<div style="font-size:10px;text-transform:uppercase;color:#27500A;font-weight:600;letter-spacing:0.4px;padding:0 4px;margin-bottom:8px">▼ Entrate</div>';
  if (dati.entrate.length === 0) {
    html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:8px 12px">Nessuna entrata</div>';
  } else {
    dati.entrate.forEach(function(m) {
      html += _fgRenderRigaMovimento(m, 'entrata');
    });
  }
  html += '<div style="background:#F1EFE8;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;display:flex;justify-content:space-between;margin-top:6px">';
  html += '<span>Totale</span><span style="font-family:var(--font-mono);color:#173404">+ ' + _fgFmtImporto(dati.totEnt) + '</span></div>';
  html += '</div>';

  // Colonna uscite
  html += '<div>';
  html += '<div style="font-size:10px;text-transform:uppercase;color:#791F1F;font-weight:600;letter-spacing:0.4px;padding:0 4px;margin-bottom:8px">▼ Uscite</div>';
  if (dati.uscite.length === 0) {
    html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;padding:8px 12px">Nessuna uscita</div>';
  } else {
    dati.uscite.forEach(function(m) {
      html += _fgRenderRigaMovimento(m, 'uscita');
    });
  }
  html += '<div style="background:#F1EFE8;padding:6px 10px;border-radius:6px;font-size:11px;font-weight:600;display:flex;justify-content:space-between;margin-top:6px">';
  html += '<span>Totale</span><span style="font-family:var(--font-mono);color:#501313">− ' + _fgFmtImporto(dati.totUsc) + '</span></div>';
  html += '</div>';

  html += '</div>';

  // Saldo netto
  html += '<div style="background:#FAEEDA;border:1px solid #BA7517;border-radius:6px;padding:12px 16px;margin-top:10px;display:flex;justify-content:space-between;align-items:center;font-size:13px">';
  html += '<span style="color:#633806;font-weight:500">Saldo netto giornata</span>';
  html += '<span style="font-family:var(--font-mono);font-size:15px;font-weight:600;color:' + (saldo >= 0 ? '#173404' : '#501313') + '">' + (saldo >= 0 ? '+ ' : '− ') + _fgFmtImporto(Math.abs(saldo)) + ' €</span>';
  html += '</div>';

  html += '</div>';
  return html;
}


function _fgRenderRigaMovimento(m, tipo) {
  var bg = tipo === 'entrata' ? '#EAF3DE' : '#FCEBEB';
  var borderL = tipo === 'entrata' ? '#639922' : '#A32D2D';
  var amountColor = tipo === 'entrata' ? '#173404' : '#501313';
  var sign = tipo === 'entrata' ? '+ ' : '− ';

  // Tag origine: distingui movimenti automatici da manuali
  var tagHtml = '';
  if (m.origine === 'auto-anticipo-erogato') {
    bg = '#E6F1FB'; borderL = '#185FA5'; amountColor = '#0C447C';
    tagHtml = ' <span style="background:#BFDFF7;color:#0C447C;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600">anticipo SBF</span>';
  } else if (m.origine === 'auto-anticipo-rientro') {
    bg = '#E6F1FB'; borderL = '#185FA5'; amountColor = '#0C447C';
    tagHtml = ' <span style="background:#BFDFF7;color:#0C447C;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600">rientro SBF</span>';
  } else if (m.origine === 'auto-anticipo-insoluto') {
    bg = '#FCEBEB'; borderL = '#A32D2D'; amountColor = '#501313';
    tagHtml = ' <span style="background:#F7C1C1;color:#791F1F;font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600">insoluto SBF</span>';
  }

  var metodoTag = m.metodo ? ' <span style="background:rgba(0,0,0,0.05);color:var(--text-muted);font-size:9px;padding:1px 5px;border-radius:3px">' + esc(m.metodo) + '</span>' : '';
  var contoLabel = m.banca_id ? '→ banca' : (m.cassa_tipo ? '→ ' + (m.cassa_tipo === 'cassa_centrale' ? 'Cassa centrale' : 'Cassa stazione') : '');

  var html = '<div style="background:' + bg + ';border-left:3px solid ' + borderL + ';border-radius:0 6px 6px 0;padding:8px 12px;font-size:12px;margin-bottom:6px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px">';
  html += '<div style="flex:1">' + esc(m.descrizione) + tagHtml + '</div>';
  html += '<div style="font-family:var(--font-mono);font-weight:500;color:' + amountColor + '">' + sign + _fgFmtImporto(m.importo) + '</div>';
  html += '</div>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">' + esc(contoLabel) + metodoTag + '</div>';
  html += '</div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// Switch sub-tab Calendario / Foglio
// ────────────────────────────────────────────────────────────────────────
function switchFinanzeSubTab(btn) {
  document.querySelectorAll('.fin-subtab').forEach(function(t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
  btn.classList.add('active');
  document.querySelectorAll('.fin-subpanel').forEach(function(p) { p.style.display = 'none'; });
  document.getElementById(btn.dataset.tab).style.display = '';

  // Carica contenuto della tab attiva
  if (btn.dataset.tab === 'fin-tab-foglio' && typeof caricaFoglioGiornale === 'function') {
    try { caricaFoglioGiornale(); } catch (e) { console.warn('caricaFoglioGiornale errore:', e); }
  }
}
