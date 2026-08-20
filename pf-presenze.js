// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Presenze autisti
// v20260820a — primo blocco: lettura del foglio .xls, import con controllo di
//              coerenza sul calendario, e home dei mesi caricati.
//
// COSA SI SALVA — solo i dati grezzi: per autista e per giorno, ore ordinarie,
// ore di guida, ore di impegno e i tre flag (trasferta, ferie, festivo).
// Percentuali, medie e totali si ricalcolano ogni volta da quelli. Cosi se la
// soglia trasferta cambia, i mesi vecchi si riallineano invece di restare
// congelati con un numero che non torna piu.
//
// IL FOGLIO — verificato su otto file reali di Domenico. Struttura:
//   riga 7   intestazione: col 0 matr., 1 nome, 3 tipo riga, poi i GIORNI,
//            poi le colonne di totale (Ord. / Trasferte / Ferie / Festive)
//   per ogni dipendente un blocco di 4 righe: ord. / Trasferta / ferie / fest.
//   poi un blocco "Ore Guida <nomeproprio>" con 2 righe: Ore Guida / Ore Impegno
//
// DUE TRAPPOLE DEL MODELLO, presenti in TUTTI i file:
//   1. la colonna del giorno 25 e' DUPLICATA e la prima delle due e' sempre
//      vuota. Vince quella che contiene dati.
//   2. per questo le colonne dei totali SI SPOSTANO: Ord. sta alla 35 nei mesi
//      da 30 giorni e alla 36 in quelli da 31. Nessuna posizione e' fissa:
//      si legge sempre l'intestazione.
//
// E UNA TRAPPOLA DEI DATI: l'etichetta del mese dentro il foglio puo' essere
// SBAGLIATA. Un file diceva "Marzo 2026" e conteneva aprile. Quindi il mese lo
// decide il CALENDARIO — quanti giorni ha e dove cadono le domeniche — e
// quando calendario ed etichetta non concordano si chiede all'utente.
// ═══════════════════════════════════════════════════════════════════════════

var _prMesi = [];
var _prSoglia = 9;
var _prImport = null;
var _prSheetJSPronto = false;

var PR_MESI_NOMI = ['gennaio','febbraio','marzo','aprile','maggio','giugno',
                    'luglio','agosto','settembre','ottobre','novembre','dicembre'];

function _prNomeMese(m) { return PR_MESI_NOMI[m - 1] || '?'; }
function _prTitolo(m, a) { var n = _prNomeMese(m); return n.charAt(0).toUpperCase() + n.slice(1) + ' ' + a; }
function _prNum(v) {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return isFinite(v) ? v : null;
  var n = parseFloat(String(v).trim().replace(',', '.'));
  return isFinite(n) ? n : null;
}
function _prOre(v) { var n = _prNum(v); return n === null ? null : Math.round(n * 100) / 100; }
function _prH(n) {
  if (n === null || n === undefined) return '—';
  var x = Math.round(Number(n) * 10) / 10;
  return String(x).replace('.', ',');
}


// ── SheetJS, caricato solo quando serve ────────────────────────────────────
// E' la prima dipendenza esterna del progetto. Si carica alla prima apertura
// di questa linguetta, non all'avvio, e se il CDN e' irraggiungibile lo dice
// invece di lasciare un pulsante che non fa niente.
function _prCaricaSheetJS() {
  return new Promise(function (risolvi, rifiuta) {
    if (_prSheetJSPronto || typeof XLSX !== 'undefined') { _prSheetJSPronto = true; return risolvi(); }
    var s = document.createElement('script');
    s.src = 'https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js';
    s.onload = function () { _prSheetJSPronto = true; risolvi(); };
    s.onerror = function () { rifiuta(new Error('Libreria di lettura Excel non raggiungibile')); };
    document.head.appendChild(s);
  });
}


