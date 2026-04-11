// PhoenixFuel — Deposito: Vista settimanale giacenze calcolate
// ═══════════════════════════════════════════════════════════════════
// Vista alternativa al pannello "Singolo giorno" esistente.
// Calcolato puro dai movimenti (entrate - uscite) partendo dalla
// giacenza inizio anno. Rilevata salvata su giacenze_giornaliere.
// Rettifiche inventario mostrate come badge informativi.
//
// NON modifica nulla del codice esistente.
// Variabili globali con prefisso _dgw per evitare collisioni.
// ═══════════════════════════════════════════════════════════════════

var _dgwAnno = null;
var _dgwProdotto = 'Gasolio Autotrazione';
var _dgwInizioSett = null;   // Date (lunedì della settimana visualizzata)
var _dgwSerie = null;        // array dei giorni dal 01/01 ad oggi
var _dgwRettifiche = null;   // Map<dataISO, [{cisterna,sistema,rilevata,delta,note}]>
var _dgwGiornaliere = null;  // Map<dataISO, {giacenza_rilevata,note}>

var _DGW_GIORNI = ['Lun','Mar','Mer','Gio','Ven','Sab','Dom'];
var _DGW_PROD_ORDINE = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO','AdBlue'];

// ───────────────────────────────────────────────────────────────────
// Switch tra vista "Singolo giorno" (esistente) e "Settimanale" (nuova)
// ───────────────────────────────────────────────────────────────────
var _dgwMeseInit = false;

function dgwToggleVista(target) {
  var btnGg = document.getElementById('dgw-btn-giorno');
  var btnWk = document.getElementById('dgw-btn-week');
  var btnMs = document.getElementById('dgw-btn-mese');
  var blocoGg = document.getElementById('dgw-blocco-giorno');
  var blocoWk = document.getElementById('dgw-blocco-week');
  var blocoMs = document.getElementById('dgw-blocco-mese');
  if (!btnGg || !btnWk || !blocoGg || !blocoWk) return;

  // Reset stile di tutti i bottoni
  function _resetBtn(b) {
    if (!b) return;
    b.style.background = 'var(--bg)';
    b.style.color = 'var(--text)';
    b.style.border = '0.5px solid var(--border)';
  }
  function _activeBtn(b) {
    if (!b) return;
    b.style.background = 'var(--primary)';
    b.style.color = '#fff';
    b.style.border = '';
  }
  _resetBtn(btnGg); _resetBtn(btnWk); _resetBtn(btnMs);

  if (target === 'week') {
    _activeBtn(btnWk);
    blocoGg.style.display = 'none';
    blocoWk.style.display = '';
    if (blocoMs) blocoMs.style.display = 'none';
    if (_dgwSerie === null) _dgwInit();
  } else if (target === 'mese') {
    _activeBtn(btnMs);
    blocoGg.style.display = 'none';
    blocoWk.style.display = 'none';
    if (blocoMs) blocoMs.style.display = '';
    // Lazy load: chiama caricaGiacenzeMensiliDeposito solo al primo accesso
    if (!_dgwMeseInit && typeof caricaGiacenzeMensiliDeposito === 'function') {
      caricaGiacenzeMensiliDeposito();
      _dgwMeseInit = true;
    }
  } else {
    _activeBtn(btnGg);
    blocoGg.style.display = '';
    blocoWk.style.display = 'none';
    if (blocoMs) blocoMs.style.display = 'none';
  }
}

