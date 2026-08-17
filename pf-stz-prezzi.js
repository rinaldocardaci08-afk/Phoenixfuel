// PhoenixFuel — Stazione: Calcolo CMP e prezzi (simulatore) + Margine obiettivo
// v20260817a — file nuovo.
//
// COSA FA
//   Pulsante "🧮 Calcolo CMP e Prezzi" nella riga CMP del Magazzino stazione
//   (aggancio in pf-stz-magazzino.js, accanto a 🔍 Analisi).
//   Apre un modale a due schermate:
//     A) Simulatore CMP — litri presenti e carico in arrivo modificabili.
//     B) Margine obiettivo — i due prodotti, incidenze, proposte incrociate, PDF.
//
// NON SCRIVE NIENTE sulle giacenze, sui CMP, sui prezzi pompa. L'unica scrittura
// e' sulla tabella stazione_margine_obiettivo, e solo quando premi Salva.
//
// PERCHE' UNA TABELLA NUOVA
//   prodotti.margine_obiettivo esiste gia' ed e' la MARGINALITA' CERCATA DEL
//   PRODOTTO (la matita nel listino, usata da "Prezzo su CMP"). Il margine
//   obiettivo DI GIORNATA e' un'altra cosa: sta sulla stazione, non sul prodotto.
//   Scriverlo la' avrebbe rotto il Prezzo su CMP.
//
// REGOLA DI LETTURA DELL'OBIETTIVO
//   Si legge sempre l'ultima riga con data <= oggi. Se oggi metti 0,110 e fra
//   due settimane 0,120, i giorni prima restano a 0,110: storico automatico.
//
// LITRI VENDUTI
//   stazione_letture contiene TOTALIZZATORI progressivi, non litri. I litri
//   sono le differenze consecutive per pompa; i salti negativi (azzeramento o
//   pompa sostituita) vengono scartati. Il prodotto arriva da stazione_pompe.
//
// TRAPPOLE RISPETTATE
//   - Niente template literal annidati: solo concatenazione.
//   - cacheProdotti e' dichiarata con let: si legge con typeof.
//   - fmtL() aggiunge gia' la "L".
//   - Un dato imprevisto deve mostrare di piu', non fare sparire la pagina.

var _STZ_IVA = 1.22;
var _stzP = {};        // stato dei prodotti nel modale
var _stzCorrente = ''; // prodotto attivo nella schermata A
var _stzObiettivo = { margine: 0.110, incidenze: {}, data: null };
var _stzVendite = null; // { rec:{prod:litri}, prec:{prod:litri}, ... }

// ── UTILITY ──────────────────────────────────────────────────────

function _stzNum(n, d) {
  if (n == null || !isFinite(n)) return '—';
  return Number(n).toLocaleString('it-IT', { minimumFractionDigits: d, maximumFractionDigits: d });
}

function _stzISO(d) { return d.toISOString().split('T')[0]; }

function _stzDataIt(iso) {
  if (!iso) return '—';
  var p = String(iso).split('-');
  if (p.length !== 3) return iso;
  return p[2] + '/' + p[1] + '/' + p[0];
}

function _stzVal(id) {
  var el = document.getElementById(id);
  if (!el) return NaN;
  return parseFloat(String(el.value).replace(',', '.'));
}

function _stzSet(id, txt) {
  var el = document.getElementById(id);
  if (el) el.innerHTML = txt;
}

function _stzColore(prod) {
  if (typeof cacheProdotti === 'undefined' || !cacheProdotti) return '#888780';
  var p = cacheProdotti.find(function (x) { return x.nome === prod; });
  return p && p.colore ? p.colore : '#888780';
}

// ── OBIETTIVO: LETTURA E SCRITTURA ───────────────────────────────

async function _stzLeggiObiettivo() {
  var oggi = _stzISO(new Date());
  try {
    var r = await sb.from('stazione_margine_obiettivo')
      .select('*').lte('data', oggi)
      .order('data', { ascending: false }).limit(1);
    if (r.data && r.data.length) {
      var row = r.data[0];
      _stzObiettivo = {
        margine: Number(row.margine),
        incidenze: (row.incidenze && typeof row.incidenze === 'object') ? row.incidenze : {},
        data: row.data
      };
      return;
    }
  } catch (e) { console.warn('[stz-prezzi] lettura obiettivo:', e); }
  _stzObiettivo = { margine: 0.110, incidenze: {}, data: null };
}

async function _stzSalvaObiettivo() {
  var marg = _stzVal('stz-mo-target');
  if (!isFinite(marg) || marg < 0) { toast('Margine obiettivo non valido'); return; }
  var inc = {};
  var prodotti = Object.keys(_stzP);
  for (var i = 0; i < prodotti.length; i++) {
    var v = _stzVal('stz-mo-inc-' + i);
    if (!isFinite(v) || v < 0) { toast('Incidenza non valida su ' + prodotti[i]); return; }
    inc[prodotti[i]] = v;
  }
  var oggi = _stzISO(new Date());
  var r = await sb.from('stazione_margine_obiettivo')
    .upsert({ data: oggi, margine: marg, incidenze: inc }, { onConflict: 'data' });
  if (r.error) { toast('Errore salvataggio: ' + r.error.message); return; }
  _stzObiettivo = { margine: marg, incidenze: inc, data: oggi };
  toast('✓ Margine obiettivo salvato — vale da oggi');
  _stzSet('stz-mo-vigenza', 'in vigore dal ' + _stzDataIt(oggi));
}

