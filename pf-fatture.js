// ╔══════════════════════════════════════════════════════════════╗
// ║  pf-fatture.js  — Modulo Fatturazione PhoenixFuel           ║
// ║  Funzionalità:                                              ║
// ║  • Elenco fatture con filtri                                ║
// ║  • Nuova fattura da ordini confermati/consegnati            ║
// ║  • Generazione XML FatturaPA v1.2.2 per SDI                 ║
// ╚══════════════════════════════════════════════════════════════╝

'use strict';

// ── DATI CEDENTE (Phoenix Fuel Srl) ──────────────────────────
const CEDENTE = {
  ragioneSociale : 'Phoenix Fuel S.r.l.',
  piva           : '03124800796',      // <-- aggiorna se diverso
  codiceFiscale  : '03124800796',
  indirizzo      : 'Via Ariosto',
  numeroCivico   : 'snc',
  cap            : '89900',
  comune         : 'Vibo Valentia',
  provincia      : 'VV',
  nazione        : 'IT',
  telefono       : '',
  email          : '',
  regimeFiscale  : 'RF01',             // RF01 = Ordinario
  codiceAttivita : '46.71.10',         // Commercio ingrosso prodotti petroliferi
};

// ── Stato modulo ──────────────────────────────────────────────
let _fattureOrdiniSelezionati = new Set();
let _fatturaCorrente = null;
let _fattureClienteCache = [];

// ── Utils locali ──────────────────────────────────────────────
function _fmtE(v){ return '€ ' + Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _fmtL(v){ return Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0}) + ' L'; }
function _fmtD(d){ if(!d) return '—'; const p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; }
function _esc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;'); }
function _xmlNum(v,dec=2){ return Number(v||0).toFixed(dec); }
function _oggi(){ return new Date().toISOString().split('T')[0]; }
function _addDays(dateStr,days){ const d=new Date(dateStr); d.setDate(d.getDate()+days); return d.toISOString().split('T')[0]; }

function badgeFattura(stato){
  const map={
    bozza   :'<span style="background:#e8e8e8;color:#555;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:600">BOZZA</span>',
    emessa  :'<span style="background:#D4EDFF;color:#0C447C;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:600">EMESSA</span>',
    pagata  :'<span style="background:#DFF5E1;color:#2E7D32;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:600">PAGATA</span>',
    annullata:'<span style="background:#FFE4E4;color:#C62828;border-radius:12px;padding:2px 8px;font-size:10px;font-weight:600">ANNULLATA</span>',
  };
  return map[stato] || stato;
}

// ── Navigazione tab ───────────────────────────────────────────
function switchFattureTab(btn){
  document.querySelectorAll('.fatt-tab').forEach(b=>{
    b.style.background='var(--bg)'; b.style.color='var(--text)'; b.style.border='0.5px solid var(--border)';
  });
  btn.style.background='var(--primary)'; btn.style.color='#fff'; btn.style.border='none';
  const tab = btn.dataset.tab;
  document.querySelectorAll('.fatt-panel').forEach(p=>{ p.style.display='none'; });
  const panel = document.getElementById(tab);
  if(panel) panel.style.display='block';
}

// ═════════════════════════════════════════════════════════════
// TAB 1 — ELENCO FATTURE
// ═════════════════════════════════════════════════════════════

// STEP 3b (17/07): elimina una fattura per intero. Distinta dallo storno nota credito
// (che invece TIENE la fattura marcata annullata e brucia il numero). Qui il numero
// torna LIBERO — è per correggere una fattura inserita per errore.
async function eliminaFattura(fatturaId){
  var fx = await sb.from('fatture_emesse').select('numero,anno,cessionario_denominazione').eq('id', fatturaId).maybeSingle();
  var f = fx.data;
  if (!f) { toast('Fattura non trovata'); return; }
  var righe = await _pfFetchAllPages(function(){ return sb.from('fatture_righe').select('id').eq('fattura_id', fatturaId); });
  var rigaIds = (righe||[]).map(function(r){ return r.id; });
  var ordCollegati = await _pfFetchAllPages(function(){ return sb.from('ordini').select('id').eq('fattura_id', fatturaId); });
  var nOrd = (ordCollegati||[]).length;
  if (!confirm('Eliminare la fattura ' + f.numero + '/' + (f.anno||'') + ' (' + (f.cessionario_denominazione||'') + ')?\n\n'
    + '• ' + rigaIds.length + ' righe fattura eliminate\n'
    + '• ' + nOrd + ' consegne sganciate → torneranno "da fatturare"\n'
    + '• il numero ' + f.numero + ' tornerà LIBERO e riutilizzabile\n\n'
    + 'Da usare per una fattura inserita per errore. Se invece è una fattura vera da stornare, usa la nota di credito. Procedere?')) return;
  // 1) Sgancia gli ordini (per fattura_id e per riga)
  await sb.from('ordini').update({ fattura_id: null, fattura_riga_id: null, aggancio_manuale: false }).eq('fattura_id', fatturaId);
  if (rigaIds.length) await sb.from('ordini').update({ fattura_id: null, fattura_riga_id: null, aggancio_manuale: false }).in('fattura_riga_id', rigaIds);
  // 2) Elimina le righe
  await sb.from('fatture_righe').delete().eq('fattura_id', fatturaId);
  // 3) Elimina la fattura
  var del = await sb.from('fatture_emesse').delete().eq('id', fatturaId);
  if (del.error) { toast('Errore eliminazione: ' + del.error.message); return; }
  if (typeof _auditLog === 'function') _auditLog('elimina_fattura', 'fatture_emesse', 'Eliminata fattura ' + f.numero + '/' + (f.anno||'') + ' — ' + nOrd + ' ordini sganciati');
  toast('🗑️ Fattura ' + f.numero + ' eliminata · ' + nOrd + ' consegne liberate');
  if (typeof caricaFatture === 'function') caricaFatture();
}

async function caricaFatture(){
  const anno     = document.getElementById('fatt-filtro-anno')?.value || new Date().getFullYear();
  const mese     = document.getElementById('fatt-filtro-mese')?.value || '';
  const clId     = document.getElementById('fatt-filtro-cliente')?.value || '';
  const search   = (document.getElementById('fatt-filtro-search')?.value || '').trim();

  const tb = document.getElementById('fatt-elenco-tbody');
  if(!tb) return;
  tb.innerHTML = '<tr><td colspan="9" class="loading">Caricamento…</td></tr>';

  // Range date in base ad anno+mese (legge da fatture_emesse.data)
  const annoInt = parseInt(anno);
  let dataMin, dataMax;
  if (mese) {
    const mInt = parseInt(mese);
    dataMin = `${annoInt}-${String(mInt).padStart(2,'0')}-01`;
    const lastDay = new Date(annoInt, mInt, 0).getDate();
    dataMax = `${annoInt}-${String(mInt).padStart(2,'0')}-${String(lastDay).padStart(2,'0')}`;
  } else {
    dataMin = `${annoInt}-01-01`;
    dataMax = `${annoInt}-12-31`;
  }

  let q = sb.from('fatture_emesse').select('*').gte('data', dataMin).lte('data', dataMax).order('data', {ascending:false}).order('numero', {ascending:false});
  if(clId) q = q.eq('cliente_id', clId);
  if(search){
    // Filtra su numero o PIVA cessionario o denominazione (ILIKE)
    q = q.or(`numero.ilike.%${search}%,cessionario_piva.ilike.%${search}%,cessionario_denominazione.ilike.%${search}%`);
  }

  const { data: fatture, error } = await q;
  if(error){ tb.innerHTML='<tr><td colspan="9" style="color:red">Errore: '+_esc(error.message)+'</td></tr>'; return; }

  if(!fatture||!fatture.length){
    tb.innerHTML='<tr><td colspan="9" class="loading">Nessuna fattura per il periodo selezionato</td></tr>';
    _aggiornaTotaliFatture([]);
    return;
  }

  _aggiornaTotaliFatture(fatture);

  // Badge match_status → colore
  const badgeMatch = (st) => {
    const map = {
      'matched':   '<span style="background:#639922;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">✓ Matched</span>',
      'uncertain': '<span style="background:#D4A017;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">⚠ Revisione</span>',
      'orphan':    '<span style="background:#A32D2D;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">✗ Orfana</span>',
      'pending':   '<span style="background:#888;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">· Pending</span>',
    };
    return map[st] || `<span style="background:#ccc;padding:2px 8px;border-radius:10px;font-size:10px">${_esc(st||'—')}</span>`;
  };

  tb.innerHTML = fatture.map(f=>{
    const clienteShow = f.cessionario_denominazione || '—';
    const pivaShow = f.cessionario_piva || '—';
    return `
      <tr>
        <td style="font-family:var(--font-mono);font-weight:600">${_esc(f.numero)}/${f.anno||'?'}</td>
        <td>${_fmtD(f.data)}</td>
        <td style="max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="${_esc(clienteShow)}">${_esc(clienteShow)}</td>
        <td style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted)">${_esc(pivaShow)}</td>
        <td style="text-align:right;font-family:var(--font-mono)">${_fmtE(f.imponibile_totale)}</td>
        <td style="text-align:right;font-family:var(--font-mono)">${_fmtE(f.iva_totale)}</td>
        <td style="text-align:right;font-family:var(--font-mono);font-weight:600">${_fmtE(f.importo_totale)}</td>
        <td>${badgeMatch(f.match_status)}</td>
        <td>
          <button class="btn-primary" style="font-size:10px;padding:3px 8px" onclick="apriDettaglioFattura('${f.id}')" title="Dettaglio fattura">📄</button>
          <button onclick="allDiagnosticaFattura('${f.id}')" title="Diagnostica: vedi ordini collegati e sganciali se sbagliati" style="background:#0E6F8E;color:white;border:0;border-radius:3px;padding:3px 6px;font-size:10px;cursor:pointer;margin-left:2px">🔍</button>
          <button onclick="eliminaFattura('${f.id}')" title="Elimina fattura (sgancia le consegne, il numero torna riutilizzabile)" style="background:#FCEBEB;color:#A32D2D;border:0.5px solid #F09595;border-radius:3px;padding:3px 7px;font-size:10px;cursor:pointer;margin-left:2px">🗑️</button>
        </td>
      </tr>
    `;
  }).join('');

  // Dashboard sopra la tabella (async, non blocca il render elenco)
  caricaDashboardFatture(fatture, dataMin, dataMax);
}

function _aggiornaTotaliFatture(fatture){
  // Fatture_emesse usa: imponibile_totale, iva_totale, importo_totale (NON imponibile/iva/totale)
  // Nota: i KPI sono stati sostituiti dalla dashboard integrata. Queste assegnazioni
  // restano per backward-compat con eventuali markup che ancora usano gli id vecchi.
  const imp = fatture.reduce((s,f)=>s+Number(f.imponibile_totale||0),0);
  const iva = fatture.reduce((s,f)=>s+Number(f.iva_totale||0),0);
  const tot = fatture.reduce((s,f)=>s+Number(f.importo_totale||0),0);
  const el1 = document.getElementById('fatt-tot-imponibile');
  const el2 = document.getElementById('fatt-tot-iva');
  const el3 = document.getElementById('fatt-tot-totale');
  const el4 = document.getElementById('fatt-tot-da-incassare');
  if (el1) el1.textContent = _fmtE(imp);
  if (el2) el2.textContent = _fmtE(iva);
  if (el3) el3.textContent = _fmtE(tot);
  if (el4) el4.textContent = _fmtE(tot);
}

// ═══════════════════════════════════════════════════════════════════════════
// DASHBOARD FATTURE — controllo integrità + KPI del periodo
// ═══════════════════════════════════════════════════════════════════════════
// Chiamata da caricaFatture() dopo il render elenco. Popola il blocco
// #fatt-dashboard sopra la tabella.
// Query parallele per performance:
//   - ordini clienti nel periodo (per calcolare "senza fattura")
//   - fatture_righe con ordine_id popolato (per sottrarre i già fatturati)
//   - fatture_emesse con match_status='orphan' (fatture senza ordine)
//   - pagamenti con scadenza futura (incasso previsto)
// ═══════════════════════════════════════════════════════════════════════════
async function caricaDashboardFatture(fatture, dataMin, dataMax) {
  const wrap = document.getElementById('fatt-dashboard');
  if (!wrap) return;

  wrap.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:14px">⏳ Calcolo dashboard...</div>';

  try {
    // ── 1. Totali fatturato (calcolati dai dati già caricati) ──
    const imp = fatture.reduce((s,f)=>s+Number(f.imponibile_totale||0),0);
    const iva = fatture.reduce((s,f)=>s+Number(f.iva_totale||0),0);
    const tot = fatture.reduce((s,f)=>s+Number(f.importo_totale||0),0);
    const nFatture = fatture.length;
    const fattureOrfane = fatture.filter(f => f.match_status === 'orphan').length;

    // ── 2. Top 5 clienti per totale ──
    const perCliente = {};
    fatture.forEach(f => {
      const key = f.cliente_id || f.cessionario_piva || f.cessionario_denominazione;
      if (!perCliente[key]) perCliente[key] = { nome: f.cessionario_denominazione || '?', totale: 0, n: 0 };
      perCliente[key].totale += Number(f.importo_totale||0);
      perCliente[key].n++;
    });
    const top5 = Object.values(perCliente).sort((a,b)=>b.totale-a.totale).slice(0,5);

    // ── 3. Query parallele: ordini del periodo + fatture per riepilogo mensile ──
    // Per il riepilogo mensile servono: dati ordini+fatture dell'intero anno, non solo mese selezionato
    const annoInt = parseInt(dataMin.substring(0, 4));
    const annoMin = `${annoInt}-01-01`;
    const annoMax = `${annoInt}-12-31`;

    const [ordiniRes, ordiniAnnoRes, fattureAnnoRes, righeAnnoRes] = await Promise.all([
      // Ordini clienti consegnati nel periodo selezionato.
      // fattura_id popolato = già fatturato. IS NULL = da fatturare.
      _pfFetchAllPages(function(){ return sb.from('ordini')
        .select('id, data, cliente, cliente_id, prodotto, litri, costo_litro, trasporto_litro, margine, iva, stato, fattura_id')
        .eq('tipo_ordine', 'cliente')
        .eq('stato', 'consegnato')
        .gte('data', dataMin).lte('data', dataMax); }),
      // Tutti gli ordini clienti consegnati dell'ANNO (per riepilogo mensile) — con aggancio fattura
      _pfFetchAllPages(function(){ return sb.from('ordini')
        .select('id, data, fattura_id, fattura_riga_id')
        .eq('tipo_ordine', 'cliente')
        .eq('stato', 'consegnato')
        .gte('data', annoMin).lte('data', annoMax); }),
      // Tutte le fatture dell'ANNO (per riepilogo mensile)
      _pfFetchAllPages(function(){ return sb.from('fatture_emesse')
        .select('id, data')
        .gte('data', annoMin).lte('data', annoMax); }),
      // Tutte le righe fattura "vere" (con prodotto+quantità) dell'ANNO — FIX 16/07 paginazione (bug 1000 righe)
      // Il riepilogo deve confrontare ordini ↔ righe fattura, non documenti fattura,
      // perché 1 fattura Danea può aggregare più consegne (più ordini PhoenixFuel).
      _pfFetchAllPages(function(){ return sb.from('fatture_righe')
        .select('id, fattura_id, prodotto_normalizzato, quantita, ignora_match')
        .not('prodotto_normalizzato', 'is', null)
        .gt('quantita', 0); }),
    ]);

    const ordini = ordiniRes || [];
    const ordiniAnno = ordiniAnnoRes || [];
    const fattureAnno = fattureAnnoRes || [];
    const righeAnnoTutte = righeAnnoRes || [];

    // Indicizzo righe per fattura_id e mese (la riga eredita la data dalla fattura)
    const fattDataById = new Map();
    fattureAnno.forEach(f => fattDataById.set(f.id, f.data));
    const righeAnno = righeAnnoTutte
      .filter(r => fattDataById.has(r.fattura_id) && !r.ignora_match)
      .map(r => ({ ...r, data: fattDataById.get(r.fattura_id) }));

    // Ordini senza fattura: istantaneo, lettura diretta dal campo fattura_id
    const ordiniSenzaFatt = ordini.filter(o => !o.fattura_id);
    const nOrdSenzaFatt = ordiniSenzaFatt.length;
    const impOrdSenzaFatt = ordiniSenzaFatt.reduce((s,o) => {
      const noIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
      return s + noIva * Number(o.litri||0);
    }, 0);

    // Salva lista per apertura modale
    window._fattOrdiniSenzaFatt = ordiniSenzaFatt;
    window._fattFattureOrfane = fatture.filter(f => f.match_status === 'orphan');

    // ── 4. Riepilogo mensile: conteggio ordini vs fatture per ogni mese dell'anno ──
    const meseLabel = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                       'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
    const riepMesi = [];
    for (let m = 1; m <= 12; m++) {
      const mPad = String(m).padStart(2,'0');
      const prefix = `${annoInt}-${mPad}`;
      const ordMese = ordiniAnno.filter(o => o.data && o.data.startsWith(prefix));
      const nOrd = ordMese.length;
      // Ordini del mese SENZA aggancio a una fattura (né fattura_id né fattura_riga_id) — FIX 16/07
      const nNonAgg = ordMese.filter(o => !o.fattura_id && !o.fattura_riga_id).length;
      // Conto le RIGHE fattura del mese (non i documenti) — 1 fattura Danea può aggregare più consegne
      const nFatt = righeAnno.filter(r => r.data && r.data.startsWith(prefix)).length;
      // Skip mesi completamente vuoti (futuri)
      if (nOrd === 0 && nFatt === 0) continue;
      riepMesi.push({ mese: m, label: meseLabel[m-1], ordini: nOrd, fatture: nFatt, nonAgganciati: nNonAgg });
    }

    // ── 4b. Ultimo mese con fatture importate (per banner promemoria) ──
    const mesiConFatture = riepMesi.filter(r => r.fatture > 0).map(r => r.mese);
    const ultimoMeseImportato = mesiConFatture.length > 0 ? Math.max(...mesiConFatture) : null;
    const oggi = new Date();
    const meseCorrente = oggi.getMonth() + 1;
    const annoCorrente = oggi.getFullYear();
    // Mostra banner solo se siamo nell'anno corrente + ultimo mese importato è vecchio di 1+ mese
    const mostraBannerImport = annoInt === annoCorrente && ultimoMeseImportato && (meseCorrente - ultimoMeseImportato >= 1);
    const meseLabelLower = meseLabel.map(m => m.toLowerCase());

    // ── 5. Render dashboard ──
    wrap.innerHTML = `
      ${mostraBannerImport ? `
        <div style="background:#EEEDFE;border-left:4px solid #6B5FCC;padding:10px 14px;border-radius:6px;margin-bottom:10px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px">
          <div style="font-size:12px;color:#26215C">
            ℹ️ Ultimo mese con fatture importate: <strong>${meseLabel[ultimoMeseImportato-1]} ${annoInt}</strong>.
            Ricordati di importare lo ZIP Danea dei mesi successivi per avere i dati aggiornati.
          </div>
          <button class="btn-primary" style="font-size:11px;padding:5px 12px;background:#6B5FCC"
                  onclick="document.querySelector('[data-tab=fatt-panel-import]')?.click()">
            📥 Vai a Import Danea
          </button>
        </div>
      ` : ''}

      <!-- KPI fatturato (3 card) -->
      <div class="grid4" style="margin-bottom:10px;display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div class="kpi"><div class="kpi-label">Imponibile</div><div class="kpi-value">${_fmtE(imp)}</div></div>
        <div class="kpi"><div class="kpi-label">IVA</div><div class="kpi-value">${_fmtE(iva)}</div></div>
        <div class="kpi" style="background:#EAF3DE"><div class="kpi-label">Totale fatturato</div><div class="kpi-value" style="color:#27500A">${_fmtE(tot)}</div></div>
        <div class="kpi"><div class="kpi-label">Fatture importate</div><div class="kpi-value">${nFatture}</div></div>
      </div>

      <!-- Alert controllo integrità -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div style="background:${nOrdSenzaFatt>0?'#FFF7E6':'#F4FAEC'};border-left:4px solid ${nOrdSenzaFatt>0?'#D4A017':'#639922'};padding:12px 14px;border-radius:6px">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px">
            <div style="flex:1;cursor:${nOrdSenzaFatt>0?'pointer':'default'}"
                 ${nOrdSenzaFatt>0?'onclick="apriListaOrdiniSenzaFattura()"':''}>
              <div style="font-size:11px;color:${nOrdSenzaFatt>0?'#8B6A00':'#27500A'};text-transform:uppercase;font-weight:600">
                ${nOrdSenzaFatt>0?'⚠':'✓'} Ordini senza fattura
              </div>
              <div style="font-size:22px;font-weight:700;font-family:var(--font-mono);color:${nOrdSenzaFatt>0?'#8B6A00':'#27500A'};margin-top:4px">${nOrdSenzaFatt}</div>
              <div style="font-size:11px;color:${nOrdSenzaFatt>0?'#8B6A00':'#27500A'}">
                ${nOrdSenzaFatt>0 ? 'Totale: '+_fmtE(impOrdSenzaFatt)+' · Clicca per lista' : 'Tutti gli ordini del periodo sono fatturati'}
              </div>
            </div>
            ${nOrdSenzaFatt>0 ? `
              <div style="display:flex;gap:6px;flex-wrap:wrap">
                <button onclick="event.stopPropagation(); matchingOrdiniFattureDaDashboard(${annoInt})"
                        title="Aggancia automaticamente ordini ↔ fatture per cliente+prodotto+litri+imponibile+data±2gg. Sicuro e ripetibile."
                        style="background:#639922;color:white;border:0;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">
                  🔄 Aggancia automatico
                </button>
                <button onclick="event.stopPropagation(); avviaRicalcoloNa1DaDashboard('${dataMin}','${dataMax}')"
                        title="Rilancia il matcher: cerca fatture con 1 riga che copre più ordini (N:1). Utile quando vedi 'ordini senza fattura' che in realtà sono già stati fatturati insieme ad altri."
                        style="background:#D4A017;color:white;border:0;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">
                  🔁 Ricalcola match N:1
                </button>
              </div>
            ` : ''}
          </div>
          <div id="dashboard-ricalcolo-output" style="margin-top:10px"></div>
        </div>
        <div style="background:${fattureOrfane>0?'#FDECEC':'#F4FAEC'};border-left:4px solid ${fattureOrfane>0?'#A32D2D':'#639922'};padding:12px 14px;border-radius:6px;cursor:${fattureOrfane>0?'pointer':'default'}"
             ${fattureOrfane>0?'onclick="apriListaFattureOrfane()"':''}>
          <div style="font-size:11px;color:${fattureOrfane>0?'#791F1F':'#27500A'};text-transform:uppercase;font-weight:600">
            ${fattureOrfane>0?'✗':'✓'} Fatture senza ordine
          </div>
          <div style="font-size:22px;font-weight:700;font-family:var(--font-mono);color:${fattureOrfane>0?'#791F1F':'#27500A'};margin-top:4px">${fattureOrfane}</div>
          <div style="font-size:11px;color:${fattureOrfane>0?'#791F1F':'#27500A'}">
            ${fattureOrfane>0 ? 'Clicca per lista · da rivedere' : 'Tutte le fatture sono collegate a un ordine'}
          </div>
        </div>
      </div>

      <!-- Top 5 clienti + Riepilogo mensile -->
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px">
        <div class="card" style="padding:12px">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:8px">🏆 Top 5 clienti per fatturato</div>
          ${top5.length > 0 ? top5.map((c,i) => `
            <div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:0.5px solid var(--border);font-size:12px">
              <div style="max-width:60%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">
                <span style="color:var(--text-muted);font-family:var(--font-mono);margin-right:4px">${i+1}.</span>
                ${_esc(c.nome.substring(0,35))}
                <span style="font-size:10px;color:var(--text-muted)"> · ${c.n} ${c.n===1?'fatt.':'fatture'}</span>
              </div>
              <span style="font-family:var(--font-mono);font-weight:600">${_fmtE(c.totale)}</span>
            </div>
          `).join('') : '<div style="text-align:center;color:var(--text-muted);padding:8px;font-size:11px">Nessun dato</div>'}
        </div>
        <div class="card" style="padding:12px">
          <div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;font-weight:600;margin-bottom:8px">📅 Riepilogo mensile ${annoInt} (ordini vs fatture)</div>
          ${riepMesi.length > 0 ? `
            <div style="max-height:220px;overflow-y:auto">
              <table style="width:100%;font-size:11px">
                <thead><tr style="color:var(--text-muted);font-size:10px">
                  <th style="text-align:left;padding:2px 4px">Mese</th>
                  <th style="text-align:right;padding:2px 4px">Ordini</th>
                  <th style="text-align:right;padding:2px 4px">Fatture</th>
                  <th style="text-align:center;padding:2px 4px">Stato</th>
                </tr></thead>
                <tbody>
                  ${riepMesi.map(r => {
                    const diff = r.ordini - r.fatture;
                    const nonAgg = r.nonAgganciati || 0;
                    let stato, colore;
                    if (r.ordini === 0 && r.fatture === 0) { stato = '—'; colore = '#888'; }
                    else if (r.fatture === 0 && r.ordini > 0) { stato = '⏳ Non importato'; colore = '#6B5FCC'; }
                    else if (nonAgg > 0) { stato = `⚠ ${nonAgg} da agganciare`; colore = '#B02A1A'; }
                    else if (diff === 0) { stato = '✓ Chiuso'; colore = '#639922'; }
                    else if (diff > 0) { stato = `⚠ ${diff} da fatturare`; colore = '#D4A017'; }
                    else { stato = `+${-diff} extra`; colore = '#8B6A00'; }
                    return `
                      <tr style="border-bottom:0.5px solid var(--border)">
                        <td style="padding:3px 4px">${r.label}</td>
                        <td style="padding:3px 4px;text-align:right;font-family:var(--font-mono)">${r.ordini}</td>
                        <td style="padding:3px 4px;text-align:right;font-family:var(--font-mono)">${r.fatture}</td>
                        <td style="padding:3px 4px;text-align:center;color:${colore};font-size:10px;font-weight:600">${stato}</td>
                      </tr>
                    `;
                  }).join('')}
                </tbody>
              </table>
            </div>
          ` : '<div style="text-align:center;color:var(--text-muted);padding:8px;font-size:11px">Nessun dato per l\'anno ' + annoInt + '</div>'}
        </div>
      </div>
    `;

  } catch (e) {
    console.error('[caricaDashboardFatture]', e);
    wrap.innerHTML = '<div style="background:#FDECEC;border-left:3px solid #A32D2D;padding:10px;border-radius:4px;color:#791F1F;font-size:12px">Errore caricamento dashboard: ' + _esc(e.message) + '</div>';
  }
}

