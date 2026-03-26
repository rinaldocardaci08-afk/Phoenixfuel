// ── SUPABASE ─────────────────────────────────────────────────────
const SUPABASE_URL = 'https://jpugeakgpitbxdswbucj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xMFZND8_vBl5Z5eEA-2guA_kVME1Iz-';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DATA ─────────────────────────────────────────────────────────
const oggi = new Date();
const oggiISO = oggi.toISOString().split('T')[0];
const GG = ['domenica','lunedi','martedi','mercoledi','giovedi','venerdi','sabato'];
const MM = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
document.getElementById('topbar-date').textContent = GG[oggi.getDay()] + ' ' + oggi.getDate() + ' ' + MM[oggi.getMonth()] + ' ' + oggi.getFullYear();

// ── UTENTE ────────────────────────────────────────────────────────
let utenteCorrente = null;

async function inizializza() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) { window.location.href = 'login.html'; return; }
  let utente = null;
  for (let i = 0; i < 3; i++) {
    const { data } = await sb.from('utenti').select('*').eq('email', session.user.email).single();
    if (data) { utente = data; break; }
    await new Promise(r => setTimeout(r, 800));
  }
  if (!utente) {
    document.body.innerHTML = '<div style="padding:40px;font-family:sans-serif"><h2>Accesso non autorizzato</h2><p>Utente non trovato. <a href="login.html">Torna al login</a></p></div>';
    return;
  }
  if (!utente.attivo) { await sb.auth.signOut(); window.location.href = 'login.html'; return; }
  utenteCorrente = utente;
  document.getElementById('utente-nome').textContent = utente.nome;
  document.getElementById('utente-ruolo').textContent = utente.ruolo;
  await costruisciMenu(utente.ruolo, utente.id);
  if (utente.ruolo === 'cliente') { setSection('cliente', document.querySelector('.nav-item')); }
  else { await Promise.all([caricaCacheProdotti(), caricaSelectClienti('ord-cliente')]); caricaDashboard(); initForms(); aggiornaSelezioniOrdine(); }
}

async function caricaCacheProdotti() {
  const { data } = await sb.from('prodotti').select('*').order('ordine_visualizzazione');
  cacheProdotti = data || [];
}

function initForms() {
  if (document.getElementById('pr-data')) document.getElementById('pr-data').value = oggiISO;
  if (document.getElementById('ord-data')) document.getElementById('ord-data').value = oggiISO;
  if (document.getElementById('filtro-data-prezzi')) document.getElementById('filtro-data-prezzi').value = oggiISO;
  if (document.getElementById('pc-data')) document.getElementById('pc-data').value = oggiISO;
  // Popola dropdown prodotti dinamici
  popolaDropdownProdotti('filtro-prodotto-ordini', true);
  popolaDropdownProdotti('vend-prodotto', true);
  popolaDropdownProdotti('pr-prodotto', false);
  popolaDropdownProdotti('pc-prodotto', false);
}

async function costruisciMenu(ruolo, utenteId) {
  const nav = document.getElementById('nav-menu');
  const voci = [];
  if (ruolo === 'cliente') {
    voci.push({ id:'cliente', icon:'👤', label:'I miei prezzi' });
  } else if (ruolo === 'admin') {
    voci.push({ section:'Operativo' });
    ['dashboard','ordini','prezzi','deposito','consegne','vendite'].forEach(id => {
      const map = { dashboard:{icon:'▦',label:'Dashboard'}, ordini:{icon:'📋',label:'Ordini'}, prezzi:{icon:'💰',label:'Prezzi giornalieri'}, deposito:{icon:'🏗',label:'Deposito'}, consegne:{icon:'🚚',label:'Consegne'}, vendite:{icon:'📊',label:'Vendite'} };
      voci.push({ id, ...map[id] });
    });
    voci.push({ section:'Anagrafica' });
    ['clienti','fornitori','basi','prodotti'].forEach(id => {
      const map = { clienti:{icon:'👤',label:'Clienti'}, fornitori:{icon:'🏭',label:'Fornitori'}, basi:{icon:'📍',label:'Basi di carico'}, prodotti:{icon:'📦',label:'Prodotti'} };
      voci.push({ id, ...map[id] });
    });
    voci.push({ section:'Logistica' });
    voci.push({ id:'logistica', icon:'🚛', label:'Logistica' });
    voci.push({ section:'Stazione' });
    voci.push({ id:'stazione', icon:'⛽', label:'Stazione Oppido' });
    voci.push({ section:'Autoconsumo' });
    voci.push({ id:'autoconsumo', icon:'🛢', label:'Autoconsumo' });
    voci.push({ section:'Impostazioni' });
    voci.push({ id:'utenti', icon:'🔑', label:'Utenti' });
  } else {
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
      { id:'prodotti', icon:'📦', label:'Prodotti' },
      { id:'logistica', icon:'🚛', label:'Logistica', section:'Logistica' },
      { id:'stazione', icon:'⛽', label:'Stazione Oppido', section:'Stazione' },
      { id:'autoconsumo', icon:'🛢', label:'Autoconsumo', section:'Autoconsumo' },
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
    if (v.section) return '<div class="nav-section-label">' + v.section + '</div>';
    return '<div class="nav-item" onclick="setSection(\'' + v.id + '\',this)"><span class="nav-icon">' + v.icon + '</span> ' + v.label + '</div>';
  }).join('');
  const prima = nav.querySelector('.nav-item');
  if (prima) prima.classList.add('active');
}

async function logout() { await sb.auth.signOut(); window.location.href = 'login.html'; }

// ── NAVIGAZIONE ───────────────────────────────────────────────────
const TITLES = { dashboard:'Dashboard', ordini:'Ordini', prezzi:'Prezzi giornalieri', deposito:'Deposito', consegne:'Consegne', vendite:'Vendite', clienti:'Clienti', fornitori:'Fornitori', basi:'Basi di carico', prodotti:'Prodotti', stazione:'Stazione Oppido', autoconsumo:'Autoconsumo', utenti:'Utenti', cliente:'I miei prezzi', logistica:'Logistica' };
function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('page-title').textContent = TITLES[id] || id;
  const loaders = { prezzi:caricaPrezzi, ordini:caricaOrdini, deposito:caricaDeposito, consegne:caricaConsegne, vendite:caricaVendite, clienti:caricaClienti, fornitori:caricaFornitori, basi:caricaBasi, prodotti:caricaProdotti, stazione:caricaStazione, autoconsumo:caricaAutoconsumo, utenti:caricaUtentiCompleto, cliente:caricaAreaCliente, logistica:caricaLogistica };
  if (loaders[id]) loaders[id]();
  // Chiudi sidebar su mobile
  if (window.innerWidth <= 768) {
    document.querySelector('.sidebar').classList.remove('open');
    document.querySelector('.sidebar-overlay').classList.remove('show');
  }
}

// ── TAB VENDITE ─────────────────────────────────────────────────
function switchVenditeTab(btn) {
  document.querySelectorAll('.vend-tab').forEach(t => { t.style.background='var(--bg)'; t.style.color='var(--text)'; t.style.border='0.5px solid var(--border)'; t.classList.remove('active'); });
  btn.style.background='var(--accent)'; btn.style.color='#fff'; btn.style.border='none'; btn.classList.add('active');
  document.querySelectorAll('.vend-panel').forEach(p => p.style.display='none');
  document.getElementById(btn.dataset.tab).style.display='block';
  if (btn.dataset.tab === 'vend-ingrosso') caricaVenditeIngrosso();
  else if (btn.dataset.tab === 'vend-dettaglio') caricaVenditeDettaglio();
  else if (btn.dataset.tab === 'vend-annuale') caricaVenditeAnnuali();
}

function switchClientiTab(btn) {
  document.querySelectorAll('.cli-tab').forEach(t => { t.style.background='var(--bg)'; t.style.color='var(--text)'; t.style.border='0.5px solid var(--border)'; t.classList.remove('active'); });
  btn.style.background='var(--accent)'; btn.style.color='#fff'; btn.style.border='none'; btn.classList.add('active');
  document.querySelectorAll('.cli-panel').forEach(p => p.style.display='none');
  document.getElementById(btn.dataset.tab).style.display='block';
  if (btn.dataset.tab === 'cli-scadenzario') caricaScadenzario();
}

// ── SIDEBAR MOBILE ───────────────────────────────────────────────
function toggleSidebar() {
  document.querySelector('.sidebar').classList.toggle('open');
  document.querySelector('.sidebar-overlay').classList.toggle('show');
}

// ── TOAST ─────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg; t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── MODAL ─────────────────────────────────────────────────────────
function apriModal(html) {
  document.getElementById('modal-permessi-content').innerHTML = html;
  document.getElementById('modal-permessi').style.display = 'flex';
}
function chiudiModalePermessi() { document.getElementById('modal-permessi').style.display = 'none'; }
function chiudiModalOverlay() { document.getElementById('modal-overlay').style.display = 'none'; }
document.getElementById('modal-overlay').addEventListener('click', function(e) { if (e.target === this) chiudiModalOverlay(); });
document.getElementById('modal-permessi').addEventListener('click', function(e) { if (e.target === this) chiudiModalePermessi(); });
function chiudiModal() { chiudiModalePermessi(); chiudiModalOverlay(); }

// ── UTILITÀ ───────────────────────────────────────────────────────
function _sep(s) { return s.replace(/\./g, "'"); }
function fmt(n) {
  const v = Number(n);
  return '€ ' + _sep(v.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
}
function fmtE(n) {
  const v = Number(n);
  const dec = v % 1 === 0 ? 0 : 2;
  return '€ ' + _sep(v.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: 2 }));
}
function fmtL(n) {
  const v = Number(n);
  return _sep(v.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })) + ' L';
}
function badgeStato(stato) {
  const map = { 'confermato':'green','in attesa':'amber','annullato':'red','programmato':'blue','cliente':'blue','deposito':'teal','entrata_deposito':'teal','stazione_servizio':'purple','autoconsumo':'gray' };
  const labels = { 'entrata_deposito':'deposito','stazione_servizio':'stazione','autoconsumo':'autoconsumo' };
  return '<span class="badge ' + (map[esc(stato)]||'amber') + '">' + esc(labels[stato]||stato) + '</span>';
}
function badgeRuolo(ruolo) {
  const map = { 'admin':'purple','operatore':'blue','contabilita':'green','logistica':'amber','cliente':'gray' };
  return '<span class="badge ' + (map[esc(ruolo)]||'gray') + '">' + esc(ruolo) + '</span>';
}
function prezzoNoIva(r) { return Number(r.costo_litro)+Number(r.trasporto_litro)+Number(r.margine); }
function prezzoConIva(r) { return prezzoNoIva(r)*(1+Number(r.iva)/100); }

// ── SANITIZZAZIONE XSS ──────────────────────────────────────────
function esc(str) {
  if (str === null || str === undefined) return '';
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

// ── VALIDAZIONE ──────────────────────────────────────────────────
function validaNumero(val, min, max, nome) {
  const n = parseFloat(val);
  if (isNaN(n)) { toast(nome + ': inserisci un numero valido'); return null; }
  if (min !== undefined && n < min) { toast(nome + ': il valore minimo è ' + min); return null; }
  if (max !== undefined && n > max) { toast(nome + ': il valore massimo è ' + max); return null; }
  return n;
}
function validaTesto(val, nome, obbligatorio) {
  const s = (val||'').trim();
  if (obbligatorio && !s) { toast(nome + ': campo obbligatorio'); return null; }
  return s;
}


// ── CACHE ─────────────────────────────────────────────────────────
let cacheClienti=[], cacheFornitori=[], cacheProdotti=[];

// Helper: popola dropdown prodotti da tabella
function popolaDropdownProdotti(selectId, includiTutti, soloAttivi) {
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const prodotti = soloAttivi !== false ? cacheProdotti.filter(p => p.attivo) : cacheProdotti;
  let html = includiTutti ? '<option value="">Tutti i prodotti</option>' : '<option value="">Seleziona...</option>';
  prodotti.forEach(p => { html += '<option>' + p.nome + '</option>'; });
  sel.innerHTML = html;
}

// Helper: mappa colori prodotti
function getColoriProdotti() {
  const m = {};
  cacheProdotti.forEach(p => { m[p.nome] = p.colore || '#888'; });
  return m;
}

// Helper: mappa prodotto → tipo_cisterna
function getProdottoTipoCisterna() {
  const m = {};
  cacheProdotti.forEach(p => { if (p.tipo_cisterna) m[p.nome] = p.tipo_cisterna; });
  return m;
}

async function caricaSelectFornitori(selectId) {
  const { data } = await sb.from('fornitori').select('id,nome').eq('attivo',true).order('nome');
  cacheFornitori = data||[];
  const sel = document.getElementById(selectId); if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Seleziona...</option>' + cacheFornitori.map(f => '<option value="' + f.id + '">' + f.nome + '</option>').join('');
  if (cur) sel.value = cur;
}

async function caricaSelectClienti(selectId) {
  const { data } = await sb.from('clienti').select('id,nome').eq('attivo',true).order('nome');
  cacheClienti = data||[];
  const sel = document.getElementById(selectId); if (!sel) return;
  sel.innerHTML = '<option value="">Seleziona...</option>' + cacheClienti.map(c => '<option value="' + c.id + '">' + c.nome + '</option>').join('');
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
    tbStorico.innerHTML = ordini.map(r => '<tr><td>' + r.data + '</td><td>' + r.prodotto + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmt(prezzoConIva(r)) + '</td><td style="font-family:var(--font-mono)">' + fmtE(prezzoConIva(r)*r.litri) + '</td><td>' + badgeStato(r.stato) + '</td></tr>').join('');
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

async function caricaPrezzi() {
  // Carica fornitori/clienti solo se cache vuota
  if (!cacheFornitori.length) await caricaSelectFornitori('pr-fornitore');
  else { const s=document.getElementById('pr-fornitore'); if(s&&s.options.length<=1) { s.innerHTML='<option value="">Seleziona...</option>'+cacheFornitori.map(f=>'<option value="'+f.id+'">'+f.nome+'</option>').join(''); } }
  if (!cacheClienti.length) await caricaSelectClienti('pc-cliente');
  const filtroData = document.getElementById('filtro-data-prezzi').value;
  let query = sb.from('prezzi').select('*, basi_carico(nome)').order('data',{ascending:false}).order('fornitore');
  if (filtroData) query = query.eq('data', filtroData);
  const { data } = await query;

  // Calcola prezzi PhoenixFuel da costo medio cisterne
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','deposito_vibo');
  const { data: baseDeposito } = await sb.from('basi_carico').select('*').ilike('nome','%phoenix%').maybeSingle();
  let righeDeposito = [];
  if (cisterne && baseDeposito) {
    const prodotti = [...new Set(cisterne.map(c=>c.prodotto).filter(Boolean))];
    prodotti.forEach(prodotto => {
      const cis = cisterne.filter(c=>c.prodotto===prodotto);
      const totLitri = cis.reduce((s,c)=>s+Number(c.livello_attuale),0);
      if (totLitri > 0) {
        const costoMedio = cis.reduce((s,c)=>s+(Number(c.costo_medio||0)*Number(c.livello_attuale)),0) / totLitri;
        const prodInfo = cacheProdotti.find(p=>p.nome===prodotto);
        const ovr = _depositoOverrides[prodotto] || {};
        righeDeposito.push({ id:'phoenix_'+prodotto, data:filtroData||oggiISO, fornitore:'PhoenixFuel', basi_carico:{nome:baseDeposito.nome}, prodotto, costo_litro:costoMedio, trasporto_litro:ovr.trasporto||0, margine:ovr.margine||0, iva:prodInfo?prodInfo.iva_default:22, _giacenza:totLitri, _isDeposito:true });
      }
    });
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
      return '<div style="margin-bottom:16px"><div style="display:flex;align-items:center;gap:8px;margin-bottom:8px"><div style="width:10px;height:10px;border-radius:50%;background:' + (p.colore||'#888') + '"></div><span style="font-size:13px;font-weight:500">' + esc(p.nome) + '</span></div><div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Fornitore</th><th>Base</th><th>Costo/L</th><th>Trasporto/L</th><th>Margine/L</th><th>Prezzo IVA esc.</th><th>Prezzo IVA inc.</th><th></th></tr></thead><tbody id="' + tbId + '"><tr><td colspan="9" class="loading">Caricamento...</td></tr></tbody></table></div></div>';
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
        tdMargine = '<td class="editable" onclick="editaDepositoValore(this,\'margine\',\'' + r.prodotto + '\',' + r.margine + ')" style="font-family:var(--font-mono)">' + fmt(r.margine) + '</td>';
      } else {
        tdMargine = '<td class="editable" onclick="editaCella(this,\'prezzi\',\'margine\',\'' + r.id + '\',' + r.margine + ')" style="font-family:var(--font-mono)">' + fmt(r.margine) + '</td>';
      }

      html += '<tr><td>' + r.data + '</td><td>' + r.fornitore + giacenzaHtml + '</td><td>' + basNome + '</td>' + tdCosto + tdTrasporto + tdMargine + '<td style="font-family:var(--font-mono)">' + fmt(prezzoNoIva(r)) + '</td><td style="font-family:var(--font-mono)">' + fmt(prezzoConIva(r)) + '</td><td>' + azione + '</td></tr>';
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
  // Ricalcola prodotti disponibili per il tipo selezionato
  if (document.getElementById('ord-fornitore').value) aggiornaProdottiOrdine();
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
    prodotti.forEach(prodotto => {
      const cis = cisterne.filter(c=>c.prodotto===prodotto&&Number(c.livello_attuale)>0);
      if (cis.length) {
        const totLitri = cis.reduce((s,c)=>s+Number(c.livello_attuale),0);
        const costoMedio = cis.reduce((s,c)=>s+(Number(c.costo_medio||0)*Number(c.livello_attuale)),0)/(totLitri||1);
        const prodI = cacheProdotti.find(pp=>pp.nome===prodotto);
        prezziDelGiorno.push({ id:'deposito_'+prodotto, data, fornitore:'PhoenixFuel', fornitore_id:null, base_carico_id:baseDeposito.id, basi_carico:{id:baseDeposito.id,nome:baseDeposito.nome}, prodotto, costo_litro:costoMedio||0, trasporto_litro:0, margine:0, iva:prodI?prodI.iva_default:22, _isDeposito:true });
      }
    });
  }

  const fornitori = [...new Map(prezziDelGiorno.map(p=>[p.fornitore,{nome:p.fornitore}])).values()];
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
  document.getElementById('prev-margine').textContent = fmt(margine);
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
  const record = { data:document.getElementById('ord-data').value, tipo_ordine:tipo, cliente:clienteNome, cliente_id:tipo==='cliente'?clienteId:null, prodotto:prezzoCorrente.prodotto, litri, fornitore:prezzoCorrente.fornitore, costo_litro:prezzoCorrente.costo_litro, trasporto_litro:trasporto, margine:margine, iva:prezzoCorrente.iva, base_carico_id:prezzoCorrente.base_carico_id||null, giorni_pagamento:ggPag, data_scadenza:dataScad.toISOString().split('T')[0], stato:document.getElementById('ord-stato').value, note:document.getElementById('ord-note').value };
  const { data: nuovoOrdine, error } = await sb.from('ordini').insert([record]).select().single();
  if (error) { toast('Errore: '+error.message); return; }
  if (prezzoCorrente._isDeposito && tipo === 'cliente') {
    await confermaUscitaDeposito(nuovoOrdine.id);
    toast('Ordine salvato e deposito aggiornato!');
  } else {
    toast('Ordine salvato!');
  }
  // Reset
  document.getElementById('ord-trasporto-custom').value = '';
  document.getElementById('ord-margine-custom').value = '';
  document.getElementById('ord-prezzo-netto').value = '';
  document.getElementById('fido-cliente-info').style.display = 'none';
  document.getElementById('prev-fido-warn').style.display = 'none';
  fidoClienteCorrente = null;
  _cacheMarginClienti = {};
  caricaOrdini();
}

async function caricaOrdini() {
  await aggiornaSelezioniOrdine();
  // Carica solo gli ultimi 500 ordini per velocità (i filtri restringono ulteriormente)
  const { data } = await sb.from('ordini').select('*, basi_carico(nome)').order('data',{ascending:false}).order('created_at',{ascending:false}).limit(500);
  const tbody = document.getElementById('tabella-ordini');
  if (!data||!data.length) { tbody.innerHTML = '<tr><td colspan="14" class="loading">Nessun ordine</td></tr>'; return; }
  let html = '';
  data.forEach(r => {
    const pL = prezzoConIva(r), tot = pL*r.litri;
    const basNome = r.basi_carico ? r.basi_carico.nome : '—';
    const isApprov = r.tipo_ordine==='entrata_deposito' && !r.caricato_deposito && r.stato!=='annullato';
    const isUscita = r.fornitore && r.fornitore.toLowerCase().includes('phoenix') && (r.tipo_ordine==='cliente' || r.tipo_ordine==='stazione_servizio') && r.stato!=='confermato' && r.stato!=='annullato';
    let btnCisterna = '';
    if (isApprov) btnCisterna = '<button class="btn-primary" style="font-size:11px;padding:3px 8px" onclick="apriModaleAssegnaCisterna(\'' + r.id + '\')">Carica</button> ';
    else if (isUscita) btnCisterna = '<button class="btn-primary" style="font-size:11px;padding:3px 8px;background:#639922" onclick="confermaUscitaDeposito(\'' + r.id + '\')">Scarica</button> ';
    html += '<tr><td>' + r.data + '</td><td>' + badgeStato(r.tipo_ordine||'cliente') + '</td><td>' + esc(r.cliente) + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td>' + esc(r.fornitore) + '</td><td>' + esc(basNome) + '</td><td class="editable" onclick="editaCella(this,\'ordini\',\'trasporto_litro\',\'' + r.id + '\',' + r.trasporto_litro + ')" style="font-family:var(--font-mono)">' + fmt(r.trasporto_litro) + '</td><td class="editable" onclick="editaCella(this,\'ordini\',\'margine\',\'' + r.id + '\',' + r.margine + ')" style="font-family:var(--font-mono)">' + fmt(r.margine) + '</td><td style="font-family:var(--font-mono)">' + fmt(pL) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td><td style="font-size:11px;color:var(--text-hint)">' + (r.data_scadenza||'—') + '</td><td>' + badgeStato(r.stato) + '</td><td>' + btnCisterna + '<button class="btn-edit" title="Conferma ordine PDF" onclick="apriConfermaOrdine(\'' + r.id + '\')">📄</button><button class="btn-edit" onclick="apriModaleOrdine(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'ordini\',\'' + r.id + '\',caricaOrdini)">x</button></td></tr>';
  });
  tbody.innerHTML = html;
}

// Dati ordini per filtro client-side
let _ordiniCache = [];

function filtraOrdini() {
  const q = (document.getElementById('search-ordini').value||'').toLowerCase();
  const prodotto = document.getElementById('filtro-prodotto-ordini').value;
  const stato = document.getElementById('filtro-stato-ordini').value;
  const tipoFiltro = document.getElementById('filtro-tipo-ordini').value;
  const da = document.getElementById('filtro-da-ordini').value;
  const a = document.getElementById('filtro-a-ordini').value;
  const tipoLabels = { 'cliente':'cliente','entrata_deposito':'deposito','stazione_servizio':'stazione','autoconsumo':'autoconsumo' };
  const righe = document.querySelectorAll('#tabella-ordini tr');
  righe.forEach(tr => {
    const celle = tr.querySelectorAll('td');
    if (!celle.length) return;
    const dataOrd = celle[0]?.textContent || '';
    const tipoBadge = celle[1]?.textContent?.trim() || '';
    const cliente = celle[2]?.textContent?.toLowerCase() || '';
    const prod = celle[3]?.textContent || '';
    const st = celle[12]?.textContent || '';
    let vis = true;
    if (q && !cliente.includes(q)) vis = false;
    if (prodotto && prod !== prodotto) vis = false;
    if (stato && st !== stato) vis = false;
    if (tipoFiltro && tipoBadge !== (tipoLabels[tipoFiltro]||tipoFiltro)) vis = false;
    if (da && dataOrd < da) vis = false;
    if (a && dataOrd > a) vis = false;
    tr.style.display = vis ? '' : 'none';
  });
}

// ── MODIFICA ORDINE ───────────────────────────────────────────────
async function apriModaleOrdine(id) {
  const { data: r } = await sb.from('ordini').select('*').eq('id', id).single();
  if (!r) return;

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

  // Lista documenti esistenti
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
  html += '<div class="form-group" style="flex:1"><label>Carica documento (PDF)</label><input type="file" id="doc-file" accept=".pdf" style="font-size:12px" /></div>';
  html += '<div class="form-group"><label>Tipo</label><select id="doc-tipo" style="font-size:12px"><option value="das">DAS</option><option value="conferma">Conferma</option><option value="fattura">Fattura</option><option value="altro">Altro</option></select></div>';
  html += '<button class="btn-primary" style="padding:8px 14px;font-size:12px;margin-bottom:5px" onclick="uploadDocumento(\'' + id + '\')">Carica</button>';
  html += '</div></div>';

  html += '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn-primary" style="flex:1" onclick="salvaModificaOrdine(\'' + id + '\')">Salva modifiche</button><button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button></div>';
  apriModal(html);
}

async function salvaModificaOrdine(id) {
  const litri = parseFloat(document.getElementById('mod-litri').value);
  const costo = parseFloat(document.getElementById('mod-costo').value);
  const trasporto = parseFloat(document.getElementById('mod-trasporto').value);
  const margine = parseFloat(document.getElementById('mod-margine').value);
  const iva = parseInt(document.getElementById('mod-iva').value);
  const ggPag = parseInt(document.getElementById('mod-gg').value);
  const { data: ordine } = await sb.from('ordini').select('data').eq('id', id).single();
  const dataScad = new Date(ordine.data); dataScad.setDate(dataScad.getDate()+ggPag);
  const { error } = await sb.from('ordini').update({ stato:document.getElementById('mod-stato').value, litri, costo_litro:costo, trasporto_litro:trasporto, margine, iva, giorni_pagamento:ggPag, data_scadenza:dataScad.toISOString().split('T')[0], note:document.getElementById('mod-note').value }).eq('id', id);
  if (error) { toast('Errore: '+error.message); return; }
  toast('Ordine aggiornato!');
  chiudiModalePermessi();
  caricaOrdini();
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
  if (!fileInput.files.length) { toast('Seleziona un file PDF'); return; }
  const file = fileInput.files[0];
  if (file.type !== 'application/pdf') { toast('Solo file PDF ammessi'); return; }
  if (file.size > 10 * 1024 * 1024) { toast('File troppo grande (max 10MB)'); return; }

  const nomeFile = file.name;
  const percorso = ordineId + '/' + Date.now() + '_' + nomeFile.replace(/[^a-zA-Z0-9._-]/g, '_');

  toast('Caricamento in corso...');

  // Upload su Supabase Storage
  const { error: errUpload } = await sb.storage.from('Das').upload(percorso, file, { contentType: 'application/pdf' });
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
  toast('Eliminato'); callback();
}

// ── DEPOSITO ─────────────────────────────────────────────────────

function cisternasvg(pct, colore) {
  const altMax=80, liv=Math.round((pct/100)*altMax), y=10+(altMax-liv);
  const fill = pct<20?'#E24B4A':pct<35?'#BA7517':colore;
  return '<svg class="dep-cisterna-svg" viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg"><rect x="5" y="10" width="50" height="80" rx="4" fill="#e8e7e3" stroke="#ccc" stroke-width="1"/><rect x="5" y="' + y + '" width="50" height="' + liv + '" rx="2" fill="' + fill + '" opacity="0.85"/><rect x="5" y="10" width="50" height="80" rx="4" fill="none" stroke="#bbb" stroke-width="1.5"/><rect x="20" y="5" width="20" height="8" rx="2" fill="#ccc"/><line x1="5" y1="30" x2="8" y2="30" stroke="#bbb" stroke-width="1"/><line x1="5" y1="50" x2="8" y2="50" stroke="#bbb" stroke-width="1"/><line x1="5" y1="70" x2="8" y2="70" stroke="#bbb" stroke-width="1"/></svg>';
}

async function caricaDeposito() {
  _cacheCisterne = null; // Invalida cache per ordini
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','deposito_vibo').order('tipo').order('nome');
  if (!cisterne) return;

  // Raggruppa cisterne per tipo
  const tipi = [...new Set(cisterne.map(c => c.tipo))];
  // Ordina tipi secondo ordine_visualizzazione dei prodotti
  const tipiOrdinati = [...tipi].sort((a, b) => {
    const pa = cacheProdotti.find(p => p.tipo_cisterna === a);
    const pb = cacheProdotti.find(p => p.tipo_cisterna === b);
    return (pa ? pa.ordine_visualizzazione : 99) - (pb ? pb.ordine_visualizzazione : 99);
  });

  const container = document.getElementById('container-deposito-prodotti');
  let totaleStoccato = 0, capacitaTotale = 0, allerte = 0;
  let htmlBenzine = '', htmlMagazzino = '';

  tipiOrdinati.forEach(tipo => {
    const gruppo = cisterne.filter(c => c.tipo === tipo);
    if (!gruppo.length) return;
    const prodNome = gruppo[0].prodotto || tipo;
    const prodInfo = cacheProdotti.find(p => p.tipo_cisterna === tipo || p.nome === prodNome);
    const colore = prodInfo ? prodInfo.colore : '#888';
    const categoria = prodInfo ? prodInfo.categoria : 'altro';
    const um = prodInfo && prodInfo.unita_misura === 'pezzi' ? 'pz' : 'L';
    const nCis = gruppo.length;
    const capGruppo = gruppo.reduce((s, c) => s + Number(c.capacita_max), 0);
    let totG = 0;

    let cisHtml = '';
    gruppo.forEach(c => {
      const capMax = Number(c.capacita_max);
      const livAtt = Number(c.livello_attuale);
      const pct = capMax > 0 ? Math.round((livAtt / capMax) * 100) : 0;
      totG += livAtt;
      cisHtml += '<div class="dep-cisterna' + (pct < 30 ? ' alert' : '') + '">' +
        '<div class="dep-cisterna-name">' + c.nome + '</div>' +
        cisternasvg(pct, colore) +
        '<div class="dep-cisterna-litri">' + _sep(livAtt.toLocaleString('it-IT')) + ' ' + um + '</div>' +
        '<div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(capMax.toLocaleString('it-IT')) + ' ' + um + '</div>' +
        '</div>';
    });

    const subLabel = nCis + (nCis === 1 ? ' cisterna' : ' cisterne') + ' · ' + _sep(capGruppo.toLocaleString('it-IT')) + ' ' + um;
    const totLabel = um === 'pz' ? _sep(totG.toLocaleString('it-IT')) + ' pz' : fmtL(totG);
    const cardHtml = '<div class="card"><div class="dep-product-header"><div class="dep-product-dot" style="background:' + colore + '"></div><div><div class="dep-product-title">' + esc(prodNome) + '</div><div class="dep-product-sub">' + subLabel + '</div></div><div class="dep-product-total">' + totLabel + '</div></div><div class="dep-cisterne-grid">' + cisHtml + '</div></div>';

    if (categoria === 'benzine') { htmlBenzine += cardHtml; totaleStoccato += totG; capacitaTotale += capGruppo; } else { htmlMagazzino += cardHtml; }
  });

  // Allerte: ricalcola solo benzine
  allerte = 0;
  cisterne.filter(c => { const pi = cacheProdotti.find(p => p.tipo_cisterna === c.tipo || p.nome === c.prodotto); return pi && pi.categoria === 'benzine'; }).forEach(c => {
    const pct = Number(c.capacita_max) > 0 ? Math.round((Number(c.livello_attuale) / Number(c.capacita_max)) * 100) : 0;
    if (pct < 30) allerte++;
  });

  let finalHtml = '';
  if (htmlBenzine) finalHtml += '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:8px">⛽ Cisterne Carburanti</div>' + htmlBenzine;
  if (htmlMagazzino) finalHtml += '<div style="font-size:13px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin:16px 0 8px">📦 Magazzino Altri Prodotti</div>' + htmlMagazzino;
  if (container) container.innerHTML = finalHtml;
  document.getElementById('dep-capacita').textContent = fmtL(capacitaTotale);
  document.getElementById('dep-totale').textContent = fmtL(totaleStoccato);
  document.getElementById('dep-pct').textContent = capacitaTotale > 0 ? Math.round((totaleStoccato / capacitaTotale) * 100) + '%' : '—';
  document.getElementById('dep-allerta').textContent = allerte;
  const { data: mov } = await sb.from('ordini').select('*').or('tipo_ordine.eq.entrata_deposito,tipo_ordine.eq.stazione_servizio,tipo_ordine.eq.autoconsumo,fornitore.ilike.%phoenix%').order('created_at',{ascending:false}).limit(10);
  const tbody = document.getElementById('dep-movimenti');
  if (!mov||!mov.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun movimento</td></tr>'; return; }
  const movBadge = { 'entrata_deposito':'<span class="badge teal">Entrata</span>', 'stazione_servizio':'<span class="badge purple">Stazione</span>', 'autoconsumo':'<span class="badge gray">Autoconsumo</span>' };
  tbody.innerHTML = mov.map(r => '<tr><td>' + r.data + '</td><td>' + (movBadge[r.tipo_ordine]||'<span class="badge amber">Uscita</span>') + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td>' + esc(r.fornitore) + '</td><td>' + badgeStato(r.stato) + '</td></tr>').join('');
  caricaRettifiche('deposito');
  _popolaSelAnnoGiac('giac-dep-anno');
}

async function aggiornaCisterna(cisternaId, litri, tipo, ordineId, data, costoLitro) {
  const { data: cis } = await sb.from('cisterne').select('*').eq('id', cisternaId).single();
  if (!cis) return;
  let nuovoLivello, nuovoCostoMedio = Number(cis.costo_medio||0);
  if (tipo==='entrata') {
    nuovoLivello = Number(cis.livello_attuale) + Number(litri);
    if (costoLitro && costoLitro > 0) {
      const costoVecchio = Number(cis.livello_attuale) * Number(cis.costo_medio||0);
      nuovoCostoMedio = (costoVecchio + Number(litri)*Number(costoLitro)) / nuovoLivello;
    }
  } else {
    nuovoLivello = Math.max(0, Number(cis.livello_attuale) - Number(litri));
  }
  await sb.from('cisterne').update({ livello_attuale:nuovoLivello, costo_medio:nuovoCostoMedio, updated_at:new Date().toISOString() }).eq('id', cisternaId);
  await sb.from('movimenti_cisterne').insert([{ cisterna_id:cisternaId, ordine_id:ordineId, tipo, litri, data }]);
}

async function apriModaleAssegnaCisterna(ordineId) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  const prodottoMap = getProdottoTipoCisterna();
  const tipo = prodottoMap[ordine.prodotto] || 'autotrazione';
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('tipo', tipo).eq('sede','deposito_vibo').order('nome');
  if (!cisterne||!cisterne.length) { toast('Nessuna cisterna trovata per questo prodotto'); return; }

  // Distribuzione automatica ottimale
  let litriRimanenti = Number(ordine.litri);
  const distribuzione = {};
  const ordinate = [...cisterne].map(c=>({...c, spazio:Number(c.capacita_max)-Number(c.livello_attuale)})).filter(c=>c.spazio>0).sort((a,b)=>b.spazio-a.spazio);
  ordinate.forEach(c => {
    if (litriRimanenti <= 0) return;
    const qta = Math.min(litriRimanenti, c.spazio);
    distribuzione[c.id] = qta;
    litriRimanenti -= qta;
  });

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">Distribuzione carico — ' + ordine.prodotto + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:12px">Totale da caricare: <strong>' + fmtL(ordine.litri) + '</strong></div>';
  if (litriRimanenti > 0) html += '<div class="alert-box" style="margin-bottom:12px">Spazio insufficiente! Mancano ' + fmtL(litriRimanenti) + '</div>';

  cisterne.forEach(c => {
    const pct = Math.round((Number(c.livello_attuale)/Number(c.capacita_max))*100);
    const spazio = Number(c.capacita_max) - Number(c.livello_attuale);
    const qtaSuggerita = distribuzione[c.id] || 0;
    html += '<div style="padding:12px;background:var(--bg-kpi);border-radius:8px;margin-bottom:8px">' +
      '<div style="display:flex;justify-content:space-between;margin-bottom:6px"><span style="font-size:13px;font-weight:500">' + c.nome + '</span><span style="font-size:11px;color:var(--text-muted)">Spazio: ' + fmtL(spazio) + '</span></div>' +
      '<div style="height:4px;background:var(--border);border-radius:2px;margin-bottom:8px"><div style="height:100%;width:' + pct + '%;background:' + (pct<30?'#E24B4A':pct<60?'#BA7517':'#639922') + ';border-radius:2px"></div></div>' +
      '<div style="display:flex;align-items:center;gap:8px"><label style="font-size:11px;color:var(--text-muted)">Litri da caricare:</label>' +
      '<input type="number" id="cis-qty-' + c.id + '" value="' + qtaSuggerita + '" min="0" max="' + spazio + '" style="flex:1;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;font-size:12px;background:var(--bg)" oninput="aggiornaTotaleCarico2(' + ordine.litri + ')" />' +
      '<span style="font-size:11px;color:var(--text-muted);white-space:nowrap">max ' + fmtL(spazio) + '</span></div></div>';
  });

  html += '<div style="background:var(--bg-kpi);padding:10px 14px;border-radius:8px;margin-bottom:14px;font-size:12px;display:flex;gap:16px">' +
    '<span>Totale ordine: <strong>' + fmtL(ordine.litri) + '</strong></span>' +
    '<span>Assegnato: <strong id="tot-assegnato">—</strong></span>' +
    '<span id="msg-diff" style="color:#A32D2D"></span></div>';
  html += '<div style="display:flex;gap:8px"><button class="btn-primary" style="flex:1" onclick="confermaCaricoDeposito(\'' + ordineId + '\')">Conferma carico</button><button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button></div>';

  apriModal(html);
  window._cisterneCarico = cisterne;
  aggiornaTotaleCarico2(ordine.litri);
}

function aggiornaTotaleCarico2(totaleOrdine) {
  const cisterne = window._cisterneCarico || [];
  let totAssegnato = 0;
  cisterne.forEach(c => { const inp = document.getElementById('cis-qty-'+c.id); if(inp) totAssegnato += parseFloat(inp.value)||0; });
  const elTot = document.getElementById('tot-assegnato');
  const elMsg = document.getElementById('msg-diff');
  if (elTot) elTot.textContent = fmtL(totAssegnato);
  if (elMsg) {
    const diff = totaleOrdine - totAssegnato;
    elMsg.textContent = diff > 0 ? 'Mancano ' + fmtL(diff) : diff < 0 ? 'Eccesso ' + fmtL(Math.abs(diff)) : 'OK';
    elMsg.style.color = diff === 0 ? '#3B6D11' : '#A32D2D';
  }
}

async function confermaCaricoDeposito(ordineId) {
  const cisterne = window._cisterneCarico || [];
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  let totAssegnato = 0;
  cisterne.forEach(c => { const inp = document.getElementById('cis-qty-'+c.id); if(inp) totAssegnato += parseFloat(inp.value)||0; });
  const diff = Math.abs(Number(ordine.litri) - totAssegnato);
  if (diff > 1) { toast('Il totale assegnato non corrisponde. Ordine: ' + fmtL(ordine.litri) + ', Assegnato: ' + fmtL(totAssegnato)); return; }
  for (const c of cisterne) {
    const inp = document.getElementById('cis-qty-'+c.id);
    const qta = parseFloat(inp?.value)||0;
    if (qta > 0) await aggiornaCisterna(c.id, qta, 'entrata', ordineId, ordine.data, ordine.costo_litro);
  }
  await sb.from('ordini').update({ stato:'confermato', caricato_deposito:true }).eq('id', ordineId);
  toast('Carico confermato! Cisterne aggiornate.');
  chiudiModalePermessi();
  caricaDeposito();
  caricaOrdini();
}

async function confermaUscitaDeposito(ordineId) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) return;
  const prodottoMap = getProdottoTipoCisterna();
  const tipo = prodottoMap[ordine.prodotto] || 'autotrazione';
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('tipo', tipo).eq('sede','deposito_vibo').order('livello_attuale',{ascending:false});
  if (!cisterne||!cisterne.length) { toast('Nessuna cisterna trovata per questo prodotto'); return; }
  const cis = cisterne[0];
  if (Number(cis.livello_attuale) < Number(ordine.litri)) { toast('Giacenza insufficiente! Disponibili: ' + fmtL(cis.livello_attuale)); return; }
  await aggiornaCisterna(cis.id, ordine.litri, 'uscita', ordineId, ordine.data);
  await sb.from('ordini').update({ stato:'confermato', cisterna_id:cis.id }).eq('id', ordineId);
  toast('Uscita registrata! Cisterna aggiornata.');
  caricaDeposito();
  caricaOrdini();
}

