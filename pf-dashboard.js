// PhoenixFuel — Dashboard, Cockpit, Grafici, Alert
// ── DASHBOARD ─────────────────────────────────────────────────────
// Colori prodotto (Gasolio Autotrazione = giallo)
const COLORI_DASH = {
  'Gasolio Autotrazione': { bg:'#FDF3D0', color:'#7A5D00', bar:'#D4A017', dot:'#D4A017' },
  'Benzina':              { bg:'#E6F1FB', color:'#0C447C', bar:'#378ADD', dot:'#378ADD' },
  'Gasolio Agricolo':     { bg:'#EAF3DE', color:'#27500A', bar:'#639922', dot:'#639922' },
  'HVO':                  { bg:'#E1F5EE', color:'#085041', bar:'#3B6D11', dot:'#3B6D11' }
};

async function caricaDashboard() {
  var ieri = new Date(oggi); ieri.setDate(ieri.getDate()-1);
  var ieriISO = ieri.toISOString().split('T')[0];
  var meseInizio = oggiISO.substring(0,8) + '01';
  var ieri2 = new Date(ieri); ieri2.setDate(ieri2.getDate()-1);
  var ieri2ISO = ieri2.toISOString().split('T')[0];

  // ══ CARICAMENTO PARALLELO INIZIALE ══
  var [ordIeriRes, costiIeriRes, ordMeseRes, recRes, lettIeriRes, lettIeri2Res, prezziIeriRes, lettMeseRes, pompeRes, prezziMeseRes] = await Promise.all([
    sb.from('ordini').select('*').eq('data', ieriISO),
    sb.from('stazione_costi').select('prodotto,costo_litro').eq('data', ieriISO),
    sb.from('ordini').select('litri,costo_litro,trasporto_litro,margine,iva,tipo_ordine,stato').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data', meseInizio).lte('data', oggiISO).limit(1000),
    sb.from('ordini').select('*').order('created_at',{ascending:false}).limit(5),
    sb.from('stazione_letture').select('pompa_id,lettura').eq('data', ieriISO),
    sb.from('stazione_letture').select('pompa_id,lettura').eq('data', ieri2ISO),
    sb.from('stazione_prezzi').select('prodotto,prezzo_litro').eq('data', ieriISO),
    sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', meseInizio).lte('data', ieriISO).order('data').limit(5000),
    sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true),
    sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', meseInizio).lte('data', ieriISO)
  ]);

  // ══ INGROSSO IERI ══
  var data = ordIeriRes.data;
  const ingrosso = (data||[]).filter(r => r.tipo_ordine === 'cliente' && r.stato !== 'annullato');
  let fatturato=0,litri=0,margine=0;
  ingrosso.forEach(r=>{fatturato+=prezzoNoIva(r)*r.litri;litri+=Number(r.litri);margine+=Number(r.margine)*Number(r.litri);});
  document.getElementById('kpi-fatturato').textContent=fmtE(fatturato);
  document.getElementById('kpi-litri').textContent=fmtL(litri);
  // Margine ieri = totale (€), non più medio €/L
  document.getElementById('kpi-margine').textContent= ingrosso.length ? fmtE(margine) : '—';
  document.getElementById('kpi-ordini').textContent=ingrosso.length;

  // MARGINE IERI STAZIONE
  var costiIeriMap = {}; (costiIeriRes.data||[]).forEach(c => { costiIeriMap[c.prodotto] = Number(c.costo_litro); });

  // ══ DETTAGLIO STAZIONE IERI ══
  try {
    const pompe = pompeRes.data;
    const pompeMap = {}; (pompe||[]).forEach(p => { pompeMap[p.id] = p; });
    const prezziMap = {}; (prezziIeriRes.data||[]).forEach(p => { prezziMap[p.prodotto] = Number(p.prezzo_litro); });
    const lettIeri2Map = {}; (lettIeri2Res.data||[]).forEach(l => { lettIeri2Map[l.pompa_id] = Number(l.lettura); });

    let dettLitri=0, dettIncasso=0, dettCosto=0;
    (lettIeriRes.data||[]).forEach(l => {
      const prec = lettIeri2Map[l.pompa_id];
      if (prec === undefined) return;
      const lv = Number(l.lettura) - prec; if (lv <= 0) return;
      const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
      dettLitri += lv;
      dettIncasso += lv * (prezziMap[pompa.prodotto] || 0);
      dettCosto += lv * (costiIeriMap[pompa.prodotto] || 0);
    });
    document.getElementById('kpi-dett-incasso').textContent = fmtE(dettIncasso);
    document.getElementById('kpi-dett-litri').textContent = fmtL(dettLitri);
    var margIeri = (dettIncasso / 1.22) - dettCosto;
    var elMarg = document.getElementById('kpi-dett-margine');
    if (elMarg) {
      elMarg.textContent = dettCosto > 0 ? fmtE(margIeri) : '—';
      elMarg.style.color = margIeri >= 0 ? '#639922' : '#E24B4A';
    }
    var elMargL = document.getElementById('kpi-dett-marg-litro');
    if (elMargL) {
      elMargL.textContent = (dettCosto > 0 && dettLitri > 0) ? '€ ' + (margIeri/dettLitri).toFixed(4) + '/L' : '—';
      elMargL.style.color = margIeri >= 0 ? '#639922' : '#E24B4A';
    }
  } catch(e) {
    console.error('Errore KPI stazione ieri:', e);
  }

  // ══ COCKPIT MESE: ingrosso + stazione + carichi pianificati + alert + giacenze ══
  await Promise.all([
    caricaGiacenzaDashboard(),
    caricaGiacenzaStazioneDashboard(),
    caricaGraficiDashboard(),
    caricaCockpit(),
    caricaCockpitStazione(),
    caricaAlertOperativi(),
    caricaCarichiDashboard()
  ]);
  if (typeof caricaAlertFutures === 'function') caricaAlertFutures();
}

