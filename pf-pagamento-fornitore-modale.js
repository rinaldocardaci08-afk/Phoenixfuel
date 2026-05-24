// ╔══════════════════════════════════════════════════════════════════╗
// ║  pf-pagamento-fornitore-modale.js                                ║
// ║  Modale di registrazione pagamento fornitore PhoenixFuel         ║
// ║                                                                  ║
// ║  Modulo CONDIVISO — richiamato da:                               ║
// ║   • Scadenzario fornitori (Finanze → Scadenzario)                ║
// ║   • Foglio giornale (prossimo step, riuso lo stesso modale)      ║
// ║                                                                  ║
// ║  Funzionalità:                                                   ║
// ║   • Toggle Totale / Parziale                                     ║
// ║   • Importo, data, modalità (Bonifico/RIBA/Assegno), istituto    ║
// ║   • Banche ordinate per regola: Intesa→MPS→BNL→BCC→altri         ║
// ║   • Su saldo totale: propaga pagato_fornitore=true sugli ordini  ║
// ║   • Su parziale: ordini restano "da pagare"                      ║
// ╚══════════════════════════════════════════════════════════════════╝

'use strict';

// ── STATO MODULO ─────────────────────────────────────────────────────
var _pfpModaleCtx = null;
var _pfpConti = [];
var _pfpIstituti = [];