// Wrapper chiamato dal bottone "🔄 Aggancia automatico" nella card gialla.
// Lancia la RPC Postgres matching_ordini_fatture(anno) che aggancia ordini ↔ righe fattura
// per cliente+prodotto+litri+imponibile+data±2gg. Idempotente: rilanciabile senza rischi.
async function matchingOrdiniFattureDaDashboard(anno) {
  const out = document.getElementById('dashboard-ricalcolo-output');
  if (!out) return;
  if (!confirm('Aggancia automaticamente ordini ↔ fatture per anno ' + anno + '?\n\nRegole match: cliente (PIVA) + prodotto + litri + imponibile (∆<€1) + data (±2gg).\nSicuro: non tocca ordini già collegati. Rilanciabile.')) return;

  out.innerHTML = '<div style="padding:8px;background:#FAEEDA;color:#633806;border-radius:4px;font-size:12px">⏳ Matching in corso...</div>';

  try {
    const { data, error } = await sb.rpc('matching_ordini_fatture', { p_anno: anno });
    if (error) throw error;
    const r = (data && data[0]) || { ordini_collegati: 0, totale_processati: 0 };
    out.innerHTML =
      '<div style="padding:10px;background:#EAF3DE;color:#27500A;border-radius:6px;font-size:12px;line-height:1.5">' +
        '<strong>✓ Matching completato</strong><br>' +
        'Ordini collegati: <strong>' + r.ordini_collegati + '</strong><br>' +
        'Ordini ancora senza fattura: <strong>' + (r.totale_processati - r.ordini_collegati) + '</strong><br>' +
        '<span style="font-size:11px;color:#666">Ricarica la dashboard per vedere il riepilogo aggiornato.</span>' +
      '</div>';
    setTimeout(() => caricaDati(), 1500);
  } catch (e) {
    out.innerHTML = '<div style="padding:8px;background:#FCEBEB;color:#791F1F;border-radius:4px;font-size:12px">❌ Errore: ' + (e.message || e) + '</div>';
  }
}


// Wrapper chiamato dal bottone "🔁 Ricalcola match N:1" nella card gialla della dashboard.
// Riusa la funzione _avviaRicalcoloNa1 del modulo pfFattureImport (che conosce il matcher),
// al termine ricarica la dashboard per vedere i KPI aggiornati.
async function avviaRicalcoloNa1DaDashboard(dataMin, dataMax) {
  if (!window.pfFattureImport || !window.pfFattureImport._avviaRicalcoloNa1) {
    alert('Modulo import fatture non disponibile. Ricarica la pagina.');
    return;
  }
  const labelPeriodo = dataMin.substring(0,7) === dataMax.substring(0,7)
    ? dataMin.substring(0,7).replace('-', '/')
    : `${dataMin.substring(0,7).replace('-','/')} → ${dataMax.substring(0,7).replace('-','/')}`;
  try {
    await window.pfFattureImport._avviaRicalcoloNa1({
      dataMin,
      dataMax,
      targetElId: 'dashboard-ricalcolo-output',
      labelPeriodo,
    });
    // Alla fine: ricarico l'elenco dopo 1.5s (tempo di leggere il log)
    // caricaFatture() rilancia anche caricaDashboardFatture internamente.
    setTimeout(() => {
      if (typeof caricaFatture === 'function') caricaFatture();
    }, 1500);
  } catch(e) {
    console.error('[dashboard-rim]', e);
    const out = document.getElementById('dashboard-ricalcolo-output');
    if (out) out.innerHTML = `<div style="background:#FDECEC;border-left:3px solid #A32D2D;padding:8px;border-radius:4px;color:#791F1F;font-size:11px">Errore: ${_esc(e.message)}</div>`;
  }
}

// Modale: lista ordini clienti nel periodo senza fattura Danea corrispondente
// ════════════════════════════════════════════════════════════════════════════
// PAGINA ALLINEAMENTO ORDINI ↔ FATTURE
//
// Modale full-screen che mostra:
// - SX: ordini consegnati senza fattura (ordini.fattura_id IS NULL)
// - DX: righe fattura senza ordine (fr.id non puntata da nessun ordini.fattura_riga_id)
//
// Su ogni elemento, bottoni operativi:
//   ordine →  ✏️ Modifica · 🔗 Collega a fattura · 📋 Apri scheda
//   riga   →  🔗 Collega a ordine · ➕ Crea ordine · 🚫 Ignora
//
// Filtri: anno + mese + cliente + cerca
// ════════════════════════════════════════════════════════════════════════════

// Cache dati per non ricaricare ad ogni interazione
window._allineamento = {
  ordini: [],          // ordini senza fattura
  righeOrfane: [],     // righe fattura senza ordine
  filtri: { anno: null, mese: null, cliente: '', cerca: '' },
};

