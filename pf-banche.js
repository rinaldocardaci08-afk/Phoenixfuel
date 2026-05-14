// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Sezione Banche & Mutui
// Versione 05/05/2026 (v20260505a)
//
// Patch 05/05 (a) — allineamento permessi alla Costituzione B.4:
//   - _applicaPermessiTabBanche ora gating della tab "Storico Anticipi"
//     (banche-panel-anticipi-storico). Bug pre-esistente: la tab era sempre
//     visibile a chi vedeva la sezione Banche, anche senza permesso 'anticipi'.
//   - Storico nascosto se manca 'anticipi' (parent) OPPURE se
//     'anticipi.storico' è esplicitamente=false (sub-permesso permissivo
//     di default → backward-compatible per utenti già configurati).
//   - Fallback su tab Istituti se la tab attiva era quella appena nascosta.
//   - Coordinato con pf-anticipi.js v20260505a che attiva il sub-permesso
//     'anticipi.storico' nelle helper _antPuoVedereStorico.
//
// Patch 30/04 (d) — fix override "incollato":
//   - Se inserisci saldo_disponibile = 0 (azzeramento) NON viene più trattato
//     come override permanente. Override resta false così al prossimo cambio
//     di saldo contabile o assegni il disponibile torna a ricalcolarsi.
//
// Patch 30/04 (c) — fix saldo disponibile non aggiornato:
//   - Bug: record creati prima della patch (b) avevano saldo_disponibile=0
//     come placeholder. La logica visualizzava 0 invece del calcolato.
//   - Fix: il render ora usa SEMPRE il calcolato se saldo_disponibile_override
//     è false (anche quando in DB c'è già un valore). Solo override=true
//     mostra il valore in DB. I totali usano il valore effettivo.
//   - Hotfix SQL retroattivo separato: hotfix_ricalcolo_saldi_disponibile.sql
//
// Patch 30/04 (b) — Situazione saldi conti correnti:
//   - Nuova colonna "📋 Assegni n.v." tra Fido cassa e Saldo contabile.
//     Editabile per banca, default 0.
//   - Saldo disponibile diventa CALCOLATO automaticamente come
//     (saldo contabile + fido cassa - assegni n.v.). Editabile a mano:
//     se scarto > 1€ vs calcolato, popup conferma override (flag DB).
//   - Pulsante "💾 Conferma giornata e archivia": passa stato confermato=true.
//     Avviso se modifichi giornata già confermata (non blocca).
//   - Banner sentinella in cima: scorre ultimi 10 giorni, segnala buchi
//     (giornate non confermate).
//   - Pannello storico saldi: filtri data range + selezione mese/anno + PDF.
//
// Patch 29/04 (a):
//   - Tabella Affidamenti: aggiunta riga "Saldo: X €" sotto Utilizzato per
//     ogni fido, così a colpo d'occhio si vede accordato → utilizzato → saldo.
//
// Patch 29/04 (b):
//   - Rimosso console.log diagnostico in renderSituazioneSaldi (rumore in
//     console di produzione + GC overhead su oggetti grossi).
//
// Tab implementati: Istituti (anagrafica banche + conti correnti)
// Tab in costruzione: Affidamenti, Finanziamenti, Anticipi, Piano, Timeline
// ═══════════════════════════════════════════════════════════════════════════

// ═══ STATE ════════════════════════════════════════════════════════════════
var _bancheIstituti = [];
var _bancheConti = [];
var _bancheAffidamenti = []; // pre-caricati per KPI
var _bancheFinanziamenti = []; // pre-caricati per KPI

// ─── CACHE: ultimi saldi per conto (popolata on-demand, condivisa tra tab) ──
// Usata da Istituti, Affidamenti, stampaElencoAffidamenti, Situazione.
// Riduce query duplicate alla tabella banche_saldi_giornalieri.
// Invalidata da _situazioneSalvaCella dopo INSERT/UPDATE.
var _ultimiSaldiPerConto = null; // null = non caricato; {} = caricato (anche se vuoto)

async function _ensureUltimiSaldi() {
  if (_ultimiSaldiPerConto !== null) return _ultimiSaldiPerConto;
  _ultimiSaldiPerConto = {};
  try {
    // Limito a 90 giorni indietro per ridurre payload
    const dataLim = new Date();
    dataLim.setDate(dataLim.getDate() - 90);
    const dataLimStr = dataLim.toISOString().split('T')[0];
    const { data, error } = await sb.from('banche_saldi_giornalieri')
      .select('conto_id, saldo_contabile, saldo_disponibile, data')
      .gte('data', dataLimStr)
      .order('data', { ascending: false });
    if (error) {
      console.warn('_ensureUltimiSaldi error:', error);
      return _ultimiSaldiPerConto;
    }
    (data || []).forEach(s => {
      // .order desc → primo record per conto_id è il più recente
      if (!_ultimiSaldiPerConto[s.conto_id]) _ultimiSaldiPerConto[s.conto_id] = s;
    });
  } catch (e) {
    console.warn('_ensureUltimiSaldi exception:', e);
  }
  return _ultimiSaldiPerConto;
}

function _invalidaUltimiSaldi() {
  _ultimiSaldiPerConto = null;
}

// ═══ ENTRY POINT ══════════════════════════════════════════════════════════
async function caricaBanche() {
  // Carica tutti i dati in parallelo per popolare KPI + tabelle
  const [istRes, ccRes, affRes, finRes] = await Promise.all([
    sb.from('banche_istituti').select('*').order('nome'),
    sb.from('banche_conti').select('*'),
    sb.from('banche_affidamenti').select('*'),
    sb.from('banche_finanziamenti').select('*')
  ]);
  _bancheIstituti = istRes.data || [];
  _bancheConti = ccRes.data || [];
  _bancheAffidamenti = affRes.data || [];
  _bancheFinanziamenti = finRes.data || [];

  renderBancheIstituti();
  // Gating sub-tab in base ai permessi (regola costituzionale 28/04)
  _applicaPermessiTabBanche();
}

// ═══ GATING TAB INTERNE BANCHE (regola costituzionale B.4) ════════════════
// Sezione 'banche' = lettura libera del modulo (lo controlla costruisciMenu).
// Sezione 'anticipi' = lettura tab "Anticipo Fatture": serve permesso esplicito.
// Sub-permesso 'anticipi.storico' = lettura tab "Storico Anticipi": permissivo
//   per default (chi ha 'anticipi' lo eredita), bloccabile esplicitamente.
// Tutti i write nel modulo sono comunque riservati a ruolo 'admin' (decisione
// utente 28/04). Helpers usati: utenteCorrente + _haPermesso (pf-admin.js).
function _applicaPermessiTabBanche() {
  if (typeof utenteCorrente === 'undefined' || !utenteCorrente) return;
  if (utenteCorrente.ruolo === 'admin') return; // admin vede tutto
  // Tab Anticipi: serve permesso 'anticipi' esplicito
  var puoAnticipi = (typeof _haPermesso === 'function') && _haPermesso('anticipi');
  // Tab Storico Anticipi: parent 'anticipi' + sub 'anticipi.storico' (permissivo)
  var puoAnticipiStorico = puoAnticipi
    && (typeof _haPermesso === 'function')
    && _haPermesso('anticipi.storico');
  if (!puoAnticipi) {
    var btnAnt = document.querySelector('.banche-tab[data-tab="banche-panel-anticipi"]');
    if (btnAnt) btnAnt.style.display = 'none';
    var panAnt = document.getElementById('banche-panel-anticipi');
    if (panAnt) panAnt.style.display = 'none';
    // Se la tab attiva era Anticipi, fallback su Istituti
    var attiva = document.querySelector('.banche-tab.active');
    if (attiva && attiva.dataset.tab === 'banche-panel-anticipi') {
      var fallback = document.querySelector('.banche-tab[data-tab="banche-panel-istituti"]');
      if (fallback) fallback.click();
    }
  }
  // Patch v20260505a: gating tab Storico Anticipi (bug: era sempre visibile)
  if (!puoAnticipiStorico) {
    var btnSto = document.querySelector('.banche-tab[data-tab="banche-panel-anticipi-storico"]');
    if (btnSto) btnSto.style.display = 'none';
    var panSto = document.getElementById('banche-panel-anticipi-storico');
    if (panSto) panSto.style.display = 'none';
    var attivaSto = document.querySelector('.banche-tab.active');
    if (attivaSto && attivaSto.dataset.tab === 'banche-panel-anticipi-storico') {
      var fallbackSto = document.querySelector('.banche-tab[data-tab="banche-panel-istituti"]');
      if (fallbackSto) fallbackSto.click();
    }
  }
}

// ═══ TAB SWITCHING ════════════════════════════════════════════════════════
function switchBancheTab(btn) {
  // Stile tab attivi/inattivi
  document.querySelectorAll('.banche-tab').forEach(b => {
    b.classList.remove('active');
    b.style.background = 'var(--bg)';
    b.style.color = 'var(--text)';
    b.style.border = '0.5px solid var(--border)';
  });
  btn.classList.add('active');
  btn.style.background = '';
  btn.style.color = '';
  btn.style.border = '';

  // Mostra/nascondi pannelli
  const tabId = btn.dataset.tab;
  document.querySelectorAll('.banche-panel').forEach(p => p.style.display = 'none');
  const panel = document.getElementById(tabId);
  if (panel) panel.style.display = 'block';

  // Carica contenuto specifico al primo accesso
  if (tabId === 'banche-panel-finanziamenti') renderBancheFinanziamenti();
  if (tabId === 'banche-panel-affidamenti') renderBancheAffidamenti();
  if (tabId === 'banche-panel-situazione') renderBancheSituazione();
  if (tabId === 'banche-panel-anticipi') renderBancheAnticipi();
  if (tabId === 'banche-panel-anticipi-storico') {
    if (typeof renderAntStorico === 'function') renderAntStorico();
  }
  if (tabId === 'banche-panel-piano') renderBanchePianoAnnuale();
  if (tabId === 'banche-panel-timeline') renderBancheTimeline();
}

// ═══ TAB ISTITUTI ═════════════════════════════════════════════════════════
async function renderBancheIstituti() {
  const cont = document.getElementById('content-banche-istituti');
  if (!cont) return;

  // Cache condivisa: ultimi saldi giornalieri per conto (caricato una sola volta)
  const saldiByConto = await _ensureUltimiSaldi();

  // Helper per ottenere il saldo live (contabile) di un conto, con fallback a saldo_attuale
  function _saldoLive(cc) {
    const live = saldiByConto[cc.id];
    if (live && live.saldo_contabile !== null && live.saldo_contabile !== undefined) {
      return { contabile: Number(live.saldo_contabile), disponibile: live.saldo_disponibile !== null ? Number(live.saldo_disponibile) : null, data: live.data, fonte: 'live' };
    }
    return { contabile: Number(cc.saldo_attuale || 0), disponibile: null, data: cc.saldo_aggiornato, fonte: 'manuale' };
  }

  // KPI calcolati
  const nBanche = _bancheIstituti.filter(i => i.attivo).length;
  const nConti = _bancheConti.filter(c => c.attivo).length;
  const saldoTotale = _bancheConti
    .filter(c => c.attivo)
    .reduce((s, c) => s + _saldoLive(c).contabile, 0);
  const dispTotale = _bancheConti
    .filter(c => c.attivo)
    .reduce((s, c) => {
      const sl = _saldoLive(c);
      return s + (sl.disponibile !== null ? sl.disponibile : sl.contabile);
    }, 0);
  const nMutuiAttivi = _bancheFinanziamenti.filter(f => f.stato === 'attivo').length;

  let html = '';

  // ─── KPI ───
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px">';
  html += '<div class="kpi"><div class="kpi-label">Banche attive</div><div class="kpi-value">' + nBanche + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Conti correnti</div><div class="kpi-value">' + nConti + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Saldo contabile totale</div><div class="kpi-value" style="color:' + (saldoTotale < 0 ? '#A32D2D' : '#27500A') + '">' + fmtE(saldoTotale) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Disponibilità totale</div><div class="kpi-value" style="color:' + (dispTotale < 0 ? '#A32D2D' : '#27500A') + '">' + fmtE(dispTotale) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Finanziamenti attivi</div><div class="kpi-value">' + nMutuiAttivi + '</div></div>';
  html += '</div>';

  // ─── HEADER + BOTTONE NUOVO ISTITUTO ───
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<div style="font-size:15px;font-weight:600;color:var(--text)">Anagrafica banche</div>';
  if (_isAdminBanche()) {
    html += '<button class="btn-primary" onclick="apriModalIstituto()" style="font-size:12px;padding:7px 14px">+ Nuovo istituto</button>';
  }
  html += '</div>';

  // ─── ELENCO ISTITUTI (ordinato Intesa → MPS → BNL → BCC → altri) ───
  if (!_bancheIstituti.length) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px">Nessun istituto registrato</div>';
  } else {
    const istitutiSorted = _bancheIstituti.slice().sort((a, b) => {
      const pA = _priorityBancaIstituto(a.nome);
      const pB = _priorityBancaIstituto(b.nome);
      if (pA !== pB) return pA - pB;
      return (a.nome || '').localeCompare(b.nome || '');
    });

    istitutiSorted.forEach(ist => {
      const contiBanca = _bancheConti.filter(c => c.istituto_id === ist.id)
        .sort((a, b) => (a.numero_conto || '').localeCompare(b.numero_conto || ''));
      const fidiBanca = _bancheAffidamenti.filter(a => a.istituto_id === ist.id && a.stato === 'attivo');
      const finBanca = _bancheFinanziamenti.filter(f => f.istituto_id === ist.id && f.stato === 'attivo');

      html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;margin-bottom:10px;padding:14px;' + (ist.attivo ? '' : 'opacity:0.5') + '">';

      // Header istituto
      html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px">';
      html += '<div>';
      html += '<div style="font-size:15px;font-weight:600;color:var(--text)">' + esc(ist.nome) + (ist.attivo ? '' : ' <span style="font-size:10px;color:#A32D2D;background:#FCEBEB;padding:2px 8px;border-radius:10px;margin-left:6px">disattivato</span>') + '</div>';
      const subRows = [];
      if (ist.filiale) subRows.push('📍 ' + esc(ist.filiale));
      if (ist.referente) subRows.push('👤 ' + esc(ist.referente));
      if (ist.telefono) subRows.push('📞 ' + esc(ist.telefono));
      if (ist.email) subRows.push('✉ ' + esc(ist.email));
      if (subRows.length) html += '<div style="font-size:11px;color:var(--text-muted);margin-top:3px">' + subRows.join(' · ') + '</div>';
      html += '</div>';

      // Bottoni azione
      if (_isAdminBanche()) {
        html += '<div style="display:flex;gap:6px">';
        html += '<button onclick="apriModalIstituto(\'' + ist.id + '\')" title="Modifica istituto" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px">✏️</button>';
        html += '<button onclick="apriModalConto(null,\'' + ist.id + '\')" title="Aggiungi conto corrente" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:5px 10px;border-radius:6px;cursor:pointer;font-size:11px">+ CC</button>';
        html += '</div>';
      }
      html += '</div>';

      // Statistiche di sintesi
      html += '<div style="display:flex;gap:14px;font-size:11px;color:var(--text-muted);padding:6px 10px;background:var(--bg);border-radius:6px;margin-bottom:10px">';
      html += '<div>📒 ' + contiBanca.length + ' conto/i</div>';
      html += '<div>💰 ' + fidiBanca.length + ' affidamenti</div>';
      html += '<div>🏛 ' + finBanca.length + ' finanziamenti attivi</div>';
      html += '</div>';

      // Conti correnti della banca
      if (contiBanca.length > 0) {
        html += '<div style="margin-top:8px">';
        html += '<div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;font-weight:600;letter-spacing:0.4px;margin-bottom:6px">Conti correnti</div>';
        contiBanca.forEach(cc => {
          const ibanMasc = _mascheraIban(cc.iban);
          const sl = _saldoLive(cc);
          const colorCont = sl.contabile < 0 ? '#A32D2D' : (sl.contabile > 0 ? '#27500A' : 'var(--text)');
          const colorDisp = sl.disponibile !== null ? (sl.disponibile < 0 ? '#A32D2D' : '#27500A') : null;

          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg);border-left:3px solid #378ADD;border-radius:0 6px 6px 0;margin-bottom:4px;' + (cc.attivo ? '' : 'opacity:0.5') + '">';
          html += '<div style="flex:1">';
          html += '<div style="font-size:12px;font-weight:500">' + esc(cc.descrizione || '');
          if (cc.numero_conto) html += ' <span style="color:var(--text-hint);font-family:var(--font-mono);font-size:10px;font-weight:400">N. ' + esc(cc.numero_conto) + '</span>';
          html += '</div>';
          html += '<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + esc(ibanMasc) + '</div>';
          html += '</div>';
          // Blocco saldi (contabile grande + disponibile piccolo)
          html += '<div style="text-align:right;margin-right:10px">';
          html += '<div style="font-size:14px;font-weight:700;font-family:var(--font-mono);color:' + colorCont + '">' + fmtE(sl.contabile) + '</div>';
          if (sl.disponibile !== null) {
            html += '<div style="font-size:10px;color:' + colorDisp + ';font-family:var(--font-mono);font-weight:500;margin-top:1px">disp ' + fmtE(sl.disponibile) + '</div>';
          }
          // Footer info: data + fonte
          if (sl.fonte === 'live') {
            html += '<div style="font-size:9px;color:#27500A;font-weight:500;margin-top:2px">⬤ live ' + (sl.data ? fmtD(sl.data) : '') + '</div>';
          } else {
            html += '<div style="font-size:9px;color:var(--text-hint);margin-top:2px">' + (sl.data ? 'agg. ' + fmtD(sl.data) : 'mai aggiornato') + '</div>';
          }
          html += '</div>';
          if (_isAdminBanche()) {
            html += '<button onclick="apriModalConto(\'' + cc.id + '\')" title="Modifica" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px">✏️</button>';
          }
          html += '</div>';
        });
        html += '</div>';
      }

      html += '</div>';
    });
  }

  cont.innerHTML = html;
}

