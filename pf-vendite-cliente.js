// ═══════════════════════════════════════════════════════════════════
// pf-vendite-cliente.js — Linguetta "Vendite per cliente" (sezione Clienti)
// Ricerca cliente a testo (digiti il nome). Per il cliente scelto:
// (1) BARRE biennali (anno corrente vs precedente, per mese) — toggle Litri/Euro netto.
// (2) TABELLA mensile — pulsanti anno prec. / anno corr. / VS (biennale affiancato):
//     totale litri, imponibile (netto) e marginalità totale per mese.
// (3) LINEA PER SINGOLA VENDITA (prezzo/costo/marginalità €/l) — un punto = una
//     vendita reale, nessuna media. Finestra Anno/Trimestre/Mese + frecce, default auto.
// SOLO LETTURA: nessuna scrittura su DB.
// ═══════════════════════════════════════════════════════════════════
let _vpcClienti = [];         // nomi di tutti i clienti (per la ricerca)
let _vpcSelectPop = false;
let _vpcCliente = '';
let _vpcOrders = [];          // ordini del cliente scelto, ordinati per data
let _vpcUnit = 'litri';       // 'litri' | 'euro'
let _vpcLevel = 'mese';       // 'anno' | 'trim' | 'mese'
let _vpcRef = null;           // Date di riferimento della finestra corrente
let _vpcAutoDone = false;
let _vpcTableView = 'cur';    // 'prev' | 'cur' | 'vs'
let _chartVpcBar = null, _chartVpcLine = null;

const _VPC_MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const _VPC_MESI_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function _vpcParseDate(s) { var p = String(s).slice(0,10).split('-'); return new Date(Number(p[0]), Number(p[1])-1, Number(p[2])); }

async function caricaVenditePerCliente() {
  if (!_vpcSelectPop) {
    var { data: cl } = await sb.from('clienti').select('nome').order('nome');
    _vpcClienti = (cl||[]).map(function(c){return c.nome;}).filter(Boolean);
    _vpcSelectPop = true;
  }
  if (_vpcCliente) vpcRender();
}

function vpcOnSearch() {
  var inp = document.getElementById('vpc-search');
  var res = document.getElementById('vpc-results');
  if (!inp || !res) return;
  var q = inp.value.trim().toLowerCase();
  if (!q) { res.style.display = 'none'; res.innerHTML = ''; return; }
  var matches = _vpcClienti.filter(function(n){ return n.toLowerCase().indexOf(q) >= 0; }).slice(0, 40);
  if (!matches.length) { res.style.display = 'block'; res.innerHTML = '<div style="padding:8px 10px;font-size:12px;color:var(--text-muted)">Nessun cliente trovato</div>'; return; }
  res.style.display = 'block';
  res.innerHTML = matches.map(function(n){
    var arg = String(n).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
    return '<div onclick="vpcSeleziona(this.getAttribute(\'data-n\'))" data-n="' + arg + '" style="padding:7px 10px;font-size:13px;cursor:pointer;border-bottom:0.5px solid var(--border)" onmouseover="this.style.background=\'var(--bg)\'" onmouseout="this.style.background=\'transparent\'">' + arg + '</div>';
  }).join('');
}

async function vpcSeleziona(nome) {
  _vpcCliente = nome;
  var inp = document.getElementById('vpc-search'); if (inp) inp.value = nome;
  var res = document.getElementById('vpc-results'); if (res) { res.style.display = 'none'; res.innerHTML = ''; }
  var body = document.getElementById('vpc-body');
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">⏳ Caricamento vendite...</div>';

  var flds = 'data,prodotto,litri,costo_litro,trasporto_litro,margine';
  var { data: raw } = await sb.from('ordini').select(flds).eq('tipo_ordine','cliente').eq('cliente', _vpcCliente).neq('stato','annullato').order('data').range(0,999);
  var ord = raw || [];
  if (ord.length === 1000) {
    var from = 1000;
    while (true) {
      var { data: b } = await sb.from('ordini').select(flds).eq('tipo_ordine','cliente').eq('cliente', _vpcCliente).neq('stato','annullato').order('data').range(from, from+999);
      if (!b || !b.length) break; ord = ord.concat(b); if (b.length < 1000) break; from += 1000;
    }
  }
  _vpcOrders = (ord||[]).filter(function(o){ return o.data && Number(o.litri) > 0; });
  _vpcAutoDone = false;
  vpcRender();
}

