// ════════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Modulo "Strumenti Finanziari"
// Sotto-vista di Banche & Mutui → Valutazioni
// Categorie: IRS/Swap copertura · GP/Fondi liberi · Fondi garanzia · Polizze
// Convenzione segno importo: POSITIVO = a favore Phoenix · NEGATIVO = costo
// Pannelli spostabili via ▲▼ (localStorage: pf-panel-order-strumenti)
// ════════════════════════════════════════════════════════════════════════════

// ── STATO ──────────────────────────────────────────────────────────────────
let _strSelectedAnno     = new Date().getFullYear();
let _strSelectedBanca    = 'tutte';        // 'tutte' | banca_id
let _strStrumentiCache   = null;
let _strMovimentiCache   = null;
let _strExpanded         = new Set();       // ID strumenti con storico aperto

// ── HELPERS FORMAT ─────────────────────────────────────────────────────────
function _strFmtE(n, decimals) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const d = (decimals === undefined) ? 2 : decimals;
  return '€ ' + Number(n).toLocaleString('it-IT', {minimumFractionDigits:d, maximumFractionDigits:d});
}
function _strFmtESign(n) {
  if (n === null || n === undefined || isNaN(n)) return '—';
  const s = _strFmtE(n);
  if (n > 0) return '<span style="color:var(--success,#16a34a);font-weight:600">+' + s + '</span>';
  if (n < 0) return '<span style="color:var(--danger,#dc2626);font-weight:600">' + s + '</span>';
  return s;
}
function _strFmtPct(p, decimals) {
  if (p === null || p === undefined || isNaN(p)) return '—';
  const d = (decimals === undefined) ? 2 : decimals;
  return Number(p).toLocaleString('it-IT', {minimumFractionDigits:d, maximumFractionDigits:d}) + ' %';
}
function _strFmtData(d) {
  if (!d) return '—';
  try {
    const dt = (d instanceof Date) ? d : new Date(d);
    return dt.toLocaleDateString('it-IT');
  } catch(e) { return d; }
}
function _strBancaNome(banca_id) {
  const b = (Array.isArray(_bancheIstituti) ? _bancheIstituti : []).find(x => x.id === banca_id);
  return b ? b.nome : '—';
}
function _strTipoLabel(t) {
  const map = {
    irs: '🔁 IRS / Swap',
    gp: '💎 Gestione Patrimoniale',
    fondo_libero: '📈 Fondo libero',
    fondo_garanzia: '🛡️ Fondo a garanzia',
    polizza: '📜 Polizza finanziaria',
    certificato: '🎫 Certificato',
    altro: '◽ Altro'
  };
  return map[t] || t;
}
function _strStatoBadge(s) {
  const colors = {
    attivo:   {bg:'#dcfce7', fg:'#166534', label:'ATTIVO'},
    chiuso:   {bg:'#f3f4f6', fg:'#525252', label:'CHIUSO'},
    sospeso:  {bg:'#fef3c7', fg:'#92400e', label:'SOSPESO'}
  };
  const c = colors[s] || colors.attivo;
  return '<span style="background:' + c.bg + ';color:' + c.fg + ';padding:2px 8px;border-radius:4px;font-size:9px;font-weight:600">' + c.label + '</span>';
}

// ── FETCH DATI ─────────────────────────────────────────────────────────────
async function _strLoadData() {
  // Banche (se non in cache globale)
  if (!Array.isArray(_bancheIstituti) || _bancheIstituti.length === 0) {
    const rb = await sb.from('banche_istituti').select('*').order('nome');
    _bancheIstituti = rb.data || [];
  }
  // Strumenti + movimenti in parallelo
  const [rs, rm] = await Promise.all([
    sb.from('banche_strumenti_finanziari').select('*').order('codice'),
    _pfFetchAllPages(function(){ return sb.from('banche_strumenti_movimenti').select('*').order('data', {ascending:true}); })
  ]);
  _strStrumentiCache = rs.data || [];
  _strMovimentiCache = rm || [];
}

// ── HELPERS DATI ───────────────────────────────────────────────────────────
function _strStrumentiFiltrati(tipo) {
  let lst = (_strStrumentiCache || []).slice();
  if (tipo) {
    if (Array.isArray(tipo)) lst = lst.filter(s => tipo.indexOf(s.tipo) !== -1);
    else lst = lst.filter(s => s.tipo === tipo);
  }
  if (_strSelectedBanca && _strSelectedBanca !== 'tutte') {
    lst = lst.filter(s => s.banca_id === _strSelectedBanca);
  }
  // Ordine: banca costituzionale, poi codice
  lst.sort((a, b) => {
    const pa = (typeof _priorityBancaIstituto === 'function')
      ? _priorityBancaIstituto(_strBancaNome(a.banca_id)) : 99;
    const pb = (typeof _priorityBancaIstituto === 'function')
      ? _priorityBancaIstituto(_strBancaNome(b.banca_id)) : 99;
    if (pa !== pb) return pa - pb;
    return (a.codice || '').localeCompare(b.codice || '');
  });
  return lst;
}
function _strMovimentiAnno(strumento_id, anno) {
  return (_strMovimentiCache || [])
    .filter(m => m.strumento_id === strumento_id && m.anno === anno)
    .sort((a, b) => (a.data || '').localeCompare(b.data || ''));
}
function _strTotaleAnno(strumento_id, anno) {
  return _strMovimentiAnno(strumento_id, anno).reduce((s, m) => s + Number(m.importo || 0), 0);
}
function _strSaldoCumulativo(strumento_id) {
  // Ultimo controvalore_progressivo non-null
  const movs = (_strMovimentiCache || [])
    .filter(m => m.strumento_id === strumento_id && m.controvalore_progressivo !== null)
    .sort((a, b) => (b.data || '').localeCompare(a.data || ''));
  return movs.length > 0 ? Number(movs[0].controvalore_progressivo) : null;
}

