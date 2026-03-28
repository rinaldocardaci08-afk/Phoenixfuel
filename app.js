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
  var postLabelsInit = { 'ufficio':'🏢 Ufficio', 'stazione_oppido':'⛽ Stazione Oppido', 'deposito_vibo':'🏭 Deposito Vibo', 'logistica':'🚛 Logistica' };
  document.getElementById('utente-postazione').textContent = postLabelsInit[utente.postazione] || '';
  await costruisciMenu(utente.ruolo, utente.id);
  if (utente.ruolo === 'cliente') { setSection('cliente', document.querySelector('.nav-item')); }
  else {
    await Promise.all([caricaCacheProdotti(), caricaSelectClienti('ord-cliente')]);
    initForms(); aggiornaSelezioniOrdine();
    // Apri sezione in base alla postazione
    var sezionePost = { 'stazione_oppido':'stazione', 'deposito_vibo':'deposito', 'logistica':'logistica' };
    var sezioneIniziale = sezionePost[utente.postazione] || 'dashboard';
    var navItem = document.querySelector('.nav-item[onclick*="' + sezioneIniziale + '"]') || document.querySelector('.nav-item');
    setSection(sezioneIniziale, navItem);
  }
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
  const filtroData = document.getElementById('filtro-data-prezzi').value;
  let query = sb.from('prezzi').select('*, basi_carico(nome)').order('data',{ascending:false}).order('fornitore');
  if (filtroData) query = query.eq('data', filtroData);
  else query = query.limit(200); // Limite sicurezza se nessun filtro

  // Query parallele
  const [prezziRes, cisterneRes, baseDepRes] = await Promise.all([
    query,
    sb.from('cisterne').select('*').eq('sede','deposito_vibo'),
    sb.from('basi_carico').select('*').ilike('nome','%phoenix%').maybeSingle()
  ]);
  const data = prezziRes.data;
  const cisterne = cisterneRes.data;
  const baseDeposito = baseDepRes.data;
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
      const cmp = Number(c.costo_medio||0);
      totG += livAtt;
      cisHtml += '<div class="dep-cisterna' + (pct < 30 ? ' alert' : '') + '">' +
        '<div class="dep-cisterna-name">' + c.nome + '</div>' +
        cisternasvg(pct, colore) +
        '<div class="dep-cisterna-litri">' + _sep(livAtt.toLocaleString('it-IT')) + ' ' + um + '</div>' +
        '<div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(capMax.toLocaleString('it-IT')) + ' ' + um + '</div>' +
        (cmp > 0 ? '<div style="font-size:9px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmp.toFixed(4) + '</strong></div>' : '') +
        '</div>';
    });

    const subLabel = nCis + (nCis === 1 ? ' cisterna' : ' cisterne') + ' · ' + _sep(capGruppo.toLocaleString('it-IT')) + ' ' + um;
    const totLabel = um === 'pz' ? _sep(totG.toLocaleString('it-IT')) + ' pz' : fmtL(totG);
    // CMP medio ponderato per il gruppo
    let cmpGruppo = 0;
    if (um !== 'pz') {
      let valGruppo = 0;
      gruppo.forEach(c => { valGruppo += Number(c.livello_attuale||0) * Number(c.costo_medio||0); });
      cmpGruppo = totG > 0 ? valGruppo / totG : 0;
    }
    const cmpLabel = cmpGruppo > 0 ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmpGruppo.toFixed(4) + '</strong> · Valore: <strong style="font-family:var(--font-mono)">' + fmtE(totG * cmpGruppo) + '</strong></div>' : '';
    const cardHtml = '<div class="card"><div class="dep-product-header"><div class="dep-product-dot" style="background:' + colore + '"></div><div><div class="dep-product-title">' + esc(prodNome) + '</div><div class="dep-product-sub">' + subLabel + '</div>' + cmpLabel + '</div><div class="dep-product-total">' + totLabel + '</div></div><div class="dep-cisterne-grid">' + cisHtml + '</div></div>';

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
  const cmpPrec = Number(cis.costo_medio||0);
  const litriPrec = Number(cis.livello_attuale);
  if (tipo==='entrata') {
    nuovoLivello = litriPrec + Number(litri);
    if (costoLitro && costoLitro > 0 && nuovoLivello > 0) {
      const costoVecchio = litriPrec * cmpPrec;
      nuovoCostoMedio = (costoVecchio + Number(litri)*Number(costoLitro)) / nuovoLivello;
      nuovoCostoMedio = Math.round(nuovoCostoMedio * 1000000) / 1000000;
    }
  } else {
    nuovoLivello = Math.max(0, litriPrec - Number(litri));
  }
  await sb.from('cisterne').update({ livello_attuale:nuovoLivello, costo_medio:nuovoCostoMedio, updated_at:new Date().toISOString() }).eq('id', cisternaId);
  await sb.from('movimenti_cisterne').insert([{ cisterna_id:cisternaId, ordine_id:ordineId, tipo, litri, data }]);
  // Registra variazione CMP nello storico se entrata con costo
  if (tipo === 'entrata' && costoLitro && costoLitro > 0) {
    await sb.from('stazione_cmp_storico').insert([{
      data: data || oggiISO,
      prodotto: cis.prodotto || '',
      sede: cis.sede || 'deposito_vibo',
      cmp_precedente: cmpPrec,
      cmp_nuovo: nuovoCostoMedio,
      litri_precedenti: litriPrec,
      litri_caricati: Number(litri),
      costo_carico: Number(costoLitro),
      ordine_id: ordineId
    }]);
  }
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
    if (qta > 0) await aggiornaCisterna(c.id, qta, 'entrata', ordineId, ordine.data, Number(ordine.costo_litro||0) + Number(ordine.trasporto_litro||0));
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

  // Popola selettori storico ordini autoconsumo
  var selOrdAnno = document.getElementById('ac-ord-anno');
  if (selOrdAnno && selOrdAnno.options.length === 0) {
    var annoC = new Date().getFullYear();
    for (var yy = annoC; yy >= annoC - 5; yy--) selOrdAnno.innerHTML += '<option value="' + yy + '"' + (yy===annoC?' selected':'') + '>' + yy + '</option>';
  }
  var selOrdMese = document.getElementById('ac-ord-mese');
  if (selOrdMese) selOrdMese.value = String(new Date().getMonth()+1).padStart(2,'0');
  caricaStoricoOrdiniAutoconsumo();
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

async function caricaStoricoOrdiniAutoconsumo() {
  var anno = document.getElementById('ac-ord-anno').value;
  var mese = document.getElementById('ac-ord-mese').value;
  if (!anno) return;

  var da = anno + '-' + (mese || '01') + '-01';
  var ultimoGg = mese ? new Date(Number(anno), Number(mese), 0).getDate() : 31;
  var a = anno + '-' + (mese || '12') + '-' + String(ultimoGg).padStart(2,'0');

  var { data: ordini } = await sb.from('ordini').select('*').eq('tipo_ordine','autoconsumo').neq('stato','annullato').gte('data', da).lte('data', a).order('data',{ascending:false});

  var tbody = document.getElementById('ac-storico-ordini');
  var totDiv = document.getElementById('ac-storico-totali');

  if (!ordini || !ordini.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessun ordine nel periodo</td></tr>';
    totDiv.innerHTML = '';
    return;
  }

  var totLitri = 0, totValore = 0;
  tbody.innerHTML = ordini.map(function(r, idx) {
    var costo = Number(r.costo_litro||0) + Number(r.trasporto_litro||0);
    var totale = costo * Number(r.litri);
    totLitri += Number(r.litri);
    totValore += totale;
    var ricevuto = r.caricato_deposito;
    var badge = ricevuto ? '<span class="badge green">Ricevuto</span>' : '<span class="badge amber">Da ricevere</span>';
    return '<tr' + (idx%2 ? ' style="background:var(--bg)"' : '') + '>' +
      '<td>' + r.data + '</td>' +
      '<td>' + esc(r.prodotto) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(r.litri) + '</td>' +
      '<td>' + esc(r.fornitore) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmt(costo) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:500">' + fmtE(totale) + '</td>' +
      '<td>' + badge + '</td></tr>';
  }).join('');

  var meseNome = mese ? ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1] : 'Anno ' + anno;
  totDiv.innerHTML = '<strong>' + ordini.length + ' ordini</strong> · ' + meseNome + ' ' + anno + ' · Totale: <strong>' + fmtL(totLitri) + ' L</strong> · Valore: <strong>' + fmtE(totValore) + '</strong>';
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

  // Costo approvvigionamento: priorità a stazione_costi (marginalità), fallback su ordini stazione
  const { data: ordStz } = await sb.from('ordini').select('*').eq('tipo_ordine','stazione_servizio').neq('stato','annullato').gte('data', da).lte('data', a);
  const costoApprovvOrdini = (ordStz||[]).reduce((s,r) => s + Number(r.costo_litro) * Number(r.litri), 0);
  const { data: costiMarg } = await sb.from('stazione_costi').select('*').gte('data', da).lte('data', a);
  const costiMargMap = {};
  (costiMarg||[]).forEach(c => { costiMargMap[c.data+'_'+c.prodotto] = Number(c.costo_litro); });

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

  // Calcola costi per giorno da stazione_costi
  let totCostoReale = 0;
  const hasCostiReali = Object.keys(costiMargMap).length > 0;
  dateOrdinate.forEach(data => {
    const gg = giorniMap[data];
    let costoG = 0;
    // Calcola costo usando dati reali da marginalità
    const costoGasolio = costiMargMap[data+'_Gasolio Autotrazione'] || 0;
    const costoBenzina = costiMargMap[data+'_Benzina'] || 0;
    costoG = (gg.litriG * costoGasolio) + (gg.litriB * costoBenzina);
    gg.costo = costoG;
    gg.margine = gg.incasso - costoG;
    totCostoReale += costoG;
  });
  // Fallback: se non ci sono costi reali, usa quelli dagli ordini stazione
  const costoApprovv = hasCostiReali ? totCostoReale : costoApprovvOrdini;
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
    tbody.innerHTML = dateOrdinate.map(d => {
      const g = giorniMap[d];
      const totG = g.litriG + g.litriB;
      const hasCosto = g.costo > 0;
      const margG = g.margine || 0;
      const margColor = margG >= 0 ? '#639922' : '#A32D2D';
      return '<tr><td>' + d + '</td><td style="font-family:var(--font-mono)">' + fmtL(g.litriG) + '</td><td style="font-family:var(--font-mono)">' + fmtL(g.litriB) + '</td><td style="font-family:var(--font-mono);font-weight:500">' + fmtL(totG) + '</td><td style="font-family:var(--font-mono)">' + fmtE(g.incasso) + '</td><td style="font-family:var(--font-mono);color:' + (hasCosto?'var(--text)':'var(--text-muted)') + '">' + (hasCosto ? fmtE(g.costo) : '—') + '</td><td style="font-family:var(--font-mono);color:' + (hasCosto ? margColor : 'var(--text-muted)') + '">' + (hasCosto ? fmtE(margG) : '—') + '</td></tr>';
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
  const { data: letture } = await sb.from('stazione_letture').select('data,pompa_id,lettura,litri_prezzo_diverso,prezzo_diverso').gte('data', da).lte('data', a).order('data');
  const { data: prezziP } = await sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', da).lte('data', a);
  const { data: costiP } = await sb.from('stazione_costi').select('data,prodotto,costo_litro').gte('data', da).lte('data', a);

  const pompeMap = {};
  (pompe||[]).forEach(p => { pompeMap[p.id] = p; });
  const prezziMap = {};
  (prezziP||[]).forEach(p => { prezziMap[p.data + '_' + p.prodotto] = Number(p.prezzo_litro); });
  const costiDetMap = {};
  (costiP||[]).forEach(c => { costiDetMap[c.data + '_' + c.prodotto] = Number(c.costo_litro); });

  // Calcola dettaglio per giorno
  const lettPerData = {};
  (letture||[]).forEach(l => { if (!lettPerData[l.data]) lettPerData[l.data] = []; lettPerData[l.data].push(l); });
  const dateOrd = Object.keys(lettPerData).sort();

  const dettaglioPerGiorno = {};
  dateOrd.forEach(data => {
    let litriG = 0, incassoG = 0, costoG = 0;
    lettPerData[data].forEach(l => {
      const pompa = pompeMap[l.pompa_id]; if (!pompa) return;
      const prev = dateOrd.filter(d => d < data);
      const prevD = prev.length ? prev[prev.length-1] : null;
      let precL = null;
      if (prevD && lettPerData[prevD]) { const pl = lettPerData[prevD].find(x => x.pompa_id === l.pompa_id); if (pl) precL = Number(pl.lettura); }
      if (precL === null) return;
      const lv = Number(l.lettura) - precL; if (lv <= 0) return;
      const pr = prezziMap[data + '_' + pompa.prodotto] || 0;
      const co = costiDetMap[data + '_' + pompa.prodotto] || 0;
      const litriPD = Number(l.litri_prezzo_diverso||0);
      const prezzoPD = Number(l.prezzo_diverso||0);
      const hasCambio = litriPD > 0 && prezzoPD > 0;
      const litriStd = hasCambio ? Math.max(0, lv - litriPD) : lv;
      litriG += lv;
      incassoG += (litriStd * pr) + (hasCambio ? litriPD * prezzoPD : 0);
      costoG += lv * co;
    });
    dettaglioPerGiorno[data] = { litri: litriG, incasso: incassoG, costo: costoG, margine: incassoG - costoG };
  });

  // Aggrega per mese
  const mesi = [];
  for (let m = 0; m < 12; m++) {
    let ingLitri=0, ingFatt=0, ingMarg=0, dettLitri=0, dettInc=0, dettMarg=0;
    const mStr = String(m+1).padStart(2,'0');
    const prefix = anno + '-' + mStr;

    allIng.forEach(r => { if (r.data.startsWith(prefix)) { ingLitri += Number(r.litri); ingFatt += prezzoNoIva(r)*Number(r.litri); ingMarg += Number(r.margine)*Number(r.litri); } });
    Object.entries(dettaglioPerGiorno).forEach(([d,v]) => { if (d.startsWith(prefix)) { dettLitri += v.litri; dettInc += v.incasso; dettMarg += v.margine; } });

    mesi.push({ mese: MESI_NOMI[m], ingLitri, ingFatt, ingMarg, dettLitri, dettInc, dettMarg, totLitri: ingLitri+dettLitri, totFatt: ingFatt+dettInc, totMarg: ingMarg+dettMarg });
  }

  // Tabella
  const tbody = document.getElementById('tabella-vend-annuale');
  let totIL=0,totIF=0,totIM=0,totDL=0,totDI=0,totDM=0,totTL=0,totTF=0,totTM=0;
  tbody.innerHTML = mesi.map(m => {
    totIL+=m.ingLitri; totIF+=m.ingFatt; totIM+=m.ingMarg; totDL+=m.dettLitri; totDI+=m.dettInc; totDM+=m.dettMarg; totTL+=m.totLitri; totTF+=m.totFatt; totTM+=m.totMarg;
    const hasData = m.ingLitri > 0 || m.dettLitri > 0;
    const dmColor = m.dettMarg >= 0 ? '#639922' : '#E24B4A';
    const tmColor = m.totMarg >= 0 ? '#639922' : '#E24B4A';
    return '<tr' + (!hasData?' style="opacity:0.4"':'') + '><td><strong>' + m.mese + '</strong></td><td style="font-family:var(--font-mono)">' + fmtL(m.ingLitri) + '</td><td style="font-family:var(--font-mono)">' + fmtE(m.ingFatt) + '</td><td style="font-family:var(--font-mono);color:#639922">' + fmtE(m.ingMarg) + '</td><td style="font-family:var(--font-mono);color:#6B5FCC">' + fmtL(m.dettLitri) + '</td><td style="font-family:var(--font-mono);color:#6B5FCC">' + fmtE(m.dettInc) + '</td><td style="font-family:var(--font-mono);color:' + dmColor + '">' + fmtE(m.dettMarg) + '</td><td style="font-family:var(--font-mono);font-weight:500">' + fmtL(m.totLitri) + '</td><td style="font-family:var(--font-mono);font-weight:500">' + fmtE(m.totFatt) + '</td><td style="font-family:var(--font-mono);font-weight:bold;color:' + tmColor + '">' + fmtE(m.totMarg) + '</td></tr>';
  }).join('');
  const tmTotColor = totTM >= 0 ? '#639922' : '#E24B4A';
  tbody.innerHTML += '<tr style="border-top:2px solid var(--accent);font-weight:600"><td>TOTALE ' + anno + '</td><td style="font-family:var(--font-mono)">' + fmtL(totIL) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totIF) + '</td><td style="font-family:var(--font-mono);color:#639922">' + fmtE(totIM) + '</td><td style="font-family:var(--font-mono);color:#6B5FCC">' + fmtL(totDL) + '</td><td style="font-family:var(--font-mono);color:#6B5FCC">' + fmtE(totDI) + '</td><td style="font-family:var(--font-mono);color:#639922">' + fmtE(totDM) + '</td><td style="font-family:var(--font-mono)">' + fmtL(totTL) + '</td><td style="font-family:var(--font-mono)">' + fmtE(totTF) + '</td><td style="font-family:var(--font-mono);font-weight:bold;color:' + tmTotColor + '">' + fmtE(totTM) + '</td></tr>';

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
  html += '<table><thead><tr><th>Mese</th><th>Litri ingrosso</th><th>Fatt. ingrosso</th><th>Margine ingrosso</th><th>Litri dettaglio</th><th>Incasso dettaglio</th><th>Margine dettaglio</th><th>Totale litri</th><th>Totale fatturato</th><th>Totale margine</th></tr></thead><tbody>';
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
  const record = { nome:document.getElementById('cl-nome').value.trim(), tipo:document.getElementById('cl-tipo').value, cliente_rete:document.getElementById('cl-rete').checked, piva:document.getElementById('cl-piva').value, codice_fiscale:document.getElementById('cl-cf').value, indirizzo:document.getElementById('cl-indirizzo').value, citta:document.getElementById('cl-citta').value, provincia:document.getElementById('cl-provincia').value, telefono:document.getElementById('cl-telefono').value, email:document.getElementById('cl-email').value, giorni_pagamento:parseInt(document.getElementById('cl-gg').value), zona_consegna:document.getElementById('cl-zona').value, prodotti_abituali:document.getElementById('cl-prodotti').value, note:document.getElementById('cl-note').value };
  // Fido: solo admin può modificarlo
  var isAdmin = utenteCorrente && utenteCorrente.ruolo === 'admin';
  if (isAdmin) {
    record.fido_massimo = parseFloat(document.getElementById('cl-fido').value) || 0;
  }
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
  // Fido: solo admin può modificarlo
  var fidoEl = document.getElementById('cl-fido');
  if (fidoEl) {
    var isAdmin = utenteCorrente && utenteCorrente.ruolo === 'admin';
    fidoEl.disabled = !isAdmin;
    fidoEl.style.opacity = isAdmin ? '1' : '0.5';
    fidoEl.title = isAdmin ? '' : 'Solo l\'amministratore può modificare il fido';
  }
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-clienti').style.display='block';
  document.getElementById('modal-fornitori').style.display='none';
}

