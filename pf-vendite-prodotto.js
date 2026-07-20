// ═══════════════════════════════════════════════════════════════════
// pf-vendite-prodotto.js — Tab "Vendite per prodotto" (sezione Vendite)
// Scegli il prodotto da una tendina; aggregato su TUTTI i clienti:
// (1) BARRE biennali per mese (toggle Litri / Euro netto).
// (2) TABELLA mensile — pulsanti anno prec. / anno corr. / VS:
//     totale litri, imponibile (netto), marginalità totale, €/l per mese.
// (3) LINEA marginalità €/l per mese, due anni a confronto.
// SOLO LETTURA: nessuna scrittura su DB.
// ═══════════════════════════════════════════════════════════════════
let _vppProdotti = [];
let _vppPop = false;
let _vppProdotto = '';
let _vppOrders = [];
let _vppUnit = 'litri';       // 'litri' | 'euro'
let _vppTableView = 'cur';    // 'prev' | 'cur' | 'vs'
let _chartVppBar = null, _chartVppLine = null;

const _VPP_MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const _VPP_MESI_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

async function caricaVenditePerProdotto() {
  var sel = document.getElementById('vpp-prodotto');
  if (sel && !_vppPop) {
    var { data: pr } = await sb.from('prodotti').select('nome,ordine_visualizzazione').order('ordine_visualizzazione');
    _vppProdotti = (pr||[]).map(function(p){return p.nome;}).filter(Boolean);
    sel.innerHTML = '<option value="">— scegli un prodotto —</option>' + _vppProdotti.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join('');
    _vppPop = true;
  }
  if (_vppProdotto) vppRender();
}

