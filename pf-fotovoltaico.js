// v20261029e — PVGIS: "📄 Carica PDF PVGIS" nella scheda offerta legge il PDF (pdf.js in lib/), salva i dati in
//   fv_offerte.pvgis e il PDF nello spazio file fv-documenti; la produzione annua segue la potenza kWp.
//   Nel preventivo stampato: pagina "Produzione di energia elettrica" con grafico mensile e giornaliero.
// v20261029d — OFFERTE: ✏️ e 🗑️ nella lista, 🗑️ Elimina nella scheda (bloccato se c'e' gia' il contratto).
// v20261029c — PREVENTIVO STANDARD (formato DS Energy 10/09/2026, impaginazione automatica) e TESTI DEL PREVENTIVO
//   con versioni (tabella fv_testi): chi siamo, Condizioni Generali, note sui materiali, clausole del contratto.
// v20261029b — STAMPA CONTRATTO nel formato inviato a DS Energy (carta intestata Phoenix Fuel Solar, clausole, privacy).
// v20261029a — VETRINE senza siti esterni: three.js r128 e OrbitControls stanno nella cartella lib del progetto
//   (stessa versione, grafica identica). "Scarica pagina cliente" mette le due librerie DENTRO il file: la copia
//   per il cliente e' un file unico che si apre anche senza internet (cambiano solo i caratteri, che offline
//   ripiegano su quelli di sistema).
// v20261028d — mastrino fornitori e fatture/incassi cliente del contratto venduto con il MASTRINO UNICO a
//   linguette di pf-investimenti.js (stesse barre e stesso ordine degli impianti nostri); i fornitori/agenti
//   del contratto si scelgono dalla fila in alto invece di stare uno sotto l'altro.
// v20261028c — vetrina Borgia come lo schizzo del 28/10: corpo Phoenix unico 9 campate x 50 m (18 serre) e a
//   nord-ovest il blocco Catarisano di 2 serre affiancate (160 moduli del proprietario in verde + 12 nostri).
// v20261028b — vetrina Borgia sul contratto Green Power: 1.596 moduli Jinko 620 Wp (989,52 kWp), 8 inverter
//   Sigenergy 125 kW, 20 serre (tolte le 2 a nord-est), impianto Catarisano 160 moduli 99,20 kWp + accumulo
//   20 kWh in verde sulle 2 serre a nord del corpo est, costo netto 623.700 € (1.039.500 − GSE 415.800).
// v20261028a — CONTRATTO VENDUTO: due linguette nuove nella scheda.
//   📒 MASTRINO FORNITORI: un conto per ogni costo pattuito dell'offerta (fornitura, commissione
//   agente…) con le fatture ricevute scritte a mano e i pagamenti collegati alla fattura.
//   💶 FATTURE E INCASSI CLIENTE: le fatture che emettiamo noi e gli incassi collegati alla
//   fattura (non alla rata: i clienti pagano le fatture). Saldo sempre dal pattuito.
//   AGENTI: in Fornitori FV ogni soggetto e' "fornitore" o "agente", l'agente ha la provvigione
//   (percentuale o quota fissa) che si propone nel costo "Commissione agente". I costi
//   dell'offerta ora si modificano (✏️), anche dal mastrino del contratto.
//   SQL: fv_fornitori.tipo/provv_tipo/provv_valore, fv_offerte_costi.fatture, fv_contratti.fatture.
// v20261027b — vetrina Borgia: i 136 moduli riservati a Catarisano in giallo chiaro, con legenda nella scena.
// v20261027a — vetrina Borgia con i DATI DEFINITIVI: 1.800 moduli Jinko Solar 550 Wp = 990 kWp,
//   3 inverter SolarEdge 330 kW; 20 serre da 88 + 40 moduli sulla serra Catarisano (9,60 × 50 m),
//   dove il proprietario ha 136 moduli da 620 Wp (84,32 kWp) + 14,88 kW con accumulo sulla casa = 99,20 kW.
// ═══════════════════════════════════════════════════════════════════════════
// pf-fotovoltaico.js — RAMO FOTOVOLTAICO (camera stagna)
// v20261026c — vetrina Borgia rifatta sul LAYOUT FINALE quotato (86,40 × 75,02 m): corpo ovest
//   3 campate × 75 m, corpo est 6 campate × 50 m, 1.848 moduli da 620 Wp = 1.145,8 kWp (990 kW in
//   rete), piu' la serra del proprietario del terreno (88 moduli, 54,6 kWp).
// v20261026b — vetrina Borgia: costo netto 584.200 € (1.000.000 − contributo GSE 415.800 €,
//   atto di concessione 26/06/2026, CUP F33D26035000004).
// v20261026a — IMPIANTI IN SVILUPPO: seconda vetrina 3D, BORGIA (CZ) — serre Mari Serre a
//   doppia falda con i moduli su entrambe le falde, est e ovest, 990 kWp (1.584 × 625 Wp),
//   stima 1.423 MWh/anno, sotto non si coltiva. File fv-vetrina-borgia.html.
// v20261023c — IMPIANTI VENDUTI = i CONTRATTI firmati (e da firmare), una cella per
//   contratto: cliente, sito, totale, avanzamento lavori e incassi. Il clic apre la scheda
//   del contratto (Composizione · Contabilita') nella sotto-linguetta Contratti. Prima la
//   linguetta leggeva gli impianti di Investimenti con destinazione 'vendita', che sono
//   zero: Palmi e' il contratto 1/2026 DS ENERGY S.R.L.
// v20261023b — LINGUETTE RIORDINATE: Impianti in sviluppo · Fornitori · Catalogo ·
//   Investimenti (solo impianti nostri) · VENDITA A CLIENTI, che contiene le sotto-linguette
//   Impianti venduti (gli impianti con destinazione 'vendita', disegnati da pf-investimenti.js
//   in #inv-vend-content) · Offerte · Contratti · Clienti. fvVenditaTab() le gestisce.
// v20261022b — vetrina Polistena con le COLTURE sotto le serre (fragole, mirtilli, more,
//   idroponica verticale con vasche dei pesci) e la sesta tappa della visita: cambia solo la
//   versione della vetrina, cosi' il programma carica il file nuovo e non quello in memoria.
// v20261022a — linguetta 🏗️ IMPIANTI IN SVILUPPO: elenco degli impianti con la vetrina
//   3D per i clienti (primo: Polistena, serre fotovoltaiche 974,4 kWp). La vetrina e' un
//   file HTML a se' (fv-vetrina-polistena.html) aperto a tutto schermo dentro il programma;
//   "Scarica pagina cliente" ne produce una copia in SOLA LETTURA con la data della proposta.
//   Nessuna tabella nuova: l'elenco e' in _FV_VETRINE finche' non arriva "crea da programma".
// v20261006d — CONTABILITÀ del contratto: il margine si legge in tre celle separate.
//   MARGINE LORDO = ricavo − costi diretti (fornitura, trasporto, pratiche, altro),
//   PROVVIGIONI = costi di tipo 'commissione', MARGINE NETTO = lordo − provvigioni.
//   Tutto a imponibile. Se l'offerta non ha costi pattuiti, si usano i pagamenti e le
//   provvigioni si riconoscono dalla causale "Provvigioni…" del movimento.
// v20261006c — il MARGINE si calcola sui costi della commessa (fornitura del
//   fornitore + provvigioni, dai costi dell'offerta), non su quanto e' stato pagato
//   finora: i pagamenti muovono solo la cassa. Le barre mostrano pagato/da pagare sul
//   costo totale e incassato/residuo sul venduto.
// v20261006b — scheda del contratto divisa in due linguette: COMPOSIZIONE (sola
//   lettura, si sblocca con ✏️ Modifica che avvisa se il contratto e' gia' firmato) e
//   CONTABILITÀ (stato di avanzamento, costo e pagamenti, vendita e incassi, numeri
//   del margine ed elenco entrate/uscite).
// v20261005d — COSTI DELLA COMMESSA nella scheda del contratto: le uscite registrate
//   in foglio giornale con una causale del ramo VENDITE (acquisto impianti per
//   rivendita, provvigioni) si imputano qui al contratto, e il margine reale si
//   aggiorna. Prima finivano in Investimenti, dove l'impianto venduto non esiste.
// v20261005c — CONTRATTI come schede degli IMPIANTI VENDUTI: elenco separato da
//   quello degli impianti di proprieta' (che stanno in Investimenti), con due barre —
//   AVANZAMENTO LAVORI per fasi (accettazione, consegna, installazione, collaudo,
//   produzione) e INCASSI dal cliente sul totale del contratto.
// v20261005b — COSTI E MARGINE sull'offerta: anagrafica FORNITORI FV separata e
//   blocco dei costi (fornitura chiavi in mano, commissione agente, altro) con il
//   riferimento al documento del fornitore — solo i dati, nessun PDF allegato.
//   Tutto a IMPONIBILE: l'IVA e' partita di giro. In testa ricavo, costi, margine.
// v20261005a — 05/10/2026
//
// Qui vivono CLIENTI FV, CATALOGO, OFFERTE e CONTRATTI del ramo fotovoltaico.
// Niente si mescola con l'anagrafica carburanti: i clienti stanno in
// fv_clienti, i componenti in fv_catalogo, le offerte e i contratti nelle
// loro tabelle con numerazione separata per anno.
// La pagina Investimenti (risorse, impianti, spese) resta in pf-investimenti.js
// ed e' la prima linguetta di questa sezione.
//
// Il CONTRATTO nasce dall'offerta ma e' un documento a se': ogni voce resta
// modificabile, comprese le quote di pagamento.
// ═══════════════════════════════════════════════════════════════════════════

var _fvCli = null, _fvCat = null, _fvOff = null, _fvCon = null, _fvSchemi = null, _fvForn = null;
var _fvOffertaAperta = null, _fvContrattoAperto = null;

var _FV_TIPI = [
  ['modulo', 'Modulo'], ['inverter', 'Inverter'], ['accumulo', 'Accumulo'],
  ['struttura', 'Struttura'], ['servizio', 'Servizio'], ['altro', 'Altro']
];
var _FV_STATI_OFF = {
  bozza:    { lab: 'Bozza',     col: '#5F5E5A', bg: '#F1EFE8' },
  inviata:  { lab: 'Inviata',   col: '#0C447C', bg: '#E6F1FB' },
  accettata:{ lab: 'Accettata', col: '#27500A', bg: '#EAF3DE' },
  persa:    { lab: 'Persa',     col: '#791F1F', bg: '#FCEBEB' }
};
var _FV_STATI_CON = {
  da_firmare: { lab: 'Da firmare', col: '#633806', bg: '#FAEEDA' },
  firmato:    { lab: 'Firmato',    col: '#27500A', bg: '#EAF3DE' },
  annullato:  { lab: 'Annullato',  col: '#791F1F', bg: '#FCEBEB' }
};

// Dati dell'azienda usati nei documenti
// logo Phoenix Fuel Solar (lo stesso delle vetrine) per i documenti stampati
var _FV_LOGO = 'data:image/jpeg;base64,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';

var _FV_AZIENDA = {
  nome: 'PHOENIX FUEL S.R.L.',
  indirizzo: 'Zona Industriale Portosalvo snc',
  citta: '89900 Vibo Valentia (VV)',
  cf: '02744150802', piva: '02744150802',
  email: 'info@phoenixfuel.it', pec: 'phoenixfuel@legalmail.it',
  tel: '0966 1906397'
};

