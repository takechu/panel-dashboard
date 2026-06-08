let dashboardWindowId = null;
let pendingTiles = [];

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case 'OPEN_DASHBOARD':
      openDashboard().then(result => sendResponse(result));
      return true;

    case 'CLOSE_DASHBOARD':
      closeDashboard().then(() => sendResponse({ success: true }));
      return true;

    case 'GET_DASHBOARD_STATUS':
      sendResponse({ isOpen: dashboardWindowId !== null });
      break;

    case 'ADD_CURRENT_TAB':
      addCurrentTab(message.tabId).then(result => sendResponse(result));
      return true;

    case 'GET_CURRENT_TAB':
      getActiveNormalTab().then(tab => sendResponse(tab));
      return true;

    case 'DASHBOARD_READY':
      flushPendingTiles();
      sendResponse({ success: true });
      break;
  }
});

async function openDashboard() {
  if (dashboardWindowId !== null) {
    try {
      await chrome.windows.update(dashboardWindowId, { focused: true });
      return { success: true, windowId: dashboardWindowId, existing: true };
    } catch {
      dashboardWindowId = null;
      await removeIframeRules();
    }
  }

  const win = await chrome.windows.create({
    url: chrome.runtime.getURL('dashboard/dashboard.html'),
    state: 'fullscreen',
    type: 'popup'
  });
  dashboardWindowId = win.id;

  // ダッシュボードタブのiframeのみ X-Frame-Options / CSP を除去するセッションルールを追加
  if (win.tabs && win.tabs.length > 0) {
    await addIframeRules(win.tabs[0].id);
  }

  return { success: true, windowId: win.id, existing: false };
}

async function closeDashboard() {
  if (dashboardWindowId !== null) {
    try {
      await chrome.windows.remove(dashboardWindowId);
    } catch {}
    dashboardWindowId = null;
    await removeIframeRules();
  }
}

// ダッシュボードタブ専用: iframeの埋め込みブロックヘッダーを除去するセッションルール
async function addIframeRules(tabId) {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1001],
      addRules: [{
        id: 1001,
        priority: 1,
        action: {
          type: 'modifyHeaders',
          responseHeaders: [
            { header: 'x-frame-options',                   operation: 'remove' },
            { header: 'content-security-policy',           operation: 'remove' },
            { header: 'content-security-policy-report-only', operation: 'remove' }
          ]
        },
        condition: {
          resourceTypes: ['sub_frame'],
          tabIds: [tabId]
        }
      }]
    });
  } catch (e) {
    console.error('addIframeRules failed:', e);
  }
}

async function removeIframeRules() {
  try {
    await chrome.declarativeNetRequest.updateSessionRules({
      removeRuleIds: [1001]
    });
  } catch {}
}

async function addCurrentTab(tabId) {
  let tab;
  if (tabId) {
    tab = await chrome.tabs.get(tabId);
  } else {
    tab = await getActiveNormalTab();
  }

  if (!tab) return { success: false };

  pendingTiles.push({ url: tab.url, title: tab.title });

  const result = await openDashboard();
  if (result.existing) {
    await flushPendingTiles();
  }
  // If new window, flush on DASHBOARD_READY

  return { success: true, url: tab.url, title: tab.title };
}

async function getActiveNormalTab() {
  const windows = await chrome.windows.getAll({ populate: true, windowTypes: ['normal'] });
  for (const win of windows) {
    if (win.type === 'normal') {
      const activeTab = win.tabs.find(t => t.active);
      if (activeTab) return { url: activeTab.url, title: activeTab.title };
    }
  }
  return null;
}

async function sendToDashboard(message) {
  if (dashboardWindowId === null) return;
  try {
    const tabs = await chrome.tabs.query({ windowId: dashboardWindowId });
    if (tabs.length > 0) {
      await chrome.tabs.sendMessage(tabs[0].id, message);
    }
  } catch {}
}

async function flushPendingTiles() {
  while (pendingTiles.length > 0) {
    const tile = pendingTiles.shift();
    await sendToDashboard({ type: 'ADD_TILE', url: tile.url, title: tile.title });
  }
}

chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === dashboardWindowId) {
    dashboardWindowId = null;
    removeIframeRules();
  }
});
