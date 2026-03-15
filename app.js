// ── SUPABASE ─────────────────────────────────────────────────────
const SUPABASE_URL = 'https://jpugeakgpitbxdswbucj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xMFZND8_vBl5Z5eEA-2guA_kVME1Iz-';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DATA ─────────────────────────────────────────────────────────
const oggi = new Date();
const oggiISO = oggi.toISOString().split('T')[0];
const giorni = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const mesi = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
document.getElementById('topbar-date').textContent = giorni[oggi.getDay()] + ' ' + oggi.getDate() + ' ' + mesi[oggi.getMonth()] + ' ' + oggi.getFullYear();
document.getElementById('pr-data').value = oggiISO;
document.getElementById('ord-data').value = oggiISO;
document.getElementById('filtro-data-prezzi').value = oggiISO;

// ── NAVIGAZIONE ──────────────────────────────────────────────────
const titles = { dashboard:'Dashboard', ordini:'Ordini', prezzi:'Prezzi giornalieri', giacenze:'Giacenze cisterne', consegne:'Consegne', vendite:'Vendite', clienti:'Clienti', fornitori:'Fornitori', basi:'Basi di carico' };
function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  el.classList.add('active');
  document.getElementById('page-title').textContent = titles[id];
  const loaders = { prezzi: caricaPrezzi, ordini: caricaOrdini, giacenze: caricaGiacenze, consegne: caricaConsegne, vendite: caricaVendite, clienti: caricaClienti, fornitori: caricaFornitori, basi: caricaBasi };
  if (loaders[id]) loaders[id]();
}

// ── TOAST ────────────────────────────────────────────────────────
function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('show');
  setTimeout(() => t.classList.remove('show'), 3000);
}

// ── UTILITÀ ──────────────────────────────────────────────────────
function fmt(n) { return '€ ' + Number(n).toFixed(4); }
function fmtE(n) { return '€ ' + Number(n).toFixed(2); }
function fmtL(n) { return Number(n).toLocaleString('it-IT') + ' L'; }
function badgeStato(stato) {
  const map = { 'confermato':'green', 'in attesa':'amber', 'annullato':'red', 'programmato':'blue', 'cliente':'blue', 'deposito':'gray' };
  return `<span class="badge ${map[stato] || 'amber'}">${stato}</span>`;
}
function prezzoNoIva(r) { return Number(r.costo_litro) + Number(r.trasporto_litro) + Number(r.margine); }
function prezzoConIva(r) { return prezzoNoIva(r) * (1 + Number(r.iva) / 100); }

// ── CACHE ANAGRAFICHE ─────────────────────────────────────────────
let cacheClienti = [], cacheFornitori = [], cacheBasi = [];

