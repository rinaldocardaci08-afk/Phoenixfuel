// ═════════════════════════════════════════════════════════════════════════════
// pf-anticipi.js — modulo Anticipo Fatture SBF
// Phoenix Fuel — 28/04/2026
//
// Architettura:
//   - Tab "Anticipo Fatture" dentro Banche & Mutui (id: banche-panel-anticipi)
//   - Sub-tab DINAMICHE per banca: una per ogni affidamento attivo tipo
//     'sbf' o 'anticipo_fatture'. Ordinate Intesa→MPS→BNL→BCC→altri (regola #28)
//   - Sub-tab fissa "🗄 Storico" (moduli estinti/rifiutati)
//   - Sub-tab fissa "⚙ Regole" (CRUD regole anticipo per banca/cliente)
//
// Tabelle DB:
//   anticipi_sbf_regole, anticipi_sbf_presentazioni,
//   anticipi_sbf_fatture, anticipi_sbf_accrediti, anticipi_sbf_costi
//
// Helpers globali usati: fmtE, fmtD, esc, toast, sb, utenteCorrente,
//   _bancheAffidamenti, _bancheIstituti, _bancheConti, _priorityBancaIstituto,
//   _haPermesso (definito in pf-admin.js)
//
// Permessi (regola costituzionale #30, allineati al sistema permessi reale del
// programma — tabella `permessi` + cache `_permessiUtente`):
//   - Sezione 'anticipi' (lettura libera): chi ha la sezione attiva vede il
//     modulo; senza la sezione, la tab "Anticipo Fatture" è nascosta
//     (gating in pf-banche.js _applicaPermessiTabBanche).
//   - Tutti i write riservati a ruolo === 'admin' (decisione utente 28/04).
// ═════════════════════════════════════════════════════════════════════════════

// ═════════════════════════════════════════════════════════════════════════════
// SISTEMA PERMESSI MODULO ANTICIPI
// ═════════════════════════════════════════════════════════════════════════════
// Lettura: chi ha la sezione 'anticipi' attiva nei permessi può vedere modulo
//          e storico (anche operatori non-admin).
// Write: tutti i bottoni di scrittura (presenta, accredito, incasso, modifica,
//        regole) sono riservati a ruolo 'admin'.
// ─────────────────────────────────────────────────────────────────────────────
function _antIsAdmin() {
  return typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.ruolo === 'admin';
}
function _antPuoVedere() {
  if (typeof utenteCorrente === 'undefined' || !utenteCorrente) return false;
  if (utenteCorrente.ruolo === 'admin') return true;
  return (typeof _haPermesso === 'function') && _haPermesso('anticipi');
}
// Tutti i write = solo admin (decisione utente 28/04)
function _antPuoPresentare()    { return _antIsAdmin(); }
function _antPuoAccredito()     { return _antIsAdmin(); }
function _antPuoIncasso()       { return _antIsAdmin(); }
function _antPuoModificare()    { return _antIsAdmin(); }
function _antPuoGestireRegole() { return _antIsAdmin(); }
function _antPuoVedereStorico() { return _antPuoVedere(); }

// ─── STATE ─────────────────────────────────────────────────────────────────
var _antSubTabAttiva = null;       // id tab attiva: 'banca:<affidamento_id>' | 'storico' | 'regole'
var _antPresentazioniByAff = {};   // {affidamento_id: [presentazioni con fatture+accrediti]}
var _antRegoleByAff = {};          // {affidamento_id: [regole con cliente]}
var _antClientiCache = null;       // cache clienti
var _antFattureDisponibiliCache = null; // cache fatture non anticipate
var _antFiltri = {                 // filtri per tab banca
  stato: 'tutti', anno: new Date().getFullYear(), cliente: 'tutti', search: ''
};

