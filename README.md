## WeComment — the open comment layer for YouTube

WeComment restores conversation where it’s been turned off.

When a YouTube video displays “Comments are turned off. Learn more”, the WeComment Chrome extension detects it and seamlessly renders an alternative comment section styled to feel native. A lightweight Flask backend stores comments, authenticates users with Google, tracks videos, and enriches them with official YouTube metadata.

### Why

- **Keep discussion open**: creators, communities, and viewers can still talk.
- **User-first UX**: integrates into the YouTube watch page; no context switching.
- **Open platform**: simple APIs, easy to extend, and designed for future federation.

---

## Features

- **Automatic detection**: injects a comment UI when the page states “Comments are turned off”.
- **Google Sign‑In**: OAuth via the backend, issuing a short JWT for the extension.
- **YouTube‑like UI**: avatars, spacing, and interactions styled closely to native.
- **Replies**: nested threads with indentation.
- **Voting**: one thumbs‑up per signed‑in user; buttons persist green on reload.
- **Sorting**: Top (default) and Newest.
- **Profile in UI**: shows the signed‑in user’s avatar and name.
- **Hub view**: a new guide link “Comment Disabled Videos” (under Subscriptions) opens a page listing videos with WeComment activity.
- **Official metadata**: on first sighting, the backend fetches title/channel/thumbnail from the YouTube Data API and stores it; the hub uses these thumbnails and titles.
- **SQLite storage** with SQLAlchemy; CORS enabled for the extension.

---

## Architecture

- **Extension (MV3)**
  - `contentScript.js`: detection, UI injection, votes/replies/sort, hub page, and auth token handling
  - `manifest.json`, `popup.html/js`, `options.html/js`, `background.js`

- **Backend (Flask)**
  - Models: `User`, `Video`, `Comment`, `Vote`
  - Auth: Google OAuth (web app), JWT issuance
  - Data: SQLite via SQLAlchemy
  - Metadata: YouTube Data API v3 (videos.list?part=snippet)

---

## Quick start

### 1) Backend

Prereqs: Python 3.11+, Google Cloud project (OAuth + YouTube Data API enabled).

```powershell
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -r backend/requirements.txt

copy backend/.env.example backend/.env
```

Edit `backend/.env`:

```env
BACKEND_BASE_URL=http://localhost:5000
GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_OAUTH_CLIENT_SECRET
YOUTUBE_API_KEY=YOUR_YOUTUBE_DATA_API_KEY
SECRET_KEY=change-me
JWT_SECRET=change-me-too
```

Run the server:

```powershell
$env:FLASK_APP="backend.app:app"
flask run --host 0.0.0.0 --port 5000
```

#### Google Cloud setup (summary)

- APIs & Services → OAuth consent screen → External → fill basics, add scopes `openid email profile`, add your account as a Test user.
- Credentials → Create OAuth client ID (Web application).
  - Authorized redirect URI: `http://localhost:5000/auth/google/callback`
- Enable the YouTube Data API v3 and create an API key (`YOUTUBE_API_KEY`).

### 2) Extension

1. Chrome → Extensions → Enable Developer Mode → Load unpacked → select the `extension/` folder.
2. In the popup/options, set Backend URL to `http://localhost:5000`.
3. Visit a YouTube video with disabled comments; the WeComment UI should appear.

---

## API overview

- `GET /` → health
- `GET /auth/google/start` → begin OAuth; `GET /auth/google/callback` → finish and `postMessage` a JWT
- `GET /api/videos/:id` → get/create video; on first request, fetches official metadata from YouTube
- `GET /api/videos?has_comments=1&limit=N` → list tracked videos with `comment_count`, `thumbnail_url`, `title`, `channel_title`
- `GET /api/videos/:id/comments?sort=top|new` → list threaded comments with scores and `user_voted`
- `POST /api/videos/:id/comments` → `{ text, parent_id? }` add comment (Bearer JWT)
- `POST /api/comments/:commentId/vote` → toggle vote (Bearer JWT)

---

## Configuration

- `backend/config.py` reads from `.env`:
  - `BACKEND_BASE_URL`, `SECRET_KEY`, `JWT_SECRET`
  - `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
  - `YOUTUBE_API_KEY` (required for titles/thumbnails)
  - `DATABASE_URL` (defaults to `sqlite:///wecomment.db`)
  - `CORS_ORIGINS` (defaults to `*` for development)

Database file lives in the instance folder (SQLite). It’s safe to delete it during development to reset state.

---

## Security notes (development build)

- ID token verification is relaxed in dev; validate signatures and audience before production.
- Restrict `CORS_ORIGINS` and harden cookies.
- Add rate limiting and abuse protection for comment/vote endpoints.
- Consider JWT rotation/expiry and refresh flows.

---

## Roadmap

- Real‑time updates (WebSockets/SSE)
- Moderation tools (reporting, removals, bans)
- Rich content (links, media, markdown)
- Channel/creator controls and portable identities
- Federation and bridges to other video platforms

If this resonates, jump in—open issues, send PRs, and help build a freer, durable comment layer for the web.

# WeComment (YouTube alternative comments)

A Chrome extension and Flask backend that shows an alternative comment section when a YouTube page displays "Comments are turned off. Learn more".

## Features

- Detects disabled YouTube comments and injects an alternative comment UI
- Flask backend stores videos and comments
- Google Sign-In via backend OAuth (issues a JWT for the extension)

## Getting started

### Backend

1. Create and activate a virtualenv (Windows PowerShell):

```powershell
python -m venv .venv
. .venv/Scripts/Activate.ps1
pip install -r backend/requirements.txt
```

2. Copy env and set values:

```powershell
copy backend/.env.example backend/.env
```

Edit `backend/.env` with your `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, and `BACKEND_BASE_URL` (e.g. `http://localhost:5000`).

3. Run the backend:

```powershell
$env:FLASK_APP="backend.app:app"
flask run --host 0.0.0.0 --port 5000
```

### Chrome Extension

1. Open Chrome → Extensions → Enable Developer Mode → Load unpacked → select the `extension/` folder.
2. Click the extension icon → set Backend URL to `http://localhost:5000` → Save.
3. Visit a YouTube video where comments are turned off. The WeComment UI should appear below the message.

## Notes

- This is a development starter. Add proper validation, rate limiting, and token verification (validate `id_token` signature) before production.
- For Google OAuth in development, set the authorized redirect URI to `http://localhost:5000/auth/google/callback` in your Google Cloud Console.