async function caricaSelectFornitori(selectId) {
  const { data } = await sb.from('fornitori').select('id,nome').eq('attivo', true).order('nome');
  cacheFornitori = data || [];
  const sel = document.getElementById(selectId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Seleziona...</option>' + cacheFornitori.map(f => `<option value="${f.id}">${f.nome}</option>`).join('');
  if (cur) sel.value = cur;
}

async function caricaSelectClienti(selectId) {
  const { data } = await sb.from('clienti').select('id,nome').eq('attivo', true).order('nome');
  cacheClienti = data || [];
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleziona...</option>' + cacheClienti.map(c => `<option value="${c.id}">${c.nome}</option>`).join('');
}

async function caricaSelectBasi(selectId) {
  const { data } = await sb.from('basi_carico').select('id,nome').eq('attivo', true).order('nome');
  cacheBasi = data || [];
  const sel = document.getElementById(selectId);
  if (!sel) return;
  sel.innerHTML = '<option value="">Seleziona...</option>' + cacheBasi.map(b => `<option value="${b.id}">${b.nome}</option>`).join('');
}

async function caricaBasiPerFornitore() {
  const fornitoreId = document.getElementById('pr-fornitore').value;
  const sel = document.getElementById('pr-base');
  if (!fornitoreId) { sel.innerHTML = '<option value="">Seleziona...</option>'; return; }
  const { data } = await sb.from('fornitori_basi').select('base_carico_id, basi_carico(id,nome)').eq('fornitore_id', fornitoreId);
  sel.innerHTML = '<option value="">Seleziona...</option>';
  if (data) data.forEach(r => { if (r.basi_carico) sel.innerHTML += `<option value="${r.basi_carico.id}">${r.basi_carico.nome}</option>`; });
}

// ── FIDO FORNITORE ────────────────────────────────────────────────
async function calcolaFidoFornitore(fornitoreId, fidoMassimo, giorniPagamento) {
  const oggi = new Date();
  const { data: ordini } = await sb.from('ordini').select('*').eq('fornitore', fornitoreId);
  if (!ordini) return { usato: 0, residuo: fidoMassimo };
  let usato = 0;
  ordini.forEach(o => {
    const dataOrdine = new Date(o.data);
    const scadenza = new Date(dataOrdine);
    scadenza.setDate(scadenza.getDate() + (o.giorni_pagamento || giorniPagamento || 30));
    if (scadenza > oggi) {
      usato += prezzoConIva(o) * Number(o.litri);
    }
  });
  return { usato: usato, residuo: fidoMassimo - usato };
}

function fidoBar(usato, massimo) {
  if (!massimo || massimo === 0) return '—';
  const pct = Math.min(100, Math.round((usato / massimo) * 100));
  const cls = pct < 60 ? 'fido-ok' : pct < 85 ? 'fido-warn' : 'fido-danger';
  return `<div class="fido-bar-wrap"><div class="fido-bar"><div class="fido-fill ${cls}" style="width:${pct}%"></div></div><span style="font-size:11px;font-family:var(--font-mono);white-space:nowrap">${pct}%</span></div>`;
}

// ── PREZZI ────────────────────────────────────────────────────────
function aggiornaPrev() {
  const c = parseFloat(document.getElementById('pr-costo').value) || 0;
  const t = parseFloat(document.getElementById('pr-trasporto').value) || 0;
  const m = parseFloat(document.getElementById('pr-margine').value) || 0;
  const iva = parseInt(document.getElementById('pr-iva').value) || 22;
  const noiva = c + t + m;
  document.getElementById('calc-noiva').textContent = '€ ' + noiva.toFixed(4);
  document.getElementById('calc-iva').textContent = '€ ' + (noiva * (1 + iva / 100)).toFixed(4);
}

async function salvaPrezzo() {
  const fornitoreId = document.getElementById('pr-fornitore').value;
  const fornitoreNome = document.getElementById('pr-fornitore').options[document.getElementById('pr-fornitore').selectedIndex]?.text;
  const baseId = document.getElementById('pr-base').value || null;
  const data = {
    data: document.getElementById('pr-data').value,
    fornitore: fornitoreNome,
    fornitore_id: fornitoreId || null,
    base_carico_id: baseId,
    prodotto: document.getElementById('pr-prodotto').value,
    costo_litro: parseFloat(document.getElementById('pr-costo').value),
    trasporto_litro: parseFloat(document.getElementById('pr-trasporto').value),
    margine: parseFloat(document.getElementById('pr-margine').value),
    iva: parseInt(document.getElementById('pr-iva').value)
  };
  if (!data.data || !data.fornitore || !data.prodotto || isNaN(data.costo_litro)) { toast('⚠ Compila tutti i campi'); return; }
  const { error } = await sb.from('prezzi').insert([data]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Prezzo salvato!');
  caricaPrezzi();
}

async function caricaPrezzi() {
  await caricaSelectFornitori('pr-fornitore');
  const filtroData = document.getElementById('filtro-data-prezzi').value;
  let query = sb.from('prezzi').select('*, basi_carico(nome)').order('data', { ascending: false }).order('fornitore');
  if (filtroData) query = query.eq('data', filtroData);
  const { data } = await query;
  const tbody = document.getElementById('tabella-prezzi');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="10" class="loading">Nessun prezzo trovato</td></tr>'; return; }
  const best = {};
  data.forEach(r => { const k = r.data + '_' + r.prodotto; if (!best[k] || prezzoNoIva(r) < prezzoNoIva(best[k])) best[k] = r; });
  tbody.innerHTML = data.map(r => {
    const k = r.data + '_' + r.prodotto;
    const isBest = best[k] && best[k].id === r.id;
    const basNome = r.basi_carico ? r.basi_carico.nome : '—';
    return `<tr>
      <td>${r.data}</td><td>${r.fornitore}</td><td>${basNome}</td><td>${r.prodotto}</td>
      <td style="font-family:var(--font-mono)">${fmt(r.costo_litro)}</td>
      <td class="editable" onclick="editaCella(this,'prezzi','trasporto_litro','${r.id}',${r.trasporto_litro})" style="font-family:var(--font-mono)">${fmt(r.trasporto_litro)}</td>
      <td class="editable" onclick="editaCella(this,'prezzi','margine','${r.id}',${r.margine})" style="font-family:var(--font-mono)">${fmt(r.margine)}</td>
      <td style="font-family:var(--font-mono)">${fmt(prezzoNoIva(r))}</td>
      <td style="font-family:var(--font-mono)">${fmt(prezzoConIva(r))}</td>
      <td>${isBest ? '<span class="badge green" style="font-size:9px">Best</span>' : ''} <button class="btn-danger" onclick="eliminaRecord('prezzi','${r.id}',caricaPrezzi)">×</button></td>
    </tr>`;
  }).join('');
}

// ── ORDINI ────────────────────────────────────────────────────────
let prezzoCorrente = null;

function toggleTipoOrdine() {
  const tipo = document.getElementById('ord-tipo').value;
  document.getElementById('grp-cliente').style.display = tipo === 'cliente' ? '' : 'none';
}

async function caricaPrezzoPerOrdine() {
  const data = document.getElementById('ord-data').value;
  const fornitoreId = document.getElementById('ord-fornitore').value;
  const fornitoreNome = document.getElementById('ord-fornitore').options[document.getElementById('ord-fornitore').selectedIndex]?.text;
  const prodotto = document.getElementById('ord-prodotto').value;
  if (!data || !fornitoreId || !prodotto) return;
  const { data: rows } = await sb.from('prezzi').select('*').eq('data', data).eq('fornitore', fornitoreNome).eq('prodotto', prodotto).limit(1);
  if (rows && rows.length) {
    prezzoCorrente = rows[0];
    document.getElementById('prev-costo').textContent = fmt(prezzoCorrente.costo_litro);
    document.getElementById('prev-trasporto').textContent = fmt(prezzoCorrente.trasporto_litro);
    document.getElementById('prev-margine').textContent = fmt(prezzoCorrente.margine);
    aggiornaPrevOrdine();
    verificaFido(fornitoreId);
  } else {
    prezzoCorrente = null;
    document.getElementById('prev-costo').textContent = '⚠ Nessun prezzo per questa data';
    ['prev-trasporto','prev-margine','prev-prezzo','prev-totale'].forEach(id => document.getElementById(id).textContent = '—');
  }
}

async function verificaFido(fornitoreId) {
  const { data: fo } = await sb.from('fornitori').select('fido_massimo,giorni_pagamento').eq('id', fornitoreId).single();
  if (!fo || !fo.fido_massimo) return;
  const { residuo } = await calcolaFidoFornitore(fornitoreId, fo.fido_massimo, fo.giorni_pagamento);
  const litri = parseFloat(document.getElementById('ord-litri').value) || 0;
  const totaleOrdine = prezzoCorrente ? prezzoConIva(prezzoCorrente) * litri : 0;
  const warn = document.getElementById('prev-fido-warn');
  warn.style.display = totaleOrdine > residuo ? '' : 'none';
}

function aggiornaPrevOrdine() {
  if (!prezzoCorrente) return;
  const litri = parseFloat(document.getElementById('ord-litri').value) || 0;
  const pL = prezzoConIva(prezzoCorrente);
  document.getElementById('prev-prezzo').textContent = fmt(pL);
  document.getElementById('prev-totale').textContent = fmtE(pL * litri);
}

async function salvaOrdine() {
  if (!prezzoCorrente) { toast('⚠ Seleziona data/fornitore/prodotto con prezzo disponibile'); return; }
  const litri = parseFloat(document.getElementById('ord-litri').value);
  const tipo = document.getElementById('ord-tipo').value;
  const clienteId = document.getElementById('ord-cliente').value;
  const clienteNome = cacheClienti.find(c => c.id === clienteId)?.nome || 'Deposito';
  if (tipo === 'cliente' && !clienteId) { toast('⚠ Seleziona un cliente'); return; }
  if (!litri) { toast('⚠ Inserisci i litri'); return; }
  const ggPag = parseInt(document.getElementById('ord-gg').value);
  const dataOrdine = new Date(document.getElementById('ord-data').value);
  const dataScadenza = new Date(dataOrdine);
  dataScadenza.setDate(dataScadenza.getDate() + ggPag);
  const record = {
    data: document.getElementById('ord-data').value,
    tipo_ordine: tipo,
    cliente: clienteNome,
    prodotto: prezzoCorrente.prodotto,
    litri,
    fornitore: prezzoCorrente.fornitore,
    costo_litro: prezzoCorrente.costo_litro,
    trasporto_litro: prezzoCorrente.trasporto_litro,
    margine: prezzoCorrente.margine,
    iva: prezzoCorrente.iva,
    base_carico_id: document.getElementById('ord-base').value || null,
    trasportatore: document.getElementById('ord-trasportatore').value,
    giorni_pagamento: ggPag,
    data_scadenza: dataScadenza.toISOString().split('T')[0],
    stato: document.getElementById('ord-stato').value,
    note: document.getElementById('ord-note').value
  };
  const { error } = await sb.from('ordini').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Ordine salvato!');
  caricaOrdini();
  caricaDashboard();
}

async function caricaOrdini() {
  await caricaSelectFornitori('ord-fornitore');
  await caricaSelectClienti('ord-cliente');
  await caricaSelectBasi('ord-base');
  const { data } = await sb.from('ordini').select('*, basi_carico(nome)').order('data', { ascending: false }).order('created_at', { ascending: false });
  const tbody = document.getElementById('tabella-ordini');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="14" class="loading">Nessun ordine</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const pL = prezzoConIva(r);
    const totale = pL * r.litri;
    const basNome = r.basi_carico ? r.basi_carico.nome : '—';
    return `<tr>
      <td>${r.data}</td>
      <td>${badgeStato(r.tipo_ordine || 'cliente')}</td>
      <td>${r.cliente}</td>
      <td>${r.prodotto}</td>
      <td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td>
      <td>${r.fornitore}</td>
      <td>${basNome}</td>
      <td class="editable" onclick="editaCella(this,'ordini','trasporto_litro','${r.id}',${r.trasporto_litro})" style="font-family:var(--font-mono)">${fmt(r.trasporto_litro)}</td>
      <td class="editable" onclick="editaCella(this,'ordini','margine','${r.id}',${r.margine})" style="font-family:var(--font-mono)">${fmt(r.margine)}</td>
      <td style="font-family:var(--font-mono)">${fmt(pL)}</td>
      <td style="font-family:var(--font-mono)">${fmtE(totale)}</td>
      <td style="font-size:11px;color:var(--text-hint)">${r.data_scadenza || '—'}</td>
      <td>${badgeStato(r.stato)}</td>
      <td><button class="btn-danger" onclick="eliminaRecord('ordini','${r.id}',caricaOrdini)">×</button></td>
    </tr>`;
  }).join('');
}