async function apriPaginaAllineamento(annoIniziale, meseIniziale) {
  const filtri = window._allineamento.filtri;
  filtri.anno = annoIniziale || filtri.anno || new Date().getFullYear();
  filtri.mese = meseIniziale != null ? meseIniziale : filtri.mese;

  // Patch v20260503g: trasformato in overlay fullscreen (più spazio per liste lunghe)
  // Rimuovo eventuale overlay precedente
  const existing = document.getElementById('all-fullscreen-overlay');
  if (existing) existing.remove();

  const html = `
    <div id="all-fullscreen-overlay" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:99997;display:flex;align-items:center;justify-content:center;padding:16px"
         onclick="if(event.target===this)allChiudiFullscreen()">
      <div style="background:white;border-radius:12px;width:100%;height:calc(100vh - 32px);display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(0,0,0,0.35);overflow:hidden">

        <!-- Header -->
        <div style="padding:14px 20px;border-bottom:0.5px solid var(--border);background:#FAF8F2;flex-shrink:0">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:12px;margin-bottom:10px">
            <div>
              <h2 style="margin:0 0 4px 0;color:#26215C;font-size:18px">⚖ Allineamento ordini ↔ fatture</h2>
              <div style="font-size:11px;color:#666">
                Sistema gli ordini senza fattura e le righe fattura senza ordine.
                I bottoni "🔗 Collega" mostrano solo controparti compatibili (cliente+prodotto+data).
              </div>
            </div>
            <button onclick="allChiudiFullscreen()" title="Chiudi" style="font-size:14px;padding:8px 12px;background:white;border:0.5px solid var(--border);border-radius:6px;cursor:pointer;flex-shrink:0">✕</button>
          </div>

          <!-- Filtri -->
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11px">
            <label style="font-weight:600;color:#555">Anno:</label>
            <select id="all-f-anno" onchange="caricaAllineamento()" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px">
              ${[2026,2025,2024,2023].map(y => `<option value="${y}" ${y==filtri.anno?'selected':''}>${y}</option>`).join('')}
            </select>
            <label style="font-weight:600;color:#555;margin-left:6px">Mese:</label>
            <select id="all-f-mese" onchange="caricaAllineamento()" style="padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px">
              <option value="">Tutto l'anno</option>
              ${['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']
                .map((n,i) => `<option value="${i+1}" ${(i+1)==filtri.mese?'selected':''}>${n}</option>`).join('')}
            </select>
            <input id="all-f-cerca" type="text" placeholder="🔍 Cerca cliente / numero fattura..."
                   oninput="filtraAllineamento()" value="${_esc(filtri.cerca||'')}"
                   style="flex:1;min-width:180px;padding:4px 8px;border:1px solid #ccc;border-radius:4px;font-size:11px">
            <button class="btn-primary" onclick="caricaAllineamento()" style="font-size:11px;padding:4px 10px">🔄 Ricarica</button>
            <button onclick="allDiagSanaTutteLeNote()" title="Sanatoria globale: marca tutte le righe-nota (descrittive senza prodotto/qta/prezzo) come ignorate. Ripulisce lo storico import precedenti alla v20260503n."
                    style="font-size:11px;padding:4px 10px;background:#4933C3;color:white;border:0;border-radius:4px;cursor:pointer">📝 Sana note</button>
          </div>
        </div>

        <!-- Patch v20260503q: banner anomalie (righe doppie) -->
        <div id="all-banner-anomalie"></div>

        <!-- Body 2 colonne -->
        <div style="flex:1;display:grid;grid-template-columns:1fr 1fr;gap:10px;padding:14px 20px;overflow:hidden">
          <!-- SX: ordini senza fattura -->
          <div style="border:1px solid #e8e5dc;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;min-height:0">
            <div style="background:#FFF7E6;padding:10px 14px;border-bottom:1px solid #e8e5dc;flex-shrink:0">
              <div style="font-size:13px;font-weight:700;color:#8B6A00">⚠ Ordini senza fattura <span id="all-cnt-ord" style="font-family:monospace">…</span></div>
              <div style="font-size:10px;color:#8B6A00" id="all-tot-ord"></div>
            </div>
            <div id="all-lista-ord" style="flex:1;overflow-y:auto;padding:8px;min-height:0">
              <div style="text-align:center;color:#888;padding:20px;font-size:11px">Caricamento…</div>
            </div>
          </div>
          <!-- DX: righe fattura senza ordine -->
          <div style="border:1px solid #e8e5dc;border-radius:6px;display:flex;flex-direction:column;overflow:hidden;min-height:0">
            <div style="background:#FDECEC;padding:10px 14px;border-bottom:1px solid #e8e5dc;flex-shrink:0">
              <div style="font-size:13px;font-weight:700;color:#791F1F">✗ Righe fattura senza ordine <span id="all-cnt-fatt" style="font-family:monospace">…</span></div>
              <div style="font-size:10px;color:#791F1F" id="all-tot-fatt"></div>
            </div>
            <div id="all-lista-fatt" style="flex:1;overflow-y:auto;padding:8px;min-height:0">
              <div style="text-align:center;color:#888;padding:20px;font-size:11px">Caricamento…</div>
            </div>
          </div>
        </div>

      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', html);

  // Carico dati
  await caricaAllineamento();
}


// Patch v20260503g: chiusura fullscreen + listener ESC
function allChiudiFullscreen() {
  const ov = document.getElementById('all-fullscreen-overlay');
  if (ov) ov.remove();
}

// ESC chiude la fullscreen (registrato una sola volta)
if (typeof window._allEscRegistrato === 'undefined') {
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape' && document.getElementById('all-fullscreen-overlay')) {
      // Chiudo solo se NON c'è una modal sopra (modal candidati)
      if (!document.getElementById('all-candidati-modal')) {
        allChiudiFullscreen();
      }
    }
  });
  window._allEscRegistrato = true;
}


async function caricaAllineamento() {
  const annoEl = document.getElementById('all-f-anno');
  const meseEl = document.getElementById('all-f-mese');
  if (!annoEl || !meseEl) return;
  const anno = parseInt(annoEl.value);
  const mese = meseEl.value ? parseInt(meseEl.value) : null;
  window._allineamento.filtri.anno = anno;
  window._allineamento.filtri.mese = mese;

  let dataMin, dataMax;
  if (mese) {
    dataMin = `${anno}-${String(mese).padStart(2,'0')}-01`;
    const last = new Date(anno, mese, 0).getDate();
    dataMax = `${anno}-${String(mese).padStart(2,'0')}-${String(last).padStart(2,'0')}`;
  } else {
    dataMin = `${anno}-01-01`;
    dataMax = `${anno}-12-31`;
  }

  try {
    // ═══ v20260515g: Promise.all su tutte le query indipendenti ═══
    // Prima: ordini → fatture → righe-chunk → ordini-link-chunk (tutto seriale).
    // Ora: ordini + fatture in parallelo, poi righe-chunk in parallelo,
    //      poi ordini-link-chunk in parallelo. ~4× più veloce su anno intero.

    // 1+2. Ordini senza fattura + Fatture del periodo (parallelo)
    const [ordRes, fattRes] = await Promise.all([
      sb.from('ordini')
        .select('id,data,cliente,cliente_id,prodotto,litri,costo_litro,trasporto_litro,margine,iva,destinazione,sede_scarico_id,sede_scarico_nome,stato,tipo_ordine,fattura_id,fattura_riga_id')
        .eq('tipo_ordine','cliente')
        .neq('stato','annullato')
        .is('fattura_id', null)
        .gte('data', dataMin).lte('data', dataMax)
        .order('data'),
      sb.from('fatture_emesse')
        .select('id,numero,data,cessionario_piva,cessionario_denominazione')
        .gte('data', dataMin).lte('data', dataMax)
        .order('data')
    ]);
    if (ordRes.error) throw ordRes.error;
    if (fattRes.error) throw fattRes.error;
    const ord = ordRes.data;
    const fatt = fattRes.data;

    if (!fatt || fatt.length === 0) {
      window._allineamento.ordini = ord || [];
      window._allineamento.righeOrfane = [];
      renderAllineamento();
      return;
    }
    const fattById = new Map();
    fatt.forEach(f => fattById.set(f.id, f));
    const fattIds = fatt.map(f => f.id);

    // 3. Righe fatture: chunk in PARALLELO (paginazione interna range seriale)
    const chunkPromisesRighe = [];
    for (let i = 0; i < fattIds.length; i += 500) {
      const chunk = fattIds.slice(i, i + 500);
      chunkPromisesRighe.push((async () => {
        const acc = [];
        let from = 0, batch = 1000;
        while (true) {
          const { data: r, error: errR } = await sb.from('fatture_righe')
            .select('id,fattura_id,numero_linea,prodotto_normalizzato,quantita,prezzo_totale,ignora_match')
            .in('fattura_id', chunk)
            .range(from, from + batch - 1);
          if (errR) throw errR;
          if (!r || r.length === 0) break;
          acc.push(...r);
          if (r.length < batch) break;
          from += batch;
        }
        return acc;
      })());
    }
    const righeArrays = await Promise.all(chunkPromisesRighe);
    const righe = righeArrays.flat();

    // 4. Identifico righe puntate da ordini in DB — chunk in PARALLELO
    const righeIds = righe.map(r => r.id);
    const righeConOrdine = new Set();
    const conteggioPerRiga = {}; // rigaId → numero ordini collegati
    const chunkPromisesLink = [];
    for (let i = 0; i < righeIds.length; i += 500) {
      const chunk = righeIds.slice(i, i + 500);
      chunkPromisesLink.push(
        sb.from('ordini').select('fattura_riga_id').in('fattura_riga_id', chunk)
      );
    }
    const linkResults = await Promise.all(chunkPromisesLink);
    linkResults.forEach(({ data: oLink }) => {
      (oLink || []).forEach(o => {
        if (o.fattura_riga_id) {
          righeConOrdine.add(o.fattura_riga_id);
          conteggioPerRiga[o.fattura_riga_id] = (conteggioPerRiga[o.fattura_riga_id] || 0) + 1;
        }
      });
    });

    // Patch v20260503q: anomalie "doppia" = riga con 2+ ordini
    // v20260515g: Map per lookup O(1) invece di find() O(n)
    const righeById = new Map(righe.map(r => [r.id, r]));
    const fattureAnomale = new Set();
    Object.keys(conteggioPerRiga).forEach(rId => {
      if (conteggioPerRiga[rId] > 1) {
        const r = righeById.get(rId);
        if (r) fattureAnomale.add(r.fattura_id);
      }
    });
    window._allineamento.fattureAnomale = Array.from(fattureAnomale).map(fId => fattById.get(fId)).filter(Boolean);

    // 5. Filtro: righe "vere", non ignorate, senza ordine
    const righeOrfane = righe
      .filter(r => r.prodotto_normalizzato && Number(r.quantita) > 0 && !r.ignora_match && !righeConOrdine.has(r.id))
      .map(r => ({
        ...r,
        _fattura: fattById.get(r.fattura_id) || null,
      }))
      .sort((a,b) => {
        const da = a._fattura?.data || '';
        const db = b._fattura?.data || '';
        if (da !== db) return da < db ? -1 : 1;
        return (parseInt(a._fattura?.numero)||0) - (parseInt(b._fattura?.numero)||0);
      });

    window._allineamento.ordini = (ord || []).slice();
    window._allineamento.righeOrfane = righeOrfane;
    renderAllineamento();
  } catch (e) {
    console.error('[allineamento]', e);
    const el = document.getElementById('all-lista-ord');
    if (el) el.innerHTML = `<div style="color:#A32D2D;padding:10px;font-size:11px">Errore: ${_esc(e.message)}</div>`;
  }
}


function renderAllineamento() {
  const cerca = (window._allineamento.filtri.cerca || '').toLowerCase().trim();
  const filtraTesto = (testo) => !cerca || (testo || '').toLowerCase().includes(cerca);

  const ordVisibili = window._allineamento.ordini.filter(o =>
    filtraTesto(o.cliente) || filtraTesto(o.prodotto)
  );
  const fattVisibili = window._allineamento.righeOrfane.filter(r =>
    filtraTesto(r._fattura?.cessionario_denominazione) ||
    filtraTesto(r._fattura?.numero) ||
    filtraTesto(r.prodotto_normalizzato)
  );

  // Header counters
  const elCntO = document.getElementById('all-cnt-ord');
  const elCntF = document.getElementById('all-cnt-fatt');
  const elTotO = document.getElementById('all-tot-ord');
  const elTotF = document.getElementById('all-tot-fatt');
  if (elCntO) elCntO.textContent = `(${ordVisibili.length}/${window._allineamento.ordini.length})`;
  if (elCntF) elCntF.textContent = `(${fattVisibili.length}/${window._allineamento.righeOrfane.length})`;
  const totOrd = ordVisibili.reduce((s,o) => {
    const noIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
    return s + noIva * Number(o.litri||0);
  }, 0);
  const totFatt = fattVisibili.reduce((s,r) => s + Number(r.prezzo_totale||0), 0);
  if (elTotO) elTotO.textContent = `Totale netto: ${_fmtE(totOrd)}`;
  if (elTotF) elTotF.textContent = `Totale imponibile: ${_fmtE(totFatt)}`;

  // Patch v20260503q: banner anomalie righe doppie
  const elBanner = document.getElementById('all-banner-anomalie');
  if (elBanner) {
    const anom = window._allineamento.fattureAnomale || [];
    if (anom.length === 0) {
      elBanner.innerHTML = '';
    } else {
      let html = '<div style="background:#FCEBEB;border:1px solid #E8B5B5;border-left:4px solid #A32D2D;padding:10px 14px;margin:0 20px 8px;border-radius:0 6px 6px 0">' +
        '<div style="font-size:12px;font-weight:600;color:#7A1F1F;margin-bottom:6px">⚠ ' + anom.length + ' fattura/e con righe DOPPIE (più ordini sulla stessa riga) — anomalia da matcher legacy</div>' +
        '<div style="font-size:11px;color:#7A1F1F;margin-bottom:6px">Le fatture sotto hanno almeno una riga con 2+ ordini collegati. Aprile la diagnostica per riassegnare uno degli ordini a una riga orfana compatibile.</div>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap">';
      anom.slice(0, 30).forEach(f => {
        html += '<button onclick="allDiagnosticaFattura(\'' + f.id + '\')" style="background:white;border:1px solid #A32D2D;color:#7A1F1F;border-radius:4px;padding:3px 8px;font-size:10px;cursor:pointer;font-weight:600">🔍 Fatt ' + _esc(f.numero) + ' · ' + _fmtD(f.data) + '</button>';
      });
      if (anom.length > 30) html += '<span style="font-size:10px;color:#7A1F1F;align-self:center">+' + (anom.length-30) + ' altre…</span>';
      html += '</div></div>';
      elBanner.innerHTML = html;
    }
  }

  // Render colonne
  const elListaO = document.getElementById('all-lista-ord');
  if (elListaO) elListaO.innerHTML = ordVisibili.length
    ? ordVisibili.map(_renderOrdineAllineamento).join('')
    : '<div style="text-align:center;color:#888;padding:20px;font-size:11px">Nessun ordine senza fattura nel periodo</div>';

  const elListaF = document.getElementById('all-lista-fatt');
  if (elListaF) elListaF.innerHTML = fattVisibili.length
    ? fattVisibili.map(_renderFattAllineamento).join('')
    : '<div style="text-align:center;color:#888;padding:20px;font-size:11px">Nessuna riga fattura senza ordine nel periodo</div>';
}


function _renderOrdineAllineamento(o) {
  const noIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
  const totNetto = noIva * Number(o.litri||0);
  const dest = o.destinazione || o.sede_scarico_nome || '';
  const destBadge = dest ? `<span style="font-size:9px;background:#EEEDFE;color:#4933C3;padding:1px 5px;border-radius:3px">📍 ${_esc(dest)}</span>` : '';
  return `
    <div style="border:1px solid #e8e5dc;border-radius:5px;padding:6px 8px;margin-bottom:5px;font-size:11px;background:white">
      <div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:#26215C">${_fmtD(o.data)} · ${_esc((o.cliente||'').substring(0,40))}</div>
          <div style="color:#666;margin-top:1px">
            ${_esc(o.prodotto||'?')} · <span style="font-family:monospace">${Number(o.litri||0).toLocaleString('it-IT')} L · ${_fmtE(totNetto)}</span>
            ${destBadge}
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
          <button onclick="allEditOrdine('${o.id}')" title="Modifica destinazione, litri, prezzi"
                  style="background:#639922;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">✏️ Modifica</button>
          <button onclick="allCollegaOrdineAFattura('${o.id}')" title="Collega a una riga fattura"
                  style="background:#6B5FCC;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">🔗 Collega</button>
        </div>
      </div>
    </div>
  `;
}


function _renderFattAllineamento(r) {
  const f = r._fattura;
  return `
    <div style="border:1px solid #e8e5dc;border-radius:5px;padding:6px 8px;margin-bottom:5px;font-size:11px;background:white">
      <div style="display:flex;justify-content:space-between;gap:6px;align-items:flex-start">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;color:#26215C">
            <span style="font-family:monospace">Fatt ${_esc(f?.numero||'?')}</span> ${_fmtD(f?.data)} ·
            ${_esc((f?.cessionario_denominazione||'').substring(0,32))}
          </div>
          <div style="color:#666;margin-top:1px">
            ${_esc(r.prodotto_normalizzato)} · <span style="font-family:monospace">${Number(r.quantita||0).toLocaleString('it-IT')} L · ${_fmtE(r.prezzo_totale||0)}</span>
          </div>
        </div>
        <div style="display:flex;flex-direction:column;gap:2px;flex-shrink:0">
          <button onclick="allCollegaFatturaAOrdine('${r.id}', '${r.fattura_id}')" title="Collega a un ordine"
                  style="background:#6B5FCC;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">🔗 Collega</button>
          <button onclick="allCreaOrdineDaRiga('${r.id}')" title="Crea ordine PhoenixFuel da questa riga"
                  style="background:#A32D2D;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">➕ Crea</button>
          <button onclick="allIgnoraRiga('${r.id}')" title="Marca come 'non richiede ordine' (conguagli/abbuoni)"
                  style="background:#888;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">🚫 Ignora</button>
          <button onclick="allDiagnosticaFattura('${r.fattura_id}')" title="Diagnostica e ripara accoppiamenti di questa fattura"
                  style="background:#0E6F8E;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">🔍 Diagnostica</button>
        </div>
      </div>
    </div>
  `;
}


function filtraAllineamento() {
  const cercaEl = document.getElementById('all-f-cerca');
  if (!cercaEl) return;
  window._allineamento.filtri.cerca = cercaEl.value || '';
  renderAllineamento();
}


// ─── AZIONI ─────────────────────────────────────────────────────────────

// Edit ordine compatto inline (riusa la logica esistente in pf-fatture-import)
async function allEditOrdine(ordineId) {
  // Carico ordine fresco
  const { data: o, error } = await sb.from('ordini')
    .select('id,data,cliente,cliente_id,prodotto,litri,costo_litro,trasporto_litro,margine,iva,destinazione,sede_scarico_id,sede_scarico_nome')
    .eq('id', ordineId).single();
  if (error || !o) { toast('Ordine non trovato'); return; }

  // Carico sedi cliente
  let sediHtml = '<option value="">— Nessuna sede —</option>';
  if (o.cliente_id) {
    const { data: sedi } = await sb.from('sedi_scarico')
      .select('id,nome,comune,attivo,is_default')
      .eq('cliente_id', o.cliente_id)
      .eq('attivo', true)
      .order('is_default',{ascending:false})
      .order('nome');
    (sedi||[]).forEach(s => {
      const sel = s.id === o.sede_scarico_id ? 'selected' : '';
      sediHtml += `<option value="${s.id}" data-nome="${_esc(s.nome||'')}" ${sel}>${_esc(s.nome||'?')}${s.comune?' · '+_esc(s.comune):''}</option>`;
    });
  }

  const html = `
    <div style="max-width:560px">
      <h2 style="margin:0 0 4px 0;color:#26215C">✏️ Modifica ordine</h2>
      <div style="font-size:11px;color:#666;margin-bottom:12px">${_fmtD(o.data)} · ${_esc(o.cliente)} · ${_esc(o.prodotto)}</div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
        <div><label style="font-size:10px;font-weight:600;color:#555">Litri</label>
          <input type="number" id="ae-litri" value="${o.litri||0}" step="0.01" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:3px;font-size:12px;font-family:monospace"></div>
        <div><label style="font-size:10px;font-weight:600;color:#555">IVA %</label>
          <input type="number" id="ae-iva" value="${o.iva||22}" step="0.01" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:3px;font-size:12px;font-family:monospace"></div>
        <div><label style="font-size:10px;font-weight:600;color:#555">Costo / L (€)</label>
          <input type="number" id="ae-costo" value="${o.costo_litro||0}" step="0.0001" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:3px;font-size:12px;font-family:monospace"></div>
        <div><label style="font-size:10px;font-weight:600;color:#555">Trasporto / L (€)</label>
          <input type="number" id="ae-trasp" value="${o.trasporto_litro||0}" step="0.0001" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:3px;font-size:12px;font-family:monospace"></div>
        <div><label style="font-size:10px;font-weight:600;color:#555">Margine / L (€)</label>
          <input type="number" id="ae-marg" value="${o.margine||0}" step="0.0001" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:3px;font-size:12px;font-family:monospace"></div>
        <div><label style="font-size:10px;font-weight:600;color:#555">Imponibile (auto)</label>
          <input type="text" id="ae-imp" readonly value="€ ${_fmtN((Number(o.costo_litro||0)+Number(o.trasporto_litro||0)+Number(o.margine||0))*Number(o.litri||0))}" style="width:100%;padding:5px;border:1px solid #ddd;border-radius:3px;font-size:12px;font-family:monospace;background:#fafaf8"></div>
        <div style="grid-column:1/3"><label style="font-size:10px;font-weight:600;color:#555">Sede di scarico</label>
          <select id="ae-sede" onchange="document.getElementById('ae-dest').value=this.options[this.selectedIndex].dataset.nome||''" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:3px;font-size:12px">${sediHtml}</select></div>
        <div style="grid-column:1/3"><label style="font-size:10px;font-weight:600;color:#555">Destinazione (testo libero)</label>
          <input type="text" id="ae-dest" value="${_esc(o.destinazione||'')}" placeholder="Es. Stazione Saline" style="width:100%;padding:5px;border:1px solid #ccc;border-radius:3px;font-size:12px"></div>
      </div>
      <div style="margin-top:12px;display:flex;gap:6px;justify-content:flex-end">
        <button onclick="apriPaginaAllineamento()" style="background:#888;color:white;border:0;border-radius:3px;padding:5px 12px;font-size:11px;cursor:pointer">Annulla</button>
        <button onclick="allSalvaEditOrdine('${ordineId}')" style="background:#639922;color:white;border:0;border-radius:3px;padding:5px 12px;font-size:11px;cursor:pointer">💾 Salva</button>
      </div>
    </div>
  `;
  apriModal(html);
  setTimeout(() => {
    const ricalc = () => {
      const l = Number(document.getElementById('ae-litri').value)||0;
      const c = Number(document.getElementById('ae-costo').value)||0;
      const t = Number(document.getElementById('ae-trasp').value)||0;
      const m = Number(document.getElementById('ae-marg').value)||0;
      const el = document.getElementById('ae-imp');
      if (el) el.value = '€ '+_fmtN((c+t+m)*l);
    };
    ['ae-litri','ae-costo','ae-trasp','ae-marg'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('input', ricalc);
    });
  }, 100);
}


async function allSalvaEditOrdine(ordineId) {
  const litri = Number(document.getElementById('ae-litri').value)||0;
  if (litri <= 0) { toast('Litri devono essere > 0'); return; }
  const sedeSel = document.getElementById('ae-sede');
  const updates = {
    litri,
    iva: Number(document.getElementById('ae-iva').value)||22,
    costo_litro: Number(document.getElementById('ae-costo').value)||0,
    trasporto_litro: Number(document.getElementById('ae-trasp').value)||0,
    margine: Number(document.getElementById('ae-marg').value)||0,
    destinazione: (document.getElementById('ae-dest').value||'').trim() || null,
    sede_scarico_id: sedeSel?.value || null,
    sede_scarico_nome: sedeSel?.selectedIndex >= 0 ? (sedeSel.options[sedeSel.selectedIndex].dataset.nome || null) : null,
  };
  const { error } = await sb.from('ordini').update(updates).eq('id', ordineId);
  if (error) { toast('Errore: '+error.message); return; }
  toast('✓ Ordine aggiornato');
  // Ritorno alla pagina allineamento e ricarico
  await apriPaginaAllineamento();
}


// Patch v20260503g: vista lista (non dropdown) con pannello origine sticky in alto
async function allCollegaOrdineAFattura(ordineId) {
  const o = window._allineamento.ordini.find(oo => oo.id === ordineId);
  if (!o) { toast('Ordine non trovato'); return; }

  // Score di compatibilità
  const score = (r) => {
    let s = 0;
    if (r.prodotto_normalizzato === _normalizzaProdottoIt(o.prodotto)) s += 30;
    const gg = Math.abs((new Date(o.data) - new Date(r._fattura?.data)) / 86400000);
    if (gg <= 2) s += 20; else if (gg <= 7) s += 10; else if (gg <= 30) s += 3;
    if (Math.abs(Number(r.quantita||0) - Number(o.litri||0)) <= 1) s += 15;
    return s;
  };
  const cand = window._allineamento.righeOrfane.slice().sort((a,b) => score(b) - score(a));

  // Salvo in stato per selezione
  window._allineamento._candidatiCorrenti = cand.slice(0, 200);
  window._allineamento._origineCorrente = { tipo: 'ordine', dati: o };
  window._allineamento._sceltaCorrente = null;

  // Importo ordine (no IVA per riferimento)
  const noIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
  const impOrd = noIva * Number(o.litri||0);

  const candidatiHtml = cand.slice(0, 200).map((r, idx) => {
    const f = r._fattura;
    const sc = score(r);
    const verde = sc >= 30;
    const ggDiff = Math.abs((new Date(o.data) - new Date(f?.data)) / 86400000);
    const litriDiff = Math.abs(Number(r.quantita||0) - Number(o.litri||0));
    return `
      <div onclick="allSelezionaCandidato(${idx})" id="all-cand-${idx}"
           style="border:1px solid ${verde?'#9FD06A':'#ddd'};border-radius:6px;padding:10px 12px;margin-bottom:6px;cursor:pointer;background:${verde?'#F4FBE9':'#fff'};transition:all 0.1s"
           onmouseover="this.style.background='#E8F1FB'" onmouseout="if(!this.classList.contains('selezionato'))this.style.background='${verde?'#F4FBE9':'#fff'}'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:#26215C;margin-bottom:3px">
              ${verde?'🟢':'⚪'} Fattura ${_esc(f?.numero||'?')} del ${_fmtD(f?.data)}
            </div>
            <div style="font-size:11px;color:#444;margin-bottom:2px">${_esc(f?.cessionario_denominazione||'—')}</div>
            <div style="font-size:11px;color:#666">
              ${_esc(r.prodotto_normalizzato)} · ${Number(r.quantita||0).toLocaleString('it-IT')} L · <strong>${_fmtE(r.prezzo_totale||0)}</strong>
            </div>
            <div style="font-size:10px;color:#888;margin-top:4px">
              ${ggDiff <= 30 ? '📅 ' + Math.round(ggDiff) + 'gg di differenza' : ''}
              ${litriDiff <= 1 ? ' · ⚖️ litri identici' : ''}
              ${verde ? ' · ✓ stesso prodotto' : ''}
            </div>
          </div>
          <div style="font-size:18px;color:#ccc;flex-shrink:0">›</div>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <div id="all-candidati-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px"
         onclick="if(event.target===this)allChiudiCandidati()">
      <div style="background:white;border-radius:12px;width:100%;max-width:900px;height:calc(100vh - 40px);display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(0,0,0,0.4);overflow:hidden">

        <!-- Header con titolo + chiudi -->
        <div style="padding:14px 20px;border-bottom:0.5px solid var(--border);background:#FAF8F2;flex-shrink:0;display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;color:#26215C;font-size:16px">🔗 Collega ordine a riga fattura</h2>
          <button onclick="allChiudiCandidati()" style="font-size:14px;padding:6px 10px;background:white;border:0.5px solid var(--border);border-radius:6px;cursor:pointer">✕</button>
        </div>

        <!-- Pannello ORIGINE (sticky, sempre visibile) -->
        <div style="padding:12px 20px;background:#FFF7E6;border-bottom:2px solid #BA7517;flex-shrink:0">
          <div style="font-size:10px;text-transform:uppercase;color:#8B6A00;font-weight:600;letter-spacing:0.5px;margin-bottom:6px">⚠ STAI COLLEGANDO QUESTO ORDINE:</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:11px">
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Data</div><strong>${_fmtD(o.data)}</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Cliente</div><strong>${_esc(o.cliente)}</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Prodotto</div><strong>${_esc(o.prodotto)}</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Litri</div><strong>${Number(o.litri||0).toLocaleString('it-IT')} L</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Importo</div><strong style="color:#27500A;font-family:var(--font-mono)">${_fmtE(impOrd)}</strong></div>
          </div>
        </div>

        <!-- Lista candidati scrollabile -->
        <div style="flex:1;overflow-y:auto;padding:14px 20px;min-height:0">
          <div style="font-size:11px;color:#666;margin-bottom:8px">
            ${cand.length} possibili righe fattura compatibili (top 200, ordinate per pertinenza). 🟢 stesso prodotto · ⚪ altri.
          </div>
          ${cand.length === 0
            ? '<div style="text-align:center;padding:40px;color:#888;font-style:italic">Nessuna riga fattura compatibile trovata.</div>'
            : candidatiHtml}
        </div>

        <!-- Footer fisso con riepilogo selezione + conferma -->
        <div style="padding:14px 20px;border-top:0.5px solid var(--border);background:#fafaf8;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div id="all-cof-selezione" style="font-size:12px;color:#888;flex:1;min-width:0">Seleziona una riga fattura dalla lista</div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button onclick="allChiudiCandidati()" style="background:white;border:0.5px solid var(--border);border-radius:5px;padding:6px 14px;font-size:12px;cursor:pointer">Annulla</button>
            <button id="all-cof-btn" onclick="allConfermaCollegaOrdine('${ordineId}')" disabled
                    style="background:#ccc;color:white;border:0;border-radius:5px;padding:6px 14px;font-size:12px;cursor:not-allowed;font-weight:500">✓ Collega</button>
          </div>
        </div>

      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}


function allChiudiCandidati() {
  const m = document.getElementById('all-candidati-modal');
  if (m) m.remove();
  window._allineamento._candidatiCorrenti = null;
  window._allineamento._origineCorrente = null;
  window._allineamento._sceltaCorrente = null;
}