// ══════════════════════════════════════════════════════════════════════════
// LETTURA DEL FOGLIO
// ══════════════════════════════════════════════════════════════════════════
function _prLeggiFoglio(workbook) {
  var ws = workbook.Sheets[workbook.SheetNames[0]];
  if (!ws) throw new Error('Il file non contiene fogli leggibili');
  var rng = XLSX.utils.decode_range(ws['!ref']);
  var cella = function (r, c) {
    var k = XLSX.utils.encode_cell({ r: r, c: c });
    return ws[k] ? ws[k].v : '';
  };
  var testo = function (r, c) { return String(cella(r, c) === undefined ? '' : cella(r, c)).trim(); };
  var tipoRiga = function (r) { return testo(r, 3).toLowerCase().replace(/\.$/, ''); };

  // etichetta del mese scritta nel foglio (da verificare, puo' essere errata)
  var etichetta = null;
  for (var r = 0; r <= Math.min(9, rng.e.r); r++) {
    for (var c = 0; c <= rng.e.c; c++) {
      var m = testo(r, c).match(/^([A-Za-z]+)\s+(\d{4})$/);
      if (m) {
        var im = PR_MESI_NOMI.indexOf(m[1].toLowerCase());
        if (im >= 0) etichetta = { mese: im + 1, anno: parseInt(m[2], 10) };
      }
    }
  }

  // riga di intestazione: quella con almeno venti numeri fra 1 e 31
  var hdr = null;
  for (var r2 = 0; r2 <= rng.e.r && hdr === null; r2++) {
    var quanti = 0;
    for (var c2 = 0; c2 <= rng.e.c; c2++) {
      var v = cella(r2, c2);
      if (typeof v === 'number' && v >= 1 && v <= 31 && v === Math.floor(v)) quanti++;
    }
    if (quanti >= 20) hdr = r2;
  }
  if (hdr === null) throw new Error('Non trovo la riga con i giorni del mese');

  // giorno -> colonna. Sul giorno duplicato vince quella che contiene dati.
  var giorni = {};
  for (var c3 = 0; c3 <= rng.e.c; c3++) {
    var v3 = cella(hdr, c3);
    if (typeof v3 !== 'number' || v3 < 1 || v3 > 31 || v3 !== Math.floor(v3)) continue;
    var g = v3, pieni = 0;
    for (var r3 = hdr + 1; r3 <= rng.e.r; r3++) if (cella(r3, c3) !== '') pieni++;
    if (giorni[g] === undefined || pieni > giorni[g].pieni) giorni[g] = { col: c3, pieni: pieni };
  }
  var listaGiorni = Object.keys(giorni).map(Number).sort(function (a, b) { return a - b; });
  if (!listaGiorni.length) throw new Error('Non trovo le colonne dei giorni');

  // colonne di totale, per etichetta e mai per posizione
  var totCol = {};
  for (var c4 = 0; c4 <= rng.e.c; c4++) {
    var e = testo(hdr, c4).toLowerCase().replace(/\.$/, '');
    if (e === 'ord' || e === 'trasferte' || e === 'ferie' || e === 'festive') totCol[e] = c4;
  }

  // blocchi: dipendenti e blocchi "Ore Guida <nome>"
  var dipendenti = [], blocchiGuida = [];
  for (var r4 = hdr + 1; r4 <= rng.e.r; r4++) {
    var nome = testo(r4, 1);
    var t = tipoRiga(r4);
    if (nome && /^ore guida/i.test(nome) && t === 'ore guida') {
      blocchiGuida.push({ nomeBreve: nome.replace(/^ore guida/i, '').trim(), riga: r4 });
    } else if (nome && t === 'ord' && !/^mansione$/i.test(nome)) {
      dipendenti.push({ nome: nome, riga: r4 });
    }
  }
  if (!dipendenti.length) throw new Error('Non trovo nessun dipendente nel foglio');

  // le righe accessorie stanno subito sotto quella "ord."
  var sottoRiga = function (rigaBase, tipi) {
    for (var k = 1; k <= 4; k++) {
      var rr = rigaBase + k;
      if (rr > rng.e.r) break;
      if (testo(rr, 1)) break;                       // e' iniziato un altro blocco
      if (tipi.indexOf(tipoRiga(rr)) >= 0) return rr;
    }
    return null;
  };

  // abbinamento "Francesco" -> "CONSIGLIO FRANCESCO", per parola intera
  var parole = function (s) {
    return String(s).toLowerCase().replace(/[^a-zàèéìòù ]/g, ' ').split(/\s+/).filter(Boolean);
  };
  dipendenti.forEach(function (d) {
    var pd = parole(d.nome);
    var trovato = null;
    blocchiGuida.forEach(function (b) {
      if (trovato) return;
      var pb = parole(b.nomeBreve);
      for (var i = 0; i < pb.length; i++) if (pd.indexOf(pb[i]) >= 0) { trovato = b; return; }
    });
    d.guida = trovato;
    d.rTrasf = sottoRiga(d.riga, ['trasferta', 'trasf']);
    d.rFerie = sottoRiga(d.riga, ['ferie']);
    d.rFest  = sottoRiga(d.riga, ['fest', 'festive', 'festivo']);
  });

  // giorni in cui NESSUNO ha lavorato: servono a riconoscere il calendario
  var fermi = listaGiorni.filter(function (g2) {
    return dipendenti.every(function (d) { return cella(d.riga, giorni[g2].col) === ''; });
  });

  return { ws: ws, cella: cella, hdr: hdr, giorni: giorni, listaGiorni: listaGiorni,
           totCol: totCol, dipendenti: dipendenti, etichetta: etichetta, fermi: fermi };
}