// ═══ MODALE ISTITUTO ══════════════════════════════════════════════════════
function apriModalIstituto(id) {
  const ist = id ? _bancheIstituti.find(i => i.id === id) : null;
  const titolo = ist ? '✏️ Modifica istituto' : '+ Nuovo istituto';

  let html = '<div style="max-width:540px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:14px">' + titolo + '</div>';

  html += '<div style="display:grid;gap:10px">';
  html += _campo('Nome banca *', 'mod-ist-nome', ist?.nome || '', 'text', 'Es. Intesa Sanpaolo');
  html += _campo('Filiale', 'mod-ist-filiale', ist?.filiale || '', 'text', 'Es. Vibo Valentia — C.so Umberto I');
  html += _campo('Referente', 'mod-ist-referente', ist?.referente || '', 'text', 'Es. Dott. Rossi');
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += _campo('Telefono', 'mod-ist-telefono', ist?.telefono || '', 'text');
  html += _campo('Email', 'mod-ist-email', ist?.email || '', 'email');
  html += '</div>';
  html += _campo('Note', 'mod-ist-note', ist?.note || '', 'textarea');
  html += '<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">';
  html += '<input type="checkbox" id="mod-ist-attivo" ' + (ist?.attivo !== false ? 'checked' : '') + '> Istituto attivo';
  html += '</label>';
  html += '</div>';

  // Pulsanti azione
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  if (ist && id) {
    html += '<button onclick="eliminaIstituto(\'' + id + '\')" style="background:#A32D2D;color:white;border:0;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;margin-right:auto">🗑 Elimina</button>';
  }
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  html += '<button onclick="salvaIstituto(' + (id ? "'"+id+"'" : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 14px">💾 Salva</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

async function salvaIstituto(id) {
  const nome = document.getElementById('mod-ist-nome').value.trim();
  if (!nome) { toast('⚠ Nome obbligatorio'); return; }

  const payload = {
    nome,
    filiale: document.getElementById('mod-ist-filiale').value.trim() || null,
    referente: document.getElementById('mod-ist-referente').value.trim() || null,
    telefono: document.getElementById('mod-ist-telefono').value.trim() || null,
    email: document.getElementById('mod-ist-email').value.trim() || null,
    note: document.getElementById('mod-ist-note').value.trim() || null,
    attivo: document.getElementById('mod-ist-attivo').checked,
    updated_at: new Date().toISOString()
  };

  let res;
  if (id) {
    res = await sb.from('banche_istituti').update(payload).eq('id', id);
  } else {
    res = await sb.from('banche_istituti').insert(payload);
  }

  if (res.error) { toast('❌ ' + res.error.message); return; }
  toast('✓ ' + (id ? 'Istituto aggiornato' : 'Istituto creato'));
  chiudiModal();
  await caricaBanche();
}

async function eliminaIstituto(id) {
  if (!confirm('Eliminare questo istituto?\n\nVerranno eliminati a cascata tutti i conti correnti, affidamenti e regole anticipo collegati. I finanziamenti collegati impediscono l\'eliminazione.')) return;
  const { error } = await sb.from('banche_istituti').delete().eq('id', id);
  if (error) { toast('❌ ' + error.message); return; }
  toast('✓ Istituto eliminato');
  chiudiModal();
  await caricaBanche();
}

// ═══ MODALE CONTO CORRENTE ════════════════════════════════════════════════
function apriModalConto(id, istIdDefault) {
  const cc = id ? _bancheConti.find(c => c.id === id) : null;
  const titolo = cc ? '✏️ Modifica conto corrente' : '+ Nuovo conto corrente';

  let html = '<div style="max-width:540px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:14px">' + titolo + '</div>';

  html += '<div style="display:grid;gap:10px">';
  // Dropdown istituto
  html += '<div>';
  html += '<label style="font-size:11px;color:var(--text-muted);font-weight:500">Banca *</label>';
  html += '<select id="mod-cc-istituto" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  _bancheIstituti.forEach(i => {
    const sel = ((cc?.istituto_id || istIdDefault) === i.id) ? 'selected' : '';
    html += '<option value="' + i.id + '" ' + sel + '>' + esc(i.nome) + '</option>';
  });
  html += '</select>';
  html += '</div>';

  html += _campo('Descrizione *', 'mod-cc-descrizione', cc?.descrizione || '', 'text', 'Es. Conto operativo /3770');
  html += _campo('IBAN *', 'mod-cc-iban', cc?.iban || '', 'text', 'IT00X0000000000000000003770');
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += _campo('Saldo attuale (€)', 'mod-cc-saldo', cc?.saldo_attuale ?? 0, 'number', '0');
  html += _campo('Data aggiornamento', 'mod-cc-data', cc?.saldo_aggiornato || '', 'date');
  html += '</div>';
  html += _campo('Note', 'mod-cc-note', cc?.note || '', 'textarea');
  html += '<label style="display:flex;align-items:center;gap:8px;font-size:12px;cursor:pointer">';
  html += '<input type="checkbox" id="mod-cc-attivo" ' + (cc?.attivo !== false ? 'checked' : '') + '> Conto attivo';
  html += '</label>';
  html += '</div>';

  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  if (cc && id) {
    html += '<button onclick="eliminaConto(\'' + id + '\')" style="background:#A32D2D;color:white;border:0;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;margin-right:auto">🗑 Elimina</button>';
  }
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  html += '<button onclick="salvaConto(' + (id ? "'"+id+"'" : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 14px">💾 Salva</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

async function salvaConto(id) {
  const descrizione = document.getElementById('mod-cc-descrizione').value.trim();
  const iban = document.getElementById('mod-cc-iban').value.trim();
  if (!descrizione) { toast('⚠ Descrizione obbligatoria'); return; }
  if (!iban) { toast('⚠ IBAN obbligatorio'); return; }

  const payload = {
    istituto_id: document.getElementById('mod-cc-istituto').value,
    descrizione,
    iban,
    saldo_attuale: Number(document.getElementById('mod-cc-saldo').value) || 0,
    saldo_aggiornato: document.getElementById('mod-cc-data').value || null,
    note: document.getElementById('mod-cc-note').value.trim() || null,
    attivo: document.getElementById('mod-cc-attivo').checked,
    updated_at: new Date().toISOString()
  };

  let res;
  if (id) {
    res = await sb.from('banche_conti').update(payload).eq('id', id);
  } else {
    res = await sb.from('banche_conti').insert(payload);
  }

  if (res.error) { toast('❌ ' + res.error.message); return; }
  toast('✓ ' + (id ? 'Conto aggiornato' : 'Conto creato'));
  chiudiModal();
  await caricaBanche();
}

async function eliminaConto(id) {
  if (!confirm('Eliminare questo conto corrente?\n\nGli affidamenti collegati al conto resteranno (con conto_id=NULL).')) return;
  const { error } = await sb.from('banche_conti').delete().eq('id', id);
  if (error) { toast('❌ ' + error.message); return; }
  toast('✓ Conto eliminato');
  chiudiModal();
  await caricaBanche();
}

// ═══ HELPER ═══════════════════════════════════════════════════════════════
function _campo(label, id, val, type, ph) {
  let inp;
  if (type === 'textarea') {
    inp = '<textarea id="' + id + '" placeholder="' + esc(ph || '') + '" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:inherit;min-height:54px;resize:vertical">' + esc(val || '') + '</textarea>';
  } else {
    inp = '<input id="' + id + '" type="' + type + '" value="' + esc(String(val ?? '')) + '" placeholder="' + esc(ph || '') + '" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px">';
  }
  return '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">' + label + '</label>' + inp + '</div>';
}

function _mascheraIban(iban) {
  if (!iban) return '—';
  const c = iban.replace(/\s/g, '');
  if (c.length < 8) return c;
  return c.substring(0, 4) + '****' + c.substring(c.length - 4);
}

function _isAdminBanche() {
  // Solo admin per ora — quando avremo permessi granulari aggiungeremo banche_admin
  return typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.ruolo === 'admin';
}


// ═══════════════════════════════════════════════════════════════════════════
// TAB FINANZIAMENTI
// Mutui ipotecari + prestiti + agevolati + leasing.
// Mostra KPI, filtro stato, tabella, click "Piano" per dettaglio rate.
// ═══════════════════════════════════════════════════════════════════════════
var _finFiltroStato = 'attivo';   // attivo | estinto | tutti
var _bancheRate = {};              // cache rate per finanziamento_id

async function renderBancheFinanziamenti() {
  const cont = document.getElementById('banche-panel-finanziamenti');
  if (!cont) return;

  // Refresh dati banche/finanziamenti se servono
  if (!_bancheFinanziamenti.length) {
    const finRes = await sb.from('banche_finanziamenti').select('*');
    _bancheFinanziamenti = finRes.data || [];
  }

  // Carico il piano rate (servono per calcolare Residuo + Rata reali in tabella)
  if (!_bancheRateCache) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">⏳ Caricamento finanziamenti...</div>';
    const { data } = await sb.from('banche_finanziamenti_rate')
      .select('finanziamento_id, numero, data_scadenza, rata, residuo_capitale')
      .order('data_scadenza');
    _bancheRateCache = data || [];
  }

  // Filtra in base allo stato
  const filtrati = _bancheFinanziamenti.filter(f => {
    if (_finFiltroStato === 'tutti') return true;
    return f.stato === _finFiltroStato;
  });

  // Calcoli su attivi (per KPI e grafici)
  const attivi = _bancheFinanziamenti.filter(f => f.stato === 'attivo');
  const nAttivi = attivi.length;
  const capitaleOrig = attivi.reduce((s, f) => s + Number(f.capitale || 0), 0);
  const residuoTot = attivi.reduce((s, f) => s + _calcResiduoOggi(f), 0);
  const rataMensileEquiv = attivi.reduce((s, f) => s + _calcRataMensileEquivalente(f), 0);

  // Registro pannelli (default order: KPI → Tabella → Donut → Bars)
  _registerPanels('finanziamenti', ['kpi', 'tabella', 'donut', 'bars'], renderBancheFinanziamenti);

  // ─── BUILD PANEL HTMLs ─────────────────────────────────────────────────

  // PANEL KPI
  let kpiHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;padding-right:60px">';
  kpiHtml += '<div class="kpi"><div class="kpi-label">Attivi</div><div class="kpi-value">' + nAttivi + '</div></div>';
  kpiHtml += '<div class="kpi"><div class="kpi-label">Capitale originario</div><div class="kpi-value" style="color:#26215C">' + fmtE(capitaleOrig) + '</div></div>';
  kpiHtml += '<div class="kpi"><div class="kpi-label">Residuo da pagare</div><div class="kpi-value" style="color:#A32D2D">' + fmtE(residuoTot) + '</div></div>';
  kpiHtml += '<div class="kpi"><div class="kpi-label">Rata mensile equivalente</div><div class="kpi-value" style="color:#633806">' + fmtE(rataMensileEquiv) + '</div></div>';
  kpiHtml += '</div>';

  // PANEL TABELLA (filter header + table + bottone PDF)
  let tabellaHtml = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  tabellaHtml += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  tabellaHtml += '<div style="display:flex;gap:8px;align-items:center">';
  tabellaHtml += '<label style="font-size:11px;color:var(--text-muted);font-weight:500">Stato</label>';
  tabellaHtml += '<select id="fin-filtro-stato" onchange="_aggiornaFiltroFinanziamenti(this.value)" onwheel="this.blur()" style="font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">';
  tabellaHtml += '<option value="attivo" ' + (_finFiltroStato === 'attivo' ? 'selected' : '') + '>Attivi</option>';
  tabellaHtml += '<option value="estinto" ' + (_finFiltroStato === 'estinto' ? 'selected' : '') + '>Estinti</option>';
  tabellaHtml += '<option value="tutti" ' + (_finFiltroStato === 'tutti' ? 'selected' : '') + '>Tutti</option>';
  tabellaHtml += '</select>';
  tabellaHtml += '<span style="font-size:11px;color:var(--text-muted)">' + filtrati.length + ' finanziamento/i</span>';
  tabellaHtml += '</div>';
  tabellaHtml += '<div style="display:flex;gap:6px">';
  tabellaHtml += '<button onclick="stampaFinanziamentiPDF()" style="background:#1a1a18;color:#FAC775;border:0;border-radius:6px;padding:7px 12px;font-size:12px;cursor:pointer">📄 PDF</button>';
  if (_isAdminBanche()) {
    tabellaHtml += '<button class="btn-primary" onclick="apriModalFinanziamento()" style="font-size:12px;padding:7px 14px">+ Nuovo finanziamento</button>';
  }
  tabellaHtml += '</div>';
  tabellaHtml += '</div>';

  if (!filtrati.length) {
    tabellaHtml += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px">Nessun finanziamento da mostrare</div>';
  } else {
    tabellaHtml += '<div style="overflow-x:auto;background:var(--bg);border:0.5px solid var(--border);border-radius:10px">';
    tabellaHtml += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    tabellaHtml += '<thead><tr style="background:var(--bg);border-bottom:0.5px solid var(--border)">';
    ['Banca','Finalità','Tipo','Categoria','Erogazione','Capitale','Residuo','Rata','Frequenza','Fine','Stato',''].forEach(h => {
      tabellaHtml += '<th style="text-align:left;padding:10px 8px;font-weight:600;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.3px">' + h + '</th>';
    });
    tabellaHtml += '</tr></thead><tbody>';

    // Sort: stato (attivi prima) → priorità banca (Intesa→MPS→BNL→BCC) → data erogazione desc
    const sortati = filtrati.slice().sort((a, b) => {
      if (a.stato !== b.stato) return a.stato === 'attivo' ? -1 : 1;
      const nomeA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
      const nomeB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
      const pA = _priorityBancaIstituto(nomeA);
      const pB = _priorityBancaIstituto(nomeB);
      if (pA !== pB) return pA - pB;
      if (nomeA !== nomeB) return nomeA.localeCompare(nomeB);
      return (b.data_erogazione || '').localeCompare(a.data_erogazione || '');
    });

    sortati.forEach(f => {
      const istNome = (_bancheIstituti.find(i => i.id === f.istituto_id) || {}).nome || '—';
      const dataFine = _calcDataFine(f);
      const residuo = _calcResiduoOggi(f);
      let rataVal = f.rata ? Number(f.rata) : 0;
      if (!rataVal) {
        const rateFin = (_bancheRateCache || []).filter(r => r.finanziamento_id === f.id);
        if (rateFin.length) {
          const rate = rateFin.map(r => Number(r.rata || 0)).filter(r => r > 0);
          if (rate.length) rataVal = rate.reduce((s, r) => s + r, 0) / rate.length;
        }
        if (!rataVal) rataVal = _stimaRataMensile(f);
      }
      const rataFmt = rataVal > 0 ? fmtE(rataVal) : '—';

      tabellaHtml += '<tr style="border-bottom:0.5px solid var(--border);' + (f.stato === 'estinto' ? 'opacity:0.55' : '') + '">';
      tabellaHtml += '<td style="padding:8px;font-weight:500">' + esc(istNome) + '</td>';
      tabellaHtml += '<td style="padding:8px">' + esc(f.descrizione || '—') + (f.numero_contratto ? '<div style="font-size:10px;color:var(--text-hint);font-family:var(--font-mono)">' + esc(f.numero_contratto) + '</div>' : '') + '</td>';
      tabellaHtml += '<td style="padding:8px">' + _badgeTipologia(f.tipologia) + '</td>';
      tabellaHtml += '<td style="padding:8px;font-size:11px">' + (f.categoria ? _badgeCategoria(f.categoria) : '<span style="color:var(--text-hint)">—</span>') + '</td>';
      tabellaHtml += '<td style="padding:8px;font-size:11px">' + fmtD(f.data_erogazione) + '</td>';
      tabellaHtml += '<td style="padding:8px;font-family:var(--font-mono);font-weight:500;text-align:right">' + fmtE(Number(f.capitale)) + '</td>';
      tabellaHtml += '<td style="padding:8px;font-family:var(--font-mono);font-weight:500;text-align:right;color:' + (residuo > 0 ? '#A32D2D' : '#639922') + '">' + fmtE(residuo) + '</td>';
      tabellaHtml += '<td style="padding:8px;font-family:var(--font-mono);text-align:right">' + rataFmt + '</td>';
      tabellaHtml += '<td style="padding:8px;font-size:11px">' + _badgeFrequenza(f.frequenza) + '</td>';
      tabellaHtml += '<td style="padding:8px;font-size:11px">' + (dataFine ? fmtD(dataFine) : '—') + '</td>';
      tabellaHtml += '<td style="padding:8px">' + _badgeStato(f.stato) + '</td>';
      tabellaHtml += '<td style="padding:8px;text-align:right;white-space:nowrap">';
      tabellaHtml += '<button onclick="apriPianoFinanziamento(\'' + f.id + '\')" title="Vedi piano di ammortamento" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px">📋</button>';
      if (_isAdminBanche()) {
        tabellaHtml += ' <button onclick="apriModalFinanziamento(\'' + f.id + '\')" title="Modifica" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px">✏️</button>';
      }
      tabellaHtml += '</td>';
      tabellaHtml += '</tr>';
    });

    tabellaHtml += '</tbody></table>';
    tabellaHtml += '</div>';
  }
  tabellaHtml += '</div>';

  // PANEL DONUT (solo se ci sono attivi)
  const donutHtml = nAttivi > 0 ? _renderPanelDonutBanche(attivi) : '';

  // PANEL BARS (solo se ci sono attivi)
  const barsHtml = nAttivi > 0 ? _renderPanelBarsFinanziamenti(attivi) : '';

  // ─── ASSEMBLY: render in panel order ───
  const panels = {
    'kpi': kpiHtml,
    'tabella': tabellaHtml,
    'donut': donutHtml,
    'bars': barsHtml
  };
  const order = _getPanelOrder('finanziamenti');

  let html = '';
  order.forEach(id => {
    if (panels[id]) {
      html += _wrapPanel('finanziamenti', id, panels[id]);
    }
  });

  cont.innerHTML = html;
}

function _aggiornaFiltroFinanziamenti(val) {
  _finFiltroStato = val;
  renderBancheFinanziamenti();
}

// ═══ STAMPA PDF FINANZIAMENTI (2 pagine: Capitale + Interessi) ═══════════
async function stampaFinanziamentiPDF() {
  const attivi = _bancheFinanziamenti.filter(f => f.stato === 'attivo');
  if (!attivi.length) { toast('⚠ Nessun finanziamento attivo da stampare'); return; }

  toast('⏳ Generazione PDF...');

  // Carica rate complete (incluse quota_capitale e quota_interessi)
  const { data: rateData } = await sb.from('banche_finanziamenti_rate')
    .select('finanziamento_id, data_scadenza, rata, quota_capitale, quota_interessi, residuo_capitale')
    .order('data_scadenza');
  const rateAll = rateData || [];

  const oggi = new Date().toISOString().split('T')[0];

  // Aggregati per finanziamento
  const dati = attivi.map(f => {
    const rateFin = rateAll.filter(r => r.finanziamento_id === f.id);
    const cap = Number(f.capitale || 0);
    const istNome = (_bancheIstituti.find(i => i.id === f.istituto_id) || {}).nome || '—';
    let totRata = 0, totCap = 0, totInt = 0;
    let pagRata = 0, pagCap = 0, pagInt = 0;
    rateFin.forEach(r => {
      const rt = Number(r.rata || 0);
      const qc = Number(r.quota_capitale || 0);
      const qi = Number(r.quota_interessi || 0);
      totRata += rt; totCap += qc; totInt += qi;
      if (r.data_scadenza <= oggi) {
        pagRata += rt; pagCap += qc; pagInt += qi;
      }
    });
    const resCap = Math.max(0, cap - pagCap);
    const resInt = Math.max(0, totInt - pagInt);
    const pctCap = cap > 0 ? (pagCap / cap * 100) : 0;
    const pctInt = totInt > 0 ? (pagInt / totInt * 100) : 0;
    const rataMedia = rateFin.length ? (totRata / rateFin.length) : 0;
    return {
      banca: istNome,
      descrizione: f.descrizione || '—',
      data_erogazione: f.data_erogazione,
      tasso: Number(f.tasso || 0),
      cap, pagCap, resCap, pctCap,
      totInt, pagInt, resInt, pctInt,
      rataMedia
    };
  });

  // Sort per pct rimborsato decrescente (per le tabelle e barre)
  const datiCap = dati.slice().sort((a, b) => b.pctCap - a.pctCap);
  const datiInt = dati.slice().sort((a, b) => b.pctInt - a.pctInt);

  // Totali
  const tot = dati.reduce((s, d) => ({
    cap: s.cap + d.cap,
    pagCap: s.pagCap + d.pagCap,
    resCap: s.resCap + d.resCap,
    totInt: s.totInt + d.totInt,
    pagInt: s.pagInt + d.pagInt,
    resInt: s.resInt + d.resInt,
    rataMediaSum: s.rataMediaSum + d.rataMedia
  }), { cap: 0, pagCap: 0, resCap: 0, totInt: 0, pagInt: 0, resInt: 0, rataMediaSum: 0 });
  const pctCapTot = tot.cap > 0 ? (tot.pagCap / tot.cap * 100) : 0;
  const rataMediaPort = dati.length > 0 ? (tot.rataMediaSum / dati.length) : 0;

  // Helpers PDF
  const fmtEPdf = n => '€ ' + Math.round(n).toLocaleString('it-IT');
  const escPdf = s => String(s || '').replace(/[<>&]/g, c => ({'<':'&lt;','>':'&gt;','&':'&amp;'}[c]));
  const fmtErog = ds => ds ? new Date(ds + 'T12:00:00').toLocaleDateString('it-IT', { day:'2-digit', month:'2-digit', year:'2-digit' }) : '—';

  // Apri finestra di stampa
  const w = window.open('', '_blank');
  if (!w) { toast('⚠ Popup bloccato dal browser'); return; }
  const dataFmt = new Date().toLocaleDateString('it-IT');

  let h = '<!DOCTYPE html><html><head><title>Report Finanziamenti — Phoenix Fuel</title>';
  h += '<style>';
  h += '*{box-sizing:border-box}';
  h += 'body{font-family:Arial,sans-serif;padding:0;margin:0;color:#1a1a18;font-size:10px}';
  h += '.page{padding:18mm 14mm;page-break-after:always;min-height:265mm;position:relative}';
  h += '.page:last-child{page-break-after:auto}';
  h += '.header{display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:10px;border-bottom:1.5px solid #1a1a18;margin-bottom:14px}';
  h += '.azienda{font-size:10px;color:#888}';
  h += '.azienda small{font-size:8px;display:block;margin-top:2px}';
  h += '.titolo{text-align:right;font-size:16px;font-weight:600}';
  h += '.titolo small{display:block;font-size:10px;color:#888;font-weight:400;margin-top:2px}';
  h += '.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:14px}';
  h += '.kpi{padding:8px 10px;border-radius:5px}';
  h += '.kpi-label{font-size:7px;text-transform:uppercase;letter-spacing:0.4px}';
  h += '.kpi-val{font-size:13px;font-weight:600;margin-top:2px;font-family:monospace}';
  h += '.tag{display:inline-block;color:#fff;font-size:10px;font-weight:600;padding:3px 10px;border-radius:4px 4px 0 0;letter-spacing:0.4px}';
  h += 'table{width:100%;border-collapse:collapse;font-size:9px;border:0.5px solid #ccc;margin-bottom:18px}';
  h += 'th{background:#F1EFE8;padding:5px 6px;text-align:left;border-bottom:1px solid #888;font-size:8px;text-transform:uppercase;color:#5F5E5A;font-weight:600;letter-spacing:0.3px}';
  h += 'th.r{text-align:right}';
  h += 'td{padding:4px 6px;border-bottom:0.5px solid #e0e0e0;font-size:9px}';
  h += 'td.r{text-align:right;font-family:monospace}';
  h += 'tr.tot{background:#1a1a18;color:#fff;font-weight:600}';
  h += 'tr.tot td{padding:6px}';
  h += '.bar-row{margin-bottom:6px;page-break-inside:avoid}';
  h += '.bar-label{display:flex;justify-content:space-between;font-size:9px;margin-bottom:2px}';
  h += '.bar-label .v{font-family:monospace;color:#888}';
  h += '.bar{display:flex;height:14px;border-radius:3px;overflow:hidden}';
  h += '.bar-pag{display:flex;align-items:center;padding-left:5px;color:#fff;font-size:8px;font-family:monospace;white-space:nowrap}';
  h += '.bar-res{display:flex;align-items:center;justify-content:flex-end;padding-right:5px;font-size:8px;font-family:monospace;white-space:nowrap}';
  h += '.legend{display:flex;gap:10px;font-size:8px;color:#888}';
  h += '.legend span{display:inline-flex;align-items:center;gap:4px}';
  h += '.legend i{display:inline-block;width:8px;height:8px;border-radius:2px}';
  h += '.bars-title{display:flex;justify-content:space-between;align-items:center;margin-bottom:6px}';
  h += '.bars-title h3{font-size:11px;font-weight:600;margin:0}';
  h += '.footer{position:absolute;bottom:12mm;left:14mm;right:14mm;padding-top:8px;border-top:0.5px solid #ccc;display:flex;justify-content:space-between;font-size:8px;color:#888}';
  h += '@page{size:A4 portrait;margin:0}';
  h += '@media print{body{margin:0;-webkit-print-color-adjust:exact;print-color-adjust:exact}}';
  h += '</style></head><body>';

  // ─── PAGINA 1 — CAPITALE ───
  h += '<div class="page">';
  h += '<div class="header">';
  h += '<div class="azienda">PHOENIX FUEL S.R.L.<small>Vibo Valentia · P.IVA 03371240793</small></div>';
  h += '<div class="titolo">Report Finanziamenti — Capitale<small>Aggiornato al ' + dataFmt + '</small></div>';
  h += '</div>';

  h += '<div class="kpi-grid">';
  h += '<div class="kpi" style="background:#F1EFE8"><div class="kpi-label" style="color:#5F5E5A">Attivi</div><div class="kpi-val">' + dati.length + '</div></div>';
  h += '<div class="kpi" style="background:#EEEDFE"><div class="kpi-label" style="color:#26215C">Capitale orig.</div><div class="kpi-val" style="color:#26215C">' + fmtEPdf(tot.cap) + '</div></div>';
  h += '<div class="kpi" style="background:#EAF3DE"><div class="kpi-label" style="color:#27500A">Pagato</div><div class="kpi-val" style="color:#27500A">' + fmtEPdf(tot.pagCap) + '</div></div>';
  h += '<div class="kpi" style="background:#FCEBEB"><div class="kpi-label" style="color:#791F1F">Residuo</div><div class="kpi-val" style="color:#791F1F">' + fmtEPdf(tot.resCap) + '</div></div>';
  h += '</div>';

  h += '<div class="tag" style="background:#26215C">TABELLA · CAPITALE</div>';
  h += '<table>';
  h += '<thead><tr><th>Banca</th><th>Descrizione</th><th>Erog.</th><th class="r">Capitale</th><th class="r">Pagato</th><th class="r">Residuo</th><th class="r">% Pag.</th></tr></thead><tbody>';
  datiCap.forEach(d => {
    h += '<tr>';
    h += '<td>' + escPdf(d.banca) + '</td>';
    h += '<td>' + escPdf(d.descrizione) + '</td>';
    h += '<td>' + fmtErog(d.data_erogazione) + '</td>';
    h += '<td class="r">' + fmtEPdf(d.cap) + '</td>';
    h += '<td class="r" style="color:#27500A">' + fmtEPdf(d.pagCap) + '</td>';
    h += '<td class="r" style="color:#791F1F">' + fmtEPdf(d.resCap) + '</td>';
    h += '<td class="r">' + d.pctCap.toFixed(0) + '%</td>';
    h += '</tr>';
  });
  h += '<tr class="tot"><td colspan="3">TOTALI</td>';
  h += '<td class="r">' + fmtEPdf(tot.cap) + '</td>';
  h += '<td class="r" style="color:#C0DD97">' + fmtEPdf(tot.pagCap) + '</td>';
  h += '<td class="r" style="color:#F09595">' + fmtEPdf(tot.resCap) + '</td>';
  h += '<td class="r">' + pctCapTot.toFixed(0) + '%</td>';
  h += '</tr></tbody></table>';

  h += '<div class="bars-title">';
  h += '<h3>Capitale rimborsato per finanziamento</h3>';
  h += '<div class="legend"><span><i style="background:#1D9E75"></i>Pagato</span><span><i style="background:#F4C0D1"></i>Residuo</span></div>';
  h += '</div>';
  datiCap.forEach(d => {
    const pct = Math.max(0, Math.min(100, d.pctCap));
    const pctRes = 100 - pct;
    h += '<div class="bar-row">';
    h += '<div class="bar-label"><span>' + escPdf(d.descrizione) + '</span><span class="v">' + fmtEPdf(d.cap) + '</span></div>';
    h += '<div class="bar">';
    if (pct >= 8) {
      h += '<div class="bar-pag" style="width:' + pct + '%;background:#1D9E75">' + fmtEPdf(d.pagCap) + ' · ' + pct.toFixed(0) + '%</div>';
    } else if (pct > 0) {
      h += '<div style="width:' + pct + '%;background:#1D9E75"></div>';
    }
    if (pctRes >= 8) {
      h += '<div class="bar-res" style="width:' + pctRes + '%;background:#F4C0D1;color:#993556">' + fmtEPdf(d.resCap) + '</div>';
    } else if (pctRes > 0) {
      h += '<div style="width:' + pctRes + '%;background:#F4C0D1"></div>';
    }
    h += '</div></div>';
  });

  h += '<div class="footer"><span>Phoenix Fuel S.r.l. · PhoenixFuel Gestionale</span><span>Pagina 1 di 2</span></div>';
  h += '</div>';

  // ─── PAGINA 2 — INTERESSI ───
  h += '<div class="page">';
  h += '<div class="header">';
  h += '<div class="azienda">PHOENIX FUEL S.R.L.<small>Vibo Valentia · P.IVA 03371240793</small></div>';
  h += '<div class="titolo">Report Finanziamenti — Interessi<small>Aggiornato al ' + dataFmt + '</small></div>';
  h += '</div>';

  h += '<div class="kpi-grid">';
  h += '<div class="kpi" style="background:#F1EFE8"><div class="kpi-label" style="color:#5F5E5A">Attivi</div><div class="kpi-val">' + dati.length + '</div></div>';
  h += '<div class="kpi" style="background:#FAEEDA"><div class="kpi-label" style="color:#633806">Tot. interessi</div><div class="kpi-val" style="color:#633806">' + fmtEPdf(tot.totInt) + '</div></div>';
  h += '<div class="kpi" style="background:#EAF3DE"><div class="kpi-label" style="color:#27500A">Pagati</div><div class="kpi-val" style="color:#27500A">' + fmtEPdf(tot.pagInt) + '</div></div>';
  h += '<div class="kpi" style="background:#FCEBEB"><div class="kpi-label" style="color:#791F1F">Residui</div><div class="kpi-val" style="color:#791F1F">' + fmtEPdf(tot.resInt) + '</div></div>';
  h += '</div>';

  h += '<div class="tag" style="background:#633806">TABELLA · INTERESSI</div>';
  h += '<table>';
  h += '<thead><tr><th>Banca</th><th>Descrizione</th><th class="r">Tasso</th><th class="r">Tot. inter.</th><th class="r">Pagati</th><th class="r">Residui</th><th class="r">Rata media</th></tr></thead><tbody>';
  datiInt.forEach(d => {
    h += '<tr>';
    h += '<td>' + escPdf(d.banca) + '</td>';
    h += '<td>' + escPdf(d.descrizione) + '</td>';
    h += '<td class="r">' + d.tasso.toFixed(2).replace('.', ',') + '%</td>';
    h += '<td class="r">' + fmtEPdf(d.totInt) + '</td>';
    h += '<td class="r" style="color:#27500A">' + fmtEPdf(d.pagInt) + '</td>';
    h += '<td class="r" style="color:#791F1F">' + fmtEPdf(d.resInt) + '</td>';
    h += '<td class="r">' + fmtEPdf(d.rataMedia) + '</td>';
    h += '</tr>';
  });
  h += '<tr class="tot"><td colspan="3">TOTALI</td>';
  h += '<td class="r">' + fmtEPdf(tot.totInt) + '</td>';
  h += '<td class="r" style="color:#C0DD97">' + fmtEPdf(tot.pagInt) + '</td>';
  h += '<td class="r" style="color:#F09595">' + fmtEPdf(tot.resInt) + '</td>';
  h += '<td class="r">' + fmtEPdf(rataMediaPort) + '</td>';
  h += '</tr></tbody></table>';

  h += '<div class="bars-title">';
  h += '<h3>Interessi pagati per finanziamento</h3>';
  h += '<div class="legend"><span><i style="background:#BA7517"></i>Pagati</span><span><i style="background:#FAC775"></i>Residui</span></div>';
  h += '</div>';
  datiInt.forEach(d => {
    const pct = Math.max(0, Math.min(100, d.pctInt));
    const pctRes = 100 - pct;
    h += '<div class="bar-row">';
    h += '<div class="bar-label"><span>' + escPdf(d.descrizione) + '</span><span class="v">' + fmtEPdf(d.totInt) + '</span></div>';
    h += '<div class="bar">';
    if (pct >= 8) {
      h += '<div class="bar-pag" style="width:' + pct + '%;background:#BA7517">' + fmtEPdf(d.pagInt) + ' · ' + pct.toFixed(0) + '%</div>';
    } else if (pct > 0) {
      h += '<div style="width:' + pct + '%;background:#BA7517"></div>';
    }
    if (pctRes >= 8) {
      h += '<div class="bar-res" style="width:' + pctRes + '%;background:#FAC775;color:#633806">' + fmtEPdf(d.resInt) + '</div>';
    } else if (pctRes > 0) {
      h += '<div style="width:' + pctRes + '%;background:#FAC775"></div>';
    }
    h += '</div></div>';
  });

  h += '<div class="footer"><span>Phoenix Fuel S.r.l. · PhoenixFuel Gestionale</span><span>Pagina 2 di 2</span></div>';
  h += '</div>';

  h += '</body></html>';

  w.document.write(h);
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ═══ HELPER PANNELLI SPOSTABILI ════════════════════════════════════════════
// Sistema riutilizzabile: ogni sezione registra i suoi pannelli con ordine
// di default; l'utente può spostarli su/giù con frecce ▲▼ e l'ordine viene
// salvato in localStorage. Vale per tutte le sezioni del gestionale.
var _PANEL_ORDERS_DEFAULT = {};
var _PANEL_REFRESH_FN = {};

function _registerPanels(sezione, defaultOrder, refreshFn) {
  _PANEL_ORDERS_DEFAULT[sezione] = defaultOrder;
  _PANEL_REFRESH_FN[sezione] = refreshFn;
}

function _getPanelOrder(sezione) {
  const defaultOrder = _PANEL_ORDERS_DEFAULT[sezione] || [];
  try {
    const saved = localStorage.getItem('pf-panel-order-' + sezione);
    if (saved) {
      const order = JSON.parse(saved);
      // Mantieni solo quelli ancora validi + aggiungi nuovi default in coda
      const validi = order.filter(id => defaultOrder.includes(id));
      const nuovi = defaultOrder.filter(id => !validi.includes(id));
      return validi.concat(nuovi);
    }
  } catch(e) {}
  return defaultOrder.slice();
}

function _savePanelOrder(sezione, order) {
  try { localStorage.setItem('pf-panel-order-' + sezione, JSON.stringify(order)); } catch(e) {}
}

function _movePanelUp(sezione, panelId) {
  const order = _getPanelOrder(sezione);
  const idx = order.indexOf(panelId);
  if (idx <= 0) return;
  [order[idx-1], order[idx]] = [order[idx], order[idx-1]];
  _savePanelOrder(sezione, order);
  const fn = _PANEL_REFRESH_FN[sezione];
  if (fn) fn();
}

function _movePanelDown(sezione, panelId) {
  const order = _getPanelOrder(sezione);
  const idx = order.indexOf(panelId);
  if (idx < 0 || idx >= order.length - 1) return;
  [order[idx], order[idx+1]] = [order[idx+1], order[idx]];
  _savePanelOrder(sezione, order);
  const fn = _PANEL_REFRESH_FN[sezione];
  if (fn) fn();
}

function _wrapPanel(sezione, panelId, contenuto) {
  const order = _getPanelOrder(sezione);
  const idx = order.indexOf(panelId);
  const isFirst = idx <= 0;
  const isLast = idx >= order.length - 1;
  const opacityUp = isFirst ? '0.25' : '0.7';
  const opacityDown = isLast ? '0.25' : '0.7';
  const cursorUp = isFirst ? 'not-allowed' : 'pointer';
  const cursorDown = isLast ? 'not-allowed' : 'pointer';

  let h = '<div style="position:relative;margin-bottom:14px">';
  h += '<div style="position:absolute;top:6px;right:8px;z-index:10;display:flex;gap:3px">';
  h += '<button onclick="_movePanelUp(\'' + sezione + '\',\'' + panelId + '\')" ' + (isFirst ? 'disabled' : '') + ' title="Sposta sopra" style="background:rgba(255,255,255,0.95);border:0.5px solid var(--border);border-radius:4px;width:24px;height:22px;cursor:' + cursorUp + ';font-size:10px;color:var(--text);opacity:' + opacityUp + '">▲</button>';
  h += '<button onclick="_movePanelDown(\'' + sezione + '\',\'' + panelId + '\')" ' + (isLast ? 'disabled' : '') + ' title="Sposta sotto" style="background:rgba(255,255,255,0.95);border:0.5px solid var(--border);border-radius:4px;width:24px;height:22px;cursor:' + cursorDown + ';font-size:10px;color:var(--text);opacity:' + opacityDown + '">▼</button>';
  h += '</div>';
  h += contenuto;
  h += '</div>';
  return h;
}

// Donut esposizione per banca (panel separato)
function _renderPanelDonutBanche(finAttivi) {
  if (!finAttivi.length) return '';
  const perBanca = {};
  finAttivi.forEach(f => {
    const istNome = (_bancheIstituti.find(i => i.id === f.istituto_id) || {}).nome || '—';
    if (!perBanca[istNome]) perBanca[istNome] = { totale: 0, count: 0 };
    perBanca[istNome].totale += Number(f.capitale || 0);
    perBanca[istNome].count++;
  });
  const totaleAttivo = finAttivi.reduce((s, f) => s + Number(f.capitale || 0), 0);
  const banche = Object.keys(perBanca).sort((a, b) => perBanca[b].totale - perBanca[a].totale);
  const palette = ['#185FA5', '#1D9E75', '#BA7517', '#993556', '#534AB7', '#A32D2D', '#0F6E56'];
  const coloriBanca = {};
  banche.forEach((b, i) => coloriBanca[b] = palette[i % palette.length]);

  const r = 60;
  const C = 2 * Math.PI * r;
  let offset = 0;
  const totaleCompact = totaleAttivo >= 1000000
    ? '€ ' + (totaleAttivo / 1000000).toFixed(1).replace('.', ',') + 'M'
    : '€ ' + Math.round(totaleAttivo / 1000) + 'k';

  let svg = '<svg viewBox="0 0 200 200" width="180" height="180" style="display:block;margin:0 auto">';
  svg += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="var(--bg)" stroke-width="32"/>';
  banche.forEach(b => {
    const pct = perBanca[b].totale / totaleAttivo;
    const len = C * pct;
    svg += '<circle cx="100" cy="100" r="' + r + '" fill="none" stroke="' + coloriBanca[b] + '" stroke-width="32" stroke-dasharray="' + len.toFixed(2) + ' ' + (C - len).toFixed(2) + '" stroke-dashoffset="' + (-offset).toFixed(2) + '" transform="rotate(-90 100 100)"/>';
    offset += len;
  });
  svg += '<text x="100" y="93" text-anchor="middle" font-size="10" fill="var(--text-muted)">Capitale attivo</text>';
  svg += '<text x="100" y="115" text-anchor="middle" font-size="18" font-weight="500" fill="var(--text)">' + totaleCompact + '</text>';
  svg += '</svg>';

  let html = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  html += '<div style="font-size:13px;font-weight:600;margin-bottom:14px;color:var(--text)">📊 Esposizione per banca</div>';
  html += '<div style="display:grid;grid-template-columns:200px 1fr;gap:24px;align-items:center">';
  html += svg;
  html += '<div>';
  banche.forEach((b, i) => {
    const pct = (perBanca[b].totale / totaleAttivo * 100).toFixed(1);
    const isLast = i === banche.length - 1;
    html += '<div style="display:flex;align-items:center;justify-content:space-between;padding:8px 0;' + (isLast ? '' : 'border-bottom:0.5px solid var(--border)') + '">';
    html += '<div style="display:flex;align-items:center;gap:10px">';
    html += '<div style="width:12px;height:12px;background:' + coloriBanca[b] + ';border-radius:3px"></div>';
    html += '<div><div style="font-size:13px;font-weight:500">' + esc(b) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">' + perBanca[b].count + ' finanziament' + (perBanca[b].count === 1 ? 'o' : 'i') + '</div></div>';
    html += '</div>';
    html += '<div style="text-align:right">';
    html += '<div style="font-family:var(--font-mono);font-size:13px;font-weight:500">' + fmtE(perBanca[b].totale) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted)">' + pct + '%</div>';
    html += '</div></div>';
  });
  html += '</div></div></div>';
  return html;
}

// Barre pagato/residuo per finanziamento (panel separato)
function _renderPanelBarsFinanziamenti(finAttivi) {
  if (!finAttivi.length) return '';
  const finOrdinati = finAttivi.slice().map(f => {
    const cap = Number(f.capitale || 0);
    const residuo = _calcResiduoOggi(f);
    const pagato = Math.max(0, cap - residuo);
    const pct = cap > 0 ? (pagato / cap * 100) : 0;
    return { f, cap, residuo, pagato, pct };
  }).sort((a, b) => b.pct - a.pct);

  let html = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text)">📊 Capitale rimborsato per finanziamento</div>';
  html += '<div style="display:flex;gap:12px;font-size:11px;color:var(--text-muted)">';
  html += '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;background:#1D9E75;border-radius:2px"></span>Rimborsato</span>';
  html += '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;background:#F4C0D1;border-radius:2px"></span>Residuo</span>';
  html += '</div></div>';
  html += '<div style="display:grid;gap:14px">';
  finOrdinati.forEach(({ f, cap, residuo, pagato, pct }) => {
    const istNome = (_bancheIstituti.find(i => i.id === f.istituto_id) || {}).nome || '—';
    const dataFine = _calcDataFine(f);
    const fineFmt = dataFine
      ? new Date(dataFine + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })
      : '—';
    const pctTroncato = Math.max(0, Math.min(100, pct));
    html += '<div>';
    html += '<div style="display:flex;justify-content:space-between;margin-bottom:4px">';
    html += '<span style="font-size:12px;font-weight:500;color:var(--text)">' + esc(f.descrizione) + '</span>';
    html += '<span style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + fmtE(cap) + '</span>';
    html += '</div>';
    html += '<div style="display:flex;height:22px;border-radius:5px;overflow:hidden;background:var(--bg)">';
    if (pctTroncato >= 8) {
      html += '<div style="width:' + pctTroncato + '%;background:#1D9E75;display:flex;align-items:center;padding-left:8px;color:#fff;font-size:11px;font-family:var(--font-mono)">' + fmtE(pagato) + ' · ' + pctTroncato.toFixed(0) + '%</div>';
    } else if (pctTroncato > 0) {
      html += '<div style="width:' + pctTroncato + '%;background:#1D9E75"></div>';
    }
    const pctRes = 100 - pctTroncato;
    if (pctRes >= 8) {
      html += '<div style="width:' + pctRes + '%;background:#F4C0D1;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#993556;font-size:11px;font-family:var(--font-mono)">' + fmtE(residuo) + '</div>';
    } else if (pctRes > 0) {
      html += '<div style="width:' + pctRes + '%;background:#F4C0D1"></div>';
    }
    html += '</div>';
    html += '<div style="display:flex;justify-content:space-between;margin-top:3px;font-size:10px;color:var(--text-hint)">';
    html += '<span>' + esc(istNome) + ' · ' + (f.durata_rate || '—') + ' rate ' + (f.frequenza || '') + ' · fine ' + fineFmt + '</span>';
    let extra = '';
    if (pctTroncato < 8 && pagato > 0) extra += 'Pag. ' + fmtE(pagato) + ' · ' + pctTroncato.toFixed(0) + '%';
    if (pctRes < 8 && residuo > 0) extra += (extra ? ' · ' : '') + 'Res. ' + fmtE(residuo);
    html += '<span>' + extra + '</span>';
    html += '</div>';
    html += '</div>';
  });
  html += '</div></div>';
  return html;
}

