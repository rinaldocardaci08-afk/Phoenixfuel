// VERSIONE 08/06/2026 a - Fix versamenti a cavallo mese: filtro per giorni coperti (competenza)
// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Corrispettivi & Versamenti bancari (vista mensile)
// Legge dati da stazione_cassa (già compilata dal foglio giornaliero)
// + stazione_spese_contanti + versamenti_banca (nuova tabella)
// ═══════════════════════════════════════════════════════════════════

var _corrData = null;

async function caricaCorrispettivi() {
  var el = document.getElementById('corr-tabella');
  if (!el) return;
  el.innerHTML = '<tr><td colspan="14" class="loading" style="padding:16px">Caricamento...</td></tr>';

  var selAnno = document.getElementById('corr-anno');
  var selMese = document.getElementById('corr-mese');
  if (selAnno && !selAnno.options.length) {
    var ac = new Date().getFullYear();
    for (var a = ac; a >= ac - 2; a--) selAnno.innerHTML += '<option value="' + a + '">' + a + '</option>';
  }
  if (selMese && !selMese.value) selMese.value = String(new Date().getMonth() + 1).padStart(2, '0');

  var anno = selAnno ? selAnno.value : String(new Date().getFullYear());
  var mese = selMese ? selMese.value : String(new Date().getMonth() + 1).padStart(2, '0');
  var daISO = anno + '-' + mese + '-01';
  var ultimoGiorno = new Date(Number(anno), Number(mese), 0).getDate();
  var aISO = anno + '-' + mese + '-' + String(ultimoGiorno).padStart(2, '0');

  // FIX 08/06/2026: i versamenti si filtrano per COMPETENZA (giorni coperti), non
  // per data_versamento. Un versamento dei giorni di fine maggio può avere
  // data_versamento a giugno (soldi portati in banca il mese dopo). Carico quindi
  // una finestra ampia (da 31gg prima a 92gg dopo il mese) e filtro in JS sotto.
  var daWin = new Date(daISO + 'T00:00:00'); daWin.setDate(daWin.getDate() - 31);
  var daWinISO = daWin.toISOString().split('T')[0];
  var aWin = new Date(aISO + 'T00:00:00'); aWin.setDate(aWin.getDate() + 92);
  var aWinISO = aWin.toISOString().split('T')[0];

  var [cassaRes, speseRes, versRes] = await Promise.all([
    sb.from('stazione_cassa').select('*').gte('data', daISO).lte('data', aISO).order('data'),
    sb.from('stazione_spese_contanti').select('*').gte('data', daISO).lte('data', aISO),
    sb.from('versamenti_banca').select('*').gte('data_versamento', daWinISO).lte('data_versamento', aWinISO).order('data_versamento')
  ]);

  var cassa = cassaRes.data || [];
  var spese = speseRes.data || [];
  // FIX 08/06/2026: tieni solo i versamenti che coprono almeno un giorno del mese visualizzato
  var versamenti = (versRes.data || []).filter(function(v) {
    return (v.giorni_coperti || []).some(function(g) {
      var gs = (typeof g === 'string') ? g.substring(0, 10) : String(g).substring(0, 10);
      return gs >= daISO && gs <= aISO;
    });
  });

  // Spese per giorno
  var spesePerGiorno = {};
  spese.forEach(function(s) {
    spesePerGiorno[s.data] = (spesePerGiorno[s.data] || 0) + Number(s.importo || 0);
  });

  // Versamenti: mappa giorno → versamento (un giorno può appartenere a un solo versamento)
  var giornoToVers = {};
  versamenti.forEach(function(v) {
    (v.giorni_coperti || []).forEach(function(g) {
      giornoToVers[g] = v;
    });
  });

  // Costruisci righe per ogni giorno del mese
  var righe = [];
  for (var d = 1; d <= ultimoGiorno; d++) {
    var dataISO = anno + '-' + mese + '-' + String(d).padStart(2, '0');
    var c = cassa.find(function(r) { return r.data === dataISO; });
    var totSpese = spesePerGiorno[dataISO] || 0;
    var vers = giornoToVers[dataISO] || null;

    var venduto = c ? Number(c.totale_vendite || 0) : 0;
    var bancomat = c ? Number(c.bancomat || 0) : 0;
    var nexi = c ? Number(c.carte_nexi || 0) : 0;
    var aziendali = c ? Number(c.carte_aziendali || 0) : 0;
    var totCarte = bancomat + nexi + aziendali;
    var contanti = Math.max(0, venduto - totCarte);

    var crediti = c ? Number(c.crediti_emessi || 0) : 0;
    var rimborsi = c ? Number(c.rimborsi_effettuati || 0) : 0;
    var rimborsiPrec = c ? Number(c.rimborsi_giorni_prec || 0) : 0;
    var saldoCrediti = crediti - rimborsi - rimborsiPrec;

    // Contanti contati (buste = dal conteggio banconote)
    var contatiContanti = 0;
    if (c) {
      [100, 50, 20, 10, 5, 2, 1].forEach(function(t) {
        contatiContanti += (Number(c['banconote_' + t] || 0)) * t;
      });
      contatiContanti += Number(c.monete_varie || 0);
    }

    // Da versare = contanti attesi + crediti netti - spese
    var daVersare = Math.round((contanti + saldoCrediti - totSpese) * 100) / 100;
    // Differenza busta = contati - da versare
    var diffBusta = contatiContanti > 0 ? Math.round((contatiContanti - daVersare) * 100) / 100 : 0;

    righe.push({
      data: dataISO,
      giorno: d,
      venduto: venduto,
      bancomat: bancomat,
      nexi: nexi,
      aziendali: aziendali,
      totCarte: totCarte,
      contanti: contanti,
      contatiContanti: contatiContanti,
      spese: totSpese,
      crediti: crediti,
      rimborsi: rimborsi + rimborsiPrec,
      saldoCrediti: saldoCrediti,
      daVersare: daVersare,
      diffBusta: diffBusta,
      versamento: vers,
      hasCassa: !!c
    });
  }

  _corrData = { righe: righe, versamenti: versamenti, anno: anno, mese: mese };
  _corrRender();
  _corrRenderStoricoVers();
}

