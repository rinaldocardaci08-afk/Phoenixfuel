// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Consumi mezzi propri
// v20260820b — i tre mezzi sono CB801LF, GJ234ZE e GJ263ZE, filtrati per
//              targa; celle a tre per riga come i trimestri
// v20260820a — km e litri per mezzo e per mese, come nel foglio Excel:
//              una cella per mese coi tre camion e il totale, il riepilogo
//              dell'anno per mezzo, e la quadratura dei litri.
//
// LA QUADRATURA, ricostruita dai numeri veri del 2025:
//   litri consumati dai mezzi        35.458   (li inserisce Rinaldo)
//   − litri fatturati in autoconsumo 11.700   (li ricava il programma)
//   = PRIMO RISULTATO                23.758   gasolio nei camion senza una
//                                             fattura di acquisto dietro
//   − litri comprati da Cadogi        …       (li inserisce Rinaldo)
//   = SECONDO RISULTATO
//
// Gli ordini di autoconsumo sono il travaso dalle cisterne del deposito alla
// cisterna da 3.000 L da cui i camion prelevano: contano alla DATA
// DELL'ORDINE, che e' il giorno in cui il gasolio si sposta.
//
// I RECUPERI stanno fuori dalla quadratura, come nel foglio: sono litri
// rientrati dalle cisterne, non acquisti.
//
// NOTA sui prelievi: prelievi_autoconsumo ha la colonna `eliminato`. Va
// sempre esclusa, o i litri usciti risultano piu' alti del vero.
// ═══════════════════════════════════════════════════════════════════════════

var _mcAnno = new Date().getFullYear();
var _mcMezzi = [];
var _mcDati = {};       // { 'mese-mezzoId': {km, litri} }
var _mcAuto = {};       // { mese: {litri, costo} }  da ordini autoconsumo
var _mcCadogi = {};     // { mese: {litri, costo, n} }
var _mcRecuperi = {};   // { mese: {litri, n} }
var _mcPrelievi = {};   // { mese: litri }  da prelievi_autoconsumo
var _mcSalvaTimer = {};

// Le targhe dei nostri tre mezzi, nell'ordine in cui vanno mostrati.
var MC_TARGHE = ['CB801LF', 'GJ234ZE', 'GJ263ZE'];

var MC_MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
               'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function _mcN(v, dec) {
  if (v === null || v === undefined || v === '' || !isFinite(v)) return '—';
  return Number(v).toLocaleString('it-IT', { minimumFractionDigits: dec || 0, maximumFractionDigits: dec || 0 });
}
function _mcE(v, dec) {
  if (v === null || v === undefined || !isFinite(v)) return '—';
  return '€ ' + Number(v).toLocaleString('it-IT', { minimumFractionDigits: dec === undefined ? 2 : dec, maximumFractionDigits: dec === undefined ? 2 : dec });
}
function _mcVal(v) {
  if (v === null || v === undefined || v === '') return null;
  var n = parseFloat(String(v).replace(/\./g, '').replace(',', '.'));
  return isFinite(n) ? n : null;
}
function _mcNomeMezzo(m) {
  return (m.descrizione && String(m.descrizione).trim()) || m.targa || '—';
}
function _mcMezzoCella(m) {
  var d = (m.descrizione && String(m.descrizione).trim());
  if (!d) return '<span style="font-weight:600">' + esc(m.targa || '—') + '</span>';
  return '<span style="font-weight:600">' + esc(d) + '</span>'
    + '<div style="font-size:9.5px;color:var(--text-muted);font-family:var(--font-mono);line-height:1.2">' + esc(m.targa || '') + '</div>';
}


