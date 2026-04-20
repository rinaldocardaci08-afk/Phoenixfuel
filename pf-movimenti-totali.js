// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Movimenti totali ad oggi (riconciliazione contabile)
// COMANDAMENTO: Giacenze = iniziale + entrate − uscite. FINE.
// Solo le rettifiche modificano il flusso, altrimenti pura matematica.
//
// Versione 2 (15/04):
//   - Generalizzata su sede ('deposito_vibo' | 'stazione_oppido')
//   - Fix bug "data partenza": iniziale ora è giacenza al (da-1)
//     calcolata via pfData.getGiacenzaAllaData (cascata canonica).
//   - Init separato per deposito (mvt-*) e stazione (mvts-*).
// ═══════════════════════════════════════════════════════════════════

// ── INIT DROPDOWN E DATE ─────────────────────────────────────────
async function _pfMvtInit(sede, prefix) {
  var selProd = document.getElementById(prefix + '-prodotto');
  if (!selProd || selProd.options.length > 0) return;
  var { data: cisterne } = await sb.from('cisterne').select('prodotto').eq('sede', sede);
  var set = {};
  (cisterne || []).forEach(function(c) { if (c.prodotto) set[c.prodotto] = true; });
  var ordine = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO','AdBlue'];
  var prodotti = ordine.filter(function(p) { return set[p]; });
  Object.keys(set).forEach(function(p) { if (prodotti.indexOf(p) < 0) prodotti.push(p); });
  prodotti.forEach(function(p) {
    selProd.innerHTML += '<option value="' + esc(p) + '">' + esc(p) + '</option>';
  });
  var oggi = new Date();
  var daEl = document.getElementById(prefix + '-da');
  var aEl = document.getElementById(prefix + '-a');
  if (daEl && !daEl.value) daEl.value = oggi.getFullYear() + '-01-01';
  if (aEl && !aEl.value) aEl.value = oggi.toISOString().split('T')[0];
}

async function pfMovimentiInit() { return _pfMvtInit('deposito_vibo', 'mvt'); }
async function pfMovimentiStzInit() { return _pfMvtInit('stazione_oppido', 'mvts'); }