// Selezione candidato (visivamente)
function allSelezionaCandidato(idx) {
  const cand = window._allineamento._candidatiCorrenti;
  if (!cand || !cand[idx]) return;

  // Rimuovo selezione precedente
  document.querySelectorAll('[id^="all-cand-"]').forEach(el => {
    el.classList.remove('selezionato');
    el.style.borderColor = '';
    el.style.background = '';
    // Riapplico stile "verde compatibile" se serve (basato sull'idx)
  });

  // Marco questa
  const el = document.getElementById('all-cand-' + idx);
  if (el) {
    el.classList.add('selezionato');
    el.style.borderColor = '#185FA5';
    el.style.background = '#E6F1FB';
    el.style.borderWidth = '2px';
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  window._allineamento._sceltaCorrente = cand[idx];

  // Aggiorno footer
  const r = cand[idx];
  const f = r._fattura;
  const desc = `Selezionato: <strong>Fatt ${_esc(f?.numero||'?')} del ${_fmtD(f?.data)}</strong> · ${_esc((f?.cessionario_denominazione||'').substring(0,30))} · ${Number(r.quantita||0).toLocaleString('it-IT')} L · ${_fmtE(r.prezzo_totale||0)}`;
  const elS = document.getElementById('all-cof-selezione');
  if (elS) { elS.innerHTML = desc; elS.style.color = '#0C447C'; }

  // Abilito bottone conferma
  const btn = document.getElementById('all-cof-btn');
  if (btn) {
    btn.disabled = false;
    btn.style.background = '#6B5FCC';
    btn.style.cursor = 'pointer';
  }
}


async function allConfermaCollegaOrdine(ordineId) {
  const sc = window._allineamento._sceltaCorrente;
  if (!sc) { toast('Scegli una riga fattura'); return; }
  const { error } = await sb.from('ordini')
    .update({ fattura_id: sc.fattura_id, fattura_riga_id: sc.id, stato: 'consegnato' })
    .eq('id', ordineId);
  if (error) { toast('Errore: '+error.message); return; }
  toast('✓ Ordine collegato a fattura');
  allChiudiCandidati();
  await caricaAllineamento();
}


// Patch v20260503g: vista lista con pannello origine fattura sticky
async function allCollegaFatturaAOrdine(rigaId, fattId) {
  const r = window._allineamento.righeOrfane.find(rr => rr.id === rigaId);
  if (!r) { toast('Riga non trovata'); return; }
  const f = r._fattura;

  const score = (o) => {
    let s = 0;
    if (_normalizzaProdottoIt(o.prodotto) === r.prodotto_normalizzato) s += 30;
    const gg = Math.abs((new Date(r._fattura?.data) - new Date(o.data)) / 86400000);
    if (gg <= 2) s += 20; else if (gg <= 7) s += 10; else if (gg <= 30) s += 3;
    if (Math.abs(Number(o.litri||0) - Number(r.quantita||0)) <= 1) s += 15;
    return s;
  };
  const cand = window._allineamento.ordini.slice().sort((a,b) => score(b) - score(a));

  window._allineamento._candidatiCorrenti = cand.slice(0, 200);
  window._allineamento._origineCorrente = { tipo: 'fattura', dati: r };
  window._allineamento._sceltaCorrente = null;

  const candidatiHtml = cand.slice(0, 200).map((o, idx) => {
    const sc = score(o);
    const verde = sc >= 30;
    const noIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
    const imp = noIva * Number(o.litri||0);
    const ggDiff = Math.abs((new Date(f?.data) - new Date(o.data)) / 86400000);
    const litriDiff = Math.abs(Number(o.litri||0) - Number(r.quantita||0));
    return `
      <div onclick="allSelezionaCandidatoFatt(${idx})" id="all-candf-${idx}"
           style="border:1px solid ${verde?'#9FD06A':'#ddd'};border-radius:6px;padding:10px 12px;margin-bottom:6px;cursor:pointer;background:${verde?'#F4FBE9':'#fff'};transition:all 0.1s"
           onmouseover="this.style.background='#E8F1FB'" onmouseout="if(!this.classList.contains('selezionato'))this.style.background='${verde?'#F4FBE9':'#fff'}'">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="flex:1;min-width:0">
            <div style="font-size:12px;font-weight:600;color:#26215C;margin-bottom:3px">
              ${verde?'🟢':'⚪'} Ordine del ${_fmtD(o.data)}
            </div>
            <div style="font-size:11px;color:#444;margin-bottom:2px">${_esc(o.cliente||'—')}</div>
            <div style="font-size:11px;color:#666">
              ${_esc(o.prodotto)} · ${Number(o.litri||0).toLocaleString('it-IT')} L · <strong>${_fmtE(imp)}</strong>
            </div>
            <div style="font-size:10px;color:#888;margin-top:4px">
              ${ggDiff <= 30 ? '📅 ' + Math.round(ggDiff) + 'gg di differenza' : ''}
              ${litriDiff <= 1 ? ' · ⚖️ litri identici' : ''}
              ${verde ? ' · ✓ stesso prodotto' : ''}
            </div>
          </div>
          <div style="font-size:18px;color:#ccc;flex-shrink:0">›</div>
        </div>
      </div>
    `;
  }).join('');

  const html = `
    <div id="all-candidati-modal" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.55);z-index:99998;display:flex;align-items:center;justify-content:center;padding:20px"
         onclick="if(event.target===this)allChiudiCandidati()">
      <div style="background:white;border-radius:12px;width:100%;max-width:900px;height:calc(100vh - 40px);display:flex;flex-direction:column;box-shadow:0 16px 48px rgba(0,0,0,0.4);overflow:hidden">

        <div style="padding:14px 20px;border-bottom:0.5px solid var(--border);background:#FAF8F2;flex-shrink:0;display:flex;justify-content:space-between;align-items:center">
          <h2 style="margin:0;color:#26215C;font-size:16px">🔗 Collega riga fattura a ordine</h2>
          <button onclick="allChiudiCandidati()" style="font-size:14px;padding:6px 10px;background:white;border:0.5px solid var(--border);border-radius:6px;cursor:pointer">✕</button>
        </div>

        <!-- Pannello ORIGINE FATTURA (sticky) -->
        <div style="padding:12px 20px;background:#FDECEC;border-bottom:2px solid #A32D2D;flex-shrink:0">
          <div style="font-size:10px;text-transform:uppercase;color:#791F1F;font-weight:600;letter-spacing:0.5px;margin-bottom:6px">✗ STAI COLLEGANDO QUESTA RIGA FATTURA:</div>
          <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;font-size:11px">
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">N° fattura</div><strong>${_esc(f?.numero||'?')}</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Data fattura</div><strong>${_fmtD(f?.data)}</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase;overflow:hidden;text-overflow:ellipsis">Cliente</div><strong>${_esc(f?.cessionario_denominazione||'—')}</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Prodotto</div><strong>${_esc(r.prodotto_normalizzato)}</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Litri</div><strong>${Number(r.quantita||0).toLocaleString('it-IT')} L</strong></div>
            <div><div style="color:#888;font-size:9px;text-transform:uppercase">Importo</div><strong style="color:#791F1F;font-family:var(--font-mono)">${_fmtE(r.prezzo_totale||0)}</strong></div>
          </div>
        </div>

        <div style="flex:1;overflow-y:auto;padding:14px 20px;min-height:0">
          <div style="font-size:11px;color:#666;margin-bottom:8px">
            ${cand.length} possibili ordini compatibili (top 200, ordinati per pertinenza). 🟢 stesso prodotto · ⚪ altri.
          </div>
          ${cand.length === 0
            ? '<div style="text-align:center;padding:40px;color:#888;font-style:italic">Nessun ordine compatibile trovato.</div>'
            : candidatiHtml}
        </div>

        <div style="padding:14px 20px;border-top:0.5px solid var(--border);background:#fafaf8;flex-shrink:0;display:flex;justify-content:space-between;align-items:center;gap:12px">
          <div id="all-cfo-selezione" style="font-size:12px;color:#888;flex:1;min-width:0">Seleziona un ordine dalla lista</div>
          <div style="display:flex;gap:8px;flex-shrink:0">
            <button onclick="allChiudiCandidati()" style="background:white;border:0.5px solid var(--border);border-radius:5px;padding:6px 14px;font-size:12px;cursor:pointer">Annulla</button>
            <button id="all-cfo-btn" onclick="allConfermaCollegaFattura('${rigaId}', '${fattId}')" disabled
                    style="background:#ccc;color:white;border:0;border-radius:5px;padding:6px 14px;font-size:12px;cursor:not-allowed;font-weight:500">✓ Collega</button>
          </div>
        </div>

      </div>
    </div>
  `;
  document.body.insertAdjacentHTML('beforeend', html);
}


function allSelezionaCandidatoFatt(idx) {
  const cand = window._allineamento._candidatiCorrenti;
  if (!cand || !cand[idx]) return;

  document.querySelectorAll('[id^="all-candf-"]').forEach(el => {
    el.classList.remove('selezionato');
    el.style.borderColor = '';
    el.style.background = '';
  });

  const el = document.getElementById('all-candf-' + idx);
  if (el) {
    el.classList.add('selezionato');
    el.style.borderColor = '#185FA5';
    el.style.background = '#E6F1FB';
    el.style.borderWidth = '2px';
    el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  window._allineamento._sceltaCorrente = cand[idx];

  const o = cand[idx];
  const noIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
  const imp = noIva * Number(o.litri||0);
  const desc = `Selezionato: <strong>Ordine ${_fmtD(o.data)}</strong> · ${_esc((o.cliente||'').substring(0,30))} · ${Number(o.litri||0).toLocaleString('it-IT')} L · ${_fmtE(imp)}`;
  const elS = document.getElementById('all-cfo-selezione');
  if (elS) { elS.innerHTML = desc; elS.style.color = '#0C447C'; }

  const btn = document.getElementById('all-cfo-btn');
  if (btn) {
    btn.disabled = false;
    btn.style.background = '#6B5FCC';
    btn.style.cursor = 'pointer';
  }
}


async function allConfermaCollegaFattura(rigaId, fattId) {
  const sc = window._allineamento._sceltaCorrente;
  if (!sc) { toast('Scegli un ordine'); return; }
  const { error } = await sb.from('ordini')
    .update({ fattura_id: fattId, fattura_riga_id: rigaId, stato: 'consegnato' })
    .eq('id', sc.id);
  if (error) { toast('Errore: '+error.message); return; }
  toast('✓ Riga collegata a ordine');
  allChiudiCandidati();
  await caricaAllineamento();
}


async function allIgnoraRiga(rigaId) {
  if (!confirm('Marcare la riga fattura come "non richiede ordine"?\n\nUsa per conguagli/abbuoni/righe servizio.')) return;
  const { error } = await sb.from('fatture_righe').update({ ignora_match: true }).eq('id', rigaId);
  if (error) { toast('Errore: '+error.message); return; }
  toast('✓ Riga ignorata');
  await apriPaginaAllineamento();
}


async function allCreaOrdineDaRiga(rigaId) {
  const r = window._allineamento.righeOrfane.find(rr => rr.id === rigaId);
  if (!r) { toast('Riga non trovata'); return; }
  // Riusa il flusso _apriCreaOrdineDaOrphan dell'import (richiede payload base64)
  const f = r._fattura;
  const payload = {
    fattura_idx: -1,        // marca: non in _parsedData (chiamata da fuori)
    riga_numero: r.numero_linea,
    fattura_nr: f?.numero,
    fattura_data: f?.data,
    cessionario_piva: f?.cessionario_piva || '',
    cessionario_denominazione: f?.cessionario_denominazione || '',
    prodotto: r.prodotto_normalizzato,
    litri: r.quantita,
    imponibile: r.prezzo_totale,
    aliquota_iva: 22,
    das_numero_dogane: null,
    _from_allineamento: true,
    _riga_id: r.id,
    _fattura_id: r.fattura_id,
  };
  const payload64 = btoa(unescape(encodeURIComponent(JSON.stringify(payload))));
  if (window.pfFattureImport && window.pfFattureImport._apriCreaOrdineDaOrphan) {
    await window.pfFattureImport._apriCreaOrdineDaOrphan(payload64);
  } else {
    toast('Modulo import non disponibile');
  }
}


// Helper: riproduce normalizzazione prodotto (uguale a quella in pf-fatture-import)
function _normalizzaProdottoIt(desc) {
  const d = (desc || '').toLowerCase();
  if (d.includes('gasolio') && d.includes('autotraz')) return 'Gas Auto';
  if (d.includes('gasolio') && d.includes('agric')) return 'Gas Agricolo';
  if (d.includes('benzina')) return 'Benzina';
  if (d.includes('hvo')) return 'HVO';
  if (d.includes('adblue') || d.includes('ad blue') || d.includes('ad-blue')) return 'AdBlue';
  return null;
}


// ─── ENTRY POINT ───
// Sostituisce le 2 vecchie modali (apriListaOrdiniSenzaFattura + apriListaFattureOrfane).
// Le card della dashboard chiamano queste funzioni: le ridireziono entrambe alla nuova pagina.
function apriListaOrdiniSenzaFattura() {
  apriPaginaAllineamento();
}

function apriListaFattureOrfane() {
  apriPaginaAllineamento();
}

async function emettiiFattura(id){
  if(!confirm('Emettere questa fattura? Lo stato passerà a "Emessa".')) return;
  const { error } = await sb.from('fatture').update({ stato:'emessa', updated_at: new Date().toISOString() }).eq('id', id);
  if(error){ toast('Errore: '+error.message); return; }
  toast('Fattura emessa ✓');
  caricaFatture();
}

async function segnaFatturaPagata(id){
  if(!confirm('Segnare questa fattura come pagata?')) return;
  const { error } = await sb.from('fatture').update({ stato:'pagata', updated_at: new Date().toISOString() }).eq('id', id);
  if(error){ toast('Errore: '+error.message); return; }
  toast('Fattura segnata come pagata ✓');
  caricaFatture();
}

// ═════════════════════════════════════════════════════════════
// TAB 2 — NUOVA FATTURA
// ═════════════════════════════════════════════════════════════

async function inizializzaNuovaFattura(){
  // Popola dropdown clienti
  const sel = document.getElementById('nf-cliente');
  if(!sel) return;
  const { data: clienti } = await sb.from('clienti').select('id,nome').order('nome');
  sel.innerHTML = '<option value="">— Seleziona cliente —</option>' +
    (clienti||[]).map(c=>`<option value="${c.id}">${_esc(c.nome)}</option>`).join('');

  // Popola dropdown clienti nel filtro elenco
  const selFiltro = document.getElementById('fatt-filtro-cliente');
  if(selFiltro){
    selFiltro.innerHTML = '<option value="">Tutti i clienti</option>' +
      (clienti||[]).map(c=>`<option value="${c.id}">${_esc(c.nome)}</option>`).join('');
  }

  // Default date: mese corrente
  const oggi = _oggi();
  const primoMese = oggi.substring(0,7) + '-01';
  const elDal = document.getElementById('nf-dal');
  const elAl  = document.getElementById('nf-al');
  const elDta = document.getElementById('nf-data');
  if(elDal && !elDal.value) elDal.value = primoMese;
  if(elAl  && !elAl.value)  elAl.value  = oggi;
  if(elDta && !elDta.value) elDta.value = oggi;
  // Carica subito lista ordini fatturabili
  await caricaOrdiniFatturabili();
}

function toggleSelTuttiOrdini(chk){
  document.querySelectorAll('.nf-ord-chk:not(:disabled)').forEach(c=>{ c.checked=chk.checked; });
  aggiornaAnteprima();
}

function aggiornaAnteprima(){
  _fattureOrdiniSelezionati.clear();
  document.querySelectorAll('.nf-ord-chk:checked').forEach(c=>_fattureOrdiniSelezionati.add(c.value));

  const selezionati = _fattureClienteCache.filter(o=>_fattureOrdiniSelezionati.has(o.id));
  const ant = document.getElementById('nf-anteprima');
  if(!ant) return;

  if(!selezionati.length){
    ant.innerHTML='';
    return;
  }

  // Raggruppa per aliquota IVA
  const gruppi = {};
  selezionati.forEach(o=>{
    const prezzoNoIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
    const imponibile  = prezzoNoIva * Number(o.litri||0);
    const aliqKey     = String(o.iva||22);
    if(!gruppi[aliqKey]) gruppi[aliqKey] = { aliquota: parseInt(aliqKey), imponibile:0, iva:0 };
    gruppi[aliqKey].imponibile += imponibile;
    gruppi[aliqKey].iva        += imponibile * (parseInt(aliqKey)/100);
  });

  const totImponibile = Object.values(gruppi).reduce((s,g)=>s+g.imponibile,0);
  const totIva        = Object.values(gruppi).reduce((s,g)=>s+g.iva,0);
  const totTotale     = totImponibile + totIva;

  ant.innerHTML = `
    <div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:14px">
      <div style="font-weight:600;margin-bottom:10px;color:var(--primary)">📊 Anteprima fattura (${selezionati.length} ordini)</div>
      <table style="width:100%;font-size:12px">
        <tr style="background:var(--bg-highlight)">
          <th style="padding:4px 8px;text-align:left">IVA%</th>
          <th style="padding:4px 8px;text-align:right">Imponibile</th>
          <th style="padding:4px 8px;text-align:right">IVA</th>
        </tr>
        ${Object.values(gruppi).map(g=>`
          <tr>
            <td style="padding:4px 8px">${g.aliquota}%</td>
            <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(g.imponibile)}</td>
            <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(g.iva)}</td>
          </tr>
        `).join('')}
        <tr style="border-top:2px solid var(--border);font-weight:700">
          <td style="padding:6px 8px">TOTALE</td>
          <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(totImponibile)}</td>
          <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(totIva)}</td>
        </tr>
        <tr style="background:var(--primary);color:#fff;font-weight:700;font-size:14px">
          <td style="padding:8px;border-radius:0 0 0 8px">TOTALE FATTURA</td>
          <td colspan="2" style="padding:8px;text-align:right;font-family:var(--font-mono);border-radius:0 0 8px 0">${_fmtE(totTotale)}</td>
        </tr>
      </table>
      <button class="btn-primary" style="margin-top:14px;width:100%;font-size:14px;padding:12px;background:#2E7D32"
        onclick="generaFattura()">
        🧾 Genera Fattura (${selezionati.length} ordini · ${_fmtE(totTotale)})
      </button>
    </div>
  `;
}

async function generaFattura(){
  if(!_fattureOrdiniSelezionati.size){ toast('Seleziona almeno un ordine'); return; }

  const clienteId    = document.getElementById('nf-cliente').value;
  const dataFattura  = document.getElementById('nf-data').value;
  const noteExtra    = document.getElementById('nf-note').value;
  if(!clienteId||!dataFattura){ toast('Cliente e data sono obbligatori'); return; }

  const btn = document.querySelector('[onclick="generaFattura()"]');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Generazione…'; }

  try {
    // Dati cliente
    const { data: cliente } = await sb.from('clienti').select('*').eq('id', clienteId).single();
    if(!cliente){ toast('Cliente non trovato'); return; }

    // Anno e prossimo numero
    const anno = parseInt(dataFattura.split('-')[0]);
    const numero = await _prossimoNumeroFattura(anno);

    // Calcola righe dagli ordini
    const selezionati = _fattureClienteCache.filter(o=>_fattureOrdiniSelezionati.has(o.id));

    let totImponibile=0, totIva=0;
    const righe = selezionati.map((o, idx)=>{
      const prezzoNoIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
      const quantita    = Number(o.litri||0);
      const imponibile  = prezzoNoIva * quantita;
      const aliquota    = parseInt(o.iva||22);
      const ivaImporto  = imponibile * (aliquota/100);
      totImponibile += imponibile;
      totIva        += ivaImporto;
      return {
        numero_riga     : idx+1,
        ordine_id       : o.id,
        descrizione     : `${o.prodotto} del ${_fmtD(o.data)}`,
        prodotto        : o.prodotto,
        unita_misura    : 'LT',
        quantita        : quantita,
        prezzo_unitario : prezzoNoIva,
        aliquota_iva    : aliquota,
        imponibile      : imponibile,
        iva_importo     : ivaImporto,
        data_ordine     : o.data,
      };
    });

    const totTotale = totImponibile + totIva;
    const ggPag = cliente.giorni_pagamento || 30;
    const dataScad = _addDays(dataFattura, ggPag);

    // ─── CONFERMA (24/07 — Rinaldo: "non voglio fantasmi nel database") ───
    // Prima si scriveva senza chiedere nulla: un clic per curiosità lasciava
    // una bozza invisibile nell'elenco (che legge fatture_emesse) e bruciava
    // un numero della serie interna.
    if (!confirm('Generare la fattura interna?\n\n'
      + '• Numero: ' + numero + '/' + anno + ' (del ' + _fmtD(dataFattura) + ')\n'
      + '• Cliente: ' + (cliente.nome || '?') + '\n'
      + '• ' + selezionati.length + (selezionati.length === 1 ? ' ordine' : ' ordini') + '\n'
      + '• Imponibile ' + _fmtE(totImponibile) + ' + IVA ' + _fmtE(totIva) + ' = ' + _fmtE(totTotale) + '\n\n'
      + 'Nasce in BOZZA e il numero ' + numero + ' resta impegnato.')) {
      toast('Generazione annullata');
      return;
    }

    // Inserisci fattura
    const { data: fattura, error: errFatt } = await sb.from('fatture').insert([{
      numero, anno, data: dataFattura,
      cliente_id   : clienteId,
      cliente_nome : cliente.nome,
      imponibile   : totImponibile,
      iva          : totIva,
      totale       : totTotale,
      stato        : 'bozza',
      tipo_documento:'TD01',
      giorni_pagamento: ggPag,
      data_scadenza   : dataScad,
      note            : noteExtra,
    }]).select().single();

    if(errFatt){ toast('Errore fattura: '+errFatt.message); return; }

    // Inserisci righe
    const righeConId = righe.map(r=>({ ...r, fattura_id: fattura.id }));
    const { error: errRighe } = await sb.from('fattura_righe').insert(righeConId);
    if(errRighe){ toast('Errore righe: '+errRighe.message); return; }

    // ── Collega i DAS firmati degli ordini selezionati a questa fattura ──
    // Per ogni ordine con das_firmato_url, crea un record in documenti_ordine
    // con tipo='das_firmato' e fattura_id valorizzato. Così nel dettaglio
    // fattura (apriDettaglioFattura) e nella stampa PDF i DAS sono agganciati.
    const dasRecords = selezionati
      .filter(o => o.das_firmato_url)
      .map(o => {
        // Estrai il percorso_storage dall'URL pubblico Supabase
        // URL tipo: https://xxx.supabase.co/storage/v1/object/public/Das/<percorso>
        var percorso = null;
        try {
          var m = String(o.das_firmato_url).match(/\/Das\/(.+)$/);
          if (m && m[1]) percorso = decodeURIComponent(m[1]);
        } catch(e) {}
        return {
          ordine_id        : o.id,
          tipo             : 'das_firmato',
          nome_file        : o.das_firmato_nome || ('DAS_' + o.cliente + '_' + o.data),
          percorso_storage : percorso,
          fattura_id       : fattura.id
        };
      })
      .filter(r => r.percorso_storage); // solo se ho estratto un percorso valido

    if (dasRecords.length) {
      const { error: errDas } = await sb.from('documenti_ordine').insert(dasRecords);
      if (errDas) {
        console.warn('Errore collegamento DAS alla fattura:', errDas);
        toast('⚠ Fattura creata ma errore collegamento DAS: ' + errDas.message);
      }
    }

    toast(`✓ Fattura ${numero}/${anno} generata! Imponibile: ${_fmtE(totImponibile)}${dasRecords.length ? ' · ' + dasRecords.length + ' DAS collegati' : ''}`);
    _fattureOrdiniSelezionati.clear();
    document.getElementById('nf-ordini-area').innerHTML='';
    document.getElementById('nf-anteprima')?.remove();

    // Torna all'elenco
    const btnElenco = document.querySelector('.fatt-tab[data-tab="fatt-panel-elenco"]');
    if(btnElenco) switchFattureTab(btnElenco);
    await caricaFatture();

  } catch(e){
    toast('Errore: '+e.message);
    console.error(e);
  } finally {
    if(btn){ btn.disabled=false; }
  }
}

