// ═══════════════════════════════════════════════════════════════════════════
// pf-fido-alert.js — AVVISO FUORI FIDO FORNITORE
// v20260922b — il pulsante "Apri estratto conto" cambia davvero sezione (setSection)
//               e poi apre la scheda del fornitore
// v20260922a — 22/09/2026
//
// REGOLA (Rinaldo): il fornitore ci lascia emettere un ordine anche oltre il
// fido, ma il giorno dopo ENTRO LE 12 va fatto il bonifico che riporta
// l'esposizione dentro il fido. Quindi:
//   · l'avviso compare quando si salva un ordine che manda il fornitore fuori
//     fido E all'apertura del programma, per ogni fornitore ancora fuori;
//   · dice quanto bonificare per rientrare e la prossima fattura in scadenza
//     (sara' poi una scelta: acconto del minimo o pagamento pieno, che crea
//     disponibilita' per un nuovo ordine);
//   · cliccando "Ho capito" torna dopo 12 ORE se il fornitore e' ancora fuori,
//     e SUBITO se nel frattempo lo sforamento e' peggiorato;
//   · lo vede chiunque abbia accesso alla sezione Fornitori (la lettura e'
//     per utente: se lo chiude Adele, Simone lo vede lo stesso).
//
// NESSUN CALCOLO NUOVO: fido, esposizione e prossima scadenza arrivano da
// pfDebitoCards (query madre del debito fornitori).
// Tabella di servizio: fido_alert_letture (utente_email, fornitore_id,
// visto_il, sforamento).
// ═══════════════════════════════════════════════════════════════════════════

var _FIDO_ALERT_ORE = 12;          // ogni quante ore ripresentare l'avviso
var _fidoAlertInCorso = false;     // evita sovrapposizioni
var _fidoAlertCoda = [];           // fornitori da mostrare uno dopo l'altro
var _fidoAlertTimer = null;