// ── RETTIFICHE INVENTARIO ─────────────────────────────────────────
async function caricaRettifiche(tipo) {
  const tbodyId = tipo === 'deposito' ? 'rett-deposito-storico' : 'rett-stazione-storico';
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  const { data } = await sb.from('rettifiche_inventario').select('*, cisterne(nome)').eq('tipo', tipo).order('data',{ascending:false}).order('created_at',{ascending:false}).limit(100);
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading">Nessuna rettifica</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const diff = Number(r.differenza);
    const diffColor = diff > 0 ? '#639922' : diff < 0 ? '#E24B4A' : 'var(--text)';
    const diffLabel = (diff > 0 ? '+' : '') + _sep(diff.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
    const statoBadge = r.confermata ? '<span class="badge green">Confermata</span>' : '<span class="badge amber">In attesa</span>';
    const cisNome = r.cisterne ? r.cisterne.nome : '—';
    let azioni = '';
    if (!r.confermata) {
      azioni = '<button class="btn-primary" style="font-size:10px;padding:3px 8px" onclick="confermaRettifica(\'' + r.id + '\',\'' + tipo + '\')">✓ Conferma</button> ';
      azioni += '<button class="btn-danger" style="font-size:10px;padding:3px 6px" onclick="eliminaRettifica(\'' + r.id + '\',\'' + tipo + '\')">x</button>';
    } else {
      azioni = '<span style="font-size:10px;color:var(--text-hint)">' + (r.confermata_da || '') + '</span>';
    }
    return '<tr><td>' + r.data + '</td><td>' + esc(cisNome) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.giacenza_sistema||0) + '</td><td style="font-family:var(--font-mono);font-weight:600">' + fmtL(r.giacenza_rilevata) + '</td><td style="font-family:var(--font-mono);color:' + diffColor + ';font-weight:600">' + diffLabel + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td>' + statoBadge + '</td><td>' + azioni + '</td></tr>';
  }).join('');
}

async function nuovaRettifica(tipo) {
  const sede = tipo === 'deposito' ? 'deposito_vibo' : 'stazione_oppido';
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede', sede).order('tipo').order('nome');
  if (!cisterne || !cisterne.length) { toast('Nessuna cisterna trovata'); return; }

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Nuova rettifica — ' + (tipo === 'deposito' ? 'Deposito Vibo' : 'Stazione Oppido') + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Data rilevazione</label><input type="date" id="rett-data" value="' + oggiISO + '" /></div>';
  html += '<div class="form-group"><label>Cisterna</label><select id="rett-cisterna" onchange="aggiornaGiacenzaSistema()">';
  cisterne.forEach(c => {
    const prodInfo = cacheProdotti.find(p => p.nome === c.prodotto);
    const colore = prodInfo ? prodInfo.colore : '#888';
    html += '<option value="' + c.id + '" data-livello="' + c.livello_attuale + '">' + esc(c.nome) + ' (' + esc(c.prodotto) + ' — attuale: ' + fmtL(c.livello_attuale) + ')</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group"><label>Giacenza a sistema</label><input type="text" id="rett-sistema" readonly style="background:var(--bg);color:var(--text-muted);font-family:var(--font-mono)" /></div>';
  html += '<div class="form-group"><label>Giacenza rilevata</label><input type="number" id="rett-rilevata" step="0.01" placeholder="Inserisci quantità reale" oninput="calcolaDiffRettifica()" /></div>';
  html += '<div class="form-group"><label>Differenza</label><input type="text" id="rett-diff" readonly style="background:var(--bg);font-family:var(--font-mono);font-weight:600" /></div>';
  html += '<div class="form-group"><label>Note / motivazione</label><input type="text" id="rett-note" placeholder="Es. inventario fisico, errore carico..." /></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary" onclick="salvaRettifica(\'' + tipo + '\')">💾 Salva rettifica</button><button class="btn-secondary" onclick="chiudiModal()">Annulla</button></div>';
  apriModal(html);
  aggiornaGiacenzaSistema();
}

function aggiornaGiacenzaSistema() {
  const sel = document.getElementById('rett-cisterna');
  if (!sel) return;
  const opt = sel.options[sel.selectedIndex];
  const livello = opt ? opt.dataset.livello : '0';
  document.getElementById('rett-sistema').value = fmtL(livello);
  calcolaDiffRettifica();
}

function calcolaDiffRettifica() {
  const sel = document.getElementById('rett-cisterna');
  const opt = sel ? sel.options[sel.selectedIndex] : null;
  const sistema = opt ? Number(opt.dataset.livello) : 0;
  const rilevata = parseFloat(document.getElementById('rett-rilevata').value);
  const diffEl = document.getElementById('rett-diff');
  if (!isNaN(rilevata)) {
    const diff = rilevata - sistema;
    diffEl.value = (diff > 0 ? '+' : '') + _sep(diff.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
    diffEl.style.color = diff > 0 ? '#639922' : diff < 0 ? '#E24B4A' : 'var(--text)';
  } else {
    diffEl.value = '—';
    diffEl.style.color = 'var(--text)';
  }
}

async function salvaRettifica(tipo) {
  const data = document.getElementById('rett-data').value;
  if (!data) { toast('Seleziona una data'); return; }
  const cisternaId = document.getElementById('rett-cisterna').value;
  const sel = document.getElementById('rett-cisterna');
  const opt = sel.options[sel.selectedIndex];
  const sistema = Number(opt.dataset.livello);
  const rilevata = parseFloat(document.getElementById('rett-rilevata').value);
  if (isNaN(rilevata) || rilevata < 0) { toast('Inserisci una giacenza valida'); return; }
  const note = document.getElementById('rett-note').value.trim();

  const record = {
    tipo,
    data,
    cisterna_id: cisternaId,
    prodotto: opt.textContent.split('(')[1]?.split(' —')[0]?.trim() || '',
    giacenza_sistema: sistema,
    giacenza_rilevata: rilevata,
    differenza: rilevata - sistema,
    note: note || null
  };
  const { error } = await sb.from('rettifiche_inventario').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Rettifica salvata — in attesa di conferma');
  chiudiModal();
  caricaRettifiche(tipo);
}

async function confermaRettifica(id, tipo) {
  if (!confirm('Confermare questa rettifica?\n\nLa giacenza della cisterna verrà aggiornata al valore rilevato. Questa operazione non è reversibile.')) return;

  const { data: rett } = await sb.from('rettifiche_inventario').select('*').eq('id', id).single();
  if (!rett) { toast('Rettifica non trovata'); return; }

  // Aggiorna cisterna con la giacenza rilevata
  const { error: errCis } = await sb.from('cisterne').update({
    livello_attuale: rett.giacenza_rilevata,
    updated_at: new Date().toISOString()
  }).eq('id', rett.cisterna_id);
  if (errCis) { toast('Errore aggiornamento cisterna: ' + errCis.message); return; }

  // Segna come confermata
  const { error: errRett } = await sb.from('rettifiche_inventario').update({
    confermata: true,
    confermata_da: utenteCorrente.nome || utenteCorrente.email,
    confermata_il: new Date().toISOString()
  }).eq('id', id);
  if (errRett) { toast('Errore conferma: ' + errRett.message); return; }

  toast('Rettifica confermata — giacenza aggiornata!');
  caricaRettifiche(tipo);
  if (tipo === 'deposito') caricaDeposito();
  else caricaGiacenzeStazione();
}

async function eliminaRettifica(id, tipo) {
  if (!confirm('Eliminare questa rettifica non confermata?')) return;
  const { error } = await sb.from('rettifiche_inventario').delete().eq('id', id).eq('confermata', false);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Rettifica eliminata');
  caricaRettifiche(tipo);
}

async function stampaRettifiche(tipo) {
  const sedeLabel = tipo === 'deposito' ? 'Deposito Vibo' : 'Stazione Oppido';
  const { data } = await sb.from('rettifiche_inventario').select('*, cisterne(nome)').eq('tipo', tipo).order('data',{ascending:false}).order('created_at',{ascending:false});
  if (!data || !data.length) { toast('Nessuna rettifica da stampare'); return; }

  let righeHtml = '';
  data.forEach(function(r, i) {
    var diff = Number(r.differenza || 0);
    var diffColor = diff > 0 ? '#639922' : diff < 0 ? '#E24B4A' : '#333';
    var diffLabel = (diff > 0 ? '+' : '') + _sep(diff.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
    var stato = r.confermata ? 'CONFERMATA' : 'IN ATTESA';
    var statoColor = r.confermata ? '#639922' : '#BA7517';
    var confInfo = r.confermata ? (r.confermata_da || '') + (r.confermata_il ? ' — ' + new Date(r.confermata_il).toLocaleDateString('it-IT') : '') : '';
    righeHtml += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + r.data + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(r.cisterne ? r.cisterne.nome : '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(r.prodotto || '—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(r.giacenza_sistema||0) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtL(r.giacenza_rilevata) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:' + diffColor + ';font-weight:bold">' + diffLabel + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-size:10px">' + esc(r.note||'—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;color:' + statoColor + ';font-weight:bold;font-size:10px">' + stato + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-size:9px;color:#666">' + confInfo + '</td>' +
      '</tr>';
  });

  var totConfirmate = data.filter(function(r) { return r.confermata; }).length;
  var totAttesa = data.filter(function(r) { return !r.confermata; }).length;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rettifiche ' + sedeLabel + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#6B5FCC;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #5A4FBB;text-align:center}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#6B5FCC">REGISTRO RETTIFICHE INVENTARIO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Sede: <strong>' + sedeLabel + '</strong> — Totale: <strong>' + data.length + '</strong> rettifiche</div>';
  html += '<div style="font-size:11px;color:#666">Confermate: <strong style="color:#639922">' + totConfirmate + '</strong> — In attesa: <strong style="color:#BA7517">' + totAttesa + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<table><thead><tr><th>#</th><th>Data</th><th>Cisterna</th><th>Prodotto</th><th>Giac. sistema</th><th>Giac. rilevata</th><th>Differenza</th><th>Note</th><th>Stato</th><th>Confermata da</th></tr></thead><tbody>';
  html += righeHtml;
  html += '</tbody></table>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

// ── AUTOCONSUMO ──────────────────────────────────────────────────
async function caricaAutoconsumo() {
  // Cisterna autoconsumo
  const { data: cis } = await sb.from('cisterne').select('*').eq('sede','autoconsumo').single();
  if (cis) {
    const pct = Number(cis.capacita_max) > 0 ? Math.round((Number(cis.livello_attuale) / Number(cis.capacita_max)) * 100) : 0;
    document.getElementById('ac-giacenza').textContent = fmtL(cis.livello_attuale);
    const el = document.getElementById('ac-cisterna-grafica');
    if (el) {
      el.innerHTML = '<div class="card"><div class="dep-product-header"><div class="dep-product-dot" style="background:#BA7517"></div><div><div class="dep-product-title">' + esc(cis.nome) + '</div><div class="dep-product-sub">Gasolio Autotrazione · cap. ' + fmtL(cis.capacita_max) + '</div></div><div class="dep-product-total">' + fmtL(cis.livello_attuale) + '</div></div><div class="dep-cisterne-grid"><div class="dep-cisterna">' + cisternasvg(pct, '#BA7517') + '<div class="dep-cisterna-litri">' + _sep(Number(cis.livello_attuale).toLocaleString('it-IT')) + ' L</div><div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(Number(cis.capacita_max).toLocaleString('it-IT')) + ' L</div></div></div></div>';
    }
    window._cisternaAutoconsumo = cis;
  }

  // Prelievi mese
  const inizioMese = oggiISO.substring(0,8) + '01';
  const { data: prelMese } = await sb.from('prelievi_autoconsumo').select('litri').gte('data', inizioMese).lte('data', oggiISO);
  const totMese = (prelMese||[]).reduce((s,p) => s + Number(p.litri), 0);
  document.getElementById('ac-prelievi-mese').textContent = fmtL(totMese);

  // Ordini autoconsumo confermati da ricevere
  await caricaOrdiniAutoconsumo();

  // Popola mezzi propri
  const { data: mezzi } = await sb.from('mezzi').select('id,targa').eq('attivo',true).order('targa');
  const selM = document.getElementById('ac-mezzo');
  if (selM && mezzi) selM.innerHTML = '<option value="">Seleziona camion...</option>' + mezzi.map(m => '<option value="' + m.id + '" data-targa="' + esc(m.targa) + '">' + m.targa + '</option>').join('');

  // Data default
  const dataEl = document.getElementById('ac-data');
  if (dataEl && !dataEl.value) dataEl.value = oggiISO;

  // Filtri anno
  const selAnno = document.getElementById('ac-filtro-anno');
  if (selAnno && selAnno.options.length <= 1) {
    const annoCorrente = new Date().getFullYear();
    selAnno.innerHTML = '';
    for (let a = annoCorrente; a >= annoCorrente - 3; a--) selAnno.innerHTML += '<option value="' + a + '">' + a + '</option>';
  }
  const da = document.getElementById('ac-filtro-da');
  const aa = document.getElementById('ac-filtro-a');
  if (da && !da.value) da.value = inizioMese;
  if (aa && !aa.value) aa.value = oggiISO;

  caricaPrelievi();
  _popolaSelAnnoGiac('giac-ac-anno');
}

async function caricaOrdiniAutoconsumo() {
  const { data: ordini } = await sb.from('ordini').select('*').eq('tipo_ordine','autoconsumo').eq('stato','confermato').or('caricato_deposito.eq.false,caricato_deposito.is.null').order('data',{ascending:false});
  const el = document.getElementById('ac-da-ricevere');
  if (!el) return;
  if (!ordini || !ordini.length) { el.innerHTML = ''; return; }

  let html = '<div class="card" style="border-left:4px solid #BA7517">';
  html += '<div class="card-title" style="color:#BA7517">📦 Ordini autoconsumo da ricevere (' + ordini.length + ')</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Prodotto</th><th>Litri</th><th>Fornitore</th><th></th></tr></thead><tbody>';
  ordini.forEach(function(r) {
    html += '<tr><td>' + new Date(r.data).toLocaleDateString('it-IT') + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td>' + esc(r.fornitore) + '</td><td><button class="btn-primary" style="font-size:11px;padding:4px 12px;background:#BA7517" onclick="riceviAutoconsumo(\'' + r.id + '\',' + r.litri + ')">📦 Ricevi</button></td></tr>';
  });
  html += '</tbody></table></div></div>';
  el.innerHTML = html;
}

async function riceviAutoconsumo(ordineId, litri) {
  const cis = window._cisternaAutoconsumo;
  if (!cis) { toast('Cisterna autoconsumo non trovata'); return; }
  if (!confirm('Confermi la ricezione di ' + fmtL(litri) + ' L nella cisterna autoconsumo?')) return;

  const nuovoLivello = Number(cis.livello_attuale) + Number(litri);
  const { error: errCis } = await sb.from('cisterne').update({ livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }).eq('id', cis.id);
  if (errCis) { toast('Errore cisterna: ' + errCis.message); return; }

  await sb.from('ordini').update({ caricato_deposito: true }).eq('id', ordineId);
  toast('✅ ' + fmtL(litri) + ' L ricevuti nella cisterna autoconsumo!');
  caricaAutoconsumo();
}

async function salvaPrelievoAutoconsumo() {
  const data = document.getElementById('ac-data').value;
  const mezzoId = document.getElementById('ac-mezzo').value;
  const mezzoTarga = document.getElementById('ac-mezzo').options[document.getElementById('ac-mezzo').selectedIndex]?.dataset?.targa || '';
  const litri = parseFloat(document.getElementById('ac-litri').value);
  const note = document.getElementById('ac-note').value;
  if (!data || !mezzoId || !litri || litri <= 0) { toast('Compila data, camion e litri'); return; }

  const cis = window._cisternaAutoconsumo;
  if (!cis) { toast('Cisterna autoconsumo non trovata'); return; }
  if (Number(cis.livello_attuale) < litri) { toast('Giacenza insufficiente! Disponibili: ' + fmtL(cis.livello_attuale)); return; }

  // Registra prelievo
  const { error } = await sb.from('prelievi_autoconsumo').insert([{ data, mezzo_id: mezzoId, mezzo_targa: mezzoTarga, litri, note }]);
  if (error) { toast('Errore: ' + error.message); return; }

  // Scala dalla cisterna
  const nuovoLivello = Number(cis.livello_attuale) - litri;
  await sb.from('cisterne').update({ livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }).eq('id', cis.id);

  toast('⛽ Prelievo di ' + fmtL(litri) + ' L registrato per ' + mezzoTarga);
  document.getElementById('ac-litri').value = '';
  document.getElementById('ac-note').value = '';
  caricaAutoconsumo();
}

function resetFiltroCamion() {
  const sel = document.getElementById('ac-filtro-camion');
  if (sel) { sel.innerHTML = '<option value="">Tutti i camion</option>'; }
}

async function caricaPrelievi() {
  const da = document.getElementById('ac-filtro-da').value;
  const a = document.getElementById('ac-filtro-a').value;
  const filtroCamion = document.getElementById('ac-filtro-camion').value;
  if (!da || !a) return;
  let q = sb.from('prelievi_autoconsumo').select('*').gte('data', da).lte('data', a);
  if (filtroCamion) q = q.eq('mezzo_targa', filtroCamion);
  const { data } = await q.order('data',{ascending:false}).order('created_at',{ascending:false});
  const tbody = document.getElementById('ac-tabella-prelievi');

  // Popola dropdown camion (solo se vuoto o cambio periodo)
  const sel = document.getElementById('ac-filtro-camion');
  if (sel.options.length <= 1) {
    const { data: tutti } = await sb.from('prelievi_autoconsumo').select('mezzo_targa').gte('data', da).lte('data', a);
    const targhe = [...new Set((tutti||[]).map(r => r.mezzo_targa).filter(Boolean))].sort();
    const valPrec = sel.value;
    sel.innerHTML = '<option value="">Tutti i camion</option>' + targhe.map(t => '<option value="' + esc(t) + '">' + esc(t) + '</option>').join('');
    sel.value = valPrec;
  }

  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="5" class="loading">Nessun prelievo' + (filtroCamion ? ' per ' + filtroCamion : '') + '</td></tr>';
    document.getElementById('ac-totale-prelievi').innerHTML = '';
    return;
  }
  let totLitri = 0;
  tbody.innerHTML = data.map(function(r) {
    totLitri += Number(r.litri);
    return '<tr><td>' + new Date(r.data).toLocaleDateString('it-IT') + '</td><td>' + esc(r.mezzo_targa||'—') + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-danger" onclick="eliminaPrelievo(\'' + r.id + '\')">x</button></td></tr>';
  }).join('');
  document.getElementById('ac-totale-prelievi').innerHTML = 'Totale periodo' + (filtroCamion ? ' (' + filtroCamion + ')' : '') + ': <strong style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</strong> — ' + data.length + ' prelievi';
}

async function eliminaPrelievo(id) {
  if (!confirm('Eliminare questo prelievo? I litri verranno restituiti alla cisterna.')) return;
  const { data: prel } = await sb.from('prelievi_autoconsumo').select('*').eq('id', id).single();
  if (!prel) return;
  const { error } = await sb.from('prelievi_autoconsumo').delete().eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  // Restituisci litri alla cisterna
  const cis = window._cisternaAutoconsumo;
  if (cis) {
    const nuovoLivello = Number(cis.livello_attuale) + Number(prel.litri);
    await sb.from('cisterne').update({ livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }).eq('id', cis.id);
  }
  toast('Prelievo eliminato');
  caricaAutoconsumo();
}

async function stampaPrelievi() {
  const da = document.getElementById('ac-filtro-da').value;
  const a = document.getElementById('ac-filtro-a').value;
  const filtroCamion = document.getElementById('ac-filtro-camion').value;
  if (!da || !a) { toast('Seleziona il periodo'); return; }
  let q = sb.from('prelievi_autoconsumo').select('*').gte('data', da).lte('data', a);
  if (filtroCamion) q = q.eq('mezzo_targa', filtroCamion);
  const { data } = await q.order('data',{ascending:false});
  if (!data || !data.length) { toast('Nessun prelievo nel periodo'); return; }

  const daFmt = new Date(da).toLocaleDateString('it-IT');
  const aFmt = new Date(a).toLocaleDateString('it-IT');
  let totLitri = 0;
  let righeHtml = '';
  // Raggruppa per camion
  const perCamion = {};
  data.forEach(function(r, i) {
    totLitri += Number(r.litri);
    const targa = r.mezzo_targa || '—';
    if (!perCamion[targa]) perCamion[targa] = 0;
    perCamion[targa] += Number(r.litri);
    righeHtml += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + new Date(r.data).toLocaleDateString('it-IT') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-weight:500">' + esc(targa) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtL(r.litri) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-size:10px">' + esc(r.note||'—') + '</td>' +
      '</tr>';
  });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Registro Prelievi Autoconsumo</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px}' +
    'th{background:#BA7517;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #9A6213;text-align:center}' +
    '.tot td{border-top:3px solid #BA7517!important;font-weight:bold;font-size:11px;background:#FDF3D0!important}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #BA7517;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#BA7517">REGISTRO PRELIEVI AUTOCONSUMO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Periodo: <strong>' + daFmt + ' — ' + aFmt + '</strong>' + (filtroCamion ? ' · Camion: <strong>' + esc(filtroCamion) + '</strong>' : '') + ' · Prelievi: <strong>' + data.length + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  // Riepilogo per camion
  html += '<div style="display:flex;gap:8px;margin-bottom:14px;flex-wrap:wrap">';
  html += '<div style="background:#FDF3D0;border:1px solid #BA7517;border-radius:6px;padding:10px 18px;text-align:center"><div style="font-size:8px;color:#7A5D00;text-transform:uppercase">Totale litri</div><div style="font-size:18px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(totLitri) + '</div></div>';
  Object.keys(perCamion).sort().forEach(function(targa) {
    html += '<div style="background:#F5F5F5;border:1px solid #ddd;border-radius:6px;padding:10px 14px;text-align:center"><div style="font-size:8px;color:#666;text-transform:uppercase">' + esc(targa) + '</div><div style="font-size:14px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(perCamion[targa]) + '</div></div>';
  });
  html += '</div>';

  html += '<table><thead><tr><th>#</th><th>Data</th><th>Camion</th><th>Litri</th><th>Note</th></tr></thead><tbody>';
  html += righeHtml;
  html += '<tr class="tot"><td style="padding:7px;border:1px solid #ddd" colspan="3">TOTALE</td><td style="padding:7px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:7px;border:1px solid #ddd"></td></tr>';
  html += '</tbody></table>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#BA7517;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

// ── CONSEGNE ─────────────────────────────────────────────────────
async function caricaConsegne() {
  // Imposta data filtro a oggi se non impostata
  const filtroEl = document.getElementById('filtro-data-consegne');
  if (!filtroEl.value) filtroEl.value = oggiISO;
  const dataFiltro = filtroEl.value;

  const { data } = await sb.from('ordini').select('*').eq('data', dataFiltro).neq('stato','annullato').order('cliente');
  const tbody = document.getElementById('tabella-consegne');

  if (!data||!data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessun ordine per questa data</td></tr>';
    ['tot-consegne','tot-completate','tot-inattesa','tot-programmati','tot-litri-cons','tot-fatt-netto-cons','tot-fatt-iva-cons','tot-margine-cons'].forEach(id => { const el=document.getElementById(id); if(el) el.textContent='0'; });
  } else {
    const consegnabili = data.filter(r=>r.tipo_ordine==='cliente' || r.tipo_ordine==='stazione_servizio' || r.tipo_ordine==='entrata_deposito');
    document.getElementById('tot-consegne').textContent = consegnabili.length;
    document.getElementById('tot-completate').textContent = consegnabili.filter(r=>r.stato==='confermato').length;
    document.getElementById('tot-inattesa').textContent = consegnabili.filter(r=>r.stato==='in attesa').length;
    document.getElementById('tot-programmati').textContent = consegnabili.filter(r=>r.stato==='programmato').length;
    // KPI aggiuntivi
    let tLitri=0, tNetto=0, tIva=0, tMargine=0;
    consegnabili.forEach(r => { const l=Number(r.litri); tLitri+=l; tNetto+=prezzoNoIva(r)*l; tIva+=prezzoConIva(r)*l; tMargine+=Number(r.margine)*l; });
    const elL=document.getElementById('tot-litri-cons'); if(elL) elL.textContent=fmtL(tLitri);
    const elN=document.getElementById('tot-fatt-netto-cons'); if(elN) elN.textContent=fmtE(tNetto);
    const elI=document.getElementById('tot-fatt-iva-cons'); if(elI) elI.textContent=fmtE(tIva);
    const elM=document.getElementById('tot-margine-cons'); if(elM) elM.textContent=fmtE(tMargine);

    // Carica documenti per tutti gli ordini
    const ordineIds = data.map(r=>r.id);
    const { data: allDocs } = await sb.from('documenti_ordine').select('*').in('ordine_id', ordineIds);
    const docsMap = {};
    (allDocs||[]).forEach(d => { if(!docsMap[d.ordine_id]) docsMap[d.ordine_id]=[]; docsMap[d.ordine_id].push(d); });

    tbody.innerHTML = data.filter(r=>r.tipo_ordine==='cliente' || r.tipo_ordine==='stazione_servizio' || r.tipo_ordine==='entrata_deposito').map(r => {
      const tot = prezzoConIva(r) * Number(r.litri);
      const docs = docsMap[r.id] || [];

      // Documenti badges
      let docsHtml = '';
      if (docs.length) {
        docsHtml = docs.map(d => {
          const url = SUPABASE_URL + '/storage/v1/object/public/Das/' + d.percorso_storage;
          const badge = d.tipo === 'das' ? 'amber' : d.tipo === 'conferma' ? 'blue' : 'gray';
          return '<a href="' + url + '" target="_blank" style="text-decoration:none"><span class="badge ' + badge + '" style="font-size:9px;cursor:pointer">' + d.tipo.toUpperCase() + '</span></a>';
        }).join(' ');
      } else {
        docsHtml = '<span style="font-size:10px;color:var(--text-hint)">—</span>';
      }

      // Azioni in base al tipo ordine
      let azioniHtml = '';
      if (r.tipo_ordine === 'entrata_deposito' && !r.caricato_deposito && r.stato !== 'annullato') {
        // Entrata deposito → pulsante "Carica cisterne"
        azioniHtml += '<button class="btn-primary" style="font-size:10px;padding:3px 8px;background:#639922" onclick="apriModaleAssegnaCisterna(\'' + r.id + '\')">📦 Carica</button> ';
      } else if (r.stato !== 'confermato') {
        azioniHtml += '<button class="btn-primary" style="font-size:10px;padding:3px 8px" onclick="confermaOrdineConsegna(\'' + r.id + '\')">✅</button> ';
      }
      azioniHtml += '<button class="btn-edit" title="Conferma ordine PDF" onclick="apriConfermaOrdine(\'' + r.id + '\')">📄</button>';
      azioniHtml += '<button class="btn-edit" title="Gestisci documenti" onclick="apriModaleOrdine(\'' + r.id + '\')">📎</button>';

      return '<tr><td><strong>' + esc(r.cliente) + '</strong> ' + (r.tipo_ordine !== 'cliente' ? badgeStato(r.tipo_ordine) : '') + (r.sede_scarico_nome ? '<div style="font-size:10px;color:#6B5FCC">📍 ' + esc(r.sede_scarico_nome) + '</div>' : '') + '</td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td><td>' + badgeStato(r.stato) + '</td><td>' + docsHtml + '</td><td>' + azioniHtml + '</td></tr>';
    }).join('');
  }

  // Ordini non processati (in attesa, qualsiasi data passata o oggi)
  await caricaNonProcessati();
}

async function confermaOrdineConsegna(ordineId) {
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }
  if (!confirm('Confermare la consegna di ' + fmtL(ordine.litri) + ' di ' + ordine.prodotto + ' a ' + ordine.cliente + '?')) return;

  // Se l'ordine viene dal deposito PhoenixFuel, scarica anche dalla cisterna
  if (ordine.fornitore && ordine.fornitore.toLowerCase().includes('phoenix')) {
    await confermaUscitaDeposito(ordineId);
  } else {
    await sb.from('ordini').update({ stato:'confermato' }).eq('id', ordineId);
  }
  toast('Ordine confermato!');
  caricaConsegne();
}

async function caricaNonProcessati() {
  const { data: ordini } = await sb.from('ordini').select('*').eq('stato', 'in attesa').lte('data', oggiISO).order('data',{ascending:true}).order('cliente');
  const tbody = document.getElementById('tabella-non-processati');
  if (!ordini || !ordini.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun ordine in attesa</td></tr>';
    return;
  }
  tbody.innerHTML = ordini.map(r => {
    const tot = prezzoConIva(r) * Number(r.litri);
    const isPassato = r.data < oggiISO;
    const rowStyle = isPassato ? 'background:#FCEBEB' : '';
    return '<tr style="' + rowStyle + '"><td>' + r.data + (isPassato ? ' <span style="font-size:9px;color:#A32D2D;font-weight:500">SCADUTO</span>' : '') + '</td><td><strong>' + esc(r.cliente) + '</strong></td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td><td style="white-space:nowrap">' +
      '<button class="btn-edit" title="Riprogramma data" onclick="riprogrammaOrdine(\'' + r.id + '\')">📅</button>' +
      '<button class="btn-danger" title="Annulla ordine" onclick="annullaOrdine(\'' + r.id + '\')">x</button>' +
      '</td></tr>';
  }).join('');
}

async function riprogrammaOrdine(ordineId) {
  const nuovaData = prompt('Inserisci la nuova data di consegna (formato: AAAA-MM-GG):');
  if (!nuovaData) return;
  // Valida formato data
  if (!/^\d{4}-\d{2}-\d{2}$/.test(nuovaData)) { toast('Formato data non valido. Usa AAAA-MM-GG'); return; }
  const { data: ordine } = await sb.from('ordini').select('giorni_pagamento').eq('id', ordineId).single();
  const ggPag = ordine ? ordine.giorni_pagamento || 30 : 30;
  const dataScad = new Date(nuovaData);
  dataScad.setDate(dataScad.getDate() + ggPag);
  const { error } = await sb.from('ordini').update({ data: nuovaData, data_scadenza: dataScad.toISOString().split('T')[0] }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Ordine riprogrammato al ' + nuovaData);
  caricaConsegne();
}

async function annullaOrdine(ordineId) {
  if (!confirm('Sei sicuro di voler annullare questo ordine? L\'operazione non è reversibile.')) return;
  const { error } = await sb.from('ordini').update({ stato: 'annullato' }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Ordine annullato');
  caricaConsegne();
}

// ── ELENCO VENDITE GIORNALIERO (stampabile) ─────────────────────
async function generaElencoVenditeGiorno() {
  var dataFiltro = document.getElementById('filtro-data-consegne').value || oggiISO;
  var res = await sb.from('ordini').select('*').eq('data', dataFiltro).neq('stato','annullato').eq('tipo_ordine','cliente').order('cliente');
  var ordini = res.data || [];
  if (!ordini.length) { toast('Nessun ordine vendita per questa data'); return; }

  var totLitri=0, totNetto=0, totIva=0, totMargine=0, totCosto=0;
  var perCliente = {};
  var righeArr = [];
  ordini.forEach(function(r, i) {
    var litri = Number(r.litri);
    var pNetto = prezzoNoIva(r);
    var pIva = prezzoConIva(r);
    var marg = Number(r.margine) * litri;
    var costoAcq = Number(r.costo_litro) * litri;
    var netto = pNetto * litri;
    var iva = pIva * litri;
    totLitri += litri; totNetto += netto; totIva += iva; totMargine += marg; totCosto += costoAcq;
    // Per cliente
    var cl = r.cliente || '—';
    if (!perCliente[cl]) perCliente[cl] = { ordini:0, litri:0, netto:0, iva:0, margine:0 };
    perCliente[cl].ordini++; perCliente[cl].litri += litri;
    perCliente[cl].netto += netto; perCliente[cl].iva += iva; perCliente[cl].margine += marg;
    righeArr.push('<tr>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-size:10px">' + (i+1) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;font-weight:bold;font-size:10px">' + esc(r.cliente) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;font-size:10px">' + esc(r.prodotto) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-size:10px">' + fmtL(litri) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-size:10px">' + fmt(pNetto) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-size:10px">' + fmtE(netto) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-size:10px">' + r.iva + '%</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold;font-size:10px">' + fmtE(iva) + '</td>' +
      '<td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#639922;font-size:10px">' + fmtE(marg) + '</td>' +
      '</tr>');
  });

  var dataFmt = new Date(dataFiltro).toLocaleDateString('it-IT');

  // CSS base
  var css = '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px}' +
    '.page{width:210mm;min-height:297mm;padding:15mm 12mm;margin:0 auto;background:#fff}' +
    '@media print{.no-print{display:none!important}.page{margin:0;padding:10mm;page-break-after:always}.page:last-child{page-break-after:auto}@page{size:portrait;margin:0}}' +
    '@media screen{.page{box-shadow:0 2px 12px rgba(0,0,0,0.08);margin:10px auto}body{background:#f5f4f0}}' +
    '@media(max-width:600px){.page{padding:4mm!important;width:auto!important;min-height:auto!important}body{font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-kpi{grid-template-columns:repeat(2,1fr)!important}table{font-size:8px!important}th,td{padding:3px 2px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#D4A017;color:#fff;padding:6px 5px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #B8900F;text-align:center}' +
    '.tot-row td{border-top:3px solid #D4A017!important;font-weight:bold;background:#FDF3D0!important}' +
    '.section-title{font-size:11px;font-weight:bold;color:#D4A017;text-transform:uppercase;letter-spacing:0.5px;margin:12px 0 6px;border-bottom:1px solid #e8e8e8;padding-bottom:3px}' +
    '.page-label{font-size:9px;color:#bbb;text-align:right;margin-bottom:4px}' +
    '</style>';

  // ═══ PAGINA 1: Header + KPI + Riepilogo per cliente ═══
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Elenco Vendite ' + dataFmt + '</title>' + css + '</head><body>';

  html += '<div class="page">';
  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #D4A017;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#D4A017">ELENCO VENDITE INGROSSO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Data: <strong>' + dataFmt + '</strong> — Ordini: <strong>' + ordini.length + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Vendita all\'ingrosso di carburanti</div></div></div>';

  // KPI
  html += '<div class="rpt-kpi" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;margin-bottom:14px">';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#7A5D00;text-transform:uppercase">Litri totali</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(totLitri) + '</div></div>';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#7A5D00;text-transform:uppercase">Fatt. netto</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace">' + fmtE(totNetto) + '</div></div>';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#7A5D00;text-transform:uppercase">Fatt. IVA incl.</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace">' + fmtE(totIva) + '</div></div>';
  html += '<div style="background:#EAF3DE;border:1px solid #639922;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#27500A;text-transform:uppercase">Margine</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace;color:#639922">' + fmtE(totMargine) + '</div></div>';
  html += '<div style="background:#FCEBEB;border:1px solid #E24B4A;border-radius:6px;padding:10px;text-align:center"><div style="font-size:8px;color:#791F1F;text-transform:uppercase">Costo acquisto</div><div style="font-size:16px;font-weight:bold;font-family:Courier New,monospace;color:#A32D2D">' + fmtE(totCosto) + '</div></div>';
  html += '</div>';

  // Riepilogo per CLIENTE
  html += '<div class="section-title">Riepilogo vendite per cliente</div>';
  html += '<table><thead><tr><th>Cliente</th><th>Ordini</th><th>Litri</th><th>Fatt. netto</th><th>Fatt. IVA incl.</th><th>Margine</th></tr></thead><tbody>';
  var clArr = Object.entries(perCliente).sort(function(a,b) { return b[1].iva - a[1].iva; });
  clArr.forEach(function(entry) {
    var c = entry[0], v = entry[1];
    html += '<tr><td style="padding:5px 6px;border:1px solid #ddd;font-weight:bold">' + esc(c) + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:center;font-family:Courier New,monospace">' + v.ordini + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(v.litri) + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(v.netto) + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtE(v.iva) + '</td><td style="padding:5px 6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#639922">' + fmtE(v.margine) + '</td></tr>';
  });
  html += '<tr class="tot-row"><td style="padding:6px;border:1px solid #ddd;font-weight:bold">TOTALE</td><td style="padding:6px;border:1px solid #ddd;text-align:center;font-family:Courier New,monospace">' + ordini.length + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totNetto) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtE(totIva) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#639922">' + fmtE(totMargine) + '</td></tr>';
  html += '</tbody></table>';
  html += '<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:6px;margin-top:10px">PhoenixFuel Srl — Elenco vendite ' + dataFmt + '</div>';
  html += '</div>'; // chiude pagina 1

  // ═══ PAGINE DETTAGLIO ORDINI (paginato ~35 righe) ═══
  var RPP = 35;
  var theadHtml = '<thead><tr><th>#</th><th>Cliente</th><th>Prodotto</th><th>Litri</th><th>Prezzo/L netto</th><th>Tot. netto</th><th>IVA</th><th>Tot. IVA incl.</th><th>Margine</th></tr></thead>';
  var rigaTot = '<tr class="tot-row"><td style="padding:6px;border:1px solid #ddd" colspan="3">TOTALE (' + ordini.length + ' ordini)</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:6px;border:1px solid #ddd"></td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totNetto) + '</td><td style="padding:6px;border:1px solid #ddd"></td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totIva) + '</td><td style="padding:6px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#639922">' + fmtE(totMargine) + '</td></tr>';

  var totPag = Math.ceil(righeArr.length / RPP);
  for (var p = 0; p < totPag; p++) {
    var s = p * RPP, e = Math.min(s + RPP, righeArr.length);
    var isLast = (p === totPag - 1);
    html += '<div class="page">';
    html += '<div class="page-label">Dettaglio ordini — Pag. ' + (p+1) + '/' + totPag + ' — ' + dataFmt + '</div>';
    if (p === 0) html += '<div class="section-title">Dettaglio singoli ordini</div>';
    html += '<table>' + theadHtml + '<tbody>' + righeArr.slice(s, e).join('');
    if (isLast) html += rigaTot;
    html += '</tbody></table>';
    if (isLast) html += '<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:6px;margin-top:10px">PhoenixFuel Srl — Documento interno</div>';
    html += '</div>';
  }

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="background:#D4A017;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="background:#E24B4A;color:#fff;border:none;padding:10px 20px;border-radius:8px;font-size:14px;cursor:pointer;font-weight:bold">✕ Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ── VENDITE ───────────────────────────────────────────────────────
function caricaVendite() {
  // Entry point: carica il tab attivo
  const activeTab = document.querySelector('.vend-tab.active');
  if (activeTab && activeTab.dataset.tab === 'vend-dettaglio') caricaVenditeDettaglio();
  else if (activeTab && activeTab.dataset.tab === 'vend-annuale') caricaVenditeAnnuali();
  else caricaVenditeIngrosso();
}

async function caricaVenditeIngrosso() {
  // Imposta date default se non impostate
  const daEl = document.getElementById('vend-da');
  const aEl = document.getElementById('vend-a');
  if (!daEl.value) daEl.value = new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
  if (!aEl.value) aEl.value = oggiISO;
  const da = daEl.value;
  const a = aEl.value;
  const filtroProd = document.getElementById('vend-prodotto').value;
  const filtroGruppo = document.getElementById('vend-sottogruppo').value; // 'rete' | 'consumo' | ''

  // Carica mappa clienti rete/consumo se serve filtrare
  let clientiReteMap = null;
  if (filtroGruppo) {
    const { data: clAll } = await sb.from('clienti').select('nome,cliente_rete');
    clientiReteMap = {};
    (clAll||[]).forEach(c => { clientiReteMap[c.nome] = !!c.cliente_rete; });
  }

  let baseQuery = sb.from('ordini').select('*').gte('data', da).lte('data', a).neq('stato','annullato').eq('tipo_ordine','cliente');
  if (filtroProd) baseQuery = baseQuery.eq('prodotto', filtroProd);
  let allData = [];
  let from = 0;
  while (true) {
    const { data: batch } = await baseQuery.range(from, from + 999);
    if (!batch || !batch.length) break;
    allData = allData.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }

  // Filtra per sottogruppo
  let data = allData;
  if (filtroGruppo && clientiReteMap) {
    data = allData.filter(r => {
      const isRete = clientiReteMap[r.cliente] || false;
      return filtroGruppo === 'rete' ? isRete : !isRete;
    });
  }
  if (!data.length) {
    document.getElementById('vend-fatturato').textContent = '—';
    document.getElementById('vend-litri').textContent = '—';
    document.getElementById('vend-margine').textContent = '—';
    document.getElementById('vend-ordini').textContent = '0';
    document.getElementById('tabella-vendite').innerHTML = '<tr><td colspan="4" class="loading">Nessun dato per il filtro selezionato</td></tr>';
    document.getElementById('tabella-vendite-clienti').innerHTML = '<tr><td colspan="5" class="loading">—</td></tr>';
    return;
  }

  let fatturato=0, litri=0, margine=0;
  const pf={}, pc={};
  data.forEach(r => {
    const tot = prezzoConIva(r) * r.litri;
    const marg = Number(r.margine) * Number(r.litri);
    fatturato += tot; litri += Number(r.litri); margine += marg;
    // Per fornitore
    if (!pf[r.fornitore]) pf[r.fornitore] = {litri:0, fatturato:0, margine:0};
    pf[r.fornitore].litri += Number(r.litri);
    pf[r.fornitore].fatturato += tot;
    pf[r.fornitore].margine += marg;
    // Per cliente
    const cl = r.cliente || 'Sconosciuto';
    if (!pc[cl]) pc[cl] = {litri:0, fatturato:0, margine:0, ordini:0};
    pc[cl].litri += Number(r.litri);
    pc[cl].fatturato += tot;
    pc[cl].margine += marg;
    pc[cl].ordini++;
  });

  document.getElementById('vend-fatturato').textContent = fmtE(fatturato);
  document.getElementById('vend-litri').textContent = fmtL(litri);
  document.getElementById('vend-margine').textContent = fmtE(margine);
  document.getElementById('vend-ordini').textContent = data.length;

  // Tabella per fornitore
  const tbody = document.getElementById('tabella-vendite');
  const righeF = Object.entries(pf).sort((a,b) => b[1].fatturato - a[1].fatturato);
  tbody.innerHTML = righeF.length ? righeF.map(([f,v]) => '<tr><td><strong>' + esc(f) + '</strong></td><td style="font-family:var(--font-mono)">' + fmtL(v.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.fatturato) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.margine) + '</td></tr>').join('') : '<tr><td colspan="4" class="loading">Nessun dato</td></tr>';

  // Tabella per cliente
  const tbCl = document.getElementById('tabella-vendite-clienti');
  const righeCl = Object.entries(pc).sort((a,b) => b[1].fatturato - a[1].fatturato);
  tbCl.innerHTML = righeCl.length ? righeCl.map(([c,v]) => '<tr><td><strong>' + esc(c) + '</strong></td><td style="font-family:var(--font-mono)">' + fmtL(v.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.fatturato) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.margine) + '</td><td>' + v.ordini + '</td></tr>').join('') : '<tr><td colspan="5" class="loading">Nessun dato</td></tr>';

  // Grafici vendite
  const coloriGrafico = ['#D4A017','#378ADD','#639922','#3B6D11','#D85A30','#6B5FCC','#BA7517','#E24B4A'];

  // Grafico fornitori
  const ctxVF = document.getElementById('chart-vend-fornitori');
  if (ctxVF && righeF.length) {
    if (window._chartVendForn) window._chartVendForn.destroy();
    window._chartVendForn = new Chart(ctxVF.getContext('2d'), {
      type:'bar', data:{
        labels:righeF.map(([f])=>f.length>18?f.substring(0,18)+'…':f),
        datasets:[{ label:'Fatturato €', data:righeF.map(([,v])=>Math.round(v.fatturato*100)/100), backgroundColor:righeF.map((_,i)=>coloriGrafico[i%coloriGrafico.length]), borderRadius:6 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}}} }
    });
  }

  // Grafico clienti top 10
  const ctxVC = document.getElementById('chart-vend-clienti');
  const top10 = righeCl.slice(0,10);
  if (ctxVC && top10.length) {
    if (window._chartVendCl) window._chartVendCl.destroy();
    window._chartVendCl = new Chart(ctxVC.getContext('2d'), {
      type:'bar', data:{
        labels:top10.map(([c])=>c.length>15?c.substring(0,15)+'…':c),
        datasets:[{ label:'Fatturato €', data:top10.map(([,v])=>Math.round(v.fatturato*100)/100), backgroundColor:top10.map((_,i)=>coloriGrafico[i%coloriGrafico.length]), borderRadius:6 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}}} }
    });
  }
}

// ── VENDITE DETTAGLIO (Stazione Oppido) ──────────────────────────
let _chartDettIncasso=null, _chartDettMargine=null;

async function caricaVenditeDettaglio() {
  const daEl = document.getElementById('vdett-da');
  const aEl = document.getElementById('vdett-a');
  if (!daEl.value) daEl.value = new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
  if (!aEl.value) aEl.value = oggiISO;
  const da = daEl.value, a = aEl.value;

  // Letture pompe nel periodo
  const { data: pompe } = await sb.from('stazione_pompe').select('id,nome,prodotto').eq('attiva',true);
  const { data: letture } = await sb.from('stazione_letture').select('*').gte('data', da).lte('data', a).order('data');
  const { data: prezziPompa } = await sb.from('stazione_prezzi').select('*').gte('data', da).lte('data', a);

  // Costo approvvigionamento: ordini stazione_servizio confermati nel periodo
  const { data: ordStz } = await sb.from('ordini').select('*').eq('tipo_ordine','stazione_servizio').neq('stato','annullato').gte('data', da).lte('data', a);
  const costoApprovv = (ordStz||[]).reduce((s,r) => s + Number(r.costo_litro) * Number(r.litri), 0);

  // Calcola vendite giornaliere da letture
  const giorniMap = {};
  const pompeMap = {};
  (pompe||[]).forEach(p => { pompeMap[p.id] = p; });

  // Raggruppa letture per data
  const letturePerData = {};
  (letture||[]).forEach(l => {
    if (!letturePerData[l.data]) letturePerData[l.data] = [];
    letturePerData[l.data].push(l);
  });

  // Prezzi per data/prodotto
  const prezziMap = {};
  (prezziPompa||[]).forEach(p => { prezziMap[p.data + '_' + p.prodotto] = Number(p.prezzo_litro); });

  const dateOrdinate = Object.keys(letturePerData).sort();
  let totIncasso=0, totLitri=0, totGasolio=0, totBenzina=0;

  dateOrdinate.forEach(data => {
    const gg = { litriG:0, litriB:0, incasso:0 };
    letturePerData[data].forEach(l => {
      const pompa = pompeMap[l.pompa_id];
      if (!pompa) return;
      // Trova lettura giorno precedente
      const datePrev = dateOrdinate.filter(d => d < data);
      const prevData = datePrev.length ? datePrev[datePrev.length-1] : null;
      let precLettura = null;
      if (prevData && letturePerData[prevData]) {
        const pl = letturePerData[prevData].find(x => x.pompa_id === l.pompa_id);
        if (pl) precLettura = Number(pl.lettura);
      }
      if (precLettura === null) return;
      const litriVenduti = Number(l.lettura) - precLettura;
      if (litriVenduti <= 0) return;
      const prezzo = prezziMap[data + '_' + pompa.prodotto] || 0;
      const incasso = litriVenduti * prezzo;
      if (pompa.prodotto === 'Gasolio Autotrazione') gg.litriG += litriVenduti;
      else gg.litriB += litriVenduti;
      gg.incasso += incasso;
    });
    giorniMap[data] = gg;
    totGasolio += gg.litriG;
    totBenzina += gg.litriB;
    totLitri += gg.litriG + gg.litriB;
    totIncasso += gg.incasso;
  });

  const margineDettaglio = totIncasso - costoApprovv;

  // KPI
  document.getElementById('vdett-incasso').textContent = fmtE(totIncasso);
  document.getElementById('vdett-litri').textContent = fmtL(totLitri);
  document.getElementById('vdett-costo').textContent = fmtE(costoApprovv);
  document.getElementById('vdett-margine').textContent = fmtE(margineDettaglio);

  // Tabella giornaliera
  const tbody = document.getElementById('tabella-vend-dettaglio');
  if (!dateOrdinate.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessuna lettura nel periodo</td></tr>';
  } else {
    let runCosto = 0;
    const costoGiorno = costoApprovv / (dateOrdinate.length || 1);
    tbody.innerHTML = dateOrdinate.map(d => {
      const g = giorniMap[d];
      const totG = g.litriG + g.litriB;
      runCosto += costoGiorno;
      const margG = g.incasso - costoGiorno;
      return '<tr><td>' + d + '</td><td style="font-family:var(--font-mono)">' + fmtL(g.litriG) + '</td><td style="font-family:var(--font-mono)">' + fmtL(g.litriB) + '</td><td style="font-family:var(--font-mono);font-weight:500">' + fmtL(totG) + '</td><td style="font-family:var(--font-mono)">' + fmtE(g.incasso) + '</td><td style="font-family:var(--font-mono);color:var(--text-muted)">' + fmtE(costoGiorno) + '</td><td style="font-family:var(--font-mono);color:' + (margG >= 0 ? '#639922' : '#A32D2D') + '">' + fmtE(margG) + '</td></tr>';
    }).join('');
    // Riga totale
    tbody.innerHTML += '<tr style="border-top:2px solid var(--accent);font-weight:500"><td>TOTALE</td><td style="font-family:var(--font-mono)">' + fmtL(totGasolio) + '</td><td style="font-family:var(--font-mono)">' + fmtL(totBenzina) + '</td><td style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totIncasso) + '</td><td style="font-family:var(--font-mono)">' + fmtE(costoApprovv) + '</td><td style="font-family:var(--font-mono);color:' + (margineDettaglio >= 0 ? '#639922' : '#A32D2D') + '">' + fmtE(margineDettaglio) + '</td></tr>';
  }

  // Grafici
  const labelsG = dateOrdinate.map(d => { const dt=new Date(d); return dt.getDate()+'/'+(dt.getMonth()+1); });
  const ctxI = document.getElementById('chart-dett-incasso');
  if (ctxI) {
    if (_chartDettIncasso) _chartDettIncasso.destroy();
    _chartDettIncasso = new Chart(ctxI.getContext('2d'), {
      type:'bar', data:{ labels:labelsG, datasets:[{ label:'Incasso €', data:dateOrdinate.map(d=>Math.round(giorniMap[d].incasso*100)/100), backgroundColor:'#6B5FCC', borderRadius:4 }] },
      options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}},x:{ticks:{maxTicksLimit:15,font:{size:9}}}} }
    });
  }
  const ctxM = document.getElementById('chart-dett-margine');
  if (ctxM) {
    const costoG = costoApprovv / (dateOrdinate.length || 1);
    if (_chartDettMargine) _chartDettMargine.destroy();
    _chartDettMargine = new Chart(ctxM.getContext('2d'), {
      type:'line', data:{ labels:labelsG, datasets:[{ label:'Margine €', data:dateOrdinate.map(d=>Math.round((giorniMap[d].incasso-costoG)*100)/100), borderColor:'#639922', backgroundColor:'rgba(99,153,34,0.1)', fill:true, tension:0.3, pointRadius:2 }] },
      options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{ticks:{callback:v=>'€ '+v}},x:{ticks:{maxTicksLimit:15,font:{size:9}}}} }
    });
  }
}

