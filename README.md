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


