// lumenib 1차 테스트 앱: 화면 흐름
// T1 홈 → T2·T3 본문 고르기 → T4 노트 쓰기 (T5 인용 · T6 이 장 노트 · T7 예전 노트 탭) → 완료 → 홈
import { icon, esc, toast, todayISO, fmtFull, fmtShort, fmtMD, fmtHomeTitle } from './util.js';
import * as B from './bible.js';
import * as S from './store.js';
import { Paper, tool, PEN_COLORS, HL_COLORS, PEN_SIZES, HL_SIZES, ERASER_SIZES } from './ink.js';
import { BiblePanel } from './biblepanel.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay-root');
let cleanup = () => {};
let reading = [];
let lastLocation = null; // 본문 고르기에서 마지막으로 본 곳

const PAPERS = [['lined', '줄 종이'], ['blank', '빈 종이'], ['grid', '모눈 종이'], ['dot', '점 종이']];
const OUT_OF_SCOPE = '1차 테스트에서는 아직 열 수 없어요';

// ---------- 공통 ----------
function applyTheme() {
  document.documentElement.dataset.theme = S.settings.theme;
  document.querySelector('meta[name="theme-color"]').content = S.settings.theme === 'dark' ? '#000000' : '#f7f7f7';
}
const otherNotesFor = (passages, exceptId) =>
  S.allNotes().filter((n) => n.id !== exceptId && n.passages.some((p) => passages.some((q) => B.overlaps(p, q))));
const refList = (n, short = true) => (n.passages.length ? n.passages.map((p) => B.refText(p, short)).join(', ') : '본문 없음');

async function withText(p) {
  if (p.text) return p;
  return { ...p, text: await B.getVerses(p.book, p.ch, p.from, p.to) };
}
async function fillTexts(note) {
  note.passages = await Promise.all(note.passages.map(withText));
  note.citations = await Promise.all(note.citations.map(async (c) => ({ ...c, ...(await withText(c)) })));
}

function modal(html, bind) {
  const d = document.createElement('div');
  d.className = 'dim';
  d.innerHTML = html;
  overlay.appendChild(d);
  const close = () => d.remove();
  d.addEventListener('click', (e) => { if (e.target === d) close(); });
  bind(d, close);
  return close;
}

function go(screen, arg) {
  cleanup();
  cleanup = () => {};
  overlay.innerHTML = '';
  document.body.classList.toggle('noting', screen === 'note');
  ({ home: Home, pick: Pick, note: NoteScreen })[screen](arg);
}

