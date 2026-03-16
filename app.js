// ── SUPABASE ─────────────────────────────────────────────────────
const SUPABASE_URL = 'https://jpugeakgpitbxdswbucj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xMFZND8_vBl5Z5eEA-2guA_kVME1Iz-';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── UTENTE CORRENTE ───────────────────────────────────────────────
let utenteCorrente = null;

// ── DATA ─────────────────────────────────────────────────────────
const oggi = new Date();
const oggiISO = oggi.toISOString().split('T')[0];
const gg = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const mm = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
document.getElementById('topbar-date').textContent = gg[oggi.getDay()] + ' ' + oggi.getDate() + ' ' + mm[oggi.getMonth()] + ' ' + oggi.getFullYear();

// ── AUTH ──────────────────────────────────────────────────────────
async function inizializza() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }

  // Riprova fino a 3 volte se utente non trovato subito
  let utente = null;
  for (let i = 0; i < 3; i++) {
    const { data } = await sb.from('utenti').select('*').eq('email', session.user.email).single();
    if (data) { utente = data; break; }
    await new Promise(r => setTimeout(r, 800));
  }
  if (!utente) { 
    console.error('Utente non trovato nel DB:', session.user.email);
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif"><h2>Accesso non autorizzato</h2><p>Utente non trovato. <a href="login.html">Torna al login</a></p></div>';
    return; 
  }
  if (!utente.attivo) { await sb.auth.signOut(); window.location.href = 'login.html'; return; }

  utenteCorrente = utente;
  document.getElementById('utente-nome').textContent = utente.nome;
  document.getElementById('utente-ruolo').textContent = utente.ruolo;

  await costruisciMenu(utente.ruolo, utente.id);

  if (utente.ruolo === 'cliente') {
    setSection('cliente', document.querySelector('.nav-item'));
  } else if (utente.ruolo === 'logistica') {
    setSection('consegne', document.querySelector('.nav-item'));
  } else if (utente.ruolo === 'contabilita') {
    setSection('vendite', document.querySelector('.nav-item'));
  } else {
    caricaDashboard();
    if (document.getElementById('pr-data')) document.getElementById('pr-data').value = oggiISO;
    if (document.getElementById('ord-data')) document.getElementById('ord-data').value = oggiISO;
    if (document.getElementById('filtro-data-prezzi')) document.getElementById('filtro-data-prezzi').value = oggiISO;
    if (document.getElementById('pc-data')) document.getElementById('pc-data').value = oggiISO;
    aggiornaSelezioniOrdine();
  }
}

async function costruisciMenu(ruolo, utenteId) {
  const nav = document.getElementById('nav-menu');
  const voci = [];

  if (ruolo === 'cliente') {
    voci.push({ id:'cliente', icon:'👤', label:'I miei prezzi' });
  } else if (ruolo === 'admin') {
    voci.push({ section:'Operativo' });
    voci.push({ id:'dashboard', icon:'▦', label:'Dashboard' });
    voci.push({ id:'ordini', icon:'📋', label:'Ordini' });
    voci.push({ id:'prezzi', icon:'💰', label:'Prezzi giornalieri' });
    voci.push({ id:'deposito', icon:'🏗', label:'Deposito' });
    voci.push({ id:'consegne', icon:'🚚', label:'Consegne' });
    voci.push({ id:'vendite', icon:'📊', label:'Vendite' });
    voci.push({ section:'Anagrafica' });
    voci.push({ id:'clienti', icon:'👤', label:'Clienti' });
    voci.push({ id:'fornitori', icon:'🏭', label:'Fornitori' });
    voci.push({ id:'basi', icon:'📍', label:'Basi di carico' });
    voci.push({ section:'Logistica' });
    voci.push({ id:'logistica', icon:'🚛', label:'Logistica' });
    voci.push({ section:'Impostazioni' });
    voci.push({ id:'utenti', icon:'🔑', label:'Utenti' });
  } else {
    // Carica permessi personalizzati
    const { data: permessi } = await sb.from('permessi').select('*').eq('utente_id', utenteId).eq('abilitato', true);
    const abilitati = new Set((permessi||[]).map(p => p.sezione));
    const tutteSezioni = [
      { id:'dashboard', icon:'▦', label:'Dashboard', section:'Operativo' },
      { id:'ordini', icon:'📋', label:'Ordini' },
      { id:'prezzi', icon:'💰', label:'Prezzi giornalieri' },
      { id:'deposito', icon:'🏗', label:'Deposito' },
      { id:'consegne', icon:'🚚', label:'Consegne' },
      { id:'vendite', icon:'📊', label:'Vendite' },
      { id:'clienti', icon:'👤', label:'Clienti', section:'Anagrafica' },
      { id:'fornitori', icon:'🏭', label:'Fornitori' },
      { id:'basi', icon:'📍', label:'Basi di carico' },
    ];
    let lastSection = null;
    tutteSezioni.forEach(s => {
      if (abilitati.has(s.id)) {
        if (s.section && s.section !== lastSection) { voci.push({ section: s.section }); lastSection = s.section; }
        voci.push({ id: s.id, icon: s.icon, label: s.label });
      }
    });
    if (!voci.length) voci.push({ id:'dashboard', icon:'▦', label:'Dashboard' });
  }

  nav.innerHTML = voci.map(v => {
    if (v.section) return `<div class="nav-section-label">${v.section}</div>`;
    return `<div class="nav-item" onclick="setSection('${v.id}',this)"><span class="nav-icon">${v.icon}</span> ${v.label}</div>`;
  }).join('');

  const prima = nav.querySelector('.nav-item');
  if (prima) prima.classList.add('active');
}

async function logout() {
  await sb.auth.signOut();
  window.location.href = 'login.html';
}

// ── NAVIGAZIONE ───────────────────────────────────────────────────
const titles = { dashboard:'Dashboard', ordini:'Ordini', prezzi:'Prezzi giornalieri', deposito:'Deposito', consegne:'Consegne', vendite:'Vendite', clienti:'Clienti', fornitori:'Fornitori', basi:'Basi di carico', utenti:'Utenti', cliente:'I miei prezzi', logistica:'Logistica' };
function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('page-title').textContent = titles[id] || id;
  const loaders = { prezzi:caricaPrezzi, ordini:caricaOrdini, deposito:caricaDeposito, consegne:caricaConsegne, vendite:caricaVendite, clienti:caricaClienti, fornitori:caricaFornitori, basi:caricaBasi, utenti:caricaUtentiCompleto, cliente:caricaAreaCliente, logistica:caricaLogistica };
  if (loaders[id]) loaders[id]();
}

// ── TOAST ─────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── UTILITÀ ───────────────────────────────────────────────────────
function fmt(n) { return '€ ' + Number(n).toFixed(4); }
function fmtE(n) { return '€ ' + Number(n).toFixed(2); }
function fmtL(n) { return Number(n).toLocaleString('it-IT') + ' L'; }
function badgeStato(stato) {
  const map = { 'confermato':'green','in attesa':'amber','annullato':'red','programmato':'blue','cliente':'blue','deposito':'teal' };
  return `<span class="badge ${map[stato]||'amber'}">${stato}</span>`;
}
function badgeRuolo(ruolo) {
  const map = { 'admin':'purple','operatore':'blue','contabilita':'green','logistica':'amber','cliente':'gray' };
  return `<span class="badge ${map[ruolo]||'gray'}">${ruolo}</span>`;
}
function prezzoNoIva(r) { return Number(r.costo_litro)+Number(r.trasporto_litro)+Number(r.margine); }
function prezzoConIva(r) { return prezzoNoIva(r)*(1+Number(r.iva)/100); }

// ── CACHE ─────────────────────────────────────────────────────────
let cacheClienti=[], cacheFornitori=[], cacheBasi=[];

async function caricaSelectFornitori(selectId) {
  const { data } = await sb.from('fornitori').select('id,nome').eq('attivo',true).order('nome');
  cacheFornitori = data||[];
  const sel = document.getElementById(selectId); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Seleziona...</option>' + cacheFornitori.map(f=>`<option value="${f.id}">${f.nome}</option>`).join('');
  if (cur) sel.value = cur;
}

async function caricaSelectClienti(selectId) {
  const { data } = await sb.from('clienti').select('id,nome').eq('attivo',true).order('nome');
  cacheClienti = data||[];
  const sel = document.getElementById(selectId); if (!sel) return;
  sel.innerHTML = '<option value="">Seleziona...</option>' + cacheClienti.map(c=>`<option value="${c.id}">${c.nome}</option>`).join('');
}

// ── AREA CLIENTE ──────────────────────────────────────────────────
async function caricaAreaCliente() {
  if (!utenteCorrente?.cliente_id) return;
  const clienteId = utenteCorrente.cliente_id;

  // Prezzi di oggi
  const { data: prezzi } = await sb.from('prezzi_cliente').select('*').eq('cliente_id', clienteId).eq('data', oggiISO);
  const tbPrezzi = document.getElementById('cl-prezzi-oggi');
  if (!prezzi||!prezzi.length) {
    tbPrezzi.innerHTML = '<tr><td colspan="5" class="loading">Nessun prezzo disponibile oggi</td></tr>';
  } else {
    tbPrezzi.innerHTML = prezzi.map(p => {
      const noiva = Number(p.prezzo_litro);
      const coniva = noiva * (1 + Number(p.iva)/100);
      return `<tr><td>${p.prodotto}</td><td style="font-family:var(--font-mono)">${fmt(noiva)}</td><td style="font-family:var(--font-mono)">${fmt(coniva)}</td><td>${p.iva}%</td><td>${p.note||'—'}</td></tr>`;
    }).join('');
  }

  // Storico acquisti
  const { data: ordini } = await sb.from('ordini').select('*').eq('cliente', utenteCorrente.nome).order('data',{ascending:false});
  const tbStorico = document.getElementById('cl-storico');
  if (!ordini||!ordini.length) {
    tbStorico.innerHTML = '<tr><td colspan="6" class="loading">Nessun acquisto</td></tr>';
  } else {
    tbStorico.innerHTML = ordini.map(r => `<tr>
      <td>${r.data}</td><td>${r.prodotto}</td>
      <td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td>
      <td style="font-family:var(--font-mono)">${fmt(prezzoConIva(r))}</td>
      <td style="font-family:var(--font-mono)">${fmtE(prezzoConIva(r)*r.litri)}</td>
      <td>${badgeStato(r.stato)}</td>
    </tr>`).join('');

    // KPI mese
    const inizio = new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
    const mese = ordini.filter(r=>r.data>=inizio);
    const litriMese = mese.reduce((s,r)=>s+Number(r.litri),0);
    const spesaMese = mese.reduce((s,r)=>s+prezzoConIva(r)*Number(r.litri),0);
    document.getElementById('cl-mese-litri').textContent = fmtL(litriMese);
    document.getElementById('cl-mese-spesa').textContent = fmtE(spesaMese);
  }
}

