// ════════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Importer estratti conto bancari (modulo Valutazioni)
// Usa SheetJS (XLSX 0.18.5, caricato in index.html riga 19)
// Parser specifico per istituto (mappa causali ABI → categoria contabile)
//
// Flusso:
//   1. Click pulsante "Importa estratto conto" → apre modal
//   2. Scegli banca (default: banca attiva in Valutazioni) + mese + file .xlsx
//   3. Click "Analizza" → parser legge file e mostra anteprima voci di costo
//   4. Click "Conferma e salva" →
//        a) DELETE movimenti esistenti del mese (anti-duplicati)
//        b) INSERT nuovi movimenti in banche_movimenti_costi
//        c) Ricalcola aggregati annuali e UPDATE banche_valutazioni_periodi
//        d) Crea record valutazione anno se non esiste
//        e) Refresh tab Valutazioni
// ════════════════════════════════════════════════════════════════════════════

let _imeParsedMovimenti = null;   // Risultato del parse pre-conferma
let _imeBancaId         = null;
let _imeMese            = null;   // 1..12
let _imeAnno            = null;

// ── MAPPATURA CAUSALI INTESA SP → CATEGORIA ───────────────────────────────
// Le chiavi sono prefissi della causale (case-insensitive). Match parziale.
const _IME_MAPPA_INTESA = [
  { prefisso: '015 - 65', categoria: 'interessi_mutui',     etichetta: 'Interessi rata mutuo',         estraiInteressi: true  },
  { prefisso: '018 - AD', categoria: 'interessi_anticipi',  etichetta: 'Liquidazione interessi anticipi' },
  { prefisso: '018 - YL', categoria: 'cdf',                 etichetta: 'CDF chiusura trimestrale'        },
  { prefisso: '066 - 3P', categoria: 'canoni',              etichetta: 'Canone mensile'                  },
  { prefisso: '017 - HT', categoria: 'polizze',             etichetta: 'Premio polizza obbligatoria'     },
  { prefisso: '016 - 3O', categoria: 'bonifici_adue',       etichetta: 'Costo bonifico'                  },
  { prefisso: '016 - KR', categoria: 'bonifici_adue',       etichetta: 'Bonifico istantaneo'             },
  { prefisso: '016 - KS', categoria: 'bonifici_adue',       etichetta: 'Pag. istantaneo stipendio'       },
  { prefisso: '016 - 3K', categoria: 'bonifici_adue',       etichetta: 'Commissione ADUE B2B'            },
  { prefisso: '016 - UL', categoria: 'bonifici_adue',       etichetta: 'Commissioni e spese ADUE'        },
  { prefisso: '016 - 5N', categoria: 'bonifici_adue',       etichetta: 'Accredito bonifico urgente'      },
  { prefisso: '019 - X6', categoria: 'bolli_ec',            etichetta: 'Imposta di bollo E/C'            },
  { prefisso: '019 - J1', categoria: 'bolli_derivati',      etichetta: 'Bollo prodotti finanziari'       },
  { prefisso: '016 - A2H',categoria: 'inbiz_firma',         etichetta: 'Servizi Inbiz'                   },
  { prefisso: '0ZG - SQ', categoria: 'differenziali_irs',   etichetta: 'Differenziale IRS'               },
  { prefisso: '055 - I9', categoria: 'assegni_impagati',    etichetta: 'Assegno impagato'                },
  { prefisso: '016 - 4F', categoria: 'assegni_impagati',    etichetta: 'Commissione assegno impagato'    },
  { prefisso: '016 - JR', categoria: 'oneri_tardivo',       etichetta: 'Oneri tardivo pagamento'         }
];