// (Funzione legacy mantenuta per compat: chiama i due nuovi panel)
function _renderGraficiFinanziamenti(finAttivi) {
  return _renderPanelDonutBanche(finAttivi) + _renderPanelBarsFinanziamenti(finAttivi);
}

function _calcDataFine(f) {
  // Usa data prima rata + (durata-1) periodi
  if (!f.data_prima_rata || !f.durata_rate) return null;
  const d = new Date(f.data_prima_rata + 'T12:00:00');
  const k = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }[f.frequenza] || 1;
  d.setMonth(d.getMonth() + (f.durata_rate - 1) * k);
  return d.toISOString().split('T')[0];
}

function _calcResiduoOggi(f) {
  // Per estinti residuo = 0
  if (f.stato === 'estinto') return 0;
  // Se ho il piano rate caricato, prendo il residuo dell'ultima rata scaduta
  const rateFin = (_bancheRateCache || []).filter(r => r.finanziamento_id === f.id);
  if (rateFin.length) {
    const oggi = new Date().toISOString().split('T')[0];
    // Ordino per scadenza crescente (di solito già ordinate, ma per sicurezza)
    const sortate = rateFin.slice().sort((a, b) => a.data_scadenza.localeCompare(b.data_scadenza));
    const pagate = sortate.filter(r => r.data_scadenza <= oggi);
    if (!pagate.length) return Number(f.capitale || 0); // nessuna scaduta = ancora tutto da pagare
    // Residuo dell'ultima rata pagata
    return Number(pagate[pagate.length - 1].residuo_capitale || 0);
  }
  // Nessun piano caricato: fallback al capitale pieno
  return Number(f.capitale || 0);
}

function _calcRataMensileEquivalente(f) {
  if (f.stato !== 'attivo' || !f.rata) {
    // Fallback: calcola rata francese se mancante
    return _stimaRataMensile(f);
  }
  const r = Number(f.rata);
  const k = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }[f.frequenza] || 1;
  return r / k;
}

function _stimaRataMensile(f) {
  if (!f.capitale || !f.durata_rate) return 0;
  const C = Number(f.capitale);
  const tasso = Number(f.tasso || 0) / 100;
  const k = { mensile: 12, trimestrale: 4, semestrale: 2, annuale: 1 }[f.frequenza] || 12;
  const i = tasso / k;
  const n = f.durata_rate;
  if (i === 0) return (C / n) * (k / 12);
  const rata = C * i / (1 - Math.pow(1 + i, -n));
  // converto a mensile equivalente
  return rata / (12 / k);
}

function _badgeTipologia(t) {
  const map = {
    mutuo_ipotecario: { label: 'Mutuo ipot.', bg: '#EEEDFE', col: '#26215C' },
    prestito: { label: 'Prestito', bg: '#E6F1FB', col: '#0C447C' },
    finanziamento_agevolato: { label: 'Agevolato', bg: '#EAF3DE', col: '#27500A' },
    leasing: { label: 'Leasing', bg: '#FAEEDA', col: '#633806' }
  };
  const m = map[t] || { label: t || '—', bg: '#f0f0f0', col: '#666' };
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:' + m.bg + ';color:' + m.col + ';font-size:10px;font-weight:600;letter-spacing:0.3px">' + m.label + '</span>';
}

function _badgeCategoria(c) {
  const map = {
    finalizzato: { label: 'Finalizzato', bg: '#E6F1FB', col: '#0C447C' },
    liquidita: { label: 'Liquidità', bg: '#FAEEDA', col: '#633806' }
  };
  const m = map[c] || { label: c, bg: '#f0f0f0', col: '#666' };
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:' + m.bg + ';color:' + m.col + ';font-size:10px;font-weight:600">' + m.label + '</span>';
}

function _badgeFrequenza(f) {
  const map = { mensile: 'Mensile', trimestrale: 'Trim.', semestrale: 'Sem.', annuale: 'Annuale' };
  return map[f] || f || '—';
}

function _badgeStato(s) {
  const map = {
    attivo: { label: 'Attivo', bg: '#EAF3DE', col: '#27500A' },
    estinto: { label: 'Estinto', bg: '#f0f0f0', col: '#666' },
    rinegoziato: { label: 'Rinegoziato', bg: '#FAEEDA', col: '#633806' }
  };
  const m = map[s] || { label: s, bg: '#f0f0f0', col: '#666' };
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:' + m.bg + ';color:' + m.col + ';font-size:10px;font-weight:600">' + m.label + '</span>';
}

// ═══ GENERATORE PIANO DI AMMORTAMENTO FRANCESE ═══════════════════════════
// Calcola le rate con formula francese (rata costante, capitale crescente).
// Valido per tipo_tasso 'fisso' (e approssimazione 'variabile' al tasso corrente).
// Per 'misto' / 'zero_coupon' è un fallback ragionevole ma non perfetto.
function _generaRateFrancese(params) {
  const { capitale, tasso, durata_rate, frequenza, data_prima_rata } = params;
  const periodiPerAnno = { mensile: 12, trimestrale: 4, semestrale: 2, annuale: 1 }[frequenza] || 12;
  const mesiPerPeriodo = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }[frequenza] || 1;
  const i = (Number(tasso || 0) / 100) / periodiPerAnno;
  const n = Number(durata_rate);
  const C = Number(capitale);

  if (!C || !n || !data_prima_rata) return [];

  // Rata costante (formula francese; se i=0 → divisione semplice)
  const rata = i === 0 ? (C / n) : (C * i / (1 - Math.pow(1 + i, -n)));

  const rate = [];
  let residuo = C;
  const dInizio = new Date(data_prima_rata + 'T12:00:00');

  for (let j = 1; j <= n; j++) {
    const interesse = residuo * i;
    let capitaleQ = rata - interesse;
    // Ultima rata: chiude esattamente il residuo (per evitare residui di centesimi)
    if (j === n) capitaleQ = residuo;
    residuo = Math.max(0, residuo - capitaleQ);

    const dScad = new Date(dInizio);
    dScad.setMonth(dScad.getMonth() + (j - 1) * mesiPerPeriodo);

    rate.push({
      numero: j,
      data_scadenza: dScad.toISOString().split('T')[0],
      rata: Math.round((capitaleQ + interesse) * 100) / 100,
      quota_capitale: Math.round(capitaleQ * 100) / 100,
      quota_interessi: Math.round(interesse * 100) / 100,
      residuo_capitale: Math.round(residuo * 100) / 100
    });
  }

  return rate;
}

// Cancella il piano esistente e rigenera dal payload corrente
async function _rigeneraPianoFinanziamento(finId, payload) {
  // Cancella le rate esistenti
  const del = await sb.from('banche_finanziamenti_rate').delete().eq('finanziamento_id', finId);
  if (del.error) {
    toast('❌ Errore cancellazione piano: ' + del.error.message);
    return false;
  }

  // Genera nuove rate
  const rate = _generaRateFrancese({
    capitale: payload.capitale,
    tasso: payload.tasso || 0,
    durata_rate: payload.durata_rate,
    frequenza: payload.frequenza,
    data_prima_rata: payload.data_prima_rata
  });

  if (!rate.length) {
    toast('⚠ Impossibile generare piano: parametri insufficienti');
    return false;
  }

  // Inserisci con finanziamento_id
  const insertData = rate.map(r => ({ ...r, finanziamento_id: finId }));
  const ins = await sb.from('banche_finanziamenti_rate').insert(insertData);
  if (ins.error) {
    toast('❌ Errore inserimento piano: ' + ins.error.message);
    return false;
  }
  return true;
}

// ═══ MODALE PIANO DI AMMORTAMENTO ═════════════════════════════════════════
async function apriPianoFinanziamento(id) {
  const f = _bancheFinanziamenti.find(x => x.id === id);
  if (!f) { toast('⚠ Finanziamento non trovato'); return; }

  // Carica rate (cache)
  if (!_bancheRate[id]) {
    const { data } = await sb.from('banche_finanziamenti_rate')
      .select('*').eq('finanziamento_id', id).order('numero');
    _bancheRate[id] = data || [];
  }
  const rate = _bancheRate[id];
  const istNome = (_bancheIstituti.find(i => i.id === f.istituto_id) || {}).nome || '—';
  const oggi = new Date().toISOString().split('T')[0];

  // KPI piano
  const ratePagate = rate.filter(r => r.data_scadenza <= oggi).length;
  const rateRimaste = rate.length - ratePagate;
  const totRestituzione = rate.reduce((s, r) => s + Number(r.rata), 0);
  const totInteressi = rate.reduce((s, r) => s + Number(r.quota_interessi), 0);
  const residuoOggi = rate.length
    ? (rate.find(r => r.data_scadenza > oggi)?.residuo_capitale ?? 0)
    : Number(f.capitale);

  let html = '<div style="max-width:980px">';

  // Header info
  html += '<div style="margin-bottom:16px">';
  html += '<div style="font-size:18px;font-weight:600;color:var(--text)">📋 Piano di ammortamento</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);margin-top:3px">' + esc(f.descrizione) + ' · ' + esc(istNome) + (f.numero_contratto ? ' · <span style="font-family:var(--font-mono)">' + esc(f.numero_contratto) + '</span>' : '') + '</div>';
  html += '</div>';

  // KPI piano
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-bottom:14px">';
  html += '<div class="kpi" style="padding:10px"><div class="kpi-label">Capitale</div><div style="font-size:14px;font-weight:600;color:#26215C">' + fmtE(Number(f.capitale)) + '</div></div>';
  html += '<div class="kpi" style="padding:10px"><div class="kpi-label">Tasso</div><div style="font-size:14px;font-weight:600">' + (f.tasso ? Number(f.tasso).toFixed(2) + '%' : '—') + '</div></div>';
  html += '<div class="kpi" style="padding:10px"><div class="kpi-label">N° rate</div><div style="font-size:14px;font-weight:600">' + (rate.length || f.durata_rate) + '</div></div>';
  html += '<div class="kpi" style="padding:10px"><div class="kpi-label">Rate pagate</div><div style="font-size:14px;font-weight:600;color:#27500A">' + ratePagate + '</div></div>';
  html += '<div class="kpi" style="padding:10px"><div class="kpi-label">Rate rimaste</div><div style="font-size:14px;font-weight:600;color:#A32D2D">' + rateRimaste + '</div></div>';
  html += '<div class="kpi" style="padding:10px"><div class="kpi-label">Residuo oggi</div><div style="font-size:14px;font-weight:600;color:#A32D2D">' + fmtE(residuoOggi) + '</div></div>';
  html += '<div class="kpi" style="padding:10px"><div class="kpi-label">Tot. interessi</div><div style="font-size:14px;font-weight:600;color:#633806">' + fmtE(totInteressi) + '</div></div>';
  html += '</div>';

  // Badge "Copertura IRS attiva" (popolato in async da pf-banche-strumenti.js se IRS collegato)
  html += '<div id="irs-badge-' + id + '"></div>';
  setTimeout(function() {
    if (typeof window._strRenderIrsBadgeForMutuo === 'function') {
      window._strRenderIrsBadgeForMutuo(id);
    }
  }, 50);

  // Tabella piano
  if (!rate.length) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px">Piano di ammortamento non caricato per questo finanziamento</div>';
  } else {
    html += '<div style="max-height:500px;overflow-y:auto;border:0.5px solid var(--border);border-radius:8px">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    html += '<thead style="position:sticky;top:0;background:var(--bg);z-index:1"><tr style="border-bottom:0.5px solid var(--border)">';
    ['#','Scadenza','Rata','Quota capitale','Quota interessi','Residuo capitale',''].forEach(h => {
      html += '<th style="text-align:right;padding:8px;font-weight:600;color:var(--text-muted);font-size:10px;text-transform:uppercase">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    rate.forEach(r => {
      const pagata = r.data_scadenza <= oggi;
      const styleRiga = pagata ? 'background:#FAFAF8;color:var(--text-hint)' : '';
      html += '<tr style="border-bottom:0.5px solid var(--border);' + styleRiga + '">';
      html += '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">' + r.numero + '</td>';
      html += '<td style="padding:6px 8px;text-align:right">' + (pagata ? '✓ ' : '') + fmtD(r.data_scadenza) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);font-weight:500">' + fmtE(Number(r.rata)) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:#26215C">' + fmtE(Number(r.quota_capitale)) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:#633806">' + fmtE(Number(r.quota_interessi)) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + fmtE(Number(r.residuo_capitale)) + '</td>';
      html += '<td style="padding:6px 8px;text-align:right">' + (pagata ? '<span style="font-size:10px;color:#27500A">pagata</span>' : '') + '</td>';
      html += '</tr>';
    });

    // Totali
    html += '<tr style="background:var(--bg);font-weight:600;border-top:2px solid var(--border)">';
    html += '<td colspan="2" style="padding:8px;text-align:right">TOTALI</td>';
    html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono)">' + fmtE(totRestituzione) + '</td>';
    html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono);color:#26215C">' + fmtE(rate.reduce((s, r) => s + Number(r.quota_capitale), 0)) + '</td>';
    html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono);color:#633806">' + fmtE(totInteressi) + '</td>';
    html += '<td colspan="2"></td>';
    html += '</tr>';

    html += '</tbody></table>';
    html += '</div>';
  }

  html += '<div style="display:flex;justify-content:flex-end;margin-top:14px">';
  html += '<button onclick="chiudiModal()" class="btn-primary" style="font-size:12px;padding:8px 14px">Chiudi</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

// ═══ HELPER SYNC DATA FINE ⇄ DURATA (modale finanziamento) ═══════════════
// Quando cambia durata, frequenza o data prima rata → ricalcola data fine
function _syncDataFineDaDurata() {
  const dpr = document.getElementById('mod-fin-prima-rata');
  const durEl = document.getElementById('mod-fin-durata');
  const freqEl = document.getElementById('mod-fin-frequenza');
  const dataFineEl = document.getElementById('mod-fin-data-fine');
  if (!dpr || !durEl || !freqEl || !dataFineEl) return;
  const durata = Number(durEl.value);
  if (!dpr.value || !durata) { dataFineEl.value = ''; return; }
  const k = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }[freqEl.value] || 1;
  const d = new Date(dpr.value + 'T12:00:00');
  d.setMonth(d.getMonth() + (durata - 1) * k);
  dataFineEl.value = d.toISOString().split('T')[0];
}

// Quando l'utente cambia la data fine → ricalcola durata
function _syncDurataDaDataFine() {
  const dpr = document.getElementById('mod-fin-prima-rata');
  const durEl = document.getElementById('mod-fin-durata');
  const freqEl = document.getElementById('mod-fin-frequenza');
  const dataFineEl = document.getElementById('mod-fin-data-fine');
  if (!dpr || !durEl || !freqEl || !dataFineEl) return;
  if (!dpr.value || !dataFineEl.value) return;
  const k = { mensile: 1, trimestrale: 3, semestrale: 6, annuale: 12 }[freqEl.value] || 1;
  const dStart = new Date(dpr.value + 'T12:00:00');
  const dEnd = new Date(dataFineEl.value + 'T12:00:00');
  const mesi = (dEnd.getFullYear() - dStart.getFullYear()) * 12 + (dEnd.getMonth() - dStart.getMonth());
  const durata = Math.round(mesi / k) + 1;
  if (durata > 0) durEl.value = durata;
}

