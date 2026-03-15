// ── SUPABASE ─────────────────────────────────────────────────────
const SUPABASE_URL = 'https://jpugeakgpitbxdswbucj.supabase.co';
const SUPABASE_KEY = 'sb_publishable_xMFZND8_vBl5Z5eEA-2guA_kVME1Iz-';
const sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ── DATA ─────────────────────────────────────────────────────────
const oggi = new Date();
const oggiISO = oggi.toISOString().split('T')[0];
const gg = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const mm = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
document.getElementById('topbar-date').textContent = gg[oggi.getDay()] + ' ' + oggi.getDate() + ' ' + mm[oggi.getMonth()] + ' ' + oggi.getFullYear();
document.getElementById('pr-data').value = oggiISO;
document.getElementById('ord-data').value = oggiISO;
document.getElementById('filtro-data-prezzi').value = oggiISO;

// ── NAVIGAZIONE ───────────────────────────────────────────────────
const titles = { dashboard:'Dashboard', ordini:'Ordini', prezzi:'Prezzi giornalieri', deposito:'Deposito', consegne:'Consegne', vendite:'Vendite', clienti:'Clienti', fornitori:'Fornitori', basi:'Basi di carico' };
function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  el.classList.add('active');
  document.getElementById('page-title').textContent = titles[id];
  const loaders = { prezzi:caricaPrezzi, ordini:caricaOrdini, deposito:caricaDeposito, consegne:caricaConsegne, vendite:caricaVendite, clienti:caricaClienti, fornitori:caricaFornitori, basi:caricaBasi };
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

// ── PREZZI ────────────────────────────────────────────────────────
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
  if (data) data.forEach(r => { if (r.basi_carico) sel.innerHTML += `<option value="${r.basi_carico.id}">${r.basi_carico.nome}</option>`; });
  // Aggiungi anche tutte le basi se non ci sono associazioni
  if (!data || !data.length) {
    const { data: tutteBasi } = await sb.from('basi_carico').select('id,nome').eq('attivo',true).order('nome');
    if (tutteBasi) tutteBasi.forEach(b => sel.innerHTML += `<option value="${b.id}">${b.nome}</option>`);
  }
}

async function salvaPrezzo() {
  const selFor = document.getElementById('pr-fornitore');
  const fornitoreId = selFor.value;
  const fornitoreNome = selFor.options[selFor.selectedIndex]?.text || '';
  const selBase = document.getElementById('pr-base');
  const baseId = selBase.value || null;
  const costo = parseFloat(document.getElementById('pr-costo').value);
  const trasporto = parseFloat(document.getElementById('pr-trasporto').value) || 0;
  const margine = parseFloat(document.getElementById('pr-margine').value) || 0;
  const data = document.getElementById('pr-data').value;
  const prodotto = document.getElementById('pr-prodotto').value;

  if (!data) { toast('⚠ Inserisci la data'); return; }
  if (!fornitoreNome || fornitoreNome === 'Seleziona...') { toast('⚠ Seleziona un fornitore'); return; }
  if (!prodotto) { toast('⚠ Seleziona un prodotto'); return; }
  if (isNaN(costo) || costo <= 0) { toast('⚠ Inserisci il costo per litro'); return; }

  const record = {
    data,
    fornitore: fornitoreNome,
    fornitore_id: fornitoreId || null,
    base_carico_id: baseId,
    prodotto,
    costo_litro: costo,
    trasporto_litro: trasporto,
    margine,
    iva: parseInt(document.getElementById('pr-iva').value)
  };

  const { error } = await sb.from('prezzi').insert([record]);
  if (error) { toast('Errore: ' + error.message); return; }
  toast('✅ Prezzo salvato!');
  caricaPrezzi();
}

