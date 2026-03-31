// PhoenixFuel — Home / Bacheca (landing page operatori)

async function caricaHome() {
  var container = document.getElementById('home-feed');
  if (!container) return;
  container.innerHTML = '<div class="loading">Caricamento bacheca...</div>';

  var { data: posts, error } = await sb.from('bacheca_post').select('*')
    .eq('attivo', true)
    .order('pinned', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) { container.innerHTML = '<div class="loading">Errore: ' + error.message + '</div>'; return; }
  if (!posts || !posts.length) { container.innerHTML = '<div class="loading" style="color:var(--text-muted)">Nessun post in bacheca. L\'admin può pubblicare contenuti da qui.</div>'; return; }

  var isAdmin = utenteCorrente && utenteCorrente.ruolo === 'admin';
  var html = '';
  posts.forEach(function(p) {
    var dataFmt = new Date(p.created_at).toLocaleDateString('it-IT', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
    var prioritaStyle = '';
    var prioritaBadge = '';
    if (p.priorita === 'urgente') { prioritaStyle = 'border-left:4px solid #E24B4A;border-radius:0'; prioritaBadge = '<span style="font-size:10px;background:#E24B4A;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600">URGENTE</span> '; }
    else if (p.priorita === 'importante') { prioritaStyle = 'border-left:4px solid #D4A017;border-radius:0'; prioritaBadge = '<span style="font-size:10px;background:#D4A017;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600">IMPORTANTE</span> '; }
    var pinnedBadge = p.pinned ? '<span style="font-size:10px;background:#378ADD;color:#fff;padding:2px 8px;border-radius:10px;font-weight:600">📌 FISSATO</span> ' : '';
    var tipoBadge = '';
    if (p.tipo === 'avviso') tipoBadge = '⚠️ ';
    else if (p.tipo === 'report') tipoBadge = '📊 ';
    else if (p.tipo === 'foto') tipoBadge = '📷 ';

    html += '<div class="card" style="margin-bottom:12px;' + prioritaStyle + '">';
    html += '<div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px">';
    html += '<div>' + pinnedBadge + prioritaBadge + '</div>';
    if (isAdmin) {
      html += '<div style="display:flex;gap:4px">';
      html += '<button class="btn-edit" title="Fissa/Sfissa" onclick="togglePinPost(\'' + p.id + '\',' + !p.pinned + ')">📌</button>';
      html += '<button class="btn-edit" onclick="modificaPost(\'' + p.id + '\')">✏️</button>';
      html += '<button class="btn-danger" onclick="eliminaPost(\'' + p.id + '\')">x</button>';
      html += '</div>';
    }
    html += '</div>';

    html += '<div style="font-size:17px;font-weight:600;margin-bottom:8px">' + tipoBadge + esc(p.titolo) + '</div>';

    if (p.contenuto) {
      var cont = esc(p.contenuto).replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\*(.*?)\*/g, '<em>$1</em>').replace(/\n/g, '<br>');
      html += '<div style="font-size:14px;line-height:1.6;color:var(--text);margin-bottom:10px">' + cont + '</div>';
    }

    if (p.allegato_url) {
      var urls = p.allegato_url.split('||');
      var nomi = (p.allegato_nome || '').split('||');
      urls.forEach(function(url, idx) {
        url = url.trim(); if (!url) return;
        var nome = (nomi[idx] || '').trim() || url.split('/').pop().split('?')[0];
        var isImg = /\.(jpg|jpeg|png|gif|webp)$/i.test(nome) || /\.(jpg|jpeg|png|gif|webp)/i.test(url);
        var isVideo = /youtube\.com|youtu\.be|vimeo\.com/i.test(url);
        var isPdf = /\.pdf$/i.test(nome);
        var isExcel = /\.(xlsx?|csv)$/i.test(nome);

        if (isImg) {
          html += '<div style="margin-bottom:10px"><img src="' + esc(url) + '" alt="' + esc(nome) + '" style="max-width:100%;max-height:500px;border-radius:8px;border:0.5px solid var(--border);cursor:pointer" onclick="window.open(\'' + esc(url) + '\',\'_blank\')" /></div>';
        } else if (isVideo) {
          var videoId = '';
          var m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]+)/);
          if (m) videoId = m[1];
          if (videoId) {
            html += '<div style="margin-bottom:10px;position:relative;padding-bottom:56.25%;height:0;overflow:hidden;border-radius:8px"><iframe src="https://www.youtube.com/embed/' + videoId + '" style="position:absolute;top:0;left:0;width:100%;height:100%;border:none;border-radius:8px" allowfullscreen></iframe></div>';
          } else {
            html += '<div style="margin-bottom:10px"><a href="' + esc(url) + '" target="_blank" style="color:#378ADD;text-decoration:underline">🎬 ' + esc(nome) + '</a></div>';
          }
        } else if (isPdf) {
          html += '<div style="margin-bottom:10px;padding:10px 14px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"><a href="' + esc(url) + '" target="_blank" style="color:#E24B4A;text-decoration:none;font-weight:500">📄 ' + esc(nome) + '</a></div>';
        } else if (isExcel) {
          html += '<div style="margin-bottom:10px;padding:10px 14px;background:var(--bg);border-radius:8px;border:0.5px solid var(--border)"><a href="' + esc(url) + '" target="_blank" style="color:#639922;text-decoration:none;font-weight:500">📊 ' + esc(nome) + '</a></div>';
        } else {
          html += '<div style="margin-bottom:10px"><a href="' + esc(url) + '" target="_blank" style="color:#378ADD;text-decoration:underline">📎 ' + esc(nome) + '</a></div>';
        }
      });
    }

    html += '<div style="font-size:11px;color:var(--text-muted)">' + esc(p.autore_nome || 'Admin') + ' — ' + dataFmt + '</div>';
    html += '</div>';
  });

  container.innerHTML = html;
}

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
  // Upload
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
      '<span>' + icon + '</span>' +
      '<span style="flex:1;font-size:13px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + esc(a.nome) + '</span>' +
      (isImg ? '<img src="' + esc(a.url) + '" style="width:40px;height:40px;object-fit:cover;border-radius:4px" />' : '') +
      '<button class="btn-danger" style="font-size:11px;padding:2px 8px" onclick="rimuoviAllegato(' + i + ')">x</button></div>';
  }).join('');
}

