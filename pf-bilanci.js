// PhoenixFuel — Finanze: Analisi Bilanci
// v20260802b — canvas dentro riquadri di altezza fissa: i grafici si
//              allungavano senza fine
// v20260802a — sezione di sola consultazione sui bilanci depositati.
//              I dati stanno in `bilanci_annuali`, un record per esercizio,
//              caricati con SQL una volta l'anno. Gli INDICI non si salvano:
//              si calcolano qui, cosi restano coerenti con le formule e non
//              possono restare indietro rispetto ai dati.
//              Grafici in Chart.js, come tutto il resto del programma.

var _bilDati = [];        // esercizi ordinati per anno
var _bilAnnoSel = null;   // anno mostrato, oppure 'confronto'
var _bilCharts = {};      // grafici vivi, da distruggere prima di ridisegnare

// ═══ CALCOLO DEGLI INDICI ══════════════════════════════════════════
// Un solo posto: la pagina, i semafori e il confronto leggono di qui.
function _bilIndici(d) {
  var n = function (v) { return Number(v || 0); };
  var ebitda = n(d.mol_ab) + n(d.ammortamenti);
  var attivoCorr = n(d.rimanenze) + n(d.cred_clienti) + n(d.cred_tributari)
                 + n(d.cred_altri) + n(d.att_finanziarie) + n(d.disp_liquide);
  var passivoCorr = n(d.deb_banche_entro) + n(d.deb_fornitori) + n(d.deb_tributari)
                  + n(d.deb_previdenziali) + n(d.altri_debiti);
  var totDebiti = passivoCorr + n(d.deb_banche_oltre);
  var pfn = n(d.deb_banche_entro) + n(d.deb_banche_oltre) - n(d.disp_liquide) - n(d.att_finanziarie);
  return {
    ebitda: ebitda,
    ebitda_pct: n(d.valore_produzione) ? ebitda / n(d.valore_produzione) * 100 : 0,
    margine_lordo: n(d.fatturato) - n(d.costo_merci),
    margine_lordo_pct: n(d.fatturato) ? (n(d.fatturato) - n(d.costo_merci)) / n(d.fatturato) * 100 : 0,
    pfn: pfn,
    pfn_ebitda: ebitda ? pfn / ebitda : 0,
    current_ratio: passivoCorr ? attivoCorr / passivoCorr : 0,
    tot_debiti: totDebiti,
    leverage: n(d.patrimonio_netto) ? totDebiti / n(d.patrimonio_netto) : 0,
    indip_fin: n(d.totale_attivo) ? n(d.patrimonio_netto) / n(d.totale_attivo) * 100 : 0,
    dso: n(d.fatturato) ? n(d.cred_clienti) / n(d.fatturato) * 365 : 0,
    dpo: n(d.costo_merci) ? n(d.deb_fornitori) / n(d.costo_merci) * 365 : 0,
    roe: n(d.patrimonio_netto) ? n(d.utile_netto) / n(d.patrimonio_netto) * 100 : 0,
    roi: n(d.totale_attivo) ? n(d.mol_ab) / n(d.totale_attivo) * 100 : 0,
    ros: n(d.fatturato) ? n(d.utile_netto) / n(d.fatturato) * 100 : 0,
    on_fin_ebitda: ebitda ? n(d.oneri_finanziari) / ebitda * 100 : 0
  };
}

// Soglie concordate con Rinaldo: sono quelle che guarda una banca.
function _bilSemaforo(chiave, v) {
  var R = { col: '#A32D2D', bg: '#FCEBEB', lab: 'critico' };
  var G = { col: '#854F0B', bg: '#FAEEDA', lab: 'da tenere d\u2019occhio' };
  var V = { col: '#27500A', bg: '#EAF3DE', lab: 'buono' };
  switch (chiave) {
    case 'pfn_ebitda':    return v > 5 ? R : (v >= 4 ? G : V);
    case 'on_fin_ebitda': return v > 40 ? R : (v >= 30 ? G : V);
    case 'current_ratio': return v < 1 ? R : (v <= 1.2 ? G : V);
    case 'leverage':      return v > 10 ? R : (v >= 5 ? G : V);
    case 'dso':           return v > 90 ? R : (v >= 70 ? G : V);
    case 'roe':           return v < 5 ? R : (v <= 10 ? G : V);
    default:              return V;
  }
}

