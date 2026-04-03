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
  _labelGiorno('car-data');
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
    return '<tr><td>' + fmtD(c.data) + '</td><td>' + (c.mezzo_targa||'—') + '</td><td>' + (c.autista||'—') + '</td><td style="font-family:var(--font-mono)">' + fmtL(totLitri) + '</td><td style="font-size:11px;color:var(--text-muted)">' + prodotti + '</td><td>' + nConsegne + ' consegne</td><td>' + badgeStato(c.stato) + ' <button class="btn-edit" title="Foglio viaggio" onclick="apriFoglioViaggio(\'' + c.id + '\')">🖨️</button><button class="btn-edit" onclick="apriDettaglioCarico(\'' + c.id + '\')">👁</button><button class="btn-danger" onclick="eliminaRecord(\'carichi\',\'' + c.id + '\',caricaCarichi)">x</button></td></tr>';
  }).join('');
}

function apriFoglioViaggio(caricoId) {
  window.open('foglio_viaggio.html?carico_id=' + caricoId, '_blank');
}

async function apriConfermaOrdine(ordineId) {
  var {data:ord}=await sb.from('ordini').select('*').eq('id',ordineId).single();
  if(!ord){toast('Ordine non trovato');return;}
  var {data:tutti}=await sb.from('ordini').select('*').eq('cliente',ord.cliente).eq('data',ord.data).neq('stato','annullato').order('prodotto');
  if(!tutti||!tutti.length) tutti=[ord];
  var cl=null;
  if(ord.cliente_id){var r=await sb.from('clienti').select('nome,piva,indirizzo,citta,provincia,telefono').eq('id',ord.cliente_id).single();cl=r.data;}
  var w=_apriReport('Conferma ordine');if(!w)return;
  var GIORNI=['Domenica','Lunedi','Martedi','Mercoledi','Giovedi','Venerdi','Sabato'];
  var MESI=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var dt=new Date(ord.data+'T12:00:00');
  var dataFmt=dt.getDate()+' '+MESI[dt.getMonth()]+' '+dt.getFullYear();
  var giornoFmt=GIORNI[dt.getDay()]+' '+dataFmt;
  var totLitri=0,totGen=0;
  tutti.forEach(function(o){totLitri+=Number(o.litri);totGen+=prezzoConIva(o)*Number(o.litri);});
  var colProd={'Gasolio Autotrazione':'#D4A017','Benzina':'#378ADD','Gasolio Agricolo':'#639922','HVO':'#1D9E75'};
  var h='<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Conferma ordine '+esc(ord.cliente)+'</title>';
  h+='<style>body{font-family:Arial,sans-serif;font-size:11px;margin:0;padding:12mm 16mm;color:#1a1a18}';
  h+='@media print{.no-print{display:none!important}@page{size:landscape;margin:10mm}}';
  h+='table{width:100%;border-collapse:collapse}';
  h+='th{padding:10px 14px;font-size:9px;text-transform:uppercase;letter-spacing:0.5px}';
  h+='td{padding:10px 14px}.m{font-family:Courier New,monospace;text-align:right}</style></head><body>';
  h+='<div style="position:absolute;top:0;left:0;right:0;height:5px;background:linear-gradient(90deg,#D85A30,#D4A017)"></div>';
  h+='<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:20px;padding-top:8px">';
  h+='<div><div style="font-size:26px;font-weight:bold;color:#D85A30;letter-spacing:1px">CONFERMA D\'ORDINE</div>';
  h+='<div style="font-size:11px;color:#888;margin-top:3px">'+giornoFmt+'</div></div>';
  h+='<div style="text-align:right"><div style="font-size:18px;font-weight:bold;letter-spacing:2px;color:#D4A017">PHOENIX FUEL</div>';
  h+='<div style="font-size:9px;color:#888">SRL — P.IVA 02744150802</div>';
  h+='<div style="font-size:9px;color:#888">Vibo Valentia (VV) — Calabria</div></div></div>';
  h+='<div style="display:flex;gap:16px;margin-bottom:20px">';
  h+='<div style="flex:1;background:#f8f7f2;border-radius:10px;padding:14px 18px;border-left:4px solid #D85A30">';
  h+='<div style="font-size:8px;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:5px">Cliente</div>';
  h+='<div style="font-size:15px;font-weight:bold">'+esc(ord.cliente)+'</div>';
  if(cl){
    if(cl.piva) h+='<div style="font-size:10px;color:#666;margin-top:2px">P.IVA '+esc(cl.piva)+'</div>';
    if(cl.indirizzo) h+='<div style="font-size:10px;color:#666">'+esc(cl.indirizzo)+(cl.citta?' — '+esc(cl.citta):'')+(cl.provincia?' ('+esc(cl.provincia)+')':'')+'</div>';
    if(cl.telefono) h+='<div style="font-size:10px;color:#666">Tel. '+esc(cl.telefono)+'</div>';
  }
  h+='</div>';
  h+='<div style="flex:1;background:#f8f7f2;border-radius:10px;padding:14px 18px;border-left:4px solid #D4A017">';
  h+='<div style="font-size:8px;text-transform:uppercase;color:#888;letter-spacing:0.5px;margin-bottom:5px">Dettagli consegna</div>';
  h+='<div style="font-size:13px;font-weight:600">'+giornoFmt+'</div>';
  if(ord.destinazione) h+='<div style="font-size:10px;color:#666;margin-top:2px">Destinazione: '+esc(ord.destinazione)+'</div>';
  h+='<div style="font-size:10px;color:#666">Pagamento: '+(ord.giorni_pagamento||30)+' giorni</div>';
  h+='<div style="font-size:10px;color:#666">Scadenza: '+fmtD(ord.data_scadenza||'')+'</div>';
  h+='</div></div>';
  h+='<table><thead><tr style="background:#D85A30">';
  h+='<th style="color:#fff;text-align:left;border-radius:6px 0 0 0">Prodotto</th>';
  h+='<th style="color:#fff;text-align:right">Quantita (L)</th>';
  h+='<th style="color:#fff;text-align:right">Prezzo netto/L</th>';
  h+='<th style="color:#fff;text-align:center">IVA</th>';
  h+='<th style="color:#fff;text-align:right">Prezzo IVA/L</th>';
  h+='<th style="color:#fff;text-align:right;border-radius:0 6px 0 0">Totale</th>';
  h+='</tr></thead><tbody>';
  tutti.forEach(function(o,i){
    var pN=prezzoNoIva(o);var pI=prezzoConIva(o);var tot=pI*Number(o.litri);
    var cp=colProd[o.prodotto]||'#888';
    var bg=i%2?'background:#fafaf5':'';
    h+='<tr style="border-bottom:0.5px solid #e8e6df;'+bg+'">';
    h+='<td><div style="display:flex;align-items:center;gap:8px"><div style="width:10px;height:10px;border-radius:50%;background:'+cp+'"></div><span style="font-weight:600;font-size:13px">'+esc(o.prodotto)+'</span></div></td>';
    h+='<td class="m" style="font-size:14px;font-weight:600">'+fmtL(o.litri)+'</td>';
    h+='<td class="m" style="font-size:13px">'+fmt(pN)+'</td>';
    h+='<td style="text-align:center;font-size:12px">'+(o.iva||22)+'%</td>';
    h+='<td class="m" style="font-size:13px;font-weight:600">'+fmt(pI)+'</td>';
    h+='<td class="m" style="font-size:14px;font-weight:bold">'+fmtE(tot)+'</td></tr>';
  });
  h+='<tr style="background:#FAECE7"><td style="font-weight:600;font-size:12px;border-radius:0 0 0 6px" colspan="4">TOTALE ORDINE — '+tutti.length+' prodott'+(tutti.length>1?'i':'o')+' — '+fmtL(totLitri)+'</td><td></td>';
  h+='<td class="m" style="font-size:18px;font-weight:bold;color:#D85A30;border-radius:0 0 6px 0">'+fmtE(totGen)+'</td></tr>';
  h+='</tbody></table>';
  h+='<div style="display:flex;justify-content:space-between;margin-top:50px">';
  h+='<div style="width:35%"><div style="border-top:1.5px solid #333;padding-top:8px;text-align:center"><div style="font-size:10px;color:#888">Per accettazione</div><div style="font-size:11px;font-weight:600;margin-top:2px">Phoenix Fuel SRL</div></div></div>';
  h+='<div style="width:35%"><div style="border-top:1.5px solid #333;padding-top:8px;text-align:center"><div style="font-size:10px;color:#888">Timbro e firma cliente</div><div style="font-size:11px;font-weight:600;margin-top:2px">'+esc(ord.cliente)+'</div></div></div></div>';
  h+='<div style="position:absolute;bottom:10mm;left:16mm;right:16mm;text-align:center;font-size:8px;color:#bbb;border-top:0.5px solid #eee;padding-top:6px">Phoenix Fuel SRL — Vibo Valentia (VV) — P.IVA 02744150802 — Documento generato il '+new Date().toLocaleDateString('it-IT')+'</div>';
  h+='<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px"><button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#D85A30;color:#fff">Stampa / PDF</button><button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">Chiudi</button></div></body></html>';
  w.document.open();w.document.write(h);w.document.close();
}


