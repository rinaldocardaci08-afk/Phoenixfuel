// ═══════════════════════════════════════════════════════════════════════════
// pf-fatture-import.js — UI import fatture Danea (FatturaPA SDI)
// Versione: 2026-04-22 v1
// ═══════════════════════════════════════════════════════════════════════════
// Dipendenze: sb (Supabase client), toast, apriModal, chiudiModalePermessi,
//             _sbWrite, _auditLog, esc, fmtL, _sep (da app.js)
//
// Flusso:
//   1. Render tab "Import fatture"
//   2. Upload ZIP → chiamata Edge Function parse-fatture-danea
//   3. Anteprima match (matching lato client con ordini già caricati)
//   4. Conferma → insert in fatture_emesse/righe/pagamenti + audit
// ═══════════════════════════════════════════════════════════════════════════

(function() {
'use strict';

// Stato modulo
let _parsedData = null;        // risultato Edge Function
let _matchResults = null;       // esito matching con ordini PhoenixFuel
let _batchId = null;

const EDGE_URL = 'https://jpugeakgpitbxdswbucj.supabase.co/functions/v1/parse-fatture-danea';

// ───────────────────────────────────────────────────────────────────────────
// RENDER: entry point della tab
// ───────────────────────────────────────────────────────────────────────────
async function renderFattureImport() {
  const container = document.getElementById('content-fatture-import');
  if (!container) {
    console.error('[pf-fatture-import] container content-fatture-import non trovato');
    return;
  }

  container.innerHTML = `
    <div style="max-width:1400px;margin:0 auto">
      <div class="breadcrumb" style="margin-bottom:14px">
        💰 Finanze <span style="color:#ccc;margin:0 6px">›</span>
        📄 Fatture emesse <span style="color:#ccc;margin:0 6px">›</span>
        <span style="color:#6B5FCC;font-weight:700">📥 Import da Danea</span>
      </div>

      <div id="fi-steps" style="display:flex;justify-content:center;gap:8px;margin-bottom:18px;background:#fff;padding:14px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
        <div class="fi-step active" data-step="1">
          <span class="fi-step-n">1</span><span>Upload ZIP</span>
        </div>
        <div class="fi-step" data-step="2">
          <span class="fi-step-n">2</span><span>Parsing XML</span>
        </div>
        <div class="fi-step" data-step="3">
          <span class="fi-step-n">3</span><span>Anteprima match</span>
        </div>
        <div class="fi-step" data-step="4">
          <span class="fi-step-n">4</span><span>Import + audit</span>
        </div>
      </div>

      <div id="fi-body"></div>
    </div>

    <style>
      .fi-step { padding:10px 20px; background:#f0eee6; border:2px solid transparent; border-radius:20px;
        font-size:12px; font-weight:700; color:#888; display:flex; align-items:center; gap:8px;
        min-width:140px; justify-content:center; }
      .fi-step.done { background:#EAF3DE; color:#27500A; border-color:#639922; }
      .fi-step.active { background:#6B5FCC; color:#fff; border-color:#6B5FCC; }
      .fi-step-n { background:rgba(0,0,0,0.08); width:22px; height:22px; border-radius:50%;
        display:flex; align-items:center; justify-content:center; font-size:11px; }
      .fi-step.done .fi-step-n { background:#639922; color:#fff; }
      .fi-step.active .fi-step-n { background:rgba(255,255,255,0.3); color:#fff; }

      #fi-body .fi-panel { background:#fff; border-radius:10px; padding:22px;
        box-shadow:0 1px 4px rgba(0,0,0,0.04); margin-bottom:14px; }
      #fi-body .fi-panel h2 { font-size:15px; font-weight:700; color:#26215C; margin-bottom:12px; }

      .fi-upload { border:3px dashed #6B5FCC; border-radius:12px; padding:50px; text-align:center;
        background:#fafaf8; cursor:pointer; transition:all .2s; }
      .fi-upload:hover { background:#EEEDFE; border-color:#5A4FBB; }
      .fi-upload.dragover { background:#D9D5F5; border-color:#5A4FBB; }
      .fi-upload-icon { font-size:60px; margin-bottom:14px; }

      .fi-log { background:#1a1a18; color:#c0c0b8; padding:14px; border-radius:6px;
        font-family:'Courier New',monospace; font-size:11px; max-height:240px;
        overflow-y:auto; margin-top:12px; }
      .fi-log .ok { color:#97C459; }
      .fi-log .warn { color:#FAC775; }
      .fi-log .err { color:#F7C1C1; }
      .fi-log .info { color:#85B7EB; }

      .fi-progress-bg { background:#f0eee6; height:8px; border-radius:4px; overflow:hidden; margin-top:6px; }
      .fi-progress-fg { height:100%; background:linear-gradient(90deg,#6B5FCC,#8B7FDC); transition:width .3s; }
    </style>
  `;

  renderStep1();
}

// ───────────────────────────────────────────────────────────────────────────
// STEP 1: Upload
// ───────────────────────────────────────────────────────────────────────────
function renderStep1() {
  _setStep(1);
  const body = document.getElementById('fi-body');
  body.innerHTML = `
    <div class="fi-panel">
      <h2>📦 Step 1 — Carica export Danea</h2>

      <div class="fi-upload" id="fi-dropzone">
        <div class="fi-upload-icon">📂</div>
        <h3 style="font-size:18px;color:#26215C;margin-bottom:8px">Trascina qui il file ZIP o XML</h3>
        <p style="font-size:13px;color:#666;margin-bottom:14px">
          Esporta da Danea: <strong>Strumenti → Invia a commercialista (GeCom/PDF)</strong>
        </p>
        <p style="font-size:11px;color:#888;margin-bottom:14px">
          Formati accettati: ZIP con XML SDI (FatturaPA), XML singoli
        </p>
        <input type="file" id="fi-file-input" accept=".zip,.xml" style="display:none"
               onchange="window.pfFattureImport._onFileSelected(this.files[0])"/>
        <button class="btn-primary" onclick="document.getElementById('fi-file-input').click()">
          Seleziona file dal computer
        </button>
      </div>

      <div style="margin-top:14px;font-size:11px;color:#666;background:#EEEDFE;padding:10px 14px;
           border-radius:6px;border-left:3px solid #6B5FCC">
        💡 <strong>Suggerimento</strong>: al primo import consigliamo una finestra di 15-30 giorni
        per verificare la qualità del matching prima di procedere a volumi maggiori.
      </div>
    </div>
  `;

  // Drag & drop
  const dz = document.getElementById('fi-dropzone');
  dz.addEventListener('dragover', e => { e.preventDefault(); dz.classList.add('dragover'); });
  dz.addEventListener('dragleave', e => dz.classList.remove('dragover'));
  dz.addEventListener('drop', e => {
    e.preventDefault();
    dz.classList.remove('dragover');
    const f = e.dataTransfer.files[0];
    if (f) _onFileSelected(f);
  });
}

// ───────────────────────────────────────────────────────────────────────────
// STEP 2: Parsing (chiamata Edge Function)
// ───────────────────────────────────────────────────────────────────────────
async function _onFileSelected(file) {
  if (!file) return;
  const ok = file.name.toLowerCase().endsWith('.zip') || file.name.toLowerCase().endsWith('.xml');
  if (!ok) {
    toast('⚠️ Accetto solo file .zip o .xml', 'warning');
    return;
  }

  _setStep(2);
  const body = document.getElementById('fi-body');
  body.innerHTML = `
    <div class="fi-panel">
      <h2>⚙️ Step 2 — Parsing XML in corso</h2>
      <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px">File: <strong>${esc(file.name)}</strong>
          (${(file.size / 1024).toFixed(1)} KB)</div>
        <div style="font-size:11px;color:#666" id="fi-parse-status">⏳ Invio al parser...</div>
      </div>
      <div class="fi-progress-bg"><div class="fi-progress-fg" id="fi-parse-progress" style="width:10%"></div></div>
      <div class="fi-log" id="fi-parse-log">
        <div class="info">[${_now()}] 📂 File selezionato: ${esc(file.name)}</div>
        <div class="info">[${_now()}] 🔼 Invio al parser Edge Function...</div>
      </div>
    </div>
  `;

  const log = document.getElementById('fi-parse-log');
  const status = document.getElementById('fi-parse-status');
  const prog = document.getElementById('fi-parse-progress');

  try {
    // Chiamata Edge Function
    const formData = new FormData();
    formData.append('file', file);

    prog.style.width = '30%';
    const { data: { session } } = await sb.auth.getSession();
    const token = session?.access_token || sb.supabaseKey;

    const resp = await fetch(EDGE_URL, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });

    prog.style.width = '70%';
    _logAppend(log, 'info', '📥 Risposta ricevuta, elaboro...');

    if (!resp.ok) {
      const errTxt = await resp.text();
      throw new Error(`Edge Function HTTP ${resp.status}: ${errTxt}`);
    }

    const result = await resp.json();
    if (result.errore) {
      throw new Error(`Parser: ${result.errore} — ${result.dettaglio || ''}`);
    }

    _parsedData = result;
    _batchId = result.batch_id;

    // Mostra risultati parsing
    const s = result.statistiche;
    _logAppend(log, 'ok', `✓ Formato rilevato: ${result.formato}`);
    _logAppend(log, 'ok', `✓ File XML estratti: ${s.file_totali}`);
    _logAppend(log, 'ok', `✓ Fatture parsate: ${s.fatture_parsate}`);
    if (s.errori > 0) {
      _logAppend(log, 'warn', `⚠ Errori parsing: ${s.errori}`);
    }
    _logAppend(log, 'ok', `✓ Totale fatturato: € ${_sep(s.importo_totale)}`);
    _logAppend(log, 'ok', `✓ Range date: ${s.data_min} → ${s.data_max}`);
    _logAppend(log, 'ok', `✓ Clienti unici: ${s.clienti_unici_denominazione}`);

    prog.style.width = '85%';
    status.textContent = '⏳ Calcolo matching con ordini...';
    _logAppend(log, 'info', '🔍 Avvio matching contro ordini PhoenixFuel...');

    // Matching locale (richiede caricamento ordini del periodo)
    await _calcolaMatch();

    prog.style.width = '100%';
    prog.style.background = 'linear-gradient(90deg,#639922,#97C459)';
    status.textContent = '✓ Completato';
    _logAppend(log, 'ok', `✓ Matching completato`);

    // Aggiunge pulsante per andare allo step 3
    setTimeout(() => renderStep3(), 500);

  } catch (e) {
    console.error('[fatture-import] errore parsing:', e);
    _logAppend(log, 'err', `✗ Errore: ${e.message}`);
    status.textContent = '✗ Errore';
    prog.style.background = 'linear-gradient(90deg,#A32D2D,#E24B4A)';

    const body = document.getElementById('fi-body');
    body.innerHTML += `
      <div class="fi-panel" style="border-left:4px solid #E24B4A">
        <h2 style="color:#791F1F">✗ Impossibile procedere</h2>
        <div style="font-size:12px;color:#666;margin-bottom:10px">
          Il parsing del file ha fallito. Verifica che:
          <ul style="margin:8px 0 0 20px">
            <li>Il file sia un export Danea valido (ZIP o XML SDI)</li>
            <li>L'Edge Function <code>parse-fatture-danea</code> sia deployata</li>
            <li>La tua rete non blocchi le richieste a Supabase</li>
          </ul>
        </div>
        <button class="btn-primary" onclick="window.pfFattureImport.renderFattureImport()">
          ← Torna allo step 1
        </button>
      </div>
    `;
  }
}

// ───────────────────────────────────────────────────────────────────────────
// STEP 3: Calcolo match (STUB - verrà completato al prossimo turno)
// ───────────────────────────────────────────────────────────────────────────
async function _calcolaMatch() {
  if (!_parsedData) return;

  // STUB: per ora applica solo logica base, tutto finisce in "pending"
  // Al prossimo turno: implementazione completa del matching multi-campo
  const fatture = _parsedData.fatture;

  const matched = [], uncertain = [], orphan = [];
  for (const f of fatture) {
    // placeholder: per ora tutto pending
    f.match_status = 'pending';
    f.match_score = null;
    uncertain.push(f);
  }

  _matchResults = { matched, uncertain, orphan };
}

// ───────────────────────────────────────────────────────────────────────────
// STEP 3: Anteprima (rendering base, verrà completata al prossimo turno)
// ───────────────────────────────────────────────────────────────────────────
function renderStep3() {
  _setStep(3);
  const body = document.getElementById('fi-body');
  const s = _parsedData.statistiche;

  body.innerHTML = `
    <div class="fi-panel">
      <h2>📊 Step 3 — Parsing completato, ${s.fatture_parsate} fatture pronte</h2>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px;border-left:4px solid #0C447C">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Fatture parsate</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;margin-top:4px">${s.fatture_parsate}</div>
          <div style="font-size:10px;color:#888">da ${s.data_min} a ${s.data_max}</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px;border-left:4px solid #639922">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Importo totale</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;margin-top:4px">€ ${_sep(s.importo_totale)}</div>
          <div style="font-size:10px;color:#888">sanity check</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px;border-left:4px solid #6B5FCC">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Clienti unici</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;margin-top:4px">${s.clienti_unici_denominazione}</div>
          <div style="font-size:10px;color:#888">${s.clienti_unici_piva} con PIVA</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px;border-left:4px solid #D4A017">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Errori parsing</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;margin-top:4px;${s.errori > 0 ? 'color:#A32D2D' : ''}">${s.errori}</div>
          <div style="font-size:10px;color:#888">${s.errori === 0 ? 'tutti validi' : 'da rivedere'}</div>
        </div>
      </div>

      <div style="background:#EEEDFE;border-left:4px solid #6B5FCC;padding:12px 16px;border-radius:6px;margin-bottom:14px">
        🚧 <strong>Matching con ordini PhoenixFuel in sviluppo</strong><br>
        <span style="font-size:11px;color:#666">
          Al prossimo rilascio: matching automatico multi-campo (PIVA, data, prodotto, litri, importo)
          con UI revisione manuale e link a ordini. Per ora puoi solo verificare che il parsing sia
          corretto.
        </span>
      </div>

      <!-- Tabella anteprima prime 20 fatture -->
      <h3 style="font-size:13px;margin-bottom:8px;color:#26215C">Anteprima prime 20 fatture</h3>
      <div style="overflow-x:auto">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead>
            <tr style="background:#26215C;color:#fff">
              <th style="padding:8px;text-align:left">Nr</th>
              <th style="padding:8px;text-align:left">Data</th>
              <th style="padding:8px;text-align:left">Cliente</th>
              <th style="padding:8px;text-align:right">Imponibile</th>
              <th style="padding:8px;text-align:right">Totale</th>
              <th style="padding:8px;text-align:left">Nr righe</th>
              <th style="padding:8px;text-align:left">DAS estratti</th>
              <th style="padding:8px;text-align:left">Pagamenti</th>
            </tr>
          </thead>
          <tbody>
            ${_parsedData.fatture.slice(0, 20).map(f => {
              const ft = f.fattura;
              const nRighe = f.righe.filter(r => r.quantita > 0).length;
              const nDas = f.righe.filter(r => r.das_numero_dogane).length;
              const nPag = f.pagamenti.length;
              return `
                <tr style="border-bottom:1px solid #e8e5dc">
                  <td style="padding:7px;font-family:monospace;font-weight:700">${esc(ft.numero)}</td>
                  <td style="padding:7px">${_fmtData(ft.data)}</td>
                  <td style="padding:7px">${esc(ft.cessionario_denominazione.substring(0, 40))}</td>
                  <td style="padding:7px;text-align:right;font-family:monospace">€ ${_sep(ft.imponibile_totale || 0)}</td>
                  <td style="padding:7px;text-align:right;font-family:monospace">€ ${_sep(ft.importo_totale)}</td>
                  <td style="padding:7px;text-align:center">${nRighe}</td>
                  <td style="padding:7px;text-align:center">${nDas > 0 ? '✓ ' + nDas : '—'}</td>
                  <td style="padding:7px;text-align:center">${nPag}</td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
      ${_parsedData.fatture.length > 20 ? `
        <div style="margin-top:8px;font-size:11px;color:#666;text-align:center">
          ...e altre ${_parsedData.fatture.length - 20} fatture
        </div>
      ` : ''}
    </div>

    <div class="fi-panel" style="display:flex;justify-content:space-between;align-items:center">
      <div>
        <div style="font-size:13px;font-weight:700;color:#26215C">✓ Parsing pronto</div>
        <div style="font-size:11px;color:#666;margin-top:3px">
          Il codice UI per matching e import è in sviluppo (prossimo rilascio).
          Per ora puoi rivedere i dati estratti.
        </div>
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-secondary" onclick="window.pfFattureImport.renderFattureImport()">
          ← Torna all'upload
        </button>
        <button class="btn-primary" disabled title="Disponibile al prossimo rilascio"
                style="opacity:0.5;cursor:not-allowed">
          Continua a step 4 (da implementare)
        </button>
      </div>
    </div>
  `;
}

// ───────────────────────────────────────────────────────────────────────────
// Helper
// ───────────────────────────────────────────────────────────────────────────
function _setStep(n) {
  document.querySelectorAll('.fi-step').forEach(s => {
    const step = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    if (step < n) s.classList.add('done');
    if (step === n) s.classList.add('active');
    // Aggiorna icona
    const iconEl = s.querySelector('.fi-step-n');
    if (step < n) iconEl.textContent = '✓';
    else iconEl.textContent = String(step);
  });
}

function _logAppend(logEl, cls, msg) {
  const div = document.createElement('div');
  div.className = cls;
  div.textContent = `[${_now()}] ${msg}`;
  logEl.appendChild(div);
  logEl.scrollTop = logEl.scrollHeight;
}

function _now() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
}

function _fmtData(iso) {
  if (!iso) return '—';
  const p = iso.split('-');
  if (p.length !== 3) return iso;
  return `${p[2]}/${p[1]}/${p[0]}`;
}

// Esporta API modulo
window.pfFattureImport = {
  renderFattureImport: renderFattureImport,
  _onFileSelected: _onFileSelected,
};

})();
