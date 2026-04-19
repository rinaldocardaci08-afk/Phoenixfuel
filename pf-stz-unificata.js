// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Tab unificata Letture & Marginalità stazione
// Versione 1: READ-ONLY (verifica coerenza numeri con tab vecchie)
// NON modifica né salva nulla. Riusa dati e stili delle tab originali.
// ═══════════════════════════════════════════════════════════════════

var _uniData = null; // cache dati globale per questa tab

async function caricaUnificata() {
  var el = document.getElementById('uni-pompe');
  if (!el) return;
  el.innerHTML = '<div class="loading" style="padding:24px">Caricamento dati...</div>';

  var limDate = new Date(); limDate.setDate(limDate.getDate() - 90);
  var limISO = limDate.toISOString().split('T')[0];

  var [lettRes, pompeRes, prezziRes, costiRes, cisRes, cmpRes] = await Promise.all([
    sb.from('stazione_letture').select('*').gte('data', limISO).order('data', { ascending: false }),
    sb.from('stazione_pompe').select('*').eq('attiva', true).order('ordine'),
    sb.from('stazione_prezzi').select('*').gte('data', limISO).order('data', { ascending: false }),
    sb.from('stazione_costi').select('*').gte('data', limISO).order('data', { ascending: false }),
    sb.from('cisterne').select('prodotto,livello_attuale,costo_medio').eq('sede', 'stazione_oppido'),
    sb.from('stazione_cmp_storico').select('*').eq('sede', 'stazione_oppido').order('created_at', { ascending: false }).limit(20)
  ]);

  var letture = lettRes.data || [];
  var pompe = pompeRes.data || [];
  var prezzi = prezziRes.data || [];
  var costi = costiRes.data || [];
  var cisterne = cisRes.data || [];

  if (!pompe.length) { el.innerHTML = '<div class="loading">Nessuna pompa configurata</div>'; return; }

  var _oggiISO = new Date().toISOString().split('T')[0];
  var _dateSet = new Set(letture.map(function(l) { return l.data; }));
  _dateSet.add(_oggiISO);
  var dateUniche = Array.from(_dateSet).sort().reverse();

  var pompeMap = {};
  pompe.forEach(function(p) { pompeMap[p.id] = p; });

  var prezziMap = {};
  prezzi.forEach(function(p) { prezziMap[p.data + '_' + p.prodotto] = p.prezzo_litro; });

  var costiMap = {};
  costi.forEach(function(c) { costiMap[c.data + '_' + c.prodotto] = Number(c.costo_litro); });

  var costiMapCP = {};
  costi.forEach(function(c) { if (c.costo_litro_cp) costiMapCP[c.data + '_' + c.prodotto] = Number(c.costo_litro_cp); });

  var lettureByData = {};
  letture.forEach(function(l) {
    if (!lettureByData[l.data]) lettureByData[l.data] = [];
    lettureByData[l.data].push(l);
  });

  var lettureByPompa = {};
  letture.forEach(function(l) {
    if (!lettureByPompa[l.pompa_id]) lettureByPompa[l.pompa_id] = [];
    lettureByPompa[l.pompa_id].push(l);
  });

  // Determina "primo giorno da compilare": la prima data senza letture complete,
  // partendo dall'ultima data salvata + 1 giorno (o oggi se non ci sono letture).
  // Una lettura e' "completa" per una data se ha un record per TUTTE le pompe attive.
  var dateSalvate = letture.map(function(l){ return l.data; });
  var dateSalvateSet = {};
  dateSalvate.forEach(function(d){
    if (!dateSalvateSet[d]) dateSalvateSet[d] = new Set();
    lettureByData[d] && lettureByData[d].forEach(function(l){ dateSalvateSet[d].add(l.pompa_id); });
  });
  var nPompe = pompe.length;
  // La piu' recente data con lettura completa
  var ultimaDataCompleta = null;
  Object.keys(dateSalvateSet).sort().reverse().forEach(function(d){
    if (ultimaDataCompleta) return;
    if (dateSalvateSet[d].size >= nPompe) ultimaDataCompleta = d;
  });
  // Primo giorno da compilare = giorno successivo all'ultima completa, oppure oggi
  var primoGiornoDaCompilare;
  if (ultimaDataCompleta) {
    var next = new Date(ultimaDataCompleta + 'T12:00:00');
    next.setDate(next.getDate() + 1);
    primoGiornoDaCompilare = next.toISOString().split('T')[0];
  } else {
    primoGiornoDaCompilare = _oggiISO;
  }
  // Aggiungi il primo giorno da compilare al set dateUniche se non presente
  if (dateUniche.indexOf(primoGiornoDaCompilare) < 0) {
    dateUniche.push(primoGiornoDaCompilare);
    dateUniche.sort().reverse();
  }

  // CMP corrente per prodotto (media ponderata cisterne)
  var cmpCorrente = {};
  var cmpPerProdotto = {};
  cisterne.forEach(function(c) {
    var p = c.prodotto;
    if (!cmpPerProdotto[p]) cmpPerProdotto[p] = { litri: 0, valore: 0 };
    var liv = Number(c.livello_attuale || 0);
    var cm = Number(c.costo_medio || 0);
    cmpPerProdotto[p].litri += liv;
    cmpPerProdotto[p].valore += liv * cm;
  });
  Object.keys(cmpPerProdotto).forEach(function(p) {
    var v = cmpPerProdotto[p];
    cmpCorrente[p] = v.litri > 0 ? Math.round((v.valore / v.litri) * 1000000) / 1000000 : 0;
  });

  // Posiziona l'indice sul primo giorno da compilare (cosi' si apre subito li')
  var idxIniziale = dateUniche.indexOf(primoGiornoDaCompilare);
  if (idxIniziale < 0) idxIniziale = 0;

  _uniData = {
    dateUniche: dateUniche,
    pompeMap: pompeMap,
    pompe: pompe,
    prezziMap: prezziMap,
    costiMap: costiMap,
    costiMapCP: costiMapCP,
    lettureByData: lettureByData,
    lettureByPompa: lettureByPompa,
    cmpCorrente: cmpCorrente,
    indice: idxIniziale,
    vista: 'pompa', // 'pompa' o 'prodotto'
    primoGiornoDaCompilare: primoGiornoDaCompilare,
    dirty: false // true se l'operatore ha modificato qualcosa senza salvare
  };

  _uniRenderGiorno(idxIniziale);
  _uniRenderStoricoMarg();
  _uniRenderStoricoLett(idxIniziale);
  _uniRenderStoricoCMP();
}

