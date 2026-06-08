const btnOpen = document.getElementById('btn-open');
const btnOpenText = document.getElementById('btn-open-text');
const btnAddTab = document.getElementById('btn-add-tab');
const btnOptions = document.getElementById('btn-options');
const statusDot = document.getElementById('status-dot');
const statusText = document.getElementById('status-text');

async function updateStatus() {
  const response = await chrome.runtime.sendMessage({ type: 'GET_DASHBOARD_STATUS' });
  if (response.isOpen) {
    statusDot.className = 'dot open';
    statusText.textContent = 'ダッシュボード起動中';
    btnOpenText.textContent = 'ダッシュボードを前面に';
  } else {
    statusDot.className = 'dot closed';
    statusText.textContent = 'ダッシュボード停止中';
    btnOpenText.textContent = 'ダッシュボードを開く';
  }
}

btnOpen.addEventListener('click', async () => {
  await chrome.runtime.sendMessage({ type: 'OPEN_DASHBOARD' });
  window.close();
});

btnAddTab.addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  await chrome.runtime.sendMessage({ type: 'ADD_CURRENT_TAB', tabId: tab.id });
  window.close();
});

btnOptions.addEventListener('click', () => {
  chrome.runtime.openOptionsPage();
  window.close();
});

updateStatus();
