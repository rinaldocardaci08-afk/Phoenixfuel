// PhoenixFuel — Config & Utilities
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
  // Carica permessi sottosezioni
  if (utente.ruolo !== 'admin' && utente.ruolo !== 'cliente') {
    await _caricaPermessiUtente(utente.id);
  }
  await costruisciMenu(utente.ruolo, utente.id);
  if (utente.ruolo === 'cliente') { setSection('cliente', document.querySelector('.nav-item')); }
  else {
    await Promise.all([caricaCacheProdotti(), caricaSelectClienti('ord-cliente')]);
    initForms(); aggiornaSelezioniOrdine();
    // Sezione iniziale: admin→dashboard, operatori→home (bacheca)
    var sezioneIniziale;
    if (utente.ruolo === 'admin') {
      sezioneIniziale = 'dashboard';
    } else {
      sezioneIniziale = 'home';
    }
    var navItem = document.querySelector('.nav-item[onclick*="' + sezioneIniziale + '"]') || document.querySelector('.nav-item');
    setSection(sezioneIniziale, navItem);
    // Home: benvenuto + bottone nuovo post (solo admin)
    var elBenvenuto = document.getElementById('home-benvenuto');
    if (elBenvenuto) elBenvenuto.textContent = 'Benvenuto ' + utente.nome + ' — ' + new Date().toLocaleDateString('it-IT', { weekday:'long', day:'numeric', month:'long', year:'numeric' });
    if (utente.ruolo === 'admin') {
      var elBtn = document.getElementById('home-btn-nuovo');
      if (elBtn) elBtn.style.display = '';
    }
    // Controlla avvisi non letti (badge pulsante)
    aggiornaBadgeBacheca();
    setInterval(aggiornaBadgeBacheca, 60000);
    // Heartbeat presenza online
    _heartbeat();
    setInterval(_heartbeat, 60000);
    // Scarica dati in cache per uso offline
    _aggiornaDataCacheOffline();
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
  if (document.getElementById('danea-da')) document.getElementById('danea-da').value = oggiISO;
  if (document.getElementById('danea-a')) document.getElementById('danea-a').value = oggiISO;
  if (document.getElementById('pc-data')) document.getElementById('pc-data').value = oggiISO;
  // Label giorno su date operative (NON sul filtro listino prezzi:
  // quello usa _renderLabelPrezzi + div dedicato #prezzi-label-giorno che si
  // aggiorna ad ogni caricaPrezzi() tramite frecce, datepicker, apertura tab)
  _labelGiorno('ord-data');
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
    voci.push({ id:'home', icon:'🏠', label:'Bacheca' });
    ['dashboard','ordini','prezzi','deposito','consegne','vendite'].forEach(id => {
      const map = { dashboard:{icon:'▦',label:'Dashboard'}, ordini:{icon:'📋',label:'Ordini'}, prezzi:{icon:'💰',label:'Prezzi giornalieri'}, deposito:{icon:'🏗',label:'Deposito'}, consegne:{icon:'🚚',label:'Consegne'}, vendite:{icon:'📊',label:'Vendite'} };
      voci.push({ id, ...map[id] });
    });
    voci.push({ section:'Analisi' });
    voci.push({ id:'benchmark', icon:'📈', label:'Benchmark mercato' });
    voci.push({ section:'Finanze' });
    voci.push({ id:'finanze', icon:'🏦', label:'Finanze' });
    voci.push({ id:'fatture', icon:'🧾', label:'Fatture' });
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
    voci.push({ id:'bacheca', icon:'🔔', label:'Bacheca avvisi', badge:true });
    voci.push({ id:'utenti', icon:'🔑', label:'Utenti' });
  } else {
    const { data: permessi } = await sb.from('permessi').select('*').eq('utente_id', utenteId).eq('abilitato', true);
    const abilitati = new Set((permessi||[]).map(p => p.sezione));
    const tutteSezioni = [
      { id:'home', icon:'🏠', label:'Bacheca', section:'Operativo' },
      { id:'dashboard', icon:'▦', label:'Dashboard' },
      { id:'ordini', icon:'📋', label:'Ordini' },
      { id:'prezzi', icon:'💰', label:'Prezzi giornalieri' },
      { id:'deposito', icon:'🏗', label:'Deposito' },
      { id:'consegne', icon:'🚚', label:'Consegne' },
      { id:'vendite', icon:'📊', label:'Vendite' },
      { id:'benchmark', icon:'📈', label:'Benchmark mercato', section:'Analisi' },
      { id:'finanze', icon:'🏦', label:'Finanze', section:'Finanze' },
      { id:'fatture', icon:'🧾', label:'Fatture' },
      { id:'clienti', icon:'👤', label:'Clienti', section:'Anagrafica' },
      { id:'fornitori', icon:'🏭', label:'Fornitori' },
      { id:'basi', icon:'📍', label:'Basi di carico' },
      { id:'prodotti', icon:'📦', label:'Prodotti' },
      { id:'logistica', icon:'🚛', label:'Logistica', section:'Logistica' },
      { id:'stazione', icon:'⛽', label:'Stazione Oppido', section:'Stazione' },
      { id:'autoconsumo', icon:'🛢', label:'Autoconsumo', section:'Autoconsumo' },
      { id:'bacheca', icon:'🔔', label:'Bacheca avvisi', section:'Comunicazioni' },
    ];
    let lastSection = null;
    // Home: visibile se ha il permesso (o se nessun permesso è configurato)
    if (abilitati.has('home')) {
      voci.push({ section: 'Operativo' }); lastSection = 'Operativo';
      voci.push({ id: 'home', icon: '🏠', label: 'Bacheca' });
    }
    tutteSezioni.forEach(s => {
      if (s.id === 'home') return; // già aggiunto
      if (abilitati.has(s.id)) {
        if (s.section && s.section !== lastSection) { voci.push({ section: s.section }); lastSection = s.section; }
        voci.push({ id: s.id, icon: s.icon, label: s.label });
      }
    });
    if (!voci.length) voci.push({ id:'dashboard', icon:'▦', label:'Dashboard' });
  }
  nav.innerHTML = voci.map(v => {
    if (v.section) return '<div class="nav-section-label">' + v.section + '</div>';
    var badgeHtml = v.badge ? '<span id="bacheca-badge" class="nav-badge" style="display:none"></span>' : '';
    return '<div class="nav-item" onclick="setSection(\'' + v.id + '\',this)"><span class="nav-icon">' + v.icon + '</span> ' + v.label + badgeHtml + '</div>';
  }).join('');
  const prima = nav.querySelector('.nav-item');
  if (prima) prima.classList.add('active');
}

