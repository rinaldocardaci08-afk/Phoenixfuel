// PhoenixFuel — Preventivo a cliente
// v20260918e — intestazione con i dati della carta intestata (Portosalvo, tel, fax, info@ e logistica@); A4 verticale.
// v20260918d — STAMPA completa: logo Phoenix Fuel, intestazione con dati societari, tabella prezzi, condizioni
//              (validita' per consegne del giorno successivo, salvo problematiche di fornitori/terzi), riquadro
//              firma "per accettazione" del cliente e firma Phoenix Fuel.
// v20260918c — UN SOLO PREZZO per prodotto: casella accanto a ogni fornitore (una sola spuntabile per prodotto);
//              "Stampa preventivo" attivo solo con un prezzo scelto, e stampa solo quello. CLIENTE RETE
//              (clienti.cliente_rete): sotto compare un secondo blocco per la Benzina con margine e fornitori
//              suoi, cosi' il preventivo porta gasolio + benzina, un prezzo per prodotto.
// v20260918b — prodotti in ordine fisso (Gasolio Autotrazione primo, poi Benzina, Agricolo, AdBlue); cella prodotto in grassetto e piu' grande
// v20260918a — in alto, in evidenza: "Stai lavorando sui prezzi del: gg/mm/aaaa" (data del listino aperto)
// v20260805g — la base la decide pfBasePerRiga, la stessa regola del listino
// v20260805f — le righe del deposito si prendono dal listino gia calcolato:
//              non stanno nella tabella prezzi, sono ricavate dal CMP
// v20260805e — se il nostro deposito manca dal confronto, la pagina dice
//              perche: non ha il prezzo di quel prodotto oggi
// v20260805d — confronto prodotti senza maiuscole/spazi e deposito incluso
//              comunque si chiami la sua base
// v20260805c — scegliendo una base di Vibo il nostro deposito entra sempre
//              fra i fornitori: fisicamente sta li
// v20260805b — il dettaglio del margine si apre SOPRA il preventivo, con una
//              finestrella sua: chiudendolo il preventivo resta
// v20260805a
//
// Dal listino prezzi: scelto cliente, deposito e prodotto, mostra per
// ogni fornitore attivo il prezzo che si puo fare al cliente.
//
// NIENTE QUERY NUOVE (regola sua del 05/08):
//   - i costi e i fornitori vengono dalla tabella `prezzi`, la stessa che
//     genera il listino;
//   - il margine proposto e la MEDIA DEGLI ULTIMI ORDINI calcolata
//     esattamente come in pf-ordini.js: stesso filtro, stesso limite;
//   - il dettaglio si apre con `mostraUltimiOrdiniClienteAnagrafica`, lo
//     stesso popup che si vede in Ordini;
//   - i costi di trasporto vengono da `costi_trasporto`, gestita in
//     Logistica → Mezzi propri.

var _pvState = { clienteId: '', clienteNome: '', baseId: '', prodotto: '', margine: 0, trasporto: 0 };
var _pvBasi = [];
var _pvClienti = [];
var _pvProdotti = [];
var _PV_ORDINE_PROD = ['gasolio autotrazione', 'benzina', 'gasolio agricolo', 'adblue'];
function _pvOrdProd(p) {
  var i = _PV_ORDINE_PROD.indexOf(String(p || '').trim().toLowerCase());
  return i < 0 ? 99 : i;
}
var _pvTrasporti = [];
var _pvPrezzi = [];
// 18/09: prezzo scelto per il prodotto principale, e blocco Benzina per il cliente rete
_pvState.scelto = null;
_pvState.rete = false;
_pvState.benz = { margine: 0, scelto: null };
function _pvBenzAttivo() {
  return _pvState.rete && !_pvStessoProd(_pvState.prodotto, 'Benzina')
      && _pvProdotti.some(function (p) { return _pvStessoProd(p, 'Benzina'); });
}

function _pvNum(v, d) { return Number(v || 0).toFixed(d === undefined ? 6 : d); }
function _pvData() {
  var el = document.getElementById('filtro-data-prezzi');
  return (el && el.value) ? el.value : new Date().toISOString().split('T')[0];
}