// ── Navigazione ◀ ▶ + input data ──
function _uniGiorno(dir) {
  if (!_uniData) return;
  var nuovoIdx = _uniData.indice + dir;
  if (nuovoIdx < 0 || nuovoIdx >= _uniData.dateUniche.length) return;

  // Warning se ci sono modifiche non salvate
  if (_uniData.dirty) {
    if (!confirm('Hai modifiche non salvate. Vuoi perderle?')) return;
    _uniData.dirty = false;
  }

  // Blocco navigazione "avanti": se siamo sul giorno corrente da compilare e vuoi andare
  // a un giorno successivo (dir = -1 perche' dateUniche e' DESC), blocca se non hai salvato
  // quel giorno oppure se vorresti saltare un giorno mancante.
  if (dir === -1) {
    var dataCorrente = _uniData.dateUniche[_uniData.indice];
    // Se la data corrente e' il primo giorno da compilare e non ci sono ancora letture,
    // non si puo' andare avanti
    var letteCorrente = (_uniData.lettureByData[dataCorrente] || []).length;
    if (dataCorrente === _uniData.primoGiornoDaCompilare && letteCorrente < _uniData.pompe.length) {
      toast('Salva prima le letture del ' + dataCorrente);
      return;
    }
  }

  _uniRenderGiorno(nuovoIdx);
}

function _uniVaiAlGiorno() {
  if (!_uniData) return;
  var val = document.getElementById('uni-data-input').value;
  if (!val) return;

  // Warning se ci sono modifiche non salvate
  if (_uniData.dirty) {
    if (!confirm('Hai modifiche non salvate. Vuoi perderle?')) {
      document.getElementById('uni-data-input').value = _uniData.dateUniche[_uniData.indice];
      return;
    }
    _uniData.dirty = false;
  }

  var idx = _uniData.dateUniche.indexOf(val);
  if (idx >= 0) {
    _uniRenderGiorno(idx);
  } else {
    // Trova il giorno più vicino
    for (var i = 0; i < _uniData.dateUniche.length; i++) {
      if (_uniData.dateUniche[i] <= val) { _uniRenderGiorno(i); return; }
    }
  }
}

function _uniToggleVista() {
  if (!_uniData) return;
  _uniData.vista = _uniData.vista === 'pompa' ? 'prodotto' : 'pompa';
  _uniRenderGiorno(_uniData.indice);
}

// ── RENDER PRINCIPALE ──
function _uniRenderGiorno(idx) {
  var m = _uniData;
  if (!m) return;
  m.indice = idx;
  var data = m.dateUniche[idx];
  if (!data) return;

  // Aggiorna input data
  var inpData = document.getElementById('uni-data-input');
  if (inpData) inpData.value = data;

  // Label data
  var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  var elLabel = document.getElementById('uni-data-label');
  if (elLabel) elLabel.textContent = dataFmt;

  // Badge OGGI/IERI
  var elBadge = document.getElementById('uni-data-badge');
  var elDay = document.getElementById('uni-data-day');
  if (elBadge) {
    var oggi = new Date(); oggi.setHours(0, 0, 0, 0);
    var sel = new Date(data + 'T12:00:00'); sel.setHours(0, 0, 0, 0);
    var diff = Math.round((sel - oggi) / 86400000);
    if (diff === 0) { elBadge.textContent = 'OGGI'; elBadge.style.background = '#D85A30'; elBadge.style.color = '#fff'; elBadge.style.display = 'inline-block'; }
    else if (diff === -1) { elBadge.textContent = 'IERI'; elBadge.style.background = '#BA7517'; elBadge.style.color = '#fff'; elBadge.style.display = 'inline-block'; }
    else { elBadge.style.display = 'none'; }
  }
  if (elDay) {
    var selD = new Date(data + 'T12:00:00');
    var GIORNI = ['Domenica', 'Lunedì', 'Martedì', 'Mercoledì', 'Giovedì', 'Venerdì', 'Sabato'];
    var dayColors = { 0: ['#FCEBEB', '#791F1F'], 1: ['#E6F1FB', '#0C447C'], 2: ['#E6F1FB', '#0C447C'], 3: ['#E6F1FB', '#0C447C'], 4: ['#E6F1FB', '#0C447C'], 5: ['#E6F1FB', '#0C447C'], 6: ['#EEEDFE', '#3C3489'] };
    var dc = dayColors[selD.getDay()];
    elDay.textContent = GIORNI[selD.getDay()];
    elDay.style.background = dc[0]; elDay.style.color = dc[1]; elDay.style.display = 'inline-block';
  }

  // Toggle vista label
  var btnVista = document.getElementById('uni-btn-vista');
  if (btnVista) btnVista.textContent = m.vista === 'pompa' ? '📊 Per prodotto' : '⛽ Per pompa';

  if (m.vista === 'prodotto') {
    _uniRenderPerProdotto(data);
  } else {
    _uniRenderPerPompa(data);
  }
}