// ── RENDER PRINCIPALE ──────────────────────────────────────────────────────
async function renderBancheStrumenti() {
  const cont = document.getElementById('banche-panel-strumenti');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:12px">⏳ Caricamento strumenti finanziari...</div>';
  try {
    await _strLoadData();
  } catch(e) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--danger,#dc2626);font-size:12px">❌ Errore caricamento dati: ' + (e.message || e) + '</div>';
    return;
  }
  _strRender();
}
window.renderBancheStrumenti = renderBancheStrumenti;

function _strRender() {
  const cont = document.getElementById('banche-panel-strumenti');
  if (!cont) return;

  // Empty state se nessun strumento
  if (!_strStrumentiCache || _strStrumentiCache.length === 0) {
    cont.innerHTML = `
      <div style="padding:40px;text-align:center;color:var(--text-muted)">
        <div style="font-size:32px;margin-bottom:12px">📈</div>
        <div style="font-size:14px;margin-bottom:8px;font-weight:600">Nessuno strumento finanziario registrato</div>
        <div style="font-size:11px;line-height:1.6;max-width:480px;margin:0 auto">
          Esegui lo script <code>schema_strumenti_finanziari.sql</code> su Supabase
          per creare le tabelle <code>banche_strumenti_finanziari</code> e
          <code>banche_strumenti_movimenti</code> con il seed precaricato.
        </div>
      </div>`;
    return;
  }

  let html = _strRenderHeader();

  // Costruzione pannelli
  const panels = [
    {key:'sintesi',   html: _strPanelSintesi()},
    {key:'irs',       html: _strPanelIRS()},
    {key:'investim',  html: _strPanelInvestimenti()},
    {key:'garanzia',  html: _strPanelFondiGaranzia()}
  ];

  // Registra sezione (firma helper progetto: sezione, defaultOrder, refreshFn)
  const panelKeys = panels.map(p => p.key);
  if (typeof _registerPanels === 'function') {
    try { _registerPanels('strumenti', panelKeys, renderBancheStrumenti); } catch(e) {}
  }

  // Ordinamento da localStorage
  let orderedKeys = panelKeys.slice();
  if (typeof _getPanelOrder === 'function') {
    try {
      const got = _getPanelOrder('strumenti');
      if (got && got.length > 0) orderedKeys = got;
    } catch(e) {}
  }

  const ordered = orderedKeys.map(k => panels.find(p => p.key === k)).filter(Boolean);

  html += ordered.map(p => {
    if (typeof _wrapPanel === 'function') {
      try { return _wrapPanel('strumenti', p.key, p.html); }
      catch(e) { return p.html; }
    }
    return p.html;
  }).join('');

  cont.innerHTML = html;
}

// ── HEADER ─────────────────────────────────────────────────────────────────
function _strRenderHeader() {
  // Banche disponibili (ordine costituzionale)
  const banche = (_bancheIstituti || []).slice().sort((a, b) => {
    const pa = (typeof _priorityBancaIstituto === 'function') ? _priorityBancaIstituto(a.nome) : 99;
    const pb = (typeof _priorityBancaIstituto === 'function') ? _priorityBancaIstituto(b.nome) : 99;
    return pa - pb;
  });

  // Anni disponibili
  const anniSet = new Set();
  (_strMovimentiCache || []).forEach(m => { if (m.anno) anniSet.add(m.anno); });
  const anni = Array.from(anniSet).sort((a, b) => b - a);
  if (anni.indexOf(_strSelectedAnno) === -1 && anni.length > 0) _strSelectedAnno = anni[0];

  return `
    <div style="display:flex;flex-wrap:wrap;gap:12px;align-items:center;padding:12px 14px;background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:6px;margin-bottom:14px">
      <div style="font-weight:700;font-size:13px;color:var(--text,#111);margin-right:6px">
        📈 Strumenti Finanziari
      </div>

      <div style="display:flex;align-items:center;gap:6px;font-size:11px">
        <label style="color:var(--text-muted,#6b7280);font-weight:500">Anno:</label>
        <select onchange="_strSetAnno(parseInt(this.value))" style="padding:4px 8px;border:1px solid var(--border,#d1d5db);border-radius:4px;font-size:11px;background:#fff">
          ${anni.map(a => '<option value="' + a + '"' + (a === _strSelectedAnno ? ' selected' : '') + '>' + a + '</option>').join('')}
        </select>
      </div>

      <div style="display:flex;align-items:center;gap:6px;font-size:11px">
        <label style="color:var(--text-muted,#6b7280);font-weight:500">Banca:</label>
        <select onchange="_strSetBanca(this.value)" style="padding:4px 8px;border:1px solid var(--border,#d1d5db);border-radius:4px;font-size:11px;background:#fff;min-width:140px">
          <option value="tutte"${_strSelectedBanca === 'tutte' ? ' selected' : ''}>Tutte le banche</option>
          ${banche.map(b => '<option value="' + b.id + '"' + (_strSelectedBanca === b.id ? ' selected' : '') + '>' + b.nome + '</option>').join('')}
        </select>
      </div>

      <div style="flex:1"></div>

      <button onclick="renderBancheStrumenti()" title="Aggiorna dati" style="padding:5px 10px;background:var(--primary,#1e40af);color:#fff;border:none;border-radius:4px;font-size:11px;font-weight:600;cursor:pointer">
        ↻ Aggiorna
      </button>
    </div>
  `;
}
function _strSetAnno(n) { _strSelectedAnno = n; _strRender(); }
function _strSetBanca(id) { _strSelectedBanca = id; _strRender(); }
window._strSetAnno = _strSetAnno;
window._strSetBanca = _strSetBanca;