async function caricaPrezzi() {
  await caricaSelectFornitori('pr-fornitore');
  const filtroData = document.getElementById('filtro-data-prezzi').value;
  let query = sb.from('prezzi').select('*, basi_carico(nome)').order('data',{ascending:false}).order('fornitore');
  if (filtroData) query = query.eq('data', filtroData);
  const { data } = await query;
  const tbody = document.getElementById('tabella-prezzi');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="10" class="loading">Nessun prezzo trovato</td></tr>'; return; }
  const best={};
  data.forEach(r=>{ const k=r.data+'_'+r.prodotto; if(!best[k]||prezzoNoIva(r)<prezzoNoIva(best[k])) best[k]=r; });
  tbody.innerHTML = data.map(r=>`<tr>
    <td>${r.data}</td><td>${r.fornitore}</td>
    <td>${r.basi_carico?r.basi_carico.nome:'—'}</td>
    <td>${r.prodotto}</td>
    <td style="font-family:var(--font-mono)">${fmt(r.costo_litro)}</td>
    <td class="editable" onclick="editaCella(this,'prezzi','trasporto_litro','${r.id}',${r.trasporto_litro})" style="font-family:var(--font-mono)">${fmt(r.trasporto_litro)}</td>
    <td class="editable" onclick="editaCella(this,'prezzi','margine','${r.id}',${r.margine})" style="font-family:var(--font-mono)">${fmt(r.margine)}</td>
    <td style="font-family:var(--font-mono)">${fmt(prezzoNoIva(r))}</td>
    <td style="font-family:var(--font-mono)">${fmt(prezzoConIva(r))}</td>
    <td>${best[r.data+'_'+r.prodotto]?.id===r.id?'<span class="badge green" style="font-size:9px">Best</span>':''} <button class="btn-danger" onclick="eliminaRecord('prezzi','${r.id}',caricaPrezzi)">×</button></td>
  </tr>`).join('');
}

// ── ORDINI ────────────────────────────────────────────────────────
let prezzoCorrente = null;
let prezziDelGiorno = [];

function toggleTipoOrdine() {
  document.getElementById('grp-cliente').style.display = document.getElementById('ord-tipo').value==='cliente' ? '' : 'none';
}

async function aggiornaSelezioniOrdine() {
  const data = document.getElementById('ord-data').value;
  if (!data) return;
  const { data: prezzi } = await sb.from('prezzi').select('*, basi_carico(id,nome)').eq('data', data);
  prezziDelGiorno = prezzi || [];
  const fornitori = [...new Map(prezziDelGiorno.map(p=>[p.fornitore,{nome:p.fornitore}])).values()];
  const selFor = document.getElementById('ord-fornitore');
  selFor.innerHTML = '<option value="">Seleziona fornitore...</option>' + fornitori.map(f=>`<option value="${f.nome}">${f.nome}</option>`).join('');
  document.getElementById('ord-base').innerHTML = '<option value="">— Prima seleziona fornitore —</option>';
  document.getElementById('ord-prodotto').innerHTML = '<option value="">— Prima seleziona fornitore —</option>';
  prezzoCorrente = null;
  await caricaSelectClienti('ord-cliente');
}

function aggiornaBasiOrdine() {
  const fornitore = document.getElementById('ord-fornitore').value;
  const prezziFor = prezziDelGiorno.filter(p=>p.fornitore===fornitore);
  const basi = [...new Map(prezziFor.filter(p=>p.basi_carico).map(p=>[p.basi_carico.id,p.basi_carico])).values()];
  const selBase = document.getElementById('ord-base');
  if (basi.length) {
    selBase.innerHTML = '<option value="">Seleziona base...</option>' + basi.map(b=>`<option value="${b.id}">${b.nome}</option>`).join('');
  } else {
    selBase.innerHTML = '<option value="">Nessuna base specificata</option>';
    aggiornaProdottiOrdine();
  }
  document.getElementById('ord-prodotto').innerHTML = '<option value="">— Prima seleziona base —</option>';
  prezzoCorrente = null;
}

