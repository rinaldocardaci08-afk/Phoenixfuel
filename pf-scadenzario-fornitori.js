// ╔══════════════════════════════════════════════════════════════════╗
// ║  pf-scadenzario-fornitori.js — Scadenzario Fornitori PhoenixFuel ║
// ║                                                                  ║
// ║  Sotto-tab di Finanze. Aggrega ordini entrata_deposito per       ║
// ║  (data, fornitore, fattura_ricevuta_id) e gestisce:              ║
// ║   • inserimento numero fattura + importo dichiarato              ║
// ║   • sentinella di quadratura (Σ ordini vs importo fattura)       ║
// ║     con override esplicito + audit trail                         ║
// ║   • visualizzazione pagamenti registrati                         ║
// ║                                                                  ║
// ║  Registrazione pagamento → modulo separato (prossimo step)       ║
// ╚══════════════════════════════════════════════════════════════════╝

'use strict';

// ── STATO MODULO ─────────────────────────────────────────────────────
var _sfOrdini         = [];
var _sfFatture        = [];
var _sfPagamenti      = [];
var _sfFornitoriMap   = {};
var _sfConti          = [];
var _sfIstituti       = [];
var _sfFiltroAnno     = null;
var _sfFiltroMese     = null;   // 0-11
var _sfFiltroStato    = 'tutti';
var _sfFiltroFornitore = 'tutti';
var _sfRigheEspanse   = {};
var _sfTolleranzaQuadratura = 2.00;
var _sfModaleCtx      = null;

