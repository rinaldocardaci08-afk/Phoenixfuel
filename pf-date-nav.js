// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Date navigation helper (frecce ◀/▶ su input type=date)
//
// SCOPO:
// Applica la regola costituzionale "ogni campo data deve avere picker
// + frecce di navigazione" senza toccare un solo input esistente.
//
// COME SI USA:
//   1. Aggiungi l'attributo HTML: data-nav="day" (o "week" / "month")
//      all'<input type="date"> che vuoi arricchire.
//   2. Al primo passaggio del DOM, questo script crea un wrapper
//      <span class="pf-datenav"> attorno all'input e inserisce due
//      pulsanti ◀/▶ che shiftano il valore di ±1 giorno (o settimana,
//      o mese) e dispatchano l'evento 'change' nativo.
//
// GARANZIE:
//   - Nessun input senza data-nav viene toccato.
//   - L'input originale rimane identico (id, class, style, eventi).
//   - L'evento 'change' che parte dalle frecce viene riconosciuto
//     dai listener onchange esistenti (non serve modificare nulla).
//   - Idempotente: se l'input è già stato wrappato, non fa nulla.
//   - Osserva il DOM (MutationObserver) per input aggiunti dinamicamente
//     (modali, render tardivi).
//
// DEBUG:
//   window.__pfDateNavStats  → { totali, attivati, skippati }
// ═══════════════════════════════════════════════════════════════════