// ── Quale mese e' davvero? Lo dice il calendario ───────────────────────────
// Un mese e' compatibile se ha esattamente quel numero di giorni e se TUTTE le
// sue domeniche risultano ferme. Si provano gli anni intorno a quello scritto
// nel foglio, perche' un file diceva "Marzo 2025" ed era corretto mentre un
// altro diceva "Marzo 2026" e conteneva aprile.
function _prMesiCompatibili(nGiorni, fermi, annoIndicato) {
  var base = annoIndicato || new Date().getFullYear();
  var prova = function (da) {
    var out = [];
    for (var m = 1; m <= 12; m++) {
      if (new Date(da, m, 0).getDate() !== nGiorni) continue;
      var tutteFerme = true;
      for (var g = 1; g <= nGiorni; g++) {
        if (new Date(da, m - 1, g).getDay() !== 0) continue;
        if (fermi.indexOf(g) < 0) { tutteFerme = false; break; }
      }
      if (tutteFerme) out.push({ mese: m, anno: da });
    }
    return out;
  };
  // Prima si cerca nell'anno scritto nel foglio: nove file su dieci sono
  // giusti li'. Solo se quell'anno non produce nessun candidato si guarda
  // negli anni vicini, perche' un file diceva "Marzo 2025" ed era corretto.
  var out = prova(base);
  if (out.length) return out;
  for (var d = 1; d <= 2; d++) {
    out = out.concat(prova(base - d)).concat(prova(base + d));
  }
  return out;
}


// ── Dal foglio alle righe da salvare ───────────────────────────────────────
function _prCostruisciRighe(F, mese, anno) {
  var righe = [], avvisi = [];
  F.dipendenti.forEach(function (d) {
    var senzaImpegno = true;
    F.listaGiorni.forEach(function (g) {
      if (g > new Date(anno, mese, 0).getDate()) return;
      var col = F.giorni[g].col;
      var ord = _prOre(F.cella(d.riga, col));
      var gui = d.guida ? _prOre(F.cella(d.guida.riga, col)) : null;
      var imp = d.guida ? _prOre(F.cella(d.guida.riga + 1, col)) : null;
      var tra = d.rTrasf ? _prNum(F.cella(d.rTrasf, col)) : null;
      var fer = d.rFerie ? _prNum(F.cella(d.rFerie, col)) : null;
      var fes = d.rFest ? _prNum(F.cella(d.rFest, col)) : null;
      if (imp !== null) senzaImpegno = false;
      if (ord === null && gui === null && imp === null && !tra && !fer && !fes) return;
      righe.push({
        autista_nome: d.nome,
        data: anno + '-' + ('0' + mese).slice(-2) + '-' + ('0' + g).slice(-2),
        ore_ordinarie: ord, ore_guida: gui, ore_impegno: imp,
        trasferta: !!tra, ferie: !!fer, festivo: !!fes
      });
    });
    if (!d.guida) avvisi.push('Per ' + d.nome + ' non c\'è il blocco "Ore Guida": mancano guida e impegno.');
    else if (senzaImpegno) avvisi.push('Per ' + d.nome + ' la riga "Ore Impegno" è vuota in tutto il mese.');
  });
  return { righe: righe, avvisi: avvisi };
}


