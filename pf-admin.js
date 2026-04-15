// PhoenixFuel — Admin, Permessi, Utenti, Giacenze
// ── PERMESSI ──────────────────────────────────────────────────────
const SEZIONI_SISTEMA = [
  {id:'dashboard',label:'Dashboard',icon:'▦'},
  {id:'ordini',label:'Ordini',icon:'📋'},
  {id:'prezzi',label:'Prezzi giornalieri',icon:'💰'},
  {id:'deposito',label:'Deposito',icon:'🏗', sub:[
    {id:'deposito.modifica-cmp',label:'Modifica CMP cisterne'}
  ]},
  {id:'consegne',label:'Consegne',icon:'🚚'},
  {id:'vendite',label:'Vendite',icon:'📊', sub:[
    {id:'vendite.ingrosso',label:'Ingrosso'},
    {id:'vendite.dettaglio',label:'Dettaglio stazione'},
    {id:'vendite.annuale',label:'Riepilogo annuale'},
    {id:'vendite.margine-cliente',label:'Margine per cliente'}
  ]},
  {id:'benchmark',label:'Benchmark mercato',icon:'📈'},
  {id:'finanze',label:'Finanze',icon:'🏦'},
  {id:'clienti',label:'Clienti',icon:'👤'},
  {id:'fornitori',label:'Fornitori',icon:'🏭'},
  {id:'basi',label:'Basi di carico',icon:'📍'},
  {id:'prodotti',label:'Prodotti',icon:'📦'},
  {id:'logistica',label:'Logistica',icon:'🚛'},
  {id:'stazione',label:'Stazione Oppido',icon:'⛽', sub:[
    {id:'stazione.dashboard',label:'Dashboard'},
    {id:'stazione.letture',label:'Totalizzatori contatori'},
    {id:'stazione.prezzi',label:'Prezzi pompa'},
    {id:'stazione.versamenti',label:'Versamenti'},
    {id:'stazione.magazzino',label:'Magazzino'},
    {id:'stazione.marginalita',label:'Marginalità'},
    {id:'stazione.cassa',label:'Cassa'},
    {id:'stazione.foglio',label:'Foglio giornaliero'},
    {id:'stazione.giacenze',label:'Giacenze mensili'},
    {id:'stazione.allegati',label:'Allegati'},
    {id:'stazione.report',label:'Report'}
  ]},
  {id:'autoconsumo',label:'Autoconsumo',icon:'🛢'},
  {id:'home',label:'Bacheca Home',icon:'🏠'},
  {id:'bacheca',label:'Bacheca avvisi',icon:'🔔'},
  {id:'benchmark',label:'Benchmark mercato',icon:'📈'},
  {id:'finanze',label:'Finanze',icon:'🏦'},
];

// Cache permessi utente corrente (caricati al login)
var _permessiUtente = null;

function _haPermesso(sezione) {
  if (!utenteCorrente) return false;
  if (utenteCorrente.ruolo === 'admin') return true;
  if (!_permessiUtente) return false;
  // Permesso sezione principale
  if (_permessiUtente[sezione]) return true;
  // Sottosezione: check "stazione.cassa" → serve anche "stazione" abilitato
  if (sezione.indexOf('.') >= 0) {
    var parent = sezione.split('.')[0];
    return _permessiUtente[parent] && _permessiUtente[sezione] !== false;
  }
  return false;
}

function _haPermessoSub(sottosezione) {
  if (!utenteCorrente) return false;
  if (utenteCorrente.ruolo === 'admin') return true;
  if (!_permessiUtente) return true; // Default: se non ci sono permessi sub, mostra tutto
  // Se il permesso sub esiste ed è false → nascondi
  if (_permessiUtente[sottosezione] === false) return false;
  // Se il permesso sub non è mai stato settato → mostra (default visibile)
  return true;
}

async function _caricaPermessiUtente(utenteId) {
  var { data } = await sb.from('permessi').select('sezione,abilitato').eq('utente_id', utenteId);
  _permessiUtente = {};
  (data || []).forEach(function(p) { _permessiUtente[p.sezione] = p.abilitato; });
}

