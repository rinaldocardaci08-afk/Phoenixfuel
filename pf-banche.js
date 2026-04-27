// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Sezione Banche & Mutui
// Versione 1.0 — 27/04/2026
// 
// Tab implementati: Istituti (anagrafica banche + conti correnti)
// Tab in costruzione: Affidamenti, Finanziamenti, Anticipi, Piano, Timeline
// ═══════════════════════════════════════════════════════════════════════════

// ═══ STATE ════════════════════════════════════════════════════════════════
var _bancheIstituti = [];
var _bancheConti = [];
var _bancheAffidamenti = []; // pre-caricati per KPI
var _bancheFinanziamenti = []; // pre-caricati per KPI

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
  if (tabId === 'banche-panel-piano') renderBanchePianoAnnuale();
  if (tabId === 'banche-panel-timeline') renderBancheTimeline();
}

// ═══ TAB ISTITUTI ═════════════════════════════════════════════════════════
function renderBancheIstituti() {
  const cont = document.getElementById('content-banche-istituti');
  if (!cont) return;

  // KPI calcolati
  const nBanche = _bancheIstituti.filter(i => i.attivo).length;
  const nConti = _bancheConti.filter(c => c.attivo).length;
  const saldoTotale = _bancheConti
    .filter(c => c.attivo)
    .reduce((s, c) => s + Number(c.saldo_attuale || 0), 0);
  const nMutuiAttivi = _bancheFinanziamenti.filter(f => f.stato === 'attivo').length;

  let html = '';

  // ─── KPI ───
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px">';
  html += '<div class="kpi"><div class="kpi-label">Banche attive</div><div class="kpi-value">' + nBanche + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Conti correnti</div><div class="kpi-value">' + nConti + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Saldo totale CC</div><div class="kpi-value" style="color:#639922">' + fmtE(saldoTotale) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Finanziamenti attivi</div><div class="kpi-value">' + nMutuiAttivi + '</div></div>';
  html += '</div>';

  // ─── HEADER + BOTTONE NUOVO ISTITUTO ───
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
  html += '<div style="font-size:15px;font-weight:600;color:var(--text)">Anagrafica banche</div>';
  if (_isAdminBanche()) {
    html += '<button class="btn-primary" onclick="apriModalIstituto()" style="font-size:12px;padding:7px 14px">+ Nuovo istituto</button>';
  }
  html += '</div>';

  // ─── ELENCO ISTITUTI ───
  if (!_bancheIstituti.length) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px">Nessun istituto registrato</div>';
  } else {
    _bancheIstituti.forEach(ist => {
      const contiBanca = _bancheConti.filter(c => c.istituto_id === ist.id);
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
          html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 10px;background:var(--bg);border-left:3px solid #378ADD;border-radius:0 6px 6px 0;margin-bottom:4px;' + (cc.attivo ? '' : 'opacity:0.5') + '">';
          html += '<div style="flex:1">';
          html += '<div style="font-size:12px;font-weight:500">' + esc(cc.descrizione) + '</div>';
          html += '<div style="font-size:11px;color:var(--text-muted);font-family:var(--font-mono)">' + esc(ibanMasc) + '</div>';
          html += '</div>';
          html += '<div style="text-align:right;margin-right:10px">';
          html += '<div style="font-size:13px;font-weight:600;font-family:var(--font-mono);color:' + (Number(cc.saldo_attuale || 0) >= 0 ? '#639922' : '#A32D2D') + '">' + fmtE(Number(cc.saldo_attuale || 0)) + '</div>';
          html += '<div style="font-size:10px;color:var(--text-hint)">' + (cc.saldo_aggiornato ? 'agg. ' + fmtD(cc.saldo_aggiornato) : 'mai aggiornato') + '</div>';
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

  // Filtra in base allo stato
  const filtrati = _bancheFinanziamenti.filter(f => {
    if (_finFiltroStato === 'tutti') return true;
    return f.stato === _finFiltroStato;
  });

  // ─── KPI (calcolati su attivi, indipendenti dal filtro) ───
  const attivi = _bancheFinanziamenti.filter(f => f.stato === 'attivo');
  const nAttivi = attivi.length;
  const capitaleOrig = attivi.reduce((s, f) => s + Number(f.capitale || 0), 0);
  const residuoTot = attivi.reduce((s, f) => s + _calcResiduoOggi(f), 0);
  const rataMensileEquiv = attivi.reduce((s, f) => s + _calcRataMensileEquivalente(f), 0);

  let html = '';

  // KPI grid
  html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:12px;margin-bottom:18px">';
  html += '<div class="kpi"><div class="kpi-label">Attivi</div><div class="kpi-value">' + nAttivi + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Capitale originario</div><div class="kpi-value" style="color:#26215C">' + fmtE(capitaleOrig) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Residuo da pagare</div><div class="kpi-value" style="color:#A32D2D">' + fmtE(residuoTot) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Rata mensile equivalente</div><div class="kpi-value" style="color:#633806">' + fmtE(rataMensileEquiv) + '</div></div>';
  html += '</div>';

  // ─── Header con filtro + bottone nuovo ───
  html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;flex-wrap:wrap;gap:8px">';
  html += '<div style="display:flex;gap:8px;align-items:center">';
  html += '<label style="font-size:11px;color:var(--text-muted);font-weight:500">Stato</label>';
  html += '<select id="fin-filtro-stato" onchange="_aggiornaFiltroFinanziamenti(this.value)" style="font-size:12px;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">';
  html += '<option value="attivo" ' + (_finFiltroStato === 'attivo' ? 'selected' : '') + '>Attivi</option>';
  html += '<option value="estinto" ' + (_finFiltroStato === 'estinto' ? 'selected' : '') + '>Estinti</option>';
  html += '<option value="tutti" ' + (_finFiltroStato === 'tutti' ? 'selected' : '') + '>Tutti</option>';
  html += '</select>';
  html += '<span style="font-size:11px;color:var(--text-muted)">' + filtrati.length + ' finanziamento/i</span>';
  html += '</div>';
  if (_isAdminBanche()) {
    html += '<button class="btn-primary" onclick="apriModalFinanziamento()" style="font-size:12px;padding:7px 14px">+ Nuovo finanziamento</button>';
  }
  html += '</div>';

  // ─── Tabella ───
  if (!filtrati.length) {
    html += '<div style="padding:30px;text-align:center;color:var(--text-muted);background:var(--bg);border-radius:8px">Nessun finanziamento da mostrare</div>';
  } else {
    html += '<div style="overflow-x:auto;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    html += '<thead><tr style="background:var(--bg);border-bottom:0.5px solid var(--border)">';
    ['Banca','Finalità','Tipo','Categoria','Erogazione','Capitale','Residuo','Rata','Frequenza','Fine','Stato',''].forEach(h => {
      html += '<th style="text-align:left;padding:10px 8px;font-weight:600;color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.3px">' + h + '</th>';
    });
    html += '</tr></thead><tbody>';

    // Sort: attivi prima, poi data erogazione recente prima
    const sortati = filtrati.slice().sort((a, b) => {
      if (a.stato !== b.stato) return a.stato === 'attivo' ? -1 : 1;
      return (b.data_erogazione || '').localeCompare(a.data_erogazione || '');
    });

    sortati.forEach(f => {
      const istNome = (_bancheIstituti.find(i => i.id === f.istituto_id) || {}).nome || '—';
      const dataFine = _calcDataFine(f);
      const residuo = _calcResiduoOggi(f);
      const rataFmt = f.rata ? fmtE(Number(f.rata)) : '—';

      html += '<tr style="border-bottom:0.5px solid var(--border);' + (f.stato === 'estinto' ? 'opacity:0.55' : '') + '">';
      html += '<td style="padding:8px;font-weight:500">' + esc(istNome) + '</td>';
      html += '<td style="padding:8px">' + esc(f.descrizione || '—') + (f.numero_contratto ? '<div style="font-size:10px;color:var(--text-hint);font-family:var(--font-mono)">' + esc(f.numero_contratto) + '</div>' : '') + '</td>';
      html += '<td style="padding:8px">' + _badgeTipologia(f.tipologia) + '</td>';
      html += '<td style="padding:8px;font-size:11px">' + (f.categoria ? _badgeCategoria(f.categoria) : '<span style="color:var(--text-hint)">—</span>') + '</td>';
      html += '<td style="padding:8px;font-size:11px">' + fmtD(f.data_erogazione) + '</td>';
      html += '<td style="padding:8px;font-family:var(--font-mono);font-weight:500;text-align:right">' + fmtE(Number(f.capitale)) + '</td>';
      html += '<td style="padding:8px;font-family:var(--font-mono);font-weight:500;text-align:right;color:' + (residuo > 0 ? '#A32D2D' : '#639922') + '">' + fmtE(residuo) + '</td>';
      html += '<td style="padding:8px;font-family:var(--font-mono);text-align:right">' + rataFmt + '</td>';
      html += '<td style="padding:8px;font-size:11px">' + _badgeFrequenza(f.frequenza) + '</td>';
      html += '<td style="padding:8px;font-size:11px">' + (dataFine ? fmtD(dataFine) : '—') + '</td>';
      html += '<td style="padding:8px">' + _badgeStato(f.stato) + '</td>';
      html += '<td style="padding:8px;text-align:right;white-space:nowrap">';
      html += '<button onclick="apriPianoFinanziamento(\'' + f.id + '\')" title="Vedi piano di ammortamento" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px">📋</button>';
      if (_isAdminBanche()) {
        html += ' <button onclick="apriModalFinanziamento(\'' + f.id + '\')" title="Modifica" style="background:none;border:0.5px solid var(--border);color:var(--text);padding:4px 8px;border-radius:5px;cursor:pointer;font-size:11px">✏️</button>';
      }
      html += '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
    html += '</div>';
  }

  cont.innerHTML = html;
}

function _aggiornaFiltroFinanziamenti(val) {
  _finFiltroStato = val;
  renderBancheFinanziamenti();
}

// ═══ HELPER FINANZIAMENTI ═════════════════════════════════════════════════
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
  // Per attivi: usa rate caricate se ci sono, altrimenti fallback su capitale-quote_pagate
  // Nessuna rata caricata? Approssimazione: residuo = capitale (tutto da pagare)
  // Con rate: prendi residuo della prima rata futura
  return Number(f.capitale || 0); // fallback semplice; in modale piano vedremo dettaglio
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
  html += '<select id="mod-fin-istituto" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
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
  html += '<select id="mod-fin-tipologia" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['mutuo_ipotecario','prestito','finanziamento_agevolato','leasing'].forEach(t => {
    const lab = { mutuo_ipotecario:'Mutuo ipotecario', prestito:'Prestito', finanziamento_agevolato:'Agevolato', leasing:'Leasing' }[t];
    html += '<option value="' + t + '" ' + ((f?.tipologia || 'prestito') === t ? 'selected' : '') + '>' + lab + '</option>';
  });
  html += '</select></div>';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Categoria</label>';
  html += '<select id="mod-fin-categoria" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
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
  html += '<select id="mod-fin-tipo-tasso" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['fisso','variabile','misto','zero_coupon'].forEach(t => {
    html += '<option value="' + t + '" ' + ((f?.tipo_tasso || 'fisso') === t ? 'selected' : '') + '>' + t + '</option>';
  });
  html += '</select></div>';
  html += '</div>';

  // Durata + frequenza
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += _campo('Durata (n. rate) *', 'mod-fin-durata', f?.durata_rate ?? '', 'number', '120');
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Frequenza *</label>';
  html += '<select id="mod-fin-frequenza" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
  ['mensile','trimestrale','semestrale','annuale'].forEach(t => {
    html += '<option value="' + t + '" ' + ((f?.frequenza || 'mensile') === t ? 'selected' : '') + '>' + t + '</option>';
  });
  html += '</select></div>';
  html += '</div>';

  // Date
  html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  html += _campo('Data erogazione *', 'mod-fin-erog', f?.data_erogazione || '', 'date');
  html += _campo('Data prima rata *', 'mod-fin-prima-rata', f?.data_prima_rata || '', 'date');
  html += _campo('Rata calcolata (€)', 'mod-fin-rata', f?.rata ?? '', 'number', '0.00');
  html += '</div>';

  // Garanzia
  html += _campo('Garanzia', 'mod-fin-garanzia', f?.garanzia || '', 'text', 'Es. Ipoteca immobile');

  // Stato + data estinzione
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:11px;color:var(--text-muted);font-weight:500">Stato</label>';
  html += '<select id="mod-fin-stato" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
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

  let res;
  if (id) {
    res = await sb.from('banche_finanziamenti').update(payload).eq('id', id);
  } else {
    res = await sb.from('banche_finanziamenti').insert(payload);
  }

  if (res.error) { toast('❌ ' + res.error.message); return; }
  toast('✓ ' + (id ? 'Finanziamento aggiornato' : 'Finanziamento creato'));
  chiudiModal();
  // Refresh dati
  const finRes = await sb.from('banche_finanziamenti').select('*');
  _bancheFinanziamenti = finRes.data || [];
  delete _bancheRate[id]; // invalida cache rate
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
function renderBancheAffidamenti() {
  const cont = document.getElementById('banche-panel-affidamenti');
  if (!cont) return;

  const attivi = _bancheAffidamenti.filter(a => a.stato === 'attivo');

  // ─── KPI ───
  const totAccordato = attivi.reduce((s, a) => s + Number(a.importo_accordato || 0), 0);
  const totUtilizzato = attivi.reduce((s, a) => s + Number(a.importo_utilizzato || 0), 0);
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
    // Sort: per banca, poi per tipo
    const sortati = attivi.slice().sort((a, b) => {
      const nomeA = (_bancheIstituti.find(i => i.id === a.istituto_id) || {}).nome || '';
      const nomeB = (_bancheIstituti.find(i => i.id === b.istituto_id) || {}).nome || '';
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
      const utilizzato = Number(a.importo_utilizzato || 0);
      const pct = accordato > 0 ? (utilizzato / accordato * 100) : 0;
      const utilizzoColore = pct < 70 ? '#639922' : (pct < 85 ? '#D4A017' : '#A32D2D');
      const altoUtilizzo = pct > 90;
      const revisioneVicina = a.data_scadenza && a.data_scadenza >= oggiStr && a.data_scadenza <= in30gg;

      html += '<tr style="border-bottom:0.5px solid var(--border);' + (altoUtilizzo ? 'background:#FCEBEB' : '') + '">';
      html += '<td style="padding:8px;font-weight:500">' + esc(ist.nome || '—') + '</td>';
      html += '<td style="padding:8px">' + _badgeTipoFido(a.tipo) + '</td>';
      html += '<td style="padding:8px;font-family:var(--font-mono);text-align:right">' + fmtE(accordato) + '</td>';
      // Utilizzato editabile inline
      html += '<td style="padding:8px;font-family:var(--font-mono);text-align:right;cursor:' + (_isAdminBanche() ? 'pointer' : 'default') + '" ' + (_isAdminBanche() ? 'onclick="modificaUtilizzato(\'' + a.id + '\')" title="Click per modificare"' : '') + '>';
      html += fmtE(utilizzato);
      if (a.utilizzato_aggiornato) html += '<div style="font-size:9px;color:var(--text-hint);font-family:inherit;margin-top:2px">' + fmtD(a.utilizzato_aggiornato) + '</div>';
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
    html += '<div style="font-size:11px;color:var(--text-hint);margin-top:8px">Click sulla colonna "Utilizzato" per aggiornare l\'importo. CDF = Commissione Disponibilità Fondi sulla quota non utilizzata.</div>';
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
  html += '<select id="mod-aff-tipo" style="width:100%;padding:8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px;margin-top:3px">';
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
  html += _campo('Importo utilizzato (€)', 'mod-aff-utilizzato', a?.importo_utilizzato ?? 0, 'number', '0');
  html += '</div>';

  // Tassi
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += _campo('Tasso annuo %', 'mod-aff-tasso', a?.tasso ?? '', 'number', '0.00');
  html += _campo('CDF (% disponibilità non utiliz.)', 'mod-aff-cdf', a?.tasso_cdf ?? '', 'number', '0.00');
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

async function salvaAffidamento(id) {
  const accordato = Number(document.getElementById('mod-aff-accordato').value);
  if (!accordato || accordato <= 0) { toast('⚠ Importo accordato obbligatorio (>0)'); return; }

  const utilizzato = Number(document.getElementById('mod-aff-utilizzato').value) || 0;
  const today = new Date().toISOString().split('T')[0];

  const payload = {
    istituto_id: document.getElementById('mod-aff-istituto').value,
    conto_id: document.getElementById('mod-aff-conto').value || null,
    tipo: document.getElementById('mod-aff-tipo').value,
    importo_accordato: accordato,
    importo_utilizzato: utilizzato,
    utilizzato_aggiornato: today,
    tasso: Number(document.getElementById('mod-aff-tasso').value) || null,
    tasso_cdf: Number(document.getElementById('mod-aff-cdf').value) || null,
    data_delibera: document.getElementById('mod-aff-delibera').value || null,
    data_scadenza: document.getElementById('mod-aff-scadenza').value || null,
    stato: document.getElementById('mod-aff-stato').value,
    note: document.getElementById('mod-aff-note').value.trim() || null,
    updated_at: new Date().toISOString()
  };

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

  // Sort finanziamenti per data erogazione (più vecchi prima)
  const finSortati = finFiltrati.slice().sort((a, b) =>
    (a.data_erogazione || '').localeCompare(b.data_erogazione || '')
  );

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
  const attivi = _bancheAffidamenti.filter(a => a.stato === 'attivo');
  if (!attivi.length) { toast('⚠ Nessun affidamento attivo da stampare'); return; }

  // Raggruppo per istituto
  const perIstituto = {};
  attivi.forEach(a => {
    if (!perIstituto[a.istituto_id]) perIstituto[a.istituto_id] = [];
    perIstituto[a.istituto_id].push(a);
  });

  // Sort per nome istituto
  const istitutiSorted = Object.keys(perIstituto).sort((a, b) => {
    const nomeA = (_bancheIstituti.find(i => i.id === a) || {}).nome || '';
    const nomeB = (_bancheIstituti.find(i => i.id === b) || {}).nome || '';
    return nomeA.localeCompare(nomeB);
  });

  // Totali generali
  const totAccordato = attivi.reduce((s, a) => s + Number(a.importo_accordato || 0), 0);
  const totUtilizzato = attivi.reduce((s, a) => s + Number(a.importo_utilizzato || 0), 0);
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
    const subTotUti = fidi.reduce((s, f) => s + Number(f.importo_utilizzato || 0), 0);

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
      const utilizzato = Number(f.importo_utilizzato || 0);
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

  // Sort per data erogazione
  finanziamenti.sort((a, b) => (a.data_erogazione || '').localeCompare(b.data_erogazione || ''));

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
// KPI globale "onorati nel tempo" (sempre su TUTTI i finanziamenti) +
// barre di progresso per i finanziamenti visualizzati (rispetta toggle Solo attivi)
// Totali rate = capitale + interessi
function _renderPannelloProgressoFinanziamenti(finanziamenti, oggiStr) {
  if (!finanziamenti.length) return '';

  let html = '';
  html += '<div style="margin-top:18px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:16px">';

  // ─── KPI GLOBALE ONORATI (sempre su TUTTI i finanziamenti, indipendente dal toggle) ───
  const tutti = _bancheFinanziamenti || [];
  const estintiAll = tutti.filter(f => f.stato === 'estinto');
  const nTot = tutti.length;
  const nEst = estintiAll.length;
  const pctNum = nTot > 0 ? (nEst / nTot * 100) : 0;
  const valTot = tutti.reduce((s, f) => s + Number(f.capitale || 0), 0);
  const valEst = estintiAll.reduce((s, f) => s + Number(f.capitale || 0), 0);
  const pctVal = valTot > 0 ? (valEst / valTot * 100) : 0;

  if (nTot > 0) {
    html += '<div style="margin-bottom:18px;padding:14px 16px;background:linear-gradient(135deg,#27500A 0%,#3B6D11 100%);color:#fff;border-radius:10px">';
    html += '<div style="font-size:11px;text-transform:uppercase;letter-spacing:0.5px;opacity:0.85;margin-bottom:10px">📊 Finanziamenti onorati nel tempo</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px;align-items:center">';
    // Per numero
    html += '<div>';
    html += '<div style="font-size:10px;opacity:0.85;margin-bottom:3px">Per numero</div>';
    html += '<div style="font-size:18px;font-weight:600;font-family:var(--font-mono)">' + nEst + ' / ' + nTot + ' <span style="font-size:13px;opacity:0.85;font-weight:500">(' + pctNum.toFixed(0) + '%)</span></div>';
    html += '<div style="margin-top:6px;background:rgba(255,255,255,0.2);border-radius:5px;height:6px;overflow:hidden"><div style="width:' + pctNum + '%;height:100%;background:#EAF3DE"></div></div>';
    html += '</div>';
    // Per valore
    html += '<div>';
    html += '<div style="font-size:10px;opacity:0.85;margin-bottom:3px">Per valore (importo finanziato originale)</div>';
    html += '<div style="font-size:16px;font-weight:600;font-family:var(--font-mono)">' + fmtE(valEst) + ' <span style="font-size:11px;opacity:0.85;font-weight:500">su ' + fmtE(valTot) + '</span> <span style="font-size:13px;opacity:0.85;font-weight:500;margin-left:4px">(' + pctVal.toFixed(0) + '%)</span></div>';
    html += '<div style="margin-top:6px;background:rgba(255,255,255,0.2);border-radius:5px;height:6px;overflow:hidden"><div style="width:' + pctVal + '%;height:100%;background:#EAF3DE"></div></div>';
    html += '</div>';
    html += '</div>';
    html += '</div>';
  }

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

  // Riga TOTALE in fondo (sui finanziamenti visualizzati)
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