function _bilNum(v, dec) {
  var d = (dec === undefined) ? 0 : dec;
  return Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function _bilEuro(v) { return '\u20ac ' + _bilNum(v); }

// ═══ CARICAMENTO ═══════════════════════════════════════════════════
async function caricaAnalisiBilanci() {
  var cont = document.getElementById('bil-content');
  if (!cont) return;
  if (_bilDati.length) { _bilRender(); return; }

  cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted)">\u23f3 Caricamento bilanci...</div>';
  var r = await sb.from('bilanci_annuali').select('*').order('esercizio');
  if (r.error) {
    cont.innerHTML = '<div style="padding:24px;text-align:center;color:#A32D2D;font-size:13px">'
      + 'Non riesco a leggere i bilanci: ' + esc(r.error.message) + '</div>';
    return;
  }
  _bilDati = r.data || [];
  if (!_bilDati.length) {
    cont.innerHTML = '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">'
      + 'Nessun bilancio caricato.<br><span style="font-size:12px">I bilanci si inseriscono una volta l\u2019anno, a deposito avvenuto.</span></div>';
    return;
  }
  _bilAnnoSel = _bilDati[_bilDati.length - 1].esercizio;
  _bilRender();
}

function _bilDistruggiGrafici() {
  Object.keys(_bilCharts).forEach(function (k) {
    try { _bilCharts[k].destroy(); } catch (e) {}
  });
  _bilCharts = {};
}