// ── Controllo contro i totali che il foglio calcola da se' ─────────────────
// Se la nostra somma non coincide con la sua, abbiamo letto male: meglio
// saperlo prima di scrivere in banca dati che dopo.
function _prVerificaTotali(F, righe) {
  var esiti = [];
  var colOrd = F.totCol['ord'];
  if (colOrd === undefined) return esiti;
  F.dipendenti.forEach(function (d) {
    if (!d.guida) return;
    ['ore_guida', 'ore_impegno'].forEach(function (campo, i) {
      var atteso = _prOre(F.cella(d.guida.riga + i, colOrd));
      if (atteso === null) return;
      var somma = 0;
      righe.forEach(function (r) { if (r.autista_nome === d.nome && r[campo] !== null) somma += r[campo]; });
      somma = Math.round(somma * 100) / 100;
      esiti.push({ nome: d.nome, campo: campo === 'ore_guida' ? 'guida' : 'impegno',
                   somma: somma, atteso: atteso, ok: Math.abs(somma - atteso) < 0.01 });
    });
  });
  return esiti;
}


// ══════════════════════════════════════════════════════════════════════════
// HOME DEI MESI
// ══════════════════════════════════════════════════════════════════════════
async function caricaPresenze() {
  var el = document.getElementById('pr-contenuto');
  if (!el) return;
  el.innerHTML = '<div style="padding:26px;text-align:center;color:var(--text-muted);font-size:13px">Caricamento…</div>';
  try {
    var rs = await sb.from('presenze_impostazioni').select('soglia_trasferta_ore,valida_da')
      .order('valida_da', { ascending: false }).limit(1);
    if (rs.data && rs.data[0]) _prSoglia = Number(rs.data[0].soglia_trasferta_ore) || 9;

    var rm = await sb.from('presenze_mesi').select('*')
      .order('anno', { ascending: false }).order('mese', { ascending: false });
    if (rm.error) throw rm.error;
    _prMesi = rm.data || [];

    // totali per mese, in una query sola invece di una per mese
    var tot = {};
    if (_prMesi.length) {
      var ids = _prMesi.map(function (m) { return m.id; });
      for (var i = 0; i < ids.length; i += 50) {
        var rg = await sb.from('presenze_giorni')
          .select('mese_id,autista_nome,ore_guida,ore_impegno,trasferta')
          .in('mese_id', ids.slice(i, i + 50));
        if (rg.error) throw rg.error;
        (rg.data || []).forEach(function (r) {
          var t = tot[r.mese_id] = tot[r.mese_id] || { guida: 0, impegno: 0, trasferte: 0, autisti: {} };
          t.guida += Number(r.ore_guida || 0);
          t.impegno += Number(r.ore_impegno || 0);
          if (r.trasferta) t.trasferte++;
          t.autisti[r.autista_nome] = 1;
        });
      }
    }
    _prRenderHome(tot);
  } catch (e) {
    el.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Errore: ' + esc((e && e.message) || String(e)) + '</div>';
  }
}

