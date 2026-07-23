// ═══════════════════════════════════════════════════════════════════
// pf-reg-fattura.js — REGISTRAZIONE FATTURA FORNITORE (senza pagamento)
// v20260723d — FIX "Deseleziona" che non faceva nulla. Causa: svuotava la
//   selezione SOSTITUENDO l'oggetto (c.sel = {}), ma l'estratto conto passa il
//   suo _ecfSelezione per RIFERIMENTO e al render successivo lo ri-registrava
//   ancora pieno → le spunte tornavano. Ora si svuota IN LOCO (delete chiave
//   per chiave), così l'oggetto condiviso resta lo stesso e si azzera davvero.
// v20260723c — striscia "Fatture da numerare": un ordine pagato prima che
//   arrivasse la fattura ha già un fattura_ricevuta_id, quindi esce dall'elenco
//   "senza fattura" pur non avendo il numero. Senza questa striscia si perdeva.
// v20260723b — ordini SEMPRE ordinati per SCADENZA crescente (dalla più vicina)
//   e selezionabili anche se GIÀ PAGATI: nel modello ibrido il numero fattura
//   può arrivare dopo il pagamento. Il pagamento vero resta altrove.
// v20260723a
//
// Motore UNICO usato da due posti (matrice unica, niente query doppie):
//   • ns 'ecf' → Estratto conto fornitore (tabella "Ordini da pagare — senza fattura")
//   • ns 'rf'  → linguetta "Senza fattura" del pannello Fatture Fornitori
//
// Regole (Rinaldo 23/07):
//   • qui NON si gestisce il pagamento: si aggancia solo il numero fattura;
//   • si selezionano PIÙ ORDINI, anche di date diverse, sulla stessa fattura;
//   • la DATA SCADENZA è modificabile e da quel momento COMANDA lei
//     (pfScadenzaFornitore dà priorità a fatture_ricevute.data_scadenza);
//     default proposto = la scadenza PIÙ LONTANA tra gli ordini selezionati;
//   • pulsante "Σ Raggruppa per scadenza": una riga per data con i totali.
//     Il flag sulla riga prende tutto il gruppo; il CLIC sulla riga apre il
//     dettaglio degli ordini sommati, da cui si può SGANCIARE il singolo
//     ordine per lasciarlo libero per un'altra fattura;
//   • lo sgancio vale SOLO in fase di selezione (le fatture già registrate
//     si toccano dalla sezione Fatture);
//   • una fattura è di UN SOLO fornitore: senza fornitore scelto non si
//     seleziona nulla.
// ═══════════════════════════════════════════════════════════════════

var _rfCtx = {};          // ns -> { ordini, sel, fornitore, onChange, onSaved, extraBtn }
var _rfVista = {};        // ns -> 'elenco' | 'gruppi'
var _rfAperti = {};       // ns -> { scadenzaISO: true }
var _rfMod = null;        // stato del modale
var _RF_TOLL = 2.00;      // tolleranza quadratura in €

// ── contesto ────────────────────────────────────────────────────────
function pfRfCtx(ns, cfg) {
  _rfCtx[ns] = cfg || {};
  if (!_rfVista[ns]) _rfVista[ns] = 'elenco';
  if (!_rfAperti[ns]) _rfAperti[ns] = {};
}
function _rfC(ns) { return _rfCtx[ns] || null; }
function _rfAgg(ns) { var c = _rfC(ns); if (c && typeof c.onChange === 'function') c.onChange(); }

