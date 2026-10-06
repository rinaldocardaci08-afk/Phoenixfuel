// ═══════════════════════════════════════════════════════════════════════════
// pf-fotovoltaico.js — RAMO FOTOVOLTAICO (camera stagna)
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
    + (_fvPuo() ? '<button onclick="fvNuovaOfferta()" class="btn-primary" style="font-size:12px;padding:7px 13px">+ Nuova offerta</button>' : '')
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
      + '<td style="padding:9px 10px;text-align:right"><button onclick="fvApriOfferta(\'' + o.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer">Apri →</button></td></tr>';
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
  h += '<div><label style="' + lb + '">Produzione kWh/anno</label><input type="number" step="1" value="' + (o.produzione_kwh_anno != null ? o.produzione_kwh_anno : '') + '" onchange="fvOffertaCampo(\'produzione_kwh_anno\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Rendimento totale €</label><input type="number" step="0.01" value="' + (o.rendimento_totale != null ? o.rendimento_totale : '') + '" onchange="fvOffertaCampo(\'rendimento_totale\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Break-even (anni)</label><input type="number" step="0.1" value="' + (o.break_even_anni != null ? o.break_even_anni : '') + '" onchange="fvOffertaCampo(\'break_even_anni\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">TIR %</label><input type="number" step="0.01" value="' + (o.tir != null ? o.tir : '') + '" onchange="fvOffertaCampo(\'tir\', this.value)" style="' + inp + '"></div>';
  h += '</div></div>';

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
    + '<th style="width:36px;border-bottom:1.5px solid var(--border)"></th></tr>';
  costi.forEach(function (c) {
    var f = (_fvForn || []).filter(function (x) { return x.id === c.fornitore_id; })[0];
    h += '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:7px"><strong>' + _fvEsc(c.descrizione) + '</strong>'
      + '<div style="font-size:10.5px;color:var(--text-muted)">' + _fvEsc(TIPI[c.tipo] || c.tipo) + (f ? ' · ' + _fvEsc(f.ragione_sociale) : '') + '</div></td>'
      + '<td style="padding:7px;font-size:11.5px;color:var(--text-muted)">'
      + (c.doc_numero ? _fvEsc((c.doc_tipo || 'doc') + ' n. ' + c.doc_numero) + (c.doc_data ? ' del ' + _fvData(c.doc_data) : '') : '—')
      + (c.doc_totale ? '<div>totale documento ' + _fvEuro(c.doc_totale) + '</div>' : '') + '</td>'
      + '<td style="padding:7px;text-align:right;font-family:var(--font-mono);font-weight:600">' + _fvEuro(c.imponibile) + '</td>'
      + '<td style="padding:7px;text-align:right">' + (_fvPuo() ? '<button onclick="fvEliminaCosto(\'' + c.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button>' : '') + '</td></tr>';
  });
  h += '<tr style="font-weight:700"><td colspan="2" style="padding:8px 7px">TOTALE COSTI</td>'
    + '<td style="padding:8px 7px;text-align:right;font-family:var(--font-mono)">' + _fvEuro(totCosti) + '</td><td></td></tr>';
  h += '</table></div>';
  return h;
}

