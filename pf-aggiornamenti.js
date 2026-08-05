// PhoenixFuel — Avviso di nuova versione
// v20260804a
//
// Quando esce un aggiornamento, chi ha il programma aperto continua a
// usare la versione vecchia finche non ricarica — e non ha modo di
// saperlo. Questo modulo se ne accorge da solo e lo dice.
//
// COME FA, senza aggiungere niente al deploy: a ogni push le versioni
// nei tag script di index.html cambiano (`pf-ordini.js?v=20260804a`).
// All'avvio si prende l'elenco di quelle CARICATE; ogni tanto si
// riscarica index.html saltando la cache e si confrontano. Se una sola
// e diversa, c'e una versione nuova. Nessun file in piu da ricordare di
// aggiornare, nessuna disciplina richiesta.

var _aggMie = null;          // impronta delle versioni caricate
var _aggVisibile = false;
var _aggRimandato = 0;       // quando ha premuto "piu tardi"
var AGG_OGNI = 4 * 60 * 1000;      // controlla ogni 4 minuti
var AGG_RIMANDA = 30 * 60 * 1000;  // se rimanda, si ripresenta dopo mezz'ora

// Le versioni dei file effettivamente caricati dalla pagina.
function _aggImprontaLocale() {
  var v = [];
  var nodi = document.querySelectorAll('script[src], link[href]');
  for (var i = 0; i < nodi.length; i++) {
    var u = nodi[i].getAttribute('src') || nodi[i].getAttribute('href') || '';
    var m = u.match(/([\w-]+\.(?:js|css))\?v=([\w.-]+)/);
    if (m) v.push(m[1] + '=' + m[2]);
  }
  return v.sort().join('|');
}

// Le stesse versioni lette dall'index.html che sta online adesso.
function _aggImprontaRemota(testo) {
  var v = [], re = /([\w-]+\.(?:js|css))\?v=([\w.-]+)/g, m;
  while ((m = re.exec(testo)) !== null) v.push(m[1] + '=' + m[2]);
  // stessa normalizzazione dell'impronta locale: senza doppioni e in ordine
  var visti = {}, out = [];
  v.forEach(function (x) { if (!visti[x]) { visti[x] = true; out.push(x); } });
  return out.sort().join('|');
}

async function _aggControlla() {
  if (_aggVisibile) return;
  if (_aggRimandato && (Date.now() - _aggRimandato) < AGG_RIMANDA) return;
  try {
    var r = await fetch('index.html?_v=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    var testo = await r.text();
    var remota = _aggImprontaRemota(testo);
    if (!remota || !_aggMie) return;
    // confronto solo i file che ho davvero caricato: se online ne
    // compare uno nuovo che la mia pagina non usa, non e un motivo per
    // far ricaricare tutti
    var mie = _aggMie.split('|');
    var loro = {};
    remota.split('|').forEach(function (x) {
      var p = x.split('=');
      loro[p[0]] = p[1];
    });
    var diverso = mie.some(function (x) {
      var p = x.split('=');
      return loro[p[0]] !== undefined && loro[p[0]] !== p[1];
    });
    if (diverso) _aggMostra();
  } catch (e) {
    // rete assente o file non raggiungibile: si riprova al giro dopo,
    // in silenzio. Un avviso di aggiornamento non deve mai disturbare.
  }
}

function _aggMostra() {
  if (_aggVisibile) return;
  _aggVisibile = true;
  var d = document.createElement('div');
  d.id = 'agg-banner';
  d.setAttribute('role', 'status');
  d.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:22px;z-index:99999;'
    + 'background:#0B2545;color:#fff;border-radius:12px;padding:13px 16px;'
    + 'box-shadow:0 8px 28px rgba(0,0,0,0.35);display:flex;align-items:center;gap:14px;'
    + 'font-size:13px;max-width:92vw;flex-wrap:wrap;animation:aggSu .28s ease-out';
  d.innerHTML =
      '<div style="display:flex;align-items:center;gap:10px">'
    +   '<span style="font-size:18px">&#128260;</span>'
    +   '<div><div style="font-weight:700">&Egrave; disponibile una versione aggiornata</div>'
    +   '<div style="font-size:11.5px;opacity:0.8;margin-top:1px">Ricarica per avere le ultime correzioni</div></div>'
    + '</div>'
    + '<div style="display:flex;gap:8px;margin-left:auto">'
    +   '<button onclick="aggRimanda()" style="font-size:12px;padding:8px 13px;border:0.5px solid rgba(255,255,255,0.35);border-radius:8px;background:transparent;color:#fff;cursor:pointer">Pi&ugrave; tardi</button>'
    +   '<button onclick="aggAdesso()" style="font-size:12px;padding:8px 16px;border:none;border-radius:8px;background:#fff;color:#0B2545;font-weight:700;cursor:pointer">Aggiorna</button>'
    + '</div>';
  var st = document.createElement('style');
  st.textContent = '@keyframes aggSu{from{opacity:0;transform:translate(-50%,14px)}to{opacity:1;transform:translate(-50%,0)}}';
  document.head.appendChild(st);
  document.body.appendChild(d);
}

function aggRimanda() {
  _aggRimandato = Date.now();
  _aggVisibile = false;
  var d = document.getElementById('agg-banner');
  if (d) d.remove();
}

// Riusa la funzione che c'e gia in index.html: svuota cache e service
// worker e ricarica. Se per qualche motivo non c'e, ricarica e basta.
function aggAdesso() {
  if (typeof forzaAggiornamentoApp === 'function') { forzaAggiornamentoApp(); return; }
  location.reload(true);
}

(function _aggAvvio() {
  function parti() {
    try {
      _aggMie = _aggImprontaLocale();
      if (!_aggMie) return;                 // niente versioni: non si puo confrontare
      setTimeout(_aggControlla, 60 * 1000); // il primo giro dopo un minuto
      setInterval(_aggControlla, AGG_OGNI);
      // e quando si torna sulla scheda dopo averla lasciata aperta
      document.addEventListener('visibilitychange', function () {
        if (!document.hidden) _aggControlla();
      });
    } catch (e) { /* mai bloccare la pagina per questo */ }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', parti);
  else parti();
})();
