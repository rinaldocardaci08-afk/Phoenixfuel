// ════════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Calcolatore costi anticipo per istituto
// Modulo trasversale: usa dati da banche_valutazioni_periodi (CDF + volume)
// e da banche_affidamenti (TAN attuale).
//
// Esporta:
//   _calcInteressi(importo, tan, giorni)           → calcolo interessi puri
//   _calcQuotaCdf(importo, cdfAnno, volAnno)       → quota CDF pro-rata
//   _calcRenderPanelEsempio(istId, tan, nome, ctr) → pannello "esempio €5.000"
//                                                    nella dashboard banca
//   _calcOpenPopupCosto(fatturaId, affId)          → popup confronto banche
//                                                    per fattura specifica
// ════════════════════════════════════════════════════════════════════════════

// ── CALCOLI PURI ───────────────────────────────────────────────────────────
function _calcInteressi(importo, tanPct, giorni) {
  const i = Number(importo) || 0;
  const t = Number(tanPct) || 0;
  const g = Number(giorni) || 0;
  return i * (t / 100) * (g / 365);
}

function _calcQuotaCdf(importo, cdfAnno, volAnno) {
  const v = Number(volAnno) || 0;
  if (v <= 0) return 0;
  return Number(cdfAnno) * (Number(importo) / v);
}

// ── HELPER: recupera fattura da cache anticipi ─────────────────────────────
function _calcGetFatturaFromCache(fatturaId) {
  if (typeof _antPresentazioniByAff !== 'object') return null;
  for (const affId in _antPresentazioniByAff) {
    const presentazioni = _antPresentazioniByAff[affId] || [];
    for (const p of presentazioni) {
      const f = (p._fatture || []).find(x => x.id === fatturaId);
      if (f) return { fattura: f, affidamentoId: affId };
    }
  }
  return null;
}