async function caricaMezziConsumi() {
  var el = document.getElementById('mc-contenuto');
  if (!el) return;
  el.innerHTML = '<div style="padding:26px;text-align:center;color:var(--text-muted);font-size:13px">Caricamento…</div>';
  try {
    var da = _mcAnno + '-01-01', a = _mcAnno + '-12-31';

    var rm = await sb.from('mezzi').select('id,targa,descrizione,proprietario,attivo');
    if (rm.error) throw rm.error;
    // I nostri mezzi sono questi tre, per targa. Il proprietario non basta a
    // distinguerli: i vettori terzi non consumano il nostro gasolio e non
    // devono comparire qui.
    _mcMezzi = MC_TARGHE.map(function (t) {
      return (rm.data || []).filter(function (m) {
        return String(m.targa || '').toUpperCase().replace(/\s/g, '') === t;
      })[0];
    }).filter(Boolean);
    // se le targhe cambiassero, meglio mostrare i mezzi attivi che una
    // pagina vuota senza spiegazione
    if (!_mcMezzi.length) {
      _mcMezzi = (rm.data || []).filter(function (m) { return m.attivo !== false; });
      if (_mcMezzi.length) toast('Nessuna delle targhe attese trovata: mostro tutti i mezzi attivi');
    }

    var rc = await sb.from('mezzi_consumi_mese').select('*').eq('anno', _mcAnno);
    if (rc.error) throw rc.error;
    _mcDati = {};
    (rc.data || []).forEach(function (r) {
      _mcDati[r.mese + '-' + r.mezzo_id] = { km: r.km === null ? null : Number(r.km), litri: r.litri === null ? null : Number(r.litri) };
    });

    // fatture di autoconsumo: sono gli ordini che travasano il gasolio dal
    // deposito alla cisterna dei camion
    var ro = await sb.from('ordini').select('data,litri,costo_litro')
      .eq('tipo_ordine', 'autoconsumo').gte('data', da).lte('data', a);
    if (ro.error) throw ro.error;
    _mcAuto = {};
    (ro.data || []).forEach(function (o) {
      var m = parseInt(String(o.data).slice(5, 7), 10);
      var t = _mcAuto[m] = _mcAuto[m] || { litri: 0, costo: 0 };
      var l = Number(o.litri || 0);
      t.litri += l;
      t.costo += l * Number(o.costo_litro || 0);
    });

    var rk = await sb.from('mezzi_acquisti_carburante').select('*').gte('data', da).lte('data', a);
    if (rk.error) throw rk.error;
    _mcCadogi = {};
    (rk.data || []).forEach(function (f) {
      var m = parseInt(String(f.data).slice(5, 7), 10);
      var t = _mcCadogi[m] = _mcCadogi[m] || { litri: 0, costo: 0, n: 0 };
      t.litri += Number(f.litri || 0); t.costo += Number(f.costo || 0); t.n++;
    });

    var rr = await sb.from('mezzi_recuperi').select('*').gte('data', da).lte('data', a);
    if (rr.error) throw rr.error;
    _mcRecuperi = {};
    (rr.data || []).forEach(function (r) {
      var m = parseInt(String(r.data).slice(5, 7), 10);
      var t = _mcRecuperi[m] = _mcRecuperi[m] || { litri: 0, n: 0 };
      t.litri += Number(r.litri || 0); t.n++;
    });

    // prelievi veri dalla cisterna: servono come controllo incrociato sui
    // litri dichiarati. `eliminato` va escluso.
    var rp = await sb.from('prelievi_autoconsumo').select('data,litri,eliminato')
      .gte('data', da).lte('data', a);
    _mcPrelievi = {};
    if (!rp.error) {
      (rp.data || []).forEach(function (p) {
        if (p.eliminato) return;
        var m = parseInt(String(p.data).slice(5, 7), 10);
        _mcPrelievi[m] = (_mcPrelievi[m] || 0) + Number(p.litri || 0);
      });
    }

    _mcRender();
  } catch (e) {
    el.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Errore: ' + esc((e && e.message) || String(e)) + '</div>';
  }
}


function _mcTotaliMese(mese) {
  var km = 0, litri = 0, qualcosa = false;
  _mcMezzi.forEach(function (mz) {
    var d = _mcDati[mese + '-' + mz.id];
    if (!d) return;
    if (d.km !== null) { km += d.km; qualcosa = true; }
    if (d.litri !== null) { litri += d.litri; qualcosa = true; }
  });
  return { km: km, litri: litri, vuoto: !qualcosa };
}