// ── LITRI VENDUTI DA TOTALIZZATORI ───────────────────────────────

async function _stzLitriVenduti(dal, al) {
  var out = {};
  var pompeRes = await sb.from('stazione_pompe').select('id,prodotto');
  var mapProd = {};
  (pompeRes.data || []).forEach(function (p) { mapProd[p.id] = p.prodotto; });

  // Si parte 20 giorni prima per avere la lettura di base da cui sottrarre.
  var base = new Date(dal + 'T12:00:00');
  base.setDate(base.getDate() - 20);
  var q = await sb.from('stazione_letture')
    .select('pompa_id,data,lettura')
    .gte('data', _stzISO(base)).lte('data', al)
    .order('data', { ascending: true });
  var righe = q.data || [];

  var perPompa = {};
  righe.forEach(function (r) {
    if (!perPompa[r.pompa_id]) perPompa[r.pompa_id] = [];
    perPompa[r.pompa_id].push(r);
  });

  Object.keys(perPompa).forEach(function (pid) {
    var prod = mapProd[pid] || 'Sconosciuto';
    var lista = perPompa[pid];
    for (var i = 1; i < lista.length; i++) {
      var d = Number(lista[i].lettura) - Number(lista[i - 1].lettura);
      // Salto negativo = azzeramento o pompa sostituita: si scarta.
      if (!isFinite(d) || d <= 0) continue;
      // Conta solo se la lettura di arrivo cade nella finestra richiesta.
      if (lista[i].data < dal || lista[i].data > al) continue;
      if (!out[prod]) out[prod] = 0;
      out[prod] += d;
    }
  });
  return out;
}

async function _stzCaricaVendite() {
  var oggi = new Date();
  var al = _stzISO(oggi);
  var d3 = new Date(oggi); d3.setMonth(d3.getMonth() - 3);
  var dal = _stzISO(d3);
  // Stessa finestra dell'anno prima: distingue un cambio vero dalla stagionalita'.
  var alPrec = new Date(oggi); alPrec.setFullYear(alPrec.getFullYear() - 1);
  var dalPrec = new Date(d3); dalPrec.setFullYear(dalPrec.getFullYear() - 1);
  try {
    var rec = await _stzLitriVenduti(dal, al);
    var prec = await _stzLitriVenduti(_stzISO(dalPrec), _stzISO(alPrec));
    _stzVendite = { rec: rec, prec: prec, dal: dal, al: al,
                    dalPrec: _stzISO(dalPrec), alPrec: _stzISO(alPrec) };
  } catch (e) {
    console.warn('[stz-prezzi] litri venduti:', e);
    _stzVendite = null;
  }
}

// ── APERTURA: RACCOLTA DATI ──────────────────────────────────────

async function _stzApriCalcoloPrezzi(prodottoIniziale) {
  try {
    var cisRes = await sb.from('cisterne').select('*').eq('sede', 'stazione_oppido');
    var cisterne = cisRes.data || [];
    if (!cisterne.length) { toast('Nessuna cisterna in stazione'); return; }

    // Raggruppa per prodotto: litri e CMP ponderato, come fa il Magazzino.
    var gruppi = {};
    cisterne.forEach(function (c) {
      var p = c.prodotto || '—';
      if (!gruppi[p]) gruppi[p] = { litri: 0, valore: 0 };
      gruppi[p].litri += Number(c.livello_attuale || 0);
      gruppi[p].valore += Number(c.livello_attuale || 0) * Number(c.costo_medio || 0);
    });

    await _stzLeggiObiettivo();

    // Ultimo prezzo pompa salvato per prodotto: serve alla marginalita' applicata.
    var przRes = await sb.from('stazione_prezzi')
      .select('prodotto,prezzo_litro,data')
      .order('data', { ascending: false }).limit(80);
    var ultimoPrezzo = {};
    (przRes.data || []).forEach(function (r) {
      if (!ultimoPrezzo[r.prodotto]) ultimoPrezzo[r.prodotto] = r;
    });

    _stzP = {};
    Object.keys(gruppi).sort().forEach(function (nome) {
      var g = gruppi[nome];
      var cmp = g.litri > 0 ? g.valore / g.litri : 0;
      var pi = (typeof cacheProdotti !== 'undefined' && cacheProdotti)
        ? cacheProdotti.find(function (x) { return x.nome === nome; }) : null;
      var mgCercata = (pi && pi.margine_obiettivo != null) ? Number(pi.margine_obiettivo) : null;
      var up = ultimoPrezzo[nome] || null;
      // Il prezzo pompa e' quello esposto, IVA inclusa: il netto e' /1,22.
      var mgApplicata = null;
      if (up && cmp > 0) {
        var netto = Number(up.prezzo_litro) / _STZ_IVA;
        if (isFinite(netto)) mgApplicata = netto - cmp;
      }
      var incSalvata = (_stzObiettivo.incidenze && _stzObiettivo.incidenze[nome] != null)
        ? Number(_stzObiettivo.incidenze[nome]) : null;
      _stzP[nome] = {
        nome: nome,
        cmp0: cmp,
        lp0: g.litri,
        lp: g.litri,
        le: 0,
        ce: cmp > 0 ? cmp : 0,
        mgApplicata: mgApplicata,
        prezzoRif: up,
        mgCercata: mgCercata,
        mg: mgCercata != null ? mgCercata : 0.100,
        inc: incSalvata
      };
    });

    var nomi = Object.keys(_stzP);
    if (!nomi.length) { toast('Nessun prodotto in stazione'); return; }
    _stzCorrente = (prodottoIniziale && _stzP[prodottoIniziale]) ? prodottoIniziale : nomi[0];

    // Incidenze: quelle salvate, altrimenti 60/40 sui due prodotti storici,
    // altrimenti riparto in parti uguali (mai lasciare campi vuoti).
    var senzaInc = nomi.filter(function (n) { return _stzP[n].inc == null; });
    if (senzaInc.length) {
      nomi.forEach(function (n) {
        if (_stzP[n].inc != null) return;
        if (nomi.length === 2) {
          _stzP[n].inc = (n.toLowerCase().indexOf('gasolio') >= 0) ? 60 : 40;
        } else {
          _stzP[n].inc = Math.round(100 / nomi.length);
        }
      });
    }

    apriModal(_stzHtmlModale());
    _stzMostraA();
    _stzCaricaVendite().then(function () { _stzRendNota(); });
  } catch (e) {
    console.error('[stz-prezzi] apertura:', e);
    toast('Errore apertura calcolo: ' + e.message);
  }
}
window._stzApriCalcoloPrezzi = _stzApriCalcoloPrezzi;