async function caricaClienti() {
  const { data } = await sb.from('clienti').select('*').order('nome');
  const tbody = document.getElementById('tabella-clienti');
  if (!data||!data.length) { tbody.innerHTML = '<tr><td colspan="13" class="loading">Nessun cliente</td></tr>'; return; }

  var attivi = data.filter(function(r){ return r.attivo !== false; });
  var inattivi = data.filter(function(r){ return r.attivo === false; });

  // Carica ordini non pagati per fido
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

  function rigaCliente(r) {
    let fidoUsatoHtml = '—', fidoResiduoHtml = '—';
    const fidoMax = Number(r.fido_massimo || 0);
    if (fidoMax > 0) {
      const ordini = (ordiniMap[r.id]||[]).concat(ordiniMap[r.nome]||[]);
      const seen = new Set();
      let usato = 0;
      ordini.forEach(o => {
        const k = o.cliente_id + '_' + o.data + '_' + o.litri;
        if (seen.has(k)) return; seen.add(k);
        const scad = new Date(o.data);
        scad.setDate(scad.getDate() + (o.giorni_pagamento || r.giorni_pagamento || 30));
        if (scad > oggi) usato += prezzoConIva(o) * Number(o.litri);
      });
      const residuo = fidoMax - usato;
      fidoUsatoHtml = '<span style="font-family:var(--font-mono)">' + fmtE(usato) + '</span>';
      fidoResiduoHtml = fidoBar(usato, fidoMax) + ' <span style="font-size:11px;font-family:var(--font-mono)">' + fmtE(residuo) + '</span>';
    }
    return '<tr><td><strong>' + esc(r.nome) + '</strong></td><td><span class="badge blue">' + esc(r.tipo||'azienda') + '</span></td><td>' + (r.cliente_rete ? '<span class="badge purple">Rete</span>' : '<span class="badge gray">Consumo</span>') + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.piva||'—') + '</td><td>' + esc(r.citta||'—') + '</td><td>' + esc(r.telefono||'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(fidoMax):'—') + '</td><td>' + fidoUsatoHtml + '</td><td>' + fidoResiduoHtml + '</td><td>' + (r.giorni_pagamento||30) + ' gg</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.prodotti_abituali||'—') + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="apriSchedaCliente(\'' + r.id + '\',\'' + esc(r.nome).replace(/'/g,"\\'") + '\')">📋 Scheda</button> <button class="btn-edit" onclick="apriModaleCliente(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'clienti\',\'' + r.id + '\',caricaClienti)">x</button></td></tr>';
  }

  var html = attivi.map(rigaCliente).join('');
  if (inattivi.length) {
    html += '<tr><td colspan="13" style="background:var(--bg);padding:12px;font-size:12px;font-weight:600;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;border-top:2px solid var(--border)">Clienti inattivi (' + inattivi.length + ')</td></tr>';
    html += inattivi.map(function(r) { return rigaCliente(r).replace('<tr>', '<tr style="opacity:0.5">'); }).join('');
  }
  tbody.innerHTML = html;
}