// ═══ MODALE NUOVO/MODIFICA FINANZIAMENTO ══════════════════════════════════
function apriModalFinanziamento(id) {
  const f = id ? _bancheFinanziamenti.find(x => x.id === id) : null;
  const titolo = f ? '✏️ Modifica finanziamento' : '+ Nuovo finanziamento';

  let html = '<div style="max-width:680px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:14px">' + titolo + '</div>';

  html += '<div style="display:grid;gap:10px">';

  // Banca + numero contratto
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Banca *</label>';
  html += '<select id="mod-fin-istituto" onwheel="this.blur()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  _bancheIstituti.forEach(i => {
    html += '<option value="' + i.id + '" ' + (f?.istituto_id === i.id ? 'selected' : '') + '>' + esc(i.nome) + '</option>';
  });
  html += '</select></div>';
  html += _campo('N° contratto', 'mod-fin-contratto', f?.numero_contratto || '', 'text', 'Es. OIR1075857846');
  html += '</div>';

  html += _campo('Descrizione *', 'mod-fin-descrizione', f?.descrizione || '', 'text', 'Es. Mutuo Deposito Vibo');
  html += _campo('Finalità', 'mod-fin-finalita', f?.finalita || '', 'text', 'Es. Acquisto immobile');

  // Tipologia + categoria
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Tipologia *</label>';
  html += '<select id="mod-fin-tipologia" onwheel="this.blur()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['mutuo_ipotecario','prestito','finanziamento_agevolato','leasing'].forEach(t => {
    const lab = { mutuo_ipotecario:'Mutuo ipotecario', prestito:'Prestito', finanziamento_agevolato:'Agevolato', leasing:'Leasing' }[t];
    html += '<option value="' + t + '" ' + ((f?.tipologia || 'prestito') === t ? 'selected' : '') + '>' + lab + '</option>';
  });
  html += '</select></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Categoria</label>';
  html += '<select id="mod-fin-categoria" onwheel="this.blur()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  html += '<option value="" ' + (!f?.categoria ? 'selected' : '') + '>—</option>';
  html += '<option value="finalizzato" ' + (f?.categoria === 'finalizzato' ? 'selected' : '') + '>Finalizzato</option>';
  html += '<option value="liquidita" ' + (f?.categoria === 'liquidita' ? 'selected' : '') + '>Liquidità</option>';
  html += '</select></div>';
  html += '</div>';

  // Capitale + tasso + tipo tasso
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  html += _campo('Capitale (€) *', 'mod-fin-capitale', f?.capitale ?? '', 'number', '0');
  html += _campo('Tasso TAN %', 'mod-fin-tasso', f?.tasso ?? '', 'number', '0.00');
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Tipo tasso</label>';
  html += '<select id="mod-fin-tipo-tasso" onwheel="this.blur()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['fisso','variabile','misto','zero_coupon'].forEach(t => {
    html += '<option value="' + t + '" ' + ((f?.tipo_tasso || 'fisso') === t ? 'selected' : '') + '>' + t + '</option>';
  });
  html += '</select></div>';
  html += '</div>';

  // Durata + frequenza + data fine (sincronizzati)
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Durata (n. rate) *</label>';
  html += '<input type="number" id="mod-fin-durata" value="' + (f?.durata_rate ?? '') + '" placeholder="120" oninput="_syncDataFineDaDurata()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px"></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Frequenza *</label>';
  html += '<select id="mod-fin-frequenza" onchange="_syncDataFineDaDurata()" onwheel="this.blur()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['mensile','trimestrale','semestrale','annuale'].forEach(t => {
    html += '<option value="' + t + '" ' + ((f?.frequenza || 'mensile') === t ? 'selected' : '') + '>' + t + '</option>';
  });
  html += '</select></div>';
  // Data fine: calcolata da durata, ma editabile (ricalcola durata)
  const dataFineCalc = f && f.data_prima_rata && f.durata_rate ? _calcDataFine(f) : '';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Data fine (auto)</label>';
  html += '<input type="date" id="mod-fin-data-fine" value="' + (dataFineCalc || '') + '" oninput="_syncDurataDaDataFine()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px"></div>';
  html += '</div>';

  // Date
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  html += _campo('Data erogazione *', 'mod-fin-erog', f?.data_erogazione || '', 'date');
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Data prima rata *</label>';
  html += '<input id="mod-fin-prima-rata" type="date" value="' + esc(String(f?.data_prima_rata || '')) + '" oninput="_syncDataFineDaDurata()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px"></div>';
  html += _campo('Rata calcolata (€)', 'mod-fin-rata', f?.rata ?? '', 'number', '0.00');
  html += '</div>';

  // Garanzia
  html += _campo('Garanzia', 'mod-fin-garanzia', f?.garanzia || '', 'text', 'Es. Ipoteca immobile');

  // Stato + data estinzione
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Stato</label>';
  html += '<select id="mod-fin-stato" onwheel="this.blur()" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['attivo','estinto','rinegoziato'].forEach(s => {
    html += '<option value="' + s + '" ' + ((f?.stato || 'attivo') === s ? 'selected' : '') + '>' + s + '</option>';
  });
  html += '</select></div>';
  html += _campo('Data estinzione', 'mod-fin-data-est', f?.data_estinzione || '', 'date');
  html += '</div>';

  // Note
  html += _campo('Note', 'mod-fin-note', f?.note || '', 'textarea');

  html += '</div>';

  // Pulsanti azione
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  if (f && id) {
    html += '<button onclick="eliminaFinanziamento(\'' + id + '\')" style="background:#A32D2D;color:white;border:0;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;margin-right:auto">🗑 Elimina</button>';
  }
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  html += '<button onclick="salvaFinanziamento(' + (id ? "'"+id+"'" : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 14px">💾 Salva</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

async function salvaFinanziamento(id) {
  const descrizione = document.getElementById('mod-fin-descrizione').value.trim();
  const capitale = Number(document.getElementById('mod-fin-capitale').value);
  const durata = Number(document.getElementById('mod-fin-durata').value);
  const dataErog = document.getElementById('mod-fin-erog').value;
  const dataPrimaRata = document.getElementById('mod-fin-prima-rata').value;

  if (!descrizione) { toast('⚠ Descrizione obbligatoria'); return; }
  if (!capitale || capitale <= 0) { toast('⚠ Capitale obbligatorio (>0)'); return; }
  if (!durata || durata <= 0) { toast('⚠ Durata obbligatoria (>0)'); return; }
  if (!dataErog) { toast('⚠ Data erogazione obbligatoria'); return; }
  if (!dataPrimaRata) { toast('⚠ Data prima rata obbligatoria'); return; }

  const payload = {
    istituto_id: document.getElementById('mod-fin-istituto').value,
    numero_contratto: document.getElementById('mod-fin-contratto').value.trim() || null,
    descrizione,
    finalita: document.getElementById('mod-fin-finalita').value.trim() || null,
    tipologia: document.getElementById('mod-fin-tipologia').value,
    categoria: document.getElementById('mod-fin-categoria').value || null,
    capitale,
    tasso: Number(document.getElementById('mod-fin-tasso').value) || null,
    tipo_tasso: document.getElementById('mod-fin-tipo-tasso').value,
    durata_rate: durata,
    frequenza: document.getElementById('mod-fin-frequenza').value,
    data_erogazione: dataErog,
    data_prima_rata: dataPrimaRata,
    rata: Number(document.getElementById('mod-fin-rata').value) || null,
    garanzia: document.getElementById('mod-fin-garanzia').value.trim() || null,
    stato: document.getElementById('mod-fin-stato').value,
    data_estinzione: document.getElementById('mod-fin-data-est').value || null,
    note: document.getElementById('mod-fin-note').value.trim() || null,
    updated_at: new Date().toISOString()
  };

  // Snapshot del finanziamento precedente per rilevare cambi che richiedono rigenerazione piano
  const oldF = id ? _bancheFinanziamenti.find(x => x.id === id) : null;

  let res;
  let finId = id;
  if (id) {
    res = await sb.from('banche_finanziamenti').update(payload).eq('id', id);
  } else {
    const ins = await sb.from('banche_finanziamenti').insert(payload).select().single();
    res = { error: ins.error };
    if (ins.data) finId = ins.data.id;
  }

  if (res.error) { toast('❌ ' + res.error.message); return; }

  // ─── Rigenerazione piano di ammortamento ──────────────────────────────
  // Trigger: nuovo finanziamento, oppure cambi a parametri di calcolo
  const keyFields = ['capitale', 'tasso', 'durata_rate', 'frequenza', 'data_prima_rata', 'tipo_tasso'];
  let needsRegen = !id; // nuovo finanziamento → sempre genera
  if (id && oldF) {
    needsRegen = keyFields.some(k => String(oldF[k] ?? '') !== String(payload[k] ?? ''));
  }

  if (needsRegen && finId) {
    const proceed = id
      ? confirm('I parametri di calcolo sono cambiati.\n\nRigenero il piano di ammortamento?\n• ' + payload.durata_rate + ' rate ' + payload.frequenza + '\n• Capitale ' + payload.capitale + ' €\n• Tasso ' + (payload.tasso || 0) + '%\n\nLe rate verranno ricalcolate sui nuovi parametri.')
      : true;
    if (proceed) {
      const ok = await _rigeneraPianoFinanziamento(finId, payload);
      if (ok) {
        toast('✓ ' + (id ? 'Aggiornato' : 'Creato') + ' + piano rigenerato (' + payload.durata_rate + ' rate)');
      }
    } else {
      toast('✓ ' + (id ? 'Aggiornato' : 'Creato') + ' (piano NON rigenerato)');
    }
  } else {
    toast('✓ ' + (id ? 'Finanziamento aggiornato' : 'Finanziamento creato'));
  }

  chiudiModal();
  // Refresh dati
  const finRes = await sb.from('banche_finanziamenti').select('*');
  _bancheFinanziamenti = finRes.data || [];
  if (finId) delete _bancheRate[finId]; // invalida cache rate per modale piano
  _bancheRateCache = null; // invalida cache globale (ricaricata alla prossima render)
  renderBancheFinanziamenti();
}

async function eliminaFinanziamento(id) {
  if (!confirm('Eliminare questo finanziamento?\n\nTutte le rate del piano di ammortamento verranno eliminate a cascata.')) return;
  const { error } = await sb.from('banche_finanziamenti').delete().eq('id', id);
  if (error) { toast('❌ ' + error.message); return; }
  toast('✓ Finanziamento eliminato');
  chiudiModal();
  const finRes = await sb.from('banche_finanziamenti').select('*');
  _bancheFinanziamenti = finRes.data || [];
  renderBancheFinanziamenti();
}


// ═══════════════════════════════════════════════════════════════════════════
// TAB AFFIDAMENTI
// 7 fidi attivi (cassa, anticipo fatture, ecc.), KPI utilizzo, barre colorate.
// ═══════════════════════════════════════════════════════════════════════════
async function renderBancheAffidamenti() {
  const cont = document.getElementById('banche-panel-affidamenti');
  if (!cont) return;

  // Cache condivisa: ultimi saldi giornalieri per conto
  const saldiByConto = await _ensureUltimiSaldi();

  // Override utilizzato per fidi tipo='cassa': usa il saldo contabile negativo dell'ultimo giorno
  // NB: non modifico il record originale, calcolo un valore live per la visualizzazione
  function _utilizzatoLive(a) {
    if (a.tipo === 'cassa' && a.conto_id && saldiByConto[a.conto_id]) {
      const s = saldiByConto[a.conto_id];
      const sCont = (s.saldo_contabile !== null && s.saldo_contabile !== undefined) ? Number(s.saldo_contabile) : null;
      if (sCont !== null) return Math.max(0, -sCont);
    }
    return Number(a.importo_utilizzato || 0);
  }

  const attivi = _bancheAffidamenti.filter(a => a.stato === 'attivo');

  // ─── KPI ───
  const totAccordato = attivi.reduce((s, a) => s + Number(a.importo_accordato || 0), 0);
  const totUtilizzato = attivi.reduce((s, a) => s + _utilizzatoLive(a), 0);
  const totResiduo = totAccordato - totUtilizzato;
  const oggi = new Date();
  const in30gg = new Date(oggi.getTime() + 30 * 86400000).toISOString().split('T')[0];
  const oggiStr = oggi.toISOString().split('T')[0];
  const nRevVicine = attivi.filter(a => a.data_scadenza && a.data_scadenza >= oggiStr && a.data_scadenza <= in30gg).length;

  let html = '';

  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px">';
  html += '<div class="kpi"><div class="kpi-label">Totale accordato</div><div class="kpi-value" style="color:#26215C">' + fmtE(totAccordato) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Totale utilizzato</div><div class="kpi-value" style="color:#A32D2D">' + fmtE(totUtilizzato) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Disponibilità residua</div><div class="kpi-value" style="color:#27500A">' + fmtE(totResiduo) + '</div></div>';
  html += '<div class="kpi" style="' + (nRevVicine > 0 ? 'border:1px solid #D85A30' : '') + '"><div class="kpi-label">Revisioni entro 30gg</div><div class="kpi-value" style="color:' + (nRevVicine > 0 ? '#D85A30' : 'var(--text)') + '">' + nRevVicine + '</div></div>';
  html += '</div>';

  // ─── Header con bottone nuovo ───
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  html += '<div style="font-size:15px;font-weight:600;color:var(--text)">Affidamenti attivi</div>';
  html += '<div style="display:flex;gap:8px">';
  html += '<button onclick="stampaElencoAffidamenti()" style="background:#1a1a18;color:#FAC775;border:0;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer">🖨 PDF Elenco fidi (per banche)</button>';
  if (_isAdminBanche()) {
    html += '<button class="btn-primary" onclick="apriModalAffidamento()" style="font-size:12px;padding:7px 14px">+ Nuovo affidamento</button>';
  }
  html += '</div>';
  html += '</div>';

  // ─── Tabella ───
  if (!attivi.length) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px">Nessun affidamento attivo</div>';
  } else {
    // Sort: priorità banca (Intesa→MPS→BNL→BCC→altri), poi alfabetico, poi per tipo
    const sortati = attivi.slice().sort((a, b) => {
      const nomeA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
      const nomeB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
      const pA = _priorityBancaIstituto(nomeA);
      const pB = _priorityBancaIstituto(nomeB);
      if (pA !== pB) return pA - pB;
      if (nomeA !== nomeB) return nomeA.localeCompare(nomeB);
      return (a.tipo || '').localeCompare(b.tipo || '');
    });

    html += '<div style="overflow-x:auto;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="background:var(--bg);border-bottom:0.5px solid var(--border)">';
    ['Banca','Tipo','Accordato','Utilizzato','Utilizzo %','Tasso','CDF','Scadenza',''].forEach(h => {
      html += '<th style="text-align:left;padding:10px 8px;font-weight:600;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.3px">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    sortati.forEach(a => {
      const ist = _bancheIstituti.find(i => i.id === a.istituto_id) || {};
      const accordato = Number(a.importo_accordato || 0);
      const utilizzato = _utilizzatoLive(a);
      const isLive = (a.tipo === 'cassa' && a.conto_id && saldiByConto[a.conto_id]);
      // Fidi tipo anticipo: utilizzato auto-calcolato dai trigger DB del modulo Anticipi
      const isAutoAnticipo = ['sbf','anticipo_fatture','castelletto','autoliquidante'].indexOf(a.tipo) >= 0;
      const pct = accordato > 0 ? (utilizzato / accordato * 100) : 0;
      const utilizzoColore = pct < 70 ? '#639922' : (pct < 85 ? '#D4A017' : '#A32D2D');
      const altoUtilizzo = pct > 90;
      const revisioneVicina = a.data_scadenza && a.data_scadenza >= oggiStr && a.data_scadenza <= in30gg;

      html += '<tr style="border-bottom:0.5px solid var(--border);' + (altoUtilizzo ? 'background:#FCEBEB' : '') + '">';
      html += '<td style="padding:8px;font-weight:500">' + esc(ist.nome || '—') + '</td>';
      html += '<td style="padding:8px">' + _badgeTipoFido(a.tipo) + '</td>';
      html += '<td style="padding:8px;font-family:var(--font-mono);text-align:right">' + fmtE(accordato) + '</td>';
      // Utilizzato: live (cassa+saldi), auto (anticipo), o editabile manualmente (altri)
      const editabile = !isLive && !isAutoAnticipo && _isAdminBanche();
      const cursorStyle = editabile ? 'pointer' : 'default';
      var onclickAttr = '';
      if (editabile) onclickAttr = 'onclick="modificaUtilizzato(\'' + a.id + '\')" title="Click per modificare"';
      else if (isLive) onclickAttr = 'title="Calcolato dai saldi giornalieri (tab Situazione)"';
      else if (isAutoAnticipo) onclickAttr = 'title="Calcolato automaticamente dal modulo Anticipo Fatture"';
      html += '<td style="padding:8px;font-family:var(--font-mono);text-align:right;cursor:' + cursorStyle + '" ' + onclickAttr + '>';
      html += fmtE(utilizzato);
      // Saldo disponibile (regola 29/04: visibile per ogni fido — sempre)
      const saldoDisp = accordato - utilizzato;
      html += '<div style="font-size:9px;color:#27500A;font-weight:600;font-family:inherit;margin-top:2px">Saldo: ' + fmtE(saldoDisp) + '</div>';
      if (isLive) {
        const dataSaldo = saldiByConto[a.conto_id].data;
        html += '<div style="font-size:9px;color:#27500A;font-weight:500;font-family:inherit;margin-top:1px">⬤ live ' + fmtD(dataSaldo) + '</div>';
      } else if (isAutoAnticipo) {
        html += '<div style="font-size:9px;color:#26215C;font-weight:500;font-family:inherit;margin-top:1px">⚙ auto da Anticipi' + (a.utilizzato_aggiornato ? ' · ' + fmtD(a.utilizzato_aggiornato) : '') + '</div>';
      } else if (a.utilizzato_aggiornato) {
        html += '<div style="font-size:9px;color:var(--text-hint);font-family:inherit;margin-top:1px">' + fmtD(a.utilizzato_aggiornato) + '</div>';
      }
      html += '</td>';
      // Barra utilizzo
      html += '<td style="padding:8px;min-width:140px">';
      html += '<div style="display:flex;align-items:center;gap:8px">';
      html += '<div style="flex:1;background:var(--bg);border-radius:10px;height:8px;overflow:hidden">';
      html += '<div style="width:' + Math.min(pct, 100) + '%;height:100%;background:' + utilizzoColore + ';transition:width 0.3s"></div>';
      html += '</div>';
      html += '<div style="font-family:var(--font-mono);font-weight:600;font-size:11px;color:' + utilizzoColore + ';min-width:42px;text-align:right">' + pct.toFixed(1) + '%</div>';
      html += '</div>';
      html += '</td>';
      html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono)">' + (a.tasso ? Number(a.tasso).toFixed(2) + '%' : '—') + '</td>';
      html += '<td style="padding:8px;text-align:right;font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">' + (a.tasso_cdf ? Number(a.tasso_cdf).toFixed(2) + '%' : '—') + '</td>';
      html += '<td style="padding:8px;font-size:11px">' + (a.data_scadenza ? fmtD(a.data_scadenza) + (revisioneVicina ? ' <span style="font-size:9px;color:#D85A30;background:#FAEEDA;padding:1px 5px;border-radius:8px;margin-left:3px;font-weight:600">⚠ vicina</span>' : '') : '—') + '</td>';
      html += '<td style="padding:8px;text-align:right;white-space:nowrap">';
      if (_isAdminBanche()) {
        html += '<button onclick="apriModalAffidamento(\'' + a.id + '\')" title="Modifica" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px">✏️</button>';
      }
      html += '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '</div>';
    html += '<div style="font-size:11px;color:var(--text-hint);margin-top:8px">⬤ live = utilizzato calcolato dai saldi giornalieri (tab Situazione). Per gli altri fidi, click sulla colonna "Utilizzato" per aggiornare manualmente. CDF = Commissione Disponibilità Fondi sulla quota non utilizzata.</div>';
  }

  cont.innerHTML = html;
}

function _badgeTipoFido(t) {
  const map = {
    cassa: { label: 'Cassa', bg: '#EEEDFE', col: '#26215C' },
    anticipo_fatture: { label: 'Antic. fatture', bg: '#EAF3DE', col: '#27500A' },
    sbf: { label: 'SBF', bg: '#E6F1FB', col: '#0C447C' },
    castelletto: { label: 'Castelletto', bg: '#FAEEDA', col: '#633806' },
    autoliquidante: { label: 'Autoliquid.', bg: '#FAEEDA', col: '#633806' },
    fideiussione: { label: 'Fideiuss.', bg: '#FCEBEB', col: '#791F1F' }
  };
  const m = map[t] || { label: t || '—', bg: '#f0f0f0', col: '#666' };
  return '<span style="display:inline-block;padding:2px 8px;border-radius:10px;background:' + m.bg + ';color:' + m.col + ';font-size:10px;font-weight:600">' + m.label + '</span>';
}

// ═══ EDIT INLINE UTILIZZATO ═════════════════════════════════════════════════
async function modificaUtilizzato(id) {
  const a = _bancheAffidamenti.find(x => x.id === id);
  if (!a) return;
  // Fidi anticipo: utilizzato auto-calcolato, blocca edit manuale
  const tipiAnt = ['anticipo_fatture','sbf','castelletto','autoliquidante'];
  if (tipiAnt.indexOf(a.tipo) >= 0) {
    toast('⚙ Utilizzato auto-calcolato dal modulo Anticipi. Non modificabile manualmente.');
    return;
  }
  const nuovo = prompt('Importo utilizzato (€):\n\nFido: ' + (_bancheIstituti.find(i => i.id === a.istituto_id)?.nome || '') + ' — ' + a.tipo + '\nAccordato: ' + fmtE(a.importo_accordato), Number(a.importo_utilizzato || 0));
  if (nuovo === null) return;
  const v = Number(nuovo);
  if (isNaN(v) || v < 0) { toast('⚠ Importo non valido'); return; }
  if (v > Number(a.importo_accordato)) {
    if (!confirm('⚠ L\'utilizzato (' + fmtE(v) + ') è MAGGIORE dell\'accordato (' + fmtE(a.importo_accordato) + ').\n\nProcedere comunque?')) return;
  }

  const today = new Date().toISOString().split('T')[0];
  const { error } = await sb.from('banche_affidamenti').update({
    importo_utilizzato: v,
    utilizzato_aggiornato: today,
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (error) { toast('❌ ' + error.message); return; }
  toast('✓ Utilizzato aggiornato');

  // Refresh dati e re-render
  const r = await sb.from('banche_affidamenti').select('*');
  _bancheAffidamenti = r.data || [];
  renderBancheAffidamenti();
}

// ═══ MODALE NUOVO/MODIFICA AFFIDAMENTO ═════════════════════════════════════
function apriModalAffidamento(id) {
  const a = id ? _bancheAffidamenti.find(x => x.id === id) : null;
  const titolo = a ? '✏️ Modifica affidamento' : '+ Nuovo affidamento';

  let html = '<div style="max-width:620px">';
  html += '<div style="font-size:16px;font-weight:600;margin-bottom:14px">' + titolo + '</div>';

  html += '<div style="display:grid;gap:10px">';

  // Banca + tipo
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Banca *</label>';
  html += '<select id="mod-aff-istituto" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  _bancheIstituti.forEach(i => {
    html += '<option value="' + i.id + '" ' + (a?.istituto_id === i.id ? 'selected' : '') + '>' + esc(i.nome) + '</option>';
  });
  html += '</select></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Tipo fido *</label>';
  html += '<select id="mod-aff-tipo" onchange="_aggiornaBloccoAnticipo(this.value)" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['cassa','anticipo_fatture','sbf','castelletto','autoliquidante','fideiussione'].forEach(t => {
    const lab = { cassa:'Cassa', anticipo_fatture:'Anticipo fatture', sbf:'SBF', castelletto:'Castelletto', autoliquidante:'Autoliquidante', fideiussione:'Fideiussione' }[t];
    html += '<option value="' + t + '" ' + ((a?.tipo || 'cassa') === t ? 'selected' : '') + '>' + lab + '</option>';
  });
  html += '</select></div>';
  html += '</div>';

  // Conto corrente collegato
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Conto corrente collegato</label>';
  html += '<select id="mod-aff-conto" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  html += '<option value="" ' + (!a?.conto_id ? 'selected' : '') + '>— Nessun conto specifico —</option>';
  _bancheConti.forEach(c => {
    const istNome = (_bancheIstituti.find(i => i.id === c.istituto_id) || {}).nome || '';
    html += '<option value="' + c.id + '" ' + (a?.conto_id === c.id ? 'selected' : '') + '>' + esc(istNome) + ' — ' + esc(c.descrizione) + '</option>';
  });
  html += '</select></div>';

  // Importi
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += _campo('Importo accordato (€) *', 'mod-aff-accordato', a?.importo_accordato ?? '', 'number', '0');
  // Importo utilizzato: read-only per fidi anticipo (calcolato auto dai trigger)
  var tipoCorrenteAff = a?.tipo || 'cassa';
  var isAutoAnticipo = ['sbf','anticipo_fatture','castelletto','autoliquidante'].indexOf(tipoCorrenteAff) >= 0;
  if (isAutoAnticipo) {
    html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Importo utilizzato (€)</label>';
    html += '<input id="mod-aff-utilizzato" type="number" value="' + (a?.importo_utilizzato ?? 0) + '" readonly style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-kpi);color:var(--text-muted);font-size:13px;cursor:not-allowed">';
    html += '<div style="font-size:10px;color:#26215C;margin-top:3px">⚙ Calcolato automaticamente dal modulo Anticipo Fatture</div></div>';
  } else {
    html += _campo('Importo utilizzato (€)', 'mod-aff-utilizzato', a?.importo_utilizzato ?? 0, 'number', '0');
  }
  html += '</div>';

  // Tassi
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += _campo('Tasso annuo %', 'mod-aff-tasso', a?.tasso ?? '', 'number', '0.00');
  html += _campo('CDF (% disponibilità non utiliz.)', 'mod-aff-cdf', a?.tasso_cdf ?? '', 'number', '0.00');
  html += '</div>';

  // ─── PARAMETRI ANTICIPO (visibili solo per tipi anticipo) ─────────────
  // Si mostrano dinamicamente in base alla select tipo (vedi onchange sotto).
  var tipiAnticipo = ['anticipo_fatture','sbf','castelletto','autoliquidante'];
  var tipoCorrente = a?.tipo || 'cassa';
  var mostraAnt = tipiAnticipo.indexOf(tipoCorrente) >= 0;
  html += '<div id="mod-aff-blocco-anticipo" style="' + (mostraAnt ? '' : 'display:none;') + 'background:#EEEDFE;border-left:4px solid #6B5FCC;border-radius:6px;padding:12px 14px;margin-top:6px">';
  html += '<div style="font-size:12px;font-weight:600;color:#26215C;margin-bottom:10px">📄 Parametri anticipo fatture</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">% Anticipo</label>';
  html += '<input id="mod-aff-perc-ant" type="number" min="0" max="100" step="1" value="' + (a?.percentuale_anticipo_default ?? '') + '" placeholder="Es. 80" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font-mono)"></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Base calcolo</label>';
  html += '<select id="mod-aff-base-ant" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px">';
  var bcA = a?.base_calcolo_default || '';
  html += '<option value=""' + (!bcA ? ' selected' : '') + '>—</option>';
  html += '<option value="imponibile"' + (bcA === 'imponibile' ? ' selected' : '') + '>Imponibile</option>';
  html += '<option value="totale"' + (bcA === 'totale' ? ' selected' : '') + '>Totale fattura</option>';
  html += '</select></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Massimale cliente (%)</label>';
  html += '<input id="mod-aff-mass-pct" type="number" min="0" max="100" step="1" value="' + (a?.massimale_cliente_pct ?? '') + '" placeholder="Es. 20" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;font-family:var(--font-mono)"></div>';
  html += '</div>';
  html += '<div style="font-size:10px;color:#26215C;margin-top:8px;line-height:1.5">💡 Esempio: fido 600k, % anticipo 80%, massimale cliente 20% → ogni cliente max <strong>120.000 €</strong> di anticipo aperto su questa banca. Una fattura da 122k (100k+IVA22) imponibile → anticipa <strong>80.000 €</strong>, totale → anticipa <strong>97.600 €</strong>.</div>';
  html += '</div>';

  // Date
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += _campo('Data delibera', 'mod-aff-delibera', a?.data_delibera || '', 'date');
  html += _campo('Data scadenza/revisione', 'mod-aff-scadenza', a?.data_scadenza || '', 'date');
  html += '</div>';

  // Stato
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Stato</label>';
  html += '<select id="mod-aff-stato" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['attivo','chiuso','rinnovato'].forEach(s => {
    html += '<option value="' + s + '" ' + ((a?.stato || 'attivo') === s ? 'selected' : '') + '>' + s + '</option>';
  });
  html += '</select></div>';

  html += _campo('Note', 'mod-aff-note', a?.note || '', 'textarea');
  html += '</div>';

  // Pulsanti azione
  html += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">';
  if (a && id) {
    html += '<button onclick="eliminaAffidamento(\'' + id + '\')" style="background:#A32D2D;color:white;border:0;border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;margin-right:auto">🗑 Elimina</button>';
  }
  html += '<button onclick="chiudiModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer">Annulla</button>';
  html += '<button onclick="salvaAffidamento(' + (id ? "'"+id+"'" : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 14px">💾 Salva</button>';
  html += '</div>';
  html += '</div>';

  apriModal(html);
}

// Helper: mostra/nasconde il blocco "Parametri anticipo fatture" in base
// al tipo di fido selezionato. Chiamato dall'onchange della select tipo.
function _aggiornaBloccoAnticipo(tipo) {
  var blocco = document.getElementById('mod-aff-blocco-anticipo');
  if (!blocco) return;
  var tipiAnticipo = ['anticipo_fatture','sbf','castelletto','autoliquidante'];
  blocco.style.display = (tipiAnticipo.indexOf(tipo) >= 0) ? '' : 'none';
}

async function salvaAffidamento(id) {
  const accordato = Number(document.getElementById('mod-aff-accordato').value);
  if (!accordato || accordato <= 0) { toast('⚠ Importo accordato obbligatorio (>0)'); return; }

  const utilizzato = Number(document.getElementById('mod-aff-utilizzato').value) || 0;
  const today = new Date().toISOString().split('T')[0];

  // Parametri anticipo (solo se il blocco è visibile in base al tipo)
  const tipoFido = document.getElementById('mod-aff-tipo').value;
  const tipiAnt = ['anticipo_fatture','sbf','castelletto','autoliquidante'];
  let percAnt = null, baseAnt = null, massPct = null;
  if (tipiAnt.indexOf(tipoFido) >= 0) {
    const pRaw = document.getElementById('mod-aff-perc-ant')?.value;
    if (pRaw !== '' && pRaw != null) {
      percAnt = Number(pRaw);
      if (!isFinite(percAnt) || percAnt < 0 || percAnt > 100) { toast('% Anticipo: 0-100'); return; }
    }
    baseAnt = document.getElementById('mod-aff-base-ant')?.value || null;
    const mRaw = document.getElementById('mod-aff-mass-pct')?.value;
    if (mRaw !== '' && mRaw != null) {
      massPct = Number(mRaw);
      if (!isFinite(massPct) || massPct < 0 || massPct > 100) { toast('Massimale cliente: 0-100%'); return; }
    }
  }

  const payload = {
    istituto_id: document.getElementById('mod-aff-istituto').value,
    conto_id: document.getElementById('mod-aff-conto').value || null,
    tipo: tipoFido,
    importo_accordato: accordato,
    tasso: Number(document.getElementById('mod-aff-tasso').value) || null,
    tasso_cdf: Number(document.getElementById('mod-aff-cdf').value) || null,
    data_delibera: document.getElementById('mod-aff-delibera').value || null,
    data_scadenza: document.getElementById('mod-aff-scadenza').value || null,
    stato: document.getElementById('mod-aff-stato').value,
    note: document.getElementById('mod-aff-note').value.trim() || null,
    percentuale_anticipo_default: percAnt,
    base_calcolo_default: baseAnt,
    massimale_cliente_pct: massPct,
    updated_at: new Date().toISOString()
  };

  // importo_utilizzato: scrivibile da form solo per tipi non-anticipo
  // (per i fidi anticipo il valore è ricalcolato dai trigger DB del modulo Anticipi).
  if (tipiAnt.indexOf(tipoFido) < 0) {
    payload.importo_utilizzato = utilizzato;
    payload.utilizzato_aggiornato = today;
  }

  let res;
  if (id) {
    res = await sb.from('banche_affidamenti').update(payload).eq('id', id);
  } else {
    res = await sb.from('banche_affidamenti').insert(payload);
  }

  if (res.error) { toast('❌ ' + res.error.message); return; }
  toast('✓ ' + (id ? 'Affidamento aggiornato' : 'Affidamento creato'));
  chiudiModal();

  // Refresh
  const r = await sb.from('banche_affidamenti').select('*');
  _bancheAffidamenti = r.data || [];
  renderBancheAffidamenti();
}

async function eliminaAffidamento(id) {
  if (!confirm('Eliminare questo affidamento?')) return;
  const { error } = await sb.from('banche_affidamenti').delete().eq('id', id);
  if (error) { toast('❌ ' + error.message); return; }
  toast('✓ Affidamento eliminato');
  chiudiModal();
  const r = await sb.from('banche_affidamenti').select('*');
  _bancheAffidamenti = r.data || [];
  renderBancheAffidamenti();
}


// ═══════════════════════════════════════════════════════════════════════════
// TAB PIANO ANNUALE
// Riproduce vista Excel "Spese Banche": matrice anni × finanziamenti.
// 2 tabelle: Impegno annuo (rate per anno) + Residuo capitale al 31/12.
// Calcolato dalle rate caricate (banche_finanziamenti_rate).
// ═══════════════════════════════════════════════════════════════════════════
var _bancheRateCache = null; // cache TUTTE le rate per evitare query ripetute
var _piaAnnoMin = null;
var _piaAnnoMax = null;
var _piaSoloAttivi = true;

