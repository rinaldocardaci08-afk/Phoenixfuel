// ════════════════════════════════════════════════════════════════════════════
// PhoenixFuel — Calcolatore costi anticipo per istituto (v2)
// Novità v2:
//   - Pannello collassabile con freccetta ▼/▶ (stato in localStorage)
//   - CDF SEMPRE visibile con badge fonte (storico/stima)
//   - Lookup CDF a 3 livelli:
//       1° storico anno corrente (se valutazione popolata)
//       2° storico anno precedente
//       3° stima da utilizzo medio 80% × ciclo 90gg (configurabile)
// ════════════════════════════════════════════════════════════════════════════

// ── DEFAULT PER STIMA CDF (configurabili) ──────────────────────────────────
const _CALC_UTILIZZO_MEDIO_PCT    = 80;      // % utilizzo fido medio
const _CALC_CICLO_MEDIO_GG        = 90;      // giorni ciclo medio anticipo
const _CALC_CDF_DEFAULT_PCT_ANNUA = 2.000;   // % annua di default se mancante

// ── CALCOLI PURI ───────────────────────────────────────────────────────────
function _calcInteressi(importo, tanPct, giorni) {
  return (Number(importo) || 0) * ((Number(tanPct) || 0) / 100) * ((Number(giorni) || 0) / 365);
}
function _calcQuotaCdf(importo, cdfAnno, volAnno) {
  const v = Number(volAnno) || 0;
  if (v <= 0) return 0;
  return Number(cdfAnno) * (Number(importo) / v);
}

// ── HELPER: fattura dal cache anticipi ─────────────────────────────────────
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

// ── LOOKUP CDF GERARCHICO (3 livelli) ──────────────────────────────────────
async function _calcLookupCdfDati(istitutoId, accordato) {
  const annoCorr = new Date().getFullYear();
  let cdfPctAnnua = _CALC_CDF_DEFAULT_PCT_ANNUA;

  try {
    const rvoci = await sb.from('banche_valutazioni_voci')
      .select('cdf_pct_annua, anno')
      .eq('banca_id', istitutoId)
      .eq('tabella', 'cdf')
      .order('anno', { ascending: false })
      .limit(1);
    if (rvoci.data && rvoci.data.length && rvoci.data[0].cdf_pct_annua) {
      cdfPctAnnua = Number(rvoci.data[0].cdf_pct_annua);
    }
  } catch(e) {}

  // 1° storico anno corrente
  try {
    const r1 = await sb.from('banche_valutazioni_periodi')
      .select('cdf_totali, volume_anticipi_lavorato, anno')
      .eq('banca_id', istitutoId).eq('anno', annoCorr).maybeSingle();
    if (r1 && r1.data && Number(r1.data.cdf_totali) > 0 && Number(r1.data.volume_anticipi_lavorato) > 0) {
      return { cdfAnno: Number(r1.data.cdf_totali), volumeAnno: Number(r1.data.volume_anticipi_lavorato),
        fonte: 'storico_corrente', annoStorico: annoCorr, cdfPctAnnua };
    }
  } catch(e) {}

  // 2° storico anno precedente
  try {
    const r2 = await sb.from('banche_valutazioni_periodi')
      .select('cdf_totali, volume_anticipi_lavorato, anno')
      .eq('banca_id', istitutoId).lt('anno', annoCorr)
      .order('anno', { ascending: false }).limit(1);
    if (r2.data && r2.data.length && Number(r2.data[0].cdf_totali) > 0 && Number(r2.data[0].volume_anticipi_lavorato) > 0) {
      return { cdfAnno: Number(r2.data[0].cdf_totali), volumeAnno: Number(r2.data[0].volume_anticipi_lavorato),
        fonte: 'storico_precedente', annoStorico: Number(r2.data[0].anno), cdfPctAnnua };
    }
  } catch(e) {}

  // 3° stima
  const acc = Number(accordato) || 0;
  if (acc <= 0) return { cdfAnno: 0, volumeAnno: 0, fonte: 'nessun_dato', annoStorico: null, cdfPctAnnua };
  const cdfStimato    = acc * (cdfPctAnnua / 100);
  const volumeStimato = acc * (_CALC_UTILIZZO_MEDIO_PCT / 100) * (365 / _CALC_CICLO_MEDIO_GG);
  return { cdfAnno: cdfStimato, volumeAnno: volumeStimato, fonte: 'stima', annoStorico: null, cdfPctAnnua };
}