// ── HANDLER: apre il modal ─────────────────────────────────────────────────
function _imeOpenModal() {
  const oldModal = document.getElementById('ime-modal');
  if (oldModal) oldModal.remove();

  // Banche disponibili in ordine costituzionale
  const banche = (Array.isArray(_bancheIstituti) ? _bancheIstituti : [])
    .slice()
    .sort((a, b) => _priorityBancaIstituto(a.nome) - _priorityBancaIstituto(b.nome));

  // Default: banca attiva nella tab Valutazioni (Intesa se prima volta)
  const defaultBancaId = _bvSelectedBanca || (banche[0] && banche[0].id) || '';

  // Default: mese corrente -1 (mese appena chiuso)
  const oggi = new Date();
  const meseDef = oggi.getMonth() === 0 ? 12 : oggi.getMonth();
  const annoDef = oggi.getMonth() === 0 ? oggi.getFullYear() - 1 : oggi.getFullYear();

  const mesiNomi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

  const modal = document.createElement('div');
  modal.id = 'ime-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:flex-start;padding:40px 20px;overflow-y:auto';

  let opzBanche = '';
  banche.forEach(b => {
    opzBanche += '<option value="' + b.id + '"' + (b.id === defaultBancaId ? ' selected' : '') + '>' + (b.nome || '') + '</option>';
  });
  let opzMesi = '';
  for (let i = 1; i <= 12; i++) {
    opzMesi += '<option value="' + i + '"' + (i === meseDef ? ' selected' : '') + '>' + mesiNomi[i-1] + '</option>';
  }
  let opzAnni = '';
  for (let a = oggi.getFullYear() + 1; a >= 2020; a--) {
    opzAnni += '<option value="' + a + '"' + (a === annoDef ? ' selected' : '') + '>' + a + '</option>';
  }

  modal.innerHTML = `
    <div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:12px;padding:24px;width:100%;max-width:760px;max-height:calc(100vh - 80px);overflow-y:auto;position:relative">
      <button onclick="_imeCloseModal()" style="position:absolute;top:14px;right:14px;background:transparent;border:0;font-size:22px;cursor:pointer;color:var(--text-muted)" title="Chiudi">×</button>
      <div style="font-size:16px;font-weight:700;margin-bottom:4px">📥 Importa estratto conto</div>
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:18px">I movimenti verranno parsati per causale ABI e aggregati nei totali annuali della scheda valutazione.</div>

      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:14px">
        <div>
          <label style="font-size:10.5px;color:var(--text-muted);font-weight:500;letter-spacing:0.4px;display:block;margin-bottom:4px">BANCA</label>
          <select id="ime-banca" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;font-weight:600">
            ${opzBanche}
          </select>
        </div>
        <div>
          <label style="font-size:10.5px;color:var(--text-muted);font-weight:500;letter-spacing:0.4px;display:block;margin-bottom:4px">MESE</label>
          <select id="ime-mese" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;font-weight:600">
            ${opzMesi}
          </select>
        </div>
        <div>
          <label style="font-size:10.5px;color:var(--text-muted);font-weight:500;letter-spacing:0.4px;display:block;margin-bottom:4px">ANNO</label>
          <select id="ime-anno" style="width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;font-weight:600">
            ${opzAnni}
          </select>
        </div>
      </div>

      <div style="margin-bottom:14px">
        <label style="font-size:10.5px;color:var(--text-muted);font-weight:500;letter-spacing:0.4px;display:block;margin-bottom:4px">FILE EXCEL (.xlsx)</label>
        <input id="ime-file" type="file" accept=".xlsx,.xls" style="width:100%;padding:8px;border:0.5px dashed var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12px;cursor:pointer">
        <div style="font-size:10px;color:var(--text-muted);margin-top:4px;font-style:italic">Formato atteso: estratto conto con causali ABI/SWIFT in colonna E (Intesa SP).</div>
      </div>

      <div style="display:flex;gap:8px;margin-bottom:18px">
        <button onclick="_imeAnalizzaFile()" style="background:#1a1a18;color:#FAC775;border:0.5px solid var(--border);border-radius:6px;padding:9px 18px;font-size:12px;font-weight:600;cursor:pointer">🔍 Analizza file</button>
        <button onclick="_imeCloseModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:9px 18px;font-size:12px;cursor:pointer">Annulla</button>
      </div>

      <div id="ime-anteprima" style="display:none">
        <!-- popolato da _imeAnalizzaFile -->
      </div>
    </div>
  `;
  document.body.appendChild(modal);
}

function _imeCloseModal() {
  const m = document.getElementById('ime-modal');
  if (m) m.remove();
  _imeParsedMovimenti = null;
}