function aggiornaProdottiOrdine() {
  const fornitore = document.getElementById('ord-fornitore').value;
  const baseId = document.getElementById('ord-base').value;
  const prodotti = [...new Set(prezziDelGiorno.filter(p=>p.fornitore===fornitore&&(baseId?p.base_carico_id===baseId:true)).map(p=>p.prodotto))];
  const selProd = document.getElementById('ord-prodotto');
  selProd.innerHTML = '<option value="">Seleziona prodotto...</option>' + prodotti.map(p=>`<option value="${p}">${p}</option>`).join('');
  prezzoCorrente = null;
}

async function caricaPrezzoPerOrdine() {
  aggiornaProdottiOrdine();
  const fornitore = document.getElementById('ord-fornitore').value;
  const baseId = document.getElementById('ord-base').value;
  const prodotto = document.getElementById('ord-prodotto').value;
  if (!fornitore||!prodotto) return;
  const match = prezziDelGiorno.find(p=>p.fornitore===fornitore&&p.prodotto===prodotto&&(baseId?p.base_carico_id===baseId:true));
  if (match) {
    prezzoCorrente = match;
    document.getElementById('prev-costo').textContent = fmt(match.costo_litro);
    document.getElementById('prev-trasporto').textContent = fmt(match.trasporto_litro);
    document.getElementById('prev-margine').textContent = fmt(match.margine);
    aggiornaPrevOrdine();
  } else {
    prezzoCorrente = null;
    ['prev-costo','prev-trasporto','prev-margine','prev-prezzo','prev-totale'].forEach(id=>document.getElementById(id).textContent='—');
  }
}

function aggiornaPrevOrdine() {
  if (!prezzoCorrente) return;
  const litri = parseFloat(document.getElementById('ord-litri').value)||0;
  const pL = prezzoConIva(prezzoCorrente);
  document.getElementById('prev-prezzo').textContent = fmt(pL);
  document.getElementById('prev-totale').textContent = fmtE(pL*litri);
}