// ── CALCOLO + RENDER (parametrico su sede) ────────────────────────
async function _pfMvtCalcola(sede, prefix) {
  var prodEl = document.getElementById(prefix + '-prodotto');
  var daEl = document.getElementById(prefix + '-da');
  var aEl = document.getElementById(prefix + '-a');
  var cont = document.getElementById(prefix + '-risultati');
  if (!prodEl || !daEl || !aEl || !cont) return;

  var prodotto = prodEl.value;
  var da = daEl.value;
  var a = aEl.value;
  if (!prodotto || !da || !a) { cont.innerHTML = '<div style="color:#A32D2D;padding:8px">Compila tutti i campi</div>'; return; }

  cont.innerHTML = '<div class="loading" style="padding:16px">Calcolo in corso...</div>';

  try {
    // ─────── 1. GIACENZA INIZIALE al (da - 1) via pfData (cascata canonica) ───────
    var giornoPrima = new Date(new Date(da + 'T00:00:00Z').getTime() - 86400000).toISOString().split('T')[0];
    var iniziale = 0;
    var fonteIniziale = '—';

    if (typeof pfData !== 'undefined' && pfData.getGiacenzaAllaData) {
      var giacIni = await pfData.getGiacenzaAllaData(sede, prodotto, giornoPrima);
      iniziale = Math.round(Number(giacIni.calcolata || 0));
      fonteIniziale = 'pfData calcolata al ' + giornoPrima + ' (fonte: ' + giacIni.fonteIniziale + ')';
    }

    // ─────── 2. MOVIMENTI nel range [da, a] ───────
    var STATI = ['confermato','consegnato'];
    var entrate = 0, uscCli = 0, uscSta = 0, uscAu = 0;
    var nEnt = 0, nCli = 0, nSta = 0, nAu = 0;

    if (sede === 'deposito_vibo') {
      var [entRes, uscCliRes, uscStaRes, uscAuRes] = await Promise.all([
        sb.from('ordini').select('litri')
          .eq('tipo_ordine','entrata_deposito').in('stato', STATI).eq('prodotto', prodotto)
          .gte('data', da).lte('data', a),
        sb.from('ordini').select('litri,fornitore')
          .eq('tipo_ordine','cliente').in('stato', STATI).eq('prodotto', prodotto)
          .gte('data', da).lte('data', a),
        sb.from('ordini').select('litri,fornitore')
          .eq('tipo_ordine','stazione_servizio').in('stato', STATI).eq('prodotto', prodotto)
          .gte('data', da).lte('data', a),
        sb.from('ordini').select('litri')
          .eq('tipo_ordine','autoconsumo').in('stato', STATI).eq('prodotto', prodotto)
          .gte('data', da).lte('data', a)
      ]);
      function isPhoenix(o) {
        var f = (o.fornitore || '').toLowerCase();
        return f.indexOf('phoenix') >= 0 || f.indexOf('deposito') >= 0;
      }
      entrate = (entRes.data || []).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      var cliFiltr = (uscCliRes.data || []).filter(isPhoenix);
      var staFiltr = (uscStaRes.data || []).filter(isPhoenix);
      uscCli = cliFiltr.reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      uscSta = staFiltr.reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      uscAu = (uscAuRes.data || []).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      nEnt = (entRes.data || []).length;
      nCli = cliFiltr.length;
      nSta = staFiltr.length;
      nAu = (uscAuRes.data || []).length;
    } else if (sede === 'stazione_oppido') {
      // Entrate: tipo_ordine='stazione_servizio' (ricezioni dal deposito)
      // FILTRO: solo ordini effettivamente ricevuti (ricevuto_stazione=true).
      // Ordini confermati ma non ancora ricevuti NON devono influire sulla giacenza.
      var entStaRes = await sb.from('ordini').select('litri')
        .eq('tipo_ordine','stazione_servizio').in('stato', STATI).eq('prodotto', prodotto)
        .eq('ricevuto_stazione', true)
        .gte('data', da).lte('data', a);
      entrate = (entStaRes.data || []).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      nEnt = (entStaRes.data || []).length;
      // Uscite: differenze letture pompe del prodotto nel range
      var pompeRes = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true);
      var ids = (pompeRes.data || []).filter(function(p){ return p.prodotto === prodotto; }).map(function(p){ return p.id; });
      if (ids.length) {
        // Per il delta giornaliero servono lettura del giorno-1 per ogni pompa
        var lettRes = await sb.from('stazione_letture').select('pompa_id,data,lettura')
          .in('pompa_id', ids).gte('data', giornoPrima).lte('data', a).order('data');
        var byPompa = {};
        (lettRes.data || []).forEach(function(l) {
          if (!byPompa[l.pompa_id]) byPompa[l.pompa_id] = [];
          byPompa[l.pompa_id].push(l);
        });
        Object.keys(byPompa).forEach(function(pid) {
          var arr = byPompa[pid];
          for (var j = 1; j < arr.length; j++) {
            // Conta solo se la lettura "j" cade nel range [da,a]
            if (arr[j].data >= da) {
              var d = Number(arr[j].lettura) - Number(arr[j-1].lettura);
              if (d > 0) { uscCli += d; nCli++; }
            }
          }
        });
      }
    }

    var usciteTot = uscCli + uscSta + uscAu;

    // ─────── 3. RETTIFICHE CONFERMATE nel range [da, a] ───────
    // Le rettifiche sono movimenti a tutti gli effetti: differenza > 0 aumenta,
    // differenza < 0 diminuisce la giacenza. Il dettaglio per causale è nel popup info.
    var tipoRett = sede === 'deposito_vibo' ? 'deposito' : 'stazione';
    var rettRes = await sb.from('rettifiche_inventario')
      .select('id,data,differenza,causale,origine,note')
      .eq('tipo', tipoRett).eq('prodotto', prodotto).eq('confermata', true)
      .gte('data', da).lte('data', a)
      .order('data', { ascending: false });
    var rettifiche = 0, nRett = 0;
    var rettDett = rettRes.data || [];
    rettDett.forEach(function(r){
      rettifiche += Number(r.differenza || 0);
      nRett++;
    });
    // Espongo il dettaglio globale per il popup info
    window._pfMvtRettDett = {
      prefix: prefix,
      prodotto: prodotto,
      sede: sede,
      da: da, a: a,
      righe: rettDett,
      totale: rettifiche
    };

    var calcolata = iniziale + entrate - usciteTot + rettifiche;

    // ─────── RENDER ───────
    function fmt(n) { return Math.round(n).toLocaleString('it-IT'); }
    function fmtSigned(n) { return (n > 0 ? '+' : (n < 0 ? '−' : '')) + fmt(Math.abs(n)) + ' L'; }
    var h = '<table style="width:100%;border-collapse:collapse;font-size:13px;font-family:var(--font-mono)">';
    h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:10px 14px">Giacenza iniziale ' + da + '</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + esc(fonteIniziale) + '</td><td style="padding:10px 14px;text-align:right;font-weight:600">' + fmt(iniziale) + ' L</td></tr>';
    if (sede === 'deposito_vibo') {
      h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(99,153,34,0.06)"><td style="padding:10px 14px;color:#639922">+ Entrate deposito</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nEnt + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#639922;font-weight:600">+' + fmt(entrate) + ' L</td></tr>';
      h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(163,45,45,0.06)"><td style="padding:10px 14px;color:#A32D2D">− Uscite cliente</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nCli + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#A32D2D;font-weight:600">−' + fmt(uscCli) + ' L</td></tr>';
      h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(163,45,45,0.06)"><td style="padding:10px 14px;color:#A32D2D">− Uscite stazione</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nSta + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#A32D2D;font-weight:600">−' + fmt(uscSta) + ' L</td></tr>';
      h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(163,45,45,0.06)"><td style="padding:10px 14px;color:#A32D2D">− Uscite autoconsumo</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nAu + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#A32D2D;font-weight:600">−' + fmt(uscAu) + ' L</td></tr>';
    } else {
      h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(99,153,34,0.06)"><td style="padding:10px 14px;color:#639922">+ Entrate stazione (ricezioni)</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nEnt + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#639922;font-weight:600">+' + fmt(entrate) + ' L</td></tr>';
      h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(163,45,45,0.06)"><td style="padding:10px 14px;color:#A32D2D">− Vendite (delta letture pompe)</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nCli + ' delta</td><td style="padding:10px 14px;text-align:right;color:#A32D2D;font-weight:600">−' + fmt(uscCli) + ' L</td></tr>';
    }

    // Riga rettifiche compatta con bottone info
    if (nRett > 0) {
      var rettColor = rettifiche >= 0 ? '#639922' : '#A32D2D';
      var rettBg = rettifiche >= 0 ? 'rgba(99,153,34,0.06)' : 'rgba(163,45,45,0.06)';
      h += '<tr style="border-bottom:0.5px solid var(--border);background:' + rettBg + '">';
      h += '<td style="padding:10px 14px;color:' + rettColor + '">± Rettifiche</td>';
      h += '<td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">';
      h += nRett + (nRett === 1 ? ' rettifica' : ' rettifiche');
      h += ' <button onclick="_pfMvtApriDettaglioRettifiche()" title="Dettaglio rettifiche" style="margin-left:6px;padding:3px 8px;background:#fff;border:0.5px solid var(--border);border-radius:50%;cursor:pointer;font-size:11px;line-height:1;font-family:sans-serif">🛈</button>';
      h += '</td>';
      h += '<td style="padding:10px 14px;text-align:right;color:' + rettColor + ';font-weight:600">' + fmtSigned(rettifiche) + '</td>';
      h += '</tr>';
    }

    h += '<tr style="border-top:2px solid var(--primary);background:rgba(212,160,23,0.12)"><td style="padding:14px;font-weight:700;font-size:15px">= Giacenza calcolata al ' + a + '</td><td></td><td style="padding:14px;text-align:right;font-weight:700;font-size:16px;color:var(--primary)">' + fmt(calcolata) + ' L</td></tr>';
    h += '</table>';

    cont.innerHTML = h;
  } catch (err) {
    cont.innerHTML = '<div style="color:#A32D2D;padding:12px">Errore: ' + esc(err.message || String(err)) + '</div>';
  }
}

