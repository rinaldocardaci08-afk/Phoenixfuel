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
const dataStr = giorni[oggi.getDay()] + ' ' + oggi.getDate() + ' ' + mesi[oggi.getMonth()] + ' ' + oggi.getFullYear();
document.getElementById('topbar-date').textContent = dataStr;
const dp = document.getElementById('data-prezzi');
if (dp) dp.textContent = oggi.getDate() + '/' + String(oggi.getMonth()+1).padStart(2,'0') + '/' + oggi.getFullYear();

// FORM PREZZI
function calcolaPrezzo() {
  const costo = parseFloat(document.getElementById('f-costo').value) || 0;
  const trasporto = parseFloat(document.getElementById('f-trasporto').value) || 0;
  const margine = parseFloat(document.getElementById('f-margine').value) || 0;
  const iva = parseFloat(document.getElementById('f-iva').value) || 0.22;
  if (costo > 0) {
    const netto = costo + trasporto + margine;
    const lordo = netto * (1 + iva);
    document.getElementById('prev-esc').textContent = '€' + netto.toFixed(3).replace('.',',');
    document.getElementById('prev-inc').textContent = '€' + lordo.toFixed(3).replace('.',',');
    document.getElementById('form-preview').style.display = 'flex';
  }
}

function resetForm() {
  ['f-fornitore','f-prodotto','f-costo','f-trasporto','f-margine'].forEach(id => {
    document.getElementById(id).value = '';
  });
  document.getElementById('f-iva').value = '0.22';
  document.getElementById('form-preview').style.display = 'none';
}

function aggiungiPrezzo() {
  const fornitore = document.getElementById('f-fornitore').value;
  const prodotto = document.getElementById('f-prodotto').value;
  const costo = parseFloat(document.getElementById('f-costo').value);
  const trasporto = parseFloat(document.getElementById('f-trasporto').value);
  const margine = parseFloat(document.getElementById('f-margine').value);
  const iva = parseFloat(document.getElementById('f-iva').value);

  if (!fornitore || !prodotto || !costo) {
    alert('Compila almeno Fornitore, Prodotto e Costo/L');
    return;
  }

  const netto = (costo + (trasporto||0) + (margine||0));
  const lordo = netto * (1 + iva);

  const tbody = document.getElementById('tabella-prezzi');
  const tr = document.createElement('tr');
  tr.innerHTML = `
    <td>${fornitore}</td>
    <td>${prodotto}</td>
    <td>€${costo.toFixed(3).replace('.',',')}</td>
    <td>€${(trasporto||0).toFixed(3).replace('.',',')}</td>
    <td>€${(margine||0).toFixed(3).replace('.',',')}</td>
    <td>€${netto.toFixed(3).replace('.',',')}</td>
    <td>€${lordo.toFixed(3).replace('.',',')}</td>
    <td></td>
    <td><button class="btn-del" onclick="eliminaRiga(this)">✕</button></td>
  `;
  tbody.appendChild(tr);
  aggiornaTagBest();
  resetForm();
}

function eliminaRiga(btn) {
  btn.closest('tr').remove();
  aggiornaTagBest();
}

function aggiornaTagBest() {
  const tbody = document.getElementById('tabella-prezzi');
  const righe = tbody.querySelectorAll('tr');
  const prodotti = {};
  righe.forEach(tr => {
    const tds = tr.querySelectorAll('td');
    if (tds.length < 7) return;
    const prod = tds[1].textContent;
    const prezzo = parseFloat(tds[5].textContent.replace('€','').replace(',','.'));
    if (!prodotti[prod] || prezzo < prodotti[prod].prezzo) {
      prodotti[prod] = { prezzo, tr };
    }
    tds[7].innerHTML = '';
  });
  Object.values(prodotti).forEach(p => {
    p.tr.querySelectorAll('td')[7].innerHTML = '<span class="badge green">Best</span>';
  });
}
