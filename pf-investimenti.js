// ═══════════════════════════════════════════════════════════════════════════
// pf-investimenti.js — INVESTIMENTI (Finanze)
// v20261005a — 05/10/2026
//
// COME FUNZIONA (regole fissate con Rinaldo):
//  · In foglio giornale l'uscita porta solo la CAUSALE del ramo e l'IVA; il
//    programma ne salva l'IMPONIBILE (l'IVA e' partita di giro e resta fuori
//    da tutti i totali di questa pagina).
//  · L'impianto a cui imputare la spesa si sceglie QUI. Finche' non lo si fa,
//    la spesa e' nel totale del ramo come "spesa generale non imputata".
//    Ogni riga ha anche "lascia come spesa generale": esce dall'elenco da
//    imputare e resta un costo comune del ramo (consulenze, oneri condivisi).
//  · RISORSE = mutui + liquidita' destinata + apporti + INCASSI del ramo
//    (entrate con la stessa causale: la vendita di un impianto rimette
//    disponibilita' per i successivi).
//  · PRENOTATO = somma delle spese previste degli impianti.
//  · Il Gantt compare SOLO se almeno un impianto ha data inizio e fine.
// Nessun calcolo nuovo altrove: tutto parte da foglio_giornale_movimenti.
// ═══════════════════════════════════════════════════════════════════════════

var _invCausale = null;        // causale selezionata
var _invDati = null;           // { causali, risorse, impianti, voci, movimenti }
var _invImpiantoAperto = null; // scheda del singolo impianto

var _INV_STATI = {
  previsto:     { lab: 'Previsto',     col: '#5F5E5A', bg: '#F1EFE8' },
  in_corso:     { lab: 'In corso',     col: '#633806', bg: '#FAEEDA' },
  collaudato:   { lab: 'Collaudato',   col: '#0C447C', bg: '#E6F1FB' },
  in_esercizio: { lab: 'In esercizio', col: '#27500A', bg: '#EAF3DE' }
};
var _INV_CATEGORIE = [
  ['fornitura', 'Fornitura / impianto'], ['progettazione', 'Progettazione'],
  ['contatore_allaccio', 'Contatore e allaccio'], ['notaio', 'Notaio'],
  ['pratiche', 'Pratiche e autorizzazioni'], ['direzione_lavori', 'Direzione lavori'],
  ['opere_civili', 'Opere civili'], ['altro', 'Altro']
];

function _invEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _invEuro(v) {
  return '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _invEuroK(v) {
  return '€ ' + Number(v || 0).toLocaleString('it-IT', { maximumFractionDigits: 0 });
}
function _invData(iso) {
  if (!iso) return '—';
  var s = String(iso).slice(0, 10).split('-');
  return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : String(iso);
}
function _invPuo() {
  if (typeof utenteCorrente === 'undefined' || !utenteCorrente) return false;
  if (utenteCorrente.ruolo === 'admin') return true;
  return (typeof _haPermesso === 'function') ? !!_haPermesso('finanze') : false;
}

// ── CARICAMENTO ────────────────────────────────────────────────────────────
async function caricaInvestimenti() {
  var box = document.getElementById('inv-content');
  if (!box) return;
  box.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">Caricamento…</div>';
  try {
    var rc = await sb.from('causali_investimento').select('*').eq('attiva', true).order('nome');
    var causali = rc.data || [];
    if (!causali.length) {
      box.innerHTML = '<div class="card" style="padding:20px;font-size:13px">Nessuna causale di investimento impostata.</div>';
      return;
    }
    if (!_invCausale || !causali.some(function (c) { return c.id === _invCausale; })) _invCausale = causali[0].id;

    var r = await Promise.all([
      sb.from('investimenti_risorse').select('*').eq('causale_id', _invCausale),
      sb.from('investimenti_impianti').select('*').eq('causale_id', _invCausale).order('nome'),
      sb.from('investimenti_voci').select('*').order('ordine'),
      sb.from('foglio_giornale_movimenti')
        .select('id,data,tipo,importo,imponibile,aliquota_iva,descrizione,banca_id,metodo,note,investimento_impianto_id,investimento_voce_id')
        .eq('causale_investimento_id', _invCausale).order('data', { ascending: false }),
      sb.from('banche_finanziamenti').select('id,descrizione,capitale,tasso,durata_rate,rate_preammortamento,data_prima_rata,numero_contratto')
    ]);
    _invDati = {
      causali: causali,
      risorse: r[0].data || [],
      impianti: r[1].data || [],
      voci: r[2].data || [],
      movimenti: r[3].data || [],
      finanziamenti: r[4].data || []
    };
    _invImpiantoAperto = null;
    _invRender();
  } catch (e) {
    box.innerHTML = '<div class="card" style="padding:20px;color:#A32D2D;font-size:13px">Errore: ' + _invEsc(e && e.message) + '</div>';
  }
}