function _vpcBuildBody() {
  var body = document.getElementById('vpc-body');
  if (!body) return;
  var yCur = new Date().getFullYear(), yPrev = yCur - 1;
  body.innerHTML =
    // ── BARRE ──
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
      '<div style="font-size:14px;font-weight:500">Confronto annuo · per mese</div>' +
      '<div style="display:inline-flex;border:0.5px solid var(--border);border-radius:8px;overflow:hidden">' +
        '<button id="vpc-u-litri" onclick="vpcSetUnit(\'litri\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">Litri</button>' +
        '<button id="vpc-u-euro" onclick="vpcSetUnit(\'euro\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">Euro (netto)</button>' +
      '</div>' +
    '</div>' +
    '<div id="vpc-bar-legend" style="display:flex;gap:16px;margin-bottom:8px;font-size:12px;color:var(--text-secondary)"></div>' +
    '<div style="position:relative;width:100%;height:260px"><canvas id="vpc-bar" role="img" aria-label="Litri o fatturato per mese, anno corrente contro precedente"></canvas></div>' +
    '<div style="height:1px;background:var(--border);margin:20px 0 14px"></div>' +
    // ── TABELLA MENSILE ──
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:10px">' +
      '<div style="font-size:14px;font-weight:500">Dettaglio mensile</div>' +
      '<div style="display:inline-flex;border:0.5px solid var(--border);border-radius:8px;overflow:hidden">' +
        '<button id="vpc-t-prev" onclick="vpcSetTableView(\'prev\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">' + yPrev + '</button>' +
        '<button id="vpc-t-cur" onclick="vpcSetTableView(\'cur\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">' + yCur + '</button>' +
        '<button id="vpc-t-vs" onclick="vpcSetTableView(\'vs\')" style="border:0;padding:6px 14px;font-size:13px;cursor:pointer">VS</button>' +
      '</div>' +
    '</div>' +
    '<div id="vpc-table" style="overflow-x:auto;margin-bottom:6px"></div>' +
    '<div style="height:1px;background:var(--border);margin:20px 0 14px"></div>' +
    // ── LINEA PER SINGOLA VENDITA ──
    '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;margin-bottom:8px">' +
      '<div style="font-size:14px;font-weight:500">Prezzo · costo · marginalità <span style="font-size:12px;color:var(--text-muted)">€/l — per singola vendita</span></div>' +
      '<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">' +
        '<div style="display:inline-flex;border:0.5px solid var(--border);border-radius:8px;overflow:hidden">' +
          '<button id="vpc-l-anno" onclick="vpcSetLevel(\'anno\')" style="border:0;padding:6px 12px;font-size:13px;cursor:pointer">Anno</button>' +
          '<button id="vpc-l-trim" onclick="vpcSetLevel(\'trim\')" style="border:0;padding:6px 12px;font-size:13px;cursor:pointer">Trimestre</button>' +
          '<button id="vpc-l-mese" onclick="vpcSetLevel(\'mese\')" style="border:0;padding:6px 12px;font-size:13px;cursor:pointer">Mese</button>' +
        '</div>' +
        '<div style="display:inline-flex;gap:4px;align-items:center">' +
          '<button onclick="vpcNav(-1)" aria-label="Finestra precedente" style="border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;padding:5px 10px;font-size:14px">‹</button>' +
          '<span id="vpc-window-label" style="font-size:12px;font-weight:500;min-width:96px;text-align:center"></span>' +
          '<button onclick="vpcNav(1)" aria-label="Finestra successiva" style="border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);cursor:pointer;padding:5px 10px;font-size:14px">›</button>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div style="display:flex;gap:16px;margin-bottom:8px;font-size:12px;color:var(--text-secondary);flex-wrap:wrap">' +
      '<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:2px;background:#185FA5"></span>Prezzo €/l</span>' +
      '<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:2px;background:#A32D2D"></span>Costo €/l</span>' +
      '<span style="display:flex;align-items:center;gap:5px"><span style="width:14px;height:0;border-top:2px dashed #3B6D11"></span>Marginalità €/l</span>' +
    '</div>' +
    '<div id="vpc-line-empty" style="display:none;text-align:center;color:var(--text-muted);padding:20px;font-size:12px"></div>' +
    '<div style="position:relative;width:100%;height:300px"><canvas id="vpc-line" role="img" aria-label="Prezzo, costo e marginalità per litro per ogni singola vendita"></canvas></div>';
}

function vpcRender() {
  if (!_vpcCliente) return;
  if (!document.getElementById('vpc-bar')) _vpcBuildBody();
  if (!_vpcOrders.length) {
    var body = document.getElementById('vpc-body');
    if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">Nessuna vendita registrata per <strong>' + esc(_vpcCliente) + '</strong>.</div>';
    return;
  }
  if (!_vpcAutoDone) {
    var ac = new Date().getFullYear();
    var nAnno = _vpcOrders.filter(function(o){ return String(o.data).slice(0,4) == String(ac); }).length;
    if (!nAnno) { var ultima = _vpcOrders[_vpcOrders.length-1]; ac = Number(String(ultima.data).slice(0,4)); nAnno = _vpcOrders.filter(function(o){ return String(o.data).slice(0,4) == String(ac); }).length; }
    _vpcLevel = nAnno > 60 ? 'mese' : nAnno > 20 ? 'trim' : 'anno';
    _vpcRef = _vpcParseDate(_vpcOrders[_vpcOrders.length-1].data);
    _vpcAutoDone = true;
  }
  _vpcRenderBar();
  _vpcRenderTable();
  _vpcRenderLine();
  _vpcSyncButtons();
}

