// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Blocchi riordinabili (Stazione Oppido)
// Aggiunge pulsanti ↑ ↓ a ogni card nelle tab della stazione.
// L'ordine viene salvato in localStorage e ripristinato automaticamente.
// ═══════════════════════════════════════════════════════════════════

(function () {
  const LS_KEY = 'phoenixfuel_stz_block_order';

  // ── Assegna ID univoci ai blocchi ──
  function assegnaIds() {
    document.querySelectorAll('#s-stazione .stz-panel').forEach(panel => {
      if (panel.id === 'stz-dashboard') return; // Dashboard non riordinabile
      const panelId = panel.id;
      const cards = panel.querySelectorAll(':scope > .card, :scope > .grid4, :scope > .grid2, :scope > [id="stz-da-caricare"]');
      cards.forEach((card, i) => {
        if (!card.dataset.blockId) {
          card.dataset.blockId = panelId + '__' + i;
        }
      });
    });
  }

  // ── Crea pulsanti freccia ──
  function creaPulsanti(card) {
    // Se ha già i pulsanti, esci
    if (card.querySelector('.stz-sort-btns')) return;

    // Trova il titolo della card (card-title) o crea un'area per i pulsanti
    let target = card.querySelector('.card-title');
    if (!target) {
      // Per KPI grids e div senza card-title, aggiungi una barra sopra
      const bar = document.createElement('div');
      bar.style.cssText = 'display:flex;justify-content:flex-end;margin-bottom:4px';
      card.prepend(bar);
      target = bar;
    }

    const wrapper = document.createElement('span');
    wrapper.className = 'stz-sort-btns';
    wrapper.style.cssText = 'display:inline-flex;gap:2px;margin-left:auto;flex-shrink:0';

    const btnSu = document.createElement('button');
    btnSu.innerHTML = '▲';
    btnSu.title = 'Sposta su';
    btnSu.style.cssText = 'background:var(--bg,#f5f5f5);border:0.5px solid var(--border,#ddd);border-radius:6px;width:28px;height:28px;cursor:pointer;font-size:11px;color:var(--text-muted,#888);display:flex;align-items:center;justify-content:center;padding:0;line-height:1';
    btnSu.onmouseenter = function () { this.style.background = 'var(--accent,#D4A017)'; this.style.color = '#fff'; };
    btnSu.onmouseleave = function () { this.style.background = 'var(--bg,#f5f5f5)'; this.style.color = 'var(--text-muted,#888)'; };
    btnSu.onclick = function (e) { e.stopPropagation(); spostaBlockSu(card); };

    const btnGiu = document.createElement('button');
    btnGiu.innerHTML = '▼';
    btnGiu.title = 'Sposta giù';
    btnGiu.style.cssText = btnSu.style.cssText;
    btnGiu.onmouseenter = function () { this.style.background = 'var(--accent,#D4A017)'; this.style.color = '#fff'; };
    btnGiu.onmouseleave = function () { this.style.background = 'var(--bg,#f5f5f5)'; this.style.color = 'var(--text-muted,#888)'; };
    btnGiu.onclick = function (e) { e.stopPropagation(); spostaBlockGiu(card); };

    wrapper.appendChild(btnSu);
    wrapper.appendChild(btnGiu);

    // Se il target è un card-title con display:flex, appendi in fondo
    if (target.classList.contains('card-title')) {
      target.style.display = 'flex';
      target.style.alignItems = 'center';
      target.style.flexWrap = 'wrap';
      target.style.gap = '8px';
      target.appendChild(wrapper);
    } else {
      target.appendChild(wrapper);
    }
  }

  // ── Sposta su ──
  function spostaBlockSu(card) {
    const panel = card.parentElement;
    const fratelli = getSortableChildren(panel);
    const idx = fratelli.indexOf(card);
    if (idx <= 0) return;
    panel.insertBefore(card, fratelli[idx - 1]);
    evidenziaBlock(card);
    salvaOrdine();
  }

  // ── Sposta giù ──
  function spostaBlockGiu(card) {
    const panel = card.parentElement;
    const fratelli = getSortableChildren(panel);
    const idx = fratelli.indexOf(card);
    if (idx < 0 || idx >= fratelli.length - 1) return;
    // insertBefore del prossimo fratello + 1 (cioè dopo il prossimo)
    const next = fratelli[idx + 1];
    const afterNext = next.nextElementSibling;
    if (afterNext) {
      panel.insertBefore(card, afterNext);
    } else {
      panel.appendChild(card);
    }
    evidenziaBlock(card);
    salvaOrdine();
  }

  // ── Feedback visivo ──
  function evidenziaBlock(card) {
    card.style.transition = 'box-shadow 0.3s ease';
    card.style.boxShadow = '0 0 0 2px var(--accent, #D4A017)';
    setTimeout(function () {
      card.style.boxShadow = '';
    }, 600);
  }

  // ── Prendi solo i figli diretti sortable ──
  function getSortableChildren(panel) {
    return Array.from(panel.children).filter(function (el) {
      return el.dataset.blockId;
    });
  }

  // ── Salva ordine in localStorage ──
  function salvaOrdine() {
    const ordine = {};
    document.querySelectorAll('#s-stazione .stz-panel').forEach(function (panel) {
      const ids = getSortableChildren(panel).map(function (el) { return el.dataset.blockId; });
      ordine[panel.id] = ids;
    });
    try { localStorage.setItem(LS_KEY, JSON.stringify(ordine)); } catch (e) { /* silenzioso */ }
  }

  // ── Ripristina ordine da localStorage ──
  function ripristinaOrdine() {
    let ordine;
    try { ordine = JSON.parse(localStorage.getItem(LS_KEY)); } catch (e) { return; }
    if (!ordine) return;

    document.querySelectorAll('#s-stazione .stz-panel').forEach(function (panel) {
      const ids = ordine[panel.id];
      if (!ids || !ids.length) return;
      const children = getSortableChildren(panel);
      const map = {};
      children.forEach(function (el) { map[el.dataset.blockId] = el; });

      // Riordina solo se tutti gli ID esistono ancora
      const validi = ids.filter(function (id) { return map[id]; });
      if (validi.length !== children.length) return;

      validi.forEach(function (id) {
        panel.appendChild(map[id]);
      });
    });
  }

  // ── Inizializzazione ──
  function init() {
    const sezione = document.getElementById('s-stazione');
    if (!sezione) return;

    assegnaIds();
    ripristinaOrdine();

    // Aggiungi pulsanti a tutti i blocchi sortabili
    document.querySelectorAll('#s-stazione .stz-panel').forEach(function (panel) {
      getSortableChildren(panel).forEach(function (card) {
        creaPulsanti(card);
      });
    });
  }

  // Avvia quando il DOM è pronto
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  // Esponi funzione reset per debug
  window.resetOrdineBlocchi = function () {
    localStorage.removeItem(LS_KEY);
    location.reload();
  };
})();
