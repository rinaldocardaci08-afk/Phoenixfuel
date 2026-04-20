// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Popup densità per generazione DAS
//
// FLUSSO:
//   pfApriPopupDensita(ordiniCarico, onConfirm, onCancel)
//     ├─ Raggruppa ordini per prodotto (distinti)
//     ├─ Precarica da das_documenti le ULTIME densità usate per prodotto
//     │  (fallback: valori tabellari standard di _dasDescrProdotti)
//     ├─ Render modal con una card per prodotto
//     ├─ Validazione live: range tipico (soft) + range hard (blocco) + regola
//     │  differenza amb/15°C ≤ 3%
//     └─ Conferma → onConfirm({ 'Gasolio Autotrazione': {amb:826.2, d15:828.9}, ... })
//        Annulla  → onCancel()
//
// Chi chiama è responsabile di fare l'insert carico + _generaDasPerCarico
// solo dopo onConfirm (spostamento deliberato: annulla = nulla in DB).
// ═══════════════════════════════════════════════════════════════════

(function(){

  // Colori prodotto (allineati al resto del programma)
  var COLORI = {
    'Gasolio Autotrazione': { bg:'#FAEEDA', brd:'#BA7517', txtDark:'#633806', txtMid:'#854F0B' },
    'Gasolio Agricolo':     { bg:'#EEEDFE', brd:'#534AB7', txtDark:'#26215C', txtMid:'#3C3489' },
    'Benzina':              { bg:'#EAF3DE', brd:'#639922', txtDark:'#27500A', txtMid:'#3B6D11' },
    'HVO':                  { bg:'#E1F5EE', brd:'#1D9E75', txtDark:'#04342C', txtMid:'#0F6E56' },
    'AdBlue':               { bg:'#F1EFE8', brd:'#888780', txtDark:'#2C2C2A', txtMid:'#444441' }
  };
  var DEFAULT_COL = { bg:'#F1EFE8', brd:'#888780', txtDark:'#2C2C2A', txtMid:'#444441' };

  // Range di validazione — modificare qui per aggiustare le soglie
  var RANGE = {
    'Gasolio Autotrazione': { soft:[820, 845], hard:[780, 880] },
    'Gasolio Agricolo':     { soft:[820, 845], hard:[780, 880] },
    'Benzina':              { soft:[720, 775], hard:[690, 800] },
    'HVO':                  { soft:[770, 790], hard:[740, 820] },
    'AdBlue':               { soft:[1085, 1095], hard:[1060, 1120] }
  };
  // Fallback per prodotti non in tabella (usa range Gasolio Auto)
  var RANGE_FALLBACK = { soft:[820, 845], hard:[780, 880] };
  var MAX_DELTA_PCT = 0.03; // densità_amb e densità_15 devono differire ≤ 3%

  // Fallback densità se manca storico E manca tabella standard
  var DEFAULTS = {
    'Gasolio Autotrazione': { amb:826.20, d15:828.90 },
    'Gasolio Agricolo':     { amb:826.20, d15:828.90 },
    'Benzina':              { amb:740.00, d15:742.00 },
    'HVO':                  { amb:778.00, d15:780.00 },
    'AdBlue':               { amb:1088.00, d15:1090.00 }
  };

  // Stato corrente del popup
  var _st = null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
  }
  function fmtL(n) {
    return Math.round(Number(n||0)).toLocaleString('it-IT').replace(/\./g,"'") + ' L';
  }
  function fmtKg(n) {
    return Math.round(Number(n||0)).toLocaleString('it-IT').replace(/\./g,"'") + ' kg';
  }

  // ── Precarica ultime densità usate da das_documenti ──────────────
  async function _caricaUltimeDensita(prodotti) {
    var out = {};
    // Query in parallelo, una per prodotto (limit 1 ciascuna)
    var promises = prodotti.map(function(p) {
      return sb.from('das_documenti')
        .select('densita_ambiente, densita_15, data')
        .eq('prodotto', p)
        .order('data', { ascending: false })
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
    });
    var results = await Promise.all(promises);
    results.forEach(function(r, i) {
      var p = prodotti[i];
      if (r && r.data) {
        out[p] = {
          amb: Number(r.data.densita_ambiente),
          d15: Number(r.data.densita_15),
          dataUltimo: r.data.data,
          fonte: 'storico'
        };
      } else {
        var def = DEFAULTS[p] || { amb:826.20, d15:828.90 };
        out[p] = { amb: def.amb, d15: def.d15, fonte: 'standard' };
      }
    });
    return out;
  }

  // ── Validazione ───────────────────────────────────────────────────
  function _valida(prodotto, amb, d15) {
    var r = RANGE[prodotto] || RANGE_FALLBACK;
    var errors = [];   // blocco hard
    var warnings = []; // soft warning

    if (!isFinite(amb) || amb <= 0) errors.push('Densità ambiente non valida');
    if (!isFinite(d15) || d15 <= 0) errors.push('Densità 15°C non valida');
    if (errors.length) return { errors: errors, warnings: warnings };

    if (amb < r.hard[0] || amb > r.hard[1]) errors.push('Densità ambiente fuori range plausibile (' + r.hard[0] + '–' + r.hard[1] + ')');
    if (d15 < r.hard[0] || d15 > r.hard[1]) errors.push('Densità 15°C fuori range plausibile (' + r.hard[0] + '–' + r.hard[1] + ')');

    if (amb < r.soft[0] || amb > r.soft[1]) warnings.push('Densità ambiente fuori range tipico (' + r.soft[0] + '–' + r.soft[1] + ')');
    if (d15 < r.soft[0] || d15 > r.soft[1]) warnings.push('Densità 15°C fuori range tipico (' + r.soft[0] + '–' + r.soft[1] + ')');

    var delta = Math.abs(amb - d15) / d15;
    if (delta > MAX_DELTA_PCT) errors.push('Differenza amb/15° troppo elevata (' + (delta*100).toFixed(1) + '% — max ' + (MAX_DELTA_PCT*100) + '%)');

    return { errors: errors, warnings: warnings };
  }

  // ── Entry point ──────────────────────────────────────────────────
  window.pfApriPopupDensita = async function(ordiniCarico, onConfirm, onCancel) {
    if (!ordiniCarico || !ordiniCarico.length) {
      if (onCancel) onCancel();
      return;
    }

    // Raggruppa ordini per prodotto
    var perProdotto = {};
    ordiniCarico.forEach(function(o) {
      var p = o.prodotto;
      if (!perProdotto[p]) perProdotto[p] = { litri: 0, nOrdini: 0 };
      perProdotto[p].litri += Number(o.litri || 0);
      perProdotto[p].nOrdini++;
    });
    var prodotti = Object.keys(perProdotto);

    // Apre overlay con loader mentre carichiamo lo storico
    _openOverlay();
    _renderLoading();

    try {
      var ultimi = await _caricaUltimeDensita(prodotti);
      _st = {
        prodotti: prodotti,
        perProdotto: perProdotto,
        valori: ultimi,     // { [prodotto]: { amb, d15, fonte, dataUltimo } }
        confirmCbs: { ok: onConfirm, cancel: onCancel },
        warningsAccepted: {}  // track conferme soft warnings
      };
      _render();
    } catch (err) {
      _renderError(err);
    }
  };

  // ── Overlay & render ─────────────────────────────────────────────
  function _openOverlay() {
    var ex = document.getElementById('das-dens-overlay');
    if (ex) ex.remove();
    var div = document.createElement('div');
    div.id = 'das-dens-overlay';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1006;display:flex;align-items:center;justify-content:center;padding:16px';
    div.innerHTML = '<div style="background:var(--bg-card);width:100%;max-width:640px;max-height:92vh;overflow:auto;border-radius:12px;position:relative;box-shadow:0 10px 40px rgba(0,0,0,0.3)"><div id="das-dens-body" style="padding:22px"></div></div>';
    div.addEventListener('click', function(e){ if (e.target === div) _chiudiECancella(); });
    document.body.appendChild(div);
  }

  function _chiudiOverlay() {
    var ex = document.getElementById('das-dens-overlay');
    if (ex) ex.remove();
  }

  function _chiudiECancella() {
    var cb = _st && _st.confirmCbs && _st.confirmCbs.cancel;
    _st = null;
    _chiudiOverlay();
    if (cb) cb();
  }

  function _renderLoading() {
    var body = document.getElementById('das-dens-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:50px 20px;text-align:center"><div style="font-size:28px;margin-bottom:10px">⏳</div><div style="color:var(--text-muted);font-size:13px">Carico ultime densità usate...</div></div>';
  }

  function _renderError(err) {
    var body = document.getElementById('das-dens-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:30px 20px;text-align:center"><div style="font-size:28px;margin-bottom:10px">⚠️</div><div style="color:#A32D2D;font-size:14px;margin-bottom:10px"><strong>Errore caricamento densità</strong></div><div style="color:var(--text-muted);font-size:12px;font-family:var(--font-mono);background:var(--bg);padding:10px 14px;border-radius:6px">' + esc(err.message || String(err)) + '</div><button onclick="_dasDensChiudi()" style="margin-top:16px;padding:9px 18px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">Chiudi</button></div>';
  }

  function _render() {
    var body = document.getElementById('das-dens-body');
    if (!body || !_st) return;

    var h = '';

    // Header
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;margin-bottom:4px">';
    h += '  <div>';
    h += '    <div style="font-size:17px;font-weight:700;margin-bottom:4px">Densità per generazione DAS</div>';
    h += '    <div style="font-size:12px;color:var(--text-muted)">' + _st.prodotti.length + ' ' + (_st.prodotti.length === 1 ? 'prodotto' : 'prodotti') + ' · inserisci le densità misurate al carico</div>';
    h += '  </div>';
    h += '  <button onclick="_dasDensChiudi()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);padding:2px 8px;line-height:1">×</button>';
    h += '</div>';
    h += '<div style="font-size:11px;color:var(--text-muted);margin:10px 0 16px;line-height:1.5;padding:10px 12px;background:var(--bg);border-radius:6px;border-left:3px solid #378ADD">💡 Valori proposti = <strong>ultima densità usata</strong> per quel prodotto in un DAS precedente. Se il prodotto non è mai stato caricato, partiamo dai valori standard di tabella.</div>';

    // Card per prodotto
    _st.prodotti.forEach(function(p) {
      h += _renderCardProdotto(p);
    });

    // Action buttons
    var errTot = _countErrori();
    var btnDisabled = errTot > 0;
    h += '<div style="display:flex;gap:10px;margin-top:18px">';
    h += '  <button onclick="_dasDensAnnulla()" style="flex:1;height:42px;padding:0 14px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text-muted);cursor:pointer;font-size:13px;font-weight:500">Annulla creazione</button>';
    h += '  <button ' + (btnDisabled ? 'disabled' : '') + ' onclick="_dasDensConferma()" style="flex:2;height:42px;padding:0 14px;border:none;border-radius:8px;background:' + (btnDisabled ? '#ccc' : '#BA7517') + ';color:#fff;cursor:' + (btnDisabled ? 'not-allowed' : 'pointer') + ';font-size:13px;font-weight:600;' + (btnDisabled ? '' : 'box-shadow:0 2px 8px rgba(186,117,23,0.35)') + '">▶ Genera DAS e crea carico</button>';
    h += '</div>';

    if (errTot > 0) {
      h += '<div style="margin-top:10px;font-size:11px;color:#791F1F;text-align:center;font-weight:500">⚠️ Correggi gli errori bloccanti prima di procedere</div>';
    }

    body.innerHTML = h;
  }

  function _renderCardProdotto(p) {
    var col = COLORI[p] || DEFAULT_COL;
    var dati = _st.perProdotto[p];
    var v = _st.valori[p] || { amb: 0, d15: 0, fonte: 'standard' };
    var val = _valida(p, v.amb, v.d15);

    // Anteprima calcolo: litri_15 = litri * amb / d15, pesoKg = litri * amb / 1000
    var litri15 = (v.amb && v.d15) ? Math.round(dati.litri * v.amb / v.d15) : null;
    var pesoKg = (v.amb) ? Math.round(dati.litri * v.amb / 1000) : null;

    var fonteLab;
    if (v.fonte === 'storico') {
      var d = v.dataUltimo ? v.dataUltimo.split('-').reverse().join('/') : '';
      fonteLab = '🕑 ultima usata' + (d ? ' il ' + d : '');
    } else {
      fonteLab = '📋 valore standard (nessuno storico)';
    }

    var h = '';
    h += '<div style="background:' + col.bg + ';border-left:3px solid ' + col.brd + ';border-radius:0 8px 8px 0;padding:14px 16px;margin-bottom:12px">';

    // Intestazione card
    h += '  <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:12px">';
    h += '    <div>';
    h += '      <div style="font-size:13px;font-weight:700;color:' + col.txtDark + ';text-transform:uppercase;letter-spacing:0.3px">' + esc(p) + '</div>';
    h += '      <div style="font-size:10px;color:' + col.txtMid + ';margin-top:2px">' + dati.nOrdini + ' ' + (dati.nOrdini === 1 ? 'ordine' : 'ordini') + ' · ' + fonteLab + '</div>';
    h += '    </div>';
    h += '    <div style="text-align:right">';
    h += '      <div style="font-size:10px;color:' + col.txtMid + ';text-transform:uppercase;letter-spacing:0.4px;font-weight:500">Litri ambiente</div>';
    h += '      <div style="font-family:var(--font-mono);font-size:17px;font-weight:700;color:' + col.txtDark + '">' + fmtL(dati.litri) + '</div>';
    h += '    </div>';
    h += '  </div>';

    // Input densità
    var prodId = p.replace(/\s+/g, '_');
    h += '  <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
    h += '    <div>';
    h += '      <label style="display:block;font-size:10px;color:' + col.txtMid + ';text-transform:uppercase;letter-spacing:0.4px;font-weight:600;margin-bottom:4px">Densità ambiente (kg/m³)</label>';
    h += '      <input type="number" id="dens-amb-' + esc(prodId) + '" value="' + v.amb + '" step="0.01" min="100" max="2000" onchange="_dasDensAggiorna(\'' + esc(p) + '\',\'amb\',this.value)" style="width:100%;height:36px;font-family:var(--font-mono);font-size:15px;font-weight:600;padding:0 10px;border:1px solid ' + col.brd + ';border-radius:6px;background:#fff;color:' + col.txtDark + ';outline:none"/>';
    h += '    </div>';
    h += '    <div>';
    h += '      <label style="display:block;font-size:10px;color:' + col.txtMid + ';text-transform:uppercase;letter-spacing:0.4px;font-weight:600;margin-bottom:4px">Densità a 15°C (kg/m³)</label>';
    h += '      <input type="number" id="dens-d15-' + esc(prodId) + '" value="' + v.d15 + '" step="0.01" min="100" max="2000" onchange="_dasDensAggiorna(\'' + esc(p) + '\',\'d15\',this.value)" style="width:100%;height:36px;font-family:var(--font-mono);font-size:15px;font-weight:600;padding:0 10px;border:1px solid ' + col.brd + ';border-radius:6px;background:#fff;color:' + col.txtDark + ';outline:none"/>';
    h += '    </div>';
    h += '  </div>';

    // Anteprima / errori / warning
    h += '  <div style="margin-top:10px;padding-top:10px;border-top:0.5px solid rgba(0,0,0,0.1);font-size:11px">';

    if (val.errors.length) {
      h += '<div style="background:rgba(163,45,45,0.08);border:0.5px solid #A32D2D;border-radius:5px;padding:6px 10px;color:#791F1F">';
      h += '<strong>⛔ Blocco:</strong> ' + val.errors.map(esc).join(' · ');
      h += '</div>';
    } else {
      // Anteprima solo se no errori
      h += '<div style="display:flex;justify-content:space-between;color:' + col.txtMid + '">';
      h += '<span>Anteprima calcolo DAS:</span>';
      h += '<span style="font-family:var(--font-mono);font-weight:600">' + fmtL(litri15) + ' @ 15°C · ' + fmtKg(pesoKg) + ' netti</span>';
      h += '</div>';
    }

    if (val.warnings.length && !val.errors.length) {
      h += '<div style="margin-top:6px;background:rgba(212,160,23,0.1);border:0.5px solid #D4A017;border-radius:5px;padding:6px 10px;color:#7A5B0B">';
      h += '<strong>⚠️ Attenzione:</strong> ' + val.warnings.map(esc).join(' · ') + ' — verrà chiesta conferma al salvataggio';
      h += '</div>';
    }

    h += '  </div>';
    h += '</div>';
    return h;
  }

  function _countErrori() {
    if (!_st) return 0;
    var n = 0;
    _st.prodotti.forEach(function(p) {
      var v = _st.valori[p];
      if (!v) { n++; return; }
      var val = _valida(p, v.amb, v.d15);
      n += val.errors.length;
    });
    return n;
  }

  // ── Handlers ─────────────────────────────────────────────────────
  window._dasDensAggiorna = function(prodotto, campo, val) {
    if (!_st || !_st.valori[prodotto]) return;
    var n = parseFloat(val);
    if (isNaN(n)) n = 0;
    _st.valori[prodotto][campo] = n;
    _st.valori[prodotto].fonte = 'modificato';
    // reset warning accepted se cambiano i valori
    _st.warningsAccepted[prodotto] = false;
    _render();
  };

  window._dasDensAnnulla = function() {
    _chiudiECancella();
  };
  window._dasDensChiudi = function() {
    _chiudiECancella();
  };

  window._dasDensConferma = function() {
    if (!_st) return;
    if (_countErrori() > 0) { toast('Correggi gli errori bloccanti prima di procedere'); return; }

    // Verifica warnings: se ci sono warnings, chiedi conferma una volta
    var warningsList = [];
    _st.prodotti.forEach(function(p) {
      var v = _st.valori[p];
      var val = _valida(p, v.amb, v.d15);
      if (val.warnings.length) warningsList.push({ prodotto: p, msgs: val.warnings });
    });

    if (warningsList.length && !_st.warningsAllAccepted) {
      var msg = 'Alcuni valori sono fuori dal range tipico:\n\n';
      warningsList.forEach(function(w) {
        msg += '• ' + w.prodotto + ': ' + w.msgs.join(', ') + '\n';
      });
      msg += '\nProseguire comunque?';
      if (!confirm(msg)) return;
      _st.warningsAllAccepted = true;
    }

    // Costruisci payload per onConfirm
    var payload = {};
    _st.prodotti.forEach(function(p) {
      var v = _st.valori[p];
      payload[p] = { amb: v.amb, d15: v.d15 };
    });

    var cb = _st.confirmCbs.ok;
    _st = null;
    _chiudiOverlay();
    if (cb) cb(payload);
  };

})();