// ── VENDITE RIEPILOGO ANNUALE ────────────────────────────────────
const MESI_NOMI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
let _chartAnnFatt=null, _chartAnnLitri=null;

async function caricaVenditeAnnuali() {
  // Popola select anno
  const selAnno = document.getElementById('vann-anno');
  if (selAnno.options.length === 0) {
    const annoCorr = oggi.getFullYear();
    for (let a = annoCorr; a >= annoCorr - 4; a--) selAnno.innerHTML += '<option value="' + a + '">' + a + '</option>';
  }
  // Popola anche i selettori di confronto
  const selC1 = document.getElementById('vann-confronto-a1');
  const selC2 = document.getElementById('vann-confronto-a2');
  if (selC1 && selC1.options.length === 0) {
    const annoCorr = oggi.getFullYear();
    for (let a = annoCorr; a >= annoCorr - 4; a--) {
      selC1.innerHTML += '<option value="' + a + '">' + a + '</option>';
      selC2.innerHTML += '<option value="' + a + '">' + a + '</option>';
    }
    selC1.value = annoCorr;
    selC2.value = annoCorr - 1;
  }
  const anno = parseInt(selAnno.value);
  if (!anno) return;

  const da = anno + '-01-01';
  const a = anno + '-12-31';

  // Ingrosso: ordini tipo_ordine='cliente'
  let allIng = [];
  let from = 0;
  while (true) {
    const { data: batch } = await sb.from('ordini').select('data,litri,costo_litro,trasporto_litro,margine,iva').gte('data', da).lte('data', a).neq('stato','annullato').eq('tipo_ordine','cliente').range(from, from + 999);
    if (!batch || !batch.length) break;
    allIng = allIng.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }

  // Dettaglio: letture stazione
  const { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true);
  const { data: letture } = await sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', da).lte('data', a).order('data');
  const { data: prezziP } = await sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', da).lte('data', a);

  const pompeMap = {};
  (pompe||[]).forEach(p => { pompeMap[p.id] = p; });
  const prezziMap = {};
  (prezziP||[]).forEach(p => { prezziMap[p.data + '_' + p.prodotto] = Number(p.prezzo_litro); });

  // Calcola dettaglio per giorno
  const lettPerData = {};
  (letture||[]).forEach(l => { if (!lettPerData[l.data]) lettPerData[l.data] = []; lettPerData[l.data].push(l); });
  const dateOrd = Object.keys(lettPerData).sort();

  const dettaglioPerGiorno = {};
  dateOrd.forEach(data => {
    let litriG = 0, incassoG = 0;
    lettPerData[data].forEach(l => {
      const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
      const prev = dateOrd.filter(d => d < data);
      const prevD = prev.length ? prev[prev.length-1] : null;
      let precL = null;
      if (prevD && lettPerData[prevD]) { const pl = lettPerData[prevD].find(x => x.pompa_id === l.pompa_id); if (pl) precL = Number(pl.lettura); }
      if (precL === null) return;
      const lv = Number(l.lettura) - precL; if (lv <= 0) return;
      const pr = prezziMap[data + '_' + pompa.prodotto] || 0;
      litriG += lv; incassoG += lv * pr;
    });
    dettaglioPerGiorno[data] = { litri: litriG, incasso: incassoG };
  });

  // Aggrega per mese
  const mesi = [];
  for (let m = 0; m < 12; m++) {
    let ingLitri=0, ingFatt=0, ingMarg=0, dettLitri=0, dettInc=0;
    const mStr = String(m+1).padStart(2,'0');
    const prefix = anno + '-' + mStr;

    allIng.forEach(r => { if (r.data.startsWith(prefix)) { ingLitri += Number(r.litri); ingFatt += prezzoNoIva(r)*Number(r.litri); ingMarg += Number(r.margine)*Number(r.litri); } });
    Object.entries(dettaglioPerGiorno).forEach(([d,v]) => { if (d.startsWith(prefix)) { dettLitri += v.litri; dettInc += v.incasso; } });

    mesi.push({ mese: MESI_NOMI[m], ingLitri, ingFatt, ingMarg, dettLitri, dettInc, totLitri: ingLitri+dettLitri, totFatt: ingFatt+dettInc });
  }

  // Tabella
  const tbody = document.getElementById('tabella-vend-annuale');
  let totIL=0,totIF=0,totIM=0,totDL=0,totDI=0,totTL=0,totTF=0;
  tbody.innerHTML = mesi.map(m => {
    totIL+=m.ingLitri; totIF+=m.ingFatt; totIM+=m.ingMarg; totDL+=m.dettLitri; totDI+=m.dettInc; totTL+=m.totLitri; totTF+=m.totFatt;
    const hasData = m.ingLitri > 0 || m.dettLitri > 0;
    return '<tr' + (!hasData?' style="opacity:0.4"':'') + '><td><strong>' + m.mese + '</strong></td><td style="font-family:var(--font-mono)">' + fmtL(m.ingLitri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(m.ingFatt) + '</td><td style="font-family:var(--font-mono);color:#639922">' + fmtE(m.ingMarg) + '</td><td style="font-family:var(--font-mono);color:#6B5FCC">' + fmtL(m.dettLitri) + '</td><td style="font-family:var(--font-mono);color:#6B5FCC">' + fmtE(m.dettInc) + '</td><td style="font-family:var(--font-mono);font-weight:500">' + fmtL(m.totLitri) + '</td><td style="font-family:var(--font-mono);font-weight:500">' + fmtE(m.totFatt) + '</td></tr>';
  }).join('');
  tbody.innerHTML += '<tr style="border-top:2px solid var(--accent);font-weight:600"><td>TOTALE ' + anno + '</td><td style="font-family:var(--font-mono)">' + fmtL(totIL) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totIF) + '</td><td style="font-family:var(--font-mono);color:#639922">' + fmtE(totIM) + '</td><td style="font-family:var(--font-mono);color:#6B5FCC">' + fmtL(totDL) + '</td><td style="font-family:var(--font-mono);color:#6B5FCC">' + fmtE(totDI) + '</td><td style="font-family:var(--font-mono)">' + fmtL(totTL) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totTF) + '</td></tr>';

  // Grafici
  const labelsM = mesi.map(m => m.mese.substring(0,3));
  const ctxF = document.getElementById('chart-ann-fatturato');
  if (ctxF) {
    if (_chartAnnFatt) _chartAnnFatt.destroy();
    _chartAnnFatt = new Chart(ctxF.getContext('2d'), {
      type:'bar', data:{ labels:labelsM, datasets:[
        { label:'Ingrosso', data:mesi.map(m=>Math.round(m.ingFatt)), backgroundColor:'#D4A017', borderRadius:4 },
        { label:'Dettaglio', data:mesi.map(m=>Math.round(m.dettInc)), backgroundColor:'#6B5FCC', borderRadius:4 }
      ] }, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,stacked:true,ticks:{callback:v=>fmtE(v)}},x:{stacked:true}} }
    });
  }
  const ctxL = document.getElementById('chart-ann-litri');
  if (ctxL) {
    if (_chartAnnLitri) _chartAnnLitri.destroy();
    _chartAnnLitri = new Chart(ctxL.getContext('2d'), {
      type:'bar', data:{ labels:labelsM, datasets:[
        { label:'Ingrosso', data:mesi.map(m=>Math.round(m.ingLitri)), backgroundColor:'#D4A017', borderRadius:4 },
        { label:'Dettaglio', data:mesi.map(m=>Math.round(m.dettLitri)), backgroundColor:'#6B5FCC', borderRadius:4 }
      ] }, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,stacked:true,ticks:{callback:v=>fmtL(v)}},x:{stacked:true}} }
    });
  }
}

// ── REPORT PDF DETTAGLIO ─────────────────────────────────────────
async function stampaReportDettaglio() {
  const da = document.getElementById('vdett-da').value;
  const a = document.getElementById('vdett-a').value;
  if (!da||!a) { toast('Seleziona il periodo'); return; }
  // Rigenera i dati come in caricaVenditeDettaglio ma per il report
  toast('Generazione report in corso...');
  // Usa i dati già nella tabella
  const tbody = document.getElementById('tabella-vend-dettaglio');
  const righe = tbody.querySelectorAll('tr');
  if (!righe.length) { toast('Nessun dato da stampare'); return; }
  let righeHtml = '';
  righe.forEach(tr => { righeHtml += '<tr>' + tr.innerHTML.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--text-muted\)/g,'#666') + '</tr>'; });

  const daFmt = new Date(da).toLocaleDateString('it-IT');
  const aFmt = new Date(a).toLocaleDateString('it-IT');
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Vendite Dettaglio Stazione</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}table{font-size:9px}th,td{padding:4px 3px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#6B5FCC;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #5A4FBB;text-align:center}' +
    'td{padding:6px 8px;border:1px solid #ddd}' +
    '</style></head><body>';
  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#6B5FCC">VENDITE AL DETTAGLIO — STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Periodo: <strong>' + daFmt + ' — ' + aFmt + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';
  html += '<table><thead><tr><th>Data</th><th>Gasolio (L)</th><th>Benzina (L)</th><th>Tot. Litri</th><th>Incasso €</th><th>Costo approvv.</th><th>Margine €</th></tr></thead><tbody>';
  html += righeHtml + '</tbody></table>';
  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';
  var w = window.open('','_blank'); w.document.write(html); w.document.close();
}

// ── REPORT PDF ANNUALE ───────────────────────────────────────────
async function stampaReportAnnuale() {
  const anno = document.getElementById('vann-anno').value;
  if (!anno) { toast('Seleziona un anno'); return; }
  const tbody = document.getElementById('tabella-vend-annuale');
  const righe = tbody.querySelectorAll('tr');
  if (!righe.length) { toast('Nessun dato da stampare'); return; }
  let righeHtml = '';
  righe.forEach(tr => { righeHtml += '<tr>' + tr.innerHTML.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--accent\)/g,'#D85A30') + '</tr>'; });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Riepilogo Annuale ' + anno + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}table{font-size:9px}th,td{padding:4px 3px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#639922;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #4A7A19;text-align:center}' +
    'td{padding:6px 8px;border:1px solid #ddd}' +
    '</style></head><body>';
  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #639922;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#639922">RIEPILOGO VENDITE ANNUALE ' + anno + '</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Ingrosso (clienti diretti) + Dettaglio (stazione Oppido)</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';
  html += '<table><thead><tr><th>Mese</th><th>Litri ingrosso</th><th>Fatt. ingrosso</th><th>Margine ingrosso</th><th>Litri dettaglio</th><th>Incasso dettaglio</th><th>Totale litri</th><th>Totale fatturato</th></tr></thead><tbody>';
  html += righeHtml + '</tbody></table>';
  html += '<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:8px;margin-top:14px">PhoenixFuel Srl — Riepilogo annuale ' + anno + '</div>';
  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#639922;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';
  var w = window.open('','_blank'); w.document.write(html); w.document.close();
}

// ── CONFRONTO ANNO SU ANNO ───────────────────────────────────────
let _chartConfLitri=null, _chartConfFatt=null;
let _ultimoConfronto = null;

async function _caricaDatiAnno(anno) {
  const da = anno + '-01-01', a = anno + '-12-31';
  // Ingrosso
  let allIng = [], from = 0;
  while (true) {
    const { data: batch } = await sb.from('ordini').select('data,litri,costo_litro,trasporto_litro,margine,iva').gte('data', da).lte('data', a).neq('stato','annullato').eq('tipo_ordine','cliente').range(from, from + 999);
    if (!batch || !batch.length) break;
    allIng = allIng.concat(batch);
    if (batch.length < 1000) break;
    from += 1000;
  }
  // Dettaglio
  const { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true);
  const { data: letture } = await sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', da).lte('data', a).order('data');
  const { data: prezziP } = await sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', da).lte('data', a);
  const pompeMap = {}; (pompe||[]).forEach(p => { pompeMap[p.id] = p; });
  const prezziMap = {}; (prezziP||[]).forEach(p => { prezziMap[p.data+'_'+p.prodotto] = Number(p.prezzo_litro); });
  const lettPerData = {}; (letture||[]).forEach(l => { if (!lettPerData[l.data]) lettPerData[l.data] = []; lettPerData[l.data].push(l); });
  const dateOrd = Object.keys(lettPerData).sort();
  const dettPerGiorno = {};
  dateOrd.forEach(data => {
    let litriG=0, incassoG=0;
    lettPerData[data].forEach(l => {
      const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
      const prev = dateOrd.filter(d => d < data);
      const prevD = prev.length ? prev[prev.length-1] : null;
      let precL = null;
      if (prevD && lettPerData[prevD]) { const pl = lettPerData[prevD].find(x => x.pompa_id === l.pompa_id); if (pl) precL = Number(pl.lettura); }
      if (precL === null) return;
      const lv = Number(l.lettura) - precL; if (lv <= 0) return;
      litriG += lv; incassoG += lv * (prezziMap[data+'_'+pompa.prodotto] || 0);
    });
    dettPerGiorno[data] = { litri: litriG, incasso: incassoG };
  });
  // Aggrega per mese
  const mesi = [];
  for (let m = 0; m < 12; m++) {
    let ingLitri=0, ingFatt=0, ingMarg=0, dettLitri=0, dettInc=0;
    const prefix = anno + '-' + String(m+1).padStart(2,'0');
    allIng.forEach(r => { if (r.data.startsWith(prefix)) { ingLitri += Number(r.litri); ingFatt += prezzoNoIva(r)*Number(r.litri); ingMarg += Number(r.margine)*Number(r.litri); } });
    Object.entries(dettPerGiorno).forEach(([d,v]) => { if (d.startsWith(prefix)) { dettLitri += v.litri; dettInc += v.incasso; } });
    mesi.push({ ingLitri, ingFatt, ingMarg, dettLitri, dettInc, totLitri: ingLitri+dettLitri, totFatt: ingFatt+dettInc });
  }
  return mesi;
}