// =========================================================
// T1 홈
// =========================================================
function Home({ highlight } = {}) {
  const notes = S.allNotes();
  const recent = notes.slice(0, 4);
  const thisYear = String(new Date().getFullYear());
  const mixedYears = recent.some((n) => !n.date.startsWith(thisYear));
  const total = reading.length, read = reading.reduce((a, b) => a + b, 0);
  const pct = Math.round((read / total) * 100);
  const fullBooks = (() => {
    let i = 0, count = 0;
    for (const b of B.books()) { const n = b.verses.length; if (reading.slice(i, i + n).every(Boolean)) count++; i += n; }
    return count;
  })();
  const oldN = B.books().filter((b) => b.testament === 'old').reduce((a, b) => a + b.verses.length, 0);
  const dots = (arr) => arr.map((r) => `<i class="${r ? 'r' : ''}"></i>`).join('');
  const C = 2 * Math.PI * 56;

  app.innerHTML = `<div class="home">
    <nav class="home-nav">
      <div class="home-tabs">
        <button class="home-tab on">${icon.home}홈</button>
        <button class="home-tab" data-oos>${icon.book}성경</button>
        <button class="home-tab" data-oos>${icon.note}노트</button>
        <button class="home-tab" data-oos>${icon.bookmark}북마크</button>
      </div>
      <button class="icon-btn gear" data-act="settings" aria-label="설정">${icon.settings}</button>
    </nav>
    <h1>${fmtHomeTitle()}</h1>
    <div class="home-row1">
      <button class="record-card" data-act="record">
        <h2>오늘 설교 기록하기</h2>
        <p>말씀 본문을 고르고 바로 필기를 시작해요</p>
        <span class="btn">본문 고르기 →</span>
      </button>
      <button class="continue-card" data-oos>
        <h2>이어서 읽기 <small>창세기 8장 1절 · 어제</small></h2>${icon.chevRight}
        <p class="gen81">…</p>
        <div class="bm-row">북마크 <span class="chip">롬 8:28</span><span class="chip">시 23:1</span><span class="chip">사 41:10</span></div>
      </button>
    </div>
    <div class="sec-head"><h3>성경 읽기 현황</h3><div class="legend"><span><i style="background:var(--accent-mid)"></i>읽은 장</span><span><i style="background:var(--chart-dot-empty)"></i>안 읽은 장</span></div></div>
    <div class="reading">
      <div class="donut-wrap">
        <div class="donut"><svg width="130" height="130" viewBox="0 0 130 130"><circle cx="65" cy="65" r="56" fill="none" stroke="var(--chart-track)" stroke-width="14"/><circle cx="65" cy="65" r="56" fill="none" stroke="var(--accent-mid)" stroke-width="14" stroke-dasharray="${(C * read) / total} ${C}" transform="rotate(-90 65 65)" stroke-linecap="butt"/></svg><b>${pct}%</b></div>
        <div class="read-num"><small>읽은 장</small><div class="big">${read}<span>/${total.toLocaleString()}</span></div><a data-oos>66권 중 ${fullBooks}권 다 읽음 ${icon.chevRight.replace('width="24" height="24"', 'width="16" height="16"')}</a></div>
      </div>
      <div class="matrix">
        <div class="matrix-row"><span>구약</span><div class="dots">${dots(reading.slice(0, oldN))}</div></div>
        <div class="matrix-row"><span>신약</span><div class="dots">${dots(reading.slice(oldN))}</div></div>
      </div>
    </div>
    <div class="sec-head"><h3>최근 노트</h3><button class="btn-text" data-oos style="font-size:15px;display:flex;align-items:center;gap:2px">전체보기 ${icon.chevRight.replace('width="24" height="24"', 'width="18" height="18"')}</button></div>
    <div class="recent-grid">${recent.map((n) => {
      const same = otherNotesFor(n.passages, n.id).length;
      return `<button class="recent-card ${n.id === highlight ? 'new' : ''}" data-note="${n.id}">
        <span class="ref">${esc(refList(n))}</span>
        <span class="ttl">${esc(n.title || '제목 없음')}</span>
        <span class="meta num">${mixedYears ? fmtShort(n.date) : fmtMD(n.date)}${same ? ` <em>· 같은 본문 ${same}</em>` : ''}</span></button>`;
    }).join('')}</div>
  </div>`;

  B.getVerses(1, 8, 1, 1).then(([v]) => { const el = app.querySelector('.gen81'); if (el) el.textContent = v.t; });
  app.querySelectorAll('[data-oos]').forEach((b) => b.addEventListener('click', () => toast(OUT_OF_SCOPE)));
  app.querySelector('[data-act="record"]').addEventListener('click', () => go('pick'));
  app.querySelector('[data-act="settings"]').addEventListener('click', openSettings);
  app.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => go('note', { noteId: b.dataset.note, from: 'home' })));
  if (highlight) {
    toast('노트가 저장됐어요');
    const t = setTimeout(() => app.querySelector('.recent-card.new')?.classList.remove('new'), 4000);
    cleanup = () => clearTimeout(t);
  }
}

function openSettings() {
  modal(`<div class="modal sheet">
    <h3>설정</h3>
    <div class="toggle-row">화면 모드 <div class="seg2"><button data-th="dark" class="${S.settings.theme === 'dark' ? 'on' : ''}">다크</button><button data-th="light" class="${S.settings.theme === 'light' ? 'on' : ''}">라이트</button></div></div>
    <button class="toggle-row" data-act="finger">손가락으로도 필기하기 <span class="switch ${S.settings.fingerDraw ? 'on' : ''}"></span></button>
    <button class="toggle-row" data-act="reset" style="color:var(--accent-mid)">테스트 기록 지우기 (다음 테스터용)</button>
    <div class="about"><div class="logo"></div>1차 사용성 테스트 버전 · 성경 본문: 개역한글 (대한성서공회)</div>
    <div class="modal-actions"><button class="btn btn-primary" data-act="close">닫기</button></div>
  </div>`, (d, close) => {
    d.querySelectorAll('[data-th]').forEach((b) => b.addEventListener('click', () => {
      S.settings.theme = b.dataset.th; S.saveSettings(); applyTheme();
      d.querySelectorAll('[data-th]').forEach((x) => x.classList.toggle('on', x === b));
    }));
    d.querySelector('[data-act="finger"]').addEventListener('click', (e) => {
      S.settings.fingerDraw = !S.settings.fingerDraw; S.saveSettings();
      e.currentTarget.querySelector('.switch').classList.toggle('on', S.settings.fingerDraw);
    });
    d.querySelector('[data-act="reset"]').addEventListener('click', () => {
      close();
      modal(`<div class="modal"><h3>테스트 기록을 지울까요?</h3><p class="desc">이 기기에서 쓴 노트가 모두 지워지고, 미리 넣어 둔 예시 노트만 남아요.</p>
        <div class="modal-actions"><button class="btn btn-outline" data-a="no">취소</button><button class="btn btn-primary" data-a="yes">지우기</button></div></div>`, (d2, close2) => {
        d2.querySelector('[data-a="no"]').addEventListener('click', close2);
        d2.querySelector('[data-a="yes"]').addEventListener('click', () => { S.resetAll(); lastLocation = null; close2(); go('home'); toast('테스트 기록을 지웠어요'); });
      });
    });
    d.querySelector('[data-act="close"]').addEventListener('click', close);
  });
}