function _prRenderHome(tot) {
  var el = document.getElementById('pr-contenuto');
  if (!el) return;
  var h = '';

  h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:14px">';
  h += '<div style="font-size:12px;color:var(--text-muted)">Soglia trasferta <strong style="color:var(--text)">'
     + _prH(_prSoglia) + ' ore</strong> · usata solo per il confronto: le trasferte contate sono quelle scritte nel foglio</div>';
  h += '<div><input type="file" id="pr-file" accept=".xls,.xlsx" style="display:none" onchange="_prFileScelto(this)">'
     + '<button onclick="document.getElementById(\'pr-file\').click()" class="btn-primary" style="font-size:12px;padding:8px 14px">⬆ Carica foglio del mese</button></div>';
  h += '</div>';

  if (!_prMesi.length) {
    h += '<div class="card" style="text-align:center;padding:30px 20px">'
       + '<div style="font-size:14px;font-weight:500;margin-bottom:5px">Nessun mese caricato</div>'
       + '<div style="font-size:12.5px;color:var(--text-muted);line-height:1.6">Carica il foglio presenze di un mese. '
       + 'Il mese viene riconosciuto dal calendario del foglio, non dal nome del file.</div></div>';
    el.innerHTML = h;
    return;
  }

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(215px,1fr));gap:12px">';
  _prMesi.forEach(function (m) {
    var t = tot[m.id] || { guida: 0, impegno: 0, trasferte: 0, autisti: {} };
    var nAut = Object.keys(t.autisti).length;
    var senzaImpegno = t.impegno < 0.01;
    h += '<div class="card" style="padding:13px 15px;cursor:pointer" onclick="_prApriMese(\'' + m.id + '\')">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:6px">';
    h += '<div style="font-size:14.5px;font-weight:500">' + esc(_prTitolo(m.mese, m.anno)) + '</div>';
    h += '<button onclick="event.stopPropagation();_prEliminaMese(\'' + m.id + '\')" title="Elimina questo mese" '
       + 'style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:13px;padding:2px 4px">✕</button>';
    h += '</div>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-top:1px">' + nAut
       + (nAut === 1 ? ' autista' : ' autisti') + ' · caricato il ' + fmtD(String(m.caricato_at).slice(0, 10)) + '</div>';
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-top:11px">';
    h += '<div><div style="font-size:16px;font-weight:600;font-family:var(--font-mono)">' + _prH(t.guida) + '</div><div style="font-size:10.5px;color:var(--text-muted)">h guida</div></div>';
    h += '<div><div style="font-size:16px;font-weight:600;font-family:var(--font-mono);color:' + (senzaImpegno ? 'var(--text-muted)' : 'var(--text)') + '">'
       + (senzaImpegno ? '—' : _prH(t.impegno)) + '</div><div style="font-size:10.5px;color:var(--text-muted)">h impegno</div></div>';
    h += '<div><div style="font-size:16px;font-weight:600;font-family:var(--font-mono)">' + t.trasferte + '</div><div style="font-size:10.5px;color:var(--text-muted)">trasferte</div></div>';
    h += '</div>';
    if (senzaImpegno) {
      h += '<div style="font-size:10.5px;color:#854F0B;margin-top:8px;line-height:1.5">Ore di impegno non inserite nel foglio: la percentuale di guida non è calcolabile.</div>';
    }
    h += '</div>';
  });
  h += '</div>';
  el.innerHTML = h;
}

function _prApriMese(id) {
  var m = _prMesi.filter(function (x) { return x.id === id; })[0];
  toast('Report di ' + (m ? _prTitolo(m.mese, m.anno) : 'questo mese') + ': in arrivo nel prossimo blocco');
}


// ══════════════════════════════════════════════════════════════════════════
// IMPORT
// ══════════════════════════════════════════════════════════════════════════
async function _prFileScelto(input) {
  var file = input.files && input.files[0];
  input.value = '';
  if (!file) return;
  apriModal('<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Leggo il foglio…</div>');
  try {
    await _prCaricaSheetJS();
    var buf = await file.arrayBuffer();
    var wb = XLSX.read(buf, { type: 'array' });
    var F = _prLeggiFoglio(wb);
    var nGiorni = F.listaGiorni[F.listaGiorni.length - 1];
    var compat = _prMesiCompatibili(nGiorni, F.fermi, F.etichetta ? F.etichetta.anno : null);
    _prImport = { file: file, F: F, nGiorni: nGiorni, compat: compat };
    _prRenderConferma();
  } catch (e) {
    chiudiModal();
    toast('Lettura non riuscita: ' + ((e && e.message) || e));
    console.error('[presenze]', e);
  }
}

