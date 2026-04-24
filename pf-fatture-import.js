// ═══════════════════════════════════════════════════════════════════════════
// pf-fatture-import.js — UI import fatture Danea (FatturaPA SDI)
// Versione: 2026-04-23 v3 (+ STEP 3A matching multi-campo ordini/clienti)
// ═══════════════════════════════════════════════════════════════════════════

(function() {
'use strict';

let _parsedData = null;
let _batchId = null;
let _ordiniPeriodo = null;   // ordini Supabase del periodo fattura (±3gg)
let _clientiMap = null;      // Map cliente_id -> { nome, piva, piva_norm }
let _pivaDaAggiornare = [];  // [{ cliente_id, nome, piva_nuova, occorrenze, fattura_esempio }]

const DAS_RE = /DAS\s+(?:del\s+(\d{1,2}\s+[A-Za-zàèéìòù]+\s+\d{4}))?\s*(?:nr|n\.?|numero)?[:\s]*(\d{4,10})/i;
const ORDINE_RE = /Rif\.?\s*Conferma\s+d['']ordine\s+(\d+)\s+del\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;

const MESI = {
  'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
};

// Soglie scoring (costanti)
const MATCH_TOLL_DATA_GG      = 2;     // ±2 giorni
const MATCH_TOLL_LITRI_PCT    = 0.01;  // ±1%
const MATCH_TOLL_IMPONIBILE_E = 5.00;  // ±€5 (arrotondamenti Danea vs PhoenixFuel sono tipicamente < €3)
const MATCH_SOGLIA_MATCHED    = 5;     // score per "matched"
const MATCH_SOGLIA_UNCERTAIN  = 3;     // score min per "uncertain"
const CORREZIONE_CONFIRM_E    = 50.00; // se |diff| > €50 chiede confirm aggiuntivo per UPDATE margine

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

    // ── FIX AdBlue taniche: Danea fattura AdBlue in "pezzi" (taniche da 1000L).
    // Se prodotto = AdBlue e quantità piccola (tipicamente 1-5 pezzi) → converti in litri.
    // Conserva il valore originale in quantita_originale_pz per il dettaglio UI.
    const prodottoNorm = (qta && qta > 0) ? normalizzaProdotto(desc) : null;
    let qtaLitri = qta;
    let qtaOriginalePz = null;
    let unitaOriginaleStr = txt(l, 'UnitaMisura');
    if (prodottoNorm === 'AdBlue' && qta && qta > 0 && qta <= 10) {
      // Euristica: taniche (pz) da 1000L. Se 1 pezzo = 1000L, 2 pezzi = 2000L, ecc.
      qtaOriginalePz = qta;
      qtaLitri = qta * 1000;
    }

    righe.push({
      numero_linea: parseInt(txt(l, 'NumeroLinea') || '0'),
      descrizione: desc,
      prodotto_normalizzato: prodottoNorm,
      codice_articolo: cod,
      quantita: qtaLitri,
      quantita_originale_pz: qtaOriginalePz,
      unita_misura: unitaOriginaleStr,
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
      .fi-row-matched { background:#F4FAEC !important; }
      .fi-row-uncertain { background:#FFF7E6 !important; }
      .fi-row-orphan { background:#FDECEC !important; }
      .fi-badge-match { display:inline-block; padding:2px 8px; border-radius:10px; font-size:10px; font-weight:700; }
      .fi-badge-matched { background:#639922; color:#fff; }
      .fi-badge-uncertain { background:#D4A017; color:#fff; }
      .fi-badge-orphan { background:#A32D2D; color:#fff; }
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
    toast('⚠️ Accetto solo file .zip o .xml');
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
    _logAppend(log, 'ok', `✓ Totale fatturato: € ${_fmtN(s.importo_totale)}`);
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

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3A — MATCHING MULTI-CAMPO
// ═══════════════════════════════════════════════════════════════════════════

// Normalizza stringa per confronto fuzzy nome cliente
function _normalizzaNome(s) {
  if (!s) return '';
  return String(s)
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // rimuove accenti
    .replace(/\bs\.?\s*r\.?\s*l\.?\b/g, '')           // togli "s.r.l."
    .replace(/\bs\.?\s*p\.?\s*a\.?\b/g, '')           // togli "s.p.a."
    .replace(/\bs\.?\s*n\.?\s*c\.?\b/g, '')           // togli "s.n.c."
    .replace(/\bsas\b/g, '')                           // togli "sas"
    .replace(/\bdi\s+/g, ' ')                          // togli "di "
    .replace(/[^a-z0-9]+/g, ' ')                       // solo alfanumerici
    .replace(/\s+/g, ' ')
    .trim();
}

// Normalizza PIVA (solo cifre, senza prefisso IT)
function _normalizzaPiva(p) {
  if (!p) return '';
  return String(p).replace(/[^0-9]/g, '');
}

// Differenza in giorni tra due date ISO "YYYY-MM-DD"
function _diffGiorni(isoA, isoB) {
  if (!isoA || !isoB) return Infinity;
  const a = new Date(isoA).getTime();
  const b = new Date(isoB).getTime();
  if (isNaN(a) || isNaN(b)) return Infinity;
  return Math.abs((a - b) / 86400000);
}

// Calcola imponibile ordine: litri * (costo + trasporto + margine)
function _imponibileOrdine(o) {
  const prezzoNoIva = Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0) + Number(o.margine || 0);
  return prezzoNoIva * Number(o.litri || 0);
}

// Aggiunge N giorni a una data ISO
function _addGiorni(iso, n) {
  const d = new Date(iso);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

// Carica ordini Supabase del periodo + mappa clienti per PIVA lookup
async function _caricaDatiPeriodo(dataMin, dataMax, logEl) {
  const rangeMin = _addGiorni(dataMin, -MATCH_TOLL_DATA_GG - 1);
  const rangeMax = _addGiorni(dataMax, MATCH_TOLL_DATA_GG + 1);

  if (logEl) _logAppend(logEl, 'info', `⏳ Carico ordini Supabase ${rangeMin} → ${rangeMax}...`);

  // Ordini tipo_ordine='cliente' (autoconsumo escluso: autofatture non entrano nel matching Danea clienti)
  const { data: ordini, error: errOrd } = await sb.from('ordini')
    .select('id,data,cliente,cliente_id,prodotto,litri,costo_litro,trasporto_litro,margine,iva,tipo_ordine,stato,fornitore')
    .eq('tipo_ordine', 'cliente')
    .neq('stato', 'annullato')
    .gte('data', rangeMin)
    .lte('data', rangeMax);

  if (errOrd) throw new Error('Errore caricamento ordini: ' + errOrd.message);

  _ordiniPeriodo = ordini || [];
  if (logEl) _logAppend(logEl, 'ok', `✓ ${_ordiniPeriodo.length} ordini clienti caricati`);

  // Carica TUTTI i clienti (servono per lookup PIVA da cliente_id)
  // In produzione ~200-300 clienti, una SELECT one-shot è più efficiente di join ripetuto
  const { data: clienti, error: errCl } = await sb.from('clienti')
    .select('id,nome,piva');

  if (errCl) throw new Error('Errore caricamento clienti: ' + errCl.message);

  _clientiMap = new Map();
  (clienti || []).forEach(c => {
    _clientiMap.set(c.id, {
      nome: c.nome,
      nome_norm: _normalizzaNome(c.nome),
      piva: c.piva,
      piva_norm: _normalizzaPiva(c.piva),
    });
  });

  if (logEl) _logAppend(logEl, 'ok', `✓ ${_clientiMap.size} clienti in anagrafica`);
}

// ─── Match N:1 (1 riga fattura → N ordini stesso cliente/prodotto/giorno) ───
// Usato per i casi Ennegi/Stiltracom: più consegne da 5.000 L stesso giorno
// raggruppate in 1 sola riga fattura Danea. Enumerazione subset-sum con
// bitmask (max 8 candidati = 256 combinazioni, trascurabile).
function _trovaSubsetMatchOrdini(candidati, litriFatt, imponibileFatt) {
  const n = candidati.length;
  if (n < 2) return null;              // serve almeno 2 ordini da sommare
  if (n > 8) return null;              // limite pragmatico: oltre 8 ordini
                                       // identici nello stesso giorno è anomalo,
                                       // richiede revisione manuale.

  const tollLitri = Math.max(litriFatt * MATCH_TOLL_LITRI_PCT, 1);  // ±1% con minimo 1L
  const tollImp = MATCH_TOLL_IMPONIBILE_E;

  let bestIdx = null;
  let bestSize = Infinity;
  let bestDeltaLitri = Infinity;

  const total = 1 << n;
  for (let mask = 3; mask < total; mask++) {           // mask >= 3 = almeno 2 bit
    let size = 0, sumL = 0, sumI = 0;
    for (let b = 0; b < n; b++) {
      if (mask & (1 << b)) {
        size++;
        sumL += candidati[b].litri;
        sumI += candidati[b].imponibile;
      }
    }
    if (size < 2) continue;
    if (size > bestSize) continue;                     // pruning: già peggio

    const deltaLitri = Math.abs(sumL - litriFatt);
    if (deltaLitri > tollLitri) continue;
    if (Math.abs(sumI - imponibileFatt) > tollImp) continue;

    if (size < bestSize || (size === bestSize && deltaLitri < bestDeltaLitri)) {
      bestSize = size;
      bestDeltaLitri = deltaLitri;
      bestIdx = [];
      for (let b = 0; b < n; b++) if (mask & (1 << b)) bestIdx.push(b);
    }
  }

  if (!bestIdx) return null;
  return bestIdx.map(i => candidati[i]);
}

// Verifica se un ordine appartiene allo stesso cliente della fattura
// (PIVA match primario, nome match fallback).
function _ordineStessoCliente(ordine, pivaFattNorm, denomFattNorm) {
  if (ordine.cliente_id && _clientiMap.has(ordine.cliente_id)) {
    const c = _clientiMap.get(ordine.cliente_id);
    if (c.piva_norm && pivaFattNorm && c.piva_norm === pivaFattNorm) return true;
    if (!c.piva_norm && pivaFattNorm && c.nome_norm && denomFattNorm && c.nome_norm === denomFattNorm) return true;
  }
  const nomeOrdNorm = _normalizzaNome(ordine.cliente);
  if (nomeOrdNorm && denomFattNorm && nomeOrdNorm === denomFattNorm) return true;
  return false;
}

// Calcola il match migliore per UNA riga di fattura contro tutti gli ordini candidati
// Ritorna { ordine_id, ordini_ids, ordine_ref, score, dettaglio, match_tipo }
//   - ordine_id: "primo ordine" del match (usato come ordine_id "principale" della riga)
//   - ordini_ids: SEMPRE popolato con array di tutti gli ordini matchati (1 per 1:1, N per N:1)
//     usato solo in memoria per persistere poi ordini.fattura_riga_id su tutti gli N
function _calcolaMatchRiga(fattura, riga) {
  const pivaFattNorm = _normalizzaPiva(fattura.cessionario_piva);
  const denomFattNorm = _normalizzaNome(fattura.cessionario_denominazione);
  const dataFatt = fattura.data;
  const prodottoFatt = riga.prodotto_normalizzato;
  const litriFatt = Number(riga.quantita || 0);
  const imponibileFatt = Number(riga.prezzo_totale || 0);

  if (!prodottoFatt || litriFatt <= 0) {
    return { score: null, ordine_id: null, ordine_ref: null, motivo: 'riga_servizio' };
  }

  let bestScore = -1;
  let bestOrdine = null;
  let bestDettaglio = null;
  let bestPivaDaCompletare = null;

  for (const o of _ordiniPeriodo) {
    // Pre-filtro grossolano: prodotto normalizzato deve matchare, altrimenti skip
    const prodottoOrd = normalizzaProdotto(o.prodotto);
    if (prodottoFatt !== prodottoOrd) continue;

    // Pre-filtro data: se oltre ±2gg, skip
    const gg = _diffGiorni(dataFatt, o.data);
    if (gg > MATCH_TOLL_DATA_GG) continue;

    // ─── Scoring ───
    const dett = { piva: 0, data: 0, prodotto: 0, litri: 0, imponibile: 0 };

    // 1. PIVA (Entrambi con fallback)
    //    Primario: cliente_id ordine → clienti.piva ≟ PIVA fattura
    //    Fallback: nome ordine (snapshot) ≟ denominazione fattura normalizzati
    //    Ricaduta: se match per nome ma PhoenixFuel senza PIVA → flag per auto-update
    let pivaMatch = false;
    let pivaDaCompletare = null; // { cliente_id, nome, piva_nuova } se caso ricaduta
    if (o.cliente_id && _clientiMap.has(o.cliente_id)) {
      const c = _clientiMap.get(o.cliente_id);
      if (c.piva_norm && pivaFattNorm && c.piva_norm === pivaFattNorm) {
        pivaMatch = true;
      } else if (!c.piva_norm && pivaFattNorm && c.nome_norm && denomFattNorm && c.nome_norm === denomFattNorm) {
        // Match su nome + PhoenixFuel senza PIVA + fattura con PIVA → candidato auto-completamento
        pivaMatch = true;
        pivaDaCompletare = {
          cliente_id: o.cliente_id,
          nome: c.nome,
          piva_nuova: fattura.cessionario_piva,  // conserva formato originale (con IT se presente)
        };
      }
    }
    if (!pivaMatch) {
      // Fallback su nome (ordine senza cliente_id o cliente_id senza match)
      const nomeOrdNorm = _normalizzaNome(o.cliente);
      if (nomeOrdNorm && denomFattNorm && nomeOrdNorm === denomFattNorm) {
        pivaMatch = true;
      }
    }
    if (pivaMatch) dett.piva = 1;

    // 2. Data ±2gg (già pre-filtrato)
    dett.data = 1;

    // 3. Prodotto (già pre-filtrato)
    dett.prodotto = 1;

    // 4. Litri ±1%
    const litriOrd = Number(o.litri || 0);
    if (litriOrd > 0) {
      const deltaPct = Math.abs(litriFatt - litriOrd) / litriOrd;
      if (deltaPct <= MATCH_TOLL_LITRI_PCT) dett.litri = 1;
    }

    // 5. Imponibile ±€0,50
    const impOrd = _imponibileOrdine(o);
    if (Math.abs(imponibileFatt - impOrd) <= MATCH_TOLL_IMPONIBILE_E) dett.imponibile = 1;

    const score = dett.piva + dett.data + dett.prodotto + dett.litri + dett.imponibile;

    if (score > bestScore) {
      bestScore = score;
      bestOrdine = o;
      bestDettaglio = dett;
      bestPivaDaCompletare = pivaDaCompletare;
    }
  }

  if (!bestOrdine) {
    return { score: 0, ordine_id: null, ordini_ids: null, ordine_ref: null, dettaglio: { piva: 0, data: 0, prodotto: 0, litri: 0, imponibile: 0 }, piva_da_completare: null };
  }

  // ─── PASS 2: se il match 1:1 non è perfetto (score < 5), tenta N:1 ───
  // Caso tipico: 2-4 consegne stesso giorno/cliente/prodotto raggruppate
  // in 1 sola riga fattura Danea (Ennegi, Stiltracom).
  if (bestScore < 5) {
    const candidatiN = [];
    for (const o of _ordiniPeriodo) {
      if (normalizzaProdotto(o.prodotto) !== prodottoFatt) continue;
      if (_diffGiorni(dataFatt, o.data) > MATCH_TOLL_DATA_GG) continue;
      if (!_ordineStessoCliente(o, pivaFattNorm, denomFattNorm)) continue;
      const litriO = Number(o.litri || 0);
      if (litriO <= 0) continue;
      candidatiN.push({
        id: o.id,
        litri: litriO,
        imponibile: _imponibileOrdine(o),
        data: o.data,
        cliente: o.cliente,
        prodotto: o.prodotto,
      });
    }

    const subset = _trovaSubsetMatchOrdini(candidatiN, litriFatt, imponibileFatt);
    if (subset && subset.length >= 2) {
      subset.sort((a,b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : (a.id < b.id ? -1 : 1)));
      const sumL = subset.reduce((s,o)=>s + o.litri, 0);
      const sumI = subset.reduce((s,o)=>s + o.imponibile, 0);
      return {
        score: 5,
        ordine_id: subset[0].id,                      // "principale" su fatture_righe
        ordini_ids: subset.map(s => s.id),             // tutti gli N → saranno linkati tramite ordini.fattura_riga_id
        ordine_ref: {
          data: subset[0].data,
          cliente: subset[0].cliente,
          prodotto: subset[0].prodotto,
          litri: sumL,
          imponibile: sumI,
          n_ordini: subset.length,
        },
        dettaglio: { piva: 1, data: 1, prodotto: 1, litri: 1, imponibile: 1 },
        piva_da_completare: null,
        match_tipo: 'n_a_1',
      };
    }
  }

  // ─── Ritorno match 1:1 (pass 1) ───
  return {
    score: bestScore,
    ordine_id: bestOrdine.id,
    ordini_ids: [bestOrdine.id],                      // array di 1 per coerenza persistenza
    ordine_ref: {
      data: bestOrdine.data,
      cliente: bestOrdine.cliente,
      prodotto: bestOrdine.prodotto,
      litri: bestOrdine.litri,
      imponibile: _imponibileOrdine(bestOrdine),
    },
    dettaglio: bestDettaglio,
    piva_da_completare: bestPivaDaCompletare,
    match_tipo: '1_a_1',
  };
}

// Classifica score → stato
function _classificaMatch(score) {
  if (score === null) return 'servizio';
  if (score >= MATCH_SOGLIA_MATCHED) return 'matched';
  if (score >= MATCH_SOGLIA_UNCERTAIN) return 'uncertain';
  return 'orphan';
}

// Itera su tutte le fatture parsate, popola match per ogni riga e stato aggregato per fattura
function _calcolaMatchTutte() {
  let totMatched = 0, totUncertain = 0, totOrphan = 0, totServizio = 0;
  const pivaMap = new Map(); // cliente_id -> { cliente_id, nome, piva_nuova, occorrenze, fattura_esempio }

  for (const f of _parsedData.fatture) {
    let statoFattura = null; // 'matched' | 'uncertain' | 'orphan'

    for (const r of f.righe) {
      const m = _calcolaMatchRiga(f.fattura, r);
      r._match = m;
      r._match_status = _classificaMatch(m.score);

      // Raccogli PIVA da auto-completare (solo se match è valido e PIVA presente)
      if (m.piva_da_completare && m.piva_da_completare.piva_nuova) {
        const k = m.piva_da_completare.cliente_id;
        if (pivaMap.has(k)) {
          pivaMap.get(k).occorrenze++;
        } else {
          pivaMap.set(k, {
            cliente_id: m.piva_da_completare.cliente_id,
            nome: m.piva_da_completare.nome,
            piva_nuova: m.piva_da_completare.piva_nuova,
            occorrenze: 1,
            fattura_esempio: f.fattura.numero + ' del ' + f.fattura.data,
            denominazione_fattura: f.fattura.cessionario_denominazione,
          });
        }
      }

      if (r._match_status === 'matched') totMatched++;
      else if (r._match_status === 'uncertain') totUncertain++;
      else if (r._match_status === 'orphan') totOrphan++;
      else totServizio++;

      // Aggregazione stato fattura: peggiore tra le righe "non servizio"
      if (r._match_status !== 'servizio') {
        const order = { 'matched': 0, 'uncertain': 1, 'orphan': 2 };
        if (statoFattura === null || order[r._match_status] > order[statoFattura]) {
          statoFattura = r._match_status;
        }
      }
    }

    f._match_status_fattura = statoFattura || 'servizio';
  }

  _pivaDaAggiornare = Array.from(pivaMap.values()).sort((a, b) => b.occorrenze - a.occorrenze);

  _parsedData.match_stats = {
    righe_totali: totMatched + totUncertain + totOrphan + totServizio,
    matched: totMatched,
    uncertain: totUncertain,
    orphan: totOrphan,
    servizio: totServizio,
    piva_da_aggiornare: _pivaDaAggiornare.length,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// STEP 3 — RENDER ANTEPRIMA CON MATCH
// ═══════════════════════════════════════════════════════════════════════════

async function renderStep3() {
  _setStep(3);
  const body = document.getElementById('fi-body');
  const s = _parsedData.statistiche;

  // Loading state durante caricamento ordini + calcolo match
  body.innerHTML = `
    <div class="fi-panel">
      <h2>🔍 Step 3 — Matching con ordini PhoenixFuel</h2>
      <div class="fi-progress-bg"><div class="fi-progress-fg" id="fi-match-prog" style="width:10%"></div></div>
      <div class="fi-log" id="fi-match-log">
        <div class="info">[${_now()}] 🚀 Avvio matching automatico...</div>
      </div>
    </div>
  `;

  const log = document.getElementById('fi-match-log');
  const prog = document.getElementById('fi-match-prog');

  try {
    await _caricaDatiPeriodo(s.data_min, s.data_max, log);
    prog.style.width = '50%';

    _logAppend(log, 'info', `⏳ Calcolo match su ${s.fatture_parsate} fatture...`);
    const t0 = performance.now();
    _calcolaMatchTutte();
    const ms = Math.round(performance.now() - t0);
    prog.style.width = '100%';
    prog.style.background = 'linear-gradient(90deg,#639922,#97C459)';

    const ms2 = _parsedData.match_stats;
    _logAppend(log, 'ok', `✓ Match calcolato in ${ms}ms: ${ms2.matched} matched, ${ms2.uncertain} uncertain, ${ms2.orphan} orphan, ${ms2.servizio} servizio`);

    setTimeout(() => _renderStep3UI(), 400);

  } catch (e) {
    console.error('[fatture-import] errore match:', e);
    _logAppend(log, 'err', `✗ Errore: ${e.message}`);
    body.innerHTML += `
      <div class="fi-panel" style="border-left:4px solid #E24B4A">
        <h2 style="color:#791F1F">✗ Matching fallito</h2>
        <div style="font-size:12px;color:#666">Errore: <code>${esc(e.message)}</code></div>
        <button class="btn-primary" onclick="window.pfFattureImport.renderFattureImport()"
                style="margin-top:10px">← Torna allo step 1</button>
      </div>
    `;
  }
}

function _renderStep3UI() {
  const body = document.getElementById('fi-body');
  const s = _parsedData.statistiche;
  const ms = _parsedData.match_stats;

  const tot = ms.matched + ms.uncertain + ms.orphan;
  const pctMatched = tot > 0 ? Math.round(100 * ms.matched / tot) : 0;
  const pctUncertain = tot > 0 ? Math.round(100 * ms.uncertain / tot) : 0;
  const pctOrphan = tot > 0 ? 100 - pctMatched - pctUncertain : 0;

  // Aggrega stato per fattura
  let fMatched = 0, fUncertain = 0, fOrphan = 0, fServizio = 0;
  for (const f of _parsedData.fatture) {
    if (f._match_status_fattura === 'matched') fMatched++;
    else if (f._match_status_fattura === 'uncertain') fUncertain++;
    else if (f._match_status_fattura === 'orphan') fOrphan++;
    else fServizio++;
  }

  body.innerHTML = `
    <div class="fi-panel">
      <h2>🔍 Step 3 — Anteprima matching (${s.fatture_parsate} fatture)</h2>

      <!-- KPI globali parsing -->
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:12px;border-radius:8px;border-left:4px solid #0C447C">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Fatture</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace;margin-top:4px">${s.fatture_parsate}</div>
          <div style="font-size:10px;color:#888">${_fmtData(s.data_min)} → ${_fmtData(s.data_max)}</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:12px;border-radius:8px;border-left:4px solid #639922">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Totale</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace;margin-top:4px">€ ${_fmtN(s.importo_totale)}</div>
          <div style="font-size:10px;color:#888">sanity check</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:12px;border-radius:8px;border-left:4px solid #6B5FCC">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Clienti</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace;margin-top:4px">${s.clienti_unici_denominazione}</div>
          <div style="font-size:10px;color:#888">${s.clienti_unici_piva} con PIVA</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:12px;border-radius:8px;border-left:4px solid #85B7EB">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Ordini periodo</div>
          <div style="font-size:20px;font-weight:700;font-family:monospace;margin-top:4px">${_ordiniPeriodo.length}</div>
          <div style="font-size:10px;color:#888">candidati match</div>
        </div>
      </div>

      <!-- KPI match righe -->
      <h3 style="font-size:13px;margin-bottom:8px;color:#26215C">🎯 Risultato matching righe fattura</h3>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:14px">
        <div style="background:#F4FAEC;border:1px solid #97C459;padding:12px;border-radius:8px">
          <div style="font-size:10px;color:#27500A;text-transform:uppercase;font-weight:600">✓ Matched (5/5)</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;color:#27500A;margin-top:4px">${ms.matched}</div>
          <div style="font-size:10px;color:#27500A">${pctMatched}% • auto-import</div>
        </div>
        <div style="background:#FFF7E6;border:1px solid #D4A017;padding:12px;border-radius:8px">
          <div style="font-size:10px;color:#8B6A00;text-transform:uppercase;font-weight:600">⚠ Uncertain (3-4/5)</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;color:#8B6A00;margin-top:4px">${ms.uncertain}</div>
          <div style="font-size:10px;color:#8B6A00">${pctUncertain}% • revisione manuale</div>
        </div>
        <div style="background:#FDECEC;border:1px solid #E24B4A;padding:12px;border-radius:8px">
          <div style="font-size:10px;color:#791F1F;text-transform:uppercase;font-weight:600">✗ Orphan (0-2/5)</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;color:#791F1F;margin-top:4px">${ms.orphan}</div>
          <div style="font-size:10px;color:#791F1F">${pctOrphan}% • senza ordine</div>
        </div>
        <div style="background:#f0eee6;border:1px solid #ccc;padding:12px;border-radius:8px">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Servizio</div>
          <div style="font-size:22px;font-weight:700;font-family:monospace;color:#666;margin-top:4px">${ms.servizio}</div>
          <div style="font-size:10px;color:#666">trasporti, sconti</div>
        </div>
      </div>

      <!-- Barra distribuzione -->
      ${tot > 0 ? `
        <div style="margin-bottom:14px">
          <div style="font-size:11px;color:#666;margin-bottom:4px">Distribuzione righe prodotto (${tot} righe matchabili)</div>
          <div style="display:flex;height:22px;border-radius:4px;overflow:hidden;background:#f0eee6">
            ${pctMatched > 0 ? `<div style="width:${pctMatched}%;background:#639922;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${pctMatched}%</div>` : ''}
            ${pctUncertain > 0 ? `<div style="width:${pctUncertain}%;background:#D4A017;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${pctUncertain}%</div>` : ''}
            ${pctOrphan > 0 ? `<div style="width:${pctOrphan}%;background:#A32D2D;color:#fff;font-size:10px;font-weight:700;display:flex;align-items:center;justify-content:center">${pctOrphan}%</div>` : ''}
          </div>
        </div>
      ` : ''}

      <!-- Pannello batch aggiornamento PIVA -->
      ${_pivaDaAggiornare.length > 0 ? `
        <div id="fi-piva-panel" style="background:#EEEDFE;border-left:4px solid #6B5FCC;padding:14px 16px;border-radius:6px;margin-bottom:14px">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">
            <div>
              <div style="font-size:13px;font-weight:700;color:#26215C">🆔 PIVA mancanti in anagrafica (${_pivaDaAggiornare.length})</div>
              <div style="font-size:11px;color:#555;margin-top:2px">Questi clienti PhoenixFuel non hanno la PIVA ma sono stati trovati per nome nelle fatture Danea. Conferma l'aggiornamento anagrafica.</div>
            </div>
            <div style="display:flex;gap:6px">
              <button class="btn-primary" style="font-size:11px;padding:6px 12px" onclick="window.pfFattureImport._togglePivaAll(true)">Seleziona tutti</button>
              <button class="btn-primary" style="font-size:11px;padding:6px 12px;background:var(--bg);color:var(--text);border:0.5px solid var(--border)" onclick="window.pfFattureImport._togglePivaAll(false)">Deseleziona tutti</button>
            </div>
          </div>
          <div style="max-height:260px;overflow-y:auto;background:#fff;border-radius:6px;border:1px solid #d9d5f5">
            <table style="width:100%;border-collapse:collapse;font-size:11px">
              <thead style="position:sticky;top:0;background:#6B5FCC;color:#fff;z-index:1">
                <tr>
                  <th style="padding:6px;text-align:center;width:30px"><input type="checkbox" id="fi-piva-all" onchange="window.pfFattureImport._togglePivaAll(this.checked)" checked /></th>
                  <th style="padding:6px;text-align:left">Cliente PhoenixFuel</th>
                  <th style="padding:6px;text-align:left">Nome in fattura Danea</th>
                  <th style="padding:6px;text-align:left">PIVA da aggiungere</th>
                  <th style="padding:6px;text-align:center">Occorrenze</th>
                  <th style="padding:6px;text-align:left">Esempio</th>
                </tr>
              </thead>
              <tbody>
                ${_pivaDaAggiornare.map((p, i) => `
                  <tr style="border-bottom:1px solid #e8e5dc" data-piva-idx="${i}">
                    <td style="padding:6px;text-align:center">
                      <input type="checkbox" class="fi-piva-chk" data-idx="${i}" checked />
                    </td>
                    <td style="padding:6px">${esc(p.nome)}</td>
                    <td style="padding:6px;color:#666">${esc((p.denominazione_fattura || '').substring(0, 35))}</td>
                    <td style="padding:6px;font-family:monospace;font-weight:700">${esc(p.piva_nuova)}</td>
                    <td style="padding:6px;text-align:center">${p.occorrenze}</td>
                    <td style="padding:6px;color:#666;font-size:10px">Fatt. ${esc(p.fattura_esempio)}</td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          </div>
          <div style="display:flex;justify-content:space-between;align-items:center;margin-top:10px">
            <div style="font-size:11px;color:#555" id="fi-piva-counter">${_pivaDaAggiornare.length} selezionati</div>
            <button class="btn-primary" style="background:#6B5FCC;font-size:12px" onclick="window.pfFattureImport._applicaPivaBatch()">
              💾 Applica aggiornamenti PIVA selezionati
            </button>
          </div>
        </div>
      ` : ''}

      <!-- Filtri tabella -->
      <div style="display:flex;gap:8px;margin-bottom:10px;flex-wrap:wrap">
        <button class="btn-primary fi-filter-btn" data-filter="all"
                style="background:#26215C;font-size:11px;padding:6px 12px">
          Tutte (${_parsedData.fatture.length})
        </button>
        <button class="btn-primary fi-filter-btn" data-filter="matched"
                style="background:#639922;font-size:11px;padding:6px 12px">
          ✓ Matched (${fMatched})
        </button>
        <button class="btn-primary fi-filter-btn" data-filter="uncertain"
                style="background:#D4A017;font-size:11px;padding:6px 12px">
          ⚠ Uncertain (${fUncertain})
        </button>
        <button class="btn-primary fi-filter-btn" data-filter="orphan"
                style="background:#A32D2D;font-size:11px;padding:6px 12px">
          ✗ Orphan (${fOrphan})
        </button>
        ${fServizio > 0 ? `
          <button class="btn-primary fi-filter-btn" data-filter="servizio"
                  style="background:#888;font-size:11px;padding:6px 12px">
            Solo servizio (${fServizio})
          </button>
        ` : ''}
        <input type="text" id="fi-search" placeholder="🔍 Cerca cliente/numero/PIVA..."
               style="flex:1;min-width:220px;padding:6px 10px;border:1px solid #ccc;border-radius:6px;font-size:11px"/>
      </div>

      <!-- Tabella fatture -->
      <div style="overflow-x:auto;max-height:520px;overflow-y:auto;border:1px solid #e8e5dc;border-radius:6px">
        <table style="width:100%;border-collapse:collapse;font-size:11px">
          <thead style="position:sticky;top:0;background:#26215C;color:#fff;z-index:2">
            <tr>
              <th style="padding:8px;text-align:left">Stato</th>
              <th style="padding:8px;text-align:left">Nr</th>
              <th style="padding:8px;text-align:left">Data</th>
              <th style="padding:8px;text-align:left">Cliente</th>
              <th style="padding:8px;text-align:left">PIVA</th>
              <th style="padding:8px;text-align:right">Imponibile</th>
              <th style="padding:8px;text-align:center">Righe</th>
              <th style="padding:8px;text-align:center">Match</th>
              <th style="padding:8px;text-align:center">DAS</th>
              <th style="padding:8px;text-align:center">Dett.</th>
            </tr>
          </thead>
          <tbody id="fi-tbody">
            ${_renderRigheFatture(_parsedData.fatture)}
          </tbody>
        </table>
      </div>
    </div>

    <div class="fi-panel" style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
      <div style="font-size:12px;color:#666">
        ${ms.uncertain + ms.orphan > 0 ? `
          ⚠ <strong style="color:#A32D2D">${ms.uncertain + ms.orphan} righe non matched</strong>:
          risolvile con i bottoni "Accetta correzione" o "Crea ordine da fattura" prima di procedere.
          Fatture con righe matched+servizio verranno importate comunque.
        ` : `
          ✓ Tutte le fatture sono matched. Pronte per l'import nel DB.
        `}
      </div>
      <div style="display:flex;gap:8px">
        <button class="btn-primary" onclick="window.pfFattureImport.renderFattureImport()"
                style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);font-size:12px">
          ← Nuovo import
        </button>
        <button class="btn-primary" id="fi-procedi-import" style="background:#639922;font-size:12px"
                onclick="window.pfFattureImport._procediImport()">
          💾 Procedi all'import (${fMatched} fatture)
        </button>
      </div>
    </div>
  `;

  _bindFiltriStep3();
}

// Render righe tabella fatture
function _renderRigheFatture(fatture) {
  if (!fatture || !fatture.length) {
    return `<tr><td colspan="10" style="padding:20px;text-align:center;color:#666">Nessuna fattura corrispondente ai filtri</td></tr>`;
  }

  return fatture.map((f, idx) => {
    const ft = f.fattura;
    const st = f._match_status_fattura;

    const rowClass = st === 'matched' ? 'fi-row-matched' :
                     st === 'uncertain' ? 'fi-row-uncertain' :
                     st === 'orphan' ? 'fi-row-orphan' : '';

    const badgeClass = st === 'matched' ? 'fi-badge-matched' :
                       st === 'uncertain' ? 'fi-badge-uncertain' :
                       st === 'orphan' ? 'fi-badge-orphan' : '';

    const badgeLabel = st === 'matched' ? '✓ Match' :
                       st === 'uncertain' ? '⚠ Incerto' :
                       st === 'orphan' ? '✗ Orfano' : '— Servizio';

    const righeProdotto = f.righe.filter(r => r.prodotto_normalizzato && r.quantita > 0);
    const righeMatchate = righeProdotto.filter(r => r._match_status === 'matched').length;
    const righeDas = f.righe.filter(r => r.das_numero_dogane).length;

    return `
      <tr class="${rowClass}" data-stato="${st}" data-idx="${idx}"
          data-cli="${esc((ft.cessionario_denominazione || '').toLowerCase())}"
          data-num="${esc((ft.numero || '').toLowerCase())}"
          data-piva="${esc((ft.cessionario_piva || '').toLowerCase())}"
          style="border-bottom:1px solid #e8e5dc">
        <td style="padding:7px"><span class="fi-badge-match ${badgeClass}">${badgeLabel}</span></td>
        <td style="padding:7px;font-family:monospace;font-weight:700">${esc(ft.numero)}</td>
        <td style="padding:7px">${_fmtData(ft.data)}</td>
        <td style="padding:7px">${esc((ft.cessionario_denominazione || '').substring(0, 38))}</td>
        <td style="padding:7px;font-family:monospace;font-size:10px">${esc(ft.cessionario_piva || '—')}</td>
        <td style="padding:7px;text-align:right;font-family:monospace">€ ${_fmtN(ft.imponibile_totale || 0)}</td>
        <td style="padding:7px;text-align:center">${righeProdotto.length}</td>
        <td style="padding:7px;text-align:center;font-family:monospace">${righeMatchate}/${righeProdotto.length}</td>
        <td style="padding:7px;text-align:center">${righeDas > 0 ? '✓ ' + righeDas : '—'}</td>
        <td style="padding:7px;text-align:center">
          <button class="btn-edit" style="padding:3px 8px;font-size:10px"
                  onclick="window.pfFattureImport._apriDettaglio(${idx})">Apri</button>
        </td>
      </tr>
    `;
  }).join('');
}

// Filtri tabella step 3
function _bindFiltriStep3() {
  let currentFilter = 'all';
  const tbody = document.getElementById('fi-tbody');
  const search = document.getElementById('fi-search');

  const applyFilter = () => {
    const q = (search.value || '').toLowerCase().trim();
    const rows = tbody.querySelectorAll('tr[data-stato]');
    let visible = 0;
    rows.forEach(r => {
      const st = r.getAttribute('data-stato');
      const cli = r.getAttribute('data-cli') || '';
      const num = r.getAttribute('data-num') || '';
      const piva = r.getAttribute('data-piva') || '';

      const matchFilter = (currentFilter === 'all') || (st === currentFilter);
      const matchSearch = !q || cli.includes(q) || num.includes(q) || piva.includes(q);

      const show = matchFilter && matchSearch;
      r.style.display = show ? '' : 'none';
      if (show) visible++;
    });
  };

  document.querySelectorAll('.fi-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentFilter = btn.getAttribute('data-filter');
      document.querySelectorAll('.fi-filter-btn').forEach(b => b.style.outline = 'none');
      btn.style.outline = '3px solid #26215C';
      applyFilter();
    });
  });

  if (search) search.addEventListener('input', applyFilter);

  // Bind listener sulle checkbox PIVA (se pannello visibile)
  _bindCheckboxPiva();
}

// Modale dettaglio match per singola fattura
function _apriDettaglio(idx) {
  const f = _parsedData.fatture[idx];
  if (!f) return;
  const ft = f.fattura;

  const righeHtml = f.righe.map(r => {
    const m = r._match || {};
    const st = r._match_status || 'servizio';
    const d = m.dettaglio || {};
    const ref = m.ordine_ref;

    const badgeClass = st === 'matched' ? 'fi-badge-matched' :
                       st === 'uncertain' ? 'fi-badge-uncertain' :
                       st === 'orphan' ? 'fi-badge-orphan' : '';
    const badgeLabel = st === 'matched' ? '✓' :
                       st === 'uncertain' ? '⚠' :
                       st === 'orphan' ? '✗' : '—';

    let scoringHtml = '';
    if (st !== 'servizio') {
      const tick = v => v ? '<span style="color:#639922">✓</span>' : '<span style="color:#A32D2D">✗</span>';
      scoringHtml = `
        <div style="display:flex;gap:10px;font-size:10px;color:#666;margin-top:4px">
          <span>${tick(d.piva)} PIVA</span>
          <span>${tick(d.data)} Data</span>
          <span>${tick(d.prodotto)} Prodotto</span>
          <span>${tick(d.litri)} Litri</span>
          <span>${tick(d.imponibile)} Imponibile</span>
          <span style="margin-left:auto;font-weight:700">Score: ${m.score ?? '—'}/5</span>
        </div>
      `;
    }

    const refHtml = ref ? `
      <div style="background:#fafaf8;padding:6px 10px;border-radius:4px;margin-top:4px;font-size:10px;color:#555">
        <strong>Ordine candidato:</strong>
        ${_fmtData(ref.data)} · ${esc(ref.cliente)} · ${esc(ref.prodotto)} ·
        ${_fmtN(ref.litri)} L · € ${_fmtN(ref.imponibile)}
      </div>
    ` : (st !== 'servizio' ? `<div style="font-size:10px;color:#A32D2D;margin-top:4px">Nessun ordine candidato trovato nel periodo.</div>` : '');

    // Bottone correzione: solo se uncertain + solo criterio rosso = Imponibile + c'è ordine candidato
    // (criterio principale per correzione rapida: margine dell'ordine si aggiusta per pareggiare l'imponibile fattura)
    let correzioneHtml = '';
    if (st === 'uncertain' && ref && m.ordine_id) {
      const solTutto = d.piva && d.data && d.prodotto && d.litri && !d.imponibile;
      if (solTutto) {
        const diffImp = Number(r.prezzo_totale || 0) - Number(ref.imponibile || 0);
        const segnoDiff = diffImp >= 0 ? '+' : '';
        correzioneHtml = `
          <div style="background:#FFF7E6;border-left:3px solid #D4A017;padding:6px 10px;border-radius:4px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
            <div style="font-size:10px;color:#8B6A00;flex:1">
              <strong>Differenza imponibile:</strong> ${segnoDiff}€ ${_fmtN(diffImp)} (fattura − ordine)
              <br><span style="color:#666">Correggendo: aggiorno il margine dell'ordine di ${segnoDiff}€ ${_fmtN(diffImp / Number(ref.litri || 1))}/L</span>
            </div>
            <button class="btn-primary" style="background:#D4A017;font-size:10px;padding:4px 10px"
                    onclick="window.pfFattureImport._accettaCorrezione('${m.ordine_id}', ${Number(r.prezzo_totale || 0)}, ${Number(ref.imponibile || 0)}, ${Number(ref.litri || 0)}, ${idx})">
              ✓ Accetta correzione da fattura
            </button>
          </div>
        `;
      }
    }

    // Bottone CREA ordine: solo se orphan + prodotto riconosciuto + litri > 0
    // (caso tipico: fattura per vendita non ancora registrata in PhoenixFuel)
    let creaOrdineHtml = '';
    if (st === 'orphan' && r.prodotto_normalizzato && r.quantita > 0) {
      // Encode dei dati fattura per passarli alla funzione (JSON poi base64 per evitare problemi quoting)
      const payload = JSON.stringify({
        fattura_idx: idx,
        riga_numero: r.numero_linea,
        fattura_nr: ft.numero,
        fattura_data: ft.data,
        cessionario_piva: ft.cessionario_piva || '',
        cessionario_denominazione: ft.cessionario_denominazione || '',
        prodotto: r.prodotto_normalizzato,
        litri: r.quantita,
        imponibile: r.prezzo_totale,
        aliquota_iva: r.aliquota_iva || 22,
        das_numero_dogane: r.das_numero_dogane || null,
      });
      const payload64 = btoa(unescape(encodeURIComponent(payload)));
      creaOrdineHtml = `
        <div style="background:#FDECEC;border-left:3px solid #A32D2D;padding:6px 10px;border-radius:4px;margin-top:4px;display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">
          <div style="font-size:10px;color:#791F1F;flex:1">
            <strong>Fattura senza ordine in PhoenixFuel.</strong>
            <br><span style="color:#666">Puoi creare un ordine corrispondente con dati dalla fattura (dovrai inserire il costo).</span>
          </div>
          <button class="btn-primary" style="background:#A32D2D;font-size:10px;padding:4px 10px"
                  onclick="window.pfFattureImport._apriCreaOrdineDaOrphan('${payload64}')">
            ➕ Crea ordine da fattura
          </button>
        </div>
      `;
    }

    return `
      <div style="padding:10px;border-bottom:1px solid #e8e5dc">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
          <div style="flex:1">
            <span class="fi-badge-match ${badgeClass}">${badgeLabel}</span>
            <strong style="margin-left:6px">${esc(r.prodotto_normalizzato || 'Servizio')}</strong>
            ${r.quantita ? ` · ${_fmtN(r.quantita)} L` : ''}
            <span style="color:#888;font-size:10px"> · € ${_fmtN(r.prezzo_totale || 0)}</span>
          </div>
        </div>
        <div style="font-size:10px;color:#888;margin-top:2px">${esc((r.descrizione || '').substring(0, 160))}${r.descrizione && r.descrizione.length > 160 ? '…' : ''}</div>
        ${scoringHtml}
        ${refHtml}
        ${correzioneHtml}
        ${creaOrdineHtml}
      </div>
    `;
  }).join('');

  const html = `
    <div style="max-width:900px">
      <h2 style="margin:0 0 4px 0;color:#26215C">Fattura ${esc(ft.numero)} · ${_fmtData(ft.data)}</h2>
      <div style="color:#666;font-size:12px;margin-bottom:10px">
        ${esc(ft.cessionario_denominazione)} ·
        PIVA: <code>${esc(ft.cessionario_piva || '—')}</code> ·
        ${esc(ft.cessionario_comune || '')} ${esc(ft.cessionario_provincia ? '(' + ft.cessionario_provincia + ')' : '')}
      </div>
      <div style="display:flex;gap:10px;font-size:11px;margin-bottom:14px;padding:8px 12px;background:#fafaf8;border-radius:6px">
        <div><strong>Imponibile:</strong> € ${_fmtN(ft.imponibile_totale || 0)}</div>
        <div><strong>IVA:</strong> € ${_fmtN(ft.iva_totale || 0)}</div>
        <div><strong>Totale:</strong> € ${_fmtN(ft.importo_totale || 0)}</div>
        <div style="margin-left:auto"><strong>Pagamenti:</strong> ${f.pagamenti.length}</div>
      </div>
      <h3 style="font-size:13px;color:#26215C;margin:0 0 4px 0">Righe (${f.righe.length})</h3>
      <div style="max-height:400px;overflow-y:auto;border:1px solid #e8e5dc;border-radius:6px">
        ${righeHtml}
      </div>
      <div style="margin-top:14px;text-align:right">
        <button class="btn-primary" onclick="chiudiModal()" style="font-size:12px">Chiudi</button>
      </div>
    </div>
  `;

  apriModal(html);
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════

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

// Formatta numero in formato italiano con 2 decimali (es. 1.542.711,89)
function _fmtN(n) {
  if (n === null || n === undefined || isNaN(n)) return '0,00';
  return Number(n).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ═══════════════════════════════════════════════════════════════════════════
// AUTO-COMPLETAMENTO PIVA BATCH
// ═══════════════════════════════════════════════════════════════════════════

function _togglePivaAll(checked) {
  document.querySelectorAll('.fi-piva-chk').forEach(chk => {
    chk.checked = checked;
  });
  const allChk = document.getElementById('fi-piva-all');
  if (allChk) allChk.checked = checked;
  _aggiornaContatorePiva();
}

function _aggiornaContatorePiva() {
  const sel = document.querySelectorAll('.fi-piva-chk:checked').length;
  const counter = document.getElementById('fi-piva-counter');
  if (counter) counter.textContent = sel + ' selezionati';
}

async function _applicaPivaBatch() {
  const checks = Array.from(document.querySelectorAll('.fi-piva-chk:checked'));
  if (!checks.length) {
    toast('⚠️ Nessun cliente selezionato');
    return;
  }

  const indices = checks.map(c => parseInt(c.dataset.idx));
  const daAggiornare = indices.map(i => _pivaDaAggiornare[i]).filter(Boolean);

  if (!confirm('Aggiornare ' + daAggiornare.length + ' clienti con la PIVA trovata in fattura?\n\nOperazione tracciata in audit log.')) return;

  const panel = document.getElementById('fi-piva-panel');
  if (panel) {
    panel.style.opacity = '0.6';
    panel.style.pointerEvents = 'none';
  }

  let ok = 0, ko = 0;
  const errori = [];

  for (const p of daAggiornare) {
    try {
      const { error } = await sb.from('clienti').update({
        piva: p.piva_nuova,
      }).eq('id', p.cliente_id).or('piva.is.null,piva.eq.');  // guardia: solo se piva era null O stringa vuota

      if (error) {
        ko++;
        errori.push(p.nome + ': ' + error.message);
      } else {
        ok++;
        // Aggiorna la mappa locale così il match seguente beneficia
        if (_clientiMap.has(p.cliente_id)) {
          const c = _clientiMap.get(p.cliente_id);
          c.piva = p.piva_nuova;
          c.piva_norm = _normalizzaPiva(p.piva_nuova);
        }
        // Audit log
        if (typeof _auditLog === 'function') {
          _auditLog('autocompleta_piva_cliente', 'clienti',
            p.nome + ' → PIVA ' + p.piva_nuova + ' (da import Danea, batch ' + (_batchId || '?') + ')');
        }
      }
    } catch (e) {
      ko++;
      errori.push(p.nome + ': ' + e.message);
    }
  }

  if (panel) {
    panel.style.opacity = '1';
    panel.style.pointerEvents = '';
  }

  if (ko === 0) {
    toast('✓ ' + ok + ' PIVA aggiornate in anagrafica');
    // Ricalcola il match con PIVA ora in anagrafica → alcuni uncertain diventano matched
    _calcolaMatchTutte();
    _renderStep3UI();
  } else {
    alert('✓ ' + ok + ' aggiornate\n✗ ' + ko + ' errori:\n\n' + errori.slice(0, 5).join('\n') + (errori.length > 5 ? '\n...' : ''));
    _calcolaMatchTutte();
    _renderStep3UI();
  }
}

// Bind listener checkbox dopo render (chiamato da _renderStep3UI tramite _bindFiltriStep3)
function _bindCheckboxPiva() {
  document.querySelectorAll('.fi-piva-chk').forEach(chk => {
    chk.addEventListener('change', _aggiornaContatorePiva);
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// ACCETTA CORREZIONE DA FATTURA
// Aggiorna SOLO ordini.margine per far pareggiare l'imponibile ordine con
// quello fattura. costo_litro e trasporto_litro restano invariati (snapshot).
// Protezione: confirm se differenza > €50 (arrotondamenti normali < €5, qui
// chiediamo al boss di convalidare qualsiasi scostamento significativo).
// ═══════════════════════════════════════════════════════════════════════════
async function _accettaCorrezione(ordineId, impFattura, impOrdine, litri, idxFattura) {
  if (!ordineId) { toast('Ordine non identificato'); return; }
  const diffTot = Number(impFattura) - Number(impOrdine);
  const diffPerLitro = litri > 0 ? diffTot / litri : 0;

  if (Math.abs(diffTot) > CORREZIONE_CONFIRM_E) {
    const msg = 'Differenza elevata: €' + _fmtN(diffTot) + '\n\n' +
                'Ordine attuale: €' + _fmtN(impOrdine) + '\n' +
                'Fattura: €' + _fmtN(impFattura) + '\n\n' +
                'Confermi l\'aggiornamento del margine dell\'ordine di €' + _fmtN(diffPerLitro) + '/L ?';
    if (!confirm(msg)) return;
  }

  try {
    // Leggi ordine fresco per lock su margine corrente
    const { data: ord, error: errR } = await sb.from('ordini')
      .select('id, data, cliente, prodotto, litri, costo_litro, trasporto_litro, margine, iva')
      .eq('id', ordineId).single();
    if (errR || !ord) {
      toast('Errore lettura ordine: ' + (errR?.message || 'non trovato'));
      return;
    }

    // Nuovo margine = margine attuale + diffPerLitro (compensa la differenza)
    const margineAtt = Number(ord.margine || 0);
    const margineNuovo = Math.round((margineAtt + diffPerLitro) * 1000000) / 1000000;

    const { error: errU } = await sb.from('ordini')
      .update({ margine: margineNuovo })
      .eq('id', ordineId);
    if (errU) { toast('Errore update: ' + errU.message); return; }

    // Audit log
    if (typeof _auditLog === 'function') {
      _auditLog('correzione_ordine_da_fattura', 'ordini',
        ord.cliente + ' ' + ord.data + ' ' + ord.prodotto +
        ' | margine ' + margineAtt.toFixed(6) + ' → ' + margineNuovo.toFixed(6) +
        ' | diff €' + diffTot.toFixed(2) + ' (' + diffPerLitro.toFixed(6) + '/L)' +
        ' | fonte import Danea batch ' + (_batchId || '?') +
        ' | ordine_id:' + ordineId);
    }

    // Aggiorna la copia in memoria così il re-calcolo sia coerente
    const ordMem = _ordiniPeriodo.find(o => o.id === ordineId);
    if (ordMem) ordMem.margine = margineNuovo;

    toast('✓ Correzione applicata');
    chiudiModal();

    // Ricalcola match sulla fattura specifica (e globale) per aggiornare UI
    _calcolaMatchTutte();
    _renderStep3UI();

  } catch (e) {
    console.error('[_accettaCorrezione]', e);
    toast('Errore: ' + e.message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CREA ORDINE DA FATTURA ORPHAN
// Quando una fattura Danea non trova un ordine corrispondente in PhoenixFuel,
// l'utente può creare manualmente l'ordine dai dati fattura.
// L'ordine viene creato in stato 'consegnato' con caricato_deposito=true.
// L'utente deve inserire manualmente il costo_litro (costo reale nostro).
// ═══════════════════════════════════════════════════════════════════════════
async function _apriCreaOrdineDaOrphan(payload64) {
  let d;
  try {
    d = JSON.parse(decodeURIComponent(escape(atob(payload64))));
  } catch (e) {
    toast('Errore decodifica dati: ' + e.message);
    return;
  }

  // Cerca il cliente in anagrafica (primario: PIVA; fallback: nome esatto)
  let cliente = null;
  if (d.cessionario_piva) {
    const pivaNorm = _normalizzaPiva(d.cessionario_piva);
    for (const c of _clientiMap.values()) {
      if (c.piva_norm && c.piva_norm === pivaNorm) { cliente = c; break; }
    }
  }
  if (!cliente && d.cessionario_denominazione) {
    const denomNorm = _normalizzaNome(d.cessionario_denominazione);
    for (const c of _clientiMap.values()) {
      if (c.nome_norm === denomNorm) { cliente = c; break; }
    }
  }
  // Se non trovato, prepara un warning ma consenti creazione senza cliente_id
  const clienteTrovato = !!cliente;
  const clienteId = cliente ? [...(_clientiMap.entries())].find(([k, v]) => v === cliente)?.[0] : null;
  const clienteNome = cliente ? cliente.nome : d.cessionario_denominazione;

  // Importo netto per litro (prezzo di vendita)
  const impNettoL = d.litri > 0 ? (d.imponibile / d.litri) : 0;

  const html = `
    <div style="max-width:720px">
      <h2 style="margin:0 0 10px 0;color:#A32D2D">➕ Crea ordine da fattura orfana</h2>

      ${!clienteTrovato ? `
        <div style="background:#FDECEC;border-left:3px solid #A32D2D;padding:10px 12px;border-radius:4px;margin-bottom:12px;font-size:12px;color:#791F1F">
          ⚠ <strong>Cliente non trovato in anagrafica PhoenixFuel</strong>: l'ordine verrà creato con il nome dalla fattura ma senza link. Crea prima il cliente se vuoi tracciabilità completa (o annulla qui e crealo manualmente).
        </div>
      ` : ''}

      <div style="background:#fafaf8;padding:10px 12px;border-radius:6px;margin-bottom:12px;font-size:12px;line-height:1.8">
        <div style="display:grid;grid-template-columns:140px 1fr;gap:4px 12px">
          <strong>Fattura:</strong><span>nr ${esc(d.fattura_nr)} del ${_fmtData(d.fattura_data)}</span>
          <strong>Cliente:</strong><span>${esc(clienteNome)} ${clienteTrovato ? '<span style="color:#639922;font-size:10px">✓ in anagrafica</span>' : '<span style="color:#A32D2D;font-size:10px">✗ non in anagrafica</span>'}</span>
          <strong>PIVA:</strong><span style="font-family:monospace">${esc(d.cessionario_piva || '—')}</span>
          <strong>Prodotto:</strong><span>${esc(d.prodotto)}</span>
          <strong>Litri:</strong><span style="font-family:monospace">${_fmtN(d.litri)} L</span>
          <strong>Imponibile fatt.:</strong><span style="font-family:monospace">€ ${_fmtN(d.imponibile)} <span style="color:#666;font-size:10px">(= € ${_fmtN(impNettoL)}/L netto)</span></span>
          <strong>IVA:</strong><span>${d.aliquota_iva}%</span>
          ${d.das_numero_dogane ? `<strong>DAS Dogane:</strong><span style="font-family:monospace">${esc(d.das_numero_dogane)}</span>` : ''}
        </div>
      </div>

      <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:10px">
        <div class="form-group">
          <label>Data ordine <span style="color:#A32D2D">*</span></label>
          <input type="date" id="fi-orphan-data" value="${esc(d.fattura_data)}"
                 style="width:100%;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;font-size:12px" />
        </div>
        <div class="form-group">
          <label>Costo €/L <span style="color:#A32D2D">*</span> <span style="color:#666;font-size:10px">(costo di acquisto tuo)</span></label>
          <input type="number" id="fi-orphan-costo" step="0.0001" placeholder="es. 0.4500" autofocus
                 oninput="window.pfFattureImport._aggiornaPreviewOrphan()"
                 style="width:100%;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace" />
        </div>
        <div class="form-group">
          <label>Trasporto €/L <span style="color:#666;font-size:10px">(opzionale)</span></label>
          <input type="number" id="fi-orphan-trasporto" step="0.0001" value="0"
                 oninput="window.pfFattureImport._aggiornaPreviewOrphan()"
                 style="width:100%;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;font-size:12px;font-family:monospace" />
        </div>
        <div class="form-group">
          <label>Fornitore</label>
          <input type="text" id="fi-orphan-fornitore" value="PhoenixFuel" readonly
                 style="width:100%;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;font-size:12px;background:#fafaf8" />
        </div>
      </div>

      <!-- Preview calcolo -->
      <div id="fi-orphan-preview" style="background:#EEEDFE;border-left:3px solid #6B5FCC;padding:10px 12px;border-radius:4px;margin-bottom:12px;font-size:12px">
        <span style="color:#666">Inserisci il costo per vedere il margine risultante...</span>
      </div>

      <!-- Dati tecnici read-only -->
      <div style="font-size:10px;color:#666;background:#fafaf8;padding:6px 10px;border-radius:4px;margin-bottom:12px">
        🛈 L'ordine verrà creato come: tipo_ordine=cliente · stato=consegnato · caricato_deposito=true.<br>
        Nota: "Creato da import Danea fatt. ${esc(d.fattura_nr)} del ${_fmtData(d.fattura_data)}"
      </div>

      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-primary" onclick="chiudiModal()"
                style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);font-size:12px">
          Annulla
        </button>
        <button class="btn-primary" id="fi-orphan-conferma" style="background:#639922;font-size:12px" disabled
                onclick="window.pfFattureImport._confermaCreaOrdineDaOrphan('${payload64}', '${clienteId || ''}', ${clienteTrovato})">
          ➕ Crea ordine
        </button>
      </div>
    </div>
  `;
  apriModal(html);
}

function _aggiornaPreviewOrphan() {
  const costo = parseFloat(document.getElementById('fi-orphan-costo')?.value) || 0;
  const trasporto = parseFloat(document.getElementById('fi-orphan-trasporto')?.value) || 0;
  const prev = document.getElementById('fi-orphan-preview');
  const btnConferma = document.getElementById('fi-orphan-conferma');
  if (!prev) return;

  // Ricalcola dai dati già presenti nel DOM (letti dalla modale)
  // Approccio: prendiamo litri+imponibile dalle label della modale (semplice: passiamo via dataset o rifacciamo i calcoli)
  // Più semplice: rileggiamo i dati dal payload nella funzione conferma. Qui facciamo solo enable/disable + preview numerica.

  if (costo <= 0) {
    prev.innerHTML = '<span style="color:#666">Inserisci il costo per vedere il margine risultante...</span>';
    if (btnConferma) btnConferma.disabled = true;
    return;
  }
  // Trova litri e imponibile dai dati nel DOM (li mostra la modale)
  // Più robusto: lo facciamo ricavare al submit. Per ora preview generico:
  const dati = _estraiDatiOrphanDalDOM();
  if (!dati) {
    prev.innerHTML = 'Costo inserito: € ' + _fmtN(costo) + '/L';
    if (btnConferma) btnConferma.disabled = false;
    return;
  }
  const impNettoL = dati.litri > 0 ? (dati.imponibile / dati.litri) : 0;
  const margine = impNettoL - costo - trasporto;
  const imponibileRicalc = (costo + trasporto + margine) * dati.litri;

  const margineTotale = margine * dati.litri;
  const colore = margine >= 0 ? '#27500A' : '#A32D2D';
  prev.innerHTML = `
    <div style="display:grid;grid-template-columns:auto auto auto auto;gap:4px 16px;font-family:monospace;font-size:12px">
      <strong>Costo totale:</strong><span>€ ${_fmtN(costo * dati.litri)}</span>
      <strong>Margine €/L:</strong><span style="color:${colore};font-weight:700">€ ${_fmtN(margine)}</span>
      <strong>Trasporto totale:</strong><span>€ ${_fmtN(trasporto * dati.litri)}</span>
      <strong>Margine totale:</strong><span style="color:${colore};font-weight:700">€ ${_fmtN(margineTotale)}</span>
      <strong>Imponibile calc.:</strong><span>€ ${_fmtN(imponibileRicalc)}</span>
      <strong>Imponibile fatt.:</strong><span>€ ${_fmtN(dati.imponibile)}</span>
    </div>
    ${margine < 0 ? '<div style="margin-top:6px;color:#A32D2D;font-size:11px">⚠ Margine negativo: stai vendendo sotto costo</div>' : ''}
  `;
  if (btnConferma) btnConferma.disabled = false;
}

// Helper: estrae litri/imponibile dai dati nella modale (lettura dal nostro payload64 salvato nel DOM)
function _estraiDatiOrphanDalDOM() {
  // I dati sono nel payload64 passato a _confermaCreaOrdineDaOrphan. Lo rileggiamo dall'onclick.
  const btn = document.getElementById('fi-orphan-conferma');
  if (!btn) return null;
  const onclick = btn.getAttribute('onclick') || '';
  const m = onclick.match(/'([A-Za-z0-9+/=]+)'/);
  if (!m) return null;
  try {
    return JSON.parse(decodeURIComponent(escape(atob(m[1]))));
  } catch (e) {
    return null;
  }
}

async function _confermaCreaOrdineDaOrphan(payload64, clienteId, clienteTrovato) {
  const costo = parseFloat(document.getElementById('fi-orphan-costo').value);
  const trasporto = parseFloat(document.getElementById('fi-orphan-trasporto').value) || 0;
  const dataOrd = document.getElementById('fi-orphan-data').value;

  if (!costo || costo <= 0) { toast('⚠️ Costo obbligatorio'); return; }
  if (!dataOrd) { toast('⚠️ Data obbligatoria'); return; }

  let d;
  try {
    d = JSON.parse(decodeURIComponent(escape(atob(payload64))));
  } catch (e) {
    toast('Errore decodifica: ' + e.message);
    return;
  }

  const litri = Number(d.litri);
  const imponibile = Number(d.imponibile);
  const impNettoL = litri > 0 ? (imponibile / litri) : 0;
  const margine = Math.round((impNettoL - costo - trasporto) * 1000000) / 1000000;

  // Calcola data_scadenza: data + giorni pagamento cliente (default 30)
  let ggPag = 30;
  if (clienteTrovato && clienteId) {
    try {
      const { data: cli } = await sb.from('clienti').select('giorni_pagamento').eq('id', clienteId).single();
      if (cli && cli.giorni_pagamento) ggPag = cli.giorni_pagamento;
    } catch (e) { /* ignore */ }
  }
  const dataScad = new Date(dataOrd);
  dataScad.setDate(dataScad.getDate() + ggPag);
  const dataScadISO = dataScad.toISOString().split('T')[0];

  // Mappa prodotto normalizzato → nome prodotto in anagrafica (lo stesso uso del parser)
  // PhoenixFuel usa 'Gasolio Autotrazione' / 'Gasolio Agricolo' / 'Benzina' / 'HVO' / 'AdBlue'
  const mapProdotto = {
    'Gas Auto': 'Gasolio Autotrazione',
    'Gas Agricolo': 'Gasolio Agricolo',
    'Benzina': 'Benzina',
    'HVO': 'HVO',
    'AdBlue': 'AdBlue',
  };
  const prodottoDB = mapProdotto[d.prodotto] || d.prodotto;

  const record = {
    data: dataOrd,
    tipo_ordine: 'cliente',
    cliente: d.cessionario_denominazione,
    cliente_id: clienteTrovato && clienteId ? clienteId : null,
    prodotto: prodottoDB,
    litri: litri,
    fornitore: 'PhoenixFuel',
    costo_litro: costo,
    trasporto_litro: trasporto,
    margine: margine,
    iva: Number(d.aliquota_iva) || 22,
    stato: 'consegnato',
    caricato_deposito: true,
    giorni_pagamento: ggPag,
    data_scadenza: dataScadISO,
    note: 'Creato da import Danea fatt. ' + d.fattura_nr + ' del ' + _fmtData(d.fattura_data) +
          (d.das_numero_dogane ? ' · DAS Dogane ' + d.das_numero_dogane : ''),
  };

  try {
    const { data: nuovo, error } = await sb.from('ordini').insert([record]).select().single();
    if (error) { toast('Errore insert: ' + error.message); return; }

    // Audit log
    if (typeof _auditLog === 'function') {
      _auditLog('crea_ordine_da_fattura_danea', 'ordini',
        d.cessionario_denominazione + ' ' + prodottoDB + ' ' + _fmtN(litri) + 'L ' +
        '€' + _fmtN(imponibile) + ' | costo ' + costo.toFixed(6) + ' margine ' + margine.toFixed(6) +
        ' | fatt. ' + d.fattura_nr + '/' + d.fattura_data +
        ' | batch ' + (_batchId || '?'));
    }

    // Aggiungi il nuovo ordine alla copia locale così il re-match lo trova
    if (_ordiniPeriodo && nuovo) {
      _ordiniPeriodo.push({
        id: nuovo.id,
        data: nuovo.data,
        cliente: nuovo.cliente,
        cliente_id: nuovo.cliente_id,
        prodotto: nuovo.prodotto,
        litri: nuovo.litri,
        costo_litro: nuovo.costo_litro,
        trasporto_litro: nuovo.trasporto_litro,
        margine: nuovo.margine,
        iva: nuovo.iva,
        tipo_ordine: nuovo.tipo_ordine,
        stato: nuovo.stato,
        fornitore: nuovo.fornitore,
      });
    }

    toast('✓ Ordine creato e collegato alla fattura');
    chiudiModal();

    // Ricalcola match: l'orphan diventa matched, gli altri restano coerenti
    _calcolaMatchTutte();
    _renderStep3UI();

  } catch (e) {
    console.error('[_confermaCreaOrdineDaOrphan]', e);
    toast('Errore: ' + e.message);
  }
}


// ═══════════════════════════════════════════════════════════════════════════
// STEP 3C / 4 — IMPORT EFFETTIVO IN DATABASE
// Flusso:
//   1. Crea record in fatture_import_batch (stato='in_corso')
//   2. Per ogni fattura matched:
//        2a. UPSERT fatture_emesse (deduplica su PK univoco)
//        2b. DELETE fatture_righe esistenti + INSERT righe (ri-import sicuro)
//        2c. DELETE fatture_pagamenti esistenti + INSERT pagamenti
//   3. UPDATE fatture_import_batch (stato='completato', contatori)
// Gestisce errori per-fattura (non blocca le altre) con log dettagliato.
// ═══════════════════════════════════════════════════════════════════════════
async function _procediImport() {
  if (!_parsedData || !_parsedData.fatture || !_parsedData.fatture.length) {
    toast('Nessun dato da importare');
    return;
  }

  // Filtra solo fatture in stato 'matched' (come da regola: uncertain da sistemare prima)
  const fattureImport = _parsedData.fatture.filter(f => f._match_status_fattura === 'matched');
  if (!fattureImport.length) {
    toast('⚠️ Nessuna fattura matched da importare');
    return;
  }

  const msg = 'Stai per importare ' + fattureImport.length + ' fatture nel database.\n\n' +
              'Fatture già presenti (stesso cedente/numero/anno) verranno AGGIORNATE, non duplicate.\n\n' +
              'Confermi?';
  if (!confirm(msg)) return;

  _setStep(4);

  // Render UI di progress
  const body = document.getElementById('fi-body');
  body.innerHTML = `
    <div class="fi-panel">
      <h2>💾 Step 4 — Import in database</h2>
      <div style="margin-bottom:10px;display:flex;justify-content:space-between;align-items:center">
        <div style="font-size:13px">Import di <strong>${fattureImport.length}</strong> fatture in corso...</div>
        <div style="font-size:11px;color:#666" id="fi-import-status">⏳ Inizializzazione...</div>
      </div>
      <div class="fi-progress-bg"><div class="fi-progress-fg" id="fi-import-progress" style="width:2%"></div></div>
      <div class="fi-log" id="fi-import-log">
        <div class="info">[${_now()}] 🚀 Avvio import</div>
      </div>
      <div id="fi-import-kpi" style="display:none;margin-top:14px"></div>
    </div>
  `;

  const log = document.getElementById('fi-import-log');
  const prog = document.getElementById('fi-import-progress');
  const status = document.getElementById('fi-import-status');
  const kpi = document.getElementById('fi-import-kpi');

  // Statistiche
  let nuove = 0, aggiornate = 0, errori = 0;
  const erroriDett = [];
  let batchId = _batchId || crypto.randomUUID();

  try {
    // ── 1. Crea record batch ──
    const userNome = (typeof utenteCorrente !== 'undefined' && utenteCorrente)
      ? (utenteCorrente.nome || utenteCorrente.email || 'sconosciuto')
      : 'sconosciuto';
    const userId = (typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.id)
      ? utenteCorrente.id : null;

    _logAppend(log, 'info', 'Creo record batch id=' + batchId.substring(0, 8) + '...');
    const { error: errBatch } = await sb.from('fatture_import_batch').insert([{
      id: batchId,
      utente_id: userId,
      utente_nome: userNome,
      nome_file: _parsedData._nome_file || 'import_' + new Date().toISOString().slice(0, 10),
      formato: _parsedData.formato || 'fatturapa_sdi',
      fatture_totali: _parsedData.fatture.length,
      fatture_importate: 0,
      fatture_orfane: _parsedData.match_stats.orphan || 0,
      fatture_in_revisione: _parsedData.match_stats.uncertain || 0,
      errori_parsing: _parsedData.anomalie ? _parsedData.anomalie.length : 0,
      totale_fatturato: _parsedData.statistiche.importo_totale,
      data_min: _parsedData.statistiche.data_min,
      data_max: _parsedData.statistiche.data_max,
      stato: 'in_corso',
    }]);
    if (errBatch) {
      _logAppend(log, 'err', '✗ Batch: ' + errBatch.message);
      throw new Error('Creazione batch fallita: ' + errBatch.message);
    }
    _logAppend(log, 'ok', '✓ Batch creato');
    prog.style.width = '5%';

    // ── 2. Import fatture una a una ──
    for (let i = 0; i < fattureImport.length; i++) {
      const f = fattureImport[i];
      const ft = f.fattura;
      const pct = 5 + Math.round(90 * (i + 1) / fattureImport.length);
      status.textContent = `⏳ Fattura ${i + 1}/${fattureImport.length}: nr ${ft.numero}`;

      try {
        const ris = await _importFatturaSingola(f, batchId);
        if (ris.nuova) nuove++;
        else aggiornate++;

        // Log solo ogni 20 per non intasare UI
        if ((i + 1) % 20 === 0 || i === fattureImport.length - 1) {
          _logAppend(log, 'ok', `✓ ${i + 1}/${fattureImport.length} — ultima: nr ${ft.numero}`);
        }
      } catch (e) {
        errori++;
        erroriDett.push({ nr: ft.numero, data: ft.data, errore: e.message });
        _logAppend(log, 'err', `✗ nr ${ft.numero}: ${e.message.substring(0, 80)}`);
      }

      prog.style.width = pct + '%';
      if ((i + 1) % 5 === 0) await new Promise(r => setTimeout(r, 0)); // yield al browser
    }

    // ── 3. UPDATE batch: stato completato + contatori ──
    const statoFinale = errori === 0 ? 'completato' : (errori < fattureImport.length ? 'completato_con_errori' : 'fallito');
    await sb.from('fatture_import_batch').update({
      stato: statoFinale,
      fatture_importate: nuove + aggiornate,
      errore_msg: erroriDett.length ? JSON.stringify(erroriDett.slice(0, 20)).substring(0, 1000) : null,
    }).eq('id', batchId);

    _logAppend(log, 'ok', `✓ Import completato: ${nuove} nuove, ${aggiornate} aggiornate, ${errori} errori`);
    prog.style.width = '100%';
    prog.style.background = errori === 0
      ? 'linear-gradient(90deg,#639922,#97C459)'
      : 'linear-gradient(90deg,#D4A017,#F5BD4B)';
    status.textContent = errori === 0 ? '✓ Completato' : '⚠ Completato con errori';

    // Audit log
    if (typeof _auditLog === 'function') {
      _auditLog('import_fatture_danea', 'fatture_emesse',
        `batch ${batchId.substring(0, 8)} | ${nuove} nuove + ${aggiornate} aggiornate + ${errori} errori | totale €${_fmtN(_parsedData.statistiche.importo_totale)}`);
    }

    // ── 4. Render KPI finale ──
    kpi.style.display = 'block';
    kpi.innerHTML = `
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px">
        <div style="background:#F4FAEC;border:1px solid #97C459;padding:14px;border-radius:8px">
          <div style="font-size:10px;color:#27500A;text-transform:uppercase;font-weight:600">✓ Nuove</div>
          <div style="font-size:24px;font-weight:700;font-family:monospace;color:#27500A;margin-top:4px">${nuove}</div>
        </div>
        <div style="background:#EEEDFE;border:1px solid #6B5FCC;padding:14px;border-radius:8px">
          <div style="font-size:10px;color:#26215C;text-transform:uppercase;font-weight:600">↻ Aggiornate</div>
          <div style="font-size:24px;font-weight:700;font-family:monospace;color:#26215C;margin-top:4px">${aggiornate}</div>
        </div>
        <div style="background:${errori > 0 ? '#FDECEC' : '#fafaf8'};border:1px solid ${errori > 0 ? '#E24B4A' : '#ccc'};padding:14px;border-radius:8px">
          <div style="font-size:10px;color:${errori > 0 ? '#791F1F' : '#666'};text-transform:uppercase;font-weight:600">${errori > 0 ? '✗ Errori' : '— Errori'}</div>
          <div style="font-size:24px;font-weight:700;font-family:monospace;color:${errori > 0 ? '#791F1F' : '#666'};margin-top:4px">${errori}</div>
        </div>
        <div style="background:#fafaf8;border:1px solid #e8e5dc;padding:14px;border-radius:8px">
          <div style="font-size:10px;color:#666;text-transform:uppercase;font-weight:600">Totale importato</div>
          <div style="font-size:18px;font-weight:700;font-family:monospace;color:#26215C;margin-top:4px">€ ${_fmtN(_parsedData.statistiche.importo_totale)}</div>
        </div>
      </div>
      ${erroriDett.length > 0 ? `
        <div style="margin-top:12px;background:#FDECEC;border-left:3px solid #E24B4A;padding:10px 14px;border-radius:4px">
          <div style="font-size:12px;font-weight:700;color:#791F1F;margin-bottom:6px">Fatture con errori (${erroriDett.length}):</div>
          <div style="max-height:180px;overflow-y:auto;font-size:11px;font-family:monospace">
            ${erroriDett.slice(0, 15).map(e => `<div>nr ${esc(e.nr)} del ${_fmtData(e.data)}: ${esc(e.errore.substring(0, 120))}</div>`).join('')}
            ${erroriDett.length > 15 ? `<div style="color:#666">... e altri ${erroriDett.length - 15} errori</div>` : ''}
          </div>
        </div>
      ` : ''}
      <div style="margin-top:14px;display:flex;gap:8px;justify-content:flex-end">
        <button class="btn-primary" onclick="window.pfFattureImport.renderFattureImport()"
                style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);font-size:12px">
          ← Nuovo import
        </button>
        <button class="btn-primary" onclick="location.reload()"
                style="background:#26215C;font-size:12px">
          ✓ Torna a Fatture
        </button>
      </div>
    `;

  } catch (e) {
    console.error('[procediImport] fatale:', e);
    _logAppend(log, 'err', '✗ Errore fatale: ' + e.message);
    status.textContent = '✗ Fallito';
    prog.style.background = 'linear-gradient(90deg,#A32D2D,#E24B4A)';

    // Segna batch come fallito
    try {
      await sb.from('fatture_import_batch').update({
        stato: 'fallito',
        errore_msg: e.message.substring(0, 500),
      }).eq('id', batchId);
    } catch (e2) { /* ignore */ }

    kpi.style.display = 'block';
    kpi.innerHTML = `
      <div style="background:#FDECEC;border-left:4px solid #E24B4A;padding:14px;border-radius:6px">
        <div style="font-size:13px;font-weight:700;color:#791F1F;margin-bottom:6px">✗ Import fallito</div>
        <div style="font-size:12px;color:#555">Errore: <code>${esc(e.message)}</code></div>
        <button class="btn-primary" onclick="window.pfFattureImport.renderFattureImport()"
                style="margin-top:10px;font-size:12px">← Riprova import</button>
      </div>
    `;
  }
}

// Import di una singola fattura (testa + righe + pagamenti). Transazione lato client:
// se un insert figlio fallisce, la testa resta ma gli elementi sono coerenti al chunk.
async function _importFatturaSingola(f, batchId) {
  const ft = f.fattura;

  // Trova cliente_id nel modo più affidabile: prima PIVA, poi nome esatto
  let clienteIdFatt = null;
  if (ft.cessionario_piva) {
    const pivaNorm = _normalizzaPiva(ft.cessionario_piva);
    for (const [id, c] of _clientiMap.entries()) {
      if (c.piva_norm && c.piva_norm === pivaNorm) { clienteIdFatt = id; break; }
    }
  }
  if (!clienteIdFatt && ft.cessionario_denominazione) {
    const denomNorm = _normalizzaNome(ft.cessionario_denominazione);
    for (const [id, c] of _clientiMap.entries()) {
      if (c.nome_norm === denomNorm) { clienteIdFatt = id; break; }
    }
  }

  // Aggrega match score/details a livello fattura (media score delle righe prodotto)
  const righeProdotto = f.righe.filter(r => r.prodotto_normalizzato && r.quantita > 0);
  const scoreMedio = righeProdotto.length > 0
    ? Math.round(righeProdotto.reduce((s, r) => s + (r._match?.score || 0), 0) / righeProdotto.length)
    : null;

  // ── 1. UPSERT fattura_emesse ──
  const recFatt = {
    batch_id: batchId,
    numero: String(ft.numero),
    data: ft.data,
    tipo_documento: ft.tipo_documento,
    divisa: ft.divisa || 'EUR',
    cedente_piva: ft.cedente_piva,
    cedente_denominazione: ft.cedente_denominazione,
    cessionario_piva: ft.cessionario_piva,
    cessionario_codfiscale: ft.cessionario_codfiscale,
    cessionario_denominazione: ft.cessionario_denominazione,
    cessionario_indirizzo: ft.cessionario_indirizzo,
    cessionario_cap: ft.cessionario_cap,
    cessionario_comune: ft.cessionario_comune,
    cessionario_provincia: ft.cessionario_provincia,
    cessionario_nazione: ft.cessionario_nazione || 'IT',
    importo_totale: ft.importo_totale,
    imponibile_totale: ft.imponibile_totale,
    iva_totale: ft.iva_totale,
    cliente_id: clienteIdFatt,
    match_status: f._match_status_fattura || 'matched',
    match_score: scoreMedio,
    match_details: null,
  };

  // UPSERT via PostgREST: usa onConflict sulla chiave dedup.
  // PostgREST richiede che la chiave sia un indice univoco (l'abbiamo creato).
  const { data: fattInserted, error: errFatt } = await sb.from('fatture_emesse')
    .upsert(recFatt, {
      onConflict: 'cedente_piva,anno,numero',
      ignoreDuplicates: false,
    })
    .select('id, created_at, updated_at')
    .single();

  if (errFatt) throw new Error('upsert fattura: ' + errFatt.message);
  if (!fattInserted) throw new Error('upsert fattura: no row returned');

  const fattId = fattInserted.id;
  // Heuristica "nuova vs aggiornata": se created_at === updated_at → nuova
  const nuova = fattInserted.created_at === fattInserted.updated_at ||
                Math.abs(new Date(fattInserted.updated_at) - new Date(fattInserted.created_at)) < 1000;

  // ── 2. DELETE + INSERT righe (ricarica pulita) ──
  // Prima stacco gli ordini linkati alla versione precedente della fattura:
  // la FK ON DELETE SET NULL gestisce fattura_riga_id, ma fattura_id va gestito a mano.
  // Stato ordini NON lo ripristino: se era 'consegnato' resta 'consegnato' (è coerente).
  if (!nuova) {
    const { error: errUnlink } = await sb.from('ordini')
      .update({ fattura_id: null, fattura_riga_id: null })
      .eq('fattura_id', fattId);
    if (errUnlink) console.warn('[import] unlink ordini pre-sovrascrittura:', errUnlink.message);
  }
  await sb.from('fatture_righe').delete().eq('fattura_id', fattId);

  // Memo per riagganciare numero_linea → ordini_ids dopo INSERT (la DB restituisce id)
  const numLineaToOrdiniIds = new Map();
  f.righe.forEach(r => {
    const ids = r._match?.ordini_ids;
    if (ids && ids.length > 0) numLineaToOrdiniIds.set(r.numero_linea, ids);
  });

  const righePayload = f.righe.map(r => ({
    fattura_id: fattId,
    numero_linea: r.numero_linea,
    descrizione: r.descrizione ? r.descrizione.substring(0, 2000) : '',
    prodotto_normalizzato: r.prodotto_normalizzato,
    codice_articolo: r.codice_articolo,
    quantita: r.quantita,
    unita_misura: r.unita_misura,
    prezzo_unitario: r.prezzo_unitario,
    prezzo_totale: r.prezzo_totale,
    aliquota_iva: r.aliquota_iva,
    das_numero_dogane: r.das_numero_dogane,
    das_data_str: r.das_data_str,
    das_data: r.das_data,
    ordine_danea_numero: r.ordine_danea_numero,
    ordine_danea_data: r.ordine_danea_data,
    ordine_id: r._match?.ordine_id || null,       // "principale" (primo del subset N:1, o unico in 1:1)
    riga_match_score: r._match?.score ?? null,
    riga_match_details: r._match?.dettaglio ? r._match.dettaglio : null,
  }));

  let righeInsertite = [];
  if (righePayload.length > 0) {
    // .insert(...).select() → ritorna righe inserite con id assegnato dal DB
    const { data: rIns, error: errR } = await sb.from('fatture_righe')
      .insert(righePayload)
      .select('id, numero_linea');
    if (errR) throw new Error('insert righe: ' + errR.message);
    righeInsertite = rIns || [];
  }

  // ── 2.bis — Linko ordini a fattura via FK (fattura_id + fattura_riga_id) ──
  // Regola costituzionale: ordine fatturato → stato = consegnato.
  // Un UPDATE batch per ogni riga con match (1:1 o N:1).
  for (const rigaIns of righeInsertite) {
    const ordiniIds = numLineaToOrdiniIds.get(rigaIns.numero_linea);
    if (!ordiniIds || ordiniIds.length === 0) continue;

    const { error: errU } = await sb.from('ordini')
      .update({
        fattura_id: fattId,
        fattura_riga_id: rigaIns.id,
        stato: 'consegnato',
      })
      .in('id', ordiniIds);
    if (errU) console.warn(`[import] update ordini riga ${rigaIns.numero_linea}:`, errU.message);
    // Non throw: l'import prosegue, c'è sempre il ricalcolo batch come sanatoria.
  }

  // ── 3. DELETE + INSERT pagamenti ──
  await sb.from('fatture_pagamenti').delete().eq('fattura_id', fattId);

  if (f.pagamenti && f.pagamenti.length > 0) {
    const pagPayload = f.pagamenti.map(p => ({
      fattura_id: fattId,
      condizioni_pagamento: p.condizioni_pagamento,
      modalita_pagamento: p.modalita_pagamento,
      data_scadenza: p.data_scadenza,
      importo: p.importo,
      istituto_finanziario: p.istituto_finanziario,
      iban: p.iban,
    }));
    const { error: errP } = await sb.from('fatture_pagamenti').insert(pagPayload);
    if (errP) throw new Error('insert pagamenti: ' + errP.message);
  }

  return { nuova: nuova, fattId: fattId };
}


// ═══════════════════════════════════════════════════════════════════════════
// RICALCOLO MATCH N:1 SU FATTURE STORICHE (nuovo schema ordini.fattura_id)
//
// Strategia: scorro tutte le righe fattura del periodo che NON hanno già
// un subset N:1 (euristica: una fattura_riga_id con 2+ ordini che puntano).
// Per ogni riga rilancio il matcher; se trova subset N:1:
//   - popolo ordini.fattura_id + fattura_riga_id sugli ordini extra del subset
//   - metto stato=consegnato
// Non tocco fatture_righe né l'ordine "principale" (ordine_id della riga).
// ═══════════════════════════════════════════════════════════════════════════

async function _avviaRicalcoloNa1(opts) {
  opts = opts || {};
  // 2 modalità di invocazione:
  //  (A) da dashboard Elenco Fatture → passa { dataMin, dataMax, targetElId, labelPeriodo, skipConfirm }
  //  (B) legacy fallback: legge dropdown nella tab Import (se ancora presente)
  let dataMin, dataMax, targetElId, labelPeriodo, skipConfirm;
  if (opts.dataMin && opts.dataMax) {
    dataMin      = opts.dataMin;
    dataMax      = opts.dataMax;
    targetElId   = opts.targetElId || 'fi-rim-output';
    labelPeriodo = opts.labelPeriodo || `${dataMin} → ${dataMax}`;
    skipConfirm  = !!opts.skipConfirm;
  } else {
    const selAnno = document.getElementById('fi-rim-anno');
    if (!selAnno) {
      alert('Impossibile avviare il ricalcolo: parametri mancanti.');
      return;
    }
    const anno = selAnno.value;
    if (anno === 'all') { dataMin = '2020-01-01'; dataMax = '2099-12-31'; }
    else { dataMin = `${anno}-01-01`; dataMax = `${anno}-12-31`; }
    targetElId   = 'fi-rim-output';
    labelPeriodo = anno === 'all' ? 'TUTTO STORICO' : anno;
    skipConfirm  = false;
  }

  const out = document.getElementById(targetElId);
  if (!out) { alert('Contenitore log non trovato: ' + targetElId); return; }

  if (!skipConfirm && !confirm(`Ricalcolo match N:1 sulle fatture del periodo ${labelPeriodo}.\n\nQuesta operazione:\n• Legge righe fattura + ordini del periodo\n• Rilancia il matcher con logica N:1\n• Linka ordini extra a fattura_id + fattura_riga_id\n• Mette stato=consegnato\n\nNon tocca righe già con 2+ ordini linkati.\n\nProcedere?`)) return;

  const logId = `fi-rim-log-${Date.now()}`;
  out.innerHTML = `<div class="fi-log" id="${logId}" style="max-height:300px;overflow-y:auto;background:#f6f6f6;border:0.5px solid #ddd;border-radius:6px;padding:10px;font-family:monospace;font-size:11px;line-height:1.5"><div class="info">[${_now()}] 🔁 Avvio ricalcolo match N:1 (${labelPeriodo})...</div></div>`;
  const log = document.getElementById(logId);

  try {
    // ── 1. Carica anagrafica clienti + ordini del periodo (buffer ±3gg) ──
    _logAppend(log, 'info', 'Caricamento ordini + anagrafica clienti...');
    await _caricaDatiPeriodo(dataMin, dataMax, log);
    _logAppend(log, 'ok', `✓ ${_ordiniPeriodo.length} ordini in memoria, ${_clientiMap.size} clienti`);

    // ── 2. Carica fatture del periodo ──
    const { data: fattEmesse, error: errF } = await sb.from('fatture_emesse')
      .select('id, numero, anno, data, cessionario_piva, cessionario_denominazione')
      .gte('data', dataMin)
      .lte('data', dataMax)
      .order('data');
    if (errF) throw new Error('fatture_emesse: ' + errF.message);
    if (!fattEmesse || fattEmesse.length === 0) {
      _logAppend(log, 'warn', 'Nessuna fattura trovata nel periodo.');
      return;
    }
    _logAppend(log, 'ok', `✓ ${fattEmesse.length} fatture trovate`);

    // ── 3. Carica righe + conteggio ordini già linkati per riga ──
    _logAppend(log, 'info', 'Caricamento righe fattura...');
    const fattIds = fattEmesse.map(f => f.id);
    let righeAll = [];
    for (let i = 0; i < fattIds.length; i += 500) {
      const chunk = fattIds.slice(i, i + 500);
      const { data: rChunk, error: errR } = await sb.from('fatture_righe')
        .select('id, fattura_id, numero_linea, descrizione, prodotto_normalizzato, codice_articolo, quantita, prezzo_totale, ordine_id, riga_match_score')
        .in('fattura_id', chunk);
      if (errR) throw new Error('fatture_righe: ' + errR.message);
      righeAll = righeAll.concat(rChunk || []);
    }
    _logAppend(log, 'ok', `✓ ${righeAll.length} righe`);

    // Conteggio ordini attualmente linkati per fattura_riga_id
    const righeIds = righeAll.map(r => r.id);
    const ordiniGiaLinkatiPerRiga = new Map();  // riga_id → count
    for (let i = 0; i < righeIds.length; i += 500) {
      const chunk = righeIds.slice(i, i + 500);
      const { data: oLink, error: errOL } = await sb.from('ordini')
        .select('id, fattura_riga_id')
        .in('fattura_riga_id', chunk);
      if (errOL) throw new Error('conteggio ordini linkati: ' + errOL.message);
      (oLink || []).forEach(o => {
        ordiniGiaLinkatiPerRiga.set(o.fattura_riga_id, (ordiniGiaLinkatiPerRiga.get(o.fattura_riga_id) || 0) + 1);
      });
    }

    // Indicizza fatture
    const fattById = new Map();
    fattEmesse.forEach(f => fattById.set(f.id, f));

    // ── 4. Rilancio matcher riga per riga ──
    let nRigheValutate = 0;
    let nMatchNa1Nuovi = 0;
    let nOrdiniDaLinkare = 0;
    const updatesPerOrdini = [];  // { riga_id, fattura_id, ordiniExtra: [id,...] }

    for (const r of righeAll) {
      nRigheValutate++;
      if (!r.prodotto_normalizzato || !r.quantita || Number(r.quantita) <= 0) continue;

      // Skip se questa riga ha già 2+ ordini linkati (match N:1 già applicato)
      if ((ordiniGiaLinkatiPerRiga.get(r.id) || 0) >= 2) continue;

      const f = fattById.get(r.fattura_id);
      if (!f) continue;

      const fattObj = {
        data: f.data,
        cessionario_piva: f.cessionario_piva,
        cessionario_denominazione: f.cessionario_denominazione,
      };
      const rigaObj = {
        prodotto_normalizzato: r.prodotto_normalizzato,
        quantita: r.quantita,
        prezzo_totale: r.prezzo_totale,
      };
      const m = _calcolaMatchRiga(fattObj, rigaObj);

      // Ci interessa solo se il matcher trova un subset N:1 nuovo
      if (!m.ordini_ids || m.ordini_ids.length < 2) continue;

      // Gli ordini extra sono quelli del subset diversi da r.ordine_id
      // (quello principale che è già linkato via fatture_righe.ordine_id
      // ma che potrebbe non aver ancora fattura_id su ordini — lo includo lo stesso
      // per sicurezza, l'UPDATE è idempotente).
      const ordiniExtra = m.ordini_ids;

      updatesPerOrdini.push({
        riga_id: r.id,
        fattura_id: r.fattura_id,
        ordiniExtra,
      });
      nMatchNa1Nuovi++;
      nOrdiniDaLinkare += ordiniExtra.length;
    }

    _logAppend(log, 'info', `Righe valutate: ${nRigheValutate}`);
    _logAppend(log, 'ok', `✓ Nuovi match N:1: <strong>${nMatchNa1Nuovi}</strong> (totale ordini da linkare: ${nOrdiniDaLinkare})`);

    if (updatesPerOrdini.length === 0) {
      _logAppend(log, 'ok', '✓ Nessun aggiornamento da fare. Tutto già ottimale.');
      return;
    }

    // ── 5. UPDATE ordini per ogni riga trovata ──
    _logAppend(log, 'info', `Aggiornamento ordini in DB...`);
    let nOk = 0, nErr = 0;
    for (const u of updatesPerOrdini) {
      const { error: errU } = await sb.from('ordini')
        .update({
          fattura_id: u.fattura_id,
          fattura_riga_id: u.riga_id,
          stato: 'consegnato',
        })
        .in('id', u.ordiniExtra);
      if (errU) { nErr++; console.warn('[rim]', u.riga_id, errU.message); }
      else nOk++;
    }
    _logAppend(log, 'ok', `✓ ${nOk} righe processate, ${nErr} errori`);
    _logAppend(log, 'ok', `<strong>✅ Ricalcolo completato.</strong>`);
    _logAppend(log, 'info', '💡 Ricarica la tab Fatture per vedere la dashboard aggiornata.');

  } catch (err) {
    console.error('[rim]', err);
    _logAppend(log, 'err', `✗ Errore: ${err.message}`);
  }
}


window.pfFattureImport = {
  renderFattureImport: renderFattureImport,
  _onFileSelected: _onFileSelected,
  _apriDettaglio: _apriDettaglio,
  _togglePivaAll: _togglePivaAll,
  _applicaPivaBatch: _applicaPivaBatch,
  _accettaCorrezione: _accettaCorrezione,
  _apriCreaOrdineDaOrphan: _apriCreaOrdineDaOrphan,
  _confermaCreaOrdineDaOrphan: _confermaCreaOrdineDaOrphan,
  _aggiornaPreviewOrphan: _aggiornaPreviewOrphan,
  _procediImport: _procediImport,
  _avviaRicalcoloNa1: _avviaRicalcoloNa1,
};

})();