function _mcTotaliAnno() {
  var km = 0, litri = 0, auto = 0, autoCosto = 0, cad = 0, cadCosto = 0, rec = 0;
  for (var m = 1; m <= 12; m++) {
    var t = _mcTotaliMese(m);
    km += t.km; litri += t.litri;
    if (_mcAuto[m]) { auto += _mcAuto[m].litri; autoCosto += _mcAuto[m].costo; }
    if (_mcCadogi[m]) { cad += _mcCadogi[m].litri; cadCosto += _mcCadogi[m].costo; }
    if (_mcRecuperi[m]) rec += _mcRecuperi[m].litri;
  }
  return { km: km, litri: litri, auto: auto, autoCosto: autoCosto,
           cad: cad, cadCosto: cadCosto, rec: rec,
           ris1: litri - auto, ris2: litri - auto - cad };
}


function _mcRender() {
  var el = document.getElementById('mc-contenuto');
  if (!el) return;
  var T = _mcTotaliAnno();
  var h = '';

  // ── intestazione e anno ──
  h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">';
  h += '<div><div style="font-size:16px;font-weight:600">Consumi mezzi propri</div>'
     + '<div style="font-size:11.5px;color:var(--text-muted)">Km e litri per mezzo · le fatture di autoconsumo le prende il programma dagli ordini</div></div>';
  h += '<select onchange="_mcCambiaAnno(this.value)" style="padding:7px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px">';
  var oggiA = new Date().getFullYear();
  for (var y = oggiA + 1; y >= oggiA - 6; y--) {
    h += '<option value="' + y + '"' + (y === _mcAnno ? ' selected' : '') + '>' + y + '</option>';
  }
  h += '</select></div>';

  // ── quadratura dell'anno ──
  var col2 = Math.abs(T.ris2) < 1 ? '#27500A' : (T.ris2 > 0 ? '#A32D2D' : '#BA7517');
  h += '<div class="card" style="padding:14px 16px;margin-bottom:14px">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:9px">Quadratura dei litri · ' + _mcAnno + '</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;font-size:12px">';
  var box = function (lab, val, sub, colore) {
    return '<div style="background:var(--bg);border-radius:8px;padding:9px 12px">'
      + '<div style="font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">' + lab + '</div>'
      + '<div style="font-size:17px;font-weight:700;font-family:var(--font-mono);margin-top:2px;color:' + (colore || 'var(--text)') + '">' + val + '</div>'
      + (sub ? '<div style="font-size:10.5px;color:var(--text-muted);margin-top:1px">' + sub + '</div>' : '') + '</div>';
  };
  h += box('Litri consumati', _mcN(T.litri), 'dai mezzi, inseriti qui');
  h += box('Fatture autoconsumo', '− ' + _mcN(T.auto), T.auto > 0 ? _mcE(T.autoCosto / T.auto, 4) + '/litro' : 'nessun ordine');
  h += box('Primo risultato', _mcN(T.ris1), 'senza fattura di acquisto', T.ris1 > 0 ? '#BA7517' : '#27500A');
  h += box('Fatture Cadogi', '− ' + _mcN(T.cad), T.cad > 0 ? _mcE(T.cadCosto / T.cad, 4) + '/litro' : 'da inserire');
  h += box('Secondo risultato', _mcN(T.ris2), Math.abs(T.ris2) < 1 ? 'quadra' : 'da spiegare', col2);
  h += '</div>';
  h += '<div style="display:flex;gap:16px;flex-wrap:wrap;font-size:11px;color:var(--text-muted);margin-top:9px">';
  h += '<span>Km totali <strong style="color:var(--text);font-family:var(--font-mono)">' + _mcN(T.km) + '</strong></span>';
  h += '<span>Media <strong style="color:var(--text);font-family:var(--font-mono)">' + (T.litri ? _mcN(T.km / T.litri, 2) : '—') + '</strong> km/litro</span>';
  if (T.rec) h += '<span>Recuperi <strong style="color:var(--text);font-family:var(--font-mono)">' + _mcN(T.rec) + '</strong> litri, fuori dalla quadratura</span>';
  h += '</div></div>';

  // ── celle mensili ──
  // v20260820b — tre celle per riga, come i trimestri: cosi ogni cella e'
  // larga abbastanza da leggere il nome del camion senza troncarlo.
  h += '<style>#mc-griglia{display:grid;grid-template-columns:1fr;gap:12px;margin-bottom:14px}'
     + '@media(min-width:760px){#mc-griglia{grid-template-columns:repeat(2,minmax(0,1fr))}}'
     + '@media(min-width:1080px){#mc-griglia{grid-template-columns:repeat(3,minmax(0,1fr))}}</style>';
  h += '<div id="mc-griglia">';
  for (var m2 = 1; m2 <= 12; m2++) {
    h += _mcCellaMese(m2);
    // una riga di separazione a fine trimestre, come nel foglio
    if (m2 % 3 === 0 && m2 < 12) h += '<div style="grid-column:1/-1;border-top:0.5px solid var(--border);margin:2px 0"></div>';
  }
  h += '</div>';

  // ── riepilogo anno per mezzo ──
  h += '<div class="card" style="padding:14px 16px;margin-bottom:14px">';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:9px">Totale ' + _mcAnno + ' per mezzo</div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  h += '<tr style="color:var(--text-muted);text-align:right;font-size:11px">'
     + '<th style="text-align:left;padding:5px 6px;font-weight:500">Mezzo</th>'
     + '<th style="padding:5px 6px;font-weight:500">Km</th><th style="padding:5px 6px;font-weight:500">Litri</th>'
     + '<th style="padding:5px 6px;font-weight:500">Km/litro</th><th style="padding:5px 6px;font-weight:500">% km</th></tr>';
  _mcMezzi.forEach(function (mz) {
    var km = 0, li = 0;
    for (var m3 = 1; m3 <= 12; m3++) {
      var d = _mcDati[m3 + '-' + mz.id];
      if (!d) continue;
      km += d.km || 0; li += d.litri || 0;
    }
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right">'
       + '<td style="text-align:left;padding:6px">' + esc(_mcNomeMezzo(mz))
         + ' <span style="font-size:10.5px;color:var(--text-muted);font-family:var(--font-mono)">' + esc(mz.targa || '') + '</span></td>'
       + '<td style="padding:6px;font-family:var(--font-mono)">' + _mcN(km) + '</td>'
       + '<td style="padding:6px;font-family:var(--font-mono)">' + _mcN(li) + '</td>'
       + '<td style="padding:6px;font-family:var(--font-mono)">' + (li ? _mcN(km / li, 2) : '—') + '</td>'
       + '<td style="padding:6px;font-family:var(--font-mono);color:var(--text-muted)">' + (T.km ? _mcN(km / T.km * 100, 1) + '%' : '—') + '</td></tr>';
  });
  h += '<tr style="border-top:0.5px solid var(--border-strong);text-align:right;font-weight:700">'
     + '<td style="text-align:left;padding:7px 6px">Totale</td>'
     + '<td style="padding:7px 6px;font-family:var(--font-mono)">' + _mcN(T.km) + '</td>'
     + '<td style="padding:7px 6px;font-family:var(--font-mono)">' + _mcN(T.litri) + '</td>'
     + '<td style="padding:7px 6px;font-family:var(--font-mono)">' + (T.litri ? _mcN(T.km / T.litri, 2) : '—') + '</td>'
     + '<td style="padding:7px 6px"></td></tr>';
  h += '</table>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">Media mensile '
     + _mcN(T.km / 12) + ' km e ' + _mcN(T.litri / 12) + ' litri.</div>';
  h += '</div>';

  // ── fatture Cadogi e recuperi, per mese ──
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px">';
  h += _mcTabellaMovimenti('cadogi');
  h += _mcTabellaMovimenti('recuperi');
  h += '</div>';

  el.innerHTML = h;
}


