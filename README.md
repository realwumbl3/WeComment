## WeComment — the open comment layer for YouTube

WeComment restores conversation where it’s been turned off. The Chrome extension injects an alternative comment UI on YouTube pages that show “Comments are turned off,” and a lightweight Flask backend stores comments, authenticates with Google, and enriches with YouTube metadata.

### Highlights

- **Keeps discussion open** on videos with comments disabled
- **Google Sign‑In** with short‑lived JWTs for the extension
- **Replies, votes, sorting** and a hub view of active videos
- **SQLite** via SQLAlchemy; CORS enabled for development

---

## Architecture

- **Extension (MV3)**: detection, UI injection, votes/replies/sort, hub page, auth token handling
- **Backend (Flask)**: models (`User`, `Video`, `Comment`, `Vote`), Google OAuth, YouTube Data API v3 for metadata

---

## Requirements

- Ubuntu Server (or any Linux)
- Python 3.11+
- Google Cloud project with OAuth credentials and YouTube Data API enabled

---

## Setup (Ubuntu/Linux)

```bash
python3 -m venv .venv
. .venv/bin/activate
pip install -r backend/requirements.txt

cp backend/.env.example backend/.env
```

Edit `backend/.env` with your values:

```env
BACKEND_BASE_URL=http://localhost:5000
GOOGLE_CLIENT_ID=YOUR_GOOGLE_OAUTH_CLIENT_ID
GOOGLE_CLIENT_SECRET=YOUR_GOOGLE_OAUTH_CLIENT_SECRET
YOUTUBE_API_KEY=YOUR_YOUTUBE_DATA_API_KEY
SECRET_KEY=change-me
JWT_SECRET=change-me-too
```

---

## Development

Run the Flask dev server:

```bash
export FLASK_APP="backend.app:app"
flask run --host 0.0.0.0 --port 5000
```

Chrome extension (dev): load `extension/` as unpacked, and set Backend URL to `http://localhost:5000`.

---

## Production (Gunicorn + unix socket + Nginx)

1) Create the socket directory and set permissions:

```bash
mkdir -p /home/wumbl3priv/Dev/WeComment/instance
sudo chgrp www-data /home/wumbl3priv/Dev/WeComment/instance
sudo chmod 775 /home/wumbl3priv/Dev/WeComment/instance
```

2) Start with Gunicorn using the provided config (`backend/gunicorn.conf.py`):

```bash
cd /home/wumbl3priv/Dev/WeComment
. .venv/bin/activate
gunicorn -c backend/gunicorn.conf.py
```

3) Nginx reverse proxy to the unix socket:

```bash
sudo tee /etc/nginx/sites-available/wecomment >/dev/null < deploy/nginx/wecomment.conf
sudo ln -s /etc/nginx/sites-available/wecomment /etc/nginx/sites-enabled/wecomment
sudo nginx -t && sudo systemctl reload nginx
```

4) In production, set `BACKEND_BASE_URL` in `backend/.env` to your public URL (e.g., `https://your-domain`). Update OAuth redirect URI accordingly: `https://your-domain/auth/google/callback`.

Note: `flask run` is for development only. Production uses Gunicorn bound to a unix socket behind Nginx.

---

## Configuration reference

`backend/config.py` reads from `.env`:

- `BACKEND_BASE_URL`
- `SECRET_KEY`, `JWT_SECRET`
- `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`
- `YOUTUBE_API_KEY`
- `DATABASE_URL` (default `sqlite:///wecomment.db`)
- `CORS_ORIGINS` (default `*` for development)

SQLite database file lives in the `instance/` folder.

---

## API overview

- `GET /` — health
- `GET /auth/google/start` — begin OAuth; `GET /auth/google/callback` — finish and `postMessage` a JWT
- `GET /api/videos/:id` — get/create video (fetches metadata on first sighting)
- `GET /api/videos?has_comments=1&limit=N` — list tracked videos with counts and thumbnails
- `GET /api/videos/:id/comments?sort=top|new` — list threaded comments
- `POST /api/videos/:id/comments` — add comment (Bearer JWT)
- `POST /api/comments/:commentId/vote` — toggle vote (Bearer JWT)

---

## Security notes

- Dev build relaxes ID token verification; verify signatures and audience in production
- Restrict `CORS_ORIGINS`, harden cookies, add rate limiting and abuse prevention
- Consider JWT expiry/rotation and refresh flows