// ── PANNELLO 1: SINTESI POSIZIONE FINANZIARIA ──────────────────────────────
function _strPanelSintesi() {
  const strum = _strStrumentiFiltrati();
  const attivi = strum.filter(s => s.stato === 'attivo');

  // KPI
  let nozIRS = 0, cvInvestim = 0, proventoAnno = 0, oneriAnno = 0;
  attivi.forEach(s => {
    if (s.tipo === 'irs') nozIRS += Number(s.nozionale || 0);
    if (['gp','fondo_libero','fondo_garanzia','polizza','certificato'].indexOf(s.tipo) !== -1) {
      cvInvestim += Number(s.controvalore_attuale || 0);
    }
    const tot = _strTotaleAnno(s.id, _strSelectedAnno);
    if (tot > 0) proventoAnno += tot;
    else oneriAnno += tot;
  });
  const nettoAnno = proventoAnno + oneriAnno;

  // Aggregato per banca
  const perBanca = {};
  attivi.forEach(s => {
    const bid = s.banca_id;
    if (!perBanca[bid]) perBanca[bid] = {nome:_strBancaNome(bid), nIRS:0, nInv:0, totale:0};
    if (s.tipo === 'irs') perBanca[bid].nIRS++;
    else perBanca[bid].nInv++;
    perBanca[bid].totale += _strTotaleAnno(s.id, _strSelectedAnno);
  });
  const banche = Object.values(perBanca).sort((a, b) => {
    const pa = (typeof _priorityBancaIstituto === 'function') ? _priorityBancaIstituto(a.nome) : 99;
    const pb = (typeof _priorityBancaIstituto === 'function') ? _priorityBancaIstituto(b.nome) : 99;
    return pa - pb;
  });

  return `
  <div class="bv-panel" style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:6px;margin-bottom:14px">
    <div style="padding:10px 14px;border-bottom:1px solid var(--border,#e5e7eb);background:linear-gradient(135deg,#1e3a8a,#1e40af);color:#fff;border-radius:6px 6px 0 0">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:12px">📊 SINTESI POSIZIONE FINANZIARIA — ${_strSelectedAnno}</div>
        <div style="font-size:10px;opacity:0.85">${attivi.length} strumento/i attivo/i su ${strum.length} totali</div>
      </div>
    </div>

    <div style="padding:14px">
      <!-- KPI -->
      <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:14px">
        <div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:5px;padding:10px">
          <div style="font-size:10px;color:#1e40af;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Nozionale IRS</div>
          <div style="font-size:18px;font-weight:700;color:#1e3a8a;margin-top:3px">${nozIRS > 0 ? _strFmtE(nozIRS, 0) : '—'}</div>
          <div style="font-size:9px;color:var(--text-muted,#6b7280);margin-top:2px">coperture attive</div>
        </div>
        <div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:5px;padding:10px">
          <div style="font-size:10px;color:#166534;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Investimenti</div>
          <div style="font-size:18px;font-weight:700;color:#14532d;margin-top:3px">${_strFmtE(cvInvestim, 0)}</div>
          <div style="font-size:9px;color:var(--text-muted,#6b7280);margin-top:2px">controvalore attuale</div>
        </div>
        <div style="background:#fef3c7;border:1px solid #fde68a;border-radius:5px;padding:10px">
          <div style="font-size:10px;color:#92400e;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Proventi ${_strSelectedAnno}</div>
          <div style="font-size:18px;font-weight:700;color:#78350f;margin-top:3px">${proventoAnno > 0 ? '+' + _strFmtE(proventoAnno) : '—'}</div>
          <div style="font-size:9px;color:var(--text-muted,#6b7280);margin-top:2px">a favore Phoenix</div>
        </div>
        <div style="background:${nettoAnno >= 0 ? '#f0fdf4' : '#fef2f2'};border:1px solid ${nettoAnno >= 0 ? '#bbf7d0' : '#fecaca'};border-radius:5px;padding:10px">
          <div style="font-size:10px;color:${nettoAnno >= 0 ? '#166534' : '#991b1b'};font-weight:600;text-transform:uppercase;letter-spacing:0.4px">Risultato netto ${_strSelectedAnno}</div>
          <div style="font-size:18px;font-weight:700;color:${nettoAnno >= 0 ? '#14532d' : '#7f1d1d'};margin-top:3px">${_strFmtESign(nettoAnno)}</div>
          <div style="font-size:9px;color:var(--text-muted,#6b7280);margin-top:2px">tutti gli strumenti</div>
        </div>
      </div>

      <!-- Tabella per banca -->
      <div style="border:1px solid var(--border,#e5e7eb);border-radius:5px;overflow:hidden">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr style="background:#f9fafb;color:var(--text,#111)">
              <th style="text-align:left;padding:8px 10px;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb)">Banca</th>
              <th style="text-align:center;padding:8px 10px;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb)">IRS / Swap</th>
              <th style="text-align:center;padding:8px 10px;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb)">Investimenti</th>
              <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:1px solid var(--border,#e5e7eb)">Risultato ${_strSelectedAnno}</th>
            </tr>
          </thead>
          <tbody>
            ${banche.length === 0
              ? '<tr><td colspan="4" style="text-align:center;padding:18px;color:var(--text-muted,#6b7280);font-style:italic">Nessun dato per la selezione corrente</td></tr>'
              : banche.map(b => `
                <tr>
                  <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;font-weight:600">${b.nome}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:center">${b.nIRS > 0 ? b.nIRS + ' attivo/i' : '—'}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:center">${b.nInv > 0 ? b.nInv + ' attivo/i' : '—'}</td>
                  <td style="padding:8px 10px;border-bottom:1px solid #f3f4f6;text-align:right">${_strFmtESign(b.totale)}</td>
                </tr>
              `).join('')}
          </tbody>
        </table>
      </div>
    </div>
  </div>`;
}

