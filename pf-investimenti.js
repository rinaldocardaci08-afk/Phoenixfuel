// ═══════════════════════════════════════════════════════════════════════════
// pf-investimenti.js — INVESTIMENTI (Finanze)
// v20261005l — barra di avanzamento dei PAGAMENTI sotto le voci di costo: quanto
//   abbiamo gia' pagato rispetto al costo totale dell'opera, col residuo da pagare.
// v20261005i — scelta del fornitore DEFINITIVA: quando un preventivo e' scelto gli
//   altri non si possono piu' selezionare (niente pulsante "scegli"); restano a
//   memoria del confronto. Per cambiare davvero si elimina il preventivo scelto.
// v20261005h — popup del finanziamento rifatto (versione B: fascia blu con capitale,
//   sezioni Condizioni / Preammortamento / Rata / Avanzamento) e aliquota IVA della
//   conferma d'ordine chiesta ogni volta, proposta al 10%.
// v20261005g — CONFERMA D'ORDINE AL FORNITORE per impianto: dal preventivo scelto
//   si genera il documento da mandare al fornitore (dati delle parti, oggetto,
//   descrizione, imponibile/IVA/totale, quote di pagamento, firme).
// v20261005f — blocco PREVENTIVI RICEVUTI nella scheda impianto: i preventivi dei
//   fornitori sullo stesso impianto, con quello scelto in evidenza, cosi' resta
//   scritto il confronto (es. Mungo Bus: Ormus 91.000 scelto, NovaPower 85.000).
// v20261005e — (1) cliccando la riga di una risorsa-mutuo si apre un popup con le
//   CARATTERISTICHE del finanziamento (senza piano di rientro); (2) nella scheda di
//   ogni impianto: Gantt del singolo e CONTO ECONOMICO PREVISIONALE a 10 anni + 25
//   anni per blocchi, con le ipotesi del piano (produzione per kW, degrado, prezzo
//   dell'energia per fasce, costi operativi, accantonamento, ammortamento, CER).
// v20261005d — lo switch delle linguette e il punto d'ingresso della sezione sono
//   passati a pf-fotovoltaico.js: qui resta solo la pagina Investimenti.
// v20261005c — nel Gantt: linea di oggi e percentuale di spesa sul totale previsto degli impianti a diagramma
// v20261005b — la sezione vive ora sotto ☀️ Fotovoltaico (camera stagna), non in Finanze;
//   aggiunto switchFvSubTab per le linguette del ramo.
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
      sb.from('banche_finanziamenti').select('id,descrizione,capitale,tasso,durata_rate,rate_preammortamento,data_prima_rata,numero_contratto'),
      sb.from('investimenti_preventivi').select('*').order('data')
    ]);
    _invDati = {
      causali: causali,
      risorse: r[0].data || [],
      impianti: r[1].data || [],
      voci: r[2].data || [],
      movimenti: r[3].data || [],
      finanziamenti: r[4].data || [],
      preventivi: (r[5] && r[5].data) || []
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
      h += '<tr style="border-bottom:0.5px solid var(--border)' + (fin ? ';cursor:pointer' : '') + '"'
        + (fin ? ' onclick="invPopupFinanziamento(\'' + fin.id + '\')" title="Vedi le caratteristiche del finanziamento"' : '') + '>'
        + '<td style="padding:6px 4px"><strong>' + _invEsc(r.descrizione) + '</strong>'
        + '<span style="font-size:10px;color:var(--text-muted);margin-left:6px">' + _invEsc(r.tipo) + '</span>'
        + (fin ? '<div style="font-size:10.5px;color:var(--text-muted)">' + _invEsc(fin.numero_contratto || '') + ' · TAN ' + fin.tasso + '% · ' + fin.durata_rate + ' rate'
            + (fin.rate_preammortamento ? ' (di cui ' + fin.rate_preammortamento + ' di preammortamento)' : '') + '</div>' : '')
        + '</td>'
        + '<td style="padding:6px 4px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(r.importo) + '</td>'
        + '<td style="padding:6px 4px;text-align:right;width:40px">' + (_invPuo() ? '<button onclick="event.stopPropagation();invEliminaRisorsa(\'' + r.id + '\')" title="Togli" style="border:0;background:transparent;cursor:pointer;color:#A32D2D">×</button>' : '') + '</td></tr>';
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

  // linea di oggi, se cade dentro il periodo mostrato
  var oggiD = new Date(); oggiD.setHours(12, 0, 0, 0);
  var oggiPct = (oggiD >= min && oggiD <= max) ? ((oggiD - min) / span * 100) : null;
  // percentuale di spesa sul totale considerato (somma dei previsti degli impianti in diagramma)
  var prevTot = conDate.reduce(function (a, i) { return a + Number(i.spesa_prevista || 0); }, 0);
  var spesoTot = conDate.reduce(function (a, i) { return a + _invSpesoImpianto(i.id); }, 0);
  var pctTot = prevTot > 0 ? (spesoTot / prevTot * 100) : 0;

  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:10px">'
    + '<div style="font-size:13px;font-weight:700">Tempistiche</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">speso <strong style="font-family:var(--font-mono);color:var(--text)">'
      + _invEuro(spesoTot) + '</strong> su <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(prevTot)
      + '</strong> previsti · <strong style="color:' + (pctTot > 100 ? '#A32D2D' : 'var(--text)') + '">' + pctTot.toFixed(1) + '%</strong></div></div>';
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
      + '<div style="width:' + pct.toFixed(1) + '%;height:100%;background:' + st.col + ';opacity:.35"></div></div>'
      + (oggiPct !== null ? '<div title="oggi" style="position:absolute;left:' + oggiPct.toFixed(2) + '%;top:-2px;width:2px;height:24px;background:#A32D2D"></div>' : '')
      + '</div>'
      + '<div style="width:70px;font-size:10.5px;color:var(--text-muted);text-align:right">' + pct.toFixed(0) + '% speso</div></div>';
  });
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">La parte piena di ogni barra è la quota di spesa già sostenuta sul previsto'
    + (oggiPct !== null ? ' · la <span style="color:#A32D2D;font-weight:600">linea rossa</span> è oggi' : '')
    + '. Gli impianti senza date non compaiono.</div>';
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
  // barra dei pagamenti sul costo totale dell'opera
  var base = (voci.length ? voci.reduce(function (s2, v) { return s2 + Number(v.importo_previsto || 0); }, 0) : prev);
  if (base > 0) {
    var pctP = Math.min(100, speso / base * 100);
    var daPagare = base - speso;
    h += '<div style="margin-top:14px;padding-top:12px;border-top:0.5px solid var(--border)">';
    h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;font-size:11.5px;margin-bottom:5px">'
      + '<span style="font-weight:600">Pagamenti sul costo dell\'opera</span>'
      + '<span style="color:var(--text-muted)">pagato <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(speso) + '</strong>'
      + ' su <strong style="font-family:var(--font-mono);color:var(--text)">' + _invEuro(base) + '</strong></span></div>';
    h += '<div style="height:16px;border-radius:8px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden;display:flex">'
      + '<div style="width:' + pctP.toFixed(1) + '%;background:' + (pctP >= 100 ? '#27500A' : '#185FA5') + ';display:flex;align-items:center;padding-left:8px;color:#fff;font-size:10px;font-family:var(--font-mono);white-space:nowrap">'
      + pctP.toFixed(1) + '%</div></div>';
    h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">'
      + (daPagare > 0.5 ? 'Ancora da pagare <strong style="font-family:var(--font-mono);color:#A32D2D">' + _invEuro(daPagare) + '</strong>'
                        : (daPagare < -0.5 ? 'Pagato <strong style="color:#A32D2D">' + _invEuro(-daPagare) + '</strong> oltre il previsto'
                                           : 'Opera interamente pagata'))
      + ' · i pagamenti sono quelli imputati a questo impianto dal foglio giornale.</div>';
    h += '</div>';
  }
  h += '</div>';

  // PREVENTIVI RICEVUTI dai fornitori per questo impianto
  h += _invBloccoPreventivi(i);

  // GANTT del singolo impianto + CONTO ECONOMICO PREVISIONALE
  h += _invGanttSingolo(i);
  h += _invBloccoCE(i, prev);

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

