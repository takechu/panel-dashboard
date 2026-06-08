// ==================== Constants ====================

const GRID_STEP = 5; // percentage

function snap(value) {
  return Math.round(value / GRID_STEP) * GRID_STEP;
}

const ZOOM_STEPS = [0.25, 0.33, 0.50, 0.67, 0.75, 0.90, 1.0, 1.10, 1.25, 1.50, 1.75, 2.0];

function formatZoom(zoom) {
  return Math.round((zoom || 1.0) * 100) + '%';
}

function getZoomIndex(zoom) {
  const z = zoom || 1.0;
  let closest = 6; // index of 1.0
  let minDiff = Infinity;
  ZOOM_STEPS.forEach((s, i) => {
    const diff = Math.abs(s - z);
    if (diff < minDiff) { minDiff = diff; closest = i; }
  });
  return closest;
}

function applyZoom(tile, tileEl) {
  const zoom = tile.zoom || 1.0;
  const iframe = tileEl.querySelector('iframe');
  const label  = tileEl.querySelector('.tile-zoom-label');
  const pct = (100 / zoom).toFixed(4) + '%';
  iframe.style.width           = pct;
  iframe.style.height          = pct;
  iframe.style.transform       = `scale(${zoom})`;
  iframe.style.transformOrigin = 'top left';
  if (label) label.textContent = formatZoom(zoom);
  flashZoomIndicator(tileEl, formatZoom(zoom));
}

function flashZoomIndicator(tileEl, text) {
  const indicator = tileEl.querySelector('.tile-zoom-indicator');
  if (!indicator) return;
  indicator.textContent = text;
  indicator.classList.remove('visible');
  indicator.offsetWidth; // reflow to restart animation
  indicator.classList.add('visible');
}

function stepZoom(tile, tileEl, direction) {
  const idx = getZoomIndex(tile.zoom);
  const next = idx + direction;
  if (next < 0 || next >= ZOOM_STEPS.length) return;
  tile.zoom = ZOOM_STEPS[next];
  applyZoom(tile, tileEl);
  saveState();
}

// ==================== State ====================

let state = {
  dashboards: [],
  activeDashboardId: null,
  savedUrls: []
};
let activeDashboard = null;
let isDashboardMode = false;

// ==================== DOM ====================

const canvas = document.getElementById('canvas');
const dashboardSelect = document.getElementById('dashboard-select');
const btnAddTile = document.getElementById('btn-add-tile');
const btnAddCurrentTab = document.getElementById('btn-add-current-tab');
const btnAddFromLibrary = document.getElementById('btn-add-from-library');
const btnToggleMode = document.getElementById('btn-toggle-mode');
const btnNewDashboard = document.getElementById('btn-new-dashboard');
const btnRenameDashboard = document.getElementById('btn-rename-dashboard');
const btnDeleteDashboard = document.getElementById('btn-delete-dashboard');
const btnSave = document.getElementById('btn-save');
const shortcutHint = document.getElementById('shortcut-hint');

