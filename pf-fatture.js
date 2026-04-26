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
          <button class="btn-primary" style="font-size:10px;padding:3px 8px" onclick="apriDettaglioFattura('${f.id}')" title="Dettaglio">📄</button>
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

    const [ordiniRes, ordiniAnnoRes, fattureAnnoRes] = await Promise.all([
      // Ordini clienti consegnati nel periodo selezionato.
      // fattura_id popolato = già fatturato. IS NULL = da fatturare.
      sb.from('ordini')
        .select('id, data, cliente, cliente_id, prodotto, litri, costo_litro, trasporto_litro, margine, iva, stato, fattura_id')
        .eq('tipo_ordine', 'cliente')
        .eq('stato', 'consegnato')
        .gte('data', dataMin).lte('data', dataMax),
      // Tutti gli ordini clienti consegnati dell'ANNO (per riepilogo mensile)
      sb.from('ordini')
        .select('id, data')
        .eq('tipo_ordine', 'cliente')
        .eq('stato', 'consegnato')
        .gte('data', annoMin).lte('data', annoMax),
      // Tutte le fatture dell'ANNO (per riepilogo mensile)
      sb.from('fatture_emesse')
        .select('id, data')
        .gte('data', annoMin).lte('data', annoMax),
    ]);

    const ordini = ordiniRes.data || [];
    const ordiniAnno = ordiniAnnoRes.data || [];
    const fattureAnno = fattureAnnoRes.data || [];

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
      const nOrd = ordiniAnno.filter(o => o.data && o.data.startsWith(prefix)).length;
      const nFatt = fattureAnno.filter(f => f.data && f.data.startsWith(prefix)).length;
      // Skip mesi completamente vuoti (futuri)
      if (nOrd === 0 && nFatt === 0) continue;
      riepMesi.push({ mese: m, label: meseLabel[m-1], ordini: nOrd, fatture: nFatt });
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
              <button onclick="event.stopPropagation(); avviaRicalcoloNa1DaDashboard('${dataMin}','${dataMax}')"
                      title="Rilancia il matcher: cerca fatture con 1 riga che copre più ordini (N:1). Utile quando vedi 'ordini senza fattura' che in realtà sono già stati fatturati insieme ad altri."
                      style="background:#D4A017;color:white;border:0;border-radius:6px;padding:6px 10px;font-size:11px;font-weight:600;cursor:pointer;white-space:nowrap">
                🔁 Ricalcola match N:1
              </button>
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
                    let stato, colore;
                    if (r.ordini === 0 && r.fatture === 0) { stato = '—'; colore = '#888'; }
                    else if (r.fatture === 0 && r.ordini > 0) { stato = '⏳ Non importato'; colore = '#6B5FCC'; }
                    else if (diff === 0) { stato = '✓ Chiuso'; colore = '#639922'; }
                    else if (diff > 0) { stato = `⚠ ${diff} da fatturare`; colore = '#D4A017'; }
                    else { stato = `+${-diff} extra`; colore = '#8B6A00'; }
                    // Bottone "Sistema" solo per mesi con discrepanze risolvibili
                    const haRevisione = (diff > 0 || diff < 0) && r.fatture > 0;
                    const btnRevisione = haRevisione
                      ? `<button onclick="apriRevisioneMese(${annoInt}, ${r.mese})"
                                 title="Apri revisione fatture/ordini di ${r.label}"
                                 style="background:#6B5FCC;color:white;border:0;border-radius:4px;padding:2px 8px;font-size:9px;cursor:pointer;margin-left:4px">
                           📋 Sistema
                         </button>`
                      : '';
                    return `
                      <tr style="border-bottom:0.5px solid var(--border)">
                        <td style="padding:3px 4px">${r.label}</td>
                        <td style="padding:3px 4px;text-align:right;font-family:var(--font-mono)">${r.ordini}</td>
                        <td style="padding:3px 4px;text-align:right;font-family:var(--font-mono)">${r.fatture}</td>
                        <td style="padding:3px 4px;text-align:center;color:${colore};font-size:10px;font-weight:600">${stato}${btnRevisione}</td>
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

// Apre la revisione fatture per uno specifico mese (chiamata dal bottone
// "📋 Sistema" nel riepilogo mensile della dashboard).
// Switcha alla tab "Import da Danea", precompila i dropdown anno/mese,
// e simula il click su "Carica fatture e apri revisione".
async function apriRevisioneMese(anno, mese) {
  // 1. Cambio tab a "Import da Danea"
  const btnImport = document.querySelector('.fatt-tab[data-tab="fatt-panel-import"]');
  if (btnImport) {
    btnImport.click();
  } else {
    toast('Tab Import non trovata');
    return;
  }
  // 2. Aspetto che la tab abbia renderizzato (renderFattureImport è async)
  // Faccio polling sui dropdown del pannello revisione DB
  let tries = 0;
  const waitDom = () => new Promise(resolve => {
    const check = () => {
      const a = document.getElementById('fi-rev-anno');
      const m = document.getElementById('fi-rev-mese');
      const f = document.getElementById('fi-rev-filtro');
      if (a && m && f) return resolve(true);
      tries++;
      if (tries > 50) return resolve(false);  // 5s max
      setTimeout(check, 100);
    };
    check();
  });
  const ok = await waitDom();
  if (!ok) { toast('Pannello revisione non pronto'); return; }

  // 3. Precompilo dropdown e clicco
  document.getElementById('fi-rev-anno').value = String(anno);
  document.getElementById('fi-rev-mese').value = String(mese);
  document.getElementById('fi-rev-filtro').value = 'problematiche';
  // Scroll al pannello viola così Rinaldo lo vede
  const out = document.getElementById('fi-rev-output');
  if (out) out.scrollIntoView({ behavior: 'smooth', block: 'center' });
  // Lancio
  if (window.pfFattureImport && window.pfFattureImport._caricaDaDb) {
    await window.pfFattureImport._caricaDaDb();
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
function apriListaOrdiniSenzaFattura() {
  const ord = window._fattOrdiniSenzaFatt || [];
  if (!ord.length) return;
  const righe = ord.map(o => {
    const noIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
    const totNetto = noIva * Number(o.litri||0);
    return `
      <tr style="border-bottom:0.5px solid var(--border)">
        <td style="padding:5px 8px">${_fmtD(o.data)}</td>
        <td style="padding:5px 8px">${_esc(o.cliente||'—')}</td>
        <td style="padding:5px 8px">${_esc(o.prodotto||'—')}</td>
        <td style="padding:5px 8px;text-align:right;font-family:var(--font-mono)">${Number(o.litri||0).toLocaleString('it-IT')}</td>
        <td style="padding:5px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(totNetto)}</td>
      </tr>
    `;
  }).join('');

  const totImp = ord.reduce((s,o) => {
    const noIva = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
    return s + noIva * Number(o.litri||0);
  }, 0);

  const html = `
    <div style="font-size:13px;max-width:900px">
      <h2 style="margin:0 0 10px 0;color:#26215C">⚠ Ordini senza fattura — ${ord.length} record</h2>
      <div style="background:#FFF7E6;border-left:3px solid #D4A017;padding:10px 12px;border-radius:4px;margin-bottom:10px;font-size:12px;color:#8B6A00">
        <strong>${ord.length} ordini consegnati</strong> nel periodo <strong>non risultano fatturati</strong> in Danea.
        Può essere: fattura non ancora emessa, fattura di un altro periodo, ordine consegnato per errore, ecc.
      </div>
      <div style="max-height:450px;overflow-y:auto">
        <table style="width:100%;font-size:11px">
          <thead style="position:sticky;top:0;background:var(--primary);color:#fff">
            <tr>
              <th style="padding:6px 8px;text-align:left">Data</th>
              <th style="padding:6px 8px;text-align:left">Cliente</th>
              <th style="padding:6px 8px;text-align:left">Prodotto</th>
              <th style="padding:6px 8px;text-align:right">Litri</th>
              <th style="padding:6px 8px;text-align:right">Importo netto</th>
            </tr>
          </thead>
          <tbody>${righe}</tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--primary);background:var(--bg);font-weight:700">
              <td colspan="4" style="padding:6px 8px;text-align:right">Totale netto mancante:</td>
              <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono);color:#A32D2D">${_fmtE(totImp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style="margin-top:12px;text-align:right">
        <button class="btn-primary" onclick="chiudiModal()">Chiudi</button>
      </div>
    </div>
  `;
  apriModal(html);
}

// Modale: lista fatture orfane (senza ordine PhoenixFuel collegato)
function apriListaFattureOrfane() {
  const fatt = window._fattFattureOrfane || [];
  if (!fatt.length) return;
  const righe = fatt.map(f => `
    <tr style="border-bottom:0.5px solid var(--border);cursor:pointer" onclick="apriDettaglioFattura('${f.id}')">
      <td style="padding:5px 8px;font-family:var(--font-mono);font-weight:600">${_esc(f.numero)}/${f.anno}</td>
      <td style="padding:5px 8px">${_fmtD(f.data)}</td>
      <td style="padding:5px 8px">${_esc(f.cessionario_denominazione||'—')}</td>
      <td style="padding:5px 8px;font-family:var(--font-mono);font-size:10px">${_esc(f.cessionario_piva||'—')}</td>
      <td style="padding:5px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(f.importo_totale)}</td>
    </tr>
  `).join('');

  const totImp = fatt.reduce((s,f)=>s+Number(f.importo_totale||0),0);

  const html = `
    <div style="font-size:13px;max-width:900px">
      <h2 style="margin:0 0 10px 0;color:#26215C">✗ Fatture orfane — ${fatt.length} record</h2>
      <div style="background:#FDECEC;border-left:3px solid #A32D2D;padding:10px 12px;border-radius:4px;margin-bottom:10px;font-size:12px;color:#791F1F">
        <strong>${fatt.length} fatture orfane</strong>: emesse in Danea ma nessuna riga prodotto è stata collegata a un ordine PhoenixFuel al momento dell'import.
        Clicca una riga per vedere il dettaglio.
      </div>
      <div style="max-height:450px;overflow-y:auto">
        <table style="width:100%;font-size:11px">
          <thead style="position:sticky;top:0;background:var(--primary);color:#fff">
            <tr>
              <th style="padding:6px 8px;text-align:left">N°</th>
              <th style="padding:6px 8px;text-align:left">Data</th>
              <th style="padding:6px 8px;text-align:left">Cliente</th>
              <th style="padding:6px 8px;text-align:left">PIVA</th>
              <th style="padding:6px 8px;text-align:right">Totale</th>
            </tr>
          </thead>
          <tbody>${righe}</tbody>
          <tfoot>
            <tr style="border-top:2px solid var(--primary);background:var(--bg);font-weight:700">
              <td colspan="4" style="padding:6px 8px;text-align:right">Totale:</td>
              <td style="padding:6px 8px;text-align:right;font-family:var(--font-mono)">${_fmtE(totImp)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <div style="margin-top:12px;text-align:right">
        <button class="btn-primary" onclick="chiudiModal()">Chiudi</button>
      </div>
    </div>
  `;
  apriModal(html);
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

      <div style="margin-top:12px;text-align:right">
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
  const { data: cfg } = await sb.from('fatture_config').select('*').eq('anno', anno).single();
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
    .single();

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
  const { data: maxRow } = await sb.from('fatture')
    .select('numero')
    .eq('anno', anno)
    .order('numero', {ascending:false})
    .limit(1)
    .single();
  const maxEmesso = maxRow?.numero || 0;

  // Config offset Danea
  const { data: cfg } = await sb.from('fatture_config')
    .select('numero_iniziale')
    .eq('anno', anno)
    .single();
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