function invCambiaCausale(id) { _invCausale = id; caricaInvestimenti(); }

// ── CONTI ──────────────────────────────────────────────────────────────────
// Imponibile del movimento: se manca si ricava dall'importo con l'aliquota.
function _invImponibile(m) {
  if (m.imponibile != null) return Number(m.imponibile);
  var iva = Number(m.aliquota_iva || 0);
  return Number(m.importo || 0) / (1 + iva / 100);
}
function _invConti() {
  var D = _invDati;
  var usc = D.movimenti.filter(function (m) { return m.tipo === 'uscita'; });
  var ent = D.movimenti.filter(function (m) { return m.tipo === 'entrata'; });
  var speseImp = {}, spesoImputato = 0, spesoGenerale = 0, daImputare = [];
  usc.forEach(function (m) {
    var imp = _invImponibile(m);
    if (m.investimento_impianto_id) {
      spesoImputato += imp;
      (speseImp[m.investimento_impianto_id] = speseImp[m.investimento_impianto_id] || []).push(m);
    } else if (String(m.note || '').indexOf('[spesa generale]') >= 0) {
      spesoGenerale += imp;
    } else {
      daImputare.push(m);
    }
  });
  var incassi = ent.reduce(function (s, m) { return s + _invImponibile(m); }, 0);
  var risorse = D.risorse.reduce(function (s, r) { return s + Number(r.importo || 0); }, 0);
  var prenotato = D.impianti.reduce(function (s, i) { return s + Number(i.spesa_prevista || 0); }, 0);
  var daImputareTot = daImputare.reduce(function (s, m) { return s + _invImponibile(m); }, 0);
  return {
    risorse: risorse, incassi: incassi, disponibili: risorse + incassi,
    prenotato: prenotato, spesoImputato: spesoImputato, spesoGenerale: spesoGenerale,
    daImputare: daImputare, daImputareTot: daImputareTot,
    spesoTotale: spesoImputato + spesoGenerale + daImputareTot,
    speseImp: speseImp
  };
}
function _invSpesoImpianto(impId) {
  var c = _invConti();
  return (c.speseImp[impId] || []).reduce(function (s, m) { return s + _invImponibile(m); }, 0);
}