async function logout() { await sb.auth.signOut(); window.location.href = 'login.html'; }

// ── NAVIGAZIONE ───────────────────────────────────────────────────
const TITLES = { home:'Bacheca', dashboard:'Dashboard', ordini:'Ordini', prezzi:'Prezzi giornalieri', deposito:'Deposito', consegne:'Consegne', vendite:'Vendite', clienti:'Clienti', fornitori:'Fornitori', basi:'Basi di carico', prodotti:'Prodotti', stazione:'Stazione Oppido', autoconsumo:'Autoconsumo', utenti:'Utenti', cliente:'I miei prezzi', logistica:'Logistica', bacheca:'Bacheca avvisi', benchmark:'Benchmark mercato', finanze:'Finanze', fatture:'Fatture' };
function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('page-title').textContent = TITLES[id] || id;
  const loaders = { home:caricaHome, dashboard:caricaDashboard, prezzi:caricaPrezzi, ordini:caricaOrdini, deposito:caricaDeposito, consegne:caricaConsegne, vendite:caricaVendite, clienti:caricaClienti, fornitori:caricaFornitori, basi:caricaBasi, prodotti:caricaProdotti, stazione:caricaStazione, autoconsumo:caricaAutoconsumo, utenti:caricaUtentiCompleto, cliente:caricaAreaCliente, logistica:caricaLogistica, bacheca:caricaBacheca, benchmark:caricaBenchmark, finanze:caricaFinanze, fatture:initFatture };
  if (loaders[id]) loaders[id]();
  // Chiudi sidebar su mobile
  if (window.innerWidth <= 768) {
    document.querySelector('.sidebar').classList.remove('open');
    document.querySelector('.sidebar-overlay').classList.remove('show');
  }
}

