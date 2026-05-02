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
  html += '<button onclick="fgApriModaleEntrata(\'' + iso + '\')" style="font-size:11px;padding:6px 10px;background:transparent;border:0.5px solid #639922;color:#27500A;border-radius:4px;cursor:pointer;font-weight:500">+ Entrata</button>';
  html += '<button onclick="fgApriModaleUscita(\'' + iso + '\')" style="font-size:11px;padding:6px 10px;background:transparent;border:0.5px solid #A32D2D;color:#791F1F;border-radius:4px;cursor:pointer;font-weight:500">+ Uscita</button>';
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


// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — MODALI + ENTRATA / + USCITA (Patch v20260502c)
// ═══════════════════════════════════════════════════════════════════════════
// Tre modi alternativi per entrambe:
//   A · Cerca fattura cliente / fornitore (riconciliazione 1:1 o parziale)
//   B · Generica / extra-fattura (no riconciliazione, solo movimento)
//   C · Cumulativo (split su più fatture/ordini)
// ═══════════════════════════════════════════════════════════════════════════


var _fgModale = {
  data: null,
  tipo: null,           // 'entrata' | 'uscita'
  modo: 'A',            // 'A' | 'B' | 'C'
  contraenteRicerca: '',
  contraenteSelezionato: null,  // {id, nome, tipo: 'cliente'|'fornitore'} o null
  fattureTrovate: [],
  ordiniTrovati: [],
  imputazioni: {}       // { fatturaId/ordineId: importo_imputato }
};

var _fgListaBanche = null; // cache banche_istituti


async function fgApriModaleEntrata(iso) {
  await _fgApriModale(iso, 'entrata');
}

async function fgApriModaleUscita(iso) {
  await _fgApriModale(iso, 'uscita');
}


async function _fgApriModale(iso, tipo) {
  // Reset stato
  _fgModale = {
    data: iso,
    tipo: tipo,
    modo: 'A',
    contraenteRicerca: '',
    contraenteSelezionato: null,
    fattureTrovate: [],
    ordiniTrovati: [],
    imputazioni: {}
  };

  // Carica banche se non in cache
  if (!_fgListaBanche) {
    var banchRes = await sb.from('banche_istituti').select('id,nome').order('nome');
    _fgListaBanche = banchRes.data || [];
  }

  _fgRenderModale();
}


function _fgChiudiModale() {
  var ov = document.getElementById('fg-modale-overlay');
  if (ov) ov.remove();
}