// ───────────────────────────────────────────────────────────────────
// Inizializzazione: popola selettori prodotto/anno e carica settimana
// ───────────────────────────────────────────────────────────────────
async function _dgwInit() {
  var selProd = document.getElementById('dgw-prodotto');
  if (selProd && selProd.options.length === 0) {
    // Prodotti dalle cisterne deposito, ordinati come nel resto del progetto
    var { data: cisterne } = await sb.from('cisterne').select('prodotto').eq('sede','deposito_vibo');
    var setProd = {};
    (cisterne||[]).forEach(function(c){ if(c.prodotto) setProd[c.prodotto]=true; });
    var prodotti = Object.keys(setProd).sort(function(a,b){
      var ia = _DGW_PROD_ORDINE.indexOf(a); if(ia<0) ia=99;
      var ib = _DGW_PROD_ORDINE.indexOf(b); if(ib<0) ib=99;
      return ia - ib;
    });
    if (!prodotti.length) prodotti = ['Gasolio Autotrazione'];
    prodotti.forEach(function(p) {
      selProd.innerHTML += '<option value="' + esc(p) + '">' + esc(p) + '</option>';
    });
    _dgwProdotto = prodotti[0];
    selProd.value = _dgwProdotto;
  }

  var selAnno = document.getElementById('dgw-anno');
  if (selAnno && selAnno.options.length === 0) {
    var annoCorr = new Date().getFullYear();
    for (var y = annoCorr; y >= annoCorr - 3; y--) {
      selAnno.innerHTML += '<option value="' + y + '"' + (y === annoCorr ? ' selected' : '') + '>' + y + '</option>';
    }
    _dgwAnno = annoCorr;
  }

  // Settimana iniziale: quella di oggi (lunedì)
  if (!_dgwInizioSett) _dgwInizioSett = _dgwLunedi(new Date());

  await _dgwCaricaSettimana();
}

// Restituisce il lunedì della settimana che contiene la data passata
function _dgwLunedi(d) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  var giornoSett = x.getDay();          // 0=dom, 1=lun, ..., 6=sab
  var diff = giornoSett === 0 ? -6 : 1 - giornoSett;
  x.setDate(x.getDate() + diff);
  return x;
}

function _dgwISO(d) {
  var m = String(d.getMonth()+1).padStart(2,'0');
  var g = String(d.getDate()).padStart(2,'0');
  return d.getFullYear() + '-' + m + '-' + g;
}

function _dgwAddDays(d, n) {
  var x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() + n);
  return x;
}

// ───────────────────────────────────────────────────────────────────
// Cambio prodotto / anno / navigazione settimana
// ───────────────────────────────────────────────────────────────────
function dgwCambiaProdotto() {
  var sel = document.getElementById('dgw-prodotto');
  if (!sel) return;
  _dgwProdotto = sel.value;
  _dgwSerie = null;
  _dgwCaricaSettimana();
}

function dgwCambiaAnno() {
  var sel = document.getElementById('dgw-anno');
  if (!sel) return;
  _dgwAnno = parseInt(sel.value);
  _dgwSerie = null;
  // Se cambio anno, riposiziono la settimana al primo lunedì dell'anno
  // (oppure alla settimana corrente se è l'anno corrente)
  var oggi = new Date();
  if (_dgwAnno === oggi.getFullYear()) _dgwInizioSett = _dgwLunedi(oggi);
  else _dgwInizioSett = _dgwLunedi(new Date(_dgwAnno, 0, 5));
  _dgwCaricaSettimana();
}

function dgwNavSettimana(direzione) {
  if (!_dgwInizioSett) return;
  _dgwInizioSett = _dgwAddDays(_dgwInizioSett, direzione * 7);
  // Se la nuova settimana esce dall'anno, blocca
  if (_dgwInizioSett.getFullYear() < _dgwAnno) {
    _dgwInizioSett = _dgwAddDays(_dgwInizioSett, 7);
    return;
  }
  _dgwCaricaSettimana();
}

function dgwSettimanaCorrente() {
  _dgwInizioSett = _dgwLunedi(new Date());
  if (_dgwInizioSett.getFullYear() !== _dgwAnno) {
    var sa = document.getElementById('dgw-anno');
    if (sa) { sa.value = _dgwInizioSett.getFullYear(); _dgwAnno = _dgwInizioSett.getFullYear(); }
    _dgwSerie = null;
  }
  _dgwCaricaSettimana();
}

