// PhoenixFuel — Avviso mercati: popup del post scritto dal cron delle 17:30
// v20260818a — file nuovo.
//
// COSA FA
//   All'avvio cerca in bacheca_post l'ultimo post tipo 'mercato' non ancora
//   visto. Se c'e', apre un popup con i due grafici (Brent e cambio), la nota
//   e i prezzi di domani. Alla chiusura segna visto_il: il popup non torna.
//   Il post resta in bacheca e lo si rilegge quando si vuole.
//
// PERCHE' IL CRON E NON IL BROWSER
//   Il popup puo' comparire solo se il programma e' aperto. Il cron scrive il
//   post comunque: se alle 17:35 non sei davanti al computer, lo vedi alla
//   prima apertura successiva invece di perderlo.
//
// I GRAFICI NON LI RIDISEGNO
//   _mktCartaSguardo e _mktSpark stanno gia' in pf-futures.js e sono funzioni
//   globali. Si riusano. Se pf-futures.js non e' caricato, il popup mostra la
//   nota senza grafici invece di rompersi: un dato imprevisto deve mostrare di
//   meno, mai far sparire la pagina.
//
// TRAPPOLE RISPETTATE
//   - Niente template literal annidati: solo concatenazione.
//   - Il contenuto del post e' testo con **grassetto** e a capo, come lo scrive
//     l'Edge Function e come lo rende pf-home.js: stessa conversione, non HTML.

var _avvMercatoPost = null;

// Stessa resa di pf-home.js riga 133: esc, poi grassetto, corsivo, a capo.
function _avvTesto(s) {
  return esc(String(s || ''))
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n/g, '<br>');
}

async function _avvControllaMercato() {
  try {
    var r = await sb.from('bacheca_post')
      .select('*')
      .eq('tipo', 'mercato').eq('attivo', true)
      .is('visto_il', null)
      .order('created_at', { ascending: false })
      .limit(1);
    if (r.error) { console.warn('[avviso-mercato]', r.error.message); return; }
    if (!r.data || !r.data.length) return;
    _avvMercatoPost = r.data[0];
    await _avvApri();
  } catch (e) {
    console.warn('[avviso-mercato] controllo:', e);
  }
}
window._avvControllaMercato = _avvControllaMercato;