async function caricaGiacenzaDashboard() {
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','deposito_vibo');
  const wrap = document.getElementById('dash-giacenza');
  if (!wrap) return;
  if (!cisterne || !cisterne.length) { wrap.innerHTML = '<div class="loading">Nessuna cisterna configurata</div>'; return; }
  // Allineamento pfData
  try {
    if (typeof pfData !== 'undefined' && pfData.getGiacenzaAllaData) {
      var oggiISODash = new Date().toISOString().split('T')[0];
      var prodottiUnici = [...new Set(cisterne.map(function(c) { return c.prodotto; }))];
      for (var pi = 0; pi < prodottiUnici.length; pi++) {
        var prod = prodottiUnici[pi];
        var giac = await pfData.getGiacenzaAllaData('deposito_vibo', prod, oggiISODash);
        var calcTot = giac.calcolata;
        var cisDelProd = cisterne.filter(function(c) { return c.prodotto === prod; });
        var sommaDb = cisDelProd.reduce(function(s,c) { return s + Number(c.livello_attuale || 0); }, 0);
        if (sommaDb > 0) {
          cisDelProd.forEach(function(c) {
            var quota = Number(c.livello_attuale || 0) / sommaDb;
            c.livello_attuale = Math.round(calcTot * quota);
          });
        } else if (cisDelProd.length > 0) {
          var quotaEqua = Math.round(calcTot / cisDelProd.length);
          cisDelProd.forEach(function(c) { c.livello_attuale = quotaEqua; });
        }
      }
    }
  } catch (e) {
    console.warn('[caricaGiacenzaDashboard] pfData fallito:', e);
  }
  const prodottiOrdine = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO'];
  const perProdotto = {};
  cisterne.forEach(c => {
    const prod = c.prodotto || 'Altro';
    if (!perProdotto[prod]) perProdotto[prod] = { livello:0, capacita:0 };
    perProdotto[prod].livello += Number(c.livello_attuale || 0);
    perProdotto[prod].capacita += Number(c.capacita_max || 0);
  });
  let html = '';
  prodottiOrdine.forEach(prod => {
    const d = perProdotto[prod];
    if (!d) return;
    const pct = d.capacita > 0 ? Math.round((d.livello / d.capacita) * 100) : 0;
    const col = COLORI_DASH[prod] || { bg:'var(--bg-kpi)', color:'var(--text)', bar:'#888', dot:'#888' };
    const barColor = pct < 20 ? '#E24B4A' : pct < 40 ? '#BA7517' : col.bar;
    html += '<div style="background:' + col.bg + ';border-radius:var(--radius);padding:14px 16px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><div style="width:8px;height:8px;border-radius:50%;background:' + col.dot + '"></div><span style="font-size:10px;color:' + col.color + ';text-transform:uppercase;letter-spacing:0.6px;font-weight:500">' + prod + '</span></div>';
    html += '<div style="font-size:20px;font-weight:500;font-family:var(--font-mono);color:' + col.color + '">' + fmtL(d.livello) + '</div>';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">';
    html += '<div style="flex:1;height:6px;background:rgba(0,0,0,0.08);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px"></div></div>';
    html += '<span style="font-size:11px;color:' + col.color + ';font-weight:500">' + pct + '%</span>';
    html += '</div>';
    html += '<div style="font-size:10px;color:' + col.color + ';opacity:0.7;margin-top:4px">Cap. ' + fmtL(d.capacita) + '</div>';
    html += '</div>';
  });
  wrap.innerHTML = html;
}