function filtraClienti() {
  const q = (document.getElementById('search-clienti').value||'').toLowerCase();
  const righe = document.querySelectorAll('#tabella-clienti tr');
  righe.forEach(tr => {
    if (tr.querySelector('td[colspan]')) { tr.style.display = q ? 'none' : ''; return; }
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
    '<label style="font-size:10px;display:flex;align-items:center;gap:3px;cursor:pointer"><input type="radio" name="sede-default" class="sede-r-default" ' + (s && s.is_default ? 'checked' : '') + ' /> def.</label></div>';
  lista.appendChild(div);
}

async function caricaSediCliente(clienteId) {
  const wrap = document.getElementById('cl-sedi-wrap');
  const lista = document.getElementById('cl-sedi-lista');
  if (!clienteId) { wrap.style.display = 'none'; lista.innerHTML = ''; return; }
  wrap.style.display = 'block';
  lista.innerHTML = '';
  const { data: sedi } = await sb.from('sedi_scarico').select('*').eq('cliente_id', clienteId).eq('attivo', true).order('is_default',{ascending:false}).order('nome');
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
    const is_default = row.querySelector('.sede-r-default').checked;
    if (!nome) continue;

    const record = { cliente_id: clienteId, nome, indirizzo, citta, is_default };

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

  // Carica TUTTI gli ordini per fido fornitori in UNA query
  const fornConFido = data.filter(r => Number(r.fido_massimo||0) > 0 || Number(r.fido||0) > 0);
  let ordFornMap = {};
  if (fornConFido.length) {
    const nomi = fornConFido.map(f => f.nome);
    var limiteAnno = new Date(); limiteAnno.setFullYear(limiteAnno.getFullYear()-1);
    var limiteAnnoISO = limiteAnno.toISOString().split('T')[0];
    const { data: ordTutti } = await sb.from('ordini').select('fornitore,data,costo_litro,trasporto_litro,litri,giorni_pagamento,pagato_fornitore').neq('stato','annullato').in('fornitore', nomi).gte('data',limiteAnnoISO);
    (ordTutti||[]).forEach(o => {
      if (!ordFornMap[o.fornitore]) ordFornMap[o.fornitore] = [];
      ordFornMap[o.fornitore].push(o);
    });
  }

  tbody.innerHTML = data.map(r => {
    let usato = 0, residuo = 0;
    const fidoMax = Number(r.fido_massimo||0) || Number(r.fido||0);
    const ggPag = r.giorni_pagamento || 30;
    if (fidoMax > 0) {
      const ords = ordFornMap[r.nome] || [];
      ords.forEach(o => {
        if (o.pagato_fornitore) return;
        // Considera scadute come pagate (stessa logica della scheda)
        if (o.data) {
          var scad = new Date(o.data);
          scad.setDate(scad.getDate() + (o.giorni_pagamento || ggPag));
          if (scad <= oggi) return; // Scaduta = pagata
        }
        usato += (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri);
      });
      residuo = fidoMax - usato;
    }
    const basi=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.basi_carico?.nome).filter(Boolean).join(', '):'—';
    return '<tr><td><strong>' + esc(r.nome) + '</strong></td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.piva||'—') + '</td><td>' + esc(r.citta||'—') + '</td><td>' + esc(r.contatto||'—') + '</td><td>' + esc(r.telefono||'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(fidoMax):'—') + '</td><td style="font-family:var(--font-mono)">' + (fidoMax>0?fmtE(usato):'—') + '</td><td>' + (fidoMax>0?fidoBar(usato,fidoMax)+' <span style="font-size:11px;font-family:var(--font-mono)">'+fmtE(residuo)+'</span>':'—') + '</td><td>' + ggPag + ' gg</td><td style="font-size:11px;color:var(--text-muted)">' + esc(basi) + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.note||'—') + '</td><td><button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="apriSchedaFornitore(\'' + r.id + '\',\'' + String(r.nome||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'") + '\')">📋 Scheda</button> <button class="btn-edit" onclick="apriModaleFornitore(\'' + r.id + '\')">✏️</button><button class="btn-danger" onclick="eliminaRecord(\'fornitori\',\'' + r.id + '\',caricaFornitori)">x</button></td></tr>';
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

async function apriSchedaFornitore(fornitoreId, fornitoreNome) {
  const { data: fornitore } = await sb.from('fornitori').select('*').eq('id', fornitoreId).single();
  if (!fornitore) { toast('Fornitore non trovato'); return; }

  // Ordini di acquisto da questo fornitore
  const { data: ordini } = await sb.from('ordini').select('id,data,prodotto,litri,costo_litro,trasporto_litro,iva,stato,tipo_ordine,pagato_fornitore,data_pagamento_fornitore,giorni_pagamento').eq('fornitore', fornitoreNome).neq('stato','annullato').order('data',{ascending:false}).limit(500);

  // Auto-pagamento: segna come pagate le fatture scadute (batch)
  var ggPag = fornitore.giorni_pagamento || 30;
  var idsScaduti = [];
  var datePag = {};
  (ordini||[]).forEach(function(o) {
    if (o.pagato_fornitore || !o.data) return;
    var scadenza = new Date(o.data);
    scadenza.setDate(scadenza.getDate() + (o.giorni_pagamento || ggPag));
    if (scadenza <= oggi) {
      idsScaduti.push(o.id);
      datePag[o.id] = scadenza.toISOString().split('T')[0];
    }
  });
  if (idsScaduti.length) {
    try {
      await Promise.all(idsScaduti.map(function(id) {
        return sb.from('ordini').update({ pagato_fornitore: true, data_pagamento_fornitore: datePag[id] }).eq('id', id);
      }));
      (ordini||[]).forEach(function(o) {
        if (datePag[o.id]) { o.pagato_fornitore = true; o.data_pagamento_fornitore = datePag[o.id]; }
      });
      toast(idsScaduti.length + ' fatture scadute segnate come pagate');
    } catch(e) { console.warn('Auto-pagamento fallito:', e); }
  }

  const fidoMax = Number(fornitore.fido_massimo||0) || Number(fornitore.fido||0);
  var fidoUsato = 0, totNonPagato = 0, totPagato = 0;
  (ordini||[]).forEach(function(o) {
    var costo = (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri);
    if (o.pagato_fornitore) { totPagato += costo; }
    else { fidoUsato += costo; totNonPagato += costo; }
  });
  var fidoResiduo = fidoMax > 0 ? fidoMax - fidoUsato : 0;
  var pctFido = fidoMax > 0 ? Math.round((fidoUsato / fidoMax) * 100) : 0;

  var html = '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:16px;flex-wrap:wrap;gap:12px">';
  html += '<div><div style="font-size:18px;font-weight:500">' + esc(fornitoreNome) + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-top:2px">' + esc(fornitore.citta||'—') + ' · P.IVA: ' + esc(fornitore.piva||'—') + ' · Pag. ' + ggPag + ' gg</div></div>';

  // Grafico fido
  if (fidoMax > 0) {
    var fidoColor = pctFido >= 90 ? '#A32D2D' : pctFido >= 60 ? '#BA7517' : '#639922';
    html += '<div style="text-align:right;min-width:200px">';
    html += '<div style="font-size:10px;color:var(--text-hint);text-transform:uppercase;margin-bottom:4px">Fido fornitore</div>';
    html += '<div style="display:flex;gap:12px;justify-content:flex-end;margin-bottom:6px">';
    html += '<div style="text-align:center"><div style="font-size:9px;color:var(--text-muted)">Fido</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600">' + fmtE(fidoMax) + '</div></div>';
    html += '<div style="text-align:center"><div style="font-size:9px;color:var(--text-muted)">Utilizzato</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:' + fidoColor + '">' + fmtE(fidoUsato) + '</div></div>';
    html += '<div style="text-align:center"><div style="font-size:9px;color:var(--text-muted)">Disponibile</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:#639922">' + fmtE(fidoResiduo) + '</div></div>';
    html += '</div>';
    html += '<div style="height:8px;width:100%;background:var(--border);border-radius:4px"><div style="height:100%;width:' + Math.min(100,pctFido) + '%;background:' + fidoColor + ';border-radius:4px;transition:width 0.3s"></div></div>';
    html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + pctFido + '% utilizzato</div>';
    html += '</div>';
  }
  html += '</div>';

  // Tabella ordini con gestione pagamenti
  html += '<div style="max-height:400px;overflow-y:auto">';
  html += '<table style="width:100%;font-size:12px"><thead><tr><th>Data</th><th>Tipo</th><th>Prodotto</th><th>Litri</th><th>Costo/L</th><th>Totale</th><th>Scadenza</th><th>Pagato</th><th>Data pag.</th></tr></thead><tbody>';

  if (!ordini || !ordini.length) {
    html += '<tr><td colspan="9" class="loading">Nessun ordine</td></tr>';
  } else {
    ordini.forEach(function(o) {
      var costoUnitario = Number(o.costo_litro||0) + Number(o.trasporto_litro||0);
      var tot = costoUnitario * Number(o.litri);
      var isPagato = o.pagato_fornitore === true;
      var scadData = new Date(o.data);
      scadData.setDate(scadData.getDate() + (o.giorni_pagamento || ggPag));
      var scadISO = scadData.toISOString().split('T')[0];
      var isScaduto = !isPagato && scadData <= oggi;
      var tipoLabel = o.tipo_ordine === 'stazione_servizio' ? '<span class="badge purple" style="font-size:9px">Stazione</span>' : o.tipo_ordine === 'entrata_deposito' ? '<span class="badge teal" style="font-size:9px">Deposito</span>' : '<span class="badge blue" style="font-size:9px">' + esc(o.tipo_ordine) + '</span>';
      var rowStyle = isPagato ? 'opacity:0.5' : '';

      html += '<tr style="' + rowStyle + '">';
      html += '<td>' + o.data + '</td>';
      html += '<td>' + tipoLabel + '</td>';
      html += '<td style="font-size:11px">' + esc(o.prodotto) + '</td>';
      html += '<td style="font-family:var(--font-mono)">' + fmtL(o.litri) + '</td>';
      html += '<td style="font-family:var(--font-mono)">€ ' + costoUnitario.toFixed(4) + '</td>';
      html += '<td style="font-family:var(--font-mono);font-weight:500">' + fmtE(tot) + '</td>';
      html += '<td style="font-size:11px">' + scadISO + (isScaduto ? ' <span style="color:#A32D2D;font-size:9px;font-weight:500">SCADUTA</span>' : '') + '</td>';
      html += '<td><input type="checkbox" ' + (isPagato ? 'checked' : '') + ' onchange="togglePagamentoFornitore(\'' + o.id + '\',this.checked,\'' + fornitoreId + '\',\'' + fornitoreNome.replace(/'/g,"\\'") + '\')" /></td>';
      html += '<td>';
      if (isPagato && o.data_pagamento_fornitore) {
        html += '<span style="font-size:11px;color:#639922">' + o.data_pagamento_fornitore + '</span>';
      } else {
        html += '<input type="date" style="font-size:11px;padding:2px 4px;border:0.5px solid var(--border);border-radius:4px;background:var(--bg)" value="' + (o.data_pagamento_fornitore||'') + '" onchange="impostaDataPagFornitore(\'' + o.id + '\',this.value,\'' + fornitoreId + '\',\'' + fornitoreNome.replace(/'/g,"\\'") + '\')" />';
      }
      html += '</td>';
      html += '</tr>';
    });
  }

  html += '</tbody></table></div>';

  // Riepilogo
  var totOrdini = (ordini||[]).length;
  var nPagati = (ordini||[]).filter(function(o){return o.pagato_fornitore;}).length;
  var nDaPagare = totOrdini - nPagati;
  html += '<div style="display:flex;gap:16px;margin-top:12px;font-size:11px;color:var(--text-muted);flex-wrap:wrap">';
  html += '<span>Totale ordini: <strong>' + totOrdini + '</strong></span>';
  html += '<span style="color:#639922">Pagati: <strong>' + nPagati + '</strong> (' + fmtE(totPagato) + ')</span>';
  html += '<span>Da pagare: <strong>' + nDaPagare + '</strong> (' + fmtE(totNonPagato) + ')</span>';
  html += '</div>';

  html += '<button class="btn-primary" style="width:100%;margin-top:14px" onclick="chiudiModalePermessi()">Chiudi</button>';
  apriModal(html);
}

async function togglePagamentoFornitore(ordineId, pagato, fornitoreId, fornitoreNome) {
  var update = { pagato_fornitore: pagato };
  if (pagato) update.data_pagamento_fornitore = oggiISO;
  else update.data_pagamento_fornitore = null;
  var { error } = await sb.from('ordini').update(update).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast(pagato ? '✅ Fattura segnata come pagata' : 'Fattura segnata come non pagata');
  apriSchedaFornitore(fornitoreId, fornitoreNome);
}

async function impostaDataPagFornitore(ordineId, data, fornitoreId, fornitoreNome) {
  var { error } = await sb.from('ordini').update({ data_pagamento_fornitore: data || null }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('Data pagamento aggiornata');
  apriSchedaFornitore(fornitoreId, fornitoreNome);
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
  const loaders = { 'stz-dashboard':caricaStazioneDashboard, 'stz-letture':caricaTabLetture, 'stz-prezzi':caricaTabPrezzi, 'stz-versamenti':caricaTabVersamenti, 'stz-magazzino':caricaMagazzinoStazione, 'stz-marginalita':caricaMarginalita, 'stz-cassa':caricaCassa, 'stz-report':initReportStazione };
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

  // Carica dati ordine per mostrare costo
  const { data: ordine } = await sb.from('ordini').select('costo_litro,trasporto_litro').eq('id',ordineId).single();
  const costoOrdine = ordine ? Number(ordine.costo_litro||0) + Number(ordine.trasporto_litro||0) : 0;

  const prodInfo = cacheProdotti.find(p => p.nome === prodotto);
  const colore = prodInfo ? prodInfo.colore : '#888';
  const totLitri = Number(litri);

  // Calcola CMP attuale per questo prodotto
  let litriAttuali = 0, valoreAttuale = 0;
  cisterne.forEach(c => { litriAttuali += Number(c.livello_attuale||0); valoreAttuale += Number(c.livello_attuale||0) * Number(c.costo_medio||0); });
  const cmpAttuale = litriAttuali > 0 ? valoreAttuale / litriAttuali : 0;
  const cmpDopo = (litriAttuali + totLitri) > 0 ? (valoreAttuale + totLitri * costoOrdine) / (litriAttuali + totLitri) : costoOrdine;

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">📦 Ricezione ' + esc(prodotto) + '</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:12px">Quantità da caricare: <strong style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</strong></div>';

  // Info CMP
  html += '<div style="display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap">';
  html += '<div style="flex:1;min-width:100px;padding:8px 12px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Costo carico</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">€ ' + costoOrdine.toFixed(4) + '</div></div>';
  html += '<div style="flex:1;min-width:100px;padding:8px 12px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">CMP attuale</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + (cmpAttuale > 0 ? '€ ' + cmpAttuale.toFixed(4) : '—') + '</div></div>';
  html += '<div style="flex:1;min-width:100px;padding:8px 12px;background:#EAF3DE;border-radius:8px;border:0.5px solid #639922"><div style="font-size:9px;color:#27500A;text-transform:uppercase">CMP dopo carico</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#639922">€ ' + cmpDopo.toFixed(4) + '</div></div>';
  html += '</div>';

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

  // Carica ordine per ottenere costo e trasporto
  const { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }
  const costoCarico = Number(ordine.costo_litro || 0) + Number(ordine.trasporto_litro || 0);
  const prodotto = ordine.prodotto;

  for (const inp of inputs) {
    const val = parseFloat(inp.value) || 0;
    if (val <= 0) continue;
    const cisId = inp.dataset.cisterna;
    const { data: cis } = await sb.from('cisterne').select('livello_attuale,costo_medio').eq('id', cisId).single();
    if (!cis) continue;

    // Calcolo CMP: (litri_esistenti × costo_medio_attuale + litri_nuovi × costo_carico) / totale_litri
    const litriPrec = Number(cis.livello_attuale);
    const cmpPrec = Number(cis.costo_medio || 0);
    const nuovoLivello = litriPrec + val;
    var cmpNuovo = 0;
    if (nuovoLivello > 0) {
      cmpNuovo = ((litriPrec * cmpPrec) + (val * costoCarico)) / nuovoLivello;
    }
    // Arrotonda a 6 decimali
    cmpNuovo = Math.round(cmpNuovo * 1000000) / 1000000;

    const { error } = await sb.from('cisterne').update({ livello_attuale: nuovoLivello, costo_medio: cmpNuovo, updated_at: new Date().toISOString() }).eq('id', cisId);
    if (error) { toast('Errore cisterna: ' + error.message); return; }

    // Registra nello storico CMP
    await sb.from('stazione_cmp_storico').insert([{
      data: ordine.data || oggiISO,
      prodotto: prodotto,
      sede: 'stazione_oppido',
      cmp_precedente: cmpPrec,
      cmp_nuovo: cmpNuovo,
      litri_precedenti: litriPrec,
      litri_caricati: val,
      costo_carico: costoCarico,
      ordine_id: ordineId
    }]);
  }

  const { error } = await sb.from('ordini').update({ ricevuto_stazione: true }).eq('id', ordineId);
  if (error) { toast('Errore: ' + error.message); return; }

  toast('✅ ' + fmtL(totAssegnati) + ' ricevuti — CMP aggiornato a € ' + cmpNuovo.toFixed(4) + '/L');
  chiudiModal();
  caricaOrdiniDaCaricare();
  caricaStazioneDashboard();
}

let _stzDashCharts = {};
function _destroyStzDashCharts() { Object.values(_stzDashCharts).forEach(c=>c.destroy()); _stzDashCharts={}; }

async function caricaStazioneDashboard() {
  await caricaOrdiniDaCaricare();

  const oggi = oggiISO;
  const inizioMese = oggi.substring(0,8) + '01';
  const { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  const pompeIds = (pompe||[]).map(p=>p.id);
  if (!pompeIds.length) return;

  const [lettRes, prezRes, versRes, lettPrecRes, cisRes, costiRes] = await Promise.all([
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).gte('data',inizioMese).order('data'),
    sb.from('stazione_prezzi').select('*').gte('data',inizioMese).order('data'),
    sb.from('stazione_versamenti').select('*').gte('data',inizioMese).order('data'),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).eq('data', new Date(new Date(inizioMese).getTime()-86400000).toISOString().split('T')[0]),
    sb.from('cisterne').select('*').eq('sede','stazione_oppido').order('prodotto,nome'),
    sb.from('stazione_costi').select('*').gte('data',inizioMese).lte('data',oggi)
  ]);

  const letture = lettRes.data||[];
  const prezzi = prezRes.data||[];
  const versamenti = versRes.data||[];
  const lettPrec = lettPrecRes.data||[];
  const cisterne = cisRes.data||[];
  const costiDb = costiRes.data||[];

  // ═══ CISTERNE ═══
  const cisEl = document.getElementById('stz-dash-cisterne');
  if (cisEl && cisterne.length) {
    var cisHtml = '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:10px">';
    cisterne.forEach(function(c) {
      var _pi = cacheProdotti.find(function(p){return p.nome===c.prodotto;}); var colore = _pi ? _pi.colore : '#888';
      var pct = Number(c.capacita_max) > 0 ? Math.round(Number(c.livello_attuale)/Number(c.capacita_max)*100) : 0;
      var cmp = Number(c.costo_medio||0);
      cisHtml += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:3px solid '+colore+';border-radius:10px;padding:12px">';
      cisHtml += '<div style="font-size:12px;font-weight:600;margin-bottom:4px">'+esc(c.nome)+'</div>';
      cisHtml += '<div style="height:6px;background:var(--border);border-radius:3px;margin-bottom:6px"><div style="height:100%;width:'+pct+'%;background:'+colore+';border-radius:3px"></div></div>';
      cisHtml += '<div style="display:flex;justify-content:space-between;font-size:11px"><span style="font-family:var(--font-mono);font-weight:700">'+fmtL(c.livello_attuale)+' L</span><span style="color:var(--text-muted)">'+pct+'%</span></div>';
      if (cmp > 0) cisHtml += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ '+cmp.toFixed(4)+'</strong></div>';
      cisHtml += '</div>';
    });
    cisHtml += '</div>';
    cisEl.innerHTML = cisHtml;
  } else if (cisEl) {
    cisEl.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Nessuna cisterna configurata</div>';
  }

  // ═══ VENDITE PER GIORNO ═══
  const tutteLetture = [...lettPrec, ...letture];
  const prezziMap = {};
  prezzi.forEach(p => { prezziMap[p.data+'_'+p.prodotto] = p.prezzo_litro; });
  const costiMap = {};
  costiDb.forEach(c => { costiMap[c.data+'_'+c.prodotto] = Number(c.costo_litro); });

  const venditeGiorno = {};
  const dateUniche = [...new Set(letture.map(l=>l.data))].sort();
  dateUniche.forEach(data => {
    let totLitriG=0, totLitriB=0, incasso=0, costo=0;
    (pompe||[]).forEach(pompa => {
      const lettOggi = tutteLetture.find(l=>l.pompa_id===pompa.id && l.data===data);
      const datePrecedenti = tutteLetture.filter(l=>l.pompa_id===pompa.id && l.data<data).map(l=>l.data).sort();
      const dataPrec = datePrecedenti.length ? datePrecedenti[datePrecedenti.length-1] : null;
      const lettIeri = dataPrec ? tutteLetture.find(l=>l.pompa_id===pompa.id && l.data===dataPrec) : null;
      if (lettOggi && lettIeri) {
        const litri = Number(lettOggi.lettura) - Number(lettIeri.lettura);
        if (litri > 0) {
          const prezzo = Number(prezziMap[data+'_'+pompa.prodotto] || 0);
          const co = costiMap[data+'_'+pompa.prodotto] || 0;
          if (pompa.prodotto === 'Gasolio Autotrazione') totLitriG += litri;
          else totLitriB += litri;
          incasso += litri * prezzo;
          costo += litri * co;
        }
      }
    });
    const vers = (versamenti||[]).filter(v=>v.data===data);
    const totVers = vers.reduce((s,v)=>s+Number(v.contanti||0)+Number(v.pos||0),0);
    venditeGiorno[data] = { gasolio:totLitriG, benzina:totLitriB, totale:totLitriG+totLitriB, incasso, costo, margine:incasso-costo, versamento:totVers };
  });

  // ═══ KPI ═══
  const vOggi = venditeGiorno[oggi] || { gasolio:0, benzina:0, totale:0, incasso:0 };
  document.getElementById('stz-litri-oggi').textContent = fmtL(vOggi.totale);
  document.getElementById('stz-incasso-oggi').textContent = fmtE(vOggi.incasso);

  let totLitriMese=0, totIncassoMese=0;
  Object.values(venditeGiorno).forEach(v => { totLitriMese+=v.totale; totIncassoMese+=v.incasso; });
  document.getElementById('stz-litri-mese').textContent = fmtL(totLitriMese);
  document.getElementById('stz-incasso-mese').textContent = fmtE(totIncassoMese);

  const totCash = (versamenti||[]).reduce((s,v)=>s+Number(v.contanti||0),0);
  const totPos = (versamenti||[]).reduce((s,v)=>s+Number(v.pos||0),0);
  document.getElementById('stz-vers-contanti').textContent = fmtE(totCash);
  document.getElementById('stz-vers-pos').textContent = fmtE(totPos);

  // ═══ TABELLA ULTIMI 7 GIORNI ═══
  const tbody = document.getElementById('stz-dash-tabella');
  const ultimi7 = dateUniche.slice(-7).reverse();
  if (!ultimi7.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun dato</td></tr>'; }
  else {
    tbody.innerHTML = ultimi7.map(data => {
      const v = venditeGiorno[data];
      return '<tr><td>' + data + '</td><td style="font-family:var(--font-mono)">' + fmtL(v.gasolio) + '</td><td style="font-family:var(--font-mono)">' + fmtL(v.benzina) + '</td><td style="font-family:var(--font-mono);font-weight:bold">' + fmtL(v.totale) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.incasso) + '</td><td style="font-family:var(--font-mono)">' + fmtE(v.versamento) + '</td></tr>';
    }).join('');
  }

  // ═══ GRAFICI ═══
  _destroyStzDashCharts();
  const labels = dateUniche.map(d => { var dt=new Date(d); return dt.getDate()+'/'+(dt.getMonth()+1); });
  const dataGasolio = dateUniche.map(d => Math.round(venditeGiorno[d].gasolio));
  const dataBenzina = dateUniche.map(d => Math.round(venditeGiorno[d].benzina));
  const dataIncasso = dateUniche.map(d => Math.round(venditeGiorno[d].incasso*100)/100);
  const dataMargine = dateUniche.map(d => Math.round(venditeGiorno[d].margine*100)/100);

  // Grafico Litri
  var ctxL = document.getElementById('stz-dash-chart-litri');
  if (ctxL) {
    _stzDashCharts.litri = new Chart(ctxL.getContext('2d'), {
      type:'bar', data:{ labels, datasets:[
        { label:'Gasolio', data:dataGasolio, backgroundColor:'#BA7517', borderRadius:4 },
        { label:'Benzina', data:dataBenzina, backgroundColor:'#378ADD', borderRadius:4 }
      ]}, options:{ responsive:true, plugins:{legend:{position:'top',labels:{font:{size:10}}}}, scales:{y:{beginAtZero:true,stacked:true,ticks:{callback:v=>fmtL(v)}},x:{stacked:true,ticks:{font:{size:9}}}} }
    });
  }

  // Grafico Fatturato
  var ctxF = document.getElementById('stz-dash-chart-fatturato');
  if (ctxF) {
    _stzDashCharts.fatturato = new Chart(ctxF.getContext('2d'), {
      type:'bar', data:{ labels, datasets:[
        { label:'Incasso €', data:dataIncasso, backgroundColor:'#639922', borderRadius:4 }
      ]}, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:true,ticks:{callback:v=>fmtE(v)}},x:{ticks:{font:{size:9}}}} }
    });
  }

  // Grafico Margine
  var ctxM = document.getElementById('stz-dash-chart-margine');
  if (ctxM) {
    var coloriMargine = dataMargine.map(v => v >= 0 ? '#639922' : '#E24B4A');
    _stzDashCharts.margine = new Chart(ctxM.getContext('2d'), {
      type:'bar', data:{ labels, datasets:[
        { label:'Margine €', data:dataMargine, backgroundColor:coloriMargine, borderRadius:4 }
      ]}, options:{ responsive:true, plugins:{legend:{display:false}}, scales:{y:{beginAtZero:false,ticks:{callback:v=>fmtE(v)}},x:{ticks:{font:{size:9}}}} }
    });
  }
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
  const lettMap = {}; (lettOggiRes.data||[]).forEach(l => lettMap[l.pompa_id]={ lettura:Number(l.lettura), litri_pd:Number(l.litri_prezzo_diverso||0), prezzo_pd:Number(l.prezzo_diverso||0) });
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
    const rec = lettMap[p.id];
    const val = rec ? rec.lettura : '';
    const litriDivSaved = rec ? rec.litri_pd : '';
    const prezzoDivSaved = rec ? rec.prezzo_pd : '';
    const precVal = lettIeriMap[p.id];
    const _pi = cacheProdotti.find(pp=>pp.nome===p.prodotto); const colore = _pi ? _pi.colore : '#888';
    const precRaw = precVal !== undefined ? String(precVal) : '—';
    const prezzo = prezzoMap[p.prodotto] || 0;

    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:14px">' + esc(p.nome) + '</strong><span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + esc(p.prodotto) + '</span></div>';
    // Contatori stile meccanico — Giorno prec. e Oggi stessa dimensione
    html += '<div style="display:flex;gap:12px;margin-bottom:8px;flex-wrap:wrap">';
    // Giorno prec. (contatore meccanico)
    html += '<div style="flex:1;min-width:160px"><div style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px">Giorno prec.</div>';
    html += '<div style="background:#1a1a1a;border-radius:8px;padding:8px 12px;display:inline-flex;align-items:center;gap:1px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)"><span style="font-family:\'Courier New\',monospace;font-size:18px;font-weight:700;color:#f0f0f0;letter-spacing:3px">' + precRaw + '</span></div></div>';
    // Oggi (contatore meccanico con input)
    html += '<div style="flex:1;min-width:160px"><div style="font-size:10px;color:var(--text);text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px;font-weight:600">Oggi</div>';
    html += '<input type="number" class="stz-lettura-input" data-pompa="' + p.id + '" data-prodotto="' + esc(p.prodotto) + '" value="' + val + '" placeholder="00000000" step="0.01" max="99999999" oninput="calcolaLettureVendite()" style="font-family:\'Courier New\',monospace;font-size:18px;font-weight:700;padding:8px 12px;border:none;border-radius:8px;background:#1a1a1a;color:#7CFC00;width:180px;max-width:100%;text-align:left;letter-spacing:3px;box-shadow:inset 0 2px 4px rgba(0,0,0,0.4)" /></div>';
    html += '</div>';
    // Risultati calcolati per questa pompa — dettaglio suddivisione
    html += '<div id="stz-calc-' + p.id + '" style="padding:8px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:8px;font-size:12px"></div>';
    // Prezzo standard
    html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">';
    html += '<span style="font-size:10px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Prezzo pompa:</span>';
    html += '<span style="font-family:var(--font-mono);font-size:13px;font-weight:600;color:#1a1a18">' + (prezzo ? '€ ' + prezzo.toFixed(3) : '<span style="color:#E24B4A">non impostato</span>') + '</span>';
    html += '</div>';
    // Cambio prezzo — riga dedicata più grande
    html += '<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 12px;background:#FFF8E1;border:0.5px solid #F0D080;border-radius:8px">';
    html += '<span style="font-size:12px;color:#8B6914;font-weight:600;white-space:nowrap">⚡ Cambio prezzo:</span>';
    html += '<span style="font-size:12px;color:#8B6914">Litri</span>';
    html += '<input type="number" class="stz-litri-div" data-pompa="' + p.id + '" value="' + (litriDivSaved || '') + '" placeholder="0" step="0.01" oninput="calcolaLettureVendite()" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:8px 12px;border:0.5px solid #F0D080;border-radius:8px;background:#fff;color:#1a1a18;width:120px;text-align:right" />';
    html += '<span style="font-size:12px;color:#8B6914">€/L</span>';
    html += '<input type="number" class="stz-prezzo-div" data-pompa="' + p.id + '" data-prodotto="' + esc(p.prodotto) + '" value="' + (prezzoDivSaved || '') + '" placeholder="0.000" step="0.001" oninput="copiaPrezzoCambio(this);calcolaLettureVendite()" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:8px 12px;border:0.5px solid #F0D080;border-radius:8px;background:#fff;color:#1a1a18;width:120px;text-align:right" />';
    html += '</div>';
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
  let totLitri = 0, totEuro = 0, compilate = 0;
  let litriGasolio = 0, euroGasolio = 0, litriBenzina = 0, euroBenzina = 0;

  pompe.forEach(p => {
    const input = document.querySelector('.stz-lettura-input[data-pompa="' + p.id + '"]');
    const elCalc = document.getElementById('stz-calc-' + p.id);
    if (!input || !elCalc) return;

    const valOggi = parseFloat(input.value);
    const valIeri = ieriMap[p.id];
    const prezzoStd = prezzoMap[p.prodotto] || 0;
    const _pi = cacheProdotti.find(pp=>pp.nome===p.prodotto); const colore = _pi ? _pi.colore : '#888';

    const inputLitriDiv = document.querySelector('.stz-litri-div[data-pompa="' + p.id + '"]');
    const inputPrezzoDiv = document.querySelector('.stz-prezzo-div[data-pompa="' + p.id + '"]');
    const litriDiv = inputLitriDiv ? parseFloat(inputLitriDiv.value) || 0 : 0;
    const prezzoDiv = inputPrezzoDiv ? parseFloat(inputPrezzoDiv.value) || 0 : 0;

    if (!isNaN(valOggi) && valIeri !== undefined) {
      compilate++;
      const litri = valOggi - valIeri;
      const litriStd = Math.max(0, litri - litriDiv);
      const euroStd = litriStd * prezzoStd;
      const euroDiv = litriDiv * prezzoDiv;
      const euro = euroStd + euroDiv;

      var calcHtml = '<div style="display:flex;gap:16px;font-size:13px;margin-bottom:4px"><span style="color:var(--text-muted)">Litri totali: <strong style="font-family:var(--font-mono)">' + (litri >= 0 ? litri.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L' : '⚠ negativo') + '</strong></span><span style="color:#1a1a18">Venduto: <strong style="font-family:var(--font-mono);color:#639922">€ ' + euro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</strong></span></div>';
      if (litriDiv > 0 && prezzoDiv > 0) {
        calcHtml += '<div style="font-size:11px;color:var(--text-muted);padding-top:4px;border-top:0.5px dashed var(--border)">';
        calcHtml += '<div>↳ ' + litriStd.toLocaleString('it-IT',{maximumFractionDigits:2}) + ' L × € ' + prezzoStd.toFixed(3) + ' = <strong style="font-family:var(--font-mono)">€ ' + euroStd.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</strong></div>';
        calcHtml += '<div style="color:#1a1a18">↳ ' + litriDiv.toLocaleString('it-IT',{maximumFractionDigits:2}) + ' L × € ' + prezzoDiv.toFixed(3) + ' = <strong style="font-family:var(--font-mono)">€ ' + euroDiv.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</strong> <span style="font-size:9px;background:#1a1a18;color:#fff;padding:1px 5px;border-radius:4px">cambio prezzo</span></div>';
        calcHtml += '</div>';
      }
      elCalc.innerHTML = calcHtml;

      if (litri >= 0) {
        totLitri += litri; totEuro += euro;
        var isGasolio = p.prodotto.toLowerCase().indexOf('gasolio') >= 0;
        if (isGasolio) { litriGasolio += litri; euroGasolio += euro; }
        else { litriBenzina += litri; euroBenzina += euro; }
      }
    } else {
      elCalc.innerHTML = '<span style="color:var(--text-muted);font-size:13px">Litri: <strong style="font-family:var(--font-mono)">—</strong></span>';
    }
  });

  var totEl = document.getElementById('stz-totali-letture');
  if (totEl) {
    totEl.innerHTML = '<div style="display:flex;gap:20px;padding:12px 16px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)">' +
      '<div><span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Totale litri</span><div style="font-size:18px;font-weight:700;font-family:var(--font-mono)">' + totLitri.toLocaleString('it-IT', {maximumFractionDigits:2}) + ' L</div></div>' +
      '<div><span style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.3px">Totale venduto</span><div style="font-size:18px;font-weight:700;font-family:var(--font-mono);color:#639922">€ ' + totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</div></div>' +
      '</div>';
  }

  var el = document.getElementById('stz-totali-live');
  if (el) {
    el.innerHTML =
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.5);margin-bottom:14px;font-weight:600">Totali live</div>' +
      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#BA7517"></div><span style="font-size:11px;font-weight:600;color:#fff">GASOLIO</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:#fff">' + litriGasolio.toLocaleString('it-IT', {maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:#7CFC00">€ ' + euroGasolio.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><span style="font-size:11px;font-weight:600;color:#87CEFA">BENZINA</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:#87CEFA">' + litriBenzina.toLocaleString('it-IT', {maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:16px;font-weight:700;color:#7CFC00">€ ' + euroBenzina.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">' +
        '<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:6px">TOTALE</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:20px;font-weight:800;color:#fff">' + totLitri.toLocaleString('it-IT', {maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:20px;font-weight:800;color:#7CFC00">€ ' + totEuro.toLocaleString('it-IT', {minimumFractionDigits:2, maximumFractionDigits:2}) + '</span></div>' +
        '<div style="font-size:10px;color:rgba(255,255,255,0.3);margin-top:8px;text-align:center">' + compilate + ' / ' + pompe.length + ' pompe</div>' +
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
    const prezzoStd = prezzoMap[p.prodotto] || 0;
    const litri = (!isNaN(valOggi) && valIeri !== undefined) ? valOggi - valIeri : 0;

    // Prezzo diverso
    const inputLD = document.querySelector('.stz-litri-div[data-pompa="' + p.id + '"]');
    const inputPD = document.querySelector('.stz-prezzo-div[data-pompa="' + p.id + '"]');
    const litriDiv = inputLD ? parseFloat(inputLD.value) || 0 : 0;
    const prezzoDiv = inputPD ? parseFloat(inputPD.value) || 0 : 0;
    const litriStd = Math.max(0, litri - litriDiv);
    const euro = (litriStd * prezzoStd) + (litriDiv * prezzoDiv);

    if (litri > 0) { totLitri += litri; totEuro += euro; }
    const _pi = cacheProdotti.find(pp=>pp.nome===p.prodotto); const colore = _pi ? _pi.colore : '#888';

    righe += '<tr>' +
      '<td style="padding:8px;border:1px solid #ddd"><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span><strong>' + esc(p.nome) + '</strong></td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + (valIeri !== undefined ? _sep(valIeri.toLocaleString('it-IT',{maximumFractionDigits:2})) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;font-weight:bold">' + (!isNaN(valOggi) ? _sep(valOggi.toLocaleString('it-IT',{maximumFractionDigits:2})) : '—') + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">' + _sep(litri.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right">€ ' + prezzoStd.toFixed(3) + '</td>' +
      '<td style="padding:8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;font-weight:bold">€ ' + _sep(euro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</td>' +
      '</tr>';
    // Riga aggiuntiva per prezzo diverso
    if (litriDiv > 0 && prezzoDiv > 0) {
      righe += '<tr style="background:#f0f0f0;font-size:10px">' +
        '<td style="padding:4px 8px;border:1px solid #ddd;color:#333" colspan="3">↳ di cui a cambio prezzo</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#333">' + _sep(litriDiv.toLocaleString('it-IT',{maximumFractionDigits:2})) + ' L</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#333">€ ' + prezzoDiv.toFixed(3) + '</td>' +
        '<td style="padding:4px 8px;border:1px solid #ddd;font-family:Courier New,monospace;text-align:right;color:#333;font-weight:bold">€ ' + _sep((litriDiv * prezzoDiv).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2})) + '</td>' +
        '</tr>';
    }
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
  var upserts = [], cpOps = [];
  for (const inp of inputs) {
    const val = parseFloat(inp.value);
    if (isNaN(val)) continue;
    const pompaId = inp.dataset.pompa;
    const prodotto = inp.dataset.prodotto;
    const inputLD = document.querySelector('.stz-litri-div[data-pompa="' + pompaId + '"]');
    const inputPD = document.querySelector('.stz-prezzo-div[data-pompa="' + pompaId + '"]');
    const litriPD = inputLD ? parseFloat(inputLD.value) || 0 : 0;
    const prezzoPD = inputPD ? parseFloat(inputPD.value) || 0 : 0;
    upserts.push(sb.from('stazione_letture').upsert({ pompa_id:pompaId, data, lettura:val, litri_prezzo_diverso:litriPD, prezzo_diverso:prezzoPD }, { onConflict:'pompa_id,data' }));
    // Cambio prezzo nello storico prezzi pompa
    const cpKey = prodotto + ' (cambio prezzo)';
    if (litriPD > 0 && prezzoPD > 0) {
      cpOps.push(sb.from('stazione_prezzi').upsert({ data, prodotto:cpKey, prezzo_litro:prezzoPD }, { onConflict:'data,prodotto' }));
    } else {
      cpOps.push(sb.from('stazione_prezzi').delete().eq('data',data).eq('prodotto',cpKey));
    }
  }
  if (!upserts.length) { toast('Inserisci almeno una lettura'); return; }
  var results = await Promise.all(upserts);
  var errore = results.find(r => r.error);
  if (errore) { toast('Errore: ' + errore.error.message); return; }
  await Promise.all(cpOps);
  toast(upserts.length + ' letture salvate!');

  // ═══ Auto-crea prezzi pompa per giorno successivo ═══
  try {
    var domani = new Date(new Date(data).getTime() + 86400000).toISOString().split('T')[0];
    var pompe = window._stzPompe || [];
    var prodottiUnici = [...new Set(pompe.map(function(p){return p.prodotto;}))];
    var prezziDomani = [];
    prodottiUnici.forEach(function(prodotto) {
      // Priorità: cambio prezzo del giorno > prezzo standard del giorno
      var cpKey = prodotto + ' (cambio prezzo)';
      var inputCP = document.querySelector('.stz-prezzo-div[data-prodotto="' + prodotto + '"]');
      var prezzoCP = inputCP ? parseFloat(inputCP.value) || 0 : 0;
      var prezzoStd = (window._stzPrezzoMap || {})[prodotto] || 0;
      var prezzoFinale = prezzoCP > 0 ? prezzoCP : prezzoStd;
      if (prezzoFinale > 0) {
        prezziDomani.push(sb.from('stazione_prezzi').upsert({ data: domani, prodotto: prodotto, prezzo_litro: prezzoFinale }, { onConflict:'data,prodotto' }));
      }
    });
    if (prezziDomani.length) {
      await Promise.all(prezziDomani);
      toast('Prezzi ' + domani + ' preparati automaticamente');
    }
  } catch(e) { console.warn('Auto prezzi domani:', e); }

  calcolaLettureVendite();
  caricaStoricoLetture();
  caricaStoricoPrezzi();

  // Chiedi se vuole andare al giorno successivo
  var domaniNav = new Date(new Date(data).getTime() + 86400000).toISOString().split('T')[0];
  if (confirm('Letture salvate! Prezzi preparati per il ' + domaniNav + '.\nVuoi andare al giorno ' + domaniNav + '?')) {
    document.getElementById('stz-data-lettura').value = domaniNav;
    caricaFormLetture();
  }
}

async function caricaStoricoLetture() {
  // Carica solo ultimi 90 giorni per performance
  var limite = new Date(); limite.setDate(limite.getDate()-90);
  var limiteISO = limite.toISOString().split('T')[0];
  const [lettRes, pompeRes, prezziRes] = await Promise.all([
    sb.from('stazione_letture').select('*').gte('data',limiteISO).order('data',{ascending:false}),
    sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine'),
    sb.from('stazione_prezzi').select('*').gte('data',limiteISO).order('data',{ascending:false})
  ]);
  const letture = lettRes.data; const pompe = pompeRes.data; const prezzi = prezziRes.data;

  if (!letture||!letture.length) {
    document.getElementById('stz-storico-letture').innerHTML='<tr><td colspan="6" class="loading">Nessuna lettura</td></tr>';
    document.getElementById('stz-storico-data-label').textContent = '—';
    return;
  }

  // Cache globale per navigazione
  const dateUniche = [...new Set(letture.map(l=>l.data))].sort().reverse();
  const pompeMap = {}; (pompe||[]).forEach(p=>pompeMap[p.id]=p);
  const prezziMap = {}; (prezzi||[]).forEach(p=>{ prezziMap[p.data+'_'+p.prodotto]=p.prezzo_litro; });
  const lettureByData = {};
  letture.forEach(l => { if(!lettureByData[l.data]) lettureByData[l.data]=[]; lettureByData[l.data].push(l); });
  const lettureByPompa = {};
  letture.forEach(l => { if(!lettureByPompa[l.pompa_id]) lettureByPompa[l.pompa_id]=[]; lettureByPompa[l.pompa_id].push(l); });

  window._storicoLetture = { dateUniche, pompeMap, prezziMap, lettureByData, lettureByPompa, indice: 0 };
  renderStoricoGiorno(0);
}

function storicoLettureGiorno(dir) {
  if (!window._storicoLetture) return;
  const s = window._storicoLetture;
  const nuovoIdx = s.indice - dir; // -dir perché dateUniche è desc (0=più recente)
  if (nuovoIdx < 0 || nuovoIdx >= s.dateUniche.length) return;
  s.indice = nuovoIdx;
  renderStoricoGiorno(nuovoIdx);
}

function renderStoricoGiorno(idx) {
  const s = window._storicoLetture;
  if (!s) return;
  const data = s.dateUniche[idx];
  const lettureGiorno = s.lettureByData[data] || [];

  const dataFmt = new Date(data).toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  document.getElementById('stz-storico-data-label').textContent = dataFmt;

  const tbody = document.getElementById('stz-storico-letture');
  let html = '', totLitriG=0, totEuroG=0, totLitriB=0, totEuroB=0;

  lettureGiorno.forEach(l => {
    const pompa = s.pompeMap[l.pompa_id];
    if (!pompa) return;
    const _pi = cacheProdotti.find(pp=>pp.nome===pompa.prodotto); const colore = _pi ? _pi.colore : '#888';
    const storPompa = s.lettureByPompa[l.pompa_id]||[];
    const iSorted = storPompa.sort((a,b)=>b.data.localeCompare(a.data));
    const myIdx = iSorted.findIndex(x=>x.id===l.id);
    const prec = myIdx < iSorted.length-1 ? iSorted[myIdx+1] : null;
    const litri = prec ? Number(l.lettura)-Number(prec.lettura) : null;
    const prezzo = Number(s.prezziMap[l.data+'_'+pompa.prodotto]||0);

    // Cambio prezzo
    const litriPD = Number(l.litri_prezzo_diverso||0);
    const prezzoPD = Number(l.prezzo_diverso||0);
    const hasCambio = litriPD > 0 && prezzoPD > 0;

    var incasso = null;
    var litriStd = litri;
    var euroStd = 0, euroDiv = 0;
    if (litri !== null && prezzo) {
      if (hasCambio) {
        litriStd = Math.max(0, litri - litriPD);
        euroStd = litriStd * prezzo;
        euroDiv = litriPD * prezzoPD;
        incasso = euroStd + euroDiv;
      } else {
        incasso = litri * prezzo;
      }
    }

    if (litri!==null && litri >= 0) {
      var isGasolio = pompa.prodotto.toLowerCase().indexOf('gasolio') >= 0;
      if (isGasolio) { totLitriG += litri; totEuroG += (incasso||0); }
      else { totLitriB += litri; totEuroB += (incasso||0); }
    }

    html += '<tr>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span>' + esc(pompa.nome) + '</td>' +
      '<td style="font-family:var(--font-mono);color:var(--text-muted)">' + (prec ? String(Number(prec.lettura)) : '—') + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold">' + String(Number(l.lettura)) + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold">' + (litri!==null?fmtL(litri):'—') + '</td>' +
      '<td style="font-family:var(--font-mono)">' + (prezzo?fmt(prezzo):'—') + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold">' + (incasso!==null?fmtE(incasso):'—') + '</td>' +
      '</tr>';

    // Sotto-riga cambio prezzo
    if (hasCambio && litri !== null) {
      html += '<tr style="background:#f5f5f0;font-size:10px">' +
        '<td style="padding:3px 8px;color:#1a1a18" colspan="3">↳ di cui ' + fmtL(litriStd) + ' L × € ' + prezzo.toFixed(3) + ' = ' + fmtE(euroStd) + '</td>' +
        '<td style="padding:3px 8px;color:#1a1a18;font-family:var(--font-mono)">' + fmtL(litriPD) + '</td>' +
        '<td style="padding:3px 8px;color:#1a1a18;font-family:var(--font-mono)">€ ' + prezzoPD.toFixed(3) + '</td>' +
        '<td style="padding:3px 8px;color:#1a1a18;font-family:var(--font-mono);font-weight:bold">' + fmtE(euroDiv) + ' <span style="font-size:8px;background:#1a1a18;color:#fff;padding:1px 4px;border-radius:3px">cambio prezzo</span></td>' +
        '</tr>';
    }
  });

  var totLitri = totLitriG + totLitriB;
  var totEuro = totEuroG + totEuroB;
  html += '<tr style="background:var(--bg);font-weight:bold;border-top:2px solid var(--border)">' +
    '<td colspan="3" style="font-size:11px;text-transform:uppercase">Totale giorno</td>' +
    '<td style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</td><td></td>' +
    '<td style="font-family:var(--font-mono);color:#639922">' + fmtE(totEuro) + '</td></tr>';

  tbody.innerHTML = html;

  var riepEl = document.getElementById('stz-storico-riepilogo');
  if (riepEl) {
    riepEl.innerHTML = '<div style="display:flex;gap:12px;flex-wrap:wrap">' +
      '<div style="flex:1;min-width:120px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid #BA7517"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">Gasolio</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + fmtL(totLitriG) + ' L</div><div style="font-family:var(--font-mono);font-size:13px;color:#639922">' + fmtE(totEuroG) + '</div></div>' +
      '<div style="flex:1;min-width:120px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid #378ADD"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">Benzina</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + fmtL(totLitriB) + ' L</div><div style="font-family:var(--font-mono);font-size:13px;color:#639922">' + fmtE(totEuroB) + '</div></div>' +
      '<div style="flex:1;min-width:120px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid #639922"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">Totale</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">' + fmtL(totLitri) + ' L</div><div style="font-family:var(--font-mono);font-size:13px;color:#639922;font-weight:700">' + fmtE(totEuro) + '</div></div>' +
      '</div>';
  }
}

// ── Auto-copia prezzo cambio tra pompe stesso prodotto ──
function copiaPrezzoCambio(input) {
  const prodotto = input.dataset.prodotto;
  const pompaId = input.dataset.pompa;
  const val = input.value;
  document.querySelectorAll('.stz-prezzo-div[data-prodotto="' + prodotto + '"]').forEach(inp => {
    if (inp.dataset.pompa !== pompaId) inp.value = val;
  });
}

// ══════════════════════════════════════════════════════════════
// ── MARGINALITÀ STAZIONE ─────────────────────────────────────
// ══════════════════════════════════════════════════════════════

async function caricaMarginalita() {
  // Carica ultimi 90 giorni per performance
  var limDate = new Date(); limDate.setDate(limDate.getDate()-90);
  var limISO = limDate.toISOString().split('T')[0];

  const [lettRes, pompeRes, prezziRes, costiRes, cisRes, cmpRes] = await Promise.all([
    sb.from('stazione_letture').select('*').gte('data',limISO).order('data',{ascending:false}),
    sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine'),
    sb.from('stazione_prezzi').select('*').gte('data',limISO).order('data',{ascending:false}),
    sb.from('stazione_costi').select('*').gte('data',limISO).order('data',{ascending:false}),
    sb.from('cisterne').select('prodotto,livello_attuale,costo_medio').eq('sede','stazione_oppido'),
    sb.from('stazione_cmp_storico').select('*').eq('sede','stazione_oppido').order('created_at',{ascending:false}).limit(20)
  ]);

  const letture = lettRes.data;
  const pompe = pompeRes.data;
  const prezzi = prezziRes.data;
  const costi = costiRes.data;
  const cisterne = cisRes.data;
  const cmpStorico = cmpRes.data;

  if (!letture||!letture.length) {
    document.getElementById('marg-pompe-content').innerHTML='<div class="loading">Nessuna lettura disponibile</div>';
    document.getElementById('marg-data-label').textContent = '—';
    return;
  }

  const dateUniche = [...new Set(letture.map(l=>l.data))].sort().reverse();
  const pompeMap = {}; (pompe||[]).forEach(p=>pompeMap[p.id]=p);
  const prezziMap = {}; (prezzi||[]).forEach(p=>{ prezziMap[p.data+'_'+p.prodotto]=p.prezzo_litro; });
  const costiMap = {}; (costi||[]).forEach(c=>{ costiMap[c.data+'_'+c.prodotto]=Number(c.costo_litro); });
  const lettureByData = {};
  letture.forEach(l => { if(!lettureByData[l.data]) lettureByData[l.data]=[]; lettureByData[l.data].push(l); });
  const lettureByPompa = {};
  letture.forEach(l => { if(!lettureByPompa[l.pompa_id]) lettureByPompa[l.pompa_id]=[]; lettureByPompa[l.pompa_id].push(l); });

  // Calcola CMP corrente per prodotto (media ponderata cisterne)
  const cmpCorrente = {};
  const cmpPerProdotto = {};
  (cisterne||[]).forEach(c => {
    var p = c.prodotto;
    if (!cmpPerProdotto[p]) cmpPerProdotto[p] = { litri:0, valore:0 };
    var liv = Number(c.livello_attuale||0);
    var cm = Number(c.costo_medio||0);
    cmpPerProdotto[p].litri += liv;
    cmpPerProdotto[p].valore += liv * cm;
  });
  Object.entries(cmpPerProdotto).forEach(function([p,v]) {
    cmpCorrente[p] = v.litri > 0 ? Math.round((v.valore / v.litri) * 1000000) / 1000000 : 0;
  });

  window._margData = { dateUniche, pompeMap, prezziMap, costiMap, lettureByData, lettureByPompa, pompe, indice: 0, cmpCorrente, cmpStorico: cmpStorico||[] };
  renderMargGiorno(0);
  renderStoricoMarg();
  renderStoricoCMP();
}

function renderStoricoMarg() {
  var m = window._margData;
  if (!m) return;
  var tbody = document.getElementById('marg-storico-tabella');
  if (!tbody) return;
  var html = '';
  // Ultimi 30 giorni con dati
  var giorniDaMostrare = m.dateUniche.slice(0, 30);
  giorniDaMostrare.forEach(function(data) {
    var lettG = m.lettureByData[data] || [];
    var litriGas=0, litriBenz=0, venduto=0, costoTot=0;
    lettG.forEach(function(l) {
      var pompa = m.pompeMap[l.pompa_id]; if (!pompa) return;
      var storPompa = (m.lettureByPompa[l.pompa_id]||[]).sort(function(a,b){return b.data.localeCompare(a.data);});
      var myIdx = storPompa.findIndex(function(x){return x.id===l.id;});
      var prec = myIdx < storPompa.length-1 ? storPompa[myIdx+1] : null;
      var litri = prec ? Number(l.lettura)-Number(prec.lettura) : 0;
      if (litri <= 0) return;
      var prezzo = Number(m.prezziMap[data+'_'+pompa.prodotto]||0);
      var costo = m.costiMap[data+'_'+pompa.prodotto] || 0;
      var litriPD = Number(l.litri_prezzo_diverso||0);
      var prezzoPD = Number(l.prezzo_diverso||0);
      var hasCambio = litriPD > 0 && prezzoPD > 0;
      var litriStd = hasCambio ? Math.max(0, litri - litriPD) : litri;
      var vend = (litriStd * prezzo) + (hasCambio ? litriPD * prezzoPD : 0);
      var costoG = litri * costo;
      venduto += vend;
      costoTot += costoG;
      var isGasolio = pompa.prodotto.toLowerCase().indexOf('gasolio') >= 0;
      if (isGasolio) litriGas += litri; else litriBenz += litri;
    });
    var margine = venduto - costoTot;
    var totLitri = litriGas + litriBenz;
    var margL = totLitri > 0 ? margine / totLitri : 0;
    var hasCosti = costoTot > 0;
    var margColor = margine >= 0 ? '#639922' : '#E24B4A';
    var dataFmt = new Date(data).toLocaleDateString('it-IT',{weekday:'short',day:'2-digit',month:'short'});
    html += '<tr><td><strong>' + dataFmt + '</strong></td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(litriGas) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(litriBenz) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtE(venduto) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + (hasCosti ? fmtE(costoTot) : '<span style="color:var(--text-muted)">—</span>') + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold;color:' + (hasCosti?margColor:'var(--text-muted)') + '">' + (hasCosti ? fmtE(margine) : '—') + '</td>' +
      '<td style="font-family:var(--font-mono);color:' + (hasCosti?margColor:'var(--text-muted)') + '">' + (hasCosti ? '€ ' + margL.toFixed(4) : '—') + '</td></tr>';
  });
  tbody.innerHTML = html || '<tr><td colspan="7" class="loading">Nessun dato</td></tr>';
}

function renderStoricoCMP() {
  var m = window._margData;
  if (!m) return;

  // CMP corrente
  var cmpEl = document.getElementById('marg-cmp-corrente');
  if (cmpEl && m.cmpCorrente) {
    var cmpHtml = '<div style="display:flex;gap:12px;flex-wrap:wrap">';
    Object.entries(m.cmpCorrente).forEach(function([prodotto, cmp]) {
      var _pi = cacheProdotti.find(function(p){return p.nome===prodotto;}); var colore = _pi ? _pi.colore : '#888';
      cmpHtml += '<div style="flex:1;min-width:140px;padding:10px 14px;background:var(--bg);border-radius:8px;border-left:3px solid ' + colore + '">';
      cmpHtml += '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-bottom:2px">' + esc(prodotto) + '</div>';
      cmpHtml += '<div style="font-family:var(--font-mono);font-size:18px;font-weight:700">€ ' + (cmp > 0 ? cmp.toFixed(4) : '—') + '</div>';
      cmpHtml += '<div style="font-size:9px;color:var(--text-muted)">CMP corrente</div>';
      cmpHtml += '</div>';
    });
    cmpHtml += '</div>';
    cmpEl.innerHTML = cmpHtml;
  }

  // Storico CMP
  var tbody = document.getElementById('marg-cmp-storico');
  if (!tbody) return;
  var storico = m.cmpStorico || [];
  if (!storico.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessuna variazione registrata</td></tr>';
    return;
  }
  var html = '';
  storico.slice(0, 20).forEach(function(r) {
    var _pi = cacheProdotti.find(function(p){return p.nome===r.prodotto;}); var colore = _pi ? _pi.colore : '#888';
    var dataFmt = new Date(r.data).toLocaleDateString('it-IT');
    html += '<tr>' +
      '<td>' + dataFmt + '</td>' +
      '<td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:' + colore + ';margin-right:4px"></span>' + esc(r.prodotto) + '</td>' +
      '<td style="font-family:var(--font-mono);color:var(--text-muted)">€ ' + Number(r.cmp_precedente).toFixed(4) + '</td>' +
      '<td style="font-family:var(--font-mono)">' + fmtL(r.litri_caricati) + ' L</td>' +
      '<td style="font-family:var(--font-mono)">€ ' + Number(r.costo_carico).toFixed(4) + '/L</td>' +
      '<td style="font-family:var(--font-mono);font-weight:bold;color:#639922">€ ' + Number(r.cmp_nuovo).toFixed(4) + '</td>' +
      '</tr>';
  });
  tbody.innerHTML = html;
}

function margGiorno(dir) {
  if (!window._margData) return;
  var m = window._margData;
  var nuovoIdx = m.indice - dir;
  if (nuovoIdx < 0 || nuovoIdx >= m.dateUniche.length) return;
  m.indice = nuovoIdx;
  renderMargGiorno(nuovoIdx);
}

function renderMargGiorno(idx) {
  var m = window._margData;
  if (!m) return;
  var data = m.dateUniche[idx];
  var lettureGiorno = m.lettureByData[data] || [];

  var dataFmt = new Date(data).toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short', year:'numeric' });
  document.getElementById('marg-data-label').textContent = dataFmt;

  var el = document.getElementById('marg-pompe-content');
  var html = '';

  lettureGiorno.forEach(function(l) {
    var pompa = m.pompeMap[l.pompa_id];
    if (!pompa) return;
    var _pi = cacheProdotti.find(function(pp){return pp.nome===pompa.prodotto;}); var colore = _pi ? _pi.colore : '#888';
    // Lettura precedente
    var storPompa = (m.lettureByPompa[l.pompa_id]||[]).sort(function(a,b){return b.data.localeCompare(a.data);});
    var myIdx = storPompa.findIndex(function(x){return x.id===l.id;});
    var prec = myIdx < storPompa.length-1 ? storPompa[myIdx+1] : null;
    var litri = prec ? Number(l.lettura)-Number(prec.lettura) : 0;
    if (litri < 0) litri = 0;
    var prezzo = Number(m.prezziMap[data+'_'+pompa.prodotto]||0);

    // Cambio prezzo
    var litriPD = Number(l.litri_prezzo_diverso||0);
    var prezzoPD = Number(l.prezzo_diverso||0);
    var hasCambio = litriPD > 0 && prezzoPD > 0;
    var litriStd = hasCambio ? Math.max(0, litri - litriPD) : litri;

    // Costo salvato o CMP come default
    var costoSaved = m.costiMap[data+'_'+pompa.prodotto] || '';
    var costoProposto = costoSaved;
    var isCMP = false;
    if (!costoProposto && m.cmpCorrente && m.cmpCorrente[pompa.prodotto]) {
      costoProposto = m.cmpCorrente[pompa.prodotto];
      isCMP = true;
    }

    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-left:4px solid ' + colore + ';border-radius:10px;padding:14px;margin-bottom:10px">';
    html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:10px"><div style="width:10px;height:10px;border-radius:50%;background:' + colore + '"></div><strong style="font-size:14px">' + esc(pompa.nome) + '</strong><span style="font-size:11px;color:var(--text-muted);margin-left:auto">' + esc(pompa.prodotto) + ' — ' + fmtL(litri) + ' L totali</span></div>';

    // Riga litri standard
    html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;align-items:center;padding:8px 12px;background:var(--bg-card);border-radius:8px;border:0.5px solid var(--border);margin-bottom:6px">';
    html += '<div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Litri</div><div style="font-family:var(--font-mono);font-size:15px;font-weight:700">' + fmtL(litriStd) + '</div></div>';
    html += '<div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Vendita €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600;color:#1a1a18">' + (prezzo ? '€ ' + prezzo.toFixed(3) : '—') + '</div></div>';
    html += '<div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Costo €/L' + (isCMP ? ' <span style="font-size:8px;background:#378ADD;color:#fff;padding:1px 4px;border-radius:3px">CMP</span>' : '') + '</div><input type="number" class="marg-costo" data-pompa="' + l.pompa_id + '" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" data-litri="' + litriStd + '" data-prezzo="' + prezzo + '" value="' + (costoProposto || '') + '" placeholder="0.000" step="0.001" oninput="copiaCostoMarg(this);calcolaMargini()" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:6px 10px;border:0.5px solid ' + (isCMP ? '#378ADD' : 'var(--border)') + ';border-radius:8px;background:#fff;color:#1a1a18;width:110px;text-align:right" /></div>';
    html += '<div id="marg-res-' + l.pompa_id + '"><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">—</div><div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">—</div></div>';
    html += '</div>';

    // Riga cambio prezzo
    if (hasCambio) {
      html += '<div style="display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:8px;align-items:center;padding:8px 12px;background:#f5f5f0;border-radius:8px;border:0.5px solid var(--border);margin-bottom:6px">';
      html += '<div><div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Litri <span style="font-size:8px;background:#1a1a18;color:#fff;padding:1px 4px;border-radius:3px">cambio</span></div><div style="font-family:var(--font-mono);font-size:15px;font-weight:700">' + fmtL(litriPD) + '</div></div>';
      html += '<div><div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Vendita €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:600">€ ' + prezzoPD.toFixed(3) + '</div></div>';
      html += '<div><div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Costo €/L' + (isCMP ? ' <span style="font-size:8px;background:#378ADD;color:#fff;padding:1px 4px;border-radius:3px">CMP</span>' : '') + '</div><input type="number" class="marg-costo-cp" data-pompa="' + l.pompa_id + '" data-prodotto="' + esc(pompa.prodotto) + '" data-data="' + data + '" data-litri="' + litriPD + '" data-prezzo="' + prezzoPD + '" value="' + (costoProposto || '') + '" placeholder="0.000" step="0.001" oninput="copiaCostoMarg(this);calcolaMargini()" style="font-family:var(--font-mono);font-size:15px;font-weight:600;padding:6px 10px;border:0.5px solid ' + (isCMP ? '#378ADD' : 'var(--border)') + ';border-radius:8px;background:#fff;color:#1a1a18;width:110px;text-align:right" /></div>';
      html += '<div id="marg-res-cp-' + l.pompa_id + '"><div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">—</div><div style="font-size:9px;color:#1a1a18;text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700">—</div></div>';
      html += '</div>';
    }

    html += '</div>';
  });

  el.innerHTML = html;
  calcolaMargini();
}

function copiaCostoMarg(input) {
  var prodotto = input.dataset.prodotto;
  var pompaId = input.dataset.pompa;
  var val = input.value;
  var isCp = input.classList.contains('marg-costo-cp');
  var selector = isCp ? '.marg-costo-cp' : '.marg-costo';
  document.querySelectorAll(selector + '[data-prodotto="' + prodotto + '"]').forEach(function(inp) {
    if (inp.dataset.pompa !== pompaId) inp.value = val;
  });
}

function calcolaMargini() {
  var litriGasolio=0, euroGasolio=0, margGasolio=0;
  var litriBenzina=0, euroBenzina=0, margBenzina=0;

  // Litri standard
  document.querySelectorAll('.marg-costo').forEach(function(inp) {
    var costo = parseFloat(inp.value) || 0;
    var prezzo = parseFloat(inp.dataset.prezzo) || 0;
    var litri = parseFloat(inp.dataset.litri) || 0;
    var pompaId = inp.dataset.pompa;
    var prodotto = inp.dataset.prodotto;
    var margL = prezzo > 0 && costo > 0 ? prezzo - costo : 0;
    var margTot = margL * litri;
    var isGasolio = prodotto.toLowerCase().indexOf('gasolio') >= 0;

    var elRes = document.getElementById('marg-res-' + pompaId);
    if (elRes) {
      var mColor = margL >= 0 ? '#639922' : '#E24B4A';
      elRes.innerHTML = '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? '€ ' + margL.toFixed(4) : '—') + '</div>' +
        '<div style="font-size:9px;color:var(--text-muted);text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? fmtE(margTot) : '—') + '</div>';
    }

    if (costo > 0 && litri > 0) {
      if (isGasolio) { litriGasolio += litri; euroGasolio += litri*prezzo; margGasolio += margTot; }
      else { litriBenzina += litri; euroBenzina += litri*prezzo; margBenzina += margTot; }
    }
  });

  // Litri cambio prezzo
  document.querySelectorAll('.marg-costo-cp').forEach(function(inp) {
    var costo = parseFloat(inp.value) || 0;
    var prezzo = parseFloat(inp.dataset.prezzo) || 0;
    var litri = parseFloat(inp.dataset.litri) || 0;
    var pompaId = inp.dataset.pompa;
    var prodotto = inp.dataset.prodotto;
    var margL = prezzo > 0 && costo > 0 ? prezzo - costo : 0;
    var margTot = margL * litri;
    var isGasolio = prodotto.toLowerCase().indexOf('gasolio') >= 0;

    var elRes = document.getElementById('marg-res-cp-' + pompaId);
    if (elRes) {
      var mColor = margL >= 0 ? '#639922' : '#E24B4A';
      elRes.innerHTML = '<div style="font-size:9px;color:#1a1a18;text-transform:uppercase">Margine €/L</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? '€ ' + margL.toFixed(4) : '—') + '</div>' +
        '<div style="font-size:9px;color:#1a1a18;text-transform:uppercase;margin-top:4px">Margine tot</div><div style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:' + mColor + '">' + (costo > 0 ? fmtE(margTot) : '—') + '</div>';
    }

    if (costo > 0 && litri > 0) {
      if (isGasolio) { litriGasolio += litri; euroGasolio += litri*prezzo; margGasolio += margTot; }
      else { litriBenzina += litri; euroBenzina += litri*prezzo; margBenzina += margTot; }
    }
  });

  var totLitri = litriGasolio + litriBenzina;
  var totEuro = euroGasolio + euroBenzina;
  var totMarg = margGasolio + margBenzina;

  // Pannello live
  var el = document.getElementById('marg-totali-live');
  if (el) {
    el.innerHTML =
      '<div style="font-size:10px;text-transform:uppercase;letter-spacing:1px;color:rgba(255,255,255,0.5);margin-bottom:14px;font-weight:600">Marginalità live</div>' +
      '<div style="margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#BA7517"></div><span style="font-size:11px;font-weight:600;color:#fff">GASOLIO</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#fff">' + litriGasolio.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#7CFC00">€ ' + euroGasolio.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:' + (margGasolio>=0?'#7CFC00':'#FF6B6B') + '">€ ' + margGasolio.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.1);padding-top:12px;margin-bottom:14px">' +
        '<div style="display:flex;align-items:center;gap:6px;margin-bottom:6px"><div style="width:8px;height:8px;border-radius:50%;background:#378ADD"></div><span style="font-size:11px;font-weight:600;color:#87CEFA">BENZINA</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#87CEFA">' + litriBenzina.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:700;color:#7CFC00">€ ' + euroBenzina.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine</span><span style="font-family:var(--font-mono);font-size:14px;font-weight:800;color:' + (margBenzina>=0?'#7CFC00':'#FF6B6B') + '">€ ' + margBenzina.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
      '</div>' +
      '<div style="border-top:1px solid rgba(255,255,255,0.15);padding-top:12px">' +
        '<div style="font-size:11px;font-weight:600;color:rgba(255,255,255,0.7);margin-bottom:6px">TOTALE GIORNATA</div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Litri</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:#fff">' + totLitri.toLocaleString('it-IT',{maximumFractionDigits:0}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between;margin-bottom:2px"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Venduto</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:#7CFC00">€ ' + totEuro.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-size:9px;color:rgba(255,255,255,0.4)">Margine</span><span style="font-family:var(--font-mono);font-size:18px;font-weight:800;color:' + (totMarg>=0?'#7CFC00':'#FF6B6B') + '">€ ' + totMarg.toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}) + '</span></div>' +
      '</div>';
  }
}

async function salvaCostiMarg() {
  var inputs = document.querySelectorAll('.marg-costo');
  var salvati = {};
  for (var i = 0; i < inputs.length; i++) {
    var inp = inputs[i];
    var costo = parseFloat(inp.value);
    if (isNaN(costo) || costo <= 0) continue;
    var key = inp.dataset.data + '_' + inp.dataset.prodotto;
    if (salvati[key]) continue;
    var { error } = await sb.from('stazione_costi').upsert({ data:inp.dataset.data, prodotto:inp.dataset.prodotto, costo_litro:costo }, { onConflict:'data,prodotto' });
    if (error) { toast('Errore: ' + error.message); return; }
    salvati[key] = true;
  }
  var count = Object.keys(salvati).length;
  if (count === 0) { toast('Inserisci almeno un costo'); return; }
  // Aggiorna cache
  var m = window._margData;
  if (m) {
    for (var k in salvati) {
      var parts = k.split('_'); var d = parts[0]; var p = parts.slice(1).join('_');
      var inp2 = document.querySelector('.marg-costo[data-data="'+d+'"][data-prodotto="'+p+'"]');
      if (inp2) m.costiMap[d+'_'+p] = parseFloat(inp2.value);
    }
  }
  toast(count + ' costi salvati!');

  // ═══ Auto-crea costi per giorno successivo da CMP cisterne ═══
  try {
    // Trova la data dei costi salvati
    var dataCorr = null;
    var inputs2 = document.querySelectorAll('.marg-costo');
    for (var j = 0; j < inputs2.length; j++) { if (inputs2[j].dataset.data) { dataCorr = inputs2[j].dataset.data; break; } }
    if (dataCorr) {
      var domani = new Date(new Date(dataCorr).getTime() + 86400000).toISOString().split('T')[0];
      var { data: cisterne } = await sb.from('cisterne').select('prodotto,livello_attuale,costo_medio').eq('sede','stazione_oppido');
      if (cisterne && cisterne.length) {
        // Calcola CMP per prodotto
        var cmpPerProdotto = {};
        cisterne.forEach(function(c) {
          if (!cmpPerProdotto[c.prodotto]) cmpPerProdotto[c.prodotto] = { litri:0, valore:0 };
          cmpPerProdotto[c.prodotto].litri += Number(c.livello_attuale||0);
          cmpPerProdotto[c.prodotto].valore += Number(c.livello_attuale||0) * Number(c.costo_medio||0);
        });
        var costiDomani = [];
        Object.entries(cmpPerProdotto).forEach(function([prodotto, v]) {
          var cmp = v.litri > 0 ? Math.round(v.valore / v.litri * 1000000) / 1000000 : 0;
          if (cmp > 0) {
            costiDomani.push(sb.from('stazione_costi').upsert({ data: domani, prodotto: prodotto, costo_litro: cmp }, { onConflict:'data,prodotto' }));
          }
        });
        if (costiDomani.length) {
          await Promise.all(costiDomani);
          toast('Costi ' + domani + ' preparati da CMP');
        }
      }
    }
  } catch(e) { console.warn('Auto costi domani:', e); }

  renderStoricoMarg();

  // Chiedi se vuole andare al giorno successivo
  if (dataCorr) {
    var domani = new Date(new Date(dataCorr).getTime() + 86400000).toISOString().split('T')[0];
    if (confirm('Costi salvati! Dati preparati per il ' + domani + '.\nVuoi andare al giorno ' + domani + '?')) {
      // Ricarica marginalità con i nuovi dati e naviga al giorno più recente
      await caricaMarginalita();
    }
  }
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
  const { data } = await sb.from('stazione_prezzi').select('*').order('data',{ascending:false}).limit(50);
  const tbody = document.getElementById('stz-storico-prezzi');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="4" class="loading">Nessun prezzo</td></tr>'; return; }
  const perData = {};
  data.forEach(r => { if(!perData[r.data]) perData[r.data]={}; perData[r.data][r.prodotto]=r; });
  var html = '';
  Object.entries(perData).sort((a,b)=>b[0].localeCompare(a[0])).forEach(([data,prodotti]) => {
    const g = prodotti['Gasolio Autotrazione'];
    const b = prodotti['Benzina'];
    const cpG = prodotti['Gasolio Autotrazione (cambio prezzo)'];
    const cpB = prodotti['Benzina (cambio prezzo)'];
    html += '<tr><td>' + data + '</td><td style="font-family:var(--font-mono)">' + (g?'€ '+Number(g.prezzo_litro).toFixed(3):'—') + '</td><td style="font-family:var(--font-mono)">' + (b?'€ '+Number(b.prezzo_litro).toFixed(3):'—') + '</td><td><button class="btn-danger" onclick="eliminaPrezziPompa(\''+data+'\')">x</button></td></tr>';
    if (cpG || cpB) {
      html += '<tr style="background:#f5f5f0;font-size:10px"><td style="padding:3px 8px"><span style="background:#1a1a18;color:#fff;padding:1px 5px;border-radius:4px;font-size:8px">cambio prezzo</span></td><td style="padding:3px 8px;font-family:var(--font-mono);color:#1a1a18">' + (cpG ? '€ '+Number(cpG.prezzo_litro).toFixed(3) : '') + '</td><td style="padding:3px 8px;font-family:var(--font-mono);color:#1a1a18">' + (cpB ? '€ '+Number(cpB.prezzo_litro).toFixed(3) : '') + '</td><td></td></tr>';
    }
  });
  tbody.innerHTML = html;
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
        const cmp = Number(c.costo_medio||0);
        totG += livAtt;
        cisHtml += '<div class="dep-cisterna' + (pct < 30 ? ' alert' : '') + '">' +
          '<div class="dep-cisterna-name">' + c.nome + '</div>' +
          cisternasvg(pct, colore) +
          '<div class="dep-cisterna-litri">' + _sep(livAtt.toLocaleString('it-IT')) + ' L</div>' +
          '<div class="dep-cisterna-pct">' + pct + '% · cap. ' + _sep(capMax.toLocaleString('it-IT')) + ' L</div>' +
          (cmp > 0 ? '<div style="font-size:9px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmp.toFixed(4) + '</strong></div>' : '') +
          '</div>';
      });

      const subLabel = nCis + (nCis === 1 ? ' cisterna' : ' cisterne') + ' · ' + _sep(capGruppo.toLocaleString('it-IT')).replace(/\./g, "'") + ' L';
      // CMP medio ponderato per il gruppo
      let cmpGruppo = 0, valGruppo = 0;
      gruppo.forEach(c => { valGruppo += Number(c.livello_attuale||0) * Number(c.costo_medio||0); });
      cmpGruppo = totG > 0 ? valGruppo / totG : 0;
      const cmpLabel = cmpGruppo > 0 ? '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">CMP: <strong style="font-family:var(--font-mono)">€ ' + cmpGruppo.toFixed(4) + '</strong> · Valore: <strong style="font-family:var(--font-mono)">' + fmtE(totG * cmpGruppo) + '</strong></div>' : '';
      cisHtmlAll += '<div style="margin-bottom:12px"><div class="dep-product-header"><div class="dep-product-dot" style="background:' + colore + '"></div><div><div class="dep-product-title">' + esc(prodNome) + '</div><div class="dep-product-sub">' + subLabel + '</div>' + cmpLabel + '</div><div class="dep-product-total">' + fmtL(totG) + '</div></div><div class="dep-cisterne-grid">' + cisHtml + '</div></div>';
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
// ══════════════════════════════════════════════════════════════
// ── CASSA STAZIONE ───────────────────────────────────────────
// ══════════════════════════════════════════════════════════════

async function caricaCassa() {
  var input = document.getElementById('cassa-data');
  if (!input.value) input.value = oggiISO;
  var data = input.value;

  // Carica dati salvati in parallelo
  var [cassaRes, speseRes, totVendite] = await Promise.all([
    sb.from('stazione_cassa').select('*').eq('data', data).maybeSingle(),
    sb.from('stazione_spese_contanti').select('*').eq('data', data).order('created_at'),
    _calcolaTotVenditeDaLetture(data)
  ]);
  var cassa = cassaRes.data;
  var spese = speseRes.data;
  document.getElementById('cassa-tot-vendite').textContent = fmtE(totVendite);

  // Popola campi
  document.getElementById('cassa-bancomat').value = cassa ? cassa.bancomat || '' : '';
  document.getElementById('cassa-nexi').value = cassa ? cassa.carte_nexi || '' : '';
  document.getElementById('cassa-aziendali').value = cassa ? cassa.carte_aziendali || '' : '';
  document.getElementById('cassa-crediti-emessi').value = cassa ? cassa.crediti_emessi || '' : '';
  document.getElementById('cassa-rimborsi').value = cassa ? cassa.rimborsi_effettuati || '' : '';
  document.getElementById('cassa-rimborsi-prec').value = cassa ? cassa.rimborsi_giorni_prec || '' : '';
  document.getElementById('cassa-versato').value = cassa ? cassa.versato || '' : '';

  // Popola spese contanti
  var listaSpese = document.getElementById('cassa-spese-lista');
  listaSpese.innerHTML = '';
  (spese||[]).forEach(function(s) {
    _aggiungiRigaSpesa(s.id, s.nota || '', s.importo || 0);
  });

  window._cassaTotVendite = totVendite;
  calcolaCassa();
  caricaCrediti();
}

async function _calcolaTotVenditeDaLetture(data) {
  var { data: pompe } = await sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true);
  var pompeIds = (pompe||[]).map(function(p){return p.id;});
  if (!pompeIds.length) return 0;
  var giornoPre = new Date(new Date(data).getTime()-86400000).toISOString().split('T')[0];
  var [r1, r2, r3] = await Promise.all([
    sb.from('stazione_letture').select('*').eq('data',data).in('pompa_id',pompeIds),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).lte('data',giornoPre).order('data',{ascending:false}).limit(pompeIds.length),
    sb.from('stazione_prezzi').select('*').eq('data',data)
  ]);
  var lettOggi = r1.data; var lettPrec = r2.data; var prezzi = r3.data;
  var prezziMap = {};
  (prezzi||[]).forEach(function(p){ prezziMap[p.prodotto] = Number(p.prezzo_litro); });
  var pompeMap = {};
  (pompe||[]).forEach(function(p){ pompeMap[p.id] = p; });
  var tot = 0;
  (lettOggi||[]).forEach(function(l) {
    var pompa = pompeMap[l.pompa_id]; if (!pompa) return;
    var prec = (lettPrec||[]).find(function(x){return x.pompa_id===l.pompa_id;});
    if (!prec) return;
    var litri = Number(l.lettura) - Number(prec.lettura);
    if (litri <= 0) return;
    var prezzo = prezziMap[pompa.prodotto] || 0;
    var litriPD = Number(l.litri_prezzo_diverso||0);
    var prezzoPD = Number(l.prezzo_diverso||0);
    if (litriPD > 0 && prezzoPD > 0) {
      tot += (Math.max(0, litri - litriPD) * prezzo) + (litriPD * prezzoPD);
    } else {
      tot += litri * prezzo;
    }
  });
  return tot;
}

function cassaGiorno(dir) {
  var input = document.getElementById('cassa-data');
  var d = input.value ? new Date(input.value) : new Date();
  d.setDate(d.getDate() + dir);
  input.value = d.toISOString().split('T')[0];
  caricaCassa();
}

function aggiungiSpesaCassa() {
  _aggiungiRigaSpesa('new_' + Date.now(), '', 0);
  calcolaCassa();
}

function _aggiungiRigaSpesa(id, nota, importo) {
  var lista = document.getElementById('cassa-spese-lista');
  var row = document.createElement('div');
  row.dataset.speseId = id;
  row.style.cssText = 'display:flex;gap:6px;align-items:center;margin-bottom:4px';
  row.innerHTML = '<input type="text" class="cassa-spesa-nota" value="' + esc(nota) + '" placeholder="Nota spesa..." style="font-size:12px;flex:1;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text)" />' +
    '<input type="number" class="cassa-spesa-importo" value="' + (importo || '') + '" placeholder="0.00" step="0.01" oninput="calcolaCassa()" style="font-family:var(--font-mono);font-size:13px;text-align:right;width:90px;padding:4px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text)" />' +
    '<button onclick="this.parentElement.remove();calcolaCassa()" style="font-size:12px;padding:2px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer;color:#A32D2D">x</button>';
  lista.appendChild(row);
}

function calcolaCassa() {
  var bancomat = parseFloat(document.getElementById('cassa-bancomat').value) || 0;
  var nexi = parseFloat(document.getElementById('cassa-nexi').value) || 0;
  var aziendali = parseFloat(document.getElementById('cassa-aziendali').value) || 0;
  var creditiEmessi = parseFloat(document.getElementById('cassa-crediti-emessi').value) || 0;
  var rimborsi = parseFloat(document.getElementById('cassa-rimborsi').value) || 0;
  var rimborsiPrec = parseFloat(document.getElementById('cassa-rimborsi-prec').value) || 0;
  var versato = parseFloat(document.getElementById('cassa-versato').value) || 0;

  var totSpese = 0;
  document.querySelectorAll('.cassa-spesa-importo').forEach(function(inp) { totSpese += parseFloat(inp.value) || 0; });

  var totVendite = window._cassaTotVendite || 0;

  // Somma incassi carte
  var totCarte = Math.round((bancomat + nexi + aziendali) * 100) / 100;
  document.getElementById('cassa-tot-incassi').textContent = fmtE(totCarte);

  // Contanti = vendite - carte (sempre auto)
  var contanti = Math.max(0, Math.round((totVendite - totCarte) * 100) / 100);
  document.getElementById('cassa-val-contanti').textContent = fmtE(contanti);

  // KPI: carte non devono superare vendite
  var kpiQ = document.getElementById('cassa-kpi-quadra');
  if (totCarte > 0 && totCarte <= totVendite + 0.50) {
    kpiQ.style.background = '#EAF3DE'; kpiQ.style.borderColor = '#639922';
  } else if (totCarte > totVendite + 0.50) {
    kpiQ.style.background = '#FCEBEB'; kpiQ.style.borderColor = '#E24B4A';
  } else {
    kpiQ.style.background = ''; kpiQ.style.borderColor = '';
  }

  // Crediti da rimborsare = saldo giornaliero
  var creditiDaRimborsare = Math.round((creditiEmessi - rimborsi) * 100) / 100;
  var elCrediti = document.getElementById('cassa-crediti-sospesi');
  elCrediti.textContent = (creditiDaRimborsare >= 0 ? '+ ' : '− ') + fmtE(Math.abs(creditiDaRimborsare));
  elCrediti.style.color = creditiDaRimborsare >= 0 ? '#639922' : '#A32D2D';

  // Contanti da versare = contanti + crediti emessi - rimborsi - rimborsi gg prec - spese
  var daVersare = Math.round((contanti + creditiEmessi - rimborsi - rimborsiPrec - totSpese) * 100) / 100;
  document.getElementById('cassa-da-versare').textContent = fmtE(daVersare);
  document.getElementById('cassa-kpi-daversare').textContent = fmtE(daVersare);

  // Differenza versamento
  var differenza = Math.round((versato - daVersare) * 100) / 100;
  document.getElementById('cassa-differenza').textContent = fmtE(differenza);
  var kpiDiff = document.getElementById('cassa-kpi-diff');
  if (Math.abs(differenza) < 0.01 && versato > 0) {
    kpiDiff.style.background = '#EAF3DE'; kpiDiff.style.borderColor = '#639922';
    document.getElementById('cassa-differenza').style.color = '#639922';
  } else if (versato > 0) {
    kpiDiff.style.background = '#FCEBEB'; kpiDiff.style.borderColor = '#E24B4A';
    document.getElementById('cassa-differenza').style.color = '#A32D2D';
  } else {
    kpiDiff.style.background = ''; kpiDiff.style.borderColor = '';
    document.getElementById('cassa-differenza').style.color = '';
  }
}

async function salvaCassa() {
  var data = document.getElementById('cassa-data').value;
  if (!data) { toast('Seleziona una data'); return; }

  var bancomat = parseFloat(document.getElementById('cassa-bancomat').value) || 0;
  var nexi = parseFloat(document.getElementById('cassa-nexi').value) || 0;
  var aziendali = parseFloat(document.getElementById('cassa-aziendali').value) || 0;
  
  var creditiEmessi = parseFloat(document.getElementById('cassa-crediti-emessi').value) || 0;
  var rimborsi = parseFloat(document.getElementById('cassa-rimborsi').value) || 0;
  var rimborsiPrec = parseFloat(document.getElementById('cassa-rimborsi-prec').value) || 0;
  var versato = parseFloat(document.getElementById('cassa-versato').value) || 0;
  var totVendite = window._cassaTotVendite || 0;

  var contanti = Math.max(0, Math.round((totVendite - bancomat - nexi - aziendali) * 100) / 100);

  var totSpese = 0;
  document.querySelectorAll('.cassa-spesa-importo').forEach(function(inp) { totSpese += parseFloat(inp.value) || 0; });
  var daVersare = Math.round((contanti + creditiEmessi - rimborsi - rimborsiPrec - totSpese) * 100) / 100;
  var differenza = Math.round((versato - daVersare) * 100) / 100;
  var creditiDaRimborsare = Math.round((creditiEmessi - rimborsi) * 100) / 100;

  var record = {
    data, totale_vendite: totVendite,
    bancomat, carte_nexi: nexi, carte_aziendali: aziendali, contanti,
    crediti_emessi: creditiEmessi, rimborsi_effettuati: rimborsi,
    rimborsi_giorni_prec: rimborsiPrec, crediti_da_rimborsare: creditiDaRimborsare,
    contanti_da_versare: daVersare, versato, differenza
  };

  // Controlla se esiste già un registro per questa data
  var { data: cassaEsistente } = await sb.from('stazione_cassa').select('id').eq('data', data).maybeSingle();
  if (cassaEsistente) {
    if (!confirm('Esiste già un registro cassa per il ' + data + '.\nVuoi sovrascriverlo?')) return;
  }

  var { error } = await sb.from('stazione_cassa').upsert(record, { onConflict: 'data' });
  if (error) { toast('Errore: ' + error.message); return; }

  // Registra versamento automatico nella sezione Versamenti
  try {
    var totCarte = Math.round((bancomat + nexi + aziendali) * 100) / 100;
    await sb.from('stazione_versamenti').delete().eq('data', data).eq('note', 'Da registro cassa');
    if (versato > 0 || totCarte > 0) {
      await sb.from('stazione_versamenti').insert([{ data: data, contanti: versato, pos: totCarte, note: 'Da registro cassa' }]);
    }
  } catch(e) { console.warn('Errore versamento auto:', e); }

  // Salva spese contanti (batch)
  await sb.from('stazione_spese_contanti').delete().eq('data', data);
  var speseInserts = [];
  var righeSpese = document.querySelectorAll('#cassa-spese-lista > div');
  for (var i = 0; i < righeSpese.length; i++) {
    var nota = righeSpese[i].querySelector('.cassa-spesa-nota').value;
    var importo = parseFloat(righeSpese[i].querySelector('.cassa-spesa-importo').value) || 0;
    if (importo > 0) speseInserts.push({ data, nota, importo });
  }
  if (speseInserts.length) await sb.from('stazione_spese_contanti').insert(speseInserts);

  // Registro crediti giornaliero: un solo record per giorno
  // Saldo = crediti emessi - rimborsi - rimborsi gg precedenti
  var saldoCredGiorno = Math.round((creditiEmessi - rimborsi - rimborsiPrec) * 100) / 100;
  if (saldoCredGiorno !== 0 || creditiEmessi > 0 || rimborsi > 0 || rimborsiPrec > 0) {
    var notaCred = 'Crediti: ' + fmtE(creditiEmessi) + ' | Rimborsi: ' + fmtE(rimborsi) + ' | Rimb.prec: ' + fmtE(rimborsiPrec);
    var { data: esistente } = await sb.from('stazione_crediti').select('id').eq('data_emissione', data).maybeSingle();
    if (esistente) {
      await sb.from('stazione_crediti').update({ importo: saldoCredGiorno, nota: notaCred }).eq('id', esistente.id);
    } else {
      await sb.from('stazione_crediti').insert([{ data_emissione: data, importo: saldoCredGiorno, nota: notaCred }]);
    }
  }

  toast('Registro cassa salvato!');
  calcolaCassa();
  caricaCrediti();
}

// ── REGISTRO CREDITI GIORNALIERO ──
async function caricaCrediti() {
  var { data: crediti } = await sb.from('stazione_crediti').select('*').order('data_emissione',{ascending:false}).limit(60);
  var tbody = document.getElementById('cred-tabella');

  var totale = 0, totMese = 0;
  var inizioMese = oggiISO.substring(0,8) + '01';

  (crediti||[]).forEach(function(c) {
    var imp = Number(c.importo||0);
    totale += imp;
    if (c.data_emissione >= inizioMese) totMese += imp;
  });

  // KPI
  var elTot = document.getElementById('cred-totale');
  elTot.textContent = fmtE(totale);
  elTot.style.color = totale >= 0 ? '#A32D2D' : '#639922';

  var elMese = document.getElementById('cred-mese');
  elMese.textContent = fmtE(totMese);
  elMese.style.color = totMese >= 0 ? '#A32D2D' : '#639922';

  if (!crediti || !crediti.length) {
    tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun registro</td></tr>';
    return;
  }

  tbody.innerHTML = crediti.map(function(c) {
    var imp = Number(c.importo||0);
    var isPos = imp >= 0;
    var colore = isPos ? '#A32D2D' : '#639922';
    var segno = isPos ? '+' : '−';
    // Estrai dettagli dalla nota
    var notaParts = (c.nota||'').split('|').map(function(s){return s.trim();});
    var credVal = '—', rimbVal = '—', rimbPrecVal = '—';
    notaParts.forEach(function(p) {
      if (p.indexOf('Crediti:') === 0) credVal = p.replace('Crediti:','').trim();
      if (p.indexOf('Rimborsi:') === 0) rimbVal = p.replace('Rimborsi:','').trim();
      if (p.indexOf('Rimb.prec:') === 0) rimbPrecVal = p.replace('Rimb.prec:','').trim();
    });
    return '<tr><td style="font-weight:500">' + c.data_emissione + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px">' + credVal + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px">' + rimbVal + '</td>' +
      '<td style="font-family:var(--font-mono);font-size:11px">' + rimbPrecVal + '</td>' +
      '<td style="font-family:var(--font-mono);font-weight:600;color:' + colore + '">' + segno + ' ' + fmtE(Math.abs(imp)) + '</td>' +
      '<td style="font-size:11px;color:var(--text-muted)">' + (isPos ? 'credito netto' : 'riduzione crediti') + '</td></tr>';
  }).join('');
}

async function stampaCassa() {
  var data = document.getElementById('cassa-data').value;
  if (!data) { toast('Seleziona una data'); return; }
  var dataFmt = new Date(data).toLocaleDateString('it-IT', { weekday:'long', day:'2-digit', month:'long', year:'numeric' });
  var totVendite = window._cassaTotVendite || 0;
  var bancomat = parseFloat(document.getElementById('cassa-bancomat').value) || 0;
  var nexi = parseFloat(document.getElementById('cassa-nexi').value) || 0;
  var aziendali = parseFloat(document.getElementById('cassa-aziendali').value) || 0;
  
  var contanti = Math.max(0, Math.round((totVendite - bancomat - nexi - aziendali) * 100) / 100);
  var creditiEmessi = parseFloat(document.getElementById('cassa-crediti-emessi').value) || 0;
  var rimborsi = parseFloat(document.getElementById('cassa-rimborsi').value) || 0;
  var rimborsiPrec = parseFloat(document.getElementById('cassa-rimborsi-prec').value) || 0;
  var creditiDaRimborsare = Math.round((creditiEmessi - rimborsi) * 100) / 100;
  var versato = parseFloat(document.getElementById('cassa-versato').value) || 0;
  var totSpese = 0;
  var speseHtml = '';
  document.querySelectorAll('#cassa-spese-lista > div').forEach(function(row) {
    var nota = row.querySelector('.cassa-spesa-nota').value || '—';
    var imp = parseFloat(row.querySelector('.cassa-spesa-importo').value) || 0;
    if (imp > 0) { totSpese += imp; speseHtml += '<tr><td style="padding:4px 8px;border:1px solid #ddd;padding-left:20px;color:#666">− Spesa: ' + esc(nota) + '</td><td style="padding:4px 8px;border:1px solid #ddd;text-align:right;font-family:Courier New,monospace;color:#A32D2D">− € ' + imp.toFixed(2) + '</td></tr>'; }
  });
  var daVersare = Math.round((contanti + creditiEmessi - rimborsi - rimborsiPrec - totSpese) * 100) / 100;
  var differenza = Math.round((versato - daVersare) * 100) / 100;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Registro Cassa ' + data + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm}@media print{.no-print{display:none!important}@page{size:portrait;margin:8mm}}table{width:100%;border-collapse:collapse;margin-bottom:12px}td{padding:6px 8px;border:1px solid #ddd}.mono{font-family:Courier New,monospace;text-align:right;font-weight:bold}.section{font-size:10px;font-weight:bold;color:#6B5FCC;text-transform:uppercase;letter-spacing:0.3px;padding:8px;background:#f5f5f5;border:1px solid #ddd}</style></head><body>';
  html += '<div style="display:flex;justify-content:space-between;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:14px"><div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REGISTRO CASSA — STAZIONE OPPIDO</div><div style="font-size:12px;color:#666;margin-top:2px">' + dataFmt + '</div></div><div style="text-align:right"><div style="font-size:12px;font-weight:bold">PHOENIX FUEL SRL</div></div></div>';
  html += '<table><tr class="section"><td colspan="2">Riepilogo giornata</td></tr>';
  html += '<tr style="background:#EAF3DE"><td style="font-weight:bold">Totale vendite (letture)</td><td class="mono" style="color:#639922">' + fmtE(totVendite) + '</td></tr>';
  html += '</table>';
  html += '<table><tr class="section"><td colspan="2">Incassi carte</td></tr>';
  html += '<tr><td>Bancomat</td><td class="mono">' + fmtE(bancomat) + '</td></tr>';
  html += '<tr><td>Carte Nexi</td><td class="mono">' + fmtE(nexi) + '</td></tr>';
  html += '<tr><td>Carte aziendali</td><td class="mono">' + fmtE(aziendali) + '</td></tr>';
  html += '<tr style="background:#f0f0f0;font-weight:bold"><td>Totale incassi carte</td><td class="mono">' + fmtE(bancomat+nexi+aziendali) + '</td></tr>';
  html += '</table>';
  html += '<table><tr class="section"><td colspan="2">Operazioni contanti</td></tr>';
  html += '<tr style="font-weight:bold"><td>Contanti (vendite − carte)</td><td class="mono">' + fmtE(contanti) + '</td></tr>';
  html += '<tr><td>+ Crediti emessi</td><td class="mono" style="color:#639922">+ ' + fmtE(creditiEmessi) + '</td></tr>';
  html += '<tr><td>− Rimborsi effettuati</td><td class="mono" style="color:#A32D2D">− ' + fmtE(rimborsi) + '</td></tr>';
  html += '<tr><td>− Rimborsi giorni prec.</td><td class="mono" style="color:#A32D2D">− ' + fmtE(rimborsiPrec) + '</td></tr>';
  html += '<tr><td>Crediti da rimborsare (saldo gg)</td><td class="mono" style="color:' + (creditiDaRimborsare >= 0 ? '#639922' : '#A32D2D') + '">' + (creditiDaRimborsare >= 0 ? '+ ' : '− ') + fmtE(Math.abs(creditiDaRimborsare)) + '</td></tr>';
  html += speseHtml;
  html += '<tr style="background:#EAF3DE;font-weight:bold"><td>Contanti da versare</td><td class="mono" style="color:#639922">' + fmtE(daVersare) + '</td></tr>';
  html += '</table>';
  html += '<table><tr class="section"><td colspan="2">Quadratura versamento</td></tr>';
  html += '<tr><td>Da versare</td><td class="mono">' + fmtE(daVersare) + '</td></tr>';
  html += '<tr><td>Versato</td><td class="mono">' + fmtE(versato) + '</td></tr>';
  var diffColor = Math.abs(differenza) < 0.01 ? '#639922' : '#A32D2D';
  html += '<tr style="background:' + (Math.abs(differenza)<0.01 ? '#EAF3DE' : '#FCEBEB') + ';font-weight:bold"><td>Differenza</td><td class="mono" style="color:' + diffColor + '">' + fmtE(differenza) + '</td></tr>';
  html += '</table>';
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div>';
  html += '</body></html>';
  var w = window.open('','_blank'); w.document.write(html); w.document.close();
}

function initReportStazione() {
  var annoCorr = new Date().getFullYear();
  var meseCorr = String(new Date().getMonth()+1).padStart(2,'0');
  ['stz-rep-anno','stz-rep-cassa-anno','stz-rep-vend-anno'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (sel && sel.options.length === 0) {
      for (var y = annoCorr; y >= annoCorr - 5; y--) sel.innerHTML += '<option value="' + y + '"' + (y===annoCorr?' selected':'') + '>' + y + '</option>';
    }
  });
  ['stz-rep-mese','stz-rep-cassa-mese','stz-rep-vend-mese'].forEach(function(id) {
    var sel = document.getElementById(id);
    if (sel) sel.value = meseCorr;
  });
}