// ── PERMESSI SOTTOSEZIONI ────────────────────────────────────────
// Nasconde i tab per cui l'utente non ha permesso
function _applicaPermessiTab(sezione, tabSelector, mapTabPermesso) {
  if (!utenteCorrente || utenteCorrente.ruolo === 'admin') return;
  var tabs = document.querySelectorAll(tabSelector);
  var primoVisibile = null;
  tabs.forEach(function(btn) {
    var tabId = btn.dataset.tab;
    var permKey = mapTabPermesso[tabId];
    if (permKey && !_haPermessoSub(permKey)) {
      btn.style.display = 'none';
      // Nascondi anche il pannello
      var panel = document.getElementById(tabId);
      if (panel) panel.style.display = 'none';
    } else {
      if (!primoVisibile) primoVisibile = btn;
    }
  });
  // Attiva il primo tab visibile se l'attivo è nascosto
  var activeTab = document.querySelector(tabSelector + '.active');
  if (activeTab && activeTab.style.display === 'none' && primoVisibile) {
    primoVisibile.click();
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
  return '€ ' + _sep(v.toLocaleString('it-IT', { minimumFractionDigits: 6, maximumFractionDigits: 6 }));
}
function fmtE(n) {
  const v = Number(n);
  const dec = v % 1 === 0 ? 0 : 2;
  return '€ ' + _sep(v.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: 2 }));
}
function fmtD(d){if(!d)return '-';var p=d.split('-');return p.length===3?p[2]+'/'+p[1]+'/'+p[0]:d;}
function fmtL(n) {
  const v = Number(n);
  return _sep(v.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })) + ' L';
}
// ── Helper margine colorato (verde se > 0, rosso se < 0, grigio se = 0) ──
// fmtM(v)  → margine €/L, 4 decimali, grassetto, colorato. Restituisce HTML.
// fmtMe(v) → margine in euro (totali), 2 decimali, grassetto, colorato. Restituisce HTML.
// Usare SOLO per valori che rappresentano margine/marginalità/guadagno. Per costi o
// prezzi generici continuare a usare fmt() e fmtE().
function fmtM(n) {
  const v = Number(n) || 0;
  const txt = '€ ' + _sep(v.toLocaleString('it-IT', { minimumFractionDigits: 4, maximumFractionDigits: 4 }));
  const col = v > 0.00005 ? '#27500A' : (v < -0.00005 ? '#A32D2D' : 'var(--text-muted)');
  return '<strong style="color:' + col + '">' + txt + '</strong>';
}
function fmtMe(n) {
  const v = Number(n) || 0;
  const dec = v % 1 === 0 ? 0 : 2;
  const txt = '€ ' + _sep(v.toLocaleString('it-IT', { minimumFractionDigits: dec, maximumFractionDigits: 2 }));
  const col = v > 0.005 ? '#27500A' : (v < -0.005 ? '#A32D2D' : 'var(--text-muted)');
  return '<strong style="color:' + col + '">' + txt + '</strong>';
}
function badgeStato(stato, record) {
  // Se passato l'intero record, rileva stati "virtuali" di visualizzazione:
  // - ordini stazione_servizio già ricevuti ma senza DAS → label "ricevuto"
  if (record && typeof record === 'object') {
    if (record.tipo_ordine === 'stazione_servizio'
        && record.ricevuto_stazione === true
        && (stato === 'confermato' || stato === 'in_consegna')) {
      return '<span class="badge teal" title="Ricevuto dalla stazione. Diventerà consegnato al caricamento del DAS firmato">ricevuto</span>';
    }
  }
  const map = { 'confermato':'green','consegnato':'teal','in attesa':'amber','annullato':'red','programmato':'blue','cliente':'blue','deposito':'teal','entrata_deposito':'teal','stazione_servizio':'purple','autoconsumo':'gray' };
  const labels = { 'entrata_deposito':'deposito','stazione_servizio':'stazione','autoconsumo':'autoconsumo' };
  return '<span class="badge ' + (map[esc(stato)]||'amber') + '">' + esc(labels[stato]||stato) + '</span>';
}

