// PhoenixFuel — Home / Bacheca con Drag & Drop + Lavagna + Orologio

var _homeClockInterval = null;

function _initOrologioBacheca() {
  var marksG = document.getElementById('home-clock-marks');
  if (!marksG || marksG.childNodes.length > 0) return;
  for (var i = 0; i < 12; i++) {
    var ang = (i * 30 - 90) * Math.PI / 180;
    var r1 = i % 3 === 0 ? 60 : 64, r2 = 70;
    var line = document.createElementNS('http://www.w3.org/2000/svg','line');
    line.setAttribute('x1', 80 + r1 * Math.cos(ang)); line.setAttribute('y1', 80 + r1 * Math.sin(ang));
    line.setAttribute('x2', 80 + r2 * Math.cos(ang)); line.setAttribute('y2', 80 + r2 * Math.sin(ang));
    line.setAttribute('stroke', i % 3 === 0 ? '#0C447C' : '#B5D4F4');
    line.setAttribute('stroke-width', i % 3 === 0 ? '2.5' : '1');
    line.setAttribute('stroke-linecap', 'round');
    marksG.appendChild(line);
    if (i % 3 === 0) {
      var txt = document.createElementNS('http://www.w3.org/2000/svg','text');
      txt.setAttribute('x', 80 + 52 * Math.cos(ang)); txt.setAttribute('y', 80 + 52 * Math.sin(ang) + 4);
      txt.setAttribute('text-anchor','middle'); txt.setAttribute('fill','#0C447C');
      txt.setAttribute('font-size','12'); txt.setAttribute('font-weight','500');
      txt.textContent = [12,3,6,9][i/3];
      marksG.appendChild(txt);
    }
  }
  _tickOrologio();
  if (_homeClockInterval) clearInterval(_homeClockInterval);
  _homeClockInterval = setInterval(_tickOrologio, 1000);
}

function _tickOrologio() {
  var now = new Date();
  var h = now.getHours() % 12, m = now.getMinutes(), s = now.getSeconds();
  var hAng = (h * 30 + m * 0.5 - 90) * Math.PI / 180;
  var mAng = (m * 6 - 90) * Math.PI / 180;
  var sAng = (s * 6 - 90) * Math.PI / 180;
  var hH = document.getElementById('home-hour'), mH = document.getElementById('home-min'), sH = document.getElementById('home-sec');
  if (!hH) return;
  hH.setAttribute('x2', 80 + 32 * Math.cos(hAng)); hH.setAttribute('y2', 80 + 32 * Math.sin(hAng));
  mH.setAttribute('x2', 80 + 44 * Math.cos(mAng)); mH.setAttribute('y2', 80 + 44 * Math.sin(mAng));
  sH.setAttribute('x2', 80 + 50 * Math.cos(sAng)); sH.setAttribute('y2', 80 + 50 * Math.sin(sAng));
  var GIORNI = ['Domenica','Lunedì','Martedì','Mercoledì','Giovedì','Venerdì','Sabato'];
  var MESI = ['Gennaio','Febbraio','Marzo','Aprile','Maggio','Giugno','Luglio','Agosto','Settembre','Ottobre','Novembre','Dicembre'];
  var elG = document.getElementById('home-giorno'); if (elG) elG.textContent = GIORNI[now.getDay()];
  var elD = document.getElementById('home-data'); if (elD) elD.textContent = now.getDate() + ' ' + MESI[now.getMonth()] + ' ' + now.getFullYear();
  var elO = document.getElementById('home-ora'); if (elO) elO.textContent = String(now.getHours()).padStart(2,'0') + ':' + String(m).padStart(2,'0') + ':' + String(s).padStart(2,'0');
}