// ───────────────────────────────────────────────────────────────────
// Calcolo serie giornaliera dal 01/01 al giorno target
// Funzione PURA: dipende solo da movimenti confermati nel DB
// ───────────────────────────────────────────────────────────────────
async function _dgwCalcolaSerie(anno, prodotto, finoA) {
  // 1. Giacenza iniziale: da giacenze_annuali anno-1 convalidata
  var giacInizio = 0;
  var { data: giacAnn } = await sb.from('giacenze_annuali')
    .select('giacenza_reale')
    .eq('anno', anno - 1).eq('sede','deposito_vibo').eq('prodotto', prodotto)
    .eq('convalidata', true).maybeSingle();
  if (giacAnn && giacAnn.giacenza_reale !== null) {
    giacInizio = Number(giacAnn.giacenza_reale);
  }

  var daISO = anno + '-01-01';
  var aISO = _dgwISO(finoA);

  // 2. Movimenti dell'anno per quel prodotto, in parallelo
  // NOTA: includiamo sia 'confermato' che 'consegnato' come stati validi.
  // Il flusso DAS firmato porta gli ordini da 'confermato' a 'consegnato',
  // entrambi rappresentano uscite/entrate effettivamente avvenute.
  var STATI_VALIDI = ['confermato','consegnato'];
  var [entRes, uscCliRes, uscStaRes, uscAuRes] = await Promise.all([
    sb.from('ordini').select('data,litri')
      .eq('tipo_ordine','entrata_deposito').in('stato', STATI_VALIDI).eq('prodotto', prodotto)
      .gte('data', daISO).lte('data', aISO),
    sb.from('ordini').select('data,litri,fornitore')
      .eq('tipo_ordine','cliente').in('stato', STATI_VALIDI).eq('prodotto', prodotto)
      .gte('data', daISO).lte('data', aISO),
    sb.from('ordini').select('data,litri,fornitore')
      .eq('tipo_ordine','stazione_servizio').in('stato', STATI_VALIDI).eq('prodotto', prodotto)
      .gte('data', daISO).lte('data', aISO),
    sb.from('ordini').select('data,litri')
      .eq('tipo_ordine','autoconsumo').in('stato', STATI_VALIDI).eq('prodotto', prodotto)
      .gte('data', daISO).lte('data', aISO)
  ]);

  // 3. Aggregazione per data (Map<dateStr, {entrate, uscite}>)
  var perGiorno = {};
  function bucket(d) {
    if (!perGiorno[d]) perGiorno[d] = { entrate: 0, uscite: 0 };
    return perGiorno[d];
  }
  (entRes.data || []).forEach(function(o){
    bucket(o.data).entrate += Number(o.litri || 0);
  });
  function isPhoenix(o) {
    var f = (o.fornitore || '').toLowerCase();
    return f.indexOf('phoenix') >= 0 || f.indexOf('deposito') >= 0;
  }
  (uscCliRes.data || []).forEach(function(o){
    if (isPhoenix(o)) bucket(o.data).uscite += Number(o.litri || 0);
  });
  (uscStaRes.data || []).forEach(function(o){
    if (isPhoenix(o)) bucket(o.data).uscite += Number(o.litri || 0);
  });
  (uscAuRes.data || []).forEach(function(o){
    bucket(o.data).uscite += Number(o.litri || 0);
  });

  // 4. Cammina giorno per giorno dall'01/01 al giorno target
  var serie = [];
  var corrente = giacInizio;
  var d = new Date(anno, 0, 1);
  while (d <= finoA) {
    var iso = _dgwISO(d);
    var b = perGiorno[iso] || { entrate: 0, uscite: 0 };
    var iniziale = corrente;
    var calcolata = Math.round((iniziale + b.entrate - b.uscite) * 100) / 100;
    serie.push({
      data: iso,
      iniziale: iniziale,
      entrate: b.entrate,
      uscite: b.uscite,
      calcolata: calcolata
    });
    corrente = calcolata;
    d = _dgwAddDays(d, 1);
  }

  return { serie: serie, giacInizio: giacInizio };
}