async function apriPreventivoCliente() {
  var data = _pvData();
  apriModal('<div style="padding:24px;text-align:center;color:var(--text-muted)">Carico il listino del ' + _pfIsoToIt(data) + '...</div>');
  try {
    // v20260805f — IL LISTINO COMPLETO, NON SOLO LA TABELLA `prezzi`.
    // Le righe del NOSTRO DEPOSITO non stanno in `prezzi`: la pagina del
    // listino le calcola dal CMP e dalla giacenza delle cisterne e le
    // lascia in `window._pfListinoCompleto`. Ecco perche il preventivo
    // non le vedeva: leggeva solo la tabella. Ora prende quelle, e usa
    // la tabella solo se il listino non e ancora stato aperto.
    var r = await Promise.all([
      sb.from('prezzi').select('*, basi_carico(id,nome)').eq('data', data),
      sb.from('clienti').select('id,nome,cliente_rete').eq('attivo', true).order('nome'),
      (typeof pfCostiTrasporto === 'function')
        ? pfCostiTrasporto()
        : sb.from('costi_trasporto').select('*').eq('attivo', true).order('valore').then(function (x) { return x.data || []; })
    ]);
    var pronte = (window._pfListinoCompleto && window._pfListinoCompleto.data === data)
      ? (window._pfListinoCompleto.righe || []) : null;
    _pvPrezzi = (pronte || r[0].data || []).filter(function (p) { return Number(p.costo_litro) > 0; });

    _pvClienti = r[1].data || [];
    _pvTrasporti = r[2] || [];

    // basi e prodotti: solo quelli che hanno davvero un prezzo oggi
    // le stesse basi del listino: vibo, milazzo, altre
    var ETICHETTE = { vibo: 'Vibo Marina', milazzo: 'Milazzo', altre: 'Altre basi' };
    var vistiB = {}, vistiP = {};
    _pvBasi = []; _pvProdotti = [];
    _pvPrezzi.forEach(function (p) {
      var k = _pvBase(p);
      if (!vistiB[k]) { vistiB[k] = true; _pvBasi.push({ id: k, nome: ETICHETTE[k] || k }); }
      if (p.prodotto && !vistiP[p.prodotto]) { vistiP[p.prodotto] = true; _pvProdotti.push(p.prodotto); }
    });
    _pvBasi.sort(function (a, b) { return a.nome < b.nome ? -1 : 1; });
    // 18/09: ordine fisso — Gasolio Autotrazione, Benzina, Gasolio Agricolo, AdBlue, poi il resto in alfabetico
    _pvProdotti.sort(function (a, b) { return _pvOrdProd(a) - _pvOrdProd(b) || a.localeCompare(b); });

    if (!_pvBasi.length) {
      apriModal('<div style="padding:20px;font-size:13px;color:var(--text-muted)">Nessun prezzo inserito per il '
        + _pfIsoToIt(data) + ': senza listino non posso fare un preventivo.</div>'
        + '<div style="display:flex;justify-content:flex-end;margin-top:14px"><button onclick="chiudiModal()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Chiudi</button></div>');
      return;
    }
    if (!_pvState.baseId || !vistiB[_pvState.baseId]) _pvState.baseId = _pvBasi[0].id;
    if (!_pvState.prodotto || !vistiP[_pvState.prodotto]) _pvState.prodotto = _pvProdotti[0];
    if (!_pvState.trasporto && _pvTrasporti.length) _pvState.trasporto = Number(_pvTrasporti[0].valore);
    _pvRender();
  } catch (e) {
    apriModal('<div style="padding:20px;color:#A32D2D;font-size:13px">Errore: ' + esc((e && e.message) || e) + '</div>');
  }
}

// Il margine medio: STESSO calcolo di pf-ordini.js, non uno nuovo.
async function _pvMargineMedio(clienteId, clienteNome, prodotto) {
  if (!clienteId || !prodotto || !clienteNome) return 0;
  var r = await sb.from('ordini').select('margine')
    .or('cliente_id.eq.' + clienteId + ',cliente.eq.' + clienteNome)
    .eq('prodotto', prodotto).neq('stato', 'annullato').eq('tipo_ordine', 'cliente')
    .gt('margine', 0).order('data', { ascending: false }).limit(10);
  var d = r.data || [];
  if (!d.length) return 0;
  return d.reduce(function (s, o) { return s + Number(o.margine); }, 0) / d.length;
}

