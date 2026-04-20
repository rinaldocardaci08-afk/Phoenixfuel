// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Dettaglio movimenti Deposito (riassunto periodo)
// TURNO 1/3: punto di ingresso + mini-modale filtri
//
// Apertura via pulsante "📊 Dettaglio movimenti Deposito" in dep-giacenze.
// Mini-modale permette di scegliere:
//   - Tab "Per periodo"  (Da/A con picker + frecce ◀/▶ giorno)
//   - Tab "Per mese"     (Mese/Anno con frecce ◀/▶)
//   - Multi-select prodotti con "Tutti"
//
// "▶ Visualizza" chiude il mini-modale e chiama pfMvtDettMostra(cfg)
// che al turno 1 è un placeholder. Il render completo arriva al turno 2.
//
// Prefisso funzioni/variabili: pfMvtDett*, _pfMvtDett* (no collisioni
// con pfMovimentiTotali / pfMovimenti* esistenti).
// ═══════════════════════════════════════════════════════════════════

(function(){
  var PRODOTTI_ORDINE = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO','AdBlue'];
  var MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
              'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  // ── Stato corrente del mini-modale (persiste tra riaperture) ─────
  var _stato = null;

  function _statoIniziale() {
    var oggi = new Date();
    var y = oggi.getFullYear();
    return {
      modo: 'periodo',              // 'periodo' | 'mese'
      da: y + '-01-01',             // ISO
      a: oggi.toISOString().split('T')[0],
      mese: oggi.getMonth(),        // 0-11
      anno: y,
      prodotti: [],                 // popolato async da DB
      prodottiDisponibili: []
    };
  }

  // ── Utility formato data italiano ────────────────────────────────
  function _fmtIT(iso) {
    if (!iso) return '—';
    var p = iso.split('-');
    return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : iso;
  }
  function _shiftISO(iso, giorni) {
    var d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + giorni);
    return d.toISOString().split('T')[0];
  }
  function esc2(s) {
    return String(s == null ? '' : s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ── Carica prodotti disponibili da cisterne deposito ─────────────
  async function _caricaProdotti() {
    try {
      var { data } = await sb.from('cisterne').select('prodotto').eq('sede','deposito_vibo');
      var set = {};
      (data || []).forEach(function(c){ if (c.prodotto) set[c.prodotto] = true; });
      var ord = PRODOTTI_ORDINE.filter(function(p){ return set[p]; });
      Object.keys(set).forEach(function(p){ if (ord.indexOf(p) < 0) ord.push(p); });
      return ord;
    } catch(e) { return PRODOTTI_ORDINE.slice(); }
  }

  // ── Apertura mini-modale (entry point) ───────────────────────────
  async function pfMvtDettApri() {
    if (!_stato) _stato = _statoIniziale();
    if (!_stato.prodottiDisponibili.length) {
      _stato.prodottiDisponibili = await _caricaProdotti();
      _stato.prodotti = _stato.prodottiDisponibili.slice(); // default: tutti
    }
    _render();
  }

  // ── Render mini-modale ───────────────────────────────────────────
  function _render() {
    var s = _stato;
    var tabBtnStyle = 'flex:1;padding:10px 14px;border:0.5px solid var(--border);cursor:pointer;font-size:13px;font-weight:600;font-family:var(--font)';
    var tabAttivo = 'background:#D4A017;color:#fff;border-color:#D4A017';
    var tabInattivo = 'background:var(--bg);color:var(--text-muted)';

    var h = '';
    h += '<div style="max-width:520px">';
    h += '  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px">';
    h += '    <h3 style="margin:0;font-size:17px">📊 Dettaglio movimenti Deposito</h3>';
    h += '    <button onclick="chiudiModal()" style="background:none;border:none;font-size:22px;cursor:pointer;color:var(--text-muted);padding:2px 8px;line-height:1">×</button>';
    h += '  </div>';
    h += '  <div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Seleziona il periodo e i prodotti, poi visualizza il riepilogo dettagliato.</div>';

    // ── Tab periodo / mese ────────────────────────────────────────
    h += '  <div style="display:flex;gap:0;margin-bottom:16px;border-radius:6px;overflow:hidden">';
    h += '    <button onclick="_pfMvtDettSetModo(\'periodo\')" style="' + tabBtnStyle + ';border-radius:6px 0 0 6px;' + (s.modo === 'periodo' ? tabAttivo : tabInattivo) + '">📅 Per periodo</button>';
    h += '    <button onclick="_pfMvtDettSetModo(\'mese\')" style="' + tabBtnStyle + ';border-left:none;border-radius:0 6px 6px 0;' + (s.modo === 'mese' ? tabAttivo : tabInattivo) + '">📆 Per mese</button>';
    h += '  </div>';

    // ── Pannello filtri in base al modo ───────────────────────────
    if (s.modo === 'periodo') {
      h += _renderPannelloPeriodo(s);
    } else {
      h += _renderPannelloMese(s);
    }

    // ── Multi-select prodotti ─────────────────────────────────────
    h += '  <div style="margin-top:18px;margin-bottom:12px">';
    h += '    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-muted);font-weight:600;margin-bottom:8px">Prodotti</div>';

    var tuttiSel = s.prodotti.length === s.prodottiDisponibili.length && s.prodottiDisponibili.length > 0;
    h += '    <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;border:0.5px solid var(--border);border-radius:6px;background:' + (tuttiSel ? 'rgba(212,160,23,0.08)' : 'var(--bg)') + ';cursor:pointer;margin-bottom:6px">';
    h += '      <input type="checkbox" ' + (tuttiSel ? 'checked' : '') + ' onchange="_pfMvtDettToggleTutti()"/>';
    h += '      <span style="font-weight:600;font-size:13px">Tutti i prodotti</span>';
    h += '    </label>';

    h += '    <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-top:6px">';
    s.prodottiDisponibili.forEach(function(p) {
      var sel = s.prodotti.indexOf(p) >= 0;
      h += '<label style="display:flex;align-items:center;gap:8px;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:' + (sel ? 'rgba(212,160,23,0.06)' : 'var(--bg)') + ';cursor:pointer;font-size:12px">';
      h += '<input type="checkbox" ' + (sel ? 'checked' : '') + ' onchange="_pfMvtDettToggleProd(\'' + esc2(p) + '\')"/>';
      h += '<span>' + esc2(p) + '</span>';
      h += '</label>';
    });
    h += '    </div>';
    h += '  </div>';

    // ── Action buttons ────────────────────────────────────────────
    h += '  <div style="display:flex;gap:8px;margin-top:20px">';
    h += '    <button onclick="chiudiModal()" style="flex:1;padding:11px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;font-size:13px">Annulla</button>';
    var disabled = s.prodotti.length === 0;
    h += '    <button ' + (disabled ? 'disabled' : '') + ' onclick="_pfMvtDettConfermaFiltri()" style="flex:2;padding:11px;border:none;border-radius:6px;background:' + (disabled ? '#ccc' : '#D4A017') + ';color:#fff;cursor:' + (disabled ? 'not-allowed' : 'pointer') + ';font-size:13px;font-weight:600">▶ Visualizza</button>';
    h += '  </div>';
    h += '</div>';

    apriModal(h);
  }

  // ── Pannello "Per periodo" ───────────────────────────────────────
  function _renderPannelloPeriodo(s) {
    var h = '';
    h += '<div style="border:0.5px solid var(--border);border-radius:8px;padding:14px;background:var(--bg)">';

    // Data DA
    h += '  <div style="margin-bottom:12px">';
    h += '    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Dal</div>';
    h += '    <div style="display:flex;gap:6px;align-items:center">';
    h += '      <button onclick="_pfMvtDettShiftData(\'da\',-1)" title="Giorno precedente" style="padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-weight:600">◀</button>';
    h += '      <input type="date" value="' + s.da + '" onchange="_pfMvtDettSetData(\'da\',this.value)" style="flex:1;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;font-size:13px"/>';
    h += '      <button onclick="_pfMvtDettShiftData(\'da\',1)" title="Giorno successivo" style="padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-weight:600">▶</button>';
    h += '      <div style="min-width:90px;text-align:right;font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">' + _fmtIT(s.da) + '</div>';
    h += '    </div>';
    h += '  </div>';

    // Data A
    h += '  <div>';
    h += '    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Al</div>';
    h += '    <div style="display:flex;gap:6px;align-items:center">';
    h += '      <button onclick="_pfMvtDettShiftData(\'a\',-1)" title="Giorno precedente" style="padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-weight:600">◀</button>';
    h += '      <input type="date" value="' + s.a + '" onchange="_pfMvtDettSetData(\'a\',this.value)" style="flex:1;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;font-size:13px"/>';
    h += '      <button onclick="_pfMvtDettShiftData(\'a\',1)" title="Giorno successivo" style="padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-weight:600">▶</button>';
    h += '      <div style="min-width:90px;text-align:right;font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">' + _fmtIT(s.a) + '</div>';
    h += '    </div>';
    h += '  </div>';

    // Shortcut periodi
    h += '  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:14px">';
    h += '    <button onclick="_pfMvtDettShortcut(\'oggi\')" style="flex:1;padding:7px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:11px">Oggi</button>';
    h += '    <button onclick="_pfMvtDettShortcut(\'sett\')" style="flex:1;padding:7px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:11px">7 giorni</button>';
    h += '    <button onclick="_pfMvtDettShortcut(\'mese\')" style="flex:1;padding:7px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:11px">30 giorni</button>';
    h += '    <button onclick="_pfMvtDettShortcut(\'anno\')" style="flex:1;padding:7px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-size:11px">Anno</button>';
    h += '  </div>';

    h += '</div>';
    return h;
  }

  // ── Pannello "Per mese" ──────────────────────────────────────────
  function _renderPannelloMese(s) {
    var h = '';
    h += '<div style="border:0.5px solid var(--border);border-radius:8px;padding:14px;background:var(--bg)">';

    // Mese
    h += '  <div style="margin-bottom:12px">';
    h += '    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Mese</div>';
    h += '    <div style="display:flex;gap:6px;align-items:center">';
    h += '      <button onclick="_pfMvtDettShiftMese(-1)" title="Mese precedente" style="padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-weight:600">◀</button>';
    h += '      <select onchange="_pfMvtDettSetMese(this.value)" style="flex:1;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;font-size:13px">';
    MESI.forEach(function(m, i) {
      h += '<option value="' + i + '" ' + (s.mese === i ? 'selected' : '') + '>' + m + '</option>';
    });
    h += '      </select>';
    h += '      <button onclick="_pfMvtDettShiftMese(1)" title="Mese successivo" style="padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-weight:600">▶</button>';
    h += '    </div>';
    h += '  </div>';

    // Anno
    h += '  <div>';
    h += '    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-muted);font-weight:600;margin-bottom:6px">Anno</div>';
    h += '    <div style="display:flex;gap:6px;align-items:center">';
    h += '      <button onclick="_pfMvtDettShiftAnno(-1)" title="Anno precedente" style="padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-weight:600">◀</button>';
    h += '      <input type="number" min="2020" max="2100" value="' + s.anno + '" onchange="_pfMvtDettSetAnno(this.value)" style="flex:1;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;font-size:13px;text-align:center"/>';
    h += '      <button onclick="_pfMvtDettShiftAnno(1)" title="Anno successivo" style="padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:#fff;cursor:pointer;font-weight:600">▶</button>';
    h += '    </div>';
    h += '  </div>';

    // Anteprima range calcolato
    var ini = _primoGiornoMese(s.anno, s.mese);
    var fin = _ultimoGiornoMese(s.anno, s.mese);
    h += '  <div style="margin-top:14px;padding:10px 12px;background:rgba(212,160,23,0.08);border-radius:6px;font-size:12px;color:var(--text)">';
    h += '    <span style="color:var(--text-muted)">Periodo:</span> ';
    h += '    <span style="font-weight:600;font-family:var(--font-mono)">' + _fmtIT(ini) + ' → ' + _fmtIT(fin) + '</span>';
    h += '  </div>';

    h += '</div>';
    return h;
  }

  function _primoGiornoMese(anno, mese) {
    var m = String(mese + 1).padStart(2, '0');
    return anno + '-' + m + '-01';
  }
  function _ultimoGiornoMese(anno, mese) {
    var d = new Date(Date.UTC(anno, mese + 1, 0));
    return d.toISOString().split('T')[0];
  }

  // ── Handlers (esposti globalmente via window) ────────────────────
  window._pfMvtDettSetModo = function(m) { _stato.modo = m; _render(); };

  window._pfMvtDettSetData = function(campo, val) {
    if (!val) return;
    _stato[campo] = val;
    if (_stato.da > _stato.a) {
      // swap automatico per evitare range invertiti
      if (campo === 'da') _stato.a = _stato.da;
      else _stato.da = _stato.a;
    }
    _render();
  };

  window._pfMvtDettShiftData = function(campo, giorni) {
    _stato[campo] = _shiftISO(_stato[campo], giorni);
    if (_stato.da > _stato.a) {
      if (campo === 'da') _stato.a = _stato.da;
      else _stato.da = _stato.a;
    }
    _render();
  };

  window._pfMvtDettShortcut = function(tipo) {
    var oggi = new Date();
    var y = oggi.getFullYear();
    _stato.a = oggi.toISOString().split('T')[0];
    if (tipo === 'oggi') _stato.da = _stato.a;
    else if (tipo === 'sett') _stato.da = _shiftISO(_stato.a, -6);
    else if (tipo === 'mese') _stato.da = _shiftISO(_stato.a, -29);
    else if (tipo === 'anno') _stato.da = y + '-01-01';
    _render();
  };

  window._pfMvtDettSetMese = function(m) { _stato.mese = parseInt(m, 10); _render(); };
  window._pfMvtDettSetAnno = function(a) {
    var v = parseInt(a, 10);
    if (isNaN(v) || v < 2020 || v > 2100) return;
    _stato.anno = v; _render();
  };
  window._pfMvtDettShiftMese = function(delta) {
    var m = _stato.mese + delta;
    var a = _stato.anno;
    if (m < 0) { m = 11; a--; }
    else if (m > 11) { m = 0; a++; }
    _stato.mese = m; _stato.anno = a; _render();
  };
  window._pfMvtDettShiftAnno = function(delta) {
    _stato.anno = _stato.anno + delta; _render();
  };

  window._pfMvtDettToggleTutti = function() {
    if (_stato.prodotti.length === _stato.prodottiDisponibili.length) {
      _stato.prodotti = [];
    } else {
      _stato.prodotti = _stato.prodottiDisponibili.slice();
    }
    _render();
  };

  window._pfMvtDettToggleProd = function(p) {
    var i = _stato.prodotti.indexOf(p);
    if (i >= 0) _stato.prodotti.splice(i, 1);
    else _stato.prodotti.push(p);
    _render();
  };

  // ── Conferma filtri → chiama pfMvtDettMostra (TURNO 2) ───────────
  window._pfMvtDettConfermaFiltri = function() {
    var s = _stato;
    if (s.prodotti.length === 0) { toast('Seleziona almeno un prodotto'); return; }

    var cfg;
    if (s.modo === 'periodo') {
      cfg = { da: s.da, a: s.a, prodotti: s.prodotti.slice(), etichetta: _etichettaPeriodo(s.da, s.a) };
    } else {
      var ini = _primoGiornoMese(s.anno, s.mese);
      var fin = _ultimoGiornoMese(s.anno, s.mese);
      cfg = { da: ini, a: fin, prodotti: s.prodotti.slice(), etichetta: MESI[s.mese] + ' ' + s.anno };
    }

    chiudiModal();
    setTimeout(function(){ pfMvtDettMostra(cfg); }, 120);
  };

  function _etichettaPeriodo(da, a) {
    if (da === a) return _fmtIT(da);
    return _fmtIT(da) + ' → ' + _fmtIT(a);
  }

  // ── TURNO 2 placeholder ──────────────────────────────────────────
  // Verrà sostituito al prossimo turno con il render 3 colonne completo.
  window.pfMvtDettMostra = function(cfg) {
    var prodLabel = cfg.prodotti.length === 1 ? cfg.prodotti[0] :
                    (cfg.prodotti.length + ' prodotti selezionati');
    var h = '';
    h += '<div style="max-width:540px;text-align:center;padding:20px">';
    h += '  <div style="font-size:40px;margin-bottom:10px">🚧</div>';
    h += '  <h3 style="margin:0 0 14px">Report dettaglio — in costruzione</h3>';
    h += '  <div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:14px;text-align:left;font-size:13px;margin-bottom:14px">';
    h += '    <div style="margin-bottom:6px"><span style="color:var(--text-muted)">Periodo:</span> <strong>' + esc2(cfg.etichetta) + '</strong></div>';
    h += '    <div style="margin-bottom:6px"><span style="color:var(--text-muted)">Deposito:</span> <strong>Vibo Valentia</strong></div>';
    h += '    <div><span style="color:var(--text-muted)">Prodotti:</span> <strong>' + esc2(prodLabel) + '</strong></div>';
    h += '  </div>';
    h += '  <div style="font-size:12px;color:var(--text-muted);line-height:1.5">Il render 3 colonne (Entrate / Uscite / Riassunto) e gli export PDF/Excel arrivano al prossimo turno di sviluppo.</div>';
    h += '  <button onclick="chiudiModal()" style="margin-top:18px;padding:10px 22px;border:none;border-radius:6px;background:#D4A017;color:#fff;cursor:pointer;font-size:13px;font-weight:600">OK</button>';
    h += '</div>';
    apriModal(h);
  };

  // Esporta entry point
  window.pfMvtDettApri = pfMvtDettApri;
})();