// ── PANNELLO 2: IRS / SWAP DI COPERTURA ────────────────────────────────────
function _strPanelIRS() {
  const swaps = _strStrumentiFiltrati('irs');

  return `
  <div class="bv-panel" style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:6px;margin-bottom:14px">
    <div style="padding:10px 14px;border-bottom:1px solid var(--border,#e5e7eb);background:#1e293b;color:#fff;border-radius:6px 6px 0 0">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:12px">🔁 IRS / SWAP DI COPERTURA</div>
        <div style="font-size:10px;opacity:0.85">${swaps.length} contratto/i · differenziale POSITIVO = a favore Phoenix</div>
      </div>
    </div>

    <div style="padding:14px;overflow-x:auto">
      ${swaps.length === 0
        ? '<div style="text-align:center;padding:24px;color:var(--text-muted,#6b7280);font-style:italic;font-size:11px">Nessun contratto IRS registrato per la selezione corrente.</div>'
        : `<table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Banca / Codice</th>
                <th style="text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Descrizione</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Nozionale</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Strike</th>
                <th style="text-align:center;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Decorrenza</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Diff. ${_strSelectedAnno}</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Cumulato</th>
                <th style="text-align:center;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Stato</th>
              </tr>
            </thead>
            <tbody>
              ${swaps.map(s => _strRenderRowIRS(s)).join('')}
            </tbody>
          </table>`
      }
    </div>
  </div>`;
}