// ── BADGE FONTE ────────────────────────────────────────────────────────────
function _calcBadgeFonte(fonte, annoStorico) {
  if (fonte === 'storico_corrente')   return '<span style="background:rgba(10,122,58,0.15);color:#0a7a3a;font-size:9.5px;padding:2px 7px;border-radius:4px;font-weight:600;letter-spacing:0.2px">🟢 dato reale ' + annoStorico + '</span>';
  if (fonte === 'storico_precedente') return '<span style="background:rgba(186,117,23,0.15);color:#7a4a0a;font-size:9.5px;padding:2px 7px;border-radius:4px;font-weight:600;letter-spacing:0.2px">🟡 stima da storico ' + annoStorico + '</span>';
  if (fonte === 'stima')              return '<span style="background:rgba(186,117,23,0.15);color:#A03A0A;font-size:9.5px;padding:2px 7px;border-radius:4px;font-weight:600;letter-spacing:0.2px">🟠 stima · utilizzo ' + _CALC_UTILIZZO_MEDIO_PCT + '% × ciclo ' + _CALC_CICLO_MEDIO_GG + 'gg</span>';
  return '<span style="background:rgba(120,120,120,0.15);color:#666;font-size:9.5px;padding:2px 7px;border-radius:4px;font-weight:600;letter-spacing:0.2px">⚪ CDF non disponibile</span>';
}

// ── TOGGLE COLLASSO ────────────────────────────────────────────────────────
function _calcToggleCollapse(key) {
  const body  = document.getElementById('calc-body-' + key);
  const arrow = document.getElementById('calc-arrow-' + key);
  if (!body) return;
  const isCollapsed = body.style.display === 'none';
  body.style.display = isCollapsed ? 'block' : 'none';
  if (arrow) arrow.textContent = isCollapsed ? '▼' : '▶';
  localStorage.setItem('pf-calc-collapsed-' + key, isCollapsed ? '0' : '1');
}