async function vppCambiaProdotto() {
  var sel = document.getElementById('vpp-prodotto');
  _vppProdotto = sel ? sel.value : '';
  var body = document.getElementById('vpp-body');
  if (!_vppProdotto) { if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">Seleziona un prodotto per vedere tabella e grafici.</div>'; return; }
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">⏳ Caricamento vendite...</div>';

  var flds = 'data,litri,costo_litro,trasporto_litro,margine';
  var _daData = (new Date().getFullYear() - 1) + '-01-01'; // solo anno corrente + precedente (grafici/tabella usano 2 anni)
  var { data: raw } = await sb.from('ordini').select(flds).eq('tipo_ordine','cliente').eq('prodotto', _vppProdotto).neq('stato','annullato').gte('data', _daData).order('data').range(0,999);
  var ord = raw || [];
  if (ord.length === 1000) {
    var from = 1000;
    while (true) {
      var { data: b } = await sb.from('ordini').select(flds).eq('tipo_ordine','cliente').eq('prodotto', _vppProdotto).neq('stato','annullato').gte('data', _daData).order('data').range(from, from+999);
      if (!b || !b.length) break; ord = ord.concat(b); if (b.length < 1000) break; from += 1000;
    }
  }
  _vppOrders = (ord||[]).filter(function(o){ return o.data && Number(o.litri) > 0; });
  vppRender();
}

function _vppBuildBody() {
  var body = document.getElementById('vpp-body');
  if (!body) return;
  var yCur = new Date().getFullYear(), yPrev = yCur - 1;
  body.innerHTML =
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
      '<div style="font-size:14px;font-weight:500">Confronto annuo · per mese</div>' +
      '<div style="display:inline-flex;border:0.5px solid var(--border);border-radius:8px;overflow:hidden">' +
        '<button id="vpp-u-litri" onclick="vppSetUnit(\'litri\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">Litri</button>' +
        '<button id="vpp-u-euro" onclick="vppSetUnit(\'euro\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">Euro (netto)</button>' +
      '</div>' +
    '</div>' +
    '<div id="vpp-bar-legend" style="display:flex;gap:16px;margin-bottom:8px;font-size:12px;color:var(--text-secondary)"></div>' +
    '<div style="position:relative;width:100%;height:260px"><canvas id="vpp-bar" role="img" aria-label="Litri o fatturato per mese, anno corrente contro precedente"></canvas></div>' +
    '<div style="height:1px;background:var(--border);margin:20px 0 14px"></div>' +
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
      '<div style="font-size:14px;font-weight:500">Dettaglio mensile</div>' +
      '<div style="display:inline-flex;border:0.5px solid var(--border);border-radius:8px;overflow:hidden">' +
        '<button id="vpp-t-prev" onclick="vppSetTableView(\'prev\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">' + yPrev + '</button>' +
        '<button id="vpp-t-cur" onclick="vppSetTableView(\'cur\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">' + yCur + '</button>' +
        '<button id="vpp-t-vs" onclick="vppSetTableView(\'vs\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">VS</button>' +
      '</div>' +
    '</div>' +
    '<div id="vpp-table" style="overflow-x:auto;margin-bottom:6px"></div>' +
    '<div style="height:1px;background:var(--border);margin:20px 0 14px"></div>' +
    '<div style="font-size:14px;font-weight:500;margin-bottom:8px">Marginalità €/l per mese</div>' +
    '<div id="vpp-line-legend" style="display:flex;gap:16px;margin-bottom:8px;font-size:12px;color:var(--text-secondary)"></div>' +
    '<div style="position:relative;width:100%;height:260px"><canvas id="vpp-line" role="img" aria-label="Marginalità per litro per mese, due anni a confronto"></canvas></div>';
}

function vppRender() {
  if (!_vppProdotto) return;
  if (!document.getElementById('vpp-bar')) _vppBuildBody();
  if (!_vppOrders.length) {
    var body = document.getElementById('vpp-body');
    if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">Nessuna vendita registrata per <strong>' + esc(_vppProdotto) + '</strong>.</div>';
    return;
  }
  _vppRenderBar();
  _vppRenderTable();
  _vppRenderLine();
  _vppSyncButtons();
}

function _vppMonthly(anno) {
  var litri = new Array(12).fill(0), euro = new Array(12).fill(0), marg = new Array(12).fill(0);
  _vppOrders.forEach(function(o){
    if (Number(String(o.data).slice(0,4)) !== anno) return;
    var m = Number(String(o.data).slice(5,7)) - 1; if (m < 0 || m > 11) return;
    var l = Number(o.litri);
    litri[m] += l; euro[m] += prezzoNoIva(o) * l; marg[m] += Number(o.margine) * l;
  });
  return { litri:litri, euro:euro, marg:marg };
}

function _vppRenderBar() {
  var yCur = new Date().getFullYear(), yPrev = yCur - 1;
  var cur = _vppMonthly(yCur), prev = _vppMonthly(yPrev);
  var isEuro = _vppUnit === 'euro';
  var dCur = (isEuro?cur.euro:cur.litri).map(function(v){return Math.round(v);});
  var dPrev = (isEuro?prev.euro:prev.litri).map(function(v){return Math.round(v);});
  var leg = document.getElementById('vpp-bar-legend');
  if (leg) leg.innerHTML =
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#185FA5"></span>'+yCur+'</span>' +
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#B4B2A9"></span>'+yPrev+'</span>';
  var ctx = document.getElementById('vpp-bar'); if (!ctx) return;
  if (_chartVppBar) _chartVppBar.destroy();
  _chartVppBar = new Chart(ctx, {
    type:'bar',
    data:{labels:_VPP_MESI,datasets:[
      {label:String(yCur),data:dCur,backgroundColor:'#185FA5',borderRadius:4,maxBarThickness:16},
      {label:String(yPrev),data:dPrev,backgroundColor:'#B4B2A9',borderRadius:4,maxBarThickness:16}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+(isEuro?('€ '+c.parsed.y.toLocaleString('it-IT')):(c.parsed.y.toLocaleString('it-IT')+' L'));}}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:11},autoSkip:false}},y:{beginAtZero:true,ticks:{font:{size:11},callback:function(v){return isEuro?('€'+Math.round(v/1000)+'k'):(Math.round(v/1000)+'k');}}}}
    }
  });
}