async function apriListinoPDF() {
  if (!_listinoData || !_listinoData.length) await generaListinoPrezzi();
  if (_listinoData && _listinoData.length) stampaListinoPrezzi();
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
  const { data: carico } = await sb.from('carichi').select('*, carico_ordini(sequenza, ordine_id, ordini(id,cliente,cliente_id,prodotto,litri,note,stato,fornitore,destinazione,costo_litro,trasporto_litro,margine,iva))').eq('id', caricoId).single();
  if (!carico) return;
  const ordini = carico.carico_ordini ? [...carico.carico_ordini].sort((a,b)=>a.sequenza-b.sequenza) : [];
  const nonConfermati = ordini.filter(o => o.ordini && o.ordini.stato !== 'confermato');

  // Carica DAS per tutti gli ordini del carico
  var ordineIds = ordini.map(function(o){return o.ordine_id;}).filter(Boolean);
  var dasMap = {};
  if (ordineIds.length) {
    var { data: dasList } = await sb.from('das_documenti').select('*').in('ordine_id', ordineIds);
    (dasList||[]).forEach(function(d) { if(!dasMap[d.ordine_id]) dasMap[d.ordine_id]=[]; dasMap[d.ordine_id].push(d); });
  }

  var html = '<div style="font-size:15px;font-weight:500;margin-bottom:4px">Dettaglio carico — ' + fmtD(carico.data) + '</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">Mezzo: ' + (carico.mezzo_targa||'—') + ' · Autista: ' + (carico.autista||'—') + ' · ' + ordini.length + ' consegne' + (nonConfermati.length ? ' · <span style="color:#BA7517">' + nonConfermati.length + ' da confermare</span>' : ' · <span style="color:#639922">tutte confermate</span>') + '</div>';

  html += '<div style="display:flex;flex-direction:column;gap:12px;margin-bottom:16px">';
  ordini.forEach(function(o) {
    var r = o.ordini; if (!r) return;
    var dasOrdine = dasMap[r.id] || [];
    var isDirottato = r.note && r.note.indexOf('DIROTTATO') >= 0;
    var borderCol = isDirottato ? '#D85A30' : '#BA7517';

    html += '<div style="border:0.5px solid var(--border);border-left:4px solid ' + borderCol + ';border-radius:0;padding:14px 18px">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;flex-wrap:wrap;gap:6px">';
    html += '<div><div style="font-size:14px;font-weight:500">' + o.sequenza + '. ' + esc(r.cliente) + '</div>';
    html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px">' + esc(r.prodotto) + ' · <span style="font-family:var(--font-mono);font-weight:500">' + fmtL(r.litri) + '</span>' + (r.destinazione ? ' · 📍 ' + esc(r.destinazione) : '') + '</div></div>';
    html += '<div style="display:flex;gap:4px;align-items:center">' + badgeStato(r.stato);
    if (r.stato !== 'confermato' && r.stato !== 'annullato') {
      html += ' <button class="btn-primary" style="font-size:10px;padding:3px 10px" onclick="confermaOrdineSingoloCarico(\'' + r.id + '\',\'' + caricoId + '\')">✅ Conferma</button>';
    }
    html += '</div></div>';

    // DAS badges
    html += '<div style="display:flex;gap:8px;align-items:center;margin-top:8px;flex-wrap:wrap">';
    if (dasOrdine.length) {
      dasOrdine.forEach(function(d) {
        var numDas = 'DAS-' + d.anno + '/' + String(d.numero_progressivo).padStart(4,'0');
        var nota = d.note_dirottamento || '';
        var bgDas = nota.indexOf('NON SCORTA') >= 0 ? '#FCEBEB' : nota.indexOf('Vers.') >= 0 ? '#D85A30' : '#FAEEDA';
        var colDas = nota.indexOf('NON SCORTA') >= 0 ? '#791F1F' : nota.indexOf('Vers.') >= 0 ? '#fff' : '#854F0B';
        html += '<span style="font-size:10px;background:' + bgDas + ';color:' + colDas + ';padding:3px 10px;border-radius:6px;font-weight:500;cursor:pointer" onclick="stampaDas(\'' + d.id + '\')">' + numDas + (nota ? ' ' + nota : '') + '</span>';
      });
    } else {
      html += '<span style="font-size:10px;color:var(--text-hint)">Nessun DAS</span>';
    }
    html += '<button style="font-size:11px;padding:5px 14px;background:#D85A30;color:#fff;border:none;border-radius:6px;cursor:pointer;font-weight:500;margin-left:auto" onclick="apriDirottamento(\'' + r.id + '\',\'' + caricoId + '\')">Dirottamento</button>';
    html += '</div></div>';
  });
  html += '</div>';

  html += '<div style="display:flex;gap:8px;flex-wrap:wrap">';
  if (nonConfermati.length) {
    html += '<button class="btn-primary" style="flex:1;background:#639922" onclick="confermaTutteConsegneCarico(\'' + caricoId + '\')">✅ Conferma tutte (' + nonConfermati.length + ')</button>';
  }
  html += '<button class="btn-primary" style="flex:1" onclick="apriFoglioViaggio(\'' + caricoId + '\')">🖨️ Foglio viaggio</button><button onclick="chiudiModalePermessi()" style="flex:1;padding:9px 16px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Chiudi</button></div>';
  apriModal(html);
}