// ════════════════════════════════════════════════════════════════════════════
// PANNELLO COLLASSABILE "SIMULAZIONE COSTO ANTICIPO"
// ════════════════════════════════════════════════════════════════════════════
async function _calcRenderPanelEsempio(istitutoId, tan, istitutoNome, containerId, accordato) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!tan || Number(tan) <= 0) { el.innerHTML = ''; return; }

  const dati = await _calcLookupCdfDati(istitutoId, accordato);
  const importoEsempio = 5000;
  const giorniList = [30, 60, 90];
  const quotaCdfEsempio = _calcQuotaCdf(importoEsempio, dati.cdfAnno, dati.volumeAnno);

  const collapseKey = istitutoId;
  const collapsed = localStorage.getItem('pf-calc-collapsed-' + collapseKey) === '1';
  const arrow = collapsed ? '▶' : '▼';
  const display = collapsed ? 'none' : 'block';

  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;margin-bottom:16px;overflow:hidden">';

  // Header cliccabile
  h += '<div onclick="_calcToggleCollapse(\'' + collapseKey + '\')" style="cursor:pointer;display:flex;justify-content:space-between;align-items:center;gap:10px;padding:12px 16px;background:var(--bg);border-bottom:0.5px solid var(--border);user-select:none">';
  h += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">';
  h += '<span id="calc-arrow-' + collapseKey + '" style="font-size:11px;color:var(--text-muted);min-width:12px">' + arrow + '</span>';
  h += '<span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600">💰 Simulazione costo anticipo</span>';
  h += '<span style="font-size:12px;color:var(--text)">· Esempio fattura €5.000 a ' + (istitutoNome || 'questa banca') + '</span>';
  h += '</div>';
  h += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">';
  h += _calcBadgeFonte(dati.fonte, dati.annoStorico);
  h += '<span style="font-size:11px;color:var(--text-muted)">TAN <b style="color:var(--text);font-family:var(--font-mono)">' + Number(tan).toFixed(3) + '%</b></span>';
  h += '</div>';
  h += '</div>';

  // Body
  h += '<div id="calc-body-' + collapseKey + '" style="display:' + display + ';padding:14px 16px">';

  h += '<table style="width:100%;border-collapse:collapse;font-size:11.5px">';
  h += '<thead><tr style="background:var(--bg)">';
  ['Durata','Interessi (TAN×gg)','Quota CDF','Costo all-in','Per €1.000'].forEach(c => {
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
    h += '<td style="padding:7px 10px;font-family:var(--font-mono);color:#A32D2D">' + fmtE(quotaCdfEsempio) + '</td>';
    h += '<td style="padding:7px 10px;font-family:var(--font-mono);font-weight:700;color:#A32D2D">' + fmtE(totale) + '</td>';
    h += '<td style="padding:7px 10px;font-family:var(--font-mono);font-weight:600">€ ' + perK.toFixed(2) + '</td>';
    h += '</tr>';
  });
  h += '</tbody></table>';

  const costo90per1k = _calcInteressi(1000, tan, 90) + _calcQuotaCdf(1000, dati.cdfAnno, dati.volumeAnno);
  h += '<div style="margin-top:12px;padding:10px 12px;background:var(--bg);border-radius:6px">';
  h += '<div style="font-size:10.5px;color:var(--text-muted);font-weight:600;letter-spacing:0.3px;margin-bottom:6px">SCALA COSTI A 90 GIORNI (proporzionale, all-in)</div>';
  h += '<div style="display:flex;gap:14px;flex-wrap:wrap;font-size:11.5px">';
  [5000, 10000, 20000, 50000, 100000].forEach(m => {
    const c = costo90per1k * m / 1000;
    h += '<div><span style="color:var(--text-muted)">€' + (m/1000) + 'k →</span> <b style="color:#A32D2D;font-family:var(--font-mono)">' + fmtE(c) + '</b></div>';
  });
  h += '</div></div>';

  h += '<div style="margin-top:10px;font-size:10.5px;color:var(--text-muted);font-style:italic;line-height:1.5">';
  if (dati.fonte === 'storico_corrente' || dati.fonte === 'storico_precedente') {
    h += '* Quota CDF = CDF anno ' + dati.annoStorico + ' (' + fmtE(dati.cdfAnno) + ') × importo / volume anticipi ' + dati.annoStorico + ' (' + fmtE(dati.volumeAnno) + '). ';
    h += 'CDF fissa trimestrale sul fido accordato (~' + fmtE(dati.cdfAnno/4) + '/trim). ';
    h += 'Per la singola fattura è la frazione attribuibile pro-quota.';
  } else if (dati.fonte === 'stima') {
    h += '* Quota CDF stimata: fido ' + fmtE(accordato) + ' × ' + dati.cdfPctAnnua.toFixed(3) + '% = ' + fmtE(dati.cdfAnno) + '/anno. ';
    h += 'Volume stimato: fido × ' + _CALC_UTILIZZO_MEDIO_PCT + '% × (365/' + _CALC_CICLO_MEDIO_GG + 'gg) = ' + fmtE(dati.volumeAnno) + '. ';
    h += 'Per il dato reale, importa estratti conto in Banche & Mutui → Valutazioni.';
  } else {
    h += '* CDF non disponibile: nessun dato storico e nessun fido accordato. Popola in Banche & Mutui → Valutazioni.';
  }
  h += '</div>';

  h += '</div></div>';
  el.innerHTML = h;
}