// ── HTML DEL MODALE ──────────────────────────────────────────────

function _stzHtmlModale() {
  var nomi = Object.keys(_stzP);
  var h = '<div style="max-width:660px">';

  // ---- Schermata A ----
  h += '<div id="stz-sa">';
  h += '<h2 style="margin:0 0 4px 0;color:#26215C">🧮 Calcolo CMP e prezzi</h2>';
  h += '<div id="stz-sub" style="color:var(--text-muted);font-size:12px;margin-bottom:12px"></div>';

  h += '<div style="display:flex;gap:6px;margin-bottom:12px" id="stz-tabs">';
  nomi.forEach(function (n, i) {
    h += '<button id="stz-tab-' + i + '" onclick="_stzCambiaProdotto(\'' + esc(n) + '\')" style="flex:1;padding:7px 10px;font-size:12px;border-radius:6px;cursor:pointer;border:0.5px solid var(--border);background:none;color:var(--text)">' + esc(n) + '</button>';
  });
  h += '</div>';

  h += '<div style="background:#FAEEDA;color:#854F0B;font-size:11px;padding:6px 10px;border-radius:6px;margin-bottom:12px">Simulazione: non modifica giacenze, CMP o prezzi a sistema</div>';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">';
  // Litri presenti
  h += '<div style="background:var(--bg);border-radius:8px;padding:10px 12px">';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">LITRI PRESENTI</div>';
  h += '<input type="number" id="stz-lp" step="1" oninput="_stzCalcA()" style="width:100%;font-family:var(--font-mono);font-size:15px;padding:6px 8px;border:0.5px solid var(--border-strong,#888780);border-radius:6px;background:var(--bg-card);color:var(--text)" />';
  h += '<div style="font-size:10px;color:var(--text-muted);margin-top:3px">a sistema <span id="stz-lp0"></span> · <a href="javascript:void(0)" onclick="_stzRipristinaLitri()" style="color:#185FA5">ripristina</a></div>';
  h += '<div style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono);margin-top:6px">× € <span id="stz-cmp0"></span></div>';
  h += '<div style="font-size:10px;color:var(--text-muted)">CMP attuale, non modificabile</div>';
  h += '<div style="border-top:0.5px solid var(--border);margin-top:6px;padding-top:6px;font-family:var(--font-mono);font-size:14px">= € <span id="stz-vp"></span></div>';
  h += '</div>';
  // Litri in arrivo
  h += '<div style="background:#EAF3DE;border-radius:8px;padding:10px 12px">';
  h += '<div style="font-size:11px;color:#3B6D11;margin-bottom:6px">+ LITRI IN ARRIVO</div>';
  h += '<input type="number" id="stz-le" step="1" oninput="_stzCalcA()" style="width:100%;font-family:var(--font-mono);font-size:15px;padding:6px 8px;border:0.5px solid #97C459;border-radius:6px;background:var(--bg-card);color:var(--text)" />';
  h += '<div style="font-size:10px;color:#3B6D11;margin-top:3px">carico non ancora entrato</div>';
  h += '<div style="display:flex;align-items:center;gap:5px;margin-top:6px"><span style="font-size:12px;color:#3B6D11;font-family:var(--font-mono)">× €</span>';
  h += '<input type="number" id="stz-ce" step="0.000001" oninput="_stzCalcA()" style="flex:1;font-family:var(--font-mono);font-size:13px;padding:5px 7px;border:0.5px solid #97C459;border-radius:6px;background:var(--bg-card);color:var(--text)" /></div>';
  h += '<div style="border-top:0.5px solid #97C459;margin-top:6px;padding-top:6px;font-family:var(--font-mono);font-size:14px;color:#3B6D11">= € <span id="stz-ve"></span></div>';
  h += '</div>';
  h += '</div>';

  h += '<div style="background:var(--bg);border-radius:8px;padding:8px 12px;display:flex;justify-content:space-between;margin-top:10px">';
  h += '<div><div style="font-size:11px;color:var(--text-muted)">LITRI TOTALI</div><div style="font-family:var(--font-mono);font-size:15px" id="stz-lt"></div></div>';
  h += '<div style="text-align:right"><div style="font-size:11px;color:var(--text-muted)">VALORE TOTALE</div><div style="font-family:var(--font-mono);font-size:15px" id="stz-vt"></div></div>';
  h += '</div>';

  h += '<div style="background:#FAEEDA;border-radius:8px;padding:10px 12px;display:flex;justify-content:space-between;align-items:flex-end;margin-top:10px">';
  h += '<div><div style="font-size:11px;color:#854F0B">NUOVO CMP SIMULATO</div>';
  h += '<div style="font-size:10px;color:#854F0B;font-family:var(--font-mono);margin-top:2px" id="stz-fx"></div>';
  h += '<div style="font-size:10px;color:#854F0B;font-family:var(--font-mono);margin-top:3px" id="stz-dl"></div></div>';
  h += '<div style="font-family:var(--font-mono);font-size:19px;color:#854F0B">€ <span id="stz-cmp"></span></div>';
  h += '</div>';

  h += '<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-top:10px">';
  h += '<div style="background:#E6F1FB;border-radius:8px;padding:10px 12px">';
  h += '<div style="font-size:11px;color:#0C447C;margin-bottom:4px">PREZZO · ULTIMA MARGINALITÀ</div>';
  h += '<div style="font-family:var(--font-mono);font-size:16px;color:#0C447C">€ <span id="stz-p1"></span></div>';
  h += '<div style="font-size:11px;color:#185FA5;font-family:var(--font-mono)">IVA inc. € <span id="stz-i1"></span></div>';
  h += '<div style="border-top:0.5px solid #85B7EB;margin-top:6px;padding-top:5px;font-size:10px;color:#0C447C;font-family:var(--font-mono)" id="stz-mu"></div>';
  h += '</div>';
  h += '<div style="background:#E6F1FB;border-radius:8px;padding:10px 12px">';
  h += '<div style="font-size:11px;color:#0C447C;margin-bottom:4px">PREZZO · MARGINALITÀ CERCATA</div>';
  h += '<div style="font-family:var(--font-mono);font-size:16px;color:#0C447C">€ <span id="stz-p2"></span></div>';
  h += '<div style="font-size:11px;color:#185FA5;font-family:var(--font-mono)">IVA inc. € <span id="stz-i2"></span></div>';
  h += '<div style="border-top:0.5px solid #85B7EB;margin-top:6px;padding-top:5px;display:flex;align-items:center;gap:5px"><span style="font-size:11px;color:#0C447C;font-family:var(--font-mono)">€/L</span>';
  h += '<input type="number" id="stz-mg" step="0.001" oninput="_stzCalcA()" style="flex:1;font-family:var(--font-mono);font-size:13px;padding:4px 6px;border:0.5px solid #85B7EB;border-radius:6px;background:var(--bg-card);color:var(--text)" /></div>';
  h += '<div style="font-size:10px;color:#0C447C;margin-top:3px" id="stz-mgs"></div>';
  h += '</div>';
  h += '</div>';

  h += '<div id="stz-err" style="font-size:12px;color:#A32D2D;margin-top:8px"></div>';
  h += '<div style="display:flex;gap:8px;margin-top:12px">';
  h += '<button class="btn-primary" onclick="_stzVaiObiettivo()">🎯 Margine obiettivo</button>';
  h += '<button class="btn-secondary" onclick="chiudiModal()">Chiudi</button>';
  h += '</div>';
  h += '</div>';

  // ---- Schermata B ----
  h += '<div id="stz-sb" style="display:none">';
  h += '<h2 style="margin:0 0 4px 0;color:#26215C">🎯 Margine obiettivo</h2>';
  h += '<div style="color:var(--text-muted);font-size:12px;margin-bottom:12px">Stazione Oppido · <span id="stz-mo-vigenza"></span></div>';

  h += '<div style="background:var(--bg);border-radius:8px;padding:10px 12px;display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">';
  h += '<div style="font-size:12px;color:var(--text-muted)">Margine obiettivo giornata</div>';
  h += '<div style="display:flex;align-items:center;gap:5px"><span style="font-size:12px;color:var(--text-muted);font-family:var(--font-mono)">€/L</span>';
  h += '<input type="number" id="stz-mo-target" step="0.001" oninput="_stzCalcB()" style="width:100px;font-family:var(--font-mono);font-size:14px;padding:6px 8px;border:0.5px solid var(--border-strong,#888780);border-radius:6px;background:var(--bg-card);color:var(--text)" /></div>';
  h += '</div>';

  h += '<table style="width:100%;border-collapse:collapse;font-size:12px;table-layout:fixed">';
  h += '<thead><tr style="font-size:10px;color:var(--text-muted);text-align:right">';
  h += '<th style="text-align:left;padding:5px 3px;width:24%">PRODOTTO</th>';
  h += '<th style="padding:5px 3px;width:11%">INCID.</th>';
  h += '<th style="padding:5px 3px;width:15%">COSTO €/L</th>';
  h += '<th style="padding:5px 3px;width:15%">MARGINE</th>';
  h += '<th style="padding:5px 3px;width:12%">PROPOSTA</th>';
  h += '<th style="padding:5px 3px;width:11%">NETTO</th>';
  h += '<th style="padding:5px 3px;width:12%">IVA INC.</th>';
  h += '</tr></thead><tbody>';
  Object.keys(_stzP).forEach(function (n, i) {
    h += '<tr style="border-top:0.5px solid var(--border);text-align:right;font-family:var(--font-mono)">';
    h += '<td style="text-align:left;padding:7px 3px;font-family:var(--font-sans)"><span style="display:inline-block;width:7px;height:7px;border-radius:50%;background:' + _stzColore(n) + ';margin-right:5px"></span>' + esc(n) + '</td>';
    h += '<td style="padding:7px 3px"><input type="number" id="stz-mo-inc-' + i + '" step="1" oninput="_stzCalcB()" style="width:100%;font-family:var(--font-mono);font-size:12px;padding:4px 5px;text-align:right;border:0.5px solid var(--border);border-radius:5px;background:var(--bg-card);color:var(--text)" /></td>';
    h += '<td style="padding:7px 3px" id="stz-mo-c-' + i + '"></td>';
    h += '<td style="padding:7px 3px"><input type="number" id="stz-mo-mg-' + i + '" step="0.001" oninput="_stzCalcB()" style="width:100%;font-family:var(--font-mono);font-size:12px;padding:4px 5px;text-align:right;border:0.5px solid #85B7EB;border-radius:5px;background:var(--bg-card);color:var(--text)" /></td>';
    h += '<td style="padding:7px 3px" id="stz-mo-pr-' + i + '"></td>';
    h += '<td style="padding:7px 3px;font-weight:500" id="stz-mo-n-' + i + '"></td>';
    h += '<td style="padding:7px 3px;color:var(--text-muted)" id="stz-mo-v-' + i + '"></td>';
    h += '</tr>';
  });
  h += '</tbody></table>';
  h += '<div style="font-size:10px;color:var(--text-muted);margin-top:5px">La proposta di ogni riga tiene fermo il margine degli altri prodotti</div>';

  h += '<div id="stz-mo-res" style="border-radius:8px;padding:10px 12px;margin-top:10px;display:flex;justify-content:space-between;align-items:flex-end"></div>';
  h += '<div id="stz-mo-err" style="font-size:12px;color:#A32D2D;margin-top:6px"></div>';

  h += '<div id="stz-mo-nota" style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-top:12px;font-size:11px;color:var(--text-muted)">Calcolo litri venduti in corso…</div>';

  h += '<div style="background:var(--bg);border-radius:8px;padding:10px 12px;margin-top:12px">';
  h += '<div style="font-size:11px;color:var(--text-muted);margin-bottom:6px">COMUNICAZIONE A ROCCO — ATTIVI DAL</div>';
  h += '<div style="display:flex;gap:8px">';
  h += '<input type="date" id="stz-mo-data" style="flex:1;font-family:var(--font-mono);font-size:12px;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text)" />';
  h += '<input type="time" id="stz-mo-ora" value="12:00" style="width:110px;font-family:var(--font-mono);font-size:12px;padding:6px 8px;border:0.5px solid var(--border);border-radius:6px;background:var(--bg-card);color:var(--text)" />';
  h += '</div></div>';

  h += '<div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">';
  h += '<button class="btn-secondary" onclick="_stzTornaCalcolo()">← Torna al calcolo</button>';
  h += '<button class="btn-secondary" onclick="_stzSalvaObiettivo()">💾 Salva obiettivo</button>';
  h += '<button class="btn-primary" onclick="_stzStampaPrezzi()">📄 Genera PDF prezzi</button>';
  h += '</div>';
  h += '</div>';

  h += '</div>';
  return h;
}