function _strRenderRowIRS(s) {
  const totAnno = _strTotaleAnno(s.id, _strSelectedAnno);
  const cumul = _strSaldoCumulativo(s.id);
  const movs = _strMovimentiAnno(s.id, _strSelectedAnno);
  const isOpen = _strExpanded.has(s.id);

  let row = `
    <tr style="cursor:pointer;border-bottom:1px solid #f3f4f6" onclick="_strToggleExpand('${s.id}')" title="Click per ${isOpen ? 'chiudere' : 'aprire'} lo storico">
      <td style="padding:8px 10px;font-weight:600">
        <div>${_strBancaNome(s.banca_id)}</div>
        <div style="font-size:9px;color:var(--text-muted,#6b7280);font-weight:500;margin-top:2px">${s.codice}</div>
      </td>
      <td style="padding:8px 10px">${s.descrizione || '—'}</td>
      <td style="padding:8px 10px;text-align:right">${s.nozionale ? _strFmtE(s.nozionale, 0) : '<span style="color:var(--text-muted,#6b7280);font-style:italic">TBD</span>'}</td>
      <td style="padding:8px 10px;text-align:right">${s.strike_pct ? _strFmtPct(s.strike_pct * 100, 4) : '<span style="color:var(--text-muted,#6b7280);font-style:italic">TBD</span>'}</td>
      <td style="padding:8px 10px;text-align:center">${_strFmtData(s.data_inizio)}</td>
      <td style="padding:8px 10px;text-align:right">${_strFmtESign(totAnno)}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:600">${cumul !== null ? _strFmtESign(cumul) : '—'}</td>
      <td style="padding:8px 10px;text-align:center">${_strStatoBadge(s.stato)}</td>
    </tr>
  `;

  if (isOpen) {
    row += `
      <tr>
        <td colspan="8" style="padding:0;background:#f9fafb;border-bottom:1px solid var(--border,#e5e7eb)">
          <div style="padding:12px 16px">
            <div style="font-size:11px;font-weight:600;margin-bottom:8px;color:var(--text,#111)">
              Storico differenziali ${_strSelectedAnno} — ${movs.length} movimenti · totale ${_strFmtESign(totAnno)}
            </div>
            ${movs.length === 0
              ? '<div style="font-size:11px;color:var(--text-muted,#6b7280);font-style:italic;padding:8px 0">Nessun movimento registrato per ' + _strSelectedAnno + '.</div>'
              : `<table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:4px;overflow:hidden">
                <thead>
                  <tr style="background:#f3f4f6">
                    <th style="text-align:left;padding:6px 10px;font-weight:600">Data</th>
                    <th style="text-align:left;padding:6px 10px;font-weight:600">Tipo</th>
                    <th style="text-align:left;padding:6px 10px;font-weight:600">Descrizione</th>
                    <th style="text-align:right;padding:6px 10px;font-weight:600">Importo</th>
                    <th style="text-align:right;padding:6px 10px;font-weight:600">Cumulato</th>
                  </tr>
                </thead>
                <tbody>
                  ${movs.map(m => `
                    <tr style="border-bottom:1px solid #f3f4f6">
                      <td style="padding:6px 10px">${_strFmtData(m.data)}</td>
                      <td style="padding:6px 10px;color:var(--text-muted,#6b7280)">${m.tipo_movimento}</td>
                      <td style="padding:6px 10px">${m.descrizione || '—'}</td>
                      <td style="padding:6px 10px;text-align:right;font-weight:600">${_strFmtESign(m.importo)}</td>
                      <td style="padding:6px 10px;text-align:right">${m.controvalore_progressivo !== null ? _strFmtE(m.controvalore_progressivo) : '—'}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>`
            }
            ${s.note ? '<div style="margin-top:10px;padding:10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:3px;font-size:11px;color:#78350f;line-height:1.5">📝 ' + s.note + '</div>' : ''}
          </div>
        </td>
      </tr>
    `;
  }
  return row;
}

// ── PANNELLO 3: INVESTIMENTI (GP / FONDI LIBERI / POLIZZE) ─────────────────
function _strPanelInvestimenti() {
  const inv = _strStrumentiFiltrati(['gp','fondo_libero','polizza','certificato']);

  return `
  <div class="bv-panel" style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:6px;margin-bottom:14px">
    <div style="padding:10px 14px;border-bottom:1px solid var(--border,#e5e7eb);background:#065f46;color:#fff;border-radius:6px 6px 0 0">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:12px">💎 INVESTIMENTI FINANZIARI</div>
        <div style="font-size:10px;opacity:0.85">${inv.length} posizione/i · Gestioni Patrimoniali, fondi liberi, polizze</div>
      </div>
    </div>

    <div style="padding:14px;overflow-x:auto">
      ${inv.length === 0
        ? '<div style="text-align:center;padding:24px;color:var(--text-muted,#6b7280);font-style:italic;font-size:11px">Nessun investimento registrato per la selezione corrente.</div>'
        : `<table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Banca / Codice</th>
                <th style="text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Strumento</th>
                <th style="text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Profilo</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">CV iniziale</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">CV attuale</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Risultato ${_strSelectedAnno}</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Rendim. %</th>
                <th style="text-align:center;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Stato</th>
              </tr>
            </thead>
            <tbody>
              ${inv.map(s => _strRenderRowInvestimento(s)).join('')}
            </tbody>
          </table>`
      }
    </div>
  </div>`;
}

function _strRenderRowInvestimento(s) {
  const totAnno = _strTotaleAnno(s.id, _strSelectedAnno);
  const cvIni = Number(s.controvalore_iniziale || 0);
  const cvAtt = Number(s.controvalore_attuale || 0);
  const rendPct = (cvIni > 0) ? ((cvAtt - cvIni) / cvIni * 100) : null;
  const isOpen = _strExpanded.has(s.id);
  const movs = _strMovimentiAnno(s.id, _strSelectedAnno);
  const det = s.dettaglio || {};

  let row = `
    <tr style="cursor:pointer;border-bottom:1px solid #f3f4f6" onclick="_strToggleExpand('${s.id}')" title="Click per ${isOpen ? 'chiudere' : 'aprire'} il dettaglio">
      <td style="padding:8px 10px;font-weight:600">
        <div>${_strBancaNome(s.banca_id)}</div>
        <div style="font-size:9px;color:var(--text-muted,#6b7280);font-weight:500;margin-top:2px">${s.codice}</div>
      </td>
      <td style="padding:8px 10px">
        <div>${s.descrizione || '—'}</div>
        <div style="font-size:9px;color:var(--text-muted,#6b7280);margin-top:2px">${_strTipoLabel(s.tipo)}</div>
      </td>
      <td style="padding:8px 10px;font-size:10px;color:var(--text-muted,#6b7280)">${s.profilo_rischio || '—'}</td>
      <td style="padding:8px 10px;text-align:right">${cvIni > 0 ? _strFmtE(cvIni) : '—'}</td>
      <td style="padding:8px 10px;text-align:right;font-weight:600">${cvAtt > 0 ? _strFmtE(cvAtt) : '—'}</td>
      <td style="padding:8px 10px;text-align:right">${_strFmtESign(totAnno)}</td>
      <td style="padding:8px 10px;text-align:right">${rendPct !== null ? _strFmtESign(rendPct) + ' %' : '—'}</td>
      <td style="padding:8px 10px;text-align:center">${_strStatoBadge(s.stato)}</td>
    </tr>
  `;

  if (isOpen) {
    // Sezione dettaglio: JSONB + movimenti
    let detRows = '';
    if (det && typeof det === 'object') {
      const labels = {
        rendimento_2025_lordo_pct: 'Rendimento lordo (%)',
        rendimento_2025_netto_pct: 'Rendimento netto (%)',
        benchmark_2025_pct: 'Benchmark (%)',
        commissioni_2025_netto: 'Commissioni gestione (netto IVA)',
        iva_commissioni_2025: 'IVA su commissioni',
        bolli_2025: 'Bolli',
        dividendi_cash_2025: 'Dividendi cash',
        sgr: 'SGR',
        regime_fiscale: 'Regime fiscale',
        leva_max: 'Leva massima',
        rating_sostenibilita: 'Rating sostenibilità',
        conto_sintesi: 'Conto sintesi',
        conto_titoli: 'Conto titoli'
      };
      const pairs = Object.keys(det).map(k => {
        const lab = labels[k] || k;
        let v = det[k];
        if (typeof v === 'number' && k.indexOf('pct') !== -1) v = _strFmtPct(v);
        else if (typeof v === 'number' && (k.indexOf('commissioni') !== -1 || k.indexOf('iva') !== -1 || k.indexOf('bolli') !== -1 || k.indexOf('dividendi') !== -1)) v = _strFmtE(v);
        return '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #f3f4f6"><span style="color:var(--text-muted,#6b7280);font-size:10px">' + lab + '</span><span style="font-weight:500;font-size:11px">' + v + '</span></div>';
      });
      detRows = pairs.join('');
    }

    row += `
      <tr>
        <td colspan="8" style="padding:0;background:#f9fafb;border-bottom:1px solid var(--border,#e5e7eb)">
          <div style="padding:12px 16px">
            <div style="display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-bottom:12px">
              <div>
                <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--text,#111)">Dettaglio strumento</div>
                <div style="background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:4px;padding:10px">
                  ${detRows || '<div style="font-size:10px;color:var(--text-muted,#6b7280);font-style:italic">Nessun dettaglio JSONB.</div>'}
                </div>
              </div>
              <div>
                <div style="font-size:11px;font-weight:600;margin-bottom:6px;color:var(--text,#111)">Movimenti ${_strSelectedAnno} (${movs.length})</div>
                ${movs.length === 0
                  ? '<div style="font-size:10px;color:var(--text-muted,#6b7280);font-style:italic;padding:6px 0">Nessun movimento.</div>'
                  : `<table style="width:100%;border-collapse:collapse;font-size:11px;background:#fff;border:1px solid var(--border,#e5e7eb);border-radius:4px;overflow:hidden">
                    <thead><tr style="background:#f3f4f6">
                      <th style="text-align:left;padding:5px 8px;font-weight:600;font-size:10px">Data</th>
                      <th style="text-align:left;padding:5px 8px;font-weight:600;font-size:10px">Descrizione</th>
                      <th style="text-align:right;padding:5px 8px;font-weight:600;font-size:10px">Importo</th>
                      <th style="text-align:right;padding:5px 8px;font-weight:600;font-size:10px">Cumulato</th>
                    </tr></thead>
                    <tbody>
                      ${movs.map(m => `
                        <tr style="border-bottom:1px solid #f3f4f6">
                          <td style="padding:5px 8px;font-size:10px">${_strFmtData(m.data)}</td>
                          <td style="padding:5px 8px;font-size:10px">${m.descrizione || m.tipo_movimento}</td>
                          <td style="padding:5px 8px;text-align:right;font-size:10px;font-weight:600">${_strFmtESign(m.importo)}</td>
                          <td style="padding:5px 8px;text-align:right;font-size:10px">${m.controvalore_progressivo !== null ? _strFmtE(m.controvalore_progressivo) : '—'}</td>
                        </tr>
                      `).join('')}
                    </tbody>
                  </table>`
                }
              </div>
            </div>
            ${s.note ? '<div style="padding:10px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:3px;font-size:11px;color:#78350f;line-height:1.5">📝 ' + s.note + '</div>' : ''}
          </div>
        </td>
      </tr>
    `;
  }
  return row;
}

// ── PANNELLO 4: FONDI A GARANZIA / DEPOSITI VINCOLATI ──────────────────────
function _strPanelFondiGaranzia() {
  const fondi = _strStrumentiFiltrati('fondo_garanzia');

  return `
  <div class="bv-panel" style="background:var(--card-bg,#fff);border:1px solid var(--border,#e5e7eb);border-radius:6px;margin-bottom:14px">
    <div style="padding:10px 14px;border-bottom:1px solid var(--border,#e5e7eb);background:#7c2d12;color:#fff;border-radius:6px 6px 0 0">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="font-weight:700;font-size:12px">🛡️ FONDI A GARANZIA / DEPOSITI VINCOLATI</div>
        <div style="font-size:10px;opacity:0.85">${fondi.length} posizione/i</div>
      </div>
    </div>

    <div style="padding:14px;overflow-x:auto">
      ${fondi.length === 0
        ? `<div style="text-align:center;padding:24px;color:var(--text-muted,#6b7280);font-size:11px">
            <div style="font-style:italic;margin-bottom:6px">Nessun fondo a garanzia / deposito vincolato registrato.</div>
            <div style="font-size:10px">Quando attivi una fideiussione, performance bond o garanzia ZES, registra qui il deposito vincolato.</div>
          </div>`
        : `<table style="width:100%;border-collapse:collapse;font-size:11px">
            <thead>
              <tr style="background:#f9fafb">
                <th style="text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Banca / Codice</th>
                <th style="text-align:left;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Scopo</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Importo vincolato</th>
                <th style="text-align:center;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Scadenza vincolo</th>
                <th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Interessi ${_strSelectedAnno}</th>
                <th style="text-align:center;padding:8px 10px;font-weight:600;border-bottom:2px solid var(--border,#e5e7eb)">Stato</th>
              </tr>
            </thead>
            <tbody>
              ${fondi.map(s => `
                <tr style="border-bottom:1px solid #f3f4f6">
                  <td style="padding:8px 10px;font-weight:600">
                    <div>${_strBancaNome(s.banca_id)}</div>
                    <div style="font-size:9px;color:var(--text-muted,#6b7280);font-weight:500;margin-top:2px">${s.codice}</div>
                  </td>
                  <td style="padding:8px 10px">${s.descrizione || '—'}</td>
                  <td style="padding:8px 10px;text-align:right;font-weight:600">${s.controvalore_attuale ? _strFmtE(s.controvalore_attuale) : '—'}</td>
                  <td style="padding:8px 10px;text-align:center">${_strFmtData(s.data_fine)}</td>
                  <td style="padding:8px 10px;text-align:right">${_strFmtESign(_strTotaleAnno(s.id, _strSelectedAnno))}</td>
                  <td style="padding:8px 10px;text-align:center">${_strStatoBadge(s.stato)}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>`
      }
    </div>
  </div>`;
}

// ── INTERAZIONI ────────────────────────────────────────────────────────────
function _strToggleExpand(id) {
  if (_strExpanded.has(id)) _strExpanded.delete(id);
  else _strExpanded.add(id);
  _strRender();
}
window._strToggleExpand = _strToggleExpand;

// ── MOVE PANEL HANDLERS (delegano ai globali _movePanelUp / _movePanelDown se presenti) ──
// Le frecce ▲▼ vengono renderizzate da _wrapPanel che è globale; nessun handler locale necessario.

// ── INTEGRAZIONE PIANO AMMORTAMENTO MUTUO ──────────────────────────────────
// Funzioni globali esposte per consumo da pf-banche.js (modale piano)
// _strQueryIrsPerMutuo : query diretta DB (no cache) per IRS collegato al mutuo
// _strRenderIrsBadgeForMutuo : popola un container con badge "Copertura IRS attiva"
// strApriPopupIrsMutuo : popup modale con tabella anno → cedolari/IRS/costo netto

async function _strQueryIrsPerMutuo(mutuoId) {
  if (!mutuoId) return null;
  try {
    const rs = await sb.from('banche_strumenti_finanziari')
      .select('*')
      .eq('mutuo_collegato_id', mutuoId)
      .eq('tipo', 'irs');
    const strum = rs.data || [];
    if (strum.length === 0) return { strumenti: [], movimenti: [] };
    const ids = strum.map(s => s.id);
    const rm = await sb.from('banche_strumenti_movimenti')
      .select('*')
      .in('strumento_id', ids)
      .order('data', {ascending:true});
    return { strumenti: strum, movimenti: rm.data || [] };
  } catch(e) {
    return null;
  }
}
window._strQueryIrsPerMutuo = _strQueryIrsPerMutuo;

async function _strRenderIrsBadgeForMutuo(mutuoId, containerId) {
  const cont = document.getElementById(containerId || ('irs-badge-' + mutuoId));
  if (!cont) return;
  const data = await _strQueryIrsPerMutuo(mutuoId);
  if (!data || !data.strumenti || data.strumenti.length === 0) return;
  const cumul = data.movimenti.reduce((s, m) => s + Number(m.importo || 0), 0);
  const s = data.strumenti[0];
  const colore = cumul >= 0 ? {bg:'#dcfce7', bd:'#86efac', tit:'#166534', txt:'#14532d', btn:'#fff', bbd:'#86efac'} : {bg:'#fef2f2', bd:'#fecaca', tit:'#991b1b', txt:'#7f1d1d', btn:'#fff', bbd:'#fecaca'};
  cont.innerHTML =
    '<div style="background:' + colore.bg + ';border:1px solid ' + colore.bd + ';border-radius:6px;padding:11px 14px;margin-bottom:14px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:200px">' +
        '<div style="font-size:10.5px;color:' + colore.tit + ';font-weight:700;letter-spacing:0.4px;text-transform:uppercase">🔁 Copertura IRS attiva</div>' +
        '<div style="font-size:12px;color:' + colore.txt + ';margin-top:3px;line-height:1.5">' +
          s.codice + ' · Beneficio cumulato dal ' + _strFmtData(s.data_inizio) + ': <strong>' + _strFmtESign(cumul) + '</strong> · Nozionale ' + (s.nozionale ? _strFmtE(s.nozionale, 0) : 'TBD') +
        '</div>' +
      '</div>' +
      '<button onclick="strApriPopupIrsMutuo(\'' + mutuoId + '\')" style="background:' + colore.btn + ';color:' + colore.tit + ';border:1px solid ' + colore.bbd + ';border-radius:5px;padding:7px 13px;font-weight:600;cursor:pointer;font-size:11px;white-space:nowrap">ℹ️ Dettaglio costo netto</button>' +
    '</div>';
}
window._strRenderIrsBadgeForMutuo = _strRenderIrsBadgeForMutuo;

async function strApriPopupIrsMutuo(mutuoId) {
  const data = await _strQueryIrsPerMutuo(mutuoId);
  if (!data || !data.strumenti || data.strumenti.length === 0) {
    alert('Nessun IRS collegato a questo mutuo.');
    return;
  }
  // Carico rate mutuo per calcolare cedolari per anno
  const rateRes = await sb.from('banche_finanziamenti_rate')
    .select('*').eq('finanziamento_id', mutuoId).order('data_scadenza');
  const rate = rateRes.data || [];

  const cedolariPerAnno = {};
  rate.forEach(r => {
    if (!r.data_scadenza) return;
    const anno = parseInt(String(r.data_scadenza).substring(0, 4));
    cedolariPerAnno[anno] = (cedolariPerAnno[anno] || 0) + Number(r.quota_interessi || 0);
  });
  const irsPerAnno = {};
  data.movimenti.forEach(m => {
    if (!m.anno) return;
    irsPerAnno[m.anno] = (irsPerAnno[m.anno] || 0) + Number(m.importo || 0);
  });
  const tuttiAnni = new Set();
  Object.keys(cedolariPerAnno).forEach(a => tuttiAnni.add(parseInt(a)));
  Object.keys(irsPerAnno).forEach(a => tuttiAnni.add(parseInt(a)));
  const anni = Array.from(tuttiAnni).sort((a, b) => a - b);

  const totIrs = Object.values(irsPerAnno).reduce((s, v) => s + v, 0);
  const totCed = Object.values(cedolariPerAnno).reduce((s, v) => s + v, 0);
  const rispTot = totCed > 0 ? (totIrs / totCed * 100) : 0;

  // Overlay modale
  const overlay = document.createElement('div');
  overlay.id = '_str-popup-irs';
  overlay.style.cssText = 'position:fixed;top:0;left:0;width:100vw;height:100vh;background:rgba(0,0,0,0.55);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
  overlay.onclick = function(e) { if (e.target === overlay) overlay.remove(); };

  const s0 = data.strumenti[0];
  let html = '<div style="background:#fff;max-width:820px;width:100%;max-height:90vh;overflow-y:auto;border-radius:10px;padding:24px;box-shadow:0 20px 60px rgba(0,0,0,0.35)">';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px;gap:14px">';
  html += '<div>';
  html += '<div style="font-size:18px;font-weight:700;color:#111;margin-bottom:3px">🔁 Copertura IRS — Costo netto del mutuo</div>';
  html += '<div style="font-size:12px;color:#6b7280">' + s0.codice + ' · ' + (s0.descrizione || '') + '</div>';
  html += '</div>';
  html += '<button onclick="document.getElementById(\'_str-popup-irs\').remove()" style="background:none;border:none;font-size:26px;cursor:pointer;color:#9ca3af;line-height:1;padding:0;margin:-4px -4px 0 0">×</button>';
  html += '</div>';

  // KPI cumulati
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px">';
  html += '<div style="background:#fef3c7;border:1px solid #fde68a;border-radius:6px;padding:11px"><div style="font-size:10px;color:#92400e;font-weight:700;letter-spacing:0.4px;text-transform:uppercase">Int. cedolari totali</div><div style="font-size:17px;font-weight:700;color:#78350f;margin-top:3px">' + _strFmtE(totCed) + '</div></div>';
  html += '<div style="background:#dcfce7;border:1px solid #86efac;border-radius:6px;padding:11px"><div style="font-size:10px;color:#166534;font-weight:700;letter-spacing:0.4px;text-transform:uppercase">Beneficio IRS cumulato</div><div style="font-size:17px;font-weight:700;color:#14532d;margin-top:3px">' + _strFmtESign(totIrs) + '</div></div>';
  html += '<div style="background:#eff6ff;border:1px solid #bfdbfe;border-radius:6px;padding:11px"><div style="font-size:10px;color:#1e40af;font-weight:700;letter-spacing:0.4px;text-transform:uppercase">Costo netto reale</div><div style="font-size:17px;font-weight:700;color:#1e3a8a;margin-top:3px">' + _strFmtE(totCed - totIrs) + '</div></div>';
  html += '<div style="background:#f0fdf4;border:1px solid #bbf7d0;border-radius:6px;padding:11px"><div style="font-size:10px;color:#166534;font-weight:700;letter-spacing:0.4px;text-transform:uppercase">% risparmio</div><div style="font-size:17px;font-weight:700;color:#14532d;margin-top:3px">' + (rispTot > 0 ? rispTot.toFixed(1) + ' %' : '—') + '</div></div>';
  html += '</div>';

  // Tabella anno per anno
  html += '<div style="overflow-x:auto;border:1px solid #e5e7eb;border-radius:6px">';
  html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  html += '<thead><tr style="background:#f9fafb">';
  ['Anno', 'Int. cedolari', 'Differenziale IRS', 'Costo netto', '% risparmio'].forEach(c => {
    html += '<th style="text-align:right;padding:8px 10px;font-weight:600;border-bottom:1px solid #e5e7eb">' + c + '</th>';
  });
  html += '</tr></thead><tbody>';
  anni.forEach(anno => {
    const ced = cedolariPerAnno[anno] || 0;
    const irs = irsPerAnno[anno] || 0;
    const netto = ced - irs;
    const risp = ced > 0 ? (irs / ced * 100) : 0;
    html += '<tr style="border-bottom:1px solid #f3f4f6">';
    html += '<td style="padding:7px 10px;text-align:right;font-weight:600">' + anno + '</td>';
    html += '<td style="padding:7px 10px;text-align:right;color:#78350f">' + (ced > 0 ? _strFmtE(ced) : '—') + '</td>';
    html += '<td style="padding:7px 10px;text-align:right">' + (irs !== 0 ? _strFmtESign(irs) : '—') + '</td>';
    html += '<td style="padding:7px 10px;text-align:right;font-weight:600;color:#1e3a8a">' + (ced > 0 ? _strFmtE(netto) : '—') + '</td>';
    html += '<td style="padding:7px 10px;text-align:right">' + (risp > 0 ? '<span style="color:#166534;font-weight:600">' + risp.toFixed(1) + '%</span>' : '—') + '</td>';
    html += '</tr>';
  });
  html += '<tr style="background:#f9fafb;border-top:2px solid #e5e7eb">';
  html += '<td style="padding:11px;font-weight:700">TOTALE</td>';
  html += '<td style="padding:11px;text-align:right;font-weight:700;color:#78350f">' + _strFmtE(totCed) + '</td>';
  html += '<td style="padding:11px;text-align:right;font-weight:700">' + _strFmtESign(totIrs) + '</td>';
  html += '<td style="padding:11px;text-align:right;font-weight:700;color:#1e3a8a">' + _strFmtE(totCed - totIrs) + '</td>';
  html += '<td style="padding:11px;text-align:right;font-weight:700;color:#166534">' + (rispTot > 0 ? rispTot.toFixed(1) + '%' : '—') + '</td>';
  html += '</tr>';
  html += '</tbody></table></div>';

  // Nota esplicativa
  html += '<div style="margin-top:16px;padding:13px 14px;background:#fef3c7;border-left:3px solid #f59e0b;border-radius:4px;font-size:11px;color:#78350f;line-height:1.6">';
  html += '<strong>📝 Come leggere questi numeri.</strong> ';
  html += 'Gli <em>interessi cedolari</em> sono quelli pagati formalmente alla banca in base al piano di ammortamento. ';
  html += 'Il <em>differenziale IRS</em> è quello che la banca paga (o riceve da) Phoenix Fuel in base al contratto di swap di copertura: ';
  html += 'quando l\'Euribor è sopra lo strike, la banca paga il differenziale a Phoenix (segno positivo). ';
  html += 'Il <em>costo netto reale</em> è il costo finanziario effettivo del mutuo dopo aver considerato la copertura. ';
  html += 'La <em>% risparmio</em> indica quanto il beneficio IRS ha abbattuto il costo cedolare nell\'anno.';
  html += '</div>';

  html += '</div>';
  overlay.innerHTML = html;
  document.body.appendChild(overlay);
}
window.strApriPopupIrsMutuo = strApriPopupIrsMutuo;

// ── FINE MODULO ────────────────────────────────────────────────────────────
