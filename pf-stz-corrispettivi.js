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

  var [cassaRes, speseRes, versRes] = await Promise.all([
    sb.from('stazione_cassa').select('*').gte('data', daISO).lte('data', aISO).order('data'),
    sb.from('stazione_spese_contanti').select('*').gte('data', daISO).lte('data', aISO),
    sb.from('versamenti_banca').select('*').gte('data_versamento', daISO).lte('data_versamento', aISO).order('data_versamento')
  ]);

  var cassa = cassaRes.data || [];
  var spese = speseRes.data || [];
  var versamenti = versRes.data || [];

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

    // Riga versamento raggruppato (mostra solo una volta per versamento)
    if (r.versamento && !versRenderati[r.versamento.id]) {
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