// ── COCKPIT INGROSSO: confronto mese vs stesso periodo mese prec. ──
// Esempio oggi 15/04 → confronta 01-15/04 vs 01-15/03 (NON tutto marzo).
async function caricaCockpit() {
  var oggiD = new Date(oggiISO + 'T12:00:00');
  var giornoMese = oggiD.getDate();
  var inizioMese = oggiISO.substring(0,8) + '01';

  var mesePrev = new Date(oggiD.getFullYear(), oggiD.getMonth()-1, 1);
  var inizioMesePrev = mesePrev.toISOString().split('T')[0].substring(0,8) + '01';
  // Stesso giorno del mese prec, ma NON oltre l'ultimo giorno reale del mese prec
  var ultimoMesePrev = new Date(oggiD.getFullYear(), oggiD.getMonth(), 0).getDate();
  var giornoLimite = Math.min(giornoMese, ultimoMesePrev);
  var fineMesePrev = mesePrev.toISOString().split('T')[0].substring(0,8) + String(giornoLimite).padStart(2,'0');

  var [meseRes, prevRes] = await Promise.all([
    sb.from('ordini').select('litri,costo_litro,trasporto_litro,margine,iva')
      .eq('tipo_ordine','cliente').neq('stato','annullato')
      .gte('data',inizioMese).lte('data',oggiISO).limit(2000),
    sb.from('ordini').select('litri,costo_litro,trasporto_litro,margine,iva')
      .eq('tipo_ordine','cliente').neq('stato','annullato')
      .gte('data',inizioMesePrev).lte('data',fineMesePrev).limit(2000)
  ]);
  var ordMese = meseRes.data || [], ordPrev = prevRes.data || [];

  function calcTotali(arr) {
    var f=0, l=0, mTot=0;
    arr.forEach(function(r) {
      f += prezzoNoIva(r) * Number(r.litri);
      l += Number(r.litri);
      mTot += Number(r.margine) * Number(r.litri);
    });
    return {
      fatturato: f,
      litri: l,
      margTot: mTot,
      margMedio: l > 0 ? mTot / l : 0,
      ordini: arr.length
    };
  }
  var mc = calcTotali(ordMese), pc = calcTotali(ordPrev);

  function set(id, val) { var el=document.getElementById(id); if(el) el.textContent = val; }
  set('ck-fatt-mese', fmtE(mc.fatturato));
  set('ck-litri-mese', fmtL(mc.litri));
  set('ck-marg-tot-mese', fmtE(mc.margTot));
  set('ck-margine-medio', mc.litri > 0 ? '€ ' + mc.margMedio.toFixed(4) + '/L' : '—');

  function renderDelta(elId, curr, prev) {
    var el = document.getElementById(elId);
    if (!el) return;
    if (prev === 0) { el.textContent = ''; return; }
    var pct = Math.round(((curr - prev) / Math.abs(prev)) * 100);
    el.textContent = (pct >= 0 ? '+' : '') + pct + '% vs stesso periodo prec.';
    el.style.color = pct >= 0 ? '#639922' : '#E24B4A';
  }
  renderDelta('ck-fatt-delta', mc.fatturato, pc.fatturato);
  renderDelta('ck-litri-delta', mc.litri, pc.litri);
  renderDelta('ck-marg-tot-delta', mc.margTot, pc.margTot);
  renderDelta('ck-margine-delta', mc.margMedio, pc.margMedio);
}

