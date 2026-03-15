// ── CONFIGURAZIONE SUPABASE ──────────────────────────────────────
const SUPABASE_URL = 'https://jpugeakgpitbxdswbucj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xMFZND8_vBl5Z5eEA-2guA_kVME1Iz-';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DATA CORRENTE ────────────────────────────────────────────────
const oggi = new Date();
const oggiISO = oggi.toISOString().split('T')[0];
const giorni = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const mesi = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
document.getElementById('topbar-date').textContent =
  giorni[oggi.getDay()] + ' ' + oggi.getDate() + ' ' + mesi[oggi.getMonth()] + ' ' + oggi.getFullYear();

// Imposta date default nei form
document.getElementById('pr-data').value = oggiISO;
document.getElementById('ord-data').value = oggiISO;
document.getElementById('filtro-data-prezzi').value = oggiISO;

// ── NAVIGAZIONE ──────────────────────────────────────────────────
const titles = { dashboard:'Dashboard', ordini:'Ordini', prezzi:'Prezzi giornalieri', giacenze:'Giacenze cisterne', consegne:'Consegne', vendite:'Vendite' };
function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  el.classList.add('active');
  document.getElementById('page-title').textContent = titles[id];
  if (id === 'prezzi') caricaPrezzi();
  if (id === 'ordini') caricaOrdini();
  if (id === 'giacenze') caricaGiacenze();
  if (id === 'consegne') caricaConsegne();
  if (id === 'vendite') caricaVendite();
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
  const map = { 'confermato':'green', 'in attesa':'amber', 'annullato':'red', 'programmato':'blue' };
  return `<span class="badge ${map[stato] || 'amber'}">${stato}</span>`;
}
function prezzoNoIva(r) { return Number(r.costo_litro) + Number(r.trasporto_litro) + Number(r.margine); }
function prezzoConIva(r) { return prezzoNoIva(r) * (1 + Number(r.iva) / 100); }

// ── PREZZI GIORNALIERI ───────────────────────────────────────────
function aggiornaPrev() {
  const c = parseFloat(document.getElementById('pr-costo').value) || 0;
  const t = parseFloat(document.getElementById('pr-trasporto').value) || 0;
  const m = parseFloat(document.getElementById('pr-margine').value) || 0;
  const iva = parseInt(document.getElementById('pr-iva').value) || 22;
  const noiva = c + t + m;
  const coniva = noiva * (1 + iva / 100);
  document.getElementById('calc-noiva').textContent = '€ ' + noiva.toFixed(4);
  document.getElementById('calc-iva').textContent = '€ ' + coniva.toFixed(4);
}

