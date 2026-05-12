// ════════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Modulo "Valutazioni Banche"
// Sotto-tab del modulo Banche & Mutui (panel: banche-panel-valutazioni)
// Layout: header + tab linee breve + mutui + cdf + sintesi + crit/bench/racc
// Tutti i pannelli sono spostabili via ▲▼ (localStorage: pf-panel-order-valutazioni)
// ════════════════════════════════════════════════════════════════════════════

// ── STATO ──────────────────────────────────────────────────────────────────
let _bvSelectedBanca = null;
let _bvSelectedAnno  = null;
let _bvViewMode      = 'banca';   // 'banca' (scheda singola) | 'confronto' (multi-banca)
let _bvPeriodiCache  = null;
let _bvVociCache     = null;

// ── RENDER PRINCIPALE ──────────────────────────────────────────────────────
async function renderBancheValutazioni() {
  const cont = document.getElementById('banche-panel-valutazioni');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:12px">⏳ Caricamento valutazioni...</div>';

  // Carico anagrafica banche se cache vuota
  if (!Array.isArray(_bancheIstituti) || _bancheIstituti.length === 0) {
    const r = await sb.from('banche_istituti').select('*').order('nome');
    _bancheIstituti = r.data || [];
  }

  // Carico dati valutazione (full refresh ad ogni render della tab)
  const [perRes, vocRes] = await Promise.all([
    sb.from('banche_valutazioni_periodi').select('*').order('anno', {ascending:false}),
    sb.from('banche_valutazioni_voci').select('*').order('ordine')
  ]);
  _bvPeriodiCache = perRes.data || [];
  _bvVociCache    = vocRes.data || [];

  // Banche con dati, in ordine costituzionale Intesa → MPS → BNL → BCC
  const idsConDati = new Set(_bvPeriodiCache.map(p => p.banca_id));
  const bancheConDati = _bancheIstituti
    .filter(b => idsConDati.has(b.id))
    .sort((a, b) => _priorityBancaIstituto(a.nome) - _priorityBancaIstituto(b.nome));

  if (bancheConDati.length === 0) {
    cont.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted)">
        <div style="font-size:14px;margin-bottom:8px;font-weight:600">Nessuna valutazione disponibile</div>
        <div style="font-size:11px">Esegui prima lo script <code>setup_banche_valutazioni.sql</code> in Supabase per popolare i dati.</div>
      </div>`;
    return;
  }

  // Default selezione
  if (!_bvSelectedBanca || !bancheConDati.find(b => b.id === _bvSelectedBanca)) {
    _bvSelectedBanca = bancheConDati[0].id;
  }
  // Calcolo anni disponibili: in confronto = tutti gli anni; in banca = solo per banca selezionata
  // + sempre l'anno corrente (per consentire avvio import su anno vuoto)
  const annoCorrente = new Date().getFullYear();
  let anniDisponibili;
  if (_bvViewMode === 'confronto') {
    anniDisponibili = Array.from(new Set(_bvPeriodiCache.map(p => p.anno)));
    if (!anniDisponibili.includes(annoCorrente)) anniDisponibili.push(annoCorrente);
    anniDisponibili.sort((a, b) => b - a);
  } else {
    anniDisponibili = _bvPeriodiCache
      .filter(p => p.banca_id === _bvSelectedBanca)
      .map(p => p.anno);
    if (!anniDisponibili.includes(annoCorrente)) anniDisponibili.push(annoCorrente);
    anniDisponibili.sort((a, b) => b - a);
  }
  if (!_bvSelectedAnno || !anniDisponibili.includes(_bvSelectedAnno)) {
    _bvSelectedAnno = anniDisponibili[0];
  }

  // ── BUILD HTML ───────────────────────────────────────────────────────────
  let html = '';

  // Sub-tab: pulsante Confronto + banche (ordine costituzionale)
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px;align-items:center">';

  // Pulsante Confronto (sempre primo)
  const confrontoAtt = (_bvViewMode === 'confronto');
  const confBg = confrontoAtt ? '#1a1a18' : 'var(--bg)';
  const confFg = confrontoAtt ? '#FAC775' : 'var(--text)';
  const confFw = confrontoAtt ? '600' : '400';
  html += '<button onclick="_bvSetViewConfronto()" style="background:' + confBg + ';color:' + confFg + ';border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;font-weight:' + confFw + '">📊 Confronto</button>';

  // Separatore
  html += '<div style="width:1px;height:24px;background:var(--border);margin:0 4px"></div>';

  // Sub-tab banche
  bancheConDati.forEach(b => {
    const att = (_bvViewMode === 'banca' && b.id === _bvSelectedBanca);
    const bg  = att ? '#1a1a18' : 'var(--bg)';
    const fg  = att ? '#FAC775' : 'var(--text)';
    const fw  = att ? '600' : '400';
    html += '<button onclick="_bvSelectBanca(\'' + b.id + '\')" style="background:' + bg + ';color:' + fg + ';border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;font-weight:' + fw + '">' + (b.nome || '') + '</button>';
  });
  html += '</div>';

  // Selettore anno (◀ dropdown ▶)
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">';
  html += '<div style="display:flex;gap:8px;align-items:center">';
  html += '<button onclick="_bvCambiaAnno(-1)" title="Anno precedente" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer">◀</button>';
  html += '<select id="bv-select-anno" onchange="_bvSelectAnno(this.value)" onwheel="this.blur()" style="font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-weight:600;min-width:140px">';
  anniDisponibili.forEach(a => {
    html += '<option value="' + a + '"' + (a === _bvSelectedAnno ? ' selected' : '') + '>Esercizio ' + a + '</option>';
  });
  html += '</select>';
  html += '<button onclick="_bvCambiaAnno(1)" title="Anno successivo" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer">▶</button>';
  html += '</div>';
  html += '</div>';

  // ══════════════════════════════════════════════════════════════════════════
  // BRANCH 1: MODALITÀ CONFRONTO MULTI-BANCA
  // ══════════════════════════════════════════════════════════════════════════
  if (_bvViewMode === 'confronto') {
    // Tutte le 4 banche in ordine costituzionale (Intesa, MPS, BNL, BCC)
    const tutteBanche = _bancheIstituti.slice().sort((a, b) =>
      _priorityBancaIstituto(a.nome) - _priorityBancaIstituto(b.nome));
    // Per ogni banca, prendo il periodo dell'anno selezionato (può essere null)
    const periodiAnno = tutteBanche.map(b => ({
      banca: b,
      periodo: _bvPeriodiCache.find(p => p.banca_id === b.id && p.anno === _bvSelectedAnno) || null
    }));

    const panelsConf = {
      'classifica':  _bvPanelConfrontoClassifica(periodiAnno),
      'incidenza':   _bvPanelConfrontoIncidenza(periodiAnno),
      'accessori':   _bvPanelConfrontoAccessori(periodiAnno),
      'insight':     _bvPanelConfrontoInsight(periodiAnno)
    };
    _registerPanels('confronto', ['classifica','incidenza','accessori','insight'], renderBancheValutazioni);
    const orderConf = _getPanelOrder('confronto');
    orderConf.forEach(id => {
      if (panelsConf[id]) html += _wrapPanel('confronto', id, panelsConf[id]);
    });

    cont.innerHTML = html;
    return;
  }

  // ══════════════════════════════════════════════════════════════════════════
  // BRANCH 2: MODALITÀ BANCA SINGOLA (scheda valutazione)
  // ══════════════════════════════════════════════════════════════════════════
  // Carica periodo + voci per la coppia (banca, anno)
  const banca   = _bancheIstituti.find(b => b.id === _bvSelectedBanca);
  const periodo = _bvPeriodiCache.find(p => p.banca_id === _bvSelectedBanca && p.anno === _bvSelectedAnno);
  const voci    = _bvVociCache.filter(v => v.banca_id === _bvSelectedBanca && v.anno === _bvSelectedAnno);

  if (!periodo) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:12px">';
    html += '<div style="margin-bottom:12px">Nessun dato per ' + (banca ? banca.nome : '?') + ' — esercizio ' + _bvSelectedAnno + '.</div>';
    html += '<button onclick="_imeOpenModal()" style="background:#1a1a18;color:#FAC775;border:0.5px solid var(--border);border-radius:6px;padding:9px 18px;font-size:12px;font-weight:600;cursor:pointer">📥 Importa primo estratto conto</button>';
    html += '</div>';
    cont.innerHTML = html;
    return;
  }

  // ── PANNELLI ─────────────────────────────────────────────────────────────
  const panels = {
    'header':    _bvPanelHeader(banca, periodo),
    'tab1':      _bvPanelTabella1(voci.filter(v => v.tabella === 'linee_breve')),
    'tab2':      _bvPanelTabella2(voci.filter(v => v.tabella === 'mutui_mlt')),
    'tab3':      _bvPanelTabella3(voci.filter(v => v.tabella === 'cdf')),
    'sintesi':   _bvPanelSintesi(periodo),
    'accessori': _bvPanelAccessori(periodo),
    'critica':   _bvPanelTesto('Criticità e anomalie', periodo.criticita, '#A32D2D'),
    'bench':     _bvPanelTesto('Benchmark vs mercato', periodo.benchmark, '#26215C'),
    'racc':      _bvPanelTesto('Raccomandazioni quantificate', periodo.raccomandazioni, '#633806')
  };
  _registerPanels('valutazioni', ['header','tab1','tab2','tab3','sintesi','accessori','critica','bench','racc'], renderBancheValutazioni);
  const order = _getPanelOrder('valutazioni');
  order.forEach(id => {
    if (panels[id]) html += _wrapPanel('valutazioni', id, panels[id]);
  });

  cont.innerHTML = html;
}

// ── HANDLERS ───────────────────────────────────────────────────────────────
function _bvSetViewConfronto() {
  _bvViewMode = 'confronto';
  renderBancheValutazioni();
}
function _bvSelectBanca(id) {
  _bvViewMode = 'banca';
  _bvSelectedBanca = String(id);
  renderBancheValutazioni();
}
function _bvSelectAnno(v) {
  _bvSelectedAnno = parseInt(v);
  renderBancheValutazioni();
}
function _bvCambiaAnno(delta) {
  const anni = _bvPeriodiCache
    .filter(p => p.banca_id === _bvSelectedBanca)
    .map(p => p.anno)
    .sort((a, b) => a - b);
  const i = anni.indexOf(_bvSelectedAnno);
  if (i < 0) return;
  const ni = i + delta;
  if (ni < 0 || ni >= anni.length) return;
  _bvSelectedAnno = anni[ni];
  renderBancheValutazioni();
}

// ── PANNELLO: HEADER (KPI esposizione + costo bancario + volume anticipi) ─
function _bvPanelHeader(banca, p) {
  const nome = (banca && banca.nome ? banca.nome : '').toUpperCase();
  const volAnt = Number(p.volume_anticipi_lavorato || 0);
  const fonte = p.volume_anticipi_fonte || 'manuale';
  const fonteTxt = fonte === 'da_modulo_anticipi' ? '(da modulo Anticipi)' : '(inserito manualmente)';

  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px;padding-right:60px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:14px">';
  h += '<div>';
  h += '<div style="font-size:11px;color:var(--text-muted);font-weight:500;letter-spacing:0.5px;margin-bottom:4px">' + nome + '</div>';
  h += '<div style="font-size:18px;font-weight:700;color:var(--text)">Scheda di valutazione · esercizio ' + p.anno + '</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:4px">Ultimo aggiornamento: ' + _bvFmtDateTime(p.updated_at) + '</div>';
  h += '<div style="margin-top:10px"><button onclick="_imeOpenModal()" style="background:#1a1a18;color:#FAC775;border:0.5px solid var(--border);border-radius:6px;padding:7px 14px;font-size:11.5px;font-weight:600;cursor:pointer" title="Importa estratto conto mensile da file Excel">📥 Importa estratto conto</button></div>';
  h += '</div>';
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  h += '<div class="kpi"><div class="kpi-label">Costo bancario anno</div><div class="kpi-value" style="color:#A32D2D">' + fmtE(p.costo_bancario_totale) + '</div></div>';
  h += '<div class="kpi"><div class="kpi-label">Esposizione totale</div><div class="kpi-value" style="color:#26215C">' + fmtE(p.esposizione_totale) + '</div></div>';
  if (volAnt > 0) {
    h += '<div class="kpi" title="Volume anticipi presentati ' + fonteTxt + '"><div class="kpi-label">Volume anticipi lavorato</div><div class="kpi-value" style="color:#633806">' + fmtE(volAnt) + '</div></div>';
  }
  h += '</div></div></div>';
  return h;
}

// ── PANNELLO: TABELLA 1 (LINEE CREDITO A BREVE) ───────────────────────────
function _bvPanelTabella1(voci) {
  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#1a1a18;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">TABELLA · LINEE CREDITO A BREVE</div>';
  if (!voci.length) {
    h += '<div style="padding:14px;color:var(--text-muted);font-size:12px;font-style:italic">Nessuna linea registrata.</div></div>';
    return h;
  }
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<thead><tr style="background:var(--bg);font-weight:600">';
  ['Linea','Accordato','Utilizzo medio','Saturazione','TAN','All-in','Costo anno'].forEach(c => {
    h += '<th style="padding:8px 10px;text-align:left;border-bottom:0.5px solid var(--border)">' + c + '</th>';
  });
  h += '</tr></thead><tbody>';
  voci.forEach(v => {
    h += '<tr>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + (v.descrizione || '') + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + fmtE(v.accordato) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + fmtE(v.utilizzo_medio) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvFmtPct(v.saturazione_pct, 2) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvFmtPct(v.tan_pct, 3) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600">' + _bvFmtPct(v.all_in_pct, 3) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600;color:#A32D2D">' + fmtE(v.costo_anno) + '</td>';
    h += '</tr>';
    if (v.note) {
      h += '<tr><td colspan="7" style="padding:4px 10px 10px;color:var(--text-muted);font-size:10.5px;border-bottom:0.5px solid var(--border);font-style:italic">' + _bvEscape(v.note) + '</td></tr>';
    }
  });
  h += '</tbody></table></div></div>';
  return h;
}

// ── PANNELLO: TABELLA 2 (MUTUI MLT) ────────────────────────────────────────
function _bvPanelTabella2(voci) {
  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#26215C;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">TABELLA · MUTUI MLT IN AMMORTAMENTO</div>';
  if (!voci.length) {
    h += '<div style="padding:14px;color:var(--text-muted);font-size:12px;font-style:italic">Nessun mutuo registrato.</div></div>';
    return h;
  }
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<thead><tr style="background:var(--bg);font-weight:600">';
  ['Mutuo','Originario','Residuo','Rimborsato','Scadenza','Anni res.','TAN','Interessi anno'].forEach(c => {
    h += '<th style="padding:8px 10px;text-align:left;border-bottom:0.5px solid var(--border)">' + c + '</th>';
  });
  h += '</tr></thead><tbody>';
  voci.forEach(v => {
    const anniRes = (v.anni_residui !== null && v.anni_residui !== undefined) ? Number(v.anni_residui).toFixed(2) : '';
    h += '<tr>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + (v.descrizione || '') + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + fmtE(v.capitale_originario) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + fmtE(v.residuo) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvFmtPct(v.rimborsato_pct, 2) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvFmtDateOnly(v.scadenza) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + anniRes + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvFmtPct(v.tan_pct, 3) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600;color:#A32D2D">' + fmtE(v.costo_anno) + '</td>';
    h += '</tr>';
    if (v.note) {
      h += '<tr><td colspan="8" style="padding:4px 10px 10px;color:var(--text-muted);font-size:10.5px;border-bottom:0.5px solid var(--border);font-style:italic">' + _bvEscape(v.note) + '</td></tr>';
    }
  });
  h += '</tbody></table></div></div>';
  return h;
}

// ── PANNELLO: TABELLA 3 (CDF) ──────────────────────────────────────────────
function _bvPanelTabella3(voci) {
  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#633806;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">TABELLA · COMMISSIONI DISPONIBILITÀ FONDI (CDF)</div>';
  if (!voci.length) {
    h += '<div style="padding:14px;color:var(--text-muted);font-size:12px;font-style:italic">Nessuna CDF registrata.</div></div>';
    return h;
  }
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<thead><tr style="background:var(--bg);font-weight:600">';
  ['Linea','Base calcolo','% trim','% annua','CDF anno','Status'].forEach(c => {
    h += '<th style="padding:8px 10px;text-align:left;border-bottom:0.5px solid var(--border)">' + c + '</th>';
  });
  h += '</tr></thead><tbody>';
  voci.forEach(v => {
    let stColor = 'var(--text-muted)';
    let stLabel = v.status || '';
    if (v.status === 'da_rinegoziare') { stColor = '#A32D2D'; stLabel = 'Da rinegoziare'; }
    else if (v.status === 'ok')         { stColor = '#0a7a3a'; stLabel = 'OK'; }
    else if (v.status === 'in_corso')   { stColor = '#633806'; stLabel = 'In rinegoziazione'; }
    h += '<tr>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + (v.descrizione || '') + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + fmtE(v.base_calcolo) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvFmtPct(v.cdf_pct_trim, 3) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvFmtPct(v.cdf_pct_annua, 3) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600;color:#A32D2D">' + fmtE(v.costo_anno) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);color:' + stColor + ';font-weight:600">' + stLabel + '</td>';
    h += '</tr>';
    if (v.note) {
      h += '<tr><td colspan="6" style="padding:4px 10px 10px;color:var(--text-muted);font-size:10.5px;border-bottom:0.5px solid var(--border);font-style:italic">' + _bvEscape(v.note) + '</td></tr>';
    }
  });
  h += '</tbody></table></div></div>';
  return h;
}

// ── PANNELLO: COSTI ACCESSORI DETTAGLIO ────────────────────────────────────
function _bvPanelAccessori(p) {
  let voci = [];
  try {
    if (Array.isArray(p.costi_accessori_dettaglio)) {
      voci = p.costi_accessori_dettaglio;
    } else if (typeof p.costi_accessori_dettaglio === 'string') {
      voci = JSON.parse(p.costi_accessori_dettaglio || '[]');
    }
  } catch (e) { voci = []; }

  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#633806;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">DETTAGLIO COSTI ACCESSORI</div>';

  if (!voci.length) {
    h += '<div style="padding:14px;color:var(--text-muted);font-size:12px;font-style:italic">Nessun dettaglio accessori inserito.</div></div>';
    return h;
  }

  let tot = 0;
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<thead><tr style="background:var(--bg);font-weight:600">';
  h += '<th style="padding:8px 10px;text-align:left;border-bottom:0.5px solid var(--border)">Voce</th>';
  h += '<th style="padding:8px 10px;text-align:right;border-bottom:0.5px solid var(--border)">Importo €</th>';
  h += '</tr></thead><tbody>';
  voci.forEach(v => {
    const imp = Number(v.importo || 0);
    tot += imp;
    const color = imp < 0 ? '#0a7a3a' : '#A32D2D';
    h += '<tr>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvEscape(v.voce || '') + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);text-align:right;font-weight:600;color:' + color + '">' + fmtE(imp) + '</td>';
    h += '</tr>';
  });
  const totColor = tot < 0 ? '#0a7a3a' : '#A32D2D';
  h += '<tr><td style="padding:10px;font-weight:700;background:var(--bg)">TOTALE NETTO ACCESSORI</td>';
  h += '<td style="padding:10px;text-align:right;font-weight:700;background:var(--bg);color:' + totColor + '">' + fmtE(tot) + '</td></tr>';
  h += '</tbody></table></div></div>';
  return h;
}

// ── PANNELLO: SINTESI COSTO PER NATURA ─────────────────────────────────────
function _bvPanelSintesi(p) {
  const rows = [
    {label:'Interessi mutui MLT',        val: p.interessi_mutui,      neg:false},
    {label:'Interessi anticipi sbf',     val: p.interessi_anticipi,   neg:false},
    {label:'CDF totali',                 val: p.cdf_totali,           neg:false},
    {label:'Canoni, bolli, spese vive',  val: p.canoni_bolli_spese,   neg:false},
    {label:'Differenziali IRS',          val: p.differenziali_irs,    neg:Number(p.differenziali_irs) < 0},
    {label:'Altri costi netti',          val: p.altri_costi_netti,    neg:Number(p.altri_costi_netti) < 0}
  ];
  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#1a1a18;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">SINTESI COSTO BANCARIO PER NATURA</div>';
  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<thead><tr style="background:var(--bg);font-weight:600">';
  h += '<th style="padding:8px 10px;text-align:left;border-bottom:0.5px solid var(--border)">Voce</th>';
  h += '<th style="padding:8px 10px;text-align:right;border-bottom:0.5px solid var(--border)">Importo €</th>';
  h += '</tr></thead><tbody>';
  rows.forEach(r => {
    const color = r.neg ? '#0a7a3a' : '#A32D2D';
    h += '<tr>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + r.label + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);text-align:right;font-weight:600;color:' + color + '">' + fmtE(r.val) + '</td>';
    h += '</tr>';
  });
  h += '<tr><td style="padding:10px;font-weight:700;background:var(--bg)">TOTALE COSTO BANCARIO</td>';
  h += '<td style="padding:10px;text-align:right;font-weight:700;background:var(--bg);color:#A32D2D">' + fmtE(p.costo_bancario_totale) + '</td></tr>';
  h += '</tbody></table></div></div>';
  return h;
}

// ── PANNELLO: TESTO LIBERO (criticità / benchmark / raccomandazioni) ──────
function _bvPanelTesto(titolo, testo, colore) {
  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:' + colore + ';color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">' + titolo.toUpperCase() + '</div>';
  if (!testo) {
    h += '<div style="padding:14px;color:var(--text-muted);font-size:12px;font-style:italic">Non compilato.</div>';
  } else {
    const safe = _bvEscape(testo).replace(/\n/g, '<br>');
    h += '<div style="font-size:12.5px;line-height:1.6;color:var(--text)">' + safe + '</div>';
  }
  h += '</div>';
  return h;
}

// ════════════════════════════════════════════════════════════════════════════
// PANNELLI MODALITÀ CONFRONTO MULTI-BANCA
// periodiAnno = [{banca, periodo|null}, ...] in ordine costituzionale
// ════════════════════════════════════════════════════════════════════════════

// ── CONFRONTO 1: CLASSIFICA COSTO TOTALE ──────────────────────────────────
function _bvPanelConfrontoClassifica(periodiAnno) {
  // Banche con dati, ordinate per costo decrescente (più costoso primo)
  const conDati = periodiAnno
    .filter(x => x.periodo)
    .sort((a, b) => Number(b.periodo.costo_bancario_totale) - Number(a.periodo.costo_bancario_totale));
  const senzaDati = periodiAnno.filter(x => !x.periodo);

  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#1a1a18;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">CLASSIFICA COSTO BANCARIO TOTALE</div>';

  if (conDati.length === 0) {
    h += '<div style="padding:14px;color:var(--text-muted);font-size:12px;font-style:italic">Nessuna banca popolata per questo anno.</div></div>';
    return h;
  }

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<thead><tr style="background:var(--bg);font-weight:600">';
  ['#','Banca','Costo anno','Esposizione','Volume anticipi','Costo/Esposiz.'].forEach(c => {
    h += '<th style="padding:8px 10px;text-align:left;border-bottom:0.5px solid var(--border)">' + c + '</th>';
  });
  h += '</tr></thead><tbody>';

  let totCosto = 0, totEsp = 0, totVol = 0;
  const medals = ['🥇', '🥈', '🥉'];
  conDati.forEach((x, i) => {
    const p = x.periodo;
    const costo = Number(p.costo_bancario_totale || 0);
    const esp   = Number(p.esposizione_totale || 0);
    const vol   = Number(p.volume_anticipi_lavorato || 0);
    const pctCe = esp > 0 ? (costo / esp * 100) : null;
    totCosto += costo; totEsp += esp; totVol += vol;
    const medal = medals[i] || ('  ' + (i + 1) + '°');
    h += '<tr>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600">' + medal + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600">' + (x.banca.nome || '') + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600;color:#A32D2D">' + fmtE(costo) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + fmtE(esp) + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + (vol > 0 ? fmtE(vol) : '—') + '</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600">' + (pctCe !== null ? _bvFmtPct(pctCe, 2) : '—') + '</td>';
    h += '</tr>';
  });

  // Righe placeholder per banche senza dati
  senzaDati.forEach(x => {
    h += '<tr style="opacity:0.55">';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">—</td>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + (x.banca.nome || '') + '</td>';
    h += '<td colspan="4" style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-style:italic;color:var(--text-muted)">in attesa di dati</td>';
    h += '</tr>';
  });

  // Totale
  const pctTotCe = totEsp > 0 ? (totCosto / totEsp * 100) : null;
  h += '<tr style="background:var(--bg)">';
  h += '<td colspan="2" style="padding:10px;font-weight:700">TOTALE PHOENIX FUEL</td>';
  h += '<td style="padding:10px;font-weight:700;color:#A32D2D">' + fmtE(totCosto) + '</td>';
  h += '<td style="padding:10px;font-weight:700">' + fmtE(totEsp) + '</td>';
  h += '<td style="padding:10px;font-weight:700">' + (totVol > 0 ? fmtE(totVol) : '—') + '</td>';
  h += '<td style="padding:10px;font-weight:700">' + (pctTotCe !== null ? _bvFmtPct(pctTotCe, 2) : '—') + '</td>';
  h += '</tr>';
  h += '</tbody></table></div></div>';
  return h;
}

// ── CONFRONTO 2: INCIDENZA COSTO ANTICIPI / VOLUME LAVORATO ───────────────
function _bvPanelConfrontoIncidenza(periodiAnno) {
  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#26215C;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">INCIDENZA COSTO ANTICIPI SUL VOLUME LAVORATO</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;font-style:italic">Quanto costa anticipare €1.000 di fatture con ciascun istituto.</div>';

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<thead><tr style="background:var(--bg);font-weight:600">';
  ['Banca','Volume anticipi','Int. anticipi','CDF','All-in anticipi','% Incidenza','Costo per €1k'].forEach(c => {
    h += '<th style="padding:8px 10px;text-align:left;border-bottom:0.5px solid var(--border)">' + c + '</th>';
  });
  h += '</tr></thead><tbody>';

  // Calcolo banche con dati, ordino per incidenza decrescente (peggiori primi)
  const conDati = periodiAnno.filter(x => x.periodo && Number(x.periodo.volume_anticipi_lavorato) > 0)
    .map(x => {
      const p = x.periodo;
      const vol = Number(p.volume_anticipi_lavorato);
      const intA = Number(p.interessi_anticipi || 0);
      const cdf  = Number(p.cdf_totali || 0);
      const allIn = intA + cdf;
      const pct  = vol > 0 ? (allIn / vol * 100) : 0;
      const per1k = vol > 0 ? (allIn / vol * 1000) : 0;
      return { banca: x.banca, vol, intA, cdf, allIn, pct, per1k };
    })
    .sort((a, b) => b.pct - a.pct);

  if (conDati.length === 0) {
    h += '<tr><td colspan="7" style="padding:14px;color:var(--text-muted);font-style:italic">Nessun dato disponibile.</td></tr>';
  } else {
    // Trova il migliore (incidenza più bassa) per evidenziarlo
    const minPct = Math.min.apply(null, conDati.map(d => d.pct));
    conDati.forEach(d => {
      const isBest = (d.pct === minPct && conDati.length > 1);
      const isWorst = (d.pct === conDati[0].pct && conDati.length > 1);
      const pctColor = isBest ? '#0a7a3a' : (isWorst ? '#A32D2D' : 'var(--text)');
      const flag = isBest ? ' ◄ migliore' : (isWorst ? ' ⚠ peggiore' : '');
      h += '<tr>';
      h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600">' + (d.banca.nome || '') + '</td>';
      h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + fmtE(d.vol) + '</td>';
      h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);color:#A32D2D">' + fmtE(d.intA) + '</td>';
      h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);color:#A32D2D">' + fmtE(d.cdf) + '</td>';
      h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600;color:#A32D2D">' + fmtE(d.allIn) + '</td>';
      h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:700;color:' + pctColor + '">' + _bvFmtPct(d.pct, 2) + flag + '</td>';
      h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-weight:600">€ ' + d.per1k.toFixed(2) + '</td>';
      h += '</tr>';
    });
  }
  // Banche senza volume anticipi popolato
  periodiAnno.filter(x => !x.periodo || !Number(x.periodo.volume_anticipi_lavorato || 0)).forEach(x => {
    h += '<tr style="opacity:0.55">';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + (x.banca.nome || '') + '</td>';
    h += '<td colspan="6" style="padding:8px 10px;border-bottom:0.5px solid var(--border);font-style:italic;color:var(--text-muted)">in attesa di dati (volume anticipi non inserito)</td>';
    h += '</tr>';
  });

  h += '</tbody></table></div></div>';
  return h;
}

// ── CONFRONTO 3: COSTI ACCESSORI PER BANCA ────────────────────────────────
function _bvPanelConfrontoAccessori(periodiAnno) {
  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#633806;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">COSTI ACCESSORI PER ISTITUTO</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px;font-style:italic">Confronto canoni, polizze, commissioni e bolli per ciascun istituto.</div>';

  // Estraggo TUTTE le voci accessorie da ogni banca, unisco l'elenco unico
  const tuttiAccessori = new Set();
  const accessoriPerBanca = {};
  periodiAnno.forEach(x => {
    if (!x.periodo) { accessoriPerBanca[x.banca.id] = {}; return; }
    let voci = [];
    try {
      if (Array.isArray(x.periodo.costi_accessori_dettaglio)) voci = x.periodo.costi_accessori_dettaglio;
      else if (typeof x.periodo.costi_accessori_dettaglio === 'string') voci = JSON.parse(x.periodo.costi_accessori_dettaglio || '[]');
    } catch(e) { voci = []; }
    const map = {};
    voci.forEach(v => {
      const key = (v.voce || '').trim();
      if (key) { tuttiAccessori.add(key); map[key] = Number(v.importo || 0); }
    });
    accessoriPerBanca[x.banca.id] = map;
  });

  if (tuttiAccessori.size === 0) {
    h += '<div style="padding:14px;color:var(--text-muted);font-size:12px;font-style:italic">Nessun dettaglio accessori inserito.</div></div>';
    return h;
  }

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<thead><tr style="background:var(--bg);font-weight:600">';
  h += '<th style="padding:8px 10px;text-align:left;border-bottom:0.5px solid var(--border)">Voce</th>';
  periodiAnno.forEach(x => {
    h += '<th style="padding:8px 10px;text-align:right;border-bottom:0.5px solid var(--border)">' + (x.banca.nome || '') + '</th>';
  });
  h += '</tr></thead><tbody>';

  const totali = {};
  periodiAnno.forEach(x => totali[x.banca.id] = 0);
  Array.from(tuttiAccessori).forEach(voce => {
    h += '<tr>';
    h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border)">' + _bvEscape(voce) + '</td>';
    periodiAnno.forEach(x => {
      const imp = accessoriPerBanca[x.banca.id][voce];
      const has = imp !== undefined;
      if (has) {
        totali[x.banca.id] += imp;
        const color = imp < 0 ? '#0a7a3a' : '#A32D2D';
        h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);text-align:right;color:' + color + '">' + fmtE(imp) + '</td>';
      } else {
        h += '<td style="padding:8px 10px;border-bottom:0.5px solid var(--border);text-align:right;color:var(--text-muted)">—</td>';
      }
    });
    h += '</tr>';
  });

  // Totale
  h += '<tr style="background:var(--bg)">';
  h += '<td style="padding:10px;font-weight:700">TOTALE NETTO ACCESSORI</td>';
  periodiAnno.forEach(x => {
    const t = totali[x.banca.id];
    const has = accessoriPerBanca[x.banca.id] && Object.keys(accessoriPerBanca[x.banca.id]).length > 0;
    const color = t < 0 ? '#0a7a3a' : '#A32D2D';
    if (has) {
      h += '<td style="padding:10px;text-align:right;font-weight:700;color:' + color + '">' + fmtE(t) + '</td>';
    } else {
      h += '<td style="padding:10px;text-align:right;color:var(--text-muted)">—</td>';
    }
  });
  h += '</tr>';

  h += '</tbody></table></div></div>';
  return h;
}

// ── CONFRONTO 4: INSIGHT AUTOMATICI ────────────────────────────────────────
function _bvPanelConfrontoInsight(periodiAnno) {
  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  h += '<div class="tag" style="background:#A32D2D;color:#FAC775;display:inline-block;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:600;letter-spacing:0.5px;margin-bottom:12px">INSIGHT AUTOMATICI</div>';

  const conDati = periodiAnno.filter(x => x.periodo);
  const conVolume = conDati.filter(x => Number(x.periodo.volume_anticipi_lavorato) > 0);
  const insights = [];

  if (conDati.length < 2) {
    insights.push({ tipo: 'info', testo: 'Solo ' + conDati.length + ' banca popolata' + (conDati.length === 1 ? ' (' + conDati[0].banca.nome + ')' : '') + '. Aggiungi le altre banche per attivare gli insight comparativi.' });
  } else {
    // Banca più costosa in valore assoluto
    const piuCostosa = conDati.slice().sort((a, b) => Number(b.periodo.costo_bancario_totale) - Number(a.periodo.costo_bancario_totale))[0];
    insights.push({ tipo: 'red', testo: '🚨 Banca più costosa in valore assoluto: <b>' + piuCostosa.banca.nome + '</b> con ' + fmtE(piuCostosa.periodo.costo_bancario_totale) + '.' });

    // Banca con incidenza anticipi peggiore (se almeno 2 con volume)
    if (conVolume.length >= 2) {
      const incList = conVolume.map(x => {
        const p = x.periodo;
        const vol = Number(p.volume_anticipi_lavorato);
        const allIn = Number(p.interessi_anticipi || 0) + Number(p.cdf_totali || 0);
        return { banca: x.banca, pct: vol > 0 ? (allIn / vol * 100) : 0 };
      });
      const peggio = incList.slice().sort((a, b) => b.pct - a.pct)[0];
      const meglio = incList.slice().sort((a, b) => a.pct - b.pct)[0];
      insights.push({ tipo: 'red',   testo: '⚠ Incidenza anticipi più alta: <b>' + peggio.banca.nome + '</b> al ' + _bvFmtPct(peggio.pct, 2) + '. Costa ' + (peggio.pct/meglio.pct).toFixed(1) + 'x più di ' + meglio.banca.nome + '.' });
      insights.push({ tipo: 'green', testo: '✅ Banca più efficiente sugli anticipi: <b>' + meglio.banca.nome + '</b> al ' + _bvFmtPct(meglio.pct, 2) + '. Considerare spostamento volumi.' });
    }

    // Banca con costi accessori più alti
    const accTotali = conDati.map(x => {
      let voci = [];
      try {
        if (Array.isArray(x.periodo.costi_accessori_dettaglio)) voci = x.periodo.costi_accessori_dettaglio;
        else if (typeof x.periodo.costi_accessori_dettaglio === 'string') voci = JSON.parse(x.periodo.costi_accessori_dettaglio || '[]');
      } catch(e) {}
      const tot = voci.reduce((s, v) => s + Number(v.importo || 0), 0);
      return { banca: x.banca, tot };
    }).filter(d => d.tot !== 0);
    if (accTotali.length >= 2) {
      const acPeggio = accTotali.slice().sort((a, b) => b.tot - a.tot)[0];
      insights.push({ tipo: 'orange', testo: '📋 Costi accessori più alti: <b>' + acPeggio.banca.nome + '</b> con ' + fmtE(acPeggio.tot) + ' netti. Leva di rinegoziazione su canoni, polizze, commissioni.' });
    }
  }

  insights.forEach(ins => {
    let color = '#26215C', bg = 'rgba(38,33,92,0.08)';
    if (ins.tipo === 'red')    { color = '#A32D2D'; bg = 'rgba(163,45,45,0.08)'; }
    if (ins.tipo === 'green')  { color = '#0a7a3a'; bg = 'rgba(10,122,58,0.08)'; }
    if (ins.tipo === 'orange') { color = '#633806'; bg = 'rgba(99,56,6,0.08)'; }
    h += '<div style="background:' + bg + ';border-left:3px solid ' + color + ';padding:10px 14px;margin-bottom:8px;border-radius:0 6px 6px 0;font-size:12.5px;line-height:1.5">' + ins.testo + '</div>';
  });

  h += '</div>';
  return h;
}

// ════════════════════════════════════════════════════════════════════════════
// HELPERS
// ════════════════════════════════════════════════════════════════════════════
function _bvEscape(s) {
  if (s === null || s === undefined) return '';
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function _bvFmtPct(v, dec) {
  if (v === null || v === undefined || v === '') return '';
  const d = (dec === undefined) ? 2 : dec;
  return Number(v).toFixed(d) + '%';
}
function _bvFmtDateOnly(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('it-IT'); } catch(e) { return ''; }
}
function _bvFmtDateTime(d) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    return dt.toLocaleDateString('it-IT') + ' ' + dt.toLocaleTimeString('it-IT', {hour:'2-digit', minute:'2-digit'});
  } catch(e) { return ''; }
}

// ── HOOK SU TAB SWITCH ─────────────────────────────────────────────────────
// Aggancio non-invasivo: ascolto il click sul pulsante tab Valutazioni e
// chiamo renderBancheValutazioni() dopo che switchBancheTab() ha mostrato il
// pannello. Listener attaccato direttamente a `document` (non serve attendere
// DOMContentLoaded: lo script è caricato in fondo al body, document esiste già).
document.addEventListener('click', function(e) {
  const btn = e.target.closest('.banche-tab[data-tab="banche-panel-valutazioni"]');
  if (btn) setTimeout(renderBancheValutazioni, 0);
});
