const titles = {
  dashboard: 'Dashboard',
  ordini: 'Ordini',
  prezzi: 'Prezzi giornalieri',
  giacenze: 'Giacenze cisterne',
  consegne: 'Consegne',
  vendite: 'Vendite'
};

function setSection(id, el) {
  document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  document.getElementById('s-' + id).classList.add('active');
  el.classList.add('active');
  document.getElementById('page-title').textContent = titles[id];
}

// Data corrente in italiano
const giorni = ['domenica','lunedì','martedì','mercoledì','giovedì','venerdì','sabato'];
const mesi = ['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'];
const oggi = new Date();
document.getElementById('topbar-date').textContent =
  giorni[oggi.getDay()] + ' ' + oggi.getDate() + ' ' + mesi[oggi.getMonth()] + ' ' + oggi.getFullYear();
