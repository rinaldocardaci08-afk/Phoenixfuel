// PhoenixFuel — Deposito: Giacenze mensili
// ═══════════════════════════════════════════════════════════════════

var _depGmDati = null;
var _depGmTrim = 1;
var _depGmMesi = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno',
                   'Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
// Coefficienti cali tecnici deposito (più bassi della stazione, cisterne fisse)
var _depGmCoeff = { 'default': 0.00020 };

function switchTrimestreDeposito(btn) {
  document.querySelectorAll('.dep-gm-trim').forEach(function(t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = 'var(--primary)'; btn.style.color = '#fff';
  btn.style.border = 'none'; btn.classList.add('active');
  _depGmTrim = parseInt(btn.dataset.trim);
  renderGiacenzeMensiliDeposito();
}

async function caricaGiacenzeMensiliDeposito() {
  var selAnno = document.getElementById('dep-gm-anno');
  if (selAnno && selAnno.options.length === 0) {
    var annoCorr = new Date().getFullYear();
    for (var y = annoCorr; y >= annoCorr - 5; y--) {
      selAnno.innerHTML += '<option value="' + y + '"' + (y === annoCorr ? ' selected' : '') + '>' + y + '</option>';
    }
  }
  var anno = parseInt(selAnno.value);
  var contenuto = document.getElementById('dep-gm-contenuto');
  if (contenuto) contenuto.innerHTML = '<div class="loading">Caricamento dati...</div>';

  // Prodotti dalle cisterne deposito
  var { data: cisterne } = await sb.from('cisterne').select('prodotto').eq('sede','deposito_vibo');
  var prodottiSet = {};
  (cisterne||[]).forEach(function(c){ if(c.prodotto) prodottiSet[c.prodotto]=true; });
  var _depProdOrd = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO','AdBlue'];
  var prodotti = Object.keys(prodottiSet).sort(function(a,b){
    var ia = _depProdOrd.indexOf(a); if(ia<0) ia=99;
    var ib = _depProdOrd.indexOf(b); if(ib<0) ib=99;
    return ia - ib;
  });
  if (!prodotti.length) prodotti = ['Gasolio Autotrazione'];

  // Coefficienti cali tecnici deposito
  _depGmCoeff = {};
  prodotti.forEach(function(p) {
    _depGmCoeff[p] = p.toLowerCase().indexOf('benzina') >= 0 ? 0.00050 : 0.00025;
  });

  var daISO = anno + '-01-01';
  var aISO  = anno + '-12-31';

  // Carica dati salvati (stessa tabella giacenze_mensili con sede='deposito_vibo')
  var { data: salvati } = await sb.from('giacenze_mensili')
    .select('*').eq('anno', anno).eq('sede','deposito_vibo').order('mese');
  var salvMap = {};
  (salvati||[]).forEach(function(s){ salvMap[s.prodotto+'_'+s.mese]=s; });

  // Giacenza inizio anno: da chiusura anno precedente o giacenze_annuali
  var giacInizioAnno = {};
  var [giacPrecRes, giacAnnualiRes] = await Promise.all([
    sb.from('giacenze_mensili').select('prodotto,giacenza_rilevata')
      .eq('anno', anno-1).eq('mese', 12).eq('sede','deposito_vibo'),
    sb.from('giacenze_annuali').select('prodotto,giacenza_reale')
      .eq('anno', anno-1).eq('sede','deposito_vibo').eq('convalidata', true)
  ]);
  // Prima priorità: giacenza mensile dicembre anno precedente
  (giacPrecRes.data||[]).forEach(function(g){
    if (g.giacenza_rilevata !== null) giacInizioAnno[g.prodotto] = Number(g.giacenza_rilevata);
  });
  // Seconda priorità: giacenze annuali convalidate anno precedente
  (giacAnnualiRes.data||[]).forEach(function(g){
    if (giacInizioAnno[g.prodotto] === undefined && g.giacenza_reale !== null) {
      giacInizioAnno[g.prodotto] = Number(g.giacenza_reale);
    }
  });
  // Fallback: primo mese salvato
  prodotti.forEach(function(p){
    if (giacInizioAnno[p] === undefined) {
      var s1 = salvMap[p+'_1'];
      giacInizioAnno[p] = (s1 && Number(s1.giacenza_inizio) > 0) ? Number(s1.giacenza_inizio) : 0;
    }
  });

  // Carica entrate e uscite in parallelo
  // FIX 13/04 sera: usiamo STATI_VALIDI=['confermato','consegnato'] coerente con
  // pf-data.js, dashboard, giornaliera, settimanale. Prima usava .neq('annullato')
  // che includeva anche 'in_attesa' e 'programmato' gonfiando i totali.
  var STATI_VALIDI = ['confermato','consegnato'];
  var [entrateRes, uscCliRes, uscStaRes, uscAutoRes] = await Promise.all([
    sb.from('ordini').select('data,prodotto,litri')
      .eq('tipo_ordine','entrata_deposito').in('stato', STATI_VALIDI)
      .gte('data', daISO).lte('data', aISO),
    sb.from('ordini').select('data,prodotto,litri')
      .eq('tipo_ordine','cliente').in('stato', STATI_VALIDI)
      .or('fornitore.ilike.%phoenix%,fornitore.ilike.%deposito%')
      .gte('data', daISO).lte('data', aISO),
    sb.from('ordini').select('data,prodotto,litri')
      .eq('tipo_ordine','stazione_servizio').in('stato', STATI_VALIDI)
      .or('fornitore.ilike.%phoenix%,fornitore.ilike.%deposito%')
      .gte('data', daISO).lte('data', aISO),
    sb.from('ordini').select('data,prodotto,litri')
      .eq('tipo_ordine','autoconsumo').in('stato', STATI_VALIDI)
      .gte('data', daISO).lte('data', aISO)
  ]);

  // Aggrega per mese/prodotto
  var entrateMese = {}, usciteMese = {};
  (entrateRes.data||[]).forEach(function(o){
    var m = parseInt(o.data.substring(5,7));
    var k = o.prodotto+'_'+m;
    entrateMese[k] = (entrateMese[k]||0) + Number(o.litri);
  });
  [uscCliRes.data, uscStaRes.data, uscAutoRes.data].forEach(function(arr){
    (arr||[]).forEach(function(o){
      var m = parseInt(o.data.substring(5,7));
      var k = o.prodotto+'_'+m;
      usciteMese[k] = (usciteMese[k]||0) + Number(o.litri);
    });
  });

  // Costruisci risultato per prodotto/mese
  var risultato = {};
  prodotti.forEach(function(prod){
    risultato[prod] = [];
    var giacCorr = giacInizioAnno[prod] || 0;
    var diffCum = 0;
    for (var m = 1; m <= 12; m++) {
      var k = prod+'_'+m;
      var salv = salvMap[k] || {};
      var entrate   = entrateMese[k]  || 0;
      var uscite    = usciteMese[k]   || 0;
      var eccedenze = Number(salv.eccedenze_viaggio || 0);
      var caliV     = Number(salv.cali_viaggio || 0);
      var scattiV   = Number(salv.scatti_vuoto || 0);
      var coeff     = _depGmCoeff[prod] || 0.00020;
      var caliSug   = Math.round(entrate * coeff * 100) / 100;
      // caliTecnici: usa il valore manuale se inserito, altrimenti suggerito DM55/2000
      var caliManuale = (salv.cali_tecnici !== undefined && salv.cali_tecnici !== null);
      var caliTec   = caliManuale ? Number(salv.cali_tecnici) : caliSug;
      var giacRilev = (salv.giacenza_rilevata !== undefined && salv.giacenza_rilevata !== null)
                      ? Number(salv.giacenza_rilevata) : null;
      var giacPresunta = Math.round((giacCorr + entrate + eccedenze - caliV - caliTec - scattiV - uscite) * 100) / 100;
      var diffMese  = giacRilev !== null ? Math.round((giacPresunta - giacRilev) * 100) / 100 : null;
      if (diffMese !== null) diffCum = Math.round((diffCum + diffMese) * 100) / 100;
      risultato[prod].push({
        mese:m, giacInizio:Math.round(giacCorr), entrate:entrate, uscite:uscite,
        eccedenze:eccedenze, caliViaggio:caliV, caliSuggeriti:caliSug, caliTecnici:caliTec, caliManuale:caliManuale,
        giacPresunta:giacPresunta, giacRilevata:giacRilev,
        diffMese:diffMese, diffCumulata:(giacRilev!==null ? diffCum : null),
        // Stato chiusura (19/04/2026) - NUOVO
        id: salv.id || null,
        chiusoIl: salv.chiuso_il || null,
        chiusoDa: salv.chiuso_da || null,
        scattiVuoto: Number(salv.scatti_vuoto || 0)
      });
      giacCorr = giacRilev !== null ? giacRilev : giacPresunta;
    }
  });

  _depGmDati = { prodotti:prodotti, mesi:risultato, anno:anno, giacInizioAnno:giacInizioAnno };
  renderGiacenzeMensiliDeposito();
}

function renderGiacenzeMensiliDeposito() {
  if (!_depGmDati) return;
  var container = document.getElementById('dep-gm-contenuto');
  if (!container) return;
  var trim = _depGmTrim;

  if (trim === 0) {
    // Vista totali anno
    container.innerHTML = _depGmRenderTotali();
    return;
  }

  var mesiIdx = trim===1?[0,1,2]:trim===2?[3,4,5]:trim===3?[6,7,8]:[9,10,11];
  var html = '';

  _depGmDati.prodotti.forEach(function(prod) {
    var dati   = _depGmDati.mesi[prod];
    var coeff  = _depGmCoeff[prod] || 0.00020;
    var pi     = cacheProdotti ? cacheProdotti.find(function(p){return p.nome===prod;}) : null;
    var col    = pi ? pi.colore : '#D85A30';

    html += '<div style="font-size:12px;font-weight:600;color:#D85A30;text-transform:uppercase;letter-spacing:0.4px;border-bottom:2px solid #D85A30;padding-bottom:4px;margin:14px 0 6px;display:flex;align-items:center;gap:6px">';
    html += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:'+col+'"></span>' + esc(prod);
    html += '<span style="font-size:9px;color:var(--text-muted);font-weight:400;text-transform:none">(cali: entrate × '+coeff+')</span></div>';

    html += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:11px"><thead><tr>';
    html += '<th style="text-align:left;padding:6px 8px;border:0.5px solid var(--border);background:var(--bg);font-size:9px;text-transform:uppercase;min-width:180px"></th>';
    mesiIdx.forEach(function(i){
      html += '<th style="text-align:right;padding:6px 8px;border:0.5px solid var(--border);background:var(--bg);font-size:10px;text-transform:uppercase;min-width:90px">'+_depGmMesi[i]+'</th>';
    });
    html += '</tr></thead><tbody>';

    var righe = [
      { key:'giacInizio', label:'Giacenza inizio mese',    bg:'#E6F1FB', color:'#0C447C', auto:true },
      { key:'entrate',    label:'+ Entrate (carichi)',     bg:'#E6F1FB', color:'#0C447C', auto:true },
      { key:'uscite',     label:'- Uscite (vendite+staz)', bg:'#FCEBEB', color:'#791F1F', auto:true, neg:true },
      { key:'eccedenze',  label:'+ Eccedenze viaggio',     bg:'#FAEEDA', color:'#633806', input:'eccedenze_viaggio' },
      { key:'caliViaggio',label:'- Cali viaggio',          bg:'#FAEEDA', color:'#633806', input:'cali_viaggio', neg:true },
      { key:'caliTecnici',label:'- Cali tecnici',          bg:'#EEEDFE', color:'#3C3489', input:'cali_tecnici', neg:true, suggerito:'caliSuggeriti', manuale:'caliManuale' },
      { key:'scattiVuoto',label:'- Scatti a vuoto',        bg:'#EEEDFE', color:'#3C3489', input:'scatti_vuoto', neg:true },
      { key:'giacPresunta',label:'= Giacenza teorica',     bg:'#EAF3DE', color:'#27500A', auto:true, bold:true },
    ];

    righe.forEach(function(riga) {
      html += '<tr style="background:'+riga.bg+'">';
      html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-size:10px;color:'+riga.color+';font-weight:'+(riga.bold?'700':'400')+'">'+(riga.neg?'':'')+'<span style="color:'+riga.color+'">'+riga.label+'</span></td>';
      mesiIdx.forEach(function(i) {
        var d = dati[i];
        var val = d[riga.key];
        var meseChiuso = !!d.chiusoIl;
        if (riga.input && !riga.auto) {
          var savedVal = val !== null && val !== undefined ? val : '';
          html += '<td style="padding:3px 4px;border:0.5px solid var(--border)">';
          html += '<input type="number" class="dep-gm-input" ';
          html += 'data-prod="'+esc(prod)+'" data-mese="'+(i+1)+'" data-campo="'+riga.input+'" ';
          html += 'value="'+(savedVal||'')+'" placeholder="0" step="0.01" ';
          html += 'oninput="aggiornaRigheDeposito(this)" ';
          if (meseChiuso) html += 'disabled ';
          // Stile input: bordo verde se valore manuale inserito, normale altrimenti
          // Distingui tra valore manuale e suggerito DM55
          var isManualeOra = riga.manuale ? d[riga.manuale] : false;
          var borderStile = isManualeOra ? '1.5px solid #27500A' : '0.5px solid var(--border)';
          var bgStile = meseChiuso ? '#eee' : (isManualeOra ? '#fff' : '#f8f7ff');
          html += 'style="width:85px;font-family:var(--font-mono);font-size:12px;padding:4px 6px;border:'+borderStile+';border-radius:4px;background:'+bgStile+';color:#1a1a18;text-align:right'+(meseChiuso?';cursor:not-allowed;opacity:0.6':'')+'">';
          // Hint sotto input
          if (riga.suggerito) {
            if (isManualeOra) {
              html += '<div style="font-size:9px;color:#27500A;margin-top:2px">✓ manuale</div>';
            } else {
              html += '<div style="font-size:9px;color:#9b8fcf;margin-top:2px">📐 DM55/2000</div>';
            }
          }
          html += '</td>';
        } else {
          var display = val !== null && val !== undefined ? _sep(Math.round(val).toLocaleString('it-IT'))+' L' : '—';
          html += '<td style="text-align:right;padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);font-size:12px;font-weight:'+(riga.bold?'700':'400')+';color:'+riga.color+'">'+display+'</td>';
        }
      });
      html += '</tr>';
    });

    // Riga giacenza rilevata (input) - solo informativa, resta editabile anche con mese chiuso
    html += '<tr style="background:#fff;border-top:2px solid #D85A30">';
    html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-size:10px;font-weight:700;color:#D85A30">📏 Giacenza rilevata (asta) <span style="font-weight:400;font-size:9px;color:var(--text-muted)">solo osservazione</span></td>';
    mesiIdx.forEach(function(i){
      var d = dati[i];
      var rilev = d.giacRilevata;
      html += '<td style="padding:3px 4px;border:0.5px solid var(--border)">';
      html += '<input type="number" class="dep-gm-input" ';
      html += 'data-prod="'+esc(prod)+'" data-mese="'+(i+1)+'" data-campo="giacenza_rilevata" ';
      html += 'value="'+(rilev!==null&&rilev!==undefined?rilev:'')+'" placeholder="Litri rilevati" step="1" ';
      html += 'oninput="aggiornaRigheDeposito(this)" ';
      html += 'style="width:85px;font-family:var(--font-mono);font-size:12px;padding:4px 6px;border:1.5px solid #D85A30;border-radius:4px;background:#fff;color:#1a1a18;text-align:right">';
      html += '</td>';
    });
    html += '</tr>';

    // Riga differenza
    html += '<tr style="background:#f9f9f7">';
    html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-size:10px;color:var(--text-muted)">Δ Differenza (teorica - rilevata)</td>';
    mesiIdx.forEach(function(i){
      var d = dati[i];
      var diffTxt = '—', diffCol = 'var(--text-muted)';
      if (d.diffMese !== null) {
        diffTxt = (d.diffMese > 0 ? '+' : '') + Math.round(d.diffMese).toLocaleString('it-IT') + ' L';
        diffCol = d.diffMese === 0 ? '#639922' : Math.abs(d.diffMese) < 200 ? '#BA7517' : '#A32D2D';
      }
      html += '<td style="text-align:right;padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);font-size:12px;color:'+diffCol+'">'+diffTxt+'</td>';
    });
    html += '</tr>';

    // Riga differenza cumulata
    html += '<tr style="background:#f5f5f0">';
    html += '<td style="padding:5px 8px;border:0.5px solid var(--border);font-size:10px;color:var(--text-muted)">Δ Cumulata anno</td>';
    mesiIdx.forEach(function(i){
      var d = dati[i];
      var cumTxt = '—', cumCol = 'var(--text-muted)';
      if (d.diffCumulata !== null) {
        cumTxt = (d.diffCumulata > 0 ? '+' : '') + Math.round(d.diffCumulata).toLocaleString('it-IT') + ' L';
        cumCol = Math.abs(d.diffCumulata) < 500 ? '#639922' : Math.abs(d.diffCumulata) < 2000 ? '#BA7517' : '#A32D2D';
      }
      html += '<td style="text-align:right;padding:5px 8px;border:0.5px solid var(--border);font-family:var(--font-mono);font-size:12px;font-weight:600;color:'+cumCol+'">'+cumTxt+'</td>';
    });
    html += '</tr>';

    // Riga bottoni CHIUSURA MESE (19/04/2026 - nuovo)
    html += '<tr style="background:#fafafa">';
    html += '<td style="padding:6px 8px;border:0.5px solid var(--border);font-size:10px;color:var(--text-muted);font-weight:600">🔒 Chiusura mese</td>';
    mesiIdx.forEach(function(i){
      var d = dati[i];
      var mese = i+1;
      html += '<td style="padding:6px 4px;border:0.5px solid var(--border);text-align:center">';
      if (d.chiusoIl) {
        var dataChius = new Date(d.chiusoIl).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'2-digit'});
        html += '<div style="font-size:9px;color:#27500A;margin-bottom:4px">🔒 ' + dataChius + '</div>';
        html += '<button onclick="_depRiapriMese(\''+esc(prod)+'\','+mese+')" style="padding:3px 8px;background:#fff;border:0.5px solid #A32D2D;color:#A32D2D;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600" title="Riapri mese (solo admin)">🔓 Riapri</button>';
      } else {
        var haValori = d.eccedenze>0 || d.caliViaggio>0 || d.caliTecnici>0 || (d.scattiVuoto||0)>0;
        if (haValori) {
          html += '<button onclick="_depChiudiMese(\''+esc(prod)+'\','+mese+')" style="padding:4px 10px;background:#D85A30;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:10px;font-weight:600">🔒 Chiudi</button>';
        } else {
          html += '<span style="font-size:9px;color:var(--text-muted)">—</span>';
        }
      }
      html += '</td>';
    });
    html += '</tr>';

    html += '</tbody></table></div>';
  });

  container.innerHTML = html || '<div class="loading">Nessun dato disponibile</div>';
}