function _mcCellaMese(mese) {
  var t = _mcTotaliMese(mese);
  var auto = _mcAuto[mese] || { litri: 0, costo: 0 };
  var cad = _mcCadogi[mese] || { litri: 0, costo: 0 };
  var ris2 = t.litri - auto.litri - cad.litri;
  var quadra = t.litri > 0 && Math.abs(ris2) < 1;

  var h = '<div class="card" style="padding:11px 13px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
  h += '<div style="font-size:12.5px;font-weight:600">' + MC_MESI[mese - 1] + '</div>';
  if (t.litri > 0) {
    h += '<div style="font-size:10.5px;font-family:var(--font-mono);color:' + (quadra ? '#27500A' : '#BA7517') + '">'
       + (quadra ? '✓ quadra' : _mcN(ris2) + ' L scoperti') + '</div>';
  }
  h += '</div>';

  h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px;table-layout:fixed">';
  h += '<tr style="color:var(--text-muted);font-size:10.5px;text-align:right">'
     + '<th style="text-align:left;font-weight:500;padding:3px 4px">Mezzo</th>'
     + '<th style="font-weight:500;padding:3px 4px;width:26%">Km</th>'
     + '<th style="font-weight:500;padding:3px 4px;width:24%">Litri</th>'
     + '<th style="font-weight:500;padding:3px 4px;width:16%">km/l</th></tr>';
  _mcMezzi.forEach(function (mz) {
    var d = _mcDati[mese + '-' + mz.id] || { km: null, litri: null };
    var med = (d.km && d.litri) ? _mcN(d.km / d.litri, 2) : '—';
    var inp = function (campo, val) {
      return '<input type="text" inputmode="decimal" value="' + (val === null || val === undefined ? '' : _mcN(val)) + '" '
        + 'onchange="_mcScrivi(' + mese + ',\'' + mz.id + '\',\'' + campo + '\',this.value)" '
        + 'style="width:100%;text-align:right;font-family:var(--font-mono);font-size:11.5px;padding:2px 4px;'
        + 'border:0.5px solid var(--border);border-radius:3px;background:var(--bg);color:var(--text)">';
    };
    h += '<tr><td style="padding:3px 4px;line-height:1.25">' + _mcMezzoCella(mz) + '</td>'
       + '<td style="padding:3px 4px;vertical-align:middle">' + inp('km', d.km) + '</td>'
       + '<td style="padding:3px 4px;vertical-align:middle">' + inp('litri', d.litri) + '</td>'
       + '<td style="padding:3px 4px;text-align:right;font-family:var(--font-mono);color:var(--text-muted);vertical-align:middle">' + med + '</td></tr>';
  });
  h += '<tr style="border-top:0.5px solid var(--border);font-weight:700;text-align:right">'
     + '<td style="text-align:left;padding:4px 3px">Totale</td>'
     + '<td style="padding:4px 3px;font-family:var(--font-mono)">' + (t.vuoto ? '—' : _mcN(t.km)) + '</td>'
     + '<td style="padding:4px 3px;font-family:var(--font-mono)">' + (t.vuoto ? '—' : _mcN(t.litri)) + '</td>'
     + '<td style="padding:4px 3px;font-family:var(--font-mono)">' + (t.km && t.litri ? _mcN(t.km / t.litri, 2) : '—') + '</td></tr>';
  h += '</table>';

  h += '<div style="border-top:0.5px solid var(--border);margin-top:6px;padding-top:5px;font-size:10.5px;color:var(--text-muted);line-height:1.65">';
  h += '<div style="display:flex;justify-content:space-between"><span>Autoconsumo</span><span style="font-family:var(--font-mono)">'
     + (auto.litri ? _mcN(auto.litri) + ' L · ' + _mcE(auto.costo) : '—') + '</span></div>';
  h += '<div style="display:flex;justify-content:space-between"><span>Cadogi</span><span style="font-family:var(--font-mono)">'
     + (cad.litri ? _mcN(cad.litri) + ' L · ' + _mcE(cad.costo) : '—') + '</span></div>';
  if (_mcRecuperi[mese]) {
    h += '<div style="display:flex;justify-content:space-between"><span>Recuperi</span><span style="font-family:var(--font-mono)">'
       + _mcN(_mcRecuperi[mese].litri) + ' L</span></div>';
  }
  // controllo incrociato: i litri dichiarati contro i prelievi registrati
  var prel = _mcPrelievi[mese];
  if (prel !== undefined && t.litri > 0 && Math.abs(prel - t.litri) >= 1) {
    h += '<div style="color:#854F0B;margin-top:3px;line-height:1.5">Prelievi registrati ' + _mcN(prel)
       + ' L, ' + _mcN(Math.abs(prel - t.litri)) + ' in ' + (prel > t.litri ? 'più' : 'meno') + ' dei litri dichiarati</div>';
  }
  h += '</div></div>';
  return h;
}


