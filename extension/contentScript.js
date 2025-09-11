(() => {
    const DEFAULT_BACKEND = "https://wecomment.wumbl3.xyz";
    let authToken = null;
    let backendBase = DEFAULT_BACKEND;
    let currentVideoId = null;
    let sortMode = "top"; // 'new' | 'top'
    let currentUser = null;
    let stylesInjected = false;

    function getVideoId() {
        const url = new URL(window.location.href);
        const v = url.searchParams.get("v");
        if (v) return v;
        const flexy = document.querySelector("ytd-watch-flexy");
        return flexy?.getAttribute("video-id");
    }

    function isCommentsTurnedOffNode(node) {
        if (!node) return false;
        const text = node.textContent || "";
        return /Comments are turned off\.\s*Learn more/i.test(text);
    }

    const REPLACEMENT_TEXT =
        'Comments were turned off on <a style="color: #3ea6ff; text-decoration: none;" href="https://support.google.com/youtube/answer/9706180?hl=en">YouTube</a>, but fret not!.... <a style="color: #3ea6ff; text-decoration: none;" href="https://github.com/realwumbl3/WeComment">WeComment</a> is here.';

    function replaceCommentsTurnedOffText() {
        const candidates = document.querySelectorAll("ytd-message-renderer, #message, #contents, #comments");
        for (const el of candidates) {
            if (!el || el.dataset?.wecReplaced === "1") continue;
            if (isCommentsTurnedOffNode(el)) {
                const textHolder = el.querySelector("yt-formatted-string, #message, .message") || el;
                if (textHolder) {
                    textHolder.innerHTML = REPLACEMENT_TEXT;
                    el.dataset.wecReplaced = "1";
                }
            }
        }
    }

    function queryCommentsTurnedOffElement() {
        const candidates = document.querySelectorAll("ytd-message-renderer, #message, #contents");
        for (const el of candidates) {
            if (isCommentsTurnedOffNode(el)) return el;
        }
        const comments = document.querySelector("#comments");
        if (isCommentsTurnedOffNode(comments)) return comments;
        return null;
    }

    function ensureSidebarItem() {
        const guide = document.querySelector("ytd-guide-renderer");
        if (!guide || document.getElementById("wec-sidebar-link")) return;

        // Identify the Explore section in a language-agnostic way using stable hrefs
        let insertParent = null;
        const sections = guide.querySelectorAll("ytd-guide-section-renderer");
        const KNOWN_EXPLORE_PATTERNS = [
            "/gaming",
            "/podcasts",
            "/playables",
            "/feed/storefront",
            "/channel/UC-9-kyTW8ZkZNDHQJ6FgpwQ", // Music
            "/channel/UC4R8DWoMoI7CAwX8_LjQHig", // Live
            "/channel/UCYfdidRxbB8Qhf0Nx7ioOYw", // News
            "/channel/UCEgdi0XIXXZ-qJOFPf4JSKw", // Sports
            "/channel/UCtFRv9O2AHqOZjjynzrv-xg", // Learning
        ];
        let bestScore = 0;
        let bestSection = null;
        for (const section of sections) {
            const links = Array.from(section.querySelectorAll("a[href]"));
            let score = 0;
            for (const a of links) {
                const href = a.getAttribute("href") || "";
                if (KNOWN_EXPLORE_PATTERNS.some((p) => href.includes(p))) score += 1;
            }
            if (score > bestScore) {
                bestScore = score;
                bestSection = section;
            }
        }
        if (bestSection && bestScore > 0) {
            insertParent = bestSection.querySelector("#items") || bestSection;
        }
        if (!insertParent) return; // Only insert inside Explore

        // Ensure hover styles for our plain elements
        if (!document.getElementById("wec-sidebar-css")) {
            const style = document.createElement("style");
            style.id = "wec-sidebar-css";
            style.textContent = `
      #wec-sidebar-link { display:flex; align-items:center; gap:12px; padding: 8px 0px 8px 12px; border-radius:12px; color: var(--yt-spec-text-primary); text-decoration:none; width: auto;}
      #wec-sidebar-link:hover { background: var(--yt-spec-badge-chip-background, #222); }
      #wec-sidebar-link .wec-title { font-size: 14px; }
    `;
            document.documentElement.appendChild(style);
        }

        const item = document.createElement("ytd-guide-entry-renderer");
        item.innerHTML = `
      <a id="wec-sidebar-link" class="style-scope ytd-guide-entry-renderer" href="#wec-hub" role="link" title="Disabled Comments">
        <span class="icon" style="display:inline-flex; width:24px; height:24px; margin-right:12px;"></span>
        <span class="wec-title">Disabled Comments</span>
      </a>
    `;
        // Insert at the very top of the target section
        if (insertParent.firstChild) insertParent.insertBefore(item, insertParent.firstChild);
        else insertParent.appendChild(item);

        const link = item.querySelector("#wec-sidebar-link");
        try {
            const iconUrl = chrome.runtime.getURL("commenticon.svg");
            fetch(iconUrl)
                .then((r) => r.text())
                .then((svg) => {
                    const iconSpan = link?.querySelector(".icon");
                    if (iconSpan) iconSpan.innerHTML = svg;
                })
                .catch(() => {});
        } catch (_) {}

        link?.addEventListener("click", (e) => {
            e.preventDefault();
            openHub();
        });
    }

    async function openHub() {
        const app = document.querySelector("ytd-app");
        const pageManager = document.getElementById("page-manager");
        if (!app || !pageManager) return;
        pageManager.innerHTML = "";
        const host = document.createElement("div");
        host.id = "wec-hub";
        host.style.padding = "16px 24px";
        host.style.color = "var(--yt-spec-text-primary, #fff)";
        host.innerHTML = `
      <div id="wec-hub-header" style="position:sticky;top:0;z-index:2;background:var(--yt-spec-base-background,#0f0f0f);padding:8px 0 10px;">
        <div style="display:flex;align-items:center;justify-content:space-between;">
          <h2 style="margin:0;font-size:22px;">Comment Disabled Videos</h2>
        </div>
        <div id="wec-hub-sub" style="margin:8px 0 0;display:flex;align-items:center;justify-content:space-between;gap:12px;">
          <div style="opacity:.8;">Videos where WeComment has activity. Click a card to open the video.</div>
          <button id="wec-hub-refresh" style="padding:8px 12px;border:1px solid #333;border-radius:18px;background:#111;color:#fff;cursor:pointer;">Refresh</button>
        </div>
      </div>
      <div id="wec-hub-list" style="display:grid;grid-template-columns:repeat(auto-fill,minmax(320px,1fr));gap:16px;">
      </div>
    `;
        pageManager.appendChild(host);
        document.getElementById("wec-hub-refresh")?.addEventListener("click", loadHub);
        await loadHub();
    }

    async function loadHub() {
        const list = document.getElementById("wec-hub-list");
        if (!list) return;
        list.innerHTML = "<div>Loading…</div>";
        try {
            const res = await fetch(`${backendBase}/api/videos?has_comments=1&limit=100`);
            const data = await res.json();
            const vids = data.videos || [];
            if (!vids.length) {
                list.innerHTML = '<div style="opacity:.8">No videos yet.</div>';
                return;
            }
            list.innerHTML = vids
                .map(
                    (v) => `
        <a href="https://www.youtube.com/watch?v=${encodeURIComponent(
            v.youtube_video_id
        )}" style="text-decoration:none;color:inherit;border:1px solid #333;border-radius:12px;overflow:hidden;display:block;background:#0f0f0f;">
          <div style="position:relative;background:#000;aspect-ratio:16/9;">
            <img src="${
                v.thumbnail_url
                    ? v.thumbnail_url
                    : `https://i.ytimg.com/vi/${encodeURIComponent(v.youtube_video_id)}/hqdefault.jpg`
            }" style="width:100%;height:100%;object-fit:cover;display:block;"/>
            <div style="position:absolute;right:8px;bottom:8px;background:rgba(0,0,0,.7);padding:2px 6px;border-radius:6px;font-size:12px;">${
                v.comment_count || 0
            } comments</div>
          </div>
          <div style="padding:10px 12px;">
            <div style="font-weight:600;line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;overflow:hidden;-webkit-box-orient:vertical;">${escapeHtml(
                v.title || v.youtube_video_id
            )}</div>
            <div style="margin-top:4px;font-size:13px;opacity:.8;display:-webkit-box;-webkit-line-clamp:1;overflow:hidden;-webkit-box-orient:vertical;">${escapeHtml(v.channel_title || "")}</div>
          </div>
        </a>
      `
                )
                .join("");
        } catch (e) {
            list.innerHTML = "<div>Error loading.</div>";
        }
    }

    function createContainer() {
        const container = document.createElement("div");
        container.id = "wecomment-container";
        container.style.border = "1px solid var(--yt-spec-10-percent-layer, #303030)";
        container.style.borderRadius = "8px";
        container.style.padding = "12px";
        container.style.margin = "12px 0";
        container.style.background = "var(--yt-spec-additive-background, #121212)";
        container.style.color = "var(--yt-spec-text-primary, #fff)";
        container.innerHTML = `
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div style="display:flex;align-items:center;gap:12px;">
          <div style="font-weight:600; font-size: 18px;">WeComment</div>
          <label style="display:flex;align-items:center;gap:6px;font-size:12px;opacity:.85;">
            <span>Sort</span>
            <select id="wecomment-sort" style="background:#0f0f0f;color:#fff;border:1px solid #333;border-radius:6px;padding:4px 6px;">
              <option value="new">Newest</option>
              <option value="top" selected>Top</option>
            </select>
          </label>
        </div>
        <div id="wecomment-auth-area"></div>
      </div>
      <div id="wecomment-compose" style="margin-top:12px;"></div>
      <div id="wecomment-list" style="margin-top:12px;"></div>
    `;
        return container;
    }

    function injectStyles() {
        if (stylesInjected) return;
        stylesInjected = true;
        const css = `
      #wecomment-container .wec-item { padding: 16px 0; border-top: 1px solid var(--yt-spec-10-percent-layer, #303030); }
      #wecomment-container .wec-row { display: grid; grid-template-columns: 40px 1fr; gap: 12px; }
      #wecomment-container .wec-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; background: #333; }
      #wecomment-container .wec-header { display: flex; align-items: baseline; gap: 8px; }
      #wecomment-container .wec-author { font-weight: 600; font-size: 14px; }
      #wecomment-container .wec-time { font-size: 12px; opacity: .7; }
      #wecomment-container .wec-text { margin-top: 6px; line-height: 1.5; font-size: 14px; white-space: pre-wrap; word-break: break-word; }
      #wecomment-container .wec-actions { margin-top: 6px; display: flex; align-items: center; gap: 12px; color: var(--yt-spec-text-secondary, #aaa); }
      #wecomment-container .wec-button { background: transparent; border: none; color: inherit; cursor: pointer; padding: 6px 10px; border-radius: 18px; }
      #wecomment-container .wec-button:hover { background: var(--yt-spec-badge-chip-background, #222); }
      #wecomment-container .wec-vote.is-active { background: #1b5e20; color: #fff; border: 1px solid #2e7d32; }
      #wecomment-container .wec-score { font-size: 12px; opacity: .9; min-width: 16px; text-align: center; }
      #wecomment-container .wec-replybox textarea { width: 100%; max-width: 100%; box-sizing: border-box; resize: vertical; background: #0f0f0f; color: #fff; border: 1px solid #333; border-radius: 18px; padding: 10px 12px; }
      #wecomment-container .wec-replybox .wec-actions-line { margin-top: 8px; display: flex; gap: 8px; }
      #wecomment-container .wec-indent { margin-left: 52px; }
    `;
        const style = document.createElement("style");
        style.textContent = css;
        document.documentElement.appendChild(style);
    }

    function renderAuthArea() {
        const authArea = document.getElementById("wecomment-auth-area");
        if (!authArea) return;
        if (authToken) {
            const avatar = currentUser?.picture
                ? `<img src="${currentUser.picture}" style="width:22px;height:22px;border-radius:50%;object-fit:cover;"/>`
                : "";
            const name = currentUser?.name ? `<span style="opacity:.9;">${escapeHtml(currentUser.name)}</span>` : "";
            authArea.innerHTML = `<div style="display:flex;align-items:center;gap:8px;">${avatar}${name}<button id=\"wecomment-logout\" style=\"padding:6px 10px;border-radius:6px;border:1px solid #555;background:#222;color:#fff;cursor:pointer;\">Sign out</button></div>`;
            document.getElementById("wecomment-logout")?.addEventListener("click", async () => {
                authToken = null;
                currentUser = null;
                await chrome.storage.local.remove("wecomment_token");
                renderAuthArea();
            });
        } else {
            authArea.innerHTML = `<button id="wecomment-login" style="padding:6px 10px;border-radius:6px;border:1px solid #3ea6ff;background:#0f3d66;color:#fff;cursor:pointer;">Sign in with Google</button>`;
            document.getElementById("wecomment-login")?.addEventListener("click", () => startLoginFlow());
        }
    }

    function renderComposer() {
        const compose = document.getElementById("wecomment-compose");
        if (!compose) return;
        const avatar = currentUser?.picture
            ? `<img src="${currentUser.picture}" style="width:36px;height:36px;border-radius:50%;object-fit:cover;"/>`
            : `<div style="width:36px;height:36px;border-radius:50%;background:#333;"></div>`;
        compose.innerHTML = `
      <div style="display:grid;grid-template-columns:36px minmax(0,1fr) auto;gap:8px;align-items:flex-start;">
        <div>${avatar}</div>
        <textarea id="wecomment-input" placeholder="Add a public comment..." rows="3" style="width:100%;max-width:100%;box-sizing:border-box;resize:vertical;background:#0f0f0f;color:#fff;border:1px solid #333;border-radius:8px;padding:8px;"></textarea>
        <button id="wecomment-post" style="padding:8px 12px;border-radius:8px;border:1px solid #3ea6ff;background:#065692;color:#fff;cursor:pointer;">Post</button>
      </div>
    `;
        document.getElementById("wecomment-post")?.addEventListener("click", submitComment);
    }

    function renderComments(comments) {
        const list = document.getElementById("wecomment-list");
        if (!list) return;
        const roots = Array.isArray(comments) ? comments : [];
        if (roots.length === 0) {
            list.innerHTML = '<div style="opacity:.8">No comments yet. Be the first!</div>';
            return;
        }
        function itemHtml(c, level) {
            const indentClass = level > 0 ? "wec-indent" : "";
            return `
        <div class="wec-item ${indentClass}" data-id="${c.id}">
          <div class="wec-row">
            <div>
              ${
                  c.user?.picture
                      ? `<img class="wec-avatar" src="${c.user.picture}"/>`
                      : `<div class=\"wec-avatar\"></div>`
              }
            </div>
            <div>
              <div class="wec-header">
                <span class="wec-author">${escapeHtml(c.user?.name || "User")}</span>
                <span class="wec-time">${new Date(c.created_at).toLocaleString()}</span>
              </div>
              <div class="wec-text">${renderTextWithEmoji(c.text)}</div>
              <div class="wec-actions">
                <button class="wec-button wec-vote ${c.user_voted ? "is-active" : ""}" data-act="vote">👍</button>
                <span class="wec-score" data-role="score">${formatCount(c.score || 0)}</span>
                <button class="wec-button" data-act="reply">Reply</button>
              </div>
              <div class="wec-replybox" style="display:none;">
                <textarea rows="2" placeholder="Write a reply..."></textarea>
                <div class="wec-actions-line">
                  <button class="wec-button" data-act="send-reply">Reply</button>
                  <button class="wec-button" data-act="cancel-reply">Cancel</button>
                </div>
              </div>
            </div>
          </div>
        </div>
        ${Array.isArray(c.replies) && c.replies.length ? c.replies.map((r) => itemHtml(r, level + 1)).join("") : ""}
      `;
        }

        list.innerHTML = roots.map((c) => itemHtml(c, 0)).join("");
    }

    // Convert flag emoji sequences to Twemoji SVG images for consistent rendering on all platforms
    function renderTextWithEmoji(text) {
        const input = String(text || "");
        let out = "";
        for (let i = 0; i < input.length; ) {
            const codePoint = input.codePointAt(i);
            const char = String.fromCodePoint(codePoint);
            const isRegional = codePoint >= 0x1f1e6 && codePoint <= 0x1f1ff;
            if (isRegional) {
                const nextIndex = i + char.length;
                if (nextIndex < input.length) {
                    const codePoint2 = input.codePointAt(nextIndex);
                    const char2 = String.fromCodePoint(codePoint2);
                    const isRegional2 = codePoint2 >= 0x1f1e6 && codePoint2 <= 0x1f1ff;
                    if (isRegional2) {
                        const hex1 = codePoint.toString(16);
                        const hex2 = codePoint2.toString(16);
                        const emoji = char + char2;
                        const src = `https://cdnjs.cloudflare.com/ajax/libs/twemoji/14.0.2/svg/${hex1}-${hex2}.svg`;
                        out += `<img src="${src}" alt="${escapeHtml(emoji)}" draggable="false" style="height:1em;width:1em;vertical-align:-0.12em;"/>`;
                        i = nextIndex + char2.length;
                        continue;
                    }
                }
            }
            out += escapeHtml(char);
            i += char.length;
        }
        return out;
    }

    function escapeHtml(str) {
        return String(str).replace(
            /[&<>"']/g,
            (s) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[s])
        );
    }

    function formatCount(n) {
        const num = Number(n) || 0;
        if (num < 1000) return String(num);
        if (num < 10000) return (num / 1000).toFixed(1).replace(/\.0$/, "") + "K";
        if (num < 1000000) return Math.round(num / 1000) + "K";
        if (num < 10000000) return (num / 1000000).toFixed(1).replace(/\.0$/, "") + "M";
        return Math.round(num / 1000000) + "M";
    }

    function decodeJwt(token) {
        try {
            const base = token.split(".")[1];
            const json = atob(base.replace(/-/g, "+").replace(/_/g, "/"));
            try {
                // Handle UTF-8 payloads
                const decoded = decodeURIComponent(
                    Array.prototype.map
                        .call(json, (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2))
                        .join("")
                );
                return JSON.parse(decoded);
            } catch (_) {
                return JSON.parse(json);
            }
        } catch (e) {
            return null;
        }
    }

    async function loadSettings() {
        const { wecomment_backend } = await chrome.storage.sync.get(["wecomment_backend"]);
        backendBase = wecomment_backend || DEFAULT_BACKEND;
        const { wecomment_token } = await chrome.storage.local.get(["wecomment_token"]);
        authToken = wecomment_token || null;
        currentUser = authToken ? decodeJwt(authToken) : null;
    }

    function startLoginFlow() {
        const w = 480,
            h = 640;
        const y = window.top?.outerHeight ? Math.max(0, (window.top.outerHeight - h) / 2) : 0;
        const x = window.top?.outerWidth ? Math.max(0, (window.top.outerWidth - w) / 2) : 0;
        const popup = window.open(
            `${backendBase}/auth/google/start`,
            "wecomment_login",
            `width=${w},height=${h},left=${x},top=${y}`
        );
        if (!popup) return;
    }

    window.addEventListener("message", async (evt) => {
        const data = evt.data;
        if (!data || data.type !== "wecomment_auth" || !data.token) return;
        authToken = data.token;
        await chrome.storage.local.set({ wecomment_token: authToken });
        currentUser = decodeJwt(authToken);
        renderAuthArea();
        renderComposer();
    });

    async function fetchComments(videoId) {
        try {
            const headers = {};
            if (authToken) headers["Authorization"] = `Bearer ${authToken}`;
            const res = await fetch(
                `${backendBase}/api/videos/${encodeURIComponent(videoId)}/comments?sort=${encodeURIComponent(
                    sortMode
                )}`,
                { headers }
            );
            const data = await res.json();
            return data.comments || [];
        } catch (e) {
            console.warn("WeComment: failed to load comments", e);
            return [];
        }
    }

    async function submitComment() {
        if (!authToken) {
            alert("Please sign in first.");
            return;
        }
        const input = document.getElementById("wecomment-input");
        const text = (input?.value || "").trim();
        if (!text) return;
        try {
            const res = await fetch(`${backendBase}/api/videos/${encodeURIComponent(currentVideoId)}/comments`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${authToken}`,
                },
                body: JSON.stringify({ text }),
            });
            if (res.ok) {
                input.value = "";
                const comments = await fetchComments(currentVideoId);
                renderComments(comments);
            } else if (res.status === 401) {
                alert("Session expired. Please sign in again.");
                authToken = null;
                await chrome.storage.local.remove("wecomment_token");
                renderAuthArea();
            }
        } catch (e) {
            console.warn("WeComment: failed to post comment", e);
        }
    }

    function injectUI(anchorEl) {
        if (!anchorEl) return;
        if (document.getElementById("wecomment-container")) return;
        const container = createContainer();
        anchorEl.parentElement?.insertBefore(container, anchorEl.nextSibling);
        injectStyles();
        renderAuthArea();
        renderComposer();
        // Track video once UI is injected
        if (currentVideoId) {
            // Best-effort: send title if available
            const titleEl = document.querySelector("h1.title, h1.ytd-watch-metadata, h1#title > yt-formatted-string");
            const title = titleEl?.textContent?.trim() || "";
            fetch(
                `${backendBase}/api/videos/${encodeURIComponent(currentVideoId)}?title=${encodeURIComponent(title)}`
            ).catch(() => {});
        }
        document.getElementById("wecomment-sort")?.addEventListener("change", async (e) => {
            sortMode = e.target.value;
            const comments = await fetchComments(currentVideoId);
            renderComments(comments);
        });
        const list = document.getElementById("wecomment-list");
        if (list) {
            list.addEventListener("click", async (evt) => {
                const btn = evt.target.closest("button");
                if (!btn) return;
                const act = btn.getAttribute("data-act");
                const root = btn.closest(".wec-item");
                if (!root) return;
                const commentId = root.getAttribute("data-id");
                if (!commentId) return;
                if (act === "vote") {
                    if (!authToken) {
                        alert("Please sign in first.");
                        return;
                    }
                    try {
                        const res = await fetch(`${backendBase}/api/comments/${commentId}/vote`, {
                            method: "POST",
                            headers: { Authorization: `Bearer ${authToken}` },
                        });
                        if (res.ok) {
                            const data = await res.json();
                            const scoreEl = root.querySelector('[data-role="score"]');
                            if (scoreEl) scoreEl.textContent = formatCount(data.score || 0);
                            if (data.voted) btn.classList.add("is-active");
                            else btn.classList.remove("is-active");
                        } else if (res.status === 401) {
                            alert("Session expired. Please sign in again.");
                            authToken = null;
                            await chrome.storage.local.remove("wecomment_token");
                            renderAuthArea();
                        }
                    } catch (e) {
                        console.warn("WeComment: vote failed", e);
                    }
                } else if (act === "reply") {
                    const box = root.querySelector(".wec-replybox");
                    if (box) box.style.display = box.style.display === "none" ? "block" : "none";
                } else if (act === "cancel-reply") {
                    const box = root.querySelector(".wec-replybox");
                    if (box) box.style.display = "none";
                } else if (act === "send-reply") {
                    if (!authToken) {
                        alert("Please sign in first.");
                        return;
                    }
                    const box = root.querySelector(".wec-replybox");
                    const ta = box?.querySelector("textarea");
                    const text = (ta?.value || "").trim();
                    if (!text) return;
                    try {
                        const res = await fetch(
                            `${backendBase}/api/videos/${encodeURIComponent(currentVideoId)}/comments`,
                            {
                                method: "POST",
                                headers: {
                                    "Content-Type": "application/json",
                                    Authorization: `Bearer ${authToken}`,
                                },
                                body: JSON.stringify({ text, parent_id: Number(commentId) }),
                            }
                        );
                        if (res.ok) {
                            ta.value = "";
                            box.style.display = "none";
                            const comments = await fetchComments(currentVideoId);
                            renderComments(comments);
                        } else if (res.status === 401) {
                            alert("Session expired. Please sign in again.");
                            authToken = null;
                            await chrome.storage.local.remove("wecomment_token");
                            renderAuthArea();
                        }
                    } catch (e) {
                        console.warn("WeComment: reply failed", e);
                    }
                }
            });
        }
        if (currentVideoId) {
            fetchComments(currentVideoId).then(renderComments);
        }
    }

    function onDomChanged() {
        const el = queryCommentsTurnedOffElement();
        if (el) injectUI(el);
        replaceCommentsTurnedOffText();
        ensureSidebarItem();
    }

    function onUrlChanged() {
        // Handle custom hub route via hash
        const isHub = location.hash === "#wec-hub";
        const hub = document.getElementById("wec-hub");
        if (isHub) {
            if (!hub) openHub();
        } else if (hub) {
            // Remove our custom hub when leaving
            hub.remove();
        }

        // Always remove the injected comment container when navigating
        const existing = document.getElementById("wecomment-container");
        if (existing) existing.remove();

        // Update video context and, if on a watch page, re-run DOM logic
        const vid = getVideoId();
        const changed = vid !== currentVideoId;
        currentVideoId = vid || null;
        if (vid && changed) {
            onDomChanged();
        }
    }

    function startObservers() {
        const mo = new MutationObserver(() => onDomChanged());
        mo.observe(document.documentElement, { childList: true, subtree: true });

        // Listen to YouTube's SPA navigation events where available
        window.addEventListener("yt-navigate", onUrlChanged);
        window.addEventListener("yt-navigate-finish", onUrlChanged);
        window.addEventListener("popstate", onUrlChanged);
        window.addEventListener("hashchange", onUrlChanged);

        // Fallback URL polling
        let lastUrl = location.href;
        setInterval(() => {
            if (location.href !== lastUrl) {
                lastUrl = location.href;
                onUrlChanged();
            }
        }, 800);
    }

    (async function init() {
        await loadSettings();
        currentVideoId = getVideoId();
        startObservers();
        onDomChanged();
    })();
})();
