// PhoenixFuel — Preventivo a cliente
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
  var doc = '<!doctype html><html lang="it"><head><meta charset="utf-8"><title>Preventivo ' + oggi + '</title><style>'
    + 'body{font-family:Calibri,Arial,sans-serif;color:#222;margin:2cm;font-size:12.5px;line-height:1.5}'
    + 'h1{font-size:17px;margin:0 0 3px}.mitt{font-size:11px;color:#555;margin-bottom:20px}'
    + 'table{width:100%;border-collapse:collapse;margin:14px 0}'
    + 'th{font-size:10.5px;color:#555;font-weight:600;border-bottom:1.5px solid #999;padding:6px 8px;text-align:right}'
    + 'th.l{text-align:left}td{border-bottom:1px solid #eee;padding:7px 8px;text-align:right;font-family:Consolas,monospace}'
    + 'td.l{text-align:left;font-family:Calibri,Arial,sans-serif}'
    + '.note{color:#666;font-size:10.5px;margin-top:20px;border-top:1px solid #eee;padding-top:10px}'
    + '@media print{body{margin:1.6cm}}</style></head><body>';
  doc += '<h1>PHOENIX FUEL S.R.L.</h1>';
  doc += '<div class="mitt">Zona Industriale &mdash; 89900 Vibo Valentia (VV) &middot; P.IVA 02744150802</div>';
  if (S.clienteNome) doc += '<div>Spett.le <strong>' + S.clienteNome + '</strong></div>';
  doc += '<div style="text-align:right">Vibo Valentia, ' + oggi + '</div>';
  doc += '<p><strong>Preventivo &mdash; ' + blocchi.map(function (b) { return b.prodotto; }).join(' e ') + '</strong><br>Consegna da '
      + blocchi[0].riga.base + ', prezzi validi per la giornata odierna.</p>';
  doc += '<table><tr><th class="l">Prodotto</th><th>Prezzo imponibile &euro;/L</th><th>Prezzo ivato &euro;/L</th></tr>';
  blocchi.forEach(function (b) {
    doc += '<tr><td class="l"><strong>' + b.prodotto + '</strong></td><td>' + _pvNum(b.riga.netto) + '</td><td>' + _pvNum(b.riga.ivato, 5) + '</td></tr>';
  });
  doc += '</table>';
  doc += '<div class="note">Prezzi comprensivi di trasporto, riferiti al listino del ' + _pfIsoToIt(_pvData())
      + '. Soggetti a variazione secondo l\'andamento del mercato. Documento generato da PhoenixFuel.</div>';
  doc += '</body></html>';
  w.document.write(doc);
  w.document.close();
  setTimeout(function () { try { w.print(); } catch (e) {} }, 350);
}