async function _caricaDatiCassaMese(anno, mese) {
  var da = anno + '-' + mese + '-01';
  var ultimoGiorno = new Date(Number(anno), Number(mese), 0).getDate();
  var a = anno + '-' + mese + '-' + String(ultimoGiorno).padStart(2,'0');
  var [cassaRes, speseRes] = await Promise.all([
    sb.from('stazione_cassa').select('*').gte('data', da).lte('data', a).order('data'),
    sb.from('stazione_spese_contanti').select('data,importo').gte('data', da).lte('data', a)
  ]);
  var casse = cassaRes.data || [];
  var speseMap = {};
  (speseRes.data || []).forEach(function(s) { speseMap[s.data] = (speseMap[s.data] || 0) + Number(s.importo); });
  return { casse: casse, speseMap: speseMap, da: da, a: a, ultimoGiorno: ultimoGiorno };
}

async function stampaReportCassaMensile() {
  var anno = document.getElementById('stz-rep-cassa-anno').value;
  var mese = document.getElementById('stz-rep-cassa-mese').value;
  if (!anno || !mese) { toast('Seleziona anno e mese'); return; }
  var meseNome = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];

  toast('Generazione report cassa...');
  var r = await _caricaDatiCassaMese(anno, mese);
  var casse = r.casse, speseMap = r.speseMap;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Cassa ' + meseNome + ' ' + anno + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:9px;margin:0;padding:6mm;color:#1a1a18}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:5mm}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#6B5FCC;color:#fff;padding:4px 3px;font-size:7px;text-transform:uppercase;letter-spacing:0.2px;border:1px solid #5A4FBB;text-align:right}' +
    'th:first-child{text-align:left}' +
    'td{padding:3px 4px;border:1px solid #ddd;font-size:9px;text-align:right;font-family:Courier New,monospace}' +
    'td:first-child{text-align:left;font-family:Arial,sans-serif;font-weight:500}' +
    '.tot{background:#f0f0f0;font-weight:bold}.tot td{border-top:2px solid #6B5FCC}' +
    '.alt{background:#fafaf8}' +
    '</style></head><body>';

  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:10px">';
  html += '<div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REPORT CASSA MENSILE — STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:2px">' + meseNome + ' ' + anno + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:13px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:8px;color:#666">Generato il ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  html += '<table><thead><tr>';
  html += '<th style="text-align:left;width:42px">Data</th>';
  html += '<th>Vendite tot.</th>';
  html += '<th style="background:#185FA5">Bancomat</th>';
  html += '<th style="background:#534AB7">Carte Nexi</th>';
  html += '<th style="background:#993C1D">Carte Aziend.</th>';
  html += '<th>Cred. emessi</th>';
  html += '<th>Cred. rimb.</th>';
  html += '<th>Rimb. gg prec</th>';
  html += '<th>Spese cont.</th>';
  html += '<th style="background:#3B6D11">Cont. versati</th>';
  html += '</tr></thead><tbody>';

  var totV=0, totB=0, totN=0, totA=0, totCE=0, totCR=0, totRP=0, totSP=0, totCV=0;

  casse.forEach(function(c, idx) {
    var gg = c.data.substring(8) + '/' + c.data.substring(5,7);
    var vendite = Number(c.totale_vendite||0);
    var banc = Number(c.bancomat||0);
    var nexi = Number(c.carte_nexi||0);
    var azien = Number(c.carte_aziendali||0);
    var ce = Number(c.crediti_emessi||0);
    var cr = Number(c.rimborsi_effettuati||0);
    var rp = Number(c.rimborsi_giorni_prec||0);
    var sp = speseMap[c.data] || 0;
    var cv = Number(c.versato||0);

    totV+=vendite; totB+=banc; totN+=nexi; totA+=azien; totCE+=ce; totCR+=cr; totRP+=rp; totSP+=sp; totCV+=cv;

    html += '<tr' + (idx%2 ? ' class="alt"' : '') + '>';
    html += '<td>' + gg + '</td>';
    html += '<td>' + fmtE(vendite) + '</td>';
    html += '<td>' + fmtE(banc) + '</td>';
    html += '<td>' + fmtE(nexi) + '</td>';
    html += '<td>' + fmtE(azien) + '</td>';
    html += '<td>' + (ce > 0 ? fmtE(ce) : '—') + '</td>';
    html += '<td>' + (cr > 0 ? fmtE(cr) : '—') + '</td>';
    html += '<td>' + (rp > 0 ? fmtE(rp) : '—') + '</td>';
    html += '<td>' + (sp > 0 ? fmtE(sp) : '—') + '</td>';
    html += '<td style="font-weight:bold;color:#3B6D11">' + fmtE(cv) + '</td>';
    html += '</tr>';
  });

  html += '<tr class="tot">';
  html += '<td>TOTALE</td>';
  html += '<td>' + fmtE(totV) + '</td>';
  html += '<td>' + fmtE(totB) + '</td>';
  html += '<td>' + fmtE(totN) + '</td>';
  html += '<td>' + fmtE(totA) + '</td>';
  html += '<td>' + fmtE(totCE) + '</td>';
  html += '<td>' + fmtE(totCR) + '</td>';
  html += '<td>' + fmtE(totRP) + '</td>';
  html += '<td>' + fmtE(totSP) + '</td>';
  html += '<td style="color:#3B6D11">' + fmtE(totCV) + '</td>';
  html += '</tr></tbody></table>';

  if (!casse.length) {
    html += '<div style="text-align:center;padding:20px;color:#888">Nessun dato cassa per ' + meseNome + ' ' + anno + '</div>';
  }

  html += '<div style="text-align:center;font-size:8px;color:#aaa;margin-top:10px;border-top:1px solid #ddd;padding-top:5px">PhoenixFuel Srl — Report cassa ' + meseNome + ' ' + anno + '</div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('','_blank'); w.document.write(html); w.document.close();
}

