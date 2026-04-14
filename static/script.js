
/**
 * Alma Digital — Main Script
 * Handles: nav, auth modal, cabinet panels, news loading.
 * No globals pollution. Cached DOM. Lazy data loads.
 */

(function () {
  "use strict";

  /* ─── Utilities ───────────────────────────────────────────── */

  const $ = (sel, ctx = document) => ctx.querySelector(sel);
  const $$ = (sel, ctx = document) => ctx.querySelectorAll(sel);

  async function api(path, opts = {}) {
    const res = await fetch(path, {
      credentials: "include",
      headers: { "Content-Type": "application/json", ...(opts.headers || {}) },
      ...opts,
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok, status: res.status, data };
  }

  function fmtDate(str) {
    if (!str) return "—";
    return new Date(str).toLocaleDateString("ru-RU", {
      day: "2-digit", month: "short", year: "numeric",
    });
  }

  function showError(el, msg) {
    el.textContent = msg;
    el.classList.add("visible");
  }
  function clearError(el) {
    el.textContent = "";
    el.classList.remove("visible");
  }

  /* ─── Nav / Burger ────────────────────────────────────────── */

  function initNav() {
    const burger = $("#navBurger");
    const links = $("#navLinks");
    if (!burger || !links) return;

    burger.addEventListener("click", () => {
      const open = burger.classList.toggle("open");
      links.classList.toggle("open", open);
    });

    // Close on link click (mobile)
    links.addEventListener("click", (e) => {
      if (e.target.tagName === "A") {
        burger.classList.remove("open");
        links.classList.remove("open");
      }
    });

    // Scroll shadow
    window.addEventListener("scroll", () => {
      const nav = $("#nav");
      nav && nav.classList.toggle("scrolled", window.scrollY > 20);
    }, { passive: true });
  }

  /* ─── Auth Modal ──────────────────────────────────────────── */

  function initAuth() {
    const overlay = $("#authOverlay");
    if (!overlay) return;

    const tabs    = $$(".modal__tab");
    const panels  = $$(".modal__panel");
    const loginErr = $("#loginError");
    const regErr   = $("#registerError");

    // Tab switching
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        tabs.forEach(t => t.classList.remove("active"));
        panels.forEach(p => p.classList.remove("active"));
        tab.classList.add("active");
        $(`#tab${cap(tab.dataset.tab)}`).classList.add("active");
        clearError(loginErr);
        clearError(regErr);
      });
    });

    function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

    // Login
    $("#loginBtn")?.addEventListener("click", async () => {
      clearError(loginErr);
      const email = $("#loginEmail").value.trim();
      const password = $("#loginPass").value;
      if (!email || !password) return showError(loginErr, "Заполните все поля");

      const { ok, data } = await api("/api/login", {
        method: "POST",
        body: JSON.stringify({ email, password }),
      });
      if (!ok) return showError(loginErr, data.error || "Ошибка входа");
      overlay.style.display = "none";
      loadCabinet();
    });

    // Register
    $("#registerBtn")?.addEventListener("click", async () => {
      clearError(regErr);
      const name = $("#regName").value.trim();
      const email = $("#regEmail").value.trim();
      const password = $("#regPass").value;
      if (!name || !email || !password) return showError(regErr, "Заполните все поля");

      const { ok, data } = await api("/api/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      if (!ok) return showError(regErr, data.error || "Ошибка регистрации");
      overlay.style.display = "none";
      loadCabinet();
    });

    // Enter key
    document.addEventListener("keydown", (e) => {
      if (e.key !== "Enter") return;
      const active = $(".modal__panel.active");
      if (!active) return;
      active.id === "tabLogin"
        ? $("#loginBtn")?.click()
        : $("#registerBtn")?.click();
    });
  }

  /* ─── Cabinet ─────────────────────────────────────────────── */

  let _state = {
    user: null,
    tariff: null,
    ordersPage: 1,
    ordersTotal: 0,
    ordersCache: {}, // page → items
    loaded: {},      // panel keys
  };

  async function checkSession() {
    const { ok, data } = await api("/api/me");
    return ok ? data : null;
  }

  async function loadCabinet() {
    const app = $("#cabinetApp");
    const overlay = $("#authOverlay");
    if (!app) return;

    const user = await checkSession();
    if (!user) {
      if (overlay) overlay.style.display = "flex";
      app.style.display = "none";
      return;
    }

    _state.user = user;
    overlay && (overlay.style.display = "none");
    app.style.display = "flex";
    $("#logoutBtn") && ($("#logoutBtn").style.display = "inline-flex");

    // Fill sidebar
    const nameEl = $("#sidebarName");
    const avatarEl = $("#sidebarAvatar");
    const tariffEl = $("#sidebarTariff");
    if (nameEl) nameEl.textContent = user.name;
    if (avatarEl) avatarEl.textContent = user.name.charAt(0).toUpperCase();
    if (tariffEl) tariffEl.textContent = user.tariff;

    // Init panels
    initSidebarNav();
    initLogout();
    showPanel("overview");
  }

  function initSidebarNav() {
    const items = $$(".sidebar__item");
    items.forEach((btn) => {
      btn.addEventListener("click", () => {
        items.forEach(i => i.classList.remove("active"));
        btn.classList.add("active");
        showPanel(btn.dataset.panel);
      });
    });
  }

  function showPanel(name) {
    $$(".panel").forEach(p => p.classList.remove("active"));
    const panel = $(`#panel${cap(name)}`);
    if (panel) panel.classList.add("active");

    // Lazy load per panel
    if (!_state.loaded[name]) {
      _state.loaded[name] = true;
      const loaders = { overview: loadOverview, orders: loadOrders, tariff: loadTariff };
      loaders[name]?.();
    }

    // Tetris: only init when first opened
    if (name === "tetris") initTetrisIfNeeded();
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  async function loadOverview() {
    const user = _state.user;
    setText("#ovTariff", user.tariff);
    setText("#ovCreated", fmtDate(user.created));

    // Load tariff for request count
    if (!_state.tariff) {
      const { ok, data } = await api("/api/me/tariff");
      if (ok) _state.tariff = data;
    }
    if (_state.tariff) {
      const req = _state.tariff.details.requests;
      setText("#ovRequests", req === -1 ? "∞" : req.toLocaleString("ru-RU"));
    }

    // Load first page of orders for count + recent
    const { ok, data } = await api("/api/me/orders?page=1");
    if (ok) {
      _state.ordersTotal = data.total;
      setText("#ovOrders", data.total);
      renderOrdersList("#recentOrders", data.orders.slice(0, 5));
    }
  }

  async function loadOrders(page) {
    page = page || _state.ordersPage;
    if (_state.ordersCache[page]) {
      renderOrdersList("#ordersContainer", _state.ordersCache[page]);
      renderPagination(page);
      return;
    }
    const { ok, data } = await api(`/api/me/orders?page=${page}`);
    if (!ok) return;
    _state.ordersCache[page] = data.orders;
    _state.ordersTotal = data.total;
    _state.ordersPage = page;
    renderOrdersList("#ordersContainer", data.orders);
    renderPagination(page, data.pages);
  }

  async function loadTariff() {
    if (!_state.tariff) {
      const { ok, data } = await api("/api/me/tariff");
      if (ok) _state.tariff = data;
    }
    const t = _state.tariff;
    if (!t) return;
    setText("#tariffPlan", t.details.name);
    setText("#tariffPrice", t.details.price === 0 ? "Бесплатно" : `${t.details.price.toLocaleString("ru-RU")} ₸/мес`);
    const req = t.details.requests;
    setText("#tariffRequests", `${req === -1 ? "Безлимит" : req.toLocaleString("ru-RU")} запросов/мес`);
  }

  function renderOrdersList(selector, orders) {
    const el = $(selector);
    if (!el) return;
    if (!orders || !orders.length) {
      el.innerHTML = `<div class="empty-state">Заявок пока нет</div>`;
      return;
    }
    el.innerHTML = orders.map(o => `
      <div class="order-item">
        <span class="order-item__title">${escHtml(o.title)}</span>
        <span class="order-item__date">${fmtDate(o.created)}</span>
        <span class="order-item__amount">${o.amount ? o.amount.toLocaleString("ru-RU") + " ₸" : ""}</span>
        <span class="badge badge--${o.status}">${statusLabel(o.status)}</span>
      </div>
    `).join("");
  }

  function renderPagination(currentPage, totalPages) {
    const el = $("#pagination");
    if (!el || !totalPages || totalPages <= 1) { el && (el.innerHTML = ""); return; }
    let html = "";
    for (let i = 1; i <= totalPages; i++) {
      html += `<button class="${i === currentPage ? "active" : ""}" data-page="${i}">${i}</button>`;
    }
    el.innerHTML = html;
    el.querySelectorAll("button").forEach(btn => {
      btn.addEventListener("click", () => loadOrders(+btn.dataset.page));
    });
  }

  function statusLabel(s) {
    return { pending: "В ожидании", completed: "Выполнено", cancelled: "Отменено" }[s] || s;
  }

  function setText(sel, val) {
    const el = $(sel);
    if (el) el.textContent = val ?? "—";
  }

  function escHtml(str) {
    return String(str).replace(/[&<>"']/g, c =>
      ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" }[c])
    );
  }

  function initLogout() {
    const handler = async () => {
      await api("/api/logout", { method: "POST" });
      _state = { user:null, tariff:null, ordersPage:1, ordersTotal:0, ordersCache:{}, loaded:{} };
      const app = $("#cabinetApp");
      const overlay = $("#authOverlay");
      if (app) app.style.display = "none";
      if (overlay) overlay.style.display = "flex";
      $("#logoutBtn") && ($("#logoutBtn").style.display = "none");
      // Reset tetris
      window._tetrisStop?.();
    };

    $("#logoutBtn")?.addEventListener("click", handler);
    $("#sidebarLogout")?.addEventListener("click", handler);
  }

  /* ─── Tetris init bridge ───────────────────────────────────── */

  let tetrisInitialized = false;
  function initTetrisIfNeeded() {
    if (!tetrisInitialized && typeof window.TetrisGame !== "undefined") {
      window.TetrisGame.init("tetrisCanvas", "tetrisNext", "tetrisScore", "tetrisLevel", "tetrisLines", "tetrisStart", "tetrisPause");
      tetrisInitialized = true;
    }
  }

  /* ─── News ────────────────────────────────────────────────── */

  async function loadNews() {
    const grid = $("#newsGrid");
    if (!grid) return;
    const { ok, data } = await api("/api/news");
    if (!ok) {
      grid.innerHTML = `<p class="empty-state">Не удалось загрузить новости</p>`;
      return;
    }
    if (!data.length) {
      grid.innerHTML = `<p class="empty-state">Новостей пока нет</p>`;
      return;
    }
    grid.innerHTML = data.map(n => `
      <article class="news-card">
        <div class="news-card__date">${fmtDate(n.created)}</div>
        <h2 class="news-card__title">${escHtml(n.title)}</h2>
        <p class="news-card__body">${escHtml(n.body)}</p>
      </article>
    `).join("");
  }

  /* ─── Bootstrap ───────────────────────────────────────────── */

  document.addEventListener("DOMContentLoaded", () => {
    initNav();

    if (document.body.classList.contains("page-cabinet")) {
      initAuth();
      loadCabinet();
    }

    if (document.body.classList.contains("page-news")) {
      loadNews();
    }
  });

})();
