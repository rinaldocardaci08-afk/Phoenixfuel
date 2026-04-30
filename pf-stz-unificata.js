// ═══════════════════════════════════════════════════════════════════
// PhoenixFuel — Tab unificata Letture & Marginalità stazione
// Versione 30/04/2026 (v20260430e)
//
// Patch 30/04 (e) — fix bug critico bloccante render:
//   - Nel box "Cambio prezzo per prodotto" il loop per costruire prodottiUnici
//     usava `pompe` invece di `m.pompe`. ReferenceError silenzioso che bloccava
//     tutto il rendering della tab Letture & Marginalità (loading infinito).
//   - Aggiunto try/catch difensivo in caricaUnificata: se ora un blocco
//     fallisce, viene mostrato un messaggio d'errore esplicito invece di
//     restare bloccato.
//
// Patch 30/04 (d) — hotfix caricamento bloccato:
//   - Sostituito Promise.all con Promise.allSettled. Se una query fallisce
//     (es. tabella stazione_cambio_prezzo non creata sul DB), il render
//     prosegue invece di bloccare tutto il caricamento.
//
// Patch 30/04 (c): cambio prezzo SPOSTATO da pompa a PRODOTTO.
//   Il cambio prezzo è un evento contabile a livello di prodotto, non per
//   pompa. Una sola riga per (data, prodotto) nella nuova tabella
//   stazione_cambio_prezzo. La ripartizione dei litri tra le pompe dello
//   stesso prodotto avviene proporzionalmente solo per il calcolo interno
//   del pannello marginalità (i totali per prodotto restano esatti).
//   - Banner cambio prezzo per pompa rimosso. Ogni card pompa mostra solo
//     un riquadro INFORMATIVO "vecchio → nuovo prezzo" se c'è un cambio
//     attivo per quel prodotto.
//   - Box "Cambio prezzo per prodotto" nuovo, posizionato SOTTO le pompe.
//     Una riga per ogni prodotto venduto (Benzina, Gasolio Autotrazione)
//     con 4 campi (litri totali, prezzo IVA, prezzo netto calc, costo netto
//     editabile precompilato col CMP) + box marginalità live.
//   - Validazione tolleranza 5 L sui litri totali del prodotto (non più
//     per pompa).
//   - Ereditarietà: il prezzo nuovo del giorno N diventa automaticamente
//     il prezzo standard del giorno N+1 (idem per il costo netto).
//   - Schema DB: nuova tabella stazione_cambio_prezzo (data, prodotto,
//     prezzo_iva_nuovo, costo_netto_nuovo, litri_al_nuovo_prezzo).
//     Vecchi campi su stazione_letture restano per back-compat (popolati
//     a 0 dai nuovi salvataggi).
//
// Patch 30/04 (b): validazione tolleranza litri cambio prezzo.
//   Se litri al nuovo prezzo > litri erogati + 5 L → banner errore rosso sotto
//   al campo, bordo rosso input, pulsante "Salva giornata" disabilitato finché
//   non corretto. Defense in depth: anche se il pulsante fosse forzato, il
//   salvataggio viene rifiutato lato JS.
//
// Patch 30/04 (a): banner cambio prezzo riprogettato.
//   - 4 campi: Litri al nuovo prezzo · Prezzo €/L IVA · Prezzo €/L netto
//     (read-only, calcolato live = IVA / 1,22) · Costo €/L netto (editabile,
//     precompilato col CMP corrente del prodotto).
//   - Box verde marginalità live: margine €/L + litri × margine + margine
//     totale del cambio prezzo.
//   - Salvataggio: persiste anche costo_prezzo_diverso in stazione_letture
//     (nuova colonna). Il CMP del prodotto NON viene aggiornato dal valore
//     digitato (regola: CMP si muove solo con consegne reali).
//   - IVA fissa 22% (stazione vende solo benzina e gasolio autotrazione).
// ═══════════════════════════════════════════════════════════════════

var _uniData = null; // cache dati globale per questa tab