async function renderBanchePianoAnnuale() {
  const cont = document.getElementById('banche-panel-piano');
  if (!cont) return;

  // Carico TUTTE le rate (una sola volta, poi cache)
  if (!_bancheRateCache) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">⏳ Caricamento piano annuale...</div>';
    const { data } = await sb.from('banche_finanziamenti_rate')
      .select('finanziamento_id, numero, data_scadenza, rata, residuo_capitale')
      .order('data_scadenza');
    _bancheRateCache = data || [];
  }

  // Determino range anni: default = (annoCorrente - 2) → ultimo anno di qualsiasi rata
  if (!_piaAnnoMin || !_piaAnnoMax) {
    const oggi = new Date();
    const annoCorrente = oggi.getFullYear();
    _piaAnnoMin = annoCorrente - 2;
    let maxRate = annoCorrente;
    _bancheRateCache.forEach(r => {
      const y = parseInt(r.data_scadenza.substring(0, 4));
      if (y > maxRate) maxRate = y;
    });
    _piaAnnoMax = maxRate;
  }

  // Filtra finanziamenti in base a toggle attivi/estinti
  const finFiltrati = _bancheFinanziamenti.filter(f => {
    if (_piaSoloAttivi) return f.stato === 'attivo';
    return true;
  });

  // Costruisco array anni
  const anni = [];
  for (let y = _piaAnnoMin; y <= _piaAnnoMax; y++) anni.push(y);

  // ─── Calcolo matrice IMPEGNO ANNUO: somma rate per (finanziamento, anno) ───
  const impegno = {}; // {finanziamento_id: {anno: somma_rate}}
  _bancheRateCache.forEach(r => {
    const finId = r.finanziamento_id;
    const y = parseInt(r.data_scadenza.substring(0, 4));
    if (!impegno[finId]) impegno[finId] = {};
    if (!impegno[finId][y]) impegno[finId][y] = 0;
    impegno[finId][y] += Number(r.rata);
  });

  // ─── Calcolo matrice RESIDUO al 31/12: prendo l'ultima rata dell'anno ───
  const residui = {}; // {finanziamento_id: {anno: residuo_a_fine_anno}}
  _bancheRateCache.forEach(r => {
    const finId = r.finanziamento_id;
    const y = parseInt(r.data_scadenza.substring(0, 4));
    if (!residui[finId]) residui[finId] = {};
    // Tengo il residuo dell'ultima rata di quell'anno (data più recente)
    if (residui[finId][y] === undefined ||
        r.data_scadenza > residui[finId][y]._data) {
      residui[finId][y] = { val: Number(r.residuo_capitale), _data: r.data_scadenza };
    }
  });

  // ─── HTML ───
  let html = '';

  // Header con controlli
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">';
  html += '<div style="font-size:15px;font-weight:600">📉 Piano annuale finanziamenti</div>';
  html += '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">';
  html += '<label style="font-size:11px;color:var(--text-muted)">Da</label>';
  html += '<input type="number" value="' + _piaAnnoMin + '" min="2015" max="2050" onchange="_piaAggiornaAnnoMin(this.value)" style="width:70px;padding:5px 8px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);font-size:12px;font-family:var(--font-mono)">';
  html += '<label style="font-size:11px;color:var(--text-muted)">a</label>';
  html += '<input type="number" value="' + _piaAnnoMax + '" min="2015" max="2050" onchange="_piaAggiornaAnnoMax(this.value)" style="width:70px;padding:5px 8px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);font-size:12px;font-family:var(--font-mono)">';
  html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-left:10px">';
  html += '<input type="checkbox" ' + (_piaSoloAttivi ? 'checked' : '') + ' onchange="_piaToggleAttivi(this.checked)"> Solo attivi';
  html += '</label>';
  html += '<button onclick="stampaPianoAnnuale()" class="btn-primary" style="font-size:12px;padding:6px 12px;margin-left:6px">🖨 PDF</button>';
  html += '</div>';
  html += '</div>';

  if (!finFiltrati.length) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px">Nessun finanziamento da mostrare</div>';
    cont.innerHTML = html;
    return;
  }

  // Sort finanziamenti: priorità banca (Intesa→MPS→BNL→BCC) → data erogazione asc
  const finSortati = finFiltrati.slice().sort((a, b) => {
    const nomeA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
    const nomeB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
    const pA = _priorityBancaIstituto(nomeA);
    const pB = _priorityBancaIstituto(nomeB);
    if (pA !== pB) return pA - pB;
    if (nomeA !== nomeB) return nomeA.localeCompare(nomeB);
    return (a.data_erogazione || '').localeCompare(b.data_erogazione || '');
  });

  // ─── TABELLA IMPEGNO ANNUO ───
  html += _renderMatrice('💰 IMPEGNO ANNUO (uscite di cassa per finanziamenti)', finSortati, anni, impegno, false);

  html += '<div style="height:18px"></div>';

  // ─── TABELLA RESIDUO CAPITALE AL 31/12 ───
  html += _renderMatrice('📊 RESIDUO CAPITALE AL 31/12 (debito residuo da pagare)', finSortati, anni, residui, true);

  // ─── RIGA RIEPILOGO % PAGATA (rata totale = capitale + interessi) ───
  // Coerente con Timeline: somma di tutte le rate del piano (capitale + interessi)
  const oggiStr = new Date().toISOString().split('T')[0];
  const oggiFmt = new Date().toLocaleDateString('it-IT');
  let totImpegno = 0, totPagato = 0;
  finSortati.forEach(f => {
    const rateFin = (_bancheRateCache || []).filter(r => r.finanziamento_id === f.id);
    if (!rateFin.length) {
      // Nessun piano: per estinti consideriamo tutto pagato sul capitale, per attivi tutto da pagare
      const cap = Number(f.capitale || 0);
      totImpegno += cap;
      if (f.stato === 'estinto') totPagato += cap;
      return;
    }
    const accordato = rateFin.reduce((s, r) => s + Number(r.rata || 0), 0);
    let pagato = rateFin.filter(r => r.data_scadenza <= oggiStr)
                        .reduce((s, r) => s + Number(r.rata || 0), 0);
    if (f.stato === 'estinto') pagato = accordato; // estinto = 100% pagato
    totImpegno += accordato;
    totPagato += pagato;
  });
  const totResiduo = totImpegno - totPagato;
  const pctPagato = totImpegno > 0 ? (totPagato / totImpegno * 100) : 0;

  html += '<div style="margin-top:14px;padding:14px 18px;background:linear-gradient(135deg,#26215C 0%,#3a3478 100%);color:#fff;border-radius:10px">';
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;align-items:center">';
  html += '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.75">Totale impegno (cap. + interessi)</div><div style="font-size:16px;font-weight:600;font-family:var(--font-mono);margin-top:3px">' + fmtE(totImpegno) + '</div></div>';
  html += '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.75">Già pagato al ' + oggiFmt + '</div><div style="font-size:16px;font-weight:600;font-family:var(--font-mono);margin-top:3px;color:#EAF3DE">' + fmtE(totPagato) + '</div></div>';
  html += '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.75">Residuo da pagare</div><div style="font-size:16px;font-weight:600;font-family:var(--font-mono);margin-top:3px;color:#FAEEDA">' + fmtE(totResiduo) + '</div></div>';
  html += '<div><div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.75">% Pagata</div><div style="font-size:22px;font-weight:700;font-family:var(--font-mono);margin-top:1px;color:#EAF3DE">' + pctPagato.toFixed(1) + '%</div></div>';
  html += '</div>';
  // Barra di progresso
  html += '<div style="margin-top:12px;background:rgba(255,255,255,0.15);border-radius:10px;height:8px;overflow:hidden">';
  html += '<div style="width:' + Math.min(pctPagato, 100) + '%;height:100%;background:#EAF3DE;transition:width 0.4s"></div>';
  html += '</div>';
  html += '</div>';

  cont.innerHTML = html;
}

function _renderMatrice(titolo, finanziamenti, anni, dati, isResiduo) {
  let html = '';
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;overflow:hidden">';
  html += '<div style="padding:10px 14px;background:var(--bg);border-bottom:0.5px solid var(--border);font-size:13px;font-weight:600;color:var(--text)">' + titolo + '</div>';
  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">';

  // Header riga
  html += '<thead><tr style="background:var(--bg);border-bottom:0.5px solid var(--border)">';
  html += '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.3px;position:sticky;left:0;background:var(--bg);z-index:1;min-width:160px">Finalità</th>';
  anni.forEach(y => {
    html += '<th style="text-align:right;padding:8px 10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.3px;min-width:80px">' + y + '</th>';
  });
  html += '</tr></thead><tbody>';

  // Righe per ogni finanziamento
  finanziamenti.forEach(f => {
    const datoFin = isResiduo ? (dati[f.id] || {}) : (dati[f.id] || {});
    html += '<tr style="border-bottom:0.5px solid var(--border);' + (f.stato === 'estinto' ? 'opacity:0.55' : '') + '">';
    // Cella Finalità (sticky a sinistra)
    html += '<td style="padding:8px 10px;font-weight:500;position:sticky;left:0;background:var(--bg-card);z-index:1">';
    html += '<div>' + esc(f.descrizione || '—') + '</div>';
    if (f.numero_contratto) html += '<div style="font-size:9px;color:var(--text-hint);font-family:var(--font-mono)">' + esc(f.numero_contratto) + '</div>';
    html += '</td>';
    // Celle anni
    anni.forEach(y => {
      let v;
      if (isResiduo) {
        v = (datoFin[y] && datoFin[y].val !== undefined) ? datoFin[y].val : null;
      } else {
        v = datoFin[y] !== undefined ? datoFin[y] : null;
      }
      const cella = (v === null || v === 0)
        ? '<span style="color:var(--text-hint)">—</span>'
        : fmtE(v);
      html += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono)">' + cella + '</td>';
    });
    html += '</tr>';
  });

  // ─── Totali per anno ───
  const totaliPerAnno = {};
  anni.forEach(y => totaliPerAnno[y] = 0);
  finanziamenti.forEach(f => {
    const datoFin = dati[f.id] || {};
    anni.forEach(y => {
      let v;
      if (isResiduo) {
        v = (datoFin[y] && datoFin[y].val !== undefined) ? datoFin[y].val : 0;
      } else {
        v = datoFin[y] !== undefined ? datoFin[y] : 0;
      }
      totaliPerAnno[y] += v;
    });
  });

  // Riga totale
  html += '<tr style="background:var(--bg);font-weight:600;border-top:2px solid var(--border)">';
  html += '<td style="padding:10px;position:sticky;left:0;background:var(--bg);z-index:1;text-transform:uppercase;font-size:10px;letter-spacing:0.3px">TOTALE ' + (isResiduo ? 'RESIDUO' : 'IMPEGNO') + '</td>';
  anni.forEach(y => {
    const t = totaliPerAnno[y];
    html += '<td style="padding:10px;text-align:right;font-family:var(--font-mono);color:' + (isResiduo ? '#A32D2D' : '#26215C') + '">' + (t > 0 ? fmtE(t) : '<span style="color:var(--text-hint)">—</span>') + '</td>';
  });
  html += '</tr>';

  // Riga delta % vs anno precedente
  html += '<tr style="background:var(--bg);font-size:10px;color:var(--text-muted)">';
  html += '<td style="padding:6px 10px;position:sticky;left:0;background:var(--bg);z-index:1;text-transform:uppercase;letter-spacing:0.3px">Δ vs anno precedente</td>';
  anni.forEach((y, idx) => {
    if (idx === 0) {
      html += '<td style="padding:6px 10px;text-align:right">—</td>';
    } else {
      const cur = totaliPerAnno[y];
      const prev = totaliPerAnno[anni[idx - 1]];
      if (!prev || prev === 0) {
        html += '<td style="padding:6px 10px;text-align:right">—</td>';
      } else {
        const pct = ((cur - prev) / prev) * 100;
        const segno = pct >= 0 ? '+' : '';
        const col = pct < 0 ? '#27500A' : (pct > 0 ? (isResiduo ? '#A32D2D' : '#633806') : 'var(--text-hint)');
        html += '<td style="padding:6px 10px;text-align:right;color:' + col + ';font-weight:500">' + segno + pct.toFixed(0) + '%</td>';
      }
    }
  });
  html += '</tr>';

  html += '</tbody></table></div></div>';
  return html;
}

function _piaAggiornaAnnoMin(v) {
  const n = parseInt(v);
  if (!n || n < 2015 || n > 2050) return;
  _piaAnnoMin = n;
  if (_piaAnnoMin > _piaAnnoMax) _piaAnnoMax = _piaAnnoMin;
  renderBanchePianoAnnuale();
}

function _piaAggiornaAnnoMax(v) {
  const n = parseInt(v);
  if (!n || n < 2015 || n > 2050) return;
  _piaAnnoMax = n;
  if (_piaAnnoMax < _piaAnnoMin) _piaAnnoMin = _piaAnnoMax;
  renderBanchePianoAnnuale();
}

function _piaToggleAttivi(checked) {
  _piaSoloAttivi = !!checked;
  renderBanchePianoAnnuale();
}

// ═══ STAMPA PDF PIANO ANNUALE ═════════════════════════════════════════════
function stampaPianoAnnuale() {
  // Approccio semplice: crea un nuovo iframe con il contenuto formattato per stampa
  // L'utente userà la stampa del browser → PDF
  const cont = document.getElementById('banche-panel-piano');
  if (!cont) return;

  // Apre finestra di stampa con stessa logica visualizzata
  const w = window.open('', '_blank');
  if (!w) { toast('⚠ Popup bloccato dal browser'); return; }

  const dataFmt = new Date().toLocaleDateString('it-IT');
  w.document.write('<!DOCTYPE html><html><head><title>Piano annuale finanziamenti — Phoenix Fuel</title>');
  w.document.write('<style>');
  w.document.write('body{font-family:Arial,sans-serif;padding:20px;font-size:11px;color:#333}');
  w.document.write('h1{font-size:16px;color:#26215C;margin-bottom:4px}');
  w.document.write('h2{font-size:13px;color:#26215C;margin:18px 0 8px;padding:6px 10px;background:#f0f0f0;border-left:3px solid #26215C}');
  w.document.write('table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:8px}');
  w.document.write('th{background:#f0f0f0;padding:6px 8px;text-align:right;border-bottom:1px solid #ccc;font-size:9px;text-transform:uppercase}');
  w.document.write('th:first-child{text-align:left}');
  w.document.write('td{padding:5px 8px;text-align:right;border-bottom:0.5px solid #eee;font-family:monospace}');
  w.document.write('td:first-child{text-align:left;font-family:Arial,sans-serif;font-weight:500}');
  w.document.write('tr.tot td{font-weight:bold;background:#fafafa;border-top:2px solid #999}');
  w.document.write('tr.delta td{font-size:9px;color:#999;background:#fafafa}');
  w.document.write('@page{size:A4 landscape;margin:1cm}');
  w.document.write('</style></head><body>');
  w.document.write('<h1>📉 Piano annuale finanziamenti — Phoenix Fuel S.r.l.</h1>');
  w.document.write('<div style="font-size:10px;color:#666">Generato il ' + dataFmt + ' · ' + (_piaSoloAttivi ? 'Solo attivi' : 'Attivi + estinti') + ' · ' + _piaAnnoMin + '–' + _piaAnnoMax + '</div>');
  // Estraggo le 2 tabelle dal DOM corrente e le incollo
  const tabelle = cont.querySelectorAll('table');
  const titoli = cont.querySelectorAll('div[style*="font-size:13px;font-weight:600"]');
  tabelle.forEach((t, i) => {
    if (titoli[i]) w.document.write('<h2>' + titoli[i].textContent + '</h2>');
    w.document.write(t.outerHTML);
  });
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(() => w.print(), 300);
}


// ═══════════════════════════════════════════════════════════════════════════
// STAMPA PDF ELENCO AFFIDAMENTI (per richieste banche)
// Documento periodico richiesto dalle banche.
// Mostra istituti attivi + tipi affidamento + importi accordato/utilizzato.
// NESSUN tasso o interesse (è un documento di esposizione totale).
// ═══════════════════════════════════════════════════════════════════════════
function stampaElencoAffidamenti() {
  _stampaElencoAffidamentiAsync();
}

async function _stampaElencoAffidamentiAsync() {
  const attivi = _bancheAffidamenti.filter(a => a.stato === 'attivo');
  if (!attivi.length) { toast('⚠ Nessun affidamento attivo da stampare'); return; }

  // Cache condivisa: ultimi saldi giornalieri per fidi cassa live
  const saldiByConto = await _ensureUltimiSaldi();

  function _utilizzatoLive(a) {
    if (a.tipo === 'cassa' && a.conto_id && saldiByConto[a.conto_id]) {
      const sCont = saldiByConto[a.conto_id].saldo_contabile;
      if (sCont !== null && sCont !== undefined) return Math.max(0, -Number(sCont));
    }
    return Number(a.importo_utilizzato || 0);
  }

  // Raggruppo per istituto
  const perIstituto = {};
  attivi.forEach(a => {
    if (!perIstituto[a.istituto_id]) perIstituto[a.istituto_id] = [];
    perIstituto[a.istituto_id].push(a);
  });

  // Sort per priorità banca: Intesa→MPS→BNL→BCC→altri (regola costituzionale 27/04)
  const istitutiSorted = Object.keys(perIstituto).sort((a, b) => {
    const nomeA = (_bancheIstituti.find(i => i.id === a) || {}).nome || '';
    const nomeB = (_bancheIstituti.find(i => i.id === b) || {}).nome || '';
    const pA = _priorityBancaIstituto(nomeA);
    const pB = _priorityBancaIstituto(nomeB);
    if (pA !== pB) return pA - pB;
    return nomeA.localeCompare(nomeB);
  });

  // Totali generali
  const totAccordato = attivi.reduce((s, a) => s + Number(a.importo_accordato || 0), 0);
  const totUtilizzato = attivi.reduce((s, a) => s + _utilizzatoLive(a), 0);
  const totResiduo = totAccordato - totUtilizzato;

  // Data generazione
  const dataFmt = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });
  const dataFmtBreve = new Date().toLocaleDateString('it-IT');

  const w = window.open('', '_blank');
  if (!w) { toast('⚠ Popup bloccato dal browser'); return; }

  // Mappa label tipo → testo
  const tipoLabel = {
    cassa: 'Fido di cassa',
    anticipo_fatture: 'Anticipo fatture',
    sbf: 'Salvo Buon Fine (SBF)',
    castelletto: 'Castelletto',
    autoliquidante: 'Autoliquidante',
    fideiussione: 'Fideiussione'
  };

  let body = '';

  // Header documento
  body += '<div class="header">';
  body += '<div class="azienda">PHOENIX FUEL S.R.L.</div>';
  body += '<div class="meta">P.IVA 02744150802 · Zona Industriale snc · 89900 Vibo Valentia (VV)</div>';
  body += '</div>';

  body += '<h1>ELENCO AFFIDAMENTI BANCARI</h1>';
  body += '<div class="data-doc">Situazione al ' + dataFmt + '</div>';

  // Per ogni banca un blocco
  istitutiSorted.forEach(istId => {
    const ist = _bancheIstituti.find(i => i.id === istId) || {};
    const fidi = perIstituto[istId];
    const subTotAcc = fidi.reduce((s, f) => s + Number(f.importo_accordato || 0), 0);
    const subTotUti = fidi.reduce((s, f) => s + _utilizzatoLive(f), 0);

    body += '<h2>' + esc(ist.nome || '—') + '</h2>';
    if (ist.filiale) body += '<div class="filiale">Filiale: ' + esc(ist.filiale) + '</div>';

    body += '<table>';
    body += '<thead><tr>';
    body += '<th>Tipo affidamento</th>';
    body += '<th>Conto corrente</th>';
    body += '<th class="r">Accordato</th>';
    body += '<th class="r">Utilizzato</th>';
    body += '<th class="r">Disponibile</th>';
    body += '</tr></thead><tbody>';

    fidi.forEach(f => {
      const cc = _bancheConti.find(c => c.id === f.conto_id);
      const accordato = Number(f.importo_accordato || 0);
      const utilizzato = _utilizzatoLive(f);
      const disp = accordato - utilizzato;
      body += '<tr>';
      body += '<td>' + esc(tipoLabel[f.tipo] || f.tipo) + '</td>';
      body += '<td class="iban">' + (cc ? _mascheraIban(cc.iban) : '—') + '</td>';
      body += '<td class="r mono">' + fmtE(accordato) + '</td>';
      body += '<td class="r mono">' + fmtE(utilizzato) + '</td>';
      body += '<td class="r mono">' + fmtE(disp) + '</td>';
      body += '</tr>';
    });

    // Subtotale banca
    body += '<tr class="sub">';
    body += '<td colspan="2"><strong>Subtotale ' + esc(ist.nome) + '</strong></td>';
    body += '<td class="r mono"><strong>' + fmtE(subTotAcc) + '</strong></td>';
    body += '<td class="r mono"><strong>' + fmtE(subTotUti) + '</strong></td>';
    body += '<td class="r mono"><strong>' + fmtE(subTotAcc - subTotUti) + '</strong></td>';
    body += '</tr>';

    body += '</tbody></table>';
  });

  // Totali generali
  body += '<div class="totale-box">';
  body += '<table class="totale">';
  body += '<tr><td>TOTALE COMPLESSIVO ACCORDATO</td><td class="r mono">' + fmtE(totAccordato) + '</td></tr>';
  body += '<tr><td>TOTALE UTILIZZATO</td><td class="r mono">' + fmtE(totUtilizzato) + '</td></tr>';
  body += '<tr class="netto"><td>DISPONIBILITÀ RESIDUA</td><td class="r mono">' + fmtE(totResiduo) + '</td></tr>';
  body += '</table>';
  body += '</div>';

  // Footer
  body += '<div class="footer">';
  body += 'Documento generato il ' + dataFmtBreve + ' dal sistema gestionale Phoenix Fuel.';
  body += '<br>Per dettagli su tassi, commissioni e condizioni contrattuali si rimanda alla documentazione bancaria originale.';
  body += '</div>';

  // CSS
  w.document.write('<!DOCTYPE html><html><head><title>Elenco Affidamenti — Phoenix Fuel</title>');
  w.document.write('<style>');
  w.document.write('body{font-family:Arial,sans-serif;padding:25px;font-size:11px;color:#222;max-width:800px;margin:0 auto}');
  w.document.write('.header{border-bottom:3px solid #26215C;padding-bottom:10px;margin-bottom:18px}');
  w.document.write('.azienda{font-size:18px;font-weight:bold;color:#26215C;letter-spacing:0.3px}');
  w.document.write('.meta{font-size:10px;color:#666;margin-top:3px}');
  w.document.write('h1{font-size:16px;color:#26215C;text-align:center;margin:10px 0;letter-spacing:1px}');
  w.document.write('.data-doc{text-align:center;font-size:11px;color:#666;margin-bottom:24px;font-style:italic}');
  w.document.write('h2{font-size:13px;color:#26215C;background:#f0eff8;padding:8px 12px;margin:18px 0 4px;border-left:4px solid #26215C}');
  w.document.write('.filiale{font-size:10px;color:#666;margin:2px 0 8px 4px;font-style:italic}');
  w.document.write('table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:6px}');
  w.document.write('th{background:#fafaf8;padding:7px 8px;text-align:left;border-bottom:1px solid #999;font-size:9px;text-transform:uppercase;letter-spacing:0.4px;color:#444}');
  w.document.write('th.r{text-align:right}');
  w.document.write('td{padding:6px 8px;border-bottom:0.5px solid #eee}');
  w.document.write('td.r{text-align:right}');
  w.document.write('td.mono{font-family:Courier New,monospace;font-weight:500}');
  w.document.write('td.iban{font-family:Courier New,monospace;font-size:9px;color:#666}');
  w.document.write('tr.sub td{background:#fafaf8;border-top:1px solid #999;border-bottom:1px solid #999;padding:7px 8px}');
  w.document.write('.totale-box{margin-top:25px;border:2px solid #26215C;border-radius:6px;overflow:hidden}');
  w.document.write('table.totale{margin:0;font-size:11px}');
  w.document.write('table.totale td{padding:9px 14px;border-bottom:1px solid #ddd;font-weight:500}');
  w.document.write('table.totale td:first-child{background:#26215C;color:#fff;text-transform:uppercase;letter-spacing:0.4px;font-size:10px}');
  w.document.write('table.totale tr.netto td{font-size:13px;font-weight:bold}');
  w.document.write('table.totale tr.netto td:first-child{background:#3a3478}');
  w.document.write('.footer{margin-top:30px;font-size:9px;color:#888;text-align:center;border-top:0.5px solid #ccc;padding-top:10px;line-height:1.5}');
  w.document.write('@page{size:A4;margin:1.5cm}');
  w.document.write('@media print { body { padding: 0 } }');
  w.document.write('</style></head><body>');
  w.document.write(body);
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(() => w.print(), 300);
}


// ═══════════════════════════════════════════════════════════════════════════
// TAB TIMELINE GANTT
// Mostra finanziamenti come barre temporali (data erogazione → scadenza).
// 2 viste: Anni (default, panoramica) e Mesi (dettaglio).
// Linea "OGGI" verticale + barra opaca pagato / piena residuo.
// 4 KPI: rata mensile equivalente, chiusura più vicina, più lontana, interessi residui.
// ═══════════════════════════════════════════════════════════════════════════
var _gantVistaMesi = false;     // false=anni, true=mesi
var _gantSoloAttivi = true;