// ── COCKPIT STAZIONE: confronto mese vs stesso periodo mese prec. ──
async function caricaCockpitStazione() {
  var oggiD = new Date(oggiISO + 'T12:00:00');
  var giornoMese = oggiD.getDate();
  var inizioMese = oggiISO.substring(0,8) + '01';
  var mesePrev = new Date(oggiD.getFullYear(), oggiD.getMonth()-1, 1);
  var inizioMesePrev = mesePrev.toISOString().split('T')[0].substring(0,8) + '01';
  var ultimoMesePrev = new Date(oggiD.getFullYear(), oggiD.getMonth(), 0).getDate();
  var giornoLimite = Math.min(giornoMese, ultimoMesePrev);
  var fineMesePrev = mesePrev.toISOString().split('T')[0].substring(0,8) + String(giornoLimite).padStart(2,'0');

  try {
    var [pompeRes, lettMeseRes, lettPrevRes, prezziMeseRes, prezziPrevRes, costiMeseRes, costiPrevRes] = await Promise.all([
      sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true),
      sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', inizioMese).lte('data', oggiISO).order('data'),
      sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', inizioMesePrev).lte('data', fineMesePrev).order('data'),
      sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', inizioMese).lte('data', oggiISO),
      sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', inizioMesePrev).lte('data', fineMesePrev),
      sb.from('stazione_costi').select('data,prodotto,costo_litro').gte('data', inizioMese).lte('data', oggiISO),
      sb.from('stazione_costi').select('data,prodotto,costo_litro').gte('data', inizioMesePrev).lte('data', fineMesePrev)
    ]);
    var pompeMap = {}; (pompeRes.data||[]).forEach(p => { pompeMap[p.id] = p; });

    function calcStz(letture, prezzi, costi) {
      var pMap = {}; (prezzi||[]).forEach(p => { pMap[p.data+'_'+p.prodotto] = Number(p.prezzo_litro); });
      var cMap = {}; (costi||[]).forEach(c => { cMap[c.data+'_'+c.prodotto] = Number(c.costo_litro); });
      var lettPerData = {};
      (letture||[]).forEach(l => { if (!lettPerData[l.data]) lettPerData[l.data]=[]; lettPerData[l.data].push(l); });
      var date = Object.keys(lettPerData).sort();
      var incasso=0, litri=0, costo=0;
      for (var i=1;i<date.length;i++) {
        var dP=date[i-1], dC=date[i];
        (lettPerData[dC]||[]).forEach(l => {
          var lp = (lettPerData[dP]||[]).find(x => x.pompa_id===l.pompa_id);
          if (!lp) return;
          var lv = Number(l.lettura) - Number(lp.lettura);
          if (lv <= 0) return;
          var pompa = pompeMap[l.pompa_id]; if (!pompa) return;
          litri += lv;
          incasso += lv * (pMap[dC+'_'+pompa.prodotto] || 0);
          costo += lv * (cMap[dC+'_'+pompa.prodotto] || 0);
        });
      }
      var margTot = (incasso/1.22) - costo;
      return {
        incasso: incasso, litri: litri,
        margTot: costo>0 ? margTot : 0,
        margMedio: (costo>0 && litri>0) ? margTot/litri : 0
      };
    }
    var mc = calcStz(lettMeseRes.data, prezziMeseRes.data, costiMeseRes.data);
    var pc = calcStz(lettPrevRes.data, prezziPrevRes.data, costiPrevRes.data);

    function set(id,val) { var el=document.getElementById(id); if(el) el.textContent=val; }
    set('cks-incasso-mese', fmtE(mc.incasso));
    set('cks-litri-mese', fmtL(mc.litri));
    set('cks-marg-tot-mese', mc.margTot ? fmtE(mc.margTot) : '—');
    set('cks-margine-medio', mc.margMedio ? '€ ' + mc.margMedio.toFixed(4) + '/L' : '—');

    function renderDelta(elId, curr, prev) {
      var el = document.getElementById(elId);
      if (!el) return;
      if (!prev) { el.textContent = ''; return; }
      var pct = Math.round(((curr - prev) / Math.abs(prev)) * 100);
      el.textContent = (pct >= 0 ? '+' : '') + pct + '% vs stesso periodo prec.';
      el.style.color = pct >= 0 ? '#639922' : '#E24B4A';
    }
    renderDelta('cks-incasso-delta', mc.incasso, pc.incasso);
    renderDelta('cks-litri-delta', mc.litri, pc.litri);
    renderDelta('cks-marg-tot-delta', mc.margTot, pc.margTot);
    renderDelta('cks-margine-delta', mc.margMedio, pc.margMedio);
  } catch(e) {
    console.warn('caricaCockpitStazione errore:', e);
  }
}

