// ═══════════════════════════════════════════════════════════════════
// pf-data.js — STRATO DATI CANONICO
// ═══════════════════════════════════════════════════════════════════
//
// Single source of truth per ogni report che legge tabella `ordini`.
// Replica la logica della query "Ordini Definitivi" di Access:
// una query padre con TUTTI i campi, e query figlie a cascata che
// filtrano in JS per rispondere ai vari report.
//
// REGOLA: ogni nuova query su `ordini` deve passare da qui. Niente
// più sb.from('ordini') sparsi nei moduli.
//
// LINEA DI LETTURA (definita dal proprietario):
//   stato in ('confermato','consegnato')
//   - 'confermato' = ordine con camion assegnato + DAS generato
//                    (impostato da confermaOrdineSingoloCarico in
//                     pf-logistica.js riga ~716)
//   - 'consegnato' = ordine con anche das_firmato_url caricato
//   Esclusi: 'in attesa', 'programmato', 'annullato'
//
// AUTOCONSUMO:
//   - escluso dalle vendite (non è una vendita esterna)
//   - incluso negli acquisti (incide su fido e scadenze fornitore)
//
// I LITRI SONO IL FIUME: invariante su cui si basa tutto. Prezzi,
// margini e altro possono cambiare; i litri seguiti dall'ordine al
// movimento cisterna sono sempre la verità.
// ═══════════════════════════════════════════════════════════════════