// ── formattatori (usa quelli dell'app se ci sono) ───────────────────
function _rfE(v) { return (typeof fmtE === 'function') ? fmtE(v) : ('€ ' + Number(v || 0).toFixed(2)); }
function _rfL(v) { return (typeof fmtL === 'function') ? fmtL(v) : (Number(v || 0) + ' L'); }
function _rfD(d) { return (typeof _pfIsoToIt === 'function') ? _pfIsoToIt(d) : (d || '—'); }
function _rfEsc(s) { return (typeof esc === 'function') ? esc(s) : String(s == null ? '' : s); }
function _rfOggi() { var d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
function _rfNum(v) {
  if (v == null) return 0;
  v = String(v).trim().replace(/\s/g, '').replace(/€/g, ''); if (!v) return 0;
  if (v.indexOf(',') >= 0) v = v.replace(/\./g, '').replace(',', '.');
  var n = Number(v); return isNaN(n) ? 0 : n;
}
// In queste liste ci sono solo ordini SENZA fattura: sono tutti agganciabili a
// un numero, anche quelli già pagati (ibrido: prima il pagamento, poi il documento).
function _rfSelezionabile(o) { return true; }

// ── selezione ───────────────────────────────────────────────────────
function pfRfSetVista(ns, v) { _rfVista[ns] = v; _rfAgg(ns); }
function pfRfEspandi(ns, scad) { _rfAperti[ns][scad] = !_rfAperti[ns][scad]; _rfAgg(ns); }
function pfRfToggle(ns, id, cb) {
  var c = _rfC(ns); if (!c) return;
  if (cb && cb.checked) c.sel[id] = true; else delete c.sel[id];
  _rfAgg(ns);
}
function pfRfToggleGruppo(ns, scad, cb) {
  var c = _rfC(ns); if (!c) return;
  c.ordini.forEach(function (o) {
    if (String(o.scadenza || '') !== scad || !_rfSelezionabile(o)) return;
    if (cb && cb.checked) c.sel[o.id] = true; else delete c.sel[o.id];
  });
  _rfAgg(ns);
}
function pfRfSgancia(ns, id) { var c = _rfC(ns); if (!c) return; delete c.sel[id]; _rfAgg(ns); }
// Svuota SEMPRE in loco: l'oggetto è condiviso con chi ci ha registrato il
// contesto (in estratto conto è _ecfSelezione), sostituirlo lo scollegherebbe.
function _rfSvuota(sel) { if (!sel) return; Object.keys(sel).forEach(function (k) { delete sel[k]; }); }
function pfRfDeseleziona(ns) { var c = _rfC(ns); if (!c) return; _rfSvuota(c.sel); _rfAgg(ns); }
function _rfSelezionati(ns) {
  var c = _rfC(ns); if (!c) return [];
  return c.ordini.filter(function (o) { return c.sel[o.id]; });
}

// ── pulsanti vista ──────────────────────────────────────────────────
function pfRfBtnVista(ns) {
  var v = _rfVista[ns] || 'elenco';
  var b = function (val, txt) {
    var on = v === val;
    return '<button onclick="pfRfSetVista(\'' + ns + '\',\'' + val + '\')" style="font-size:11.5px;padding:6px 14px;border:0.5px solid '
      + (on ? '#185FA5' : 'var(--border)') + ';border-radius:7px;background:' + (on ? '#185FA5' : 'var(--bg)')
      + ';color:' + (on ? '#fff' : 'var(--text)') + ';cursor:pointer;font-weight:' + (on ? '600' : '400') + '">' + txt + '</button>';
  };
  return b('elenco', 'Elenco ordini') + b('gruppi', 'Σ Raggruppa per scadenza');
}

// ── riquadro selezione (fisso a destra) ─────────────────────────────
function pfRfBox(ns) {
  var c = _rfC(ns); if (!c) return '';
  var ords = _rfSelezionati(ns);
  if (!ords.length) return '';
  var tot = ords.reduce(function (s, o) { return s + o.totale; }, 0);
  return '<div style="position:fixed;right:18px;top:120px;z-index:900;width:238px;background:#E6F1FB;border:1px solid #378ADD;border-radius:12px;padding:13px 14px;box-shadow:0 6px 18px rgba(0,0,0,.16)">'
    + '<div style="font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#0C447C;font-weight:700;margin-bottom:6px">Selezione</div>'
    + '<div style="font-family:var(--font-mono);font-size:20px;font-weight:700;color:#0C447C">' + ords.length + (ords.length === 1 ? ' ordine' : ' ordini') + '</div>'
    + '<div style="font-family:var(--font-mono);font-size:15px;font-weight:700;margin:2px 0 10px">' + _rfE(tot) + '</div>'
    + '<button onclick="pfRfApri(\'' + ns + '\')" style="width:100%;font-size:12px;padding:9px 10px;border:none;border-radius:8px;background:#0C447C;color:#fff;font-weight:600;cursor:pointer">＋ Registra fattura</button>'
    + (c.extraBtn || '')
    + '<button onclick="pfRfDeseleziona(\'' + ns + '\')" style="width:100%;margin-top:6px;font-size:12px;padding:7px 10px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Deseleziona</button>'
    + '</div>';
}

// ── tabella ordini (elenco o raggruppata per scadenza) ──────────────
function pfRfTabella(ns) {
  var c = _rfC(ns); if (!c) return '';
  var vista = _rfVista[ns] || 'elenco';
  var oggi = _rfOggi();
  var th = 'padding:9px 8px;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;background:var(--bg)';

  var head = '<thead><tr>'
    + '<th style="' + th + ';width:52px">Sel.</th><th style="' + th + ';text-align:left">Data</th><th style="' + th + ';text-align:left">Prodotto</th>'
    + '<th style="' + th + ';text-align:right">Litri</th><th style="' + th + ';text-align:right">€/L</th>'
    + '<th style="' + th + ';text-align:right">Imponibile</th><th style="' + th + ';text-align:right">Tot. IVA inc.</th>'
    + '<th style="' + th + ';text-align:left">Scadenza</th><th style="' + th + ';text-align:left">Stato</th></tr></thead>';

  var badge = function (o) {
    if (o.pagato) return '<span style="background:#EAF3DE;color:#27500A;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">pagato</span>';
    var scaduto = o.scadenza && o.scadenza < oggi;
    if (scaduto) {
      var gg = Math.round((new Date(oggi) - new Date(o.scadenza)) / 86400000);
      return '<span style="background:#FCEBEB;color:#791F1F;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">scaduto ' + gg + ' gg</span>';
    }
    return '<span style="background:#FFF1DC;color:#8A4F06;padding:3px 10px;border-radius:11px;font-size:10.5px;font-weight:600">da pagare</span>';
  };

  var cellaSel = function (o) {
    if (!c.selezionabile) return '<td style="text-align:center">—</td>';
    if (!_rfSelezionabile(o)) return '<td></td>';
    return '<td style="text-align:center"><input type="checkbox"' + (c.sel[o.id] ? ' checked' : '')
      + ' onclick="pfRfToggle(\'' + ns + '\',\'' + o.id + '\',this)" style="width:17px;height:17px;cursor:pointer;accent-color:#639922"></td>';
  };

  var rigaOrdine = function (o, figlio) {
    var bg = figlio ? 'background:#FCFDFE;' : '';
    var pad = figlio ? 'padding-left:22px;' : '';
    return '<tr style="' + bg + '">'
      + cellaSel(o)
      + '<td style="font-family:var(--font-mono);' + pad + '">' + _rfD(o.data) + '</td>'
      + '<td>' + _rfEsc(o.prodotto || '—') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono)">' + _rfL(o.litri) + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-size:12px">' + Number(o.costoL || 0).toFixed(4).replace('.', ',') + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono)">' + _rfE(o.imponibile) + '</td>'
      + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700">' + _rfE(o.totale) + '</td>'
      + '<td style="font-family:var(--font-mono);font-size:14.5px;font-weight:700;color:' + ((o.scadenza && o.scadenza < oggi) ? '#7F1D1D' : '#C0392B') + '">' + (o.scadenza ? _rfD(o.scadenza) : '—') + '</td>'
      + '<td>' + (figlio && c.sel[o.id]
          ? '<button onclick="pfRfSgancia(\'' + ns + '\',\'' + o.id + '\')" style="font-size:11px;color:#A32D2D;border:0.5px solid #E4B7B7;background:var(--bg-card,#fff);border-radius:6px;padding:3px 9px;cursor:pointer">✕ sgancia</button>'
          : badge(o)) + '</td></tr>';
  };

  // SEMPRE per scadenza crescente: qui comanda la data di scadenza
  var perScadenza = function (a, b) {
    var sa = String(a.scadenza || '9999-12-31'), sb2 = String(b.scadenza || '9999-12-31');
    if (sa !== sb2) return sa < sb2 ? -1 : 1;
    return String(a.data || '').localeCompare(String(b.data || ''));
  };
  var corpo = '';

  if (vista === 'gruppi') {
    var scadenze = [];
    c.ordini.forEach(function (o) { var s = String(o.scadenza || ''); if (scadenze.indexOf(s) < 0) scadenze.push(s); });
    scadenze.sort();
    scadenze.forEach(function (s) {
      var g = c.ordini.filter(function (o) { return String(o.scadenza || '') === s; });
      var sel1 = g.filter(function (o) { return _rfSelezionabile(o); });
      var nSel = sel1.filter(function (o) { return c.sel[o.id]; }).length;
      var tutti = sel1.length > 0 && nSel === sel1.length;
      var parz = nSel > 0 && !tutti;
      var lit = g.reduce(function (a, o) { return a + Number(o.litri || 0); }, 0);
      var imp = g.reduce(function (a, o) { return a + Number(o.imponibile || 0); }, 0);
      var tot = g.reduce(function (a, o) { return a + Number(o.totale || 0); }, 0);
      var aperto = !!_rfAperti[ns][s];
      var scaduto = s && s < oggi;

      corpo += '<tr style="background:#F1F5FA;cursor:pointer" onclick="pfRfEspandi(\'' + ns + '\',\'' + s + '\')">'
        + '<td style="text-align:center;border-bottom:1px solid #378ADD" onclick="event.stopPropagation()">'
          + (c.selezionabile && sel1.length
              ? '<input type="checkbox"' + (tutti ? ' checked' : '') + (parz ? ' style="width:17px;height:17px;cursor:pointer;accent-color:#639922;opacity:.55"' : ' style="width:17px;height:17px;cursor:pointer;accent-color:#639922"')
                + ' onclick="pfRfToggleGruppo(\'' + ns + '\',\'' + s + '\',this)">'
              : '') + '</td>'
        + '<td colspan="2" style="font-weight:700;border-bottom:1px solid #378ADD">' + (aperto ? '▾' : '▸') + ' Scadenza ' + (s ? _rfD(s) : '—') + ' · ' + g.length + (g.length === 1 ? ' ordine' : ' ordini')
          + (parz ? ' <span style="background:#FFF1DC;color:#8A4F06;padding:3px 9px;border-radius:11px;font-size:10.5px;font-weight:600">' + nSel + ' su ' + sel1.length + ' selezionati</span>' : '') + '</td>'
        + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700;border-bottom:1px solid #378ADD">' + _rfL(lit) + '</td>'
        + '<td style="border-bottom:1px solid #378ADD"></td>'
        + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700;border-bottom:1px solid #378ADD">' + _rfE(imp) + '</td>'
        + '<td style="text-align:right;font-family:var(--font-mono);font-weight:700;border-bottom:1px solid #378ADD">' + _rfE(tot) + '</td>'
        + '<td style="font-family:var(--font-mono);font-size:14.5px;font-weight:700;border-bottom:1px solid #378ADD;color:' + (scaduto ? '#7F1D1D' : '#C0392B') + '">' + (s ? _rfD(s) : '—') + '</td>'
        + '<td style="border-bottom:1px solid #378ADD"></td></tr>';

      if (aperto) g.slice().sort(perScadenza).forEach(function (o) { corpo += rigaOrdine(o, true); });
    });
  } else {
    c.ordini.slice().sort(perScadenza).forEach(function (o) { corpo += rigaOrdine(o, false); });
  }

  if (!corpo) corpo = '<tr><td colspan="9" style="text-align:center;color:var(--text-muted);padding:18px;font-size:12px">Nessun ordine</td></tr>';

  return '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:13px">'
    + head + '<tbody>' + corpo + '</tbody></table></div>';
}