// ── SCHERMATA A ──────────────────────────────────────────────────

function _stzCmpSim(p) {
  var lt = p.lp + p.le;
  return lt > 0 ? (p.lp * p.cmp0 + p.le * p.ce) / lt : p.cmp0;
}

function _stzMostraA() {
  var p = _stzP[_stzCorrente];
  _stzSet('stz-sub', esc(p.nome) + ' · Stazione Oppido');
  document.getElementById('stz-lp').value = p.lp;
  document.getElementById('stz-le').value = p.le;
  document.getElementById('stz-ce').value = p.ce ? p.ce.toFixed(6) : '';
  document.getElementById('stz-mg').value = p.mg;
  _stzSet('stz-lp0', _stzNum(p.lp0, 0));
  _stzSet('stz-cmp0', _stzNum(p.cmp0, 6));
  _stzSet('stz-mgs', p.mgCercata != null ? 'da listino ' + _stzNum(p.mgCercata, 3) : 'nessuna marginalità cercata a listino');
  var nomi = Object.keys(_stzP);
  nomi.forEach(function (n, i) {
    var b = document.getElementById('stz-tab-' + i);
    if (!b) return;
    var att = (n === _stzCorrente);
    b.style.background = att ? '#E6F1FB' : 'none';
    b.style.borderColor = att ? '#378ADD' : 'var(--border)';
    b.style.color = att ? '#0C447C' : 'var(--text)';
  });
  _stzCalcA();
}