async function esportaCassaExcel() {
  var anno = document.getElementById('stz-rep-cassa-anno').value;
  var mese = document.getElementById('stz-rep-cassa-mese').value;
  if (!anno || !mese) { toast('Seleziona anno e mese'); return; }
  var meseNome = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];

  toast('Generazione Excel...');
  var r = await _caricaDatiCassaMese(anno, mese);
  var casse = r.casse, speseMap = r.speseMap;

  if (typeof XLSX === 'undefined') { toast('Libreria Excel non caricata. Ricarica la pagina.'); return; }

  var header = ['Data','Vendite totali','Bancomat','Carte Nexi','Carte Aziendali','Crediti emessi','Crediti rimborsati','Rimb. gg prec.','Spese contanti','Contanti versati'];
  var righe = [header];
  var totV=0, totB=0, totN=0, totA=0, totCE=0, totCR=0, totRP=0, totSP=0, totCV=0;

  casse.forEach(function(c) {
    var vendite = Number(c.totale_vendite||0);
    var banc = Number(c.bancomat||0);
    var nexi = Number(c.carte_nexi||0);
    var azien = Number(c.carte_aziendali||0);
    var ce = Number(c.crediti_emessi||0);
    var cr = Number(c.rimborsi_effettuati||0);
    var rp = Number(c.rimborsi_giorni_prec||0);
    var sp = speseMap[c.data] || 0;
    var cv = Number(c.versato||0);
    totV+=vendite; totB+=banc; totN+=nexi; totA+=azien; totCE+=ce; totCR+=cr; totRP+=rp; totSP+=sp; totCV+=cv;
    righe.push([c.data, vendite, banc, nexi, azien, ce, cr, rp, sp, cv]);
  });

  righe.push(['TOTALE', totV, totB, totN, totA, totCE, totCR, totRP, totSP, totCV]);

  var ws = XLSX.utils.aoa_to_sheet(righe);
  // Formatta colonne numeriche
  var range = XLSX.utils.decode_range(ws['!ref']);
  for (var R = 1; R <= range.e.r; R++) {
    for (var C = 1; C <= 9; C++) {
      var addr = XLSX.utils.encode_cell({r:R,c:C});
      if (ws[addr]) ws[addr].z = '#,##0.00';
    }
  }
  ws['!cols'] = [{wch:12},{wch:14},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14},{wch:14}];

  var wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Cassa ' + meseNome);
  XLSX.writeFile(wb, 'ReportCassa_' + meseNome + '_' + anno + '.xlsx');
  toast('Excel generato!');
}