// ─── ENTRY POINT (chiamato da switchBancheTab) ────────────────────────────
async function renderBancheAnticipi() {
  const cont = document.getElementById('banche-panel-anticipi');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">⏳ Caricamento moduli anticipo...</div>';

  // Pre-carica affidamenti se non in cache (di solito già caricati da renderBanche)
  if (!_bancheAffidamenti.length || !_bancheIstituti.length) {
    const [affRes, istRes, ccRes] = await Promise.all([
      sb.from('banche_affidamenti').select('*'),
      sb.from('banche_istituti').select('*').order('nome'),
      sb.from('banche_conti').select('*')
    ]);
    _bancheAffidamenti = affRes.data || [];
    _bancheIstituti = istRes.data || [];
    _bancheConti = ccRes.data || [];
  }

  // Filtra fidi anticipi attivi e ordina con priorità banca
  const fidiAnticipi = _bancheAffidamenti
    .filter(a => a.stato === 'attivo' && (a.tipo === 'sbf' || a.tipo === 'anticipo_fatture'))
    .sort((a, b) => {
      const istA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
      const istB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
      const pA = _priorityBancaIstituto(istA);
      const pB = _priorityBancaIstituto(istB);
      if (pA !== pB) return pA - pB;
      return istA.localeCompare(istB);
    });

  if (!fidiAnticipi.length) {
    cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);background:var(--bg-card);border-radius:10px;border:0.5px solid var(--border)">'
      + '<div style="font-size:36px;margin-bottom:10px;opacity:0.4">📄</div>'
      + '<div style="font-size:14px;font-weight:600;margin-bottom:6px">Nessun affidamento anticipo fatture configurato</div>'
      + '<div style="font-size:12px">Crea un fido di tipo <strong>SBF</strong> o <strong>Anticipo Fatture</strong> nella tab <a href="#" onclick="document.querySelector(\'[data-tab=banche-panel-affidamenti]\').click();return false" style="color:#26215C;font-weight:600">Affidamenti</a> per iniziare a usare questo modulo.</div>'
      + '</div>';
    return;
  }

  // Check permesso lettura globale modulo
  if (!_antPuoVedere() && !_antPuoVedereStorico() && !_antPuoGestireRegole()) {
    cont.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);background:var(--bg-card);border-radius:10px;border:0.5px solid var(--border)">'
      + '<div style="font-size:36px;margin-bottom:10px;opacity:0.4">🔒</div>'
      + '<div style="font-size:14px;font-weight:600;margin-bottom:6px">Accesso non autorizzato</div>'
      + '<div style="font-size:12px">Non hai i permessi per visualizzare il modulo Anticipo Fatture. Contatta l\'amministratore.</div>'
      + '</div>';
    return;
  }

  // Inizializza tab attiva: se non vede banche ma vede storico/regole, parti da una tab disponibile
  if (!_antSubTabAttiva || (
    _antSubTabAttiva.startsWith('banca:') &&
    !fidiAnticipi.find(f => 'banca:' + f.id === _antSubTabAttiva)
  )) {
    if (_antPuoVedere() && fidiAnticipi.length) {
      _antSubTabAttiva = 'banca:' + fidiAnticipi[0].id;
    } else if (_antPuoVedereStorico()) {
      _antSubTabAttiva = 'storico';
    } else {
      _antSubTabAttiva = 'regole';
    }
  }

  // ─── HEADER + SUB-TAB ─────────────────────────────────────────────────
  let html = '';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:14px;padding-bottom:10px;border-bottom:0.5px solid var(--border)">';
  // Sub-tab banche solo se ha permesso lettura
  if (_antPuoVedere()) {
    fidiAnticipi.forEach(f => {
      const ist = _bancheIstituti.find(i => i.id === f.istituto_id) || {};
      const cc = _bancheConti.find(c => c.id === f.conto_id);
      const isAttiva = _antSubTabAttiva === 'banca:' + f.id;
      const numero = cc && cc.numero_conto ? ' /' + esc(cc.numero_conto.slice(-4)) : '';
      html += '<button onclick="_antSwitchTab(\'banca:' + f.id + '\')" '
        + 'style="background:' + (isAttiva ? '#1a1a18' : 'var(--bg)') + ';color:' + (isAttiva ? '#FAC775' : 'var(--text)')
        + ';border:0.5px solid var(--border);border-radius:6px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:' + (isAttiva ? '600' : '500') + '">'
        + '🏦 ' + esc(ist.nome || '—') + numero
        + '</button>';
    });
  }
  // Tab Storico (solo se ha permesso)
  if (_antPuoVedereStorico()) {
    const storicoActive = _antSubTabAttiva === 'storico';
    html += '<button onclick="_antSwitchTab(\'storico\')" '
      + 'style="background:' + (storicoActive ? '#1a1a18' : 'var(--bg)') + ';color:' + (storicoActive ? '#FAC775' : 'var(--text-muted)')
      + ';border:0.5px solid var(--border);border-radius:6px;padding:7px 13px;font-size:12px;cursor:pointer;margin-left:auto">'
      + '🗄 Storico'
      + '</button>';
  }
  // Tab Regole (solo se ha permesso CRUD)
  if (_antPuoGestireRegole()) {
    const regoleActive = _antSubTabAttiva === 'regole';
    html += '<button onclick="_antSwitchTab(\'regole\')" '
      + 'style="background:' + (regoleActive ? '#534AB7' : '#EEEDFE') + ';color:' + (regoleActive ? '#fff' : '#26215C')
      + ';border:1px dashed #6B5FCC;border-radius:6px;padding:7px 13px;font-size:12px;cursor:pointer;font-weight:600' + (_antPuoVedereStorico() ? '' : ';margin-left:auto') + '">'
      + '⚙ Regole'
      + '</button>';
  }
  html += '</div>';

  // ─── PANNELLO ATTIVO ──────────────────────────────────────────────────
  html += '<div id="ant-content">';
  html += '<div style="padding:20px;text-align:center;color:var(--text-muted)">⏳ Caricamento...</div>';
  html += '</div>';

  cont.innerHTML = html;

  // Carica contenuto della sub-tab attiva
  if (_antSubTabAttiva.startsWith('banca:')) {
    const affId = _antSubTabAttiva.slice(6);
    await _antRenderTabBanca(affId);
  } else if (_antSubTabAttiva === 'storico') {
    await _antRenderTabStorico();
  } else if (_antSubTabAttiva === 'regole') {
    await _antRenderTabRegole();
  }
}

