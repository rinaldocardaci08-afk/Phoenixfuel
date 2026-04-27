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