// ── RENDER PER POMPA ──
function _uniRenderPerPompa(data) {
  var m = _uniData;
  var lettureGiorno = (m.lettureByData[data] || []).slice().sort(function(a, b) {
    return ((m.pompeMap[a.pompa_id] || {}).ordine || 99) - ((m.pompeMap[b.pompa_id] || {}).ordine || 99);
  });

  var el = document.getElementById('uni-pompe');
  var html = '';
  var totGasolio = { litri: 0, euro: 0, marg: 0 };
  var totBenzina = { litri: 0, euro: 0, marg: 0 };

  // Determina lo STATO della giornata:
  // - 'editabile'       : data == primoGiornoDaCompilare e nessuna lettura completa
  // - 'storico'         : data ha letture (tutte o parziali) - mostra i dati, editabili
  // - 'bloccato'        : data e' FUTURA (dopo primoGiornoDaCompilare) e senza letture
  var statoGiorno;
  var numLetture = lettureGiorno.length;
  var nPompeTot = m.pompe.length;
  if (numLetture > 0) {
    statoGiorno = 'storico'; // esiste almeno una lettura => si vede come storico
  } else if (data === m.primoGiornoDaCompilare) {
    statoGiorno = 'editabile'; // e' oggi/primo giorno da riempire
  } else if (data > m.primoGiornoDaCompilare) {
    statoGiorno = 'bloccato'; // giorno futuro non compilabile
  } else {
    statoGiorno = 'storico'; // passato vuoto (strano, ma non editabile)
  }

  // Caso BLOCCATO: giorni futuri senza letture, mostra messaggio e pompe VUOTE non editabili
  if (statoGiorno === 'bloccato') {
    html += '<div style="background:#FAEEDA;border-left:4px solid #BA7517;border-radius:8px;padding:12px 16px;margin-bottom:14px;color:#633806">';
    html += '<strong>Giorno non ancora compilabile</strong><br>';
    html += '<span style="font-size:12px">Prima compila le letture del <strong>' + m.primoGiornoDaCompilare + '</strong>. Non puoi saltare giorni.</span>';
    html += '</div>';
    m.pompe.forEach(function(pompa) {
      var _pi = cacheProdotti.find(function(pp) { return pp.nome === pompa.prodotto; });
      var colore = _pi ? _pi.colore : '#888';
      html += _uniCardPompaVuota(pompa, colore);
    });
    el.innerHTML = html;
    _uniRenderPanel(totGasolio, totBenzina);
    return;
  }

  // Caso EDITABILE: giorno da compilare, input attivi per TUTTE le pompe
  if (statoGiorno === 'editabile') {
    html += '<div style="background:#E6F1FB;border-left:4px solid #378ADD;border-radius:8px;padding:12px 16px;margin-bottom:14px;color:#0C447C">';
    html += '<strong>Inserisci i contatori di oggi</strong><br>';
    html += '<span style="font-size:12px">Scrivi il valore attuale del totalizzatore di ciascuna pompa. I litri erogati verranno calcolati come differenza rispetto al giorno precedente.</span>';
    html += '</div>';

    m.pompe.forEach(function(pompa) {
      var _pi = cacheProdotti.find(function(pp) { return pp.nome === pompa.prodotto; });
      var colore = _pi ? _pi.colore : '#888';

      // Lettura precedente (piu' recente con data < data corrente)
      var storPompa = (m.lettureByPompa[pompa.id] || []).slice().sort(function(a, b) { return b.data.localeCompare(a.data); });
      var prec = null;
      for (var k = 0; k < storPompa.length; k++) {
        if (storPompa[k].data < data) { prec = storPompa[k]; break; }
      }
      var precRaw = prec ? String(Math.round(Number(prec.lettura))) : '—';

      html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px">';
      html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:16px">' + esc(pompa.nome) + '</strong><span style="font-size:13px;color:var(--text-muted);margin-left:auto">' + esc(pompa.prodotto) + '</span></div>';
      html += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
      // Giorno prec. (sola lettura)
      html += '<div style="flex:1;min-width:160px"><div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Giorno prec.</div>';
      html += '<div style="background:#1a1a1a;border-radius:8px;padding:8px 12px;display:inline-flex;align-items:center;gap:1px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)"><span style="font-family:\'Courier New\',monospace;font-size:20px;font-weight:700;color:#f0f0f0;letter-spacing:3px">' + precRaw + '</span></div></div>';
      // Oggi (INPUT EDITABILE)
      html += '<div style="flex:1;min-width:160px"><div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Oggi</div>';
      html += '<input type="number" step="1" class="uni-lettura-input" data-pompa="' + pompa.id + '" data-prodotto="' + esc(pompa.prodotto) + '" data-prec="' + (prec ? prec.lettura : 0) + '" oninput="_uniMarkDirty()" placeholder="0" style="background:#1a1a1a;border:0.5px solid #2a2a2a;border-radius:8px;padding:10px 12px;font-family:\'Courier New\',monospace;font-size:20px;font-weight:700;color:#7CFC00;letter-spacing:3px;width:200px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4);outline:none" />';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    });

    // Bottone salva sticky
    html += '<div id="uni-salva-wrap" style="position:sticky;bottom:10px;background:var(--bg-card);padding:12px;border-radius:10px;border:0.5px solid var(--border);box-shadow:0 4px 12px rgba(0,0,0,0.1);margin-top:14px">';
    html += '<button id="uni-btn-salva" class="btn-primary" onclick="_uniSalvaLetture()" style="width:100%;padding:14px;font-size:15px;font-weight:600">💾 Salva letture ' + data + '</button>';
    html += '</div>';

    el.innerHTML = html;
    _uniRenderPanel(totGasolio, totBenzina);
    return;
  }

  // Caso STORICO: giorno con letture gia' salvate, mostra dati (solo lettura)
  // Se non ci sono letture (ad es. giorno mancante in passato), mostra pompe vuote
  if (!lettureGiorno.length) {
    m.pompe.forEach(function(pompa) {
      var _pi = cacheProdotti.find(function(pp) { return pp.nome === pompa.prodotto; });
      var colore = _pi ? _pi.colore : '#888';
      html += _uniCardPompaVuota(pompa, colore);
    });
    el.innerHTML = html;
    _uniRenderPanel(totGasolio, totBenzina);
    return;
  }

  lettureGiorno.forEach(function(l) {
    var pompa = m.pompeMap[l.pompa_id];
    if (!pompa) return;
    var _pi = cacheProdotti.find(function(pp) { return pp.nome === pompa.prodotto; });
    var colore = _pi ? _pi.colore : '#888';

    // Lettura precedente
    var storPompa = (m.lettureByPompa[l.pompa_id] || []).slice().sort(function(a, b) { return b.data.localeCompare(a.data); });
    var myIdx = storPompa.findIndex(function(x) { return x.id === l.id; });
    var prec = myIdx < storPompa.length - 1 ? storPompa[myIdx + 1] : null;
    var litriTot = prec ? Number(l.lettura) - Number(prec.lettura) : 0;
    if (litriTot < 0) litriTot = 0;
    var precRaw = prec ? String(Math.round(Number(prec.lettura))) : '—';
    var oggiRaw = String(Math.round(Number(l.lettura)));

    var prezzo = Number(m.prezziMap[data + '_' + pompa.prodotto] || 0);
    var litriPD = Number(l.litri_prezzo_diverso || 0);
    var prezzoPD = Number(l.prezzo_diverso || 0);
    var hasCambio = litriPD > 0 && prezzoPD > 0;
    var litriStd = hasCambio ? Math.max(0, litriTot - litriPD) : litriTot;

    // Costo
    var costoSaved = m.costiMap[data + '_' + pompa.prodotto] || '';
    var costoProposto = costoSaved;
    var isCMP = false;
    if (!costoProposto && m.cmpCorrente && m.cmpCorrente[pompa.prodotto]) {
      costoProposto = m.cmpCorrente[pompa.prodotto];
      isCMP = true;
    }
    var costoN = Number(costoProposto || 0);
    var prezzoN = prezzo ? (prezzo / 1.22) : 0;
    var margL = prezzoN > 0 && costoN > 0 ? prezzoN - costoN : 0;
    var margTot = margL * litriStd;
    var mColor = margL >= 0 ? '#639922' : '#E24B4A';
    var cmpBadge = isCMP ? ' <span style="font-size:8px;background:#378ADD;color:#fff;padding:1px 4px;border-radius:3px">CMP</span>' : '';

    // Accumula totali per pannello
    var isGasolio = pompa.prodotto.toLowerCase().indexOf('gasolio') >= 0;
    if (costoN > 0 && litriStd > 0) {
      if (isGasolio) { totGasolio.litri += litriStd; totGasolio.euro += litriStd * prezzoN; totGasolio.marg += margTot; }
      else { totBenzina.litri += litriStd; totBenzina.euro += litriStd * prezzoN; totBenzina.marg += margTot; }
    }

    // ─── Card pompa ───
    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px">';
    // Header
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:16px">' + esc(pompa.nome) + '</strong><span style="font-size:13px;color:var(--text-muted);margin-left:auto">' + esc(pompa.prodotto) + '</span></div>';

    // ── Contatori meccanici ──
    html += '<div style="display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap">';
    // Giorno prec.
    html += '<div style="flex:1;min-width:160px"><div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Giorno prec.</div>';
    html += '<div style="background:#1a1a1a;border-radius:8px;padding:8px 12px;display:inline-flex;align-items:center;gap:1px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)"><span style="font-family:\'Courier New\',monospace;font-size:20px;font-weight:700;color:#f0f0f0;letter-spacing:3px">' + precRaw + '</span></div></div>';
    // Oggi
    html += '<div style="flex:1;min-width:160px"><div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Oggi</div>';
    html += '<div style="background:#1a1a1a;border-radius:8px;padding:8px 12px;display:inline-flex;align-items:center;gap:1px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)"><span style="font-family:\'Courier New\',monospace;font-size:20px;font-weight:700;color:#7CFC00;letter-spacing:3px">' + oggiRaw + '</span></div></div>';
    html += '</div>';

    // Risultato litri venduti
    html += '<div style="font-size:13px;margin-bottom:10px;font-family:var(--font-mono)">Litri totali: <strong>' + fmtL(litriTot) + '</strong>   Venduto: <strong style="color:#639922">' + fmtE(litriTot * prezzo) + '</strong></div>';

    // ── Riga Prezzo / Costo / Margine ──
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:start;padding:8px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:6px">';
    // Col 1: Prezzo vendita
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Prezzo vendita</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:600">' + (prezzo ? '€ ' + prezzo.toFixed(3) + ' <span style="font-size:10px;color:var(--text-muted)">IVA</span>' : '<span style="color:#E24B4A">—</span>') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">' + (prezzoN ? '€ ' + prezzoN.toFixed(4) + ' netto' : '') + '</div></div>';
    // Col 2: Costo
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Costo €/L' + cmpBadge + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:600">' + (costoN ? costoN.toFixed(4) + ' <span style="font-size:10px;color:var(--text-muted)">netto</span>' : '<span style="color:#E24B4A">—</span>') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">' + (costoN ? '€ ' + (costoN * 1.22).toFixed(3) + ' IVA' : '') + '</div></div>';
    // Col 3: Margine
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Margine €/L</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + mColor + '">' + (costoN > 0 ? '€ ' + margL.toFixed(4) + ' <span style="font-size:10px;font-weight:400;color:var(--text-muted)">netto</span>' : '—') + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-top:4px">Margine tot</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + mColor + '">' + (costoN > 0 ? fmtE(margTot) + ' <span style="font-size:10px;font-weight:400;color:var(--text-muted)">netto</span>' : '—') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted)">' + (costoN > 0 ? fmtE(margTot * 1.22) + ' IVA' : '') + '</div></div>';
    html += '</div>';

    // ── Cambio prezzo (se presente) ──
    if (hasCambio) {
      var costoSavedCP = (m.costiMapCP && m.costiMapCP[data + '_' + pompa.prodotto]) || '';
      var costoPropostoCP = costoSavedCP || costoProposto;
      var costoCP = Number(costoPropostoCP || 0);
      var prezzoPDN = prezzoPD ? (prezzoPD / 1.22) : 0;
      var margLCP = prezzoPDN > 0 && costoCP > 0 ? prezzoPDN - costoCP : 0;
      var margTotCP = margLCP * litriPD;
      var mColorCP = margLCP >= 0 ? '#639922' : '#E24B4A';

      // Accumula totali cambio prezzo
      if (costoCP > 0 && litriPD > 0) {
        if (isGasolio) { totGasolio.litri += litriPD; totGasolio.euro += litriPD * prezzoPDN; totGasolio.marg += margTotCP; }
        else { totBenzina.litri += litriPD; totBenzina.euro += litriPD * prezzoPDN; totBenzina.marg += margTotCP; }
      }

      html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-left:3px solid #BA7517;border-radius:8px;padding:10px 12px;margin-bottom:6px">';
      html += '<div style="font-size:12px;font-weight:600;color:#633806;margin-bottom:8px">⚡ Cambio prezzo</div>';

      // Tabella 3 righe: Prima / Dopo / Totale
      html += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
      html += '<thead><tr style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px"><th style="text-align:left;padding:4px 6px">Fascia</th><th style="text-align:right;padding:4px 6px">Litri</th><th style="text-align:right;padding:4px 6px">Prezzo €/L</th><th style="text-align:right;padding:4px 6px">Costo €/L</th><th style="text-align:right;padding:4px 6px">Margine €/L</th><th style="text-align:right;padding:4px 6px">€ incasso</th><th style="text-align:right;padding:4px 6px">€ margine</th></tr></thead><tbody>';

      // Riga "Prima del cambio"
      html += '<tr style="border-top:0.5px solid var(--border)">';
      html += '<td style="padding:6px;font-weight:500;color:#633806">Prima</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + fmtL(litriPD) + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + prezzoPD.toFixed(3) + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + (costoCP > 0 ? costoCP.toFixed(4) : '—') + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:' + mColorCP + '">' + (costoCP > 0 ? '€ ' + margLCP.toFixed(4) : '—') + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + fmtE(litriPD * prezzoPD) + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:' + mColorCP + '">' + (costoCP > 0 ? fmtE(margTotCP) : '—') + '</td>';
      html += '</tr>';

      // Riga "Dopo il cambio"
      html += '<tr style="border-top:0.5px solid var(--border)">';
      html += '<td style="padding:6px;font-weight:500;color:#633806">Dopo</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + fmtL(litriStd) + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + prezzo.toFixed(3) + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + (costoN > 0 ? costoN.toFixed(4) : '—') + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:' + mColor + '">' + (costoN > 0 ? '€ ' + margL.toFixed(4) : '—') + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + fmtE(litriStd * prezzo) + '</td>';
      html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:' + mColor + '">' + (costoN > 0 ? fmtE(margTot) : '—') + '</td>';
      html += '</tr>';

      // Riga totale verde
      var totLitriP = litriPD + litriStd;
      var totIncassoP = litriPD * prezzoPD + litriStd * prezzo;
      var totMargP = margTotCP + margTot;
      var prezzoMedioP = totLitriP > 0 ? (totIncassoP / totLitriP) : 0;
      var margMedioP = totLitriP > 0 ? (totMargP / totLitriP) : 0;
      html += '<tr style="background:#EAF3DE;border-top:1px solid #97C459">';
      html += '<td style="padding:8px 6px;font-weight:600;color:#27500A">Totale pompa</td>';
      html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">' + fmtL(totLitriP) + '</td>';
      html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);font-size:10px;color:#27500A">med. ' + prezzoMedioP.toFixed(3) + '</td>';
      html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);font-size:10px;color:#27500A">' + (costoN > 0 ? costoN.toFixed(4) : '—') + '</td>';
      html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">' + (costoN > 0 ? '€ ' + margMedioP.toFixed(4) : '—') + '</td>';
      html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">' + fmtE(totIncassoP) + '</td>';
      html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);font-weight:600;color:#27500A">' + (costoN > 0 ? fmtE(totMargP) : '—') + '</td>';
      html += '</tr>';

      html += '</tbody></table></div>';
    }

    html += '</div>'; // chiudi card pompa
  });

  el.innerHTML = html;
  _uniRenderPanel(totGasolio, totBenzina);
}

