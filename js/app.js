// AURA Outreach Application Logic Pro - Pure List CRM with Luxury Toggles & Isolated Instagram Video Slots
let currentRegion = 'all';
let currentFilter = 'all';
let currentSort = 'default';
let searchQuery = '';
let currentTheme = localStorage.getItem('aura_theme_v3') || 'dark';

let MESSAGE = localStorage.getItem('aura_custom_message') || `Ассалому алайкум! Яхшимисиз?
Сизга AURA эркаклар кийим дўкони номидан ҳамкорлик таклифи билан ёзаётгандик.`;

// Clean up any stale or corrupted 'undefined' keys from previous sessions
['aura_sent_all', 'aura_vouchers_all', 'aura_videos_all', 'aura_video_links', 'aura_trash_ids'].forEach(storageKey => {
  try {
    const raw = localStorage.getItem(storageKey);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        let changed = false;
        if ('undefined' in parsed) { delete parsed['undefined']; changed = true; }
        if ('' in parsed) { delete parsed['']; changed = true; }
        if (changed) {
          localStorage.setItem(storageKey, JSON.stringify(parsed));
        }
      }
    }
  } catch (e) {}
});

let sentStatus = JSON.parse(localStorage.getItem('aura_sent_all') || '{}');
let voucherStatus = JSON.parse(localStorage.getItem('aura_vouchers_all') || '{}');
let videoStatus = JSON.parse(localStorage.getItem('aura_videos_all') || '{}');
let videoLinks = JSON.parse(localStorage.getItem('aura_video_links') || '{}');
let trashStatus = JSON.parse(localStorage.getItem('aura_trash_ids') || '{}');
let customBloggers = JSON.parse(localStorage.getItem('aura_custom_bloggers') || '[]');

let editingVideoId = null;

function applyTheme(theme) {
  currentTheme = theme;
  localStorage.setItem('aura_theme_v3', theme);
  const btn = document.getElementById('themeToggleBtn');
  if (theme === 'light') {
    document.body.classList.remove('theme-dark');
    document.body.classList.add('theme-light');
    if (btn) btn.innerHTML = '🌙 Тёмная тема';
  } else {
    document.body.classList.remove('theme-light');
    document.body.classList.add('theme-dark');
    if (btn) btn.innerHTML = '☀️ Светлая тема';
  }
}

function toggleTheme() {
  const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
  applyTheme(newTheme);
  showToast(newTheme === 'dark' ? 'Включена тёмная тема' : 'Включена светлая тема');
}

function saveCustomMessage() {
  const msgEl = document.getElementById('sampleText');
  if (msgEl) {
    MESSAGE = msgEl.innerText.trim();
    localStorage.setItem('aura_custom_message', MESSAGE);
    showToast('Текст рассылки сохранен!');
  }
}

function copyMasterText() {
  const msgEl = document.getElementById('sampleText');
  const text = msgEl ? msgEl.innerText : MESSAGE;
  navigator.clipboard.writeText(text).then(() => {
    showToast('Текст рассылки скопирован в буфер обмена!');
  }).catch(() => {
    showToast('Скопировано!');
  });
}

function getAllBloggers() {
  const raw = [...QARSHI_BLOGGERS, ...BUKHARA_BLOGGERS, ...SAMARKAND_BLOGGERS, ...NO_CONTACTS, ...customBloggers];
  const seenIds = new Set();
  const seenHandles = new Set();
  const result = [];

  for (let i = 0; i < raw.length; i++) {
    const b = raw[i];
    if (!b) continue;

    // Normalized handle check to guarantee ZERO card duplication
    const handleClean = (b.handle || '').toLowerCase().trim();
    if (handleClean && seenHandles.has(handleClean)) {
      continue;
    }

    // Guarantee 100% strictly individual, unique ID for every card
    let bId = b.id;
    if (!bId || bId === 'undefined' || seenIds.has(bId)) {
      const prefix = b.city ? b.city.substring(0, 2) : 'b';
      const cleanH = handleClean ? handleClean.replace(/[^a-z0-9_]/g, '') : `card_${i}`;
      bId = `${prefix}_${cleanH}_${Date.now()}`;
      b.id = bId;
    }

    seenIds.add(bId);
    if (handleClean) seenHandles.add(handleClean);
    result.push(b);
  }

  return result;
}

function findBlogger(id) {
  if (!id) return null;
  return getAllBloggers().find(b => b.id === id);
}

function saveAllStatus() {
  // Ensure no 'undefined' key ever gets written
  delete sentStatus['undefined'];
  delete voucherStatus['undefined'];
  delete videoStatus['undefined'];
  delete videoLinks['undefined'];
  delete trashStatus['undefined'];

  localStorage.setItem('aura_sent_all', JSON.stringify(sentStatus));
  localStorage.setItem('aura_vouchers_all', JSON.stringify(voucherStatus));
  localStorage.setItem('aura_videos_all', JSON.stringify(videoStatus));
  localStorage.setItem('aura_video_links', JSON.stringify(videoLinks));
  localStorage.setItem('aura_trash_ids', JSON.stringify(trashStatus));
  saveStateToServer();
}