// ───────────────────────────────────────────────────────────────────
// Carica settimana: serie + rilevate + rettifiche, poi render
// ───────────────────────────────────────────────────────────────────
async function _dgwCaricaSettimana() {
  if (!_dgwInizioSett) return;
  var cont = document.getElementById('dgw-contenuto');
  if (cont) cont.innerHTML = '<div class="loading">Calcolo serie giornaliera...</div>';

  var fineSett = _dgwAddDays(_dgwInizioSett, 6);
  var oggi = new Date();
  // Ricalcolo la serie fino alla domenica della settimana visualizzata,
  // o fino a oggi se la settimana è nel passato
  var finoA = fineSett > oggi ? oggi : fineSett;
  // Se la settimana è interamente nel futuro, finoA = ieri (ma comunque calcolo)
  if (finoA < new Date(_dgwAnno, 0, 1)) {
    if (cont) cont.innerHTML = '<div class="loading">Settimana fuori anno selezionato</div>';
    return;
  }

  // 1. Calcolo serie cumulativa (operazione costosa, una volta sola per anno+prodotto)
  var risultato = await _dgwCalcolaSerie(_dgwAnno, _dgwProdotto, finoA);
  _dgwSerie = risultato.serie;

  // 2. Rilevate salvate su giacenze_giornaliere per i 7 giorni della settimana
  var settIsoDa = _dgwISO(_dgwInizioSett);
  var settIsoA  = _dgwISO(fineSett);
  var { data: gg } = await sb.from('giacenze_giornaliere')
    .select('data,giacenza_rilevata,note')
    .eq('sede','deposito_vibo').eq('prodotto', _dgwProdotto)
    .gte('data', settIsoDa).lte('data', settIsoA);
  _dgwGiornaliere = {};
  (gg || []).forEach(function(g){ _dgwGiornaliere[g.data] = g; });

  // 3. Rettifiche confermate del periodo, join cisterne per filtrare prodotto
  var { data: rett } = await sb.from('rettifiche_inventario')
    .select('data,giacenza_sistema,giacenza_rilevata,differenza,note,cisterna_id,cisterne(nome,prodotto,sede)')
    .eq('tipo','deposito').eq('confermata', true)
    .gte('data', settIsoDa).lte('data', settIsoA);
  _dgwRettifiche = {};
  (rett || []).forEach(function(r){
    if (!r.cisterne || r.cisterne.prodotto !== _dgwProdotto) return;
    if (!_dgwRettifiche[r.data]) _dgwRettifiche[r.data] = [];
    _dgwRettifiche[r.data].push({
      cisterna: r.cisterne.nome || '?',
      sistema: Number(r.giacenza_sistema || 0),
      rilevata: Number(r.giacenza_rilevata || 0),
      delta: Number(r.differenza || 0),
      note: r.note || ''
    });
  });

  _dgwRender();
}