// ── ANALIZZA FILE EXCEL ────────────────────────────────────────────────────
async function _imeAnalizzaFile() {
  const fileInput = document.getElementById('ime-file');
  const bancaSel  = document.getElementById('ime-banca');
  const meseSel   = document.getElementById('ime-mese');
  const annoSel   = document.getElementById('ime-anno');
  const previewBox = document.getElementById('ime-anteprima');

  if (!fileInput.files || !fileInput.files[0]) {
    alert('Seleziona prima un file Excel.');
    return;
  }
  _imeBancaId = bancaSel.value;
  _imeMese    = parseInt(meseSel.value);
  _imeAnno    = parseInt(annoSel.value);

  previewBox.style.display = 'block';
  previewBox.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">⏳ Lettura file in corso...</div>';

  try {
    const f = fileInput.files[0];
    const arrBuf = await f.arrayBuffer();
    const wb = XLSX.read(arrBuf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: null });

    // Skip righe header (Intesa SP: 8 righe iniziali con metadati)
    // Le righe dati partono da indice 8 in poi. Colonne (0-indexed):
    //   A=data_contabile, B=data_valuta, C=dare, D=avere, E=causale, F=descrizione
    const movimenti = [];
    const banca = _bancheIstituti.find(b => b.id === _imeBancaId);
    const isIntesa = banca && /intesa/i.test(banca.nome || '');

    for (let i = 8; i < rows.length; i++) {
      const r = rows[i];
      if (!r) continue;
      const causale = (r[4] || '').toString().trim();
      if (!causale) continue;
      const dataContabile = _imeParseData(r[0]);
      if (!dataContabile) continue;

      // Verifica che il movimento appartenga al mese/anno selezionato
      const d = new Date(dataContabile);
      if (d.getFullYear() !== _imeAnno || (d.getMonth() + 1) !== _imeMese) continue;

      const dataValuta = _imeParseData(r[1]);
      const dare       = parseFloat(r[2]) || 0;
      const avere      = parseFloat(r[3]) || 0;
      const descrizione = (r[5] || '').toString().trim();

      // Classifica per causale
      const mappa = isIntesa ? _IME_MAPPA_INTESA : _IME_MAPPA_INTESA;  // futuro: switch per banca
      const match = mappa.find(m => causale.toUpperCase().startsWith(m.prefisso.toUpperCase()));
      if (!match) continue;  // movimento non di costo bancario

      // Calcolo importo
      let importo;
      if (match.estraiInteressi) {
        // Per mutui (015-65): estrai la quota INTERESSI dalla descrizione
        importo = _imeEstraiInteressi(descrizione);
        if (importo === null) continue;  // se non trovo "INTERESSI N,NN" salto
      } else if (match.categoria === 'differenziali_irs') {
        // IRS: gli accrediti vanno in avere → importo negativo (riduce il costo)
        importo = dare > 0 ? dare : -avere;
      } else {
        // Standard: dare = costo positivo; avere = credito (negativo)
        importo = dare > 0 ? dare : -avere;
      }

      if (Math.abs(importo) < 0.01) continue;

      movimenti.push({
        banca_id:       _imeBancaId,
        data_movimento: dataContabile,
        data_valuta:    dataValuta,
        causale_abi:    causale,
        categoria:      match.categoria,
        importo:        importo,
        descrizione:    descrizione.substring(0, 500),
        riferimento:    _imeEstraiRiferimento(causale, descrizione),
        fonte:          'import_excel'
      });
    }

    _imeParsedMovimenti = movimenti;
    _imeRenderAnteprima(movimenti);
  } catch (e) {
    previewBox.innerHTML = '<div style="padding:14px;background:rgba(163,45,45,0.08);border-left:3px solid #A32D2D;border-radius:0 6px 6px 0;font-size:12px;color:#A32D2D">❌ Errore lettura file: ' + (e.message || e) + '</div>';
  }
}

