// PhoenixFuel — M3: Notifiche push alert

var _pushRegistrato = false;

async function inizializzaPush() {
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  if (Notification.permission === 'granted') {
    _pushRegistrato = true;
    _avviaPushPolling();
  }
}

async function richiediPermessoPush() {
  if (!('Notification' in window)) { toast('Notifiche non supportate su questo browser'); return; }
  var perm = await Notification.requestPermission();
  if (perm === 'granted') {
    _pushRegistrato = true;
    toast('Notifiche push attivate!');
    _avviaPushPolling();
    _inviaNotificaPush('PhoenixFuel', 'Notifiche attivate! Riceverai alert per fido, bacheca e mercato.');
  } else {
    toast('Permesso notifiche negato');
  }
  _aggiornaPushStato();
}

function _aggiornaPushStato() {
  var el = document.getElementById('push-stato'); if (!el) return;
  if (!('Notification' in window)) { el.innerHTML = '⚠️ Browser non supporta le notifiche'; el.style.color = '#BA7517'; return; }
  var p = Notification.permission;
  if (p === 'granted') { el.innerHTML = '✅ Notifiche attive — riceverai alert per fido, bacheca e futures'; el.style.color = '#639922'; }
  else if (p === 'denied') { el.innerHTML = '❌ Notifiche bloccate — sblocca dalle impostazioni browser'; el.style.color = '#E24B4A'; }
  else { el.innerHTML = '🔕 Clicca per attivare le notifiche push'; el.style.color = 'var(--text-muted)'; }
}

function _avviaPushPolling() {
  if (!_pushRegistrato) return;
  // Controlla nuovi avvisi ogni 2 minuti
  setInterval(_controllaAvvisiPush, 120000);
  // Prima esecuzione dopo 10 secondi
  setTimeout(_controllaAvvisiPush, 10000);
}

var _ultimoAvvisoId = null;

async function _controllaAvvisiPush() {
  if (!_pushRegistrato || Notification.permission !== 'granted') return;
  try {
    var { data: avvisi } = await sb.from('bacheca_avvisi').select('id,tipo,priorita,messaggio,created_at')
      .eq('letto', false).order('created_at', { ascending: false }).limit(5);
    if (!avvisi || !avvisi.length) return;

    // Mostra solo avvisi nuovi (non già notificati)
    avvisi.forEach(function(a) {
      if (_ultimoAvvisoId && a.id <= _ultimoAvvisoId) return;
      var icona = a.tipo === 'criticita' ? '🔴' : a.tipo === 'anomalia' ? '🟡' : a.tipo === 'sistema' ? '🔔' : '📋';
      var titolo = a.priorita === 'urgente' ? 'URGENTE — PhoenixFuel' : 'PhoenixFuel';
      _inviaNotificaPush(titolo, icona + ' ' + a.messaggio.substring(0, 120));
    });
    _ultimoAvvisoId = avvisi[0].id;
  } catch (e) { /* silenzioso */ }
}

function _inviaNotificaPush(titolo, corpo) {
  if (Notification.permission !== 'granted') return;
  try {
    var n = new Notification(titolo, {
      body: corpo,
      icon: 'logo192.png',
      badge: 'logo192.png',
      tag: 'pf-alert-' + Date.now(),
      requireInteraction: true,
      vibrate: [200, 100, 200]
    });
    n.onclick = function() {
      window.focus();
      setSection('bacheca');
      n.close();
    };
    // Auto-chiudi dopo 30 secondi
    setTimeout(function() { n.close(); }, 30000);
  } catch (e) { /* SW notification fallback */ }
}

// Notifica custom da codice (es. fido, futures)
function notificaPush(titolo, messaggio) {
  if (!_pushRegistrato) return;
  _inviaNotificaPush(titolo, messaggio);
}

// Inizializza all'avvio
document.addEventListener('DOMContentLoaded', function() {
  setTimeout(inizializzaPush, 3000);
  setTimeout(_aggiornaPushStato, 3500);
});
