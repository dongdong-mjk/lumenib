// 손글씨 노트 종이: 펜 · 형광펜 · 지우개 · 올가미
// 좌표는 종이 기준 논리 단위(폭 726)로 저장하고, 화면 크기에 맞춰 늘리고 줄여요.
import { esc, toast } from './util.js';
import { refText } from './bible.js';
import { settings } from './store.js';
import { getStroke } from './vendor/perfect-freehand.js';

export const PAGE_W = 726;
export const PAGE_H = 1027; // A4 비율
const LINE = 33.68; // 피그마 A4 줄 종이 간격
const MARGIN = 18.7;

// 피그마 Primitive pen/* 12색
export const PEN_PALETTE = ['#111111', '#5c5c5c', '#a3a3a3', '#004ce5', '#3e8ef7', '#1c9c6b', '#dc3333', '#f07a1a', '#e8b517', '#8b4fd9', '#d94f9a', '#7a5230'];
// 피그마 pen/highlighter-1~3 이 툴바 기본 3색
export const HL_PALETTE = ['#e8b517', '#1c9c6b', '#d94f9a', '#ffd84d', '#ff8fa3', '#8cbfff'];
// 툴바의 색 3칸 (고른 색을 바꿔 끼울 수 있어요)
if (!settings.penColors) settings.penColors = ['#111111', '#004ce5', '#dc3333'];
// 예전 기본 3색을 그대로 쓰던 사람은 피그마 색으로 바꿔요 (직접 고른 색은 그대로)
if (!settings.hlColors || settings.hlColors.join() === '#ffd84d,#ff8fa3,#8cbfff') settings.hlColors = ['#e8b517', '#1c9c6b', '#d94f9a'];
export const PEN_COLORS = settings.penColors;
export const HL_COLORS = settings.hlColors;
// 굵기 3칸 (굿노트처럼 고른 칸을 한 번 더 누르면 슬라이더로 바꿀 수 있어요). 칸마다 바꾼 값을 기억해요.
if (!Array.isArray(settings.penSizes) || settings.penSizes.length !== 3) settings.penSizes = [1.6, 2.6, 4];
if (!Array.isArray(settings.hlSizes) || settings.hlSizes.length !== 3) settings.hlSizes = [12, 18, 26];
export const PEN_SIZES = settings.penSizes;
export const HL_SIZES = settings.hlSizes;
export const SIZE_RANGE = { pen: [0.6, 10], hl: [4, 48], eraser: [4, 64] };
export const SIZE_DEFAULT = { pen: [1.6, 2.6, 4], hl: [12, 18, 26], eraser: [8, 18, 32] };
if (!Array.isArray(settings.eraserSizes) || settings.eraserSizes.length !== 3) settings.eraserSizes = [8, 18, 32];
export const ERASER_SIZES = settings.eraserSizes;
// 형광펜 진하기 (0.2 연하게 ~ 0.8 진하게). 새로 긋는 획부터 적용돼요.
export const HL_ALPHA_DEFAULT = 0.42;
if (typeof settings.hlAlpha !== 'number') settings.hlAlpha = HL_ALPHA_DEFAULT;

// 펜 종류 (굿노트 참고). 기본은 필압 없는 볼펜.
// 예전 설정에서 필압을 켜 두었던 사람도 새 기본(볼펜)으로 시작해요.
export const PEN_STYLES = [
  { id: 'ball', name: '볼펜', desc: '누르는 힘과 상관없이 같은 굵기' },
  { id: 'fountain', name: '만년필', desc: '세게 누르면 굵게, 살살 쓰면 가늘게' },
  { id: 'brush', name: '붓펜', desc: '굵기 차이가 크고 끝이 붓처럼 가늘어져요' },
];
if (!PEN_STYLES.some((p) => p.id === settings.penStyle)) settings.penStyle = 'ball';
// 펜 종류마다 세부 설정 (굿노트 기본값처럼 50%). sharp = 팁 선명도, pressure = 필압 민감도, flat = 평평함(만년필 펜촉이 납작해서 방향 따라 굵기가 바뀜, 기본 0), stab = 손떨림 보정
export const PEN_OPT_DEFAULT = { sharp: 50, pressure: 50, flat: 0, stab: 50 };
if (!settings.penOpts) settings.penOpts = {};
for (const p of PEN_STYLES) settings.penOpts[p.id] = { ...PEN_OPT_DEFAULT, ...(settings.penOpts[p.id] || {}) };
// 어떤 설정이 어떤 펜에 쓰이는지 (굿노트: 볼펜은 끝 모양·필압 없음, 필압 조절은 만년필만)
export const PEN_OPT_FOR = { ball: ['stab'], fountain: ['sharp', 'pressure', 'flat', 'stab'], brush: ['sharp', 'stab'] };

export const tool = { type: 'pen', penColor: 0, penSize: 1, hlColor: 0, hlSize: 1, eraserSize: 1, eraserMode: 'stroke' };

export class Paper {
  constructor(scrollEl, note, opts = {}) {
    this.scrollEl = scrollEl;
    this.note = note;
    this.readonly = !!opts.readonly;
    this.onChange = opts.onChange || (() => {});
    this.onHistory = opts.onHistory || (() => {});
    this.onLayout = opts.onLayout;
    this.fingerDraw = !!opts.fingerDraw;
    this.undoStack = [];
    this.redoStack = [];
    this.selection = null;
    this.pagesEl = document.createElement('div');
    this.pagesEl.className = 'pages';
    scrollEl.innerHTML = '';
    scrollEl.appendChild(this.pagesEl);
    scrollEl.className = 'paper-scroll' + (this.fingerDraw && !this.readonly ? ' finger' : '');
    this._ro = new ResizeObserver(() => { cancelAnimationFrame(this._raf); this._raf = requestAnimationFrame(() => this.layout()); });
    this._ro.observe(scrollEl);
    // Apple Pencil로 쓸 때 화면이 같이 스크롤되지 않게 (손가락 스크롤은 그대로)
    // 손가락 필기를 켜면: 한 손가락 = 쓰기, 두 손가락 = 스크롤
    // 두 손가락 = 확대·축소 (+ 손가락 필기 모드에서는 이동도)
    this._cancels = [];
    this.zoom = 1;
    this._touchBlock = (e) => {
      // 버튼(올가미 메뉴, 인용 빼기 등)은 펜슬로 눌러도 클릭이 되게 막지 않아요
      if (e.target.closest && e.target.closest('button, .lasso-menu, .cite-ui, input, a')) return;
      const stylus = [...e.touches].some((t) => t.touchType === 'stylus');
      if (stylus) { if (!this.readonly) e.preventDefault(); return; }
      // 두 손가락 탭 = 되돌리기 (짧게 톡, 거의 안 움직였을 때만)
      if (e.type === 'touchstart') {
        if (e.touches.length === 2 && !this._tap2) this._tap2 = { t: performance.now(), pts: [...e.touches].map((t) => [t.identifier, t.clientX, t.clientY]), ok: true };
        else if (e.touches.length > 2 && this._tap2) this._tap2.ok = false;
      } else if (this._tap2 && this._tap2.ok) {
        for (const t of e.touches) {
          const o = this._tap2.pts.find((q) => q[0] === t.identifier);
          if (o && Math.hypot(t.clientX - o[1], t.clientY - o[2]) > 12) this._tap2.ok = false;
        }
      }
      if (e.touches.length >= 2) {
        e.preventDefault();
        const [a, b] = e.touches;
        const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
        const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (!this._pan) { this.startPinch(cx, cy, dist); this._cancels.forEach((f) => f()); }
        else this.movePinch(cx, cy, dist);
      }
    };
    this._touchEnd = (e) => {
      if (e.touches.length < 2 && this._pan) this.endPinch();
      if (e.touches.length === 0 && this._tap2) {
        const tp = this._tap2; this._tap2 = null;
        if (tp.ok && performance.now() - tp.t < 350 && !this.readonly) {
          if (this.undoStack.length) { this.undo(); toast('되돌렸어요'); } else toast('되돌릴 게 없어요');
        }
      }
    };
    scrollEl.addEventListener('touchstart', this._touchBlock, { passive: false });
    scrollEl.addEventListener('touchmove', this._touchBlock, { passive: false });
    scrollEl.addEventListener('touchend', this._touchEnd);
    scrollEl.addEventListener('touchcancel', this._touchEnd);
  }

