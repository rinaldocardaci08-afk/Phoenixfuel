// ═══════════════════════════════════════════════════════════════════
// pf-keyboard-decimal.js — v20260512c
// Tastierino numerico italiano: converte "," in "." al volo
// ═══════════════════════════════════════════════════════════════════
// PROBLEMA: layout tastiera italiano (Windows/macOS) mappa il punto
// del tastierino numerico su ",". Ma <input type="number"> accetta
// solo il punto come separatore decimale → il browser rifiuta la
// virgola silenziosamente e l'utente non riesce a inserire decimali
// dal tastierino.
//
// SOLUZIONE: listener globale che intercetta keydown su "," quando
// il target è un input numerico e lo trasforma in "." preservando
// il cursore. Si applica a:
//   • <input type="number">
//   • <input type="text" inputmode="decimal">
//   • <input type="text" inputmode="numeric">
//
// Cross-browser: usa setRangeText() con fallback su value concat.
// ═══════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  function isNumericInput(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    const t = (el.type || '').toLowerCase();
    const im = (el.inputMode || el.getAttribute('inputmode') || '').toLowerCase();
    return t === 'number' || im === 'decimal' || im === 'numeric';
  }

  document.addEventListener('keydown', function(e) {
    // Solo virgola pura (no Ctrl/Alt/Meta + virgola)
    if (e.key !== ',' || e.ctrlKey || e.altKey || e.metaKey) return;
    const t = e.target;
    if (!isNumericInput(t)) return;

    e.preventDefault();

    // Se c'è già un punto nel valore, ignora la virgola
    // (un numero ha al massimo un separatore decimale)
    const currentValue = t.value || '';
    if (currentValue.indexOf('.') !== -1) return;

    // type=number su Chrome NON supporta selectionStart in modo
    // affidabile. Strategia robusta: prova setRangeText, fallback
    // su append a fine valore (caso 99%: utente digita da zero).
    let inserted = false;
    try {
      if (typeof t.setRangeText === 'function') {
        const start = t.selectionStart;
        const end = t.selectionEnd;
        if (start !== null && end !== null) {
          t.setRangeText('.', start, end, 'end');
          inserted = true;
        }
      }
    } catch (err) {
      // setRangeText non supportato su questo input → fallback
    }

    if (!inserted) {
      t.value = currentValue + '.';
    }

    // Dispatch evento 'input' per trigger di binding/validation
    t.dispatchEvent(new Event('input', { bubbles: true }));
  }, true);

  console.log('[pf-keyboard-decimal] shim attivo — "," → "." su input numerici');
})();
