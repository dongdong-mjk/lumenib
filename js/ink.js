// 손글씨 노트 종이: 펜 · 형광펜 · 지우개 · 올가미
// 좌표는 종이 기준 논리 단위(폭 726)로 저장하고, 화면 크기에 맞춰 늘리고 줄여요.
import { esc } from './util.js';
import { refText } from './bible.js';

export const PAGE_W = 726;
export const PAGE_H = 1027; // A4 비율
const LINE = 36;

export const PEN_COLORS = ['#111111', '#004ce5', '#dc3333'];
export const HL_COLORS = ['#ffd84d', '#ff8fa3', '#8cbfff'];
export const PEN_SIZES = [1.6, 2.6, 4];
export const HL_SIZES = [12, 18, 26];
export const ERASER_SIZES = [8, 18, 32];

export const tool = { type: 'pen', penColor: 0, penSize: 1, hlColor: 0, hlSize: 1, eraserSize: 1 };

export class Paper {
  constructor(scrollEl, note, opts = {}) {
    this.scrollEl = scrollEl;
    this.note = note;
    this.readonly = !!opts.readonly;
    this.onChange = opts.onChange || (() => {});
    this.onHistory = opts.onHistory || (() => {});
    this.fingerDraw = !!opts.fingerDraw;
    this.undoStack = [];
    this.redoStack = [];
    this.selection = null;
    this.pagesEl = document.createElement('div');
    this.pagesEl.className = 'pages';
    scrollEl.innerHTML = '';
    scrollEl.appendChild(this.pagesEl);
    scrollEl.className = 'paper-scroll' + (this.fingerDraw && !this.readonly ? ' finger' : '');
    this._ro = new ResizeObserver(() => this.layout());
    this._ro.observe(scrollEl);
    // Apple Pencil로 쓸 때 화면이 같이 스크롤되지 않게 (손가락 스크롤은 그대로)
    this._touchBlock = (e) => {
      if (this.readonly) return;
      for (const t of e.touches) if (t.touchType === 'stylus') { e.preventDefault(); return; }
    };
    scrollEl.addEventListener('touchstart', this._touchBlock, { passive: false });
    scrollEl.addEventListener('touchmove', this._touchBlock, { passive: false });
  }

  destroy() {
    this._ro.disconnect();
    this.scrollEl.removeEventListener('touchstart', this._touchBlock);
    this.scrollEl.removeEventListener('touchmove', this._touchBlock);
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
    const lines = document.createElement('div');
    lines.className = 'page-lines';
    inner.appendChild(lines);
    pageEl.appendChild(inner);
    const base = document.createElement('canvas');
    const live = document.createElement('canvas');
    live.className = 'live';
    pageEl.appendChild(base);
    pageEl.appendChild(live);
    this.pagesEl.appendChild(pageEl);
    const page = { i, el: pageEl, inner, lines, base, live, linesTop: 40 };
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
    const top = Math.ceil((20 + h + 28) / LINE) * LINE;
    page.linesTop = top;
    page.inner.style.setProperty('--lines-top', top + 'px');
  }

  renderCitations(page) {
    page.inner.querySelectorAll('.cite-block').forEach((e) => e.remove());
    this.note.citations.filter((c) => c.page === page.i).forEach((c) => {
      const el = document.createElement('div');
      el.className = 'cite-block';
      el.style.top = c.y + 'px';
      el.innerHTML = `<h5>${esc(refText(c))}</h5>${(c.text || []).map((v) => `<div class="row"><span class="vn">${v.n}</span><span>${esc(v.t)}</span></div>`).join('')}`;
      page.inner.appendChild(el);
    });
  }

  renderSeedInk(page) {
    if (!this.note.ink || page.i !== 0) return;
    for (const [row, html] of this.note.ink) {
      const el = document.createElement('div');
      el.className = 'hand';
      el.style.top = page.linesTop + row * LINE - 6 + 'px';
      el.style.fontSize = '27px';
      el.style.lineHeight = LINE + 'px';
      el.innerHTML = html;
      page.inner.appendChild(el);
    }
  }