// ═══ RENDER ════════════════════════════════════════════════════════
function _bilRender() {
  var cont = document.getElementById('bil-content');
  if (!cont) return;
  _bilDistruggiGrafici();

  var h = '<div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">';
  _bilDati.forEach(function (d) {
    var att = (_bilAnnoSel === d.esercizio);
    h += '<button onclick="_bilVai(' + d.esercizio + ')" style="font-size:12px;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;'
      + (att ? 'background:#26215C;color:#fff;border:0.5px solid #26215C' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">' + d.esercizio + '</button>';
  });
  if (_bilDati.length > 1) {
    var attC = (_bilAnnoSel === 'confronto');
    h += '<button onclick="_bilVai(\'confronto\')" style="font-size:12px;padding:8px 16px;border-radius:6px;cursor:pointer;font-weight:600;'
      + (attC ? 'background:#26215C;color:#fff;border:0.5px solid #26215C' : 'background:var(--bg);color:var(--text);border:0.5px solid var(--border)') + '">Confronto</button>';
  }
  h += '</div>';

  h += (_bilAnnoSel === 'confronto') ? _bilRenderConfronto() : _bilRenderAnno(_bilAnnoSel);
  cont.innerHTML = h;

  // I grafici si disegnano dopo che l'html e nel DOM
  setTimeout(function () {
    if (_bilAnnoSel === 'confronto') _bilGraficiConfronto();
    else _bilGraficiAnno(_bilAnnoSel);
  }, 30);
}

function _bilVai(chi) { _bilAnnoSel = chi; _bilRender(); }

function _bilTrova(anno) {
  return _bilDati.filter(function (d) { return d.esercizio === anno; })[0];
}

function _bilCardKpi(label, valore, sotto, colore) {
  return '<div style="flex:1;min-width:150px;background:var(--bg-kpi);border-radius:10px;padding:14px 16px">'
    + '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px">' + label + '</div>'
    + '<div style="font-size:20px;font-weight:700;font-family:var(--font-mono);margin-top:4px' + (colore ? ';color:' + colore : '') + '">' + valore + '</div>'
    + (sotto ? '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + sotto + '</div>' : '')
    + '</div>';
}

function _bilRenderAnno(anno) {
  var d = _bilTrova(anno);
  if (!d) return '<div style="padding:20px;color:var(--text-muted)">Esercizio non trovato.</div>';
  var i = _bilIndici(d);

  var h = '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">';
  h += _bilCardKpi('Fatturato', _bilEuro(d.fatturato), 'margine lordo ' + _bilNum(i.margine_lordo_pct, 2) + '%');
  h += _bilCardKpi('EBITDA', _bilEuro(i.ebitda), _bilNum(i.ebitda_pct, 2) + '% del valore produzione');
  h += _bilCardKpi('Utile netto', _bilEuro(d.utile_netto), 'ROS ' + _bilNum(i.ros, 2) + '%',
        Number(d.utile_netto) >= 0 ? '#27500A' : '#A32D2D');
  h += _bilCardKpi('Patrimonio netto', _bilEuro(d.patrimonio_netto), 'indipendenza ' + _bilNum(i.indip_fin, 2) + '%');
  h += '</div>';

  h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">';
  h += '<div style="flex:2;min-width:300px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:14px">'
     + '<div style="font-size:12px;font-weight:600;margin-bottom:8px">Dalla vendita all\u2019utile</div>'
     + '<div style="position:relative;height:210px"><canvas id="bil-ch-redd"></canvas></div></div>';
  h += '<div style="flex:1;min-width:230px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:14px">'
     + '<div style="font-size:12px;font-weight:600;margin-bottom:8px">Come e finanziata l\u2019azienda</div>'
     + '<div style="position:relative;height:210px"><canvas id="bil-ch-strut"></canvas></div></div>';
  h += '</div>';

  var sem = [
    ['PFN / EBITDA', 'pfn_ebitda', _bilNum(i.pfn_ebitda, 2) + 'x', 'quanti anni di EBITDA per estinguere i debiti'],
    ['Oneri fin. / EBITDA', 'on_fin_ebitda', _bilNum(i.on_fin_ebitda, 1) + '%', 'quanta parte del margine se ne vanno in interessi'],
    ['Current ratio', 'current_ratio', _bilNum(i.current_ratio, 2), 'attivo corrente su passivo corrente'],
    ['Leverage D/E', 'leverage', _bilNum(i.leverage, 2) + 'x', 'debiti rispetto al patrimonio'],
    ['DSO', 'dso', Math.round(i.dso) + ' gg', 'giorni medi di incasso dai clienti'],
    ['ROE', 'roe', _bilNum(i.roe, 2) + '%', 'rendimento del patrimonio']
  ];
  h += '<div style="font-size:12px;font-weight:600;margin-bottom:8px">Come ci legge una banca</div>';
  h += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">';
  sem.forEach(function (s) {
    var v = i[s[1]];
    var c = _bilSemaforo(s[1], v);
    h += '<div style="flex:1;min-width:165px;background:' + c.bg + ';border-radius:10px;padding:12px 14px">'
      + '<div style="font-size:11px;color:' + c.col + ';font-weight:600">' + s[0] + '</div>'
      + '<div style="font-size:19px;font-weight:700;font-family:var(--font-mono);color:' + c.col + ';margin-top:2px">' + s[2] + '</div>'
      + '<div style="font-size:10px;color:' + c.col + ';opacity:0.85;margin-top:3px">' + c.lab + ' \u00b7 ' + s[3] + '</div>'
      + '</div>';
  });
  h += '</div>';

  h += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:14px;margin-bottom:16px">'
     + '<div style="font-size:12px;font-weight:600;margin-bottom:8px">Di cosa sono fatti i debiti verso le banche \u00b7 totale ' + _bilEuro(d.deb_banche_tot) + '</div>'
     + '<div style="position:relative;height:170px"><canvas id="bil-ch-deb"></canvas></div></div>';

  if (d.flusso_operativo !== null && d.flusso_operativo !== undefined) {
    h += '<div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:16px">';
    h += _bilCardKpi('Flusso operativo', _bilEuro(d.flusso_operativo), 'cassa generata dalla gestione',
          Number(d.flusso_operativo) >= 0 ? '#27500A' : '#A32D2D');
    h += _bilCardKpi('Investimenti', _bilEuro(d.flusso_investimenti), '');
    h += _bilCardKpi('Finanziamenti', _bilEuro(d.flusso_finanziamenti), '');
    h += _bilCardKpi('Variazione liquidita', _bilEuro(d.var_disponibilita), '',
          Number(d.var_disponibilita) >= 0 ? '#27500A' : '#A32D2D');
    h += '</div>';
  }

  h += '<div style="font-size:11px;color:var(--text-muted)">Dati dal bilancio depositato. Gli indici sono calcolati dalla pagina, non salvati: cambiano da soli se si correggono i dati.</div>';
  return h;
}

function _bilRenderConfronto() {
  var a = _bilDati[_bilDati.length - 2], b = _bilDati[_bilDati.length - 1];
  var ia = _bilIndici(a), ib = _bilIndici(b);

  var voci = [
    ['Fatturato', a.fatturato, b.fatturato, 'euro', 1],
    ['EBITDA', ia.ebitda, ib.ebitda, 'euro', 1],
    ['Utile netto', a.utile_netto, b.utile_netto, 'euro', 1],
    ['Patrimonio netto', a.patrimonio_netto, b.patrimonio_netto, 'euro', 1],
    ['PFN / EBITDA', ia.pfn_ebitda, ib.pfn_ebitda, 'x', -1],
    ['Leverage D/E', ia.leverage, ib.leverage, 'x', -1],
    ['Debiti verso banche', a.deb_banche_tot, b.deb_banche_tot, 'euro', -1],
    ['DSO', ia.dso, ib.dso, 'gg', -1]
  ];

  var h = '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">';
  voci.forEach(function (v) {
    var prima = Number(v[1]), dopo = Number(v[2]);
    var delta = dopo - prima;
    var pct = prima ? (delta / Math.abs(prima) * 100) : 0;
    var meglio = (delta * v[4]) >= 0;
    var col = Math.abs(delta) < 0.0001 ? 'var(--text-muted)' : (meglio ? '#27500A' : '#A32D2D');
    var freccia = delta > 0 ? '\u25b2' : (delta < 0 ? '\u25bc' : '\u2013');
    var fmt = function (x) {
      return v[3] === 'euro' ? _bilEuro(x) : (v[3] === 'x' ? _bilNum(x, 2) + 'x' : Math.round(x) + ' gg');
    };
    h += '<div style="flex:1;min-width:170px;background:var(--bg-kpi);border-radius:10px;padding:12px 14px">'
      + '<div style="font-size:11px;color:var(--text-muted)">' + v[0] + '</div>'
      + '<div style="font-size:17px;font-weight:700;font-family:var(--font-mono);margin-top:3px">' + fmt(dopo) + '</div>'
      + '<div style="font-size:11px;color:' + col + ';font-weight:600;margin-top:2px">' + freccia + ' ' + _bilNum(Math.abs(pct), 1) + '% \u00b7 da ' + fmt(prima) + '</div>'
      + '</div>';
  });
  h += '</div>';

  h += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  h += '<div style="flex:1;min-width:290px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:14px">'
     + '<div style="font-size:12px;font-weight:600;margin-bottom:8px">Redditivita \u00b7 ' + a.esercizio + ' contro ' + b.esercizio + '</div>'
     + '<div style="position:relative;height:220px"><canvas id="bil-ch-cfr-redd"></canvas></div></div>';
  h += '<div style="flex:1;min-width:290px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:14px">'
     + '<div style="font-size:12px;font-weight:600;margin-bottom:8px">Stato patrimoniale</div>'
     + '<div style="position:relative;height:220px"><canvas id="bil-ch-cfr-sp"></canvas></div></div>';
  h += '</div>';

  h += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px;padding:14px;margin-top:12px">'
     + '<div style="font-size:12px;font-weight:600;margin-bottom:8px">Indicatori bancari</div>'
     + '<div style="position:relative;height:190px"><canvas id="bil-ch-cfr-ind"></canvas></div></div>';
  return h;
}

// ═══ GRAFICI ═══════════════════════════════════════════════════════
function _bilCtx(id) {
  var el = document.getElementById(id);
  return el ? el.getContext('2d') : null;
}
var _BIL_COL = ['#26215C', '#639922', '#BA7517', '#A32D2D', '#3C3489', '#0C447C'];

// I canvas stanno dentro riquadri di altezza fissa: con maintainAspectRatio
// a false Chart.js ignora l attributo height e, se il contenitore non ha una
// altezza propria, il grafico si allunga senza fine a ogni ridisegno.
function _bilOpz(extra) {
  var base = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#9b9b9b', font: { size: 11 } } } },
    scales: {
      x: { ticks: { color: '#9b9b9b', font: { size: 10 } }, grid: { display: false } },
      y: { ticks: { color: '#9b9b9b', font: { size: 10 } }, grid: { color: 'rgba(150,150,150,0.15)' } }
    }
  };
  if (extra) Object.keys(extra).forEach(function (k) { base[k] = extra[k]; });
  return base;
}

function _bilGraficiAnno(anno) {
  var d = _bilTrova(anno);
  if (!d || typeof Chart === 'undefined') return;
  var i = _bilIndici(d);

  var c1 = _bilCtx('bil-ch-redd');
  if (c1) {
    _bilCharts.redd = new Chart(c1, {
      type: 'bar',
      data: {
        labels: ['Fatturato', 'Margine lordo', 'EBITDA', 'Utile netto'],
        datasets: [{ label: '\u20ac', data: [d.fatturato, i.margine_lordo, i.ebitda, d.utile_netto],
          backgroundColor: _BIL_COL, maxBarThickness: 46 }]
      },
      options: _bilOpz({ plugins: { legend: { display: false } } })
    });
  }

  var c2 = _bilCtx('bil-ch-strut');
  if (c2) {
    _bilCharts.strut = new Chart(c2, {
      type: 'doughnut',
      data: {
        labels: ['Patrimonio netto', 'Debiti banche', 'Debiti fornitori', 'Altri debiti'],
        datasets: [{ data: [d.patrimonio_netto, d.deb_banche_tot, d.deb_fornitori,
            Number(d.deb_tributari || 0) + Number(d.deb_previdenziali || 0) + Number(d.altri_debiti || 0)],
          backgroundColor: _BIL_COL }]
      },
      options: { responsive: true, maintainAspectRatio: false, scales: {},
        plugins: { legend: { position: 'bottom', labels: { color: '#9b9b9b', font: { size: 10 }, boxWidth: 12 } } } }
    });
  }

  var c3 = _bilCtx('bil-ch-deb');
  if (c3) {
    _bilCharts.deb = new Chart(c3, {
      type: 'bar',
      data: {
        labels: ['Anticipi fatture', 'Quote mutui entro l\u2019anno', 'Conti correnti', 'Mutui oltre l\u2019anno'],
        datasets: [{ label: '\u20ac', data: [d.anticipi_fatt, d.quote_cap_entro, d.cc_bancari, d.mutui_mlt_oltre],
          backgroundColor: _BIL_COL, maxBarThickness: 26 }]
      },
      options: _bilOpz({ indexAxis: 'y', plugins: { legend: { display: false } } })
    });
  }
}

function _bilGraficiConfronto() {
  if (typeof Chart === 'undefined' || _bilDati.length < 2) return;
  var a = _bilDati[_bilDati.length - 2], b = _bilDati[_bilDati.length - 1];
  var ia = _bilIndici(a), ib = _bilIndici(b);
  var due = function (etichette, va, vb) {
    return { labels: etichette,
      datasets: [{ label: String(a.esercizio), data: va, backgroundColor: '#8E8CA8', maxBarThickness: 30 },
                 { label: String(b.esercizio), data: vb, backgroundColor: '#26215C', maxBarThickness: 30 }] };
  };

  var c1 = _bilCtx('bil-ch-cfr-redd');
  if (c1) _bilCharts.cfrRedd = new Chart(c1, {
    type: 'bar',
    data: due(['Fatturato', 'Margine lordo', 'EBITDA', 'Utile netto'],
      [a.fatturato, ia.margine_lordo, ia.ebitda, a.utile_netto],
      [b.fatturato, ib.margine_lordo, ib.ebitda, b.utile_netto]),
    options: _bilOpz()
  });

  var c2 = _bilCtx('bil-ch-cfr-sp');
  if (c2) _bilCharts.cfrSp = new Chart(c2, {
    type: 'bar',
    data: due(['Attivo', 'Patrimonio netto', 'Crediti clienti', 'Debiti banche', 'Debiti fornitori'],
      [a.totale_attivo, a.patrimonio_netto, a.cred_clienti, a.deb_banche_tot, a.deb_fornitori],
      [b.totale_attivo, b.patrimonio_netto, b.cred_clienti, b.deb_banche_tot, b.deb_fornitori]),
    options: _bilOpz()
  });

  var c3 = _bilCtx('bil-ch-cfr-ind');
  if (c3) _bilCharts.cfrInd = new Chart(c3, {
    type: 'bar',
    data: due(['PFN/EBITDA', 'Leverage D/E', 'Current ratio', 'Oneri fin./EBITDA %', 'ROE %', 'DSO gg'],
      [ia.pfn_ebitda, ia.leverage, ia.current_ratio, ia.on_fin_ebitda, ia.roe, ia.dso],
      [ib.pfn_ebitda, ib.leverage, ib.current_ratio, ib.on_fin_ebitda, ib.roe, ib.dso]),
    options: _bilOpz()
  });
}