function _vppRenderTable() {
  var host = document.getElementById('vpp-table'); if (!host) return;
  var yCur = new Date().getFullYear(), yPrev = yCur - 1;
  var eL = function(v){ return v>0 ? fmtL(v) : '—'; };
  var eE = function(v){ return v>0 ? fmtE(v) : '—'; };
  var eM = function(v){ return v!==0 ? fmtMe(v) : '—'; };
  var perL = function(m,l){ return l>0 ? ('€ '+(m/l).toFixed(4)) : '—'; };

  if (_vppTableView === 'vs') {
    var C = _vppMonthly(yCur), P = _vppMonthly(yPrev);
    var tL={cur:0,prev:0}, tE={cur:0,prev:0}, tM={cur:0,prev:0}, rows='';
    for (var m=0;m<12;m++){
      if (!C.litri[m] && !P.litri[m]) continue;
      tL.cur+=C.litri[m]; tL.prev+=P.litri[m]; tE.cur+=C.euro[m]; tE.prev+=P.euro[m]; tM.cur+=C.marg[m]; tM.prev+=P.marg[m];
      rows += '<tr><td style="font-weight:500">'+_VPP_MESI_FULL[m]+'</td>'+
        '<td style="text-align:right;font-family:var(--font-mono)">'+eL(C.litri[m])+'</td><td style="text-align:right;font-family:var(--font-mono);color:var(--text-muted)">'+eL(P.litri[m])+'</td>'+
        '<td style="text-align:right;font-family:var(--font-mono)">'+eE(C.euro[m])+'</td><td style="text-align:right;font-family:var(--font-mono);color:var(--text-muted)">'+eE(P.euro[m])+'</td>'+
        '<td style="text-align:right;font-family:var(--font-mono);color:#3B6D11">'+eM(C.marg[m])+'</td><td style="text-align:right;font-family:var(--font-mono);color:var(--text-muted)">'+eM(P.marg[m])+'</td></tr>';
    }
    if (!rows) rows = '<tr><td colspan="7" style="text-align:center;color:var(--text-muted);padding:14px">Nessuna vendita nei due anni</td></tr>';
    host.innerHTML = '<table style="width:100%;font-size:12.5px;border-collapse:collapse"><thead>'+
      '<tr style="border-bottom:0.5px solid var(--border);color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.3px">'+
        '<th style="text-align:left;padding:6px 8px">Mese</th>'+
        '<th style="text-align:right;padding:6px 8px">Litri '+yCur+'</th><th style="text-align:right;padding:6px 8px">Litri '+yPrev+'</th>'+
        '<th style="text-align:right;padding:6px 8px">Imp. '+yCur+'</th><th style="text-align:right;padding:6px 8px">Imp. '+yPrev+'</th>'+
        '<th style="text-align:right;padding:6px 8px">Marg. '+yCur+'</th><th style="text-align:right;padding:6px 8px">Marg. '+yPrev+'</th></tr></thead><tbody>'+rows+'</tbody>'+
      '<tfoot><tr style="border-top:2px solid var(--accent);font-weight:600">'+
        '<td style="padding:6px 8px">Totale</td>'+
        '<td style="text-align:right;padding:6px 8px;font-family:var(--font-mono)">'+eL(tL.cur)+'</td><td style="text-align:right;padding:6px 8px;font-family:var(--font-mono)">'+eL(tL.prev)+'</td>'+
        '<td style="text-align:right;padding:6px 8px;font-family:var(--font-mono)">'+eE(tE.cur)+'</td><td style="text-align:right;padding:6px 8px;font-family:var(--font-mono)">'+eE(tE.prev)+'</td>'+
        '<td style="text-align:right;padding:6px 8px;font-family:var(--font-mono);color:#3B6D11">'+eM(tM.cur)+'</td><td style="text-align:right;padding:6px 8px;font-family:var(--font-mono)">'+eM(tM.prev)+'</td></tr></tfoot></table>';
    return;
  }

  var anno = _vppTableView === 'prev' ? yPrev : yCur;
  var D = _vppMonthly(anno);
  var tL=0,tE=0,tM=0, rows2='';
  for (var i=0;i<12;i++){
    if (!D.litri[i]) continue;
    tL+=D.litri[i]; tE+=D.euro[i]; tM+=D.marg[i];
    rows2 += '<tr><td style="font-weight:500">'+_VPP_MESI_FULL[i]+'</td>'+
      '<td style="text-align:right;font-family:var(--font-mono)">'+eL(D.litri[i])+'</td>'+
      '<td style="text-align:right;font-family:var(--font-mono)">'+eE(D.euro[i])+'</td>'+
      '<td style="text-align:right;font-family:var(--font-mono);color:#3B6D11">'+eM(D.marg[i])+'</td>'+
      '<td style="text-align:right;font-family:var(--font-mono);color:var(--text-muted)">'+perL(D.marg[i],D.litri[i])+'</td></tr>';
  }
  if (!rows2) rows2 = '<tr><td colspan="5" style="text-align:center;color:var(--text-muted);padding:14px">Nessuna vendita nel '+anno+'</td></tr>';
  host.innerHTML = '<table style="width:100%;font-size:13px;border-collapse:collapse"><thead>'+
    '<tr style="border-bottom:0.5px solid var(--border);color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.3px">'+
      '<th style="text-align:left;padding:6px 8px">Mese '+anno+'</th><th style="text-align:right;padding:6px 8px">Litri</th>'+
      '<th style="text-align:right;padding:6px 8px">Imponibile</th><th style="text-align:right;padding:6px 8px">Marginalità</th><th style="text-align:right;padding:6px 8px">€/l</th></tr></thead><tbody>'+rows2+'</tbody>'+
    '<tfoot><tr style="border-top:2px solid var(--accent);font-weight:600">'+
      '<td style="padding:6px 8px">Totale</td>'+
      '<td style="text-align:right;padding:6px 8px;font-family:var(--font-mono)">'+eL(tL)+'</td>'+
      '<td style="text-align:right;padding:6px 8px;font-family:var(--font-mono)">'+eE(tE)+'</td>'+
      '<td style="text-align:right;padding:6px 8px;font-family:var(--font-mono);color:#3B6D11">'+eM(tM)+'</td>'+
      '<td style="text-align:right;padding:6px 8px;font-family:var(--font-mono)">'+perL(tM,tL)+'</td></tr></tfoot></table>';
}

