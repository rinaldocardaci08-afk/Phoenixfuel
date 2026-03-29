// PhoenixFuel — Logistica
// ── LOGISTICA ─────────────────────────────────────────────────────

function switchLogisticaTab(btn) {
  document.querySelectorAll('.log-tab').forEach(function(t) {
    t.style.background = 'var(--bg)'; t.style.color = 'var(--text)';
    t.style.border = '0.5px solid var(--border)'; t.classList.remove('active');
  });
  btn.style.background = ''; btn.style.color = ''; btn.style.border = '';
  btn.classList.add('active');
  document.querySelectorAll('.log-panel').forEach(function(p) { p.style.display = 'none'; });
  document.getElementById(btn.dataset.tab).style.display = '';
}

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
  var w = _apriReport("Report viaggi"); if (!w) return;
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

  w.document.open();
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

  // ═══ GENERA DAS AUTOMATICI per ogni ordine del carico ═══
  await _generaDasPerCarico(carico.id, ordiniCarico || [], mezzoTarga.split(' (')[0], autista, data);

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
      await confermaUscitaDeposito(id, true);
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
      await confermaUscitaDeposito(co.ordine_id, true);
    } else {
      await sb.from('ordini').update({ stato:'confermato' }).eq('id', co.ordine_id);
    }
    confermati++;
  }
  toast(confermati + ' consegne confermate!');
  chiudiModal();
  caricaCarichi();
}


// ── DAS DOCUMENTI ────────────────────────────────────────────────

var _dasDescrProdotti = {
  'Gasolio Autotrazione': {
    codice: 'E43027102011',
    adr: 'Gasolio Auto 10 PPM — ADR: UN 1202 GASOLIO, III (D/E) DISP.SPEC.640L',
    desc: 'Oli di petrolio o di minerali bituminosi, diversi dagli oli greggi, e preparazioni non nominate né comprese altrove, contenuti biodiesel, diversi dai residui degli oli da gas - aventi tenore, in peso, di zolfo inferiore o uguale a 0,001 %',
    densita_amb: 826.20, densita_15: 828.90
  },
  'Benzina': {
    codice: 'E43021101011',
    adr: 'Benzina — ADR: UN 1203 BENZINA, II (D/E)',
    desc: 'Benzine per motori, aventi tenore in peso di zolfo inferiore o uguale a 0,001%',
    densita_amb: 740.00, densita_15: 742.00
  },
  'Gasolio Agricolo': {
    codice: 'E43027102011',
    adr: 'Gasolio Agricolo — ADR: UN 1202 GASOLIO, III (D/E) DISP.SPEC.640L',
    desc: 'Gasolio per uso agricolo con marcatori e coloranti, aventi tenore, in peso, di zolfo inferiore o uguale a 0,001 %',
    densita_amb: 826.20, densita_15: 828.90
  }
};

async function _generaDasPerCarico(caricoId, ordini, targa, autista, data) {
  if (!ordini || !ordini.length) return;
  var anno = new Date(data).getFullYear();
  var dasInserts = [];

  // Precarica tutti i clienti necessari in una sola query
  var clientiIds = ordini.map(function(o){return o.cliente_id;}).filter(Boolean);
  var clientiMap = {};
  if (clientiIds.length) {
    var { data: clientiData } = await sb.from('clienti').select('id,piva,nome,indirizzo,citta,provincia').in('id', clientiIds);
    (clientiData||[]).forEach(function(c) { clientiMap[c.id] = c; });
  }

  for (var i = 0; i < ordini.length; i++) {
    var o = ordini[i];
    var cl = o.cliente_id ? clientiMap[o.cliente_id] : null;
    var dest = {
      piva: cl ? (cl.piva||'') : '',
      ragsoc: cl ? cl.nome : (o.cliente||''),
      indirizzo: cl ? (cl.indirizzo||'') : '',
      citta: cl ? ((cl.citta||'') + (cl.provincia ? ' (' + cl.provincia + ')' : '')) : ''
    };
    // Sede scarico se presente
    if (o.sede_scarico_nome) {
      dest.indirizzo = o.sede_scarico_nome;
    }

    var info = _dasDescrProdotti[o.prodotto] || _dasDescrProdotti['Gasolio Autotrazione'];
    var litri = Number(o.litri);
    var pesoNetto = Math.round(litri * info.densita_amb / 1000);
    var litri15 = Math.round(litri * info.densita_amb / info.densita_15);

    dasInserts.push({
      anno: anno,
      ordine_id: o.id,
      carico_id: caricoId,
      data: data,
      dest_piva: dest.piva,
      dest_ragsoc: dest.ragsoc,
      dest_indirizzo: dest.indirizzo,
      dest_citta: dest.citta,
      mezzo_targa: targa,
      autista: autista,
      prodotto: o.prodotto,
      codice_prodotto: info.codice,
      descrizione_adr: info.adr,
      litri_ambiente: litri,
      litri_15: litri15,
      peso_netto_kg: pesoNetto,
      densita_ambiente: info.densita_amb,
      densita_15: info.densita_15
    });
  }

  if (dasInserts.length) {
    var { error } = await sb.from('das_documenti').insert(dasInserts);
    if (error) console.warn('Errore DAS:', error.message);
    else _auditLog('genera_das', 'das_documenti', dasInserts.length + ' DAS generati per carico ' + caricoId);
  }
}