// ── MODIFICA INLINE ───────────────────────────────────────────────
async function editaCella(td, tabella, campo, id, valoreAttuale) {
  const input = document.createElement('input');
  input.className = 'inline-edit';
  input.type = 'number'; input.step = '0.0001'; input.value = valoreAttuale;
  td.innerHTML = ''; td.appendChild(input); input.focus();
  input.onblur = async () => {
    const nv = parseFloat(input.value);
    if (!isNaN(nv)) { const { error } = await sb.from(tabella).update({ [campo]: nv }).eq('id', id); if (!error) toast('✅ Aggiornato!'); else toast('Errore salvataggio'); }
    if (tabella === 'ordini') caricaOrdini(); else caricaPrezzi();
  };
  input.onkeydown = e => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { if (tabella === 'ordini') caricaOrdini(); else caricaPrezzi(); } };
}

async function eliminaRecord(tabella, id, callback) {
  if (!confirm('Eliminare questo record?')) return;
  await sb.from(tabella).delete().eq('id', id);
  toast('🗑 Eliminato');
  callback();
}

// ── GIACENZE ─────────────────────────────────────────────────────
async function caricaGiacenze() {
  const { data } = await sb.from('cisterne').select('*').order('tipo').order('nome');
  if (!data) return;
  renderCisterne('cis-autotrazione', data.filter(c => c.tipo === 'autotrazione'));
  renderCisterne('cis-agricolo', data.filter(c => c.tipo === 'agricolo'));
}
function renderCisterne(elId, cisterne) {
  const el = document.getElementById(elId);
  const colori = ['#D85A30','#378ADD','#639922','#BA7517','#E24B4A'];
  let html = '<div class="cisterne">', alerts = [];
  cisterne.forEach((c, i) => {
    const pct = Math.round((c.livello_attuale / c.capacita_max) * 100);
    if (pct < 30) alerts.push(c.nome);
    html += `<div class="cis-row"><span class="cis-label">${c.nome}</span><div class="cis-bar"><div class="cis-fill" style="width:${pct}%;background:${colori[i%colori.length]}"><span class="cis-pct">${pct}%</span></div></div><span class="cis-val">${Number(c.livello_attuale).toLocaleString('it-IT')} L</span></div>`;
  });
  html += '</div>';
  if (alerts.length) html += `<div class="alert-box">⚠ Sotto soglia: ${alerts.join(', ')}</div>`;
  el.innerHTML = html;
}