  destroy() {
    this._ro.disconnect();
    this.scrollEl.removeEventListener('touchstart', this._touchBlock);
    this.scrollEl.removeEventListener('touchmove', this._touchBlock);
    this.scrollEl.removeEventListener('touchend', this._touchEnd);
    this.scrollEl.removeEventListener('touchcancel', this._touchEnd);
  }

  // ---------- 확대 · 축소 ----------
  // 손가락을 움직이는 동안은 CSS로만 키웠다가, 손을 떼면 그 배율로 다시 선명하게 그려요
  startPinch(cx, cy, dist) {
    const r = this.scrollEl.getBoundingClientRect();
    this._pan = { cx, cy, dist, ox: cx - r.left, oy: cy - r.top, z: 1, sl: this.scrollEl.scrollLeft, st: this.scrollEl.scrollTop };
    const pr = this.pagesEl.getBoundingClientRect();
    this.pagesEl.style.transformOrigin = `${cx - pr.left}px ${cy - pr.top}px`;
  }
  movePinch(cx, cy, dist) {
    const p = this._pan;
    const z = Math.min(3 / this.zoom, Math.max(1 / this.zoom, dist / p.dist));
    p.z = z;
    this.pagesEl.style.transform = `translate(${cx - p.cx}px, ${cy - p.cy}px) scale(${z})`;
    p.lx = cx; p.ly = cy;
  }
  endPinch() {
    const p = this._pan; this._pan = null;
    const el = this.scrollEl;
    this.pagesEl.style.transform = ''; this.pagesEl.style.transformOrigin = '';
    const z0 = this.zoom, z1 = Math.min(3, Math.max(1, z0 * p.z));
    // 손가락 가운데 있던 종이 위치가 그대로 그 자리에 오게
    const offL = this.pagesEl.offsetLeft, offT = this.pagesEl.offsetTop;
    const contentX = (p.sl + p.ox - offL) / z0, contentY = (p.st + p.oy - offT) / z0;
    const dx = (p.lx ?? p.cx) - p.cx, dy = (p.ly ?? p.cy) - p.cy;
    this.zoom = z1;
    el.classList.toggle('zoomed', z1 > 1.001);
    this.layout();
    el.scrollLeft = contentX * z1 + this.pagesEl.offsetLeft - p.ox - dx;
    el.scrollTop = contentY * z1 + this.pagesEl.offsetTop - p.oy - dy;
  }

  setFingerDraw(on) {
    this.fingerDraw = on;
    this.scrollEl.classList.toggle('finger', on && !this.readonly);
  }

  // ---------- 그리기 준비 ----------
  async render() {
    const n = this.note;
    this.pagesEl.innerHTML = '';
    this.pages = [];
    this.scrollEl.classList.remove('paper-lined', 'paper-grid', 'paper-dot', 'paper-blank');
    this.scrollEl.classList.add('paper-' + (n.paper || 'lined'));
    // 마지막 장은 항상 빈 장으로 하나 더
    if (!n.readonlySeed && !this.readonly) this.ensureTrailingPage();
    this._cancels = [];
    n.pages.forEach((pg, i) => this.buildPage(i));
    this.layout();
  }

  ensureTrailingPage() {
    const p = this.note.pages;
    const last = p[p.length - 1];
    const used = last.strokes.length || this.note.citations.some((c) => c.page === p.length - 1);
    if (used) { p.push({ strokes: [] }); return true; }
    return false;
  }

  buildPage(i) {
    const pageEl = document.createElement('div');
    pageEl.className = 'page';
    const inner = document.createElement('div');
    inner.className = 'page-inner';
    inner.style.height = PAGE_H + 'px';
    const bg = document.createElement('canvas');
    bg.className = 'bg';
    pageEl.appendChild(bg);
    pageEl.appendChild(inner);
    const ui = document.createElement('div');
    ui.className = 'page-ui';
    ui.style.height = PAGE_H + 'px';
    // base = 형광펜(곱하기로 본문 글자 밑에 깔린 것처럼), ink = 펜 글씨(그대로, 종이 줄이 비치지 않게), live = 쓰는 중인 획
    const base = document.createElement('canvas');
    const ink = document.createElement('canvas');
    ink.className = 'ink';
    const live = document.createElement('canvas');
    live.className = 'live';
    pageEl.appendChild(base);
    pageEl.appendChild(ink);
    pageEl.appendChild(live);
    pageEl.appendChild(ui);
    this.pagesEl.appendChild(pageEl);
    const page = { i, el: pageEl, inner, ui, bg, base, ink, live, linesTop: 10 };
    this.pages[i] = page;
    if (i === 0) this.renderPassage(page);
    this.renderCitations(page);
    this.renderSeedInk(page);
    if (!this.readonly) this.bindPointer(page);
    return page;
  }

  renderPassage(page) {
    page.inner.querySelector('.passage-block')?.remove();
    const n = this.note;
    const box = document.createElement('div');
    box.className = 'passage-block';
    if (!n.passages.length) {
      box.innerHTML = `<div class="passage-placeholder" data-drop="passage">왼쪽에서 구절을 고르면 본문으로 넣을 수 있어요</div>`;
    } else {
      box.innerHTML = n.passages.map((p) => `
        <h4>${esc(refText(p))}</h4>
        <div class="passage-verses">${(p.text || []).map((v) => `<div class="row"><span class="vn">${v.n}</span><span>${esc(v.t)}</span></div>`).join('')}</div>`).join('<div style="height:14px"></div>');
    }
    page.inner.appendChild(box);
    const h = box.offsetHeight || 120;
    page.linesTop = Math.max(140.3, 11.2 + h + 9);
  }

  renderCitations(page) {
    page.inner.querySelectorAll('.cite-block').forEach((e) => e.remove());
    page.ui.querySelectorAll('.cite-ui').forEach((e) => e.remove());
    this.note.citations.filter((c) => c.page === page.i).forEach((c) => {
      const el = document.createElement('div');
      el.className = 'cite-block';
      el.style.top = c.y + 'px';
      citeEls.set(c, el);
      el.innerHTML = `<h5>${esc(refText(c))}</h5>${(c.text || []).map((v) => `<div class="row"><span class="vn">${v.n}</span><span>${esc(v.t)}</span></div>`).join('')}`;
      page.inner.appendChild(el);
      if (!this.readonly) this.addCiteHandle(page, c, el);
    });
  }

