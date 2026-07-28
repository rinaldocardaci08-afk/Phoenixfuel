// ═════════════════════════════════════════════════════════════════════════════
// pf-anticipi.js — modulo Anticipo Fatture SBF
// Phoenix Fuel — 05/05/2026 (v20260505a)
//
// Patch 05/05 (a) — allineamento permessi alla Costituzione B.4:
//   - _antIsAdmin() delega ora al global _isAdmin() di pf-admin.js (rimuove
//     la duplicazione locale, mantiene fallback se _isAdmin non disponibile).
//   - _antPuoVedereStorico() controlla davvero il sub-permesso
//     'anticipi.storico' (era dichiarato in SEZIONI_SISTEMA ma il check
//     ritornava sempre _antPuoVedere() → sub-permesso morto). Backward-
//     compatible: _haPermesso('anticipi.storico') è permissivo per default
//     (true se parent 'anticipi' attivo, false solo se esplicitamente
//     'anticipi.storico'=false in tabella permessi).
//   - Coordinato con pf-banche.js v20260505a che ora gating della tab
//     "Storico Anticipi" (banche-panel-anticipi-storico) — bug pre-esistente:
//     la tab era sempre visibile a chi vedeva la sezione Banche.
//
// Patch 30/04: permessi granulari per operatori (Adele, Chiara)
//   Aggiunti 5 sub-permessi sotto 'anticipi' in SEZIONI_SISTEMA:
//     - anticipi.presenta   → crea nuovo modulo SBF
//     - anticipi.accredito  → registra accrediti banca
//     - anticipi.incasso    → registra incassi clienti
//     - anticipi.modifica   → modifica modulo/fattura
//     - anticipi.regole     → gestione regole + blacklist
//   Helper _antPuo... ammettono ora admin OPPURE sub-permesso specifico.
//   Operatori abilitati su tutti e 5 i sub-permessi operano a 360°.
//   Toast aggiornati: "Permesso negato: chiedi all'amministratore..."
//
// Patch 29/04 (a):
//   - Caricamento clienti.cliente_rete in cache (si distingue rete vs consumo)
//   - Modale Presenta: righe rete in arancione + badge "RETE" + warning
//   - Filtro "solo consumo" / "tutti" per nascondere/vedere fatture rete
//   - Propagazione stato modulo→fatture: gestita lato DB dal nuovo trigger
//     trg_propaga_stato_pres_a_fatture (vedi fix_propagazione_anticipi.sql)
//
// Patch 29/04 (b) — audit performance + bugfix:
//   - FIX filtro RETE: lookup per cliente_id NON funzionava perché Danea
//     non popola cliente_id su fatture_emesse (solo cessionario_denominazione).
//     Ora indicizza i clienti rete sia per id sia per nome (case-insensitive).
//   - PERF modale Presenta: 3 query iniziali (regole/busy/fatture) ora in
//     Promise.all → 1 round-trip invece di 3.
//   - PERF chunk fatture_pagamenti: prima loop sequenziale (fino a 8 round-trip
//     per 1500 fatture); ora Promise.all su tutti i chunk → 1 round-trip.
//   - PERF modale Dettaglio: 3 query dipendenti (fatture/accrediti/costi)
//     ora in Promise.all → 1 round-trip invece di 3.
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
  // Patch v20260505a: delega al global _isAdmin (pf-admin.js) per allineamento
  // alla Costituzione B.4. Fallback al check locale se _isAdmin non disponibile
  // (safety se ordine di caricamento script cambia).
  if (typeof _isAdmin === 'function') return _isAdmin();
  return typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.ruolo === 'admin';
}
function _antPuoVedere() {
  if (typeof utenteCorrente === 'undefined' || !utenteCorrente) return false;
  if (utenteCorrente.ruolo === 'admin') return true;
  return (typeof _haPermesso === 'function') && _haPermesso('anticipi');
}
// Patch 30/04: write configurabile via sub-permessi granulari (admin sempre).
// Operatori (Adele, Chiara) abilitati su tutti e 5 i sub-permessi operano a 360°.
// Sub-permessi dichiarati in SEZIONI_SISTEMA di pf-admin.js sotto id 'anticipi'.
function _antPuoPresentare()    { return _antIsAdmin() || (typeof _haPermesso === 'function' && _haPermesso('anticipi.presenta')); }
function _antPuoAccredito()     { return _antIsAdmin() || (typeof _haPermesso === 'function' && _haPermesso('anticipi.accredito')); }
function _antPuoIncasso()       { return _antIsAdmin() || (typeof _haPermesso === 'function' && _haPermesso('anticipi.incasso')); }
// Patch v20260503a: permessi specifici per le 3 nuove azioni di chiusura/proroga
function _antPuoProroga()       { return _antIsAdmin() || (typeof _haPermesso === 'function' && _haPermesso('anticipi.proroga')); }
function _antPuoChiudere()      { return _antIsAdmin() || (typeof _haPermesso === 'function' && _haPermesso('anticipi.chiudi-modulo')); }
function _antPuoModificare()    { return _antIsAdmin() || (typeof _haPermesso === 'function' && _haPermesso('anticipi.modifica')); }
function _antPuoGestireRegole() { return _antIsAdmin() || (typeof _haPermesso === 'function' && _haPermesso('anticipi.regole')); }
// Patch v20260505a: attiva il sub-permesso 'anticipi.storico' (era dichiarato
// in SEZIONI_SISTEMA ma il check ritornava sempre _antPuoVedere() → sub-permesso
// morto). _haPermesso('anticipi.storico') è permissivo per default: ritorna true
// se il parent 'anticipi' è attivo e 'anticipi.storico' non è esplicitamente
// disabilitato → backward-compatible per utenti già configurati.
function _antPuoVedereStorico() {
  if (_antIsAdmin()) return true;
  return (typeof _haPermesso === 'function') && _haPermesso('anticipi.storico');
}

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
      _antSubTabAttiva = 'home';
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
      + '🚫 Blacklist'
      + '</button>';
  }
  html += '</div>';

  // ─── PANNELLO ATTIVO ──────────────────────────────────────────────────
  html += '<div id="ant-content">';
  html += '<div style="padding:20px;text-align:center;color:var(--text-muted)">⏳ Caricamento...</div>';
  html += '</div>';

  cont.innerHTML = html;

  // Carica contenuto della sub-tab attiva
  if (_antSubTabAttiva === 'home') {
    await _antRenderTabHome(fidiAnticipi);
  } else if (_antSubTabAttiva.startsWith('banca:')) {
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
// HOME QUADRO ANTICIPI (25/07) — un pannello per istituto con anticipo fatture.
// Stessi numeri della scheda banca, letti una volta sola per tutte le banche:
//   accordato = importo_accordato dell affidamento
//   utilizzato = somma anticipato dei moduli attivi - somma estinto
//   disponibile = accordato - utilizzato
//   prima scadenza = data piu vicina fra le fatture ancora vive, con il
//     TOTALE di tutte le fatture che scadono quello stesso giorno
// I pannelli sono cliccabili e aprono la banca. Nessuna scrittura.
// ═══════════════════════════════════════════════════════════════════════════
async function _antRenderTabHome(fidiAnticipi) {
  const cont = document.getElementById('ant-content');
  if (!cont) return;

  const affIds = fidiAnticipi.map(f => f.id);
  let presByAff = {}, fattByPres = {};
  if (affIds.length) {
    const { data: pres } = await sb.from('anticipi_sbf_presentazioni')
      .select('*').in('affidamento_id', affIds).not('stato', 'in', '(estinta,rifiutata)');
    const presIds = (pres || []).map(p => p.id);
    if (presIds.length) {
      const { data: ftt } = await sb.from('anticipi_sbf_fatture').select('*').in('presentazione_id', presIds);
      (ftt || []).forEach(f => {
        if (!fattByPres[f.presentazione_id]) fattByPres[f.presentazione_id] = [];
        fattByPres[f.presentazione_id].push(f);
      });
    }
    (pres || []).forEach(p => {
      if (!presByAff[p.affidamento_id]) presByAff[p.affidamento_id] = [];
      presByAff[p.affidamento_id].push(p);
    });
  }

  const oggiISO = new Date().toISOString().slice(0, 10);
  let totAcc = 0, totUso = 0;
  let scadenzaGlob = null;
  const schede = [];

  fidiAnticipi.forEach(aff => {
    const ist = _bancheIstituti.find(i => i.id === aff.istituto_id) || {};
    const accordato = Number(aff.importo_accordato || 0);
    let utilizzo = 0, scadute = 0;
    const perData = {};

    (presByAff[aff.id] || []).forEach(p => {
      const ftt = fattByPres[p.id] || [];
      const estinto = ftt.reduce((s, f) => s + Number(f.importo_estinto || 0), 0);
      utilizzo += Math.max(0, Number(p.importo_anticipato_totale || 0) - estinto);
      ftt.forEach(f => {
        if (f.stato === 'estinta' || f.stato === 'esclusa' || !f.scadenza_banca) return;
        const residuo = Math.max(0, Number(f.importo_anticipato || f.importo || 0) - Number(f.importo_estinto || 0));
        if (f.scadenza_banca < oggiISO) { scadute++; return; }
        if (!perData[f.scadenza_banca]) perData[f.scadenza_banca] = 0;
        perData[f.scadenza_banca] += residuo;
      });
    });

    const disponibile = Math.max(0, accordato - utilizzo);
    const pct = accordato > 0 ? Math.min(100, Math.round(utilizzo / accordato * 100)) : 0;
    const date = Object.keys(perData).sort();
    const primaData = date.length ? date[0] : null;
    const primaImporto = primaData ? Math.round(perData[primaData] * 100) / 100 : 0;

    totAcc += accordato;
    totUso += utilizzo;
    if (primaData && (!scadenzaGlob || primaData < scadenzaGlob.data)) {
      scadenzaGlob = { data: primaData, importo: primaImporto, banca: ist.nome || '' };
    }
    schede.push({ aff: aff, nome: ist.nome || '—', accordato: accordato, utilizzo: utilizzo,
      disponibile: disponibile, pct: pct, primaData: primaData, primaImporto: primaImporto, scadute: scadute });
  });

  const colorePct = function (p) { return p >= 80 ? '#E24B4A' : (p >= 50 ? '#BA7517' : '#639922'); };
  const dataBreve = function (iso) { return iso ? _pfIsoToIt(iso).slice(0, 5) : '—'; };

  let h = '';
  // striscia riassuntiva (la stessa che andra in dashboard)
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px;margin-bottom:16px">';
  h += '<div style="background:var(--bg-card);border-radius:8px;padding:14px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Accordato</div><div style="font-size:22px;font-weight:700;font-family:var(--font-mono)">' + fmtE(totAcc) + '</div></div>';
  h += '<div style="background:var(--bg-card);border-radius:8px;padding:14px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Utilizzato</div><div style="font-size:22px;font-weight:700;font-family:var(--font-mono)">' + fmtE(totUso) + '</div></div>';
  h += '<div style="background:var(--bg-card);border-radius:8px;padding:14px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Disponibile</div><div style="font-size:22px;font-weight:700;font-family:var(--font-mono);color:#27500A">' + fmtE(Math.max(0, totAcc - totUso)) + '</div></div>';
  h += '<div style="background:var(--bg-card);border-radius:8px;padding:14px"><div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Prossima scadenza</div>'
    + '<div style="font-size:22px;font-weight:700;font-family:var(--font-mono)">' + (scadenzaGlob ? dataBreve(scadenzaGlob.data) : '—') + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">' + (scadenzaGlob ? fmtE(scadenzaGlob.importo) + ' · ' + esc(scadenzaGlob.banca) : 'nessuna in scadenza') + '</div></div>';
  h += '</div>';

  // pannelli per istituto
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:12px">';
  schede.forEach(s => {
    const tipoLab = { sbf: 'SBF', anticipo_fatture: 'Anticipo fatture' }[s.aff.tipo] || s.aff.tipo;
    const pctD = s.aff.percentuale_anticipo_default;
    const baseD = s.aff.base_calcolo_default;
    const sotto = pctD && baseD
      ? Number(pctD).toFixed(0) + '% su ' + (baseD === 'totale' ? 'totale fattura' : 'imponibile')
      : 'parametri anticipo da completare';

    h += '<div onclick="_antSwitchTab(\'banca:' + s.aff.id + '\')" title="Apri la scheda della banca" '
      + 'style="background:var(--bg);border:0.5px solid var(--border);border-radius:12px;padding:14px 16px;cursor:pointer">';
    h += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:2px">'
      + '<span style="font-size:15px;font-weight:700">🏦 ' + esc(s.nome) + '</span>'
      + '<span style="margin-left:auto;font-size:11px;background:#E6F1FB;color:#0C447C;padding:3px 10px;border-radius:6px;font-weight:600">' + esc(tipoLab) + '</span></div>';
    h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">' + esc(sotto) + '</div>';

    h += '<div style="height:10px;background:var(--bg-card);border-radius:5px;overflow:hidden;margin-bottom:6px">'
      + '<div style="width:' + s.pct + '%;height:100%;background:' + colorePct(s.pct) + '"></div></div>';
    h += '<div style="display:flex;justify-content:space-between;font-size:12px;margin-bottom:12px">'
      + '<span style="color:' + (s.pct >= 80 ? '#A32D2D' : 'var(--text-muted)') + '">utilizzato ' + s.pct + '%</span>'
      + '<span style="font-family:var(--font-mono);color:var(--text-muted)">' + fmtE(s.utilizzo) + ' / ' + fmtE(s.accordato) + '</span></div>';

    h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;padding-top:12px;border-top:0.5px solid var(--border)">';
    h += '<div><div style="font-size:12px;color:var(--text-muted)">Disponibile</div>'
      + '<div style="font-size:17px;font-weight:700;font-family:var(--font-mono);color:' + (s.disponibile > 0 ? '#27500A' : '#A32D2D') + '">' + fmtE(s.disponibile) + '</div></div>';
    h += '<div><div style="font-size:12px;color:var(--text-muted)">Prima scadenza</div>'
      + '<div style="font-size:17px;font-weight:700;font-family:var(--font-mono)">' + dataBreve(s.primaData) + '</div>'
      + '<div style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">' + (s.primaData ? fmtE(s.primaImporto) : 'nessuna presentazione') + '</div></div>';
    h += '</div>';

    if (s.scadute > 0) {
      h += '<div style="margin-top:10px;font-size:12px;color:#A32D2D;font-weight:600">⚠ ' + s.scadute + (s.scadute === 1 ? ' fattura scaduta in banca' : ' fatture scadute in banca') + '</div>';
    }
    h += '</div>';
  });
  h += '</div>';

  // ── grafici di raffronto (come nel fido fornitori): quale istituto usiamo
  //    di piu, e come si muove nei mesi.
  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-top:16px">';
  h += '<div style="flex:1 1 260px;min-width:260px;background:var(--bg);border:0.5px solid var(--border);border-radius:12px;padding:14px 16px">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:2px">Anticipi per banca</div>'
    + '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">presentato negli ultimi 12 mesi</div>'
    + '<div style="position:relative;height:230px"><canvas id="ant-torta"></canvas></div></div>';
  h += '<div style="flex:2 1 340px;min-width:320px;background:var(--bg);border:0.5px solid var(--border);border-radius:12px;padding:14px 16px">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:2px">Andamento per mese</div>'
    + '<div style="font-size:11px;color:var(--text-muted);margin-bottom:10px">importi presentati, per istituto</div>'
    + '<div style="position:relative;height:230px"><canvas id="ant-mesi"></canvas></div></div>';
  h += '</div>';

  cont.innerHTML = h;
  _antRenderGrafici(fidiAnticipi);
}

// ─── GRAFICI DI RAFFRONTO ─────────────────────────────────────────────────
// Torta = totale presentato per banca negli ultimi 12 mesi.
// Barre = stesso dato spezzato per mese, una porzione per istituto: si vede
// subito su chi ci stiamo appoggiando e come cambia nel tempo.
var _antChartTorta = null, _antChartMesi = null;

async function _antRenderGrafici(fidiAnticipi) {
  if (typeof Chart === 'undefined') return;
  const affIds = fidiAnticipi.map(f => f.id);
  if (!affIds.length) return;
  const da = new Date(); da.setMonth(da.getMonth() - 11); da.setDate(1);
  const daISO = da.toISOString().slice(0, 10);

  const { data: pres } = await sb.from('anticipi_sbf_presentazioni')
    .select('affidamento_id,data_presentazione,importo_anticipato_totale')
    .in('affidamento_id', affIds).gte('data_presentazione', daISO);
  if (!pres || !pres.length) return;

  const nomeDi = {};
  fidiAnticipi.forEach(f => {
    const ist = _bancheIstituti.find(i => i.id === f.istituto_id) || {};
    nomeDi[f.id] = ist.nome || '—';
  });

  const totBanca = {};
  const mesi = [];
  for (let k = 11; k >= 0; k--) {
    const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - k);
    mesi.push(d.toISOString().slice(0, 7));
  }
  const perMese = {};
  pres.forEach(p => {
    const nome = nomeDi[p.affidamento_id] || '—';
    const imp = Number(p.importo_anticipato_totale || 0);
    if (!imp) return;
    totBanca[nome] = (totBanca[nome] || 0) + imp;
    const mese = String(p.data_presentazione || '').slice(0, 7);
    if (mesi.indexOf(mese) < 0) return;
    if (!perMese[nome]) perMese[nome] = {};
    perMese[nome][mese] = (perMese[nome][mese] || 0) + imp;
  });

  const col = ['#185FA5', '#639922', '#F5921E', '#6B5FCC', '#E5342F', '#0FA3A3'];
  const banche = Object.keys(totBanca).sort((a, b) => totBanca[b] - totBanca[a]);

  const ctxT = document.getElementById('ant-torta');
  if (ctxT && banche.length) {
    if (_antChartTorta) _antChartTorta.destroy();
    _antChartTorta = new Chart(ctxT, {
      type: 'doughnut',
      data: { labels: banche, datasets: [{ data: banche.map(b => Math.round(totBanca[b])),
        backgroundColor: banche.map((b, i) => col[i % col.length]), borderWidth: 2, borderColor: '#fff' }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '52%',
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => c.label + ': ' + fmtE(totBanca[c.label]) } } } }
    });
  }

  const ctxM = document.getElementById('ant-mesi');
  if (ctxM && banche.length) {
    if (_antChartMesi) _antChartMesi.destroy();
    const etichette = mesi.map(m => { const p = m.split('-'); return p[1] + '/' + p[0].slice(2); });
    _antChartMesi = new Chart(ctxM, {
      type: 'bar',
      data: { labels: etichette, datasets: banche.map((b, i) => ({
        label: b, backgroundColor: col[i % col.length],
        data: mesi.map(m => Math.round((perMese[b] && perMese[b][m]) || 0)) })) },
      options: { responsive: true, maintainAspectRatio: false,
        scales: { x: { stacked: true, grid: { display: false } },
          y: { stacked: true, ticks: { callback: v => (v / 1000) + 'k' } } },
        plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11 } } },
          tooltip: { callbacks: { label: c => c.dataset.label + ': ' + fmtE(c.parsed.y) } } } }
    });
  }
}