let isSavingState = false;

async function saveStateToServer() {
  if (isSavingState) return;
  isSavingState = true;
  try {
    await fetch(window.location.protocol === 'file:' ? 'http://localhost:3000/api/state' : '/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sent: sentStatus,
        vouchers: voucherStatus,
        videos: videoStatus,
        links: videoLinks,
        trash: trashStatus,
        custom: customBloggers
      })
    });
  } catch (e) {
  } finally {
    isSavingState = false;
  }
}

async function loadStateFromServer() {
  if (isSavingState) return;
  try {
    const res = await fetch(window.location.protocol === 'file:' ? 'http://localhost:3000/api/state' : '/api/state');
    if (!res.ok) return;
    const data = await res.json();
    if (!data || typeof data !== 'object') return;

    let hasDiff = false;

    if (data.sent && typeof data.sent === 'object') {
      delete data.sent['undefined'];
      if (JSON.stringify(sentStatus) !== JSON.stringify(data.sent)) {
        sentStatus = { ...data.sent };
        localStorage.setItem('aura_sent_all', JSON.stringify(sentStatus));
        hasDiff = true;
      }
    }

    if (data.vouchers && typeof data.vouchers === 'object') {
      delete data.vouchers['undefined'];
      if (JSON.stringify(voucherStatus) !== JSON.stringify(data.vouchers)) {
        voucherStatus = { ...data.vouchers };
        localStorage.setItem('aura_vouchers_all', JSON.stringify(voucherStatus));
        hasDiff = true;
      }
    }

    if (data.videos && typeof data.videos === 'object') {
      delete data.videos['undefined'];
      if (JSON.stringify(videoStatus) !== JSON.stringify(data.videos)) {
        videoStatus = { ...data.videos };
        localStorage.setItem('aura_videos_all', JSON.stringify(videoStatus));
        hasDiff = true;
      }
    }

    if (data.links && typeof data.links === 'object') {
      delete data.links['undefined'];
      if (JSON.stringify(videoLinks) !== JSON.stringify(data.links)) {
        videoLinks = { ...data.links };
        localStorage.setItem('aura_video_links', JSON.stringify(videoLinks));
        hasDiff = true;
      }
    }

    if (data.trash && typeof data.trash === 'object') {
      delete data.trash['undefined'];
      if (JSON.stringify(trashStatus) !== JSON.stringify(data.trash)) {
        trashStatus = { ...data.trash };
        localStorage.setItem('aura_trash_ids', JSON.stringify(trashStatus));
        hasDiff = true;
      }
    }

    if (Array.isArray(data.custom)) {
      if (JSON.stringify(customBloggers) !== JSON.stringify(data.custom)) {
        customBloggers = [...data.custom];
        localStorage.setItem('aura_custom_bloggers', JSON.stringify(customBloggers));
        hasDiff = true;
      }
    }

    if (hasDiff) {
      renderApp();
    }
  } catch (e) {}
}