async function salvaPrezzo() {
  const data = { data: document.getElementById('pr-data').value, fornitore: document.getElementById('pr-fornitore').value, prodotto: document.getElementById('pr-prodotto').value, costo_litro: parseFloat(document.getElementById('pr-costo').value), trasporto_litro: parseFloat(document.getElementById('pr-trasporto').value), margine: parseFloat(document.getElementById('pr-margine').value), iva: parseInt(document.getElementById('pr-iva').value) };
  if (!data.data || !data.fornitore || !data.prodotto || isNaN(data.costo_litro)) { toast('⚠ Compila tutti i campi obbligatori'); return; }
  const { error } = await sb.from('prezzi').insert([data]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Prezzo salvato!');
  caricaPrezzi();
}

async function caricaPrezzi() {
  const filtroData = document.getElementById('filtro-data-prezzi').value;
  let query = sb.from('prezzi').select('*').order('data', { ascending: false }).order('fornitore');
  if (filtroData) query = query.eq('data', filtroData);
  const { data, error } = await query;
  const tbody = document.getElementById('tabella-prezzi');
  if (error || !data.length) { tbody.innerHTML = '<tr><td colspan="9" class="loading">Nessun prezzo trovato</td></tr>'; return; }
  
  // Trova best price per prodotto/data
  const best = {};
  data.forEach(r => {
    const k = r.data + '_' + r.prodotto;
    if (!best[k] || prezzoNoIva(r) < prezzoNoIva(best[k])) best[k] = r;
  });

  tbody.innerHTML = data.map(r => {
    const k = r.data + '_' + r.prodotto;
    const isBest = best[k] && best[k].id === r.id;
    return `<tr>
      <td>${r.data}</td>
      <td>${r.fornitore}</td>
      <td>${r.prodotto}</td>
      <td style="font-family:var(--font-mono)">${fmt(r.costo_litro)}</td>
      <td class="editable" onclick="editaCella(this,'prezzi','trasporto_litro','${r.id}',${r.trasporto_litro})" style="font-family:var(--font-mono)">${fmt(r.trasporto_litro)}</td>
      <td class="editable" onclick="editaCella(this,'prezzi','margine','${r.id}',${r.margine})" style="font-family:var(--font-mono)">${fmt(r.margine)}</td>
      <td style="font-family:var(--font-mono)">${fmt(prezzoNoIva(r))}</td>
      <td style="font-family:var(--font-mono)">${fmt(prezzoConIva(r))}</td>
      <td>${isBest ? '<span class="badge best">Best</span>' : ''} <button class="btn-danger" onclick="eliminaRecord('prezzi','${r.id}',caricaPrezzi)">×</button></td>
    </tr>`;
  }).join('');
}

// ── ORDINI ───────────────────────────────────────────────────────
let prezzoCorrente = null;

async function caricaPrezzoPerOrdine() {
  const data = document.getElementById('ord-data').value;
  const fornitore = document.getElementById('ord-fornitore').value;
  const prodotto = document.getElementById('ord-prodotto').value;
  if (!data || !fornitore || !prodotto) return;
  const { data: rows } = await sb.from('prezzi').select('*').eq('data', data).eq('fornitore', fornitore).eq('prodotto', prodotto).limit(1);
  if (rows && rows.length) {
    prezzoCorrente = rows[0];
    document.getElementById('prev-costo').textContent = fmt(prezzoCorrente.costo_litro);
    document.getElementById('prev-trasporto').textContent = fmt(prezzoCorrente.trasporto_litro);
    document.getElementById('prev-margine').textContent = fmt(prezzoCorrente.margine);
    aggiornaPrevOrdine();
  } else {
    prezzoCorrente = null;
    document.getElementById('prev-costo').textContent = '⚠ Nessun prezzo per questa data';
    document.getElementById('prev-trasporto').textContent = '—';
    document.getElementById('prev-margine').textContent = '—';
    document.getElementById('prev-prezzo').textContent = '—';
    document.getElementById('prev-totale').textContent = '—';
  }
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
  const cliente = document.getElementById('ord-cliente').value.trim();
  if (!cliente || !litri) { toast('⚠ Compila cliente e litri'); return; }
  const data = {
    data: document.getElementById('ord-data').value,
    cliente,
    prodotto: prezzoCorrente.prodotto,
    litri,
    fornitore: prezzoCorrente.fornitore,
    costo_litro: prezzoCorrente.costo_litro,
    trasporto_litro: prezzoCorrente.trasporto_litro,
    margine: prezzoCorrente.margine,
    iva: prezzoCorrente.iva,
    stato: document.getElementById('ord-stato').value,
    note: document.getElementById('ord-note').value
  };
  const { error } = await sb.from('ordini').insert([data]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Ordine salvato!');
  caricaOrdini();
  caricaDashboard();
}

async function caricaOrdini() {
  const { data, error } = await sb.from('ordini').select('*').order('data', { ascending: false }).order('created_at', { ascending: false });
  const tbody = document.getElementById('tabella-ordini');
  if (error || !data.length) { tbody.innerHTML = '<tr><td colspan="11" class="loading">Nessun ordine trovato</td></tr>'; return; }
  tbody.innerHTML = data.map(r => {
    const pL = prezzoConIva(r);
    const totale = pL * r.litri;
    return `<tr>
      <td>${r.data}</td>
      <td>${r.cliente}</td>
      <td>${r.prodotto}</td>
      <td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td>
      <td>${r.fornitore}</td>
      <td class="editable" onclick="editaCella(this,'ordini','trasporto_litro','${r.id}',${r.trasporto_litro})" style="font-family:var(--font-mono)">${fmt(r.trasporto_litro)}</td>
      <td class="editable" onclick="editaCella(this,'ordini','margine','${r.id}',${r.margine})" style="font-family:var(--font-mono)">${fmt(r.margine)}</td>
      <td style="font-family:var(--font-mono)">${fmt(pL)}</td>
      <td style="font-family:var(--font-mono)">${fmtE(totale)}</td>
      <td>${badgeStato(r.stato)}</td>
      <td><button class="btn-danger" onclick="eliminaRecord('ordini','${r.id}',caricaOrdini)">×</button></td>
    </tr>`;
  }).join('');
}

// ── MODIFICA INLINE ──────────────────────────────────────────────
async function editaCella(td, tabella, campo, id, valoreAttuale) {
  const input = document.createElement('input');
  input.className = 'inline-edit';
  input.type = 'number';
  input.step = '0.0001';
  input.value = valoreAttuale;
  td.innerHTML = '';
  td.appendChild(input);
  input.focus();
  input.onblur = async () => {
    const nuovoValore = parseFloat(input.value);
    if (isNaN(nuovoValore)) { if (tabella === 'ordini') caricaOrdini(); else caricaPrezzi(); return; }
    const { error } = await sb.from(tabella).update({ [campo]: nuovoValore }).eq('id', id);
    if (error) { toast('Errore salvataggio'); } else { toast('✅ Aggiornato!'); }
    if (tabella === 'ordini') caricaOrdini(); else caricaPrezzi();
  };
  input.onkeydown = (e) => { if (e.key === 'Enter') input.blur(); if (e.key === 'Escape') { if (tabella === 'ordini') caricaOrdini(); else caricaPrezzi(); } };
}

// ── ELIMINA RECORD ───────────────────────────────────────────────
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
  const auto = data.filter(c => c.tipo === 'autotrazione');
  const agr = data.filter(c => c.tipo === 'agricolo');
  renderCisterne('cis-autotrazione', auto);
  renderCisterne('cis-agricolo', agr);
}

function renderCisterne(elId, cisterne) {
  const el = document.getElementById(elId);
  const colori = ['#D85A30','#378ADD','#639922','#BA7517','#E24B4A'];
  let html = '<div class="cisterne">';
  let alerts = [];
  cisterne.forEach((c, i) => {
    const pct = Math.round((c.livello_attuale / c.capacita_max) * 100);
    const col = colori[i % colori.length];
    if (pct < 30) alerts.push(c.nome);
    html += `<div class="cis-row">
      <span class="cis-label">${c.nome}</span>
      <div class="cis-bar"><div class="cis-fill" style="width:${pct}%;background:${col}"><span class="cis-pct">${pct}%</span></div></div>
      <span class="cis-val">${Number(c.livello_attuale).toLocaleString('it-IT')} L</span>
    </div>`;
  });
  html += '</div>';
  if (alerts.length) html += `<div class="alert-box">⚠ Sotto soglia: ${alerts.join(', ')}</div>`;
  el.innerHTML = html;
}

// ── CONSEGNE ─────────────────────────────────────────────────────
async function caricaConsegne() {
  const { data } = await sb.from('ordini').select('*').eq('data', oggiISO).order('created_at');
  const tbody = document.getElementById('tabella-consegne');
  if (!data || !data.length) { tbody.innerHTML = '<tr><td colspan="7" class="loading">Nessun ordine oggi</td></tr>'; document.getElementById('tot-consegne').textContent = '0'; document.getElementById('tot-completate').textContent = '0'; document.getElementById('tot-inattesa').textContent = '0'; document.getElementById('tot-programmati').textContent = '0'; return; }
  document.getElementById('tot-consegne').textContent = data.length;
  document.getElementById('tot-completate').textContent = data.filter(r => r.stato === 'confermato').length;
  document.getElementById('tot-inattesa').textContent = data.filter(r => r.stato === 'in attesa').length;
  document.getElementById('tot-programmati').textContent = data.filter(r => r.stato === 'programmato').length;
  tbody.innerHTML = data.map(r => `<tr>
    <td>${r.data}</td><td>${r.cliente}</td><td>${r.prodotto}</td>
    <td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td>
    <td>${r.fornitore}</td>
    <td style="font-family:var(--font-mono)">${fmtE(prezzoConIva(r) * r.litri)}</td>
    <td>${badgeStato(r.stato)}</td>
  </tr>`).join('');
}

// ── VENDITE ──────────────────────────────────────────────────────
async function caricaVendite() {
  const inizio = new Date(oggi.getFullYear(), oggi.getMonth(), 1).toISOString().split('T')[0];
  const { data } = await sb.from('ordini').select('*').gte('data', inizio);
  if (!data) return;
  let fatturato = 0, litri = 0, margine = 0;
  const perFornitore = {};
  data.forEach(r => {
    const tot = prezzoConIva(r) * r.litri;
    const marg = Number(r.margine) * Number(r.litri);
    fatturato += tot; litri += Number(r.litri); margine += marg;
    if (!perFornitore[r.fornitore]) perFornitore[r.fornitore] = { litri: 0, fatturato: 0, margine: 0 };
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
  tbody.innerHTML = righe.length ? righe.map(([f, v]) => `<tr>
    <td>${f}</td>
    <td style="font-family:var(--font-mono)">${fmtL(v.litri)}</td>
    <td style="font-family:var(--font-mono)">${fmtE(v.fatturato)}</td>
    <td style="font-family:var(--font-mono)">${fmtE(v.margine)}</td>
  </tr>`).join('') : '<tr><td colspan="4" class="loading">Nessun dato questo mese</td></tr>';
}

// ── DASHBOARD ────────────────────────────────────────────────────
async function caricaDashboard() {
  const { data } = await sb.from('ordini').select('*').eq('data', oggiISO);
  if (!data) return;
  let fatturato = 0, litri = 0, margine = 0;
  data.forEach(r => { const tot = prezzoConIva(r) * r.litri; fatturato += tot; litri += Number(r.litri); margine += Number(r.margine); });
  document.getElementById('kpi-fatturato').textContent = fmtE(fatturato);
  document.getElementById('kpi-litri').textContent = fmtL(litri);
  document.getElementById('kpi-margine').textContent = data.length ? '€ ' + (margine / data.length).toFixed(4) + '/L' : '—';
  document.getElementById('kpi-ordini').textContent = data.length;
  const { data: recenti } = await sb.from('ordini').select('*').order('created_at', { ascending: false }).limit(5);
  const tbody = document.getElementById('dashboard-ordini');
  if (!recenti || !recenti.length) { tbody.innerHTML = '<tr><td colspan="6" class="loading">Nessun ordine</td></tr>'; return; }
  tbody.innerHTML = recenti.map(r => `<tr>
    <td>${r.data}</td><td>${r.cliente}</td><td>${r.prodotto}</td>
    <td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td>
    <td style="font-family:var(--font-mono)">${fmtE(prezzoConIva(r) * r.litri)}</td>
    <td>${badgeStato(r.stato)}</td>
  </tr>`).join('');
}

// ── AVVIO ────────────────────────────────────────────────────────
caricaDashboard();
