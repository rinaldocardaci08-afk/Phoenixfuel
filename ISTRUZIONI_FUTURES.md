# Integrazione Futures ICE — PhoenixFuel

## 1. FILE NUOVO
Copia `pf-futures.js` nella cartella progetto.

## 2. SQL SUPABASE
Esegui `futures_storico.sql` nell'SQL Editor di Supabase.

## 3. MODIFICA index.html

### A) Aggiungi script PRIMA di </body>:
```html
<script src="pf-futures.js"></script>
```
(mettilo dopo pf-benchmark.js)

### B) Nel div della sezione benchmark, PRIMA del div principale del benchmark,
aggiungi i tab e il div futures. Trova `id="section-benchmark"` e aggiungi subito
dopo il titolo della sezione:

```html
<!-- Tab benchmark/futures -->
<div style="display:flex;gap:0;border-bottom:1px solid var(--border);margin-bottom:18px" id="benchmark-tabs">
  <button id="tab-benchmark-std"
    onclick="_switchBenchTab('std')"
    style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:600;color:var(--primary);border-bottom:2px solid var(--primary)">
    📈 Benchmark mercato
  </button>
  <button id="tab-futures"
    onclick="_switchBenchTab('futures')"
    style="padding:10px 20px;border:none;background:none;cursor:pointer;font-size:13px;font-weight:500;color:var(--text-muted);border-bottom:2px solid transparent">
    📡 Futures ICE
  </button>
</div>

<!-- Contenuto benchmark standard (quello già esistente, wrappato) -->
<div id="bench-std-wrap">
  <!-- QUI SPOSTA tutto l'HTML esistente della sezione benchmark -->
</div>

<!-- Contenuto futures -->
<div id="futures-wrap" style="display:none"></div>
```

### C) Aggiungi in pf-benchmark.js (in fondo al file):
```javascript
function _switchBenchTab(tab) {
  var isStd = tab === 'std';
  document.getElementById('bench-std-wrap').style.display = isStd ? '' : 'none';
  document.getElementById('futures-wrap').style.display   = isStd ? 'none' : '';
  document.getElementById('tab-benchmark-std').style.color       = isStd ? 'var(--primary)' : 'var(--text-muted)';
  document.getElementById('tab-benchmark-std').style.borderBottomColor = isStd ? 'var(--primary)' : 'transparent';
  document.getElementById('tab-benchmark-std').style.fontWeight  = isStd ? '600' : '500';
  document.getElementById('tab-futures').style.color             = isStd ? 'var(--text-muted)' : 'var(--primary)';
  document.getElementById('tab-futures').style.borderBottomColor = isStd ? 'transparent' : 'var(--primary)';
  document.getElementById('tab-futures').style.fontWeight        = isStd ? '500' : '600';
  if (!isStd) renderFutures();
}
```

## 4. MODIFICA pf-dashboard.js

### A) Nel div degli alert operativi del dashboard, DOPO #dash-alert-operativi,
aggiungi questo div:
```html
<div id="dash-alert-futures" style="display:none;margin-bottom:8px"></div>
```

Se l'HTML degli alert è generato in JS (dentro renderDashboard o _loadAlertOperativi),
aggiungi il div nel DOM generato così:

```javascript
// In renderDashboard(), dove costruisci l'HTML della dashboard, aggiungi:
'<div id="dash-alert-futures" style="display:none;margin-bottom:8px"></div>'
```

### B) Nella funzione renderDashboard() (o equivalente), aggiunge la chiamata:
```javascript
// Alla fine di renderDashboard, dopo gli altri alert:
caricaAlertFutures();
```

## 5. COMANDI CMD

```
copy C:\Users\rinal\OneDrive\Desktop\progetto\pf-futures.js C:\Users\rinal\OneDrive\Desktop\progetto\pf-futures.js
cd C:\Users\rinal\OneDrive\Desktop\progetto
git add pf-futures.js pf-benchmark.js pf-dashboard.js index.html
git commit -m "Futures ICE Gasoil: sezione benchmark + alert dashboard semaforo"
git push
```