function parseFollowerNumber(followersStr) {
  if (!followersStr) return 0;
  let str = followersStr.toString().toLowerCase().trim().replace(/\s+/g, '');
  if (str.endsWith('k') || str.endsWith('к')) {
    return parseFloat(str) * 1000;
  }
  if (str.endsWith('m') || str.endsWith('м')) {
    return parseFloat(str) * 1000000;
  }
  const clean = str.replace(/[^0-9.]/g, '');
  return parseFloat(clean) || 0;
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function highlightText(text, query) {
  if (!text) return '';
  if (!query) return escapeHtml(text);
  const escaped = escapeRegExp(query);
  const regex = new RegExp('(' + escaped + ')', 'gi');
  const safeText = escapeHtml(text);
  return safeText.replace(regex, '<mark class="search-hl">$1</mark>');
}

function escapeHtml(str) {
  if (!str) return '';
  return str.toString()
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/* Region Navigation */
function switchRegion(region) {
  currentRegion = region;
  document.querySelectorAll('.region-tab').forEach(t => t.classList.remove('active'));

  if (region === 'all') document.getElementById('tabAll')?.classList.add('active');
  if (region === 'qarshi') document.getElementById('tabQarshi')?.classList.add('active');
  if (region === 'bukhara') document.getElementById('tabBukhara')?.classList.add('active');
  if (region === 'samarkand') document.getElementById('tabSamarkand')?.classList.add('active');
  if (region === 'no_contacts') document.getElementById('tabNoContact')?.classList.add('active');
  if (region === 'trash') document.getElementById('tabTrash')?.classList.add('active');

  renderApp();
}

function setQuickFilter(filter, btnElem) {
  currentFilter = filter;
  document.querySelectorAll('.filter-chip').forEach(b => b.classList.remove('active'));
  if (btnElem) btnElem.classList.add('active');
  renderApp();
}

function onSortChange(sortVal) {
  currentSort = sortVal;
  renderApp();
}

function onSearchInput(val) {
  searchQuery = val.trim().toLowerCase();
  const clearBtn = document.getElementById('btnClearSearch');
  if (clearBtn) {
    clearBtn.style.display = searchQuery ? 'flex' : 'none';
  }
  renderApp();
}

function clearSearch() {
  const input = document.getElementById('searchMainInput');
  if (input) {
    input.value = '';
    onSearchInput('');
    input.focus();
  }
}

function getFilteredList() {
  let list = getAllBloggers();

  // 1. Filter by Region
  if (currentRegion === 'trash') {
    list = list.filter(b => !!trashStatus[b.id]);
  } else {
    list = list.filter(b => !trashStatus[b.id]);
    if (currentRegion !== 'all') {
      list = list.filter(b => b.city === currentRegion);
    }
  }

  // 2. Filter by Quick Status Chip
  if (currentFilter === 'pending') {
    list = list.filter(b => !sentStatus[b.id]);
  } else if (currentFilter === 'sent') {
    list = list.filter(b => !!sentStatus[b.id]);
  } else if (currentFilter === 'voucher') {
    list = list.filter(b => !!voucherStatus[b.id]);
  } else if (currentFilter === 'video') {
    list = list.filter(b => !!videoStatus[b.id] || !!videoLinks[b.id]);
  } else if (currentFilter === 'has_tg') {
    list = list.filter(b => !!b.tg);
  } else if (currentFilter === 'has_phone') {
    list = list.filter(b => !!b.phone);
  } else if (currentFilter === 'top_followers') {
    list = list.filter(b => parseFollowerNumber(b.followers) >= 50000);
  }

  // 3. Search Query Filter
  if (searchQuery) {
    list = list.filter(b => {
      const matchHandle = (b.handle || '').toLowerCase().includes(searchQuery);
      const matchTg = (b.tg || '').toLowerCase().includes(searchQuery);
      const matchPhone = (b.phone || '').toLowerCase().includes(searchQuery) || (b.phone2 || '').toLowerCase().includes(searchQuery);
      const matchNote = (b.note || '').toLowerCase().includes(searchQuery);
      const matchCity = (b.cityName || '').toLowerCase().includes(searchQuery);
      const matchFollowers = (b.followers || '').toString().toLowerCase().includes(searchQuery);
      const matchVideoLink = (videoLinks[b.id] || '').toLowerCase().includes(searchQuery);
      return matchHandle || matchTg || matchPhone || matchNote || matchCity || matchFollowers || matchVideoLink;
    });
  }

  // 4. Sorting
  if (currentSort === 'followers_desc') {
    list.sort((a, b) => parseFollowerNumber(b.followers) - parseFollowerNumber(a.followers));
  } else if (currentSort === 'followers_asc') {
    list.sort((a, b) => parseFollowerNumber(a.followers) - parseFollowerNumber(b.followers));
  } else if (currentSort === 'name_asc') {
    list.sort((a, b) => (a.handle || '').localeCompare(b.handle || ''));
  } else if (currentSort === 'pending_first') {
    list.sort((a, b) => (sentStatus[a.id] ? 1 : 0) - (sentStatus[b.id] ? 1 : 0));
  } else if (currentSort === 'voucher_first') {
    list.sort((a, b) => (voucherStatus[b.id] ? 1 : 0) - (voucherStatus[a.id] ? 1 : 0));
  } else if (currentSort === 'video_first') {
    list.sort((a, b) => ((videoStatus[b.id] || videoLinks[b.id]) ? 1 : 0) - ((videoStatus[a.id] || videoLinks[a.id]) ? 1 : 0));
  }

  return list;
}

function updateBadgesAndStats() {
  const all = getAllBloggers();
  const nonTrash = all.filter(b => !trashStatus[b.id]);
  const trashCount = all.filter(b => trashStatus[b.id]).length;

  const countAll = nonTrash.length;
  const countQarshi = nonTrash.filter(b => b.city === 'qarshi').length;
  const countBukhara = nonTrash.filter(b => b.city === 'bukhara').length;
  const countSamarkand = nonTrash.filter(b => b.city === 'samarkand').length;
  const countNoContact = nonTrash.filter(b => b.city === 'no_contacts').length;

  const badgeAll = document.getElementById('badgeAll');
  const badgeQ = document.getElementById('badgeQarshi');
  const badgeB = document.getElementById('badgeBukhara');
  const badgeS = document.getElementById('badgeSamarkand');
  const badgeNC = document.getElementById('badgeNoContact');
  const badgeT = document.getElementById('badgeTrash');

  if (badgeAll) badgeAll.innerText = countAll;
  if (badgeQ) badgeQ.innerText = countQarshi;
  if (badgeB) badgeB.innerText = countBukhara;
  if (badgeS) badgeS.innerText = countSamarkand;
  if (badgeNC) badgeNC.innerText = countNoContact;
  if (badgeT) badgeT.innerText = trashCount;

  // Active view stats
  let activeList = nonTrash;
  let titleText = '📊 Общий прогресс по всей базе (Все города)';
  if (currentRegion === 'qarshi') {
    activeList = nonTrash.filter(b => b.city === 'qarshi');
    titleText = '📍 Прогресс по Карши';
  } else if (currentRegion === 'bukhara') {
    activeList = nonTrash.filter(b => b.city === 'bukhara');
    titleText = '🕌 Прогресс по Бухаре';
  } else if (currentRegion === 'samarkand') {
    activeList = nonTrash.filter(b => b.city === 'samarkand');
    titleText = '🏛️ Прогресс по Самарканду';
  } else if (currentRegion === 'no_contacts') {
    activeList = nonTrash.filter(b => b.city === 'no_contacts');
    titleText = '🚫 Прогресс: Без контактов (Direct)';
  } else if (currentRegion === 'trash') {
    activeList = all.filter(b => !!trashStatus[b.id]);
    titleText = '🗑️ Корзина удалённых профилей';
  }

  const total = activeList.length;
  const sentCount = activeList.filter(b => sentStatus[b.id]).length;
  const voucherCount = activeList.filter(b => voucherStatus[b.id]).length;
  const videoCount = activeList.filter(b => videoStatus[b.id] || videoLinks[b.id]).length;
  const pct = total > 0 ? Math.round((sentCount / total) * 100) : 0;

  const titleEl = document.getElementById('progressTitle');
  const statsEl = document.getElementById('progressStatsText');
  const fillEl = document.getElementById('progressFill');

  if (titleEl) titleEl.innerText = titleText;
  if (statsEl) statsEl.innerText = `${sentCount} из ${total} отправлено (${pct}%)`;
  if (fillEl) fillEl.style.width = `${pct}%`;

  const mSent = document.getElementById('metricSentCount');
  const mVoucher = document.getElementById('metricVoucherCount');
  const mVideo = document.getElementById('metricVideoCount');

  if (mSent) mSent.innerText = `${sentCount} / ${total}`;
  if (mVoucher) mVoucher.innerText = `${voucherCount} / ${total}`;
  if (mVideo) mVideo.innerText = `${videoCount} / ${total}`;
}

function renderApp() {
  updateBadgesAndStats();

  const container = document.getElementById('listContainer');
  if (!container) return;

  const list = getFilteredList();

  // Update Found Badge in Search Bar
  const foundBadge = document.getElementById('searchFoundBadge');
  if (foundBadge) {
    if (searchQuery || currentFilter !== 'all') {
      foundBadge.style.display = 'inline-flex';
      foundBadge.innerText = `Найдено: ${list.length}`;
    } else {
      foundBadge.style.display = 'none';
    }
  }

  if (list.length === 0) {
    let emptyTitle = 'Ничего не найдено';
    let emptySub = 'Попробуйте изменить поисковый запрос или сбросить фильтры.';
    if (currentRegion === 'trash') {
      emptyTitle = 'Корзина пуста';
      emptySub = 'В корзине пока нет удалённых блогеров.';
    }

    container.innerHTML = `
      <div class="empty-state-box">
        <div style="font-size: 38px; margin-bottom: 12px;">🔍</div>
        <h3>${emptyTitle}</h3>
        <p>${emptySub}</p>
        ${searchQuery ? `<button class="btn-header btn-header-primary" onclick="clearSearch()">Очистить поиск</button>` : ''}
      </div>
    `;
    return;
  }

  let html = '';
  list.forEach((b, idx) => {
    // Guaranteed non-empty, strictly individual ID
    const bId = b.id || `b_${idx}`;
    const isSent = !!sentStatus[bId];
    const isVoucher = !!voucherStatus[bId];
    const isVideo = !!videoStatus[bId] || !!videoLinks[bId];
    const isTrash = !!trashStatus[bId];
    const rawVideoLink = videoLinks[bId] || '';
    const isEditingThisVideo = (editingVideoId === bId);

    const cleanUser = (b.tg || '').replace('@', '').replace('https://t.me/', '').trim();
    const cleanHandle = (b.handle || '').replace('@', '').trim();
    const igUrl = `https://www.instagram.com/${cleanHandle}/`;
    const directUrl = `https://ig.me/m/${cleanHandle}`;

    // Highlighted strings
    const hlHandle = highlightText(b.handle, searchQuery);
    const hlNote = highlightText(b.note || '—', searchQuery);
    const hlTg = highlightText(b.tg ? `@${cleanUser}` : '', searchQuery);
    const hlPhone = highlightText(b.phone || '', searchQuery);
    const hlCity = highlightText(b.cityName || '', searchQuery);

    const cityClass = `card-city-${b.city || 'qarshi'}`;

    let rowStatusClasses = [];
    if (isSent) rowStatusClasses.push('is-sent-item');
    if (isVoucher) rowStatusClasses.push('is-voucher-item');
    if (isVideo) rowStatusClasses.push('is-video-item');

    // Instagram video slot HTML - strictly bound to bId
    let videoSlotHtml = '';
    if (rawVideoLink && !isEditingThisVideo) {
      let displayUrl = rawVideoLink.replace(/^https?:\/\/(www\.)?instagram\.com\//, 'ig.com/');
      if (displayUrl.length > 38) {
        displayUrl = displayUrl.substring(0, 35) + '...';
      }
      const safeLink = escapeHtml(rawVideoLink);

      videoSlotHtml = `
        <div class="card-video-slot has-video-link" id="video_slot_${bId}">
          <div class="video-slot-label active">
            <span>🎬</span>
            <span>Видео Instagram:</span>
          </div>
          <div class="video-display-box">
            <a href="${safeLink}" target="_blank" class="video-url-pill" title="Открыть видео: ${safeLink}">
              <span class="video-pill-play">▶</span>
              <span class="video-pill-text">${highlightText(displayUrl, searchQuery)}</span>
              <span class="video-pill-arrow">↗</span>
            </a>
            <div class="video-actions-group">
              <a href="${safeLink}" target="_blank" class="btn-video-action btn-watch-video" title="Смотреть видео в Instagram">
                ▶ Открыть
              </a>
              <button class="btn-video-action btn-copy-video" onclick="copyVideoLink('${bId}')" title="Скопировать ссылку на видео">
                📋 Копировать
              </button>
              <button class="btn-video-action btn-edit-video" onclick="editVideoLink('${bId}')" title="Изменить ссылку">
                ✏️
              </button>
              <button class="btn-video-action btn-del-video" onclick="removeVideoLink('${bId}')" title="Удалить ссылку на видео">
                ✕
              </button>
            </div>
          </div>
        </div>
      `;
    } else if (isEditingThisVideo) {
      videoSlotHtml = `
        <div class="card-video-slot" id="video_slot_${bId}" style="border-color: #f59e0b; background: rgba(245, 158, 11, 0.08);">
          <div class="video-slot-label" style="color: #fbbf24;">
            <span>✏️</span>
            <span>Изменить ссылку IG:</span>
          </div>
          <div class="video-input-box">
            <input type="url" 
                   class="video-url-input" 
                   id="video_input_${bId}" 
                   placeholder="Вставьте ссылку на видео в Instagram (Reels / Пост)..." 
                   value="${escapeHtml(rawVideoLink)}"
                   onkeydown="if(event.key==='Enter') saveVideoLinkFromInput('${bId}')">
            <button class="btn-video-sub btn-paste" onclick="pasteVideoLink('${bId}')" title="Вставить из буфера">
              📋 Вставить
            </button>
            <button class="btn-video-sub btn-save" onclick="saveVideoLinkFromInput('${bId}')" title="Сохранить изменения">
              💾 Сохранить
            </button>
            <button class="btn-video-sub btn-cancel" onclick="cancelEditVideoLink()" title="Отмена">
              Отмена
            </button>
          </div>
        </div>
      `;
    } else {
      videoSlotHtml = `
        <div class="card-video-slot" id="video_slot_${bId}">
          <div class="video-slot-label">
            <span>📸</span>
            <span>Ссылка на видео IG:</span>
          </div>
          <div class="video-input-box">
            <input type="url" 
                   class="video-url-input" 
                   id="video_input_${bId}" 
                   placeholder="Вставьте ссылку на Reels / публикацию в Instagram..." 
                   value=""
                   onkeydown="if(event.key==='Enter') saveVideoLinkFromInput('${bId}')">
            <button class="btn-video-sub btn-paste" onclick="pasteVideoLink('${bId}')" title="Вставить из буфера обмена">
              📋 Вставить
            </button>
            <button class="btn-video-sub btn-save" onclick="saveVideoLinkFromInput('${bId}')" title="Сохранить ссылку">
              💾 Сохранить
            </button>
          </div>
        </div>
      `;
    }

    html += `
      <div class="blogger-list-item ${rowStatusClasses.join(' ')}" id="card_${bId}">
        <!-- Row 1: Profile info, Contacts, Status switches -->
        <div class="blogger-list-row-main">
          <!-- Left Part: Num, City, Profile, Bio -->
          <div class="list-item-left">
            <span class="list-item-num">#${idx + 1}</span>
            <span class="card-city-badge ${cityClass}">${hlCity || b.cityName || 'Блогер'}</span>
            <div class="list-item-main">
              <a href="${igUrl}" target="_blank" class="blogger-handle-link">
                ${hlHandle} <span style="font-size: 10px; opacity: 0.7;">↗</span>
              </a>
              <div class="list-item-sub">
                ${b.followers ? `<span class="col-followers-tag">👥 ${highlightText(b.followers, searchQuery)}</span> • ` : ''}
                <span class="col-bio-text" title="${escapeHtml(b.note || '')}">${hlNote}</span>
              </div>
            </div>
          </div>

          <!-- Center Part: Contact 1-click buttons -->
          <div class="list-item-center">
            ${cleanUser ? `
              <button class="btn-contact btn-tg" onclick="openTgUser('${cleanUser}', '${bId}')" title="Открыть Telegram">
                ✈️ ${hlTg}
              </button>
            ` : ''}

            ${b.phone ? `
              <button class="btn-contact btn-phone" onclick="openTgPhone('${b.phone}', '${bId}')" title="Позвонить / TG">
                📞 ${hlPhone}
              </button>
            ` : ''}

            ${b.phone2 ? `
              <button class="btn-contact btn-phone" onclick="openTgPhone('${b.phone2}', '${bId}')" title="Доп. номер">
                📞 ${highlightText(b.phone2, searchQuery)}
              </button>
            ` : ''}

            <a href="${directUrl}" target="_blank" class="btn-contact btn-direct" onclick="markDirectSent('${bId}')" title="Написать в Direct">
              💬 Direct
            </a>
          </div>

          <!-- Right Part: State-of-the-art Luxury Animated Switches -->
          <div class="list-item-right">
            <!-- 1. Message Sent Switch -->
            <div class="lux-switch-pill ${isSent ? 'is-active-sent' : ''}" onclick="toggleStatus('sent', '${bId}')" title="Отметить отправку сообщения">
              <div class="lux-toggle-track">
                <div class="lux-toggle-thumb"></div>
              </div>
              <span>✉️ Отправлено</span>
            </div>

            <!-- 2. Voucher Switch -->
            <div class="lux-switch-pill ${isVoucher ? 'is-active-voucher' : ''}" onclick="toggleStatus('voucher', '${bId}')" title="Отметить выдачу ваучера">
              <div class="lux-toggle-track">
                <div class="lux-toggle-thumb"></div>
              </div>
              <span>🎟️ Ваучер</span>
            </div>

            <!-- 3. Video Switch -->
            <div class="lux-switch-pill ${isVideo ? 'is-active-video' : ''}" onclick="toggleStatus('video', '${bId}')" title="Отметить снятое видео">
              <div class="lux-toggle-track">
                <div class="lux-toggle-thumb"></div>
              </div>
              <span>🎬 Видео</span>
            </div>

            <!-- Trash / Restore -->
            ${isTrash ? `
              <div style="display: inline-flex; gap: 4px; align-items: center;">
                <button class="btn-header" onclick="restoreBlogger('${bId}', event)" style="font-size: 11px; padding: 4px 8px;" title="Восстановить карточку">
                  🔄
                </button>
                <button class="btn-delete-card" onclick="permanentDeleteBlogger('${bId}', event)" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3); font-size: 11px; padding: 3px 6px;" title="Удалить навсегда">
                  ❌
                </button>
              </div>
            ` : `
              <button class="btn-delete-card" onclick="deleteBlogger('${bId}', event)" title="Переместить в корзину">🗑️</button>
            `}
          </div>
        </div>

        <!-- Row 2: Instagram Video Link Slot (100% individual for this blogger) -->
        ${videoSlotHtml}
      </div>
    `;
  });

  container.innerHTML = html;
}

/* Actions */
function openTgUser(username, id) {
  if (!id || id === 'undefined') return;
  const msg = MESSAGE;
  const encodedMsg = encodeURIComponent(msg);
  const cleanUser = username.replace('@', '').replace('https://t.me/', '').trim();

  navigator.clipboard.writeText(msg).catch(() => {});

  sentStatus[id] = true;
  saveAllStatus();
  updateBadgesAndStats();

  const card = document.getElementById(`card_${id}`);
  if (card) {
    const sw = card.querySelector('.lux-switch-pill:nth-child(1)');
    if (sw) sw.classList.add('is-active-sent');
    card.classList.add('is-sent-item');
  }

  showToast(`Текст скопирован! Открываю @${cleanUser}...`);

  const tgUrl = `tg://resolve?domain=${cleanUser}&text=${encodedMsg}`;
  window.location.href = tgUrl;

  setTimeout(() => {
    window.open(`https://t.me/${cleanUser}`, '_blank');
  }, 700);
}

function openTgPhone(phone, id) {
  if (!id || id === 'undefined') return;
  const msg = MESSAGE;
  const cleanPhone = phone.replace(/[^0-9]/g, '');

  navigator.clipboard.writeText(msg).catch(() => {});

  sentStatus[id] = true;
  saveAllStatus();
  updateBadgesAndStats();

  const card = document.getElementById(`card_${id}`);
  if (card) {
    const sw = card.querySelector('.lux-switch-pill:nth-child(1)');
    if (sw) sw.classList.add('is-active-sent');
    card.classList.add('is-sent-item');
  }

  showToast(`Текст скопирован! Открываю Telegram по номеру...`);

  if (cleanPhone) {
    window.location.href = `tg://resolve?phone=${cleanPhone}`;
    setTimeout(() => {
      window.open(`https://t.me/+${cleanPhone}`, '_blank');
    }, 700);
  }
}

function markDirectSent(id) {
  if (!id || id === 'undefined') return;
  navigator.clipboard.writeText(MESSAGE).catch(() => {});
  sentStatus[id] = true;
  saveAllStatus();
  updateBadgesAndStats();

  const card = document.getElementById(`card_${id}`);
  if (card) {
    const sw = card.querySelector('.lux-switch-pill:nth-child(1)');
    if (sw) sw.classList.add('is-active-sent');
    card.classList.add('is-sent-item');
  }

  showToast('Текст скопирован в буфер! Открываю Direct...');
}

function toggleStatus(type, id) {
  if (!id || id === 'undefined') return;
  let state = false;
  if (type === 'sent') {
    sentStatus[id] = !sentStatus[id];
    state = sentStatus[id];
  } else if (type === 'voucher') {
    voucherStatus[id] = !voucherStatus[id];
    state = voucherStatus[id];
  } else if (type === 'video') {
    videoStatus[id] = !videoStatus[id];
    state = videoStatus[id];
  }

  saveAllStatus();
  updateBadgesAndStats();

  const card = document.getElementById(`card_${id}`);
  if (card) {
    if (type === 'sent') {
      const sw = card.querySelector('.lux-switch-pill:nth-child(1)');
      if (sw) sw.classList.toggle('is-active-sent', state);
      card.classList.toggle('is-sent-item', state);
      showToast(state ? '✉️ Отмечено: Отправлено' : 'Снят статус отправки');
    } else if (type === 'voucher') {
      const sw = card.querySelector('.lux-switch-pill:nth-child(2)');
      if (sw) sw.classList.toggle('is-active-voucher', state);
      card.classList.toggle('is-voucher-item', state);
      showToast(state ? '🎟️ Отмечено: Ваучер выдан' : 'Снят статус ваучера');
    } else if (type === 'video') {
      const sw = card.querySelector('.lux-switch-pill:nth-child(3)');
      if (sw) sw.classList.toggle('is-active-video', state);
      card.classList.toggle('is-video-item', state || !!videoLinks[id]);
      showToast(state ? '🎬 Отмечено: Видео снято!' : 'Снят статус видео');
    }
  }
}

/* Video Link Management - 100% Isolated by individual Blogger ID */
function cleanVideoUrl(rawUrl) {
  let url = (rawUrl || '').trim();
  if (!url) return '';
  if (!url.startsWith('http://') && !url.startsWith('https://')) {
    url = 'https://' + url;
  }
  return url;
}

function saveVideoLink(id, rawUrl) {
  if (!id || id === 'undefined') {
    showToast('Ошибка: не указан ID блогера');
    return;
  }
  const url = cleanVideoUrl(rawUrl);
  if (!url) {
    showToast('Введите или вставьте ссылку на видео!');
    return;
  }

  videoLinks[id] = url;
  videoStatus[id] = true; // Auto-activate video status for this blogger only
  editingVideoId = null;

  saveAllStatus();
  renderApp();
  showToast('🎬 Ссылка на видео сохранена для этой карточки ✓');
}

function saveVideoLinkFromInput(id) {
  if (!id || id === 'undefined') return;
  const input = document.getElementById(`video_input_${id}`);
  if (input) {
    saveVideoLink(id, input.value);
  }
}

async function pasteVideoLink(id) {
  if (!id || id === 'undefined') return;
  try {
    const text = await navigator.clipboard.readText();
    if (text && text.trim()) {
      saveVideoLink(id, text.trim());
      showToast('Ссылка вставлена из буфера и сохранена!');
      return;
    }
  } catch (err) {
    // Clipboard read not permitted
  }

  const input = document.getElementById(`video_input_${id}`);
  if (input) {
    input.focus();
    showToast('Нажмите Ctrl+V для вставки ссылки');
  }
}

function copyVideoLink(id) {
  if (!id || id === 'undefined') return;
  const url = videoLinks[id];
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Ссылка на видео скопирована в буфер!');
  }).catch(() => {
    showToast('Скопировано!');
  });
}