async function stampaReportMensileContatori() {
  var anno = document.getElementById('stz-rep-anno').value;
  var mese = document.getElementById('stz-rep-mese').value;
  if (!anno || !mese) { toast('Seleziona anno e mese'); return; }

  var da = anno + '-' + mese + '-01';
  var ultimoGiorno = new Date(Number(anno), Number(mese), 0).getDate();
  var a = anno + '-' + mese + '-' + String(ultimoGiorno).padStart(2,'0');
  var meseNome = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];

  toast('Generazione report in corso...');

  var { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  var pompeIds = (pompe||[]).map(function(p){return p.id;});
  if (!pompeIds.length) { toast('Nessuna pompa configurata'); return; }

  var giornoPre = new Date(new Date(da).getTime()-86400000).toISOString().split('T')[0];
  var { data: letture } = await sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).gte('data',giornoPre).lte('data',a).order('data');

  var lettPerPompaData = {};
  (letture||[]).forEach(function(l){
    if (!lettPerPompaData[l.pompa_id]) lettPerPompaData[l.pompa_id] = {};
    lettPerPompaData[l.pompa_id][l.data] = l;
  });

  var giorni = [];
  for (var d = 1; d <= ultimoGiorno; d++) {
    giorni.push(anno + '-' + mese + '-' + String(d).padStart(2,'0'));
  }

  var nPompe = pompe.length;
  var colTotale = 1 + (nPompe * 2) + 1;

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Contatori ' + meseNome + ' ' + anno + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:8mm;color:#1a1a18}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}' +
    'table{width:100%;border-collapse:collapse;margin-bottom:14px}' +
    'th{background:#6B5FCC;color:#fff;padding:4px 3px;font-size:7px;text-transform:uppercase;letter-spacing:0.2px;border:1px solid #5A4FBB;text-align:center}' +
    'th.sub{background:#7B73CC;font-size:7px;padding:2px 3px}' +
    'td{padding:3px 4px;border:1px solid #ddd;font-size:9px}' +
    '.m{font-family:Courier New,monospace;text-align:right}' +
    '.b{font-weight:bold}' +
    '.tot{background:#f0f0f0;font-weight:bold}' +
    '.tot td{border-top:2px solid #6B5FCC}' +
    '.lt{text-align:right;background:#fafaf8}' +
    '</style></head><body>';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:12px">';
  html += '<div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REGISTRO CONTATORI — STAZIONE OPPIDO</div>';
  html += '<div style="font-size:12px;color:#666;margin-top:2px">' + meseNome + ' ' + anno + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:13px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:8px;color:#666">Generato il ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  // ═══ TABELLA UNICA ORIZZONTALE ═══
  // Header: Data | Pompa1 Cont. | Pompa1 Litri | Pompa2 Cont. | ... | Litri totali
  html += '<table><thead><tr><th rowspan="2" style="width:45px">Data</th>';
  pompe.forEach(function(p) {
    var _pi = cacheProdotti.find(function(pp){return pp.nome===p.prodotto;});
    var colore = _pi ? _pi.colore : '#888';
    html += '<th colspan="2" style="border-bottom:2px solid ' + colore + '">' + esc(p.nome) + '</th>';
  });
  html += '<th rowspan="2" style="background:#534AB7;width:60px">Litri<br>totali</th></tr>';
  html += '<tr>';
  pompe.forEach(function() {
    html += '<th class="sub">Cont.</th><th class="sub">Litri</th>';
  });
  html += '</tr></thead><tbody>';

  // Dati per giorno
  var totPerPompa = {};
  pompe.forEach(function(p) { totPerPompa[p.id] = { litri:0, nome:p.nome, prodotto:p.prodotto }; });
  var totGenerale = 0;

  giorni.forEach(function(data) {
    var litriGiorno = 0;
    var hasData = false;
    var celle = '';

    pompe.forEach(function(pompa) {
      var lettPompa = lettPerPompaData[pompa.id] || {};
      var lettOggi = lettPompa[data];

      if (!lettOggi) {
        celle += '<td class="m" style="color:#ccc">—</td><td class="m" style="color:#ccc">—</td>';
        return;
      }
      hasData = true;
      var lettura = Number(lettOggi.lettura);
      var datePrev = Object.keys(lettPompa).filter(function(d){return d < data;}).sort();
      var prevData = datePrev.length ? datePrev[datePrev.length-1] : null;
      if (!prevData && lettPompa[giornoPre]) prevData = giornoPre;
      var lettIeri = prevData ? lettPompa[prevData] : null;
      var litri = lettIeri ? lettura - Number(lettIeri.lettura) : null;

      celle += '<td class="m" style="font-size:8px;color:#666">' + String(lettura) + '</td>';
      if (litri !== null && litri > 0) {
        celle += '<td class="m b">' + fmtL(litri) + '</td>';
        totPerPompa[pompa.id].litri += litri;
        litriGiorno += litri;
      } else {
        celle += '<td class="m" style="color:#ccc">—</td>';
      }
    });

    totGenerale += litriGiorno;
    var gg = data.substring(8);
    html += '<tr' + (!hasData ? ' style="opacity:0.3"' : '') + '><td><strong>' + gg + '/' + mese + '</strong></td>' + celle + '<td class="m b lt">' + (litriGiorno > 0 ? fmtL(litriGiorno) : '—') + '</td></tr>';
  });

  // Riga totale
  html += '<tr class="tot"><td>TOTALE</td>';
  pompe.forEach(function(p) {
    html += '<td></td><td class="m">' + fmtL(totPerPompa[p.id].litri) + '</td>';
  });
  html += '<td class="m">' + fmtL(totGenerale) + '</td></tr>';
  html += '</tbody></table>';

  // ═══ RIEPILOGO ═══
  html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-top:8px">';

  // Per pompa
  html += '<div style="flex:1;min-width:200px"><div style="font-size:10px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;border-bottom:1px solid #6B5FCC;padding-bottom:3px">Riepilogo per pompa</div>';
  html += '<table><thead><tr><th style="text-align:left">Pompa</th><th>Prodotto</th><th>Litri</th></tr></thead><tbody>';
  pompe.forEach(function(p) {
    var _pi = cacheProdotti.find(function(pp){return pp.nome===p.prodotto;});
    var colore = _pi ? _pi.colore : '#888';
    html += '<tr><td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+colore+';margin-right:3px"></span><strong>' + esc(p.nome) + '</strong></td><td style="font-size:8px">' + esc(p.prodotto) + '</td><td class="m b">' + fmtL(totPerPompa[p.id].litri) + '</td></tr>';
  });
  html += '<tr class="tot"><td colspan="2">TOTALE</td><td class="m">' + fmtL(totGenerale) + '</td></tr>';
  html += '</tbody></table></div>';

  // Per prodotto
  var perProdotto = {};
  pompe.forEach(function(p) {
    if (!perProdotto[p.prodotto]) {
      var _pi = cacheProdotti.find(function(pp){return pp.nome===p.prodotto;});
      perProdotto[p.prodotto] = { litri:0, colore: _pi ? _pi.colore : '#888' };
    }
    perProdotto[p.prodotto].litri += totPerPompa[p.id].litri;
  });

  html += '<div style="flex:1;min-width:200px"><div style="font-size:10px;font-weight:bold;color:#6B5FCC;margin-bottom:6px;border-bottom:1px solid #6B5FCC;padding-bottom:3px">Riepilogo per prodotto</div>';
  html += '<table><thead><tr><th style="text-align:left">Prodotto</th><th>Litri</th></tr></thead><tbody>';
  Object.entries(perProdotto).forEach(function([prod, v]) {
    html += '<tr><td><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:'+v.colore+';margin-right:3px"></span><strong>' + esc(prod) + '</strong></td><td class="m b">' + fmtL(v.litri) + '</td></tr>';
  });
  html += '<tr class="tot"><td>TOTALE MESE</td><td class="m">' + fmtL(totGenerale) + '</td></tr>';
  html += '</tbody></table></div>';
  html += '</div>';

  html += '<div style="text-align:center;font-size:8px;color:#aaa;margin-top:12px;border-top:1px solid #ddd;padding-top:5px">PhoenixFuel Srl — Registro contatori ' + meseNome + ' ' + anno + '</div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  var w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
}