// ── RENDER ANTEPRIMA MOVIMENTI ─────────────────────────────────────────────
function _imeRenderAnteprima(movimenti) {
  const box = document.getElementById('ime-anteprima');
  if (!box) return;

  if (!movimenti.length) {
    box.innerHTML = '<div style="padding:14px;background:rgba(99,56,6,0.08);border-left:3px solid #633806;border-radius:0 6px 6px 0;font-size:12px">⚠ Nessun movimento di costo bancario riconosciuto in questo file/mese. Verifica che il mese/anno corrispondano al contenuto.</div>';
    return;
  }

  // Aggregazione per categoria
  const aggr = {};
  let totDare = 0, totAvere = 0;
  movimenti.forEach(m => {
    aggr[m.categoria] = (aggr[m.categoria] || 0) + m.importo;
    if (m.importo >= 0) totDare += m.importo;
    else totAvere += m.importo;
  });

  let h = '';
  h += '<div style="font-size:13px;font-weight:600;margin-bottom:10px">✓ ' + movimenti.length + ' movimenti riconosciuti</div>';

  // Riepilogo per categoria
  h += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:12px;margin-bottom:14px">';
  h += '<div style="font-size:10.5px;color:var(--text-muted);font-weight:600;letter-spacing:0.4px;margin-bottom:8px">RIEPILOGO PER CATEGORIA</div>';
  h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px">';
  Object.keys(aggr).sort().forEach(cat => {
    const imp = aggr[cat];
    const color = imp < 0 ? '#0a7a3a' : '#A32D2D';
    h += '<tr>';
    h += '<td style="padding:4px 0">' + _imeCategoriaLabel(cat) + '</td>';
    h += '<td style="padding:4px 0;text-align:right;font-weight:600;color:' + color + '">' + fmtE(imp) + '</td>';
    h += '</tr>';
  });
  h += '<tr style="border-top:0.5px solid var(--border)">';
  h += '<td style="padding:6px 0;font-weight:700">TOTALE NETTO</td>';
  h += '<td style="padding:6px 0;text-align:right;font-weight:700;color:#A32D2D">' + fmtE(totDare + totAvere) + '</td>';
  h += '</tr>';
  h += '</table></div>';

  // Tabella dettaglio (prime 30 righe)
  h += '<div style="font-size:10.5px;color:var(--text-muted);font-weight:600;letter-spacing:0.4px;margin-bottom:6px">DETTAGLIO MOVIMENTI (mostrate prime ' + Math.min(30, movimenti.length) + ' di ' + movimenti.length + ')</div>';
  h += '<div style="max-height:240px;overflow-y:auto;border:0.5px solid var(--border);border-radius:6px;margin-bottom:14px">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  h += '<thead style="position:sticky;top:0;background:var(--bg)"><tr>';
  ['Data','Categoria','Importo','Descrizione'].forEach(c => {
    h += '<th style="padding:6px 8px;text-align:left;border-bottom:0.5px solid var(--border);font-weight:600">' + c + '</th>';
  });
  h += '</tr></thead><tbody>';
  movimenti.slice(0, 30).forEach(m => {
    const color = m.importo < 0 ? '#0a7a3a' : '#A32D2D';
    h += '<tr>';
    h += '<td style="padding:5px 8px;border-bottom:0.5px solid var(--border);white-space:nowrap">' + _imeFmtDate(m.data_movimento) + '</td>';
    h += '<td style="padding:5px 8px;border-bottom:0.5px solid var(--border);font-size:10px">' + _imeCategoriaLabel(m.categoria) + '</td>';
    h += '<td style="padding:5px 8px;border-bottom:0.5px solid var(--border);text-align:right;color:' + color + ';font-weight:600">' + fmtE(m.importo) + '</td>';
    h += '<td style="padding:5px 8px;border-bottom:0.5px solid var(--border);font-size:10px;color:var(--text-muted);max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + _bvEscape((m.descrizione || '').substring(0, 80)) + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table></div>';

  // Avviso anti-duplicati
  h += '<div style="background:rgba(99,56,6,0.08);border-left:3px solid #633806;padding:10px 12px;border-radius:0 6px 6px 0;font-size:11.5px;line-height:1.5;margin-bottom:14px">';
  h += '⚠ <b>Anti-duplicati:</b> al salvataggio verranno PRIMA cancellati tutti i movimenti esistenti per questa banca nel mese selezionato, POI inseriti i nuovi. Re-import sicuro.';
  h += '</div>';

  h += '<div style="display:flex;gap:8px">';
  h += '<button onclick="_imeConfermaSalva()" style="background:#0a7a3a;color:white;border:0.5px solid var(--border);border-radius:6px;padding:10px 20px;font-size:12px;font-weight:600;cursor:pointer">✓ Conferma e salva</button>';
  h += '<button onclick="_imeCloseModal()" style="background:var(--bg);color:var(--text);border:0.5px solid var(--border);border-radius:6px;padding:10px 20px;font-size:12px;cursor:pointer">Annulla</button>';
  h += '</div>';

  box.innerHTML = h;
}

// ── CONFERMA E SALVA: insert + aggregazione ────────────────────────────────
async function _imeConfermaSalva() {
  if (!_imeParsedMovimenti || !_imeParsedMovimenti.length) return;

  const box = document.getElementById('ime-anteprima');
  box.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:12px">⏳ Salvataggio in corso...</div>';

  try {
    // 1) DELETE movimenti esistenti per banca/mese (anti-duplicati)
    const firstDay = _imeAnno + '-' + String(_imeMese).padStart(2, '0') + '-01';
    const nextMese = _imeMese === 12 ? 1 : (_imeMese + 1);
    const nextAnno = _imeMese === 12 ? (_imeAnno + 1) : _imeAnno;
    const firstDayNext = nextAnno + '-' + String(nextMese).padStart(2, '0') + '-01';

    const delRes = await sb.from('banche_movimenti_costi')
      .delete()
      .eq('banca_id', _imeBancaId)
      .gte('data_movimento', firstDay)
      .lt('data_movimento', firstDayNext);
    if (delRes.error) throw new Error('Delete: ' + delRes.error.message);

    // 2) INSERT nuovi movimenti
    const insRes = await sb.from('banche_movimenti_costi').insert(_imeParsedMovimenti);
    if (insRes.error) throw new Error('Insert: ' + insRes.error.message);

    // 3) Aggrega tutti i movimenti dell'anno per la banca → query SUM per categoria
    const annoStart = _imeAnno + '-01-01';
    const annoEnd   = (_imeAnno + 1) + '-01-01';
    const aggrRes = await sb.from('banche_movimenti_costi')
      .select('categoria, importo')
      .eq('banca_id', _imeBancaId)
      .gte('data_movimento', annoStart)
      .lt('data_movimento', annoEnd);
    if (aggrRes.error) throw new Error('Aggregate: ' + aggrRes.error.message);

    const agg = {};
    aggrRes.data.forEach(m => {
      agg[m.categoria] = (agg[m.categoria] || 0) + Number(m.importo);
    });

    // Calcolo i campi della valutazione
    const interessi_mutui    = agg['interessi_mutui']    || 0;
    const interessi_anticipi = agg['interessi_anticipi'] || 0;
    const cdf_totali         = agg['cdf']                || 0;
    const canoni_bolli_spese = (agg['canoni']||0) + (agg['polizze']||0) + (agg['bonifici_adue']||0)
                             + (agg['bolli_ec']||0) + (agg['bolli_derivati']||0) + (agg['inbiz_firma']||0);
    const differenziali_irs  = agg['differenziali_irs']  || 0;
    const altri_costi_netti  = (agg['assegni_impagati']||0) + (agg['oneri_tardivo']||0) + (agg['altro']||0);
    const costo_bancario_totale = interessi_mutui + interessi_anticipi + cdf_totali
                                + canoni_bolli_spese + differenziali_irs + altri_costi_netti;

    // 4) Costruisci breakdown costi_accessori_dettaglio (JSON granulare per UI)
    const accessoriBreakdown = [];
    if (agg['canoni'])         accessoriBreakdown.push({ voce: 'Canoni mensili',                        importo: agg['canoni'] });
    if (agg['polizze'])        accessoriBreakdown.push({ voce: 'Premi polizza obbligatoria',            importo: agg['polizze'] });
    if (agg['bonifici_adue'])  accessoriBreakdown.push({ voce: 'Commissioni bonifici/ADUE/istantanei',  importo: agg['bonifici_adue'] });
    if (agg['bolli_ec'])       accessoriBreakdown.push({ voce: 'Bolli E/C trimestrali',                 importo: agg['bolli_ec'] });
    if (agg['bolli_derivati']) accessoriBreakdown.push({ voce: 'Bolli imposta su derivati IRS',         importo: agg['bolli_derivati'] });
    if (agg['inbiz_firma'])    accessoriBreakdown.push({ voce: 'Servizi Inbiz e firma digitale',        importo: agg['inbiz_firma'] });
    if (agg['assegni_impagati']) accessoriBreakdown.push({ voce: 'Commissioni assegni impagati',        importo: agg['assegni_impagati'] });
    if (agg['oneri_tardivo'])  accessoriBreakdown.push({ voce: 'Oneri per tardivo pagamento (a credito)', importo: agg['oneri_tardivo'] });

    // 5) UPSERT su banche_valutazioni_periodi
    const upsertPayload = {
      banca_id:              _imeBancaId,
      anno:                  _imeAnno,
      costo_bancario_totale: Number(costo_bancario_totale.toFixed(2)),
      interessi_mutui:       Number(interessi_mutui.toFixed(2)),
      interessi_anticipi:    Number(interessi_anticipi.toFixed(2)),
      cdf_totali:            Number(cdf_totali.toFixed(2)),
      canoni_bolli_spese:    Number(canoni_bolli_spese.toFixed(2)),
      differenziali_irs:     Number(differenziali_irs.toFixed(2)),
      altri_costi_netti:     Number(altri_costi_netti.toFixed(2)),
      costi_accessori_dettaglio: accessoriBreakdown,
      updated_at:            new Date().toISOString()
    };
    const upsertRes = await sb.from('banche_valutazioni_periodi')
      .upsert(upsertPayload, { onConflict: 'banca_id,anno' });
    if (upsertRes.error) throw new Error('Upsert valutazione: ' + upsertRes.error.message);

    // 6) Successo: chiudi modal e refresh tab
    box.innerHTML = '<div style="padding:18px;background:rgba(10,122,58,0.1);border-left:3px solid #0a7a3a;border-radius:0 6px 6px 0;font-size:12.5px;line-height:1.55"><b>✓ Salvataggio completato</b><br>' + _imeParsedMovimenti.length + ' movimenti importati. Aggregati annuali ' + _imeAnno + ' aggiornati. Costo bancario anno: <b>' + fmtE(costo_bancario_totale) + '</b>.</div>';
    setTimeout(() => {
      _imeCloseModal();
      _bvSelectedAnno = _imeAnno;
      if (typeof renderBancheValutazioni === 'function') renderBancheValutazioni();
    }, 1800);
  } catch (e) {
    box.innerHTML = '<div style="padding:14px;background:rgba(163,45,45,0.08);border-left:3px solid #A32D2D;border-radius:0 6px 6px 0;font-size:12px;color:#A32D2D">❌ Errore: ' + (e.message || e) + '</div>';
  }
}

// ── HELPERS ────────────────────────────────────────────────────────────────
function _imeParseData(v) {
  if (!v) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
    return y + '-' + m + '-' + d;
  }
  const s = String(v).trim();
  // Formato Intesa: GG.MM.AAAA
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/);
  if (m) return m[3] + '-' + m[2].padStart(2, '0') + '-' + m[1].padStart(2, '0');
  // ISO: AAAA-MM-GG
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return m[0];
  return null;
}

