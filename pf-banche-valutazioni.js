// ════════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Modulo "Valutazioni Banche"
// Sotto-tab del modulo Banche & Mutui (panel: banche-panel-valutazioni)
// Layout: header + tab linee breve + mutui + cdf + sintesi + crit/bench/racc
// Tutti i pannelli sono spostabili via ▲▼ (localStorage: pf-panel-order-valutazioni)
// ════════════════════════════════════════════════════════════════════════════

// ── STATO ──────────────────────────────────────────────────────────────────
let _bvSelectedBanca = null;
let _bvSelectedAnno  = null;
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
  const anniBanca = _bvPeriodiCache
    .filter(p => p.banca_id === _bvSelectedBanca)
    .map(p => p.anno)
    .sort((a, b) => b - a);
  if (!_bvSelectedAnno || !anniBanca.includes(_bvSelectedAnno)) {
    _bvSelectedAnno = anniBanca[0];
  }

  // ── BUILD HTML ───────────────────────────────────────────────────────────
  let html = '';

  // Sub-tab banche (ordine costituzionale)
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;border-bottom:1px solid var(--border);padding-bottom:10px">';
  bancheConDati.forEach(b => {
    const att = b.id === _bvSelectedBanca;
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
  anniBanca.forEach(a => {
    html += '<option value="' + a + '"' + (a === _bvSelectedAnno ? ' selected' : '') + '>Esercizio ' + a + '</option>';
  });
  html += '</select>';
  html += '<button onclick="_bvCambiaAnno(1)" title="Anno successivo" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:13px;cursor:pointer">▶</button>';
  html += '</div>';
  html += '</div>';

  // Carica periodo + voci per la coppia (banca, anno)
  const banca   = _bancheIstituti.find(b => b.id === _bvSelectedBanca);
  const periodo = _bvPeriodiCache.find(p => p.banca_id === _bvSelectedBanca && p.anno === _bvSelectedAnno);
  const voci    = _bvVociCache.filter(v => v.banca_id === _bvSelectedBanca && v.anno === _bvSelectedAnno);

  if (!periodo) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:12px">Nessun dato per ' + (banca ? banca.nome : '?') + ' — esercizio ' + _bvSelectedAnno + '.</div>';
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
function _bvSelectBanca(id) {
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

// ── HELPERS ────────────────────────────────────────────────────────────────
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