// ═══════════════════════════════════════════════════════════════════
// MODALE — registra fattura (nessun pagamento)
// ═══════════════════════════════════════════════════════════════════
function pfRfApri(ns) {
  var c = _rfC(ns); if (!c) return;
  var ords = _rfSelezionati(ns);
  if (!ords.length) { if (typeof toast === 'function') toast('Seleziona almeno un ordine'); return; }
  if (!c.fornitore || !c.fornitore.nome) { if (typeof toast === 'function') toast('Scegli prima il fornitore'); return; }
  var tot = Math.round(ords.reduce(function (s, o) { return s + o.totale; }, 0) * 100) / 100;
  var scadenze = ords.map(function (o) { return o.scadenza; }).filter(Boolean).sort();
  _rfMod = {
    ns: ns, ordini: ords, totale: tot,
    scadenzaMax: scadenze.length ? scadenze[scadenze.length - 1] : _rfOggi(),
    scadenzeDiverse: scadenze.filter(function (v, i, a) { return a.indexOf(v) === i; })
  };
  _rfRenderModale();
}

function _rfRenderModale() {
  var S = _rfMod; if (!S) return;
  var c = _rfC(S.ns); if (!c) return;
  var box = 'width:100%;box-sizing:border-box;padding:8px 10px;font-size:14px;border:0.5px solid var(--border);border-radius:7px;background:var(--bg);color:var(--text);font-family:var(--font-mono)';
  var lbl = 'display:block;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:var(--text-muted);font-weight:600;margin-bottom:4px';

  var h = '<div style="font-size:16px;font-weight:600;margin-bottom:2px">Registra fattura fornitore — ' + _rfEsc(c.fornitore.nome) + '</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + S.ordini.length + (S.ordini.length === 1 ? ' ordine' : ' ordini') + ' · Σ ' + _rfE(S.totale) + ' IVA inc. · nessun pagamento registrato qui</div>'

    + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">n° fattura</label><input id="rf-num" type="text" placeholder="es. 64920" style="' + box + '"></div>'
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">data fattura</label><input id="rf-dfatt" type="date" value="' + _rfOggi() + '" style="' + box + '"></div>'
    + '</div>'

    + '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:12px">'
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">importo totale c/IVA</label>'
        + '<input id="rf-imp" type="text" inputmode="decimal" value="' + String(S.totale.toFixed(2)).replace('.', ',') + '" oninput="pfRfOnImporto()" style="' + box + ';font-weight:700"></div>'
      + '<div style="flex:1;min-width:150px"><label style="' + lbl + '">data scadenza (comanda sulla fattura)</label>'
        + '<input id="rf-dscad" type="date" value="' + S.scadenzaMax + '" style="' + box + '"></div>'
    + '</div>';

  if (S.scadenzeDiverse.length > 1) {
    h += '<div style="background:#FFF1DC;color:#633806;padding:9px 12px;border-radius:7px;font-size:11.5px;line-height:1.5;margin-bottom:12px">'
      + 'Gli ordini selezionati hanno scadenze diverse (' + S.scadenzeDiverse.map(_rfD).join(' · ') + '). '
      + 'Proposta la più lontana. La data qui sopra <b>sostituisce</b> quella calcolata dai giorni fornitore, per tutti gli ordini agganciati.'
      + '</div>';
  }

  h += '<div id="rf-quad" style="margin-bottom:12px"></div>'

    + '<label style="' + lbl + '">ordini agganciati</label>'
    + '<div style="border:0.5px solid var(--border);border-radius:8px;max-height:190px;overflow:auto;margin-bottom:14px">'
    + S.ordini.map(function (o) {
        return '<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-bottom:0.5px solid var(--border);font-size:12px">'
          + '<span style="font-family:var(--font-mono);min-width:82px">' + _rfD(o.data) + '</span>'
          + '<span style="flex:1">' + _rfEsc(o.prodotto || '—') + '</span>'
          + '<span style="font-family:var(--font-mono);color:var(--text-muted);min-width:82px;text-align:right">scad. ' + (o.scadenza ? _rfD(o.scadenza) : '—') + '</span>'
          + '<span style="font-family:var(--font-mono);font-weight:700;min-width:96px;text-align:right">' + _rfE(o.totale) + '</span>'
          + '<button onclick="pfRfSganciaMod(\'' + o.id + '\')" title="Togli questo ordine dalla fattura" style="font-size:11px;color:#A32D2D;border:0.5px solid #E4B7B7;background:var(--bg-card,#fff);border-radius:6px;padding:3px 8px;cursor:pointer">✕</button>'
          + '</div>';
      }).join('')
    + '</div>'

    + '<div style="display:flex;justify-content:flex-end;gap:10px">'
      + '<button onclick="chiudiModalePermessi()" style="padding:9px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-size:13px">Annulla</button>'
      + '<button id="rf-salva" onclick="pfRfSalva()" style="padding:9px 20px;border:none;border-radius:8px;background:#0C447C;color:#fff;cursor:pointer;font-size:13px;font-weight:600">Salva fattura</button>'
    + '</div>';

  if (typeof apriModal === 'function') apriModal(h);
  setTimeout(pfRfOnImporto, 0);
}