function rimuoviAllegato(idx) {
  window._postAllegati.splice(idx, 1);
  _renderAllegatiLista();
}

function aggiungiUrlManuale() {
  var inp = document.getElementById('post-url-manual');
  var url = (inp.value || '').trim();
  if (!url) return;
  var nome = url;
  try { nome = decodeURIComponent(url.split('/').pop().split('?')[0]); } catch(e) {}
  if (/youtube\.com|youtu\.be/i.test(url)) nome = 'Video YouTube';
  window._postAllegati.push({ url: url, nome: nome });
  inp.value = '';
  _renderAllegatiLista();
}

async function uploadAllegatiPost(input) {
  if (!input.files || !input.files.length) return;
  for (var i = 0; i < input.files.length; i++) {
    var file = input.files[i];
    var nome = file.name;
    var path = 'post/' + Date.now() + '_' + nome.replace(/[^a-zA-Z0-9._-]/g, '_');
    toast('⏳ Caricamento ' + nome + '...');
    var { data, error } = await sb.storage.from('bacheca').upload(path, file, { upsert: true });
    if (error) { toast('Errore upload ' + nome + ': ' + error.message); continue; }
    var { data: urlData } = sb.storage.from('bacheca').getPublicUrl(path);
    window._postAllegati.push({ url: urlData.publicUrl, nome: nome });
    toast('✅ ' + nome + ' caricato!');
  }
  input.value = '';
  _renderAllegatiLista();
}

async function salvaPost(postId) {
  var titolo = document.getElementById('post-titolo').value.trim();
  if (!titolo) { toast('Inserisci un titolo'); return; }
  var allegati = window._postAllegati || [];
  var record = {
    titolo: titolo,
    contenuto: document.getElementById('post-contenuto').value,
    tipo: document.getElementById('post-tipo').value,
    priorita: document.getElementById('post-priorita').value,
    pinned: document.getElementById('post-pinned').checked,
    allegato_url: allegati.map(function(a) { return a.url; }).join('||') || null,
    allegato_nome: allegati.map(function(a) { return a.nome; }).join('||') || null,
    autore_id: utenteCorrente ? utenteCorrente.id : null,
    autore_nome: utenteCorrente ? utenteCorrente.nome : 'Admin',
    updated_at: new Date().toISOString()
  };
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
  apriFormPost(id);
}

async function eliminaPost(id) {
  if (!confirm('Eliminare questo post dalla bacheca?')) return;
  await sb.from('bacheca_post').update({ attivo: false }).eq('id', id);
  toast('Post eliminato');
  caricaHome();
}

async function togglePinPost(id, pinned) {
  await sb.from('bacheca_post').update({ pinned: pinned }).eq('id', id);
  toast(pinned ? '📌 Post fissato in cima' : 'Post sfissato');
  caricaHome();
}