async function confrontaAnni() {
  const anno1 = parseInt(document.getElementById('vann-confronto-a1').value);
  const anno2 = parseInt(document.getElementById('vann-confronto-a2').value);
  if (!anno1 || !anno2) { toast('Seleziona entrambi gli anni'); return; }
  if (anno1 === anno2) { toast('Seleziona due anni diversi'); return; }

  const wrap = document.getElementById('confronto-anni-content');
  wrap.innerHTML = '<div class="loading" style="padding:20px 0">Caricamento dati ' + anno1 + ' e ' + anno2 + '...</div>';

  const [mesi1, mesi2] = await Promise.all([_caricaDatiAnno(anno1), _caricaDatiAnno(anno2)]);
  _ultimoConfronto = { anno1, anno2, mesi1, mesi2 };

  // Tabella confronto
  let html = '<div style="overflow-x:auto"><table><thead><tr>';
  html += '<th>Mese</th>';
  html += '<th>Litri ' + anno1 + '</th><th>Litri ' + anno2 + '</th><th>Diff. litri</th><th>Δ %</th>';
  html += '<th>Fatt. ' + anno1 + '</th><th>Fatt. ' + anno2 + '</th><th>Diff. fatt.</th><th>Δ %</th>';
  html += '</tr></thead><tbody>';

  let tot1L=0,tot2L=0,tot1F=0,tot2F=0;
  for (let m = 0; m < 12; m++) {
    const l1 = mesi1[m].totLitri, l2 = mesi2[m].totLitri;
    const f1 = mesi1[m].totFatt, f2 = mesi2[m].totFatt;
    const diffL = l1 - l2, diffF = f1 - f2;
    const pctL = l2 > 0 ? ((l1 - l2) / l2 * 100) : (l1 > 0 ? 100 : 0);
    const pctF = f2 > 0 ? ((f1 - f2) / f2 * 100) : (f1 > 0 ? 100 : 0);
    tot1L+=l1; tot2L+=l2; tot1F+=f1; tot2F+=f2;
    const colL = diffL > 0 ? '#639922' : diffL < 0 ? '#A32D2D' : 'var(--text-muted)';
    const colF = diffF > 0 ? '#639922' : diffF < 0 ? '#A32D2D' : 'var(--text-muted)';
    const arrowL = diffL > 0 ? '▲' : diffL < 0 ? '▼' : '—';
    const arrowF = diffF > 0 ? '▲' : diffF < 0 ? '▼' : '—';
    const hasData = l1 > 0 || l2 > 0;
    html += '<tr' + (!hasData ? ' style="opacity:0.35"' : '') + '>';
    html += '<td><strong>' + MESI_NOMI[m] + '</strong></td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtL(l1) + '</td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtL(l2) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:' + colL + ';font-weight:500">' + arrowL + ' ' + fmtL(Math.abs(diffL)) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:' + colL + ';font-weight:500">' + (pctL > 0 ? '+' : '') + pctL.toFixed(1) + '%</td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtE(f1) + '</td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtE(f2) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:' + colF + ';font-weight:500">' + arrowF + ' ' + fmtE(Math.abs(diffF)) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:' + colF + ';font-weight:500">' + (pctF > 0 ? '+' : '') + pctF.toFixed(1) + '%</td>';
    html += '</tr>';
  }
  // Riga totale
  const tdL = tot1L - tot2L, tdF = tot1F - tot2F;
  const tpL = tot2L > 0 ? ((tot1L-tot2L)/tot2L*100) : 0;
  const tpF = tot2F > 0 ? ((tot1F-tot2F)/tot2F*100) : 0;
  const tcL = tdL > 0 ? '#639922' : tdL < 0 ? '#A32D2D' : 'var(--text-muted)';
  const tcF = tdF > 0 ? '#639922' : tdF < 0 ? '#A32D2D' : 'var(--text-muted)';
  html += '<tr style="border-top:2px solid var(--accent);font-weight:600">';
  html += '<td>TOTALE</td>';
  html += '<td style="font-family:var(--font-mono)">' + fmtL(tot1L) + '</td>';
  html += '<td style="font-family:var(--font-mono)">' + fmtL(tot2L) + '</td>';
  html += '<td style="font-family:var(--font-mono);color:' + tcL + '">' + (tdL>0?'▲':'▼') + ' ' + fmtL(Math.abs(tdL)) + '</td>';
  html += '<td style="font-family:var(--font-mono);color:' + tcL + '">' + (tpL>0?'+':'') + tpL.toFixed(1) + '%</td>';
  html += '<td style="font-family:var(--font-mono)">' + fmtE(tot1F) + '</td>';
  html += '<td style="font-family:var(--font-mono)">' + fmtE(tot2F) + '</td>';
  html += '<td style="font-family:var(--font-mono);color:' + tcF + '">' + (tdF>0?'▲':'▼') + ' ' + fmtE(Math.abs(tdF)) + '</td>';
  html += '<td style="font-family:var(--font-mono);color:' + tcF + '">' + (tpF>0?'+':'') + tpF.toFixed(1) + '%</td>';
  html += '</tr></tbody></table></div>';

  // Canvas per grafici
  html += '<div class="grid2" style="margin-top:16px">';
  html += '<div><div style="font-size:13px;font-weight:500;margin-bottom:8px">Litri totali — ' + anno1 + ' vs ' + anno2 + '</div><canvas id="chart-conf-litri" height="250"></canvas></div>';
  html += '<div><div style="font-size:13px;font-weight:500;margin-bottom:8px">Fatturato imponibile — ' + anno1 + ' vs ' + anno2 + '</div><canvas id="chart-conf-fatt" height="250"></canvas></div>';
  html += '</div>';

  wrap.innerHTML = html;

  // Grafici
  const labelsM = MESI_NOMI.map(n => n.substring(0,3));

  const ctxL = document.getElementById('chart-conf-litri');
  if (ctxL) {
    if (_chartConfLitri) _chartConfLitri.destroy();
    _chartConfLitri = new Chart(ctxL.getContext('2d'), {
      type:'bar', data:{ labels:labelsM, datasets:[
        { label:String(anno1), data:mesi1.map(m=>Math.round(m.totLitri)), backgroundColor:'#D4A017', borderRadius:4 },
        { label:String(anno2), data:mesi2.map(m=>Math.round(m.totLitri)), backgroundColor:'rgba(212,160,23,0.35)', borderRadius:4 }
      ] }, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtL(v)}}} }
    });
  }

  const ctxF = document.getElementById('chart-conf-fatt');
  if (ctxF) {
    if (_chartConfFatt) _chartConfFatt.destroy();
    _chartConfFatt = new Chart(ctxF.getContext('2d'), {
      type:'bar', data:{ labels:labelsM, datasets:[
        { label:String(anno1), data:mesi1.map(m=>Math.round(m.totFatt)), backgroundColor:'#378ADD', borderRadius:4 },
        { label:String(anno2), data:mesi2.map(m=>Math.round(m.totFatt)), backgroundColor:'rgba(55,138,221,0.35)', borderRadius:4 }
      ] }, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:11}}}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}}} }
    });
  }
}

function stampaConfrontoAnni() {
  if (!_ultimoConfronto) { toast('Prima esegui un confronto'); return; }
  const { anno1, anno2 } = _ultimoConfronto;
  const wrap = document.getElementById('confronto-anni-content');
  const tbl = wrap.querySelector('table');
  if (!tbl) { toast('Nessun dato da stampare'); return; }
  let righeHtml = tbl.innerHTML.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--text-muted\)/g,'#666').replace(/var\(--accent\)/g,'#D85A30');

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Confronto ' + anno1 + ' vs ' + anno2 + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:9px}.rpt-header{flex-direction:column!important;gap:8px}table{font-size:8px}th,td{padding:3px 2px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#378ADD;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #2A6DB5;text-align:center}' +
    'td{padding:6px 8px;border:1px solid #ddd}' +
    '</style></head><body>';
  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #378ADD;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#378ADD">CONFRONTO VENDITE ' + anno1 + ' vs ' + anno2 + '</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Litri e fatturato imponibile — Ingrosso + Dettaglio</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';
  html += '<table>' + righeHtml + '</table>';
  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#378ADD;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';
  var w = window.open('','_blank'); w.document.write(html); w.document.close();
}

// ── CLIENTI ───────────────────────────────────────────────────────
async function salvaCliente(id=null) {
  const record = { nome:document.getElementById('cl-nome').value.trim(), tipo:document.getElementById('cl-tipo').value, cliente_rete:document.getElementById('cl-rete').checked, piva:document.getElementById('cl-piva').value, codice_fiscale:document.getElementById('cl-cf').value, indirizzo:document.getElementById('cl-indirizzo').value, citta:document.getElementById('cl-citta').value, provincia:document.getElementById('cl-provincia').value, telefono:document.getElementById('cl-telefono').value, email:document.getElementById('cl-email').value, fido_massimo:parseFloat(document.getElementById('cl-fido').value)||0, giorni_pagamento:parseInt(document.getElementById('cl-gg').value), zona_consegna:document.getElementById('cl-zona').value, prodotti_abituali:document.getElementById('cl-prodotti').value, note:document.getElementById('cl-note').value };
  if (!record.nome) { toast('Inserisci il nome'); return; }
  let error, clienteId = id;
  if (id) { ({error}=await sb.from('clienti').update(record).eq('id',id)); }
  else {
    const res = await sb.from('clienti').insert([record]).select().single();
    error = res.error;
    if (res.data) clienteId = res.data.id;
  }
  if (error) { toast('Errore: '+error.message); return; }
  // Salva sedi di scarico
  if (clienteId) await salvaSediCliente(clienteId);
  toast(id?'Cliente aggiornato!':'Cliente salvato!');
  cacheClienti=[]; chiudiModal(); caricaClienti();
}

async function apriModaleCliente(id=null) {
  document.getElementById('modal-title').textContent = id ? 'Modifica cliente' : 'Nuovo cliente';
  document.getElementById('modal-save-btn').onclick = () => salvaCliente(id);
  ['cl-nome','cl-piva','cl-cf','cl-indirizzo','cl-citta','cl-provincia','cl-telefono','cl-email','cl-fido','cl-zona','cl-prodotti','cl-note'].forEach(c => { const el=document.getElementById(c); if(el) el.value=''; });
  document.getElementById('cl-tipo').value='azienda'; document.getElementById('cl-gg').value='30';
  document.getElementById('cl-rete').checked = false;
  document.getElementById('cl-sedi-lista').innerHTML = '';
  if (id) {
    const{data}=await sb.from('clienti').select('*').eq('id',id).single();
    if(data){ ['nome','piva','cf:codice_fiscale','indirizzo','citta','provincia','telefono','email'].forEach(f => { const[k,v]=f.split(':'); const el=document.getElementById('cl-'+(v||k)); if(el) el.value=data[v||k]||''; }); document.getElementById('cl-tipo').value=data.tipo||'azienda'; document.getElementById('cl-fido').value=data.fido_massimo||0; document.getElementById('cl-gg').value=data.giorni_pagamento||30; document.getElementById('cl-zona').value=data.zona_consegna||''; document.getElementById('cl-prodotti').value=data.prodotti_abituali||''; document.getElementById('cl-note').value=data.note||''; document.getElementById('cl-rete').checked = !!data.cliente_rete; }
    await caricaSediCliente(id);
  } else {
    document.getElementById('cl-sedi-wrap').style.display = 'block';
  }
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-clienti').style.display='block';
  document.getElementById('modal-fornitori').style.display='none';
}

async function caricaClienti() {
  const { data } = await sb.from('clienti').select('*').order('nome');
  const tbody = document.getElementById('tabella-clienti');
  if (!data||!data.length) { tbody.innerHTML = '<tr><td colspan="13" class="loading">Nessun cliente</td></tr>'; return; }

  // Carica TUTTI gli ordini non pagati in UNA query per calcolare fido
  const clientiConFido = data.filter(r => Number(r.fido_massimo||0) > 0);
  let ordiniMap = {};
  if (clientiConFido.length) {
    const { data: ordNonPagati } = await sb.from('ordini').select('cliente,cliente_id,data,costo_litro,trasporto_litro,margine,iva,litri,giorni_pagamento,pagato').neq('stato','annullato').eq('pagato', false);
    (ordNonPagati||[]).forEach(o => {
      const key = o.cliente_id || o.cliente;
      if (!ordiniMap[key]) ordiniMap[key] = [];
      ordiniMap[key].push(o);
    });
  }

  tbody.innerHTML = data.map(r => {
    let fidoUsatoHtml = '—', fidoResiduoHtml = '—';
    const fidoMax = Number(r.fido_massimo || 0);
    if (fidoMax > 0) {
      const ordini = (ordiniMap[r.id]||[]).concat(ordiniMap[r.nome]||[]);
      // Deduplica per id se necessario
      const seen = new Set();
      let usato = 0;
      ordini.forEach(o => {
        const k = o.cliente_id + '_' + o.data + '_' + o.litri;
        if (seen.has(k)) return;
        seen.add(k);
        const scad = new Date(o.data);
        scad.setDate(scad.getDate() + (o.giorni_pagamento || r.giorni_pagamento || 30));
        if (scad > oggi) usato += prezzoConIva(o) * Number(o.litri);
      });
      const residuo = fidoMax - usato;
      fidoUsatoHtml = '<span style="font-family:var(--font-mono)">' + fmtE(usato) + '</span>';
      fidoResiduoHtml = fidoBar(usato, fidoMax) + ' <span style="font-size:11px;font-family:var(--font-mono)">' + fmtE(residuo) + '</span>';
    }
    return '<tr><td><strong>' + esc(r.nome) + '</strong></td><td><span class="badge blue">' + esc(r.tipo||'azienda') + '</span></td><td>' + (r.cliente_rete ? '<span class="badge purple">Rete</span>' : '<span class="badge gray">Consumo</span>') + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.piva||'—') + '</td><td>' + esc(r.citta||'—') + '</td><td>' + esc(r.telefono||'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(fidoMax):'—') + '</td><td>' + fidoUsatoHtml + '</td><td>' + fidoResiduoHtml + '</td><td>' + (r.giorni_pagamento||30) + ' gg</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.prodotti_abituali||'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="apriSchedaCliente(\'' + r.id + '\',\'' + esc(r.nome).replace(/'/g,"\\'") + '\')">📋 Scheda</button> <button class="btn-edit" onclick="apriModaleCliente(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'clienti\',\'' + r.id + '\',caricaClienti)">x</button></td></tr>';
  }).join('');
}

function filtraClienti() {
  const q = (document.getElementById('search-clienti').value||'').toLowerCase();
  const righe = document.querySelectorAll('#tabella-clienti tr');
  righe.forEach(tr => {
    const testo = tr.textContent.toLowerCase();
    tr.style.display = !q || testo.includes(q) ? '' : 'none';
  });
}

// ── SCHEDA CLIENTE CON GESTIONE PAGAMENTI ────────────────────────
async function apriSchedaCliente(clienteId, clienteNome) {
  const { data: cliente } = await sb.from('clienti').select('*').eq('id', clienteId).single();
  if (!cliente) { toast('Cliente non trovato'); return; }

  const { data: ordini } = await sb.from('ordini').select('id,data,prodotto,litri,costo_litro,trasporto_litro,margine,iva,stato,pagato,data_pagamento,data_scadenza,giorni_pagamento,note_pagamento').or('cliente_id.eq.' + clienteId + ',cliente.eq.' + clienteNome).neq('stato','annullato').order('data',{ascending:false}).limit(500);

  const fidoMax = Number(cliente.fido_massimo || 0);
  let fidoUsato = 0;
  (ordini||[]).forEach(o => {
    if (o.pagato) return; // Se pagato non conta nel fido
    const scad = new Date(o.data);
    scad.setDate(scad.getDate() + (o.giorni_pagamento || cliente.giorni_pagamento || 30));
    if (scad > oggi) fidoUsato += prezzoConIva(o) * Number(o.litri);
  });
  const fidoResiduo = fidoMax - fidoUsato;
  const pctFido = fidoMax > 0 ? Math.round((fidoUsato / fidoMax) * 100) : 0;

  let html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">';
  html += '<div><div style="font-size:18px;font-weight:500">' + esc(clienteNome) + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">' + esc(cliente.tipo||'azienda') + ' · ' + (cliente.cliente_rete ? '<span class="badge purple" style="font-size:10px">Rete</span>' : '<span class="badge gray" style="font-size:10px">Consumo</span>') + ' · ' + esc(cliente.citta||'—') + ' · P.IVA: ' + esc(cliente.piva||'—') + '</div></div>';
  if (fidoMax > 0) {
    const fidoColor = pctFido >= 90 ? '#A32D2D' : pctFido >= 60 ? '#BA7517' : '#639922';
    html += '<div style="text-align:right"><div style="font-size:10px;color:var(--text-hint);text-transform:uppercase">Fido</div>';
    html += '<div style="font-size:16px;font-weight:500;font-family:var(--font-mono);color:' + fidoColor + '">' + fmtE(fidoResiduo) + ' <span style="font-size:11px;color:var(--text-muted)">/ ' + fmtE(fidoMax) + '</span></div>';
    html += '<div style="height:4px;width:100%;max-width:120px;background:var(--bg-kpi);border-radius:2px;margin-top:4px"><div style="height:100%;width:' + Math.min(100,pctFido) + '%;background:' + fidoColor + ';border-radius:2px"></div></div></div>';
  }
  html += '</div>';

  // Tabella ordini con gestione pagamenti
  html += '<div style="max-height:400px;overflow-y:auto">';
  html += '<table style="width:100%;font-size:12px"><thead><tr><th>Data</th><th>Prodotto</th><th>Litri</th><th>Prezzo/L</th><th>Totale</th><th>Scadenza</th><th>Pagato</th><th>Data pag.</th><th></th></tr></thead><tbody>';

  if (!ordini || !ordini.length) {
    html += '<tr><td colspan="9" class="loading">Nessun ordine</td></tr>';
  } else {
    ordini.forEach(o => {
      const tot = prezzoConIva(o) * Number(o.litri);
      const scadData = o.data_scadenza || '—';
      const isPagato = o.pagato === true;
      const isScaduto = !isPagato && o.data_scadenza && new Date(o.data_scadenza) < oggi;
      const rowStyle = isPagato ? 'opacity:0.5' : isScaduto ? 'background:#FCEBEB' : '';

      html += '<tr style="' + rowStyle + '">';
      html += '<td>' + o.data + '</td>';
      html += '<td>' + o.prodotto + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmt(prezzoConIva(o)) + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td>';
      html += '<td>' + scadData + (isScaduto ? ' <span style="color:#A32D2D;font-size:10px;font-weight:500">SCADUTO</span>' : '') + '</td>';
      html += '<td><input type="checkbox" ' + (isPagato ? 'checked' : '') + ' onchange="togglePagamento(\'' + o.id + '\',this.checked,\'' + clienteId + '\',\'' + clienteNome.replace(/'/g,"\\'") + '\')" /></td>';
      html += '<td>';
      if (isPagato && o.data_pagamento) {
        html += '<span style="font-size:11px;color:#639922">' + o.data_pagamento + '</span>';
      } else if (!isPagato && o.data_pagamento && o.data_pagamento > oggiISO) {
        html += '<span style="font-size:11px;color:#378ADD">' + o.data_pagamento + '</span> <span style="font-size:9px;color:#378ADD;font-weight:500">PROGRAMMATO</span>';
        html += '<br/><input type="date" style="font-size:10px;padding:1px 3px;border:0.5px solid var(--border);border-radius:4px;background:var(--bg);margin-top:2px" value="' + o.data_pagamento + '" onchange="impostaDataPagamento(\'' + o.id + '\',this.value,\'' + clienteId + '\',\'' + clienteNome.replace(/'/g,"\\'") + '\')" />';
      } else {
        html += '<input type="date" style="font-size:11px;padding:2px 4px;border:0.5px solid var(--border);border-radius:4px;background:var(--bg)" value="' + (o.data_pagamento||'') + '" onchange="impostaDataPagamento(\'' + o.id + '\',this.value,\'' + clienteId + '\',\'' + clienteNome.replace(/'/g,"\\'") + '\')" />';
      }
      html += '</td>';
      html += '<td style="font-size:10px;color:var(--text-muted)">' + (o.note_pagamento||'') + '</td>';
      html += '</tr>';
    });
  }

  html += '</tbody></table></div>';

  // Riepilogo
  const totOrdini = (ordini||[]).length;
  const totPagati = (ordini||[]).filter(o => o.pagato).length;
  const totDaPagare = (ordini||[]).filter(o => !o.pagato).length;
  const totScaduti = (ordini||[]).filter(o => !o.pagato && o.data_scadenza && new Date(o.data_scadenza) < oggi).length;
  html += '<div style="display:flex;gap:16px;margin-top:12px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">';
  html += '<span>Totale ordini: <strong>' + totOrdini + '</strong></span>';
  html += '<span style="color:#639922">Pagati: <strong>' + totPagati + '</strong></span>';
  html += '<span>Da pagare: <strong>' + totDaPagare + '</strong></span>';
  if (totScaduti > 0) html += '<span style="color:#A32D2D">Scaduti: <strong>' + totScaduti + '</strong></span>';
  html += '</div>';

  html += '<button class="btn-primary" style="width:100%;margin-top:14px" onclick="chiudiModalePermessi()">Chiudi</button>';
  apriModal(html);
}

// ── SEDI DI SCARICO (inline nel form cliente) ───────────────────
function aggiungiRigaSede(s) {
  const lista = document.getElementById('cl-sedi-lista');
  const div = document.createElement('div');
  div.className = 'cl-sede-row';
  div.dataset.id = s ? s.id : 'new';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px;padding:10px;background:var(--bg-kpi);border-radius:8px';
  div.innerHTML = '<div class="form-group"><label>Nome sede</label><input type="text" class="sede-r-nome" value="' + esc(s ? s.nome : '') + '" placeholder="Es. Cantiere Via Roma" /></div>' +
    '<div class="form-group"><label>Indirizzo</label><input type="text" class="sede-r-indirizzo" value="' + esc(s ? s.indirizzo || '' : '') + '" /></div>' +
    '<div class="form-group"><label>Città</label><input type="text" class="sede-r-citta" value="' + esc(s ? s.citta || '' : '') + '" /></div>' +
    '<div style="display:flex;flex-direction:column;gap:4px;align-items:center"><button class="btn-danger" onclick="this.closest(\'.cl-sede-row\').remove()" title="Rimuovi">x</button>' +
    '<label style="font-size:10px;display:flex;align-items:center;gap:3px;cursor:pointer"><input type="radio" name="sede-default" class="sede-r-default" ' + (s && s.predefinito ? 'checked' : '') + ' /> def.</label></div>';
  lista.appendChild(div);
}

async function caricaSediCliente(clienteId) {
  const wrap = document.getElementById('cl-sedi-wrap');
  const lista = document.getElementById('cl-sedi-lista');
  if (!clienteId) { wrap.style.display = 'none'; lista.innerHTML = ''; return; }
  wrap.style.display = 'block';
  lista.innerHTML = '';
  const { data: sedi } = await sb.from('sedi_scarico').select('*').eq('cliente_id', clienteId).eq('attivo', true).order('predefinito',{ascending:false}).order('nome');
  if (sedi && sedi.length) {
    sedi.forEach(s => aggiungiRigaSede(s));
  }
}

async function salvaSediCliente(clienteId) {
  if (!clienteId) return;
  const righe = document.querySelectorAll('.cl-sede-row');
  const idsPresenti = [];

  for (const row of righe) {
    const sedeId = row.dataset.id;
    const nome = row.querySelector('.sede-r-nome').value.trim();
    const indirizzo = row.querySelector('.sede-r-indirizzo').value;
    const citta = row.querySelector('.sede-r-citta').value;
    const predefinito = row.querySelector('.sede-r-default').checked;
    if (!nome) continue;

    const record = { cliente_id: clienteId, nome, indirizzo, citta, predefinito };

    if (sedeId && sedeId !== 'new') {
      await sb.from('sedi_scarico').update(record).eq('id', sedeId);
      idsPresenti.push(sedeId);
    } else {
      const { data: nuovo } = await sb.from('sedi_scarico').insert([record]).select().single();
      if (nuovo) idsPresenti.push(nuovo.id);
    }
  }

  // Disattiva sedi rimosse
  const { data: tuttiDb } = await sb.from('sedi_scarico').select('id').eq('cliente_id', clienteId).eq('attivo', true);
  if (tuttiDb) {
    for (const s of tuttiDb) {
      if (!idsPresenti.includes(s.id)) {
        await sb.from('sedi_scarico').update({ attivo: false }).eq('id', s.id);
      }
    }
  }
}

async function togglePagamento(ordineId, pagato, clienteId, clienteNome) {
  const update = { pagato };
  if (pagato) {
    update.data_pagamento = new Date().toISOString().split('T')[0];
  } else {
    update.data_pagamento = null;
  }
  const { error } = await sb.from('ordini').update(update).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast(pagato ? 'Ordine segnato come pagato' : 'Pagamento rimosso');
  apriSchedaCliente(clienteId, clienteNome);
}

async function impostaDataPagamento(ordineId, data, clienteId, clienteNome) {
  if (!data) return;
  const isPagato = data <= oggiISO; // Pagato solo se data è oggi o passata
  const { error } = await sb.from('ordini').update({ data_pagamento: data, pagato: isPagato }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  if (isPagato) {
    toast('Ordine segnato come pagato');
  } else {
    toast('Pagamento programmato per il ' + new Date(data).toLocaleDateString('it-IT'));
  }
  apriSchedaCliente(clienteId, clienteNome);
}

// ── SCADENZARIO CREDITI ──────────────────────────────────────────
async function caricaScadenzario() {
  // 1 sola query: tutti ordini non pagati tipo cliente
  const { data: ordini } = await sb.from('ordini').select('id,data,cliente,cliente_id,prodotto,litri,costo_litro,trasporto_litro,margine,iva,giorni_pagamento,stato').eq('tipo_ordine','cliente').neq('stato','annullato').eq('pagato',false);
  const { data: clienti } = await sb.from('clienti').select('id,nome,cliente_rete,fido_massimo,giorni_pagamento');

  const clMap = {};
  (clienti||[]).forEach(c => { clMap[c.nome] = c; if (c.id) clMap[c.id] = c; });

  const oggiMs = oggi.getTime();
  const MS_DAY = 86400000;

  // Fasce aging
  const fasce = [
    { label: 'Non scaduto', min: -Infinity, max: 0, ordini: 0, importo: 0, color: '#639922', bg: '#EAF3DE' },
    { label: 'Scaduto 1–30 gg', min: 1, max: 30, ordini: 0, importo: 0, color: '#BA7517', bg: '#FAEEDA' },
    { label: 'Scaduto 31–60 gg', min: 31, max: 60, ordini: 0, importo: 0, color: '#D85A30', bg: '#FDE8D8' },
    { label: 'Scaduto 61–90 gg', min: 61, max: 90, ordini: 0, importo: 0, color: '#A32D2D', bg: '#FCEBEB' },
    { label: 'Scaduto oltre 90 gg', min: 91, max: Infinity, ordini: 0, importo: 0, color: '#791F1F', bg: '#F5D5D5' }
  ];

  let totCrediti = 0, totScaduti = 0, totInScadenza = 0, totOk = 0;
  const perCliente = {};

  (ordini||[]).forEach(o => {
    const cl = clMap[o.cliente_id] || clMap[o.cliente] || {};
    const ggPag = o.giorni_pagamento || cl.giorni_pagamento || 30;
    const scadenza = new Date(o.data);
    scadenza.setDate(scadenza.getDate() + ggPag);
    const ggScaduto = Math.floor((oggiMs - scadenza.getTime()) / MS_DAY);
    const importo = prezzoConIva(o) * Number(o.litri);

    totCrediti += importo;
    if (ggScaduto > 0) totScaduti += importo;
    else if (ggScaduto > -30) totInScadenza += importo;
    else totOk += importo;

    // Fascia aging
    for (const f of fasce) {
      if (ggScaduto >= f.min && ggScaduto <= f.max) {
        f.ordini++; f.importo += importo; break;
      }
    }

    // Per cliente
    const nomeC = o.cliente || '—';
    if (!perCliente[nomeC]) perCliente[nomeC] = { ordini: 0, importo: 0, scaduto: 0, maxGgScaduto: 0, rete: cl.cliente_rete || false, fidoMax: Number(cl.fido_massimo || 0) };
    perCliente[nomeC].ordini++;
    perCliente[nomeC].importo += importo;
    if (ggScaduto > 0) {
      perCliente[nomeC].scaduto += importo;
      perCliente[nomeC].maxGgScaduto = Math.max(perCliente[nomeC].maxGgScaduto, ggScaduto);
    }
  });

  // KPI
  document.getElementById('scad-totale').textContent = fmtE(totCrediti);
  document.getElementById('scad-scaduti').textContent = fmtE(totScaduti);
  document.getElementById('scad-inscadenza').textContent = fmtE(totInScadenza);
  document.getElementById('scad-ok').textContent = fmtE(totOk);

  // Tabella aging fasce
  const tbFasce = document.getElementById('scad-aging-fasce');
  tbFasce.innerHTML = fasce.map(f => {
    const pct = totCrediti > 0 ? Math.round((f.importo / totCrediti) * 100) : 0;
    return '<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + f.color + ';margin-right:6px"></span><strong>' + f.label + '</strong></td><td style="font-family:var(--font-mono)">' + f.ordini + '</td><td style="font-family:var(--font-mono)">' + fmtE(f.importo) + '</td><td><div style="display:flex;align-items:center;gap:6px"><div style="height:8px;width:' + pct + '%;max-width:100px;background:' + f.color + ';border-radius:4px"></div><span style="font-size:11px;font-family:var(--font-mono)">' + pct + '%</span></div></td></tr>';
  }).join('') + '<tr style="font-weight:bold;border-top:2px solid var(--border)"><td>TOTALE</td><td style="font-family:var(--font-mono)">' + (ordini||[]).length + '</td><td style="font-family:var(--font-mono)">' + fmtE(totCrediti) + '</td><td>100%</td></tr>';

  // Tabella dettaglio per cliente (ordinata per scaduto desc)
  const clArr = Object.entries(perCliente).sort((a, b) => b[1].scaduto - a[1].scaduto);
  const tbDett = document.getElementById('scad-dettaglio');
  tbDett.innerHTML = clArr.map(([nome, v]) => {
    const pctFido = v.fidoMax > 0 ? Math.round((v.importo / v.fidoMax) * 100) : 0;
    const fidoColor = pctFido >= 90 ? '#A32D2D' : pctFido >= 60 ? '#BA7517' : '#639922';
    const scadColor = v.maxGgScaduto > 90 ? '#791F1F' : v.maxGgScaduto > 60 ? '#A32D2D' : v.maxGgScaduto > 30 ? '#D85A30' : v.maxGgScaduto > 0 ? '#BA7517' : '#639922';
    return '<tr>' +
      '<td><strong>' + esc(nome) + '</strong></td>' +
      '<td>' + (v.rete ? '<span class="badge purple">Rete</span>' : '<span class="badge gray">Consumo</span>') + '</td>' +
      '<td style="font-family:var(--font-mono)">' + v.ordini + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtE(v.importo) + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + (v.scaduto > 0 ? '#A32D2D' : 'var(--text-muted)') + ';font-weight:' + (v.scaduto > 0 ? '600' : '400') + '">' + (v.scaduto > 0 ? fmtE(v.scaduto) : '—') + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + scadColor + ';font-weight:500">' + (v.maxGgScaduto > 0 ? v.maxGgScaduto + ' gg' : '—') + '</td>' +
      '<td style="font-family:var(--font-mono)">' + (v.fidoMax > 0 ? fmtE(v.fidoMax) : '—') + '</td>' +
      '<td>' + (v.fidoMax > 0 ? '<span style="font-family:var(--font-mono);color:' + fidoColor + ';font-weight:500">' + pctFido + '%</span>' : '—') + '</td>' +
      '</tr>';
  }).join('');

  if (!clArr.length) tbDett.innerHTML = '<tr><td colspan="8" class="loading">Nessun credito aperto</td></tr>';
  toast('Scadenzario aggiornato: ' + (ordini||[]).length + ' ordini aperti');
}

function stampaScadenzario() {
  const kpiTot = document.getElementById('scad-totale').textContent;
  const kpiScad = document.getElementById('scad-scaduti').textContent;
  const kpiInScad = document.getElementById('scad-inscadenza').textContent;
  const kpiOk = document.getElementById('scad-ok').textContent;
  if (kpiTot === '—') { toast('Prima aggiorna lo scadenzario'); return; }

  const tblFasce = document.getElementById('scad-aging-fasce').closest('table').outerHTML;
  const tblDett = document.getElementById('scad-dettaglio').closest('table').outerHTML;

  const html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Scadenzario Crediti</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm;color:#000}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:9px}table{font-size:8px}th,td{padding:3px 2px!important}.kpi-grid{grid-template-columns:1fr 1fr!important}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px}' +
    'th{background:#378ADD;color:#fff;padding:6px 8px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #2A6DB5;text-align:left}' +
    'td{padding:5px 8px;border:1px solid #ddd}' +
    '.kpi-grid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:18px}' +
    '.kpi-box{border-radius:8px;padding:14px;text-align:center;border:1px solid #ddd}' +
    '.kpi-label{font-size:9px;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}' +
    '.kpi-val{font-size:18px;font-weight:bold;font-family:Courier New,monospace}' +
    '.badge{display:inline-block;padding:2px 6px;border-radius:10px;font-size:9px;font-weight:500}' +
    '.badge.purple{background:#EEEDFE;color:#26215C}.badge.gray{background:#eee;color:#666}' +
    '</style></head><body>' +
    '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #378ADD;padding-bottom:10px;margin-bottom:14px">' +
    '<div><div style="font-size:18px;font-weight:bold;color:#378ADD">SCADENZARIO CREDITI CLIENTI</div>' +
    '<div style="font-size:12px;color:#666;margin-top:3px">Generato il ' + oggi.toLocaleDateString('it-IT') + '</div></div>' +
    '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div></div></div>' +
    '<div class="kpi-grid">' +
    '<div class="kpi-box" style="background:#E6F1FB;border-color:#B8D4F0"><div class="kpi-label" style="color:#0C447C">Totale crediti</div><div class="kpi-val">' + kpiTot + '</div></div>' +
    '<div class="kpi-box" style="background:#FCEBEB;border-color:#E8AAAA"><div class="kpi-label" style="color:#791F1F">Scaduti</div><div class="kpi-val" style="color:#A32D2D">' + kpiScad + '</div></div>' +
    '<div class="kpi-box" style="background:#FAEEDA;border-color:#E8D5A8"><div class="kpi-label" style="color:#633806">In scadenza 30gg</div><div class="kpi-val" style="color:#BA7517">' + kpiInScad + '</div></div>' +
    '<div class="kpi-box" style="background:#EAF3DE;border-color:#B8D4A0"><div class="kpi-label" style="color:#27500A">Entro termini</div><div class="kpi-val" style="color:#639922">' + kpiOk + '</div></div>' +
    '</div>' +
    '<div style="font-size:12px;font-weight:bold;color:#378ADD;text-transform:uppercase;margin-bottom:8px">Aging per fascia</div>' +
    tblFasce.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--border\)/g,'#ddd').replace(/var\(--text-muted\)/g,'#666') +
    '<div style="font-size:12px;font-weight:bold;color:#378ADD;text-transform:uppercase;margin-bottom:8px;margin-top:16px">Dettaglio per cliente</div>' +
    tblDett.replace(/var\(--font-mono\)/g,'Courier New,monospace').replace(/var\(--border\)/g,'#ddd').replace(/var\(--text-muted\)/g,'#666') +
    '<div style="text-align:center;font-size:9px;color:#aaa;margin-top:20px;border-top:1px solid #ddd;padding-top:8px">PhoenixFuel Srl — Report generato il ' + oggi.toLocaleDateString('it-IT') + ' — Documento interno</div>' +
    '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">' +
    '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#378ADD;color:#fff">🖨️ Stampa / PDF</button>' +
    '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#666;color:#fff">✕ Chiudi</button></div>' +
    '</body></html>';

  const w = window.open('', '_blank');
  w.document.write(html);
  w.document.close();
}

// ── FORNITORI ─────────────────────────────────────────────────────
async function caricaCheckboxBasi(selectedIds=[]) {
  const{data}=await sb.from('basi_carico').select('id,nome').eq('attivo',true).order('nome');
  const wrap = document.getElementById('fo-basi-check');
  if (!wrap) return;
  wrap.innerHTML = data ? data.map(b => '<label class="check-label"><input type="checkbox" value="' + b.id + '"' + (selectedIds.includes(b.id)?' checked':'') + '/> ' + b.nome + '</label>').join('') : '';
}

async function salvaFornitore(id=null) {
  const record = { nome:document.getElementById('fo-nome').value.trim(), ragione_sociale:document.getElementById('fo-ragione').value, piva:document.getElementById('fo-piva').value, indirizzo:document.getElementById('fo-indirizzo').value, citta:document.getElementById('fo-citta').value, telefono:document.getElementById('fo-telefono').value, email:document.getElementById('fo-email').value, contatto:document.getElementById('fo-contatto').value, fido_massimo:parseFloat(document.getElementById('fo-fido').value)||0, giorni_pagamento:parseInt(document.getElementById('fo-gg').value), note:document.getElementById('fo-note').value };
  if (!record.nome) { toast('Inserisci il nome'); return; }
  let foId = id;
  if (id) { const{error}=await sb.from('fornitori').update(record).eq('id',id); if(error){toast('Errore: '+error.message);return;} }
  else { const{data:fo,error}=await sb.from('fornitori').insert([record]).select().single(); if(error){toast('Errore: '+error.message);return;} foId=fo.id; }
  await sb.from('fornitori_basi').delete().eq('fornitore_id',foId);
  const checks = document.querySelectorAll('#fo-basi-check input:checked');
  if (checks.length) await sb.from('fornitori_basi').insert(Array.from(checks).map(c=>({fornitore_id:foId,base_carico_id:c.value})));
  toast(id?'Fornitore aggiornato!':'Fornitore salvato!');
  cacheFornitori=[]; chiudiModal(); caricaFornitori();
}

async function apriModaleFornitore(id=null) {
  document.getElementById('modal-title').textContent = id ? 'Modifica fornitore' : 'Nuovo fornitore';
  document.getElementById('modal-save-btn').onclick = () => salvaFornitore(id);
  ['fo-nome','fo-ragione','fo-piva','fo-indirizzo','fo-citta','fo-telefono','fo-email','fo-contatto','fo-fido','fo-note'].forEach(c => { const el=document.getElementById(c); if(el) el.value=''; });
  document.getElementById('fo-gg').value='30';
  let selectedBasi=[];
  if (id) {
    const{data}=await sb.from('fornitori').select('*, fornitori_basi(base_carico_id)').eq('id',id).single();
    if(data){ document.getElementById('fo-nome').value=data.nome||''; document.getElementById('fo-ragione').value=data.ragione_sociale||''; document.getElementById('fo-piva').value=data.piva||''; document.getElementById('fo-indirizzo').value=data.indirizzo||''; document.getElementById('fo-citta').value=data.citta||''; document.getElementById('fo-telefono').value=data.telefono||''; document.getElementById('fo-email').value=data.email||''; document.getElementById('fo-contatto').value=data.contatto||''; document.getElementById('fo-fido').value=data.fido_massimo||0; document.getElementById('fo-gg').value=data.giorni_pagamento||30; document.getElementById('fo-note').value=data.note||''; selectedBasi=data.fornitori_basi?data.fornitori_basi.map(fb=>fb.base_carico_id):[]; }
  }
  await caricaCheckboxBasi(selectedBasi);
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-fornitori').style.display='block';
  document.getElementById('modal-clienti').style.display='none';
}

function fidoBar(usato, max) {
  if (!max) return '—';
  const pct = Math.min(100,Math.round((usato/max)*100));
  const cls = pct<60?'fido-ok':pct<85?'fido-warn':'fido-danger';
  return '<div class="fido-bar-wrap"><div class="fido-bar"><div class="fido-fill ' + cls + '" style="width:' + pct + '%"></div></div><span style="font-size:10px">' + pct + '%</span></div>';
}

async function caricaFornitori() {
  const{data}=await sb.from('fornitori').select('*, fornitori_basi(base_carico_id, basi_carico(nome))').order('nome');
  const tbody=document.getElementById('tabella-fornitori');
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="12" class="loading">Nessun fornitore</td></tr>';return;}

  // Carica TUTTI gli ordini non pagati per fido fornitori in UNA query
  const fornConFido = data.filter(r => Number(r.fido_massimo||0) > 0);
  let ordFornMap = {};
  if (fornConFido.length) {
    const nomi = fornConFido.map(f => f.nome);
    const { data: ordNonPag } = await sb.from('ordini').select('fornitore,data,costo_litro,trasporto_litro,margine,iva,litri,giorni_pagamento').neq('stato','annullato').in('fornitore', nomi);
    (ordNonPag||[]).forEach(o => {
      if (!ordFornMap[o.fornitore]) ordFornMap[o.fornitore] = [];
      ordFornMap[o.fornitore].push(o);
    });
  }

  tbody.innerHTML = data.map(r => {
    let usato = 0, residuo = 0;
    const fidoMax = Number(r.fido_massimo||0);
    if (fidoMax > 0) {
      const ords = ordFornMap[r.nome] || [];
      ords.forEach(o => {
        const scad = new Date(o.data);
        scad.setDate(scad.getDate() + (o.giorni_pagamento || r.giorni_pagamento || 30));
        if (scad > oggi) usato += prezzoConIva(o) * Number(o.litri);
      });
      residuo = fidoMax - usato;
    }
    const basi=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.basi_carico?.nome).filter(Boolean).join(', '):'—';
    return '<tr><td><strong>' + esc(r.nome) + '</strong></td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.piva||'—') + '</td><td>' + esc(r.citta||'—') + '</td><td>' + esc(r.contatto||'—') + '</td><td>' + esc(r.telefono||'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(fidoMax):'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(usato):'—') + '</td><td>' + (fidoMax>0?fidoBar(usato,fidoMax)+' <span style="font-size:11px;font-family:var(--font-mono)">'+fmtE(residuo)+'</span>':'—') + '</td><td>' + (r.giorni_pagamento||30) + ' gg</td><td style="font-size:11px;color:var(--text-muted)">' + esc(basi) + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-edit" onclick="apriModaleFornitore(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'fornitori\',\'' + r.id + '\',caricaFornitori)">x</button></td></tr>';
  }).join('');
}

function filtraFornitori() {
  const q = (document.getElementById('search-fornitori').value||'').toLowerCase();
  const righe = document.querySelectorAll('#tabella-fornitori tr');
  righe.forEach(tr => {
    const testo = tr.textContent.toLowerCase();
    tr.style.display = !q || testo.includes(q) ? '' : 'none';
  });
}

// ── BASI DI CARICO ────────────────────────────────────────────────
async function salvaBasi() {
  const record={nome:document.getElementById('ba-nome').value.trim(),indirizzo:document.getElementById('ba-indirizzo').value,citta:document.getElementById('ba-citta').value,provincia:document.getElementById('ba-provincia').value,note:document.getElementById('ba-note').value};
  if (!record.nome){toast('Inserisci il nome');return;}
  const{error}=await sb.from('basi_carico').insert([record]);
  if (error){toast('Errore: '+error.message);return;}
  toast('Base salvata!'); caricaBasi();
}

async function caricaBasi() {
  const{data}=await sb.from('basi_carico').select('*, fornitori_basi(fornitore_id, fornitori(nome))').order('nome');
  const tbody=document.getElementById('tabella-basi');
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="6" class="loading">Nessuna base</td></tr>';return;}
  tbody.innerHTML=data.map(r => {
    const forn=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.fornitori?.nome).filter(Boolean).join(', '):'—';
    return '<tr><td><strong>' + r.nome + '</strong></td><td>' + (r.indirizzo||'—') + '</td><td>' + (r.citta||'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + forn + '</td><td style="font-size:11px;color:var(--text-muted)">' + (r.note||'—') + '</td><td><button class="btn-edit" onclick="editaBase(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'basi_carico\',\'' + r.id + '\',caricaBasi)">x</button></td></tr>';
  }).join('');
}

async function editaBase(id) {
  const { data: base } = await sb.from('basi_carico').select('*, fornitori_basi(fornitore_id)').eq('id', id).single();
  if (!base) return;
  const { data: fornitori } = await sb.from('fornitori').select('id,nome').eq('attivo',true).order('nome');
  const fornitoriAssegnati = (base.fornitori_basi||[]).map(fb => fb.fornitore_id);

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Modifica base: ' + esc(base.nome) + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Nome</label><input type="text" id="edit-ba-nome" value="' + esc(base.nome) + '" /></div>';
  html += '<div class="form-group"><label>Indirizzo</label><input type="text" id="edit-ba-indirizzo" value="' + esc(base.indirizzo||'') + '" /></div>';
  html += '<div class="form-group"><label>Città</label><input type="text" id="edit-ba-citta" value="' + esc(base.citta||'') + '" /></div>';
  html += '<div class="form-group"><label>Provincia</label><input type="text" id="edit-ba-provincia" value="' + esc(base.provincia||'') + '" /></div>';
  html += '<div class="form-group"><label>Note</label><input type="text" id="edit-ba-note" value="' + esc(base.note||'') + '" /></div>';
  html += '</div>';
  html += '<div style="margin-top:12px"><div style="font-size:12px;font-weight:500;margin-bottom:8px">Fornitori associati</div>';
  html += '<div style="display:flex;flex-wrap:wrap;gap:6px">';
  (fornitori||[]).forEach(f => {
    const checked = fornitoriAssegnati.includes(f.id) ? ' checked' : '';
    html += '<label style="display:flex;align-items:center;gap:4px;font-size:12px;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;padding:5px 10px;cursor:pointer"><input type="checkbox" class="edit-ba-forn" value="' + f.id + '"' + checked + ' /> ' + esc(f.nome) + '</label>';
  });
  html += '</div></div>';
  html += '<div style="display:flex;gap:8px;margin-top:14px"><button class="btn-primary" onclick="confermaEditaBase(\'' + id + '\')">Salva</button><button class="btn-secondary" onclick="chiudiModal()">Annulla</button></div>';
  apriModal(html);
}

async function confermaEditaBase(id) {
  const record = {
    nome: document.getElementById('edit-ba-nome').value.trim(),
    indirizzo: document.getElementById('edit-ba-indirizzo').value,
    citta: document.getElementById('edit-ba-citta').value,
    provincia: document.getElementById('edit-ba-provincia').value,
    note: document.getElementById('edit-ba-note').value
  };
  if (!record.nome) { toast('Nome obbligatorio'); return; }
  const { error } = await sb.from('basi_carico').update(record).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }

  // Aggiorna fornitori associati
  await sb.from('fornitori_basi').delete().eq('base_carico_id', id);
  const checks = document.querySelectorAll('.edit-ba-forn:checked');
  if (checks.length) {
    await sb.from('fornitori_basi').insert(Array.from(checks).map(c => ({ fornitore_id: c.value, base_carico_id: id })));
  }

  toast('Base aggiornata!');
  chiudiModal();
  caricaBasi();
}

// ── PRODOTTI ─────────────────────────────────────────────────────

async function caricaProdotti() {
  const { data } = await sb.from('prodotti').select('*').order('ordine_visualizzazione');
  cacheProdotti = data || [];
  const tbody = document.getElementById('tabella-prodotti');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="8" class="loading">Nessun prodotto</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const catBadge = r.categoria === 'benzine' ? '<span class="badge teal">Benzine</span>' : '<span class="badge gray">Altro</span>';
    const statoBadge = r.attivo ? '<span class="badge green">Attivo</span>' : '<span class="badge red">Disattivo</span>';
    const um = r.unita_misura === 'pezzi' ? 'pz' : 'L';
    const capLabel = r.capacita_default ? _sep(Number(r.capacita_default).toLocaleString('it-IT')) + ' ' + um : '—';
    return '<tr>' +
      '<td><div style="width:14px;height:14px;border-radius:50%;background:' + esc(r.colore) + '"></div></td>' +
      '<td><strong>' + esc(r.nome) + '</strong></td>' +
      '<td>' + catBadge + '</td>' +
      '<td>' + r.iva_default + '%</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px">' + capLabel + '</td>' +
      '<td style="font-size:11px;color:var(--text-muted)">' + (r.unita_misura === 'pezzi' ? 'Pezzi' : 'Litri') + '</td>' +
      '<td>' + statoBadge + '</td>' +
      '<td>' +
        '<button class="btn-edit" onclick="toggleProdottoAttivo(\'' + r.id + '\',' + r.attivo + ')" title="' + (r.attivo ? 'Disattiva' : 'Attiva') + '">' + (r.attivo ? '🔒' : '🔓') + '</button>' +
        '<button class="btn-edit" onclick="editaProdotto(\'' + r.id + '\')" title="Modifica">✏️</button>' +
        '<button class="btn-danger" onclick="eliminaProdotto(\'' + r.id + '\')">x</button>' +
      '</td></tr>';
  }).join('');
}