// =========================================================
// T2 · T3 본문 고르기
// =========================================================
function Pick() {
  const st = { info: { date: todayISO(), title: '', preacher: '' }, infoOpen: true, passages: [], paper: 'lined' };
  app.innerHTML = `<div class="screen">
    <header class="topbar"><div class="left"><button class="pill-back" data-act="home">${icon.arrowLeft.replace('width="24" height="24"', 'width="18" height="18"')} 홈</button></div>
      <div class="title">오늘 설교 기록하기</div><div class="right"></div></header>
    <div class="workspace">
      <section class="panel bible-panel"></section>
      <section class="panel right-panel dashed"></section>
    </div></div>`;
  const right = app.querySelector('.right-panel');
  const bp = new BiblePanel(app.querySelector('.bible-panel'), {
    mode: 'pick',
    start: null,
    marks: () => ({
      today: [...st.passages],
      chapterHasNotes: (b, c) => S.allNotes().some((n) => n.passages.some((p) => p.book === b && p.ch === c)),
    }),
    onChange: () => { lastLocation = { book: bp.book, ch: bp.ch }; renderRight(); },
  });
  app.querySelector('[data-act="home"]').addEventListener('click', () => go('home'));

  const current = () => [...st.passages, ...(bp.selection ? [bp.selection] : [])];

  async function renderRight() {
    const ps = current();
    const others = ps.length ? otherNotesFor(ps) : [];
    const texts = await Promise.all(ps.map(withText));
    right.innerHTML = `${infoHTML(st.info, st.infoOpen)}
      ${!ps.length ? `<div class="pick-empty">← 왼쪽에서 오늘 본문을 골라주세요</div>
        <button class="link-more" data-act="nopassage">본문 없이 먼저 쓰기 ${icon.arrowRight.replace('width="24" height="24"', 'width="18" height="18"')}</button>` : `
      <div class="pick-body">
        ${texts.map((p, i) => `<div class="pick-ref">${esc(B.refText(p))} <button class="x-btn" data-rm="${i}" aria-label="빼기">${icon.x.replace('width="24" height="24"', 'width="14" height="14"')}</button></div>
          <div class="pick-verses">${p.text.map((v) => `<div><span class="vn">${v.n}</span>${esc(v.t)}</div>`).join('')}</div>`).join('<div style="height:16px"></div>')}
        ${bp.selection ? `<div style="margin-top:16px"><button class="btn btn-outline" data-act="addmore" style="height:36px;font-size:14px">${icon.plus.replace('width="24" height="24"', 'width="16" height="16"')} 본문 추가</button></div>` : ''}
        ${others.length ? `<div class="pick-sub">이 본문이 포함된 노트 ${others.length}개</div>
          <div class="note-cards">${others.map((n) => `<button class="note-card" data-old="${n.id}"><div class="meta num">${fmtShort(n.date)} · ${esc(refList(n))} · ${esc(n.preacher || '')}</div><div class="ttl">${esc(n.title || '제목 없음')} →</div></button>`).join('')}</div>` : ''}
      </div>
      <div class="pick-foot">
        <button class="paper-select" data-act="paper"><span class="paper-thumb ${st.paper}"></span>${PAPERS.find((p) => p[0] === st.paper)[1]} <svg width="12" height="16" viewBox="0 0 12 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="m3 6 3-3 3 3M3 10l3 3 3-3"/></svg></button>
        <button class="btn btn-primary btn-l" data-act="start">이 본문으로 노트 쓰기</button>
      </div>`}`;
    bindInfo(right, st.info, () => {}, (open) => { st.infoOpen = open; renderRight(); });
    right.querySelector('[data-act="nopassage"]')?.addEventListener('click', () => start([]));
    right.querySelector('[data-act="addmore"]')?.addEventListener('click', () => { st.passages.push(bp.selection); bp.clearSel(); toast('왼쪽에서 다음 본문을 골라주세요'); });
    right.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.rm;
      if (i < st.passages.length) { st.passages.splice(i, 1); renderRight(); bp.render({ keepScroll: true }); } else bp.clearSel();
    }));
    right.querySelector('[data-act="start"]')?.addEventListener('click', () => start(current()));
    right.querySelectorAll('[data-old]').forEach((b) => b.addEventListener('click', () => start(current(), b.dataset.old)));
    right.querySelector('[data-act="paper"]')?.addEventListener('click', (e) => paperMenu(e.currentTarget, st.paper, (v) => { st.paper = v; renderRight(); }));
  }

  async function start(passages, openOld) {
    const withTexts = await Promise.all(passages.map(withText));
    const note = S.newNote({ ...st.info, passages: withTexts, paper: st.paper });
    const loc = passages[0] ? { book: passages[0].book, ch: passages[0].ch, verse: passages[0].from } : lastLocation || { book: bp.book, ch: bp.ch };
    go('note', { noteId: note.id, start: loc, openOld, from: 'pick' });
  }
  renderRight();
}