// ── PAGINA GENERALE ────────────────────────────────────────────────────────
function _invRender() {
  var box = document.getElementById('inv-content');
  if (!box || !_invDati) return;
  if (_invImpiantoAperto) { _invRenderImpianto(); return; }
  var D = _invDati, C = _invConti();
  var libere = C.disponibili - C.prenotato;

  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
  h += '<div><div style="font-size:17px;font-weight:700">☀️ Investimenti</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Le spese arrivano dal foglio giornale con la causale scelta; qui si imputano ai singoli impianti.</div></div>';
  h += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  h += '<select onchange="invCambiaCausale(this.value)" style="font-size:12.5px;padding:7px 11px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-weight:600">'
    + D.causali.map(function (c) { return '<option value="' + c.id + '"' + (c.id === _invCausale ? ' selected' : '') + '>' + _invEsc(c.nome) + '</option>'; }).join('')
    + '</select>';
  if (_invPuo()) {
    h += '<button onclick="invModaleRisorsa()" style="font-size:12px;padding:7px 12px;border:0.5px solid #185FA5;border-radius:7px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Risorsa</button>';
    h += '<button onclick="invModaleImpianto()" class="btn-primary" style="font-size:12px;padding:7px 13px">+ Impianto</button>';
  }
  h += '</div></div>';

  // KPI
  var kpi = function (lab, val, sub, col) {
    return '<div style="flex:1;min-width:150px;background:var(--bg-card,var(--bg));border:0.5px solid var(--border);border-radius:10px;padding:11px 13px">'
      + '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:19px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div>'
      + '<div style="font-size:10.5px;color:var(--text-muted)">' + (sub || '&nbsp;') + '</div></div>';
  };
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    + kpi('Risorse disponibili', _invEuroK(C.disponibili), C.incassi ? 'di cui incassi ' + _invEuroK(C.incassi) : D.risorse.length + ' voci')
    + kpi('Prenotato dagli impianti', _invEuroK(C.prenotato), D.impianti.length + ' impianti')
    + kpi('Speso (imponibile)', _invEuroK(C.spesoTotale), 'imputato ' + _invEuroK(C.spesoImputato) + ' · generale ' + _invEuroK(C.spesoGenerale + C.daImputareTot), '#A32D2D')
    + kpi('Ancora libere', _invEuroK(libere), libere < 0 ? 'prenotato oltre le risorse' : 'risorse − prenotato', libere < 0 ? '#A32D2D' : '#27500A')
    + '</div>';

  // barra avanzamento
  var pct = C.disponibili > 0 ? Math.min(100, C.spesoTotale / C.disponibili * 100) : 0;
  h += '<div style="height:18px;border-radius:9px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden;display:flex">'
    + '<div style="width:' + pct.toFixed(1) + '%;background:#185FA5;display:flex;align-items:center;padding-left:9px;color:#fff;font-size:10px;font-family:var(--font-mono);white-space:nowrap">'
    + pct.toFixed(1) + '% · ' + _invEuroK(C.spesoTotale) + '</div></div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin:4px 0 14px">Speso sul totale delle risorse disponibili, al netto dell\'IVA.</div>';

  // RISORSE
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:8px">Da dove vengono le risorse</div>';
  if (!D.risorse.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna risorsa inserita.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    D.risorse.forEach(function (r) {
      var fin = (D.finanziamenti || []).filter(function (f) { return f.id === r.finanziamento_id; })[0];
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:6px 4px"><strong>' + _invEsc(r.descrizione) + '</strong>'
        + '<span style="font-size:10px;color:var(--text-muted);margin-left:6px">' + _invEsc(r.tipo) + '</span>'
        + (fin ? '<div style="font-size:10.5px;color:var(--text-muted)">' + _invEsc(fin.numero_contratto || '') + ' · TAN ' + fin.tasso + '% · ' + fin.durata_rate + ' rate'
            + (fin.rate_preammortamento ? ' (di cui ' + fin.rate_preammortamento + ' di preammortamento)' : '') + '</div>' : '')
        + '</td>'
        + '<td style="padding:6px 4px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(r.importo) + '</td>'
        + '<td style="padding:6px 4px;text-align:right;width:40px">' + (_invPuo() ? '<button onclick="invEliminaRisorsa(\'' + r.id + '\')" title="Togli" style="border:0;background:transparent;cursor:pointer;color:#A32D2D">×</button>' : '') + '</td></tr>';
    });
    if (C.incassi > 0) {
      h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:6px 4px"><strong>Incassi del ramo</strong>'
        + '<div style="font-size:10.5px;color:var(--text-muted)">entrate registrate con questa causale (vendite impianti e altro)</div></td>'
        + '<td style="padding:6px 4px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">+ ' + _invEuro(C.incassi) + '</td><td></td></tr>';
    }
    h += '<tr style="font-weight:700"><td style="padding:8px 4px">TOTALE DISPONIBILE</td>'
      + '<td style="padding:8px 4px;text-align:right;font-family:var(--font-mono)">' + _invEuro(C.disponibili) + '</td><td></td></tr>';
    h += '</table>';
  }
  h += '</div>';

  // IMPIANTI
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:8px">Gli impianti</div>';
  if (!D.impianti.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessun impianto inserito.</div>';
  else {
    h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:700px">';
    h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
      + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Impianto</th>'
      + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Stato</th>'
      + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">kW</th>'
      + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Previsto</th>'
      + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Speso</th>'
      + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Residuo</th>'
      + '<th style="padding:6px 7px;border-bottom:1.5px solid var(--border);width:110px"></th></tr>';
    D.impianti.forEach(function (i) {
      var sp = _invSpesoImpianto(i.id), prev = Number(i.spesa_prevista || 0), res = prev - sp;
      var st = _INV_STATI[i.stato] || _INV_STATI.previsto;
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:7px"><strong>' + _invEsc(i.nome) + '</strong>'
        + (i.destinazione === 'vendita' ? ' <span style="font-size:9.5px;background:#FAEEDA;color:#854F0B;padding:1px 7px;border-radius:8px">in vendita</span>' : '')
        + '<div style="font-size:10.5px;color:var(--text-muted)">' + _invEsc(i.luogo || '') + (i.fornitore ? ' · ' + _invEsc(i.fornitore) : '') + '</div></td>'
        + '<td style="padding:7px"><span style="font-size:10px;background:' + st.bg + ';color:' + st.col + ';padding:2px 8px;border-radius:8px;font-weight:600">' + st.lab + '</span></td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + (i.kw ? Number(i.kw).toLocaleString('it-IT') : '—') + '</td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(prev) + '</td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + _invEuro(sp) + '</td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);color:' + (res < 0 ? '#A32D2D' : '#27500A') + ';font-weight:600">' + _invEuro(res) + '</td>'
        + '<td style="padding:7px;text-align:right"><button onclick="invApriImpianto(\'' + i.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer">Apri →</button></td></tr>';
    });
    h += '</table></div>';
  }
  h += '</div>';

  // GANTT — solo se c'e' almeno un impianto con entrambe le date
  h += _invGantt(D.impianti);

  // SPESE DA IMPUTARE
  h += '<div class="card" style="padding:12px 14px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Spese da imputare</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">' + C.daImputare.length + ' movimenti · ' + _invEuro(C.daImputareTot) + ' di imponibile</div></div>';
  if (!C.daImputare.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna spesa in attesa: tutte imputate o segnate come generali.</div>';
  } else {
    h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:680px">';
    C.daImputare.forEach(function (m) {
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:7px;white-space:nowrap">' + _invData(m.data) + '</td>'
        + '<td style="padding:7px">' + _invEsc(m.descrizione || '')
        + '<div style="font-size:10.5px;color:var(--text-muted)">totale ' + _invEuro(m.importo) + ' · IVA ' + (m.aliquota_iva != null ? m.aliquota_iva + '%' : 'n.d.') + '</div></td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(_invImponibile(m)) + '</td>'
        + '<td style="padding:7px;text-align:right;white-space:nowrap">'
        + '<select onchange="invImputa(\'' + m.id + '\', this.value)" style="font-size:11.5px;padding:5px 8px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:var(--text)">'
        + '<option value="">— imputa a… —</option>'
        + D.impianti.map(function (i) { return '<option value="' + i.id + '">' + _invEsc(i.nome) + '</option>'; }).join('')
        + '</select> '
        + '<button onclick="invSegnaGenerale(\'' + m.id + '\')" title="Resta un costo comune del ramo" style="font-size:11.5px;padding:5px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-muted);cursor:pointer">spesa generale</button>'
        + '</td></tr>';
    });
    h += '</table></div>';
  }
  if (C.spesoGenerale > 0) {
    h += '<div style="margin-top:10px;font-size:11.5px;color:var(--text-muted)">Spese generali del ramo (non attribuite a un impianto): <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(C.spesoGenerale) + '</strong> '
      + '<button onclick="invMostraGenerali()" style="font-size:11px;padding:3px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;margin-left:6px">vedi</button></div>';
  }
  h += '</div>';

  box.innerHTML = h;
}