function aggiornaRigheDeposito(input) {
  // Ricalcola riga teorica in tempo reale aggiornando il DOM
  var prod = input.dataset.prod;
  var mese = parseInt(input.dataset.mese);
  var campo = input.dataset.campo;
  var val   = parseFloat(input.value) || 0;

  if (!_depGmDati || !_depGmDati.mesi[prod]) return;
  var d = _depGmDati.mesi[prod][mese-1];
  if (!d) return;

  // Aggiorna il valore nel dato
  if (campo === 'eccedenze_viaggio') d.eccedenze    = val;
  else if (campo === 'cali_viaggio') d.caliViaggio  = val;
  else if (campo === 'cali_tecnici') d.caliTecnici  = val;
  else if (campo === 'scatti_vuoto') d.scattiVuoto  = val;
  else if (campo === 'giacenza_rilevata') d.giacRilevata = val || null;

  // Ricalcola giacenza presunta
  d.giacPresunta = Math.round((d.giacInizio + d.entrate + d.eccedenze - d.caliViaggio - d.caliTecnici - (d.scattiVuoto||0) - d.uscite) * 100) / 100;
  d.diffMese = d.giacRilevata !== null ? Math.round((d.giacPresunta - d.giacRilevata) * 100) / 100 : null;

  // Ri-render trimestre corrente
  renderGiacenzeMensiliDeposito();
}

