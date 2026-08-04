// PhoenixFuel — Controllo scostamenti prezzo ordine / listino
// v20260803a
//
// LA REGOLA (03/08/2026)
// Se inseriamo un ordine, per forza abbiamo gia inserito il listino con
// cui lavorarlo. Quindi il costo dell'ordine deve corrispondere al
// listino di quel fornitore, quella base e quel prodotto.
//
// Ma uno scostamento NON e automaticamente un errore: il fornitore puo
// fare uno sconto o un aggravio su un singolo carico. E puo capitare
// l'opposto — il 28/07 il prezzo sbagliato era quello del LISTINO, non
// dell'ordine. Per questo il programma non corregge mai da solo: segnala
// e chiede, e la decisione resta di chi la prende, con nome e nota.
//
// Tre scelte per ogni riga:
//   ACCETTO   lo scostamento e voluto (sconto o aggravio concordato)
//   ALLINEO   l'ordine va portato al prezzo di listino
//   IGNORO    e il listino a essere sbagliato, lo correggo io
//
// Tolleranza mezzo decimillesimo: sotto quella soglia sono arrotondamenti.

var SCOST_TOLLERANZA = 0.0005;
var _scostRighe = [];
var _scostData = null;

function _scostIt(iso) { return iso ? iso.split('-').reverse().join('/') : '—'; }
function _scostNum(v, d) {
  if (v === null || v === undefined) return '—';
  return Number(v).toLocaleString('it-IT', { minimumFractionDigits: d === undefined ? 0 : d, maximumFractionDigits: d === undefined ? 0 : d });
}
function _scostIeri() {
  var d = new Date(); d.setDate(d.getDate() - 1);
  return d.toISOString().split('T')[0];
}

// ═══ IL CONTROLLO ══════════════════════════════════════════════════
// Confronta gli ordini di un giorno col listino. Il listino usato e
// l'ULTIMO fino a quel giorno: un ordine di lunedi con listino di
// venerdi va confrontato col venerdi, non scartato.
async function scostControlla(dataISO) {
  var data = dataISO || _scostIeri();
  var r = await Promise.all([
    sb.from('ordini')
      .select('id,data,fornitore,prodotto,litri,costo_litro,base_carico_id,stato,cliente,basi_carico(nome)')
      .eq('data', data).neq('stato', 'annullato'),
    sb.from('prezzi').select('data,fornitore,prodotto,base_carico_id,costo_litro')
      .lte('data', data).gte('data', _scostGiorniPrima(data, 30)).order('data'),
    sb.from('scostamenti_prezzo').select('*').eq('data_ordine', data)
  ]);
  if (r[0].error) throw r[0].error;

  // ultimo listino per fornitore|base|prodotto fino a quel giorno
  var listino = {};
  (r[1].data || []).forEach(function (p) {
    var k = (p.fornitore || '') + '|' + (p.base_carico_id || '') + '|' + (p.prodotto || '');
    if (!listino[k] || listino[k].data <= p.data) listino[k] = { costo: Number(p.costo_litro), data: p.data };
  });

  var giaDecisi = {};
  (r[2].data || []).forEach(function (s) {
    if (s.stato !== 'nuovo') giaDecisi[s.ordine_id] = true;
  });

  var trovati = [];
  (r[0].data || []).forEach(function (o) {
    if (String(o.fornitore || '').toLowerCase().indexOf('phoenix') >= 0) return;  // giro interno
    if (giaDecisi[o.id]) return;                                                   // gia deciso, non si ripropone
    var k = (o.fornitore || '') + '|' + (o.base_carico_id || '') + '|' + (o.prodotto || '');
    var l = listino[k];
    var base = (o.basi_carico && o.basi_carico.nome) ? o.basi_carico.nome : null;

    if (!l) {
      // "se inseriamo un ordine dobbiamo per forza aver inserito il listino":
      // se manca, e un'anomalia a sua volta e va segnalata, non saltata
      trovati.push({
        ordine_id: o.id, data_ordine: o.data, fornitore: o.fornitore, base: base,
        prodotto: o.prodotto, litri: Number(o.litri || 0),
        prezzo_ordine: Number(o.costo_litro || 0), prezzo_listino: null,
        listino_del: null, differenza: null, importo: null, stato: 'nuovo'
      });
      return;
    }
    var diff = Math.round((Number(o.costo_litro) - l.costo) * 1000000) / 1000000;
    if (Math.abs(diff) <= SCOST_TOLLERANZA) return;
    trovati.push({
      ordine_id: o.id, data_ordine: o.data, fornitore: o.fornitore, base: base,
      prodotto: o.prodotto, litri: Number(o.litri || 0),
      prezzo_ordine: Number(o.costo_litro || 0), prezzo_listino: l.costo,
      listino_del: l.data, differenza: diff,
      importo: Math.round(diff * Number(o.litri || 0) * 100) / 100, stato: 'nuovo'
    });
  });

  if (trovati.length) {
    var up = await sb.from('scostamenti_prezzo').upsert(trovati, { onConflict: 'ordine_id' });
    if (up.error) throw up.error;
  }
  return { data: data, trovati: trovati.length };
}

