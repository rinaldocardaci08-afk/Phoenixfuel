// ═══════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Stampa PDF Banca Anticipi (Patch v20260503e)
// ═══════════════════════════════════════════════════════════════════════════
// Generazione moduli PDF stampabili (window.print()) per richiesta
// anticipazione banca. 3 layout:
//   - MPS (Mod. 8239_1) — formato ufficiale, 1 pagina
//   - BCC (modello A) — formato ufficiale
//   - Generico — fallback per Intesa, BNL, altre banche
//
// Selezione automatica in base al nome banca della presentazione.
// Dati anagrafici azienda + parametri banca-specifici sono COSTANTI in cima
// al file (modificabili in un solo punto).
// ═══════════════════════════════════════════════════════════════════════════


// ────────────────────────────────────────────────────────────────────────
// COSTANTI (modificare qui se cambiano dati anagrafici)
// ────────────────────────────────────────────────────────────────────────
var ANT_STAMPA_AZIENDA = {
  ragioneSociale: 'PHOENIX FUEL S.r.l.',
  ragioneSocialeUC: 'PHOENIX FUEL SRL',
  indirizzo: 'Zona Industriale snc',
  cap: '89900',
  citta: 'Vibo Valentia',
  provincia: 'VV',
  // BCC ha indirizzo diverso (Porto Salvo) sul modulo originale
  indirizzoBcc: 'Zona Industriale Porto Salvo'
};

var ANT_STAMPA_BANCHE = {
  mps: {
    matchKeywords: ['mps', 'monte dei paschi', 'monte paschi'],
    nomeUfficiale: 'Banca Monte dei Paschi di Siena S.p.A.',
    filiale: 'C.PMI LAMEZIA TERME',
    contratto: '107096019.65',
    contoCorrente: '18022.11',
    layout: 'mps'
  },
  bcc: {
    matchKeywords: ['bcc', 'credito cooperativo', 'cittanova'],
    nomeUfficiale: 'BANCA DI CREDITO COOPERATIVO',
    sottotitolo: 'DI CITTANOVA',
    filiale: 'Filiale di Polistena RC',
    layout: 'bcc'
  }
  // Tutte le altre cadono in layout 'generico'
};


// ────────────────────────────────────────────────────────────────────────
// Helper: numero in lettere (italiano)
// Funziona fino a miliardi. Formato finale: "ventiduemilacinquecento/00"
// ────────────────────────────────────────────────────────────────────────
function _antNumeroInLettere(n) {
  if (n === 0) return 'zero/00';

  var unita = ['', 'uno', 'due', 'tre', 'quattro', 'cinque', 'sei', 'sette', 'otto', 'nove'];
  var teen = ['dieci', 'undici', 'dodici', 'tredici', 'quattordici', 'quindici', 'sedici', 'diciassette', 'diciotto', 'diciannove'];
  var decine = ['', '', 'venti', 'trenta', 'quaranta', 'cinquanta', 'sessanta', 'settanta', 'ottanta', 'novanta'];

  function fino999(num) {
    if (num === 0) return '';
    var risultato = '';
    var c = Math.floor(num / 100);
    var resto = num % 100;
    var d = Math.floor(resto / 10);
    var u = resto % 10;

    // Centinaia
    if (c === 1) risultato += 'cento';
    else if (c > 1) risultato += unita[c] + 'cento';

    // Decine + unità
    if (resto >= 10 && resto < 20) {
      risultato += teen[resto - 10];
    } else {
      if (d >= 2) {
        var dec = decine[d];
        // Elisione vocale: "ventuno" non "ventiuno", "trentotto" non "trentaotto"
        if (u === 1 || u === 8) dec = dec.substring(0, dec.length - 1);
        risultato += dec;
      }
      if (u > 0) risultato += unita[u];
    }
    return risultato;
  }

  // Separo intero e decimali
  var intero = Math.floor(Math.abs(n));
  var dec = Math.round((Math.abs(n) - intero) * 100);
  var decStr = (dec < 10 ? '0' : '') + dec;

  if (intero === 0) return 'zero/' + decStr;

  // Decompongo per scaglioni: miliardi / milioni / migliaia / unità
  var parti = [];
  var miliardi = Math.floor(intero / 1000000000);
  var milioni = Math.floor((intero / 1000000) % 1000);
  var migliaia = Math.floor((intero / 1000) % 1000);
  var unitaB = intero % 1000;

  if (miliardi > 0) {
    if (miliardi === 1) parti.push('unmiliardo');
    else parti.push(fino999(miliardi) + 'miliardi');
  }
  if (milioni > 0) {
    if (milioni === 1) parti.push('unmilione');
    else parti.push(fino999(milioni) + 'milioni');
  }
  if (migliaia > 0) {
    if (migliaia === 1) parti.push('mille');
    else parti.push(fino999(migliaia) + 'mila');
  }
  if (unitaB > 0) {
    parti.push(fino999(unitaB));
  }

  var lettere = parti.join('');
  return lettere + '/' + decStr;
}


