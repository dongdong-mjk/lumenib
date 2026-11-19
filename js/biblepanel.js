// 왼쪽 성경 패널 (본문 고르기 · 노트 쓰기에서 같이 써요)
import { icon, esc, chosung, firstCho } from './util.js';
import * as B from './bible.js';
import { recentBooks, pushRecentBook, settings, saveSettings } from './store.js';

const SIZES = [15, 16, 18, 20];

export class BiblePanel {
  /**
   * opts.mode: 'pick' | 'note'
   * opts.marks(): { today: [passage], noteVerses: Set<number> (현재 장), chapterHasNotes(book,ch), chNotes: [note] }
   * opts.onChange(): 선택이나 위치가 바뀔 때
   * opts.actions(sel): [{label, kind, onClick}] 선택했을 때 아래에 뜨는 버튼
   * opts.onDrag: { move(x,y,sel), drop(x,y,sel) } 선택한 구절을 끌어서 노트로
   */
  constructor(el, opts) {
    this.el = el;
    this.o = opts;
    this.view = opts.start ? 'verses' : 'books';
    this.sort = 'toc';
    this.book = opts.start?.book || 1;
    this.ch = opts.start?.ch || 1;
    this.sel = null;
    this.query = '';
    this.chNotesOpen = false;
    this.render({ scrollTo: opts.start?.verse });
  }

  setLocation(book, ch, sel = null, scrollTo) {
    this.book = book; this.ch = ch; this.view = 'verses'; this.sel = sel;
    this.render({ scrollTo: scrollTo || sel?.from });
    this.o.onChange?.();
  }

  get selection() {
    return this.sel ? { book: this.book, ch: this.ch, from: this.sel.from, to: this.sel.to } : null;
  }
  clearSel() { this.sel = null; this.render({ keepScroll: true }); this.o.onChange?.(); }

  render({ scrollTo, keepScroll } = {}) {
    const prevScroll = this.el.querySelector('.bp-body')?.scrollTop || 0;
    if (this.view === 'books') this.renderBooks();
    else if (this.view === 'chapters') this.renderChapters();
    else return this.renderVerses(scrollTo, keepScroll ? prevScroll : null);
    // 권 · 장 목록도 다시 그릴 때 보던 위치를 그대로 둬요
    if (keepScroll) { const body = this.el.querySelector('.bp-body'); if (body) body.scrollTop = prevScroll; }
  }

  head(extra = '') {
    const b = B.book(this.book);
    if (this.view === 'chapters') {
      return `<div class="bp-head"><button class="bp-drop" data-go="books">${esc(b.name)} ${icon.chevDown}</button></div>`;
    }
    return `<div class="bp-head">
      <button class="bp-drop" data-go="books">${esc(b.name)} ${icon.chevDown}</button>
      <button class="bp-drop" data-go="chapters">${this.ch}장 ${icon.chevDown}</button>
      <span class="spacer"></span>
      <button class="aa" data-act="aa" aria-label="글자 크기">A<span style="font-size:13px">a</span></button>${extra}</div>`;
  }

  // ---------- 권 고르기 ----------
  renderBooks() {
    const recent = recentBooks().map((id) => `<button class="chip" data-book="${id}">${esc(B.book(id).name)}</button>`).join('');
    const backHead = this.o.mode === 'note'
      ? `<div class="bp-head"><button class="bp-drop" data-go="verses">${icon.arrowLeft} ${esc(B.book(this.book).name)} ${this.ch}장</button></div>` : '';
    this.el.innerHTML = `${backHead}
      <label class="bp-search">${icon.search}<input type="search" enterkeyhint="search" placeholder="창세기 1:1, ㄹㅁ 8" value="${esc(this.query)}" autocomplete="off"></label>
      <div class="bp-body"></div>`;
    const input = this.el.querySelector('input');
    const body = this.el.querySelector('.bp-body');
    input.addEventListener('input', () => { this.query = input.value; this.fillBooks(body, recent); this.bindCommon(body); });
    this.fillBooks(body, recent);
    this.bindCommon();
  }

  fillBooks(body, recent) {
    const q = this.query.trim();
    if (q) { body.innerHTML = this.searchHTML(q); return; }
    const all = B.books();
    let grid;
    if (this.sort === 'toc') {
      grid = ['old', 'new'].map((t) => `<div class="group-label">${t === 'old' ? '구약' : '신약'}</div>
        <div class="book-grid">${all.filter((b) => b.testament === t).map((b) => `<button class="book-btn" data-book="${b.id}">${esc(b.name)}</button>`).join('')}</div>`).join('');
    } else {
      const sorted = [...all].sort((a, b) => a.name.localeCompare(b.name, 'ko'));
      const groups = {};
      sorted.forEach((b) => (groups[firstCho(b.name)] ||= []).push(b));
      grid = Object.entries(groups).map(([k, list]) => `<div class="group-label">${k}</div>
        <div class="book-grid">${list.map((b) => `<button class="book-btn" data-book="${b.id}">${esc(b.name)}</button>`).join('')}</div>`).join('');
    }
    body.innerHTML = `<div class="recent">최근 ${recent}</div>
      <div class="seg"><button data-sort="toc" class="${this.sort === 'toc' ? 'on' : ''}">목차순</button><button data-sort="abc" class="${this.sort === 'abc' ? 'on' : ''}">가나다순</button></div>
      ${grid}<div style="height:24px"></div>`;
  }