async function salvaProdotto() {
  const nome = document.getElementById('prod-nome').value.trim();
  if (!nome) { toast('Inserisci un nome prodotto'); return; }
  const record = {
    nome,
    categoria: document.getElementById('prod-categoria').value,
    iva_default: parseInt(document.getElementById('prod-iva').value),
    colore: document.getElementById('prod-colore').value,
    tipo_cisterna: document.getElementById('prod-tipo-cisterna').value.trim() || null,
    capacita_default: parseFloat(document.getElementById('prod-capacita').value) || 0,
    unita_misura: document.getElementById('prod-unita').value
  };
  const { error } = await sb.from('prodotti').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Prodotto salvato!');
  document.getElementById('prod-nome').value = '';
  document.getElementById('prod-tipo-cisterna').value = '';
  document.getElementById('prod-colore').value = '#888888';
  document.getElementById('prod-capacita').value = '';
  caricaProdotti();
}

async function toggleProdottoAttivo(id, attualeAttivo) {
  const { error } = await sb.from('prodotti').update({ attivo: !attualeAttivo }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast(attualeAttivo ? 'Prodotto disattivato' : 'Prodotto attivato');
  caricaProdotti();
}

async function editaProdotto(id) {
  const prod = cacheProdotti.find(p => p.id === id);
  if (!prod) return;
  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Modifica prodotto: ' + esc(prod.nome) + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Nome</label><input type="text" id="edit-prod-nome" value="' + esc(prod.nome) + '" /></div>';
  html += '<div class="form-group"><label>Categoria</label><select id="edit-prod-categoria"><option value="benzine"' + (prod.categoria === 'benzine' ? ' selected' : '') + '>Benzine</option><option value="altro"' + (prod.categoria === 'altro' ? ' selected' : '') + '>Altro</option></select></div>';
  html += '<div class="form-group"><label>IVA %</label><select id="edit-prod-iva"><option value="22"' + (prod.iva_default === 22 ? ' selected' : '') + '>22%</option><option value="10"' + (prod.iva_default === 10 ? ' selected' : '') + '>10%</option><option value="4"' + (prod.iva_default === 4 ? ' selected' : '') + '>4%</option></select></div>';
  html += '<div class="form-group"><label>Colore</label><input type="color" id="edit-prod-colore" value="' + (prod.colore || '#888888') + '" /></div>';
  html += '<div class="form-group"><label>Tipo cisterna</label><input type="text" id="edit-prod-cisterna" value="' + esc(prod.tipo_cisterna || '') + '" /></div>';
  html += '<div class="form-group"><label>Capacità max</label><input type="number" id="edit-prod-capacita" value="' + (prod.capacita_default || 0) + '" /></div>';
  html += '<div class="form-group"><label>Unità misura</label><select id="edit-prod-unita"><option value="litri"' + (prod.unita_misura !== 'pezzi' ? ' selected' : '') + '>Litri</option><option value="pezzi"' + (prod.unita_misura === 'pezzi' ? ' selected' : '') + '>Pezzi</option></select></div>';
  html += '<div class="form-group"><label>Ordine visual.</label><input type="number" id="edit-prod-ordine" value="' + (prod.ordine_visualizzazione || 0) + '" /></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary" onclick="confermaEditaProdotto(\'' + id + '\')">Salva</button><button class="btn-secondary" onclick="chiudiModal()">Annulla</button></div>';
  apriModal(html);
}

async function confermaEditaProdotto(id) {
  const record = {
    nome: document.getElementById('edit-prod-nome').value.trim(),
    categoria: document.getElementById('edit-prod-categoria').value,
    iva_default: parseInt(document.getElementById('edit-prod-iva').value),
    colore: document.getElementById('edit-prod-colore').value,
    tipo_cisterna: document.getElementById('edit-prod-cisterna').value.trim() || null,
    capacita_default: parseFloat(document.getElementById('edit-prod-capacita').value) || 0,
    unita_misura: document.getElementById('edit-prod-unita').value,
    ordine_visualizzazione: parseInt(document.getElementById('edit-prod-ordine').value) || 0
  };
  if (!record.nome) { toast('Nome obbligatorio'); return; }
  const { error } = await sb.from('prodotti').update(record).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Prodotto aggiornato!');
  chiudiModal();
  caricaProdotti();
}

async function eliminaProdotto(id) {
  const prod = cacheProdotti.find(p => p.id === id);
  if (!confirm('Eliminare il prodotto "' + (prod?.nome || '') + '"?\n\nATTENZIONE: funziona solo se non ci sono ordini con questo prodotto.')) return;
  const { error } = await sb.from('prodotti').delete().eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Prodotto eliminato');
  caricaProdotti();
}

// ── STAZIONE OPPIDO ──────────────────────────────────────────────
function switchStazioneTab(btn) {
  document.querySelectorAll('.stz-tab').forEach(b => { b.style.background='var(--bg)'; b.style.color='var(--text)'; b.style.border='0.5px solid var(--border)'; b.classList.remove('active'); });
  btn.style.background=''; btn.style.color=''; btn.style.border=''; btn.classList.add('active');
  document.querySelectorAll('.stz-panel').forEach(p => p.style.display='none');
  document.getElementById(btn.dataset.tab).style.display='';
  const loaders = { 'stz-dashboard':caricaStazioneDashboard, 'stz-letture':caricaTabLetture, 'stz-prezzi':caricaTabPrezzi, 'stz-versamenti':caricaTabVersamenti, 'stz-magazzino':caricaMagazzinoStazione, 'stz-report':initReportStazione };
  if (loaders[btn.dataset.tab]) loaders[btn.dataset.tab]();
}

async function caricaStazione() {
  // Init date fields
  document.getElementById('stz-data-lettura').value = oggiISO;
  document.getElementById('stz-data-lettura').onchange = function() { caricaFormLetture(); };
  document.getElementById('stz-data-prezzo').value = oggiISO;
  document.getElementById('stz-data-vers').value = oggiISO;
  caricaStazioneDashboard();
  _popolaSelAnnoGiac('giac-stz-anno');
}

// ── Dashboard ──
async function caricaOrdiniDaCaricare() {
  const { data: ordini } = await sb.from('ordini').select('*').eq('tipo_ordine','stazione_servizio').eq('stato','confermato').or('ricevuto_stazione.eq.false,ricevuto_stazione.is.null').order('data',{ascending:false});
  const el = document.getElementById('stz-da-caricare');
  if (!el) return;
  if (!ordini || !ordini.length) { el.innerHTML = ''; return; }

  let html = '<div class="card" style="border-left:4px solid #6B5FCC">';
  html += '<div class="card-title" style="color:#6B5FCC">📦 Ordini in arrivo — da ricevere in cisterna (' + ordini.length + ')</div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Prodotto</th><th>Litri</th><th>Fornitore</th><th>Stato</th><th></th></tr></thead><tbody>';
  ordini.forEach(function(r) {
    const dataFmt = new Date(r.data).toLocaleDateString('it-IT');
    const _pi = cacheProdotti.find(function(p) { return p.nome === r.prodotto; });
    const colore = _pi ? _pi.colore : '#888';
    html += '<tr>' +
      '<td>' + dataFmt + '</td>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span>' + esc(r.prodotto) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td>' +
      '<td>' + esc(r.fornitore) + '</td>' +
      '<td>' + badgeStato(r.stato) + '</td>' +
      '<td><button class="btn-primary" style="font-size:11px;padding:4px 12px;background:#639922" onclick="riceviOrdineStazione(\'' + r.id + '\',' + r.litri + ',\'' + esc(r.prodotto) + '\')">📦 Ricevi</button></td>' +
      '</tr>';
  });
  html += '</tbody></table></div></div>';
  el.innerHTML = html;
}

async function riceviOrdineStazione(ordineId, litri, prodotto) {
  // Trova cisterne stazione per questo prodotto
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','stazione_oppido').eq('prodotto',prodotto).order('nome');
  if (!cisterne || !cisterne.length) { toast('Nessuna cisterna trovata per ' + prodotto + ' alla stazione'); return; }

  const prodInfo = cacheProdotti.find(p => p.nome === prodotto);
  const colore = prodInfo ? prodInfo.colore : '#888';
  const totLitri = Number(litri);

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">📦 Ricezione ' + esc(prodotto) + '</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px">Quantità da caricare: <strong style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</strong></div>';

  html += '<div style="margin-bottom:12px">';
  cisterne.forEach(c => {
    const capMax = Number(c.capacita_max);
    const livAtt = Number(c.livello_attuale);
    const spazio = Math.max(0, capMax - livAtt);
    const pct = capMax > 0 ? Math.round((livAtt / capMax) * 100) : 0;
    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:10px;padding:12px;margin-bottom:8px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">';
    html += '<div><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:6px"></span><strong>' + esc(c.nome) + '</strong></div>';
    html += '<span style="font-size:11px;color:var(--text-muted)">' + pct + '% — ' + fmtL(livAtt) + ' / ' + fmtL(capMax) + ' — spazio: <strong>' + fmtL(spazio) + '</strong></span>';
    html += '</div>';
    html += '<div style="height:6px;background:var(--border);border-radius:3px;margin-bottom:8px"><div style="height:100%;width:' + pct + '%;background:' + colore + ';border-radius:3px;opacity:0.7"></div></div>';
    html += '<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span style="font-size:12px;width:80px">Litri da caricare:</span><input type="number" class="stz-ricevi-input" data-cisterna="' + c.id + '" data-spazio="' + spazio + '" value="0" min="0" max="' + (capMax * 1.1) + '" step="100" oninput="calcolaRicezioneStazione(' + totLitri + ')" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:8px 12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text);width:140px;max-width:100%;text-align:right" /></div>';
    html += '</div>';
  });
  html += '</div>';

  html += '<div id="stz-ricevi-totale" style="padding:10px 14px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border);margin-bottom:12px;font-size:13px"></div>';
  html += '<div style="display:flex;gap:8px"><button class="btn-primary" style="flex:1;background:#639922" onclick="confermaRicezioneStazione(\'' + ordineId + '\',' + totLitri + ')">✅ Conferma ricezione</button><button class="btn-secondary" onclick="chiudiModal()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button></div>';

  apriModal(html);
  calcolaRicezioneStazione(totLitri);
}

function calcolaRicezioneStazione(totLitri) {
  const inputs = document.querySelectorAll('.stz-ricevi-input');
  let totAssegnati = 0;
  inputs.forEach(inp => { totAssegnati += parseFloat(inp.value) || 0; });
  const diff = totLitri - totAssegnati;
  const el = document.getElementById('stz-ricevi-totale');
  if (el) {
    const ok = Math.abs(diff) < 0.01;
    el.innerHTML = '<div style="display:flex;justify-content:space-between"><span>Assegnati: <strong style="font-family:var(--font-mono)">' + fmtL(totAssegnati) + '</strong> / ' + fmtL(totLitri) + '</span><span style="color:' + (ok ? '#639922' : '#E24B4A') + ';font-weight:600">' + (ok ? '✅ OK' : (diff > 0 ? '⚠ Rimangono ' + fmtL(diff) : '⚠ Eccesso di ' + fmtL(-diff))) + '</span></div>';
  }
}

async function confermaRicezioneStazione(ordineId, totLitri) {
  const inputs = document.querySelectorAll('.stz-ricevi-input');
  let totAssegnati = 0;
  inputs.forEach(inp => { totAssegnati += parseFloat(inp.value) || 0; });
  if (Math.abs(totLitri - totAssegnati) > 0.5) {
    if (!confirm('I litri assegnati (' + fmtL(totAssegnati) + ') non corrispondono al totale ordine (' + fmtL(totLitri) + '). Procedere comunque?')) return;
  }

  for (const inp of inputs) {
    const val = parseFloat(inp.value) || 0;
    if (val <= 0) continue;
    const cisId = inp.dataset.cisterna;
    const { data: cis } = await sb.from('cisterne').select('livello_attuale').eq('id', cisId).single();
    if (!cis) continue;
    const nuovoLivello = Number(cis.livello_attuale) + val;
    const { error } = await sb.from('cisterne').update({ livello_attuale: nuovoLivello, updated_at: new Date().toISOString() }).eq('id', cisId);
    if (error) { toast('Errore cisterna: ' + error.message); return; }
  }

  const { error } = await sb.from('ordini').update({ ricevuto_stazione: true }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }

  toast('✅ ' + fmtL(totAssegnati) + ' ricevuti nella stazione!');
  chiudiModal();
  caricaOrdiniDaCaricare();
  caricaStazioneDashboard();
}

async function caricaStazioneDashboard() {
  // Ordini confermati da caricare in cisterna
  await caricaOrdiniDaCaricare();

  const oggi = oggiISO;
  const inizioMese = oggi.substring(0,8) + '01';
  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  const pompeIds = (pompe||[]).map(p=>p.id);
  if (!pompeIds.length) return;

  // Letture del mese
  const { data: letture } = await sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).gte('data',inizioMese).order('data');
  // Prezzi del mese
  const { data: prezzi } = await sb.from('stazione_prezzi').select('*').gte('data',inizioMese).order('data');
  // Versamenti del mese
  const { data: versamenti } = await sb.from('stazione_versamenti').select('*').gte('data',inizioMese).order('data');
  // Lettura del giorno prima dell'inizio mese per calcolo primo giorno
  const giornoPrec = new Date(new Date(inizioMese).getTime()-86400000).toISOString().split('T')[0];
  const { data: lettPrec } = await sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).eq('data',giornoPrec);

  const tutteLetture = [...(lettPrec||[]), ...(letture||[])];
  const prezziMap = {};
  (prezzi||[]).forEach(p => { prezziMap[p.data+'_'+p.prodotto] = p.prezzo_litro; });

  // Calcola vendite per giorno
  const venditeGiorno = {};
  const dateUniche = [...new Set((letture||[]).map(l=>l.data))].sort();
  dateUniche.forEach(data => {
    let totLitriG=0, totLitriB=0, incasso=0;
    (pompe||[]).forEach(pompa => {
      const lettOggi = tutteLetture.find(l=>l.pompa_id===pompa.id && l.data===data);
      // Trova lettura precedente
      const datePrecedenti = tutteLetture.filter(l=>l.pompa_id===pompa.id && l.data<data).map(l=>l.data).sort();
      const dataPrec = datePrecedenti.length ? datePrecedenti[datePrecedenti.length-1] : null;
      const lettIeri = dataPrec ? tutteLetture.find(l=>l.pompa_id===pompa.id && l.data===dataPrec) : null;
      if (lettOggi && lettIeri) {
        const litri = Number(lettOggi.lettura) - Number(lettIeri.lettura);
        if (litri > 0) {
          const prezzo = Number(prezziMap[data+'_'+pompa.prodotto] || 0);
          if (pompa.prodotto === 'Gasolio Autotrazione') totLitriG += litri;
          else totLitriB += litri;
          incasso += litri * prezzo;
        }
      }
    });
    const vers = (versamenti||[]).filter(v=>v.data===data);
    const totVers = vers.reduce((s,v)=>s+Number(v.contanti||0)+Number(v.pos||0),0);
    venditeGiorno[data] = { gasolio:totLitriG, benzina:totLitriB, totale:totLitriG+totLitriB, incasso, versamento:totVers };
  });

  // KPI oggi
  const vOggi = venditeGiorno[oggi] || { gasolio:0, benzina:0, totale:0, incasso:0 };
  document.getElementById('stz-litri-oggi').textContent = fmtL(vOggi.totale);
  document.getElementById('stz-incasso-oggi').textContent = fmtE(vOggi.incasso);

  // KPI mese
  let totLitriMese=0, totIncassoMese=0;
  Object.values(venditeGiorno).forEach(v => { totLitriMese+=v.totale; totIncassoMese+=v.incasso; });
  document.getElementById('stz-litri-mese').textContent = fmtL(totLitriMese);
  document.getElementById('stz-incasso-mese').textContent = fmtE(totIncassoMese);

  // KPI versamenti mese
  const totCash = (versamenti||[]).reduce((s,v)=>s+Number(v.contanti||0),0);
  const totPos = (versamenti||[]).reduce((s,v)=>s+Number(v.pos||0),0);
  document.getElementById('stz-vers-contanti').textContent = fmtE(totCash);
  document.getElementById('stz-vers-pos').textContent = fmtE(totPos);

  // Tabella ultimi 7 giorni
  const tbody = document.getElementById('stz-dash-tabella');
  const ultimi7 = dateUniche.slice(-7).reverse();
  if (!ultimi7.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun dato</td></tr>'; return; }
  tbody.innerHTML = ultimi7.map(data => {
    const v = venditeGiorno[data];
    return '<tr><td>' + data + '</td><td style="font-family:var(--font-mono)">' + fmtL(v.gasolio) + '</td><td style="font-family:var(--font-mono)">' + fmtL(v.benzina) + '</td><td style="font-family:var(--font-mono);font-weight:bold">' + fmtL(v.totale) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.incasso) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.versamento) + '</td></tr>';
  }).join('');
}

// ── Letture contatori ──
async function caricaTabLetture() {
  await caricaFormLetture();
  await caricaStoricoLetture();
}

async function caricaFormLetture() {
  const data = document.getElementById('stz-data-lettura').value || oggiISO;
  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  if (!pompe||!pompe.length) { document.getElementById('stz-form-letture').innerHTML='<div class="loading">Nessuna pompa configurata</div>'; return; }

  // Carica letture oggi + precedenti in parallelo
  const pompeIds = pompe.map(p=>p.id);
  const ieri = new Date(new Date(data).getTime()-86400000).toISOString().split('T')[0];
  const [lettOggiRes, lettPrecRes, prezziRes] = await Promise.all([
    sb.from('stazione_letture').select('*').eq('data',data).in('pompa_id',pompeIds),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).lte('data',ieri).order('data',{ascending:false}),
    sb.from('stazione_prezzi').select('*').eq('data',data)
  ]);
  const lettMap = {}; (lettOggiRes.data||[]).forEach(l => lettMap[l.pompa_id]=Number(l.lettura));
  // Per ogni pompa, prendi l'ultima lettura precedente
  const lettIeriMap = {};
  pompe.forEach(p => {
    const ultima = (lettPrecRes.data||[]).find(l=>l.pompa_id===p.id);
    if (ultima) lettIeriMap[p.id] = Number(ultima.lettura);
  });
  const prezzoMap = {}; (prezziRes.data||[]).forEach(pr => prezzoMap[pr.prodotto]=Number(pr.prezzo_litro));

  // Salva dati per calcolo live e report
  window._stzPompe = pompe;
  window._stzIeriMap = lettIeriMap;
  window._stzPrezzoMap = prezzoMap;
  window._stzData = data;

  let html = '';
  pompe.forEach(p => {
    const val = lettMap[p.id] !== undefined ? lettMap[p.id] : '';
    const precVal = lettIeriMap[p.id];
    const _pi = cacheProdotti.find(pp=>pp.nome===p.prodotto); const colore = _pi ? _pi.colore : '#888';
    const precLabel = precVal !== undefined ? _sep(precVal.toLocaleString('it-IT', {maximumFractionDigits:2})) : '—';
    const prezzo = prezzoMap[p.prodotto] || 0;

    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:10px;padding:14px;margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:14px">' + esc(p.nome) + '</strong><span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + esc(p.prodotto) + ' · ' + (prezzo ? '€ ' + prezzo.toFixed(3) + '/L' : '<span style="color:#E24B4A">prezzo non impostato</span>') + '</span></div>';
    // Riga precedente (read-only)
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px"><span style="font-size:11px;color:var(--text-muted);width:100px">Giorno prec.:</span><span style="font-family:var(--font-mono);font-size:15px;font-weight:600;color:var(--text-muted)">' + precLabel + '</span></div>';
    // Input lettura oggi
    html += '<div style="display:flex;align-items:center;gap:12px;margin-bottom:6px;flex-wrap:wrap"><span style="font-size:11px;color:var(--text);width:100px">Oggi:</span><input type="number" class="stz-lettura-input" data-pompa="' + p.id + '" data-prodotto="' + esc(p.prodotto) + '" value="' + val + '" placeholder="00000000" step="0.01" max="99999999" oninput="calcolaLettureVendite()" style="font-family:var(--font-mono);font-size:16px;font-weight:600;padding:8px 12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg-card);color:var(--text);width:180px;max-width:100%;text-align:right" /></div>';
    // Risultati calcolati
    html += '<div style="display:flex;gap:16px;font-size:12px;padding-top:6px;border-top:0.5px dashed var(--border)" id="stz-calc-' + p.id + '"><span style="color:var(--text-muted)">Litri: <strong id="stz-litri-' + p.id + '">—</strong></span><span style="color:' + colore + '">Incasso: <strong id="stz-euro-' + p.id + '">—</strong></span></div>';
    html += '</div>';
  });
  document.getElementById('stz-form-letture').innerHTML = html;

  // Calcola subito se ci sono già valori
  calcolaLettureVendite();
}