function editVideoLink(id) {
  if (!id || id === 'undefined') return;
  editingVideoId = id;
  renderApp();
  setTimeout(() => {
    const input = document.getElementById(`video_input_${id}`);
    if (input) {
      input.focus();
      input.select();
    }
  }, 50);
}

function cancelEditVideoLink() {
  editingVideoId = null;
  renderApp();
}

function removeVideoLink(id) {
  if (!id || id === 'undefined') return;
  delete videoLinks[id];
  editingVideoId = null;
  saveAllStatus();
  renderApp();
  showToast('Ссылка на видео удалена с этой карточки');
}

function deleteBlogger(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!id || id === 'undefined') return;

  const b = findBlogger(id);
  const name = b ? b.handle : 'Блогер';

  trashStatus[id] = true;
  saveAllStatus();
  renderApp();
  showToast(`🗑️ ${name} перемещен(а) в корзину`);
}

function restoreBlogger(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!id || id === 'undefined') return;

  const b = findBlogger(id);
  const name = b ? b.handle : 'Блогер';

  delete trashStatus[id];
  saveAllStatus();
  renderApp();
  showToast(`🔄 ${name} восстановлен(а) из корзины`);
}

function permanentDeleteBlogger(id, event) {
  if (event) {
    event.stopPropagation();
    event.preventDefault();
  }
  if (!id || id === 'undefined') return;

  const b = findBlogger(id);
  const name = b ? b.handle : 'эту карточку';

  if (!confirm(`Вы точно хотите НАВСЕГДА удалить карточку ${name}?`)) {
    return;
  }

  // Remove from customBloggers if present
  customBloggers = customBloggers.filter(item => item.id !== id && (b ? item.handle !== b.handle : true));
  localStorage.setItem('aura_custom_bloggers', JSON.stringify(customBloggers));

  // Remove all statuses
  delete trashStatus[id];
  delete sentStatus[id];
  delete voucherStatus[id];
  delete videoStatus[id];
  delete videoLinks[id];

  saveAllStatus();
  renderApp();
  showToast(`❌ Карточка ${name} навсегда удалена`);
}

