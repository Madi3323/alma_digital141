"""
Alma Digital — Production Flask Backend
Stable, clean, Railway-ready.
"""

import os
import sqlite3
import hashlib
import secrets
import json
from datetime import datetime, timedelta
from functools import wraps

from flask import (
    Flask, render_template, request, jsonify,
    session, send_from_directory
)
from flask_cors import CORS

# ─── App Setup ────────────────────────────────────────────────────────────────

app = Flask(__name__)
app.secret_key = os.environ.get("SECRET_KEY", secrets.token_hex(32))
app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

CORS(app, supports_credentials=True)

# ─── Database ─────────────────────────────────────────────────────────────────

DB_PATH = os.path.join(os.path.dirname(__file__), "data", "alma.db")
os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)


def get_db():
    conn = sqlite3.connect(DB_PATH, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA foreign_keys=ON")
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS users (
                id        INTEGER PRIMARY KEY AUTOINCREMENT,
                email     TEXT UNIQUE NOT NULL,
                password  TEXT NOT NULL,
                name      TEXT NOT NULL,
                tariff    TEXT DEFAULT 'free',
                created   TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS orders (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id     INTEGER NOT NULL REFERENCES users(id),
                title       TEXT NOT NULL,
                status      TEXT DEFAULT 'pending',
                amount      REAL DEFAULT 0,
                created     TEXT DEFAULT (datetime('now'))
            );

            CREATE TABLE IF NOT EXISTS news (
                id       INTEGER PRIMARY KEY AUTOINCREMENT,
                title    TEXT NOT NULL,
                body     TEXT NOT NULL,
                created  TEXT DEFAULT (datetime('now'))
            );
        """)
        # Seed demo news if empty
        cur = conn.execute("SELECT COUNT(*) FROM news")
        if cur.fetchone()[0] == 0:
            conn.executemany(
                "INSERT INTO news (title, body) VALUES (?, ?)",
                [
                    ("Alma Digital запущен!", "Мы рады приветствовать первых пользователей платформы."),
                    ("Новый тариф Pro", "Подключите Pro и получите расширенный доступ ко всем инструментам."),
                    ("Обновление API v2", "Новая версия API доступна для интеграции."),
                ]
            )


# ─── Auth Helpers ─────────────────────────────────────────────────────────────

def hash_pw(password: str) -> str:
    return hashlib.sha256(password.encode()).hexdigest()


def login_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "Unauthorized"}), 401
        return f(*args, **kwargs)
    return decorated


def current_user():
    uid = session.get("user_id")
    if not uid:
        return None
    with get_db() as conn:
        row = conn.execute(
            "SELECT id, email, name, tariff, created FROM users WHERE id=?", (uid,)
        ).fetchone()
    return dict(row) if row else None


# ─── Page Routes ──────────────────────────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/cabinet")
def cabinet():
    return render_template("cabinet.html")


@app.route("/news")
def news_page():
    return render_template("news.html")


# ─── Auth API ─────────────────────────────────────────────────────────────────

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    name = (data.get("name") or "").strip()

    if not email or not password or not name:
        return jsonify({"error": "Заполните все поля"}), 400
    if len(password) < 6:
        return jsonify({"error": "Пароль минимум 6 символов"}), 400

    try:
        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO users (email, password, name) VALUES (?, ?, ?)",
                (email, hash_pw(password), name)
            )
            user_id = cur.lastrowid
            # Seed demo order
            conn.execute(
                "INSERT INTO orders (user_id, title, status, amount) VALUES (?, ?, ?, ?)",
                (user_id, "Демо-заявка", "completed", 0)
            )
    except sqlite3.IntegrityError:
        return jsonify({"error": "Email уже используется"}), 409

    session.permanent = True
    session["user_id"] = user_id
    return jsonify({"ok": True, "name": name}), 201


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json(silent=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    with get_db() as conn:
        row = conn.execute(
            "SELECT id, name FROM users WHERE email=? AND password=?",
            (email, hash_pw(password))
        ).fetchone()

    if not row:
        return jsonify({"error": "Неверный email или пароль"}), 401

    session.permanent = True
    session["user_id"] = row["id"]
    return jsonify({"ok": True, "name": row["name"]})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


@app.route("/api/me")
@login_required
def me():
    user = current_user()
    if not user:
        return jsonify({"error": "Not found"}), 404
    return jsonify(user)


@app.route("/api/me/orders")
@login_required
def my_orders():
    uid = session["user_id"]
    page = max(1, int(request.args.get("page", 1)))
    per_page = 10
    offset = (page - 1) * per_page

    with get_db() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM orders WHERE user_id=?", (uid,)
        ).fetchone()[0]
        rows = conn.execute(
            "SELECT id, title, status, amount, created FROM orders "
            "WHERE user_id=? ORDER BY id DESC LIMIT ? OFFSET ?",
            (uid, per_page, offset)
        ).fetchall()

    return jsonify({
        "orders": [dict(r) for r in rows],
        "total": total,
        "page": page,
        "pages": max(1, -(-total // per_page))
    })


@app.route("/api/me/tariff")
@login_required
def my_tariff():
    user = current_user()
    tariffs = {
        "free":  {"name": "Free",  "price": 0,    "requests": 100},
        "pro":   {"name": "Pro",   "price": 4990, "requests": 5000},
        "elite": {"name": "Elite", "price": 14990,"requests": -1},
    }
    plan = tariffs.get(user["tariff"], tariffs["free"])
    return jsonify({"current": user["tariff"], "details": plan})


@app.route("/api/news")
def api_news():
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, title, body, created FROM news ORDER BY id DESC"
        ).fetchall()
    return jsonify([dict(r) for r in rows])


# ─── Health ───────────────────────────────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok", "ts": datetime.utcnow().isoformat()})


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    debug = os.environ.get("FLASK_ENV") == "development"
    print(f"[Alma Digital] Starting on 0.0.0.0:{port}")
    app.run(host="0.0.0.0", port=port, debug=debug)