// ── CONSEGNE ─────────────────────────────────────────────────────
async function caricaConsegne() {
  const { data } = await sb.from('ordini').select('*').eq('data', oggiISO).order('created_at');
  const tbody = document.getElementById('tabella-consegne');
  if (!data || !data.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessun ordine oggi</td></tr>';
    ['tot-consegne','tot-completate','tot-inattesa','tot-programmati'].forEach(id => document.getElementById(id).textContent = '0');
    return;
  }
  document.getElementById('tot-consegne').textContent = data.length;
  document.getElementById('tot-completate').textContent = data.filter(r => r.stato === 'confermato').length;
  document.getElementById('tot-inattesa').textContent = data.filter(r => r.stato === 'in attesa').length;
  document.getElementById('tot-programmati').textContent = data.filter(r => r.stato === 'programmato').length;
  tbody.innerHTML = data.map(r => `<tr><td>${r.data}</td><td>${r.cliente}</td><td>${r.prodotto}</td><td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td><td>${r.fornitore}</td><td style="font-family:var(--font-mono)">${fmtE(prezzoConIva(r)*r.litri)}</td><td>${badgeStato(r.stato)}</td></tr>`).join('');
}

// ── VENDITE ──────────────────────────────────────────────────────
async function caricaVendite() {
  const inizio = new Date(oggi.getFullYear(), oggi.getMonth(), 1).toISOString().split('T')[0];
  const { data } = await sb.from('ordini').select('*').gte('data', inizio);
  if (!data) return;
  let fatturato = 0, litri = 0, margine = 0;
  const perFornitore = {};
  data.forEach(r => {
    const tot = prezzoConIva(r) * r.litri, marg = Number(r.margine) * Number(r.litri);
    fatturato += tot; litri += Number(r.litri); margine += marg;
    if (!perFornitore[r.fornitore]) perFornitore[r.fornitore] = { litri:0, fatturato:0, margine:0 };
    perFornitore[r.fornitore].litri += Number(r.litri);
    perFornitore[r.fornitore].fatturato += tot;
    perFornitore[r.fornitore].margine += marg;
  });
  document.getElementById('vend-fatturato').textContent = fmtE(fatturato);
  document.getElementById('vend-litri').textContent = fmtL(litri);
  document.getElementById('vend-margine').textContent = fmtE(margine);
  document.getElementById('vend-ordini').textContent = data.length;
  const tbody = document.getElementById('tabella-vendite');
  const righe = Object.entries(perFornitore).sort((a,b) => b[1].fatturato - a[1].fatturato);
  tbody.innerHTML = righe.length ? righe.map(([f,v]) => `<tr><td>${f}</td><td style="font-family:var(--font-mono)">${fmtL(v.litri)}</td><td style="font-family:var(--font-mono)">${fmtE(v.fatturato)}</td><td style="font-family:var(--font-mono)">${fmtE(v.margine)}</td></tr>`).join('') : '<tr><td colspan="4" class="loading">Nessun dato</td></tr>';
}

