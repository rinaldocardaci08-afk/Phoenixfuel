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

  // ── TURNO 2: Render report completo 3 colonne ────────────────────
  // Palette colori prodotto (allineata a pf-deposito.js)
  var COLORI_PROD = {
    'Gasolio Autotrazione':'#D4A017', 'Benzina':'#639922',
    'Gasolio Agricolo':'#6B5FCC', 'HVO':'#1D9E75', 'AdBlue':'#888'
  };

  // Stato del report attivo (per toggle sezioni senza rifetchare)
  var _report = null;

  function _isPhoenixFornitore(f) {
    var s = (f || '').toLowerCase();
    return s.indexOf('phoenix') >= 0 || s.indexOf('deposito') >= 0;
  }

  function _fmtL(n) {
    return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 }).replace(/\./g, "'") + ' L';
  }
  function _fmtLSigned(n) {
    var v = Math.round(Number(n || 0));
    if (v === 0) return '0 L';
    return (v > 0 ? '+' : '−') + _fmtL(Math.abs(v));
  }

  // ── Fetch parallelo di tutti i gruppi ────────────────────────────
  async function _fetchReportData(cfg) {
    var STATI = ['confermato','consegnato'];
    var prods = cfg.prodotti;

    var qAcquisti = sb.from('ordini')
      .select('id,data,fornitore,prodotto,litri,basi_carico(nome)')
      .eq('tipo_ordine','entrata_deposito').in('stato', STATI).in('prodotto', prods)
      .neq('fornitore', 'Rientro merce')
      .gte('data', cfg.da).lte('data', cfg.a).order('data');

    var qRientri = sb.from('ordini')
      .select('id,data,prodotto,litri,cliente,note')
      .eq('tipo_ordine','entrata_deposito').in('stato', STATI).in('prodotto', prods)
      .eq('fornitore', 'Rientro merce')
      .gte('data', cfg.da).lte('data', cfg.a).order('data');

    var qRettPlus = sb.from('rettifiche_inventario')
      .select('id,data,differenza,causale,note,prodotto,origine')
      .eq('tipo','deposito').eq('confermata', true).in('prodotto', prods)
      .gt('differenza', 0)
      .gte('data', cfg.da).lte('data', cfg.a).order('data');

    var qVendite = sb.from('ordini')
      .select('id,data,cliente,fornitore,prodotto,litri')
      .eq('tipo_ordine','cliente').in('stato', STATI).in('prodotto', prods)
      .gte('data', cfg.da).lte('data', cfg.a).order('data');

    var qStazione = sb.from('ordini')
      .select('id,data,fornitore,prodotto,litri')
      .eq('tipo_ordine','stazione_servizio').in('stato', STATI).in('prodotto', prods)
      .gte('data', cfg.da).lte('data', cfg.a).order('data');

    var qAuto = sb.from('ordini')
      .select('id,data,prodotto,litri,note')
      .eq('tipo_ordine','autoconsumo').in('stato', STATI).in('prodotto', prods)
      .gte('data', cfg.da).lte('data', cfg.a).order('data');

    var qRettMinus = sb.from('rettifiche_inventario')
      .select('id,data,differenza,causale,note,prodotto,origine')
      .eq('tipo','deposito').eq('confermata', true).in('prodotto', prods)
      .lt('differenza', 0)
      .gte('data', cfg.da).lte('data', cfg.a).order('data');

    var [rAcq, rRie, rRp, rVen, rSta, rAut, rRm] = await Promise.all([
      qAcquisti, qRientri, qRettPlus, qVendite, qStazione, qAuto, qRettMinus
    ]);

    // Filtro Phoenix/Deposito lato client per vendite e stazione
    var vendite = (rVen.data || []).filter(function(o){ return _isPhoenixFornitore(o.fornitore); });
    var stazione = (rSta.data || []).filter(function(o){ return _isPhoenixFornitore(o.fornitore); });

    return {
      acquisti:     rAcq.data || [],
      rientri:      rRie.data || [],
      rettEccedenze: rRp.data || [],
      vendite:      vendite,
      stazione:     stazione,
      autoconsumo:  rAut.data || [],
      rettCali:     rRm.data || []
    };
  }

  // ── Entry point: override del placeholder turno 1 ─────────────────
  window.pfMvtDettMostra = async function(cfg) {
    _openOverlay();
    _renderLoading();
    try {
      var dati = await _fetchReportData(cfg);
      _report = { cfg: cfg, dati: dati, espansi: { acquisti: true, vendite: true } };
      _renderReport();
    } catch (err) {
      _renderError(err);
    }
  };

  // ── Overlay custom (più largo del modale standard) ────────────────
  function _openOverlay() {
    var ex = document.getElementById('mvt-dett-overlay');
    if (ex) ex.remove();
    var div = document.createElement('div');
    div.id = 'mvt-dett-overlay';
    div.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:1005;display:flex;align-items:center;justify-content:center;padding:16px';
    div.innerHTML = '<div id="mvt-dett-box" style="background:var(--bg-card);width:100%;max-width:1400px;max-height:92vh;overflow:auto;border-radius:12px;padding:0;position:relative;box-shadow:0 10px 40px rgba(0,0,0,0.3)"><div id="mvt-dett-body" style="padding:20px 24px"></div></div>';
    // click su backdrop chiude
    div.addEventListener('click', function(e){ if (e.target === div) pfMvtDettChiudi(); });
    document.body.appendChild(div);
  }

  window.pfMvtDettChiudi = function() {
    var ex = document.getElementById('mvt-dett-overlay');
    if (ex) ex.remove();
    _report = null;
  };

  function _renderLoading() {
    var body = document.getElementById('mvt-dett-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:60px 20px;text-align:center"><div style="font-size:32px;margin-bottom:10px">⏳</div><div style="color:var(--text-muted);font-size:13px">Caricamento movimenti in corso...</div></div>';
  }

  function _renderError(err) {
    var body = document.getElementById('mvt-dett-body');
    if (!body) return;
    body.innerHTML = '<div style="padding:40px 20px;text-align:center"><div style="font-size:32px;margin-bottom:10px">⚠️</div><div style="color:#A32D2D;font-size:14px;margin-bottom:10px"><strong>Errore caricamento dati</strong></div><div style="color:var(--text-muted);font-size:12px;font-family:var(--font-mono);background:var(--bg);padding:10px 14px;border-radius:6px;max-width:500px;margin:0 auto">' + esc2(err.message || String(err)) + '</div><button onclick="pfMvtDettChiudi()" style="margin-top:20px;padding:9px 18px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">Chiudi</button></div>';
  }

  // ── Render principale ─────────────────────────────────────────────
  function _renderReport() {
    var body = document.getElementById('mvt-dett-body');
    if (!body || !_report) return;

    var cfg = _report.cfg;
    var d = _report.dati;

    // Totali gruppi
    var totAcq = _sumLitri(d.acquisti);
    var totRie = _sumLitri(d.rientri);
    var totRp = _sumDiff(d.rettEccedenze);
    var totEntrate = totAcq + totRie + totRp;

    var totVen = _sumLitri(d.vendite);
    var totSta = _sumLitri(d.stazione);
    var totAut = _sumLitri(d.autoconsumo);
    var totRm = Math.abs(_sumDiff(d.rettCali));
    var totUscite = totVen + totSta + totAut + totRm;

    var rettNetto = totRp - totRm;
    var saldo = totEntrate - totUscite;

    // Etichetta prodotti
    var prodLabel;
    if (cfg.prodotti.length === 1) prodLabel = cfg.prodotti[0];
    else if (_stato && cfg.prodotti.length === _stato.prodottiDisponibili.length) prodLabel = 'tutti i prodotti';
    else prodLabel = cfg.prodotti.length + ' prodotti';

    var h = '';
    // ── Header ──────────────────────────────────────────────────────
    h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:16px;flex-wrap:wrap;margin-bottom:18px;padding-bottom:14px;border-bottom:2px solid #D4A017">';
    h += '  <div>';
    h += '    <div style="font-size:18px;font-weight:700;margin-bottom:4px">📊 Dettaglio movimenti Deposito</div>';
    h += '    <div style="font-size:13px;color:var(--text-muted)">' + esc2(cfg.etichetta) + ' · Deposito Vibo · ' + esc2(prodLabel) + '</div>';
    h += '  </div>';
    h += '  <div style="display:flex;gap:8px;flex-wrap:wrap">';
    h += '    <button onclick="pfMvtDettApri()" title="Cambia filtri" style="padding:9px 14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;font-size:12px">🎛️ Filtri</button>';
    h += '    <button onclick="pfMvtDettExportPDF()" style="padding:9px 14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;font-size:12px">📄 PDF</button>';
    h += '    <button onclick="pfMvtDettExportExcel()" style="padding:9px 14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;font-size:12px">📊 Excel</button>';
    h += '    <button onclick="pfMvtDettChiudi()" style="padding:9px 14px;border:none;border-radius:6px;background:#D4A017;color:#fff;cursor:pointer;font-size:12px;font-weight:600">✕ Chiudi</button>';
    h += '  </div>';
    h += '</div>';

    // ── 3 colonne ───────────────────────────────────────────────────
    h += '<div style="display:grid;grid-template-columns:1fr 1fr 260px;gap:14px;align-items:start" class="mvt-dett-grid">';

    // Col 1 — ENTRATE
    h += _renderColonna('entrate', 'ENTRATE DEPOSITO', '#639922', 'rgba(99,153,34,0.08)', totEntrate, [
      { key:'acquisti',      label:'Acquisti da fornitori',  tot: totAcq, rows: d.acquisti,      tipo:'acquisti' },
      { key:'rientri',       label:'Rientri merce',          tot: totRie, rows: d.rientri,       tipo:'rientri' },
      { key:'rettEccedenze', label:'Rettifiche eccedenze',   tot: totRp,  rows: d.rettEccedenze, tipo:'rettifica' }
    ], cfg);

    // Col 2 — USCITE
    h += _renderColonna('uscite', 'USCITE DEPOSITO', '#A32D2D', 'rgba(163,45,45,0.08)', totUscite, [
      { key:'vendite',    label:'Vendite a clienti',         tot: totVen, rows: d.vendite,    tipo:'vendite' },
      { key:'stazione',   label:'Consegne a stazione Oppido', tot: totSta, rows: d.stazione,   tipo:'stazione' },
      { key:'autoconsumo',label:'Autoconsumo',               tot: totAut, rows: d.autoconsumo,tipo:'autoconsumo' },
      { key:'rettCali',   label:'Rettifiche cali/ammanchi',  tot: totRm,  rows: d.rettCali,   tipo:'rettifica', segno:-1 }
    ], cfg);

    // Col 3 — RIASSUNTO (sticky)
    h += _renderRiassunto(totEntrate, totVen, totSta, totAut, rettNetto, saldo);

    h += '</div>';

    // Style responsive mobile
    h += '<style>@media (max-width:900px){.mvt-dett-grid{grid-template-columns:1fr !important}}</style>';

    body.innerHTML = h;
  }

  function _sumLitri(rows) {
    return (rows || []).reduce(function(s,r){ return s + Number(r.litri || 0); }, 0);
  }
  function _sumDiff(rows) {
    return (rows || []).reduce(function(s,r){ return s + Number(r.differenza || 0); }, 0);
  }

  // ── Render singola colonna (Entrate o Uscite) ────────────────────
  function _renderColonna(kCol, titolo, colore, bgColore, totale, gruppi, cfg) {
    var h = '';
    h += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">';
    h += '  <div style="padding:12px 14px;background:' + bgColore + ';border-bottom:2px solid ' + colore + '">';
    h += '    <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.6px;color:' + colore + ';font-weight:700">' + titolo + '</div>';
    h += '  </div>';

    gruppi.forEach(function(g, idx) {
      h += _renderGruppo(kCol, g, colore, cfg, idx === gruppi.length - 1);
    });

    // Footer totale colonna
    var segnoT = kCol === 'entrate' ? '+' : '−';
    h += '  <div style="padding:14px;background:' + bgColore + ';border-top:2px solid ' + colore + ';display:flex;justify-content:space-between;align-items:center">';
    h += '    <div style="font-size:12px;text-transform:uppercase;letter-spacing:0.4px;color:' + colore + ';font-weight:700">TOTALE ' + (kCol === 'entrate' ? 'ENTRATE' : 'USCITE') + '</div>';
    h += '    <div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + colore + '">' + segnoT + _fmtL(totale) + '</div>';
    h += '  </div>';

    h += '</div>';
    return h;
  }

  // ── Render singolo gruppo con toggle e lista ─────────────────────
  function _renderGruppo(kCol, g, colore, cfg, isLast) {
    var espanso = !!(_report.espansi && _report.espansi[g.key]);
    var arrow = espanso ? '▼' : '▶';
    var segno = kCol === 'entrate' ? '+' : '−';
    var segnoTot = segno + _fmtL(g.tot);
    var tot = g.rows ? g.rows.length : 0;

    var borderBottom = isLast ? '' : ';border-bottom:0.5px solid var(--border)';
    var h = '';
    h += '  <div style="padding:10px 14px;cursor:pointer;user-select:none' + borderBottom + '" onclick="_pfMvtDettToggleGruppo(\'' + g.key + '\')">';
    h += '    <div style="display:flex;justify-content:space-between;align-items:center;gap:8px">';
    h += '      <div style="display:flex;align-items:center;gap:8px;flex:1;min-width:0">';
    h += '        <span style="color:var(--text-muted);font-size:11px;font-weight:600;width:12px">' + arrow + '</span>';
    h += '        <span style="font-weight:600;font-size:13px">' + esc2(g.label) + '</span>';
    h += '        <span style="font-size:10px;color:var(--text-muted);background:var(--bg);padding:1px 6px;border-radius:10px">' + tot + '</span>';
    h += '      </div>';
    h += '      <div style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:' + colore + ';white-space:nowrap">' + (g.tot === 0 ? '0 L' : segnoTot) + '</div>';
    h += '    </div>';
    h += '  </div>';

    if (espanso) {
      h += '<div style="padding:4px 14px 12px;background:var(--bg)">';
      if (!g.rows || !g.rows.length) {
        h += '<div style="font-size:11px;color:var(--text-muted);text-align:center;padding:10px">Nessun movimento nel periodo</div>';
      } else {
        h += _renderRigheGruppo(kCol, g, colore, cfg);
      }
      h += '</div>';
    }
    return h;
  }

  // ── Render righe lista (prime N + espandi) ───────────────────────
  function _renderRigheGruppo(kCol, g, colore, cfg) {
    var LIMITE = 6;
    var mostraTutte = !!(_report.righeTutte && _report.righeTutte[g.key]);
    var righe = g.rows;
    var nMostrate = mostraTutte ? righe.length : Math.min(LIMITE, righe.length);
    var h = '';
    h += '<div style="display:flex;flex-direction:column;gap:3px">';
    for (var i = 0; i < nMostrate; i++) {
      h += _renderRigaMovimento(kCol, g, righe[i], cfg);
    }
    if (!mostraTutte && righe.length > LIMITE) {
      var altre = righe.length - LIMITE;
      h += '<div onclick="_pfMvtDettMostraTutte(\'' + g.key + '\')" style="padding:6px 10px;text-align:center;font-size:11px;color:var(--text-muted);cursor:pointer;font-style:italic;border:0.5px dashed var(--border);border-radius:6px;margin-top:4px">... altre ' + altre + ' righe (mostra tutte)</div>';
    } else if (mostraTutte && righe.length > LIMITE) {
      h += '<div onclick="_pfMvtDettMostraTutte(\'' + g.key + '\')" style="padding:6px 10px;text-align:center;font-size:11px;color:var(--text-muted);cursor:pointer;font-style:italic;border:0.5px dashed var(--border);border-radius:6px;margin-top:4px">▲ mostra solo prime ' + LIMITE + '</div>';
    }
    h += '</div>';
    return h;
  }

  // ── Render singola riga di movimento ─────────────────────────────
  function _renderRigaMovimento(kCol, g, r, cfg) {
    var data = _fmtIT(r.data);
    var litri = g.tipo === 'rettifica' ? Math.abs(Number(r.differenza || 0)) : Number(r.litri || 0);
    var segno = kCol === 'entrate' ? '+' : '−';
    var prodotto = r.prodotto || '';
    var colProd = COLORI_PROD[prodotto] || '#888';
    var showBadge = cfg.prodotti.length > 1;

    // Costruisce la colonna "descrizione" in base al tipo
    var desc = '';
    if (g.tipo === 'acquisti') {
      var base = r.basi_carico && r.basi_carico.nome ? r.basi_carico.nome : '';
      desc = esc2(r.fornitore || '—') + (base ? ' · <span style="color:var(--text-muted);font-size:10px">' + esc2(base) + '</span>' : '');
    } else if (g.tipo === 'rientri') {
      desc = '<span style="color:var(--text-muted)">da</span> ' + esc2(r.cliente || (r.note || 'rientro'));
    } else if (g.tipo === 'vendite') {
      desc = esc2(r.cliente || '—');
    } else if (g.tipo === 'stazione') {
      desc = 'Stazione Oppido';
    } else if (g.tipo === 'autoconsumo') {
      desc = 'Autoconsumo' + (r.note ? ' <span style="color:var(--text-muted);font-size:10px">· ' + esc2(r.note) + '</span>' : '');
    } else if (g.tipo === 'rettifica') {
      var caus = _labelCausale(r.causale);
      var orig = r.origine === 'chiusura_mese' ? ' · chiusura mese' : '';
      desc = caus + '<span style="color:var(--text-muted);font-size:10px">' + orig + '</span>';
    }

    var h = '';
    h += '<div style="display:grid;grid-template-columns:56px 1fr auto;gap:8px;align-items:center;padding:5px 8px;background:var(--bg-card);border-radius:5px;font-size:12px">';
    h += '  <div style="font-family:var(--font-mono);color:var(--text-muted);font-size:11px">' + data + '</div>';
    h += '  <div style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">';
    if (showBadge) {
      h += '<span style="display:inline-block;width:8px;height:8px;border-radius:2px;background:' + colProd + ';margin-right:6px;vertical-align:middle" title="' + esc2(prodotto) + '"></span>';
    }
    h += desc;
    h += '  </div>';
    h += '  <div style="font-family:var(--font-mono);font-weight:600;color:' + (kCol === 'entrate' ? '#27500A' : '#791F1F') + ';white-space:nowrap">' + segno + _fmtL(litri) + '</div>';
    h += '</div>';
    return h;
  }

  function _labelCausale(c) {
    var map = {
      cali_viaggio:'Cali viaggio', cali_tecnici:'Cali tecnici',
      eccedenze_viaggio:'Eccedenze viaggio', scatti_vuoto:'Scatti a vuoto',
      manuale:'Manuale', altro:'Altro'
    };
    return map[c] || (c || 'Rettifica');
  }

  // ── Render riassunto periodo (colonna sticky) ────────────────────
  function _renderRiassunto(totEntrate, totVen, totSta, totAut, rettNetto, saldo) {
    var h = '';
    h += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;padding:14px;position:sticky;top:0">';
    h += '  <div style="font-size:11px;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-muted);font-weight:600;margin-bottom:10px;padding-bottom:8px;border-bottom:0.5px solid var(--border)">Riassunto periodo</div>';

    h += '  <div style="margin-bottom:10px">';
    h += '    <div style="font-size:10px;color:#27500A;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;margin-bottom:2px">Entrate totali</div>';
    h += '    <div style="font-family:var(--font-mono);font-size:15px;font-weight:700;color:#27500A">+' + _fmtL(totEntrate) + '</div>';
    h += '  </div>';

    h += '  <div style="margin-bottom:8px">';
    h += '    <div style="font-size:10px;color:#791F1F;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;margin-bottom:2px">Uscite clienti</div>';
    h += '    <div style="font-family:var(--font-mono);font-size:13px;color:#791F1F">−' + _fmtL(totVen) + '</div>';
    h += '  </div>';

    h += '  <div style="margin-bottom:8px">';
    h += '    <div style="font-size:10px;color:#791F1F;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;margin-bottom:2px">Uscite stazione</div>';
    h += '    <div style="font-family:var(--font-mono);font-size:13px;color:#791F1F">−' + _fmtL(totSta) + '</div>';
    h += '  </div>';

    h += '  <div style="margin-bottom:8px">';
    h += '    <div style="font-size:10px;color:#791F1F;text-transform:uppercase;letter-spacing:0.3px;font-weight:600;margin-bottom:2px">Uscite autoconsumo</div>';
    h += '    <div style="font-family:var(--font-mono);font-size:13px;color:#791F1F">−' + _fmtL(totAut) + '</div>';
    h += '  </div>';

    var rettCol = rettNetto >= 0 ? '#27500A' : '#791F1F';
    h += '  <div style="margin-bottom:12px">';
    h += '    <div style="font-size:10px;color:' + rettCol + ';text-transform:uppercase;letter-spacing:0.3px;font-weight:600;margin-bottom:2px">Rettifiche (netto)</div>';
    h += '    <div style="font-family:var(--font-mono);font-size:13px;color:' + rettCol + '">' + _fmtLSigned(rettNetto) + '</div>';
    h += '  </div>';

    var saldoCol = saldo >= 0 ? '#27500A' : '#791F1F';
    h += '  <div style="padding-top:12px;border-top:2px solid var(--border)">';
    h += '    <div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;margin-bottom:4px">Saldo netto periodo</div>';
    h += '    <div style="font-family:var(--font-mono);font-size:22px;font-weight:700;color:' + saldoCol + '">' + _fmtLSigned(saldo) + '</div>';
    h += '    <div style="font-size:10px;color:var(--text-muted);margin-top:4px;line-height:1.4">entrate − uscite del periodo</div>';
    h += '  </div>';

    h += '</div>';
    return h;
  }

  // ── Handlers toggle gruppi / lista ───────────────────────────────
  window._pfMvtDettToggleGruppo = function(key) {
    if (!_report) return;
    if (!_report.espansi) _report.espansi = {};
    _report.espansi[key] = !_report.espansi[key];
    _renderReport();
  };

  window._pfMvtDettMostraTutte = function(key) {
    if (!_report) return;
    if (!_report.righeTutte) _report.righeTutte = {};
    _report.righeTutte[key] = !_report.righeTutte[key];
    _renderReport();
  };

  // ── Export (TURNO 3 placeholder) ─────────────────────────────────
  window.pfMvtDettExportPDF = function() { toast('Export PDF in arrivo nel prossimo turno'); };
  window.pfMvtDettExportExcel = function() { toast('Export Excel in arrivo nel prossimo turno'); };


  // Esporta entry point
  window.pfMvtDettApri = pfMvtDettApri;

  // ── Shortcut: apre direttamente il report con periodo preimpostato ─
  // Bypassa il mini-modale filtri. Usa tutti i prodotti disponibili.
  window.pfMvtDettShortcut = async function(tipo) {
    if (!_stato) _stato = _statoIniziale();
    if (!_stato.prodottiDisponibili.length) {
      _stato.prodottiDisponibili = await _caricaProdotti();
      _stato.prodotti = _stato.prodottiDisponibili.slice();
    }
    var oggi = new Date();
    var y = oggi.getFullYear();
    var oggiISO = oggi.toISOString().split('T')[0];
    var cfg;
    if (tipo === 'oggi') {
      cfg = { da: oggiISO, a: oggiISO, prodotti: _stato.prodottiDisponibili.slice(),
              etichetta: _fmtIT(oggiISO) };
    } else if (tipo === 'mese_corrente') {
      var ini = _primoGiornoMese(y, oggi.getMonth());
      cfg = { da: ini, a: oggiISO, prodotti: _stato.prodottiDisponibili.slice(),
              etichetta: MESI[oggi.getMonth()] + ' ' + y };
    } else if (tipo === 'ultimi_30') {
      cfg = { da: _shiftISO(oggiISO, -29), a: oggiISO, prodotti: _stato.prodottiDisponibili.slice(),
              etichetta: 'Ultimi 30 giorni (' + _fmtIT(_shiftISO(oggiISO, -29)) + ' → ' + _fmtIT(oggiISO) + ')' };
    } else if (tipo === 'anno_corrente') {
      cfg = { da: y + '-01-01', a: oggiISO, prodotti: _stato.prodottiDisponibili.slice(),
              etichetta: 'Anno ' + y + ' (01/01/' + y + ' → ' + _fmtIT(oggiISO) + ')' };
    } else {
      return;
    }
    pfMvtDettMostra(cfg);
  };
})();
