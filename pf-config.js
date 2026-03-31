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
    // Apri sezione in base alla postazione
    var sezionePost = { 'stazione_oppido':'stazione', 'deposito_vibo':'deposito', 'logistica':'logistica' };
    var sezioneIniziale = sezionePost[utente.postazione] || 'dashboard';
    var navItem = document.querySelector('.nav-item[onclick*="' + sezioneIniziale + '"]') || document.querySelector('.nav-item');
    setSection(sezioneIniziale, navItem);
    // Controlla avvisi non letti (badge pulsante)
    aggiornaBadgeBacheca();
    setInterval(aggiornaBadgeBacheca, 60000);
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
      { id:'dashboard', icon:'▦', label:'Dashboard', section:'Operativo' },
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
    var badgeHtml = v.badge ? '<span id="bacheca-badge" class="nav-badge" style="display:none"></span>' : '';
    return '<div class="nav-item" onclick="setSection(\'' + v.id + '\',this)"><span class="nav-icon">' + v.icon + '</span> ' + v.label + badgeHtml + '</div>';
  }).join('');
  const prima = nav.querySelector('.nav-item');
  if (prima) prima.classList.add('active');
}

async function logout() { await sb.auth.signOut(); window.location.href = 'login.html'; }

// ── NAVIGAZIONE ───────────────────────────────────────────────────
const TITLES = { dashboard:'Dashboard', ordini:'Ordini', prezzi:'Prezzi giornalieri', deposito:'Deposito', consegne:'Consegne', vendite:'Vendite', clienti:'Clienti', fornitori:'Fornitori', basi:'Basi di carico', prodotti:'Prodotti', stazione:'Stazione Oppido', autoconsumo:'Autoconsumo', utenti:'Utenti', cliente:'I miei prezzi', logistica:'Logistica', bacheca:'Bacheca avvisi', benchmark:'Benchmark mercato', finanze:'Finanze' };
function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  if (el) el.classList.add('active');
  document.getElementById('page-title').textContent = TITLES[id] || id;
  const loaders = { dashboard:caricaDashboard, prezzi:caricaPrezzi, ordini:caricaOrdini, deposito:caricaDeposito, consegne:caricaConsegne, vendite:caricaVendite, clienti:caricaClienti, fornitori:caricaFornitori, basi:caricaBasi, prodotti:caricaProdotti, stazione:caricaStazione, autoconsumo:caricaAutoconsumo, utenti:caricaUtentiCompleto, cliente:caricaAreaCliente, logistica:caricaLogistica, bacheca:caricaBacheca, benchmark:caricaBenchmark, finanze:caricaFinanze };
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

// ── LABEL GIORNO (OGGI/DOMANI/IERI) ────────────────────────────
function _labelGiorno(inputId) {
  var inp = document.getElementById(inputId);
  if (!inp) return;
  var spanId = inputId + '-lbl';
  var el = document.getElementById(spanId);
  if (!el) {
    el = document.createElement('span');
    el.id = spanId;
    el.style.cssText = 'font-size:13px;font-weight:700;padding:4px 12px;border-radius:8px;margin-left:6px;display:none;vertical-align:middle';
    inp.parentNode.insertBefore(el, inp.nextSibling);
  }
  var val = inp.value;
  if (!val) { el.style.display = 'none'; return; }
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var sel = new Date(val); sel.setHours(0,0,0,0);
  var diff = Math.round((sel - oggi) / 86400000);
  if (diff === 0) { el.textContent = 'OGGI'; el.style.background = '#378ADD'; el.style.color = '#fff'; el.style.display = 'inline-block'; }
  else if (diff === 1) { el.textContent = 'DOMANI'; el.style.background = '#639922'; el.style.color = '#fff'; el.style.display = 'inline-block'; }
  else if (diff === -1) { el.textContent = 'IERI'; el.style.background = '#BA7517'; el.style.color = '#fff'; el.style.display = 'inline-block'; }
  else { el.style.display = 'none'; }
}