// ─── SWITCH TAB ────────────────────────────────────────────────────────────
function _antSwitchTab(tabId) {
  _antSubTabAttiva = tabId;
  renderBancheAnticipi();
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB BANCA — moduli attivi (in_delibera/anticipata_parziale/anticipata)
// ═══════════════════════════════════════════════════════════════════════════
async function _antRenderTabBanca(affidamentoId) {
  const cont = document.getElementById('ant-content');
  if (!cont) return;

  const aff = _bancheAffidamenti.find(a => a.id === affidamentoId);
  if (!aff) { cont.innerHTML = '<div style="padding:30px;text-align:center;color:#A32D2D">Affidamento non trovato</div>'; return; }
  const ist = _bancheIstituti.find(i => i.id === aff.istituto_id) || {};
  const cc = _bancheConti.find(c => c.id === aff.conto_id) || {};

  // Carica presentazioni della banca con fatture e accrediti
  // Escludo 'estinta' e 'rifiutata' (sono in tab Storico)
  const { data: presentazioni, error } = await sb.from('anticipi_sbf_presentazioni')
    .select('*')
    .eq('affidamento_id', affidamentoId)
    .not('stato', 'in', '(estinta,rifiutata)')
    .order('data_presentazione', { ascending: false });

  if (error) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:#A32D2D">❌ ' + esc(error.message) + '</div>';
    return;
  }

  // Carica fatture e accrediti per ogni presentazione
  const presIds = (presentazioni || []).map(p => p.id);
  let fatturePerPres = {}, accreditiPerPres = {};
  if (presIds.length) {
    const [ftRes, acRes] = await Promise.all([
      sb.from('anticipi_sbf_fatture').select('*').in('presentazione_id', presIds),
      sb.from('anticipi_sbf_accrediti').select('*').in('presentazione_id', presIds).order('data_accredito')
    ]);
    (ftRes.data || []).forEach(f => {
      if (!fatturePerPres[f.presentazione_id]) fatturePerPres[f.presentazione_id] = [];
      fatturePerPres[f.presentazione_id].push(f);
    });
    (acRes.data || []).forEach(a => {
      if (!accreditiPerPres[a.presentazione_id]) accreditiPerPres[a.presentazione_id] = [];
      accreditiPerPres[a.presentazione_id].push(a);
    });
  }

  // Cache per altre operazioni nella sessione
  _antPresentazioniByAff[affidamentoId] = (presentazioni || []).map(p => ({
    ...p,
    _fatture: fatturePerPres[p.id] || [],
    _accrediti: accreditiPerPres[p.id] || []
  }));

  // ─── KPI BANCA ────────────────────────────────────────────────────────
  const monteAcc = Number(aff.importo_accordato || 0);
  // Utilizzo = somma anticipato_totale dei moduli attivi - somma estinto delle loro fatture
  let utilizzo = 0;
  let nFattureScadenza7gg = 0, nFattureScadute = 0;
  const oggi = new Date();
  const tra7gg = new Date(); tra7gg.setDate(oggi.getDate() + 7);

  _antPresentazioniByAff[affidamentoId].forEach(p => {
    const totEstinto = p._fatture.reduce((s, f) => s + Number(f.importo_estinto || 0), 0);
    utilizzo += Math.max(0, Number(p.importo_anticipato_totale || 0) - totEstinto);
    p._fatture.forEach(f => {
      if (f.stato !== 'estinta' && f.stato !== 'esclusa' && f.scadenza_banca) {
        const sb_d = new Date(f.scadenza_banca + 'T12:00:00');
        if (sb_d < oggi) nFattureScadute++;
        else if (sb_d <= tra7gg) nFattureScadenza7gg++;
      }
    });
  });

  const disponibile = Math.max(0, monteAcc - utilizzo);
  const pctUtilizzo = monteAcc > 0 ? (utilizzo / monteAcc * 100) : 0;
  const colorePct = pctUtilizzo >= 80 ? '#A32D2D' : (pctUtilizzo >= 50 ? '#BA7517' : '#27500A');
  const pctDefault = aff.pct_anticipo_default !== null && aff.pct_anticipo_default !== undefined ? Number(aff.pct_anticipo_default) : 100;
  const baseDefault = aff.base_calcolo_default || 'imponibile';
  const giorniEst = aff.giorni_estinzione_anticipo || 30;

  let html = '';

  // Box info banca
  html += '<div style="background:#EEEDFE;border-left:4px solid #6B5FCC;padding:14px 18px;border-radius:6px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">';
  html += '<div>';
  html += '<div style="font-size:14px;font-weight:700;color:#26215C">🏦 ' + esc(ist.nome || '—') + (cc.numero_conto ? ' <span style="font-family:var(--font-mono);font-size:11px;font-weight:500;color:#666">N. ' + esc(cc.numero_conto) + '</span>' : '') + '</div>';
  html += '<div style="font-size:11px;color:#666;margin-top:3px">';
  html += 'Tipo: <strong>' + (aff.tipo === 'sbf' ? 'SBF' : 'Anticipo fatture') + '</strong>';
  html += ' · % default: <strong style="color:#26215C">' + pctDefault + '% su ' + baseDefault + '</strong>';
  html += ' · Estinzione default: <strong>+' + giorniEst + ' gg</strong>';
  if (aff.tasso) html += ' · Tasso: <strong>' + Number(aff.tasso).toFixed(3) + '%</strong>';
  html += '</div>';
  html += '</div>';
  html += '<div style="text-align:right">';
  html += '<div style="font-size:10px;color:#666">Disponibilità residua</div>';
  html += '<div style="font-size:18px;font-weight:700;color:#27500A;font-family:var(--font-mono)">' + fmtE(disponibile) + '</div>';
  html += '</div>';
  html += '</div>';

  // KPI row
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:10px;margin-bottom:16px">';
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-left:4px solid #6B5FCC;padding:12px 14px;border-radius:8px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Monte accordato</div><div style="font-size:18px;font-weight:700;font-family:var(--font-mono);margin-top:4px">' + fmtE(monteAcc) + '</div></div>';
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-left:4px solid ' + colorePct + ';padding:12px 14px;border-radius:8px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Utilizzo attuale</div><div style="font-size:18px;font-weight:700;font-family:var(--font-mono);margin-top:4px;color:' + colorePct + '">' + fmtE(utilizzo) + '</div><div style="font-size:11px;color:' + colorePct + ';margin-top:3px;font-weight:600">' + pctUtilizzo.toFixed(1) + '%</div></div>';
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-left:4px solid #639922;padding:12px 14px;border-radius:8px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Disponibile</div><div style="font-size:18px;font-weight:700;font-family:var(--font-mono);margin-top:4px;color:#27500A">' + fmtE(disponibile) + '</div></div>';
  const colorRischio = nFattureScadute > 0 ? '#A32D2D' : (nFattureScadenza7gg > 0 ? '#BA7517' : '#888');
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-left:4px solid ' + colorRischio + ';padding:12px 14px;border-radius:8px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Rischio scadenze</div><div style="font-size:18px;font-weight:700;font-family:var(--font-mono);margin-top:4px;color:' + colorRischio + '">' + (nFattureScadute + nFattureScadenza7gg) + '</div><div style="font-size:10px;color:' + colorRischio + ';margin-top:3px">' + (nFattureScadenza7gg > 0 ? nFattureScadenza7gg + ' entro 7gg' : '') + (nFattureScadute > 0 ? (nFattureScadenza7gg > 0 ? ' · ' : '') + nFattureScadute + ' scadute ⚠' : '') + '</div></div>';
  html += '</div>';

  // Toolbar
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px">';
  html += '<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">';
  html += '<select onchange="_antSetFiltro(\'stato\',this.value)" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:5px;font-size:11px;background:var(--bg-card);color:var(--text)">';
  ['tutti','in_delibera','anticipata_parziale','anticipata'].forEach(s => {
    const lab = s === 'tutti' ? 'Stato: tutti' : (s === 'in_delibera' ? 'In delibera' : (s === 'anticipata_parziale' ? 'Anticipata parziale' : 'Anticipata'));
    html += '<option value="' + s + '"' + (_antFiltri.stato === s ? ' selected' : '') + '>' + lab + '</option>';
  });
  html += '</select>';
  html += '<input type="text" placeholder="🔍 Cliente o n. fattura..." value="' + esc(_antFiltri.search) + '" oninput="_antSetFiltro(\'search\',this.value)" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:5px;font-size:11px;background:var(--bg-card);min-width:200px;color:var(--text)">';
  html += '</div>';
  html += '<div style="display:flex;gap:6px">';
  if (_antPuoPresentare()) {
    html += '<button onclick="_antApriModalePresenta(\'' + affidamentoId + '\')" style="background:#26215C;color:#fff;border:0;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600">+ Presenta nuove fatture</button>';
  }
  html += '<button onclick="_antStampaPDFBanca(\'' + affidamentoId + '\')" style="background:#1a1a18;color:#FAC775;border:0;border-radius:6px;padding:7px 12px;font-size:12px;cursor:pointer">📄 PDF</button>';
  html += '</div>';
  html += '</div>';

  // ─── TABELLA MODULI/FATTURE ───────────────────────────────────────────
  if (!presentazioni || !presentazioni.length) {
    html += '<div style="padding:40px;text-align:center;color:var(--text-muted);background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border)">'
      + '<div style="font-size:32px;opacity:0.3;margin-bottom:8px">📭</div>'
      + '<div style="font-size:13px;font-weight:600;margin-bottom:4px">Nessun modulo anticipo attivo</div>'
      + '<div style="font-size:11px">Click su <strong>+ Presenta nuove fatture</strong> per crearne uno</div>'
      + '</div>';
  } else {
    // Lista moduli (uno per blocco) — ognuno espandibile
    _antPresentazioniByAff[affidamentoId].forEach(p => {
      html += _antRenderModuloCard(p, aff);
    });
  }

  cont.innerHTML = html;
}

