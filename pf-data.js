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
  }

};