function emptyAllTrash() {
  const trashedCount = Object.keys(trashStatus).length;
  if (trashedCount === 0) {
    showToast('Корзина уже пуста');
    return;
  }

  if (!confirm(`Очистить корзину? Будет навсегда удалено ${trashedCount} карточек.`)) {
    return;
  }

  const trashedIds = Object.keys(trashStatus);
  customBloggers = customBloggers.filter(b => !trashStatus[b.id]);
  localStorage.setItem('aura_custom_bloggers', JSON.stringify(customBloggers));

  trashedIds.forEach(id => {
    delete trashStatus[id];
    delete sentStatus[id];
    delete voucherStatus[id];
    delete videoStatus[id];
    delete videoLinks[id];
  });

  saveAllStatus();
  renderApp();
  showToast('Корзина полностью очищена');
}

/* Modal Management */
function openAddModal() {
  document.getElementById('addModalOverlay').classList.add('open');
  document.getElementById('modalSearchHandle').value = '';
  document.getElementById('modalCheckResult').style.display = 'none';
  document.getElementById('modalAddForm').style.display = 'none';
  setTimeout(() => document.getElementById('modalSearchHandle').focus(), 100);
}

function closeAddModal() {
  document.getElementById('addModalOverlay').classList.remove('open');
}

function closeAddModalOnBackdrop(e) {
  if (e.target.id === 'addModalOverlay') closeAddModal();
}

