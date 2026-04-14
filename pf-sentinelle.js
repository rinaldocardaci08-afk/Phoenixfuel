// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Sentinelle automatiche
// Ogni sentinella è una query + valore atteso. Esegui tutte con 1 click.
// Legate al flusso dei movimenti litri (unica sorgente di verità dichiarata).
// ═══════════════════════════════════════════════════════════════════

var PF_SENTINELLE = [
  {
    id: 'vendite_ingrosso_q1_2026',
    nome: 'Vendite ingrosso 01/01-07/04/2026',
    atteso: '3170900 L',
    query: async function() {
      var res = await sb.from('ordini')
        .select('litri')
        .eq('tipo_ordine', 'cliente')
        .in('stato', ['confermato', 'consegnato'])
        .gte('data', '2026-01-01').lte('data', '2026-04-07');
      if (res.error) throw res.error;
      var tot = (res.data || []).reduce(function(s, o) { return s + Number(o.litri || 0); }, 0);
      return Math.round(tot) + ' L';
    },
    confronta: function(ottenuto) {
      var num = parseInt(ottenuto.replace(/[^\d-]/g, ''), 10);
      return Math.abs(num - 3170900) <= 100; // tolleranza 100 L
    }
  },
  {
    id: 'eni_ordini_litri_q1_2026',
    nome: 'Eni 01/01-07/04/2026 (ordini + litri) via pfData',
    atteso: '191 ord / 1822981 L',
    query: async function() {
      if (typeof pfData === 'undefined' || !pfData.getAcquisti) {
        throw new Error('pfData non caricato');
      }
      var ordini = await pfData.getAcquisti({ da: '2026-01-01', a: '2026-04-07', fornitore: 'Eni' });
      var count = ordini.length;
      var tot = ordini.reduce(function(s, o) { return s + Number(o.litri || 0); }, 0);
      return count + ' ord / ' + Math.round(tot) + ' L';
    },
    confronta: function(ottenuto) {
      return ottenuto.indexOf('191 ord') === 0 && ottenuto.indexOf('1822981') >= 0;
    }
  },
  {
    id: 'stazione_marzo_gasolio',
    nome: 'Stazione Oppido marzo 2026 — Gasolio Autotrazione',
    atteso: '45206 L',
    query: async function() {
      var { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true);
      var ids = (pompe || []).filter(function(p) { return p.prodotto === 'Gasolio Autotrazione'; }).map(function(p) { return p.id; });
      if (!ids.length) return '0 L';
      var res = await sb.from('stazione_letture').select('pompa_id,data,lettura')
        .in('pompa_id', ids).gte('data', '2026-02-28').lte('data', '2026-03-31').order('data');
      if (res.error) throw res.error;
      var per = {};
      (res.data || []).forEach(function(l) {
        if (!per[l.pompa_id]) per[l.pompa_id] = [];
        per[l.pompa_id].push(l);
      });
      var tot = 0;
      Object.keys(per).forEach(function(pid) {
        var arr = per[pid].sort(function(a,b){ return a.data < b.data ? -1 : 1; });
        for (var j = 1; j < arr.length; j++) {
          if (arr[j].data >= '2026-03-01' && arr[j].data <= '2026-03-31') {
            var d = Number(arr[j].lettura) - Number(arr[j-1].lettura);
            if (d > 0) tot += d;
          }
        }
      });
      return Math.round(tot) + ' L';
    },
    confronta: function(ottenuto) {
      var num = parseInt(ottenuto.replace(/[^\d]/g, ''), 10);
      return Math.abs(num - 45206) <= 50;
    }
  },
  {
    id: 'stazione_marzo_benzina',
    nome: 'Stazione Oppido marzo 2026 — Benzina',
    atteso: '25013 L',
    query: async function() {
      var { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true);
      var ids = (pompe || []).filter(function(p) { return p.prodotto === 'Benzina'; }).map(function(p) { return p.id; });
      if (!ids.length) return '0 L';
      var res = await sb.from('stazione_letture').select('pompa_id,data,lettura')
        .in('pompa_id', ids).gte('data', '2026-02-28').lte('data', '2026-03-31').order('data');
      if (res.error) throw res.error;
      var per = {};
      (res.data || []).forEach(function(l) {
        if (!per[l.pompa_id]) per[l.pompa_id] = [];
        per[l.pompa_id].push(l);
      });
      var tot = 0;
      Object.keys(per).forEach(function(pid) {
        var arr = per[pid].sort(function(a,b){ return a.data < b.data ? -1 : 1; });
        for (var j = 1; j < arr.length; j++) {
          if (arr[j].data >= '2026-03-01' && arr[j].data <= '2026-03-31') {
            var d = Number(arr[j].lettura) - Number(arr[j-1].lettura);
            if (d > 0) tot += d;
          }
        }
      });
      return Math.round(tot) + ' L';
    },
    confronta: function(ottenuto) {
      var num = parseInt(ottenuto.replace(/[^\d]/g, ''), 10);
      return Math.abs(num - 25013) <= 50;
    }
  },
  {
    id: 'ordini_stazione_servizio_q1_2026',
    nome: 'Ordini stazione_servizio 01/01-07/04/2026',
    atteso: '36 ord / 197500 L',
    query: async function() {
      var res = await sb.from('ordini')
        .select('litri')
        .eq('tipo_ordine', 'stazione_servizio')
        .in('stato', ['confermato', 'consegnato'])
        .gte('data', '2026-01-01').lte('data', '2026-04-07');
      if (res.error) throw res.error;
      var count = (res.data || []).length;
      var tot = (res.data || []).reduce(function(s, o) { return s + Number(o.litri || 0); }, 0);
      return count + ' ord / ' + Math.round(tot) + ' L';
    },
    confronta: function(ottenuto) {
      return ottenuto.indexOf('36 ord') === 0 && ottenuto.indexOf('197500') >= 0;
    }
  },
  {
    id: 'alert_scostamento_rilevato',
    nome: '🚨 Alert scostamenti rilevata-teorica > 10.000 L',
    atteso: 'Nessuno scostamento sopra soglia',
    query: async function() {
      var res = await sb.from('giacenze_giornaliere')
        .select('data,sede,prodotto,giacenza_teorica,giacenza_rilevata')
        .not('giacenza_rilevata', 'is', null)
        .gte('data', '2026-01-01')
        .order('data', { ascending: false });
      if (res.error) throw res.error;
      var anomalie = [];
      (res.data || []).forEach(function(r) {
        var diff = Math.abs(Number(r.giacenza_rilevata || 0) - Number(r.giacenza_teorica || 0));
        if (diff > 10000) {
          anomalie.push(r.data + ' ' + r.sede.replace('_',' ') + ' ' + r.prodotto + ': Δ ' + Math.round(diff) + ' L');
        }
      });
      if (anomalie.length === 0) return 'OK — nessuno scostamento > 10.000 L';
      return anomalie.length + ' anomalie: ' + anomalie.slice(0, 3).join(' | ') + (anomalie.length > 3 ? ' (+' + (anomalie.length - 3) + ')' : '');
    },
    confronta: function(ottenuto) {
      return ottenuto.indexOf('OK') === 0;
    }
  },
  {
    id: 'alert_letture_pompe_mancanti',
    nome: '🚨 Alert letture pompe stazione mancanti (tolleranza 3 gg)',
    atteso: 'Tutte le pompe aggiornate fino a 3 gg fa',
    query: async function() {
      // Data limite: oggi - 3 giorni (tolleranza weekend)
      var oggi = new Date();
      var limite = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 3);
      var limiteISO = limite.toISOString().split('T')[0];

      var { data: pompe } = await sb.from('stazione_pompe').select('id,nome').eq('attiva', true);
      if (!pompe || !pompe.length) return 'OK — nessuna pompa attiva';

      var { data: letture } = await sb.from('stazione_letture')
        .select('pompa_id,data')
        .gte('data', limiteISO)
        .order('data', { ascending: false });

      // Ultima data lettura per pompa
      var ultimaByPompa = {};
      (letture || []).forEach(function(l) {
        if (!ultimaByPompa[l.pompa_id] || l.data > ultimaByPompa[l.pompa_id]) {
          ultimaByPompa[l.pompa_id] = l.data;
        }
      });

      var mancanti = [];
      pompe.forEach(function(p) {
        if (!ultimaByPompa[p.id] || ultimaByPompa[p.id] < limiteISO) {
          var ult = ultimaByPompa[p.id] || 'mai';
          mancanti.push(p.nome + ' (ultima: ' + ult + ')');
        }
      });

      if (mancanti.length === 0) return 'OK — tutte ' + pompe.length + ' pompe aggiornate';
      return mancanti.length + '/' + pompe.length + ' pompe: ' + mancanti.join(' | ');
    },
    confronta: function(ottenuto) {
      return ottenuto.indexOf('OK') === 0;
    }
  },
  {
    id: 'alert_das_caricato_stato_confermato',
    nome: '🚨 Alert DAS firmato caricato ma stato ancora confermato (>3 gg)',
    atteso: 'Tutti gli ordini con DAS sono consegnato',
    query: async function() {
      // Tolleranza 3 giorni: copre weekend lungo (venerdì→lunedì)
      // Un ordine è "rosso" solo se la sua data è più vecchia di 3 giorni
      // ma lo stato è ancora 'confermato' nonostante DAS firmato caricato.
      var oggi = new Date();
      var limite = new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 3);
      var limiteISO = limite.toISOString().split('T')[0];
      var res = await sb.from('ordini')
        .select('id,data,cliente,fornitore,prodotto,litri')
        .not('das_firmato_url', 'is', null)
        .neq('das_firmato_url', '')
        .eq('stato', 'confermato')
        .lt('data', limiteISO)
        .gte('data', '2026-01-01')
        .order('data', { ascending: false });
      if (res.error) throw res.error;
      var anomalie = res.data || [];
      if (anomalie.length === 0) return 'OK — nessun ordine con DAS in stato sbagliato';
      var primi = anomalie.slice(0, 3).map(function(o) {
        return o.data + ' ' + (o.cliente || o.fornitore || '?') + ' ' + Math.round(o.litri) + 'L';
      });
      return anomalie.length + ' ordini: ' + primi.join(' | ') + (anomalie.length > 3 ? ' (+' + (anomalie.length - 3) + ')' : '');
    },
    confronta: function(ottenuto) {
      return ottenuto.indexOf('OK') === 0;
    }
  },
  {
    id: 'quadratura_cisterne_vs_calcolato',
    nome: '⚖️ Quadratura cisterne DB vs calcolato pfData (tutti i prodotti deposito)',
    atteso: 'Tutti i prodotti allineati (Δ < 100 L)',
    query: async function() {
      if (typeof pfData === 'undefined' || !pfData.getGiacenzaAllaData) {
        throw new Error('pfData.getGiacenzaAllaData non disponibile');
      }
      // 1. Tutte le cisterne deposito: somma livello_attuale per prodotto
      var cisRes = await sb.from('cisterne').select('prodotto,livello_attuale').eq('sede','deposito_vibo');
      if (cisRes.error) throw cisRes.error;
      var cisterneByProd = {};
      (cisRes.data || []).forEach(function(c) {
        if (!c.prodotto) return;
        cisterneByProd[c.prodotto] = (cisterneByProd[c.prodotto] || 0) + Number(c.livello_attuale || 0);
      });
      var prodotti = Object.keys(cisterneByProd);
      if (!prodotti.length) return 'OK — nessuna cisterna deposito';

      // 2. Per ogni prodotto: calc via pfData
      var oggi = new Date().toISOString().split('T')[0];
      var risultati = [];
      for (var i = 0; i < prodotti.length; i++) {
        var prod = prodotti[i];
        var calcRes = await pfData.getGiacenzaAllaData('deposito_vibo', prod, oggi);
        var cisterneVal = Math.round(cisterneByProd[prod]);
        var calcVal = Math.round(calcRes.calcolata);
        var delta = cisterneVal - calcVal;
        risultati.push({ prod: prod, cisterne: cisterneVal, calc: calcVal, delta: delta });
      }

      // 3. Filtra i disallineati (|delta| > 100)
      var disallineati = risultati.filter(function(r) { return Math.abs(r.delta) > 100; });
      if (disallineati.length === 0) {
        return 'OK — tutti ' + prodotti.length + ' prodotti allineati (Δ < 100 L)';
      }
      // Output: lista dei disallineati con cisterne/calc/delta
      var dettaglio = disallineati.map(function(r) {
        var sgn = r.delta > 0 ? '+' : '';
        return r.prod + ': cisterne ' + r.cisterne.toLocaleString('it-IT') + ' vs calc ' + r.calc.toLocaleString('it-IT') + ' (Δ ' + sgn + r.delta.toLocaleString('it-IT') + ')';
      });
      return disallineati.length + '/' + prodotti.length + ' disallineati: ' + dettaglio.join(' | ');
    },
    confronta: function(ottenuto) {
      return ottenuto.indexOf('OK') === 0;
    }
  },
];