  // 인용 블록: 오른쪽 위 손잡이로 위아래 옮기기, ×로 빼기
  addCiteHandle(page, c, el) {
    const u = document.createElement('div');
    u.className = 'cite-ui';
    u.style.top = c.y + 'px';
    u.innerHTML = `<button class="cite-grip" aria-label="옮기기"><svg width="18" height="18" viewBox="0 0 24 24" fill="#555"><circle cx="9" cy="6" r="1.6"/><circle cx="15" cy="6" r="1.6"/><circle cx="9" cy="12" r="1.6"/><circle cx="15" cy="12" r="1.6"/><circle cx="9" cy="18" r="1.6"/><circle cx="15" cy="18" r="1.6"/></svg></button><button class="cite-x" aria-label="빼기"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#555" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6 6 18"/></svg></button>`;
    page.ui.appendChild(u);
    const grip = u.querySelector('.cite-grip');
    let d = null;
    grip.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      grip.setPointerCapture(e.pointerId);
      d = { y0: e.clientY, cy: c.y, snap: this.snapshot(), moved: false };
      el.classList.add('moving');
    });
    grip.addEventListener('pointermove', (e) => {
      if (!d) return;
      const ny = Math.max(10, Math.min(PAGE_H - el.offsetHeight - 10, d.cy + (e.clientY - d.y0) / this.scale));
      if (Math.abs(ny - d.cy) > 1) d.moved = true;
      c.y = Math.round(ny);
      el.style.top = u.style.top = c.y + 'px';
    });
    const up = () => {
      if (!d) return;
      el.classList.remove('moving');
      if (d.moved) { this._push({ t: 'full', json: d.snap }); this.onChange({}); this.onHistory(); }
      d = null;
    };
    grip.addEventListener('pointerup', up);
    grip.addEventListener('pointercancel', up);
    u.querySelector('.cite-x').addEventListener('click', () => {
      this.pushHistory();
      this.note.citations = this.note.citations.filter((x) => x !== c);
      this.renderCitations(page);
      this.onChange({}); this.onHistory();
    });
  }

  renderSeedInk(page) {
    if (!this.note.ink || page.i !== 0) return;
    for (const [row, html] of this.note.ink) {
      const el = document.createElement('div');
      el.className = 'hand';
      el.style.top = page.linesTop + (row + 1) * LINE - LINE + 2 + 'px';
      el.style.fontSize = '25px';
      el.style.lineHeight = LINE + 'px';
      el.innerHTML = html;
      page.inner.appendChild(el);
    }
  }

  layout() {
    if (!this.pages) return;
    queueMicrotask(() => this.onLayout?.());
    const avail = this.scrollEl.clientWidth - 40;
    const w = Math.round(Math.max(320, Math.min(avail, 1100)) * (this.zoom || 1));
    this.scale = w / PAGE_W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.pagesEl.style.width = w + 'px';
    for (const p of this.pages) {
      if (!p) continue;
      const h = Math.round(PAGE_H * this.scale);
      p.el.style.width = w + 'px';
      p.el.style.height = h + 'px';
      p.inner.style.transform = p.ui.style.transform = `scale(${this.scale})`;
      for (const c of [p.bg, p.base, p.ink, p.live]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = w + 'px';
        c.style.height = h + 'px';
      }
      p.dpr = dpr;
      this.drawBackground(p);
      this.drawPage(p);
    }
    this.positionLassoMenu();
  }

  // ---------- 그리기 ----------
  ctxFor(canvas, page) {
    const ctx = canvas.getContext('2d');
    ctx.setTransform(page.dpr * this.scale, 0, 0, page.dpr * this.scale, 0, 0);
    return ctx;
  }

  // 종이 줄 · 모눈 · 점: 화면 픽셀에 딱 맞춰 그려서 간격이 고르게
  drawBackground(page) {
    const c = page.bg, ctx = c.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, c.width, c.height);
    const k = page.dpr * this.scale;
    const type = this.note.paper || 'lined';
    const px = (v) => Math.round(v * k);
    if (type === 'lined') {
      ctx.fillStyle = '#e4e4e4';
      const lw = Math.max(1, Math.round(page.dpr * 0.9));
      for (let y = page.linesTop + LINE; y < PAGE_H - 12; y += LINE) ctx.fillRect(px(MARGIN), px(y), px(PAGE_W - MARGIN) - px(MARGIN), lw);
    } else if (type === 'grid') {
      ctx.fillStyle = '#e8e8e8';
      const lw = Math.max(1, Math.round(page.dpr * 0.8));
      for (let y = 24; y < PAGE_H; y += 24) ctx.fillRect(0, px(y), c.width, lw);
      for (let x = 24; x < PAGE_W; x += 24) ctx.fillRect(px(x), 0, lw, c.height);
    } else if (type === 'dot') {
      ctx.fillStyle = '#c4c4c4';
      const r = Math.max(1, 1.1 * k);
      for (let y = 24; y < PAGE_H; y += 24) for (let x = 24; x < PAGE_W; x += 24) { ctx.beginPath(); ctx.arc(px(x), px(y), r, 0, 7); ctx.fill(); }
    }
  }

  drawPage(page) {
    const ctx = this.ctxFor(page.base, page), ictx = this.ctxFor(page.ink, page);
    ctx.clearRect(0, 0, PAGE_W, PAGE_H);
    ictx.clearRect(0, 0, PAGE_W, PAGE_H);
    const strokes = this.note.pages[page.i].strokes;
    const sel = this.selection && this.selection.page === page.i ? this.selection : null;
    for (const s of strokes) if (s.tool === 'hl' && !(sel && sel.set.has(s))) drawStroke(ctx, s);
    for (const s of strokes) if (s.tool !== 'hl' && !(sel && sel.set.has(s))) drawStroke(ictx, s);
    this.clearLive(page);
    if (sel) this.drawSelection(page);
  }

  clearLive(page) {
    const ctx = this.ctxFor(page.live, page);
    ctx.clearRect(0, 0, PAGE_W, PAGE_H);
    ctx.setLineDash([]);
    return ctx;
  }

  toLocal(page, e) {
    const r = page.base.getBoundingClientRect();
    return [(e.clientX - r.left) / this.scale, (e.clientY - r.top) / this.scale];
  }

  bindPointer(page) {
    const c = page.base;
    let cur = null; // 진행 중인 동작
    const accept = (e) => {
      // iPad 앱에서 네이티브 필기를 켜 두면 애플펜슬 펜·형광펜은 네이티브가 그려서 넘겨줘요 (addExternalStroke)
      if (window.__nativeInk && e.pointerType === 'pen' && (tool.type === 'pen' || tool.type === 'hl')) return false;
      return e.pointerType !== 'touch' || (this.fingerDraw && !this._pan);
    };
    // 두 손가락 스크롤이 시작되면 손가락으로 쓰던 획은 버려요
    this._cancels.push(() => { if (cur && cur.touch && cur.kind !== 'erase') { cur = null; this.clearLive(page); } });

    c.addEventListener('pointerdown', (e) => {
      if (!accept(e) || e.button > 0) return;
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      const [x, y] = this.toLocal(page, e);
      const pr = e.pointerType === 'pen' ? e.pressure : 0.5;
      const t = tool.type;
      // 선택 상자 네 모서리 손잡이: 반대쪽 모서리를 고정하고 비율 유지하며 크기 조절
      if (this.selection && t === 'lasso' && this.selection.page === page.i) {
        const hr = 22 / this.scale;
        const h = this.selection.cites?.size ? null : selHandles(this.selection.box).find((q) => Math.hypot(x - q.x, y - q.y) <= hr); // 인용이 섞이면 크기 조절은 없어요
        if (h) {
          cur = { kind: 'scale', h, kx: 1, ky: 1 };
          this.hideLassoMenu();
          return;
        }
      }
      if (this.selection && t === 'lasso' && this.selection.page === page.i && inBox(this.selection.box, x, y)) {
        cur = { kind: 'move', x0: x, y0: y, dx: 0, dy: 0 };
        this.hideLassoMenu();
        return;
      }
      if (this.selection) this.clearSelection();
      if (cur && e.pointerType === 'touch') return;
      if (t === 'pen' || t === 'hl') {
        const s = t === 'pen'
          ? { tool: 'pen', color: PEN_COLORS[tool.penColor], w: PEN_SIZES[tool.penSize], ps: settings.penStyle, po: { ...settings.penOpts[settings.penStyle] }, pts: [x, y, pr] }
          : { tool: 'hl', color: HL_COLORS[tool.hlColor], w: HL_SIZES[tool.hlSize], a: settings.hlAlpha, pts: [x, y, 0.5] };
        cur = { kind: 'draw', s };
        this.drawLive(page, s);
        // 그리고 멈춰서 잠깐 기다리면 반듯한 도형으로 (굿노트·메모 앱의 '그리고 멈추기')
        const k = cur;
        k.hold = { x, y, t: setTimeout(() => this.trySnap(page, k), HOLD_MS) };
      } else if (t === 'eraser') {
        cur = { kind: 'erase', removed: [], before: this.note.pages[page.i].strokes.slice() };
        this.eraseAt(page, x, y, cur);
      } else if (t === 'lasso') {
        cur = { kind: 'lasso', pts: [x, y] };
      }
      if (cur) cur.touch = e.pointerType === 'touch';
    });

    c.addEventListener('pointermove', (e) => {
      if (!cur) return;
      const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [e];
      for (const ev of evs.length ? evs : [e]) {
        const [x, y] = this.toLocal(page, ev);
        const pr = ev.pointerType === 'pen' ? ev.pressure : 0.5;
        if (cur.kind === 'draw') {
          const p = cur.s.pts;
          const lx = p[p.length - 3], ly = p[p.length - 2];
          if ((x - lx) ** 2 + (y - ly) ** 2 < 0.6) continue;
          if (cur.snapped) continue; // 도형이 된 뒤에는 펜을 떼기 전까지 그대로
          p.push(round(x), round(y), Math.round(pr * 100) / 100);
          if (cur.hold && Math.hypot(x - cur.hold.x, y - cur.hold.y) > HOLD_SLOP) {
            clearTimeout(cur.hold.t);
            const k = cur;
            cur.hold = { x, y, t: setTimeout(() => this.trySnap(page, k), HOLD_MS) };
          }
        } else if (cur.kind === 'erase') {
          this.eraseAt(page, x, y, cur);
        } else if (cur.kind === 'lasso') {
          cur.pts.push(x, y);
        } else if (cur.kind === 'move') {
          cur.dx = x - cur.x0; cur.dy = y - cur.y0;
        } else if (cur.kind === 'scale') {
          const h = cur.h, clamp = (v) => Math.max(0.2, Math.min(5, v));
          const fx = h.dx ? clamp((x - h.ax) / (h.x - h.ax)) : 1;
          const fy = h.dy ? clamp((y - h.ay) / (h.y - h.ay)) : 1;
          if (h.dx && h.dy) { const k = Math.max(fx, fy); cur.kx = cur.ky = k; } else { cur.kx = fx; cur.ky = fy; }
        }
      }
      if (cur.kind === 'draw') this.drawLive(page, cur.s);
      else if (cur.kind === 'lasso') this.drawLasso(page, cur.pts);
      else if (cur.kind === 'move') this.drawSelection(page, cur.dx, cur.dy);
      else if (cur.kind === 'scale') this.drawSelection(page, 0, 0, cur);
    });

    const end = (e) => {
      if (!cur) return;
      const k = cur;
      cur = null;
      if (k.hold) clearTimeout(k.hold.t);
      if (k.kind === 'draw') {
        if (k.s.pts.length === 3) k.s.pts.push(k.s.pts[0] + 0.3, k.s.pts[1] + 0.3, k.s.pts[2]);
        this.pagePush(page.i);
        this.note.pages[page.i].strokes.push(k.s);
        this.drawPage(page);
        this.changed(page);
      } else if (k.kind === 'erase') {
        this.clearLive(page);
        if (k.removed.length) { this._push({ t: 'page', i: page.i, strokes: k.before }); this.changed(page); }
      } else if (k.kind === 'lasso') {
        this.finishLasso(page, k.pts);
      } else if (k.kind === 'move') {
        if (Math.abs(k.dx) + Math.abs(k.dy) > 1) {
          const sel = this.selection;
          if (sel.cites?.size) this.pushHistory(); else this.pagePush(sel.page); // 인용이 섞이면 노트 전체로 기억
          this.cloneSelection();
          for (const s of sel.set) { _dense.delete(s); for (let i = 0; i < s.pts.length; i += 3) { s.pts[i] = round(s.pts[i] + k.dx); s.pts[i + 1] = round(s.pts[i + 1] + k.dy); } }
          if (sel.cites?.size) {
            for (const c of sel.cites) { const h = citeEls.get(c)?.offsetHeight || 60; c.y = Math.round(Math.max(10, Math.min(PAGE_H - h - 10, c.y + k.dy))); }
            this.renderCitations(page);
            this.onChange({});
          }
          sel.box = moveBox(sel.box, sel.cites?.size ? 0 : k.dx, k.dy);
          this.changed(page, false);
        }
        for (const c of this.selection.cites || []) { const el = citeEls.get(c); if (el) el.style.transform = ''; }
        this.drawSelection(page);
        this.showLassoMenu();
      } else if (k.kind === 'scale') {
        if (Math.abs(k.kx - 1) > 0.01 || Math.abs(k.ky - 1) > 0.01) {
          this.pagePush(this.selection.page);
          this.cloneSelection();
          const ox = k.h.ax, oy = k.h.ay, wk = Math.sqrt(k.kx * k.ky);
          for (const s of this.selection.set) {
            _dense.delete(s);
            s.w = Math.round(s.w * wk * 100) / 100;
            for (let i = 0; i < s.pts.length; i += 3) { s.pts[i] = round(ox + (s.pts[i] - ox) * k.kx); s.pts[i + 1] = round(oy + (s.pts[i + 1] - oy) * k.ky); }
          }
          this.selection.box = bbox([...this.selection.set]);
          this.drawPage(page);
          this.changed(page, false);
        }
        this.drawSelection(page);
        this.showLassoMenu();
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  trySnap(page, k) {
    if (k.snapped || k.kind !== 'draw') return;
    const pts = snapShape(k.s.pts);
    if (!pts) return;
    k.snapped = true;
    k.s.pts = pts;
    this.drawLive(page, k.s);
  }

  drawLive(page, s) {
    const ctx = this.clearLive(page);
    drawStroke(ctx, s, true);
  }

  eraseAt(page, x, y, cur) {
    const r = ERASER_SIZES[tool.eraserSize];
    const pg = this.note.pages[page.i];
    const strokes = pg.strokes;
    let hit = false;
    const partial = tool.eraserMode === 'partial';
    for (let i = strokes.length - 1; i >= 0; i--) {
      const orig = strokes[i];
      // 점 사이가 먼 획도 지우개가 정확히 닿게, 검사할 때만 촘촘하게 채운 점을 써요 (그리기는 원래 점으로)
      const s = { ...orig, pts: denseOf(orig) };
      const rr = partial ? r : r + s.w / 2;
      const inside = (j) => { const dx = s.pts[j] - x, dy = s.pts[j + 1] - y; return dx * dx + dy * dy <= rr * rr; };
      let any = false;
      for (let j = 0; j < s.pts.length; j += 3) if (inside(j)) { any = true; break; }
      if (!any) continue;
      hit = true;
      cur.removed.push(orig);
      if (!partial) { strokes.splice(i, 1); continue; }
      // 부분 지우기: 지우개에 닿은 점만 빼고 나머지를 조각으로 남겨요
      const pieces = [];
      let run = [];
      for (let j = 0; j < s.pts.length; j += 3) {
        if (inside(j)) { if (run.length >= 6) pieces.push(run); run = []; }
        else run.push(s.pts[j], s.pts[j + 1], s.pts[j + 2]);
      }
      if (run.length >= 6) pieces.push(run);
      strokes.splice(i, 1, ...pieces.map((pts) => ({ ...s, pts })));
    }
    if (hit) this.drawPage(page);
    const ctx = this.clearLive(page);
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 1 / this.scale; ctx.stroke();
  }

  drawLasso(page, pts) {
    const ctx = this.clearLive(page);
    ctx.beginPath();
    for (let i = 0; i < pts.length; i += 2) i ? ctx.lineTo(pts[i], pts[i + 1]) : ctx.moveTo(pts[i], pts[i + 1]);
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#555'; ctx.lineWidth = 1.2; ctx.stroke();
  }

  finishLasso(page, pts) {
    const poly = [];
    for (let i = 0; i < pts.length; i += 2) poly.push([pts[i], pts[i + 1]]);
    const set = new Set(), cites = new Set();
    if (poly.length > 4) {
      for (const s of this.note.pages[page.i].strokes) {
        let inside = 0, total = 0;
        for (let j = 0; j < s.pts.length; j += 3) { total++; if (pip(poly, s.pts[j], s.pts[j + 1])) inside++; }
        if (total && inside / total >= 0.5) set.add(s);
      }
      // 인용 블록: 일부만 둘러도 블록 전체가 같이 골라져요 (굿노트처럼)
      for (const c of this.note.citations) {
        if (c.page !== page.i) continue;
        const b = this.citeBox(c);
        if (!b) continue;
        const hit = poly.some(([x, y]) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3])
          || [0, 0.25, 0.5, 0.75, 1].some((fx) => [0, 0.5, 1].some((fy) => pip(poly, b[0] + (b[2] - b[0]) * fx, b[1] + (b[3] - b[1]) * fy)));
        if (hit) cites.add(c);
      }
    }
    if (!set.size && !cites.size) { this.clearLive(page); return; }
    let box = set.size ? bbox([...set]) : null;
    for (const c of cites) { const b = this.citeBox(c); box = box ? [Math.min(box[0], b[0]), Math.min(box[1], b[1]), Math.max(box[2], b[2]), Math.max(box[3], b[3])] : b; }
    this.selection = { page: page.i, set, cites, box };
    this.drawPage(page);
    this.showLassoMenu();
  }

  // 인용 블록이 종이에서 차지하는 상자 (종이 단위)
  citeBox(c) {
    const el = citeEls.get(c);
    if (!el || !el.isConnected) return null;
    return [20, c.y, PAGE_W - 20, c.y + el.offsetHeight];
  }

  drawSelection(page, dx = 0, dy = 0, sc = null) {
    const sel = this.selection;
    const ctx = this.clearLive(page);
    // 고른 인용 블록은 옮기는 동안 위아래로 같이 따라와요 (인용은 가로로는 안 움직여요)
    for (const c of sel.cites || []) {
      const el = citeEls.get(c);
      if (el) el.style.transform = dy ? `translateY(${dy}px)` : '';
    }
    const b = sel.box;
    const ox = sc ? sc.h.ax : 0, oy = sc ? sc.h.ay : 0, kx = sc ? sc.kx : 1, ky = sc ? sc.ky : 1;
    ctx.save(); ctx.translate(dx, dy);
    ctx.save(); ctx.translate(ox, oy); ctx.scale(kx, ky); ctx.translate(-ox, -oy);
    for (const s of sel.set) if (s.tool === 'hl') drawStroke(ctx, s);
    for (const s of sel.set) if (s.tool !== 'hl') drawStroke(ctx, s);
    ctx.restore();
    // 상자는 배율만큼 커지되, 선 굵기와 손잡이 크기는 화면 기준으로 일정하게
    const nb = [ox + (b[0] - ox) * kx, oy + (b[1] - oy) * ky, ox + (b[2] - ox) * kx, oy + (b[3] - oy) * ky];
    const u = 1 / this.scale;
    ctx.setLineDash([6 * u, 5 * u]); ctx.strokeStyle = '#3d7bff'; ctx.lineWidth = 1.4 * u;
    ctx.strokeRect(nb[0], nb[1], nb[2] - nb[0], nb[3] - nb[1]);
    ctx.setLineDash([]); ctx.fillStyle = '#fff'; ctx.lineWidth = 2 * u;
    if (!sel.cites?.size) for (const q of selHandles(nb)) { ctx.beginPath(); ctx.arc(q.x, q.y, (q.dx && q.dy ? 7 : 6) * u, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); }
    ctx.restore();
  }

  clearSelection() {
    const sel = this.selection;
    for (const c of sel?.cites || []) { const el = citeEls.get(c); if (el) el.style.transform = ''; }
    this.selection = null;
    this.hideLassoMenu();
    if (sel) this.drawPage(this.pages[sel.page]);
  }

  showLassoMenu() {
    this.hideLassoMenu();
    if (!this.selection) return;
    const m = document.createElement('div');
    m.className = 'lasso-menu';
    m.innerHTML = `<button data-a="del">삭제</button><button data-a="done">선택 해제</button>`;
    // 누르는 순간 바로 실행 (click을 기다리면 빠르게 연달아 누를 때 씹혀요)
    m.addEventListener('pointerdown', (e) => {
      e.stopPropagation(); e.preventDefault();
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'del') {
        const sel = this.selection;
        if (sel.cites?.size) this.pushHistory(); else this.pagePush(sel.page);
        const arr = this.note.pages[sel.page].strokes;
        this.note.pages[sel.page].strokes = arr.filter((s) => !sel.set.has(s));
        if (sel.cites?.size) {
          this.note.citations = this.note.citations.filter((c) => !sel.cites.has(c));
          this.renderCitations(this.pages[sel.page]);
          this.onChange({});
        }
        this.selection = null; this.hideLassoMenu();
        this.drawPage(this.pages[sel.page]);
        this.changed(this.pages[sel.page]);
      } else if (a === 'done') this.clearSelection();
    });
    this.pages[this.selection.page].el.appendChild(m);
    this.lassoMenu = m;
    this.positionLassoMenu();
  }
  positionLassoMenu() {
    if (!this.lassoMenu || !this.selection) return;
    const b = this.selection.box;
    // 종이 오른쪽 끝에 닿으면 선택 영역의 오른쪽 끝에 맞춰요
    const pageW = this.lassoMenu.parentElement.clientWidth, mw = this.lassoMenu.offsetWidth;
    let left = b[0] * this.scale;
    if (left + mw > pageW - 4) left = b[2] * this.scale - mw;
    this.lassoMenu.style.left = Math.max(4, Math.min(left, pageW - mw - 4)) + 'px';
    this.lassoMenu.style.top = Math.max(4, b[1] * this.scale - 46) + 'px';
  }
  hideLassoMenu() { this.lassoMenu?.remove(); this.lassoMenu = null; }

  // ---------- 바뀐 내용 저장 · 되돌리기 ----------
  snapshot() {
    return JSON.stringify({ pages: this.note.pages, citations: this.note.citations, passages: this.note.passages });
  }
  // 되돌리기 기록은 두 가지예요.
  // 'page': 획만 바뀐 동작(쓰기·지우기·올가미). 그 장의 획 목록만 기억하고 되돌릴 때도 그 장만 다시 그려요 → 빠름
  // 'full': 본문·인용처럼 노트 구조가 바뀐 동작. 노트 전체를 저장하고 전체를 다시 그려요
  // 획 객체는 한 번 만들면 고치지 않아요(고칠 땐 새로 만들어 바꿔 끼우기). 그래야 기록끼리 서로 안 섞여요.
  pushHistory() { this._push({ t: 'full', json: this.snapshot() }); }
  pagePush(i) { this._push({ t: 'page', i, strokes: this.note.pages[i].strokes.slice() }); }
  _push(e) {
    this.undoStack.push(e);
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  }
  _now(e) {
    return e.t === 'page'
      ? { t: 'page', i: e.i, strokes: (this.note.pages[e.i]?.strokes || []).slice() }
      : { t: 'full', json: this.snapshot() };
  }
  _apply(e) {
    if (e.t === 'full') return this.restore(e.json);
    const pages = this.note.pages;
    while (pages.length <= e.i) { pages.push({ strokes: [] }); this.buildPage(pages.length - 1); this.layout(); }
    pages[e.i].strokes = e.strokes.slice();
    if (this.selection) { this.selection = null; this.hideLassoMenu(); }
    this.trimTrailing();
    const page = this.pages[e.i];
    if (!page) { this.onChange({}); this.onHistory(); return; } // 빈 장이라 정리돼 사라진 경우
    this.drawPage(page);
    this.changed(page);
  }
  // 되돌리면서 끝에 빈 장이 두 장 이상 남으면 한 장만 남겨요
  trimTrailing() {
    const p = this.note.pages;
    const empty = (i) => !p[i].strokes.length && !this.note.citations.some((c) => c.page === i);
    while (p.length >= 2 && empty(p.length - 1) && empty(p.length - 2)) {
      p.pop();
      this.pages.pop()?.el.remove();
    }
  }
  // 올가미로 옮기거나 크기를 바꾸기 전에 고를 획을 새 객체로 바꿔 끼워요
  cloneSelection() {
    const sel = this.selection;
    const pg = this.note.pages[sel.page];
    const next = new Set();
    pg.strokes = pg.strokes.map((s) => {
      if (!sel.set.has(s)) return s;
      const c = { ...s, pts: s.pts.slice() };
      next.add(c);
      return c;
    });
    sel.set = next;
  }
  restore(json) {
    const d = JSON.parse(json);
    this.note.pages = d.pages; this.note.citations = d.citations; this.note.passages = d.passages;
    this.selection = null; this.hideLassoMenu();
    this.render();
    this.onChange({ structure: true });
    this.onHistory();
  }
  undo() { if (!this.undoStack.length) return; const e = this.undoStack.pop(); this.redoStack.push(this._now(e)); this._apply(e); }
  redo() { if (!this.redoStack.length) return; const e = this.redoStack.pop(); this.undoStack.push(this._now(e)); this._apply(e); }

  changed(page, maybeGrow = true) {
    if (maybeGrow && page.i === this.note.pages.length - 1 && this.ensureTrailingPage()) {
      this.buildPage(this.note.pages.length - 1);
      this.layout();
    }
    this.onChange({});
    this.onHistory();
  }

  // ---------- 본문 · 인용 넣기 ----------
  setPassage(p) {
    this.pushHistory();
    this.note.passages = [p];
    this.renderPassageAndShift();
    this.onChange({ structure: true });
    this.onHistory();
  }
  renderPassageAndShift() {
    const page = this.pages[0];
    const before = page.linesTop;
    this.renderPassage(page);
    this.drawBackground(page);
    const d = page.linesTop - before;
    // 본문 블록 높이가 바뀌면 그 아래 글씨도 같이 내려요
    if (d) {
      // 되돌리기 기록이 옛 획을 그대로 들고 있어서, 획은 고치지 않고 새로 만들어 바꿔 끼워요
      this.note.pages[0].strokes = this.note.pages[0].strokes.map((s) => {
        if (!s.pts.some((v, i) => i % 3 === 1 && v > before - 30)) return s;
        const pts = s.pts.slice();
        for (let i = 1; i < pts.length; i += 3) if (pts[i] > before - 30) pts[i] += d;
        return { ...s, pts };
      });
      for (const c of this.note.citations) if (c.page === 0 && c.y > before - 30) c.y += d;
      this.renderCitations(page);
    }
    this.drawPage(page);
  }

  insertCitation(cite, at) {
    this.pushHistory();
    let pageIdx, y;
    if (at) { pageIdx = at.page; y = at.y; }
    else {
      // 지금 보이는 화면의 가운데쯤에
      const r = this.scrollEl.getBoundingClientRect();
      const hit = this.hitTest(r.left + r.width / 2, r.top + r.height * 0.55);
      pageIdx = hit ? hit.page : 0; y = hit ? hit.y : 200;
    }
    const page = this.pages[pageIdx];
    if (pageIdx === 0) y = Math.max(y, page.linesTop - 10);
    const estH = 46 + (cite.text?.length || 1) * 20;
    y = Math.max(20, Math.min(y, PAGE_H - estH - 20));
    const c = { ...cite, page: pageIdx, y: Math.round(y) };
    this.note.citations.push(c);
    this.renderCitations(page);
    this.changed(page);
    return c;
  }

  // iPad 앱의 네이티브 필기 엔진이 그린 획을 받아 노트에 넣어요. pts = [[clientX, clientY, 누르는 힘], ...]
  // 지금 고른 도구(펜·형광펜)와 펜 설정으로 만들고, 되돌리기·저장은 웹에서 그린 것과 똑같이 처리해요.
  addExternalStroke(pts) {
    if (this.readonly || !pts?.length || (tool.type !== 'pen' && tool.type !== 'hl')) return false;
    const hit = this.hitTest(pts[0][0], pts[0][1]);
    if (!hit) return false;
    const page = this.pages[hit.page];
    if (this.selection) this.clearSelection();
    const r = page.base.getBoundingClientRect();
    const loc = ([cx, cy, pr]) => [round((cx - r.left) / this.scale), round((cy - r.top) / this.scale), Math.round(pr * 100) / 100];
    const [x0, y0, p0] = loc(pts[0]);
    const s = tool.type === 'pen'
      ? { tool: 'pen', color: PEN_COLORS[tool.penColor], w: PEN_SIZES[tool.penSize], ps: settings.penStyle, po: { ...settings.penOpts[settings.penStyle] }, pts: [x0, y0, p0] }
      : { tool: 'hl', color: HL_COLORS[tool.hlColor], w: HL_SIZES[tool.hlSize], a: settings.hlAlpha, pts: [x0, y0, 0.5] };
    for (let i = 1; i < pts.length; i++) {
      const [x, y, pr] = loc(pts[i]);
      const p = s.pts;
      if ((x - p[p.length - 3]) ** 2 + (y - p[p.length - 2]) ** 2 < 0.6) continue;
      p.push(x, y, s.tool === 'hl' ? 0.5 : pr);
    }
    if (s.pts.length === 3) s.pts.push(s.pts[0] + 0.3, s.pts[1] + 0.3, s.pts[2]);
    this.pagePush(page.i);
    this.note.pages[page.i].strokes.push(s);
    this.drawPage(page);
    this.changed(page);
    return true;
  }

  hitTest(clientX, clientY) {
    for (const p of this.pages) {
      const r = p.el.getBoundingClientRect();
      if (clientX >= r.left && clientX <= r.right && clientY >= r.top && clientY <= r.bottom) {
        const ph = p.inner.querySelector('.passage-placeholder');
        let onPh = false;
        if (ph) { const pr = ph.getBoundingClientRect(); onPh = clientY >= pr.top && clientY <= pr.bottom && clientX >= pr.left && clientX <= pr.right; }
        return { page: p.i, y: (clientY - r.top) / this.scale, onPlaceholder: onPh, el: p.el };
      }
    }
    return null;
  }
}