// Scrittura immediata sulla singola cella, con un attimo di attesa per non
// mandare una query a ogni tasto.
function _mcScrivi(mese, mezzoId, campo, valore) {
  var k = mese + '-' + mezzoId;
  var v = _mcVal(valore);
  _mcDati[k] = _mcDati[k] || { km: null, litri: null };
  _mcDati[k][campo] = v;
  clearTimeout(_mcSalvaTimer[k]);
  _mcSalvaTimer[k] = setTimeout(async function () {
    var d = _mcDati[k];
    try {
      var r = await sb.from('mezzi_consumi_mese').upsert([{
        anno: _mcAnno, mese: mese, mezzo_id: mezzoId,
        km: d.km, litri: d.litri, aggiornato_at: new Date().toISOString()
      }], { onConflict: 'anno,mese,mezzo_id' });
      if (r.error) throw r.error;
      _mcRender();
    } catch (e) {
      toast('Non salvato: ' + ((e && e.message) || e));
    }
  }, 500);
}

function _mcCambiaAnno(a) { _mcAnno = parseInt(a, 10); caricaMezziConsumi(); }


// ── Fatture Cadogi e recuperi ──────────────────────────────────────────────
function _mcTabellaMovimenti(tipo) {
  var cadogi = tipo === 'cadogi';
  var dati = cadogi ? _mcCadogi : _mcRecuperi;
  var h = '<div class="card" style="padding:13px 15px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px">';
  h += '<div style="font-size:13px;font-weight:600">' + (cadogi ? 'Acquisti da Cadogi' : 'Recuperi') + '</div>';
  h += '<button onclick="_mcNuovo(\'' + tipo + '\')" style="font-size:11px;padding:4px 10px;background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:5px;cursor:pointer">+ Aggiungi</button>';
  h += '</div>';
  h += '<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:7px">'
     + (cadogi ? 'Gasolio comprato presso Cadogi: entra nella quadratura' : 'Litri rientrati dalle cisterne: restano fuori dalla quadratura') + '</div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<tr style="color:var(--text-muted);font-size:10.5px;text-align:right">'
     + '<th style="text-align:left;font-weight:500;padding:3px 5px">Mese</th>'
     + '<th style="font-weight:500;padding:3px 5px">Litri</th>'
     + (cadogi ? '<th style="font-weight:500;padding:3px 5px">Costo</th><th style="font-weight:500;padding:3px 5px">€/litro</th>' : '')
     + '</tr>';
  var tl = 0, tc = 0, righe = 0;
  for (var m = 1; m <= 12; m++) {
    var d = dati[m];
    if (!d) continue;
    righe++;
    tl += d.litri; tc += (d.costo || 0);
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right">'
       + '<td style="text-align:left;padding:5px">' + MC_MESI[m - 1] + (d.n > 1 ? ' <span style="font-size:10px;color:var(--text-muted)">(' + d.n + ')</span>' : '') + '</td>'
       + '<td style="padding:5px;font-family:var(--font-mono)">' + _mcN(d.litri) + '</td>'
       + (cadogi ? '<td style="padding:5px;font-family:var(--font-mono)">' + _mcE(d.costo) + '</td>'
                 + '<td style="padding:5px;font-family:var(--font-mono);color:var(--text-muted)">' + (d.litri ? _mcN(d.costo / d.litri, 4) : '—') + '</td>' : '')
       + '</tr>';
  }
  if (!righe) {
    h += '<tr><td colspan="4" style="padding:10px 5px;font-size:11.5px;color:var(--text-muted);font-style:italic">Niente inserito per il ' + _mcAnno + '</td></tr>';
  } else {
    h += '<tr style="border-top:0.5px solid var(--border-strong);text-align:right;font-weight:700">'
       + '<td style="text-align:left;padding:6px 5px">Totale</td>'
       + '<td style="padding:6px 5px;font-family:var(--font-mono)">' + _mcN(tl) + '</td>'
       + (cadogi ? '<td style="padding:6px 5px;font-family:var(--font-mono)">' + _mcE(tc) + '</td>'
                 + '<td style="padding:6px 5px;font-family:var(--font-mono)">' + (tl ? _mcN(tc / tl, 4) : '—') + '</td>' : '')
       + '</tr>';
  }
  h += '</table></div>';
  return h;
}