function _prRenderConferma() {
  var I = _prImport;
  if (!I) return;
  var F = I.F;
  var et = F.etichetta;
  var scelto = I.compat.length ? I.compat[0] : (et || null);
  // se l'etichetta e' fra i mesi compatibili, e' lei ad avere ragione
  if (et) {
    for (var i = 0; i < I.compat.length; i++) {
      if (I.compat[i].mese === et.mese && I.compat[i].anno === et.anno) scelto = I.compat[i];
    }
  }
  I.scelto = scelto;

  var discorde = et && scelto && (et.mese !== scelto.mese || et.anno !== scelto.anno);
  var giaCarico = scelto && _prMesi.filter(function (m) { return m.mese === scelto.mese && m.anno === scelto.anno; })[0];

  var h = '<div style="max-width:560px">';
  h += '<div style="font-size:16px;font-weight:500;margin-bottom:2px">Carica foglio presenze</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:14px">' + esc(I.file.name) + '</div>';

  if (discorde) {
    h += '<div style="background:#FFF1DC;border-left:3px solid #BA7517;padding:11px 13px;margin-bottom:13px">';
    h += '<div style="font-size:12.5px;font-weight:500;color:#633806;margin-bottom:4px">Il foglio dice una cosa, il calendario un\'altra</div>';
    h += '<div style="font-size:11.5px;color:#633806;line-height:1.6">Dentro il foglio c\'è scritto <strong>'
       + esc(_prTitolo(et.mese, et.anno)) + '</strong>, ma ci sono <strong>' + I.nGiorni + ' giorni</strong> e i giorni fermi sono '
       + F.fermi.join(', ') + ': è il calendario di <strong>' + esc(_prTitolo(scelto.mese, scelto.anno))
       + '</strong>. Scegli tu quale vale.</div></div>';
  }

  h += '<div style="margin-bottom:12px"><label style="display:block;font-size:11.5px;color:var(--text-muted);margin-bottom:4px">Mese da caricare</label>';
  h += '<select id="pr-mese-scelto" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px">';
  var viste = {};
  var opz = [];
  I.compat.forEach(function (x) { var k = x.anno + '-' + x.mese; if (!viste[k]) { viste[k] = 1; opz.push({ x: x, lab: ' (calendario)' }); } });
  if (et) { var k2 = et.anno + '-' + et.mese; if (!viste[k2]) { viste[k2] = 1; opz.push({ x: et, lab: ' (scritto nel foglio)' }); } }
  opz.forEach(function (o) {
    var sel = (scelto && o.x.mese === scelto.mese && o.x.anno === scelto.anno) ? ' selected' : '';
    h += '<option value="' + o.x.anno + '-' + o.x.mese + '"' + sel + '>' + esc(_prTitolo(o.x.mese, o.x.anno)) + o.lab + '</option>';
  });
  h += '</select></div>';

  // anteprima e verifica
  if (scelto) {
    var C = _prCostruisciRighe(F, scelto.mese, scelto.anno);
    var V = _prVerificaTotali(F, C.righe);
    I.anteprima = C;
    h += '<div style="background:var(--bg);border-radius:8px;padding:10px 13px;margin-bottom:12px;font-size:12px;line-height:1.8">';
    h += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">Righe da salvare</span><strong style="font-family:var(--font-mono)">' + C.righe.length + '</strong></div>';
    F.dipendenti.forEach(function (d) {
      var g = 0, im = 0, tr = 0;
      C.righe.forEach(function (r) {
        if (r.autista_nome !== d.nome) return;
        g += r.ore_guida || 0; im += r.ore_impegno || 0; if (r.trasferta) tr++;
      });
      h += '<div style="display:flex;justify-content:space-between"><span style="color:var(--text-muted)">' + esc(d.nome) + '</span>'
         + '<span style="font-family:var(--font-mono)">' + _prH(g) + ' h guida · ' + (im < 0.01 ? '—' : _prH(im) + ' h impegno') + ' · ' + tr + ' trasferte</span></div>';
    });
    h += '</div>';

    var errati = V.filter(function (x) { return !x.ok; });
    if (V.length) {
      h += '<div style="font-size:11px;line-height:1.6;margin-bottom:12px;color:' + (errati.length ? '#A32D2D' : '#27500A') + '">';
      if (errati.length) {
        h += '<strong>Attenzione:</strong> la mia somma non coincide col totale del foglio per ';
        h += errati.map(function (x) { return esc(x.nome) + ' (' + x.campo + ': ' + _prH(x.somma) + ' contro ' + _prH(x.atteso) + ')'; }).join(', ');
        h += '. Meglio controllare prima di salvare.';
      } else {
        h += '✓ Le somme coincidono con i totali calcolati dal foglio.';
      }
      h += '</div>';
    }

    C.avvisi.forEach(function (a) {
      h += '<div style="font-size:11px;color:#854F0B;line-height:1.6;margin-bottom:6px">' + esc(a) + '</div>';
    });
  }

  if (giaCarico) {
    h += '<div style="background:#FCEBEB;border-left:3px solid #E24B4A;padding:10px 12px;margin-bottom:12px;font-size:11.5px;color:#791F1F;line-height:1.6">'
       + '<strong>' + esc(_prTitolo(giaCarico.mese, giaCarico.anno)) + '</strong> è già caricato. Salvando, il mese esistente viene sostituito per intero.</div>';
  }

  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">';
  h += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 15px;font-size:12px;cursor:pointer">Annulla</button>';
  h += '<button onclick="_prSalvaImport()" class="btn-primary" style="font-size:12px;padding:8px 15px">'
     + (giaCarico ? 'Sostituisci il mese' : 'Salva') + '</button>';
  h += '</div></div>';

  apriModal(h);
  var sel = document.getElementById('pr-mese-scelto');
  if (sel) sel.onchange = function () {
    var p = this.value.split('-');
    _prImport.scelto = { anno: parseInt(p[0], 10), mese: parseInt(p[1], 10) };
    _prImport.compat = [_prImport.scelto].concat(_prImport.compat.filter(function (x) {
      return x.mese !== _prImport.scelto.mese || x.anno !== _prImport.scelto.anno;
    }));
    _prRenderConferma();
  };
}