// ═════════════════════════════════════════════════════════════
// DETTAGLIO FATTURA (modale)
// ═════════════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════════════════
// MODIFICA NUMERO / DATA FATTURA (24/07 — richiesta Rinaldo: un numero
// sbagliato inserito da Consegne oggi non è correggibile).
// Check: il numero non può essere già di un'altra fattura dello stesso
// cedente nello stesso anno. `anno` è colonna GENERATA dalla data: non si
// scrive, cambia da sé cambiando la data.
// ═══════════════════════════════════════════════════════════════════
async function apriModificaFattura(id){
  const { data: f, error } = await sb.from('fatture_emesse').select('*').eq('id', id).single();
  if (error || !f) { toast('Fattura non trovata'); return; }
  const nOrd = await sb.from('ordini').select('id', { count: 'exact', head: true }).eq('fattura_id', id);
  const html = `
    <div style="font-size:13px;max-width:460px">
      <h2 style="margin:0 0 4px 0;color:#26215C">Modifica fattura</h2>
      <div style="font-size:11.5px;color:var(--text-muted);margin-bottom:16px">
        ${_esc(f.cessionario_denominazione || '—')} · attuale <strong>${_esc(f.numero)}/${f.anno || '?'}</strong> del ${_fmtD(f.data)}
        ${nOrd.count ? ' · ' + nOrd.count + (nOrd.count === 1 ? ' consegna collegata' : ' consegne collegate') : ''}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px">
        <div>
          <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">N° fattura</label>
          <input id="mf-numero" type="text" value="${_esc(f.numero || '')}" style="width:100%;padding:9px;margin-top:4px;border:0.5px solid var(--border);border-radius:6px;font-family:var(--font-mono);font-size:14px">
        </div>
        <div>
          <label style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px">Data</label>
          <input id="mf-data" type="date" value="${f.data || ''}" style="width:100%;padding:9px;margin-top:4px;border:0.5px solid var(--border);border-radius:6px;font-size:14px">
        </div>
      </div>
      <div style="margin-top:10px;font-size:11px;color:var(--text-muted);line-height:1.5">
        Il numero non può essere quello di un'altra fattura dello stesso anno. Cambiando la data cambia anche l'anno di riferimento.
      </div>
      <div style="margin-top:16px;display:flex;justify-content:flex-end;gap:8px">
        <button onclick="chiudiModal()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;font-size:12px">Annulla</button>
        <button class="btn-primary" onclick="salvaModificaFattura('${f.id}')" style="font-size:12px">Salva</button>
      </div>
    </div>`;
  apriModal(html);
}

async function salvaModificaFattura(id){
  const elN = document.getElementById('mf-numero'), elD = document.getElementById('mf-data');
  if (!elN || !elD) return;
  const numero = String(elN.value || '').trim();
  const data = String(elD.value || '').trim();
  if (!numero) { toast('Il numero non può essere vuoto'); return; }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) { toast('Data non valida'); return; }

  const { data: f, error: eF } = await sb.from('fatture_emesse').select('*').eq('id', id).single();
  if (eF || !f) { toast('Fattura non trovata'); return; }
  if (numero === String(f.numero || '') && data === String(f.data || '')) { toast('Nessuna modifica'); chiudiModal(); return; }

  // ─── Check numero già usato: stesso cedente, stesso anno, altra fattura
  const anno = Number(data.slice(0, 4));
  let q = sb.from('fatture_emesse').select('id,numero,data,cessionario_denominazione').eq('numero', numero).eq('anno', anno).neq('id', id);
  if (f.cedente_piva) q = q.eq('cedente_piva', f.cedente_piva);
  const { data: doppie, error: eQ } = await q;
  if (eQ) { toast('Errore verifica numero: ' + eQ.message); return; }
  if (doppie && doppie.length) {
    const d0 = doppie[0];
    toast('⛔ Il numero ' + numero + '/' + anno + ' è già della fattura di ' + (d0.cessionario_denominazione || '?') + ' del ' + _fmtD(d0.data));
    return;
  }

  const { error: eU } = await sb.from('fatture_emesse').update({ numero: numero, data: data }).eq('id', id);
  if (eU) { toast('Errore: ' + eU.message); return; }
  if (typeof _auditLog === 'function') {
    _auditLog('modifica_numero_fattura', 'fatture_emesse',
      'Fattura ' + id + ' | ' + (f.numero || '?') + '/' + (f.anno || '?') + ' del ' + (f.data || '?') +
      ' → ' + numero + '/' + anno + ' del ' + data + ' | ' + (f.cessionario_denominazione || ''));
  }
  toast('✓ Fattura aggiornata: ' + numero + ' del ' + _fmtD(data));
  chiudiModal();
  if (typeof caricaFatture === 'function') await caricaFatture();
  apriDettaglioFattura(id);
}

async function apriDettaglioFattura(id){
  const { data: f, error: errF } = await sb.from('fatture_emesse').select('*').eq('id', id).single();
  if(errF || !f){ toast('Fattura non trovata: ' + (errF?.message||'')); return; }

  const [{ data: righe }, { data: pagamenti }, { data: ordCollegati }] = await Promise.all([
    sb.from('fatture_righe').select('*').eq('fattura_id', id).order('numero_linea'),
    sb.from('fatture_pagamenti').select('*').eq('fattura_id', id).order('data_scadenza'),
    // Ordini agganciati a questa fattura (può essere >1 per riga in match N:1)
    sb.from('ordini').select('id, fattura_riga_id').eq('fattura_id', id),
  ]);

  // Mappa fattura_riga_id → numero ordini puntati (per badge "🔗 N ord" in UI)
  const nOrdPerRiga = new Map();
  const idsOrdPerRiga = new Map();
  (ordCollegati||[]).forEach(o => {
    if (!o.fattura_riga_id) return;
    nOrdPerRiga.set(o.fattura_riga_id, (nOrdPerRiga.get(o.fattura_riga_id)||0) + 1);
    if (!idsOrdPerRiga.has(o.fattura_riga_id)) idsOrdPerRiga.set(o.fattura_riga_id, []);
    idsOrdPerRiga.get(o.fattura_riga_id).push(o.id);
  });

  const matchBadge = {
    'matched':   '<span style="background:#639922;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">✓ Matched</span>',
    'uncertain': '<span style="background:#D4A017;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">⚠ Revisione</span>',
    'orphan':    '<span style="background:#A32D2D;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px;font-weight:700">✗ Orfana</span>',
    'pending':   '<span style="background:#888;color:#fff;padding:2px 8px;border-radius:10px;font-size:10px">· Pending</span>',
  }[f.match_status] || `<span>${_esc(f.match_status||'—')}</span>`;

  // Calcolo riga-per-riga: score e ordini collegati
  const righeHtml = (righe||[]).map(r=>{
    const score = r.riga_match_score;
    const scoreBadge = score != null
      ? (score >= 5 ? '<span style="color:#639922">✓</span>'
        : score >= 3 ? '<span style="color:#D4A017">⚠</span>'
        : '<span style="color:#A32D2D">✗</span>')
      : '<span style="color:#ccc">—</span>';
    // Usa conteggio reale da ordini.fattura_riga_id, fallback a ordine_id legacy
    const nLinkati = nOrdPerRiga.get(r.id) || (r.ordine_id ? 1 : 0);
    const idsList = idsOrdPerRiga.get(r.id) || (r.ordine_id ? [r.ordine_id] : []);
    const ordLink = nLinkati >= 2
      ? `<span style="font-size:10px;font-family:monospace;color:#6B5FCC;font-weight:700" title="Match N:1 — ${nLinkati} ordini: ${idsList.join(', ')}">🔗 ${nLinkati} ord</span>`
      : nLinkati === 1
        ? `<span style="font-size:10px;font-family:monospace;color:#639922" title="Ordine: ${idsList[0]||r.ordine_id}">🔗 ord</span>`
        : '';
    return `
      <tr style="border-bottom:0.5px solid var(--border)">
        <td style="padding:4px 8px">${r.numero_linea}</td>
        <td style="padding:4px 8px">${_esc((r.descrizione||'').substring(0,80))}${(r.descrizione||'').length>80?'…':''}</td>
        <td style="padding:4px 8px">${_esc(r.prodotto_normalizzato||'—')}</td>
        <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${r.quantita ? Number(r.quantita).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:2}) : '—'}</td>
        <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${r.prezzo_unitario!=null ? Number(r.prezzo_unitario).toFixed(5) : '—'}</td>
        <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(r.prezzo_totale)}</td>
        <td style="padding:4px 8px;text-align:center">${r.aliquota_iva!=null ? r.aliquota_iva + '%' : '—'}</td>
        <td style="padding:4px 8px;text-align:center">${_esc(r.das_numero_dogane||'—')}</td>
        <td style="padding:4px 8px;text-align:center">${scoreBadge} ${ordLink}</td>
      </tr>
    `;
  }).join('');

  // Pagamenti
  const pagHtml = (pagamenti && pagamenti.length) ? `
    <div style="margin-top:14px;padding-top:12px;border-top:0.5px solid var(--border)">
      <div style="font-size:11px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:.5px;margin-bottom:8px">💳 Pagamenti (${pagamenti.length})</div>
      <table style="width:100%;font-size:11px">
        <thead><tr style="background:var(--bg);color:var(--text-muted)">
          <th style="padding:4px 8px;text-align:left">Scadenza</th>
          <th style="padding:4px 8px;text-align:left">Modalità</th>
          <th style="padding:4px 8px;text-align:right">Importo</th>
          <th style="padding:4px 8px;text-align:left">IBAN</th>
          <th style="padding:4px 8px">Stato</th>
        </tr></thead>
        <tbody>
          ${pagamenti.map(p=>`
            <tr style="border-bottom:0.5px solid var(--border)">
              <td style="padding:4px 8px">${_fmtD(p.data_scadenza)}</td>
              <td style="padding:4px 8px">${_esc(p.modalita_pagamento||'—')}</td>
              <td style="padding:4px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(p.importo)}</td>
              <td style="padding:4px 8px;font-family:var(--font-mono);font-size:10px">${_esc(p.iban||'—')}</td>
              <td style="padding:4px 8px">${_esc(p.stato||'—')}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>` : '';

  // Indirizzo cessionario (se presente)
  const indirizzoShow = [f.cessionario_indirizzo, f.cessionario_cap, f.cessionario_comune, f.cessionario_provincia ? '('+f.cessionario_provincia+')' : '']
    .filter(Boolean).join(' ');

  const html = `
    <div style="font-size:13px;max-width:1000px">
      <h2 style="margin:0 0 8px 0;color:#26215C">Fattura ${_esc(f.numero)}/${f.anno||'?'}</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:16px">
        <div><span style="color:var(--text-muted);font-size:11px">N° Fattura</span><div style="font-weight:700;font-size:16px">${_esc(f.numero)}/${f.anno||'?'}</div></div>
        <div><span style="color:var(--text-muted);font-size:11px">Match</span><div style="margin-top:2px">${matchBadge}${f.match_score!=null ? ' <span style="font-size:10px;color:var(--text-muted)">score '+f.match_score+'/5</span>' : ''}</div></div>
        <div><span style="color:var(--text-muted);font-size:11px">Data</span><div style="font-weight:600">${_fmtD(f.data)}</div></div>
        <div><span style="color:var(--text-muted);font-size:11px">Tipo documento</span><div style="font-weight:600">${_esc(f.tipo_documento||'—')}</div></div>
        <div style="grid-column:1/-1">
          <span style="color:var(--text-muted);font-size:11px">Cliente</span>
          <div style="font-weight:600">${_esc(f.cessionario_denominazione||'—')}</div>
          <div style="font-size:11px;color:var(--text-muted);margin-top:2px">
            PIVA: <code style="font-family:var(--font-mono)">${_esc(f.cessionario_piva||'—')}</code>
            ${f.cessionario_codfiscale && f.cessionario_codfiscale!==f.cessionario_piva ? ' · CF: <code>'+_esc(f.cessionario_codfiscale)+'</code>' : ''}
          </div>
          ${indirizzoShow ? `<div style="font-size:11px;color:var(--text-muted);margin-top:2px">${_esc(indirizzoShow)}</div>` : ''}
        </div>
      </div>

      <div style="overflow-x:auto">
        <table style="width:100%;font-size:11px;margin-bottom:12px">
          <thead><tr style="background:var(--primary);color:#fff">
            <th style="padding:5px 8px;text-align:left">#</th>
            <th style="padding:5px 8px;text-align:left">Descrizione</th>
            <th style="padding:5px 8px;text-align:left">Prodotto</th>
            <th style="padding:5px 8px;text-align:right">Q.tà</th>
            <th style="padding:5px 8px;text-align:right">Prezzo/u</th>
            <th style="padding:5px 8px;text-align:right">Imponibile</th>
            <th style="padding:5px 8px;text-align:center">IVA</th>
            <th style="padding:5px 8px;text-align:center">DAS</th>
            <th style="padding:5px 8px;text-align:center">Match</th>
          </tr></thead>
          <tbody>${righeHtml}</tbody>
        </table>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;background:var(--bg);border-radius:8px;padding:12px">
        <div><div style="font-size:10px;color:var(--text-muted)">Imponibile</div><div style="font-family:var(--font-mono);font-weight:600">${_fmtE(f.imponibile_totale)}</div></div>
        <div><div style="font-size:10px;color:var(--text-muted)">IVA</div><div style="font-family:var(--font-mono);font-weight:600">${_fmtE(f.iva_totale)}</div></div>
        <div><div style="font-size:10px;color:var(--text-muted)">Totale</div><div style="font-family:var(--font-mono);font-weight:700;font-size:16px;color:var(--primary)">${_fmtE(f.importo_totale)}</div></div>
      </div>

      ${pagHtml}

      ${f.note ? `<div style="margin-top:10px;font-size:11px;color:var(--text-muted)">Note: ${_esc(f.note)}</div>` : ''}

      <div style="margin-top:12px;display:flex;justify-content:space-between;align-items:center;gap:10px">
        <button onclick="apriModificaFattura('${f.id}')" title="Correggi numero o data di questa fattura" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:8px 14px;font-size:12px;cursor:pointer;font-weight:600">✏️ Modifica numero / data</button>
        <button class="btn-primary" onclick="chiudiModal()">Chiudi</button>
      </div>
    </div>
  `;
  apriModal(html);
}

// ═════════════════════════════════════════════════════════════
// TAB 3 — XML FatturaPA v1.2.2
// ═════════════════════════════════════════════════════════════

async function generaXMLFatturaPA(fatturaId){
  const { data: f } = await sb.from('fatture').select('*').eq('id', fatturaId).single();
  const { data: righe } = await sb.from('fattura_righe').select('*').eq('fattura_id', fatturaId).order('numero_riga');
  const { data: cliente } = f?.cliente_id ? await sb.from('clienti').select('*').eq('id', f.cliente_id).single() : { data: null };
  if(!f||!righe?.length){ toast('Fattura non trovata o senza righe'); return; }

  // Raggruppa IVA per riepilogo
  const riepilogo = {};
  righe.forEach(r=>{
    const k=String(r.aliquota_iva);
    if(!riepilogo[k]) riepilogo[k]={ AliquotaIVA:r.aliquota_iva, ImponibileImporto:0, Imposta:0 };
    riepilogo[k].ImponibileImporto += Number(r.imponibile);
    riepilogo[k].Imposta           += Number(r.iva_importo);
  });

  const progressivo   = String(f.numero).padStart(4,'0');
  const codiceDestinatario = cliente?.codice_destinatario || '0000000';
  const pecDestinatario    = cliente?.pec_cliente || '';

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<p:FatturaElettronica versione="FPR12"
  xmlns:ds="http://www.w3.org/2000/09/xmldsig#"
  xmlns:p="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://ivaservizi.agenziaentrate.gov.it/docs/xsd/fatture/v1.2 http://www.fatturapa.gov.it/export/fatturazione/sdi/fatturapa/v1.2/Schema_del_file_xml_FatturaPA_versione_1.2.xsd">

  <FatturaElettronicaHeader>
    <DatiTrasmissione>
      <IdTrasmittente>
        <IdPaese>IT</IdPaese>
        <IdCodice>${_esc(CEDENTE.piva)}</IdCodice>
      </IdTrasmittente>
      <ProgressivoInvio>${progressivo}</ProgressivoInvio>
      <FormatoTrasmissione>FPR12</FormatoTrasmissione>
      <CodiceDestinatario>${_esc(codiceDestinatario)}</CodiceDestinatario>
      ${pecDestinatario?`<PECDestinatario>${_esc(pecDestinatario)}</PECDestinatario>`:''}
    </DatiTrasmissione>

    <CedentePrestatore>
      <DatiAnagrafici>
        <IdFiscaleIVA>
          <IdPaese>IT</IdPaese>
          <IdCodice>${_esc(CEDENTE.piva)}</IdCodice>
        </IdFiscaleIVA>
        <CodiceFiscale>${_esc(CEDENTE.codiceFiscale)}</CodiceFiscale>
        <Anagrafica>
          <Denominazione>${_esc(CEDENTE.ragioneSociale)}</Denominazione>
        </Anagrafica>
        <RegimeFiscale>${CEDENTE.regimeFiscale}</RegimeFiscale>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${_esc(CEDENTE.indirizzo)}</Indirizzo>
        <NumeroCivico>${_esc(CEDENTE.numeroCivico)}</NumeroCivico>
        <CAP>${_esc(CEDENTE.cap)}</CAP>
        <Comune>${_esc(CEDENTE.comune)}</Comune>
        <Provincia>${_esc(CEDENTE.provincia)}</Provincia>
        <Nazione>${CEDENTE.nazione}</Nazione>
      </Sede>
    </CedentePrestatore>

    <CessionarioCommittente>
      <DatiAnagrafici>
        ${cliente?.piva?`<IdFiscaleIVA><IdPaese>IT</IdPaese><IdCodice>${_esc(cliente.piva)}</IdCodice></IdFiscaleIVA>`:''}
        ${cliente?.codice_fiscale?`<CodiceFiscale>${_esc(cliente.codice_fiscale)}</CodiceFiscale>`:''}
        <Anagrafica>
          <Denominazione>${_esc(f.cliente_nome||'')}</Denominazione>
        </Anagrafica>
      </DatiAnagrafici>
      <Sede>
        <Indirizzo>${_esc(cliente?.indirizzo||'Via sconosciuta')}</Indirizzo>
        <CAP>${_esc(cliente?.cap||'00000')}</CAP>
        <Comune>${_esc(cliente?.citta||'')}</Comune>
        ${cliente?.provincia?`<Provincia>${_esc(cliente.provincia)}</Provincia>`:''}
        <Nazione>IT</Nazione>
      </Sede>
    </CessionarioCommittente>
  </FatturaElettronicaHeader>

  <FatturaElettronicaBody>
    <DatiGenerali>
      <DatiGeneraliDocumento>
        <TipoDocumento>${_esc(f.tipo_documento||'TD01')}</TipoDocumento>
        <Divisa>EUR</Divisa>
        <Data>${_esc(f.data)}</Data>
        <Numero>${_esc(String(f.numero))}</Numero>
        ${f.note?`<Causale>${_esc(f.note.substring(0,200))}</Causale>`:''}
        <ImportoTotaleDocumento>${_xmlNum(f.totale)}</ImportoTotaleDocumento>
      </DatiGeneraliDocumento>
    </DatiGenerali>

    <DatiBeniServizi>
      ${righe.map(r=>`
      <DettaglioLinee>
        <NumeroLinea>${r.numero_riga}</NumeroLinea>
        <Descrizione>${_esc(r.descrizione)}</Descrizione>
        <Quantita>${_xmlNum(r.quantita,3)}</Quantita>
        <UnitaMisura>${_esc(r.unita_misura||'LT')}</UnitaMisura>
        <PrezzoUnitario>${_xmlNum(r.prezzo_unitario,5)}</PrezzoUnitario>
        <PrezzoTotale>${_xmlNum(r.imponibile)}</PrezzoTotale>
        <AliquotaIVA>${_xmlNum(r.aliquota_iva,2)}</AliquotaIVA>
      </DettaglioLinee>`).join('')}

      ${Object.values(riepilogo).map(rv=>`
      <DatiRiepilogo>
        <AliquotaIVA>${_xmlNum(rv.AliquotaIVA,2)}</AliquotaIVA>
        <ImponibileImporto>${_xmlNum(rv.ImponibileImporto)}</ImponibileImporto>
        <Imposta>${_xmlNum(rv.Imposta)}</Imposta>
        <EsigibilitaIVA>I</EsigibilitaIVA>
      </DatiRiepilogo>`).join('')}
    </DatiBeniServizi>

    <DatiPagamento>
      <CondizioniPagamento>TP02</CondizioniPagamento>
      <DettaglioPagamento>
        <ModalitaPagamento>${_esc(f.modalita_pagamento||'MP05')}</ModalitaPagamento>
        <DataScadenzaPagamento>${_esc(f.data_scadenza||f.data)}</DataScadenzaPagamento>
        <ImportoPagamento>${_xmlNum(f.totale)}</ImportoPagamento>
      </DettaglioPagamento>
    </DatiPagamento>
  </FatturaElettronicaBody>
</p:FatturaElettronica>`;

  // Salva XML nel db
  await sb.from('fatture').update({ xml_fatturapa: xml, updated_at: new Date().toISOString() }).eq('id', fatturaId);

  // Download
  const blob     = new Blob([xml], { type:'application/xml;charset=utf-8' });
  const url      = URL.createObjectURL(blob);
  const a        = document.createElement('a');
  a.href         = url;
  a.download     = `IT${CEDENTE.piva}_${f.anno}${String(f.numero).padStart(4,'0')}.xml`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  toast(`✓ XML FatturaPA scaricato: ${a.download}`);
}

// ═════════════════════════════════════════════════════════════
// STAMPA PDF FATTURA
// ═════════════════════════════════════════════════════════════