function pfRfOnImporto() {
  var S = _rfMod; if (!S) return;
  var el = document.getElementById('rf-imp'), div = document.getElementById('rf-quad');
  if (!el || !div) return;
  var imp = _rfNum(el.value);
  var diff = Math.round((imp - S.totale) * 100) / 100;
  var abs = Math.abs(diff);
  if (imp <= 0) { div.innerHTML = ''; return; }
  if (abs <= _RF_TOLL) {
    div.innerHTML = '<div style="background:#EAF3DE;color:#27500A;padding:8px 12px;border-radius:7px;font-size:12px;font-weight:500">'
      + '✓ Quadratura OK · Σ ordini c/IVA ' + _rfE(S.totale) + ' · Δ ' + _rfE(abs) + '</div>';
  } else {
    div.innerHTML = '<div style="background:#FAEEDA;color:#633806;padding:10px 12px;border-radius:7px;font-size:12px">'
      + '<div style="font-weight:600;margin-bottom:5px">⚠ Gli importi non quadrano</div>'
      + '<div style="font-size:11px;margin-bottom:6px">Σ ordini c/IVA ' + _rfE(S.totale) + ' · dichiarato ' + _rfE(imp) + ' · Δ ' + (diff >= 0 ? '+' : '−') + _rfE(abs) + '</div>'
      + '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11.5px"><input type="checkbox" id="rf-ovr" style="margin:0">'
      + '<span>Ho verificato la differenza, salva comunque</span></label></div>';
  }
}

