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
  const{data}=await sb.from('ordini').select('*').eq('data',oggiISO);
  if (!data) return;

  // INGROSSO: solo tipo_ordine='cliente'
  const ingrosso = data.filter(r => r.tipo_ordine === 'cliente' && r.stato !== 'annullato');
  let fatturato=0,litri=0,margine=0;
  ingrosso.forEach(r=>{fatturato+=prezzoConIva(r)*r.litri;litri+=Number(r.litri);margine+=Number(r.margine);});
  document.getElementById('kpi-fatturato').textContent=fmtE(fatturato);
  document.getElementById('kpi-litri').textContent=fmtL(litri);
  document.getElementById('kpi-margine').textContent=ingrosso.length?'€ '+(margine/ingrosso.length).toFixed(4)+'/L':'—';
  document.getElementById('kpi-ordini').textContent=ingrosso.length;

  // MOVIMENTI INTERNI oggi
  const movInterni = data.filter(r => (r.tipo_ordine === 'stazione_servizio' || r.tipo_ordine === 'entrata_deposito' || r.tipo_ordine === 'autoconsumo') && r.stato !== 'annullato');
  document.getElementById('kpi-mov-interni').textContent = movInterni.length;

  // DETTAGLIO: letture pompe oggi vs ieri
  try {
    const ieri = new Date(oggi); ieri.setDate(ieri.getDate()-1);
    const ieriISO = ieri.toISOString().split('T')[0];
    const [lettOggiRes, lettIeriRes, prezziOggiRes, lettMeseRes, pompeRes, prezziMeseRes] = await Promise.all([
      sb.from('stazione_letture').select('pompa_id,lettura').eq('data', oggiISO),
      sb.from('stazione_letture').select('pompa_id,lettura').eq('data', ieriISO),
      sb.from('stazione_prezzi').select('prodotto,prezzo_litro').eq('data', oggiISO),
      sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', oggiISO.substring(0,8)+'01').lte('data', oggiISO).order('data'),
      sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true),
      sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', oggiISO.substring(0,8)+'01').lte('data', oggiISO)
    ]);
    const pompe = pompeRes.data;
    const pompeMap = {}; (pompe||[]).forEach(p => { pompeMap[p.id] = p; });
    const prezziMap = {}; (prezziOggiRes.data||[]).forEach(p => { prezziMap[p.prodotto] = Number(p.prezzo_litro); });
    const lettIeriMap = {}; (lettIeriRes.data||[]).forEach(l => { lettIeriMap[l.pompa_id] = Number(l.lettura); });

    let dettLitri=0, dettIncasso=0;
    (lettOggiRes.data||[]).forEach(l => {
      const prec = lettIeriMap[l.pompa_id];
      if (prec === undefined) return;
      const lv = Number(l.lettura) - prec; if (lv <= 0) return;
      const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
      dettLitri += lv;
      dettIncasso += lv * (prezziMap[pompa.prodotto] || 0);
    });
    document.getElementById('kpi-dett-incasso').textContent = fmtE(dettIncasso);
    document.getElementById('kpi-dett-litri').textContent = fmtL(dettLitri);

    // Incasso mese da letture
    const lettPerData = {};
    (lettMeseRes.data||[]).forEach(l => { if (!lettPerData[l.data]) lettPerData[l.data] = []; lettPerData[l.data].push(l); });
    const dateOrd = Object.keys(lettPerData).sort();
    const prezziMeseMap = {};
    (prezziMeseRes.data||[]).forEach(p => { prezziMeseMap[p.data+'_'+p.prodotto] = Number(p.prezzo_litro); });

    let meseIncasso = 0;
    for (let i = 1; i < dateOrd.length; i++) {
      const dPrec = dateOrd[i-1], dCorr = dateOrd[i];
      (lettPerData[dCorr]||[]).forEach(l => {
        const lPrec = (lettPerData[dPrec]||[]).find(x => x.pompa_id === l.pompa_id);
        if (!lPrec) return;
        const lv = Number(l.lettura) - Number(lPrec.lettura); if (lv <= 0) return;
        const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
        meseIncasso += lv * (prezziMeseMap[dCorr+'_'+pompa.prodotto] || 0);
      });
    }
    document.getElementById('kpi-dett-mese').textContent = fmtE(meseIncasso);
  } catch(e) {
    console.error('Errore KPI dettaglio:', e);
  }

  const{data:rec}=await sb.from('ordini').select('*').order('created_at',{ascending:false}).limit(5);
  const tbody=document.getElementById('dashboard-ordini');
  tbody.innerHTML=rec&&rec.length?rec.map(r=>'<tr><td>'+r.data+'</td><td>'+esc(r.cliente)+'</td><td>'+esc(r.prodotto)+'</td><td style="font-family:var(--font-mono)">'+fmtL(r.litri)+'</td><td style="font-family:var(--font-mono)">'+fmtE(prezzoConIva(r)*r.litri)+'</td><td>'+badgeStato(r.stato)+'</td></tr>').join(''):'<tr><td colspan="6" class="loading">Nessun ordine</td></tr>';
  // Giacenza deposito + grafici + cockpit in parallelo
  await Promise.all([caricaGiacenzaDashboard(), caricaGraficiDashboard(), caricaCockpit(), caricaAlertOperativi()]);
}