window.pfData = {

  // ─────────────────────────────────────────────────────────────────
  // QUERY PADRE
  // Ritorna TUTTI i campi di TUTTI gli ordini "definitivi" nel range.
  // Tutte le altre funzioni di pfData derivano da questa.
  //
  // Parametri:
  //   da, a              : ISO date (YYYY-MM-DD). Filtro server-side.
  //   stati              : array di stati. Default ['confermato','consegnato'].
  //   includiAnnullati   : se true, include anche stato='annullato'
  //                        (uso eccezionale, es. audit).
  //   includiNonDefinitivi : se true, include anche 'in attesa'/'programmato'.
  // ─────────────────────────────────────────────────────────────────
  async getOrdini(opts) {
    opts = opts || {};
    var da = opts.da || null;
    var a  = opts.a  || null;
    var stati = opts.stati || null;
    var includiAnnullati = !!opts.includiAnnullati;
    var includiNonDefinitivi = !!opts.includiNonDefinitivi;

    var q = sb.from('ordini').select('*').order('data', { ascending: true });
    if (da) q = q.gte('data', da);
    if (a)  q = q.lte('data', a);

    if (stati && stati.length) {
      q = q.in('stato', stati);
    } else if (includiNonDefinitivi && includiAnnullati) {
      // nessun filtro stato
    } else if (includiNonDefinitivi) {
      q = q.neq('stato', 'annullato');
    } else {
      // default: linea di lettura
      var statiDefault = includiAnnullati
        ? ['confermato', 'consegnato', 'annullato']
        : ['confermato', 'consegnato'];
      q = q.in('stato', statiDefault);
    }

    // Paginazione automatica (Supabase limita a 1000 per chiamata)
    var tutti = [];
    var from = 0;
    while (true) {
      var res = await q.range(from, from + 999);
      if (res.error) throw res.error;
      var batch = res.data || [];
      if (!batch.length) break;
      tutti = tutti.concat(batch);
      if (batch.length < 1000) break;
      from += 1000;
    }
    return tutti;
  },

  // ─────────────────────────────────────────────────────────────────
  // QUERY FIGLIE A CASCATA
  // Ognuna chiama getOrdini() e filtra in JS.
  // ─────────────────────────────────────────────────────────────────

  // VENDITE — esclude autoconsumo ed entrate deposito
  // soloIngrosso = true → solo tipo_ordine='cliente' (esclude stazione)
  async getVendite(opts) {
    opts = opts || {};
    var tutti = await this.getOrdini({ da: opts.da, a: opts.a, stati: opts.stati });
    var tipi = opts.soloIngrosso ? ['cliente'] : ['cliente', 'stazione_servizio'];
    var out = tutti.filter(function(o) { return tipi.indexOf(o.tipo_ordine) >= 0; });
    if (opts.cliente) {
      var clienti = Array.isArray(opts.cliente) ? opts.cliente : [opts.cliente];
      out = out.filter(function(o) { return clienti.indexOf(o.cliente) >= 0; });
    }
    if (opts.prodotto) out = out.filter(function(o) { return o.prodotto === opts.prodotto; });
    return out;
  },

  // ACQUISTI — tutto ciò che ha un fornitore terzo
  // Include autoconsumo (incide su fido) e tutti i tipi_ordine
  // Esclude di default i giri interni "PhoenixFuel" (non sono fornitori terzi)
  async getAcquisti(opts) {
    opts = opts || {};
    var tutti = await this.getOrdini({ da: opts.da, a: opts.a, stati: opts.stati });
    var includiInterni = !!opts.includiInterni;
    var fornitoriFiltro = null;
    if (opts.fornitore) {
      fornitoriFiltro = Array.isArray(opts.fornitore) ? opts.fornitore : [opts.fornitore];
    }
    return tutti.filter(function(o) {
      if (!o.fornitore) return false;
      if (!includiInterni && String(o.fornitore).toLowerCase().indexOf('phoenix') >= 0) return false;
      if (fornitoriFiltro && fornitoriFiltro.indexOf(o.fornitore) < 0) return false;
      if (opts.prodotto && o.prodotto !== opts.prodotto) return false;
      return true;
    });
  },

  // ENTRATE DEPOSITO — solo tipo_ordine='entrata_deposito'
  // Sottoinsieme di getAcquisti, utile per giacenze deposito
  async getEntrateDeposito(opts) {
    opts = opts || {};
    var tutti = await this.getOrdini({ da: opts.da, a: opts.a, stati: opts.stati });
    return tutti.filter(function(o) { return o.tipo_ordine === 'entrata_deposito'; });
  },

  // ESPOSIZIONE FORNITORE — tutto storico, ordini non pagati al fornitore
  // Usata per calcolo fido. Non filtra per data (è uno snapshot dell'esposto).
  async getEsposizioneFornitore(nomeFornitore) {
    var tutti = await this.getOrdini({});
    return tutti.filter(function(o) {
      return o.fornitore === nomeFornitore && !o.pagato_fornitore;
    });
  },

  // ─────────────────────────────────────────────────────────────────
  // AGGREGAZIONI UTILI (numeri identici per chiunque le usi)
  // ─────────────────────────────────────────────────────────────────

  // KPI rapidi su un set di ordini già filtrato
  // Ritorna { ordini, litri, importoCosto, importoVendita, costoMedioL }
  aggregaKPI(ordini) {
    var n = 0, litri = 0, costo = 0, vendita = 0;
    (ordini || []).forEach(function(o) {
      var l = Number(o.litri || 0);
      var cl = Number(o.costo_litro || 0);
      var tl = Number(o.trasporto_litro || 0);
      var marg = Number(o.margine || 0);
      n++;
      litri += l;
      costo += (cl + tl) * l;
      vendita += (cl + tl + marg) * l;
    });
    return {
      ordini: n,
      litri: litri,
      importoCosto: costo,
      importoVendita: vendita,
      costoMedioL: litri > 0 ? costo / litri : 0
    };
  },

  // ─────────────────────────────────────────────────────────────────
  // GIACENZA ALLA DATA — unica sorgente di verità per i litri in cisterna
  //
  // COMANDAMENTI (stabiliti dal proprietario):
  //   1. giacenza = iniziale_01_01 + entrate − uscite
  //   2. solo le rettifiche modificano il flusso
  //
  // Parametri:
  //   sede     : 'deposito_vibo' | 'stazione_oppido'
  //   prodotto : nome prodotto
  //   data     : ISO (YYYY-MM-DD) — giacenza a fine giornata
  //
  // Ritorna: { iniziale, entrate, uscite, calcolata, fonteIniziale }
  // ─────────────────────────────────────────────────────────────────
  async getGiacenzaAllaData(sede, prodotto, data) {
    var anno = parseInt(data.substring(0, 4));
    var inizioAnno = anno + '-01-01';

    // ─────────────────────────────────────────────────────────────
    // CASO SPECIALE: se la data è esattamente 31/12 di un anno e
    // esiste una giacenza_annuali convalidata per quell'anno,
    // ritornala direttamente come saldo di chiusura.
    // Questo evita che chiamando "31/12/2025" il sistema calcoli
    // movimenti del 2025 (anno pre-PhoenixFuel) e dia 0.
    // ─────────────────────────────────────────────────────────────
    if (data === anno + '-12-31') {
      var chiusuraRes = await sb.from('giacenze_annuali')
        .select('giacenza_reale')
        .eq('anno', anno).eq('sede', sede).eq('prodotto', prodotto)
        .eq('convalidata', true).maybeSingle();
      if (chiusuraRes.data && chiusuraRes.data.giacenza_reale !== null) {
        var chiusura = Number(chiusuraRes.data.giacenza_reale);
        return {
          iniziale: chiusura,
          entrate: 0,
          uscite: 0,
          calcolata: chiusura,
          fonteIniziale: 'giacenze_annuali ' + anno + ' (chiusura convalidata)'
        };
      }
    }

    // 1. Giacenza iniziale (01/01 dell'anno)
    var iniziale = 0;
    var fonteIniziale = '—';
    var gaRes = await sb.from('giacenze_annuali')
      .select('giacenza_reale')
      .eq('anno', anno - 1).eq('sede', sede).eq('prodotto', prodotto)
      .eq('convalidata', true).maybeSingle();
    if (gaRes.data && gaRes.data.giacenza_reale !== null) {
      iniziale = Number(gaRes.data.giacenza_reale);
      fonteIniziale = 'giacenze_annuali ' + (anno - 1);
    } else {
      // Fallback: primo record giacenze_giornaliere con rilevata valorizzata nell'anno-1
      var ggIni = await sb.from('giacenze_giornaliere')
        .select('giacenza_rilevata,data')
        .eq('sede', sede).eq('prodotto', prodotto)
        .not('giacenza_rilevata', 'is', null)
        .lte('data', inizioAnno)
        .order('data', { ascending: false }).limit(1).maybeSingle();
      if (ggIni.data) {
        iniziale = Number(ggIni.data.giacenza_rilevata);
        fonteIniziale = 'giacenze_giornaliere rilevata ' + ggIni.data.data;
      }
    }

    // 2. Movimenti [01/01, data]
    var STATI = ['confermato','consegnato'];
    var entrate = 0, uscite = 0;

    if (sede === 'deposito_vibo') {
      var [entRes, uscCliRes, uscStaRes, uscAuRes] = await Promise.all([
        sb.from('ordini').select('litri')
          .eq('tipo_ordine','entrata_deposito').in('stato', STATI).eq('prodotto', prodotto)
          .gte('data', inizioAnno).lte('data', data),
        sb.from('ordini').select('litri,fornitore')
          .eq('tipo_ordine','cliente').in('stato', STATI).eq('prodotto', prodotto)
          .gte('data', inizioAnno).lte('data', data),
        sb.from('ordini').select('litri,fornitore')
          .eq('tipo_ordine','stazione_servizio').in('stato', STATI).eq('prodotto', prodotto)
          .gte('data', inizioAnno).lte('data', data),
        sb.from('ordini').select('litri')
          .eq('tipo_ordine','autoconsumo').in('stato', STATI).eq('prodotto', prodotto)
          .gte('data', inizioAnno).lte('data', data)
      ]);
      function isPhoenix(o) {
        var f = (o.fornitore || '').toLowerCase();
        return f.indexOf('phoenix') >= 0 || f.indexOf('deposito') >= 0;
      }
      entrate = (entRes.data || []).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      uscite += (uscCliRes.data || []).filter(isPhoenix).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      uscite += (uscStaRes.data || []).filter(isPhoenix).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      uscite += (uscAuRes.data || []).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
    } else if (sede === 'stazione_oppido') {
      // Entrate: tipo_ordine='stazione_servizio'
      var entStaRes = await sb.from('ordini').select('litri')
        .eq('tipo_ordine','stazione_servizio').in('stato', STATI).eq('prodotto', prodotto)
        .gte('data', inizioAnno).lte('data', data);
      entrate = (entStaRes.data || []).reduce(function(s,o){ return s + Number(o.litri || 0); }, 0);
      // Uscite: differenze letture pompe
      var pompeRes = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true);
      var ids = (pompeRes.data || []).filter(function(p){ return p.prodotto === prodotto; }).map(function(p){ return p.id; });
      if (ids.length) {
        var lettRes = await sb.from('stazione_letture').select('pompa_id,data,lettura')
          .in('pompa_id', ids).gte('data', inizioAnno).lte('data', data).order('data');
        var byPompa = {};
        (lettRes.data || []).forEach(function(l) {
          if (!byPompa[l.pompa_id]) byPompa[l.pompa_id] = [];
          byPompa[l.pompa_id].push(l);
        });
        Object.keys(byPompa).forEach(function(pid) {
          var arr = byPompa[pid];
          for (var j = 1; j < arr.length; j++) {
            var d = Number(arr[j].lettura) - Number(arr[j-1].lettura);
            if (d > 0) uscite += d;
          }
        });
      }
    }

    var calcolata = Math.round(iniziale + entrate - uscite);
    return { iniziale: iniziale, entrate: Math.round(entrate), uscite: Math.round(uscite), calcolata: calcolata, fonteIniziale: fonteIniziale };
  }

};