// ════════════════════════════════════════════════════════════════════════════
// POPUP CONFRONTO BANCHE PER SINGOLA FATTURA
// ════════════════════════════════════════════════════════════════════════════
async function _calcOpenPopupCosto(fatturaId, affidamentoCorrenteId) {
  const lookup = _calcGetFatturaFromCache(fatturaId);
  if (!lookup) { alert('Fattura non trovata.'); return; }
  const f = lookup.fattura;
  const affCorr = (_bancheAffidamenti || []).find(a => a.id === affidamentoCorrenteId);
  const istitutoCorrenteId = affCorr ? affCorr.istituto_id : null;

  const importoAnticipato = Number(f.importo_anticipato_calcolato) || (Number(f.totale_fattura) * 0.80);
  const numero  = f.numero_fattura || '—';
  const cliente = f.cliente_nome || '—';

  const tanPerBanca = {};
  const accPerBanca = {};
  (_bancheAffidamenti || []).forEach(af => {
    const tipoOk = !af.tipo || ['sbf','anticipo_fatture','castelletto','autoliquidante'].includes(af.tipo);
    const statoOk = !af.stato || af.stato === 'attivo';
    if (tipoOk && statoOk && af.tasso && af.istituto_id) {
      if (!tanPerBanca[af.istituto_id] || Number(af.tasso) < Number(tanPerBanca[af.istituto_id])) {
        tanPerBanca[af.istituto_id] = Number(af.tasso);
        accPerBanca[af.istituto_id] = Number(af.importo_accordato) || 0;
      }
    }
  });

  const banche = (_bancheIstituti || []).slice()
    .sort((a, b) => _priorityBancaIstituto(a.nome) - _priorityBancaIstituto(b.nome))
    .filter(b => tanPerBanca[b.id]);
  if (!banche.length) { alert('Nessuna banca con TAN configurato in Affidamenti.'); return; }

  const datiBanche = await Promise.all(banche.map(async b => {
    const tan = tanPerBanca[b.id];
    const dati = await _calcLookupCdfDati(b.id, accPerBanca[b.id]);
    return {
      banca: b, tan, accordato: accPerBanca[b.id],
      cdfAnno: dati.cdfAnno, volAnno: dati.volumeAnno,
      fonte: dati.fonte, annoStorico: dati.annoStorico,
      interessi30: _calcInteressi(importoAnticipato, tan, 30),
      interessi60: _calcInteressi(importoAnticipato, tan, 60),
      interessi90: _calcInteressi(importoAnticipato, tan, 90),
      quotaCdf:    _calcQuotaCdf(importoAnticipato, dati.cdfAnno, dati.volumeAnno),
      isCurrente:  b.id === istitutoCorrenteId
    };
  }));

  const allIn60 = datiBanche.map(d => d.interessi60 + d.quotaCdf);
  const minCosto = Math.min.apply(null, allIn60);
  const maxCosto = Math.max.apply(null, allIn60);

  const oldModal = document.getElementById('calc-modal');
  if (oldModal) oldModal.remove();
  const modal = document.createElement('div');
  modal.id = 'calc-modal';
  modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.6);z-index:9999;display:flex;justify-content:center;align-items:flex-start;padding:40px 20px;overflow-y:auto';

  let h = '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:12px;padding:24px;width:100%;max-width:980px;max-height:calc(100vh - 80px);overflow-y:auto;position:relative">';
  h += '<button onclick="_calcCloseModal()" style="position:absolute;top:14px;right:14px;background:transparent;border:0;font-size:22px;cursor:pointer;color:var(--text-muted)" title="Chiudi">×</button>';
  h += '<div style="font-size:16px;font-weight:700;margin-bottom:4px">💰 Costo anticipo per istituto</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:18px">Fattura <b style="color:var(--text);font-family:var(--font-mono)">' + (numero || '—') + '</b> · ' + (cliente || '—') + ' · importo anticipato <b style="color:#26215C;font-family:var(--font-mono)">' + fmtE(importoAnticipato) + '</b></div>';

  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px;margin-bottom:14px">';
  datiBanche.forEach(d => {
    const totale60 = d.interessi60 + d.quotaCdf;
    const isMigliore = (Math.abs(totale60 - minCosto) < 0.01 && datiBanche.length > 1);
    const isPeggiore = (Math.abs(totale60 - maxCosto) < 0.01 && datiBanche.length > 1 && minCosto !== maxCosto);
    const borderColor = isMigliore ? '#0a7a3a' : (isPeggiore ? '#A32D2D' : (d.isCurrente ? '#26215C' : 'var(--border)'));
    const bgColor = isMigliore ? 'rgba(10,122,58,0.06)' : (d.isCurrente ? 'rgba(38,33,92,0.04)' : 'var(--bg)');
    h += '<div style="background:' + bgColor + ';border:1px solid ' + borderColor + ';border-radius:8px;padding:12px">';
    h += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px;gap:6px;flex-wrap:wrap">';
    h += '<div style="font-size:12.5px;font-weight:700">' + (d.banca.nome || '') + '</div>';
    if (isMigliore)        h += '<span style="background:#0a7a3a;color:#fff;font-size:8.5px;padding:2px 6px;border-radius:4px;font-weight:700;letter-spacing:0.3px">PIÙ CONVENIENTE</span>';
    else if (isPeggiore)   h += '<span style="background:#A32D2D;color:#fff;font-size:8.5px;padding:2px 6px;border-radius:4px;font-weight:700;letter-spacing:0.3px">MENO CONVENIENTE</span>';
    else if (d.isCurrente) h += '<span style="background:#26215C;color:#fff;font-size:8.5px;padding:2px 6px;border-radius:4px;font-weight:700;letter-spacing:0.3px">CORRENTE</span>';
    h += '</div>';
    h += '<div style="margin-bottom:6px">' + _calcBadgeFonte(d.fonte, d.annoStorico) + '</div>';
    h += '<div style="font-size:10.5px;color:var(--text-muted);margin-bottom:8px">TAN <b style="color:var(--text);font-family:var(--font-mono)">' + d.tan.toFixed(3) + '%</b></div>';
    h += '<table style="width:100%;font-size:11px;border-collapse:collapse">';
    [['30 gg', d.interessi30], ['60 gg', d.interessi60], ['90 gg', d.interessi90]].forEach(arr => {
      h += '<tr><td style="padding:3px 0;color:var(--text-muted)">Interessi ' + arr[0] + '</td><td style="padding:3px 0;text-align:right;font-family:var(--font-mono);color:#A32D2D">' + fmtE(arr[1]) + '</td></tr>';
    });
    h += '<tr style="border-top:0.5px dashed var(--border)"><td style="padding:5px 0 3px;font-size:10.5px;color:var(--text-muted)">Quota CDF*</td><td style="padding:5px 0 3px;text-align:right;font-family:var(--font-mono);color:#A32D2D;font-size:10.5px">' + fmtE(d.quotaCdf) + '</td></tr>';
    h += '<tr style="border-top:1px solid var(--border)"><td style="padding:5px 0 0;font-size:11px;font-weight:700">► all-in 60gg</td><td style="padding:5px 0 0;text-align:right;font-family:var(--font-mono);font-weight:700;color:#A32D2D">' + fmtE(totale60) + '</td></tr>';
    h += '</table></div>';
  });
  h += '</div>';

  if (datiBanche.length > 1 && (maxCosto - minCosto) > 0.01) {
    h += '<div style="background:rgba(10,122,58,0.08);border-left:3px solid #0a7a3a;padding:10px 14px;border-radius:0 6px 6px 0;font-size:12px;margin-bottom:14px">';
    h += '💡 Risparmio stimato a 60gg spostando questa fattura dalla banca meno conveniente alla più conveniente: <b>' + fmtE(maxCosto - minCosto) + '</b>.';
    h += '</div>';
  }

  h += '<div style="font-size:10.5px;color:var(--text-muted);font-style:italic;padding:10px 12px;background:var(--bg);border-radius:6px;line-height:1.55">';
  h += '<b>Note:</b> Interessi = <code style="background:rgba(0,0,0,0.05);padding:1px 4px;border-radius:3px">importo × TAN × giorni / 365</code>. ';
  h += 'La <b>Quota CDF</b> è la frazione attribuibile pro-quota al volume medio presentato. Provenienza dati indicata da badge: ';
  h += '🟢 storico anno corrente · 🟡 storico anno precedente · 🟠 stima (utilizzo ' + _CALC_UTILIZZO_MEDIO_PCT + '% del fido, ciclo ' + _CALC_CICLO_MEDIO_GG + 'gg). ';
  h += 'Per dati reali, importa estratti conto in Banche & Mutui → Valutazioni.';
  h += '</div>';

  h += '</div>';
  modal.innerHTML = h;
  document.body.appendChild(modal);
}

function _calcCloseModal() {
  const m = document.getElementById('calc-modal');
  if (m) m.remove();
}