function checkBloggerExists() {
  let val = document.getElementById('modalSearchHandle').value.trim().toLowerCase();
  if (!val) {
    showToast('Введите username для проверки!');
    return;
  }
  if (!val.startsWith('@')) val = '@' + val;

  const all = getAllBloggers();
  const existing = all.find(b => (b.handle || '').toLowerCase() === val);
  const resEl = document.getElementById('modalCheckResult');
  const formEl = document.getElementById('modalAddForm');

  if (existing) {
    const cityNames = { qarshi: 'Карши', bukhara: 'Бухара', samarkand: 'Самарканд', no_contacts: 'Без контактов' };
    resEl.style.display = 'block';
    resEl.style.background = 'rgba(239, 68, 68, 0.15)';
    resEl.style.border = '1px solid rgba(239, 68, 68, 0.3)';
    resEl.style.color = '#f87171';
    resEl.innerHTML = `⚠️ <b>${escapeHtml(existing.handle)}</b> уже есть в базе (${cityNames[existing.city] || 'База'})! Повторно добавлять не нужно.`;
    formEl.style.display = 'none';
  } else {
    resEl.style.display = 'block';
    resEl.style.background = 'rgba(16, 185, 129, 0.15)';
    resEl.style.border = '1px solid rgba(16, 185, 129, 0.3)';
    resEl.style.color = '#34d399';
    resEl.innerHTML = `✓ <b>${escapeHtml(val)}</b> свободен! Заполните данные ниже для добавления в базу.`;
    formEl.style.display = 'block';
  }
}

