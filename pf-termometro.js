// pf-termometro.js — spia "temperatura" del database (solo admin, in bacheca).
// Misura il tempo di risposta di Supabase con un ping leggero (una micro-lettura
// su stazione_pompe) e muove la lancetta. Non legge dati veri, non tocca Gilbarco.
(function () {
  var MAX = 1000, G = 0.25, A = 0.55, CX = 100, CY = 92, R = 76;
  var timer = null, drawn = false;

  function P(t) { var a = Math.PI * (1 - t); return [CX + R * Math.cos(a), CY - R * Math.sin(a)]; }
  function arc(a, b) { var p = P(a), q = P(b); return "M" + p[0].toFixed(1) + " " + p[1].toFixed(1) + " A" + R + " " + R + " 0 0 1 " + q[0].toFixed(1) + " " + q[1].toFixed(1); }

  function draw() {
    var zg = document.getElementById('term-zG'); if (!zg) return false;
    zg.setAttribute('d', arc(0, G));
    document.getElementById('term-zA').setAttribute('d', arc(G, A));
    document.getElementById('term-zR').setAttribute('d', arc(A, 1));
    return true;
  }
  function render(ms) {
    var n = document.getElementById('term-needle'); if (!n) return;
    ms = Math.max(0, Math.min(MAX, ms)); var t = ms / MAX;
    n.style.transform = 'rotate(' + (t * 180 - 90) + 'deg)';
    document.getElementById('term-ms').textContent = Math.round(ms);
    var c, txt;
    if (t < G) { c = '#2bbd6b'; txt = 'Fluido'; }
    else if (t < A) { c = '#e6a336'; txt = 'Carico'; }
    else { c = '#e5484d'; txt = 'Lento'; }
    var st = document.getElementById('term-st'); st.textContent = txt; st.style.color = c;
  }
  async function ping() {
    if (typeof sb === 'undefined') return;
    var t0 = (window.performance && performance.now) ? performance.now() : Date.now();
    try { await sb.from('stazione_pompe').select('id').limit(1); }
    catch (e) { render(MAX); return; }
    var t1 = (window.performance && performance.now) ? performance.now() : Date.now();
    render(t1 - t0);
  }
  function start() {
    var box = document.getElementById('home-termometro'); if (!box) return;
    box.style.display = '';
    if (!drawn) drawn = draw();
    ping();
    if (timer) clearInterval(timer);
    timer = setInterval(ping, 45000); // ogni 45s, leggerissimo
  }
  window._pfTermometroStart = start;

  // Auto-init: attende di sapere il ruolo, poi parte SOLO se admin.
  function tryInit(tries) {
    if (typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.ruolo) {
      if (utenteCorrente.ruolo === 'admin') start();
      return;
    }
    if (tries > 0) setTimeout(function () { tryInit(tries - 1); }, 1000);
  }
  if (document.readyState !== 'loading') tryInit(40);
  else document.addEventListener('DOMContentLoaded', function () { tryInit(40); });
})();