// ---------- 그리기 도우미 ----------
const REF_SIZE = 2.6 * 1.25;
function drawStroke(ctx, s, live = false) {
  const p = s.pts;
  ctx.setLineDash([]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.tool === 'hl') {
    ctx.save();
    ctx.globalAlpha = s.a ?? HL_ALPHA_DEFAULT;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = s.color; ctx.lineWidth = s.w; ctx.lineCap = 'round'; // 굿노트처럼 끝이 부드럽게 (11/21)
    const q = hlPoints(p, s.w);
    ctx.beginPath(); ctx.moveTo(q[0], q[1]);
    for (let i = 2; i < q.length - 2; i += 2) ctx.quadraticCurveTo(q[i], q[i + 1], (q[i] + q[i + 2]) / 2, (q[i + 1] + q[i + 3]) / 2);
    ctx.lineTo(q[q.length - 2], q[q.length - 1]);
    ctx.stroke();
    ctx.restore();
    return;
  }
  // 펜: 필압을 부드럽게 다듬은 외곽선을 만들어 면으로 채워요 (선 가장자리가 매끈하게)
  // 굵기마다 다듬는 정도가 달라지지 않게, 가운데 굵기 기준으로 좌표를 키웠다 줄여서 계산해요
  const st = penStyleOf(s), o = styleOpts(st, s.po);
  const size = s.w * 1.25 * o.scale, k = REF_SIZE / size;
  const pts = [];
  for (let i = 0; i < p.length; i += 3) pts.push([p[i] * k, p[i + 1] * k, st === 'ball' ? 0.5 : p[i + 2]]);
  if (o.flat) applyFlatNib(pts, o.flat);
  const raw = getStroke(pts, strokeOpts(o, live));
  const outline = raw.map(([x, y]) => [x / k, y / k]);
  if (!outline.length) return;
  ctx.fillStyle = s.color;
  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);
  for (let i = 1; i < outline.length; i++) {
    const [x0, y0] = outline[i], [x1, y1] = outline[(i + 1) % outline.length];
    ctx.quadraticCurveTo(x0, y0, (x0 + x1) / 2, (y0 + y1) / 2);
  }
  ctx.closePath();
  ctx.fill();
}
const round = (v) => Math.round(v * 10) / 10;

