// ═══════════════════════════════════════════════════════════════════
// pf-vendite-cliente.js — Linguetta "Vendite per cliente" (sezione Clienti)
// (1) Grafico a BARRE biennale: anno corrente vs precedente, per mese,
//     toggle Litri / Euro (fatturato NETTO).
// (2) Grafico a LINEA PER SINGOLA VENDITA: prezzo, costo e marginalità €/l
//     — un punto = una vendita reale, NESSUNA media. Finestra manuale
//     Anno / Trimestre / Mese con frecce di scorrimento; default automatico
//     alla prima apertura in base al numero di vendite.
// SOLO LETTURA: nessuna scrittura su DB.
// ═══════════════════════════════════════════════════════════════════
let _vpcSelectPop = false;
let _vpcCliente = '';
let _vpcOrders = [];          // ordini del cliente, ordinati per data (asc)
let _vpcUnit = 'litri';       // 'litri' | 'euro'
let _vpcLevel = 'mese';       // 'anno' | 'trim' | 'mese'
let _vpcRef = null;           // Date di riferimento della finestra corrente
let _vpcAutoDone = false;     // default automatico già applicato per il cliente
let _chartVpcBar = null, _chartVpcLine = null;

const _VPC_MESI = ['Gen','Feb','Mar','Apr','Mag','Giu','Lug','Ago','Set','Ott','Nov','Dic'];
const _VPC_MESI_FULL = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];

function _vpcParseDate(s) {
  var p = String(s).slice(0,10).split('-');
  return new Date(Number(p[0]), Number(p[1])-1, Number(p[2]));
}

async function caricaVenditePerCliente() {
  var sel = document.getElementById('vpc-cliente');
  if (sel && !_vpcSelectPop) {
    var { data: cl } = await sb.from('clienti').select('nome').order('nome');
    var nomi = (cl||[]).map(function(c){return c.nome;}).filter(Boolean);
    sel.innerHTML = '<option value="">— scegli un cliente —</option>' +
      nomi.map(function(n){return '<option value="'+esc(n)+'">'+esc(n)+'</option>';}).join('');
    _vpcSelectPop = true;
  }
  if (_vpcCliente) vpcRender();
}

async function vpcCambiaCliente() {
  var sel = document.getElementById('vpc-cliente');
  _vpcCliente = sel ? sel.value : '';
  var body = document.getElementById('vpc-body');
  if (!_vpcCliente) {
    if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">Seleziona un cliente per vedere le analisi.</div>';
    return;
  }
  if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">⏳ Caricamento vendite...</div>';

  var flds = 'data,prodotto,litri,costo_litro,trasporto_litro,margine';
  var { data: raw } = await sb.from('ordini').select(flds).eq('tipo_ordine','cliente').eq('cliente', _vpcCliente).neq('stato','annullato').order('data').range(0,999);
  var ord = raw || [];
  if (ord.length === 1000) {
    var from = 1000;
    while (true) {
      var { data: b } = await sb.from('ordini').select(flds).eq('tipo_ordine','cliente').eq('cliente', _vpcCliente).neq('stato','annullato').order('data').range(from, from+999);
      if (!b || !b.length) break;
      ord = ord.concat(b);
      if (b.length < 1000) break;
      from += 1000;
    }
  }
  _vpcOrders = (ord||[]).filter(function(o){ return o.data && Number(o.litri) > 0; });
  _vpcAutoDone = false;
  vpcRender();
}

function _vpcBuildBody() {
  var body = document.getElementById('vpc-body');
  if (!body) return;
  body.innerHTML =
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
    if (body) body.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:40px;font-size:12px">Nessuna vendita registrata per questo cliente.</div>';
    return;
  }
  if (!_vpcAutoDone) {
    var ac = new Date().getFullYear();
    var nAnno = _vpcOrders.filter(function(o){ return String(o.data).slice(0,4) == String(ac); }).length;
    if (!nAnno) {
      var ultima = _vpcOrders[_vpcOrders.length-1];
      ac = Number(String(ultima.data).slice(0,4));
      nAnno = _vpcOrders.filter(function(o){ return String(o.data).slice(0,4) == String(ac); }).length;
    }
    _vpcLevel = nAnno > 60 ? 'mese' : nAnno > 20 ? 'trim' : 'anno';
    _vpcRef = _vpcParseDate(_vpcOrders[_vpcOrders.length-1].data);
    _vpcAutoDone = true;
  }
  _vpcRenderBar();
  _vpcRenderLine();
  _vpcSyncButtons();
}

function _vpcRenderBar() {
  var yCur = new Date().getFullYear(), yPrev = yCur - 1;
  var litriCur = new Array(12).fill(0), litriPrev = new Array(12).fill(0);
  var euroCur = new Array(12).fill(0), euroPrev = new Array(12).fill(0);
  _vpcOrders.forEach(function(o){
    var y = Number(String(o.data).slice(0,4)); var m = Number(String(o.data).slice(5,7)) - 1;
    if (m < 0 || m > 11) return;
    var l = Number(o.litri); var e = prezzoNoIva(o) * l;
    if (y === yCur) { litriCur[m]+=l; euroCur[m]+=e; }
    else if (y === yPrev) { litriPrev[m]+=l; euroPrev[m]+=e; }
  });
  var isEuro = _vpcUnit === 'euro';
  var dCur = (isEuro?euroCur:litriCur).map(function(v){return Math.round(v);});
  var dPrev = (isEuro?euroPrev:litriPrev).map(function(v){return Math.round(v);});

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
      plugins:{legend:{display:false},tooltip:{callbacks:{label:function(c){
        return c.dataset.label+': '+(isEuro?('€ '+c.parsed.y.toLocaleString('it-IT')):(c.parsed.y.toLocaleString('it-IT')+' L'));
      }}}},
      scales:{
        x:{grid:{display:false},ticks:{font:{size:11},autoSkip:false}},
        y:{beginAtZero:true,ticks:{font:{size:11},callback:function(v){return isEuro?('€'+Math.round(v/1000)+'k'):(Math.round(v/1000)+'k');}}}
      }
    }
  });
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
      scales:{
        x:{grid:{display:false},ticks:{font:{size:10},autoSkip:true,maxRotation:45}},
        y:{ticks:{font:{size:11},callback:function(v){return '€'+v.toFixed(2);}}}
      }
    }
  });
}

function vpcSetUnit(u) { _vpcUnit = u; _vpcSyncButtons(); _vpcRenderBar(); }
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
  act('vpc-l-anno', _vpcLevel==='anno'); act('vpc-l-trim', _vpcLevel==='trim'); act('vpc-l-mese', _vpcLevel==='mese');
}