async function stampaFattura(fatturaId){
  const { data: f } = await sb.from('fatture').select('*').eq('id', fatturaId).single();
  const { data: righe } = await sb.from('fattura_righe').select('*').eq('fattura_id', fatturaId).order('numero_riga');
  const { data: cliente } = f?.cliente_id ? await sb.from('clienti').select('*').eq('id', f.cliente_id).single() : { data: null };
  if(!f) return;

  const riepilogo = {};
  (righe||[]).forEach(r=>{
    const k=String(r.aliquota_iva);
    if(!riepilogo[k]) riepilogo[k]={aliquota:r.aliquota_iva,imponibile:0,iva:0};
    riepilogo[k].imponibile += Number(r.imponibile);
    riepilogo[k].iva        += Number(r.iva_importo);
  });

  const html = `<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8">
  <title>Fattura ${f.numero}/${f.anno}</title>
  <style>
    body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:15mm;color:#1a1a18}
    @media print{.no-print{display:none!important}@page{size:A4;margin:15mm}}
    .header{display:flex;justify-content:space-between;margin-bottom:20px}
    .logo-area{font-size:18px;font-weight:700;color:#D85A30}
    .fatt-number{font-size:14px;font-weight:700;color:#0C447C}
    .box{border:1px solid #ddd;border-radius:6px;padding:10px;margin-bottom:12px}
    .box-title{font-size:9px;font-weight:700;text-transform:uppercase;color:#888;margin-bottom:4px}
    .grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px}
    table{width:100%;border-collapse:collapse;margin-bottom:12px}
    th{background:#D85A30;color:#fff;padding:5px 6px;font-size:8px;text-transform:uppercase;border:1px solid #B33F1A;text-align:right}
    th:first-child,th:nth-child(2){text-align:left}
    td{padding:4px 6px;border:1px solid #eee;font-size:9px;text-align:right}
    td:first-child,td:nth-child(2){text-align:left}
    .tot-row{background:#f5f5f5;font-weight:700}
    .finale{background:#D85A30;color:#fff;font-weight:700;font-size:12px}
    .finale td{border-color:#B33F1A}
    .badge{display:inline-block;padding:2px 8px;border-radius:10px;font-size:9px;font-weight:700}
  </style>
  </head><body>
  <div class="no-print" style="padding:8px;background:#eee;text-align:center">
    <button onclick="window.print()">🖨️ Stampa / Salva PDF</button>
  </div>

  <div class="header">
    <div>
      <div class="logo-area">🔥 ${_esc(CEDENTE.ragioneSociale)}</div>
      <div>${_esc(CEDENTE.indirizzo)} ${_esc(CEDENTE.numeroCivico)} — ${_esc(CEDENTE.cap)} ${_esc(CEDENTE.comune)} (${_esc(CEDENTE.provincia)})</div>
      <div>P.IVA: ${_esc(CEDENTE.piva)}</div>
    </div>
    <div style="text-align:right">
      <div class="fatt-number">FATTURA N° ${f.numero}/${f.anno}</div>
      <div>Data: <strong>${_fmtD(f.data)}</strong></div>
      <div>Scadenza: <strong>${_fmtD(f.data_scadenza)}</strong></div>
    </div>
  </div>

  <div class="grid2">
    <div class="box">
      <div class="box-title">Cedente / Prestatore</div>
      <div><strong>${_esc(CEDENTE.ragioneSociale)}</strong></div>
      <div>${_esc(CEDENTE.indirizzo)} ${_esc(CEDENTE.numeroCivico)}</div>
      <div>${_esc(CEDENTE.cap)} ${_esc(CEDENTE.comune)} (${_esc(CEDENTE.provincia)})</div>
      <div>P.IVA: ${_esc(CEDENTE.piva)}</div>
    </div>
    <div class="box">
      <div class="box-title">Cessionario / Committente</div>
      <div><strong>${_esc(f.cliente_nome||'')}</strong></div>
      <div>${_esc(cliente?.indirizzo||'')}</div>
      <div>${_esc(cliente?.cap||'')} ${_esc(cliente?.citta||'')} ${cliente?.provincia?'('+_esc(cliente.provincia)+')':''}</div>
      ${cliente?.piva?`<div>P.IVA: ${_esc(cliente.piva)}</div>`:''}
      ${cliente?.codice_fiscale?`<div>C.F.: ${_esc(cliente.codice_fiscale)}</div>`:''}
    </div>
  </div>

  <table>
    <thead><tr>
      <th style="width:30px">N°</th><th>Descrizione</th><th>U.M.</th>
      <th>Quantità</th><th>Prezzo unit.</th><th>Imponibile</th><th>IVA%</th>
    </tr></thead>
    <tbody>
      ${(righe||[]).map(r=>`<tr>
        <td>${r.numero_riga}</td>
        <td>${_esc(r.descrizione)}</td>
        <td>${_esc(r.unita_misura||'LT')}</td>
        <td>${Number(r.quantita).toLocaleString('it-IT',{minimumFractionDigits:0})}</td>
        <td>${Number(r.prezzo_unitario).toFixed(5)}</td>
        <td>${_fmtE(r.imponibile)}</td>
        <td>${r.aliquota_iva}%</td>
      </tr>`).join('')}
    </tbody>
  </table>

  <div style="display:flex;justify-content:flex-end">
    <table style="width:280px">
      ${Object.values(riepilogo).map(rv=>`
        <tr><td style="text-align:left">Imponibile ${rv.aliquota}%</td><td>${_fmtE(rv.imponibile)}</td></tr>
        <tr><td style="text-align:left">IVA ${rv.aliquota}%</td><td>${_fmtE(rv.iva)}</td></tr>
      `).join('')}
      <tr class="tot-row"><td style="text-align:left">Imponibile totale</td><td>${_fmtE(f.imponibile)}</td></tr>
      <tr class="tot-row"><td style="text-align:left">IVA totale</td><td>${_fmtE(f.iva)}</td></tr>
      <tr class="finale"><td style="text-align:left">TOTALE FATTURA</td><td>${_fmtE(f.totale)}</td></tr>
    </table>
  </div>

  <div class="box" style="margin-top:12px">
    <strong>Dati di pagamento:</strong>
    Bonifico bancario entro ${f.giorni_pagamento||30} giorni dalla data fattura.
    ${f.note?`<br>Note: ${_esc(f.note)}`:''}
  </div>
  </body></html>`;

  const win = window.open('', '_blank');
  win.document.write(html);
  win.document.close();
}


// ═════════════════════════════════════════════════════════════
// IMPOSTAZIONI NUMERAZIONE
// ═════════════════════════════════════════════════════════════

async function caricaConfigFatture(){
  const annoSel = document.getElementById('cfg-fatt-anno');
  if(annoSel && !annoSel.children.length){
    const annoCorrente = new Date().getFullYear();
    for(let a=annoCorrente; a>=2023; a--){
      const opt = document.createElement('option');
      opt.value=a; opt.textContent=a;
      if(a===annoCorrente) opt.selected=true;
      annoSel.appendChild(opt);
    }
  }

  const anno = parseInt(document.getElementById('cfg-fatt-anno')?.value || new Date().getFullYear());
  const stato = document.getElementById('cfg-fatt-stato');

  // Leggi config esistente
  // Patch v20260503n: maybeSingle invece di single (evita 406 se nessuna config per l'anno)
  const { data: cfg } = await sb.from('fatture_config').select('*').eq('anno', anno).maybeSingle();
  const numInput = document.getElementById('cfg-fatt-numero');
  if(cfg && numInput) numInput.value = cfg.numero_iniziale;
  else if(numInput) numInput.value = '';

  // Leggi situazione attuale (max numero per ogni anno)
  const { data: riep } = await sb.from('fatture')
    .select('anno, numero')
    .order('anno', {ascending:false})
    .order('numero', {ascending:false});

  const perAnno = {};
  (riep||[]).forEach(r=>{
    if(!perAnno[r.anno] || r.numero > perAnno[r.anno]) perAnno[r.anno] = r.numero;
  });

  // Config per ogni anno
  const { data: cfgAll } = await sb.from('fatture_config').select('*').order('anno',{ascending:false});
  const cfgMap = {};
  (cfgAll||[]).forEach(c=>{ cfgMap[c.anno] = c.numero_iniziale; });

  const riepilogoEl = document.getElementById('cfg-fatt-riepilogo');
  if(riepilogoEl){
    const anni = [...new Set([...Object.keys(perAnno), ...Object.keys(cfgMap)])].sort((a,b)=>b-a);
    if(!anni.length){ riepilogoEl.innerHTML='Nessuna fattura ancora.'; }
    else {
      riepilogoEl.innerHTML = anni.map(a=>{
        const maxEmesso   = perAnno[a] || 0;
        const cfgNum      = cfgMap[a] || null;
        const prossimoEff = Math.max(maxEmesso+1, cfgNum||0);
        return `<div style="display:flex;justify-content:space-between;padding:5px 0;border-bottom:0.5px solid var(--border)">
          <span style="font-weight:600">${a}</span>
          <span>Ultimo emesso: <strong>${maxEmesso||'—'}</strong></span>
          ${cfgNum?`<span style="color:var(--primary)">Offset Danea: <strong>${cfgNum}</strong></span>`:'<span style="color:var(--text-muted)">Nessun offset</span>'}
          <span style="color:#2E7D32">Prossimo: <strong>${prossimoEff}</strong></span>
        </div>`;
      }).join('');
    }
  }

  if(stato) stato.textContent = cfg
    ? `✓ Offset impostato a ${cfg.numero_iniziale} per il ${anno}`
    : `Nessun offset configurato per il ${anno}`;
}

async function salvaConfigFatture(){
  const anno   = parseInt(document.getElementById('cfg-fatt-anno').value);
  const numero = parseInt(document.getElementById('cfg-fatt-numero').value);
  const stato  = document.getElementById('cfg-fatt-stato');

  if(!anno || isNaN(numero) || numero < 1){
    toast('Inserisci un numero valido (≥ 1)');
    return;
  }

  // Verifica che non sia inferiore all'ultimo già emesso
  const { data: maxRow } = await sb.from('fatture')
    .select('numero')
    .eq('anno', anno)
    .order('numero', {ascending:false})
    .limit(1)
    .maybeSingle();

  const maxEmesso = maxRow?.numero || 0;
  if(numero <= maxEmesso){
    toast(`⚠️ Hai già fatture fino al n° ${maxEmesso}/${anno}. Imposta un valore > ${maxEmesso}`);
    if(stato) stato.textContent = `⚠️ Valore troppo basso — ultime fattura emessa: ${maxEmesso}/${anno}`;
    return;
  }

  const { error } = await sb.from('fatture_config')
    .upsert([{ anno, numero_iniziale: numero }], { onConflict: 'anno' });

  if(error){ toast('Errore: '+error.message); return; }

  toast(`✓ Prossima fattura ${anno} partirà dal n° ${numero}`);
  if(stato) stato.textContent = `✓ Salvato — prossimo numero per ${anno}: ${numero}`;
  await caricaConfigFatture();
}

// Override: calcola prossimo numero tenendo conto dell'offset Danea
async function _prossimoNumeroFattura(anno){
  // Max già emesso nel db
  // Patch v20260503n: maybeSingle invece di single (evita 406 se nessuna fattura emessa nell'anno)
  const { data: maxRow } = await sb.from('fatture')
    .select('numero')
    .eq('anno', anno)
    .order('numero', {ascending:false})
    .limit(1)
    .maybeSingle();
  const maxEmesso = maxRow?.numero || 0;

  // Config offset Danea
  const { data: cfg } = await sb.from('fatture_config')
    .select('numero_iniziale')
    .eq('anno', anno)
    .maybeSingle();
  const offset = cfg?.numero_iniziale || 1;

  return Math.max(maxEmesso + 1, offset);
}

// ═════════════════════════════════════════════════════════════
// INIT (chiamata da setSection)
// ═════════════════════════════════════════════════════════════

async function initFatture(){
  await caricaConfigFatture();
  const annoSel = document.getElementById('fatt-filtro-anno');
  if(annoSel && !annoSel.value){
    const annoCorrente = new Date().getFullYear();
    for(let a=annoCorrente; a>=2023; a--){
      const opt = document.createElement('option');
      opt.value=a; opt.textContent=a;
      if(a===annoCorrente) opt.selected=true;
      annoSel.appendChild(opt);
    }
  }
  await inizializzaNuovaFattura();
  await caricaFatture();
}

// ═════════════════════════════════════════════════════════════
// NUOVA FATTURA v2 — Lista ordini consegnati con DAS
// Funzioni AGGIUNTIVE — non toccano nulla di esistente
// ═════════════════════════════════════════════════════════════

// Stato selezione ordini multi-cliente
window._nfOrdiniDisponibili = [];
window._nfSelezionati       = new Set();

async function caricaOrdiniFatturabili(){
  const clienteId = document.getElementById('nf-cliente')?.value || '';
  const dal       = document.getElementById('nf-dal')?.value || '';
  const al        = document.getElementById('nf-al')?.value || '';
  const area      = document.getElementById('nf-ordini-area');
  if(!area) return;
  area.innerHTML = '<div class="loading">Carico ordini consegnati con DAS…</div>';
  window._nfSelezionati.clear();

  // Ordini consegnati nel periodo
  let q = sb.from('ordini')
    .select('id,data,cliente,cliente_id,prodotto,litri,costo_litro,trasporto_litro,margine,iva,stato,giorni_pagamento,das_firmato_url,das_firmato_nome')
    .eq('stato','consegnato')
    .eq('tipo_ordine','cliente')
    .order('data',{ascending:false})
    .order('cliente');
  if(clienteId) q = q.eq('cliente_id', clienteId);
  if(dal) q = q.gte('data', dal);
  if(al)  q = q.lte('data', al);
  const { data: ordini, error } = await q;
  if(error){ area.innerHTML='<div style="color:red">Errore: '+error.message+'</div>'; return; }
  if(!ordini||!ordini.length){ area.innerHTML='<div class="loading">Nessun ordine consegnato nel periodo</div>'; return; }

  // Ordini già fatturati (uso fattura_id diretto, zero scan di fatture_righe)
  const ordineIds = ordini.map(o=>o.id);
  const { data: ordFatt } = await sb.from('ordini')
    .select('id')
    .in('id', ordineIds.slice(0, 1000))
    .not('fattura_id', 'is', null);
  const giàFatturatiSet = new Set((ordFatt||[]).map(o => o.id));

  // Filtra: solo quelli con DAS firmato (das_firmato_url) e non ancora fatturati
  const ordiniFatturabili = ordini.filter(o => o.das_firmato_url && !giàFatturatiSet.has(o.id));
  window._nfOrdiniDisponibili = ordiniFatturabili.map(o=>({ ...o, _das_url: o.das_firmato_url, _das_nome: o.das_firmato_nome }));

  if(!ordiniFatturabili.length){
    area.innerHTML='<div class="loading">Nessun ordine con DAS allegato e non ancora fatturato</div>';
    return;
  }

  const fmtD2 = d=>{ if(!d) return '—'; const p=d.split('-'); return p[2]+'/'+p[1]+'/'+p[0]; };
  const fmtL2 = v=>Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:0,maximumFractionDigits:0})+' L';
  const fmtE2 = v=>'€ '+Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});

  let html = '<div class="card" style="margin-bottom:14px">';
  html += '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px;flex-wrap:wrap">';
  html += '<strong style="font-size:13px">'+ordiniFatturabili.length+' ordini fatturabili</strong>';
  html += '<button class="btn-primary" style="font-size:11px;padding:5px 12px" onclick="_nfSelAll(true)">✓ Seleziona tutti</button>';
  html += '<button class="btn-primary" style="font-size:11px;padding:5px 12px;background:var(--bg);color:var(--text);border:0.5px solid var(--border)" onclick="_nfSelAll(false)">☐ Deseleziona</button>';
  html += '</div>';
  html += '<div style="overflow-x:auto"><table>';
  html += '<thead><tr><th style="width:30px"></th><th>Data</th><th>Cliente</th><th>Prodotto</th><th style="text-align:right">Litri</th><th style="text-align:right">Imponibile</th><th style="text-align:center">DAS</th></tr></thead><tbody>';

  ordiniFatturabili.forEach(o=>{
    const pNoIva = Number(o.costo_litro||0)+Number(o.trasporto_litro||0)+Number(o.margine||0);
    const impon  = pNoIva * Number(o.litri||0);
    const dasUrl = o.das_firmato_url || o._das_url; // retrocompat entrambi i nomi
    const dasLinks = dasUrl
      ? `<a href="${_esc(dasUrl)}" target="_blank" style="font-size:10px;color:#0C447C;text-decoration:none;padding:3px 8px;background:#E6F1FB;border-radius:4px;border:0.5px solid #85B7EB">📄 Apri</a>`
      : '—';
    html += `<tr>
      <td><input type="checkbox" class="nf2-chk" value="${o.id}" onchange="_nfAggiornaSelezione()"></td>
      <td style="font-size:12px">${fmtD2(o.data)}</td>
      <td style="font-size:12px;font-weight:500">${_esc(o.cliente||'')}</td>
      <td style="font-size:12px">${_esc(o.prodotto||'')}</td>
      <td style="text-align:right;font-family:var(--font-mono);font-size:12px">${fmtL2(o.litri)}</td>
      <td style="text-align:right;font-family:var(--font-mono);font-size:12px">${fmtE2(impon)}</td>
      <td style="text-align:center">${dasLinks}</td>
    </tr>`;
  });

  html += '</tbody></table></div></div>';
  area.innerHTML = html;
  _nfAggiornaSelezione();
}

function _nfSelAll(stato){
  document.querySelectorAll('.nf2-chk').forEach(c=>{ c.checked=stato; });
  _nfAggiornaSelezione();
}

function _nfAggiornaSelezione(){
  window._nfSelezionati.clear();
  document.querySelectorAll('.nf2-chk:checked').forEach(c=>window._nfSelezionati.add(c.value));

  const ant = document.getElementById('nf-anteprima-multi');
  if(!ant) return;

  const selezionati = window._nfOrdiniDisponibili.filter(o=>window._nfSelezionati.has(o.id));
  if(!selezionati.length){ ant.innerHTML=''; return; }

  // Raggruppa per cliente
  const perCliente = {};
  selezionati.forEach(o=>{
    const k = o.cliente_id || o.cliente;
    if(!perCliente[k]) perCliente[k]={ nome:o.cliente, id:o.cliente_id, ordini:[] };
    perCliente[k].ordini.push(o);
  });

  const nClienti = Object.keys(perCliente).length;
  const fmtE2 = v=>'€ '+Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2});

  let html = '<div class="card">';
  html += '<div style="font-size:13px;font-weight:600;margin-bottom:10px">📊 Riepilogo fatture da generare</div>';

  if(nClienti > 1){
    html += `<div style="background:#FFF3CD;border:0.5px solid #F0D080;border-radius:8px;padding:10px 14px;margin-bottom:12px;font-size:12px">
      ⚠️ Hai selezionato ordini di <strong>${nClienti} clienti diversi</strong>. Verranno generate <strong>${nClienti} fatture separate</strong>.
    </div>`;
  }

  Object.values(perCliente).forEach(cl=>{
    const tot = cl.ordini.reduce((s,o)=>{
      const p=Number(o.costo_litro||0)+Number(o.trasporto_litro||0)+Number(o.margine||0);
      return s+p*Number(o.litri||0);
    }, 0);
    const totIva = cl.ordini.reduce((s,o)=>{
      const p=Number(o.costo_litro||0)+Number(o.trasporto_litro||0)+Number(o.margine||0);
      const imp=p*Number(o.litri||0);
      return s+imp*(parseInt(o.iva||22)/100);
    }, 0);
    html += `<div style="background:var(--bg);border-radius:8px;padding:10px 14px;margin-bottom:8px;border:0.5px solid var(--border)">
      <div style="font-weight:600;margin-bottom:4px">${_esc(cl.nome)} — ${cl.ordini.length} ordini</div>
      <div style="display:flex;gap:20px;font-size:12px;font-family:var(--font-mono)">
        <span>Imponibile: <strong>${fmtE2(tot)}</strong></span>
        <span>IVA: <strong>${fmtE2(totIva)}</strong></span>
        <span style="color:var(--primary)">Totale: <strong>${fmtE2(tot+totIva)}</strong></span>
      </div>
    </div>`;
  });

  html += `<button class="btn-primary" style="width:100%;margin-top:8px;padding:12px;font-size:14px;background:#2E7D32"
    onclick="generaFattureMulti()">
    🧾 Genera ${nClienti} fattura${nClienti>1?'e':''} (${selezionati.length} ordini)
  </button>`;
  html += '</div>';
  ant.innerHTML = html;
}

