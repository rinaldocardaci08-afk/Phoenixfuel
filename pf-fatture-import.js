// ═══════════════════════════════════════════════════════════════════════════
// pf-fatture-import.js — UI import fatture Danea (FatturaPA SDI)
// Versione: 2026-04-22 v2 (parsing 100% client-side, no Edge Function)
// ═══════════════════════════════════════════════════════════════════════════

(function() {
'use strict';

let _parsedData = null;
let _batchId = null;

const DAS_RE = /DAS\s+(?:del\s+(\d{1,2}\s+[A-Za-zàèéìòù]+\s+\d{4}))?\s*(?:nr|n\.?|numero)?[:\s]*(\d{4,10})/i;
const ORDINE_RE = /Rif\.?\s*Conferma\s+d['']ordine\s+(\d+)\s+del\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;

const MESI = {
  'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
};

function normalizzaProdotto(desc) {
  const d = (desc || '').toLowerCase();
  if (d.includes('gasolio') && d.includes('autotraz')) return 'Gas Auto';
  if (d.includes('gasolio') && d.includes('agric')) return 'Gas Agricolo';
  if (d.includes('benzina')) return 'Benzina';
  if (d.includes('hvo')) return 'HVO';
  if (d.includes('adblue') || d.includes('ad blue') || d.includes('ad-blue')) return 'AdBlue';
  return null;
}

function parseItalianDate(str) {
  if (!str) return null;
  const m = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const giorno = parseInt(m[1]);
  const mese = MESI[m[2].toLowerCase()];
  const anno = parseInt(m[3]);
  if (!mese) return null;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

async function _loadJSZip() {
  if (window.JSZip) return window.JSZip;
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = 'https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js';
    s.onload = () => resolve(window.JSZip);
    s.onerror = () => reject(new Error('Impossibile caricare JSZip da CDN'));
    document.head.appendChild(s);
  });
}

function parseXMLFatturaLocale(xmlString, filename) {
  // Rimuovi blob PDF base64 per risparmiare memoria (non ci servono per il matching)
  xmlString = xmlString.replace(/<([a-zA-Z0-9]*:)?Attachment\b[^>]*>[\s\S]*?<\/([a-zA-Z0-9]*:)?Attachment>/gi, '<Attachment></Attachment>');

  const parser = new DOMParser();
  let doc;
  try {
    doc = parser.parseFromString(xmlString, 'text/xml');
  } catch (e) {
    return { errore: 'parsing_xml_exception: ' + e.message, filename: filename };
  }

  const errEl = doc.querySelector('parsererror');
  if (errEl) return { errore: 'parsing_xml_invalid', filename: filename };

  const first = (el, tag) => {
    if (!el) return null;
    const list = el.getElementsByTagName(tag);
    if (list && list.length > 0) return list[0];
    const list2 = el.getElementsByTagNameNS('*', tag);
    return (list2 && list2.length > 0) ? list2[0] : null;
  };
  const all = (el, tag) => {
    if (!el) return [];
    const list = el.getElementsByTagName(tag);
    if (list && list.length > 0) return Array.from(list);
    const list2 = el.getElementsByTagNameNS('*', tag);
    return list2 ? Array.from(list2) : [];
  };
  const txt = (el, tag) => {
    const e = first(el, tag);
    return e && e.textContent ? e.textContent.trim() : null;
  };

  const cedente = first(doc, 'CedentePrestatore');
  const cedente_piva = txt(first(cedente, 'IdFiscaleIVA'), 'IdCodice') || '';
  const cedente_denom = txt(first(cedente, 'Anagrafica'), 'Denominazione') || '';

  const cess = first(doc, 'CessionarioCommittente');
  const cess_piva = txt(first(cess, 'IdFiscaleIVA'), 'IdCodice') || null;
  const cess_cf = txt(cess, 'CodiceFiscale') || null;
  let cess_denom = txt(first(cess, 'Anagrafica'), 'Denominazione');
  if (!cess_denom) {
    const nome = txt(first(cess, 'Anagrafica'), 'Nome') || '';
    const cognome = txt(first(cess, 'Anagrafica'), 'Cognome') || '';
    cess_denom = (cognome + ' ' + nome).trim();
  }
  const cess_sede = first(cess, 'Sede');

  const dg = first(doc, 'DatiGeneraliDocumento');
  if (!dg) return { errore: 'dati_generali_mancanti', filename: filename };

  const numero = txt(dg, 'Numero');
  const data = txt(dg, 'Data');
  const tipo_doc = txt(dg, 'TipoDocumento');
  const divisa = txt(dg, 'Divisa') || 'EUR';
  const importo_totale = parseFloat(txt(dg, 'ImportoTotaleDocumento') || '0') || 0;

  const linee = all(doc, 'DettaglioLinee');
  const righe = [];
  for (const l of linee) {
    const desc = txt(l, 'Descrizione') || '';
    const qta = parseFloat(txt(l, 'Quantita') || '0') || null;
    const prezzo_t = parseFloat(txt(l, 'PrezzoTotale') || '0') || 0;

    let das_data = null, das_nr = null, das_data_str = null;
    const mDas = desc.match(DAS_RE);
    if (mDas) {
      das_data_str = mDas[1] || null;
      das_data = parseItalianDate(mDas[1] || '');
      das_nr = mDas[2] || null;
    }

    const mOrd = desc.match(ORDINE_RE);
    let ord_nr = null, ord_data = null;
    if (mOrd) {
      ord_nr = mOrd[1];
      if (mOrd[2]) {
        const p = mOrd[2].split(/[\/\-\.]/);
        if (p.length === 3) {
          const yy = p[2].length === 2 ? '20' + p[2] : p[2];
          ord_data = `${yy}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
        }
      }
    }

    const codArt = first(l, 'CodiceArticolo');
    const cod = codArt ? txt(codArt, 'CodiceValore') : null;

    righe.push({
      numero_linea: parseInt(txt(l, 'NumeroLinea') || '0'),
      descrizione: desc,
      prodotto_normalizzato: (qta && qta > 0) ? normalizzaProdotto(desc) : null,
      codice_articolo: cod,
      quantita: qta,
      unita_misura: txt(l, 'UnitaMisura'),
      prezzo_unitario: parseFloat(txt(l, 'PrezzoUnitario') || '0') || null,
      prezzo_totale: prezzo_t,
      aliquota_iva: parseFloat(txt(l, 'AliquotaIVA') || '0') || null,
      das_numero_dogane: das_nr,
      das_data_str: das_data_str,
      das_data: das_data,
      ordine_danea_numero: ord_nr,
      ordine_danea_data: ord_data,
    });
  }

  const riepArr = all(doc, 'DatiRiepilogo');
  let imponibile_totale = 0, iva_totale = 0;
  for (const r of riepArr) {
    imponibile_totale += parseFloat(txt(r, 'ImponibileImporto') || '0') || 0;
    iva_totale += parseFloat(txt(r, 'Imposta') || '0') || 0;
  }

  const pagamenti = [];
  const datiPagArr = all(doc, 'DatiPagamento');
  for (const dp of datiPagArr) {
    const condizioni = txt(dp, 'CondizioniPagamento');
    const dettagli = all(dp, 'DettaglioPagamento');
    for (const d of dettagli) {
      pagamenti.push({
        condizioni_pagamento: condizioni,
        modalita_pagamento: txt(d, 'ModalitaPagamento'),
        data_scadenza: txt(d, 'DataScadenzaPagamento'),
        importo: parseFloat(txt(d, 'ImportoPagamento') || '0') || 0,
        istituto_finanziario: txt(d, 'IstitutoFinanziario'),
        iban: txt(d, 'IBAN'),
      });
    }
  }

  return {
    filename: filename,
    fattura: {
      numero: numero ? String(numero) : '',
      data: data,
      tipo_documento: tipo_doc,
      divisa: divisa,
      cedente_piva: cedente_piva,
      cedente_denominazione: cedente_denom,
      cessionario_piva: cess_piva,
      cessionario_codfiscale: cess_cf,
      cessionario_denominazione: cess_denom || '?',
      cessionario_indirizzo: txt(cess_sede, 'Indirizzo'),
      cessionario_cap: txt(cess_sede, 'CAP'),
      cessionario_comune: txt(cess_sede, 'Comune'),
      cessionario_provincia: txt(cess_sede, 'Provincia'),
      cessionario_nazione: txt(cess_sede, 'Nazione') || 'IT',
      importo_totale: importo_totale,
      imponibile_totale: imponibile_totale || null,
      iva_totale: iva_totale || null,
    },
    righe: righe,
    pagamenti: pagamenti,
  };
}

async function renderFattureImport() {
  const container = document.getElementById('content-fatture-import');
  if (!container) {
    console.error('[pf-fatture-import] container content-fatture-import non trovato');
    return;
  }

  container.innerHTML = `
    <div style="max-width:1400px;margin:0 auto">
      <div id="fi-steps" style="display:flex;justify-content:center;gap:8px;margin-bottom:18px;background:#fff;padding:14px;border-radius:10px;box-shadow:0 1px 3px rgba(0,0,0,0.04)">
        <div class="fi-step active" data-step="1"><span class="fi-step-n">1</span><span>Upload ZIP</span></div>
        <div class="fi-step" data-step="2"><span class="fi-step-n">2</span><span>Parsing XML</span></div>
        <div class="fi-step" data-step="3"><span class="fi-step-n">3</span><span>Anteprima match</span></div>
        <div class="fi-step" data-step="4"><span class="fi-step-n">4</span><span>Import + audit</span></div>
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
        <input type="file" id="fi-file-input" accept=".zip,.xml" style="display:none"
               onchange="window.pfFattureImport._onFileSelected(this.files[0])"/>
        <button class="btn-primary" onclick="document.getElementById('fi-file-input').click()">
          Seleziona file dal computer
        </button>
      </div>
      <div style="margin-top:14px;font-size:11px;color:#666;background:#EEEDFE;padding:10px 14px;
           border-radius:6px;border-left:3px solid #6B5FCC">
        💡 Il parsing avviene direttamente nel tuo browser (tutto locale, niente upload).
        Anche ZIP grandi (100+ MB) funzionano senza problemi.
      </div>
    </div>
  `;

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
          (${(file.size / 1024 / 1024).toFixed(1)} MB)</div>
        <div style="font-size:11px;color:#666" id="fi-parse-status">⏳ Caricamento...</div>
      </div>
      <div class="fi-progress-bg"><div class="fi-progress-fg" id="fi-parse-progress" style="width:5%"></div></div>
      <div class="fi-log" id="fi-parse-log">
        <div class="info">[${_now()}] 📂 File: ${esc(file.name)}</div>
      </div>
    </div>
  `;

  const log = document.getElementById('fi-parse-log');
  const status = document.getElementById('fi-parse-status');
  const prog = document.getElementById('fi-parse-progress');

  try {
    await _loadJSZip();
    _logAppend(log, 'ok', '✓ JSZip caricato');
    prog.style.width = '10%';

    status.textContent = '⏳ Lettura file...';
    const buffer = await file.arrayBuffer();
    prog.style.width = '20%';
    _logAppend(log, 'ok', `✓ File letto (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);

    let xmlEntries = [];
    if (file.name.toLowerCase().endsWith('.zip')) {
      status.textContent = '⏳ Estrazione ZIP...';
      const zip = await window.JSZip.loadAsync(buffer);
      xmlEntries = Object.values(zip.files).filter(e => !e.dir && e.name.toLowerCase().endsWith('.xml'));
      _logAppend(log, 'ok', `✓ ${xmlEntries.length} file XML nello ZIP`);
      prog.style.width = '30%';
    } else {
      const decoder = new TextDecoder('utf-8');
      const content = decoder.decode(buffer);
      xmlEntries = [{ name: file.name, _content: content, async: async () => content }];
      prog.style.width = '30%';
    }

    const fatture = [];
    const anomalie = [];

    for (let i = 0; i < xmlEntries.length; i++) {
      const entry = xmlEntries[i];
      const xmlText = entry._content || await entry.async('string');
      const res = parseXMLFatturaLocale(xmlText, entry.name);
      if (res.errore) {
        anomalie.push({ filename: entry.name, errore: res.errore });
      } else {
        fatture.push(res);
      }

      if ((i + 1) % 10 === 0 || i === xmlEntries.length - 1) {
        const pct = 30 + Math.round(60 * (i + 1) / xmlEntries.length);
        prog.style.width = pct + '%';
        status.textContent = `⏳ Parsing ${i + 1}/${xmlEntries.length}...`;
        await new Promise(r => setTimeout(r, 0));
      }
    }

    _logAppend(log, 'ok', `✓ Parsing completato: ${fatture.length} fatture, ${anomalie.length} errori`);

    const importoTotale = fatture.reduce((s, f) => s + (f.fattura.importo_totale || 0), 0);
    const date = fatture.map(f => f.fattura.data).filter(d => d).sort();
    const fatturePiva = new Set(fatture.map(f => f.fattura.cessionario_piva).filter(p => p));
    const fattureDenom = new Set(fatture.map(f => f.fattura.cessionario_denominazione));
    const tipi = {};
    fatture.forEach(f => {
      const t = f.fattura.tipo_documento || '?';
      tipi[t] = (tipi[t] || 0) + 1;
    });

    _parsedData = {
      batch_id: crypto.randomUUID(),
      formato: 'fatturapa_sdi',
      fatture: fatture,
      anomalie: anomalie,
      statistiche: {
        file_totali: xmlEntries.length,
        fatture_parsate: fatture.length,
        errori: anomalie.length,
        importo_totale: Math.round(importoTotale * 100) / 100,
        data_min: date[0] || null,
        data_max: date[date.length - 1] || null,
        tipi_documento: tipi,
        clienti_unici_piva: fatturePiva.size,
        clienti_unici_denominazione: fattureDenom.size,
      },
    };
    _batchId = _parsedData.batch_id;

    const s = _parsedData.statistiche;
    _logAppend(log, 'ok', `✓ Totale fatturato: € ${_sep(s.importo_totale)}`);
    _logAppend(log, 'ok', `✓ Range date: ${s.data_min} → ${s.data_max}`);

    prog.style.width = '100%';
    prog.style.background = 'linear-gradient(90deg,#639922,#97C459)';
    status.textContent = '✓ Completato';

    setTimeout(() => renderStep3(), 500);

  } catch (e) {
    console.error('[fatture-import] errore:', e);
    _logAppend(log, 'err', `✗ Errore: ${e.message}`);
    status.textContent = '✗ Errore';
    prog.style.background = 'linear-gradient(90deg,#A32D2D,#E24B4A)';

    body.innerHTML += `
      <div class="fi-panel" style="border-left:4px solid #E24B4A">
        <h2 style="color:#791F1F">✗ Impossibile procedere</h2>
        <div style="font-size:12px;color:#666">Errore: <code>${esc(e.message)}</code></div>
        <button class="btn-primary" onclick="window.pfFattureImport.renderFattureImport()"
                style="margin-top:10px">← Torna allo step 1</button>
      </div>
    `;
  }
}

function renderStep3() {
  _setStep(3);
  const body = document.getElementById('fi-body');
  const s = _parsedData.statistiche;

  body.innerHTML = `
    <div class="fi-panel">
      <h2>📊 Step 3 — Parsing completato, ${s.fatture_parsate} fatture pronte</h2>

      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px;border-left:4px solid #0C447C">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Fatture</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;margin-top:4px">${s.fatture_parsate}</div>
          <div style="font-size:10px;color:#888">da ${_fmtData(s.data_min)} a ${_fmtData(s.data_max)}</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px;border-left:4px solid #639922">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Totale</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;margin-top:4px">€ ${_sep(s.importo_totale)}</div>
          <div style="font-size:10px;color:#888">sanity check</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px;border-left:4px solid #6B5FCC">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Clienti</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;margin-top:4px">${s.clienti_unici_denominazione}</div>
          <div style="font-size:10px;color:#888">${s.clienti_unici_piva} con PIVA</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px;border-left:4px solid ${s.errori > 0 ? '#E24B4A' : '#D4A017'}">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Errori</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;margin-top:4px">${s.errori}</div>
          <div style="font-size:10px;color:#888">${s.errori === 0 ? 'tutti validi' : 'da rivedere'}</div>
        </div>
      </div>

      <div style="background:#EEEDFE;border-left:4px solid #6B5FCC;padding:12px 16px;border-radius:6px;margin-bottom:14px">
        🚧 <strong>Matching con ordini in sviluppo</strong> — Per ora puoi verificare il parsing.
      </div>

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
              <th style="padding:8px;text-align:center">Righe</th>
              <th style="padding:8px;text-align:center">DAS</th>
              <th style="padding:8px;text-align:center">Pag.</th>
            </tr>
          </thead>
          <tbody>
            ${_parsedData.fatture.slice(0, 20).map(f => {
              const ft = f.fattura;
              const nRighe = f.righe.filter(r => r.quantita > 0).length;
              const nDas = f.righe.filter(r => r.das_numero_dogane).length;
              return `
                <tr style="border-bottom:1px solid #e8e5dc">
                  <td style="padding:7px;font-family:monospace;font-weight:700">${esc(ft.numero)}</td>
                  <td style="padding:7px">${_fmtData(ft.data)}</td>
                  <td style="padding:7px">${esc((ft.cessionario_denominazione || '').substring(0, 40))}</td>
                  <td style="padding:7px;text-align:right;font-family:monospace">€ ${_sep(ft.imponibile_totale || 0)}</td>
                  <td style="padding:7px;text-align:right;font-family:monospace">€ ${_sep(ft.importo_totale)}</td>
                  <td style="padding:7px;text-align:center">${nRighe}</td>
                  <td style="padding:7px;text-align:center">${nDas > 0 ? '✓ ' + nDas : '—'}</td>
                  <td style="padding:7px;text-align:center">${f.pagamenti.length}</td>
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
      <div style="font-size:13px;font-weight:700;color:#26215C">✓ Parsing pronto</div>
      <button class="btn-primary" onclick="window.pfFattureImport.renderFattureImport()"
              style="background:var(--bg);color:var(--text);border:0.5px solid var(--border)">
        ← Torna all'upload
      </button>
    </div>
  `;
}

function _setStep(n) {
  document.querySelectorAll('.fi-step').forEach(s => {
    const step = parseInt(s.dataset.step);
    s.classList.remove('active', 'done');
    if (step < n) s.classList.add('done');
    if (step === n) s.classList.add('active');
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

window.pfFattureImport = {
  renderFattureImport: renderFattureImport,
  _onFileSelected: _onFileSelected,
};

})();