// ── GANTT ──────────────────────────────────────────────────────────────────
function _invGantt(impianti) {
  var conDate = (impianti || []).filter(function (i) { return i.data_inizio && i.data_fine; });
  if (!conDate.length) return '';   // niente date, niente diagramma
  var min = null, max = null;
  conDate.forEach(function (i) {
    var a = new Date(i.data_inizio + 'T12:00:00'), b = new Date(i.data_fine + 'T12:00:00');
    if (!min || a < min) min = a;
    if (!max || b > max) max = b;
  });
  var span = Math.max(1, (max - min));
  var mesi = [];
  var cur = new Date(min.getFullYear(), min.getMonth(), 1);
  while (cur <= max) { mesi.push(new Date(cur)); cur.setMonth(cur.getMonth() + 1); }
  var MM = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic'];

  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:10px">Tempistiche</div>';
  h += '<div style="display:flex;gap:8px;margin-bottom:4px"><div style="width:150px"></div><div style="flex:1;display:flex;font-size:9.5px;color:var(--text-muted)">'
    + mesi.map(function (d) { return '<div style="flex:1;text-align:center;border-left:0.5px solid var(--border)">' + MM[d.getMonth()] + (d.getMonth() === 0 ? ' ' + String(d.getFullYear()).slice(2) : '') + '</div>'; }).join('')
    + '</div></div>';
  conDate.forEach(function (i) {
    var a = new Date(i.data_inizio + 'T12:00:00'), b = new Date(i.data_fine + 'T12:00:00');
    var left = (a - min) / span * 100, w = Math.max(1.5, (b - a) / span * 100);
    var sp = _invSpesoImpianto(i.id), prev = Number(i.spesa_prevista || 0);
    var pct = prev > 0 ? Math.min(100, sp / prev * 100) : 0;
    var st = _INV_STATI[i.stato] || _INV_STATI.previsto;
    h += '<div style="display:flex;gap:8px;align-items:center;margin-bottom:6px">'
      + '<div style="width:150px;font-size:11px;text-align:right;overflow:hidden;white-space:nowrap">' + _invEsc(i.nome) + '</div>'
      + '<div style="flex:1;position:relative;height:20px;background:var(--bg);border-radius:4px">'
      + '<div title="' + _invData(i.data_inizio) + ' → ' + _invData(i.data_fine) + ' · speso ' + pct.toFixed(0) + '%" style="position:absolute;left:' + left.toFixed(1) + '%;width:' + w.toFixed(1) + '%;top:0;height:20px;background:' + st.bg + ';border:0.5px solid ' + st.col + ';border-radius:4px;overflow:hidden">'
      + '<div style="width:' + pct.toFixed(1) + '%;height:100%;background:' + st.col + ';opacity:.35"></div></div></div>'
      + '<div style="width:70px;font-size:10.5px;color:var(--text-muted);text-align:right">' + pct.toFixed(0) + '% speso</div></div>';
  });
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">La parte piena di ogni barra è la quota di spesa già sostenuta sul previsto. Gli impianti senza date non compaiono.</div>';
  h += '</div>';
  return h;
}