function _scostGiorniPrima(iso, n) {
  var d = new Date(iso + 'T12:00:00');
  d.setDate(d.getDate() - n);
  return d.toISOString().split('T')[0];
}

// ═══ AVVISO IN BACHECA ═════════════════════════════════════════════
// Lo mette solo se c'e qualcosa da decidere: un avviso che compare
// sempre smette di essere letto.
async function scostBanner() {
  var el = document.getElementById('scost-banner');
  if (!el) return;
  try {
    var r = await sb.from('scostamenti_prezzo').select('id,importo,data_ordine')
      .eq('stato', 'nuovo').order('data_ordine', { ascending: false });
    var righe = r.data || [];
    if (!righe.length) { el.innerHTML = ''; return; }
    var tot = righe.reduce(function (a, x) { return a + Math.abs(Number(x.importo || 0)); }, 0);
    el.innerHTML = '<div onclick="scostApri()" style="cursor:pointer;background:#FAEEDA;border:0.5px solid #E4C892;border-left:4px solid #BA7517;border-radius:10px;padding:12px 15px;margin-bottom:14px">'
      + '<div style="font-size:13px;font-weight:700;color:#854F0B">&#9888; ' + righe.length
      + (righe.length === 1 ? ' ordine ha' : ' ordini hanno') + ' un prezzo diverso dal listino</div>'
      + '<div style="font-size:12px;color:#854F0B;margin-top:3px">Effetto complessivo ' + _scostNum(tot, 2)
      + ' &euro; &middot; il piu recente del ' + _scostIt(righe[0].data_ordine) + ' &middot; <u>apri per decidere</u></div></div>';
  } catch (e) {
    el.innerHTML = '';
  }
}

// ═══ PANNELLO DECISIONI ════════════════════════════════════════════
async function scostApri() {
  var r = await sb.from('scostamenti_prezzo').select('*')
    .eq('stato', 'nuovo').order('data_ordine', { ascending: false });
  _scostRighe = r.data || [];
  if (!_scostRighe.length) { toast('Nessuno scostamento da decidere'); return; }
  _scostRender();
}

function _scostRender() {
  var h = '<div style="max-width:900px">';
  h += '<div style="font-size:16px;font-weight:600">Ordini con prezzo diverso dal listino</div>';
  h += '<div style="font-size:11.5px;color:var(--text-muted);margin-bottom:12px">'
     + 'Uno scostamento non e per forza un errore: il fornitore puo fare uno sconto su un carico, '
     + 'oppure puo essere sbagliato il listino. Decidi tu, la scelta resta registrata col tuo nome.</div>';

  h += '<div style="overflow-x:auto"><table style="width:100%;border-collapse:collapse;font-size:12.5px">';
  h += '<tr style="color:var(--text-muted);text-align:right">'
     + '<th style="text-align:left;padding:6px 8px;font-weight:500">Data</th>'
     + '<th style="text-align:left;padding:6px 8px;font-weight:500">Fornitore / base</th>'
     + '<th style="text-align:left;padding:6px 8px;font-weight:500">Prodotto</th>'
     + '<th style="padding:6px 8px;font-weight:500">Litri</th>'
     + '<th style="padding:6px 8px;font-weight:500">Ordine</th>'
     + '<th style="padding:6px 8px;font-weight:500">Listino</th>'
     + '<th style="padding:6px 8px;font-weight:500">Effetto</th>'
     + '<th style="padding:6px 8px;font-weight:500">Cosa fare</th></tr>';

  _scostRighe.forEach(function (s, i) {
    var senzaListino = (s.prezzo_listino === null || s.prezzo_listino === undefined);
    var col = senzaListino ? '#854F0B' : (Number(s.differenza) > 0 ? '#A32D2D' : '#27500A');
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right;vertical-align:top">'
      + '<td style="text-align:left;padding:8px">' + _scostIt(s.data_ordine) + '</td>'
      + '<td style="text-align:left;padding:8px">' + esc(s.fornitore || '')
        + '<div style="font-size:10.5px;color:var(--text-muted)">' + esc(s.base || '—') + '</div></td>'
      + '<td style="text-align:left;padding:8px">' + esc(s.prodotto || '') + '</td>'
      + '<td style="padding:8px;font-family:var(--font-mono)">' + _scostNum(s.litri) + '</td>'
      + '<td style="padding:8px;font-family:var(--font-mono)">' + Number(s.prezzo_ordine).toFixed(6) + '</td>'
      + '<td style="padding:8px;font-family:var(--font-mono)">'
        + (senzaListino ? '<span style="color:#854F0B">nessun listino</span>'
                        : Number(s.prezzo_listino).toFixed(6)
                          + '<div style="font-size:10px;color:var(--text-muted)">del ' + _scostIt(s.listino_del) + '</div>') + '</td>'
      + '<td style="padding:8px;font-family:var(--font-mono);font-weight:700;color:' + col + '">'
        + (senzaListino ? '&mdash;' : (Number(s.differenza) > 0 ? '+' : '') + Number(s.differenza).toFixed(6)
           + '<div style="font-size:11px">' + _scostNum(s.importo, 2) + ' &euro;</div>') + '</td>'
      + '<td style="padding:8px;text-align:left;white-space:nowrap">'
        + '<button onclick="_scostDecidi(' + i + ',\'accettato\')" title="Sconto o aggravio concordato: il prezzo dell\'ordine resta" style="font-size:11px;padding:4px 9px;margin:1px;border:0.5px solid #A9D18E;border-radius:6px;background:var(--bg);color:#27500A;cursor:pointer;font-weight:600">Accetto</button>'
        + (senzaListino ? '' : '<button onclick="_scostDecidi(' + i + ',\'corretto\')" title="Porta il costo dell\'ordine al prezzo di listino" style="font-size:11px;padding:4px 9px;margin:1px;border:0.5px solid #A9C9EC;border-radius:6px;background:var(--bg);color:#0C447C;cursor:pointer;font-weight:600">Allineo</button>')
        + '<button onclick="_scostDecidi(' + i + ',\'ignorato\')" title="E il listino a essere sbagliato: lo correggo io" style="font-size:11px;padding:4px 9px;margin:1px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text-muted);cursor:pointer">Ignoro</button>'
      + '</td></tr>';
  });
  h += '</table></div>';
  h += '<div style="display:flex;justify-content:flex-end;margin-top:14px">'
     + '<button onclick="chiudiModal()" style="padding:8px 14px;font-size:12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer">Chiudi</button></div>';
  h += '</div>';
  apriModal(h);
}