async function generaFattureMulti(){
  const dataFattura = document.getElementById('nf-data')?.value || _oggi();
  const selezionati = window._nfOrdiniDisponibili.filter(o=>window._nfSelezionati.has(o.id));
  if(!selezionati.length){ toast('Seleziona almeno un ordine'); return; }

  // Raggruppa per cliente
  const perCliente = {};
  selezionati.forEach(o=>{
    const k = o.cliente_id || o.cliente;
    if(!perCliente[k]) perCliente[k]={ nome:o.cliente, id:o.cliente_id, ordini:[] };
    perCliente[k].ordini.push(o);
  });

  const nClienti = Object.keys(perCliente).length;
  if(nClienti > 1){
    if(!confirm(`Vuoi generare ${nClienti} fatture separate (una per ogni cliente)?`)) return;
  }

  const btn = document.querySelector('[onclick="generaFattureMulti()"]');
  if(btn){ btn.disabled=true; btn.textContent='⏳ Generazione…'; }

  try {
    let fattureCreate = 0;
    for(const cl of Object.values(perCliente)){
      // Dati cliente
      const { data: cliente } = cl.id
        ? await sb.from('clienti').select('*').eq('id', cl.id).single()
        : { data: { nome: cl.nome, giorni_pagamento: 30 } };

      const anno   = parseInt(dataFattura.split('-')[0]);
      const numero = await _prossimoNumeroFattura(anno);
      const ggPag  = cliente?.giorni_pagamento || 30;
      const dataScad = _addDays(dataFattura, ggPag);

      let totImponibile=0, totIva=0;
      const righe = cl.ordini.map((o,idx)=>{
        const pNoIva = Number(o.costo_litro||0)+Number(o.trasporto_litro||0)+Number(o.margine||0);
        const impon  = pNoIva * Number(o.litri||0);
        const aliq   = parseInt(o.iva||22);
        const ivaImp = impon*(aliq/100);
        totImponibile += impon; totIva += ivaImp;
        return {
          numero_riga:idx+1, ordine_id:o.id,
          descrizione:`${o.prodotto} del ${_fmtD(o.data)}`,
          prodotto:o.prodotto, unita_misura:'LT',
          quantita:Number(o.litri||0), prezzo_unitario:pNoIva,
          aliquota_iva:aliq, imponibile:impon, iva_importo:ivaImp,
          data_ordine:o.data
        };
      });

      // Crea fattura
      const { data: fattura, error: errF } = await sb.from('fatture').insert([{
        numero, anno, data:dataFattura,
        cliente_id:cl.id||null, cliente_nome:cl.nome,
        imponibile:totImponibile, iva:totIva, totale:totImponibile+totIva,
        stato:'bozza', tipo_documento:'TD01',
        giorni_pagamento:ggPag, data_scadenza:dataScad,
      }]).select().single();
      if(errF){ toast('Errore fattura '+cl.nome+': '+errF.message); continue; }

      // Crea righe
      await sb.from('fattura_righe').insert(righe.map(r=>({...r, fattura_id:fattura.id})));

      // Collega DAS degli ordini alla fattura
      const dasOrdineIds = cl.ordini.map(o=>o.id);
      await sb.from('documenti_ordine')
        .update({ fattura_id: fattura.id })
        .in('ordine_id', dasOrdineIds)
        .eq('tipo','das');

      fattureCreate++;
    }

    toast(`✓ ${fattureCreate} fattura${fattureCreate>1?'e':''} generate!`);
    window._nfSelezionati.clear();
    document.getElementById('nf-ordini-area').innerHTML='';
    document.getElementById('nf-anteprima-multi').innerHTML='';

    // Vai all'elenco
    const btnElenco = document.querySelector('.fatt-tab[data-tab="fatt-panel-elenco"]');
    if(btnElenco) switchFattureTab(btnElenco);
    await caricaFatture();

  } catch(e){
    toast('Errore: '+e.message);
    console.error(e);
  } finally {
    if(btn){ btn.disabled=false; btn.textContent='🧾 Genera fatture'; }
  }
}


// ═════════════════════════════════════════════════════════════════════
// DIAGNOSTICA FATTURA — patch v20260503m
// Bottone 🔍 sulla riga fattura nel pannello allineamento.
// Apre popup con: info fattura, righe + stato accoppiamento, ordini collegati,
// diagnosi automatica del caso (A/B/C) e azioni risolutive.
// ═════════════════════════════════════════════════════════════════════

async function allDiagnosticaFattura(fatturaId) {
  if (!fatturaId) { toast('ID fattura mancante'); return; }
  // Loader sopra il bottone
  const oldOverlay = document.getElementById('diag-overlay');
  if (oldOverlay) oldOverlay.remove();
  document.body.insertAdjacentHTML('beforeend', `
    <div id="diag-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center">
      <div style="background:white;padding:20px 30px;border-radius:8px;font-family:system-ui;font-size:13px">⏳ Analisi in corso…</div>
    </div>
  `);
  try {
    // 1. Carica fattura
    const { data: f, error: errF } = await sb.from('fatture_emesse')
      .select('id,numero,anno,data,cessionario_piva,cessionario_denominazione,importo_totale,cliente_id')
      .eq('id', fatturaId).single();
    if (errF || !f) throw new Error('Fattura non trovata: ' + (errF?.message || 'id non valido'));

    // 2. Carica TUTTE le righe della fattura
    const { data: righe, error: errR } = await sb.from('fatture_righe')
      .select('id,numero_linea,descrizione,prodotto_normalizzato,quantita,prezzo_totale,ignora_match')
      .eq('fattura_id', fatturaId)
      .order('numero_linea');
    if (errR) throw errR;

    // 3. Carica ordini che puntano alla fattura via fattura_id E ordini che puntano alla fattura via fattura_riga_id (anche se fattura_id NULL)
    // v20260515f: include aggancio_manuale per badge "🔒 Manuale" e logica di protezione
    const rigaIds = (righe || []).map(r => r.id);
    let { data: ordPerFatturaId } = await sb.from('ordini')
      .select('id,data,cliente,prodotto,litri,costo_litro,trasporto_litro,margine,iva,fattura_id,fattura_riga_id,stato,aggancio_manuale')
      .eq('fattura_id', fatturaId);
    let ordPerRiga = [];
    if (rigaIds.length) {
      const { data } = await sb.from('ordini')
        .select('id,data,cliente,prodotto,litri,costo_litro,trasporto_litro,margine,iva,fattura_id,fattura_riga_id,stato,aggancio_manuale')
        .in('fattura_riga_id', rigaIds);
      ordPerRiga = data || [];
    }
    // Unione (deduplica per id)
    const ordMap = new Map();
    (ordPerFatturaId || []).forEach(o => ordMap.set(o.id, o));
    (ordPerRiga || []).forEach(o => ordMap.set(o.id, o));
    const ordini = Array.from(ordMap.values());

    // 4. Cerca eventuali altre fatture con stesso numero (Caso C)
    const { data: omonime } = await sb.from('fatture_emesse')
      .select('id,numero,anno,data,cessionario_denominazione,importo_totale')
      .eq('numero', f.numero)
      .neq('id', fatturaId);

    // 5. Determina stato di ogni riga
    // Patch v20260503n: distinguo le righe-note (descrittive senza prodotto/qta/prezzo)
    //   dalle righe-prodotto vere. Le note non vengono contate come "orfane" nella diagnosi.
    const _isNota = r => !r.prodotto_normalizzato || !(Number(r.quantita) > 0) || !(Number(r.prezzo_totale) > 0);
    const righeAnalizzate = (righe || []).map(r => {
      const ordPerQuestaRiga = ordini.filter(o => o.fattura_riga_id === r.id);
      let stato;
      if (_isNota(r)) {
        stato = r.ignora_match ? 'nota_ok' : 'nota_da_ignorare';
      } else if (r.ignora_match) {
        stato = 'ignorata';
      } else if (ordPerQuestaRiga.length === 0) {
        stato = 'orfana';
      } else if (ordPerQuestaRiga.length === 1) {
        stato = 'accoppiata';
      } else {
        stato = 'doppia';
      }
      return { ...r, _ordini: ordPerQuestaRiga, _stato: stato };
    });

    // 6. Diagnosi automatica (basata SOLO su righe-prodotto, non su note)
    const ordiniLegacy = ordini.filter(o => o.fattura_id === fatturaId && !o.fattura_riga_id);
    const righeOrfane = righeAnalizzate.filter(r => r._stato === 'orfana');
    const righeAccoppiate = righeAnalizzate.filter(r => r._stato === 'accoppiata');
    const noteVere = righeAnalizzate.filter(r => r._stato === 'nota_ok' || r._stato === 'nota_da_ignorare');
    const noteDaIgnorare = righeAnalizzate.filter(r => r._stato === 'nota_da_ignorare');
    const righeProdotto = righeAnalizzate.filter(r => !_isNota(r));
    let casoDiagnosticato = '';
    let diagnosi = '';
    if ((omonime || []).length > 0) {
      casoDiagnosticato = 'C';
      diagnosi = `Trovate ${omonime.length} altre fatture con numero "${f.numero}". La fattura mostrata in elenco potrebbe non essere quella che hai accoppiato.`;
    } else if (ordiniLegacy.length > 0 && righeOrfane.length > 0) {
      casoDiagnosticato = 'B';
      diagnosi = `${ordiniLegacy.length} ordine/i collegato/i alla fattura ma SENZA fattura_riga_id (legame "vecchio stile"). Sotto il bottone "🔧 Riallinea" abbina automaticamente questi ordini alle righe orfane.`;
    } else if (righeOrfane.length > 0 && righeAccoppiate.length > 0) {
      casoDiagnosticato = 'A';
      diagnosi = `Fattura con ${righeProdotto.length} righe-prodotto: ${righeAccoppiate.length} già accoppiata/e, ${righeOrfane.length} orfana/e. Per ogni orfana puoi accoppiare manualmente, ignorare o creare l'ordine PhoenixFuel.`;
    } else if (righeProdotto.length > 0 && righeOrfane.length === righeProdotto.length) {
      casoDiagnosticato = 'D';
      diagnosi = `Tutte le ${righeProdotto.length} righe-prodotto sono orfane. Nessun accoppiamento esistente. Usa il pannello allineamento sopra per accoppiare.`;
    } else {
      casoDiagnosticato = 'OK';
      const partiOk = `${righeAccoppiate.length}/${righeProdotto.length} righe-prodotto accoppiate`;
      const partiNote = noteVere.length > 0 ? ` · ${noteVere.length} riga/he descrittiva/e (note)` : '';
      diagnosi = `Nessuna anomalia rilevata: ${partiOk}${partiNote}.`;
    }
    if (noteDaIgnorare.length > 0 && casoDiagnosticato === 'OK') {
      diagnosi += ` Trovate ${noteDaIgnorare.length} note non ancora marcate come ignorate (sotto il pulsante 📝 le pulisci tutte).`;
    }

    // 7. Render popup
    const ovr = document.getElementById('diag-overlay');
    if (ovr) ovr.remove();
    _allDiagRenderPopup({ fattura: f, righe: righeAnalizzate, ordiniLegacy, omonime: omonime || [], casoDiagnosticato, diagnosi });

  } catch (e) {
    const ovr = document.getElementById('diag-overlay');
    if (ovr) ovr.remove();
    toast('Errore diagnostica: ' + e.message);
    console.error('[diagnostica]', e);
  }
}


function _allDiagRenderPopup(d) {
  const f = d.fattura;
  const totRighe = d.righe.reduce((s,r) => s + Number(r.prezzo_totale||0), 0);
  const colorCaso = { 'A':'#0E6F8E', 'B':'#C97A1F', 'C':'#A32D2D', 'D':'#A32D2D', 'OK':'#3F7D1F' }[d.casoDiagnosticato] || '#0E6F8E';
  const noteDaIgnorare = d.righe.filter(r => r._stato === 'nota_da_ignorare');

  let righeHtml = '';
  d.righe.forEach(r => {
    let badge = '';
    let azioni = '';
    if (r._stato === 'nota_ok') {
      // Riga descrittiva (nota) già correttamente marcata come ignorata
      badge = `<span style="background:#EEEDFE;color:#4933C3;padding:2px 6px;border-radius:3px;font-size:10px">📝 Nota</span>`;
      const t = (r.descrizione || '').substring(0, 200);
      azioni = `<div style="font-size:10px;color:#666;margin-top:3px;font-style:italic">${_esc(t)}${(r.descrizione||'').length > 200 ? '…' : ''}</div>`;
    } else if (r._stato === 'nota_da_ignorare') {
      // Riga descrittiva (nota) NON ancora marcata come ignorata
      badge = `<span style="background:#FAEEDA;color:#7A5316;padding:2px 6px;border-radius:3px;font-size:10px">📝 Nota da ignorare</span>`;
      const t = (r.descrizione || '').substring(0, 200);
      azioni = `<div style="font-size:10px;color:#7A5316;margin-top:3px;font-style:italic">${_esc(t)}${(r.descrizione||'').length > 200 ? '…' : ''}</div>
        <button onclick="allDiagIgnora('${r.id}','${f.id}')" title="Marca questa nota come ignorata"
                style="background:#7A5316;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;margin-top:3px;cursor:pointer">🚫 Marca come ignorata</button>`;
    } else if (r._stato === 'accoppiata') {
      const o = r._ordini[0];
      const lockBadge = o.aggancio_manuale ? ' <span title="Aggancio manuale protetto dal Ricalcola" style="background:#FDF3D0;color:#7A5316;padding:1px 4px;border-radius:3px;font-size:9px;font-weight:600">🔒 Manuale</span>' : '';
      badge = `<span style="background:#E8F3DE;color:#3F7D1F;padding:2px 6px;border-radius:3px;font-size:10px">✅ Accoppiata</span>${lockBadge}`;
      azioni = `<div style="font-size:10px;color:#666;margin-top:3px">Ordine: ${_fmtD(o.data)} · ${_esc((o.cliente||'').substring(0,30))} · ${Number(o.litri||0).toLocaleString('it-IT')} L
        <button onclick="allDiagSganciaOrdine('${o.id}','${f.id}')" title="Sgancia ordine da questa riga"
                style="background:#A32D2D;color:white;border:0;border-radius:3px;padding:1px 5px;font-size:9px;margin-left:6px;cursor:pointer">🔓 Sgancia</button>
        <button onclick="allDiagApriOrdine('${o.id}')" title="Apri scheda ordine"
                style="background:#6B5FCC;color:white;border:0;border-radius:3px;padding:1px 5px;font-size:9px;margin-left:3px;cursor:pointer">👁 Apri</button>
      </div>`;
    } else if (r._stato === 'doppia') {
      badge = `<span style="background:#FCEBEB;color:#A32D2D;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600">⚠️ ANOMALIA: ${r._ordini.length} ordini su stessa riga</span>`;
      // Render: ogni ordine con 3 azioni (Sgancia, Riassegna a orfana, Apri)
      azioni = '<div style="font-size:10px;color:#666;margin-top:5px">';
      r._ordini.forEach(function(o, idx) {
        const lockBadge = o.aggancio_manuale ? ' <span title="Aggancio manuale protetto" style="background:#FDF3D0;color:#7A5316;padding:1px 4px;border-radius:2px;font-size:9px;font-weight:600">🔒</span>' : '';
        azioni += '<div style="background:#FFF8F8;border:0.5px solid #E8B5B5;border-radius:4px;padding:5px 7px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;gap:6px;flex-wrap:wrap">' +
          '<span style="flex:1;min-width:0">Ord ' + (idx+1) + ': ' + _fmtD(o.data) + ' · ' + _esc((o.cliente||'').substring(0,28)) + ' · ' + Number(o.litri||0).toLocaleString('it-IT') + ' L' + lockBadge + '</span>' +
          '<span style="display:flex;gap:3px;flex-shrink:0">' +
            '<button onclick="allDiagRiassegnaOrdine(\'' + o.id + '\',\'' + r.id + '\',\'' + f.id + '\')" title="Sposta questo ordine su una riga orfana compatibile della stessa fattura" style="background:#0E6F8E;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer;font-weight:600">↪ Riassegna</button>' +
            '<button onclick="allDiagSganciaOrdine(\'' + o.id + '\',\'' + f.id + '\')" title="Sgancia ordine dalla riga (torna orfano)" style="background:#A32D2D;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">🔓 Sgancia</button>' +
            '<button onclick="allDiagApriOrdine(\'' + o.id + '\')" title="Apri scheda ordine" style="background:#6B5FCC;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">👁</button>' +
          '</span>' +
        '</div>';
      });
      azioni += '</div>';
    } else if (r._stato === 'ignorata') {
      badge = `<span style="background:#EEE;color:#666;padding:2px 6px;border-radius:3px;font-size:10px">🚫 Ignorata</span>`;
      azioni = `<div style="font-size:10px;margin-top:3px">
        <button onclick="allDiagRipristinaIgnora('${r.id}','${f.id}')" title="Rimuovi flag ignora"
                style="background:#0E6F8E;color:white;border:0;border-radius:3px;padding:1px 5px;font-size:9px;cursor:pointer">↶ Ripristina</button>
      </div>`;
    } else {
      badge = `<span style="background:#FCEBEB;color:#A32D2D;padding:2px 6px;border-radius:3px;font-size:10px">⚠ Orfana</span>`;
      azioni = `<div style="font-size:10px;margin-top:3px;display:flex;gap:4px;flex-wrap:wrap">
        <button onclick="allDiagAccoppiaRiga('${r.id}','${f.id}')" title="Cerca ordini compatibili e accoppia"
                style="background:#6B5FCC;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">🔗 Accoppia</button>
        <button onclick="allDiagIgnora('${r.id}','${f.id}')" title="Marca come ignorata (conguagli, spese, ecc.)"
                style="background:#888;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">🚫 Ignora</button>
        <button onclick="allDiagCrea('${r.id}','${f.id}')" title="Crea ordine PhoenixFuel da questa riga"
                style="background:#A32D2D;color:white;border:0;border-radius:3px;padding:2px 6px;font-size:9px;cursor:pointer">➕ Crea ordine</button>
      </div>`;
    }
    righeHtml += `
      <div style="border:1px solid #e8e5dc;border-radius:5px;padding:6px 8px;margin-bottom:6px;background:white">
        <div style="display:flex;justify-content:space-between;align-items:center;gap:6px">
          <div style="flex:1;min-width:0">
            <div style="font-size:11px;font-weight:600;color:#26215C">Riga #${r.numero_linea || '?'} · ${_esc(r.prodotto_normalizzato||'(descrittiva)')}</div>
            <div style="font-size:10px;color:#666;font-family:monospace;margin-top:1px">${Number(r.quantita||0).toLocaleString('it-IT')} L · ${_fmtE(r.prezzo_totale||0)}</div>
          </div>
          <div style="flex-shrink:0">${badge}</div>
        </div>
        ${azioni}
      </div>
    `;
  });

  let omonimeHtml = '';
  if (d.omonime.length > 0) {
    omonimeHtml = `
      <div style="background:#FCEBEB;border:1px solid #C97A7A;border-radius:5px;padding:8px;margin:8px 0">
        <div style="font-size:11px;font-weight:600;color:#A32D2D;margin-bottom:4px">⚠ Trovate ${d.omonime.length} altre fatture con stesso numero "${_esc(f.numero)}"</div>
        ${d.omonime.map(o => `
          <div style="font-size:10px;margin:3px 0;padding:4px 6px;background:white;border-radius:3px">
            ${_fmtD(o.data)} (${o.anno}) · ${_esc((o.cessionario_denominazione||'').substring(0,40))} · ${_fmtE(o.importo_totale||0)}
            <button onclick="allDiagnosticaFattura('${o.id}')" style="background:#0E6F8E;color:white;border:0;border-radius:3px;padding:1px 5px;font-size:9px;margin-left:6px;cursor:pointer">🔍 Apri questa</button>
          </div>
        `).join('')}
      </div>
    `;
  }

  let azioneCasoB = '';
  if (d.casoDiagnosticato === 'B') {
    azioneCasoB = `
      <div style="background:#FAEEDA;border:1px solid #E8C98A;border-radius:5px;padding:8px;margin:8px 0">
        <div style="font-size:11px;font-weight:600;color:#7A5316;margin-bottom:6px">🔧 Riparazione automatica disponibile</div>
        <div style="font-size:10px;color:#7A5316;margin-bottom:6px">${d.ordiniLegacy.length} ordine/i hanno fattura_id ma manca fattura_riga_id. Posso provare ad abbinarli alle righe orfane usando prodotto + litri (match deterministico).</div>
        <button onclick="allDiagRiparaCasoB('${f.id}')" style="background:#7A5316;color:white;border:0;border-radius:4px;padding:5px 10px;font-size:10px;cursor:pointer;font-weight:600">🔧 Riallinea ordini-righe</button>
      </div>
    `;
  }

  // Patch v20260503n: bottone "marca tutte le note" se presenti note non ancora ignorate
  let azioneNote = '';
  if (noteDaIgnorare.length > 0) {
    azioneNote = `
      <div style="background:#EEEDFE;border:1px solid #C8C2F0;border-radius:5px;padding:8px;margin:8px 0">
        <div style="font-size:11px;font-weight:600;color:#4933C3;margin-bottom:6px">📝 ${noteDaIgnorare.length} riga/he descrittiva/e (note) non ancora marcate come ignorate</div>
        <div style="font-size:10px;color:#4933C3;margin-bottom:6px">Sono righe testuali importate da Danea (es. "Rif. conferma d'ordine", "Consegna effettuata dal vettore..."), non vere righe-prodotto. Le marco tutte come ignorate?</div>
        <button onclick="allDiagMarcaNoteFattura('${f.id}')" style="background:#4933C3;color:white;border:0;border-radius:4px;padding:5px 10px;font-size:10px;cursor:pointer;font-weight:600">📝 Marca tutte come ignorate</button>
      </div>
    `;
  }

  document.body.insertAdjacentHTML('beforeend', `
    <div id="diag-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.5);z-index:99999;display:flex;align-items:center;justify-content:center;padding:20px">
      <div style="background:#FAFAF7;border-radius:8px;padding:0;max-width:680px;width:100%;max-height:90vh;display:flex;flex-direction:column;box-shadow:0 10px 30px rgba(0,0,0,0.3)">
        <div style="background:${colorCaso};color:white;padding:12px 16px;border-radius:8px 8px 0 0;display:flex;justify-content:space-between;align-items:center">
          <div>
            <div style="font-size:14px;font-weight:600">🔍 Diagnostica Fattura ${_esc(f.numero)} · ${_fmtD(f.data)}</div>
            <div style="font-size:11px;opacity:0.9;margin-top:2px">${_esc((f.cessionario_denominazione||'').substring(0,50))} · ${_fmtE(f.importo_totale||0)}</div>
          </div>
          <button onclick="document.getElementById('diag-overlay').remove()" style="background:rgba(255,255,255,0.2);color:white;border:0;border-radius:4px;padding:5px 10px;font-size:14px;cursor:pointer">✕</button>
        </div>
        <div style="overflow-y:auto;padding:14px 16px">
          <div style="background:white;border-left:4px solid ${colorCaso};padding:10px 12px;border-radius:0 4px 4px 0;margin-bottom:10px">
            <div style="font-size:11px;font-weight:600;color:${colorCaso}">Caso ${d.casoDiagnosticato}</div>
            <div style="font-size:11px;color:#444;margin-top:4px;line-height:1.5">${_esc(d.diagnosi)}</div>
          </div>
          ${omonimeHtml}
          ${azioneCasoB}
          ${azioneNote}
          <div style="font-size:11px;font-weight:600;color:#26215C;margin:10px 0 6px">Righe della fattura (${d.righe.length}) · Totale ${_fmtE(totRighe)}</div>
          ${righeHtml}
        </div>
        <div style="background:#F0EEE6;padding:10px 16px;border-radius:0 0 8px 8px;display:flex;justify-content:flex-end;gap:8px">
          <button onclick="document.getElementById('diag-overlay').remove()" style="background:#888;color:white;border:0;border-radius:4px;padding:6px 14px;font-size:11px;cursor:pointer">Chiudi</button>
        </div>
      </div>
    </div>
  `);
}