function calcolaLettureVendite() {
  const pompe = window._stzPompe || [];
  const ieriMap = window._stzIeriMap || {};
  const prezzoMap = window._stzPrezzoMap || {};
  let totLitri = 0, totEuro = 0;

  pompe.forEach(p => {
    const input = document.querySelector('.stz-lettura-input[data-pompa="' + p.id + '"]');
    const elLitri = document.getElementById('stz-litri-' + p.id);
    const elEuro = document.getElementById('stz-euro-' + p.id);
    if (!input || !elLitri || !elEuro) return;

    const valOggi = parseFloat(input.value);
    const valIeri = ieriMap[p.id];
    const prezzo = prezzoMap[p.prodotto] || 0;

    if (!isNaN(valOggi) && valIeri !== undefined) {
      const litri = valOggi - valIeri;
      const euro = litri * prezzo;
      elLitri.textContent = litri >= 0 ? _sep(litri.toLocaleString('it-IT', {maximumFractionDigits:2})) + ' L' : '⚠ negativo';
      elEuro.textContent = prezzo > 0 ? '€ ' + _sep(euro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})) : '—';
      if (litri >= 0) { totLitri += litri; totEuro += euro; }
    } else {
      elLitri.textContent = '—';
      elEuro.textContent = '—';
    }
  });

  // Totali
  const totEl = document.getElementById('stz-totali-letture');
  if (totEl) {
    totEl.innerHTML = '<div style="display:flex;gap:20px;padding:12px 16px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)">' +
      '<div><span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Totale litri</span><div style="font-size:18px;font-weight:700;font-family:var(--font-mono)">' + _sep(totLitri.toLocaleString('it-IT', {maximumFractionDigits:2})) + ' L</div></div>' +
      '<div><span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Totale incasso</span><div style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:#639922">€ ' + _sep(totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2})) + '</div></div>' +
      '</div>';
  }
}