function _mcNuovo(tipo) {
  var cadogi = tipo === 'cadogi';
  var oggi = new Date().toISOString().split('T')[0];
  var h = '<div style="max-width:420px">';
  h += '<div style="font-size:16px;font-weight:600;margin-bottom:12px">' + (cadogi ? 'Nuova fattura Cadogi' : 'Nuovo recupero') + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">';
  h += '<div><label style="display:block;font-size:11.5px;color:var(--text-muted);margin-bottom:4px">Data *</label>'
     + '<input id="mc-nd" type="date" value="' + oggi + '" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px"></div>';
  h += '<div><label style="display:block;font-size:11.5px;color:var(--text-muted);margin-bottom:4px">Litri *</label>'
     + '<input id="mc-nl" type="number" step="0.01" min="0" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px;font-family:var(--font-mono);text-align:right"></div>';
  h += '</div>';
  if (cadogi) {
    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">';
    h += '<div><label style="display:block;font-size:11.5px;color:var(--text-muted);margin-bottom:4px">Costo € *</label>'
       + '<input id="mc-nc" type="number" step="0.01" min="0" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px;font-family:var(--font-mono);text-align:right"></div>';
    h += '<div><label style="display:block;font-size:11.5px;color:var(--text-muted);margin-bottom:4px">N° fattura</label>'
       + '<input id="mc-nf" type="text" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px"></div>';
    h += '</div>';
  } else {
    h += '<div style="margin-bottom:10px"><label style="display:block;font-size:11.5px;color:var(--text-muted);margin-bottom:4px">Descrizione</label>'
       + '<input id="mc-ndesc" type="text" value="Recupero cisterne" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px"></div>';
  }
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">';
  h += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 15px;font-size:12px;cursor:pointer">Annulla</button>';
  h += '<button onclick="_mcSalvaNuovo(\'' + tipo + '\')" class="btn-primary" style="font-size:12px;padding:8px 15px">Salva</button>';
  h += '</div></div>';
  apriModal(h);
}