async function renderBancheTimeline() {
  const cont = document.getElementById('banche-panel-timeline');
  if (!cont) return;

  // Carico le rate (riuso cache se disponibile)
  if (!_bancheRateCache) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">⏳ Caricamento timeline...</div>';
    const { data } = await sb.from('banche_finanziamenti_rate')
      .select('finanziamento_id, numero, data_scadenza, rata, quota_capitale, quota_interessi, residuo_capitale')
      .order('data_scadenza');
    _bancheRateCache = data || [];
  }

  const oggi = new Date();
  const oggiStr = oggi.toISOString().split('T')[0];

  // Filtro finanziamenti
  const finanziamenti = _bancheFinanziamenti.filter(f => {
    if (_gantSoloAttivi) return f.stato === 'attivo';
    return true;
  });

  if (!finanziamenti.length) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px">Nessun finanziamento da mostrare</div>';
    return;
  }

  // Sort: priorità banca (Intesa→MPS→BNL→BCC) → data erogazione asc
  finanziamenti.sort((a, b) => {
    const nomeA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
    const nomeB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
    const pA = _priorityBancaIstituto(nomeA);
    const pB = _priorityBancaIstituto(nomeB);
    if (pA !== pB) return pA - pB;
    if (nomeA !== nomeB) return nomeA.localeCompare(nomeB);
    return (a.data_erogazione || '').localeCompare(b.data_erogazione || '');
  });

  // Calcolo range temporale globale (anno_min → anno_max)
  let annoMin = 9999, annoMax = 0;
  finanziamenti.forEach(f => {
    if (f.data_erogazione) {
      const y = parseInt(f.data_erogazione.substring(0, 4));
      if (y < annoMin) annoMin = y;
    }
    const dataFine = _calcDataFine(f);
    if (dataFine) {
      const y = parseInt(dataFine.substring(0, 4));
      if (y > annoMax) annoMax = y;
    }
  });
  if (annoMin > annoMax) { annoMin = oggi.getFullYear() - 1; annoMax = oggi.getFullYear() + 5; }

  // ─── Calcolo KPI ───
  // Rata mensile equivalente = somma di tutte rate normalizzate a mensile (solo attivi)
  const rataMensTot = finanziamenti
    .filter(f => f.stato === 'attivo')
    .reduce((s, f) => s + _calcRataMensileEquivalente(f), 0);

  // Chiusura più vicina/più lontana (solo attivi)
  const attiviConFine = finanziamenti
    .filter(f => f.stato === 'attivo')
    .map(f => ({ f, fine: _calcDataFine(f) }))
    .filter(x => x.fine && x.fine > oggiStr)
    .sort((a, b) => a.fine.localeCompare(b.fine));
  const chiusVicina = attiviConFine[0];
  const chiusLontana = attiviConFine[attiviConFine.length - 1];

  // Interessi residui = somma quote_interessi di tutte le rate FUTURE
  const intResidui = _bancheRateCache
    .filter(r => r.data_scadenza > oggiStr)
    .filter(r => {
      const fin = finanziamenti.find(x => x.id === r.finanziamento_id);
      return fin && fin.stato === 'attivo';
    })
    .reduce((s, r) => s + Number(r.quota_interessi || 0), 0);

  // ─── HTML ───
  let html = '';

  // KPI grid
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:16px">';
  html += '<div class="kpi"><div class="kpi-label">Rata mensile equivalente</div><div class="kpi-value" style="color:#26215C;font-size:18px">' + fmtE(rataMensTot) + '</div></div>';
  if (chiusVicina) {
    const istNome = (_bancheIstituti.find(i => i.id === chiusVicina.f.istituto_id) || {}).nome || '';
    const meseAnno = new Date(chiusVicina.fine + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
    html += '<div class="kpi"><div class="kpi-label">Chiusura più vicina</div><div class="kpi-value" style="font-size:14px;color:#27500A">' + esc(istNome) + '</div><div style="font-size:11px;color:var(--text-muted);margin-top:1px">' + esc(chiusVicina.f.descrizione) + ' · ' + meseAnno + '</div></div>';
  } else {
    html += '<div class="kpi"><div class="kpi-label">Chiusura più vicina</div><div class="kpi-value" style="color:var(--text-hint)">—</div></div>';
  }
  if (chiusLontana && chiusLontana !== chiusVicina) {
    const istNome = (_bancheIstituti.find(i => i.id === chiusLontana.f.istituto_id) || {}).nome || '';
    const meseAnno = new Date(chiusLontana.fine + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
    html += '<div class="kpi"><div class="kpi-label">Chiusura più lontana</div><div class="kpi-value" style="font-size:14px;color:#A32D2D">' + esc(istNome) + '</div><div style="font-size:11px;color:var(--text-muted);margin-top:1px">' + esc(chiusLontana.f.descrizione) + ' · ' + meseAnno + '</div></div>';
  } else {
    html += '<div class="kpi"><div class="kpi-label">Chiusura più lontana</div><div class="kpi-value" style="color:var(--text-hint)">—</div></div>';
  }
  html += '<div class="kpi"><div class="kpi-label">Interessi residui da pagare</div><div class="kpi-value" style="color:#633806;font-size:18px">' + fmtE(intResidui) + '</div></div>';
  html += '</div>';

  // Toolbar (toggle vista + filtro + PDF)
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:8px">';
  html += '<div style="display:flex;gap:6px;align-items:center">';
  html += '<button onclick="_gantSwitchVista(false)" class="' + (!_gantVistaMesi ? 'btn-primary' : '') + '" style="font-size:12px;padding:7px 12px;' + (!_gantVistaMesi ? '' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;cursor:pointer') + '">📅 Anni</button>';
  html += '<button onclick="_gantSwitchVista(true)" class="' + (_gantVistaMesi ? 'btn-primary' : '') + '" style="font-size:12px;padding:7px 12px;' + (_gantVistaMesi ? '' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;cursor:pointer') + '">🗓 Mesi</button>';
  html += '<label style="display:flex;align-items:center;gap:6px;font-size:12px;cursor:pointer;margin-left:14px">';
  html += '<input type="checkbox" ' + (_gantSoloAttivi ? 'checked' : '') + ' onchange="_gantToggleAttivi(this.checked)"> Solo attivi';
  html += '</label>';
  html += '</div>';
  html += '<button onclick="stampaTimeline()" style="background:#1a1a18;color:#FAC775;border:0;border-radius:6px;padding:7px 14px;font-size:12px;cursor:pointer">📄 PDF Timeline</button>';
  html += '</div>';

  // Gantt
  html += _renderGanttBars(finanziamenti, annoMin, annoMax, oggi);

  // Pannello stato finanziamenti (% rimborsata) sotto il Gantt
  html += _renderPannelloProgressoFinanziamenti(finanziamenti, oggiStr);

  cont.innerHTML = html;
}

// ═══ PANNELLO STATO FINANZIAMENTI % RIMBORSATA ═════════════════════════════
// Barre di progresso per i finanziamenti visualizzati (rispetta toggle Solo attivi)
// + KPI globale "onorati nel tempo" in fondo (sempre su TUTTI i finanziamenti)
// Totali rate = capitale + interessi
function _renderPannelloProgressoFinanziamenti(finanziamenti, oggiStr) {
  if (!finanziamenti.length) return '';

  let html = '';
  html += '<div style="margin-top:18px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:16px">';

  // ─── DETTAGLIO PER FINANZIAMENTO (rispetta filtro toggle) ───
  html += '<div style="font-size:13px;font-weight:600;margin-bottom:14px;color:var(--text)">Stato finanziamenti — % rimborsata su accordato (capitale + interessi)</div>';
  html += '<div style="display:grid;gap:14px">';

  // Calcoli totali (sui visualizzati)
  let totAccordato = 0, totPagato = 0;

  finanziamenti.forEach(f => {
    // Tutte le rate del finanziamento
    const rateFin = (_bancheRateCache || []).filter(r => r.finanziamento_id === f.id);

    let accordato = 0, pagato = 0;
    if (!rateFin.length) {
      // Nessun piano: per estinti consideriamo capitale pagato; per attivi salta
      if (f.stato === 'estinto') {
        accordato = Number(f.capitale || 0);
        pagato = accordato;
      } else {
        return;
      }
    } else {
      accordato = rateFin.reduce((s, r) => s + Number(r.rata || 0), 0);
      pagato = rateFin
        .filter(r => r.data_scadenza <= oggiStr)
        .reduce((s, r) => s + Number(r.rata || 0), 0);
      if (f.stato === 'estinto') pagato = accordato; // forza 100% per estinti
    }

    const residuo = accordato - pagato;
    const pct = accordato > 0 ? (pagato / accordato * 100) : 0;
    const colore = _coloreFinanziamento(f);
    const istNome = (_bancheIstituti.find(i => i.id === f.istituto_id) || {}).nome || '—';
    const dataFine = _calcDataFine(f);
    const fineFmt = dataFine
      ? new Date(dataFine + 'T12:00:00').toLocaleDateString('it-IT', { month: 'short', year: 'numeric' })
      : '—';
    const isEstinto = f.stato === 'estinto';

    totAccordato += accordato;
    totPagato += pagato;

    html += '<div' + (isEstinto ? ' style="opacity:0.75"' : '') + '>';
    // Riga superiore: descrizione + badge estinto + % rimborsata
    html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">';
    html += '<div>';
    html += '<span style="font-size:13px;font-weight:500;color:var(--text)">' + esc(f.descrizione) + '</span>';
    if (isEstinto) html += '<span style="font-size:9px;background:#27500A;color:#fff;padding:1px 6px;border-radius:3px;margin-left:6px;text-transform:uppercase;letter-spacing:0.3px;font-weight:600">Estinto</span>';
    html += '<span style="font-size:11px;color:var(--text-muted);margin-left:8px">' + esc(istNome) + ' · fine ' + fineFmt + '</span>';
    html += '</div>';
    html += '<span style="font-size:13px;font-weight:600;color:' + colore + ';font-family:var(--font-mono)">' + pct.toFixed(0) + '%</span>';
    html += '</div>';
    // Barra progresso
    html += '<div style="background:var(--bg);border-radius:6px;height:18px;overflow:hidden">';
    html += '<div style="width:' + Math.min(pct, 100) + '%;height:100%;background:' + colore + ';transition:width 0.4s"></div>';
    html += '</div>';
    // Riga inferiore: 3 cifre
    html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:5px;font-family:var(--font-mono)">';
    html += '<span>Accordato ' + fmtE(accordato) + '</span>';
    html += '<span>Pagato ' + fmtE(pagato) + '</span>';
    html += '<span>Residuo ' + fmtE(residuo) + '</span>';
    html += '</div>';
    html += '</div>';
  });

  html += '</div>'; // fine grid

  // Riga TOTALE (sui finanziamenti visualizzati)
  const pctTot = totAccordato > 0 ? (totPagato / totAccordato * 100) : 0;
  html += '<div style="margin-top:16px;padding-top:14px;border-top:0.5px solid var(--border)">';
  html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">';
  html += '<span style="font-size:13px;font-weight:600;color:var(--text)">TOTALE ' + (_gantSoloAttivi ? '(solo attivi)' : '(tutti)') + '</span>';
  html += '<span style="font-size:14px;font-weight:600;color:var(--text);font-family:var(--font-mono)">' + pctTot.toFixed(0) + '%</span>';
  html += '</div>';
  html += '<div style="background:var(--bg);border-radius:6px;height:22px;overflow:hidden">';
  html += '<div style="width:' + Math.min(pctTot, 100) + '%;height:100%;background:#1a1a18;transition:width 0.4s"></div>';
  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text-muted);margin-top:5px;font-family:var(--font-mono)">';
  html += '<span>Accordato ' + fmtE(totAccordato) + '</span>';
  html += '<span>Pagato ' + fmtE(totPagato) + '</span>';
  html += '<span>Residuo ' + fmtE(totAccordato - totPagato) + '</span>';
  html += '</div>';
  html += '</div>';

  // ─── KPI GLOBALE PORTAFOGLIO STORICO (sempre su TUTTI i finanziamenti) ───
  // Mostra: totali accesi nel tempo + onorati (chiusi) con valore e percentuali
  const tutti = _bancheFinanziamenti || [];
  if (tutti.length > 0) {
    const estintiAll = tutti.filter(f => f.stato === 'estinto');
    const nTot = tutti.length;
    const nEst = estintiAll.length;
    const pctNum = nTot > 0 ? (nEst / nTot * 100) : 0;
    const valTot = tutti.reduce((s, f) => s + Number(f.capitale || 0), 0);
    const valEst = estintiAll.reduce((s, f) => s + Number(f.capitale || 0), 0);
    const pctVal = valTot > 0 ? (valEst / valTot * 100) : 0;

    html += '<div style="margin-top:18px;padding:14px 16px;background:linear-gradient(135deg,#27500A 0%,#3B6D11 100%);color:#fff;border-radius:10px">';
    html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.85;margin-bottom:12px">📊 Portafoglio finanziamenti — storico complessivo</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px 18px">';
    // Numero
    html += '<div>';
    html += '<div style="font-size:10px;opacity:0.85;margin-bottom:3px">Accesi nel tempo</div>';
    html += '<div style="font-size:22px;font-weight:600;font-family:var(--font-mono);line-height:1.1">' + nTot + '</div>';
    html += '</div>';
    html += '<div>';
    html += '<div style="font-size:10px;opacity:0.85;margin-bottom:3px">Di cui chiusi</div>';
    html += '<div style="font-size:22px;font-weight:600;font-family:var(--font-mono);line-height:1.1">' + nEst + ' <span style="font-size:13px;opacity:0.85;font-weight:500">(' + pctNum.toFixed(0) + '%)</span></div>';
    html += '</div>';
    // Valore
    html += '<div>';
    html += '<div style="font-size:10px;opacity:0.85;margin-bottom:3px">Valore totale finanziato</div>';
    html += '<div style="font-size:18px;font-weight:600;font-family:var(--font-mono);line-height:1.1">' + fmtE(valTot) + '</div>';
    html += '</div>';
    html += '<div>';
    html += '<div style="font-size:10px;opacity:0.85;margin-bottom:3px">Valore onorato</div>';
    html += '<div style="font-size:18px;font-weight:600;font-family:var(--font-mono);line-height:1.1">' + fmtE(valEst) + ' <span style="font-size:12px;opacity:0.85;font-weight:500">(' + pctVal.toFixed(0) + '%)</span></div>';
    html += '</div>';
    html += '</div>';
    // Doppia barra
    html += '<div style="margin-top:12px;display:flex;gap:10px">';
    html += '<div style="flex:1"><div style="font-size:9px;opacity:0.85;margin-bottom:3px">Per numero (' + nEst + '/' + nTot + ')</div><div style="background:rgba(255,255,255,0.2);border-radius:5px;height:6px;overflow:hidden"><div style="width:' + pctNum + '%;height:100%;background:#EAF3DE"></div></div></div>';
    html += '<div style="flex:1"><div style="font-size:9px;opacity:0.85;margin-bottom:3px">Per valore (' + pctVal.toFixed(0) + '% onorato)</div><div style="background:rgba(255,255,255,0.2);border-radius:5px;height:6px;overflow:hidden"><div style="width:' + pctVal + '%;height:100%;background:#EAF3DE"></div></div></div>';
    html += '</div>';
    html += '</div>';
  }

  html += '</div>'; // fine card
  return html;
}

function _renderGanttBars(finanziamenti, annoMin, annoMax, oggi) {
  const oggiStr = oggi.toISOString().split('T')[0];
  const totUnita = _gantVistaMesi ? (annoMax - annoMin + 1) * 12 : (annoMax - annoMin + 1);
  const labelLeftWidth = 220; // colonna sinistra finalità
  const unitWidth = _gantVistaMesi ? 32 : 80; // larghezza per mese / per anno
  const ganttWidth = totUnita * unitWidth;

  // Posizione "OGGI" in pixel
  let oggiX = 0;
  if (_gantVistaMesi) {
    const monthsFromStart = (oggi.getFullYear() - annoMin) * 12 + oggi.getMonth() + (oggi.getDate() / 30);
    oggiX = monthsFromStart * unitWidth;
  } else {
    const yearsFromStart = (oggi.getFullYear() - annoMin) + (oggi.getMonth() / 12);
    oggiX = yearsFromStart * unitWidth;
  }

  let html = '';
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;overflow:hidden">';
  html += '<div style="overflow-x:auto;position:relative">';

  // Header asse temporale
  html += '<div style="display:flex;border-bottom:1px solid var(--border);background:var(--bg);position:sticky;top:0;z-index:2">';
  html += '<div style="min-width:' + labelLeftWidth + 'px;width:' + labelLeftWidth + 'px;padding:8px 10px;font-size:10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;border-right:1px solid var(--border);background:var(--bg);position:sticky;left:0;z-index:1">Finanziamento</div>';
  html += '<div style="display:flex;flex:1;min-width:' + ganttWidth + 'px">';
  for (let y = annoMin; y <= annoMax; y++) {
    if (_gantVistaMesi) {
      // 12 slot mensili sotto un'etichetta anno
      html += '<div style="width:' + (12 * unitWidth) + 'px;border-right:1px solid var(--border)">';
      html += '<div style="text-align:center;font-size:11px;font-weight:600;padding:4px 0;border-bottom:0.5px solid var(--border);background:var(--bg)">' + y + '</div>';
      html += '<div style="display:flex">';
      ['G','F','M','A','M','G','L','A','S','O','N','D'].forEach(m => {
        html += '<div style="width:' + unitWidth + 'px;text-align:center;font-size:9px;color:var(--text-hint);padding:2px 0;border-right:0.5px solid #f0f0ee">' + m + '</div>';
      });
      html += '</div>';
      html += '</div>';
    } else {
      html += '<div style="width:' + unitWidth + 'px;text-align:center;font-size:11px;font-weight:600;padding:6px 0;border-right:1px solid var(--border)">' + y + '</div>';
    }
  }
  html += '</div>';
  html += '</div>';

  // Body righe finanziamenti
  html += '<div style="position:relative">';

  // Linea OGGI
  html += '<div style="position:absolute;left:' + (labelLeftWidth + oggiX) + 'px;top:0;bottom:0;width:2px;background:#D85A30;z-index:1;pointer-events:none">';
  html += '<div style="position:absolute;top:-1px;left:-22px;background:#D85A30;color:#fff;font-size:9px;padding:2px 6px;border-radius:3px;font-weight:600;white-space:nowrap">OGGI</div>';
  html += '</div>';

  finanziamenti.forEach(f => {
    const dataInizio = f.data_erogazione;
    const dataFine = _calcDataFine(f);
    if (!dataInizio || !dataFine) return;

    // Posizioni in pixel
    const startX = _calcXFromDate(dataInizio, annoMin);
    const endX = _calcXFromDate(dataFine, annoMin);
    const oggiClampX = Math.max(startX, Math.min(endX, oggiX));
    const widthPagato = oggiClampX - startX;
    const widthResiduo = endX - oggiClampX;

    const istNome = (_bancheIstituti.find(i => i.id === f.istituto_id) || {}).nome || '—';
    const isEstinto = f.stato === 'estinto';
    const colorePieno = isEstinto ? '#999' : _coloreFinanziamento(f);
    const coloreOpaco = isEstinto ? '#ccc' : _coloreFinanziamento(f) + '50'; // 50 = alpha

    // Calcolo residuo capitale "oggi" dalle rate
    const rateFin = (_bancheRateCache || []).filter(r => r.finanziamento_id === f.id);
    let residuoOggi = Number(f.capitale || 0);
    if (rateFin.length) {
      // Prendo la rata più recente già scaduta (pagata) → suo residuo_capitale è il debito a oggi
      const pagate = rateFin.filter(r => r.data_scadenza <= oggiStr);
      if (pagate.length) {
        residuoOggi = Number(pagate[pagate.length - 1].residuo_capitale || 0);
      }
      // Se nessuna pagata ancora (futuro), residuo = capitale iniziale
    }
    if (isEstinto) residuoOggi = 0;

    html += '<div style="display:flex;border-bottom:0.5px solid var(--border);min-height:42px;align-items:center;' + (isEstinto ? 'opacity:0.55' : '') + '">';
    // Label sinistra
    html += '<div style="min-width:' + labelLeftWidth + 'px;width:' + labelLeftWidth + 'px;padding:8px 10px;border-right:1px solid var(--border);background:var(--bg-card);position:sticky;left:0;z-index:1">';
    html += '<div style="font-size:11px;font-weight:600">' + esc(f.descrizione) + '</div>';
    html += '<div style="font-size:9px;color:var(--text-muted)">' + esc(istNome) + '</div>';
    html += '</div>';
    // Area gantt
    html += '<div style="flex:1;min-width:' + ganttWidth + 'px;height:42px;position:relative">';
    // Barra pagato (opaca)
    if (widthPagato > 0) {
      html += '<div title="Pagato: dal ' + fmtD(dataInizio) + '" style="position:absolute;left:' + startX + 'px;top:11px;width:' + widthPagato + 'px;height:20px;background:' + coloreOpaco + ';border-radius:3px"></div>';
    }
    // Barra residuo (piena)
    if (widthResiduo > 0) {
      html += '<div title="Residuo: fino al ' + fmtD(dataFine) + '" style="position:absolute;left:' + oggiClampX + 'px;top:11px;width:' + widthResiduo + 'px;height:20px;background:' + colorePieno + ';border-radius:3px;display:flex;align-items:center;padding:0 6px;color:#fff;font-size:10px;font-weight:600;overflow:hidden;white-space:nowrap">';
      // Mostra residuo se c'è spazio
      if (widthResiduo > 80) {
        html += 'Residuo ' + fmtE(residuoOggi);
      }
      html += '</div>';
    }
    html += '</div>';
    html += '</div>';
  });

  html += '</div>'; // fine relative wrapper
  html += '</div>'; // fine overflow-x
  html += '</div>'; // fine card

  // Legenda
  html += '<div style="margin-top:8px;font-size:10px;color:var(--text-hint);display:flex;gap:14px;flex-wrap:wrap">';
  html += '<div><span style="display:inline-block;width:14px;height:8px;background:#26215C50;vertical-align:middle;border-radius:2px"></span> Pagato</div>';
  html += '<div><span style="display:inline-block;width:14px;height:8px;background:#26215C;vertical-align:middle;border-radius:2px"></span> Residuo da pagare</div>';
  html += '<div><span style="display:inline-block;width:2px;height:10px;background:#D85A30;vertical-align:middle"></span> Oggi</div>';
  html += '</div>';

  return html;
}

function _calcXFromDate(dateStr, annoMin) {
  const unitWidth = _gantVistaMesi ? 32 : 80;
  const d = new Date(dateStr + 'T12:00:00');
  if (_gantVistaMesi) {
    const monthsFromStart = (d.getFullYear() - annoMin) * 12 + d.getMonth() + (d.getDate() / 30);
    return monthsFromStart * unitWidth;
  } else {
    const yearsFromStart = (d.getFullYear() - annoMin) + (d.getMonth() / 12);
    return yearsFromStart * unitWidth;
  }
}

function _coloreFinanziamento(f) {
  // Colore deterministico basato su id (così le barre sono sempre uguali)
  const colori = ['#26215C', '#27500A', '#0C447C', '#791F1F', '#633806', '#A32D2D'];
  if (!f.id) return colori[0];
  let h = 0;
  for (let i = 0; i < f.id.length; i++) h = (h * 31 + f.id.charCodeAt(i)) | 0;
  return colori[Math.abs(h) % colori.length];
}

function _gantSwitchVista(mesi) {
  _gantVistaMesi = !!mesi;
  renderBancheTimeline();
}

function _gantToggleAttivi(checked) {
  _gantSoloAttivi = !!checked;
  renderBancheTimeline();
}

function stampaTimeline() {
  const cont = document.getElementById('banche-panel-timeline');
  if (!cont) return;
  const dataFmt = new Date().toLocaleDateString('it-IT');
  const w = window.open('', '_blank');
  if (!w) { toast('⚠ Popup bloccato dal browser'); return; }
  w.document.write('<!DOCTYPE html><html><head><title>Timeline finanziamenti — Phoenix Fuel</title>');
  w.document.write('<style>');
  w.document.write('body{font-family:Arial,sans-serif;padding:15px;color:#222}');
  w.document.write('h1{font-size:16px;color:#26215C;margin:0 0 6px}');
  w.document.write('.meta{font-size:10px;color:#666;margin-bottom:14px}');
  w.document.write('.kpi-row{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px}');
  w.document.write('.kpi-row > div{padding:8px 12px;border:1px solid #ccc;border-radius:6px;background:#fafafa}');
  w.document.write('.kpi-row .kpi-label{font-size:9px;color:#666;text-transform:uppercase}');
  w.document.write('.kpi-row .kpi-value{font-size:13px;font-weight:bold;margin-top:2px}');
  w.document.write('@page{size:A3 landscape;margin:8mm}');
  w.document.write('@media print { body { padding:0 } }');
  w.document.write('</style></head><body>');
  w.document.write('<h1>📊 Timeline finanziamenti — Phoenix Fuel S.r.l.</h1>');
  w.document.write('<div class="meta">Generato il ' + dataFmt + ' · Vista ' + (_gantVistaMesi ? 'mensile' : 'annuale') + '</div>');
  // Estraggo KPI e gantt dal DOM corrente
  const kpiHtml = cont.querySelector('div[style*="grid-template-columns:repeat(auto-fit,minmax(180px,1fr))"]');
  if (kpiHtml) w.document.write(kpiHtml.outerHTML);
  // Gantt
  const ganttContainers = cont.querySelectorAll('div[style*="background:var(--bg-card)"]');
  ganttContainers.forEach(g => w.document.write(g.outerHTML));
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ═══════════════════════════════════════════════════════════════════════════
// TAB SITUAZIONE — Saldi giornalieri editabili (autosave su blur)
// Replica del foglio Excel "Situazione Banche al GG/MM" ma con storico in DB.
// Pannelli spostabili (regola pannelli, 27/04).
// ═══════════════════════════════════════════════════════════════════════════
var _situazioneDataCorrente = null; // 'YYYY-MM-DD' del giorno mostrato
var _situazioneSaldi = {};          // {conto_id: {saldo_contabile, saldo_disponibile, id, note}}
var _situazioneStorico = [];        // Array degli ultimi 60 giorni di saldi (tutti i conti)

async function renderBancheSituazione() {
  const cont = document.getElementById('banche-panel-situazione');
  if (!cont) return;

  // Init data corrente = oggi
  if (!_situazioneDataCorrente) {
    _situazioneDataCorrente = new Date().toISOString().split('T')[0];
  }

  cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">⏳ Caricamento saldi...</div>';

  // Carica conti + affidamenti se non già in cache
  if (!_bancheConti.length || !_bancheIstituti.length || !_bancheAffidamenti.length) {
    const [istRes, ccRes, affRes] = await Promise.all([
      sb.from('banche_istituti').select('*').order('nome'),
      sb.from('banche_conti').select('*'),
      sb.from('banche_affidamenti').select('*')
    ]);
    _bancheIstituti = istRes.data || [];
    _bancheConti = ccRes.data || [];
    _bancheAffidamenti = affRes.data || [];
  }

  // Carica storico 90 giorni in UNA SOLA query (include il giorno corrente).
  // I saldi del giorno corrente vengono filtrati dallo storico — niente seconda query.
  // Popola anche la cache _ultimiSaldiPerConto per Istituti/Affidamenti.
  const dataLimite = new Date();
  dataLimite.setDate(dataLimite.getDate() - 90);
  const dataLimiteStr = dataLimite.toISOString().split('T')[0];

  let storicoData = [];
  try {
    const { data, error } = await sb.from('banche_saldi_giornalieri')
      .select('*')
      .gte('data', dataLimiteStr)
      .order('data', { ascending: false });
    if (error) {
      cont.innerHTML = '<div style="padding:30px;text-align:center;color:#A32D2D">❌ Errore: ' + esc(error.message) + '</div>';
      return;
    }
    storicoData = data || [];
  } catch (e) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:#A32D2D">❌ Errore: ' + esc(e.message || e) + '</div>';
    return;
  }

  // Storico globale (ultimi 90 giorni)
  _situazioneStorico = storicoData;

  // Saldi del giorno corrente: filtra dallo storico (no nuova query)
  _situazioneSaldi = {};
  storicoData
    .filter(s => s.data === _situazioneDataCorrente)
    .forEach(s => { _situazioneSaldi[s.conto_id] = s; });

  // Popola cache globale ultimi saldi per conto (per Istituti/Affidamenti senza nuova query)
  _ultimiSaldiPerConto = {};
  storicoData.forEach(s => {
    if (!_ultimiSaldiPerConto[s.conto_id]) _ultimiSaldiPerConto[s.conto_id] = s;
  });

  // Registra pannelli (regola spostabili, 27/04)
  _registerPanels('situazione', ['saldi', 'riepilogo', 'storico'], renderBancheSituazione);

  // ─── HEADER (date picker + frecce + bottoni) ───
  const dataObj = new Date(_situazioneDataCorrente + 'T12:00:00');
  const dataLabel = dataObj.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  let html = '';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;flex-wrap:wrap;gap:10px">';
  html += '<div style="display:flex;align-items:center;gap:8px">';
  html += '<button onclick="_situazioneSpostaGiorno(-1)" title="Giorno precedente" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;width:32px;height:32px;font-size:13px;cursor:pointer;color:var(--text)">◀</button>';
  html += '<input type="date" id="situazione-date" value="' + _situazioneDataCorrente + '" onchange="_situazioneCambiaData(this.value)" style="font-size:13px;padding:7px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-family:var(--font-mono)">';
  html += '<button onclick="_situazioneSpostaGiorno(1)" title="Giorno successivo" style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;width:32px;height:32px;font-size:13px;cursor:pointer;color:var(--text)">▶</button>';
  html += '<span style="font-size:12px;color:var(--text-muted);margin-left:8px;text-transform:capitalize">' + dataLabel + '</span>';
  html += '</div>';
  html += '<div style="display:flex;gap:6px">';
  html += '<button onclick="_situazioneVaiOggi()" style="background:var(--bg);border:0.5px solid var(--border);color:var(--text);border-radius:6px;padding:7px 12px;font-size:12px;cursor:pointer">Oggi</button>';
  html += '<button onclick="stampaSituazionePDF()" style="background:#1a1a18;color:#FAC775;border:0;border-radius:6px;padding:7px 12px;font-size:12px;cursor:pointer">📄 PDF</button>';
  html += '</div>';
  html += '</div>';

  // ─── PANNELLI ───
  const saldiPanel = _renderPanelSituazioneSaldi();
  const riepilogoPanel = _renderPanelSituazioneRiepilogo();
  const storicoPanel = _renderPanelSituazioneStorico();

  const panels = { 'saldi': saldiPanel, 'riepilogo': riepilogoPanel, 'storico': storicoPanel };
  const order = _getPanelOrder('situazione');

  order.forEach(id => {
    if (panels[id]) html += _wrapPanel('situazione', id, panels[id]);
  });

  cont.innerHTML = html;
}

// ─── HELPER: priorità ordinamento banche (Intesa, MPS, BNL, BCC, altro) ────
function _priorityBancaIstituto(nome) {
  const s = (nome || '').toUpperCase();
  if (s.includes('INTESA')) return 1;
  if (s.includes('MPS') || s.includes('MONTE')) return 2;
  if (s.includes('BNL') || s.includes('BNP')) return 3;
  if (s.includes('BCC') || s.includes('CREDITO COOPERATIVO')) return 4;
  return 99;
}

// ─── HELPER: calcola fidi cassa indicizzati per conto_id ────────────────────
function _getFidiCassaPerConto() {
  const fidi = {};
  _bancheAffidamenti.forEach(a => {
    if (a.tipo === 'cassa' && a.stato === 'attivo' && a.conto_id) {
      if (!fidi[a.conto_id] || Number(a.importo_accordato) > Number(fidi[a.conto_id].accordato)) {
        fidi[a.conto_id] = { accordato: Number(a.importo_accordato || 0) };
      }
    }
  });
  return fidi;
}

// ─── HELPER: ordina conti con priorità custom ───────────────────────────────
function _sortContiPriorita() {
  return _bancheConti.slice().sort((a, b) => {
    const istA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
    const istB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
    const pA = _priorityBancaIstituto(istA);
    const pB = _priorityBancaIstituto(istB);
    if (pA !== pB) return pA - pB;
    if (istA !== istB) return istA.localeCompare(istB);
    return (a.numero_conto || '').localeCompare(b.numero_conto || '');
  });
}

// ═══ PANNELLO SALDI ═════════════════════════════════════════════════════════
// Colonne: Banca | Fido cassa | Saldo contabile | Saldo disponibile | Residuo
// Valori grandi (14px), grassetto, rossi se negativi, verdi se positivi.
function _renderPanelSituazioneSaldi() {
  const fidiCassa = _getFidiCassaPerConto();
  const contiSorted = _sortContiPriorita();

  // Diagnostica caricamento: confronta N record caricati vs N conti
  const nSaldiCaricati = Object.keys(_situazioneSaldi).length;
  const nConti = contiSorted.length;
  // Verifica match conto_id: quanti dei saldi caricati hanno un conto_id che esiste in _bancheConti
  const contiIds = new Set(contiSorted.map(c => c.id));
  const nSaldiAbbianciati = Object.keys(_situazioneSaldi).filter(id => contiIds.has(id)).length;
  const nSaldiOrfani = nSaldiCaricati - nSaldiAbbianciati;

  // Diagnostica saldi: dati disponibili in _situazioneSaldi se serve ispezionarli da console.

  // Patch 30/04: stato conferma giornata corrente (true se almeno un record è confermato)
  const giornataConfermata = Object.values(_situazioneSaldi).some(s => s.confermato === true);

  // Totali aggregati
  let totContabile = 0, totDisponibile = 0, totFido = 0, totUtilizzato = 0, totResiduo = 0, totAssegni = 0;

  let html = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';

  // Banner sentinella: giorni non confermati negli ultimi 10
  const sentinellaHtml = _situazioneRenderSentinella();
  if (sentinellaHtml) html += sentinellaHtml;

  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text)">💰 Saldi conti correnti</div>';
  // Indicatore di caricamento (solo se non è il giorno corrente vuoto, per non disturbare)
  let pillHtml = '';
  if (giornataConfermata) {
    pillHtml = '<div style="font-size:10px;color:#27500A;background:#EAF3DE;padding:3px 9px;border-radius:5px;font-weight:600">✓ Giornata archiviata</div>';
  } else if (nSaldiCaricati > 0) {
    pillHtml = '<div style="font-size:10px;color:#854F0B;background:#FAEEDA;padding:3px 9px;border-radius:5px;font-weight:600" title="Dati in bozza, non ancora archiviati nello storico">● Bozza · ' + nSaldiCaricati + ' saldi</div>';
  } else {
    pillHtml = '<div style="font-size:10px;color:var(--text-hint);font-weight:400">Nessun saldo per questo giorno</div>';
  }
  html += pillHtml;
  html += '</div>';

  // Banner di warning se ci sono record orfani (conto_id non corrisponde)
  if (nSaldiOrfani > 0) {
    html += '<div style="background:#FAEEDA;border:0.5px solid #BA7517;border-radius:6px;padding:8px 12px;margin-bottom:12px;font-size:11px;color:#633806">';
    html += '⚠ <b>' + nSaldiOrfani + ' saldi caricati ma non visualizzabili</b>: i loro <code>conto_id</code> non corrispondono a nessun conto attualmente in anagrafica. Probabilmente i conti sono stati eliminati/ricreati. Vedi console (F12) per dettagli.';
    html += '</div>';
  }

  // Patch 30/04: avviso modifica giornata già confermata
  if (giornataConfermata) {
    html += '<div style="background:#EAF3DE;border-left:3px solid #27500A;border-radius:0 6px 6px 0;padding:8px 12px;margin-bottom:12px;font-size:11px;color:#27500A">';
    html += '✓ Questa giornata è stata <b>archiviata</b>. Le celle restano editabili: ogni modifica viene tracciata.';
    html += '</div>';
  }

  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">';
  html += '<thead><tr style="background:var(--bg);border-bottom:0.5px solid var(--border)">';
  // Patch 30/04: aggiunta colonna "Assegni n.v." tra "Fido cassa" e "Saldo contabile"
  const headers = [
    { lbl: 'Banca / Conto', align: 'left' },
    { lbl: 'Fido cassa', align: 'right' },
    { lbl: '📋 Assegni n.v.', align: 'right', isNew: true },
    { lbl: 'Saldo contabile', align: 'right' },
    { lbl: 'Saldo disponibile', align: 'right' },
    { lbl: 'Residuo fido', align: 'right' }
  ];
  headers.forEach(h => {
    const extraStyle = h.isNew ? ';color:#72243E' : '';
    html += '<th style="text-align:' + h.align + ';padding:10px 8px;font-weight:600;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.3px' + extraStyle + '">' + h.lbl + '</th>';
  });
  html += '</tr></thead><tbody>';

  contiSorted.forEach(c => {
    const istNome = (_bancheIstituti.find(i => i.id === c.istituto_id) || {}).nome || '—';
    const saldo = _situazioneSaldi[c.id] || { saldo_contabile: null, saldo_disponibile: null, assegni_non_valuta: null, saldo_disponibile_override: false };
    const sCont = (saldo.saldo_contabile !== null && saldo.saldo_contabile !== undefined) ? Number(saldo.saldo_contabile) : null;
    const sDisp = (saldo.saldo_disponibile !== null && saldo.saldo_disponibile !== undefined) ? Number(saldo.saldo_disponibile) : null;
    const assegni = (saldo.assegni_non_valuta !== null && saldo.assegni_non_valuta !== undefined) ? Number(saldo.assegni_non_valuta) : 0;
    const isOverride = saldo.saldo_disponibile_override === true;
    const fido = fidiCassa[c.id] ? Number(fidiCassa[c.id].accordato) : 0;

    // Calcoli derivati
    const utilizzato = (sCont !== null && sCont < 0) ? Math.abs(sCont) : 0;
    const residuo = fido > 0 ? Math.max(0, fido - utilizzato) : 0;
    const pctResiduo = fido > 0 ? (residuo / fido * 100) : 0;

    // Patch 30/04: saldo disponibile calcolato (formula concordata 30/04 con Rinaldo)
    // = saldo contabile + fido cassa - assegni n.v.
    // Nota: se sCont è null, non posso calcolare; mostro placeholder.
    const sDispCalc = (sCont !== null) ? (sCont + fido - assegni) : null;

    // Patch 30/04 (b-fix): saldo disponibile EFFETTIVO mostrato in UI
    //   - Se override=true → mostra il valore in DB (utente l'ha sovrascritto a mano)
    //   - Altrimenti → mostra SEMPRE il calcolato (anche se in DB c'è un valore vecchio
    //     residuo dalla logica pre-patch che salvava 0 di placeholder)
    const sDispEffettivo = isOverride
      ? sDisp
      : (sDispCalc !== null ? sDispCalc : sDisp);

    if (sCont !== null) totContabile += sCont;
    if (sDispEffettivo !== null) totDisponibile += sDispEffettivo;
    totFido += fido;
    totUtilizzato += utilizzato;
    totResiduo += residuo;
    totAssegni += assegni;

    html += '<tr style="border-bottom:0.5px solid var(--border)">';

    // Col 1: Banca / Conto
    html += '<td style="padding:10px 8px;font-weight:500;font-size:13px">' + esc(istNome);
    if (c.numero_conto) html += ' <span style="color:var(--text-hint);font-family:var(--font-mono);font-size:10px;font-weight:400">N. ' + esc(c.numero_conto) + '</span>';
    html += '</td>';

    // Col 2: Fido cassa (read-only, allineato a destra, mono)
    html += '<td style="padding:10px 8px;text-align:right;font-family:var(--font-mono);font-size:13px;font-weight:500;color:var(--text)">';
    html += fido > 0 ? fmtE(fido) : '<span style="color:var(--text-hint);font-weight:400">—</span>';
    html += '</td>';

    // Col 3 NEW: Assegni non in valuta (editable)
    const valAss = assegni > 0 ? assegni.toFixed(2).replace('.', ',') : '';
    html += '<td style="padding:5px 4px;text-align:right">';
    html += '<input type="text" value="' + valAss + '" placeholder="—" data-conto-id="' + c.id + '" data-campo="assegni_non_valuta" onblur="_situazioneSalvaCella(this)" onkeydown="if(event.key===\'Enter\')this.blur()" style="width:100%;text-align:right;padding:8px 10px;border:0.5px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:13px;font-weight:600;background:#FBEAF0;color:#72243E" title="Assegni emessi ma non ancora in valuta (riducono il saldo disponibile)">';
    html += '</td>';

    // Col 4: Saldo contabile (editable, BIG, BOLD, RED if neg, GREEN if pos)
    const valCont = sCont !== null ? sCont.toFixed(2).replace('.', ',') : '';
    const colorCont = sCont === null ? 'var(--text)' : (sCont < 0 ? '#A32D2D' : (sCont > 0 ? '#27500A' : 'var(--text)'));
    html += '<td style="padding:5px 4px;text-align:right">';
    html += '<input type="text" value="' + valCont + '" placeholder="—" data-conto-id="' + c.id + '" data-campo="saldo_contabile" onblur="_situazioneSalvaCella(this)" onkeydown="if(event.key===\'Enter\')this.blur()" style="width:100%;text-align:right;padding:8px 10px;border:0.5px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:14px;font-weight:700;background:#FFFCEB;color:' + colorCont + '">';
    html += '</td>';

    // Col 5: Saldo disponibile (editable, default = calcolato; popup se override)
    // Patch 30/04 (b-fix): mostra sDispEffettivo (calcolato se override=false, valore in DB se override=true)
    const valDispShown = sDispEffettivo !== null ? sDispEffettivo.toFixed(2).replace('.', ',') : '';
    const colorDispBase = (() => {
      const v = sDispEffettivo;
      if (v === null) return 'var(--text)';
      return v < 0 ? '#A32D2D' : (v > 0 ? '#27500A' : 'var(--text)');
    })();
    // Sfondo: verde tenue se calcolato puro; arancione se override manuale tracciato
    const bgDisp = isOverride ? '#FAEEDA' : '#F0F8E0';
    const overrideTag = isOverride ? '<div style="font-size:9px;color:#854F0B;font-weight:500;margin-top:2px;text-align:right;padding-right:4px">⚠ override manuale</div>' : '';
    html += '<td style="padding:5px 4px;text-align:right">';
    html += '<input type="text" value="' + valDispShown + '" placeholder="—" data-conto-id="' + c.id + '" data-campo="saldo_disponibile" onblur="_situazioneSalvaCella(this)" onkeydown="if(event.key===\'Enter\')this.blur()" title="Calcolato: contabile + fido cassa - assegni n.v. — modificabile con conferma se scarto > 1€" style="width:100%;text-align:right;padding:8px 10px;border:0.5px solid var(--border);border-radius:5px;font-family:var(--font-mono);font-size:14px;font-weight:700;background:' + bgDisp + ';color:' + colorDispBase + '">';
    html += overrideTag;
    html += '</td>';

    // Col 6: Residuo fido (calc, BIG, BOLD, color by % residuo)
    html += '<td style="padding:10px 8px;text-align:right;font-family:var(--font-mono)">';
    if (fido > 0) {
      const colorResid = pctResiduo >= 50 ? '#27500A' : (pctResiduo >= 20 ? '#BA7517' : '#A32D2D');
      html += '<div style="font-size:14px;font-weight:700;color:' + colorResid + '">' + fmtE(residuo) + '</div>';
      html += '<div style="font-size:10px;font-weight:500;color:' + colorResid + ';opacity:0.85;margin-top:2px">' + pctResiduo.toFixed(0) + '%</div>';
    } else {
      html += '<span style="color:var(--text-hint)">—</span>';
    }
    html += '</td>';

    html += '</tr>';
  });

  // Riga TOTALE — patch 30/04: aggiunta cella totale assegni
  const pctTotResiduo = totFido > 0 ? (totResiduo / totFido * 100) : 0;
  html += '<tr style="background:var(--bg);font-weight:700;border-top:2px solid var(--border)">';
  html += '<td style="padding:12px 8px;text-transform:uppercase;font-size:11px;letter-spacing:0.4px">TOTALE</td>';
  html += '<td style="padding:12px 8px;text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;color:var(--text)">' + fmtE(totFido) + '</td>';
  html += '<td style="padding:12px 8px;text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;color:#72243E">' + (totAssegni > 0 ? fmtE(totAssegni) : '—') + '</td>';
  html += '<td style="padding:12px 8px;text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + (totContabile < 0 ? '#A32D2D' : (totContabile > 0 ? '#27500A' : 'var(--text)')) + '">' + fmtE(totContabile) + '</td>';
  html += '<td style="padding:12px 8px;text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + (totDisponibile < 0 ? '#A32D2D' : '#27500A') + '">' + fmtE(totDisponibile) + '</td>';
  html += '<td style="padding:12px 8px;text-align:right;font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + (pctTotResiduo >= 50 ? '#27500A' : (pctTotResiduo >= 20 ? '#BA7517' : '#A32D2D')) + '">' + fmtE(totResiduo) + '<div style="font-size:10px;font-weight:500;opacity:0.85;margin-top:2px">' + pctTotResiduo.toFixed(0) + '%</div></td>';
  html += '</tr>';

  html += '</tbody></table></div>';
  html += '<div style="font-size:11px;color:var(--text-hint);margin-top:10px">Le celle gialle sono editabili. Salva automatico al cambio focus o premendo Invio. Il fido cassa proviene dalla tab Affidamenti (tipo "cassa"). Il residuo del fido = accordato − utilizzato (utilizzato derivato dal saldo contabile negativo).<br>';
  html += '<b style="color:#26215C">Saldo disponibile</b> calcolato come: <code style="background:#EEEDFE;padding:1px 4px;border-radius:3px;color:#26215C;font-family:var(--font-mono);font-size:10px">saldo contabile + fido cassa − assegni n.v.</code> Override manuale richiede conferma se scarto > 1 €.';
  html += '</div>';

  // Toolbar conferma giornata
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding-top:12px;border-top:0.5px solid var(--border)">';
  html += '<div style="font-size:11px;color:var(--text-muted);display:flex;align-items:center;gap:6px">';
  if (giornataConfermata) {
    html += '<span style="width:7px;height:7px;border-radius:50%;background:#27500A;display:inline-block"></span>';
    html += 'Giornata <b style="color:#27500A">archiviata</b>';
    if (Object.values(_situazioneSaldi).find(s => s.confermato_at)) {
      const cAt = Object.values(_situazioneSaldi).find(s => s.confermato_at).confermato_at;
      html += ' · ' + new Date(cAt).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    }
  } else if (nSaldiCaricati > 0) {
    html += '<span style="width:7px;height:7px;border-radius:50%;background:#EF9F27;display:inline-block"></span>';
    html += 'Bozza salvata · giornata <b style="color:#854F0B">non confermata</b>';
  } else {
    html += '<span style="color:var(--text-hint)">Inserisci i saldi per iniziare</span>';
  }
  html += '</div>';

  if (nSaldiCaricati > 0 && !giornataConfermata) {
    html += '<button onclick="_situazioneConfermaGiornata()" style="background:#639922;color:#fff;border:none;padding:9px 18px;font-size:12px;font-weight:600;border-radius:6px;cursor:pointer">💾 Conferma giornata e archivia</button>';
  } else if (giornataConfermata) {
    html += '<div style="font-size:10px;color:var(--text-hint)">Giornata in storico — modifiche tracciate</div>';
  }
  html += '</div>';

  html += '</div>';

  return html;
}

// ─── Banner sentinella: ultimi 10 giorni non confermati ────────────────────
function _situazioneRenderSentinella() {
  if (!_situazioneStorico || !_situazioneStorico.length) return '';
  // Mappa data → confermato (true se almeno un record di quella data è confermato)
  const confPerData = {};
  _situazioneStorico.forEach(s => {
    if (!confPerData[s.data]) confPerData[s.data] = false;
    if (s.confermato === true) confPerData[s.data] = true;
  });
  const oggi = new Date();
  oggi.setHours(0, 0, 0, 0);
  const giorniBuchi = [];
  for (let i = 1; i <= 10; i++) {
    const d = new Date(oggi);
    d.setDate(d.getDate() - i);
    // Skip weekend (banche chiuse): sabato=6, domenica=0
    const dow = d.getDay();
    if (dow === 0 || dow === 6) continue;
    const iso = d.toISOString().split('T')[0];
    if (!confPerData[iso]) giorniBuchi.push(iso);
  }
  if (!giorniBuchi.length) return '';
  // Mostra solo il più recente non confermato (info principale; se ce ne sono più di 1 lo dico)
  const piuRecente = giorniBuchi[0];
  const dObj = new Date(piuRecente + 'T12:00:00');
  const giornoLabel = dObj.toLocaleDateString('it-IT', { weekday: 'long' });
  let html = '<div style="background:#FAEEDA;border-left:3px solid #BA7517;border-radius:0 6px 6px 0;padding:9px 13px;margin-bottom:12px;font-size:12px;color:#633806;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">';
  html += '<div>⚠ <b>Devi registrare i saldi del ' + fmtD(piuRecente) + '</b> (' + giornoLabel + ') — non confermato.';
  if (giorniBuchi.length > 1) {
    html += ' <span style="font-size:10px;color:#854F0B">+ altri ' + (giorniBuchi.length - 1) + ' giorni mancanti</span>';
  }
  html += '</div>';
  html += '<button onclick="_situazioneCambiaData(\'' + piuRecente + '\')" style="background:#BA7517;color:#fff;border:none;padding:5px 11px;font-size:11px;font-weight:600;border-radius:5px;cursor:pointer;white-space:nowrap">Vai al giorno mancante →</button>';
  html += '</div>';
  return html;
}

// ─── CONFERMA GIORNATA: passa tutti i record del giorno a confermato=true ──
async function _situazioneConfermaGiornata() {
  const dataC = _situazioneDataCorrente;
  const nRecords = Object.keys(_situazioneSaldi).length;
  if (!nRecords) { toast('⚠ Nessun saldo da confermare per ' + fmtD(dataC)); return; }
  if (!confirm('Confermi e archivi nello storico la giornata del ' + fmtD(dataC) + '?\n\n' + nRecords + ' saldi verranno marcati come definitivi.\n\nLe celle resteranno editabili: ogni modifica successiva sarà tracciata.')) return;
  const nowIso = new Date().toISOString();
  const ids = Object.values(_situazioneSaldi).filter(s => s.id).map(s => s.id);
  if (!ids.length) { toast('❌ Nessun ID record valido'); return; }
  const { error } = await sb.from('banche_saldi_giornalieri')
    .update({ confermato: true, confermato_at: nowIso })
    .in('id', ids);
  if (error) { toast('❌ ' + error.message); return; }
  // Aggiorna stato locale
  Object.values(_situazioneSaldi).forEach(s => {
    if (s.id) { s.confermato = true; s.confermato_at = nowIso; }
  });
  // Aggiorna storico locale
  _situazioneStorico.forEach(s => {
    if (s.data === dataC && ids.indexOf(s.id) >= 0) { s.confermato = true; s.confermato_at = nowIso; }
  });
  if (typeof _auditLog === 'function') _auditLog('conferma_giornata_saldi', 'banche_saldi_giornalieri', dataC + ' (' + nRecords + ' record)');
  toast('✓ Giornata ' + fmtD(dataC) + ' archiviata nello storico');
  renderBancheSituazione();
}

// ═══ PANNELLO RIEPILOGO ═════════════════════════════════════════════════════
// KPI totali + barre stacked per banca (utilizzato | residuo)
function _renderPanelSituazioneRiepilogo() {
  const fidiCassa = _getFidiCassaPerConto();
  const contiSorted = _sortContiPriorita();

  // Calcolo totali
  let totFido = 0, totUtilizzato = 0, totResiduo = 0;
  const datiPerConto = []; // {nome, numero, fido, utilizzato, residuo, pctUtil, pctResid}

  contiSorted.forEach(c => {
    const fido = fidiCassa[c.id] ? Number(fidiCassa[c.id].accordato) : 0;
    if (fido <= 0) return; // skip conti senza fido cassa
    const istNome = (_bancheIstituti.find(i => i.id === c.istituto_id) || {}).nome || '—';
    const saldo = _situazioneSaldi[c.id] || {};
    const sCont = (saldo.saldo_contabile !== null && saldo.saldo_contabile !== undefined) ? Number(saldo.saldo_contabile) : null;
    const utilizzato = (sCont !== null && sCont < 0) ? Math.abs(sCont) : 0;
    const residuo = Math.max(0, fido - utilizzato);
    const pctUtil = (utilizzato / fido) * 100;
    const pctResid = (residuo / fido) * 100;
    totFido += fido;
    totUtilizzato += utilizzato;
    totResiduo += residuo;
    datiPerConto.push({ nome: istNome, numero: c.numero_conto, fido, utilizzato, residuo, pctUtil, pctResid });
  });

  const pctUtilTot = totFido > 0 ? (totUtilizzato / totFido * 100) : 0;
  const pctResidTot = 100 - pctUtilTot;

  let html = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  html += '<div style="font-size:13px;font-weight:600;margin-bottom:14px;color:var(--text)">📊 Riepilogo affidamenti cassa</div>';

  // ─── KPI ROW (4 cards) ───
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px;margin-bottom:18px">';
  html += '<div style="background:var(--bg);padding:12px 14px;border-radius:8px;border:0.5px solid var(--border)">';
  html += '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">Totale accordato</div>';
  html += '<div style="font-size:18px;font-weight:700;color:#26215C;font-family:var(--font-mono);margin-top:4px">' + fmtE(totFido) + '</div>';
  html += '</div>';
  html += '<div style="background:#FCEBEB;padding:12px 14px;border-radius:8px;border:0.5px solid #F09595">';
  html += '<div style="font-size:10px;color:#791F1F;text-transform:uppercase;letter-spacing:0.4px">Utilizzato</div>';
  html += '<div style="font-size:18px;font-weight:700;color:#A32D2D;font-family:var(--font-mono);margin-top:4px">' + fmtE(totUtilizzato) + '</div>';
  html += '<div style="font-size:10px;color:#791F1F;margin-top:2px;font-weight:500">' + pctUtilTot.toFixed(1) + '%</div>';
  html += '</div>';
  html += '<div style="background:#EAF3DE;padding:12px 14px;border-radius:8px;border:0.5px solid #C0DD97">';
  html += '<div style="font-size:10px;color:#27500A;text-transform:uppercase;letter-spacing:0.4px">Residuo</div>';
  html += '<div style="font-size:18px;font-weight:700;color:#27500A;font-family:var(--font-mono);margin-top:4px">' + fmtE(totResiduo) + '</div>';
  html += '<div style="font-size:10px;color:#27500A;margin-top:2px;font-weight:500">' + pctResidTot.toFixed(1) + '%</div>';
  html += '</div>';
  html += '<div style="background:var(--bg);padding:12px 14px;border-radius:8px;border:0.5px solid var(--border);text-align:center">';
  html += '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:6px">% utilizzato</div>';
  // Donut piccolo
  const radius = 26, circumference = 2 * Math.PI * radius;
  const dashUtil = (pctUtilTot / 100) * circumference;
  html += '<svg width="68" height="68" viewBox="0 0 68 68" style="display:block;margin:0 auto">';
  html += '<circle cx="34" cy="34" r="' + radius + '" fill="none" stroke="#EAF3DE" stroke-width="9"/>';
  html += '<circle cx="34" cy="34" r="' + radius + '" fill="none" stroke="#A32D2D" stroke-width="9" stroke-dasharray="' + dashUtil + ' ' + circumference + '" transform="rotate(-90 34 34)" stroke-linecap="round"/>';
  html += '<text x="34" y="38" text-anchor="middle" font-size="14" font-weight="700" fill="var(--text)" font-family="var(--font-mono)">' + pctUtilTot.toFixed(0) + '%</text>';
  html += '</svg>';
  html += '</div>';
  html += '</div>';

  // ─── BARRE STACKED PER BANCA ───
  if (datiPerConto.length === 0) {
    html += '<div style="padding:20px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px;font-size:12px">Nessun fido cassa configurato. Aggiungi fidi nella tab Affidamenti per vedere il dettaglio per banca.</div>';
  } else {
    html += '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:10px;text-transform:uppercase;letter-spacing:0.3px">Dettaglio per banca</div>';
    html += '<div style="display:flex;flex-direction:column;gap:10px">';

    datiPerConto.forEach(d => {
      // Etichetta banca
      html += '<div>';
      html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:5px">';
      html += '<div style="font-size:12px;font-weight:600;color:var(--text)">' + esc(d.nome);
      if (d.numero) html += ' <span style="color:var(--text-hint);font-family:var(--font-mono);font-size:10px;font-weight:400">N. ' + esc(d.numero) + '</span>';
      html += '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + fmtE(d.fido) + '</div>';
      html += '</div>';
      // Barra stacked
      html += '<div style="display:flex;height:24px;border-radius:5px;overflow:hidden;background:var(--bg);border:0.5px solid var(--border)">';
      if (d.pctUtil > 0) {
        html += '<div style="width:' + d.pctUtil + '%;background:#A32D2D;display:flex;align-items:center;justify-content:flex-start;padding-left:8px;color:#fff;font-size:11px;font-weight:600;font-family:var(--font-mono);overflow:hidden;white-space:nowrap" title="Utilizzato ' + fmtE(d.utilizzato) + '">';
        if (d.pctUtil >= 18) html += fmtE(d.utilizzato);
        html += '</div>';
      }
      if (d.pctResid > 0) {
        html += '<div style="width:' + d.pctResid + '%;background:#27500A;display:flex;align-items:center;justify-content:flex-end;padding-right:8px;color:#fff;font-size:11px;font-weight:600;font-family:var(--font-mono);overflow:hidden;white-space:nowrap" title="Residuo ' + fmtE(d.residuo) + '">';
        if (d.pctResid >= 18) html += fmtE(d.residuo);
        html += '</div>';
      }
      html += '</div>';
      // Sotto-etichette
      html += '<div style="display:flex;justify-content:space-between;font-size:10px;margin-top:3px">';
      html += '<span style="color:#A32D2D;font-weight:500">⬤ Utilizzato ' + d.pctUtil.toFixed(1) + '%</span>';
      html += '<span style="color:#27500A;font-weight:500">⬤ Residuo ' + d.pctResid.toFixed(1) + '%</span>';
      html += '</div>';
      html += '</div>';
    });

    html += '</div>';
  }

  html += '</div>';
  return html;
}

// ═══ PANNELLO STORICO ═══════════════════════════════════════════════════════
// Tabella ultimi 60 giorni di saldi: righe = data, colonne = conti.
// Click su una riga → naviga al giorno corrispondente nella tab Saldi.
// Patch 30/04: state filtri storico (data/range/mese), default = ultimi 60 giorni
var _situazioneStoricoFiltro = { tipo: 'recenti', daDate: null, aDate: null, mese: null, anno: null };

function _situazioneSetFiltroStorico(tipo, val1, val2) {
  _situazioneStoricoFiltro.tipo = tipo;
  if (tipo === 'range') {
    _situazioneStoricoFiltro.daDate = val1;
    _situazioneStoricoFiltro.aDate = val2;
  } else if (tipo === 'mese') {
    _situazioneStoricoFiltro.mese = val1;
    _situazioneStoricoFiltro.anno = val2;
  }
  renderBancheSituazione();
}

// Applica filtri allo storico — ritorna l'array delle date filtrate
function _situazioneFiltraStorico() {
  if (!_situazioneStorico || !_situazioneStorico.length) return [];
  const f = _situazioneStoricoFiltro;
  const perData = {};
  _situazioneStorico.forEach(s => {
    if (!perData[s.data]) perData[s.data] = true;
  });
  let dates = Object.keys(perData).sort().reverse();
  if (f.tipo === 'range' && f.daDate && f.aDate) {
    dates = dates.filter(d => d >= f.daDate && d <= f.aDate);
  } else if (f.tipo === 'mese' && f.mese && f.anno) {
    const prefix = f.anno + '-' + String(f.mese).padStart(2, '0');
    dates = dates.filter(d => d.indexOf(prefix) === 0);
  }
  // tipo 'recenti' → tutto (default 60 giorni già caricati)
  return dates;
}

function _renderPanelSituazioneStorico() {
  const contiSorted = _sortContiPriorita();

  // Raggruppa per data → {conto_id: {contabile, disponibile}}
  const perData = {};
  _situazioneStorico.forEach(s => {
    if (!perData[s.data]) perData[s.data] = {};
    perData[s.data][s.conto_id] = s;
  });

  // Patch 30/04: applica filtri (range/mese)
  const dateOrdinate = _situazioneFiltraStorico();
  const f = _situazioneStoricoFiltro;
  const filtroAttivo = (f.tipo !== 'recenti');

  let html = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:18px;padding-top:34px">';
  html += '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  html += '<div style="font-size:13px;font-weight:600;color:var(--text)">📈 Storico saldi <span style="color:var(--text-muted);font-weight:400;font-size:11px">' + (filtroAttivo ? '(filtrato)' : '(ultimi 60 giorni)') + '</span></div>';
  html += '<div style="font-size:11px;color:var(--text-muted)">' + dateOrdinate.length + ' giornata' + (dateOrdinate.length === 1 ? '' : 'e') + ' visualizzata' + (dateOrdinate.length === 1 ? '' : 'e') + '</div>';
  html += '</div>';

  // Patch 30/04: barra filtri + PDF
  html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px;margin-bottom:12px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">';
  html += '<div style="font-size:11px;color:var(--text-muted);font-weight:500">Filtri:</div>';
  // Tipo filtro
  html += '<select onchange="_situazioneSetFiltroStorico(this.value)" style="font-size:11px;padding:5px 8px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text)">';
  html += '<option value="recenti"' + (f.tipo === 'recenti' ? ' selected' : '') + '>Tutti (60 gg)</option>';
  html += '<option value="range"' + (f.tipo === 'range' ? ' selected' : '') + '>Range date</option>';
  html += '<option value="mese"' + (f.tipo === 'mese' ? ' selected' : '') + '>Mese specifico</option>';
  html += '</select>';
  if (f.tipo === 'range') {
    const valDa = f.daDate || '';
    const valA = f.aDate || '';
    html += '<input type="date" id="filtro-stor-da" value="' + valDa + '" onchange="_situazioneSetFiltroStorico(\'range\',this.value,document.getElementById(\'filtro-stor-a\').value)" style="font-size:11px;padding:5px 8px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text)">';
    html += '<span style="font-size:11px;color:var(--text-muted)">→</span>';
    html += '<input type="date" id="filtro-stor-a" value="' + valA + '" onchange="_situazioneSetFiltroStorico(\'range\',document.getElementById(\'filtro-stor-da\').value,this.value)" style="font-size:11px;padding:5px 8px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text)">';
  } else if (f.tipo === 'mese') {
    const annoOggi = new Date().getFullYear();
    const meseOggi = new Date().getMonth() + 1;
    const valMese = f.mese || meseOggi;
    const valAnno = f.anno || annoOggi;
    html += '<select id="filtro-stor-mese" onchange="_situazioneSetFiltroStorico(\'mese\',parseInt(this.value),parseInt(document.getElementById(\'filtro-stor-anno\').value))" style="font-size:11px;padding:5px 8px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text)">';
    ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'].forEach(function(m, i) {
      html += '<option value="' + (i + 1) + '"' + ((i + 1) === valMese ? ' selected' : '') + '>' + m + '</option>';
    });
    html += '</select>';
    html += '<select id="filtro-stor-anno" onchange="_situazioneSetFiltroStorico(\'mese\',parseInt(document.getElementById(\'filtro-stor-mese\').value),parseInt(this.value))" style="font-size:11px;padding:5px 8px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text)">';
    [annoOggi - 2, annoOggi - 1, annoOggi].forEach(function(a) {
      html += '<option value="' + a + '"' + (a === valAnno ? ' selected' : '') + '>' + a + '</option>';
    });
    html += '</select>';
  }
  html += '<button onclick="_situazioneStampaStoricoSaldi()" style="margin-left:auto;font-size:11px;padding:5px 11px;background:#534AB7;color:#fff;border:none;border-radius:5px;cursor:pointer;font-weight:500">🖨️ PDF storico</button>';
  html += '</div>';

  if (!dateOrdinate.length) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px;font-size:12px">Nessuna giornata corrispondente ai filtri selezionati.</div>';
    html += '</div>';
    return html;
  }

  html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px">';
  html += '<thead><tr style="background:var(--bg);border-bottom:0.5px solid var(--border)">';
  html += '<th style="text-align:left;padding:8px;font-weight:600;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:0.3px;position:sticky;left:0;background:var(--bg)">Data</th>';
  contiSorted.forEach(c => {
    const istNome = (_bancheIstituti.find(i => i.id === c.istituto_id) || {}).nome || '—';
    // Versione compatta del nome (max 12 char) + numero conto
    const istBreve = istNome.length > 12 ? istNome.substring(0, 12) + '…' : istNome;
    html += '<th style="text-align:right;padding:8px;font-weight:600;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:0.3px;white-space:nowrap">' + esc(istBreve);
    if (c.numero_conto) html += '<div style="font-family:var(--font-mono);font-size:9px;font-weight:400;text-transform:none;letter-spacing:0">N. ' + esc(c.numero_conto) + '</div>';
    html += '</th>';
  });
  html += '<th style="text-align:right;padding:8px;font-weight:600;color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:0.3px;background:var(--bg)">Totale</th>';
  html += '</tr></thead><tbody>';

  dateOrdinate.forEach(d => {
    const isCurrent = d === _situazioneDataCorrente;
    const dayObj = new Date(d + 'T12:00:00');
    const giorno = dayObj.toLocaleDateString('it-IT', { weekday: 'short' });
    let totaleData = 0;
    let nValori = 0;

    html += '<tr onclick="_situazioneCambiaData(\'' + d + '\')" style="border-bottom:0.5px solid var(--border);cursor:pointer;' + (isCurrent ? 'background:#FAEEDA' : '') + '" onmouseover="if(!this.style.background.includes(\'FAEEDA\'))this.style.background=\'var(--bg)\'" onmouseout="if(!this.style.background.includes(\'FAEEDA\'))this.style.background=\'\'">';
    html += '<td style="padding:7px 8px;font-family:var(--font-mono);font-weight:' + (isCurrent ? '700' : '500') + ';font-size:11px;position:sticky;left:0;background:inherit">';
    html += fmtD(d);
    html += '<div style="font-size:9px;color:var(--text-muted);font-weight:400;text-transform:capitalize">' + giorno;
    if (isCurrent) html += ' · <span style="color:#BA7517;font-weight:600">attuale</span>';
    html += '</div>';
    html += '</td>';

    contiSorted.forEach(c => {
      const rec = perData[d][c.id];
      if (rec && rec.saldo_contabile !== null && rec.saldo_contabile !== undefined) {
        const val = Number(rec.saldo_contabile);
        totaleData += val;
        nValori++;
        const colorCont = val < 0 ? '#A32D2D' : (val > 0 ? '#27500A' : 'var(--text)');
        html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:600;color:' + colorCont + ';white-space:nowrap">';
        html += fmtE(val);
        html += '</td>';
      } else {
        html += '<td style="padding:7px 8px;text-align:right;color:var(--text-hint);font-size:11px">—</td>';
      }
    });

    // Totale del giorno
    if (nValori > 0) {
      const colorTot = totaleData < 0 ? '#A32D2D' : (totaleData > 0 ? '#27500A' : 'var(--text)');
      html += '<td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:700;color:' + colorTot + ';background:var(--bg);white-space:nowrap">';
      html += fmtE(totaleData);
      html += '</td>';
    } else {
      html += '<td style="padding:7px 8px;text-align:right;color:var(--text-hint);background:var(--bg)">—</td>';
    }

    html += '</tr>';
  });

  html += '</tbody></table></div>';
  html += '<div style="font-size:11px;color:var(--text-hint);margin-top:10px">Click su una riga per navigare a quel giorno e modificarne i saldi. La riga gialla evidenzia il giorno attualmente visualizzato. I dati sono persistenti: ogni inserimento è salvato in DB e resta accessibile in qualsiasi momento.</div>';
  html += '</div>';
  return html;
}

