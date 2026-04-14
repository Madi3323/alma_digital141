# Alma Digital

Production-ready fullstack web platform.  
Flask backend · SQLite · Tetris mini-game · Mobile-first design.

---

## Stack

| Layer     | Tech                        |
|-----------|-----------------------------|
| Backend   | Python 3.11 + Flask 3       |
| Auth      | Server-side sessions        |
| Database  | SQLite (WAL mode)           |
| Frontend  | Vanilla JS + CSS Variables  |
| Deploy    | Railway (Gunicorn)          |

---

## Structure

```
alma-digital/
├── main.py            # Flask app + all API routes
├── requirements.txt
├── Procfile           # Railway entry point
├── data/              # SQLite DB (auto-created)
├── static/
│   ├── style.css      # Design system
│   ├── script.js      # App logic (nav, auth, cabinet)
│   └── tetris.js      # Tetris game engine
└── templates/
    ├── index.html     # Landing page
    ├── cabinet.html   # User cabinet
    └── news.html      # News feed
```

---

## API Endpoints

| Method | Path              | Auth | Description          |
|--------|-------------------|------|----------------------|
| POST   | /api/register     | —    | Create account       |
| POST   | /api/login        | —    | Login                |
| POST   | /api/logout       | ✓    | Logout               |
| GET    | /api/me           | ✓    | Current user info    |
| GET    | /api/me/orders    | ✓    | Paginated orders     |
| GET    | /api/me/tariff    | ✓    | Tariff details       |
| GET    | /api/news         | —    | News list            |
| GET    | /health           | —    | Health check         |

---

## Deploy on Railway

1. Push to GitHub
2. Connect repo in Railway → New Project
3. Set env variable: `SECRET_KEY=your-random-secret`
4. Railway auto-detects `Procfile` and deploys

The app listens on `0.0.0.0:$PORT` automatically.  
SQLite DB is created at `./data/alma.db` on first boot.

---

## Local Development

```bash
pip install -r requirements.txt
FLASK_ENV=development python main.py
# → http://localhost:5000
```

---

## Features

- **Landing** — hero, features, pricing tiers
- **Cabinet** — overview, orders (lazy + paginated), tariff info
- **News** — fetched from API, skeleton loading
- **Tetris** — full SRS rotation, ghost piece, levels, no memory leaks
- **Mobile** — burger menu, single-column layout, touch-friendly buttons (44px+)
- **Auth** — session-based, login/register modal