function _renderLabelPrezzi() {
  var inp = document.getElementById('filtro-data-prezzi');
  var div = document.getElementById('prezzi-label-giorno');
  if (!inp || !div || !inp.value) { if(div) div.innerHTML = ''; return; }
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var sel = new Date(inp.value + 'T12:00:00'); sel.setHours(0,0,0,0);
  var diff = Math.round((sel - oggi) / 86400000);
  var GIORNI_L = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  var giorno = GIORNI_L[sel.getDay()];
  // Stili badge più grandi e leggibili (font 18px, padding 8/18)
  var baseBadge = 'display:inline-block;padding:8px 18px;border-radius:10px;font-size:18px;line-height:1.2;vertical-align:middle';
  var html = '';
  if (diff === 0) html += '<span style="' + baseBadge + ';background:#378ADD;color:#fff;font-weight:700;margin-right:10px">OGGI</span>';
  else if (diff === -1) html += '<span style="' + baseBadge + ';background:#BA7517;color:#fff;font-weight:700;margin-right:10px">IERI</span>';
  else if (diff === 1) html += '<span style="' + baseBadge + ';background:#639922;color:#fff;font-weight:700;margin-right:10px">DOMANI</span>';
  var dayColors = { 0:['#FCEBEB','#791F1F'], 1:['#E6F1FB','#0C447C'], 2:['#E6F1FB','#0C447C'], 3:['#E6F1FB','#0C447C'], 4:['#E6F1FB','#0C447C'], 5:['#E6F1FB','#0C447C'], 6:['#EEEDFE','#3C3489'] };
  var dc = dayColors[sel.getDay()];
  html += '<span style="' + baseBadge + ';background:' + dc[0] + ';color:' + dc[1] + ';font-weight:600">' + giorno + '</span>';
  div.innerHTML = html;
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

// Helper: apri finestra report PRIMA di qualsiasi await (evita blocco popup mobile)
function _apriReport(titolo) {
  var w = window.open('', '_blank');
  if (!w) { toast('Popup bloccato: abilita i popup per questo sito'); return null; }
  w.document.write('<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + (titolo||'Report') + '</title></head><body style="font-family:sans-serif;padding:40px;text-align:center;color:#666"><p style="font-size:16px">⏳ Caricamento report...</p></body></html>');
  return w;
}

// ── VALIDAZIONE ──────────────────────────────────────────────────
function validaNumero(val, min, max, nome) {
  const n = parseFloat(val);
  if (isNaN(n)) { toast(nome + ': inserisci un numero valido'); return null; }
  if (min !== undefined && n < min) { toast(nome + ': il valore minimo è ' + min); return null; }
  if (max !== undefined && n > max) { toast(nome + ': il valore massimo è ' + max); return null; }
  return n;
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

// ── LABEL GIORNO (OGGI/DOMANI/IERI + giorno settimana) ──────────
function _labelGiorno(inputId) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  var spanId = inputId + '-lbl';
  var dayId = inputId + '-day';
  var el = document.getElementById(spanId);
  var elDay = document.getElementById(dayId);
  if (!el) {
    el = document.createElement('span');
    el.id = spanId;
    el.style.cssText = 'font-size:13px;font-weight:700;padding:4px 12px;border-radius:8px;margin-left:6px;display:none;vertical-align:middle';
    inp.parentNode.insertBefore(el, inp.nextSibling);
  }
  if (!elDay) {
    elDay = document.createElement('span');
    elDay.id = dayId;
    elDay.style.cssText = 'font-size:13px;font-weight:600;padding:4px 12px;border-radius:8px;margin-left:4px;display:none;vertical-align:middle';
    el.parentNode.insertBefore(elDay, el.nextSibling);
  }
  var val = inp.value;
  if (!val) { el.style.display = 'none'; elDay.style.display = 'none'; return; }
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var sel = new Date(val + 'T12:00:00'); sel.setHours(0,0,0,0);
  var diff = Math.round((sel - oggi) / 86400000);
  var GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  var giorno = GIORNI[sel.getDay()];
  // Badge OGGI/IERI/DOMANI
  if (diff === 0) { el.textContent = 'OGGI'; el.style.background = '#378ADD'; el.style.color = '#fff'; el.style.display = 'inline-block'; }
  else if (diff === 1) { el.textContent = 'DOMANI'; el.style.background = '#639922'; el.style.color = '#fff'; el.style.display = 'inline-block'; }
  else if (diff === -1) { el.textContent = 'IERI'; el.style.background = '#BA7517'; el.style.color = '#fff'; el.style.display = 'inline-block'; }
  else { el.style.display = 'none'; }
  // Badge giorno settimana (sempre visibile)
  var dayColors = { 0:['#FCEBEB','#791F1F'], 1:['#E6F1FB','#0C447C'], 2:['#E6F1FB','#0C447C'], 3:['#E6F1FB','#0C447C'], 4:['#E6F1FB','#0C447C'], 5:['#E6F1FB','#0C447C'], 6:['#EEEDFE','#3C3489'] };
  var dc = dayColors[sel.getDay()];
  elDay.textContent = giorno;
  elDay.style.background = dc[0];
  elDay.style.color = dc[1];
  elDay.style.display = 'inline-block';
}

// ── BOTTONI SALVA: stato "già salvato" ─────────────────────────
function _markSaved(btnId) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.dataset.saved = 'true';
  btn._origBg = btn._origBg || btn.style.background;
  btn._origText = btn._origText || btn.textContent;
  btn.style.background = '#B4B2A9';
  btn.textContent = '✅ Salvato';
  setTimeout(function(){ btn.textContent = btn._origText; }, 2000);
}

function _checkSaved(btnId) {
  var btn = document.getElementById(btnId);
  if (!btn || btn.dataset.saved !== 'true') return true;
  return confirm('Dati già registrati per questa data. Vuoi sovrascrivere?');
}

function _resetSaved(btnId) {
  var btn = document.getElementById(btnId);
  if (!btn) return;
  btn.dataset.saved = '';
  if (btn._origBg) btn.style.background = btn._origBg;
}

function _autoIvaProdotto() {
  var sel = document.getElementById('pr-prodotto');
  var ivaSelect = document.getElementById('pr-iva');
  if (!sel || !ivaSelect || !sel.value) return;
  var prod = cacheProdotti.find(function(p) { return p.nome === sel.value; });
  if (prod && prod.iva_default) {
    ivaSelect.value = String(prod.iva_default);
    aggiornaPrev();
  }
}

// ══════════════════════════════════════════════════════════════════
// PRESENZA ONLINE
// ══════════════════════════════════════════════════════════════════

async function _heartbeat() {
  if (!utenteCorrente || !utenteCorrente.id) return;
  await sb.from('utenti').update({ last_seen: new Date().toISOString() }).eq('id', utenteCorrente.id);
  var wrap = document.getElementById('utenti-online-wrap');
  if (wrap && wrap.style.display !== 'none') caricaUtentiOnline();
}

async function caricaUtentiOnline() {
  var wrap = document.getElementById('utenti-online');
  if (!wrap) return;
  var treMinFa = new Date(Date.now() - 3 * 60000).toISOString();
  var { data: online } = await sb.from('utenti').select('nome,ruolo,last_seen').gte('last_seen', treMinFa).order('nome');
  var { data: tutti } = await sb.from('utenti').select('nome,ruolo,last_seen').order('nome');
  if (!tutti || !tutti.length) { wrap.innerHTML = ''; return; }
  var onlineIds = (online || []).map(function(u) { return u.nome; });
  var html = '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">';
  tutti.forEach(function(u) {
    var isOn = onlineIds.indexOf(u.nome) >= 0;
    var colore = isOn ? '#639922' : '#B4B2A9';
    var ruoloMap = { 'admin':'👑', 'operatore':'👷', 'contabilita':'📊', 'logistica':'🚛' };
    var ico = ruoloMap[u.ruolo] || '👤';
    html += '<div style="display:flex;align-items:center;gap:5px;padding:4px 12px;border-radius:20px;background:' + (isOn ? '#EAF3DE' : '#F1EFE8') + ';border:1px solid ' + (isOn ? '#639922' : '#D3D1C7') + ';font-size:12px">';
    html += '<div style="width:8px;height:8px;border-radius:50%;background:' + colore + '"></div>';
    html += '<span>' + ico + ' ' + u.nome + '</span>';
    html += '</div>';
  });
  html += '</div>';
  wrap.innerHTML = html;
}

// ══════════════════════════════════════════════════════════════════
// applicaUscitaCisterne — scala litri dalle cisterne fisiche
// ══════════════════════════════════════════════════════════════════
// Chiamata DOPO ogni uscita registrata (vendita cliente, lettura pompa,
// autoconsumo, smistamento). Scala i litri dalle cisterne secondo la
// regola per sede/prodotto.
//
// REGOLA COSTITUZIONALE (19/04/2026): i litri comandano tutto. Le
// cisterne devono riflettere la somma calcolata da pfData. Questa
// funzione mantiene l'allineamento tra ogni uscita registrata e lo
// stato fisico dichiarato delle cisterne.
//
// Parametri:
//   sede       : 'deposito_vibo' | 'stazione_oppido'
//   prodotto   : nome prodotto
//   litriUscita: litri da sottrarre (numero positivo)
//   pompaId    : opzionale - per Benzina stazione, scala dalla cisterna
//                collegata alla pompa (tabella pompe_cisterne)
//
// Regole scarico:
//   - Benzina stazione con pompaId -> cisterna specifica collegata
//     (erogatore dedicato, cisterne indipendenti)
//   - Gasolio stazione -> grande prima (capacita_max maggiore), poi piccola
//   - Deposito -> sequenziale per nome (1, 2, 3)
//
// Clip a 0, no negativi. Se non riesce ad assorbire tutto, logga
// warning: pfData resta la verita', la cisterna si "ferma a 0" e
// la sentinella segnalera' il buco.
// ══════════════════════════════════════════════════════════════════
async function applicaUscitaCisterne(sede, prodotto, litriUscita, pompaId) {
  if (!sede || !prodotto) return;
  litriUscita = Number(litriUscita || 0);
  if (litriUscita <= 0) return;

  try {
    // 1. Caso speciale: Benzina stazione con pompa specifica
    if (sede === 'stazione_oppido' && /benzina/i.test(prodotto) && pompaId) {
      var linkRes = await sb.from('pompe_cisterne')
        .select('cisterna_id').eq('pompa_id', pompaId).maybeSingle();
      if (linkRes.data && linkRes.data.cisterna_id) {
        var cisRes = await sb.from('cisterne')
          .select('id,nome,livello_attuale').eq('id', linkRes.data.cisterna_id).single();
        if (cisRes.data) {
          var nuovo = Math.max(0, Number(cisRes.data.livello_attuale || 0) - litriUscita);
          var updErr = await sb.from('cisterne').update({
            livello_attuale: Math.round(nuovo),
            updated_at: new Date().toISOString()
          }).eq('id', cisRes.data.id);
          if (updErr && updErr.error) console.error('[applicaUscitaCisterne] update benzina:', updErr.error);
          return;
        }
      }
      console.warn('[applicaUscitaCisterne] Benzina staz senza mapping pompa, fallback sequenziale');
    }

    // 2. Tutti gli altri casi: sequenziale
    // Stazione: capacita_max DESC (grande prima)
    // Deposito: nome ASC (Gasolio Autotrazione 1, 2, 3)
    var isStazione = sede === 'stazione_oppido';
    var orderField = isStazione ? 'capacita_max' : 'nome';
    var orderAsc = isStazione ? false : true;

    var cisRes = await sb.from('cisterne').select('id,nome,livello_attuale')
      .eq('sede', sede).eq('prodotto', prodotto)
      .order(orderField, { ascending: orderAsc });

    if (!cisRes.data || !cisRes.data.length) {
      console.warn('[applicaUscitaCisterne] nessuna cisterna per', sede, prodotto);
      return;
    }

    var daScalare = litriUscita;
    var modifiche = [];
    for (var i = 0; i < cisRes.data.length && daScalare > 0; i++) {
      var c = cisRes.data[i];
      var attuale = Number(c.livello_attuale || 0);
      if (attuale <= 0) continue;
      var sottratto = Math.min(attuale, daScalare);
      var nuovoLiv = Math.round(attuale - sottratto);
      var res = await sb.from('cisterne').update({
        livello_attuale: nuovoLiv,
        updated_at: new Date().toISOString()
      }).eq('id', c.id);
      if (res && res.error) {
        console.error('[applicaUscitaCisterne] update ' + c.nome + ':', res.error);
        continue;
      }
      modifiche.push(c.nome + ': ' + Math.round(attuale) + '->' + nuovoLiv);
      daScalare -= sottratto;
    }

    console.log('[applicaUscitaCisterne] ' + sede + '/' + prodotto + ' -' + litriUscita + ' L: ' + modifiche.join(', ') + (daScalare > 0 ? ' [RESIDUO ' + daScalare + ' L non assorbibile]' : ''));
  } catch(e) {
    console.error('[applicaUscitaCisterne] eccezione:', e);
  }
}

// ── _aggiornaStatoConsegnato ──────────────────────────────────────
// Chiamata dopo upload DAS firmato: porta l'ordine a stato 'consegnato'.
// Logica: UPDATE atomico — se l'ordine ha das_firmato_url valorizzato e
// stato in ['confermato','in_consegna'], lo porta a 'consegnato'.
// Non esclude ordini non-cliente: anche entrate deposito/stazione_servizio
// con DAS firmato sono "consegnate" a tutti gli effetti.
//
// AGGANCIO CISTERNE (19/04/2026):
// Per ordini 'stazione_servizio' (fornitore Phoenix) e 'autoconsumo', al
// momento del DAS firmato il deposito si scarica FISICAMENTE (i litri sono
// usciti col camion). L'ordine resta "in transito" finche' non viene ricevuto
// alla stazione/autoconsumo. Anti-doppio-scarico: controllo in movimenti_cisterne
// se esiste gia' un movimento 'uscita' per questo ordine, nel caso salto.
async function _aggiornaStatoConsegnato(ordineId) {
  if (!ordineId) return;
  try {
    var { data, error } = await sb.from('ordini')
      .update({ stato: 'consegnato' })
      .eq('id', ordineId)
      .in('stato', ['confermato', 'in_consegna'])
      .not('das_firmato_url', 'is', null)
      .neq('das_firmato_url', '')
      .select('id,stato,tipo_ordine,prodotto,litri,fornitore');
    if (error) {
      console.error('_aggiornaStatoConsegnato update fallito:', error);
      if (typeof toast === 'function') toast('Stato ordine non aggiornato: ' + error.message);
      return;
    }
    if (data && data.length) {
      console.log('Ordine ' + ordineId + ' → consegnato (confermato via UPDATE)');
      // Aggancio scarico deposito per stazione_servizio e autoconsumo (se non gia' scaricato)
      var ord = data[0];
      var deveScaricare = false;
      if (ord.tipo_ordine === 'autoconsumo') {
        deveScaricare = true;
      } else if (ord.tipo_ordine === 'stazione_servizio') {
        var forn = (ord.fornitore || '').toLowerCase();
        // Solo se il fornitore e' Phoenix (= smistamento interno dal deposito)
        // Se il fornitore e' Eni/Ludoil/ecc., i litri arrivano direttamente alla stazione
        // e non passano dal deposito, quindi non scarico nulla.
        if (forn.indexOf('phoenix') >= 0) deveScaricare = true;
      }
      if (deveScaricare && typeof applicaUscitaCisterne === 'function') {
        try {
          // Anti-doppio-scarico: se esiste gia' un movimento 'uscita' per questo ordine, salto
          var movRes = await sb.from('movimenti_cisterne').select('id')
            .eq('ordine_id', ordineId).eq('tipo', 'uscita').limit(1);
          if (movRes.data && movRes.data.length) {
            console.log('[_aggiornaStatoConsegnato] ordine ' + ordineId + ' gia scaricato dal deposito, skip');
          } else {
            await applicaUscitaCisterne('deposito_vibo', ord.prodotto, Number(ord.litri || 0));
            // Traccia il movimento per anti-doppio-scarico futuro
            await sb.from('movimenti_cisterne').insert([{
              ordine_id: ordineId,
              tipo: 'uscita',
              litri: Number(ord.litri || 0),
              data: new Date().toISOString().split('T')[0],
              note: 'Scarico automatico al DAS firmato (' + ord.tipo_ordine + ')'
            }]);
          }
        } catch(eScarico) {
          console.error('[_aggiornaStatoConsegnato] errore scarico deposito:', eScarico);
        }
      }
    }
  } catch(e) {
    console.warn('_aggiornaStatoConsegnato eccezione:', e);
  }
}