// ── IMPUTAZIONE ────────────────────────────────────────────────────────────
async function invImputa(movId, impiantoId) {
  if (!impiantoId) return;
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var r = await sb.from('foglio_giornale_movimenti').update({ investimento_impianto_id: impiantoId }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  if (typeof _auditLog === 'function') _auditLog('investimenti', 'foglio_giornale_movimenti', 'imputata spesa ' + movId + ' a impianto ' + impiantoId);
  toast('✓ Spesa imputata');
  caricaInvestimenti();
}

async function invSegnaGenerale(movId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var m = (_invDati.movimenti || []).filter(function (x) { return x.id === movId; })[0];
  var note = String((m && m.note) || '');
  if (note.indexOf('[spesa generale]') < 0) note = (note ? note + ' · ' : '') + '[spesa generale]';
  var r = await sb.from('foglio_giornale_movimenti').update({ note: note }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  toast('✓ Segnata come spesa generale del ramo');
  caricaInvestimenti();
}

function invMostraGenerali() {
  var gen = (_invDati.movimenti || []).filter(function (m) {
    return m.tipo === 'uscita' && !m.investimento_impianto_id && String(m.note || '').indexOf('[spesa generale]') >= 0;
  });
  var h = '<div style="max-width:620px"><div style="font-size:16px;font-weight:600;margin-bottom:10px">Spese generali del ramo</div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  gen.forEach(function (m) {
    h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:6px 4px">' + _invData(m.data) + '</td>'
      + '<td style="padding:6px 4px">' + _invEsc(m.descrizione || '') + '</td>'
      + '<td style="padding:6px 4px;text-align:right;font-family:var(--font-mono)">' + _invEuro(_invImponibile(m)) + '</td>'
      + '<td style="padding:6px 4px;text-align:right"><button onclick="invRiportaDaImputare(\'' + m.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">rimetti da imputare</button></td></tr>';
  });
  h += '</table></div>';
  apriModal(h);
}