function _stzCambiaProdotto(nome) {
  if (!_stzP[nome]) return;
  _stzCorrente = nome;
  _stzMostraA();
}
window._stzCambiaProdotto = _stzCambiaProdotto;

function _stzRipristinaLitri() {
  var p = _stzP[_stzCorrente];
  document.getElementById('stz-lp').value = p.lp0;
  _stzCalcA();
}
window._stzRipristinaLitri = _stzRipristinaLitri;

function _stzCalcA() {
  var p = _stzP[_stzCorrente];
  _stzSet('stz-err', '');
  var lp = _stzVal('stz-lp'), le = _stzVal('stz-le'), ce = _stzVal('stz-ce'), mg = _stzVal('stz-mg');
  if (!isFinite(lp) || lp < 0) { _stzSet('stz-err', 'Inserisci i litri presenti'); return; }
  if (!isFinite(le) || le < 0) { _stzSet('stz-err', 'Inserisci i litri in arrivo (0 se nessuno)'); return; }
  if (!isFinite(ce) || ce < 0) { _stzSet('stz-err', 'Inserisci il costo del carico'); return; }
  if (!isFinite(mg)) mg = 0;
  p.lp = lp; p.le = le; p.ce = ce; p.mg = mg;

  var vp = lp * p.cmp0, ve = le * ce, lt = lp + le, vt = vp + ve, c = _stzCmpSim(p);
  _stzSet('stz-vp', _stzNum(vp, 2));
  _stzSet('stz-ve', _stzNum(ve, 2));
  _stzSet('stz-lt', _stzNum(lt, 0) + ' L');
  _stzSet('stz-vt', '€ ' + _stzNum(vt, 2));
  _stzSet('stz-cmp', _stzNum(c, 6));
  _stzSet('stz-fx', '€ ' + _stzNum(vt, 2) + ' / ' + _stzNum(lt, 0) + ' L');
  var d = c - p.cmp0;
  _stzSet('stz-dl', (d >= 0 ? '+' : '−') + ' € ' + _stzNum(Math.abs(d), 6) + ' vs CMP attuale');

  if (p.mgApplicata != null) {
    _stzSet('stz-p1', _stzNum(c + p.mgApplicata, 4));
    _stzSet('stz-i1', _stzNum((c + p.mgApplicata) * _STZ_IVA, 4));
    var rif = p.prezzoRif
      ? 'applicata ' + _stzNum(p.mgApplicata, 4) + ' €/L · da prezzo pompa € ' + _stzNum(Number(p.prezzoRif.prezzo_litro), 4) + ' del ' + _stzDataIt(p.prezzoRif.data)
      : 'applicata ' + _stzNum(p.mgApplicata, 4) + ' €/L';
    _stzSet('stz-mu', rif);
  } else {
    _stzSet('stz-p1', '—');
    _stzSet('stz-i1', '—');
    _stzSet('stz-mu', 'nessun prezzo pompa salvato: marginalità applicata non calcolabile');
  }
  _stzSet('stz-p2', _stzNum(c + mg, 4));
  _stzSet('stz-i2', _stzNum((c + mg) * _STZ_IVA, 4));
}
window._stzCalcA = _stzCalcA;