async function salvaOrdine() {
  if (!prezzoCorrente) { toast('⚠ Seleziona data/fornitore/prodotto disponibili'); return; }
  const litri = parseFloat(document.getElementById('ord-litri').value);
  const tipo = document.getElementById('ord-tipo').value;
  const clienteId = document.getElementById('ord-cliente').value;
  const clienteNome = cacheClienti.find(c=>c.id===clienteId)?.nome || 'Deposito';
  if (tipo==='cliente'&&!clienteId) { toast('⚠ Seleziona un cliente'); return; }
  if (!litri) { toast('⚠ Inserisci i litri'); return; }
  const ggPag = parseInt(document.getElementById('ord-gg').value);
  const dataOrdine = new Date(document.getElementById('ord-data').value);
  const dataScad = new Date(dataOrdine); dataScad.setDate(dataScad.getDate()+ggPag);
  const record = {
    data: document.getElementById('ord-data').value,
    tipo_ordine: tipo, cliente: clienteNome,
    prodotto: prezzoCorrente.prodotto, litri,
    fornitore: prezzoCorrente.fornitore,
    costo_litro: prezzoCorrente.costo_litro,
    trasporto_litro: prezzoCorrente.trasporto_litro,
    margine: prezzoCorrente.margine, iva: prezzoCorrente.iva,
    base_carico_id: prezzoCorrente.base_carico_id||null,
    trasportatore: document.getElementById('ord-trasportatore').value,
    giorni_pagamento: ggPag,
    data_scadenza: dataScad.toISOString().split('T')[0],
    stato: document.getElementById('ord-stato').value,
    note: document.getElementById('ord-note').value
  };
  const { error } = await sb.from('ordini').insert([record]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('✅ Ordine salvato!');
  caricaOrdini(); caricaDashboard();
}

async function caricaOrdini() {
  await aggiornaSelezioniOrdine();
  const { data } = await sb.from('ordini').select('*, basi_carico(nome)').order('data',{ascending:false}).order('created_at',{ascending:false});
  const tbody = document.getElementById('tabella-ordini');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="14" class="loading">Nessun ordine</td></tr>'; return; }
  tbody.innerHTML = data.map(r=>{
    const pL=prezzoConIva(r), tot=pL*r.litri;
    return `<tr>
      <td>${r.data}</td><td>${badgeStato(r.tipo_ordine||'cliente')}</td>
      <td>${r.cliente}</td><td>${r.prodotto}</td>
      <td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td>
      <td>${r.fornitore}</td>
      <td>${r.basi_carico?r.basi_carico.nome:'—'}</td>
      <td class="editable" onclick="editaCella(this,'ordini','trasporto_litro','${r.id}',${r.trasporto_litro})" style="font-family:var(--font-mono)">${fmt(r.trasporto_litro)}</td>
      <td class="editable" onclick="editaCella(this,'ordini','margine','${r.id}',${r.margine})" style="font-family:var(--font-mono)">${fmt(r.margine)}</td>
      <td style="font-family:var(--font-mono)">${fmt(pL)}</td>
      <td style="font-family:var(--font-mono)">${fmtE(tot)}</td>
      <td style="font-size:11px;color:var(--text-hint)">${r.data_scadenza||'—'}</td>
      <td>${badgeStato(r.stato)}</td>
      <td><button class="btn-danger" onclick="eliminaRecord('ordini','${r.id}',caricaOrdini)">×</button></td>
    </tr>`;
  }).join('');
}

// ── MODIFICA INLINE ───────────────────────────────────────────────
async function editaCella(td, tabella, campo, id, val) {
  const input = document.createElement('input');
  input.className='inline-edit'; input.type='number'; input.step='0.0001'; input.value=val;
  td.innerHTML=''; td.appendChild(input); input.focus();
  input.onblur = async () => {
    const nv=parseFloat(input.value);
    if (!isNaN(nv)) { const {error}=await sb.from(tabella).update({[campo]:nv}).eq('id',id); toast(error?'Errore salvataggio':'✅ Aggiornato!'); }
    if (tabella==='ordini') caricaOrdini(); else caricaPrezzi();
  };
  input.onkeydown = e => { if(e.key==='Enter') input.blur(); if(e.key==='Escape') { if(tabella==='ordini') caricaOrdini(); else caricaPrezzi(); } };
}

async function eliminaRecord(tabella, id, callback) {
  if (!confirm('Eliminare questo record?')) return;
  await sb.from(tabella).delete().eq('id', id);
  toast('🗑 Eliminato'); callback();
}

// ── DEPOSITO ──────────────────────────────────────────────────────
const DEP_CONFIG = {
  autotrazione: { colore:'#D85A30', elId:'dep-autotrazione', totId:'dep-total-autotrazione' },
  agricolo:     { colore:'#639922', elId:'dep-agricolo',     totId:'dep-total-agricolo' },
  hvo:          { colore:'#3B6D11', elId:'dep-hvo',          totId:'dep-total-hvo' },
  benzina:      { colore:'#378ADD', elId:'dep-benzina',       totId:'dep-total-benzina' }
};

function cisternasvg(pct, colore) {
  const altMax=80, liv=Math.round((pct/100)*altMax), y=10+(altMax-liv);
  const fill=pct<20?'#E24B4A':pct<35?'#BA7517':colore;
  return `<svg class="dep-cisterna-svg" viewBox="0 0 60 100" xmlns="http://www.w3.org/2000/svg">
    <rect x="5" y="10" width="50" height="80" rx="4" fill="#e8e7e3" stroke="#ccc" stroke-width="1"/>
    <rect x="5" y="${y}" width="50" height="${liv}" rx="2" fill="${fill}" opacity="0.85"/>
    <rect x="5" y="10" width="50" height="80" rx="4" fill="none" stroke="#bbb" stroke-width="1.5"/>
    <rect x="20" y="5" width="20" height="8" rx="2" fill="#ccc"/>
    <line x1="5" y1="30" x2="8" y2="30" stroke="#bbb" stroke-width="1"/>
    <line x1="5" y1="50" x2="8" y2="50" stroke="#bbb" stroke-width="1"/>
    <line x1="5" y1="70" x2="8" y2="70" stroke="#bbb" stroke-width="1"/>
  </svg>`;
}

async function caricaDeposito() {
  const { data: cisterne } = await sb.from('cisterne').select('*').order('tipo').order('nome');
  if (!cisterne) return;
  let totaleStoccato=0, allerte=0;
  Object.entries(DEP_CONFIG).forEach(([tipo, cfg]) => {
    const gruppo=cisterne.filter(c=>c.tipo===tipo);
    let totG=0;
    const el=document.getElementById(cfg.elId); if (!el) return;
    el.innerHTML=gruppo.map(c=>{
      const pct=Math.round((c.livello_attuale/c.capacita_max)*100);
      totG+=Number(c.livello_attuale);
      if(pct<30) allerte++;
      return `<div class="dep-cisterna${pct<30?' alert':''}">
        <div class="dep-cisterna-name">${c.nome}</div>
        ${cisternasvg(pct,cfg.colore)}
        <div class="dep-cisterna-litri">${Number(c.livello_attuale).toLocaleString('it-IT')} L</div>
        <div class="dep-cisterna-pct">${pct}% · cap. ${Number(c.capacita_max).toLocaleString('it-IT')} L</div>
      </div>`;
    }).join('');
    document.getElementById(cfg.totId).textContent=fmtL(totG);
    totaleStoccato+=totG;
  });
  document.getElementById('dep-totale').textContent=fmtL(totaleStoccato);
  document.getElementById('dep-pct').textContent=Math.round((totaleStoccato/280000)*100)+'%';
  document.getElementById('dep-allerta').textContent=allerte;
  const { data: mov } = await sb.from('ordini').select('*').or('tipo_ordine.eq.deposito,cliente.eq.Deposito').order('created_at',{ascending:false}).limit(10);
  const tbody=document.getElementById('dep-movimenti');
  if (!mov||!mov.length) { tbody.innerHTML='<tr><td colspan="6" class="loading">Nessun movimento</td></tr>'; return; }
  tbody.innerHTML=mov.map(r=>`<tr><td>${r.data}</td><td>${r.tipo_ordine==='deposito'?'<span class="badge teal">Entrata</span>':'<span class="badge amber">Uscita</span>'}</td><td>${r.prodotto}</td><td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td><td>${r.fornitore}</td><td>${badgeStato(r.stato)}</td></tr>`).join('');
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
  if (id) { ({ error } = await sb.from('clienti').update(record).eq('id',id)); }
  else { ({ error } = await sb.from('clienti').insert([record])); }
  if (error) { toast('Errore: '+error.message); return; }
  toast(id ? '✅ Cliente aggiornato!' : '✅ Cliente salvato!');
  cacheClienti=[];
  chiudiModal();
  caricaClienti();
}

async function apriModaleCliente(id=null) {
  document.getElementById('modal-title').textContent = id ? 'Modifica cliente' : 'Nuovo cliente';
  document.getElementById('modal-save-btn').onclick = () => salvaCliente(id);
  // Carica form cliente nel modal
  const campi = ['cl-nome','cl-piva','cl-cf','cl-indirizzo','cl-citta','cl-provincia','cl-telefono','cl-email','cl-fido','cl-zona','cl-prodotti','cl-note'];
  campi.forEach(c => { const el=document.getElementById(c); if(el) el.value=''; });
  document.getElementById('cl-tipo').value='azienda';
  document.getElementById('cl-gg').value='30';
  if (id) {
    const { data } = await sb.from('clienti').select('*').eq('id',id).single();
    if (data) {
      document.getElementById('cl-nome').value=data.nome||'';
      document.getElementById('cl-tipo').value=data.tipo||'azienda';
      document.getElementById('cl-piva').value=data.piva||'';
      document.getElementById('cl-cf').value=data.codice_fiscale||'';
      document.getElementById('cl-indirizzo').value=data.indirizzo||'';
      document.getElementById('cl-citta').value=data.citta||'';
      document.getElementById('cl-provincia').value=data.provincia||'';
      document.getElementById('cl-telefono').value=data.telefono||'';
      document.getElementById('cl-email').value=data.email||'';
      document.getElementById('cl-fido').value=data.fido_massimo||0;
      document.getElementById('cl-gg').value=data.giorni_pagamento||30;
      document.getElementById('cl-zona').value=data.zona_consegna||'';
      document.getElementById('cl-prodotti').value=data.prodotti_abituali||'';
      document.getElementById('cl-note').value=data.note||'';
    }
  }
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-clienti').style.display='block';
  document.getElementById('modal-fornitori').style.display='none';
}

async function caricaClienti() {
  const { data } = await sb.from('clienti').select('*').order('nome');
  const tbody=document.getElementById('tabella-clienti');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="10" class="loading">Nessun cliente</td></tr>'; return; }
  tbody.innerHTML=data.map(r=>`<tr>
    <td><strong>${r.nome}</strong></td>
    <td><span class="badge blue">${r.tipo||'azienda'}</span></td>
    <td style="font-size:11px;color:var(--text-muted)">${r.piva||'—'}</td>
    <td>${r.citta||'—'}</td><td>${r.telefono||'—'}</td>
    <td style="font-family:var(--font-mono)">${r.fido_massimo>0?fmtE(r.fido_massimo):'—'}</td>
    <td>${r.giorni_pagamento||30} gg</td>
    <td style="font-size:11px;color:var(--text-muted)">${r.prodotti_abituali||'—'}</td>
    <td style="font-size:11px;color:var(--text-muted)">${r.note||'—'}</td>
    <td>
      <button class="btn-edit" onclick="apriModaleCliente('${r.id}')">✏️</button>
      <button class="btn-danger" onclick="eliminaRecord('clienti','${r.id}',caricaClienti)">×</button>
    </td>
  </tr>`).join('');
}

// ── FORNITORI ─────────────────────────────────────────────────────
async function caricaCheckboxBasi(selectedIds=[]) {
  const { data } = await sb.from('basi_carico').select('id,nome').eq('attivo',true).order('nome');
  const wrap=document.getElementById('fo-basi-check');
  wrap.innerHTML=data?data.map(b=>`<label class="check-label"><input type="checkbox" value="${b.id}" ${selectedIds.includes(b.id)?'checked':''}/> ${b.nome}</label>`).join(''):'';
}

async function salvaFornitore(id=null) {
  const record={ nome:document.getElementById('fo-nome').value.trim(), ragione_sociale:document.getElementById('fo-ragione').value, piva:document.getElementById('fo-piva').value, indirizzo:document.getElementById('fo-indirizzo').value, citta:document.getElementById('fo-citta').value, telefono:document.getElementById('fo-telefono').value, email:document.getElementById('fo-email').value, contatto:document.getElementById('fo-contatto').value, fido_massimo:parseFloat(document.getElementById('fo-fido').value)||0, giorni_pagamento:parseInt(document.getElementById('fo-gg').value), note:document.getElementById('fo-note').value };
  if (!record.nome) { toast('⚠ Inserisci il nome'); return; }
  let foId = id;
  if (id) {
    const { error } = await sb.from('fornitori').update(record).eq('id',id);
    if (error) { toast('Errore: '+error.message); return; }
  } else {
    const { data: fo, error } = await sb.from('fornitori').insert([record]).select().single();
    if (error) { toast('Errore: '+error.message); return; }
    foId = fo.id;
  }
  // Aggiorna basi associate
  await sb.from('fornitori_basi').delete().eq('fornitore_id', foId);
  const checks = document.querySelectorAll('#fo-basi-check input:checked');
  if (checks.length) {
    const basi = Array.from(checks).map(c=>({ fornitore_id:foId, base_carico_id:c.value }));
    await sb.from('fornitori_basi').insert(basi);
  }
  toast(id ? '✅ Fornitore aggiornato!' : '✅ Fornitore salvato!');
  cacheFornitori=[];
  chiudiModal();
  caricaFornitori();
}

async function apriModaleFornitore(id=null) {
  document.getElementById('modal-title').textContent = id ? 'Modifica fornitore' : 'Nuovo fornitore';
  document.getElementById('modal-save-btn').onclick = () => salvaFornitore(id);
  const campi=['fo-nome','fo-ragione','fo-piva','fo-indirizzo','fo-citta','fo-telefono','fo-email','fo-contatto','fo-fido','fo-note'];
  campi.forEach(c=>{ const el=document.getElementById(c); if(el) el.value=''; });
  document.getElementById('fo-gg').value='30';
  let selectedBasi=[];
  if (id) {
    const { data } = await sb.from('fornitori').select('*, fornitori_basi(base_carico_id)').eq('id',id).single();
    if (data) {
      document.getElementById('fo-nome').value=data.nome||'';
      document.getElementById('fo-ragione').value=data.ragione_sociale||'';
      document.getElementById('fo-piva').value=data.piva||'';
      document.getElementById('fo-indirizzo').value=data.indirizzo||'';
      document.getElementById('fo-citta').value=data.citta||'';
      document.getElementById('fo-telefono').value=data.telefono||'';
      document.getElementById('fo-email').value=data.email||'';
      document.getElementById('fo-contatto').value=data.contatto||'';
      document.getElementById('fo-fido').value=data.fido_massimo||0;
      document.getElementById('fo-gg').value=data.giorni_pagamento||30;
      document.getElementById('fo-note').value=data.note||'';
      selectedBasi=data.fornitori_basi?data.fornitori_basi.map(fb=>fb.base_carico_id):[];
    }
  }
  await caricaCheckboxBasi(selectedBasi);
  document.getElementById('modal-overlay').style.display='flex';
  document.getElementById('modal-fornitori').style.display='block';
  document.getElementById('modal-clienti').style.display='none';
}

async function calcolaFido(fornitoreNome, fidoMax, giorniPag) {
  if (!fidoMax) return { usato:0, residuo:0 };
  const { data } = await sb.from('ordini').select('*').eq('fornitore', fornitoreNome);
  let usato=0;
  (data||[]).forEach(o=>{ const scad=new Date(o.data); scad.setDate(scad.getDate()+(o.giorni_pagamento||giorniPag||30)); if(scad>oggi) usato+=prezzoConIva(o)*Number(o.litri); });
  return { usato, residuo:fidoMax-usato };
}

function fidoBar(usato, max) {
  if (!max) return '—';
  const pct=Math.min(100,Math.round((usato/max)*100));
  const cls=pct<60?'fido-ok':pct<85?'fido-warn':'fido-danger';
  return `<div class="fido-bar-wrap"><div class="fido-bar"><div class="fido-fill ${cls}" style="width:${pct}%"></div></div><span style="font-size:10px">${pct}%</span></div>`;
}

async function caricaFornitori() {
  const { data } = await sb.from('fornitori').select('*, fornitori_basi(base_carico_id, basi_carico(nome))').order('nome');
  const tbody=document.getElementById('tabella-fornitori');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="12" class="loading">Nessun fornitore</td></tr>'; return; }
  const rows = await Promise.all(data.map(async r=>{
    const { usato, residuo } = await calcolaFido(r.nome, r.fido_massimo, r.giorni_pagamento);
    const basi=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.basi_carico?.nome).filter(Boolean).join(', '):'—';
    return `<tr>
      <td><strong>${r.nome}</strong></td>
      <td style="font-size:11px;color:var(--text-muted)">${r.piva||'—'}</td>
      <td>${r.citta||'—'}</td><td>${r.contatto||'—'}</td><td>${r.telefono||'—'}</td>
      <td style="font-family:var(--font-mono)">${r.fido_massimo>0?fmtE(r.fido_massimo):'—'}</td>
      <td style="font-family:var(--font-mono)">${r.fido_massimo>0?fmtE(usato):'—'}</td>
      <td>${r.fido_massimo>0?fidoBar(usato,r.fido_massimo)+' <span style="font-size:11px;font-family:var(--font-mono)">'+fmtE(residuo)+'</span>':'—'}</td>
      <td>${r.giorni_pagamento||30} gg</td>
      <td style="font-size:11px;color:var(--text-muted)">${basi}</td>
      <td style="font-size:11px;color:var(--text-muted)">${r.note||'—'}</td>
      <td>
        <button class="btn-edit" onclick="apriModaleFornitore('${r.id}')">✏️</button>
        <button class="btn-danger" onclick="eliminaRecord('fornitori','${r.id}',caricaFornitori)">×</button>
      </td>
    </tr>`;
  }));
  tbody.innerHTML=rows.join('');
}