// ─── HELPERS NAVIGAZIONE DATA ─────────────────────────────────────────────
function _situazioneCambiaData(nuovaData) {
  if (!nuovaData) return;
  _situazioneDataCorrente = nuovaData;
  renderBancheSituazione();
}

function _situazioneSpostaGiorno(delta) {
  const d = new Date(_situazioneDataCorrente + 'T12:00:00');
  d.setDate(d.getDate() + delta);
  _situazioneDataCorrente = d.toISOString().split('T')[0];
  renderBancheSituazione();
}

function _situazioneVaiOggi() {
  _situazioneDataCorrente = new Date().toISOString().split('T')[0];
  renderBancheSituazione();
}

// ─── AUTOSAVE CELLA ────────────────────────────────────────────────────────
async function _situazioneSalvaCella(input) {
  const contoId = input.dataset.contoId;
  const campo = input.dataset.campo;
  const valStr = input.value.trim();

  // Parse italiano: "1.234,56" o "-129.634,14" o vuoto
  let val = null;
  if (valStr !== '' && valStr !== '—') {
    // Rimuovo separatori migliaia (.) e converto virgola in punto
    const norm = valStr.replace(/\./g, '').replace(',', '.').replace(/[^\d.\-]/g, '');
    val = parseFloat(norm);
    if (isNaN(val)) {
      toast('⚠ Valore non valido: ' + valStr);
      input.style.borderColor = '#A32D2D';
      return;
    }
  }

  // Patch 30/04: per il SALDO DISPONIBILE check override vs calcolato
  // Calcolo atteso: saldo_contabile + fido_cassa - assegni_non_valuta
  // Se scarto > 1€ → popup conferma. Se confermato, flag saldo_disponibile_override=true.
  // ECCEZIONE (fix 30/04 d): se l'utente inserisce esattamente 0 o svuota la cella,
  // NON è un override — è un "reset". Override=false così al prossimo cambio di
  // contabile/assegni il disponibile si ricalcola normalmente.
  let isOverride = false;
  if (campo === 'saldo_disponibile' && val !== null) {
    const fidi = _getFidiCassaPerConto();
    const fido = fidi[contoId] ? Number(fidi[contoId].accordato) : 0;
    const sa = _situazioneSaldi[contoId] || {};
    const sCont = (sa.saldo_contabile !== null && sa.saldo_contabile !== undefined) ? Number(sa.saldo_contabile) : null;
    const assegni = (sa.assegni_non_valuta !== null && sa.assegni_non_valuta !== undefined) ? Number(sa.assegni_non_valuta) : 0;

    // Caso reset: valore inserito = 0 → resetta override, ricalcola al prossimo cambio
    if (val === 0) {
      isOverride = false;
    } else if (sCont !== null) {
      const calc = sCont + fido - assegni;
      const scarto = Math.abs(val - calc);
      if (scarto > 1) {
        const ok = confirm(
          '⚠ Saldo disponibile diverso dal calcolato\n\n' +
          'Calcolato: € ' + calc.toFixed(2).replace('.', ',') + '\n' +
          'Inserito: € ' + val.toFixed(2).replace('.', ',') + '\n' +
          'Scarto: € ' + (val - calc).toFixed(2).replace('.', ',') + '\n\n' +
          'Verifica di non aver dimenticato un assegno o una movimentazione.\n' +
          'Se confermi, l\'override viene tracciato in audit.\n\n' +
          'Conferma override manuale?'
        );
        if (!ok) {
          // Annulla: ripristina valore precedente
          const valOld = (sa.saldo_disponibile !== null && sa.saldo_disponibile !== undefined) ? Number(sa.saldo_disponibile) : calc;
          input.value = valOld.toFixed(2).replace('.', ',');
          input.style.borderColor = '';
          return;
        }
        isOverride = true;
      } else {
        // Scarto entro 1€ → autosave silenzioso, niente flag override
        isOverride = false;
      }
    }
  }

  // Patch 30/04: quando si salva CONTABILE / FIDO / ASSEGNI ricalcolo automaticamente
  // il saldo disponibile suggerito (se non c'è già un override esplicito).
  // Salviamo in payload sia il campo modificato sia l'eventuale ricalcolo.

  // Visual feedback
  const oldBorder = input.style.border;
  input.style.border = '0.5px solid #BA7517';

  // Carico saldo esistente o creo nuovo
  const saldoEsistente = _situazioneSaldi[contoId];

  // Costruisco payload
  let payload = { [campo]: val };
  if (campo === 'saldo_disponibile') {
    payload.saldo_disponibile_override = isOverride;
  }

  // Se modifico contabile/assegni e NON c'è override esplicito → ricalcolo automaticamente
  // il saldo disponibile (così la formula resta coerente).
  if ((campo === 'saldo_contabile' || campo === 'assegni_non_valuta') && saldoEsistente && saldoEsistente.saldo_disponibile_override !== true) {
    const fidi = _getFidiCassaPerConto();
    const fido = fidi[contoId] ? Number(fidi[contoId].accordato) : 0;
    const sCont = (campo === 'saldo_contabile') ? val : ((saldoEsistente.saldo_contabile !== null && saldoEsistente.saldo_contabile !== undefined) ? Number(saldoEsistente.saldo_contabile) : null);
    const ass = (campo === 'assegni_non_valuta') ? (val || 0) : Number(saldoEsistente.assegni_non_valuta || 0);
    if (sCont !== null) {
      payload.saldo_disponibile = sCont + fido - ass;
      payload.saldo_disponibile_override = false;
    }
  }

  if (saldoEsistente && saldoEsistente.id) {
    const { error } = await sb.from('banche_saldi_giornalieri')
      .update(payload).eq('id', saldoEsistente.id);
    if (error) {
      toast('❌ ' + error.message);
      input.style.borderColor = '#A32D2D';
      return;
    }
    Object.assign(saldoEsistente, payload);
  } else {
    // Insert nuovo: tutti i campi con default sensati
    const fidi = _getFidiCassaPerConto();
    const fido = fidi[contoId] ? Number(fidi[contoId].accordato) : 0;
    const insertPayload = {
      conto_id: contoId,
      data: _situazioneDataCorrente,
      saldo_contabile: campo === 'saldo_contabile' ? val : 0,
      saldo_disponibile: campo === 'saldo_disponibile' ? val : 0,
      assegni_non_valuta: campo === 'assegni_non_valuta' ? (val || 0) : 0,
      saldo_disponibile_override: campo === 'saldo_disponibile' ? isOverride : false,
      confermato: false
    };
    // Se sto inserendo contabile/assegni, calcolo subito anche il disponibile
    if (campo === 'saldo_contabile' && val !== null) {
      insertPayload.saldo_disponibile = val + fido;
    }
    const { data, error } = await sb.from('banche_saldi_giornalieri')
      .insert(insertPayload).select().single();
    if (error) {
      toast('❌ ' + error.message);
      input.style.borderColor = '#A32D2D';
      return;
    }
    _situazioneSaldi[contoId] = data;
  }

  // Visual feedback successo (verde breve)
  input.style.border = '0.5px solid #27500A';
  setTimeout(() => { input.style.border = oldBorder; }, 600);

  // Invalida cache globale (Istituti/Affidamenti devono rileggere alla prossima apertura)
  _invalidaUltimiSaldi();

  // Rerender per aggiornare colonne calcolate (utilizzo, totali)
  renderBancheSituazione();
}