// ═══════════════════════════════════════════════════════════════════
// ESECUZIONE + RENDER
// ═══════════════════════════════════════════════════════════════════
async function pfSentinelleEsegui() {
  var cont = document.getElementById('pf-sent-risultati');
  if (!cont) return;
  cont.innerHTML = '<div class="loading" style="padding:16px">Esecuzione sentinelle in corso...</div>';

  var results = [];
  for (var i = 0; i < PF_SENTINELLE.length; i++) {
    var s = PF_SENTINELLE[i];
    var ottenuto = null, errore = null, ok = false;
    try {
      ottenuto = await s.query();
      ok = s.confronta(ottenuto);
    } catch (e) {
      errore = e.message || String(e);
    }
    results.push({ sentinella: s, ottenuto: ottenuto, errore: errore, ok: ok });
  }

  _pfSentRender(results);
}

function _pfSentRender(results) {
  var cont = document.getElementById('pf-sent-risultati');
  if (!cont) return;
  var okCount = results.filter(function(r) { return r.ok; }).length;
  var totCount = results.length;
  var tutteOk = okCount === totCount;

  var h = '<div style="padding:12px 16px;background:' + (tutteOk ? 'rgba(99,153,34,0.12)' : 'rgba(163,45,45,0.12)') + ';border:1px solid ' + (tutteOk ? '#639922' : '#A32D2D') + ';border-radius:8px;margin-bottom:12px;font-weight:600;color:' + (tutteOk ? '#639922' : '#A32D2D') + '">';
  h += (tutteOk ? '✓ ' : '✗ ') + okCount + ' / ' + totCount + ' sentinelle OK';
  h += '</div>';

  h += '<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="background:var(--bg-card)">';
  h += '<th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Stato</th>';
  h += '<th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Sentinella</th>';
  h += '<th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Atteso</th>';
  h += '<th style="text-align:left;padding:8px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase">Ottenuto</th>';
  h += '</tr></thead><tbody>';

  results.forEach(function(r) {
    var s = r.sentinella;
    var stato, colore;
    if (r.errore) { stato = 'ERR'; colore = '#BA7517'; }
    else if (r.ok) { stato = '✓'; colore = '#639922'; }
    else { stato = '✗'; colore = '#A32D2D'; }
    h += '<tr style="border-top:0.5px solid var(--border)">';
    h += '<td style="padding:10px;font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + colore + '">' + stato + '</td>';
    h += '<td style="padding:10px">' + esc(s.nome) + '</td>';
    h += '<td style="padding:10px;font-family:var(--font-mono);color:var(--text-muted)">' + esc(s.atteso) + '</td>';
    h += '<td style="padding:10px;font-family:var(--font-mono);color:' + colore + '">' + esc(r.errore || r.ottenuto || '—') + '</td>';
    h += '</tr>';
  });

  h += '</tbody></table>';
  h += '<div style="margin-top:12px;font-size:11px;color:var(--text-muted)">Eseguite il ' + new Date().toLocaleString('it-IT') + '. Esegui di nuovo dopo ogni commit grosso per verificare regressioni.</div>';
  cont.innerHTML = h;
}