function pfRfSganciaMod(id) {
  var S = _rfMod; if (!S) return;
  var c = _rfC(S.ns); if (!c) return;
  delete c.sel[id];
  S.ordini = S.ordini.filter(function (o) { return o.id !== id; });
  _rfAgg(S.ns);
  if (!S.ordini.length) {
    _rfMod = null;
    if (typeof chiudiModalePermessi === 'function') chiudiModalePermessi();
    if (typeof toast === 'function') toast('Nessun ordine rimasto: fattura annullata');
    return;
  }
  S.totale = Math.round(S.ordini.reduce(function (s, o) { return s + o.totale; }, 0) * 100) / 100;
  var scad = S.ordini.map(function (o) { return o.scadenza; }).filter(Boolean).sort();
  S.scadenzaMax = scad.length ? scad[scad.length - 1] : _rfOggi();
  S.scadenzeDiverse = scad.filter(function (v, i, a) { return a.indexOf(v) === i; });
  _rfRenderModale();
}

async function pfRfSalva() {
  var S = _rfMod; if (!S) return;
  var c = _rfC(S.ns); if (!c) return;
  var btn = document.getElementById('rf-salva');

  var num = (document.getElementById('rf-num').value || '').trim();
  var dFatt = document.getElementById('rf-dfatt').value || _rfOggi();
  var dScad = document.getElementById('rf-dscad').value || '';
  var imp = _rfNum(document.getElementById('rf-imp').value);

  if (!num) { if (typeof toast === 'function') toast('Inserisci il numero della fattura'); return; }
  if (!dScad) { if (typeof toast === 'function') toast('Inserisci la data di scadenza'); return; }
  if (!(imp > 0)) { if (typeof toast === 'function') toast('Inserisci un importo valido'); return; }

  var override = false;
  if (Math.abs(imp - S.totale) > _RF_TOLL) {
    var chk = document.getElementById('rf-ovr');
    if (!chk || !chk.checked) { if (typeof toast === 'function') toast('Gli importi non quadrano: spunta "Ho verificato la differenza"'); return; }
    override = true;
  }

  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; btn.style.opacity = '.6'; }
  var fatturaId = null;
  try {
    var ins = await sb.from('fatture_ricevute').insert([{
      fornitore_id:        c.fornitore.id || null,
      fornitore_nome:      c.fornitore.nome,
      numero_fattura:      num,
      data_fattura:        dFatt,
      data_scadenza:       dScad,
      importo_dichiarato:  imp,
      override_quadratura: override,
      tipo_ingresso:       'estratto_conto'
    }]).select().single();
    if (ins.error) throw ins.error;
    fatturaId = ins.data.id;

    var ids = S.ordini.map(function (o) { return o.id; });
    var up = await sb.from('ordini').update({ fattura_ricevuta_id: fatturaId }).in('id', ids);
    if (up.error) {
      // ROLLBACK: niente fattura orfana senza ordini agganciati
      await sb.from('fatture_ricevute').delete().eq('id', fatturaId);
      throw up.error;
    }

    if (typeof _auditLog === 'function') _auditLog('fattura_fornitore', 'fatture_ricevute', c.fornitore.nome + ' fattura ' + num + ' · ' + ids.length + ' ordini · ' + _rfE(imp));
    if (typeof toast === 'function') toast('✓ Fattura ' + num + ' registrata su ' + ids.length + (ids.length === 1 ? ' ordine' : ' ordini'));
    _rfMod = null;
    _rfSvuota(c.sel);
    if (typeof chiudiModalePermessi === 'function') chiudiModalePermessi();
    if (typeof c.onSaved === 'function') await c.onSaved();
  } catch (e) {
    console.error('[rf] salva fattura', e);
    var msg = (e && e.message) ? e.message : String(e);
    if (msg.indexOf('duplicate') >= 0 || msg.indexOf('unique') >= 0) msg = 'Esiste già una fattura con questo numero per lo stesso fornitore.';
    if (typeof toast === 'function') toast('Errore: ' + msg);
    if (btn) { btn.disabled = false; btn.textContent = 'Salva fattura'; btn.style.opacity = '1'; }
  }
}