  searchHTML(q) {
    const m = q.replace(/\s+/g, ' ').match(/^([^\d:]+?)\s*(\d+)?\s*(?:[:장.\s]\s*(\d+))?\s*(?:절)?$/);
    if (!m) return `<div class="empty-hint">예: 롬 8:35, 시편 23, ㅊㅅㄱ 1</div>`;
    const name = m[1].trim().replace(/\s/g, '');
    const ch = m[2] ? +m[2] : null, v = m[3] ? +m[3] : null;
    const hits = B.books().filter((b) => b.name.startsWith(name) || b.abbr === name || b.abbr.startsWith(name) || chosung(b.name).startsWith(name));
    if (!hits.length) return `<div class="empty-hint">"${esc(q)}"에 맞는 권이 없어요</div>`;
    return `<div class="search-results">${hits.slice(0, 12).map((b) => {
      const okCh = ch && ch <= b.verses.length ? ch : null;
      const okV = okCh && v && v <= b.verses[okCh - 1] ? v : null;
      const label = okCh ? `${b.name} ${okCh}${okV ? ':' + okV : '장'}` : b.name;
      return `<button class="search-row" data-jump="${b.id}|${okCh || ''}|${okV || ''}"><b>${esc(label)}</b><span>${okCh ? '' : b.verses.length + '장'}</span></button>`;
    }).join('')}</div>`;
  }

  // ---------- 장 고르기 ----------
  renderChapters() {
    const b = B.book(this.book);
    const marks = this.o.marks?.() || {};
    this.el.innerHTML = `${this.head()}<div class="bp-body"><div class="ch-grid">${b.verses.map((_, i) => {
      const c = i + 1;
      const dot = marks.chapterHasNotes?.(this.book, c) ? '<i class="dot"></i>' : '';
      return `<button class="ch-btn ${c === this.ch ? 'cur' : ''}" data-ch="${c}">${dot}${c}장</button>`;
    }).join('')}</div></div>`;
    this.bindCommon();
  }

  // ---------- 구절 ----------
  async renderVerses(scrollTo, keepScroll) {
    const token = (this._tok = (this._tok || 0) + 1);
    const verses = await B.getVerses(this.book, this.ch);
    if (token !== this._tok) return;
    const marks = this.o.marks?.() || {};
    const today = (marks.today || []).filter((p) => p.book === this.book && p.ch === this.ch);
    const isToday = (n) => today.some((p) => n >= p.from && n <= p.to);
    const noteVerses = marks.noteVerses || new Set();
    const sel = this.sel;
    const chNotes = marks.chNotes || [];
    const chNotesHTML = this.o.mode === 'note' && chNotes.length ? `
      <div class="ch-notes">
        <button class="ch-notes-head" data-act="chnotes">이 장에 쓴 노트 <span class="badge num">${chNotes.length}</span>${this.chNotesOpen ? icon.chevUp : icon.chevDown}</button>
        ${this.chNotesOpen ? chNotes.map((n) => `<button class="ch-note-row" data-note="${n.id}"><div>
          <div class="t1">${esc(n.passages.map((p) => B.refText(p, true)).join(', '))}<small class="num">${esc(marks.fmt(n.date))}</small></div>
          <div class="t2">${esc(n.title || '제목 없음')} <em>· ${esc(n.preacher || '설교자 없음')}</em></div></div>${icon.chevRight}</button>`).join('') : ''}
      </div>` : '';
    const last = B.chapterCount(this.book);
    this.el.innerHTML = `${this.head()}${chNotesHTML}
      <div class="bp-body" style="--verse-size:${settings.verseSize}px"><div class="verses">
      ${verses.map((v) => {
        const inSel = sel && v.n >= sel.from && v.n <= sel.to;
        const cls = ['verse', isToday(v.n) && !inSel ? 'today' : '', inSel ? 'sel' : '', inSel && v.n === sel.from ? 'first' : '', inSel && v.n === sel.to ? 'last' : ''].join(' ');
        return `<div class="${cls}" data-n="${v.n}">${noteVerses.has(v.n) ? '<i class="has-note"></i>' : ''}<span class="vn">${v.n}</span><span class="vt">${esc(v.t)}</span></div>`;
      }).join('')}
      <div class="chapter-nav">
        ${this.ch > 1 ? `<button class="btn btn-text" data-ch="${this.ch - 1}">${icon.arrowLeft} ${this.ch - 1}장</button>` : '<span></span>'}
        ${this.ch < last ? `<button class="btn btn-text" data-ch="${this.ch + 1}">${this.ch + 1}장 ${icon.arrowRight}</button>` : '<span></span>'}
      </div></div></div>
      <div class="bp-float"></div>`;
    const body = this.el.querySelector('.bp-body');
    if (scrollTo) {
      const t = body.querySelector(`.verse[data-n="${scrollTo}"]`);
      if (t) body.scrollTop = Math.max(0, t.offsetTop - body.clientHeight * 0.3);
    } else if (keepScroll != null) body.scrollTop = keepScroll;
    this.renderFloat();
    this.bindCommon();
    this.bindVerses(body);
  }