// ───────────────────────────────────────────────────────────────────
// Render dei 7 pannelli giornalieri
// ───────────────────────────────────────────────────────────────────
function _dgwRender() {
  var cont = document.getElementById('dgw-contenuto');
  if (!cont) return;

  var fmtL = function(v){
    if (v === null || v === undefined || isNaN(v)) return '—';
    return Math.round(v).toLocaleString('it-IT') + ' L';
  };
  var pi = (typeof cacheProdotti !== 'undefined' && cacheProdotti)
           ? cacheProdotti.find(function(p){return p.nome === _dgwProdotto;}) : null;
  var col = pi && pi.colore ? pi.colore : '#D85A30';

  // Mappa serie per data ISO per lookup veloce
  var serieMap = {};
  (_dgwSerie || []).forEach(function(s){ serieMap[s.data] = s; });

  // Header settimana
  var inizioStr = _dgwInizioSett.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
  var fineStr = _dgwAddDays(_dgwInizioSett,6).toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit',year:'numeric'});

  var html = '';
  html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;flex-wrap:wrap;gap:8px">';
  html += '<div style="font-size:13px;color:var(--text-muted)">Settimana <strong>'+inizioStr+' → '+fineStr+'</strong></div>';
  html += '<div style="display:flex;gap:6px"><button class="btn-edit" onclick="dgwNavSettimana(-1)" title="Settimana precedente">‹</button>';
  html += '<button class="btn-edit" onclick="dgwSettimanaCorrente()" title="Settimana corrente">●</button>';
  html += '<button class="btn-edit" onclick="dgwNavSettimana(1)" title="Settimana successiva">›</button></div>';
  html += '</div>';

  html += '<div style="display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px">';

  var oggiIso = _dgwISO(new Date());
  var rilevataPrev = null;

  for (var i = 0; i < 7; i++) {
    var giorno = _dgwAddDays(_dgwInizioSett, i);
    var iso = _dgwISO(giorno);
    var nome = _DGW_GIORNI[i];
    var ggIso = giorno.toLocaleDateString('it-IT',{day:'2-digit',month:'2-digit'});
    var s = serieMap[iso];
    var futuro = giorno > new Date();
    var oggiFlag = (iso === oggiIso);
    var ggSalv = _dgwGiornaliere[iso];
    var rilevataValSalv = ggSalv && ggSalv.giacenza_rilevata !== null ? Number(ggSalv.giacenza_rilevata) : null;
    var nota = ggSalv ? (ggSalv.note || '') : '';
    var rettOggi = _dgwRettifiche[iso] || null;

    // Palette grigio scuro uniforme; oggi in rilievo (più chiaro + bordo blu spesso + shadow)
    var bgPannello = '#3A3A3A';          // grigio scuro standard
    var bordoPannello = '1px solid #555';
    var extraStyle = '';
    if (oggiFlag) {
      bgPannello = '#4A4A4A';             // leggermente più chiaro per staccarsi
      bordoPannello = '3px solid #378ADD'; // bordo blu marcato
      extraStyle = 'box-shadow:0 2px 8px rgba(0,0,0,0.35);transform:translateY(-2px)';
    } else if (rettOggi) {
      bordoPannello = '2px dashed #BA7517';
    }
    if (futuro) {
      bgPannello = '#2A2A2A';
      extraStyle += ';opacity:0.55';
    }

    // Testo primario e muted in versione chiara per contrasto su fondo scuro
    var txtP = '#F1EFE8';    // text primary su scuro
    var txtM = '#A0A0A0';    // text muted su scuro
    var bordoCella = 'rgba(255,255,255,0.12)';

    html += '<div style="background:'+bgPannello+';border:'+bordoPannello+';border-radius:8px;padding:10px;color:'+txtP+';'+extraStyle+'">';

    // Header giorno + badge rettifica + bottone info (più grande, stile icona in blu)
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:6px;gap:4px">';
    html += '<div><div style="font-size:10px;color:'+txtM+';text-transform:uppercase;letter-spacing:0.5px">'+nome+'</div>';
    html += '<div style="font-size:14px;font-weight:600;color:'+txtP+'">'+ggIso+'</div></div>';
    html += '<div style="display:flex;flex-direction:column;align-items:flex-end;gap:4px">';
    if (rettOggi && rettOggi.length) {
      var tip = rettOggi.map(function(r){
        return r.cisterna+': '+Math.round(r.sistema)+' → '+Math.round(r.rilevata)+' L (Δ'+(r.delta>=0?'+':'')+Math.round(r.delta)+(r.note?'; '+r.note:'')+')';
      }).join('\n');
      html += '<div title="'+esc(tip)+'" style="font-size:14px;cursor:help">🔧</div>';
    }
    if (!futuro) {
      // Bottone info grande, cerchio blu pieno con "i" bianca serif
      html += '<button onclick="dgwMostraDettaglioGiorno(\''+iso+'\')" title="Dettaglio movimenti del giorno" style="width:26px;height:26px;border-radius:50%;background:#378ADD;color:#fff;border:none;cursor:pointer;font-family:Georgia,serif;font-size:16px;font-weight:700;font-style:italic;line-height:1;padding:0;display:flex;align-items:center;justify-content:center" onmouseover="this.style.background=\'#185FA5\'" onmouseout="this.style.background=\'#378ADD\'">i</button>';
    }
    html += '</div>';
    html += '</div>';

    if (!s) {
      html += '<div style="font-size:11px;color:'+txtM+';text-align:center;padding:20px 0">—</div>';
      html += '</div>';
      continue;
    }

    // Colori adattati al fondo scuro: verdi/rossi più chiari, border più visibile
    var colEntrate = '#97C459';  // verde chiaro
    var colUscite = '#F09595';   // rosso chiaro (pink/red 200)
    var colCalcolata = '#F5C4B3'; // coral chiaro per risaltare su scuro

    // Movimenti del giorno
    html += '<div style="font-size:10px;color:'+txtM+'">Iniziale</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:'+txtP+'">'+fmtL(s.iniziale)+'</div>';
    html += '<div style="font-size:10px;color:'+colEntrate+';margin-top:3px">+ Entrate</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:'+(s.entrate>0?colEntrate:txtM)+'">'+fmtL(s.entrate)+'</div>';
    html += '<div style="font-size:10px;color:'+colUscite+'">− Uscite</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:'+(s.uscite>0?colUscite:txtM)+'">'+fmtL(s.uscite)+'</div>';
    var deltaGiorno = Math.round((Number(s.entrate)||0) - (Number(s.uscite)||0));
    var colDeltaG, txtDeltaG;
    if (deltaGiorno > 0) { colDeltaG = colEntrate; txtDeltaG = '+'+fmtL(deltaGiorno); }
    else if (deltaGiorno < 0) { colDeltaG = colUscite; txtDeltaG = fmtL(deltaGiorno); }
    else { colDeltaG = txtM; txtDeltaG = '—'; }
    html += '<div style="font-size:10px;color:'+txtM+';margin-top:3px">Δ giorno</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:600;color:'+colDeltaG+'">'+txtDeltaG+'</div>';
    html += '<div style="border-top:1px solid '+bordoCella+';margin:6px 0"></div>';
    html += '<div style="font-size:10px;color:'+txtM+'">Calcolata</div>';
    html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:'+colCalcolata+'">'+fmtL(s.calcolata)+'</div>';

    // Input rilevata
    var sugg;
    if (rilevataValSalv !== null) {
      sugg = rilevataValSalv;
    } else if (rilevataPrev !== null) {
      sugg = Math.round(rilevataPrev + s.entrate - s.uscite);
    } else {
      sugg = Math.round(s.calcolata);
    }
    var inputVal = rilevataValSalv !== null ? rilevataValSalv : '';
    html += '<div style="font-size:10px;color:'+txtM+';margin-top:6px">Rilevata</div>';
    if (futuro) {
      html += '<input type="text" disabled placeholder="—" style="width:100%;font-size:12px;padding:4px 6px;border:1px solid '+bordoCella+';border-radius:4px;background:rgba(255,255,255,0.05);color:'+txtM+'">';
    } else {
      html += '<input type="number" step="1" data-data="'+iso+'" data-sugg="'+sugg+'" value="'+inputVal+'" placeholder="'+sugg+'" onblur="dgwSalvaRilevata(this)" style="width:100%;font-family:var(--font-mono);font-size:12px;padding:4px 6px;border:1px solid '+bordoCella+';border-radius:4px;background:rgba(255,255,255,0.08);color:'+txtP+';text-align:right">';
    }

    // Delta rilevata vs calcolata — colori adattati al fondo scuro
    if (rilevataValSalv !== null) {
      var delta = Math.round(rilevataValSalv - s.calcolata);
      var dCol = delta === 0 ? '#97C459' : (Math.abs(delta) < 200 ? '#FAC775' : '#F09595');
      html += '<div style="font-size:10px;margin-top:2px;color:'+dCol+'">Δ '+(delta>=0?'+':'')+fmtL(delta)+'</div>';
    } else {
      html += '<div style="font-size:10px;margin-top:2px;color:'+txtM+'">—</div>';
    }

    // Nota (compatta, leggibile, non editabile qui)
    if (nota) {
      html += '<div style="font-size:9px;color:'+txtM+';margin-top:4px;font-style:italic" title="'+esc(nota)+'">'+esc(nota.substring(0,18))+(nota.length>18?'…':'')+'</div>';
    }

    html += '</div>';
    rilevataPrev = rilevataValSalv;
  }
  html += '</div>';

  // Container per il pannello dettaglio giornata (popolato on-demand da dgwMostraDettaglioGiorno)
  html += '<div id="dgw-dettaglio-box" style="margin-top:14px"></div>';

  // Legenda
  html += '<div style="display:flex;gap:14px;margin-top:10px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">';
  html += '<div><strong style="color:'+col+'">Calcolata</strong> = matematica pura entrate − uscite (mai modificata)</div>';
  html += '<div>🔧 = rettifica inventario quel giorno (info al hover)</div>';
  html += '<div>ⓘ = clicca per vedere il dettaglio movimenti del giorno</div>';
  html += '<div>Rilevata: salva auto al click fuori dall\'input</div>';
  html += '</div>';

  cont.innerHTML = html;
}