// ─── INTERVENTI DIAGNOSTICI ──────────────────────────────────────────

// Sgancia ordine da fattura/riga (mette a NULL fattura_id e fattura_riga_id)
// v20260515f: resetta anche aggancio_manuale (lo sganci = perdi protezione, coerente)
async function allDiagSganciaOrdine(ordineId, fatturaId) {
  if (!confirm('Sganciare l\'ordine dalla fattura?\n\nL\'ordine tornerà visibile nel pannello allineamento per essere riaccoppiato.\nSe era marcato come "aggancio manuale" la protezione viene rimossa.')) return;
  try {
    const { error } = await sb.from('ordini')
      .update({ fattura_id: null, fattura_riga_id: null, aggancio_manuale: false })
      .eq('id', ordineId);
    if (error) throw error;
    toast('✅ Ordine sganciato');
    document.getElementById('diag-overlay')?.remove();
    await allDiagnosticaFattura(fatturaId);
    if (typeof caricaAllineamento === 'function') caricaAllineamento();
  } catch (e) { toast('Errore: ' + e.message); }
}

// Apri scheda ordine in popup separato
async function allDiagApriOrdine(ordineId) {
  if (typeof allEditOrdine === 'function') {
    document.getElementById('diag-overlay')?.remove();
    await allEditOrdine(ordineId);
  } else {
    toast('Funzione modifica ordine non disponibile');
  }
}

// Patch v20260503q: riassegna un ordine duplicato a una riga orfana compatibile della STESSA fattura.
// Cerca tra le righe orfane (no ordini collegati, no ignora_match, prodotto+litri compatibili ±1%).
// Se 0 candidate → toast errore. Se 1 candidata → riassegna direttamente con conferma.
// Se >1 candidate → mostra mini-popup di scelta.
async function allDiagRiassegnaOrdine(ordineId, rigaCorrId, fatturaId) {
  try {
    // 1. Carica ordine
    const { data: ord, error: errO } = await sb.from('ordini')
      .select('id,prodotto,litri,cliente,data')
      .eq('id', ordineId).single();
    if (errO || !ord) throw new Error('Ordine non trovato');

    // 2. Carica TUTTE le righe della fattura
    const { data: righe, error: errR } = await sb.from('fatture_righe')
      .select('id,numero_linea,prodotto_normalizzato,quantita,prezzo_totale,ignora_match')
      .eq('fattura_id', fatturaId);
    if (errR) throw errR;

    // 3. Trova quali righe sono già coperte da altri ordini
    const rigaIds = (righe||[]).map(r => r.id);
    let righeCoperte = new Set();
    if (rigaIds.length) {
      const { data: oColl } = await sb.from('ordini')
        .select('fattura_riga_id')
        .in('fattura_riga_id', rigaIds);
      (oColl||[]).forEach(o => { if (o.fattura_riga_id) righeCoperte.add(o.fattura_riga_id); });
    }

    // 4. Filtra: orfane (no ordini, no ignora) con prodotto+litri compatibili (±1%, min 1L)
    const _norm = s => (s||'').toString().toLowerCase().trim().replace(/\s+/g,' ');
    const tolleranza = Math.max(1, Number(ord.litri||0) * 0.01);
    const candidate = (righe||[]).filter(r =>
      !r.ignora_match
      && Number(r.quantita) > 0
      && !righeCoperte.has(r.id)
      && r.id !== rigaCorrId
      && _norm(r.prodotto_normalizzato) === _norm(ord.prodotto)
      && Math.abs(Number(r.quantita) - Number(ord.litri)) <= tolleranza
    );

    if (candidate.length === 0) {
      toast('⚠ Nessuna riga orfana compatibile (' + _norm(ord.prodotto) + ' · ' + Number(ord.litri).toLocaleString('it-IT') + ' L) in questa fattura');
      return;
    }

    if (candidate.length === 1) {
      const c = candidate[0];
      const msg = 'Riassegnare l\'ordine alla riga #' + (c.numero_linea||'?') + '?\n\n' +
        'Ordine: ' + _esc((ord.cliente||'').substring(0,40)) + ' · ' + Number(ord.litri).toLocaleString('it-IT') + ' L\n' +
        'Riga destinazione: ' + (c.prodotto_normalizzato||'?') + ' · ' + Number(c.quantita).toLocaleString('it-IT') + ' L\n\nProcedere?';
      if (!confirm(msg)) return;
      const { error: errU } = await sb.from('ordini').update({ fattura_riga_id: c.id }).eq('id', ordineId);
      if (errU) throw errU;
      toast('✅ Ordine riassegnato a riga #' + (c.numero_linea||'?'));
      document.getElementById('diag-overlay')?.remove();
      await allDiagnosticaFattura(fatturaId);
      if (typeof caricaAllineamento === 'function') caricaAllineamento();
      return;
    }

    // >1 candidate: mostra mini-popup di scelta
    document.getElementById('diag-pick-overlay')?.remove();
    let html = '<div id="diag-pick-overlay" style="position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:100000;display:flex;align-items:center;justify-content:center;padding:20px">' +
      '<div style="background:white;border-radius:8px;max-width:480px;width:100%;padding:0;box-shadow:0 10px 30px rgba(0,0,0,0.3)">' +
        '<div style="background:#0E6F8E;color:white;padding:10px 14px;border-radius:8px 8px 0 0;font-size:13px;font-weight:600">↪ Scegli riga destinazione (' + candidate.length + ' compatibili)</div>' +
        '<div style="padding:12px 14px;max-height:60vh;overflow-y:auto">' +
          '<div style="font-size:11px;color:#666;margin-bottom:8px">Ordine da riassegnare: <strong>' + _esc((ord.cliente||'').substring(0,40)) + '</strong> · ' + Number(ord.litri).toLocaleString('it-IT') + ' L</div>';
    candidate.forEach(c => {
      html += '<div style="border:1px solid #C8E0EA;border-radius:5px;padding:8px 10px;margin-bottom:6px;display:flex;justify-content:space-between;align-items:center;gap:8px">' +
        '<div style="flex:1;min-width:0"><div style="font-size:11px;font-weight:600">Riga #' + (c.numero_linea||'?') + ' · ' + _esc(c.prodotto_normalizzato||'?') + '</div>' +
        '<div style="font-size:10px;color:#666;font-family:monospace">' + Number(c.quantita).toLocaleString('it-IT') + ' L · ' + _fmtE(c.prezzo_totale||0) + '</div></div>' +
        '<button onclick="allDiagRiassegnaConferma(\'' + ordineId + '\',\'' + c.id + '\',\'' + fatturaId + '\')" style="background:#0E6F8E;color:white;border:0;border-radius:4px;padding:5px 10px;font-size:11px;cursor:pointer;font-weight:600">↪ Scegli</button>' +
      '</div>';
    });
    html += '</div>' +
      '<div style="background:#F0EEE6;padding:8px 14px;border-radius:0 0 8px 8px;text-align:right">' +
        '<button onclick="document.getElementById(\'diag-pick-overlay\').remove()" style="background:#888;color:white;border:0;border-radius:4px;padding:5px 12px;font-size:11px;cursor:pointer">Annulla</button>' +
      '</div>' +
    '</div></div>';
    document.body.insertAdjacentHTML('beforeend', html);
  } catch (e) {
    toast('Errore riassegnazione: ' + e.message);
    console.error('[riassegna]', e);
  }
}

async function allDiagRiassegnaConferma(ordineId, rigaTargetId, fatturaId) {
  try {
    const { error } = await sb.from('ordini').update({ fattura_riga_id: rigaTargetId }).eq('id', ordineId);
    if (error) throw error;
    document.getElementById('diag-pick-overlay')?.remove();
    document.getElementById('diag-overlay')?.remove();
    toast('✅ Ordine riassegnato');
    await allDiagnosticaFattura(fatturaId);
    if (typeof caricaAllineamento === 'function') caricaAllineamento();
  } catch (e) { toast('Errore: ' + e.message); }
}

// Riusa flusso esistente di accoppiamento
async function allDiagAccoppiaRiga(rigaId, fatturaId) {
  document.getElementById('diag-overlay')?.remove();
  if (typeof allCollegaFatturaAOrdine === 'function') {
    await allCollegaFatturaAOrdine(rigaId, fatturaId);
  } else {
    toast('Funzione collega non disponibile');
  }
}

async function allDiagIgnora(rigaId, fatturaId) {
  if (!confirm('Marcare questa riga come "ignora_match"?\n\nNon comparirà più come orfana negli accoppiamenti.\nUsa per: conguagli, spese di trasporto fatturate a parte, abbuoni.')) return;
  try {
    const { error } = await sb.from('fatture_righe')
      .update({ ignora_match: true })
      .eq('id', rigaId);
    if (error) throw error;
    toast('✅ Riga marcata come ignorata');
    document.getElementById('diag-overlay')?.remove();
    await allDiagnosticaFattura(fatturaId);
    if (typeof caricaAllineamento === 'function') caricaAllineamento();
  } catch (e) { toast('Errore: ' + e.message); }
}

async function allDiagRipristinaIgnora(rigaId, fatturaId) {
  try {
    const { error } = await sb.from('fatture_righe')
      .update({ ignora_match: false })
      .eq('id', rigaId);
    if (error) throw error;
    toast('✅ Flag ignora rimosso');
    document.getElementById('diag-overlay')?.remove();
    await allDiagnosticaFattura(fatturaId);
    if (typeof caricaAllineamento === 'function') caricaAllineamento();
  } catch (e) { toast('Errore: ' + e.message); }
}

async function allDiagCrea(rigaId, fatturaId) {
  document.getElementById('diag-overlay')?.remove();
  if (typeof allCreaOrdineDaRiga === 'function') {
    await allCreaOrdineDaRiga(rigaId);
  } else {
    toast('Funzione crea ordine non disponibile');
  }
}

// ─── CASO B: ripristino accoppiamenti legacy (fattura_id senza fattura_riga_id) ───
// Match deterministico tra ordini "legacy" e righe orfane usando prodotto + litri (tolleranza 1%).
async function allDiagRiparaCasoB(fatturaId) {
  if (!confirm('Riallineare ordini-righe per questa fattura?\n\n• Cerco ordini con fattura_id valorizzato ma fattura_riga_id NULL\n• Cerco righe orfane della stessa fattura\n• Abbino per prodotto + litri (tolleranza 1%)\n• Se ambiguo, ti chiedo conferma\n\nProcedere?')) return;
  try {
    // 1. Carica ordini legacy
    const { data: ordLegacy, error: errO } = await sb.from('ordini')
      .select('id,prodotto,litri,data,cliente')
      .eq('fattura_id', fatturaId)
      .is('fattura_riga_id', null);
    if (errO) throw errO;
    if (!ordLegacy || ordLegacy.length === 0) {
      toast('Nessun ordine legacy trovato');
      return;
    }

    // 2. Carica righe orfane (no ordini puntanti via fattura_riga_id e non ignorate)
    const { data: righe, error: errR } = await sb.from('fatture_righe')
      .select('id,numero_linea,prodotto_normalizzato,quantita,prezzo_totale,ignora_match')
      .eq('fattura_id', fatturaId);
    if (errR) throw errR;

    const rigaIds = (righe||[]).map(r => r.id);
    let righePuntate = new Set();
    if (rigaIds.length) {
      const { data: oP } = await sb.from('ordini').select('fattura_riga_id').in('fattura_riga_id', rigaIds);
      (oP||[]).forEach(o => { if (o.fattura_riga_id) righePuntate.add(o.fattura_riga_id); });
    }
    const righeOrfane = (righe||[]).filter(r => !r.ignora_match && Number(r.quantita)>0 && !righePuntate.has(r.id));

    if (righeOrfane.length === 0) {
      toast('Nessuna riga orfana da riallineare');
      return;
    }

    // 3. Match deterministico: per ogni riga orfana, trovo l'ordine legacy con prodotto compatibile e litri ±1%
    const _norm = s => (s||'').toString().toLowerCase().trim().replace(/\s+/g,' ');
    const usatiOrd = new Set();
    const abbinamenti = []; // {rigaId, ordineId}
    const conflitti = [];   // {rigaId, candidatiOrd:[]}
    righeOrfane.forEach(r => {
      const tolleranza = Math.max(1, Number(r.quantita) * 0.01);
      const cand = ordLegacy.filter(o => {
        if (usatiOrd.has(o.id)) return false;
        if (_norm(o.prodotto) !== _norm(r.prodotto_normalizzato)) return false;
        return Math.abs(Number(o.litri) - Number(r.quantita)) <= tolleranza;
      });
      if (cand.length === 1) {
        abbinamenti.push({ rigaId: r.id, ordineId: cand[0].id });
        usatiOrd.add(cand[0].id);
      } else if (cand.length > 1) {
        conflitti.push({ riga: r, candidati: cand });
      }
    });

    // 4. Esegui aggiornamenti
    let nFatti = 0, nErr = 0;
    for (const a of abbinamenti) {
      const { error } = await sb.from('ordini').update({ fattura_riga_id: a.rigaId }).eq('id', a.ordineId);
      if (error) { nErr++; console.error('[ripara-B]', error); }
      else nFatti++;
    }

    let msg = `✅ Riallineati ${nFatti}/${abbinamenti.length} ordini`;
    if (nErr) msg += ` · ${nErr} errore/i`;
    if (conflitti.length) msg += ` · ${conflitti.length} conflitto/i (più candidati per stessa riga, vanno risolti manualmente)`;
    toast(msg);

    document.getElementById('diag-overlay')?.remove();
    await allDiagnosticaFattura(fatturaId);
    if (typeof caricaAllineamento === 'function') caricaAllineamento();
  } catch (e) {
    toast('Errore riparazione: ' + e.message);
    console.error('[ripara-B]', e);
  }
}


// Patch v20260503n: marca tutte le righe-nota di UNA fattura come ignora_match=true
// SAFETY v20260503o: skip righe con ordini collegati via fattura_riga_id (anche se sembrano note)
async function allDiagMarcaNoteFattura(fatturaId) {
  try {
    // Carica tutte le righe della fattura
    const { data: righe, error: errR } = await sb.from('fatture_righe')
      .select('id,prodotto_normalizzato,quantita,prezzo_totale,ignora_match')
      .eq('fattura_id', fatturaId);
    if (errR) throw errR;

    // Candidate: righe-nota non già ignorate
    const candidate = (righe||[]).filter(r =>
      !r.ignora_match &&
      (!r.prodotto_normalizzato || !(Number(r.quantita) > 0) || !(Number(r.prezzo_totale) > 0))
    );

    if (candidate.length === 0) {
      toast('Nessuna nota da marcare');
      return;
    }

    // SAFETY v20260503o: tra le candidate, escludi quelle con ordini collegati via fattura_riga_id.
    // Una "riga-nota" che ha un ordine puntante non va toccata (caso anomalo, ma se esiste rispettiamolo).
    const candIds = candidate.map(r => r.id);
    const { data: ordCollegati } = await sb.from('ordini')
      .select('fattura_riga_id')
      .in('fattura_riga_id', candIds);
    const idsCollegati = new Set((ordCollegati || []).map(o => o.fattura_riga_id));

    const sicure = candidate.filter(r => !idsCollegati.has(r.id));
    const protette = candidate.filter(r => idsCollegati.has(r.id));

    if (sicure.length === 0) {
      toast(`⚠ Nessuna nota da marcare: tutte le ${protette.length} candidate hanno ordini collegati e sono protette`);
      return;
    }

    let msg = `Marcare ${sicure.length} riga/he descrittiva/e di questa fattura come ignorate?`;
    if (protette.length > 0) {
      msg += `\n\n⚠ ${protette.length} altra/e candidata/e SARÀ SALTATA per sicurezza (ha ordine collegato).`;
    }
    msg += `\n\nProcedere?`;
    if (!confirm(msg)) return;

    const ids = sicure.map(r => r.id);
    const { error: errU } = await sb.from('fatture_righe')
      .update({ ignora_match: true })
      .in('id', ids);
    if (errU) throw errU;

    let toastMsg = `✅ ${sicure.length} note marcate come ignorate`;
    if (protette.length > 0) toastMsg += ` · ${protette.length} saltate (avevano ordini collegati)`;
    toast(toastMsg);
    document.getElementById('diag-overlay')?.remove();
    await allDiagnosticaFattura(fatturaId);
    if (typeof caricaAllineamento === 'function') caricaAllineamento();
  } catch (e) {
    toast('Errore: ' + e.message);
    console.error('[marca-note]', e);
  }
}


// Patch v20260503n: sanatoria globale storico — marca TUTTE le righe-nota di TUTTE le fatture come ignora_match=true.
// SAFETY v20260503o: skip righe con ordini collegati via fattura_riga_id (anche se sembrano note).
// Approccio: SELECT righe candidate (paginazione 1000), filtro JS (gestisce NULL), check ordini collegati, UPDATE chunks da 200.
async function allDiagSanaTutteLeNote() {
  try {
    // 1. Carico tutte le righe con ignora_match=false (paginate per sicurezza)
    let candidate = [];
    let from = 0; const batch = 1000;
    while (true) {
      const { data, error } = await sb.from('fatture_righe')
        .select('id,prodotto_normalizzato,quantita,prezzo_totale')
        .eq('ignora_match', false)
        .range(from, from + batch - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      candidate = candidate.concat(data);
      if (data.length < batch) break;
      from += batch;
    }

    // 2. Filtro lato JS: solo le righe-nota (no prodotto, no qta, no prezzo)
    const note = candidate.filter(r =>
      !r.prodotto_normalizzato
      || r.quantita == null || Number(r.quantita) <= 0
      || r.prezzo_totale == null || Number(r.prezzo_totale) <= 0
    );

    if (note.length === 0) { toast('Nessuna nota da sanare nello storico'); return; }

    // 3. SAFETY v20260503o: escludi righe-nota con ordini collegati via fattura_riga_id.
    //    Le note non dovrebbero avere ordini, ma se per qualche caso anomalo ne hanno, NON le tocchiamo.
    //    Query batch in chunks da 500 ID per non superare limiti URL.
    const noteIds = note.map(r => r.id);
    const idsCollegati = new Set();
    for (let i = 0; i < noteIds.length; i += 500) {
      const chunkIds = noteIds.slice(i, i + 500);
      const { data: oCol, error: errOC } = await sb.from('ordini')
        .select('fattura_riga_id')
        .in('fattura_riga_id', chunkIds);
      if (errOC) throw errOC;
      (oCol || []).forEach(o => { if (o.fattura_riga_id) idsCollegati.add(o.fattura_riga_id); });
    }

    const sicure = note.filter(r => !idsCollegati.has(r.id));
    const protette = note.filter(r => idsCollegati.has(r.id));

    if (sicure.length === 0) {
      toast(`⚠ Nessuna nota sanabile: tutte le ${protette.length} candidate hanno ordini collegati e sono protette`);
      return;
    }

    let msg = `Sanatoria globale storico: marcare ${sicure.length} righe-nota come ignorate?`;
    if (protette.length > 0) {
      msg += `\n\n⚠ ${protette.length} riga/he aggiuntiva/e SARANNO SALTATE per sicurezza (hanno ordini collegati). Verranno mostrate nel popup diagnostica per analisi singola.`;
    }
    msg += `\n\nNon influisce sulle righe-prodotto reali (con quantità+prezzo).\n\nProcedere?`;
    if (!confirm(msg)) return;

    // 4. UPDATE in chunks da 200 ID
    const ids = sicure.map(r => r.id);
    let nDone = 0, nErr = 0;
    for (let i = 0; i < ids.length; i += 200) {
      const chunk = ids.slice(i, i + 200);
      const { error } = await sb.from('fatture_righe').update({ ignora_match: true }).in('id', chunk);
      if (error) { nErr++; console.error('[sana-note] chunk ' + i + ':', error); }
      else nDone += chunk.length;
    }

    let toastMsg = nErr ? `✅ Marcate ${nDone}/${ids.length} righe · ${nErr} chunk in errore (vedi console)` : `✅ Sanatoria completata: ${nDone} righe-nota marcate`;
    if (protette.length > 0) toastMsg += ` · ${protette.length} protette (avevano ordini collegati)`;
    toast(toastMsg);
    if (typeof caricaAllineamento === 'function') caricaAllineamento();
  } catch (e) {
    toast('Errore sanatoria: ' + e.message);
    console.error('[sana-note]', e);
  }
}
window.allDiagSanaTutteLeNote = allDiagSanaTutteLeNote;