async function caricaUnificata() {
  var el = document.getElementById('uni-pompe');
  if (!el) return;
  el.innerHTML = '<div class="loading" style="padding:24px">Caricamento dati...</div>';

  // Finestra generosa: dal 1/1 dell'anno scorso fino a oggi.
  // Il limite di 90 giorni tagliava le letture di gennaio e rendeva impossibile calcolare
  // il delta del primo giorno utile (la "giorno prec." non era nella finestra).
  var annoCorr = new Date().getFullYear();
  var limISO = (annoCorr - 1) + '-01-01';

  // Patch 30/04 (d): Promise.allSettled invece di Promise.all così se una
  // query fallisce (es. tabella stazione_cambio_prezzo non ancora creata)
  // il caricamento prosegue con i dati che ci sono.
  var [lettSet, pompeSet, prezziSet, costiSet, cisSet, cmpSet, cpSet] = await Promise.allSettled([
    sb.from('stazione_letture').select('*').gte('data', limISO).order('data', { ascending: false }),
    sb.from('stazione_pompe').select('*').eq('attiva', true).order('ordine'),
    sb.from('stazione_prezzi').select('*').gte('data', limISO).order('data', { ascending: false }),
    sb.from('stazione_costi').select('*').gte('data', limISO).order('data', { ascending: false }),
    sb.from('cisterne').select('prodotto,livello_attuale,costo_medio').eq('sede', 'stazione_oppido'),
    sb.from('stazione_cmp_storico').select('*').eq('sede', 'stazione_oppido').order('created_at', { ascending: false }).limit(20),
    sb.from('stazione_cambio_prezzo').select('*').gte('data', limISO).order('data', { ascending: false })
  ]);
  // Estrai data o array vuoto + log warning per ogni query fallita
  function _safeData(set, label) {
    if (set.status === 'fulfilled') {
      if (set.value && set.value.error) { console.warn('[caricaUnificata] ' + label + ' query error:', set.value.error.message); return []; }
      return (set.value && set.value.data) || [];
    } else {
      console.warn('[caricaUnificata] ' + label + ' rejected:', set.reason);
      return [];
    }
  }
  var lettRes = { data: _safeData(lettSet, 'stazione_letture') };
  var pompeRes = { data: _safeData(pompeSet, 'stazione_pompe') };
  var prezziRes = { data: _safeData(prezziSet, 'stazione_prezzi') };
  var costiRes = { data: _safeData(costiSet, 'stazione_costi') };
  var cisRes = { data: _safeData(cisSet, 'cisterne') };
  var cmpRes = { data: _safeData(cmpSet, 'stazione_cmp_storico') };
  var cpRes = { data: _safeData(cpSet, 'stazione_cambio_prezzo') };

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

  // Patch 30/04 (c): mappa cambio prezzo per prodotto/giorno
  var cambioPrezzoMap = {};
  var cambioPrezzo = (cpRes && cpRes.data) || [];
  cambioPrezzo.forEach(function(cp) {
    cambioPrezzoMap[cp.data + '_' + cp.prodotto] = {
      id: cp.id,
      prezzo_iva_nuovo: Number(cp.prezzo_iva_nuovo || 0),
      costo_netto_nuovo: Number(cp.costo_netto_nuovo || 0),
      litri_al_nuovo_prezzo: Number(cp.litri_al_nuovo_prezzo || 0)
    };
  });

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
  }
  // Aggiungi DOMANI (giorno dopo oggi) come giorno futuro consultabile
  var domani = new Date(_oggiISO + 'T12:00:00');
  domani.setDate(domani.getDate() + 1);
  var domaniISO = domani.toISOString().split('T')[0];
  if (dateUniche.indexOf(domaniISO) < 0) {
    dateUniche.push(domaniISO);
  }
  dateUniche.sort().reverse();

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
    cambioPrezzoMap: cambioPrezzoMap,
    lettureByData: lettureByData,
    lettureByPompa: lettureByPompa,
    cmpCorrente: cmpCorrente,
    indice: idxIniziale,
    vista: 'pompa', // 'pompa' o 'prodotto'
    primoGiornoDaCompilare: primoGiornoDaCompilare,
    dirty: false // true se l'operatore ha modificato qualcosa senza salvare
  };

  // Patch 30/04 (e): try/catch difensivo. Se una delle render fallisce
  // (es. errore non previsto su un nuovo blocco), il loading dovrebbe almeno
  // mostrare l'errore esplicito invece di restare in "Caricamento dati..."
  try {
    _uniRenderGiorno(idxIniziale);
  } catch(e) {
    console.error('[caricaUnificata] _uniRenderGiorno crash:', e);
    el.innerHTML = '<div style="padding:24px;background:#FCEBEB;border:1px solid #E24B4A;border-radius:8px;color:#791F1F;font-size:13px"><strong>⚠ Errore rendering giorno corrente</strong><br><br>Dettaglio: ' + (e && e.message ? e.message : String(e)) + '<br><br><small>Stack visibile in console (F12)</small></div>';
    return;
  }
  try { _uniRenderStoricoMarg(); } catch(e) { console.error('[_uniRenderStoricoMarg] crash:', e); }
  try { _uniRenderStoricoLett(idxIniziale); } catch(e) { console.error('[_uniRenderStoricoLett] crash:', e); }
  try { _uniRenderStoricoCMP(); } catch(e) { console.error('[_uniRenderStoricoCMP] crash:', e); }
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
    else if (diff === 1) { elBadge.textContent = 'DOMANI'; elBadge.style.background = '#378ADD'; elBadge.style.color = '#fff'; elBadge.style.display = 'inline-block'; }
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
  // - 'editabile' : giorno con letture (complete o parziali) OPPURE primo giorno da compilare
  //                 => tutti i contatori SEMPRE modificabili
  // - 'futuro'    : data successiva al primoGiornoDaCompilare e senza letture -> consultabile, non editabile
  var statoGiorno;
  var numLetture = lettureGiorno.length;
  var nPompeTot = m.pompe.length;
  var pompeConLettura = {};
  lettureGiorno.forEach(function(l) { pompeConLettura[l.pompa_id] = l; });

  if (numLetture > 0 || data === m.primoGiornoDaCompilare) {
    // Qualsiasi giorno con letture (anche una) oppure il primo da compilare = sempre editabile
    statoGiorno = 'editabile';
  } else {
    statoGiorno = 'futuro'; // giorno senza letture, non il primo da compilare: consultabile ma non editabile
  }

  // Caso FUTURO: giorni futuri/vuoti senza letture, mostra pompe VUOTE non editabili, senza banner di blocco
  if (statoGiorno === 'futuro') {
    m.pompe.forEach(function(pompa) {
      var _pi = cacheProdotti.find(function(pp) { return pp.nome === pompa.prodotto; });
      var colore = _pi ? _pi.colore : '#888';
      html += _uniCardPompaVuota(pompa, colore);
    });
    el.innerHTML = html;
    _uniRenderPanel(totGasolio, totBenzina);
    return;
  }

  // Caso EDITABILE: input attivi per TUTTE le pompe
  if (statoGiorno === 'editabile') {
    var lettureComplete = numLetture >= nPompeTot;
    var messaggio;
    if (lettureComplete) {
      messaggio = '<strong>Giornata compilata</strong><br><span style="font-size:12px">Tutti i contatori sono salvati. Puoi correggerli se necessario — il Salva sovrascrivera\' i valori esistenti.</span>';
    } else if (numLetture > 0) {
      messaggio = '<strong>Completa i dati del giorno</strong><br><span style="font-size:12px">Mancano letture per alcune pompe. Puoi anche correggere quelle gia\' salvate — verranno sovrascritte.</span>';
    } else {
      messaggio = '<strong>Compila i dati di oggi</strong><br><span style="font-size:12px">Inserisci contatori, prezzo di vendita e costo per ciascun prodotto. I litri erogati si calcolano come differenza vs giorno precedente.</span>';
    }
    var bannerColor = lettureComplete ? '#EAF3DE' : '#E6F1FB';
    var bannerBorder = lettureComplete ? '#639922' : '#378ADD';
    var bannerText = lettureComplete ? '#27500A' : '#0C447C';
    html += '<div style="background:' + bannerColor + ';border-left:4px solid ' + bannerBorder + ';border-radius:8px;padding:12px 16px;margin-bottom:14px;color:' + bannerText + '">' + messaggio + '</div>';

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

      // Se la pompa ha gia' una lettura per questa data (caso parziale o correzione), pre-compila
      var letturaOggiEsistente = pompeConLettura[pompa.id];
      var oggiVal = letturaOggiEsistente ? String(Math.round(Number(letturaOggiEsistente.lettura))) : '';
      var litriPdSaved = letturaOggiEsistente ? Number(letturaOggiEsistente.litri_prezzo_diverso || 0) : 0;
      var prezzoPdSaved = letturaOggiEsistente ? Number(letturaOggiEsistente.prezzo_diverso || 0) : 0;
      // Patch 30/04: costo netto cambio prezzo (default = CMP corrente del prodotto)
      var costoPdSaved = letturaOggiEsistente && letturaOggiEsistente.costo_prezzo_diverso
        ? Number(letturaOggiEsistente.costo_prezzo_diverso) : 0;

      // Prezzo vendita + costo: eredita dal giorno corrente o dall'ultimo disponibile
      var prezzoSaved = Number(m.prezziMap[data + '_' + pompa.prodotto] || 0);
      var costoSaved = Number(m.costiMap[data + '_' + pompa.prodotto] || 0);
      // Patch 30/04 (c): il "prezzo standard" del giorno è influenzato dal cambio
      // prezzo dei giorni precedenti. Se nel giorno N c'è stato un cambio prezzo
      // per il prodotto e arriva il giorno N+1, il prezzo nuovo del giorno N
      // diventa il prezzo standard del giorno N+1.
      if (!prezzoSaved) {
        // Strategia: 1) cerca cambio prezzo più recente PRIMA del giorno corrente
        //            2) altrimenti fallback al prezzo standard più recente
        var chiaviCpData = Object.keys(m.cambioPrezzoMap || {}).filter(function(kk){ return kk.endsWith('_' + pompa.prodotto); }).sort().reverse();
        var prezzoDaCambio = 0;
        for (var iCp = 0; iCp < chiaviCpData.length; iCp++) {
          var dCp = chiaviCpData[iCp].split('_')[0];
          if (dCp < data) {
            prezzoDaCambio = Number(m.cambioPrezzoMap[chiaviCpData[iCp]].prezzo_iva_nuovo || 0);
            break;
          }
        }
        if (prezzoDaCambio > 0) {
          prezzoSaved = prezzoDaCambio;
        } else {
          var chiavi = Object.keys(m.prezziMap).filter(function(kk){ return kk.endsWith('_' + pompa.prodotto); }).sort().reverse();
          if (chiavi.length) prezzoSaved = Number(m.prezziMap[chiavi[0]] || 0);
        }
      }
      if (!costoSaved) {
        // Idem per il costo: il costo netto del cambio prezzo del giorno N
        // diventa il costo standard del giorno N+1.
        var chiaviCpC = Object.keys(m.cambioPrezzoMap || {}).filter(function(kk){ return kk.endsWith('_' + pompa.prodotto); }).sort().reverse();
        var costoDaCambio = 0;
        for (var iCpC = 0; iCpC < chiaviCpC.length; iCpC++) {
          var dCpC = chiaviCpC[iCpC].split('_')[0];
          if (dCpC < data) {
            costoDaCambio = Number(m.cambioPrezzoMap[chiaviCpC[iCpC]].costo_netto_nuovo || 0);
            break;
          }
        }
        if (costoDaCambio > 0) {
          costoSaved = costoDaCambio;
        } else {
          var chiaviC = Object.keys(m.costiMap).filter(function(kk){ return kk.endsWith('_' + pompa.prodotto); }).sort().reverse();
          if (chiaviC.length) costoSaved = Number(m.costiMap[chiaviC[0]] || 0);
        }
      }
      var prezzoVal = prezzoSaved > 0 ? prezzoSaved.toFixed(3) : '';
      var costoVal = costoSaved > 0 ? costoSaved.toFixed(4) : '';
      var cmpProd = m.cmpCorrente && m.cmpCorrente[pompa.prodotto] ? m.cmpCorrente[pompa.prodotto] : 0;
      var costoPlaceholder = cmpProd > 0 ? cmpProd.toFixed(4) + ' (CMP)' : '0.000000';

      // ──── CARD POMPA (stile identico tab Totalizzatori originale) ────
      // Patch 30/04 (c): rimosso bottone "⚡ CAMBIO PREZZO" da header pompa.
      // Il cambio prezzo è ora gestito a livello di prodotto in un box dedicato
      // SOTTO le pompe. Sulla pompa resta solo un riquadro INFORMATIVO se c'è
      // un cambio prezzo attivo per il prodotto (rendering più sotto).
      html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:16px">' + esc(pompa.nome) + '</strong><span style="font-size:13px;color:var(--text-muted)">' + esc(pompa.prodotto) + '</span>';
      html += '</div>';
      // Contatori meccanici
      html += '<div style="display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap">';
      html += '<div style="flex:1;min-width:160px"><div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Giorno prec.</div>';
      html += '<div style="background:#1a1a1a;border-radius:8px;padding:8px 12px;display:inline-flex;align-items:center;gap:1px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)"><span style="font-family:\'Courier New\',monospace;font-size:20px;font-weight:700;color:#f0f0f0;letter-spacing:3px">' + precRaw + '</span></div></div>';
      html += '<div style="flex:1;min-width:160px"><div style="font-size:12px;color:var(--text);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600">Oggi</div>';
      html += '<input type="number" class="uni-lettura-input" data-pompa="' + pompa.id + '" data-prodotto="' + esc(pompa.prodotto) + '" data-prec="' + (prec ? prec.lettura : 0) + '" value="' + oggiVal + '" placeholder="00000000" step="0.01" max="99999999" oninput="_uniMarkDirty();_uniCalcolaLive()" style="font-family:\'Courier New\',monospace;font-size:20px;font-weight:700;padding:8px 12px;border:none;border-radius:8px;background:#1a1a1a;color:#7CFC00;width:200px;max-width:100%;text-align:left;letter-spacing:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)" /></div>';
      // Litri erogati (grande, colore prodotto su sfondo scuro per contrasto)
      html += '<div style="flex:1;min-width:160px"><div style="font-size:12px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Litri erogati</div>';
      html += '<div id="uni-litri-' + pompa.id + '" style="background:#2a2a2a;border-radius:8px;padding:8px 14px;display:inline-block;font-family:var(--font-mono);font-size:28px;font-weight:800;color:' + colore + ';box-shadow:inset 0 2px 4px rgba(0,0,0,0.3)">—</div></div>';
      html += '</div>';

      // Box calcolo LIVE (popolato da _uniCalcolaLive) - mostra solo euro + dettaglio cambio prezzo
      html += '<div id="uni-calc-' + pompa.id + '" style="padding:10px 14px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:8px;font-size:14px"></div>';

      // Prezzo + Costo + Margine (riga editabile) - costo in rosso
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;padding:10px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:8px">';
      html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Prezzo vendita €/L IVA</div>';
      html += '<input type="number" step="0.001" class="uni-prezzo-input" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" value="' + prezzoVal + '" oninput="_uniSyncProdotto(this,\'prezzo\');_uniCalcolaLive()" placeholder="0.000" style="font-family:var(--font-mono);font-size:16px;font-weight:600;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);width:100%" />';
      html += '<div class="uni-prezzo-netto" data-prodotto="' + esc(pompa.prodotto) + '" style="font-family:var(--font-mono);font-size:11px;color:var(--text-muted);margin-top:2px">' + (prezzoSaved ? '€ ' + (prezzoSaved / 1.22).toFixed(4) + ' netto' : '') + '</div></div>';
      html += '<div><div style="font-size:11px;color:#B91C1C;text-transform:uppercase;margin-bottom:4px;font-weight:700">Costo €/L netto</div>';
      html += '<input type="number" step="0.000001" class="uni-costo-input" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" value="' + costoVal + '" oninput="_uniSyncProdotto(this,\'costo\');_uniCalcolaLive()" placeholder="' + costoPlaceholder + '" style="font-family:var(--font-mono);font-size:16px;font-weight:700;padding:6px 10px;border:1px solid #B91C1C;border-radius:6px;background:#FEF2F2;color:#991B1B;width:100%" />';
      html += '<div class="uni-costo-iva" data-prodotto="' + esc(pompa.prodotto) + '" style="font-family:var(--font-mono);font-size:11px;color:#B91C1C;margin-top:2px">' + (costoSaved ? '€ ' + (costoSaved * 1.22).toFixed(3) + ' IVA' : '') + '</div></div>';
      html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;margin-bottom:4px">Margine €/L</div>';
      html += '<div class="uni-margine-cell" data-pompa="' + pompa.id + '" style="font-family:var(--font-mono);font-size:16px;font-weight:700;padding:6px 0">—</div></div>';
      html += '</div>';

      // Patch 30/04 (c): riquadro INFORMATIVO sulla pompa (sostituisce il banner
      // editabile per pompa). Mostra "vecchio → nuovo prezzo" se c'è un cambio
      // prezzo attivo per il prodotto del giorno corrente. Nessun input qui:
      // il cambio si gestisce nel box "Cambio prezzo per prodotto" SOTTO le pompe.
      html += '<div class="uni-cp-info-pompa" data-prodotto="' + esc(pompa.prodotto) + '" style="display:none;margin-top:8px;padding:7px 12px;background:#FFF8E1;border-left:3px solid #BA7517;border-radius:0 6px 6px 0;font-size:11px;color:#633806">⚡ <strong>Cambio prezzo oggi</strong>: <span class="uni-cp-info-vecchio"></span> → <span class="uni-cp-info-nuovo" style="font-weight:600"></span></div>';

      html += '</div>'; // chiudi card pompa
    });

    // ════════════════════════════════════════════════════════════════════
    // BOX CAMBIO PREZZO PER PRODOTTO (sotto le pompe, sopra il bottone salva)
    // Patch 30/04 (c): sostituisce il banner per pompa. Una riga per prodotto.
    // ════════════════════════════════════════════════════════════════════
    var prodottiUnici = [];
    var visti = {};
    m.pompe.forEach(function(pp) { if (!visti[pp.prodotto]) { visti[pp.prodotto] = true; prodottiUnici.push(pp.prodotto); } });

    if (prodottiUnici.length) {
      html += '<div style="margin-top:14px;padding:12px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:10px">';
      html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px"><span style="font-size:14px;color:#8B6914;font-weight:600">⚡ Cambio prezzo per prodotto</span><span style="font-size:11px;color:var(--text-muted)">tolleranza ±5 L sui litri totali del prodotto</span></div>';

      prodottiUnici.forEach(function(prodotto) {
        var cpKey = data + '_' + prodotto;
        var cpEsistente = (_uniData.cambioPrezzoMap || {})[cpKey] || null;
        var cmpProd = m.cmpCorrente && m.cmpCorrente[prodotto] ? m.cmpCorrente[prodotto] : 0;
        // Default costo: precompila CMP se non c'è già un valore salvato
        var costoInitial = (cpEsistente && cpEsistente.costo_netto_nuovo > 0)
          ? cpEsistente.costo_netto_nuovo
          : (cmpProd > 0 ? cmpProd : 0);
        var prezzoInitial = (cpEsistente && cpEsistente.prezzo_iva_nuovo > 0) ? cpEsistente.prezzo_iva_nuovo : '';
        var litriInitial = (cpEsistente && cpEsistente.litri_al_nuovo_prezzo > 0) ? cpEsistente.litri_al_nuovo_prezzo : '';

        // Vecchio prezzo = prezzo standard del prodotto (quello che vede la pompa oggi)
        var prezzoVecchio = Number(m.prezziMap[data + '_' + prodotto] || 0);
        if (!prezzoVecchio) {
          var chiaviPrz = Object.keys(m.prezziMap).filter(function(kk){ return kk.endsWith('_' + prodotto); }).sort().reverse();
          if (chiaviPrz.length) prezzoVecchio = Number(m.prezziMap[chiaviPrz[0]] || 0);
        }

        html += '<div style="background:#FFF8E1;border:0.5px solid #F0D080;border-radius:8px;padding:10px;margin-bottom:8px">';
        html += '<div style="display:flex;align-items:baseline;gap:8px;margin-bottom:8px"><strong style="font-size:13px;color:#8B6914">' + esc(prodotto) + '</strong>';
        if (prezzoVecchio > 0) html += '<span style="font-size:11px;color:#888780">prezzo standard oggi: <strong style="font-family:var(--font-mono)">€ ' + prezzoVecchio.toFixed(3) + '</strong></span>';
        html += '</div>';
        // Grid 4 campi
        html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;margin-bottom:8px">';
        // 1) Litri al nuovo prezzo (totale prodotto)
        html += '<div style="background:#fff;border:0.5px solid #F0D080;border-radius:6px;padding:7px 9px">';
        html += '<div style="font-size:9px;color:#8B6914;letter-spacing:0.4px;text-transform:uppercase;font-weight:600;margin-bottom:2px">Litri al nuovo prezzo (totale)</div>';
        html += '<input type="number" class="uni-cpp-litri" data-prodotto="' + esc(prodotto) + '" value="' + (litriInitial || '') + '" placeholder="0" step="0.01" oninput="_uniMarkDirty();_uniCalcolaLive()" style="width:100%;border:0;background:transparent;font-family:var(--font-mono);font-size:15px;font-weight:600;color:#1a1a18;padding:2px 0;outline:none;text-align:right" />';
        html += '</div>';
        // 2) Prezzo IVA nuovo
        html += '<div style="background:#fff;border:0.5px solid #F0D080;border-radius:6px;padding:7px 9px">';
        html += '<div style="font-size:9px;color:#8B6914;letter-spacing:0.4px;text-transform:uppercase;font-weight:600;margin-bottom:2px">Prezzo €/L IVA nuovo</div>';
        html += '<input type="number" class="uni-cpp-prezzo" data-prodotto="' + esc(prodotto) + '" value="' + (prezzoInitial || '') + '" placeholder="0,000" step="0.001" oninput="_uniMarkDirty();_uniCalcolaLive()" style="width:100%;border:0;background:transparent;font-family:var(--font-mono);font-size:15px;font-weight:600;color:#1a1a18;padding:2px 0;outline:none;text-align:right" />';
        html += '</div>';
        // 3) Prezzo netto (read-only)
        html += '<div style="background:rgba(186,117,23,0.06);border:0.5px solid rgba(186,117,23,0.20);border-radius:6px;padding:7px 9px">';
        html += '<div style="font-size:9px;color:#8B6914;letter-spacing:0.4px;text-transform:uppercase;font-weight:600;margin-bottom:2px">Prezzo €/L netto</div>';
        html += '<div class="uni-cpp-netto" data-prodotto="' + esc(prodotto) + '" style="font-family:var(--font-mono);font-size:15px;font-weight:600;color:#633806;padding:2px 0;text-align:right">—</div>';
        html += '<div style="font-size:8px;color:#888780;font-style:italic;text-align:right">= IVA ÷ 1,22</div>';
        html += '</div>';
        // 4) Costo netto editabile (precompilato CMP)
        html += '<div style="background:#fff;border:0.5px solid #F0D080;border-radius:6px;padding:7px 9px">';
        html += '<div style="font-size:9px;color:#8B6914;letter-spacing:0.4px;text-transform:uppercase;font-weight:600;margin-bottom:2px">Costo €/L netto</div>';
        html += '<input type="number" class="uni-cpp-costo" data-prodotto="' + esc(prodotto) + '" value="' + (costoInitial > 0 ? Number(costoInitial).toFixed(4) : '') + '" placeholder="' + (cmpProd > 0 ? cmpProd.toFixed(4) : '0,0000') + '" step="0.0001" oninput="_uniMarkDirty();_uniCalcolaLive()" style="width:100%;border:0;background:transparent;font-family:var(--font-mono);font-size:15px;font-weight:600;color:#1a1a18;padding:2px 0;outline:none;text-align:right" />';
        html += '<div style="font-size:8px;color:#888780;font-style:italic;text-align:right">' + (cmpProd > 0 ? 'CMP attuale: ' + cmpProd.toFixed(4) : 'inserisci costo netto') + '</div>';
        html += '</div>';
        html += '</div>';
        // Box marginalità live (per prodotto)
        html += '<div class="uni-cpp-marg-box" data-prodotto="' + esc(prodotto) + '" style="background:rgba(99,153,34,0.08);border-left:3px solid #639922;border-radius:0 6px 6px 0;padding:7px 12px;display:none">';
        html += '<div style="display:flex;gap:14px;flex-wrap:wrap;align-items:baseline">';
        html += '<div style="display:flex;flex-direction:column;gap:1px"><span style="font-size:9px;color:#27500A;letter-spacing:0.3px;text-transform:uppercase;font-weight:600">Margine €/L</span><span class="uni-cpp-marg-l" data-prodotto="' + esc(prodotto) + '" style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:#173404">—</span></div>';
        html += '<div style="width:0.5px;background:rgba(99,153,34,0.25);align-self:stretch"></div>';
        html += '<div style="display:flex;flex-direction:column;gap:1px"><span style="font-size:9px;color:#27500A;letter-spacing:0.3px;text-transform:uppercase;font-weight:600">Litri × margine</span><span class="uni-cpp-marg-eq" data-prodotto="' + esc(prodotto) + '" style="font-size:11px;color:#888780">—</span></div>';
        html += '<div style="width:0.5px;background:rgba(99,153,34,0.25);align-self:stretch"></div>';
        html += '<div style="display:flex;flex-direction:column;gap:1px"><span style="font-size:9px;color:#27500A;letter-spacing:0.3px;text-transform:uppercase;font-weight:600">Margine totale (cambio prezzo)</span><span class="uni-cpp-marg-tot" data-prodotto="' + esc(prodotto) + '" style="font-family:var(--font-mono);font-size:15px;font-weight:600;color:#173404">—</span></div>';
        html += '</div>';
        html += '</div>';
        // Banner errore tolleranza (per prodotto)
        html += '<div class="uni-cpp-err" data-prodotto="' + esc(prodotto) + '" style="display:none;margin-top:6px;padding:7px 12px;background:#FCEBEB;border-left:3px solid #E24B4A;border-radius:0 6px 6px 0;font-size:11px;color:#791F1F;font-weight:500">⚠ <span class="uni-cpp-err-msg"></span></div>';
        html += '</div>';
      });
      html += '</div>';
    }

    // Bottone UNIFICATO salva tutto
    html += '<div id="uni-salva-wrap" style="position:sticky;bottom:10px;background:var(--bg-card);padding:12px;border-radius:10px;border:0.5px solid var(--border);box-shadow:0 4px 12px rgba(0,0,0,0.1);margin-top:14px">';
    html += '<button id="uni-btn-salva" class="btn-primary" onclick="_uniSalvaTutto()" style="width:100%;padding:14px;font-size:15px;font-weight:600">💾 Salva giornata ' + data + ' (contatori + prezzi + costi + cambio prezzo)</button>';
    html += '</div>';

    el.innerHTML = html;
    // Lancia subito il calcolo live (mostra 0 o valori sensati anche prima dell'input)
    try { _uniCalcolaLive(); } catch(e) { console.error('[_uniCalcolaLive] crash iniziale:', e); }
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

    // ── Riga Prezzo / Costo / Margine (EDITABILI - Fase 2) ──
    // Prezzo e costo sono PER PRODOTTO, non per pompa: gli input con lo stesso
    // data_prodotto si sincronizzano via _uniSyncProdotto on input.
    var prezzoVal = prezzo ? prezzo.toFixed(3) : '';
    var costoVal = costoSaved ? Number(costoSaved).toFixed(4) : '';
    var costoPlaceholder = isCMP ? costoN.toFixed(4) + ' (CMP)' : '';

    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:8px;align-items:start;padding:8px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:6px">';
    // Col 1: Prezzo vendita (editabile)
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Prezzo vendita €/L IVA</div>';
    html += '<input type="number" step="0.001" class="uni-prezzo-input" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" value="' + prezzoVal + '" oninput="_uniSyncProdotto(this,\'prezzo\')" placeholder="0.000" style="font-family:var(--font-mono);font-size:16px;font-weight:600;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);width:100%;max-width:110px" />';
    html += '<div class="uni-prezzo-netto" data-prodotto="' + esc(pompa.prodotto) + '" style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:2px">' + (prezzoN ? '€ ' + prezzoN.toFixed(4) + ' netto' : '') + '</div></div>';

    // Col 2: Costo (editabile)
    html += '<div><div style="font-size:11px;color:var(--text-muted);text-transform:uppercase">Costo €/L netto' + cmpBadge + '</div>';
    html += '<input type="number" step="0.000001" class="uni-costo-input" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" value="' + costoVal + '" oninput="_uniSyncProdotto(this,\'costo\')" placeholder="' + costoPlaceholder + '" style="font-family:var(--font-mono);font-size:16px;font-weight:600;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);width:100%;max-width:130px" />';
    html += '<div class="uni-costo-iva" data-prodotto="' + esc(pompa.prodotto) + '" style="font-family:var(--font-mono);font-size:12px;color:var(--text-muted);margin-top:2px">' + (costoN ? '€ ' + (costoN * 1.22).toFixed(3) + ' IVA' : '') + '</div></div>';
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

  // Bottone "Salva prezzi/costi" del giorno (sticky) - Fase 2
  html += '<div id="uni-salva-pc-wrap" style="position:sticky;bottom:10px;background:var(--bg-card);padding:12px;border-radius:10px;border:0.5px solid var(--border);box-shadow:0 4px 12px rgba(0,0,0,0.1);margin-top:14px;display:flex;gap:8px">';
  html += '<button id="uni-btn-salva-pc" class="btn-primary" onclick="_uniSalvaPrezziCosti()" style="flex:1;padding:12px;font-size:14px;font-weight:600">💰 Salva prezzi e costi ' + data + '</button>';
  html += '</div>';

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
      // Venduto IVA grande e bianco (primario)
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px"><span style="font-size:10px;color:rgba(255,255,255,0.7);font-weight:600">Venduto IVA</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:#ffffff">' + fmtN(totGasolio.euro * 1.22) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.3)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.5)">' + fmtN(totGasolio.euro) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:800;color:' + (totGasolio.marg >= 0 ? '#7CFC00' : '#FF6B6B') + '">' + fmtN(totGasolio.marg) + '</span></div>' +
    '</div>' +
    // Benzina
    '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-bottom:14px">' +
      '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><span style="font-size:11px;font-weight:600;color:#87CEFA">BENZINA</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#87CEFA">' + totBenzina.litri.toLocaleString('it-IT', { maximumFractionDigits: 0 }) + '</span></div>' +
      // Venduto IVA grande e bianco
      '<div style="display:flex;justify-content:space-between;align-items:baseline;margin-bottom:2px"><span style="font-size:10px;color:rgba(255,255,255,0.7);font-weight:600">Venduto IVA</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:#ffffff">' + fmtN(totBenzina.euro * 1.22) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.3)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:11px;color:rgba(255,255,255,0.5)">' + fmtN(totBenzina.euro) + '</span></div>' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:1px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine netto</span><span style="font-family:var(--font-mono);font-size:13px;font-weight:800;color:' + (totBenzina.marg >= 0 ? '#7CFC00' : '#FF6B6B') + '">' + fmtN(totBenzina.marg) + '</span></div>' +
    '</div>' +
    // Totale
    '<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">' +
      '<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:10px">TOTALE GIORNATA</div>' +
      // Totale LITRI - grande bianco
      '<div style="margin-bottom:8px;padding:10px;background:rgba(255,255,255,0.08);border-radius:8px;text-align:center">' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:2px">Totale litri</div>' +
        '<div style="font-family:var(--font-mono);font-size:24px;font-weight:800;color:#ffffff">' + totLitri.toLocaleString('it-IT', { maximumFractionDigits: 0 }) + '</div>' +
      '</div>' +
      // Totale VENDITE IVA - grande bianco
      '<div style="margin-bottom:8px;padding:10px;background:rgba(255,255,255,0.08);border-radius:8px;text-align:center">' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:2px">Vendite IVA</div>' +
        '<div style="font-family:var(--font-mono);font-size:24px;font-weight:800;color:#ffffff">' + fmtN(totEuro * 1.22) + '</div>' +
      '</div>' +
      // Totale MARGINE - grande verde
      '<div style="margin-bottom:6px;padding:10px;background:rgba(255,255,255,0.08);border-radius:8px;text-align:center">' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.6);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:2px">Margine totale</div>' +
        '<div style="font-family:var(--font-mono);font-size:22px;font-weight:800;color:' + (totMarg >= 0 ? '#7CFC00' : '#FF6B6B') + '">' + fmtN(totMarg) + '</div>' +
      '</div>' +
      '<div style="display:flex;justify-content:space-between;margin-top:4px"><span style="font-size:9px;color:rgba(255,255,255,0.3)">Venduto netto</span><span style="font-family:var(--font-mono);font-size:10px;color:rgba(255,255,255,0.4)">' + fmtN(totEuro) + '</span></div>' +
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

  // Selettori anno/mese - preset su mese/anno CORRENTE al primo caricamento
  var selAnno = document.getElementById('uni-rep-marg-anno');
  var selMese = document.getElementById('uni-rep-marg-mese');
  var oggi = new Date();
  var annoAttuale = String(oggi.getFullYear());
  var meseAttuale = String(oggi.getMonth() + 1).padStart(2, '0');
  if (selAnno && !selAnno.options.length) {
    var annoCorr = oggi.getFullYear();
    for (var a = annoCorr; a >= annoCorr - 2; a--) {
      selAnno.innerHTML += '<option value="' + a + '">' + a + '</option>';
    }
    selAnno.value = annoAttuale;
  }
  // Il select mese ha option pre-scritte in HTML: forzo preset al mese corrente solo se non e' gia' stato toccato
  if (selMese && !selMese.dataset.inizializzato) {
    selMese.value = meseAttuale;
    selMese.dataset.inizializzato = '1';
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

// Toggle visibilita' riga "Cambio prezzo" per una pompa
// Patch 30/04 (c): toggle cambio prezzo ora NO-OP. Il cambio prezzo si gestisce
// nel box dedicato sotto le pompe ("Cambio prezzo per prodotto"). Mantenuto come
// no-op per back-compat con eventuali listener esterni o markup di vecchi giorni.
function _uniToggleCambioPrezzo(pompaId) { /* no-op */ return; }

// ══════════════════════════════════════════════════════════════════
// CALCOLO LIVE (copia di calcolaLettureVendite della tab Totalizzatori)
// Aggiorna box pompa + margine + pannello marginalita' destra a ogni input
// ══════════════════════════════════════════════════════════════════
function _uniCalcolaLive() {
  if (!_uniData) return;
  // NON marcare dirty qui: _uniCalcolaLive si invoca anche al render iniziale.
  // dirty viene settato solo dagli handler oninput reali tramite _uniMarkDirty()
  // o dai sync prodotto/input utente.

  var pompe = _uniData.pompe || [];
  var data = _uniData.dateUniche[_uniData.indice];
  var totLitri = 0, totEuro = 0;
  var litriGasolio = 0, euroGasolio = 0, litriBenzina = 0, euroBenzina = 0;
  var margGasolio = 0, margBenzina = 0;

  // ════════════════════════════════════════════════════════════════════
  // FASE 1 — leggi i dati cambio prezzo PER PRODOTTO dal box dedicato.
  // Aggiorna prezzo netto live, popola riquadro info su ogni pompa,
  // calcola litri totali erogati per prodotto per validazione tolleranza.
  // ════════════════════════════════════════════════════════════════════
  // Litri erogati totali per prodotto (somma di tutte le pompe)
  var litriPerProdotto = {}; // { 'Benzina': 237, 'Gasolio Autotrazione': 350 }
  pompe.forEach(function(p) {
    var inpL = document.querySelector('.uni-lettura-input[data-pompa="' + p.id + '"]');
    if (!inpL) return;
    var vO = parseFloat(inpL.value);
    var vP = parseFloat(inpL.dataset.prec) || 0;
    if (!isNaN(vO) && vP > 0) {
      var litriPompa = vO - vP;
      if (litriPompa > 0) litriPerProdotto[p.prodotto] = (litriPerProdotto[p.prodotto] || 0) + litriPompa;
    }
  });

  // Stato cambio prezzo per ogni prodotto (raccolto dal box CPP)
  var cppPerProdotto = {}; // { prodotto: { litri, prezzoIva, prezzoNetto, costoNetto, errore } }
  var prodottiUnici = Object.keys(litriPerProdotto);
  pompe.forEach(function(p) { if (!prodottiUnici.includes(p.prodotto)) prodottiUnici.push(p.prodotto); });

  var TOLLERANZA_L = 5;

  prodottiUnici.forEach(function(prod) {
    var inpLitri = document.querySelector('.uni-cpp-litri[data-prodotto="' + prod + '"]');
    var inpPrezzo = document.querySelector('.uni-cpp-prezzo[data-prodotto="' + prod + '"]');
    var inpCosto = document.querySelector('.uni-cpp-costo[data-prodotto="' + prod + '"]');
    var elNetto = document.querySelector('.uni-cpp-netto[data-prodotto="' + prod + '"]');
    var elMargBox = document.querySelector('.uni-cpp-marg-box[data-prodotto="' + prod + '"]');
    var elMargL = document.querySelector('.uni-cpp-marg-l[data-prodotto="' + prod + '"]');
    var elMargEq = document.querySelector('.uni-cpp-marg-eq[data-prodotto="' + prod + '"]');
    var elMargTot = document.querySelector('.uni-cpp-marg-tot[data-prodotto="' + prod + '"]');
    var elErr = document.querySelector('.uni-cpp-err[data-prodotto="' + prod + '"]');
    var elErrMsg = elErr ? elErr.querySelector('.uni-cpp-err-msg') : null;

    var litriCp = inpLitri ? (parseFloat(inpLitri.value) || 0) : 0;
    var prezzoCpIva = inpPrezzo ? (parseFloat(inpPrezzo.value) || 0) : 0;
    var costoCp = inpCosto ? (parseFloat(inpCosto.value) || 0) : 0;
    var prezzoCpNetto = prezzoCpIva > 0 ? prezzoCpIva / 1.22 : 0;
    var litriProdottoTot = litriPerProdotto[prod] || 0;

    // Aggiorna campo netto readonly
    if (elNetto) elNetto.textContent = prezzoCpNetto > 0 ? prezzoCpNetto.toFixed(4) : '—';

    // Validazione tolleranza
    var errore = false;
    if (litriCp > 0 && litriProdottoTot > 0 && litriCp > litriProdottoTot + TOLLERANZA_L) {
      errore = true;
      var scarto = (litriCp - litriProdottoTot).toFixed(2).replace('.', ',');
      if (elErr) {
        elErr.style.display = 'block';
        if (elErrMsg) elErrMsg.textContent = 'Hai inserito ' + litriCp.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L al cambio prezzo per ' + prod + ', ma sono stati erogati totali ' + litriProdottoTot.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L. Scarto: ' + scarto + ' L (max ' + TOLLERANZA_L + ' L). Correggi prima di salvare.';
      }
      if (inpLitri) inpLitri.style.border = '0.5px solid #E24B4A';
    } else {
      if (elErr) elErr.style.display = 'none';
      if (inpLitri) inpLitri.style.border = '';
    }
    if (inpLitri) {
      if (errore) inpLitri.dataset.cppErrore = '1';
      else delete inpLitri.dataset.cppErrore;
    }

    // Box marginalità live
    if (elMargBox) {
      if (litriCp > 0 && prezzoCpIva > 0 && costoCp > 0) {
        elMargBox.style.display = 'block';
        var margL = prezzoCpNetto - costoCp;
        var margTot = margL * litriCp;
        var col = margL >= 0 ? '#173404' : '#791F1F';
        var sgn = margL >= 0 ? '+ ' : '− ';
        if (elMargL) { elMargL.style.color = col; elMargL.textContent = sgn + '€ ' + Math.abs(margL).toFixed(4); }
        if (elMargEq) elMargEq.textContent = litriCp.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' × ' + margL.toFixed(4);
        if (elMargTot) { elMargTot.style.color = col; elMargTot.textContent = sgn + '€ ' + Math.abs(margTot).toLocaleString('it-IT', {minimumFractionDigits:2,maximumFractionDigits:2}); }
      } else {
        elMargBox.style.display = 'none';
      }
    }

    cppPerProdotto[prod] = {
      litri: litriCp,
      prezzoIva: prezzoCpIva,
      prezzoNetto: prezzoCpNetto,
      costoNetto: costoCp,
      errore: errore
    };
  });

  // ════════════════════════════════════════════════════════════════════
  // FASE 2 — popola riquadro info "Cambio prezzo oggi" su ogni pompa
  // (mostra "vecchio → nuovo prezzo" quando il prodotto ha un CP attivo)
  // ════════════════════════════════════════════════════════════════════
  pompe.forEach(function(p) {
    var elInfo = null;
    var elInfoVecchio = null;
    var elInfoNuovo = null;
    // Cerco l'elemento info dentro la card di QUESTA pompa specifica
    var inpL = document.querySelector('.uni-lettura-input[data-pompa="' + p.id + '"]');
    if (inpL) {
      var card = inpL.closest('div[style*="border-left:4px solid"]');
      if (card) {
        elInfo = card.querySelector('.uni-cp-info-pompa[data-prodotto="' + p.prodotto + '"]');
        if (elInfo) {
          elInfoVecchio = elInfo.querySelector('.uni-cp-info-vecchio');
          elInfoNuovo = elInfo.querySelector('.uni-cp-info-nuovo');
        }
      }
    }
    var inpPrezzo = document.querySelector('.uni-prezzo-input[data-prodotto="' + p.prodotto + '"]');
    var prezzoStd = inpPrezzo ? (parseFloat(inpPrezzo.value) || 0) : 0;
    var cpProdotto = cppPerProdotto[p.prodotto];
    if (elInfo) {
      if (cpProdotto && cpProdotto.prezzoIva > 0 && prezzoStd > 0 && Math.abs(cpProdotto.prezzoIva - prezzoStd) > 0.001) {
        elInfo.style.display = 'block';
        if (elInfoVecchio) elInfoVecchio.textContent = '€ ' + prezzoStd.toFixed(3) + ' IVA';
        if (elInfoNuovo) elInfoNuovo.textContent = '€ ' + cpProdotto.prezzoIva.toFixed(3) + ' IVA';
      } else {
        elInfo.style.display = 'none';
      }
    }
  });

  // ════════════════════════════════════════════════════════════════════
  // FASE 3 — calcolo litri/euro/margine per ogni pompa.
  // I litri al nuovo prezzo del prodotto si distribuiscono tra le pompe
  // dello stesso prodotto in PROPORZIONE ai litri erogati (è la migliore
  // approssimazione possibile non avendo il dato per pompa).
  // Nota: il totale per prodotto resta esatto, la ripartizione è solo
  // un'approssimazione interna alla pompa per il pannello margine destra.
  // ════════════════════════════════════════════════════════════════════
  pompe.forEach(function(p) {
    var inpLett = document.querySelector('.uni-lettura-input[data-pompa="' + p.id + '"]');
    var elCalc = document.getElementById('uni-calc-' + p.id);
    var elMarg = document.querySelector('.uni-margine-cell[data-pompa="' + p.id + '"]');
    if (!inpLett || !elCalc) return;

    var valOggi = parseFloat(inpLett.value);
    var valPrec = parseFloat(inpLett.dataset.prec) || 0;

    var inpPrezzo = document.querySelector('.uni-prezzo-input[data-prodotto="' + p.prodotto + '"]');
    var inpCosto = document.querySelector('.uni-costo-input[data-prodotto="' + p.prodotto + '"]');
    var prezzoStd = inpPrezzo ? (parseFloat(inpPrezzo.value) || 0) : 0;
    var costo = inpCosto ? (parseFloat(inpCosto.value) || 0) : 0;
    if (!costo && _uniData.cmpCorrente && _uniData.cmpCorrente[p.prodotto]) costo = _uniData.cmpCorrente[p.prodotto];

    // Cambio prezzo per QUESTO prodotto (dal box CPP)
    var cpProd = cppPerProdotto[p.prodotto] || { litri: 0, prezzoIva: 0, costoNetto: 0 };

    if (!isNaN(valOggi) && valPrec > 0) {
      var litri = valOggi - valPrec;
      // Ripartizione proporzionale dei litri al nuovo prezzo nella pompa
      var litriProdTot = litriPerProdotto[p.prodotto] || 0;
      var litriDivPompa = (cpProd.litri > 0 && litriProdTot > 0)
        ? Math.min(litri, (litri / litriProdTot) * cpProd.litri)
        : 0;
      var litriStdPompa = Math.max(0, litri - litriDivPompa);
      var euroStd = litriStdPompa * prezzoStd;
      var euroDiv = litriDivPompa * cpProd.prezzoIva;
      var euro = euroStd + euroDiv;

      // Box grande litri erogati accanto al contatore
      var elLitri = document.getElementById('uni-litri-' + p.id);
      if (elLitri) {
        if (litri >= 0) {
          elLitri.innerHTML = litri.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' <span style="font-size:16px;font-weight:500;color:var(--text-muted)">L</span>';
        } else {
          elLitri.innerHTML = '<span style="color:#E24B4A;font-size:16px">⚠ negativo</span>';
        }
      }

      // Box calcolo: solo euro venduto e dettaglio cambio prezzo se presente
      var calcHtml = '<div style="font-size:15px"><span style="color:var(--text-muted)">Venduto: </span><strong style="font-family:var(--font-mono);color:#639922;font-size:18px">€ ' + euro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</strong></div>';
      if (litriDivPompa > 0 && cpProd.prezzoIva > 0) {
        calcHtml += '<div style="font-size:13px;color:var(--text-muted);padding-top:6px;margin-top:6px;border-top:0.5px dashed var(--border)">'
          + '<div>↳ ' + litriStdPompa.toLocaleString('it-IT',{maximumFractionDigits:2}) + ' L × € ' + prezzoStd.toFixed(3) + ' = <strong style="font-family:var(--font-mono)">€ ' + euroStd.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</strong></div>'
          + '<div style="color:#1a1a18">↳ ' + litriDivPompa.toLocaleString('it-IT',{maximumFractionDigits:2}) + ' L × € ' + cpProd.prezzoIva.toFixed(3) + ' = <strong style="font-family:var(--font-mono)">€ ' + euroDiv.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</strong> <span style="font-size:10px;background:#1a1a18;color:#fff;padding:1px 5px;border-radius:4px">cambio prezzo</span></div>'
          + '</div>';
      }
      elCalc.innerHTML = calcHtml;

      // Margine pompa (resta basato sul prezzo standard per la cella ✓)
      if (elMarg) {
        var prezzoN = prezzoStd > 0 ? prezzoStd / 1.22 : 0;
        var margL = prezzoN > 0 && costo > 0 ? prezzoN - costo : 0;
        var margTot = margL * litri;
        var mColor = margL >= 0 ? '#639922' : '#E24B4A';
        elMarg.innerHTML = (costo > 0 && prezzoStd > 0)
          ? '<span style="color:' + mColor + '">€ ' + margL.toFixed(4) + '</span><div style="font-size:10px;color:var(--text-muted);font-weight:400">tot ' + margTot.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</div>'
          : '—';
      }

      // Accumula per pannello destra (con cambio prezzo)
      if (litri >= 0) {
        totLitri += litri; totEuro += euro;
        var isGasolio = p.prodotto.toLowerCase().indexOf('gasolio') >= 0;
        var margLNetto = (prezzoStd > 0 && costo > 0) ? (prezzoStd / 1.22) - costo : 0;
        var costoCp = cpProd.costoNetto || costo; // se costo CP non valorizzato, usa costo std
        var prezzoCpNet = cpProd.prezzoIva > 0 ? cpProd.prezzoIva / 1.22 : 0;
        var margLDivNetto = (prezzoCpNet > 0 && costoCp > 0) ? prezzoCpNet - costoCp : 0;
        var margPompaTot = (margLNetto * litriStdPompa) + (margLDivNetto * litriDivPompa);
        if (isGasolio) { litriGasolio += litri; euroGasolio += euro; margGasolio += margPompaTot; }
        else { litriBenzina += litri; euroBenzina += euro; margBenzina += margPompaTot; }
      }
    } else {
      elCalc.innerHTML = '<span style="color:var(--text-muted);font-size:15px">Venduto: <strong style="font-family:var(--font-mono)">€ —</strong></span>';
      var elLitriVuoto = document.getElementById('uni-litri-' + p.id);
      if (elLitriVuoto) elLitriVuoto.innerHTML = '—';
      if (elMarg) elMarg.innerHTML = '—';
    }
  });

  // Aggiorna pannello marginalita' a destra (stile identico pannello tab marginalita')
  _uniRenderPanel(
    { litri: litriGasolio, euro: euroGasolio, marg: margGasolio },
    { litri: litriBenzina, euro: euroBenzina, marg: margBenzina }
  );

  // Patch 30/04 (c): blocca pulsante salva se almeno un prodotto ha errore tolleranza
  var nErr = document.querySelectorAll('.uni-cpp-litri[data-cpp-errore="1"]').length;
  var btnSalva = document.getElementById('uni-btn-salva');
  if (btnSalva) {
    if (nErr > 0) {
      btnSalva.disabled = true;
      btnSalva.style.opacity = '0.5';
      btnSalva.style.cursor = 'not-allowed';
      btnSalva.title = 'Correggi i litri cambio prezzo (' + nErr + ' prodotto/i in errore) prima di salvare';
    } else {
      btnSalva.disabled = false;
      btnSalva.style.opacity = '';
      btnSalva.style.cursor = '';
      btnSalva.title = '';
    }
  }
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

// ══════════════════════════════════════════════════════════════════
// SALVATAGGIO PREZZI E COSTI (Fase 2 - 19/04/2026)
// ══════════════════════════════════════════════════════════════════

// Sincronizza input prezzo/costo tra card dello stesso prodotto + aggiorna netto/IVA live
function _uniSyncProdotto(srcInput, tipo) {
  if (!_uniData) return;
  _uniData.dirty = true;
  var prodotto = srcInput.dataset.prodotto;
  var val = parseFloat(srcInput.value);
  var clsInput = tipo === 'prezzo' ? '.uni-prezzo-input' : '.uni-costo-input';
  var clsSub = tipo === 'prezzo' ? '.uni-prezzo-netto' : '.uni-costo-iva';

  // Sincronizza TUTTI gli input dello stesso prodotto (pompe multiple condividono valore)
  document.querySelectorAll(clsInput).forEach(function(inp) {
    if (inp.dataset.prodotto === prodotto && inp !== srcInput) inp.value = srcInput.value;
  });

  // Aggiorna subtesto (netto per prezzo, IVA per costo)
  document.querySelectorAll(clsSub).forEach(function(el) {
    if (el.dataset.prodotto !== prodotto) return;
    if (isNaN(val) || val <= 0) { el.textContent = ''; return; }
    if (tipo === 'prezzo') el.textContent = '€ ' + (val / 1.22).toFixed(4) + ' netto';
    else el.textContent = '€ ' + (val * 1.22).toFixed(3) + ' IVA';
  });

  // Ricalcolo live del pannello marginalita'
  _uniRicalcolaPanel();
}

// Ricalcola pannello marginalita' usando i valori CORRENTI negli input
function _uniRicalcolaPanel() {
  if (!_uniData) return;
  var data = _uniData.dateUniche[_uniData.indice];
  if (!data) return;
  var lettureGiorno = _uniData.lettureByData[data] || [];

  // Map prodotto -> { prezzo, costo } leggendo dagli input (se presenti) o dai dati salvati
  var valMap = {};
  document.querySelectorAll('.uni-prezzo-input').forEach(function(inp) {
    var p = inp.dataset.prodotto;
    if (!valMap[p]) valMap[p] = {};
    valMap[p].prezzo = parseFloat(inp.value) || 0;
  });
  document.querySelectorAll('.uni-costo-input').forEach(function(inp) {
    var p = inp.dataset.prodotto;
    if (!valMap[p]) valMap[p] = {};
    valMap[p].costo = parseFloat(inp.value) || 0;
  });

  var totGasolio = { litri: 0, euro: 0, marg: 0 };
  var totBenzina = { litri: 0, euro: 0, marg: 0 };

  lettureGiorno.forEach(function(l) {
    var pompa = _uniData.pompeMap[l.pompa_id];
    if (!pompa) return;
    var storPompa = (_uniData.lettureByPompa[l.pompa_id] || []).slice().sort(function(a, b) { return b.data.localeCompare(a.data); });
    var myIdx = storPompa.findIndex(function(x) { return x.id === l.id; });
    var prec = myIdx < storPompa.length - 1 ? storPompa[myIdx + 1] : null;
    var litriTot = prec ? Number(l.lettura) - Number(prec.lettura) : 0;
    if (litriTot < 0) litriTot = 0;
    var litriPD = Number(l.litri_prezzo_diverso || 0);
    var litriStd = litriPD > 0 ? Math.max(0, litriTot - litriPD) : litriTot;
    var vm = valMap[pompa.prodotto] || {};
    var prezzo = vm.prezzo || 0;
    var costo = vm.costo || 0;
    if (!costo && _uniData.cmpCorrente && _uniData.cmpCorrente[pompa.prodotto]) costo = _uniData.cmpCorrente[pompa.prodotto];
    var prezzoN = prezzo ? (prezzo / 1.22) : 0;
    var margL = prezzoN > 0 && costo > 0 ? prezzoN - costo : 0;
    var margTot = margL * litriStd;
    var isGasolio = pompa.prodotto.toLowerCase().indexOf('gasolio') >= 0;
    if (costo > 0 && litriStd > 0) {
      if (isGasolio) { totGasolio.litri += litriStd; totGasolio.euro += litriStd * prezzoN; totGasolio.marg += margTot; }
      else { totBenzina.litri += litriStd; totBenzina.euro += litriStd * prezzoN; totBenzina.marg += margTot; }
    }
  });

  _uniRenderPanel(totGasolio, totBenzina);
}

// Salva prezzi e costi del giorno (stazione_prezzi + stazione_costi)
async function _uniSalvaPrezziCosti() {
  if (!_uniData) return;
  var data = _uniData.dateUniche[_uniData.indice];
  if (!data) return;

  // Raccogli valori unici per prodotto (i duplicati tra pompe dello stesso prodotto sono gia' sincronizzati)
  var prezziMap = {}, costiMap = {};
  document.querySelectorAll('.uni-prezzo-input').forEach(function(inp) {
    var p = inp.dataset.prodotto;
    var v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0 && prezziMap[p] === undefined) prezziMap[p] = v;
  });
  document.querySelectorAll('.uni-costo-input').forEach(function(inp) {
    var p = inp.dataset.prodotto;
    var v = parseFloat(inp.value);
    if (!isNaN(v) && v > 0 && costiMap[p] === undefined) costiMap[p] = v;
  });

  var nPrezzi = Object.keys(prezziMap).length;
  var nCosti = Object.keys(costiMap).length;
  if (!nPrezzi && !nCosti) { toast('Nessun valore da salvare'); return; }

  var btn = document.getElementById('uni-btn-salva-pc');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio...'; }

  var ops = [];
  Object.keys(prezziMap).forEach(function(p) {
    ops.push(sb.from('stazione_prezzi').upsert({ data: data, prodotto: p, prezzo_litro: prezziMap[p] }, { onConflict: 'data,prodotto' }));
  });
  Object.keys(costiMap).forEach(function(p) {
    ops.push(sb.from('stazione_costi').upsert({ data: data, prodotto: p, costo_litro: costiMap[p] }, { onConflict: 'data,prodotto' }));
  });

  var results = await Promise.all(ops);
  var errore = results.find(function(r) { return r.error; });
  if (errore) {
    toast('Errore: ' + errore.error.message);
    if (btn) { btn.disabled = false; btn.textContent = '💰 Salva prezzi e costi ' + data; }
    return;
  }

  _uniData.dirty = false;
  toast('✅ Salvati ' + nPrezzi + ' prezzi e ' + nCosti + ' costi per il ' + data);
  caricaUnificata();
}

// Salva TUTTO il giorno (contatori + prezzi + costi) in un solo passaggio
async function _uniSalvaTutto() {
  if (!_uniData) return;
  var data = _uniData.dateUniche[_uniData.indice];
  if (!data) return;

  // Patch 30/04 (c): defense in depth — blocca salvataggio se almeno un prodotto
  // ha litri cambio prezzo > litri erogati prodotto + tolleranza (5 L).
  // Il pulsante è già disabilitato a UI, ma se viene forzato (es. da console) il
  // check ferma comunque. Check anche su vecchi marker per pompa (back-compat).
  var prodottiErrCpp = document.querySelectorAll('.uni-cpp-litri[data-cpp-errore="1"]');
  if (prodottiErrCpp.length > 0) {
    if (typeof toast === 'function') toast('⚠ Correggi i litri cambio prezzo prima di salvare (' + prodottiErrCpp.length + ' prodotto/i in errore)');
    return;
  }

  // ───── 1. Raccogli letture ─────
  // Patch 30/04 (c): no più campi cambio prezzo per pompa. Sopravvivono come 0
  // i campi litri_prezzo_diverso/prezzo_diverso/costo_prezzo_diverso per
  // back-compat con storico (i nuovi salvataggi non popolano più).
  var inputs = document.querySelectorAll('.uni-lettura-input');
  var daSalvareL = [];
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var val = parseFloat(inp.value);
    if (isNaN(val) || val <= 0) continue;
    daSalvareL.push({
      pompaId: inp.dataset.pompa,
      prodotto: inp.dataset.prodotto,
      valNuovo: val,
      valGiornoPrec: Number(inp.dataset.prec || 0)
    });
  }

  // ───── 2. Raccogli prezzi/costi ─────
  var prezziMap = {}, costiMap = {};
  document.querySelectorAll('.uni-prezzo-input').forEach(function(ip) {
    var p = ip.dataset.prodotto;
    var v = parseFloat(ip.value);
    if (!isNaN(v) && v > 0 && prezziMap[p] === undefined) prezziMap[p] = v;
  });
  document.querySelectorAll('.uni-costo-input').forEach(function(ic) {
    var p = ic.dataset.prodotto;
    var v = parseFloat(ic.value);
    if (!isNaN(v) && v > 0 && costiMap[p] === undefined) costiMap[p] = v;
  });

  // Se non c'e' nulla da salvare, esci
  if (!daSalvareL.length && !Object.keys(prezziMap).length && !Object.keys(costiMap).length) {
    toast('Nessun dato da salvare');
    return;
  }

  // ───── 3. Validazioni letture ─────
  if (daSalvareL.length) {
    var lettureEsistenti = _uniData.lettureByData[data] || [];
    if (lettureEsistenti.length > 0) {
      if (!confirm('Dati gia' + "'" + ' presenti per il ' + data + '. Vuoi sovrascrivere?')) return;
    }
    for (var j = 0; j < daSalvareL.length; j++) {
      var ds = daSalvareL[j];
      if (ds.valGiornoPrec > 0 && ds.valNuovo < ds.valGiornoPrec) {
        var nomeP = (_uniData.pompeMap[ds.pompaId] || {}).nome || 'pompa';
        if (!confirm(nomeP + ': lettura (' + ds.valNuovo + ') inferiore al giorno prec. (' + ds.valGiornoPrec + '). Sovrascrivere comunque?')) return;
      }
    }
  }

  // ───── 4. Pre-save info per aggancio cisterne ─────
  var infoPerCisterne = [];
  if (daSalvareL.length) {
    var existingLetture = _uniData.lettureByData[data] || [];
    for (var k = 0; k < daSalvareL.length; k++) {
      var d2 = daSalvareL[k];
      var existingItem = existingLetture.find(function(l) { return l.pompa_id === d2.pompaId; });
      infoPerCisterne.push({
        pompaId: d2.pompaId, prodotto: d2.prodotto, valNuovo: d2.valNuovo,
        valVecchioGiornoX: existingItem ? Number(existingItem.lettura) : null,
        valGiornoPrec: d2.valGiornoPrec
      });
    }
  }

  // ───── 5. Esegui upsert ─────
  var btn = document.getElementById('uni-btn-salva');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio...'; }

  var ops = [];
  daSalvareL.forEach(function(ds) {
    // Patch 30/04 (c): campi cambio prezzo per pompa NON più popolati (a 0).
    // Il cambio prezzo è ora un evento per prodotto, salvato in stazione_cambio_prezzo.
    ops.push(sb.from('stazione_letture').upsert(
      { pompa_id: ds.pompaId, data: data, lettura: ds.valNuovo, litri_prezzo_diverso: 0, prezzo_diverso: 0, costo_prezzo_diverso: 0 },
      { onConflict: 'pompa_id,data' }
    ));
  });

  // Patch 30/04 (c): salvataggio cambio prezzo PER PRODOTTO da box CPP.
  // Una riga per (data, prodotto) in stazione_cambio_prezzo. Se l'utente svuota
  // i campi (litri=0, prezzo=0), viene fatto delete del record (annulla cambio).
  var cppDocs = document.querySelectorAll('.uni-cpp-litri[data-prodotto]');
  cppDocs.forEach(function(inpL) {
    var prod = inpL.dataset.prodotto;
    var inpP = document.querySelector('.uni-cpp-prezzo[data-prodotto="' + prod + '"]');
    var inpC = document.querySelector('.uni-cpp-costo[data-prodotto="' + prod + '"]');
    var litri = parseFloat(inpL.value) || 0;
    var prezzo = inpP ? (parseFloat(inpP.value) || 0) : 0;
    var costo = inpC ? (parseFloat(inpC.value) || 0) : 0;
    if (litri > 0 && prezzo > 0) {
      ops.push(sb.from('stazione_cambio_prezzo').upsert(
        {
          data: data,
          prodotto: prod,
          prezzo_iva_nuovo: prezzo,
          costo_netto_nuovo: costo,
          litri_al_nuovo_prezzo: litri,
          updated_at: new Date().toISOString()
        },
        { onConflict: 'data,prodotto' }
      ));
    } else {
      // Annullamento: elimina record se esisteva
      ops.push(sb.from('stazione_cambio_prezzo').delete().eq('data', data).eq('prodotto', prod));
    }
  });

  Object.keys(prezziMap).forEach(function(p) {
    ops.push(sb.from('stazione_prezzi').upsert({ data: data, prodotto: p, prezzo_litro: prezziMap[p] }, { onConflict: 'data,prodotto' }));
  });
  Object.keys(costiMap).forEach(function(p) {
    ops.push(sb.from('stazione_costi').upsert({ data: data, prodotto: p, costo_litro: costiMap[p] }, { onConflict: 'data,prodotto' }));
  });

  var results = await Promise.all(ops);
  var errore = results.find(function(r) { return r.error; });
  if (errore) {
    toast('Errore: ' + errore.error.message);
    if (btn) { btn.disabled = false; btn.textContent = '💾 Salva giornata ' + data; }
    return;
  }

  // ───── 6. Aggancio cisterne (solo per letture nuove) ─────
  try {
    for (var h = 0; h < infoPerCisterne.length; h++) {
      var ic = infoPerCisterne[h];
      var deltaToApply = 0;
      if (ic.valVecchioGiornoX !== null && ic.valVecchioGiornoX !== undefined) {
        deltaToApply = ic.valNuovo - ic.valVecchioGiornoX;
      } else if (ic.valGiornoPrec > 0) {
        deltaToApply = ic.valNuovo - ic.valGiornoPrec;
      }
      if (deltaToApply > 0 && typeof applicaUscitaCisterne === 'function') {
        await applicaUscitaCisterne('stazione_oppido', ic.prodotto, deltaToApply, ic.pompaId);
      }
    }
  } catch(e) { console.error('[_uniSalvaTutto] aggancio cisterne errore (non bloccante):', e); }

  _uniData.dirty = false;
  var msg = '✅ Salvati';
  if (daSalvareL.length) msg += ' ' + daSalvareL.length + ' contatori';
  if (Object.keys(prezziMap).length) msg += ', ' + Object.keys(prezziMap).length + ' prezzi';
  if (Object.keys(costiMap).length) msg += ', ' + Object.keys(costiMap).length + ' costi';
  toast(msg + ' per il ' + data);

  caricaUnificata();
}