function _vpcMonthly(anno) {
  var litri = new Array(12).fill(0), euro = new Array(12).fill(0), marg = new Array(12).fill(0);
  _vpcOrders.forEach(function(o){
    if (Number(String(o.data).slice(0,4)) !== anno) return;
    var m = Number(String(o.data).slice(5,7)) - 1; if (m < 0 || m > 11) return;
    var l = Number(o.litri);
    litri[m] += l; euro[m] += prezzoNoIva(o) * l; marg[m] += Number(o.margine) * l;
  });
  return { litri:litri, euro:euro, marg:marg };
}

function _vpcRenderBar() {
  var yCur = new Date().getFullYear(), yPrev = yCur - 1;
  var cur = _vpcMonthly(yCur), prev = _vpcMonthly(yPrev);
  var isEuro = _vpcUnit === 'euro';
  var dCur = (isEuro?cur.euro:cur.litri).map(function(v){return Math.round(v);});
  var dPrev = (isEuro?prev.euro:prev.litri).map(function(v){return Math.round(v);});
  var leg = document.getElementById('vpc-bar-legend');
  if (leg) leg.innerHTML =
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#185FA5"></span>'+yCur+'</span>' +
    '<span style="display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:#B4B2A9"></span>'+yPrev+'</span>';
  var ctx = document.getElementById('vpc-bar'); if (!ctx) return;
  if (_chartVpcBar) _chartVpcBar.destroy();
  _chartVpcBar = new Chart(ctx, {
    type:'bar',
    data:{labels:_VPC_MESI,datasets:[
      {label:String(yCur),data:dCur,backgroundColor:'#185FA5',borderRadius:4,maxBarThickness:16},
      {label:String(yPrev),data:dPrev,backgroundColor:'#B4B2A9',borderRadius:4,maxBarThickness:16}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){return c.dataset.label+': '+(isEuro?('€ '+c.parsed.y.toLocaleString('it-IT')):(c.parsed.y.toLocaleString('it-IT')+' L'));}}}},
      scales:{x:{grid:{display:false},ticks:{font:{size:11},autoSkip:false}},y:{beginAtZero:true,ticks:{font:{size:11},callback:function(v){return isEuro?('€'+Math.round(v/1000)+'k'):(Math.round(v/1000)+'k');}}}}
    }
  });
}

