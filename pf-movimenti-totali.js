// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Movimenti totali ad oggi (riconciliazione contabile)
// COMANDAMENTO: Giacenze = iniziale + entrate − uscite. FINE.
// Solo le rettifiche modificano il flusso, altrimenti pura matematica.
// ═══════════════════════════════════════════════════════════════════

// Inizializza dropdown prodotti + date di default al caricamento della card
async function pfMovimentiInit() {
  var selProd = document.getElementById('mvt-prodotto');
  if (!selProd || selProd.options.length > 0) return;
  var { data: cisterne } = await sb.from('cisterne').select('prodotto').eq('sede', 'deposito_vibo');
  var set = {};
  (cisterne || []).forEach(function(c) { if (c.prodotto) set[c.prodotto] = true; });
  var ordine = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO','AdBlue'];
  var prodotti = ordine.filter(function(p) { return set[p]; });
  Object.keys(set).forEach(function(p) { if (prodotti.indexOf(p) < 0) prodotti.push(p); });
  prodotti.forEach(function(p) {
    selProd.innerHTML += '<option value="' + esc(p) + '">' + esc(p) + '</option>';
  });
  // Date default: 01/01 anno corrente → oggi
  var oggi = new Date();
  var daEl = document.getElementById('mvt-da');
  var aEl = document.getElementById('mvt-a');
  if (daEl && !daEl.value) daEl.value = oggi.getFullYear() + '-01-01';
  if (aEl && !aEl.value) aEl.value = oggi.toISOString().split('T')[0];
}

// Calcola e mostra movimenti totali
async function pfMovimentiTotali() {
  var prodEl = document.getElementById('mvt-prodotto');
  var daEl = document.getElementById('mvt-da');
  var aEl = document.getElementById('mvt-a');
  var cont = document.getElementById('mvt-risultati');
  if (!prodEl || !daEl || !aEl || !cont) return;

  var prodotto = prodEl.value;
  var da = daEl.value;
  var a = aEl.value;
  if (!prodotto || !da || !a) { cont.innerHTML = '<div style="color:#A32D2D;padding:8px">Compila tutti i campi</div>'; return; }

  cont.innerHTML = '<div class="loading" style="padding:16px">Calcolo in corso...</div>';

  try {
    // 1. Giacenza iniziale: il giorno PRIMA di 'da', cerco record giacenze_giornaliere sede=deposito_vibo
    // con rilevata valorizzata. Se non trovo, fallback su giacenze_annuali anno-1.
    var giornoPrima = new Date(new Date(da + 'T00:00:00Z').getTime() - 86400000).toISOString().split('T')[0];
    var iniziale = 0;
    var fonteIniziale = '—';

    // Tentativo 1: record giornaliero del giorno prima con rilevata
    var ggRes = await sb.from('giacenze_giornaliere')
      .select('data,giacenza_rilevata,giacenza_teorica')
      .eq('sede','deposito_vibo').eq('prodotto', prodotto)
      .lte('data', giornoPrima)
      .order('data', { ascending: false }).limit(1).maybeSingle();

    if (ggRes.data && ggRes.data.giacenza_rilevata !== null) {
      iniziale = Number(ggRes.data.giacenza_rilevata);
      fonteIniziale = 'giacenze_giornaliere rilevata del ' + ggRes.data.data;
    } else {
      // Fallback: giacenze_annuali anno prec
      var annoDa = parseInt(da.substring(0,4));
      var gaRes = await sb.from('giacenze_annuali')
        .select('giacenza_reale')
        .eq('anno', annoDa - 1).eq('sede','deposito_vibo').eq('prodotto', prodotto)
        .eq('convalidata', true).maybeSingle();
      if (gaRes.data && gaRes.data.giacenza_reale !== null) {
        iniziale = Number(gaRes.data.giacenza_reale);
        fonteIniziale = 'giacenze_annuali ' + (annoDa - 1) + ' convalidata';
      }
    }

    // 2. Movimenti nel range [da, a]
    var STATI = ['confermato','consegnato'];
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

    var entrate = (entRes.data || []).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
    var uscCli = (uscCliRes.data || []).filter(isPhoenix).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
    var uscSta = (uscStaRes.data || []).filter(isPhoenix).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
    var uscAu = (uscAuRes.data || []).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);

    var nEnt = (entRes.data || []).length;
    var nCli = (uscCliRes.data || []).filter(isPhoenix).length;
    var nSta = (uscStaRes.data || []).filter(isPhoenix).length;
    var nAu = (uscAuRes.data || []).length;

    var usciteTot = uscCli + uscSta + uscAu;
    var calcolata = iniziale + entrate - usciteTot;

    // Render tabella
    function fmt(n) { return Math.round(n).toLocaleString('it-IT'); }
    var h = '<table style="width:100%;border-collapse:collapse;font-size:13px;font-family:var(--font-mono)">';
    h += '<tr style="border-bottom:0.5px solid var(--border)"><td style="padding:10px 14px">Giacenza iniziale ' + da + '</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + esc(fonteIniziale) + '</td><td style="padding:10px 14px;text-align:right;font-weight:600">' + fmt(iniziale) + ' L</td></tr>';
    h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(99,153,34,0.06)"><td style="padding:10px 14px;color:#639922">+ Entrate deposito</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nEnt + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#639922;font-weight:600">+' + fmt(entrate) + ' L</td></tr>';
    h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(163,45,45,0.06)"><td style="padding:10px 14px;color:#A32D2D">− Uscite cliente</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nCli + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#A32D2D;font-weight:600">−' + fmt(uscCli) + ' L</td></tr>';
    h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(163,45,45,0.06)"><td style="padding:10px 14px;color:#A32D2D">− Uscite stazione</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nSta + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#A32D2D;font-weight:600">−' + fmt(uscSta) + ' L</td></tr>';
    h += '<tr style="border-bottom:0.5px solid var(--border);background:rgba(163,45,45,0.06)"><td style="padding:10px 14px;color:#A32D2D">− Uscite autoconsumo</td><td style="padding:10px 14px;text-align:right;color:var(--text-muted);font-size:11px">' + nAu + ' ordini</td><td style="padding:10px 14px;text-align:right;color:#A32D2D;font-weight:600">−' + fmt(uscAu) + ' L</td></tr>';
    h += '<tr style="border-top:2px solid var(--primary);background:rgba(212,160,23,0.12)"><td style="padding:14px;font-weight:700;font-size:15px">= Giacenza calcolata al ' + a + '</td><td></td><td style="padding:14px;text-align:right;font-weight:700;font-size:16px;color:var(--primary)">' + fmt(calcolata) + ' L</td></tr>';
    h += '</table>';

    cont.innerHTML = h;
  } catch (err) {
    cont.innerHTML = '<div style="color:#A32D2D;padding:12px">Errore: ' + esc(err.message || String(err)) + '</div>';
  }
}

// Auto-init al click sul tab Giacenze
(function() {
  document.addEventListener('click', function(e) {
    var t = e.target && e.target.closest && e.target.closest('.dep-tab[data-tab="dep-giacenze"]');
    if (!t) return;
    setTimeout(pfMovimentiInit, 100);
  });
  if (document.readyState !== 'loading') setTimeout(pfMovimentiInit, 500);
  else document.addEventListener('DOMContentLoaded', function() { setTimeout(pfMovimentiInit, 500); });
})();