// ══════════════════════════════════════════════════════════════════
// REPORT LETTURE PDF del giorno corrente della tab unificata
// Usa _uniData + valori CORRENTI negli input (anche se non ancora salvati)
// ══════════════════════════════════════════════════════════════════
function _uniReportLetture() {
  if (!_uniData) { toast('Dati non caricati'); return; }
  var data = _uniData.dateUniche[_uniData.indice];
  if (!data) { toast('Nessun giorno selezionato'); return; }

  var pompe = _uniData.pompe || [];
  var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });

  var righe = '';
  var totLitri = 0, totEuro = 0;
  var hasAnyData = false;

  pompe.forEach(function(p) {
    var _pi = cacheProdotti.find(function(pp) { return pp.nome === p.prodotto; });
    var colore = _pi ? _pi.colore : '#888';

    // Lettura "oggi" dagli input (se la tab e' in modalita' editabile) oppure dai dati salvati
    var valOggi = NaN;
    var inpLett = document.querySelector('.uni-lettura-input[data-pompa="' + p.id + '"]');
    if (inpLett && inpLett.value !== '') {
      valOggi = parseFloat(inpLett.value);
    } else {
      // fallback: lettura gia' salvata
      var salvata = (_uniData.lettureByData[data] || []).find(function(l) { return l.pompa_id === p.id; });
      if (salvata) valOggi = Number(salvata.lettura);
    }

    // Lettura precedente (piu' recente con data < data corrente)
    var storPompa = (_uniData.lettureByPompa[p.id] || []).slice().sort(function(a, b) { return b.data.localeCompare(a.data); });
    var prec = null;
    for (var k = 0; k < storPompa.length; k++) {
      if (storPompa[k].data < data) { prec = storPompa[k]; break; }
    }
    var valPrec = prec ? Number(prec.lettura) : NaN;

    // Prezzo standard (dagli input se presenti, altrimenti dai dati salvati)
    var prezzoStd = 0;
    var inpPrezzo = document.querySelector('.uni-prezzo-input[data-prodotto="' + p.prodotto + '"]');
    if (inpPrezzo && inpPrezzo.value !== '') prezzoStd = parseFloat(inpPrezzo.value) || 0;
    else prezzoStd = Number(_uniData.prezziMap[data + '_' + p.prodotto] || 0);

    // Cambio prezzo: leggi dal nuovo box CPP per prodotto (patch 30/04 c)
    // Fallback ai vecchi input pompa per back-compat (se presenti in DOM legacy).
    var litriDiv = 0, prezzoDiv = 0;
    var inpCppL = document.querySelector('.uni-cpp-litri[data-prodotto="' + p.prodotto + '"]');
    var inpCppP = document.querySelector('.uni-cpp-prezzo[data-prodotto="' + p.prodotto + '"]');
    if (inpCppL && inpCppL.value) {
      // Litri totali del prodotto: per la riga della singola pompa, prendo la
      // quota proporzionale rispetto al totale erogato del prodotto.
      var litriPompa = (!isNaN(valOggi) && !isNaN(valPrec)) ? Math.max(0, valOggi - valPrec) : 0;
      var litriProdTotR = 0;
      _uniData.pompe.forEach(function(pp) {
        if (pp.prodotto !== p.prodotto) return;
        var lP = _uniData.lettureByPompa[pp.id] || [];
        var rec = lP.find(function(rr) { return rr.data === data; });
        var prc = lP.find(function(rr) { return rr.data < data; });
        if (rec && prc) litriProdTotR += Math.max(0, Number(rec.lettura) - Number(prc.lettura));
      });
      var litriCpProd = parseFloat(inpCppL.value) || 0;
      if (litriProdTotR > 0 && litriCpProd > 0) {
        litriDiv = Math.min(litriPompa, (litriPompa / litriProdTotR) * litriCpProd);
      }
    }
    if (inpCppP && inpCppP.value) prezzoDiv = parseFloat(inpCppP.value) || 0;

    var litri = (!isNaN(valOggi) && !isNaN(valPrec)) ? valOggi - valPrec : 0;
    if (litri < 0) litri = 0;
    var litriStd = Math.max(0, litri - litriDiv);
    var euroStd = litriStd * prezzoStd;
    var euroDiv = litriDiv * prezzoDiv;
    var euro = euroStd + euroDiv;

    if (litri > 0 || !isNaN(valOggi)) hasAnyData = true;
    if (litri > 0) { totLitri += litri; totEuro += euro; }

    righe += '<tr>' +
      '<td style="padding:8px;border:1px solid #ddd"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span><strong>' + esc(p.nome) + '</strong><br><span style="font-size:10px;color:#666">' + esc(p.prodotto) + '</span></td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + (!isNaN(valPrec) ? valPrec.toLocaleString('it-IT', {maximumFractionDigits:2}) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;font-weight:bold">' + (!isNaN(valOggi) ? valOggi.toLocaleString('it-IT', {maximumFractionDigits:2}) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + litri.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + (prezzoStd ? '€ ' + prezzoStd.toFixed(3) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;font-weight:bold">€ ' + euro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
      '</tr>';

    // Riga aggiuntiva per cambio prezzo
    if (litriDiv > 0 && prezzoDiv > 0) {
      righe += '<tr style="background:#FFF8E1;font-size:10px">' +
        '<td style="padding:4px 8px;border:1px solid #ddd;color:#8B6914" colspan="3">↳ di cui a cambio prezzo</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#8B6914">' + litriDiv.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#8B6914">€ ' + prezzoDiv.toFixed(3) + '</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#8B6914;font-weight:bold">€ ' + (litriDiv * prezzoDiv).toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>' +
        '</tr>';
    }
  });

  if (!hasAnyData) { toast('Nessun dato da stampare per ' + data); return; }

  var vendIva = totEuro * 1.22;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Letture Stazione ' + data + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:12px;margin:0;padding:15mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:10mm}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#D4A017;color:#fff;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;border:1px solid #B8900F;text-align:center}' +
    '.tot td{border-top:3px solid #D4A017;font-weight:bold;font-size:13px;background:#FDF3D0}' +
    '.kpi{display:inline-block;background:#f5f5f5;padding:10px 16px;border-radius:8px;margin-right:8px}' +
    '.kpi-label{font-size:10px;color:#666;text-transform:uppercase;letter-spacing:0.5px}' +
    '.kpi-val{font-family:Courier New,monospace;font-size:18px;font-weight:bold;color:#1a1a18}' +
    '</style></head><body>';

  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #D4A017;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><h2 style="margin:0 0 4px 0;color:#1a1a18">Phoenix Fuel — Stazione Oppido</h2>';
  html += '<div style="font-size:13px;color:#666">Report letture pompe</div></div>';
  html += '<div style="text-align:right"><div style="font-size:14px;font-weight:bold;color:#D4A017;text-transform:capitalize">' + dataFmt + '</div>';
  html += '<div style="font-size:10px;color:#999">Stampato il ' + new Date().toLocaleString('it-IT') + '</div></div>';
  html += '</div>';

  html += '<div style="margin-bottom:14px">';
  html += '<span class="kpi"><span class="kpi-label">Totale litri</span><br><span class="kpi-val">' + totLitri.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L</span></span>';
  html += '<span class="kpi"><span class="kpi-label">Venduto netto</span><br><span class="kpi-val">€ ' + totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span></span>';
  html += '<span class="kpi" style="background:#1a1a18;color:#fff"><span class="kpi-label" style="color:#ccc">Vendite IVA</span><br><span class="kpi-val" style="color:#fff">€ ' + vendIva.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span></span>';
  html += '</div>';

  html += '<table><thead><tr><th>Pompa</th><th>Lettura prec.</th><th>Lettura oggi</th><th>Litri</th><th>€/L</th><th>Venduto</th></tr></thead><tbody>';
  html += righe;
  html += '<tr class="tot"><td style="padding:10px;border:1px solid #ddd">TOTALE</td>';
  html += '<td colspan="2" style="padding:10px;border:1px solid #ddd"></td>';
  html += '<td style="padding:10px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + totLitri.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L</td>';
  html += '<td style="padding:10px;border:1px solid #ddd"></td>';
  html += '<td style="padding:10px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">€ ' + totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</td>';
  html += '</tr></tbody></table>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="padding:10px 20px;background:#D4A017;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:bold">🖨️ Stampa</button>';
  html += '<button onclick="window.close()" style="padding:10px 20px;background:#666;color:#fff;border:none;border-radius:8px;cursor:pointer;font-size:14px">Chiudi</button>';
  html += '</div>';

  html += '</body></html>';

  var w = window.open('', '_blank');
  if (!w) { toast('Popup bloccato dal browser'); return; }
  w.document.write(html);
  w.document.close();
}