async function salvaGiacenzeMensiliDeposito() {
  if (!_depGmDati) { toast('Carica prima i dati'); return; }
  var anno  = _depGmDati.anno;
  var ops   = [];
  var count = 0;

  document.querySelectorAll('.dep-gm-input').forEach(function(inp) {
    var val = inp.value;
    if (val === '' || val === null) return;
    var prod  = inp.dataset.prod;
    var mese  = parseInt(inp.dataset.mese);
    var campo = inp.dataset.campo;
    var num   = parseFloat(val);
    if (isNaN(num)) return;

    var rec = { anno:anno, sede:'deposito_vibo', prodotto:prod, mese:mese };
    rec[campo] = num;
    ops.push(sb.from('giacenze_mensili').upsert(rec, { onConflict:'anno,sede,prodotto,mese' }));
    count++;
  });

  if (!ops.length) { toast('Nessun dato da salvare'); return; }
  var results = await Promise.all(ops);
  var err = results.find(function(r){ return r.error; });
  if (err) { toast('Errore: '+err.error.message); return; }
  toast('✓ '+count+' valori salvati!');
  await caricaGiacenzeMensiliDeposito();
}

function _depGmRenderTotali() {
  if (!_depGmDati) return '';
  var fmtL = function(v){ return Number(v||0).toLocaleString('it-IT',{maximumFractionDigits:0})+' L'; };
  var fmtE = function(v){ return '€ '+Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}); };
  var html = '';

  _depGmDati.prodotti.forEach(function(prod){
    var dati = _depGmDati.mesi[prod];
    var pi = cacheProdotti ? cacheProdotti.find(function(p){return p.nome===prod;}) : null;
    var col = pi ? pi.colore : '#D85A30';
    var totEnt=0, totUsc=0, totCali=0;
    dati.forEach(function(d){ totEnt+=d.entrate; totUsc+=d.uscite; totCali+=d.caliTecnici||0; });
    var giacFinale = (_depGmDati.giacInizioAnno[prod]||0) + totEnt - totUsc - totCali;

    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:5px solid '+col+';border-radius:10px;padding:14px;margin-bottom:12px">';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px">';
    html += '<div style="width:12px;height:12px;border-radius:50%;background:'+col+'"></div>';
    html += '<strong style="font-size:16px">'+esc(prod)+'</strong>';
    html += '</div>';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px">';
    var kpi = [
      {label:'Giac. inizio anno', val:fmtL(_depGmDati.giacInizioAnno[prod]||0), color:'#0C447C'},
      {label:'Totale entrate', val:fmtL(totEnt), color:'#27500A'},
      {label:'Totale uscite', val:fmtL(totUsc), color:'#791F1F'},
      {label:'Cali tecnici', val:fmtL(totCali), color:'#633806'},
      {label:'Giac. stimata fine anno', val:fmtL(giacFinale), color:'#3C3489'},
    ];
    kpi.forEach(function(k){
      html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;padding:10px">';
      html += '<div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">'+k.label+'</div>';
      html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:600;color:'+k.color+'">'+k.val+'</div>';
      html += '</div>';
    });
    html += '</div>';

    // Tabella mensile compatta
    html += '<div style="overflow-x:auto;margin-top:12px"><table style="width:100%;border-collapse:collapse;font-size:10px"><thead><tr>';
    html += '<th style="text-align:left;padding:4px 6px;border:0.5px solid var(--border);background:var(--bg)"></th>';
    _depGmMesi.forEach(function(m){
      html += '<th style="text-align:right;padding:4px 6px;border:0.5px solid var(--border);background:var(--bg);font-size:9px">'+m.substring(0,3)+'</th>';
    });
    html += '</tr></thead><tbody>';
    var righe = [
      {key:'entrate', label:'Entrate', color:'#27500A'},
      {key:'uscite', label:'Uscite', color:'#791F1F'},
      {key:'giacPresunta', label:'Giac. teorica', color:'#3C3489'},
      {key:'giacRilevata', label:'Giac. rilevata', color:'#D85A30'},
    ];
    righe.forEach(function(r){
      html += '<tr><td style="padding:4px 6px;border:0.5px solid var(--border);color:'+r.color+';font-weight:500">'+r.label+'</td>';
      dati.forEach(function(d){
        var val = d[r.key];
        var txt = (val !== null && val !== undefined) ? Math.round(val).toLocaleString('it-IT') : '—';
        html += '<td style="text-align:right;padding:4px 6px;border:0.5px solid var(--border);font-family:var(--font-mono);color:'+(val?r.color:'var(--text-muted)')+'">'+txt+'</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    html += '</div>';
  });

  return html || '<div class="loading">Nessun dato</div>';
}

async function esportaGiacenzeMensiliDeposito() {
  if (!_depGmDati) { toast('Carica prima i dati'); return; }
  if (typeof XLSX === 'undefined') { toast('Libreria Excel non caricata'); return; }
  var wb = XLSX.utils.book_new();
  _depGmDati.prodotti.forEach(function(prod){
    var dati = _depGmDati.mesi[prod];
    var rows = [['Mese','Giac.Inizio','Entrate','Uscite','Cali tecnici','Giac.Teorica','Giac.Rilevata','Differenza']];
    dati.forEach(function(d,i){
      rows.push([_depGmMesi[i], d.giacInizio, d.entrate, d.uscite, d.caliTecnici, d.giacPresunta,
        d.giacRilevata !== null ? d.giacRilevata : '', d.diffMese !== null ? d.diffMese : '']);
    });
    var ws = XLSX.utils.aoa_to_sheet(rows);
    XLSX.utils.book_append_sheet(wb, ws, prod.substring(0,30));
  });
  XLSX.writeFile(wb, 'GiacenzeMensiliDeposito_'+_depGmDati.anno+'.xlsx');
  toast('✓ Excel esportato');
}

// ═══════════════════════════════════════════════════════════════════
// CHIUSURA MENSILE — genera rettifiche automatiche dai 4 campi causale
// (cali_viaggio, cali_tecnici, eccedenze_viaggio, scatti_vuoto).
// giacenza_rilevata NON entra mai nelle rettifiche (solo informativa).
// 19/04/2026
// ═══════════════════════════════════════════════════════════════════
async function _depChiudiMese(prodotto, mese) {
  if (!_depGmDati) { toast('Dati non caricati'); return; }
  var anno = _depGmDati.anno;

  // Trova una cisterna deposito_vibo per questo prodotto (serve per rettifiche_inventario.cisterna_id)
  var { data: cisterne, error: errCis } = await sb.from('cisterne')
    .select('id,nome').eq('sede','deposito_vibo').eq('prodotto', prodotto).order('nome').limit(1);
  if (errCis || !cisterne || !cisterne.length) {
    toast('Errore: cisterna deposito per ' + prodotto + ' non trovata');
    return;
  }
  var cisternaId = cisterne[0].id;

  // Legge la riga giacenze_mensili (se esiste l'id viene dal cache, altrimenti la recupero)
  var dati = _depGmDati.mesi[prodotto];
  var d = dati[mese - 1];
  if (!d) { toast('Dati mese non trovati'); return; }

  // Prima mi assicuro che la riga giacenze_mensili esista e abbia un id
  var mensileId = d.id;
  if (!mensileId) {
    // Upsert "preventivo" per ottenere id
    var upRes = await sb.from('giacenze_mensili').upsert({
      anno: anno, sede: 'deposito_vibo', prodotto: prodotto, mese: mese,
      eccedenze_viaggio: d.eccedenze || 0,
      cali_viaggio: d.caliViaggio || 0,
      cali_tecnici: d.caliTecnici || 0,
      scatti_vuoto: d.scattiVuoto || 0
    }, { onConflict: 'anno,sede,prodotto,mese' }).select('id').single();
    if (upRes.error) { toast('Errore preparazione: ' + upRes.error.message); return; }
    mensileId = upRes.data.id;
  }

  // Costruisco lista rettifiche da creare (solo per campi != 0)
  var ultimoGiorno = new Date(anno, mese, 0).toISOString().split('T')[0]; // ultimo giorno del mese
  var utente = (typeof utenteCorrente !== 'undefined' && utenteCorrente) ? (utenteCorrente.nome || utenteCorrente.email) : 'sistema';

  var daCreare = [];
  if (Number(d.eccedenze||0) > 0) daCreare.push({
    causale: 'eccedenze_viaggio', differenza: Number(d.eccedenze)
  });
  if (Number(d.caliViaggio||0) > 0) daCreare.push({
    causale: 'cali_viaggio', differenza: -Number(d.caliViaggio)
  });
  if (Number(d.caliTecnici||0) > 0) daCreare.push({
    causale: 'cali_tecnici', differenza: -Number(d.caliTecnici)
  });
  if (Number(d.scattiVuoto||0) > 0) daCreare.push({
    causale: 'scatti_vuoto', differenza: -Number(d.scattiVuoto)
  });

  if (!daCreare.length) {
    if (!confirm('Nessuna causale valorizzata per ' + prodotto + ' ' + _depGmMesi[mese-1] + '. Vuoi chiudere il mese comunque (senza generare rettifiche)?')) return;
  }

  var mese2 = ('0'+mese).slice(-2);
  if (!confirm('Chiudere ' + _depGmMesi[mese-1] + ' ' + anno + ' per ' + prodotto + '?\n\nVerranno generate ' + daCreare.length + ' rettifiche automatiche con causali:\n' + daCreare.map(function(x){return '• ' + x.causale + ': ' + (x.differenza>0?'+':'') + x.differenza + ' L';}).join('\n') + '\n\nIl mese sarà bloccato (i valori non saranno più modificabili).')) return;

  // Inserisco rettifiche (una per causale)
  if (daCreare.length) {
    var records = daCreare.map(function(x){
      return {
        tipo: 'deposito',
        data: ultimoGiorno,
        cisterna_id: cisternaId,
        prodotto: prodotto,
        giacenza_sistema: 0,
        giacenza_rilevata: 0,
        differenza: x.differenza,
        causale: x.causale,
        origine: 'chiusura_mese',
        chiusura_giacenza_id: mensileId,
        confermata: true,
        confermata_da: utente,
        confermata_il: new Date().toISOString(),
        note: 'Chiusura ' + _depGmMesi[mese-1] + ' ' + anno + ' — auto-generata'
      };
    });
    var insRes = await sb.from('rettifiche_inventario').insert(records);
    if (insRes.error) { toast('Errore rettifiche: ' + insRes.error.message); return; }
  }

  // Marco il mese come chiuso
  var updRes = await sb.from('giacenze_mensili').update({
    chiuso_il: new Date().toISOString(),
    chiuso_da: utente
  }).eq('id', mensileId);
  if (updRes.error) { toast('Errore chiusura: ' + updRes.error.message); return; }

  toast('✓ Mese chiuso — ' + daCreare.length + ' rettifiche generate');
  await caricaGiacenzeMensiliDeposito();
}

async function _depRiapriMese(prodotto, mese) {
  if (!_depGmDati) { toast('Dati non caricati'); return; }
  var anno = _depGmDati.anno;

  // Verifica permesso admin
  var ruolo = (typeof utenteCorrente !== 'undefined' && utenteCorrente) ? utenteCorrente.ruolo : null;
  if (ruolo !== 'admin') { toast('Solo gli admin possono riaprire un mese chiuso'); return; }

  if (!confirm('Riaprire ' + _depGmMesi[mese-1] + ' ' + anno + ' per ' + prodotto + '?\n\nVerranno eliminate tutte le rettifiche auto-generate dalla chiusura (le rettifiche manuali NON vengono toccate).\n\nI valori del mese torneranno modificabili.')) return;

  // Recupero id della giacenza mensile
  var dati = _depGmDati.mesi[prodotto];
  var d = dati[mese - 1];
  var mensileId = d && d.id;
  if (!mensileId) {
    // Cerco nel DB
    var gmRes = await sb.from('giacenze_mensili').select('id')
      .eq('anno', anno).eq('sede','deposito_vibo').eq('prodotto', prodotto).eq('mese', mese).maybeSingle();
    if (!gmRes.data) { toast('Record mensile non trovato'); return; }
    mensileId = gmRes.data.id;
  }

  // Cancello rettifiche auto-generate (solo quelle con origine=chiusura_mese e chiusura_giacenza_id matchante)
  var delRes = await sb.from('rettifiche_inventario').delete()
    .eq('origine', 'chiusura_mese').eq('chiusura_giacenza_id', mensileId);
  if (delRes.error) { toast('Errore eliminazione rettifiche: ' + delRes.error.message); return; }

  // Rimuovo flag chiusura
  var updRes = await sb.from('giacenze_mensili').update({
    chiuso_il: null,
    chiuso_da: null
  }).eq('id', mensileId);
  if (updRes.error) { toast('Errore riapertura: ' + updRes.error.message); return; }

  toast('✓ Mese riaperto — rettifiche auto eliminate');
  await caricaGiacenzeMensiliDeposito();
}
