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
      var entStaRes = await sb.from('ordini').select('litri')
        .eq('tipo_ordine','stazione_servizio').in('stato', STATI).eq('prodotto', prodotto)
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
    var calcolata = iniziale + entrate - usciteTot;

    // ─────── RENDER ───────
    function fmt(n) { return Math.round(n).toLocaleString('it-IT'); }
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
    h += '<tr style="border-top:2px solid var(--primary);background:rgba(212,160,23,0.12)"><td style="padding:14px;font-weight:700;font-size:15px">= Giacenza calcolata al ' + a + '</td><td></td><td style="padding:14px;text-align:right;font-weight:700;font-size:16px;color:var(--primary)">' + fmt(calcolata) + ' L</td></tr>';
    h += '</table>';

    cont.innerHTML = h;
  } catch (err) {
    cont.innerHTML = '<div style="color:#A32D2D;padding:12px">Errore: ' + esc(err.message || String(err)) + '</div>';
  }
}

async function pfMovimentiTotali() { return _pfMvtCalcola('deposito_vibo', 'mvt'); }
async function pfMovimentiStzTotali() { return _pfMvtCalcola('stazione_oppido', 'mvts'); }

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
