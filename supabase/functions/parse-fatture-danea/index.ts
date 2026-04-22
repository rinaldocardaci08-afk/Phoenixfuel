// ═══════════════════════════════════════════════════════════════════════════
// Edge Function: parse-fatture-danea
// ═══════════════════════════════════════════════════════════════════════════
// Obiettivo: ricevere un file ZIP o un singolo XML FatturaPA SDI e parsarli
// in record JSON pronti per essere inseriti nelle tabelle fatture_*
//
// Input (multipart/form-data):
//   - file: ZIP oppure XML
//   - batch_id: UUID (opzionale, generato se assente)
//
// Output JSON:
//   {
//     batch_id: "...",
//     formato: "fatturapa_sdi",
//     fatture: [...],  // array testate + righe + pagamenti già strutturati
//     anomalie: [...],
//     statistiche: { totali, importo_totale, data_min, data_max, ... }
//   }
//
// Deploy:
//   npx supabase functions deploy parse-fatture-danea --no-verify-jwt
// ═══════════════════════════════════════════════════════════════════════════

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { XMLParser } from 'https://esm.sh/fast-xml-parser@4.3.2';
import JSZip from 'https://esm.sh/jszip@3.10.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

// ───────────────────────────────────────────────────────────────────────────
// Regex per estrazione dati da descrizione riga
// ───────────────────────────────────────────────────────────────────────────
const DAS_RE = /DAS\s+(?:del\s+(\d{1,2}\s+[A-Za-zàèéìòù]+\s+\d{4}))?\s*(?:nr|n\.?|numero)?[:\s]*(\d{4,10})/i;
const ORDINE_RE = /Rif\.?\s*Conferma\s+d['']ordine\s+(\d+)\s+del\s+(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/i;

// Mappa nomi mesi italiani → numero
const MESI = {
  'gennaio': 1, 'febbraio': 2, 'marzo': 3, 'aprile': 4, 'maggio': 5, 'giugno': 6,
  'luglio': 7, 'agosto': 8, 'settembre': 9, 'ottobre': 10, 'novembre': 11, 'dicembre': 12
};

// Normalizzazione nome prodotto → categoria PhoenixFuel
function normalizzaProdotto(desc: string): string | null {
  const d = (desc || '').toLowerCase();
  if (d.includes('gasolio') && d.includes('autotraz')) return 'Gas Auto';
  if (d.includes('gasolio') && d.includes('agric')) return 'Gas Agricolo';
  if (d.includes('benzina')) return 'Benzina';
  if (d.includes('hvo')) return 'HVO';
  if (d.includes('adblue') || d.includes('ad blue') || d.includes('ad-blue')) return 'AdBlue';
  return null;
}

// Converte "15 Gennaio 2026" → Date ISO "2026-01-15"
function parseItalianDate(str: string): string | null {
  if (!str) return null;
  const m = str.match(/(\d{1,2})\s+(\w+)\s+(\d{4})/);
  if (!m) return null;
  const giorno = parseInt(m[1]);
  const mese = MESI[m[2].toLowerCase()];
  const anno = parseInt(m[3]);
  if (!mese) return null;
  return `${anno}-${String(mese).padStart(2, '0')}-${String(giorno).padStart(2, '0')}`;
}

// ───────────────────────────────────────────────────────────────────────────
// Parser di una singola fattura XML SDI
// ───────────────────────────────────────────────────────────────────────────
function parseXMLFattura(xmlString: string, filename: string): any {
  const parser = new XMLParser({
    ignoreAttributes: false,
    removeNSPrefix: true,  // rimuove namespace ns3: ecc.
    parseTagValue: false,  // lascia tutto come stringa, convertiamo noi
  });

  let parsed;
  try {
    parsed = parser.parse(xmlString);
  } catch (e) {
    return { errore: `parsing_xml: ${e.message}`, filename };
  }

  const ft = parsed?.FatturaElettronica;
  if (!ft) return { errore: 'root_non_FatturaElettronica', filename };

  const header = ft.FatturaElettronicaHeader;
  const body = Array.isArray(ft.FatturaElettronicaBody)
    ? ft.FatturaElettronicaBody[0]
    : ft.FatturaElettronicaBody;

  if (!body) return { errore: 'body_mancante', filename };

  // ── Cedente (noi - Phoenix Fuel)
  const cedente = header?.CedentePrestatore?.DatiAnagrafici;
  const cedente_piva = cedente?.IdFiscaleIVA?.IdCodice || '';
  const cedente_denom = cedente?.Anagrafica?.Denominazione || '';

  // ── Cessionario (cliente)
  const cess = header?.CessionarioCommittente;
  const cess_anag = cess?.DatiAnagrafici;
  const cess_sede = cess?.Sede;
  const cess_piva = cess_anag?.IdFiscaleIVA?.IdCodice || null;
  const cess_cf = cess_anag?.CodiceFiscale || null;
  let cess_denom = cess_anag?.Anagrafica?.Denominazione;
  if (!cess_denom) {
    const nome = cess_anag?.Anagrafica?.Nome || '';
    const cognome = cess_anag?.Anagrafica?.Cognome || '';
    cess_denom = `${cognome} ${nome}`.trim();
  }

  // ── Dati generali documento
  const dg = body.DatiGenerali?.DatiGeneraliDocumento;
  if (!dg) return { errore: 'dati_generali_mancanti', filename };

  // ── Righe
  const dettaglioLinee = body.DatiBeniServizi?.DettaglioLinee;
  const linee = Array.isArray(dettaglioLinee) ? dettaglioLinee : (dettaglioLinee ? [dettaglioLinee] : []);

  const righe = [];
  for (const l of linee) {
    const desc = l.Descrizione || '';
    const qta = parseFloat(l.Quantita || '0') || null;
    const prezzo_t = parseFloat(l.PrezzoTotale || '0') || 0;

    // Estrai DAS dalla descrizione
    const mDas = desc.match(DAS_RE);
    let das_data = null;
    let das_nr = null;
    if (mDas) {
      das_data = parseItalianDate(mDas[1] || '');
      das_nr = mDas[2] || null;
    }

    // Estrai riferimento ordine Danea
    const mOrd = desc.match(ORDINE_RE);
    const ordineDaneaNum = mOrd ? mOrd[1] : null;
    let ordineDaneaData = null;
    if (mOrd && mOrd[2]) {
      const p = mOrd[2].split(/[\/\-\.]/);
      if (p.length === 3) {
        const yy = p[2].length === 2 ? '20' + p[2] : p[2];
        ordineDaneaData = `${yy}-${p[1].padStart(2, '0')}-${p[0].padStart(2, '0')}`;
      }
    }

    righe.push({
      numero_linea: parseInt(l.NumeroLinea || '0'),
      descrizione: desc,
      prodotto_normalizzato: (qta && qta > 0) ? normalizzaProdotto(desc) : null,
      codice_articolo: l.CodiceArticolo?.CodiceValore || null,
      quantita: qta,
      unita_misura: l.UnitaMisura || null,
      prezzo_unitario: parseFloat(l.PrezzoUnitario || '0') || null,
      prezzo_totale: prezzo_t,
      aliquota_iva: parseFloat(l.AliquotaIVA || '0') || null,
      das_numero_dogane: das_nr,
      das_data_str: mDas ? mDas[1] : null,
      das_data: das_data,
      ordine_danea_numero: ordineDaneaNum,
      ordine_danea_data: ordineDaneaData,
    });
  }

  // ── Riepilogo IVA
  const datiRiep = body.DatiBeniServizi?.DatiRiepilogo;
  const riepArr = Array.isArray(datiRiep) ? datiRiep : (datiRiep ? [datiRiep] : []);
  let imponibile_totale = 0;
  let iva_totale = 0;
  for (const r of riepArr) {
    imponibile_totale += parseFloat(r.ImponibileImporto || '0') || 0;
    iva_totale += parseFloat(r.Imposta || '0') || 0;
  }

  // ── Pagamenti
  const datiPag = body.DatiPagamento;
  const pagArr = Array.isArray(datiPag) ? datiPag : (datiPag ? [datiPag] : []);
  const pagamenti = [];
  for (const dp of pagArr) {
    const condizioni = dp.CondizioniPagamento || null;
    const dettagli = Array.isArray(dp.DettaglioPagamento)
      ? dp.DettaglioPagamento
      : (dp.DettaglioPagamento ? [dp.DettaglioPagamento] : []);
    for (const d of dettagli) {
      pagamenti.push({
        condizioni_pagamento: condizioni,
        modalita_pagamento: d.ModalitaPagamento || null,
        data_scadenza: d.DataScadenzaPagamento || null,
        importo: parseFloat(d.ImportoPagamento || '0') || 0,
        istituto_finanziario: d.IstitutoFinanziario || null,
        iban: d.IBAN || null,
        abi: d.ABI || null,
        cab: d.CAB || null,
      });
    }
  }

  return {
    filename: filename,
    fattura: {
      numero: String(dg.Numero || ''),
      data: dg.Data || null,
      tipo_documento: dg.TipoDocumento || null,
      divisa: dg.Divisa || 'EUR',
      cedente_piva: cedente_piva,
      cedente_denominazione: cedente_denom,
      cessionario_piva: cess_piva,
      cessionario_codfiscale: cess_cf,
      cessionario_denominazione: cess_denom || '?',
      cessionario_indirizzo: cess_sede?.Indirizzo || null,
      cessionario_cap: cess_sede?.CAP || null,
      cessionario_comune: cess_sede?.Comune || null,
      cessionario_provincia: cess_sede?.Provincia || null,
      cessionario_nazione: cess_sede?.Nazione || 'IT',
      importo_totale: parseFloat(dg.ImportoTotaleDocumento || '0') || 0,
      imponibile_totale: imponibile_totale || null,
      iva_totale: iva_totale || null,
    },
    righe: righe,
    pagamenti: pagamenti,
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Handler principale
// ───────────────────────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    if (!file) {
      return new Response(JSON.stringify({ errore: 'file_mancante' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    const buffer = await file.arrayBuffer();
    const filename = file.name;

    let xmlFiles: { name: string; content: string }[] = [];

    // Determina se è ZIP o XML singolo
    if (filename.toLowerCase().endsWith('.zip')) {
      const zip = await JSZip.loadAsync(buffer);
      for (const [name, entry] of Object.entries(zip.files)) {
        if (name.toLowerCase().endsWith('.xml') && !entry.dir) {
          const content = await entry.async('string');
          xmlFiles.push({ name, content });
        }
      }
    } else if (filename.toLowerCase().endsWith('.xml')) {
      const decoder = new TextDecoder('utf-8');
      xmlFiles.push({ name: filename, content: decoder.decode(buffer) });
    } else {
      return new Response(JSON.stringify({ errore: 'formato_non_supportato' }), {
        status: 400,
        headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
      });
    }

    // Parsing di ogni XML
    const fatture = [];
    const anomalie = [];
    for (const xf of xmlFiles) {
      const res = parseXMLFattura(xf.content, xf.name);
      if (res.errore) {
        anomalie.push({ filename: xf.name, errore: res.errore });
      } else {
        fatture.push(res);
      }
    }

    // Statistiche
    const importoTotale = fatture.reduce((s, f) => s + (f.fattura.importo_totale || 0), 0);
    const date = fatture.map(f => f.fattura.data).filter(d => d).sort();
    const fatturePiva = new Set(fatture.map(f => f.fattura.cessionario_piva).filter(p => p));
    const fattureDenom = new Set(fatture.map(f => f.fattura.cessionario_denominazione));
    const tipi = {};
    fatture.forEach(f => {
      const t = f.fattura.tipo_documento || '?';
      tipi[t] = (tipi[t] || 0) + 1;
    });

    const result = {
      batch_id: crypto.randomUUID(),
      formato: 'fatturapa_sdi',
      fatture: fatture,
      anomalie: anomalie,
      statistiche: {
        file_totali: xmlFiles.length,
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

    return new Response(JSON.stringify(result), {
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });

  } catch (e) {
    return new Response(JSON.stringify({ errore: 'eccezione', dettaglio: e.message, stack: e.stack }), {
      status: 500,
      headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
    });
  }
});