async function stampaDas(dasId) {
  var w = _apriReport("DAS"); if (!w) return;
  var { data: das } = await sb.from('das_documenti').select('*').eq('id', dasId).single();
  if (!das) { toast('DAS non trovato'); return; }
  var numDas = 'DAS-' + das.anno + '/' + String(das.numero_progressivo).padStart(4,'0');
  var info = _dasDescrProdotti[das.prodotto] || _dasDescrProdotti['Gasolio Autotrazione'];

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>' + numDas + '</title>' +
    '<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:10mm;color:#1a1a18}' +
    '@media print{.no-print{display:none!important}@page{size:A4 portrait;margin:8mm}}' +
    '.db{border:1.5px solid #333;max-width:700px;margin:0 auto}' +
    '.dh{text-align:center;padding:12px;border-bottom:1.5px solid #333}' +
    '.dr{display:flex;border-bottom:1px solid #ccc}.dc{flex:1;padding:6px 10px;border-right:1px solid #ccc}.dc:last-child{border-right:none}' +
    '.dl{font-size:8px;text-transform:uppercase;color:#666;letter-spacing:0.3px;margin-bottom:2px;font-weight:600}' +
    '.dv{font-size:11px;font-weight:500}' +
    '.ds{background:#f0f0f0;padding:5px 10px;font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;border-bottom:1px solid #ccc;color:#444}' +
    '.df{display:flex;padding:4px 10px;border-bottom:1px solid #eee}.dfl{width:220px;font-size:9px;color:#666}.dfv{flex:1;font-size:11px;font-weight:500}' +
    '</style></head><body>';

  html += '<div class="db" style="position:relative">';
  html += '<div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-30deg);font-size:55px;color:rgba(107,95,204,0.07);font-weight:900;letter-spacing:5px;pointer-events:none">COPIA INTERNA</div>';

  // Header
  html += '<div class="dh"><div style="font-size:13px;font-weight:700;letter-spacing:2px;color:#6B5FCC">PHOENIX FUEL SRL</div>';
  html += '<div style="font-size:16px;font-weight:700;margin:4px 0">DOCUMENTO DI ACCOMPAGNAMENTO</div>';
  html += '<div style="font-size:11px;color:#666">Copia interna — pre-compilazione e-DAS</div></div>';

  // Numero
  html += '<div style="text-align:center;padding:10px;border-bottom:1.5px solid #333;background:#fafafa">';
  html += '<div style="font-size:8px;color:#888;text-transform:uppercase;letter-spacing:1px;margin-bottom:2px">Riferimento interno</div>';
  html += '<div style="font-size:20px;font-weight:700;letter-spacing:2px">' + numDas + '</div></div>';

  // Mittente / Destinatario
  html += '<div class="dr"><div class="dc"><div class="dl">Deposito mittente</div><div class="dv">' + esc(das.mittente_codice) + '</div>';
  html += '<div style="font-weight:600;margin-top:2px">' + esc(das.mittente_ragsoc) + '</div>';
  html += '<div style="font-size:10px;color:#555">' + esc(das.mittente_indirizzo) + '</div>';
  html += '<div style="font-size:10px;color:#555">' + esc(das.mittente_citta) + '</div></div>';
  html += '<div class="dc"><div class="dl">Destinatario</div><div class="dv">' + esc(das.dest_piva || '') + '</div>';
  html += '<div style="font-weight:600;margin-top:2px">' + esc(das.dest_ragsoc) + '</div>';
  html += '<div style="font-size:10px;color:#555">' + esc(das.dest_indirizzo || '') + '</div>';
  html += '<div style="font-size:10px;color:#555">' + esc(das.dest_citta || '') + '</div></div></div>';

  html += '<div class="dr"><div class="dc"><div class="dl">Data</div><div class="dv">' + das.data + '</div></div>';
  html += '<div class="dc"><div class="dl">P.IVA Mittente</div><div class="dv">' + esc(das.mittente_piva) + '</div></div></div>';

  // Trasporto
  html += '<div class="ds">Trasportatore / mezzo di trasporto</div>';
  html += '<div class="df"><div class="dfl">Modalità trasporto:</div><div class="dfv">Trasporto stradale</div></div>';
  html += '<div class="df"><div class="dfl">Tipo mezzo:</div><div class="dfv">Veicolo</div></div>';
  html += '<div class="df"><div class="dfl">Identificativo mezzo:</div><div class="dfv" style="font-size:13px;font-weight:700;letter-spacing:1px">' + esc(das.mezzo_targa || '') + '</div></div>';
  html += '<div class="df"><div class="dfl">Primo vettore:</div><div class="dfv">' + esc(das.mittente_piva) + ' — ' + esc(das.mittente_ragsoc) + '</div></div>';
  html += '<div class="df"><div class="dfl">Primo incaricato del trasporto:</div><div class="dfv">' + esc(das.autista || '') + '</div></div>';

  // Prodotto
  html += '<div class="ds">Prodotto n°: 1</div>';
  html += '<div style="padding:6px 10px;font-size:9px;color:#555;line-height:1.4;border-bottom:1px solid #eee">' + esc(info.desc) + '</div>';
  html += '<div style="padding:6px 10px;font-size:11px;font-weight:600;border-bottom:1px solid #ccc">' + esc(das.descrizione_adr || '') + '</div>';

  html += '<div class="dr"><div class="dc"><div class="dl">Codice del prodotto</div><div class="dv" style="font-family:monospace">' + esc(das.codice_prodotto || '') + '</div></div>';
  html += '<div class="dc"><div class="dl">Peso Netto (kg)</div><div class="dv" style="font-family:monospace;font-size:14px">' + fmtL(das.peso_netto_kg || 0) + '</div></div></div>';

  html += '<div class="dr"><div class="dc"><div class="dl">Volume a temp. ambiente (lt)</div><div class="dv" style="font-family:monospace;font-size:16px;color:#6B5FCC;font-weight:700">' + fmtL(das.litri_ambiente || 0) + '</div></div>';
  html += '<div class="dc"><div class="dl">Volume a 15° (lt)</div><div class="dv" style="font-family:monospace;font-size:14px">' + fmtL(das.litri_15 || 0) + '</div></div></div>';

  html += '<div class="dr"><div class="dc"><div class="dl">Densità a temp. ambiente (kg/mc)</div><div class="dv" style="font-family:monospace">' + Number(das.densita_ambiente || 0).toFixed(2).replace('.', ',') + '</div></div>';
  html += '<div class="dc"><div class="dl">Densità a 15° (kg/mc)</div><div class="dv" style="font-family:monospace">' + Number(das.densita_15 || 0).toFixed(2).replace('.', ',') + '</div></div></div>';

  html += '<div style="padding:6px 10px;font-size:10px;color:#555;border-bottom:1px solid #ccc">Liquidi alla rinfusa</div>';

  // Firme
  html += '<div class="dr" style="min-height:50px"><div class="dc"><div class="dl">Firma speditore</div></div>';
  html += '<div class="dc"><div class="dl">Firma autista</div></div>';
  html += '<div class="dc"><div class="dl">Firma destinatario</div></div></div>';

  // Footer
  html += '<div style="text-align:center;padding:8px;font-size:8px;color:#999;border-top:1px solid #ccc">';
  html += 'PhoenixFuel Srl — ' + numDas + ' — Generato il ' + new Date(das.created_at).toLocaleDateString('it-IT') + ' · Questo documento NON sostituisce l\'e-DAS ufficiale ADM</div>';
  html += '</div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div>';
  html += '</body></html>';

  w.document.open(); w.document.write(html); w.document.close();
}