  renderFloat() {
    const f = this.el.querySelector('.bp-float');
    if (!f) return;
    const sel = this.selection;
    if (sel && this.o.actions) {
      const acts = this.o.actions(sel);
      f.innerHTML = acts.length ? `<div class="bp-action">${acts.map((a, i) => `<button class="btn ${a.kind === 'outline' ? 'btn-outline' : 'btn-primary'}" data-a="${i}">${esc(a.label)}</button>`).join('')}</div>` : '';
      f.querySelectorAll('[data-a]').forEach((b) => b.addEventListener('click', () => acts[+b.dataset.a].onClick(sel)));
      return;
    }
    const pill = this.o.backPill?.(this.book, this.ch);
    f.innerHTML = pill ? `<button class="back-today">${icon.back} ${esc(pill.label)}</button>` : '';
    f.querySelector('.back-today')?.addEventListener('click', pill?.onClick);
  }

  bindCommon(root) {
    const el = root || this.el;
    el.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => { this.view = b.dataset.go; this.query = ''; this.render({ scrollTo: this.sel?.from }); }));
    el.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', () => { this.sort = b.dataset.sort; this.render(); }));
    el.querySelectorAll('[data-book]').forEach((b) => b.addEventListener('click', () => {
      this.book = +b.dataset.book; this.sel = null; pushRecentBook(this.book);
      if (B.chapterCount(this.book) === 1) { this.ch = 1; this.view = 'verses'; } else this.view = 'chapters';
      this.render(); this.o.onChange?.();
    }));
    el.querySelectorAll('[data-ch]').forEach((b) => b.addEventListener('click', () => {
      this.ch = +b.dataset.ch; this.view = 'verses'; this.sel = null; this.render(); this.o.onChange?.();
    }));
    el.querySelectorAll('[data-jump]').forEach((b) => b.addEventListener('click', () => {
      const [bk, ch, v] = b.dataset.jump.split('|').map((x) => +x || null);
      this.book = bk; this.query = ''; pushRecentBook(bk);
      if (!ch) { this.view = B.chapterCount(bk) === 1 ? 'verses' : 'chapters'; this.ch = 1; this.render(); this.o.onChange?.(); return; }
      this.setLocation(bk, ch, v ? { from: v, to: v } : null, v);
    }));
    el.querySelector('[data-act="aa"]')?.addEventListener('click', () => {
      const i = SIZES.indexOf(settings.verseSize);
      settings.verseSize = SIZES[(i + 1) % SIZES.length]; saveSettings();
      el.querySelector('.bp-body').style.setProperty('--verse-size', settings.verseSize + 'px');
    });
    el.querySelector('[data-act="chnotes"]')?.addEventListener('click', () => { this.chNotesOpen = !this.chNotesOpen; this.render({ keepScroll: true }); });
    el.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => this.o.onOpenNote?.(b.dataset.note)));
  }

  bindVerses(body) {
    let drag = null;
    let suppressClick = false;
    body.addEventListener('click', (e) => {
      if (suppressClick) { suppressClick = false; return; }
      const v = e.target.closest('.verse');
      if (!v) return;
      const n = +v.dataset.n;
      const s = this.sel;
      if (!s) this.sel = { from: n, to: n };
      else if (s.from === s.to && s.from === n) this.sel = null;
      else if (s.from === s.to) this.sel = { from: Math.min(s.from, n), to: Math.max(s.from, n) };
      else this.sel = { from: n, to: n };
      this.render({ keepScroll: true });
      this.o.onChange?.();
    });
    if (!this.o.onDrag) return;
    body.addEventListener('pointerdown', (e) => {
      const v = e.target.closest('.verse.sel');
      if (!v || e.button > 0) return;
      drag = { x0: e.clientX, y0: e.clientY, started: false, id: e.pointerId };
    });
    const move = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (!drag.started) {
        if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 10) return;
        drag.started = true;
        try { body.setPointerCapture(e.pointerId); } catch {}
        this.o.onDrag.start?.(this.selection);
      }
      e.preventDefault();
      this.o.onDrag.move(e.clientX, e.clientY, this.selection);
    };
    const up = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.started) {
        suppressClick = true;
        setTimeout(() => (suppressClick = false), 300);
        this.o.onDrag.drop(e.type === 'pointercancel' ? null : e.clientX, e.clientY, this.selection);
      }
      drag = null;
    };
    body.addEventListener('pointermove', move);
    body.addEventListener('pointerup', up);
    body.addEventListener('pointercancel', up);
  }
}
