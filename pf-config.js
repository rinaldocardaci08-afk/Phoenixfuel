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
  // Label giorno su date operative
  _labelGiorno('ord-data');
  _labelGiorno('filtro-data-prezzi');
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
const TITLES = { home:'Bacheca', dashboard:'Dashboard', ordini:'Ordini', prezzi:'Prezzi giornalieri', deposito:'Deposito', consegne:'Consegne', vendite:'Vendite', clienti:'Clienti', fornitori:'Fornitori', basi:'Basi di carico', prodotti:'Prodotti', stazione:'Stazione Oppido', autoconsumo:'Autoconsumo', utenti:'Utenti', cliente:'I miei prezzi', logistica:'Logistica', bacheca:'Bacheca avvisi', benchmark:'Benchmark mercato', finanze:'Finanze' };
function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('page-title').textContent = TITLES[id] || id;
  const loaders = { home:caricaHome, dashboard:caricaDashboard, prezzi:caricaPrezzi, ordini:caricaOrdini, deposito:caricaDeposito, consegne:caricaConsegne, vendite:caricaVendite, clienti:caricaClienti, fornitori:caricaFornitori, basi:caricaBasi, prodotti:caricaProdotti, stazione:caricaStazione, autoconsumo:caricaAutoconsumo, utenti:caricaUtentiCompleto, cliente:caricaAreaCliente, logistica:caricaLogistica, bacheca:caricaBacheca, benchmark:caricaBenchmark, finanze:caricaFinanze };
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
function fmtL(n) {
  const v = Number(n);
  return _sep(v.toLocaleString('it-IT', { minimumFractionDigits: 0, maximumFractionDigits: 0 })) + ' L';
}
function badgeStato(stato) {
  const map = { 'confermato':'green','in attesa':'amber','annullato':'red','programmato':'blue','cliente':'blue','deposito':'teal','entrata_deposito':'teal','stazione_servizio':'purple','autoconsumo':'gray' };
  const labels = { 'entrata_deposito':'deposito','stazione_servizio':'stazione','autoconsumo':'autoconsumo' };
  return '<span class="badge ' + (map[esc(stato)]||'amber') + '">' + esc(labels[stato]||stato) + '</span>';
}

var _statoColori = {
  'in attesa':  { bg:'#FAEEDA', color:'#633806', border:'#D4A017' },
  'confermato': { bg:'#EAF3DE', color:'#27500A', border:'#639922' },
  'programmato':{ bg:'#E6F1FB', color:'#0C447C', border:'#378ADD' },
  'annullato':  { bg:'#FCEBEB', color:'#791F1F', border:'#E24B4A' }
};

function _applicaStatoColore(selectId) {
  var sel = document.getElementById(selectId); if (!sel) return;
  var badgeId = selectId + '-badge';
  var badge = document.getElementById(badgeId);
  if (!badge) return;
  var c = _statoColori[sel.value] || { bg:'#eee', color:'#333', border:'#ccc' };
  badge.textContent = sel.value.charAt(0).toUpperCase() + sel.value.slice(1);
  badge.style.background = c.bg;
  badge.style.color = c.color;
  badge.style.borderColor = c.border;
}

function _aggiornaLabelPrezzi() {
  var inp = document.getElementById('filtro-data-prezzi');
  var div = document.getElementById('prezzi-label-giorno');
  if (!inp || !div || !inp.value) { if(div) div.innerHTML = ''; return; }
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var sel = new Date(inp.value + 'T12:00:00'); sel.setHours(0,0,0,0);
  var diff = Math.round((sel - oggi) / 86400000);
  var GIORNI_L = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  var giorno = GIORNI_L[sel.getDay()];
  var html = '';
  if (diff === 0) html += '<span style="background:#378ADD;color:#fff;padding:4px 12px;border-radius:8px;font-size:13px;font-weight:700;margin-right:6px">OGGI</span>';
  else if (diff === -1) html += '<span style="background:#BA7517;color:#fff;padding:4px 12px;border-radius:8px;font-size:13px;font-weight:700;margin-right:6px">IERI</span>';
  else if (diff === 1) html += '<span style="background:#639922;color:#fff;padding:4px 12px;border-radius:8px;font-size:13px;font-weight:700;margin-right:6px">DOMANI</span>';
  var dayColors = { 0:['#FCEBEB','#791F1F'], 1:['#E6F1FB','#0C447C'], 2:['#E6F1FB','#0C447C'], 3:['#E6F1FB','#0C447C'], 4:['#E6F1FB','#0C447C'], 5:['#E6F1FB','#0C447C'], 6:['#EEEDFE','#3C3489'] };
  var dc = dayColors[sel.getDay()];
  html += '<span style="background:' + dc[0] + ';color:' + dc[1] + ';padding:4px 12px;border-radius:8px;font-size:13px;font-weight:600">' + giorno + '</span>';
  div.innerHTML = html;
}

function _mostraLegendaStati(ev) {
  var existing = document.getElementById('popup-legenda-stati');
  if (existing) { existing.remove(); return; }
  var popup = document.createElement('div');
  popup.id = 'popup-legenda-stati';
  popup.style.cssText = 'position:fixed;z-index:9999;background:#fff;border:1px solid var(--border);border-radius:12px;padding:16px 20px;max-width:340px;font-size:12px;line-height:1.8;box-shadow:0 4px 20px rgba(0,0,0,0.15)';
  var rect = ev.target.getBoundingClientRect();
  popup.style.top = (rect.bottom + 8) + 'px';
  popup.style.left = Math.max(10, rect.left - 100) + 'px';
  popup.innerHTML = '<div style="font-size:14px;font-weight:600;margin-bottom:8px">Legenda stati ordine</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#FAEEDA;border:1px solid #D4A017"></span><strong style="color:#633806">In attesa</strong> — Ordine inserito, non ancora confermato. Visibile in "Ordini non processati". Può essere riprogrammato o annullato.</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#E6F1FB;border:1px solid #378ADD"></span><strong style="color:#0C447C">Programmato</strong> — Ordine pianificato per una data specifica. Pronto per essere caricato su un viaggio.</div>' +
    '<div style="display:flex;align-items:center;gap:8px;margin-bottom:4px"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#EAF3DE;border:1px solid #639922"></span><strong style="color:#27500A">Confermato</strong> — Consegna completata. Lo scarico dal deposito è avvenuto. Entra nel calcolo vendite e margini.</div>' +
    '<div style="display:flex;align-items:center;gap:8px"><span style="display:inline-block;width:12px;height:12px;border-radius:3px;background:#FCEBEB;border:1px solid #E24B4A"></span><strong style="color:#791F1F">Annullato</strong> — Ordine cancellato. Non entra nei calcoli. Lo scarico deposito viene stornato.</div>' +
    '<div style="margin-top:10px;text-align:right"><button onclick="document.getElementById(\'popup-legenda-stati\').remove()" style="font-size:11px;padding:4px 14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);cursor:pointer">Chiudi</button></div>';
  document.body.appendChild(popup);
  setTimeout(function() { document.addEventListener('click', function _chiudi(e) { if (!popup.contains(e.target)) { popup.remove(); document.removeEventListener('click', _chiudi); } }); }, 100);
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

// ══════════════════════════════════════════════════════════════════
// PRESENZA ONLINE
// ══════════════════════════════════════════════════════════════════

async function _heartbeat() {
  if (!utenteCorrente || !utenteCorrente.id) return;
  await sb.from('utenti').update({ last_seen: new Date().toISOString() }).eq('id', utenteCorrente.id);
  if (document.getElementById('utenti-online')) caricaUtentiOnline();
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