async function pfMovimentiTotali() { return _pfMvtCalcola('deposito_vibo', 'mvt'); }
async function pfMovimentiStzTotali() { return _pfMvtCalcola('stazione_oppido', 'mvts'); }

// ── POPUP DETTAGLIO RETTIFICHE ────────────────────────────────────
function _pfMvtApriDettaglioRettifiche() {
  var d = window._pfMvtRettDett;
  if (!d || !d.righe || !d.righe.length) { toast('Nessun dettaglio disponibile'); return; }

  var labelCausali = {
    cali_viaggio: { label:'Cali viaggio', bg:'#FCEBEB', color:'#791F1F' },
    cali_tecnici: { label:'Cali tecnici', bg:'#FAEEDA', color:'#633806' },
    eccedenze_viaggio: { label:'Eccedenze viaggio', bg:'#EAF3DE', color:'#27500A' },
    scatti_vuoto: { label:'Scatti a vuoto', bg:'#EEEDFE', color:'#3C3489' },
    manuale: { label:'Manuale', bg:'#E6F1FB', color:'#0C447C' },
    altro: { label:'Altro', bg:'#F1EFE8', color:'#444441' }
  };
  var labelOrigine = { manuale: 'Manuale', chiusura_mese: 'Chiusura mese' };

  function fmt(n) { return Math.round(n).toLocaleString('it-IT'); }
  function fmtSigned(n) { return (n > 0 ? '+' : (n < 0 ? '−' : '')) + fmt(Math.abs(n)) + ' L'; }
  function fmtDate(s) { try { return new Date(s).toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit',year:'numeric'}); } catch(e){ return s; } }

  // Aggrego per causale per il riepilogo in alto
  var perCausale = {};
  d.righe.forEach(function(r){
    var c = r.causale || 'manuale';
    if (!perCausale[c]) perCausale[c] = { totale: 0, n: 0 };
    perCausale[c].totale += Number(r.differenza || 0);
    perCausale[c].n++;
  });

  var titoloSede = d.sede === 'deposito_vibo' ? 'Deposito Vibo' : 'Stazione Oppido';
  var totColor = d.totale >= 0 ? '#27500A' : '#791F1F';

  var h = '<h3 style="margin:0 0 4px">🛈 Dettaglio rettifiche</h3>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + esc(titoloSede) + ' · ' + esc(d.prodotto) + ' · dal ' + fmtDate(d.da) + ' al ' + fmtDate(d.a) + '</div>';

  // Riepilogo per causale (KPI)
  h += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(120px,1fr));gap:8px;margin-bottom:16px">';
  Object.keys(perCausale).forEach(function(c){
    var info = labelCausali[c] || labelCausali.altro;
    var v = perCausale[c];
    h += '<div style="background:' + info.bg + ';padding:10px 12px;border-radius:6px">';
    h += '<div style="font-size:10px;color:' + info.color + ';text-transform:uppercase;letter-spacing:0.4px;font-weight:600">' + esc(info.label) + '</div>';
    h += '<div style="font-family:var(--font-mono);font-size:15px;font-weight:600;color:' + info.color + ';margin-top:2px">' + fmtSigned(v.totale) + '</div>';
    h += '<div style="font-size:10px;color:' + info.color + ';opacity:0.7">' + v.n + (v.n === 1 ? ' operazione' : ' operazioni') + '</div>';
    h += '</div>';
  });
  h += '</div>';

  // Totale complessivo
  h += '<div style="background:' + (d.totale >= 0 ? 'rgba(99,153,34,0.08)' : 'rgba(163,45,45,0.08)') + ';border:0.5px solid ' + totColor + ';border-radius:6px;padding:10px 14px;margin-bottom:16px;display:flex;justify-content:space-between;align-items:center">';
  h += '<div style="font-size:12px;color:' + totColor + ';text-transform:uppercase;letter-spacing:0.4px;font-weight:600">Totale rettifiche</div>';
  h += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700;color:' + totColor + '">' + fmtSigned(d.totale) + '</div>';
  h += '</div>';

  // Tabella dettaglio
  h += '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:600;margin-bottom:8px">Elenco operazioni (' + d.righe.length + ')</div>';
  h += '<div style="max-height:300px;overflow-y:auto;border:0.5px solid var(--border);border-radius:6px">';
  h += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
  h += '<thead><tr style="background:var(--bg);position:sticky;top:0">';
  h += '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.4px">Data</th>';
  h += '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.4px">Causale</th>';
  h += '<th style="text-align:left;padding:8px 10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.4px">Origine</th>';
  h += '<th style="text-align:right;padding:8px 10px;font-weight:600;color:var(--text-muted);text-transform:uppercase;font-size:10px;letter-spacing:0.4px">Litri</th>';
  h += '</tr></thead><tbody>';
  d.righe.forEach(function(r){
    var info = labelCausali[r.causale || 'manuale'] || labelCausali.altro;
    var diff = Number(r.differenza || 0);
    var diffCol = diff >= 0 ? '#27500A' : '#791F1F';
    h += '<tr style="border-top:0.5px solid var(--border)">';
    h += '<td style="padding:8px 10px;font-family:var(--font-mono)">' + fmtDate(r.data) + '</td>';
    h += '<td style="padding:8px 10px"><span style="background:' + info.bg + ';color:' + info.color + ';font-size:10px;padding:2px 8px;border-radius:3px">' + esc(info.label) + '</span></td>';
    h += '<td style="padding:8px 10px;color:var(--text-muted);font-size:10px">' + esc(labelOrigine[r.origine] || r.origine || '—') + '</td>';
    h += '<td style="padding:8px 10px;text-align:right;font-family:var(--font-mono);font-weight:600;color:' + diffCol + '">' + fmtSigned(diff) + '</td>';
    h += '</tr>';
    if (r.note) {
      h += '<tr style="border-top:0.5px solid rgba(0,0,0,0.03)"><td colspan="4" style="padding:2px 10px 6px;color:var(--text-muted);font-size:10px;font-style:italic">↳ ' + esc(r.note) + '</td></tr>';
    }
  });
  h += '</tbody></table></div>';

  h += '<div style="display:flex;justify-content:flex-end;margin-top:14px">';
  h += '<button onclick="chiudiModal()" style="padding:9px 20px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">Chiudi</button>';
  h += '</div>';

  apriModal(h);
}

// ── AUTO-INIT al click sui tab ────────────────────────────────────
(function() {
  document.addEventListener('click', function(e) {
    var t1 = e.target && e.target.closest && e.target.closest('.dep-tab[data-tab="dep-giacenze"]');
    if (t1) { setTimeout(pfMovimentiInit, 100); return; }
    var t2 = e.target && e.target.closest && e.target.closest('.stz-tab[data-tab="stz-giacenze"]');
    if (t2) { setTimeout(pfMovimentiStzInit, 100); return; }
  });
  if (document.readyState !== 'loading') setTimeout(pfMovimentiInit, 500);
  else document.addEventListener('DOMContentLoaded', function() { setTimeout(pfMovimentiInit, 500); });
})();