// ── BASI DI CARICO ────────────────────────────────────────────────
async function salvaBasi() {
  const record={ nome:document.getElementById('ba-nome').value.trim(), indirizzo:document.getElementById('ba-indirizzo').value, citta:document.getElementById('ba-citta').value, provincia:document.getElementById('ba-provincia').value, note:document.getElementById('ba-note').value };
  if (!record.nome) { toast('⚠ Inserisci il nome'); return; }
  const { error } = await sb.from('basi_carico').insert([record]);
  if (error) { toast('Errore: '+error.message); return; }
  toast('✅ Base salvata!'); cacheBasi=[];
  caricaBasi();
}

async function caricaBasi() {
  const { data } = await sb.from('basi_carico').select('*, fornitori_basi(fornitore_id, fornitori(nome))').order('nome');
  const tbody=document.getElementById('tabella-basi');
  if (!data||!data.length) { tbody.innerHTML='<tr><td colspan="6" class="loading">Nessuna base</td></tr>'; return; }
  tbody.innerHTML=data.map(r=>{
    const forn=r.fornitori_basi?r.fornitori_basi.map(fb=>fb.fornitori?.nome).filter(Boolean).join(', '):'—';
    return `<tr><td><strong>${r.nome}</strong></td><td>${r.indirizzo||'—'}</td><td>${r.citta||'—'}</td><td style="font-size:11px;color:var(--text-muted)">${forn}</td><td style="font-size:11px;color:var(--text-muted)">${r.note||'—'}</td><td><button class="btn-danger" onclick="eliminaRecord('basi_carico','${r.id}',caricaBasi)">×</button></td></tr>`;
  }).join('');
}