async function confermaOrdineSingoloCarico(ordineId, caricoId) {
  var { data: ordine, error: errFetch } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (errFetch || !ordine) { toast('Ordine non trovato: ' + (errFetch ? errFetch.message : '')); return; }
  if (ordine.stato === 'confermato') { toast('Ordine già confermato'); chiudiModalePermessi(); apriDettaglioCarico(caricoId); return; }
  if (!confirm('Confermare consegna di ' + fmtL(ordine.litri) + ' di ' + ordine.prodotto + ' a ' + ordine.cliente + '?')) return;
  
  var errore = null;
  // Se ha già cisterna_id assegnata → lo scarico è già stato fatto, conferma diretto
  if (ordine.cisterna_id) {
    var { error: errUpd } = await sb.from('ordini').update({ stato:'confermato' }).eq('id', ordineId);
    if (errUpd) errore = errUpd.message;
  } else if (ordine.fornitore && ordine.fornitore.toLowerCase().includes('phoenix')) {
    try { await confermaUscitaDeposito(ordineId, true); } catch(e) { errore = e.message; }
  } else {
    var { error: errUpd2 } = await sb.from('ordini').update({ stato:'confermato' }).eq('id', ordineId);
    if (errUpd2) errore = errUpd2.message;
  }
  
  if (errore) { toast('Errore conferma: ' + errore); return; }
  toast('✅ Ordine confermato!');
  chiudiModalePermessi();
  setTimeout(function() { apriDettaglioCarico(caricoId); }, 300);
}

