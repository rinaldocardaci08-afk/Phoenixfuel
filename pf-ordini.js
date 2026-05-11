// PhoenixFuel — Area Cliente, Prezzi, Ordini, Fido

// ═══════════════════════════════════════════════════════════════════
// Helper: determina se un nome cliente corrisponde a Phoenix Fuel
// (rifornimento interno → margine sempre 0, nessun warning)
// Copre varianti: "Phoenix Fuel Srl", "PhoenixFuel", "phoenix fuel", ecc.
// ═══════════════════════════════════════════════════════════════════
function _isClientePhoenix(nomeCliente) {
  if (!nomeCliente) return false;
  return String(nomeCliente).toLowerCase().indexOf('phoenix') >= 0;
}

// ── AREA CLIENTE ──────────────────────────────────────────────────
async function caricaAreaCliente() {
  if (!utenteCorrente?.cliente_id) return;
  const clienteId = utenteCorrente.cliente_id;
  const { data: prezzi } = await sb.from('prezzi_cliente').select('*').eq('cliente_id', clienteId).eq('data', oggiISO);
  const tbPrezzi = document.getElementById('cl-prezzi-oggi');
  if (!prezzi||!prezzi.length) {
    tbPrezzi.innerHTML = '<tr><td colspan="5" class="loading">Nessun prezzo disponibile oggi</td></tr>';
  } else {
    tbPrezzi.innerHTML = prezzi.map(p => {
      const noiva = Number(p.prezzo_litro);
      const coniva = noiva * (1 + Number(p.iva)/100);
      return '<tr><td>' + p.prodotto + '</td><td style="font-family:var(--font-mono)">' + fmt(noiva) + '</td><td style="font-family:var(--font-mono)">' + fmt(coniva) + '</td><td>' + p.iva + '%</td><td>' + (p.note||'—') + '</td></tr>';
    }).join('');
  }
  const { data: ordini } = await sb.from('ordini').select('data,prodotto,litri,costo_litro,trasporto_litro,margine,iva,stato').or('cliente_id.eq.' + clienteId + ',cliente.eq.' + utenteCorrente.nome).order('data',{ascending:false}).limit(200);
  const tbStorico = document.getElementById('cl-storico');
  if (!ordini||!ordini.length) {
    tbStorico.innerHTML = '<tr><td colspan="6" class="loading">Nessun acquisto</td></tr>';
  } else {
    tbStorico.innerHTML = ordini.map(r => '<tr><td>' + fmtD(r.data) + '</td><td>' + r.prodotto + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmt(prezzoConIva(r)) + '</td><td style="font-family:var(--font-mono)">' + fmtE(prezzoConIva(r)*r.litri) + '</td><td>' + badgeStato(r.stato, r) + '</td></tr>').join('');
    const inizio = new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
    const mese = ordini.filter(r=>r.data>=inizio);
    document.getElementById('cl-mese-litri').textContent = fmtL(mese.reduce((s,r)=>s+Number(r.litri),0));
    document.getElementById('cl-mese-spesa').textContent = fmtE(mese.reduce((s,r)=>s+prezzoConIva(r)*Number(r.litri),0));
  }
}

// ── PREZZI GIORNALIERI ────────────────────────────────────────────
function aggiornaPrev() {
  const c=parseFloat(document.getElementById('pr-costo').value)||0;
  const t=parseFloat(document.getElementById('pr-trasporto').value)||0;
  const m=parseFloat(document.getElementById('pr-margine').value)||0;
  const iva=parseInt(document.getElementById('pr-iva').value)||22;
  const noiva=c+t+m;
  document.getElementById('calc-noiva').textContent = '€ ' + noiva.toFixed(6);
  document.getElementById('calc-iva').textContent = '€ ' + (noiva*(1+iva/100)).toFixed(6);
}

async function caricaBasiPerFornitore() {
  const fornitoreId = document.getElementById('pr-fornitore').value;
  const sel = document.getElementById('pr-base');
  sel.innerHTML = '<option value="">Nessuna (opzionale)</option>';
  if (!fornitoreId) return;
  const { data } = await sb.from('fornitori_basi').select('base_carico_id, basi_carico(id,nome)').eq('fornitore_id', fornitoreId);
  if (data && data.length) {
    data.forEach(r => { if (r.basi_carico) sel.innerHTML += '<option value="' + r.basi_carico.id + '">' + r.basi_carico.nome + '</option>'; });
  } else {
    const { data: tutteBasi } = await sb.from('basi_carico').select('id,nome').eq('attivo',true).order('nome');
    if (tutteBasi) tutteBasi.forEach(b => sel.innerHTML += '<option value="' + b.id + '">' + b.nome + '</option>');
  }
}

async function salvaPrezzo() {
  const selFor = document.getElementById('pr-fornitore');
  const fornitoreNome = selFor.options[selFor.selectedIndex]?.text || '';
  const fornitoreId = selFor.value;
  const baseId = document.getElementById('pr-base').value || null;
  const costo = parseFloat(document.getElementById('pr-costo').value);
  const trasporto = parseFloat(document.getElementById('pr-trasporto').value)||0;
  const margine = parseFloat(document.getElementById('pr-margine').value)||0;
  const data = document.getElementById('pr-data').value;
  const prodotto = document.getElementById('pr-prodotto').value;
  if (!data) { toast('Inserisci la data'); return; }
  if (!fornitoreNome || fornitoreNome === 'Seleziona...') { toast('Seleziona un fornitore'); return; }
  if (!prodotto) { toast('Seleziona un prodotto'); return; }
  if (isNaN(costo)||costo<=0) { toast('Inserisci il costo per litro'); return; }

  // ═══ FIX 2: VALIDAZIONE SANITÀ PREZZO ═══
  // Confronta con il BEST del giorno precedente per lo stesso prodotto.
  // Soft warning se scostamento > 10%, hard block se > 25%.
  // Evita ripetizioni di errori tipo "1.2436" al posto di "1.5436".
  const validOk = await _validaSanitaPrezzo(prodotto, costo, data);
  if (!validOk) return;

  const record = { data, fornitore:fornitoreNome, fornitore_id:fornitoreId||null, base_carico_id:baseId, prodotto, costo_litro:costo, trasporto_litro:trasporto, margine, iva:parseInt(document.getElementById('pr-iva').value) };
  const { data: inserted, error } = await sb.from('prezzi').insert([record]).select().single();
  if (error) { toast('Errore: '+error.message); return; }
  // FIX 1: audit su inserimento prezzo
  _auditLog('crea_prezzo', 'prezzi',
    fornitoreNome + ' ' + prodotto + ' €/L ' + costo.toFixed(6) +
    (trasporto > 0 ? ' (+tr €' + trasporto.toFixed(6) + ')' : '') +
    ' | data ' + data +
    (inserted && inserted.id ? ' | id:' + inserted.id : '')
  );
  toast('Prezzo salvato!');
  caricaPrezzi();
  // Auto-aggiorna benchmark dalla media prezzi del giorno
  _aggiornaBenchmarkAuto(data);
}

// ═══════════════════════════════════════════════════════════════════
// Validazione sanità prezzo (Fix 2 — 21/04/2026)
// Confronto col BEST del giorno precedente per stesso prodotto.
// • scostamento > 10%: warning con conferma
// • scostamento > 25%: blocco hard (non procede)
// Se non c'è riferimento storico, passa sempre.
// ═══════════════════════════════════════════════════════════════════
async function _validaSanitaPrezzo(prodotto, costoNuovo, dataNuova) {
  try {
    // Cerca il costo MINIMO (BEST) nei precedenti 7 giorni per quel prodotto
    var dataRef = new Date(dataNuova + 'T00:00:00Z');
    var inizio = new Date(dataRef.getTime() - 7 * 86400000).toISOString().split('T')[0];
    var fine = new Date(dataRef.getTime() - 86400000).toISOString().split('T')[0];

    var { data: precedenti } = await sb.from('prezzi')
      .select('fornitore,costo_litro,data')
      .eq('prodotto', prodotto)
      .gte('data', inizio)
      .lte('data', fine)
      .order('data', { ascending: false });

    if (!precedenti || !precedenti.length) {
      // Nessun riferimento storico: passo ma avviso
      return true;
    }

    // BEST = costo minimo dei precedenti
    var best = Math.min.apply(null, precedenti.map(function(p){ return Number(p.costo_litro); }));
    if (!isFinite(best) || best <= 0) return true;

    var delta = (costoNuovo - best) / best;
    var deltaPct = delta * 100;
    var deltaStr = (deltaPct >= 0 ? '+' : '') + deltaPct.toFixed(1) + '%';

    // HARD BLOCK se fuori ±25%
    if (Math.abs(delta) > 0.25) {
      alert('⛔ Prezzo fuori range plausibile\n\n' +
        'Costo inserito: €/L ' + costoNuovo.toFixed(6) + '\n' +
        'BEST ultimi 7gg (' + prodotto + '): €/L ' + best.toFixed(6) + '\n' +
        'Scostamento: ' + deltaStr + '\n\n' +
        'Verifica il valore e riprova. Il prezzo non sarà salvato.');
      return false;
    }

    // SOFT WARNING se fuori ±10%
    if (Math.abs(delta) > 0.10) {
      var msg = '⚠️ Scostamento anomalo dal BEST precedente\n\n' +
        'Costo inserito: €/L ' + costoNuovo.toFixed(6) + '\n' +
        'BEST ultimi 7gg (' + prodotto + '): €/L ' + best.toFixed(6) + '\n' +
        'Scostamento: ' + deltaStr + '\n\n' +
        'Sei sicuro di voler salvare?';
      if (!confirm(msg)) return false;
    }

    return true;
  } catch(e) {
    // Non bloccare il salvataggio per errore di validazione
    console.warn('Validazione prezzo fallita (non bloccante):', e);
    return true;
  }
}

