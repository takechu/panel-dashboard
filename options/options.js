const urlEmpty   = document.getElementById('url-empty');
const urlTable   = document.getElementById('url-table');
const urlTbody   = document.getElementById('url-tbody');
const editForm   = document.getElementById('edit-form');
const editTitle  = document.getElementById('edit-form-title');
const fieldTitle = document.getElementById('field-title');
const fieldUrl   = document.getElementById('field-url');
const btnAddUrl  = document.getElementById('btn-add-url');
const btnSaveUrl = document.getElementById('btn-save-url');
const btnCancel  = document.getElementById('btn-cancel-url');

let savedUrls = [];
let editingId = null;

function generateId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

function escapeHtml(str) {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

async function loadUrls() {
  const data = await chrome.storage.local.get('panelDashboard');
  savedUrls = data.panelDashboard?.savedUrls || [];
  renderTable();
}

async function persistUrls() {
  const data = await chrome.storage.local.get('panelDashboard');
  const state = data.panelDashboard || {};
  state.savedUrls = savedUrls;
  await chrome.storage.local.set({ panelDashboard: state });
}

function renderTable() {
  if (savedUrls.length === 0) {
    urlEmpty.style.display = 'block';
    urlTable.style.display = 'none';
    return;
  }
  urlEmpty.style.display = 'none';
  urlTable.style.display = 'table';

  urlTbody.innerHTML = '';
  savedUrls.forEach(item => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td class="td-title">${escapeHtml(item.title || '(タイトルなし)')}</td>
      <td class="td-url" title="${escapeHtml(item.url)}">${escapeHtml(item.url)}</td>
      <td class="td-actions">
        <button class="btn btn-secondary btn-edit" data-id="${item.id}">編集</button>
        <button class="btn btn-danger btn-delete" data-id="${item.id}">削除</button>
      </td>
    `;
    urlTbody.appendChild(tr);
  });

  urlTbody.querySelectorAll('.btn-edit').forEach(btn => {
    btn.addEventListener('click', () => openEditForm(btn.dataset.id));
  });
  urlTbody.querySelectorAll('.btn-delete').forEach(btn => {
    btn.addEventListener('click', () => deleteUrl(btn.dataset.id));
  });
}

function openAddForm() {
  editingId = null;
  editTitle.textContent = 'URLを追加';
  fieldTitle.value = '';
  fieldUrl.value = '';
  btnSaveUrl.textContent = '追加';
  editForm.classList.add('visible');
  fieldUrl.focus();
}

function openEditForm(id) {
  const item = savedUrls.find(u => u.id === id);
  if (!item) return;
  editingId = id;
  editTitle.textContent = 'URLを編集';
  fieldTitle.value = item.title || '';
  fieldUrl.value = item.url;
  btnSaveUrl.textContent = '保存';
  editForm.classList.add('visible');
  fieldTitle.focus();
}

function closeForm() {
  editingId = null;
  editForm.classList.remove('visible');
}

async function saveUrl() {
  const url   = fieldUrl.value.trim();
  const title = fieldTitle.value.trim();
  if (!url) { fieldUrl.focus(); return; }

  if (editingId) {
    const item = savedUrls.find(u => u.id === editingId);
    if (item) { item.url = url; item.title = title; }
  } else {
    savedUrls.push({ id: generateId(), url, title });
  }

  await persistUrls();
  renderTable();
  closeForm();
}

async function deleteUrl(id) {
  const item = savedUrls.find(u => u.id === id);
  if (!item) return;
  if (!confirm(`「${item.title || item.url}」を削除しますか？`)) return;
  savedUrls = savedUrls.filter(u => u.id !== id);
  await persistUrls();
  renderTable();
  if (editingId === id) closeForm();
}

btnAddUrl.addEventListener('click', openAddForm);
btnSaveUrl.addEventListener('click', saveUrl);
btnCancel.addEventListener('click', closeForm);

fieldUrl.addEventListener('keydown', e => {
  if (e.key === 'Enter') saveUrl();
  if (e.key === 'Escape') closeForm();
});

loadUrls();