function _fgRenderModale() {
  // Rimuovi precedente
  _fgChiudiModale();

  var m = _fgModale;
  var labelTipo = m.tipo === 'entrata' ? 'Entrata' : 'Uscita';
  var coloreT = m.tipo === 'entrata' ? '#27500A' : '#791F1F';
  var dataLbl = _fgFmtData(m.data);

  var html = '<div id="fg-modale-overlay" onclick="if(event.target===this)_fgChiudiModale()" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.4);z-index:99999;display:flex;align-items:center;justify-content:center;padding:16px">';
  html += '<div style="background:white;border-radius:12px;padding:20px;width:640px;max-width:100%;max-height:calc(100vh - 32px);overflow-y:auto;box-shadow:0 12px 40px rgba(0,0,0,0.3)" onclick="event.stopPropagation()">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px">';
  html += '<div><div style="font-size:15px;font-weight:500;color:' + coloreT + '">Registra ' + labelTipo + ' — ' + esc(dataLbl) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Inserisci un movimento monetario su cassa o banca</div></div>';
  html += '<button onclick="_fgChiudiModale()" style="background:transparent;border:0.5px solid var(--border);border-radius:50%;width:24px;height:24px;cursor:pointer;color:var(--text-muted)">×</button>';
  html += '</div>';

  html += '<div style="border-top:0.5px solid var(--border);margin:14px 0"></div>';

  // Sezione 1: Importo + conto + metodo
  html += '<div style="background:var(--bg);padding:12px;border-radius:6px;margin-bottom:14px">';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  html += '<div><label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500">Importo €</label>';
  html += '<input type="number" step="0.01" min="0.01" id="fg-mod-importo" oninput="_fgAggiornaStatusModale()" placeholder="0,00" style="width:100%;font-family:var(--font-mono);font-weight:500;font-size:13px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px"/></div>';

  html += '<div><label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500">' + (m.tipo === 'entrata' ? 'Conto destinazione' : 'Conto sorgente') + '</label>';
  html += '<select id="fg-mod-conto" style="width:100%;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px">';
  html += '<option value="">— scegli —</option>';
  // Banche
  _fgListaBanche.forEach(function(b) {
    html += '<option value="banca:' + esc(b.id) + '">' + esc(b.nome) + '</option>';
  });
  // Casse virtuali
  html += '<option value="cassa:cassa_centrale">Cassa centrale</option>';
  html += '<option value="cassa:cassa_stazione">Cassa stazione</option>';
  html += '</select></div>';

  html += '<div><label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500">Metodo</label>';
  html += '<select id="fg-mod-metodo" style="width:100%;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px">';
  html += '<option value="bonifico">Bonifico</option><option value="riba">RIBA</option><option value="contanti">Contanti</option><option value="assegno">Assegno</option><option value="pos">POS</option><option value="altro">Altro</option>';
  html += '</select></div>';
  html += '</div></div>';

  // Sezione 2: Modi
  var labelSottoTitolo = m.tipo === 'entrata' ? 'A copertura di...' : 'A pagamento di...';
  html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-muted);margin-bottom:8px;font-weight:500">' + labelSottoTitolo + '</div>';

  function modoTab(letterId, label) {
    var attivo = m.modo === letterId;
    return '<div onclick="_fgCambiaModo(\'' + letterId + '\')" style="padding:6px 12px;font-size:12px;border-radius:4px;cursor:pointer;background:' +
      (attivo ? '#185FA5' : 'transparent') + ';color:' + (attivo ? 'white' : 'var(--text)') +
      ';border:0.5px solid ' + (attivo ? '#185FA5' : 'var(--border)') + ';font-weight:' + (attivo ? '500' : '400') + '">' + label + '</div>';
  }
  var labelA = m.tipo === 'entrata' ? 'A · Cerca fattura cliente' : 'A · Cerca fattura fornitore';
  var labelB = m.tipo === 'entrata' ? 'B · Generica / no fattura' : 'B · Spesa generica / extra-fattura';
  var labelC = 'C · Cumulativo (split)';
  html += '<div style="display:flex;gap:4px;margin-bottom:14px;padding-bottom:12px;border-bottom:0.5px solid var(--border)">';
  html += modoTab('A', labelA) + modoTab('B', labelB) + modoTab('C', labelC);
  html += '</div>';

  // Contenuto modo
  html += '<div id="fg-modo-content">';
  html += _fgRenderModoContent();
  html += '</div>';

  // Footer azioni
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:18px;padding-top:14px;border-top:0.5px solid var(--border)">';
  html += '<div id="fg-mod-status" style="font-size:11px;color:var(--text-muted)"></div>';
  html += '<div style="display:flex;gap:8px">';
  html += '<button onclick="_fgChiudiModale()" style="font-size:12px;padding:6px 14px;background:transparent;border:0.5px solid var(--border);border-radius:4px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_fgConfermaMovimento()" style="font-size:12px;padding:6px 14px;background:#185FA5;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">Conferma e registra</button>';
  html += '</div></div>';

  html += '</div></div>';
  document.body.insertAdjacentHTML('beforeend', html);
}


function _fgCambiaModo(letterId) {
  _fgModale.modo = letterId;
  _fgModale.contraenteSelezionato = null;
  _fgModale.fattureTrovate = [];
  _fgModale.ordiniTrovati = [];
  _fgModale.imputazioni = {};
  document.getElementById('fg-modo-content').innerHTML = _fgRenderModoContent();
}


function _fgRenderModoContent() {
  var m = _fgModale;
  if (m.modo === 'A') return _fgRenderModoA();
  if (m.modo === 'B') return _fgRenderModoB();
  if (m.modo === 'C') return _fgRenderModoC();
  return '';
}


// ────────────────────────────────────────────────────────────────────────
// MODO A: cerca fattura/ordine specifico
// ────────────────────────────────────────────────────────────────────────
function _fgRenderModoA() {
  var m = _fgModale;
  var labelCerca = m.tipo === 'entrata' ? 'cliente' : 'fornitore';
  var html = '';

  html += '<div style="margin-bottom:10px"><label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500">Cerca ' + labelCerca + '</label>';
  html += '<input type="text" id="fg-cerca-contraente" oninput="_fgCercaContraente()" placeholder="Nome, P.IVA o codice fiscale..." style="width:100%;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px"/></div>';

  html += '<div id="fg-risultati-cerca" style="max-height:300px;overflow-y:auto"></div>';
  html += '<div id="fg-fatture-trovate" style="margin-top:10px"></div>';

  return html;
}