function stampaReportLetture() {
  const pompe = window._stzPompe || [];
  const ieriMap = window._stzIeriMap || {};
  const prezzoMap = window._stzPrezzoMap || {};
  const data = window._stzData || oggiISO;
  const dataFmt = new Date(data).toLocaleDateString('it-IT');

  let righe = '', totLitri = 0, totEuro = 0;
  pompe.forEach(p => {
    const input = document.querySelector('.stz-lettura-input[data-pompa="' + p.id + '"]');
    const valOggi = input ? parseFloat(input.value) : NaN;
    const valIeri = ieriMap[p.id];
    const prezzo = prezzoMap[p.prodotto] || 0;
    const litri = (!isNaN(valOggi) && valIeri !== undefined) ? valOggi - valIeri : 0;
    const euro = litri * prezzo;
    if (litri > 0) { totLitri += litri; totEuro += euro; }
    const _pi = cacheProdotti.find(pp=>pp.nome===p.prodotto); const colore = _pi ? _pi.colore : '#888';

    righe += '<tr>' +
      '<td style="padding:8px;border:1px solid #ddd"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span><strong>' + esc(p.nome) + '</strong></td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + (valIeri !== undefined ? _sep(valIeri.toLocaleString('it-IT',{maximumFractionDigits:2})) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;font-weight:bold">' + (!isNaN(valOggi) ? _sep(valOggi.toLocaleString('it-IT',{maximumFractionDigits:2})) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + _sep(litri.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">€ ' + prezzo.toFixed(3) + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;font-weight:bold">€ ' + _sep(euro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</td>' +
      '</tr>';
  });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Letture Stazione ' + dataFmt + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:12px;margin:0;padding:15mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:10mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}.rpt-kpi{flex-direction:column!important;gap:6px!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#D4A017;color:#fff;padding:8px;font-size:10px;text-transform:uppercase;letter-spacing:0.4px;border:1px solid #B8900F;text-align:center}' +
    '.tot td{border-top:3px solid #D4A017!important;font-weight:bold;font-size:13px;background:#FDF3D0!important}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #D4A017;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#D4A017">LETTURE CONTATORI</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Stazione Oppido — Data: <strong>' + dataFmt + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div></div></div>';

  html += '<div class="rpt-kpi" style="display:flex;gap:12px;margin-bottom:14px">';
  html += '<div style="background:#FDF3D0;border:1px solid #D4A017;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#7A5D00;text-transform:uppercase">Litri totali</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">' + _sep(totLitri.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</div></div>';
  html += '<div style="background:#EAF3DE;border:1px solid #639922;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#27500A;text-transform:uppercase">Incasso totale</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace;color:#639922">€ ' + _sep(totEuro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</div></div>';
  html += '</div>';

  html += '<table><thead><tr><th>Pompa</th><th>Contatore prec.</th><th>Contatore oggi</th><th>Litri venduti</th><th>Prezzo/L</th><th>Incasso €</th></tr></thead><tbody>';
  html += righe;
  html += '<tr class="tot"><td style="padding:8px;border:1px solid #ddd">TOTALE</td><td style="padding:8px;border:1px solid #ddd"></td><td style="padding:8px;border:1px solid #ddd"></td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + _sep(totLitri.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</td><td style="padding:8px;border:1px solid #ddd"></td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">€ ' + _sep(totEuro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</td></tr>';
  html += '</tbody></table>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D4A017;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

async function salvaLetture() {
  const data = document.getElementById('stz-data-lettura').value;
  if (!data) { toast('Seleziona una data'); return; }
  const inputs = document.querySelectorAll('.stz-lettura-input');
  let salvate = 0;
  for (const inp of inputs) {
    const val = parseFloat(inp.value);
    if (isNaN(val)) continue;
    const { error } = await sb.from('stazione_letture').upsert({ pompa_id:inp.dataset.pompa, data, lettura:val }, { onConflict:'pompa_id,data' });
    if (error) { toast('Errore: ' + error.message); return; }
    salvate++;
  }
  if (salvate === 0) { toast('Inserisci almeno una lettura'); return; }
  toast(salvate + ' letture salvate!');
  calcolaLettureVendite();
  caricaStoricoLetture();
}

async function caricaStoricoLetture() {
  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  const { data: letture } = await sb.from('stazione_letture').select('*').order('data',{ascending:false}).limit(50);
  const { data: prezzi } = await sb.from('stazione_prezzi').select('*').order('data',{ascending:false});
  const tbody = document.getElementById('stz-storico-letture');
  if (!letture||!letture.length) { tbody.innerHTML='<tr><td colspan="6" class="loading">Nessuna lettura</td></tr>'; return; }

  const pompeMap = {}; (pompe||[]).forEach(p=>pompeMap[p.id]=p);
  const prezziMap = {}; (prezzi||[]).forEach(p=>{ prezziMap[p.data+'_'+p.prodotto]=p.prezzo_litro; });
  const lettureByPompa = {};
  (letture||[]).forEach(l => { if(!lettureByPompa[l.pompa_id]) lettureByPompa[l.pompa_id]=[]; lettureByPompa[l.pompa_id].push(l); });

  let html = '';
  (letture||[]).forEach(l => {
    const pompa = pompeMap[l.pompa_id];
    if (!pompa) return;
    const _pi = cacheProdotti.find(pp=>pp.nome===pompa.prodotto); const colore = _pi ? _pi.colore : '#888';
    // Trova lettura precedente
    const storPompa = lettureByPompa[l.pompa_id]||[];
    const idx = storPompa.findIndex(s=>s.id===l.id);
    const prec = idx < storPompa.length-1 ? storPompa[idx+1] : null;
    const litri = prec ? Number(l.lettura)-Number(prec.lettura) : null;
    const prezzo = Number(prezziMap[l.data+'_'+pompa.prodotto]||0);
    const incasso = litri && prezzo ? litri*prezzo : null;
    html += '<tr><td>' + l.data + '</td><td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span>' + esc(pompa.nome) + '</td><td style="font-family:var(--font-mono)">' + _sep(Number(l.lettura).toLocaleString('it-IT',{minimumFractionDigits:2})) + '</td><td style="font-family:var(--font-mono);font-weight:bold">' + (litri!==null?fmtL(litri):'—') + '</td><td style="font-family:var(--font-mono)">' + (prezzo?fmt(prezzo):'—') + '</td><td style="font-family:var(--font-mono)">' + (incasso!==null?fmtE(incasso):'—') + '</td></tr>';
  });
  tbody.innerHTML = html;
}

// ── Prezzi pompa ──
async function caricaTabPrezzi() { await caricaStoricoPrezzi(); }

async function salvaPrezziPompa() {
  const data = document.getElementById('stz-data-prezzo').value;
  if (!data) { toast('Seleziona una data'); return; }
  const gasolio = parseFloat(document.getElementById('stz-prezzo-gasolio').value);
  const benzina = parseFloat(document.getElementById('stz-prezzo-benzina').value);
  if (isNaN(gasolio) && isNaN(benzina)) { toast('Inserisci almeno un prezzo'); return; }
  let salvati = 0;
  if (!isNaN(gasolio)) {
    const { error } = await sb.from('stazione_prezzi').upsert({ data, prodotto:'Gasolio Autotrazione', prezzo_litro:gasolio }, { onConflict:'data,prodotto' });
    if (error) { toast('Errore: '+error.message); return; }
    salvati++;
  }
  if (!isNaN(benzina)) {
    const { error } = await sb.from('stazione_prezzi').upsert({ data, prodotto:'Benzina', prezzo_litro:benzina }, { onConflict:'data,prodotto' });
    if (error) { toast('Errore: '+error.message); return; }
    salvati++;
  }
  toast(salvati + ' prezzi salvati!');
  document.getElementById('stz-prezzo-gasolio').value = '';
  document.getElementById('stz-prezzo-benzina').value = '';
  caricaStoricoPrezzi();
}

async function caricaStoricoPrezzi() {
  const { data } = await sb.from('stazione_prezzi').select('*').order('data',{ascending:false}).limit(30);
  const tbody = document.getElementById('stz-storico-prezzi');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="4" class="loading">Nessun prezzo</td></tr>'; return; }
  // Raggruppa per data
  const perData = {};
  data.forEach(r => { if(!perData[r.data]) perData[r.data]={}; perData[r.data][r.prodotto]=r; });
  tbody.innerHTML = Object.entries(perData).sort((a,b)=>b[0].localeCompare(a[0])).map(([data,prodotti]) => {
    const g = prodotti['Gasolio Autotrazione'];
    const b = prodotti['Benzina'];
    return '<tr><td>' + data + '</td><td style="font-family:var(--font-mono)">' + (g?'€ '+Number(g.prezzo_litro).toFixed(3):'—') + '</td><td style="font-family:var(--font-mono)">' + (b?'€ '+Number(b.prezzo_litro).toFixed(3):'—') + '</td><td><button class="btn-danger" onclick="eliminaPrezziPompa(\''+data+'\')">x</button></td></tr>';
  }).join('');
}

async function eliminaPrezziPompa(data) {
  if (!confirm('Eliminare i prezzi del ' + data + '?')) return;
  await sb.from('stazione_prezzi').delete().eq('data',data);
  toast('Prezzi eliminati');
  caricaStoricoPrezzi();
}

// ── Versamenti ──
async function caricaTabVersamenti() { await caricaStoricoVersamenti(); }

async function salvaVersamento() {
  const data = document.getElementById('stz-data-vers').value;
  if (!data) { toast('Seleziona una data'); return; }
  const contanti = parseFloat(document.getElementById('stz-vers-cash').value) || 0;
  const pos = parseFloat(document.getElementById('stz-vers-pos-input').value) || 0;
  if (contanti === 0 && pos === 0) { toast('Inserisci almeno un importo'); return; }
  const note = document.getElementById('stz-vers-note').value.trim();
  const { error } = await sb.from('stazione_versamenti').insert([{ data, contanti, pos, note: note || null }]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('Versamento salvato! Totale: ' + fmtE(contanti+pos));
  document.getElementById('stz-vers-cash').value = '';
  document.getElementById('stz-vers-pos-input').value = '';
  document.getElementById('stz-vers-note').value = '';
  caricaStoricoVersamenti();
}

async function caricaStoricoVersamenti() {
  const { data } = await sb.from('stazione_versamenti').select('*').order('data',{ascending:false}).limit(30);
  const tbody = document.getElementById('stz-storico-versamenti');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="6" class="loading">Nessun versamento</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const tot = Number(r.contanti||0)+Number(r.pos||0);
    return '<tr><td>' + r.data + '</td><td style="font-family:var(--font-mono)">' + fmtE(r.contanti||0) + '</td><td style="font-family:var(--font-mono)">' + fmtE(r.pos||0) + '</td><td style="font-family:var(--font-mono);font-weight:bold">' + fmtE(tot) + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-danger" onclick="eliminaVersamento(\''+r.id+'\')">x</button></td></tr>';
  }).join('');
}

async function eliminaVersamento(id) {
  if (!confirm('Eliminare questo versamento?')) return;
  await sb.from('stazione_versamenti').delete().eq('id',id);
  toast('Versamento eliminato');
  caricaStoricoVersamenti();
}

// ── Magazzino stazione ──
async function caricaMagazzinoStazione() {
  await caricaTabelaPompe();
  await caricaGiacenzeStazione();
  caricaRettifiche('stazione');
}

async function caricaTabelaPompe() {
  // Popola dropdown prodotti
  const sel = document.getElementById('stz-pompa-prodotto');
  if (sel) {
    sel.innerHTML = cacheProdotti.filter(p => p.attivo && p.categoria === 'benzine').map(p => '<option value="' + esc(p.nome) + '">' + esc(p.nome) + '</option>').join('');
  }

  const { data: pompe } = await sb.from('stazione_pompe').select('*').order('ordine');
  const tbody = document.getElementById('stz-tabella-pompe');
  if (!pompe || !pompe.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading">Nessuna pompa</td></tr>'; return; }
  tbody.innerHTML = pompe.map(p => {
    const prodInfo = cacheProdotti.find(pr => pr.nome === p.prodotto);
    const colore = prodInfo ? prodInfo.colore : '#888';
    const statoBadge = p.attiva ? '<span class="badge green">Attiva</span>' : '<span class="badge red">Disattiva</span>';
    return '<tr>' +
      '<td style="font-family:var(--font-mono)">' + p.ordine + '</td>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:6px"></span><strong>' + esc(p.nome) + '</strong></td>' +
      '<td>' + esc(p.prodotto) + '</td>' +
      '<td>' + statoBadge + '</td>' +
      '<td>' +
        '<button class="btn-edit" onclick="editaPompa(\'' + p.id + '\')" title="Modifica">✏️</button>' +
        '<button class="btn-edit" onclick="togglePompa(\'' + p.id + '\',' + p.attiva + ')" title="' + (p.attiva ? 'Disattiva' : 'Attiva') + '">' + (p.attiva ? '🔒' : '🔓') + '</button>' +
        '<button class="btn-danger" onclick="eliminaPompa(\'' + p.id + '\',\'' + esc(p.nome) + '\')">x</button>' +
      '</td></tr>';
  }).join('');
}

async function salvaPompa() {
  const nome = document.getElementById('stz-pompa-nome').value.trim();
  const prodotto = document.getElementById('stz-pompa-prodotto').value;
  if (!nome) { toast('Inserisci un nome per la pompa'); return; }
  if (!prodotto) { toast('Seleziona un prodotto'); return; }
  // Calcola ordine successivo
  const { data: existing } = await sb.from('stazione_pompe').select('ordine').order('ordine',{ascending:false}).limit(1);
  const nextOrdine = existing && existing.length ? existing[0].ordine + 1 : 1;
  const { error } = await sb.from('stazione_pompe').insert([{ nome, prodotto, ordine: nextOrdine }]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Pompa "' + nome + '" aggiunta!');
  document.getElementById('stz-pompa-nome').value = '';
  caricaTabelaPompe();
}

async function editaPompa(id) {
  const { data: p } = await sb.from('stazione_pompe').select('*').eq('id', id).single();
  if (!p) return;
  const opzProd = cacheProdotti.filter(pr => pr.attivo && pr.categoria === 'benzine').map(pr =>
    '<option value="' + esc(pr.nome) + '"' + (pr.nome === p.prodotto ? ' selected' : '') + '>' + esc(pr.nome) + '</option>'
  ).join('');
  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Modifica pompa: ' + esc(p.nome) + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Nome</label><input type="text" id="edit-pompa-nome" value="' + esc(p.nome) + '" /></div>';
  html += '<div class="form-group"><label>Prodotto</label><select id="edit-pompa-prodotto">' + opzProd + '</select></div>';
  html += '<div class="form-group"><label>Ordine</label><input type="number" id="edit-pompa-ordine" value="' + p.ordine + '" /></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:12px"><button class="btn-primary" onclick="confermaEditaPompa(\'' + id + '\')">Salva</button><button class="btn-secondary" onclick="chiudiModal()">Annulla</button></div>';
  apriModal(html);
}

async function confermaEditaPompa(id) {
  const nome = document.getElementById('edit-pompa-nome').value.trim();
  const prodotto = document.getElementById('edit-pompa-prodotto').value;
  const ordine = parseInt(document.getElementById('edit-pompa-ordine').value) || 0;
  if (!nome) { toast('Nome obbligatorio'); return; }
  const { error } = await sb.from('stazione_pompe').update({ nome, prodotto, ordine }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Pompa aggiornata!');
  chiudiModal();
  caricaTabelaPompe();
}

async function togglePompa(id, attiva) {
  const { error } = await sb.from('stazione_pompe').update({ attiva: !attiva }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast(attiva ? 'Pompa disattivata' : 'Pompa attivata');
  caricaTabelaPompe();
}

async function eliminaPompa(id, nome) {
  if (!confirm('Eliminare la pompa "' + nome + '"?\n\nATTENZIONE: le letture associate verranno perse.')) return;
  await sb.from('stazione_letture').delete().eq('pompa_id', id);
  const { error } = await sb.from('stazione_pompe').delete().eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Pompa eliminata');
  caricaTabelaPompe();
}

async function caricaGiacenzeStazione() {
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','stazione_oppido').order('tipo').order('nome');

  let cisHtmlAll = '';
  if (cisterne && cisterne.length) {
    const perProdotto = {};
    cisterne.forEach(c => {
      if (!perProdotto[c.prodotto]) perProdotto[c.prodotto] = [];
      perProdotto[c.prodotto].push(c);
    });

    Object.entries(perProdotto).forEach(([prodNome, gruppo]) => {
      const prodInfo = cacheProdotti.find(p => p.nome === prodNome);
      const colore = prodInfo ? prodInfo.colore : '#888';
      const nCis = gruppo.length;
      const capGruppo = gruppo.reduce((s, c) => s + Number(c.capacita_max), 0);
      let totG = 0;

      let cisHtml = '';
      gruppo.forEach(c => {
        const capMax = Number(c.capacita_max);
        const livAtt = Number(c.livello_attuale);
        const pct = capMax > 0 ? Math.round((livAtt / capMax) * 100) : 0;
        totG += livAtt;
        cisHtml += '<div class="dep-cisterna' + (pct < 30 ? ' alert' : '') + '">' +
          '<div class="dep-cisterna-name">' + c.nome + '</div>' +
          cisternasvg(pct, colore) +
          '<div class="dep-cisterna-litri">' + _sep(livAtt.toLocaleString('it-IT')) + ' L</div>' +
          '<div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(capMax.toLocaleString('it-IT')) + ' L</div>' +
          '</div>';
      });

      const subLabel = nCis + (nCis === 1 ? ' cisterna' : ' cisterne') + ' · ' + _sep(capGruppo.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
      cisHtmlAll += '<div style="margin-bottom:12px"><div class="dep-product-header"><div class="dep-product-dot" style="background:' + colore + '"></div><div><div class="dep-product-title">' + esc(prodNome) + '</div><div class="dep-product-sub">' + subLabel + '</div></div><div class="dep-product-total">' + fmtL(totG) + '</div></div><div class="dep-cisterne-grid">' + cisHtml + '</div></div>';
    });
  } else {
    cisHtmlAll = '<div class="loading">Nessuna cisterna configurata per la stazione</div>';
  }
  const elCis = document.getElementById('stz-cisterne-grafiche');
  if (elCis) elCis.innerHTML = cisHtmlAll;

  // Popola dropdown anni
  const selAnno = document.getElementById('stz-acq-anno');
  if (selAnno && selAnno.options.length <= 1) {
    const annoCorr = new Date().getFullYear();
    for (let y = annoCorr; y >= annoCorr - 5; y--) {
      selAnno.innerHTML += '<option value="' + y + '">' + y + '</option>';
    }
  }

  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  const { data: links } = await sb.from('pompe_cisterne').select('*, stazione_pompe(nome), cisterne(nome)');
  let linkHtml = '';
  if (pompe && pompe.length) {
    linkHtml += '<div style="font-size:12px;font-weight:600;color:var(--text-muted);margin-bottom:8px">collegamento pompe e cisterne</div>';
    linkHtml += '<div style="display:flex;flex-wrap:wrap;gap:10px">';
    pompe.forEach(p => {
      const prodInfo = cacheProdotti.find(pr => pr.nome === p.prodotto);
      const colore = prodInfo ? prodInfo.colore : '#888';
      const collegati = (links||[]).filter(l => l.pompa_id === p.id).map(l => l.cisterne?.nome || '?');
      linkHtml += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 14px;min-width:180px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:4px"><div style="width:8px;height:8px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:13px">' + esc(p.nome) + '</strong></div>' +
        '<div style="font-size:11px;color:var(--text-muted)">' + (collegati.length ? collegati.join(', ') : 'Nessuna cisterna') + '</div>' +
        '</div>';
    });
    linkHtml += '</div>';
  }
  document.getElementById('stz-magazzino-content').innerHTML = linkHtml;
}

async function stampaReportAcquistiStazione() {
  // Leggi filtri
  const anno = document.getElementById('stz-acq-anno').value;
  const da = document.getElementById('stz-acq-da').value;
  const a = document.getElementById('stz-acq-a').value;

  let query = sb.from('ordini').select('*').eq('tipo_ordine','stazione_servizio').neq('stato','annullato');
  let periodoLabel = 'Tutti i dati';
  if (da && a) {
    query = query.gte('data', da).lte('data', a);
    periodoLabel = 'Dal ' + new Date(da).toLocaleDateString('it-IT') + ' al ' + new Date(a).toLocaleDateString('it-IT');
  } else if (anno) {
    query = query.gte('data', anno + '-01-01').lte('data', anno + '-12-31');
    periodoLabel = 'Anno ' + anno;
  }
  const { data: ordini } = await query.order('data',{ascending:false});
  if (!ordini || !ordini.length) { toast('Nessun acquisto trovato per il periodo selezionato'); return; }

  let totLitri = 0, totValore = 0;
  let righeHtml = '';
  ordini.forEach(function(r, i) {
    var litri = Number(r.litri);
    var costoTot = Number(r.costo_litro) * litri;
    totLitri += litri;
    totValore += costoTot;
    var dataFmt = new Date(r.data).toLocaleDateString('it-IT');
    righeHtml += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + dataFmt + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(r.prodotto) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(litri) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmt(Number(r.costo_litro)) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtE(costoTot) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(r.fornitore) + '</td>' +
      '</tr>';
  });

  // Riepilogo per anno e prodotto
  var perAnno = {};
  ordini.forEach(function(r) {
    var anno = r.data.substring(0,4);
    if (!perAnno[anno]) perAnno[anno] = {};
    if (!perAnno[anno][r.prodotto]) perAnno[anno][r.prodotto] = { litri:0, valore:0, ordini:0 };
    perAnno[anno][r.prodotto].litri += Number(r.litri);
    perAnno[anno][r.prodotto].valore += Number(r.costo_litro) * Number(r.litri);
    perAnno[anno][r.prodotto].ordini++;
  });

  var riepilogoHtml = '';
  Object.keys(perAnno).sort().reverse().forEach(function(anno) {
    riepilogoHtml += '<tr><td colspan="4" style="padding:8px;border:1px solid #ddd;background:#f5f5f5;font-weight:bold">' + anno + '</td></tr>';
    Object.entries(perAnno[anno]).forEach(function(entry) {
      var prod = entry[0], v = entry[1];
      riepilogoHtml += '<tr><td style="padding:6px 8px;border:1px solid #ddd;padding-left:20px">' + esc(prod) + '</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + v.ordini + '</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(v.litri) + '</td><td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(v.valore) + '</td></tr>';
    });
  });

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acquisti Stazione Oppido</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:15mm}' +
    '@media print{.no-print{display:none!important}@page{size:portrait;margin:10mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}.rpt-kpi{flex-direction:column!important;gap:6px!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:16px}' +
    'th{background:#6B5FCC;color:#fff;padding:8px 6px;font-size:9px;text-transform:uppercase;letter-spacing:0.4px;border:1px solid #5A4FBB;text-align:center}' +
    '.tot td{border-top:3px solid #6B5FCC!important;font-weight:bold;font-size:12px;background:#EEEDFE!important}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#6B5FCC">ACQUISTI STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Periodo: <strong>' + periodoLabel + '</strong> — Ordini: <strong>' + ordini.length + '</strong> — Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div></div></div>';

  html += '<div class="rpt-kpi" style="display:flex;gap:12px;margin-bottom:14px">';
  html += '<div style="background:#EEEDFE;border:1px solid #6B5FCC;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#26215C;text-transform:uppercase">Litri totali</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">' + fmtL(totLitri) + '</div></div>';
  html += '<div style="background:#EEEDFE;border:1px solid #6B5FCC;border-radius:6px;padding:12px 20px;text-align:center"><div style="font-size:9px;color:#26215C;text-transform:uppercase">Valore totale</div><div style="font-size:20px;font-weight:bold;font-family:Courier New,monospace">' + fmtE(totValore) + '</div></div>';
  html += '</div>';

  html += '<div style="font-size:12px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;text-transform:uppercase">Riepilogo per anno</div>';
  html += '<table><thead><tr><th>Prodotto</th><th>Ordini</th><th>Litri</th><th>Valore</th></tr></thead><tbody>' + riepilogoHtml + '</tbody></table>';

  html += '<div style="font-size:12px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;text-transform:uppercase">Dettaglio ordini</div>';
  html += '<table><thead><tr><th>#</th><th>Data</th><th>Prodotto</th><th>Litri</th><th>Costo/L</th><th>Totale</th><th>Fornitore</th></tr></thead><tbody>';
  html += righeHtml;
  html += '<tr class="tot"><td style="padding:8px;border:1px solid #ddd" colspan="3">TOTALE</td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:8px;border:1px solid #ddd"></td><td style="padding:8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totValore) + '</td><td style="padding:8px;border:1px solid #ddd"></td></tr>';
  html += '</tbody></table>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

// ── Report stazione ──
function initReportStazione() {
  const oggi = new Date();
  document.getElementById('stz-report-da').value = oggi.toISOString().substring(0,8) + '01';
  document.getElementById('stz-report-a').value = oggiISO;
}

async function generaReportStazione() {
  const da = document.getElementById('stz-report-da').value;
  const a = document.getElementById('stz-report-a').value;
  if (!da || !a) { toast('Seleziona le date'); return; }

  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  const pompeIds = (pompe||[]).map(p=>p.id);
  const { data: letture } = await sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).gte('data',da).lte('data',a).order('data');
  const { data: prezzi } = await sb.from('stazione_prezzi').select('*').gte('data',da).lte('data',a);
  const { data: versamenti } = await sb.from('stazione_versamenti').select('*').gte('data',da).lte('data',a);
  // Lettura precedente al periodo
  const giornoPre = new Date(new Date(da).getTime()-86400000).toISOString().split('T')[0];
  const { data: lettPre } = await sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).lte('data',giornoPre).order('data',{ascending:false});

  const prezziMap = {}; (prezzi||[]).forEach(p=>{ prezziMap[p.data+'_'+p.prodotto]=p.prezzo_litro; });
  const tutteLetture = [...(lettPre||[]), ...(letture||[])];
  let totGasolio=0, totBenzina=0, totIncasso=0;

  const dateUniche = [...new Set((letture||[]).map(l=>l.data))].sort();
  let righeHtml = '';
  dateUniche.forEach(data => {
    let gG=0, gB=0, inc=0;
    (pompe||[]).forEach(pompa => {
      const lettOggi = tutteLetture.find(l=>l.pompa_id===pompa.id && l.data===data);
      const datePrecedenti = tutteLetture.filter(l=>l.pompa_id===pompa.id && l.data<data).map(l=>l.data).sort();
      const dataPrec = datePrecedenti.length ? datePrecedenti[datePrecedenti.length-1] : null;
      const lettIeri = dataPrec ? tutteLetture.find(l=>l.pompa_id===pompa.id && l.data===dataPrec) : null;
      if (lettOggi && lettIeri) {
        const litri = Number(lettOggi.lettura) - Number(lettIeri.lettura);
        if (litri > 0) {
          const prezzo = Number(prezziMap[data+'_'+pompa.prodotto]||0);
          if (pompa.prodotto==='Gasolio Autotrazione') gG+=litri; else gB+=litri;
          inc += litri*prezzo;
        }
      }
    });
    totGasolio+=gG; totBenzina+=gB; totIncasso+=inc;
    righeHtml += '<tr><td>'+data+'</td><td style="font-family:var(--font-mono)">'+fmtL(gG)+'</td><td style="font-family:var(--font-mono)">'+fmtL(gB)+'</td><td style="font-family:var(--font-mono);font-weight:bold">'+fmtL(gG+gB)+'</td><td style="font-family:var(--font-mono)">'+fmtE(inc)+'</td></tr>';
  });

  const totCash = (versamenti||[]).reduce((s,v)=>s+Number(v.contanti||0),0);
  const totPosV = (versamenti||[]).reduce((s,v)=>s+Number(v.pos||0),0);

  let html = '<div class="grid4" style="margin-bottom:12px">';
  html += '<div class="kpi"><div class="kpi-label">Gasolio</div><div class="kpi-value">' + fmtL(totGasolio) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Benzina</div><div class="kpi-value">' + fmtL(totBenzina) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Incasso totale</div><div class="kpi-value">' + fmtE(totIncasso) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Versamenti</div><div class="kpi-value">' + fmtE(totCash+totPosV) + '</div></div>';
  html += '</div>';
  html += '<div class="grid2" style="margin-bottom:12px"><div class="kpi"><div class="kpi-label">Contanti</div><div class="kpi-value">' + fmtE(totCash) + '</div></div><div class="kpi"><div class="kpi-label">POS</div><div class="kpi-value">' + fmtE(totPosV) + '</div></div></div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Gasolio (L)</th><th>Benzina (L)</th><th>Totale (L)</th><th>Incasso €</th></tr></thead><tbody>' + righeHtml + '</tbody></table></div>';
  document.getElementById('stz-report-content').innerHTML = html;
}

// ── LOGISTICA ─────────────────────────────────────────────────────
async function caricaLogistica() {
  await Promise.all([caricaMezziPropri(), caricaTrasportatori(), caricaCarichi()]);
  // Carica trasportatori nel dropdown
  const { data: trasps } = await sb.from('trasportatori').select('id,nome').eq('attivo',true).order('nome');
  const selT = document.getElementById('car-trasportatore');
  if (selT && trasps) selT.innerHTML = '<option value="">Nostro mezzo</option>' + trasps.map(t => '<option value="' + t.id + '">' + t.nome + '</option>').join('');
  const carData = document.getElementById('car-data');
  if (carData && !carData.value) carData.value = oggiISO;
  // Carica mezzi propri come default
  aggiornaVeicoliVettore();
  // Carica ordini per la data corrente
  if (carData && carData.value) caricaOrdiniPerCarico();
  // Popola dropdown vettori per report
  const selRV = document.getElementById('rep-vettore');
  if (selRV && trasps) selRV.innerHTML = '<option value="">Tutti i vettori</option><option value="proprio">Mezzi propri</option>' + trasps.map(t => '<option value="' + t.id + '">' + t.nome + '</option>').join('');
  const repDa = document.getElementById('rep-viaggio-da');
  const repA = document.getElementById('rep-viaggio-a');
  if (repDa && !repDa.value) repDa.value = oggiISO.substring(0,8) + '01';
  if (repA && !repA.value) repA.value = oggiISO;
}

async function aggiornaVeicoliVettore() {
  const trId = document.getElementById('car-trasportatore').value;
  const selM = document.getElementById('car-mezzo');
  const selA = document.getElementById('car-autista');

  if (!trId) {
    const { data: mezzi } = await sb.from('mezzi').select('id,targa,capacita_totale,autista_default').eq('attivo',true).order('targa');
    if (selM && mezzi) {
      selM.innerHTML = '<option value="" data-cap="0">Seleziona mezzo...</option>' + mezzi.map(m => '<option value="' + m.id + '" data-cap="' + m.capacita_totale + '" data-autista="' + esc(m.autista_default||'') + '">' + m.targa + ' (' + fmtL(m.capacita_totale) + ')</option>').join('');
      selM.onchange = function() {
        const opt = selM.options[selM.selectedIndex];
        const autDef = opt?.dataset?.autista || '';
        if (autDef && selA) {
          let found = false;
          for (let i = 0; i < selA.options.length; i++) { if (selA.options[i].value === autDef) { selA.selectedIndex = i; found = true; break; } }
          if (!found) { selA.innerHTML += '<option value="' + esc(autDef) + '" selected>' + esc(autDef) + '</option>'; }
        }
        aggiornaTotaleOrdiniCarico();
      };
    }
    if (selA) selA.innerHTML = '<option value="">Seleziona autista...</option>';
  } else {
    const { data: mezziTr } = await sb.from('mezzi_trasportatori').select('id,targa,capacita_totale').eq('trasportatore_id',trId).order('targa');
    if (selM) {
      selM.innerHTML = '<option value="" data-cap="0">Seleziona mezzo...</option>' + (mezziTr||[]).map(m => '<option value="tr_' + m.id + '" data-cap="' + (m.capacita_totale||0) + '">' + m.targa + (m.capacita_totale ? ' (' + fmtL(m.capacita_totale) + ')' : '') + '</option>').join('');
      selM.onchange = function() { aggiornaTotaleOrdiniCarico(); };
    }
    const { data: autistiTr } = await sb.from('autisti').select('id,nome').eq('trasportatore_id',trId).order('nome');
    if (selA) {
      selA.innerHTML = '<option value="">Seleziona autista...</option>' + (autistiTr||[]).map(a => '<option value="' + esc(a.nome) + '">' + esc(a.nome) + '</option>').join('');
    }
  }
}

// ── REPORT VIAGGI PER VETTORE ──
async function _caricaDatiViaggi() {
  const vettore = document.getElementById('rep-vettore').value;
  const da = document.getElementById('rep-viaggio-da').value;
  const a = document.getElementById('rep-viaggio-a').value;
  if (!da || !a) { toast('Seleziona il periodo'); return null; }

  // Carica carichi con ordini
  let query = sb.from('carichi').select('*, carico_ordini(ordine_id, ordini(*)), trasportatori(nome)').gte('data',da).lte('data',a).order('data',{ascending:false});
  if (vettore === 'proprio') {
    query = query.is('trasportatore_id', null);
  } else if (vettore) {
    query = query.eq('trasportatore_id', vettore);
  }
  const { data: carichi } = await query;
  if (!carichi || !carichi.length) { return []; }
  return carichi;
}

async function generaReportViaggi() {
  const carichi = await _caricaDatiViaggi();
  if (carichi === null) return;
  const el = document.getElementById('report-viaggi-content');
  if (!carichi.length) { el.innerHTML = '<div class="loading">Nessun viaggio trovato per il periodo</div>'; return; }

  let totLitri=0, totCostoTr=0;
  let righe = '';
  carichi.forEach(function(c) {
    const ordini = (c.carico_ordini||[]).map(function(co) { return co.ordini; }).filter(Boolean);
    const litriC = ordini.reduce(function(s,o) { return s+Number(o.litri); },0);
    const costoTr = ordini.reduce(function(s,o) { return s+(Number(o.trasporto_litro||0)*Number(o.litri)); },0);
    const vettoreNome = c.trasportatori ? c.trasportatori.nome : 'Mezzo proprio';
    const prodotti = [...new Set(ordini.map(function(o) { return o.prodotto; }))].join(', ');
    const destinazioni = [...new Set(ordini.map(function(o) { return o.cliente; }))].join(', ');
    totLitri+=litriC; totCostoTr+=costoTr;
    righe += '<tr><td>' + new Date(c.data).toLocaleDateString('it-IT') + '</td><td>' + esc(vettoreNome) + '</td><td>' + esc(c.mezzo_targa||'—') + '</td><td>' + esc(c.autista||'—') + '</td><td style="font-size:11px">' + esc(prodotti) + '</td><td style="font-size:11px">' + esc(destinazioni) + '</td><td style="font-family:var(--font-mono);text-align:right">' + fmtL(litriC) + '</td><td style="font-family:var(--font-mono);text-align:right">' + fmtE(costoTr) + '</td><td>' + badgeStato(c.stato) + '</td></tr>';
  });

  const ivaTr = totCostoTr * 0.22;
  let html = '<div class="grid4" style="margin-bottom:12px">';
  html += '<div class="kpi"><div class="kpi-label">Viaggi</div><div class="kpi-value">' + carichi.length + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Litri trasportati</div><div class="kpi-value">' + fmtL(totLitri) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">Imponibile trasporto</div><div class="kpi-value">' + fmtE(totCostoTr) + '</div></div>';
  html += '<div class="kpi"><div class="kpi-label">IVA 22%</div><div class="kpi-value">' + fmtE(ivaTr) + '</div></div>';
  html += '</div>';
  html += '<div class="grid2" style="margin-bottom:12px"><div class="kpi" style="border-left:3px solid #D4A017"><div class="kpi-label">Totale trasporto IVA inclusa</div><div class="kpi-value" style="color:#D4A017">' + fmtE(totCostoTr + ivaTr) + '</div></div></div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Vettore</th><th>Mezzo</th><th>Autista</th><th>Prodotti</th><th>Destinazione</th><th>Litri</th><th>Costo viaggio</th><th>Stato</th></tr></thead><tbody>' + righe + '</tbody></table></div>';
  el.innerHTML = html;
}

async function stampaReportViaggi() {
  const carichi = await _caricaDatiViaggi();
  if (carichi === null) return;
  if (!carichi.length) { toast('Nessun viaggio trovato per il periodo'); return; }

  const da = document.getElementById('rep-viaggio-da').value;
  const a = document.getElementById('rep-viaggio-a').value;
  const vettoreLabel = document.getElementById('rep-vettore').options[document.getElementById('rep-vettore').selectedIndex]?.text || 'Tutti';
  const daFmt = new Date(da).toLocaleDateString('it-IT');
  const aFmt = new Date(a).toLocaleDateString('it-IT');

  let totLitri=0, totCostoTr=0;
  let righeHtml = '';
  carichi.forEach(function(c, i) {
    var ordini = (c.carico_ordini||[]).map(function(co) { return co.ordini; }).filter(Boolean);
    var litriC = ordini.reduce(function(s,o) { return s+Number(o.litri); },0);
    var costoTr = ordini.reduce(function(s,o) { return s+(Number(o.trasporto_litro||0)*Number(o.litri)); },0);
    var prodotti = [...new Set(ordini.map(function(o) { return o.prodotto; }))].join(', ');
    var destinazioni = [...new Set(ordini.map(function(o) { return o.cliente; }))].join(', ');
    totLitri+=litriC; totCostoTr+=costoTr;

    righeHtml += '<tr>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:center">' + (i+1) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + new Date(c.data).toLocaleDateString('it-IT') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(c.mezzo_targa||'—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd">' + esc(c.autista||'—') + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-size:10px">' + esc(prodotti) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;font-size:10px">' + esc(destinazioni) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(litriC) + '</td>' +
      '<td style="padding:6px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;font-weight:bold">' + fmtE(costoTr) + '</td>' +
      '</tr>';
  });

  var ivaTr = totCostoTr * 0.22;
  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Proforma trasporti ' + vettoreLabel + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media(max-width:600px){body{padding:4mm!important;font-size:10px}.rpt-header{flex-direction:column!important;gap:8px}.rpt-header>div:last-child{text-align:left!important}.rpt-fiscal{justify-content:stretch!important}.rpt-fiscal>div{min-width:0!important;width:100%!important}table{font-size:9px}th,td{padding:4px 3px!important}.rpt-actions{bottom:8px!important;right:8px!important}button{padding:8px 12px!important;font-size:12px!important}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px}' +
    'th{background:#378ADD;color:#fff;padding:7px 5px;font-size:8px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #2A6DB5;text-align:center}' +
    '.tot td{border-top:3px solid #378ADD!important;font-weight:bold;font-size:11px;background:#E6F1FB!important}' +
    '</style></head><body>';

  html += '<div class="rpt-header" style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #378ADD;padding-bottom:10px;margin-bottom:14px">';
  html += '<div><div style="font-size:18px;font-weight:bold;color:#378ADD">PROFORMA TRASPORTI</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:3px">Vettore: <strong>' + esc(vettoreLabel) + '</strong></div>';
  html += '<div style="font-size:12px;color:#666">Periodo: <strong>' + daFmt + ' — ' + aFmt + '</strong> · Viaggi: <strong>' + carichi.length + '</strong></div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Vendita all\'ingrosso di carburanti</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<table><thead><tr><th>#</th><th>Data</th><th>Mezzo</th><th>Autista</th><th>Prodotti</th><th>Destinazione</th><th>Litri</th><th>Costo viaggio</th></tr></thead><tbody>';
  html += righeHtml;
  html += '<tr class="tot"><td style="padding:7px;border:1px solid #ddd" colspan="6">TOTALE</td><td style="padding:7px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtL(totLitri) + '</td><td style="padding:7px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace">' + fmtE(totCostoTr) + '</td></tr>';
  html += '</tbody></table>';

  // Riepilogo fiscale
  html += '<div class="rpt-fiscal" style="display:flex;justify-content:flex-end;margin-top:16px"><div style="min-width:280px;border:1px solid #378ADD;border-radius:8px;overflow:hidden">';
  html += '<div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #e8e8e8"><span>Imponibile trasporto</span><strong style="font-family:Courier New,monospace">' + fmtE(totCostoTr) + '</strong></div>';
  html += '<div style="display:flex;justify-content:space-between;padding:8px 14px;border-bottom:1px solid #e8e8e8"><span>IVA 22%</span><strong style="font-family:Courier New,monospace">' + fmtE(ivaTr) + '</strong></div>';
  html += '<div style="display:flex;justify-content:space-between;padding:10px 14px;background:#E6F1FB;font-size:14px"><strong>TOTALE IVA INCLUSA</strong><strong style="font-family:Courier New,monospace;color:#378ADD">' + fmtE(totCostoTr + ivaTr) + '</strong></div>';
  html += '</div></div>';

  html += '<div style="margin-top:20px;padding-top:12px;border-top:1px solid #ddd;font-size:10px;color:#999;text-align:center">Documento proforma — Phoenix Fuel Srl</div>';

  html += '<div class="no-print rpt-actions" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#378ADD;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

async function salvaMezzo() {
  const targa = document.getElementById('mz-targa').value.trim().toUpperCase();
  const descr = document.getElementById('mz-descr').value;
  const cap = parseFloat(document.getElementById('mz-cap').value);
  const autista = document.getElementById('mz-autista').value;
  if (!targa||!cap) { toast('Inserisci targa e capacita'); return; }
  const { data: mezzo, error } = await sb.from('mezzi').insert([{targa,descrizione:descr,capacita_totale:cap,autista_default:autista}]).select().single();
  if (error) { toast('Errore: '+error.message); return; }
  const scomparti = document.querySelectorAll('.scomparto-row');
  if (scomparti.length) {
    const rows = Array.from(scomparti).map(s => ({ mezzo_id:mezzo.id, nome:s.querySelector('.sc-nome').value, capacita:parseFloat(s.querySelector('.sc-cap').value)||0, prodotto_default:s.querySelector('.sc-prod').value })).filter(r=>r.nome&&r.capacita>0);
    if (rows.length) await sb.from('scomparti_mezzo').insert(rows);
  }
  toast('Mezzo salvato!'); caricaMezziPropri();
}

async function caricaMezziPropri() {
  const { data } = await sb.from('mezzi').select('*, scomparti_mezzo(*)').order('targa');
  const tbody = document.getElementById('tabella-mezzi');
  if (!data||!data.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun mezzo</td></tr>'; return; }
  tbody.innerHTML = data.map(m => {
    const scomparti = m.scomparti_mezzo ? m.scomparti_mezzo.map(s => s.nome + ' (' + fmtL(s.capacita) + (s.prodotto_default?' · '+s.prodotto_default:'') + ')').join(', ') : '—';
    return '<tr><td><strong>' + m.targa + '</strong></td><td>' + (m.descrizione||'—') + '</td><td style="font-family:var(--font-mono)">' + fmtL(m.capacita_totale) + '</td><td>' + (m.autista_default||'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + scomparti + '</td><td style="white-space:nowrap"><button class="btn-edit" title="Modifica" onclick="apriModaleMezzo(\'' + m.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'mezzi\',\'' + m.id + '\',caricaMezziPropri)">x</button></td></tr>';
  }).join('');
}

async function apriModaleMezzo(id) {
  const { data: m } = await sb.from('mezzi').select('*, scomparti_mezzo(*)').eq('id', id).single();
  if (!m) { toast('Mezzo non trovato'); return; }

  const opzProd = cacheProdotti.filter(p=>p.attivo).map(p=>'<option value="'+esc(p.nome)+'">'+esc(p.nome)+'</option>').join('');

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Modifica mezzo: ' + esc(m.targa) + '</div>';
  html += '<div class="form-grid">';
  html += '<div class="form-group"><label>Targa</label><input type="text" id="mod-mz-targa" value="' + esc(m.targa) + '" /></div>';
  html += '<div class="form-group"><label>Descrizione</label><input type="text" id="mod-mz-descr" value="' + esc(m.descrizione||'') + '" /></div>';
  html += '<div class="form-group"><label>Capacità totale (L)</label><input type="number" id="mod-mz-cap" value="' + (m.capacita_totale||0) + '" /></div>';
  html += '<div class="form-group"><label>Autista default</label><input type="text" id="mod-mz-autista" value="' + esc(m.autista_default||'') + '" /></div>';
  html += '<div class="form-group"><label>Stato</label><select id="mod-mz-attivo"><option value="true"' + (m.attivo!==false?' selected':'') + '>Attivo</option><option value="false"' + (m.attivo===false?' selected':'') + '>Disattivato</option></select></div>';
  html += '</div>';

  // Scomparti esistenti
  html += '<div style="font-size:11px;color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:0.4px;margin:14px 0 8px">Scomparti cisterna</div>';
  html += '<div id="mod-scomparti-wrap">';
  if (m.scomparti_mezzo && m.scomparti_mezzo.length) {
    m.scomparti_mezzo.forEach(s => {
      html += '<div class="mod-scomparto-row" data-id="' + s.id + '" style="display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px">';
      html += '<div class="form-group"><label>Nome</label><input type="text" class="mod-sc-nome" value="' + esc(s.nome) + '" /></div>';
      html += '<div class="form-group"><label>Capacità (L)</label><input type="number" class="mod-sc-cap" value="' + (s.capacita||0) + '" /></div>';
      html += '<div class="form-group"><label>Prodotto default</label><select class="mod-sc-prod"><option value="">Qualsiasi</option>' + opzProd.replace('value="'+esc(s.prodotto_default||'')+'"', 'value="'+esc(s.prodotto_default||'')+'" selected') + '</select></div>';
      html += '<button class="btn-danger" onclick="this.parentElement.remove()" style="margin-bottom:2px">x</button>';
      html += '</div>';
    });
  }
  html += '</div>';
  html += '<button type="button" onclick="aggiungiScompartoModale()" style="background:none;border:0.5px dashed var(--border);border-radius:8px;padding:6px 14px;font-size:12px;color:var(--text-muted);cursor:pointer;width:100%;margin-top:4px">+ Aggiungi scomparto</button>';

  html += '<div style="display:flex;gap:8px;margin-top:16px">';
  html += '<button class="btn-primary" style="flex:1" onclick="salvaModificaMezzo(\'' + id + '\')">Salva modifiche</button>';
  html += '<button onclick="chiudiModalePermessi()" style="padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Annulla</button>';
  html += '</div>';

  apriModal(html);
}

function aggiungiScompartoModale() {
  const wrap = document.getElementById('mod-scomparti-wrap');
  const opzProd = cacheProdotti.filter(p=>p.attivo).map(p=>'<option value="'+esc(p.nome)+'">'+esc(p.nome)+'</option>').join('');
  const div = document.createElement('div');
  div.className = 'mod-scomparto-row';
  div.dataset.id = 'new';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px';
  div.innerHTML = '<div class="form-group"><label>Nome</label><input type="text" class="mod-sc-nome" placeholder="Es. Scomp. 1" /></div><div class="form-group"><label>Capacità (L)</label><input type="number" class="mod-sc-cap" placeholder="0" /></div><div class="form-group"><label>Prodotto default</label><select class="mod-sc-prod"><option value="">Qualsiasi</option>' + opzProd + '</select></div><button class="btn-danger" onclick="this.parentElement.remove()" style="margin-bottom:2px">x</button>';
  wrap.appendChild(div);
}

async function salvaModificaMezzo(id) {
  const targa = document.getElementById('mod-mz-targa').value.trim().toUpperCase();
  const descr = document.getElementById('mod-mz-descr').value;
  const cap = parseFloat(document.getElementById('mod-mz-cap').value);
  const autista = document.getElementById('mod-mz-autista').value;
  const attivo = document.getElementById('mod-mz-attivo').value === 'true';
  if (!targa || !cap) { toast('Inserisci targa e capacità'); return; }

  // Aggiorna mezzo
  const { error } = await sb.from('mezzi').update({ targa, descrizione:descr, capacita_totale:cap, autista_default:autista, attivo }).eq('id', id);
  if (error) { toast('Errore: ' + error.message); return; }

  // Gestisci scomparti: elimina quelli rimossi, aggiorna esistenti, inserisci nuovi
  const righe = document.querySelectorAll('.mod-scomparto-row');
  const idsPresenti = [];

  for (const row of righe) {
    const scId = row.dataset.id;
    const nome = row.querySelector('.mod-sc-nome').value.trim();
    const capSc = parseFloat(row.querySelector('.mod-sc-cap').value) || 0;
    const prod = row.querySelector('.mod-sc-prod').value;
    if (!nome || capSc <= 0) continue;

    if (scId && scId !== 'new') {
      // Aggiorna esistente
      await sb.from('scomparti_mezzo').update({ nome, capacita:capSc, prodotto_default:prod||null }).eq('id', scId);
      idsPresenti.push(scId);
    } else {
      // Nuovo scomparto
      const { data: nuovo } = await sb.from('scomparti_mezzo').insert([{ mezzo_id:id, nome, capacita:capSc, prodotto_default:prod||null }]).select().single();
      if (nuovo) idsPresenti.push(nuovo.id);
    }
  }

  // Elimina scomparti rimossi dall'utente
  const { data: tuttiSc } = await sb.from('scomparti_mezzo').select('id').eq('mezzo_id', id);
  if (tuttiSc) {
    for (const sc of tuttiSc) {
      if (!idsPresenti.includes(sc.id)) {
        await sb.from('scomparti_mezzo').delete().eq('id', sc.id);
      }
    }
  }

  toast('Mezzo ' + targa + ' aggiornato!');
  chiudiModalePermessi();
  caricaMezziPropri();
}

function aggiungiScomparto() {
  const wrap = document.getElementById('scomparti-wrap');
  const div = document.createElement('div');
  div.className = 'scomparto-row';
  div.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr auto;gap:8px;align-items:end;margin-bottom:8px';
  const opzProd = cacheProdotti.filter(p=>p.attivo).map(p=>'<option>'+p.nome+'</option>').join('');
  div.innerHTML = '<div class="form-group"><label>Nome scomparto</label><input type="text" class="sc-nome" placeholder="Es. Scomp. 1" /></div><div class="form-group"><label>Capacita (L)</label><input type="number" class="sc-cap" placeholder="0" /></div><div class="form-group"><label>Prodotto default</label><select class="sc-prod"><option value="">Qualsiasi</option>' + opzProd + '</select></div><button class="btn-danger" onclick="this.parentElement.remove()" style="margin-bottom:2px">x</button>';
  wrap.appendChild(div);
}

async function salvaTrasportatore() {
  const nome = document.getElementById('tr-nome').value.trim();
  if (!nome) { toast('Inserisci il nome'); return; }
  const { error } = await sb.from('trasportatori').insert([{nome, piva:document.getElementById('tr-piva').value, telefono:document.getElementById('tr-tel').value, email:document.getElementById('tr-email').value, note:document.getElementById('tr-note').value}]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('Trasportatore salvato!'); caricaTrasportatori();
}

async function caricaTrasportatori() {
  const { data } = await sb.from('trasportatori').select('*, autisti(*), mezzi_trasportatori(*)').order('nome');
  const tbody = document.getElementById('tabella-trasportatori');
  if (!data||!data.length) { tbody.innerHTML = '<tr><td colspan="5" class="loading">Nessun trasportatore</td></tr>'; return; }
  const selTrA = document.getElementById('at-trasportatore');
  const selTrM = document.getElementById('me-trasportatore');
  const opts = '<option value="">Seleziona...</option>' + data.map(t => '<option value="' + t.id + '">' + t.nome + '</option>').join('');
  if (selTrA) selTrA.innerHTML = opts;
  if (selTrM) selTrM.innerHTML = opts;
  tbody.innerHTML = data.map(t => '<tr><td><strong>' + t.nome + '</strong></td><td>' + (t.telefono||'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + (t.autisti?t.autisti.map(a=>a.nome).join(', '):'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + (t.mezzi_trasportatori?t.mezzi_trasportatori.map(m=>m.targa).join(', '):'—') + '</td><td><button class="btn-danger" onclick="eliminaRecord(\'trasportatori\',\'' + t.id + '\',caricaTrasportatori)">x</button></td></tr>').join('');
}

async function salvaAutista() {
  const trId = document.getElementById('at-trasportatore').value;
  const nome = document.getElementById('at-nome').value.trim();
  if (!trId||!nome) { toast('Seleziona trasportatore e inserisci nome'); return; }
  const { error } = await sb.from('autisti').insert([{trasportatore_id:trId,nome,telefono:document.getElementById('at-tel').value,patente:document.getElementById('at-patente').value}]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('Autista salvato!'); caricaTrasportatori();
}

async function salvaMezzoEsterno() {
  const trId = document.getElementById('me-trasportatore').value;
  const targa = document.getElementById('me-targa').value.trim().toUpperCase();
  if (!trId||!targa) { toast('Seleziona trasportatore e inserisci targa'); return; }
  const { error } = await sb.from('mezzi_trasportatori').insert([{trasportatore_id:trId,targa,descrizione:document.getElementById('me-descr').value,capacita_totale:parseFloat(document.getElementById('me-cap').value)||0}]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('Mezzo esterno salvato!'); caricaTrasportatori();
}

async function caricaOrdiniPerCarico() {
  const dataEl = document.getElementById('car-data');
  if (!dataEl) return;
  const data = dataEl.value;
  const wrap = document.getElementById('ordini-per-carico');
  if (!data) { wrap.innerHTML = '<div class="loading">Seleziona una data</div>'; return; }
  try {
    const [assegnatiRes, ordiniRes] = await Promise.all([
      sb.from('carico_ordini').select('ordine_id'),
      sb.from('ordini').select('*').eq('data', data).neq('stato','annullato').order('cliente')
    ]);
    const idsInCarico = new Set((assegnatiRes.data||[]).map(o=>o.ordine_id));
    const ordini = ordiniRes.data;
    if (ordiniRes.error) { console.error('Errore ordini:', ordiniRes.error); wrap.innerHTML = '<div class="loading">Errore nel caricamento</div>'; return; }

    const ordiniFiltrati = (ordini||[]).filter(o => {
      if (idsInCarico.has(o.id)) return false;
      if (o.tipo_ordine === 'cliente') return true;
      if ((o.tipo_ordine === 'entrata_deposito' || o.tipo_ordine === 'stazione_servizio') && Number(o.trasporto_litro||0) > 0) return true;
      return false;
    });

    if (!ordiniFiltrati.length) { wrap.innerHTML = '<div class="loading">Nessun ordine disponibile per questa data</div>'; return; }

    // Carica sedi di scarico per tutti i clienti coinvolti
    const clientiNomi = [...new Set(ordiniFiltrati.map(o => o.cliente).filter(Boolean))];
    const { data: clientiData } = await sb.from('clienti').select('id,nome').in('nome', clientiNomi);
    const clienteIdMap = {};
    (clientiData||[]).forEach(c => { clienteIdMap[c.nome] = c.id; });

    const clienteIds = Object.values(clienteIdMap);
    let sediMap = {}; // clienteId → [sedi]
    if (clienteIds.length) {
      const { data: sedi } = await sb.from('sedi_scarico').select('*').in('cliente_id', clienteIds).eq('attivo', true).order('predefinito',{ascending:false}).order('nome');
      (sedi||[]).forEach(s => {
        if (!sediMap[s.cliente_id]) sediMap[s.cliente_id] = [];
        sediMap[s.cliente_id].push(s);
      });
    }

    wrap.innerHTML = ordiniFiltrati.map(o => {
      const badge = badgeStato(o.stato);
      const cId = clienteIdMap[o.cliente];
      const sedi = cId ? (sediMap[cId] || []) : [];
      let sedeHtml = '';
      if (sedi.length > 1) {
        // Dropdown sedi
        sedeHtml = '<select class="ord-sede-select" data-ordine="' + o.id + '" style="font-size:11px;padding:3px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);margin-top:3px;max-width:100%">';
        sedi.forEach(s => {
          sedeHtml += '<option value="' + s.id + '" data-nome="' + esc(s.nome + (s.indirizzo ? ' — ' + s.indirizzo : '')) + '"' + (s.predefinito ? ' selected' : '') + '>' + esc(s.nome) + (s.citta ? ' (' + s.citta + ')' : '') + '</option>';
        });
        sedeHtml += '</select>';
      } else if (sedi.length === 1) {
        sedeHtml = '<div style="font-size:10px;color:#6B5FCC;margin-top:2px">📍 ' + esc(sedi[0].nome) + '</div>';
        sedeHtml += '<input type="hidden" class="ord-sede-select" data-ordine="' + o.id + '" value="' + sedi[0].id + '" data-nome="' + esc(sedi[0].nome) + '" />';
      }
      // Mostra sede già assegnata
      const sedeGia = o.sede_scarico_nome ? '<div style="font-size:10px;color:#639922;margin-top:2px">📍 ' + esc(o.sede_scarico_nome) + '</div>' : '';
      return '<label style="display:flex;align-items:flex-start;gap:10px;padding:8px 12px;background:var(--bg-kpi);border-radius:8px;cursor:pointer;font-size:12px;margin-bottom:6px"><input type="checkbox" class="ord-carico" value="' + o.id + '" data-litri="' + o.litri + '" onchange="aggiornaTotaleOrdiniCarico()" style="margin-top:3px" /><div style="flex:1"><div style="font-weight:500">' + esc(o.cliente) + '</div><div style="color:var(--text-muted)">' + esc(o.prodotto) + ' · ' + fmtL(o.litri) + '</div>' + sedeGia + sedeHtml + '</div>' + badge + '</label>';
    }).join('');
    aggiornaTotaleOrdiniCarico();
  } catch(err) {
    console.error('Errore caricaOrdiniPerCarico:', err);
    wrap.innerHTML = '<div class="loading">Errore: ' + err.message + '</div>';
  }
}

function aggiornaTotaleOrdiniCarico() {
  const checks = document.querySelectorAll('.ord-carico:checked');
  let totLitri = 0;
  checks.forEach(c => { totLitri += Number(c.dataset.litri || 0); });
  const mezzoSel = document.getElementById('car-mezzo');
  const capText = mezzoSel.selectedOptions[0]?.dataset?.cap;
  const cap = capText ? Number(capText) : 0;
  let html = checks.length + ' ordini · <strong style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</strong>';
  if (cap > 0) {
    const pct = Math.round((totLitri / cap) * 100);
    const colore = totLitri > cap ? '#A32D2D' : pct > 85 ? '#BA7517' : '#639922';
    html += ' / ' + fmtL(cap) + ' <span style="color:' + colore + ';font-weight:500">(' + pct + '%)</span>';
    if (totLitri > cap) html += ' <span style="color:#A32D2D;font-weight:500">⚠ Capienza superata!</span>';
  }
  document.getElementById('car-tot-ordini').innerHTML = html;
}

async function creaNuovoCarico() {
  const data = document.getElementById('car-data').value;
  const mezzoVal = document.getElementById('car-mezzo').value;
  const mezzoTarga = document.getElementById('car-mezzo').options[document.getElementById('car-mezzo').selectedIndex]?.text || '';
  const autista = document.getElementById('car-autista').value;
  const trId = document.getElementById('car-trasportatore').value || null;
  if (!data) { toast('Inserisci la data'); return; }
  if (!mezzoVal) { toast('Seleziona un mezzo'); return; }
  const ordiniSel = Array.from(document.querySelectorAll('.ord-carico:checked')).map(c => c.value);
  if (!ordiniSel.length) { toast('Seleziona almeno un ordine'); return; }
  const mezzoId = mezzoVal.startsWith('tr_') ? null : mezzoVal;
  if (mezzoId) {
    const { data: mezzo } = await sb.from('mezzi').select('capacita_totale,targa').eq('id', mezzoId).single();
    if (mezzo) {
      const { data: ordiniSelData } = await sb.from('ordini').select('litri').in('id', ordiniSel);
      const totLitri = (ordiniSelData||[]).reduce((s,o)=>s+Number(o.litri),0);
      if (totLitri > Number(mezzo.capacita_totale)) { toast('Portata superata! Totale: ' + fmtL(totLitri) + ' Capienza: ' + fmtL(mezzo.capacita_totale)); return; }
    }
  }
  const record = {data, mezzo_id:mezzoId, mezzo_targa:mezzoTarga.split(' (')[0], autista, trasportatore_id:trId, stato:'programmato'};
  const { data: carico, error } = await sb.from('carichi').insert([record]).select().single();
  if (error) { toast('Errore: '+error.message); return; }
  const righe = ordiniSel.map((oId,i) => ({carico_id:carico.id,ordine_id:oId,sequenza:i+1}));
  await sb.from('carico_ordini').insert(righe);
  await Promise.all(ordiniSel.map(oId => sb.from('ordini').update({stato:'programmato'}).eq('id',oId)));

  // Salva sedi di scarico selezionate sugli ordini
  const sedeSelects = document.querySelectorAll('.ord-sede-select');
  for (const sel of sedeSelects) {
    const ordineId = sel.dataset.ordine;
    if (!ordiniSel.includes(ordineId)) continue;
    const sedeId = sel.value;
    const sedeNome = sel.tagName === 'SELECT' ? (sel.selectedOptions[0]?.dataset?.nome || '') : (sel.dataset.nome || '');
    if (sedeId) {
      await sb.from('ordini').update({ sede_scarico_id: sedeId, sede_scarico_nome: sedeNome }).eq('id', ordineId);
    }
  }

  // Controlla se ci sono ordini dal deposito PhoenixFuel da scaricare
  const { data: ordiniCarico } = await sb.from('ordini').select('*').in('id', ordiniSel);
  const ordiniDeposito = (ordiniCarico||[]).filter(o => o.fornitore && o.fornitore.toLowerCase().includes('phoenix'));
  if (ordiniDeposito.length > 0) {
    const totLitriDep = ordiniDeposito.reduce((s,o) => s + Number(o.litri), 0);
    const prodottiDep = [...new Set(ordiniDeposito.map(o => o.prodotto))].join(', ');
    // Mostra modale di conferma scarico deposito
    let htmlModal = '<div style="font-size:15px;font-weight:500;margin-bottom:8px">🏗 Scarico deposito automatico</div>';
    htmlModal += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Ci sono <strong>' + ordiniDeposito.length + ' ordini</strong> dal deposito PhoenixFuel per un totale di <strong>' + fmtL(totLitriDep) + '</strong> (' + prodottiDep + ').</div>';
    htmlModal += '<div style="font-size:13px;margin-bottom:16px">Vuoi scaricare automaticamente le cisterne del deposito?</div>';
    htmlModal += '<div style="display:flex;gap:8px">';
    htmlModal += '<button class="btn-primary" style="flex:1" onclick="eseguiScaricaDeposito(\'' + ordiniDeposito.map(o=>o.id).join(',') + '\')">✅ Sì, scarica deposito</button>';
    htmlModal += '<button onclick="chiudiModalePermessi();toast(\'Carico creato! Ricorda di scaricare il deposito manualmente.\')" style="flex:1;padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">No, lo faccio dopo</button>';
    htmlModal += '</div>';
    apriModal(htmlModal);
  } else {
    toast('Carico creato!');
  }

  caricaCarichi();
  caricaOrdiniPerCarico();
}

async function eseguiScaricaDeposito(ordiniIdsStr) {
  const ids = ordiniIdsStr.split(',');
  let scaricati = 0, errori = 0;
  for (const id of ids) {
    try {
      await confermaUscitaDeposito(id);
      scaricati++;
    } catch(e) {
      console.error('Errore scarico ordine ' + id, e);
      errori++;
    }
  }
  chiudiModalePermessi();
  if (errori > 0) {
    toast('Scaricati ' + scaricati + ' ordini. ' + errori + ' errori — controlla il deposito.');
  } else {
    toast('Carico creato e deposito scaricato! (' + scaricati + ' ordini)');
  }
  caricaCarichi();
  caricaOrdiniPerCarico();
}

async function caricaCarichi() {
  const { data } = await sb.from('carichi').select('*, carico_ordini(sequenza, ordini(cliente,prodotto,litri,note))').order('data',{ascending:false}).limit(20);
  const tbody = document.getElementById('tabella-carichi');
  if (!data||!data.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessun carico pianificato</td></tr>'; return; }
  tbody.innerHTML = data.map(c => {
    const totLitri = c.carico_ordini ? c.carico_ordini.reduce((s,o)=>s+Number(o.ordini?.litri||0),0) : 0;
    const nConsegne = c.carico_ordini ? c.carico_ordini.length : 0;
    const prodotti = c.carico_ordini ? [...new Set(c.carico_ordini.map(o=>o.ordini?.prodotto).filter(Boolean))].join(', ') : '—';
    return '<tr><td>' + c.data + '</td><td>' + (c.mezzo_targa||'—') + '</td><td>' + (c.autista||'—') + '</td><td style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</td><td style="font-size:11px;color:var(--text-muted)">' + prodotti + '</td><td>' + nConsegne + ' consegne</td><td>' + badgeStato(c.stato) + ' <button class="btn-edit" title="Foglio viaggio" onclick="apriFoglioViaggio(\'' + c.id + '\')">🖨️</button><button class="btn-edit" onclick="apriDettaglioCarico(\'' + c.id + '\')">👁</button><button class="btn-danger" onclick="eliminaRecord(\'carichi\',\'' + c.id + '\',caricaCarichi)">x</button></td></tr>';
  }).join('');
}

function apriFoglioViaggio(caricoId) {
  window.open('foglio_viaggio.html?carico_id=' + caricoId, '_blank');
}

function apriConfermaOrdine(ordineId) {
  window.open('conferma_ordine.html?ordine_id=' + ordineId, '_blank');
}

function apriListinoPDF() {
  window.open('listino_pdf.html', '_blank');
}

function apriReportVendite() {
  window.open('report_vendite.html', '_blank');
}

function apriReportAcquisti() {
  window.open('report_acquisti.html', '_blank');
}

function apriReportMensile() {
  window.open('report_mensile.html', '_blank');
}

async function apriDettaglioCarico(caricoId) {
  const { data: carico } = await sb.from('carichi').select('*, carico_ordini(sequenza, ordine_id, ordini(id,cliente,prodotto,litri,note,stato,fornitore))').eq('id', caricoId).single();
  if (!carico) return;
  const ordini = carico.carico_ordini ? [...carico.carico_ordini].sort((a,b)=>a.sequenza-b.sequenza) : [];
  const nonConfermati = ordini.filter(o => o.ordini && o.ordini.stato !== 'confermato');
  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">Dettaglio carico — ' + carico.data + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Mezzo: ' + (carico.mezzo_targa||'—') + ' · Autista: ' + (carico.autista||'—') + ' · ' + ordini.length + ' consegne' + (nonConfermati.length ? ' · <span style="color:#BA7517">' + nonConfermati.length + ' da confermare</span>' : ' · <span style="color:#639922">tutte confermate</span>') + '</div>';
  html += '<table style="width:100%;font-size:12px;margin-bottom:16px"><thead><tr><th>#</th><th>Cliente</th><th>Prodotto</th><th>Litri</th><th>Stato</th><th>Note</th></tr></thead><tbody>';
  ordini.forEach(o => { html += '<tr><td>' + o.sequenza + '</td><td>' + (o.ordini?.cliente||'—') + '</td><td>' + (o.ordini?.prodotto||'—') + '</td><td style="font-family:var(--font-mono)">' + fmtL(o.ordini?.litri||0) + '</td><td>' + badgeStato(o.ordini?.stato||'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + (o.ordini?.note||'—') + '</td></tr>'; });
  html += '</tbody></table>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  if (nonConfermati.length) {
    html += '<button class="btn-primary" style="flex:1;background:#639922" onclick="confermaTutteConsegneCarico(\'' + caricoId + '\')">✅ Conferma tutte (' + nonConfermati.length + ')</button>';
  }
  html += '<button class="btn-primary" style="flex:1" onclick="apriFoglioViaggio(\'' + caricoId + '\')">🖨️ Foglio viaggio</button><button onclick="chiudiModalePermessi()" style="flex:1;padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Chiudi</button></div>';
  apriModal(html);
}

async function confermaTutteConsegneCarico(caricoId) {
  const { data: caricoOrdini } = await sb.from('carico_ordini').select('ordine_id, ordini(id,stato,fornitore)').eq('carico_id', caricoId);
  if (!caricoOrdini || !caricoOrdini.length) { toast('Nessun ordine nel carico'); return; }
  const daConfermare = caricoOrdini.filter(co => co.ordini && co.ordini.stato !== 'confermato');
  if (!daConfermare.length) { toast('Tutti gli ordini sono già confermati'); return; }
  if (!confirm('Confermare ' + daConfermare.length + ' consegne di questo carico?')) return;

  let confermati = 0;
  for (const co of daConfermare) {
    if (co.ordini.fornitore && co.ordini.fornitore.toLowerCase().includes('phoenix')) {
      await confermaUscitaDeposito(co.ordine_id);
    } else {
      await sb.from('ordini').update({ stato:'confermato' }).eq('id', co.ordine_id);
    }
    confermati++;
  }
  toast(confermati + ' consegne confermate!');
  chiudiModal();
  caricaCarichi();
}

// ── PERMESSI ──────────────────────────────────────────────────────
const SEZIONI_SISTEMA = [
  {id:'dashboard',label:'Dashboard',icon:'▦'},{id:'ordini',label:'Ordini',icon:'📋'},
  {id:'prezzi',label:'Prezzi giornalieri',icon:'💰'},{id:'deposito',label:'Deposito',icon:'🏗'},
  {id:'consegne',label:'Consegne',icon:'🚚'},{id:'vendite',label:'Vendite',icon:'📊'},
  {id:'clienti',label:'Clienti',icon:'👤'},{id:'fornitori',label:'Fornitori',icon:'🏭'},
  {id:'basi',label:'Basi di carico',icon:'📍'},{id:'prodotti',label:'Prodotti',icon:'📦'},{id:'logistica',label:'Logistica',icon:'🚛'},{id:'stazione',label:'Stazione Oppido',icon:'⛽'},
];

async function apriModalePermessi(utenteId, nomeUtente) {
  const { data: permessiEsistenti } = await sb.from('permessi').select('*').eq('utente_id', utenteId);
  const map = {};
  (permessiEsistenti||[]).forEach(p => map[p.sezione]=p.abilitato);
  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Permessi per ' + nomeUtente + '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:20px">';
  SEZIONI_SISTEMA.forEach(s => {
    html += '<label style="display:flex;align-items:center;gap:8px;padding:8px 12px;background:var(--bg-kpi);border-radius:8px;cursor:pointer;font-size:13px"><input type="checkbox" value="' + s.id + '"' + (map[s.id]?' checked':'') + ' onchange="aggiornaPermesso(\'' + utenteId + '\',\'' + s.id + '\',this.checked)" /><span>' + s.icon + ' ' + s.label + '</span></label>';
  });
  html += '</div><button class="btn-primary" style="width:100%" onclick="chiudiModalePermessi()">Chiudi</button>';
  apriModal(html);
}

async function aggiornaPermesso(utenteId, sezione, abilitato) {
  await sb.from('permessi').upsert({utente_id:utenteId,sezione,abilitato},{onConflict:'utente_id,sezione'});
  toast(abilitato ? sezione + ' abilitata' : sezione + ' disabilitata');
}

async function invitaUtente() {
  const nome = document.getElementById('ut-nome').value.trim();
  const email = document.getElementById('ut-email').value.trim();
  const password = document.getElementById('ut-password').value;
  const ruolo = document.getElementById('ut-ruolo').value;
  const clienteId = document.getElementById('ut-cliente').value || null;
  if (!nome||!email) { toast('Compila nome ed email'); return; }
  if (!password || password.length < 6) { toast('La password deve avere almeno 6 caratteri'); return; }

  // 1. Crea utente su Supabase Auth
  const { data: authData, error: authError } = await sb.auth.signUp({ email, password });
  if (authError) { toast('Errore creazione accesso: ' + authError.message); return; }

  // 2. Crea record nella tabella utenti
  const { data: nuovoUtente, error } = await sb.from('utenti').insert([{email, nome, ruolo, cliente_id:ruolo==='cliente'?clienteId:null, attivo:true}]).select().single();
  if (error) { toast('Errore salvataggio utente: ' + error.message); return; }

  // 3. Salva permessi
  if (ruolo !== 'cliente' && ruolo !== 'admin') {
    const checks = document.querySelectorAll('#grp-ut-permessi input[type=checkbox]');
    const permessi = Array.from(checks).map(c=>({utente_id:nuovoUtente.id,sezione:c.value,abilitato:c.checked}));
    if (permessi.length) await sb.from('permessi').insert(permessi);
  }

  toast('Utente ' + nome + ' creato con successo! Può accedere con email e password.');
  // Reset form
  document.getElementById('ut-nome').value = '';
  document.getElementById('ut-email').value = '';
  document.getElementById('ut-password').value = '';
  caricaUtentiCompleto();
}

function toggleRuoloCliente() {
  const ruolo = document.getElementById('ut-ruolo').value;
  document.getElementById('grp-ut-cliente').style.display = ruolo==='cliente' ? '' : 'none';
  document.getElementById('grp-ut-permessi').style.display = ruolo==='cliente' ? 'none' : '';
  if (ruolo==='cliente') caricaSelectClienti('ut-cliente');
}

async function caricaUtentiCompleto() {
  await caricaSelectClienti('ut-cliente');
  const grp = document.getElementById('grp-ut-permessi');
  if (grp) {
    let html = '<div style="font-size:11px;color:var(--text-muted);font-weight:500;text-transform:uppercase;letter-spacing:0.4px;margin-bottom:8px;margin-top:12px">Sezioni accessibili</div>';
    html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">';
    SEZIONI_SISTEMA.forEach(s => { html += '<label class="check-label"><input type="checkbox" value="' + s.id + '" checked /> ' + s.icon + ' ' + s.label + '</label>'; });
    html += '</div>';
    grp.innerHTML = html;
  }
  const{data}=await sb.from('utenti').select('*, clienti(nome)').order('nome');
  const tbody=document.getElementById('tabella-utenti');
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="7" class="loading">Nessun utente</td></tr>';return;}
  tbody.innerHTML=data.map(r => '<tr><td><strong>' + esc(r.nome) + '</strong></td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.email) + '</td><td>' + badgeRuolo(r.ruolo) + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.clienti?.nome||'—') + '</td><td>' + (r.attivo?'<span class="badge green">Attivo</span>':'<span class="badge red">Disattivo</span>') + '</td><td>' + (r.ruolo!=='admin'&&r.ruolo!=='cliente'?'<button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="apriModalePermessi(\'' + r.id + '\',\'' + esc(r.nome).replace(/'/g,"\\'") + '\')">Permessi</button>':'—') + '</td><td><button class="btn-danger" onclick="eliminaRecord(\'utenti\',\'' + r.id + '\',caricaUtentiCompleto)">x</button></td></tr>').join('');
}

// ── GIACENZE FINE ANNO ───────────────────────────────────────────
const _giacSedeConfig = {
  'deposito_vibo': { selAnno: 'giac-dep-anno', tbody: 'giac-dep-tabella' },
  'stazione_oppido': { selAnno: 'giac-stz-anno', tbody: 'giac-stz-tabella' },
  'autoconsumo': { selAnno: 'giac-ac-anno', tbody: 'giac-ac-tabella' }
};

function _popolaSelAnnoGiac(selId) {
  const sel = document.getElementById(selId);
  if (!sel || sel.options.length > 0) return;
  const annoCorr = oggi.getFullYear();
  for (let a = annoCorr; a >= annoCorr - 3; a--) sel.innerHTML += '<option value="' + a + '">' + a + '</option>';
  sel.value = annoCorr - 1; // default 2025
}

async function calcolaGiacenzeAnno(sede) {
  const cfg = _giacSedeConfig[sede];
  _popolaSelAnnoGiac(cfg.selAnno);
  const anno = parseInt(document.getElementById(cfg.selAnno).value);
  if (!anno) { toast('Seleziona un anno'); return; }
  const tbody = document.getElementById(cfg.tbody);
  tbody.innerHTML = '<tr><td colspan="8" class="loading">Calcolo in corso...</td></tr>';

  const da = anno + '-01-01', a = anno + '-12-31';
  const annoPrev = anno - 1;

  // Carica giacenze convalidate anno precedente
  const { data: giacPrev } = await sb.from('giacenze_annuali').select('*').eq('anno', annoPrev).eq('sede', sede).eq('convalidata', true);
  const prevMap = {};
  (giacPrev || []).forEach(g => { prevMap[g.prodotto] = Number(g.giacenza_reale || g.giacenza_stimata || 0); });

  // Carica giacenze già salvate per quest'anno
  const { data: giacCorr } = await sb.from('giacenze_annuali').select('*').eq('anno', anno).eq('sede', sede);
  const corrMap = {};
  (giacCorr || []).forEach(g => { corrMap[g.prodotto] = g; });

  let prodottiDati = {};

  if (sede === 'deposito_vibo') {
    // Entrate: ordini entrata_deposito confermati
    const { data: entrate } = await sb.from('ordini').select('prodotto,litri').eq('tipo_ordine','entrata_deposito').neq('stato','annullato').gte('data', da).lte('data', a);
    // Uscite: ordini da deposito (PhoenixFuel) verso clienti + stazione + autoconsumo
    const { data: usciteClienti } = await sb.from('ordini').select('prodotto,litri').eq('tipo_ordine','cliente').neq('stato','annullato').ilike('fornitore','%phoenix%').gte('data', da).lte('data', a);
    const { data: usciteStazione } = await sb.from('ordini').select('prodotto,litri').eq('tipo_ordine','stazione_servizio').neq('stato','annullato').gte('data', da).lte('data', a);
    const { data: usciteAutoconsumo } = await sb.from('ordini').select('prodotto,litri').eq('tipo_ordine','autoconsumo').neq('stato','annullato').gte('data', da).lte('data', a);

    (entrate||[]).forEach(r => {
      if (!prodottiDati[r.prodotto]) prodottiDati[r.prodotto] = { entrate:0, uscite:0 };
      prodottiDati[r.prodotto].entrate += Number(r.litri);
    });
    [usciteClienti, usciteStazione, usciteAutoconsumo].forEach(arr => {
      (arr||[]).forEach(r => {
        if (!prodottiDati[r.prodotto]) prodottiDati[r.prodotto] = { entrate:0, uscite:0 };
        prodottiDati[r.prodotto].uscite += Number(r.litri);
      });
    });
    // Aggiungi rettifiche deposito
    const { data: rett } = await sb.from('rettifiche_inventario').select('prodotto,giacenza_sistema,giacenza_rilevata').eq('tipo','deposito').eq('confermata',true).gte('data', da).lte('data', a);
    (rett||[]).forEach(r => {
      if (!prodottiDati[r.prodotto]) prodottiDati[r.prodotto] = { entrate:0, uscite:0 };
      const diff = Number(r.giacenza_rilevata) - Number(r.giacenza_sistema);
      if (diff > 0) prodottiDati[r.prodotto].entrate += diff;
      else prodottiDati[r.prodotto].uscite += Math.abs(diff);
    });

  } else if (sede === 'stazione_oppido') {
    // Entrate: ordini stazione_servizio confermati
    const { data: entrate } = await sb.from('ordini').select('prodotto,litri').eq('tipo_ordine','stazione_servizio').neq('stato','annullato').gte('data', da).lte('data', a);
    (entrate||[]).forEach(r => {
      if (!prodottiDati[r.prodotto]) prodottiDati[r.prodotto] = { entrate:0, uscite:0 };
      prodottiDati[r.prodotto].entrate += Number(r.litri);
    });
    // Uscite: vendite da letture pompe
    const { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true);
    const pompeMap = {}; (pompe||[]).forEach(p => { pompeMap[p.id] = p.prodotto; });
    const { data: letture } = await sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', da).lte('data', a).order('data');
    // Prima lettura dell'anno e ultima per ogni pompa
    const lettPerPompa = {};
    (letture||[]).forEach(l => {
      if (!lettPerPompa[l.pompa_id]) lettPerPompa[l.pompa_id] = [];
      lettPerPompa[l.pompa_id].push(l);
    });
    Object.entries(lettPerPompa).forEach(([pompaId, letts]) => {
      if (letts.length < 2) return;
      const prima = Number(letts[0].lettura);
      const ultima = Number(letts[letts.length - 1].lettura);
      const litriVenduti = ultima - prima;
      const prodotto = pompeMap[pompaId];
      if (!prodotto || litriVenduti <= 0) return;
      if (!prodottiDati[prodotto]) prodottiDati[prodotto] = { entrate:0, uscite:0 };
      prodottiDati[prodotto].uscite += litriVenduti;
    });
    // Aggiungi rettifiche stazione
    const { data: rett } = await sb.from('rettifiche_inventario').select('prodotto,giacenza_sistema,giacenza_rilevata').eq('tipo','stazione').eq('confermata',true).gte('data', da).lte('data', a);
    (rett||[]).forEach(r => {
      if (!prodottiDati[r.prodotto]) prodottiDati[r.prodotto] = { entrate:0, uscite:0 };
      const diff = Number(r.giacenza_rilevata) - Number(r.giacenza_sistema);
      if (diff > 0) prodottiDati[r.prodotto].entrate += diff;
      else prodottiDati[r.prodotto].uscite += Math.abs(diff);
    });

  } else if (sede === 'autoconsumo') {
    // Entrate: ordini autoconsumo ricevuti
    const { data: entrate } = await sb.from('ordini').select('prodotto,litri').eq('tipo_ordine','autoconsumo').neq('stato','annullato').eq('caricato_deposito',true).gte('data', da).lte('data', a);
    (entrate||[]).forEach(r => {
      if (!prodottiDati[r.prodotto]) prodottiDati[r.prodotto] = { entrate:0, uscite:0 };
      prodottiDati[r.prodotto].entrate += Number(r.litri);
    });
    // Uscite: prelievi autoconsumo
    const { data: prelievi } = await sb.from('prelievi_autoconsumo').select('litri').gte('data', da).lte('data', a);
    const prodAC = 'Gasolio Autotrazione';
    if (!prodottiDati[prodAC]) prodottiDati[prodAC] = { entrate:0, uscite:0 };
    (prelievi||[]).forEach(r => { prodottiDati[prodAC].uscite += Number(r.litri); });
  }

  // Se nessun prodotto trovato
  if (!Object.keys(prodottiDati).length) {
    tbody.innerHTML = '<tr><td colspan="8" class="loading">Nessun movimento trovato per ' + anno + '</td></tr>';
    return;
  }

  // Ordina per ordine_visualizzazione
  const prodOrd = Object.keys(prodottiDati).sort((a,b) => {
    const pa = cacheProdotti.find(p => p.nome === a);
    const pb = cacheProdotti.find(p => p.nome === b);
    return (pa ? pa.ordine_visualizzazione : 99) - (pb ? pb.ordine_visualizzazione : 99);
  });

  // Genera tabella
  let html = '';
  prodOrd.forEach(prodotto => {
    const d = prodottiDati[prodotto];
    const inizio = prevMap[prodotto] || 0;
    const stimata = inizio + d.entrate - d.uscite;
    const esistente = corrMap[prodotto];
    const realeVal = esistente ? (esistente.giacenza_reale !== null ? esistente.giacenza_reale : '') : '';
    const isConv = esistente && esistente.convalidata;
    const diff = realeVal !== '' ? Number(realeVal) - stimata : null;
    const diffColor = diff !== null ? (diff > 0 ? '#639922' : diff < 0 ? '#A32D2D' : 'var(--text-muted)') : '';
    const diffLabel = diff !== null ? (diff > 0 ? '+' : '') + _sep(diff.toLocaleString('it-IT')) + ' L' : '—';

    html += '<tr>';
    html += '<td><strong>' + esc(prodotto) + '</strong></td>';
    html += '<td style="font-family:var(--font-mono)">' + fmtL(inizio) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:#639922">' + fmtL(d.entrate) + '</td>';
    html += '<td style="font-family:var(--font-mono);color:#A32D2D">' + fmtL(d.uscite) + '</td>';
    html += '<td style="font-family:var(--font-mono);font-weight:500">' + fmtL(stimata) + '</td>';
    if (isConv) {
      html += '<td style="font-family:var(--font-mono);font-weight:600;color:#639922">' + fmtL(realeVal) + '</td>';
    } else {
      html += '<td><input type="number" class="giac-reale-input" data-prodotto="' + esc(prodotto) + '" data-sede="' + sede + '" data-stimata="' + stimata + '" value="' + realeVal + '" placeholder="' + Math.round(stimata) + '" style="font-family:var(--font-mono);font-size:13px;font-weight:600;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);width:120px;max-width:100%;text-align:right" oninput="aggiornaGiacDiff(this,' + stimata + ')" /></td>';
    }
    html += '<td style="font-family:var(--font-mono);color:' + diffColor + '">' + diffLabel + '</td>';
    html += '<td>' + (isConv ? '<span class="badge green">✅ Convalidata</span><div style="font-size:9px;color:var(--text-hint);margin-top:2px">' + (esistente.convalidata_da||'') + ' · ' + (esistente.convalidata_il ? new Date(esistente.convalidata_il).toLocaleDateString('it-IT') : '') + '</div>' : '<span class="badge amber">Da convalidare</span>') + '</td>';
    html += '</tr>';
  });
  tbody.innerHTML = html;

  // Salva dati stimati nel DB (upsert)
  for (const prodotto of prodOrd) {
    const d = prodottiDati[prodotto];
    const inizio = prevMap[prodotto] || 0;
    const stimata = inizio + d.entrate - d.uscite;
    const esistente = corrMap[prodotto];
    if (esistente && esistente.convalidata) continue; // Non sovrascrivere convalide

    const record = {
      anno, sede, prodotto,
      giacenza_inizio: inizio,
      totale_entrate: d.entrate,
      totale_uscite: d.uscite,
      giacenza_stimata: stimata,
      updated_at: new Date().toISOString()
    };
    if (esistente) {
      await sb.from('giacenze_annuali').update(record).eq('id', esistente.id);
    } else {
      await sb.from('giacenze_annuali').insert([record]);
    }
  }
  toast('Giacenze ' + anno + ' calcolate per ' + sede.replace('_',' '));
}

function aggiornaGiacDiff(input, stimata) {
  const val = parseFloat(input.value);
  const tr = input.closest('tr');
  const diffTd = tr.querySelectorAll('td')[6]; // colonna differenza
  if (isNaN(val)) { diffTd.innerHTML = '—'; return; }
  const diff = val - stimata;
  const col = diff > 0 ? '#639922' : diff < 0 ? '#A32D2D' : 'var(--text-muted)';
  diffTd.innerHTML = '<span style="font-family:var(--font-mono);color:' + col + '">' + (diff > 0 ? '+' : '') + _sep(Math.round(diff).toLocaleString('it-IT')) + ' L</span>';
}

async function convalidaGiacenze(sede) {
  const cfg = _giacSedeConfig[sede];
  const anno = parseInt(document.getElementById(cfg.selAnno).value);
  if (!anno) { toast('Seleziona un anno'); return; }

  // Raccogli tutti gli input della giacenza reale
  const inputs = document.querySelectorAll('#' + cfg.tbody + ' .giac-reale-input');
  if (!inputs.length) { toast('Prima calcola le giacenze'); return; }

  let tutteCompilate = true;
  inputs.forEach(inp => { if (!inp.value || isNaN(parseFloat(inp.value))) tutteCompilate = false; });
  if (!tutteCompilate) { toast('Compila tutte le giacenze reali prima di convalidare'); return; }

  if (!confirm('Confermi la convalida delle giacenze ' + anno + ' per ' + sede.replace('_',' ') + '?\n\nI valori inseriti diventeranno la giacenza di partenza per il ' + (anno+1) + '.')) return;

  const nomeUtente = utenteCorrente ? utenteCorrente.nome : 'Admin';
  let errori = 0;

  for (const inp of inputs) {
    const prodotto = inp.dataset.prodotto;
    const reale = parseFloat(inp.value);
    const stimata = parseFloat(inp.dataset.stimata);
    const diff = reale - stimata;

    const { data: esistente } = await sb.from('giacenze_annuali').select('id').eq('anno', anno).eq('sede', sede).eq('prodotto', prodotto).maybeSingle();

    const update = {
      giacenza_reale: reale,
      differenza: diff,
      convalidata: true,
      convalidata_da: nomeUtente,
      convalidata_il: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    if (esistente) {
      const { error } = await sb.from('giacenze_annuali').update(update).eq('id', esistente.id);
      if (error) errori++;
    } else {
      const { error } = await sb.from('giacenze_annuali').insert([{
        anno, sede, prodotto,
        giacenza_inizio: 0, totale_entrate: 0, totale_uscite: 0,
        giacenza_stimata: stimata,
        ...update
      }]);
      if (error) errori++;
    }
  }

  if (errori) { toast('⚠ ' + errori + ' errori durante la convalida'); }
  else { toast('✅ Giacenze ' + anno + ' convalidate! Saldo di partenza ' + (anno+1) + ' fissato.'); }

  // Ricarica
  calcolaGiacenzeAnno(sede);
}

// ── DASHBOARD ─────────────────────────────────────────────────────
// Colori prodotto (Gasolio Autotrazione = giallo)
const COLORI_DASH = {
  'Gasolio Autotrazione': { bg:'#FDF3D0', color:'#7A5D00', bar:'#D4A017', dot:'#D4A017' },
  'Benzina':              { bg:'#E6F1FB', color:'#0C447C', bar:'#378ADD', dot:'#378ADD' },
  'Gasolio Agricolo':     { bg:'#EAF3DE', color:'#27500A', bar:'#639922', dot:'#639922' },
  'HVO':                  { bg:'#E1F5EE', color:'#085041', bar:'#3B6D11', dot:'#3B6D11' }
};

async function caricaDashboard() {
  const{data}=await sb.from('ordini').select('*').eq('data',oggiISO);
  if (!data) return;

  // INGROSSO: solo tipo_ordine='cliente'
  const ingrosso = data.filter(r => r.tipo_ordine === 'cliente' && r.stato !== 'annullato');
  let fatturato=0,litri=0,margine=0;
  ingrosso.forEach(r=>{fatturato+=prezzoConIva(r)*r.litri;litri+=Number(r.litri);margine+=Number(r.margine);});
  document.getElementById('kpi-fatturato').textContent=fmtE(fatturato);
  document.getElementById('kpi-litri').textContent=fmtL(litri);
  document.getElementById('kpi-margine').textContent=ingrosso.length?'€ '+(margine/ingrosso.length).toFixed(4)+'/L':'—';
  document.getElementById('kpi-ordini').textContent=ingrosso.length;

  // MOVIMENTI INTERNI oggi
  const movInterni = data.filter(r => (r.tipo_ordine === 'stazione_servizio' || r.tipo_ordine === 'entrata_deposito' || r.tipo_ordine === 'autoconsumo') && r.stato !== 'annullato');
  document.getElementById('kpi-mov-interni').textContent = movInterni.length;

  // DETTAGLIO: letture pompe oggi vs ieri
  try {
    const ieri = new Date(oggi); ieri.setDate(ieri.getDate()-1);
    const ieriISO = ieri.toISOString().split('T')[0];
    const [lettOggiRes, lettIeriRes, prezziOggiRes, lettMeseRes] = await Promise.all([
      sb.from('stazione_letture').select('pompa_id,lettura').eq('data', oggiISO),
      sb.from('stazione_letture').select('pompa_id,lettura').eq('data', ieriISO),
      sb.from('stazione_prezzi').select('prodotto,prezzo_litro').eq('data', oggiISO),
      sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', oggiISO.substring(0,8)+'01').lte('data', oggiISO).order('data')
    ]);
    const { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true);
    const pompeMap = {}; (pompe||[]).forEach(p => { pompeMap[p.id] = p; });
    const prezziMap = {}; (prezziOggiRes.data||[]).forEach(p => { prezziMap[p.prodotto] = Number(p.prezzo_litro); });
    const lettIeriMap = {}; (lettIeriRes.data||[]).forEach(l => { lettIeriMap[l.pompa_id] = Number(l.lettura); });

    let dettLitri=0, dettIncasso=0;
    (lettOggiRes.data||[]).forEach(l => {
      const prec = lettIeriMap[l.pompa_id];
      if (prec === undefined) return;
      const lv = Number(l.lettura) - prec; if (lv <= 0) return;
      const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
      dettLitri += lv;
      dettIncasso += lv * (prezziMap[pompa.prodotto] || 0);
    });
    document.getElementById('kpi-dett-incasso').textContent = fmtE(dettIncasso);
    document.getElementById('kpi-dett-litri').textContent = fmtL(dettLitri);

    // Incasso mese da letture
    const lettPerData = {};
    (lettMeseRes.data||[]).forEach(l => { if (!lettPerData[l.data]) lettPerData[l.data] = []; lettPerData[l.data].push(l); });
    const dateOrd = Object.keys(lettPerData).sort();
    // Carica TUTTI i prezzi del mese in UNA query
    const { data: prezziMese } = await sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', oggiISO.substring(0,8)+'01').lte('data', oggiISO);
    const prezziMeseMap = {};
    (prezziMese||[]).forEach(p => { prezziMeseMap[p.data+'_'+p.prodotto] = Number(p.prezzo_litro); });

    let meseIncasso = 0;
    for (let i = 1; i < dateOrd.length; i++) {
      const dPrec = dateOrd[i-1], dCorr = dateOrd[i];
      (lettPerData[dCorr]||[]).forEach(l => {
        const lPrec = (lettPerData[dPrec]||[]).find(x => x.pompa_id === l.pompa_id);
        if (!lPrec) return;
        const lv = Number(l.lettura) - Number(lPrec.lettura); if (lv <= 0) return;
        const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
        meseIncasso += lv * (prezziMeseMap[dCorr+'_'+pompa.prodotto] || 0);
      });
    }
    document.getElementById('kpi-dett-mese').textContent = fmtE(meseIncasso);
  } catch(e) {
    console.error('Errore KPI dettaglio:', e);
  }

  const{data:rec}=await sb.from('ordini').select('*').order('created_at',{ascending:false}).limit(5);
  const tbody=document.getElementById('dashboard-ordini');
  tbody.innerHTML=rec&&rec.length?rec.map(r=>'<tr><td>'+r.data+'</td><td>'+esc(r.cliente)+'</td><td>'+esc(r.prodotto)+'</td><td style="font-family:var(--font-mono)">'+fmtL(r.litri)+'</td><td style="font-family:var(--font-mono)">'+fmtE(prezzoConIva(r)*r.litri)+'</td><td>'+badgeStato(r.stato)+'</td></tr>').join(''):'<tr><td colspan="6" class="loading">Nessun ordine</td></tr>';
  // Giacenza deposito + grafici in parallelo
  await Promise.all([caricaGiacenzaDashboard(), caricaGraficiDashboard()]);
}

async function caricaGiacenzaDashboard() {
  const { data: cisterne } = await sb.from('cisterne').select('*').eq('sede','deposito_vibo');
  const wrap = document.getElementById('dash-giacenza');
  if (!wrap) return;
  if (!cisterne || !cisterne.length) { wrap.innerHTML = '<div class="loading">Nessuna cisterna configurata</div>'; return; }
  const prodottiOrdine = ['Gasolio Autotrazione','Benzina','Gasolio Agricolo','HVO'];
  const perProdotto = {};
  cisterne.forEach(c => {
    const prod = c.prodotto || 'Altro';
    if (!perProdotto[prod]) perProdotto[prod] = { livello:0, capacita:0 };
    perProdotto[prod].livello += Number(c.livello_attuale || 0);
    perProdotto[prod].capacita += Number(c.capacita_max || 0);
  });
  let html = '';
  prodottiOrdine.forEach(prod => {
    const d = perProdotto[prod];
    if (!d) return;
    const pct = d.capacita > 0 ? Math.round((d.livello / d.capacita) * 100) : 0;
    const col = COLORI_DASH[prod] || { bg:'var(--bg-kpi)', color:'var(--text)', bar:'#888', dot:'#888' };
    const barColor = pct < 20 ? '#E24B4A' : pct < 40 ? '#BA7517' : col.bar;
    html += '<div style="background:' + col.bg + ';border-radius:var(--radius);padding:14px 16px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:8px"><div style="width:8px;height:8px;border-radius:50%;background:' + col.dot + '"></div><span style="font-size:10px;color:' + col.color + ';text-transform:uppercase;letter-spacing:0.6px;font-weight:500">' + prod + '</span></div>';
    html += '<div style="font-size:20px;font-weight:500;font-family:var(--font-mono);color:' + col.color + '">' + fmtL(d.livello) + '</div>';
    html += '<div style="display:flex;align-items:center;gap:8px;margin-top:6px">';
    html += '<div style="flex:1;height:6px;background:rgba(0,0,0,0.08);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barColor + ';border-radius:3px"></div></div>';
    html += '<span style="font-size:11px;color:' + col.color + ';font-weight:500">' + pct + '%</span>';
    html += '</div>';
    html += '<div style="font-size:10px;color:' + col.color + ';opacity:0.7;margin-top:4px">Cap. ' + fmtL(d.capacita) + '</div>';
    html += '</div>';
  });
  wrap.innerHTML = html;
}

// ── GRAFICI DASHBOARD ────────────────────────────────────────────
let _chartFatturato=null, _chartProdotti=null, _chartMargine=null, _chartVenditeMese=null;

async function caricaGraficiDashboard() {
  // Fatturato ultimi 7 giorni
  const giorni = [];
  for (let i=6; i>=0; i--) {
    const d = new Date(oggi); d.setDate(d.getDate()-i);
    giorni.push(d.toISOString().split('T')[0]);
  }
  const { data: ord7 } = await sb.from('ordini').select('*').gte('data', giorni[0]).lte('data', giorni[6]).neq('stato','annullato').eq('tipo_ordine','cliente');

  const fattPerGiorno = {};
  giorni.forEach(g => { fattPerGiorno[g]=0; });
  (ord7||[]).forEach(r => {
    if (fattPerGiorno[r.data] !== undefined) {
      fattPerGiorno[r.data] += prezzoConIva(r) * Number(r.litri);
    }
  });

  const labels7 = giorni.map(g => { const d=new Date(g); return d.getDate()+'/'+(d.getMonth()+1); });
  const ctx1 = document.getElementById('chart-fatturato');
  if (ctx1) {
    if (_chartFatturato) _chartFatturato.destroy();
    _chartFatturato = new Chart(ctx1.getContext('2d'), {
      type:'bar', data:{
        labels:labels7,
        datasets:[{ label:'Fatturato €', data:giorni.map(g=>Math.round(fattPerGiorno[g]*100)/100), backgroundColor:'#D4A017', borderRadius:6 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}}} }
    });
  }

  // Dati mese corrente
  const inizio = new Date(oggi.getFullYear(),oggi.getMonth(),1).toISOString().split('T')[0];
  const { data: ordMese } = await sb.from('ordini').select('*').gte('data', inizio).neq('stato','annullato').eq('tipo_ordine','cliente');

  // Litri per prodotto (mese) — ISTOGRAMMA
  const perProd = {};
  const prodColori = getColoriProdotti();
  (ordMese||[]).forEach(r => { perProd[r.prodotto] = (perProd[r.prodotto]||0) + Number(r.litri); });
  const prodLabels = Object.keys(perProd);
  const ctx2 = document.getElementById('chart-prodotti');
  if (ctx2) {
    if (_chartProdotti) _chartProdotti.destroy();
    _chartProdotti = new Chart(ctx2.getContext('2d'), {
      type:'bar', data:{
        labels:prodLabels,
        datasets:[{ label:'Litri', data:prodLabels.map(p=>Math.round(perProd[p])), backgroundColor:prodLabels.map(p=>prodColori[p]||'#888'), borderRadius:6 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtL(v)}}} }
    });
  }

  // Vendite giornaliere mese corrente
  const giorniMese = [];
  const primoGiorno = new Date(oggi.getFullYear(), oggi.getMonth(), 1);
  for (let d = new Date(primoGiorno); d <= oggi; d.setDate(d.getDate()+1)) {
    giorniMese.push(d.toISOString().split('T')[0]);
  }
  const vendPerGiorno = {};
  giorniMese.forEach(g => { vendPerGiorno[g] = 0; });
  (ordMese||[]).forEach(r => {
    if (vendPerGiorno[r.data] !== undefined) {
      vendPerGiorno[r.data] += prezzoConIva(r) * Number(r.litri);
    }
  });
  const labelsM = giorniMese.map(g => { const d=new Date(g); return d.getDate()+'/'+(d.getMonth()+1); });
  const ctx4 = document.getElementById('chart-vendite-mese');
  if (ctx4) {
    if (_chartVenditeMese) _chartVenditeMese.destroy();
    _chartVenditeMese = new Chart(ctx4.getContext('2d'), {
      type:'bar', data:{
        labels:labelsM,
        datasets:[{ label:'Vendite €', data:giorniMese.map(g=>Math.round(vendPerGiorno[g]*100)/100), backgroundColor:'#D85A30', borderRadius:4 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}},x:{ticks:{maxTicksLimit:15,font:{size:9}}}} }
    });
  }

  // Margine ultimi 30 giorni
  const giorni30 = [];
  for (let i=29; i>=0; i--) {
    const d = new Date(oggi); d.setDate(d.getDate()-i);
    giorni30.push(d.toISOString().split('T')[0]);
  }
  const { data: ord30 } = await sb.from('ordini').select('*').gte('data', giorni30[0]).neq('stato','annullato').eq('tipo_ordine','cliente');
  const marg30 = {};
  giorni30.forEach(g => { marg30[g]=0; });
  (ord30||[]).forEach(r => { if (marg30[r.data]!==undefined) marg30[r.data] += Number(r.margine)*Number(r.litri); });

  const labels30 = giorni30.map(g => { const d=new Date(g); return d.getDate()+'/'+(d.getMonth()+1); });
  const ctx3 = document.getElementById('chart-margine');
  if (ctx3) {
    if (_chartMargine) _chartMargine.destroy();
    _chartMargine = new Chart(ctx3.getContext('2d'), {
      type:'line', data:{
        labels:labels30,
        datasets:[{ label:'Margine €', data:giorni30.map(g=>Math.round(marg30[g]*100)/100), borderColor:'#639922', backgroundColor:'rgba(99,153,34,0.1)', fill:true, tension:0.3, pointRadius:2 }]
      }, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>'€ '+v}},x:{ticks:{maxTicksLimit:10,font:{size:10}}}} }
    });
  }

  // NOTIFICHE — ordini in attesa da più di 3 giorni
  await caricaNotificheDashboard();
}

async function caricaNotificheDashboard() {
  const treGiorniFa = new Date(oggi);
  treGiorniFa.setDate(treGiorniFa.getDate() - 3);
  const limiteData = treGiorniFa.toISOString().split('T')[0];

  const { data: ordiniVecchi } = await sb.from('ordini').select('*').eq('stato','in attesa').lte('data', limiteData).order('data');
  const wrap = document.getElementById('dash-notifiche');
  if (!ordiniVecchi || !ordiniVecchi.length) { wrap.style.display = 'none'; return; }

  wrap.style.display = 'block';
  let html = '<div class="card" style="border-left:4px solid #E24B4A;background:#FFF8F8">';
  html += '<div class="card-title" style="color:#A32D2D;display:flex;align-items:center;gap:8px">⚠️ Ordini in attesa da più di 3 giorni <span class="badge red">' + ordiniVecchi.length + '</span></div>';
  html += '<div style="overflow-x:auto"><table><thead><tr><th>Data</th><th>Cliente</th><th>Prodotto</th><th>Litri</th><th>Totale</th><th>Giorni</th><th>Azioni</th></tr></thead><tbody>';
  ordiniVecchi.forEach(r => {
    const tot = prezzoConIva(r) * Number(r.litri);
    const giorniPassati = Math.floor((oggi - new Date(r.data)) / (1000*60*60*24));
    html += '<tr><td>' + r.data + '</td><td><strong>' + esc(r.cliente) + '</strong></td><td>' + esc(r.prodotto) + '</td><td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(tot) + '</td>';
    html += '<td><span class="badge red">' + giorniPassati + ' gg</span></td>';
    html += '<td><button class="btn-edit" title="Riprogramma" onclick="riprogrammaOrdine(\'' + r.id + '\')">📅</button>';
    html += '<button class="btn-danger" title="Annulla" onclick="annullaOrdine(\'' + r.id + '\')">x</button></td></tr>';
  });
  html += '</tbody></table></div></div>';
  wrap.innerHTML = html;
}

// ── AVVIO ─────────────────────────────────────────────────────────
inizializza();

// ── PWA SERVICE WORKER ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