(function(){
  var STATS = { totali: 0, attivati: 0, skippati: 0 };
  window.__pfDateNavStats = STATS;

  var DATA_ATTR = 'data-nav';      // valori ammessi: day | week | month
  var MARK_ATTR = 'data-nav-ready'; // usato internamente per idempotenza

  function _shiftISO(iso, unit, direction) {
    if (!iso) {
      // Se l'input è vuoto, parte da oggi
      var oggi = new Date();
      return oggi.toISOString().split('T')[0];
    }
    var d = new Date(iso + 'T12:00:00Z');
    if (isNaN(d.getTime())) return iso;
    if (unit === 'week')  d.setUTCDate(d.getUTCDate() + 7 * direction);
    else if (unit === 'month') d.setUTCMonth(d.getUTCMonth() + 1 * direction);
    else                  d.setUTCDate(d.getUTCDate() + 1 * direction);
    return d.toISOString().split('T')[0];
  }

  function _btnStyle() {
    // font-size:inherit → eredita la dimensione dall'input vicino (16px, 13px, 12px...)
    // align-self:stretch → matching automatico dell'altezza con l'input
    // box-sizing:border-box + padding verticale zero → il solo padding orizzontale
    //   fa allargare, l'altezza viene dal flex stretch del wrapper.
    return 'padding:0 12px;align-self:stretch;box-sizing:border-box;'
         + 'border:0.5px solid var(--border);border-radius:6px;background:var(--bg);'
         + 'cursor:pointer;font-weight:700;font-size:inherit;line-height:1;'
         + 'color:var(--text);flex:0 0 auto;user-select:none;'
         + 'display:inline-flex;align-items:center;justify-content:center';
  }

  function _mkBtn(label, title, onclick) {
    var b = document.createElement('button');
    b.type = 'button';
    b.textContent = label;
    b.title = title;
    b.className = 'pf-datenav-btn';
    b.style.cssText = _btnStyle();
    b.addEventListener('click', onclick);
    return b;
  }

  function _applyTo(inp) {
    STATS.totali++;
    if (!inp || inp.type !== 'date') { STATS.skippati++; return; }
    if (inp.getAttribute(MARK_ATTR) === '1') { STATS.skippati++; return; }

    var unit = inp.getAttribute(DATA_ATTR) || 'day';
    if (unit !== 'day' && unit !== 'week' && unit !== 'month') unit = 'day';

    // Crea wrapper flex attorno all'input.
    var wrap = document.createElement('span');
    wrap.className = 'pf-datenav';
    wrap.style.cssText = 'display:inline-flex;align-items:stretch;gap:4px;vertical-align:middle';

    // Rileva il contesto del parent per decidere se il wrapper debba
    // espandersi a tutta la larghezza (come l'input originale).
    // - Grid cell (parent display:grid)
    // - Flex column (parent display:flex;flex-direction:column) → es. .form-group
    // - Block normale
    // In tutti questi il wrapper deve width:100% per occupare lo spazio
    // che prima occupava l'input (evita sovrapposizioni con celle adiacenti).
    // In flex-row (es. card-title con altri bottoni) lascio width auto.
    var parent = inp.parentNode;
    if (!parent) { STATS.skippati++; return; }
    var csp;
    try { csp = window.getComputedStyle(parent); } catch(e) { csp = null; }
    var expandFull = false;
    if (csp) {
      var disp = csp.display;
      var fdir = csp.flexDirection || '';
      if (disp === 'block' || disp === 'grid' || disp === 'inline-grid') expandFull = true;
      else if ((disp === 'flex' || disp === 'inline-flex') && (fdir === 'column' || fdir === 'column-reverse')) expandFull = true;
    }
    if (expandFull) {
      wrap.style.width = '100%';
      wrap.style.maxWidth = '100%';
    } else {
      wrap.style.maxWidth = '100%';
    }

    // Inserisce il wrapper al posto dell'input, poi mette l'input dentro.
    parent.insertBefore(wrap, inp);

    // Pulsante ◀ (prev)
    var btnPrev = _mkBtn('◀', 'Giorno precedente', function(){
      var newVal = _shiftISO(inp.value, unit, -1);
      _setValueAndFire(inp, newVal);
    });

    // Pulsante ▶ (next)
    var btnNext = _mkBtn('▶', 'Giorno successivo', function(){
      var newVal = _shiftISO(inp.value, unit, +1);
      _setValueAndFire(inp, newVal);
    });

    wrap.appendChild(btnPrev);
    wrap.appendChild(inp);            // sposta l'input dentro il wrapper
    wrap.appendChild(btnNext);

    // Se il wrapper è width:100%, l'input deve occupare lo spazio rimanente
    // dopo le due frecce, con un minimo sensato per il picker nativo.
    if (expandFull) {
      inp.style.flex = '1 1 0';
      inp.style.minWidth = '110px';
    }

    inp.setAttribute(MARK_ATTR, '1');
    STATS.attivati++;
  }

  function _setValueAndFire(inp, newVal) {
    inp.value = newVal;
    // Dispatch event nativo 'change' per triggerare i listener esistenti.
    // Alcuni browser non bubblano la modifica programmatica, quindi lo fa l'helper.
    var ev;
    try { ev = new Event('change', { bubbles: true }); }
    catch(e) { ev = document.createEvent('Event'); ev.initEvent('change', true, true); }
    inp.dispatchEvent(ev);
    // Alcuni handler nell'app chiamano funzioni inline dell'onchange attribute:
    // new Event('change') li copre perché dispatchEvent chiama sia gli addEventListener
    // sia l'attribute handler inline.
  }

  // ── Scan iniziale ────────────────────────────────────────────────
  function _scanAll() {
    var nodes = document.querySelectorAll('input[type="date"][' + DATA_ATTR + ']:not([' + MARK_ATTR + '="1"])');
    nodes.forEach(_applyTo);
  }

  // ── Auto-scan su input aggiunti dinamicamente (modali, render tardivi) ─
  function _startObserver() {
    if (typeof MutationObserver === 'undefined') return;
    var obs = new MutationObserver(function(mutations){
      var toScan = false;
      for (var i = 0; i < mutations.length; i++) {
        var m = mutations[i];
        if (m.type === 'childList' && m.addedNodes && m.addedNodes.length) {
          for (var j = 0; j < m.addedNodes.length; j++) {
            var n = m.addedNodes[j];
            if (n.nodeType !== 1) continue;
            // Se il nodo aggiunto è un input date con data-nav, o lo contiene
            if (n.matches && n.matches('input[type="date"][' + DATA_ATTR + ']')) {
              _applyTo(n);
            } else if (n.querySelectorAll) {
              var inner = n.querySelectorAll('input[type="date"][' + DATA_ATTR + ']:not([' + MARK_ATTR + '="1"])');
              if (inner.length) toScan = true;
            }
          }
        }
      }
      if (toScan) _scanAll();
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }

  // ── Bootstrap ────────────────────────────────────────────────────
  function _boot() {
    _scanAll();
    _startObserver();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _boot);
  } else {
    // Già caricato: avvia al prossimo tick per dare tempo al DOM di stabilizzarsi
    setTimeout(_boot, 0);
  }

  // Espone funzione manuale per riscansionare on-demand (utile se un modulo
  // rende input dopo il boot senza passare dal MutationObserver)
  window.pfDateNavRescan = _scanAll;
})();
