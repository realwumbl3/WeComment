const DEFAULT_BACKEND = 'https://wecomment.wumbl3.xyz';

async function load() {
  const { wecomment_backend } = await chrome.storage.sync.get(['wecomment_backend']);
  document.getElementById('backend-url').value = wecomment_backend || DEFAULT_BACKEND;
}

async function save() {
  const url = document.getElementById('backend-url').value.trim() || DEFAULT_BACKEND;
  await chrome.storage.sync.set({ wecomment_backend: url });
  document.getElementById('status').textContent = 'Saved';
}

document.getElementById('save').addEventListener('click', save);
load();