async function caricaGiacenzaDashboard() {
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','deposito_vibo');
  const wrap = document.getElementById('dash-giacenza');
  if (!wrap) return;
  if (!cisterne || !cisterne.length) { wrap.innerHTML = '<div class="loading">Nessuna cisterna configurata</div>'; return; }
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

// ── COCKPIT: confronto mese corrente vs precedente ──
async function caricaCockpit() {
  var inizioMese = oggiISO.substring(0,8) + '01';
  var mesePrev = new Date(oggi.getFullYear(), oggi.getMonth()-1, 1);
  var inizioMesePrev = mesePrev.toISOString().split('T')[0].substring(0,8) + '01';
  var fineMesePrev = new Date(oggi.getFullYear(), oggi.getMonth(), 0).toISOString().split('T')[0];

  var [meseRes, prevRes] = await Promise.all([
    sb.from('ordini').select('litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',inizioMese).lte('data',oggiISO),
    sb.from('ordini').select('litri,costo_litro,trasporto_litro,margine,iva').eq('tipo_ordine','cliente').neq('stato','annullato').gte('data',inizioMesePrev).lte('data',fineMesePrev)
  ]);
  var ordMese = meseRes.data || [], ordPrev = prevRes.data || [];

  function calcTotali(arr) {
    var f=0, l=0, m=0;
    arr.forEach(function(r) { f += prezzoConIva(r)*Number(r.litri); l += Number(r.litri); m += Number(r.margine); });
    return { fatturato:f, litri:l, margine: arr.length>0 ? m/arr.length : 0, ordini:arr.length };
  }
  var mc = calcTotali(ordMese), pc = calcTotali(ordPrev);

  document.getElementById('ck-fatt-mese').textContent = fmtE(mc.fatturato);
  document.getElementById('ck-litri-mese').textContent = fmtL(mc.litri);
  document.getElementById('ck-margine-medio').textContent = mc.ordini > 0 ? '€ ' + mc.margine.toFixed(4) + '/L' : '—';
  document.getElementById('ck-ordini-mese').textContent = mc.ordini;

  function renderDelta(elId, curr, prev) {
    var el = document.getElementById(elId);
    if (!el || prev === 0) { if(el) el.textContent=''; return; }
    var pct = Math.round(((curr - prev) / Math.abs(prev)) * 100);
    el.textContent = (pct >= 0 ? '+' : '') + pct + '% vs mese prec.';
    el.style.color = pct >= 0 ? '#639922' : '#E24B4A';
  }
  renderDelta('ck-fatt-delta', mc.fatturato, pc.fatturato);
  renderDelta('ck-litri-delta', mc.litri, pc.litri);
  renderDelta('ck-margine-delta', mc.margine, pc.margine);
  renderDelta('ck-ordini-delta', mc.ordini, pc.ordini);
}

// ── ALERT OPERATIVI DASHBOARD ──
async function caricaAlertOperativi() {
  var alerts = [];
  try {
    // 1. Giacenze critiche (sotto 20%)
    var { data: cist } = await sb.from('cisterne').select('nome,prodotto,livello_attuale,capacita_max').eq('sede','deposito_vibo');
    (cist||[]).forEach(function(c) {
      var pct = Number(c.capacita_max) > 0 ? (Number(c.livello_attuale) / Number(c.capacita_max)) * 100 : 100;
      if (pct < 20) alerts.push({ tipo:'danger', icon:'🛢', testo: c.nome + ' (' + c.prodotto + ') al ' + Math.round(pct) + '% — ' + fmtL(c.livello_attuale) + ' rimanenti' });
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

  var wrap = document.getElementById('dash-alert-operativi');
  if (!wrap) return;
  if (!alerts.length) { wrap.innerHTML=''; wrap.style.display='none'; return; }

  var colori = { danger:'border-left:4px solid #E24B4A;background:#FCEBEB', warning:'border-left:4px solid #BA7517;background:#FAEEDA', info:'border-left:4px solid #378ADD;background:#E6F1FB' };
  wrap.style.display = 'block';
  wrap.innerHTML = '<div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;letter-spacing:0.6px;font-weight:500;margin-bottom:6px">⚠ Alert operativi</div>' +
    alerts.map(function(a) { return '<div style="' + (colori[a.tipo]||colori.info) + ';padding:10px 14px;border-radius:0 8px 8px 0;margin-bottom:6px;font-size:12px;display:flex;align-items:center;gap:8px"><span>' + a.icon + '</span><span>' + a.testo + '</span></div>'; }).join('');

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
    html += '<tr><td>' + r.data + '</td><td><strong>' + esc(r.cliente) + '</strong></td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td>';
    html += '<td><span class="badge red">' + giorniPassati + ' gg</span></td>';
    html += '<td><button class="btn-edit" title="Riprogramma" onclick="riprogrammaOrdine(\'' + r.id + '\')">📅</button>';
    html += '<button class="btn-danger" title="Annulla" onclick="annullaOrdine(\'' + r.id + '\')">x</button></td></tr>';
  });
  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;
}