  layout() {
    if (!this.pages) return;
    const avail = this.scrollEl.clientWidth - 40;
    const w = Math.max(320, Math.min(avail, 1100));
    this.scale = w / PAGE_W;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.pagesEl.style.width = w + 'px';
    for (const p of this.pages) {
      if (!p) continue;
      const h = Math.round(PAGE_H * this.scale);
      p.el.style.width = w + 'px';
      p.el.style.height = h + 'px';
      p.inner.style.transform = `scale(${this.scale})`;
      for (const c of [p.base, p.live]) {
        c.width = Math.round(w * dpr);
        c.height = Math.round(h * dpr);
        c.style.width = w + 'px';
        c.style.height = h + 'px';
      }
      p.dpr = dpr;
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

  drawPage(page) {
    const ctx = this.ctxFor(page.base, page);
    ctx.clearRect(0, 0, PAGE_W, PAGE_H);
    const strokes = this.note.pages[page.i].strokes;
    const sel = this.selection && this.selection.page === page.i ? this.selection : null;
    for (const s of strokes) if (s.tool === 'hl' && !(sel && sel.set.has(s))) drawStroke(ctx, s);
    for (const s of strokes) if (s.tool !== 'hl' && !(sel && sel.set.has(s))) drawStroke(ctx, s);
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
    const accept = (e) => e.pointerType !== 'touch' || this.fingerDraw;

    c.addEventListener('pointerdown', (e) => {
      if (!accept(e) || e.button > 0) return;
      e.preventDefault();
      c.setPointerCapture(e.pointerId);
      const [x, y] = this.toLocal(page, e);
      const pr = e.pointerType === 'pen' ? e.pressure : 0.5;
      const t = tool.type;
      if (this.selection && t === 'lasso' && this.selection.page === page.i && inBox(this.selection.box, x, y)) {
        cur = { kind: 'move', x0: x, y0: y, dx: 0, dy: 0 };
        this.hideLassoMenu();
        return;
      }
      if (this.selection) this.clearSelection();
      if (t === 'pen' || t === 'hl') {
        const s = t === 'pen'
          ? { tool: 'pen', color: PEN_COLORS[tool.penColor], w: PEN_SIZES[tool.penSize], pts: [x, y, pr] }
          : { tool: 'hl', color: HL_COLORS[tool.hlColor], w: HL_SIZES[tool.hlSize], pts: [x, y, 0.5] };
        cur = { kind: 'draw', s };
        this.drawLive(page, s);
      } else if (t === 'eraser') {
        cur = { kind: 'erase', removed: [], snap: this.snapshot() };
        this.eraseAt(page, x, y, cur);
      } else if (t === 'lasso') {
        cur = { kind: 'lasso', pts: [x, y] };
      }
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
          p.push(round(x), round(y), Math.round(pr * 100) / 100);
        } else if (cur.kind === 'erase') {
          this.eraseAt(page, x, y, cur);
        } else if (cur.kind === 'lasso') {
          cur.pts.push(x, y);
        } else if (cur.kind === 'move') {
          cur.dx = x - cur.x0; cur.dy = y - cur.y0;
        }
      }
      if (cur.kind === 'draw') this.drawLive(page, cur.s);
      else if (cur.kind === 'lasso') this.drawLasso(page, cur.pts);
      else if (cur.kind === 'move') this.drawSelection(page, cur.dx, cur.dy);
    });

    const end = (e) => {
      if (!cur) return;
      const k = cur;
      cur = null;
      if (k.kind === 'draw') {
        if (k.s.pts.length === 3) k.s.pts.push(k.s.pts[0] + 0.3, k.s.pts[1] + 0.3, k.s.pts[2]);
        this.pushHistory();
        this.note.pages[page.i].strokes.push(k.s);
        this.drawPage(page);
        this.changed(page);
      } else if (k.kind === 'erase') {
        this.clearLive(page);
        if (k.removed.length) { this.undoStack.push(k.snap); this.redoStack = []; this.changed(page); }
      } else if (k.kind === 'lasso') {
        this.finishLasso(page, k.pts);
      } else if (k.kind === 'move') {
        if (Math.abs(k.dx) + Math.abs(k.dy) > 1) {
          this.pushHistory();
          for (const s of this.selection.set) for (let i = 0; i < s.pts.length; i += 3) { s.pts[i] = round(s.pts[i] + k.dx); s.pts[i + 1] = round(s.pts[i + 1] + k.dy); }
          this.selection.box = moveBox(this.selection.box, k.dx, k.dy);
          this.changed(page, false);
        }
        this.drawSelection(page);
        this.showLassoMenu();
      }
    };
    c.addEventListener('pointerup', end);
    c.addEventListener('pointercancel', end);
  }