function _imeEstraiInteressi(descrizione) {
  if (!descrizione) return null;
  // Cerca pattern "INTERESSI N,NN" o "INTERESSI N.NNN,NN"
  const m = descrizione.match(/INTERESSI[\s:]+([\d.]+,\d{2})/i);
  if (m) {
    return parseFloat(m[1].replace(/\./g, '').replace(',', '.'));
  }
  const m2 = descrizione.match(/INTERESSI[\s:]+([\d]+\.\d{2})/i);
  if (m2) return parseFloat(m2[1]);
  return null;
}

function _imeEstraiRiferimento(causale, descrizione) {
  if (!descrizione) return null;
  // Mutuo: estrai n° mutuo "MUTUO 17093326"
  if (causale.startsWith('015 - 65')) {
    const m = descrizione.match(/MUTUO\s+(\d+)/i);
    if (m) return 'Mutuo ' + m[1];
  }
  return null;
}

function _imeCategoriaLabel(cat) {
  const labels = {
    'interessi_mutui':    'Interessi mutui',
    'interessi_anticipi': 'Interessi anticipi',
    'cdf':                'CDF trimestrali',
    'canoni':             'Canoni mensili',
    'polizze':            'Polizze',
    'bonifici_adue':      'Bonifici / ADUE',
    'bolli_ec':           'Bolli E/C',
    'bolli_derivati':     'Bolli derivati',
    'inbiz_firma':        'Inbiz / firma',
    'differenziali_irs':  'Differenziali IRS',
    'assegni_impagati':   'Assegni impagati',
    'oneri_tardivo':      'Oneri tardivo pag.',
    'altro':              'Altro'
  };
  return labels[cat] || cat;
}

function _imeFmtDate(d) {
  if (!d) return '';
  try { return new Date(d).toLocaleDateString('it-IT'); } catch(e) { return d; }
}