// ────────────────────────────────────────────────────────────────────────
// Helper: formattazione importo italiano "12.500,00"
// ────────────────────────────────────────────────────────────────────────
function _antFmtImporto(n) {
  return Number(n || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function _antFmtData(iso) {
  if (!iso) return '—';
  var p = String(iso).substring(0, 10).split('-');
  if (p.length !== 3) return iso;
  return p[2] + '/' + p[1] + '/' + p[0];
}

function _antEsc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}


// ────────────────────────────────────────────────────────────────────────
// Selezione layout in base al nome banca
// ────────────────────────────────────────────────────────────────────────
function _antDeterminaLayoutBanca(nomeBanca) {
  if (!nomeBanca) return { layout: 'generico', dati: null };
  var nm = nomeBanca.toLowerCase();
  for (var key in ANT_STAMPA_BANCHE) {
    var b = ANT_STAMPA_BANCHE[key];
    var match = b.matchKeywords.some(function(kw) { return nm.indexOf(kw) >= 0; });
    if (match) return { layout: b.layout, dati: b };
  }
  return { layout: 'generico', dati: { nomeUfficiale: nomeBanca } };
}


// ────────────────────────────────────────────────────────────────────────
// MAIN: stampa PDF per una presentazione
// ────────────────────────────────────────────────────────────────────────
async function _antStampaPdfBanca(presentazioneId) {
  if (!presentazioneId) return;
  if (typeof toast === 'function') toast('⏳ Generazione PDF...');

  // Carico presentazione + fatture + cliente per ognuna + banca
  var resP = await sb.from('anticipi_sbf_presentazioni').select('*').eq('id', presentazioneId).single();
  if (resP.error || !resP.data) { if (typeof toast === 'function') toast('Modulo non trovato'); return; }
  var p = resP.data;

  // Carico le righe fatture della presentazione
  var resF = await sb.from('anticipi_sbf_fatture').select('*').eq('presentazione_id', presentazioneId).neq('stato', 'esclusa').order('scadenza_banca', { ascending: true });
  var fattureSbf = resF.data || [];
  if (fattureSbf.length === 0) {
    if (typeof toast === 'function') toast('⚠ Nessuna fattura inclusa nella presentazione');
    return;
  }

  // Carico dati banca dall'affidamento
  var aff = (typeof _bancheAffidamenti !== 'undefined' ? _bancheAffidamenti : []).find(function(a) { return a.id === p.affidamento_id; }) || {};
  var ist = (typeof _bancheIstituti !== 'undefined' ? _bancheIstituti : []).find(function(i) { return i.id === aff.istituto_id; }) || {};
  var nomeBanca = ist.nome || '—';

  // Carico fatture emesse (per dettaglio cliente, P.IVA, importo IVA inclusa)
  var fattureIds = fattureSbf.map(function(f) { return f.fattura_emessa_id; }).filter(function(x) { return x; });
  var fattureEmesse = [];
  if (fattureIds.length > 0) {
    var resE = await sb.from('fatture_emesse').select('id,numero,anno,data,importo_totale,cessionario_denominazione,cessionario_piva,cliente_id').in('id', fattureIds);
    fattureEmesse = resE.data || [];
  }
  var mappaFatt = {};
  fattureEmesse.forEach(function(f) { mappaFatt[f.id] = f; });

  // Calcolo totali
  var totaleFatture = 0;
  var importoAnticipato = 0;
  fattureSbf.forEach(function(f) {
    var fe = mappaFatt[f.fattura_emessa_id];
    if (fe) totaleFatture += Number(fe.importo_totale || 0);
    importoAnticipato += Number(f.importo_anticipato_calcolato || 0);
  });

  // Determina layout
  var sel = _antDeterminaLayoutBanca(nomeBanca);
  var html = '';

  if (sel.layout === 'mps') {
    html = _antBuildPdfMps(p, fattureSbf, mappaFatt, totaleFatture, importoAnticipato, sel.dati);
  } else if (sel.layout === 'bcc') {
    html = _antBuildPdfBcc(p, fattureSbf, mappaFatt, totaleFatture, importoAnticipato, sel.dati);
  } else {
    html = _antBuildPdfGenerico(p, fattureSbf, mappaFatt, totaleFatture, importoAnticipato, nomeBanca);
  }

  // Apri finestra di stampa
  var w = window.open('', '_blank', 'width=900,height=1100');
  w.document.open();
  w.document.write(html);
  w.document.close();

  if (typeof _auditLog === 'function') {
    _auditLog('anticipi', 'anticipi_sbf_presentazioni', 'Stampa PDF banca per modulo ' + presentazioneId.substring(0,8) + ' (' + sel.layout + ')');
  }
}


// ────────────────────────────────────────────────────────────────────────
// CSS comune per le stampe
// ────────────────────────────────────────────────────────────────────────
function _antStampaCSS() {
  return '<style>' +
    '@page { size: A4; margin: 14mm; }' +
    '* { box-sizing: border-box; }' +
    'body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1a2332; margin: 0; padding: 0; font-size: 11pt; line-height: 1.45; }' +
    '.tbl { width: 100%; border-collapse: collapse; font-size: 9.5pt; }' +
    '.tbl th { background: #f0efe8; border: 0.5px solid #888; padding: 5px 6px; text-align: left; font-weight: 600; font-size: 9pt; }' +
    '.tbl td { border: 0.5px solid #888; padding: 4px 6px; }' +
    '.tbl .num { font-family: "SF Mono", Monaco, monospace; text-align: right; }' +
    '.tbl .center { text-align: center; }' +
    '.totale { background: #f5f5f5; font-weight: 600; }' +
    '.field { border-bottom: 1px solid #000; padding: 0 8px; display: inline-block; min-width: 60px; }' +
    '.no-print { position: fixed; bottom: 20px; right: 20px; }' +
    '.no-print button { padding: 8px 16px; margin: 0 4px; border: none; border-radius: 6px; cursor: pointer; font-size: 11pt; font-weight: 500; }' +
    '@media print { .no-print { display: none !important; } }' +
    '</style>';
}

function _antStampaFooterButtons() {
  return '<div class="no-print">' +
    '<button onclick="window.print()" style="background:#185FA5;color:white">🖨️ Stampa</button>' +
    '<button onclick="window.close()" style="background:#A32D2D;color:white">✕ Chiudi</button>' +
    '</div>' +
    '<script>window.onload=function(){setTimeout(function(){window.print()},500)}</' + 'script>';
}


// ────────────────────────────────────────────────────────────────────────
// LAYOUT 1: MPS (Mod. 8239_1) — 1 pagina
// ────────────────────────────────────────────────────────────────────────
function _antBuildPdfMps(p, fattureSbf, mappaFatt, totaleFatture, importoAnt, dati) {
  var dataStampa = _antFmtData((p.data_presentazione || new Date().toISOString().split('T')[0]));
  var scadenzaPrev = _antFmtData(p.scadenza_banca_default || '');
  var importoNum = _antFmtImporto(importoAnt);
  var importoLet = _antNumeroInLettere(importoAnt);

  var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Richiesta anticipi MPS — ' + dataStampa + '</title>';
  html += _antStampaCSS();
  html += '</head><body>';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:14px;font-size:10pt">';
  html += '<div style="font-size:18pt;letter-spacing:-2px">▦▦</div>';
  html += '<div style="text-align:right">';
  html += '<div><strong>Alla ' + _antEsc(dati.nomeUfficiale) + '</strong></div>';
  html += '<div><strong>Filiale di</strong> ' + _antEsc(dati.filiale) + '</div>';
  html += '</div></div>';

  // Box cedente / oggetto
  html += '<table style="width:100%;border-collapse:collapse;border:0.5px solid #888;margin-bottom:12px;font-size:10pt">';
  html += '<tr>';
  html += '<td style="border:0.5px solid #888;padding:7px 9px;width:50%">Cedente<br/>';
  html += '<strong>' + _antEsc(ANT_STAMPA_AZIENDA.ragioneSocialeUC) + '</strong><br/>';
  html += _antEsc(ANT_STAMPA_AZIENDA.indirizzo.toUpperCase()) + '<br/>';
  html += _antEsc(ANT_STAMPA_AZIENDA.citta.toUpperCase()) + '</td>';
  html += '<td style="border:0.5px solid #888;padding:7px 9px"><strong>OGGETTO:</strong><br/>Anticipazione contro cessione di credito</td>';
  html += '</tr></table>';

  // Paragrafo principale
  html += '<div style="font-size:10pt;line-height:1.55;text-align:justify;margin-bottom:10px">';
  html += 'In dipendenza di quanto convenuto nel contratto relativo al rapporto SI nr. <strong>' + _antEsc(dati.contratto) + '</strong>, ';
  html += 'avente oggetto "anticipazioni contro cessione di credito", Vi preghiamo di volerci accordare un\'anticipazione per l\'importo ed alle ';
  html += 'condizioni precisate in calce alla presente e secondo le norme pattuite, che con la presente confermiamo anche ai sensi dell\'art.1341 c.c., ';
  html += 'contro cessione pro solvendo del nostro credito di Euro <span class="field"><strong>' + importoNum + '</strong></span> ';
  html += '(Euro <span class="field"><strong>' + _antEsc(importoLet) + '</strong></span>) verso quanto indicato in oggetto.';
  html += '</div>';

  // Checkbox
  html += '<div style="font-size:10pt;margin-bottom:8px">';
  html += '<span style="display:inline-block;width:11px;height:11px;border:1px solid #000;text-align:center;line-height:9px;margin-right:4px;vertical-align:middle">&nbsp;</span> relativo alle forniture/contratti risultanti dall\'elenco allegato.<br/>';
  html += '<span style="display:inline-block;width:11px;height:11px;border:1px solid #000;background:#000;color:white;text-align:center;line-height:9px;margin-right:4px;vertical-align:middle;font-size:9pt">✓</span> relativo alle forniture risultanti dalle seguenti fatture:';
  html += '</div>';

  // Tabella fatture (15 righe come da modulo originale)
  html += '<table class="tbl" style="margin-bottom:12px">';
  html += '<thead><tr>';
  html += '<th style="width:32px">Fatt.</th>';
  html += '<th>Numero</th>';
  html += '<th>Data</th>';
  html += '<th>Debitore ceduto</th>';
  html += '<th>Importo IVA incl.</th>';
  html += '<th>Scadenza</th>';
  html += '</tr></thead><tbody>';

  for (var i = 0; i < 15; i++) {
    var f = fattureSbf[i];
    if (f) {
      var fe = mappaFatt[f.fattura_emessa_id] || {};
      html += '<tr>';
      html += '<td class="center">' + (i + 1) + '</td>';
      html += '<td>' + _antEsc((fe.numero || '') + '/' + (fe.anno || '')) + '</td>';
      html += '<td>' + _antFmtData(fe.data || '') + '</td>';
      html += '<td>' + _antEsc((fe.cessionario_denominazione || '—').substring(0, 40)) + '</td>';
      html += '<td class="num">' + _antFmtImporto(fe.importo_totale || 0) + '</td>';
      html += '<td>' + _antFmtData(f.scadenza_banca || '') + '</td>';
      html += '</tr>';
    } else {
      html += '<tr><td class="center">' + (i + 1) + '</td><td>&nbsp;</td><td></td><td></td><td></td><td></td></tr>';
    }
  }
  html += '</tbody></table>';

  // Condizioni
  html += '<div style="text-align:center;font-size:10pt;font-weight:600;margin:12px 0 8px;letter-spacing:0.5px">CONDIZIONI PER L\'OPERAZIONE</div>';
  html += '<div style="font-size:10pt;margin-bottom:8px">';
  html += 'Importo dell\'anticipazione: Euro <span class="field"><strong>' + importoNum + '</strong></span> ';
  html += '(Euro <span class="field"><strong>' + _antEsc(importoLet) + '</strong></span>) ';
  html += 'con scadenza <span class="field"><strong>' + scadenzaPrev + '</strong></span>.';
  html += '</div>';

  html += '<div style="font-size:9pt;line-height:1.5;text-align:justify;color:#444;margin-bottom:10px">';
  html += 'All\'operazione si applicano il tasso ordinario e le altre condizioni di cui al contratto sopra richiamato. In ogni caso, il tasso di ';
  html += 'interesse applicato alla presente richiesta di anticipazione non potrà essere inferiore alla misura dello spread come in precedenza indicata. ';
  html += 'Resta inteso che per estinguere il debito riveniente dall\'anticipazione la Banca, alla scadenza dell\'anticipazione stessa, potrà addebitare ';
  html += 'in qualunque momento il relativo importo, senza necessità di costituzione in mora, sul conto corrente n. <strong>' + _antEsc(dati.contoCorrente) + '</strong> ';
  html += 'a noi intestato. Restano comunque confermate le garanzie che assistono il rapporto anticipi fino a completa estinzione dell\'anticipazione.';
  html += '</div>';

  // Firme
  html += '<div style="margin-top:18px;font-size:10pt">';
  html += '<div style="display:flex;justify-content:space-between;margin-bottom:14px">';
  html += '<div>Data <span class="field"><strong>' + dataStampa + '</strong></span></div>';
  html += '<div>(Firma) <span class="field" style="min-width:200px">&nbsp;</span></div>';
  html += '</div>';
  html += '<div style="font-size:9pt;color:#444">Dichiariamo di aver trattenuto copia del presente documento.</div>';
  html += '<div style="display:flex;justify-content:space-between;margin-top:14px">';
  html += '<div>Data <span class="field"><strong>' + dataStampa + '</strong></span></div>';
  html += '<div>(Firma) <span class="field" style="min-width:200px">&nbsp;</span></div>';
  html += '</div>';
  html += '</div>';

  // Footer
  html += '<div style="border-top:0.5px solid #ccc;margin-top:16px;padding-top:6px;font-size:8.5pt;color:#999;text-align:center">';
  html += 'Mod. 8239_1 — Richiesta anticipi su fatture commerciali — Copia per la Banca';
  html += '</div>';

  html += _antStampaFooterButtons();
  html += '</body></html>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// LAYOUT 2: BCC (modello A)
// ────────────────────────────────────────────────────────────────────────
function _antBuildPdfBcc(p, fattureSbf, mappaFatt, totaleFatture, importoAnt, dati) {
  var dataStampa = _antFmtData((p.data_presentazione || new Date().toISOString().split('T')[0]));
  var importoNum = _antFmtImporto(importoAnt);

  var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Richiesta anticipi BCC — ' + dataStampa + '</title>';
  html += _antStampaCSS();
  html += '</head><body>';

  // Header (modello A)
  html += '<div style="text-align:right;font-size:10pt;color:#666;margin-bottom:8px">(modello A)</div>';

  html += '<div style="display:flex;justify-content:space-between;margin-bottom:18px;font-size:10pt">';
  html += '<div>';
  html += '<div style="color:#666">Mitt</div>';
  html += '<div style="font-weight:500;margin-top:2px">' + _antEsc(ANT_STAMPA_AZIENDA.ragioneSociale) + '</div>';
  html += '<div>' + _antEsc(ANT_STAMPA_AZIENDA.indirizzoBcc) + '</div>';
  html += '<div>' + _antEsc(ANT_STAMPA_AZIENDA.cap) + ' ' + _antEsc(ANT_STAMPA_AZIENDA.citta) + '</div>';
  html += '<div style="margin-top:10px">' + _antEsc(ANT_STAMPA_AZIENDA.citta) + ', lì <strong class="field">' + dataStampa + '</strong></div>';
  html += '</div>';
  html += '<div style="margin-top:14px">';
  html += '<div>Spett/le</div>';
  html += '<div style="font-weight:500;margin-top:2px">' + _antEsc(dati.nomeUfficiale) + '</div>';
  html += '<div style="font-weight:500">' + _antEsc(dati.sottotitolo) + '</div>';
  html += '<div style="margin-top:2px">' + _antEsc(dati.filiale) + '</div>';
  html += '</div>';
  html += '</div>';

  // Titolo
  html += '<div style="font-size:13pt;font-weight:500;text-align:center;margin:16px 0 14px">Richiesta anticipazione su fatture</div>';

  // Paragrafo 1
  html += '<div style="font-size:10pt;line-height:1.55;text-align:justify;margin-bottom:12px">';
  html += 'Con riferimento alla linea di credito accordataci a valere sul c/ anticipi presso di Voi, Vi chiediamo l\'anticipazione dell\'importo di ';
  html += '€ <span class="field"><strong>' + importoNum + '</strong></span> a fronte della complessiva somma rappresentata dalle seguenti fatture:';
  html += '</div>';

  // Tabella fatture
  html += '<table class="tbl" style="margin-bottom:12px">';
  html += '<thead><tr>';
  html += '<th>N° fattura</th>';
  html += '<th>Data</th>';
  html += '<th>Debitore ceduto</th>';
  html += '<th>Importo</th>';
  html += '<th>Scadenza</th>';
  html += '</tr></thead><tbody>';

  fattureSbf.forEach(function(f) {
    var fe = mappaFatt[f.fattura_emessa_id] || {};
    html += '<tr>';
    html += '<td>' + _antEsc((fe.numero || '') + '/' + (fe.anno || '')) + '</td>';
    html += '<td>' + _antFmtData(fe.data || '') + '</td>';
    html += '<td>' + _antEsc((fe.cessionario_denominazione || '—').substring(0, 50)) + '</td>';
    html += '<td class="num">' + _antFmtImporto(fe.importo_totale || 0) + '</td>';
    html += '<td>' + _antFmtData(f.scadenza_banca || '') + '</td>';
    html += '</tr>';
  });
  html += '<tr class="totale">';
  html += '<td colspan="3" style="text-align:right">TOTALE</td>';
  html += '<td class="num">' + _antFmtImporto(totaleFatture) + '</td>';
  html += '<td>&nbsp;</td>';
  html += '</tr>';
  html += '</tbody></table>';

  // Paragrafi legali
  html += '<div style="font-size:9.5pt;line-height:1.5;text-align:justify;color:#444;margin-bottom:10px">';
  html += 'Resta inteso che l\'anticipazione viene da Voi effettuata con le modalità ed alle condizioni previste nel contratto a suo tempo sottoscritto e successive ';
  html += 'modificazioni comunicate o rese pubbliche ai sensi della normativa vigente.<br/><br/>';
  html += 'Sarà ns/ cura inoltrare ai debitori, ed a Voi per conoscenza, comunicazione della cessione del credito a Vs/ favore nascente dalle menzionate fatture ';
  html += 'fermo restando, comunque, ogni responsabilità e rischio a ns/ carico.<br/><br/>';
  html += 'Tutti gli oneri fiscali e le spese conseguenti all\'operazione, ivi compresa l\'eventuale registrazione della presente, saranno esclusivamente a ns/ carico.';
  html += '</div>';

  // Firma
  html += '<div style="margin-top:18px;font-size:10pt">';
  html += '<div>La Ditta cedente <strong style="margin-left:20px">' + _antEsc(ANT_STAMPA_AZIENDA.ragioneSocialeUC) + '.</strong></div>';
  html += '<div style="margin-top:50px;text-align:right">Firma <span class="field" style="min-width:240px">&nbsp;</span></div>';
  html += '</div>';

  // Box riservato banca
  html += '<div style="border:0.5px solid #888;margin-top:24px;padding:10px 12px;font-size:9pt;background:#fafaf6">';
  html += '<div style="font-weight:500;margin-bottom:8px">Riservato alla Banca</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:18px">';
  html += '<div>';
  html += '<div>VISTO</div>';
  html += '<div style="margin-top:4px">Si propone anticipazione per l\'importo</div>';
  html += '<div>di € <span style="border-bottom:0.5px dotted #888;display:inline-block;min-width:120px">&nbsp;</span></div>';
  html += '<div>Filiale di <span style="border-bottom:0.5px dotted #888;display:inline-block;min-width:120px">&nbsp;</span></div>';
  html += '<div>Data <span style="border-bottom:0.5px dotted #888;display:inline-block;min-width:120px">&nbsp;</span></div>';
  html += '</div>';
  html += '<div>';
  html += '<div>SI AUTORIZZA</div>';
  html += '<div style="margin-top:4px">L\'anticipazione per € <span style="border-bottom:0.5px dotted #888;display:inline-block;min-width:80px">&nbsp;</span></div>';
  html += '<div>(Organo) <span style="border-bottom:0.5px dotted #888;display:inline-block;min-width:60px">&nbsp;</span> (Sigla) <span style="border-bottom:0.5px dotted #888;display:inline-block;min-width:60px">&nbsp;</span></div>';
  html += '<div>Data <span style="border-bottom:0.5px dotted #888;display:inline-block;min-width:120px">&nbsp;</span></div>';
  html += '</div>';
  html += '</div></div>';

  html += _antStampaFooterButtons();
  html += '</body></html>';
  return html;
}


// ────────────────────────────────────────────────────────────────────────
// LAYOUT 3: GENERICO (Intesa, BNL, altre)
// ────────────────────────────────────────────────────────────────────────
function _antBuildPdfGenerico(p, fattureSbf, mappaFatt, totaleFatture, importoAnt, nomeBanca) {
  var dataStampa = _antFmtData((p.data_presentazione || new Date().toISOString().split('T')[0]));
  var importoNum = _antFmtImporto(importoAnt);
  var importoLet = _antNumeroInLettere(importoAnt);

  var html = '<!DOCTYPE html><html lang="it"><head><meta charset="UTF-8"><title>Richiesta anticipi ' + _antEsc(nomeBanca) + ' — ' + dataStampa + '</title>';
  html += _antStampaCSS();
  html += '</head><body>';

  // Header con cedente / banca
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1.5px solid #1a2332;padding-bottom:10px;margin-bottom:14px">';
  html += '<div>';
  html += '<div style="font-weight:500;font-size:14pt">' + _antEsc(ANT_STAMPA_AZIENDA.ragioneSociale) + '</div>';
  html += '<div style="font-size:9pt;color:#666;margin-top:2px">' + _antEsc(ANT_STAMPA_AZIENDA.indirizzo) + ' — ' + _antEsc(ANT_STAMPA_AZIENDA.cap) + ' ' + _antEsc(ANT_STAMPA_AZIENDA.citta) + ' (' + _antEsc(ANT_STAMPA_AZIENDA.provincia) + ')</div>';
  html += '</div>';
  html += '<div style="text-align:right;font-size:10pt">';
  html += '<div><strong>Spett/le</strong></div>';
  html += '<div style="font-weight:500;margin-top:2px">' + _antEsc(nomeBanca.toUpperCase()) + '</div>';
  html += '<div>Filiale di ___________</div>';
  html += '</div></div>';

  // Riga data + protocollo
  html += '<div style="display:flex;justify-content:space-between;font-size:10pt;margin-bottom:14px">';
  html += '<div>' + _antEsc(ANT_STAMPA_AZIENDA.citta) + ', lì <strong class="field">' + dataStampa + '</strong></div>';
  html += '<div>Prot. n. <span class="field" style="min-width:120px">' + _antEsc(p.numero_protocollo || '') + '</span></div>';
  html += '</div>';

  // Titolo
  html += '<div style="font-size:14pt;font-weight:500;text-align:center;margin:14px 0 12px">RICHIESTA DI ANTICIPAZIONE SU FATTURE</div>';

  // Paragrafo intro
  html += '<div style="font-size:10pt;line-height:1.6;text-align:justify;margin-bottom:14px">';
  html += 'Spett/le Banca,<br/><br/>';
  html += 'con la presente richiediamo, ai sensi delle linee di credito accordate sul rapporto di anticipazione su fatture in essere, ';
  html += 'anticipazione per l\'importo di Euro <span class="field"><strong>' + importoNum + '</strong></span> ';
  html += '(in lettere: <strong style="font-style:italic">' + _antEsc(importoLet) + '</strong>) ';
  html += 'relativo al credito di nostra spettanza derivante dalle fatture sotto elencate, di cui alleghiamo copia.';
  html += '</div>';

  // Tabella fatture
  html += '<table class="tbl" style="margin-bottom:14px">';
  html += '<thead><tr>';
  html += '<th>N° / Anno</th>';
  html += '<th>Data fattura</th>';
  html += '<th>Cliente debitore</th>';
  html += '<th>P.IVA / C.F.</th>';
  html += '<th>Importo (€)</th>';
  html += '<th>Scadenza</th>';
  html += '</tr></thead><tbody>';

  fattureSbf.forEach(function(f) {
    var fe = mappaFatt[f.fattura_emessa_id] || {};
    html += '<tr>';
    html += '<td class="num" style="text-align:left">' + _antEsc((fe.numero || '') + '/' + (fe.anno || '')) + '</td>';
    html += '<td>' + _antFmtData(fe.data || '') + '</td>';
    html += '<td>' + _antEsc((fe.cessionario_denominazione || '—').substring(0, 40)) + '</td>';
    html += '<td style="font-family:\'SF Mono\',Monaco,monospace;font-size:9pt">' + _antEsc(fe.cessionario_piva || '—') + '</td>';
    html += '<td class="num">' + _antFmtImporto(fe.importo_totale || 0) + '</td>';
    html += '<td>' + _antFmtData(f.scadenza_banca || '') + '</td>';
    html += '</tr>';
  });
  html += '<tr class="totale">';
  html += '<td colspan="4" style="text-align:right">TOTALE FATTURE CEDUTE</td>';
  html += '<td class="num">' + _antFmtImporto(totaleFatture) + '</td>';
  html += '<td>&nbsp;</td>';
  html += '</tr>';
  html += '</tbody></table>';

  // Paragrafo legale
  html += '<div style="font-size:9.5pt;line-height:1.55;text-align:justify;color:#444;margin-bottom:14px">';
  html += 'L\'operazione viene perfezionata con cessione pro solvendo del credito alla Banca, alle condizioni economiche e contrattuali ';
  html += 'previste dal nostro rapporto di affidamento. Tutti gli oneri fiscali e le spese conseguenti restano a nostro carico. ';
  html += 'Resta inteso che la Banca, alla scadenza dell\'anticipazione, potrà addebitare il relativo importo sul nostro conto corrente. ';
  html += 'Sarà nostra cura inoltrare ai debitori comunicazione della cessione del credito a Vostro favore.';
  html += '</div>';

  // Firma
  html += '<div style="display:flex;justify-content:space-between;margin-top:34px;font-size:10pt">';
  html += '<div>';
  html += '<div>La Ditta cedente</div>';
  html += '<div style="font-weight:500;margin-top:2px">' + _antEsc(ANT_STAMPA_AZIENDA.ragioneSociale) + '</div>';
  html += '</div>';
  html += '<div style="text-align:center">';
  html += '<div>Firma e timbro</div>';
  html += '<div style="border-bottom:0.5px solid #000;width:200px;height:50px;margin-top:4px"></div>';
  html += '</div>';
  html += '</div>';

  // Footer
  html += '<div style="border-top:0.5px solid #ccc;margin-top:22px;padding-top:6px;font-size:8.5pt;color:#999;text-align:center">';
  html += 'PhoenixFuel ERP — Documento generato il ' + _antFmtData(new Date().toISOString().split('T')[0]);
  html += '</div>';

  html += _antStampaFooterButtons();
  html += '</body></html>';
  return html;
}