async function _prSalvaImport() {
  var I = _prImport;
  if (!I || !I.scelto) { toast('Scegli il mese'); return; }
  var C = I.anteprima || _prCostruisciRighe(I.F, I.scelto.mese, I.scelto.anno);
  if (!C.righe.length) { toast('Non c\'è nessuna riga da salvare'); return; }

  apriModal('<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:13px">Salvo…</div>');
  try {
    // sostituzione per intero: si cancella il mese e si riscrive, cosi un
    // secondo caricamento corregge invece di accodare doppioni
    var vecchio = _prMesi.filter(function (m) { return m.mese === I.scelto.mese && m.anno === I.scelto.anno; })[0];
    if (vecchio) {
      var del = await sb.from('presenze_mesi').delete().eq('id', vecchio.id);
      if (del.error) throw del.error;
    }
    var ins = await sb.from('presenze_mesi').insert([{
      anno: I.scelto.anno, mese: I.scelto.mese, file_nome: I.file.name,
      caricato_da: (typeof _utenteCorrente === 'object' && _utenteCorrente) ? (_utenteCorrente.nome || _utenteCorrente.email || null) : null
    }]).select('id').single();
    if (ins.error) throw ins.error;
    var meseId = ins.data.id;

    // gli autisti si agganciano per nome quando il nome corrisponde
    var ra = await sb.from('autisti').select('id,nome');
    var perNome = {};
    (ra.data || []).forEach(function (a) { perNome[String(a.nome || '').trim().toLowerCase()] = a.id; });

    var righe = C.righe.map(function (r) {
      var x = Object.assign({}, r);
      x.mese_id = meseId;
      x.autista_id = perNome[String(r.autista_nome).trim().toLowerCase()] || null;
      return x;
    });
    for (var i = 0; i < righe.length; i += 200) {
      var ir = await sb.from('presenze_giorni').insert(righe.slice(i, i + 200));
      if (ir.error) throw ir.error;
    }

    if (typeof _auditLog === 'function') {
      _auditLog('import_presenze', 'presenze_mesi', _prTitolo(I.scelto.mese, I.scelto.anno) + ' · ' + righe.length + ' righe · ' + I.file.name);
    }
    chiudiModal();
    toast('✓ ' + _prTitolo(I.scelto.mese, I.scelto.anno) + ' caricato · ' + righe.length + ' righe');
    _prImport = null;
    await caricaPresenze();
  } catch (e) {
    chiudiModal();
    toast('Salvataggio non riuscito: ' + ((e && e.message) || e));
    console.error('[presenze] salvataggio', e);
  }
}


async function _prEliminaMese(id) {
  var m = _prMesi.filter(function (x) { return x.id === id; })[0];
  if (!m) return;
  if (!confirm('Elimino ' + _prTitolo(m.mese, m.anno) + ' e tutte le sue righe?')) return;
  var r = await sb.from('presenze_mesi').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  toast('✓ ' + _prTitolo(m.mese, m.anno) + ' eliminato');
  await caricaPresenze();
}