function submitNewBlogger() {
  let val = document.getElementById('modalSearchHandle').value.trim();
  if (!val.startsWith('@')) val = '@' + val;
  const city = document.getElementById('modalCitySelect').value;
  const tg = document.getElementById('modalTgInput').value.trim().replace('@', '');
  const phone = document.getElementById('modalPhoneInput').value.trim();
  const followers = document.getElementById('modalFollowersInput').value.trim();
  const note = document.getElementById('modalNoteInput').value.trim();

  const cityNames = { qarshi: 'Карши', bukhara: 'Бухара', samarkand: 'Самарканд', no_contacts: 'Без контактов' };

  const cleanH = val.replace(/[^a-zA-Z0-9_]/g, '');
  const newB = {
    id: `custom_${cleanH}_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
    handle: val,
    city: city,
    cityName: cityNames[city] || 'Карши',
    tg: tg || null,
    phone: phone || null,
    followers: followers || null,
    note: note || null
  };

  customBloggers.push(newB);
  localStorage.setItem('aura_custom_bloggers', JSON.stringify(customBloggers));

  closeAddModal();
  renderApp();
  showToast(`Блогер ${val} успешно добавлен в базу!`);
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  const toastMsg = document.getElementById('toastMsg');
  if (!toast || !toastMsg) return;

  toastMsg.innerText = msg;
  toast.classList.add('show');
  clearTimeout(window.__toastTimer);
  window.__toastTimer = setTimeout(() => {
    toast.classList.remove('show');
  }, 2600);
}

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
  if (e.key === '/' && document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA') {
    e.preventDefault();
    const searchInput = document.getElementById('searchMainInput');
    if (searchInput) {
      searchInput.focus();
      searchInput.select();
    }
  }
});

// Initialization
document.addEventListener('DOMContentLoaded', () => {
  applyTheme(currentTheme);
  const msgEl = document.getElementById('sampleText');
  if (msgEl) msgEl.innerText = MESSAGE;
  renderApp();
  loadStateFromServer();
  setInterval(loadStateFromServer, 3000);
});