// ── GIACENZA STAZIONE in dashboard principale ──
async function caricaGiacenzaStazioneDashboard() {
  const wrap = document.getElementById('dash-giacenza-stz');
  if (!wrap) return;

  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','stazione_oppido');
  if (!cisterne || !cisterne.length) { wrap.innerHTML = '<div class="loading">Nessuna cisterna stazione</div>'; return; }

  // Allineamento ripartizione (nuova logica 18/04/2026): usa pfData.getRipartizioneCisterneStazione
  // che deriva i livelli per cisterna dalla giacenza calcolata (fonte unica di verità).
  // Non tocca il DB, sovrascrive solo i valori visualizzati.
  try {
    const prodottiUnici = [...new Set(cisterne.map(c => c.prodotto).filter(Boolean))];
    for (let pi = 0; pi < prodottiUnici.length; pi++) {
      const prod = prodottiUnici[pi];
      const ripart = await pfData.getRipartizioneCisterneStazione(prod);
      if (ripart && ripart.length) {
        cisterne.forEach(c => {
          const match = ripart.find(r => r.id === c.id);
          if (match) c.livello_attuale = match.livello_ripartito;
        });
      }
    }
  } catch(e) { console.warn('[caricaGiacenzaStazioneDashboard] ripartizione fallita:', e); }

  const prodottiOrdine = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO'];
  const perProdotto = {};
  cisterne.forEach(c => {
    const prod = c.prodotto || 'Altro';
    if (!perProdotto[prod]) perProdotto[prod] = { livello:0, capacita:0 };
    perProdotto[prod].livello += Number(c.livello_attuale || 0);
    perProdotto[prod].capacita += Number(c.capacita_max || 0);
  });
  let html = '';
  prodottiOrdine.forEach(prod => {
    const d = perProdotto[prod];
    if (!d) return;
    const pct = d.capacita > 0 ? Math.round((d.livello / d.capacita) * 100) : 0;
    const col = COLORI_DASH[prod] || { bg:'var(--bg-kpi)', color:'var(--text)', bar:'#888', dot:'#888' };
    const barColor = pct < 20 ? '#E24B4A' : pct < 40 ? '#BA7517' : col.bar;
    html += '<div style="background:' + col.bg + ';border-radius:var(--radius);padding:14px 16px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><div style="width:8px;height:8px;border-radius:50%;background:' + col.dot + '"></div><span style="font-size:10px;color:' + col.color + ';text-transform:uppercase;letter-spacing:0.6px;font-weight:500">' + prod + '</span></div>';
    html += '<div style="font-size:20px;font-weight:500;font-family:var(--font-mono);color:' + col.color + '">' + fmtL(d.livello) + '</div>';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">';
    html += '<div style="flex:1;height:6px;background:rgba(0,0,0,0.08);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + Math.min(pct,100) + '%;background:' + barColor + ';border-radius:3px"></div></div>';
    html += '<span style="font-size:11px;color:' + col.color + ';font-weight:500">' + pct + '%</span>';
    html += '</div>';
    html += '<div style="font-size:10px;color:' + col.color + ';opacity:0.7;margin-top:4px">Cap. ' + fmtL(d.capacita) + '</div>';
    html += '</div>';
  });
  wrap.innerHTML = html;
}

// ── CARICHI PIANIFICATI in dashboard (oggi e ieri) ──
async function caricaCarichiDashboard() {
  var cont = document.getElementById('dashboard-carichi');
  if (!cont) return;
  var oggiD = new Date();
  var ieriD = new Date(oggiD); ieriD.setDate(ieriD.getDate()-1);
  var oggiStr = oggiD.toISOString().split('T')[0];
  var ieriStr = ieriD.toISOString().split('T')[0];

  var { data, error } = await sb.from('carichi')
    .select('*, carico_ordini(sequenza, ordini(cliente,prodotto,litri)), mezzi(capacita_totale)')
    .in('data', [oggiStr, ieriStr])
    .order('data', { ascending: false });
  if (error) { cont.innerHTML = '<div class="loading">Errore: ' + esc(error.message) + '</div>'; return; }
  if (!data || !data.length) { cont.innerHTML = '<div class="loading">Nessun carico oggi/ieri</div>'; return; }

  var perData = {};
  data.forEach(c => { var k = c.data || '—'; if (!perData[k]) perData[k]=[]; perData[k].push(c); });
  var date = Object.keys(perData).sort().reverse();
  var html = '';
  date.forEach(function(d) {
    html += '<div style="font-size:11px;color:var(--text-muted);padding:8px 12px;background:var(--bg);border-radius:6px;margin:14px 0 8px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px">' + fmtD(d) + (d === oggiStr ? ' · OGGI' : ' · IERI') + '</div>';
    perData[d].forEach(function(c) {
      if (typeof _renderCardCarico === 'function') {
        html += _renderCardCarico(c, { mostraAzioni: false });
      } else {
        // Fallback se pf-logistica non caricato
        var ordini = (c.carico_ordini || []).map(co => co.ordini).filter(Boolean);
        var totLitri = ordini.reduce((s,o) => s + Number(o.litri || 0), 0);
        html += '<div style="background:var(--surface);border:0.5px solid var(--border);border-radius:10px;padding:10px 14px;margin-bottom:6px">' + esc(c.mezzo_targa||'—') + ' · ' + esc(c.autista||'—') + ' · ' + fmtL(totLitri) + ' L</div>';
      }
    });
  });
  cont.innerHTML = html;
}