// ───────────────────────────────────────────────────────────────────
// Dettaglio movimenti del giorno (on demand, click su ⓘ)
// Usa _movRenderBlocchi di pf-deposito.js per avere lo stesso layout E/U.
// ───────────────────────────────────────────────────────────────────
var _dgwDettaglioCorrente = null; // iso del giorno attualmente mostrato, per toggle

async function dgwMostraDettaglioGiorno(iso) {
  var box = document.getElementById('dgw-dettaglio-box');
  if (!box) return;

  // Toggle: secondo click sullo stesso giorno = chiude
  if (_dgwDettaglioCorrente === iso) {
    box.innerHTML = '';
    _dgwDettaglioCorrente = null;
    return;
  }
  _dgwDettaglioCorrente = iso;

  box.innerHTML = '<div class="loading" style="padding:16px;text-align:center">Caricamento movimenti del ' + fmtD(iso) + '...</div>';

  // Query: stessi criteri di caricaMovimentiDeposito ma filtrata sulla data del giorno
  var res = await sb.from('ordini').select('*,basi_carico(nome)')
    .or('tipo_ordine.eq.entrata_deposito,tipo_ordine.eq.stazione_servizio,tipo_ordine.eq.autoconsumo,fornitore.ilike.%phoenix%')
    .eq('data', iso)
    .order('created_at', { ascending: false });

  if (res.error) {
    box.innerHTML = '<div class="loading" style="padding:16px;text-align:center;color:#A32D2D">Errore: ' + esc(res.error.message) + '</div>';
    return;
  }

  var movimenti = res.data || [];
  var entrate = movimenti.filter(function(r) { return r.tipo_ordine === 'entrata_deposito'; });
  var uscite = movimenti.filter(function(r) { return r.tipo_ordine !== 'entrata_deposito'; });

  var header = '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border:0.5px solid var(--border);border-radius:8px 8px 0 0;border-bottom:none">';
  header += '<div style="font-size:13px;font-weight:600;color:var(--text)">Dettaglio movimenti del ' + fmtD(iso) + '</div>';
  header += '<button class="btn-edit" style="font-size:11px;padding:3px 10px" onclick="dgwMostraDettaglioGiorno(\'' + iso + '\')" title="Chiudi">✕</button>';
  header += '</div>';

  var body;
  if (typeof _movRenderBlocchi === 'function') {
    body = '<div style="padding:12px 14px;border:0.5px solid var(--border);border-top:none;border-radius:0 0 8px 8px;background:var(--bg-card)">';
    body += _movRenderBlocchi(entrate, uscite, true, true, 'compact');
    body += '</div>';
  } else {
    body = '<div style="padding:16px;color:#A32D2D">Errore: funzione di rendering non trovata. Ricarica la pagina.</div>';
  }

  box.innerHTML = header + body;
}