// ─── PANNELLO DASHBOARD (stesso stile del fido fornitori) ─────────────────
async function caricaAnticipiDashboard() {
  const el = document.getElementById('dash-anticipi');
  if (!el) return;
  try {
    if (!_bancheAffidamenti.length || !_bancheIstituti.length) {
      const [affRes, istRes] = await Promise.all([
        sb.from('banche_affidamenti').select('*'),
        sb.from('banche_istituti').select('*').order('nome')
      ]);
      _bancheAffidamenti = affRes.data || [];
      _bancheIstituti = istRes.data || [];
    }
    const fidi = _bancheAffidamenti
      .filter(a => a.stato === 'attivo' && (a.tipo === 'sbf' || a.tipo === 'anticipo_fatture'))
      .sort((a, b) => {
        const nA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
        const nB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
        const p = _priorityBancaIstituto(nA) - _priorityBancaIstituto(nB);
        return p !== 0 ? p : nA.localeCompare(nB);
      });
    if (!fidi.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Nessun affidamento anticipo attivo.</div>'; return; }

    const affIds = fidi.map(f => f.id);
    const { data: pres } = await sb.from('anticipi_sbf_presentazioni')
      .select('*').in('affidamento_id', affIds).not('stato', 'in', '(estinta,rifiutata)');
    const presIds = (pres || []).map(p => p.id);
    let fattByPres = {};
    if (presIds.length) {
      const { data: ftt } = await sb.from('anticipi_sbf_fatture').select('*').in('presentazione_id', presIds);
      (ftt || []).forEach(f => {
        if (!fattByPres[f.presentazione_id]) fattByPres[f.presentazione_id] = [];
        fattByPres[f.presentazione_id].push(f);
      });
    }
    const oggiISO = new Date().toISOString().slice(0, 10);

    el.innerHTML = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">'
      + fidi.map(aff => {
        const ist = _bancheIstituti.find(i => i.id === aff.istituto_id) || {};
        const accordato = Number(aff.importo_accordato || 0);
        let utilizzo = 0, scadute = 0;
        const perData = {};
        (pres || []).filter(p => p.affidamento_id === aff.id).forEach(p => {
          const ftt = fattByPres[p.id] || [];
          const estinto = ftt.reduce((s, f) => s + Number(f.importo_estinto || 0), 0);
          utilizzo += Math.max(0, Number(p.importo_anticipato_totale || 0) - estinto);
          ftt.forEach(f => {
            if (f.stato === 'estinta' || f.stato === 'esclusa' || !f.scadenza_banca) return;
            const res = Math.max(0, Number(f.importo_anticipato || f.importo || 0) - Number(f.importo_estinto || 0));
            if (f.scadenza_banca < oggiISO) { scadute++; return; }
            perData[f.scadenza_banca] = (perData[f.scadenza_banca] || 0) + res;
          });
        });
        const disp = Math.max(0, accordato - utilizzo);
        const pct = accordato > 0 ? Math.min(100, (utilizzo / accordato) * 100) : 0;
        const bordo = pct >= 85 ? '#C0392B' : pct >= 60 ? '#F5921E' : '#639922';
        const date = Object.keys(perData).sort();
        const primaD = date.length ? date[0] : null;
        const primaI = primaD ? perData[primaD] : 0;
        return '<div onclick="vaiAnticipiBanca(\'' + aff.id + '\')" style="cursor:pointer;border:1px solid ' + bordo + ';border-left:5px solid ' + bordo + ';border-radius:11px;padding:12px 14px;background:var(--bg)">'
          + '<div style="display:flex;justify-content:space-between;align-items:baseline;gap:8px;margin-bottom:8px">'
            + '<span style="font-size:14px;font-weight:700">' + esc(ist.nome || '—') + '</span>'
            + '<span style="font-size:11px;color:var(--text-muted)">' + (aff.tipo === 'sbf' ? 'SBF' : 'Anticipo fatture') + '</span></div>'
          + '<div style="height:9px;background:var(--bg-card);border-radius:5px;overflow:hidden"><div style="width:' + Math.round(pct) + '%;height:100%;background:' + bordo + '"></div></div>'
          + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:8px">'
            + '<span style="color:var(--text-muted)">Utilizzato ' + Math.round(pct) + '%</span>'
            + '<span style="font-family:var(--font-mono);font-weight:700">' + fmtE(utilizzo) + ' / ' + fmtE(accordato) + '</span></div>'
          + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:4px">'
            + '<span style="color:var(--text-muted)">Disponibile</span>'
            + '<span style="font-family:var(--font-mono);font-weight:700;color:' + (disp > 0 ? '#3B6D11' : '#A32D2D') + '">' + fmtE(disp) + '</span></div>'
          + '<div style="display:flex;justify-content:space-between;font-size:11px;margin-top:6px">'
            + (scadute ? '<span style="color:#A32D2D;font-weight:700">' + scadute + ' scadute in banca</span>'
                       : '<span style="color:var(--text-muted)">prima scadenza ' + (primaD ? _pfIsoToIt(primaD) : '—') + '</span>')
            + '<span style="font-family:var(--font-mono)">' + (primaD ? fmtE(primaI) : '') + '</span></div>'
          + '</div>';
      }).join('') + '</div>';
  } catch (e) {
    console.warn('anticipi dashboard', e);
    el.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Dati anticipi non disponibili.</div>';
  }
}

function vaiAnticipiBanca(affId) {
  const nav = document.querySelector('.nav-item[onclick*="banche"]');
  if (typeof setSection === 'function') { try { setSection('banche', nav); } catch (e) {} }
  setTimeout(function () {
    const tab = document.querySelector('.banche-tab[data-tab="banche-panel-anticipi"]');
    if (tab && typeof switchBancheTab === 'function') switchBancheTab(tab);
    setTimeout(function () { _antSwitchTab('banca:' + affId); }, 150);
  }, 150);
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

  // Parametri anticipo dal fido (nuovo schema 28/04)
  const pctDefault = aff.percentuale_anticipo_default;
  const baseDefault = aff.base_calcolo_default;
  const massimalePctRaw = aff.massimale_cliente_pct;
  const massimaleEuro = (massimalePctRaw && monteAcc) ? (Number(massimalePctRaw) / 100) * monteAcc : null;
  const parametriCompleti = pctDefault && baseDefault;

  let html = '';

  // Ritorno al quadro d'insieme (25/07): la home della sezione sono i pannelli.
  html += '<div style="margin-bottom:10px"><button onclick="_antSwitchTab(\'home\')" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 12px;font-size:12px;cursor:pointer;color:var(--text)">← Torna al quadro anticipi</button></div>';

  // Box info banca
  html += '<div style="background:#EEEDFE;border-left:4px solid #6B5FCC;padding:14px 18px;border-radius:6px;margin-bottom:14px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">';
  html += '<div>';
  html += '<div style="font-size:14px;font-weight:700;color:#26215C">🏦 ' + esc(ist.nome || '—') + (cc.numero_conto ? ' <span style="font-family:var(--font-mono);font-size:11px;font-weight:500;color:#666">N. ' + esc(cc.numero_conto) + '</span>' : '') + '</div>';
  html += '<div style="font-size:11px;color:#666;margin-top:3px">';
  const tipoLab = { sbf:'SBF', anticipo_fatture:'Anticipo fatture', castelletto:'Castelletto', autoliquidante:'Autoliquidante' }[aff.tipo] || (aff.tipo || 'Anticipo fatture');
  html += 'Tipo: <strong>' + tipoLab + '</strong>';
  if (parametriCompleti) {
    html += ' · % anticipo: <strong style="color:#26215C">' + Number(pctDefault).toFixed(0) + '% su ' + (baseDefault === 'totale' ? 'totale fattura' : 'imponibile') + '</strong>';
    if (massimalePctRaw) {
      html += ' · Max cliente: <strong>' + Number(massimalePctRaw).toFixed(0) + '%';
      if (massimaleEuro) html += ' (' + fmtE(massimaleEuro) + ')';
      html += '</strong>';
    }
  } else {
    html += ' · <span style="color:#A32D2D;font-weight:600">⚠ Parametri anticipo mancanti — compila il fido in Affidamenti</span>';
  }
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

  // ─── PANNELLO SIMULAZIONE COSTO ANTICIPO ──────────────────────────────
  // Placeholder: popolato async da _calcRenderPanelEsempio dopo cont.innerHTML
  html += '<div id="ant-costi-' + affidamentoId + '"></div>';

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

  // Carica pannello simulazione costi (async, non blocca il render)
  if (typeof _calcRenderPanelEsempio === 'function' && aff.tasso) {
    _calcRenderPanelEsempio(aff.istituto_id, Number(aff.tasso), ist.nome || '', 'ant-costi-' + affidamentoId, Number(aff.importo_accordato || 0));
  }
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
  if (p.prorogato) {
    html += '<span title="Scadenza prorogata" style="background:#FAEEDA;color:#412402;padding:3px 8px;border-radius:10px;font-size:10px;font-weight:600">🔄 prorogata</span>';
  }
  html += '</div>';
  html += '</div>';
  // Importi
  html += '<div style="display:flex;gap:18px;align-items:baseline;flex-wrap:wrap">';
  html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Richiesto</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600">' + fmtE(p.importo_richiesto) + '</span></div>';
  html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Anticipato</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:#26215C">' + fmtE(p.importo_anticipato_totale) + '</span></div>';
  if (importoEstinto > 0) html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Estinto</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:#27500A">' + fmtE(importoEstinto) + '</span></div>';
  // Patch v20260502f: terzo valore dipende dallo stato. Per moduli chiusi
  // (estinta/insoluta/rifiutata) non mostro "Aperto" che sarebbe fuorviante.
  if (p.stato === 'estinta') {
    html += '<div style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600">✓ Rientrata' + (p.data_estinta ? ' il ' + fmtD(p.data_estinta) : '') + '</div>';
  } else if (p.stato === 'insoluta') {
    html += '<div style="background:#FCEBEB;color:#791F1F;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600" title="La banca ha prelevato i soldi dal conto. La fattura cliente resta da incassare normalmente.">❌ Insoluta' + (p.data_insoluto ? ' il ' + fmtD(p.data_insoluto) : '') + '</div>';
  } else if (p.stato === 'rifiutata') {
    html += '<div style="background:#f0f0f0;color:#666;padding:3px 10px;border-radius:6px;font-size:11px;font-weight:600">✗ Rifiutata dalla banca</div>';
  } else if (p.stato === 'anticipata') {
    // Modulo attivo: mostro "Da rientrare" (più chiaro di "Aperto")
    html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px" title="Importo ancora da rientrare alla banca">Da rientrare</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:' + (importoAttivo > 0 ? '#BA7517' : '#888') + '">' + fmtE(importoAttivo) + '</span></div>';
  } else {
    // in_delibera / anticipata_parziale → "Aperto" classico
    html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Aperto</span> <span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:' + (importoAttivo > 0 ? '#BA7517' : '#888') + '">' + fmtE(importoAttivo) + '</span></div>';
  }
  html += '<div style="margin-left:auto;display:flex;gap:5px">';
  if (_antPuoAccredito() && (p.stato === 'in_delibera' || p.stato === 'anticipata_parziale')) {
    html += '<button onclick="_antApriModaleAccredito(\'' + p.id + '\')" title="Registra accredito banca" style="background:#27500A;color:#fff;border:0;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer">💰 Accredito</button>';
  }
  // Patch v20260502d: bottoni Proroga / Rientro / Insoluta sulle presentazioni anticipate
  // Patch v20260503a: permessi separati - Proroga ha suo permesso, Rientro+Insoluta condividono "chiudi-modulo"
  if (p.stato === 'anticipata' || p.stato === 'anticipata_parziale') {
    if (_antPuoProroga()) {
      html += '<button onclick="_antApriModaleProroga(\'' + p.id + '\')" title="Proroga scadenza SBF (estensione data)" style="background:#0C447C;color:#fff;border:0;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer">📅 Proroga</button>';
    }
    if (_antPuoChiudere()) {
      html += '<button onclick="_antApriModaleRientro(\'' + p.id + '\')" title="Marca come rientrata (cliente ha pagato, banca chiude SBF)" style="background:#27500A;color:#fff;border:0;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer">✓ Rientro</button>';
      html += '<button onclick="_antApriModaleInsoluta(\'' + p.id + '\')" title="Marca come insoluta (cliente non ha pagato, banca preleva soldi)" style="background:#A32D2D;color:#fff;border:0;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer">❌ Insoluta</button>';
    }
  }
  if (_antPuoModificare()) {
    html += '<button onclick="_antApriModaleModulo(\'' + p.id + '\')" title="Modifica modulo" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:5px 10px;border-radius:5px;cursor:pointer;font-size:11px">✏️</button>';
  }
  // Patch v20260503e: bottone stampa PDF banca
  html += '<button onclick="_antStampaPdfBanca(\'' + p.id + '\')" title="Stampa modulo PDF da consegnare alla banca" style="background:#185FA5;color:#fff;border:0;border-radius:5px;padding:5px 10px;font-size:11px;cursor:pointer">📄 Stampa PDF</button>';
  html += '<button onclick="_antApriDettaglioModulo(\'' + p.id + '\')" title="Dettaglio completo modulo" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:5px 10px;border-radius:5px;cursor:pointer;font-size:11px">🔍</button>';
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
    html += '<td style="padding:5px 8px;text-align:right;white-space:nowrap">';
    html += '<button onclick="_calcOpenPopupCosto(\'' + f.id + '\',\'' + aff.id + '\')" title="Costo anticipo per istituto (ℹ︎)" style="background:none;border:0.5px solid #26215C;color:#26215C;border-radius:4px;padding:3px 7px;font-size:10px;cursor:pointer;margin-right:4px;font-weight:600">ℹ️</button>';
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
// TAB BLACKLIST — clienti esclusi dall'anticipo per banca
// ═══════════════════════════════════════════════════════════════════════════
// Mostra solo i clienti in blacklist (anticipi_sbf_regole.stato='esclusa')
// per la banca selezionata. Le percentuali e massimali ora sono SUL FIDO,
// non più qui (decisione utente 28/04: tutto sul fido + tab solo blacklist).
// ─────────────────────────────────────────────────────────────────────────────
var _antRegoleBancaSelected = null;

async function _antRenderTabRegole() {
  const cont = document.getElementById('ant-content');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">⏳ Caricamento blacklist...</div>';

  // Solo fidi attivi tipo anticipo (dove ha senso una blacklist)
  const tipiAnticipo = ['anticipo_fatture','sbf','castelletto','autoliquidante'];
  const fidi = _bancheAffidamenti
    .filter(a => a.stato === 'attivo' && tipiAnticipo.indexOf(a.tipo) >= 0)
    .sort((a, b) => {
      const istA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
      const istB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
      const pA = _priorityBancaIstituto(istA);
      const pB = _priorityBancaIstituto(istB);
      if (pA !== pB) return pA - pB;
      return istA.localeCompare(istB);
    });

  if (!_antRegoleBancaSelected && fidi.length) _antRegoleBancaSelected = fidi[0].id;

  // Cache clienti
  if (!_antClientiCache) {
    try {
      // Patch v20260503k: include modalita_pagamento + banca_accredito_id per ordinamento intelligente
      const { data } = await sb.from('clienti').select('id, ragione_sociale, denominazione, nome, cliente_rete, modalita_pagamento, banca_accredito_id').limit(2000);
      _antClientiCache = (data || []).map(c => ({
        id: c.id,
        nome: c.ragione_sociale || c.denominazione || c.nome || '—',
        cliente_rete: c.cliente_rete === true,
        modalita_pagamento: c.modalita_pagamento || null,
        banca_accredito_id: c.banca_accredito_id || null
      })).sort((a, b) => a.nome.localeCompare(b.nome));
    } catch (e) { _antClientiCache = []; }
  }

  // Carica SOLO regole blacklist (stato='esclusa') della banca selezionata
  let blacklist = [];
  if (_antRegoleBancaSelected) {
    const { data } = await sb.from('anticipi_sbf_regole')
      .select('*')
      .eq('affidamento_id', _antRegoleBancaSelected)
      .eq('stato', 'esclusa');
    blacklist = data || [];
  }

  // Info fido selezionato
  const fidoSel = fidi.find(f => f.id === _antRegoleBancaSelected) || null;

  let html = '';
  html += '<div style="background:#FCEBEB;border-left:4px solid #791F1F;padding:14px 18px;border-radius:6px;margin-bottom:14px">';
  html += '<div style="font-size:14px;font-weight:700;color:#791F1F">🚫 Blacklist clienti per banca</div>';
  html += '<div style="font-size:11px;color:#666;margin-top:3px">Le fatture dei clienti in questa lista <strong>non saranno proposte</strong> quando crei un nuovo modulo Presenta su questa banca. Percentuali e massimali ora sono nel fido (Affidamenti).</div>';
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
    html += '<button onclick="_antApriModaleRegola(null,\'' + _antRegoleBancaSelected + '\')" style="background:#791F1F;color:#fff;border:0;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer;font-weight:600">+ Aggiungi cliente alla blacklist</button>';
  }
  html += '</div>';

  // Box parametri anticipo del fido (read-only, info)
  if (fidoSel) {
    const massimaleEuro = (fidoSel.massimale_cliente_pct && fidoSel.importo_accordato)
      ? (Number(fidoSel.massimale_cliente_pct) / 100) * Number(fidoSel.importo_accordato)
      : null;
    html += '<div style="background:#EEEDFE;border-left:4px solid #6B5FCC;padding:10px 14px;border-radius:6px;margin-bottom:12px;font-size:11px;color:#26215C">';
    html += '<strong style="font-size:12px">📄 Parametri anticipo di questa banca</strong> ';
    html += '<span style="font-size:10px;color:#666">(modificabili in Affidamenti → ✏️)</span><br>';
    html += '<span style="font-family:var(--font-mono)">';
    html += '% Anticipo: <strong>' + (fidoSel.percentuale_anticipo_default ? Number(fidoSel.percentuale_anticipo_default).toFixed(0) + '%' : '—') + '</strong> · ';
    html += 'Base: <strong>' + (fidoSel.base_calcolo_default === 'totale' ? 'Totale fattura' : fidoSel.base_calcolo_default === 'imponibile' ? 'Imponibile' : '—') + '</strong> · ';
    html += 'Massimale cliente: <strong>' + (fidoSel.massimale_cliente_pct ? Number(fidoSel.massimale_cliente_pct).toFixed(0) + '%' : '—');
    if (massimaleEuro) html += ' (= ' + fmtE(massimaleEuro) + ')';
    html += '</strong>';
    html += '</span>';
    if (!fidoSel.percentuale_anticipo_default || !fidoSel.base_calcolo_default) {
      html += '<div style="margin-top:6px;color:#A32D2D;font-weight:600">⚠ Compila % anticipo e base calcolo nel fido (Affidamenti) prima di creare moduli su questa banca.</div>';
    }
    html += '</div>';
  }

  // Tabella blacklist
  if (blacklist.length === 0) {
    html += '<div style="padding:24px;text-align:center;background:var(--bg-card);border:1px dashed var(--border);border-radius:8px;color:var(--text-muted);font-size:12px">Nessun cliente in blacklist per questa banca.<br><span style="font-size:11px">Tutti i clienti sono anticipabili.</span></div>';
  } else {
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">';
    html += '<thead><tr style="background:var(--bg)">';
    ['Cliente', 'Note', ''].forEach(h => {
      html += '<th style="text-align:left;padding:9px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;border-bottom:0.5px solid var(--border)">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    blacklist.sort((a, b) => {
      const cA = _antClientiCache.find(c => c.id === a.cliente_id);
      const cB = _antClientiCache.find(c => c.id === b.cliente_id);
      return ((cA || {}).nome || '').localeCompare(((cB || {}).nome || ''));
    });

    blacklist.forEach(r => {
      const cliente = (_antClientiCache || []).find(c => c.id === r.cliente_id);
      const nomeCl = (cliente || {}).nome || '(cliente eliminato)';
      html += '<tr style="border-bottom:0.5px solid var(--border)">';
      html += '<td style="padding:9px 10px;font-weight:500">🚫 ' + esc(nomeCl) + '</td>';
      html += '<td style="padding:9px 10px;font-size:11px;color:var(--text-muted);max-width:380px">' + esc(r.note || '') + '</td>';
      html += '<td style="padding:5px 10px;text-align:right;white-space:nowrap">';
      if (_antPuoGestireRegole()) {
        html += '<button onclick="_antApriModaleRegola(\'' + r.id + '\')" style="background:none;border:0.5px solid var(--border);color:var(--text-muted);padding:4px 9px;border-radius:5px;cursor:pointer;font-size:11px" title="Modifica note">✏️</button>';
        html += ' <button onclick="_antEliminaRegola(\'' + r.id + '\')" style="background:none;border:0.5px solid #27500A;color:#27500A;padding:4px 9px;border-radius:5px;cursor:pointer;font-size:11px;margin-left:4px" title="Rimuovi dalla blacklist">↺ Riabilita</button>';
      }
      html += '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
  }

  cont.innerHTML = html;
}

// Stub per backward compat: la vecchia logica multi-campo è stata sostituita dalla blacklist
function _antRenderRigaRegola(r, isDefault) { return ''; }


// ═══════════════════════════════════════════════════════════════════════════
// DISPATCH MODALI — wrapper compatibilità (delegano alle funzioni vere)
// ═══════════════════════════════════════════════════════════════════════════
function _antApriModalePresenta(affidamentoId) {
  return _antRenderModalePresenta(affidamentoId);
}
function _antApriModaleAccredito(presentazioneId) {
  return _antRenderModaleAccredito(presentazioneId);
}
function _antApriModaleModulo(presentazioneId) {
  return _antRenderModaleModulo(presentazioneId);
}
function _antApriModaleFattura(fatturaAntId) {
  return _antRenderModaleFattura(fatturaAntId);
}
function _antRegistraIncasso(fatturaAntId) {
  return _antRenderModaleIncasso(fatturaAntId);
}
function _antApriDettaglioModulo(presentazioneId) {
  return _antRenderDettaglioModulo(presentazioneId);
}


// ═══════════════════════════════════════════════════════════════════════════
// MODALE PRESENTA — wizard single-page (cuore del modulo)
// ═══════════════════════════════════════════════════════════════════════════
// Flusso:
//   1. Verifica fido (% anticipo + base + massimale_pct compilati)
//   2. Carica fatture aperte presentabili:
//      - tipo TD01 (vendita) con imponibile > 0
//      - NON già in altro modulo attivo
//      - cliente NON in blacklist banca
//      - JOIN fatture_pagamenti per leggere scadenza_cliente
//   3. UI: form metadati (data_presentazione, protocollo, scadenza_banca_default,
//      note) + tabella fatture con checkbox + KPI live (totale anticipo selezionato)
//   4. Validazione massimale per cliente (somma anticipi nello stesso modulo)
//   5. Submit: insert presentazione + N fatture in transazione applicativa
// ─────────────────────────────────────────────────────────────────────────────

// State per la modale corrente — non persistente tra sessioni
var _antPresentaState = null;

async function _antRenderModalePresenta(affidamentoId) {
  if (!_antPuoPresentare()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }

  apriModal('<div style="padding:30px;text-align:center;color:var(--text-muted)">⏳ Carico fatture presentabili...</div>');

  // 1. Verifica fido
  var fido = (_bancheAffidamenti || []).find(function(a) { return a.id === affidamentoId; });
  if (!fido) { toast('Affidamento non trovato'); chiudiModal(); return; }
  var ist = (_bancheIstituti || []).find(function(i) { return i.id === fido.istituto_id; }) || {};
  var cc  = (_bancheConti || []).find(function(c) { return c.id === fido.conto_id; });
  var bancaLabel = (ist.nome || '—') + (cc && cc.numero_conto ? ' /' + cc.numero_conto.slice(-4) : '');

  if (!fido.percentuale_anticipo_default || !fido.base_calcolo_default) {
    apriModal('<div style="max-width:520px;padding:20px">'
      + '<div style="font-size:15px;font-weight:600;color:#A32D2D;margin-bottom:8px">⚠ Parametri anticipo mancanti</div>'
      + '<div style="font-size:12px;color:var(--text);margin-bottom:14px">Il fido <strong>' + esc(bancaLabel) + '</strong> non ha ancora i parametri anticipo configurati.<br><br>Vai in <strong>Banche → Affidamenti → ✏️</strong> sul fido e compila almeno <strong>% Anticipo</strong> e <strong>Base calcolo</strong>.</div>'
      + '<div style="text-align:right"><button onclick="chiudiModal()" class="btn-primary" style="font-size:12px;padding:8px 14px">OK</button></div>'
      + '</div>');
    return;
  }

  // 2. Carica in parallelo: blacklist banca + fatture già impegnate + fatture candidate
  // (prima erano 3 await sequenziali = 3 round-trip; ora 1 round-trip parallelo)
  var [resBL, resBusy, resF] = await Promise.all([
    sb.from('anticipi_sbf_regole').select('cliente_id').eq('affidamento_id', affidamentoId).eq('stato', 'esclusa'),
    sb.from('anticipi_sbf_fatture').select('fattura_id').not('fattura_id', 'is', null).neq('stato', 'esclusa'),
    // Fatture emesse: query molto larga, filtraggio fine in JS dopo.
    // - Includiamo tutti i tipi vendita (TD01/TD06/TD24/TD25) — note credito TD04 escluse perché negative
    // - Niente filtro temporale duro: prendiamo le 1500 più recenti
    // - importo_totale > 0 per evitare note credito (TD04) e fatture acconto azzerate
    sb.from('fatture_emesse')
      .select('id, numero, data, cliente_id, cessionario_denominazione, importo_totale, imponibile_totale, tipo_documento')
      .gt('importo_totale', 0)
      .order('data', { ascending: false })
      .limit(1500)
  ]);
  var blacklistSet = new Set((resBL.data || []).map(function(r) { return r.cliente_id; }).filter(Boolean));
  var fattureBusy = new Set((resBusy.data || []).map(function(r) { return r.fattura_id; }));

  if (resF.error) {
    apriModal('<div style="max-width:520px;padding:20px"><div style="color:#A32D2D;font-weight:600">❌ Errore caricamento fatture: ' + esc(resF.error.message) + '</div><div style="margin-top:12px;text-align:right"><button onclick="chiudiModal()" style="padding:8px 14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">Chiudi</button></div></div>');
    return;
  }

  // Diagnostica: conta cosa è caricato e cosa viene scartato
  var raw = resF.data || [];
  var diag = {
    totaliDB: raw.length,
    scartateTipoCredito: 0,
    scartateBusy: 0,
    scartateBlacklist: 0,
    scartateSenzaImponibile: 0
  };
  var fattureCandidate = raw.filter(function(f) {
    // Escludi solo le note credito esplicite (TD04 e simili che invertono il segno)
    if (f.tipo_documento === 'TD04' || f.tipo_documento === 'TD05' || f.tipo_documento === 'TD08') {
      diag.scartateTipoCredito++;
      return false;
    }
    if (fattureBusy.has(f.id)) { diag.scartateBusy++; return false; }
    if (blacklistSet.has(f.cliente_id)) { diag.scartateBlacklist++; return false; }
    if (!f.imponibile_totale || Number(f.imponibile_totale) <= 0) { diag.scartateSenzaImponibile++; return false; }
    return true;
  });
  diag.candidate = fattureCandidate.length;

  // Logging diagnostico per debug
  console.log('[anticipi/Presenta] Filtraggio fatture:', diag);
  if (raw.length === 0) {
    console.warn('[anticipi/Presenta] Nessuna fattura trovata in fatture_emesse — verifica che siano state importate da Danea.');
  }

  // Carica scadenze (fatture_pagamenti) per le fatture candidate
  var fIds = fattureCandidate.map(function(f) { return f.id; });
  var pagPerFatt = {};
  if (fIds.length) {
    // Chunk a 200 per non superare limiti URL — eseguiti in PARALLELO (Promise.all)
    // Prima erano sequenziali (8 round-trip per 1500 fatture); ora 1 round-trip parallelo.
    var chunks = [];
    for (var i = 0; i < fIds.length; i += 200) chunks.push(fIds.slice(i, i + 200));
    var risChunks = await Promise.all(chunks.map(function(chunk) {
      return sb.from('fatture_pagamenti').select('fattura_id, data_scadenza, importo_pagamento').in('fattura_id', chunk).order('data_scadenza');
    }));
    risChunks.forEach(function(resP) {
      (resP.data || []).forEach(function(p) {
        if (!pagPerFatt[p.fattura_id]) pagPerFatt[p.fattura_id] = [];
        pagPerFatt[p.fattura_id].push(p);
      });
    });
  }

  // Inietta scadenza_cliente più lontana (tipicamente l'ultima rata) su ogni fattura
  fattureCandidate.forEach(function(f) {
    var pp = pagPerFatt[f.id] || [];
    f._scadenza_cliente = pp.length ? pp[pp.length - 1].data_scadenza : null;
    f._n_rate = pp.length;
  });

  // Calcolo anticipo per fattura in base ai parametri fido
  var perc = Number(fido.percentuale_anticipo_default);
  var base = fido.base_calcolo_default;
  fattureCandidate.forEach(function(f) {
    var b = base === 'totale' ? Number(f.importo_totale || 0) : Number(f.imponibile_totale || 0);
    f._anticipo_calc = Math.round(b * perc) / 100;
  });

  // Massimale per cliente in € (se configurato)
  var massEuro = (fido.massimale_cliente_pct && fido.importo_accordato)
    ? (Number(fido.massimale_cliente_pct) / 100) * Number(fido.importo_accordato)
    : null;

  // Cache clienti per flag cliente_rete (se non già caricata o se manca il campo)
  // NB: Danea NON popola cliente_id su fatture_emesse — abbiamo solo cessionario_denominazione.
  // Quindi indicizziamo i clienti rete sia per id sia per nome (case-insensitive) per matching robusto.
  if (!_antClientiCache || !_antClientiCache.length || typeof _antClientiCache[0].cliente_rete === 'undefined') {
    try {
      var resCli = await sb.from('clienti').select('id, ragione_sociale, denominazione, nome, cliente_rete').limit(2000);
      _antClientiCache = (resCli.data || []).map(function(c) {
        return {
          id: c.id,
          nome: c.ragione_sociale || c.denominazione || c.nome || '—',
          cliente_rete: c.cliente_rete === true
        };
      }).sort(function(a,b){ return a.nome.localeCompare(b.nome); });
    } catch (e) { _antClientiCache = []; }
  }
  var clientiReteIdSet = new Set();
  var clientiReteNomeSet = new Set();
  (_antClientiCache || []).forEach(function(c) {
    if (!c.cliente_rete) return;
    if (c.id) clientiReteIdSet.add(c.id);
    if (c.nome) clientiReteNomeSet.add(c.nome.trim().toLowerCase());
  });
  fattureCandidate.forEach(function(f) {
    var byId = f.cliente_id && clientiReteIdSet.has(f.cliente_id);
    var byNome = f.cessionario_denominazione && clientiReteNomeSet.has(f.cessionario_denominazione.trim().toLowerCase());
    f._is_rete = !!(byId || byNome);

    // Patch v20260503k: classifico in base a modalità pagamento cliente vs banca SBF corrente
    // 1 = stessa banca (bonifico/riba sulla banca SBF)
    // 2 = pagamento "libero" (assegno, contanti, modalità non definita) — girabili dove si vuole
    // 3 = altra banca (bonifico/riba su banca diversa) — sub-ottimale
    var cli = (_antClientiCache || []).find(function(c) { return c.id === f.cliente_id; });
    var modalita = cli ? cli.modalita_pagamento : null;
    var bancaCli = cli ? cli.banca_accredito_id : null;
    if ((modalita === 'bonifico' || modalita === 'riba') && bancaCli) {
      if (bancaCli === fido.istituto_id) f._categoria_banca = 1; // stessa banca
      else f._categoria_banca = 3; // altra banca
    } else {
      f._categoria_banca = 2; // assegno / contanti / non def
    }
    f._modalita_pagamento = modalita;
    f._banca_cli_id = bancaCli;
  });

  // State globale modale
  _antPresentaState = {
    affidamentoId: affidamentoId,
    fido: fido,
    bancaLabel: bancaLabel,
    perc: perc,
    base: base,
    massEuro: massEuro,
    fatture: fattureCandidate,
    selezionate: new Set(),
    sortBy: 'banca_cli',
    filterCliente: '',
    filterSearch: '',
    filterRete: 'tutti',     // 'tutti' | 'solo_consumo' | 'solo_rete'
    diag: diag
  };

  _antPresentaRender();
}

// Render della modale Presenta usando lo state corrente
function _antPresentaRender() {
  var st = _antPresentaState;
  if (!st) return;

  var oggiISO = new Date().toISOString().split('T')[0];

  var html = '<div style="max-width:1080px;width:100%">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">';
  html += '<div>';
  html += '<div style="font-size:17px;font-weight:700">📋 Presenta nuove fatture</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">🏛 ' + esc(st.bancaLabel);
  html += ' · ' + Number(st.perc).toFixed(0) + '% su <strong>' + (st.base === 'totale' ? 'Totale fattura' : 'Imponibile') + '</strong>';
  if (st.massEuro) html += ' · Max cliente <strong>' + fmtE(st.massEuro) + '</strong>';
  html += '</div></div></div>';

  // Form metadati
  html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:14px">';
  html += '<div style="display:grid;grid-template-columns:1fr 1.5fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Data presentazione *</label>';
  html += '<input id="ant-pres-data" type="date" value="' + oggiISO + '" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px"></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">N. protocollo (opzionale)</label>';
  html += '<input id="ant-pres-prot" type="text" placeholder="Es. PRES/2026/12" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px;font-family:var(--font-mono)"></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Scadenza banca default</label>';
  html += '<input id="ant-pres-scad" type="date" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px" title="Se compilato, applicato a tutte le fatture senza scadenza propria"></div>';
  html += '</div>';
  html += '<div style="margin-top:8px"><label style="font-size:11px;color:var(--text-muted);font-weight:500">Note</label>';
  html += '<input id="ant-pres-note" type="text" placeholder="Note operative (opzionali)" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px"></div>';
  html += '</div>';

  // Filtri tabella
  // Lista clienti unici per filtro
  var clientiSet = {};
  st.fatture.forEach(function(f) {
    var k = f.cliente_id || f.cessionario_denominazione || '?';
    if (!clientiSet[k]) clientiSet[k] = { id: k, nome: f.cessionario_denominazione || '?' };
  });
  var clientiOrdinati = Object.keys(clientiSet).map(function(k) { return clientiSet[k]; }).sort(function(a,b){ return a.nome.localeCompare(b.nome); });

  html += '<div style="display:flex;gap:8px;margin-bottom:8px;flex-wrap:wrap;align-items:center">';
  html += '<input id="ant-pres-search" type="text" placeholder="🔍 Cerca per numero/cliente..." value="' + esc(st.filterSearch) + '" oninput="_antPresentaSetFilter(\'search\',this.value)" style="flex:1;min-width:220px;padding:6px 10px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text);font-size:11px">';
  html += '<select onchange="_antPresentaSetFilter(\'cliente\',this.value)" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:5px;font-size:11px;background:var(--bg-card);color:var(--text);max-width:280px">';
  html += '<option value="">Cliente: tutti</option>';
  clientiOrdinati.forEach(function(c) {
    html += '<option value="' + esc(c.id) + '"' + (st.filterCliente === c.id ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
  });
  html += '</select>';
  html += '<select onchange="_antPresentaSetFilter(\'sortBy\',this.value)" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:5px;font-size:11px;background:var(--bg-card);color:var(--text)">';
  [['banca_cli','🏦 Banca cliente (consigliato)'],['data_desc','📅 Data ↓'],['data_asc','📅 Data ↑'],['cliente','👤 Cliente'],['scad_banca','🏦 Scad. cliente'],['totale_desc','💰 Totale ↓']].forEach(function(s) {
    html += '<option value="' + s[0] + '"' + (st.sortBy === s[0] ? ' selected' : '') + '>' + s[1] + '</option>';
  });
  html += '</select>';
  // Filtro Rete/Consumo (regola Phoenix Fuel: consumo = OK anticipare; rete = NO marginalità bassa)
  var nReteCand = st.fatture.filter(function(f){ return f._is_rete; }).length;
  html += '<select onchange="_antPresentaSetFilter(\'rete\',this.value)" title="Filtra fatture per tipologia cliente" style="padding:6px 10px;border:0.5px solid var(--border);border-radius:5px;font-size:11px;background:var(--bg-card);color:var(--text)">';
  html += '<option value="tutti"' + (st.filterRete === 'tutti' ? ' selected' : '') + '>Tutti i clienti' + (nReteCand ? ' (' + nReteCand + ' rete)' : '') + '</option>';
  html += '<option value="solo_consumo"' + (st.filterRete === 'solo_consumo' ? ' selected' : '') + '>🟢 Solo consumo</option>';
  html += '<option value="solo_rete"' + (st.filterRete === 'solo_rete' ? ' selected' : '') + '>🟠 Solo rete</option>';
  html += '</select>';
  html += '<button onclick="_antPresentaSelezionaTutte()" style="padding:6px 12px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text);font-size:11px;cursor:pointer">✓ Tutte filtrate</button>';
  html += '<button onclick="_antPresentaDeselezionaTutte()" style="padding:6px 12px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text);font-size:11px;cursor:pointer">⨯ Nessuna</button>';
  html += '</div>';

  // Mini-banner diagnostico (sempre visibile per chi è admin)
  if (st.diag && st.fatture.length > 0) {
    var totScartate = (st.diag.scartateTipoCredito || 0) + (st.diag.scartateBusy || 0) + (st.diag.scartateBlacklist || 0) + (st.diag.scartateSenzaImponibile || 0);
    if (totScartate > 0) {
      html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:6px 10px;margin-bottom:8px;font-size:10px;color:var(--text-muted);font-family:var(--font-mono)">';
      html += 'DB: ' + st.diag.totaliDB + ' fatture · ';
      html += '<strong style="color:var(--text)">' + st.diag.candidate + ' presentabili</strong>';
      html += ' · scartate: ';
      var parts = [];
      if (st.diag.scartateTipoCredito) parts.push(st.diag.scartateTipoCredito + ' credito');
      if (st.diag.scartateBusy) parts.push(st.diag.scartateBusy + ' altro modulo');
      if (st.diag.scartateBlacklist) parts.push(st.diag.scartateBlacklist + ' blacklist');
      if (st.diag.scartateSenzaImponibile) parts.push(st.diag.scartateSenzaImponibile + ' s/imp');
      html += parts.join(' · ');
      html += '</div>';
    }
  }

  // Filtra + ordina lista
  var visible = st.fatture.slice();
  if (st.filterCliente) {
    visible = visible.filter(function(f) {
      var k = f.cliente_id || f.cessionario_denominazione || '?';
      return k === st.filterCliente;
    });
  }
  if (st.filterRete === 'solo_consumo') {
    visible = visible.filter(function(f) { return !f._is_rete; });
  } else if (st.filterRete === 'solo_rete') {
    visible = visible.filter(function(f) { return f._is_rete; });
  }
  if (st.filterSearch) {
    var q = st.filterSearch.toLowerCase();
    visible = visible.filter(function(f) {
      return (f.numero || '').toLowerCase().indexOf(q) >= 0
          || (f.cessionario_denominazione || '').toLowerCase().indexOf(q) >= 0;
    });
  }
  visible.sort(function(a, b) {
    if (st.sortBy === 'data_asc') return (a.data || '').localeCompare(b.data || '');
    if (st.sortBy === 'data_desc') return (b.data || '').localeCompare(a.data || '');
    if (st.sortBy === 'cliente') return (a.cessionario_denominazione || '').localeCompare(b.cessionario_denominazione || '');
    if (st.sortBy === 'scad_banca') return (a._scadenza_cliente || '9999').localeCompare(b._scadenza_cliente || '9999');
    if (st.sortBy === 'totale_desc') return Number(b.importo_totale || 0) - Number(a.importo_totale || 0);
    if (st.sortBy === 'banca_cli') {
      // Patch v20260503k: prima per categoria (1=stessa banca, 2=libera, 3=altra banca), poi per data desc
      var ca = a._categoria_banca || 9, cb = b._categoria_banca || 9;
      if (ca !== cb) return ca - cb;
      return (b.data || '').localeCompare(a.data || '');
    }
    return 0;
  });

  // Tabella
  if (!visible.length) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg-card);border:1px dashed var(--border);border-radius:8px;font-size:12px">';
    if (!st.fatture.length) {
      html += '📭 <strong>Nessuna fattura presentabile su questa banca.</strong><br>';
      // Diagnostica visibile per capire dove finiscono le fatture
      if (st.diag) {
        html += '<div style="margin-top:14px;text-align:left;display:inline-block;font-size:11px;color:var(--text);background:var(--bg);padding:10px 14px;border-radius:6px;font-family:var(--font-mono)">';
        html += 'Fatture lette da DB: <strong>' + st.diag.totaliDB + '</strong><br>';
        if (st.diag.totaliDB === 0) {
          html += '<span style="color:#A32D2D">⚠ Tabella fatture_emesse vuota.</span><br>';
          html += '<span style="font-family:inherit;font-size:11px">→ Importa le fatture da Danea (sezione Fatture → Import XML)</span>';
        } else {
          if (st.diag.scartateTipoCredito > 0) html += '· Note credito (TD04/05/08): <strong>' + st.diag.scartateTipoCredito + '</strong><br>';
          if (st.diag.scartateSenzaImponibile > 0) html += '· Senza imponibile: <strong>' + st.diag.scartateSenzaImponibile + '</strong><br>';
          if (st.diag.scartateBusy > 0) html += '· Già impegnate in altro modulo: <strong>' + st.diag.scartateBusy + '</strong><br>';
          if (st.diag.scartateBlacklist > 0) html += '· Cliente in blacklist banca: <strong>' + st.diag.scartateBlacklist + '</strong><br>';
        }
        html += '</div>';
      }
    } else {
      html += 'Nessuna fattura corrisponde ai filtri.';
    }
    html += '</div>';
  } else {
    // Calcolo aggregati per cliente per warning massimale
    var anticipoPerClSelez = {};
    st.selezionate.forEach(function(fid) {
      var f = st.fatture.find(function(x) { return x.id === fid; });
      if (!f) return;
      var k = f.cliente_id || ('_' + f.cessionario_denominazione);
      anticipoPerClSelez[k] = (anticipoPerClSelez[k] || 0) + (f._anticipo_calc || 0);
    });

    html += '<div style="overflow-x:auto;max-height:400px;overflow-y:auto;border:0.5px solid var(--border);border-radius:6px;margin-bottom:10px"><table style="width:100%;border-collapse:collapse;font-size:11px;background:var(--bg-card)">';
    html += '<thead style="position:sticky;top:0;background:var(--bg);z-index:5"><tr>';
    html += '<th style="padding:7px 8px;text-align:center;border-bottom:0.5px solid var(--border);width:34px"><input type="checkbox" id="ant-pres-checkall" onchange="_antPresentaToggleAll(this.checked)"></th>';
    ['Nr Ft','Data','Cliente','Imponibile','Totale','Scad. cliente','Anticipo'].forEach(function(h) {
      html += '<th style="text-align:left;padding:7px 8px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;border-bottom:0.5px solid var(--border)">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    // Patch v20260503l: separatori visivi per categoria banca quando sortBy='banca_cli'
    // 1=stessa banca SBF (verde) · 2=assegno/contanti (giallo) · 3=altra banca (rosso, sub-ottimale)
    var lastCat = 0;
    var showSeparators = (st.sortBy === 'banca_cli');

    visible.forEach(function(f) {
      var checked = st.selezionate.has(f.id);
      var k = f.cliente_id || ('_' + f.cessionario_denominazione);
      var anticipoSelezPerCl = anticipoPerClSelez[k] || 0;
      var sopraMassimale = (st.massEuro && checked && anticipoSelezPerCl > st.massEuro);
      var isRete = !!f._is_rete;

      // Inserisci header di categoria al cambio
      if (showSeparators && f._categoria_banca && f._categoria_banca !== lastCat) {
        if (f._categoria_banca === 1) {
          html += '<tr><td colspan="8" style="background:#EAF3DE;color:#2B5016;font-weight:700;padding:8px 12px;font-size:11px;letter-spacing:0.3px;border-top:1px solid #B8D49A;border-bottom:1px solid #B8D49A">🟢 Bonifico/RiBa su ' + esc(st.bancaLabel || 'banca SBF') + ' <span style="font-weight:400;color:#4F7A2F;margin-left:6px">— stessa banca, anticipo ottimale</span></td></tr>';
        } else if (f._categoria_banca === 2) {
          html += '<tr><td colspan="8" style="background:#FAEEDA;color:#7A5316;font-weight:700;padding:8px 12px;font-size:11px;letter-spacing:0.3px;border-top:1px solid #E8C98A;border-bottom:1px solid #E8C98A">💵 Assegno / Contanti <span style="font-weight:400;color:#9B7A40;margin-left:6px">— girabili a qualsiasi banca</span></td></tr>';
        } else if (f._categoria_banca === 3) {
          html += '<tr><td colspan="8" style="background:#FCEBEB;color:#7A1F1F;font-weight:700;padding:8px 12px;font-size:11px;letter-spacing:0.3px;border-top:2px dashed #C97A7A;border-bottom:1px solid #E8B5B5">⚠ Bonifico/RiBa su altre banche <span style="font-weight:400;color:#9B4444;margin-left:6px">— sub-ottimale, l\'incasso entrerà su banca diversa</span></td></tr>';
        }
        lastCat = f._categoria_banca;
      }

      // Sfondi cumulabili: rete (arancione tenue) ha priorità su massimale solo se non selezionata; se selezionata vince selezionato
      var bgRow = '';
      if (sopraMassimale) bgRow = ';background:#FCEBEB';
      else if (checked) bgRow = ';background:rgba(107,95,204,0.08)';
      else if (isRete) bgRow = ';background:#FFF3E0'; // arancione tenue per rete non selezionate

      html += '<tr style="border-bottom:0.5px solid var(--border)' + bgRow + '">';
      html += '<td style="padding:5px 8px;text-align:center"><input type="checkbox" data-fid="' + f.id + '" onchange="_antPresentaToggleFatt(\'' + f.id + '\',this.checked)"' + (checked ? ' checked' : '') + '></td>';
      html += '<td style="padding:5px 8px;font-family:var(--font-mono);font-weight:600">' + esc(f.numero || '—') + '</td>';
      html += '<td style="padding:5px 8px">' + (f.data ? fmtD(f.data) : '—') + '</td>';
      html += '<td style="padding:5px 8px">' + esc(f.cessionario_denominazione || '—');
      if (isRete) {
        html += ' <span title="Cliente Rete: pagamento stretto, marginalità bassa — sconsigliato anticipare" style="display:inline-block;background:#F4A26A;color:#5C2C0C;font-size:9px;font-weight:700;padding:1px 6px;border-radius:8px;margin-left:4px;letter-spacing:0.3px">RETE</span>';
      }
      html += '</td>';
      html += '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono)">' + fmtE(f.imponibile_totale) + '</td>';
      html += '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + fmtE(f.importo_totale) + '</td>';
      html += '<td style="padding:5px 8px;font-size:10px">' + (f._scadenza_cliente ? fmtD(f._scadenza_cliente) : '—');
      if (f._n_rate > 1) html += ' <span style="color:var(--text-muted)">(' + f._n_rate + ' rate)</span>';
      html += '</td>';
      html += '<td style="padding:5px 8px;text-align:right;font-family:var(--font-mono);color:#26215C;font-weight:600">' + fmtE(f._anticipo_calc) + '</td>';
      html += '</tr>';
    });
    html += '</tbody></table></div>';

    // Warning massimali
    if (st.massEuro) {
      var clientiOver = Object.keys(anticipoPerClSelez).filter(function(k) { return anticipoPerClSelez[k] > st.massEuro; });
      if (clientiOver.length) {
        html += '<div style="background:#FCEBEB;border-left:4px solid #791F1F;color:#791F1F;padding:8px 14px;border-radius:6px;font-size:11px;margin-bottom:10px;font-weight:600">⚠ Massimale cliente superato (' + fmtE(st.massEuro) + ') per ' + clientiOver.length + ' cliente/i. Riduci la selezione.</div>';
      }
    }
    // Warning fatture cliente RETE selezionate (regola Phoenix Fuel)
    var nReteSelez = 0, totReteSelez = 0;
    st.selezionate.forEach(function(fid) {
      var f = st.fatture.find(function(x){ return x.id === fid; });
      if (f && f._is_rete) { nReteSelez++; totReteSelez += Number(f._anticipo_calc || 0); }
    });
    if (nReteSelez > 0) {
      html += '<div style="background:#FFF3E0;border-left:4px solid #D85A30;color:#5C2C0C;padding:8px 14px;border-radius:6px;font-size:11px;margin-bottom:10px;font-weight:600">';
      html += '🟠 Hai selezionato <strong>' + nReteSelez + '</strong> fattur' + (nReteSelez === 1 ? 'a' : 'e') + ' di clienti <strong>RETE</strong> (anticipo ' + fmtE(totReteSelez) + ').';
      html += '<div style="font-weight:400;font-size:10px;margin-top:3px">Sconsigliato: pagamento stretto + marginalità bassa azzerata dal costo banca. Verifica prima di proseguire.</div>';
      html += '</div>';
    }
  }

  // Riepilogo + bottoni
  var nSel = st.selezionate.size;
  var totImp = 0, totTot = 0, totAnt = 0;
  st.selezionate.forEach(function(fid) {
    var f = st.fatture.find(function(x) { return x.id === fid; });
    if (!f) return;
    totImp += Number(f.imponibile_totale || 0);
    totTot += Number(f.importo_totale || 0);
    totAnt += Number(f._anticipo_calc || 0);
  });

  html += '<div style="background:#EEEDFE;border:0.5px solid #6B5FCC;border-radius:8px;padding:10px 14px;margin-bottom:10px;display:flex;gap:18px;align-items:center;flex-wrap:wrap">';
  html += '<div style="font-size:12px;font-weight:600;color:#26215C">📊 Riepilogo selezione</div>';
  html += '<div style="font-size:11px;color:#26215C"><strong style="font-size:14px">' + nSel + '</strong> fatture</div>';
  html += '<div style="font-size:11px;color:#26215C">Imponibile: <strong style="font-family:var(--font-mono)">' + fmtE(totImp) + '</strong></div>';
  html += '<div style="font-size:11px;color:#26215C">Totale: <strong style="font-family:var(--font-mono)">' + fmtE(totTot) + '</strong></div>';
  html += '<div style="font-size:13px;color:#26215C;margin-left:auto">Anticipo richiesto: <strong style="font-family:var(--font-mono);font-size:16px">' + fmtE(totAnt) + '</strong></div>';
  html += '</div>';

  html += '<div style="display:flex;gap:8px;justify-content:flex-end">';
  html += '<button onclick="chiudiModal();_antPresentaState=null" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  var btnDisabled = (nSel === 0);
  html += '<button onclick="_antPresentaConferma()" ' + (btnDisabled ? 'disabled' : '') + ' class="btn-primary" style="font-size:12px;padding:8px 14px;background:#26215C' + (btnDisabled ? ';opacity:0.4;cursor:not-allowed' : '') + '">▶ Crea modulo (' + nSel + ' fatt., ' + fmtE(totAnt) + ')</button>';
  html += '</div>';

  html += '</div>';
  apriModal(html);

  // Restore valori form (se rerender)
  // (data/protocollo/scadenza/note non si conservano: l'utente li (re)inserisce solo a fine selezione)
}

function _antPresentaSetFilter(campo, val) {
  if (!_antPresentaState) return;
  if (campo === 'search') _antPresentaState.filterSearch = val;
  else if (campo === 'cliente') _antPresentaState.filterCliente = val;
  else if (campo === 'sortBy') _antPresentaState.sortBy = val;
  else if (campo === 'rete') _antPresentaState.filterRete = val;
  // Salva data/protocollo/scadenza/note prima di rerender
  _antPresentaSalvaForm();
  _antPresentaRender();
  _antPresentaRipristinaForm();
}

function _antPresentaToggleFatt(fid, checked) {
  if (!_antPresentaState) return;
  if (checked) _antPresentaState.selezionate.add(fid);
  else _antPresentaState.selezionate.delete(fid);
  _antPresentaSalvaForm();
  _antPresentaRender();
  _antPresentaRipristinaForm();
}

function _antPresentaToggleAll(checked) {
  if (!_antPresentaState) return;
  // Toggle solo le visibili dopo i filtri correnti
  var st = _antPresentaState;
  var visible = st.fatture.slice();
  if (st.filterCliente) {
    visible = visible.filter(function(f) {
      var k = f.cliente_id || f.cessionario_denominazione || '?';
      return k === st.filterCliente;
    });
  }
  if (st.filterSearch) {
    var q = st.filterSearch.toLowerCase();
    visible = visible.filter(function(f) {
      return (f.numero || '').toLowerCase().indexOf(q) >= 0
          || (f.cessionario_denominazione || '').toLowerCase().indexOf(q) >= 0;
    });
  }
  visible.forEach(function(f) {
    if (checked) st.selezionate.add(f.id);
    else st.selezionate.delete(f.id);
  });
  _antPresentaSalvaForm();
  _antPresentaRender();
  _antPresentaRipristinaForm();
}

function _antPresentaSelezionaTutte() { _antPresentaToggleAll(true); }
function _antPresentaDeselezionaTutte() { _antPresentaToggleAll(false); }

// Salva i 4 campi form prima di un rerender (filter/toggle)
function _antPresentaSalvaForm() {
  if (!_antPresentaState) return;
  _antPresentaState._formCache = {
    data: (document.getElementById('ant-pres-data') || {}).value || null,
    prot: (document.getElementById('ant-pres-prot') || {}).value || null,
    scad: (document.getElementById('ant-pres-scad') || {}).value || null,
    note: (document.getElementById('ant-pres-note') || {}).value || null
  };
}
function _antPresentaRipristinaForm() {
  if (!_antPresentaState || !_antPresentaState._formCache) return;
  var fc = _antPresentaState._formCache;
  if (fc.data && document.getElementById('ant-pres-data')) document.getElementById('ant-pres-data').value = fc.data;
  if (fc.prot && document.getElementById('ant-pres-prot')) document.getElementById('ant-pres-prot').value = fc.prot;
  if (fc.scad && document.getElementById('ant-pres-scad')) document.getElementById('ant-pres-scad').value = fc.scad;
  if (fc.note && document.getElementById('ant-pres-note')) document.getElementById('ant-pres-note').value = fc.note;
}

async function _antPresentaConferma() {
  var st = _antPresentaState;
  if (!st || st.selezionate.size === 0) { toast('Seleziona almeno una fattura'); return; }

  // Leggo metadati form
  var dataPres = document.getElementById('ant-pres-data').value;
  if (!dataPres) { toast('Indica la data di presentazione'); return; }
  var prot = (document.getElementById('ant-pres-prot').value || '').trim() || null;
  var scadDefault = document.getElementById('ant-pres-scad').value || null;
  var note = (document.getElementById('ant-pres-note').value || '').trim() || null;

  // Compongo le righe da inserire
  var righe = [];
  var totAnticipo = 0;
  var anticipoPerCl = {};
  st.selezionate.forEach(function(fid) {
    var f = st.fatture.find(function(x) { return x.id === fid; });
    if (!f) return;
    var anticipo = Number(f._anticipo_calc || 0);
    totAnticipo += anticipo;
    var k = f.cliente_id || ('_' + f.cessionario_denominazione);
    anticipoPerCl[k] = (anticipoPerCl[k] || 0) + anticipo;
    righe.push({
      _src_id: f.id,
      _src_cliente_id: f.cliente_id,
      _src_cliente_nome: f.cessionario_denominazione,
      numero_fattura: f.numero,
      data_emissione: f.data,
      totale_fattura: Number(f.importo_totale || 0),
      imponibile: Number(f.imponibile_totale || 0),
      scadenza_cliente: f._scadenza_cliente || null,
      scadenza_banca: scadDefault || f._scadenza_cliente || dataPres, // fallback sicuro: data presentazione
      percentuale_applicata: st.perc,
      base_calcolo_applicata: st.base,
      importo_anticipato_calcolato: anticipo,
      stato: 'presentata'
    });
  });

  // Validazione massimale per cliente
  if (st.massEuro) {
    var over = Object.keys(anticipoPerCl).filter(function(k) { return anticipoPerCl[k] > st.massEuro; });
    if (over.length) {
      toast('Massimale superato per ' + over.length + ' cliente/i. Riduci la selezione.');
      return;
    }
  }

  // Conferma finale
  if (!confirm('Creare il modulo con ' + righe.length + ' fatture e anticipo richiesto ' + fmtE(totAnticipo) + ' su ' + st.bancaLabel + '?')) return;

  // 1. INSERT presentazione
  var resPres = await sb.from('anticipi_sbf_presentazioni').insert([{
    affidamento_id: st.affidamentoId,
    data_presentazione: dataPres,
    numero_protocollo: prot,
    stato: 'in_delibera',
    importo_richiesto: totAnticipo,
    importo_anticipato_totale: 0,
    note: note
  }]).select('id').single();

  if (resPres.error || !resPres.data) {
    toast('❌ Errore creazione modulo: ' + (resPres.error ? resPres.error.message : 'sconosciuto'));
    return;
  }
  var presId = resPres.data.id;

  // 2. INSERT fatture (chunk a 100)
  var payload = righe.map(function(r) {
    return {
      presentazione_id: presId,
      fattura_id: r._src_id,
      numero_fattura: r.numero_fattura,
      data_emissione: r.data_emissione,
      cliente_id: r._src_cliente_id,
      cliente_nome: r._src_cliente_nome,
      totale_fattura: r.totale_fattura,
      imponibile: r.imponibile,
      scadenza_cliente: r.scadenza_cliente,
      scadenza_banca: r.scadenza_banca,
      percentuale_applicata: r.percentuale_applicata,
      base_calcolo_applicata: r.base_calcolo_applicata,
      importo_anticipato_calcolato: r.importo_anticipato_calcolato,
      stato: r.stato
    };
  });

  var insErr = null;
  for (var i = 0; i < payload.length; i += 100) {
    var chunk = payload.slice(i, i + 100);
    var resI = await sb.from('anticipi_sbf_fatture').insert(chunk);
    if (resI.error) { insErr = resI.error; break; }
  }

  if (insErr) {
    // Rollback presentazione (se nessuna fattura inserita)
    await sb.from('anticipi_sbf_presentazioni').delete().eq('id', presId);
    toast('❌ Errore inserimento fatture: ' + insErr.message + ' (modulo annullato)');
    return;
  }

  chiudiModal();
  _antPresentaState = null;
  toast('✓ Modulo creato: ' + righe.length + ' fatture, anticipo ' + fmtE(totAnticipo));
  // Refresh tab banca
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}

// ═══════════════════════════════════════════════════════════════════════════
// DETTAGLIO MODULO (vista read-only completa)
// ═══════════════════════════════════════════════════════════════════════════
// Apre una modale con la fotografia di una presentazione: header con dati
// banca/protocollo/stato + KPI (richiesto/anticipato/estinto/aperto/netto),
// tabella fatture (con scadenze e stati), elenco accrediti banca, eventuali
// costi banca (commissioni/interessi). Usata per moduli storici da Storico
// e per audit dei moduli attivi.
async function _antRenderDettaglioModulo(presentazioneId) {
  if (!presentazioneId) return;

  // Carica tutto il necessario in parallelo
  apriModal('<div style="padding:30px;text-align:center;color:var(--text-muted)">⏳ Caricamento dettaglio modulo...</div>');

  var resP = await sb.from('anticipi_sbf_presentazioni').select('*').eq('id', presentazioneId).single();
  if (resP.error || !resP.data) {
    apriModal('<div style="padding:24px"><div style="color:#A32D2D;font-weight:600">❌ Modulo non trovato</div>'
      + '<div style="margin-top:12px;text-align:right"><button onclick="chiudiModal()" style="padding:8px 14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">Chiudi</button></div></div>');
    return;
  }
  var p = resP.data;

  // Le 3 query dipendenti (fatture/accrediti/costi) si fanno in parallelo:
  // prima erano 3 await sequenziali (3 round-trip), ora 1 round-trip parallelo.
  var [resF, resA, resC] = await Promise.all([
    sb.from('anticipi_sbf_fatture').select('*').eq('presentazione_id', presentazioneId).order('numero_fattura'),
    sb.from('anticipi_sbf_accrediti').select('*').eq('presentazione_id', presentazioneId).order('data_accredito'),
    sb.from('anticipi_sbf_costi').select('*').eq('presentazione_id', presentazioneId).order('data_competenza')
  ]);

  var fatture = resF.data || [];
  var accrediti = resA.data || [];
  var costi = resC.data || [];

  // Info banca
  var aff = (_bancheAffidamenti || []).find(function(a) { return a.id === p.affidamento_id; }) || {};
  var ist = (_bancheIstituti || []).find(function(i) { return i.id === aff.istituto_id; }) || {};
  var cc  = (_bancheConti || []).find(function(c) { return c.id === aff.conto_id; });
  var bancaLabel = (ist.nome || '—') + (cc && cc.numero_conto ? ' /' + cc.numero_conto.slice(-4) : '');

  // Calcoli aggregati
  var totaleEstinto = fatture.reduce(function(s, f) { return s + Number(f.importo_estinto || 0); }, 0);
  var importoAperto = Number(p.importo_anticipato_totale || 0) - totaleEstinto;
  var nFt = fatture.length;
  var nFtPresentate = fatture.filter(function(f) { return f.stato === 'presentata'; }).length;
  var nFtAnticipate = fatture.filter(function(f) { return f.stato === 'anticipata'; }).length;
  var nFtEstinte = fatture.filter(function(f) { return f.stato === 'estinta'; }).length;
  var nFtInsolute = fatture.filter(function(f) { return f.stato === 'insoluta'; }).length;

  var costoReale = costi.reduce(function(s, c) { return s + Number(c.importo_reale || 0); }, 0);
  var costoPreventivato = costi.reduce(function(s, c) { return s + Number(c.importo_preventivato || 0); }, 0);
  var nettoIncassato = Number(p.importo_anticipato_totale || 0) - costoReale;

  var statoColor = {
    'in_delibera':         { bg: '#EEEDFE', fg: '#26215C', label: 'In delibera' },
    'anticipata_parziale': { bg: '#FAEEDA', fg: '#633806', label: 'Anticipata parziale' },
    'anticipata':          { bg: '#E6F1FB', fg: '#0C447C', label: 'Anticipata' },
    'estinta':             { bg: '#EAF3DE', fg: '#27500A', label: 'Estinta' },
    'insoluta':            { bg: '#FCEBEB', fg: '#791F1F', label: 'Insoluta' },
    'rifiutata':           { bg: '#FCEBEB', fg: '#791F1F', label: 'Rifiutata' }
  }[p.stato] || { bg: '#f0f0f0', fg: '#666', label: p.stato };

  // Build modale (stile largo: 920px)
  var html = '<div style="max-width:920px;width:100%">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;flex-wrap:wrap;gap:10px">';
  html += '<div>';
  html += '<div style="font-size:17px;font-weight:700;color:var(--text)">📋 Modulo del ' + fmtD(p.data_presentazione) + '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">';
  html += '🏛 ' + esc(bancaLabel);
  if (p.numero_protocollo) html += ' · prot. <span style="font-family:var(--font-mono)">' + esc(p.numero_protocollo) + '</span>';
  html += '</div>';
  html += '</div>';
  html += '<span style="background:' + statoColor.bg + ';color:' + statoColor.fg + ';padding:4px 12px;border-radius:11px;font-size:11px;font-weight:700;letter-spacing:0.3px">' + statoColor.label + '</span>';
  html += '</div>';

  // KPI cockpit
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px">';
  html += _antKpiCard('Richiesto', fmtE(p.importo_richiesto), '');
  html += _antKpiCard('Anticipato', fmtE(p.importo_anticipato_totale), '#26215C');
  if (totaleEstinto > 0) html += _antKpiCard('Estinto', fmtE(totaleEstinto), '#27500A');
  // Patch v20260502g: render condizionale dello stato "aperto" coerente con la card
  if (p.stato === 'estinta') {
    html += _antKpiCard('Stato finale', '✓ Rientrata' + (p.data_estinta ? '<br><small style="font-size:10px">' + fmtD(p.data_estinta) + '</small>' : ''), '#27500A');
  } else if (p.stato === 'insoluta') {
    html += _antKpiCard('Stato finale', '❌ Insoluta' + (p.data_insoluto ? '<br><small style="font-size:10px">' + fmtD(p.data_insoluto) + '</small>' : ''), '#A32D2D');
  } else if (p.stato === 'rifiutata') {
    html += _antKpiCard('Stato finale', '✗ Rifiutata', '#888');
  } else if (p.stato === 'anticipata' && importoAperto > 0) {
    html += _antKpiCard('Da rientrare', fmtE(importoAperto), '#BA7517');
  } else if (importoAperto > 0) {
    html += _antKpiCard('Aperto', fmtE(importoAperto), '#BA7517');
  }
  if (costoReale > 0) html += _antKpiCard('Costi banca', fmtE(costoReale), '#A32D2D');
  if (costoReale > 0 || costoPreventivato > 0) html += _antKpiCard('Netto incassato', fmtE(nettoIncassato), '#27500A');
  html += '</div>';

  // Riepilogo fatture per stato
  html += '<div style="background:var(--bg);border-radius:6px;padding:8px 14px;margin-bottom:14px;font-size:11px;color:var(--text-muted);display:flex;gap:14px;flex-wrap:wrap">';
  html += '<span><strong>' + nFt + '</strong> fatture totali</span>';
  if (nFtPresentate) html += '<span>· <strong>' + nFtPresentate + '</strong> presentate</span>';
  if (nFtAnticipate) html += '<span>· <strong style="color:#0C447C">' + nFtAnticipate + '</strong> anticipate</span>';
  if (nFtEstinte) html += '<span>· <strong style="color:#27500A">' + nFtEstinte + '</strong> estinte</span>';
  if (nFtInsolute) html += '<span>· <strong style="color:#791F1F">' + nFtInsolute + '</strong> insolute</span>';
  html += '</div>';

  // Note presentazione
  if (p.note) {
    html += '<div style="background:#FAEEDA;border-left:4px solid #BA7517;padding:8px 14px;margin-bottom:14px;font-size:12px;color:#633806;border-radius:4px"><strong>Note:</strong> ' + esc(p.note) + '</div>';
  }

  // ─── TABELLA FATTURE ─────────────────────────────────────────────────────
  html += '<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text)">📄 Fatture nel modulo</div>';
  if (!fatture.length) {
    html += '<div style="padding:14px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:6px;font-size:11px">Nessuna fattura nel modulo</div>';
  } else {
    html += '<div style="overflow-x:auto;margin-bottom:14px"><table style="width:100%;border-collapse:collapse;font-size:11px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:6px;overflow:hidden">';
    html += '<thead><tr style="background:var(--bg)">';
    ['Nr Ft', 'Data', 'Cliente', 'Imponibile', 'Totale', '% Ant', 'Anticipato', 'Estinto', 'Scad. cli', 'Scad. banca', 'Stato'].forEach(function(h) {
      html += '<th style="text-align:left;padding:7px 8px;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;border-bottom:0.5px solid var(--border)">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    var totImp = 0, totTot = 0, totAnt = 0, totEst = 0;
    fatture.forEach(function(f) {
      totImp += Number(f.imponibile || 0);
      totTot += Number(f.totale_fattura || 0);
      totAnt += Number(f.importo_anticipato_calcolato || 0);
      totEst += Number(f.importo_estinto || 0);

      var stColors = {
        'presentata': { bg: '#EEEDFE', fg: '#26215C', label: 'Presentata' },
        'anticipata': { bg: '#E6F1FB', fg: '#0C447C', label: 'Anticipata' },
        'estinta':    { bg: '#EAF3DE', fg: '#27500A', label: 'Estinta' },
        'insoluta':   { bg: '#FCEBEB', fg: '#791F1F', label: 'Insoluta' },
        'esclusa':    { bg: '#f0f0f0', fg: '#888', label: 'Esclusa' }
      }[f.stato] || { bg: '#f0f0f0', fg: '#666', label: f.stato };

      html += '<tr style="border-bottom:0.5px solid var(--border)' + (f.stato === 'estinta' ? ';opacity:0.7' : '') + '">';
      html += '<td style="padding:7px 8px;font-family:var(--font-mono);font-weight:600">' + esc(f.numero_fattura || '—') + '</td>';
      html += '<td style="padding:7px 8px">' + (f.data_emissione ? fmtD(f.data_emissione) : '—') + '</td>';
      html += '<td style="padding:7px 8px">' + esc(f.cliente_nome || '—') + '</td>';
      html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono)">' + fmtE(f.imponibile) + '</td>';
      html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + fmtE(f.totale_fattura) + '</td>';
      html += '<td style="padding:7px 8px;text-align:center;font-family:var(--font-mono);font-size:10px">' + (f.percentuale_applicata !== null ? Number(f.percentuale_applicata).toFixed(0) + '%' : '—') + '</td>';
      html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:#26215C;font-weight:600">' + fmtE(f.importo_anticipato_calcolato) + '</td>';
      html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);color:' + (Number(f.importo_estinto) > 0 ? '#27500A' : 'var(--text-hint)') + ';font-weight:' + (Number(f.importo_estinto) > 0 ? '600' : '400') + '">' + fmtE(f.importo_estinto) + '</td>';
      html += '<td style="padding:7px 8px;font-size:10px">' + (f.scadenza_cliente ? fmtD(f.scadenza_cliente) : '—') + '</td>';
      html += '<td style="padding:7px 8px;font-size:10px;font-weight:500">' + (f.scadenza_banca ? fmtD(f.scadenza_banca) : '—') + '</td>';
      html += '<td style="padding:5px 8px"><span style="background:' + stColors.bg + ';color:' + stColors.fg + ';padding:2px 7px;border-radius:9px;font-size:9px;font-weight:700">' + stColors.label + '</span></td>';
      html += '</tr>';
    });

    // Riga totali
    html += '<tr style="background:var(--bg);font-weight:700">';
    html += '<td colspan="3" style="padding:8px;font-size:10px;text-transform:uppercase;color:var(--text-muted);letter-spacing:0.3px">Totali</td>';
    html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono)">' + fmtE(totImp) + '</td>';
    html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono)">' + fmtE(totTot) + '</td>';
    html += '<td></td>';
    html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono);color:#26215C">' + fmtE(totAnt) + '</td>';
    html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtE(totEst) + '</td>';
    html += '<td colspan="3"></td>';
    html += '</tr>';
    html += '</tbody></table></div>';
  }

  // ─── ACCREDITI BANCA ──────────────────────────────────────────────────────
  html += '<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text);margin-top:14px">💰 Accrediti banca</div>';
  if (!accrediti.length) {
    html += '<div style="padding:14px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:6px;font-size:11px;margin-bottom:14px">Nessun accredito registrato</div>';
  } else {
    html += '<div style="background:#EAF3DE;border:0.5px solid #97C459;border-radius:6px;padding:8px 14px;margin-bottom:14px">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr><th style="text-align:left;padding:5px 0;font-size:10px;color:#27500A;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">Data</th><th style="text-align:right;padding:5px 0;font-size:10px;color:#27500A;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">Importo</th><th style="text-align:left;padding:5px 8px;font-size:10px;color:#27500A;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">Note</th></tr></thead>';
    html += '<tbody>';
    var totAccr = 0;
    accrediti.forEach(function(a) {
      totAccr += Number(a.importo || 0);
      html += '<tr style="border-top:0.5px dashed #97C459">';
      html += '<td style="padding:5px 0;font-family:var(--font-mono);font-size:11px">' + fmtD(a.data_accredito) + '</td>';
      html += '<td style="padding:5px 0;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">' + fmtE(a.importo) + '</td>';
      html += '<td style="padding:5px 8px;font-size:10px;color:#27500A">' + esc(a.note || '') + '</td>';
      html += '</tr>';
    });
    html += '<tr style="border-top:1px solid #97C459;font-weight:700"><td style="padding:5px 0;font-size:10px;color:#27500A;text-transform:uppercase;letter-spacing:0.3px">Totale accrediti</td><td style="padding:5px 0;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtE(totAccr) + '</td><td></td></tr>';
    html += '</tbody></table></div>';
  }

  // ─── COSTI BANCA ──────────────────────────────────────────────────────────
  if (costi.length) {
    html += '<div style="font-size:12px;font-weight:600;margin-bottom:6px;color:var(--text);margin-top:14px">💸 Costi banca</div>';
    html += '<div style="background:#FCEBEB;border:0.5px solid #E2A4A4;border-radius:6px;padding:8px 14px;margin-bottom:14px">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead><tr>';
    ['Data', 'Tipo', 'Preventivato', 'Reale', 'Riferimento'].forEach(function(h) {
      html += '<th style="text-align:left;padding:5px 0;font-size:10px;color:#791F1F;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';
    var totPrev = 0, totReal = 0;
    var tipoLabels = {
      'interessi': 'Interessi',
      'commissioni': 'Commissioni',
      'spese_incasso': 'Spese incasso',
      'imposta_bollo': 'Imposta bollo',
      'altro': 'Altro'
    };
    costi.forEach(function(c) {
      totPrev += Number(c.importo_preventivato || 0);
      totReal += Number(c.importo_reale || 0);
      html += '<tr style="border-top:0.5px dashed #E2A4A4">';
      html += '<td style="padding:5px 0;font-family:var(--font-mono);font-size:11px">' + fmtD(c.data_competenza) + '</td>';
      html += '<td style="padding:5px 0;font-size:11px">' + (tipoLabels[c.tipo_costo] || c.tipo_costo) + '</td>';
      html += '<td style="padding:5px 0;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + (c.importo_preventivato ? fmtE(c.importo_preventivato) : '—') + '</td>';
      html += '<td style="padding:5px 0;text-align:right;font-family:var(--font-mono);font-weight:600;color:#791F1F">' + (c.importo_reale !== null && c.importo_reale !== undefined ? fmtE(c.importo_reale) : '<span style="color:var(--text-hint);font-weight:400">in attesa</span>') + '</td>';
      html += '<td style="padding:5px 0;font-size:10px;color:var(--text-muted)">' + esc(c.riferimento || '') + '</td>';
      html += '</tr>';
    });
    html += '<tr style="border-top:1px solid #E2A4A4;font-weight:700">';
    html += '<td colspan="2" style="padding:5px 0;font-size:10px;color:#791F1F;text-transform:uppercase;letter-spacing:0.3px">Totale costi</td>';
    html += '<td style="padding:5px 0;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + fmtE(totPrev) + '</td>';
    html += '<td style="padding:5px 0;text-align:right;font-family:var(--font-mono);color:#791F1F">' + fmtE(totReal) + '</td>';
    html += '<td></td></tr>';
    html += '</tbody></table></div>';
  }

  // Pulsanti footer
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;padding-top:14px;border-top:0.5px solid var(--border)">';
  html += '<button onclick="chiudiModal()" class="btn-primary" style="font-size:12px;padding:8px 14px">Chiudi</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

// Helper: card KPI riutilizzata da _antRenderDettaglioModulo
function _antKpiCard(label, value, color) {
  var c = color || 'var(--text)';
  return '<div style="background:var(--bg-kpi);border-radius:8px;padding:10px 12px">'
    + '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600;margin-bottom:3px">' + label + '</div>'
    + '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + c + '">' + value + '</div>'
    + '</div>';
}

function _antStampaPDFBanca(affidamentoId) {
  toast('🚧 Stampa PDF banca — al prossimo step');
}

// ═══════════════════════════════════════════════════════════════════════════
// MODALE BLACKLIST (aggiungi/modifica/rimuovi cliente escluso)
// ═══════════════════════════════════════════════════════════════════════════
// Modello semplificato: una "regola" qui è solo un'esclusione.
// La tabella anticipi_sbf_regole conserva i campi % e massimale per
// backward compatibility e per eventuali eccezioni future, ma da questa UI
// si scrive solo stato='esclusa' (decisione utente 28/04).
// ─────────────────────────────────────────────────────────────────────────────
async function _antApriModaleRegola(regolaId, affidamentoId) {
  if (!_antPuoGestireRegole()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }

  // Carica regola esistente se in modifica
  var regola = null;
  if (regolaId) {
    var resR = await sb.from('anticipi_sbf_regole').select('*').eq('id', regolaId).single();
    if (resR.error || !resR.data) { toast('Regola non trovata'); return; }
    regola = resR.data;
    affidamentoId = regola.affidamento_id;
  }
  if (!affidamentoId) { toast('Affidamento mancante'); return; }

  // Info banca per header
  var fido = (_bancheAffidamenti || []).find(function(f) { return f.id === affidamentoId; }) || {};
  var ist = (_bancheIstituti || []).find(function(i) { return i.id === fido.istituto_id; }) || {};
  var cc  = (_bancheConti || []).find(function(c) { return c.id === fido.conto_id; });
  var bancaLabel = (ist.nome || '—') + (cc && cc.numero_conto ? ' /' + cc.numero_conto.slice(-4) : '');

  // Cache clienti
  if (!_antClientiCache) {
    try {
      var resC = await sb.from('clienti').select('id, ragione_sociale, denominazione, nome, cliente_rete').limit(2000);
      _antClientiCache = (resC.data || []).map(function(c) {
        return { id: c.id, nome: c.ragione_sociale || c.denominazione || c.nome || '—', cliente_rete: c.cliente_rete === true };
      }).sort(function(a,b){ return a.nome.localeCompare(b.nome); });
    } catch (e) { _antClientiCache = []; }
  }

  // Clienti già in blacklist su questa banca (per nasconderli in creazione)
  var resG = await sb.from('anticipi_sbf_regole').select('cliente_id').eq('affidamento_id', affidamentoId).eq('stato', 'esclusa');
  var clientiBlacklist = new Set((resG.data || []).filter(function(r) {
    return r.cliente_id && (!regola || r.cliente_id !== regola.cliente_id);
  }).map(function(r) { return r.cliente_id; }));

  var titolo = !regola ? '🚫 Aggiungi cliente alla blacklist' : '✏️ Modifica esclusione cliente';

  var html = '<div style="max-width:520px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:6px;color:#791F1F">' + titolo + '</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">🏛 ' + esc(bancaLabel) + '</div>';

  html += '<div style="display:grid;gap:10px">';

  // Cliente
  if (regola) {
    html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Cliente escluso</label>';
    html += '<div style="padding:8px;background:#FCEBEB;border-radius:6px;font-size:13px;font-weight:500;color:#791F1F">';
    var cl = _antClientiCache.find(function(c) { return c.id === regola.cliente_id; });
    html += '🚫 ' + esc((cl || {}).nome || '(cliente eliminato)');
    html += '</div></div>';
    html += '<input type="hidden" id="mod-reg-cliente" value="' + (regola.cliente_id || '') + '">';
  } else {
    html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Cliente da escludere *</label>';
    html += '<select id="mod-reg-cliente" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px">';
    html += '<option value="">— seleziona cliente —</option>';
    _antClientiCache.forEach(function(c) {
      if (clientiBlacklist.has(c.id)) return; // nasconde clienti già in blacklist
      html += '<option value="' + c.id + '">' + esc(c.nome) + '</option>';
    });
    html += '</select>';
    html += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">I clienti già in blacklist su questa banca non compaiono</div>';
    html += '</div>';
  }

  // Note
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Motivo / note (opzionale)</label>';
  html += '<textarea id="mod-reg-note" placeholder="Es. cliente protestato, banca rifiuta, sospeso causa contenzioso..." style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;min-height:54px;resize:vertical">' + esc((regola && regola.note) || '') + '</textarea></div>';

  html += '</div>'; // /grid

  // Pulsanti
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  if (regola) {
    html += '<button onclick="_antEliminaRegola(\'' + regola.id + '\')" style="background:#27500A;color:white;border:0;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;margin-right:auto">↺ Riabilita cliente</button>';
  }
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  var arg = regola ? "'" + regola.id + "'" : 'null';
  html += '<button onclick="_antSalvaRegola(' + arg + ',\'' + affidamentoId + '\')" class="btn-primary" style="font-size:12px;padding:8px 14px;background:#791F1F">💾 Salva</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

async function _antSalvaRegola(regolaId, affidamentoId) {
  if (!_antPuoGestireRegole()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }

  var clienteIdRaw = (document.getElementById('mod-reg-cliente').value || '').trim();
  var clienteId = clienteIdRaw || null;
  var note = document.getElementById('mod-reg-note').value.trim() || null;

  if (!regolaId && !clienteId) { toast('Seleziona un cliente'); return; }

  var payload = {
    affidamento_id: affidamentoId,
    cliente_id: clienteId,
    stato: 'esclusa',
    // Per blacklist queste colonne non hanno significato → null
    percentuale_anticipo: null,
    base_calcolo: null,
    massimale_cliente: null,
    note: note,
    modificato_at: new Date().toISOString()
  };

  try {
    var res;
    if (regolaId) {
      // In modifica aggiorniamo solo le note (cliente e affidamento sono fissi)
      res = await sb.from('anticipi_sbf_regole').update({
        note: note,
        modificato_at: new Date().toISOString()
      }).eq('id', regolaId);
    } else {
      res = await sb.from('anticipi_sbf_regole').insert([payload]);
    }
    if (res.error) {
      var msg = res.error.message || '';
      if (msg.indexOf('duplicate') >= 0 || msg.indexOf('unique') >= 0) {
        toast('Cliente già in blacklist su questa banca');
      } else {
        toast('Errore salvataggio: ' + msg);
      }
      return;
    }
    chiudiModal();
    toast(regolaId ? '✓ Note aggiornate' : '✓ Cliente escluso dalla banca');
    if (typeof _antRenderTabRegole === 'function') await _antRenderTabRegole();
  } catch (err) {
    console.error('[anticipi] _antSalvaRegola:', err);
    toast('Errore: ' + (err.message || err));
  }
}

async function _antEliminaRegola(regolaId) {
  if (!_antPuoGestireRegole()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  if (!regolaId) return;

  // Recupera info regola per messaggio confirm
  var resR = await sb.from('anticipi_sbf_regole').select('*').eq('id', regolaId).single();
  if (resR.error || !resR.data) { toast('Regola non trovata'); return; }
  var regola = resR.data;
  var cl = (_antClientiCache || []).find(function(c) { return c.id === regola.cliente_id; });
  var nomeCl = (cl || {}).nome || '(cliente sconosciuto)';

  if (!confirm('Riabilitare il cliente «' + nomeCl + '» per questa banca?\n\nLe sue fatture torneranno disponibili per anticipo.')) return;

  var resD = await sb.from('anticipi_sbf_regole').delete().eq('id', regolaId);
  if (resD.error) { toast('Errore: ' + resD.error.message); return; }
  chiudiModal();
  toast('✓ Cliente riabilitato');
  if (typeof _antRenderTabRegole === 'function') await _antRenderTabRegole();
}


// ═══════════════════════════════════════════════════════════════════════════
// MODALE REGISTRA ACCREDITO — banca accredita N euro su modulo X
// ═══════════════════════════════════════════════════════════════════════════
// Inserisce un record in anticipi_sbf_accrediti. Il trigger DB ricalcola
// automaticamente importo_anticipato_totale e stato della presentazione.
// Più accrediti per stesso modulo sono ammessi (caso reale: 49.759 il 23/04
// + 14.448 il 24/04). UI: data, importo, note + lista accrediti già fatti.
async function _antRenderModaleAccredito(presentazioneId) {
  if (!_antPuoAccredito()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  if (!presentazioneId) return;

  apriModal('<div style="padding:24px;text-align:center;color:var(--text-muted)">⏳ Caricamento...</div>');

  // Carica presentazione + accrediti esistenti
  var resP = await sb.from('anticipi_sbf_presentazioni').select('*').eq('id', presentazioneId).single();
  if (resP.error || !resP.data) { toast('Modulo non trovato'); chiudiModal(); return; }
  var p = resP.data;
  var resA = await sb.from('anticipi_sbf_accrediti').select('*').eq('presentazione_id', presentazioneId).order('data_accredito');
  var accrediti = resA.data || [];

  // Info banca
  var aff = (_bancheAffidamenti || []).find(function(a) { return a.id === p.affidamento_id; }) || {};
  var ist = (_bancheIstituti || []).find(function(i) { return i.id === aff.istituto_id; }) || {};
  var bancaLabel = ist.nome || '—';

  var richiesto = Number(p.importo_richiesto || 0);
  var giaAnticipato = Number(p.importo_anticipato_totale || 0);
  var residuo = richiesto - giaAnticipato;
  var oggiISO = new Date().toISOString().split('T')[0];

  var html = '<div style="max-width:560px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:6px;color:#27500A">💰 Registra accredito banca</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">📋 Modulo del ' + fmtD(p.data_presentazione) + ' · 🏛 ' + esc(bancaLabel) + '</div>';

  // Box situazione corrente
  html += '<div style="background:var(--bg);border-radius:6px;padding:10px 14px;margin-bottom:14px;display:flex;gap:18px;flex-wrap:wrap">';
  html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Richiesto</span> <span style="font-family:var(--font-mono);font-weight:600;font-size:13px">' + fmtE(richiesto) + '</span></div>';
  html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Già anticipato</span> <span style="font-family:var(--font-mono);font-weight:600;font-size:13px;color:#26215C">' + fmtE(giaAnticipato) + '</span></div>';
  html += '<div><span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Residuo richiesto</span> <span style="font-family:var(--font-mono);font-weight:600;font-size:13px;color:' + (residuo > 0 ? '#BA7517' : '#27500A') + '">' + fmtE(residuo) + '</span></div>';
  html += '</div>';

  // Form nuovo accredito
  html += '<div style="background:#EAF3DE;border:0.5px solid #97C459;border-radius:8px;padding:12px 14px;margin-bottom:14px">';
  html += '<div style="font-size:12px;font-weight:600;color:#27500A;margin-bottom:10px">+ Nuovo accredito</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Data accredito *</label>';
  html += '<input id="ant-acc-data" type="date" value="' + oggiISO + '" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px"></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Importo (€) *</label>';
  html += '<input id="ant-acc-importo" type="number" step="0.01" min="0" value="' + (residuo > 0 ? residuo.toFixed(2) : '') + '" placeholder="0.00" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px;font-family:var(--font-mono);font-weight:600"></div>';
  html += '</div>';
  html += '<div style="margin-top:8px"><label style="font-size:11px;color:var(--text-muted);font-weight:500">Note (opzionali)</label>';
  html += '<input id="ant-acc-note" type="text" placeholder="Es. valuta 24/04 — accredito parziale" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);font-size:12px"></div>';
  html += '</div>';

  // Lista accrediti esistenti
  if (accrediti.length) {
    html += '<div style="margin-bottom:14px">';
    html += '<div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:6px">Accrediti già registrati (' + accrediti.length + ')</div>';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:6px;overflow:hidden">';
    accrediti.forEach(function(a) {
      html += '<tr style="border-bottom:0.5px solid var(--border)">';
      html += '<td style="padding:6px 10px;font-family:var(--font-mono)">' + fmtD(a.data_accredito) + '</td>';
      html += '<td style="padding:6px 10px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">' + fmtE(a.importo) + '</td>';
      html += '<td style="padding:6px 10px;font-size:10px;color:var(--text-muted)">' + esc(a.note || '') + '</td>';
      html += '<td style="padding:4px 10px;text-align:right"><button onclick="_antEliminaAccredito(\'' + a.id + '\',\'' + presentazioneId + '\')" title="Elimina" style="background:none;border:0.5px solid #E24B4A;color:#E24B4A;padding:3px 7px;border-radius:4px;cursor:pointer;font-size:10px">🗑</button></td>';
      html += '</tr>';
    });
    html += '</table></div>';
  }

  // Pulsanti
  html += '<div style="display:flex;gap:8px;justify-content:flex-end">';
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_antSalvaAccredito(\'' + presentazioneId + '\')" class="btn-primary" style="font-size:12px;padding:8px 14px;background:#27500A">💰 Registra accredito</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

async function _antSalvaAccredito(presentazioneId) {
  if (!_antPuoAccredito()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  var data = document.getElementById('ant-acc-data').value;
  var importoRaw = document.getElementById('ant-acc-importo').value;
  var note = (document.getElementById('ant-acc-note').value || '').trim() || null;

  if (!data) { toast('Inserisci la data accredito'); return; }
  var importo = Number(importoRaw);
  if (!isFinite(importo) || importo <= 0) { toast('Importo non valido'); return; }

  var resI = await sb.from('anticipi_sbf_accrediti').insert([{
    presentazione_id: presentazioneId,
    data_accredito: data,
    importo: importo,
    note: note
  }]);

  if (resI.error) { toast('❌ Errore: ' + resI.error.message); return; }

  chiudiModal();
  toast('✓ Accredito di ' + fmtE(importo) + ' registrato');
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}

async function _antEliminaAccredito(accreditoId, presentazioneId) {
  if (!_antPuoAccredito()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  if (!confirm('Eliminare questo accredito?\n\nIl trigger DB ricalcolerà importo_anticipato_totale e stato del modulo.')) return;
  var resD = await sb.from('anticipi_sbf_accrediti').delete().eq('id', accreditoId);
  if (resD.error) { toast('❌ Errore: ' + resD.error.message); return; }
  toast('✓ Accredito eliminato');
  // Riapri la modale aggiornata
  await _antRenderModaleAccredito(presentazioneId);
}


// ═══════════════════════════════════════════════════════════════════════════
// MODALE REGISTRA INCASSO — fattura anticipata diventa estinta
// ═══════════════════════════════════════════════════════════════════════════
// Quando il cliente paga la fattura, la banca può:
//  (a) trattenere l'anticipo dall'incasso → fattura estinta totalmente
//  (b) addebitare differenza al cliente → fattura estinta totalmente comunque
// Da PhoenixFuel registriamo: data_incasso, importo_estinto. Il default
// dell'importo è importo_anticipato_calcolato (caso 95%). Se diverso, l'utente
// modifica. Stato passa a 'estinta'.
async function _antRenderModaleIncasso(fatturaAntId) {
  if (!_antPuoIncasso()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  if (!fatturaAntId) return;

  apriModal('<div style="padding:24px;text-align:center;color:var(--text-muted)">⏳ Caricamento...</div>');

  var resF = await sb.from('anticipi_sbf_fatture').select('*').eq('id', fatturaAntId).single();
  if (resF.error || !resF.data) { toast('Fattura non trovata'); chiudiModal(); return; }
  var f = resF.data;

  if (f.stato === 'estinta') { toast('Fattura già estinta'); chiudiModal(); return; }

  var defaultImporto = Number(f.importo_anticipato_calcolato || 0);
  var oggiISO = new Date().toISOString().split('T')[0];

  var html = '<div style="max-width:520px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:6px;color:#27500A">✓ Registra incasso cliente</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Fattura <strong style="font-family:var(--font-mono)">' + esc(f.numero_fattura || '?') + '</strong> · ' + esc(f.cliente_nome || '?') + '</div>';

  // Box dati fattura
  html += '<div style="background:var(--bg);border-radius:6px;padding:10px 14px;margin-bottom:14px;display:grid;grid-template-columns:repeat(3,1fr);gap:8px;font-size:11px">';
  html += '<div><span style="color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-size:9px;display:block">Imponibile</span><strong style="font-family:var(--font-mono)">' + fmtE(f.imponibile) + '</strong></div>';
  html += '<div><span style="color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-size:9px;display:block">Totale</span><strong style="font-family:var(--font-mono)">' + fmtE(f.totale_fattura) + '</strong></div>';
  html += '<div><span style="color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-size:9px;display:block">Anticipato</span><strong style="font-family:var(--font-mono);color:#26215C">' + fmtE(f.importo_anticipato_calcolato) + '</strong></div>';
  if (f.scadenza_banca) html += '<div><span style="color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-size:9px;display:block">Scad. banca</span><strong>' + fmtD(f.scadenza_banca) + '</strong></div>';
  if (f.scadenza_cliente) html += '<div><span style="color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-size:9px;display:block">Scad. cliente</span><strong>' + fmtD(f.scadenza_cliente) + '</strong></div>';
  html += '</div>';

  // Form
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Data incasso *</label>';
  html += '<input id="ant-inc-data" type="date" value="' + oggiISO + '" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px"></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Importo estinto (€) *</label>';
  html += '<input id="ant-inc-importo" type="number" step="0.01" min="0" value="' + defaultImporto.toFixed(2) + '" style="width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;font-family:var(--font-mono);font-weight:600"></div>';
  html += '</div>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:6px">Default = importo anticipato. Modifica solo se la banca ha trattenuto un valore diverso.</div>';

  // Opzione insoluta
  html += '<div style="margin-top:14px;padding:10px 14px;background:#FCEBEB;border-left:4px solid #E24B4A;border-radius:6px">';
  html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:12px">';
  html += '<input type="checkbox" id="ant-inc-insoluta"> ';
  html += '<span><strong style="color:#791F1F">Cliente non ha pagato (insoluta)</strong> — segna la fattura come "insoluta". Il modulo resta aperto.</span>';
  html += '</label>';
  html += '</div>';

  // Pulsanti
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">';
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_antSalvaIncasso(\'' + fatturaAntId + '\')" class="btn-primary" style="font-size:12px;padding:8px 14px;background:#27500A">✓ Conferma</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

// ═══════════════════════════════════════════════════════════════════════════
// ESTINZIONE ANTICIPO — funzione UNICA (27/07)
// Quando il cliente paga una fattura anticipata, la banca si riprende la sua
// parte: il fido anticipi si libera e il conto scende. Sono due effetti e
// vanno scritti insieme, sempre dallo stesso punto — la chiamano sia il
// modale Incasso degli anticipi sia l'estratto conto clienti.
// La riga: aggiorna anticipi_sbf_fatture (importo_estinto, stato, data) e,
// se conosce la banca, crea il movimento di USCITA dal conto.
// ═══════════════════════════════════════════════════════════════════════════
async function antEstinguiAnticipo(fatturaAntId, opt) {
  opt = opt || {};
  var res = await sb.from('anticipi_sbf_fatture').select('*').eq('id', fatturaAntId).single();
  if (res.error || !res.data) throw (res.error || new Error('riga anticipo non trovata'));
  var riga = res.data;

  // banca: se non la passa il chiamante, la ricavo dalla presentazione
  var bancaId = opt.bancaId || null;
  if (!bancaId) {
    try {
      var rp = await sb.from('anticipi_sbf_presentazioni').select('affidamento_id').eq('id', riga.presentazione_id).single();
      if (rp.data && rp.data.affidamento_id) {
        var ra = await sb.from('banche_affidamenti').select('istituto_id').eq('id', rp.data.affidamento_id).single();
        if (ra.data) bancaId = ra.data.istituto_id || null;
      }
    } catch (e) { /* senza banca il movimento non si scrive, l'estinzione si */ }
  }

  var residuo = Math.max(0, Number(riga.importo_anticipato || 0) - Number(riga.importo_estinto || 0));
  var quota = Number(opt.importo != null ? opt.importo : residuo);
  if (!(quota > 0)) return { estinto: 0 };
  if (quota > residuo) quota = residuo;

  var nuovoEstinto = Number(riga.importo_estinto || 0) + quota;
  var chiusa = nuovoEstinto >= Number(riga.importo_anticipato || 0) - 0.005;

  var up = await sb.from('anticipi_sbf_fatture').update({
    importo_estinto: Math.round(nuovoEstinto * 100) / 100,
    stato: chiusa ? 'estinta' : (riga.stato || 'anticipata'),
    data_incasso: opt.data || new Date().toISOString().split('T')[0],
    modificato_at: new Date().toISOString()
  }).eq('id', fatturaAntId);
  if (up.error) throw up.error;

  // Uscita dal conto: la banca si riprende l'anticipo. Non-critica: se fallisce
  // l'estinzione resta valida e l'errore va a log.
  if (bancaId) {
    try {
      var mov = await sb.from('foglio_giornale_movimenti').insert([{
        data: opt.data || new Date().toISOString().split('T')[0],
        tipo: 'uscita',
        importo: Math.round(quota * 100) / 100,
        descrizione: 'Rientro anticipo · fattura ' + (riga.numero_fattura || '') + (riga.cliente_nome ? ' · ' + riga.cliente_nome : ''),
        banca_id: bancaId,
        cassa_tipo: null,
        metodo: 'bonifico',
        origine: 'anticipi',
        note: opt.note || null
      }]).select('id').single();
      if (mov.error) throw mov.error;
    } catch (e) {
      console.warn('[ant] movimento rientro anticipo non creato:', (e && e.message) || e);
    }
  }

  if (typeof _auditLog === 'function') _auditLog('estinzione_anticipo', 'anticipi_sbf_fatture', 'fattura ' + (riga.numero_fattura || fatturaAntId) + ' · rientro ' + quota.toFixed(2));
  return { estinto: quota, chiusa: chiusa, riga: riga };
}

async function _antSalvaIncasso(fatturaAntId) {
  if (!_antPuoIncasso()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  var insoluta = document.getElementById('ant-inc-insoluta').checked;
  var data = document.getElementById('ant-inc-data').value;
  var importoRaw = document.getElementById('ant-inc-importo').value;

  if (!data) { toast('Indica la data'); return; }

  var payload = {
    modificato_at: new Date().toISOString()
  };
  if (insoluta) {
    payload.stato = 'insoluta';
    payload.data_incasso = null;
    payload.importo_estinto = 0;
  } else {
    var importo = Number(importoRaw);
    if (!isFinite(importo) || importo <= 0) { toast('Importo non valido'); return; }
    payload.stato = 'estinta';
    payload.data_incasso = data;
    payload.importo_estinto = importo;
  }

  if (insoluta) {
    var resU = await sb.from('anticipi_sbf_fatture').update(payload).eq('id', fatturaAntId);
    if (resU.error) { toast('❌ Errore: ' + resU.error.message); return; }
  } else {
    // stessa funzione usata dall'estratto conto clienti: aggiorna la riga E
    // scrive l'uscita dal conto (rientro dell'anticipo alla banca)
    try {
      await antEstinguiAnticipo(fatturaAntId, {
        importo: Number(importoRaw),
        data: data,
        bancaId: null   // la ricava da se dalla presentazione
      });
    } catch (e) { toast('❌ Errore: ' + ((e && e.message) || e)); return; }
  }

  chiudiModal();
  toast(insoluta ? '⚠ Fattura segnata come insoluta' : '✓ Fattura estinta');
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}


// ═══════════════════════════════════════════════════════════════════════════
// MODALE MODIFICA MODULO — solo metadati (data, protocollo, note)
// ═══════════════════════════════════════════════════════════════════════════
// NON si modifica importo_richiesto né importo_anticipato_totale (sono
// gestiti dal trigger DB sugli accrediti). NON si cambia affidamento_id
// (per cambiare banca rifare il modulo). Pulsante distruttivo per moduli
// con stato in_delibera: "Annulla modulo" → cancella presentazione (cascade
// cancella fatture, che tornano disponibili).
async function _antRenderModaleModulo(presentazioneId) {
  if (!_antPuoModificare()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  if (!presentazioneId) return;

  apriModal('<div style="padding:24px;text-align:center;color:var(--text-muted)">⏳ Caricamento...</div>');

  var resP = await sb.from('anticipi_sbf_presentazioni').select('*').eq('id', presentazioneId).single();
  if (resP.error || !resP.data) { toast('Modulo non trovato'); chiudiModal(); return; }
  var p = resP.data;

  var aff = (_bancheAffidamenti || []).find(function(a) { return a.id === p.affidamento_id; }) || {};
  var ist = (_bancheIstituti || []).find(function(i) { return i.id === aff.istituto_id; }) || {};
  var bancaLabel = ist.nome || '—';

  var html = '<div style="max-width:520px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:6px">✏️ Modifica modulo</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">🏛 ' + esc(bancaLabel) + ' · stato attuale: <strong>' + esc(p.stato) + '</strong></div>';

  html += '<div style="display:grid;gap:10px">';

  html += '<div style="display:grid;grid-template-columns:1fr 1.5fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Data presentazione</label>';
  html += '<input id="mod-mod-data" type="date" value="' + esc(p.data_presentazione || '') + '" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px"></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">N. protocollo</label>';
  html += '<input id="mod-mod-prot" type="text" value="' + esc(p.numero_protocollo || '') + '" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font-mono)"></div>';
  html += '</div>';

  // Stato (cambio manuale solo per casi particolari, es. "rifiutata")
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Stato</label>';
  html += '<select id="mod-mod-stato" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px">';
  ['in_delibera','anticipata_parziale','anticipata','rifiutata','estinta'].forEach(function(s) {
    var lab = { in_delibera:'In delibera', anticipata_parziale:'Anticipata parziale', anticipata:'Anticipata', rifiutata:'Rifiutata', estinta:'Estinta' }[s];
    html += '<option value="' + s + '"' + (p.stato === s ? ' selected' : '') + '>' + lab + '</option>';
  });
  html += '</select>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">⚠ Lo stato è gestito automaticamente dagli accrediti. Modifica solo per casi eccezionali (rifiuto banca, chiusura forzata).</div></div>';

  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Note</label>';
  html += '<textarea id="mod-mod-note" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;min-height:60px;resize:vertical">' + esc(p.note || '') + '</textarea></div>';

  html += '</div>';

  // Pulsanti
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  // Pulsante Annulla modulo: solo se in_delibera (no accrediti registrati)
  if (p.stato === 'in_delibera') {
    html += '<button onclick="_antEliminaModulo(\'' + presentazioneId + '\')" style="background:#A32D2D;color:white;border:0;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;margin-right:auto">🗑 Annulla modulo</button>';
  }
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_antSalvaModulo(\'' + presentazioneId + '\')" class="btn-primary" style="font-size:12px;padding:8px 14px">💾 Salva</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

async function _antSalvaModulo(presentazioneId) {
  if (!_antPuoModificare()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  var dataPres = document.getElementById('mod-mod-data').value;
  var prot = (document.getElementById('mod-mod-prot').value || '').trim() || null;
  var stato = document.getElementById('mod-mod-stato').value;
  var note = (document.getElementById('mod-mod-note').value || '').trim() || null;

  if (!dataPres) { toast('Data obbligatoria'); return; }

  var resU = await sb.from('anticipi_sbf_presentazioni').update({
    data_presentazione: dataPres,
    numero_protocollo: prot,
    stato: stato,
    note: note,
    modificato_at: new Date().toISOString()
  }).eq('id', presentazioneId);

  if (resU.error) { toast('❌ Errore: ' + resU.error.message); return; }
  chiudiModal();
  toast('✓ Modulo aggiornato');
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}

async function _antEliminaModulo(presentazioneId) {
  if (!_antPuoModificare()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  if (!confirm('Annullare definitivamente questo modulo?\n\nTutte le fatture associate torneranno disponibili per altri moduli. Operazione irreversibile.')) return;
  // ON DELETE CASCADE su anticipi_sbf_fatture e _accrediti li rimuove insieme
  var resD = await sb.from('anticipi_sbf_presentazioni').delete().eq('id', presentazioneId);
  if (resD.error) { toast('❌ Errore: ' + resD.error.message); return; }
  chiudiModal();
  toast('✓ Modulo annullato');
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}


// ═══════════════════════════════════════════════════════════════════════════
// MODALE MODIFICA FATTURA (riga del modulo)
// ═══════════════════════════════════════════════════════════════════════════
// Modificabili: scadenza_banca (deciso da operatore), stato (es. esclusa).
// Se stato='esclusa', la fattura non conta più nei totali (se importo_estinto
// era stato registrato, viene azzerato). Una fattura esclusa torna disponibile
// per essere presentata su un altro modulo.
async function _antRenderModaleFattura(fatturaAntId) {
  if (!_antPuoModificare()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  if (!fatturaAntId) return;

  apriModal('<div style="padding:24px;text-align:center;color:var(--text-muted)">⏳ Caricamento...</div>');

  var resF = await sb.from('anticipi_sbf_fatture').select('*').eq('id', fatturaAntId).single();
  if (resF.error || !resF.data) { toast('Fattura non trovata'); chiudiModal(); return; }
  var f = resF.data;

  var html = '<div style="max-width:520px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:6px">✏️ Modifica fattura nel modulo</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">Fattura <strong style="font-family:var(--font-mono)">' + esc(f.numero_fattura || '?') + '</strong> · ' + esc(f.cliente_nome || '?') + ' · ' + fmtE(f.totale_fattura) + '</div>';

  html += '<div style="display:grid;gap:10px">';

  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Scadenza cliente</label>';
  html += '<div style="padding:8px;background:var(--bg-kpi);border-radius:6px;font-size:12px">' + (f.scadenza_cliente ? fmtD(f.scadenza_cliente) : '—') + '</div>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Da fatture_pagamenti, sola lettura</div></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Scadenza banca *</label>';
  html += '<input id="mod-fat-scad" type="date" value="' + esc(f.scadenza_banca || '') + '" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px"></div>';
  html += '</div>';

  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Stato</label>';
  html += '<select id="mod-fat-stato" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px">';
  ['presentata','anticipata','estinta','insoluta','esclusa'].forEach(function(s) {
    var lab = { presentata:'Presentata', anticipata:'Anticipata', estinta:'Estinta', insoluta:'Insoluta', esclusa:'Esclusa (riapri per altro modulo)' }[s];
    html += '<option value="' + s + '"' + (f.stato === s ? ' selected' : '') + '>' + lab + '</option>';
  });
  html += '</select>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">Stato "esclusa" = la fattura esce dal modulo e diventa di nuovo presentabile altrove.</div></div>';

  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Note</label>';
  html += '<textarea id="mod-fat-note" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;min-height:54px;resize:vertical">' + esc(f.note || '') + '</textarea></div>';

  html += '</div>';

  // Pulsanti
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_antSalvaFattura(\'' + fatturaAntId + '\')" class="btn-primary" style="font-size:12px;padding:8px 14px">💾 Salva</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

async function _antSalvaFattura(fatturaAntId) {
  if (!_antPuoModificare()) { toast('Permesso negato: chiedi all\'amministratore di abilitarti su questa funzione'); return; }
  var scad = document.getElementById('mod-fat-scad').value;
  var stato = document.getElementById('mod-fat-stato').value;
  var note = (document.getElementById('mod-fat-note').value || '').trim() || null;

  if (!scad) { toast('Scadenza banca obbligatoria'); return; }

  var payload = {
    scadenza_banca: scad,
    stato: stato,
    note: note,
    modificato_at: new Date().toISOString()
  };
  // Se diventa esclusa, azzero importo_estinto e data_incasso (escludendo
  // implicitamente la riga dai totali del modulo).
  if (stato === 'esclusa') {
    payload.importo_estinto = 0;
    payload.data_incasso = null;
  }

  var resU = await sb.from('anticipi_sbf_fatture').update(payload).eq('id', fatturaAntId);
  if (resU.error) { toast('❌ Errore: ' + resU.error.message); return; }
  chiudiModal();
  toast('✓ Fattura aggiornata');
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}


// ═══════════════════════════════════════════════════════════════════════════
// PATCH v20260502d — MODALI PROROGA / RIENTRO / INSOLUTA
// ═══════════════════════════════════════════════════════════════════════════
// Bottoni visibili nel pannello presentazione quando stato è 'anticipata' o
// 'anticipata_parziale'. I trigger SQL su anticipi_sbf_presentazioni
// generano automaticamente i movimenti nel foglio giornale per Rientro e
// Insoluta. Per la Proroga non c'è movimento (è solo cambio data scadenza).
// ═══════════════════════════════════════════════════════════════════════════


// ───────────────────────────────────────────────────────────────────────
// PROROGA — sposta avanti la data di scadenza, stato resta 'anticipata'
// ───────────────────────────────────────────────────────────────────────
async function _antApriModaleProroga(presentazioneId) {
  if (!_antPuoProroga()) { toast('Permesso negato'); return; }
  if (!presentazioneId) return;

  var resP = await sb.from('anticipi_sbf_presentazioni').select('*').eq('id', presentazioneId).single();
  if (resP.error || !resP.data) { toast('Modulo non trovato'); return; }
  var p = resP.data;

  var dataAttuale = p.scadenza_banca_default || '';
  var oggiISO = new Date().toISOString().split('T')[0];

  var html = '<div style="max-width:480px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:6px;color:#0C447C">📅 Proroga scadenza SBF</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">📋 Modulo del ' + fmtD(p.data_presentazione) + ' · importo ' + fmtE(p.importo_anticipato_totale) + '</div>';

  html += '<div style="background:var(--bg);border-radius:6px;padding:10px 14px;margin-bottom:14px;font-size:12px">';
  html += '<div style="margin-bottom:4px"><strong>Scadenza attuale:</strong> ' + (dataAttuale ? fmtD(dataAttuale) : '— non impostata —') + '</div>';
  if (p.prorogato) {
    html += '<div style="font-size:11px;color:#BA7517"><strong>⚠ Già prorogata in precedenza.</strong> Scadenza originale: ' + (p.data_rientro_originale ? fmtD(p.data_rientro_originale) : '—') + '</div>';
  }
  html += '</div>';

  html += '<div style="background:#E6F1FB;border:0.5px solid #185FA5;border-radius:6px;padding:12px;margin-bottom:14px">';
  html += '<label style="font-size:11px;color:var(--text-muted);font-weight:500;display:block;margin-bottom:4px">Nuova scadenza *</label>';
  html += '<input type="date" id="ant-proroga-data" value="' + (dataAttuale || oggiISO) + '" style="width:100%;font-size:13px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px"/>';
  html += '<label style="font-size:11px;color:var(--text-muted);font-weight:500;display:block;margin-top:10px;margin-bottom:4px">Note (opzionale)</label>';
  html += '<textarea id="ant-proroga-note" rows="2" placeholder="Es: estensione concordata con banca fino al..." style="width:100%;font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px;resize:vertical">' + (p.note_proroga ? esc(p.note_proroga) : '') + '</textarea>';
  html += '</div>';

  html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin-bottom:14px">La proroga non genera movimenti nel foglio giornale. Lo stato resta "anticipata".</div>';

  html += '<div style="display:flex;justify-content:flex-end;gap:8px">';
  html += '<button onclick="chiudiModal()" style="font-size:12px;padding:6px 14px;background:transparent;border:0.5px solid var(--border);border-radius:4px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_antConfermaProroga(\'' + presentazioneId + '\')" style="font-size:12px;padding:6px 14px;background:#0C447C;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">Conferma proroga</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}


async function _antConfermaProroga(presentazioneId) {
  var nuovaData = document.getElementById('ant-proroga-data').value;
  var note = (document.getElementById('ant-proroga-note').value || '').trim();
  if (!nuovaData) { toast('⚠ Inserisci la nuova data'); return; }

  // Carico stato corrente per salvare data_rientro_originale solo la prima volta
  var resP = await sb.from('anticipi_sbf_presentazioni').select('scadenza_banca_default,prorogato,data_rientro_originale').eq('id', presentazioneId).single();
  if (resP.error) { toast('Errore: ' + resP.error.message); return; }
  var p = resP.data;

  var payload = {
    scadenza_banca_default: nuovaData,
    prorogato: true,
    note_proroga: note || null,
    modificato_at: new Date().toISOString()
  };
  // Salvo la data originale solo la prima volta (per tracciabilità)
  if (!p.prorogato && !p.data_rientro_originale && p.scadenza_banca_default) {
    payload.data_rientro_originale = p.scadenza_banca_default;
  }

  var resU = await sb.from('anticipi_sbf_presentazioni').update(payload).eq('id', presentazioneId);
  if (resU.error) { toast('Errore: ' + resU.error.message); return; }

  if (typeof _auditLog === 'function') {
    _auditLog('anticipi', 'anticipi_sbf_presentazioni', 'Proroga modulo ' + presentazioneId.substring(0,8) + ' a ' + fmtD(nuovaData));
  }

  chiudiModal();
  toast('✓ Scadenza prorogata al ' + fmtD(nuovaData));
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}


// ───────────────────────────────────────────────────────────────────────
// MARCA RIENTRO — cliente ha pagato, banca chiude SBF, stato 'estinta'
// Trigger SQL crea automaticamente uscita nel foglio giornale.
// ───────────────────────────────────────────────────────────────────────
async function _antApriModaleRientro(presentazioneId) {
  if (!_antPuoChiudere()) { toast('Permesso negato'); return; }
  if (!presentazioneId) return;

  var resP = await sb.from('anticipi_sbf_presentazioni').select('*').eq('id', presentazioneId).single();
  if (resP.error || !resP.data) { toast('Modulo non trovato'); return; }
  var p = resP.data;

  // Patch v20260502e: calcolo importo da SUM(fatture) invece di p.importo_anticipato_totale
  // (il campo aggregato può non essere sincronizzato).
  var resF = await sb.from('anticipi_sbf_fatture').select('importo_anticipato_calcolato,importo_estinto,stato').eq('presentazione_id', presentazioneId);
  var fatture = resF.data || [];
  var sumAnticipato = 0, sumEstinto = 0;
  fatture.forEach(function(f) {
    if (f.stato === 'esclusa') return;
    sumAnticipato += Number(f.importo_anticipato_calcolato || 0);
    sumEstinto += Number(f.importo_estinto || 0);
  });
  var importo = Math.max(0, sumAnticipato - sumEstinto);
  // Fallback al campo aggregato se le fatture non hanno importi (caso anomalo)
  if (importo <= 0 && Number(p.importo_anticipato_totale || 0) > 0) {
    importo = Number(p.importo_anticipato_totale);
  }

  var oggiISO = new Date().toISOString().split('T')[0];

  var aff = (_bancheAffidamenti || []).find(function(a) { return a.id === p.affidamento_id; }) || {};
  var ist = (_bancheIstituti || []).find(function(i) { return i.id === aff.istituto_id; }) || {};
  var bancaLabel = ist.nome || '—';

  var html = '<div style="max-width:480px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:6px;color:#27500A">✓ Marca rientro SBF</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">📋 Modulo del ' + fmtD(p.data_presentazione) + ' · 🏛 ' + esc(bancaLabel) + '</div>';

  html += '<div style="background:#EAF3DE;border:0.5px solid #97C459;border-radius:6px;padding:12px 14px;margin-bottom:14px">';
  html += '<div style="font-size:13px;color:#173404;margin-bottom:6px"><strong>Importo che la banca tratterrà:</strong> ' + fmtE(importo) + '</div>';
  if (importo <= 0) {
    html += '<div style="font-size:11px;color:#A32D2D;margin-top:4px">⚠ Importo zero — controlla che le fatture associate abbiano importi anticipati validi.</div>';
  } else {
    html += '<div style="font-size:11px;color:#27500A">Il trigger genererà automaticamente un\'uscita di pari importo nel foglio giornale (conto: ' + esc(bancaLabel) + ').</div>';
  }
  html += '</div>';

  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500;display:block;margin-bottom:4px">Data rientro effettivo *</label>';
  html += '<input type="date" id="ant-rientro-data" value="' + oggiISO + '" style="width:100%;font-size:13px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px"/></div>';

  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500;display:block;margin-bottom:4px;margin-top:10px">Importo (override opzionale)</label>';
  html += '<input type="number" step="0.01" id="ant-rientro-importo" value="' + importo.toFixed(2) + '" style="width:100%;font-size:13px;font-family:var(--font-mono);padding:6px 10px;border:0.5px solid var(--border);border-radius:4px"/>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-style:italic">Modifica solo se la banca ha trattenuto un importo diverso (commissioni, errori, ecc.)</div></div>';

  html += '<div style="font-size:11px;color:var(--text-muted);font-style:italic;margin:14px 0">Lo stato passerà da "anticipata" a "estinta". Le fatture cliente collegate vengono considerate saldate via SBF.</div>';

  html += '<div style="display:flex;justify-content:flex-end;gap:8px">';
  html += '<button onclick="chiudiModal()" style="font-size:12px;padding:6px 14px;background:transparent;border:0.5px solid var(--border);border-radius:4px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_antConfermaRientro(\'' + presentazioneId + '\')" style="font-size:12px;padding:6px 14px;background:#27500A;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">Conferma rientro</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}


async function _antConfermaRientro(presentazioneId) {
  var data = document.getElementById('ant-rientro-data').value;
  var importoOverride = parseFloat(document.getElementById('ant-rientro-importo').value) || 0;
  if (!data) { toast('⚠ Inserisci la data rientro'); return; }
  if (importoOverride <= 0) { toast('⚠ L\'importo deve essere maggiore di zero'); return; }

  // Sincronizzo importo_anticipato_totale prima del cambio stato.
  // Il trigger SQL legge questo campo per generare il movimento foglio giornale.
  var payload = {
    stato: 'estinta',
    data_estinta: data,
    importo_anticipato_totale: importoOverride,
    modificato_at: new Date().toISOString()
  };

  var resU = await sb.from('anticipi_sbf_presentazioni').update(payload).eq('id', presentazioneId);
  if (resU.error) { toast('Errore: ' + resU.error.message); return; }

  if (typeof _auditLog === 'function') {
    _auditLog('anticipi', 'anticipi_sbf_presentazioni', 'Rientro SBF modulo ' + presentazioneId.substring(0,8) + ' al ' + fmtD(data) + ' (' + fmtE(importoOverride) + ')');
  }

  chiudiModal();
  toast('✓ Modulo rientrato il ' + fmtD(data) + ' (uscita ' + fmtE(importoOverride) + ' registrata in foglio giornale)');
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}


// ───────────────────────────────────────────────────────────────────────
// MARCA INSOLUTA — cliente non ha pagato, banca riprende soldi
// Trigger SQL crea automaticamente uscita nel foglio giornale.
// La fattura cliente torna "viva" come non anticipata.
// ───────────────────────────────────────────────────────────────────────
async function _antApriModaleInsoluta(presentazioneId) {
  if (!_antPuoChiudere()) { toast('Permesso negato'); return; }
  if (!presentazioneId) return;

  var resP = await sb.from('anticipi_sbf_presentazioni').select('*').eq('id', presentazioneId).single();
  if (resP.error || !resP.data) { toast('Modulo non trovato'); return; }
  var p = resP.data;

  // Patch v20260502e: calcolo importo da SUM(fatture)
  var resF = await sb.from('anticipi_sbf_fatture').select('importo_anticipato_calcolato,importo_estinto,stato').eq('presentazione_id', presentazioneId);
  var fatture = resF.data || [];
  var sumAnticipato = 0, sumEstinto = 0;
  fatture.forEach(function(f) {
    if (f.stato === 'esclusa') return;
    sumAnticipato += Number(f.importo_anticipato_calcolato || 0);
    sumEstinto += Number(f.importo_estinto || 0);
  });
  var importo = Math.max(0, sumAnticipato - sumEstinto);
  if (importo <= 0 && Number(p.importo_anticipato_totale || 0) > 0) {
    importo = Number(p.importo_anticipato_totale);
  }

  var oggiISO = new Date().toISOString().split('T')[0];

  var aff = (_bancheAffidamenti || []).find(function(a) { return a.id === p.affidamento_id; }) || {};
  var ist = (_bancheIstituti || []).find(function(i) { return i.id === aff.istituto_id; }) || {};
  var bancaLabel = ist.nome || '—';

  var html = '<div style="max-width:520px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:6px;color:#A32D2D">❌ Marca insoluta SBF</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px">📋 Modulo del ' + fmtD(p.data_presentazione) + ' · 🏛 ' + esc(bancaLabel) + '</div>';

  html += '<div style="background:#FCEBEB;border:0.5px solid #A32D2D;border-radius:6px;padding:12px 14px;margin-bottom:14px">';
  html += '<div style="font-size:13px;color:#501313;margin-bottom:8px"><strong>⚠ Conferma operazione critica</strong></div>';
  html += '<div style="font-size:12px;color:#501313;line-height:1.5">';
  html += 'Stai marcando come INSOLUTA la presentazione: il cliente non ha pagato la banca, che si riprende l\'importo dal tuo conto.';
  html += '<br/><br/><strong>Conseguenze:</strong>';
  html += '<ul style="margin:6px 0 0 18px;padding:0">';
  html += '<li>Uscita automatica di <strong>' + fmtE(importo) + '</strong> nel foglio giornale (conto ' + esc(bancaLabel) + ')</li>';
  html += '<li>Le fatture cliente collegate restano "aperte" e vanno gestite come se non fossero mai state anticipate</li>';
  html += '<li>Nessun rientro futuro verso banca da fare</li>';
  html += '</ul>';
  if (importo <= 0) {
    html += '<div style="margin-top:10px;color:#A32D2D"><strong>⚠ Importo zero rilevato</strong> — controlla le fatture associate o usa il campo override sotto.</div>';
  }
  html += '</div></div>';

  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500;display:block;margin-bottom:4px">Data insoluto *</label>';
  html += '<input type="date" id="ant-insoluta-data" value="' + oggiISO + '" style="width:100%;font-size:13px;padding:6px 10px;border:0.5px solid var(--border);border-radius:4px"/></div>';

  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500;display:block;margin-bottom:4px;margin-top:10px">Importo (override opzionale)</label>';
  html += '<input type="number" step="0.01" id="ant-insoluta-importo" value="' + importo.toFixed(2) + '" style="width:100%;font-size:13px;font-family:var(--font-mono);padding:6px 10px;border:0.5px solid var(--border);border-radius:4px"/>';
  html += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px;font-style:italic">Modifica solo se la banca ha prelevato un importo diverso.</div></div>';

  html += '<div style="display:flex;justify-content:flex-end;gap:8px;margin-top:14px">';
  html += '<button onclick="chiudiModal()" style="font-size:12px;padding:6px 14px;background:transparent;border:0.5px solid var(--border);border-radius:4px;cursor:pointer">Annulla</button>';
  html += '<button onclick="_antConfermaInsoluta(\'' + presentazioneId + '\')" style="font-size:12px;padding:6px 14px;background:#A32D2D;color:white;border:none;border-radius:4px;cursor:pointer;font-weight:500">Conferma insoluta</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}


async function _antConfermaInsoluta(presentazioneId) {
  var data = document.getElementById('ant-insoluta-data').value;
  var importoOverride = parseFloat(document.getElementById('ant-insoluta-importo').value) || 0;
  if (!data) { toast('⚠ Inserisci la data insoluto'); return; }
  if (importoOverride <= 0) { toast('⚠ L\'importo deve essere maggiore di zero'); return; }
  if (!confirm('Sei sicuro di marcare questa presentazione come INSOLUTA?\n\nL\'operazione registrerà un\'uscita di ' + fmtE(importoOverride) + ' nel foglio giornale e non è facilmente reversibile.')) return;

  var payload = {
    stato: 'insoluta',
    data_insoluto: data,
    importo_anticipato_totale: importoOverride,
    modificato_at: new Date().toISOString()
  };

  var resU = await sb.from('anticipi_sbf_presentazioni').update(payload).eq('id', presentazioneId);
  if (resU.error) { toast('Errore: ' + resU.error.message); return; }

  if (typeof _auditLog === 'function') {
    _auditLog('anticipi', 'anticipi_sbf_presentazioni', 'INSOLUTA modulo ' + presentazioneId.substring(0,8) + ' al ' + fmtD(data) + ' (' + fmtE(importoOverride) + ')');
  }

  chiudiModal();
  toast('❌ Modulo marcato insoluto il ' + fmtD(data) + ' (uscita ' + fmtE(importoOverride) + ' registrata in foglio giornale)');
  if (typeof renderBancheAnticipi === 'function') await renderBancheAnticipi();
}