// ── Card pompa vuota (giorno senza letture) ──
function _uniCardPompaVuota(pompa, colore) {
  var h = '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px;opacity:0.5">';
  h += '<div style="display:flex;align-items:center;gap:6px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:16px">' + esc(pompa.nome) + '</strong><span style="font-size:13px;color:var(--text-muted);margin-left:auto">' + esc(pompa.prodotto) + ' — nessuna lettura</span></div>';
  h += '</div>';
  return h;
}

// ── RENDER PER PRODOTTO ──
function _uniRenderPerProdotto(data) {
  var m = _uniData;
  var lettureGiorno = (m.lettureByData[data] || []).slice().sort(function(a, b) {
    return ((m.pompeMap[a.pompa_id] || {}).ordine || 99) - ((m.pompeMap[b.pompa_id] || {}).ordine || 99);
  });

  // Raggruppa per prodotto
  var perProdotto = {};
  lettureGiorno.forEach(function(l) {
    var pompa = m.pompeMap[l.pompa_id];
    if (!pompa) return;
    var prod = pompa.prodotto;
    if (!perProdotto[prod]) perProdotto[prod] = [];
    perProdotto[prod].push(l);
  });

  var el = document.getElementById('uni-pompe');
  var html = '';
  var totGasolio = { litri: 0, euro: 0, marg: 0 };
  var totBenzina = { litri: 0, euro: 0, marg: 0 };

  var ordine = ['Gasolio Autotrazione', 'Benzina', 'Gasolio Agricolo'];
  ordine.forEach(function(prod) {
    var gruppo = perProdotto[prod];
    if (!gruppo || !gruppo.length) return;
    var _pi = cacheProdotti.find(function(pp) { return pp.nome === prod; });
    var colore = _pi ? _pi.colore : '#888';
    var prezzo = Number(m.prezziMap[data + '_' + prod] || 0);
    var prezzoN = prezzo ? (prezzo / 1.22) : 0;
    var costoSaved = m.costiMap[data + '_' + prod] || '';
    var costoProposto = costoSaved;
    var isCMP = false;
    if (!costoProposto && m.cmpCorrente && m.cmpCorrente[prod]) {
      costoProposto = m.cmpCorrente[prod];
      isCMP = true;
    }
    var costoN = Number(costoProposto || 0);
    var cmpBadge = isCMP ? ' <span style="font-size:8px;background:#378ADD;color:#fff;padding:1px 4px;border-radius:3px">CMP</span>' : '';

    var totLitriProd = 0;
    var totEuroProd = 0;
    var dettaglioHtml = '';

    gruppo.forEach(function(l) {
      var pompa = m.pompeMap[l.pompa_id];
      var storPompa = (m.lettureByPompa[l.pompa_id] || []).slice().sort(function(a, b) { return b.data.localeCompare(a.data); });
      var myIdx = storPompa.findIndex(function(x) { return x.id === l.id; });
      var prec = myIdx < storPompa.length - 1 ? storPompa[myIdx + 1] : null;
      var litri = prec ? Number(l.lettura) - Number(prec.lettura) : 0;
      if (litri < 0) litri = 0;
      totLitriProd += litri;
      totEuroProd += litri * prezzo;

      dettaglioHtml += '<div style="display:flex;justify-content:space-between;padding:4px 0;border-bottom:0.5px solid var(--border)">';
      dettaglioHtml += '<span style="color:var(--text-muted)">' + esc(pompa.nome) + '</span>';
      dettaglioHtml += '<span style="font-family:var(--font-mono);font-weight:600">' + fmtL(litri) + '</span>';
      dettaglioHtml += '</div>';
    });

    var margL = prezzoN > 0 && costoN > 0 ? prezzoN - costoN : 0;
    var margTotProd = margL * totLitriProd;
    var mColor = margL >= 0 ? '#639922' : '#E24B4A';
    var isGasolio = prod.toLowerCase().indexOf('gasolio') >= 0;

    if (costoN > 0 && totLitriProd > 0) {
      if (isGasolio) { totGasolio.litri += totLitriProd; totGasolio.euro += totLitriProd * prezzoN; totGasolio.marg += margTotProd; }
      else { totBenzina.litri += totLitriProd; totBenzina.euro += totLitriProd * prezzoN; totBenzina.marg += margTotProd; }
    }

    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:16px">' + esc(prod) + '</strong><span style="font-size:13px;color:var(--text-muted);margin-left:auto">' + gruppo.length + ' pompe — ' + fmtL(totLitriProd) + ' L totali</span></div>';

    // Dettaglio pompe
    html += '<div style="margin-bottom:10px;font-size:13px">' + dettaglioHtml + '</div>';

    // Riga Prezzo / Costo / Margine
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:start;padding:8px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border)">';
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Prezzo vendita</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:600">' + (prezzo ? '€ ' + prezzo.toFixed(3) + ' IVA' : '—') + '</div></div>';
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Costo €/L' + cmpBadge + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:600">' + (costoN ? costoN.toFixed(4) + ' netto' : '—') + '</div></div>';
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Margine €/L</div>';
    html += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + mColor + '">' + (costoN > 0 ? '€ ' + margL.toFixed(4) : '—') + '</div>';
    html += '<div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + ';margin-top:4px">Tot: ' + (costoN > 0 ? fmtE(margTotProd) : '—') + '</div></div>';
    html += '</div>';

    html += '</div>';
  });

  el.innerHTML = html;
  _uniRenderPanel(totGasolio, totBenzina);
}