async function _mcSalvaNuovo(tipo) {
  var cadogi = tipo === 'cadogi';
  var data = document.getElementById('mc-nd').value;
  var litri = parseFloat(document.getElementById('mc-nl').value);
  if (!data) { toast('Indica la data'); return; }
  if (!(litri > 0)) { toast('I litri devono essere maggiori di zero'); return; }
  try {
    if (cadogi) {
      var costo = parseFloat(document.getElementById('mc-nc').value);
      if (!(costo > 0)) { toast('Indica il costo della fattura'); return; }
      var r = await sb.from('mezzi_acquisti_carburante').insert([{
        data: data, fornitore: 'Cadogi', litri: litri, costo: costo,
        numero_fattura: (document.getElementById('mc-nf').value || '').trim() || null
      }]);
      if (r.error) throw r.error;
    } else {
      var r2 = await sb.from('mezzi_recuperi').insert([{
        data: data, litri: litri,
        descrizione: (document.getElementById('mc-ndesc').value || '').trim() || null
      }]);
      if (r2.error) throw r2.error;
    }
    chiudiModal();
    toast('✓ Salvato');
    var annoRiga = parseInt(String(data).slice(0, 4), 10);
    if (annoRiga !== _mcAnno) _mcAnno = annoRiga;
    await caricaMezziConsumi();
  } catch (e) {
    toast('Errore: ' + ((e && e.message) || e));
  }
}