function _fidoAlertEuro(v) {
  return '€ ' + Number(v || 0).toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function _fidoAlertData(iso) {
  if (!iso) return '—';
  var s = String(iso).slice(0, 10).split('-');
  return s.length === 3 ? s[2] + '/' + s[1] + '/' + s[0] : String(iso);
}
function _fidoAlertEsc(s) {
  return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
function _fidoAlertEmail() {
  return (typeof utenteCorrente !== 'undefined' && utenteCorrente && utenteCorrente.email) ? utenteCorrente.email : null;
}
// Lo vede chi ha accesso ai fornitori (gli admin sempre).
function _fidoAlertAbilitato() {
  if (typeof utenteCorrente === 'undefined' || !utenteCorrente) return false;
  if (utenteCorrente.ruolo === 'admin') return true;
  return (typeof _haPermesso === 'function') ? !!_haPermesso('fornitori') : false;
}

// ── Controllo: quali fornitori sono fuori fido e vanno mostrati ─────────────
// fornitoreNome: se passato (salvataggio ordine) si guarda solo quello.
async function pfFidoAlertControlla(fornitoreNome) {
  try {
    if (!_fidoAlertAbilitato()) return;
    if (typeof pfDebitoCards !== 'function') return;
    var email = _fidoAlertEmail();
    if (!email) return;

    var cards = await pfDebitoCards(null, true);   // force: l'ordine appena salvato deve contare
    var fuori = (cards || []).filter(function (c) { return c.fido > 0 && c.esp > c.fido + 0.005; });
    if (fornitoreNome) {
      var k = String(fornitoreNome).toLowerCase().trim();
      fuori = fuori.filter(function (c) { return String(c.nome).toLowerCase().trim() === k; });
    }
    if (!fuori.length) {
      // rientrati: si puliscono le letture cosi' il prossimo sforamento riparte pulito
      if (!fornitoreNome) await _fidoAlertPulisci(cards, email);
      return;
    }

    var ids = fuori.map(function (c) { return c.id; }).filter(Boolean);
    var lett = {};
    if (ids.length) {
      var res = await sb.from('fido_alert_letture').select('fornitore_id,visto_il,sforamento')
        .eq('utente_email', email).in('fornitore_id', ids);
      (res.data || []).forEach(function (r) { lett[r.fornitore_id] = r; });
    }

    var ora = Date.now(), soglia = _FIDO_ALERT_ORE * 3600 * 1000;
    var daMostrare = fuori.filter(function (c) {
      var l = lett[c.id];
      if (!l) return true;                                        // mai visto
      var sfor = Math.round((c.esp - c.fido) * 100) / 100;
      if (Number(l.sforamento || 0) + 0.005 < sfor) return true;   // peggiorato: subito
      return (ora - new Date(l.visto_il).getTime()) >= soglia;      // passate 12 ore
    });
    if (!daMostrare.length) return;

    daMostrare.sort(function (a, b) { return (b.esp - b.fido) - (a.esp - a.fido); });
    _fidoAlertCoda = daMostrare;
    _fidoAlertMostraProssimo();
  } catch (e) {
    console.warn('[fido-alert] controllo non riuscito:', e && e.message);
  }
}

// Toglie le letture dei fornitori tornati dentro il fido.
async function _fidoAlertPulisci(cards, email) {
  try {
    var dentro = (cards || []).filter(function (c) { return c.id && c.esp <= c.fido + 0.005; })
                              .map(function (c) { return c.id; });
    if (!dentro.length) return;
    await sb.from('fido_alert_letture').delete().eq('utente_email', email).in('fornitore_id', dentro);
  } catch (e) { /* pulizia non critica */ }
}

function _fidoAlertMostraProssimo() {
  if (_fidoAlertInCorso) return;
  var c = _fidoAlertCoda.shift();
  if (!c) return;
  _fidoAlertInCorso = true;
  _fidoAlertPopup(c);
}

// ── Il popup ───────────────────────────────────────────────────────────────
// Overlay proprio (non apriModal): puo' aprirsi sopra altri modali e non si
// chiude cliccando fuori.
function _fidoAlertPopup(c, giorniFuori) {
  var vecchio = document.getElementById('fido-alert-ov');
  if (vecchio) vecchio.remove();

  var sfor = Math.round((c.esp - c.fido) * 100) / 100;
  var pct = c.fido > 0 ? (c.esp / c.fido * 100) : 0;
  var quotaDentro = Math.max(0, Math.min(100, (c.fido / c.esp) * 100));
  var quotaFuori = Math.max(0, 100 - quotaDentro);

  var domani = new Date(); domani.setDate(domani.getDate() + 1);
  var scadBonifico = _fidoAlertData(domani.toISOString().slice(0, 10));

  var riga = function (lab, val, col, grande) {
    return '<tr><td style="padding:5px 0;color:var(--text-muted)">' + lab + '</td>'
      + '<td style="padding:5px 0;text-align:right;font-family:var(--font-mono)'
      + (col ? ';color:' + col : '') + (grande ? ';font-weight:700;font-size:15px' : '') + '">' + val + '</td></tr>';
  };

  var h = '<div id="fido-alert-ov" style="position:fixed;inset:0;background:rgba(0,0,0,0.55);z-index:100001;display:flex;align-items:center;justify-content:center;padding:16px">'
    + '<div style="max-width:560px;width:100%;max-height:92vh;overflow-y:auto;background:var(--bg-card,var(--bg));border:2px solid #A32D2D;border-radius:12px;overflow-x:hidden">'
    + '<div style="background:#A32D2D;color:#fff;padding:12px 16px;display:flex;align-items:center;gap:10px">'
      + '<span style="font-size:20px">⚠</span>'
      + '<div><div style="font-weight:700;font-size:15px">Fuori fido — ' + _fidoAlertEsc(c.nome) + '</div>'
      + '<div style="font-size:11px;opacity:.92">' + (c.nAperti || 0) + ' document' + ((c.nAperti === 1) ? 'o' : 'i') + ' aperti · esposizione al '
      + _fidoAlertData(new Date().toISOString().slice(0, 10)) + '</div></div></div>'
    + '<div style="padding:14px 16px">'
    + '<table style="width:100%;font-size:13px;border-collapse:collapse">'
      + riga('Fido concesso', _fidoAlertEuro(c.fido))
      + riga('Esposizione attuale', _fidoAlertEuro(c.esp), '#A32D2D')
      + '<tr><td colspan="2" style="border-top:1px solid var(--border);padding-top:4px"></td></tr>'
      + riga('Oltre il fido', _fidoAlertEuro(sfor), '#A32D2D', true)
    + '</table>'
    + '<div style="margin-top:10px;height:14px;border-radius:7px;background:var(--bg);overflow:hidden;display:flex;border:0.5px solid var(--border)">'
      + '<div style="width:' + quotaDentro.toFixed(1) + '%;background:#BA7517"></div>'
      + '<div style="width:' + quotaFuori.toFixed(1) + '%;background:#A32D2D"></div></div>'
    + '<div style="font-size:10.5px;color:var(--text-muted);margin-top:4px">' + Math.round(pct) + '% del fido · in rosso la parte eccedente</div>'

    + '<div style="margin-top:14px;background:#FCEBEB;border-left:4px solid #A32D2D;border-radius:0 8px 8px 0;padding:12px 14px">'
      + '<div style="font-size:11px;color:#791F1F;text-transform:uppercase;letter-spacing:.3px">Bonifico da eseguire per rientrare nel fido</div>'
      + '<div style="font-size:26px;font-weight:700;font-family:var(--font-mono);color:#A32D2D;margin:2px 0 4px">' + _fidoAlertEuro(sfor) + '</div>'
      + '<div style="font-size:12px;color:#501313">Entro <strong>domani ' + scadBonifico + ' alle 12:00</strong></div>'
    + '</div>'

    + (c.prossima
        ? '<div style="margin-top:10px;font-size:11.5px;color:var(--text-muted);line-height:1.6">Prossima scadenza ' + _fidoAlertEsc(c.nome) + ': <strong style="color:var(--text)">'
          + _fidoAlertData(c.prossima) + ' · ' + _fidoAlertEuro(c.prossimaImporto) + '</strong>'
          + (Number(c.prossimaImporto) >= sfor
              ? ' — pagandola per intero si rientra e si libera ' + _fidoAlertEuro(Number(c.prossimaImporto) - sfor) + ' per nuovi ordini.'
              : ' — da sola non basta a rientrare.') + '</div>'
        : '')
    + '<div style="margin-top:8px;font-size:11px;color:var(--text-muted)">Questo avviso ricompare ogni ' + _FIDO_ALERT_ORE + ' ore finché l\'esposizione non torna sotto il fido.</div>'

    + '<div style="display:flex;gap:8px;justify-content:flex-end;margin-top:16px;flex-wrap:wrap">'
      + '<button onclick="fidoAlertHoCapito(\'' + c.id + '\',' + sfor + ')" style="padding:9px 14px;border:0.5px solid var(--border);border-radius:8px;background:var(--bg);color:var(--text);cursor:pointer;font-size:12.5px">Ho capito</button>'
      + '<button onclick="fidoAlertApriEstratto(\'' + _fidoAlertEsc(c.nome).replace(/'/g, "\\'") + '\',\'' + c.id + '\',' + sfor + ')" style="padding:9px 14px;border:0.5px solid #185FA5;border-radius:8px;background:var(--bg);color:#185FA5;cursor:pointer;font-size:12.5px;font-weight:600">Apri estratto conto</button>'
      + '<button onclick="fidoAlertRegistraBonifico(\'' + c.id + '\',' + sfor + ')" class="btn-primary" style="padding:9px 16px;font-size:12.5px">Registra il bonifico</button>'
    + '</div></div></div></div>';

  var box = document.createElement('div');
  box.innerHTML = h;
  document.body.appendChild(box.firstChild);
}

function _fidoAlertChiudi() {
  var ov = document.getElementById('fido-alert-ov');
  if (ov) ov.remove();
  _fidoAlertInCorso = false;
  setTimeout(_fidoAlertMostraProssimo, 250);   // se ce n'e' un altro in coda
}

// "Ho capito": segna la lettura per QUESTO utente, così torna fra 12 ore.
async function fidoAlertHoCapito(fornitoreId, sforamento) {
  var email = _fidoAlertEmail();
  if (email && fornitoreId) {
    try {
      await sb.from('fido_alert_letture').upsert({
        utente_email: email, fornitore_id: fornitoreId,
        visto_il: new Date().toISOString(), sforamento: Number(sforamento || 0)
      }, { onConflict: 'utente_email,fornitore_id' });
    } catch (e) { console.warn('[fido-alert] lettura non salvata:', e && e.message); }
  }
  _fidoAlertChiudi();
}

// Porta all'estratto conto del fornitore: prima si va nella SEZIONE Fornitori
// (setSection, la stessa del menu, che carica la pagina e ne segna la voce),
// poi si apre la scheda del fornitore. Senza il cambio sezione il popup si
// chiudeva e basta, perche' ecfVaiFornitore lavora dentro una pagina gia'
// aperta.
async function fidoAlertApriEstratto(nome, fornitoreId, sforamento) {
  await fidoAlertHoCapito(fornitoreId, sforamento);
  try {
    if (typeof setSection === 'function') {
      var voce = null;
      document.querySelectorAll('.nav-item').forEach(function (n) {
        if (!voce && n.textContent && n.textContent.toLowerCase().indexOf('fornitori') >= 0) voce = n;
      });
      setSection('fornitori', voce);
    }
  } catch (e) { console.warn('[fido-alert] cambio sezione:', e && e.message); }
  // la pagina Fornitori deve finire di caricarsi prima di aprire la scheda
  setTimeout(function () {
    if (typeof ecfVaiFornitore === 'function') { try { ecfVaiFornitore(nome); return; } catch (e) {} }
    if (typeof ecfApriFornitore === 'function') { try { ecfApriFornitore(nome); return; } catch (e) {} }
    if (typeof toast === 'function') toast('Apri l\'estratto conto di ' + nome);
  }, 900);
}

// Apre la registrazione dell'uscita in foglio giornale con la data di domani.
async function fidoAlertRegistraBonifico(fornitoreId, sforamento) {
  await fidoAlertHoCapito(fornitoreId, sforamento);
  var domani = new Date(); domani.setDate(domani.getDate() + 1);
  var iso = domani.toISOString().slice(0, 10);
  if (typeof fgApriModaleUscita === 'function') { try { fgApriModaleUscita(iso); return; } catch (e) {} }
  if (typeof toast === 'function') toast('Registra l\'uscita da Finanze → Foglio giornale');
}

// ── Avvio: al caricamento del programma e poi ogni 12 ore ──────────────────
(function _fidoAlertBootstrap() {
  var tentativi = 0;
  var attendi = setInterval(function () {
    tentativi++;
    if (tentativi > 60) { clearInterval(attendi); return; }              // 60 × 2s = 2 minuti
    if (typeof utenteCorrente === 'undefined' || !utenteCorrente) return; // non ancora loggato
    if (typeof pfDebitoCards !== 'function') return;
    clearInterval(attendi);
    setTimeout(function () { pfFidoAlertControlla(); }, 4000);           // lascia finire i caricamenti
    if (_fidoAlertTimer) clearInterval(_fidoAlertTimer);
    _fidoAlertTimer = setInterval(function () { pfFidoAlertControlla(); }, 30 * 60 * 1000);
  }, 2000);
})();