// ---------- 그리고 멈추면 도형으로 ----------
const HOLD_MS = 500, HOLD_SLOP = 3;
// 손으로 그린 점들을 직선 · 원(정원) · 타원 · 다각형(삼각형 · 사각형 · 오각형 …) · 별 중 맞는 것으로 바꿔요. 맞는 게 없으면 null.
function snapShape(raw) {
  const P = [];
  let prSum = 0;
  for (let i = 0; i < raw.length; i += 3) { P.push([raw[i], raw[i + 1]]); prSum += raw[i + 2]; }
  if (P.length < 4) return null;
  const pr = Math.round((prSum / P.length) * 100) / 100;
  let len = 0;
  for (let i = 1; i < P.length; i++) len += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1]);
  if (len < 20) return null;
  const xs = P.map((q) => q[0]), ys = P.map((q) => q[1]);
  const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
  const size = Math.max(x1 - x0, y1 - y0);
  const a = P[0], b = P[P.length - 1];
  const out = (list) => { const o = []; for (const [x, y] of list) o.push(round(x), round(y), pr); return o; };
  const polyOut = (vs) => { const o = []; vs.forEach((q, i) => o.push(...sampleSeg(q, vs[(i + 1) % vs.length]).slice(i ? 1 : 0))); return out(o); };
  // 직선: 처음과 끝을 이은 선에서 크게 벗어나지 않음
  const ab = Math.hypot(b[0] - a[0], b[1] - a[1]);
  if (ab > 0.8 * len) {
    const dev = Math.max(...P.map((q) => segDist(q, a, b)));
    return dev < Math.max(4, ab * 0.08) ? out(sampleSeg(a, b)) : null;
  }
  // 닫힌 도형만: 끝이 시작 근처로 돌아옴 (조금 모자라거나 겹쳐도 괜찮아요)
  if (ab > Math.max(16, size * 0.35)) return null;

  // 원 · 타원 맞춤도
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const rx = (x1 - x0) / 2, ry = (y1 - y0) / 2;
  const ellErr = rx < 4 || ry < 4 ? 1 : P.reduce((s, q) => s + Math.abs(Math.hypot((q[0] - cx) / rx, (q[1] - cy) / ry) - 1), 0) / P.length;

  // 다각형 맞춤도: 꼭짓점을 여러 세밀도로 찾아서, 둘레에 잘 맞는 것 중 꼭짓점이 가장 적은 것
  let best = null;
  for (const f of [0.14, 0.11, 0.08, 0.06]) {
    const vs = polyVertices(P, size * f);
    if (vs.length < 3 || vs.length > 12) continue;
    const segs = vs.map((q, i) => [q, vs[(i + 1) % vs.length]]);
    const err = P.reduce((s, q) => s + Math.min(...segs.map(([u, v]) => segDist(q, u, v))), 0) / P.length / size;
    if (err < 0.035 && (!best || vs.length < best.vs.length)) best = { vs, err };
  }
  // 원은 둥근 면이라 다각형으로 맞추면 오차가 커요. 다각형이 원보다 확실히 잘 맞을 때만 다각형.
  if (best && (best.err * 4 < ellErr || ellErr > 0.12)) {
    const vs = regularShape(best.vs, [x0, y0, x1, y1]);
    // 그리기 시작한 곳에서 가장 가까운 꼭짓점부터
    let k = 0;
    vs.forEach((q, i) => { if (Math.hypot(q[0] - a[0], q[1] - a[1]) < Math.hypot(vs[k][0] - a[0], vs[k][1] - a[1])) k = i; });
    const ordered = [...vs.slice(k), ...vs.slice(0, k)];
    if (turnDir(ordered) !== turnDir(P)) ordered.splice(1, ordered.length - 1, ...ordered.slice(1).reverse());
    return polyOut(ordered);
  }
  if (ellErr > 0.2) return null;
  // 원 · 타원: 가로세로 차이가 30% 안이면 정원
  let ex = rx, ey = ry;
  if (Math.abs(rx - ry) / Math.max(rx, ry) < 0.3) ex = ey = (rx + ry) / 2;
  const start = Math.atan2(a[1] - cy, a[0] - cx), n = Math.max(48, Math.round((ex + ey) / 1.5));
  const dir = turnDir(P);
  const o = [];
  for (let i = 0; i <= n; i++) { const t = start + dir * (i / n) * Math.PI * 2; o.push([cx + ex * Math.cos(t), cy + ey * Math.sin(t)]); }
  return out(o);
}
const avg = (arr) => arr.reduce((s, v) => s + v, 0) / arr.length;
const DEG = Math.PI / 180;
// 대충 그린 꼭짓점 → 반듯한 도형 (굿노트처럼 '정리된' 모양)
//  삼각형: 밑변이 거의 수평이면 이등변(꼭대기가 한쪽 끝 근처면 직각), 아니면 정삼각형
//  사각형: 직사각형(비율이 비슷하면 정사각형), 꼭짓점이 상자 변 가운데에 있으면 마름모. 거의 수평이면 가로세로로
//  꼭짓점 5개 이상: 정다각형 (별은 반듯한 별)
function regularShape(vs, [x0, y0, x1, y1]) {
  const n = vs.length;
  const c = [avg(vs.map((q) => q[0])), avg(vs.map((q) => q[1]))];
  const ang = (u, v) => Math.atan2(v[1] - u[1], v[0] - u[0]);
  const nearAxis = (t, tol = 15 * DEG) => { const g = Math.abs(t) % (Math.PI / 2); return g < tol || g > Math.PI / 2 - tol; };
  const ring = (k, r, a0, rr = null) => Array.from({ length: k }, (_, i) => { const t = a0 + (i * 2 * Math.PI) / k, R = rr ? rr[i % 2] : r; return [c[0] + R * Math.cos(t), c[1] + R * Math.sin(t)]; });
  // 회전은 '위쪽이 꼭짓점' 또는 '밑변이 수평'에 가까우면 그쪽으로 맞춰요
  const snapRot = (a0, k) => { const step = Math.PI / k, up = -Math.PI / 2; const d = ((a0 - up) % (2 * step) + 2 * step) % (2 * step); return d < 12 * DEG || d > 2 * step - 12 * DEG ? up + Math.round((a0 - up) / (2 * step)) * 2 * step : a0; };
  if (n === 3) {
    for (let i = 0; i < 3; i++) {
      const u = vs[i], v = vs[(i + 1) % 3], apex = vs[(i + 2) % 3];
      if (!nearAxis(ang(u, v)) || Math.abs(u[1] - v[1]) > Math.abs(u[0] - v[0])) continue; // 수평에 가까운 밑변
      const baseY = (u[1] + v[1]) / 2, left = Math.min(u[0], v[0]), right = Math.max(u[0], v[0]);
      const w = right - left;
      let ax = (left + right) / 2;
      if (Math.abs(apex[0] - left) < w * 0.2) ax = left; else if (Math.abs(apex[0] - right) < w * 0.2) ax = right; // 직각삼각형
      return [[left, baseY], [right, baseY], [ax, apex[1]]];
    }
    const r = avg(vs.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1])));
    return ring(3, r, snapRot(Math.atan2(vs[0][1] - c[1], vs[0][0] - c[0]), 3));
  }
  if (n === 4) {
    const w = x1 - x0, h = y1 - y0;
    // 마름모: 꼭짓점이 상자 각 변의 가운데 근처
    const mids = [[(x0 + x1) / 2, y0], [x1, (y0 + y1) / 2], [(x0 + x1) / 2, y1], [x0, (y0 + y1) / 2]];
    if (vs.every((q) => mids.some((m) => Math.hypot(q[0] - m[0], q[1] - m[1]) < Math.max(w, h) * 0.18))) {
      if (Math.abs(w - h) / Math.max(w, h) < 0.15) { const s2 = (w + h) / 4; return [[c[0], c[1] - s2], [c[0] + s2, c[1]], [c[0], c[1] + s2], [c[0] - s2, c[1]]]; }
      return mids;
    }
    // 직사각형: 첫 변 방향으로 돌린 상자
    let t = ang(vs[0], vs[1]);
    if (nearAxis(t, 20 * DEG)) t = 0;
    const cos = Math.cos(t), sin = Math.sin(t);
    const loc = vs.map((q) => [(q[0] - c[0]) * cos + (q[1] - c[1]) * sin, -(q[0] - c[0]) * sin + (q[1] - c[1]) * cos]);
    let hw = (Math.max(...loc.map((q) => q[0])) - Math.min(...loc.map((q) => q[0]))) / 2;
    let hh = (Math.max(...loc.map((q) => q[1])) - Math.min(...loc.map((q) => q[1]))) / 2;
    if (Math.abs(hw - hh) / Math.max(hw, hh) < 0.12) hw = hh = (hw + hh) / 2; // 정사각형
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]].map(([x, y]) => [c[0] + x * cos - y * sin, c[1] + x * sin + y * cos]);
  }
  const r = vs.map((q) => Math.hypot(q[0] - c[0], q[1] - c[1]));
  if (n === 10) {
    const odd = r.filter((_, i) => i % 2), even = r.filter((_, i) => i % 2 === 0);
    const [ro, ri, off] = avg(even) > avg(odd) ? [avg(even), avg(odd), 0] : [avg(odd), avg(even), 1];
    if (ri / ro < 0.75) {
      const a0 = snapRot(Math.atan2(vs[off][1] - c[1], vs[off][0] - c[0]), 5);
      return ring(10, 0, a0 - 0, null).map((_, i) => { const tt = a0 + (i * Math.PI) / 5, R = i % 2 ? ro * 0.38 : ro; return [c[0] + R * Math.cos(tt), c[1] + R * Math.sin(tt)]; });
    }
  }
  return ring(n, avg(r), snapRot(Math.atan2(vs[0][1] - c[1], vs[0][0] - c[0]), n));
}
// 그린 방향 (시계/반시계)
function turnDir(P) {
  let area = 0;
  for (let i = 0; i < P.length; i++) { const [x1, y1] = P[i], [x2, y2] = P[(i + 1) % P.length]; area += x1 * y2 - x2 * y1; }
  return area >= 0 ? 1 : -1;
}
// 닫힌 획에서 꼭짓점 찾기: 단순화한 뒤, 거의 일직선인 꼭짓점과 너무 가까운 꼭짓점을 빼요
function polyVertices(P, eps) {
  let far = 0;
  P.forEach((q, i) => { if (Math.hypot(q[0] - P[0][0], q[1] - P[0][1]) > Math.hypot(P[far][0] - P[0][0], P[far][1] - P[0][1])) far = i; });
  let vs = [...rdp(P.slice(0, far + 1), eps).slice(0, -1), ...rdp(P.slice(far), eps).slice(0, -1)];
  for (let changed = true; changed && vs.length > 3;) {
    changed = false;
    for (let i = 0; i < vs.length && vs.length > 3; i++) {
      const p0 = vs[(i - 1 + vs.length) % vs.length], p1 = vs[i], p2 = vs[(i + 1) % vs.length];
      const close = Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) < eps * 1.2;
      const straight = segDist(p1, p0, p2) < eps * 0.6;
      if (close || straight) { vs.splice(i, 1); changed = true; i--; }
    }
  }
  return vs;
}
function sampleSeg(a, b, step = 4) {
  const n = Math.max(2, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / step));
  const o = [];
  for (let i = 0; i <= n; i++) o.push([a[0] + ((b[0] - a[0]) * i) / n, a[1] + ((b[1] - a[1]) * i) / n]);
  return o;
}
function segDist(q, u, v) {
  const dx = v[0] - u[0], dy = v[1] - u[1], l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((q[0] - u[0]) * dx + (q[1] - u[1]) * dy) / l2));
  return Math.hypot(q[0] - u[0] - t * dx, q[1] - u[1] - t * dy);
}
function rdp(pts, eps) {
  if (pts.length < 3) return pts.slice();
  const a = pts[0], b = pts[pts.length - 1];
  let idx = 0, max = 0;
  for (let i = 1; i < pts.length - 1; i++) { const d = segDist(pts[i], a, b); if (d > max) { max = d; idx = i; } }
  if (max <= eps) return [a, b];
  return [...rdp(pts.slice(0, idx + 1), eps).slice(0, -1), ...rdp(pts.slice(idx), eps)];
}
export { snapShape as _snapShapeForTest };
// 예전 획: np(필압 끔) → 볼펜, 표시 없음 → 만년필(그때 기본이 필압 켜짐)
const penStyleOf = (s) => s.ps || (s.np ? 'ball' : 'fountain');
// 펜 종류 + 세부 설정 → 그리는 방식. po가 없는 예전 획은 그때 모양 그대로.
function styleOpts(st, po) {
  if (!po) return { ball: { scale: 1, thinning: 0, taper: 0, stream: 0.5 }, fountain: { scale: 1, thinning: 0.6, taper: 0, stream: 0.5 }, brush: { scale: 1.4, thinning: 0.75, taper: 14, stream: 0.5 } }[st];
  const stream = 0.25 + (po.stab / 100) * 0.6; // 손떨림 보정: 클수록 손 떨림을 더 눌러 줌
  if (st === 'ball') return { scale: 1, thinning: 0, taper: 0, stream };
  if (st === 'fountain') {
    const flat = (po.flat || 0) / 100;
    return { scale: 1, thinning: Math.max(0.2 + (po.pressure / 100) * 0.8, 0.85 * flat), taper: (po.sharp / 100) * 12, stream, flat };
  }
  return { scale: 1.4, thinning: 0.8, taper: (po.sharp / 100) * 26, stream };
}
function strokeOpts(o, live) {
  return {
    size: REF_SIZE, thinning: o.thinning, smoothing: 0.6, streamline: live ? Math.max(0.2, o.stream - 0.15) : o.stream,
    simulatePressure: false, last: !live,
    easing: (t) => Math.sin((t * Math.PI) / 2),
    start: { taper: o.taper, cap: true }, end: { taper: live ? 0 : o.taper, cap: true },
  };
}
// 평평함: 펜촉이 45° 기울어진 납작한 만년필처럼, 긋는 방향에 따라 굵기가 달라져요 (누르는 힘에 섞어 넣어요)
function applyFlatNib(pts, k) {
  const nib = -Math.PI / 4;
  const n = pts.length;
  const f = pts.map((_, i) => {
    const a = pts[Math.max(0, i - 2)], b = pts[Math.min(n - 1, i + 2)];
    if (a === b) return 0.6;
    return 0.05 + 0.95 * Math.abs(Math.sin(Math.atan2(b[1] - a[1], b[0] - a[0]) - nib));
  });
  for (let i = 0; i < n; i++) pts[i][2] = pts[i][2] * (1 - k) + f[i] * k;
}
// 펜 종류 메뉴의 미리보기 획 (실제 그리는 방식 그대로, 누르는 힘이 바뀌는 물결)
export function penSamplePath(style, w = 84, h = 22, po = settings.penOpts[style]) {
  const o = styleOpts(style, po), pts = [];
  const cycles = Math.max(1, Math.round(w / h / 1.6)); // 넓은 미리보기는 물결을 여러 번 (방향마다 굵기 차이가 보이게)
  for (let i = 0, N = 40 * cycles; i <= N; i++) {
    const t = i / N;
    pts.push([4 + t * (w - 8), h / 2 + Math.sin(t * Math.PI * 2 * cycles) * (h / 2 - 5), 0.25 + 0.65 * Math.sin(t * Math.PI)]);
  }
  const sc = REF_SIZE / (2.6 * 1.25 * o.scale);
  const sp = pts.map(([x, y, pr]) => [x * sc, y * sc, style === 'ball' ? 0.5 : pr]);
  if (o.flat) applyFlatNib(sp, o.flat);
  const out = getStroke(sp, strokeOpts(o, false)).map(([x, y]) => [x / sc, y / sc]);
  if (!out.length) return '';
  // 종이에 그릴 때처럼 점 사이를 곡선으로 이어요
  const f = (v) => v.toFixed(1);
  let d = `M${f(out[0][0])} ${f(out[0][1])}`;
  for (let i = 1; i < out.length; i++) {
    const [x0, y0] = out[i], [x1, y1] = out[(i + 1) % out.length];
    d += `Q${f(x0)} ${f(y0)} ${f((x0 + x1) / 2)} ${f((y0 + y1) / 2)}`;
  }
  return d + 'Z';
}
// 형광펜은 끝이 납작해서(butt) 첫·마지막 짧은 구간의 방향이 끝 모양을 정해요.
// 펜슬은 대고 뗄 때 펜촉이 아주 조금씩 흔들린 점을 많이 보내서, 그 방향대로 끝이 비뚤게 잘렸어요.
// 시작점·끝점 근처(굵기의 절반 안쪽)의 흔들린 점과 너무 촘촘한 점을 빼고 그려요. 저장된 점은 그대로예요.
function hlPoints(p, w) {
  const n = p.length / 3;
  if (n < 3) { const q = []; for (let i = 0; i < p.length; i += 3) q.push(p[i], p[i + 1]); return q; }
  const near = w * 0.5, x0 = p[0], y0 = p[1], xn = p[p.length - 3], yn = p[p.length - 2];
  const q = [x0, y0];
  for (let i = 3; i < p.length - 3; i += 3) {
    const x = p[i], y = p[i + 1];
    if (Math.hypot(x - x0, y - y0) < near || Math.hypot(x - xn, y - yn) < near) continue;
    if (Math.hypot(x - q[q.length - 2], y - q[q.length - 1]) < 1.5) continue;
    q.push(x, y);
  }
  q.push(xn, yn);
  return q;
}
// 점 사이가 멀면 사이 점을 채워 넣어요 (부분 지우개가 정확하게 닿도록)
const _dense = new WeakMap();
function denseOf(stroke) { let d = _dense.get(stroke); if (!d) { d = densify(stroke.pts); _dense.set(stroke, d); } return d; }
function densify(p) {
  const out = [p[0], p[1], p[2]];
  for (let i = 3; i < p.length; i += 3) {
    const x0 = out[out.length - 3], y0 = out[out.length - 2], p0 = out[out.length - 1];
    const d = Math.hypot(p[i] - x0, p[i + 1] - y0), n = Math.floor(d / 2.5);
    for (let k = 1; k < n; k++) { const t = k / n; out.push(round(x0 + (p[i] - x0) * t), round(y0 + (p[i + 1] - y0) * t), Math.round((p0 + (p[i + 2] - p0) * t) * 100) / 100); }
    out.push(p[i], p[i + 1], p[i + 2]);
  }
  return out;
}
function pip(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
const citeEls = new WeakMap(); // 인용 → 화면의 블록
function bbox(strokes) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const s of strokes) for (let i = 0; i < s.pts.length; i += 3) {
    a = Math.min(a, s.pts[i]); b = Math.min(b, s.pts[i + 1]); c = Math.max(c, s.pts[i]); d = Math.max(d, s.pts[i + 1]);
  }
  return [a - 10, b - 10, c + 10, d + 10];
}
// 선택 상자 손잡이: 위치(x,y), 늘리는 방향(dx,dy), 고정되는 반대쪽 점(ax,ay)
function selHandles(b) {
  const mx = (b[0] + b[2]) / 2, my = (b[1] + b[3]) / 2, out = [];
  for (const [dx, dy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    const x = dx < 0 ? b[0] : dx > 0 ? b[2] : mx, y = dy < 0 ? b[1] : dy > 0 ? b[3] : my;
    const ax = dx < 0 ? b[2] : dx > 0 ? b[0] : mx, ay = dy < 0 ? b[3] : dy > 0 ? b[1] : my;
    out.push({ x, y, dx, dy, ax, ay });
  }
  return out;
}
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const moveBox = (b, dx, dy) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