// ── CLIENTI ───────────────────────────────────────────────────────
async function salvaCliente() {
  const record = { nome: document.getElementById('cl-nome').value.trim(), tipo: document.getElementById('cl-tipo').value, piva: document.getElementById('cl-piva').value, codice_fiscale: document.getElementById('cl-cf').value, indirizzo: document.getElementById('cl-indirizzo').value, citta: document.getElementById('cl-citta').value, provincia: document.getElementById('cl-provincia').value, telefono: document.getElementById('cl-telefono').value, email: document.getElementById('cl-email').value, fido_massimo: parseFloat(document.getElementById('cl-fido').value) || 0, giorni_pagamento: parseInt(document.getElementById('cl-gg').value), zona_consegna: document.getElementById('cl-zona').value, prodotti_abituali: document.getElementById('cl-prodotti').value, note: document.getElementById('cl-note').value };
  if (!record.nome) { toast('⚠ Inserisci il nome'); return; }
  const { error } = await sb.from('clienti').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Cliente salvato!');
  caricaClienti();
}

async function caricaClienti() {
  const { data } = await sb.from('clienti').select('*').order('nome');
  const tbody = document.getElementById('tabella-clienti');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="11" class="loading">Nessun cliente</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const fido = r.fido_massimo || 0;
    return `<tr>
      <td><strong>${r.nome}</strong></td>
      <td><span class="badge blue">${r.tipo || 'azienda'}</span></td>
      <td style="font-size:11px;color:var(--text-muted)">${r.piva || '—'}</td>
      <td>${r.citta || '—'}</td>
      <td>${r.telefono || '—'}</td>
      <td style="font-family:var(--font-mono)">${fido > 0 ? fmtE(fido) : '—'}</td>
      <td style="font-family:var(--font-mono)">${fido > 0 ? fmtE(fido) : '—'}</td>
      <td>${r.giorni_pagamento || 30} gg</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.prodotti_abituali || '—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.note || '—'}</td>
      <td><button class="btn-danger" onclick="eliminaRecord('clienti','${r.id}',caricaClienti)">×</button></td>
    </tr>`;
  }).join('');
}

