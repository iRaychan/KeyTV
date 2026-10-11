(() => {
  'use strict';

  const VERSION = '1.01';
  const KEYS = {
    playlists: 'keytv.v101.playlists', active: 'keytv.v101.activePlaylist',
    favourites: 'keytv.favourites', epg: 'keytv.epgUrl'
  };
  const state = { playlists: [], activeId: '', channels: [], selectedUrl: '', sourceMode: 'url', hls: null, retryCount: 0, retryTimer: 0, objectUrl: '' };
  const $ = id => document.getElementById(id);
  const els = {
    select: $('playlistSelect'), list: $('channelList'), empty: $('emptyChannels'), search: $('channelSearch'), category: $('categoryFilter'), favouritesOnly: $('favouritesOnly'), count: $('channelCount'),
    video: $('video'), frame: $('playerFrame'), placeholder: $('playerPlaceholder'), loading: $('loadingIndicator'), now: $('nowPlaying'), nowCategory: $('nowCategory'), diagnostic: $('diagnostic'), diagnosticTitle: $('diagnosticTitle'), diagnosticMessage: $('diagnosticMessage'), diagnosticDetail: $('diagnosticDetail'), retry: $('retryBtn'),
    playlistDialog: $('playlistDialog'), playlistForm: $('playlistForm'), managerDialog: $('managerDialog'), managerList: $('managerList'), formError: $('playlistFormError'), fileInput: $('playlistFile'), fileName: $('selectedFileName'), name: $('playlistName'), url: $('playlistUrl'), editingId: $('editingPlaylistId'), toast: $('toast')
  };

  function uid() { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`; }
  function safeJson(value, fallback) { try { return JSON.parse(value) ?? fallback; } catch { return fallback; } }
  function store(key, value) { localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value)); }
  function toast(message) { els.toast.textContent = message; els.toast.classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => els.toast.classList.remove('show'), 2400); }
  function cleanUrl(value) { return String(value || '').trim(); }
  function isHttpUrl(value) { try { const u = new URL(value); return u.protocol === 'http:' || u.protocol === 'https:'; } catch { return false; } }
  function getFavourites() { return new Set(safeJson(localStorage.getItem(KEYS.favourites), [])); }
  function activePlaylist() { return state.playlists.find(item => item.id === state.activeId); }

  function migrateLegacyPlaylist() {
    if (localStorage.getItem(KEYS.playlists)) return;
    const candidates = ['keytv.playlistUrl', 'keytv_playlist_url', 'playlistUrl', 'm3uUrl', 'iptvPlaylistUrl'];
    const legacyUrl = candidates.map(key => localStorage.getItem(key)).find(isHttpUrl);
    if (legacyUrl) {
      const migrated = [{ id: uid(), name: 'My Playlist', type: 'url', url: legacyUrl, updatedAt: Date.now(), channelCount: 0 }];
      store(KEYS.playlists, migrated); store(KEYS.active, migrated[0].id);
    }
  }

  function loadState() {
    migrateLegacyPlaylist();
    state.playlists = safeJson(localStorage.getItem(KEYS.playlists), []).filter(item => item && item.id && item.name && (item.url || item.content));
    state.activeId = localStorage.getItem(KEYS.active) || state.playlists[0]?.id || '';
    $('epgUrl').value = localStorage.getItem(KEYS.epg) || '';
    renderPlaylistSelect(); renderManager();
    if (state.activeId) loadPlaylist(state.activeId, { quiet: true }); else renderChannels();
  }

  function persistPlaylists() {
    store(KEYS.playlists, state.playlists);
    if (state.activeId) store(KEYS.active, state.activeId); else localStorage.removeItem(KEYS.active);
    renderPlaylistSelect(); renderManager();
  }

  function renderPlaylistSelect() {
    els.select.replaceChildren();
    if (!state.playlists.length) els.select.add(new Option('No saved playlist', ''));
    state.playlists.forEach(item => els.select.add(new Option(`${item.name}${item.channelCount ? ` — ${item.channelCount}` : ''}`, item.id)));
    els.select.value = state.activeId;
  }

  function renderManager() {
    els.managerList.replaceChildren();
    if (!state.playlists.length) {
      const empty = document.createElement('div'); empty.className = 'empty-state'; empty.textContent = 'No playlists saved yet.'; els.managerList.append(empty); return;
    }
    state.playlists.forEach(item => {
      const row = document.createElement('div'); row.className = `manager-item${item.id === state.activeId ? ' active' : ''}`;
      const meta = document.createElement('div'); const name = document.createElement('strong'); name.textContent = item.name;
      const detail = document.createElement('span'); detail.textContent = item.type === 'file' ? `${item.fileName || 'Uploaded M3U'} · ${item.channelCount || 0} channels` : `${item.url} · ${item.channelCount || 0} channels`;
      meta.append(name, detail);
      const actions = document.createElement('div'); actions.className = 'manager-actions';
      actions.append(managerButton(item.id === state.activeId ? 'Loaded' : 'Load', () => switchPlaylist(item.id), item.id === state.activeId), managerButton('Edit', () => openPlaylistDialog(item)), managerButton('Delete', () => deletePlaylist(item.id), false, true));
      row.append(meta, actions); els.managerList.append(row);
    });
  }

  function managerButton(label, action, disabled = false, danger = false) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.disabled = disabled; if (danger) button.className = 'danger'; button.addEventListener('click', action); return button;
  }

  function parseM3U(text) {
    const lines = String(text || '').replace(/^\uFEFF/, '').split(/\r?\n/);
    const channels = []; let info = null;
    for (const raw of lines) {
      const line = raw.trim(); if (!line) continue;
      if (line.startsWith('#EXTINF:')) {
        const comma = line.indexOf(','); const attrs = comma >= 0 ? line.slice(0, comma) : line; const attr = key => attrs.match(new RegExp(`${key}="([^"]*)"`, 'i'))?.[1]?.trim() || '';
        info = { name: (comma >= 0 ? line.slice(comma + 1).trim() : '') || attr('tvg-name') || 'Unnamed channel', logo: attr('tvg-logo'), group: attr('group-title') || 'Uncategorized', tvgId: attr('tvg-id') };
      } else if (!line.startsWith('#') && info) {
        channels.push({ ...info, url: line, id: `${info.tvgId || info.name}|${line}` }); info = null;
      }
    }
    return channels;
  }

  async function loadPlaylist(id, options = {}) {
    const playlist = state.playlists.find(item => item.id === id); if (!playlist) return;
    state.activeId = id; store(KEYS.active, id); clearPlayback();
    els.now.textContent = `Loading ${playlist.name}…`; els.nowCategory.textContent = 'Playlist'; showLoading(true); hideDiagnostic();
    try {
      let text;
      if (playlist.type === 'file') text = playlist.content;
      else {
        const response = await fetch(playlist.url, { cache: 'no-store' });
        if (!response.ok) throw new Error(`Playlist server returned HTTP ${response.status}.`);
        text = await response.text();
      }
      const channels = parseM3U(text);
      if (!channels.length) throw new Error('No playable channel entries were found in this M3U playlist.');
      state.channels = channels; playlist.channelCount = channels.length; playlist.updatedAt = Date.now(); persistPlaylists(); populateCategories(); renderChannels();
      els.now.textContent = playlist.name; els.nowCategory.textContent = `${channels.length} channels ready`; if (!options.quiet) toast(`Loaded ${channels.length} channels`);
    } catch (error) {
      state.channels = []; renderChannels(); els.now.textContent = playlist.name; els.nowCategory.textContent = 'Playlist could not be loaded';
      showDiagnostic('Playlist loading failed', error.message || 'The playlist could not be read.', playlist.type === 'url' ? 'The playlist host may be offline or may block browser requests (CORS). This app cannot bypass server restrictions.' : 'Try choosing the M3U file again.');
    } finally { showLoading(false); renderPlaylistSelect(); renderManager(); }
  }

  function populateCategories() {
    const current = els.category.value; const groups = [...new Set(state.channels.map(ch => ch.group || 'Uncategorized'))].sort((a, b) => a.localeCompare(b));
    els.category.replaceChildren(new Option('All categories', 'all')); groups.forEach(group => els.category.add(new Option(group, group))); els.category.value = groups.includes(current) ? current : 'all';
  }

  function renderChannels() {
    const query = els.search.value.trim().toLowerCase(); const group = els.category.value; const favourites = getFavourites();
    const filtered = state.channels.filter(ch => (!query || `${ch.name} ${ch.group}`.toLowerCase().includes(query)) && (group === 'all' || ch.group === group) && (!els.favouritesOnly.checked || favourites.has(ch.id)));
    els.list.replaceChildren(); els.empty.hidden = state.channels.length > 0; els.count.textContent = `${filtered.length} / ${state.channels.length} channels`;
    filtered.forEach(channel => {
      const row = document.createElement('div'); row.className = `channel-card${channel.url === state.selectedUrl ? ' active' : ''}`; row.title = channel.name; row.tabIndex = 0; row.setAttribute('role', 'button'); row.addEventListener('click', () => playChannel(channel)); row.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); playChannel(channel); } });
      const logo = channel.logo ? document.createElement('img') : document.createElement('span'); logo.className = `channel-logo${channel.logo ? '' : ' logo-fallback'}`;
      if (channel.logo) { logo.src = channel.logo; logo.alt = ''; logo.loading = 'lazy'; logo.referrerPolicy = 'no-referrer'; logo.addEventListener('error', () => { logo.removeAttribute('src'); logo.classList.add('logo-fallback'); logo.textContent = channel.name.slice(0, 1).toUpperCase(); }); } else logo.textContent = channel.name.slice(0, 1).toUpperCase();
      const text = document.createElement('span'); text.className = 'channel-text'; const name = document.createElement('span'); name.className = 'channel-name'; name.textContent = channel.name; const category = document.createElement('span'); category.className = 'channel-group'; category.textContent = channel.group || 'Uncategorized'; text.append(name, category);
      const star = document.createElement('button'); star.type = 'button'; star.className = 'favourite'; star.textContent = favourites.has(channel.id) ? '★' : '☆'; star.title = 'Toggle favourite'; star.addEventListener('click', event => { event.stopPropagation(); toggleFavourite(channel.id); });
      row.append(logo, text, star); els.list.append(row);
    });
  }

  function toggleFavourite(id) { const favourites = getFavourites(); favourites.has(id) ? favourites.delete(id) : favourites.add(id); store(KEYS.favourites, [...favourites]); renderChannels(); }
  function isHls(url) { return /\.m3u8(?:$|[?#])/i.test(url) || /(?:format|type)=m3u8/i.test(url); }
  function destroyHls() { if (state.hls) { state.hls.destroy(); state.hls = null; } }
  function clearPlayback() { clearTimeout(state.retryTimer); destroyHls(); els.video.pause(); els.video.removeAttribute('src'); els.video.load(); if (state.objectUrl) { URL.revokeObjectURL(state.objectUrl); state.objectUrl = ''; } state.selectedUrl = ''; state.retryCount = 0; }

  async function playChannel(channel, retrying = false) {
    if (!retrying) state.retryCount = 0;
    clearTimeout(state.retryTimer); destroyHls(); hideDiagnostic(); showLoading(true); els.placeholder.hidden = true;
    state.selectedUrl = channel.url; els.now.textContent = channel.name; els.nowCategory.textContent = channel.group || 'Uncategorized'; renderChannels();
    els.video.pause(); els.video.removeAttribute('src'); els.video.load();
    try {
      const nativeHls = Boolean(els.video.canPlayType('application/vnd.apple.mpegurl') || els.video.canPlayType('application/x-mpegURL'));
      if (isHls(channel.url) && !nativeHls) {
        await ensureHlsJs();
        if (!window.Hls?.isSupported()) throw new Error('This browser does not provide a compatible HLS playback engine.');
        const hls = state.hls = new window.Hls({ enableWorker: true, lowLatencyMode: true, backBufferLength: 30, maxBufferLength: 30 });
        hls.on(window.Hls.Events.MEDIA_ATTACHED, () => hls.loadSource(channel.url));
        hls.on(window.Hls.Events.MANIFEST_PARSED, () => els.video.play().catch(handleAutoplay));
        hls.on(window.Hls.Events.ERROR, (_event, data) => { if (data.fatal) handleHlsError(data, channel); });
        hls.attachMedia(els.video);
      } else {
        // Safari native HLS and direct media use the same path as V1.00.
        els.video.src = channel.url; els.video.load(); await els.video.play().catch(handleAutoplay);
      }
    } catch (error) { handlePlaybackFailure(channel, error.message); }
  }

  function handleAutoplay(error) {
    if (error?.name === 'NotAllowedError') { showLoading(false); showDiagnostic('Tap play to start', 'Safari prevented automatic playback.', 'Use the play button in the video controls.'); return; }
    throw error;
  }

  function ensureHlsJs() {
    if (window.Hls) return Promise.resolve();
    if (ensureHlsJs.promise) return ensureHlsJs.promise;
    ensureHlsJs.promise = new Promise((resolve, reject) => {
      const script = document.createElement('script'); script.src = 'https://cdn.jsdelivr.net/npm/hls.js@1.6.13/dist/hls.min.js'; script.crossOrigin = 'anonymous'; script.onload = resolve; script.onerror = () => reject(new Error('The optional HLS compatibility library could not be loaded.')); document.head.append(script);
    });
    return ensureHlsJs.promise;
  }

  function handleHlsError(data, channel) {
    const detail = `${data.type || 'HLS error'} / ${data.details || 'unknown'}`;
    if (data.type === window.Hls.ErrorTypes.NETWORK_ERROR && state.retryCount < 2) return scheduleRetry(channel, detail);
    if (data.type === window.Hls.ErrorTypes.MEDIA_ERROR && state.retryCount < 2) { state.retryCount += 1; state.hls?.recoverMediaError(); toast(`Recovering stream (${state.retryCount}/2)…`); return; }
    handlePlaybackFailure(channel, detail);
  }

  function scheduleRetry(channel, detail) {
    state.retryCount += 1; const delay = state.retryCount === 1 ? 1200 : 2500;
    showDiagnostic('Temporary stream problem', `Retrying automatically (${state.retryCount}/2)…`, detail); state.retryTimer = setTimeout(() => playChannel(channel, true), delay);
  }

  function handlePlaybackFailure(channel, technical = '') {
    showLoading(false); const error = els.video.error; let title = 'Playback failed'; let message = 'Safari could not play this stream.';
    if (error?.code === MediaError.MEDIA_ERR_NETWORK) { title = 'Network or access error'; message = 'The stream could not be downloaded. The server may be offline, require authorization, or block browser access (CORS).'; }
    else if (error?.code === MediaError.MEDIA_ERR_DECODE) { title = 'Codec or stream error'; message = 'Safari received the stream but could not decode its audio or video format.'; }
    else if (error?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) { title = 'Unsupported stream'; message = 'Safari does not support this stream format or codec, or the server refused browser playback.'; }
    if (state.retryCount < 2 && (!error || error.code === MediaError.MEDIA_ERR_NETWORK)) return scheduleRetry(channel, technical || message);
    showDiagnostic(title, message, `${technical ? `${technical}. ` : ''}KeyTV cannot bypass CORS, provider authentication, geo-blocking, DRM, or unsupported codecs.`);
  }

  function showLoading(show) { els.loading.hidden = !show; }
  function showDiagnostic(title, message, detail = '') { els.diagnosticTitle.textContent = title; els.diagnosticMessage.textContent = message; els.diagnosticDetail.textContent = detail; els.diagnostic.hidden = false; }
  function hideDiagnostic() { els.diagnostic.hidden = true; }

  function switchPlaylist(id) { if (!id || id === state.activeId) return; state.activeId = id; els.managerDialog.close(); loadPlaylist(id); }
  function deletePlaylist(id) {
    const playlist = state.playlists.find(item => item.id === id); if (!playlist || !confirm(`Delete “${playlist.name}”?`)) return;
    state.playlists = state.playlists.filter(item => item.id !== id); if (state.activeId === id) { state.activeId = state.playlists[0]?.id || ''; state.channels = []; clearPlayback(); if (state.activeId) loadPlaylist(state.activeId); else { persistPlaylists(); populateCategories(); renderChannels(); els.now.textContent = 'Choose a channel'; els.nowCategory.textContent = 'Ready'; } } else persistPlaylists();
    toast('Playlist deleted');
  }

  function setSourceMode(mode) {
    state.sourceMode = mode; $('urlSource').hidden = mode !== 'url'; $('fileSource').hidden = mode !== 'file'; $('urlTab').classList.toggle('active', mode === 'url'); $('fileTab').classList.toggle('active', mode === 'file'); $('urlTab').setAttribute('aria-selected', mode === 'url'); $('fileTab').setAttribute('aria-selected', mode === 'file');
  }

  function openPlaylistDialog(item = null) {
    els.formError.hidden = true; els.playlistForm.reset(); els.editingId.value = item?.id || ''; els.name.value = item?.name || ''; els.url.value = item?.url || ''; els.fileName.textContent = item?.fileName || 'No file selected'; $('dialogTitle').textContent = item ? 'Edit playlist' : 'Add playlist'; setSourceMode(item?.type || 'url'); els.managerDialog.close(); els.playlistDialog.showModal(); setTimeout(() => els.name.focus(), 30);
  }

  async function savePlaylist(event) {
    event.preventDefault(); if (event.submitter?.value === 'cancel') { els.playlistDialog.close(); return; }
    els.formError.hidden = true; const id = els.editingId.value; const existing = state.playlists.find(item => item.id === id); const name = els.name.value.trim();
    try {
      if (!name) throw new Error('Enter a playlist name.');
      let next;
      if (state.sourceMode === 'url') {
        const url = cleanUrl(els.url.value); if (!isHttpUrl(url)) throw new Error('Enter a valid http:// or https:// playlist URL.'); next = { ...(existing || {}), id: id || uid(), name, type: 'url', url, content: undefined, fileName: undefined, updatedAt: Date.now() };
      } else {
        const file = els.fileInput.files[0]; if (!file && !existing?.content) throw new Error('Choose an M3U or M3U8 file.'); const content = file ? await file.text() : existing.content; const channels = parseM3U(content); if (!channels.length) throw new Error('This file does not contain any valid #EXTINF channel entries.'); next = { ...(existing || {}), id: id || uid(), name, type: 'file', content, fileName: file?.name || existing.fileName, url: undefined, channelCount: channels.length, updatedAt: Date.now() };
      }
      const index = state.playlists.findIndex(item => item.id === next.id); if (index >= 0) state.playlists[index] = next; else state.playlists.push(next); state.activeId = next.id;
      try { persistPlaylists(); } catch (error) { if (error?.name === 'QuotaExceededError') throw new Error('This playlist is too large for browser storage. Try a playlist URL or a smaller M3U file.'); throw error; }
      els.playlistDialog.close(); await loadPlaylist(next.id); toast(index >= 0 ? 'Playlist updated' : 'Playlist saved');
    } catch (error) { els.formError.textContent = error.message || 'The playlist could not be saved.'; els.formError.hidden = false; }
  }

  async function loadEpg() {
    const url = cleanUrl($('epgUrl').value); if (!isHttpUrl(url)) { $('epgStatus').textContent = 'Enter a valid http:// or https:// XMLTV URL.'; return; }
    $('loadEpgBtn').disabled = true; $('epgStatus').textContent = 'Loading programme guide…';
    try { const response = await fetch(url, { cache: 'no-store' }); if (!response.ok) throw new Error(`HTTP ${response.status}`); const xml = new DOMParser().parseFromString(await response.text(), 'application/xml'); if (xml.querySelector('parsererror')) throw new Error('Invalid XMLTV document'); const programmes = xml.querySelectorAll('programme').length; store(KEYS.epg, url); $('epgStatus').textContent = `Programme guide loaded: ${programmes} programme entries.`; }
    catch (error) { $('epgStatus').textContent = `EPG could not be loaded (${error.message}). The server may block browser access.`; }
    finally { $('loadEpgBtn').disabled = false; }
  }

  function bindEvents() {
    els.select.addEventListener('change', () => switchPlaylist(els.select.value)); $('addPlaylistBtn').addEventListener('click', () => openPlaylistDialog()); $('managePlaylistsBtn').addEventListener('click', () => { renderManager(); els.managerDialog.showModal(); }); $('managerAddBtn').addEventListener('click', () => openPlaylistDialog()); $('closeManagerBtn').addEventListener('click', () => els.managerDialog.close());
    $('urlTab').addEventListener('click', () => setSourceMode('url')); $('fileTab').addEventListener('click', () => setSourceMode('file')); els.fileInput.addEventListener('change', () => { els.fileName.textContent = els.fileInput.files[0]?.name || 'No file selected'; }); els.playlistForm.addEventListener('submit', savePlaylist);
    [els.search, els.category, els.favouritesOnly].forEach(control => control.addEventListener(control === els.search ? 'input' : 'change', renderChannels));
    $('fullscreenBtn').addEventListener('click', () => { const target = els.video; if (target.webkitEnterFullscreen) target.webkitEnterFullscreen(); else els.frame.requestFullscreen?.(); });
    els.retry.addEventListener('click', () => { const channel = state.channels.find(ch => ch.url === state.selectedUrl); if (channel) { state.retryCount = 0; playChannel(channel); } });
    els.video.addEventListener('loadstart', () => showLoading(true)); els.video.addEventListener('waiting', () => showLoading(true)); els.video.addEventListener('playing', () => { showLoading(false); hideDiagnostic(); }); els.video.addEventListener('canplay', () => showLoading(false)); els.video.addEventListener('error', () => { const channel = state.channels.find(ch => ch.url === state.selectedUrl); if (channel) handlePlaybackFailure(channel); });
    $('movieFile').addEventListener('change', event => { const file = event.target.files[0]; if (!file) return; clearPlayback(); state.objectUrl = URL.createObjectURL(file); els.video.src = state.objectUrl; els.now.textContent = file.name; els.nowCategory.textContent = 'Local movie'; els.placeholder.hidden = true; hideDiagnostic(); els.video.play().catch(handleAutoplay); });
    $('loadEpgBtn').addEventListener('click', loadEpg);
  }

  bindEvents(); loadState();
  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('./sw.js').catch(() => {});
  console.info(`KeyTV V${VERSION}`);
})();