async function mostraDasOrdine(ordineId) {
  var { data: dasList } = await sb.from('das_documenti').select('*').eq('ordine_id', ordineId).order('created_at',{ascending:false});
  if (!dasList || !dasList.length) { toast('Nessun DAS per questo ordine'); return; }
  if (dasList.length === 1) { stampaDas(dasList[0].id); return; }
  // Più DAS → mostra lista
  var html = '<div style="font-size:15px;font-weight:500;margin-bottom:12px">DAS per questo ordine</div>';
  dasList.forEach(function(d) {
    var num = 'DAS-' + d.anno + '/' + String(d.numero_progressivo).padStart(4,'0');
    html += '<div style="display:flex;justify-content:space-between;align-items:center;padding:10px 14px;background:var(--bg);border-radius:8px;margin-bottom:6px">';
    html += '<div><strong>' + num + '</strong><span style="font-size:11px;color:var(--text-muted);margin-left:8px">' + d.data + ' · ' + esc(d.prodotto) + ' · ' + fmtL(d.litri_ambiente) + '</span></div>';
    html += '<button class="btn-primary" style="font-size:11px;padding:5px 14px" onclick="stampaDas(\'' + d.id + '\')">🖨️ Stampa</button>';
    html += '</div>';
  });
  apriModal(html);
}