// ── FORNITORI ─────────────────────────────────────────────────────
async function salvaFornitore() {
  const record = { nome: document.getElementById('fo-nome').value.trim(), ragione_sociale: document.getElementById('fo-ragione').value, piva: document.getElementById('fo-piva').value, indirizzo: document.getElementById('fo-indirizzo').value, citta: document.getElementById('fo-citta').value, telefono: document.getElementById('fo-telefono').value, email: document.getElementById('fo-email').value, contatto: document.getElementById('fo-contatto').value, fido_massimo: parseFloat(document.getElementById('fo-fido').value) || 0, giorni_pagamento: parseInt(document.getElementById('fo-gg').value), note: document.getElementById('fo-note').value };
  if (!record.nome) { toast('⚠ Inserisci il nome'); return; }
  const { error } = await sb.from('fornitori').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Fornitore salvato!');
  caricaFornitori();
}

async function caricaFornitori() {
  const { data } = await sb.from('fornitori').select('*, fornitori_basi(base_carico_id, basi_carico(nome))').order('nome');
  const tbody = document.getElementById('tabella-fornitori');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="12" class="loading">Nessun fornitore</td></tr>'; return; }

  const rows = await Promise.all(data.map(async r => {
    const fido = r.fido_massimo || 0;
    const { usato, residuo } = await calcolaFidoFornitore(r.id, fido, r.giorni_pagamento);
    const basi = r.fornitori_basi ? r.fornitori_basi.map(fb => fb.basi_carico?.nome).filter(Boolean).join(', ') : '—';
    const pctUsato = fido > 0 ? Math.min(100, Math.round((usato / fido) * 100)) : 0;
    return `<tr>
      <td><strong>${r.nome}</strong></td>
      <td style="font-size:11px;color:var(--text-muted)">${r.piva || '—'}</td>
      <td>${r.citta || '—'}</td>
      <td>${r.contatto || '—'}</td>
      <td>${r.telefono || '—'}</td>
      <td style="font-family:var(--font-mono)">${fido > 0 ? fmtE(fido) : '—'}</td>
      <td style="font-family:var(--font-mono)">${fido > 0 ? fmtE(usato) : '—'}</td>
      <td>${fido > 0 ? fidoBar(usato, fido) + ' <span style="font-size:11px;font-family:var(--font-mono)">' + fmtE(residuo) + '</span>' : '—'}</td>
      <td>${r.giorni_pagamento || 30} gg</td>
      <td style="font-size:11px;color:var(--text-muted)">${basi}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.note || '—'}</td>
      <td><button class="btn-danger" onclick="eliminaRecord('fornitori','${r.id}',caricaFornitori)">×</button></td>
    </tr>`;
  }));
  tbody.innerHTML = rows.join('');
}