function _corrRender() {
  var m = _corrData;
  if (!m) return;
  var el = document.getElementById('corr-tabella');
  if (!el) return;

  var html = '';
  var totVenduto = 0, totCarte = 0, totContanti = 0, totSpese = 0;
  var totCrediti = 0, totRimborsi = 0, totDaVersare = 0, totVersato = 0, totContati = 0;
  var totDiff = 0;
  var versRenderati = {}; // per non ripetere righe versamento

  // Patch v20260501f: pre-pass per identificare l'ULTIMO indice di riga
  // per ogni versamento_id. La riga "↳ Versamento" verrà mostrata solo
  // sotto l'ultimo giorno componente, non sopra il primo (era contro-
  // intuitivo: il versamento del 24/04 con giorni 20-21-22 appariva
  // prima del 21/04).
  var ultimoIdxPerVers = {};
  m.righe.forEach(function(r, idx) {
    if (r.versamento && r.versamento.id) {
      ultimoIdxPerVers[r.versamento.id] = idx;
    }
  });

  m.righe.forEach(function(r, i) {
    var bgRow = i % 2 === 1 ? 'background:var(--bg-card)' : '';
    var opac = r.hasCassa ? '' : 'opacity:0.3;';
    var checked = document.getElementById('corr-chk-' + r.giorno);
    var isChecked = checked ? checked.checked : false;

    // Accumula totali
    totVenduto += r.venduto;
    totCarte += r.totCarte;
    totContanti += r.contanti;
    totSpese += r.spese;
    totCrediti += r.crediti;
    totRimborsi += r.rimborsi;
    totDaVersare += r.daVersare;
    totContati += r.contatiContanti;
    totDiff += r.diffBusta;

    var dataFmt = String(r.giorno).padStart(2, '0') + '/' + m.mese;

    html += '<tr style="border-bottom:0.5px solid var(--border);' + bgRow + opac + '">';
    // Checkbox
    html += '<td style="padding:3px;text-align:center">';
    if (r.hasCassa && !r.versamento) {
      html += '<input type="checkbox" id="corr-chk-' + r.giorno + '" data-giorno="' + r.data + '" data-importo="' + r.daVersare + '" onchange="_corrAggiornaSelezionati()" style="accent-color:#639922" />';
    } else if (r.versamento) {
      html += '<span style="color:#639922;font-size:13px">✓</span>';
    }
    html += '</td>';
    // Data
    html += '<td style="padding:4px 6px;font-family:var(--font-mono);font-weight:500">' + dataFmt + '</td>';
    // Venduto
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono)">' + (r.venduto ? _fmtC(r.venduto) : '—') + '</td>';
    // Carte (Nexi + PagoBancomat + Aziendali)
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + (r.nexi ? _fmtC(r.nexi) : '—') + '</td>';
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + (r.bancomat ? _fmtC(r.bancomat) : '—') + '</td>';
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + (r.aziendali ? _fmtC(r.aziendali) : '—') + '</td>';
    // Tot contanti
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono);font-weight:500;background:rgba(186,117,23,0.05)">' + (r.contanti ? _fmtC(r.contanti) : '—') + '</td>';
    // Versato (busta / contati)
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono)">' + (r.contatiContanti ? _fmtC(r.contatiContanti) : '—') + '</td>';
    // Spese + rimborsi
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono);color:#E24B4A">' + (r.spese ? _fmtC(r.spese) : '—') + '</td>';
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono);color:#E24B4A">' + (r.rimborsi ? _fmtC(r.rimborsi) : '—') + '</td>';
    // Incassi resti (crediti)
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono)">' + (r.crediti ? _fmtC(r.crediti) : '—') + '</td>';
    // Diff busta
    var dCol = r.diffBusta >= 0 ? '#639922' : '#E24B4A';
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono);color:' + (r.contatiContanti ? dCol : 'var(--text-muted)') + '">' + (r.contatiContanti ? (r.diffBusta >= 0 ? '+' : '') + _fmtC(r.diffBusta) : '—') + '</td>';
    // Da versare
    html += '<td style="padding:4px 6px;text-align:right;font-family:var(--font-mono);font-weight:600;background:rgba(99,153,34,0.05);color:#27500A">' + (r.daVersare ? _fmtC(r.daVersare) : '—') + '</td>';
    // Versamento data
    if (r.versamento) {
      var vData = new Date(r.versamento.data_versamento + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
      html += '<td style="padding:4px 6px;text-align:center"><span style="background:#EAF3DE;color:#27500A;padding:2px 6px;border-radius:4px;font-size:10px">' + vData + '</span></td>';
    } else {
      html += '<td style="padding:4px 6px;text-align:center;color:var(--text-muted);font-size:10px">—</td>';
    }
    html += '</tr>';

    // Riga versamento raggruppato (mostra dopo l'ULTIMO giorno componente — Patch v20260501f)
    if (r.versamento && ultimoIdxPerVers[r.versamento.id] === i && !versRenderati[r.versamento.id]) {
      versRenderati[r.versamento.id] = true;
      var v = r.versamento;
      var giorniCop = (v.giorni_coperti || []).map(function(g) {
        return new Date(g + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
      }).join(', ');
      var vDataFmt = new Date(v.data_versamento + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });

      html += '<tr style="background:#E6F1FB;border-bottom:2px solid #378ADD">';
      html += '<td colspan="2" style="padding:6px;font-weight:500;color:#0C447C;font-size:10px">↳ Versamento ' + vDataFmt + '</td>';
      html += '<td colspan="4" style="padding:6px;font-size:10px;color:#0C447C">' + esc(v.banca || '') + ' — ' + esc(v.note || '') + '</td>';
      html += '<td colspan="4" style="padding:6px;font-size:10px;color:#0C447C">Giorni: ' + giorniCop + '</td>';
      html += '<td style="padding:6px"></td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#0C447C">' + _fmtC(Number(v.importo_versato || 0)) + '</td>';
      html += '<td style="padding:6px;text-align:center">';
      html += '<button onclick="_corrModificaVersamento(\'' + v.id + '\')" style="background:#FFC107;color:#1a3a5a;padding:2px 7px;border-radius:4px;font-size:9px;border:none;cursor:pointer;margin-right:3px" title="Modifica versamento">✏️</button>';
      if (v.ricevuta_url) {
        html += '<a href="' + v.ricevuta_url + '" target="_blank" style="background:#378ADD;color:white;padding:2px 6px;border-radius:4px;font-size:9px;text-decoration:none">📎 PDF</a>';
      }
      html += '</td>';
      html += '</tr>';
      totVersato += Number(v.importo_versato || 0);
    }
  });

  // Riga totale mese
  html += '<tr style="background:#EAF3DE;font-weight:500">';
  html += '<td colspan="2" style="padding:8px 6px;color:#27500A">TOTALE MESE</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _fmtC(totVenduto) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _fmtC(totCarte) + '</td>';
  html += '<td colspan="2" style="padding:8px 6px"></td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A;background:rgba(99,153,34,0.1)">' + _fmtC(totContanti) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _fmtC(totContati) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _fmtC(totSpese) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _fmtC(totRimborsi) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _fmtC(totCrediti) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + (totDiff >= 0 ? '+' : '') + _fmtC(totDiff) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A;background:rgba(99,153,34,0.1)">' + _fmtC(totDaVersare) + '</td>';
  html += '<td style="padding:8px 6px"></td>';
  html += '</tr>';

  el.innerHTML = html;

  // Aggiorna card riassuntive
  var elCartePct = document.getElementById('corr-carte-pct');
  var elContPct = document.getElementById('corr-cont-pct');
  var elVersBanca = document.getElementById('corr-vers-banca');
  var cartePct = totVenduto > 0 ? Math.round((totCarte / totVenduto) * 100) : 0;
  if (elCartePct) elCartePct.innerHTML = '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Carte (' + cartePct + '%)</div><div style="font-family:var(--font-mono);font-size:16px;font-weight:500">' + _fmtC(totCarte) + '</div>';
  if (elContPct) elContPct.innerHTML = '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Contanti (' + (100 - cartePct) + '%)</div><div style="font-family:var(--font-mono);font-size:16px;font-weight:500">' + _fmtC(totContanti) + '</div>';
  var daVersareRest = totDaVersare - totVersato;
  if (elVersBanca) elVersBanca.innerHTML = '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Versati / Restanti</div><div style="font-family:var(--font-mono);font-size:16px;font-weight:500">' + _fmtC(totVersato) + ' <span style="font-size:11px;color:' + (daVersareRest > 0 ? '#E24B4A' : '#639922') + '">/ ' + _fmtC(daVersareRest) + '</span></div>';
}