// ── PANNELLO SCURO MARGINALITÀ LIVE ──
function _uniRenderPanel(totGasolio, totBenzina) {
  var el = document.getElementById('uni-panel');
  if (!el) return;

  var totLitri = totGasolio.litri + totBenzina.litri;
  var totEuro = totGasolio.euro + totBenzina.euro;
  var totMarg = totGasolio.marg + totBenzina.marg;
  var margMedio = totLitri > 0 ? totMarg / totLitri : 0;

  function fmtN(v) { return '€ ' + v.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

  el.innerHTML =
    '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.5);margin-bottom:14px;font-weight:600">Marginalità live</div>' +
    // Gasolio
    '<div style="margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#BA7517"></div><span style="font-size:11px;font-weight:600;color:#fff">GASOLIO</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#fff">' + totGasolio.litri.toLocaleString('it-IT', { maximumFractionDigits: 0 }) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#7CFC00">' + fmtN(totGasolio.euro) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Venduto IVA</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.4)">' + fmtN(totGasolio.euro * 1.22) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:800;color:' + (totGasolio.marg >= 0 ? '#7CFC00' : '#FF6B6B') + '">' + fmtN(totGasolio.marg) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Margine IVA</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.4)">' + fmtN(totGasolio.marg * 1.22) + '</span></div>' +
    '</div>' +
    // Benzina
    '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><span style="font-size:11px;font-weight:600;color:#87CEFA">BENZINA</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#87CEFA">' + totBenzina.litri.toLocaleString('it-IT', { maximumFractionDigits: 0 }) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:700;color:#7CFC00">' + fmtN(totBenzina.euro) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Venduto IVA</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.4)">' + fmtN(totBenzina.euro * 1.22) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:800;color:' + (totBenzina.marg >= 0 ? '#7CFC00' : '#FF6B6B') + '">' + fmtN(totBenzina.marg) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Margine IVA</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.4)">' + fmtN(totBenzina.marg * 1.22) + '</span></div>' +
    '</div>' +
    // Totale
    '<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">' +
      '<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:6px">TOTALE GIORNATA</div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:#fff">' + totLitri.toLocaleString('it-IT', { maximumFractionDigits: 0 }) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:800;color:#7CFC00">' + fmtN(totEuro) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:3px"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Venduto IVA</span><span style="font-family:var(--font-mono);font-size:12px;color:rgba(255,255,255,0.4)">' + fmtN(totEuro * 1.22) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine netto</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:800;color:' + (totMarg >= 0 ? '#7CFC00' : '#FF6B6B') + '">' + fmtN(totMarg) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.25)">Margine IVA</span><span style="font-family:var(--font-mono);font-size:12px;color:rgba(255,255,255,0.4)">' + fmtN(totMarg * 1.22) + '</span></div>' +
    '</div>' +
    // €/L margine medio
    '<div style="margin-top:14px;padding:10px;background:rgba(0,0,0,0.3);border-radius:8px;text-align:center">' +
      '<div style="font-size:9px;color:rgba(255,255,255,0.4);text-transform:uppercase;letter-spacing:0.4px">€/L margine medio</div>' +
      '<div style="font-family:var(--font-mono);font-size:22px;font-weight:800;color:#7CFC00">€ ' + margMedio.toFixed(4) + '</div>' +
    '</div>';
}

// ═══════════════════════════════════════════════════════════════════
// STORICO MARGINALITÀ — tabella mensile
// ═══════════════════════════════════════════════════════════════════
function _uniRenderStoricoMarg() {
  var m = _uniData;
  if (!m) return;
  var tbody = document.getElementById('uni-storico-marg-tabella');
  if (!tbody) return;

  // Selettori anno/mese
  var selAnno = document.getElementById('uni-rep-marg-anno');
  var selMese = document.getElementById('uni-rep-marg-mese');
  if (selAnno && !selAnno.options.length) {
    var annoCorr = new Date().getFullYear();
    for (var a = annoCorr; a >= annoCorr - 2; a--) {
      selAnno.innerHTML += '<option value="' + a + '">' + a + '</option>';
    }
  }
  if (selMese && !selMese.value) {
    selMese.value = String(new Date().getMonth() + 1).padStart(2, '0');
  }

  var anno = selAnno ? selAnno.value : String(new Date().getFullYear());
  var mese = selMese ? selMese.value : String(new Date().getMonth() + 1).padStart(2, '0');
  var prefix = anno + '-' + mese;

  // Filtra date del mese
  var dateMese = m.dateUniche.filter(function(d) { return d.startsWith(prefix); }).sort();

  var totGasL = 0, totBenL = 0, totVenduto = 0, totCosto = 0, totMarg = 0;
  var html = '';

  dateMese.forEach(function(data, i) {
    var lettGiorno = m.lettureByData[data] || [];
    var gasL = 0, benL = 0, vendN = 0, costN = 0;

    lettGiorno.forEach(function(l) {
      var pompa = m.pompeMap[l.pompa_id];
      if (!pompa) return;
      var storPompa = (m.lettureByPompa[l.pompa_id] || []).slice().sort(function(a, b) { return b.data.localeCompare(a.data); });
      var myIdx = storPompa.findIndex(function(x) { return x.id === l.id; });
      var prec = myIdx < storPompa.length - 1 ? storPompa[myIdx + 1] : null;
      var litri = prec ? Number(l.lettura) - Number(prec.lettura) : 0;
      if (litri < 0) litri = 0;

      var prezzo = Number(m.prezziMap[data + '_' + pompa.prodotto] || 0);
      var prezzoN = prezzo ? prezzo / 1.22 : 0;
      var costo = Number(m.costiMap[data + '_' + pompa.prodotto] || 0);
      if (!costo && m.cmpCorrente[pompa.prodotto]) costo = m.cmpCorrente[pompa.prodotto];

      var isGas = pompa.prodotto.toLowerCase().indexOf('gasolio') >= 0;
      if (isGas) gasL += litri; else benL += litri;
      vendN += litri * prezzoN;
      costN += litri * costo;
    });

    var marg = vendN - costN;
    var totL = gasL + benL;
    var margL = totL > 0 ? marg / totL : 0;
    totGasL += gasL; totBenL += benL; totVenduto += vendN; totCosto += costN; totMarg += marg;

    var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' });
    var bgRow = i % 2 === 1 ? 'background:var(--bg-card)' : '';
    var mColor = marg >= 0 ? '#639922' : '#E24B4A';
    html += '<tr style="border-bottom:0.5px solid var(--border);' + bgRow + '">';
    html += '<td style="padding:6px;font-family:var(--font-mono)">' + dataFmt + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + fmtL(gasL) + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + fmtL(benL) + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + fmtE(vendN) + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + fmtE(costN) + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:' + mColor + ';font-weight:500">' + fmtE(marg) + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:' + mColor + '">' + margL.toFixed(4) + '</td>';
    html += '</tr>';
  });

  // Riga totale
  var totL = totGasL + totBenL;
  var margLTot = totL > 0 ? totMarg / totL : 0;
  html += '<tr style="background:#EAF3DE;font-weight:500">';
  html += '<td style="padding:8px 6px;color:#27500A">TOTALE</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtL(totGasL) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtL(totBenL) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtE(totVenduto) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtE(totCosto) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtE(totMarg) + '</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + margLTot.toFixed(4) + '</td>';
  html += '</tr>';

  tbody.innerHTML = html || '<tr><td colspan="7" style="padding:12px;color:var(--text-muted);text-align:center">Nessun dato per questo mese</td></tr>';
}

// ═══════════════════════════════════════════════════════════════════
// STORICO TOTALIZZATORI — vista per giorno con frecce
// ═══════════════════════════════════════════════════════════════════
var _uniLettIdx = 0;

function _uniLettGiorno(dir) {
  if (!_uniData) return;
  var nuovoIdx = _uniLettIdx + dir;
  if (nuovoIdx < 0 || nuovoIdx >= _uniData.dateUniche.length) return;
  _uniRenderStoricoLett(nuovoIdx);
}

function _uniRenderStoricoLett(idx) {
  var m = _uniData;
  if (!m) return;
  _uniLettIdx = idx;
  var data = m.dateUniche[idx];
  if (!data) return;

  var elLabel = document.getElementById('uni-lett-data-label');
  if (elLabel) {
    elLabel.textContent = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
  }

  var tbody = document.getElementById('uni-storico-lett-tabella');
  if (!tbody) return;

  var lettGiorno = (m.lettureByData[data] || []).slice().sort(function(a, b) {
    return ((m.pompeMap[a.pompa_id] || {}).ordine || 99) - ((m.pompeMap[b.pompa_id] || {}).ordine || 99);
  });

  var html = '';
  var totLitri = 0, totVenduto = 0;

  lettGiorno.forEach(function(l, i) {
    var pompa = m.pompeMap[l.pompa_id];
    if (!pompa) return;
    var _pi = cacheProdotti.find(function(pp) { return pp.nome === pompa.prodotto; });
    var colore = _pi ? _pi.colore : '#888';

    var storPompa = (m.lettureByPompa[l.pompa_id] || []).slice().sort(function(a, b) { return b.data.localeCompare(a.data); });
    var myIdx = storPompa.findIndex(function(x) { return x.id === l.id; });
    var prec = myIdx < storPompa.length - 1 ? storPompa[myIdx + 1] : null;
    var litri = prec ? Number(l.lettura) - Number(prec.lettura) : 0;
    if (litri < 0) litri = 0;
    var precVal = prec ? Math.round(Number(prec.lettura)).toLocaleString('it-IT') : '—';
    var oggiVal = Math.round(Number(l.lettura)).toLocaleString('it-IT');
    var prezzo = Number(m.prezziMap[data + '_' + pompa.prodotto] || 0);
    var venduto = litri * prezzo;
    totLitri += litri;
    totVenduto += venduto;

    var bgRow = i % 2 === 1 ? 'background:var(--bg-card)' : '';
    html += '<tr style="border-bottom:0.5px solid var(--border);' + bgRow + '">';
    html += '<td style="padding:6px"><span style="display:inline-block;width:6px;height:6px;background:' + colore + ';border-radius:50%;margin-right:4px"></span>' + esc(pompa.nome) + '</td>';
    html += '<td style="padding:6px;color:var(--text-muted)">' + esc(pompa.prodotto) + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:var(--text-muted)">' + precVal + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + oggiVal + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);font-weight:500">' + fmtL(litri) + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + (prezzo ? prezzo.toFixed(3) : '—') + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);color:#639922;font-weight:500">' + fmtE(venduto) + '</td>';
    html += '</tr>';
  });

  // Riga totale
  html += '<tr style="background:#EAF3DE;font-weight:500">';
  html += '<td colspan="4" style="padding:8px 6px;color:#27500A">TOTALE</td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtL(totLitri) + '</td>';
  html += '<td style="padding:8px 6px"></td>';
  html += '<td style="padding:8px 6px;text-align:right;font-family:var(--font-mono);color:#27500A">' + fmtE(totVenduto) + '</td>';
  html += '</tr>';

  tbody.innerHTML = html || '<tr><td colspan="7" style="padding:12px;color:var(--text-muted);text-align:center">Nessuna lettura</td></tr>';
}

// ═══════════════════════════════════════════════════════════════════
// STORICO CMP — variazioni costo medio ponderato
// ═══════════════════════════════════════════════════════════════════
function _uniRenderStoricoCMP() {
  var m = _uniData;
  if (!m) return;

  // Card CMP corrente
  var elCorr = document.getElementById('uni-cmp-corrente');
  if (elCorr && m.cmpCorrente) {
    var h = '';
    Object.keys(m.cmpCorrente).forEach(function(prod) {
      var val = m.cmpCorrente[prod];
      if (val > 0) {
        h += '<div style="display:inline-block;background:var(--bg-card);padding:8px 14px;border-radius:8px;margin-right:10px;margin-bottom:6px">';
        h += '<div style="font-size:10px;color:var(--text-muted);text-transform:uppercase">' + esc(prod) + '</div>';
        h += '<div style="font-family:var(--font-mono);font-size:16px;font-weight:500">€ ' + val.toFixed(4) + '</div>';
        h += '</div>';
      }
    });
    elCorr.innerHTML = h || '<div style="color:var(--text-muted)">Nessun CMP disponibile</div>';
  }

  // Tabella storico
  var tbody = document.getElementById('uni-storico-cmp-tabella');
  if (!tbody) return;

  var storico = (m.cmpStorico || []).slice(0, 20);
  if (!storico.length) {
    tbody.innerHTML = '<tr><td colspan="6" style="padding:12px;color:var(--text-muted);text-align:center">Nessuna variazione registrata</td></tr>';
    return;
  }

  var html = '';
  storico.forEach(function(r, i) {
    var dataFmt = r.created_at ? new Date(r.created_at).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit' }) : '—';
    var bgRow = i % 2 === 1 ? 'background:var(--bg-card)' : '';
    html += '<tr style="border-bottom:0.5px solid var(--border);' + bgRow + '">';
    html += '<td style="padding:6px;font-family:var(--font-mono)">' + dataFmt + '</td>';
    html += '<td style="padding:6px">' + esc(r.prodotto || '—') + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + (r.cmp_precedente ? Number(r.cmp_precedente).toFixed(4) : '—') + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + (r.litri_caricati ? fmtL(Number(r.litri_caricati)) : '—') + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono)">' + (r.costo_carico ? Number(r.costo_carico).toFixed(4) : '—') + '</td>';
    html += '<td style="padding:6px;text-align:right;font-family:var(--font-mono);font-weight:500">' + (r.cmp_nuovo ? Number(r.cmp_nuovo).toFixed(4) : '—') + '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════
// SALVATAGGIO LETTURE (Fase 1 - 19/04/2026)
// ══════════════════════════════════════════════════════════════════

// Marca come "modifiche non salvate" quando l'operatore digita
function _uniMarkDirty() {
  if (_uniData) _uniData.dirty = true;
}

// Salva le letture del giorno corrente
async function _uniSalvaLetture() {
  if (!_uniData) return;
  var data = _uniData.dateUniche[_uniData.indice];
  if (!data) return;

  var inputs = document.querySelectorAll('.uni-lettura-input');
  if (!inputs.length) { toast('Nessuna lettura da salvare'); return; }

  // Raccogli i dati inseriti + lettura giorno precedente per calcolo delta
  var daSalvare = [];
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var val = parseFloat(inp.value);
    if (isNaN(val) || val <= 0) continue;
    var pompaId = inp.dataset.pompa;
    var prodotto = inp.dataset.prodotto;
    var valGiornoPrec = Number(inp.dataset.prec || 0);
    daSalvare.push({ pompaId: pompaId, prodotto: prodotto, valNuovo: val, valGiornoPrec: valGiornoPrec });
  }
  if (!daSalvare.length) { toast('Inserisci almeno una lettura'); return; }

  // Conferma se sta sovrascrivendo
  var lettureEsistenti = _uniData.lettureByData[data] || [];
  if (lettureEsistenti.length > 0) {
    if (!confirm('Dati gia' + "'" + ' presenti per il ' + data + '. Vuoi sovrascrivere?')) return;
  }

  // Validazione: controllo letture crescenti vs giorno precedente
  for (var i = 0; i < daSalvare.length; i++) {
    var ds = daSalvare[i];
    if (ds.valGiornoPrec > 0 && ds.valNuovo < ds.valGiornoPrec) {
      var nomeP = (_uniData.pompeMap[ds.pompaId] || {}).nome || 'pompa';
      if (!confirm(nomeP + ': lettura (' + ds.valNuovo + ') inferiore al giorno prec. (' + ds.valGiornoPrec + '). Sovrascrivere comunque? (puo\' indicare errore digitazione o contatore azzerato)')) return;
    }
  }

  // Pre-salvataggio: recupera lettura vecchia esistente per stesso giorno (per edit)
  var infoPerCisterne = [];
  for (var j = 0; j < daSalvare.length; j++) {
    var ds = daSalvare[j];
    var oldSameDay = null;
    var existing = lettureEsistenti.find(function(l) { return l.pompa_id === ds.pompaId; });
    if (existing) oldSameDay = Number(existing.lettura);
    infoPerCisterne.push({
      pompaId: ds.pompaId, prodotto: ds.prodotto,
      valNuovo: ds.valNuovo, valVecchioGiornoX: oldSameDay, valGiornoPrec: ds.valGiornoPrec
    });
  }

  // Esegui upsert letture
  var btn = document.getElementById('uni-btn-salva');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio...'; }

  var upserts = daSalvare.map(function(ds) {
    return sb.from('stazione_letture').upsert(
      { pompa_id: ds.pompaId, data: data, lettura: ds.valNuovo, litri_prezzo_diverso: 0, prezzo_diverso: 0 },
      { onConflict: 'pompa_id,data' }
    );
  });
  var results = await Promise.all(upserts);
  var errore = results.find(function(r) { return r.error; });
  if (errore) {
    toast('Errore: ' + errore.error.message);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Salva letture ' + data; }
    return;
  }

  // Aggancio cisterne stazione: per ogni pompa calcola delta e scala la cisterna
  try {
    for (var k = 0; k < infoPerCisterne.length; k++) {
      var ic = infoPerCisterne[k];
      var deltaToApply = 0;
      if (ic.valVecchioGiornoX !== null && ic.valVecchioGiornoX !== undefined) {
        // Re-save stesso giorno: scalo solo la correzione
        deltaToApply = ic.valNuovo - ic.valVecchioGiornoX;
      } else if (ic.valGiornoPrec > 0) {
        // Nuovo inserimento: scalo tutto il delta vs giorno precedente
        deltaToApply = ic.valNuovo - ic.valGiornoPrec;
      }
      if (deltaToApply > 0 && typeof applicaUscitaCisterne === 'function') {
        await applicaUscitaCisterne('stazione_oppido', ic.prodotto, deltaToApply, ic.pompaId);
      }
    }
  } catch(e) { console.error('[_uniSalvaLetture] aggancio cisterne errore (non bloccante):', e); }

  _uniData.dirty = false;
  toast('✅ ' + daSalvare.length + ' letture salvate per il ' + data);

  // Ricarica tab per avere dati freschi
  caricaUnificata();
}
