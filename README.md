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

## Production (systemd + Gunicorn + unix socket + Nginx)

0) Set production env vars:

```bash
cp backend/.env.example backend/.env
sed -i 's#BACKEND_BASE_URL=.*#BACKEND_BASE_URL=https://wecomment.wumbl3.xyz#' backend/.env
echo 'CORS_ORIGINS=https://www.youtube.com' >> backend/.env
```

1) Create the instance dir and set permissions (socket + DB live here):

```bash
mkdir -p /home/wumbl3priv/Dev/WeComment/instance
sudo chgrp www-data /home/wumbl3priv/Dev/WeComment/instance
sudo chmod 775 /home/wumbl3priv/Dev/WeComment/instance
# allow nginx (www-data) to traverse to the socket
sudo chmod o+x /home /home/wumbl3priv /home/wumbl3priv/Dev /home/wumbl3priv/Dev/WeComment
```

2) Install the systemd service (runs Gunicorn as `wumbl3priv`, group `www-data`, binding to `instance/wecomment.sock`):

```bash
sudo install -m 644 /home/wumbl3priv/Dev/WeComment/deploy/systemd/wecomment.service /etc/systemd/system/wecomment.service
sudo systemctl daemon-reload
sudo systemctl enable --now wecomment
sudo systemctl status wecomment | cat
```

Logs:

```bash
sudo journalctl -u wecomment -f
```

3) Nginx reverse proxy to the unix socket (CORS headers come from Flask only):

```bash
sudo tee /etc/nginx/sites-available/wecomment >/dev/null < /home/wumbl3priv/Dev/WeComment/deploy/nginx/wecomment.conf
sudo ln -s /etc/nginx/sites-available/wecomment /etc/nginx/sites-enabled/wecomment || true
sudo nginx -t && sudo systemctl reload nginx
```

4) Google OAuth (production):

- Set Authorized redirect URI to `https://wecomment.wumbl3.xyz/auth/google/callback` in Google Cloud Console.
- Ensure `BACKEND_BASE_URL=https://wecomment.wumbl3.xyz` in `backend/.env`.

5) Chrome extension (production): set Backend URL to `https://wecomment.wumbl3.xyz` in the extension options.

Note: `flask run` is for development only. In production, systemd starts Gunicorn, which binds to `instance/wecomment.sock`, and Nginx proxies to it. Do not add CORS headers in Nginx; Flask-CORS handles them.

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

