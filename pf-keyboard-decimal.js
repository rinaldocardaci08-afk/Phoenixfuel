// ═══════════════════════════════════════════════════════════════════
// pf-keyboard-decimal.js — v20260512d
// Visualizzazione italiana: virgola visiva, lettura con punto
// ═══════════════════════════════════════════════════════════════════
// COMPORTAMENTO:
// • L'utente digita "." del tastierino (mappato come "," sul layout
//   italiano Windows) → vede SEMPRE "," nel campo
// • L'utente digita "," → vede ","
// • L'utente digita "." da tastiera normale → vede ","
// • Il codice JS che legge input.value riceve sempre il numero con "."
//   (parseFloat funziona senza modifiche)
//
// IMPLEMENTAZIONE:
// 1. Trasforma <input type="number"> in <input type="text" inputmode="decimal">
//    al caricamento DOM + MutationObserver per input dinamici (modali, popup)
// 2. Filtra digitazione: cifre + un solo separatore decimale
// 3. Override Object.defineProperty di .value su ogni input:
//    - getter: ritorna sempre versione con "."
//    - setter: visualizza versione con ","
//
// NESSUNA modifica richiesta al codice esistente che usa parseFloat.
// OPT-OUT per singolo input: aggiungere attributo data-no-dec-shim="1"
// ═══════════════════════════════════════════════════════════════════

(function() {
  'use strict';

  const SHIM_FLAG = 'pfDecShim';
  const VALUE_DESC = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value');

  if (!VALUE_DESC || !VALUE_DESC.get || !VALUE_DESC.set) {
    console.warn('[pf-keyboard-decimal] HTMLInputElement.value descriptor non disponibile — shim disattivato');
    return;
  }

  function isCandidate(el) {
    if (!el || el.tagName !== 'INPUT') return false;
    if (el.dataset[SHIM_FLAG]) return false;
    if (el.dataset.noDecShim === '1') return false;
    const t = (el.type || '').toLowerCase();
    const im = (el.inputMode || el.getAttribute('inputmode') || '').toLowerCase();
    return t === 'number' || im === 'decimal';
  }

  function toDisplay(val) {
    if (val === null || val === undefined || val === '') return '';
    return String(val).replace('.', ',');
  }

  function toRaw(displayVal) {
    if (displayVal === null || displayVal === undefined || displayVal === '') return '';
    return String(displayVal).replace(',', '.');
  }

  function applyShim(el) {
    if (!isCandidate(el)) return;
    el.dataset[SHIM_FLAG] = '1';

    const originalValue = VALUE_DESC.get.call(el) || '';

    el.setAttribute('type', 'text');
    el.setAttribute('inputmode', 'decimal');
    el.setAttribute('autocomplete', 'off');
    el.removeAttribute('step');

    VALUE_DESC.set.call(el, toDisplay(originalValue));

    Object.defineProperty(el, 'value', {
      configurable: true,
      enumerable: true,
      get: function() {
        return toRaw(VALUE_DESC.get.call(this));
      },
      set: function(v) {
        VALUE_DESC.set.call(this, toDisplay(v));
      }
    });

    el.addEventListener('keydown', function(e) {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const NAV_KEYS = ['Backspace','Delete','ArrowLeft','ArrowRight','ArrowUp','ArrowDown',
                        'Tab','Home','End','Enter','Escape','PageUp','PageDown'];
      if (NAV_KEYS.indexOf(e.key) !== -1) return;

      if (/^[0-9]$/.test(e.key)) return;

      if (e.key === ',' || e.key === '.') {
        const rawDisplay = VALUE_DESC.get.call(this);
        if (rawDisplay.indexOf(',') !== -1) {
          e.preventDefault();
          return;
        }
        if (e.key === '.') {
          e.preventDefault();
          const start = this.selectionStart || 0;
          const end = this.selectionEnd || 0;
          const newVal = rawDisplay.substring(0, start) + ',' + rawDisplay.substring(end);
          VALUE_DESC.set.call(this, newVal);
          try { this.setSelectionRange(start + 1, start + 1); } catch(err) {}
          this.dispatchEvent(new Event('input', { bubbles: true }));
        }
        return;
      }

      if (e.key === '-') {
        const rawDisplay = VALUE_DESC.get.call(this);
        if ((this.selectionStart || 0) === 0 && rawDisplay.indexOf('-') === -1) return;
        e.preventDefault();
        return;
      }

      e.preventDefault();
    });

    el.addEventListener('paste', function(e) {
      e.preventDefault();
      const cd = e.clipboardData || window.clipboardData;
      const pasted = cd ? cd.getData('text') : '';
      let clean = pasted.replace(/[^0-9,.\-]/g, '');
      const idxComma = clean.indexOf(',');
      const idxDot = clean.indexOf('.');
      const idxSep = (idxComma === -1) ? idxDot : (idxDot === -1 ? idxComma : Math.min(idxComma, idxDot));
      if (idxSep !== -1) {
        clean = clean.substring(0, idxSep + 1).replace(/[.,]/g, ',') + clean.substring(idxSep + 1).replace(/[.,]/g, '');
      }
      const rawDisplay = VALUE_DESC.get.call(this);
      const start = this.selectionStart || 0;
      const end = this.selectionEnd || 0;
      const newVal = rawDisplay.substring(0, start) + clean + rawDisplay.substring(end);
      VALUE_DESC.set.call(this, newVal);
      try { this.setSelectionRange(start + clean.length, start + clean.length); } catch(err) {}
      this.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function applyAll(root) {
    const r = root || document;
    if (r.querySelectorAll) {
      r.querySelectorAll('input').forEach(applyShim);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function() { applyAll(); });
  } else {
    applyAll();
  }

  function startObserver() {
    if (!document.body) {
      requestAnimationFrame(startObserver);
      return;
    }
    const obs = new MutationObserver(function(muts) {
      for (let i = 0; i < muts.length; i++) {
        const m = muts[i];
        for (let j = 0; j < m.addedNodes.length; j++) {
          const node = m.addedNodes[j];
          if (node.nodeType !== 1) continue;
          if (node.tagName === 'INPUT') {
            applyShim(node);
          } else if (node.querySelectorAll) {
            applyAll(node);
          }
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true });
  }
  startObserver();

  console.log('[pf-keyboard-decimal v20260512d] shim attivo — virgola visiva su input numerici');
})();