async function _scostDecidi(i, scelta) {
  var s = _scostRighe[i];
  if (!s) return;
  var testo = {
    accettato: 'Perche accetti questo prezzo? (es. sconto concordato sul carico)',
    corretto: 'Nota sulla correzione (il costo dell\'ordine verra portato a ' + Number(s.prezzo_listino).toFixed(6) + ')',
    ignorato: 'Perche lo ignori? (es. e il listino a essere sbagliato)'
  }[scelta];
  var nota = prompt(testo, '');
  if (nota === null) return;                       // annullato
  if (!nota.trim()) { toast('La nota e obbligatoria: serve a ricordare perche'); return; }

  var chi = (typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.nome)
    ? utenteCorrente.nome : 'sconosciuto';
  try {
    if (scelta === 'corretto') {
      var upo = await sb.from('ordini').update({ costo_litro: s.prezzo_listino }).eq('id', s.ordine_id);
      if (upo.error) throw upo.error;
    }
    var up = await sb.from('scostamenti_prezzo').update({
      stato: scelta, nota: nota.trim(), deciso_da: chi, deciso_il: new Date().toISOString()
    }).eq('id', s.id);
    if (up.error) throw up.error;

    if (typeof _auditLog === 'function') {
      _auditLog('scostamento_' + scelta, 'scostamenti_prezzo',
        s.fornitore + ' ' + _scostIt(s.data_ordine) + ' ordine ' + Number(s.prezzo_ordine).toFixed(6)
        + (s.prezzo_listino !== null ? ' contro listino ' + Number(s.prezzo_listino).toFixed(6) : ' senza listino')
        + ' — ' + nota.trim());
    }
    if (typeof pfDebitoInvalida === 'function' && scelta === 'corretto') pfDebitoInvalida();
    toast('\u2713 ' + (scelta === 'corretto' ? 'Ordine allineato al listino' : 'Decisione registrata'));
    _scostRighe.splice(i, 1);
    if (_scostRighe.length) _scostRender(); else { chiudiModal(); }
    scostBanner();
  } catch (e) {
    toast('Errore: ' + ((e && e.message) || e));
  }
}

// ═══ AVVIO ═════════════════════════════════════════════════════════
// Al caricamento controlla ieri e oggi, poi mostra l'avviso. Se
// qualcosa va storto resta in silenzio: e un controllo accessorio e non
// deve mai bloccare la bacheca.
async function scostAvvio() {
  try {
    var oggi = new Date().toISOString().split('T')[0];
    await scostControlla(_scostIeri());
    await scostControlla(oggi);
  } catch (e) {
    console.warn('[scostamenti] controllo saltato', e);
  }
  try { await scostBanner(); } catch (e) {}
}
