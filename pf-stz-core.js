// PhoenixFuel — Stazione: Core, Dashboard, Ricezione ordini
// PhoenixFuel — Stazione Oppido

// ═══════════════════════════════════════════════════════════════════
// pfStzRicalcolaCisterne — DISATTIVATO (16/04/2026)
// ═══════════════════════════════════════════════════════════════════
// L'auto-heal causava carichi fantasma rimettendo automaticamente i
// litri di ordini non ancora confermati con "Ricevi". La cisterna ora
// mostra SEMPRE e SOLO il valore in DB. Aggiornamento via:
//   - bottone Ricevi (riceviOrdineStazione)
//   - rettifiche inventario manuali
//   - distribuzione tra cisterne (distribuisci)
// Nessuna logica magica in background.
// ═══════════════════════════════════════════════════════════════════
async function pfStzRicalcolaCisterne(prodotto) {
  // NO-OP: lascio la cisterna come sta nel DB.
  // Se serve heal manuale in futuro, chiamare pfStzRicalcolaCisterneForzato().
  return;
}

// Versione forzata, NON chiamata in automatico, disponibile per manutenzione
async function pfStzRicalcolaCisterneForzato(prodotto) {
  if (!prodotto) return;
  if (typeof pfData === 'undefined' || !pfData.getGiacenzaAllaData) {
    console.warn('[pfStzRicalcolaCisterneForzato] pfData non disponibile, skip');
    return;
  }
  try {
    var oggi = new Date().toISOString().split('T')[0];
    var giac = await pfData.getGiacenzaAllaData('stazione_oppido', prodotto, oggi);
    var totCalc = Math.max(0, Math.round(giac.calcolata));

    var { data: cisterne, error: errCis } = await sb.from('cisterne')
      .select('id,nome,livello_attuale,capacita_max')
      .eq('sede', 'stazione_oppido').eq('prodotto', prodotto)
      .order('nome');
    if (errCis || !cisterne || !cisterne.length) return;

    var sommaDb = cisterne.reduce(function(s, c) {
      return s + Number(c.livello_attuale || 0);
    }, 0);
    var delta = totCalc - Math.round(sommaDb);
    if (delta === 0) {
      console.log('[pfStzRicalcolaCisterne] ✓ ' + prodotto + ' già allineato (' + totCalc + ' L)');
      return;
    }

    var residuo = delta;
    var modifiche = [];
    for (var i = 0; i < cisterne.length && residuo !== 0; i++) {
      var c = cisterne[i];
      var liv = Number(c.livello_attuale || 0);
      var cap = Number(c.capacita_max || 0);
      var nuovo;
      if (residuo > 0) {
        var spazio = cap > 0 ? Math.max(0, cap - liv) : residuo;
        var aggiungi = Math.min(residuo, spazio);
        nuovo = Math.round(liv + aggiungi);
        residuo -= aggiungi;
      } else {
        var togli = Math.min(-residuo, liv);
        nuovo = Math.round(liv - togli);
        residuo += togli;
      }
      if (nuovo === Math.round(liv)) continue;
      await sb.from('cisterne').update({
        livello_attuale: nuovo,
        updated_at: new Date().toISOString()
      }).eq('id', c.id);
      modifiche.push(c.nome + ': ' + Math.round(liv) + '→' + nuovo);
    }
    var msg = '[pfStzRicalcolaCisterne] ✓ ' + prodotto + ' delta ' + (delta>=0?'+':'') + delta + ' L (tot ' + totCalc + ') | ' + modifiche.join(', ');
    if (residuo !== 0) msg += ' ⚠️ residuo non assorbibile: ' + residuo + ' L';
    console.log(msg);
  } catch (e) {
    console.warn('[pfStzRicalcolaCisterne] errore (non bloccante):', e);
  }
}

// ── STAZIONE OPPIDO ──────────────────────────────────────────────
function switchStazioneTab(btn) {
  document.querySelectorAll('.stz-tab').forEach(b => { b.style.background='var(--bg)'; b.style.color='var(--text)'; b.style.border='0.5px solid var(--border)'; b.classList.remove('active'); });
  btn.style.background=''; btn.style.color=''; btn.style.border=''; btn.classList.add('active');
  document.querySelectorAll('.stz-panel').forEach(p => p.style.display='none');
  document.getElementById(btn.dataset.tab).style.display='';
  const loaders = { 'stz-dashboard':caricaStazioneDashboard, 'stz-letture':caricaTabLetture, 'stz-prezzi':caricaTabPrezzi, 'stz-versamenti':caricaTabVersamenti, 'stz-magazzino':caricaMagazzinoStazione, 'stz-marginalita':caricaMarginalita, 'stz-cassa':caricaCassa, 'stz-foglio':caricaFoglioGiornaliero, 'stz-giacenze':caricaGiacenzeMensili, 'stz-allegati':caricaAllegati, 'stz-report':initReportStazione };
  if (loaders[btn.dataset.tab]) loaders[btn.dataset.tab]();
}

async function caricaStazione() {
  // Nascondi tab senza permesso
  _applicaPermessiTab('stazione', '.stz-tab', {
    'stz-dashboard':'stazione.dashboard', 'stz-letture':'stazione.letture',
    'stz-prezzi':'stazione.prezzi', 'stz-versamenti':'stazione.versamenti',
    'stz-magazzino':'stazione.magazzino', 'stz-marginalita':'stazione.marginalita',
    'stz-cassa':'stazione.cassa', 'stz-report':'stazione.report'
  });
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

  // Auto-heal cisterne: riallinea alla cascata pfData (stazione)
  try { await pfStzRicalcolaCisterne(prodotto); } catch (e) { console.warn('pfStzRicalcolaCisterne errore:', e); }

  toast('✅ ' + fmtL(totAssegnati) + ' ricevuti — CMP aggiornato a € ' + cmpNuovo.toFixed(4) + '/L');
  chiudiModal();
  caricaOrdiniDaCaricare();
  caricaStazioneDashboard();
}

let _stzDashCharts = {};
function _destroyStzDashCharts() { Object.values(_stzDashCharts).forEach(c=>c.destroy()); _stzDashCharts={}; }

async function caricaStazioneDashboard() {
  await caricaOrdiniDaCaricare();

  // Auto-heal cisterne stazione: riallinea alla cascata pfData per ogni prodotto
  // (analogo alla sentinella deposito - garantisce che la dashboard mostri sempre dati canonici)
  try {
    var { data: prodCisterne } = await sb.from('cisterne').select('prodotto').eq('sede','stazione_oppido');
    var prodSet = {};
    (prodCisterne || []).forEach(function(c){ if(c.prodotto) prodSet[c.prodotto] = true; });
    var prodList = Object.keys(prodSet);
    for (var i = 0; i < prodList.length; i++) {
      await pfStzRicalcolaCisterne(prodList[i]);
    }
  } catch (e) { console.warn('auto-heal stazione errore:', e); }

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
          const prezzo = Number(prezziMap[data+'_'+pompa.prodotto] || 0) / 1.22;
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