function paperMenu(anchor, cur, onPick) {
  const r = anchor.getBoundingClientRect();
  modal(`<div class="tb-menu" style="position:fixed;left:${r.left}px;bottom:${innerHeight - r.top + 8}px;right:auto">
    <h6>종이 종류</h6><div class="row">${PAPERS.map(([k, l]) => `<button class="paper-opt ${k === cur ? 'on' : ''}" data-p="${k}"><span class="paper-thumb ${k}"></span>${l.replace(' 종이', '')}</button>`).join('')}</div></div>`,
  (d, close) => { d.style.background = 'transparent'; d.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { close(); onPick(b.dataset.p); })); });
}

// 설교 정보 (날짜 · 제목 · 설교자)
function infoHTML(info, open, readonly = false) {
  const summary = info.title || info.preacher
    ? `${esc(info.title || '제목 없음')}${info.preacher ? `<span class="sub">${esc(info.preacher)}</span>` : ''}`
    : '<span class="muted">설교 정보 (선택)</span>';
  return `<div class="info">
    <button class="info-head" data-act="info">${open ? '설교 정보' : summary}${open ? icon.chevUp : icon.chevDown}</button>
    ${open ? `<div class="info-fields">
      <div class="field"><label>날짜</label><div class="date-show"><span class="num">${fmtFull(info.date)}</span>${icon.calendar.replace('width="24" height="24"', 'width="20" height="20"')}</div>${readonly ? '' : `<input type="date" value="${info.date}" data-f="date">`}</div>
      <div class="field"><label>설교 제목</label><input data-f="title" placeholder="설교 제목(선택)" value="${esc(info.title)}" ${readonly ? 'readonly' : ''}></div>
      <div class="field"><label>설교자</label><input data-f="preacher" placeholder="설교자(선택)" value="${esc(info.preacher)}" ${readonly ? 'readonly' : ''}></div>
    </div>` : ''}</div>`;
}
function bindInfo(root, info, onEdit, onToggle) {
  root.querySelector('[data-act="info"]').addEventListener('click', () => onToggle(!root.querySelector('.info-fields')));
  root.querySelectorAll('[data-f]').forEach((inp) => inp.addEventListener(inp.type === 'date' ? 'change' : 'input', () => {
    if (inp.type === 'date' && !inp.value) return;
    info[inp.dataset.f] = inp.value;
    if (inp.type === 'date') inp.parentElement.querySelector('.num').textContent = fmtFull(inp.value);
    onEdit();
  }));
}