// ── POPUP CARATTERISTICHE DEL FINANZIAMENTO (05/10) ────────────────────────
// Solo i dati del mutuo, senza piano di rientro: capitale, tasso, rate pagate,
// preammortamento, rata attuale e rata dopo, capitale residuo.
async function invPopupFinanziamento(finId) {
  var f = (_invDati.finanziamenti || []).filter(function (x) { return x.id === finId; })[0];
  if (!f) { toast('Finanziamento non trovato'); return; }
  var rr = await sb.from('banche_finanziamenti_rate').select('*').eq('finanziamento_id', finId).order('numero');
  var rate = rr.data || [];
  var oggi = new Date().toISOString().slice(0, 10);
  var pagate = rate.filter(function (r) { return r.data_scadenza <= oggi; });
  var prossima = rate.filter(function (r) { return r.data_scadenza > oggi; })[0];
  var pre = Number(f.rate_preammortamento || 0);
  var finePre = (pre > 0 && rate[pre - 1]) ? rate[pre - 1].data_scadenza : null;
  var rataDopo = (pre > 0 && rate[pre]) ? rate[pre].rata : (rate[0] ? rate[0].rata : null);
  var rataOggi = prossima ? prossima.rata : (rate[0] ? rate[0].rata : null);
  var residuo = prossima ? prossima.residuo_capitale : (rate.length ? 0 : f.capitale);
  var tot = rate.length || Number(f.durata_rate || 0);
  var pct = tot > 0 ? (pagate.length / tot * 100) : 0;
  var inPre = pre > 0 && pagate.length < pre;

  var sez = function (titolo, dentro) {
    return '<div style="display:flex;border-bottom:0.5px solid var(--border);padding:11px 0">'
      + '<div style="width:150px;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;padding-top:3px">' + titolo + '</div>'
      + '<div style="flex:1;display:flex;gap:22px;flex-wrap:wrap;align-items:center">' + dentro + '</div></div>';
  };
  var voce = function (lab, val, grande) {
    return '<div><div style="font-size:10px;color:var(--text-muted)">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-weight:600' + (grande ? ';font-size:15px' : '') + '">' + val + '</div></div>';
  };

  var h = '<div style="max-width:540px;margin:-24px -24px 0;border-radius:8px;overflow:hidden">';
  h += '<div style="background:#185FA5;color:#fff;padding:14px 18px">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">'
    + '<div><div style="font-size:15px;font-weight:600">' + _invEsc(f.descrizione || 'Finanziamento') + '</div>'
    + '<div style="font-size:11px;opacity:.85">' + _invEsc(f.numero_contratto || '') + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:10px;opacity:.8;text-transform:uppercase">Capitale</div>'
    + '<div style="font-size:21px;font-weight:600;font-family:var(--font-mono)">' + _invEuro(f.capitale) + '</div></div>'
    + '</div></div>';
  h += '<div style="padding:0 18px;background:var(--bg-card,var(--bg))">';
  h += sez('Condizioni',
      voce('TAN', (f.tasso != null ? Number(f.tasso).toLocaleString('it-IT', { minimumFractionDigits: 3, maximumFractionDigits: 4 }) + ' %' : '—'))
    + voce('Tipo', _invEsc(f.tipo_tasso || 'fisso'))
    + voce('Durata', (tot ? tot + ' mesi' : '—'))
    + voce('Erogato', _invData(f.data_erogazione)));
  if (pre > 0) {
    h += sez('Preammortamento',
        voce('Fino al', finePre ? _invData(finePre) : '—')
      + voce('Rate di soli interessi', String(pre))
      + (inPre ? '<span style="font-size:10px;background:#FAEEDA;color:#854F0B;padding:3px 9px;border-radius:9px;font-weight:600">in corso</span>'
               : '<span style="font-size:10px;background:#EAF3DE;color:#27500A;padding:3px 9px;border-radius:9px;font-weight:600">concluso</span>'));
  }
  h += sez('Rata',
      voce('Oggi', rataOggi != null ? _invEuro(rataOggi) : '—', true)
    + (pre > 0 ? voce('Dopo il preamm.', rataDopo != null ? _invEuro(rataDopo) : '—', true) : '')
    + voce('Prossima scadenza', prossima ? _invData(prossima.data_scadenza) : '—'));
  h += '<div style="display:flex;padding:11px 0 14px">'
    + '<div style="width:150px;font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.3px;padding-top:3px">Avanzamento</div>'
    + '<div style="flex:1"><div style="display:flex;justify-content:space-between;font-size:11.5px;margin-bottom:4px">'
    + '<span>' + pagate.length + ' rat' + (pagate.length === 1 ? 'a pagata' : 'e pagate') + ' su ' + (tot || '—') + '</span>'
    + '<span style="font-family:var(--font-mono)">residuo ' + _invEuro(residuo) + '</span></div>'
    + '<div style="height:10px;border-radius:5px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden">'
    + '<div style="width:' + pct.toFixed(1) + '%;height:100%;background:#185FA5"></div></div></div></div>';
  h += '</div>';
  h += '<div style="display:flex;justify-content:flex-end;padding:12px 18px;background:var(--bg-card,var(--bg))">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 16px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Chiudi</button></div>';
  h += '</div>';
  apriModal(h);
}