async function invRiportaDaImputare(movId) {
  var m = (_invDati.movimenti || []).filter(function (x) { return x.id === movId; })[0];
  var note = String((m && m.note) || '').replace(/\s*·?\s*\[spesa generale\]/, '').trim();
  var r = await sb.from('foglio_giornale_movimenti').update({ note: note || null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  caricaInvestimenti();
}

async function invTogliImputazione(movId) {
  if (!_invPuo()) { toast('Permesso negato'); return; }
  var r = await sb.from('foglio_giornale_movimenti')
    .update({ investimento_impianto_id: null, investimento_voce_id: null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  toast('Spesa rimessa fra quelle da imputare');
  caricaInvestimenti();
}

async function invImputaVoce(movId, voceId) {
  var r = await sb.from('foglio_giornale_movimenti').update({ investimento_voce_id: voceId || null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

// ── SCHEDA DEL SINGOLO IMPIANTO ────────────────────────────────────────────
function invApriImpianto(id) { _invImpiantoAperto = id; _invRenderImpianto(); }
function invChiudiImpianto() { _invImpiantoAperto = null; _invRender(); }

function _invRenderImpianto() {
  var box = document.getElementById('inv-content');
  var D = _invDati;
  var i = (D.impianti || []).filter(function (x) { return x.id === _invImpiantoAperto; })[0];
  if (!box || !i) { _invImpiantoAperto = null; _invRender(); return; }
  var C = _invConti();
  var spese = (C.speseImp[i.id] || []);
  var speso = spese.reduce(function (s, m) { return s + _invImponibile(m); }, 0);
  var prev = Number(i.spesa_prevista || 0), res = prev - speso;
  var voci = (D.voci || []).filter(function (v) { return v.impianto_id === i.id; });
  var st = _INV_STATI[i.stato] || _INV_STATI.previsto;

  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
  h += '<div><div style="font-size:17px;font-weight:700">' + _invEsc(i.nome)
    + ' <span style="font-size:11px;background:' + st.bg + ';color:' + st.col + ';padding:2px 9px;border-radius:9px;vertical-align:middle">' + st.lab + '</span>'
    + (i.destinazione === 'vendita' ? ' <span style="font-size:11px;background:#FAEEDA;color:#854F0B;padding:2px 9px;border-radius:9px">in vendita</span>' : '') + '</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">' + _invEsc(i.luogo || '—')
    + (i.kw ? ' · ' + Number(i.kw).toLocaleString('it-IT') + ' kW' : '')
    + (i.fornitore ? ' · ' + _invEsc(i.fornitore) : '')
    + (i.data_inizio || i.data_fine ? ' · ' + _invData(i.data_inizio) + ' → ' + _invData(i.data_fine) : '') + '</div></div>';
  h += '<div style="display:flex;gap:8px">';
  if (_invPuo()) {
    h += '<button onclick="invModaleVoce(\'' + i.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid #185FA5;border-radius:7px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Voce di costo</button>';
    h += '<button onclick="invModaleImpianto(\'' + i.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">✏️ Modifica</button>';
  }
  h += '<button onclick="invChiudiImpianto()" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);cursor:pointer">← Tutti gli impianti</button>';
  h += '</div></div>';

  var kpi = function (lab, val, col) {
    return '<div style="flex:1;min-width:140px;background:var(--bg-card,var(--bg));border:0.5px solid var(--border);border-radius:10px;padding:11px 13px">'
      + '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:19px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div></div>';
  };
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    + kpi('Spesa prevista', _invEuro(prev))
    + kpi('Speso', _invEuro(speso), '#A32D2D')
    + kpi('Residuo', _invEuro(res), res < 0 ? '#A32D2D' : '#27500A');
  if (i.destinazione === 'vendita') {
    var ric = Number(i.ricavo_previsto || 0);
    h += kpi('Ricavo previsto', ric ? _invEuro(ric) : '—')
      + kpi('Margine atteso', ric ? _invEuro(ric - prev) : '—', (ric - prev) >= 0 ? '#27500A' : '#A32D2D');
  }
  h += '</div>';

  // VOCI DI COSTO
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:8px">Voci di costo</div>';
  if (!voci.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna voce: la spesa prevista è quella indicata sull\'impianto.</div>';
  else {
    var totVoci = 0;
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
      + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Voce</th>'
      + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Previsto</th>'
      + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Speso</th>'
      + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Residuo</th>'
      + '<th style="width:36px"></th></tr>';
    voci.forEach(function (v) {
      var sv = spese.filter(function (m) { return m.investimento_voce_id === v.id; })
                    .reduce(function (s, m) { return s + _invImponibile(m); }, 0);
      var pv = Number(v.importo_previsto || 0); totVoci += pv;
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:7px"><strong>' + _invEsc(v.descrizione) + '</strong>'
        + '<div style="font-size:10.5px;color:var(--text-muted)">' + _invEsc((_INV_CATEGORIE.filter(function (c) { return c[0] === v.categoria; })[0] || ['', v.categoria])[1])
        + (v.fornitore ? ' · ' + _invEsc(v.fornitore) : '') + '</div></td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(pv) + '</td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + _invEuro(sv) + '</td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);color:' + ((pv - sv) < 0 ? '#A32D2D' : '#27500A') + '">' + _invEuro(pv - sv) + '</td>'
        + '<td style="padding:7px;text-align:right">' + (_invPuo() ? '<button onclick="invEliminaVoce(\'' + v.id + '\')" style="border:0;background:transparent;cursor:pointer;color:#A32D2D">×</button>' : '') + '</td></tr>';
    });
    h += '<tr style="font-weight:700"><td style="padding:8px 7px">TOTALE VOCI</td>'
      + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(totVoci) + '</td>'
      + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(speso) + '</td>'
      + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(totVoci - speso) + '</td><td></td></tr>';
    h += '</table>';
    if (Math.abs(totVoci - prev) > 0.5) {
      h += '<div style="font-size:11px;color:#854F0B;margin-top:8px">La somma delle voci (' + _invEuro(totVoci) + ') è diversa dalla spesa prevista dell\'impianto (' + _invEuro(prev) + ').</div>';
    }
  }
  h += '</div>';

  // PAGAMENTI IMPUTATI
  h += '<div class="card" style="padding:12px 14px">';
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:8px">Pagamenti imputati (' + spese.length + ')</div>';
  if (!spese.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessun pagamento imputato a questo impianto.</div>';
  else {
    h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px;min-width:640px">';
    spese.forEach(function (m) {
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:7px;white-space:nowrap">' + _invData(m.data) + '</td>'
        + '<td style="padding:7px">' + _invEsc(m.descrizione || '')
        + '<div style="font-size:10.5px;color:var(--text-muted)">totale ' + _invEuro(m.importo) + ' · IVA ' + (m.aliquota_iva != null ? m.aliquota_iva + '%' : 'n.d.') + '</div></td>'
        + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(_invImponibile(m)) + '</td>'
        + '<td style="padding:7px;text-align:right;white-space:nowrap">'
        + (voci.length
            ? '<select onchange="invImputaVoce(\'' + m.id + '\', this.value)" style="font-size:11px;padding:4px 7px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
              + '<option value="">— voce —</option>'
              + voci.map(function (v) { return '<option value="' + v.id + '"' + (m.investimento_voce_id === v.id ? ' selected' : '') + '>' + _invEsc(v.descrizione) + '</option>'; }).join('')
              + '</select> '
            : '')
        + '<button onclick="invTogliImputazione(\'' + m.id + '\')" title="Togli dall\'impianto" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-muted);cursor:pointer">togli</button>'
        + '</td></tr>';
    });
    h += '<tr style="font-weight:700"><td colspan="2" style="padding:8px 7px">TOTALE</td>'
      + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _invEuro(speso) + '</td><td></td></tr>';
    h += '</table></div>';
  }
  h += '</div>';

  box.innerHTML = h;
}

// ── MODALI ─────────────────────────────────────────────────────────────────
function invModaleImpianto(id) {
  var i = id ? (_invDati.impianti || []).filter(function (x) { return x.id === id; })[0] : null;
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">' + (i ? 'Modifica impianto' : 'Nuovo impianto') + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Nome *</label><input id="inv-i-nome" value="' + _invEsc(i && i.nome || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Luogo</label><input id="inv-i-luogo" value="' + _invEsc(i && i.luogo || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">kW installati</label><input id="inv-i-kw" type="number" step="0.01" value="' + (i && i.kw != null ? i.kw : '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Fornitore incaricato</label><input id="inv-i-forn" value="' + _invEsc(i && i.fornitore || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Spesa prevista €</label><input id="inv-i-spesa" type="number" step="0.01" value="' + (i && i.spesa_prevista != null ? i.spesa_prevista : '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Destinazione</label><select id="inv-i-dest" style="' + inp + '">'
    + '<option value="proprio"' + (i && i.destinazione === 'proprio' ? ' selected' : '') + '>Impianto nostro</option>'
    + '<option value="vendita"' + (i && i.destinazione === 'vendita' ? ' selected' : '') + '>Costruito per la vendita</option></select></div>';
  h += '<div><label style="' + lb + '">Ricavo previsto € <span style="font-weight:400">(se in vendita)</span></label><input id="inv-i-ricavo" type="number" step="0.01" value="' + (i && i.ricavo_previsto != null ? i.ricavo_previsto : '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Stato</label><select id="inv-i-stato" style="' + inp + '">'
    + Object.keys(_INV_STATI).map(function (k) { return '<option value="' + k + '"' + (i && i.stato === k ? ' selected' : '') + '>' + _INV_STATI[k].lab + '</option>'; }).join('')
    + '</select></div>';
  h += '<div><label style="' + lb + '">Inizio previsto</label><input id="inv-i-dal" type="date" value="' + (i && i.data_inizio || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Fine prevista</label><input id="inv-i-al" type="date" value="' + (i && i.data_fine || '') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Note</label><input id="inv-i-note" value="' + _invEsc(i && i.note || '') + '" style="' + inp + '"></div>';
  h += '</div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:8px">Le date servono solo al diagramma delle tempistiche: senza entrambe, l\'impianto non compare nel Gantt.</div>';
  h += '<div style="display:flex;gap:8px;justify-content:space-between;margin-top:16px">';
  h += i ? '<button onclick="invEliminaImpianto(\'' + i.id + '\')" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid #A32D2D;color:#A32D2D;border-radius:6px;cursor:pointer">Elimina</button>' : '<span></span>';
  h += '<div style="display:flex;gap:8px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaImpianto(' + (i ? '\'' + i.id + '\'' : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div></div>';
  apriModal(h);
}

async function invSalvaImpianto(id) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var nome = (g('inv-i-nome') || '').trim();
  if (!nome) { toast('Il nome è obbligatorio'); return; }
  var p = {
    causale_id: _invCausale,
    nome: nome,
    luogo: g('inv-i-luogo') || null,
    kw: parseFloat(g('inv-i-kw')) || null,
    fornitore: g('inv-i-forn') || null,
    spesa_prevista: parseFloat(g('inv-i-spesa')) || 0,
    destinazione: g('inv-i-dest') || 'proprio',
    ricavo_previsto: parseFloat(g('inv-i-ricavo')) || null,
    stato: g('inv-i-stato') || 'previsto',
    data_inizio: g('inv-i-dal') || null,
    data_fine: g('inv-i-al') || null,
    note: g('inv-i-note') || null,
    updated_at: new Date().toISOString()
  };
  var r = id ? await sb.from('investimenti_impianti').update(p).eq('id', id)
             : await sb.from('investimenti_impianti').insert([p]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  toast(id ? '✓ Impianto aggiornato' : '✓ Impianto creato');
  caricaInvestimenti();
}

async function invEliminaImpianto(id) {
  var sp = _invSpesoImpianto(id);
  if (sp > 0) { toast('Ci sono pagamenti imputati: toglili prima di eliminare l\'impianto'); return; }
  if (!confirm('Elimino questo impianto e le sue voci di costo?')) return;
  var r = await sb.from('investimenti_impianti').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  _invImpiantoAperto = null;
  caricaInvestimenti();
}

function invModaleVoce(impiantoId) {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:480px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Nuova voce di costo</div>';
  h += '<div style="display:grid;gap:10px">';
  h += '<div><label style="' + lb + '">Descrizione *</label><input id="inv-v-descr" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Categoria</label><select id="inv-v-cat" style="' + inp + '">'
    + _INV_CATEGORIE.map(function (c) { return '<option value="' + c[0] + '">' + c[1] + '</option>'; }).join('') + '</select></div>';
  h += '<div><label style="' + lb + '">Fornitore</label><input id="inv-v-forn" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Importo previsto €</label><input id="inv-v-imp" type="number" step="0.01" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaVoce(\'' + impiantoId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

async function invSalvaVoce(impiantoId) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var d = (g('inv-v-descr') || '').trim();
  if (!d) { toast('La descrizione è obbligatoria'); return; }
  var voci = (_invDati.voci || []).filter(function (v) { return v.impianto_id === impiantoId; });
  var r = await sb.from('investimenti_voci').insert([{
    impianto_id: impiantoId,
    categoria: g('inv-v-cat') || 'altro',
    descrizione: d,
    fornitore: g('inv-v-forn') || null,
    importo_previsto: parseFloat(g('inv-v-imp')) || 0,
    ordine: voci.length + 1
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  caricaInvestimenti();
}

async function invEliminaVoce(id) {
  if (!confirm('Elimino questa voce di costo?')) return;
  var r = await sb.from('investimenti_voci').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

function invModaleRisorsa() {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var fin = _invDati.finanziamenti || [];
  var h = '<div style="max-width:480px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Nuova risorsa destinata</div>';
  h += '<div style="display:grid;gap:10px">';
  h += '<div><label style="' + lb + '">Tipo</label><select id="inv-r-tipo" onchange="invRisorsaTipo()" style="' + inp + '">'
    + '<option value="mutuo">Mutuo / finanziamento</option><option value="liquidita">Liquidità aziendale</option>'
    + '<option value="apporto">Apporto soci</option><option value="altro">Altro</option></select></div>';
  h += '<div id="inv-r-fin-box"><label style="' + lb + '">Finanziamento collegato</label><select id="inv-r-fin" onchange="invRisorsaFin()" style="' + inp + '">'
    + '<option value="">— nessuno —</option>'
    + fin.map(function (f) { return '<option value="' + f.id + '" data-cap="' + f.capitale + '" data-desc="' + _invEsc(f.descrizione || '') + '">' + _invEsc(f.descrizione || f.numero_contratto) + ' · ' + _invEuroK(f.capitale) + '</option>'; }).join('')
    + '</select></div>';
  h += '<div><label style="' + lb + '">Descrizione *</label><input id="inv-r-descr" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Importo destinato €</label><input id="inv-r-imp" type="number" step="0.01" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Data</label><input id="inv-r-data" type="date" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaRisorsa()" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

function invRisorsaTipo() {
  var t = (document.getElementById('inv-r-tipo') || {}).value;
  var box = document.getElementById('inv-r-fin-box');
  if (box) box.style.display = (t === 'mutuo') ? 'block' : 'none';
}
function invRisorsaFin() {
  var s = document.getElementById('inv-r-fin');
  if (!s || !s.value) return;
  var o = s.options[s.selectedIndex];
  var d = document.getElementById('inv-r-descr'), i = document.getElementById('inv-r-imp');
  if (d && !d.value) d.value = o.getAttribute('data-desc') || '';
  if (i && !i.value) i.value = o.getAttribute('data-cap') || '';
}

async function invSalvaRisorsa() {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var d = (g('inv-r-descr') || '').trim();
  var imp = parseFloat(g('inv-r-imp')) || 0;
  if (!d) { toast('La descrizione è obbligatoria'); return; }
  if (imp <= 0) { toast('Indica l\'importo destinato'); return; }
  var r = await sb.from('investimenti_risorse').insert([{
    causale_id: _invCausale,
    tipo: g('inv-r-tipo') || 'altro',
    descrizione: d,
    importo: imp,
    finanziamento_id: g('inv-r-fin') || null,
    data: g('inv-r-data') || null
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  caricaInvestimenti();
}

async function invEliminaRisorsa(id) {
  if (!confirm('Tolgo questa risorsa dal totale destinato?')) return;
  var r = await sb.from('investimenti_risorse').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}