async function pvCambia(campo, valore) {
  if (campo === 'cliente') {
    _pvState.clienteId = valore;
    var c = _pvClienti.filter(function (x) { return x.id === valore; })[0];
    _pvState.clienteNome = c ? c.nome : '';
    _pvState.rete = !!(c && c.cliente_rete);
  } else if (campo === 'base') _pvState.baseId = valore;
  else if (campo === 'prodotto') _pvState.prodotto = valore;
  else if (campo === 'trasporto') _pvState.trasporto = Number(valore || 0);
  else if (campo === 'margine') { _pvState.margine = Number(valore || 0); _pvRender(); return; }
  else if (campo === 'margineBenz') { _pvState.benz.margine = Number(valore || 0); _pvRender(); return; }

  // cambiando cliente, base o prodotto la scelta del prezzo si azzera: va rifatta sui prezzi nuovi
  if (campo === 'cliente' || campo === 'base' || campo === 'prodotto') { _pvState.scelto = null; _pvState.benz.scelto = null; }

  // cliente o prodotto cambiati: si ripropone il margine dagli ordini
  if (campo === 'cliente' || campo === 'prodotto') {
    _pvState.margine = await _pvMargineMedio(_pvState.clienteId, _pvState.clienteNome, _pvState.prodotto);
  }
  if (campo === 'cliente' && _pvBenzAttivo()) {
    _pvState.benz.margine = await _pvMargineMedio(_pvState.clienteId, _pvState.clienteNome, 'Benzina');
  }
  _pvRender();
}

// Spunta di un prezzo: una sola per blocco (gasolio / benzina)
function pvScegli(blocco, fornitore, checked) {
  if (blocco === 'benz') _pvState.benz.scelto = checked ? fornitore : null;
  else _pvState.scelto = checked ? fornitore : null;
  _pvRender();
}