// ── CONTO ECONOMICO PREVISIONALE DELL'IMPIANTO (05/10) ─────────────────────
// Ipotesi dal piano di ottobre 2026: produzione per kW, degrado annuo, prezzo
// dell'energia a fasce, costi operativi, accantonamento manutenzione dal 6° anno,
// ammortamento su 25 anni e contributo CER. Si possono cambiare per impianto.
var _INV_CE_DEF = {
  kwh_per_kw: 1350, degrado: 0.2, costi_op: 2500, acc_dal: 6, acc_importo: 600,
  anni_amm: 25, cer_eur: 0.0365, cer_quota: 60, cer_anni: 20
};
var _INV_PREZZI = [
  { da: 1, a: 4, p: 0.116 }, { da: 5, a: 10, p: 0.100 },
  { da: 11, a: 16, p: 0.090 }, { da: 17, a: 25, p: 0.080 }
];
function _invPrezzoAnno(n) {
  for (var i = 0; i < _INV_PREZZI.length; i++) {
    if (n >= _INV_PREZZI[i].da && n <= _INV_PREZZI[i].a) return _INV_PREZZI[i].p;
  }
  return _INV_PREZZI[_INV_PREZZI.length - 1].p;
}

// Parametri dell'impianto: quelli salvati, altrimenti i valori del piano
function _invCeParam(i) {
  var n = (i.note || '');
  var get = function (k, d) {
    var m = n.match(new RegExp('\\[' + k + '=([0-9.]+)\\]'));
    return m ? Number(m[1]) : d;
  };
  return {
    kwh_per_kw: get('kwhkw', _INV_CE_DEF.kwh_per_kw),
    degrado: get('degrado', _INV_CE_DEF.degrado),
    costi_op: get('costiop', _INV_CE_DEF.costi_op),
    acc_importo: get('accant', _INV_CE_DEF.acc_importo),
    acc_dal: _INV_CE_DEF.acc_dal,
    anni_amm: get('anniamm', _INV_CE_DEF.anni_amm),
    cer_eur: get('cereur', _INV_CE_DEF.cer_eur),
    cer_quota: get('cerquota', _INV_CE_DEF.cer_quota),
    cer_anni: _INV_CE_DEF.cer_anni
  };
}

