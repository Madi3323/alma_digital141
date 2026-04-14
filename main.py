"""
Alma Digital — FIXED Production Flask Backend (Railway-ready)
"""

import os
import sqlite3
import hashlib
import secrets
from datetime import datetime, timedelta
from functools import wraps

from flask import Flask, render_template, request, jsonify, session
from flask_cors import CORS

# ─── APP ─────────────────────────────────────────────

app = Flask(__name__)

app.secret_key = os.environ.get("SECRET_KEY", "dev_secret_key")

app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
app.config["SESSION_COOKIE_HTTPONLY"] = True
app.config["PERMANENT_SESSION_LIFETIME"] = timedelta(days=7)

CORS(app, supports_credentials=True)

# ─── PATH FIX (ВАЖНО ДЛЯ RAILWAY) ───────────────────

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.path.join(BASE_DIR, "alma.db")
TEMPLATE_DIR = os.path.join(BASE_DIR, "templates")
STATIC_DIR = os.path.join(BASE_DIR, "static")

app = Flask(__name__, template_folder=TEMPLATE_DIR, static_folder=STATIC_DIR)

# ─── DB ──────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn


def init_db():
    with get_db() as conn:
        conn.executescript("""
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT UNIQUE,
            password TEXT,
            name TEXT,
            tariff TEXT DEFAULT 'free',
            created TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS orders (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER,
            title TEXT,
            status TEXT DEFAULT 'pending',
            created TEXT DEFAULT CURRENT_TIMESTAMP
        );

        CREATE TABLE IF NOT EXISTS news (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT,
            body TEXT,
            created TEXT DEFAULT CURRENT_TIMESTAMP
        );
        """)

# ─── AUTH HELPERS ───────────────────────────────────

def hash_pw(p):
    return hashlib.sha256(p.encode()).hexdigest()


def login_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        if "user_id" not in session:
            return jsonify({"error": "unauthorized"}), 401
        return f(*args, **kwargs)
    return wrapper


# ─── PAGES ───────────────────────────────────────────

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/cabinet")
def cabinet():
    return render_template("cabinet.html")


@app.route("/news")
def news():
    return render_template("news.html")


# ─── AUTH API ────────────────────────────────────────

@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json() or {}

    email = data.get("email", "").lower().strip()
    password = data.get("password", "")
    name = data.get("name", "")

    if not email or not password or not name:
        return jsonify({"error": "fill all fields"}), 400

    try:
        with get_db() as conn:
            cur = conn.execute(
                "INSERT INTO users(email, password, name) VALUES(?,?,?)",
                (email, hash_pw(password), name)
            )
            uid = cur.lastrowid
            conn.execute(
                "INSERT INTO orders(user_id, title) VALUES(?,?)",
                (uid, "Welcome order")
            )
    except sqlite3.IntegrityError:
        return jsonify({"error": "email exists"}), 409

    session["user_id"] = uid
    return jsonify({"ok": True})


@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json() or {}

    email = data.get("email", "").lower().strip()
    password = data.get("password", "")

    with get_db() as conn:
        user = conn.execute(
            "SELECT * FROM users WHERE email=? AND password=?",
            (email, hash_pw(password))
        ).fetchone()

    if not user:
        return jsonify({"error": "wrong credentials"}), 401

    session["user_id"] = user["id"]
    return jsonify({"ok": True})


@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"ok": True})


# ─── USER ────────────────────────────────────────────

@app.route("/api/me")
@login_required
def me():
    uid = session["user_id"]
    with get_db() as conn:
        user = conn.execute("SELECT * FROM users WHERE id=?", (uid,)).fetchone()
    return jsonify(dict(user))


@app.route("/api/me/orders")
@login_required
def orders():
    uid = session["user_id"]

    with get_db() as conn:
        rows = conn.execute(
            "SELECT * FROM orders WHERE user_id=? ORDER BY id DESC",
            (uid,)
        ).fetchall()

    return jsonify([dict(r) for r in rows])


# ─── NEWS ────────────────────────────────────────────

@app.route("/api/news")
def news_api():
    with get_db() as conn:
        rows = conn.execute("SELECT * FROM news ORDER BY id DESC").fetchall()
    return jsonify([dict(r) for r in rows])


# ─── HEALTH ──────────────────────────────────────────

@app.route("/health")
def health():
    return jsonify({"status": "ok"})


# ─── START ───────────────────────────────────────────

if __name__ == "__main__":
    init_db()
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port, debug=True)