// ── TOGGLE TENDINA ALERT ──
function dashToggleAlert() {
  var t = document.getElementById('dash-alert-tendina');
  var c = document.getElementById('dash-alert-chevron');
  if (!t || !c) return;
  if (t.style.display === 'none') {
    t.style.display = 'block';
    c.textContent = '▲ chiudi';
  } else {
    t.style.display = 'none';
    c.textContent = '▼ apri';
  }
}

// ── ALERT OPERATIVI DASHBOARD ──
async function caricaAlertOperativi() {
  var alerts = [];
  try {
    // 1. Giacenze critiche (sotto 20%)
    var { data: cist } = await sb.from('cisterne').select('nome,prodotto,livello_attuale,capacita_max').eq('sede','deposito_vibo');
    (cist||[]).forEach(function(c) {
      var pct = Number(c.capacita_max) > 0 ? (Number(c.livello_attuale) / Number(c.capacita_max)) * 100 : 100;
      if (pct < 5) alerts.push({ tipo:'danger', icon:'🛢', testo: c.nome + ' (' + c.prodotto + ') al ' + Math.round(pct) + '% — ' + fmtL(c.livello_attuale) + ' rimanenti' });
    });

    // 2. Clienti con fido oltre 80%
    var { data: clFido } = await sb.from('clienti').select('id,nome,fido_massimo,giorni_pagamento').gt('fido_massimo', 0);
    if (clFido && clFido.length) {
      var { data: ordNP } = await sb.from('ordini').select('cliente,cliente_id,data,costo_litro,trasporto_litro,margine,iva,litri,giorni_pagamento').neq('stato','annullato').eq('pagato',false);
      clFido.forEach(function(cl) {
        var usato = 0;
        (ordNP||[]).filter(function(o){return o.cliente_id===cl.id||o.cliente===cl.nome;}).forEach(function(o) {
          var scad = new Date(o.data); scad.setDate(scad.getDate() + (o.giorni_pagamento||cl.giorni_pagamento||30));
          if (scad > oggi) usato += prezzoConIva(o) * Number(o.litri);
        });
        var pctF = Math.round((usato / Number(cl.fido_massimo)) * 100);
        if (pctF >= 80) alerts.push({ tipo: pctF >= 100 ? 'danger' : 'warning', icon:'💰', testo: cl.nome + ' — fido al ' + pctF + '% (' + fmtE(usato) + ' / ' + fmtE(cl.fido_massimo) + ')' });
      });
    }

    // 3. Ordini in attesa da più di 3 giorni
    var treGg = new Date(oggi); treGg.setDate(treGg.getDate()-3);
    var { data: ordP } = await sb.from('ordini').select('id').eq('stato','in attesa').lte('data',treGg.toISOString().split('T')[0]);
    if (ordP && ordP.length) alerts.push({ tipo:'warning', icon:'📋', testo: ordP.length + ' ordini in attesa da più di 3 giorni' });

    // 4. Cassa mancante ieri (esclusa domenica)
    var ieri = new Date(oggi); ieri.setDate(ieri.getDate()-1);
    if (ieri.getDay() !== 0) {
      var { data: cassaI } = await sb.from('stazione_cassa').select('id').eq('data',ieri.toISOString().split('T')[0]).maybeSingle();
      if (!cassaI) alerts.push({ tipo:'info', icon:'💵', testo: 'Cassa del ' + ieri.toISOString().split('T')[0] + ' non ancora registrata' });
    }
  } catch(e) { console.warn('Alert err:', e); }

  // Nuovo wrapper alert (collassabile)
  var wrapNew = document.getElementById('dash-alert-wrapper');
  var tend = document.getElementById('dash-alert-tendina');
  var titolo = document.getElementById('dash-alert-titolo');
  var oldWrap = document.getElementById('dash-alert-operativi'); // legacy: nasconde

  if (oldWrap) oldWrap.style.display = 'none';

  if (!wrapNew || !tend || !titolo) return;
  if (!alerts.length) { wrapNew.style.display = 'none'; return; }

  wrapNew.style.display = 'block';
  titolo.textContent = '⚠️ Alert operativi (' + alerts.length + ')';

  var colori = { danger:'border-left:4px solid #E24B4A;background:#FCEBEB', warning:'border-left:4px solid #BA7517;background:#FAEEDA', info:'border-left:4px solid #378ADD;background:#E6F1FB' };
  tend.innerHTML = alerts.map(function(a) {
    return '<div style="' + (colori[a.tipo]||colori.info) + ';padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:6px;font-size:12px;display:flex;align-items:center;gap:8px"><span>' + a.icon + '</span><span>' + a.testo + '</span></div>';
  }).join('');

  // Invia alert critici in bacheca (solo 1 volta al giorno per sessione)
  if (utenteCorrente && utenteCorrente.ruolo === 'admin') {
    var alertKey = 'pf_alert_' + oggiISO;
    if (!sessionStorage.getItem(alertKey)) {
      var critici = alerts.filter(function(a){return a.tipo==='danger';});
      if (critici.length) inviaAvvisoSistema('Alert operativi:\n' + critici.map(function(a){return a.icon+' '+a.testo;}).join('\n'), 'sistema');
      sessionStorage.setItem(alertKey, '1');
    }
  }
}