// ─── RENDER SINGOLO MODULO (card espandibile) ─────────────────────────────
function _antRenderModuloCard(p, aff) {
  const totFatture = p._fatture.length;
  const nEstinte = p._fatture.filter(f => f.stato === 'estinta').length;
  const nAnticipate = p._fatture.filter(f => f.stato === 'anticipata').length;
  const importoEstinto = p._fatture.reduce((s, f) => s + Number(f.importo_estinto || 0), 0);
  const importoAttivo = Number(p.importo_anticipato_totale || 0) - importoEstinto;
  const pctChiusura = totFatture > 0 ? (nEstinte / totFatture * 100) : 0;

  const statoColor = {
    'in_delibera': { bg: '#EEEDFE', fg: '#26215C', label: 'In delibera' },
    'anticipata_parziale': { bg: '#FAEEDA', fg: '#633806', label: 'Anticipata parziale' },
    'anticipata': { bg: '#E6F1FB', fg: '#0C447C', label: 'Anticipata' }
  }[p.stato] || { bg: '#f0f0f0', fg: '#666', label: p.stato };

  let html = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;margin-bottom:12px;overflow:hidden">';

  // Header modulo
  html += '<div style="padding:12px 16px;background:var(--bg);border-bottom:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">';
  html += '<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">';
  html += '<div>';
  html += '<div style="font-size:13px;font-weight:700;color:var(--text)">📋 Modulo del ' + fmtD(p.data_presentazione);
  if (p.numero_protocollo) html += ' <span style="font-family:var(--font-mono);font-size:11px;font-weight:500;color:var(--text-muted)">· prot. ' + esc(p.numero_protocollo) + '</span>';
  html += '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">';
  html += totFatture + ' fatture · ' + nAnticipate + ' anticipate · ' + nEstinte + ' estinte';
  if (p.scadenza_banca_default) html += ' · scad. modulo: <strong>' + fmtD(p.scadenza_banca_default) + '</strong>';
  html += '</div>';
  html += '</div>';
  html += '<div style="display:flex;gap:6px;align-items:center">';
  html += '<span style="background:' + statoColor.bg + ';color:' + statoColor.fg + ';padding:3px 10px;border-radius:10px;font-size:10px;font-weight:700;letter-spacing:0.3px">' + statoColor.label + '</span>';
  html += '</div>';
  html += '</div>';
  // Importi
  html += '<div style="display:flex;gap:18px;align-items:baseline;flex-wrap:wrap">';
  html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Richiesto</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600">' + fmtE(p.importo_richiesto) + '</span></div>';
  html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Anticipato</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:#26215C">' + fmtE(p.importo_anticipato_totale) + '</span></div>';
  if (importoEstinto > 0) html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Estinto</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:#27500A">' + fmtE(importoEstinto) + '</span></div>';
  html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Aperto</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:' + (importoAttivo > 0 ? '#BA7517' : '#888') + '">' + fmtE(importoAttivo) + '</span></div>';
  html += '<div style="margin-left:auto;display:flex;gap:5px">';
  if (_antPuoAccredito() && (p.stato === 'in_delibera' || p.stato === 'anticipata_parziale')) {
    html += '<button onclick="_antApriModaleAccredito(\'' + p.id + '\')" title="Registra accredito banca" style="background:#27500A;color:#fff;border:0;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer">💰 Accredito</button>';
  }
  if (_antPuoModificare()) {
    html += '<button onclick="_antApriModaleModulo(\'' + p.id + '\')" title="Modifica modulo" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:5px 10px;border-radius:5px;cursor:pointer;font-size:11px">✏️</button>';
  }
  html += '</div>';
  html += '</div>';
  html += '</div>';

  // Tabella fatture
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">';
  html += '<thead><tr style="background:var(--bg)">';
  ['Nr Ft','Data', 'Cliente', 'Imponibile', 'Totale', '% Ant.', 'Anticipato', 'Estinto', 'Scad. cliente', 'Scad. banca', 'Stato', ''].forEach(h => {
    html += '<th style="text-align:left;padding:8px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;border-bottom:0.5px solid var(--border)">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';

  const oggi = new Date();
  p._fatture.forEach(f => {
    const sb_d = f.scadenza_banca ? new Date(f.scadenza_banca + 'T12:00:00') : null;
    const giorniRest = sb_d ? Math.floor((sb_d - oggi) / 86400000) : null;
    const isScaduta = giorniRest !== null && giorniRest < 0;
    const isVicina = giorniRest !== null && giorniRest >= 0 && giorniRest <= 7;
    const rowBg = f.stato === 'estinta' ? 'opacity:0.6' : (isScaduta ? 'background:#FCEBEB' : (isVicina ? 'background:#FAEEDA' : ''));

    const stColors = {
      'presentata': { bg: '#EEEDFE', fg: '#26215C', label: 'Presentata' },
      'anticipata': { bg: '#E6F1FB', fg: '#0C447C', label: 'Anticipata' },
      'estinta': { bg: '#EAF3DE', fg: '#27500A', label: 'Estinta' },
      'insoluta': { bg: '#FCEBEB', fg: '#791F1F', label: 'Insoluta' },
      'esclusa': { bg: '#f0f0f0', fg: '#888', label: 'Esclusa' }
    }[f.stato] || { bg: '#f0f0f0', fg: '#666', label: f.stato };

    html += '<tr style="border-bottom:0.5px solid var(--border);' + rowBg + '">';
    html += '<td style="padding:7px 8px;font-family:var(--font-mono);font-weight:600">' + esc(f.numero_fattura || '—') + '</td>';
    html += '<td style="padding:7px 8px">' + (f.data_emissione ? fmtD(f.data_emissione) : '—') + '</td>';
    html += '<td style="padding:7px 8px">' + esc(f.cliente_nome || '—') + '</td>';
    html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono)">' + fmtE(f.imponibile) + '</td>';
    html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + fmtE(f.totale_fattura) + '</td>';
    html += '<td style="padding:7px 8px;text-align:center;font-family:var(--font-mono);font-size:10px">' + (f.percentuale_applicata !== null ? Number(f.percentuale_applicata).toFixed(0) + '%' : '—') + '</td>';
    html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:#26215C;font-weight:600">' + fmtE(f.importo_anticipato_calcolato) + '</td>';
    html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:' + (Number(f.importo_estinto) > 0 ? '#27500A' : 'var(--text-hint)') + ';font-weight:' + (Number(f.importo_estinto) > 0 ? '600' : '400') + '">' + fmtE(f.importo_estinto) + '</td>';
    html += '<td style="padding:7px 8px">' + (f.scadenza_cliente ? fmtD(f.scadenza_cliente) : '—') + '</td>';
    html += '<td style="padding:7px 8px;font-weight:' + (isScaduta || isVicina ? '700' : '500') + ';color:' + (isScaduta ? '#A32D2D' : (isVicina ? '#BA7517' : 'var(--text)')) + '">';
    html += f.scadenza_banca ? fmtD(f.scadenza_banca) : '—';
    if (isScaduta) html += ' <span style="font-size:9px">⚠</span>';
    html += '</td>';
    html += '<td style="padding:5px 8px"><span style="background:' + stColors.bg + ';color:' + stColors.fg + ';padding:2px 8px;border-radius:9px;font-size:9px;font-weight:700;letter-spacing:0.3px">' + stColors.label + '</span></td>';
    html += '<td style="padding:5px 8px;text-align:right">';
    if (f.stato === 'anticipata' && _antPuoIncasso()) {
      html += '<button onclick="_antRegistraIncasso(\'' + f.id + '\')" title="Registra incasso cliente" style="background:none;border:0.5px solid #27500A;color:#27500A;border-radius:4px;padding:3px 8px;font-size:10px;cursor:pointer;font-weight:600">✓ Incasso</button>';
    } else if (f.stato !== 'anticipata' && _antPuoModificare()) {
      html += '<button onclick="_antApriModaleFattura(\'' + f.id + '\')" title="Modifica" style="background:none;border:0.5px solid var(--border);color:var(--text-muted);padding:3px 8px;border-radius:4px;cursor:pointer;font-size:11px">✏️</button>';
    }
    html += '</td>';
    html += '</tr>';
  });
  html += '</tbody></table></div>';

  // Footer accrediti (se ci sono)
  if (p._accrediti && p._accrediti.length) {
    html += '<div style="background:#EAF3DE;border-top:0.5px solid #97C459;padding:8px 14px;font-size:11px;color:#27500A">';
    html += '<strong>💰 Accrediti banca:</strong> ';
    html += p._accrediti.map(a => fmtE(a.importo) + ' (' + fmtD(a.data_accredito) + ')').join(' · ');
    html += '</div>';
  }

  // Barra progresso chiusura
  if (totFatture > 0) {
    html += '<div style="height:6px;background:#f0f0f0;position:relative">';
    html += '<div style="height:100%;width:' + pctChiusura + '%;background:linear-gradient(90deg,#639922,#97C459);transition:width 0.3s"></div>';
    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ─── FILTRI ───────────────────────────────────────────────────────────────
function _antSetFiltro(campo, val) {
  _antFiltri[campo] = val;
  // Per ora rerender: in futuro filtra solo lato client
  renderBancheAnticipi();
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB STORICO — moduli estinti/rifiutati
// ═══════════════════════════════════════════════════════════════════════════
async function _antRenderTabStorico() {
  const cont = document.getElementById('ant-content');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">⏳ Caricamento storico...</div>';

  const { data: presStorico, error } = await sb.from('anticipi_sbf_presentazioni')
    .select('*')
    .in('stato', ['estinta', 'rifiutata'])
    .order('data_presentazione', { ascending: false })
    .limit(500);

  if (error) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:#A32D2D">❌ ' + esc(error.message) + '</div>';
    return;
  }

  // Carica fatture per ognuno (per riepilogo)
  const presIds = (presStorico || []).map(p => p.id);
  let fatturePerPres = {};
  if (presIds.length) {
    const { data: ftRes } = await sb.from('anticipi_sbf_fatture')
      .select('presentazione_id, totale_fattura, importo_estinto, stato, cliente_nome')
      .in('presentazione_id', presIds);
    (ftRes || []).forEach(f => {
      if (!fatturePerPres[f.presentazione_id]) fatturePerPres[f.presentazione_id] = [];
      fatturePerPres[f.presentazione_id].push(f);
    });
  }

  let html = '';
  html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:14px;margin-bottom:12px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">';
  html += '<div><div style="font-size:14px;font-weight:700;color:var(--text)">🗄 Storico moduli anticipi</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">Tutti i moduli chiusi (estinti) o rifiutati. Solo lettura — non modificabili.</div></div>';
  html += '<div style="font-size:13px;color:var(--text-muted)"><strong>' + (presStorico || []).length + '</strong> moduli</div>';
  html += '</div></div>';

  if (!presStorico || !presStorico.length) {
    html += '<div style="padding:40px;text-align:center;color:var(--text-muted);background:var(--bg-card);border-radius:8px">Nessun modulo nello storico</div>';
    cont.innerHTML = html;
    return;
  }

  html += '<table style="width:100%;border-collapse:collapse;font-size:11px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">';
  html += '<thead><tr style="background:var(--bg)">';
  ['Data', 'Banca', 'Protocollo', 'Stato', 'N° Ft', 'Richiesto', 'Anticipato', 'Note', ''].forEach(h => {
    html += '<th style="text-align:left;padding:9px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;border-bottom:0.5px solid var(--border)">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';

  presStorico.forEach(p => {
    const aff = _bancheAffidamenti.find(a => a.id === p.affidamento_id);
    const ist = aff ? _bancheIstituti.find(i => i.id === aff.istituto_id) : null;
    const fatture = fatturePerPres[p.id] || [];
    const stColor = p.stato === 'estinta'
      ? { bg: '#EAF3DE', fg: '#27500A', label: 'Estinta' }
      : { bg: '#FCEBEB', fg: '#791F1F', label: 'Rifiutata' };

    html += '<tr style="border-bottom:0.5px solid var(--border)">';
    html += '<td style="padding:8px 10px;font-family:var(--font-mono);font-size:11px">' + fmtD(p.data_presentazione) + '</td>';
    html += '<td style="padding:8px 10px;font-weight:500">' + esc((ist || {}).nome || '—') + '</td>';
    html += '<td style="padding:8px 10px;font-family:var(--font-mono);color:var(--text-muted);font-size:10px">' + esc(p.numero_protocollo || '—') + '</td>';
    html += '<td style="padding:8px 10px"><span style="background:' + stColor.bg + ';color:' + stColor.fg + ';padding:2px 8px;border-radius:9px;font-size:9px;font-weight:700">' + stColor.label + '</span></td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono)">' + fatture.length + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:600">' + fmtE(p.importo_richiesto) + '</td>';
    html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#26215C">' + fmtE(p.importo_anticipato_totale) + '</td>';
    html += '<td style="padding:8px 10px;font-size:10px;color:var(--text-muted);max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(p.note || '') + '</td>';
    html += '<td style="padding:5px 10px;text-align:right"><button onclick="_antApriDettaglioModulo(\'' + p.id + '\')" title="Dettaglio" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:4px 9px;border-radius:5px;cursor:pointer;font-size:11px">🔍</button></td>';
    html += '</tr>';
  });

  html += '</tbody></table>';
  cont.innerHTML = html;
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB REGOLE — CRUD regole anticipo per banca/cliente
// ═══════════════════════════════════════════════════════════════════════════
var _antRegoleBancaSelected = null;

async function _antRenderTabRegole() {
  const cont = document.getElementById('ant-content');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">⏳ Caricamento regole...</div>';

  // Lista fidi anticipi
  const fidi = _bancheAffidamenti
    .filter(a => a.stato === 'attivo' && (a.tipo === 'sbf' || a.tipo === 'anticipo_fatture'))
    .sort((a, b) => {
      const istA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
      const istB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
      const pA = _priorityBancaIstituto(istA);
      const pB = _priorityBancaIstituto(istB);
      if (pA !== pB) return pA - pB;
      return istA.localeCompare(istB);
    });

  if (!_antRegoleBancaSelected && fidi.length) _antRegoleBancaSelected = fidi[0].id;

  // Carica clienti per dropdown se non in cache
  if (!_antClientiCache) {
    try {
      const { data } = await sb.from('clienti').select('id, ragione_sociale, denominazione, nome').limit(2000);
      _antClientiCache = (data || []).map(c => ({
        id: c.id,
        nome: c.ragione_sociale || c.denominazione || c.nome || '—'
      })).sort((a, b) => a.nome.localeCompare(b.nome));
    } catch (e) {
      _antClientiCache = [];
    }
  }

  // Carica regole della banca selezionata
  let regole = [];
  if (_antRegoleBancaSelected) {
    const { data } = await sb.from('anticipi_sbf_regole')
      .select('*')
      .eq('affidamento_id', _antRegoleBancaSelected);
    regole = data || [];
  }

  let html = '';
  html += '<div style="background:#EEEDFE;border-left:4px solid #6B5FCC;padding:14px 18px;border-radius:6px;margin-bottom:14px">';
  html += '<div style="font-size:14px;font-weight:700;color:#26215C">⚙ Regole anticipo per banca/cliente</div>';
  html += '<div style="font-size:11px;color:#666;margin-top:3px">Configura percentuali, massimali e blacklist. La regola DEFAULT (cliente=Ø) si applica a tutti i clienti senza regola specifica.</div>';
  html += '</div>';

  // Selettore banca
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:10px">';
  html += '<div style="display:flex;align-items:center;gap:10px">';
  html += '<label style="font-size:11px;color:var(--text-muted);font-weight:600">Banca:</label>';
  html += '<select onchange="_antRegoleBancaSelected=this.value;_antRenderTabRegole()" style="padding:7px 12px;border:0.5px solid var(--border);border-radius:6px;font-size:12px;background:var(--bg-card);color:var(--text)">';
  fidi.forEach(f => {
    const ist = _bancheIstituti.find(i => i.id === f.istituto_id) || {};
    const cc = _bancheConti.find(c => c.id === f.conto_id);
    const lab = (ist.nome || '—') + (cc && cc.numero_conto ? ' /' + cc.numero_conto.slice(-4) : '');
    html += '<option value="' + f.id + '"' + (_antRegoleBancaSelected === f.id ? ' selected' : '') + '>' + esc(lab) + '</option>';
  });
  html += '</select>';
  html += '</div>';
  if (_antPuoGestireRegole() && _antRegoleBancaSelected) {
    html += '<button onclick="_antApriModaleRegola(null,\'' + _antRegoleBancaSelected + '\')" style="background:#26215C;color:#fff;border:0;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600">+ Aggiungi regola cliente</button>';
  }
  html += '</div>';

  // Tabella regole
  html += '<table style="width:100%;border-collapse:collapse;font-size:12px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">';
  html += '<thead><tr style="background:var(--bg)">';
  ['Cliente', '% Anticipo', 'Base calcolo', 'Massimale', 'Stato', 'Note', ''].forEach(h => {
    html += '<th style="text-align:left;padding:9px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;border-bottom:0.5px solid var(--border)">' + h + '</th>';
  });
  html += '</tr></thead><tbody>';

  // Regola DEFAULT prima
  const def = regole.find(r => !r.cliente_id);
  if (def) html += _antRenderRigaRegola(def, true);

  // Altre regole ordinate per nome cliente
  const altre = regole.filter(r => r.cliente_id);
  altre.sort((a, b) => {
    const cA = _antClientiCache.find(c => c.id === a.cliente_id);
    const cB = _antClientiCache.find(c => c.id === b.cliente_id);
    return ((cA || {}).nome || '').localeCompare(((cB || {}).nome || ''));
  });
  altre.forEach(r => html += _antRenderRigaRegola(r, false));

  html += '</tbody></table>';

  if (regole.length === 0) {
    html += '<div style="margin-top:10px;padding:14px;background:#FAEEDA;border-left:4px solid #BA7517;color:#633806;font-size:11px;border-radius:6px">⚠ Nessuna regola configurata. Vai in Affidamenti e compila i campi <strong>% default</strong> e <strong>base calcolo</strong> sul fido per generare automaticamente la regola DEFAULT.</div>';
  } else {
    html += '<div style="margin-top:10px;padding:10px 14px;background:#EEEDFE;border-left:4px solid #6B5FCC;color:#26215C;font-size:11px;border-radius:6px">💡 I clienti non in lista ereditano la regola DEFAULT della banca. Per escludere un cliente specifico aggiungi una regola con stato <strong>esclusa</strong>.</div>';
  }

  cont.innerHTML = html;
}

function _antRenderRigaRegola(r, isDefault) {
  const cliente = isDefault ? null : (_antClientiCache || []).find(c => c.id === r.cliente_id);
  const stColor = r.stato === 'esclusa'
    ? { bg: '#FCEBEB', fg: '#791F1F', label: 'Escluso' }
    : { bg: '#EAF3DE', fg: '#27500A', label: 'Attiva' };
  const baseColor = r.base_calcolo === 'totale' ? { bg: '#FAEEDA', fg: '#633806' } : { bg: '#EEEDFE', fg: '#26215C' };

  let html = '<tr style="' + (isDefault ? 'background:#EEEDFE;' : '') + 'border-bottom:0.5px solid var(--border)">';
  html += '<td style="padding:9px 10px;font-weight:' + (isDefault ? '700' : '500') + '">';
  html += isDefault ? '— Regola DEFAULT banca' : esc((cliente || {}).nome || '(cliente eliminato)');
  html += '</td>';
  html += '<td style="padding:9px 10px;font-family:var(--font-mono);font-weight:600">' + (r.percentuale_anticipo !== null ? Number(r.percentuale_anticipo).toFixed(0) + '%' : '—') + '</td>';
  html += '<td style="padding:9px 10px">';
  if (r.base_calcolo) html += '<span style="background:' + baseColor.bg + ';color:' + baseColor.fg + ';padding:2px 8px;border-radius:9px;font-size:10px;font-weight:600">' + (r.base_calcolo === 'totale' ? 'Totale ft' : 'Imponibile') + '</span>';
  else html += '—';
  html += '</td>';
  html += '<td style="padding:9px 10px;font-family:var(--font-mono);text-align:right">' + (r.massimale_cliente ? fmtE(r.massimale_cliente) : 'Nessun limite') + '</td>';
  html += '<td style="padding:9px 10px"><span style="background:' + stColor.bg + ';color:' + stColor.fg + ';padding:2px 8px;border-radius:9px;font-size:10px;font-weight:700">' + stColor.label + '</span></td>';
  html += '<td style="padding:9px 10px;font-size:10px;color:var(--text-muted);max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(r.note || '') + '</td>';
  html += '<td style="padding:5px 10px;text-align:right">';
  if (_antPuoGestireRegole()) {
    html += '<button onclick="_antApriModaleRegola(\'' + r.id + '\')" style="background:none;border:0.5px solid var(--border);color:var(--text-muted);padding:4px 9px;border-radius:5px;cursor:pointer;font-size:11px">✏️</button>';
    if (!isDefault) html += ' <button onclick="_antEliminaRegola(\'' + r.id + '\')" style="background:none;border:0.5px solid #E24B4A;color:#E24B4A;padding:4px 9px;border-radius:5px;cursor:pointer;font-size:11px;margin-left:4px">🗑</button>';
  }
  html += '</td>';
  html += '</tr>';
  return html;
}

// ═══════════════════════════════════════════════════════════════════════════
// PLACEHOLDER MODALI — implementati al prossimo step
// ═══════════════════════════════════════════════════════════════════════════
function _antApriModalePresenta(affidamentoId) {
  toast('🚧 Modale Presenta Fatture — al prossimo step (Step 3)');
}
function _antApriModaleAccredito(presentazioneId) {
  toast('🚧 Modale Registra Accredito — al prossimo step');
}
function _antApriModaleModulo(presentazioneId) {
  toast('🚧 Modifica modulo — al prossimo step');
}
function _antApriModaleFattura(fatturaAntId) {
  toast('🚧 Modifica fattura — al prossimo step');
}
function _antRegistraIncasso(fatturaAntId) {
  toast('🚧 Registra incasso — al prossimo step');
}
function _antApriModaleRegola(regolaId, affidamentoId) {
  toast('🚧 Modifica regola — al prossimo step');
}
function _antEliminaRegola(regolaId) {
  toast('🚧 Elimina regola — al prossimo step');
}
function _antApriDettaglioModulo(presentazioneId) {
  toast('🚧 Dettaglio modulo storico — al prossimo step');
}
function _antStampaPDFBanca(affidamentoId) {
  toast('🚧 Stampa PDF banca — al prossimo step');
}