function _vppRenderLine() {
  var yCur = new Date().getFullYear(), yPrev = yCur - 1;
  var C = _vppMonthly(yCur), P = _vppMonthly(yPrev);
  var mlCur = C.litri.map(function(l,i){ return l>0 ? +(C.marg[i]/l).toFixed(4) : null; });
  var mlPrev = P.litri.map(function(l,i){ return l>0 ? +(P.marg[i]/l).toFixed(4) : null; });
  var leg = document.getElementById('vpp-line-legend');
  if (leg) leg.innerHTML =
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:2px;background:#185FA5"></span>'+yCur+'</span>' +
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:0;border-top:2px dashed #B4B2A9"></span>'+yPrev+'</span>';
  var ctx = document.getElementById('vpp-line'); if (!ctx) return;
  if (_chartVppLine) _chartVppLine.destroy();
  _chartVppLine = new Chart(ctx, {
    type:'line',
    data:{labels:_VPP_MESI,datasets:[
      {label:String(yCur),data:mlCur,borderColor:'#185FA5',borderWidth:2,tension:0,pointRadius:3,pointBackgroundColor:'#185FA5',spanGaps:true},
      {label:String(yPrev),data:mlPrev,borderColor:'#B4B2A9',borderWidth:2,borderDash:[5,4],tension:0,pointRadius:3,pointBackgroundColor:'#B4B2A9',spanGaps:true}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{mode:'index',intersect:false,callbacks:{label:function(c){return c.dataset.label+': € '+(c.parsed.y==null?'—':c.parsed.y.toFixed(4))+'/l';}}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:11},autoSkip:false}},y:{ticks:{font:{size:11},callback:function(v){return '€'+v.toFixed(3);}}}}
    }
  });
}

function vppSetUnit(u) { _vppUnit = u; _vppSyncButtons(); _vppRenderBar(); }
function vppSetTableView(v) { _vppTableView = v; _vppSyncButtons(); _vppRenderTable(); }
function _vppSyncButtons() {
  var act = function(id,on){ var b=document.getElementById(id); if(!b) return; b.style.background = on?'var(--accent)':'transparent'; b.style.color = on?'#fff':'var(--text)'; };
  act('vpp-u-litri', _vppUnit==='litri'); act('vpp-u-euro', _vppUnit==='euro');
  act('vpp-t-prev', _vppTableView==='prev'); act('vpp-t-cur', _vppTableView==='cur'); act('vpp-t-vs', _vppTableView==='vs');
}