// ── GRAFICI DASHBOARD ────────────────────────────────────────────
let _chartFatturato=null, _chartProdotti=null, _chartMargine=null, _chartVenditeMese=null;

async function caricaGraficiDashboard() {
  // Fatturato ultimi 7 giorni
  const giorni = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(oggi); d.setDate(d.getDate()-i);
    giorni.push(d.toISOString().split('T')[0]);
  }
  const { data: ord7 } = await sb.from('ordini').select('*').gte('data', giorni[0]).lte('data', giorni[6]).neq('stato','annullato').eq('tipo_ordine','cliente');

  const fattPerGiorno = {};
  giorni.forEach(g => { fattPerGiorno[g]=0; });
  (ord7||[]).forEach(r => {
    if (fattPerGiorno[r.data] !== undefined) {
      fattPerGiorno[r.data] += prezzoConIva(r) * Number(r.litri);
    }
  });

  const labels7 = giorni.map(g => { const d=new Date(g); return d.getDate()+'/'+(d.getMonth()+1); });
  const ctx1 = document.getElementById('chart-fatturato');
  if (ctx1) {
    if (_chartFatturato) _chartFatturato.destroy();
    _chartFatturato = new Chart(ctx1.getContext('2d'), {
      type:'bar', data:{
        labels:labels7,
        datasets:[{ label:'Fatturato €', data:giorni.map(g=>Math.round(fattPerGiorno[g]*100)/100), backgroundColor:'#D4A017', borderRadius:6 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}}} }
    });
  }

  // Dati mese corrente
  const inizio = new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
  const { data: ordMese } = await sb.from('ordini').select('*').gte('data', inizio).neq('stato','annullato').eq('tipo_ordine','cliente');

  // Litri per prodotto (mese) — ISTOGRAMMA
  const perProd = {};
  const prodColori = getColoriProdotti();
  (ordMese||[]).forEach(r => { perProd[r.prodotto] = (perProd[r.prodotto]||0) + Number(r.litri); });
  const prodLabels = Object.keys(perProd);
  const ctx2 = document.getElementById('chart-prodotti');
  if (ctx2) {
    if (_chartProdotti) _chartProdotti.destroy();
    _chartProdotti = new Chart(ctx2.getContext('2d'), {
      type:'bar', data:{
        labels:prodLabels,
        datasets:[{ label:'Litri', data:prodLabels.map(p=>Math.round(perProd[p])), backgroundColor:prodLabels.map(p=>prodColori[p]||'#888'), borderRadius:6 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtL(v)}}} }
    });
  }

  // Vendite giornaliere mese corrente
  const giorniMese = [];
  const primoGiorno = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
  for (let d = new Date(primoGiorno); d <= oggi; d.setDate(d.getDate()+1)) {
    giorniMese.push(d.toISOString().split('T')[0]);
  }
  const vendPerGiorno = {};
  giorniMese.forEach(g => { vendPerGiorno[g] = 0; });
  (ordMese||[]).forEach(r => {
    if (vendPerGiorno[r.data] !== undefined) {
      vendPerGiorno[r.data] += prezzoConIva(r) * Number(r.litri);
    }
  });
  const labelsM = giorniMese.map(g => { const d=new Date(g); return d.getDate()+'/'+(d.getMonth()+1); });
  const ctx4 = document.getElementById('chart-vendite-mese');
  if (ctx4) {
    if (_chartVenditeMese) _chartVenditeMese.destroy();
    _chartVenditeMese = new Chart(ctx4.getContext('2d'), {
      type:'bar', data:{
        labels:labelsM,
        datasets:[{ label:'Vendite €', data:giorniMese.map(g=>Math.round(vendPerGiorno[g]*100)/100), backgroundColor:'#D85A30', borderRadius:4 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}},x:{ticks:{maxTicksLimit:15,font:{size:9}}}} }
    });
  }

  // Margine ultimi 30 giorni
  const giorni30 = [];
  for (let i=29; i>=0; i--) {
    const d = new Date(oggi); d.setDate(d.getDate()-i);
    giorni30.push(d.toISOString().split('T')[0]);
  }
  const { data: ord30 } = await sb.from('ordini').select('*').gte('data', giorni30[0]).neq('stato','annullato').eq('tipo_ordine','cliente');
  const marg30 = {};
  giorni30.forEach(g => { marg30[g]=0; });
  (ord30||[]).forEach(r => { if (marg30[r.data]!==undefined) marg30[r.data] += Number(r.margine)*Number(r.litri); });

  const labels30 = giorni30.map(g => { const d=new Date(g); return d.getDate()+'/'+(d.getMonth()+1); });
  const ctx3 = document.getElementById('chart-margine');
  if (ctx3) {
    if (_chartMargine) _chartMargine.destroy();
    _chartMargine = new Chart(ctx3.getContext('2d'), {
      type:'line', data:{
        labels:labels30,
        datasets:[{ label:'Margine €', data:giorni30.map(g=>Math.round(marg30[g]*100)/100), borderColor:'#639922', backgroundColor:'rgba(99,153,34,0.1)', fill:true, tension:0.3, pointRadius:2 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>'€ '+v}},x:{ticks:{maxTicksLimit:10,font:{size:10}}}} }
    });
  }

  // NOTIFICHE — ordini in attesa da più di 3 giorni
  await caricaNotificheDashboard();
}