// ════════════════════════════════════════════════════════════════════════════
// PANNELLO "SIMULAZIONE COSTO ANTICIPO" (in dashboard banca Anticipi)
// Mostra: esempio €5.000 a 30/60/90gg + multipli 10k/20k/50k/100k a 90gg
// ════════════════════════════════════════════════════════════════════════════
async function _calcRenderPanelEsempio(istitutoId, tan, istitutoNome, containerId) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!tan || Number(tan) <= 0) { el.innerHTML = ''; return; }

  // Carica dati di valutazione anno corrente (per CDF + volume)
  const annoCorr = new Date().getFullYear();
  let cdfAnno = 0, volAnno = 0;
  try {
    const r = await sb.from('banche_valutazioni_periodi')
      .select('cdf_totali, volume_anticipi_lavorato')
      .eq('banca_id', istitutoId)
      .eq('anno', annoCorr)
      .maybeSingle();
    if (r && r.data) {
      cdfAnno = Number(r.data.cdf_totali) || 0;
      volAnno = Number(r.data.volume_anticipi_lavorato) || 0;
    }
  } catch(e) { /* fallback con CDF = 0 */ }

  const importoEsempio = 5000;
  const giorniList = [30, 60, 90];
  const quotaCdfEsempio = _calcQuotaCdf(importoEsempio, cdfAnno, volAnno);

  let h = '';
  h += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;padding:14px 16px;margin-bottom:16px">';
  h += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;gap:10px;flex-wrap:wrap">';
  h += '<div>';
  h += '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">💰 Simulazione costo anticipo</div>';
  h += '<div style="font-size:13px;font-weight:600;color:var(--text);margin-top:3px">Esempio: fattura di €5.000 anticipata presso ' + (istitutoNome || 'questa banca') + '</div>';
  h += '</div>';
  h += '<div style="text-align:right;font-size:11px;color:var(--text-muted)">TAN attuale: <b style="color:var(--text);font-family:var(--font-mono)">' + Number(tan).toFixed(3) + '%</b></div>';
  h += '</div>';

  // Tabella 30/60/90 gg
  h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px">';
  h += '<thead><tr style="background:var(--bg)">';
  ['Durata','Interessi (TAN×gg)','Quota CDF*','Costo all-in','Per €1.000'].forEach(c => {
    h += '<th style="padding:6px 10px;text-align:left;font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px;font-weight:600;border-bottom:0.5px solid var(--border)">' + c + '</th>';
  });
  h += '</tr></thead><tbody>';
  giorniList.forEach(g => {
    const interessi = _calcInteressi(importoEsempio, tan, g);
    const totale = interessi + quotaCdfEsempio;
    const perK = totale / importoEsempio * 1000;
    h += '<tr style="border-bottom:0.5px solid var(--border)">';
    h += '<td style="padding:7px 10px;font-weight:600">' + g + ' giorni</td>';
    h += '<td style="padding:7px 10px;font-family:var(--font-mono);color:#A32D2D">' + fmtE(interessi) + '</td>';
    h += '<td style="padding:7px 10px;font-family:var(--font-mono);color:var(--text-muted)">' + (volAnno > 0 ? fmtE(quotaCdfEsempio) : '—') + '</td>';
    h += '<td style="padding:7px 10px;font-family:var(--font-mono);font-weight:700;color:#A32D2D">' + fmtE(totale) + '</td>';
    h += '<td style="padding:7px 10px;font-family:var(--font-mono);font-weight:600">€ ' + perK.toFixed(2) + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';

  // Tabella moltiplicatori a 90 giorni
  const costo90per1k = (_calcInteressi(1000, tan, 90) + (volAnno > 0 ? _calcQuotaCdf(1000, cdfAnno, volAnno) : 0));
  h += '<div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:6px">';
  h += '<div style="font-size:10.5px;color:var(--text-muted);font-weight:600;letter-spacing:0.3px;margin-bottom:6px">SCALA COSTI A 90 GIORNI (proporzionale)</div>';
  h += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px">';
  [5000, 10000, 20000, 50000, 100000].forEach(m => {
    const c = costo90per1k * m / 1000;
    h += '<div><span style="color:var(--text-muted)">€' + (m/1000) + 'k →</span> <b style="color:#A32D2D;font-family:var(--font-mono)">' + fmtE(c) + '</b></div>';
  });
  h += '</div>';
  h += '</div>';

  // Nota CDF
  if (volAnno === 0) {
    h += '<div style="margin-top:8px;font-size:10.5px;color:var(--text-muted);font-style:italic">⚠ Quota CDF non calcolata: nessun volume anticipi storico inserito nella scheda valutazione di ' + (istitutoNome || 'questa banca') + ' ' + annoCorr + '. Vai in Banche & Mutui → Valutazioni → Importa estratto conto.</div>';
  } else {
    h += '<div style="margin-top:8px;font-size:10.5px;color:var(--text-muted);font-style:italic">* La CDF è un costo fisso trimestrale sul fido accordato (€' + (cdfAnno/4).toFixed(0) + ' a trimestre, indipendente dalla singola fattura). La quota mostrata è la frazione attribuibile pro-quota sul volume medio presentato (' + fmtE(volAnno) + ' nel ' + annoCorr + '). Costo indicativo.</div>';
  }
  h += '</div>';

  el.innerHTML = h;
}

// ════════════════════════════════════════════════════════════════════════════
// POPUP CONFRONTO BANCHE PER SINGOLA FATTURA
// Click su ℹ︎ accanto a una fattura → mostra costo anticipo per ogni istituto
// ════════════════════════════════════════════════════════════════════════════
async function _calcOpenPopupCosto(fatturaId, affidamentoCorrenteId) {
  // Recupera fattura dal cache anticipi
  const lookup = _calcGetFatturaFromCache(fatturaId);
  if (!lookup) {
    alert('Fattura non trovata. Ricarica la pagina e riprova.');
    return;
  }
  const f = lookup.fattura;
  const affCorr = (_bancheAffidamenti || []).find(a => a.id === affidamentoCorrenteId);
  const istitutoCorrenteId = affCorr ? affCorr.istituto_id : null;

  const importoAnticipato = Number(f.importo_anticipato_calcolato) || (Number(f.totale_fattura) * 0.80);
  const numero  = f.numero_fattura || '—';
  const cliente = f.cliente_nome || '—';

  // Recupera valutazioni anno corrente per tutte le banche (CDF + volume)
  const annoCorr = new Date().getFullYear();
  let valMap = {};
  try {
    const r = await sb.from('banche_valutazioni_periodi')
      .select('banca_id, cdf_totali, volume_anticipi_lavorato')
      .eq('anno', annoCorr);
    (r.data || []).forEach(v => valMap[v.banca_id] = v);
  } catch(e) {}

  // Per ogni banca, TAN dall'affidamento attivo (più basso se più di uno)
  const tanPerBanca = {};
  (_bancheAffidamenti || []).forEach(af => {
    const tipoOk = !af.tipo || ['sbf','anticipo_fatture','castelletto','autoliquidante'].includes(af.tipo);
    const statoOk = !af.stato || af.stato === 'attivo';
    if (tipoOk && statoOk && af.tasso && af.istituto_id) {
      if (!tanPerBanca[af.istituto_id] || Number(af.tasso) < Number(tanPerBanca[af.istituto_id])) {
        tanPerBanca[af.istituto_id] = Number(af.tasso);
      }
    }
  });

  // Banche con TAN disponibile, in ordine costituzionale
  const banche = (_bancheIstituti || []).slice()
    .sort((a, b) => _priorityBancaIstituto(a.nome) - _priorityBancaIstituto(b.nome))
    .filter(b => tanPerBanca[b.id]);

  if (!banche.length) {
    alert('Nessuna banca con TAN configurato in Affidamenti.');
    return;
  }

  // Pre-calcoli per ogni banca
  const datiBanche = banche.map(b => {
    const tan = tanPerBanca[b.id];
    const val = valMap[b.id];
    const cdfAnno = val ? Number(val.cdf_totali) : 0;
    const volAnno = val ? Number(val.volume_anticipi_lavorato) : 0;
    const interessi30 = _calcInteressi(importoAnticipato, tan, 30);
    const interessi60 = _calcInteressi(importoAnticipato, tan, 60);
    const interessi90 = _calcInteressi(importoAnticipato, tan, 90);
    const quotaCdf    = _calcQuotaCdf(importoAnticipato, cdfAnno, volAnno);
    return { banca: b, tan, cdfAnno, volAnno, interessi30, interessi60, interessi90, quotaCdf, isCurrente: b.id === istitutoCorrenteId };
  });

  // Banca migliore: minor costo all-in 60gg (interessi + quotaCdf)
  const allIn60 = datiBanche.map(d => d.interessi60 + d.quotaCdf);
  const minCosto = Math.min.apply(null, allIn60);
  const maxCosto = Math.max.apply(null, allIn60);

  // Modal
  const oldModal = document.getElementById('calc-modal');
  if (oldModal) oldModal.remove();
  const modal = document.createElement('div');
  modal.id = 'calc-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:flex-start;padding:40px 20px;overflow-y:auto';

  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:12px;padding:24px;width:100%;max-width:920px;max-height:calc(100vh - 80px);overflow-y:auto;position:relative">';
  h += '<button onclick="_calcCloseModal()" style="position:absolute;top:14px;right:14px;background:transparent;border:0;font-size:22px;cursor:pointer;color:var(--text-muted)" title="Chiudi">×</button>';
  h += '<div style="font-size:16px;font-weight:700;margin-bottom:4px">💰 Costo anticipo per istituto</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:18px">Fattura <b style="color:var(--text);font-family:var(--font-mono)">' + (numero || '—') + '</b> · ' + (cliente || '—') + ' · importo anticipato <b style="color:#26215C;font-family:var(--font-mono)">' + fmtE(importoAnticipato) + '</b></div>';

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:12px;margin-bottom:14px">';
  datiBanche.forEach(d => {
    const totale60 = d.interessi60 + d.quotaCdf;
    const isMigliore = (Math.abs(totale60 - minCosto) < 0.01 && datiBanche.length > 1);
    const isPeggiore = (Math.abs(totale60 - maxCosto) < 0.01 && datiBanche.length > 1 && minCosto !== maxCosto);
    const borderColor = isMigliore ? '#0a7a3a' : (isPeggiore ? '#A32D2D' : (d.isCurrente ? '#26215C' : 'var(--border)'));
    const bgColor = isMigliore ? 'rgba(10,122,58,0.06)' : (d.isCurrente ? 'rgba(38,33,92,0.04)' : 'var(--bg)');
    h += '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:8px;padding:12px">';

    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;flex-wrap:wrap">';
    h += '<div style="font-size:12.5px;font-weight:700">' + (d.banca.nome || '') + '</div>';
    if (isMigliore)       h += '<span style="background:#0a7a3a;color:#fff;font-size:8.5px;padding:2px 6px;border-radius:4px;font-weight:700;letter-spacing:0.3px">PIÙ CONVENIENTE</span>';
    else if (isPeggiore)  h += '<span style="background:#A32D2D;color:#fff;font-size:8.5px;padding:2px 6px;border-radius:4px;font-weight:700;letter-spacing:0.3px">MENO CONVENIENTE</span>';
    else if (d.isCurrente)h += '<span style="background:#26215C;color:#fff;font-size:8.5px;padding:2px 6px;border-radius:4px;font-weight:700;letter-spacing:0.3px">CORRENTE</span>';
    h += '</div>';

    h += '<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:8px">TAN <b style="color:var(--text);font-family:var(--font-mono)">' + d.tan.toFixed(3) + '%</b></div>';

    h += '<table style="width:100%;font-size:11px;border-collapse:collapse">';
    [['30 gg', d.interessi30], ['60 gg', d.interessi60], ['90 gg', d.interessi90]].forEach(arr => {
      h += '<tr><td style="padding:3px 0;color:var(--text-muted)">Interessi ' + arr[0] + '</td><td style="padding:3px 0;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + fmtE(arr[1]) + '</td></tr>';
    });
    if (d.volAnno > 0) {
      h += '<tr style="border-top:0.5px dashed var(--border)"><td style="padding:5px 0 3px;font-size:10px;color:var(--text-muted)">Quota CDF*</td><td style="padding:5px 0 3px;text-align:right;font-family:var(--font-mono);color:var(--text-muted);font-size:10.5px">' + fmtE(d.quotaCdf) + '</td></tr>';
    } else {
      h += '<tr style="border-top:0.5px dashed var(--border)"><td colspan="2" style="padding:5px 0 3px;font-size:10px;color:var(--text-muted);font-style:italic">CDF non disponibile</td></tr>';
    }
    h += '<tr style="border-top:1px solid var(--border)"><td style="padding:5px 0 0;font-size:11px;font-weight:700">► all-in 60gg</td><td style="padding:5px 0 0;text-align:right;font-family:var(--font-mono);font-weight:700;color:#A32D2D">' + fmtE(totale60) + '</td></tr>';
    h += '</table></div>';
  });
  h += '</div>';

  // Risparmio massimo
  if (datiBanche.length > 1 && (maxCosto - minCosto) > 0.01) {
    h += '<div style="background:rgba(10,122,58,0.08);border-left:3px solid #0a7a3a;padding:10px 14px;border-radius:0 6px 6px 0;font-size:12px;margin-bottom:14px">';
    h += '💡 Spostando questa fattura dalla banca meno conveniente alla più conveniente: <b>risparmio stimato a 60gg: ' + fmtE(maxCosto - minCosto) + '</b>.';
    h += '</div>';
  }

  // Nota legale
  h += '<div style="font-size:10.5px;color:var(--text-muted);font-style:italic;padding:10px 12px;background:var(--bg);border-radius:6px;line-height:1.5">';
  h += '<b>Note:</b> Interessi calcolati come <code style="background:rgba(0,0,0,0.05);padding:1px 4px;border-radius:3px">importo × TAN × giorni / 365</code>. ';
  h += 'La <b>Quota CDF</b> è un costo fisso trimestrale sul fido accordato indipendente dalla singola fattura: la paghi comunque sul fido. La quota mostrata è la frazione attribuibile pro-quota al volume medio presentato — valore indicativo. ';
  h += 'Per la scelta marginale (a quale banca presentare la prossima fattura) il TAN è il vero discriminante.';
  h += '</div>';

  h += '</div>';
  modal.innerHTML = h;
  document.body.appendChild(modal);
}

function _calcCloseModal() {
  const m = document.getElementById('calc-modal');
  if (m) m.remove();
}
