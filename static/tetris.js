/**
 * Alma Digital — Tetris Mini-Game
 * Optimized: single rAF loop, no memory leaks, canvas scaling.
 */

(function () {
  "use strict";

  const COLS = 10;
  const ROWS = 20;
  const COLORS = [
    null,
    "#5865f7", // I
    "#f0c040", // O
    "#9b59b6", // T
    "#22c55e", // S
    "#ef4444", // Z
    "#f59e0b", // J
    "#3b82f6", // L
  ];

  // Tetromino shapes [type][rotation]
  const SHAPES = [
    null,
    [[1,1,1,1]],                          // I
    [[2,2],[2,2]],                         // O
    [[0,3,0],[3,3,3]],                     // T
    [[0,4,4],[4,4,0]],                     // S
    [[5,5,0],[0,5,5]],                     // Z
    [[6,0],[6,0],[6,6]],                   // J
    [[0,7],[0,7],[7,7]],                   // L
  ];

  // Kick table (SRS simplified)
  const KICKS = [
    [[0,0],[-1,0],[-1,1],[0,-2],[-1,-2]],
    [[0,0],[1,0],[1,-1],[0,2],[1,2]],
    [[0,0],[1,0],[1,1],[0,-2],[1,-2]],
    [[0,0],[-1,0],[-1,-1],[0,2],[-1,2]],
  ];

  class Tetris {
    constructor(canvas, nextCanvas, scoreEl, levelEl, linesEl, startBtn, pauseBtn) {
      this.canvas    = canvas;
      this.nextCanvas= nextCanvas;
      this.ctx       = canvas.getContext("2d");
      this.nCtx      = nextCanvas.getContext("2d");
      this.scoreEl   = scoreEl;
      this.levelEl   = levelEl;
      this.linesEl   = linesEl;
      this.startBtn  = startBtn;
      this.pauseBtn  = pauseBtn;

      this._raf   = null;
      this._last  = 0;
      this._drop  = 0;
      this.running = false;
      this.paused  = false;

      this._board = [];
      this._piece = null;
      this._next  = null;
      this._score = 0;
      this._lines = 0;
      this._level = 1;

      this._bound = {
        keydown: this._onKey.bind(this),
      };

      this._setupButtons();
    }

    // ── Public API ─────────────────────────────────────────────

    start() {
      this._reset();
      this.running = true;
      this.paused  = false;
      this.startBtn.textContent = "↺ Заново";
      this.pauseBtn.disabled    = false;
      this.pauseBtn.textContent = "⏸ Пауза";
      document.addEventListener("keydown", this._bound.keydown);
      this._last = performance.now();
      this._tick(this._last);
    }

    stop() {
      this.running = false;
      cancelAnimationFrame(this._raf);
      this._raf = null;
      document.removeEventListener("keydown", this._bound.keydown);
      this.pauseBtn.disabled = true;
    }

    toggle_pause() {
      if (!this.running) return;
      this.paused = !this.paused;
      this.pauseBtn.textContent = this.paused ? "▶ Продолжить" : "⏸ Пауза";
      if (!this.paused) {
        this._last = performance.now();
        this._tick(this._last);
      }
    }

    // ── Internal ───────────────────────────────────────────────

    _reset() {
      this._board = Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
      this._score = 0;
      this._lines = 0;
      this._level = 1;
      this._next  = this._newPiece();
      this._spawn();
      this._updateUI();
    }

    _tick(ts) {
      if (!this.running || this.paused) return;
      const dt = ts - this._last;
      this._last = ts;
      this._drop += dt;
      const interval = Math.max(80, 800 - (this._level - 1) * 70);
      if (this._drop >= interval) {
        this._drop = 0;
        this._moveDown();
      }
      this._draw();
      this._raf = requestAnimationFrame(this._tick.bind(this));
    }

    _newPiece() {
      const type = Math.floor(Math.random() * 7) + 1;
      return { type, shape: SHAPES[type], rot: 0, x: 3, y: 0 };
    }

    _spawn() {
      this._piece = this._next;
      this._next  = this._newPiece();
      // Game over check
      if (this._collide(this._piece, 0, 0)) {
        this._gameOver();
      }
    }

    _collide(piece, dx, dy, rot) {
      const shape = rot !== undefined ? this._rotate(piece.shape, rot - piece.rot) : piece.shape;
      for (let r = 0; r < shape.length; r++) {
        for (let c = 0; c < shape[r].length; c++) {
          if (!shape[r][c]) continue;
          const nx = piece.x + c + dx;
          const ny = piece.y + r + dy;
          if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
          if (ny >= 0 && this._board[ny][nx]) return true;
        }
      }
      return false;
    }

    _rotate(shape, times) {
      let s = shape;
      const n = ((times % 4) + 4) % 4;
      for (let t = 0; t < n; t++) {
        s = s[0].map((_, i) => s.map(r => r[i]).reverse());
      }
      return s;
    }

    _lock() {
      const { shape, x, y, type } = this._piece;
      shape.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell && y + r >= 0) {
            this._board[y + r][x + c] = type;
          }
        });
      });
      this._clearLines();
      this._spawn();
    }

    _clearLines() {
      let cleared = 0;
      for (let r = ROWS - 1; r >= 0; r--) {
        if (this._board[r].every(c => c !== 0)) {
          this._board.splice(r, 1);
          this._board.unshift(new Array(COLS).fill(0));
          cleared++;
          r++;
        }
      }
      if (!cleared) return;
      const pts = [0, 100, 300, 500, 800][cleared] * this._level;
      this._score += pts;
      this._lines += cleared;
      this._level = Math.floor(this._lines / 10) + 1;
      this._updateUI();
    }

    _moveDown() {
      if (!this._collide(this._piece, 0, 1)) {
        this._piece.y++;
      } else {
        this._lock();
      }
    }

    _hardDrop() {
      while (!this._collide(this._piece, 0, 1)) {
        this._piece.y++;
        this._score += 2;
      }
      this._lock();
      this._updateUI();
    }

    _moveLeft() {
      if (!this._collide(this._piece, -1, 0)) this._piece.x--;
    }

    _moveRight() {
      if (!this._collide(this._piece, 1, 0)) this._piece.x++;
    }

    _rotatePiece() {
      const newShape = this._rotate(this._piece.shape, 1);
      const oldShape = this._piece.shape;
      this._piece.shape = newShape;
      if (this._collide(this._piece, 0, 0)) {
        // Try kicks
        let kicked = false;
        for (const [kx, ky] of KICKS[this._piece.rot % 4]) {
          if (!this._collide(this._piece, kx, ky)) {
            this._piece.x += kx;
            this._piece.y += ky;
            kicked = true;
            break;
          }
        }
        if (!kicked) this._piece.shape = oldShape;
        else this._piece.rot = (this._piece.rot + 1) % 4;
      } else {
        this._piece.rot = (this._piece.rot + 1) % 4;
      }
    }

    _onKey(e) {
      if (!this.running || this.paused) return;
      switch (e.code) {
        case "ArrowLeft":  e.preventDefault(); this._moveLeft();   break;
        case "ArrowRight": e.preventDefault(); this._moveRight();  break;
        case "ArrowDown":  e.preventDefault(); this._moveDown(); this._score++; this._updateUI(); break;
        case "ArrowUp":    e.preventDefault(); this._rotatePiece(); break;
        case "Space":      e.preventDefault(); this._hardDrop();   break;
      }
    }

    _gameOver() {
      this.stop();
      this.startBtn.textContent = "▶ Старт";
      this._drawGameOver();
    }

    // ── Drawing ────────────────────────────────────────────────

    get _cellW() { return this.canvas.width / COLS; }
    get _cellH() { return this.canvas.height / ROWS; }

    _draw() {
      const { ctx, canvas, _board, _piece } = this;
      const cw = this._cellW;
      const ch = this._cellH;

      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Board
      _board.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell) this._drawCell(ctx, c, r, COLORS[cell], cw, ch);
        });
      });

      // Ghost
      if (_piece) {
        let ghostY = _piece.y;
        while (!this._collide(_piece, 0, ghostY - _piece.y + 1)) ghostY++;
        if (ghostY !== _piece.y) {
          _piece.shape.forEach((row, r) => {
            row.forEach((cell, c) => {
              if (cell) {
                ctx.globalAlpha = 0.2;
                this._drawCell(ctx, _piece.x + c, ghostY + r, COLORS[_piece.type], cw, ch);
                ctx.globalAlpha = 1;
              }
            });
          });
        }
      }

      // Active piece
      if (_piece) {
        _piece.shape.forEach((row, r) => {
          row.forEach((cell, c) => {
            if (cell) this._drawCell(ctx, _piece.x + c, _piece.y + r, COLORS[_piece.type], cw, ch);
          });
        });
      }

      // Grid
      ctx.strokeStyle = "rgba(255,255,255,.04)";
      ctx.lineWidth = 1;
      for (let r = 0; r <= ROWS; r++) {
        ctx.beginPath(); ctx.moveTo(0, r * ch); ctx.lineTo(canvas.width, r * ch); ctx.stroke();
      }
      for (let c = 0; c <= COLS; c++) {
        ctx.beginPath(); ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, canvas.height); ctx.stroke();
      }

      // Next piece
      this._drawNext();
    }

    _drawCell(ctx, x, y, color, cw, ch) {
      const pad = 1;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.roundRect(x * cw + pad, y * ch + pad, cw - pad * 2, ch - pad * 2, 3);
      ctx.fill();
      // Highlight
      ctx.fillStyle = "rgba(255,255,255,.18)";
      ctx.fillRect(x * cw + pad, y * ch + pad, cw - pad * 2, 3);
    }

    _drawNext() {
      const { nCtx, nextCanvas, _next } = this;
      const size = 20;
      nCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
      if (!_next) return;
      const shape = _next.shape;
      const offX = Math.floor((4 - shape[0].length) / 2);
      const offY = Math.floor((4 - shape.length) / 2);
      shape.forEach((row, r) => {
        row.forEach((cell, c) => {
          if (cell) {
            nCtx.fillStyle = COLORS[_next.type];
            nCtx.fillRect((offX + c) * size, (offY + r) * size, size - 2, size - 2);
          }
        });
      });
    }

    _drawGameOver() {
      const { ctx, canvas } = this;
      ctx.fillStyle = "rgba(8,11,20,.8)";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#e8eaf2";
      ctx.font = `bold ${canvas.width / 8}px 'Syne', sans-serif`;
      ctx.textAlign = "center";
      ctx.fillText("Игра окончена", canvas.width / 2, canvas.height / 2 - 20);
      ctx.font = `${canvas.width / 12}px 'Inter', sans-serif`;
      ctx.fillStyle = "#6b7280";
      ctx.fillText(`Очки: ${this._score}`, canvas.width / 2, canvas.height / 2 + 20);
    }

    _updateUI() {
      if (this.scoreEl) this.scoreEl.textContent = this._score.toLocaleString("ru-RU");
      if (this.levelEl) this.levelEl.textContent = this._level;
      if (this.linesEl) this.linesEl.textContent = this._lines;
    }

    _setupButtons() {
      this.startBtn?.addEventListener("click", () => this.start());
      this.pauseBtn?.addEventListener("click", () => this.toggle_pause());
    }
  }

  /* ─── Public init ─────────────────────────────────────────── */

  window.TetrisGame = {
    _instance: null,
    init(canvasId, nextId, scoreId, levelId, linesId, startId, pauseId) {
      if (this._instance) this._instance.stop();
      const canvas   = document.getElementById(canvasId);
      const next     = document.getElementById(nextId);
      const scoreEl  = document.getElementById(scoreId);
      const levelEl  = document.getElementById(levelId);
      const linesEl  = document.getElementById(linesId);
      const startBtn = document.getElementById(startId);
      const pauseBtn = document.getElementById(pauseId);
      if (!canvas) return;

      // Responsive canvas
      const wrapper = canvas.parentElement;
      if (wrapper) {
        const maxW = Math.min(240, wrapper.clientWidth - 140 || 240);
        canvas.width  = maxW;
        canvas.height = maxW * 2;
      }

      this._instance = new Tetris(canvas, next, scoreEl, levelEl, linesEl, startBtn, pauseBtn);
    },
  };

  // Expose stop for logout
  window._tetrisStop = () => {
    window.TetrisGame._instance?.stop();
  };

})();
