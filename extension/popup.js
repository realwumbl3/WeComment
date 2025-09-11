const DEFAULT_BACKEND = "https://wecomment.wumbl3.xyz";

async function load() {
    const { wecomment_backend } = await chrome.storage.sync.get(["wecomment_backend"]);
    document.getElementById("backend-url").value = wecomment_backend || DEFAULT_BACKEND;

    const { wecomment_token } = await chrome.storage.local.get(["wecomment_token"]);
    document.getElementById("status").textContent = wecomment_token ? "Signed in" : "Signed out";
}

async function save() {
    const url = document.getElementById("backend-url").value.trim() || DEFAULT_BACKEND;
    await chrome.storage.sync.set({ wecomment_backend: url });
    document.getElementById("status").textContent = "Saved";
}

async function login() {
    const { wecomment_backend } = await chrome.storage.sync.get(["wecomment_backend"]);
    const base = wecomment_backend || DEFAULT_BACKEND;
    const w = 480;
    const h = 640;
    const left = Math.max(0, (screen.width - w) / 2);
    const top = Math.max(0, (screen.height - h) / 2);
    const win = window.open(
        `${base}/auth/google/start`,
        "wecomment_login",
        `width=${w},height=${h},left=${left},top=${top}`
    );
    if (!win) return;
}

async function logout() {
    await chrome.storage.local.remove("wecomment_token");
    document.getElementById("status").textContent = "Signed out";
}

window.addEventListener("message", async (evt) => {
    const data = evt.data || {};
    if (data.type === "wecomment_auth" && data.token) {
        await chrome.storage.local.set({ wecomment_token: data.token });
        document.getElementById("status").textContent = "Signed in";
    }
});

document.getElementById("save").addEventListener("click", save);
document.getElementById("login").addEventListener("click", login);
document.getElementById("logout").addEventListener("click", logout);

load();