async function apriModalePermessi(utenteId, nomeUtente) {
  const { data: permessiEsistenti } = await sb.from('permessi').select('*').eq('utente_id', utenteId);
  const map = {};
  (permessiEsistenti||[]).forEach(p => map[p.sezione]=p.abilitato);

  let html = '<div style="font-size:15px;font-weight:500;margin-bottom:16px">Permessi per ' + nomeUtente + '</div>';
  html += '<div style="display:grid;grid-template-columns:1fr;gap:6px;margin-bottom:20px">';

  SEZIONI_SISTEMA.forEach(s => {
    var checked = map[s.id] ? ' checked' : '';
    html += '<div style="background:var(--bg-kpi);border-radius:8px;padding:10px 12px">';
    html += '<label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:13px;font-weight:500"><input type="checkbox" value="' + s.id + '"' + checked + ' onchange="aggiornaPermesso(\'' + utenteId + '\',\'' + s.id + '\',this.checked)" /><span>' + s.icon + ' ' + s.label + '</span></label>';

    // Sottosezioni
    if (s.sub && s.sub.length) {
      html += '<div style="margin-left:28px;margin-top:6px;display:grid;grid-template-columns:1fr 1fr;gap:4px">';
      s.sub.forEach(function(sub) {
        var subChecked = map[sub.id] !== false ? ' checked' : '';
        html += '<label style="display:flex;align-items:center;gap:6px;cursor:pointer;font-size:11px;color:var(--text-muted);padding:4px 8px;background:var(--bg);border-radius:6px"><input type="checkbox" value="' + sub.id + '"' + subChecked + ' onchange="aggiornaPermesso(\'' + utenteId + '\',\'' + sub.id + '\',this.checked)" /><span>' + sub.label + '</span></label>';
      });
      html += '</div>';
    }
    html += '</div>';
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
    html += '<div style="display:grid;grid-template-columns:1fr;gap:6px">';
    SEZIONI_SISTEMA.forEach(s => {
      html += '<div style="background:var(--bg-kpi);border-radius:6px;padding:6px 10px">';
      html += '<label class="check-label"><input type="checkbox" value="' + s.id + '" checked /> ' + s.icon + ' ' + s.label + '</label>';
      if (s.sub && s.sub.length) {
        html += '<div style="margin-left:24px;margin-top:4px;display:grid;grid-template-columns:1fr 1fr;gap:3px">';
        s.sub.forEach(function(sub) {
          html += '<label class="check-label" style="font-size:10px;padding:3px 6px"><input type="checkbox" value="' + sub.id + '" checked /> ' + sub.label + '</label>';
        });
        html += '</div>';
      }
      html += '</div>';
    });
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
  caricaAuditLog();
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
  tbody.innerHTML = '<tr><td colspan="9" class="loading">Calcolo in corso...</td></tr>';

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
    const { data: usciteClienti } = await sb.from('ordini').select('prodotto,litri').eq('tipo_ordine','cliente').neq('stato','annullato').or('fornitore.ilike.%phoenix%,fornitore.ilike.%deposito%').gte('data', da).lte('data', a);
    const { data: usciteStazione } = await sb.from('ordini').select('prodotto,litri').eq('tipo_ordine','stazione_servizio').neq('stato','annullato').or('fornitore.ilike.%phoenix%,fornitore.ilike.%deposito%').gte('data', da).lte('data', a);
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
    // Aggiungi prodotti dalle cisterne anche se senza movimenti nel periodo
    const { data: cisterneProd } = await sb.from('cisterne').select('prodotto').eq('sede', sede);
    (cisterneProd||[]).forEach(c => {
      if (c.prodotto && !prodottiDati[c.prodotto]) {
        prodottiDati[c.prodotto] = { entrate:0, uscite:0 };
      }
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
    tbody.innerHTML = '<tr><td colspan="9" class="loading">Nessun movimento trovato per ' + anno + '</td></tr>';
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
      html += '<td><input type="number" class="giac-reale-input" data-prodotto="' + esc(prodotto) + '" data-sede="' + sede + '" data-stimata="' + stimata + '" data-giac-inizio="' + inizio + '" data-entrate="' + d.entrate + '" value="' + realeVal + '" placeholder="' + Math.round(stimata) + '" style="font-family:var(--font-mono);font-size:13px;font-weight:600;padding:6px 10px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text);width:120px;max-width:100%;text-align:right" oninput="aggiornaGiacDiff(this,' + stimata + ')" /></td>';
    }
    // Calo consentito (D.M. 55/2000) — solo per sede deposito e prodotti gasolio/benzina
    var caloHtml = '';
    if (sede === 'deposito_vibo') {
      var totaleCaricoVerifica = inizio + d.entrate;
      var coeffCalo = prodotto.toLowerCase().indexOf('gasolio autotrazione') >= 0 ? 0.003 :
                      prodotto.toLowerCase().indexOf('gasolio agricolo') >= 0 ? 0.01 :
                      prodotto.toLowerCase().indexOf('benzina') >= 0 ? 0.02 : 0;
      if (coeffCalo > 0 && totaleCaricoVerifica > 0) {
        var caloMax = Math.round(totaleCaricoVerifica * coeffCalo);
        var caloEff = realeVal !== '' ? Math.max(0, Math.round(stimata - Number(realeVal))) : null;
        var entroToll = caloEff !== null ? caloEff <= caloMax : null;
        var residuo = caloEff !== null ? caloMax - caloEff : null;
        var pct = caloEff !== null ? Math.min(100, Math.round((caloEff / caloMax) * 100)) : 0;
        var barCol = entroToll === null ? '#ccc' : entroToll ? '#639922' : '#E24B4A';
        var normLabel = prodotto.toLowerCase().indexOf('gasolio autotrazione') >= 0 ? '3‰ gasolio' :
                        prodotto.toLowerCase().indexOf('gasolio agricolo') >= 0 ? '1% agricolo' : '2% benzina';
        caloHtml = '<div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">' + normLabel + ' · max <strong style="font-family:var(--font-mono)">' + _sep(caloMax.toLocaleString('it-IT')) + ' L</strong></div>';
        if (caloEff !== null) {
          var semBg = entroToll ? '#EAF3DE' : '#FCEBEB';
          var semCol = entroToll ? '#27500A' : '#791F1F';
          var semTxt = entroToll ? 'Calo consentito' : 'Calo NON consentito';
          caloHtml += '<div style="background:' + semBg + ';color:' + semCol + ';font-size:9px;font-weight:600;padding:2px 8px;border-radius:10px;display:inline-block;margin-bottom:4px">' + semTxt + '</div>';
          caloHtml += '<div style="font-size:10px;color:var(--text-muted)">' + (entroToll ? 'Residuo: ' : 'Sforamento: ') + '<span style="font-family:var(--font-mono);color:' + semCol + ';font-weight:600">' + _sep(Math.abs(residuo).toLocaleString('it-IT')) + ' L</span></div>';
          caloHtml += '<div style="margin-top:4px;height:6px;background:rgba(0,0,0,0.08);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barCol + ';border-radius:3px"></div></div>';
        } else {
          caloHtml += '<div style="font-size:10px;color:var(--text-muted)">Inserisci giacenza reale</div>';
        }
      }
    }
    html += '<td style="font-family:var(--font-mono);color:' + diffColor + '">' + diffLabel + '</td>';
    html += '<td style="min-width:160px">' + caloHtml + '</td>';
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
  var val = parseFloat(input.value);
  var tr = input.closest('tr');
  var tds = tr.querySelectorAll('td');
  var diffTd = tds[6]; // colonna differenza
  var caloTd = tds[7]; // colonna calo consentito
  if (isNaN(val)) { diffTd.innerHTML = '—'; return; }
  var diff = val - stimata;
  var col = diff > 0 ? '#639922' : diff < 0 ? '#A32D2D' : 'var(--text-muted)';
  diffTd.innerHTML = '<span style="font-family:var(--font-mono);color:' + col + '">' + (diff > 0 ? '+' : '') + _sep(Math.round(diff).toLocaleString('it-IT')) + ' L</span>';
  // Aggiorna semaforo calo consentito se presente
  if (caloTd && input.dataset.sede === 'deposito_vibo') {
    var prodotto = input.dataset.prodotto || '';
    var inizio = parseFloat(input.dataset.giacInizio || 0);
    var entrate = parseFloat(input.dataset.entrate || 0);
    var totaleCaricoVerifica = inizio + entrate;
    var coeffCalo = prodotto.toLowerCase().indexOf('gasolio autotrazione') >= 0 ? 0.003 :
                    prodotto.toLowerCase().indexOf('gasolio agricolo') >= 0 ? 0.01 :
                    prodotto.toLowerCase().indexOf('benzina') >= 0 ? 0.02 : 0;
    if (coeffCalo > 0 && totaleCaricoVerifica > 0) {
      var caloMax = Math.round(totaleCaricoVerifica * coeffCalo);
      var caloEff = Math.max(0, Math.round(stimata - val));
      var entroToll = caloEff <= caloMax;
      var residuo = caloMax - caloEff;
      var pct = Math.min(100, Math.round((caloEff / caloMax) * 100));
      var barCol = entroToll ? '#639922' : '#E24B4A';
      var semBg = entroToll ? '#EAF3DE' : '#FCEBEB';
      var semCol = entroToll ? '#27500A' : '#791F1F';
      var semTxt = entroToll ? 'Calo consentito' : 'Calo NON consentito';
      var normLabel = prodotto.toLowerCase().indexOf('gasolio autotrazione') >= 0 ? '3‰ gasolio' :
                      prodotto.toLowerCase().indexOf('gasolio agricolo') >= 0 ? '1% agricolo' : '2% benzina';
      caloTd.innerHTML =
        '<div style="font-size:10px;color:var(--text-muted);margin-bottom:3px">' + normLabel + ' · max <strong style="font-family:var(--font-mono)">' + _sep(caloMax.toLocaleString('it-IT')) + ' L</strong></div>' +
        '<div style="background:' + semBg + ';color:' + semCol + ';font-size:9px;font-weight:600;padding:2px 8px;border-radius:10px;display:inline-block;margin-bottom:4px">' + semTxt + '</div>' +
        '<div style="font-size:10px;color:var(--text-muted)">' + (entroToll ? 'Residuo: ' : 'Sforamento: ') + '<span style="font-family:var(--font-mono);color:' + semCol + ';font-weight:600">' + _sep(Math.abs(residuo).toLocaleString('it-IT')) + ' L</span></div>' +
        '<div style="margin-top:4px;height:6px;background:rgba(0,0,0,0.08);border-radius:3px;overflow:hidden"><div style="height:100%;width:' + pct + '%;background:' + barCol + ';border-radius:3px"></div></div>';
    }
  }
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


// ═══════════════════════════════════════════════════════════════════
// STORICO CHIUSURE FINE ANNO — Report stampabile
// ═══════════════════════════════════════════════════════════════════
async function stampaStoricoChiusure(sede) {
  var sedeLabel = { deposito_vibo:'Deposito Vibo', stazione_oppido:'Stazione Oppido', autoconsumo:'Autoconsumo' };
  var w = _apriReport('Storico chiusure ' + (sedeLabel[sede]||sede)); if (!w) return;

  // Carica tutti gli anni
  var { data: tutti } = await sb.from('giacenze_annuali').select('*').eq('sede', sede).order('anno', { ascending: false });
  if (!tutti || !tutti.length) { w.close(); toast('Nessuna chiusura salvata per ' + (sedeLabel[sede]||sede)); return; }

  // Raggruppa per anno
  var perAnno = {};
  tutti.forEach(function(g) {
    if (!perAnno[g.anno]) perAnno[g.anno] = {};
    perAnno[g.anno][g.prodotto] = g;
  });
  var anni = Object.keys(perAnno).sort(function(a,b) { return Number(b) - Number(a); });

  // Raccogli tutti i prodotti
  var prodottiSet = {};
  tutti.forEach(function(g) { prodottiSet[g.prodotto] = true; });
  var prodotti = Object.keys(prodottiSet).sort();

  // CSS
  var css = '<style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial,sans-serif;font-size:11px;background:#fff}' +
    '.page{width:297mm;min-height:210mm;padding:12mm;margin:0 auto}' +
    '@media print{.no-print{display:none!important}@page{size:landscape;margin:8mm}}' +
    '@media screen{.page{box-shadow:0 2px 12px rgba(0,0,0,0.08);margin:10px auto}body{background:#f5f4f0}}' +
    '@media(max-width:600px){.page{padding:4mm!important;width:auto!important}table{font-size:8px!important}th,td{padding:3px 2px!important}}' +
    'table{width:100%;border-collapse:collapse}' +
    'th{background:#6B5FCC;color:#fff;padding:7px 6px;font-size:9px;text-transform:uppercase;letter-spacing:0.3px;border:1px solid #5A4FBB;text-align:center}' +
    'td{padding:6px 8px;border:1px solid #ddd;font-size:11px}' +
    '.m{font-family:"Courier New",monospace;text-align:right}' +
    '.tot{border-top:3px solid #6B5FCC;font-weight:bold;background:#EEEDFE}' +
    '.conv{color:#639922;font-weight:600}.noconv{color:#BA7517}' +
    '</style>';

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Storico Chiusure — ' + (sedeLabel[sede]||sede) + '</title>' + css + '</head><body><div class="page">';

  // Header
  html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:3px solid #6B5FCC;padding-bottom:10px;margin-bottom:16px">';
  html += '<div><div style="font-size:20px;font-weight:bold;color:#6B5FCC">STORICO CHIUSURE GIACENZE</div>';
  html += '<div style="font-size:13px;color:#666;margin-top:4px">Sede: <strong>' + (sedeLabel[sede]||sede) + '</strong> — Anni: ' + anni[anni.length-1] + ' – ' + anni[0] + '</div></div>';
  html += '<div style="text-align:right"><div style="font-size:16px;font-weight:bold;letter-spacing:1px">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:10px;color:#666">Generato il: ' + new Date().toLocaleDateString('it-IT') + '</div></div></div>';

  // Per ogni prodotto: tabella con tutti gli anni
  prodotti.forEach(function(prod) {
    var pi = cacheProdotti ? cacheProdotti.find(function(p) { return p.nome === prod; }) : null;
    var col = pi ? pi.colore : '#6B5FCC';

    html += '<div style="font-size:13px;font-weight:bold;color:' + col + ';text-transform:uppercase;letter-spacing:0.5px;margin:18px 0 8px;border-bottom:2px solid ' + col + ';padding-bottom:4px">';
    html += '<span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:' + col + ';margin-right:6px"></span>' + prod + '</div>';

    html += '<table><thead><tr>';
    html += '<th>Anno</th><th>Giac. inizio</th><th>Entrate</th><th>Uscite</th><th>Giac. stimata</th><th>Giac. reale</th><th>Differenza</th><th>Diff. %</th><th>Stato</th><th>Convalidata da</th><th>Data convalida</th></tr></thead><tbody>';

    anni.forEach(function(anno, idx) {
      var g = perAnno[anno][prod];
      if (!g) {
        html += '<tr style="opacity:0.4"><td style="font-weight:500">' + anno + '</td><td colspan="10" style="text-align:center;color:#999">Nessun dato</td></tr>';
        return;
      }
      var inizio = Number(g.giacenza_inizio || 0);
      var entrate = Number(g.totale_entrate || 0);
      var uscite = Number(g.totale_uscite || 0);
      var stimata = Number(g.giacenza_stimata || 0);
      var reale = g.giacenza_reale !== null ? Number(g.giacenza_reale) : null;
      var diff = g.differenza !== null ? Number(g.differenza) : (reale !== null ? reale - stimata : null);
      var diffPct = stimata > 0 && diff !== null ? (diff / stimata * 100) : null;
      var diffColor = diff !== null ? (diff >= 0 ? '#639922' : '#A32D2D') : '#999';
      var isConv = g.convalidata;
      var bg = idx % 2 ? 'background:#f9f9f6' : '';

      html += '<tr style="' + bg + '">';
      html += '<td style="font-weight:600;font-size:13px">' + anno + '</td>';
      html += '<td class="m">' + (inizio > 0 ? fmtL(inizio) : '—') + '</td>';
      html += '<td class="m" style="color:#639922">' + (entrate > 0 ? fmtL(entrate) : '—') + '</td>';
      html += '<td class="m" style="color:#A32D2D">' + (uscite > 0 ? fmtL(uscite) : '—') + '</td>';
      html += '<td class="m" style="font-weight:500">' + (stimata > 0 ? fmtL(stimata) : '—') + '</td>';
      html += '<td class="m" style="font-weight:600;color:' + (isConv ? '#639922' : '#BA7517') + '">' + (reale !== null ? fmtL(reale) : '—') + '</td>';
      html += '<td class="m" style="color:' + diffColor + ';font-weight:500">' + (diff !== null ? (diff >= 0 ? '+' : '') + fmtL(diff) : '—') + '</td>';
      html += '<td class="m" style="color:' + diffColor + '">' + (diffPct !== null ? (diffPct >= 0 ? '+' : '') + diffPct.toFixed(2) + '%' : '—') + '</td>';
      html += '<td style="text-align:center">' + (isConv ? '<span style="color:#639922;font-weight:600">Convalidata</span>' : '<span style="color:#BA7517">Da convalidare</span>') + '</td>';
      html += '<td style="font-size:10px;color:#666">' + (g.convalidata_da || '—') + '</td>';
      html += '<td style="font-size:10px;color:#666">' + (g.convalidata_il ? new Date(g.convalidata_il).toLocaleDateString('it-IT') : '—') + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table>';
  });

  // Grafico comparativo giacenze reali per anno
  if (prodotti.length && anni.length >= 2) {
    html += '<div style="margin-top:20px;page-break-before:auto">';
    html += '<div style="font-size:12px;font-weight:bold;color:#6B5FCC;margin-bottom:8px">Andamento giacenze reali per anno</div>';
    html += '<table style="width:auto"><thead><tr><th>Prodotto</th>';
    anni.slice().reverse().forEach(function(a) { html += '<th>' + a + '</th>'; });
    html += '<th>Trend</th></tr></thead><tbody>';
    prodotti.forEach(function(prod) {
      html += '<tr><td style="font-weight:500">' + prod + '</td>';
      var valori = [];
      anni.slice().reverse().forEach(function(a) {
        var g = perAnno[a] && perAnno[a][prod];
        var reale = g && g.giacenza_reale !== null ? Number(g.giacenza_reale) : null;
        valori.push(reale);
        html += '<td class="m" style="font-weight:500">' + (reale !== null ? fmtL(reale) : '—') + '</td>';
      });
      // Trend semplice
      var validi = valori.filter(function(v) { return v !== null; });
      var trend = '—';
      if (validi.length >= 2) {
        var primo = validi[0], ultimo = validi[validi.length - 1];
        var diff = ultimo - primo;
        trend = diff > 0 ? '<span style="color:#639922;font-weight:500">+' + fmtL(diff) + ' ↑</span>' : diff < 0 ? '<span style="color:#A32D2D;font-weight:500">' + fmtL(diff) + ' ↓</span>' : '<span style="color:#BA7517">= stabile</span>';
      }
      html += '<td>' + trend + '</td></tr>';
    });
    html += '</tbody></table></div>';
  }

  // Footer
  html += '<div style="text-align:center;font-size:9px;color:#aaa;border-top:1px solid #e8e8e8;padding-top:8px;margin-top:16px">PhoenixFuel Srl — Storico chiusure giacenze — ' + (sedeLabel[sede]||sede) + '</div>';
  html += '</div>';

  // Bottoni stampa
  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button>';
  html += '</div></body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

// ═══════════════════════════════════════════════════════════════════
// BACKUP & RIPRISTINO DB (solo admin)
// ═══════════════════════════════════════════════════════════════════
const _SUPABASE_URL = 'https://jpugeakgpitbxdswbucj.supabase.co';
const _BACKUP_FN_URL = _SUPABASE_URL + '/functions/v1/quick-responder';
const _RESTORE_FN_URL = _SUPABASE_URL + '/functions/v1/restore-backup';

function _isAdmin() {
  return utenteCorrente && utenteCorrente.ruolo === 'admin';
}

// ── CREA SNAPSHOT MANUALE ──
function apriCreaSnapshot() {
  if (!_isAdmin()) { toast('Solo admin'); return; }
  var h = '<div style="font-size:18px;font-weight:600;margin-bottom:8px;color:#27500A">💾 Crea snapshot manuale</div>';
  h += '<div style="background:#EAF3DE;border-left:3px solid #639922;padding:12px 14px;border-radius:0 8px 8px 0;margin-bottom:14px;font-size:13px;line-height:1.5">';
  h += '<strong>Cosa fa:</strong><br>';
  h += '• Esporta tutte le 47 tabelle del database in un file JSON<br>';
  h += '• Salva il file in Supabase Storage (bucket "backups")<br>';
  h += '• Nome file: <code>backup-AAAA-MM-GG.json</code><br><br>';
  h += '<strong>Quando usarlo:</strong><br>';
  h += '• Prima di modifiche strutturali al codice/DB<br>';
  h += '• Prima di operazioni di import/export massive<br>';
  h += '• Quando vuoi un punto di ripristino "fresh" (l\'ultimo backup automatico è di stanotte 03:00)<br><br>';
  h += '<strong>⚠️ Nota:</strong> se hai già fatto uno snapshot oggi, verrà SOVRASCRITTO (file con stessa data).';
  h += '</div>';
  h += '<div style="display:flex;gap:8px;margin-top:12px">';
  h += '<button class="btn-primary" style="flex:1;background:#639922" onclick="eseguiSnapshot()">💾 Crea snapshot ora</button>';
  h += '<button onclick="chiudiModalePermessi()" style="padding:10px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer">Annulla</button>';
  h += '</div>';
  apriModal(h);
}

async function eseguiSnapshot() {
  var out = document.getElementById('snapshot-output');
  if (out) out.innerHTML = '<div style="padding:10px;background:#EAF3DE;border-radius:6px">⏳ Snapshot in corso (può richiedere 30-60 secondi)...</div>';
  chiudiModalePermessi();
  toast('Snapshot avviato...');
  try {
    var resp = await fetch(_BACKUP_FN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({})
    });
    var data = await resp.json();
    if (!data.ok) {
      if (out) out.innerHTML = '<div style="padding:10px;background:#FCEBEB;border-radius:6px;color:#791F1F">❌ Errore: ' + esc(data.error || 'sconosciuto') + '</div>';
      toast('Snapshot fallito');
      return;
    }
    var sizeMB = (data.sizeBytes / 1024 / 1024).toFixed(2);
    if (out) out.innerHTML = '<div style="padding:10px;background:#EAF3DE;border-radius:6px;color:#27500A">✅ <strong>Snapshot completato</strong><br>File: <code>' + esc(data.filename) + '</code><br>Record salvati: ' + data.totRecords.toLocaleString('it-IT') + '<br>Dimensione: ' + sizeMB + ' MB</div>';
    toast('✅ Snapshot creato: ' + data.filename);
    if (typeof _auditLog === 'function') _auditLog('snapshot_manuale', 'sistema', data.filename + ' (' + data.totRecords + ' record, ' + sizeMB + ' MB)');
    caricaListaSnapshot(); // refresh lista dopo creazione
  } catch (e) {
    if (out) out.innerHTML = '<div style="padding:10px;background:#FCEBEB;border-radius:6px;color:#791F1F">❌ Errore rete: ' + esc(e.message) + '</div>';
    toast('Errore snapshot');
  }
}

// ── RIPRISTINA DA SNAPSHOT ──
async function apriRipristinaSnapshot() {
  if (!_isAdmin()) { toast('Solo admin'); return; }

  toast('Carico elenco snapshot disponibili...');
  // Lista snapshot disponibili dal bucket
  var { data: files, error } = await sb.storage.from('backups').list('', { limit: 100, sortBy:{column:'created_at',order:'desc'} });
  if (error) { toast('Errore lettura backup: ' + error.message); return; }
  if (!files || !files.length) { toast('Nessun snapshot disponibile'); return; }

  var snapshotList = files.filter(function(f){ return /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.name); });
  if (!snapshotList.length) { toast('Nessun snapshot valido'); return; }

  var h = '<div style="font-size:18px;font-weight:600;margin-bottom:8px;color:#791F1F">⚠️ Ripristina database da snapshot</div>';
  h += '<div style="background:#FCEBEB;border:2px solid #E24B4A;padding:14px;border-radius:8px;margin-bottom:14px;font-size:13px;line-height:1.6">';
  h += '<strong style="color:#791F1F">⛔ ATTENZIONE — OPERAZIONE DISTRUTTIVA</strong><br><br>';
  h += '• <strong>TUTTI</strong> i dati attuali del database (47 tabelle) verranno <strong>CANCELLATI</strong><br>';
  h += '• Verranno sostituiti con i dati dello snapshot scelto<br>';
  h += '• <strong>Tutti i dati inseriti dopo lo snapshot andranno persi</strong> (es. ordini di oggi, letture, cassa, DAS firmati)<br>';
  h += '• L\'operazione richiede 2-5 minuti durante i quali il gestionale non sarà utilizzabile<br>';
  h += '• Se durante il ripristino qualcuno sta usando il gestionale, possono verificarsi corruzioni<br><br>';
  h += '<strong style="color:#791F1F">Per sicurezza, verrà creato uno snapshot di emergenza PRIMA del ripristino.</strong>';
  h += '</div>';

  h += '<div style="margin-bottom:12px"><label style="font-size:12px;color:var(--text-muted);font-weight:600;text-transform:uppercase">Scegli snapshot da ripristinare</label>';
  h += '<select id="snap-file" style="width:100%;font-size:13px;padding:8px 12px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);margin-top:4px">';
  snapshotList.forEach(function(f) {
    var dataStr = f.name.replace('backup-','').replace('.json','');
    var sizeMB = f.metadata && f.metadata.size ? (f.metadata.size/1024/1024).toFixed(2) + ' MB' : '—';
    h += '<option value="' + esc(f.name) + '">' + esc(dataStr) + ' · ' + sizeMB + ' · ' + esc(f.name) + '</option>';
  });
  h += '</select></div>';

  h += '<div style="margin-bottom:14px"><label style="font-size:12px;color:#791F1F;font-weight:600">Per confermare, digita esattamente: <code>RIPRISTINA</code></label>';
  h += '<input type="text" id="snap-conferma" placeholder="RIPRISTINA" style="width:100%;font-size:14px;font-family:var(--font-mono);padding:8px 12px;border:1.5px solid #E24B4A;border-radius:8px;background:var(--bg);color:var(--text);margin-top:4px;text-transform:uppercase" />';
  h += '</div>';

  h += '<div style="display:flex;gap:8px">';
  h += '<button class="btn-primary" style="flex:1;background:#A32D2D" onclick="eseguiRipristino()">⛔ Conferma ripristino DB</button>';
  h += '<button onclick="chiudiModalePermessi()" style="padding:10px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer">Annulla</button>';
  h += '</div>';
  apriModal(h);
}

async function eseguiRipristino() {
  var filename = document.getElementById('snap-file').value;
  var conferma = (document.getElementById('snap-conferma').value || '').trim();
  if (conferma !== 'RIPRISTINA') { toast('Devi digitare esattamente "RIPRISTINA" in maiuscolo'); return; }
  if (!filename) { toast('Seleziona uno snapshot'); return; }

  var out = document.getElementById('snapshot-output');
  chiudiModalePermessi();

  // 1. Snapshot di emergenza prima
  if (out) out.innerHTML = '<div style="padding:10px;background:#FAEEDA;border-radius:6px">⏳ STEP 1/2: Creazione snapshot di emergenza prima del ripristino...</div>';
  toast('Step 1/2: snapshot emergenza...');
  try {
    var sResp = await fetch(_BACKUP_FN_URL, { method:'POST', headers:{'Content-Type':'application/json'}, body:'{}' });
    var sData = await sResp.json();
    if (!sData.ok) {
      if (out) out.innerHTML = '<div style="padding:10px;background:#FCEBEB;border-radius:6px;color:#791F1F">❌ Snapshot emergenza fallito. Ripristino ANNULLATO per sicurezza.<br>Errore: ' + esc(sData.error || '') + '</div>';
      toast('Ripristino annullato (snapshot emergenza fallito)');
      return;
    }
  } catch (e) {
    if (out) out.innerHTML = '<div style="padding:10px;background:#FCEBEB;border-radius:6px;color:#791F1F">❌ Snapshot emergenza fallito (rete). Ripristino ANNULLATO.</div>';
    return;
  }

  // 2. Ripristino vero
  if (out) out.innerHTML = '<div style="padding:10px;background:#FAEEDA;border-radius:6px">⏳ STEP 2/2: Ripristino in corso da <code>' + esc(filename) + '</code> (2-5 minuti)...</div>';
  toast('Step 2/2: ripristino in corso...');
  try {
    var rResp = await fetch(_RESTORE_FN_URL, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({ filename: filename, confirm: 'RIPRISTINA' })
    });
    var rData = await rResp.json();
    if (!rData.ok && (!rData.errors || rData.errors.length > 5)) {
      if (out) out.innerHTML = '<div style="padding:10px;background:#FCEBEB;border-radius:6px;color:#791F1F">❌ <strong>Ripristino fallito</strong><br>Errori: ' + (rData.errors||[]).slice(0,5).map(esc).join('<br>') + '<br><br>⚠️ Il DB potrebbe essere in stato inconsistente. Contatta supporto.</div>';
      toast('Ripristino fallito');
      return;
    }
    var msg = '✅ <strong>Ripristino completato</strong><br>';
    msg += 'File: <code>' + esc(filename) + '</code><br>';
    msg += 'Record cancellati: ' + (rData.deleted||0).toLocaleString('it-IT') + '<br>';
    msg += 'Record reinseriti: ' + (rData.inserted||0).toLocaleString('it-IT') + '<br>';
    if (rData.errors && rData.errors.length) {
      msg += '<br><span style="color:#854F0B">⚠️ Avvisi: ' + rData.errors.length + ' (controllare console)</span>';
      console.warn('Errori ripristino:', rData.errors);
    }
    msg += '<br><br><strong>Ricarica la pagina (Ctrl+Shift+R) per vedere i dati ripristinati.</strong>';
    if (out) out.innerHTML = '<div style="padding:12px;background:#EAF3DE;border-radius:6px;color:#27500A">' + msg + '</div>';
    toast('✅ Ripristino completato');
    if (typeof _auditLog === 'function') _auditLog('ripristino_db', 'sistema', filename + ' (' + (rData.inserted||0) + ' record reinseriti)');
  } catch (e) {
    if (out) out.innerHTML = '<div style="padding:10px;background:#FCEBEB;border-radius:6px;color:#791F1F">❌ Errore rete durante ripristino: ' + esc(e.message) + '</div>';
    toast('Errore ripristino');
  }
}

// ── LISTA STORICA SNAPSHOT ──
async function caricaListaSnapshot() {
  if (!_isAdmin()) return;
  var wrap = document.getElementById('snapshot-lista');
  if (!wrap) return;
  wrap.innerHTML = '<div style="font-size:11px;color:var(--text-muted);padding:8px">Carico storico backup...</div>';
  try {
    var { data: files, error } = await sb.storage.from('backups').list('', {
      limit: 50, sortBy: { column: 'created_at', order: 'desc' }
    });
    if (error) throw error;
    var snap = (files||[]).filter(function(f){ return /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(f.name); });
    if (!snap.length) {
      wrap.innerHTML = '<div style="padding:10px;background:var(--bg);border-radius:6px;font-size:11px;color:var(--text-muted)">Nessun backup ancora creato</div>';
      return;
    }
    var html = '<div style="font-size:11px;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.4px;font-weight:500;margin-bottom:6px">📜 Storico backup (' + snap.length + ')</div>';
    html += '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">';
    snap.slice(0, 10).forEach(function(f, i) {
      var dataStr = f.name.replace('backup-','').replace('.json','');
      var sizeMB = f.metadata && f.metadata.size ? (f.metadata.size/1024/1024).toFixed(2) : '—';
      var created = f.created_at ? new Date(f.created_at).toLocaleString('it-IT', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';
      var bgRow = i === 0 ? 'background:#EAF3DE' : '';
      var badge = i === 0 ? '<span style="background:#27500A;color:#EAF3DE;padding:1px 6px;border-radius:4px;font-size:9px;margin-left:6px">PIÙ RECENTE</span>' : '';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border-bottom:0.5px solid var(--border);' + bgRow + '">';
      html += '<div style="flex:1;font-size:12px"><span style="font-family:var(--font-mono);font-weight:500">' + esc(dataStr) + '</span>' + badge;
      html += '<div style="font-size:10px;color:var(--text-muted);margin-top:2px">' + esc(created) + ' · ' + sizeMB + ' MB · <code style="font-size:9px">' + esc(f.name) + '</code></div></div>';
      html += '<button class="btn-edit" style="font-size:11px;padding:4px 10px" onclick="ripristinaSnapshotDiretto(\'' + esc(f.name) + '\')" title="Ripristina questo backup">↶ Ripristina</button>';
      html += '</div>';
    });
    html += '</div>';
    if (snap.length > 10) html += '<div style="font-size:10px;color:var(--text-muted);margin-top:4px">... e altri ' + (snap.length-10) + ' backup più vecchi (retention 30gg)</div>';
    wrap.innerHTML = html;
  } catch(e) {
    wrap.innerHTML = '<div style="padding:10px;background:#FCEBEB;border-radius:6px;color:#791F1F;font-size:11px">❌ Errore lettura backup: ' + esc(e.message) + '</div>';
  }
}

// Wrapper per ripristino diretto da bottone lista (apre stessa modale ma con file pre-selezionato)
async function ripristinaSnapshotDiretto(filename) {
  if (!_isAdmin()) { toast('Solo admin'); return; }
  var h = '<div style="font-size:18px;font-weight:600;margin-bottom:8px;color:#791F1F">⚠️ Ripristina backup: ' + esc(filename) + '</div>';
  h += '<div style="background:#FCEBEB;border:2px solid #E24B4A;padding:14px;border-radius:8px;margin-bottom:14px;font-size:13px;line-height:1.6">';
  h += '<strong style="color:#791F1F">⛔ ATTENZIONE — OPERAZIONE DISTRUTTIVA</strong><br><br>';
  h += '• <strong>TUTTI</strong> i dati attuali del database (47 tabelle) verranno <strong>CANCELLATI</strong><br>';
  h += '• Verranno sostituiti con i dati di <code>' + esc(filename) + '</code><br>';
  h += '• <strong>Tutti i dati inseriti dopo il backup andranno persi</strong><br>';
  h += '• L\'operazione richiede 2-5 minuti<br><br>';
  h += '<strong style="color:#791F1F">Verrà creato uno snapshot di emergenza PRIMA del ripristino.</strong>';
  h += '</div>';
  h += '<input type="hidden" id="snap-file" value="' + esc(filename) + '" />';
  h += '<div style="margin-bottom:14px"><label style="font-size:12px;color:#791F1F;font-weight:600">Per confermare, digita esattamente: <code>RIPRISTINA</code></label>';
  h += '<input type="text" id="snap-conferma" placeholder="RIPRISTINA" style="width:100%;font-size:14px;font-family:var(--font-mono);padding:8px 12px;border:1.5px solid #E24B4A;border-radius:8px;background:var(--bg);color:var(--text);margin-top:4px;text-transform:uppercase" />';
  h += '</div>';
  h += '<div style="display:flex;gap:8px">';
  h += '<button class="btn-primary" style="flex:1;background:#A32D2D" onclick="eseguiRipristino()">⛔ Conferma ripristino DB</button>';
  h += '<button onclick="chiudiModalePermessi()" style="padding:10px 18px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);cursor:pointer">Annulla</button>';
  h += '</div>';
  apriModal(h);
}

// Auto-load lista snapshot quando si apre la sezione admin
(function() {
  function _maybeLoad() {
    if (document.getElementById('snapshot-lista') && _isAdmin()) {
      caricaListaSnapshot();
    }
  }
  // Aggancio: quando l'utente clicca un nav-item che porta in admin
  document.addEventListener('click', function(e) {
    var n = e.target && e.target.closest && e.target.closest('.nav-item');
    if (n && /utenti|admin/i.test(n.textContent || '')) {
      setTimeout(_maybeLoad, 400);
    }
  });
  // Anche al primo caricamento se siamo già su admin
  document.addEventListener('DOMContentLoaded', function() {
    setTimeout(_maybeLoad, 1500);
  });
})();