// ── UTILS LOCALI ─────────────────────────────────────────────────────
function _pfpFmtE(v) { return '€ ' + Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _pfpFmtD(d) { if(!d) return '—'; var p=String(d).split('-'); if(p.length<3) return d; return p[2]+'/'+p[1]+'/'+p[0]; }
function _pfpEsc(s) { return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _pfpOggiISO() { return new Date().toISOString().split('T')[0]; }

// Helper ordinamento banche (regola costituzionale PhoenixFuel)
function _pfpPriorityBancaIstituto(nome) {
  var n = (nome || '').toLowerCase();
  if (n.indexOf('intesa') >= 0) return 1;
  if (n.indexOf('mps') >= 0 || n.indexOf('monte') >= 0) return 2;
  if (n.indexOf('bnl') >= 0) return 3;
  if (n.indexOf('bcc') >= 0) return 4;
  return 99;
}

// ═════════════════════════════════════════════════════════════════════
// ENTRY POINT — apri il modale a partire da un fattura_ricevute.id
// options: { contoIdDefault, onSaved }
// ═════════════════════════════════════════════════════════════════════
async function apriModalePagamentoFornitore(fatturaId, options) {
  options = options || {};

  try {
    var [fattRes, pagRes, contiRes, istRes, ordRes] = await Promise.all([
      sb.from('fatture_ricevute').select('*').eq('id', fatturaId).single(),
      sb.from('pagamenti_fornitori').select('*').eq('fattura_ricevuta_id', fatturaId),
      sb.from('banche_conti').select('id,istituto_id,iban,descrizione'),
      sb.from('banche_istituti').select('id,nome'),
      sb.from('ordini').select('id').eq('fattura_ricevuta_id', fatturaId)
    ]);

    if (fattRes.error) throw fattRes.error;

    var fattura = fattRes.data;
    var pagamenti = pagRes.data || [];
    var nOrdini = (ordRes.data || []).length;
    var totalePagato = pagamenti.reduce(function(s,p){ return s + Number(p.importo||0); }, 0);
    var saldoResiduo = Number(fattura.importo_dichiarato) - totalePagato;

    if (saldoResiduo <= 0.01) {
      alert('Questa fattura è già completamente saldata.');
      return;
    }

    _pfpConti = contiRes.data || [];
    _pfpIstituti = istRes.data || [];

    // Ordina conti per priorità istituto (Intesa→MPS→BNL→BCC→altri)
    _pfpConti.sort(function(a,b){
      var istA = _pfpIstituti.find(function(i){return i.id===a.istituto_id;}) || {};
      var istB = _pfpIstituti.find(function(i){return i.id===b.istituto_id;}) || {};
      var pA = _pfpPriorityBancaIstituto(istA.nome);
      var pB = _pfpPriorityBancaIstituto(istB.nome);
      if (pA !== pB) return pA - pB;
      return (istA.nome || '').localeCompare(istB.nome || '');
    });

    _pfpModaleCtx = {
      fattura: fattura,
      pagamenti: pagamenti,
      nOrdini: nOrdini,
      saldoResiduo: saldoResiduo,
      totalePagato: totalePagato,
      tipo: 'totale',
      modalitaSelezionata: 'bonifico',
      contoIdDefault: options.contoIdDefault || null,
      onSaved: options.onSaved || null
    };

    _pfpRenderModale();
  } catch (e) {
    console.error('[pfp] errore apri modale', e);
    alert('Errore: ' + (e.message || String(e)));
  }
}

// ═════════════════════════════════════════════════════════════════════
// RENDER
// ═════════════════════════════════════════════════════════════════════
function _pfpRenderModale() {
  var ctx = _pfpModaleCtx;
  if (!ctx) return;

  var importoSugg = (ctx.tipo === 'totale') ? ctx.saldoResiduo.toFixed(2) : '';
  var readonlyImp = (ctx.tipo === 'totale') ? ' readonly' : '';
  var bgImp = (ctx.tipo === 'totale') ? 'var(--bg-tertiary,#F1EFE8)' : 'var(--bg)';

  // Subtitle: fornitore · numero · data · totale · già pagato
  var subParts = [];
  if (ctx.fattura.fornitore_nome) subParts.push(_pfpEsc(ctx.fattura.fornitore_nome));
  if (ctx.fattura.numero_fattura) subParts.push(_pfpEsc(ctx.fattura.numero_fattura));
  if (ctx.fattura.data_fattura) subParts.push(_pfpFmtD(ctx.fattura.data_fattura));
  subParts.push('totale ' + _pfpFmtE(ctx.fattura.importo_dichiarato));
  if (ctx.totalePagato > 0) subParts.push('già pagato ' + _pfpFmtE(ctx.totalePagato));
  if (ctx.nOrdini) subParts.push(ctx.nOrdini + ' ordin' + (ctx.nOrdini === 1 ? 'e' : 'i'));

  var h = '<div id="pfp-modale-bg" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px 20px;overflow-y:auto">';
  h += '<div style="background:var(--bg-card,white);width:100%;max-width:520px;border-radius:12px;overflow:hidden;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.2)">';

  // Header
  h += '<div style="padding:14px 20px;border-bottom:0.5px solid var(--border);display:flex;align-items:flex-start;justify-content:space-between;gap:12px">';
  h += '<div><div style="font-size:15px;font-weight:600">Registra pagamento</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-top:3px;line-height:1.4">' + subParts.join(' · ') + '</div></div>';
  h += '<button onclick="chiudiModalePagamentoFornitore()" style="background:transparent;border:0;font-size:22px;cursor:pointer;color:var(--text-muted);line-height:1;padding:0 4px;flex-shrink:0">×</button>';
  h += '</div>';

  // Body
  h += '<div style="padding:18px 20px">';

  // Toggle Totale / Parziale
  h += '<div style="display:flex;gap:0;margin-bottom:18px;background:var(--bg);border-radius:8px;padding:3px;border:0.5px solid var(--border)">';
  var attT = ctx.tipo === 'totale';
  var attP = ctx.tipo === 'parziale';
  h += '<button onclick="_pfpToggleTipo(\'totale\')" style="flex:1;padding:8px 0;font-size:13px;font-weight:'+(attT?'600':'400')+';background:'+(attT?'var(--bg-card,white)':'transparent')+';color:'+(attT?'var(--text)':'var(--text-muted)')+';border:'+(attT?'0.5px solid var(--border)':'0')+';border-radius:6px;cursor:pointer">Totale</button>';
  h += '<button onclick="_pfpToggleTipo(\'parziale\')" style="flex:1;padding:8px 0;font-size:13px;font-weight:'+(attP?'600':'400')+';background:'+(attP?'var(--bg-card,white)':'transparent')+';color:'+(attP?'var(--text)':'var(--text-muted)')+';border:'+(attP?'0.5px solid var(--border)':'0')+';border-radius:6px;cursor:pointer">Parziale</button>';
  h += '</div>';

  // Importo + Data pagamento
  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';
  h += '<div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Importo</label>';
  h += '<input id="pfp-importo" type="number" step="0.01" min="0.01" value="'+importoSugg+'"'+readonlyImp+' style="width:100%;padding:8px 10px;font-size:15px;font-weight:600;border:0.5px solid var(--border);border-radius:6px;background:'+bgImp+';color:var(--text);box-sizing:border-box" /></div>';
  h += '<div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Data pagamento</label>';
  h += '<input id="pfp-data" type="date" value="'+_pfpOggiISO()+'" style="width:100%;padding:8px 10px;font-size:14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);box-sizing:border-box" /></div>';
  h += '</div>';

  // Indicazione saldo (utile per parziale)
  if (ctx.tipo === 'parziale') {
    h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:14px;margin-top:-8px">Saldo residuo da pagare: <strong style="color:var(--text)">'+_pfpFmtE(ctx.saldoResiduo)+'</strong></div>';
  }

  // Modalità (Bonifico / RIBA / Assegno)
  h += '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:6px;font-weight:600">Modalità</label>';
  h += '<div style="display:flex;gap:6px;flex-wrap:wrap" id="pfp-modalita-group">';
  [['bonifico','Bonifico'],['riba','RIBA'],['assegno','Assegno']].forEach(function(m){
    var attivo = (ctx.modalitaSelezionata === m[0]);
    h += '<button data-modalita="'+m[0]+'" onclick="_pfpSelModalita(\''+m[0]+'\')" style="padding:7px 14px;background:'+(attivo?'#E6F1FB':'var(--bg)')+';color:'+(attivo?'#0C447C':'var(--text-muted)')+';border:0.5px solid '+(attivo?'#378ADD':'var(--border)')+';border-radius:6px;font-size:13px;font-weight:'+(attivo?'600':'400')+';cursor:pointer">'+m[1]+'</button>';
  });
  h += '</div></div>';

  // Conto/Istituto
  h += '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Istituto · c/c di addebito</label>';
  h += '<select id="pfp-conto" style="width:100%;padding:8px 10px;font-size:14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);box-sizing:border-box">';
  h += '<option value="">— Seleziona —</option>';
  _pfpConti.forEach(function(c){
    var ist = _pfpIstituti.find(function(i){return i.id===c.istituto_id;}) || {};
    var label = (ist.nome || '?') + (c.descrizione ? ' · ' + c.descrizione : (c.iban ? ' · ' + c.iban : ''));
    var sel = (ctx.contoIdDefault === c.id) ? ' selected' : '';
    h += '<option value="'+_pfpEsc(c.id)+'"'+sel+'>'+_pfpEsc(label)+'</option>';
  });
  h += '</select></div>';

  // Riferimento esterno
  h += '<div style="margin-bottom:6px"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Riferimento esterno · facoltativo</label>';
  h += '<input id="pfp-riferimento" type="text" placeholder="es. CRO 000123456 / numero RIBA" style="width:100%;padding:8px 10px;font-size:14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);box-sizing:border-box" /></div>';

  h += '</div>';

  // Footer
  var footerMsg;
  if (ctx.tipo === 'totale') {
    footerMsg = 'Dopo conferma: ' + ctx.nOrdini + ' ordin' + (ctx.nOrdini===1?'e':'i') + ' collegat' + (ctx.nOrdini===1?'o':'i') + ' verrann' + (ctx.nOrdini===1?'o':'o') + ' marcat' + (ctx.nOrdini===1?'o':'i') + ' come pagat' + (ctx.nOrdini===1?'o':'i');
  } else {
    footerMsg = 'Pagamento parziale: ordini restano "da pagare" fino al saldo';
  }
  h += '<div style="padding:12px 20px;border-top:0.5px solid var(--border);display:flex;justify-content:space-between;align-items:center;gap:8px;flex-wrap:wrap">';
  h += '<div style="font-size:11px;color:var(--text-muted);flex:1;min-width:200px">'+footerMsg+'</div>';
  h += '<div style="display:flex;gap:8px">';
  h += '<button onclick="chiudiModalePagamentoFornitore()" style="padding:8px 14px;font-size:13px;background:var(--bg);border:0.5px solid var(--border);color:var(--text);border-radius:6px;cursor:pointer">Annulla</button>';
  h += '<button id="pfp-conferma" onclick="_pfpConferma()" style="padding:8px 18px;font-size:13px;background:#0C447C;color:white;border:0.5px solid #0C447C;border-radius:6px;font-weight:600;cursor:pointer">Conferma</button>';
  h += '</div></div>';

  h += '</div></div>';

  // Sostituisci eventuale modale precedente
  var existing = document.getElementById('pfp-modale-bg');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', h);

  // Focus su importo se parziale
  if (ctx.tipo === 'parziale') {
    setTimeout(function(){
      var imp = document.getElementById('pfp-importo');
      if (imp) imp.focus();
    }, 50);
  }
}

// ═════════════════════════════════════════════════════════════════════
// HANDLERS
// ═════════════════════════════════════════════════════════════════════
function chiudiModalePagamentoFornitore() {
  var el = document.getElementById('pfp-modale-bg');
  if (el) el.remove();
  _pfpModaleCtx = null;
}

function _pfpToggleTipo(tipo) {
  if (!_pfpModaleCtx) return;
  // Salva i valori correnti prima del re-render
  var imp = document.getElementById('pfp-importo');
  var data = document.getElementById('pfp-data');
  var conto = document.getElementById('pfp-conto');
  var rif = document.getElementById('pfp-riferimento');
  if (conto && conto.value) _pfpModaleCtx.contoIdDefault = conto.value;
  _pfpModaleCtx.tipo = tipo;
  _pfpRenderModale();
  // Ripristina data + rif se erano valorizzati
  setTimeout(function(){
    if (data && data.value) {
      var d2 = document.getElementById('pfp-data');
      if (d2) d2.value = data.value;
    }
    if (rif && rif.value) {
      var r2 = document.getElementById('pfp-riferimento');
      if (r2) r2.value = rif.value;
    }
  }, 30);
}

function _pfpSelModalita(modalita) {
  if (_pfpModaleCtx) _pfpModaleCtx.modalitaSelezionata = modalita;
  document.querySelectorAll('[data-modalita]').forEach(function(b){
    var attivo = (b.dataset.modalita === modalita);
    b.style.background = attivo ? '#E6F1FB' : 'var(--bg)';
    b.style.color = attivo ? '#0C447C' : 'var(--text-muted)';
    b.style.borderColor = attivo ? '#378ADD' : 'var(--border)';
    b.style.fontWeight = attivo ? '600' : '400';
  });
}

async function _pfpConferma() {
  var ctx = _pfpModaleCtx;
  if (!ctx) return;

  var importo = parseFloat(document.getElementById('pfp-importo').value);
  var data = document.getElementById('pfp-data').value;
  var modalita = ctx.modalitaSelezionata || 'bonifico';
  var conto_id = document.getElementById('pfp-conto').value || null;
  var riferimento = (document.getElementById('pfp-riferimento').value || '').trim();

  if (!importo || importo <= 0) { alert('Inserisci un importo valido'); return; }
  if (!data) { alert('Inserisci la data pagamento'); return; }
  if (importo > ctx.saldoResiduo + 0.01) {
    if (!confirm('L\'importo supera il saldo residuo di € ' + (importo - ctx.saldoResiduo).toFixed(2) + '. Procedere comunque?')) return;
  }

  var btn = document.getElementById('pfp-conferma');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; btn.style.opacity = '0.6'; }

  try {
    // 1. Insert pagamento
    var ins = await sb.from('pagamenti_fornitori').insert([{
      fattura_ricevuta_id: ctx.fattura.id,
      importo: importo,
      data_pagamento: data,
      modalita: modalita,
      conto_id: conto_id,
      riferimento_esterno: riferimento || null
    }]).select().single();
    if (ins.error) throw ins.error;

    // 2. Calcola se la fattura è ora saldata
    var nuovoTotalePagato = ctx.totalePagato + importo;
    var saldata = nuovoTotalePagato >= Number(ctx.fattura.importo_dichiarato) - 0.01;

    // 3. Se saldata → propaga pagato_fornitore=true su tutti gli ordini collegati
    if (saldata) {
      var upd = await sb.from('ordini')
        .update({ pagato_fornitore: true, data_pagamento_fornitore: data })
        .eq('fattura_ricevuta_id', ctx.fattura.id);
      if (upd.error) throw upd.error;
    }

    var cb = ctx.onSaved;
    chiudiModalePagamentoFornitore();
    if (typeof cb === 'function') cb({ saldata: saldata, importo: importo });
  } catch (e) {
    console.error('[pfp] errore conferma', e);
    alert('Errore salvataggio: ' + (e.message || String(e)));
    if (btn) { btn.disabled = false; btn.textContent = 'Conferma'; btn.style.opacity = '1'; }
  }
}

// ═════════════════════════════════════════════════════════════════════
// EXPORT globals (per onclick inline)
// ═════════════════════════════════════════════════════════════════════
window.apriModalePagamentoFornitore   = apriModalePagamentoFornitore;
window.chiudiModalePagamentoFornitore = chiudiModalePagamentoFornitore;
window._pfpToggleTipo                 = _pfpToggleTipo;
window._pfpSelModalita                = _pfpSelModalita;
window._pfpConferma                   = _pfpConferma;