async function confermaTutteConsegneCarico(caricoId) {
  const { data: caricoOrdini } = await sb.from('carico_ordini').select('ordine_id, ordini(id,stato,fornitore,cisterna_id)').eq('carico_id', caricoId);
  if (!caricoOrdini || !caricoOrdini.length) { toast('Nessun ordine nel carico'); return; }
  const daConfermare = caricoOrdini.filter(co => co.ordini && co.ordini.stato !== 'confermato');
  if (!daConfermare.length) { toast('Tutti gli ordini sono già confermati'); return; }
  if (!confirm('Confermare ' + daConfermare.length + ' consegne di questo carico?')) return;

  let confermati = 0;
  for (const co of daConfermare) {
    if (co.ordini.cisterna_id) {
      await sb.from('ordini').update({ stato:'confermato' }).eq('id', co.ordine_id);
    } else if (co.ordini.fornitore && co.ordini.fornitore.toLowerCase().includes('phoenix')) {
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


// ══════════════════════════════════════════════════════════════════
// DIROTTAMENTO ORDINE
// ══════════════════════════════════════════════════════════════════

async function apriDirottamento(ordineId, caricoId) {
  var { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }

  // Carica DAS dell'ordine
  var { data: dasList } = await sb.from('das_documenti').select('*').eq('ordine_id', ordineId).order('created_at',{ascending:false}).limit(1);
  var dasInfo = dasList && dasList.length ? dasList[0] : null;
  var dasLabel = dasInfo ? 'DAS-' + dasInfo.anno + '/' + String(dasInfo.numero_progressivo).padStart(4,'0') : 'Nessun DAS';

  // Carica clienti
  if (!cacheClienti.length) await caricaSelectClienti('ord-cliente');
  var opzClienti = cacheClienti.map(function(c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('');

  var litriMax = Number(ordine.litri);
  window._dirottamentoData = { ordine: ordine, das: dasInfo, caricoId: caricoId };

  var html = '<div style="font-size:16px;font-weight:600;color:#D85A30;margin-bottom:4px">Dirottamento ordine</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">' + esc(ordine.cliente) + ' · ' + esc(ordine.prodotto) + ' · <strong>' + fmtL(litriMax) + '</strong> · ' + dasLabel + '</div>';

  // Slider litri
  html += '<div style="background:#FAECE7;border-radius:8px;padding:14px 18px;margin-bottom:16px">';
  html += '<div style="font-size:12px;font-weight:500;color:#712B13;margin-bottom:8px">Litri da dirottare</div>';
  html += '<div style="display:flex;align-items:center;gap:12px">';
  html += '<input type="range" id="dir-slider" min="100" max="' + litriMax + '" value="' + litriMax + '" step="100" oninput="_aggiornaSliderDirottamento(' + litriMax + ')" style="flex:1" />';
  html += '<div style="display:flex;align-items:center;gap:4px"><input type="number" id="dir-litri" value="' + litriMax + '" min="100" max="' + litriMax + '" step="100" oninput="_aggiornaInputDirottamento(' + litriMax + ')" style="width:100px;font-family:var(--font-mono);font-size:16px;text-align:right;padding:6px 8px" /><span style="font-size:13px;color:#993C1D">L</span></div>';
  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;margin-top:8px">';
  html += '<div style="background:#E6F1FB;border-radius:6px;padding:6px 12px"><span style="font-size:10px;color:#0C447C">Restano a ' + esc(ordine.cliente).substring(0,20) + ':</span> <strong id="dir-resta" style="font-family:var(--font-mono);color:#0C447C">0 L</strong></div>';
  html += '<div style="background:#FAECE7;border-radius:6px;padding:6px 12px"><span style="font-size:10px;color:#712B13">Dirottati:</span> <strong id="dir-dirot" style="font-family:var(--font-mono);color:#D85A30">' + fmtL(litriMax) + '</strong></div>';
  html += '</div></div>';

  // Dati nuovo cliente
  html += '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">';
  html += '<div><label style="font-size:12px;font-weight:500;color:var(--text);display:block;margin-bottom:4px">Nuovo cliente</label><select id="dir-cliente" onchange="_caricaSediDirottamento()" style="width:100%;font-size:13px;padding:8px 12px;border:1px solid var(--border);border-radius:8px">' + '<option value="">Seleziona...</option>' + opzClienti + '</select></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div><label style="font-size:12px;font-weight:500;color:var(--text);display:block;margin-bottom:4px">Prezzo netto €/L</label><input type="number" id="dir-prezzo" step="0.0001" value="' + (Number(ordine.costo_litro)+Number(ordine.trasporto_litro)+Number(ordine.margine)).toFixed(4) + '" style="width:100%;font-family:var(--font-mono);font-size:14px;padding:8px 12px;border:1px solid var(--border);border-radius:8px" /></div>';
  html += '<div><label style="font-size:12px;font-weight:500;color:var(--text);display:block;margin-bottom:4px">Sede di scarico</label><select id="dir-sede" style="width:100%;font-size:13px;padding:8px 12px;border:1px solid var(--border);border-radius:8px"><option value="">— Seleziona cliente —</option></select></div>';
  html += '</div></div>';

  // Riepilogo
  html += '<div id="dir-riepilogo" style="background:#FAEEDA;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#633806;line-height:1.6"></div>';

  html += '<div style="display:flex;gap:8px">';
  html += '<button class="btn-primary" style="flex:1;padding:12px;font-size:14px;background:#D85A30" onclick="eseguiDirottamento()">Conferma dirottamento</button>';
  html += '<button onclick="chiudiModalePermessi()" style="padding:12px 20px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer;font-size:14px">Annulla</button>';
  html += '</div>';

  apriModal(html);
  _aggiornaSliderDirottamento(litriMax);
}

function _aggiornaSliderDirottamento(max) {
  var val = parseInt(document.getElementById('dir-slider').value) || 0;
  document.getElementById('dir-litri').value = val;
  _aggiornaRiepilogoDirottamento(max, val);
}

function _aggiornaInputDirottamento(max) {
  var val = parseInt(document.getElementById('dir-litri').value) || 0;
  if (val > max) val = max;
  if (val < 0) val = 0;
  document.getElementById('dir-slider').value = val;
  _aggiornaRiepilogoDirottamento(max, val);
}

function _aggiornaRiepilogoDirottamento(max, dirottati) {
  var resta = max - dirottati;
  document.getElementById('dir-resta').textContent = resta > 0 ? fmtL(resta) : '0 L (ordine eliminato)';
  document.getElementById('dir-dirot').textContent = fmtL(dirottati);
  var d = window._dirottamentoData; if (!d) return;
  var dasLabel = d.das ? 'DAS-' + d.das.anno + '/' + String(d.das.numero_progressivo).padStart(4,'0') : 'DAS';
  var riepilogo = '<div style="font-weight:500;margin-bottom:4px">Cosa succede:</div>';
  if (resta > 0) {
    riepilogo += '<div>Ordine ' + esc(d.ordine.cliente) + ' ridotto da ' + fmtL(max) + ' a ' + fmtL(resta) + '</div>';
    riepilogo += '<div>Nuovo ordine per ' + fmtL(dirottati) + ' aggiunto al carico</div>';
    riepilogo += '<div>' + dasLabel + ' aggiornato con <strong>NON SCORTA MERCE</strong></div>';
    riepilogo += '<div>Nuovo ' + dasLabel + ' <strong>Vers.2</strong> per il nuovo cliente</div>';
  } else {
    riepilogo += '<div>Ordine ' + esc(d.ordine.cliente) + ' <strong>eliminato</strong> (tutti i ' + fmtL(max) + ' dirottati)</div>';
    riepilogo += '<div>Nuovo ordine creato per il nuovo cliente</div>';
    riepilogo += '<div>' + dasLabel + ' aggiornato con <strong>Vers.2</strong> per il nuovo cliente</div>';
  }
  document.getElementById('dir-riepilogo').innerHTML = riepilogo;
}

async function _caricaSediDirottamento() {
  var clienteId = document.getElementById('dir-cliente').value;
  var sel = document.getElementById('dir-sede');
  sel.innerHTML = '<option value="">— Nessuna —</option>';
  if (!clienteId) return;
  var { data: sedi } = await sb.from('sedi_scarico').select('*').eq('cliente_id', clienteId).eq('attivo', true).order('is_default',{ascending:false}).order('nome');
  if (sedi && sedi.length) {
    sedi.forEach(function(s) {
      var label = s.nome + (s.indirizzo ? ' — ' + s.indirizzo : '') + (s.citta ? ', ' + s.citta : '');
      sel.innerHTML += '<option value="' + esc(label) + '"' + (s.is_default ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
  }
  sel.innerHTML += '<option value="__manuale__">Altro (manuale)</option>';
}

async function eseguiDirottamento() {
  var d = window._dirottamentoData; if (!d) return;
  var litriDirottati = parseInt(document.getElementById('dir-litri').value) || 0;
  var nuovoClienteId = document.getElementById('dir-cliente').value;
  var prezzoNetto = parseFloat(document.getElementById('dir-prezzo').value) || 0;
  var sede = document.getElementById('dir-sede').value;

  if (!nuovoClienteId) { toast('Seleziona il nuovo cliente'); return; }
  if (litriDirottati <= 0) { toast('Inserisci i litri da dirottare'); return; }
  if (sede === '__manuale__') sede = prompt('Inserisci la destinazione manuale:') || '';

  var { data: nuovoCliente } = await sb.from('clienti').select('id,nome,giorni_pagamento').eq('id', nuovoClienteId).single();
  if (!nuovoCliente) { toast('Cliente non trovato'); return; }

  if (!confirm('Confermi il dirottamento di ' + litriDirottati + ' L da ' + d.ordine.cliente + ' a ' + nuovoCliente.nome + '?')) return;

  toast('Dirottamento in corso...');
  var litriMax = Number(d.ordine.litri);
  var litriRestanti = litriMax - litriDirottati;
  var isTotale = litriRestanti <= 0;

  // Calcola margine dal prezzo netto
  var margineNuovo = prezzoNetto - Number(d.ordine.costo_litro) - Number(d.ordine.trasporto_litro);
  var ggPag = nuovoCliente.giorni_pagamento || 30;
  var dataScad = new Date(d.ordine.data); dataScad.setDate(dataScad.getDate() + ggPag);

  // 1. Crea nuovo ordine
  var nuovoOrdine = {
    data: d.ordine.data, tipo_ordine: d.ordine.tipo_ordine,
    cliente: nuovoCliente.nome, cliente_id: nuovoClienteId,
    prodotto: d.ordine.prodotto, litri: litriDirottati,
    fornitore: d.ordine.fornitore, costo_litro: d.ordine.costo_litro,
    trasporto_litro: d.ordine.trasporto_litro, margine: margineNuovo,
    iva: d.ordine.iva, base_carico_id: d.ordine.base_carico_id,
    giorni_pagamento: ggPag, data_scadenza: dataScad.toISOString().split('T')[0],
    stato: d.ordine.stato, destinazione: sede || null,
    note: 'DIROTTATO da ' + d.ordine.cliente + ' (' + fmtL(litriDirottati) + ')'
  };
  var { data: inserito, error: errIns } = await sb.from('ordini').insert([nuovoOrdine]).select().single();
  if (errIns) { toast('Errore creazione ordine: ' + errIns.message); return; }

  // 2. Aggiungi al carico se presente
  if (d.caricoId && inserito) {
    var { data: maxSeq } = await sb.from('carico_ordini').select('sequenza').eq('carico_id', d.caricoId).order('sequenza',{ascending:false}).limit(1);
    var nextSeq = maxSeq && maxSeq.length ? maxSeq[0].sequenza + 1 : 99;
    await sb.from('carico_ordini').insert([{ carico_id: d.caricoId, ordine_id: inserito.id, sequenza: nextSeq }]);
  }

  // 3. Gestisci DAS
  if (d.das) {
    if (isTotale) {
      // Dirottamento totale: aggiorna DAS esistente con Vers.2 e nuovo cliente
      await sb.from('das_documenti').update({
        ordine_id: inserito.id,
        destinatario_nome: nuovoCliente.nome,
        note_dirottamento: 'Vers.2',
        versione: 2
      }).eq('id', d.das.id);
    } else {
      // Parziale: DAS originale → NON SCORTA MERCE
      await sb.from('das_documenti').update({
        note_dirottamento: 'NON SCORTA MERCE'
      }).eq('id', d.das.id);

      // Nuovo DAS Vers.2 per il nuovo ordine
      var { data: clData } = await sb.from('clienti').select('piva,indirizzo,citta,provincia').eq('id', nuovoClienteId).single();
      var nuovoDas = Object.assign({}, d.das);
      delete nuovoDas.id; delete nuovoDas.created_at;
      nuovoDas.ordine_id = inserito.id;
      nuovoDas.destinatario_nome = nuovoCliente.nome;
      nuovoDas.destinatario_piva = clData ? clData.piva : '';
      nuovoDas.destinatario_indirizzo = sede || (clData ? [clData.indirizzo,clData.citta].filter(Boolean).join(', ') : '');
      nuovoDas.litri = litriDirottati;
      nuovoDas.note_dirottamento = 'Vers.2';
      nuovoDas.versione = 2;
      await sb.from('das_documenti').insert([nuovoDas]);
    }
  }

  // 4. Ordine originale
  if (isTotale) {
    // Elimina ordine originale
    await sb.from('carico_ordini').delete().eq('ordine_id', d.ordine.id);
    await sb.from('ordini').delete().eq('id', d.ordine.id);
  } else {
    // Riduci litri ordine originale
    await sb.from('ordini').update({
      litri: litriRestanti,
      note: (d.ordine.note ? d.ordine.note + ' | ' : '') + 'Dirottati ' + litriDirottati + 'L a ' + nuovoCliente.nome
    }).eq('id', d.ordine.id);
  }

  _auditLog('dirottamento', 'ordini', (isTotale ? 'TOTALE' : 'PARZIALE') + ': ' + litriDirottati + 'L da ' + d.ordine.cliente + ' a ' + nuovoCliente.nome);
  toast('✅ Dirottamento completato! ' + (isTotale ? 'Ordine originale eliminato.' : 'Ordine ridotto a ' + fmtL(litriRestanti) + '.'));
  chiudiModalePermessi();
  if (d.caricoId) apriDettaglioCarico(d.caricoId);
  else if (typeof caricaConsegne === 'function') caricaConsegne();
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
    html += '<div><strong>' + num + '</strong><span style="font-size:11px;color:var(--text-muted);margin-left:8px">' + fmtD(d.data) + ' · ' + esc(d.prodotto) + ' · ' + fmtL(d.litri_ambiente) + '</span></div>';
    html += '<button class="btn-primary" style="font-size:11px;padding:5px 14px" onclick="stampaDas(\'' + d.id + '\')">🖨️ Stampa</button>';
    html += '</div>';
  });
  apriModal(html);
}

// ══════════════════════════════════════════════════════════════════
// DIROTTAMENTO ORDINE
// ══════════════════════════════════════════════════════════════════

async function apriDirottamento(ordineId, caricoId) {
  var { data: ordine } = await sb.from('ordini').select('*').eq('id', ordineId).single();
  if (!ordine) { toast('Ordine non trovato'); return; }

  // Carica DAS dell'ordine
  var { data: dasOrig } = await sb.from('das_documenti').select('*').eq('ordine_id', ordineId).order('created_at',{ascending:false}).limit(1);
  var das = dasOrig && dasOrig.length ? dasOrig[0] : null;
  var dasLabel = das ? 'DAS-' + das.anno + '/' + String(das.numero_progressivo).padStart(4,'0') : 'Nessun DAS';

  // Carica clienti
  if (!cacheClienti.length) await caricaSelectClienti('ord-cliente');
  var litriTot = Number(ordine.litri);

  window._dirottamento = { ordine: ordine, das: das, caricoId: caricoId };

  var html = '<div style="font-size:16px;font-weight:600;color:#D85A30;margin-bottom:4px">Dirottamento ordine</div>';
  html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:16px">' + esc(ordine.cliente) + ' · ' + esc(ordine.prodotto) + ' · ' + fmtL(litriTot) + ' · ' + dasLabel + '</div>';

  // Slider litri
  html += '<div style="background:#FAECE7;border-radius:8px;padding:14px 18px;margin-bottom:16px">';
  html += '<div style="font-size:11px;color:#712B13;margin-bottom:6px;font-weight:500">Litri da dirottare</div>';
  html += '<div style="display:flex;align-items:center;gap:12px">';
  html += '<input type="range" id="div-slider" min="100" max="' + litriTot + '" value="' + litriTot + '" step="100" oninput="_aggDirottSlider()" style="flex:1" />';
  html += '<div style="display:flex;align-items:center;gap:4px"><input type="number" id="div-litri" value="' + litriTot + '" min="100" max="' + litriTot + '" step="100" oninput="_aggDirottInput()" style="width:100px;font-family:var(--font-mono);font-size:16px;text-align:right;padding:6px 8px" /><span style="font-size:13px;color:#993C1D">L</span></div>';
  html += '</div>';
  html += '<div style="display:flex;justify-content:space-between;margin-top:8px" id="div-riepilogo"></div>';
  html += '</div>';

  // Nuovo cliente
  html += '<div style="display:flex;flex-direction:column;gap:10px;margin-bottom:16px">';
  html += '<div class="form-group"><label style="font-weight:700;color:#712B13">Nuovo cliente</label><select id="div-cliente" onchange="_aggDirottSedi()" style="border:1px solid #F0997B">';
  html += '<option value="">Seleziona...</option>' + cacheClienti.map(function(c) { return '<option value="' + c.id + '">' + esc(c.nome) + '</option>'; }).join('');
  html += '</select></div>';
  html += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  html += '<div class="form-group"><label style="font-weight:700;color:#712B13">Prezzo netto €/L</label><input type="number" id="div-prezzo" step="0.0001" value="' + (Number(ordine.costo_litro)+Number(ordine.trasporto_litro)+Number(ordine.margine)).toFixed(6) + '" style="font-family:var(--font-mono);border:1px solid #F0997B" /></div>';
  html += '<div class="form-group"><label style="font-weight:700;color:#712B13">Sede di scarico</label><select id="div-sede" style="border:1px solid #F0997B"><option value="">— Seleziona cliente prima —</option></select></div>';
  html += '</div></div>';

  // Riepilogo
  html += '<div id="div-azioni" style="background:#FAEEDA;border-radius:8px;padding:12px 16px;margin-bottom:16px;font-size:12px;color:#633806;line-height:1.6"></div>';

  html += '<div style="display:flex;gap:8px">';
  html += '<button class="btn-primary" style="flex:1;padding:12px;font-size:14px;background:#D85A30" onclick="eseguiDirottamento()">Conferma dirottamento</button>';
  html += '<button onclick="chiudiModalePermessi()" style="padding:12px 20px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer;font-size:14px">Annulla</button>';
  html += '</div>';

  apriModal(html);
  _aggDirottSlider();
}

function _aggDirottSlider() {
  var d = window._dirottamento; if (!d) return;
  var v = parseInt(document.getElementById('div-slider').value);
  document.getElementById('div-litri').value = v;
  _aggDirottRiepilogo(v);
}
function _aggDirottInput() {
  var d = window._dirottamento; if (!d) return;
  var v = parseInt(document.getElementById('div-litri').value) || 0;
  var max = Number(d.ordine.litri);
  if (v > max) v = max; if (v < 100) v = 100;
  document.getElementById('div-slider').value = v;
  _aggDirottRiepilogo(v);
}
function _aggDirottRiepilogo(litriDiv) {
  var d = window._dirottamento; if (!d) return;
  var tot = Number(d.ordine.litri);
  var resta = tot - litriDiv;
  var isTotale = resta <= 0;
  var dasLabel = d.das ? 'DAS-' + d.das.anno + '/' + String(d.das.numero_progressivo).padStart(4,'0') : '—';

  var rDiv = document.getElementById('div-riepilogo');
  rDiv.innerHTML = '<div style="background:#E6F1FB;border-radius:6px;padding:6px 12px"><span style="font-size:10px;color:#0C447C">Restano a ' + esc(d.ordine.cliente).substring(0,20) + ':</span> <span style="font-size:13px;font-weight:500;font-family:var(--font-mono);color:#0C447C">' + (isTotale ? '0 L (eliminato)' : resta.toLocaleString('it-IT') + ' L') + '</span></div>';
  rDiv.innerHTML += '<div style="background:#FAECE7;border-radius:6px;padding:6px 12px"><span style="font-size:10px;color:#712B13">Dirottati:</span> <span style="font-size:13px;font-weight:500;font-family:var(--font-mono);color:#D85A30">' + litriDiv.toLocaleString('it-IT') + ' L</span></div>';

  var aDiv = document.getElementById('div-azioni');
  var h = '<div style="font-weight:500;margin-bottom:4px">Cosa succede:</div>';
  if (isTotale) {
    h += '<div>L\'ordine di ' + esc(d.ordine.cliente) + ' viene sostituito col nuovo cliente</div>';
    h += '<div>' + dasLabel + ' aggiornato con nota <strong>Vers.2</strong></div>';
  } else {
    h += '<div>Ordine ' + esc(d.ordine.cliente) + ' ridotto da ' + fmtL(tot) + ' a ' + fmtL(resta) + '</div>';
    h += '<div>Nuovo ordine per ' + fmtL(litriDiv) + ' aggiunto al carico</div>';
    h += '<div>' + dasLabel + ' di ' + esc(d.ordine.cliente) + ' con nota <strong>NON SCORTA MERCE</strong></div>';
    h += '<div>Nuovo DAS <strong>' + dasLabel + ' Vers.2</strong> per il nuovo cliente</div>';
  }
  aDiv.innerHTML = h;
}

async function _aggDirottSedi() {
  var clienteId = document.getElementById('div-cliente').value;
  var selSede = document.getElementById('div-sede');
  selSede.innerHTML = '<option value="">— Nessuna —</option>';
  if (!clienteId) return;
  var { data: sedi } = await sb.from('sedi_scarico').select('*').eq('cliente_id', clienteId).eq('attivo', true).order('is_default',{ascending:false});
  if (sedi && sedi.length) {
    sedi.forEach(function(s) {
      var label = s.nome + (s.indirizzo ? ' — ' + s.indirizzo : '') + (s.citta ? ', ' + s.citta : '');
      selSede.innerHTML += '<option value="' + esc(label) + '"' + (s.is_default ? ' selected' : '') + '>' + esc(label) + '</option>';
    });
  }
  selSede.innerHTML += '<option value="__manuale__">Altro (manuale)</option>';
}

async function eseguiDirottamento() {
  var d = window._dirottamento; if (!d) return;
  var litriDiv = parseInt(document.getElementById('div-litri').value) || 0;
  var nuovoClienteId = document.getElementById('div-cliente').value;
  if (!nuovoClienteId) { toast('Seleziona il nuovo cliente'); return; }
  var nuovoCliente = cacheClienti.find(function(c){return c.id===nuovoClienteId;});
  if (!nuovoCliente) { toast('Cliente non trovato'); return; }
  var prezzoNetto = parseFloat(document.getElementById('div-prezzo').value) || 0;
  if (!prezzoNetto) { toast('Inserisci il prezzo'); return; }
  var sede = document.getElementById('div-sede').value;
  if (sede === '__manuale__') sede = prompt('Inserisci destinazione manuale:') || '';

  var tot = Number(d.ordine.litri);
  var isTotale = litriDiv >= tot;
  var costo = Number(d.ordine.costo_litro);
  var trasporto = Number(d.ordine.trasporto_litro);
  var margine = prezzoNetto - costo - trasporto;

  if (!confirm(isTotale ? 'Dirottare TUTTO l\'ordine (' + fmtL(tot) + ') a ' + nuovoCliente.nome + '?' : 'Dirottare ' + fmtL(litriDiv) + ' (di ' + fmtL(tot) + ') a ' + nuovoCliente.nome + '?')) return;

  toast('Dirottamento in corso...');

  if (isTotale) {
    // ═══ DIROTTAMENTO TOTALE: sostituisci ordine esistente ═══
    await sb.from('ordini').update({
      cliente: nuovoCliente.nome, cliente_id: nuovoClienteId,
      margine: margine, destinazione: sede || null,
      note: (d.ordine.note ? d.ordine.note + ' | ' : '') + 'DIROTTATO da ' + d.ordine.cliente
    }).eq('id', d.ordine.id);

    // Aggiorna DAS con Vers.2
    if (d.das) {
      await sb.from('das_documenti').update({
        dest_ragsoc: nuovoCliente.nome,
        dest_piva: '',
        note_dirottamento: 'Vers.2'
      }).eq('id', d.das.id);
    }
  } else {
    // ═══ DIROTTAMENTO PARZIALE ═══
    var litriResta = tot - litriDiv;

    // 1. Riduci ordine originale
    await sb.from('ordini').update({ litri: litriResta }).eq('id', d.ordine.id);

    // 2. Aggiorna DAS originale con NON SCORTA MERCE
    if (d.das) {
      await sb.from('das_documenti').update({
        litri: litriResta,
        note_dirottamento: 'NON SCORTA MERCE'
      }).eq('id', d.das.id);
    }

    // 3. Crea nuovo ordine
    var nuovoOrdine = {
      data: d.ordine.data, tipo_ordine: d.ordine.tipo_ordine,
      cliente: nuovoCliente.nome, cliente_id: nuovoClienteId,
      prodotto: d.ordine.prodotto, litri: litriDiv,
      fornitore: d.ordine.fornitore, costo_litro: costo,
      trasporto_litro: trasporto, margine: margine,
      iva: d.ordine.iva, base_carico_id: d.ordine.base_carico_id,
      giorni_pagamento: d.ordine.giorni_pagamento,
      data_scadenza: d.ordine.data_scadenza,
      stato: d.ordine.stato, destinazione: sede || null,
      note: 'DIROTTATO da ' + d.ordine.cliente + ' (' + fmtL(litriDiv) + ')'
    };
    var { data: inserito } = await sb.from('ordini').insert([nuovoOrdine]).select().single();

    // 4. Aggiungi al carico se presente
    if (d.caricoId && inserito) {
      var { data: maxSeq } = await sb.from('carico_ordini').select('sequenza').eq('carico_id', d.caricoId).order('sequenza',{ascending:false}).limit(1);
      var nextSeq = (maxSeq && maxSeq.length) ? maxSeq[0].sequenza + 1 : 1;
      await sb.from('carico_ordini').insert([{ carico_id: d.caricoId, ordine_id: inserito.id, sequenza: nextSeq }]);
    }

    // 5. Crea DAS Vers.2 per nuovo ordine
    if (d.das && inserito) {
      var nuovoDas = {
        anno: d.das.anno, ordine_id: inserito.id, carico_id: d.das.carico_id,
        data: d.das.data, numero_progressivo: d.das.numero_progressivo,
        dest_piva: '', dest_ragsoc: nuovoCliente.nome,
        dest_indirizzo: sede || '', dest_citta: '',
        mitt_piva: d.das.mitt_piva, mitt_ragsoc: d.das.mitt_ragsoc,
        mitt_indirizzo: d.das.mitt_indirizzo, mitt_citta: d.das.mitt_citta,
        prodotto_codice: d.das.prodotto_codice, prodotto_desc: d.das.prodotto_desc,
        prodotto_adr: d.das.prodotto_adr,
        litri: litriDiv, peso_netto: d.das.peso_netto ? Math.round(d.das.peso_netto * litriDiv / tot) : null,
        litri_15: d.das.litri_15 ? Math.round(d.das.litri_15 * litriDiv / tot) : null,
        mezzo_targa: d.das.mezzo_targa, autista: d.das.autista,
        note_dirottamento: 'Vers.2'
      };
      await sb.from('das_documenti').insert([nuovoDas]);
    }
  }

  _auditLog('dirottamento', 'ordini', (isTotale ? 'TOTALE' : 'PARZIALE ' + litriDiv + 'L') + ' da ' + d.ordine.cliente + ' a ' + nuovoCliente.nome);
  toast('✅ Dirottamento completato!');
  chiudiModalePermessi();
  if (d.caricoId) apriDettaglioCarico(d.caricoId);
  else caricaConsegne();
}
