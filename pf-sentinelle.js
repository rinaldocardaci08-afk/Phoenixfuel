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
    id: 'disallineamento_gasauto_deposito',
    nome: '⚠️ Disallineamento giacenza Gas Auto deposito (4 fonti)',
    atteso: 'Tutte uguali (tolleranza 100 L)',
    query: async function() {
      // Fonte 1: cisterne.livello_attuale
      var cisRes = await sb.from('cisterne').select('livello_attuale')
        .eq('sede', 'deposito_vibo').eq('prodotto', 'Gasolio Autotrazione');
      var fonte1 = (cisRes.data || []).reduce(function(s, c) { return s + Number(c.livello_attuale || 0); }, 0);

      // Fonte 2: giacenze_giornaliere ultimo record
      var ggRes = await sb.from('giacenze_giornaliere')
        .select('giacenza_teorica,giacenza_rilevata,data')
        .eq('sede', 'deposito_vibo').eq('prodotto', 'Gasolio Autotrazione')
        .order('data', { ascending: false }).limit(1).maybeSingle();
      var fonte2 = null;
      if (ggRes.data) {
        fonte2 = ggRes.data.giacenza_rilevata !== null ? Number(ggRes.data.giacenza_rilevata) : Number(ggRes.data.giacenza_teorica || 0);
      }

      // Fonte 3: giacenze_mensili ultimo mese
      var fonte3 = null;
      try {
        var gmRes = await sb.from('giacenze_mensili')
          .select('giacenza_teorica,mese,anno')
          .eq('sede', 'deposito_vibo').eq('prodotto', 'Gasolio Autotrazione')
          .order('anno', { ascending: false }).order('mese', { ascending: false }).limit(1);
        if (gmRes.data && gmRes.data.length > 0) {
          fonte3 = Number(gmRes.data[0].giacenza_teorica || 0);
        }
      } catch (e) { /* tabella vuota o errore, fonte3 resta null */ }

      // Fonte 4: calcolata cumulativa dal 01/01 via pfData (stessa logica vista settimanale)
      var fonte4 = null;
      try {
        if (typeof pfData !== 'undefined' && pfData.getOrdini) {
          // Giacenza iniziale 01/01
          var giacIniRes = await sb.from('giacenze_annuali')
            .select('giacenza_reale').eq('anno', 2025).eq('sede', 'deposito_vibo')
            .eq('prodotto', 'Gasolio Autotrazione').eq('convalidata', true).maybeSingle();
          var iniziale = giacIniRes.data ? Number(giacIniRes.data.giacenza_reale || 0) : 20714;

          var oggi = new Date().toISOString().split('T')[0];
          var tutti = await pfData.getOrdini({ da: '2026-01-01', a: oggi });
          var ent = 0, usc = 0;
          tutti.forEach(function(o) {
            if (o.prodotto !== 'Gasolio Autotrazione') return;
            if (o.tipo_ordine === 'entrata_deposito') ent += Number(o.litri || 0);
            else if (o.tipo_ordine === 'cliente') {
              var f = (o.fornitore || '').toLowerCase();
              if (f.indexOf('phoenix') >= 0 || f.indexOf('deposito') >= 0) usc += Number(o.litri || 0);
            } else if (o.tipo_ordine === 'stazione_servizio') {
              var f2 = (o.fornitore || '').toLowerCase();
              if (f2.indexOf('phoenix') >= 0 || f2.indexOf('deposito') >= 0) usc += Number(o.litri || 0);
            } else if (o.tipo_ordine === 'autoconsumo') usc += Number(o.litri || 0);
          });
          fonte4 = iniziale + ent - usc;
        }
      } catch (e) {}

      var f1 = Math.round(fonte1);
      var f2 = fonte2 !== null ? Math.round(fonte2) : null;
      var f3 = fonte3 !== null ? Math.round(fonte3) : null;
      var f4 = fonte4 !== null ? Math.round(fonte4) : null;

      return 'cisterne:' + f1 + ' / ggiorn:' + (f2 !== null ? f2 : '—') + ' / gmens:' + (f3 !== null ? f3 : '—') + ' / calc:' + (f4 !== null ? f4 : '—');
    },
    confronta: function(ottenuto) {
      // Estrae i 4 numeri e verifica tolleranza 100 L
      var nums = (ottenuto.match(/\d+/g) || []).map(Number);
      if (nums.length < 2) return false;
      var validi = nums.filter(function(n) { return !isNaN(n); });
      if (validi.length < 2) return false;
      var min = Math.min.apply(null, validi);
      var max = Math.max.apply(null, validi);
      return (max - min) <= 100;
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