// ── PREZZI GIORNALIERI ────────────────────────────────────────────
function aggiornaPrev() {
  const c=parseFloat(document.getElementById('pr-costo').value)||0;
  const t=parseFloat(document.getElementById('pr-trasporto').value)||0;
  const m=parseFloat(document.getElementById('pr-margine').value)||0;
  const iva=parseInt(document.getElementById('pr-iva').value)||22;
  const noiva=c+t+m;
  document.getElementById('calc-noiva').textContent='€ '+noiva.toFixed(4);
  document.getElementById('calc-iva').textContent='€ '+(noiva*(1+iva/100)).toFixed(4);
}

async function caricaBasiPerFornitore() {
  const fornitoreId = document.getElementById('pr-fornitore').value;
  const sel = document.getElementById('pr-base');
  sel.innerHTML = '<option value="">Nessuna (opzionale)</option>';
  if (!fornitoreId) return;
  const { data } = await sb.from('fornitori_basi').select('base_carico_id, basi_carico(id,nome)').eq('fornitore_id', fornitoreId);
  if (data && data.length) {
    data.forEach(r => { if (r.basi_carico) sel.innerHTML += `<option value="${r.basi_carico.id}">${r.basi_carico.nome}</option>`; });
  } else {
    const { data: tutteBasi } = await sb.from('basi_carico').select('id,nome').eq('attivo',true).order('nome');
    if (tutteBasi) tutteBasi.forEach(b => sel.innerHTML += `<option value="${b.id}">${b.nome}</option>`);
  }
}