// Tile add modal
const modalOverlay = document.getElementById('modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalUrl = document.getElementById('modal-url');
const modalLabel = document.getElementById('modal-label');
const modalCancel = document.getElementById('modal-cancel');
const modalOk = document.getElementById('modal-ok');
const tabList = document.getElementById('tab-list');

// Library modal
const libraryOverlay = document.getElementById('library-overlay');
const libraryList = document.getElementById('library-list');
const libraryClose = document.getElementById('library-close');
const goToOptions = document.getElementById('go-to-options');

// ==================== Storage ====================

async function loadState() {
  const data = await chrome.storage.local.get('panelDashboard');
  if (data.panelDashboard) {
    state = data.panelDashboard;
  }
  if (!state.dashboards) state.dashboards = [];
  if (!state.savedUrls) state.savedUrls = [];

  if (state.dashboards.length === 0) {
    const d = createDashboardObj('Dashboard 1');
    state.dashboards.push(d);
    state.activeDashboardId = d.id;
  }
  if (!state.activeDashboardId || !state.dashboards.find(d => d.id === state.activeDashboardId)) {
    state.activeDashboardId = state.dashboards[0].id;
  }

  activeDashboard = state.dashboards.find(d => d.id === state.activeDashboardId);
  renderAll();
}

async function saveState() {
  await chrome.storage.local.set({ panelDashboard: state });
}

// ==================== Utils ====================

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function createDashboardObj(name) {
  return { id: generateId(), name, tiles: [] };
}

function escapeAttr(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function normalizeUrl(url) {
  url = url.trim();
  if (!url) return '';
  if (/^https?:\/\//.test(url) || /^chrome(-extension)?:\/\//.test(url)) return url;
  return 'https://' + url;
}

// ==================== Render ====================

function renderAll() {
  renderDashboardSelect();
  renderTiles();
  updateEmptyState();
}

function renderDashboardSelect() {
  dashboardSelect.innerHTML = '';
  state.dashboards.forEach(d => {
    const opt = document.createElement('option');
    opt.value = d.id;
    opt.textContent = d.name;
    if (d.id === state.activeDashboardId) opt.selected = true;
    dashboardSelect.appendChild(opt);
  });
}

function renderTiles() {
  canvas.querySelectorAll('.tile').forEach(el => el.remove());
  if (activeDashboard) {
    activeDashboard.tiles.forEach(tile => createTileElement(tile));
  }
}

function updateEmptyState() {
  const empty = document.getElementById('empty-state');
  const hasTiles = activeDashboard && activeDashboard.tiles.length > 0;
  empty.style.display = hasTiles ? 'none' : 'block';
}

// ==================== Tile Creation ====================

function getNextTilePosition() {
  const n = activeDashboard.tiles.length;
  // Cascade diagonally in GRID_STEP increments, cycling every 8 steps
  const step = n % 8;
  return {
    x: step * GRID_STEP,
    y: step * GRID_STEP,
    width: 45,
    height: 45
  };
}

function createTileElement(tile) {
  const el = document.createElement('div');
  el.className = 'tile';
  el.id = `tile-${tile.id}`;
  el.style.left   = tile.x + '%';
  el.style.top    = tile.y + '%';
  el.style.width  = tile.width + '%';
  el.style.height = tile.height + '%';

  el.innerHTML = `
    <div class="tile-header">
      <span class="tile-drag-handle">⠿</span>
      <span class="tile-title" title="${escapeAttr(tile.title || tile.url)}">${escapeAttr(tile.title || tile.url)}</span>
      <button class="tile-header-btn tile-reload-btn" title="再読み込み">↺</button>
      <button class="tile-header-btn tile-close-btn" title="閉じる">✕</button>
    </div>
    <div class="tile-body">
      <iframe
        src="${escapeAttr(tile.url)}"
        title="${escapeAttr(tile.title || '')}"
        sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-pointer-lock allow-top-navigation-by-user-activation">
      </iframe>
    </div>
    <div class="tile-controls-overlay">
      <button class="tile-zoom-btn tile-zoom-out-btn" title="縮小">−</button>
      <span class="tile-zoom-label">${formatZoom(tile.zoom)}</span>
      <button class="tile-zoom-btn tile-zoom-in-btn" title="拡大">＋</button>
    </div>
    <div class="tile-zoom-indicator"></div>
    <div class="resize-handle resize-n"></div>
    <div class="resize-handle resize-e"></div>
    <div class="resize-handle resize-s"></div>
    <div class="resize-handle resize-w"></div>
    <div class="resize-handle resize-nw"></div>
    <div class="resize-handle resize-ne"></div>
    <div class="resize-handle resize-se"></div>
    <div class="resize-handle resize-sw"></div>
  `;

  const header = el.querySelector('.tile-header');
  header.addEventListener('mousedown', e => {
    if (e.target.closest('button')) return;
    startDrag(e, tile, el);
  });

  el.querySelectorAll('.resize-handle').forEach(handle => {
    handle.addEventListener('mousedown', e => startResize(e, tile, el, handle));
  });

  el.querySelector('.tile-close-btn').addEventListener('click', () => removeTile(tile.id));
  el.querySelector('.tile-reload-btn').addEventListener('click', () => {
    const iframe = el.querySelector('iframe');
    const src = iframe.src;
    iframe.src = '';
    requestAnimationFrame(() => { iframe.src = src; });
  });

  el.querySelector('.tile-zoom-out-btn').addEventListener('click', () => stepZoom(tile, el, -1));
  el.querySelector('.tile-zoom-in-btn').addEventListener('click',  () => stepZoom(tile, el, +1));

  // ズームを初期適用（zoom が 1.0 以外のタイルをロードしたとき）
  if ((tile.zoom || 1.0) !== 1.0) applyZoom(tile, el);

  canvas.appendChild(el);
  return el;
}

// ==================== Tile CRUD ====================

function addTile(url, title) {
  url = normalizeUrl(url);
  if (!url) return;

  const pos = getNextTilePosition();
  const tile = {
    id: generateId(),
    url,
    title: title || url,
    zoom: 1.0,
    ...pos
  };

  activeDashboard.tiles.push(tile);
  createTileElement(tile);
  updateEmptyState();
  saveState();
}

function removeTile(tileId) {
  activeDashboard.tiles = activeDashboard.tiles.filter(t => t.id !== tileId);
  const el = document.getElementById(`tile-${tileId}`);
  if (el) el.remove();
  updateEmptyState();
  saveState();
}

// ==================== Drag ====================

function startDrag(e, tile, el) {
  e.preventDefault();
  const canvasRect = canvas.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const origX = tile.x;
  const origY = tile.y;

  document.body.classList.add('interacting');
  el.style.zIndex = 100;

  function onMove(e) {
    const dx = ((e.clientX - startX) / canvasRect.width)  * 100;
    const dy = ((e.clientY - startY) / canvasRect.height) * 100;
    tile.x = snap(Math.max(0, Math.min(100 - tile.width,  origX + dx)));
    tile.y = snap(Math.max(0, Math.min(100 - tile.height, origY + dy)));
    el.style.left = tile.x + '%';
    el.style.top  = tile.y + '%';
  }

  function onUp() {
    document.body.classList.remove('interacting');
    el.style.zIndex = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    saveState();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ==================== Resize ====================

function startResize(e, tile, el, handle) {
  e.preventDefault();
  e.stopPropagation();

  const canvasRect = canvas.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const orig = { x: tile.x, y: tile.y, w: tile.width, h: tile.height };

  // Determine directions from class name, e.g. "resize-handle resize-se" → "se"
  const dir = handle.className.split(' ').find(c => c.startsWith('resize-') && c !== 'resize-handle').replace('resize-', '');

  document.body.classList.add('interacting');
  el.style.zIndex = 100;

  function onMove(e) {
    const dx = ((e.clientX - startX) / canvasRect.width)  * 100;
    const dy = ((e.clientY - startY) / canvasRect.height) * 100;

    let { x, y, w, h } = orig;

    // East: snap right edge = snap(orig right + dx), width follows
    if (dir.includes('e')) {
      w = snap(Math.max(GRID_STEP, orig.w + dx));
    }
    // West: snap left edge, keep right edge fixed
    if (dir.includes('w')) {
      x = snap(Math.max(0, orig.x + dx));
      x = Math.min(x, orig.x + orig.w - GRID_STEP);
      w = orig.x + orig.w - x;
    }
    // South: snap bottom edge = snap(orig bottom + dy), height follows
    if (dir.includes('s')) {
      h = snap(Math.max(GRID_STEP, orig.h + dy));
    }
    // North: snap top edge, keep bottom edge fixed
    if (dir.includes('n')) {
      y = snap(Math.max(0, orig.y + dy));
      y = Math.min(y, orig.y + orig.h - GRID_STEP);
      h = orig.y + orig.h - y;
    }

    tile.x = x; tile.y = y; tile.width = w; tile.height = h;
    el.style.left   = tile.x      + '%';
    el.style.top    = tile.y      + '%';
    el.style.width  = tile.width  + '%';
    el.style.height = tile.height + '%';
  }

  function onUp() {
    document.body.classList.remove('interacting');
    el.style.zIndex = '';
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup',   onUp);
    saveState();
  }

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup',   onUp);
}

// ==================== Mode Toggle ====================

function enterDashboardMode() {
  isDashboardMode = true;
  document.body.classList.add('dashboard-mode');
  btnToggleMode.textContent = '✏ 編集モードへ';
  // Reset animation each time by replacing the element
  const old = shortcutHint;
  const clone = old.cloneNode(true);
  old.parentNode.replaceChild(clone, old);
}

function exitDashboardMode() {
  isDashboardMode = false;
  document.body.classList.remove('dashboard-mode');
  btnToggleMode.textContent = '▶ ダッシュボードモード';
}

function toggleMode() {
  if (isDashboardMode) {
    exitDashboardMode();
  } else {
    enterDashboardMode();
  }
}

// ==================== Dashboard Management ====================

function switchDashboard(id) {
  state.activeDashboardId = id;
  activeDashboard = state.dashboards.find(d => d.id === id);
  renderTiles();
  updateEmptyState();
  saveState();
}

function newDashboard() {
  const name = prompt('ダッシュボード名:', `Dashboard ${state.dashboards.length + 1}`);
  if (!name) return;
  const d = createDashboardObj(name.trim() || `Dashboard ${state.dashboards.length + 1}`);
  state.dashboards.push(d);
  state.activeDashboardId = d.id;
  activeDashboard = d;
  renderAll();
  saveState();
}

function renameDashboard() {
  if (!activeDashboard) return;
  const name = prompt('新しい名前:', activeDashboard.name);
  if (!name) return;
  activeDashboard.name = name.trim() || activeDashboard.name;
  renderDashboardSelect();
  saveState();
}

function deleteDashboard() {
  if (!activeDashboard) return;
  if (state.dashboards.length === 1) {
    alert('最後のダッシュボードは削除できません。');
    return;
  }
  if (!confirm(`「${activeDashboard.name}」を削除しますか？`)) return;

  state.dashboards = state.dashboards.filter(d => d.id !== state.activeDashboardId);
  state.activeDashboardId = state.dashboards[0].id;
  activeDashboard = state.dashboards[0];
  renderAll();
  saveState();
}

// ==================== Tab Picker ====================

async function loadOpenTabs() {
  const tabs = await chrome.tabs.query({});
  return tabs.filter(t => {
    if (!t.url) return false;
    const url = t.url;
    if (url.startsWith('chrome://')) return false;
    if (url.startsWith('chrome-extension://')) return false;
    if (url === 'about:blank' || url === 'about:newtab') return false;
    return true;
  });
}

function renderTabList(tabs) {
  tabList.innerHTML = '';

  if (tabs.length === 0) {
    tabList.innerHTML = '<div class="tab-list-empty">表示できるタブがありません</div>';
    return;
  }

  tabs.forEach(tab => {
    const item = document.createElement('div');
    item.className = 'tab-item';

    const faviconSrc = tab.favIconUrl || '';
    item.innerHTML = `
      ${faviconSrc
        ? `<img class="tab-favicon" src="${escapeAttr(faviconSrc)}" alt="" onerror="this.style.display='none'">`
        : `<svg class="tab-favicon" viewBox="0 0 16 16" fill="#445"><rect x="1" y="1" width="14" height="14" rx="2" fill="none" stroke="#445" stroke-width="1.5"/></svg>`}
      <div class="tab-item-info">
        <div class="tab-item-title">${escapeAttr(tab.title || tab.url)}</div>
        <div class="tab-item-url">${escapeAttr(tab.url)}</div>
      </div>
    `;

    item.addEventListener('click', () => {
      tabList.querySelectorAll('.tab-item').forEach(el => el.classList.remove('selected'));
      item.classList.add('selected');
      modalUrl.value = tab.url;
      modalLabel.value = tab.title || '';
    });

    tabList.appendChild(item);
  });
}

// ==================== Modal Helpers ====================

async function openAddModal() {
  modalTitle.textContent = 'タイルを追加';
  modalUrl.value = '';
  modalLabel.value = '';
  modalOk.textContent = '追加';
  tabList.innerHTML = '';  // show loading state via CSS :empty::after
  modalOverlay.classList.remove('hidden');
  modalUrl.focus();

  const tabs = await loadOpenTabs();
  renderTabList(tabs);
}

function closeAddModal() {
  modalOverlay.classList.add('hidden');
}

function commitAddModal() {
  const url = modalUrl.value.trim();
  if (!url) return;
  addTile(url, modalLabel.value.trim());
  closeAddModal();
}

// ==================== Library Modal ====================

function openLibraryModal() {
  renderLibraryList();
  libraryOverlay.classList.remove('hidden');
}

function closeLibraryModal() {
  libraryOverlay.classList.add('hidden');
}

function renderLibraryList() {
  libraryList.innerHTML = '';
  if (state.savedUrls.length === 0) {
    libraryList.innerHTML = '<div class="library-empty">保存済みURLがありません。<br>設定ページでURLを登録してください。</div>';
    return;
  }
  state.savedUrls.forEach(saved => {
    const item = document.createElement('div');
    item.className = 'library-item';
    item.innerHTML = `
      <div style="flex:1;overflow:hidden">
        <div class="library-item-title">${escapeAttr(saved.title || saved.url)}</div>
        <div class="library-item-url">${escapeAttr(saved.url)}</div>
      </div>
      <button class="ctrl-btn ctrl-btn-primary" style="flex-shrink:0">追加</button>
    `;
    item.querySelector('button').addEventListener('click', () => {
      addTile(saved.url, saved.title);
      closeLibraryModal();
    });
    libraryList.appendChild(item);
  });
}

// ==================== Event Listeners ====================

btnAddTile.addEventListener('click', openAddModal);

btnAddCurrentTab.addEventListener('click', async () => {
  const tab = await chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB' });
  if (tab && tab.url) {
    addTile(tab.url, tab.title);
  } else {
    alert('アクティブなタブが見つかりませんでした。');
  }
});

btnAddFromLibrary.addEventListener('click', openLibraryModal);

btnToggleMode.addEventListener('click', toggleMode);

btnNewDashboard.addEventListener('click', newDashboard);
btnRenameDashboard.addEventListener('click', renameDashboard);
btnDeleteDashboard.addEventListener('click', deleteDashboard);

btnSave.addEventListener('click', async () => {
  await saveState();
  const orig = btnSave.textContent;
  btnSave.textContent = '保存済み ✓';
  setTimeout(() => { btnSave.textContent = orig; }, 1500);
});

dashboardSelect.addEventListener('change', () => {
  switchDashboard(dashboardSelect.value);
});

// Modal
modalCancel.addEventListener('click', closeAddModal);
modalOk.addEventListener('click', commitAddModal);
modalUrl.addEventListener('keydown', e => {
  if (e.key === 'Enter') commitAddModal();
  if (e.key === 'Escape') closeAddModal();
});
modalOverlay.addEventListener('click', e => {
  if (e.target === modalOverlay) closeAddModal();
});

// Library modal
libraryClose.addEventListener('click', closeLibraryModal);
libraryOverlay.addEventListener('click', e => {
  if (e.target === libraryOverlay) closeLibraryModal();
});
goToOptions.addEventListener('click', e => {
  e.preventDefault();
  chrome.runtime.openOptionsPage();
});

// Keyboard shortcuts
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && isDashboardMode) exitDashboardMode();
  if (e.key === 'F11') { e.preventDefault(); toggleMode(); }
  if (e.key === 'Control') document.body.classList.add('ctrl-zoom');
});
document.addEventListener('keyup', e => {
  if (e.key === 'Control') document.body.classList.remove('ctrl-zoom');
});
window.addEventListener('blur', () => document.body.classList.remove('ctrl-zoom'));

// Prevent browser page zoom on Ctrl+scroll (must be non-passive)
window.addEventListener('wheel', e => {
  if (e.ctrlKey) e.preventDefault();
}, { passive: false });

// Per-tile Ctrl+scroll zoom
canvas.addEventListener('wheel', e => {
  if (!e.ctrlKey) return;
  const tileEl = e.target.closest('.tile');
  if (!tileEl) return;
  const tileId = tileEl.id.replace('tile-', '');
  const tile = activeDashboard && activeDashboard.tiles.find(t => t.id === tileId);
  if (!tile) return;
  stepZoom(tile, tileEl, e.deltaY < 0 ? +1 : -1);
});

// Messages from background (e.g. add current tab from popup)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'ADD_TILE') {
    addTile(message.url, message.title);
    sendResponse({ success: true });
  }
});

// ==================== Init ====================

chrome.runtime.sendMessage({ type: 'DASHBOARD_READY' });
loadState();