// ── MODAL ─────────────────────────────────────────────────────────
function chiudiModal() {
  document.getElementById('modal-overlay').style.display='none';
}
document.getElementById('modal-overlay').addEventListener('click', function(e) {
  if (e.target === this) chiudiModal();
});

// ── DASHBOARD ─────────────────────────────────────────────────────
async function caricaDashboard() {
  const { data } = await sb.from('ordini').select('*').eq('data',oggiISO);
  if (!data) return;
  let fatturato=0,litri=0,margine=0;
  data.forEach(r=>{ fatturato+=prezzoConIva(r)*r.litri; litri+=Number(r.litri); margine+=Number(r.margine); });
  document.getElementById('kpi-fatturato').textContent=fmtE(fatturato);
  document.getElementById('kpi-litri').textContent=fmtL(litri);
  document.getElementById('kpi-margine').textContent=data.length?'€ '+(margine/data.length).toFixed(4)+'/L':'—';
  document.getElementById('kpi-ordini').textContent=data.length;
  const { data: rec } = await sb.from('ordini').select('*').order('created_at',{ascending:false}).limit(5);
  const tbody=document.getElementById('dashboard-ordini');
  tbody.innerHTML=rec&&rec.length?rec.map(r=>`<tr><td>${r.data}</td><td>${r.cliente}</td><td>${r.prodotto}</td><td style="font-family:var(--font-mono)">${fmtL(r.litri)}</td><td style="font-family:var(--font-mono)">${fmtE(prezzoConIva(r)*r.litri)}</td><td>${badgeStato(r.stato)}</td></tr>`).join(''):'<tr><td colspan="6" class="loading">Nessun ordine</td></tr>';
}

// ── AVVIO ─────────────────────────────────────────────────────────
caricaDashboard();
aggiornaSelezioniOrdine();