async function salvaPrezzoCliente() {
  const clienteId = document.getElementById('pc-cliente').value;
  const prodotto = document.getElementById('pc-prodotto').value;
  const prezzo = parseFloat(document.getElementById('pc-prezzo').value);
  const data = document.getElementById('pc-data').value;
  if (!clienteId||!prodotto||!data||isNaN(prezzo)) { toast('Compila tutti i campi'); return; }
  const { error } = await sb.from('prezzi_cliente').insert([{ data, cliente_id:clienteId, prodotto, prezzo_litro:prezzo, iva:parseInt(document.getElementById('pc-iva').value), note:document.getElementById('pc-note').value }]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('Prezzo cliente salvato!');
}

function scorriGiornoPrezzi(dir) {
  var input = document.getElementById('filtro-data-prezzi');
  if (!input) return;
  var current = input.value ? new Date(input.value) : new Date();
  current.setDate(current.getDate() + dir);
  input.value = current.toISOString().split('T')[0];
  caricaPrezzi();
}

// Patch v20260503p: cambia filtro base listino prezzi e ricarica
function setFiltroBaseListino(base) {
  if (['tutte','vibo','milazzo'].indexOf(base) < 0) return;
  window._filtroBaseListino = base;
  try { localStorage.setItem('pf-listino-filtro-base', base); } catch(e) {}
  caricaPrezzi();
}

async function caricaPrezzi() {
  // Carica fornitori/clienti solo se cache vuota
  if (!cacheFornitori.length) await caricaSelectFornitori('pr-fornitore');
  else { const s=document.getElementById('pr-fornitore'); if(s&&s.options.length<=1) { s.innerHTML='<option value="">Seleziona...</option>'+cacheFornitori.map(f=>'<option value="'+f.id+'">'+f.nome+'</option>').join(''); } }
  if (!cacheClienti.length) await caricaSelectClienti('pc-cliente');
  // Popola dropdown singolo cliente per offerta/listino
  var selClSingolo = document.getElementById('lp-cliente-singolo');
  if (selClSingolo && selClSingolo.options.length <= 1 && cacheClienti.length) {
    selClSingolo.innerHTML = '<option value="">Seleziona...</option>' + cacheClienti.map(function(c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('');
  }
  const filtroData = document.getElementById('filtro-data-prezzi').value;
  // Aggiorna il label OGGI/IERI/DOMANI + giorno settimana ad ogni ricarica
  // (all'apertura tab, cambio data datepicker, click frecce navigazione)
  if (typeof _renderLabelPrezzi === 'function') _renderLabelPrezzi();
  // Sincronizza data inserimento con data visualizzata
  var prData = document.getElementById('pr-data');
  if (prData && filtroData) prData.value = filtroData;
  let query = sb.from('prezzi').select('*, basi_carico(nome)').order('data',{ascending:false}).order('fornitore');
  if (filtroData) query = query.eq('data', filtroData);
  else query = query.limit(200); // Limite sicurezza se nessun filtro

  // Query parallele
  const [prezziRes, cisterneRes, baseDepRes, forColRes] = await Promise.all([
    query,
    sb.from('cisterne').select('*').eq('sede','deposito_vibo'),
    sb.from('basi_carico').select('*').ilike('nome','%phoenix%').maybeSingle(),
    sb.from('fornitori').select('nome,colore')
  ]);
  const data = prezziRes.data;
  const cisterne = cisterneRes.data;
  const baseDeposito = baseDepRes.data;
  // Mappa colori fornitori
  var _forColori = {};
  (forColRes.data||[]).forEach(function(f) { _forColori[f.nome] = f.colore || '#FAEEDA'; });
  _forColori['PhoenixFuel'] = '#FCEBEB';
  // Svuota la cache del CMP storico ad ogni ricarica listino
  // per garantire lettura fresca dal DB quando cambia la data del filtro
  if (typeof _cmpStoricoSvuotaCache === 'function') _cmpStoricoSvuotaCache();

  let righeDeposito = [];
  if (cisterne && baseDeposito) {
    const prodotti = [...new Set(cisterne.map(c=>c.prodotto).filter(Boolean))];
    const dataRif = filtroData || oggiISO;
    // Loop async perché _cmpStoricoAllaData è una query asincrona
    for (const prodotto of prodotti) {
      const cis = cisterne.filter(c=>c.prodotto===prodotto);
      const totLitri = cis.reduce((s,c)=>s+Number(c.livello_attuale),0);
      if (totLitri > 0) {
        // Usa CMP storico alla data selezionata invece del CMP corrente.
        // Se lo storico non ha dati per quel prodotto+data, la funzione
        // ritorna il CMP corrente come fallback (nessun peggioramento).
        let costoMedio;
        if (typeof _cmpStoricoAllaData === 'function') {
          costoMedio = await _cmpStoricoAllaData(prodotto, 'deposito_vibo', dataRif);
          if (!costoMedio || costoMedio === 0) {
            // Fallback al calcolo classico se lo storico è vuoto
            costoMedio = cis.reduce((s,c)=>s+(Number(c.costo_medio||0)*Number(c.livello_attuale)),0) / totLitri;
          }
        } else {
          costoMedio = cis.reduce((s,c)=>s+(Number(c.costo_medio||0)*Number(c.livello_attuale)),0) / totLitri;
        }
        const prodInfo = cacheProdotti.find(p=>p.nome===prodotto);
        const ovr = _depositoOverrides[prodotto] || {};
        righeDeposito.push({ id:'phoenix_'+prodotto, data:filtroData||oggiISO, fornitore:'PhoenixFuel', basi_carico:{nome:baseDeposito.nome}, prodotto, costo_litro:costoMedio, trasporto_litro:ovr.trasporto||0, margine:ovr.margine||0, iva:prodInfo?prodInfo.iva_default:22, _giacenza:totLitri, _isDeposito:true });
      }
    }
  }

  const tuttiPrezzi = [...righeDeposito, ...(data||[])];

  // Patch v20260503p: filtro per base di carico
  // _filtroBaseListino: 'tutte' (default) | 'vibo' | 'milazzo'
  // Persistito in localStorage. PhoenixFuel deposito è considerato di Vibo Marina.
  var _filtroBase = (typeof window._filtroBaseListino !== 'undefined' && window._filtroBaseListino) || localStorage.getItem('pf-listino-filtro-base') || 'tutte';
  window._filtroBaseListino = _filtroBase;

  function _basePerRiga(r) {
    if (r._isDeposito) return 'vibo';   // PhoenixFuel deposito è fisicamente a Vibo Marina
    var nome = (r.basi_carico && r.basi_carico.nome) ? r.basi_carico.nome.toLowerCase() : '';
    if (nome.indexOf('vibo') >= 0) return 'vibo';
    if (nome.indexOf('milazzo') >= 0) return 'milazzo';
    return 'altre';
  }

  // Conteggi per badge bottoni (calcolati su tuttiPrezzi prima del filtro)
  var conteggi = { tutte: tuttiPrezzi.length, vibo: 0, milazzo: 0 };
  tuttiPrezzi.forEach(function(r) {
    var b = _basePerRiga(r);
    if (b === 'vibo') conteggi.vibo++;
    else if (b === 'milazzo') conteggi.milazzo++;
  });
  // Aggiorna badge nei bottoni
  var elT = document.getElementById('lp-cnt-tutte');     if (elT) elT.textContent = '(' + conteggi.tutte + ')';
  var elV = document.getElementById('lp-cnt-vibo');      if (elV) elV.textContent = '(' + conteggi.vibo + ')';
  var elM = document.getElementById('lp-cnt-milazzo');   if (elM) elM.textContent = '(' + conteggi.milazzo + ')';
  // Stato visivo bottoni (active = blu pieno, altri = outline)
  ['tutte','vibo','milazzo'].forEach(function(k) {
    var b = document.getElementById('lp-fbase-' + k);
    if (!b) return;
    var attivo = (k === _filtroBase);
    b.style.background = attivo ? '#378ADD' : 'var(--bg)';
    b.style.color = attivo ? 'white' : 'var(--text)';
    b.style.fontWeight = attivo ? '600' : '400';
    b.style.border = attivo ? '0' : '0.5px solid var(--border)';
  });

  // Filtro effettivo
  var prezziVisibili = (_filtroBase === 'tutte') ? tuttiPrezzi : tuttiPrezzi.filter(function(r) { return _basePerRiga(r) === _filtroBase; });

  const best = {};
  prezziVisibili.forEach(r => { const k=r.data+'_'+r.prodotto; if(!best[k]||prezzoNoIva(r)<prezzoNoIva(best[k])) best[k]=r; });

  // Genera tabelle prezzi dinamicamente dai prodotti
  const container = document.getElementById('container-tabelle-prezzi');
  const tabMap = {};
  cacheProdotti.filter(p => p.attivo).forEach(p => {
    const tbId = 'tabella-prezzi-' + (p.tipo_cisterna || p.nome.toLowerCase().replace(/\s+/g,'-'));
    tabMap[p.nome] = tbId;
  });
  if (container) {
    container.innerHTML = cacheProdotti.filter(p => p.attivo).map(p => {
      const tbId = tabMap[p.nome];
      return '<div style="margin-bottom:24px;padding-bottom:8px;border-bottom:3px solid ' + (p.colore||'#888') + '"><div style="display:flex;align-items:center;gap:10px;margin-bottom:10px"><div style="width:14px;height:14px;border-radius:50%;background:' + (p.colore||'#888') + '"></div><span style="font-size:16px;font-weight:600">' + esc(p.nome) + '</span></div><div style="overflow-x:auto"><table class="prezzi-table"><thead><tr><th>Data</th><th>Fornitore</th><th>Base</th><th>Costo/L</th><th>Trasporto/L</th><th>Margine/L</th><th>Prezzo IVA esc.</th><th>Prezzo IVA inc.</th><th></th></tr></thead><tbody id="' + tbId + '"><tr><td colspan="9" class="loading">Caricamento...</td></tr></tbody></table></div></div>';
    }).join('');
  }

  // Raggruppa per prodotto (usa prezziVisibili, non tuttiPrezzi)
  const perProdotto = {};
  Object.keys(tabMap).forEach(p => { perProdotto[p] = []; });
  prezziVisibili.forEach(r => {
    if (tabMap[r.prodotto]) perProdotto[r.prodotto].push(r);
  });

  // Renderizza ogni tabella
  Object.entries(tabMap).forEach(([prodotto, tbId]) => {
    const tbody = document.getElementById(tbId);
    if (!tbody) return;
    const righe = perProdotto[prodotto];
    if (!righe || !righe.length) { tbody.innerHTML = '<tr><td colspan="9" class="loading">Nessun prezzo</td></tr>'; return; }

    let html = '';
    righe.forEach(r => {
      const isBest = best[r.data+'_'+r.prodotto]?.id === r.id;
      const basNome = r.basi_carico ? r.basi_carico.nome : '—';
      const giacenzaHtml = r._giacenza ? ' <span style="font-size:10px;color:var(--text-hint)">(' + fmtL(r._giacenza) + ')</span>' : '';

      // Azioni
      let azione = '';
      if (r._isDeposito) {
        azione = (isBest ? '<span class="badge green" style="font-size:9px">Best</span> ' : '') + '<span class="badge teal" style="font-size:9px">Deposito</span>';
      } else {
        azione = (isBest ? '<span class="badge green" style="font-size:9px">Best</span> ' : '') + '<button class="btn-danger" onclick="eliminaRecord(\'prezzi\',\'' + r.id + '\',caricaPrezzi)">x</button>';
      }

      // Costo - editabile per tutti, con logica speciale per deposito
      let tdCosto;
      if (r._isDeposito) {
        tdCosto = '<td class="editable" onclick="editaCostoDeposito(this,\'' + r.prodotto + '\',' + r.costo_litro + ')" style="font-family:var(--font-mono)">' + fmt(r.costo_litro) + '</td>';
      } else {
        tdCosto = '<td class="editable" onclick="editaCella(this,\'prezzi\',\'costo_litro\',\'' + r.id + '\',' + r.costo_litro + ')" style="font-family:var(--font-mono)">' + fmt(r.costo_litro) + '</td>';
      }

      // Trasporto - editabile per tutti
      let tdTrasporto;
      if (r._isDeposito) {
        tdTrasporto = '<td class="editable" onclick="editaDepositoValore(this,\'trasporto\',\'' + r.prodotto + '\',' + r.trasporto_litro + ')" style="font-family:var(--font-mono)">' + fmt(r.trasporto_litro) + '</td>';
      } else {
        tdTrasporto = '<td class="editable" onclick="editaCella(this,\'prezzi\',\'trasporto_litro\',\'' + r.id + '\',' + r.trasporto_litro + ')" style="font-family:var(--font-mono)">' + fmt(r.trasporto_litro) + '</td>';
      }

      // Margine - editabile per tutti
      let tdMargine;
      if (r._isDeposito) {
        tdMargine = '<td class="editable" onclick="editaDepositoValore(this,\'margine\',\'' + r.prodotto + '\',' + r.margine + ')" style="font-family:var(--font-mono)">' + fmtM(r.margine) + '</td>';
      } else {
        tdMargine = '<td class="editable" onclick="editaCella(this,\'prezzi\',\'margine\',\'' + r.id + '\',' + r.margine + ')" style="font-family:var(--font-mono)">' + fmtM(r.margine) + '</td>';
      }

      var forColor = _forColori[r.fornitore] || '';
      var forStyle = forColor ? 'font-weight:700;padding:4px 8px;border-radius:4px;background:' + forColor : 'font-weight:700';
      // Delta vs best del giorno (include trasporto perché prezzoNoIva lo somma)
      var deltaHtml = '';
      var bestRow = best[r.data+'_'+r.prodotto];
      if (bestRow && !isBest) {
        var delta = prezzoNoIva(r) - prezzoNoIva(bestRow);
        if (delta > 0.00005) {
          deltaHtml = ' <span style="font-size:10px;padding:2px 6px;border-radius:10px;background:#FDECEA;color:#C0392B;font-family:var(--font-mono);font-weight:600" title="Differenza rispetto al prezzo più basso del giorno (trasporto incluso)">Δ +' + delta.toFixed(6) + '</span>';
        }
      }
      html += '<tr><td>' + fmtD(r.data) + '</td><td><span style="' + forStyle + '">' + r.fornitore + '</span>' + deltaHtml + giacenzaHtml + '</td><td>' + basNome + '</td>' + tdCosto + tdTrasporto + tdMargine + '<td style="font-family:var(--font-mono)">' + fmt(prezzoNoIva(r)) + '</td><td style="font-family:var(--font-mono);font-weight:600">' + fmt(prezzoConIva(r)) + '</td><td>' + azione + '</td></tr>';
    });
    tbody.innerHTML = html;
  });
}

// Valori deposito (trasporto/margine) — persistenti
let _depositoOverrides = {};
try { _depositoOverrides = JSON.parse(localStorage.getItem('phoenix_dep_overrides') || '{}'); } catch(e) {}
function _salvaDepOverrides() { try { localStorage.setItem('phoenix_dep_overrides', JSON.stringify(_depositoOverrides)); } catch(e) {} }

function editaDepositoValore(td, campo, prodotto, valAttuale) {
  const input = document.createElement('input');
  input.className='inline-edit'; input.type='number'; input.step='0.0001'; input.value=valAttuale;
  td.innerHTML=''; td.appendChild(input); input.focus();
  input.onblur = () => {
    const nv = parseFloat(input.value);
    if (!isNaN(nv)) {
      if (!_depositoOverrides[prodotto]) _depositoOverrides[prodotto] = {};
      _depositoOverrides[prodotto][campo] = nv;
      _salvaDepOverrides();
      toast(campo + ' deposito ' + esc(prodotto) + ' impostato a ' + fmt(nv));
    }
    caricaPrezzi();
  };
  input.onkeydown = e => { if(e.key==='Enter') input.blur(); if(e.key==='Escape') caricaPrezzi(); };
}

async function editaCostoDeposito(td, prodotto, valAttuale) {
  const input = document.createElement('input');
  input.className='inline-edit'; input.type='number'; input.step='0.0001'; input.value=valAttuale;
  td.innerHTML=''; td.appendChild(input); input.focus();
  input.onblur = async () => {
    const nv = parseFloat(input.value);
    if (isNaN(nv) || nv === valAttuale) { caricaPrezzi(); return; }

    // Mostra modale conferma modifica costo medio deposito
    let html = '<div style="font-size:15px;font-weight:500;margin-bottom:8px">Modifica costo medio deposito</div>';
    html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Stai modificando il costo medio di <strong>' + prodotto + '</strong> da <strong>' + fmt(valAttuale) + '</strong> a <strong>' + fmt(nv) + '</strong>.</div>';
    html += '<div style="background:#FAEEDA;border-radius:8px;padding:12px;margin-bottom:14px;font-size:12px;color:#633806">';
    html += '⚠ Questa modifica aggiornerà il <strong>costo medio ponderato</strong> di tutte le cisterne di ' + prodotto + ' nel deposito. Il nuovo valore verrà usato come base per il calcolo dei prezzi futuri.</div>';
    html += '<div class="form-grid" style="margin-bottom:14px">';
    html += '<div class="form-group"><label>Nuovo costo medio/L</label><input type="number" id="dep-nuovo-costo" step="0.000001" value="' + nv.toFixed(6) + '" /></div>';
    html += '</div>';
    html += '<div style="display:flex;gap:8px">';
    html += '<button class="btn-primary" style="flex:1" onclick="confermaCostoDeposito(\'' + prodotto + '\')">Conferma modifica</button>';
    html += '<button onclick="chiudiModalePermessi();caricaPrezzi()" style="flex:1;padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button>';
    html += '</div>';
    apriModal(html);
  };
  input.onkeydown = e => { if(e.key==='Enter') input.blur(); if(e.key==='Escape') caricaPrezzi(); };
}

async function confermaCostoDeposito(prodotto) {
  const nuovoCosto = parseFloat(document.getElementById('dep-nuovo-costo').value);
  if (isNaN(nuovoCosto) || nuovoCosto <= 0) { toast('Inserisci un costo valido'); return; }

  // Aggiorna costo_medio di tutte le cisterne di quel prodotto
  const prodottoMap = getProdottoTipoCisterna();
  const tipo = prodottoMap[prodotto] || 'autotrazione';

  // Patch 30/04 (h): leggi prima il CMP precedente e i litri totali, così posso
  // registrare la rettifica nello storico CMP (stesso pattern usato dalla
  // modifica CMP manuale da Deposito - vedi pf-deposito.js:_salvaModificaCMP).
  // Senza questo step, la modifica restava su `cisterne.costo_medio` ma la pagina
  // continuava a mostrare il CMP storico vecchio (visibile via _cmpStoricoAllaData).
  const { data: cisternePre } = await sb.from('cisterne')
    .select('id,prodotto,sede,costo_medio,livello_attuale')
    .eq('tipo', tipo)
    .eq('sede', 'deposito_vibo');
  const cmpPrecedente = cisternePre && cisternePre[0] ? Number(cisternePre[0].costo_medio || 0) : 0;
  const sede = cisternePre && cisternePre[0] ? cisternePre[0].sede : 'deposito_vibo';
  const litriTotali = (cisternePre || []).reduce(function(s, c) { return s + Number(c.livello_attuale || 0); }, 0);

  // 1) Aggiorna costo_medio sulle cisterne (filtro sede + tipo per non toccare la stazione)
  const { error } = await sb.from('cisterne')
    .update({ costo_medio: nuovoCosto, updated_at: new Date().toISOString() })
    .eq('tipo', tipo)
    .eq('sede', 'deposito_vibo');
  if (error) { toast('Errore: ' + error.message); return; }

  // 2) Registra la rettifica nello storico CMP (data odierna). Da questo momento
  //    _cmpStoricoAllaData(prodotto, 'deposito_vibo', oggi) restituirà il nuovo valore.
  const oggiISO = new Date().toISOString().split('T')[0];
  try {
    await sb.from('stazione_cmp_storico').insert([{
      data: oggiISO,
      prodotto: prodotto,
      sede: sede,
      cmp_precedente: cmpPrecedente,
      cmp_nuovo: nuovoCosto,
      litri_precedenti: litriTotali,
      litri_caricati: 0,
      costo_carico: nuovoCosto,
      ordine_id: null
    }]);
  } catch (e) {
    console.warn('Impossibile registrare modifica CMP nello storico:', e);
  }

  // 3) Invalida cache cisterne (e storico CMP se esiste una cache locale)
  _cacheCisterne = null;
  if (typeof _cmpStoricoCache !== 'undefined') _cmpStoricoCache = null;

  // 4) Audit log se disponibile
  if (typeof _auditLog === 'function') {
    _auditLog('modifica_cmp_da_listino', 'cisterne', 'CMP ' + prodotto + ' modificato da ' + cmpPrecedente.toFixed(6) + ' a ' + nuovoCosto.toFixed(6) + ' (rettifica da Listino, storico aggiornato)');
  }

  toast('✓ CMP ' + prodotto + ' aggiornato a ' + fmt(nuovoCosto) + ' (storico registrato)');
  chiudiModalePermessi();
  caricaPrezzi();
}

// ── ORDINI ────────────────────────────────────────────────────────
let prezzoCorrente=null, prezziDelGiorno=[];
let _cacheCisterne=null, _cacheBaseDeposito=null, _cacheBaseDepositoLoaded=false;

function toggleTipoOrdine() {
  const tipo = document.getElementById('ord-tipo').value;
  const isCliente = tipo === 'cliente';
  document.getElementById('grp-cliente').style.display = isCliente ? '' : 'none';
  if (!isCliente) {
    const lbl = { 'entrata_deposito':'Deposito Vibo', 'stazione_servizio':'Stazione Oppido', 'autoconsumo':'Autoconsumo' };
    document.getElementById('ord-note').placeholder = lbl[tipo] || '';
  } else {
    document.getElementById('ord-note').placeholder = '';
  }
  // Ricalcola fornitori e prodotti (filtra PhoenixFuel per entrata_deposito)
  aggiornaSelezioniOrdine();
}

async function aggiornaSelezioniOrdine() {
  const data = document.getElementById('ord-data')?.value; if (!data) return;

  // Esegui query in parallelo
  const [prezziRes, cisterneRes, baseDepRes] = await Promise.all([
    sb.from('prezzi').select('*, basi_carico(id,nome)').eq('data', data),
    _cacheCisterne ? Promise.resolve({data:_cacheCisterne}) : sb.from('cisterne').select('*').eq('sede','deposito_vibo'),
    _cacheBaseDepositoLoaded ? Promise.resolve({data:_cacheBaseDeposito}) : sb.from('basi_carico').select('*').ilike('nome','%phoenix%').maybeSingle()
  ]);

  prezziDelGiorno = prezziRes.data || [];
  const cisterne = cisterneRes.data; _cacheCisterne = cisterne;
  const baseDeposito = baseDepRes.data; _cacheBaseDeposito = baseDeposito; _cacheBaseDepositoLoaded = true;

  // Aggiunge PhoenixFuel sempre disponibile con costo medio deposito
  if (cisterne && baseDeposito) {
    const prodotti = [...new Set(cisterne.map(c=>c.prodotto).filter(Boolean))];
    // Loop async perché _cmpStoricoAllaData è una query asincrona
    for (const prodotto of prodotti) {
      const cis = cisterne.filter(c=>c.prodotto===prodotto&&Number(c.livello_attuale)>0);
      if (cis.length) {
        const totLitri = cis.reduce((s,c)=>s+Number(c.livello_attuale),0);
        // CMP storico alla data dell'ordine (con fallback al CMP corrente)
        let costoMedio;
        if (typeof _cmpStoricoAllaData === 'function') {
          costoMedio = await _cmpStoricoAllaData(prodotto, 'deposito_vibo', data);
          if (!costoMedio || costoMedio === 0) {
            costoMedio = cis.reduce((s,c)=>s+(Number(c.costo_medio||0)*Number(c.livello_attuale)),0)/(totLitri||1);
          }
        } else {
          costoMedio = cis.reduce((s,c)=>s+(Number(c.costo_medio||0)*Number(c.livello_attuale)),0)/(totLitri||1);
        }
        const prodI = cacheProdotti.find(pp=>pp.nome===prodotto);
        prezziDelGiorno.push({ id:'deposito_'+prodotto, data, fornitore:'PhoenixFuel', fornitore_id:null, base_carico_id:baseDeposito.id, basi_carico:{id:baseDeposito.id,nome:baseDeposito.nome}, prodotto, costo_litro:costoMedio||0, trasporto_litro:0, margine:0, iva:prodI?prodI.iva_default:22, _isDeposito:true });
      }
    }
  }

  var fornitori = [...new Map(prezziDelGiorno.map(p=>[p.fornitore,{nome:p.fornitore}])).values()];
  // Per entrata deposito: escludi PhoenixFuel (non puoi caricare dal tuo stesso deposito)
  var tipoOrd = document.getElementById('ord-tipo').value;
  if (tipoOrd === 'entrata_deposito') {
    fornitori = fornitori.filter(function(f){ return f.nome.toLowerCase().indexOf('phoenix') === -1; });
  }
  const selFor = document.getElementById('ord-fornitore');
  selFor.innerHTML = '<option value="">Seleziona fornitore...</option>' + fornitori.map(f=>'<option value="'+f.nome+'">'+f.nome+'</option>').join('');
  document.getElementById('ord-base').innerHTML = '<option value="">— Prima seleziona fornitore —</option>';
  document.getElementById('ord-prodotto').innerHTML = '<option value="">— Prima seleziona fornitore —</option>';
  prezzoCorrente = null;
  // Reset campi custom
  document.getElementById('ord-trasporto-custom').value = '';
  document.getElementById('ord-margine-custom').value = '';
  document.getElementById('ord-prezzo-netto').value = '';
  document.getElementById('fido-cliente-info').style.display = 'none';
  document.getElementById('prev-fido-warn').style.display = 'none';
  fidoClienteCorrente = null;
  // Carica clienti solo se cache vuota
  if (!cacheClienti.length) await caricaSelectClienti('ord-cliente');
}

function aggiornaBasiOrdine() {
  const fornitore = document.getElementById('ord-fornitore').value;
  const prezziFor = prezziDelGiorno.filter(p=>p.fornitore===fornitore);
  const basi = [...new Map(prezziFor.filter(p=>p.basi_carico).map(p=>[p.basi_carico.id,p.basi_carico])).values()];
  const selBase = document.getElementById('ord-base');
  if (basi.length) {
    selBase.innerHTML = '<option value="">Seleziona base...</option>' + basi.map(b=>'<option value="'+b.id+'">'+b.nome+'</option>').join('');
    document.getElementById('ord-prodotto').innerHTML = '<option value="">— Prima seleziona base —</option>';
  } else {
    selBase.innerHTML = '<option value="">Nessuna base specificata</option>';
    aggiornaProdottiOrdine();
  }
  prezzoCorrente = null;
}

let _cacheProdottiStazione = null;

async function aggiornaProdottiOrdine() {
  const fornitore = document.getElementById('ord-fornitore').value;
  const baseId = document.getElementById('ord-base').value;
  const tipo = document.getElementById('ord-tipo').value;
  let prodotti = [...new Set(prezziDelGiorno.filter(p=>p.fornitore===fornitore&&(baseId?p.base_carico_id===baseId:true)).map(p=>p.prodotto))];
  // Per stazione Oppido: solo prodotti delle pompe attive (cached)
  if (tipo === 'stazione_servizio') {
    if (!_cacheProdottiStazione) {
      const { data: pompe } = await sb.from('stazione_pompe').select('prodotto').eq('attiva',true);
      _cacheProdottiStazione = [...new Set((pompe||[]).map(p => p.prodotto))];
    }
    prodotti = prodotti.filter(p => _cacheProdottiStazione.includes(p));
  }
  // Ordina per ordine_visualizzazione (Gasolio Autotrazione=1, Benzina=2, etc)
  prodotti.sort((a,b) => {
    const pa = cacheProdotti.find(p=>p.nome===a);
    const pb = cacheProdotti.find(p=>p.nome===b);
    return (pa?pa.ordine_visualizzazione:99) - (pb?pb.ordine_visualizzazione:99);
  });
  const selProd = document.getElementById('ord-prodotto');
  selProd.innerHTML = '<option value="">Seleziona prodotto...</option>' + prodotti.map(p=>'<option value="'+p+'">'+p+'</option>').join('');
  prezzoCorrente = null;
}

let _cacheMarginClienti = {};

async function caricaPrezzoPerOrdine() {
  const fornitore = document.getElementById('ord-fornitore').value;
  const baseId = document.getElementById('ord-base').value;
  const prodotto = document.getElementById('ord-prodotto').value;
  if (!fornitore||!prodotto) return;
  const match = prezziDelGiorno.find(p=>p.fornitore===fornitore&&p.prodotto===prodotto&&(baseId?p.base_carico_id===baseId:true));
  if (match) {
    prezzoCorrente = match;
    document.getElementById('prev-costo').textContent = fmt(match.costo_litro);
    const trInput = document.getElementById('ord-trasporto-custom');
    const mgInput = document.getElementById('ord-margine-custom');
    const pnInput = document.getElementById('ord-prezzo-netto');
    trInput.value = match.trasporto_litro;

    // Calcola media margine (con cache per evitare query ripetute)
    let margineDaUsare = Number(match.margine);
    const clienteId = document.getElementById('ord-cliente').value;
    // Guardia Phoenix Fuel: rifornimento interno → margine sempre 0
    const clienteNomePre = clienteId ? (cacheClienti.find(c=>c.id===clienteId)?.nome || '') : '';
    if (_isClientePhoenix(clienteNomePre)) {
      margineDaUsare = 0;
    } else if (clienteId) {
      const cacheKey = clienteId + '_' + prodotto;
      if (_cacheMarginClienti[cacheKey] !== undefined) {
        margineDaUsare = _cacheMarginClienti[cacheKey];
      } else {
        const clienteNome = clienteNomePre;
        if (clienteNome) {
          const { data: ordPrec } = await sb.from('ordini').select('margine').or('cliente_id.eq.' + clienteId + ',cliente.eq.' + clienteNome).eq('prodotto', prodotto).neq('stato','annullato').eq('tipo_ordine','cliente').gt('margine',0).order('data',{ascending:false}).limit(10);
          if (ordPrec && ordPrec.length > 0) {
            margineDaUsare = ordPrec.reduce((s, o) => s + Number(o.margine), 0) / ordPrec.length;
          }
          _cacheMarginClienti[cacheKey] = margineDaUsare;
        }
      }
    }

    mgInput.value = margineDaUsare.toFixed(6);
    const noIva = Number(match.costo_litro) + Number(match.trasporto_litro) + margineDaUsare;
    pnInput.value = noIva.toFixed(6);
    aggiornaPrevOrdine();
  } else {
    prezzoCorrente = null;
    ['prev-costo','prev-trasporto','prev-margine','prev-prezzo-netto','prev-prezzo','prev-totale'].forEach(id => document.getElementById(id).textContent = '—');
  }
}

// ── POPUP ULTIMI 5 ORDINI CLIENTE ────────────────────────────────
async function mostraUltimiOrdiniCliente() {
  const clienteId = document.getElementById('ord-cliente').value;
  const prodotto = document.getElementById('ord-prodotto').value;
  if (!clienteId) { toast('Seleziona prima un cliente'); return; }
  if (!prodotto) { toast('Seleziona prima un prodotto'); return; }
  const cliente = cacheClienti.find(c => c.id === clienteId);
  const clienteNome = cliente ? cliente.nome : '';

  // Loader iniziale
  let html = '<div style="font-size:15px;font-weight:600;margin-bottom:4px;color:#0C447C">Ultimi 5 ordini</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px"><strong>' + escHtml(clienteNome) + '</strong> · ' + escHtml(prodotto) + '</div>';
  html += '<div style="text-align:center;padding:20px;color:#888">Caricamento...</div>';
  html += '<div style="display:flex;gap:8px;margin-top:14px"><button onclick="chiudiModal()" style="flex:1;padding:8px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Chiudi</button></div>';
  apriModal(html);

  // Query: ultimi 5 ordini cliente per quel prodotto, escludendo annullati, solo tipo_ordine='cliente'
  const { data: ordini, error } = await sb
    .from('ordini')
    .select('data,litri,costo_litro,trasporto_litro,margine')
    .or('cliente_id.eq.' + clienteId + ',cliente.eq.' + (clienteNome || '').replace(/'/g, "\\'"))
    .eq('prodotto', prodotto)
    .neq('stato', 'annullato')
    .eq('tipo_ordine', 'cliente')
    .order('data', { ascending: false })
    .limit(5);

  let body = '';
  if (error) {
    body = '<div style="text-align:center;padding:20px;color:#c00">Errore: ' + escHtml(error.message) + '</div>';
  } else if (!ordini || ordini.length === 0) {
    body = '<div style="text-align:center;padding:24px;color:#888;font-size:13px">Nessun ordine precedente di questo cliente per <strong>' + escHtml(prodotto) + '</strong>.</div>';
  } else {
    body = '<table style="width:100%;border-collapse:collapse;font-size:12px;font-family:var(--font-mono)">';
    body += '<thead style="background:#EAF3FB"><tr>';
    body += '<th style="padding:6px 8px;text-align:left;border-bottom:1px solid #B8D4EE;font-weight:700;color:#0C447C">Data</th>';
    body += '<th style="padding:6px 8px;text-align:right;border-bottom:1px solid #B8D4EE;font-weight:700;color:#0C447C">Litri</th>';
    body += '<th style="padding:6px 8px;text-align:right;border-bottom:1px solid #B8D4EE;font-weight:700;color:#0C447C">Prezzo netto/L</th>';
    body += '<th style="padding:6px 8px;text-align:right;border-bottom:1px solid #B8D4EE;font-weight:700;color:#0C447C">Margine/L</th>';
    body += '</tr></thead><tbody>';
    let sumLitri = 0, sumMargine = 0;
    ordini.forEach((o, i) => {
      const dt = o.data ? new Date(o.data).toLocaleDateString('it-IT') : '—';
      const litri = Number(o.litri) || 0;
      const prezzoNetto = Number(o.costo_litro) + Number(o.trasporto_litro) + Number(o.margine);
      const mg = Number(o.margine) || 0;
      sumLitri += litri;
      sumMargine += mg;
      const bg = i % 2 === 0 ? '#fff' : '#FAFCFE';
      body += '<tr style="background:' + bg + '">';
      body += '<td style="padding:5px 8px;border-bottom:1px solid #EEF;font-weight:600">' + dt + '</td>';
      body += '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid #EEF">' + fmtL(litri) + '</td>';
      body += '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid #EEF">' + fmt(prezzoNetto) + '</td>';
      body += '<td style="padding:5px 8px;text-align:right;border-bottom:1px solid #EEF;color:#1a3a5a;font-weight:700">' + fmtM(mg) + '</td>';
      body += '</tr>';
    });
    body += '</tbody>';
    if (ordini.length > 1) {
      const margineMedio = sumMargine / ordini.length;
      body += '<tfoot><tr style="background:#EAF3FB;font-weight:700">';
      body += '<td style="padding:6px 8px;color:#0C447C">Media</td>';
      body += '<td style="padding:6px 8px;text-align:right">' + fmtL(sumLitri) + '</td>';
      body += '<td style="padding:6px 8px"></td>';
      body += '<td style="padding:6px 8px;text-align:right;color:#0C447C">' + fmtM(margineMedio) + '</td>';
      body += '</tr></tfoot>';
    }
    body += '</table>';
  }

  // Ricostruisco il popup con i dati
  let html2 = '<div style="font-size:15px;font-weight:600;margin-bottom:4px;color:#0C447C">Ultimi 5 ordini</div>';
  html2 += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px"><strong>' + escHtml(clienteNome) + '</strong> · ' + escHtml(prodotto) + '</div>';
  html2 += body;
  html2 += '<div style="display:flex;gap:8px;margin-top:14px"><button onclick="chiudiModal()" style="flex:1;padding:8px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Chiudi</button></div>';
  apriModal(html2);
}

// Helper escape se non già definito globalmente
if (typeof escHtml !== 'function') {
  window.escHtml = function(s) {
    if (s == null) return '';
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  };
}

// Aggiorna da margine → calcola prezzo netto
function aggiornaPrevDaMargine() {
  if (!prezzoCorrente) return;
  const trasporto = parseFloat(document.getElementById('ord-trasporto-custom').value) || 0;
  const margine = parseFloat(document.getElementById('ord-margine-custom').value) || 0;
  const noIva = Number(prezzoCorrente.costo_litro) + trasporto + margine;
  document.getElementById('ord-prezzo-netto').value = noIva.toFixed(6);
  aggiornaPrevOrdine();
}

// Aggiorna da trasporto → calcola prezzo netto
function aggiornaPrevDaTrasporto() {
  if (!prezzoCorrente) return;
  const trasporto = parseFloat(document.getElementById('ord-trasporto-custom').value) || 0;
  const margine = parseFloat(document.getElementById('ord-margine-custom').value) || 0;
  const noIva = Number(prezzoCorrente.costo_litro) + trasporto + margine;
  document.getElementById('ord-prezzo-netto').value = noIva.toFixed(6);
  aggiornaPrevOrdine();
}

// Aggiorna da prezzo netto → calcola margine
function aggiornaPrevDaPrezzo() {
  if (!prezzoCorrente) return;
  const prezzoNetto = parseFloat(document.getElementById('ord-prezzo-netto').value) || 0;
  const trasporto = parseFloat(document.getElementById('ord-trasporto-custom').value) || 0;
  const margine = prezzoNetto - Number(prezzoCorrente.costo_litro) - trasporto;
  document.getElementById('ord-margine-custom').value = margine.toFixed(6);
  aggiornaPrevOrdine();
}

function aggiornaPrevOrdine() {
  if (!prezzoCorrente) return;
  const litri = parseFloat(document.getElementById('ord-litri').value)||0;
  const trasporto = parseFloat(document.getElementById('ord-trasporto-custom').value) || 0;
  const margine = parseFloat(document.getElementById('ord-margine-custom').value) || 0;
  const noIva = Number(prezzoCorrente.costo_litro) + trasporto + margine;
  const conIva = noIva * (1 + Number(prezzoCorrente.iva) / 100);
  document.getElementById('prev-trasporto').textContent = fmt(trasporto);
  document.getElementById('prev-margine').innerHTML = fmtM(margine);
  document.getElementById('prev-prezzo-netto').textContent = fmt(noIva);
  document.getElementById('prev-prezzo').textContent = fmt(conIva);
  document.getElementById('prev-totale').textContent = fmtE(conIva * litri);
  // Aggiorna avviso fido in tempo reale
  aggiornaAvvisoFido();
}

// ── FIDO CLIENTE ─────────────────────────────────────────────────
let fidoClienteCorrente = null;

async function controllaFidoCliente() {
  const clienteId = document.getElementById('ord-cliente').value;
  const infoDiv = document.getElementById('fido-cliente-info');
  fidoClienteCorrente = null;
  if (!clienteId) { infoDiv.style.display = 'none'; return; }

  // Carica dati cliente
  const { data: cliente } = await sb.from('clienti').select('*').eq('id', clienteId).single();
  if (!cliente) { infoDiv.style.display = 'none'; return; }

  // Auto-fill destinazione da sedi scarico del cliente
  var destSel = document.getElementById('ord-destinazione');
  var destManGrp = document.getElementById('grp-dest-manuale');
  if (destSel) {
    var { data: sedi } = await sb.from('sedi_scarico').select('*').eq('cliente_id', clienteId).eq('attivo', true).order('is_default',{ascending:false}).order('nome');
    destSel.innerHTML = '<option value="">— Nessuna destinazione —</option>';
    if (sedi && sedi.length) {
      sedi.forEach(function(s) {
        var label = s.nome + (s.indirizzo ? ' — ' + s.indirizzo : '') + (s.citta ? ', ' + s.citta : '');
        destSel.innerHTML += '<option value="' + esc(label) + '" data-sede-id="' + s.id + '"' + (s.is_default ? ' selected' : '') + '>' + esc(label) + '</option>';
      });
    }
    destSel.innerHTML += '<option value="__manuale__">✏️ Altro (inserisci manualmente)</option>';
    destSel.onchange = function() {
      if (destManGrp) destManGrp.style.display = destSel.value === '__manuale__' ? '' : 'none';
    };
    if (destManGrp) destManGrp.style.display = 'none';
  }

  // Fido
  const fidoMax = Number(cliente.fido_massimo || 0);
  if (fidoMax <= 0) { infoDiv.style.display = 'none'; return; }

  // Carica ordini non pagati del cliente per fido
  const { data: ordini } = await sb.from('ordini').select('data,costo_litro,trasporto_litro,margine,iva,litri,giorni_pagamento').or('cliente_id.eq.' + clienteId + ',cliente.eq.' + cliente.nome).neq('stato','annullato').eq('pagato',false);

  const ggPag = cliente.giorni_pagamento || 30;
  let fidoUsato = 0;
  (ordini||[]).forEach(o => {
    const scad = new Date(o.data);
    scad.setDate(scad.getDate() + (o.giorni_pagamento || ggPag));
    if (scad > oggi) fidoUsato += prezzoConIva(o) * Number(o.litri);
  });

  const fidoResiduo = fidoMax - fidoUsato;
  const pctUsato = Math.round((fidoUsato / fidoMax) * 100);

  fidoClienteCorrente = { nome: cliente.nome, fidoMax, fidoUsato, fidoResiduo, pctUsato };

  // Mostra info fido
  let bgColor, textColor, icon;
  if (pctUsato >= 100) {
    bgColor = '#FCEBEB'; textColor = '#791F1F'; icon = '🔴';
  } else if (pctUsato >= 90) {
    bgColor = '#FAEEDA'; textColor = '#633806'; icon = '🟡';
  } else {
    bgColor = '#EAF3DE'; textColor = '#27500A'; icon = '🟢';
  }

  infoDiv.style.display = 'block';
  infoDiv.style.background = bgColor;
  infoDiv.style.color = textColor;
  infoDiv.innerHTML = icon + ' <strong>Fido ' + cliente.nome + ':</strong> ' +
    'Massimo: <strong>' + fmtE(fidoMax) + '</strong> · ' +
    'Utilizzato: <strong>' + fmtE(fidoUsato) + '</strong> (' + pctUsato + '%) · ' +
    'Residuo: <strong>' + fmtE(fidoResiduo) + '</strong>';

  aggiornaAvvisoFido();
}

function aggiornaAvvisoFido() {
  const warnEl = document.getElementById('prev-fido-warn');
  if (!fidoClienteCorrente || !prezzoCorrente) { warnEl.style.display = 'none'; return; }

  const litri = parseFloat(document.getElementById('ord-litri').value) || 0;
  const trasporto = parseFloat(document.getElementById('ord-trasporto-custom').value) || 0;
  const margine = parseFloat(document.getElementById('ord-margine-custom').value) || 0;
  const noIva = Number(prezzoCorrente.costo_litro) + trasporto + margine;
  const conIva = noIva * (1 + Number(prezzoCorrente.iva) / 100);
  const totaleOrdine = conIva * litri;

  const nuovoUsato = fidoClienteCorrente.fidoUsato + totaleOrdine;
  const nuovaPct = Math.round((nuovoUsato / fidoClienteCorrente.fidoMax) * 100);

  if (nuovoUsato > fidoClienteCorrente.fidoMax) {
    warnEl.style.display = 'inline';
    warnEl.style.color = '#A32D2D';
    warnEl.innerHTML = '🔴 FIDO SUPERATO! Dopo questo ordine: ' + fmtE(nuovoUsato) + ' / ' + fmtE(fidoClienteCorrente.fidoMax) + ' (' + nuovaPct + '%)';
  } else if (nuovaPct >= 90) {
    warnEl.style.display = 'inline';
    warnEl.style.color = '#BA7517';
    warnEl.innerHTML = '🟡 Attenzione fido al ' + nuovaPct + '% dopo questo ordine (' + fmtE(nuovoUsato) + ' / ' + fmtE(fidoClienteCorrente.fidoMax) + ')';
  } else {
    warnEl.style.display = 'none';
  }
}

async function salvaOrdine() {
  if (!prezzoCorrente) { toast('Seleziona data/fornitore/prodotto disponibili'); return; }
  const litri = validaNumero(document.getElementById('ord-litri').value, 1, 100000, 'Litri');
  if (litri === null) return;
  const tipo = document.getElementById('ord-tipo').value;
  const clienteId = document.getElementById('ord-cliente').value;
  let clienteNome;
  if (tipo === 'cliente') {
    if (!clienteId) { toast('Seleziona un cliente'); return; }
    clienteNome = cacheClienti.find(c=>c.id===clienteId)?.nome||'';
  } else {
    clienteNome = 'Phoenix Fuel Srl';
  }
  const trasporto = validaNumero(document.getElementById('ord-trasporto-custom').value || '0', 0, 1, 'Trasporto');
  if (trasporto === null) return;
  let margine = parseFloat(document.getElementById('ord-margine-custom').value) || 0;
  // Guardia Phoenix Fuel: rifornimento interno → margine sempre 0, nessun warning
  if (_isClientePhoenix(clienteNome)) {
    margine = 0;
  } else if (margine <= 0 && tipo === 'cliente') {
    if (!confirm('Il margine è zero o negativo. Vuoi procedere comunque?')) return;
  }

  // Controllo fido cliente
  if (fidoClienteCorrente && tipo === 'cliente') {
    const noIva = Number(prezzoCorrente.costo_litro) + trasporto + margine;
    const conIva = noIva * (1 + Number(prezzoCorrente.iva) / 100);
    const totaleOrdine = conIva * litri;
    const nuovoUsato = fidoClienteCorrente.fidoUsato + totaleOrdine;

    if (nuovoUsato > fidoClienteCorrente.fidoMax) {
      const superamento = nuovoUsato - fidoClienteCorrente.fidoMax;
      if (!confirm('⚠ ATTENZIONE: questo ordine supera il fido del cliente di ' + fmtE(superamento) + '!\n\n' +
        'Fido massimo: ' + fmtE(fidoClienteCorrente.fidoMax) + '\n' +
        'Già utilizzato: ' + fmtE(fidoClienteCorrente.fidoUsato) + '\n' +
        'Questo ordine: ' + fmtE(totaleOrdine) + '\n' +
        'Nuovo totale: ' + fmtE(nuovoUsato) + '\n\n' +
        'Vuoi procedere comunque?')) return;
    } else if (Math.round((nuovoUsato / fidoClienteCorrente.fidoMax) * 100) >= 90) {
      toast('⚠ Fido cliente al ' + Math.round((nuovoUsato / fidoClienteCorrente.fidoMax) * 100) + '% dopo questo ordine');
    }
  }

  const ggPag = parseInt(document.getElementById('ord-gg').value);
  const dataOrdine = new Date(document.getElementById('ord-data').value);
  const dataScad = new Date(dataOrdine); dataScad.setDate(dataScad.getDate()+ggPag);
  var destVal = document.getElementById('ord-destinazione').value;
  var destinazione = destVal === '__manuale__' ? (document.getElementById('ord-dest-manuale').value.trim()||null) : (destVal || null);
  // Coerenza sede_scarico_id/nome con destinazione selezionata dal dropdown.
  // Se l'utente ha scelto una sede dal dropdown, recupero l'ID dall'option;
  // se ha scelto "manuale" o "nessuna", azzero entrambi i campi per evitare
  // disallineamenti con valori vecchi.
  var sedeScaricoId = null, sedeScaricoNome = null;
  if (destVal && destVal !== '__manuale__') {
    var destSelEl = document.getElementById('ord-destinazione');
    var optSel = destSelEl ? destSelEl.options[destSelEl.selectedIndex] : null;
    if (optSel && optSel.dataset && optSel.dataset.sedeId) {
      sedeScaricoId = optSel.dataset.sedeId;
      sedeScaricoNome = destinazione;
    }
  }
  const record = { data:document.getElementById('ord-data').value, tipo_ordine:tipo, cliente:clienteNome, cliente_id:tipo==='cliente'?clienteId:null, prodotto:prezzoCorrente.prodotto, litri, fornitore:prezzoCorrente.fornitore, costo_litro:prezzoCorrente.costo_litro, trasporto_litro:trasporto, margine:margine, iva:prezzoCorrente.iva, base_carico_id:prezzoCorrente.base_carico_id||null, giorni_pagamento:ggPag, data_scadenza:dataScad.toISOString().split('T')[0], stato:document.getElementById('ord-stato').value, note:document.getElementById('ord-note').value, destinazione:destinazione, sede_scarico_id:sedeScaricoId, sede_scarico_nome:sedeScaricoNome };

  // ═══ OFFLINE: salva nel backlog locale ═══
  if (!navigator.onLine) {
    await _salvaOrdineBacklog(record);
    toast('⚡ Ordine salvato nel backlog offline — verrà sincronizzato al ritorno online');
    document.getElementById('ord-trasporto-custom').value = '';
    document.getElementById('ord-margine-custom').value = '';
    document.getElementById('ord-prezzo-netto').value = '';
    document.getElementById('fido-cliente-info').style.display = 'none';
    document.getElementById('prev-fido-warn').style.display = 'none';
    fidoClienteCorrente = null;
    _cacheMarginClienti = {};
    mostraBacklogOrdini();
    return;
  }

  const { data: nuovoOrdine, error } = await sb.from('ordini').insert([record]).select().single();
  if (error) { toast('Errore: '+error.message); return; }
  _auditLog('crea_ordine', 'ordini', tipo + ' ' + clienteNome + ' ' + prezzoCorrente.prodotto + ' ' + litri + 'L');
  if (prezzoCorrente._isDeposito && tipo === 'cliente') {
    await confermaUscitaDeposito(nuovoOrdine.id, true);
    toast('Ordine salvato e deposito aggiornato!');
  } else {
    toast('Ordine salvato!');
  }
  // Reset
  document.getElementById('ord-trasporto-custom').value = '';
  document.getElementById('ord-margine-custom').value = '';
  document.getElementById('ord-prezzo-netto').value = '';
  document.getElementById('ord-destinazione').innerHTML = '<option value="">— Seleziona cliente prima —</option>';
  document.getElementById('ord-dest-manuale').value = '';
  document.getElementById('grp-dest-manuale').style.display = 'none';
  document.getElementById('fido-cliente-info').style.display = 'none';
  document.getElementById('prev-fido-warn').style.display = 'none';
  fidoClienteCorrente = null;
  _cacheMarginClienti = {};
  // Aggiorna vista giorno alla data dell'ordine appena creato
  var ordDataSel = document.getElementById('ordini-giorno-data');
  if (ordDataSel) ordDataSel.value = record.data;
  caricaOrdini();
}

// ── Helper per renderizzare una riga ordine ──
function _renderRigaOrdine(r) {
  const pL = prezzoConIva(r), tot = pL*r.litri;
  const basNome = r.basi_carico ? r.basi_carico.nome : '—';
  const isApprov = r.tipo_ordine==='entrata_deposito' && !r.caricato_deposito && r.stato!=='annullato';
  // isUscita: ordine in uscita che deve ancora essere scaricato dalla cisterna.
  // NOTA IMPORTANTE: il check su cisterna_id è ESSENZIALE per impedire doppi scarichi.
  // Senza di esso, il bottone "Scarica" ricomparirebbe se lo stato resta diverso da confermato
  // (es. ordini in stato 'in attesa' o 'programmato' che sono stati comunque scaricati).
  const isUscita = r.fornitore && r.fornitore.toLowerCase().includes('phoenix') && (r.tipo_ordine==='cliente' || r.tipo_ordine==='stazione_servizio') && r.stato!=='confermato' && r.stato!=='annullato' && r.stato!=='consegnato' && !r.cisterna_id;
  let btnCisterna = '';
  if (isApprov) btnCisterna = '<button class="btn-primary" style="font-size:11px;padding:3px 8px" onclick="apriModaleAssegnaCisterna(\'' + r.id + '\')">Carica</button> <button class="btn-primary" style="font-size:11px;padding:3px 8px;background:#D85A30" onclick="apriModaleSmistamento(\'' + r.id + '\')">Smista</button> ';
  else if (isUscita) btnCisterna = '<button class="btn-primary" style="font-size:11px;padding:3px 8px;background:#639922" onclick="confermaUscitaDeposito(\'' + r.id + '\')">Scarica</button> ';
  // Bottone annulla scarico/carico: visibile se operazione cisterna già fatta, stato non consegnato/annullato,
  // e SOPRATTUTTO se NON c'è nessun DAS allegato (con DAS l'ordine è confermato e non si tocca più).
  var btnAnnullaOp = '';
  var oggiISO_bg = new Date().toISOString().split('T')[0];
  var hasDas = window._ordiniConDas && window._ordiniConDas.has(r.id);
  if (r.stato !== 'consegnato' && r.stato !== 'annullato' && !hasDas) {
    // Uscita già scaricata (cisterna_id valorizzato, tipo_ordine cliente/stazione/autoconsumo)
    if (r.cisterna_id && (r.tipo_ordine === 'cliente' || r.tipo_ordine === 'stazione_servizio' || r.tipo_ordine === 'autoconsumo')) {
      btnAnnullaOp = '<button class="btn-edit" title="Annulla scarico dalla cisterna" onclick="annullaOperazioneDeposito(\'' + r.id + '\',\'uscita\')" style="color:#D85A30">↩️</button>';
    }
    // Entrata già caricata (entrata_deposito con caricato_deposito=true)
    else if (r.tipo_ordine === 'entrata_deposito' && r.caricato_deposito) {
      btnAnnullaOp = '<button class="btn-edit" title="Annulla carico sulla cisterna" onclick="annullaOperazioneDeposito(\'' + r.id + '\',\'entrata\')" style="color:#D85A30">↩️</button>';
    }
  }
  // Badge "futuro" se data > oggi
  var badgeFuturo = (r.data && r.data > oggiISO_bg) ? ' <span style="display:inline-block;background:#FAEEDA;color:#854F0B;font-size:9px;padding:1px 6px;border-radius:8px;font-weight:500;margin-left:4px">📅 ' + fmtD(r.data) + '</span>' : '';
  var destHtml = r.destinazione ? '<div style="font-size:10px;color:var(--text-muted)">📍 ' + esc(r.destinazione) + '</div>' : '';
  // Calcolo prezzo netto = costo + trasporto + margine
  var pNetto = Number(r.costo_litro || 0) + Number(r.trasporto_litro || 0) + Number(r.margine || 0);
  // Patch v20260503r: badge accoppiamento fattura sotto la data (display-only, no scrittura DB)
  return '<tr><td style="vertical-align:top">' + fmtD(r.data) + badgeFuturo + _renderBadgeFatturaInline(r) + '</td><td>' + badgeStato(r.tipo_ordine||'cliente') + '</td><td>' + esc(r.cliente) + destHtml + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td>' + esc(r.fornitore) + '</td><td>' + esc(basNome) + '</td><td class="editable" onclick="editaCella(this,\'ordini\',\'trasporto_litro\',\'' + r.id + '\',' + r.trasporto_litro + ')" style="font-family:var(--font-mono)">' + fmt(r.trasporto_litro) + '</td><td style="font-family:var(--font-mono);background:rgba(186,117,23,0.04)">' + fmt(pNetto) + '</td><td class="editable" onclick="editaCella(this,\'ordini\',\'margine\',\'' + r.id + '\',' + r.margine + ')" style="font-family:var(--font-mono)">' + fmtM(r.margine) + '</td><td style="font-family:var(--font-mono)">' + fmt(pL) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td><td>' + badgeStato(r.stato, r) + '</td><td>' + btnCisterna + btnAnnullaOp + '<button class="btn-edit" title="DAS" onclick="mostraDasOrdine(\'' + r.id + '\')">🚛</button><button class="btn-edit" title="Conferma ordine PDF" onclick="apriConfermaOrdine(\'' + r.id + '\')">📄</button><button class="btn-edit" onclick="apriModaleOrdine(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'ordini\',\'' + r.id + '\',caricaOrdini)">x</button></td></tr>';
}

// ── ORDINI DEL GIORNO (vista compatta) ──
async function caricaOrdiniGiorno() {
  mostraBacklogOrdini();
  var inp = document.getElementById('ordini-giorno-data');
  if (!inp.value) {
    // Default: ieri (locale, no timezone)
    var ieri = new Date(); ieri.setDate(ieri.getDate()-1);
    var y = ieri.getFullYear(), m = String(ieri.getMonth()+1).padStart(2,'0'), dd = String(ieri.getDate()).padStart(2,'0');
    inp.value = y + '-' + m + '-' + dd;
  }
  _labelGiorno('ordini-giorno-data');
  var data = inp.value;

  if (!navigator.onLine) {
    document.getElementById('tabella-ordini').innerHTML = '<tr><td colspan="14" class="loading" style="color:#D85A30">⚡ Sei offline</td></tr>';
    return;
  }
  await aggiornaSelezioniOrdine();
  const { data: ordini } = await sb.from('ordini').select('*, basi_carico(nome)').eq('data', data).order('created_at',{ascending:false});
  const tbody = document.getElementById('tabella-ordini');
  var countEl = document.getElementById('ordini-giorno-count');
  if (!ordini||!ordini.length) {
    tbody.innerHTML = '<tr><td colspan="14" class="loading">Nessun ordine per questa data</td></tr>';
    if (countEl) countEl.textContent = '0 ordini';
    return;
  }
  // Carica Set degli ordini che hanno DAS (qualsiasi tipo): blocca bottone annulla scarico/carico
  await _popolaOrdiniConDas(ordini.map(function(o){return o.id;}));
  // Patch v20260503r: costruisco mappa accoppiamento fattura per badge inline
  await _costruisciMappaAccoppiamenti(ordini);
  tbody.innerHTML = ordini.map(_renderRigaOrdine).join('');
  if (countEl) countEl.textContent = ordini.length + ' ordini';
}

// Popola il Set globale _ordiniConDas con gli ID degli ordini che hanno almeno un DAS.
// Controlla sia das_documenti (DAS generati dal sistema) sia documenti_ordine con tipo='das' (DAS caricati come allegato).
async function _popolaOrdiniConDas(ordineIds) {
  window._ordiniConDas = new Set();
  if (!ordineIds || !ordineIds.length) return;
  try {
    var { data: das1 } = await sb.from('das_documenti').select('ordine_id').in('ordine_id', ordineIds);
    (das1||[]).forEach(function(d){ if (d.ordine_id) window._ordiniConDas.add(d.ordine_id); });
    var { data: das2 } = await sb.from('documenti_ordine').select('ordine_id').in('ordine_id', ordineIds).eq('tipo', 'das');
    (das2||[]).forEach(function(d){ if (d.ordine_id) window._ordiniConDas.add(d.ordine_id); });
  } catch(e) {
    console.warn('_popolaOrdiniConDas:', e);
  }
}

function navigaOrdiniGiorno(dir) {
  var inp = document.getElementById('ordini-giorno-data');
  var d = new Date(inp.value + 'T12:00:00');
  d.setDate(d.getDate() + dir);
  var y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  inp.value = y + '-' + m + '-' + dd;
  caricaOrdiniGiorno();
}

// Alias per compatibilità (chiamato dopo salvataggio ordine, eliminazione, ecc.)
async function caricaOrdini() { await caricaOrdiniGiorno(); }

// ════════════════════════════════════════════════════════════════════
// ════════════════════════════════════════════════════════════════════
// DETTAGLIO MOVIMENTI GIORNALIERI (patch 30/04 i — rifatto stile periodo)
// Layout 3 colonne: Acquisti / Vendite / Riassunto, con tendine espandibili
// e vendite scomposte tra "da deposito" e "diretti fornitore".
// Patch v20260430n: rimossa la sentinella di protezione (non funzionava).
// ════════════════════════════════════════════════════════════════════

var _DM_PRODOTTI = ['Gasolio Autotrazione', 'Gasolio Agricolo', 'Benzina', 'HVO', 'AdBlue'];
var _DM_STATO = { dataCorrente: null, prodottoFiltrato: null, dati: null, expanded: {} };

function apriDettaglioMovimenti() {
  var inp = document.getElementById('ordini-giorno-data');
  if (!inp || !inp.value) return;
  document.getElementById('ordini-vista-tabella').style.display = 'none';
  document.getElementById('ordini-vista-movimenti').style.display = 'block';
  _DM_STATO.dataCorrente = inp.value;
  _DM_STATO.prodottoFiltrato = null;
  _DM_STATO.expanded = { acquisti_fornitori: true, vendite_clienti: true, vendite_deposito: true, vendite_diretti: true, stazione: false, autoconsumo: false };
  renderDettaglioMovimenti(inp.value);
}

function chiudiDettaglioMovimenti() {
  document.getElementById('ordini-vista-movimenti').style.display = 'none';
  document.getElementById('ordini-vista-tabella').style.display = 'block';
}

function navigaDettaglioMovimenti(dir) {
  var d = new Date(_DM_STATO.dataCorrente + 'T12:00:00');
  d.setDate(d.getDate() + dir);
  var y = d.getFullYear(), m = String(d.getMonth()+1).padStart(2,'0'), dd = String(d.getDate()).padStart(2,'0');
  _DM_STATO.dataCorrente = y + '-' + m + '-' + dd;
  document.getElementById('ordini-giorno-data').value = _DM_STATO.dataCorrente;
  renderDettaglioMovimenti(_DM_STATO.dataCorrente);
}

function vaiOggiDettaglioMovimenti() {
  var oggi = new Date();
  var y = oggi.getFullYear(), m = String(oggi.getMonth()+1).padStart(2,'0'), dd = String(oggi.getDate()).padStart(2,'0');
  _DM_STATO.dataCorrente = y + '-' + m + '-' + dd;
  document.getElementById('ordini-giorno-data').value = _DM_STATO.dataCorrente;
  renderDettaglioMovimenti(_DM_STATO.dataCorrente);
}

function _dmCambiaData(val) {
  if (!val) return;
  _DM_STATO.dataCorrente = val;
  document.getElementById('ordini-giorno-data').value = val;
  renderDettaglioMovimenti(val);
}

function _dmFiltraProdotto(prod) {
  _DM_STATO.prodottoFiltrato = (_DM_STATO.prodottoFiltrato === prod) ? null : prod;
  renderDettaglioMovimenti(_DM_STATO.dataCorrente);
}

function _dmToggleFold(key) {
  _DM_STATO.expanded[key] = !_DM_STATO.expanded[key];
  _dmRenderColonne();
}

async function renderDettaglioMovimenti(data) {
  _DM_STATO.dataCorrente = data;
  var cont = document.getElementById('ordini-vista-movimenti');
  if (!cont) return;
  cont.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted)">Caricamento dati...</div>';

  var [ordRes, rettRes] = await Promise.all([
    sb.from('ordini').select('*, basi_carico(nome)').eq('data', data).neq('stato', 'annullato'),
    sb.from('rettifiche_inventario').select('*').eq('data', data)
  ]);
  if (ordRes.error) { cont.innerHTML = '<div style="padding:24px;color:#E24B4A">Errore: ' + esc(ordRes.error.message) + '</div>'; return; }
  _DM_STATO.dati = { ordini: ordRes.data || [], rettifiche: (rettRes && rettRes.data) || [] };

  var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  var prodSel = _DM_STATO.prodottoFiltrato;

  var html = '';
  // Toolbar
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:10px;padding-bottom:12px">';
  html += '<div style="display:flex;align-items:flex-start;gap:10px">';
  html += '<button onclick="chiudiDettaglioMovimenti()" style="background:transparent;border:0.5px solid var(--border);border-radius:8px;padding:6px 11px;font-size:12px;cursor:pointer;color:var(--text-muted);margin-top:2px">← Indietro</button>';
  html += '<div><div style="font-size:14px;font-weight:600">📊 Dettaglio movimenti giornalieri</div><div style="font-size:11px;color:var(--text-muted);text-transform:capitalize;margin-top:2px">' + dataFmt + (prodSel ? ' · ' + esc(prodSel) : ' · Tutti i prodotti') + '</div></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:6px;align-items:center;flex-wrap:wrap">';
  html += '<button onclick="navigaDettaglioMovimenti(-1)" style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:14px">◀</button>';
  html += '<input type="date" value="' + data + '" onchange="_dmCambiaData(this.value)" style="font-size:12px;padding:5px 8px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text)" />';
  html += '<button onclick="navigaDettaglioMovimenti(1)" style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;width:32px;height:32px;cursor:pointer;font-size:14px">▶</button>';
  html += '<button onclick="vaiOggiDettaglioMovimenti()" style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:6px 12px;cursor:pointer;font-size:12px">Oggi</button>';
  html += '<button onclick="stampaDettaglioMovimenti(_DM_STATO.dataCorrente)" style="background:#534AB7;color:#fff;border:none;border-radius:8px;padding:6px 14px;cursor:pointer;font-size:12px">📄 PDF</button>';
  html += '</div></div>';

  // Box pillole prodotto
  html += '<div style="background:var(--bg-card);border:0.5px solid #BA7517;border-radius:8px;padding:11px 14px;margin-bottom:14px;text-align:center">';
  html += '<div style="font-size:9px;color:var(--text-muted);letter-spacing:0.5px;text-transform:uppercase;font-weight:500">Prodotti filtrati</div>';
  html += '<div style="font-size:13px;font-weight:500;margin:4px 0 8px">' + (prodSel ? esc(prodSel).toUpperCase() : 'TUTTI I PRODOTTI') + '</div>';
  html += '<div>';
  var dotColors = { 'Gasolio Autotrazione': '#BA7517', 'Benzina': '#1D9E75', 'Gasolio Agricolo': '#534AB7', 'HVO': '#639922', 'AdBlue': '#888780' };
  _DM_PRODOTTI.forEach(function(p) {
    var active = prodSel === p;
    var bg = active ? dotColors[p] : 'transparent';
    var color = active ? '#fff' : 'var(--text-muted)';
    var border = active ? dotColors[p] : 'var(--border)';
    html += '<button onclick="_dmFiltraProdotto(\'' + esc(p) + '\')" style="padding:5px 11px;font-size:11px;border-radius:14px;border:0.5px solid ' + border + ';cursor:pointer;background:' + bg + ';color:' + color + ';font-weight:500;margin:0 3px;display:inline-flex;align-items:center;gap:4px"><span style="width:6px;height:6px;border-radius:50%;background:' + dotColors[p] + '"></span>' + esc(p) + '</button>';
  });
  html += '</div></div>';

  // Layout 3 colonne (le riempirà _dmRenderColonne)
  html += '<div id="dm-layout" style="display:grid;grid-template-columns:1fr 1fr 280px;gap:12px;align-items:flex-start"></div>';

  cont.innerHTML = html;
  _dmRenderColonne();
}

// Calcola aggregati e popola le 3 colonne
function _dmRenderColonne() {
  if (!_DM_STATO.dati) return;
  var dati = _dmCalcolaAggregati();

  var html = '';
  // ── Colonna 1: ACQUISTI ──
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;padding:12px">';
  html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;padding-bottom:8px;border-bottom:0.5px solid var(--border);margin-bottom:10px;color:var(--text-secondary)">ACQUISTI</div>';
  html += _dmFold('acquisti_fornitori', 'Acquisti da fornitori', dati.acquisti.fornitori.length, dati.acquisti.totFornitori, dati.acquisti.fornitori, _dmRenderRowAcquisto);
  html += _dmFold('rientri_merce', 'Rientri merce', 0, 0, [], null);
  html += _dmFold('rettifiche_eccedenze', 'Rettifiche eccedenze', dati.rettifichePos.length, dati.totRettifichePos, dati.rettifichePos, _dmRenderRowRettifica);
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;margin-top:10px;border-top:0.5px solid var(--border)"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">TOTALE ACQUISTI</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600">' + _dmFmt(dati.acquisti.totale) + ' L</div></div>';
  html += '</div>';

  // ── Colonna 2: VENDITE ──
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;padding:12px">';
  html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;padding-bottom:8px;border-bottom:0.5px solid var(--border);margin-bottom:10px;color:var(--text-secondary)">VENDITE</div>';
  // Vendite a clienti con sottogruppi
  var totVC = dati.vendite.daDeposito.tot + dati.vendite.diretti.tot;
  var nVC = dati.vendite.daDeposito.righe.length + dati.vendite.diretti.righe.length;
  html += '<div style="padding:8px 10px;border-bottom:0.5px solid var(--border)">';
  html += '<div onclick="_dmToggleFold(\'vendite_clienti\')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer">';
  html += '<div style="font-size:12px;font-weight:500"><span style="font-size:10px;color:var(--text-muted);display:inline-block;' + (_DM_STATO.expanded.vendite_clienti ? 'transform:rotate(90deg);' : '') + '">▶</span> Vendite a clienti <span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--bg);color:var(--text-muted);margin-left:4px">' + nVC + '</span></div>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:500">' + _dmFmt(totVC) + ' L</div>';
  html += '</div>';
  if (_DM_STATO.expanded.vendite_clienti) {
    // Sottogruppo deposito
    html += '<div style="background:rgba(186,117,23,0.04);border-left:3px solid #BA7517;border-radius:0 4px 4px 0;padding:7px 10px;margin:6px 0">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:500;color:#8B6914;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px"><span>↳ Da deposito (PhoenixFuel) · ' + dati.vendite.daDeposito.righe.length + '</span><span style="font-family:var(--font-mono);color:var(--text)">' + _dmFmt(dati.vendite.daDeposito.tot) + ' L</span></div>';
    dati.vendite.daDeposito.righe.forEach(function(r) { html += _dmRenderRowVendita(r); });
    if (!dati.vendite.daDeposito.righe.length) html += '<div style="font-size:10px;color:var(--text-muted);font-style:italic;padding:4px">Nessuna vendita da deposito</div>';
    html += '</div>';
    // Sottogruppo diretti
    html += '<div style="background:rgba(29,158,117,0.04);border-left:3px solid #1D9E75;border-radius:0 4px 4px 0;padding:7px 10px;margin:6px 0">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;font-size:10px;font-weight:500;color:#1D5E47;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px"><span>↳ Diretti da fornitore · ' + dati.vendite.diretti.righe.length + '</span><span style="font-family:var(--font-mono);color:var(--text)">' + _dmFmt(dati.vendite.diretti.tot) + ' L</span></div>';
    dati.vendite.diretti.righe.forEach(function(r) { html += _dmRenderRowVendita(r); });
    if (!dati.vendite.diretti.righe.length) html += '<div style="font-size:10px;color:var(--text-muted);font-style:italic;padding:4px">Nessuna consegna diretta</div>';
    html += '</div>';
  }
  html += '</div>';
  // Stazione, autoconsumo, rettifiche
  html += _dmFold('stazione', 'Consegne a stazione Oppido', dati.stazione.righe.length, dati.stazione.tot, dati.stazione.righe, _dmRenderRowVendita);
  html += _dmFold('autoconsumo', 'Autoconsumo', dati.autoconsumo.righe.length, dati.autoconsumo.tot, dati.autoconsumo.righe, _dmRenderRowVendita);
  html += _dmFold('rettifiche_uscite', 'Rettifiche cali/ammanchi', dati.rettificheNeg.length, dati.totRettificheNeg, dati.rettificheNeg, _dmRenderRowRettifica);
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding-top:10px;margin-top:10px;border-top:0.5px solid var(--border)"><div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.4px">TOTALE VENDITE</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600">' + _dmFmt(dati.vendite.totale) + ' L</div></div>';
  html += '</div>';

  // ── Colonna 3: RIASSUNTO ──
  html += '<div style="background:var(--bg-card);border:0.5px solid var(--border);border-radius:8px;padding:12px">';
  html += '<div style="font-size:10px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;padding-bottom:8px;border-bottom:0.5px solid var(--border);margin-bottom:10px;color:var(--text-secondary)">RIASSUNTO GIORNATA</div>';
  html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:10px;margin-bottom:10px"><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;color:var(--text-muted)">Totale Acquisti</div><div style="font-family:var(--font-mono);font-size:17px;font-weight:700;margin-top:4px">' + _dmFmt(dati.acquisti.totale) + ' L</div></div>';
  html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:10px;margin-bottom:10px"><div style="font-size:9px;text-transform:uppercase;letter-spacing:0.5px;font-weight:600;color:var(--text-muted)">Totale Vendite</div><div style="font-family:var(--font-mono);font-size:17px;font-weight:700;margin-top:4px">' + _dmFmt(dati.vendite.totale) + ' L</div></div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 6px;border-bottom:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary)">Vendite a clienti</div><div style="font-family:var(--font-mono);font-size:12px;font-weight:500">' + _dmFmt(totVC) + ' L</div></div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 6px 7px 22px;background:rgba(0,0,0,0.02);border-bottom:0.5px solid var(--border);border-left:2px solid #BA7517"><div style="font-size:10px;color:var(--text-muted)">↳ da deposito</div><div style="font-family:var(--font-mono);font-size:12px;font-weight:500">' + _dmFmt(dati.vendite.daDeposito.tot) + ' L</div></div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 6px 7px 22px;background:rgba(0,0,0,0.02);border-bottom:0.5px solid var(--border);border-left:2px solid #1D9E75"><div style="font-size:10px;color:var(--text-muted)">↳ diretti fornitore</div><div style="font-family:var(--font-mono);font-size:12px;font-weight:500">' + _dmFmt(dati.vendite.diretti.tot) + ' L</div></div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 6px;border-bottom:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary)">Consegne stazione</div><div style="font-family:var(--font-mono);font-size:12px;font-weight:500">' + _dmFmt(dati.stazione.tot) + ' L</div></div>';
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 6px;border-bottom:0.5px solid var(--border)"><div style="font-size:11px;color:var(--text-secondary)">Autoconsumo</div><div style="font-family:var(--font-mono);font-size:12px;font-weight:500">' + _dmFmt(dati.autoconsumo.tot) + ' L</div></div>';
  var rettNetto = dati.totRettifichePos - dati.totRettificheNeg;
  html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:7px 6px"><div style="font-size:11px;color:var(--text-secondary)">Rettifiche (netto)</div><div style="font-family:var(--font-mono);font-size:12px;font-weight:500">' + (rettNetto >= 0 ? '+' : '') + _dmFmt(rettNetto) + ' L</div></div>';
  // Saldo deposito
  var saldoDep = dati.acquisti.totale - dati.vendite.daDeposito.tot - dati.stazione.tot - dati.autoconsumo.tot + rettNetto;
  var saldoCol = saldoDep >= 0 ? '#173404' : '#791F1F';
  var saldoBg = saldoDep >= 0 ? 'rgba(99,153,34,0.10)' : 'rgba(226,75,74,0.08)';
  var saldoBor = saldoDep >= 0 ? 'rgba(99,153,34,0.30)' : 'rgba(226,75,74,0.30)';
  html += '<div style="background:' + saldoBg + ';border:0.5px solid ' + saldoBor + ';border-radius:6px;padding:10px;margin-top:10px"><div style="font-size:9px;color:' + saldoCol + ';text-transform:uppercase;letter-spacing:0.5px;font-weight:600">Saldo deposito (impatta cisterne)</div><div style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:' + saldoCol + ';margin-top:4px">' + (saldoDep >= 0 ? '+' : '') + _dmFmt(saldoDep) + ' L</div><div style="font-size:9px;color:var(--text-muted);margin-top:4px;font-style:italic">esclude vendite dirette fornitore</div></div>';
  html += '</div>';

  document.getElementById('dm-layout').innerHTML = html;
}

// Helper render fold generico
function _dmFold(key, titolo, count, totale, righe, renderRowFn) {
  var open = !!_DM_STATO.expanded[key];
  var html = '<div style="padding:8px 10px;border-bottom:0.5px solid var(--border)">';
  html += '<div onclick="_dmToggleFold(\'' + key + '\')" style="display:flex;justify-content:space-between;align-items:center;cursor:pointer">';
  html += '<div style="font-size:12px;font-weight:500"><span style="font-size:10px;color:var(--text-muted);display:inline-block;' + (open ? 'transform:rotate(90deg);' : '') + '">▶</span> ' + esc(titolo) + ' <span style="font-size:9px;padding:1px 6px;border-radius:8px;background:var(--bg);color:var(--text-muted);margin-left:4px">' + count + '</span></div>';
  html += '<div style="font-family:var(--font-mono);font-size:12px;font-weight:500">' + _dmFmt(totale) + ' L</div>';
  html += '</div>';
  if (open && righe && righe.length && renderRowFn) {
    html += '<div style="padding:6px 0 4px 6px">';
    righe.forEach(function(r) { html += renderRowFn(r); });
    html += '</div>';
  }
  html += '</div>';
  return html;
}

function _dmRenderRowAcquisto(r) {
  var base = r.basi_carico && r.basi_carico.nome ? r.basi_carico.nome : '';
  return '<div style="display:grid;grid-template-columns:78px 1fr 90px;gap:6px;padding:4px 4px;border-bottom:0.5px dashed var(--border);align-items:baseline"><div style="color:var(--text-muted);font-size:10px">' + _dmFmtData(r.data) + '</div><div style="font-size:11px">' + esc(r.fornitore || '') + (base ? ' <small style="color:var(--text-muted);font-size:9px">· ' + esc(base) + '</small>' : '') + '</div><div style="text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:500">' + _dmFmt(r.litri) + ' L</div></div>';
}

function _dmRenderRowVendita(r) {
  return '<div style="display:grid;grid-template-columns:78px 1fr 90px;gap:6px;padding:4px 4px;border-bottom:0.5px dashed var(--border);align-items:baseline"><div style="color:var(--text-muted);font-size:10px">' + _dmFmtData(r.data) + '</div><div style="font-size:11px">' + esc(r.cliente || '—') + ' <small style="color:var(--text-muted);font-size:9px">· ' + esc(r.fornitore || '') + '</small></div><div style="text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:500">' + _dmFmt(r.litri) + ' L</div></div>';
}

function _dmRenderRowRettifica(r) {
  return '<div style="display:grid;grid-template-columns:78px 1fr 90px;gap:6px;padding:4px 4px;border-bottom:0.5px dashed var(--border);align-items:baseline"><div style="color:var(--text-muted);font-size:10px">' + _dmFmtData(r.data) + '</div><div style="font-size:11px">' + esc(r.prodotto || '') + ' <small style="color:var(--text-muted);font-size:9px">' + esc(r.motivo || r.note || 'rettifica') + '</small></div><div style="text-align:right;font-family:var(--font-mono);font-size:11px;font-weight:500">' + _dmFmt(Math.abs(Number(r.litri || 0))) + ' L</div></div>';
}

function _dmFmt(n) { return Number(n || 0).toLocaleString('it-IT', {maximumFractionDigits:0}); }
function _dmFmtData(d) { if (!d) return ''; var dt = new Date(d + 'T12:00:00'); return dt.toLocaleDateString('it-IT', {day:'2-digit',month:'2-digit',year:'numeric'}); }

// Calcola aggregati: applica filtro prodotto se attivo, classifica ordini, somma rettifiche.
function _dmCalcolaAggregati() {
  var ord = _DM_STATO.dati.ordini;
  var rett = _DM_STATO.dati.rettifiche;
  var filtroProd = _DM_STATO.prodottoFiltrato;
  if (filtroProd) {
    ord = ord.filter(function(o) { return o.prodotto === filtroProd; });
    rett = rett.filter(function(r) { return r.prodotto === filtroProd; });
  }
  var acquistiFornitori = ord.filter(function(o) { return o.tipo_ordine === 'entrata_deposito'; });
  var venditeDaDep = ord.filter(function(o) { return o.tipo_ordine === 'cliente' && (o.fornitore || '').toLowerCase().indexOf('phoenix') >= 0; });
  var venditeDiretti = ord.filter(function(o) { return o.tipo_ordine === 'cliente' && (o.fornitore || '').toLowerCase().indexOf('phoenix') < 0; });
  var staz = ord.filter(function(o) { return o.tipo_ordine === 'stazione_servizio' && (o.fornitore || '').toLowerCase().indexOf('phoenix') >= 0; });
  var autoc = ord.filter(function(o) { return o.tipo_ordine === 'autoconsumo'; });
  var rettPos = rett.filter(function(r) { return Number(r.litri || 0) > 0; });
  var rettNeg = rett.filter(function(r) { return Number(r.litri || 0) < 0; });
  function sumLitri(arr) { return arr.reduce(function(s, x) { return s + Number(x.litri || 0); }, 0); }
  function sumAbs(arr) { return arr.reduce(function(s, x) { return s + Math.abs(Number(x.litri || 0)); }, 0); }
  var totFornitori = sumLitri(acquistiFornitori);
  var totRettPos = sumAbs(rettPos);
  var totVenditeDep = sumLitri(venditeDaDep);
  var totVenditeDir = sumLitri(venditeDiretti);
  var totStaz = sumLitri(staz);
  var totAutoc = sumLitri(autoc);
  var totRettNeg = sumAbs(rettNeg);
  return {
    acquisti: { fornitori: acquistiFornitori, totFornitori: totFornitori, totale: totFornitori + totRettPos },
    vendite: { daDeposito: { righe: venditeDaDep, tot: totVenditeDep }, diretti: { righe: venditeDiretti, tot: totVenditeDir }, totale: totVenditeDep + totVenditeDir + totStaz + totAutoc + totRettNeg },
    stazione: { righe: staz, tot: totStaz },
    autoconsumo: { righe: autoc, tot: totAutoc },
    rettifichePos: rettPos, totRettifichePos: totRettPos,
    rettificheNeg: rettNeg, totRettificheNeg: totRettNeg
  };
}

// SENTINELLA RIMOSSA in v20260430n: le funzioni _dmEseguiSentinella e
// _dmMostraAllertaSentinella sono state cancellate. Il modulo Dettaglio
// movimenti mostra solo aggregati di ordini/rettifiche.

function stampaDettaglioMovimenti(data) {
  var w = (typeof _apriReport === 'function') ? _apriReport('Dettaglio movimenti ' + data) : null;
  if (!w) return;
  var cont = document.getElementById('ordini-vista-movimenti');
  if (!cont) return;
  var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric' });
  var clone = cont.cloneNode(true);
  // Rimuovi toolbar e pillole
  clone.querySelectorAll('button').forEach(function(b){ b.remove(); });
  clone.querySelectorAll('input').forEach(function(b){ b.remove(); });
  w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Dettaglio movimenti ' + data + '</title>');
  w.document.write('<style>body{font-family:Arial,sans-serif;padding:18px;color:#1a1a18;font-size:11px}h1{font-size:16px;margin:0 0 4px}@media print{button{display:none!important}}</style>');
  w.document.write('</head><body>');
  w.document.write('<h1>📊 Dettaglio movimenti giornalieri</h1>');
  w.document.write('<div style="font-size:11px;color:#666;text-transform:capitalize;margin-bottom:14px">' + dataFmt + '</div>');
  w.document.write(clone.innerHTML);
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(function() { w.print(); }, 600);
}

// ── STORICO ORDINI (espandibile con filtri) ──
function toggleStoricoOrdini() {
  var body = document.getElementById('storico-ordini-body');
  var toggle = document.getElementById('storico-ordini-toggle');
  if (body.style.display === 'none') {
    body.style.display = '';
    toggle.textContent = '▲ Chiudi';
    _initAnnoStorico();
  } else {
    body.style.display = 'none';
    toggle.textContent = '▼ Espandi';
  }
}

async function caricaStoricoOrdini() {
  var da = document.getElementById('filtro-da-ordini').value;
  var a = document.getElementById('filtro-a-ordini').value;
  var tbody = document.getElementById('tabella-storico-ordini');
  if (!da && !a) {
    // Default: ultimo mese
    var oggi = new Date();
    var meseFA = new Date(oggi); meseFA.setMonth(meseFA.getMonth()-1);
    da = meseFA.toISOString().split('T')[0];
    a = oggi.toISOString().split('T')[0];
    document.getElementById('filtro-da-ordini').value = da;
    document.getElementById('filtro-a-ordini').value = a;
  }
  tbody.innerHTML = '<tr><td colspan="14" class="loading">Caricamento...</td></tr>';
  var q = sb.from('ordini').select('*, basi_carico(nome), carico_ordini(carichi(trasportatori(nome)))').order('data',{ascending:false}).order('created_at',{ascending:false});
  if (da) q = q.gte('data', da);
  if (a) q = q.lte('data', a);
  q = q.limit(1000);
  const { data: ordini } = await q;
  if (!ordini||!ordini.length) { tbody.innerHTML = '<tr><td colspan="14" class="loading">Nessun ordine nel periodo</td></tr>'; return; }
  window._storicoOrdiniData = ordini;
  _renderStoricoFiltrato();
}

function _renderStoricoFiltrato() {
  var ordini = window._storicoOrdiniData || [];
  var qTxt = (document.getElementById('search-ordini').value||'').toLowerCase();
  var prodotto = document.getElementById('filtro-prodotto-ordini').value;
  var stato = document.getElementById('filtro-stato-ordini').value;
  var tipoFiltro = document.getElementById('filtro-tipo-ordini').value;

  var filtrati = ordini.filter(function(r) {
    if (qTxt && (r.cliente||'').toLowerCase().indexOf(qTxt) < 0) return false;
    if (prodotto && r.prodotto !== prodotto) return false;
    if (stato && r.stato !== stato) return false;
    if (tipoFiltro && r.tipo_ordine !== tipoFiltro) return false;
    return true;
  });

  var tbody = document.getElementById('tabella-storico-ordini');
  if (!filtrati.length) { tbody.innerHTML = '<tr><td colspan="14" class="loading">Nessun ordine con questi filtri</td></tr>'; return; }
  // Popola cache DAS per bloccare bottone annulla scarico/carico sui già processati
  _popolaOrdiniConDas(filtrati.map(function(o){return o.id;})).then(async function() {
    // Patch v20260503r: costruisco mappa accoppiamento fattura per badge inline
    await _costruisciMappaAccoppiamenti(filtrati);
    tbody.innerHTML = filtrati.map(_renderRigaOrdine).join('');
  });
}

function filtraOrdiniStorico() { _renderStoricoFiltrato(); }

// ── Filtro mese/anno storico ──
function _setMeseAnnoStorico() {
  var anno = document.getElementById('filtro-anno-ordini').value;
  var mese = document.getElementById('filtro-mese-ordini').value;
  if (anno && mese) {
    var ultimo = new Date(parseInt(anno), parseInt(mese), 0).getDate();
    document.getElementById('filtro-da-ordini').value = anno + '-' + mese + '-01';
    document.getElementById('filtro-a-ordini').value = anno + '-' + mese + '-' + String(ultimo).padStart(2,'0');
    caricaStoricoOrdini();
  } else if (anno) {
    document.getElementById('filtro-da-ordini').value = anno + '-01-01';
    document.getElementById('filtro-a-ordini').value = anno + '-12-31';
    caricaStoricoOrdini();
  }
}

function _initAnnoStorico() {
  var sel = document.getElementById('filtro-anno-ordini');
  if (!sel || sel.options.length > 1) return;
  var ac = new Date().getFullYear();
  for (var y = ac; y >= ac - 5; y--) sel.innerHTML += '<option value="' + y + '">' + y + '</option>';
}

// ── STAMPA ORDINI DEL GIORNO ──
async function stampaOrdiniGiorno() {
  var w = _apriReport("Ordini del giorno"); if (!w) return;
  var data = document.getElementById('ordini-giorno-data').value;
  if (!data) { toast('Seleziona una data'); return; }
  var { data: ordini } = await sb.from('ordini').select('*, basi_carico(nome), carico_ordini(carichi(trasportatori(nome)))').eq('data', data).order('created_at',{ascending:false});
  if (!ordini || !ordini.length) { toast('Nessun ordine per questa data'); return; }
  var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  _stampaReportOrdini(w, ordini, 'Ordini del giorno', dataFmt);
}

// ── STAMPA STORICO ORDINI ──
function stampaStoricoOrdini() {
  var w = _apriReport("Storico ordini"); if (!w) return;
  var ordini = window._storicoOrdiniData || [];
  if (!ordini.length) { toast('Nessun ordine da stampare — esegui prima una ricerca'); return; }
  // Applica filtri attivi
  var qTxt = (document.getElementById('search-ordini').value||'').toLowerCase();
  var prodotto = document.getElementById('filtro-prodotto-ordini').value;
  var stato = document.getElementById('filtro-stato-ordini').value;
  var tipoFiltro = document.getElementById('filtro-tipo-ordini').value;
  var filtrati = ordini.filter(function(r) {
    if (qTxt && (r.cliente||'').toLowerCase().indexOf(qTxt) < 0) return false;
    if (prodotto && r.prodotto !== prodotto) return false;
    if (stato && r.stato !== stato) return false;
    if (tipoFiltro && r.tipo_ordine !== tipoFiltro) return false;
    return true;
  });
  if (!filtrati.length) { toast('Nessun ordine con i filtri attivi'); return; }
  var da = document.getElementById('filtro-da-ordini').value;
  var a = document.getElementById('filtro-a-ordini').value;
  var periodoFmt = 'Dal ' + new Date(da+'T12:00:00').toLocaleDateString('it-IT') + ' al ' + new Date(a+'T12:00:00').toLocaleDateString('it-IT');
  _stampaReportOrdini(w, filtrati, 'Storico ordini', periodoFmt);
}

// ── Report PDF ordini (comune) ──
function _vettoreDaOrdine(r) {
  if (!r || !r.carico_ordini || !r.carico_ordini.length) return 'Non assegnato';
  var co = r.carico_ordini[0];
  if (!co || !co.carichi) return 'Non assegnato';
  var t = co.carichi.trasportatori;
  if (!t || !t.nome) return 'Mezzo proprio';
  return t.nome;
}

function _stampaReportOrdini(w, ordini, titolo, periodo) {
  var totLitri = 0, totNetto = 0, totIva = 0;
  var righe = '';
  ordini.forEach(function(r) {
    var pNettoL = prezzoNoIva(r);
    var pIvaL = prezzoConIva(r);
    var litri = Number(r.litri);
    var rigaNetto = pNettoL * litri;
    var rigaIva = pIvaL * litri;
    totLitri += litri; totNetto += rigaNetto; totIva += rigaIva;
    var vettore = _vettoreDaOrdine(r);
    var dataFmt = r.data ? new Date(r.data + 'T12:00:00').toLocaleDateString('it-IT') : '—';
    var dest = r.destinazione ? '<div style="font-size:13px;color:#555;margin-top:2px">📍 ' + esc(r.destinazione) + '</div>' : '';
    righe += '<tr>' +
      '<td style="padding:7px 6px;border:1px solid #ddd;text-align:center">' + dataFmt + '</td>' +
      '<td style="padding:7px 6px;border:1px solid #ddd"><div style="font-weight:700;font-size:14px">' + esc(r.cliente||r.fornitore||'—') + '</div>' + dest + '</td>' +
      '<td style="padding:7px 6px;border:1px solid #ddd">' + esc(r.prodotto) + '</td>' +
      '<td style="padding:7px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(litri) + '</td>' +
      '<td style="padding:7px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:700">' + fmt(pNettoL) + '</td>' +
      '<td style="padding:7px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(rigaNetto) + '</td>' +
      '<td style="padding:7px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(rigaIva) + '</td>' +
      '<td style="padding:7px 6px;border:1px solid #ddd">' + esc(vettore) + '</td>' +
      '<td style="padding:7px 6px;border:1px solid #ddd">' + esc(r.fornitore||'—') + '</td>' +
      '</tr>';
  });
  righe += '<tr style="border-top:3px solid #D4A017;font-weight:700;background:#FDF3D0">' +
    '<td style="padding:9px 6px;border:1px solid #ddd" colspan="3">TOTALE — ' + ordini.length + ' ordini</td>' +
    '<td style="padding:9px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td>' +
    '<td style="padding:9px 6px;border:1px solid #ddd"></td>' +
    '<td style="padding:9px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totNetto) + '</td>' +
    '<td style="padding:9px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totIva) + '</td>' +
    '<td style="padding:9px 6px;border:1px solid #ddd" colspan="2"></td>' +
    '</tr>';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>' + titolo + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:13px;margin:0;padding:10mm;color:#222}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:12px}table{font-size:11px}th,td{padding:5px 3px!important}}' +
    'table{width:100%;border-collapse:collapse;font-size:13px}' +
    'th{background:#D4A017;color:#fff;padding:8px 6px;font-size:11px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #BA7517;text-align:center}' +
    '</style></head><body>';

  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #D4A017;padding-bottom:12px;margin-bottom:12px">';
  html += '<div><div style="font-size:22px;font-weight:700;color:#D4A017;letter-spacing:0.5px">' + titolo.toUpperCase() + '</div>';
  html += '<div style="font-size:14px;color:#666;margin-top:3px">' + periodo + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:17px;font-weight:700;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:11px;color:#666">Generato: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<div style="display:flex;gap:12px;margin-bottom:14px">';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:10px 20px;text-align:center"><div style="font-size:10px;color:#633806;text-transform:uppercase">Ordini</div><div style="font-size:22px;font-weight:700;font-family:Courier New,monospace">' + ordini.length + '</div></div>';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:10px 20px;text-align:center"><div style="font-size:10px;color:#633806;text-transform:uppercase">Litri totali</div><div style="font-size:22px;font-weight:700;font-family:Courier New,monospace">' + fmtL(totLitri) + '</div></div>';
  html += '<div style="background:#EAF3DE;border:1px solid #639922;border-radius:6px;padding:10px 20px;text-align:center"><div style="font-size:10px;color:#27500A;text-transform:uppercase">Totale netto</div><div style="font-size:22px;font-weight:700;font-family:Courier New,monospace;color:#27500A">' + fmtE(totNetto) + '</div></div>';
  html += '</div>';

  html += '<table><thead><tr><th>Data cons.</th><th style="text-align:left">Cliente / destinazione</th><th>Prodotto</th><th>Litri</th><th>Prezzo €/L netto</th><th>Totale netto</th><th>Totale con IVA</th><th>Vettore</th><th>Fornitore</th></tr></thead><tbody>';
  html += righe + '</tbody></table>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D4A017;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

// ── REPORT ORDINI DEL GIORNO RAGGRUPPATO PER PRODOTTO (verticale) ──
async function stampaOrdiniGiornoPerProdotto() {
  var data = document.getElementById('ordini-giorno-data').value || oggiISO;
  if (!data) { toast('Seleziona una data'); return; }
  var w = _apriReport("Ordini " + data); if (!w) return;

  var { data: ordini } = await sb.from('ordini').select('*, basi_carico(nome)').eq('data', data).neq('stato','annullato').order('cliente');
  if (!ordini || !ordini.length) { toast('Nessun ordine per ' + data); w.close(); return; }

  var PRODOTTI_ORDINE = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO'];
  var perProdotto = {};
  ordini.forEach(function(o) {
    var p = o.prodotto || 'Altro';
    if (!perProdotto[p]) perProdotto[p] = [];
    perProdotto[p].push(o);
  });

  // Ordina per sequenza definita
  var prodottiOrdinati = [];
  PRODOTTI_ORDINE.forEach(function(p) { if (perProdotto[p]) prodottiOrdinati.push(p); });
  Object.keys(perProdotto).forEach(function(p) { if (prodottiOrdinati.indexOf(p) < 0) prodottiOrdinati.push(p); });

  var dataFmt = new Date(data + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  var GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  var giorno = GIORNI[new Date(data + 'T12:00:00').getDay()];

  var totGeneraleLitri = 0, totGeneraleFatt = 0, totGeneraleMarg = 0;
  ordini.forEach(function(o) {
    totGeneraleLitri += Number(o.litri);
    totGeneraleFatt += prezzoConIva(o) * Number(o.litri);
    totGeneraleMarg += Number(o.margine) * Number(o.litri);
  });

  var coloriProdotto = { 'Gasolio Autotrazione':'#BA7517', 'Benzina':'#378ADD', 'Gasolio Agricolo':'#639922', 'HVO':'#6B5FCC' };

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ordini ' + data + '</title>';
  html += '<style>';
  html += 'body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm;color:#1a1a18}';
  html += '@media print{.no-print{display:none!important}@page{size:portrait;margin:10mm}.product-section{page-break-inside:avoid}}';
  html += 'table{width:100%;border-collapse:collapse;margin-bottom:6px}';
  html += 'th{padding:5px 6px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #ddd;text-align:center}';
  html += 'td{padding:5px 6px;border:1px solid #ddd;font-size:10px}';
  html += '.m{font-family:Courier New,monospace;text-align:right}';
  html += '.kpi{display:inline-block;border-radius:6px;padding:8px 16px;text-align:center;margin-right:8px;margin-bottom:6px}';
  html += '</style></head><body>';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #D4A017;padding-bottom:8px;margin-bottom:12px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#D4A017">ORDINI DEL GIORNO</div>';
  html += '<div style="font-size:14px;color:#333;margin-top:3px;font-weight:500">' + giorno + ' ' + new Date(data + 'T12:00:00').getDate() + ' ' + dataFmt.split(' ').slice(2).join(' ') + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:15px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:9px;color:#666">Vibo Valentia — Calabria</div>';
  html += '<div style="font-size:9px;color:#666">Stampato: ' + new Date().toLocaleDateString('it-IT') + ' ' + new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) + '</div></div></div>';

  // KPI generali
  html += '<div style="margin-bottom:14px">';
  html += '<div class="kpi" style="background:#FDF3D0;border:1px solid #D4A017"><div style="font-size:8px;color:#633806;text-transform:uppercase">Ordini totali</div><div style="font-size:20px;font-weight:bold">' + ordini.length + '</div></div>';
  html += '<div class="kpi" style="background:#FDF3D0;border:1px solid #D4A017"><div style="font-size:8px;color:#633806;text-transform:uppercase">Litri totali</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(totGeneraleLitri) + '</div></div>';
  html += '<div class="kpi" style="background:#EAF3DE;border:1px solid #639922"><div style="font-size:8px;color:#27500A;text-transform:uppercase">Fatturato IVA incl.</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">' + fmtE(totGeneraleFatt) + '</div></div>';
  html += '<div class="kpi" style="background:#EAF3DE;border:1px solid #639922"><div style="font-size:8px;color:#27500A;text-transform:uppercase">Margine totale</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace;color:#639922">' + fmtE(totGeneraleMarg) + '</div></div>';
  html += '</div>';

  // Sezioni per prodotto
  prodottiOrdinati.forEach(function(prodotto) {
    var lista = perProdotto[prodotto];
    var col = coloriProdotto[prodotto] || '#888';
    var totLitri = 0, totFatt = 0, totMarg = 0;
    lista.forEach(function(o) {
      totLitri += Number(o.litri);
      totFatt += prezzoConIva(o) * Number(o.litri);
      totMarg += Number(o.margine) * Number(o.litri);
    });

    html += '<div class="product-section" style="margin-bottom:16px">';
    html += '<div style="display:flex;align-items:center;gap:8px;border-bottom:2px solid ' + col + ';padding-bottom:4px;margin-bottom:6px">';
    html += '<div style="width:12px;height:12px;border-radius:50%;background:' + col + '"></div>';
    html += '<div style="font-size:14px;font-weight:bold;color:' + col + ';text-transform:uppercase">' + prodotto + '</div>';
    html += '<div style="margin-left:auto;font-size:11px;color:#666">' + lista.length + ' ordini · <strong style="font-family:Courier New,monospace">' + fmtL(totLitri) + '</strong> · Margine: <strong style="font-family:Courier New,monospace;color:#639922">' + fmtE(totMarg) + '</strong></div>';
    html += '</div>';

    html += '<table><thead><tr style="background:' + col + '15">';
    html += '<th style="width:24px;color:' + col + '">#</th>';
    html += '<th style="text-align:left;color:' + col + '">Cliente</th>';
    html += '<th style="text-align:left;color:' + col + '">Destinazione</th>';
    html += '<th style="color:' + col + '">Litri</th>';
    html += '<th style="color:' + col + '">Costo/L</th>';
    html += '<th style="color:' + col + '">Trasp/L</th>';
    html += '<th style="color:' + col + '">Margine/L</th>';
    html += '<th style="color:' + col + '">Prezzo netto</th>';
    html += '<th style="color:' + col + '">Prezzo IVA</th>';
    html += '<th style="color:' + col + '">Totale IVA</th>';
    html += '<th style="color:' + col + '">Fornitore</th>';
    html += '</tr></thead><tbody>';

    lista.forEach(function(o, i) {
      var pL = prezzoConIva(o);
      var pNetto = Number(o.costo_litro) + Number(o.trasporto_litro||0) + Number(o.margine);
      var tot = pL * Number(o.litri);
      var dest = o.destinazione || '—';
      html += '<tr' + (i % 2 ? ' style="background:#fafaf5"' : '') + '>';
      html += '<td style="text-align:center;color:#999">' + (i+1) + '</td>';
      html += '<td style="font-weight:500">' + esc(o.cliente||o.fornitore||'—') + '</td>';
      html += '<td style="font-size:9px;color:#555">' + esc(dest) + '</td>';
      html += '<td class="m" style="font-weight:600">' + fmtL(o.litri) + '</td>';
      html += '<td class="m">' + fmt(o.costo_litro) + '</td>';
      html += '<td class="m">' + fmt(o.trasporto_litro) + '</td>';
      html += '<td class="m" style="color:#639922">' + fmtM(o.margine) + '</td>';
      html += '<td class="m">' + fmt(pNetto) + '</td>';
      html += '<td class="m" style="font-weight:600">' + fmt(pL) + '</td>';
      html += '<td class="m" style="font-weight:600">' + fmtE(tot) + '</td>';
      html += '<td style="font-size:9px">' + esc(o.fornitore||'—') + '</td>';
      html += '</tr>';
    });

    // Riga totale prodotto
    html += '<tr style="border-top:2px solid ' + col + ';font-weight:bold;background:' + col + '10">';
    html += '<td colspan="3" style="padding:6px;border:1px solid #ddd">Totale ' + prodotto + ' — ' + lista.length + ' ordini</td>';
    html += '<td class="m" style="padding:6px;border:1px solid #ddd;font-size:12px">' + fmtL(totLitri) + '</td>';
    html += '<td colspan="5" style="border:1px solid #ddd"></td>';
    html += '<td class="m" style="padding:6px;border:1px solid #ddd;font-size:12px">' + fmtE(totFatt) + '</td>';
    html += '<td style="border:1px solid #ddd"></td>';
    html += '</tr></tbody></table></div>';
  });

  // Footer totale generale
  html += '<div style="border-top:3px solid #D4A017;padding-top:8px;margin-top:12px;display:flex;justify-content:space-between;align-items:center">';
  html += '<div style="font-size:13px;font-weight:bold">TOTALE GENERALE: ' + ordini.length + ' ordini — ' + fmtL(totGeneraleLitri) + '</div>';
  html += '<div style="font-size:13px;font-weight:bold;color:#639922">Margine: ' + fmtE(totGeneraleMarg) + '</div>';
  html += '</div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D4A017;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

// ── STAMPA LISTINO PREZZI FORNITORI DEL GIORNO ──
async function stampaListinoPrezziGiorno() {
  var data = document.getElementById('filtro-data-prezzi').value || oggiISO;
  if (!data) { toast('Seleziona una data'); return; }
  var w = _apriReport("Listino prezzi " + data); if (!w) return;

  var [prezziRes, cisterneRes, baseDepRes] = await Promise.all([
    sb.from('prezzi').select('*, basi_carico(nome)').eq('data', data).order('fornitore'),
    sb.from('cisterne').select('*').eq('sede','deposito_vibo'),
    sb.from('basi_carico').select('*').ilike('nome','%phoenix%').maybeSingle()
  ]);

  var prezzi = prezziRes.data || [];

  // Aggiungi PhoenixFuel deposito
  var cisterne = cisterneRes.data || [];
  var baseDeposito = baseDepRes.data;
  if (cisterne.length && baseDeposito) {
    var prodottiDep = {};
    cisterne.forEach(function(c) { if (c.prodotto) { if (!prodottiDep[c.prodotto]) prodottiDep[c.prodotto] = { litri:0, valTot:0 }; prodottiDep[c.prodotto].litri += Number(c.livello_attuale||0); prodottiDep[c.prodotto].valTot += Number(c.livello_attuale||0) * Number(c.costo_medio||0); } });
    // Loop async per leggere CMP storico alla data del listino
    var prodKeys = Object.keys(prodottiDep);
    for (var pi = 0; pi < prodKeys.length; pi++) {
      var prod = prodKeys[pi];
      var d = prodottiDep[prod];
      if (d.litri > 0) {
        // CMP storico alla data del listino (con fallback al calcolato)
        var cmp;
        if (typeof _cmpStoricoAllaData === 'function') {
          cmp = await _cmpStoricoAllaData(prod, 'deposito_vibo', data);
          if (!cmp || cmp === 0) cmp = d.valTot / d.litri;
        } else {
          cmp = d.valTot / d.litri;
        }
        var prodInfo = cacheProdotti.find(function(p) { return p.nome === prod; });
        var ovr = (typeof _depositoOverrides !== 'undefined' ? _depositoOverrides[prod] : null) || {};
        prezzi.push({ fornitore:'PhoenixFuel (Deposito)', basi_carico:{nome:baseDeposito.nome}, prodotto:prod, costo_litro:cmp, trasporto_litro:ovr.trasporto||0, margine:ovr.margine||0, iva:prodInfo?prodInfo.iva_default:22, _giacenza:Math.round(d.litri), _isDeposito:true });
      }
    }
  }

  if (!prezzi.length) { toast('Nessun prezzo per ' + data); w.close(); return; }

  var PRODOTTI_ORDINE = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO'];
  var coloriProdotto = { 'Gasolio Autotrazione':'#BA7517', 'Benzina':'#378ADD', 'Gasolio Agricolo':'#639922', 'HVO':'#6B5FCC' };
  var perProdotto = {};
  prezzi.forEach(function(p) {
    var prod = p.prodotto || 'Altro';
    if (!perProdotto[prod]) perProdotto[prod] = [];
    perProdotto[prod].push(p);
  });

  var prodottiOrdinati = [];
  PRODOTTI_ORDINE.forEach(function(p) { if (perProdotto[p]) prodottiOrdinati.push(p); });
  Object.keys(perProdotto).forEach(function(p) { if (prodottiOrdinati.indexOf(p) < 0) prodottiOrdinati.push(p); });

  var GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  var MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var dt = new Date(data + 'T12:00:00');
  var dataFmt = GIORNI[dt.getDay()] + ' ' + dt.getDate() + ' ' + MESI[dt.getMonth()] + ' ' + dt.getFullYear();

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Listino prezzi ' + data + '</title>';
  html += '<style>';
  html += 'body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:14mm;color:#1a1a18}';
  html += '@media print{.no-print{display:none!important}@page{size:portrait;margin:10mm}.product-section{page-break-inside:avoid}}';
  html += 'table{width:100%;border-collapse:collapse;margin-bottom:8px}';
  html += 'th{padding:8px 10px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #ddd;text-align:center}';
  html += 'td{padding:8px 10px;border:1px solid #ddd}';
  html += '.m{font-family:Courier New,monospace;text-align:right}';
  html += '</style></head><body>';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #D4A017;padding-bottom:10px;margin-bottom:16px">';
  html += '<div><div style="font-size:22px;font-weight:bold;color:#D4A017">LISTINO PREZZI GIORNALIERO</div>';
  html += '<div style="font-size:15px;color:#333;margin-top:4px;font-weight:500">' + dataFmt + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:9px;color:#666">Vibo Valentia — Calabria</div>';
  html += '<div style="font-size:9px;color:#666">Stampato: ' + new Date().toLocaleDateString('it-IT') + ' ' + new Date().toLocaleTimeString('it-IT',{hour:'2-digit',minute:'2-digit'}) + '</div></div></div>';

  // KPI
  html += '<div style="display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px">';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:8px 18px;text-align:center"><div style="font-size:8px;color:#633806;text-transform:uppercase">Prodotti</div><div style="font-size:20px;font-weight:bold">' + prodottiOrdinati.length + '</div></div>';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:8px 18px;text-align:center"><div style="font-size:8px;color:#633806;text-transform:uppercase">Quotazioni</div><div style="font-size:20px;font-weight:bold">' + prezzi.length + '</div></div>';
  html += '</div>';

  // ═══ FIX 3 — Rilevamento anomalie nel listino ═══
  // Confronta ogni prezzo con il BEST degli ultimi 7 giorni per lo stesso prodotto.
  // Se uno scostamento supera il 15% → banner rosso di avvertimento in cima al PDF,
  // così chi riceve il listino vede subito che c'è un valore da verificare.
  try {
    var dataRef = new Date(data + 'T00:00:00Z');
    var dataInizio = new Date(dataRef.getTime() - 7 * 86400000).toISOString().split('T')[0];
    var dataFine = new Date(dataRef.getTime() - 86400000).toISOString().split('T')[0];
    var prodottiDistinti = Object.keys(perProdotto);
    var { data: storici } = await sb.from('prezzi')
      .select('prodotto,costo_litro,data')
      .in('prodotto', prodottiDistinti)
      .gte('data', dataInizio)
      .lte('data', dataFine);
    var bestPerProd = {};
    (storici || []).forEach(function(r){
      var p = r.prodotto;
      var c = Number(r.costo_litro);
      if (!isFinite(c) || c <= 0) return;
      if (bestPerProd[p] === undefined || c < bestPerProd[p]) bestPerProd[p] = c;
    });
    var anomalie = [];
    prodottiDistinti.forEach(function(prod){
      var ref = bestPerProd[prod];
      if (!ref || !isFinite(ref)) return;
      (perProdotto[prod] || []).forEach(function(p){
        // Skip Phoenix Fuel interno (CMP non è un prezzo di mercato confrontabile)
        if (p._isDeposito) return;
        var c = Number(p.costo_litro);
        if (!isFinite(c) || c <= 0) return;
        var delta = (c - ref) / ref;
        if (Math.abs(delta) > 0.15) {
          anomalie.push({
            prodotto: prod,
            fornitore: p.fornitore,
            base: (p.basi_carico && p.basi_carico.nome) || '—',
            costo: c,
            ref: ref,
            delta: delta
          });
        }
      });
    });
    if (anomalie.length) {
      html += '<div style="background:#FCEBEB;border:2px solid #E24B4A;border-radius:8px;padding:12px 16px;margin-bottom:18px">';
      html += '<div style="font-size:13px;font-weight:bold;color:#791F1F;margin-bottom:6px">⚠️ ATTENZIONE — prezzo fuori range storico</div>';
      html += '<div style="font-size:10px;color:#791F1F;margin-bottom:8px">' + anomalie.length + ' ' + (anomalie.length === 1 ? 'quotazione si discosta' : 'quotazioni si discostano') + ' di oltre 15% dal BEST degli ultimi 7 giorni. Verificare prima di utilizzare il listino.</div>';
      anomalie.forEach(function(a){
        var deltaStr = (a.delta >= 0 ? '+' : '') + (a.delta * 100).toFixed(1) + '%';
        html += '<div style="font-size:10px;color:#501313;padding:3px 0;font-family:Courier New,monospace">';
        html += '• <strong>' + a.fornitore + '</strong> ' + a.prodotto + ' (' + a.base + '): €/L ' + a.costo.toFixed(6);
        html += ' vs BEST storico €/L ' + a.ref.toFixed(6);
        html += ' → scostamento <strong>' + deltaStr + '</strong>';
        html += '</div>';
      });
      html += '</div>';
    }
  } catch(e) { /* non bloccante */ }

  // Sezioni per prodotto
  prodottiOrdinati.forEach(function(prodotto) {
    var lista = perProdotto[prodotto];
    var col = coloriProdotto[prodotto] || '#888';

    // Ordina per prezzo completo (costo + trasporto + margine) per considerare franco partenza vs franco destino
    lista.sort(function(a, b) { return prezzoNoIva(a) - prezzoNoIva(b); });
    var best = lista.length > 0 ? prezzoNoIva(lista[0]) : 0;

    html += '<div class="product-section" style="margin-bottom:22px">';
    html += '<div style="display:flex;align-items:center;gap:8px;border-bottom:2px solid ' + col + ';padding-bottom:5px;margin-bottom:8px">';
    html += '<div style="width:14px;height:14px;border-radius:50%;background:' + col + '"></div>';
    html += '<div style="font-size:16px;font-weight:bold;color:' + col + ';text-transform:uppercase">' + prodotto + '</div>';
    html += '<div style="margin-left:auto;font-size:11px;color:#666">' + lista.length + ' quotazion' + (lista.length === 1 ? 'e' : 'i') + '</div>';
    html += '</div>';

    html += '<table><thead><tr style="background:' + col + '12">';
    html += '<th style="text-align:left;color:' + col + '">Fornitore</th>';
    html += '<th style="text-align:left;color:' + col + '">Base di carico</th>';
    html += '<th style="color:' + col + '">Prezzo €/L</th>';
    html += '<th style="color:' + col + '">Trasporto €/L</th>';
    html += '<th style="color:' + col + '">Costo totale €/L</th>';
    html += '<th style="color:' + col + '">IVA</th>';
    html += '<th style="color:' + col + '">Prezzo IVA incl.</th>';
    html += '</tr></thead><tbody>';

    lista.forEach(function(r, i) {
      var costoTot = Number(r.costo_litro) + Number(r.trasporto_litro || 0);
      var ivaPerc = Number(r.iva || 22);
      var prezzoIva = costoTot * (1 + ivaPerc / 100);
      var pNetto = prezzoNoIva(r);
      var isBest = pNetto === best && lista.length > 1;
      var bestTag = isBest ? ' <span style="font-size:8px;background:#639922;color:#fff;padding:1px 6px;border-radius:8px;vertical-align:middle">BEST</span>' : '';
      var deltaTag = '';
      if (!isBest && lista.length > 1) {
        var delta = pNetto - best;
        if (delta > 0.00005) deltaTag = ' <span style="font-size:8px;background:#FDECEA;color:#C0392B;padding:1px 6px;border-radius:8px;vertical-align:middle;font-family:Courier New,monospace">Δ +' + delta.toFixed(6) + '</span>';
      }
      var bgRow = isBest ? 'background:#EAF3DE' : (i % 2 ? 'background:#fafaf5' : '');

      html += '<tr style="' + bgRow + '">';
      var giacTag = r._isDeposito && r._giacenza ? ' <span style="font-size:8px;background:#EAF3DE;color:#27500A;padding:1px 6px;border-radius:8px;vertical-align:middle">' + r._giacenza.toLocaleString('it-IT') + ' L</span>' : '';
      html += '<td style="font-weight:600;font-size:12px">' + esc(r.fornitore) + bestTag + deltaTag + giacTag + '</td>';
      html += '<td>' + esc(r.basi_carico ? r.basi_carico.nome : '—') + '</td>';
      html += '<td class="m" style="font-size:15px;font-weight:bold;color:' + col + '">' + Number(r.costo_litro).toFixed(6) + '</td>';
      html += '<td class="m">' + Number(r.trasporto_litro || 0).toFixed(6) + '</td>';
      html += '<td class="m" style="font-weight:600;font-size:13px">' + costoTot.toFixed(6) + '</td>';
      html += '<td style="text-align:center">' + ivaPerc + '%</td>';
      html += '<td class="m" style="font-weight:500;font-size:13px">' + prezzoIva.toFixed(6) + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div>';
  });

  // Footer
  html += '<div style="border-top:2px solid #ddd;padding-top:10px;margin-top:12px;font-size:9px;color:#999;text-align:center">Listino prezzi fornitori del ' + new Date(data + 'T12:00:00').toLocaleDateString('it-IT') + ' — Phoenix Fuel SRL — Uso interno riservato</div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D4A017;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

// Dati ordini per filtro client-side
let _ordiniCache = [];

// ── MODIFICA ORDINE ───────────────────────────────────────────────
// Valori originali dell'ordine in modifica, usati per rilevare cambi di costo
var _modOrigCosto = null, _modOrigTrasporto = null, _modOrigMargine = null, _modOrigPrezzoNetto = null;

async function apriModaleOrdine(id) {
  const { data: r } = await sb.from('ordini').select('*').eq('id', id).single();
  if (!r) return;

  // Memorizza valori originali per il check di coerenza in salvataggio
  _modOrigCosto = Number(r.costo_litro);
  _modOrigTrasporto = Number(r.trasporto_litro);
  _modOrigMargine = Number(r.margine);
  _modOrigPrezzoNetto = _modOrigCosto + _modOrigTrasporto + _modOrigMargine;

  // Carica documenti esistenti
  const { data: docs } = await sb.from('documenti_ordine').select('*').eq('ordine_id', id).order('created_at',{ascending:false});

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Modifica ordine</div>';
  html += '<div class="form-grid">';
  // Stato: se c'è DAS firmato l'ordine è consegnato e lo stato è bloccato.
  var hasDas = !!(r.das_firmato_url);
  html += '<div class="form-group"><label>Stato' + (hasDas ? ' <span style="font-size:10px;color:#639922;font-weight:500">🔒 DAS firmato</span>' : '') + '</label><select id="mod-stato"' + (hasDas ? ' disabled title="Stato bloccato: DAS firmato allegato. Per cambiare stato rimuovi prima il DAS."' : '') + '>';
  // Se DAS presente mostro solo consegnato (disabilitato), altrimenti mostro tutti gli altri.
  var statiVisibili = hasDas ? ['consegnato'] : ['in attesa','confermato','programmato','consegnato','annullato'];
  var statoSel = hasDas ? 'consegnato' : r.stato;
  statiVisibili.forEach(s => { html += '<option value="' + s + '"' + (statoSel===s?' selected':'') + '>' + s + '</option>'; });
  html += '</select></div>';
  // Data consegna: editabile per ordini in attesa/confermato/programmato. Bloccata se consegnato (dato storico fissato).
  var dataLocked = (r.stato === 'consegnato');
  html += '<div class="form-group"><label>Data consegna' + (dataLocked ? ' <span style="font-size:10px;color:#639922;font-weight:500">🔒 Consegnato</span>' : '') + '</label><input type="date" id="mod-data" value="' + (r.data || '') + '"' + (dataLocked ? ' disabled title="Data bloccata: ordine consegnato"' : '') + ' /></div>';
  html += '<div class="form-group"><label>Litri</label><input type="number" id="mod-litri" value="' + r.litri + '" /></div>';
  html += '<div class="form-group"><label>Costo/L</label><input type="number" id="mod-costo" step="0.000001" value="' + r.costo_litro + '" onchange="aggiornaPreviewModifica()" /></div>';
  html += '<div class="form-group"><label>Trasporto/L</label><input type="number" id="mod-trasporto" step="0.000001" value="' + r.trasporto_litro + '" onchange="aggiornaPreviewModifica()" /></div>';
  html += '<div class="form-group"><label>Margine/L</label><input type="number" id="mod-margine" step="0.000001" value="' + r.margine + '" onchange="aggiornaPreviewModifica()" /></div>';
  html += '<div class="form-group"><label>Prezzo netto/L</label><input type="number" id="mod-prezzo-netto" step="0.000001" value="' + (Number(r.costo_litro)+Number(r.trasporto_litro)+Number(r.margine)).toFixed(6) + '" onchange="aggiornaMargineDaPrezzo()" /></div>';
  html += '<div class="form-group"><label>Giorni pagamento</label><select id="mod-gg">';
  [30,45,60].forEach(g => { html += '<option value="' + g + '"' + (r.giorni_pagamento==g?' selected':'') + '>' + g + ' gg</option>'; });
  html += '</select></div>';
  html += '<div class="form-group"><label>IVA %</label><select id="mod-iva"><option value="22"' + (r.iva==22?' selected':'') + '>22%</option><option value="10"' + (r.iva==10?' selected':'') + '>10%</option><option value="4"' + (r.iva==4?' selected':'') + '>4%</option></select></div>';
  html += '<div class="form-group" style="grid-column:1/-1"><label>Note</label><input type="text" id="mod-note" value="' + esc(r.note||'') + '" /></div>';
  html += '<div class="form-group" style="grid-column:1/-1"><label>Destinazione scarico</label><select id="mod-destinazione" style="font-size:13px;padding:7px 10px"><option value="">— Nessuna —</option></select></div>';
  html += '<div class="form-group" id="mod-grp-dest-manuale" style="grid-column:1/-1;display:none"><label>Destinazione manuale</label><input type="text" id="mod-dest-manuale" value="" placeholder="Indirizzo di consegna" /></div>';
  html += '</div>';

  // Preview prezzo
  const prezzoNetto = Number(r.costo_litro)+Number(r.trasporto_litro)+Number(r.margine);
  const prezzoIva = prezzoNetto * (1 + Number(r.iva)/100);
  const totale = prezzoIva * Number(r.litri);
  html += '<div class="form-preview" id="mod-preview"><span>Costo: <strong>' + fmt(r.costo_litro) + '</strong></span><span>Prezzo netto: <strong>' + fmt(prezzoNetto) + '</strong></span><span>Prezzo IVA: <strong>' + fmt(prezzoIva) + '</strong></span><span>Totale: <strong>' + fmtE(totale) + '</strong></span></div>';
  html += '<div class="form-preview"><span>Fornitore: <strong>' + esc(r.fornitore) + '</strong></span><span>Prodotto: <strong>' + esc(r.prodotto) + '</strong></span><span>Cliente: <strong>' + esc(r.cliente) + '</strong></span></div>';

  // Sezione documenti
  html += '<div style="margin-top:16px;border-top:0.5px solid var(--border);padding-top:14px">';
  html += '<div style="font-size:13px;font-weight:500;margin-bottom:10px">Documenti allegati</div>';

  // DAS interni
  var { data: dasOrdine } = await sb.from('das_documenti').select('*').eq('ordine_id', id).order('created_at',{ascending:false});
  if (dasOrdine && dasOrdine.length) {
    html += '<div style="margin-bottom:10px">';
    dasOrdine.forEach(function(d) {
      var numDas = 'DAS-' + d.anno + '/' + String(d.numero_progressivo).padStart(4,'0');
      html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:#FDF3D0;border-radius:6px;margin-bottom:4px;font-size:12px;border-left:3px solid #D4A017">';
      html += '<span class="badge amber" style="font-size:9px">DAS</span>';
      html += '<strong style="font-family:var(--font-mono)">' + numDas + '</strong>';
      html += '<span style="font-size:10px;color:var(--text-muted)">' + d.data + ' · ' + esc(d.prodotto) + ' · ' + fmtL(d.litri_ambiente) + ' · ' + esc(d.mezzo_targa||'') + '</span>';
      html += '<button class="btn-primary" style="font-size:10px;padding:3px 10px;margin-left:auto" onclick="stampaDas(\'' + d.id + '\')">🖨️ Stampa</button>';
      html += '</div>';
    });
    html += '</div>';
  }

  // Lista documenti caricati
  if (docs && docs.length) {
    html += '<div style="margin-bottom:10px">';
    docs.forEach(d => {
      const url = SUPABASE_URL + '/storage/v1/object/public/Das/' + d.percorso_storage;
      const tipoLabel = d.tipo === 'das' ? '<span class="badge amber">DAS</span>' : d.tipo === 'conferma' ? '<span class="badge blue">Conferma</span>' : '<span class="badge gray">' + d.tipo + '</span>';
      html += '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg-kpi);border-radius:6px;margin-bottom:4px;font-size:12px">';
      html += tipoLabel + ' ';
      html += '<a href="' + url + '" target="_blank" style="flex:1;color:var(--accent);text-decoration:none">' + d.nome_file + '</a>';
      html += '<span style="font-size:10px;color:var(--text-hint)">' + new Date(d.created_at).toLocaleDateString('it-IT') + '</span>';
      html += '<button class="btn-danger" style="font-size:12px" onclick="eliminaDocumento(\'' + d.id + '\',\'' + d.percorso_storage + '\',\'' + id + '\')">x</button>';
      html += '</div>';
    });
    html += '</div>';
  } else {
    html += '<div style="font-size:11px;color:var(--text-hint);margin-bottom:10px">Nessun documento allegato</div>';
  }

  // Upload nuovo documento
  html += '<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap">';
  html += '<div class="form-group" style="flex:1"><label>Carica documento (PDF/foto)</label><input type="file" id="doc-file" accept="image/*,.pdf" style="font-size:12px" /></div>';
  html += '<div class="form-group"><label>Tipo</label><select id="doc-tipo" style="font-size:12px"><option value="das">DAS</option><option value="conferma">Conferma</option><option value="fattura">Fattura</option><option value="altro">Altro</option></select></div>';
  html += '<button class="btn-primary" style="padding:8px 14px;font-size:12px;margin-bottom:5px" onclick="uploadDocumento(\'' + id + '\')">Carica</button>';
  html += '</div></div>';

  html += '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn-primary" style="flex:1" onclick="salvaModificaOrdine(\'' + id + '\')">Salva modifiche</button><button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button></div>';
  apriModal(html);
  // Popola sedi scarico nel dropdown modifica
  var modDestSel = document.getElementById('mod-destinazione');
  var modDestManGrp = document.getElementById('mod-grp-dest-manuale');
  if (modDestSel && r.cliente_id) {
    var { data: sediMod } = await sb.from('sedi_scarico').select('*').eq('cliente_id', r.cliente_id).eq('attivo', true).order('is_default',{ascending:false}).order('nome');
    modDestSel.innerHTML = '<option value="">— Nessuna —</option>';
    var found = false;
    if (sediMod && sediMod.length) {
      sediMod.forEach(function(s) {
        var label = s.nome + (s.indirizzo ? ' — ' + s.indirizzo : '') + (s.citta ? ', ' + s.citta : '');
        var sel = r.destinazione && r.destinazione === label ? ' selected' : '';
        if (sel) found = true;
        modDestSel.innerHTML += '<option value="' + esc(label) + '" data-sede-id="' + s.id + '"' + sel + '>' + esc(label) + '</option>';
      });
    }
    modDestSel.innerHTML += '<option value="__manuale__"' + (r.destinazione && !found ? ' selected' : '') + '>✏️ Altro (manuale)</option>';
    if (r.destinazione && !found) {
      if (modDestManGrp) { modDestManGrp.style.display = ''; document.getElementById('mod-dest-manuale').value = r.destinazione; }
    }
    modDestSel.onchange = function() { if (modDestManGrp) modDestManGrp.style.display = modDestSel.value === '__manuale__' ? '' : 'none'; };
  } else if (modDestSel && r.destinazione) {
    modDestSel.innerHTML = '<option value="">— Nessuna —</option><option value="__manuale__" selected>✏️ Altro (manuale)</option>';
    if (modDestManGrp) { modDestManGrp.style.display = ''; document.getElementById('mod-dest-manuale').value = r.destinazione; }
    modDestSel.onchange = function() { if (modDestManGrp) modDestManGrp.style.display = modDestSel.value === '__manuale__' ? '' : 'none'; };
  }
}

async function salvaModificaOrdine(id, bypassCheck) {
  const litri = parseFloat(document.getElementById('mod-litri').value);
  const costo = parseFloat(document.getElementById('mod-costo').value);
  const trasporto = parseFloat(document.getElementById('mod-trasporto').value);
  const margine = parseFloat(document.getElementById('mod-margine').value);
  const iva = parseInt(document.getElementById('mod-iva').value);
  const ggPag = parseInt(document.getElementById('mod-gg').value);

  // ── Check coerenza prezzo netto cliente ─────────────────────────
  // Se l'utente ha modificato costo o trasporto MA non il margine, il prezzo
  // netto cliente cambia silenziosamente. Mostriamo popup per scelta esplicita.
  // Bypass: chiamato dalle opzioni del popup stesso o quando margine è stato toccato.
  if (!bypassCheck && _modOrigCosto !== null) {
    var costoCambiato = Math.abs(costo - _modOrigCosto) > 0.00001;
    var trasportoCambiato = Math.abs(trasporto - _modOrigTrasporto) > 0.00001;
    var margineCambiato = Math.abs(margine - _modOrigMargine) > 0.00001;
    if ((costoCambiato || trasportoCambiato) && !margineCambiato) {
      _mostraPopupConfermaPrezzo(id, costo, trasporto, margine);
      return;
    }
  }

  const { data: ordine } = await sb.from('ordini').select('data,cliente,das_firmato_url,caricato_deposito,stato').eq('id', id).single();
  // Guardia Phoenix Fuel: rifornimento interno → margine sempre 0
  let margineFinale = margine;
  if (ordine && _isClientePhoenix(ordine.cliente)) {
    margineFinale = 0;
  }
  // Guardia DAS firmato: se allegato, stato resta 'consegnato' e caricato_deposito resta true.
  // Non importa cosa dice la UI o cosa l'utente ha cliccato: il DAS firmato è prova di consegna.
  var statoDaSalvare = document.getElementById('mod-stato').value;
  var hasDasOrd = ordine && ordine.das_firmato_url;
  if (hasDasOrd) {
    statoDaSalvare = 'consegnato';
  }
  // Server-side guard: se stato originale era 'consegnato', la data non si tocca.
  // Vale anche per DAS firmato (ordine bloccato comunque).
  var dataNuova;
  if (ordine.stato === 'consegnato' || hasDasOrd) {
    dataNuova = ordine.data;
  } else {
    dataNuova = document.getElementById('mod-data') ? document.getElementById('mod-data').value : ordine.data;
  }
  const dataValida = dataNuova && /^\d{4}-\d{2}-\d{2}$/.test(dataNuova) ? dataNuova : ordine.data;
  const dataScad = new Date(dataValida); dataScad.setDate(dataScad.getDate()+ggPag);
  var modDestVal = document.getElementById('mod-destinazione').value;
  var modDest = modDestVal === '__manuale__' ? (document.getElementById('mod-dest-manuale').value.trim()||null) : (modDestVal || null);
  // Coerenza sede_scarico_id/nome con destinazione selezionata dal dropdown.
  var modSedeId = null, modSedeNome = null;
  if (modDestVal && modDestVal !== '__manuale__') {
    var modDestSelEl = document.getElementById('mod-destinazione');
    var modOptSel = modDestSelEl ? modDestSelEl.options[modDestSelEl.selectedIndex] : null;
    if (modOptSel && modOptSel.dataset && modOptSel.dataset.sedeId) {
      modSedeId = modOptSel.dataset.sedeId;
      modSedeNome = modDest;
    }
  }
  var updatePayload = { stato: statoDaSalvare, data: dataValida, litri, costo_litro:costo, trasporto_litro:trasporto, margine:margineFinale, iva, giorni_pagamento:ggPag, data_scadenza:dataScad.toISOString().split('T')[0], note:document.getElementById('mod-note').value, destinazione:modDest, sede_scarico_id:modSedeId, sede_scarico_nome:modSedeNome };
  // Se DAS firmato, blocca anche caricato_deposito a true (l'uscita deposito è stata fatta)
  if (hasDasOrd) {
    updatePayload.caricato_deposito = true;
  }
  const { error } = await sb.from('ordini').update(updatePayload).eq('id', id);
  if (error) { toast('Errore: '+error.message); return; }
  // Reset valori originali
  _modOrigCosto = _modOrigTrasporto = _modOrigMargine = _modOrigPrezzoNetto = null;
  toast('Ordine aggiornato!');
  chiudiModalePermessi();
  caricaOrdini();
}

// Popup di conferma quando cambia il costo ma non il margine.
// Tre scelte: mantieni prezzo netto (ricalcola margine), accetta nuovo prezzo, annulla.
function _mostraPopupConfermaPrezzo(id, nuovoCosto, nuovoTrasporto, margineCorrente) {
  // Snapshot completo del form per non perdere le altre modifiche (stato, litri, note, dest, ecc.)
  window._modSnapshotForm = {
    stato: document.getElementById('mod-stato').value,
    data: document.getElementById('mod-data') ? document.getElementById('mod-data').value : null,
    litri: document.getElementById('mod-litri').value,
    iva: document.getElementById('mod-iva').value,
    gg: document.getElementById('mod-gg').value,
    note: document.getElementById('mod-note').value,
    destinazione: document.getElementById('mod-destinazione').value,
    destManuale: document.getElementById('mod-dest-manuale').value
  };

  var prezzoOrig = _modOrigPrezzoNetto;
  var prezzoNuovo = nuovoCosto + nuovoTrasporto + margineCorrente;
  var margineRicalc = prezzoOrig - nuovoCosto - nuovoTrasporto;
  var deltaPrezzo = prezzoNuovo - prezzoOrig;

  var bgWarn = '#FAEEDA', txtWarn = '#854F0B';
  var bgOk = '#EAF3DE', txtOk = '#27500A';
  var trasportoCambiato = Math.abs(nuovoTrasporto - _modOrigTrasporto) > 0.00001;

  var html = '<div style="font-size:16px;font-weight:600;margin-bottom:6px">⚠️ Hai modificato il costo di acquisto</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Il prezzo netto cliente era già stato comunicato. Cosa vuoi fare?</div>';

  // Tabella confronto valori (3 colonne: voce, prima, dopo)
  html += '<div style="background:var(--bg-kpi);border-radius:8px;padding:12px 14px;margin-bottom:14px;font-size:13px">';
  html += '<div style="display:grid;grid-template-columns:1fr auto auto;gap:6px 18px;align-items:baseline">';
  html += '<div style="color:var(--text-muted)">Costo €/L</div>';
  html += '<div style="font-family:var(--font-mono);color:var(--text-muted);text-decoration:line-through">' + _modOrigCosto.toFixed(6) + '</div>';
  html += '<div style="font-family:var(--font-mono);font-weight:600;color:' + txtWarn + '">' + nuovoCosto.toFixed(6) + '</div>';
  html += '<div style="color:var(--text-muted)">Trasporto €/L</div>';
  html += '<div style="font-family:var(--font-mono);color:var(--text-muted)' + (trasportoCambiato ? ';text-decoration:line-through' : '') + '">' + _modOrigTrasporto.toFixed(6) + '</div>';
  html += '<div style="font-family:var(--font-mono);' + (trasportoCambiato ? 'font-weight:600;color:' + txtWarn : 'color:var(--text-muted)') + '">' + nuovoTrasporto.toFixed(6) + '</div>';
  html += '<div style="color:var(--text-muted)">Margine €/L</div>';
  html += '<div style="font-family:var(--font-mono);color:var(--text-muted)">' + margineCorrente.toFixed(6) + '</div>';
  html += '<div style="font-family:var(--font-mono);color:var(--text-muted)">' + margineCorrente.toFixed(6) + '</div>';
  html += '<div style="border-top:0.5px solid var(--border);padding-top:6px;font-weight:600">Prezzo netto €/L</div>';
  html += '<div style="border-top:0.5px solid var(--border);padding-top:6px;font-family:var(--font-mono);font-weight:600">' + prezzoOrig.toFixed(6) + '</div>';
  html += '<div style="border-top:0.5px solid var(--border);padding-top:6px;font-family:var(--font-mono);font-weight:600;color:' + txtWarn + '">' + prezzoNuovo.toFixed(6) + ' (' + (deltaPrezzo>=0?'+':'') + deltaPrezzo.toFixed(6) + ')</div>';
  html += '</div></div>';

  // Opzione 1: mantieni prezzo cliente, ricalcola margine
  html += '<button onclick="_optMantieniPrezzo(\'' + id + '\',' + nuovoCosto + ',' + nuovoTrasporto + ',' + margineRicalc + ')" style="display:block;width:100%;text-align:left;padding:12px 14px;border:0.5px solid #639922;background:' + bgOk + ';border-radius:8px;cursor:pointer;margin-bottom:8px">';
  html += '<div style="font-weight:600;font-size:13px;color:' + txtOk + '">✓ Mantieni prezzo netto cliente € ' + prezzoOrig.toFixed(6) + '/L</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Il margine viene ricalcolato: ' + margineCorrente.toFixed(6) + ' → ' + margineRicalc.toFixed(6) + ' €/L</div>';
  html += '</button>';

  // Opzione 2: accetta nuovo prezzo
  html += '<button onclick="_optAccettaNuovoPrezzo(\'' + id + '\',' + nuovoCosto + ',' + nuovoTrasporto + ',' + margineCorrente + ')" style="display:block;width:100%;text-align:left;padding:12px 14px;border:0.5px solid #BA7517;background:' + bgWarn + ';border-radius:8px;cursor:pointer;margin-bottom:8px">';
  html += '<div style="font-weight:600;font-size:13px;color:' + txtWarn + '">⚠ Accetta nuovo prezzo netto € ' + prezzoNuovo.toFixed(6) + '/L</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Il prezzo cliente cambia di ' + (deltaPrezzo>=0?'+':'') + deltaPrezzo.toFixed(6) + ' €/L. Margine invariato a ' + margineCorrente.toFixed(6) + '</div>';
  html += '</button>';

  // Opzione 3: annulla → riapre la modale ricaricando l'ordine, scarta tutto
  html += '<button onclick="chiudiModalePermessi();apriModaleOrdine(\'' + id + '\')" style="display:block;width:100%;text-align:left;padding:12px 14px;border:0.5px solid var(--border);background:var(--bg);border-radius:8px;cursor:pointer">';
  html += '<div style="font-weight:600;font-size:13px">Annulla</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Torna al form senza salvare le modifiche</div>';
  html += '</button>';

  apriModal(html);
}

// Helper: ripristina lo snapshot del form e applica i nuovi valori di costo/trasporto/margine
async function _ripristinaFormESalva(id, costoFinale, trasportoFinale, margineFinale) {
  chiudiModalePermessi();
  await apriModaleOrdine(id);
  // Aspetta il render della modale, poi ripristina i campi
  await new Promise(function(resolve){ setTimeout(resolve, 120); });
  var snap = window._modSnapshotForm || {};
  if (snap.stato !== undefined) document.getElementById('mod-stato').value = snap.stato;
  if (snap.data !== undefined && snap.data !== null && document.getElementById('mod-data')) document.getElementById('mod-data').value = snap.data;
  if (snap.litri !== undefined) document.getElementById('mod-litri').value = snap.litri;
  if (snap.iva !== undefined) document.getElementById('mod-iva').value = snap.iva;
  if (snap.gg !== undefined) document.getElementById('mod-gg').value = snap.gg;
  if (snap.note !== undefined) document.getElementById('mod-note').value = snap.note;
  if (snap.destinazione !== undefined) {
    var dSel = document.getElementById('mod-destinazione');
    if (dSel) {
      // Verifica che l'option esista, altrimenti fallback su manuale
      var found = false;
      for (var i = 0; i < dSel.options.length; i++) {
        if (dSel.options[i].value === snap.destinazione) { dSel.value = snap.destinazione; found = true; break; }
      }
      if (!found && snap.destinazione) dSel.value = '__manuale__';
    }
  }
  if (snap.destManuale !== undefined) document.getElementById('mod-dest-manuale').value = snap.destManuale;
  // Applica i valori prezzo finali
  document.getElementById('mod-costo').value = costoFinale.toFixed(6);
  document.getElementById('mod-trasporto').value = trasportoFinale.toFixed(6);
  document.getElementById('mod-margine').value = margineFinale.toFixed(6);
  aggiornaPreviewModifica();
  // Salva con bypass del check
  await salvaModificaOrdine(id, true);
  window._modSnapshotForm = null;
}

// Opzione 1: mantieni prezzo netto, ricalcola margine. Avviso se margine negativo.
async function _optMantieniPrezzo(id, nuovoCosto, nuovoTrasporto, margineRicalc) {
  if (margineRicalc < 0) {
    if (!confirm('⚠ Attenzione: il margine risultante sarà negativo (' + margineRicalc.toFixed(6) + ' €/L), stai vendendo sotto costo.\n\nConfermi comunque?')) {
      return;
    }
  }
  await _ripristinaFormESalva(id, nuovoCosto, nuovoTrasporto, margineRicalc);
}

// Opzione 2: accetta nuovo prezzo (margine invariato, prezzo netto cambia)
async function _optAccettaNuovoPrezzo(id, nuovoCosto, nuovoTrasporto, margineCorrente) {
  await _ripristinaFormESalva(id, nuovoCosto, nuovoTrasporto, margineCorrente);
}

// Aggiorna preview nella modale modifica
function aggiornaPreviewModifica() {
  const costo = parseFloat(document.getElementById('mod-costo').value) || 0;
  const trasporto = parseFloat(document.getElementById('mod-trasporto').value) || 0;
  const margine = parseFloat(document.getElementById('mod-margine').value) || 0;
  const iva = parseInt(document.getElementById('mod-iva')?.value || 22);
  const litri = parseFloat(document.getElementById('mod-litri').value) || 0;
  const prezzoNetto = costo + trasporto + margine;
  const prezzoIva = prezzoNetto * (1 + iva/100);
  const totale = prezzoIva * litri;
  document.getElementById('mod-prezzo-netto').value = prezzoNetto.toFixed(6);
  const prev = document.getElementById('mod-preview');
  if (prev) prev.innerHTML = '<span>Costo: <strong>' + fmt(costo) + '</strong></span><span>Prezzo netto: <strong>' + fmt(prezzoNetto) + '</strong></span><span>Prezzo IVA: <strong>' + fmt(prezzoIva) + '</strong></span><span>Totale: <strong>' + fmtE(totale) + '</strong></span>';
}

// Calcola margine dal prezzo netto inserito
function aggiornaMargineDaPrezzo() {
  const costo = parseFloat(document.getElementById('mod-costo').value) || 0;
  const trasporto = parseFloat(document.getElementById('mod-trasporto').value) || 0;
  const prezzoNetto = parseFloat(document.getElementById('mod-prezzo-netto').value) || 0;
  const margine = prezzoNetto - costo - trasporto;
  document.getElementById('mod-margine').value = margine.toFixed(6);
  aggiornaPreviewModifica();
}

// ── DOCUMENTI ORDINE ─────────────────────────────────────────────
async function uploadDocumento(ordineId) {
  const fileInput = document.getElementById('doc-file');
  const tipo = document.getElementById('doc-tipo').value;
  if (!fileInput.files.length) { toast('Seleziona un file'); return; }
  const file = fileInput.files[0];
  var tipiAmmessi = ['application/pdf','image/jpeg','image/png','image/gif','image/webp'];
  if (tipiAmmessi.indexOf(file.type) < 0) { toast('Solo PDF o immagini ammessi'); return; }
  if (file.size > 15 * 1024 * 1024) { toast('File troppo grande (max 15MB)'); return; }

  const nomeFile = file.name;
  const percorso = ordineId + '/' + Date.now() + '_' + nomeFile.replace(/[^a-zA-Z0-9._-]/g, '_');

  toast('Caricamento in corso...');

  // Upload su Supabase Storage
  const { error: errUpload } = await sb.storage.from('Das').upload(percorso, file, { contentType: file.type });
  if (errUpload) { toast('Errore upload: ' + errUpload.message); return; }

  // Salva riferimento nel database
  const { error: errDb } = await sb.from('documenti_ordine').insert([{
    ordine_id: ordineId,
    nome_file: nomeFile,
    tipo: tipo,
    percorso_storage: percorso
  }]);
  if (errDb) { toast('Errore salvataggio: ' + errDb.message); return; }

  toast('Documento caricato!');
  // Riapri la modale per vedere il documento aggiunto
  apriModaleOrdine(ordineId);
}

async function eliminaDocumento(docId, percorso, ordineId) {
  if (!confirm('Eliminare questo documento?')) return;
  // Elimina da storage
  await sb.storage.from('Das').remove([percorso]);
  // Elimina dal database
  await sb.from('documenti_ordine').delete().eq('id', docId);
  toast('Documento eliminato');
  apriModaleOrdine(ordineId);
}

// ── MODIFICA INLINE ───────────────────────────────────────────────
async function editaCella(td, tabella, campo, id, val) {
  const input = document.createElement('input');
  input.className='inline-edit'; input.type='number'; input.step='0.0001'; input.value=val;
  td.innerHTML=''; td.appendChild(input); input.focus();
  input.onblur = async () => {
    const nv=parseFloat(input.value);
    if (!isNaN(nv)) {
      const oldVal = Number(val);
      const{error}=await sb.from(tabella).update({[campo]:nv}).eq('id',id);
      // Audit su modifica (solo se cambia davvero il valore e no-error)
      if (!error && oldVal !== nv) {
        _auditLog('modifica_' + tabella, tabella,
          'id:' + id + ' | ' + campo + ': ' + oldVal + ' → ' + nv);
      }
      toast(error?'Errore':'Aggiornato!');
    }
    if (tabella==='ordini') caricaOrdini(); else caricaPrezzi();
  };
  input.onkeydown = e => { if(e.key==='Enter') input.blur(); if(e.key==='Escape'){if(tabella==='ordini') caricaOrdini(); else caricaPrezzi();} };
}

async function eliminaRecord(tabella, id, callback) {
  if (!confirm('Eliminare questo record?')) return;
  // Prima di cancellare, leggi il record per avere il dettaglio nel log.
  // Su 'prezzi' serve particolarmente: un errore di cancellazione deve
  // essere recuperabile sapendo ESATTAMENTE cosa era stato cancellato.
  var dettaglio = 'ID: ' + id;
  try {
    var { data: riga } = await sb.from(tabella).select('*').eq('id', id).maybeSingle();
    if (riga) {
      if (tabella === 'prezzi') {
        dettaglio = (riga.fornitore || '—') + ' | ' + (riga.prodotto || '—') +
          ' | €/L ' + Number(riga.costo_litro || 0).toFixed(6) +
          (riga.trasporto_litro ? ' +tr €' + Number(riga.trasporto_litro).toFixed(6) : '') +
          ' | data ' + (riga.data || '—') + ' | id:' + id;
      } else {
        dettaglio = JSON.stringify(riga).substring(0, 450) + ' | id:' + id;
      }
    }
  } catch(e) { /* fallback all'ID solo */ }
  await sb.from(tabella).delete().eq('id', id);
  _auditLog('elimina', tabella, dettaglio);
  toast('Eliminato'); callback();
}

// ── GENERATORE LISTINO PREZZI CLIENTI ────────────────────────────
var _listinoData = [];

async function generaListinoPrezzi() {
  var prodotto = document.getElementById('lp-prodotto').value;
  var costo = parseFloat(document.getElementById('lp-costo').value);
  if (!costo || costo <= 0) { toast('Inserisci il costo base €/L'); return; }
  var trConsumo = parseFloat(document.getElementById('lp-trasp-consumo').value) || 0.019;
  var trRete = parseFloat(document.getElementById('lp-trasp-rete').value) || 0.014;
  var iva = parseInt(document.getElementById('lp-iva').value) || 22;

  toast('Calcolo listino...');

  // Carica clienti + ordini ultimi 6 mesi per margine medio
  var seiMesiFa = new Date(); seiMesiFa.setMonth(seiMesiFa.getMonth() - 6);
  var seiISO = seiMesiFa.toISOString().split('T')[0];

  var [cliRes, ordRes] = await Promise.all([
    sb.from('clienti').select('id,nome,tipo,cliente_rete,attivo').eq('attivo', true).order('nome'),
    sb.from('ordini').select('cliente_id,cliente,litri,margine').eq('tipo_ordine','cliente').eq('prodotto',prodotto).neq('stato','annullato').gte('data', seiISO)
  ]);

  var clienti = cliRes.data || [];
  var ordini = ordRes.data || [];

  // Aggrega margine e litri per cliente
  var perCliente = {};
  ordini.forEach(function(o) {
    var key = o.cliente_id || o.cliente;
    if (!perCliente[key]) perCliente[key] = { litri: 0, margTot: 0, ordini: 0 };
    perCliente[key].litri += Number(o.litri);
    perCliente[key].margTot += Number(o.margine) * Number(o.litri);
    perCliente[key].ordini++;
  });

  // Popola dropdown singolo cliente
  var selCl = document.getElementById('lp-cliente-singolo');
  selCl.innerHTML = '<option value="">Seleziona...</option>' + clienti.map(function(c) {
    return '<option value="' + c.id + '">' + esc(c.nome) + '</option>';
  }).join('');

  // Costruisci listino top 20
  var lista = clienti.map(function(c) {
    var stats = perCliente[c.id] || perCliente[c.nome] || { litri: 0, margTot: 0, ordini: 0 };
    var isRete = c.cliente_rete;
    var trasporto = isRete ? trRete : trConsumo;
    var margMedioL = stats.litri > 0 ? stats.margTot / stats.litri : 0;
    var prezzoNetto = costo + trasporto + margMedioL;
    var prezzoIva = prezzoNetto * (1 + iva / 100);
    return {
      id: c.id, nome: c.nome, tipo: isRete ? 'Rete' : 'Consumo',
      trasporto: trasporto, margineL: margMedioL,
      prezzoNetto: prezzoNetto, prezzoIva: prezzoIva,
      litriStorico: stats.litri, ordiniStorico: stats.ordini
    };
  }).filter(function(c) { return c.litriStorico > 0; })
    .sort(function(a, b) { return b.litriStorico - a.litriStorico; })
    .slice(0, 20);

  _listinoData = lista;

  // Render
  var wrap = document.getElementById('lp-risultato');
  if (!lista.length) { wrap.innerHTML = '<div style="text-align:center;color:var(--text-muted);padding:16px">Nessun cliente con ordini di ' + prodotto + ' negli ultimi 6 mesi</div>'; return; }

  var html = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Top 20 clienti per volume — ' + prodotto + ' — Costo base: € ' + costo.toFixed(6) + '</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Litri (6m)</th><th>Trasporto</th><th>Margine/L</th><th>Prezzo netto</th><th>Prezzo IVA</th></tr></thead><tbody>';

  lista.forEach(function(c, idx) {
    var mColor = c.margineL > 0 ? '#639922' : '#E24B4A';
    html += '<tr' + (idx % 2 ? ' style="background:var(--bg)"' : '') + '>' +
      '<td><strong>' + esc(c.nome) + '</strong></td>' +
      '<td><span class="badge ' + (c.tipo === 'Rete' ? 'purple' : 'gray') + '" style="font-size:9px">' + c.tipo + '</span></td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(c.litriStorico) + '</td>' +
      '<td style="font-family:var(--font-mono)">€ ' + c.trasporto.toFixed(6) + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + mColor + '">€ ' + c.margineL.toFixed(6) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600">€ ' + c.prezzoNetto.toFixed(6) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:700;color:var(--accent)">€ ' + c.prezzoIva.toFixed(6) + '</td></tr>';
  });
  html += '</tbody></table></div>';
  wrap.innerHTML = html;
}

async function stampaListinoPrezzi() {
  var w = _apriReport("Listino prezzi"); if (!w) return;
  if (!_listinoData.length) { toast('Prima genera il listino'); return; }
  var prodotto = document.getElementById('lp-prodotto').value;
  var costo = parseFloat(document.getElementById('lp-costo').value);
  var dataOggi = new Date().toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Listino Prezzi</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:8mm}@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}table{width:100%;border-collapse:collapse}th{background:#D85A30;color:#fff;padding:5px 6px;font-size:8px;text-transform:uppercase;border:1px solid #C04A20;text-align:right}th:first-child{text-align:left}td{padding:3px 6px;border:1px solid #ddd;font-size:9px;text-align:right;font-family:Courier New,monospace}td:first-child{text-align:left;font-family:Arial;font-weight:500}.alt{background:#fafaf8}</style></head><body>';

  html += '<div style="display:flex;justify-content:space-between;border-bottom:2px solid #D85A30;padding-bottom:8px;margin-bottom:10px"><div><div style="font-size:16px;font-weight:bold;color:#D85A30">LISTINO PREZZI CLIENTI</div><div style="font-size:12px;color:#666;margin-top:2px">' + prodotto + ' — Costo base: € ' + costo.toFixed(6) + ' — ' + dataOggi + '</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:bold">PHOENIX FUEL SRL</div></div></div>';

  html += '<table><thead><tr><th style="text-align:left">Cliente</th><th>Tipo</th><th>Vol. 6 mesi</th><th>Trasporto</th><th>Margine/L</th><th>Prezzo netto</th><th>Prezzo IVA incl.</th></tr></thead><tbody>';
  _listinoData.forEach(function(c, i) {
    html += '<tr' + (i % 2 ? ' class="alt"' : '') + '><td>' + esc(c.nome) + '</td><td style="text-align:center">' + c.tipo + '</td><td>' + fmtL(c.litriStorico) + '</td><td>€ ' + c.trasporto.toFixed(6) + '</td><td>€ ' + c.margineL.toFixed(6) + '</td><td style="font-weight:bold">€ ' + c.prezzoNetto.toFixed(6) + '</td><td style="font-weight:bold;color:#D85A30">€ ' + c.prezzoIva.toFixed(6) + '</td></tr>';
  });
  html += '</tbody></table>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════
// SIMULATORE FASCE PAGAMENTO — Consumo + Rete × 4 margini
// Calcola prezzi finali (netto + IVA) per 4 fasce di pagamento
// (Dilazionato / 30gg / Contanti / Colonnine) su 2 profili trasporto
// (Consumo vs Rete). Non tocca `generaListinoPrezzi` né `_listinoData`.
// ═══════════════════════════════════════════════════════════════════
var _fasceData = null;

function _calcolaFasce() {
  var prodotto = document.getElementById('lp-prodotto').value;
  var costo = parseFloat(document.getElementById('lp-costo').value);
  if (!costo || costo <= 0) { toast('Inserisci il costo base €/L nella card sopra'); return null; }
  var trConsumo = parseFloat(document.getElementById('lp-trasp-consumo').value) || 0.019;
  var trRete = parseFloat(document.getElementById('lp-trasp-rete').value) || 0.014;
  var iva = parseInt(document.getElementById('lp-iva').value) || 22;
  var mDil = parseFloat(document.getElementById('lf-marg-dil').value) || 0;
  var m30 = parseFloat(document.getElementById('lf-marg-30').value) || 0;
  var mCont = parseFloat(document.getElementById('lf-marg-cont').value) || 0;
  var mCol = parseFloat(document.getElementById('lf-marg-col').value) || 0;

  function riga(trasporto) {
    var base = costo + trasporto;
    var fattIva = 1 + iva / 100;
    return {
      base: base,
      trasporto: trasporto,
      fasce: [
        { nome: 'Dilazionato', marg: mDil, netto: base + mDil, iva: (base + mDil) * fattIva },
        { nome: '30gg',        marg: m30,  netto: base + m30,  iva: (base + m30)  * fattIva },
        { nome: 'Contanti',    marg: mCont, netto: base + mCont, iva: (base + mCont) * fattIva },
        { nome: 'Colonnine',   marg: mCol,  netto: base + mCol,  iva: (base + mCol)  * fattIva }
      ]
    };
  }

  return {
    prodotto: prodotto,
    costo: costo,
    iva: iva,
    consumo: riga(trConsumo),
    rete: riga(trRete)
  };
}

function generaListinoFasce() {
  var d = _calcolaFasce();
  if (!d) return;
  _fasceData = d;

  function tabellaHtml(titolo, blocco, colorBg) {
    var h = '<div style="flex:1;min-width:340px">';
    h += '<div style="background:'+colorBg+';color:#fff;padding:8px 14px;border-radius:8px 8px 0 0;font-weight:600;font-size:14px">' + esc(titolo) + '</div>';
    h += '<div style="border:1px solid var(--border);border-top:none;border-radius:0 0 8px 8px;padding:12px">';
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Costo base + trasporto: <strong style="font-family:var(--font-mono);color:var(--text)">€ ' + blocco.base.toFixed(6) + '</strong> (trasporto € ' + blocco.trasporto.toFixed(6) + ')</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:12px">';
    h += '<thead><tr style="background:var(--bg)"><th style="padding:6px 8px;text-align:left;border-bottom:0.5px solid var(--border)">Fascia</th><th style="padding:6px 8px;text-align:right;border-bottom:0.5px solid var(--border)">Marg €/L</th><th style="padding:6px 8px;text-align:right;border-bottom:0.5px solid var(--border)">Prezzo no IVA</th><th style="padding:6px 8px;text-align:right;border-bottom:0.5px solid var(--border)">Prezzo IVA incl.</th></tr></thead>';
    h += '<tbody>';
    blocco.fasce.forEach(function(f, i) {
      var bg = i % 2 === 0 ? 'transparent' : 'var(--bg)';
      h += '<tr style="background:'+bg+'"><td style="padding:7px 8px;font-weight:500">' + esc(f.nome) + '</td><td style="padding:7px 8px;text-align:right;font-family:var(--font-mono)">€ ' + f.marg.toFixed(6) + '</td><td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:600">€ ' + f.netto.toFixed(6) + '</td><td style="padding:7px 8px;text-align:right;font-family:var(--font-mono);font-weight:700;color:'+colorBg+'">€ ' + f.iva.toFixed(6) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  var wrap = document.getElementById('lf-risultato');
  var html = '<div style="font-size:12px;color:var(--text-muted);margin-bottom:10px">' + esc(d.prodotto) + ' — Costo base: <strong style="font-family:var(--font-mono);color:var(--text)">€ ' + d.costo.toFixed(6) + '</strong> — IVA ' + d.iva + '%</div>';
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap">';
  html += tabellaHtml('Clienti Consumo', d.consumo, '#378ADD');
  html += tabellaHtml('Clienti Rete', d.rete, '#BA7517');
  html += '</div>';
  wrap.innerHTML = html;
  toast('✓ Fasce calcolate');
}

function stampaListinoFasce() {
  if (!_fasceData) { toast('Prima calcola le fasce'); return; }
  var w = _apriReport("Listino fasce pagamento"); if (!w) return;
  var d = _fasceData;
  var dataOggi = new Date().toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });

  function tabPdf(titolo, blocco, colorBg) {
    var h = '<div style="width:48%"><div style="background:'+colorBg+';color:#fff;padding:8px 12px;font-weight:bold;font-size:13px;border-radius:6px 6px 0 0">' + titolo + '</div>';
    h += '<div style="border:1px solid #ccc;border-top:none;padding:10px;border-radius:0 0 6px 6px">';
    h += '<div style="font-size:10px;color:#666;margin-bottom:6px">Costo base + trasporto: <strong>€ ' + blocco.base.toFixed(6) + '</strong> (trasporto € ' + blocco.trasporto.toFixed(6) + ')</div>';
    h += '<table style="width:100%;border-collapse:collapse;font-size:11px">';
    h += '<thead><tr style="background:#f5f5f5"><th style="padding:6px;text-align:left;border-bottom:1px solid #ccc">Fascia</th><th style="padding:6px;text-align:right;border-bottom:1px solid #ccc">Margine</th><th style="padding:6px;text-align:right;border-bottom:1px solid #ccc">Netto</th><th style="padding:6px;text-align:right;border-bottom:1px solid #ccc">IVA incl.</th></tr></thead>';
    h += '<tbody>';
    blocco.fasce.forEach(function(f, i) {
      h += '<tr' + (i%2 ? ' style="background:#fafafa"' : '') + '><td style="padding:7px 6px;font-weight:500">' + f.nome + '</td><td style="padding:7px 6px;text-align:right;font-family:Courier New,monospace">€ ' + f.marg.toFixed(6) + '</td><td style="padding:7px 6px;text-align:right;font-family:Courier New,monospace">€ ' + f.netto.toFixed(6) + '</td><td style="padding:7px 6px;text-align:right;font-family:Courier New,monospace;font-weight:bold;color:'+colorBg+'">€ ' + f.iva.toFixed(6) + '</td></tr>';
    });
    h += '</tbody></table></div></div>';
    return h;
  }

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Listino fasce — ' + d.prodotto + '</title>';
  html += '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:14mm;color:#1a1a18}@media print{.no-print{display:none!important}@page{size:landscape;margin:10mm}}</style></head><body>';
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #D4A017;padding-bottom:10px;margin-bottom:16px"><div><div style="font-size:22px;font-weight:bold;color:#D4A017">LISTINO FASCE PAGAMENTO</div><div style="font-size:14px;color:#333;margin-top:4px">' + d.prodotto + ' — ' + dataOggi + '</div></div><div style="text-align:right"><div style="font-size:16px;font-weight:bold">PHOENIX FUEL SRL</div><div style="font-size:10px;color:#666">Costo base: € ' + d.costo.toFixed(6) + ' — IVA ' + d.iva + '%</div></div></div>';
  html += '<div style="display:flex;gap:16px;margin-bottom:16px">';
  html += tabPdf('CLIENTI CONSUMO', d.consumo, '#378ADD');
  html += tabPdf('CLIENTI RETE', d.rete, '#BA7517');
  html += '</div>';
  html += '<div style="font-size:9px;color:#888;margin-top:20px;border-top:1px solid #eee;padding-top:8px">Listino indicativo — prezzi soggetti a variazione senza preavviso. Riferimento interno Phoenix Fuel Srl.</div>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════
// Modale standalone per generare rapidamente il listino fasce PDF
// dal bottone "📊 Genera listino PDF" senza dover compilare la card
// "Generatore listino prezzi clienti" sotto.
// ═══════════════════════════════════════════════════════════════════
function apriListinoFascePDF() {
  var prodottiDisp = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO'];
  var dataRif = (document.getElementById('filtro-data-prezzi') && document.getElementById('filtro-data-prezzi').value) || (typeof oggiISO !== 'undefined' ? oggiISO : new Date().toISOString().split('T')[0]);
  var dataRifFmt = new Date(dataRif + 'T12:00:00').toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });

  var h = '<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap;margin-bottom:6px">';
  h += '<div style="font-size:17px;font-weight:600">📊 Genera listino fasce pagamento</div>';
  h += '<div style="font-size:11px;color:var(--text-muted);background:var(--bg);padding:4px 10px;border-radius:8px">Data riferimento: <strong>' + dataRifFmt + '</strong></div>';
  h += '</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Prezzi fornitori auto-richiamati dal listino del giorno selezionato in Prezzi giornalieri.</div>';

  // ── CALCOLATORE CMP PONDERATO ──
  h += '<div style="background:var(--bg);border-radius:10px;padding:14px 16px;margin-bottom:16px;border:0.5px solid var(--border)">';
  h += '<div style="font-size:12px;font-weight:500;text-transform:uppercase;letter-spacing:0.4px;color:var(--text-muted);margin-bottom:12px">🧮 Calcolatore costo medio ponderato (opzionale)</div>';
  h += '<div id="lfp-cmp-intestazione" style="display:grid;grid-template-columns:minmax(0,1fr) 110px 110px 60px 30px;gap:10px;margin-bottom:6px;font-size:11px;color:var(--text-muted)">';
  h += '<div>Fornitore</div><div style="text-align:right">Costo €/L</div><div style="text-align:right">Litri</div><div style="text-align:right">%</div><div></div>';
  h += '</div>';
  h += '<div id="lfp-cmp-righe"></div>';
  h += '<div style="margin-top:4px;margin-bottom:12px"><button type="button" onclick="_lfpAggiungiRiga()" style="font-size:12px;padding:5px 12px;background:var(--bg-card);border:0.5px solid var(--border);border-radius:6px;cursor:pointer;color:var(--text)">+ Aggiungi riga</button></div>';
  h += '<div style="border-top:0.5px solid var(--border);padding-top:12px;display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap">';
  h += '<div style="display:flex;align-items:baseline;gap:10px"><span style="font-size:12px;color:var(--text-muted)">Totale ponderato:</span><span id="lfp-cmp-totale" style="font-family:var(--font-mono);font-size:20px;font-weight:500">€ 0,0000</span></div>';
  h += '<button type="button" onclick="_lfpUsaCostoBase()" style="font-size:12px;padding:7px 14px;background:#E6F1FB;color:#0C447C;border:0.5px solid #378ADD;border-radius:6px;font-weight:500;cursor:pointer">↓ Usa come costo base</button>';
  h += '</div>';
  h += '</div>';

  // ── FASCE PAGAMENTO (come prima) ──
  h += '<div class="form-grid">';
  h += '<div class="form-group"><label>Prodotto</label><select id="lfp-prodotto" onchange="_lfpRipopolaFornitori()" style="font-size:14px;padding:8px 12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text)">';
  prodottiDisp.forEach(function(p) { h += '<option value="' + p + '">' + p + '</option>'; });
  h += '</select></div>';
  h += '<div class="form-group"><label>Costo base €/L</label><input type="number" id="lfp-costo" step="0.000001" placeholder="1.6570" style="font-family:var(--font-mono);font-size:16px" autofocus /></div>';
  h += '<div class="form-group"><label>IVA %</label><select id="lfp-iva"><option value="22">22%</option><option value="10">10%</option></select></div>';
  h += '<div class="form-group"><label>Trasporto Consumo €/L</label><input type="number" id="lfp-trasp-consumo" step="0.000001" value="0.0190" style="font-family:var(--font-mono)" /></div>';
  h += '<div class="form-group"><label>Trasporto Rete €/L</label><input type="number" id="lfp-trasp-rete" step="0.000001" value="0.0140" style="font-family:var(--font-mono)" /></div>';
  h += '<div class="form-group"></div>';
  h += '<div class="form-group"><label>Marg. Dilazionato</label><input type="number" id="lfp-marg-dil" step="0.001" value="0.060" style="font-family:var(--font-mono)" /></div>';
  h += '<div class="form-group"><label>Marg. 30gg</label><input type="number" id="lfp-marg-30" step="0.001" value="0.040" style="font-family:var(--font-mono)" /></div>';
  h += '<div class="form-group"><label>Marg. Contanti</label><input type="number" id="lfp-marg-cont" step="0.001" value="0.020" style="font-family:var(--font-mono)" /></div>';
  h += '<div class="form-group"><label>Marg. Colonnine</label><input type="number" id="lfp-marg-col" step="0.001" value="0.015" style="font-family:var(--font-mono)" /></div>';
  h += '</div>';
  h += '<div style="display:flex;gap:8px;margin-top:16px">';
  h += '<button class="btn-primary" style="flex:1;background:#639922" onclick="_lfpGeneraPDF()">📄 Genera PDF</button>';
  h += '<button onclick="chiudiModalePermessi()" style="padding:10px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer">Annulla</button>';
  h += '</div>';

  // Salva la data di riferimento per le query async
  window._lfpDataRif = dataRif;
  window._lfpCmpCalcolato = 0;

  apriModal(h);

  // Inizializza 2 righe + popola dropdown fornitori dopo apertura modale
  setTimeout(function() {
    _lfpAggiungiRiga();
    _lfpAggiungiRiga();
  }, 50);
}

// ── Popola dropdown fornitori da prezzi(data,prodotto) + PhoenixFuel Deposito (CMP attuale) ──
async function _lfpRipopolaFornitori() {
  var data = window._lfpDataRif || (document.getElementById('filtro-data-prezzi') && document.getElementById('filtro-data-prezzi').value) || new Date().toISOString().split('T')[0];
  var prodSel = document.getElementById('lfp-prodotto');
  var prod = prodSel ? prodSel.value : 'Gasolio Autotrazione';

  // Query parallele: prezzi del giorno + cisterne deposito
  var [prezziRes, cisterneRes] = await Promise.all([
    sb.from('prezzi').select('fornitore,costo_litro,trasporto_litro').eq('data', data).eq('prodotto', prod).order('fornitore'),
    sb.from('cisterne').select('livello_attuale,costo_medio').eq('sede', 'deposito_vibo').eq('prodotto', prod)
  ]);

  // Calcolo CMP attuale deposito = Σ(livello × costo_medio) / Σ(livello)
  var cisterne = cisterneRes.data || [];
  var totL = 0, totV = 0;
  cisterne.forEach(function(c) {
    var l = Number(c.livello_attuale || 0);
    var cm = Number(c.costo_medio || 0);
    if (l > 0 && cm > 0) { totL += l; totV += l * cm; }
  });
  var cmpDep = totL > 0 ? (totV / totL) : 0;

  // Costruisce le options (stesso HTML per tutte le righe)
  var opts = '<option value="">Seleziona fornitore...</option>';
  (prezziRes.data || []).forEach(function(p) {
    var costo = Number(p.costo_litro || 0) + Number(p.trasporto_litro || 0);
    opts += '<option value="' + costo.toFixed(6) + '">' + esc(p.fornitore) + ' (€ ' + costo.toFixed(6).replace('.', ',') + ')</option>';
  });
  if (cmpDep > 0) {
    opts += '<option value="' + cmpDep.toFixed(6) + '" data-dep="1">PhoenixFuel Deposito (CMP € ' + cmpDep.toFixed(6).replace('.', ',') + ')</option>';
  }

  // Applica a tutti i dropdown delle righe esistenti (mantiene la selezione se ancora valida)
  document.querySelectorAll('.lfp-cmp-fornitore').forEach(function(sel) {
    var prevVal = sel.value;
    sel.innerHTML = opts;
    sel.value = prevVal; // resta su vuoto se il valore non esiste più
    // Ricalcola il costo della riga se il fornitore era valido
    var costoInp = sel.closest('.lfp-cmp-riga').querySelector('.lfp-cmp-costo');
    if (costoInp) costoInp.value = sel.value ? Number(sel.value).toFixed(6).replace('.', ',') : '';
  });
  _lfpRicalcola();
}

// ── Aggiunge una riga al calcolatore ──
function _lfpAggiungiRiga() {
  var wrap = document.getElementById('lfp-cmp-righe');
  if (!wrap) return;
  var html = '<div class="lfp-cmp-riga" style="display:grid;grid-template-columns:minmax(0,1fr) 110px 110px 60px 30px;gap:10px;align-items:center;margin-bottom:8px">';
  html += '<select class="lfp-cmp-fornitore" onchange="_lfpRiaggiornaCosto(this)" style="height:34px;font-size:12px"><option value="">Caricamento...</option></select>';
  html += '<input type="text" class="lfp-cmp-costo" readonly style="font-family:var(--font-mono);text-align:right;background:var(--bg-card);height:34px" placeholder="—" />';
  html += '<input type="number" class="lfp-cmp-litri" step="1" oninput="_lfpRicalcola()" style="font-family:var(--font-mono);text-align:right;height:34px" placeholder="0" />';
  html += '<div class="lfp-cmp-perc" style="text-align:right;font-family:var(--font-mono);font-weight:500;color:#378ADD;font-size:12px">—</div>';
  html += '<button type="button" onclick="this.closest(\'.lfp-cmp-riga\').remove();_lfpRicalcola()" title="Rimuovi riga" style="background:transparent;border:none;cursor:pointer;color:var(--text-muted);font-size:18px;padding:0;line-height:1">×</button>';
  html += '</div>';
  wrap.insertAdjacentHTML('beforeend', html);
  _lfpRipopolaFornitori();
}

// ── Quando cambia il fornitore in una riga, aggiorna il costo ──
function _lfpRiaggiornaCosto(sel) {
  var row = sel.closest('.lfp-cmp-riga');
  if (!row) return;
  var costoInp = row.querySelector('.lfp-cmp-costo');
  costoInp.value = sel.value ? Number(sel.value).toFixed(6).replace('.', ',') : '';
  _lfpRicalcola();
}

// ── Ricalcola totale ponderato + percentuali su tutte le righe ──
function _lfpRicalcola() {
  var righe = document.querySelectorAll('.lfp-cmp-riga');
  var totL = 0, totV = 0;
  var dati = [];
  righe.forEach(function(r) {
    var costo = parseFloat(String(r.querySelector('.lfp-cmp-costo').value || '0').replace(',', '.')) || 0;
    var litri = parseFloat(r.querySelector('.lfp-cmp-litri').value) || 0;
    dati.push({ row: r, costo: costo, litri: litri });
    if (costo > 0 && litri > 0) { totL += litri; totV += costo * litri; }
  });
  var cmp = totL > 0 ? (totV / totL) : 0;

  // Aggiorna percentuali per riga
  dati.forEach(function(d) {
    var perc = (totL > 0 && d.litri > 0 && d.costo > 0) ? (d.litri / totL * 100) : 0;
    d.row.querySelector('.lfp-cmp-perc').textContent = perc > 0 ? perc.toFixed(1).replace('.', ',') + '%' : '—';
  });

  // Aggiorna totale
  var totEl = document.getElementById('lfp-cmp-totale');
  if (totEl) {
    totEl.innerHTML = '€ ' + cmp.toFixed(6).replace('.', ',') + (totL > 0 ? ' <span style="font-size:11px;color:var(--text-muted);font-weight:400">su ' + totL.toLocaleString('it-IT') + ' L</span>' : '');
  }
  window._lfpCmpCalcolato = cmp;
}

// ── Copia il CMP calcolato nel campo Costo base ──
function _lfpUsaCostoBase() {
  var cmp = window._lfpCmpCalcolato || 0;
  if (!cmp || cmp <= 0) { toast('Compila almeno una riga con fornitore e litri'); return; }
  var inp = document.getElementById('lfp-costo');
  if (!inp) return;
  inp.value = cmp.toFixed(6);
  inp.style.background = '#E6F1FB';
  inp.style.borderColor = '#378ADD';
  toast('✓ Costo base aggiornato a € ' + cmp.toFixed(6).replace('.', ','));
}

function _lfpGeneraPDF() {
  var prodotto = document.getElementById('lfp-prodotto').value;
  var costo = parseFloat(document.getElementById('lfp-costo').value);
  if (!costo || costo <= 0) { toast('Inserisci il costo base €/L'); return; }
  var iva = parseInt(document.getElementById('lfp-iva').value) || 22;
  var trConsumo = parseFloat(document.getElementById('lfp-trasp-consumo').value) || 0.019;
  var trRete = parseFloat(document.getElementById('lfp-trasp-rete').value) || 0.014;
  var mDil = parseFloat(document.getElementById('lfp-marg-dil').value) || 0;
  var m30 = parseFloat(document.getElementById('lfp-marg-30').value) || 0;
  var mCont = parseFloat(document.getElementById('lfp-marg-cont').value) || 0;
  var mCol = parseFloat(document.getElementById('lfp-marg-col').value) || 0;

  function riga(trasporto) {
    var base = costo + trasporto;
    var fattIva = 1 + iva / 100;
    return {
      base: base, trasporto: trasporto,
      fasce: [
        { nome: 'Dilazionato', marg: mDil, netto: base + mDil, iva: (base + mDil) * fattIva },
        { nome: '30gg',        marg: m30,  netto: base + m30,  iva: (base + m30)  * fattIva },
        { nome: 'Contanti',    marg: mCont, netto: base + mCont, iva: (base + mCont) * fattIva },
        { nome: 'Colonnine',   marg: mCol,  netto: base + mCol,  iva: (base + mCol)  * fattIva }
      ]
    };
  }

  // Imposta _fasceData per riusare stampaListinoFasce (che legge da _fasceData)
  _fasceData = {
    prodotto: prodotto, costo: costo, iva: iva,
    consumo: riga(trConsumo),
    rete: riga(trRete)
  };

  chiudiModalePermessi();
  stampaListinoFasce();
}

async function generaOffertaCliente() {
  var w = _apriReport("Conferma Ordine"); if (!w) return;
  var clienteId = document.getElementById('lp-cliente-singolo').value;
  if (!clienteId) { toast('Seleziona un cliente'); return; }
  var prodotto = document.getElementById('lp-prodotto').value;
  var costo = parseFloat(document.getElementById('lp-costo').value);
  if (!costo || costo <= 0) { toast('Inserisci il costo base €/L'); return; }
  var trConsumo = parseFloat(document.getElementById('lp-trasp-consumo').value) || 0.019;
  var trRete = parseFloat(document.getElementById('lp-trasp-rete').value) || 0.014;
  var iva = parseInt(document.getElementById('lp-iva').value) || 22;

  var { data: cl } = await sb.from('clienti').select('*').eq('id', clienteId).single();
  if (!cl) { toast('Cliente non trovato'); return; }

  var seiMesiFa = new Date(); seiMesiFa.setMonth(seiMesiFa.getMonth() - 6);
  var { data: ordini } = await sb.from('ordini').select('litri,margine').eq('tipo_ordine','cliente').eq('prodotto',prodotto).neq('stato','annullato').or('cliente_id.eq.' + clienteId + ',cliente.eq.' + cl.nome).gte('data', seiMesiFa.toISOString().split('T')[0]);
  var totL = 0, totM = 0;
  (ordini || []).forEach(function(o) { totL += Number(o.litri); totM += Number(o.margine) * Number(o.litri); });
  var margMedioL = totL > 0 ? totM / totL : 0;
  var trasporto = cl.cliente_rete ? trRete : trConsumo;
  var prezzoNetto = costo + trasporto + margMedioL;
  var prezzoIva = Math.round(prezzoNetto * (1 + iva / 100) * 10000) / 10000;
  var dataOggi = new Date().toLocaleDateString('it-IT', { day: '2-digit', month: 'long', year: 'numeric' });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Conferma Ordine — ' + esc(cl.nome) + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm;color:#1a1a18}@media print{.no-print{display:none!important}@page{size:A4;margin:10mm}}table{width:100%;border-collapse:collapse}th{background:#D85A30;color:#fff;padding:8px 10px;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;text-align:left}td{padding:8px 10px;border-bottom:1px solid #eee;font-size:11px}</style></head><body>';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:3px solid #D85A30">';
  html += '<div><div style="font-size:22px;font-weight:bold;color:#D85A30;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#888;margin-top:4px;line-height:1.5">Porto Salvo Zona Industriale SNC<br>89900 Vibo Valentia (VV)<br>P.IVA IT02744150802</div></div>';
  html += '<div style="text-align:right"><div style="font-size:18px;font-weight:bold;color:#333">CONFERMA ORDINE</div>';
  html += '<div style="font-size:11px;color:#888;margin-top:6px">Data: ' + dataOggi + '</div></div></div>';

  // Destinatario
  html += '<div style="background:#f8f8f5;border:1px solid #eee;border-radius:8px;padding:16px;margin-bottom:20px">';
  html += '<div style="font-size:9px;text-transform:uppercase;color:#888;margin-bottom:8px;font-weight:600;letter-spacing:0.5px">Destinatario</div>';
  html += '<div style="font-size:16px;font-weight:bold">' + esc(cl.nome) + '</div>';
  if (cl.piva) html += '<div style="font-size:11px;color:#555;margin-top:4px">P.IVA: ' + esc(cl.piva) + '</div>';
  if (cl.codice_fiscale) html += '<div style="font-size:11px;color:#555">C.F.: ' + esc(cl.codice_fiscale) + '</div>';
  if (cl.indirizzo) html += '<div style="font-size:11px;color:#555;margin-top:4px">' + esc(cl.indirizzo) + '</div>';
  if (cl.citta) html += '<div style="font-size:11px;color:#555">' + esc(cl.citta) + (cl.provincia ? ' (' + cl.provincia + ')' : '') + '</div>';
  html += '</div>';

  // Tabella ordine
  html += '<table>';
  html += '<thead><tr><th>Prodotto</th><th style="text-align:right">Prezzo €/L (IVA escl.)</th><th style="text-align:right">IVA</th><th style="text-align:right">Prezzo €/L (IVA incl.)</th></tr></thead>';
  html += '<tbody>';
  html += '<tr><td style="font-size:13px;font-weight:600">' + esc(prodotto) + '</td>';
  html += '<td style="text-align:right;font-family:monospace;font-size:14px;font-weight:500">€ ' + prezzoNetto.toFixed(6) + '</td>';
  html += '<td style="text-align:right;font-size:12px;color:#666">' + iva + '%</td>';
  html += '<td style="text-align:right;font-family:monospace;font-size:16px;font-weight:bold;color:#D85A30">€ ' + prezzoIva.toFixed(6) + '</td></tr>';
  html += '</tbody></table>';

  // Condizioni
  html += '<div style="margin-top:24px;padding:14px 16px;background:#f8f8f5;border-radius:8px;font-size:10px;color:#666;line-height:1.7">';
  html += '<div style="font-weight:600;color:#333;margin-bottom:4px">Condizioni di fornitura:</div>';
  html += 'Pagamento a <strong>' + (cl.giorni_pagamento || 30) + ' giorni</strong> data fattura · Consegna franco destino · ';
  html += 'Prezzo valido alla data di emissione e soggetto a variazioni di mercato · ';
  html += 'Quantità minima di ordine: da concordare</div>';

  // Firme
  html += '<div style="margin-top:50px;display:flex;justify-content:space-between">';
  html += '<div style="text-align:center"><div style="border-top:1px solid #ccc;width:220px;padding-top:8px;font-size:10px;color:#888">Per Phoenix Fuel Srl</div></div>';
  html += '<div style="text-align:center"><div style="border-top:1px solid #ccc;width:220px;padding-top:8px;font-size:10px;color:#888">Per accettazione</div><div style="font-size:9px;color:#aaa;margin-top:2px">' + esc(cl.nome) + '</div></div></div>';

  // Footer
  html += '<div style="margin-top:30px;text-align:center;font-size:8px;color:#bbb;border-top:1px solid #eee;padding-top:8px">Phoenix Fuel Srl — Documento generato il ' + dataOggi + '</div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════
// EXPORT ORDINI → DANEA EASYFATT XML
// ═══════════════════════════════════════════════════════════════════

async function esportaDaneaXml() {
  var da = document.getElementById('danea-da')?.value;
  var a = document.getElementById('danea-a')?.value;
  var tipoFiltro = document.getElementById('danea-tipo')?.value || 'tutti';
  if (!da || !a) { toast('Seleziona il periodo di export'); return; }

  // Tipi da esportare (escluso stazione_servizio = mov interno)
  var tipiDaEsportare = [];
  if (tipoFiltro === 'tutti') tipiDaEsportare = ['cliente','entrata_deposito','autoconsumo'];
  else tipiDaEsportare = [tipoFiltro];

  // Carica ordini
  var allOrdini = [], from = 0, hasMore = true;
  while (hasMore) {
    var { data: batch } = await sb.from('ordini').select('*')
      .in('tipo_ordine', tipiDaEsportare).neq('stato','annullato')
      .gte('data', da).lte('data', a).order('data').order('cliente')
      .range(from, from + 999);
    if (batch && batch.length) { allOrdini = allOrdini.concat(batch); from += 1000; } else { hasMore = false; }
  }
  if (!allOrdini.length) { toast('Nessun ordine nel periodo selezionato'); return; }

  // Carica anagrafiche clienti
  var clienteIds = [...new Set(allOrdini.map(function(o){ return o.cliente_id; }).filter(Boolean))];
  var clientiMap = {};
  for (var i = 0; i < clienteIds.length; i += 50) {
    var chunk = clienteIds.slice(i, i + 50);
    var { data: cls } = await sb.from('clienti').select('*').in('id', chunk);
    (cls||[]).forEach(function(c) { clientiMap[c.id] = c; });
  }

  // Carica fornitori
  var { data: fornitori } = await sb.from('fornitori').select('*');
  var fornitoriMap = {};
  (fornitori||[]).forEach(function(f) { fornitoriMap[f.nome] = f; });

  // Carica sedi scarico
  var { data: sedi } = await sb.from('sedi_scarico').select('*');
  var sediMap = {};
  (sedi||[]).forEach(function(s) { sediMap[s.id] = s; });

  // XML
  var xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
  xml += '<EasyfattDocuments AppVersion="2" Creator="PhoenixFuel" CreatorUrl="phoenixfuel.onrender.com">\n';
  xml += '  <Company>\n    <n>Phoenix Fuel Srl</n>\n    <City>Vibo Valentia</City>\n    <Province>VV</Province>\n    <Country>Italia</Country>\n  </Company>\n';
  xml += '  <Documents>\n';

  var numCl = parseInt(document.getElementById('danea-start-cliente')?.value) || 0;
  var numForn = parseInt(document.getElementById('danea-start-fornitore')?.value) || 0;
  var numAuto = parseInt(document.getElementById('danea-start-autofattura')?.value) || 0;

  allOrdini.forEach(function(o) {
    if (o.tipo_ordine === 'cliente') { numCl++; _daneaCliente(o, numCl); }
    else if (o.tipo_ordine === 'entrata_deposito') { numForn++; _daneaFornitore(o, numForn); }
    else if (o.tipo_ordine === 'autoconsumo') { numAuto++; _daneaAutofattura(o, numAuto); }
  });

  function _daneaAnagCliente(cl) {
    var h = '';
    if (cl.codice_danea) h += '      <CustomerCode>' + _xmlEsc(cl.codice_danea) + '</CustomerCode>\n';
    h += '      <CustomerName>' + _xmlEsc(cl.nome) + '</CustomerName>\n';
    if (cl.indirizzo) h += '      <CustomerAddress>' + _xmlEsc(cl.indirizzo) + '</CustomerAddress>\n';
    if (cl.cap) h += '      <CustomerPostcode>' + _xmlEsc(cl.cap) + '</CustomerPostcode>\n';
    if (cl.citta) h += '      <CustomerCity>' + _xmlEsc(cl.citta) + '</CustomerCity>\n';
    if (cl.provincia) h += '      <CustomerProvince>' + _xmlEsc(cl.provincia) + '</CustomerProvince>\n';
    h += '      <CustomerCountry>Italia</CustomerCountry>\n';
    if (cl.codice_fiscale) h += '      <CustomerFiscalCode>' + _xmlEsc(cl.codice_fiscale) + '</CustomerFiscalCode>\n';
    if (cl.piva) h += '      <CustomerVatCode>' + _xmlEsc(cl.piva) + '</CustomerVatCode>\n';
    if (cl.telefono) h += '      <CustomerTel>' + _xmlEsc(cl.telefono) + '</CustomerTel>\n';
    if (cl.email) h += '      <CustomerEmail>' + _xmlEsc(cl.email) + '</CustomerEmail>\n';
    if (cl.pec) h += '      <CustomerPec>' + _xmlEsc(cl.pec) + '</CustomerPec>\n';
    if (cl.sdi) h += '      <CustomerEInvoiceDestCode>' + _xmlEsc(cl.sdi) + '</CustomerEInvoiceDestCode>\n';
    return h;
  }

  function _daneaCliente(o, num) {
    var cl = o.cliente_id ? clientiMap[o.cliente_id] : null;
    var sede = o.sede_scarico_id ? sediMap[o.sede_scarico_id] : null;
    var pNetto = Number(o.costo_litro||0) + Number(o.trasporto_litro||0) + Number(o.margine||0);
    var iva = Number(o.iva||22);
    var totN = pNetto * Number(o.litri);
    var totI = totN * (iva/100);
    xml += '    <Document>\n      <DocumentType>C</DocumentType>\n';
    xml += '      <Date>' + _xmlEsc(o.data) + '</Date>\n      <Number>' + num + '</Number>\n';
    xml += cl ? _daneaAnagCliente(cl) : '      <CustomerName>' + _xmlEsc(o.cliente) + '</CustomerName>\n';
    if (sede) {
      xml += '      <DeliveryName>' + _xmlEsc(sede.nome||o.cliente) + '</DeliveryName>\n';
      if (sede.indirizzo) xml += '      <DeliveryAddress>' + _xmlEsc(sede.indirizzo) + '</DeliveryAddress>\n';
      if (sede.citta) xml += '      <DeliveryCity>' + _xmlEsc(sede.citta) + '</DeliveryCity>\n';
      if (sede.provincia) xml += '      <DeliveryProvince>' + _xmlEsc(sede.provincia) + '</DeliveryProvince>\n';
    }
    xml += '      <TransportReason>Vendita</TransportReason>\n      <GoodsAppearance>Sfuso</GoodsAppearance>\n';
    xml += '      <TotalWithoutTax>' + totN.toFixed(2) + '</TotalWithoutTax>\n      <VatAmount>' + totI.toFixed(2) + '</VatAmount>\n      <Total>' + (totN+totI).toFixed(2) + '</Total>\n';
    xml += '      <PricesIncludeVat>false</PricesIncludeVat>\n';
    xml += '      <InternalComment>' + _xmlEsc(o.note||'') + '</InternalComment>\n';
    xml += '      <CustomField1>PF-' + o.id.substring(0,8) + '</CustomField1>\n';
    if (o.smistamento) xml += '      <CustomField2>Smistamento</CustomField2>\n';
    xml += '      <Rows>\n        <Row>\n';
    xml += '          <Code>' + _xmlEsc(_codProdottoDanea(o.prodotto)) + '</Code>\n';
    xml += '          <Description>' + _xmlEsc(o.prodotto) + '</Description>\n';
    xml += '          <Qty>' + Number(o.litri) + '</Qty>\n          <Um>LT</Um>\n';
    xml += '          <Price>' + pNetto.toFixed(6) + '</Price>\n';
    xml += '          <VatCode Perc="' + iva + '" Class="Imponibile" Description="Aliquota ' + iva + '%">' + iva + '</VatCode>\n';
    xml += '          <Stock>true</Stock>\n';
    xml += '          <Notes>Costo ' + Number(o.costo_litro||0).toFixed(6) + ' + Trasp ' + Number(o.trasporto_litro||0).toFixed(6) + ' + Marg ' + Number(o.margine||0).toFixed(6) + '</Notes>\n';
    xml += '        </Row>\n      </Rows>\n';
    xml += '      <Payments>\n        <Payment>\n          <Advance>false</Advance>\n';
    xml += '          <Date>' + _xmlEsc(o.data_scadenza||o.data) + '</Date>\n';
    xml += '          <Amount>' + (totN+totI).toFixed(2) + '</Amount>\n';
    xml += '          <Paid>' + (o.pagato?'true':'false') + '</Paid>\n';
    xml += '        </Payment>\n      </Payments>\n    </Document>\n';
  }

  function _daneaFornitore(o, num) {
    var forn = fornitoriMap[o.fornitore] || null;
    var costo = Number(o.costo_litro||0);
    var iva = Number(o.iva||22);
    var totN = costo * Number(o.litri);
    var totI = totN * (iva/100);
    xml += '    <Document>\n      <DocumentType>E</DocumentType>\n';
    xml += '      <Date>' + _xmlEsc(o.data) + '</Date>\n      <Number>' + num + '</Number>\n';
    if (forn) {
      if (forn.codice_danea) xml += '      <CustomerCode>' + _xmlEsc(forn.codice_danea) + '</CustomerCode>\n';
      xml += '      <CustomerName>' + _xmlEsc(forn.nome) + '</CustomerName>\n';
      if (forn.indirizzo) xml += '      <CustomerAddress>' + _xmlEsc(forn.indirizzo) + '</CustomerAddress>\n';
      if (forn.piva) xml += '      <CustomerVatCode>' + _xmlEsc(forn.piva) + '</CustomerVatCode>\n';
      if (forn.codice_fiscale) xml += '      <CustomerFiscalCode>' + _xmlEsc(forn.codice_fiscale) + '</CustomerFiscalCode>\n';
      if (forn.email) xml += '      <CustomerEmail>' + _xmlEsc(forn.email) + '</CustomerEmail>\n';
      if (forn.pec) xml += '      <CustomerPec>' + _xmlEsc(forn.pec) + '</CustomerPec>\n';
    } else {
      xml += '      <CustomerName>' + _xmlEsc(o.fornitore) + '</CustomerName>\n';
    }
    xml += '      <TotalWithoutTax>' + totN.toFixed(2) + '</TotalWithoutTax>\n      <VatAmount>' + totI.toFixed(2) + '</VatAmount>\n      <Total>' + (totN+totI).toFixed(2) + '</Total>\n';
    xml += '      <PricesIncludeVat>false</PricesIncludeVat>\n';
    xml += '      <InternalComment>' + _xmlEsc(o.note||'') + '</InternalComment>\n';
    xml += '      <CustomField1>PF-' + o.id.substring(0,8) + '</CustomField1>\n';
    xml += '      <Rows>\n        <Row>\n';
    xml += '          <Code>' + _xmlEsc(_codProdottoDanea(o.prodotto)) + '</Code>\n';
    xml += '          <Description>' + _xmlEsc(o.prodotto) + '</Description>\n';
    xml += '          <Qty>' + Number(o.litri) + '</Qty>\n          <Um>LT</Um>\n';
    xml += '          <Price>' + costo.toFixed(6) + '</Price>\n';
    xml += '          <VatCode Perc="' + iva + '" Class="Imponibile" Description="Aliquota ' + iva + '%">' + iva + '</VatCode>\n';
    xml += '          <Stock>true</Stock>\n';
    xml += '        </Row>\n      </Rows>\n';
    xml += '      <Payments>\n        <Payment>\n          <Advance>false</Advance>\n';
    xml += '          <Date>' + _xmlEsc(o.data_scadenza||o.data) + '</Date>\n';
    xml += '          <Amount>' + (totN+totI).toFixed(2) + '</Amount>\n';
    xml += '          <Paid>' + (o.pagato?'true':'false') + '</Paid>\n';
    xml += '        </Payment>\n      </Payments>\n    </Document>\n';
  }

  function _daneaAutofattura(o, num) {
    var costo = Number(o.costo_litro||0);
    var iva = Number(o.iva||22);
    var totN = costo * Number(o.litri);
    var totI = totN * (iva/100);
    xml += '    <Document>\n      <DocumentType>M</DocumentType>\n';
    xml += '      <Date>' + _xmlEsc(o.data) + '</Date>\n      <Number>' + num + '</Number>\n';
    xml += '      <CustomerName>Phoenix Fuel Srl</CustomerName>\n';
    xml += '      <CustomerCity>Vibo Valentia</CustomerCity>\n      <CustomerProvince>VV</CustomerProvince>\n      <CustomerCountry>Italia</CustomerCountry>\n';
    xml += '      <TotalWithoutTax>' + totN.toFixed(2) + '</TotalWithoutTax>\n      <VatAmount>' + totI.toFixed(2) + '</VatAmount>\n      <Total>' + (totN+totI).toFixed(2) + '</Total>\n';
    xml += '      <PricesIncludeVat>false</PricesIncludeVat>\n';
    xml += '      <InternalComment>Autoconsumo: ' + _xmlEsc(o.note||o.prodotto) + '</InternalComment>\n';
    xml += '      <CustomField1>PF-' + o.id.substring(0,8) + '</CustomField1>\n';
    xml += '      <Rows>\n        <Row>\n';
    xml += '          <Code>' + _xmlEsc(_codProdottoDanea(o.prodotto)) + '</Code>\n';
    xml += '          <Description>Autoconsumo ' + _xmlEsc(o.prodotto) + '</Description>\n';
    xml += '          <Qty>' + Number(o.litri) + '</Qty>\n          <Um>LT</Um>\n';
    xml += '          <Price>' + costo.toFixed(6) + '</Price>\n';
    xml += '          <VatCode Perc="' + iva + '" Class="Imponibile" Description="Aliquota ' + iva + '%">' + iva + '</VatCode>\n';
    xml += '          <Stock>true</Stock>\n';
    xml += '        </Row>\n      </Rows>\n';
    xml += '    </Document>\n';
  }

  xml += '  </Documents>\n</EasyfattDocuments>';

  // Download
  var blob = new Blob([xml], {type:'application/xml'});
  var url = URL.createObjectURL(blob);
  var a2 = document.createElement('a');
  a2.href = url;
  a2.download = 'PhoenixFuel_' + tipoFiltro + '_' + da + '_' + a + '.DefXml';
  document.body.appendChild(a2); a2.click(); document.body.removeChild(a2);
  URL.revokeObjectURL(url);

  var riepilogo = [];
  if (numCl) riepilogo.push(numCl + ' ordini cliente');
  if (numForn) riepilogo.push(numForn + ' ordini fornitore');
  if (numAuto) riepilogo.push(numAuto + ' autofatture');
  toast('Export completato! ' + riepilogo.join(' + '));
  _auditLog('export_danea', 'ordini', da + ' → ' + a + ': ' + riepilogo.join(', '));
}

function _xmlEsc(str) {
  if (!str) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}

function _codProdottoDanea(prodotto) {
  var map = { 'Gasolio Autotrazione':'GA', 'Benzina':'BZ', 'Gasolio Agricolo':'GAGR', 'HVO':'HVO' };
  return map[prodotto] || prodotto.substring(0, 4).toUpperCase();
}


// ═══════════════════════════════════════════════════════════════════
// PATCH v20260503r — Badge accoppiamento fattura nella tabella ordini
// Display-only: nessuna scrittura DB, solo lettura.
// Reversibile: setta _SUBROW_ATTIVO a false per disabilitare istantaneamente.
// ═══════════════════════════════════════════════════════════════════

var _SUBROW_ATTIVO = true;
var _mappaAccoppiamenti = {};

// Per ogni ordine costruisce: ordine.id → { fatturaNum, anno, ordineDanea, anomaliaDoppia }
async function _costruisciMappaAccoppiamenti(ordini) {
  if (!_SUBROW_ATTIVO) { _mappaAccoppiamenti = {}; return; }
  if (!ordini || !ordini.length) { _mappaAccoppiamenti = {}; return; }
  try {
    _mappaAccoppiamenti = {};

    var ordiniConRiga = ordini.filter(function(o) { return o.fattura_riga_id; });
    if (ordiniConRiga.length === 0) return;

    var rigaIds = [];
    var mapRigaToOrdine = {};
    ordiniConRiga.forEach(function(o) {
      if (rigaIds.indexOf(o.fattura_riga_id) < 0) rigaIds.push(o.fattura_riga_id);
      if (!mapRigaToOrdine[o.fattura_riga_id]) mapRigaToOrdine[o.fattura_riga_id] = [];
      mapRigaToOrdine[o.fattura_riga_id].push(o.id);
    });

    var righeData = [];
    for (var i = 0; i < rigaIds.length; i += 200) {
      var chunk = rigaIds.slice(i, i + 200);
      var resR = await sb.from('fatture_righe')
        .select('id,fattura_id,ordine_danea_numero,fatture_emesse(numero,anno)')
        .in('id', chunk);
      if (resR.error) { console.error('[mappa-accopp]', resR.error); continue; }
      righeData = righeData.concat(resR.data || []);
    }

    var righeAnomale = new Set();
    for (var j = 0; j < rigaIds.length; j += 200) {
      var chunkR = rigaIds.slice(j, j + 200);
      var resA = await sb.from('ordini')
        .select('fattura_riga_id')
        .in('fattura_riga_id', chunkR);
      if (resA.error) { console.error('[mappa-accopp-anom]', resA.error); continue; }
      var conteggi = {};
      (resA.data || []).forEach(function(o) {
        if (!o.fattura_riga_id) return;
        conteggi[o.fattura_riga_id] = (conteggi[o.fattura_riga_id] || 0) + 1;
      });
      Object.keys(conteggi).forEach(function(rId) {
        if (conteggi[rId] > 1) righeAnomale.add(rId);
      });
    }

    righeData.forEach(function(rg) {
      var ordIds = mapRigaToOrdine[rg.id] || [];
      ordIds.forEach(function(ordId) {
        _mappaAccoppiamenti[ordId] = {
          fatturaNum: rg.fatture_emesse ? rg.fatture_emesse.numero : null,
          anno: rg.fatture_emesse ? rg.fatture_emesse.anno : null,
          fatturaId: rg.fattura_id,
          ordineDanea: rg.ordine_danea_numero || null,
          anomaliaDoppia: righeAnomale.has(rg.id)
        };
      });
    });
  } catch (e) {
    console.error('[mappa-accopp]', e);
    _mappaAccoppiamenti = {};
  }
}

// Render badge inline per la cella data della riga ordine.
function _renderBadgeFatturaInline(r) {
  if (!_SUBROW_ATTIVO) return '';
  if (r.tipo_ordine !== 'cliente' && r.tipo_ordine !== 'stazione_servizio') return '';
  if (r.stato === 'annullato') return '';

  var info = _mappaAccoppiamenti[r.id];
  if (!info) {
    return '<div style="margin-top:3px"><span style="display:inline-block;background:#FAEEDA;color:#633806;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:500">⚠ Senza fattura</span></div>';
  }
  if (info.anomaliaDoppia) {
    var fat = info.fatturaNum ? esc(info.fatturaNum) : '?';
    var ttl = "Anomalia: piu' ordini sulla stessa riga fattura. Apri Fatture > Allineamento > Diagnostica per riassegnare.";
    return '<div style="margin-top:3px" title="' + ttl + '"><span style="display:inline-block;background:#FCEBEB;color:#501313;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:500;cursor:help">⚠ Anomalia Fatt ' + fat + '</span></div>';
  }
  var partiTesto = '🧾 Fatt ' + (info.fatturaNum ? esc(info.fatturaNum) : '?');
  if (info.ordineDanea) partiTesto += ' · Ord ' + esc(info.ordineDanea);
  return '<div style="margin-top:3px"><span style="display:inline-block;background:#EAF3DE;color:#173404;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:500">' + partiTesto + '</span></div>';
}
