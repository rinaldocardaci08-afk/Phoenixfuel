// PhoenixFuel — Admin, Permessi, Utenti, Giacenze
// ── PERMESSI ──────────────────────────────────────────────────────
const SEZIONI_SISTEMA = [
  {id:'dashboard',label:'Dashboard',icon:'▦'},{id:'ordini',label:'Ordini',icon:'📋'},
  {id:'prezzi',label:'Prezzi giornalieri',icon:'💰'},{id:'deposito',label:'Deposito',icon:'🏗'},
  {id:'consegne',label:'Consegne',icon:'🚚'},{id:'vendite',label:'Vendite',icon:'📊'},
  {id:'clienti',label:'Clienti',icon:'👤'},{id:'fornitori',label:'Fornitori',icon:'🏭'},
  {id:'basi',label:'Basi di carico',icon:'📍'},{id:'prodotti',label:'Prodotti',icon:'📦'},{id:'logistica',label:'Logistica',icon:'🚛'},{id:'stazione',label:'Stazione Oppido',icon:'⛽'},{id:'bacheca',label:'Bacheca avvisi',icon:'🔔'},{id:'benchmark',label:'Benchmark mercato',icon:'📈'},
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