// ── SCHERMATA B ──────────────────────────────────────────────────

function _stzVaiObiettivo() {
  document.getElementById('stz-mo-target').value = _stzObiettivo.margine;
  _stzSet('stz-mo-vigenza', _stzObiettivo.data
    ? 'obiettivo in vigore dal ' + _stzDataIt(_stzObiettivo.data)
    : 'nessun obiettivo salvato: valore di partenza');
  var domani = new Date(); domani.setDate(domani.getDate() + 1);
  document.getElementById('stz-mo-data').value = _stzISO(domani);
  Object.keys(_stzP).forEach(function (n, i) {
    document.getElementById('stz-mo-inc-' + i).value = _stzP[n].inc;
    document.getElementById('stz-mo-mg-' + i).value = _stzP[n].mg;
  });
  document.getElementById('stz-sa').style.display = 'none';
  document.getElementById('stz-sb').style.display = 'block';
  _stzCalcB();
  _stzRendNota();
}
window._stzVaiObiettivo = _stzVaiObiettivo;

function _stzTornaCalcolo() {
  document.getElementById('stz-sb').style.display = 'none';
  document.getElementById('stz-sa').style.display = 'block';
  _stzMostraA();
}
window._stzTornaCalcolo = _stzTornaCalcolo;

function _stzCalcB() {
  var nomi = Object.keys(_stzP);
  _stzSet('stz-mo-err', '');
  var target = _stzVal('stz-mo-target');
  if (!isFinite(target)) target = 0;

  var incTot = 0, sommaPesata = 0, valido = true;
  nomi.forEach(function (n, i) {
    var inc = _stzVal('stz-mo-inc-' + i);
    var mg = _stzVal('stz-mo-mg-' + i);
    if (!isFinite(inc) || inc < 0) { valido = false; return; }
    if (!isFinite(mg)) { valido = false; return; }
    _stzP[n].inc = inc;
    _stzP[n].mg = mg;
    incTot += inc;
    sommaPesata += mg * inc;
  });
  if (!valido) { _stzSet('stz-mo-err', 'Incidenze e margini devono essere numeri validi'); return; }

  nomi.forEach(function (n, i) {
    var p = _stzP[n];
    var c = _stzCmpSim(p);
    p.cmpSim = c;
    p.netto = c + p.mg;
    p.lordo = p.netto * _STZ_IVA;
    _stzSet('stz-mo-c-' + i, _stzNum(c, 4));
    _stzSet('stz-mo-n-' + i, _stzNum(p.netto, 4));
    _stzSet('stz-mo-v-' + i, _stzNum(p.lordo, 4));
  });

  // Proposta per riga: tiene fermi gli altri margini.
  nomi.forEach(function (n, i) {
    var p = _stzP[n];
    var altri = 0;
    nomi.forEach(function (m) { if (m !== n) altri += _stzP[m].mg * _stzP[m].inc; });
    var prop = p.inc > 0 ? (target * incTot - altri) / p.inc : NaN;
    var cella = document.getElementById('stz-mo-pr-' + i);
    if (!cella) return;
    if (!isFinite(prop)) { cella.innerHTML = '<span style="font-size:10px;color:var(--text-muted)">—</span>'; return; }
    if (Math.abs(prop - p.mg) < 0.0005) {
      cella.innerHTML = '<span style="font-size:10px;color:#3B6D11">✓ ok</span>';
      return;
    }
    cella.innerHTML = '<button onclick="_stzApplicaProposta(' + i + ',' + prop.toFixed(6) + ')" style="width:100%;padding:3px 4px;font-size:11px;font-family:var(--font-mono);border:0.5px solid var(--border);border-radius:5px;background:none;cursor:pointer;color:var(--text)" title="Applica questa proposta">' + _stzNum(prop, 3) + '</button>';
  });

  var media = incTot > 0 ? sommaPesata / incTot : 0;
  var sopra = media >= target;
  var col = sopra ? '#3B6D11' : '#A32D2D';
  var bg = sopra ? '#EAF3DE' : '#FCEBEB';
  var res = document.getElementById('stz-mo-res');
  if (!res) return;
  res.style.background = bg;
  var dettaglio = nomi.map(function (n) {
    return _stzNum(_stzP[n].inc * 10, 0) + ' × ' + _stzNum(_stzP[n].mg, 3);
  }).join(' + ');
  var h = '<div><div style="font-size:11px;color:' + col + '">MARGINE MEDIO PONDERATO</div>';
  h += '<div style="font-size:10px;color:' + col + ';font-family:var(--font-mono);margin-top:3px">su ' + _stzNum(incTot * 10, 0) + ' L: ' + dettaglio + ' = € ' + _stzNum(sommaPesata * 10, 2) + '</div>';
  h += '<div style="font-size:10px;color:' + col + ';font-family:var(--font-mono);margin-top:3px">' + (sopra ? 'sopra' : 'sotto') + ' obiettivo ' + _stzNum(target, 3) + ' di € ' + _stzNum(Math.abs(media - target), 4);
  if (Math.round(incTot) !== 100) h += ' · incidenze ' + _stzNum(incTot, 0) + '%, media calcolata su questo totale';
  h += '</div></div>';
  h += '<div style="font-family:var(--font-mono);font-size:19px;color:' + col + '">€ ' + _stzNum(media, 4) + '</div>';
  res.innerHTML = h;
}
window._stzCalcB = _stzCalcB;