function _fvEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _fvEuro(v) { return Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €'; }
function _fvData(iso) {
  if (!iso) return '—';
  var s = String(iso).slice(0, 10).split('-');
  return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : String(iso);
}
function _fvPuo() {
  if (typeof utenteCorrente === 'undefined' || !utenteCorrente) return false;
  if (utenteCorrente.ruolo === 'admin') return true;
  return (typeof _haPermesso === 'function') ? !!_haPermesso('fotovoltaico') : false;
}
function _fvVuoto(testo) {
  return '<div style="padding:26px;text-align:center;font-size:12.5px;color:var(--text-muted)">' + testo + '</div>';
}

// ═══ CLIENTI FV ════════════════════════════════════════════════════════════
async function fvCaricaClienti() {
  var box = document.getElementById('fvcli-content');
  if (!box) return;
  box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">Caricamento…</div>';
  var r = await sb.from('fv_clienti').select('*').order('ragione_sociale');
  if (r.error) { box.innerHTML = _fvVuoto('Errore: ' + _fvEsc(r.error.message)); return; }
  _fvCli = r.data || [];
  _fvRenderClienti();
}

function _fvRenderClienti() {
  var box = document.getElementById('fvcli-content');
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">'
    + '<div><div style="font-size:16px;font-weight:700">👤 Clienti fotovoltaico</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Anagrafica separata da quella dei carburanti: qui stanno solo i clienti degli impianti.</div></div>'
    + (_fvPuo() ? '<button onclick="fvModaleCliente()" class="btn-primary" style="font-size:12px;padding:7px 13px">+ Nuovo cliente</button>' : '')
    + '</div>';
  if (!_fvCli.length) { box.innerHTML = h + _fvVuoto('Nessun cliente: il primo si crea da qui o direttamente mentre si compila un\'offerta.'); return; }
  h += '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:680px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Ragione sociale</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">P.IVA</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Sede</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Sito installazione</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Contatti</th>'
    + '<th style="width:70px;border-bottom:1.5px solid var(--border)"></th></tr>';
  _fvCli.forEach(function (c) {
    h += '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:9px 10px"><strong>' + _fvEsc(c.ragione_sociale) + '</strong>'
      + (c.attivo === false ? ' <span style="font-size:9.5px;color:var(--text-muted)">(non attivo)</span>' : '') + '</td>'
      + '<td style="padding:9px 10px;font-family:var(--font-mono)">' + _fvEsc(c.piva || '—') + '</td>'
      + '<td style="padding:9px 10px">' + _fvEsc([c.indirizzo, c.comune, c.provincia ? '(' + c.provincia + ')' : ''].filter(Boolean).join(', ') || '—') + '</td>'
      + '<td style="padding:9px 10px">' + _fvEsc(c.sito_installazione || '—') + '</td>'
      + '<td style="padding:9px 10px;font-size:11.5px;color:var(--text-muted)">' + _fvEsc([c.referente, c.telefono, c.email].filter(Boolean).join(' · ') || '—') + '</td>'
      + '<td style="padding:9px 10px;text-align:right">' + (_fvPuo() ? '<button onclick="fvModaleCliente(\'' + c.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">✏️</button>' : '') + '</td></tr>';
  });
  h += '</table></div>';
  box.innerHTML = h;
}

function fvModaleCliente(id) {
  var c = id ? (_fvCli || []).filter(function (x) { return x.id === id; })[0] : null;
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var v = function (k) { return _fvEsc(c && c[k] || ''); };
  var h = '<div style="max-width:620px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">' + (c ? 'Modifica cliente' : 'Nuovo cliente fotovoltaico') + '</div>';
  h += '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px">';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">Ragione sociale *</label><input id="fvc-rs" value="' + v('ragione_sociale') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">P.IVA</label><input id="fvc-piva" value="' + v('piva') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Codice fiscale</label><input id="fvc-cf" value="' + v('codice_fiscale') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">SDI</label><input id="fvc-sdi" value="' + v('sdi') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Indirizzo</label><input id="fvc-ind" value="' + v('indirizzo') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">CAP</label><input id="fvc-cap" value="' + v('cap') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Comune</label><input id="fvc-com" value="' + v('comune') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Provincia</label><input id="fvc-prov" maxlength="2" value="' + v('provincia') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">Sito di installazione</label><input id="fvc-sito" value="' + v('sito_installazione') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Referente</label><input id="fvc-ref" value="' + v('referente') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Telefono</label><input id="fvc-tel" value="' + v('telefono') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Email</label><input id="fvc-mail" value="' + v('email') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">PEC</label><input id="fvc-pec" value="' + v('pec') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">Note</label><input id="fvc-note" value="' + v('note') + '" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvSalvaCliente(' + (c ? '\'' + c.id + '\'' : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

async function fvSalvaCliente(id) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value.trim() : ''; };
  if (!g('fvc-rs')) { toast('La ragione sociale è obbligatoria'); return; }
  var p = {
    ragione_sociale: g('fvc-rs'), piva: g('fvc-piva') || null, codice_fiscale: g('fvc-cf') || null,
    indirizzo: g('fvc-ind') || null, cap: g('fvc-cap') || null, comune: g('fvc-com') || null,
    provincia: (g('fvc-prov') || '').toUpperCase() || null, sito_installazione: g('fvc-sito') || null,
    referente: g('fvc-ref') || null, telefono: g('fvc-tel') || null, email: g('fvc-mail') || null,
    pec: g('fvc-pec') || null, sdi: g('fvc-sdi') || null, note: g('fvc-note') || null
  };
  var r = id ? await sb.from('fv_clienti').update(p).eq('id', id) : await sb.from('fv_clienti').insert([p]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  toast(id ? '✓ Cliente aggiornato' : '✓ Cliente creato');
  fvCaricaClienti();
}

// ═══ CATALOGO ══════════════════════════════════════════════════════════════
async function fvCaricaCatalogo() {
  var box = document.getElementById('fvcat-content');
  if (!box) return;
  box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">Caricamento…</div>';
  var r = await sb.from('fv_catalogo').select('*').order('tipo').order('nome');
  if (r.error) { box.innerHTML = _fvVuoto('Errore: ' + _fvEsc(r.error.message)); return; }
  _fvCat = r.data || [];
  _fvRenderCatalogo();
}

function _fvRenderCatalogo() {
  var box = document.getElementById('fvcat-content');
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">'
    + '<div><div style="font-size:16px;font-weight:700">📦 Catalogo componenti e servizi</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Moduli, inverter, strutture e servizi che si richiamano nelle offerte. Le foto si aggiungeranno qui.</div></div>'
    + (_fvPuo() ? '<button onclick="fvModaleCatalogo()" class="btn-primary" style="font-size:12px;padding:7px 13px">+ Nuova voce</button>' : '')
    + '</div>';
  if (!_fvCat.length) { box.innerHTML = h + _fvVuoto('Catalogo vuoto.'); return; }
  var perTipo = {};
  _fvCat.forEach(function (c) { (perTipo[c.tipo] = perTipo[c.tipo] || []).push(c); });
  h += '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:620px">';
  _FV_TIPI.forEach(function (t) {
    var el = perTipo[t[0]];
    if (!el || !el.length) return;
    h += '<tr style="background:var(--bg-kpi,var(--bg))"><td colspan="5" style="padding:7px 10px;font-weight:700;font-size:11.5px">' + t[1] + '</td></tr>';
    el.forEach(function (c) {
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:8px 10px"><strong>' + _fvEsc(c.nome) + '</strong>'
        + (c.descrizione ? '<div style="font-size:11px;color:var(--text-muted)">' + _fvEsc(c.descrizione) + '</div>' : '') + '</td>'
        + '<td style="padding:8px 10px;color:var(--text-muted)">' + _fvEsc(c.marca || '') + '</td>'
        + '<td style="padding:8px 10px;font-family:var(--font-mono);font-size:11.5px">' + _fvEsc(c.codice || '') + '</td>'
        + '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono)">' + (c.potenza_w ? Number(c.potenza_w).toLocaleString('it-IT') + ' W' : '') + '</td>'
        + '<td style="padding:8px 10px;text-align:right">' + (_fvPuo() ? '<button onclick="fvModaleCatalogo(\'' + c.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">✏️</button>' : '') + '</td></tr>';
    });
  });
  h += '</table></div>';
  box.innerHTML = h;
}

function fvModaleCatalogo(id) {
  var c = id ? (_fvCat || []).filter(function (x) { return x.id === id; })[0] : null;
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:520px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">' + (c ? 'Modifica voce' : 'Nuova voce di catalogo') + '</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div><label style="' + lb + '">Tipo</label><select id="fvk-tipo" style="' + inp + '">'
    + _FV_TIPI.map(function (t) { return '<option value="' + t[0] + '"' + (c && c.tipo === t[0] ? ' selected' : '') + '>' + t[1] + '</option>'; }).join('') + '</select></div>';
  h += '<div><label style="' + lb + '">Marca</label><input id="fvk-marca" value="' + _fvEsc(c && c.marca || '') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Nome *</label><input id="fvk-nome" value="' + _fvEsc(c && c.nome || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Codice</label><input id="fvk-cod" value="' + _fvEsc(c && c.codice || '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Potenza (W)</label><input id="fvk-pot" type="number" step="0.01" value="' + (c && c.potenza_w != null ? c.potenza_w : '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Prezzo unitario €</label><input id="fvk-prezzo" type="number" step="0.01" value="' + (c && c.prezzo_unitario != null ? c.prezzo_unitario : '') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Foto (URL)</label><input id="fvk-foto" value="' + _fvEsc(c && c.foto_url || '') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Descrizione</label><input id="fvk-descr" value="' + _fvEsc(c && c.descrizione || '') + '" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvSalvaCatalogo(' + (c ? '\'' + c.id + '\'' : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

async function fvSalvaCatalogo(id) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value.trim() : ''; };
  if (!g('fvk-nome')) { toast('Il nome è obbligatorio'); return; }
  var p = {
    tipo: g('fvk-tipo') || 'altro', marca: g('fvk-marca') || null, nome: g('fvk-nome'),
    codice: g('fvk-cod') || null, potenza_w: parseFloat(g('fvk-pot')) || null,
    prezzo_unitario: parseFloat(g('fvk-prezzo')) || 0, foto_url: g('fvk-foto') || null,
    descrizione: g('fvk-descr') || null
  };
  var r = id ? await sb.from('fv_catalogo').update(p).eq('id', id) : await sb.from('fv_catalogo').insert([p]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  fvCaricaCatalogo();
}

// ═══ OFFERTE ═══════════════════════════════════════════════════════════════
async function fvCaricaOfferte() {
  var box = document.getElementById('fvo-content');
  if (!box) return;
  box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">Caricamento…</div>';
  var r = await Promise.all([
    sb.from('fv_offerte').select('*').order('anno', { ascending: false }).order('numero', { ascending: false }),
    sb.from('fv_offerte_righe').select('*').order('ordine'),
    sb.from('fv_clienti').select('*').order('ragione_sociale'),
    sb.from('fv_catalogo').select('*').eq('attivo', true).order('tipo').order('nome'),
    sb.from('fv_schemi_pagamento').select('*').eq('attivo', true).order('nome'),
    sb.from('fv_offerte_costi').select('*').order('ordine'),
    sb.from('fv_fornitori').select('*').eq('attivo', true).order('ragione_sociale')
  ]);
  _fvOff = { offerte: r[0].data || [], righe: r[1].data || [], costi: (r[5] && r[5].data) || [] };
  _fvForn = (r[6] && r[6].data) || [];
  _fvCli = r[2].data || [];
  _fvCat = r[3].data || [];
  _fvSchemi = r[4].data || [];
  _fvOffertaAperta = null;
  _fvRenderOfferte();
}

function _fvRenderOfferte() {
  var box = document.getElementById('fvo-content');
  if (_fvOffertaAperta) { _fvRenderOffertaScheda(); return; }
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">'
    + '<div><div style="font-size:16px;font-weight:700">📄 Offerte</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Numerazione propria per anno. Dall\'offerta accettata si genera il contratto.</div></div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap"><button onclick="fvModaleTesti()" style="font-size:12px;padding:7px 13px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);cursor:pointer">✏️ Testi del preventivo</button>'
    + (_fvPuo() ? '<button onclick="fvNuovaOfferta()" class="btn-primary" style="font-size:12px;padding:7px 13px">+ Nuova offerta</button>' : '') + '</div>'
    + '</div>';
  if (!_fvOff.offerte.length) { box.innerHTML = h + _fvVuoto('Nessuna offerta.'); return; }
  h += '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:700px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">N.</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Data</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Cliente</th>'
    + '<th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid var(--border)">kWp</th>'
    + '<th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid var(--border)">Imponibile</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Stato</th>'
    + '<th style="width:90px;border-bottom:1.5px solid var(--border)"></th></tr>';
  _fvOff.offerte.forEach(function (o) {
    var st = _FV_STATI_OFF[o.stato] || _FV_STATI_OFF.bozza;
    h += '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:9px 10px;font-family:var(--font-mono)">' + (o.numero || '—') + '/' + o.anno + '</td>'
      + '<td style="padding:9px 10px">' + _fvData(o.data) + '</td>'
      + '<td style="padding:9px 10px"><strong>' + _fvEsc(o.cliente_nome) + '</strong>'
      + (o.sito_installazione ? '<div style="font-size:11px;color:var(--text-muted)">' + _fvEsc(o.sito_installazione) + '</div>' : '') + '</td>'
      + '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono)">' + (o.potenza_kwp ? Number(o.potenza_kwp).toLocaleString('it-IT') : '—') + '</td>'
      + '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _fvEuro(o.imponibile) + '</td>'
      + '<td style="padding:9px 10px"><span style="font-size:10px;background:' + st.bg + ';color:' + st.col + ';padding:2px 9px;border-radius:9px;font-weight:600">' + st.lab + '</span></td>'
      + '<td style="padding:9px 10px;text-align:right;white-space:nowrap"><button onclick="fvApriOfferta(\'' + o.id + '\')" title="Apri e modifica" style="font-size:11.5px;padding:5px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer">✏️</button> '
      + (_fvPuo() ? '<button onclick="fvEliminaOfferta(\'' + o.id + '\')" title="Elimina l\'offerta" style="font-size:11.5px;padding:5px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:#A32D2D;cursor:pointer">🗑️</button>' : '') + '</td></tr>';
  });
  h += '</table></div>';
  box.innerHTML = h;
}

async function fvNuovaOfferta() {
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  var anno = new Date().getFullYear();
  var max = (_fvOff.offerte || []).filter(function (o) { return o.anno === anno; })
    .reduce(function (m, o) { return Math.max(m, Number(o.numero || 0)); }, 0);
  var cli = _fvCli[0];
  var r = await sb.from('fv_offerte').insert([{
    numero: max + 1, anno: anno, data: new Date().toISOString().slice(0, 10),
    cliente_id: cli ? cli.id : null,
    cliente_nome: cli ? cli.ragione_sociale : 'Da scegliere',
    cliente_piva: cli ? cli.piva : null,
    cliente_indirizzo: cli ? [cli.indirizzo, cli.cap, cli.comune].filter(Boolean).join(', ') : null,
    sito_installazione: cli ? cli.sito_installazione : null,
    aliquota_iva: 10, stato: 'bozza'
  }]).select('id').single();
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await fvCaricaOfferte();
  fvApriOfferta(r.data.id);
}

// v20261029d — ELIMINA OFFERTA (prove e bozze inutili): toglie righe, costi e l'offerta.
// Bloccata se dall'offerta e' gia' nato un contratto: in quel caso si elimina prima il contratto.
async function fvEliminaOfferta(id) {
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  var o = (_fvOff.offerte || []).filter(function (x) { return x.id === id; })[0];
  if (!o) return;
  var rc = await sb.from('fv_contratti').select('id,numero,anno').eq('offerta_id', id);
  if (rc.error) { toast('Errore: ' + rc.error.message); return; }
  if ((rc.data || []).length) {
    var k = rc.data[0];
    alert('Da questa offerta è nato il contratto n. ' + (k.numero || '—') + '/' + k.anno + ': non si può eliminare.');
    return;
  }
  if (!confirm('Eliminare l\'offerta n. ' + (o.numero || '—') + '/' + o.anno + ' di ' + (o.cliente_nome || '') + '?\nSi cancellano anche le sue voci e i suoi costi. Non si può annullare.')) return;
  var r1 = await sb.from('fv_offerte_costi').delete().eq('offerta_id', id);
  if (r1.error) { toast('Errore sui costi: ' + r1.error.message); return; }
  var r2 = await sb.from('fv_offerte_righe').delete().eq('offerta_id', id);
  if (r2.error) { toast('Errore sulle voci: ' + r2.error.message); return; }
  var r3 = await sb.from('fv_offerte').delete().eq('id', id);
  if (r3.error) { toast('Errore: ' + r3.error.message); return; }
  if (typeof _auditLog === 'function') _auditLog('fotovoltaico', 'fv_offerte', 'eliminata offerta ' + (o.numero || '') + '/' + o.anno + ' ' + (o.cliente_nome || ''));
  toast('✓ Offerta eliminata');
  _fvOffertaAperta = null;
  fvCaricaOfferte();
}

function fvApriOfferta(id) { _fvOffertaAperta = id; _fvRenderOffertaScheda(); }
function fvChiudiOfferta() { _fvOffertaAperta = null; _fvRenderOfferte(); }

function _fvRenderOffertaScheda() {
  var box = document.getElementById('fvo-content');
  var o = (_fvOff.offerte || []).filter(function (x) { return x.id === _fvOffertaAperta; })[0];
  if (!o) { _fvOffertaAperta = null; _fvRenderOfferte(); return; }
  var righe = (_fvOff.righe || []).filter(function (r) { return r.offerta_id === o.id; });
  var imponibile = righe.reduce(function (s, r) { return s + Number(r.quantita || 0) * Number(r.prezzo_unitario || 0); }, 0);
  var iva = imponibile * Number(o.aliquota_iva || 0) / 100;
  var inp = 'width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px';
  var lb = 'display:block;font-size:10.5px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var st = _FV_STATI_OFF[o.stato] || _FV_STATI_OFF.bozza;

  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
  h += '<div><div style="font-size:16px;font-weight:700">Offerta n. ' + (o.numero || '—') + '/' + o.anno
    + ' <span style="font-size:11px;background:' + st.bg + ';color:' + st.col + ';padding:2px 9px;border-radius:9px;vertical-align:middle">' + st.lab + '</span></div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">' + _fvEsc(o.cliente_nome) + ' · ' + _fvData(o.data) + '</div></div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button onclick="fvStampaOfferta(\'' + o.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid #A32D2D;border-radius:7px;background:var(--bg);color:#A32D2D;font-weight:600;cursor:pointer">📄 Stampa preventivo</button>'
    + (o.stato === 'accettata' ? '<button onclick="fvGeneraContratto(\'' + o.id + '\')" class="btn-primary" style="font-size:12px;padding:7px 13px">📝 Genera contratto</button>' : '')
    + (_fvPuo() ? '<button onclick="fvEliminaOfferta(\'' + o.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:#A32D2D;cursor:pointer">🗑️ Elimina</button>' : '')
    + '<button onclick="fvChiudiOfferta()" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);cursor:pointer">← Tutte le offerte</button>'
    + '</div></div>';

  // testata modificabile
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px"><div style="display:grid;grid-template-columns:2fr 1fr 1fr 1fr;gap:10px">';
  h += '<div><label style="' + lb + '">Cliente</label><select id="fvo-cli" onchange="fvOffertaCampo(\'cliente\', this.value)" style="' + inp + '">'
    + _fvCli.map(function (c) { return '<option value="' + c.id + '"' + (c.id === o.cliente_id ? ' selected' : '') + '>' + _fvEsc(c.ragione_sociale) + '</option>'; }).join('')
    + '</select></div>';
  h += '<div><label style="' + lb + '">Data</label><input type="date" value="' + (o.data || '') + '" onchange="fvOffertaCampo(\'data\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Potenza kWp</label><input type="number" step="0.01" value="' + (o.potenza_kwp != null ? o.potenza_kwp : '') + '" onchange="fvOffertaCampo(\'potenza_kwp\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">IVA %</label><input type="number" step="0.1" value="' + o.aliquota_iva + '" onchange="fvOffertaCampo(\'aliquota_iva\', this.value)" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Sito di installazione</label><input value="' + _fvEsc(o.sito_installazione || '') + '" onchange="fvOffertaCampo(\'sito_installazione\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Stato</label><select onchange="fvOffertaCampo(\'stato\', this.value)" style="' + inp + '">'
    + Object.keys(_FV_STATI_OFF).map(function (k) { return '<option value="' + k + '"' + (o.stato === k ? ' selected' : '') + '>' + _FV_STATI_OFF[k].lab + '</option>'; }).join('')
    + '</select></div>';
  h += '<div><label style="' + lb + '">Schema pagamento</label><select onchange="fvOffertaCampo(\'schema_pagamento_id\', this.value)" style="' + inp + '">'
    + '<option value="">— nessuno —</option>'
    + (_fvSchemi || []).map(function (s2) { return '<option value="' + s2.id + '"' + (o.schema_pagamento_id === s2.id ? ' selected' : '') + '>' + _fvEsc(s2.nome) + '</option>'; }).join('')
    + '</select></div>';
  h += '</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:10px">';
  h += _fvPvgisDi(o) ? '<div><label style="' + lb + '">Produzione kWh/anno · da PVGIS</label><div style="' + inp + ';background:#EAF1F9;font-family:var(--font-mono)">' + (o.produzione_kwh_anno != null ? _fvNumDoc(o.produzione_kwh_anno) : 'scrivi la potenza kWp') + '</div></div>' : '';
  if (!_fvPvgisDi(o)) h += '<div><label style="' + lb + '">Produzione kWh/anno</label><input type="number" step="1" value="' + (o.produzione_kwh_anno != null ? o.produzione_kwh_anno : '') + '" onchange="fvOffertaCampo(\'produzione_kwh_anno\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Rendimento totale €</label><input type="number" step="0.01" value="' + (o.rendimento_totale != null ? o.rendimento_totale : '') + '" onchange="fvOffertaCampo(\'rendimento_totale\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Break-even (anni)</label><input type="number" step="0.1" value="' + (o.break_even_anni != null ? o.break_even_anni : '') + '" onchange="fvOffertaCampo(\'break_even_anni\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">TIR %</label><input type="number" step="0.01" value="' + (o.tir != null ? o.tir : '') + '" onchange="fvOffertaCampo(\'tir\', this.value)" style="' + inp + '"></div>';
  h += '</div></div>';

  // produzione da PVGIS
  h += _fvBloccoPVGIS(o);

  // righe
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Voci dell\'offerta</div>'
    + '<button onclick="fvAggiungiRiga(\'' + o.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Voce</button></div>';
  if (!righe.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna voce: aggiungile dal catalogo o scrivendole a mano.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase"><th style="text-align:left;padding:5px 6px">Descrizione</th>'
      + '<th style="text-align:right;padding:5px 6px;width:80px">Q.tà</th><th style="text-align:right;padding:5px 6px;width:120px">Prezzo</th>'
      + '<th style="text-align:right;padding:5px 6px;width:120px">Totale</th><th style="width:36px"></th></tr>';
    righe.forEach(function (r) {
      var tot = Number(r.quantita || 0) * Number(r.prezzo_unitario || 0);
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:5px 6px"><input value="' + _fvEsc(r.descrizione) + '" onchange="fvRigaCampo(\'' + r.id + '\',\'descrizione\',this.value)" style="' + inp + '"></td>'
        + '<td style="padding:5px 6px"><input type="number" step="0.01" value="' + r.quantita + '" onchange="fvRigaCampo(\'' + r.id + '\',\'quantita\',this.value)" style="' + inp + ';text-align:right;font-family:var(--font-mono)"></td>'
        + '<td style="padding:5px 6px"><input type="number" step="0.01" value="' + r.prezzo_unitario + '" onchange="fvRigaCampo(\'' + r.id + '\',\'prezzo_unitario\',this.value)" style="' + inp + ';text-align:right;font-family:var(--font-mono)"></td>'
        + '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _fvEuro(tot) + '</td>'
        + '<td style="padding:5px 6px;text-align:right"><button onclick="fvEliminaRiga(\'' + r.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button></td></tr>';
    });
    h += '</table>';
  }
  h += '<div style="display:flex;justify-content:flex-end;gap:24px;margin-top:12px;font-size:13px">'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">Imponibile</div><div style="font-family:var(--font-mono);font-weight:600">' + _fvEuro(imponibile) + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">IVA ' + o.aliquota_iva + '%</div><div style="font-family:var(--font-mono)">' + _fvEuro(iva) + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">Totale</div><div style="font-family:var(--font-mono);font-weight:700;font-size:15px">' + _fvEuro(imponibile + iva) + '</div></div>'
    + '</div></div>';

  h += _fvBloccoCosti(o, imponibile);
  box.innerHTML = h;
}

// ── COSTI E MARGINE DELL'OFFERTA ───────────────────────────────────────────
// Quanto ci costa l'impianto (fornitura chiavi in mano del fornitore,
// commissione dell'agente, altro) e quanto resta a noi. Sempre a imponibile.
function _fvCostiOfferta(offertaId) {
  return (_fvOff.costi || []).filter(function (c) { return c.offerta_id === offertaId; });
}

function _fvBloccoCosti(o, ricavo) {
  var costi = _fvCostiOfferta(o.id);
  var totCosti = costi.reduce(function (s, c) { return s + Number(c.imponibile || 0); }, 0);
  var margine = Number(ricavo || 0) - totCosti;
  var pct = ricavo > 0 ? (margine / ricavo * 100) : 0;
  var TIPI = { fornitura: 'Fornitura', commissione: 'Commissione agente', trasporto: 'Trasporto', pratiche: 'Pratiche', altro: 'Altro' };

  var kpi = function (lab, val, col) {
    return '<div style="flex:1;min-width:140px;border:0.5px solid var(--border);border-radius:9px;padding:10px 12px">'
      + '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div></div>';
  };

  var h = '<div class="card" style="padding:12px 14px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">'
    + '<div><div style="font-size:13px;font-weight:700">I nostri costi e il margine</div>'
    + '<div style="font-size:11px;color:var(--text-muted)">Importi al netto dell\'IVA: quello che il fornitore ci fattura, le commissioni e quanto resta a noi.</div></div>'
    + (_fvPuo() ? '<button onclick="fvModaleCosto(\'' + o.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Costo</button>' : '')
    + '</div>';
  h += '<div style="display:flex;gap:9px;flex-wrap:wrap;margin-bottom:10px">'
    + kpi('Ricavo (imponibile)', _fvEuro(ricavo))
    + kpi('Costi', _fvEuro(totCosti), '#A32D2D')
    + kpi('Margine', _fvEuro(margine), margine >= 0 ? '#27500A' : '#A32D2D')
    + kpi('Margine %', (ricavo > 0 ? pct.toFixed(1) + ' %' : '—'), margine >= 0 ? '#27500A' : '#A32D2D')
    + '</div>';
  if (!costi.length) {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessun costo inserito: aggiungi la fornitura del fornitore e le commissioni.</div></div>';
    return h;
  }
  h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Voce</th>'
    + '<th style="text-align:left;padding:6px 7px;border-bottom:1.5px solid var(--border)">Documento</th>'
    + '<th style="text-align:right;padding:6px 7px;border-bottom:1.5px solid var(--border)">Imponibile</th>'
    + '<th style="width:60px;border-bottom:1.5px solid var(--border)"></th></tr>';
  costi.forEach(function (c) {
    var f = (_fvForn || []).filter(function (x) { return x.id === c.fornitore_id; })[0];
    h += '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:7px"><strong>' + _fvEsc(c.descrizione) + '</strong>'
      + '<div style="font-size:10.5px;color:var(--text-muted)">' + _fvEsc(TIPI[c.tipo] || c.tipo) + (f ? ' · ' + _fvEsc(f.ragione_sociale) : '') + '</div></td>'
      + '<td style="padding:7px;font-size:11.5px;color:var(--text-muted)">'
      + (c.doc_numero ? _fvEsc((c.doc_tipo || 'doc') + ' n. ' + c.doc_numero) + (c.doc_data ? ' del ' + _fvData(c.doc_data) : '') : '—')
      + (c.doc_totale ? '<div>totale documento ' + _fvEuro(c.doc_totale) + '</div>' : '') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _fvEuro(c.imponibile) + '</td>'
      + '<td style="padding:7px;text-align:right;white-space:nowrap">' + (_fvPuo() ? '<button onclick="fvModaleCosto(\'' + o.id + '\',\'' + c.id + '\')" title="Modifica" style="border:0;background:transparent;cursor:pointer">✏️</button>'
        + '<button onclick="fvEliminaCosto(\'' + c.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button>' : '') + '</td></tr>';
  });
  h += '<tr style="font-weight:700"><td colspan="2" style="padding:8px 7px">TOTALE COSTI</td>'
    + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _fvEuro(totCosti) + '</td><td></td></tr>';
  h += '</table></div>';
  return h;
}

// costo dell'offerta: nuovo o modifica (costoId). daContratto: aperto dal mastrino del contratto.
function _fvCostoDaId(id) {
  var l = ((_fvOff && _fvOff.costi) || []).concat((_fvCon && _fvCon.costiPrevisti) || []);
  return l.filter(function (x) { return x.id === id; })[0] || null;
}
function _fvImponibileOfferta(offertaId) {
  var o = ((_fvOff && _fvOff.offerte) || []).filter(function (x) { return x.id === offertaId; })[0];
  if (o) return Number(o.imponibile || 0);
  var c = ((_fvCon && _fvCon.contratti) || []).filter(function (x) { return x.offerta_id === offertaId; })[0];
  return c ? Number(c.imponibile || 0) : 0;
}
function _fvOptForn(scelto) {
  var forn = (_fvForn || []).filter(function (f) { return (f.tipo || 'fornitore') !== 'agente'; });
  var ag = (_fvForn || []).filter(function (f) { return f.tipo === 'agente'; });
  var o = function (f) { return '<option value="' + f.id + '"' + (f.id === scelto ? ' selected' : '') + '>' + _fvEsc(f.ragione_sociale) + '</option>'; };
  return '<option value="">— nessuno —</option>'
    + (forn.length ? '<optgroup label="Fornitori">' + forn.map(o).join('') + '</optgroup>' : '')
    + (ag.length ? '<optgroup label="Agenti">' + ag.map(o).join('') + '</optgroup>' : '');
}
function fvModaleCosto(offertaId, costoId, daContratto) {
  var c = costoId ? _fvCostoDaId(costoId) : null;
  var v = function (k) { return c && c[k] != null ? _fvEsc(String(c[k])) : ''; };
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var sel = function (val, cur) { return val === cur ? ' selected' : ''; };
  var tipo = c ? c.tipo : 'fornitura';
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:4px">' + (c ? '✏️ Costo dell\'impianto' : 'Costo dell\'impianto') + '</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">Scrivi l\'imponibile. Se hai il totale con IVA, usa il pulsante per scorporarla. Per la commissione, scegliendo l\'agente si propone la sua provvigione.</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div><label style="' + lb + '">Tipo</label><select id="fvco-tipo" onchange="fvCostoProvv(\'' + offertaId + '\')" style="' + inp + '">'
    + '<option value="fornitura"' + sel('fornitura', tipo) + '>Fornitura chiavi in mano</option><option value="commissione"' + sel('commissione', tipo) + '>Commissione agente</option>'
    + '<option value="trasporto"' + sel('trasporto', tipo) + '>Trasporto</option><option value="pratiche"' + sel('pratiche', tipo) + '>Pratiche</option><option value="altro"' + sel('altro', tipo) + '>Altro</option></select></div>';
  h += '<div><label style="' + lb + '">Fornitore / agente</label><select id="fvco-forn" onchange="fvCostoProvv(\'' + offertaId + '\')" style="' + inp + '">' + _fvOptForn(c ? c.fornitore_id : '') + '</select></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Descrizione *</label><input id="fvco-descr" value="' + v('descrizione') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Imponibile €</label><input id="fvco-imp" type="number" step="0.01" value="' + v('imponibile') + '" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '<div><label style="' + lb + '">Oppure totale con IVA</label><div style="display:flex;gap:6px">'
    + '<input id="fvco-tot" type="number" step="0.01" style="' + inp + ';font-family:var(--font-mono)">'
    + '<input id="fvco-iva" type="number" step="0.1" value="' + (c && c.aliquota_iva != null ? c.aliquota_iva : 10) + '" title="aliquota %" style="' + inp + ';width:62px;text-align:right">'
    + '<button onclick="fvScorporaCosto()" title="Scorpora l\'IVA" style="padding:0 10px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:700;cursor:pointer">→</button></div></div>';
  h += '<div id="fvco-provv" style="grid-column:1/3;font-size:11.5px;color:#854F0B"></div>';
  h += '<div><label style="' + lb + '">Documento</label><select id="fvco-dtipo" style="' + inp + '">'
    + '<option value="">— nessuno —</option><option value="fattura"' + sel('fattura', c && c.doc_tipo) + '>Fattura</option><option value="preventivo"' + sel('preventivo', c && c.doc_tipo) + '>Preventivo</option><option value="ordine"' + sel('ordine', c && c.doc_tipo) + '>Ordine</option></select></div>';
  h += '<div><label style="' + lb + '">Numero</label><input id="fvco-dnum" value="' + v('doc_numero') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Data documento</label><input id="fvco-ddata" type="date" value="' + v('doc_data') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Totale documento €</label><input id="fvco-dtot" type="number" step="0.01" value="' + v('doc_totale') + '" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Note</label><input id="fvco-note" value="' + v('note') + '" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvSalvaCosto(\'' + offertaId + '\',\'' + (costoId || '') + '\',' + (daContratto ? 'true' : 'false') + ')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
  fvCostoProvv(offertaId, true);
}
// commissione + agente: mostra e propone la provvigione (percentuale sul ricavo o quota fissa)
function fvCostoProvv(offertaId, soloInfo) {
  var box = document.getElementById('fvco-provv');
  if (!box) return;
  var tipo = (document.getElementById('fvco-tipo') || {}).value;
  var fid = (document.getElementById('fvco-forn') || {}).value;
  var f = (_fvForn || []).filter(function (x) { return x.id === fid; })[0];
  box.innerHTML = '';
  if (tipo !== 'commissione' || !f || f.tipo !== 'agente' || !(Number(f.provv_valore) > 0)) return;
  var ricavo = _fvImponibileOfferta(offertaId);
  var val = f.provv_tipo === 'fissa' ? Number(f.provv_valore) : Math.round(ricavo * Number(f.provv_valore)) / 100;
  box.innerHTML = 'Provvigione di ' + _fvEsc(f.ragione_sociale) + ': '
    + (f.provv_tipo === 'fissa' ? 'quota fissa ' + _fvEuro(f.provv_valore) : f.provv_valore + '% del ricavo ' + _fvEuro(ricavo) + ' = ' + _fvEuro(val))
    + ' <button onclick="document.getElementById(\'fvco-imp\').value=' + val.toFixed(2) + '" style="font-size:11px;padding:2px 8px;border:0.5px solid #854F0B;border-radius:5px;background:var(--bg);color:#854F0B;cursor:pointer">usa</button>';
  var imp = document.getElementById('fvco-imp'), d = document.getElementById('fvco-descr');
  if (!soloInfo && imp && !imp.value) imp.value = val.toFixed(2);
  if (!soloInfo && d && !d.value) d.value = 'Commissione agente ' + f.ragione_sociale;
}

// Totale con IVA → imponibile (es. 70.000 al 10% = 63.636,36)
function fvScorporaCosto() {
  var tot = parseFloat((document.getElementById('fvco-tot') || {}).value) || 0;
  var iva = parseFloat((document.getElementById('fvco-iva') || {}).value);
  if (!isFinite(iva)) iva = 10;
  if (tot <= 0) { toast('Scrivi il totale con IVA'); return; }
  var imp = Math.round((tot / (1 + iva / 100)) * 100) / 100;
  var e = document.getElementById('fvco-imp'); if (e) e.value = imp;
  var d = document.getElementById('fvco-dtot'); if (d && !d.value) d.value = tot;
}

async function fvSalvaCosto(offertaId, costoId, daContratto) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var d = (g('fvco-descr') || '').trim();
  var imp = parseFloat(g('fvco-imp')) || 0;
  if (!d) { toast('La descrizione è obbligatoria'); return; }
  if (imp <= 0) { toast('Indica l\'imponibile (o scorpora il totale con IVA)'); return; }
  var p = {
    tipo: g('fvco-tipo') || 'altro',
    fornitore_id: g('fvco-forn') || null, descrizione: d, imponibile: imp,
    aliquota_iva: parseFloat(g('fvco-iva')) || null,
    doc_tipo: g('fvco-dtipo') || null, doc_numero: g('fvco-dnum') || null,
    doc_data: g('fvco-ddata') || null, doc_totale: parseFloat(g('fvco-dtot')) || null,
    note: g('fvco-note') || null
  };
  var r;
  if (costoId) r = await sb.from('fv_offerte_costi').update(p).eq('id', costoId);
  else {
    p.offerta_id = offertaId;
    p.ordine = ((_fvOff && _fvOff.costi) || []).filter(function (c) { return c.offerta_id === offertaId; }).length + 1;
    r = await sb.from('fv_offerte_costi').insert([p]);
  }
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  toast('✓ Costo salvato');
  if (daContratto) {
    var id = _fvContrattoAperto;
    await fvCaricaContratti();
    if (id) fvApriContratto(id);
    return;
  }
  await _fvRicaricaCosti();
  _fvRenderOffertaScheda();
}

async function fvEliminaCosto(id) {
  var r = await sb.from('fv_offerte_costi').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await _fvRicaricaCosti();
  _fvRenderOffertaScheda();
}

async function _fvRicaricaCosti() {
  var r = await sb.from('fv_offerte_costi').select('*').order('ordine');
  _fvOff.costi = r.data || [];
}

async function fvOffertaCampo(campo, valore) {
  var o = (_fvOff.offerte || []).filter(function (x) { return x.id === _fvOffertaAperta; })[0];
  if (!o) return;
  var p = {};
  if (campo === 'cliente') {
    var c = _fvCli.filter(function (x) { return x.id === valore; })[0];
    if (!c) return;
    p = { cliente_id: c.id, cliente_nome: c.ragione_sociale, cliente_piva: c.piva,
          cliente_indirizzo: [c.indirizzo, c.cap, c.comune].filter(Boolean).join(', '),
          sito_installazione: c.sito_installazione || o.sito_installazione };
  } else if (['potenza_kwp', 'aliquota_iva', 'produzione_kwh_anno', 'rendimento_totale', 'break_even_anni', 'tir'].indexOf(campo) >= 0) {
    p[campo] = valore === '' ? null : parseFloat(valore);
    // con il PVGIS la produzione annua segue la potenza
    var pvC = _fvPvgisDi(o);
    if (campo === 'potenza_kwp' && pvC) p.produzione_kwh_anno = p.potenza_kwp ? Math.round(pvC.resa * p.potenza_kwp) : null;
  } else {
    p[campo] = valore || null;
  }
  var r = await sb.from('fv_offerte').update(p).eq('id', o.id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  Object.keys(p).forEach(function (k) { o[k] = p[k]; });
  _fvRenderOffertaScheda();
}

function fvAggiungiRiga(offertaId) {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:480px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Aggiungi voce</div>';
  h += '<div style="display:grid;gap:10px">';
  h += '<div><label style="' + lb + '">Dal catalogo</label><select id="fvr-cat" onchange="fvRigaDaCatalogo()" style="' + inp + '">'
    + '<option value="">— voce libera —</option>'
    + (_fvCat || []).map(function (c) { return '<option value="' + c.id + '" data-nome="' + _fvEsc(c.nome) + '" data-prezzo="' + (c.prezzo_unitario || 0) + '" data-tipo="' + c.tipo + '">' + _fvEsc(c.nome) + (c.marca ? ' · ' + _fvEsc(c.marca) : '') + '</option>'; }).join('')
    + '</select></div>';
  h += '<div><label style="' + lb + '">Descrizione *</label><input id="fvr-descr" style="' + inp + '"></div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + '<div><label style="' + lb + '">Quantità</label><input id="fvr-qta" type="number" step="0.01" value="1" style="' + inp + '"></div>'
    + '<div><label style="' + lb + '">Prezzo unitario €</label><input id="fvr-prezzo" type="number" step="0.01" value="0" style="' + inp + '"></div></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvSalvaRiga(\'' + offertaId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Aggiungi</button></div></div>';
  apriModal(h);
}

function fvRigaDaCatalogo() {
  var s = document.getElementById('fvr-cat');
  if (!s || !s.value) return;
  var o = s.options[s.selectedIndex];
  var d = document.getElementById('fvr-descr'), p = document.getElementById('fvr-prezzo');
  if (d) d.value = o.getAttribute('data-nome') || '';
  if (p && !parseFloat(p.value)) p.value = o.getAttribute('data-prezzo') || 0;
}

async function fvSalvaRiga(offertaId) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var d = (g('fvr-descr') || '').trim();
  if (!d) { toast('La descrizione è obbligatoria'); return; }
  var n = (_fvOff.righe || []).filter(function (r) { return r.offerta_id === offertaId; }).length;
  var cat = g('fvr-cat');
  var r = await sb.from('fv_offerte_righe').insert([{
    offerta_id: offertaId, catalogo_id: cat || null, descrizione: d,
    tipo: cat ? (document.getElementById('fvr-cat').options[document.getElementById('fvr-cat').selectedIndex].getAttribute('data-tipo') || null) : null,
    quantita: parseFloat(g('fvr-qta')) || 1,
    prezzo_unitario: parseFloat(g('fvr-prezzo')) || 0,
    ordine: n + 1
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  await _fvRicaricaRighe();
  await _fvAggiornaImponibile(offertaId);
  _fvRenderOffertaScheda();
}

async function fvRigaCampo(rigaId, campo, valore) {
  var p = {};
  p[campo] = (campo === 'descrizione') ? valore : (parseFloat(valore) || 0);
  var r = await sb.from('fv_offerte_righe').update(p).eq('id', rigaId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await _fvRicaricaRighe();
  await _fvAggiornaImponibile(_fvOffertaAperta);
  _fvRenderOffertaScheda();
}

async function fvEliminaRiga(rigaId) {
  var r = await sb.from('fv_offerte_righe').delete().eq('id', rigaId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await _fvRicaricaRighe();
  await _fvAggiornaImponibile(_fvOffertaAperta);
  _fvRenderOffertaScheda();
}

async function _fvRicaricaRighe() {
  var r = await sb.from('fv_offerte_righe').select('*').order('ordine');
  _fvOff.righe = r.data || [];
}

async function _fvAggiornaImponibile(offertaId) {
  var righe = (_fvOff.righe || []).filter(function (r) { return r.offerta_id === offertaId; });
  var imp = righe.reduce(function (s, r) { return s + Number(r.quantita || 0) * Number(r.prezzo_unitario || 0); }, 0);
  await sb.from('fv_offerte').update({ imponibile: Math.round(imp * 100) / 100 }).eq('id', offertaId);
  var o = (_fvOff.offerte || []).filter(function (x) { return x.id === offertaId; })[0];
  if (o) o.imponibile = Math.round(imp * 100) / 100;
}

// ═══ CONTRATTI ═════════════════════════════════════════════════════════════
async function fvCaricaContratti() {
  var box = document.getElementById('fvc-content');
  if (!box) return;
  box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">Caricamento…</div>';
  var _colsMov = 'id,data,tipo,importo,imponibile,aliquota_iva,descrizione,fv_contratto_id,causale_investimento_id';
  var _qMov = function (cols) { return sb.from('foglio_giornale_movimenti').select(cols).not('causale_investimento_id', 'is', null); };
  var r = await Promise.all([
    sb.from('fv_contratti').select('*').order('anno', { ascending: false }).order('numero', { ascending: false }),
    sb.from('fv_contratti_righe').select('*').order('ordine'),
    sb.from('fv_contratti_quote').select('*').order('ordine'),
    _qMov(_colsMov + ',investimento_fattura'),
    sb.from('causali_investimento').select('id,nome,tipo,ambito'),
    sb.from('fv_offerte_costi').select('*').order('ordine'),
    sb.from('fv_fornitori').select('*').order('ragione_sociale')
  ]);
  // colonna investimento_fattura non ancora creata: ricarico i movimenti senza
  var noColFatt = false;
  if (r[3] && r[3].error && /investimento_fattura/.test(r[3].error.message || '')) { noColFatt = true; r[3] = await _qMov(_colsMov); }
  if (r[6] && r[6].data) _fvForn = r[6].data;
  var movs = (r[3] && r[3].data) || [];
  var cau = {};
  ((r[4] && r[4].data) || []).forEach(function (c) { cau[c.id] = c; });
  // solo i movimenti del ramo VENDITE: incassi dai clienti e costi di commessa
  var delRamo = movs.filter(function (m) {
    var c = cau[m.causale_investimento_id];
    return c && (c.ambito || 'investimenti') === 'vendite';
  });
  _fvCon = { noColFatt: noColFatt, contratti: r[0].data || [], righe: r[1].data || [], quote: r[2].data || [],
             incassi: delRamo.filter(function (m) { return m.tipo === 'entrata'; }),
             costi: delRamo.filter(function (m) { return m.tipo === 'uscita'; }),
             causali: cau,
             costiPrevisti: (r[5] && r[5].data) || [] };
  _fvContrattoAperto = null;
  _fvRenderContratti();
}

function _fvRenderContratti() {
  var box = document.getElementById('fvc-content');
  if (_fvContrattoAperto) { _fvRenderContrattoScheda(); return; }
  var h = '<div style="margin-bottom:12px"><div style="font-size:16px;font-weight:700">📝 Contratti · impianti venduti</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Gli impianti venduti ai clienti, con l\'avanzamento dei lavori e gli incassi. Gli impianti di nostra proprietà stanno in Investimenti.</div></div>';
  if (!_fvCon.contratti.length) { box.innerHTML = h + _fvVuoto('Nessun contratto. Si genera da un\'offerta accettata.'); return; }
  h += '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:700px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">N.</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Data</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Cliente</th>'
    + '<th style="text-align:right;padding:8px 10px;border-bottom:1.5px solid var(--border)">Totale</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border);width:150px">Avanzamento</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border);width:150px">Incassato</th>'
    + '<th style="width:90px;border-bottom:1.5px solid var(--border)"></th></tr>';
  _fvCon.contratti.forEach(function (c) {
    var st = _FV_STATI_CON[c.stato] || _FV_STATI_CON.da_firmare;
    h += '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:9px 10px;font-family:var(--font-mono)">' + (c.numero || '—') + '/' + c.anno + '</td>'
      + '<td style="padding:9px 10px">' + _fvData(c.data) + '</td>'
      + '<td style="padding:9px 10px"><strong>' + _fvEsc(c.cliente_nome) + '</strong></td>'
      + '<td style="padding:9px 10px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _fvEuro(Number(c.imponibile || 0) * (1 + Number(c.aliquota_iva || 0) / 100)) + '</td>'
      + '<td style="padding:9px 10px">' + _fvBarraFasi(c, true) + '</td>'
      + '<td style="padding:9px 10px">' + _fvBarraIncassi(c, true) + '</td>'
      + '<td style="padding:9px 10px;text-align:right"><button onclick="fvApriContratto(\'' + c.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">Apri →</button></td></tr>';
  });
  h += '</table></div>';
  box.innerHTML = h;
}

function fvApriContratto(id) { _fvContrattoAperto = id; _fvRenderContrattoScheda(); }
function fvChiudiContratto() { _fvContrattoAperto = null; _fvRenderContratti(); }

async function fvGeneraContratto(offertaId) {
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  var o = (_fvOff.offerte || []).filter(function (x) { return x.id === offertaId; })[0];
  if (!o) return;
  var righe = (_fvOff.righe || []).filter(function (r) { return r.offerta_id === offertaId; });
  var esiste = await sb.from('fv_contratti').select('id').eq('offerta_id', offertaId).maybeSingle();
  if (esiste.data) { toast('Da questa offerta è già nato un contratto'); return; }

  var anno = new Date().getFullYear();
  var rMax = await sb.from('fv_contratti').select('numero').eq('anno', anno).order('numero', { ascending: false }).limit(1);
  var num = ((rMax.data && rMax.data[0] && rMax.data[0].numero) || 0) + 1;
  var descr = righe.map(function (r) { return r.descrizione; }).join('. ');
  var ins = await sb.from('fv_contratti').insert([{
    numero: num, anno: anno, data: new Date().toISOString().slice(0, 10),
    offerta_id: o.id, cliente_id: o.cliente_id, cliente_nome: o.cliente_nome,
    cliente_piva: o.cliente_piva, cliente_indirizzo: o.cliente_indirizzo,
    sito_installazione: o.sito_installazione,
    descrizione_tecnica: descr, imponibile: o.imponibile, aliquota_iva: o.aliquota_iva,
    modalita_pagamento: 'Bonifico bancario, a vista fattura per ciascuna quota',
    intestatario: _FV_AZIENDA.nome,
    riferimento_offerta: 'Offerta n. ' + o.numero + '/' + o.anno + ' del ' + _fvData(o.data),
    stato: 'da_firmare'
  }]).select('id').single();
  if (ins.error) { toast('Errore: ' + ins.error.message); return; }
  var contrattoId = ins.data.id;

  if (righe.length) {
    await sb.from('fv_contratti_righe').insert(righe.map(function (r, i) {
      return { contratto_id: contrattoId, descrizione: r.descrizione, quantita: r.quantita,
               prezzo_unitario: r.prezzo_unitario, aliquota_iva: o.aliquota_iva, ordine: i + 1 };
    }));
  }
  // quote dallo schema scelto nell'offerta
  var schema = (_fvSchemi || []).filter(function (s2) { return s2.id === o.schema_pagamento_id; })[0];
  var totIvato = Number(o.imponibile || 0) * (1 + Number(o.aliquota_iva || 0) / 100);
  if (schema && schema.quote) {
    var q = (typeof schema.quote === 'string') ? JSON.parse(schema.quote) : schema.quote;
    await sb.from('fv_contratti_quote').insert(q.map(function (x, i) {
      return { contratto_id: contrattoId, ordine: i + 1, percentuale: x.perc, evento: x.evento,
               importo_ivato: Math.round(totIvato * x.perc) / 100 };
    }));
  }
  toast('✓ Contratto n. ' + num + '/' + anno + ' creato');
  fvApriVendita('fv-vtab-contratti');
  await fvCaricaContratti();
  fvApriContratto(contrattoId);
}

var _fvConTab = 'composizione';   // 'composizione' | 'contabilita' | 'mastrino' | 'incassi'
var _fvConEdit = false;           // modifica sbloccata solo dopo conferma

function fvContrattoTab(t) { _fvConTab = t; _fvRenderContrattoScheda(); }

function fvSbloccaModifica(id) {
  if (_fvConEdit) { _fvConEdit = false; _fvRenderContrattoScheda(); return; }
  var c = (_fvCon.contratti || []).filter(function (x) { return x.id === id; })[0];
  var firmato = c && c.stato === 'firmato';
  var h = '<div style="max-width:420px">'
    + '<div style="font-size:16px;font-weight:600;margin-bottom:8px">Modificare il contratto?</div>'
    + '<div style="font-size:12.5px;color:var(--text-secondary);line-height:1.6">'
    + (firmato
        ? 'Questo contratto risulta <strong>firmato</strong>. Modificando importi, voci o quote di pagamento il documento non corrisponderà più a quello sottoscritto dal cliente: andrà ristampato e fatto firmare di nuovo.'
        : 'Si sbloccano i campi del contratto: dati, voci e quote di pagamento diventano modificabili.')
    + '</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="chiudiModal();_fvConEdit=true;_fvRenderContrattoScheda()" class="btn-primary" style="font-size:12px;padding:8px 16px">Sì, modifica</button></div></div>';
  apriModal(h);
}

function _fvRenderContrattoScheda() {
  var box = document.getElementById('fvc-content');
  var c = (_fvCon.contratti || []).filter(function (x) { return x.id === _fvContrattoAperto; })[0];
  if (!c) { _fvContrattoAperto = null; _fvRenderContratti(); return; }
  var righe = (_fvCon.righe || []).filter(function (r) { return r.contratto_id === c.id; });
  var quote = (_fvCon.quote || []).filter(function (q) { return q.contratto_id === c.id; });
  var imponibile = righe.length
    ? righe.reduce(function (s, r) { return s + Number(r.quantita || 0) * Number(r.prezzo_unitario || 0); }, 0)
    : Number(c.imponibile || 0);
  var iva = imponibile * Number(c.aliquota_iva || 0) / 100;
  var totIvato = imponibile + iva;
  var ed = _fvConEdit;
  var inp = 'width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px';
  var ro = 'padding:7px 2px;font-size:12.5px';
  var lb = 'display:block;font-size:10.5px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var st = _FV_STATI_CON[c.stato] || _FV_STATI_CON.da_firmare;

  // testata
  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:10px">';
  h += '<div><div style="font-size:16px;font-weight:700">Contratto n. ' + (c.numero || '—') + '/' + c.anno
    + ' <span style="font-size:11px;background:' + st.bg + ';color:' + st.col + ';padding:2px 9px;border-radius:9px;vertical-align:middle">' + st.lab + '</span></div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">' + _fvEsc(c.cliente_nome) + ' · ' + _fvData(c.data)
    + (c.riferimento_offerta ? ' · ' + _fvEsc(c.riferimento_offerta) : '') + '</div></div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + (_fvConTab === 'composizione'
        ? '<button onclick="fvSbloccaModifica(\'' + c.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid ' + (ed ? '#639922' : 'var(--border)') + ';border-radius:7px;background:' + (ed ? '#EAF3DE' : 'var(--bg)') + ';color:' + (ed ? '#27500A' : 'var(--text)') + ';font-weight:600;cursor:pointer">'
          + (ed ? '🔓 Modifica attiva · blocca' : '✏️ Modifica') + '</button>'
        : '')
    + '<button onclick="fvStampaContratto(\'' + c.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid #A32D2D;border-radius:7px;background:var(--bg);color:#A32D2D;font-weight:600;cursor:pointer">📄 Stampa contratto</button>'
    + '<button onclick="fvChiudiContratto()" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);cursor:pointer">← Tutti i contratti</button>'
    + '</div></div>';

  // linguette
  var tab = function (k, lab) {
    var att = (_fvConTab === k);
    return '<button onclick="fvContrattoTab(\'' + k + '\')" style="font-size:12px;padding:7px 14px;border-radius:7px;cursor:pointer;border:0.5px solid ' + (att ? '#185FA5' : 'var(--border)') + ';'
      + (att ? 'background:#185FA5;color:#fff;font-weight:600' : 'background:var(--bg);color:var(--text)') + '">' + lab + '</button>';
  };
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:12px">' + tab('composizione', '📄 Composizione contratto') + tab('contabilita', '📊 Contabilità')
    + tab('mastrino', '📒 Mastrino fornitori') + tab('incassi', '💶 Fatture e incassi cliente') + '</div>';

  if (_fvConTab === 'mastrino') { h += _fvMastrinoFornitori(c); box.innerHTML = h; return; }
  if (_fvConTab === 'incassi') { h += _fvFattureCliente(c, imponibile); box.innerHTML = h; return; }
  if (_fvConTab === 'contabilita') {
    h += _fvContabilitaContratto(c, imponibile, iva);
    box.innerHTML = h;
    return;
  }

  // ── COMPOSIZIONE DEL CONTRATTO ──────────────────────────────────────────
  var campo = function (lab, valore, html) {
    return '<div><label style="' + lb + '">' + lab + '</label>' + (ed ? html : '<div style="' + ro + '">' + (valore || '—') + '</div>') + '</div>';
  };
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  h += campo('Data', _fvData(c.data), '<input type="date" value="' + (c.data || '') + '" onchange="fvContrattoCampo(\'data\', this.value)" style="' + inp + '">');
  h += campo('Stato', st.lab, '<select onchange="fvContrattoCampo(\'stato\', this.value)" style="' + inp + '">'
    + Object.keys(_FV_STATI_CON).map(function (k) { return '<option value="' + k + '"' + (c.stato === k ? ' selected' : '') + '>' + _FV_STATI_CON[k].lab + '</option>'; }).join('') + '</select>');
  h += campo('Data firma', _fvData(c.data_firma), '<input type="date" value="' + (c.data_firma || '') + '" onchange="fvContrattoCampo(\'data_firma\', this.value)" style="' + inp + '">');
  h += '<div style="grid-column:1/4">' + campo('Sito di installazione', _fvEsc(c.sito_installazione || ''), '<input value="' + _fvEsc(c.sito_installazione || '') + '" onchange="fvContrattoCampo(\'sito_installazione\', this.value)" style="' + inp + '">') + '</div>';
  h += '<div style="grid-column:1/4">' + campo('Descrizione tecnica', _fvEsc(c.descrizione_tecnica || ''), '<textarea rows="4" onchange="fvContrattoCampo(\'descrizione_tecnica\', this.value)" style="' + inp + ';resize:vertical">' + _fvEsc(c.descrizione_tecnica || '') + '</textarea>') + '</div>';
  h += campo('IVA %', c.aliquota_iva + '%', '<input type="number" step="0.1" value="' + c.aliquota_iva + '" onchange="fvContrattoCampo(\'aliquota_iva\', this.value)" style="' + inp + '">');
  h += '<div style="grid-column:2/4">' + campo('Modalità di pagamento', _fvEsc(c.modalita_pagamento || ''), '<input value="' + _fvEsc(c.modalita_pagamento || '') + '" onchange="fvContrattoCampo(\'modalita_pagamento\', this.value)" style="' + inp + '">') + '</div>';
  h += campo('Banca', _fvEsc(c.banca_appoggio || ''), '<input value="' + _fvEsc(c.banca_appoggio || '') + '" onchange="fvContrattoCampo(\'banca_appoggio\', this.value)" style="' + inp + '">');
  h += campo('IBAN', _fvEsc(c.iban || ''), '<input value="' + _fvEsc(c.iban || '') + '" onchange="fvContrattoCampo(\'iban\', this.value)" style="' + inp + ';font-family:var(--font-mono)">');
  h += campo('Intestatario', _fvEsc(c.intestatario || ''), '<input value="' + _fvEsc(c.intestatario || '') + '" onchange="fvContrattoCampo(\'intestatario\', this.value)" style="' + inp + '">');
  h += '<div style="grid-column:1/4">' + campo('Condizioni finali', _fvEsc(c.condizioni || ''), '<textarea rows="3" onchange="fvContrattoCampo(\'condizioni\', this.value)" style="' + inp + ';resize:vertical">' + _fvEsc(c.condizioni || '') + '</textarea>') + '</div>';
  h += '</div></div>';

  // voci
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Voci del contratto</div>'
    + (ed ? '<button onclick="fvAggiungiRigaContratto(\'' + c.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Voce</button>' : '') + '</div>';
  if (!righe.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nel documento compare la sola descrizione tecnica con l\'imponibile indicato.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    righe.forEach(function (r) {
      var tot = Number(r.quantita || 0) * Number(r.prezzo_unitario || 0);
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:5px 6px">' + (ed ? '<input value="' + _fvEsc(r.descrizione) + '" onchange="fvRigaContrattoCampo(\'' + r.id + '\',\'descrizione\',this.value)" style="' + inp + '">' : _fvEsc(r.descrizione)) + '</td>'
        + '<td style="padding:5px 6px;width:80px;text-align:right;font-family:var(--font-mono)">' + (ed ? '<input type="number" step="0.01" value="' + r.quantita + '" onchange="fvRigaContrattoCampo(\'' + r.id + '\',\'quantita\',this.value)" style="' + inp + ';text-align:right">' : Number(r.quantita).toLocaleString('it-IT')) + '</td>'
        + '<td style="padding:5px 6px;width:120px;text-align:right;font-family:var(--font-mono)">' + (ed ? '<input type="number" step="0.01" value="' + r.prezzo_unitario + '" onchange="fvRigaContrattoCampo(\'' + r.id + '\',\'prezzo_unitario\',this.value)" style="' + inp + ';text-align:right">' : _fvEuro(r.prezzo_unitario)) + '</td>'
        + '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);font-weight:600;width:120px">' + _fvEuro(tot) + '</td>'
        + (ed ? '<td style="padding:5px 6px;text-align:right;width:36px"><button onclick="fvEliminaRigaContratto(\'' + r.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button></td>' : '<td style="width:36px"></td>')
        + '</tr>';
    });
    h += '</table>';
  }
  h += '<div style="display:flex;justify-content:flex-end;gap:24px;margin-top:12px;font-size:13px">'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">Imponibile</div><div style="font-family:var(--font-mono);font-weight:600">' + _fvEuro(imponibile) + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">IVA ' + c.aliquota_iva + '%</div><div style="font-family:var(--font-mono)">' + _fvEuro(iva) + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">Totale</div><div style="font-family:var(--font-mono);font-weight:700;font-size:15px">' + _fvEuro(totIvato) + '</div></div></div>';
  h += '</div>';

  // quote di pagamento
  var sommaPerc = quote.reduce(function (s, q) { return s + Number(q.percentuale || 0); }, 0);
  h += '<div class="card" style="padding:12px 14px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Quote di pagamento</div>'
    + (ed ? '<button onclick="fvAggiungiQuota(\'' + c.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Quota</button>' : '') + '</div>';
  if (!quote.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna quota impostata.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase"><th style="text-align:right;padding:5px 6px;width:70px">%</th>'
      + '<th style="text-align:left;padding:5px 6px">Evento</th><th style="text-align:right;padding:5px 6px;width:130px">Importo IVA incl.</th>'
      + '<th style="text-align:left;padding:5px 6px;width:140px">Incassata il</th><th style="width:36px"></th></tr>';
    quote.forEach(function (q) {
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono)">' + (ed ? '<input type="number" step="0.01" value="' + q.percentuale + '" onchange="fvQuotaCampo(\'' + q.id + '\',\'percentuale\',this.value,' + totIvato + ')" style="' + inp + ';text-align:right">' : Number(q.percentuale).toLocaleString('it-IT') + '%') + '</td>'
        + '<td style="padding:5px 6px">' + (ed ? '<input value="' + _fvEsc(q.evento) + '" onchange="fvQuotaCampo(\'' + q.id + '\',\'evento\',this.value)" style="' + inp + '">' : _fvEsc(q.evento)) + '</td>'
        + '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);font-weight:600">' + (ed ? '<input type="number" step="0.01" value="' + q.importo_ivato + '" onchange="fvQuotaCampo(\'' + q.id + '\',\'importo_ivato\',this.value)" style="' + inp + ';text-align:right">' : _fvEuro(q.importo_ivato)) + '</td>'
        + '<td style="padding:5px 6px">' + (ed ? '<input type="date" value="' + (q.data_incasso || '') + '" onchange="fvQuotaCampo(\'' + q.id + '\',\'data_incasso\',this.value)" style="' + inp + '">' : (q.data_incasso ? _fvData(q.data_incasso) : '—')) + '</td>'
        + (ed ? '<td style="padding:5px 6px;text-align:right"><button onclick="fvEliminaQuota(\'' + q.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button></td>' : '<td></td>')
        + '</tr>';
    });
    h += '</table>';
    if (Math.abs(sommaPerc - 100) > 0.01) {
      h += '<div style="font-size:11.5px;color:#A32D2D;margin-top:8px;font-weight:600">Le quote sommano ' + sommaPerc.toFixed(2) + '% invece di 100%.</div>';
    }
  }
  h += '</div>';
  if (!ed) {
    h += '<div style="font-size:11px;color:var(--text-muted);margin-top:10px">Contratto in sola lettura: per cambiare qualcosa usa <strong>✏️ Modifica</strong> in alto.</div>';
  }
  box.innerHTML = h;
}

// ── CONTABILITÀ DEL CONTRATTO (06/10) ──────────────────────────────────────
// Tre blocchi — avanzamento lavori, costo e pagamenti ai fornitori, vendita e
// incassi dal cliente — e sotto i numeri del margine, con entrate e uscite.
function _fvContabilitaContratto(c, imponibile, iva) {
  var totIvato = imponibile + iva;
  // COSTO DELLA COMMESSA: quello pattuito con i fornitori (fornitura + provvigioni),
  // preso dai costi dell'offerta. Non dipende da quanto e' stato pagato finora.
  var prev = (_fvCon.costiPrevisti || []).filter(function (x) { return x.offerta_id === c.offerta_id; });
  var costoImpon = prev.reduce(function (s, x) { return s + Number(x.imponibile || 0); }, 0);
  var costoIvato = prev.reduce(function (s, x) {
    return s + Number(x.imponibile || 0) * (1 + Number(x.aliquota_iva != null ? x.aliquota_iva : 0) / 100);
  }, 0);
  var costi = (_fvCon.costi || []).filter(function (m) { return m.fv_contratto_id === c.id; });
  var incassi = _fvIncassiContratto(c);
  var pagatoIvato = costi.reduce(function (s, m) { return s + Number(m.importo || 0); }, 0);
  var pagatoImpon = costi.reduce(function (s, m) { return s + _fvImponibileMov(m); }, 0);
  var totInc = incassi.reduce(function (s, m) { return s + Number(m.importo || 0); }, 0);
  // se non ci sono costi pattuiti si ripiega su quanto pagato, per non mostrare zero
  // PROVVIGIONI separate dal costo diretto: margine lordo = ricavo − costi diretti
  // (fornitura, trasporto, pratiche, altro); margine netto = lordo − provvigioni.
  var provv = prev.filter(function (x) { return x.tipo === 'commissione'; })
                  .reduce(function (s, x) { return s + Number(x.imponibile || 0); }, 0);
  if (costoImpon <= 0) {
    costoImpon = pagatoImpon; costoIvato = pagatoIvato;
    // senza costi pattuiti le provvigioni si riconoscono dalla causale del movimento
    provv = costi.filter(function (m) {
      var cau = (_fvCon.causali || {})[m.causale_investimento_id];
      return cau && /provvigion/i.test(cau.nome || '');
    }).reduce(function (s, m) { return s + _fvImponibileMov(m); }, 0);
  }
  var costoDiretto = costoImpon - provv;
  var margLordo = imponibile - costoDiretto;
  var margine = margLordo - provv;           // margine netto
  var pctL = imponibile > 0 ? (margLordo / imponibile * 100) : 0;
  var pctP = imponibile > 0 ? (provv / imponibile * 100) : 0;
  var pct = imponibile > 0 ? (margine / imponibile * 100) : 0;
  var cassa = totInc - pagatoIvato;

  var barra = function (titolo, fatto, totale, colore, etFatto, etResto) {
    var p = totale > 0 ? Math.min(100, fatto / totale * 100) : 0;
    return '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
      + '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:7px">'
      + '<div style="font-size:13px;font-weight:700">' + titolo + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + _fvEuro(totale) + '</div></div>'
      + '<div style="height:18px;border-radius:9px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden">'
      + '<div style="width:' + p.toFixed(1) + '%;height:100%;background:' + colore + '"></div></div>'
      + '<div style="display:flex;justify-content:space-between;font-size:11.5px;margin-top:5px">'
      + '<span style="font-family:var(--font-mono);color:' + colore + ';font-weight:600">' + _fvEuro(fatto) + '<span style="color:var(--text-muted);font-weight:400"> · ' + etFatto + '</span></span>'
      + '<span style="font-family:var(--font-mono);color:var(--text-muted)">' + _fvEuro(totale - fatto) + ' · ' + etResto + '</span></div></div>';
  };

  var h = '';
  // 1) stato di avanzamento
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
    + '<div style="font-size:13px;font-weight:700;margin-bottom:10px">Stato di avanzamento</div>'
    + _fvFasiEditor(c) + '</div>';
  // 2) costo impianto e pagamenti: la barra si riempie fino al costo pattuito
  h += barra('Costo impianto e pagamenti', pagatoIvato, costoIvato, '#A32D2D', 'pagato ai fornitori', 'da pagare');
  if (prev.length) {
    h += '<div style="font-size:10.5px;color:var(--text-muted);margin:-6px 0 12px 2px">Costo pattuito: '
      + prev.map(function (x) {
          return _fvEsc(x.descrizione) + ' ' + _fvEuro(x.imponibile)
            + (x.aliquota_iva ? ' + IVA ' + x.aliquota_iva + '%' : '');
        }).join(' · ') + '</div>';
  }
  // 3) vendita e incassi
  h += barra('Vendita impianto e incassi', totInc, totIvato, '#639922', 'incassato', 'residuo');

  // numeri del margine
  var cella = function (lab, val, col, sub) {
    return '<div style="flex:1;min-width:150px;border:0.5px solid var(--border);border-radius:10px;padding:11px 13px">'
      + '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div>'
      + '<div style="font-size:10.5px;color:var(--text-muted)">' + (sub || '&nbsp;') + '</div></div>';
  };
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    + cella('Ricavo (imponibile)', _fvEuro(imponibile), null, 'totale con IVA ' + _fvEuro(totIvato))
    + cella('Costo impianto', _fvEuro(costoDiretto), '#A32D2D', 'fornitura e costi diretti')
    + cella('Margine lordo', _fvEuro(margLordo), margLordo >= 0 ? '#27500A' : '#A32D2D', pctL.toFixed(1) + '% sul ricavo')
    + cella('Provvigioni', _fvEuro(provv), '#A32D2D', pctP.toFixed(1) + '% sul ricavo')
    + cella('Margine netto', _fvEuro(margine), margine >= 0 ? '#27500A' : '#A32D2D', pct.toFixed(1) + '% sul ricavo')
    + cella('Cassa ad oggi', _fvEuro(cassa), cassa >= 0 ? '#27500A' : '#A32D2D', 'incassato ' + _fvEuro(totInc) + ' − pagato ' + _fvEuro(pagatoIvato))
    + '</div>';

  // entrate e uscite affiancate
  h += '<div class="card" style="padding:12px 14px"><div style="display:grid;grid-template-columns:1fr 1fr;gap:16px">';
  h += '<div><div style="font-size:12.5px;font-weight:700;color:#27500A;margin-bottom:6px">Entrate</div>';
  if (!incassi.length) h += '<div style="font-size:11.5px;color:var(--text-muted)">Nessun incasso registrato.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px">';
    incassi.forEach(function (m) {
      h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:5px 3px;white-space:nowrap">' + _fvData(m.data) + '</td>'
        + '<td style="padding:5px 3px">' + _fvEsc(m.descrizione || '') + '</td>'
        + '<td style="padding:5px 3px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">' + _fvEuro(m.importo) + '</td></tr>';
    });
    h += '<tr style="font-weight:700"><td colspan="2" style="padding:6px 3px">Totale incassato</td><td style="padding:6px 3px;text-align:right;font-family:var(--font-mono)">' + _fvEuro(totInc) + '</td></tr>'
      + '<tr><td colspan="2" style="padding:4px 3px;color:var(--text-muted)">Residuo dal cliente</td><td style="padding:4px 3px;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + _fvEuro(totIvato - totInc) + '</td></tr></table>';
  }
  h += '</div>';
  h += '<div style="border-left:0.5px solid var(--border);padding-left:16px"><div style="font-size:12.5px;font-weight:700;color:#A32D2D;margin-bottom:6px">Uscite</div>';
  if (!costi.length) h += '<div style="font-size:11.5px;color:var(--text-muted)">Nessun costo imputato.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px">';
    costi.forEach(function (m) {
      h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:5px 3px;white-space:nowrap">' + _fvData(m.data) + '</td>'
        + '<td style="padding:5px 3px">' + _fvEsc(m.descrizione || '')
        + '<div style="font-size:10px;color:var(--text-muted)">imponibile ' + _fvEuro(_fvImponibileMov(m)) + '</div></td>'
        + '<td style="padding:5px 3px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#A32D2D">' + _fvEuro(m.importo)
        + '<div><button onclick="fvTogliCosto(\'' + m.id + '\')" style="font-size:10px;padding:2px 7px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text-muted);cursor:pointer;margin-top:3px">togli</button></div></td></tr>';
    });
    h += '<tr style="font-weight:700"><td colspan="2" style="padding:6px 3px">Totale pagato</td><td style="padding:6px 3px;text-align:right;font-family:var(--font-mono)">' + _fvEuro(pagatoIvato) + '</td></tr>'
      + '<tr><td colspan="2" style="padding:4px 3px;color:var(--text-muted)">Ancora da pagare</td><td style="padding:4px 3px;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + _fvEuro(costoIvato - pagatoIvato) + '</td></tr></table>';
  }
  h += '</div></div></div>';
  return h;
}

// ── CONTI DEL CONTRATTO VENDUTO (28/10) ────────────────────────────────────
// MASTRINO FORNITORI: un conto per ogni costo pattuito nell'offerta (fornitura,
// commissione dell'agente, ...). Le fatture del fornitore/agente si scrivono a mano
// sulla riga di costo (fv_offerte_costi.fatture, jsonb).
// FATTURE E INCASSI CLIENTE: le fatture che emettiamo noi al cliente si scrivono a
// mano sul contratto (fv_contratti.fatture, jsonb).
// Ogni movimento del foglio giornale (uscita o entrata del ramo vendite, gia'
// collegato al contratto) si lega a UNA fattura con
// foglio_giornale_movimenti.investimento_fattura: il collegamento lo fa l'utente.
// Il saldo di ogni conto parte dall'importo pattuito (costo o contratto) con IVA.
function _fvNuovoIdFatt() { return 'f' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
function _fvFattDi(x) {
  var f = x && x.fatture;
  if (typeof f === 'string') { try { f = JSON.parse(f); } catch (e) { f = null; } }
  f = Array.isArray(f) ? f : [];
  return f.map(function (y) {
    var imp = Number(y.imponibile || 0), al = y.aliq != null ? Number(y.aliq) : 0;
    return { id: y.id, num: y.num || '', data: y.data || '', imponibile: imp, aliq: al, nota: y.nota || '',
             totale: Math.round(imp * (1 + al / 100) * 100) / 100 };
  }).sort(function (a, b) { return String(a.data || '9999').localeCompare(String(b.data || '9999')); });
}
function _fvEtFatt(f) { return 'n. ' + (f.num || '?') + (f.data ? ' del ' + _fvData(f.data) : ''); }
function _fvCostiDelContratto(c) {
  return (_fvCon.costiPrevisti || []).filter(function (x) { return x.offerta_id === c.offerta_id; });
}
function _fvNomeForn(id) {
  var f = (_fvForn || []).filter(function (x) { return x.id === id; })[0];
  return f ? f.ragione_sociale : '';
}
var _FV_TIPI_COSTO = { fornitura: 'Fornitura', commissione: 'Commissione agente', trasporto: 'Trasporto', pratiche: 'Pratiche', altro: 'Altro' };

// menu "fattura" per un movimento: le fatture passate, raggruppate
function _fvSelFattMov(movId, scelta, gruppi, vuoto) {
  var h = '<select onchange="fvCollegaFattMov(\'' + movId + '\',this.value)" style="font-size:11px;padding:3px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);max-width:230px">'
    + '<option value="">' + vuoto + '</option>';
  var trovata = false;
  gruppi.forEach(function (g) {
    if (!g.fatture.length) return;
    h += g.nome ? '<optgroup label="' + _fvEsc(g.nome) + '">' : '';
    g.fatture.forEach(function (f) {
      if (f.id === scelta) trovata = true;
      h += '<option value="' + _fvEsc(f.id) + '"' + (f.id === scelta ? ' selected' : '') + '>Fatt. ' + _fvEsc(_fvEtFatt(f)) + ' · ' + _fvEuro(f.totale) + '</option>';
    });
    h += g.nome ? '</optgroup>' : '';
  });
  if (scelta && !trovata) h += '<option value="' + _fvEsc(scelta) + '" selected>fattura non più presente</option>';
  return h + '</select>';
}

// conto con il mastrino unico a linguette (_pfMastrino, in pf-investimenti.js)
function _fvMastrinoPf(o) {
  if (typeof _pfMastrino !== 'function') return '<div class="card" style="padding:14px;color:#A32D2D">Manca pf-investimenti.js aggiornato: serve per disegnare il mastrino.</div>';
  return _pfMastrino(o);
}
function _fvAzioniFatt(kind, ownerId) {
  if (!_fvPuo()) return null;
  return function (f) {
    return '<button onclick="fvModaleFattFv(\'' + kind + '\',\'' + ownerId + '\',\'' + _fvEsc(f.id) + '\')" title="Modifica" style="border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;padding:3px 7px">✏️</button> '
      + '<button onclick="fvEliminaFattFv(\'' + kind + '\',\'' + ownerId + '\',\'' + _fvEsc(f.id) + '\')" title="Elimina" style="border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;padding:3px 7px">🗑️</button>';
  };
}
function _fvMovPf(m) { return { id: m.id, data: m.data, importo: Number(m.importo || 0), descr: m.descrizione || '', fattId: m.investimento_fattura || '' }; }

// linguetta 📒 MASTRINO FORNITORI: si sceglie il fornitore/agente dalla fila in alto
var _fvMastForn = {};
function fvMastScegliForn(contrattoId, costoId) { _fvMastForn[contrattoId] = costoId; _fvRenderContrattoScheda(); }
function _fvMastrinoFornitori(c) {
  var costi = _fvCostiDelContratto(c);
  var h = '';
  if (_fvCon.noColFatt) h += '<div style="margin-bottom:10px;background:#FFF1DC;border-left:3px solid #E0A458;padding:8px 10px;font-size:11.5px;color:#633806">⚠ Per collegare pagamenti e incassi alle fatture va lanciato l\'SQL della colonna investimento_fattura.</div>';
  if (!costi.length) {
    return h + '<div class="card" style="padding:14px;font-size:12px;color:var(--text-muted)">L\'offerta di questo contratto non ha costi pattuiti: aggiungili nell\'offerta (fornitura, commissione agente…) per avere un conto per ciascun fornitore.</div>';
  }
  var gruppi = costi.map(function (x) { return { nome: (_fvNomeForn(x.fornitore_id) || x.descrizione), fatture: _fvFattDi(x) }; });
  var pag = (_fvCon.costi || []).filter(function (m) { return m.fv_contratto_id === c.id; });
  var tutteId = {};
  gruppi.forEach(function (g) { g.fatture.forEach(function (f) { tutteId[f.id] = 1; }); });
  var liberi = pag.filter(function (m) { return !(m.investimento_fattura && tutteId[m.investimento_fattura]); });
  var sel = _fvMastForn[c.id];
  if (!costi.some(function (x) { return x.id === sel; })) sel = costi[0].id;
  // fila dei fornitori / agenti
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:10px">';
  costi.forEach(function (x) {
    var on = x.id === sel, ag = x.tipo === 'commissione', nome = _fvNomeForn(x.fornitore_id) || (ag ? 'Agente non indicato' : 'Fornitore non indicato');
    h += '<button onclick="fvMastScegliForn(\'' + c.id + '\',\'' + x.id + '\')" style="padding:7px 12px;border-radius:18px;cursor:pointer;font-size:12px;border:0.5px solid ' + (on ? '#185FA5' : 'var(--border)') + ';'
      + (on ? 'background:#185FA5;color:#fff;font-weight:700' : 'background:var(--bg);color:var(--text)') + '">' + (ag ? '🤝 ' : '🏭 ') + _fvEsc(nome)
      + ' <span style="opacity:.8;font-weight:400">· ' + _fvEsc(_FV_TIPI_COSTO[x.tipo] || x.tipo) + '</span></button>';
  });
  h += '</div>';
  var x = costi.filter(function (y) { return y.id === sel; })[0];
  var ff = _fvFattDi(x), ids = {};
  ff.forEach(function (f) { ids[f.id] = 1; });
  var nome = _fvNomeForn(x.fornitore_id), agente = x.tipo === 'commissione';
  var bt = function (onclick, txt, col) {
    col = col || '#185FA5';
    return '<button onclick="' + onclick + '" style="font-size:11.5px;padding:5px 11px;border:0.5px solid ' + col + ';border-radius:6px;background:var(--bg);color:' + col + ';font-weight:600;cursor:pointer">' + txt + '</button>';
  };
  var puo = _fvPuo(), conCol = puo && !_fvCon.noColFatt;
  var selMov = function (m) { return _fvSelFattMov(m.id, m.fattId || '', gruppi, '— senza fattura —'); };
  h += _fvMastrinoPf({
    chiave: 'fvf-' + x.id, verso: 'forn', dataPatto: c.data,
    titolo: (agente ? '🤝 ' : '🏭 ') + _fvEsc(nome || (agente ? 'Agente non indicato' : 'Fornitore non indicato')),
    sotto: _fvEsc(_FV_TIPI_COSTO[x.tipo] || x.tipo) + ' · ' + _fvEsc(x.descrizione || ''),
    btns: puo ? bt('fvModaleFattFv(\'costo\',\'' + x.id + '\')', '＋ Fattura ricevuta')
      + bt('fvModaleCosto(\'' + c.offerta_id + '\',\'' + x.id + '\',true)', '✏️ ' + (nome ? 'Costo' : (agente ? 'Scegli l\'agente' : 'Scegli il fornitore')), 'var(--text-muted)') : '',
    pattImp: Number(x.imponibile || 0), aliq: Number(x.aliquota_iva != null ? x.aliquota_iva : 0),
    fatture: ff, azioniFatt: _fvAzioniFatt('costo', x.id),
    movs: pag.filter(function (m) { return m.investimento_fattura && ids[m.investimento_fattura]; }).map(_fvMovPf),
    selFatt: conCol ? selMov : null,
    daCollegare: liberi.map(_fvMovPf), daCollegareSel: conCol ? function (m) { return _fvSelFattMov(m.id, '', gruppi, '— scegli la fattura —'); } : null,
    nota: 'I pagamenti sono le uscite del foglio giornale con causale del ramo vendite, imputate a questo contratto in Contabilità. Quelli non ancora legati a una fattura sono nella linguetta Pagamenti effettuati, in “Da collegare”.'
  });
  return h;
}

// linguetta 💶 FATTURE E INCASSI CLIENTE
function _fvFattureCliente(c, imponibile) {
  var ff = _fvFattDi(c);
  var gruppi = [{ nome: '', fatture: ff }];
  var puo = _fvPuo(), conCol = puo && !_fvCon.noColFatt;
  var h = '';
  if (_fvCon.noColFatt) h += '<div style="margin-bottom:10px;background:#FFF1DC;border-left:3px solid #E0A458;padding:8px 10px;font-size:11.5px;color:#633806">⚠ Per collegare gli incassi alle fatture va lanciato l\'SQL della colonna investimento_fattura.</div>';
  var extra = '';
  var liberi = (_fvCon.incassi || []).filter(function (m) { return !m.fv_contratto_id; });
  if (liberi.length && puo) {
    extra += '<div style="margin-top:12px;padding:9px 11px;background:#FFF7E0;border-left:3px solid #BA7517;border-radius:0 6px 6px 0">'
      + '<div style="font-size:12px;font-weight:700;margin-bottom:4px">Incassi del ramo fotovoltaico non ancora collegati a un contratto (' + liberi.length + ')</div>'
      + '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    liberi.forEach(function (m) {
      extra += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:5px 4px;white-space:nowrap">' + _fvData(m.data) + '</td>'
        + '<td style="padding:5px 4px">' + _fvEsc(m.descrizione || '') + '</td>'
        + '<td style="padding:5px 4px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">' + _fvEuro(m.importo) + '</td>'
        + '<td style="padding:5px 4px;text-align:right"><button onclick="fvImputaIncasso(\'' + m.id + '\',\'' + c.id + '\')" style="font-size:10.5px;padding:3px 9px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">collega a questo contratto</button></td></tr>';
    });
    extra += '</table></div>';
  }
  h += _fvMastrinoPf({
    chiave: 'fvc-' + c.id, verso: 'cli', dataPatto: c.data,
    titolo: '💶 ' + _fvEsc(c.cliente_nome || 'Cliente'),
    sotto: 'Fatture che emettiamo noi al cliente e incassi ricevuti. Gli incassi si legano alla fattura, non alla rata.',
    btns: puo ? '<button onclick="fvModaleFattFv(\'contratto\',\'' + c.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">＋ Fattura emessa</button>' : '',
    pattImp: Number(imponibile || 0), aliq: Number(c.aliquota_iva || 0),
    fatture: ff, azioniFatt: _fvAzioniFatt('contratto', c.id),
    movs: _fvIncassiContratto(c).map(_fvMovPf),
    selFatt: conCol ? function (m) { return _fvSelFattMov(m.id, m.fattId || '', gruppi, '— senza fattura —'); } : null,
    extraMov: extra
  });
  return h;
}

// ── MODALE FATTURA (ricevuta da fornitore/agente o emessa al cliente) ──
function _fvOwnerFatt(kind, ownerId) {
  if (kind === 'costo') return (_fvCon.costiPrevisti || []).filter(function (x) { return x.id === ownerId; })[0];
  return (_fvCon.contratti || []).filter(function (x) { return x.id === ownerId; })[0];
}
function fvModaleFattFv(kind, ownerId, fattId) {
  var ow = _fvOwnerFatt(kind, ownerId);
  if (!ow) { toast('Non trovato'); return; }
  var f = fattId ? _fvFattDi(ow).filter(function (x) { return x.id === fattId; })[0] : null;
  var aliq = Number(ow.aliquota_iva != null ? ow.aliquota_iva : 10);
  var forn = kind === 'costo';
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var chi = forn ? (_fvNomeForn(ow.fornitore_id) || ow.descrizione) : ow.cliente_nome;
  var h = '<div style="max-width:520px"><div style="font-size:16px;font-weight:600;margin-bottom:2px">' + (f ? '✏️ Fattura ' + _fvEsc(_fvEtFatt(f)) : (forn ? '＋ Fattura ricevuta' : '＋ Fattura emessa al cliente')) + '</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">' + _fvEsc(chi || '') + '</div>'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + '<div><label style="' + lb + '">Numero fattura *</label><input id="fvff-num" value="' + _fvEsc(f ? f.num : '') + '" style="' + inp + ';font-family:var(--font-mono)"></div>'
    + '<div><label style="' + lb + '">Data fattura *</label><input id="fvff-data" type="date" value="' + _fvEsc(f ? f.data : '') + '" style="' + inp + '"></div>'
    + '<div><label style="' + lb + '">Imponibile € *</label><input id="fvff-imp" type="number" step="0.01" min="0" value="' + (f ? f.imponibile.toFixed(2) : '') + '" oninput="fvFattFvCalc()" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>'
    + '<div><label style="' + lb + '">IVA %</label><input id="fvff-iva" type="number" step="0.1" min="0" value="' + (f ? f.aliq : aliq) + '" oninput="fvFattFvCalc()" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>'
    + '<div style="grid-column:1/3"><label style="' + lb + '">Nota</label><input id="fvff-nota" value="' + _fvEsc(f ? f.nota : '') + '" maxlength="200" style="' + inp + '"></div>'
    + '</div><div id="fvff-calc" style="font-size:12px;margin-top:8px;color:var(--text-muted)"></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvSalvaFattFv(\'' + kind + '\',\'' + ownerId + '\',\'' + _fvEsc(fattId || '') + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
  fvFattFvCalc();
}
function fvFattFvCalc() {
  var box = document.getElementById('fvff-calc');
  if (!box) return;
  var imp = parseFloat((document.getElementById('fvff-imp') || {}).value) || 0;
  var iva = parseFloat((document.getElementById('fvff-iva') || {}).value);
  if (!isFinite(iva) || iva < 0) iva = 0;
  var t = Math.round(imp * (1 + iva / 100) * 100) / 100;
  box.innerHTML = 'Totale fattura <strong style="font-family:var(--font-mono);color:var(--text)">' + _fvEuro(t) + '</strong> · IVA <span style="font-family:var(--font-mono)">' + _fvEuro(t - imp) + '</span>';
}
async function _fvScriviFattFv(kind, ow, lista) {
  var tab = kind === 'costo' ? 'fv_offerte_costi' : 'fv_contratti';
  var r = await sb.from(tab).update({ fatture: lista }).eq('id', ow.id);
  if (r.error) { toast('Errore: ' + r.error.message + (/column/i.test(r.error.message) ? ' — lancia prima l\'SQL delle colonne nuove' : '')); return false; }
  ow.fatture = lista;
  return true;
}
async function fvSalvaFattFv(kind, ownerId, fattId) {
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  var ow = _fvOwnerFatt(kind, ownerId);
  if (!ow) return;
  var g = function (id) { var e = document.getElementById(id); return e ? e.value : ''; };
  var numF = g('fvff-num').trim(), data = g('fvff-data'), imp = parseFloat(g('fvff-imp')), iva = parseFloat(g('fvff-iva'));
  if (!numF) { toast('Scrivi il numero della fattura'); return; }
  if (!data) { toast('Indica la data della fattura'); return; }
  if (!isFinite(imp) || imp <= 0) { toast('Indica l\'imponibile'); return; }
  if (!isFinite(iva) || iva < 0) { toast('Aliquota IVA non valida'); return; }
  var lista = _fvFattDi(ow).map(function (x) { return { id: x.id, num: x.num, data: x.data, imponibile: x.imponibile, aliq: x.aliq, nota: x.nota || null }; });
  if (lista.some(function (x) { return x.id !== fattId && String(x.num).trim().toLowerCase() === numF.toLowerCase(); })
      && !confirm('C\'è già una fattura n. ' + numF + ' qui. Salvo lo stesso?')) return;
  var nuova = { id: fattId || _fvNuovoIdFatt(), num: numF, data: data, imponibile: Math.round(imp * 100) / 100, aliq: iva, nota: g('fvff-nota').trim() || null };
  var pos = -1; lista.forEach(function (x, k) { if (x.id === nuova.id) pos = k; });
  if (pos >= 0) lista[pos] = nuova; else lista.push(nuova);
  if (!(await _fvScriviFattFv(kind, ow, lista))) return;
  if (typeof _auditLog === 'function') _auditLog('fotovoltaico', kind === 'costo' ? 'fv_offerte_costi' : 'fv_contratti', (fattId ? 'modificata' : 'registrata') + ' fattura ' + numF + ' ' + _fvEuro(nuova.imponibile));
  chiudiModal();
  toast('✓ Fattura salvata');
  _fvRenderContrattoScheda();
}
async function fvEliminaFattFv(kind, ownerId, fattId) {
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  var ow = _fvOwnerFatt(kind, ownerId);
  if (!ow) return;
  var f = _fvFattDi(ow).filter(function (x) { return x.id === fattId; })[0];
  if (!f) return;
  var tutti = (_fvCon.costi || []).concat(_fvCon.incassi || []);
  var coll = tutti.filter(function (m) { return m.investimento_fattura === fattId; });
  if (!confirm('Elimino la fattura ' + _fvEtFatt(f) + '?' + (coll.length ? '\n' + coll.length + ' moviment' + (coll.length === 1 ? 'o resta' : 'i restano') + ' sul contratto, senza fattura.' : ''))) return;
  var lista = _fvFattDi(ow).filter(function (x) { return x.id !== fattId; })
    .map(function (x) { return { id: x.id, num: x.num, data: x.data, imponibile: x.imponibile, aliq: x.aliq, nota: x.nota || null }; });
  if (!(await _fvScriviFattFv(kind, ow, lista))) return;
  if (coll.length) {
    var r = await sb.from('foglio_giornale_movimenti').update({ investimento_fattura: null }).eq('investimento_fattura', fattId);
    if (r.error) toast('Errore sui movimenti collegati: ' + r.error.message);
    else coll.forEach(function (m) { m.investimento_fattura = null; });
  }
  toast('✓ Fattura eliminata');
  _fvRenderContrattoScheda();
}
async function fvCollegaFattMov(movId, fattId) {
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  var r = await sb.from('foglio_giornale_movimenti').update({ investimento_fattura: fattId || null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message + (/column/i.test(r.error.message) ? ' — lancia prima l\'SQL della colonna investimento_fattura' : '')); return; }
  (_fvCon.costi || []).concat(_fvCon.incassi || []).forEach(function (m) { if (m.id === movId) m.investimento_fattura = fattId || null; });
  if (typeof _auditLog === 'function') _auditLog('fotovoltaico', 'foglio_giornale_movimenti', 'movimento ' + movId + (fattId ? ' collegato alla fattura ' + fattId : ' senza fattura'));
  toast(fattId ? '✓ Collegato alla fattura' : '✓ Movimento senza fattura');
  _fvRenderContrattoScheda();
}

async function fvContrattoCampo(campo, valore) {
  var c = (_fvCon.contratti || []).filter(function (x) { return x.id === _fvContrattoAperto; })[0];
  if (!c) return;
  var p = {};
  p[campo] = (campo === 'aliquota_iva') ? (parseFloat(valore) || 0) : (valore || null);
  var r = await sb.from('fv_contratti').update(p).eq('id', c.id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  c[campo] = p[campo];
  _fvRenderContrattoScheda();
}

function fvAggiungiRigaContratto(contrattoId) {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var h = '<div style="max-width:460px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">Aggiungi voce al contratto</div>'
    + '<div style="display:grid;gap:10px">'
    + '<input id="fvrc-descr" placeholder="Descrizione" style="' + inp + '">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + '<input id="fvrc-qta" type="number" step="0.01" value="1" placeholder="Quantità" style="' + inp + '">'
    + '<input id="fvrc-prezzo" type="number" step="0.01" value="0" placeholder="Prezzo €" style="' + inp + '"></div></div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvSalvaRigaContratto(\'' + contrattoId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Aggiungi</button></div></div>';
  apriModal(h);
}

async function fvSalvaRigaContratto(contrattoId) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var d = (g('fvrc-descr') || '').trim();
  if (!d) { toast('La descrizione è obbligatoria'); return; }
  var n = (_fvCon.righe || []).filter(function (r) { return r.contratto_id === contrattoId; }).length;
  var r = await sb.from('fv_contratti_righe').insert([{
    contratto_id: contrattoId, descrizione: d,
    quantita: parseFloat(g('fvrc-qta')) || 1, prezzo_unitario: parseFloat(g('fvrc-prezzo')) || 0,
    ordine: n + 1
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
  await _fvRicaricaContratto(contrattoId);
}

async function fvRigaContrattoCampo(id, campo, valore) {
  var p = {}; p[campo] = (campo === 'descrizione') ? valore : (parseFloat(valore) || 0);
  var r = await sb.from('fv_contratti_righe').update(p).eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await _fvRicaricaContratto(_fvContrattoAperto);
}

async function fvEliminaRigaContratto(id) {
  var r = await sb.from('fv_contratti_righe').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await _fvRicaricaContratto(_fvContrattoAperto);
}

function fvAggiungiQuota(contrattoId) {
  var quote = (_fvCon.quote || []).filter(function (q) { return q.contratto_id === contrattoId; });
  sb.from('fv_contratti_quote').insert([{ contratto_id: contrattoId, ordine: quote.length + 1, percentuale: 0, evento: 'Nuova quota', importo_ivato: 0 }])
    .then(function () { _fvRicaricaContratto(contrattoId); });
}

async function fvQuotaCampo(id, campo, valore, totIvato) {
  var p = {};
  if (campo === 'percentuale') {
    p.percentuale = parseFloat(valore) || 0;
    if (totIvato) p.importo_ivato = Math.round(totIvato * p.percentuale) / 100;
  } else if (campo === 'importo_ivato') p.importo_ivato = parseFloat(valore) || 0;
  else p[campo] = valore || null;
  var r = await sb.from('fv_contratti_quote').update(p).eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await _fvRicaricaContratto(_fvContrattoAperto);
}

async function fvEliminaQuota(id) {
  var r = await sb.from('fv_contratti_quote').delete().eq('id', id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await _fvRicaricaContratto(_fvContrattoAperto);
}

async function _fvRicaricaContratto(contrattoId) {
  var r = await Promise.all([
    sb.from('fv_contratti_righe').select('*').order('ordine'),
    sb.from('fv_contratti_quote').select('*').order('ordine')
  ]);
  _fvCon.righe = r[0].data || [];
  _fvCon.quote = r[1].data || [];
  // imponibile ricalcolato dalle righe
  var righe = _fvCon.righe.filter(function (x) { return x.contratto_id === contrattoId; });
  if (righe.length) {
    var imp = Math.round(righe.reduce(function (s, x) { return s + Number(x.quantita || 0) * Number(x.prezzo_unitario || 0); }, 0) * 100) / 100;
    await sb.from('fv_contratti').update({ imponibile: imp }).eq('id', contrattoId);
    var c = (_fvCon.contratti || []).filter(function (x) { return x.id === contrattoId; })[0];
    if (c) c.imponibile = imp;
  }
  _fvRenderContrattoScheda();
}

// ═══ PRODUZIONE · LETTURA DEL PDF PVGIS (29/10) ═════════════════════════════
// Il PDF di PVGIS ("Rendimento FV connesso in rete", italiano o inglese) si legge nel
// browser con pdf.js (lib/pdf.min.js, Mozilla, gratuito): si ricavano coordinate,
// inclinazione, orientamento, perdite, database, potenza della simulazione, produzione
// annua e i 12 valori mensili. Tutto si riporta a 1 kWp (resa), cosi' la produzione
// dell'offerta = resa x kWp dell'impianto. Il PDF originale si salva nello spazio file
// Supabase "fv-documenti"; i valori in fv_offerte.pvgis (jsonb).
var _fvPdfLibP = null;
function _fvPdfLib() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (_fvPdfLibP) return _fvPdfLibP;
  _fvPdfLibP = new Promise(function (ok, ko) {
    var s = document.createElement('script');
    s.src = 'lib/pdf.min.js?v=3.11.174';
    s.onload = function () {
      if (!window.pdfjsLib) { ko(new Error('lettore PDF non caricato')); return; }
      window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js?v=3.11.174';
      ok(window.pdfjsLib);
    };
    s.onerror = function () { _fvPdfLibP = null; ko(new Error('manca lib/pdf.min.js')); };
    document.head.appendChild(s);
  });
  return _fvPdfLibP;
}
// testo del PDF come elenco di pezzi, nell'ordine in cui sono scritti
async function _fvPdfPezzi(file) {
  var lib = await _fvPdfLib();
  var buf = await file.arrayBuffer();
  var doc = await lib.getDocument({ data: new Uint8Array(buf) }).promise;
  var out = [];
  for (var i = 1; i <= Math.min(doc.numPages, 4); i++) {
    var tc = await (await doc.getPage(i)).getTextContent();
    tc.items.forEach(function (it) { var t = String(it.str || '').trim(); if (t) out.push(t); });
  }
  return out;
}
var _FV_MESI_PV = [
  ['gennaio', 'january'], ['febbraio', 'february'], ['marzo', 'march'], ['aprile', 'april'], ['maggio', 'may'], ['giugno', 'june'],
  ['luglio', 'july'], ['agosto', 'august'], ['settembre', 'september'], ['ottobre', 'october'], ['novembre', 'november'], ['dicembre', 'december']
];
function _fvNumPV(t) { var m = String(t || '').replace(',', '.').match(/-?\d+(?:\.\d+)?/); return m ? parseFloat(m[0]) : null; }
function _fvLeggiPVGIS(pz) {
  var low = pz.map(function (x) { return x.toLowerCase(); });
  var dopo = function (etichette) {   // valore = pezzo dopo l'etichetta (o il resto dello stesso pezzo)
    for (var i = 0; i < low.length; i++) {
      for (var k = 0; k < etichette.length; k++) {
        var e = etichette[k];
        if (low[i].indexOf(e) === 0) {
          var resto = pz[i].slice(e.length).replace(/^[:\s]+/, '');
          return resto ? resto : (pz[i + 1] || '');
        }
      }
    }
    return '';
  };
  if (!low.some(function (x) { return x.indexOf('pvgis') >= 0; })) throw new Error('non sembra un PDF di PVGIS');
  var latlon = dopo(['latitudine/longitudine', 'latitude/longitude']);
  var ll = latlon.match(/(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)/);
  var kwpSim = _fvNumPV(dopo(['fv installato', 'pv installed', 'installed peak pv power', 'potenza di picco fv installata'])) || 1;
  var annua = _fvNumPV(dopo(['produzione annuale fv', 'yearly pv energy production']));
  var mesi = [];
  _FV_MESI_PV.forEach(function (nomi, m) {
    for (var i = 0; i < low.length; i++) {
      if (nomi.indexOf(low[i]) >= 0) { var v = _fvNumPV(pz[i + 1]); if (v != null) { mesi[m] = v; return; } }
    }
  });
  var mancano = [];
  if (!annua) mancano.push('produzione annuale');
  if (mesi.filter(function (x) { return x != null; }).length !== 12) mancano.push('valori mensili');
  if (mancano.length) throw new Error('nel PDF non trovo: ' + mancano.join(', '));
  var r1 = function (x) { return Math.round(x * 100) / 100; };
  return {
    lat: ll ? parseFloat(ll[1]) : null, lon: ll ? parseFloat(ll[2]) : null,
    inclinazione: _fvNumPV(dopo(['angolo inclinazione', 'slope angle'])),
    orientamento: _fvNumPV(dopo(['angolo orientamento', 'azimuth angle'])),
    perdite: _fvNumPV(dopo(['perdite di sistema', 'system loss'])),
    database: dopo(['database solare', 'solar radiation database']) || null,
    tecnologia: dopo(['tecnologia fv', 'pv technology']) || null,
    kwp_simulazione: kwpSim,
    irraggiamento: _fvNumPV(dopo(['irraggiamento annuale', 'yearly in-plane irradiation'])),
    resa: r1(annua / kwpSim),                                  // kWh per kWp all'anno
    mensili: mesi.map(function (v) { return r1(v / kwpSim); })  // kWh per kWp, gen..dic
  };
}

function _fvPvgisDi(o) {
  var p = o && o.pvgis;
  if (typeof p === 'string') { try { p = JSON.parse(p); } catch (e) { p = null; } }
  return p && p.resa ? p : null;
}
var _fvPvgisLetto = null;   // lettura in attesa di conferma: { offertaId, dati, file }
function fvPvgisScegli(offertaId) {
  var i = document.createElement('input');
  i.type = 'file'; i.accept = 'application/pdf,.pdf';
  i.onchange = function () { if (i.files && i.files[0]) fvPvgisLeggi(offertaId, i.files[0]); };
  i.click();
}
async function fvPvgisLeggi(offertaId, file) {
  toast('Lettura del PDF…');
  var dati;
  try { dati = _fvLeggiPVGIS(await _fvPdfPezzi(file)); }
  catch (e) { alert('PDF PVGIS non letto: ' + e.message + '.\nControlla che sia il PDF scaricato da PVGIS ("Rendimento FV connesso in rete").'); return; }
  _fvPvgisLetto = { offertaId: offertaId, dati: dati, file: file };
  var o = (_fvOff.offerte || []).filter(function (x) { return x.id === offertaId; })[0] || {};
  var kwp = Number(o.potenza_kwp || 0);
  var riga = function (l, v) { return '<tr><td style="padding:5px 6px;color:var(--text-muted)">' + l + '</td><td style="padding:5px 6px;text-align:right;font-family:var(--font-mono)">' + v + '</td></tr>'; };
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:2px">📄 Dati letti dal PDF PVGIS</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">' + _fvEsc(file.name) + ' · controlla e conferma</div>'
    + '<table style="width:100%;border-collapse:collapse;font-size:12.5px">'
    + riga('Coordinate', dati.lat != null ? dati.lat + ', ' + dati.lon : '—')
    + riga('Inclinazione / orientamento', (dati.inclinazione != null ? dati.inclinazione + '°' : '—') + ' / ' + (dati.orientamento != null ? dati.orientamento + '°' : '—'))
    + riga('Perdite di sistema', dati.perdite != null ? dati.perdite + ' %' : '—')
    + riga('Database / tecnologia', _fvEsc((dati.database || '—') + ' · ' + (dati.tecnologia || '—')))
    + riga('Potenza della simulazione', dati.kwp_simulazione + ' kWp')
    + riga('<b>Resa</b>', '<b>' + _fvNumDoc(dati.resa, 1) + ' kWh/kWp all\'anno</b>')
    + riga('Produzione con ' + (kwp ? _fvNumDoc(kwp, 2) + ' kWp' : 'la potenza dell\'offerta'), kwp ? '<b>' + _fvNumDoc(dati.resa * kwp) + ' kWh/anno</b>' : 'scrivi prima la potenza kWp')
    + '</table>' + _fvPvgisBarre(dati.mensili, 70)
    + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">I valori mensili sono per 1 kWp e si moltiplicano per la potenza dell\'impianto. Il PDF resta salvato nell\'offerta.</div>'
    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvPvgisConferma()" class="btn-primary" style="font-size:12px;padding:8px 16px">Conferma e salva</button></div></div>';
  apriModal(h);
}
function _fvPvgisBarre(mensili, alt) {
  var max = Math.max.apply(null, mensili) || 1, L = 'GFMAMGLASOND';
  return '<div style="display:grid;grid-template-columns:repeat(12,1fr);gap:3px;align-items:end;height:' + (alt + 16) + 'px;margin-top:10px">'
    + mensili.map(function (v, i) {
        return '<div style="text-align:center;font-size:9.5px;color:var(--text-muted)"><div title="' + _fvNumDoc(v, 1) + ' kWh/kWp" style="height:' + Math.max(2, Math.round(v / max * alt)) + 'px;background:#F5A623;border-radius:3px 3px 0 0;margin:0 auto 2px;width:75%"></div>' + L[i] + '</div>';
      }).join('') + '</div>';
}
async function fvPvgisConferma() {
  var x = _fvPvgisLetto;
  if (!x) return;
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  var o = (_fvOff.offerte || []).filter(function (y) { return y.id === x.offertaId; })[0];
  if (!o) return;
  var dati = Object.assign({}, x.dati, { file_nome: x.file.name, letto_il: new Date().toISOString().slice(0, 10) });
  var path = 'offerte/' + o.id + '/pvgis.pdf';
  var up = await sb.storage.from('fv-documenti').upload(path, x.file, { upsert: true, contentType: 'application/pdf' });
  if (up.error) toast('PDF non salvato (' + up.error.message + '): i dati si salvano lo stesso');
  else dati.file_path = path;
  var p = { pvgis: dati };
  if (Number(o.potenza_kwp) > 0) p.produzione_kwh_anno = Math.round(dati.resa * Number(o.potenza_kwp));
  var r = await sb.from('fv_offerte').update(p).eq('id', o.id);
  if (r.error) { toast('Errore: ' + r.error.message + (/pvgis/.test(r.error.message) ? ' — lancia prima l\'SQL della colonna pvgis' : '')); return; }
  Object.keys(p).forEach(function (k) { o[k] = p[k]; });
  if (typeof _auditLog === 'function') _auditLog('fotovoltaico', 'fv_offerte', 'PVGIS letto per offerta ' + o.numero + '/' + o.anno + ': ' + dati.resa + ' kWh/kWp');
  _fvPvgisLetto = null;
  chiudiModal();
  toast('✓ Dati PVGIS salvati');
  _fvRenderOffertaScheda();
}
async function fvPvgisApri(offertaId) {
  var o = (_fvOff.offerte || []).filter(function (y) { return y.id === offertaId; })[0];
  var pv = _fvPvgisDi(o);
  if (!pv || !pv.file_path) { toast('PDF non salvato'); return; }
  var w = window.open('', '_blank');
  var r = await sb.storage.from('fv-documenti').createSignedUrl(pv.file_path, 600);
  if (r.error) { if (w) w.close(); toast('Errore: ' + r.error.message); return; }
  if (w) w.location = r.data.signedUrl; else window.open(r.data.signedUrl, '_blank');
}
async function fvPvgisTogli(offertaId) {
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  if (!confirm('Togliere i dati PVGIS da questa offerta? La produzione annua resta quella attuale e si può scrivere a mano.')) return;
  var o = (_fvOff.offerte || []).filter(function (y) { return y.id === offertaId; })[0];
  var pv = _fvPvgisDi(o);
  var r = await sb.from('fv_offerte').update({ pvgis: null }).eq('id', offertaId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  if (pv && pv.file_path) await sb.storage.from('fv-documenti').remove([pv.file_path]);
  o.pvgis = null;
  _fvRenderOffertaScheda();
}
// riquadro nella scheda offerta
function _fvBloccoPVGIS(o) {
  var pv = _fvPvgisDi(o), kwp = Number(o.potenza_kwp || 0);
  var bt = function (onclick, txt, col) {
    return '<button onclick="' + onclick + '" style="font-size:11.5px;padding:5px 11px;border:0.5px solid ' + (col || '#185FA5') + ';border-radius:6px;background:var(--bg);color:' + (col || '#185FA5') + ';font-weight:600;cursor:pointer">' + txt + '</button>';
  };
  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">'
    + '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
    + '<div><div style="font-size:13px;font-weight:700">☀️ Produzione · PVGIS</div><div style="font-size:11px;color:var(--text-muted)">'
    + (pv ? 'Letto da ' + _fvEsc(pv.file_nome || 'PDF') + (pv.letto_il ? ' il ' + _fvData(pv.letto_il) : '') : 'Carica il PDF di PVGIS del sito: coordinate, resa e produzione mese per mese si compilano da sole.') + '</div></div>'
    + (_fvPuo() ? '<div style="display:flex;gap:6px;flex-wrap:wrap">'
        + (pv && pv.file_path ? bt('fvPvgisApri(\'' + o.id + '\')', '📄 Apri PDF', 'var(--text-muted)') : '')
        + bt('fvPvgisScegli(\'' + o.id + '\')', pv ? '↻ Carica un altro PDF' : '📄 Carica PDF PVGIS')
        + (pv ? bt('fvPvgisTogli(\'' + o.id + '\')', '🗑️', '#A32D2D') : '') + '</div>' : '')
    + '</div>';
  if (pv) {
    var k = function (l, v) { return '<div style="flex:1;min-width:120px;background:var(--bg);border-radius:8px;padding:7px 10px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">' + l + '</div><div style="font-family:var(--font-mono);font-size:13.5px;font-weight:700">' + v + '</div></div>'; };
    h += '<div style="display:flex;gap:8px;flex-wrap:wrap">'
      + k('Coordinate', pv.lat != null ? pv.lat + ', ' + pv.lon : '—')
      + k('Inclin. / orient.', (pv.inclinazione != null ? pv.inclinazione + '°' : '—') + ' / ' + (pv.orientamento != null ? pv.orientamento + '°' : '—'))
      + k('Perdite', pv.perdite != null ? pv.perdite + ' %' : '—')
      + k('Resa', _fvNumDoc(pv.resa) + ' kWh/kWp')
      + k('Produzione annua', kwp ? _fvNumDoc(pv.resa * kwp) + ' kWh' : 'manca la potenza kWp')
      + '</div>' + _fvPvgisBarre(pv.mensili, 60);
  }
  return h + '</div>';
}

// grafici della pagina "Produzione di energia elettrica" (SVG, nel preventivo stampato)
var _FV_GG_MESE = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
function _fvScalaAsse(max) {
  var passi = [1, 2, 2.5, 3, 5, 10], e = Math.pow(10, Math.floor(Math.log10(max / 5 || 1)));
  for (var i = 0; i < passi.length; i++) if (passi[i] * e * 6 >= max) return passi[i] * e;
  return 10 * e;
}
function _fvSvgBarre(valori, etichette, unita, divisore, opz) {
  opz = opz || {};
  var W = 640, H = opz.h || 170, ml = 52, mb = 22, mt = 8, mr = 8;
  var vs = valori.map(function (v) { return v / divisore; });
  var max = Math.max.apply(null, vs) || 1, passo = _fvScalaAsse(max), top = Math.ceil(max / passo) * passo;
  var iw = W - ml - mr, ih = H - mt - mb, n = vs.length, bw = iw / n;
  var s = '<svg viewBox="0 0 ' + W + ' ' + H + '" width="100%" style="display:block;font-family:Arial,sans-serif">';
  for (var g = 0; g <= top + 1e-9; g += passo) {
    var y = mt + ih - g / top * ih;
    s += '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + y.toFixed(1) + '" y2="' + y.toFixed(1) + '" stroke="#e3e3e3" stroke-width="0.8"/>'
      + '<text x="' + (ml - 6) + '" y="' + (y + 3).toFixed(1) + '" font-size="8.5" fill="#666" text-anchor="end">' + _fvNumDoc(g, g % 1 ? 1 : 0) + ' ' + unita + '</text>';
  }
  vs.forEach(function (v, i) {
    var h2 = v / top * ih, x = ml + i * bw + bw * (opz.gap == null ? 0.18 : opz.gap);
    s += '<rect x="' + x.toFixed(2) + '" y="' + (mt + ih - h2).toFixed(2) + '" width="' + Math.max(0.6, bw * (1 - 2 * (opz.gap == null ? 0.18 : opz.gap))).toFixed(2) + '" height="' + h2.toFixed(2) + '" fill="#FFA500"/>';
  });
  (etichette || []).forEach(function (e, i) {
    if (!e) return;
    s += '<text x="' + (ml + i * bw + bw / 2).toFixed(1) + '" y="' + (H - 7) + '" font-size="8.5" fill="#666" text-anchor="middle">' + e + '</text>';
  });
  return s + '<line x1="' + ml + '" x2="' + (W - mr) + '" y1="' + (mt + ih) + '" y2="' + (mt + ih) + '" stroke="#999" stroke-width="0.8"/></svg>';
}
// produzione giornaliera stimata dalle medie mensili: andamento morbido tra i mesi,
// ritoccato perche' ogni mese torni esattamente al suo totale
function _fvGiorniDaMesi(mensili) {
  var med = mensili.map(function (v, m) { return v / _FV_GG_MESE[m]; });
  var centri = [], acc = 0;
  _FV_GG_MESE.forEach(function (g) { centri.push(acc + g / 2); acc += g; });
  var giorni = [];
  for (var d = 0; d < 365; d++) {
    var x = d + 0.5, i = 0;
    while (i < 11 && x > centri[i + 1]) i++;
    var a, b, xa, xb;
    if (x < centri[0]) { a = med[11]; b = med[0]; xa = centri[11] - 365; xb = centri[0]; }
    else if (x > centri[11]) { a = med[11]; b = med[0]; xa = centri[11]; xb = centri[0] + 365; }
    else { a = med[i]; b = med[i + 1]; xa = centri[i]; xb = centri[i + 1]; }
    giorni.push(a + (b - a) * (x - xa) / (xb - xa));
  }
  var p = 0;
  _FV_GG_MESE.forEach(function (g, m) {
    var tot = 0; for (var k = 0; k < g; k++) tot += giorni[p + k];
    var f = tot > 0 ? mensili[m] / tot : 0;
    for (var k2 = 0; k2 < g; k2++) giorni[p + k2] *= f;
    p += g;
  });
  return giorni;
}
function _fvPaginaProduzione(pv, kwp) {
  var mesiKwh = pv.mensili.map(function (v) { return v * kwp; });
  var mwh = Math.max.apply(null, mesiKwh) >= 10000;
  var nomi = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre'];
  var gg = _fvGiorniDaMesi(mesiKwh), et = [];
  for (var d = 0; d < 365; d++) et.push(d % 12 === 0 ? String(d) : '');
  var tot = mesiKwh.reduce(function (s, v) { return s + v; }, 0);
  return ['<h1>Produzione di energia elettrica</h1>',
    '<h4>Su base mensile</h4><p class="pic">Produzione di energia elettrica su base mensile per un anno: ' + _fvNumDoc(tot) + ' kWh in totale.</p>',
    '<div class="graf">' + _fvSvgBarre(mesiKwh, nomi, mwh ? 'MWh' : 'kWh', mwh ? 1000 : 1, { h: 175 }) + '</div>',
    '<h4>Su base giornaliera</h4><p class="pic">Produzione di elettricità su base giornaliera per un anno (stima ricavata dalle medie mensili).</p>',
    '<div class="graf">' + _fvSvgBarre(gg, et, 'kWh', 1, { h: 175, gap: 0.12 }) + '</div>',
    '<p class="pic" style="margin-top:8px">Fonte: PVGIS (Commissione europea)' + (pv.database ? ', database ' + _fvEsc(pv.database) : '')
      + (pv.inclinazione != null ? ' · inclinazione ' + pv.inclinazione + '°' : '') + (pv.orientamento != null ? ', orientamento ' + pv.orientamento + '°' : '')
      + (pv.perdite != null ? ' · perdite di sistema ' + pv.perdite + ' %' : '') + ' · resa ' + _fvNumDoc(pv.resa) + ' kWh/kWp.</p>'];
}

// ═══ TESTI DEL PREVENTIVO, CON VERSIONI (29/10) ══════════════════════════════
// Tabella fv_testi (chiave, versione, testo). Ogni salvataggio crea una versione
// nuova; l'offerta (e il contratto) alla prima stampa si segna le versioni usate in
// testi_versioni, cosi' un documento gia' emesso continua a stampare il suo testo.
// Scrittura semplice: "# titolo", "## sottotitolo", "### intestazione",
// riga intera tra *...* = corsivo, **grassetto** dentro la riga, una riga = un paragrafo.
var _FV_TESTI_CHIAVI = [
  ['chi_siamo', 'Chi siamo'],
  ['condizioni_generali', 'Condizioni Generali'],
  ['note_materiali', 'Note sui materiali'],
  ['clausole_contratto', 'Clausole del contratto']
];
var _FV_TESTI_DEF = {
  chi_siamo: [
    '# PHOENIX FUEL',
    '## ENERGIA PULITA E SOSTENIBILE PER LA TUA AZIENDA',
    '*Soluzioni chiavi in mano per aiutarti a risparmiare in bolletta, valorizzare il tuo immobile e contribuire attivamente alla tutela dell\'ambiente*',
    'Phoenix Fuel opera da anni nella distribuzione di prodotti energetici e affianca oggi i propri clienti anche nella produzione di energia da fonte rinnovabile.',
    'Seguiamo il cliente in ogni fase: dall\'analisi tecnica alla progettazione personalizzata, dalla gestione delle pratiche burocratiche fino agli incentivi, e continuiamo ad affiancarlo anche dopo l\'installazione.',
    'Il nostro obiettivo è offrire un\'esperienza semplice, vantaggiosa e sicura, per ridurre i costi energetici e migliorare l\'efficienza dell\'azienda.',
    'Ci distinguiamo per l\'approccio chiavi in mano, seguendo i nostri clienti in tutte le fasi del progetto.',
    '### LA NOSTRA FORZA',
    '– **Soluzioni su misura:** ogni impianto nasce da un\'analisi attenta delle esigenze e degli spazi disponibili',
    '– **Aggiornamento continuo:** ci teniamo informati su incentivi, tecnologie e normative per offrire soluzioni all\'avanguardia',
    '– **Attenzione al territorio:** scegliamo solo soluzioni che rispettano l\'ambiente e valorizzano l\'immobile',
    '– **Affidabilità:** lavoriamo con serietà, seguendo ogni dettaglio del progetto come se fosse il nostro',
    '### I NOSTRI SERVIZI',
    '· Energie rinnovabili',
    '· Efficienza energetica',
    '· Progettazione e sviluppo impianti',
    '· Diagnosi e consulenze energetiche',
    '· Incentivi e agevolazioni',
    '· Comunità energetiche'
  ].join('\n'),
  condizioni_generali: [
    '## Condizioni Generali di Preventivo – Phoenix Fuel',
    '### Premessa.',
    'Il presente preventivo costituisce proposta economica emessa da Phoenix Fuel, con sede in Zona Industriale Portosalvo, 89900 Vibo Valentia (VV) – P.IVA 02744150802.',
    'Il preventivo non costituisce contratto, ma impegno precontrattuale volto alla successiva sottoscrizione del contratto definitivo. Le seguenti condizioni ne regolano validità, limiti ed effetti.',
    '### Art. 1 – Validità del preventivo',
    'Il presente preventivo ha validità di 30 (trenta) giorni dalla data di emissione, salvo diversa indicazione scritta.',
    'Decorso tale termine, Phoenix Fuel potrà aggiornare prezzi, condizioni e tempi di consegna.',
    '### Art. 2 – Oggetto e limiti del preventivo',
    'Il preventivo riguarda esclusivamente le forniture e i servizi descritti nel documento e negli eventuali allegati tecnici.',
    'Qualsiasi lavoro, materiale o prestazione non espressamente indicata si intende escluso e potrà essere oggetto di successiva integrazione economica.',
    '### Art. 3 – Accettazione e obbligo di stipula',
    '3.1. L\'accettazione scritta del presente preventivo da parte del Cliente comporta l\'impegno reciproco a stipulare il contratto definitivo predisposto da Phoenix Fuel, conforme al contenuto economico e tecnico del preventivo, entro 20 (venti) giorni dall\'accettazione, salvo diverso termine concordato per iscritto.',
    '3.2. L\'accettazione del preventivo non autorizza automaticamente l\'avvio dei lavori, che avverrà solo dopo la sottoscrizione del contratto definitivo.',
    '3.3. In caso di rifiuto o ritardo ingiustificato del Cliente nella stipula del contratto definitivo, Phoenix Fuel potrà considerare risolto l\'impegno e chiedere il rimborso delle spese sostenute per attività tecniche, sopralluoghi, pratiche autorizzative o prenotazioni materiali, ai sensi dell\'art. 1337 c.c. (responsabilità precontrattuale).',
    '### Art. 4 – Prezzi e condizioni economiche',
    'I prezzi indicati si intendono IVA esclusa, salvo diversa indicazione.',
    'Le modalità di pagamento, le eventuali rateizzazioni o formule di noleggio operativo saranno definite esclusivamente nel contratto definitivo.',
    'Eventuali variazioni eccezionali dei costi dei materiali o dei listini potranno comportare un adeguamento equo, da concordarsi prima della stipula.',
    '### Art. 5 – Esecuzione dei lavori e tempistiche',
    'Le tempistiche di realizzazione e consegna decorreranno dalla firma del contratto definitivo e dall\'avvenuto pagamento di eventuali acconti contrattuali.',
    'Phoenix Fuel non risponde di ritardi causati da forza maggiore, indisponibilità materiali, condizioni meteorologiche avverse o ritardi imputabili a terzi o al Cliente.',
    '### Art. 6 – Garanzie e responsabilità',
    'I materiali e le apparecchiature fornite saranno coperti da garanzia legale di conformità e, ove previsto, da garanzia commerciale del produttore.',
    'Phoenix Fuel non sarà responsabile di danni indiretti o mancato guadagno, né per difetti causati da uso improprio, manomissioni o interventi non autorizzati.',
    '### Art. 7 – Proprietà degli elaborati tecnici',
    'Tutti gli elaborati tecnici, progetti, computi, rendering o simulazioni restano di esclusiva proprietà di Phoenix Fuel fino alla sottoscrizione del contratto e al completo pagamento delle somme dovute.',
    'È vietata la loro riproduzione o trasmissione a terzi senza autorizzazione scritta.',
    '### Art. 8 – Privacy e riservatezza',
    'I dati personali del Cliente saranno trattati da Phoenix Fuel nel rispetto del Regolamento UE 2016/679 (GDPR) e dell\'informativa allegata.',
    'Le Parti si impegnano a mantenere la riservatezza sulle informazioni tecniche e commerciali acquisite durante la trattativa.',
    '### Art. 9 – Foro competente e legge applicabile',
    'Il presente preventivo è disciplinato dalla legge italiana.',
    'Per ogni controversia sarà competente in via esclusiva il Foro di Vibo Valentia (VV), salvo i casi in cui il Cliente rivesta la qualifica di consumatore.',
    '### Art. 10 – Clausole finali',
    'Il presente preventivo non sostituisce il contratto definitivo, che disciplinerà esecuzione, tempi e pagamenti.',
    'Eventuali modifiche o deroghe saranno valide solo se confermate per iscritto.',
    'In caso di contrasto tra preventivo e contratto, prevale il contratto definitivo.',
    '### Approvazione ai sensi dell\'art. 1341 c.c.',
    'Il Cliente dichiara di aver letto e approvato espressamente le seguenti clausole:',
    'Art. 5 (limitazione responsabilità), Art. 6 (esclusione danni indiretti), Art. 7 (proprietà elaborati), Art. 9 (foro esclusivo).'
  ].join('\n'),
  note_materiali: 'I prodotti indicati potranno variare in base alla disponibilità di magazzino. In tal caso, Phoenix Fuel garantirà la fornitura di materiali equipollenti per prestazioni e affidabilità.',
  clausole_contratto: 'Il presente contratto recepisce {offerta}, le cui Condizioni Generali si intendono qui integralmente richiamate per quanto non diversamente disposto. I tempi di esecuzione decorrono dall\'incasso della quota alla firma. I materiali indicati potranno essere sostituiti con equipollenti per prestazioni e affidabilità in caso di indisponibilità. Per ogni controversia è competente in via esclusiva il Foro di Vibo Valentia. Ai sensi degli artt. 1341 e 1342 c.c. il Cliente approva specificamente le clausole su esclusione di responsabilità per danni indiretti, proprietà degli elaborati tecnici e foro esclusivo contenute nelle Condizioni Generali richiamate.'
};
var _fvTesti = null;   // { chiave: [ {versione, testo, creato_il, creato_da}, ... ] }  (ordine crescente)

// carica i testi; se una chiave non ha ancora versioni, salva il testo di partenza come versione 1
async function _fvTestiCarica() {
  var r = await sb.from('fv_testi').select('*').order('versione');
  if (r.error) throw new Error(r.error.message + (/fv_testi/.test(r.error.message) ? ' — lancia prima l\'SQL della tabella fv_testi' : ''));
  var m = {};
  (r.data || []).forEach(function (x) { (m[x.chiave] = m[x.chiave] || []).push(x); });
  var nuovi = _FV_TESTI_CHIAVI.filter(function (k) { return !m[k[0]] || !m[k[0]].length; })
    .map(function (k) { return { chiave: k[0], versione: 1, testo: _FV_TESTI_DEF[k[0]], creato_da: 'testo di partenza' }; });
  if (nuovi.length) {
    var ri = await sb.from('fv_testi').insert(nuovi).select('*');
    if (ri.error) throw new Error(ri.error.message);
    (ri.data || []).forEach(function (x) { (m[x.chiave] = m[x.chiave] || []).push(x); });
  }
  _fvTesti = m;
  return m;
}
function _fvTestoUltimaVers(chiave) { var l = (_fvTesti && _fvTesti[chiave]) || []; return l.length ? l[l.length - 1].versione : 0; }
function _fvTesto(chiave, versione) {
  var l = (_fvTesti && _fvTesti[chiave]) || [];
  var t = versione ? l.filter(function (x) { return x.versione === Number(versione); })[0] : null;
  if (!t) t = l[l.length - 1];
  return t ? t.testo : (_FV_TESTI_DEF[chiave] || '');
}
// versioni da usare per un documento: quelle gia' segnate, altrimenti le ultime (da segnare)
function _fvTestiVersDoc(doc) {
  var v = doc && doc.testi_versioni;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch (e) { v = null; } }
  var out = {}, nuove = false;
  _FV_TESTI_CHIAVI.forEach(function (k) {
    if (v && v[k[0]]) out[k[0]] = Number(v[k[0]]);
    else { out[k[0]] = _fvTestoUltimaVers(k[0]); nuove = true; }
  });
  return { vers: out, daSalvare: nuove };
}
// testo semplice → blocchi HTML (uno per riga, cosi' l'impaginazione puo' andare a capo pagina)
function _fvMdInline(t) {
  return _fvEsc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
}
function _fvMdBlocchi(testo) {
  return String(testo || '').split(/\r?\n/).map(function (r) { return r.trim(); }).filter(Boolean).map(function (r) {
    if (/^### /.test(r)) return '<h3>' + _fvMdInline(r.slice(4)) + '</h3>';
    if (/^## /.test(r)) return '<h2>' + _fvMdInline(r.slice(3)) + '</h2>';
    if (/^# /.test(r)) return '<h1>' + _fvMdInline(r.slice(2)) + '</h1>';
    if (/^\*[^*].*\*$/.test(r)) return '<p><b><i>' + _fvMdInline(r.slice(1, -1)) + '</i></b></p>';
    return '<p>' + _fvMdInline(r) + '</p>';
  });
}

// ── EDITOR "TESTI DEL PREVENTIVO" ──
var _fvTestiTab = 'chi_siamo', _fvTestiVista = null;
async function fvModaleTesti() {
  try { await _fvTestiCarica(); } catch (e) { toast('Errore: ' + e.message); return; }
  _fvTestiVista = null;
  _fvRenderModaleTesti();
}
function fvTestiTab(k) { _fvTestiTab = k; _fvTestiVista = null; _fvRenderModaleTesti(); }
function fvTestiVersione(v) { _fvTestiVista = v ? Number(v) : null; _fvRenderModaleTesti(); }
function _fvRenderModaleTesti() {
  var k = _fvTestiTab, l = _fvTesti[k] || [], ult = _fvTestoUltimaVers(k);
  var vista = _fvTestiVista && _fvTestiVista !== ult ? _fvTestiVista : null;
  var tab = function (kk, lab) {
    var on = kk === k;
    return '<button onclick="fvTestiTab(\'' + kk + '\')" style="font-size:12px;padding:7px 12px;border-radius:7px 7px 0 0;cursor:pointer;font-weight:600;margin-bottom:-1.5px;'
      + (on ? 'background:var(--card,#fff);color:#185FA5;border:1.5px solid var(--border);border-bottom:1.5px solid var(--card,#fff)' : 'background:transparent;color:var(--text-muted);border:1.5px solid transparent') + '">' + lab + '</button>';
  };
  var h = '<div style="width:min(860px,92vw)"><div style="font-size:16px;font-weight:600">✏️ Testi del preventivo</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:10px">Ogni salvataggio crea una versione nuova. Le offerte e i contratti già stampati restano con la versione con cui sono usciti.</div>'
    + '<div style="display:flex;gap:4px;flex-wrap:wrap;border-bottom:1.5px solid var(--border);margin-bottom:10px">' + _FV_TESTI_CHIAVI.map(function (x) { return tab(x[0], x[1]); }).join('') + '</div>';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:6px">'
    + '<div style="font-size:12px">Versione <select onchange="fvTestiVersione(this.value)" style="font-size:12px;padding:4px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">'
    + l.slice().reverse().map(function (x) {
        return '<option value="' + x.versione + '"' + ((vista ? vista : ult) === x.versione ? ' selected' : '') + '>' + x.versione + (x.versione === ult ? ' (in uso)' : '') + ' · ' + _fvData(String(x.creato_il || '').slice(0, 10)) + '</option>';
      }).join('') + '</select></div>'
    + '<div style="font-size:10.5px;color:var(--text-muted)"># titolo · ## sottotitolo · ### intestazione · *riga in corsivo* · **grassetto** · una riga = un paragrafo'
    + (k === 'clausole_contratto' ? ' · <b>{offerta}</b> diventa "l\'offerta Phoenix Fuel del gg/mm/aaaa"' : '') + '</div></div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + '<textarea id="fvt-testo" oninput="fvTestiAnteprima()"' + (vista ? ' readonly' : '') + ' style="width:100%;height:52vh;padding:9px;border:0.5px solid var(--border);border-radius:6px;background:' + (vista ? '#F1EFE8' : 'var(--bg)') + ';color:var(--text);font-size:12px;line-height:1.5;font-family:var(--font-mono);resize:vertical">'
    + _fvEsc(_fvTesto(k, vista || ult)) + '</textarea>'
    + '<div id="fvt-ante" style="height:52vh;overflow:auto;border:0.5px solid var(--border);border-radius:6px;padding:10px 14px;background:#fff;color:#1d1d1b;font-family:Lato,Calibri,Arial,sans-serif;font-size:12px;line-height:1.5"></div></div>';
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:12px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Chiudi</button>'
    + (vista
        ? '<button onclick="fvTestiRipristina(' + vista + ')" class="btn-primary" style="font-size:12px;padding:8px 16px">Rimetti in uso questa versione (diventa la ' + (ult + 1) + ')</button>'
        : (_fvPuo() ? '<button onclick="fvTestiSalva()" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva come versione ' + (ult + 1) + '</button>' : ''))
    + '</div></div>';
  apriModal(h);
  fvTestiAnteprima();
}
function fvTestiAnteprima() {
  var t = document.getElementById('fvt-testo'), a = document.getElementById('fvt-ante');
  if (!t || !a) return;
  a.innerHTML = '<style>#fvt-ante h1{font-size:20px;margin:4px 0 8px}#fvt-ante h2{font-size:15px;font-weight:400;margin:8px 0}#fvt-ante h3{font-size:12.5px;margin:12px 0 4px}#fvt-ante p{margin:0 0 6px}</style>'
    + _fvMdBlocchi(t.value.replace(/\{offerta\}/g, 'l\'offerta Phoenix Fuel del 10/09/2026')).join('');
}
async function _fvTestiNuovaVersione(k, testo) {
  if (!_fvPuo()) { toast('Permesso negato'); return; }
  if (!String(testo || '').trim()) { toast('Il testo è vuoto'); return; }
  var v = _fvTestoUltimaVers(k) + 1;
  var chi = (typeof utenteCorrente !== 'undefined' && utenteCorrente && (utenteCorrente.nome || utenteCorrente.email)) || null;
  var r = await sb.from('fv_testi').insert([{ chiave: k, versione: v, testo: testo, creato_da: chi }]).select('*');
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  (_fvTesti[k] = _fvTesti[k] || []).push(r.data[0]);
  if (typeof _auditLog === 'function') _auditLog('fotovoltaico', 'fv_testi', 'nuova versione ' + v + ' del testo ' + k);
  _fvTestiVista = null;
  toast('✓ Salvata la versione ' + v);
  _fvRenderModaleTesti();
}
function fvTestiSalva() { var t = document.getElementById('fvt-testo'); _fvTestiNuovaVersione(_fvTestiTab, t ? t.value : ''); }
function fvTestiRipristina(v) { _fvTestiNuovaVersione(_fvTestiTab, _fvTesto(_fvTestiTab, v)); }

// euro e numeri con il punto delle migliaia anche sotto 10.000 (come nei documenti inviati)
function _fvEuroDoc(v, dec) {
  dec = dec == null ? 2 : dec;
  var n = Number(v || 0), neg = n < 0, p = Math.abs(n).toFixed(dec).split('.');
  return (neg ? '-' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + p[1] : '') + ' €';
}
function _fvNumDoc(v, dec) {
  dec = dec || 0;
  var p = Math.abs(Number(v || 0)).toFixed(dec).split('.');
  return (Number(v) < 0 ? '-' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + p[1] : '');
}
function _fvDataLunga(iso) {
  if (!iso) return '';
  var m = ['gennaio', 'febbraio', 'marzo', 'aprile', 'maggio', 'giugno', 'luglio', 'agosto', 'settembre', 'ottobre', 'novembre', 'dicembre'];
  var p = String(iso).slice(0, 10).split('-');
  return Number(p[2]) + ' ' + m[Number(p[1]) - 1] + ' ' + p[0];
}

// ═══ DOCUMENTI ═════════════════════════════════════════════════════════════
function _fvApriStampa(doc) {
  var w = window.open('', '_blank');
  if (!w) { toast('Abilita i popup per stampare'); return; }
  w.document.write(doc); w.document.close(); w.focus();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}

function _fvStile() {
  return '<style>@page{size:A4;margin:14mm}body{font-family:Calibri,Arial,sans-serif;font-size:10.5px;color:#222;margin:0}'
    + '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #C8102E;padding-bottom:8px;margin-bottom:14px}'
    + '.az{font-size:15px;font-weight:700}.az small{display:block;font-size:9px;color:#666;font-weight:400;line-height:1.4}'
    + '.ti{text-align:right;font-size:13px;font-weight:600}.ti small{display:block;font-size:9.5px;color:#666;font-weight:400}'
    + '.parti{display:flex;gap:30px;margin-bottom:16px}.parti>div{flex:1;font-size:10px;line-height:1.5}'
    + '.parti .et{font-size:9px;color:#777;text-transform:uppercase;letter-spacing:.3px}'
    + '.parti strong{font-size:11.5px}'
    + 'table{width:100%;border-collapse:collapse;font-size:10px}'
    + 'th{background:#F1EFE8;padding:6px 7px;font-size:8.5px;text-transform:uppercase;letter-spacing:.3px;color:#5F5E5A;text-align:right;border-bottom:1px solid #999}'
    + 'th.l{text-align:left}td{padding:6px 7px;border-bottom:0.5px solid #e8e8e8;text-align:right}td.l{text-align:left}'
    + '.tot{margin-top:10px;margin-left:auto;width:46%}.tot td{border:0;padding:3px 7px}'
    + '.tot .gr{font-size:13px;font-weight:700;border-top:1px solid #333}'
    + '.box{border:1px solid #ddd;border-radius:5px;padding:9px 11px;margin-top:12px;font-size:9.5px;line-height:1.5}'
    + '.firme{display:flex;justify-content:space-between;gap:40px;margin-top:34px;font-size:10px}'
    + '.firme>div{flex:1}.firme .riga{border-bottom:1px solid #333;height:40px;margin-top:8px}'
    + '.foot{margin-top:18px;border-top:0.5px solid #ddd;padding-top:5px;font-size:8px;color:#777;text-align:center}'
    + 'tr{page-break-inside:avoid}.pg{page-break-after:always}</style>';
}

function _fvTestata(titolo, sotto) {
  var A = _FV_AZIENDA;
  return '<div class="hd"><div class="az">' + A.nome + '<small>' + A.indirizzo + ' · ' + A.citta
    + '<br>P.IVA ' + A.piva + ' · ' + A.email + ' · ' + A.pec + '</small></div>'
    + '<div class="ti">' + titolo + '<small>' + sotto + '</small></div></div>';
}

// v20261029b — STAMPA CONTRATTO nel formato inviato a DS Energy il 15/09/2026: carta intestata
// Phoenix Fuel Solar (logo, filetto nero e rosso), parti affiancate con C.F./P.IVA, tabella
// Descrizione · Quantita' · Importo · IVA · Totale, termini di pagamento con banca e IBAN,
// clausole (offerta richiamata, foro di Vibo Valentia, artt. 1341-1342 c.c.), firme e informativa privacy.
async function fvStampaContratto(id) {
  var c = (_fvCon.contratti || []).filter(function (x) { return x.id === id; })[0];
  if (!c) return;
  // la finestra si apre subito (dopo un'attesa il browser la bloccherebbe come popup)
  var w = window.open('', '_blank');
  if (!w) { toast('Abilita i popup per stampare'); return; }
  w.document.write('<p style="font-family:Arial;padding:20px">Preparazione del contratto…</p>');
  var cli = null;
  if (c.cliente_id) {
    try { var rc = await sb.from('fv_clienti').select('*').eq('id', c.cliente_id).maybeSingle(); cli = rc && rc.data; } catch (e) { cli = null; }
  }
  // testi: le clausole del contratto vengono dalla versione segnata sul contratto (o dall'ultima, che si segna)
  var tvC = null;
  try { await _fvTestiCarica(); tvC = _fvTestiVersDoc(c); if (tvC.daSalvare) { var ruc = await sb.from('fv_contratti').update({ testi_versioni: tvC.vers }).eq('id', c.id); if (!ruc.error) c.testi_versioni = tvC.vers; } } catch (e) { tvC = null; }
  var A = _FV_AZIENDA, E = _fvEsc;
  // euro con il punto delle migliaia anche sotto 10.000 (8.000,00 €), come nel contratto inviato
  var EU = function (v) {
    var n = Math.round(Number(v || 0) * 100) / 100, neg = n < 0, p = Math.abs(n).toFixed(2).split('.');
    return (neg ? '−' : '') + p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + p[1] + ' €';
  };
  var righe = (_fvCon.righe || []).filter(function (r) { return r.contratto_id === c.id; });
  var quote = (_fvCon.quote || []).filter(function (q) { return q.contratto_id === c.id; });
  var aliq = Number(c.aliquota_iva || 0);
  var imponibile = righe.length
    ? righe.reduce(function (s, r) { return s + Number(r.quantita || 0) * Number(r.prezzo_unitario || 0); }, 0)
    : Number(c.imponibile || 0);
  var iva = Math.round(imponibile * aliq) / 100;
  var tot = imponibile + iva;
  var mOff = String(c.riferimento_offerta || '').match(/(\d{2}\/\d{2}\/\d{4})/);
  var dataOff = mOff ? mOff[1] : '';
  // indirizzo del cliente su due righe
  var ind1 = '', ind2 = '';
  if (cli && (cli.indirizzo || cli.comune)) {
    ind1 = cli.indirizzo || '';
    ind2 = [cli.cap, cli.comune].filter(Boolean).join(' ') + (cli.provincia ? ' (' + cli.provincia + ')' : '');
  } else {
    var ci = String(c.cliente_indirizzo || ''), mi = ci.match(/^(.*?)[,\s]+(\d{5}\s.*)$/);
    if (mi) { ind1 = mi[1]; ind2 = mi[2]; } else ind1 = ci;
  }
  var cfCli = (cli && cli.codice_fiscale) || c.cliente_piva || '';
  var pivaCli = (cli && cli.piva) || c.cliente_piva || '';
  var kv = function (k, v) { return v ? '<tr><td class="k">' + k + '</td><td>' + E(v) + '</td></tr>' : ''; };

  var corpo = righe.length
    ? righe.map(function (r) {
        var t = Number(r.quantita || 0) * Number(r.prezzo_unitario || 0);
        return '<tr><td class="l desc">' + E(r.descrizione) + '</td><td>' + Number(r.quantita).toLocaleString('it-IT') + '</td><td>' + EU(r.prezzo_unitario)
          + '</td><td>' + aliq + '%</td><td>' + EU(t) + '</td></tr>';
      }).join('')
    : '<tr><td class="l desc">' + E(c.descrizione_tecnica || '') + '</td><td>1</td><td>' + EU(imponibile) + '</td><td>' + aliq + '%</td><td>' + EU(imponibile) + '</td></tr>';
  var nota = (dataOff ? 'Prezzo riferito all\'offerta Phoenix Fuel del ' + dataOff + '. ' : '') + 'Eventuali lavori, materiali o prestazioni non indicati si intendono esclusi.';
  var qh = quote.map(function (q) {
    return '<tr><td class="l">' + Number(q.percentuale).toLocaleString('it-IT') + '%</td><td class="l">' + E(q.evento) + '</td><td>' + EU(q.importo_ivato) + '</td></tr>';
  }).join('');
  var totQ = quote.reduce(function (s, q) { return s + Number(q.importo_ivato || 0); }, 0);
  var rifOff = dataOff ? 'l\'offerta Phoenix Fuel del ' + dataOff : (c.riferimento_offerta || 'l\'offerta Phoenix Fuel');
  var clausole = E(_fvTesto('clausole_contratto', tvC ? tvC.vers.clausole_contratto : null).split('{offerta}').join(rifOff));

  var css = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap">'
    + '<style>@page{size:A4;margin:12mm 13mm}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}body{font-family:Lato,Calibri,Arial,sans-serif;font-size:10.5px;color:#1d1d1b;margin:0}'
    + '.hd{display:flex;justify-content:space-between;align-items:flex-start}.hd img{height:62px}.ti{text-align:right}.ti b{font-size:17px;font-weight:900;display:block}.ti span{font-size:10px;color:#555}'
    + '.fil{margin:12px 0 16px}.fil .n{border-top:4px solid #111}.fil .r{border-top:1.5px solid #C8102E;margin-top:3px}'
    + '.parti{display:flex;gap:30px}.parti>div{flex:1}.et{font-style:italic;color:#666;font-size:9.5px}.nm{font-weight:900;font-size:13px;margin:2px 0 6px}'
    + '.parti p{margin:0 0 6px;line-height:1.45}.kv{border-collapse:collapse}.kv td{padding:1px 0;font-size:10px;border:0;text-align:left}.kv td.k{color:#666;width:50px}'
    + 'table.it{width:100%;border-collapse:collapse;margin-top:16px}table.it th{font-size:9px;color:#555;font-weight:700;text-align:right;padding:6px;border-top:1px solid #ccc;border-bottom:1.5px solid #111}'
    + 'table.it td{padding:7px 6px;text-align:right;vertical-align:top;border-bottom:0.5px solid #ddd}table.it td.desc{width:58%;line-height:1.45}'
    + '.nota{font-size:9.5px;padding:7px 6px;border-bottom:0.5px solid #ddd}'
    + '.tot{width:40%;margin:10px 0 0 auto;border-collapse:collapse}.tot td{padding:5px 6px;text-align:right;border-bottom:0.5px solid #ddd}.tot td.l{text-align:left}.tot tr.g td{font-size:13px;font-weight:900;border-top:1.5px solid #111;border-bottom:0}'
    + 'h3{font-style:italic;font-weight:700;font-size:11px;margin:18px 0 6px;padding-bottom:4px;border-bottom:0.5px solid #999}'
    + '.pag{display:flex;gap:24px}.pag>div:first-child{flex:1}.pag>div:last-child{flex:1;line-height:1.6;font-size:10px}'
    + 'table.q{width:100%;border-collapse:collapse}table.q th{font-size:9px;color:#555;text-align:right;padding:5px 6px;border-bottom:1.5px solid #111}table.q td{padding:6px;text-align:right;border-bottom:0.5px solid #ddd}table.q tr.t td{font-weight:900}table.it th.l,table.it td.l,table.q th.l,table.q td.l,.tot td.l{text-align:left}'
    + '.cla{font-size:9.5px;line-height:1.55;color:#333;margin-top:14px}'
    + '.firme{display:flex;gap:60px;margin-top:22px}.firme>div{flex:1;border-top:1px solid #111;padding-top:5px;line-height:1.6;font-size:10px}'
    + '.piede{margin-top:16px}.piede .fil{margin:0 0 6px}.piede .tx{display:flex;justify-content:space-between;gap:30px;font-size:8.5px;color:#444;line-height:1.45}.piede .tx div:last-child{text-align:right}'
    + 'tr{page-break-inside:avoid}</style>';
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Contratto ' + E(c.cliente_nome) + ' ' + (c.data || '') + '</title>' + css + '</head><body>'
    + '<div class="hd"><img src="' + _FV_LOGO + '" alt="Phoenix Fuel Solar"><div class="ti"><b>Contratto n. ' + (c.numero || '—') + ' del ' + _fvData(c.data) + '</b><span>Fornitura e installazione impianto fotovoltaico</span></div></div>'
    + '<div class="fil"><div class="n"></div><div class="r"></div></div>'
    + '<div class="parti"><div><div class="et">Il Fornitore</div><div class="nm">' + E(A.nome) + '</div><p>' + E(A.indirizzo) + '<br>' + E(A.citta) + '</p>'
    + '<table class="kv">' + kv('C.F.', A.cf) + kv('P. IVA', A.piva) + kv('Email', A.email) + kv('PEC', A.pec) + '</table></div>'
    + '<div><div class="et">Spettabile</div><div class="nm">' + E(c.cliente_nome) + '</div><p>' + E(ind1) + (ind2 ? '<br>' + E(ind2) : '') + '</p>'
    + '<table class="kv">' + kv('C.F.', cfCli) + kv('P. IVA', pivaCli) + kv('Sito', c.sito_installazione) + '</table></div></div>'
    + '<table class="it"><tr><th class="l">Descrizione</th><th>Quantità</th><th>Importo</th><th>IVA</th><th>Totale</th></tr>' + corpo
    + '<tr><td colspan="5" class="l nota">' + E(nota) + '</td></tr></table>'
    + '<table class="tot"><tr><td class="l">Imponibile</td><td>' + EU(imponibile) + '</td></tr><tr><td class="l">Imposta ' + aliq + '%</td><td>' + EU(iva) + '</td></tr>'
    + '<tr class="g"><td class="l">Totale</td><td>' + EU(tot) + '</td></tr></table>'
    + '<h3>Termini di pagamento</h3><div class="pag"><div><table class="q"><tr><th class="l">Quota</th><th class="l">Scadenza</th><th>Importo (IVA inclusa)</th></tr>' + qh
    + (quote.length ? '<tr class="t"><td></td><td class="l">Totale</td><td>' + EU(totQ) + '</td></tr>' : '') + '</table></div>'
    + '<div>' + (c.modalita_pagamento ? '<b>Modalità:</b> ' + E(c.modalita_pagamento) + '<br>' : '') + (c.banca_appoggio ? '<b>Banca:</b> ' + E(c.banca_appoggio) + '<br>' : '')
    + (c.iban ? '<b>IBAN:</b> ' + E(c.iban) + '<br>' : '') + (c.intestatario ? '<b>Intestatario:</b> ' + E(c.intestatario) : '') + '</div></div>'
    + '<div class="cla">' + clausole + (c.condizioni ? '<br><br>' + E(c.condizioni) : '') + '</div>'
    + '<div class="firme"><div><b>Il Fornitore</b><br>Phoenix Fuel S.r.l.<br>Luogo e data ____________________</div>'
    + '<div><b>Il Cliente</b><br>' + E(c.cliente_nome) + ' – per accettazione<br>Luogo e data ____________________</div></div>'
    + '<div class="piede"><div class="fil"><div class="n"></div><div class="r"></div></div><div class="tx"><div><b>' + E(A.nome) + '</b> · ' + E(A.indirizzo.replace(/\s+snc$/i, '')) + ', ' + E(A.citta) + ' · P.IVA ' + E(A.piva) + '<br>' + E(A.email) + ' · ' + E(A.pec) + '</div>'
    + '<div>Trattiamo i Vostri dati per finalità amministrative e contabili.<br>Informativa completa ai sensi dell\'art. 13 Reg. UE 679/2016 disponibile a richiesta.</div></div></div>'
    + '</body></html>';
  w.document.open(); w.document.write(doc); w.document.close(); w.focus();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 900);
}

// v20261029c — STAMPA PREVENTIVO nello standard del preventivo DS Energy del 10/09/2026:
// copertina con foto, chi siamo, impianto e componenti, analisi finanziaria (se ci sono i dati),
// elenco delle parti con il solo prezzo totale, termini di pagamento, accettazione con le
// Condizioni Generali. Le pagine si formano da sole (un blocco che non ci sta va alla pagina
// dopo) con intestazione, piè di pagina e numero "n / totale". Testi dalla tabella fv_testi.
// Arriveranno: produzione mensile da PVGIS, analisi calcolata, schede e foto dei componenti, immagini del progetto.
async function fvStampaOfferta(id) {
  var o = (_fvOff.offerte || []).filter(function (x) { return x.id === id; })[0];
  if (!o) return;
  var w = window.open('', '_blank');
  if (!w) { toast('Abilita i popup per stampare'); return; }
  w.document.write('<p style="font-family:Arial;padding:20px">Preparazione del preventivo…</p>');
  try { await _fvTestiCarica(); } catch (e) { w.close(); toast('Errore testi: ' + e.message); return; }
  var tv = _fvTestiVersDoc(o);
  if (tv.daSalvare) {
    var ru = await sb.from('fv_offerte').update({ testi_versioni: tv.vers }).eq('id', o.id);
    if (!ru.error) o.testi_versioni = tv.vers;
  }
  var cli = (_fvCli || []).filter(function (c) { return c.id === o.cliente_id; })[0] || null;
  var A = _FV_AZIENDA, E = _fvEsc, EU = _fvEuroDoc;
  var righe = (_fvOff.righe || []).filter(function (r) { return r.offerta_id === o.id; });
  var catDi = function (r) { return (_fvCat || []).filter(function (c) { return c.id === r.catalogo_id; })[0] || null; };
  var imponibile = righe.reduce(function (s, r) { return s + Number(r.quantita || 0) * Number(r.prezzo_unitario || 0); }, 0);
  var aliq = Number(o.aliquota_iva || 0), iva = Math.round(imponibile * aliq) / 100, totIvato = imponibile + iva;
  var moduli = righe.filter(function (r) { return r.tipo === 'modulo'; }).reduce(function (s, r) { return s + Number(r.quantita || 0); }, 0);
  var kwp = Number(o.potenza_kwp || 0), prod = Number(o.produzione_kwh_anno || 0);
  var TIPI = { modulo: 'Modulo', inverter: 'Inverter', accumulo: 'Accumulo', struttura: 'Struttura', servizio: 'Prestazioni del servizio', altro: 'Altro' };
  var nomeRiga = function (r) { var c = catDi(r); return c ? (c.codice || c.nome || r.descrizione) : r.descrizione; };
  var marcaRiga = function (r) { var c = catDi(r); return c && c.marca ? c.marca : ''; };
  var pz = function (q) { return _fvNumDoc(q, Number(q) % 1 ? 2 : 0) + (Number(q) === 1 ? ' pezzo' : ' pezzi'); };
  var ind1 = cli ? (cli.indirizzo || '') : (o.cliente_indirizzo || '');
  var ind2 = cli ? ([cli.cap, cli.comune].filter(Boolean).join(' ') + (cli.provincia ? ' ' + cli.provincia : '')) : '';
  var piva = (cli && cli.piva) || o.cliente_piva || '';
  var sito = o.sito_installazione || '';
  var logo = _FV_LOGO;
  var foto = new URL('img/fv-copertina.jpg', location.href).href;
  var sez = [];   // sezioni: { cover?, blocchi: [html] }

  // 1) copertina
  sez.push({ cover: true, html: '<div class="cv-top"><img src="' + logo + '" class="cv-logo"><div class="cv-az"><b>PHOENIX FUEL</b><br>Zona Industriale Portosalvo<br>89900 Vibo Valentia (VV)<br>' + E(A.email) + '</div></div>'
    + '<img class="cv-foto" src="' + foto + '">'
    + '<div class="fil"><div class="n"></div><div class="r"></div></div>'
    + '<div class="cv-tit">La vostra offerta personale</div><div class="cv-da">Da PHOENIX FUEL · Offerta n. ' + (o.numero || '—') + '/' + o.anno + ' del ' + _fvData(o.data) + '</div>'
    + '<div class="cv-cli"><div class="sp">Spett.le</div><div class="nm">' + E(o.cliente_nome) + '</div>' + (ind1 ? '<div>' + E(ind1) + '</div>' : '') + (ind2 ? '<div>' + E(ind2) + '</div>' : '')
    + (piva ? '<div>P.iva ' + E(piva) + '</div>' : '') + (sito ? '<div class="si"><b>Sito di installazione:</b> ' + E(sito) + '</div>' : '') + '</div>' });

  // 2) chi siamo
  sez.push({ blocchi: _fvMdBlocchi(_fvTesto('chi_siamo', tv.vers.chi_siamo)) });

  // 3) impianto e componenti
  var b = ['<h1>Impianto fotovoltaico</h1>',
    '<p>Ringraziandola per averci contattato, le sottoponiamo la nostra migliore offerta per la realizzazione di un impianto fotovoltaico, installato e connesso in rete'
      + (sito ? ', da eseguire presso il suo edificio sito in ' + E(sito) : '') + '.</p>'];
  var kv = [];
  if (kwp) kv.push(['Dimensione', _fvNumDoc(kwp, 2) + ' kWPeak']);
  if (moduli) kv.push(['Moduli', _fvNumDoc(moduli) + ' pezzi']);
  if (prod) kv.push(['Produzione totale annua', _fvNumDoc(prod) + ' kWh']);
  if (prod && kwp) kv.push(['Efficienza', _fvNumDoc(prod / kwp) + ' kWh per kWPeak']);
  if (kv.length) b.push('<h4>Impianto fotovoltaico: <span>Fotovoltaico</span></h4><table class="kv">' + kv.map(function (x) { return '<tr><td>' + x[0] + '</td><td>' + x[1] + '</td></tr>'; }).join('') + '</table>');
  if (righe.length) {
    b.push('<h5>COMPONENTI</h5><p class="pic">Abbiamo previsto i seguenti componenti:</p>');
    righe.forEach(function (r) {
      var c = catDi(r), m = marcaRiga(r);
      b.push('<div class="comp"><div class="cn">' + E(nomeRiga(r)) + '</div><div class="cq">' + (m ? E(m) + ' &nbsp;|&nbsp; ' : '') + pz(r.quantita) + '</div></div>'
        + (c && c.descrizione ? '<div class="cd">' + E(c.descrizione) + '</div>' : ''));
    });
    var nm = _fvTesto('note_materiali', tv.vers.note_materiali);
    if (nm) b.push('<div class="comp"><div class="cn">Informazioni sui materiali</div><div class="cq"></div></div><div class="cd">' + E(nm) + '</div>');
  }
  sez.push({ blocchi: b });

  // 3b) produzione da PVGIS
  var pvS = _fvPvgisDi(o);
  if (pvS && kwp) sez.push({ blocchi: _fvPaginaProduzione(pvS, kwp) });

  // 4) analisi finanziaria (per ora con i valori scritti nell'offerta)
  if (o.rendimento_totale || o.break_even_anni || o.tir) {
    var anno0 = Number(String(o.data || '').slice(0, 4)) || o.anno;
    var be = o.break_even_anni ? Number(o.break_even_anni) : null;
    sez.push({ blocchi: ['<h1>Analisi Finanziaria</h1>', '<div class="fin">'
      + '<div><span>Investimento totale</span><b>' + EU(imponibile, 0) + '</b><i>&nbsp;</i></div>'
      + '<div><span>Rendimento totale</span><b>' + (o.rendimento_totale ? EU(o.rendimento_totale, 0) : '—') + '</b><i>&nbsp;</i></div>'
      + '<div><span>Break-Even</span><b>' + (be ? (anno0 + Math.ceil(be)) : '—') + '</b><i>' + (be ? 'In ' + _fvNumDoc(be, be % 1 ? 1 : 0) + ' anni' : '&nbsp;') + '</i></div>'
      + '<div><span>TIR</span><b>' + (o.tir ? _fvNumDoc(o.tir, 2) + ' %' : '—') + '</b><i>' + (o.tir ? 'annuo' : '&nbsp;') + '</i></div></div>'] });
  }

  // 5) elenco delle parti, prezzo totale, termini di pagamento
  b = ['<h1>Elenco delle parti</h1>', '<p class="pic">Tutti i componenti pianificati per voi</p>', '<h4>Per Fotovoltaico</h4>',
    '<table class="pt"><tr><th>Nome</th><th>Tipo</th><th class="r">Quantità</th></tr>' + righe.map(function (r) {
      var m = marcaRiga(r);
      return '<tr><td>' + E(nomeRiga(r)) + (m ? '<small>' + E(m) + '</small>' : '') + '</td><td>' + E(TIPI[r.tipo] || 'Altro') + '</td><td class="r">' + _fvNumDoc(r.quantita, Number(r.quantita) % 1 ? 2 : 0) + 'x</td></tr>';
    }).join('') + '</table>',
    '<h4>Prezzo totale</h4><table class="tt"><tr><td>Totale (netto)</td><td>' + EU(imponibile) + '</td></tr><tr><td>IVA (' + _fvNumDoc(aliq, 1) + ' % su ' + EU(imponibile) + ')</td><td>' + EU(iva) + '</td></tr>'
      + '<tr class="g"><td>Totale (lordo)</td><td>' + EU(totIvato) + '</td></tr></table>'];
  var schema = (_fvSchemi || []).filter(function (s2) { return s2.id === o.schema_pagamento_id; })[0];
  if (schema && schema.quote) {
    var q = (typeof schema.quote === 'string') ? JSON.parse(schema.quote) : schema.quote;
    b.push('<h4>Termini di pagamento</h4><table class="pt"><tr><th>Quota</th><th>Scadenza</th><th class="r">Importo (IVA inclusa)</th></tr>'
      + q.map(function (x) { return '<tr><td>' + _fvNumDoc(x.perc, x.perc % 1 ? 2 : 0) + '%</td><td>' + E(x.evento) + '</td><td class="r">' + EU(totIvato * x.perc / 100) + '</td></tr>'; }).join('')
      + '</table><p class="pic">Modalità di pagamento, banca e IBAN sono riportati nel contratto definitivo.</p>');
  }
  sez.push({ blocchi: b });

  // 6) accettazione e Condizioni Generali
  b = ['<h1>Accettare l\'offerta</h1>',
    '<div class="parti"><div><span>Il Cliente</span><b>' + E(o.cliente_nome) + '</b>' + (ind1 ? E(ind1) + '<br>' : '') + (ind2 ? E(ind2) + '<br>' : '') + (piva ? 'P.IVA ' + E(piva) : '')
      + (sito ? '<small>Sito di installazione: ' + E(sito) + '</small>' : '') + '</div>'
      + '<div><span>Il Fornitore</span><b>PHOENIX FUEL</b>Zona Industriale Portosalvo<br>89900 Vibo Valentia (VV)<br>P.IVA ' + E(A.piva) + '</div></div>']
    .concat(_fvMdBlocchi(_fvTesto('condizioni_generali', tv.vers.condizioni_generali)).map(function (x) { return '<div class="cg">' + x + '</div>'; }))
    .concat(['<div class="firma"><div></div>Luogo, data, nome, firma</div>']);
  sez.push({ blocchi: b });

  var css = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Lato:ital,wght@0,400;0,700;0,900;1,400;1,700&display=swap">'
    + '<style>@page{size:A4;margin:0}*{box-sizing:border-box;-webkit-print-color-adjust:exact;print-color-adjust:exact}'
    + 'body{margin:0;font-family:Lato,Calibri,Arial,sans-serif;color:#1d1d1b;font-size:11px;background:#888}'
    + '.pg{width:210mm;height:297mm;position:relative;background:#fff;overflow:hidden;page-break-after:always;margin:0 auto}'
    + '@media screen{.pg{margin:8mm auto;box-shadow:0 2px 10px rgba(0,0,0,.3)}}'
    + '.hd{position:absolute;left:18mm;right:18mm;top:10mm;height:16mm;display:flex;align-items:center;justify-content:space-between}.hd img{height:15mm}.hd .t{font-size:12.5px}.hd .d{font-size:10px;color:#555}'
    + '.ct{position:absolute;left:18mm;right:18mm;top:31mm;bottom:30mm;overflow:hidden}'
    + '.ft{position:absolute;left:18mm;right:18mm;bottom:9mm}.ft .tx{display:flex;justify-content:space-between;font-size:8.5px;color:#444;line-height:1.4}.ft .pn{font-family:Georgia,serif;font-size:11px;color:#555}'
    + '.fil .n{border-top:2.6mm solid #111}.fil .r{border-top:0.4mm solid #C8102E;margin:3.2mm 0 2.4mm}'
    + 'h1{font-size:23px;font-weight:900;margin:0 0 10px}h2{font-size:16px;font-weight:400;margin:4px 0 10px}h3{font-size:12px;font-weight:900;margin:14px 0 6px}'
    + 'h4{font-size:14px;font-weight:700;margin:14px 0 6px}h4 span{font-weight:400;color:#666}h5{font-size:12.5px;font-weight:900;margin:16px 0 2px}'
    + 'p{margin:0 0 7px;line-height:1.5}.pic{font-size:9.5px;color:#555}'
    + '.cg h2{font-size:14px;font-weight:700;margin:12px 0 6px}.cg h3{font-size:11.5px;font-weight:700;margin:10px 0 3px}.cg p{font-size:9.8px;margin:0 0 4px}'
    + 'table.kv{width:100%;border-collapse:collapse}table.kv td{padding:8px 10px;font-size:11.5px}table.kv tr:nth-child(odd) td{background:#F1F2F3}table.kv td:last-child{text-align:right}'
    + '.comp{display:flex;justify-content:space-between;align-items:baseline;border-bottom:0.5px solid #ccc;padding:12px 10px 8px;margin-top:6px}.comp .cn{font-size:13px;font-weight:700}.comp .cq{font-size:9.5px;color:#555}'
    + '.cd{font-size:9.5px;color:#444;padding:5px 0 2px}'
    + '.fin{display:flex;gap:6mm;background:#F1F2F3;padding:7mm 6mm}.fin div{flex:1}.fin span{display:block;font-weight:700;font-size:11.5px;margin-bottom:9mm}.fin b{display:block;font-size:20px;font-weight:900}.fin i{display:block;font-style:normal;font-size:9.5px;color:#555;margin-top:6mm}'
    + 'table.pt{width:100%;border-collapse:collapse}table.pt th{font-size:8.5px;text-transform:uppercase;color:#555;text-align:left;padding:7px 10px;font-weight:700}table.pt td{padding:8px 10px;font-size:11px;border-bottom:0.5px solid #ddd}'
    + 'table.pt tr:nth-child(even) td{background:#F1F2F3}table.pt td small{display:block;font-size:8.5px;color:#666}.r{text-align:right!important}'
    + 'table.tt{width:100%;border-collapse:collapse}table.tt td{padding:8px 10px;border-bottom:0.5px solid #ddd;font-size:11px}table.tt td:last-child{text-align:right}table.tt tr.g td{font-size:14px;font-weight:700}'
    + '.parti{display:flex;gap:10mm;margin-bottom:6mm}.parti div{flex:1;font-size:12.5px;line-height:1.45;font-family:Arial,sans-serif}.parti span{display:block;font-size:9px;color:#555;margin-bottom:3px}.parti b{display:block;font-size:15px}.parti small{display:block;font-size:9px;color:#555;margin-top:4px}'
    + '.graf{background:#F6F6F7;padding:8px 6px;border-radius:2px}'
    + '.firma{margin-top:12mm;font-size:12px}.firma div{width:95mm;border-top:0.5px solid #333;margin-bottom:3mm}'
    + '.cv-top{position:absolute;left:18mm;right:18mm;top:13mm;display:flex;justify-content:space-between}.cv-logo{height:24mm}.cv-az{text-align:right;font-size:10.5px;line-height:1.5}'
    + '.cv-foto{position:absolute;left:18mm;right:18mm;top:68mm;width:174mm;height:115mm;object-fit:cover}'
    + '.cv-top+.cv-foto+.fil{position:absolute;left:18mm;right:18mm;top:186mm}'
    + '.cv-tit{position:absolute;left:18mm;top:203mm;font-size:24px;font-weight:900}.cv-da{position:absolute;left:18mm;top:214mm;font-size:11px;color:#555}'
    + '.cv-cli{position:absolute;right:18mm;top:226mm;text-align:right;font-family:Arial,sans-serif;font-size:12.5px;line-height:1.6}.cv-cli .sp{font-size:10px}.cv-cli .nm{font-size:19px;font-weight:700;margin:2px 0 4px}.cv-cli .si{font-family:Lato,Arial,sans-serif;font-size:10px;margin-top:10px}'
    + '</style>';
  var hd = '<div class="hd"><img src="' + logo + '"><div class="t">La vostra offerta personale</div><div class="d">' + _fvDataLunga(o.data) + '</div></div>';
  var ft = '<div class="ft"><div class="fil"><div class="n"></div><div class="r"></div></div><div class="tx"><div><b>PHOENIX FUEL</b><br>Zona Industriale Portosalvo, 89900 Vibo Valentia (VV) · ' + E(A.email) + '</div><div class="pn"></div></div></div>';
  var dati = JSON.stringify({ sez: sez, hd: hd, ft: ft }).replace(/<\//g, '<\\/');
  var script = '<script>(function(){var D=' + dati + ';var body=document.body;function run(){'
    + 'function nuova(cover){var p=document.createElement("div");p.className="pg";if(cover){body.appendChild(p);return p;}p.innerHTML=D.hd+"<div class=\\"ct\\"></div>"+D.ft;body.appendChild(p);return p.querySelector(".ct");}'
    + 'D.sez.forEach(function(s){if(s.cover){nuova(true).innerHTML=s.html;return;}var c=nuova(false);s.blocchi.forEach(function(h){var d=document.createElement("div");d.innerHTML=h;c.appendChild(d);'
    + 'if(c.scrollHeight>c.clientHeight+1&&c.children.length>1){c.removeChild(d);c=nuova(false);c.appendChild(d);}});});'
    + 'var pp=document.querySelectorAll(".pg");pp.forEach(function(p,i){var n=p.querySelector(".pn");if(n)n.textContent=(i+1)+" / "+pp.length;});'
    + 'var imgs=[].slice.call(document.images);Promise.all(imgs.map(function(im){return im.complete?1:new Promise(function(r){im.onload=im.onerror=r;});})).then(function(){setTimeout(function(){window.focus();window.print();},300);});'
    + '}(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(run,run);})();<\/script>';
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Preventivo ' + E(o.cliente_nome) + ' ' + (o.data || '') + '</title>' + css + '</head><body>' + script + '</body></html>';
  w.document.open(); w.document.write(doc); w.document.close();
}

// ═══ FORNITORI FV ══════════════════════════════════════════════════════════
async function fvCaricaFornitori() {
  var box = document.getElementById('fvforn-content');
  if (!box) return;
  box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">Caricamento…</div>';
  var r = await sb.from('fv_fornitori').select('*').order('ragione_sociale');
  if (r.error) { box.innerHTML = _fvVuoto('Errore: ' + _fvEsc(r.error.message)); return; }
  _fvForn = r.data || [];
  _fvRenderFornitori();
}

function _fvRenderFornitori() {
  var box = document.getElementById('fvforn-content');
  var bt = function (onclick, txt) { return '<button onclick="' + onclick + '" class="btn-primary" style="font-size:12px;padding:7px 13px">' + txt + '</button>'; };
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">'
    + '<div><div style="font-size:16px;font-weight:700">🏭 Fornitori e agenti fotovoltaico</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Chi ci fornisce gli impianti e gli agenti a cui paghiamo la provvigione. Separati dai fornitori carburanti.</div></div>'
    + (_fvPuo() ? '<div style="display:flex;gap:6px">' + bt('fvModaleFornitore(null,\'fornitore\')', '+ Nuovo fornitore') + bt('fvModaleFornitore(null,\'agente\')', '+ Nuovo agente') + '</div>' : '')
    + '</div>';
  var tutti = _fvForn || [];
  var forn = tutti.filter(function (f) { return (f.tipo || 'fornitore') !== 'agente'; });
  var ag = tutti.filter(function (f) { return f.tipo === 'agente'; });
  var tabella = function (lista, agenti) {
    var t = '<div class="card" style="padding:0;overflow-x:auto;margin-bottom:14px"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:640px">';
    t += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
      + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Ragione sociale</th>'
      + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">P.IVA</th>'
      + (agenti ? '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Provvigione</th>' : '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Sede</th>')
      + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Contatti</th>'
      + '<th style="width:70px;border-bottom:1.5px solid var(--border)"></th></tr>';
    lista.forEach(function (f) {
      var provv = Number(f.provv_valore) > 0 ? (f.provv_tipo === 'fissa' ? 'quota fissa ' + _fvEuro(f.provv_valore) : f.provv_valore + '% del ricavo') : '—';
      t += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:9px 10px"><strong>' + _fvEsc(f.ragione_sociale) + '</strong></td>'
        + '<td style="padding:9px 10px;font-family:var(--font-mono)">' + _fvEsc(f.piva || '—') + '</td>'
        + (agenti ? '<td style="padding:9px 10px;font-family:var(--font-mono)">' + _fvEsc(provv) + '</td>'
                  : '<td style="padding:9px 10px">' + _fvEsc([f.indirizzo, f.comune, f.provincia ? '(' + f.provincia + ')' : ''].filter(Boolean).join(', ') || '—') + '</td>')
        + '<td style="padding:9px 10px;font-size:11.5px;color:var(--text-muted)">' + _fvEsc([f.referente, f.telefono, f.email].filter(Boolean).join(' · ') || '—') + '</td>'
        + '<td style="padding:9px 10px;text-align:right">' + (_fvPuo() ? '<button onclick="fvModaleFornitore(\'' + f.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">✏️</button>' : '') + '</td></tr>';
    });
    return t + '</table></div>';
  };
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:6px">🏭 Fornitori (' + forn.length + ')</div>';
  h += forn.length ? tabella(forn, false) : _fvVuoto('Nessun fornitore.');
  h += '<div style="font-size:13px;font-weight:700;margin:6px 0">🤝 Agenti (' + ag.length + ')</div>';
  h += ag.length ? tabella(ag, true) : _fvVuoto('Nessun agente. Con “+ Nuovo agente” lo aggiungi con la sua provvigione.');
  box.innerHTML = h;
}

function fvModaleFornitore(id, tipoNuovo) {
  var f = id ? (_fvForn || []).filter(function (x) { return x.id === id; })[0] : null;
  var tipo = f ? (f.tipo || 'fornitore') : (tipoNuovo || 'fornitore');
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var v = function (k) { return _fvEsc(f && f[k] != null ? f[k] : ''); };
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">' + (f ? 'Modifica ' : 'Nuovo ') + (tipo === 'agente' ? 'agente' : 'fornitore fotovoltaico') + '</div>';
  h += '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px">';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Ragione sociale / nome *</label><input id="fvf-rs" value="' + v('ragione_sociale') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Tipo</label><select id="fvf-tipo" onchange="document.getElementById(\'fvf-provv-box\').style.display=this.value===\'agente\'?\'\':\'none\'" style="' + inp + '">'
    + '<option value="fornitore"' + (tipo !== 'agente' ? ' selected' : '') + '>Fornitore</option><option value="agente"' + (tipo === 'agente' ? ' selected' : '') + '>Agente</option></select></div>';
  h += '<div id="fvf-provv-box" style="grid-column:1/4;display:' + (tipo === 'agente' ? '' : 'none') + ';background:#FFF7E0;border-radius:8px;padding:9px 10px">'
    + '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">'
    + '<div><label style="' + lb + '">Provvigione</label><select id="fvf-ptipo" style="' + inp + '">'
    + '<option value="perc"' + (!f || f.provv_tipo !== 'fissa' ? ' selected' : '') + '>Percentuale sul ricavo (imponibile)</option>'
    + '<option value="fissa"' + (f && f.provv_tipo === 'fissa' ? ' selected' : '') + '>Quota fissa per impianto €</option></select></div>'
    + '<div><label style="' + lb + '">Valore (% o €)</label><input id="fvf-pval" type="number" step="0.01" min="0" value="' + v('provv_valore') + '" style="' + inp + ';font-family:var(--font-mono);text-align:right"></div>'
    + '</div><div style="font-size:10.5px;color:#854F0B;margin-top:5px">Si propone nel costo "Commissione agente" dell\'offerta; l\'importo resta modificabile.</div></div>';
  h += '<div><label style="' + lb + '">P.IVA</label><input id="fvf-piva" value="' + v('piva') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Codice fiscale</label><input id="fvf-cf" value="' + v('codice_fiscale') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Telefono</label><input id="fvf-tel" value="' + v('telefono') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Indirizzo</label><input id="fvf-ind" value="' + v('indirizzo') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">CAP</label><input id="fvf-cap" value="' + v('cap') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Comune</label><input id="fvf-com" value="' + v('comune') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Provincia</label><input id="fvf-prov" maxlength="2" value="' + v('provincia') + '" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Referente</label><input id="fvf-ref" value="' + v('referente') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:2/4"><label style="' + lb + '">Email</label><input id="fvf-mail" value="' + v('email') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">PEC</label><input id="fvf-pec" value="' + v('pec') + '" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">IBAN</label><input id="fvf-iban" value="' + v('iban') + '" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvSalvaFornitore(' + (f ? '\'' + f.id + '\'' : 'null') + ')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
}

async function fvSalvaFornitore(id) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value.trim() : ''; };
  if (!g('fvf-rs')) { toast('La ragione sociale è obbligatoria'); return; }
  var agente = g('fvf-tipo') === 'agente';
  var pval = parseFloat(g('fvf-pval'));
  var p = {
    ragione_sociale: g('fvf-rs'), piva: g('fvf-piva') || null, codice_fiscale: g('fvf-cf') || null,
    indirizzo: g('fvf-ind') || null, cap: g('fvf-cap') || null, comune: g('fvf-com') || null,
    provincia: (g('fvf-prov') || '').toUpperCase() || null, referente: g('fvf-ref') || null,
    telefono: g('fvf-tel') || null, email: g('fvf-mail') || null, pec: g('fvf-pec') || null,
    iban: g('fvf-iban') || null,
    tipo: agente ? 'agente' : 'fornitore',
    provv_tipo: agente ? (g('fvf-ptipo') || 'perc') : null,
    provv_valore: agente && isFinite(pval) ? pval : null
  };
  var r = id ? await sb.from('fv_fornitori').update(p).eq('id', id) : await sb.from('fv_fornitori').insert([p]);
  if (r.error) { toast('Errore: ' + r.error.message + (/column/i.test(r.error.message) ? ' — lancia prima l\'SQL delle colonne nuove' : '')); return; }
  chiudiModal();
  fvCaricaFornitori();
}

// ═══ LINGUETTE DELLA SEZIONE ═══════════════════════════════════════════════
function switchFvSubTab(btn) {
  var tab = btn.getAttribute('data-tab');
  document.querySelectorAll('.fv-subtab').forEach(function (b) {
    var att = (b === btn);
    b.classList.toggle('active', att);
    b.style.background = att ? '' : 'var(--bg)';
    b.style.color = att ? '' : 'var(--text)';
    b.style.border = att ? '' : '0.5px solid var(--border)';
  });
  document.querySelectorAll('.fv-subpanel').forEach(function (p) {
    p.style.display = (p.id === tab) ? '' : 'none';
  });
  if (tab === 'fv-tab-investimenti' && typeof caricaInvestimenti === 'function') caricaInvestimenti('nostri');
  if (tab === 'fv-tab-vendita') fvVenditaTab(_fvVTab);
  if (tab === 'fv-tab-catalogo') fvCaricaCatalogo();
  if (tab === 'fv-tab-fornitori') fvCaricaFornitori();
  if (tab === 'fv-tab-sviluppo') fvCaricaSviluppo();
}

// v20261023b — sotto-linguette di VENDITA A CLIENTI
var _fvVTab = 'fv-vtab-impianti';
function fvVenditaTab(vtab) {
  _fvMostraVTab(vtab);
  if (_fvVTab === 'fv-vtab-impianti') fvCaricaImpiantiVenduti();
  if (_fvVTab === 'fv-vtab-offerte') fvCaricaOfferte();
  if (_fvVTab === 'fv-vtab-contratti') fvCaricaContratti();
  if (_fvVTab === 'fv-vtab-clienti') fvCaricaClienti();
}
function _fvMostraVTab(vtab) {
  _fvVTab = vtab || 'fv-vtab-impianti';
  document.querySelectorAll('.fv-vtab').forEach(function (b) {
    var on = b.getAttribute('data-vtab') === _fvVTab;
    b.style.background = on ? 'var(--bg-card,#fff)' : 'transparent';
    b.style.color = on ? '#26215C' : 'var(--text-muted)';
    b.style.border = on ? '0.5px solid var(--border)' : '0.5px solid transparent';
    b.style.borderBottomColor = on ? 'var(--bg-card,#fff)' : 'transparent';
    b.style.marginBottom = on ? '-1px' : '0';
  });
  document.querySelectorAll('.fv-vpanel').forEach(function (p) { p.style.display = (p.id === _fvVTab) ? '' : 'none'; });
}

// ── IMPIANTI VENDUTI: celle dei contratti (23/10) ─────────────────────────
async function fvCaricaImpiantiVenduti() {
  var box = document.getElementById('inv-vend-content');
  if (!box) return;
  box.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">Caricamento…</div>';
  // stessi dati della linguetta Contratti (fasi, incassi): li carico senza disegnare l'elenco
  var fc = document.getElementById('fvc-content');
  try { await fvCaricaContratti(); } catch (e) { box.innerHTML = _fvVuoto('Errore: ' + _fvEsc(e && e.message)); return; }
  if (fc) fc.innerHTML = '';   // la linguetta Contratti si ridisegna quando la apri
  var lista = ((_fvCon && _fvCon.contratti) || []).filter(function (c) { return c.stato !== 'annullato'; });
  var tot = 0, inc = 0;
  lista.forEach(function (c) {
    tot += Number(c.imponibile || 0) * (1 + Number(c.aliquota_iva || 0) / 100);
    inc += _fvIncassiContratto(c).reduce(function (s2, m) { return s2 + Number(m.importo || 0); }, 0);
  });
  var kpi = function (lab, val, col) {
    return '<div style="flex:1;min-width:150px;background:var(--bg-card,var(--bg));border:0.5px solid var(--border);border-radius:10px;padding:11px 13px">'
      + '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:.4px">' + lab + '</div>'
      + '<div style="font-family:var(--font-mono);font-size:19px;font-weight:700' + (col ? ';color:' + col : '') + '">' + val + '</div></div>';
  };
  var h = '<div style="margin-bottom:10px"><div style="font-size:15px;font-weight:700">Impianti venduti</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Un impianto per ogni contratto con il cliente. Non usano le risorse degli investimenti. Clic sulla cella per aprire il contratto.</div></div>';
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px">'
    + kpi('Impianti', String(lista.length))
    + kpi('Venduto (IVA inclusa)', _fvEuro(tot))
    + kpi('Incassato', _fvEuro(inc), '#27500A')
    + kpi('Da incassare', _fvEuro(tot - inc), tot - inc > 0.5 ? '#A32D2D' : '#27500A')
    + '</div>';
  if (!lista.length) { box.innerHTML = h + _fvVuoto('Nessun contratto. Si genera da un\'offerta accettata, in 📄 Offerte.'); return; }
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
  lista.forEach(function (c) {
    var st = _FV_STATI_CON[c.stato] || _FV_STATI_CON.da_firmare;
    var totC = Number(c.imponibile || 0) * (1 + Number(c.aliquota_iva || 0) / 100);
    h += '<div onclick="fvApriVenduto(\'' + c.id + '\')" style="cursor:pointer;background:var(--bg-card,var(--bg));border:0.5px solid var(--border);border-left:4px solid #E0A458;border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:7px">'
      + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><div style="font-size:16px;font-weight:600">' + _fvEsc(c.cliente_nome || '—') + '</div>'
      + '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:' + st.bg + ';color:' + st.col + ';white-space:nowrap">' + st.lab + '</span></div>'
      + '<div style="font-size:12px;color:var(--text-muted)">Contratto ' + (c.numero || '—') + '/' + c.anno + (c.data ? ' del ' + _fvData(c.data) : '') + '</div>'
      + (c.sito_installazione ? '<div style="font-size:12px">📍 ' + _fvEsc(c.sito_installazione) + '</div>' : '')
      + '<div style="display:flex;justify-content:space-between;font-size:12px"><span>Totale contratto</span><b style="font-family:var(--font-mono)">' + _fvEuro(totC) + '</b></div>'
      + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">Lavori</div>' + _fvBarraFasi(c, true)
      + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:2px">Incassi</div>' + _fvBarraIncassi(c, true)
      + '</div>';
  });
  h += '</div>';
  box.innerHTML = h;
}
// dalla cella: apre la sotto-linguetta Contratti direttamente sulla scheda
async function fvApriVenduto(id) {
  _fvMostraVTab('fv-vtab-contratti');
  await fvCaricaContratti();
  fvApriContratto(id);
}
// apre Vendita a clienti su una sotto-linguetta (usato dopo aver creato un contratto)
function fvApriVendita(vtab) {
  _fvVTab = vtab || _fvVTab;
  var btn = document.querySelector('[data-tab="fv-tab-vendita"]');
  if (btn) switchFvSubTab(btn); else fvVenditaTab(_fvVTab);
}

// Punto d'ingresso della sezione (chiamato dal menu)
function caricaFotovoltaico() {
  if (typeof caricaInvestimenti === 'function') caricaInvestimenti('nostri');
}

// ── AVANZAMENTO LAVORI E INCASSI (05/10) ───────────────────────────────────
// Le fasi dell'opera venduta e i pagamenti ricevuti dal cliente. Le date delle
// fasi le segna chi segue il cantiere; gli incassi arrivano dalle entrate del
// foglio giornale collegate a questo contratto.
var _FV_FASI = [
  { k: 'data_accettazione',   lab: 'Accettazione offerta' },
  { k: 'data_consegna_merce', lab: 'Consegna merce' },
  { k: 'data_installazione',  lab: 'Installazione impianto' },
  { k: 'data_collaudo',       lab: 'Collaudo' },
  { k: 'data_produzione',     lab: 'Messa in produzione' }
];

function _fvFasiFatte(c) {
  return _FV_FASI.filter(function (f) { return c[f.k]; }).length;
}

function _fvBarraFasi(c, compatta) {
  var fatte = _fvFasiFatte(c), tot = _FV_FASI.length;
  var pct = fatte / tot * 100;
  var col = fatte === tot ? '#27500A' : '#185FA5';
  var ultima = null;
  _FV_FASI.forEach(function (f) { if (c[f.k]) ultima = f.lab; });
  var h = '<div style="height:' + (compatta ? '10' : '16') + 'px;border-radius:8px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden">'
    + '<div style="width:' + pct.toFixed(0) + '%;height:100%;background:' + col + '"></div></div>';
  h += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">' + fatte + '/' + tot
    + (ultima ? ' · ' + _fvEsc(ultima) : ' · non avviato') + '</div>';
  return h;
}

function _fvFasiEditor(c) {
  var h = '<div style="display:flex;gap:6px;flex-wrap:wrap">';
  _FV_FASI.forEach(function (f, idx) {
    var fatta = !!c[f.k];
    h += '<div style="flex:1;min-width:132px;border:0.5px solid ' + (fatta ? '#639922' : 'var(--border)') + ';border-radius:8px;padding:8px 10px;background:' + (fatta ? '#EAF3DE' : 'var(--bg)') + '">'
      + '<div style="font-size:10px;color:' + (fatta ? '#27500A' : 'var(--text-muted)') + ';font-weight:600;text-transform:uppercase;letter-spacing:.3px">'
      + (idx + 1) + '. ' + f.lab + '</div>'
      + '<input type="date" value="' + (c[f.k] || '') + '" onchange="fvContrattoCampo(\'' + f.k + '\', this.value)" '
      + 'style="width:100%;margin-top:4px;padding:5px 7px;border:0.5px solid var(--border);border-radius:5px;background:var(--bg);color:var(--text);font-size:11.5px">'
      + '</div>';
  });
  h += '</div>';
  h += '<div style="margin-top:10px">' + _fvBarraFasi(c, false) + '</div>';
  return h;
}

function _fvIncassiContratto(c) {
  return (_fvCon.incassi || []).filter(function (m) { return m.fv_contratto_id === c.id && m.tipo === 'entrata'; });
}

function _fvBarraIncassi(c, compatta) {
  var totale = Number(c.imponibile || 0) * (1 + Number(c.aliquota_iva || 0) / 100);
  var inc = _fvIncassiContratto(c);
  var ric = inc.reduce(function (s, m) { return s + Number(m.importo || 0); }, 0);
  var pct = totale > 0 ? Math.min(100, ric / totale * 100) : 0;
  var residuo = totale - ric;
  var col = residuo <= 0.5 ? '#27500A' : '#BA7517';
  var h = '<div style="height:' + (compatta ? '10' : '16') + 'px;border-radius:8px;background:var(--bg);border:0.5px solid var(--border);overflow:hidden">'
    + '<div style="width:' + pct.toFixed(1) + '%;height:100%;background:' + col + '"></div></div>';
  if (compatta) {
    h += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">' + _fvEuro(ric) + ' · ' + pct.toFixed(0) + '%</div>';
    return h;
  }
  h += '<div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;font-size:11.5px;margin-top:5px">'
    + '<span style="color:var(--text-muted)">Incassato <strong style="font-family:var(--font-mono);color:var(--text)">' + _fvEuro(ric) + '</strong> su ' + _fvEuro(totale) + '</span>'
    + '<span style="font-family:var(--font-mono);font-weight:600;color:' + (residuo > 0.5 ? '#A32D2D' : '#27500A') + '">'
    + (residuo > 0.5 ? 'residuo ' + _fvEuro(residuo) : 'saldato') + '</span></div>';
  // incassi del ramo ancora liberi: si collegano a questo contratto
  var liberi = (_fvCon.incassi || []).filter(function (m) { return !m.fv_contratto_id; });
  if (!compatta && liberi.length) {
    h += '<div style="margin-top:10px;padding:8px 10px;background:#FFF7E0;border-left:3px solid #BA7517;border-radius:0 6px 6px 0">';
    h += '<div style="font-size:11px;font-weight:600;color:#854F0B;margin-bottom:5px">Incassi del ramo da collegare (' + liberi.length + ')</div>';
    liberi.forEach(function (m) {
      h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:8px;font-size:11.5px;padding:3px 0">'
        + '<span>' + _fvData(m.data) + ' · ' + _fvEsc(m.descrizione || '') + '</span>'
        + '<span style="display:flex;gap:8px;align-items:center"><strong style="font-family:var(--font-mono)">' + _fvEuro(m.importo) + '</strong>'
        + '<button onclick="fvImputaIncasso(\'' + m.id + '\',\'' + c.id + '\')" style="font-size:10.5px;padding:3px 9px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">collega</button></span></div>';
    });
    h += '</div>';
  }
  if (inc.length) {
    h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px;margin-top:8px">';
    inc.forEach(function (m) {
      h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:5px 4px;white-space:nowrap">' + _fvData(m.data) + '</td>'
        + '<td style="padding:5px 4px">' + _fvEsc(m.descrizione || '') + '</td>'
        + '<td style="padding:5px 4px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _fvEuro(m.importo) + '</td></tr>';
    });
    h += '</table>';
  } else {
    h += '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Nessun incasso registrato. Si registrano in Finanze → Foglio giornale come entrata, richiamando questo contratto.</div>';
  }
  return h;
}

// ── COSTI DELLA COMMESSA (06/10) ───────────────────────────────────────────
// Le uscite del ramo vendite: quelle gia' imputate a questo contratto e quelle
// ancora libere, che si assegnano da qui. Tutto a imponibile.
function _fvImponibileMov(m) {
  if (m.imponibile != null) return Number(m.imponibile);
  var iva = Number(m.aliquota_iva || 0);
  return Number(m.importo || 0) / (1 + iva / 100);
}

function _fvBloccoCostiCommessa(c, ricavo) {
  var tutte = (_fvCon.costi || []);
  var mie = tutte.filter(function (m) { return m.fv_contratto_id === c.id; });
  var libere = tutte.filter(function (m) { return !m.fv_contratto_id; });
  var tot = mie.reduce(function (s, m) { return s + _fvImponibileMov(m); }, 0);
  var margine = Number(ricavo || 0) - tot;
  var pct = ricavo > 0 ? (margine / ricavo * 100) : 0;

  var h = '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:baseline;flex-wrap:wrap;gap:8px;margin-bottom:8px">'
    + '<div><div style="font-size:13px;font-weight:700">Costi della commessa</div>'
    + '<div style="font-size:11px;color:var(--text-muted)">Le uscite registrate in foglio giornale con le causali del ramo vendite, al netto dell\'IVA.</div></div>'
    + '<div style="text-align:right"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">Margine reale</div>'
    + '<div style="font-family:var(--font-mono);font-size:17px;font-weight:700;color:' + (margine >= 0 ? '#27500A' : '#A32D2D') + '">'
    + _fvEuro(margine) + (ricavo > 0 ? ' <span style="font-size:11px">· ' + pct.toFixed(1) + '%</span>' : '') + '</div></div></div>';

  if (mie.length) {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    mie.forEach(function (m) {
      var cau = (_fvCon.causali || {})[m.causale_investimento_id];
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:6px 4px;white-space:nowrap">' + _fvData(m.data) + '</td>'
        + '<td style="padding:6px 4px">' + _fvEsc(m.descrizione || '')
        + '<div style="font-size:10.5px;color:var(--text-muted)">' + _fvEsc(cau ? cau.nome : '') + ' · totale ' + _fvEuro(m.importo) + '</div></td>'
        + '<td style="padding:6px 4px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _fvEuro(_fvImponibileMov(m)) + '</td>'
        + '<td style="padding:6px 4px;text-align:right"><button onclick="fvTogliCosto(\'' + m.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-muted);cursor:pointer">togli</button></td></tr>';
    });
    h += '<tr style="font-weight:700"><td colspan="2" style="padding:8px 4px">TOTALE COSTI</td>'
      + '<td style="padding:8px 4px;text-align:right;font-family:var(--font-mono)">' + _fvEuro(tot) + '</td><td></td></tr>';
    h += '</table>';
  } else {
    h += '<div style="font-size:12px;color:var(--text-muted)">Nessun costo imputato a questa commessa.</div>';
  }

  if (libere.length) {
    h += '<div style="margin-top:12px;padding-top:10px;border-top:0.5px solid var(--border)">';
    h += '<div style="font-size:11.5px;font-weight:600;margin-bottom:6px">Da imputare (' + libere.length + ')</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    libere.forEach(function (m) {
      var cau = (_fvCon.causali || {})[m.causale_investimento_id];
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:6px 4px;white-space:nowrap">' + _fvData(m.data) + '</td>'
        + '<td style="padding:6px 4px">' + _fvEsc(m.descrizione || '')
        + '<div style="font-size:10.5px;color:var(--text-muted)">' + _fvEsc(cau ? cau.nome : '') + ' · totale ' + _fvEuro(m.importo) + '</div></td>'
        + '<td style="padding:6px 4px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _fvEuro(_fvImponibileMov(m)) + '</td>'
        + '<td style="padding:6px 4px;text-align:right"><button onclick="fvImputaCosto(\'' + m.id + '\',\'' + c.id + '\')" style="font-size:11px;padding:4px 10px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">imputa qui</button></td></tr>';
    });
    h += '</table></div>';
  }
  h += '</div>';
  return h;
}

async function fvImputaCosto(movId, contrattoId) {
  var r = await sb.from('foglio_giornale_movimenti').update({ fv_contratto_id: contrattoId }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  toast('✓ Costo imputato alla commessa');
  await fvCaricaContratti();
  fvApriContratto(contrattoId);
}

async function fvTogliCosto(movId) {
  var id = _fvContrattoAperto;
  var r = await sb.from('foglio_giornale_movimenti').update({ fv_contratto_id: null }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await fvCaricaContratti();
  fvApriContratto(id);
}

// anche gli incassi si collegano da qui
async function fvImputaIncasso(movId, contrattoId) {
  var r = await sb.from('foglio_giornale_movimenti').update({ fv_contratto_id: contrattoId }).eq('id', movId);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  await fvCaricaContratti();
  fvApriContratto(contrattoId);
}

// ═══ IMPIANTI IN SVILUPPO — vetrine 3D per i clienti (22/10) ══════════════
// Ogni vetrina e' un file HTML autonomo nella cartella del programma. Dentro il
// programma si apre in modalita' interna (i dati di produzione e ricavi si possono
// provare); la copia per il cliente e' in sola lettura e porta la data della proposta.
var _FV_VETRINE = [
  { id: 'polistena', nome: 'Polistena', luogo: 'Polistena (RC) · c/da Primogenito',
    tipo: 'Serre fotovoltaiche', kwp: '974,4 kWp', energia: '≈ 1.214 MWh/anno', colture: 'Fragole, mirtilli, more e idroponica verticale',
    file: 'fv-vetrina-polistena.html', ver: '20261029a', stato: 'In sviluppo' },
  { id: 'borgia', nome: 'Borgia', luogo: 'Borgia (CZ)',
    tipo: 'Serre fotovoltaiche est-ovest', kwp: '989,52 kWp · 1.596 moduli Jinko 620 Wp', energia: '≈ 1.423 MWh/anno',
    file: 'fv-vetrina-borgia.html', ver: '20261029a', stato: 'In sviluppo' }
];

function fvCaricaSviluppo() {
  var box = document.getElementById('fvsv-content');
  if (!box) return;
  var h = '<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Vetrine 3D degli impianti in sviluppo, da mostrare ai clienti. Si aprono a tutto schermo; la pagina da mandare al cliente si scarica in sola lettura.</div>';
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px">';
  _FV_VETRINE.forEach(function (v) {
    h += '<div style="background:var(--bg-card,var(--bg));border:0.5px solid var(--border);border-left:4px solid #c62828;border-radius:8px;padding:14px 16px;display:flex;flex-direction:column;gap:8px">'
      + '<div style="display:flex;justify-content:space-between;gap:8px;align-items:baseline"><div style="font-size:17px;font-weight:600">' + esc(v.nome) + '</div>'
      + '<span style="font-size:11px;padding:2px 8px;border-radius:10px;background:#FAEEDA;color:#633806">' + esc(v.stato) + '</span></div>'
      + '<div style="font-size:12px;color:var(--text-muted)">' + esc(v.luogo) + '</div>'
      + '<div style="font-size:13px">' + esc(v.tipo) + ' · <b>' + esc(v.kwp) + '</b> · ' + esc(v.energia) + '</div>'
      + (v.colture ? '<div style="font-size:12px;color:#2e7d32">🌱 ' + esc(v.colture) + '</div>' : '')
      + '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">'
      + '<button class="btn-primary" style="font-size:12px;padding:7px 12px" onclick="fvApriVetrina(\'' + v.id + '\')">🌐 Apri la vetrina</button>'
      + '<button class="btn-primary" style="font-size:12px;padding:7px 12px;background:var(--bg);color:var(--text);border:0.5px solid var(--border)" onclick="fvScaricaVetrina(\'' + v.id + '\')">⬇️ Scarica pagina cliente</button>'
      + '</div></div>';
  });
  h += '</div>';
  box.innerHTML = h;
}

function _fvVetrina(id) {
  for (var i = 0; i < _FV_VETRINE.length; i++) if (_FV_VETRINE[i].id === id) return _FV_VETRINE[i];
  return null;
}

function fvApriVetrina(id) {
  var v = _fvVetrina(id);
  if (!v) return;
  var old = document.getElementById('fv-vetrina-ov');
  if (old) old.remove();
  var ov = document.createElement('div');
  ov.id = 'fv-vetrina-ov';
  ov.style.cssText = 'position:fixed;inset:0;z-index:10000;background:#111;display:flex;flex-direction:column';
  ov.innerHTML = '<div style="display:flex;gap:8px;align-items:center;justify-content:space-between;padding:8px 12px;background:#1a1d1b;color:#fff;flex-wrap:wrap">'
    + '<div style="font-size:14px;font-weight:600">🏗️ ' + esc(v.nome) + ' · vetrina 3D</div>'
    + '<div style="display:flex;gap:6px;flex-wrap:wrap">'
    + '<button class="btn-primary" style="font-size:12px;padding:6px 12px;background:#2c3430;border:0.5px solid #4a544e" onclick="fvScaricaVetrina(\'' + v.id + '\')">⬇️ Scarica pagina cliente</button>'
    + '<button class="btn-primary" style="font-size:12px;padding:6px 12px;background:#c62828" onclick="fvChiudiVetrina()">✕ Chiudi</button>'
    + '</div></div>'
    + '<iframe src="' + v.file + '?v=' + v.ver + '" title="Vetrina ' + esc(v.nome) + '" style="flex:1;width:100%;border:0;background:#eef0ec" allow="fullscreen"></iframe>';
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  document.addEventListener('keydown', _fvVetrinaEsc);
}

function _fvVetrinaEsc(e) { if (e.key === 'Escape') fvChiudiVetrina(); }

function fvChiudiVetrina() {
  var ov = document.getElementById('fv-vetrina-ov');
  if (ov) ov.remove();
  document.body.style.overflow = '';
  document.removeEventListener('keydown', _fvVetrinaEsc);
}

// Copia per il cliente: stessa pagina, ma in sola lettura e con la data della proposta.
async function fvScaricaVetrina(id) {
  var v = _fvVetrina(id);
  if (!v) return;
  try {
    var r = await fetch(v.file + '?v=' + v.ver, { cache: 'no-store' });
    if (!r.ok) throw new Error('file non trovato (' + r.status + ')');
    var html = await r.text();
    var d = new Date(), gg = String(d.getDate()).padStart(2, '0'), mm = String(d.getMonth() + 1).padStart(2, '0'), aa = d.getFullYear();
    var tag = 'data-mode="interno" data-stamp=""';
    if (html.indexOf(tag) < 0) throw new Error('la pagina non ha il segnaposto della modalita\' cliente');
    html = html.replace(tag, 'data-mode="cliente" data-stamp="' + gg + '/' + mm + '/' + aa + '"');
    // v20261029a — three.js dentro la copia: la pagina cliente e' un file unico che si apre anche senza internet
    var libs = ['lib/three.min.js', 'lib/OrbitControls.js'];
    for (var li = 0; li < libs.length; li++) {
      var stag = '<script src="' + libs[li] + '"></script>';
      if (html.indexOf(stag) < 0) continue;
      var rl = await fetch(libs[li] + '?v=r128', { cache: 'no-store' });
      if (!rl.ok) throw new Error('libreria ' + libs[li] + ' non trovata (' + rl.status + ')');
      var codice = (await rl.text()).replace(/<\/script/gi, '<\\/script');
      html = html.split(stag).join('<script>' + codice + '</script>');
    }
    var blob = new Blob([html], { type: 'text/html' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'PhoenixFuelSolar_' + v.nome.replace(/\s+/g, '_') + '_' + gg + '-' + mm + '-' + aa + '.html';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 2000);
    toast('Pagina cliente scaricata');
  } catch (e) {
    toast('Errore: ' + e.message);
  }
}