async function caricaNotificheDashboard() {
  const treGiorniFa = new Date(oggi);
  treGiorniFa.setDate(treGiorniFa.getDate() - 3);
  const limiteData = treGiorniFa.toISOString().split('T')[0];

  const { data: ordiniVecchi } = await sb.from('ordini').select('*').eq('stato','in attesa').lte('data', limiteData).order('data');
  const wrap = document.getElementById('dash-notifiche');
  if (!ordiniVecchi || !ordiniVecchi.length) { wrap.style.display = 'none'; return; }

  wrap.style.display = 'block';
  let html = '<div class="card" style="border-left:4px solid #E24B4A;background:#FFF8F8">';
  html += '<div class="card-title" style="color:#A32D2D;display:flex;align-items:center;gap:8px">⚠️ Ordini in attesa da più di 3 giorni <span class="badge red">' + ordiniVecchi.length + '</span></div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Cliente</th><th>Prodotto</th><th>Litri</th><th>Totale</th><th>Giorni</th><th>Azioni</th></tr></thead><tbody>';
  ordiniVecchi.forEach(r => {
    const tot = prezzoConIva(r) * Number(r.litri);
    const giorniPassati = Math.floor((oggi - new Date(r.data)) / (1000*60*60*24));
    html += '<tr><td>' + fmtD(r.data) + '</td><td><strong>' + esc(r.cliente) + '</strong></td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td>';
    html += '<td><span class="badge red">' + giorniPassati + ' gg</span></td>';
    html += '<td><button class="btn-edit" title="Riprogramma" onclick="riprogrammaOrdine(\'' + r.id + '\')">📅</button>';
    html += '<button class="btn-danger" title="Annulla" onclick="annullaOrdine(\'' + r.id + '\')">x</button></td></tr>';
  });
  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;
}