// =========================================================
// T4 노트 쓰기 (+ T5 인용 · T6 이 장 노트 · T7 예전 노트 탭)
// =========================================================
async function NoteScreen({ noteId, start, openOld, from }) {
  const main = S.getNote(noteId);
  const mainReadonly = !!main.seed;
  const ns = {
    tabs: [main.id], active: main.id, leftOpen: true, infoOpen: false,
    paper: null, viewLog: {}, lastSel: {}, undo: {},
  };
  await fillTexts(main);
  const startLoc = start || (main.passages[0] ? { book: main.passages[0].book, ch: main.passages[0].ch, verse: main.passages[0].from } : lastLocation || { book: 1, ch: 1 });

  app.innerHTML = `<div class="screen">
    <header class="topbar">
      <div class="left"><button class="icon-btn" data-act="side" aria-label="성경 패널 접기">${icon.sidebar}</button></div>
      <div class="title">${mainReadonly ? esc(main.title) : from === 'home' ? '노트' : '오늘 설교 기록하기'}</div>
      <div class="right">${mainReadonly ? '' : '<span class="saved-label">자동 저장됨</span>'}<button class="btn btn-primary" data-act="done">${mainReadonly ? '닫기' : '완료'}</button></div>
    </header>
    <div class="workspace">
      <section class="panel bible-panel"></section>
      <section class="panel right-panel note"><div class="tabs-slot"></div><div class="info-slot"></div><div class="paper-scroll"></div><div class="tb-slot"></div></section>
    </div></div>`;
  const right = app.querySelector('.right-panel');
  const scrollEl = right.querySelector('.paper-scroll');
  const leftEl = app.querySelector('.bible-panel');

  const activeNote = () => S.getNote(ns.active);
  const isReadonly = () => ns.active !== main.id || mainReadonly;

  // ----- 왼쪽 성경 -----
  const bp = new BiblePanel(leftEl, {
    mode: 'note',
    start: startLoc,
    marks: () => {
      const chNotes = S.allNotes().filter((n) => n.id !== main.id && n.passages.some((p) => p.book === bp.book && p.ch === bp.ch));
      const noteVerses = new Set();
      chNotes.forEach((n) => n.passages.forEach((p) => { if (p.book === bp.book && p.ch === bp.ch) for (let v = p.from; v <= p.to; v++) noteVerses.add(v); }));
      return {
        today: main.passages, chNotes, noteVerses, fmt: fmtShort,
        chapterHasNotes: (b, c) => S.allNotes().some((n) => n.passages.some((p) => p.book === b && p.ch === c)),
      };
    },
    onChange: () => { lastLocation = { book: bp.book, ch: bp.ch }; if (bp.sel) ns.lastSel[`${bp.book}:${bp.ch}`] = { ...bp.sel }; },
    onOpenNote: (id) => openTab(id),
    actions: (sel) => {
      if (mainReadonly) return [];
      const ref = B.refText(sel, true);
      if (!main.passages.length) return [
        { label: '인용으로 넣기', kind: 'outline', onClick: (s) => insertCite(s) },
        { label: `${ref} 본문으로 넣기`, onClick: (s) => setPassage(s) },
      ];
      return [{ label: `${ref} 노트에 넣기`, onClick: (s) => insertCite(s) }];
    },
    backPill: (b, c) => {
      const p = main.passages[0];
      if (!p || (p.book === b && p.ch === c)) return null;
      return { label: `오늘 본문 ${B.refText(p, true)}`, onClick: () => bp.setLocation(p.book, p.ch, null, p.from) };
    },
    onDrag: mainReadonly ? null : dragHandlers(),
  });

  // 오래 본 곳 기록 (완료할 때 본문 후보로 써요)
  const timer = setInterval(() => {
    if (bp.view === 'verses' && ns.leftOpen && !document.hidden) {
      const k = `${bp.book}:${bp.ch}`;
      ns.viewLog[k] = (ns.viewLog[k] || 0) + 2;
    }
  }, 2000);

  // ----- 오른쪽 -----
  function renderTabs() {
    const slot = right.querySelector('.tabs-slot');
    if (ns.tabs.length < 2) { slot.innerHTML = ''; return; }
    slot.innerHTML = `<div class="tabs">${ns.tabs.map((id) => {
      const n = S.getNote(id);
      const label = `${fmtShort(n.date)} ${refList(n)}`;
      return `<button class="tab ${id === ns.active ? 'on' : ''}" data-tab="${id}"><span class="num">${esc(label)}</span>${id !== main.id ? `<span class="tx" data-close="${id}">${icon.x.replace('width="24" height="24"', 'width="14" height="14"')}</span>` : ''}</button>`;
    }).join('')}</div>`;
    slot.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) { closeTab(c.dataset.close); return; }
      switchTab(b.dataset.tab);
    }));
  }

  function renderInfo() {
    const slot = right.querySelector('.info-slot');
    const n = activeNote();
    slot.innerHTML = infoHTML(n, ns.infoOpen, isReadonly());
    bindInfo(slot, n, () => { S.touch(n); flashSaved(); }, (open) => { ns.infoOpen = open; renderInfo(); });
  }

  let toolbarEl = null;
  function renderToolbar() {
    const slot = right.querySelector('.tb-slot');
    if (isReadonly()) { slot.innerHTML = ''; return; }
    const t = tool.type;
    const tb = (k, ic, label) => `<button class="tb-btn ${t === k ? 'on' : ''}" data-tool="${k}" aria-label="${label}">${ic}</button>`;
    let opts = '';
    if (t === 'pen' || t === 'hl') {
      const colors = t === 'pen' ? PEN_COLORS : HL_COLORS, sizes = t === 'pen' ? PEN_SIZES : HL_SIZES;
      const ci = t === 'pen' ? tool.penColor : tool.hlColor, si = t === 'pen' ? tool.penSize : tool.hlSize;
      opts = colors.map((c, i) => `<button class="swatch ${i === ci ? 'on' : ''}" data-color="${i}"><i style="background:${c}"></i></button>`).join('')
        + '<span class="tb-sep"></span>'
        + sizes.map((_, i) => `<button class="size-dot ${i === si ? 'on' : ''}" data-size="${i}"><i style="width:${[4, 6, 9][i]}px;height:${[4, 6, 9][i]}px"></i></button>`).join('');
    } else if (t === 'eraser') {
      opts = '<span class="tb-hint">닿은 획을 지워요</span><span class="tb-sep"></span>' + ERASER_SIZES.map((_, i) => `<button class="size-dot ${i === tool.eraserSize ? 'on' : ''}" data-size="${i}"><i style="width:${[5, 8, 12][i]}px;height:${[5, 8, 12][i]}px;background:none;border:1.5px solid #111"></i></button>`).join('');
    } else opts = '<span class="tb-hint">옮기거나 지울 글씨를 둘러 그려요</span>';
    const p = ns.paper;
    slot.innerHTML = `<div class="toolbar">
      ${tb('pen', icon.pen, '펜')}${tb('hl', icon.highlighter, '형광펜')}${tb('eraser', icon.eraser, '지우개')}${tb('lasso', icon.lasso, '올가미')}
      <span class="tb-sep"></span><div class="tb-opts">${opts}</div><span class="tb-sep"></span>
      <button class="tb-btn" data-act="undo" ${p?.undoStack.length ? '' : 'disabled'} aria-label="되돌리기">${icon.undo}</button>
      <button class="tb-btn" data-act="redo" ${p?.redoStack.length ? '' : 'disabled'} aria-label="다시 하기">${icon.redo}</button>
      <span class="tb-sep"></span><button class="tb-btn" data-act="more" aria-label="더 보기">${icon.more}</button></div>`;
    toolbarEl = slot.firstElementChild;
    slot.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('click', () => { tool.type = b.dataset.tool; ns.paper?.clearSelection(); renderToolbar(); }));
    slot.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('click', () => { tool[t === 'pen' ? 'penColor' : 'hlColor'] = +b.dataset.color; renderToolbar(); }));
    slot.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('click', () => { tool[t === 'pen' ? 'penSize' : t === 'hl' ? 'hlSize' : 'eraserSize'] = +b.dataset.size; renderToolbar(); }));
    slot.querySelector('[data-act="undo"]').addEventListener('click', () => ns.paper.undo());
    slot.querySelector('[data-act="redo"]').addEventListener('click', () => ns.paper.redo());
    slot.querySelector('[data-act="more"]').addEventListener('click', toggleMore);
  }

  function toggleMore() {
    const ex = toolbarEl.querySelector('.tb-menu');
    if (ex) { ex.remove(); return; }
    const m = document.createElement('div');
    m.className = 'tb-menu';
    m.innerHTML = `<h6>종이 종류</h6><div class="row">${PAPERS.map(([k, l]) => `<button class="paper-opt ${k === main.paper ? 'on' : ''}" data-p="${k}"><span class="paper-thumb ${k}"></span>${l.replace(' 종이', '')}</button>`).join('')}</div>
      <button class="toggle-row" data-act="finger">손가락으로도 쓰기 <span class="switch ${S.settings.fingerDraw ? 'on' : ''}"></span></button>`;
    toolbarEl.appendChild(m);
    m.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { main.paper = b.dataset.p; S.touch(main); ns.paper.render(); m.remove(); }));
    m.querySelector('[data-act="finger"]').addEventListener('click', (e) => {
      S.settings.fingerDraw = !S.settings.fingerDraw; S.saveSettings();
      ns.paper.setFingerDraw(S.settings.fingerDraw);
      e.currentTarget.querySelector('.switch').classList.toggle('on', S.settings.fingerDraw);
    });
  }

  let savedT;
  function flashSaved() {
    const el = app.querySelector('.saved-label');
    if (!el) return;
    el.textContent = '저장 중…';
    clearTimeout(savedT);
    savedT = setTimeout(() => (el.textContent = '자동 저장됨'), 600);
  }

  async function mountPaper() {
    if (ns.paper) { ns.undo[ns.paper.note.id] = [ns.paper.undoStack, ns.paper.redoStack]; ns.paper.destroy(); }
    const n = activeNote();
    await fillTexts(n);
    const p = new Paper(scrollEl, n, {
      readonly: isReadonly(),
      fingerDraw: S.settings.fingerDraw,
      onChange: () => { S.touch(n); flashSaved(); if (n === main) bp.render({ keepScroll: true }); },
      onHistory: () => renderToolbar(),
    });
    if (ns.undo[n.id]) [p.undoStack, p.redoStack] = ns.undo[n.id];
    ns.paper = p;
    await p.render();
    scrollEl.scrollTop = 0;
    renderToolbar();
  }

  function openTab(id) {
    if (id === main.id) return switchTab(id);
    if (!ns.tabs.includes(id)) ns.tabs.push(id);
    switchTab(id);
  }
  function closeTab(id) {
    ns.tabs = ns.tabs.filter((t) => t !== id);
    if (ns.active === id) switchTab(main.id); else renderTabs();
  }
  async function switchTab(id) {
    ns.active = id;
    ns.infoOpen = false;
    renderTabs(); renderInfo();
    await mountPaper();
  }

  // ----- 본문 · 인용 넣기 -----
  async function ensureMainTab() { if (ns.active !== main.id) await switchTab(main.id); }
  async function setPassage(sel, silent) {
    await ensureMainTab();
    const p = await withText(sel);
    ns.paper.setPassage(p);
    bp.sel = null; bp.render({ keepScroll: true });
    if (!silent) toast(`${B.refText(p, true)}을 오늘 본문으로 넣었어요`);
  }
  async function insertCite(sel, at) {
    await ensureMainTab();
    const c = await withText(sel);
    ns.paper.insertCitation({ book: c.book, ch: c.ch, from: c.from, to: c.to, text: c.text }, at);
    bp.sel = null; bp.render({ keepScroll: true });
  }

  function dragHandlers() {
    let ghost = null, line = null;
    const clearMarks = () => { line?.remove(); line = null; scrollEl.querySelectorAll('.drop-on').forEach((e) => e.classList.remove('drop-on')); };
    return {
      start: async (sel) => {
        const v = await B.getVerses(sel.book, sel.ch, sel.from, sel.from);
        ghost = document.createElement('div');
        ghost.className = 'drag-ghost';
        ghost.innerHTML = `<small>${esc(B.refText(sel, true))}</small><span>${esc(v[0]?.t || '')}</span>`;
        document.body.appendChild(ghost);
      },
      move: (x, y) => {
        if (ghost) { ghost.style.left = x + 'px'; ghost.style.top = y + 'px'; }
        clearMarks();
        if (isReadonly() && ns.active !== main.id) return;
        const hit = ns.paper?.hitTest(x, y);
        if (!hit) return;
        if (hit.onPlaceholder) { scrollEl.querySelector('.passage-placeholder')?.classList.add('drop-on'); return; }
        line = document.createElement('div');
        line.className = 'drop-line';
        line.style.top = hit.y * ns.paper.scale + 'px';
        hit.el.appendChild(line);
      },
      drop: async (x, y, sel) => {
        ghost?.remove(); ghost = null; clearMarks();
        if (x == null) return;
        if (ns.active !== main.id) { toast('예전 노트에는 넣을 수 없어요'); return; }
        const hit = ns.paper?.hitTest(x, y);
        if (!hit) return;
        if (hit.onPlaceholder && !main.passages.length) return setPassage(sel);
        insertCite(sel, { page: hit.page, y: hit.y - 10 });
      },
    };
  }

  // ----- 위쪽 버튼 -----
  app.querySelector('[data-act="side"]').addEventListener('click', () => {
    ns.leftOpen = !ns.leftOpen;
    leftEl.classList.toggle('closed', !ns.leftOpen);
  });
  app.querySelector('[data-act="done"]').addEventListener('click', () => {
    if (mainReadonly) return go('home');
    if (!main.passages.length) return askPassage();
    finish();
  });

  function finish() {
    main.done = true;
    S.touch(main);
    S.saveNotes(true);
    go('home', { highlight: main.id });
  }

  // 본문 없이 완료하려 할 때: 본문 후보 제안
  async function askPassage() {
    const cands = [];
    const top = Object.entries(ns.viewLog).sort((a, b) => b[1] - a[1])[0];
    if (top) {
      const [b, c] = top[0].split(':').map(Number);
      const s = ns.lastSel[top[0]];
      cands.push({ p: s ? { book: b, ch: c, ...s } : { book: b, ch: c, from: 1, to: B.verseCount(b, c) }, why: '오늘 가장 오래 본 곳' });
    }
    if (!cands.length && bp.view === 'verses') {
      const s = bp.sel || ns.lastSel[`${bp.book}:${bp.ch}`];
      cands.push({ p: s ? { book: bp.book, ch: bp.ch, ...s } : { book: bp.book, ch: bp.ch, from: 1, to: B.verseCount(bp.book, bp.ch) }, why: '지금 보고 있는 곳' });
    }
    main.citations.forEach((c) => {
      const p = { book: c.book, ch: c.ch, from: c.from, to: c.to };
      if (!cands.some((x) => B.refText(x.p) === B.refText(p))) cands.push({ p, why: '노트에 인용한 구절' });
    });
    let pick = cands.length ? 0 : -1;
    modal(`<div class="modal">
      <h3>오늘 본문을 정하고 마칠까요?</h3>
      <p class="desc">본문을 정해 두면 나중에 같은 본문 노트를 찾을 수 있어요.</p>
      <div class="opts">${cands.slice(0, 3).map((c, i) => `<button class="opt ${i === pick ? 'on' : ''}" data-i="${i}"><span class="radio"></span><span><b>${esc(B.refText(c.p))}</b><small>${c.why}</small></span></button>`).join('')}</div>
      <button class="link" data-a="manual">다른 구절 직접 고르기</button>
      <div class="modal-actions"><button class="btn btn-outline" data-a="skip">본문 없이 저장</button><button class="btn btn-primary" data-a="ok" ${pick < 0 ? 'disabled' : ''}>이 본문으로 저장</button></div>
    </div>`, (d, close) => {
      d.querySelectorAll('[data-i]').forEach((b) => b.addEventListener('click', () => {
        pick = +b.dataset.i;
        d.querySelectorAll('[data-i]').forEach((x) => x.classList.toggle('on', x === b));
        d.querySelector('[data-a="ok"]').disabled = false;
      }));
      d.querySelector('[data-a="manual"]').addEventListener('click', () => {
        close();
        if (!ns.leftOpen) app.querySelector('[data-act="side"]').click();
        toast('왼쪽에서 구절을 고른 뒤 "본문으로 넣기"를 눌러 주세요', 3200);
      });
      d.querySelector('[data-a="skip"]').addEventListener('click', () => { close(); finish(); });
      d.querySelector('[data-a="ok"]').addEventListener('click', async () => { close(); await setPassage(cands[pick].p, true); finish(); });
    });
  }

  cleanup = () => { clearInterval(timer); ns.paper?.destroy(); clearTimeout(savedT); };

  renderTabs();
  renderInfo();
  await mountPaper();
  if (openOld) openTab(openOld);
}

// =========================================================
// 시작
// =========================================================
async function main() {
  applyTheme();
  const t0 = Date.now();
  await B.loadIndex();
  reading = S.readingSeed(B.books().map((b) => b.verses.length));
  go('home');
  const wait = Math.max(0, 900 - (Date.now() - t0));
  setTimeout(() => document.getElementById('splash').classList.add('hide'), wait);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();
