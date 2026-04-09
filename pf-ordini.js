// PhoenixFuel — Area Cliente, Prezzi, Ordini, Fido
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
    tbStorico.innerHTML = ordini.map(r => '<tr><td>' + fmtD(r.data) + '</td><td>' + r.prodotto + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmt(prezzoConIva(r)) + '</td><td style="font-family:var(--font-mono)">' + fmtE(prezzoConIva(r)*r.litri) + '</td><td>' + badgeStato(r.stato) + '</td></tr>').join('');
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
  document.getElementById('calc-noiva').textContent = '€ ' + noiva.toFixed(4);
  document.getElementById('calc-iva').textContent = '€ ' + (noiva*(1+iva/100)).toFixed(4);
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
  const record = { data, fornitore:fornitoreNome, fornitore_id:fornitoreId||null, base_carico_id:baseId, prodotto, costo_litro:costo, trasporto_litro:trasporto, margine, iva:parseInt(document.getElementById('pr-iva').value) };
  const { error } = await sb.from('prezzi').insert([record]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('Prezzo salvato!');
  caricaPrezzi();
  // Auto-aggiorna benchmark dalla media prezzi del giorno
  _aggiornaBenchmarkAuto(data);
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
  const best = {};
  tuttiPrezzi.forEach(r => { const k=r.data+'_'+r.prodotto; if(!best[k]||prezzoNoIva(r)<prezzoNoIva(best[k])) best[k]=r; });

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

  // Raggruppa per prodotto
  const perProdotto = {};
  Object.keys(tabMap).forEach(p => { perProdotto[p] = []; });
  tuttiPrezzi.forEach(r => {
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
      html += '<tr><td>' + fmtD(r.data) + '</td><td><span style="' + forStyle + '">' + r.fornitore + '</span>' + giacenzaHtml + '</td><td>' + basNome + '</td>' + tdCosto + tdTrasporto + tdMargine + '<td style="font-family:var(--font-mono)">' + fmt(prezzoNoIva(r)) + '</td><td style="font-family:var(--font-mono);font-weight:600">' + fmt(prezzoConIva(r)) + '</td><td>' + azione + '</td></tr>';
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
    html += '<div class="form-group"><label>Nuovo costo medio/L</label><input type="number" id="dep-nuovo-costo" step="0.0001" value="' + nv.toFixed(4) + '" /></div>';
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

  const { error } = await sb.from('cisterne').update({ costo_medio: nuovoCosto, updated_at: new Date().toISOString() }).eq('tipo', tipo);
  if (error) { toast('Errore: ' + error.message); return; }

  // Invalida cache cisterne
  _cacheCisterne = null;

  toast('Costo medio ' + prodotto + ' aggiornato a ' + fmt(nuovoCosto));
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
    if (clienteId) {
      const cacheKey = clienteId + '_' + prodotto;
      if (_cacheMarginClienti[cacheKey] !== undefined) {
        margineDaUsare = _cacheMarginClienti[cacheKey];
      } else {
        const clienteNome = cacheClienti.find(c=>c.id===clienteId)?.nome || '';
        if (clienteNome) {
          const { data: ordPrec } = await sb.from('ordini').select('margine').or('cliente_id.eq.' + clienteId + ',cliente.eq.' + clienteNome).eq('prodotto', prodotto).neq('stato','annullato').eq('tipo_ordine','cliente').gt('margine',0).order('data',{ascending:false}).limit(10);
          if (ordPrec && ordPrec.length > 0) {
            margineDaUsare = ordPrec.reduce((s, o) => s + Number(o.margine), 0) / ordPrec.length;
          }
          _cacheMarginClienti[cacheKey] = margineDaUsare;
        }
      }
    }

    mgInput.value = margineDaUsare.toFixed(4);
    const noIva = Number(match.costo_litro) + Number(match.trasporto_litro) + margineDaUsare;
    pnInput.value = noIva.toFixed(4);
    aggiornaPrevOrdine();
  } else {
    prezzoCorrente = null;
    ['prev-costo','prev-trasporto','prev-margine','prev-prezzo-netto','prev-prezzo','prev-totale'].forEach(id => document.getElementById(id).textContent = '—');
  }
}

// Aggiorna da margine → calcola prezzo netto
function aggiornaPrevDaMargine() {
  if (!prezzoCorrente) return;
  const trasporto = parseFloat(document.getElementById('ord-trasporto-custom').value) || 0;
  const margine = parseFloat(document.getElementById('ord-margine-custom').value) || 0;
  const noIva = Number(prezzoCorrente.costo_litro) + trasporto + margine;
  document.getElementById('ord-prezzo-netto').value = noIva.toFixed(4);
  aggiornaPrevOrdine();
}

// Aggiorna da trasporto → calcola prezzo netto
function aggiornaPrevDaTrasporto() {
  if (!prezzoCorrente) return;
  const trasporto = parseFloat(document.getElementById('ord-trasporto-custom').value) || 0;
  const margine = parseFloat(document.getElementById('ord-margine-custom').value) || 0;
  const noIva = Number(prezzoCorrente.costo_litro) + trasporto + margine;
  document.getElementById('ord-prezzo-netto').value = noIva.toFixed(4);
  aggiornaPrevOrdine();
}

// Aggiorna da prezzo netto → calcola margine
function aggiornaPrevDaPrezzo() {
  if (!prezzoCorrente) return;
  const prezzoNetto = parseFloat(document.getElementById('ord-prezzo-netto').value) || 0;
  const trasporto = parseFloat(document.getElementById('ord-trasporto-custom').value) || 0;
  const margine = prezzoNetto - Number(prezzoCorrente.costo_litro) - trasporto;
  document.getElementById('ord-margine-custom').value = margine.toFixed(4);
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
  const margine = parseFloat(document.getElementById('ord-margine-custom').value) || 0;
  if (margine <= 0 && tipo === 'cliente') {
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
  return '<tr><td>' + fmtD(r.data) + badgeFuturo + '</td><td>' + badgeStato(r.tipo_ordine||'cliente') + '</td><td>' + esc(r.cliente) + destHtml + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td>' + esc(r.fornitore) + '</td><td>' + esc(basNome) + '</td><td class="editable" onclick="editaCella(this,\'ordini\',\'trasporto_litro\',\'' + r.id + '\',' + r.trasporto_litro + ')" style="font-family:var(--font-mono)">' + fmt(r.trasporto_litro) + '</td><td class="editable" onclick="editaCella(this,\'ordini\',\'margine\',\'' + r.id + '\',' + r.margine + ')" style="font-family:var(--font-mono)">' + fmtM(r.margine) + '</td><td style="font-family:var(--font-mono)">' + fmt(pL) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td><td style="font-size:11px;color:var(--text-hint)">' + (r.data_scadenza?fmtD(r.data_scadenza):'—') + '</td><td>' + badgeStato(r.stato) + '</td><td>' + btnCisterna + btnAnnullaOp + '<button class="btn-edit" title="DAS" onclick="mostraDasOrdine(\'' + r.id + '\')">🚛</button><button class="btn-edit" title="Conferma ordine PDF" onclick="apriConfermaOrdine(\'' + r.id + '\')">📄</button><button class="btn-edit" onclick="apriModaleOrdine(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'ordini\',\'' + r.id + '\',caricaOrdini)">x</button></td></tr>';
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
  _popolaOrdiniConDas(filtrati.map(function(o){return o.id;})).then(function() {
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
        prezzi.push({ fornitore:'PhoenixFuel (Deposito)', basi_carico:{nome:baseDeposito.nome}, prodotto:prod, costo_litro:cmp, trasporto_litro:ovr.trasporto||0, iva:prodInfo?prodInfo.iva_default:22, _giacenza:Math.round(d.litri), _isDeposito:true });
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

  // Sezioni per prodotto
  prodottiOrdinati.forEach(function(prodotto) {
    var lista = perProdotto[prodotto];
    var col = coloriProdotto[prodotto] || '#888';

    // Ordina per prezzo (miglior prezzo prima)
    lista.sort(function(a, b) { return Number(a.costo_litro) - Number(b.costo_litro); });
    var best = lista.length > 0 ? Number(lista[0].costo_litro) : 0;

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
      var isBest = Number(r.costo_litro) === best && lista.length > 1;
      var bestTag = isBest ? ' <span style="font-size:8px;background:#639922;color:#fff;padding:1px 6px;border-radius:8px;vertical-align:middle">BEST</span>' : '';
      var bgRow = isBest ? 'background:#EAF3DE' : (i % 2 ? 'background:#fafaf5' : '');

      html += '<tr style="' + bgRow + '">';
      var giacTag = r._isDeposito && r._giacenza ? ' <span style="font-size:8px;background:#EAF3DE;color:#27500A;padding:1px 6px;border-radius:8px;vertical-align:middle">' + r._giacenza.toLocaleString('it-IT') + ' L</span>' : '';
      html += '<td style="font-weight:600;font-size:12px">' + esc(r.fornitore) + bestTag + giacTag + '</td>';
      html += '<td>' + esc(r.basi_carico ? r.basi_carico.nome : '—') + '</td>';
      html += '<td class="m" style="font-size:15px;font-weight:bold;color:' + col + '">' + Number(r.costo_litro).toFixed(4) + '</td>';
      html += '<td class="m">' + Number(r.trasporto_litro || 0).toFixed(4) + '</td>';
      html += '<td class="m" style="font-weight:600;font-size:13px">' + costoTot.toFixed(4) + '</td>';
      html += '<td style="text-align:center">' + ivaPerc + '%</td>';
      html += '<td class="m" style="font-weight:500;font-size:13px">' + prezzoIva.toFixed(4) + '</td>';
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
  html += '<div class="form-group"><label>Stato</label><select id="mod-stato">';
  ['in attesa','confermato','programmato','annullato'].forEach(s => { html += '<option value="' + s + '"' + (r.stato===s?' selected':'') + '>' + s + '</option>'; });
  html += '</select></div>';
  html += '<div class="form-group"><label>Litri</label><input type="number" id="mod-litri" value="' + r.litri + '" /></div>';
  html += '<div class="form-group"><label>Costo/L</label><input type="number" id="mod-costo" step="0.0001" value="' + r.costo_litro + '" onchange="aggiornaPreviewModifica()" /></div>';
  html += '<div class="form-group"><label>Trasporto/L</label><input type="number" id="mod-trasporto" step="0.0001" value="' + r.trasporto_litro + '" onchange="aggiornaPreviewModifica()" /></div>';
  html += '<div class="form-group"><label>Margine/L</label><input type="number" id="mod-margine" step="0.0001" value="' + r.margine + '" onchange="aggiornaPreviewModifica()" /></div>';
  html += '<div class="form-group"><label>Prezzo netto/L</label><input type="number" id="mod-prezzo-netto" step="0.0001" value="' + (Number(r.costo_litro)+Number(r.trasporto_litro)+Number(r.margine)).toFixed(4) + '" onchange="aggiornaMargineDaPrezzo()" /></div>';
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

  const { data: ordine } = await sb.from('ordini').select('data').eq('id', id).single();
  const dataScad = new Date(ordine.data); dataScad.setDate(dataScad.getDate()+ggPag);
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
  const { error } = await sb.from('ordini').update({ stato:document.getElementById('mod-stato').value, litri, costo_litro:costo, trasporto_litro:trasporto, margine, iva, giorni_pagamento:ggPag, data_scadenza:dataScad.toISOString().split('T')[0], note:document.getElementById('mod-note').value, destinazione:modDest, sede_scarico_id:modSedeId, sede_scarico_nome:modSedeNome }).eq('id', id);
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
  html += '<div style="font-family:var(--font-mono);color:var(--text-muted);text-decoration:line-through">' + _modOrigCosto.toFixed(4) + '</div>';
  html += '<div style="font-family:var(--font-mono);font-weight:600;color:' + txtWarn + '">' + nuovoCosto.toFixed(4) + '</div>';
  html += '<div style="color:var(--text-muted)">Trasporto €/L</div>';
  html += '<div style="font-family:var(--font-mono);color:var(--text-muted)' + (trasportoCambiato ? ';text-decoration:line-through' : '') + '">' + _modOrigTrasporto.toFixed(4) + '</div>';
  html += '<div style="font-family:var(--font-mono);' + (trasportoCambiato ? 'font-weight:600;color:' + txtWarn : 'color:var(--text-muted)') + '">' + nuovoTrasporto.toFixed(4) + '</div>';
  html += '<div style="color:var(--text-muted)">Margine €/L</div>';
  html += '<div style="font-family:var(--font-mono);color:var(--text-muted)">' + margineCorrente.toFixed(4) + '</div>';
  html += '<div style="font-family:var(--font-mono);color:var(--text-muted)">' + margineCorrente.toFixed(4) + '</div>';
  html += '<div style="border-top:0.5px solid var(--border);padding-top:6px;font-weight:600">Prezzo netto €/L</div>';
  html += '<div style="border-top:0.5px solid var(--border);padding-top:6px;font-family:var(--font-mono);font-weight:600">' + prezzoOrig.toFixed(4) + '</div>';
  html += '<div style="border-top:0.5px solid var(--border);padding-top:6px;font-family:var(--font-mono);font-weight:600;color:' + txtWarn + '">' + prezzoNuovo.toFixed(4) + ' (' + (deltaPrezzo>=0?'+':'') + deltaPrezzo.toFixed(4) + ')</div>';
  html += '</div></div>';

  // Opzione 1: mantieni prezzo cliente, ricalcola margine
  html += '<button onclick="_optMantieniPrezzo(\'' + id + '\',' + nuovoCosto + ',' + nuovoTrasporto + ',' + margineRicalc + ')" style="display:block;width:100%;text-align:left;padding:12px 14px;border:0.5px solid #639922;background:' + bgOk + ';border-radius:8px;cursor:pointer;margin-bottom:8px">';
  html += '<div style="font-weight:600;font-size:13px;color:' + txtOk + '">✓ Mantieni prezzo netto cliente € ' + prezzoOrig.toFixed(4) + '/L</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Il margine viene ricalcolato: ' + margineCorrente.toFixed(4) + ' → ' + margineRicalc.toFixed(4) + ' €/L</div>';
  html += '</button>';

  // Opzione 2: accetta nuovo prezzo
  html += '<button onclick="_optAccettaNuovoPrezzo(\'' + id + '\',' + nuovoCosto + ',' + nuovoTrasporto + ',' + margineCorrente + ')" style="display:block;width:100%;text-align:left;padding:12px 14px;border:0.5px solid #BA7517;background:' + bgWarn + ';border-radius:8px;cursor:pointer;margin-bottom:8px">';
  html += '<div style="font-weight:600;font-size:13px;color:' + txtWarn + '">⚠ Accetta nuovo prezzo netto € ' + prezzoNuovo.toFixed(4) + '/L</div>';
  html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">Il prezzo cliente cambia di ' + (deltaPrezzo>=0?'+':'') + deltaPrezzo.toFixed(4) + ' €/L. Margine invariato a ' + margineCorrente.toFixed(4) + '</div>';
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
  document.getElementById('mod-costo').value = costoFinale.toFixed(4);
  document.getElementById('mod-trasporto').value = trasportoFinale.toFixed(4);
  document.getElementById('mod-margine').value = margineFinale.toFixed(4);
  aggiornaPreviewModifica();
  // Salva con bypass del check
  await salvaModificaOrdine(id, true);
  window._modSnapshotForm = null;
}

// Opzione 1: mantieni prezzo netto, ricalcola margine. Avviso se margine negativo.
async function _optMantieniPrezzo(id, nuovoCosto, nuovoTrasporto, margineRicalc) {
  if (margineRicalc < 0) {
    if (!confirm('⚠ Attenzione: il margine risultante sarà negativo (' + margineRicalc.toFixed(4) + ' €/L), stai vendendo sotto costo.\n\nConfermi comunque?')) {
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
  document.getElementById('mod-prezzo-netto').value = prezzoNetto.toFixed(4);
  const prev = document.getElementById('mod-preview');
  if (prev) prev.innerHTML = '<span>Costo: <strong>' + fmt(costo) + '</strong></span><span>Prezzo netto: <strong>' + fmt(prezzoNetto) + '</strong></span><span>Prezzo IVA: <strong>' + fmt(prezzoIva) + '</strong></span><span>Totale: <strong>' + fmtE(totale) + '</strong></span>';
}

// Calcola margine dal prezzo netto inserito
function aggiornaMargineDaPrezzo() {
  const costo = parseFloat(document.getElementById('mod-costo').value) || 0;
  const trasporto = parseFloat(document.getElementById('mod-trasporto').value) || 0;
  const prezzoNetto = parseFloat(document.getElementById('mod-prezzo-netto').value) || 0;
  const margine = prezzoNetto - costo - trasporto;
  document.getElementById('mod-margine').value = margine.toFixed(4);
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
    if (!isNaN(nv)) { const{error}=await sb.from(tabella).update({[campo]:nv}).eq('id',id); toast(error?'Errore':'Aggiornato!'); }
    if (tabella==='ordini') caricaOrdini(); else caricaPrezzi();
  };
  input.onkeydown = e => { if(e.key==='Enter') input.blur(); if(e.key==='Escape'){if(tabella==='ordini') caricaOrdini(); else caricaPrezzi();} };
}

async function eliminaRecord(tabella, id, callback) {
  if (!confirm('Eliminare questo record?')) return;
  await sb.from(tabella).delete().eq('id', id);
  _auditLog('elimina', tabella, 'ID: ' + id);
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

  var html = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px">Top 20 clienti per volume — ' + prodotto + ' — Costo base: € ' + costo.toFixed(4) + '</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Cliente</th><th>Tipo</th><th>Litri (6m)</th><th>Trasporto</th><th>Margine/L</th><th>Prezzo netto</th><th>Prezzo IVA</th></tr></thead><tbody>';

  lista.forEach(function(c, idx) {
    var mColor = c.margineL > 0 ? '#639922' : '#E24B4A';
    html += '<tr' + (idx % 2 ? ' style="background:var(--bg)"' : '') + '>' +
      '<td><strong>' + esc(c.nome) + '</strong></td>' +
      '<td><span class="badge ' + (c.tipo === 'Rete' ? 'purple' : 'gray') + '" style="font-size:9px">' + c.tipo + '</span></td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(c.litriStorico) + '</td>' +
      '<td style="font-family:var(--font-mono)">€ ' + c.trasporto.toFixed(4) + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + mColor + '">€ ' + c.margineL.toFixed(4) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600">€ ' + c.prezzoNetto.toFixed(4) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:700;color:var(--accent)">€ ' + c.prezzoIva.toFixed(4) + '</td></tr>';
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

  html += '<div style="display:flex;justify-content:space-between;border-bottom:2px solid #D85A30;padding-bottom:8px;margin-bottom:10px"><div><div style="font-size:16px;font-weight:bold;color:#D85A30">LISTINO PREZZI CLIENTI</div><div style="font-size:12px;color:#666;margin-top:2px">' + prodotto + ' — Costo base: € ' + costo.toFixed(4) + ' — ' + dataOggi + '</div></div><div style="text-align:right"><div style="font-size:13px;font-weight:bold">PHOENIX FUEL SRL</div></div></div>';

  html += '<table><thead><tr><th style="text-align:left">Cliente</th><th>Tipo</th><th>Vol. 6 mesi</th><th>Trasporto</th><th>Margine/L</th><th>Prezzo netto</th><th>Prezzo IVA incl.</th></tr></thead><tbody>';
  _listinoData.forEach(function(c, i) {
    html += '<tr' + (i % 2 ? ' class="alt"' : '') + '><td>' + esc(c.nome) + '</td><td style="text-align:center">' + c.tipo + '</td><td>' + fmtL(c.litriStorico) + '</td><td>€ ' + c.trasporto.toFixed(4) + '</td><td>€ ' + c.margineL.toFixed(4) + '</td><td style="font-weight:bold">€ ' + c.prezzoNetto.toFixed(4) + '</td><td style="font-weight:bold;color:#D85A30">€ ' + c.prezzoIva.toFixed(4) + '</td></tr>';
  });
  html += '</tbody></table>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open(); w.document.write(html); w.document.close();
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
  html += '<td style="text-align:right;font-family:monospace;font-size:14px;font-weight:500">€ ' + prezzoNetto.toFixed(4) + '</td>';
  html += '<td style="text-align:right;font-size:12px;color:#666">' + iva + '%</td>';
  html += '<td style="text-align:right;font-family:monospace;font-size:16px;font-weight:bold;color:#D85A30">€ ' + prezzoIva.toFixed(4) + '</td></tr>';
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
    xml += '          <Price>' + pNetto.toFixed(4) + '</Price>\n';
    xml += '          <VatCode Perc="' + iva + '" Class="Imponibile" Description="Aliquota ' + iva + '%">' + iva + '</VatCode>\n';
    xml += '          <Stock>true</Stock>\n';
    xml += '          <Notes>Costo ' + Number(o.costo_litro||0).toFixed(4) + ' + Trasp ' + Number(o.trasporto_litro||0).toFixed(4) + ' + Marg ' + Number(o.margine||0).toFixed(4) + '</Notes>\n';
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
    xml += '          <Price>' + costo.toFixed(4) + '</Price>\n';
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
    xml += '          <Price>' + costo.toFixed(4) + '</Price>\n';
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