// ─── STAMPA PDF STORICO SALDI (filtrato) ──────────────────────────────────
// Patch 30/04: stampa storico saldi su range/mese filtrati. Layout A4 landscape.
function _situazioneStampaStoricoSaldi() {
  const dateOrdinate = _situazioneFiltraStorico();
  if (!dateOrdinate.length) { toast('⚠ Nessun dato da stampare nei filtri selezionati'); return; }
  const w = window.open('', '_blank');
  if (!w) { toast('⚠ Popup bloccato dal browser'); return; }

  const contiSorted = _sortContiPriorita();
  // Mappa data → conto_id → record
  const perData = {};
  _situazioneStorico.forEach(s => {
    if (!perData[s.data]) perData[s.data] = {};
    perData[s.data][s.conto_id] = s;
  });

  const f = _situazioneStoricoFiltro;
  let titoloFiltro = 'Ultimi 60 giorni';
  if (f.tipo === 'range' && f.daDate && f.aDate) titoloFiltro = 'Dal ' + fmtD(f.daDate) + ' al ' + fmtD(f.aDate);
  else if (f.tipo === 'mese' && f.mese && f.anno) {
    const mesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    titoloFiltro = mesi[f.mese - 1] + ' ' + f.anno;
  }

  const dataGen = new Date().toLocaleDateString('it-IT') + ' ' + new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' });

  w.document.write('<!DOCTYPE html><html><head><title>Storico saldi — Phoenix Fuel</title>');
  w.document.write('<style>');
  w.document.write('body{font-family:Arial,sans-serif;padding:18px;font-size:10px;color:#333}');
  w.document.write('h1{font-size:15px;color:#26215C;margin:0 0 4px}');
  w.document.write('.meta{font-size:9px;color:#666;margin-bottom:14px}');
  w.document.write('table{width:100%;border-collapse:collapse;font-size:9px}');
  w.document.write('th{background:#EEEDFE;padding:6px 5px;text-align:right;border-bottom:1px solid #534AB7;font-size:8.5px;text-transform:uppercase;color:#26215C;font-weight:600}');
  w.document.write('th:first-child{text-align:left}');
  w.document.write('td{padding:5px;text-align:right;border-bottom:0.5px solid #eee;font-family:monospace}');
  w.document.write('td:first-child{text-align:left;font-family:Arial,sans-serif;font-weight:500;color:#444}');
  w.document.write('td.conf{color:#27500A;font-weight:600}');
  w.document.write('td.draft{color:#854F0B}');
  w.document.write('tr.spacer td{padding:0;border:none;height:3px}');
  w.document.write('@page{size:A4 landscape;margin:0.8cm}');
  w.document.write('@media print{body{padding:0}}');
  w.document.write('</style></head><body>');
  w.document.write('<h1>📈 Storico saldi conti correnti — Phoenix Fuel S.r.l.</h1>');
  w.document.write('<div class="meta">' + titoloFiltro + ' · ' + dateOrdinate.length + ' giornate · Generato il ' + dataGen + '</div>');

  w.document.write('<table>');
  w.document.write('<thead><tr>');
  w.document.write('<th>Data</th>');
  w.document.write('<th>Stato</th>');
  contiSorted.forEach(c => {
    const istNome = (_bancheIstituti.find(i => i.id === c.istituto_id) || {}).nome || '—';
    w.document.write('<th>' + esc(istNome) + '</th>');
  });
  w.document.write('<th>Totale</th>');
  w.document.write('</tr></thead><tbody>');

  dateOrdinate.forEach(d => {
    let totaleData = 0, nValori = 0;
    let hasConfermato = false;
    contiSorted.forEach(c => {
      const rec = perData[d] ? perData[d][c.id] : null;
      if (rec && rec.saldo_contabile !== null && rec.saldo_contabile !== undefined) {
        totaleData += Number(rec.saldo_contabile);
        nValori++;
      }
      if (rec && rec.confermato === true) hasConfermato = true;
    });
    const dObj = new Date(d + 'T12:00:00');
    const giornoLab = dObj.toLocaleDateString('it-IT', { weekday: 'short' });
    w.document.write('<tr>');
    w.document.write('<td>' + fmtD(d) + ' <span style="color:#999;font-size:8px">' + giornoLab + '</span></td>');
    w.document.write('<td class="' + (hasConfermato ? 'conf' : 'draft') + '">' + (hasConfermato ? '✓ archiv.' : '● bozza') + '</td>');
    contiSorted.forEach(c => {
      const rec = perData[d] ? perData[d][c.id] : null;
      if (rec && rec.saldo_contabile !== null && rec.saldo_contabile !== undefined) {
        const v = Number(rec.saldo_contabile);
        const col = v < 0 ? '#A32D2D' : (v > 0 ? '#27500A' : '#666');
        w.document.write('<td style="color:' + col + '">' + v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>');
      } else {
        w.document.write('<td style="color:#ccc">—</td>');
      }
    });
    if (nValori > 0) {
      const colTot = totaleData < 0 ? '#A32D2D' : '#27500A';
      w.document.write('<td style="color:' + colTot + ';font-weight:600;background:#f9f9f9">' + totaleData.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + '</td>');
    } else {
      w.document.write('<td style="color:#ccc;background:#f9f9f9">—</td>');
    }
    w.document.write('</tr>');
  });
  w.document.write('</tbody></table>');
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(() => w.print(), 400);
}

// ─── STAMPA PDF SITUAZIONE ─────────────────────────────────────────────────
// Replica dell'Excel "Situazione Banche al GG/MM/AAAA" del giorno selezionato.
// Layout A4 portrait. Stile coerente con stampaPianoAnnuale/stampaTimeline.
function stampaSituazionePDF() {
  if (!_situazioneDataCorrente) { toast('⚠ Nessuna data selezionata'); return; }

  const w = window.open('', '_blank');
  if (!w) { toast('⚠ Popup bloccato dal browser'); return; }

  const fidiCassa = _getFidiCassaPerConto();
  const contiSorted = _sortContiPriorita();
  const dataObj = new Date(_situazioneDataCorrente + 'T12:00:00');
  const dataLabel = dataObj.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const giornoLabel = dataObj.toLocaleDateString('it-IT', { weekday: 'long' });
  const oraStampa = new Date().toLocaleString('it-IT');

  // Calcolo totali
  let totFido = 0, totContabile = 0, totDisponibile = 0, totUtilizzato = 0, totResiduo = 0;
  const righe = contiSorted.map(c => {
    const istNome = (_bancheIstituti.find(i => i.id === c.istituto_id) || {}).nome || '—';
    const saldo = _situazioneSaldi[c.id] || {};
    const sCont = (saldo.saldo_contabile !== null && saldo.saldo_contabile !== undefined) ? Number(saldo.saldo_contabile) : null;
    const sDisp = (saldo.saldo_disponibile !== null && saldo.saldo_disponibile !== undefined) ? Number(saldo.saldo_disponibile) : null;
    const fido = fidiCassa[c.id] ? Number(fidiCassa[c.id].accordato) : 0;
    const utilizzato = (sCont !== null && sCont < 0) ? Math.abs(sCont) : 0;
    const residuo = fido > 0 ? Math.max(0, fido - utilizzato) : 0;
    if (sCont !== null) totContabile += sCont;
    if (sDisp !== null) totDisponibile += sDisp;
    totFido += fido;
    totUtilizzato += utilizzato;
    totResiduo += residuo;
    return { istNome, numero: c.numero_conto, sCont, sDisp, fido, utilizzato, residuo };
  });
  const pctTotResid = totFido > 0 ? (totResiduo / totFido * 100) : 0;

  // ─── HTML del PDF ───
  let html = '<!DOCTYPE html><html><head><title>Situazione banche al ' + dataLabel + ' — Phoenix Fuel</title>';
  html += '<style>';
  html += 'body{font-family:Arial,sans-serif;padding:20px;font-size:11px;color:#333}';
  html += '.header-yellow{background:#FAEEDA;border:1px solid #BA7517;padding:10px 14px;margin-bottom:14px;text-align:center}';
  html += '.header-yellow h1{font-size:16px;color:#633806;margin:0;font-weight:700}';
  html += '.header-yellow .sub{font-size:10px;color:#633806;margin-top:3px}';
  html += 'table{width:100%;border-collapse:collapse;font-size:10px;margin-bottom:0}';
  html += 'th{background:#f0f0f0;padding:7px 8px;text-align:right;border-bottom:1.5px solid #999;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;color:#555}';
  html += 'th:first-child{text-align:left}';
  html += 'td{padding:7px 8px;text-align:right;border-bottom:0.5px solid #ddd;font-family:monospace;font-size:11px;font-weight:600}';
  html += 'td:first-child{text-align:left;font-family:Arial,sans-serif;font-weight:500;color:#333}';
  html += 'td.neg{color:#A32D2D}';
  html += 'td.pos{color:#27500A}';
  html += 'tr.totale td{font-weight:700;background:#f8f8f8;border-top:2px solid #333;font-size:12px}';
  html += '.numero{color:#888;font-family:monospace;font-size:9px;font-weight:400;margin-left:4px}';
  html += '.kpi-row{display:flex;gap:10px;margin:18px 0 8px}';
  html += '.kpi-card{flex:1;border:0.5px solid #ccc;padding:10px 12px;border-radius:4px;background:#fafafa}';
  html += '.kpi-label{font-size:9px;color:#666;text-transform:uppercase;letter-spacing:0.4px;font-weight:600}';
  html += '.kpi-value{font-size:14px;font-weight:700;font-family:monospace;margin-top:3px}';
  html += '.footer{margin-top:24px;padding-top:8px;border-top:0.5px solid #ccc;font-size:9px;color:#888;display:flex;justify-content:space-between}';
  html += '@page{size:A4 portrait;margin:1.2cm}';
  html += '@media print{.no-print{display:none}}';
  html += '</style></head><body>';

  // Header giallo (replica Excel)
  html += '<div class="header-yellow">';
  html += '<h1>SITUAZIONE BANCHE AL ' + dataLabel + '</h1>';
  html += '<div class="sub">' + giornoLabel.charAt(0).toUpperCase() + giornoLabel.slice(1) + ' · Phoenix Fuel S.r.l.</div>';
  html += '</div>';

  // Tabella saldi
  html += '<table>';
  html += '<thead><tr>';
  html += '<th style="width:25%">Banca / Conto</th>';
  html += '<th style="width:15%">Fido cassa</th>';
  html += '<th style="width:15%">Saldo contabile</th>';
  html += '<th style="width:15%">Saldo disponibile</th>';
  html += '<th style="width:15%">Utilizzato</th>';
  html += '<th style="width:15%">Residuo fido</th>';
  html += '</tr></thead><tbody>';
  righe.forEach(r => {
    html += '<tr>';
    html += '<td>' + r.istNome + (r.numero ? '<span class="numero">N. ' + r.numero + '</span>' : '') + '</td>';
    html += '<td>' + (r.fido > 0 ? fmtE(r.fido) : '—') + '</td>';
    if (r.sCont === null) html += '<td style="color:#bbb">—</td>';
    else html += '<td class="' + (r.sCont < 0 ? 'neg' : (r.sCont > 0 ? 'pos' : '')) + '">' + fmtE(r.sCont) + '</td>';
    if (r.sDisp === null) html += '<td style="color:#bbb">—</td>';
    else html += '<td class="' + (r.sDisp < 0 ? 'neg' : 'pos') + '">' + fmtE(r.sDisp) + '</td>';
    html += '<td' + (r.utilizzato > 0 ? ' class="neg"' : '') + '>' + (r.fido > 0 ? fmtE(r.utilizzato) : '—') + '</td>';
    if (r.fido > 0) {
      const pct = (r.residuo / r.fido * 100).toFixed(0);
      html += '<td class="pos">' + fmtE(r.residuo) + ' <span style="color:#888;font-weight:400;font-size:9px">(' + pct + '%)</span></td>';
    } else {
      html += '<td style="color:#bbb">—</td>';
    }
    html += '</tr>';
  });
  // Riga totale
  html += '<tr class="totale">';
  html += '<td>TOTALE</td>';
  html += '<td>' + fmtE(totFido) + '</td>';
  html += '<td class="' + (totContabile < 0 ? 'neg' : (totContabile > 0 ? 'pos' : '')) + '">' + fmtE(totContabile) + '</td>';
  html += '<td class="' + (totDisponibile < 0 ? 'neg' : 'pos') + '">' + fmtE(totDisponibile) + '</td>';
  html += '<td' + (totUtilizzato > 0 ? ' class="neg"' : '') + '>' + fmtE(totUtilizzato) + '</td>';
  html += '<td class="pos">' + fmtE(totResiduo) + ' <span style="color:#888;font-weight:400;font-size:9px">(' + pctTotResid.toFixed(0) + '%)</span></td>';
  html += '</tr>';
  html += '</tbody></table>';

  // ─── KPI di sintesi (sotto la tabella) ───
  const pctUtilTot = totFido > 0 ? (totUtilizzato / totFido * 100).toFixed(0) : '0';
  html += '<div class="kpi-row">';
  html += '<div class="kpi-card"><div class="kpi-label">Totale accordato</div><div class="kpi-value" style="color:#26215C">' + fmtE(totFido) + '</div></div>';
  html += '<div class="kpi-card" style="background:#FCEBEB"><div class="kpi-label" style="color:#791F1F">Utilizzato</div><div class="kpi-value" style="color:#A32D2D">' + fmtE(totUtilizzato) + ' <span style="font-size:10px;font-weight:500">(' + pctUtilTot + '%)</span></div></div>';
  html += '<div class="kpi-card" style="background:#EAF3DE"><div class="kpi-label" style="color:#27500A">Residuo</div><div class="kpi-value" style="color:#27500A">' + fmtE(totResiduo) + ' <span style="font-size:10px;font-weight:500">(' + pctTotResid.toFixed(0) + '%)</span></div></div>';
  html += '<div class="kpi-card"><div class="kpi-label">Disponibilità totale</div><div class="kpi-value" style="color:' + (totDisponibile < 0 ? '#A32D2D' : '#27500A') + '">' + fmtE(totDisponibile) + '</div></div>';
  html += '</div>';

  // Footer
  html += '<div class="footer">';
  html += '<span>Phoenix Fuel S.r.l. · Vibo Valentia (VV)</span>';
  html += '<span>Stampato il ' + oraStampa + '</span>';
  html += '</div>';

  // Bottone stampa (visibile solo a video, nascosto in stampa)
  html += '<div class="no-print" style="margin-top:20px;text-align:center">';
  html += '<button onclick="window.print()" style="padding:10px 20px;background:#26215C;color:#fff;border:0;border-radius:6px;font-size:13px;cursor:pointer">🖨 Stampa / Salva PDF</button>';
  html += ' <button onclick="window.close()" style="padding:10px 20px;background:#fff;color:#333;border:1px solid #ccc;border-radius:6px;font-size:13px;cursor:pointer;margin-left:8px">Chiudi</button>';
  html += '</div>';

  html += '</body></html>';

  w.document.write(html);
  w.document.close();
  // Non lancio auto-print: l'utente vede l'anteprima e clicca lui Stampa
}