// ═══════════════════════════════════════════════════════════════════
// LINGUETTA "SENZA FATTURA" dentro il pannello Fatture Fornitori
// Usa la STESSA fonte dell'estratto conto (_ecfCarica / _ecfOrdini):
// nessuna query nuova, stessi numeri per costruzione.
// ═══════════════════════════════════════════════════════════════════
function pfRfSwitchTabFF(tab, btn) {
  document.querySelectorAll('.ff-tab').forEach(function (t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)'; t.style.border = '0.5px solid var(--border)'; t.style.fontWeight = '400';
  });
  if (btn) { btn.style.background = '#185FA5'; btn.style.color = '#fff'; btn.style.border = '0.5px solid #185FA5'; btn.style.fontWeight = '600'; }
  document.querySelectorAll('.ff-panel').forEach(function (p) { p.style.display = 'none'; });
  var el = document.getElementById(tab);
  if (el) el.style.display = '';
  if (tab === 'ff-senza') pfRfCaricaTab();
}

async function pfRfCaricaTab() {
  var sel = document.getElementById('rf-fornitore');
  if (sel && !sel.dataset.pop) {
    if (!_ecfFornitori || !_ecfFornitori.length) {
      var r = await sb.from('fornitori').select('id,nome,fido_massimo,giorni_pagamento').order('nome');
      _ecfFornitori = r.data || [];
    }
    sel.innerHTML = '<option value="">— scegli un fornitore —</option>'
      + _ecfFornitori.map(function (f) { return '<option value="' + f.id + '">' + _rfEsc(f.nome) + '</option>'; }).join('');
    sel.dataset.pop = '1';
    if (_ecfSel && _ecfSel.id) sel.value = _ecfSel.id;
  }
  if (sel && sel.value) await pfRfCambiaFornitore(); else _rfRenderTab();
}