// ───────────────────────────────────────────────────────────────────
// Salvataggio rilevata onBlur
// ───────────────────────────────────────────────────────────────────
async function dgwSalvaRilevata(input) {
  var data = input.dataset.data;
  var raw = input.value.trim();
  if (!data) return;

  // Ricalcola movimenti del giorno per salvare anche entrate/uscite/teorica
  // (mantiene compatibilità con la vista "singolo giorno" esistente)
  var serieMap = {};
  (_dgwSerie || []).forEach(function(s){ serieMap[s.data] = s; });
  var s = serieMap[data];
  if (!s) { toast('Dato giorno non disponibile'); return; }

  // Cerca record esistente
  var { data: existing } = await sb.from('giacenze_giornaliere')
    .select('id,cali_eccedenze,note').eq('data', data).eq('prodotto', _dgwProdotto)
    .eq('sede','deposito_vibo').maybeSingle();

  // Se input vuoto E esiste già record con rilevata, azzeriamo solo la rilevata
  if (raw === '') {
    if (existing) {
      await sb.from('giacenze_giornaliere').update({
        giacenza_rilevata: null,
        differenza: null,
        rilevata_da: (typeof utenteCorrente !== 'undefined' && utenteCorrente) ? utenteCorrente.nome : 'admin'
      }).eq('id', existing.id);
    }
    if (_dgwGiornaliere[data]) _dgwGiornaliere[data].giacenza_rilevata = null;
    _dgwRender();
    return;
  }

  var rilevata = parseFloat(raw);
  if (isNaN(rilevata)) { toast('Valore non valido'); return; }

  var caliEcc = existing && existing.cali_eccedenze !== null ? Number(existing.cali_eccedenze) : 0;
  var teorica = Math.round(s.iniziale + s.entrate - s.uscite + caliEcc);
  var diff = Math.round(rilevata - teorica);

  var record = {
    data: data,
    prodotto: _dgwProdotto,
    sede: 'deposito_vibo',
    giacenza_inizio: s.iniziale,
    entrate: s.entrate,
    uscite: s.uscite,
    cali_eccedenze: caliEcc,
    giacenza_teorica: teorica,
    giacenza_rilevata: rilevata,
    differenza: diff,
    note: existing && existing.note ? existing.note : null,
    rilevata_da: (typeof utenteCorrente !== 'undefined' && utenteCorrente) ? utenteCorrente.nome : 'admin'
  };

  var res;
  if (existing) res = await sb.from('giacenze_giornaliere').update(record).eq('id', existing.id);
  else res = await sb.from('giacenze_giornaliere').insert([record]);

  if (res && res.error) { toast('Errore salvataggio: ' + res.error.message); return; }

  // Aggiorna cache locale e re-render solo per aggiornare il delta
  _dgwGiornaliere[data] = { data: data, giacenza_rilevata: rilevata, note: record.note };
  _dgwRender();
  toast('✓ Rilevata salvata');
}