function fvModaleCosto(offertaId) {
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:4px">Costo dell\'impianto</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">Scrivi l\'imponibile. Se hai il totale con IVA, usa il pulsante per scorporarla.</div>';
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  h += '<div><label style="' + lb + '">Tipo</label><select id="fvco-tipo" style="' + inp + '">'
    + '<option value="fornitura">Fornitura chiavi in mano</option><option value="commissione">Commissione agente</option>'
    + '<option value="trasporto">Trasporto</option><option value="pratiche">Pratiche</option><option value="altro">Altro</option></select></div>';
  h += '<div><label style="' + lb + '">Fornitore</label><select id="fvco-forn" style="' + inp + '"><option value="">— nessuno —</option>'
    + (_fvForn || []).map(function (f) { return '<option value="' + f.id + '">' + _fvEsc(f.ragione_sociale) + '</option>'; }).join('')
    + '</select></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Descrizione *</label><input id="fvco-descr" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Imponibile €</label><input id="fvco-imp" type="number" step="0.01" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '<div><label style="' + lb + '">Oppure totale con IVA</label><div style="display:flex;gap:6px">'
    + '<input id="fvco-tot" type="number" step="0.01" style="' + inp + ';font-family:var(--font-mono)">'
    + '<input id="fvco-iva" type="number" step="0.1" value="10" title="aliquota %" style="' + inp + ';width:62px;text-align:right">'
    + '<button onclick="fvScorporaCosto()" title="Scorpora l\'IVA" style="padding:0 10px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:700;cursor:pointer">→</button></div></div>';
  h += '<div><label style="' + lb + '">Documento</label><select id="fvco-dtipo" style="' + inp + '">'
    + '<option value="">— nessuno —</option><option value="fattura">Fattura</option><option value="preventivo">Preventivo</option><option value="ordine">Ordine</option></select></div>';
  h += '<div><label style="' + lb + '">Numero</label><input id="fvco-dnum" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Data documento</label><input id="fvco-ddata" type="date" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Totale documento €</label><input id="fvco-dtot" type="number" step="0.01" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '<div style="grid-column:1/3"><label style="' + lb + '">Note</label><input id="fvco-note" style="' + inp + '"></div>';
  h += '</div><div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px">'
    + '<button onclick="chiudiModal()" style="font-size:12px;padding:8px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer">Annulla</button>'
    + '<button onclick="fvSalvaCosto(\'' + offertaId + '\')" class="btn-primary" style="font-size:12px;padding:8px 16px">Salva</button></div></div>';
  apriModal(h);
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

async function fvSalvaCosto(offertaId) {
  var g = function (x) { var e = document.getElementById(x); return e ? e.value : ''; };
  var d = (g('fvco-descr') || '').trim();
  var imp = parseFloat(g('fvco-imp')) || 0;
  if (!d) { toast('La descrizione è obbligatoria'); return; }
  if (imp <= 0) { toast('Indica l\'imponibile (o scorpora il totale con IVA)'); return; }
  var n = _fvCostiOfferta(offertaId).length;
  var r = await sb.from('fv_offerte_costi').insert([{
    offerta_id: offertaId, tipo: g('fvco-tipo') || 'altro',
    fornitore_id: g('fvco-forn') || null, descrizione: d, imponibile: imp,
    aliquota_iva: parseFloat(g('fvco-iva')) || null,
    doc_tipo: g('fvco-dtipo') || null, doc_numero: g('fvco-dnum') || null,
    doc_data: g('fvco-ddata') || null, doc_totale: parseFloat(g('fvco-dtot')) || null,
    note: g('fvco-note') || null, ordine: n + 1
  }]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  chiudiModal();
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
  var r = await Promise.all([
    sb.from('fv_contratti').select('*').order('anno', { ascending: false }).order('numero', { ascending: false }),
    sb.from('fv_contratti_righe').select('*').order('ordine'),
    sb.from('fv_contratti_quote').select('*').order('ordine'),
    sb.from('foglio_giornale_movimenti')
      .select('id,data,tipo,importo,imponibile,aliquota_iva,descrizione,fv_contratto_id,causale_investimento_id')
      .not('causale_investimento_id', 'is', null),
    sb.from('causali_investimento').select('id,nome,tipo,ambito')
  ]);
  var movs = (r[3] && r[3].data) || [];
  var cau = {};
  ((r[4] && r[4].data) || []).forEach(function (c) { cau[c.id] = c; });
  // solo i movimenti del ramo VENDITE: incassi dai clienti e costi di commessa
  var delRamo = movs.filter(function (m) {
    var c = cau[m.causale_investimento_id];
    return c && (c.ambito || 'investimenti') === 'vendite';
  });
  _fvCon = { contratti: r[0].data || [], righe: r[1].data || [], quote: r[2].data || [],
             incassi: delRamo.filter(function (m) { return m.tipo === 'entrata'; }),
             costi: delRamo.filter(function (m) { return m.tipo === 'uscita'; }),
             causali: cau };
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
  var btn = document.querySelector('[data-tab="fv-tab-contratti"]');
  if (btn) switchFvSubTab(btn);
  await fvCaricaContratti();
  fvApriContratto(contrattoId);
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
  var inp = 'width:100%;padding:7px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:12.5px';
  var lb = 'display:block;font-size:10.5px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var st = _FV_STATI_CON[c.stato] || _FV_STATI_CON.da_firmare;

  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;margin-bottom:12px">';
  h += '<div><div style="font-size:16px;font-weight:700">Contratto n. ' + (c.numero || '—') + '/' + c.anno
    + ' <span style="font-size:11px;background:' + st.bg + ';color:' + st.col + ';padding:2px 9px;border-radius:9px;vertical-align:middle">' + st.lab + '</span></div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">' + _fvEsc(c.cliente_nome) + ' · ' + _fvData(c.data)
    + (c.riferimento_offerta ? ' · ' + _fvEsc(c.riferimento_offerta) : '') + '</div></div>';
  h += '<div style="display:flex;gap:8px;flex-wrap:wrap">'
    + '<button onclick="fvStampaContratto(\'' + c.id + '\')" style="font-size:12px;padding:7px 12px;border:0.5px solid #A32D2D;border-radius:7px;background:var(--bg);color:#A32D2D;font-weight:600;cursor:pointer">📄 Stampa contratto</button>'
    + '<button onclick="fvChiudiContratto()" style="font-size:12px;padding:7px 12px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);cursor:pointer">← Tutti i contratti</button>'
    + '</div></div>';

  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="font-size:13px;font-weight:700;margin-bottom:10px">Avanzamento lavori</div>';
  h += _fvFasiEditor(c);
  h += '<div style="font-size:13px;font-weight:700;margin:16px 0 8px">Incassi dal cliente</div>';
  h += _fvBarraIncassi(c, false);
  h += '</div>';

  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px"><div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px">';
  h += '<div><label style="' + lb + '">Data</label><input type="date" value="' + (c.data || '') + '" onchange="fvContrattoCampo(\'data\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Stato</label><select onchange="fvContrattoCampo(\'stato\', this.value)" style="' + inp + '">'
    + Object.keys(_FV_STATI_CON).map(function (k) { return '<option value="' + k + '"' + (c.stato === k ? ' selected' : '') + '>' + _FV_STATI_CON[k].lab + '</option>'; }).join('')
    + '</select></div>';
  h += '<div><label style="' + lb + '">Data firma</label><input type="date" value="' + (c.data_firma || '') + '" onchange="fvContrattoCampo(\'data_firma\', this.value)" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">Sito di installazione</label><input value="' + _fvEsc(c.sito_installazione || '') + '" onchange="fvContrattoCampo(\'sito_installazione\', this.value)" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">Descrizione tecnica (va nel documento)</label><textarea rows="4" onchange="fvContrattoCampo(\'descrizione_tecnica\', this.value)" style="' + inp + ';resize:vertical">' + _fvEsc(c.descrizione_tecnica || '') + '</textarea></div>';
  h += '<div><label style="' + lb + '">IVA %</label><input type="number" step="0.1" value="' + c.aliquota_iva + '" onchange="fvContrattoCampo(\'aliquota_iva\', this.value)" style="' + inp + '"></div>';
  h += '<div style="grid-column:2/4"><label style="' + lb + '">Modalità di pagamento</label><input value="' + _fvEsc(c.modalita_pagamento || '') + '" onchange="fvContrattoCampo(\'modalita_pagamento\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">Banca</label><input value="' + _fvEsc(c.banca_appoggio || '') + '" onchange="fvContrattoCampo(\'banca_appoggio\', this.value)" style="' + inp + '"></div>';
  h += '<div><label style="' + lb + '">IBAN</label><input value="' + _fvEsc(c.iban || '') + '" onchange="fvContrattoCampo(\'iban\', this.value)" style="' + inp + ';font-family:var(--font-mono)"></div>';
  h += '<div><label style="' + lb + '">Intestatario</label><input value="' + _fvEsc(c.intestatario || '') + '" onchange="fvContrattoCampo(\'intestatario\', this.value)" style="' + inp + '"></div>';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">Condizioni finali (va nel documento)</label><textarea rows="3" onchange="fvContrattoCampo(\'condizioni\', this.value)" style="' + inp + ';resize:vertical">' + _fvEsc(c.condizioni || '') + '</textarea></div>';
  h += '</div></div>';

  // righe
  h += '<div class="card" style="padding:12px 14px;margin-bottom:12px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Voci del contratto</div>'
    + '<button onclick="fvAggiungiRigaContratto(\'' + c.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Voce</button></div>';
  if (!righe.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna voce: nel documento comparirà la sola descrizione tecnica con l\'imponibile indicato.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    righe.forEach(function (r) {
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:5px 6px"><input value="' + _fvEsc(r.descrizione) + '" onchange="fvRigaContrattoCampo(\'' + r.id + '\',\'descrizione\',this.value)" style="' + inp + '"></td>'
        + '<td style="padding:5px 6px;width:80px"><input type="number" step="0.01" value="' + r.quantita + '" onchange="fvRigaContrattoCampo(\'' + r.id + '\',\'quantita\',this.value)" style="' + inp + ';text-align:right;font-family:var(--font-mono)"></td>'
        + '<td style="padding:5px 6px;width:120px"><input type="number" step="0.01" value="' + r.prezzo_unitario + '" onchange="fvRigaContrattoCampo(\'' + r.id + '\',\'prezzo_unitario\',this.value)" style="' + inp + ';text-align:right;font-family:var(--font-mono)"></td>'
        + '<td style="padding:5px 6px;text-align:right;font-family:var(--font-mono);font-weight:600;width:120px">' + _fvEuro(Number(r.quantita || 0) * Number(r.prezzo_unitario || 0)) + '</td>'
        + '<td style="padding:5px 6px;text-align:right;width:36px"><button onclick="fvEliminaRigaContratto(\'' + r.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button></td></tr>';
    });
    h += '</table>';
  }
  h += '<div style="display:flex;justify-content:flex-end;gap:24px;margin-top:12px;font-size:13px">'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">Imponibile</div><div style="font-family:var(--font-mono);font-weight:600">' + _fvEuro(imponibile) + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">IVA ' + c.aliquota_iva + '%</div><div style="font-family:var(--font-mono)">' + _fvEuro(iva) + '</div></div>'
    + '<div style="text-align:right"><div style="font-size:10.5px;color:var(--text-muted)">Totale</div><div style="font-family:var(--font-mono);font-weight:700;font-size:15px">' + _fvEuro(imponibile + iva) + '</div></div></div>';
  h += '</div>';

  // costi della commessa
  h += _fvBloccoCostiCommessa(c, imponibile);

  // quote di pagamento
  var totIvato = imponibile + iva;
  var sommaPerc = quote.reduce(function (s, q) { return s + Number(q.percentuale || 0); }, 0);
  h += '<div class="card" style="padding:12px 14px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px">'
    + '<div style="font-size:13px;font-weight:700">Quote di pagamento</div>'
    + '<button onclick="fvAggiungiQuota(\'' + c.id + '\')" style="font-size:11.5px;padding:5px 11px;border:0.5px solid #185FA5;border-radius:6px;background:var(--bg);color:#185FA5;font-weight:600;cursor:pointer">+ Quota</button></div>';
  if (!quote.length) h += '<div style="font-size:12px;color:var(--text-muted)">Nessuna quota impostata.</div>';
  else {
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase"><th style="text-align:right;padding:5px 6px;width:70px">%</th>'
      + '<th style="text-align:left;padding:5px 6px">Evento</th><th style="text-align:right;padding:5px 6px;width:130px">Importo IVA incl.</th>'
      + '<th style="text-align:left;padding:5px 6px;width:140px">Incassata il</th><th style="width:36px"></th></tr>';
    quote.forEach(function (q) {
      h += '<tr style="border-bottom:0.5px solid var(--border)">'
        + '<td style="padding:5px 6px"><input type="number" step="0.01" value="' + q.percentuale + '" onchange="fvQuotaCampo(\'' + q.id + '\',\'percentuale\',this.value,' + totIvato + ')" style="' + inp + ';text-align:right;font-family:var(--font-mono)"></td>'
        + '<td style="padding:5px 6px"><input value="' + _fvEsc(q.evento) + '" onchange="fvQuotaCampo(\'' + q.id + '\',\'evento\',this.value)" style="' + inp + '"></td>'
        + '<td style="padding:5px 6px"><input type="number" step="0.01" value="' + q.importo_ivato + '" onchange="fvQuotaCampo(\'' + q.id + '\',\'importo_ivato\',this.value)" style="' + inp + ';text-align:right;font-family:var(--font-mono)"></td>'
        + '<td style="padding:5px 6px"><input type="date" value="' + (q.data_incasso || '') + '" onchange="fvQuotaCampo(\'' + q.id + '\',\'data_incasso\',this.value)" style="' + inp + '"></td>'
        + '<td style="padding:5px 6px;text-align:right"><button onclick="fvEliminaQuota(\'' + q.id + '\')" style="border:0;background:transparent;color:#A32D2D;cursor:pointer">×</button></td></tr>';
    });
    h += '</table>';
    if (Math.abs(sommaPerc - 100) > 0.01) {
      h += '<div style="font-size:11.5px;color:#A32D2D;margin-top:8px;font-weight:600">Le quote sommano ' + sommaPerc.toFixed(2) + '% invece di 100%.</div>';
    }
  }
  h += '</div>';
  box.innerHTML = h;
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

function fvStampaContratto(id) {
  var c = (_fvCon.contratti || []).filter(function (x) { return x.id === id; })[0];
  if (!c) return;
  var righe = (_fvCon.righe || []).filter(function (r) { return r.contratto_id === c.id; });
  var quote = (_fvCon.quote || []).filter(function (q) { return q.contratto_id === c.id; });
  var imponibile = righe.length
    ? righe.reduce(function (s, r) { return s + Number(r.quantita || 0) * Number(r.prezzo_unitario || 0); }, 0)
    : Number(c.imponibile || 0);
  var iva = imponibile * Number(c.aliquota_iva || 0) / 100;

  var corpo = righe.length
    ? righe.map(function (r) {
        var t = Number(r.quantita || 0) * Number(r.prezzo_unitario || 0);
        return '<tr><td class="l">' + _fvEsc(r.descrizione) + '</td><td>' + Number(r.quantita).toLocaleString('it-IT')
          + '</td><td>' + c.aliquota_iva + '%</td><td>' + _fvEuro(r.prezzo_unitario) + '</td><td>' + _fvEuro(t * (1 + Number(c.aliquota_iva || 0) / 100)) + '</td></tr>';
      }).join('')
    : '<tr><td class="l">' + _fvEsc(c.descrizione_tecnica || '') + '</td><td>1</td><td>' + c.aliquota_iva + '%</td><td>'
      + _fvEuro(imponibile) + '</td><td>' + _fvEuro(imponibile + iva) + '</td></tr>';

  var qh = quote.map(function (q) {
    return '<tr><td class="l" style="width:60px">' + Number(q.percentuale).toLocaleString('it-IT') + '%</td>'
      + '<td class="l">' + _fvEsc(q.evento) + '</td><td>' + _fvEuro(q.importo_ivato) + '</td></tr>';
  }).join('');

  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Contratto ' + c.numero + '-' + c.anno + '</title>' + _fvStile() + '</head><body>'
    + _fvTestata('Contratto n. ' + c.numero + ' del ' + _fvData(c.data), 'Fornitura e installazione impianto fotovoltaico')
    + '<div class="parti">'
    + '<div><div class="et">Il Fornitore</div><strong>' + _FV_AZIENDA.nome + '</strong><br>' + _FV_AZIENDA.indirizzo + '<br>' + _FV_AZIENDA.citta
    + '<br>C.F. ' + _FV_AZIENDA.cf + '<br>P.IVA ' + _FV_AZIENDA.piva + '<br>' + _FV_AZIENDA.email + '<br>' + _FV_AZIENDA.pec + '</div>'
    + '<div><div class="et">Spettabile</div><strong>' + _fvEsc(c.cliente_nome) + '</strong><br>' + _fvEsc(c.cliente_indirizzo || '')
    + (c.cliente_piva ? '<br>C.F. / P.IVA ' + _fvEsc(c.cliente_piva) : '')
    + (c.sito_installazione ? '<br>Sito: ' + _fvEsc(c.sito_installazione) : '') + '</div></div>'
    + '<table><tr><th class="l">Descrizione</th><th>Quantità</th><th>IVA</th><th>Importo</th><th>Totale</th></tr>' + corpo + '</table>'
    + '<table class="tot"><tr><td class="l">Imponibile</td><td>' + _fvEuro(imponibile) + '</td></tr>'
    + '<tr><td class="l">Imposta ' + c.aliquota_iva + '%</td><td>' + _fvEuro(iva) + '</td></tr>'
    + '<tr class="gr"><td class="l">Totale</td><td>' + _fvEuro(imponibile + iva) + '</td></tr></table>'
    + '<div style="clear:both"></div>'
    + '<div style="display:flex;gap:26px;margin-top:16px">'
    + '<div style="flex:1.3"><div style="font-weight:700;font-size:11px;margin-bottom:5px">Termini di pagamento</div>'
    + '<table><tr><th class="l">Quota</th><th class="l">Scadenza</th><th>Importo (IVA incl.)</th></tr>' + qh + '</table></div>'
    + '<div style="flex:1;font-size:9.5px;line-height:1.6;padding-top:20px">'
    + (c.modalita_pagamento ? 'Modalità: ' + _fvEsc(c.modalita_pagamento) + '<br>' : '')
    + (c.banca_appoggio ? 'Banca: ' + _fvEsc(c.banca_appoggio) + '<br>' : '')
    + (c.iban ? 'IBAN: ' + _fvEsc(c.iban) + '<br>' : '')
    + (c.intestatario ? 'Intestatario: ' + _fvEsc(c.intestatario) : '') + '</div></div>'
    + (c.condizioni ? '<div class="box">' + _fvEsc(c.condizioni) + '</div>' : '')
    + (c.riferimento_offerta ? '<div style="font-size:9px;color:#666;margin-top:8px">Il presente contratto recepisce ' + _fvEsc(c.riferimento_offerta) + '.</div>' : '')
    + '<div class="firme"><div><div class="et" style="font-size:9px;color:#777">Il Fornitore</div><strong>' + _FV_AZIENDA.nome + '</strong>'
    + '<div class="riga"></div><div style="font-size:9px;color:#777">Luogo e data</div></div>'
    + '<div><div class="et" style="font-size:9px;color:#777">Il Cliente</div><strong>' + _fvEsc(c.cliente_nome) + ' — per accettazione</strong>'
    + '<div class="riga"></div><div style="font-size:9px;color:#777">Luogo e data</div></div></div>'
    + '<div class="foot">' + _FV_AZIENDA.nome + ' · ' + _FV_AZIENDA.indirizzo + ', ' + _FV_AZIENDA.citta + ' · P.IVA ' + _FV_AZIENDA.piva + ' · ' + _FV_AZIENDA.email + '</div>'
    + '</body></html>';
  _fvApriStampa(doc);
}

function fvStampaOfferta(id) {
  var o = (_fvOff.offerte || []).filter(function (x) { return x.id === id; })[0];
  if (!o) return;
  var righe = (_fvOff.righe || []).filter(function (r) { return r.offerta_id === o.id; });
  var imponibile = righe.reduce(function (s, r) { return s + Number(r.quantita || 0) * Number(r.prezzo_unitario || 0); }, 0);
  var iva = imponibile * Number(o.aliquota_iva || 0) / 100;
  var schema = (_fvSchemi || []).filter(function (s2) { return s2.id === o.schema_pagamento_id; })[0];
  var totIvato = imponibile + iva;

  var pagine = '';
  // pagina 1 — copertina
  pagine += '<div class="pg">' + _fvTestata('La vostra offerta personale', _fvData(o.data))
    + '<div style="margin-top:40px"><div style="font-size:22px;font-weight:700;line-height:1.3">Energia pulita e sostenibile<br>per la vostra azienda</div>'
    + '<div style="font-size:12px;color:#555;margin-top:14px">Offerta n. ' + (o.numero || '—') + '/' + o.anno + '</div></div>'
    + '<div class="parti" style="margin-top:46px">'
    + '<div><div class="et">Da</div><strong>' + _FV_AZIENDA.nome + '</strong><br>' + _FV_AZIENDA.indirizzo + '<br>' + _FV_AZIENDA.citta
    + '<br>' + _FV_AZIENDA.email + '<br>' + _FV_AZIENDA.tel + '</div>'
    + '<div><div class="et">Per</div><strong>' + _fvEsc(o.cliente_nome) + '</strong><br>' + _fvEsc(o.cliente_indirizzo || '')
    + (o.cliente_piva ? '<br>P.IVA ' + _fvEsc(o.cliente_piva) : '')
    + (o.sito_installazione ? '<br><br><span class="et">Sito di installazione</span><br>' + _fvEsc(o.sito_installazione) : '') + '</div></div>'
    + (o.potenza_kwp ? '<div class="box" style="margin-top:40px;font-size:11px"><strong>Impianto fotovoltaico da ' + Number(o.potenza_kwp).toLocaleString('it-IT') + ' kWp</strong>'
        + (o.produzione_kwh_anno ? ' · produzione stimata ' + Number(o.produzione_kwh_anno).toLocaleString('it-IT') + ' kWh/anno' : '') + '</div>' : '')
    + '</div>';

  // pagina 2 — componenti
  pagine += '<div class="pg">' + _fvTestata('Elenco delle parti', 'Tutti i componenti previsti')
    + '<table><tr><th class="l">Descrizione</th><th>Quantità</th><th>Prezzo unitario</th><th>Totale</th></tr>'
    + righe.map(function (r) {
        return '<tr><td class="l">' + _fvEsc(r.descrizione) + (r.tipo ? '<div style="font-size:8.5px;color:#777">' + _fvEsc(r.tipo) + '</div>' : '') + '</td>'
          + '<td>' + Number(r.quantita).toLocaleString('it-IT') + '</td><td>' + _fvEuro(r.prezzo_unitario) + '</td>'
          + '<td>' + _fvEuro(Number(r.quantita || 0) * Number(r.prezzo_unitario || 0)) + '</td></tr>';
      }).join('')
    + '</table>'
    + '<table class="tot"><tr><td class="l">Totale (netto)</td><td>' + _fvEuro(imponibile) + '</td></tr>'
    + '<tr><td class="l">IVA ' + o.aliquota_iva + '%</td><td>' + _fvEuro(iva) + '</td></tr>'
    + '<tr class="gr"><td class="l">Totale (lordo)</td><td>' + _fvEuro(totIvato) + '</td></tr></table></div>';

  // pagina 3 — analisi finanziaria + pagamenti + accettazione
  var kpi = function (l, v) {
    return '<div style="flex:1;border:1px solid #ddd;border-radius:6px;padding:10px 12px"><div style="font-size:8.5px;color:#777;text-transform:uppercase">' + l + '</div>'
      + '<div style="font-size:16px;font-weight:700;font-family:Consolas,monospace">' + v + '</div></div>';
  };
  pagine += '<div>' + _fvTestata('Analisi finanziaria e condizioni', _fvData(o.data));
  if (o.rendimento_totale || o.break_even_anni || o.tir) {
    pagine += '<div style="display:flex;gap:9px;margin-bottom:14px">'
      + kpi('Investimento', _fvEuro(imponibile))
      + kpi('Rendimento totale', o.rendimento_totale ? _fvEuro(o.rendimento_totale) : '—')
      + kpi('Break-even', o.break_even_anni ? Number(o.break_even_anni).toLocaleString('it-IT') + ' anni' : '—')
      + kpi('TIR', o.tir ? Number(o.tir).toLocaleString('it-IT') + ' %' : '—')
      + '</div>';
  }
  if (schema && schema.quote) {
    var q = (typeof schema.quote === 'string') ? JSON.parse(schema.quote) : schema.quote;
    pagine += '<div style="font-weight:700;font-size:11px;margin:12px 0 5px">Termini di pagamento</div>'
      + '<table><tr><th class="l">Quota</th><th class="l">Scadenza</th><th>Importo (IVA incl.)</th></tr>'
      + q.map(function (x) {
          return '<tr><td class="l" style="width:60px">' + x.perc + '%</td><td class="l">' + _fvEsc(x.evento) + '</td><td>'
            + _fvEuro(totIvato * x.perc / 100) + '</td></tr>';
        }).join('') + '</table>';
  }
  pagine += '<div class="box">I prezzi si intendono IVA esclusa, aliquota ' + o.aliquota_iva + '%. L\'offerta ha validità 30 giorni dalla data di emissione. '
    + 'I materiali indicati potranno essere sostituiti con equipollenti per prestazioni e affidabilità in caso di indisponibilità. '
    + 'I tempi di esecuzione decorrono dall\'incasso della prima quota.</div>';
  pagine += '<div style="font-weight:700;font-size:12px;margin-top:22px">Accettare l\'offerta</div>'
    + '<div class="firme"><div><div style="font-size:9px;color:#777">Il Cliente</div><strong>' + _fvEsc(o.cliente_nome) + '</strong><div class="riga"></div></div>'
    + '<div><div style="font-size:9px;color:#777">Il Fornitore</div><strong>' + _FV_AZIENDA.nome + '</strong><div class="riga"></div></div></div>'
    + '<div class="foot">' + _FV_AZIENDA.nome + ' · ' + _FV_AZIENDA.indirizzo + ', ' + _FV_AZIENDA.citta + ' · ' + _FV_AZIENDA.email + '</div></div>';

  _fvApriStampa('<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Preventivo ' + (o.numero || '') + '-' + o.anno + '</title>' + _fvStile() + '</head><body>' + pagine + '</body></html>');
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
  var h = '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;margin-bottom:12px">'
    + '<div><div style="font-size:16px;font-weight:700">🏭 Fornitori fotovoltaico</div>'
    + '<div style="font-size:11.5px;color:var(--text-muted)">Chi ci fornisce gli impianti chiavi in mano. Separati dai fornitori carburanti.</div></div>'
    + (_fvPuo() ? '<button onclick="fvModaleFornitore()" class="btn-primary" style="font-size:12px;padding:7px 13px">+ Nuovo fornitore</button>' : '')
    + '</div>';
  if (!(_fvForn || []).length) { box.innerHTML = h + _fvVuoto('Nessun fornitore.'); return; }
  h += '<div class="card" style="padding:0;overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px;min-width:640px">';
  h += '<tr style="color:var(--text-muted);font-size:10px;text-transform:uppercase;letter-spacing:.3px">'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Ragione sociale</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">P.IVA</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Sede</th>'
    + '<th style="text-align:left;padding:8px 10px;border-bottom:1.5px solid var(--border)">Contatti</th>'
    + '<th style="width:70px;border-bottom:1.5px solid var(--border)"></th></tr>';
  _fvForn.forEach(function (f) {
    h += '<tr style="border-bottom:0.5px solid var(--border)">'
      + '<td style="padding:9px 10px"><strong>' + _fvEsc(f.ragione_sociale) + '</strong></td>'
      + '<td style="padding:9px 10px;font-family:var(--font-mono)">' + _fvEsc(f.piva || '—') + '</td>'
      + '<td style="padding:9px 10px">' + _fvEsc([f.indirizzo, f.comune, f.provincia ? '(' + f.provincia + ')' : ''].filter(Boolean).join(', ') || '—') + '</td>'
      + '<td style="padding:9px 10px;font-size:11.5px;color:var(--text-muted)">' + _fvEsc([f.referente, f.telefono, f.email].filter(Boolean).join(' · ') || '—') + '</td>'
      + '<td style="padding:9px 10px;text-align:right">' + (_fvPuo() ? '<button onclick="fvModaleFornitore(\'' + f.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">✏️</button>' : '') + '</td></tr>';
  });
  h += '</table></div>';
  box.innerHTML = h;
}

function fvModaleFornitore(id) {
  var f = id ? (_fvForn || []).filter(function (x) { return x.id === id; })[0] : null;
  var inp = 'width:100%;padding:8px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);font-size:13px';
  var lb = 'display:block;font-size:11px;color:var(--text-muted);font-weight:500;margin-bottom:3px';
  var v = function (k) { return _fvEsc(f && f[k] || ''); };
  var h = '<div style="max-width:560px"><div style="font-size:16px;font-weight:600;margin-bottom:12px">' + (f ? 'Modifica fornitore' : 'Nuovo fornitore fotovoltaico') + '</div>';
  h += '<div style="display:grid;grid-template-columns:2fr 1fr 1fr;gap:10px">';
  h += '<div style="grid-column:1/4"><label style="' + lb + '">Ragione sociale *</label><input id="fvf-rs" value="' + v('ragione_sociale') + '" style="' + inp + '"></div>';
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
  var p = {
    ragione_sociale: g('fvf-rs'), piva: g('fvf-piva') || null, codice_fiscale: g('fvf-cf') || null,
    indirizzo: g('fvf-ind') || null, cap: g('fvf-cap') || null, comune: g('fvf-com') || null,
    provincia: (g('fvf-prov') || '').toUpperCase() || null, referente: g('fvf-ref') || null,
    telefono: g('fvf-tel') || null, email: g('fvf-mail') || null, pec: g('fvf-pec') || null,
    iban: g('fvf-iban') || null
  };
  var r = id ? await sb.from('fv_fornitori').update(p).eq('id', id) : await sb.from('fv_fornitori').insert([p]);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
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
  if (tab === 'fv-tab-investimenti' && typeof caricaInvestimenti === 'function') caricaInvestimenti();
  if (tab === 'fv-tab-offerte') fvCaricaOfferte();
  if (tab === 'fv-tab-contratti') fvCaricaContratti();
  if (tab === 'fv-tab-clienti') fvCaricaClienti();
  if (tab === 'fv-tab-catalogo') fvCaricaCatalogo();
  if (tab === 'fv-tab-fornitori') fvCaricaFornitori();
}

// Punto d'ingresso della sezione (chiamato dal menu)
function caricaFotovoltaico() {
  if (typeof caricaInvestimenti === 'function') caricaInvestimenti();
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
