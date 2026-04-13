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
    nome: 'Eni 01/01-07/04/2026 (ordini + litri)',
    atteso: '191 ord / 1822981 L',
    query: async function() {
      var res = await sb.from('ordini')
        .select('litri')
        .eq('tipo_ordine', 'entrata_deposito')
        .ilike('fornitore', '%eni%')
        .in('stato', ['confermato', 'consegnato'])
        .gte('data', '2026-01-01').lte('data', '2026-04-07');
      if (res.error) throw res.error;
      var count = (res.data || []).length;
      var tot = (res.data || []).reduce(function(s, o) { return s + Number(o.litri || 0); }, 0);
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
    id: 'gasauto_rilevata_deposito_07_04',
    nome: 'Gas Auto deposito rilevata 07/04/2026 (fisica, costante)',
    atteso: '29134 L',
    query: async function() {
      var res = await sb.from('giacenze_giornaliere')
        .select('giacenza_rilevata')
        .eq('sede', 'deposito_vibo').eq('prodotto', 'Gasolio Autotrazione').eq('data', '2026-04-07').maybeSingle();
      if (res.error) throw res.error;
      return res.data && res.data.giacenza_rilevata !== null ? Math.round(res.data.giacenza_rilevata) + ' L' : 'NULL';
    },
    confronta: function(ottenuto) {
      return ottenuto.indexOf('29134') >= 0;
    }
  },
  {
    id: 'stazione_01_01_uscite',
    nome: 'Stazione Oppido 01/01/2026 — uscite pompe',
    atteso: 'Gas 704 L / Benz 374 L',
    query: async function() {
      var { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva', true);
      var res = await sb.from('stazione_letture').select('pompa_id,data,lettura')
        .gte('data', '2025-12-31').lte('data', '2026-01-01');
      if (res.error) throw res.error;
      var byPompa = {};
      (res.data || []).forEach(function(l) {
        if (!byPompa[l.pompa_id]) byPompa[l.pompa_id] = {};
        byPompa[l.pompa_id][l.data] = Number(l.lettura);
      });
      var gas = 0, benz = 0;
      (pompe || []).forEach(function(p) {
        var m = byPompa[p.id];
        if (!m || m['2025-12-31'] === undefined || m['2026-01-01'] === undefined) return;
        var d = m['2026-01-01'] - m['2025-12-31'];
        if (d <= 0) return;
        if (p.prodotto === 'Gasolio Autotrazione') gas += d;
        else if (p.prodotto === 'Benzina') benz += d;
      });
      return 'Gas ' + Math.round(gas) + ' L / Benz ' + Math.round(benz) + ' L';
    },
    confronta: function(ottenuto) {
      return ottenuto.indexOf('704') >= 0 && ottenuto.indexOf('374') >= 0;
    }
  }
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