function _invCeCalcola(i, costoNetto) {
  var P = _invCeParam(i);
  var kw = Number(i.kw || 0);
  if (!kw) return null;
  var amm = Number(costoNetto || 0) / P.anni_amm;
  var anni = [];
  for (var n = 1; n <= 25; n++) {
    var mwh = kw * P.kwh_per_kw * Math.pow(1 - P.degrado / 100, n - 1) / 1000;
    var prezzo = _invPrezzoAnno(n);
    var ricavi = mwh * 1000 * prezzo;
    var costi = P.costi_op + (n >= P.acc_dal ? P.acc_importo : 0);
    var ebitda = ricavi - costi;
    var cer = (n <= P.cer_anni) ? (mwh * 1000 * P.cer_quota / 100 * P.cer_eur) : 0;
    anni.push({ n: n, mwh: mwh, prezzo: prezzo, ricavi: ricavi, costi: costi,
                ebitda: ebitda, amm: amm, utile: ebitda - amm, cer: cer, utile2: ebitda - amm + cer });
  }
  return { P: P, amm: amm, anni: anni };
}

function _invBloccoCE(i, costoNetto) {
  var CE = _invCeCalcola(i, costoNetto);
  if (!CE) {
    return '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
      + '<div style="font-size:13px;font-weight:700;margin-bottom:6px">Conto economico previsionale</div>'
      + '<div style="font-size:12px;color:var(--text-muted)">Per calcolarlo servono i <strong>kW installati</strong>: inseriscili con ✏️ Modifica.</div></div>';
  }
  var P = CE.P, a = CE.anni;
  var somma = function (da, a2, campo) {
    return a.slice(da - 1, a2).reduce(function (s, x) { return s + x[campo]; }, 0);
  };
  var tot25 = { ricavi: somma(1, 25, 'ricavi'), ebitda: somma(1, 25, 'ebitda'),
                utile: somma(1, 25, 'utile'), cer: somma(1, 25, 'cer'), utile2: somma(1, 25, 'utile2') };

  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:4px">'
    + '<div style="font-size:13px;font-weight:700">Conto economico previsionale</div>'
    + '<div style="font-size:11px;color:var(--text-muted)">' + Number(i.kw).toLocaleString('it-IT') + ' kW · '
    + P.kwh_per_kw + ' kWh/kW · degrado ' + String(P.degrado).replace('.', ',') + '%/anno · costi ' + _invEuroK(P.costi_op) + '/anno'
    + ' · CER ' + String(P.cer_eur).replace('.', ',') + ' €/kWh sul ' + P.cer_quota + '%</div></div>';

  var kpi = function (lab, val, col) {
    return '<div style="flex:1;min-width:140px;border:0.5px solid var(--border);border-radius:9px;padding:9px 11px">'
      + '<div style="font-size:9.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:17px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div></div>';
  };
  h += '<div style="display:flex;gap:9px;flex-wrap:wrap;margin:10px 0">'
    + kpi('EBITDA 1° anno', _invEuroK(a[0].ebitda))
    + kpi('Utile 1° anno', _invEuroK(a[0].utile), a[0].utile >= 0 ? '#27500A' : '#A32D2D')
    + kpi('Utile con CER 1° anno', _invEuroK(a[0].utile2), '#27500A')
    + kpi('Utile 25 anni con CER', _invEuroK(tot25.utile2), '#27500A')
    + '</div>';

  // primi 10 anni
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:760px">';
  h += '<tr style="color:var(--text-muted);font-size:9.5px;text-transform:uppercase"><th style="text-align:left;padding:5px 6px;border-bottom:1.5px solid var(--border)">€</th>'
    + a.slice(0, 10).map(function (x) { return '<th style="text-align:right;padding:5px 6px;border-bottom:1.5px solid var(--border)">Anno ' + x.n + '</th>'; }).join('')
    + '<th style="text-align:right;padding:5px 6px;border-bottom:1.5px solid var(--border)">Tot. 10</th></tr>';
  var rigaCE = function (lab, campo, fmt, grassetto, col) {
    var r = '<tr' + (grassetto ? ' style="font-weight:700;background:var(--bg-kpi,var(--bg))"' : ' style="border-bottom:0.5px solid var(--border)"') + '>'
      + '<td style="padding:5px 6px' + (col ? ';color:' + col : '') + '">' + lab + '</td>';
    a.slice(0, 10).forEach(function (x) {
      r += '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono)' + (col ? ';color:' + col : '') + '">' + fmt(x[campo]) + '</td>';
    });
    r += '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);font-weight:700">' + fmt(somma(1, 10, campo)) + '</td></tr>';
    return r;
  };
  var e0 = function (v) { return Math.round(v).toLocaleString('it-IT'); };
  h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:5px 6px">Energia (MWh)</td>'
    + a.slice(0, 10).map(function (x) { return '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono)">' + Math.round(x.mwh).toLocaleString('it-IT') + '</td>'; }).join('')
    + '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);font-weight:700">' + Math.round(somma(1, 10, 'mwh')).toLocaleString('it-IT') + '</td></tr>';
  h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:5px 6px;color:var(--text-muted)">Prezzo €/kWh</td>'
    + a.slice(0, 10).map(function (x) { return '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + x.prezzo.toFixed(3).replace('.', ',') + '</td>'; }).join('')
    + '<td></td></tr>';
  h += rigaCE('Ricavi energia', 'ricavi', e0);
  h += rigaCE('Costi operativi', 'costi', function (v) { return '−' + e0(v); }, false, '#A32D2D');
  h += rigaCE('EBITDA', 'ebitda', e0, true);
  h += rigaCE('Ammortamento', 'amm', function (v) { return '−' + e0(v); }, false, '#A32D2D');
  h += rigaCE('Utile ante imposte', 'utile', e0, true);
  h += rigaCE('Contributo CER', 'cer', e0, false, '#27500A');
  h += rigaCE('Utile con CER', 'utile2', e0, true);
  h += '</table></div>';

  // sintesi 25 anni per blocchi
  var blocchi = [[1, 5], [6, 10], [11, 15], [16, 20], [21, 25]];
  h += '<div style="font-size:12px;font-weight:700;margin:14px 0 6px">Proiezione a 25 anni</div>';
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px;min-width:560px">';
  h += '<tr style="color:var(--text-muted);font-size:9.5px;text-transform:uppercase"><th style="text-align:left;padding:5px 6px;border-bottom:1.5px solid var(--border)">€</th>'
    + blocchi.map(function (b) { return '<th style="text-align:right;padding:5px 6px;border-bottom:1.5px solid var(--border)">Anni ' + b[0] + '-' + b[1] + '</th>'; }).join('')
    + '<th style="text-align:right;padding:5px 6px;border-bottom:1.5px solid var(--border)">Tot. 25</th></tr>';
  var rigaB = function (lab, campo, grassetto, col) {
    var r = '<tr' + (grassetto ? ' style="font-weight:700;background:var(--bg-kpi,var(--bg))"' : ' style="border-bottom:0.5px solid var(--border)"') + '>'
      + '<td style="padding:5px 6px' + (col ? ';color:' + col : '') + '">' + lab + '</td>';
    blocchi.forEach(function (b) {
      r += '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono)' + (col ? ';color:' + col : '') + '">' + e0(somma(b[0], b[1], campo)) + '</td>';
    });
    r += '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);font-weight:700">' + e0(somma(1, 25, campo)) + '</td></tr>';
    return r;
  };
  h += rigaB('Ricavi energia', 'ricavi');
  h += rigaB('EBITDA', 'ebitda', true);
  h += rigaB('Utile ante imposte', 'utile', true);
  h += rigaB('Contributo CER', 'cer', false, '#27500A');
  h += rigaB('Utile con CER', 'utile2', true);
  h += '</table></div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-top:8px">Ammortamento su ' + P.anni_amm + ' anni del costo '
    + (costoNetto ? _invEuro(costoNetto) : '—') + ' (spesa prevista dell\'impianto). Prezzo dell\'energia: 0,116 €/kWh anni 1-4, '
    + '0,100 anni 5-10, 0,090 anni 11-16, 0,080 anni 17-25. Imposte e rate del mutuo non comprese: il mutuo si vede nelle risorse.</div>';
  h += '</div>';
  return h;
}

// Gantt del singolo impianto: la sua barra con la linea di oggi
function _invGanttSingolo(i) {
  if (!i.data_inizio || !i.data_fine) return '';
  return _invGantt([i]);
}

// ── PREVENTIVI RICEVUTI (05/10) ────────────────────────────────────────────
// I preventivi dei fornitori sullo stesso impianto: serve a tenere memoria del
// confronto e della scelta fatta, anche quando non si prende il piu' economico.
function _invBloccoPreventivi(i) {
  var prev = (_invDati.preventivi || []).filter(function (p) { return p.impianto_id === i.id; });
  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div><div style="font-size:13px;font-weight:700">Preventivi ricevuti</div>'
    + '<div style="font-size:11px;color:var(--text-muted)">Le offerte dei fornitori per questo impianto e quella scelta.</div></div>'
    + (_invPuo() ? '<button onclick="invModalePreventivo(\'' + i.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Preventivo</button>' : '')
    + '</div>';
  if (!prev.length) { h += '<div style="font-size:12px;color:var(--text-muted)">Nessun preventivo registrato.</div></div>'; return h; }
  var min = Math.min.apply(null, prev.map(function (p) { return Number(p.importo || 0); }));
  var giaScelto = prev.some(function (p) { return p.scelto; });
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Fornitore</th>'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Documento</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Imponibile</th>'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Esito</th>'
    + '<th style="width:36px;border-bottom:1.5px solid var(--border)"></th></tr>';
  prev.forEach(function (p) {
    var piuBasso = Math.abs(Number(p.importo || 0) - min) < 0.01;
    h += '<tr style="border-bottom:0.5px solid var(--border)' + (p.scelto ? ';background:#EAF3DE' : '') + '">'
      + '<td style="padding:7px"><strong>' + _invEsc(p.fornitore) + '</strong>'
      + (p.note ? '<div style="font-size:10.5px;color:var(--text-muted)">' + _invEsc(p.note) + '</div>' : '') + '</td>'
      + '<td style="padding:7px;font-size:11.5px;color:var(--text-muted)">'
      + (p.numero ? 'n. ' + _invEsc(p.numero) : '—') + (p.data ? ' del ' + _invData(p.data) : '') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _invEuro(p.importo)
      + (piuBasso && prev.length > 1 ? '<div style="font-size:9.5px;color:#27500A">il più basso</div>' : '') + '</td>'
      + '<td style="padding:7px">' + (p.scelto
          ? '<span style="font-size:10px;background:#EAF3DE;color:#27500A;padding:2px 9px;border-radius:9px;font-weight:700">scelto</span>'
            + ' <button onclick="invConfermaOrdine(\'' + i.id + '\',\'' + p.id + '\')" title="Genera la conferma d\'ordine da mandare al fornitore" style="font-size:10.5px;padding:3px 8px;border:0.5px solid #A32D2D;border-radius:6px;background:var(--bg);color:#A32D2D;font-weight:600;cursor:pointer;margin-left:4px">📄 Conferma d\'ordine</button>'
          : (giaScelto
              ? '<span style="font-size:10.5px;color:var(--text-muted)">non scelto</span>'
              : (_invPuo() ? '<button onclick="invScegliPreventivo(\'' + p.id + '\',\'' + i.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">scegli</button>' : ''))) + '</td>'
      + '<td style="padding:7px;text-align:right">' + (_invPuo() ? '<button onclick="invEliminaPreventivo(\'' + p.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button>' : '') + '</td></tr>';
  });
  h += '</table>';
  var scelto = prev.filter(function (p) { return p.scelto; })[0];
  if (scelto && prev.length > 1 && Math.abs(Number(scelto.importo) - min) > 0.01) {
    h += '<div style="font-size:11px;color:#854F0B;margin-top:8px">Il preventivo scelto costa ' + _invEuro(Number(scelto.importo) - min) + ' in più del più basso.</div>';
  }
  if (scelto) {
    h += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">Fornitore già scelto: la fornitura è definitiva. '
      + 'Per cambiarla va eliminato il preventivo scelto.</div>';
  }
  h += '</div>';
  return h;
}

function invModalePreventivo(impiantoId) {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:480px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Preventivo ricevuto</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Fornitore *</label><input id="invp-forn" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Numero</label><input id="invp-num" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Data</label><input id="invp-data" type="date" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Imponibile €</label><input id="invp-imp" type="number" step="0.01" style="' + inp + ';font-family:var(--font-mono)"></div>';
  var giaScelto = (_invDati.preventivi || []).some(function (x) { return x.impianto_id === impiantoId && x.scelto; });
  h += '<div><label style="' + lb + '">Scelto</label>'
    + (giaScelto
        ? '<div style="' + inp + ';color:var(--text-muted)">no — fornitore già scelto</div><input type="hidden" id="invp-scelto" value="">'
        : '<select id="invp-scelto" style="' + inp + '"><option value="">No</option><option value="1">Sì</option></select>')
    + '</div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Note (cosa comprende, perché scelto o scartato)</label><input id="invp-note" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="invSalvaPreventivo(\'' + impiantoId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

async function invSalvaPreventivo(impiantoId) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var f = (g('invp-forn') || '').trim();
  var imp = parseFloat(g('invp-imp')) || 0;
  if (!f) { toast('Il fornitore è obbligatorio'); return; }
  if (imp <= 0) { toast('Indica l\'imponibile del preventivo'); return; }
  var scelto = !!g('invp-scelto');
  if (scelto) await sb.from('investimenti_preventivi').update({ scelto: false }).eq('impianto_id', impiantoId);
  var r = await sb.from('investimenti_preventivi').insert([{
    impianto_id: impiantoId, fornitore: f, numero: g('invp-num') || null,
    data: g('invp-data') || null, importo: imp, scelto: scelto, note: g('invp-note') || null
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  caricaInvestimenti();
}

async function invScegliPreventivo(id, impiantoId) {
  await sb.from('investimenti_preventivi').update({ scelto: false }).eq('impianto_id', impiantoId);
  var r = await sb.from('investimenti_preventivi').update({ scelto: true }).eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

async function invEliminaPreventivo(id) {
  if (!confirm('Elimino questo preventivo?')) return;
  var r = await sb.from('investimenti_preventivi').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  caricaInvestimenti();
}

// ── CONFERMA D'ORDINE AL FORNITORE (05/10) ─────────────────────────────────
// Documento da mandare al fornitore una volta scelto il preventivo: parti,
// oggetto, voci, imponibile/IVA/totale, quote di pagamento e firme.
var _INV_AZIENDA = {
  nome: 'PHOENIX FUEL S.R.L.',
  indirizzo: 'Zona Industriale Portosalvo snc',
  citta: '89900 Vibo Valentia (VV)',
  piva: '02744150802', email: 'info@phoenixfuel.it',
  pec: 'phoenixfuel@legalmail.it', tel: '0966 1906397'
};

function invConfermaOrdine(impiantoId, preventivoId, aliquota) {
  var i = (_invDati.impianti || []).filter(function (x) { return x.id === impiantoId; })[0];
  var p = (_invDati.preventivi || []).filter(function (x) { return x.id === preventivoId; })[0];
  if (!i || !p) { toast('Dati non trovati'); return; }
  // l'aliquota si conferma ogni volta: sugli impianti e' il 10%, ma non sempre
  if (aliquota == null) {
    var hA = '<div style="max-width:380px"><div style="font-size:16px;font-weight:600;margin-bottom:4px">Conferma d\'ordine</div>'
      + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">' + _invEsc(p.fornitore) + ' · ' + _invEsc(i.nome) + '</div>'
      + '<label style="display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px">Aliquota IVA %</label>'
      + '<input id="inv-ord-iva" type="number" step="0.1" value="10" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:14px;font-family:var(--font-mono);text-align:right">'
      + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">Sugli impianti fotovoltaici è il 10%: controlla il preventivo del fornitore prima di generare.</div>'
      + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
      + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
      + '<button onclick="chiudiModal();invConfermaOrdine(\'' + impiantoId + '\',\'' + preventivoId + '\', parseFloat(document.getElementById(\'inv-ord-iva\') ? document.getElementById(\'inv-ord-iva\').value : 10) || 10)" class="btn-primary" style="font-size:12px;padding:8px 16px">📄 Genera</button></div></div>';
    apriModal(hA);
    return;
  }
  var ALIQ = Number(aliquota) || 10;
  var voci = (_invDati.voci || []).filter(function (v) {
    return v.impianto_id === i.id && (v.fornitore || '').toLowerCase().indexOf(String(p.fornitore).toLowerCase().slice(0, 6)) >= 0;
  });
  var imponibile = voci.length
    ? voci.reduce(function (s2, v) { return s2 + Number(v.importo_previsto || 0); }, 0)
    : Number(p.importo || 0);
  var iva = imponibile * ALIQ / 100;
  var tot = imponibile + iva;

  var corpo = (voci.length ? voci : [{ descrizione: 'Fornitura e installazione impianto fotovoltaico'
      + (i.kw ? ' da ' + Number(i.kw).toLocaleString('it-IT') + ' kW' : ''), importo_previsto: imponibile }])
    .map(function (v) {
      return '<tr><td class="l">' + _invEsc(v.descrizione) + '</td><td>1</td><td>' + ALIQ + '%</td>'
        + '<td>' + _invEuro(v.importo_previsto) + '</td><td>' + _invEuro(Number(v.importo_previsto) * (1 + ALIQ / 100)) + '</td></tr>';
    }).join('');

  var quote = [
    { perc: 30, evento: 'Alla firma della conferma d\'ordine' },
    { perc: 50, evento: 'All\'avviso di consegna dei materiali' },
    { perc: 20, evento: 'Al collaudo dell\'impianto' }
  ];
  var qh = quote.map(function (q) {
    return '<tr><td class="l" style="width:60px">' + q.perc + '%</td><td class="l">' + q.evento + '</td>'
      + '<td>' + _invEuro(tot * q.perc / 100) + '</td></tr>';
  }).join('');

  var A = _INV_AZIENDA;
  var oggi = new Date().toLocaleDateString('it-IT');
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Conferma d\'ordine ' + _invEsc(i.nome) + '</title><style>'
    + '@page{size:A4;margin:14mm}body{font-family:Calibri,Arial,sans-serif;font-size:10.5px;color:#222;margin:0}'
    + '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C8102E;padding-bottom:8px;margin-bottom:14px}'
    + '.az{font-size:15px;font-weight:700}.az small{display:block;font-size:9px;color:#666;font-weight:400;line-height:1.4}'
    + '.ti{text-align:right;font-size:13px;font-weight:600}.ti small{display:block;font-size:9.5px;color:#666;font-weight:400}'
    + '.parti{display:flex;gap:30px;margin-bottom:14px}.parti>div{flex:1;font-size:10px;line-height:1.5}'
    + '.parti .et{font-size:9px;color:#777;text-transform:uppercase;letter-spacing:.3px}.parti strong{font-size:11.5px}'
    + 'table{width:100%;border-collapse:collapse;font-size:10px}'
    + 'th{background:#F1EFE8;padding:6px 7px;font-size:8.5px;text-transform:uppercase;letter-spacing:.3px;color:#5F5E5A;text-align:right;border-bottom:1px solid #999}'
    + 'th.l{text-align:left}td{padding:6px 7px;border-bottom:0.5px solid #e8e8e8;text-align:right}td.l{text-align:left}'
    + '.tot{margin-top:10px;margin-left:auto;width:46%}.tot td{border:0;padding:3px 7px}'
    + '.tot .gr{font-size:13px;font-weight:700;border-top:1px solid #333}'
    + '.box{border:1px solid #ddd;border-radius:5px;padding:9px 11px;margin-top:12px;font-size:9.5px;line-height:1.5}'
    + '.firme{display:flex;justify-content:space-between;gap:40px;margin-top:32px;font-size:10px}'
    + '.firme>div{flex:1}.firme .riga{border-bottom:1px solid #333;height:40px;margin-top:8px}'
    + '.foot{margin-top:16px;border-top:0.5px solid #ddd;padding-top:5px;font-size:8px;color:#777;text-align:center}'
    + '</style></head><body>'
    + '<div class="hd"><div class="az">' + A.nome + '<small>' + A.indirizzo + ' · ' + A.citta
    + '<br>P.IVA ' + A.piva + ' · ' + A.email + ' · ' + A.pec + '</small></div>'
    + '<div class="ti">Conferma d\'ordine<small>' + oggi + '</small></div></div>'
    + '<div class="parti">'
    + '<div><div class="et">Committente</div><strong>' + A.nome + '</strong><br>' + A.indirizzo + '<br>' + A.citta
    + '<br>P.IVA ' + A.piva + '<br>' + A.tel + '</div>'
    + '<div><div class="et">Spettabile fornitore</div><strong>' + _invEsc(p.fornitore) + '</strong>'
    + (p.numero || p.data ? '<br>Vs. preventivo ' + (p.numero ? 'n. ' + _invEsc(p.numero) : '') + (p.data ? ' del ' + _invData(p.data) : '') : '')
    + '</div></div>'
    + '<div style="font-size:11px;margin-bottom:10px"><strong>Oggetto:</strong> impianto fotovoltaico <strong>' + _invEsc(i.nome) + '</strong>'
    + (i.luogo ? ' — ' + _invEsc(i.luogo) : '') + (i.kw ? ' · ' + Number(i.kw).toLocaleString('it-IT') + ' kW' : '')
    + '<br>Con la presente confermiamo l\'ordine alle condizioni del Vs. preventivo sopra richiamato.</div>'
    + '<table><tr><th class="l">Descrizione</th><th>Quantità</th><th>IVA</th><th>Imponibile</th><th>Totale</th></tr>' + corpo + '</table>'
    + '<table class="tot"><tr><td class="l">Imponibile</td><td>' + _invEuro(imponibile) + '</td></tr>'
    + '<tr><td class="l">IVA ' + ALIQ + '%</td><td>' + _invEuro(iva) + '</td></tr>'
    + '<tr class="gr"><td class="l">Totale</td><td>' + _invEuro(tot) + '</td></tr></table>'
    + '<div style="clear:both"></div>'
    + '<div style="font-weight:700;font-size:11px;margin:14px 0 5px">Termini di pagamento</div>'
    + '<table><tr><th class="l">Quota</th><th class="l">Scadenza</th><th>Importo (IVA incl.)</th></tr>' + qh + '</table>'
    + '<div class="box">I pagamenti saranno effettuati a mezzo bonifico bancario a vista fattura. '
    + 'Eventuali varianti ai materiali indicati nel preventivo dovranno essere concordate per iscritto. '
    + 'I termini di consegna e installazione decorrono dalla data della presente conferma.'
    + (i.data_fine ? ' Fine lavori prevista entro il ' + _invData(i.data_fine) + '.' : '') + '</div>'
    + '<div class="firme"><div><div style="font-size:9px;color:#777">Il Committente</div><strong>' + A.nome + '</strong>'
    + '<div class="riga"></div><div style="font-size:9px;color:#777">Luogo e data</div></div>'
    + '<div><div style="font-size:9px;color:#777">Il Fornitore — per accettazione</div><strong>' + _invEsc(p.fornitore) + '</strong>'
    + '<div class="riga"></div><div style="font-size:9px;color:#777">Luogo e data</div></div></div>'
    + '<div class="foot">' + A.nome + ' · ' + A.indirizzo + ', ' + A.citta + ' · P.IVA ' + A.piva + ' · ' + A.email + '</div>'
    + '</body></html>';

  var w = window.open('', '_blank');
  if (!w) { toast('Abilita i popup per stampare'); return; }
  w.document.write(doc); w.document.close(); w.focus();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}