async function _fgCercaContraente() {
  var q = (document.getElementById('fg-cerca-contraente').value || '').trim();
  var elRes = document.getElementById('fg-risultati-cerca');
  if (!elRes) return;
  if (q.length < 2) {
    elRes.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:6px;font-style:italic">Inserisci almeno 2 caratteri...</div>';
    return;
  }

  var m = _fgModale;
  var html = '';

  if (m.tipo === 'entrata') {
    // Cerco tra clienti
    var resC = await sb.from('clienti').select('id,nome').ilike('nome', '%' + q + '%').limit(8);
    var clienti = resC.data || [];
    if (clienti.length === 0) {
      html = '<div style="font-size:11px;color:var(--text-muted);padding:6px;font-style:italic">Nessun cliente trovato</div>';
    } else {
      html = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Risultati (click per selezionare):</div>';
      clienti.forEach(function(c) {
        html += '<div onclick="_fgSelezionaContraente(\'' + esc(c.id) + '\',\'' + esc(c.nome).replace(/'/g, "\\'") + '\',\'cliente\')" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:4px;margin-bottom:3px;cursor:pointer;font-size:12px" onmouseover="this.style.background=\'#E6F1FB\'" onmouseout="this.style.background=\'transparent\'">' + esc(c.nome) + '</div>';
      });
    }
  } else {
    // Cerco tra fornitori (campo testuale negli ordini)
    var resF = await sb.from('ordini').select('fornitore').eq('tipo_ordine', 'entrata_deposito').ilike('fornitore', '%' + q + '%').limit(50);
    var fornSet = {};
    (resF.data || []).forEach(function(o) { if (o.fornitore) fornSet[o.fornitore] = true; });
    var fornitori = Object.keys(fornSet).slice(0, 8);
    if (fornitori.length === 0) {
      html = '<div style="font-size:11px;color:var(--text-muted);padding:6px;font-style:italic">Nessun fornitore trovato</div>';
    } else {
      html = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Risultati (click per selezionare):</div>';
      fornitori.forEach(function(nome) {
        html += '<div onclick="_fgSelezionaContraente(null,\'' + esc(nome).replace(/'/g, "\\'") + '\',\'fornitore\')" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:4px;margin-bottom:3px;cursor:pointer;font-size:12px" onmouseover="this.style.background=\'#E6F1FB\'" onmouseout="this.style.background=\'transparent\'">' + esc(nome) + '</div>';
      });
    }
  }
  elRes.innerHTML = html;
}


async function _fgSelezionaContraente(id, nome, tipo) {
  _fgModale.contraenteSelezionato = { id: id, nome: nome, tipo: tipo };
  document.getElementById('fg-risultati-cerca').innerHTML = '<div style="background:var(--bg);padding:8px 12px;border-radius:4px;font-size:12px;display:flex;justify-content:space-between;align-items:center"><span><strong>Selezionato:</strong> ' + esc(nome) + '</span><button onclick="_fgRisetContraente()" style="background:transparent;border:0.5px solid var(--border);border-radius:4px;font-size:10px;padding:2px 8px;cursor:pointer">Cambia</button></div>';

  // Carico fatture/ordini aperti del contraente
  var elFatt = document.getElementById('fg-fatture-trovate');
  elFatt.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:6px">Caricamento fatture aperte...</div>';

  if (tipo === 'cliente') {
    var resV = await sb.from('estratto_conto_cliente').select('*').eq('cliente_id', id).gt('saldo_residuo', 0.01).order('data', { ascending: false }).limit(20);
    _fgModale.fattureTrovate = resV.data || [];
    elFatt.innerHTML = _fgRenderListaFatture();
  } else {
    var resO = await sb.from('ordini').select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,giorni_pagamento,pagato_fornitore').eq('tipo_ordine', 'entrata_deposito').eq('fornitore', nome).eq('pagato_fornitore', false).order('data', { ascending: false }).limit(20);
    _fgModale.ordiniTrovati = resO.data || [];
    elFatt.innerHTML = _fgRenderListaOrdini();
  }
}


function _fgRisetContraente() {
  _fgModale.contraenteSelezionato = null;
  _fgModale.fattureTrovate = [];
  _fgModale.ordiniTrovati = [];
  _fgModale.imputazioni = {};
  document.getElementById('fg-risultati-cerca').innerHTML = '';
  document.getElementById('fg-fatture-trovate').innerHTML = '';
  document.getElementById('fg-cerca-contraente').value = '';
  document.getElementById('fg-cerca-contraente').focus();
}


function _fgRenderListaFatture() {
  var f = _fgModale.fattureTrovate;
  if (!f.length) {
    return '<div style="font-size:11px;color:var(--text-muted);padding:8px;font-style:italic;background:var(--bg);border-radius:4px">Nessuna fattura aperta per questo cliente</div>';
  }
  var html = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Fatture aperte (' + f.length + '):</div>';
  html += '<table style="width:100%;font-size:11px;border-collapse:collapse">';
  html += '<thead><tr style="background:var(--bg)"><th style="text-align:left;padding:5px 6px">N°</th><th style="text-align:left;padding:5px 6px">Data</th><th style="text-align:right;padding:5px 6px">Totale</th><th style="text-align:right;padding:5px 6px">Saldo</th><th style="text-align:right;padding:5px 6px">Imputa €</th></tr></thead><tbody>';
  f.forEach(function(fa) {
    var imp = _fgModale.imputazioni['fatt:' + fa.fattura_id] || '';
    html += '<tr style="border-bottom:0.5px solid var(--border)">';
    html += '<td style="padding:5px 6px;font-family:var(--font-mono);font-weight:500">' + esc(String(fa.numero || '')) + '/' + esc(String(fa.anno || '')) + '</td>';
    html += '<td style="padding:5px 6px">' + _fgFmtData(fa.data) + '</td>';
    html += '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono)">' + _fgFmtImporto(fa.importo_totale) + '</td>';
    html += '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);color:#BA7517;font-weight:500">' + _fgFmtImporto(fa.saldo_residuo) + '</td>';
    html += '<td style="padding:5px 6px;text-align:right"><input type="number" step="0.01" min="0" max="' + fa.saldo_residuo + '" value="' + imp + '" placeholder="0,00" oninput="_fgImputaFattura(\'' + fa.fattura_id + '\',this.value)" style="width:90px;font-family:var(--font-mono);font-size:11px;padding:3px 6px;border:0.5px solid var(--border);border-radius:3px;text-align:right"/></td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}


function _fgRenderListaOrdini() {
  var o = _fgModale.ordiniTrovati;
  if (!o.length) {
    return '<div style="font-size:11px;color:var(--text-muted);padding:8px;font-style:italic;background:var(--bg);border-radius:4px">Nessun ordine aperto per questo fornitore</div>';
  }
  var html = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">Ordini non pagati (' + o.length + '):</div>';
  html += '<table style="width:100%;font-size:11px;border-collapse:collapse">';
  html += '<thead><tr style="background:var(--bg)"><th style="text-align:left;padding:5px 6px">Data</th><th style="text-align:left;padding:5px 6px">Prodotto</th><th style="text-align:right;padding:5px 6px">Litri</th><th style="text-align:right;padding:5px 6px">Importo</th><th style="text-align:right;padding:5px 6px">Imputa €</th></tr></thead><tbody>';
  o.forEach(function(or) {
    var costo = (Number(or.costo_litro || 0) + Number(or.trasporto_litro || 0)) * Number(or.litri || 0) * (1 + (Number(or.iva || 22)) / 100);
    var imp = _fgModale.imputazioni['ord:' + or.id] || '';
    html += '<tr style="border-bottom:0.5px solid var(--border)">';
    html += '<td style="padding:5px 6px">' + _fgFmtData(or.data) + '</td>';
    html += '<td style="padding:5px 6px">' + esc(or.prodotto || '—') + '</td>';
    html += '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono)">' + Number(or.litri || 0).toLocaleString('it-IT') + '</td>';
    html += '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);color:#BA7517;font-weight:500">' + _fgFmtImporto(costo) + '</td>';
    html += '<td style="padding:5px 6px;text-align:right"><input type="number" step="0.01" min="0" value="' + imp + '" placeholder="0,00" oninput="_fgImputaOrdine(\'' + or.id + '\',this.value)" style="width:90px;font-family:var(--font-mono);font-size:11px;padding:3px 6px;border:0.5px solid var(--border);border-radius:3px;text-align:right"/></td>';
    html += '</tr>';
  });
  html += '</tbody></table>';
  return html;
}


function _fgImputaFattura(id, val) {
  var v = parseFloat(val) || 0;
  if (v <= 0) delete _fgModale.imputazioni['fatt:' + id];
  else _fgModale.imputazioni['fatt:' + id] = v;
  _fgAggiornaStatusModale();
}

function _fgImputaOrdine(id, val) {
  var v = parseFloat(val) || 0;
  if (v <= 0) delete _fgModale.imputazioni['ord:' + id];
  else _fgModale.imputazioni['ord:' + id] = v;
  _fgAggiornaStatusModale();
}


function _fgAggiornaStatusModale() {
  var st = document.getElementById('fg-mod-status');
  if (!st) return;
  var imp = parseFloat(document.getElementById('fg-mod-importo').value) || 0;
  var totImputato = 0;
  Object.keys(_fgModale.imputazioni).forEach(function(k) { totImputato += _fgModale.imputazioni[k]; });
  if (_fgModale.modo === 'B') { st.innerHTML = ''; return; }
  if (Object.keys(_fgModale.imputazioni).length === 0) { st.innerHTML = ''; return; }
  var diff = imp - totImputato;
  if (Math.abs(diff) < 0.01) {
    st.innerHTML = '<span style="color:#27500A">✓ Imputato ' + _fgFmtImporto(totImputato) + ' / ' + _fgFmtImporto(imp) + ' €</span>';
  } else if (diff > 0) {
    st.innerHTML = '<span style="color:#BA7517">⚠ Imputato ' + _fgFmtImporto(totImputato) + ' / ' + _fgFmtImporto(imp) + ' € — diff +' + _fgFmtImporto(diff) + '</span>';
  } else {
    st.innerHTML = '<span style="color:#A32D2D">✗ Imputato ' + _fgFmtImporto(totImputato) + ' / ' + _fgFmtImporto(imp) + ' € — eccesso ' + _fgFmtImporto(-diff) + '</span>';
  }
}


// ────────────────────────────────────────────────────────────────────────
// MODO B: generica / no fattura
// ────────────────────────────────────────────────────────────────────────
function _fgRenderModoB() {
  var m = _fgModale;
  var sub = m.tipo === 'entrata'
    ? 'Entrata generica senza fattura collegata (es. ricevuta libera, restituzione, accredito vario).'
    : 'Spesa generica senza fattura in sistema (es. stipendio, F24, affitto, bolletta, piccola spesa).';
  var html = '<div style="background:var(--bg);border-left:3px solid var(--text-muted);padding:8px 12px;font-size:11px;color:var(--text-muted);border-radius:0 4px 4px 0;margin-bottom:10px;font-style:italic">' + sub + '</div>';
  html += '<div><label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500">Descrizione *</label>';
  html += '<input type="text" id="fg-descr-b" placeholder="Es: Stipendio Aprile 2026" style="width:100%;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px"/></div>';
  html += '<div style="margin-top:10px"><label style="display:block;font-size:11px;color:var(--text-muted);margin-bottom:4px;font-weight:500">Note (opzionale)</label>';
  html += '<textarea id="fg-note-b" rows="2" style="width:100%;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px;resize:vertical"></textarea></div>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// MODO C: cumulativo (split su più fatture/ordini di stesso contraente)
// ────────────────────────────────────────────────────────────────────────
function _fgRenderModoC() {
  // Per Modo C riusiamo la logica di Modo A ma permettendo selezione multipla
  // (l'utente seleziona checkbox e imputa importi su più righe)
  var m = _fgModale;
  var html = '<div style="background:#E6F1FB;border-left:3px solid #185FA5;padding:8px 12px;font-size:11px;color:#0C447C;border-radius:0 4px 4px 0;margin-bottom:10px">';
  html += 'Modo cumulativo: imputa l\'importo su più fatture/ordini ' + (m.tipo === 'entrata' ? 'dello stesso cliente' : 'dello stesso fornitore') + '. Lo split deve quadrare con l\'importo totale.';
  html += '</div>';
  // Cerca contraente come modo A
  html += _fgRenderModoA();
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// CONFERMA: scrittura DB
// ────────────────────────────────────────────────────────────────────────
async function _fgConfermaMovimento() {
  var m = _fgModale;
  var importo = parseFloat(document.getElementById('fg-mod-importo').value) || 0;
  var conto = document.getElementById('fg-mod-conto').value;
  var metodo = document.getElementById('fg-mod-metodo').value;

  // Validazioni
  if (importo <= 0) { alert('⚠ Inserisci un importo > 0'); return; }
  if (!conto) { alert('⚠ Seleziona il conto (banca o cassa)'); return; }

  var banca_id = null, cassa_tipo = null;
  if (conto.indexOf('banca:') === 0) banca_id = conto.substring(6);
  else if (conto.indexOf('cassa:') === 0) cassa_tipo = conto.substring(6);

  // Costruisci descrizione + verifica imputazioni in base al modo
  var descrizione = '';
  var imputazioni = [];

  if (m.modo === 'B') {
    descrizione = (document.getElementById('fg-descr-b').value || '').trim();
    if (!descrizione) { alert('⚠ Inserisci la descrizione'); return; }
  } else {
    // Modo A o C: serve almeno una imputazione
    var impKeys = Object.keys(m.imputazioni);
    if (impKeys.length === 0) {
      alert('⚠ Imputa l\'importo su almeno una fattura/ordine. Per movimenti senza fattura usa il Modo B.');
      return;
    }
    // Quadratura
    var totImp = 0;
    impKeys.forEach(function(k) { totImp += m.imputazioni[k]; });
    if (Math.abs(totImp - importo) > 0.01) {
      if (!confirm('⚠ La somma delle imputazioni (' + _fgFmtImporto(totImp) + ') non corrisponde all\'importo totale (' + _fgFmtImporto(importo) + ').\n\nDifferenza: ' + _fgFmtImporto(totImp - importo) + '\n\nProcedere comunque? (la differenza resterà non imputata)')) return;
    }
    // Costruisco imputazioni e descrizione
    impKeys.forEach(function(k) {
      var v = m.imputazioni[k];
      if (k.indexOf('fatt:') === 0) {
        imputazioni.push({ tipo: 'fattura', id: k.substring(5), importo: v });
      } else if (k.indexOf('ord:') === 0) {
        imputazioni.push({ tipo: 'ordine', id: k.substring(4), importo: v });
      }
    });
    descrizione = (m.contraenteSelezionato ? m.contraenteSelezionato.nome : 'Movimento') + ' — ' + impKeys.length + (impKeys.length === 1 ? ' documento' : ' documenti');
  }

  var note = (document.getElementById('fg-note-b') ? document.getElementById('fg-note-b').value : '') || null;

  // INSERT movimento
  var insMov = await sb.from('foglio_giornale_movimenti').insert([{
    data: m.data,
    tipo: m.tipo,
    importo: importo,
    descrizione: descrizione,
    banca_id: banca_id,
    cassa_tipo: cassa_tipo,
    metodo: metodo,
    origine: 'manuale',
    note: note
  }]).select('id').single();

  if (insMov.error) {
    alert('Errore inserimento movimento: ' + insMov.error.message);
    console.error(insMov.error);
    return;
  }
  var movId = insMov.data.id;

  // INSERT riconciliazioni se presenti
  if (imputazioni.length > 0) {
    var rows = imputazioni.map(function(i) {
      return {
        movimento_id: movId,
        fattura_emessa_id: i.tipo === 'fattura' ? i.id : null,
        ordine_id: i.tipo === 'ordine' ? i.id : null,
        importo_imputato: i.importo
      };
    });
    var insRic = await sb.from('foglio_giornale_riconciliazioni').insert(rows);
    if (insRic.error) {
      alert('Movimento creato ma errore riconciliazioni: ' + insRic.error.message);
      console.error(insRic.error);
      _fgChiudiModale();
      caricaFoglioGiornale();
      return;
    }
  }

  // Audit (se disponibile)
  if (typeof _auditLog === 'function') {
    _auditLog('foglio_giornale', 'foglio_giornale_movimenti', m.tipo + ' ' + _fgFmtImporto(importo) + ' € · ' + descrizione);
  }

  toast('✅ ' + (m.tipo === 'entrata' ? 'Entrata' : 'Uscita') + ' di € ' + _fgFmtImporto(importo) + ' registrata');
  _fgChiudiModale();
  caricaFoglioGiornale();
}