async function _caricaDatiVenditeMese(anno, mese) {
  var da = anno + '-' + mese + '-01';
  var ultimoGiorno = new Date(Number(anno), Number(mese), 0).getDate();
  var a = anno + '-' + mese + '-' + String(ultimoGiorno).padStart(2,'0');
  var { data: pompe } = await sb.from('stazione_pompe').select('*').eq('attiva',true).order('ordine');
  var pompeIds = (pompe||[]).map(function(p){return p.id;});
  if (!pompeIds.length) return { righe:[], totali:{} };
  var giornoPre = new Date(new Date(da).getTime()-86400000).toISOString().split('T')[0];
  var [lettRes, prezRes, costiRes, lettPreRes] = await Promise.all([
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).gte('data',da).lte('data',a).order('data'),
    sb.from('stazione_prezzi').select('*').gte('data',da).lte('data',a),
    sb.from('stazione_costi').select('*').gte('data',da).lte('data',a),
    sb.from('stazione_letture').select('*').in('pompa_id',pompeIds).lte('data',giornoPre).order('data',{ascending:false}).limit(pompeIds.length)
  ]);
  var letture=lettRes.data||[], prezzi=prezRes.data||[], costiDb=costiRes.data||[], lettPre=lettPreRes.data||[];
  var prezziMap={}; prezzi.forEach(function(p){prezziMap[p.data+'_'+p.prodotto]=p.prezzo_litro;});
  var costiMap={}; costiDb.forEach(function(c){costiMap[c.data+'_'+c.prodotto]=Number(c.costo_litro);});
  var tutteLetture=[...lettPre,...letture];
  var dateUniche=[...new Set(letture.map(function(l){return l.data;}))].sort();
  var righe=[], totV={gasolio:0,benzina:0,incasso:0,costo:0,margine:0};
  dateUniche.forEach(function(data){
    var gG=0,gB=0,inc=0,costoG=0;
    pompe.forEach(function(pompa){
      var lettOggi=tutteLetture.find(function(l){return l.pompa_id===pompa.id&&l.data===data;});
      var dp=tutteLetture.filter(function(l){return l.pompa_id===pompa.id&&l.data<data;}).map(function(l){return l.data;}).sort();
      var dPrec=dp.length?dp[dp.length-1]:null;
      var lettIeri=dPrec?tutteLetture.find(function(l){return l.pompa_id===pompa.id&&l.data===dPrec;}):null;
      if(lettOggi&&lettIeri){
        var litri=Number(lettOggi.lettura)-Number(lettIeri.lettura);
        if(litri>0){
          var prezzo=Number(prezziMap[data+'_'+pompa.prodotto]||0);
          var costo=costiMap[data+'_'+pompa.prodotto]||0;
          var litriPD=Number(lettOggi.litri_prezzo_diverso||0);
          var prezzoPD=Number(lettOggi.prezzo_diverso||0);
          var hasCambio=litriPD>0&&prezzoPD>0;
          var litriStd=hasCambio?Math.max(0,litri-litriPD):litri;
          if(pompa.prodotto==='Gasolio Autotrazione') gG+=litri; else gB+=litri;
          inc+=(litriStd*prezzo)+(hasCambio?litriPD*prezzoPD:0);
          costoG+=litri*costo;
        }
      }
    });
    var marg=inc-costoG;
    totV.gasolio+=gG;totV.benzina+=gB;totV.incasso+=inc;totV.costo+=costoG;totV.margine+=marg;
    righe.push({data:data,gasolio:gG,benzina:gB,totale:gG+gB,incasso:inc,costo:costoG,margine:marg});
  });
  return {righe:righe,totali:totV};
}