function _stzApplicaProposta(i, val) {
  var el = document.getElementById('stz-mo-mg-' + i);
  if (!el) return;
  el.value = Number(val).toFixed(3);
  _stzCalcB();
}
window._stzApplicaProposta = _stzApplicaProposta;

// ── NOTA LITRI VENDUTI ───────────────────────────────────────────

function _stzRendNota() {
  var box = document.getElementById('stz-mo-nota');
  if (!box) return;
  if (!_stzVendite) { box.innerHTML = 'Litri venduti non disponibili: le incidenze restano quelle impostate.'; return; }
  var v = _stzVendite;
  var nomi = Object.keys(_stzP);

  function riga(dati, dal, al, etichetta) {
    var tot = 0;
    nomi.forEach(function (n) { tot += Number(dati[n] || 0); });
    var h = '<div style="margin-bottom:6px"><strong style="color:var(--text)">' + etichetta + '</strong> · ' + _stzDataIt(dal) + ' → ' + _stzDataIt(al) + '</div>';
    if (tot <= 0) return h + '<div style="margin-bottom:8px">nessuna lettura nel periodo</div>';
    h += '<div style="font-family:var(--font-mono);margin-bottom:8px">totale ' + _stzNum(tot, 0) + ' L';
    nomi.forEach(function (n) {
      var l = Number(dati[n] || 0);
      h += ' · ' + esc(n) + ' ' + _stzNum(l, 0) + ' L (' + _stzNum(l / tot * 100, 1) + '%)';
    });
    h += '</div>';
    return h;
  }

  var h = riga(v.rec, v.dal, v.al, 'Ultimi 3 mesi');
  h += riga(v.prec, v.dalPrec, v.alPrec, 'Stessi 3 mesi anno precedente');
  h += '<div style="font-size:10px">Se il mix si muove in ENTRAMBI i periodi e\' un cambio strutturale e vale ritoccare le incidenze. Se si muove solo in quello recente e\' stagionalita\': lascia stare.</div>';
  box.innerHTML = h;
}

// ── PDF PER ROCCO ────────────────────────────────────────────────