async function _avvApri() {
  var p = _avvMercatoPost;
  if (!p) return;
  var urgente = (p.priorita === 'urgente');
  var bordo = urgente ? '#E24B4A' : '#BA7517';
  var sfondo = urgente ? '#FCEBEB' : '#FAEEDA';
  var testo = urgente ? '#A32D2D' : '#854F0B';

  var quando = new Date(p.created_at).toLocaleDateString('it-IT',
    { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  var ora = new Date(p.created_at).toLocaleTimeString('it-IT',
    { hour: '2-digit', minute: '2-digit' });

  var h = '<div style="max-width:660px">';
  h += '<div style="background:' + sfondo + ';margin:-20px -20px 16px;padding:14px 20px;border-bottom:0.5px solid ' + bordo + '">';
  h += '<div style="display:flex;justify-content:space-between;align-items:center;gap:10px;flex-wrap:wrap">';
  h += '<div><div style="font-size:16px;font-weight:700;color:' + testo + '">🔔 Chiusura mercati — ' + ora + '</div>';
  h += '<div style="font-size:12px;color:' + testo + ';font-family:var(--font-mono)">' + esc(quando) + '</div></div>';
  if (urgente) h += '<span style="font-size:10px;background:#E24B4A;color:#fff;padding:3px 9px;border-radius:10px;font-weight:600">URGENTE</span>';
  h += '</div></div>';

  // Grafici: si riusano quelli della pagina Futures.
  var grafici = await _avvGrafici();
  if (grafici) h += grafici;

  h += '<div style="background:' + sfondo + ';border-left:5px solid ' + bordo + ';border-radius:12px;padding:14px 16px;margin-top:14px">';
  h += '<div style="font-size:16px;font-weight:700;color:' + testo + ';margin-bottom:8px">' + esc(p.titolo || '') + '</div>';
  h += '<div style="font-size:13.5px;color:' + testo + ';line-height:1.75">' + _avvTesto(p.contenuto) + '</div>';
  h += '</div>';

  h += '<div style="display:flex;gap:8px;margin-top:16px;flex-wrap:wrap">';
  h += '<button class="btn-primary" onclick="_avvSegnaVisto()">✓ Ho letto — tieni in bacheca</button>';
  h += '<button class="btn-secondary" onclick="_avvStampa()">🖨️ Stampa</button>';
  h += '</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-top:8px">Compare una volta sola. Resta in bacheca e lo rileggi quando vuoi.</div>';
  h += '</div>';

  apriModal(h);
}

// I due grafici dalle ultime tre chiusure. Se manca qualcosa si torna stringa
// vuota e il popup mostra la sola nota.
async function _avvGrafici() {
  try {
    if (typeof _mktCartaSguardo !== 'function') return '';
    var st = await sb.from('futures_storico').select('data,brent_usd,eurusd')
      .not('brent_usd', 'is', null)
      .order('data', { ascending: false }).limit(3);
    var righe = (st.data || []).slice().reverse();
    if (righe.length < 3) return '';

    var fD = (typeof fmtD === 'function') ? fmtD : function (x) { return String(x); };
    var puntiB = righe.map(function (r, i) {
      return { v: Number(r.brent_usd), et: Number(r.brent_usd).toFixed(2),
               lab: (i === righe.length - 1) ? 'chiusura' : 'ch. ' + fD(r.data).substring(0, 5) };
    });
    var puntiC = righe.map(function (r, i) {
      return { v: Number(r.eurusd), et: Number(r.eurusd).toFixed(4),
               lab: (i === righe.length - 1) ? 'chiusura' : 'ch. ' + fD(r.data).substring(0, 5) };
    });

    var h = '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    h += _mktCartaSguardo('Brent ICE &middot; $/barile', puntiB, 2);
    h += _mktCartaSguardo('Cambio EUR / USD', puntiC, 4);
    h += '</div>';
    return h;
  } catch (e) {
    console.warn('[avviso-mercato] grafici:', e);
    return '';
  }
}

async function _avvSegnaVisto() {
  var p = _avvMercatoPost;
  if (!p) { chiudiModal(); return; }
  var r = await sb.from('bacheca_post')
    .update({ visto_il: new Date().toISOString() }).eq('id', p.id);
  if (r.error) { toast('Errore: ' + r.error.message); return; }
  _avvMercatoPost = null;
  chiudiModal();
  toast('✓ Salvato in bacheca');
}
window._avvSegnaVisto = _avvSegnaVisto;

function _avvStampa() {
  var p = _avvMercatoPost;
  if (!p) return;
  var w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra di stampa'); return; }
  var quando = new Date(p.created_at).toLocaleString('it-IT');
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + esc(p.titolo || '') + '</title>';
  html += '<style>body{font-family:Arial,Helvetica,sans-serif;margin:30px;color:#1E1E1C;max-width:720px}';
  html += 'h1{font-size:17px;border-left:5px solid #D9DE0D;padding-left:10px}';
  html += '.meta{font-size:11px;color:#5F5E5A;margin-bottom:18px}';
  html += '.txt{font-size:13.5px;line-height:1.8}';
  html += '@media print{.no-print{display:none}}</style></head><body>';
  html += '<h1>' + esc(p.titolo || '') + '</h1>';
  html += '<div class="meta">PHOENIX FUEL S.R.L. &middot; avviso automatico &middot; ' + esc(quando) + '</div>';
  html += '<div class="txt">' + _avvTesto(p.contenuto) + '</div>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '</div></body></html>';
  w.document.open();
  w.document.write(html);
  w.document.close();
}
window._avvStampa = _avvStampa;

// ── AVVIO ────────────────────────────────────────────────────────
// Si attacca da solo: nessun altro file da modificare. Aspetta che sb esista
// e lascia respirare il caricamento della pagina, poi controlla una volta.
(function () {
  function avvia() {
    if (typeof sb === 'undefined' || !sb) { setTimeout(avvia, 1500); return; }
    setTimeout(_avvControllaMercato, 2500);
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', avvia);
  } else {
    avvia();
  }
})();