async function caricaHome() {
  _initOrologioBacheca();
  var container = document.getElementById('home-feed');
  if (!container) return;
  container.innerHTML = '<div class="loading">Caricamento bacheca...</div>';

  var { data: posts, error } = await sb.from('bacheca_post').select('*')
    .eq('attivo', true)
    .order('pinned', { ascending: false })
    .order('ordine', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { container.innerHTML = '<div class="loading">Errore: ' + error.message + '</div>'; return; }
  if (!posts || !posts.length) { container.innerHTML = '<div class="loading" style="color:var(--text-muted)">Nessun post in bacheca. L\'admin può pubblicare contenuti da qui.</div>'; return; }

  window._bachecaPosts = posts;
  var isAdmin = utenteCorrente && utenteCorrente.ruolo === 'admin';
  var html = '';
  posts.forEach(function(p, idx) {
    var dataFmt = new Date(p.created_at).toLocaleDateString('it-IT', { weekday:'short', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' });
    var prioritaStyle = '';
    var prioritaBadge = '';
    if (p.priorita === 'urgente') { prioritaStyle = 'border-left:4px solid #E24B4A;border-radius:0'; prioritaBadge = '<span style="font-size:10px;background:#E24B4A;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600">URGENTE</span> '; }
    else if (p.priorita === 'importante') { prioritaStyle = 'border-left:4px solid #D4A017;border-radius:0'; prioritaBadge = '<span style="font-size:10px;background:#D4A017;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600">IMPORTANTE</span> '; }
    var pinnedBadge = p.pinned ? '<span style="font-size:10px;background:#378ADD;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600">📌 FISSATO</span> ' : '';
    var tipoBadge = '';
    if (p.tipo === 'avviso') tipoBadge = '⚠️ ';
    else if (p.tipo === 'report') tipoBadge = '📊 ';
    else if (p.tipo === 'foto') tipoBadge = '📷 ';
    else if (p.tipo === 'timer') tipoBadge = '⏱️ ';

    // Timer override: border color based on state
    var isTimer = p.tipo === 'timer';
    var timerData = null;
    if (isTimer) {
      try { timerData = JSON.parse(p.contenuto || '{}'); } catch(e) { timerData = {}; }
      var timerAttivo = timerData.attivo !== false;
      if (!prioritaStyle) {
        var timerTarget = new Date(timerData.data_target);
        var isFuture = timerTarget > new Date();
        prioritaStyle = timerAttivo ? 'border-left:4px solid ' + (isFuture ? '#378ADD' : '#639922') + ';border-radius:0' : 'border-left:4px solid #B4B2A9;border-radius:0';
      }
    }

    var dragAttr = isAdmin ? ' draggable="true" ondragstart="_dragPost(event,' + idx + ')" ondragover="_dragOverPost(event)" ondrop="_dropPost(event,' + idx + ')" style="cursor:grab;margin-bottom:12px;transition:opacity 0.2s;' + prioritaStyle + '"' : ' style="margin-bottom:12px;' + prioritaStyle + '"';

    html += '<div class="card" data-post-idx="' + idx + '"' + dragAttr + '>';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">';
    html += '<div>' + pinnedBadge + prioritaBadge + '</div>';
    if (isAdmin) {
      html += '<div style="display:flex;gap:4px;align-items:center">';
      html += '<span style="font-size:14px;color:var(--text-muted);cursor:grab;padding:0 4px" title="Trascina per riordinare">⠿</span>';
      html += '<button class="btn-edit" title="Fissa/Sfissa" onclick="togglePinPost(\'' + p.id + '\',' + !p.pinned + ')">📌</button>';
      if (isTimer) {
        var tAtt = timerData && timerData.attivo !== false;
        html += '<button class="btn-edit" style="font-size:11px;padding:2px 8px;border:0.5px solid var(--border);border-radius:4px" onclick="toggleTimerPost(\'' + p.id + '\',' + !tAtt + ')" title="' + (tAtt ? 'Stoppa' : 'Riavvia') + '">' + (tAtt ? '⏸ stop' : '▶ start') + '</button>';
      }
      html += '<button class="btn-edit" onclick="modificaPost(\'' + p.id + '\')">✏️</button>';
      html += '<button class="btn-danger" onclick="eliminaPost(\'' + p.id + '\')">x</button>';
      html += '</div>';
    }
    html += '</div>';

    html += '<div style="font-size:17px;font-weight:600;margin-bottom:8px">' + tipoBadge + esc(p.titolo) + '</div>';

    if (isTimer && timerData) {
      var tTarget = new Date(timerData.data_target);
      var tAttivo = timerData.attivo !== false;
      var tFuture = tTarget > new Date();
      var tStoppato = timerData.stoppato_il;
      var tDataFmt = tTarget.toLocaleDateString('it-IT', { day:'2-digit', month:'long', year:'numeric' }) + ', ore ' + String(tTarget.getHours()).padStart(2,'0') + ':' + String(tTarget.getMinutes()).padStart(2,'0');

      // Status badges
      if (tAttivo) {
        html += '<div style="margin-bottom:8px"><span style="font-size:11px;background:' + (tFuture ? '#378ADD' : '#639922') + ';color:#fff;padding:2px 10px;border-radius:10px;font-weight:600">' + (tFuture ? 'conto alla rovescia' : 'conta in avanti') + '</span></div>';
        html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">' + (tFuture ? 'Obiettivo: ' : 'Dal ') + tDataFmt + '</div>';
      } else {
        html += '<div style="margin-bottom:8px"><span style="font-size:11px;background:#B4B2A9;color:#fff;padding:2px 10px;border-radius:10px;font-weight:600">stoppato</span></div>';
        html += '<div style="font-size:12px;color:var(--text-muted);margin-bottom:14px">Stoppato il ' + (tStoppato ? new Date(tStoppato).toLocaleDateString('it-IT') : '—') + '</div>';
      }

      // Timer boxes
      var tColor = !tAttivo ? ['#F1EFE8','#444441','#5F5E5A'] : tFuture ? ['#E6F1FB','#0C447C','#185FA5'] : ['#EAF3DE','#27500A','#3B6D11'];
      var opacStyle = tAttivo ? '' : 'opacity:0.5;';
      html += '<div class="timer-display" data-timer-id="' + p.id + '" data-target="' + timerData.data_target + '" data-attivo="' + (tAttivo?'1':'0') + '" data-stoppato="' + (tStoppato||'') + '" style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center;' + opacStyle + '">';
      ['anni','mesi','giorni','ore','min','sec'].forEach(function(u) {
        html += '<div style="background:' + tColor[0] + ';border-radius:8px;padding:10px 14px;text-align:center;min-width:60px">';
        html += '<div class="timer-val" data-unit="' + u + '" style="font-size:26px;font-weight:500;color:' + tColor[1] + ';font-family:var(--font-mono)">—</div>';
        html += '<div style="font-size:10px;color:' + tColor[2] + ';margin-top:3px;text-transform:uppercase">' + u + '</div></div>';
      });
      html += '</div>';
      html += '<div class="timer-summary" data-timer-id="' + p.id + '" style="font-size:11px;color:var(--text-muted);margin-top:8px;text-align:center"></div>';

    } else if (p.contenuto) {
      var cont = esc(p.contenuto).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
      html += '<div style="font-size:14px;line-height:1.6;color:var(--text);margin-bottom:10px">' + cont + '</div>';
    }

    if (p.allegato_url) {
      var urls = p.allegato_url.split('||');
      var nomi = (p.allegato_nome || '').split('||');
      urls.forEach(function(url, aidx) {
        url = url.trim(); if (!url) return;
        var nome = (nomi[aidx] || '').trim() || url.split('/').pop().split('?')[0];
        var isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(nome) || /\.(jpg|jpeg|png|gif|webp)/i.test(url);
        var isVideo = /youtube\.com|youtu\.be|vimeo\.com/i.test(url);
        var isPdf = /\.pdf$/i.test(nome);
        var isExcel = /\.(xlsx?|csv)$/i.test(nome);
        if (isImg) {
          html += '<div style="margin-bottom:10px"><img src="' + esc(url) + '" alt="' + esc(nome) + '" style="max-width:100%;max-height:500px;border-radius:8px;border:0.5px solid var(--border);cursor:pointer" onclick="window.open(\'' + esc(url) + '\',\'_blank\')" /></div>';
        } else if (isVideo) {
          var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]+)/);
          if (m) { html += '<div style="margin-bottom:10px;position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px"><iframe src="https://www.youtube.com/embed/' + m[1] + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:8px" allowfullscreen></iframe></div>'; }
          else { html += '<div style="margin-bottom:10px"><a href="' + esc(url) + '" target="_blank" style="color:#378ADD">🎬 ' + esc(nome) + '</a></div>'; }
        } else if (isPdf) {
          html += '<div style="margin-bottom:10px;padding:10px 14px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"><a href="' + esc(url) + '" target="_blank" style="color:#E24B4A;text-decoration:none;font-weight:500">📄 ' + esc(nome) + '</a></div>';
        } else if (isExcel) {
          html += '<div style="margin-bottom:10px;padding:10px 14px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"><a href="' + esc(url) + '" target="_blank" style="color:#639922;text-decoration:none;font-weight:500">📊 ' + esc(nome) + '</a></div>';
        } else {
          html += '<div style="margin-bottom:10px"><a href="' + esc(url) + '" target="_blank" style="color:#378ADD">📎 ' + esc(nome) + '</a></div>';
        }
      });
    }
    html += '<div style="font-size:11px;color:var(--text-muted)">' + esc(p.autore_nome || 'Admin') + ' — ' + dataFmt + '</div>';
    html += '</div>';
  });
  container.innerHTML = html;
  _startTimerTick();
}

// ── DRAG & DROP ──
var _dragIdx = null;
function _dragPost(ev, idx) { _dragIdx = idx; ev.target.closest('.card').style.opacity = '0.4'; ev.dataTransfer.effectAllowed = 'move'; }
function _dragOverPost(ev) { ev.preventDefault(); ev.dataTransfer.dropEffect = 'move'; }
async function _dropPost(ev, dropIdx) {
  ev.preventDefault();
  if (_dragIdx === null || _dragIdx === dropIdx) return;
  var posts = window._bachecaPosts;
  if (!posts) return;
  // Sposta il post
  var movedPost = posts[_dragIdx];
  var targetPost = posts[dropIdx];
  // Scambia ordine nel DB
  var now = Date.now();
  var ordineTarget = targetPost.ordine || now;
  var ordineMoved = movedPost.ordine || now;
  await Promise.all([
    sb.from('bacheca_post').update({ ordine: ordineTarget }).eq('id', movedPost.id),
    sb.from('bacheca_post').update({ ordine: ordineMoved }).eq('id', targetPost.id)
  ]);
  _dragIdx = null;
  caricaHome();
}
document.addEventListener('dragend', function() {
  document.querySelectorAll('#home-feed .card').forEach(function(c) { c.style.opacity = '1'; });
  _dragIdx = null;
});

// ── ADMIN: Form post ──
function apriFormPost(postId) {
  var titolo = '', contenuto = '', tipo = 'nota', priorita = 'normale', pinned = false;
  if (postId && window._editPost) {
    var p = window._editPost;
    titolo = p.titolo || ''; contenuto = p.contenuto || ''; tipo = p.tipo || 'nota';
    priorita = p.priorita || 'normale'; pinned = !!p.pinned;
  }
  window._postAllegati = [];
  if (postId && window._editPost && window._editPost.allegato_url) {
    var urls = window._editPost.allegato_url.split('||');
    var nomi = (window._editPost.allegato_nome || '').split('||');
    urls.forEach(function(u,i) { if (u.trim()) window._postAllegati.push({ url: u.trim(), nome: (nomi[i]||'').trim() || u.trim().split('/').pop() }); });
  }

  var html = '<div style="font-size:16px;font-weight:600;margin-bottom:16px">' + (postId ? '✏️ Modifica post' : '📝 Nuovo post in bacheca') + '</div>';
  html += '<div style="display:flex;flex-direction:column;gap:12px">';
  html += '<div class="form-group"><label>Titolo</label><input type="text" id="post-titolo" value="' + esc(titolo) + '" placeholder="Titolo del post..." style="font-size:15px;padding:10px 14px" /></div>';
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  html += '<div class="form-group" style="flex:1;min-width:140px"><label>Tipo</label><select id="post-tipo" style="font-size:13px;padding:8px 10px">';
  ['nota','avviso','report','foto'].forEach(function(t) {
    var labels = { nota:'📝 Nota', avviso:'⚠️ Avviso', report:'📊 Report', foto:'📷 Foto' };
    html += '<option value="'+t+'"'+(tipo===t?' selected':'')+'>'+labels[t]+'</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group" style="flex:1;min-width:140px"><label>Priorità</label><select id="post-priorita" style="font-size:13px;padding:8px 10px">';
  ['normale','importante','urgente'].forEach(function(pr) {
    html += '<option value="'+pr+'"'+(priorita===pr?' selected':'')+'>'+pr.charAt(0).toUpperCase()+pr.slice(1)+'</option>';
  });
  html += '</select></div>';
  html += '<div class="form-group" style="flex:0"><label>&nbsp;</label><label style="display:flex;align-items:center;gap:6px;cursor:pointer;white-space:nowrap"><input type="checkbox" id="post-pinned" ' + (pinned ? 'checked' : '') + ' /> 📌 Fissa</label></div>';
  html += '</div>';
  html += '<div class="form-group"><label>Contenuto</label><textarea id="post-contenuto" rows="6" placeholder="Scrivi il contenuto... (**grassetto**, *corsivo*)" style="font-size:14px;padding:10px 14px;line-height:1.5">' + esc(contenuto) + '</textarea></div>';
  html += '<div class="form-group"><label>Allegati (foto, PDF, Excel, video YouTube)</label>';
  html += '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:8px">';
  html += '<button type="button" class="btn-primary" style="font-size:13px;padding:8px 16px;background:#378ADD" onclick="document.getElementById(\'post-file-input\').click()">📁 Carica file</button>';
  html += '<input type="text" id="post-url-manual" placeholder="oppure incolla URL..." style="flex:1;min-width:160px;font-size:13px;padding:8px 12px" />';
  html += '<button type="button" class="btn-primary" style="font-size:13px;padding:8px 14px" onclick="aggiungiUrlManuale()">+ Aggiungi</button>';
  html += '</div>';
  html += '<input type="file" id="post-file-input" accept="image/*,.pdf,.xlsx,.xls,.csv,.doc,.docx" multiple style="display:none" onchange="uploadAllegatiPost(this)" />';
  html += '<div id="post-allegati-lista"></div></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:16px">';
  html += '<button class="btn-primary" style="flex:1;padding:12px;font-size:15px;background:#639922" onclick="salvaPost(' + (postId ? "'" + postId + "'" : 'null') + ')">💾 Pubblica</button>';
  html += '<button onclick="chiudiModalePermessi()" style="padding:12px 20px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer;font-size:14px">Annulla</button>';
  html += '</div>';
  apriModal(html);
  _renderAllegatiLista();
}

function _renderAllegatiLista() {
  var el = document.getElementById('post-allegati-lista');
  if (!el) return;
  var allegati = window._postAllegati || [];
  if (!allegati.length) { el.innerHTML = '<div style="font-size:12px;color:var(--text-muted)">Nessun allegato</div>'; return; }
  el.innerHTML = allegati.map(function(a, i) {
    var isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(a.nome);
    var icon = isImg ? '🖼️' : /\.pdf$/i.test(a.nome) ? '📄' : /\.(xlsx?|csv)$/i.test(a.nome) ? '📊' : /youtube|youtu\.be/i.test(a.url) ? '🎬' : '📎';
    return '<div style="display:flex;align-items:center;gap:8px;padding:6px 10px;background:var(--bg);border-radius:6px;margin-bottom:4px">' +
      '<span>' + icon + '</span><span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.nome) + '</span>' +
      (isImg ? '<img src="' + esc(a.url) + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px" />' : '') +
      '<button class="btn-danger" style="font-size:11px;padding:2px 8px" onclick="rimuoviAllegato(' + i + ')">x</button></div>';
  }).join('');
}
function rimuoviAllegato(idx) { window._postAllegati.splice(idx, 1); _renderAllegatiLista(); }

function aggiungiUrlManuale() {
  var inp = document.getElementById('post-url-manual');
  var url = (inp.value || '').trim(); if (!url) return;
  var nome = url;
  try { nome = decodeURIComponent(url.split('/').pop().split('?')[0]); } catch(e) {}
  if (/youtube\.com|youtu\.be/i.test(url)) nome = 'Video YouTube';
  window._postAllegati.push({ url: url, nome: nome });
  inp.value = ''; _renderAllegatiLista();
}

async function uploadAllegatiPost(input) {
  if (!input.files || !input.files.length) return;
  for (var i = 0; i < input.files.length; i++) {
    var file = input.files[i], nome = file.name;
    var path = 'post/' + Date.now() + '_' + nome.replace(/[^a-zA-Z0-9._-]/g, '_');
    toast('⏳ Caricamento ' + nome + '...');
    var { data, error } = await sb.storage.from('bacheca').upload(path, file, { upsert: true });
    if (error) { toast('Errore upload ' + nome + ': ' + error.message); continue; }
    var { data: urlData } = sb.storage.from('bacheca').getPublicUrl(path);
    window._postAllegati.push({ url: urlData.publicUrl, nome: nome });
    toast('✅ ' + nome + ' caricato!');
  }
  input.value = ''; _renderAllegatiLista();
}

async function salvaPost(postId) {
  var titolo = document.getElementById('post-titolo').value.trim();
  if (!titolo) { toast('Inserisci un titolo'); return; }
  var allegati = window._postAllegati || [];
  var record = {
    titolo: titolo, contenuto: document.getElementById('post-contenuto').value,
    tipo: document.getElementById('post-tipo').value, priorita: document.getElementById('post-priorita').value,
    pinned: document.getElementById('post-pinned').checked,
    allegato_url: allegati.map(function(a){return a.url;}).join('||') || null,
    allegato_nome: allegati.map(function(a){return a.nome;}).join('||') || null,
    autore_id: utenteCorrente ? utenteCorrente.id : null,
    autore_nome: utenteCorrente ? utenteCorrente.nome : 'Admin',
    ordine: postId ? undefined : Date.now(),
    updated_at: new Date().toISOString()
  };
  if (postId) delete record.ordine;
  var error;
  if (postId) { error = (await sb.from('bacheca_post').update(record).eq('id', postId)).error; }
  else { error = (await sb.from('bacheca_post').insert([record])).error; }
  if (error) { toast('Errore: ' + error.message); return; }
  chiudiModalePermessi();
  toast(postId ? '✅ Post aggiornato!' : '✅ Post pubblicato!');
  caricaHome();
}

async function modificaPost(id) {
  var { data: p } = await sb.from('bacheca_post').select('*').eq('id', id).single();
  if (!p) { toast('Post non trovato'); return; }
  window._editPost = p;
  if (p.tipo === 'timer') apriFormTimer(id);
  else apriFormPost(id);
}
async function eliminaPost(id) {
  if (!confirm('Eliminare questo post dalla bacheca?')) return;
  await sb.from('bacheca_post').update({ attivo: false }).eq('id', id);
  toast('Post eliminato'); caricaHome();
}
async function togglePinPost(id, pinned) {
  await sb.from('bacheca_post').update({ pinned: pinned }).eq('id', id);
  toast(pinned ? '📌 Post fissato in cima' : 'Post sfissato'); caricaHome();
}

// ══════════════════════════════════════════════════════════════════
// ── LAVAGNA (Whiteboard con matite colorate) ─────────────────────
// ══════════════════════════════════════════════════════════════════

function apriLavagna() {
  var html = '<div style="font-size:16px;font-weight:600;margin-bottom:12px">🎨 Lavagna — disegna e pubblica</div>';
  // Toolbar
  html += '<div id="lavagna-toolbar" style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:10px;padding:10px;background:var(--bg);border-radius:8px">';
  // Colori
  var colori = [
    {hex:'#1a1a1a',nome:'Nero'},{hex:'#E24B4A',nome:'Rosso'},{hex:'#378ADD',nome:'Blu'},
    {hex:'#639922',nome:'Verde'},{hex:'#D4A017',nome:'Arancione'},{hex:'#6B5FCC',nome:'Viola'},
    {hex:'#D85A30',nome:'Corallo'},{hex:'#BA7517',nome:'Marrone'},{hex:'#ffffff',nome:'Bianco (gomma)'}
  ];
  html += '<div style="display:flex;gap:4px;align-items:center">';
  colori.forEach(function(c) {
    var border = c.hex === '#ffffff' ? '2px solid #ccc' : '2px solid transparent';
    html += '<div onclick="_lavagnaColore(\'' + c.hex + '\',this)" title="' + c.nome + '" style="width:28px;height:28px;border-radius:50%;background:' + c.hex + ';cursor:pointer;border:' + border + ';flex-shrink:0' + (c.hex === '#1a1a1a' ? ';box-shadow:0 0 0 2px #378ADD' : '') + '" class="lav-colore"></div>';
  });
  html += '</div>';
  // Spessore
  html += '<div style="display:flex;gap:4px;align-items:center;margin-left:8px">';
  [2,4,8,14,24].forEach(function(s) {
    html += '<div onclick="_lavagnaSpessore(' + s + ',this)" title="' + s + 'px" class="lav-spessore" style="width:' + Math.max(18,s+8) + 'px;height:' + Math.max(18,s+8) + 'px;border-radius:50%;background:var(--text);opacity:' + (s===4?'1':'0.3') + ';cursor:pointer;display:flex;align-items:center;justify-content:center;flex-shrink:0"><div style="width:' + s + 'px;height:' + s + 'px;border-radius:50%;background:var(--text)"></div></div>';
  });
  html += '</div>';
  // Bottoni
  html += '<button class="btn-primary" style="font-size:12px;padding:6px 14px;margin-left:auto" onclick="_lavagnaPulisci()">🗑️ Pulisci</button>';
  html += '<button class="btn-primary" style="font-size:12px;padding:6px 14px" onclick="_lavagnaUndo()">↩️ Annulla</button>';
  html += '</div>';
  // Canvas
  html += '<div style="border:1px solid var(--border);border-radius:8px;overflow:hidden;background:#fff;touch-action:none">';
  html += '<canvas id="lavagna-canvas" width="800" height="500" style="width:100%;display:block;cursor:crosshair"></canvas>';
  html += '</div>';
  // Titolo + salva
  html += '<div style="display:flex;gap:8px;margin-top:12px;align-items:center">';
  html += '<input type="text" id="lavagna-titolo" placeholder="Titolo del disegno..." style="flex:1;font-size:14px;padding:10px 14px" />';
  html += '<button class="btn-primary" style="padding:12px 24px;font-size:15px;background:#639922" onclick="salvaLavagna()">💾 Pubblica in bacheca</button>';
  html += '<button onclick="chiudiModalePermessi()" style="padding:12px 20px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer">Chiudi</button>';
  html += '</div>';

  apriModal(html);

  // Init canvas
  setTimeout(function() {
    var canvas = document.getElementById('lavagna-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    window._lav = { ctx: ctx, canvas: canvas, drawing: false, color: '#1a1a1a', size: 4, history: [] };
    _lavagnaSalvaStato();

    // Mouse events
    canvas.addEventListener('mousedown', _lavMouseDown);
    canvas.addEventListener('mousemove', _lavMouseMove);
    canvas.addEventListener('mouseup', _lavMouseUp);
    canvas.addEventListener('mouseleave', _lavMouseUp);
    // Touch events
    canvas.addEventListener('touchstart', _lavTouchStart, { passive: false });
    canvas.addEventListener('touchmove', _lavTouchMove, { passive: false });
    canvas.addEventListener('touchend', _lavTouchEnd);
  }, 100);
}

function _lavPos(ev) {
  var canvas = window._lav.canvas;
  var rect = canvas.getBoundingClientRect();
  return { x: (ev.clientX - rect.left) * (canvas.width / rect.width), y: (ev.clientY - rect.top) * (canvas.height / rect.height) };
}
function _lavMouseDown(ev) {
  var l = window._lav; l.drawing = true;
  var p = _lavPos(ev);
  l.ctx.beginPath(); l.ctx.moveTo(p.x, p.y);
  l.ctx.strokeStyle = l.color; l.ctx.lineWidth = l.size;
}
function _lavMouseMove(ev) {
  var l = window._lav; if (!l.drawing) return;
  var p = _lavPos(ev);
  l.ctx.lineTo(p.x, p.y); l.ctx.stroke();
}
function _lavMouseUp() {
  var l = window._lav; if (!l.drawing) return;
  l.drawing = false; _lavagnaSalvaStato();
}
function _lavTouchStart(ev) {
  ev.preventDefault();
  var touch = ev.touches[0];
  var me = new MouseEvent('mousedown', { clientX: touch.clientX, clientY: touch.clientY });
  window._lav.canvas.dispatchEvent(me);
}
function _lavTouchMove(ev) {
  ev.preventDefault();
  var touch = ev.touches[0];
  var me = new MouseEvent('mousemove', { clientX: touch.clientX, clientY: touch.clientY });
  window._lav.canvas.dispatchEvent(me);
}
function _lavTouchEnd(ev) {
  var me = new MouseEvent('mouseup', {});
  window._lav.canvas.dispatchEvent(me);
}

function _lavagnaColore(hex, el) {
  window._lav.color = hex;
  document.querySelectorAll('.lav-colore').forEach(function(d) { d.style.boxShadow = 'none'; });
  el.style.boxShadow = '0 0 0 2px #378ADD';
}
function _lavagnaSpessore(size, el) {
  window._lav.size = size;
  document.querySelectorAll('.lav-spessore').forEach(function(d) { d.style.opacity = '0.3'; });
  el.style.opacity = '1';
}
function _lavagnaPulisci() {
  var l = window._lav;
  l.ctx.fillStyle = '#ffffff';
  l.ctx.fillRect(0, 0, l.canvas.width, l.canvas.height);
  _lavagnaSalvaStato();
}
function _lavagnaSalvaStato() {
  var l = window._lav;
  l.history.push(l.canvas.toDataURL());
  if (l.history.length > 30) l.history.shift();
}
function _lavagnaUndo() {
  var l = window._lav;
  if (l.history.length <= 1) return;
  l.history.pop();
  var img = new Image();
  img.onload = function() { l.ctx.clearRect(0, 0, l.canvas.width, l.canvas.height); l.ctx.drawImage(img, 0, 0); };
  img.src = l.history[l.history.length - 1];
}

async function salvaLavagna() {
  var titolo = (document.getElementById('lavagna-titolo').value || '').trim() || 'Disegno lavagna ' + new Date().toLocaleDateString('it-IT');
  var canvas = document.getElementById('lavagna-canvas');
  if (!canvas) return;

  toast('⏳ Salvataggio disegno...');
  // Converti canvas → blob → upload su Supabase Storage
  canvas.toBlob(async function(blob) {
    var nome = 'lavagna_' + Date.now() + '.png';
    var path = 'post/' + nome;
    var { data, error } = await sb.storage.from('bacheca').upload(path, blob, { contentType: 'image/png', upsert: true });
    if (error) { toast('Errore upload: ' + error.message); return; }
    var { data: urlData } = sb.storage.from('bacheca').getPublicUrl(path);
    var publicUrl = urlData.publicUrl;

    // Crea post con l'immagine
    var record = {
      titolo: titolo, contenuto: '', tipo: 'foto', priorita: 'normale', pinned: false,
      allegato_url: publicUrl, allegato_nome: nome,
      autore_id: utenteCorrente ? utenteCorrente.id : null,
      autore_nome: utenteCorrente ? utenteCorrente.nome : 'Admin',
      ordine: Date.now(), updated_at: new Date().toISOString()
    };
    var { error: errIns } = await sb.from('bacheca_post').insert([record]);
    if (errIns) { toast('Errore: ' + errIns.message); return; }
    chiudiModalePermessi();
    toast('✅ Disegno pubblicato in bacheca!');
    caricaHome();
  }, 'image/png');
}

// ══════════════════════════════════════════════════════════════════
// CONTATORI / TIMER
// ══════════════════════════════════════════════════════════════════

var _timerInterval = null;

function _startTimerTick() {
  if (_timerInterval) clearInterval(_timerInterval);
  _tickAllTimers();
  _timerInterval = setInterval(_tickAllTimers, 1000);
}

function _tickAllTimers() {
  var timers = document.querySelectorAll('.timer-display');
  timers.forEach(function(el) {
    var target = new Date(el.dataset.target);
    var attivo = el.dataset.attivo === '1';
    var stoppato = el.dataset.stoppato;
    var now = attivo ? new Date() : (stoppato ? new Date(stoppato) : new Date());
    var diff = target - now;
    var isFuture = diff > 0;
    var absDiff = Math.abs(diff);

    var totalSec = Math.floor(absDiff / 1000);
    var totalMin = Math.floor(totalSec / 60);
    var totalOre = Math.floor(totalMin / 60);
    var totalGiorni = Math.floor(totalOre / 24);

    var anni = Math.floor(totalGiorni / 365);
    var restGG = totalGiorni - anni * 365;
    var mesi = Math.floor(restGG / 30);
    var giorni = restGG - mesi * 30;
    var ore = totalOre % 24;
    var min = totalMin % 60;
    var sec = totalSec % 60;

    var vals = el.querySelectorAll('.timer-val');
    var map = { anni: anni, mesi: mesi, giorni: giorni, ore: ore, min: min, sec: sec };
    vals.forEach(function(v) {
      var unit = v.dataset.unit;
      var val = map[unit];
      v.textContent = (unit === 'ore' || unit === 'min' || unit === 'sec') ? String(val).padStart(2, '0') : val;
    });

    // Summary
    var tid = el.dataset.timerId;
    var summEl = document.querySelector('.timer-summary[data-timer-id="' + tid + '"]');
    if (summEl) {
      summEl.textContent = 'Totale: ' + totalGiorni + ' giorni, ' + ore + ' ore, ' + min + ' minuti, ' + sec + ' secondi';
    }
  });
}

function apriFormTimer(postId) {
  var titolo = '', dataTarget = '', oraTarget = '08:00', attivo = true;

  if (postId && window._editPost && window._editPost.tipo === 'timer') {
    var p = window._editPost;
    titolo = p.titolo || '';
    try {
      var td = JSON.parse(p.contenuto || '{}');
      var dt = new Date(td.data_target);
      dataTarget = dt.getFullYear() + '-' + String(dt.getMonth()+1).padStart(2,'0') + '-' + String(dt.getDate()).padStart(2,'0');
      oraTarget = String(dt.getHours()).padStart(2,'0') + ':' + String(dt.getMinutes()).padStart(2,'0');
      attivo = td.attivo !== false;
    } catch(e) {}
  }

  var html = '<div style="font-size:16px;font-weight:600;margin-bottom:16px">' + (postId ? '✏️ Modifica contatore' : '⏱️ Nuovo contatore') + '</div>';
  html += '<div style="font-size:13px;color:var(--text-muted);margin-bottom:16px;line-height:1.6">Imposta una data: se è nel passato il contatore conta in avanti (tempo trascorso), se è nel futuro conta alla rovescia (tempo rimanente).</div>';
  html += '<div style="display:flex;flex-direction:column;gap:12px">';
  html += '<div class="form-group"><label>Titolo contatore</label><input type="text" id="timer-titolo" value="' + esc(titolo) + '" placeholder="Es. Giorni senza incidenti, Scadenza certificazione..." style="font-size:15px;padding:10px 14px" /></div>';
  html += '<div style="display:flex;gap:12px;flex-wrap:wrap">';
  html += '<div class="form-group" style="flex:1;min-width:160px"><label>Data di riferimento</label><input type="date" id="timer-data" value="' + dataTarget + '" style="font-size:15px;padding:10px 14px" /></div>';
  html += '<div class="form-group" style="flex:0;min-width:120px"><label>Ora</label><input type="time" id="timer-ora" value="' + oraTarget + '" style="font-size:15px;padding:10px 14px" /></div>';
  html += '</div>';
  html += '<div class="form-group"><label style="display:flex;align-items:center;gap:6px;cursor:pointer"><input type="checkbox" id="timer-attivo" ' + (attivo ? 'checked' : '') + ' /> Attivo (in esecuzione)</label></div>';
  html += '</div>';
  html += '<div style="display:flex;gap:8px;margin-top:16px">';
  html += '<button class="btn-primary" style="flex:1;padding:12px;font-size:15px;background:#378ADD" onclick="salvaTimer(' + (postId ? "'" + postId + "'" : 'null') + ')">💾 Pubblica contatore</button>';
  html += '<button onclick="chiudiModalePermessi()" style="padding:12px 20px;border:0.5px solid var(--border);border-radius:var(--radius);background:var(--bg);cursor:pointer;font-size:14px">Annulla</button>';
  html += '</div>';

  apriModal(html);
}

async function salvaTimer(postId) {
  var titolo = document.getElementById('timer-titolo').value.trim();
  if (!titolo) { toast('Inserisci un titolo'); return; }
  var data = document.getElementById('timer-data').value;
  var ora = document.getElementById('timer-ora').value || '00:00';
  if (!data) { toast('Inserisci una data di riferimento'); return; }
  var attivo = document.getElementById('timer-attivo').checked;

  var dataTarget = data + 'T' + ora + ':00';
  var contenuto = JSON.stringify({ data_target: dataTarget, attivo: attivo, stoppato_il: attivo ? null : new Date().toISOString() });

  var record = {
    titolo: titolo,
    contenuto: contenuto,
    tipo: 'timer',
    priorita: 'normale',
    pinned: false,
    allegato_url: null,
    allegato_nome: null,
    autore_id: utenteCorrente ? utenteCorrente.id : null,
    autore_nome: utenteCorrente ? utenteCorrente.nome : 'Admin',
    ordine: postId ? undefined : Date.now(),
    updated_at: new Date().toISOString()
  };
  if (postId) delete record.ordine;

  var error;
  if (postId) { error = (await sb.from('bacheca_post').update(record).eq('id', postId)).error; }
  else { error = (await sb.from('bacheca_post').insert([record])).error; }
  if (error) { toast('Errore: ' + error.message); return; }
  chiudiModalePermessi();
  toast(postId ? '✅ Contatore aggiornato!' : '✅ Contatore pubblicato!');
  caricaHome();
}

async function toggleTimerPost(id, nuovoStato) {
  var { data: post } = await sb.from('bacheca_post').select('contenuto').eq('id', id).single();
  if (!post) return;
  var td = {};
  try { td = JSON.parse(post.contenuto || '{}'); } catch(e) {}
  td.attivo = nuovoStato;
  if (!nuovoStato) td.stoppato_il = new Date().toISOString();
  else td.stoppato_il = null;
  await sb.from('bacheca_post').update({ contenuto: JSON.stringify(td), updated_at: new Date().toISOString() }).eq('id', id);
  toast(nuovoStato ? '▶ Contatore riavviato' : '⏸ Contatore stoppato');
  caricaHome();
}