// ═══ v20260805b · IL DETTAGLIO SI APRE SOPRA, NON AL POSTO ══════════
// Il popup di Ordini usa lo STESSO modale del preventivo: aprirlo lo
// sostituiva, e chiudendolo si perdeva tutto il lavoro fatto. Qui si
// apre una finestrella propria, sopra il modale, che si chiude da sola
// senza toccare quello che c'e sotto — il preventivo resta com'era.
// I dati sono gli stessi: stessa query degli ordini, stesse colonne.
async function pvDettaglioMargine() {
  if (!_pvState.clienteId) { toast('Scegli prima il cliente'); return; }
  var vecchio = document.getElementById('pv-overlay');
  if (vecchio) vecchio.remove();

  var d = document.createElement('div');
  d.id = 'pv-overlay';
  d.style.cssText = 'position:fixed;inset:0;z-index:100000;background:rgba(0,0,0,0.45);'
    + 'display:flex;align-items:center;justify-content:center;padding:20px';
  d.innerHTML = '<div style="background:var(--bg-card);border-radius:14px;padding:20px;max-width:680px;width:100%;'
    + 'max-height:86vh;overflow:auto;box-shadow:0 16px 44px rgba(0,0,0,0.4)" id="pv-overlay-box">'
    + '<div style="padding:24px;text-align:center;color:var(--text-muted)">Carico gli ultimi ordini...</div></div>';
  d.addEventListener('click', function (e) { if (e.target === d) pvChiudiDettaglio(); });
  document.body.appendChild(d);

  try {
    // stessa query del margine proposto, con i campi per il dettaglio
    var r = await sb.from('ordini')
      .select('data,prodotto,litri,costo_litro,trasporto_litro,margine')
      .or('cliente_id.eq.' + _pvState.clienteId + ',cliente.eq.' + (_pvState.clienteNome || '').replace(/'/g, "\\'"))
      .neq('stato', 'annullato').eq('tipo_ordine', 'cliente')
      .eq('prodotto', _pvState.prodotto)
      .order('data', { ascending: false }).limit(5);
    if (r.error) throw r.error;
    var righe = r.data || [];
    var box = document.getElementById('pv-overlay-box');
    if (!box) return;

    var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">';
    h += '<div><div style="font-size:15px;font-weight:600;color:#0C447C">Ultimi 5 ordini</div>'
      + '<div style="font-size:12px;color:var(--text-muted)"><strong>' + esc(_pvState.clienteNome) + '</strong> &middot; ' + esc(_pvState.prodotto) + '</div></div>';
    h += '<button onclick="pvChiudiDettaglio()" style="border:none;background:transparent;font-size:22px;line-height:1;color:var(--text-muted);cursor:pointer">&times;</button>';
    h += '</div>';

    if (!righe.length) {
      h += '<div style="padding:20px;color:var(--text-muted);font-size:13px">Nessun ordine di questo prodotto per questo cliente.</div>';
    } else {
      var totL = 0, sommaM = 0;
      h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px;margin-top:14px">';
      h += '<tr style="background:var(--bg-kpi);color:var(--text-muted);text-align:right">'
        + '<th style="text-align:left;padding:7px 9px;font-weight:500">Data</th>'
        + '<th style="padding:7px 9px;font-weight:500">Litri</th>'
        + '<th style="padding:7px 9px;font-weight:500">Prezzo netto/L</th>'
        + '<th style="padding:7px 9px;font-weight:500">Margine/L</th></tr>';
      righe.forEach(function (o) {
        var netto = Number(o.costo_litro || 0) + Number(o.trasporto_litro || 0) + Number(o.margine || 0);
        totL += Number(o.litri || 0); sommaM += Number(o.margine || 0);
        h += '<tr style="border-top:0.5px solid var(--border);text-align:right">'
          + '<td style="text-align:left;padding:8px 9px;font-family:var(--font-mono)">' + _pfIsoToIt(o.data) + '</td>'
          + '<td style="padding:8px 9px;font-family:var(--font-mono)">' + Number(o.litri || 0).toLocaleString('it-IT') + ' L</td>'
          + '<td style="padding:8px 9px;font-family:var(--font-mono)">&euro; ' + netto.toFixed(6) + '</td>'
          + '<td style="padding:8px 9px;font-family:var(--font-mono);color:#27500A">+&euro; ' + Number(o.margine || 0).toFixed(4) + '</td></tr>';
      });
      var media = sommaM / righe.length;
      h += '<tr style="border-top:0.5px solid var(--border);background:var(--bg-kpi);text-align:right;font-weight:700">'
        + '<td style="text-align:left;padding:9px">Media</td>'
        + '<td style="padding:9px;font-family:var(--font-mono)">' + totL.toLocaleString('it-IT') + ' L</td>'
        + '<td></td>'
        + '<td style="padding:9px;font-family:var(--font-mono);color:#27500A">+&euro; ' + media.toFixed(4) + '</td></tr>';
      h += '</table>';
      h += '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:14px">';
      h += '<button onclick="pvChiudiDettaglio()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Chiudi</button>';
      h += '<button onclick="pvUsaMedia(' + media + ')" class="btn-primary" style="padding:9px 18px">Usa questa media</button>';
      h += '</div>';
    }
    box.innerHTML = h;
  } catch (e) {
    var b2 = document.getElementById('pv-overlay-box');
    if (b2) b2.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Errore: ' + esc((e && e.message) || e) + '</div>'
      + '<div style="display:flex;justify-content:flex-end"><button onclick="pvChiudiDettaglio()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Chiudi</button></div>';
  }
}

// Chiude SOLO la finestrella: il preventivo sotto resta intatto.
function pvChiudiDettaglio() {
  var d = document.getElementById('pv-overlay');
  if (d) d.remove();
}

function pvUsaMedia(m) {
  pvChiudiDettaglio();
  _pvState.margine = Number(m || 0);
  _pvRender();
}

// v20260805c — IL NOSTRO DEPOSITO STA A VIBO MARINA.
// Nel listino PhoenixFuel ha una base sua ("Deposito Vibo PhoenixFuel"),
// quindi scegliendo Vibo Marina spariva dal confronto. Ma fisicamente e
// li: quando la base scelta e a Vibo, il nostro deposito entra sempre
// fra i fornitori, con la sua base scritta accanto.
// v20260805g — LA BASE LA DECIDE `pfBasePerRiga`, non io.
// Il listino ha gia questa regola da mesi (pf-ordini.js): 'vibo',
// 'milazzo' o 'altre', col deposito Phoenix che vale come Vibo. Io ne
// avevo scritta un'altra, ed era sbagliata. Ora si usa quella, e il
// selettore del deposito lavora sugli stessi tre valori invece che
// sugli id delle basi: cosi scegliendo Vibo esce esattamente quello che
// esce nel listino filtrato su Vibo.
function _pvBase(riga) {
  return (typeof pfBasePerRiga === 'function') ? pfBasePerRiga(riga) : 'altre';
}
function _pvNostro(forn) { return /phoenix/i.test(String(forn || '')); }
// v20260805d — il confronto fra prodotti va fatto senza badare a
// maiuscole e spazi: "Gasolio autotrazione" e "Gasolio Autotrazione"
// sono lo stesso prodotto, e un solo carattere diverso faceva sparire
// una riga dal preventivo.
function _pvStessoProd(a, b) {
  return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

function _pvRighe(prodotto, margine) {
  var S = _pvState;
  if (prodotto === undefined) prodotto = S.prodotto;
  if (margine === undefined) margine = S.margine;
  return _pvPrezzi
    .filter(function (p) {
      return _pvStessoProd(p.prodotto, prodotto) && _pvBase(p) === S.baseId;
    })
    .map(function (p) {
      var costo = Number(p.costo_litro || 0);
      var netto = costo + S.trasporto + margine;
      return { fornitore: p.fornitore, base: p.basi_carico.nome, costo: costo,
               netto: netto, ivato: netto * (1 + Number(p.iva || 22) / 100) };
    })
    .sort(function (a, b) { return a.netto - b.netto; });
}

function _pvRender() {
  var S = _pvState;
  var sel = 'width:100%;padding:9px 10px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);font-size:13px';
  var lbl = 'font-size:10.5px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;margin-bottom:4px;display:block';

  var h = '<div style="max-width:820px">';
  h += '<div style="font-size:16px;font-weight:600">Preventivo a cliente</div>';
  h += '<div style="display:flex;align-items:center;gap:10px;margin:8px 0 14px;padding:9px 14px;background:#E6F1FB;border-left:4px solid #185FA5;border-radius:0 8px 8px 0">'
     + '<span style="font-size:12px;color:#0C447C;text-transform:uppercase;letter-spacing:0.3px">Stai lavorando sui prezzi del:</span>'
     + '<strong style="font-size:18px;font-family:var(--font-mono);color:#0C447C">' + _pfIsoToIt(_pvData()) + '</strong>'
     + '<span style="font-size:11px;color:var(--text-muted);margin-left:auto">solo i fornitori con il prezzo gia inserito</span></div>';

  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:10px">';
  h += '<div style="flex:1.4;min-width:200px"><span style="' + lbl + '">Cliente</span>'
    + '<select onchange="pvCambia(\'cliente\', this.value)" style="' + sel + '">'
    + '<option value="">scegli il cliente\u2026</option>'
    + _pvClienti.map(function (c) {
        return '<option value="' + c.id + '"' + (c.id === S.clienteId ? ' selected' : '') + '>' + esc(c.nome) + '</option>';
      }).join('') + '</select></div>';
  h += '<div style="flex:1.2;min-width:170px"><span style="' + lbl + '">Deposito da cui fornire</span>'
    + '<select onchange="pvCambia(\'base\', this.value)" style="' + sel + '">'
    + _pvBasi.map(function (b) {
        return '<option value="' + b.id + '"' + (b.id === S.baseId ? ' selected' : '') + '>' + esc(b.nome) + '</option>';
      }).join('') + '</select></div>';
  h += '<div style="flex:1.2;min-width:170px"><span style="' + lbl + '">Prodotto</span>'
    + '<select onchange="pvCambia(\'prodotto\', this.value)" style="' + sel + ';font-weight:700;font-size:15px">'
    + _pvProdotti.map(function (p) {
        return '<option value="' + esc(p) + '"' + (p === S.prodotto ? ' selected' : '') + '>' + esc(p) + '</option>';
      }).join('') + '</select></div>';
  h += '</div>';

  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">';
  h += '<div style="flex:1;min-width:190px"><span style="' + lbl + '">Margine &euro;/lt '
    + '<span onclick="pvDettaglioMargine()" title="Le ultime consegne a questo cliente" style="display:inline-flex;align-items:center;justify-content:center;width:15px;height:15px;border-radius:50%;background:#185FA5;color:#fff;font-size:10px;font-weight:700;cursor:pointer;vertical-align:middle">i</span></span>'
    + '<input type="number" step="0.000001" value="' + _pvNum(S.margine) + '" onchange="pvCambia(\'margine\', this.value)" style="' + sel + ';text-align:right;font-family:var(--font-mono)">'
    + '<div style="font-size:10.5px;color:#0C447C;margin-top:3px">'
    + (S.clienteId ? 'media degli ultimi ordini di questo cliente &middot; premi <strong>i</strong> per il dettaglio'
                   : 'scegli il cliente per avere il margine proposto') + '</div></div>';
  h += '<div style="flex:1;min-width:190px"><span style="' + lbl + '">Trasporto &euro;/lt</span>';
  if (_pvTrasporti.length) {
    h += '<select onchange="pvCambia(\'trasporto\', this.value)" style="' + sel + '">'
      + _pvTrasporti.map(function (t) {
          return '<option value="' + t.valore + '"' + (Number(t.valore) === S.trasporto ? ' selected' : '') + '>'
            + Number(t.valore).toFixed(3).replace('.', ',') + (t.descrizione ? ' \u2014 ' + esc(t.descrizione) : '') + '</option>';
        }).join('') + '</select>';
  } else {
    h += '<input type="number" step="0.000001" value="' + _pvNum(S.trasporto) + '" onchange="pvCambia(\'trasporto\', this.value)" style="' + sel + ';text-align:right;font-family:var(--font-mono)">'
      + '<div style="font-size:10.5px;color:#854F0B;margin-top:3px">Nessun costo di trasporto in archivio: si inseriscono in Logistica &rarr; Mezzi propri</div>';
  }
  h += '</div></div>';

  var righe = _pvRighe();
  h += _pvTabella(righe, 'main', S.margine, S.scelto);
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:10px;line-height:1.6">'
    + 'Costo e fornitori vengono dal listino del giorno, in sola lettura. Trasporto e margine sono quelli scelti sopra: '
    + 'per cambiarli si usano i campi, non la tabella.'
    + (righe.some(function (r) { return _pvNostro(r.fornitore); })
        ? ' Il <strong>nostro deposito</strong> compare fra le fonti perche si trova a Vibo Marina.' : '') + '</div>';

  // v20260805e — Se il nostro deposito manca, dire PERCHE.
  // Capita spesso: il prezzo del deposito viene inserito solo su alcuni
  // prodotti, e senza una spiegazione sembra che il preventivo lo ignori.
  if (!righe.some(function (r) { return _pvNostro(r.fornitore); })) {
    var altriProd = [];
    _pvPrezzi.forEach(function (p) {
      if (_pvNostro(p.fornitore) && !_pvStessoProd(p.prodotto, S.prodotto) && altriProd.indexOf(p.prodotto) < 0) {
        altriProd.push(p.prodotto);
      }
    });
    if (altriProd.length) {
      h += '<div style="background:#FAEEDA;border:0.5px solid #E4C892;border-radius:8px;padding:10px 13px;margin-top:10px;font-size:11.5px;color:#854F0B">'
        + 'Il <strong>nostro deposito</strong> non ha il prezzo di <strong>' + esc(S.prodotto) + '</strong> nel listino di oggi: '
        + 'lo ha su ' + altriProd.map(function (x) { return esc(x); }).join(', ') + '. Per vederlo qui va inserito il prezzo di questo prodotto.</div>';
    }
  }

  // ── Cliente rete: secondo blocco Benzina ─────────────────────────────
  if (_pvBenzAttivo()) {
    var righeB = _pvRighe('Benzina', S.benz.margine);
    h += '<div style="margin-top:18px;padding-top:14px;border-top:2px solid #185FA5">';
    h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:10px">'
      + '<span style="font-size:15px;font-weight:700">Benzina</span>'
      + '<span style="font-size:10.5px;background:#E6F1FB;color:#0C447C;padding:2px 8px;border-radius:8px">cliente rete: secondo prodotto del preventivo</span>'
      + '<div style="margin-left:auto;display:flex;align-items:center;gap:6px"><span style="' + lbl + ';margin:0">Margine &euro;/lt</span>'
      + '<input type="number" step="0.000001" value="' + _pvNum(S.benz.margine) + '" onchange="pvCambia(\'margineBenz\', this.value)" style="' + sel + ';width:150px;text-align:right;font-family:var(--font-mono)"></div></div>';
    h += _pvTabella(righeB, 'benz', S.benz.margine, S.benz.scelto);
    h += '<div style="font-size:11px;color:var(--text-muted);margin-top:6px">Stesso deposito e stesso trasporto scelti sopra; margine proposto dalle ultime consegne di benzina a questo cliente.</div>';
    h += '</div>';
  }

  var nScelti = (S.scelto ? 1 : 0) + (_pvBenzAttivo() && S.benz.scelto ? 1 : 0);
  h += '<div style="display:flex;gap:8px;justify-content:flex-end;align-items:center;margin-top:14px">';
  if (!nScelti) h += '<span style="font-size:11.5px;color:#854F0B;margin-right:auto">Spunta il prezzo da comunicare al cliente (uno per prodotto) per attivare la stampa.</span>';
  else h += '<span style="font-size:11.5px;color:#27500A;margin-right:auto">' + nScelti + ' prezz' + (nScelti === 1 ? 'o' : 'i') + ' selezionat' + (nScelti === 1 ? 'o' : 'i') + ': pronto per la stampa.</span>';
  h += '<button onclick="chiudiModal()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Chiudi</button>';
  h += '<button onclick="pvStampa()" class="btn-primary" ' + (nScelti ? '' : 'disabled') + ' style="padding:9px 18px' + (nScelti ? '' : ';opacity:.45;cursor:not-allowed') + '">&#128424; Stampa preventivo</button>';
  h += '</div></div>';
  apriModal(h);
}

// Tabella fornitori di un blocco (gasolio principale o benzina), con la casella di scelta
function _pvTabella(righe, blocco, margine, scelto) {
  var S = _pvState, h = '';
  if (!righe.length) {
    var nomeProd = blocco === 'benz' ? 'Benzina' : S.prodotto;
    return '<div style="background:#FAEEDA;border:0.5px solid #E4C892;border-radius:8px;padding:12px 14px;font-size:12.5px;color:#854F0B">'
      + 'Nessun fornitore ha il prezzo di <strong>' + esc(nomeProd) + '</strong> da questo deposito nel listino di oggi.</div>';
  }
  h += '<table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  h += '<tr style="color:var(--text-muted)">'
    + '<th style="width:34px;padding:7px 4px;font-weight:500" title="Scegli il prezzo da comunicare">&#10003;</th>'
    + '<th style="text-align:left;padding:7px 8px;font-weight:500">Fornitore</th>'
    + '<th style="text-align:right;padding:7px 8px;font-weight:500;width:104px">Costo &euro;/lt</th>'
    + '<th style="text-align:right;padding:7px 8px;font-weight:500;width:104px">Trasporto</th>'
    + '<th style="text-align:right;padding:7px 8px;font-weight:500;width:96px">Margine</th>'
    + '<th style="text-align:right;padding:7px 8px;font-weight:500;width:170px">Prezzo imponibile &middot; ivato</th></tr>';
  righe.forEach(function (r, i) {
    var best = (i === 0), sel = (scelto === r.fornitore);
    h += '<tr style="border-top:0.5px solid var(--border)' + (sel ? ';background:#E6F1FB;outline:1.5px solid #185FA5' : (best ? ';background:#EAF3DE' : '')) + '">'
      + '<td style="padding:11px 4px;text-align:center"><input type="checkbox" ' + (sel ? 'checked' : '') + ' onchange="pvScegli(\'' + blocco + '\',\'' + esc(r.fornitore).replace(/'/g, "\\'") + '\',this.checked)" style="width:16px;height:16px;cursor:pointer"></td>'
      + '<td style="padding:11px 8px"><strong>' + esc(r.fornitore) + '</strong> <span style="font-size:11px;color:var(--text-muted)">' + esc(r.base) + '</span>'
        + (best ? ' <span style="font-size:10px;background:#639922;color:#fff;padding:1px 7px;border-radius:8px;margin-left:4px">migliore</span>' : '')
        + (sel ? ' <span style="font-size:10px;background:#185FA5;color:#fff;padding:1px 7px;border-radius:8px;margin-left:4px">da comunicare</span>' : '') + '</td>'
      + '<td style="padding:11px 8px;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + _pvNum(r.costo) + '</td>'
      + '<td style="padding:11px 8px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + _pvNum(S.trasporto) + '</td>'
      + '<td style="padding:11px 8px;text-align:right;font-family:var(--font-mono);color:#27500A">' + _pvNum(margine) + '</td>'
      + '<td style="padding:11px 8px;text-align:right;font-family:var(--font-mono)"><strong style="' + (best ? 'color:#27500A' : '') + '">' + _pvNum(r.netto) + '</strong>'
        + '<div style="font-size:11px;color:var(--text-muted)">' + _pvNum(r.ivato, 5) + ' ivato</div></td></tr>';
  });
  h += '</table>';
  return h;
}

var _PV_LOGO = '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';

function pvStampa() {
  var S = _pvState;
  // SOLO i prezzi scelti: uno per prodotto
  var blocchi = [];
  var rM = _pvRighe().filter(function (r) { return r.fornitore === S.scelto; });
  if (rM.length) blocchi.push({ prodotto: S.prodotto, riga: rM[0] });
  if (_pvBenzAttivo()) {
    var rB = _pvRighe('Benzina', S.benz.margine).filter(function (r) { return r.fornitore === S.benz.scelto; });
    if (rB.length) blocchi.push({ prodotto: 'Benzina', riga: rB[0] });
  }
  if (!blocchi.length) { toast('Spunta prima il prezzo da comunicare'); return; }
  var w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra: consenti i popup e riprova'); return; }
  var oggi = new Date().toLocaleDateString('it-IT');
  var domani = new Date(); domani.setDate(domani.getDate() + 1);
  var domaniTxt = domani.toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Preventivo ' + oggi + '</title><style>'
    + '@page{size:A4;margin:14mm}body{font-family:Calibri,Arial,sans-serif;color:#222;margin:0;font-size:12.5px;line-height:1.5}'
    + '.hd{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #C8102E;padding-bottom:10px;margin-bottom:18px}'
    + '.hd img{height:74px}.dati{text-align:right;font-size:10.5px;color:#444;line-height:1.45}.dati strong{font-size:12px;color:#111}'
    + 'h2{font-size:15px;margin:18px 0 4px;color:#111}'
    + 'table{width:100%;border-collapse:collapse;margin:10px 0 14px}'
    + 'th{font-size:10.5px;color:#555;font-weight:600;border-bottom:1.5px solid #999;padding:7px 8px;text-align:right}'
    + 'th.l{text-align:left}td{border-bottom:1px solid #e3e3e3;padding:9px 8px;text-align:right;font-family:Consolas,monospace;font-size:14px}'
    + 'td.l{text-align:left;font-family:Calibri,Arial,sans-serif;font-size:13px}'
    + '.cond{font-size:11px;color:#333;line-height:1.55;border:1px solid #ddd;border-radius:6px;padding:10px 12px;margin-top:8px;background:#fafafa}'
    + '.cond li{margin-bottom:3px}'
    + '.firme{display:flex;justify-content:space-between;gap:30px;margin-top:34px}'
    + '.firma{flex:1;font-size:11px;color:#444}.firma .riga{border-bottom:1px solid #333;height:44px;margin-top:6px}'
    + '.foot{margin-top:22px;font-size:9.5px;color:#777;border-top:1px solid #ddd;padding-top:6px;text-align:center}'
    + '@media print{body{margin:0}}</style></head><body>';
  doc += '<div class="hd"><img src="data:image/jpeg;base64,' + _PV_LOGO + '" alt="Phoenix Fuel">'
      + '<div class="dati"><strong>PHOENIX FUEL S.R.L.</strong><br>Vendita all\'ingrosso di carburanti e oli<br>'
      + 'Uffici e Deposito: Zona Industriale &mdash; 89900 Portosalvo (VV)<br>'
      + 'Tel. 0966 1906397 &middot; Fax 0966 1906395<br>'
      + 'info@phoenixfuel.it &middot; logistica@phoenixfuel.it<br>'
      + 'Partita IVA 02744150802 &middot; www.phoenixfuel.it</div></div>';
  doc += '<div style="display:flex;justify-content:space-between;align-items:flex-end">'
      + '<div>' + (S.clienteNome ? 'Spett.le<br><strong style="font-size:14px">' + S.clienteNome + '</strong>' : '') + '</div>'
      + '<div style="text-align:right">Vibo Valentia, ' + oggi + '<br><span style="font-size:11px;color:#555">Preventivo n. ' + _pvData().replace(/-/g, '') + '</span></div></div>';
  doc += '<h2>Preventivo &mdash; ' + blocchi.map(function (b) { return b.prodotto; }).join(' e ') + '</h2>'
      + '<div style="font-size:12px;color:#444">Consegna franco destino da ' + blocchi[0].riga.base + ', trasporto compreso nel prezzo.</div>';
  doc += '<table><tr><th class="l">Prodotto</th><th>Prezzo imponibile &euro;/L</th><th>Prezzo ivato &euro;/L</th></tr>';
  blocchi.forEach(function (b) {
    doc += '<tr><td class="l"><strong>' + b.prodotto + '</strong></td><td>' + _pvNum(b.riga.netto) + '</td><td>' + _pvNum(b.riga.ivato, 5) + '</td></tr>';
  });
  doc += '</table>';
  doc += '<div class="cond"><strong>Condizioni</strong><ul style="margin:6px 0 0 16px;padding:0">'
      + '<li>I prezzi indicati sono riferiti al listino del <strong>' + _pfIsoToIt(_pvData()) + '</strong> e sono validi per consegne effettuate <strong>nella giornata di ' + domaniTxt + '</strong>; per consegne successive i prezzi potranno subire variazioni secondo l\'andamento del mercato.</li>'
      + '<li>I prezzi sono comunicati e validi salvo problematiche non dipendenti dalla nostra volont&agrave; (fornitori, basi di carico, trasporto o altre cause di forza maggiore): in tal caso il prezzo potrebbe subire variazioni, che verranno comunicate prima della consegna.</li>'
      + '<li>Quantit&agrave; e orario di consegna da concordare con la nostra logistica. Pagamento secondo le condizioni in essere con il cliente.</li>'
      + '</ul></div>';
  doc += '<div class="firme">'
      + '<div class="firma">Per accettazione<br><span style="font-size:10px;color:#777">timbro e firma del cliente</span><div class="riga"></div></div>'
      + '<div class="firma" style="text-align:right">Phoenix Fuel S.r.l.<br><span style="font-size:10px;color:#777">l\'amministratore</span><div class="riga"></div></div>'
      + '</div>';
  doc += '<div class="foot">Phoenix Fuel S.r.l. &middot; Uffici e Deposito: Zona Industriale, 89900 Portosalvo (VV) &middot; Tel. 0966 1906397 &middot; Fax 0966 1906395 &middot; info@phoenixfuel.it &middot; logistica@phoenixfuel.it &middot; P.IVA 02744150802</div>';
  doc += '</body></html>';
  w.document.write(doc);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}