async function stampaReportVenditeStazione() {
  var anno=document.getElementById('stz-rep-vend-anno').value;
  var mese=document.getElementById('stz-rep-vend-mese').value;
  if(!anno||!mese){toast('Seleziona anno e mese');return;}
  var meseNome=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];
  toast('Generazione report vendite...');
  var r=await _caricaDatiVenditeMese(anno,mese);
  var righe=r.righe,t=r.totali;

  var html='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Report Vendite '+meseNome+' '+anno+'</title>'+
    '<style>body{font-family:Arial,sans-serif;font-size:10px;margin:0;padding:8mm;color:#1a1a18}'+
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:6mm}}'+
    'table{width:100%;border-collapse:collapse}'+
    'th{background:#6B5FCC;color:#fff;padding:5px 4px;font-size:8px;text-transform:uppercase;border:1px solid #5A4FBB;text-align:right}'+
    'th:first-child{text-align:left}'+
    'td{padding:4px 5px;border:1px solid #ddd;font-size:9px;text-align:right;font-family:Courier New,monospace}'+
    'td:first-child{text-align:left;font-family:Arial;font-weight:500}'+
    '.tot{background:#f0f0f0;font-weight:bold}.tot td{border-top:2px solid #6B5FCC}'+
    '.alt{background:#fafaf8}'+
    '</style></head><body>';

  html+='<div style="display:flex;justify-content:space-between;border-bottom:2px solid #6B5FCC;padding-bottom:8px;margin-bottom:10px">';
  html+='<div><div style="font-size:16px;font-weight:bold;color:#6B5FCC">REPORT VENDITE — STAZIONE OPPIDO</div>';
  html+='<div style="font-size:12px;color:#666;margin-top:2px">'+meseNome+' '+anno+'</div></div>';
  html+='<div style="text-align:right"><div style="font-size:13px;font-weight:bold">PHOENIX FUEL SRL</div>';
  html+='<div style="font-size:8px;color:#666">Generato il '+new Date().toLocaleDateString('it-IT')+'</div></div></div>';

  html+='<table><thead><tr><th style="text-align:left;width:50px">Data</th><th>Gasolio (L)</th><th>Benzina (L)</th><th>Totale (L)</th><th>Incasso €</th><th>Costo €</th><th>Margine €</th></tr></thead><tbody>';
  righe.forEach(function(r,i){
    var mc=r.margine>=0?'#639922':'#E24B4A';
    html+='<tr'+(i%2?' class="alt"':'')+'><td>'+r.data.substring(8)+'/'+r.data.substring(5,7)+'</td><td>'+fmtL(r.gasolio)+'</td><td>'+fmtL(r.benzina)+'</td><td style="font-weight:bold">'+fmtL(r.totale)+'</td><td>'+fmtE(r.incasso)+'</td><td>'+(r.costo>0?fmtE(r.costo):'—')+'</td><td style="font-weight:bold;color:'+mc+'">'+(r.costo>0?fmtE(r.margine):'—')+'</td></tr>';
  });
  var tmc=t.margine>=0?'#639922':'#E24B4A';
  html+='<tr class="tot"><td>TOTALE</td><td>'+fmtL(t.gasolio)+'</td><td>'+fmtL(t.benzina)+'</td><td>'+fmtL(t.gasolio+t.benzina)+'</td><td>'+fmtE(t.incasso)+'</td><td>'+(t.costo>0?fmtE(t.costo):'—')+'</td><td style="color:'+tmc+'">'+(t.costo>0?fmtE(t.margine):'—')+'</td></tr>';
  html+='</tbody></table>';

  if(!righe.length) html+='<div style="text-align:center;padding:20px;color:#888">Nessun dato vendite</div>';
  html+='<div style="text-align:center;font-size:8px;color:#aaa;margin-top:10px;border-top:1px solid #ddd;padding-top:5px">PhoenixFuel Srl — Report vendite '+meseNome+' '+anno+'</div>';
  html+='<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  var w=window.open('','_blank');w.document.write(html);w.document.close();
}

async function esportaVenditeExcel() {
  var anno=document.getElementById('stz-rep-vend-anno').value;
  var mese=document.getElementById('stz-rep-vend-mese').value;
  if(!anno||!mese){toast('Seleziona anno e mese');return;}
  var meseNome=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'][Number(mese)-1];
  toast('Generazione Excel vendite...');
  var r=await _caricaDatiVenditeMese(anno,mese);
  if(typeof XLSX==='undefined'){toast('Libreria Excel non caricata');return;}
  var header=['Data','Gasolio (L)','Benzina (L)','Totale (L)','Incasso €','Costo €','Margine €'];
  var rows=[header];
  r.righe.forEach(function(v){rows.push([v.data,v.gasolio,v.benzina,v.totale,Math.round(v.incasso*100)/100,Math.round(v.costo*100)/100,Math.round(v.margine*100)/100]);});
  var t=r.totali;
  rows.push(['TOTALE',t.gasolio,t.benzina,t.gasolio+t.benzina,Math.round(t.incasso*100)/100,Math.round(t.costo*100)/100,Math.round(t.margine*100)/100]);
  var ws=XLSX.utils.aoa_to_sheet(rows);
  ws['!cols']=[{wch:12},{wch:12},{wch:12},{wch:12},{wch:14},{wch:14},{wch:14}];
  var wb=XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb,ws,'Vendite '+meseNome);
  XLSX.writeFile(wb,'ReportVendite_'+meseNome+'_'+anno+'.xlsx');
  toast('Excel vendite generato!');
}

// Backward compatibility - old function
async function generaReportStazione() { stampaReportVenditeStazione(); }

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
      const { data: sedi } = await sb.from('sedi_scarico').select('*').in('cliente_id', clienteIds).eq('attivo', true).order('is_default',{ascending:false}).order('nome');
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
          sedeHtml += '<option value="' + s.id + '" data-nome="' + esc(s.nome + (s.indirizzo ? ' — ' + s.indirizzo : '')) + '"' + (s.is_default ? ' selected' : '') + '>' + esc(s.nome) + (s.citta ? ' (' + s.citta + ')' : '') + '</option>';
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

  // Salva sedi di scarico selezionate sugli ordini (in parallelo)
  const sedeSelects = document.querySelectorAll('.ord-sede-select');
  const sedeUpdates = [];
  for (const sel of sedeSelects) {
    const ordineId = sel.dataset.ordine;
    if (!ordiniSel.includes(ordineId)) continue;
    const sedeId = sel.value;
    const sedeNome = sel.tagName === 'SELECT' ? (sel.selectedOptions[0]?.dataset?.nome || '') : (sel.dataset.nome || '');
    if (sedeId) {
      sedeUpdates.push(sb.from('ordini').update({ sede_scarico_id: sedeId, sede_scarico_nome: sedeNome }).eq('id', ordineId));
    }
  }
  if (sedeUpdates.length) await Promise.all(sedeUpdates);

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
  const postazione = ruolo==='cliente' ? null : document.getElementById('ut-postazione').value;
  if (!nome||!email) { toast('Compila nome ed email'); return; }
  if (!password || password.length < 6) { toast('La password deve avere almeno 6 caratteri'); return; }

  // 1. Crea utente su Supabase Auth
  const { data: authData, error: authError } = await sb.auth.signUp({ email, password });
  if (authError) { toast('Errore creazione accesso: ' + authError.message); return; }

  // 2. Crea record nella tabella utenti
  const { data: nuovoUtente, error } = await sb.from('utenti').insert([{email, nome, ruolo, cliente_id:ruolo==='cliente'?clienteId:null, postazione:postazione||'ufficio', attivo:true}]).select().single();
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
  document.getElementById('grp-ut-postazione').style.display = ruolo==='cliente' ? 'none' : '';
  if (ruolo==='cliente') caricaSelectClienti('ut-cliente');
}

async function cambiaPostazione(utenteId, postazione) {
  const { error } = await sb.from('utenti').update({ postazione }).eq('id', utenteId);
  if (error) { toast('Errore: ' + error.message); return; }
  const postLabels = { 'ufficio':'Ufficio', 'stazione_oppido':'Stazione Oppido', 'deposito_vibo':'Deposito Vibo', 'logistica':'Logistica' };
  toast('Postazione aggiornata: ' + (postLabels[postazione]||postazione));
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
  if (!data||!data.length){tbody.innerHTML='<tr><td colspan="8" class="loading">Nessun utente</td></tr>';return;}
  const postLabels = { 'ufficio':'🏢 Ufficio', 'stazione_oppido':'⛽ Stazione', 'deposito_vibo':'🏭 Deposito', 'logistica':'🚛 Logistica' };
  const postOptions = Object.entries(postLabels).map(([v,l])=>'<option value="'+v+'">'+l+'</option>').join('');
  tbody.innerHTML=data.map(r => {
    const post = r.postazione || 'ufficio';
    const postSelect = r.ruolo==='cliente' ? '<span style="font-size:11px;color:var(--text-muted)">—</span>' : '<select onchange="cambiaPostazione(\''+r.id+'\',this.value)" style="font-size:11px;padding:3px 6px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text)">' + postOptions.replace('value="'+post+'"','value="'+post+'" selected') + '</select>';
    return '<tr><td><strong>' + esc(r.nome) + '</strong></td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.email) + '</td><td>' + badgeRuolo(r.ruolo) + '</td><td>' + postSelect + '</td><td style="font-size:11px;color:var(--text-muted)">' + esc(r.clienti?.nome||'—') + '</td><td>' + (r.attivo?'<span class="badge green">Attivo</span>':'<span class="badge red">Disattivo</span>') + '</td><td>' + (r.ruolo!=='admin'&&r.ruolo!=='cliente'?'<button class="btn-primary" style="font-size:11px;padding:4px 10px" onclick="apriModalePermessi(\'' + r.id + '\',\'' + esc(r.nome).replace(/'/g,"\\'") + '\')">Permessi</button>':'—') + '</td><td><button class="btn-danger" onclick="eliminaRecord(\'utenti\',\'' + r.id + '\',caricaUtentiCompleto)">x</button></td></tr>';
  }).join('');
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
    const [lettOggiRes, lettIeriRes, prezziOggiRes, lettMeseRes, pompeRes, prezziMeseRes] = await Promise.all([
      sb.from('stazione_letture').select('pompa_id,lettura').eq('data', oggiISO),
      sb.from('stazione_letture').select('pompa_id,lettura').eq('data', ieriISO),
      sb.from('stazione_prezzi').select('prodotto,prezzo_litro').eq('data', oggiISO),
      sb.from('stazione_letture').select('data,pompa_id,lettura').gte('data', oggiISO.substring(0,8)+'01').lte('data', oggiISO).order('data'),
      sb.from('stazione_pompe').select('id,prodotto').eq('attiva',true),
      sb.from('stazione_prezzi').select('data,prodotto,prezzo_litro').gte('data', oggiISO.substring(0,8)+'01').lte('data', oggiISO)
    ]);
    const pompe = pompeRes.data;
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
    const prezziMeseMap = {};
    (prezziMeseRes.data||[]).forEach(p => { prezziMeseMap[p.data+'_'+p.prodotto] = Number(p.prezzo_litro); });

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

// ── POSTAZIONE — SWITCH RAPIDO ──────────────────────────────────
function togglePostazione() {
  var dd = document.getElementById('postazione-dropdown');
  if (dd) dd.style.display = dd.style.display === 'none' ? 'block' : 'none';
}

async function switchPostazione(nuova) {
  document.getElementById('postazione-dropdown').style.display = 'none';
  if (!utenteCorrente) return;
  if (utenteCorrente.postazione === nuova) return;

  // Aggiorna in DB
  await sb.from('utenti').update({ postazione: nuova }).eq('id', utenteCorrente.id);
  utenteCorrente.postazione = nuova;

  // Aggiorna label
  var postLabels = { 'ufficio':'🏢 Ufficio', 'stazione_oppido':'⛽ Stazione Oppido', 'deposito_vibo':'🏭 Deposito Vibo', 'logistica':'🚛 Logistica' };
  document.getElementById('utente-postazione').textContent = postLabels[nuova] || '';

  // Naviga alla sezione relativa
  var sezionePost = { 'stazione_oppido':'stazione', 'deposito_vibo':'deposito', 'logistica':'logistica' };
  var sez = sezionePost[nuova] || 'dashboard';
  var navItem = document.querySelector('.nav-item[onclick*="' + sez + '"]') || document.querySelector('.nav-item');
  setSection(sez, navItem);
  toast('Postazione: ' + (postLabels[nuova] || nuova));
}

// Chiudi dropdown cliccando fuori
document.addEventListener('click', function(e) {
  var dd = document.getElementById('postazione-dropdown');
  var post = document.getElementById('utente-postazione');
  if (dd && dd.style.display !== 'none' && !dd.contains(e.target) && e.target !== post) {
    dd.style.display = 'none';
  }
});

// ── PWA OFFLINE ─────────────────────────────────────────────────
var _isOnline = navigator.onLine;
var _offlineQueue = [];
var _DB_NAME = 'PhoenixFuelOffline';
var _DB_VERSION = 1;

// IndexedDB per coda operazioni offline
function _openOfflineDB() {
  return new Promise(function(resolve, reject) {
    var req = indexedDB.open(_DB_NAME, _DB_VERSION);
    req.onupgradeneeded = function(e) {
      var db = e.target.result;
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
    };
    req.onsuccess = function(e) { resolve(e.target.result); };
    req.onerror = function() { reject(req.error); };
  });
}

async function _addToOfflineQueue(operation) {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('queue', 'readwrite');
    tx.objectStore('queue').add({
      timestamp: Date.now(),
      table: operation.table,
      action: operation.action, // 'insert','update','upsert','delete'
      data: operation.data,
      match: operation.match || null
    });
    return new Promise(function(resolve) { tx.oncomplete = resolve; });
  } catch(e) { console.warn('Offline queue error:', e); }
}

async function _syncOfflineQueue() {
  try {
    var db = await _openOfflineDB();
    var tx = db.transaction('queue', 'readonly');
    var store = tx.objectStore('queue');
    var all = await new Promise(function(resolve) {
      var req = store.getAll();
      req.onsuccess = function() { resolve(req.result); };
    });

    if (!all || !all.length) return;
    toast('Sincronizzazione ' + all.length + ' operazioni offline...');

    var synced = 0;
    for (var i = 0; i < all.length; i++) {
      var op = all[i];
      try {
        if (op.action === 'insert') {
          await sb.from(op.table).insert(op.data);
        } else if (op.action === 'update' && op.match) {
          var q = sb.from(op.table).update(op.data);
          Object.entries(op.match).forEach(function(entry) { q = q.eq(entry[0], entry[1]); });
          await q;
        } else if (op.action === 'upsert') {
          await sb.from(op.table).upsert(op.data, { onConflict: op.match || '' });
        } else if (op.action === 'delete' && op.match) {
          var dq = sb.from(op.table).delete();
          Object.entries(op.match).forEach(function(entry) { dq = dq.eq(entry[0], entry[1]); });
          await dq;
        }
        synced++;
        // Rimuovi dalla coda
        var delTx = db.transaction('queue', 'readwrite');
        delTx.objectStore('queue').delete(op.id);
      } catch(e) { console.warn('Sync failed for op', op.id, e); }
    }

    if (synced > 0) toast('✅ ' + synced + ' operazioni sincronizzate!');
  } catch(e) { console.warn('Sync error:', e); }
}

// Online/Offline detection
function _updateOnlineStatus() {
  var wasOffline = !_isOnline;
  _isOnline = navigator.onLine;
  var banner = document.getElementById('offline-banner');
  if (banner) banner.style.display = _isOnline ? 'none' : 'block';

  // Torna online: sincronizza coda
  if (_isOnline && wasOffline) {
    _syncOfflineQueue();
  }
}

window.addEventListener('online', _updateOnlineStatus);
window.addEventListener('offline', _updateOnlineStatus);
// Check iniziale
setTimeout(_updateOnlineStatus, 1000);

// ── AVVIO ─────────────────────────────────────────────────────────
inizializza();

// ── PWA SERVICE WORKER ───────────────────────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('/sw.js').catch(() => {});
}