// ── UTILS LOCALI ─────────────────────────────────────────────────────
function _sfFmtE(v){ return '€ ' + Number(v||0).toLocaleString('it-IT',{minimumFractionDigits:2,maximumFractionDigits:2}); }
function _sfFmtL(v){ return Number(v||0).toLocaleString('it-IT',{maximumFractionDigits:0}) + ' L'; }
function _sfFmtD(d){ if(!d) return '—'; var p=String(d).split('-'); if(p.length<3) return d; return p[2]+'/'+p[1]+'/'+p[0]; }
function _sfFmtMese(m, a){ var ms=['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre']; return ms[m]+' '+a; }
function _sfEsc(s){ return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&#39;'); }
function _sfChiave(data, fornId, fattId){ return data+'|'+(fornId||'_')+'|'+(fattId||'null'); }
function _sfOggiISO(){
  // Versione locale: evita il bug di toISOString() che in fuso UTC+2 di notte ritorna giorno precedente
  var d = new Date();
  var y = d.getFullYear();
  var m = String(d.getMonth()+1).padStart(2,'0');
  var dd = String(d.getDate()).padStart(2,'0');
  return y + '-' + m + '-' + dd;
}
function _sfDataMeseISO(anno, mese, giorno){
  // Costruisce data ISO YYYY-MM-DD usando mezzogiorno locale per evitare shift UTC
  return new Date(anno, mese, giorno, 12, 0, 0).toISOString().split('T')[0];
}
function _sfGiorniDaScadenza(dataISO){
  var oggi = new Date(); oggi.setHours(0,0,0,0);
  var s = new Date(dataISO + 'T12:00:00'); s.setHours(0,0,0,0);
  return Math.round((oggi - s) / 86400000);
}
function _sfContoLabel(conto_id){
  if (!conto_id) return '—';
  var c = _sfConti.find(function(x){ return x.id===conto_id; });
  if (!c) return '—';
  var i = _sfIstituti.find(function(x){ return x.id===c.istituto_id; });
  return (i ? i.nome : '?') + (c.descrizione ? ' · '+c.descrizione : '');
}
// Stessa logica di pf-finanze.js spostaAlLunedi: sabato→lun, domenica→lun
function _sfSpostaAlLunedi(dataStr){
  if (!dataStr) return dataStr;
  var d = new Date(dataStr + 'T12:00:00');
  var g = d.getDay();
  if (g === 6) d.setDate(d.getDate() + 2);
  if (g === 0) d.setDate(d.getDate() + 1);
  return d.toISOString().split('T')[0];
}

// ═════════════════════════════════════════════════════════════════════
// ENTRY POINT — chiamato dal click sub-tab di Finanze
// ═════════════════════════════════════════════════════════════════════
async function caricaScadenzarioFornitori() {
  if (_sfFiltroAnno === null) _sfFiltroAnno = new Date().getFullYear();
  if (_sfFiltroMese === null) _sfFiltroMese = new Date().getMonth();

  var el = document.getElementById('sf-content');
  if (!el) return;
  el.innerHTML = '<div class="loading" style="padding:20px;font-size:13px;color:var(--text-muted)">Caricamento scadenzario…</div>';

  // Range data: estendo ±3 mesi per coprire scadenze precedenti/successive
  // Uso helper con mezzogiorno locale per evitare bug timezone (1° del mese a mezzanotte locale → giorno precedente in UTC)
  var inizio = _sfDataMeseISO(_sfFiltroAnno, _sfFiltroMese - 3, 1);
  var fine   = _sfDataMeseISO(_sfFiltroAnno, _sfFiltroMese + 3, 0);

  try {
    var [ordRes, fattRes, pagRes, fornRes, contiRes, istRes] = await Promise.all([
      sb.from('ordini')
        .select('id,data,fornitore,prodotto,litri,costo_litro,trasporto_litro,iva,stato,fattura_ricevuta_id,giorni_pagamento,das_firmato_url')
        .eq('tipo_ordine','entrata_deposito')
        .neq('stato','annullato')
        .gte('data', inizio)
        .lte('data', fine)
        .not('fornitore','ilike','%phoenix%')
        .not('fornitore','ilike','%deposito%')
        .not('fornitore','ilike','%rientro%')
        .order('data',{ascending:false}),
      // Filtro periodo esteso: fatture il cui data_fattura cade nella finestra ±3 mesi
      // (evita SELECT * non scalabile a regime 5000+ fatture)
      sb.from('fatture_ricevute').select('*').gte('data_fattura', inizio).lte('data_fattura', fine),
      // Pagamenti: stesso filtro per coerenza
      sb.from('pagamenti_fornitori').select('*').gte('data_pagamento', inizio).lte('data_pagamento', fine).order('data_pagamento',{ascending:true}),
      sb.from('fornitori').select('id,nome,giorni_pagamento,colore'),
      sb.from('banche_conti').select('id,istituto_id,iban,descrizione'),
      sb.from('banche_istituti').select('id,nome')
    ]);

    if (ordRes.error)  throw ordRes.error;
    if (fattRes.error) throw fattRes.error;
    if (pagRes.error)  throw pagRes.error;

    _sfOrdini    = ordRes.data || [];
    _sfFatture   = fattRes.data || [];
    _sfPagamenti = pagRes.data || [];
    _sfConti     = contiRes.data || [];
    _sfIstituti  = istRes.data || [];
    // Mappa fornitori keyed by NOME lowercase (ordini.fornitore è testo, niente FK su ordini)
    _sfFornitoriMap = {};
    (fornRes.data || []).forEach(function(f){
      if (f.nome) _sfFornitoriMap[f.nome.toLowerCase().trim()] = f;
    });

    renderScadenzarioFornitori();
  } catch (e) {
    console.error('[sf] errore caricamento', e);
    el.innerHTML = '<div style="padding:20px;color:#A32D2D;font-size:13px">Errore caricamento: '+_sfEsc(e.message||String(e))+'</div>';
  }
}

// ═════════════════════════════════════════════════════════════════════
// AGGREGAZIONE per (data, fornitore_nome, fattura_ricevuta_id)
// ═════════════════════════════════════════════════════════════════════
function _sfAggregaRighe() {
  var meseInizio = _sfDataMeseISO(_sfFiltroAnno, _sfFiltroMese, 1);
  var meseFine   = _sfDataMeseISO(_sfFiltroAnno, _sfFiltroMese + 1, 0);

  var fattMap = {};
  _sfFatture.forEach(function(f){ fattMap[f.id] = f; });

  var pagMap = {};
  _sfPagamenti.forEach(function(p){
    (pagMap[p.fattura_ricevuta_id] = pagMap[p.fattura_ricevuta_id] || []).push(p);
  });

  var raggruppati = {};
  _sfOrdini.forEach(function(o){
    if (o.data < meseInizio || o.data > meseFine) return;
    var nomeKey = (o.fornitore || '?').toLowerCase().trim();
    var chiave  = _sfChiave(o.data, nomeKey, o.fattura_ricevuta_id);
    if (!raggruppati[chiave]) {
      raggruppati[chiave] = {
        chiave: chiave,
        data: o.data,
        fornitoreNomeKey: nomeKey,
        fornitoreNome: o.fornitore || '?',
        fatturaId: o.fattura_ricevuta_id || null,
        ordini: [],
        totLitri: 0,
        totImponibile: 0,
        totConIva: 0
      };
    }
    var imponibile = (Number(o.costo_litro||0) + Number(o.trasporto_litro||0)) * Number(o.litri||0);
    var iva = Number(o.iva || 22) / 100;
    raggruppati[chiave].ordini.push(o);
    raggruppati[chiave].totLitri      += Number(o.litri||0);
    raggruppati[chiave].totImponibile += imponibile;
    raggruppati[chiave].totConIva     += imponibile * (1 + iva);
  });

  var righe = Object.values(raggruppati);
  var oggi = _sfOggiISO();

  righe.forEach(function(r){
    r.fattura    = r.fatturaId ? fattMap[r.fatturaId] : null;
    r.pagamenti  = r.fatturaId ? (pagMap[r.fatturaId] || []) : [];
    r.totPagato  = r.pagamenti.reduce(function(s,p){ return s + Number(p.importo||0); }, 0);

    // Scadenza calcolata — STESSA LOGICA di pf-finanze.js (calendario):
    // priorità ggPag: ordini.giorni_pagamento → fornitori.giorni_pagamento → 30
    // costruzione data con T12:00:00 per evitare edge case timezone
    var forn = _sfFornitoriMap[r.fornitoreNomeKey] || {};
    var ggPag = Number((r.ordini[0] && r.ordini[0].giorni_pagamento) || forn.giorni_pagamento || 30);
    r.ggPagamento = ggPag;

    // dataScadenzaPresunta = calcolata da data ordine + ggPag, spostata al lunedì se cade sab/dom
    var dPres = new Date(r.data + 'T12:00:00');
    dPres.setDate(dPres.getDate() + ggPag);
    r.dataScadenzaPresunta = _sfSpostaAlLunedi(dPres.toISOString().split('T')[0]);

    // dataScadenza effettiva:
    //  - se c'è fattura con data_scadenza salvata → usa quella (override manuale, anche lei spostata al lun se necessario)
    //  - se c'è fattura senza data_scadenza → calcolata da data_fattura + ggPag, spostata al lun
    //  - se non c'è fattura → presunta dalla data ordine (già spostata)
    if (r.fattura) {
      if (r.fattura.data_scadenza) {
        r.dataScadenza = _sfSpostaAlLunedi(r.fattura.data_scadenza);
      } else {
        var dF = new Date(r.fattura.data_fattura + 'T12:00:00');
        dF.setDate(dF.getDate() + ggPag);
        r.dataScadenza = _sfSpostaAlLunedi(dF.toISOString().split('T')[0]);
      }
    } else {
      r.dataScadenza = r.dataScadenzaPresunta;
    }

    // Stato
    if (!r.fattura) {
      r.stato = (r.dataScadenza < oggi) ? 'scaduta_no_fattura' : 'senza_fattura';
    } else {
      var importoF = Number(r.fattura.importo_dichiarato);
      if (r.totPagato <= 0.01) {
        r.stato = (r.dataScadenza < oggi) ? 'scaduta' : 'da_pagare';
      } else if (r.totPagato >= importoF - 0.01) {
        r.stato = 'pagata';
      } else {
        r.stato = 'parziale';
      }
    }

    // Sentinella quadratura
    if (r.fattura) {
      r.quadraturaDiff = Number(r.fattura.importo_dichiarato) - r.totConIva;
      r.quadraturaOk   = Math.abs(r.quadraturaDiff) <= _sfTolleranzaQuadratura;
    }
  });

  righe.sort(function(a,b){ return a.data < b.data ? 1 : (a.data > b.data ? -1 : a.fornitoreNome.localeCompare(b.fornitoreNome)); });
  return righe;
}

// ═════════════════════════════════════════════════════════════════════
// KPI
// ═════════════════════════════════════════════════════════════════════
function _sfCalcolaKPI(righe) {
  var k = { senzaFattura:0, daPagare:0, scadute:0, pagatoMese:0 };
  var meseInizio = _sfDataMeseISO(_sfFiltroAnno, _sfFiltroMese, 1);
  var meseFine   = _sfDataMeseISO(_sfFiltroAnno, _sfFiltroMese + 1, 0);

  righe.forEach(function(r){
    if (r.stato === 'senza_fattura' || r.stato === 'scaduta_no_fattura') {
      k.senzaFattura += r.totConIva;
    }
    if (r.stato === 'da_pagare' || r.stato === 'parziale') {
      k.daPagare += (r.fattura ? Number(r.fattura.importo_dichiarato) - r.totPagato : 0);
    }
    if (r.stato === 'scaduta' || r.stato === 'scaduta_no_fattura') {
      k.scadute += r.fattura ? (Number(r.fattura.importo_dichiarato) - r.totPagato) : r.totConIva;
    }
    (r.pagamenti || []).forEach(function(p){
      if (p.data_pagamento >= meseInizio && p.data_pagamento <= meseFine) {
        k.pagatoMese += Number(p.importo || 0);
      }
    });
  });
  return k;
}

// ═════════════════════════════════════════════════════════════════════
// RENDER PRINCIPALE
// ═════════════════════════════════════════════════════════════════════
function renderScadenzarioFornitori() {
  var el = document.getElementById('sf-content');
  if (!el) return;

  var righeAll = _sfAggregaRighe();

  // Pre-filtro fornitore: usato per i KPI (lo stato no, altrimenti si svuotano gli altri 3)
  var righePerKpi = righeAll.filter(function(r){
    if (_sfFiltroFornitore !== 'tutti' && r.fornitoreNomeKey !== _sfFiltroFornitore) return false;
    return true;
  });

  // Applica filtri stato + fornitore (lista + footer pagina)
  var righe = righePerKpi.filter(function(r){
    if (_sfFiltroStato !== 'tutti') {
      switch (_sfFiltroStato) {
        case 'senza-fattura': if (r.stato !== 'senza_fattura' && r.stato !== 'scaduta_no_fattura') return false; break;
        case 'da-pagare':     if (r.stato !== 'da_pagare' && r.stato !== 'scaduta') return false; break;
        case 'parziali':      if (r.stato !== 'parziale') return false; break;
        case 'pagate':        if (r.stato !== 'pagata') return false; break;
      }
    }
    return true;
  });

  var kpi = _sfCalcolaKPI(righePerKpi);

  var h = '';
  h += _sfHtmlToolbar();
  h += _sfHtmlKPI(kpi);
  h += _sfHtmlFiltri();
  h += _sfHtmlTabella(righe);
  el.innerHTML = h;
}

// ── TOOLBAR (data nav + filtro fornitore) ────────────────────────────
function _sfHtmlToolbar() {
  var meseLabel = _sfFmtMese(_sfFiltroMese, _sfFiltroAnno);
  var meseVal = _sfFiltroAnno+'-'+String(_sfFiltroMese+1).padStart(2,'0');

  var nomi = Object.keys(_sfFornitoriMap).map(function(k){
    return { key: k, nome: _sfFornitoriMap[k].nome };
  });
  nomi.sort(function(a,b){ return a.nome.localeCompare(b.nome); });
  var fornOpts = '<option value="tutti">Tutti i fornitori</option>';
  nomi.forEach(function(f){
    var sel = (_sfFiltroFornitore===f.key) ? ' selected' : '';
    fornOpts += '<option value="'+_sfEsc(f.key)+'"'+sel+'>'+_sfEsc(f.nome)+'</option>';
  });

  var h = '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px;flex-wrap:wrap;gap:10px">';
  h += '<div style="font-size:15px;font-weight:600">📋 Scadenzario fornitori</div>';
  h += '<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap">';
  h += '<button onclick="_sfNavMese(-1)" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer;font-weight:bold;color:var(--text)">◀</button>';
  h += '<span style="font-weight:600;padding:0 10px;min-width:140px;text-align:center">'+meseLabel+'</span>';
  h += '<button onclick="_sfNavMese(1)" style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;background:var(--bg);border:0.5px solid var(--border);border-radius:6px;cursor:pointer;font-weight:bold;color:var(--text)">▶</button>';
  h += '<input type="month" value="'+meseVal+'" onchange="_sfImpostaMese(this.value)" style="padding:6px 10px;font-size:12px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);margin-left:6px" />';
  h += '<select onchange="_sfImpostaFornitore(this.value)" style="padding:6px 10px;font-size:12px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);margin-left:6px;max-width:200px">'+fornOpts+'</select>';
  h += '</div></div>';
  return h;
}

// ── KPI strip ────────────────────────────────────────────────────────
function _sfHtmlKPI(k) {
  function card(label, val, color) {
    return '<div style="background:var(--bg);border:0.5px solid var(--border);border-radius:8px;padding:10px 12px">'+
           '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px">'+label+'</div>'+
           '<div style="font-size:17px;font-weight:600;color:'+(color||'var(--text)')+'">'+val+'</div>'+
           '</div>';
  }
  var h = '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:12px">';
  h += card('Senza fattura', _sfFmtE(k.senzaFattura), '#854F0B');
  h += card('Da pagare',     _sfFmtE(k.daPagare),     'var(--text)');
  h += card('Scadute',       _sfFmtE(k.scadute),      '#A32D2D');
  h += card('Pagato mese',   _sfFmtE(k.pagatoMese),   '#3B6D11');
  h += '</div>';
  return h;
}

// ── Filtri stato pillole ─────────────────────────────────────────────
function _sfHtmlFiltri() {
  var filtri = [
    { id: 'tutti',         label: 'Tutti' },
    { id: 'senza-fattura', label: 'Senza fattura' },
    { id: 'da-pagare',     label: 'Da pagare' },
    { id: 'parziali',      label: 'Parziali' },
    { id: 'pagate',        label: 'Pagate' }
  ];
  var h = '<div style="display:flex;gap:6px;margin-bottom:12px;flex-wrap:wrap">';
  filtri.forEach(function(f){
    var on = (_sfFiltroStato === f.id);
    var bg = on ? '#185FA5' : 'var(--bg)';
    var co = on ? '#fff'    : 'var(--text)';
    var bo = on ? '#185FA5' : 'var(--border)';
    h += '<button onclick="_sfImpostaStato(\''+f.id+'\')" style="padding:5px 12px;background:'+bg+';color:'+co+';border:0.5px solid '+bo+';border-radius:6px;font-size:12px;cursor:pointer;font-weight:'+(on?'600':'400')+'">'+f.label+'</button>';
  });
  h += '</div>';
  return h;
}

// ── Tabella ──────────────────────────────────────────────────────────
function _sfHtmlTabella(righe) {
  var h = '<div style="background:var(--bg-card,white);border:0.5px solid var(--border);border-radius:8px;overflow:hidden">';
  // Header
  h += '<div style="display:grid;grid-template-columns:24px 86px 1fr 130px 110px 160px 200px;align-items:center;gap:8px;padding:9px 14px;background:var(--bg);color:var(--text-muted);font-size:11px;font-weight:600">';
  h += '<span></span><span>Data</span><span>Fornitore</span><span>Carichi</span><span style="text-align:right">Totale</span><span>N. fattura</span><span>Stato</span>';
  h += '</div>';

  if (righe.length === 0) {
    h += '<div style="padding:30px;text-align:center;color:var(--text-muted);font-size:13px">Nessuna riga per il periodo e filtri selezionati.</div>';
  } else {
    righe.forEach(function(r){ h += _sfHtmlRiga(r); });

    // Footer totali pagina (somme delle righe visibili dopo i filtri)
    var totOrd = 0, totLit = 0, totImp = 0, totResiduo = 0;
    righe.forEach(function(r){
      totOrd += r.ordini.length;
      totLit += r.totLitri;
      totImp += r.totConIva;
      if (r.fattura) {
        totResiduo += Math.max(0, Number(r.fattura.importo_dichiarato) - r.totPagato);
      } else {
        totResiduo += r.totConIva;
      }
    });

    h += '<div style="display:grid;grid-template-columns:24px 86px 1fr 130px 110px 160px 200px;align-items:center;gap:8px;padding:12px 14px;background:var(--bg);border-top:1px solid var(--border);font-size:12px;font-weight:600">';
    h += '<span></span>';
    h += '<span style="color:var(--text-muted);font-size:11px;text-transform:uppercase;letter-spacing:0.3px">Totale pagina</span>';
    h += '<span style="color:var(--text-muted)">'+righe.length+' righe</span>';
    h += '<span style="color:var(--text-muted)"><strong style="color:var(--text)">'+totOrd+'</strong> ord · '+_sfFmtL(totLit)+'</span>';
    h += '<span style="text-align:right;font-size:14px">'+_sfFmtE(totImp)+'</span>';
    h += '<span></span>';
    h += '<span style="font-size:11px;color:var(--text-muted)">Saldo da pagare: <strong style="color:#A32D2D;font-size:13px">'+_sfFmtE(totResiduo)+'</strong></span>';
    h += '</div>';
  }

  h += '</div>';
  return h;
}

// ── Singola riga + eventuale dettaglio espanso ───────────────────────
function _sfHtmlRiga(r) {
  var espansa = !!_sfRigheEspanse[r.chiave];
  var caret   = espansa ? '▼' : '▶';
  var bgRow   = espansa ? '#F1EFE8' : 'transparent';

  // Cella fattura
  var fatturaCell;
  if (!r.fattura) {
    fatturaCell = '<button onclick="_sfApriModaleInsFattura(\''+r.chiave+'\');event.stopPropagation();" style="width:100%;padding:5px 8px;font-size:12px;background:#FAEEDA;border:0.5px solid #EF9F27;color:#854F0B;border-radius:4px;cursor:pointer;text-align:left;font-weight:500">+ Inserisci fattura</button>';
  } else {
    fatturaCell = '<div style="display:flex;align-items:center;gap:4px">' +
      '<span style="background:#E6F1FB;color:#0C447C;padding:4px 8px;border-radius:4px;font-size:12px;font-weight:600;flex:1;text-align:center;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">'+_sfEsc(r.fattura.numero_fattura)+'</span>' +
      '<button onclick="_sfRimuoviFattura(\''+r.fattura.id+'\');event.stopPropagation();" title="Rimuovi e scollega ordini" style="background:transparent;border:0;cursor:pointer;font-size:14px;color:var(--text-muted);padding:2px 4px">✕</button>' +
      '</div>';
  }

  // Badge stato
  var badge = '';
  switch (r.stato) {
    case 'senza_fattura':
      badge = '<span style="background:#FAEEDA;color:#854F0B;font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600">Senza fattura</span>';
      break;
    case 'scaduta_no_fattura':
      badge = '<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600">⚠ Scaduta '+_sfGiorniDaScadenza(r.dataScadenza)+' gg · no fattura</span>';
      break;
    case 'da_pagare':
      badge = '<span style="background:#E6F1FB;color:#0C447C;font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600">Da pagare · '+_sfFmtD(r.dataScadenza)+'</span>';
      break;
    case 'scaduta':
      badge = '<span style="background:#FCEBEB;color:#A32D2D;font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600">⚠ Scaduta '+_sfGiorniDaScadenza(r.dataScadenza)+' gg</span>';
      break;
    case 'parziale':
      var residuo = Number(r.fattura.importo_dichiarato) - r.totPagato;
      badge = '<span style="background:#E6F1FB;color:#0C447C;font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600">Parziale · res. '+_sfFmtE(residuo)+'</span>';
      break;
    case 'pagata':
      var ult = r.pagamenti[r.pagamenti.length-1];
      var contoLabel = (ult && ult.conto_id) ? (' · '+(_sfIstituti.find(function(i){return i.id===(_sfConti.find(function(c){return c.id===ult.conto_id;})||{}).istituto_id;})||{}).nome) : '';
      badge = '<span style="background:#EAF3DE;color:#3B6D11;font-size:11px;padding:3px 8px;border-radius:10px;font-weight:600">✓ Pagata '+_sfFmtD(ult.data_pagamento)+(contoLabel||'')+'</span>';
      break;
  }

  // Warning quadratura inline (solo se fattura presente, scostamento oltre tolleranza, non override)
  if (r.fattura && !r.quadraturaOk && !r.fattura.override_quadratura) {
    badge = '<span style="background:#FAEEDA;color:#854F0B;font-size:10px;padding:2px 6px;border-radius:8px;font-weight:600;margin-right:4px">Δ '+_sfFmtE(Math.abs(r.quadraturaDiff))+'</span>' + badge;
  } else if (r.fattura && r.fattura.override_quadratura) {
    badge = '<span title="Override quadratura accettato" style="background:#FAEEDA;color:#854F0B;font-size:10px;padding:2px 6px;border-radius:8px;font-weight:600;margin-right:4px">⚠</span>' + badge;
  }

  // Cella data: data ordine + scadenza presunta in rosso sotto
  var scadCorta;
  if (r.data.substring(0,4) === r.dataScadenza.substring(0,4)) {
    scadCorta = _sfFmtD(r.dataScadenza).substring(0,5); // gg/mm
  } else {
    scadCorta = _sfFmtD(r.dataScadenza); // gg/mm/aaaa se anno diverso
  }
  var dataCell = '<span><span style="font-weight:600;display:block;line-height:1.2">'+_sfFmtD(r.data)+'</span>'+
                 '<span style="font-size:10px;color:#A32D2D;display:block;margin-top:2px;line-height:1">scad. '+scadCorta+'</span></span>';

  var h = '<div onclick="_sfToggleEspandi(\''+r.chiave+'\')" style="display:grid;grid-template-columns:24px 86px 1fr 130px 110px 160px 200px;align-items:center;gap:8px;padding:11px 14px;border-bottom:0.5px solid var(--border);background:'+bgRow+';font-size:13px;cursor:pointer">';
  h += '<span style="color:var(--text-muted);font-size:13px">'+caret+'</span>';
  h += dataCell;
  h += '<span style="font-weight:600">'+_sfEsc(r.fornitoreNome)+'</span>';
  h += '<span style="color:var(--text-muted);font-size:12px"><strong style="color:var(--text)">'+r.ordini.length+'</strong> ord · '+_sfFmtL(r.totLitri)+'</span>';
  h += '<span style="text-align:right;font-weight:600">'+_sfFmtE(r.totConIva)+'</span>';
  h += '<span onclick="event.stopPropagation()">'+fatturaCell+'</span>';
  h += '<span style="display:flex;align-items:center;flex-wrap:wrap;gap:2px">'+badge+'</span>';
  h += '</div>';

  if (espansa) h += _sfHtmlRigaEspansa(r);
  return h;
}

// ── Dettaglio espanso (ordini + pagamenti + footer scadenza/quadratura) ──
function _sfHtmlRigaEspansa(r) {
  var h = '<div style="background:#F1EFE8;padding:10px 14px 14px 50px;border-bottom:0.5px solid var(--border);font-size:11px">';

  // Header sub-tabella
  h += '<div style="display:grid;grid-template-columns:90px 130px 1fr 80px 100px;gap:8px;padding:4px 0;color:var(--text-muted);font-size:10px;font-weight:600">';
  h += '<span>Ordine</span><span>Prodotto</span><span>DAS · costo</span><span style="text-align:right">Litri</span><span style="text-align:right">Importo c/IVA</span>';
  h += '</div>';

  r.ordini.forEach(function(o){
    var imp = (Number(o.costo_litro||0)+Number(o.trasporto_litro||0))*Number(o.litri||0);
    var iva = Number(o.iva||22)/100;
    var totRiga = imp * (1 + iva);
    var dasInfo = o.das_firmato_url ? '✓ DAS' : '○';
    h += '<div style="display:grid;grid-template-columns:90px 130px 1fr 80px 100px;gap:8px;padding:4px 0;color:var(--text)">';
    h += '<span style="font-family:monospace;font-size:10px;color:var(--text-muted)">#'+(o.id||'').substring(0,8)+'</span>';
    h += '<span>'+_sfEsc(o.prodotto||'—')+'</span>';
    h += '<span style="color:var(--text-muted)">'+dasInfo+' · €'+Number(o.costo_litro||0).toFixed(4)+'/L'+(Number(o.trasporto_litro||0)>0 ? ' + €'+Number(o.trasporto_litro).toFixed(4)+' trasp.' : '')+'</span>';
    h += '<span style="text-align:right">'+_sfFmtL(o.litri)+'</span>';
    h += '<span style="text-align:right;font-weight:600">'+_sfFmtE(totRiga)+'</span>';
    h += '</div>';
  });

  // Footer scadenza + quadratura
  h += '<div style="margin-top:10px;padding-top:8px;border-top:0.5px dashed var(--border);display:flex;justify-content:space-between;align-items:center;font-size:11px;color:var(--text-muted);flex-wrap:wrap;gap:8px">';
  h += '<span>Scadenza: <strong style="color:var(--text)">'+_sfFmtD(r.dataScadenza)+'</strong> · '+r.ggPagamento+' gg</span>';
  if (r.fattura) {
    var diff = Math.abs(r.quadraturaDiff);
    if (r.quadraturaOk) {
      h += '<span style="color:#3B6D11;font-weight:600">✓ Σ ordini ≈ importo fattura · Δ '+_sfFmtE(diff)+'</span>';
    } else if (r.fattura.override_quadratura) {
      h += '<span style="color:#854F0B;font-weight:600">⚠ Override quadratura · Δ '+_sfFmtE(diff)+'</span>';
    } else {
      h += '<span style="color:#A32D2D;font-weight:600">⚠ Importi non quadrano · Δ '+_sfFmtE(diff)+'</span>';
    }
  } else {
    h += '<span style="color:var(--text-muted)">Totale atteso: '+_sfFmtE(r.totConIva)+' (con IVA)</span>';
  }
  h += '</div>';

  // Pagamenti registrati
  if (r.pagamenti && r.pagamenti.length > 0) {
    h += '<div style="margin-top:10px;font-size:11px">';
    h += '<div style="color:var(--text-muted);font-weight:600;margin-bottom:4px;font-size:10px">PAGAMENTI REGISTRATI:</div>';
    r.pagamenti.forEach(function(p){
      var contoLab = _sfContoLabel(p.conto_id);
      h += '<div style="padding:4px 0;display:flex;justify-content:space-between;color:var(--text)">';
      h += '<span>'+_sfFmtD(p.data_pagamento)+' · <strong>'+(p.modalita||'').toUpperCase()+'</strong> · '+contoLab+(p.riferimento_esterno?' · '+_sfEsc(p.riferimento_esterno):'')+'</span>';
      h += '<span style="font-weight:600">'+_sfFmtE(p.importo)+'</span>';
      h += '</div>';
    });
    h += '</div>';
  }

  // Bottoni azione
  if (r.fattura && r.stato !== 'pagata') {
    var residuo = Number(r.fattura.importo_dichiarato) - r.totPagato;
    h += '<div style="margin-top:12px;text-align:right;display:flex;justify-content:flex-end;gap:8px;align-items:center">';
    h += '<span style="font-size:11px;color:var(--text-muted)">Saldo residuo: <strong style="color:var(--text)">'+_sfFmtE(residuo)+'</strong></span>';
    h += '<button onclick="_sfApriModalePagamento(\''+r.fattura.id+'\')" style="padding:7px 14px;background:#185FA5;color:white;border:0.5px solid #185FA5;border-radius:6px;font-size:12px;font-weight:600;cursor:pointer">+ Registra pagamento</button>';
    h += '</div>';
  }

  h += '</div>';
  return h;
}

// ═════════════════════════════════════════════════════════════════════
// NAV + FILTRI (handlers)
// ═════════════════════════════════════════════════════════════════════
function _sfNavMese(dir) {
  _sfFiltroMese += dir;
  if (_sfFiltroMese < 0)  { _sfFiltroMese = 11; _sfFiltroAnno--; }
  if (_sfFiltroMese > 11) { _sfFiltroMese = 0;  _sfFiltroAnno++; }
  caricaScadenzarioFornitori();
}
function _sfImpostaMese(meseStr) {
  var p = (meseStr||'').split('-');
  if (p.length !== 2) return;
  _sfFiltroAnno = parseInt(p[0]);
  _sfFiltroMese = parseInt(p[1]) - 1;
  caricaScadenzarioFornitori();
}
function _sfImpostaStato(stato) { _sfFiltroStato = stato; renderScadenzarioFornitori(); }
function _sfImpostaFornitore(id) { _sfFiltroFornitore = id; renderScadenzarioFornitori(); }
function _sfToggleEspandi(chiave) {
  if (_sfRigheEspanse[chiave]) delete _sfRigheEspanse[chiave];
  else _sfRigheEspanse[chiave] = true;
  renderScadenzarioFornitori();
}

// ═════════════════════════════════════════════════════════════════════
// MODALE "INSERISCI FATTURA"
// ═════════════════════════════════════════════════════════════════════
function _sfApriModaleInsFattura(chiaveRiga) {
  var righe = _sfAggregaRighe();
  var r = righe.find(function(x){ return x.chiave === chiaveRiga; });
  if (!r) { alert('Riga non trovata'); return; }
  _sfModaleCtx = {
    chiaveRiga: chiaveRiga,
    totConIva: r.totConIva,
    fornitoreNomeKey: r.fornitoreNomeKey,
    fornitoreNome: r.fornitoreNome,
    data: r.data,
    ggPagamento: r.ggPagamento || 30,
    scadenzaPresunta: r.dataScadenzaPresunta,
    ordiniIds: r.ordini.map(function(o){return o.id;})
  };

  var totDef = r.totConIva.toFixed(2);
  var nOrd = r.ordini.length;

  var h = '<div id="sf-modale-bg" style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.45);z-index:9999;display:flex;align-items:flex-start;justify-content:center;padding:30px 20px;overflow-y:auto">';
  h += '<div style="background:var(--bg-card,white);width:100%;max-width:520px;border-radius:12px;overflow:hidden;font-family:inherit;box-shadow:0 8px 32px rgba(0,0,0,0.2)">';

  // Header
  h += '<div style="padding:14px 20px;border-bottom:0.5px solid var(--border);display:flex;align-items:center;justify-content:space-between">';
  h += '<div><div style="font-size:15px;font-weight:600">Inserisci fattura</div>';
  h += '<div style="font-size:12px;color:var(--text-muted);margin-top:3px">'+_sfEsc(r.fornitoreNome)+' · '+_sfFmtD(r.data)+' · '+nOrd+' ordin'+(nOrd===1?'e':'i')+'</div></div>';
  h += '<button onclick="_sfChiudiModale()" style="background:transparent;border:0;font-size:22px;cursor:pointer;color:var(--text-muted);line-height:1;padding:0 4px">×</button>';
  h += '</div>';

  // Body
  h += '<div style="padding:18px 20px">';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';
  h += '<div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Numero fattura *</label>';
  h += '<input id="sf-mod-numero" type="text" placeholder="es. FT 2026/142" style="width:100%;padding:8px 10px;font-size:14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);box-sizing:border-box" autofocus /></div>';
  h += '<div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Data fattura *</label>';
  h += '<input id="sf-mod-data" type="date" value="'+r.data+'" onchange="_sfRicalcolaScadenzaModale()" style="width:100%;padding:8px 10px;font-size:14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);box-sizing:border-box" /></div>';
  h += '</div>';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:14px">';
  h += '<div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Importo totale fattura c/IVA *</label>';
  h += '<input id="sf-mod-importo" type="number" step="0.01" min="0.01" value="'+totDef+'" oninput="_sfAggQuadratura()" style="width:100%;padding:8px 10px;font-size:15px;font-weight:600;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);box-sizing:border-box" /></div>';
  h += '<div><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Data scadenza * <span style="color:var(--text-muted);font-weight:400">('+(_sfModaleCtx.ggPagamento)+' gg)</span></label>';
  h += '<input id="sf-mod-scadenza" type="date" value="'+_sfModaleCtx.scadenzaPresunta+'" oninput="this.dataset.userModified=\'true\'" style="width:100%;padding:8px 10px;font-size:14px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);box-sizing:border-box" /></div>';
  h += '</div>';

  // Preview quadratura
  h += '<div id="sf-mod-quadratura" style="margin-bottom:14px"></div>';

  h += '<div style="margin-bottom:14px"><label style="font-size:11px;color:var(--text-muted);display:block;margin-bottom:4px;font-weight:600">Note (opzionale)</label>';
  h += '<textarea id="sf-mod-note" rows="2" placeholder="es. abbuono carrier, sconto extra…" style="width:100%;padding:8px 10px;font-size:13px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg);color:var(--text);box-sizing:border-box;resize:vertical;font-family:inherit"></textarea></div>';

  h += '</div>';

  // Footer
  h += '<div style="padding:12px 20px;border-top:0.5px solid var(--border);display:flex;justify-content:flex-end;gap:8px">';
  h += '<button onclick="_sfChiudiModale()" style="padding:8px 14px;font-size:13px;background:var(--bg);border:0.5px solid var(--border);color:var(--text);border-radius:6px;cursor:pointer">Annulla</button>';
  h += '<button id="sf-mod-salva" onclick="_sfSalvaFattura()" style="padding:8px 18px;font-size:13px;background:#0C447C;color:white;border:0.5px solid #0C447C;border-radius:6px;font-weight:600;cursor:pointer">Salva fattura</button>';
  h += '</div>';

  h += '</div></div>';

  // Rimuove eventuale modale precedente
  var existing = document.getElementById('sf-modale-bg');
  if (existing) existing.remove();
  document.body.insertAdjacentHTML('beforeend', h);

  setTimeout(function(){
    var n = document.getElementById('sf-mod-numero');
    if (n) n.focus();
    _sfAggQuadratura();
  }, 50);
}

function _sfChiudiModale() {
  var el = document.getElementById('sf-modale-bg');
  if (el) el.remove();
  _sfModaleCtx = null;
}

function _sfRicalcolaScadenzaModale() {
  if (!_sfModaleCtx) return;
  var dataF = document.getElementById('sf-mod-data');
  var dataS = document.getElementById('sf-mod-scadenza');
  if (!dataF || !dataS) return;
  // Se l'utente ha già modificato a mano la scadenza, non sovrascrivere
  if (dataS.dataset.userModified === 'true') return;
  if (!dataF.value) return;
  var d = new Date(dataF.value + 'T12:00:00');
  d.setDate(d.getDate() + (_sfModaleCtx.ggPagamento || 30));
  // Sposta al lunedì se cade sab/dom (allineato a pf-finanze.js calendario)
  dataS.value = _sfSpostaAlLunedi(d.toISOString().split('T')[0]);
}

function _sfAggQuadratura() {  if (!_sfModaleCtx) return;
  var inp = document.getElementById('sf-mod-importo');
  var divEl = document.getElementById('sf-mod-quadratura');
  if (!inp || !divEl) return;
  var importo = parseFloat(inp.value || '0');
  var totAtt = _sfModaleCtx.totConIva;
  var diff = importo - totAtt;
  var diffAbs = Math.abs(diff);

  if (importo <= 0) { divEl.innerHTML = ''; return; }

  if (diffAbs <= _sfTolleranzaQuadratura) {
    divEl.innerHTML = '<div style="background:#EAF3DE;color:#27500A;padding:8px 12px;border-radius:6px;font-size:12px;font-weight:500;display:flex;align-items:center;gap:8px">'+
      '<span style="font-size:14px">✓</span>'+
      '<span>Quadratura OK · Σ ordini c/IVA = '+_sfFmtE(totAtt)+' · Δ '+_sfFmtE(diffAbs)+'</span>'+
      '</div>';
  } else {
    divEl.innerHTML = '<div style="background:#FAEEDA;color:#633806;padding:10px 12px;border-radius:6px;font-size:12px;font-weight:500">'+
      '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px"><span style="font-size:14px">⚠</span><span>Importi non quadrano</span></div>'+
      '<div style="font-size:11px;margin-bottom:6px;color:#854F0B">Σ ordini c/IVA: '+_sfFmtE(totAtt)+' · Importo dichiarato: '+_sfFmtE(importo)+' · Δ '+(diff>=0?'+':'-')+_sfFmtE(diffAbs)+'</div>'+
      '<label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="sf-mod-override" style="margin:0"><span>Ho verificato la differenza, salva comunque</span></label>'+
      '</div>';
  }
}

async function _sfSalvaFattura() {
  if (!_sfModaleCtx) return;
  var numero = (document.getElementById('sf-mod-numero').value||'').trim();
  var importo = parseFloat(document.getElementById('sf-mod-importo').value);
  var dataFatt = document.getElementById('sf-mod-data').value;
  var dataScad = document.getElementById('sf-mod-scadenza').value;
  var note = (document.getElementById('sf-mod-note').value||'').trim();

  if (!numero)   { alert('Inserisci il numero fattura'); return; }
  if (!importo || importo <= 0) { alert('Inserisci un importo valido'); return; }
  if (!dataFatt) { alert('Inserisci la data fattura'); return; }
  if (!dataScad) { alert('Inserisci la data scadenza'); return; }

  var totAtt = _sfModaleCtx.totConIva;
  var diff = Math.abs(importo - totAtt);
  var override = false;
  if (diff > _sfTolleranzaQuadratura) {
    var chk = document.getElementById('sf-mod-override');
    if (!chk || !chk.checked) {
      alert('Gli importi non quadrano (Δ '+_sfFmtE(diff)+'). Spunta "Ho verificato la differenza" per procedere.');
      return;
    }
    override = true;
  }

  var btn = document.getElementById('sf-mod-salva');
  if (btn) { btn.disabled = true; btn.textContent = 'Salvataggio…'; btn.style.opacity = '0.6'; }

  try {
    // Risolvi fornitore_id dall'anagrafica via nome (ordini non ha fornitore_id)
    var forn = _sfFornitoriMap[_sfModaleCtx.fornitoreNomeKey] || null;
    var fornitoreId = forn ? forn.id : null;

    var ins = await sb.from('fatture_ricevute').insert([{
      fornitore_id:        fornitoreId,
      fornitore_nome:      _sfModaleCtx.fornitoreNome,
      numero_fattura:      numero,
      data_fattura:        dataFatt,
      data_scadenza:       dataScad,
      importo_dichiarato:  importo,
      override_quadratura: override,
      note:                note || null,
      tipo_ingresso:       'manuale'
    }]).select().single();

    if (ins.error) throw ins.error;

    // Aggancia ordini della tupla
    var upd = await sb.from('ordini')
      .update({ fattura_ricevuta_id: ins.data.id })
      .in('id', _sfModaleCtx.ordiniIds);

    if (upd.error) throw upd.error;

    _sfChiudiModale();
    await caricaScadenzarioFornitori();
  } catch (e) {
    console.error('[sf] errore salva fattura', e);
    var msg = e.message || String(e);
    // Caso unique constraint: stesso fornitore + stesso numero
    if (msg.indexOf('duplicate') >= 0 || msg.indexOf('unique') >= 0) {
      alert('Esiste già una fattura con questo numero per lo stesso fornitore.');
    } else {
      alert('Errore salvataggio: ' + msg);
    }
    if (btn) { btn.disabled = false; btn.textContent = 'Salva fattura'; btn.style.opacity = '1'; }
  }
}

// ═════════════════════════════════════════════════════════════════════
// RIMOZIONE FATTURA (scollega ordini + cancella)
// ═════════════════════════════════════════════════════════════════════
async function _sfRimuoviFattura(fatturaId) {
  var f = _sfFatture.find(function(x){ return x.id === fatturaId; });
  if (!f) return;
  var pag = _sfPagamenti.filter(function(p){ return p.fattura_ricevuta_id === fatturaId; });
  if (pag.length > 0) {
    alert('Impossibile rimuovere: ci sono '+pag.length+' pagament'+(pag.length===1?'o':'i')+' registrat'+(pag.length===1?'o':'i')+' su questa fattura.\nCancella prima i pagamenti.');
    return;
  }
  if (!confirm('Rimuovere fattura "'+(f.numero_fattura||'?')+'" e scollegare i suoi ordini?')) return;

  try {
    var u = await sb.from('ordini').update({ fattura_ricevuta_id: null }).eq('fattura_ricevuta_id', fatturaId);
    if (u.error) throw u.error;
    var d = await sb.from('fatture_ricevute').delete().eq('id', fatturaId);
    if (d.error) throw d.error;
    await caricaScadenzarioFornitori();
  } catch (e) {
    console.error('[sf] errore rimuovi fattura', e);
    alert('Errore: ' + (e.message || String(e)));
  }
}

// ═════════════════════════════════════════════════════════════════════
// MODALE PAGAMENTO — delega al modulo condiviso pf-pagamento-fornitore-modale.js
// ═════════════════════════════════════════════════════════════════════
function _sfApriModalePagamento(fatturaId) {
  if (typeof apriModalePagamentoFornitore !== 'function') {
    alert('Modulo modale pagamento non caricato. Ricarica la pagina e riprova.');
    return;
  }
  apriModalePagamentoFornitore(fatturaId, {
    onSaved: function(result){
      // result = { saldata: bool, importo: number }
      caricaScadenzarioFornitori();
    }
  });
}

// ═════════════════════════════════════════════════════════════════════
// EXPORT (per coerenza con altri moduli)
// ═════════════════════════════════════════════════════════════════════
window.caricaScadenzarioFornitori   = caricaScadenzarioFornitori;
window.renderScadenzarioFornitori   = renderScadenzarioFornitori;
window._sfApriModaleInsFattura      = _sfApriModaleInsFattura;
window._sfChiudiModale              = _sfChiudiModale;
window._sfAggQuadratura             = _sfAggQuadratura;
window._sfRicalcolaScadenzaModale   = _sfRicalcolaScadenzaModale;
window._sfSalvaFattura              = _sfSalvaFattura;
window._sfRimuoviFattura            = _sfRimuoviFattura;
window._sfApriModalePagamento       = _sfApriModalePagamento;
window._sfNavMese                   = _sfNavMese;
window._sfImpostaMese               = _sfImpostaMese;
window._sfImpostaStato              = _sfImpostaStato;
window._sfImpostaFornitore          = _sfImpostaFornitore;
window._sfToggleEspandi             = _sfToggleEspandi;