async function salvaPrezzo() {
  const selFor = document.getElementById('pr-fornitore');
  const fornitoreId = selFor.value;
  const fornitoreNome = selFor.options[selFor.selectedIndex]?.text || '';
  const baseId = document.getElementById('pr-base').value || null;
  const costo = parseFloat(document.getElementById('pr-costo').value);
  const trasporto = parseFloat(document.getElementById('pr-trasporto').value)||0;
  const margine = parseFloat(document.getElementById('pr-margine').value)||0;
  const data = document.getElementById('pr-data').value;
  const prodotto = document.getElementById('pr-prodotto').value;
  const mezzoId = document.getElementById('car-mezzo').value;
  const trId2 = document.getElementById('car-trasportatore').value;
  if (!data) { toast('⚠ Inserisci la data'); return; }
  if (!mezzoId && !trId2) { toast('⚠ Seleziona un mezzo proprio o un trasportatore esterno'); return; }
  if (!fornitoreNome||fornitoreNome==='Seleziona...') { toast('⚠ Seleziona un fornitore'); return; }
  if (!prodotto) { toast('⚠ Seleziona un prodotto'); return; }
  if (isNaN(costo)||costo<=0) { toast('⚠ Inserisci il costo per litro'); return; }
  const record = { data, fornitore:fornitoreNome, fornitore_id:fornitoreId||null, base_carico_id:baseId, prodotto, costo_litro:costo, trasporto_litro:trasporto, margine, iva:parseInt(document.getElementById('pr-iva').value) };
  const { error } = await sb.from('prezzi').insert([record]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('✅ Prezzo salvato!');
  caricaPrezzi();
}

async function salvaPrezzoCliente() {
  const clienteId = document.getElementById('pc-cliente').value;
  const prodotto = document.getElementById('pc-prodotto').value;
  const prezzo = parseFloat(document.getElementById('pc-prezzo').value);
  const data = document.getElementById('pc-data').value;
  if (!clienteId||!prodotto||!data||isNaN(prezzo)) { toast('⚠ Compila tutti i campi'); return; }
  const record = { data, cliente_id:clienteId, prodotto, prezzo_litro:prezzo, iva:parseInt(document.getElementById('pc-iva').value), note:document.getElementById('pc-note').value };
  const { error } = await sb.from('prezzi_cliente').insert([record]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('✅ Prezzo cliente salvato!');
}

async function caricaPrezzi() {
  await caricaSelectFornitori('pr-fornitore');
  await caricaSelectClienti('pc-cliente');
  const filtroData = document.getElementById('filtro-data-prezzi').value;
  let query = sb.from('prezzi').select('*, basi_carico(nome)').order('data',{ascending:false}).order('fornitore');
  if (filtroData) query = query.eq('data', filtroData);
  const { data } = await query;
  const tbody = document.getElementById('tabella-prezzi');
  
  // Calcola prezzi PhoenixFuel da costo medio cisterne
  const { data: cisterne } = await sb.from('cisterne').select('*');
  const { data: baseDeposito } = await sb.from('basi_carico').select('*').ilike('nome','%phoenix%').maybeSingle();
  let righeDeposito = [];
  if (cisterne && baseDeposito) {
    const prodotti = [...new Set(cisterne.map(c=>c.prodotto).filter(Boolean))];
    prodotti.forEach(prodotto => {
      const cis = cisterne.filter(c=>c.prodotto===prodotto);
      const totLitri = cis.reduce((s,c)=>s+Number(c.livello_attuale),0);
      if (totLitri > 0) {
        const costoMedio = cis.reduce((s,c)=>s+(Number(c.costo_medio||0)*Number(c.livello_attuale)),0) / totLitri;
        righeDeposito.push({
          id: 'phoenix_'+prodotto,
          data: filtroData || oggiISO,
          fornitore: 'PhoenixFuel',
          basi_carico: { nome: baseDeposito.nome },
          prodotto,
          costo_litro: costoMedio,
          trasporto_litro: 0,
          margine: 0,
          iva: prodotto==='Gasolio Agricolo'?10:22,
          _giacenza: totLitri,
          _isDeposito: true
        });
      }
    });
  }
  
  const tuttiPrezzi = [...righeDeposito, ...(data||[])];
  if (!tuttiPrezzi.length) { tbody.innerHTML='<tr><td colspan="10" class="loading">Nessun prezzo trovato</td></tr>'; return; }
  const best={};
  tuttiPrezzi.forEach(r=>{ const k=r.data+'_'+r.prodotto; if(!best[k]||prezzoNoIva(r)<prezzoNoIva(best[k])) best[k]=r; });
  // Render tabella prezzi senza template literal annidati
  let htmlRighe = '';
  tuttiPrezzi.forEach(r => {
    const isBest = best[r.data+'_'+r.prodotto]?.id === r.id;
    let azione = '';
    if (r._isDeposito) {
      azione = (isBest ? '<span class="badge green" style="font-size:9px">Best</span> ' : '') + '<span class="badge teal" style="font-size:9px">Deposito</span>';
    } else {
      azione = (isBest ? '<span class="badge green" style="font-size:9px">Best</span> ' : '') + '<button class="btn-danger" onclick="eliminaRecord(\'prezzi\',\'' + r.id + '\',caricaPrezzi)">x</button>';
    }
    const giacenzaHtml = r._giacenza ? ' <span style="font-size:10px;color:var(--text-hint)">(' + fmtL(r._giacenza) + ')</span>' : '';
    const trasportoHtml = r._isDeposito ? '<span style="font-size:10px;color:var(--text-hint)">auto</span>' : fmt(r.trasporto_litro);
    const margineHtml = r._isDeposito ? '<span style="font-size:10px;color:var(--text-hint)">da inserire</span>' : fmt(r.margine);
    htmlRighe += '<tr>' +
      '<td>' + r.data + '</td>' +
      '<td>' + r.fornitore + '</td>' +
      '<td>' + (r.basi_carico ? r.basi_carico.nome : '—') + '</td>' +
      '<td>' + r.prodotto + giacenzaHtml + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmt(r.costo_litro) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + trasportoHtml + '</td>' +
      '<td style="font-family:var(--font-mono)">' + margineHtml + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmt(prezzoNoIva(r)) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmt(prezzoConIva(r)) + '</td>' +
      '<td>' + azione + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = htmlRighe;
}

// ── ORDINI ────────────────────────────────────────────────────────
let prezzoCorrente=null, prezziDelGiorno=[];

function toggleTipoOrdine() {
  document.getElementById('grp-cliente').style.display=document.getElementById('ord-tipo').value==='cliente'?'':'none';
}

async function aggiornaSelezioniOrdine() {
  const data=document.getElementById('ord-data').value; if(!data) return;
  const { data: prezzi } = await sb.from('prezzi').select('*, basi_carico(id,nome)').eq('data',data);
  prezziDelGiorno=prezzi||[];
  const fornitori=[...new Map(prezziDelGiorno.map(p=>[p.fornitore,{nome:p.fornitore}])).values()];
  const selFor=document.getElementById('ord-fornitore');
  selFor.innerHTML='<option value="">Seleziona fornitore...</option>'+fornitori.map(f=>`<option value="${f.nome}">${f.nome}</option>`).join('');
  document.getElementById('ord-base').innerHTML='<option value="">— Prima seleziona fornitore —</option>';
  document.getElementById('ord-prodotto').innerHTML='<option value="">— Prima seleziona fornitore —</option>';
  prezzoCorrente=null;
  await caricaSelectClienti('ord-cliente');
}

function aggiornaBasiOrdine() {
  const fornitore=document.getElementById('ord-fornitore').value;
  const prezziFor=prezziDelGiorno.filter(p=>p.fornitore===fornitore);
  const basi=[...new Map(prezziFor.filter(p=>p.basi_carico).map(p=>[p.basi_carico.id,p.basi_carico])).values()];
  const selBase=document.getElementById('ord-base');
  if (basi.length) {
    selBase.innerHTML='<option value="">Seleziona base...</option>'+basi.map(b=>`<option value="${b.id}">${b.nome}</option>`).join('');
    document.getElementById('ord-prodotto').innerHTML='<option value="">— Prima seleziona base —</option>';
  } else {
    selBase.innerHTML='<option value="">Nessuna base specificata</option>';
    aggiornaProdottiOrdine();
  }
  prezzoCorrente=null;
}

function aggiornaProdottiOrdine() {
  const fornitore=document.getElementById('ord-fornitore').value;
  const baseId=document.getElementById('ord-base').value;
  const prodotti=[...new Set(prezziDelGiorno.filter(p=>p.fornitore===fornitore&&(baseId?p.base_carico_id===baseId:true)).map(p=>p.prodotto))];
  const selProd=document.getElementById('ord-prodotto');
  selProd.innerHTML='<option value="">Seleziona prodotto...</option>'+prodotti.map(p=>`<option value="${p}">${p}</option>`).join('');
  prezzoCorrente=null;
}

async function caricaPrezzoPerOrdine() {
  const fornitore=document.getElementById('ord-fornitore').value;
  const baseId=document.getElementById('ord-base').value;
  const prodotto=document.getElementById('ord-prodotto').value;
  if (!fornitore||!prodotto) return;
  const match=prezziDelGiorno.find(p=>p.fornitore===fornitore&&p.prodotto===prodotto&&(baseId?p.base_carico_id===baseId:true));
  if (match) {
    prezzoCorrente=match;
    document.getElementById('prev-costo').textContent=fmt(match.costo_litro);
    document.getElementById('prev-trasporto').textContent=fmt(match.trasporto_litro);
    document.getElementById('prev-margine').textContent=fmt(match.margine);
    aggiornaPrevOrdine();
  } else {
    prezzoCorrente=null;
    ['prev-costo','prev-trasporto','prev-margine','prev-prezzo','prev-totale'].forEach(id=>document.getElementById(id).textContent='—');
  }
}

function aggiornaPrevOrdine() {
  if (!prezzoCorrente) return;
  const litri=parseFloat(document.getElementById('ord-litri').value)||0;
  const pL=prezzoConIva(prezzoCorrente);
  document.getElementById('prev-prezzo').textContent=fmt(pL);
  document.getElementById('prev-totale').textContent=fmtE(pL*litri);
}

async function salvaOrdine() {
  if (!prezzoCorrente) { toast('⚠ Seleziona data/fornitore/prodotto disponibili'); return; }
  const litri=parseFloat(document.getElementById('ord-litri').value);
  const tipo=document.getElementById('ord-tipo').value;
  const clienteId=document.getElementById('ord-cliente').value;
  const clienteNome=cacheClienti.find(c=>c.id===clienteId)?.nome||'Deposito';
  if (tipo==='cliente'&&!clienteId) { toast('⚠ Seleziona un cliente'); return; }
  if (!litri) { toast('⚠ Inserisci i litri'); return; }
  const ggPag=parseInt(document.getElementById('ord-gg').value);
  const dataOrdine=new Date(document.getElementById('ord-data').value);
  const dataScad=new Date(dataOrdine); dataScad.setDate(dataScad.getDate()+ggPag);
  const record={ data:document.getElementById('ord-data').value, tipo_ordine:tipo, cliente:clienteNome, prodotto:prezzoCorrente.prodotto, litri, fornitore:prezzoCorrente.fornitore, costo_litro:prezzoCorrente.costo_litro, trasporto_litro:prezzoCorrente.trasporto_litro, margine:prezzoCorrente.margine, iva:prezzoCorrente.iva, base_carico_id:prezzoCorrente.base_carico_id||null, trasportatore:document.getElementById('ord-trasportatore').value, giorni_pagamento:ggPag, data_scadenza:dataScad.toISOString().split('T')[0], stato:document.getElementById('ord-stato').value, note:document.getElementById('ord-note').value };
  const { data: nuovoOrdine, error } = await sb.from('ordini').insert([record]).select().single();
  if (error) { toast('Errore: '+error.message); return; }
  
  // Se la base di carico è il deposito interno, scarica automaticamente la cisterna
  if (prezzoCorrente.base_carico_id) {
    const { data: base } = await sb.from('basi_carico').select('nome').eq('id', prezzoCorrente.base_carico_id).single();
    if (base && base.nome.toLowerCase().includes('deposito') && base.nome.toLowerCase().includes('phoenix')) {
      await confermaUscitaDeposito(nuovoOrdine.id);
      toast('✅ Ordine salvato e giacenza deposito aggiornata!');
    } else {
      toast('✅ Ordine salvato!');
    }
  } else {
    toast('✅ Ordine salvato!');
  }
  caricaOrdini(); caricaDashboard();
}

async function caricaOrdini() {
  await aggiornaSelezioniOrdine();
  const { data } = await sb.from('ordini').select('*, basi_carico(nome)').order('data',{ascending:false}).order('created_at',{ascending:false});
  const tbody=document.getElementById('tabella-ordini');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="14" class="loading">Nessun ordine</td></tr>'; return; }
  tbody.innerHTML=data.map(r=>{
    const pL=prezzoConIva(r),tot=pL*r.litri;
    // Pulsante cisterna per approvvigionamento deposito non ancora confermato
    // Approvvigionamento deposito (entrata) → pulsante Carica cisterna
    const isApprov = r.tipo_ordine === 'deposito' && r.stato !== 'confermato' && r.stato !== 'annullato';
    // Uscita deposito → fornitore PhoenixFuel o base contiene phoenix
    const isUscitaDeposito = r.fornitore && r.fornitore.toLowerCase().includes('phoenix') && r.tipo_ordine !== 'deposito' && r.stato !== 'confermato';
    const btnCisterna = isApprov
      ? `<button class="btn-primary" style="font-size:11px;padding:3px 8px" onclick="apriModaleAssegnaCisterna('${r.id}')">🛢 Carica</button>`
      : isUscitaDeposito
      ? `<button class="btn-primary" style="font-size:11px;padding:3px 8px;background:#639922" onclick="confermaUscitaDeposito('${r.id}')">📤 Scarica</button>`
      : '';
    return `<tr><td>${r.data}</td><td>${badgeStato(r.tipo_ordine||'cliente')}</td><td>${r.cliente}</td><td>${r.prodotto}</td><td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td><td>${r.fornitore}</td><td>${r.basi_carico?r.basi_carico.nome:'—'}</td><td class="editable" onclick="editaCella(this,'ordini','trasporto_litro','${r.id}',${r.trasporto_litro})" style="font-family:var(--font-mono)">${fmt(r.trasporto_litro)}</td><td class="editable" onclick="editaCella(this,'ordini','margine','${r.id}',${r.margine})" style="font-family:var(--font-mono)">${fmt(r.margine)}</td><td style="font-family:var(--font-mono)">${fmt(pL)}</td><td style="font-family:var(--font-mono)">${fmtE(tot)}</td><td style="font-size:11px;color:var(--text-hint)">${r.data_scadenza||'—'}</td><td>${badgeStato(r.stato)}</td><td>${btnCisterna} <button class="btn-edit" onclick="apriModaleOrdine('${r.id}')">✏️</button><button class="btn-danger" onclick="eliminaRecord('ordini','${r.id}',caricaOrdini)">×</button></td></tr>`;
  }).join('');
}

// ── MODIFICA INLINE ───────────────────────────────────────────────
async function editaCella(td,tabella,campo,id,val) {
  const input=document.createElement('input');
  input.className='inline-edit'; input.type='number'; input.step='0.0001'; input.value=val;
  td.innerHTML=''; td.appendChild(input); input.focus();
  input.onblur=async()=>{ const nv=parseFloat(input.value); if(!isNaN(nv)){const{error}=await sb.from(tabella).update({[campo]:nv}).eq('id',id);toast(error?'Errore':'✅ Aggiornato!');} if(tabella==='ordini') caricaOrdini(); else caricaPrezzi(); };
  input.onkeydown=e=>{ if(e.key==='Enter') input.blur(); if(e.key==='Escape'){if(tabella==='ordini') caricaOrdini(); else caricaPrezzi();} };
}

async function eliminaRecord(tabella,id,callback) {
  if(!confirm('Eliminare?')) return;
  await sb.from(tabella).delete().eq('id',id);
  toast('🗑 Eliminato'); callback();
}

// ── DEPOSITO ─────────────────────────────────────────────────────
const DEP_CONFIG={ autotrazione:{colore:'#D85A30',elId:'dep-autotrazione',totId:'dep-total-autotrazione'}, agricolo:{colore:'#639922',elId:'dep-agricolo',totId:'dep-total-agricolo'}, hvo:{colore:'#3B6D11',elId:'dep-hvo',totId:'dep-total-hvo'}, benzina:{colore:'#378ADD',elId:'dep-benzina',totId:'dep-total-benzina'} };

function cisternasvg(pct,colore) {
  const altMax=80,liv=Math.round((pct/100)*altMax),y=10+(altMax-liv);
  const fill=pct<20?'#E24B4A':pct<35?'#BA7517':colore;
  return `<svg class="dep-cisterna-svg" viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="10" width="50" height="80" rx="4" fill="#e8e7e3" stroke="#ccc" stroke-width="1"/><rect x="5" y="${y}" width="50" height="${liv}" rx="2" fill="${fill}" opacity="0.85"/><rect x="5" y="10" width="50" height="80" rx="4" fill="none" stroke="#bbb" stroke-width="1.5"/><rect x="20" y="5" width="20" height="8" rx="2" fill="#ccc"/><line x1="5" y1="30" x2="8" y2="30" stroke="#bbb" stroke-width="1"/><line x1="5" y1="50" x2="8" y2="50" stroke="#bbb" stroke-width="1"/><line x1="5" y1="70" x2="8" y2="70" stroke="#bbb" stroke-width="1"/></svg>`;
}

async function caricaDeposito() {
  const { data:cisterne } = await sb.from('cisterne').select('*').order('tipo').order('nome');
  if (!cisterne) return;
  let totaleStoccato=0,allerte=0;
  Object.entries(DEP_CONFIG).forEach(([tipo,cfg])=>{
    const gruppo=cisterne.filter(c=>c.tipo===tipo);
    let totG=0;
    const el=document.getElementById(cfg.elId); if(!el) return;
    el.innerHTML=gruppo.map(c=>{ const pct=Math.round((c.livello_attuale/c.capacita_max)*100); totG+=Number(c.livello_attuale); if(pct<30) allerte++; return `<div class="dep-cisterna${pct<30?' alert':''}"><div class="dep-cisterna-name">${c.nome}</div>${cisternasvg(pct,cfg.colore)}<div class="dep-cisterna-litri">${Number(c.livello_attuale).toLocaleString('it-IT')} L</div><div class="dep-cisterna-pct">${pct}% · cap. ${Number(c.capacita_max).toLocaleString('it-IT')} L</div></div>`; }).join('');
    document.getElementById(cfg.totId).textContent=fmtL(totG);
    totaleStoccato+=totG;
  });
  document.getElementById('dep-totale').textContent=fmtL(totaleStoccato);
  document.getElementById('dep-pct').textContent=Math.round((totaleStoccato/280000)*100)+'%';
  document.getElementById('dep-allerta').textContent=allerte;
  const { data:mov } = await sb.from('ordini').select('*').or('tipo_ordine.eq.deposito,fornitore.ilike.%phoenix%').order('created_at',{ascending:false}).limit(10);
  const tbody=document.getElementById('dep-movimenti');
  tbody.innerHTML=mov&&mov.length?mov.map(r=>`<tr><td>${r.data}</td><td>${r.tipo_ordine==='deposito'?'<span class="badge teal">Entrata</span>':'<span class="badge amber">Uscita</span>'}</td><td>${r.prodotto}</td><td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td><td>${r.fornitore}</td><td>${badgeStato(r.stato)}</td></tr>`).join(''):'<tr><td colspan="6" class="loading">Nessun movimento</td></tr>';
}

// ── CONSEGNE ─────────────────────────────────────────────────────
async function caricaConsegne() {
  const { data } = await sb.from('ordini').select('*').eq('data',oggiISO).order('created_at');
  const tbody=document.getElementById('tabella-consegne');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="7" class="loading">Nessun ordine oggi</td></tr>'; ['tot-consegne','tot-completate','tot-inattesa','tot-programmati'].forEach(id=>document.getElementById(id).textContent='0'); return; }
  document.getElementById('tot-consegne').textContent=data.length;
  document.getElementById('tot-completate').textContent=data.filter(r=>r.stato==='confermato').length;
  document.getElementById('tot-inattesa').textContent=data.filter(r=>r.stato==='in attesa').length;
  document.getElementById('tot-programmati').textContent=data.filter(r=>r.stato==='programmato').length;
  tbody.innerHTML=data.map(r=>`<tr><td>${r.data}</td><td>${r.cliente}</td><td>${r.prodotto}</td><td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td><td>${r.fornitore}</td><td style="font-family:var(--font-mono)">${fmtE(prezzoConIva(r)*r.litri)}</td><td>${badgeStato(r.stato)}</td></tr>`).join('');
}

// ── VENDITE ───────────────────────────────────────────────────────
async function caricaVendite() {
  const inizio=new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
  const { data } = await sb.from('ordini').select('*').gte('data',inizio);
  if (!data) return;
  let fatturato=0,litri=0,margine=0; const pf={};
  data.forEach(r=>{ const tot=prezzoConIva(r)*r.litri,marg=Number(r.margine)*Number(r.litri); fatturato+=tot; litri+=Number(r.litri); margine+=marg; if(!pf[r.fornitore]) pf[r.fornitore]={litri:0,fatturato:0,margine:0}; pf[r.fornitore].litri+=Number(r.litri); pf[r.fornitore].fatturato+=tot; pf[r.fornitore].margine+=marg; });
  document.getElementById('vend-fatturato').textContent=fmtE(fatturato);
  document.getElementById('vend-litri').textContent=fmtL(litri);
  document.getElementById('vend-margine').textContent=fmtE(margine);
  document.getElementById('vend-ordini').textContent=data.length;
  const tbody=document.getElementById('tabella-vendite');
  const righe=Object.entries(pf).sort((a,b)=>b[1].fatturato-a[1].fatturato);
  tbody.innerHTML=righe.length?righe.map(([f,v])=>`<tr><td>${f}</td><td style="font-family:var(--font-mono)">${fmtL(v.litri)}</td><td style="font-family:var(--font-mono)">${fmtE(v.fatturato)}</td><td style="font-family:var(--font-mono)">${fmtE(v.margine)}</td></tr>`).join(''):'<tr><td colspan="4" class="loading">Nessun dato</td></tr>';
}

// ── CLIENTI ───────────────────────────────────────────────────────
async function salvaCliente(id=null) {
  const record={ nome:document.getElementById('cl-nome').value.trim(), tipo:document.getElementById('cl-tipo').value, piva:document.getElementById('cl-piva').value, codice_fiscale:document.getElementById('cl-cf').value, indirizzo:document.getElementById('cl-indirizzo').value, citta:document.getElementById('cl-citta').value, provincia:document.getElementById('cl-provincia').value, telefono:document.getElementById('cl-telefono').value, email:document.getElementById('cl-email').value, fido_massimo:parseFloat(document.getElementById('cl-fido').value)||0, giorni_pagamento:parseInt(document.getElementById('cl-gg').value), zona_consegna:document.getElementById('cl-zona').value, prodotti_abituali:document.getElementById('cl-prodotti').value, note:document.getElementById('cl-note').value };
  if (!record.nome) { toast('⚠ Inserisci il nome'); return; }
  let error;
  if (id) { ({error}=await sb.from('clienti').update(record).eq('id',id)); }
  else { ({error}=await sb.from('clienti').insert([record])); }
  if (error) { toast('Errore: '+error.message); return; }
  toast(id?'✅ Cliente aggiornato!':'✅ Cliente salvato!');
  cacheClienti=[]; chiudiModal(); caricaClienti();
}

async function apriModaleCliente(id=null) {
  document.getElementById('modal-title').textContent=id?'Modifica cliente':'Nuovo cliente';
  document.getElementById('modal-save-btn').onclick=()=>salvaCliente(id);
  ['cl-nome','cl-piva','cl-cf','cl-indirizzo','cl-citta','cl-provincia','cl-telefono','cl-email','cl-fido','cl-zona','cl-prodotti','cl-note'].forEach(c=>{const el=document.getElementById(c);if(el)el.value='';});
  document.getElementById('cl-tipo').value='azienda'; document.getElementById('cl-gg').value='30';
  if (id) { const{data}=await sb.from('clienti').select('*').eq('id',id).single(); if(data){document.getElementById('cl-nome').value=data.nome||'';document.getElementById('cl-tipo').value=data.tipo||'azienda';document.getElementById('cl-piva').value=data.piva||'';document.getElementById('cl-cf').value=data.codice_fiscale||'';document.getElementById('cl-indirizzo').value=data.indirizzo||'';document.getElementById('cl-citta').value=data.citta||'';document.getElementById('cl-provincia').value=data.provincia||'';document.getElementById('cl-telefono').value=data.telefono||'';document.getElementById('cl-email').value=data.email||'';document.getElementById('cl-fido').value=data.fido_massimo||0;document.getElementById('cl-gg').value=data.giorni_pagamento||30;document.getElementById('cl-zona').value=data.zona_consegna||'';document.getElementById('cl-prodotti').value=data.prodotti_abituali||'';document.getElementById('cl-note').value=data.note||'';} }
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-clienti').style.display='block';
  document.getElementById('modal-fornitori').style.display='none';
}

async function caricaClienti() {
  const { data } = await sb.from('clienti').select('*').order('nome');
  const tbody=document.getElementById('tabella-clienti');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="10" class="loading">Nessun cliente</td></tr>'; return; }
  tbody.innerHTML=data.map(r=>`<tr><td><strong>${r.nome}</strong></td><td><span class="badge blue">${r.tipo||'azienda'}</span></td><td style="font-size:11px;color:var(--text-muted)">${r.piva||'—'}</td><td>${r.citta||'—'}</td><td>${r.telefono||'—'}</td><td style="font-family:var(--font-mono)">${r.fido_massimo>0?fmtE(r.fido_massimo):'—'}</td><td>${r.giorni_pagamento||30} gg</td><td style="font-size:11px;color:var(--text-muted)">${r.prodotti_abituali||'—'}</td><td style="font-size:11px;color:var(--text-muted)">${r.note||'—'}</td><td><button class="btn-edit" onclick="apriModaleCliente('${r.id}')">✏️</button><button class="btn-danger" onclick="eliminaRecord('clienti','${r.id}',caricaClienti)">×</button></td></tr>`).join('');
}

// ── FORNITORI ─────────────────────────────────────────────────────
async function caricaCheckboxBasi(selectedIds=[]) {
  const{data}=await sb.from('basi_carico').select('id,nome').eq('attivo',true).order('nome');
  document.getElementById('fo-basi-check').innerHTML=data?data.map(b=>`<label class="check-label"><input type="checkbox" value="${b.id}" ${selectedIds.includes(b.id)?'checked':''}/> ${b.nome}</label>`).join(''):'';
}

async function salvaFornitore(id=null) {
  const record={ nome:document.getElementById('fo-nome').value.trim(), ragione_sociale:document.getElementById('fo-ragione').value, piva:document.getElementById('fo-piva').value, indirizzo:document.getElementById('fo-indirizzo').value, citta:document.getElementById('fo-citta').value, telefono:document.getElementById('fo-telefono').value, email:document.getElementById('fo-email').value, contatto:document.getElementById('fo-contatto').value, fido_massimo:parseFloat(document.getElementById('fo-fido').value)||0, giorni_pagamento:parseInt(document.getElementById('fo-gg').value), note:document.getElementById('fo-note').value };
  if (!record.nome) { toast('⚠ Inserisci il nome'); return; }
  let foId=id;
  if (id) { const{error}=await sb.from('fornitori').update(record).eq('id',id); if(error){toast('Errore: '+error.message);return;} }
  else { const{data:fo,error}=await sb.from('fornitori').insert([record]).select().single(); if(error){toast('Errore: '+error.message);return;} foId=fo.id; }
  await sb.from('fornitori_basi').delete().eq('fornitore_id',foId);
  const checks=document.querySelectorAll('#fo-basi-check input:checked');
  if (checks.length) await sb.from('fornitori_basi').insert(Array.from(checks).map(c=>({fornitore_id:foId,base_carico_id:c.value})));
  toast(id?'✅ Fornitore aggiornato!':'✅ Fornitore salvato!');
  cacheFornitori=[]; chiudiModal(); caricaFornitori();
}

async function apriModaleFornitore(id=null) {
  document.getElementById('modal-title').textContent=id?'Modifica fornitore':'Nuovo fornitore';
  document.getElementById('modal-save-btn').onclick=()=>salvaFornitore(id);
  ['fo-nome','fo-ragione','fo-piva','fo-indirizzo','fo-citta','fo-telefono','fo-email','fo-contatto','fo-fido','fo-note'].forEach(c=>{const el=document.getElementById(c);if(el)el.value='';});
  document.getElementById('fo-gg').value='30';
  let selectedBasi=[];
  if (id) { const{data}=await sb.from('fornitori').select('*, fornitori_basi(base_carico_id)').eq('id',id).single(); if(data){document.getElementById('fo-nome').value=data.nome||'';document.getElementById('fo-ragione').value=data.ragione_sociale||'';document.getElementById('fo-piva').value=data.piva||'';document.getElementById('fo-indirizzo').value=data.indirizzo||'';document.getElementById('fo-citta').value=data.citta||'';document.getElementById('fo-telefono').value=data.telefono||'';document.getElementById('fo-email').value=data.email||'';document.getElementById('fo-contatto').value=data.contatto||'';document.getElementById('fo-fido').value=data.fido_massimo||0;document.getElementById('fo-gg').value=data.giorni_pagamento||30;document.getElementById('fo-note').value=data.note||'';selectedBasi=data.fornitori_basi?data.fornitori_basi.map(fb=>fb.base_carico_id):[];} }
  await caricaCheckboxBasi(selectedBasi);
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-fornitori').style.display='block';
  document.getElementById('modal-clienti').style.display='none';
}

async function calcolaFido(fornitoreNome,fidoMax,giorniPag) {
  if (!fidoMax) return {usato:0,residuo:0};
  const{data}=await sb.from('ordini').select('*').eq('fornitore',fornitoreNome);
  let usato=0;
  (data||[]).forEach(o=>{const scad=new Date(o.data);scad.setDate(scad.getDate()+(o.giorni_pagamento||giorniPag||30));if(scad>oggi) usato+=prezzoConIva(o)*Number(o.litri);});
  return {usato,residuo:fidoMax-usato};
}

function fidoBar(usato,max) {
  if (!max) return '—';
  const pct=Math.min(100,Math.round((usato/max)*100));
  const cls=pct<60?'fido-ok':pct<85?'fido-warn':'fido-danger';
  return `<div class="fido-bar-wrap"><div class="fido-bar"><div class="fido-fill ${cls}" style="width:${pct}%"></div></div><span style="font-size:10px">${pct}%</span></div>`;
}

async function caricaFornitori() {
  const{data}=await sb.from('fornitori').select('*, fornitori_basi(base_carico_id, basi_carico(nome))').order('nome');
  const tbody=document.getElementById('tabella-fornitori');
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="12" class="loading">Nessun fornitore</td></tr>';return;}
  const rows=await Promise.all(data.map(async r=>{
    const{usato,residuo}=await calcolaFido(r.nome,r.fido_massimo,r.giorni_pagamento);
    const basi=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.basi_carico?.nome).filter(Boolean).join(', '):'—';
    return `<tr><td><strong>${r.nome}</strong></td><td style="font-size:11px;color:var(--text-muted)">${r.piva||'—'}</td><td>${r.citta||'—'}</td><td>${r.contatto||'—'}</td><td>${r.telefono||'—'}</td><td style="font-family:var(--font-mono)">${r.fido_massimo>0?fmtE(r.fido_massimo):'—'}</td><td style="font-family:var(--font-mono)">${r.fido_massimo>0?fmtE(usato):'—'}</td><td>${r.fido_massimo>0?fidoBar(usato,r.fido_massimo)+' <span style="font-size:11px;font-family:var(--font-mono)">'+fmtE(residuo)+'</span>':'—'}</td><td>${r.giorni_pagamento||30} gg</td><td style="font-size:11px;color:var(--text-muted)">${basi}</td><td style="font-size:11px;color:var(--text-muted)">${r.note||'—'}</td><td><button class="btn-edit" onclick="apriModaleFornitore('${r.id}')">✏️</button><button class="btn-danger" onclick="eliminaRecord('fornitori','${r.id}',caricaFornitori)">×</button></td></tr>`;
  }));
  tbody.innerHTML=rows.join('');
}

// ── BASI DI CARICO ────────────────────────────────────────────────
async function salvaBasi() {
  const record={nome:document.getElementById('ba-nome').value.trim(),indirizzo:document.getElementById('ba-indirizzo').value,citta:document.getElementById('ba-citta').value,provincia:document.getElementById('ba-provincia').value,note:document.getElementById('ba-note').value};
  if (!record.nome){toast('⚠ Inserisci il nome');return;}
  const{error}=await sb.from('basi_carico').insert([record]);
  if (error){toast('Errore: '+error.message);return;}
  toast('✅ Base salvata!'); cacheBasi=[]; caricaBasi();
}

async function caricaBasi() {
  const{data}=await sb.from('basi_carico').select('*, fornitori_basi(fornitore_id, fornitori(nome))').order('nome');
  const tbody=document.getElementById('tabella-basi');
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="6" class="loading">Nessuna base</td></tr>';return;}
  tbody.innerHTML=data.map(r=>{const forn=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.fornitori?.nome).filter(Boolean).join(', '):'—';return `<tr><td><strong>${r.nome}</strong></td><td>${r.indirizzo||'—'}</td><td>${r.citta||'—'}</td><td style="font-size:11px;color:var(--text-muted)">${forn}</td><td style="font-size:11px;color:var(--text-muted)">${r.note||'—'}</td><td><button class="btn-danger" onclick="eliminaRecord('basi_carico','${r.id}',caricaBasi)">×</button></td></tr>`;}).join('');
}

// ── UTENTI ────────────────────────────────────────────────────────
function toggleRuoloCliente() {
  const ruolo=document.getElementById('ut-ruolo').value;
  document.getElementById('grp-ut-cliente').style.display=ruolo==='cliente'?'':'none';
  if (ruolo==='cliente') caricaSelectClienti('ut-cliente');
}

async function salvaUtente() {
  const nome=document.getElementById('ut-nome').value.trim();
  const email=document.getElementById('ut-email').value.trim();
  const password=document.getElementById('ut-password').value;
  const ruolo=document.getElementById('ut-ruolo').value;
  const clienteId=document.getElementById('ut-cliente').value||null;
  if (!nome||!email||!password){toast('⚠ Compila tutti i campi');return;}
  if (password.length<6){toast('⚠ Password minimo 6 caratteri');return;}
  // Crea utente in Supabase Auth
  const{data:authData,error:authError}=await sb.auth.admin?.createUser({email,password,email_confirm:true}).catch(()=>({error:{message:'Usa Supabase dashboard per creare utenti auth'}}));
  // Salva in tabella utenti
  const{error}=await sb.from('utenti').insert([{email,nome,ruolo,cliente_id:ruolo==='cliente'?clienteId:null}]);
  if (error){toast('Errore: '+error.message);return;}
  toast('✅ Utente salvato! Crea le credenziali su Supabase Auth.');
  caricaUtenti();
}

async function caricaUtenti() {
  await caricaSelectClienti('ut-cliente');
  const{data}=await sb.from('utenti').select('*, clienti(nome)').order('nome');
  const tbody=document.getElementById('tabella-utenti');
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="6" class="loading">Nessun utente</td></tr>';return;}
  tbody.innerHTML=data.map(r=>`<tr><td><strong>${r.nome}</strong></td><td style="font-size:11px;color:var(--text-muted)">${r.email}</td><td>${badgeRuolo(r.ruolo)}</td><td style="font-size:11px;color:var(--text-muted)">${r.clienti?.nome||'—'}</td><td>${r.attivo?'<span class="badge green">Attivo</span>':'<span class="badge red">Disattivo</span>'}</td><td><button class="btn-danger" onclick="eliminaRecord('utenti','${r.id}',caricaUtenti)">×</button></td></tr>`).join('');
}

// ── MODAL ─────────────────────────────────────────────────────────
function chiudiModal() { document.getElementById('modal-overlay').style.display='none'; }
document.getElementById('modal-overlay').addEventListener('click',function(e){if(e.target===this) chiudiModal();});

// ── DASHBOARD ─────────────────────────────────────────────────────
async function caricaDashboard() {
  const{data}=await sb.from('ordini').select('*').eq('data',oggiISO);
  if (!data) return;
  let fatturato=0,litri=0,margine=0;
  data.forEach(r=>{fatturato+=prezzoConIva(r)*r.litri;litri+=Number(r.litri);margine+=Number(r.margine);});
  document.getElementById('kpi-fatturato').textContent=fmtE(fatturato);
  document.getElementById('kpi-litri').textContent=fmtL(litri);
  document.getElementById('kpi-margine').textContent=data.length?'€ '+(margine/data.length).toFixed(4)+'/L':'—';
  document.getElementById('kpi-ordini').textContent=data.length;
  const{data:rec}=await sb.from('ordini').select('*').order('created_at',{ascending:false}).limit(5);
  const tbody=document.getElementById('dashboard-ordini');
  tbody.innerHTML=rec&&rec.length?rec.map(r=>`<tr><td>${r.data}</td><td>${r.cliente}</td><td>${r.prodotto}</td><td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td><td style="font-family:var(--font-mono)">${fmtE(prezzoConIva(r)*r.litri)}</td><td>${badgeStato(r.stato)}</td></tr>`).join(''):'<tr><td colspan="6" class="loading">Nessun ordine</td></tr>';
}

// ── AVVIO ─────────────────────────────────────────────────────────
inizializza();

// ── PERMESSI ──────────────────────────────────────────────────────
const SEZIONI_SISTEMA = [
  { id:'dashboard', label:'Dashboard', icon:'▦' },
  { id:'ordini', label:'Ordini', icon:'📋' },
  { id:'prezzi', label:'Prezzi giornalieri', icon:'💰' },
  { id:'deposito', label:'Deposito', icon:'🏗' },
  { id:'consegne', label:'Consegne', icon:'🚚' },
  { id:'vendite', label:'Vendite', icon:'📊' },
  { id:'clienti', label:'Clienti', icon:'👤' },
  { id:'fornitori', label:'Fornitori', icon:'🏭' },
  { id:'basi', label:'Basi di carico', icon:'📍' },
  { id:'logistica', label:'Logistica', icon:'🚛' },
];

async function apriModalePermessi(utenteId, nomeUtente) {
  const { data: permessiEsistenti } = await sb.from('permessi').select('*').eq('utente_id', utenteId);
  const map = {};
  (permessiEsistenti||[]).forEach(p => map[p.sezione] = p.abilitato);
  const el = document.getElementById('modal-permessi-content');
  el.innerHTML = `
    <div style="font-size:15px;font-weight:500;margin-bottom:16px">🔑 Permessi per ${nomeUtente}</div>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">
      ${SEZIONI_SISTEMA.map(s => `
        <label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-kpi);border-radius:8px;cursor:pointer;font-size:13px">
          <input type="checkbox" value="${s.id}" ${map[s.id] ? 'checked' : ''} onchange="aggiornaPermesso('${utenteId}','${s.id}',this.checked)" />
          <span>${s.icon} ${s.label}</span>
        </label>`).join('')}
    </div>
    <button class="btn-primary" style="width:100%" onclick="chiudiModalePermessi()">Chiudi</button>\`;
  document.getElementById('modal-permessi').style.display = 'flex';
}

async function aggiornaPermesso(utenteId, sezione, abilitato) {
  await sb.from('permessi').upsert({ utente_id: utenteId, sezione, abilitato }, { onConflict: 'utente_id,sezione' });
  toast(abilitato ? ('Abilitata: ' + sezione) : ('Disabilitata: ' + sezione));
}

function chiudiModalePermessi() {
  document.getElementById('modal-permessi').style.display = 'none';
}

async function salvaUtenteNuovo() {
  const nome = document.getElementById('ut-nome').value.trim();
  const email = document.getElementById('ut-email').value.trim();
  const ruolo = document.getElementById('ut-ruolo').value;
  const clienteId = document.getElementById('ut-cliente').value || null;
  if (!nome || !email) { toast('⚠ Compila nome ed email'); return; }
  const { data: nuovoUtente, error } = await sb.from('utenti').insert([{ email, nome, ruolo, cliente_id: ruolo === 'cliente' ? clienteId : null }]).select().single();
  if (error) { toast('Errore: ' + error.message); return; }
  // Salva permessi se non cliente
  if (ruolo !== 'cliente' && ruolo !== 'admin') {
    const checks = document.querySelectorAll('#grp-ut-permessi input[type=checkbox]');
    const permessi = Array.from(checks).map(c => ({ utente_id: nuovoUtente.id, sezione: c.value, abilitato: c.checked }));
    if (permessi.length) await sb.from('permessi').insert(permessi);
  }
  toast('✅ Utente salvato! Vai su Supabase → Auth per creare le credenziali di accesso.');
  caricaUtentiCompleto();
}

async function caricaUtentiCompleto() {
  await caricaSelectClienti('ut-cliente');
  // Popola checkbox permessi nel form
  const grp = document.getElementById('grp-ut-permessi');
  if (grp) grp.innerHTML = '<div style="font-size:11px;color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px">Sezioni accessibili</div><div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">' + SEZIONI_SISTEMA.map(s => '<label class="check-label"><input type="checkbox" value="' + s.id + '" checked /> ' + s.icon + ' ' + s.label + '</label>').join('') + '</div>';
  const { data } = await sb.from('utenti').select('*, clienti(nome)').order('nome');
  const tbody = document.getElementById('tabella-utenti');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessun utente</td></tr>'; return; }
  tbody.innerHTML = data.map(r => `<tr>
    <td><strong>${r.nome}</strong></td>
    <td style="font-size:11px;color:var(--text-muted)">${r.email}</td>
    <td>${badgeRuolo(r.ruolo)}</td>
    <td style="font-size:11px;color:var(--text-muted)">${r.clienti?.nome || '—'}</td>
    <td>${r.attivo ? '<span class="badge green">Attivo</span>' : '<span class="badge red">Disattivo</span>'}</td>
    <td>${r.ruolo !== 'admin' && r.ruolo !== 'cliente' ? `<button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="apriModalePermessi('${r.id}','${r.nome}')">🔑 Permessi</button>` : '—'}</td>
    <td><button class="btn-danger" onclick="eliminaRecord('utenti','${r.id}',caricaUtentiCompleto)">×</button></td>
  </tr>`).join('');
}

// ── INVITO UTENTE ─────────────────────────────────────────────────
async function invitaUtente() {
  const email = document.getElementById('ut-email').value.trim();
  const nome = document.getElementById('ut-nome').value.trim();
  const ruolo = document.getElementById('ut-ruolo').value;
  const clienteId = document.getElementById('ut-cliente').value || null;
  if (!nome || !email) { toast('⚠ Inserisci nome ed email'); return; }

  // Salva in tabella utenti
  const { data: nuovoUtente, error } = await sb.from('utenti')
    .insert([{ email, nome, ruolo, cliente_id: ruolo === 'cliente' ? clienteId : null }])
    .select().single();
  if (error) { toast('Errore: ' + error.message); return; }

  // Salva permessi
  if (ruolo !== 'cliente' && ruolo !== 'admin') {
    const checks = document.querySelectorAll('#grp-ut-permessi input[type=checkbox]');
    const permessi = Array.from(checks).map(c => ({ utente_id: nuovoUtente.id, sezione: c.value, abilitato: c.checked }));
    if (permessi.length) await sb.from('permessi').insert(permessi);
  }

  // Manda email di invito
  const { error: inviteError } = await sb.auth.signInWithOtp({
    email,
    options: {
      emailRedirectTo: 'https://phoenixfuel.onrender.com/setpassword.html'
    }
  });

  if (inviteError) {
    toast('Utente creato ma invio email fallito: ' + inviteError.message);
  } else {
    toast('✅ Invito inviato a ' + email + '!');
  }
  caricaUtentiCompleto();
}

// ── MODIFICA ORDINE ───────────────────────────────────────────────
async function apriModaleOrdine(id) {
  const { data: r } = await sb.from('ordini').select('*').eq('id', id).single();
  if (!r) return;
  const el = document.getElementById('modal-permessi-content');
  el.innerHTML = `
    <div style="font-size:15px;font-weight:500;margin-bottom:16px">✏️ Modifica ordine</div>
    <div class="form-grid">
      <div class="form-group"><label>Stato</label>
        <select id="mod-stato">
          <option value="in attesa" ${r.stato==='in attesa'?'selected':''}>In attesa</option>
          <option value="confermato" ${r.stato==='confermato'?'selected':''}>Confermato</option>
          <option value="programmato" ${r.stato==='programmato'?'selected':''}>Programmato</option>
          <option value="annullato" ${r.stato==='annullato'?'selected':''}>Annullato</option>
        </select>
      </div>
      <div class="form-group"><label>Litri</label><input type="number" id="mod-litri" value="${r.litri}" /></div>
      <div class="form-group"><label>Trasporto/L (€)</label><input type="number" id="mod-trasporto" step="0.0001" value="${r.trasporto_litro}" /></div>
      <div class="form-group"><label>Margine/L (€)</label><input type="number" id="mod-margine" step="0.0001" value="${r.margine}" /></div>
      <div class="form-group"><label>Trasportatore</label><input type="text" id="mod-trasportatore" value="${r.trasportatore||''}" /></div>
      <div class="form-group"><label>Giorni pagamento</label>
        <select id="mod-gg">
          <option value="30" ${r.giorni_pagamento==30?'selected':''}>30 gg</option>
          <option value="45" ${r.giorni_pagamento==45?'selected':''}>45 gg</option>
          <option value="60" ${r.giorni_pagamento==60?'selected':''}>60 gg</option>
        </select>
      </div>
      <div class="form-group" style="grid-column:1/-1"><label>Note</label><input type="text" id="mod-note" value="${r.note||''}" /></div>
    </div>
    <div class="form-preview" style="margin-bottom:14px">
      <span>Fornitore: <strong>${r.fornitore}</strong></span>
      <span>Prodotto: <strong>${r.prodotto}</strong></span>
      <span>Cliente: <strong>${r.cliente}</strong></span>
      <span>Data: <strong>${r.data}</strong></span>
    </div>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" style="flex:1" onclick="salvaModificaOrdine('${id}')">Salva modifiche</button>
      <button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer;font-size:13px">Annulla</button>
    </div>\`;
  document.getElementById('modal-permessi').style.display = 'flex';
}

async function salvaModificaOrdine(id) {
  const litri = parseFloat(document.getElementById('mod-litri').value);
  const trasporto = parseFloat(document.getElementById('mod-trasporto').value);
  const margine = parseFloat(document.getElementById('mod-margine').value);
  const ggPag = parseInt(document.getElementById('mod-gg').value);
  // Ricalcola scadenza
  const { data: ordine } = await sb.from('ordini').select('data').eq('id', id).single();
  const dataScad = new Date(ordine.data);
  dataScad.setDate(dataScad.getDate() + ggPag);
  const { error } = await sb.from('ordini').update({
    stato: document.getElementById('mod-stato').value,
    litri,
    trasporto_litro: trasporto,
    margine,
    trasportatore: document.getElementById('mod-trasportatore').value,
    giorni_pagamento: ggPag,
    data_scadenza: dataScad.toISOString().split('T')[0],
    note: document.getElementById('mod-note').value
  }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Ordine aggiornato!');
  chiudiModalePermessi();
  caricaOrdini();
}

// ── GIACENZE DEPOSITO AUTOMATICHE ────────────────────────────────
async function aggiornaCisterna(cisternaId, litri, tipo, ordineId, data, costoLitro) {
  const { data: cis } = await sb.from('cisterne').select('*').eq('id', cisternaId).single();
  if (!cis) return;
  let nuovoLivello, nuovoCostoMedio = Number(cis.costo_medio || 0);
  if (tipo === 'entrata') {
    nuovoLivello = Number(cis.livello_attuale) + Number(litri);
    // Ricalcola costo medio ponderato
    if (costoLitro && costoLitro > 0) {
      const costoTotaleVecchio = Number(cis.livello_attuale) * Number(cis.costo_medio || 0);
      const costoNuovo = Number(litri) * Number(costoLitro);
      nuovoCostoMedio = (costoTotaleVecchio + costoNuovo) / nuovoLivello;
    }
  } else {
    nuovoLivello = Math.max(0, Number(cis.livello_attuale) - Number(litri));
  }
  await sb.from('cisterne').update({ livello_attuale: nuovoLivello, costo_medio: nuovoCostoMedio, updated_at: new Date().toISOString() }).eq('id', cisternaId);
  await sb.from('movimenti_cisterne').insert([{ cisterna_id: cisternaId, ordine_id: ordineId, tipo, litri, data }]);
}

async function apriModaleAssegnaCisterna(ordineId) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  const prodottoMap = { 'Gasolio Autotrazione':'autotrazione','Gasolio Agricolo':'agricolo','HVO':'hvo','Benzina':'benzina','AdBlue':'autotrazione' };
  const tipo = prodottoMap[ordine.prodotto] || 'autotrazione';
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('tipo', tipo).order('nome');
  if (!cisterne || !cisterne.length) { toast('⚠ Nessuna cisterna trovata per questo prodotto'); return; }

  // Distribuzione automatica ottimale
  let litriRimanenti = Number(ordine.litri);
  const distribuzione = {};
  // Prima riempi le cisterne con meno spazio (ottimizza utilizzo)
  const cisterneOrdinatePerSpazio = [...cisterne]
    .map(c => ({ ...c, spazio: Number(c.capacita_max) - Number(c.livello_attuale) }))
    .filter(c => c.spazio > 0)
    .sort((a, b) => a.spazio - b.spazio);
  
  cisterneOrdinatePerSpazio.forEach(c => {
    if (litriRimanenti <= 0) return;
    const qtaAssegnata = Math.min(litriRimanenti, c.spazio);
    distribuzione[c.id] = qtaAssegnata;
    litriRimanenti -= qtaAssegnata;
  });

  const el = document.getElementById('modal-permessi-content');
  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">🛢 Distribuzione carico — ' + ordine.prodotto + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Totale da caricare: <strong>' + fmtL(ordine.litri) + '</strong></div>';
  
  if (litriRimanenti > 0) {
    html += '<div class="alert-box" style="margin-bottom:12px">⚠ Spazio insufficiente nelle cisterne! Mancano ' + fmtL(litriRimanenti) + '</div>';
  }

  html += '<div style="display:flex;flex-direction:column;gap:8px;margin-bottom:16px">';
  cisterne.forEach(c => {
    const pct = Math.round((Number(c.livello_attuale) / Number(c.capacita_max)) * 100);
    const spazio = Number(c.capacita_max) - Number(c.livello_attuale);
    const qtaSuggerita = distribuzione[c.id] || 0;
    html += '<div style="padding:12px;background:var(--bg-kpi);border-radius:8px">' +
      '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">' +
      '<span style="font-size:13px;font-weight:500">' + c.nome + '</span>' +
      '<span style="font-size:11px;color:var(--text-muted)">Spazio: ' + fmtL(spazio) + '</span>' +
      '</div>' +
      '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:8px">' +
      '<div style="height:100%;width:' + pct + '%;background:' + (pct<30?'#E24B4A':pct<60?'#BA7517':'#639922') + ';border-radius:2px"></div>' +
      '</div>' +
      '<div style="display:flex;align-items:center;gap:8px">' +
      '<label style="font-size:11px;color:var(--text-muted);white-space:nowrap">Litri da caricare:</label>' +
      '<input type="number" id="cis-qty-' + c.id + '" value="' + qtaSuggerita + '" min="0" max="' + spazio + '" ' +
      'style="flex:1;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;font-size:12px;background:var(--bg)" ' +
      'oninput="aggiornaTotaleCarico2(\'' + ordineId + '\',' + ordine.litri + ')" />' +
      '<span style="font-size:11px;color:var(--text-muted)">max ' + fmtL(spazio) + '</span>' +
      '</div>' +
      '</div>';
  });
  html += '</div>';
  html += '<div style="background:var(--bg-kpi);padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:12px;display:flex;gap:16px">' +
    '<span>Totale ordine: <strong>' + fmtL(ordine.litri) + '</strong></span>' +
    '<span>Assegnato: <strong id="tot-assegnato">—</strong></span>' +
    '<span id="msg-diff" style="color:#A32D2D"></span>' +
    '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:4px">' +
    '<button class="btn-primary" style="flex:1" onclick="confermaCaricoDeposito(\'' + ordineId + '\')">✅ Conferma carico</button>' +
    '<button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer;font-size:13px">Annulla</button>' +
    '</div>';
  
  el.innerHTML = html;
  document.getElementById('modal-permessi').style.display = 'flex';
  aggiornaTotaleCarico2(ordineId, ordine.litri);
  window._cisterneCarico = cisterne;
}

function aggiornaTotaleCarico2(ordineId, totaleOrdine) {
  const cisterne = window._cisterneCarico || [];
  let totAssegnato = 0;
  cisterne.forEach(c => {
    const input = document.getElementById('cis-qty-' + c.id);
    if (input) totAssegnato += parseFloat(input.value) || 0;
  });
  const elTot = document.getElementById('tot-assegnato');
  const elMsg = document.getElementById('msg-diff');
  if (elTot) elTot.textContent = fmtL(totAssegnato);
  if (elMsg) {
    const diff = totaleOrdine - totAssegnato;
    elMsg.textContent = diff > 0 ? '⚠ Mancano ' + fmtL(diff) : diff < 0 ? '⚠ Eccesso ' + fmtL(Math.abs(diff)) : '✅ OK';
    elMsg.style.color = diff === 0 ? '#3B6D11' : '#A32D2D';
  }
}

async function confermaCaricoDeposito(ordineId) {
  const cisterne = window._cisterneCarico || [];
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  
  // Verifica che il totale assegnato corrisponda all'ordine
  let totAssegnato = 0;
  cisterne.forEach(c => {
    const input = document.getElementById('cis-qty-' + c.id);
    if (input) totAssegnato += parseFloat(input.value) || 0;
  });
  
  const diff = Math.abs(Number(ordine.litri) - totAssegnato);
  if (diff > 1) { toast('⚠ Il totale assegnato (' + fmtL(totAssegnato) + ') non corrisponde all\'ordine (' + fmtL(ordine.litri) + ')'); return; }

  // Aggiorna ogni cisterna
  for (const c of cisterne) {
    const input = document.getElementById('cis-qty-' + c.id);
    const qta = parseFloat(input?.value) || 0;
    if (qta > 0) {
      await aggiornaCisterna(c.id, qta, 'entrata', ordineId, ordine.data, ordine.costo_litro);
    }
  }
  
  await sb.from('ordini').update({ stato: 'confermato' }).eq('id', ordineId);
  toast('✅ Carico confermato! Cisterne aggiornate.');
  chiudiModalePermessi();
  caricaDeposito();
  caricaOrdini();
}

async function confermaUscitaDeposito(ordineId) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  const prodottoMap = { 'Gasolio Autotrazione':'autotrazione', 'Gasolio Agricolo':'agricolo', 'HVO':'hvo', 'Benzina':'benzina', 'AdBlue':'autotrazione' };
  const tipo = prodottoMap[ordine.prodotto] || 'autotrazione';
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('tipo', tipo).order('livello_attuale', { ascending: false });
  if (!cisterne || !cisterne.length) { toast('⚠ Nessuna cisterna trovata per questo prodotto'); return; }
  const cis = cisterne[0];
  if (Number(cis.livello_attuale) < Number(ordine.litri)) { toast('⚠ Giacenza insufficiente! Disponibili: ' + fmtL(cis.livello_attuale)); return; }
  await aggiornaCisterna(cis.id, ordine.litri, 'uscita', ordineId, ordine.data);
  await sb.from('ordini').update({ stato: 'confermato', cisterna_id: cis.id }).eq('id', ordineId);
  toast('✅ Uscita registrata! Cisterna aggiornata.');
  caricaDeposito();
  caricaOrdini();
}

// ── LOGISTICA ─────────────────────────────────────────────────────
// Aggiunge sezione logistica al menu se admin
const SEZIONI_SISTEMA_EXT = [
  ...( typeof SEZIONI_SISTEMA !== 'undefined' ? [] : []),
  { id:'logistica', label:'Logistica', icon:'🚛' }
];

async function caricaLogistica() {
  await Promise.all([caricaMezziPropri(), caricaTrasportatori(), caricaCarichi()]);
  // Popola select mezzi per pianificazione carico
  const { data: mezzi } = await sb.from('mezzi').select('id,targa,capacita_totale').eq('attivo',true).order('targa');
  const selM = document.getElementById('car-mezzo');
  if (selM && mezzi) selM.innerHTML = '<option value="">Seleziona mezzo...</option>' + mezzi.map(m=>`<option value="${m.id}">${m.targa} (${fmtL(m.capacita_totale)})</option>`).join('');
  // Popola select trasportatori per carico
  const { data: trasps } = await sb.from('trasportatori').select('id,nome').eq('attivo',true).order('nome');
  const selT = document.getElementById('car-trasportatore');
  if (selT && trasps) selT.innerHTML = '<option value="">Nostro mezzo</option>' + trasps.map(t=>`<option value="${t.id}">${t.nome}</option>`).join('');
  // Set today date
  const carData = document.getElementById('car-data');
  if (carData && !carData.value) carData.value = oggiISO;
}

// ── MEZZI PROPRI ─────────────────────────────────────────────────
async function salvaMezzo() {
  const targa = document.getElementById('mz-targa').value.trim().toUpperCase();
  const descr = document.getElementById('mz-descr').value;
  const cap = parseFloat(document.getElementById('mz-cap').value);
  const autista = document.getElementById('mz-autista').value;
  if (!targa || !cap) { toast('⚠ Inserisci targa e capacità'); return; }
  const { data: mezzo, error } = await sb.from('mezzi').insert([{ targa, descrizione: descr, capacita_totale: cap, autista_default: autista }]).select().single();
  if (error) { toast('Errore: ' + error.message); return; }
  // Salva scomparti
  const scomparti = document.querySelectorAll('.scomparto-row');
  if (scomparti.length) {
    const rows = Array.from(scomparti).map(s => ({
      mezzo_id: mezzo.id,
      nome: s.querySelector('.sc-nome').value,
      capacita: parseFloat(s.querySelector('.sc-cap').value) || 0,
      prodotto_default: s.querySelector('.sc-prod').value
    })).filter(r => r.nome && r.capacita > 0);
    if (rows.length) await sb.from('scomparti_mezzo').insert(rows);
  }
  toast('✅ Mezzo salvato!');
  caricaMezziPropri();
}

async function caricaMezziPropri() {
  const { data } = await sb.from('mezzi').select('*, scomparti_mezzo(*)').order('targa');
  const tbody = document.getElementById('tabella-mezzi');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun mezzo</td></tr>'; return; }
  tbody.innerHTML = data.map(m => {
    const scomparti = m.scomparti_mezzo ? m.scomparti_mezzo.map(s => `${s.nome} (${fmtL(s.capacita)}${s.prodotto_default ? ' · ' + s.prodotto_default : ''})`).join(', ') : '—';
    return `<tr>
      <td><strong>${m.targa}</strong></td>
      <td>${m.descrizione || '—'}</td>
      <td style="font-family:var(--font-mono)">${fmtL(m.capacita_totale)}</td>
      <td>${m.autista_default || '—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${scomparti}</td>
      <td><button class="btn-danger" onclick="eliminaRecord('mezzi','${m.id}',caricaMezziPropri)">×</button></td>
    </tr>`;
  }).join('');
}

function aggiungiScomparto() {
  const wrap = document.getElementById('scomparti-wrap');
  const div = document.createElement('div');
  div.className = 'scomparto-row';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px';
  div.innerHTML = `
    <div class="form-group"><label>Nome scomparto</label><input type="text" class="sc-nome" placeholder="Es. Scomp. 1" /></div>
    <div class="form-group"><label>Capacità (L)</label><input type="number" class="sc-cap" placeholder="0" /></div>
    <div class="form-group"><label>Prodotto default</label>
      <select class="sc-prod">
        <option value="">Qualsiasi</option>
        <option>Gasolio Autotrazione</option><option>Gasolio Agricolo</option>
        <option>HVO</option><option>Benzina</option><option>AdBlue</option>
      </select>
    </div>
    <button class="btn-danger" onclick="this.parentElement.remove()" style="margin-bottom:2px">×</button>`;
  wrap.appendChild(div);
}

// ── TRASPORTATORI ─────────────────────────────────────────────────
async function salvaTrasportatore() {
  const nome = document.getElementById('tr-nome').value.trim();
  if (!nome) { toast('⚠ Inserisci il nome'); return; }
  const record = { nome, piva: document.getElementById('tr-piva').value, telefono: document.getElementById('tr-tel').value, email: document.getElementById('tr-email').value, note: document.getElementById('tr-note').value };
  const { data: tr, error } = await sb.from('trasportatori').insert([record]).select().single();
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Trasportatore salvato!');
  caricaTrasportatori();
}

async function caricaTrasportatori() {
  const { data } = await sb.from('trasportatori').select('*, autisti(*), mezzi_trasportatori(*)').order('nome');
  const tbody = document.getElementById('tabella-trasportatori');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading">Nessun trasportatore</td></tr>'; return; }
  // Popola select trasportatore nel form autisti/mezzi esterni
  const selTr = document.getElementById('at-trasportatore');
  if (selTr) selTr.innerHTML = '<option value="">Seleziona...</option>' + data.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
  const selTrM = document.getElementById('me-trasportatore');
  if (selTrM) selTrM.innerHTML = '<option value="">Seleziona...</option>' + data.map(t => `<option value="${t.id}">${t.nome}</option>`).join('');
  tbody.innerHTML = data.map(t => {
    const autisti = t.autisti ? t.autisti.map(a => a.nome).join(', ') : '—';
    const mezzi = t.mezzi_trasportatori ? t.mezzi_trasportatori.map(m => m.targa).join(', ') : '—';
    return `<tr>
      <td><strong>${t.nome}</strong></td>
      <td>${t.telefono || '—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${autisti}</td>
      <td style="font-size:11px;color:var(--text-muted)">${mezzi}</td>
      <td><button class="btn-danger" onclick="eliminaRecord('trasportatori','${t.id}',caricaTrasportatori)">×</button></td>
    </tr>`;
  }).join('');
}

async function salvaAutista() {
  const trId = document.getElementById('at-trasportatore').value;
  const nome = document.getElementById('at-nome').value.trim();
  if (!trId || !nome) { toast('⚠ Seleziona trasportatore e inserisci nome'); return; }
  const { error } = await sb.from('autisti').insert([{ trasportatore_id: trId, nome, telefono: document.getElementById('at-tel').value, patente: document.getElementById('at-patente').value }]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Autista salvato!');
  caricaTrasportatori();
}

async function salvaMezzoEsterno() {
  const trId = document.getElementById('me-trasportatore').value;
  const targa = document.getElementById('me-targa').value.trim().toUpperCase();
  if (!trId || !targa) { toast('⚠ Seleziona trasportatore e inserisci targa'); return; }
  const { error } = await sb.from('mezzi_trasportatori').insert([{ trasportatore_id: trId, targa, descrizione: document.getElementById('me-descr').value, capacita_totale: parseFloat(document.getElementById('me-cap').value) || 0 }]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Mezzo esterno salvato!');
  caricaTrasportatori();
}

// ── PIANIFICAZIONE CARICHI ────────────────────────────────────────
async function caricaCarichi() {
  const { data } = await sb.from('carichi').select('*, carico_ordini(*, ordini(cliente, prodotto, litri))').order('data', { ascending: false }).limit(20);
  const tbody = document.getElementById('tabella-carichi');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun carico pianificato</td></tr>'; return; }
  tbody.innerHTML = data.map(c => {
    const totLitri = c.carico_ordini ? c.carico_ordini.reduce((s, o) => s + Number(o.ordini?.litri || 0), 0) : 0;
    const nConsegne = c.carico_ordini ? c.carico_ordini.length : 0;
    const prodotti = c.carico_ordini ? [...new Set(c.carico_ordini.map(o=>o.ordini?.prodotto).filter(Boolean))].join(', ') : '—';
    return `<tr>
      <td>${c.data}</td>
      <td>${c.mezzo_targa || '—'}</td>
      <td>${c.autista || '—'}</td>
      <td style="font-family:var(--font-mono)">${fmtL(totLitri)}</td>
      <td>${prodotti}</td>
      <td>${nConsegne} consegne</td>
      <td>${badgeStato(c.stato)}
        <button class="btn-edit" onclick="apriDettaglioCarico('${c.id}')">👁</button>
        <button class="btn-danger" onclick="eliminaRecord('carichi','${c.id}',caricaCarichi)">×</button>
      </td>
    </tr>`;
  }).join('');
}

async function creaNuovoCarico() {
  const data = document.getElementById('car-data').value;
  const mezzoId = document.getElementById('car-mezzo').value;
  const mezzoTarga = document.getElementById('car-mezzo').options[document.getElementById('car-mezzo').selectedIndex]?.text || '';
  const autista = document.getElementById('car-autista').value;
  const trId2 = document.getElementById('car-trasportatore').value;
  if (!data) { toast('⚠ Inserisci la data'); return; }
  if (!mezzoId && !trId2) { toast('⚠ Seleziona un mezzo proprio o un trasportatore esterno'); return; }
  // Raccoglie ordini selezionati
  const ordiniSel = Array.from(document.querySelectorAll('.ord-carico:checked')).map(c => c.value);
  if (!ordiniSel.length) { toast('⚠ Seleziona almeno un ordine'); return; }
  
  // Valida capienza camion
  if (mezzoId) {
    const { data: mezzo } = await sb.from('mezzi').select('capacita_totale,targa').eq('id', mezzoId).single();
    if (mezzo) {
      const { data: ordiniSelData } = await sb.from('ordini').select('litri').in('id', ordiniSel);
      const totLitri = (ordiniSelData||[]).reduce((s,o) => s + Number(o.litri), 0);
      if (totLitri > Number(mezzo.capacita_totale)) {
        toast(`⚠ Portata superata! Totale ordini: ${fmtL(totLitri)} · Capienza ${mezzo.targa}: ${fmtL(mezzo.capacita_totale)}`);
        return;
      }
    }
  }
  
  const { data: carico, error } = await sb.from('carichi').insert([{ data, mezzo_id: mezzoId || null, mezzo_targa: mezzoTarga, autista, trasportatore_id: trId2 || null, stato: 'programmato' }]).select().single();
  if (error) { toast('Errore: ' + error.message); return; }
  // Associa ordini al carico
  const righe = ordiniSel.map((oId, i) => ({ carico_id: carico.id, ordine_id: oId, sequenza: i + 1 }));
  await sb.from('carico_ordini').insert(righe);
  // Aggiorna stato ordini a programmato
  await Promise.all(ordiniSel.map(oId => sb.from('ordini').update({ stato: 'programmato' }).eq('id', oId)));
  toast('✅ Carico creato!');
  caricaCarichi();
  caricaOrdiniPerCarico();
}

async function caricaOrdiniPerCarico() {
  const dataEl = document.getElementById('car-data');
  if (!dataEl) return;
  const data = dataEl.value;
  if (!data) { document.getElementById('ordini-per-carico').innerHTML = '<div class="loading">Seleziona una data</div>'; return; }
  // Ordini confermati o in attesa che non sono già in un carico
  const { data: ordiniInCarico } = await sb.from('carico_ordini').select('ordine_id');
  const idsInCarico = new Set((ordiniInCarico||[]).map(o=>o.ordine_id));
  const { data: ordini } = await sb.from('ordini').select('*').eq('data', data).eq('tipo_ordine', 'cliente').neq('stato', 'annullato').order('cliente');
  const ordiniFiltrati = (ordini||[]).filter(o => !idsInCarico.has(o.id));
  const wrap = document.getElementById('ordini-per-carico');
  if (!ordiniFiltrati || !ordiniFiltrati.length) { wrap.innerHTML = '<div class="loading">Nessun ordine disponibile per questa data</div>'; return; }
  wrap.innerHTML = ordiniFiltrati.map(o => `
    <label style="display:flex;align-items:center;gap:10px;padding:8px 12px;background:var(--bg-kpi);border-radius:8px;cursor:pointer;font-size:12px;margin-bottom:6px">
      <input type="checkbox" class="ord-carico" value="${o.id}" onchange="aggiornaTotaleCarico()" />
      <div style="flex:1">
        <div style="font-weight:500">${o.cliente}</div>
        <div style="color:var(--text-muted)">${o.prodotto} · ${fmtL(o.litri)}</div>
      </div>
      <span class="badge ${o.stato==='confermato'?'green':'amber'}">${o.stato}</span>
    </label>`).join('');
}

function aggiornaTotaleCarico() {
  const checked = Array.from(document.querySelectorAll('.ord-carico:checked'));
  // Non abbiamo i litri qui facilmente, ma mostriamo il conteggio
  document.getElementById('car-tot-ordini').textContent = checked.length + ' ordini selezionati';
}

async function apriDettaglioCarico(caricoId) {
  const { data: carico } = await sb.from('carichi').select('*, carico_ordini(sequenza, litri, ordini(cliente, prodotto, litri, note))').eq('id', caricoId).single();
  if (!carico) return;
  const ordini = carico.carico_ordini ? [...carico.carico_ordini].sort((a,b) => a.sequenza - b.sequenza) : [];
  const el = document.getElementById('modal-permessi-content');
  el.innerHTML = `
    <div style="font-size:15px;font-weight:500;margin-bottom:4px">🚛 Dettaglio carico — ${carico.data}</div>
    <div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Mezzo: ${carico.mezzo_targa||'—'} · Autista: ${carico.autista||'—'}</div>
    <table style="width:100%;font-size:12px;margin-bottom:16px">
      <thead><tr><th>#</th><th>Cliente</th><th>Prodotto</th><th>Litri</th><th>Note</th></tr></thead>
      <tbody>
        ${ordini.map(o => `<tr>
          <td>${o.sequenza}</td>
          <td>${o.ordini?.cliente||'—'}</td>
          <td>${o.ordini?.prodotto||'—'}</td>
          <td style="font-family:var(--font-mono)">${fmtL(o.ordini?.litri||0)}</td>
          <td style="font-size:11px;color:var(--text-muted)">${o.ordini?.note||'—'}</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div style="display:flex;gap:8px">
      <button class="btn-primary" style="flex:1" onclick="chiudiModalePermessi()">Chiudi</button>
    </div>`;
  document.getElementById('modal-permessi').style.display = 'flex';
}

// ── MODIFICA CISTERNA ─────────────────────────────────────────────
async function apriModaleCisterna(id) {
  const { data: c } = await sb.from('cisterne').select('*').eq('id', id).single();
  if (!c) return;
  const el = document.getElementById('modal-permessi-content');
  el.innerHTML = `
    <div style="font-size:15px;font-weight:500;margin-bottom:16px">🛢 Modifica cisterna — ${c.nome}</div>
    <div class="form-grid">
      <div class="form-group"><label>Nome</label><input type="text" id="cis-nome" value="${c.nome}" /></div>
      <div class="form-group"><label>Livello attuale (L)</label><input type="number" id="cis-livello" value="${c.livello_attuale}" /></div>
      <div class="form-group"><label>Capacità massima (L)</label><input type="number" id="cis-cap" value="${c.capacita_max}" /></div>
      <div class="form-group"><label>Tipo</label>
        <select id="cis-tipo">
          <option value="autotrazione" ${c.tipo==='autotrazione'?'selected':''}>Autotrazione</option>
          <option value="agricolo" ${c.tipo==='agricolo'?'selected':''}>Agricolo</option>
          <option value="hvo" ${c.tipo==='hvo'?'selected':''}>HVO</option>
          <option value="benzina" ${c.tipo==='benzina'?'selected':''}>Benzina</option>
        </select>
      </div>
    </div>
    <button class="btn-primary" style="width:100%" onclick="salvaModificaCisterna('${id}')">Salva</button>`;
  document.getElementById('modal-permessi').style.display = 'flex';
}

async function salvaModificaCisterna(id) {
  const livello = parseFloat(document.getElementById('cis-livello').value);
  const cap = parseFloat(document.getElementById('cis-cap').value);
  if (livello > cap) { toast('⚠ Il livello non può superare la capacità'); return; }
  const { error } = await sb.from('cisterne').update({
    nome: document.getElementById('cis-nome').value,
    livello_attuale: livello,
    capacita_max: cap,
    tipo: document.getElementById('cis-tipo').value,
    updated_at: new Date().toISOString()
  }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Cisterna aggiornata!');
  chiudiModalePermessi();
  caricaDeposito();
}