// ── BASI DI CARICO ────────────────────────────────────────────────
async function salvaBasi() {
  const record = { nome: document.getElementById('ba-nome').value.trim(), indirizzo: document.getElementById('ba-indirizzo').value, citta: document.getElementById('ba-citta').value, provincia: document.getElementById('ba-provincia').value, note: document.getElementById('ba-note').value };
  if (!record.nome) { toast('⚠ Inserisci il nome della base'); return; }
  const { error } = await sb.from('basi_carico').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Base salvata!');
  caricaBasi();
}

async function caricaBasi() {
  const { data } = await sb.from('basi_carico').select('*, fornitori_basi(fornitore_id, fornitori(nome))').order('nome');
  const tbody = document.getElementById('tabella-basi');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessuna base di carico</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const fornitori = r.fornitori_basi ? r.fornitori_basi.map(fb => fb.fornitori?.nome).filter(Boolean).join(', ') : '—';
    return `<tr>
      <td><strong>${r.nome}</strong></td>
      <td>${r.indirizzo || '—'}</td>
      <td>${r.citta || '—'}</td>
      <td style="font-size:11px;color:var(--text-muted)">${fornitori}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.note || '—'}</td>
      <td><button class="btn-danger" onclick="eliminaRecord('basi_carico','${r.id}',caricaBasi)">×</button></td>
    </tr>`;
  }).join('');
}

// ── DASHBOARD ─────────────────────────────────────────────────────
async function caricaDashboard() {
  const { data } = await sb.from('ordini').select('*').eq('data', oggiISO);
  if (!data) return;
  let fatturato = 0, litri = 0, margine = 0;
  data.forEach(r => { fatturato += prezzoConIva(r)*r.litri; litri += Number(r.litri); margine += Number(r.margine); });
  document.getElementById('kpi-fatturato').textContent = fmtE(fatturato);
  document.getElementById('kpi-litri').textContent = fmtL(litri);
  document.getElementById('kpi-margine').textContent = data.length ? '€ ' + (margine/data.length).toFixed(4)+'/L' : '—';
  document.getElementById('kpi-ordini').textContent = data.length;
  const { data: recenti } = await sb.from('ordini').select('*').order('created_at', { ascending: false }).limit(5);
  const tbody = document.getElementById('dashboard-ordini');
  tbody.innerHTML = recenti && recenti.length ? recenti.map(r => `<tr><td>${r.data}</td><td>${r.cliente}</td><td>${r.prodotto}</td><td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td><td style="font-family:var(--font-mono)">${fmtE(prezzoConIva(r)*r.litri)}</td><td>${badgeStato(r.stato)}</td></tr>`).join('') : '<tr><td colspan="6" class="loading">Nessun ordine</td></tr>';
}

// ── AVVIO ─────────────────────────────────────────────────────────
caricaDashboard();