function _stzStampaPrezzi() {
  var nomi = Object.keys(_stzP);
  var pronti = nomi.filter(function (n) { return _stzP[n].netto != null && isFinite(_stzP[n].netto); });
  if (!pronti.length) { toast('Calcola prima i prezzi'); return; }

  var dataAtt = document.getElementById('stz-mo-data').value;
  var oraAtt = document.getElementById('stz-mo-ora').value || '12:00';
  if (!dataAtt) { toast('Indica da quando valgono i prezzi'); return; }

  var MESI = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
  var dd = new Date(dataAtt + 'T12:00:00');
  var dataLunga = dd.getDate() + ' ' + MESI[dd.getMonth()] + ' ' + dd.getFullYear();
  var adesso = new Date();
  var emesso = _stzDataIt(_stzISO(adesso)) + ' alle ' + String(adesso.getHours()).padStart(2, '0') + ':' + String(adesso.getMinutes()).padStart(2, '0');

  var w = window.open('', '_blank');
  if (!w) { toast('Il browser ha bloccato la finestra di stampa'); return; }

  var html = '<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Prezzi colonnina ' + _stzDataIt(dataAtt) + '</title><style>';
  html += 'body{font-family:Arial,Helvetica,sans-serif;color:#1E1E1C;margin:26px 30px}';
  html += '.hdr{display:flex;justify-content:space-between;align-items:flex-start;border-bottom:1px solid #888780;padding-bottom:10px}';
  html += '.rag{font-size:18px;font-weight:bold;border-left:5px solid #D9DE0D;padding-left:10px}';
  html += '.sub{font-size:10px;color:#5F5E5A;padding-left:15px;margin-top:3px}';
  html += '.meta{font-size:10px;color:#5F5E5A;text-align:right}';
  html += 'h1{font-size:16px;margin:18px 0 0}';
  html += '.avviso{background:#FAEEDA;color:#854F0B;padding:11px 14px;margin:14px 0 20px;border-radius:4px}';
  html += '.avviso b{font-size:14px}.avviso div{font-size:10px;margin-top:4px}';
  html += 'table{width:100%;border-collapse:collapse;margin-top:6px}';
  html += 'th{font-size:9px;color:#1E1E1C;text-align:right;border-bottom:1.5px solid #1E1E1C;padding:5px 4px;letter-spacing:0.3px}';
  html += 'th.l{text-align:left}';
  html += 'td{padding:15px 4px;border-bottom:1px solid #D3D1C7;text-align:right;font-family:"Courier New",monospace}';
  html += 'td.nome{text-align:left;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;border-left:4px solid #D9DE0D;padding-left:10px}';
  html += 'td.netto{font-size:13px;color:#5F5E5A}td.lordo{font-size:21px;font-weight:bold}';
  html += '.pie{font-size:9px;color:#5F5E5A;margin-top:22px}';
  html += '.firme{display:flex;justify-content:space-between;margin-top:48px;font-size:9px;color:#5F5E5A}';
  html += '.firma{width:42%;border-top:1px solid #888780;padding-top:4px}';
  html += '@media print{.no-print{display:none}}';
  html += '</style></head><body>';

  html += '<div class="hdr"><div><div class="rag">PHOENIX FUEL S.R.L.</div>';
  html += '<div class="sub">Porto Salvo Zona Industriale SNC · 89900 Vibo Valentia · P.IVA IT02744150802</div></div>';
  html += '<div class="meta">Comunicazione prezzi<br/>Emessa il ' + emesso + '</div></div>';

  html += '<h1>Prezzi al pubblico — Stazione di servizio Oppido</h1>';
  html += '<div class="avviso"><b>Da inserire alla colonnina: ' + dataLunga + ' — ore ' + oraAtt + '</b>';
  html += '<div>Non modificare i prezzi prima dell\'orario indicato.</div></div>';

  html += '<table><thead><tr><th class="l">PRODOTTO</th><th>PREZZO NETTO &euro;/L</th><th>PREZZO AL PUBBLICO IVA INC. &euro;/L</th></tr></thead><tbody>';
  pronti.forEach(function (n) {
    var p = _stzP[n];
    html += '<tr><td class="nome">' + esc(n) + '</td>';
    html += '<td class="netto">' + _stzNum(p.netto, 4) + '</td>';
    html += '<td class="lordo">' + _stzNum(p.lordo, 4) + '</td></tr>';
  });
  html += '</tbody></table>';

  html += '<div class="pie">IVA applicata 22%. Prezzi validi fino a nuova comunicazione.</div>';
  html += '<div class="firme"><div class="firma">Trasmesso da</div><div class="firma">Ricevuto da (Rocco) — data e ora</div></div>';

  html += '<div class="no-print" style="position:fixed;bottom:20px;right:20px;display:flex;gap:8px">';
  html += '<button onclick="window.print()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#6B5FCC;color:#fff">🖨️ Stampa / PDF</button>';
  html += '<button onclick="window.close()" style="border:none;padding:10px 18px;border-radius:8px;font-size:13px;cursor:pointer;font-weight:bold;background:#E24B4A;color:#fff">✕ Chiudi</button>';
  html += '</div></body></html>';

  w.document.open();
  w.document.write(html);
  w.document.close();
}
window._stzStampaPrezzi = _stzStampaPrezzi;
window._stzSalvaObiettivo = _stzSalvaObiettivo;