function _vpcRenderTable() {
  var host = document.getElementById('vpc-table'); if (!host) return;
  var yCur = new Date().getFullYear(), yPrev = yCur - 1;
  var eL = function(v){ return v>0 ? fmtL(v) : '—'; };
  var eE = function(v){ return v>0 ? fmtE(v) : '—'; };
  var eM = function(v){ return v!==0 ? fmtMe(v) : '—'; };
  var perL = function(m,l){ return l>0 ? ('€ '+(m/l).toFixed(4)) : '—'; };

  if (_vpcTableView === 'vs') {
    var C = _vpcMonthly(yCur), P = _vpcMonthly(yPrev);
    var tL={cur:0,prev:0}, tE={cur:0,prev:0}, tM={cur:0,prev:0};
    var rows = '';
    for (var m=0;m<12;m++){
      if (!C.litri[m] && !P.litri[m]) continue;
      tL.cur+=C.litri[m]; tL.prev+=P.litri[m]; tE.cur+=C.euro[m]; tE.prev+=P.euro[m]; tM.cur+=C.marg[m]; tM.prev+=P.marg[m];
      rows += '<tr><td style="font-weight:500">'+_VPC_MESI_FULL[m]+'</td>'+
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

  var anno = _vpcTableView === 'prev' ? yPrev : yCur;
  var D = _vpcMonthly(anno);
  var tL=0,tE=0,tM=0, rows2='';
  for (var i=0;i<12;i++){
    if (!D.litri[i]) continue;
    tL+=D.litri[i]; tE+=D.euro[i]; tM+=D.marg[i];
    rows2 += '<tr><td style="font-weight:500">'+_VPC_MESI_FULL[i]+'</td>'+
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

function _vpcWindow() {
  var r = _vpcRef || new Date();
  var y = r.getFullYear();
  if (_vpcLevel === 'anno') return {start:new Date(y,0,1), end:new Date(y,11,31,23,59,59), label:String(y)};
  if (_vpcLevel === 'trim') { var q = Math.floor(r.getMonth()/3); return {start:new Date(y,q*3,1), end:new Date(y,q*3+3,0,23,59,59), label:(q+1)+'° trim '+y}; }
  var m = r.getMonth(); return {start:new Date(y,m,1), end:new Date(y,m+1,0,23,59,59), label:_VPC_MESI_FULL[m]+' '+y};
}

function _vpcRenderLine() {
  var w = _vpcWindow();
  var lbl = document.getElementById('vpc-window-label'); if (lbl) lbl.textContent = w.label;
  var inWin = _vpcOrders.filter(function(o){ var d = _vpcParseDate(o.data); return d >= w.start && d <= w.end; });
  var empty = document.getElementById('vpc-line-empty');
  var cnv = document.getElementById('vpc-line');
  if (!inWin.length) {
    if (_chartVpcLine) { _chartVpcLine.destroy(); _chartVpcLine = null; }
    if (empty) { empty.style.display='block'; empty.textContent = 'Nessuna vendita in '+w.label+'.'; }
    if (cnv) cnv.style.display = 'none';
    return;
  }
  if (empty) empty.style.display = 'none';
  if (cnv) cnv.style.display = 'block';
  var labels = inWin.map(function(o){ var d=_vpcParseDate(o.data); return String(d.getDate()).padStart(2,'0')+'/'+String(d.getMonth()+1).padStart(2,'0'); });
  var prezzo = inWin.map(function(o){ return +prezzoNoIva(o).toFixed(4); });
  var costo  = inWin.map(function(o){ return +(Number(o.costo_litro)+Number(o.trasporto_litro)).toFixed(4); });
  var margine= inWin.map(function(o){ return +Number(o.margine).toFixed(4); });
  if (_chartVpcLine) _chartVpcLine.destroy();
  _chartVpcLine = new Chart(cnv, {
    type:'line',
    data:{labels:labels,datasets:[
      {label:'Prezzo',data:prezzo,borderColor:'#185FA5',borderWidth:2,tension:0,pointRadius:3,pointBackgroundColor:'#185FA5'},
      {label:'Costo',data:costo,borderColor:'#A32D2D',borderWidth:2,tension:0,pointRadius:3,pointBackgroundColor:'#A32D2D'},
      {label:'Marginalità',data:margine,borderColor:'#3B6D11',borderWidth:2,borderDash:[5,4],tension:0,pointRadius:3,pointBackgroundColor:'#3B6D11'}
    ]},
    options:{responsive:true,maintainAspectRatio:false,
      plugins:{legend:{display:false},tooltip:{mode:'index',intersect:false,callbacks:{
        title:function(c){ var o=inWin[c[0].dataIndex]; return 'Vendita '+c[0].label+(o&&o.prodotto?(' · '+o.prodotto):'')+(o?(' · '+Math.round(o.litri)+' L'):''); },
        label:function(c){ return c.dataset.label+': € '+c.parsed.y.toFixed(4); }
      }}},
      scales:{x:{grid:{display:false},ticks:{font:{size:10},autoSkip:true,maxRotation:45}},y:{ticks:{font:{size:11},callback:function(v){return '€'+v.toFixed(2);}}}}
    }
  });
}

function vpcSetUnit(u) { _vpcUnit = u; _vpcSyncButtons(); _vpcRenderBar(); }
function vpcSetTableView(v) { _vpcTableView = v; _vpcSyncButtons(); _vpcRenderTable(); }
function vpcSetLevel(l) { _vpcLevel = l; _vpcSyncButtons(); _vpcRenderLine(); }
function vpcNav(dir) {
  if (!_vpcRef) _vpcRef = new Date();
  var r = new Date(_vpcRef.getTime());
  if (_vpcLevel === 'anno') r.setFullYear(r.getFullYear()+dir);
  else if (_vpcLevel === 'trim') r.setMonth(r.getMonth()+dir*3);
  else r.setMonth(r.getMonth()+dir);
  _vpcRef = r; _vpcRenderLine();
}
function _vpcSyncButtons() {
  var act = function(id,on){ var b=document.getElementById(id); if(!b) return; b.style.background = on?'var(--accent)':'transparent'; b.style.color = on?'#fff':'var(--text)'; };
  act('vpc-u-litri', _vpcUnit==='litri'); act('vpc-u-euro', _vpcUnit==='euro');
  act('vpc-t-prev', _vpcTableView==='prev'); act('vpc-t-cur', _vpcTableView==='cur'); act('vpc-t-vs', _vpcTableView==='vs');
  act('vpc-l-anno', _vpcLevel==='anno'); act('vpc-l-trim', _vpcLevel==='trim'); act('vpc-l-mese', _vpcLevel==='mese');
}