// ── Checkbox: aggiorna pannello "Registra versamento" ──
function _corrAggiornaSelezionati() {
  var checks = document.querySelectorAll('#corr-tabella input[type=checkbox]:checked');
  var pannello = document.getElementById('corr-registra-panel');
  if (!checks.length) {
    if (pannello) pannello.style.display = 'none';
    return;
  }
  if (pannello) pannello.style.display = 'block';

  var giorni = [];
  var totale = 0;
  checks.forEach(function(c) {
    giorni.push(c.dataset.giorno);
    totale += Number(c.dataset.importo || 0);
  });
  totale = Math.round(totale * 100) / 100;

  var elGiorni = document.getElementById('corr-reg-giorni');
  var elTotale = document.getElementById('corr-reg-totale');
  var elImporto = document.getElementById('corr-reg-importo');

  if (elGiorni) elGiorni.textContent = giorni.map(function(g) {
    return new Date(g + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
  }).join(', ');
  if (elTotale) elTotale.textContent = _fmtC(totale);
  if (elImporto && !elImporto.dataset.touched) elImporto.value = totale.toFixed(2);

  // Differenza live
  var diff = Number(elImporto ? elImporto.value : 0) - totale;
  var elDiff = document.getElementById('corr-reg-diff');
  if (elDiff) {
    var col = Math.abs(diff) < 0.01 ? '#639922' : '#E24B4A';
    elDiff.innerHTML = 'Differenza: <span style="font-family:var(--font-mono);color:' + col + '">' + (diff >= 0 ? '+' : '') + _fmtC(diff) + '</span>';
  }
}

// ── Registra versamento bancario ──
async function _corrRegistraVersamento() {
  var checks = document.querySelectorAll('#corr-tabella input[type=checkbox]:checked');
  if (!checks.length) { toast('Seleziona almeno un giorno'); return; }

  var giorni = [];
  var totAtteso = 0;
  checks.forEach(function(c) {
    giorni.push(c.dataset.giorno);
    totAtteso += Number(c.dataset.importo || 0);
  });

  var dataVers = document.getElementById('corr-reg-data').value;
  var banca = document.getElementById('corr-reg-banca').value;
  var importo = parseFloat(document.getElementById('corr-reg-importo').value) || 0;
  var note = document.getElementById('corr-reg-note').value.trim();

  if (!dataVers) { toast('Inserisci la data del versamento'); return; }
  if (!importo) { toast('Inserisci l\'importo versato'); return; }

  var record = {
    data_versamento: dataVers,
    banca: banca,
    importo_versato: importo,
    importo_atteso: Math.round(totAtteso * 100) / 100,
    differenza: Math.round((importo - totAtteso) * 100) / 100,
    giorni_coperti: giorni,
    note: note,
    created_by: utenteCorrente ? utenteCorrente.auth_id : null
  };

  // Upload ricevuta se presente
  var fileInput = document.getElementById('corr-reg-file');
  var uploadedPath = null; // per rollback in caso di errore insert DB
  if (fileInput && fileInput.files && fileInput.files.length) {
    var file = fileInput.files[0];
    if (file.size > 15 * 1024 * 1024) { toast('File ricevuta troppo grande (max 15MB)'); return; }
    // Sanitizza filename (come in pf-allegati.js): rimuove accenti, spazi, caratteri speciali
    var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = 'versamenti-banca/' + dataVers + '_' + Date.now() + '_' + safeName;
    var { error: upErr } = await sb.storage.from('allegati').upload(path, file, { contentType: file.type });
    if (upErr) {
      toast('Errore upload ricevuta: ' + (upErr.message || upErr));
      console.error('[registraVersamento] upload fallito:', upErr);
      return; // blocca: utente capisce che non è andato
    }
    var { data: urlData } = sb.storage.from('allegati').getPublicUrl(path);
    record.ricevuta_url = urlData.publicUrl;
    uploadedPath = path;
  }

  var { error } = await sb.from('versamenti_banca').insert([record]);
  if (error) {
    // Rollback Storage: se insert DB fallisce, rimuove il file caricato (evita orfani)
    if (uploadedPath) {
      try { await sb.storage.from('allegati').remove([uploadedPath]); } catch(_) {}
    }
    toast('Errore: ' + error.message);
    return;
  }

  toast('Versamento registrato!' + (uploadedPath ? ' (ricevuta allegata)' : ''));
  document.getElementById('corr-registra-panel').style.display = 'none';
  caricaCorrispettivi();
}

// ── PDF Corrispettivi ──
function _corrStampaPDF() {
  if (!_corrData) return;
  var m = _corrData;
  var MESI = ['', 'Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];

  var w = window.open('', '_blank');
  var h = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Corrispettivi ' + MESI[Number(m.mese)] + ' ' + m.anno + '</title>';
  h += '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:20px;color:#1a1a18}';
  h += 'table{width:100%;border-collapse:collapse;margin-top:12px}';
  h += 'th,td{padding:5px 6px;border:0.5px solid #ccc;font-size:10px}';
  h += 'th{background:#1a1a18;color:#fff;text-transform:uppercase;font-size:9px;letter-spacing:0.3px}';
  h += 'td.m{font-family:"Courier New",monospace;text-align:right}';
  h += '.tot{background:#EAF3DE;font-weight:bold;color:#27500A}';
  h += '@media print{body{margin:10px}}</style></head><body>';
  h += '<div style="text-align:center;margin-bottom:16px"><strong style="font-size:14px">PHOENIX FUEL S.R.L.</strong><br>Stazione Oppido Mamertina<br><strong>Registro Corrispettivi — ' + MESI[Number(m.mese)] + ' ' + m.anno + '</strong></div>';

  h += '<table><thead><tr><th>Data</th><th>Venduto €</th></tr></thead><tbody>';

  var totale = 0;
  m.righe.forEach(function(r) {
    if (!r.hasCassa) return;
    totale += r.venduto;
    var dataFmt = new Date(r.data + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
    h += '<tr><td>' + dataFmt + '</td><td class="m">' + _fmtC(r.venduto) + '</td></tr>';
  });

  h += '<tr class="tot"><td>TOTALE MESE</td><td class="m" style="font-size:12px">' + _fmtC(totale) + '</td></tr>';
  h += '</tbody></table>';
  h += '<div style="margin-top:24px;font-size:9px;color:#888">Generato il ' + new Date().toLocaleDateString('it-IT') + ' da PhoenixFuel</div>';
  h += '</body></html>';

  w.document.write(h);
  w.document.close();
  setTimeout(function() { w.print(); }, 300);
}

// ── Helper formato valuta ──
function _fmtC(v) {
  if (typeof v !== 'number' || isNaN(v)) return '—';
  return v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════════
// STORICO VERSAMENTI BANCARI
// ═══════════════════════════════════════════════════════════════════
function _corrRenderStoricoVers() {
  var m = _corrData;
  if (!m) return;
  var tbody = document.getElementById('corr-storico-vers');
  if (!tbody) return;

  // Carica TUTTI i versamenti (non solo del mese selezionato)
  sb.from('versamenti_banca').select('*').order('data_versamento', { ascending: false }).limit(50)
    .then(function(res) {
      var vers = res.data || [];
      if (!vers.length) {
        tbody.innerHTML = '<tr><td colspan="9" style="padding:12px;color:var(--text-muted);text-align:center">Nessun versamento registrato</td></tr>';
        return;
      }

      var html = '';
      vers.forEach(function(v, i) {
        var dataFmt = new Date(v.data_versamento + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
        var giorniCop = (v.giorni_coperti || []).map(function(g) {
          return new Date(g + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
        }).join(', ');
        var diff = Number(v.differenza || 0);
        var diffCol = Math.abs(diff) < 0.01 ? '#639922' : '#E24B4A';
        var bgRow = i % 2 === 1 ? 'background:var(--bg-card)' : '';

        html += '<tr style="border-bottom:0.5px solid var(--border);' + bgRow + '">';
        html += '<td style="padding:6px;font-family:var(--font-mono);font-weight:500">' + dataFmt + '</td>';
        html += '<td style="padding:6px">' + esc(v.banca || '—') + '</td>';
        html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);font-weight:500">' + _fmtC(Number(v.importo_versato || 0)) + '</td>';
        html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + _fmtC(Number(v.importo_atteso || 0)) + '</td>';
        html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:' + diffCol + '">' + (diff >= 0 ? '+' : '') + _fmtC(diff) + '</td>';
        html += '<td style="padding:6px;font-size:10px;color:var(--text-muted)">' + giorniCop + '</td>';
        html += '<td style="padding:6px;font-size:11px">' + esc(v.note || '—') + '</td>';
        // Ricevuta: link se c'è, pallino rosso se manca
        if (v.ricevuta_url) {
          html += '<td style="padding:6px;text-align:center"><a href="' + v.ricevuta_url + '" target="_blank" style="background:#378ADD;color:white;padding:3px 8px;border-radius:4px;font-size:10px;text-decoration:none">📎 Vedi</a></td>';
        } else {
          html += '<td style="padding:6px;text-align:center"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:#E24B4A" title="Ricevuta mancante"></span></td>';
        }
        // Bottone elimina
        html += '<td style="padding:6px;text-align:center"><button onclick="_corrEliminaVersamento(\'' + v.id + '\')" style="background:transparent;border:0.5px solid var(--border);padding:3px 6px;border-radius:4px;cursor:pointer;font-size:10px;color:#E24B4A" title="Elimina">✕</button></td>';
        html += '</tr>';
      });

      tbody.innerHTML = html;
    });
}

// ── Elimina versamento ──
async function _corrEliminaVersamento(id) {
  if (!confirm('Eliminare questo versamento bancario?')) return;
  var { error } = await sb.from('versamenti_banca').delete().eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Versamento eliminato');
  caricaCorrispettivi();
}

// ── MODIFICA VERSAMENTO BANCARIO ──────────────────────────────────────
// Apre un modale con i dati del versamento, permette di modificare data, banca, importo, note,
// e opzionalmente sostituire la ricevuta. Permette anche di aggiungere/togliere giorni coperti
// (i giorni di altri versamenti restano disabled).
async function _corrModificaVersamento(id) {
  if (!id) { toast('ID versamento non valido'); return; }

  // Carico il versamento dal DB
  var { data: v, error } = await sb.from('versamenti_banca').select('*').eq('id', id).single();
  if (error || !v) { toast('Errore: versamento non trovato'); return; }

  // Banche disponibili (lette dalla tabella banche se presente, altrimenti lista costituzionale)
  var bancheLista = [];
  try {
    var { data: bk } = await sb.from('banche').select('nome').order('nome');
    bancheLista = (bk || []).map(function(b) { return b.nome; });
  } catch (_) {}
  if (!bancheLista.length) bancheLista = ['Intesa', 'MPS', 'BNL', 'BCC'];

  // Stato locale per il modale: array dei giorni selezionati e info per render
  var giorniCorrenti = (v.giorni_coperti || []).slice();
  window._modVersStato = { id: id, giorniSelezionati: giorniCorrenti, righeMese: [] };

  // Recupero le righe del mese da _corrData se è del mese del versamento, altrimenti rifaccio il calcolo
  var dataVersDate = new Date(v.data_versamento + 'T12:00:00');
  var annoV = dataVersDate.getFullYear();
  var meseV = dataVersDate.getMonth() + 1;
  var righeMese = [];
  if (_corrData && Number(_corrData.anno) === annoV && Number(_corrData.mese) === meseV) {
    righeMese = _corrData.righe || [];
  } else {
    // Caricamento ad-hoc del mese del versamento
    righeMese = await _corrCaricaRigheMese(annoV, meseV);
  }
  window._modVersStato.righeMese = righeMese;

  var html = '<div style="font-size:15px;font-weight:600;margin-bottom:10px;color:#0C447C">✏️ Modifica versamento bancario</div>';

  html += '<div class="form-group"><label>Data versamento</label><input type="date" id="modvers-data" value="' + (v.data_versamento || '') + '" /></div>';

  html += '<div class="form-group"><label>Banca</label><select id="modvers-banca">';
  bancheLista.forEach(function(b) {
    html += '<option value="' + esc(b) + '"' + (b === v.banca ? ' selected' : '') + '>' + esc(b) + '</option>';
  });
  html += '</select></div>';

  // Lista giorni coperti (checkbox: corrente checkato, altri liberi disabili checkabili, altri versamenti disabled)
  html += '<div class="form-group"><label>Giorni coperti dal versamento</label>';
  html += '<div style="max-height:160px;overflow-y:auto;border:1px solid var(--border);border-radius:6px;padding:6px;background:#FAFCFE">';
  html += '<div id="modvers-giorni-lista">' + _corrModVersRenderGiorni() + '</div>';
  html += '</div>';
  html += '<div style="margin-top:6px;font-size:11px;color:var(--text-muted)">Importo atteso ricalcolato: <strong id="modvers-atteso" style="color:#0C447C">€ ' + Number(v.importo_atteso || 0).toFixed(2) + '</strong></div>';
  html += '</div>';

  html += '<div class="form-group"><label>Importo versato (€)</label><input type="number" step="0.01" id="modvers-importo" value="' + Number(v.importo_versato || 0).toFixed(2) + '" oninput="_corrModVersAggiornaDiff()" /></div>';
  html += '<div style="margin-top:-8px;margin-bottom:10px;font-size:11px">Differenza: <strong id="modvers-diff" style="font-family:var(--font-mono)">€ ' + Number(v.differenza || 0).toFixed(2) + '</strong></div>';

  html += '<div class="form-group"><label>Note</label><input type="text" id="modvers-note" value="' + esc(v.note || '') + '" /></div>';

  html += '<div class="form-group"><label>Sostituisci ricevuta (PDF, opzionale)</label><input type="file" id="modvers-file" accept=".pdf,image/*" />';
  if (v.ricevuta_url) html += '<div style="font-size:10px;color:var(--text-muted);margin-top:4px">Ricevuta attuale: <a href="' + v.ricevuta_url + '" target="_blank" style="color:#378ADD">📎 Visualizza</a></div>';
  html += '</div>';

  html += '<div style="display:flex;gap:8px;margin-top:14px">';
  html += '<button onclick="chiudiModal()" style="flex:1;padding:8px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button>';
  html += '<button onclick="_corrSalvaModificaVersamento(\'' + id + '\')" style="flex:1;padding:8px 16px;border:none;border-radius:var(--radius);background:#0C447C;color:#fff;cursor:pointer;font-weight:600">💾 Salva</button>';
  html += '</div>';

  apriModal(html);
  _corrModVersAggiornaDiff();
}

// Render della lista checkbox giorni nel modale modifica versamento
function _corrModVersRenderGiorni() {
  var st = window._modVersStato;
  if (!st || !st.righeMese) return '<div style="padding:8px;color:#888;font-size:11px">Nessun dato disponibile per questo mese</div>';
  var html = '';
  st.righeMese.forEach(function(r) {
    if (!r.hasCassa) return; // niente cassa = niente da versare = saltiamo
    var dataR = r.data;
    var coperto = (r.versamento && r.versamento.id) ? r.versamento.id : null;
    var inQuestoVers = st.giorniSelezionati.indexOf(dataR) >= 0;
    var inAltroVers = coperto && coperto !== st.id && !inQuestoVers;
    var dataFmt = new Date(dataR + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    var bg = inQuestoVers ? '#E6F1FB' : (inAltroVers ? '#F4F4F4' : '#fff');
    var col = inAltroVers ? '#999' : '#1a1a1a';
    var dis = inAltroVers ? ' disabled' : '';
    var chk = inQuestoVers ? ' checked' : '';
    var infoAltro = inAltroVers && r.versamento ? ' <span style="font-size:10px;color:#999">→ versamento ' + new Date(r.versamento.data_versamento + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) + '</span>' : '';
    html += '<div style="display:flex;align-items:center;gap:8px;padding:4px 6px;background:' + bg + ';border-radius:4px;margin-bottom:2px;color:' + col + ';font-size:12px">';
    html += '<input type="checkbox" data-data="' + dataR + '" data-importo="' + r.daVersare + '"' + chk + dis + ' onchange="_corrModVersToggleGiorno(this)" style="accent-color:#639922" />';
    html += '<span style="font-weight:600">' + dataFmt + '</span>';
    html += '<span style="margin-left:auto;font-family:var(--font-mono)">' + _fmtC(Number(r.daVersare || 0)) + '</span>';
    html += infoAltro;
    html += '</div>';
  });
  if (!html) html = '<div style="padding:8px;color:#888;font-size:11px">Nessun giorno con cassa in questo mese</div>';
  return html;
}

// Gestione check/uncheck giorno nel modale modifica versamento
function _corrModVersToggleGiorno(cb) {
  var st = window._modVersStato;
  if (!st) return;
  var dataR = cb.dataset.data;
  if (cb.checked) {
    if (st.giorniSelezionati.indexOf(dataR) < 0) st.giorniSelezionati.push(dataR);
  } else {
    st.giorniSelezionati = st.giorniSelezionati.filter(function(d) { return d !== dataR; });
  }
  _corrModVersAggiornaDiff();
}

// Ricalcolo importo atteso e differenza ogni volta che cambia selezione o importo versato
function _corrModVersAggiornaDiff() {
  var st = window._modVersStato;
  if (!st) return;
  var atteso = 0;
  st.righeMese.forEach(function(r) {
    if (st.giorniSelezionati.indexOf(r.data) >= 0) atteso += Number(r.daVersare || 0);
  });
  atteso = Math.round(atteso * 100) / 100;
  var versato = parseFloat(document.getElementById('modvers-importo')?.value || 0) || 0;
  var diff = Math.round((versato - atteso) * 100) / 100;
  var elA = document.getElementById('modvers-atteso');
  var elD = document.getElementById('modvers-diff');
  if (elA) elA.textContent = '€ ' + atteso.toFixed(2);
  if (elD) {
    elD.textContent = (diff >= 0 ? '+' : '') + '€ ' + Math.abs(diff).toFixed(2);
    elD.style.color = diff < 0 ? '#E24B4A' : (diff > 0 ? '#639922' : '#1a3a5a');
  }
}

// Caricamento ad-hoc righe mese se _corrData non è del mese corretto
async function _corrCaricaRigheMese(anno, mese) {
  var daISO = anno + '-' + String(mese).padStart(2, '0') + '-01';
  var ultimoG = new Date(anno, mese, 0).getDate();
  var aISO = anno + '-' + String(mese).padStart(2, '0') + '-' + String(ultimoG).padStart(2, '0');

  var [cassaRes, versRes, speseRes, creditiRes] = await Promise.all([
    sb.from('stazione_cassa_giornaliera').select('*').gte('data', daISO).lte('data', aISO).order('data'),
    sb.from('versamenti_banca').select('*').gte('data_versamento', daISO).lte('data_versamento', aISO).order('data_versamento'),
    sb.from('stazione_spese_contanti').select('*').gte('data', daISO).lte('data', aISO),
    sb.from('stazione_crediti').select('*').gte('data', daISO).lte('data', aISO)
  ]);
  var cassaMap = {};
  (cassaRes.data || []).forEach(function(c) { cassaMap[c.data] = c; });
  var giornoVersamento = {};
  (versRes.data || []).forEach(function(v) { (v.giorni_coperti || []).forEach(function(g) { giornoVersamento[g] = v; }); });
  var spesePerGiorno = {};
  (speseRes.data || []).forEach(function(s) { spesePerGiorno[s.data] = (spesePerGiorno[s.data] || 0) + Number(s.importo || 0); });
  var creditiPerGiorno = {};
  (creditiRes.data || []).forEach(function(cc) {
    var d = cc.data; if (!creditiPerGiorno[d]) creditiPerGiorno[d] = { aperti: 0, chiusi: 0 };
    if (cc.chiuso) creditiPerGiorno[d].chiusi += Number(cc.importo || 0);
    else creditiPerGiorno[d].aperti += Number(cc.importo || 0);
  });
  var righe = [];
  for (var g = 1; g <= ultimoG; g++) {
    var dStr = anno + '-' + String(mese).padStart(2, '0') + '-' + String(g).padStart(2, '0');
    var c = cassaMap[dStr];
    var contanti = c ? Number(c.contanti || 0) : 0;
    var saldoCred = creditiPerGiorno[dStr] ? (creditiPerGiorno[dStr].chiusi - creditiPerGiorno[dStr].aperti) : 0;
    var totSpese = spesePerGiorno[dStr] || 0;
    var daVersare = Math.round((contanti + saldoCred - totSpese) * 100) / 100;
    righe.push({ giorno: g, data: dStr, daVersare: daVersare, versamento: giornoVersamento[dStr] || null, hasCassa: !!c });
  }
  return righe;
}

async function _corrSalvaModificaVersamento(id) {
  var st = window._modVersStato;
  if (!st || st.id !== id) { toast('Stato modifica perso, riapri la modale'); return; }

  var dataNuova = document.getElementById('modvers-data').value;
  var bancaNuova = document.getElementById('modvers-banca').value;
  var importoNuovo = parseFloat(document.getElementById('modvers-importo').value) || 0;
  var noteNuove = document.getElementById('modvers-note').value.trim();
  var giorniNuovi = st.giorniSelezionati.slice().sort();

  if (!dataNuova || !/^\d{4}-\d{2}-\d{2}$/.test(dataNuova)) { toast('Data non valida'); return; }
  if (!importoNuovo) { toast('Inserisci l\'importo versato'); return; }
  if (!giorniNuovi.length) { toast('Seleziona almeno un giorno coperto'); return; }

  // Ricalcolo importo_atteso dai giorni selezionati
  var attesoNuovo = 0;
  st.righeMese.forEach(function(r) {
    if (giorniNuovi.indexOf(r.data) >= 0) attesoNuovo += Number(r.daVersare || 0);
  });
  attesoNuovo = Math.round(attesoNuovo * 100) / 100;
  var differenzaNuova = Math.round((importoNuovo - attesoNuovo) * 100) / 100;

  var updatePayload = {
    data_versamento: dataNuova,
    banca: bancaNuova,
    importo_versato: importoNuovo,
    importo_atteso: attesoNuovo,
    differenza: differenzaNuova,
    giorni_coperti: giorniNuovi,
    note: noteNuove
  };

  // Sostituzione ricevuta opzionale
  var fileInput = document.getElementById('modvers-file');
  var newUploadedPath = null;
  if (fileInput && fileInput.files && fileInput.files.length) {
    var file = fileInput.files[0];
    if (file.size > 15 * 1024 * 1024) { toast('File ricevuta troppo grande (max 15MB)'); return; }
    var safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    var path = 'versamenti-banca/' + dataNuova + '_' + Date.now() + '_' + safeName;
    var { error: upErr } = await sb.storage.from('allegati').upload(path, file, { contentType: file.type });
    if (upErr) { toast('Errore upload ricevuta: ' + (upErr.message || upErr)); return; }
    var { data: urlData } = sb.storage.from('allegati').getPublicUrl(path);
    updatePayload.ricevuta_url = urlData.publicUrl;
    newUploadedPath = path;
  }

  var { error } = await sb.from('versamenti_banca').update(updatePayload).eq('id', id);
  if (error) {
    if (newUploadedPath) { try { await sb.storage.from('allegati').remove([newUploadedPath]); } catch(_) {} }
    toast('Errore: ' + error.message);
    return;
  }

  toast('✅ Versamento aggiornato' + (newUploadedPath ? ' (nuova ricevuta)' : ''));
  window._modVersStato = null;
  chiudiModal();
  caricaCorrispettivi();
}