async function pfRfCambiaFornitore() {
  var sel = document.getElementById('rf-fornitore');
  var body = document.getElementById('rf-body');
  var id = sel ? sel.value : '';
  if (!id) { _ecfSel = null; _rfRenderTab(); return; }
  var f = _ecfFornitori.filter(function (x) { return x.id === id; })[0] || {};
  _ecfSel = { id: id, nome: f.nome || '', fido: Number(f.fido_massimo || 0), gg: Number(f.giorni_pagamento || 30) };
  // tiene allineata la tendina dell'Estratto conto: stesso fornitore nelle due linguette
  var selEcf = document.getElementById('ecf-fornitore');
  if (selEcf && selEcf.value !== id) selEcf.value = id;
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:30px;font-size:12px">⏳ Caricamento ordini...</div>';
  await _ecfCarica();
  _rfRenderTab();
}

function _rfRenderTab() {
  var body = document.getElementById('rf-body');
  if (!body) return;
  var scrollY = window.scrollY;

  if (!_ecfSel || !_ecfSel.id) {
    body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:34px;font-size:12.5px">'
      + 'Scegli un fornitore: una fattura appartiene a un solo fornitore, quindi la selezione si attiva solo dopo la scelta.</div>';
    return;
  }

  var ordini = _ecfOrdini.filter(function (o) { return !o.fatturaId; });   // anche i già pagati: il numero può arrivare dopo
  var tot = ordini.reduce(function (s, o) { return s + o.totale; }, 0);

  pfRfCtx('rf', {
    ordini: ordini,
    sel: (_rfCtx['rf'] && _rfCtx['rf'].sel) || {},
    fornitore: _ecfSel,
    selezionabile: true,
    onChange: _rfRenderTab,
    onSaved: async function () { await _ecfCarica(); _rfRenderTab(); }
  });

  // Fatture create da un pagamento anticipato: hanno l'id ma non il numero.
  var daNumerare = (_ecfFatture || []).filter(function (f) { return !f.numero; });
  var strisciaNum = !daNumerare.length ? '' :
    '<div style="border:1px solid #F5921E;background:#FFF9F0;border-radius:10px;padding:11px 13px;margin-bottom:14px">'
    + '<div style="font-size:12px;font-weight:700;color:#8A4F06;margin-bottom:7px">Fatture da numerare · ' + daNumerare.length
    + ' <span style="font-weight:400">— pagate prima che arrivasse il documento</span></div>'
    + daNumerare.map(function (f) {
        return '<div style="display:flex;align-items:center;gap:10px;padding:5px 0;font-size:12px">'
          + '<span style="font-family:var(--font-mono)">' + (f.data ? _rfD(f.data) : '—') + '</span>'
          + '<span style="flex:1;color:var(--text-muted)">' + f.ordini.length + (f.ordini.length === 1 ? ' ordine' : ' ordini') + '</span>'
          + '<span style="font-family:var(--font-mono);font-weight:700">' + _rfE(f.totale) + '</span>'
          + '<button onclick="ecfNumeraFattura(\'' + f.id + '\')" style="font-size:11px;padding:4px 9px;border:0.5px solid #F5921E;border-radius:6px;background:#FFF1DC;color:#8A4F06;cursor:pointer;font-weight:600">✎ inserisci n°</button>'
          + '</div>';
      }).join('')
    + '</div>';

  body.innerHTML = strisciaNum +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">'
      + '<div style="font-size:13px;font-weight:600">Ordini senza fattura — ' + _rfEsc(_ecfSel.nome)
        + ' <span style="font-weight:400;color:var(--text-muted)">· ' + ordini.length + (ordini.length === 1 ? ' ordine · ' : ' ordini · ') + _rfE(tot) + ' IVA inc.</span></div>'
      + '<div style="display:flex;gap:8px">' + pfRfBtnVista('rf') + '</div></div>'
    + pfRfTabella('rf')
    + pfRfBox('rf');

  window.scrollTo(0, scrollY);
}