  drawLive(page, s) {
    const ctx = this.clearLive(page);
    drawStroke(ctx, s);
  }

  eraseAt(page, x, y, cur) {
    const r = ERASER_SIZES[tool.eraserSize];
    const strokes = this.note.pages[page.i].strokes;
    let hit = false;
    for (let i = strokes.length - 1; i >= 0; i--) {
      const s = strokes[i];
      const rr = r + s.w / 2;
      for (let j = 0; j < s.pts.length; j += 3) {
        const dx = s.pts[j] - x, dy = s.pts[j + 1] - y;
        if (dx * dx + dy * dy <= rr * rr) { cur.removed.push(s); strokes.splice(i, 1); hit = true; break; }
      }
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
    const set = new Set();
    if (poly.length > 4) {
      for (const s of this.note.pages[page.i].strokes) {
        let inside = 0, total = 0;
        for (let j = 0; j < s.pts.length; j += 3) { total++; if (pip(poly, s.pts[j], s.pts[j + 1])) inside++; }
        if (total && inside / total >= 0.5) set.add(s);
      }
    }
    if (!set.size) { this.clearLive(page); return; }
    this.selection = { page: page.i, set, box: bbox([...set]) };
    this.drawPage(page);
    this.showLassoMenu();
  }

  drawSelection(page, dx = 0, dy = 0) {
    const sel = this.selection;
    const ctx = this.clearLive(page);
    ctx.save(); ctx.translate(dx, dy);
    for (const s of sel.set) if (s.tool === 'hl') drawStroke(ctx, s);
    for (const s of sel.set) if (s.tool !== 'hl') drawStroke(ctx, s);
    const b = sel.box;
    ctx.setLineDash([6, 5]); ctx.strokeStyle = '#3d7bff'; ctx.lineWidth = 1.4;
    ctx.strokeRect(b[0], b[1], b[2] - b[0], b[3] - b[1]);
    ctx.restore();
  }

  clearSelection() {
    const sel = this.selection;
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
    m.addEventListener('pointerdown', (e) => e.stopPropagation());
    m.addEventListener('click', (e) => {
      const a = e.target.closest('button')?.dataset.a;
      if (a === 'del') {
        const sel = this.selection;
        this.pushHistory();
        const arr = this.note.pages[sel.page].strokes;
        this.note.pages[sel.page].strokes = arr.filter((s) => !sel.set.has(s));
        this.selection = null; this.hideLassoMenu();
        this.drawPage(this.pages[sel.page]);
        this.changed(this.pages[sel.page]);
      } else this.clearSelection();
    });
    this.pages[this.selection.page].el.appendChild(m);
    this.lassoMenu = m;
    this.positionLassoMenu();
  }
  positionLassoMenu() {
    if (!this.lassoMenu || !this.selection) return;
    const b = this.selection.box;
    this.lassoMenu.style.left = Math.max(4, b[0] * this.scale) + 'px';
    this.lassoMenu.style.top = Math.max(4, b[1] * this.scale - 46) + 'px';
  }
  hideLassoMenu() { this.lassoMenu?.remove(); this.lassoMenu = null; }

  // ---------- 바뀐 내용 저장 · 되돌리기 ----------
  snapshot() {
    return JSON.stringify({ pages: this.note.pages, citations: this.note.citations, passages: this.note.passages });
  }
  pushHistory() {
    this.undoStack.push(this.snapshot());
    if (this.undoStack.length > 60) this.undoStack.shift();
    this.redoStack = [];
  }
  restore(json) {
    const d = JSON.parse(json);
    this.note.pages = d.pages; this.note.citations = d.citations; this.note.passages = d.passages;
    this.selection = null; this.hideLassoMenu();
    this.render();
    this.onChange({ structure: true });
    this.onHistory();
  }
  undo() { if (!this.undoStack.length) return; this.redoStack.push(this.snapshot()); this.restore(this.undoStack.pop()); }
  redo() { if (!this.redoStack.length) return; this.undoStack.push(this.snapshot()); this.restore(this.redoStack.pop()); }

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
    const d = page.linesTop - before;
    // 본문 블록 높이가 바뀌면 그 아래 글씨도 같이 내려요
    if (d) {
      for (const s of this.note.pages[0].strokes) for (let i = 1; i < s.pts.length; i += 3) if (s.pts[i] > before - 30) s.pts[i] += d;
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
function drawStroke(ctx, s) {
  const p = s.pts;
  ctx.setLineDash([]);
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  if (s.tool === 'hl') {
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.globalCompositeOperation = 'multiply';
    ctx.strokeStyle = s.color; ctx.lineWidth = s.w; ctx.lineCap = 'butt';
    ctx.beginPath(); ctx.moveTo(p[0], p[1]);
    for (let i = 3; i < p.length - 3; i += 3) ctx.quadraticCurveTo(p[i], p[i + 1], (p[i] + p[i + 3]) / 2, (p[i + 1] + p[i + 4]) / 2);
    ctx.lineTo(p[p.length - 3], p[p.length - 2]);
    ctx.stroke();
    ctx.restore();
    return;
  }
  ctx.strokeStyle = s.color;
  const n = p.length / 3;
  if (n < 3) {
    ctx.lineWidth = s.w * (0.6 + 0.8 * p[2]);
    ctx.beginPath(); ctx.moveTo(p[0], p[1]); ctx.lineTo(p[p.length - 3], p[p.length - 2]); ctx.stroke();
    return;
  }
  let mx = p[0], my = p[1];
  for (let i = 1; i < n - 1; i++) {
    const x = p[i * 3], y = p[i * 3 + 1], pr = p[i * 3 + 2];
    const nx = (x + p[i * 3 + 3]) / 2, ny = (y + p[i * 3 + 4]) / 2;
    ctx.lineWidth = s.w * (0.55 + 0.9 * pr);
    ctx.beginPath(); ctx.moveTo(mx, my); ctx.quadraticCurveTo(x, y, nx, ny); ctx.stroke();
    mx = nx; my = ny;
  }
  ctx.beginPath(); ctx.moveTo(mx, my); ctx.lineTo(p[p.length - 3], p[p.length - 2]); ctx.stroke();
}
const round = (v) => Math.round(v * 10) / 10;
function pip(poly, x, y) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}
function bbox(strokes) {
  let a = Infinity, b = Infinity, c = -Infinity, d = -Infinity;
  for (const s of strokes) for (let i = 0; i < s.pts.length; i += 3) {
    a = Math.min(a, s.pts[i]); b = Math.min(b, s.pts[i + 1]); c = Math.max(c, s.pts[i]); d = Math.max(d, s.pts[i + 1]);
  }
  return [a - 10, b - 10, c + 10, d + 10];
}
const inBox = (b, x, y) => x >= b[0] && x <= b[2] && y >= b[1] && y <= b[3];
const moveBox = (b, dx, dy) => [b[0] + dx, b[1] + dy, b[2] + dx, b[3] + dy];
