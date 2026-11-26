// lumenib 1차 테스트 앱: 화면 흐름
// T1 홈 → T2·T3 본문 고르기 → T4 노트 쓰기 (T5 인용 · T6 이 장 노트 · T7 예전 노트 탭) → 완료 → 홈
import { icon, esc, toast, toastAction, copyText, firstCho, todayISO, fmtFull, fmtShort, fmtMD, fmtHomeTitle } from './util.js';
import * as B from './bible.js';
import * as S from './store.js';
import { Paper, tool, snapForNative, SIZE_RANGE, SIZE_DEFAULT, PEN_STYLES, PEN_OPT_DEFAULT, PEN_OPT_FOR, penSamplePath, PEN_COLORS, HL_COLORS, PEN_SIZES, HL_SIZES, ERASER_SIZES, PEN_PALETTE, HL_PALETTE } from './ink.js';
import { BiblePanel } from './biblepanel.js';
import { screen as trackScreen, track, isTracking, trackingPref, setTrackingPref } from './analytics.js';
import * as L from './legal.js';
import * as C from './cloud.js';

const app = document.getElementById('app');
const overlay = document.getElementById('overlay-root');
let cleanup = () => {};
let lastLocation = null; // 본문 고르기에서 마지막으로 본 곳
let curScreen = null;

const PAPERS = [['lined', '줄 종이'], ['blank', '빈 종이'], ['grid', '모눈 종이'], ['dot', '점 종이']];
const OUT_OF_SCOPE = '1차 테스트에서는 아직 열 수 없어요';

// ---------- 공통 ----------
// 화면 모드: 'system'(기본, iPad 설정을 따라요) · 'light' · 'dark' (11/26 민정님)
const darkMQ = matchMedia('(prefers-color-scheme: dark)');
const themeNow = () => (S.settings.theme === 'system' ? (darkMQ.matches ? 'dark' : 'light') : S.settings.theme);
function applyTheme() {
  const t = themeNow();
  document.documentElement.dataset.theme = t;
  document.querySelector('meta[name="theme-color"]').content = t === 'dark' ? '#000000' : '#f7f7f7';
  // iPad 앱이면 앱 바탕색도 같이 (다음에 켤 때 처음 보이는 색)
  // value = 지금 보이는 모드(예전 빌드용), mode = 고른 설정(system이면 앱이 iPad 설정을 따르게, 44~)
  window.webkit?.messageHandlers?.lumenibNative?.postMessage({ action: 'theme', value: t, mode: S.settings.theme });
  try { syncTopBar(); } catch {} // 첫 화면 전에 불리면 아직 준비 전이에요
}
darkMQ.addEventListener?.('change', () => { if (S.settings.theme === 'system') applyTheme(); });
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

// 위 탭 바·설정 버튼은 앱이 그려요 (iPad 기본 유리 모양, 11/26). 웹 탭 바는 자리만 지키고 안 보여요.
// 자리·글자·색을 앱에 보내고, 앱에서 누르면 같은 웹 버튼을 대신 눌러요 (화면마다 하던 일 그대로).
const nativeTop = !!window.webkit?.messageHandlers?.lumenibTopBar;
document.documentElement.classList.toggle('native-top', nativeTop);
document.documentElement.classList.toggle('native-icons', !!window.webkit?.messageHandlers?.lumenibTopIcons); // 노트 쓰기 · 검색까지 앱이 그리는 빌드 (47~)
let topRaf = 0, topLast = '';
function syncTopBar() { if (!nativeTop || topRaf) return; topRaf = setTimeout(() => { topRaf = 0; sendTopBar(); }, 16); } // 여러 번 불려도 한 번만
function sendTopBar() {
  const nav = app.querySelector('.home-nav'), tabs = nav?.querySelector('.home-tabs');
  const gear = nav?.querySelector('[data-act="settings"]');
  const R = (el) => { const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height].map((x) => Math.round(x * 2) / 2); };
  let m = { show: false };
  // 바텀시트·확인 창이 떠 있으면 앱 탭 바도 숨겨요 (어두운 막 위에 버튼이 뜨지 않게)
  const splash = document.getElementById('splash');
  const splashOn = splash && !splash.classList.contains('hide');
  if (nav && tabs && !splashOn && !overlay.firstElementChild && R(tabs)[2] > 0) {
    const cs = getComputedStyle(document.documentElement), v = (k) => cs.getPropertyValue(k).trim();
    m = {
      show: true, box: R(tabs), gear: gear ? R(gear) : null, dark: document.documentElement.dataset.theme === 'dark',
      // 오른쪽 아이콘 버튼 전부 (노트 쓰기 · 검색 · 설정): 앱이 같은 유리 버튼으로 그려요 (11/26)
      icons: [...nav.querySelectorAll('.gear[data-act]')].map((b) => ({ act: b.dataset.act, label: b.getAttribute('aria-label') || '', icon: (b.querySelector('.nav-ico')?.className.match(/ni-([a-z]+)/) || [])[1] || '', rect: R(b) })),
      colors: { primary: v('--text-primary'), secondary: v('--text-secondary'), icon: v('--icon-primary'), pill: v('--bg-tab-active') },
      tabs: [...tabs.querySelectorAll('.home-tab')].map((b) => ({ act: b.dataset.act, label: b.textContent.trim(), icon: (b.querySelector('.nav-ico')?.className.match(/ni-([a-z]+)/) || [])[1] || '', on: b.classList.contains('on'), rect: R(b) })),
    };
  }
  const k = JSON.stringify(m);
  if (k === topLast) return;
  topLast = k;
  window.webkit.messageHandlers.lumenibNative.postMessage({ action: 'topBar', ...m });
}
window.lumenibTopBar = (act) => { app.querySelector(`.home-nav [data-act="${act}"]`)?.click(); };
if (nativeTop) {
  new MutationObserver(syncTopBar).observe(app, { childList: true, subtree: true });
  new MutationObserver(syncTopBar).observe(overlay, { childList: true });
  // 스플래시가 사라질 때(흐려지는 0.35초 동안 같이) 앱 탭 바를 보여요 (46 피드백: 스플래시 위에 탭 바가 떠 있었음)
  const sp = document.getElementById('splash');
  if (sp) new MutationObserver(() => setTimeout(syncTopBar, 120)).observe(sp, { attributes: true, attributeFilter: ['class'] });
  addEventListener('resize', syncTopBar);
  document.addEventListener('scroll', syncTopBar, { capture: true, passive: true });
}

// iPad 앱 표시 (앱에서만 필요한 화면 조정용)
document.documentElement.classList.toggle('ios-app', !!window.webkit?.messageHandlers?.lumenibNative);

// 슬라이더 채워진 부분 표시 (CSS --p)
const fillRange = (r) => r.style.setProperty('--p', ((r.value - r.min) / (r.max - r.min || 1)) * 100 + '%');
document.addEventListener('input', (e) => { if (e.target.matches?.('input[type=range]')) fillRange(e.target); });
new MutationObserver(() => document.querySelectorAll('input[type=range]').forEach(fillRange)).observe(document.body, { childList: true, subtree: true });

// 필요할 때만 외부 도구를 불러와요 (PDF 만들기)
const _scripts = {};
function loadScript(src) {
  return (_scripts[src] ||= new Promise((ok, fail) => {
    const s = document.createElement('script');
    s.src = src; s.onload = ok; s.onerror = () => { delete _scripts[src]; fail(new Error('load ' + src)); };
    document.head.appendChild(s);
  }));
}

function go(screen, arg) {
  // 떠 있던 토스트(예: "노트가 저장됐어요")는 다른 화면으로 가면 그 자리에서 사라져요
  const t = document.getElementById('toast');
  if (t) t.style.left = ''; // 성경 탭은 토스트를 읽기 칸 가운데에 띄워요. 다른 화면에선 원래대로
  if (t?.classList.contains('show')) {
    t.classList.add('leave'); t.classList.remove('show');
    setTimeout(() => t.classList.remove('leave'), 200);
  }
  cleanup();
  cleanup = () => {};
  overlay.innerHTML = '';
  document.body.classList.toggle('noting', screen === 'note');
  curScreen = screen;
  if (screen === 'home' && C.currentUser() && Date.now() - C.syncStatus().lastSync > 30000) C.sync();
  trackScreen(screen === 'note' && arg?.noteId ? 'note_view' : screen);
  ({ home: Home, pick: Pick, note: NoteScreen, notes: NotesScreen, bible: BibleScreen, bookmarks: BookmarksScreen, settings: SettingsScreen, onboarding: OnboardingScreen })[screen](arg);
  window.__lumenibGo = go; // 회귀 점검(tools/regression.js)에서 화면을 바로 옮길 때 씀
}

// =========================================================
// T1 홈
// =========================================================
function Home({ highlight } = {}) {
  const notes = S.allNotes();
  const reading = S.readingArray(B.books());
  const loc = S.settings.bibleLoc; // 이어서 읽기 = 마지막으로 읽던 곳 (없으면 "성경 읽기 · 창세기 1장부터", 11/26 정책 7)
  const recentBm = S.bookmarks().slice().sort((a, b) => (b.t || 0) - (a.t || 0)).slice(0, 3); // 최근 북마크 3개
  // 최근 노트: 내가 쓴 노트를 마지막으로 고친 순서대로 먼저, 남는 칸만 예시 노트로 (11/25)
  // 설교 날짜순으로만 고르면 날짜가 최근인 예시 노트에 밀려 방금 쓴 노트가 안 보였어요
  const mine = notes.filter((n) => !n.seed).sort((a, b) => (Number(b.updatedAt) || b.createdAt || 0) - (Number(a.updatedAt) || a.createdAt || 0));
  const recent = [...mine, ...notes.filter((n) => n.seed)].slice(0, 4);
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
  const R = 57.6, C = 2 * Math.PI * R;
  const chev = (n) => icon.chevRight.replace('width="24" height="24"', `width="${n}" height="${n}"`);

  // 내비게이션은 줄이는 칸(home-inner) 밖에 둬요: 창이 작아 홈을 줄여도 성경·노트 화면과 같은 높이 (11/25 민정님)
  app.innerHTML = `<div class="home">${tabBar('home')}<div class="home-inner">
    <h1>${fmtHomeTitle()}</h1>
    <div class="home-row1">
      <div class="rc-wrap"><button class="record-card" data-act="record">
        <span class="rc-lines" aria-hidden="true"><i style="top:97px"></i><i style="top:128px"></i><i style="top:159px;left:117px"></i><i style="top:190px"></i><b></b></span>
        <span class="rc-flap" aria-hidden="true"></span>
        <h2>오늘 설교 기록하기</h2>
        <p>말씀 본문을 고르고 바로 필기를 시작해요</p>
        <span class="rc-btn">본문 고르기 →</span>
      </button></div>
      <button class="continue-card" data-act="bible">
        ${loc ? `<h2>이어서 읽기 <small>${esc(B.book(loc.book).name)} ${loc.ch}${unitOf(loc.book)} ${loc.v || 1}절<i class="dot3"></i>${agoText(loc.t)}</small></h2>`
    : '<h2>성경 읽기 <small>창세기 1장부터</small></h2>'}${icon.chevRight}
        <p class="gen81">…</p>
        <div class="bm-row"><b>북마크</b>${recentBm.length ? recentBm.map((b) => `<span class="chip" data-bm="${b.book}|${b.ch}|${b.from}|${b.to}">${esc(B.refText(b, true))}</span>`).join('') : '<span class="bm-empty">성경에서 구절을 골라 북마크하면 여기에 모여요</span>'}</div>
      </button>
    </div>
    <section class="home-sec read-sec">
      <div class="sec-head"><h3>성경 읽기 현황</h3><div class="legend"><span><i style="background:var(--accent-mid)"></i>읽은 장</span><span><i style="background:var(--chart-dot-empty)"></i>안 읽은 장</span></div></div>
      <div class="reading">
        <div class="hero">
          <div class="donut"><svg width="128" height="128" viewBox="0 0 128 128"><circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--chart-track)" stroke-width="12.8"/>${read ? `<circle cx="64" cy="64" r="${R}" fill="none" stroke="var(--accent-mid)" stroke-width="12.8" stroke-dasharray="${(C * read) / total} ${C}" transform="rotate(-90 64 64)" stroke-linecap="round"/>` : ''}</svg><b>${pct}%</b></div>
          <div class="read-num"><small>읽은 장</small><div class="big">${read}<span>/${total.toLocaleString()}</span></div><a data-act="bible-books">66권 중 ${fullBooks}권 다 읽음 ${chev(12)}</a></div>
        </div>
        <div class="matrix">
          <div class="matrix-row"><span>구약</span><div class="dots">${dots(reading.slice(0, oldN))}</div></div>
          <div class="matrix-row"><span>신약</span><div class="dots">${dots(reading.slice(oldN))}</div></div>
        </div>
      </div>
    </section>
    <section class="home-sec recent-sec">
      <div class="sec-head tall"><h3>최근 노트</h3><button class="more-link" data-act="notes">전체보기 ${chev(12)}</button></div>
      ${recent.length ? '' : '<div class="recent-empty">설교를 기록하면 여기에 최근 노트가 보여요</div>'}
      <div class="recent-grid">${recent.map((n) => {
        const same = otherNotesFor(n.passages, n.id).length;
        return `<button class="recent-card ${n.id === highlight ? 'new' : ''}" data-note="${n.id}">
          <span class="ref">${esc(refList(n))}</span>
          <span class="ttl">${esc(n.title || '제목 없음')}</span>
          <span class="meta num">${mixedYears ? fmtShort(n.date) : fmtMD(n.date)}${same ? `<i class="dot4"></i><em>같은 본문 ${same}</em>` : ''}</span></button>`;
      }).join('')}</div>
    </section>
  </div></div>`;
  fitHome();
  slideTabPill();
  setTimeout(fitHome, 300); // 앱에서는 상태 표시줄 높이(safe-area)가 조금 늦게 잡혀서 한 번 더
  window.addEventListener('resize', fitHome);
  const offResize = () => window.removeEventListener('resize', fitHome);

  B.getVerses(loc?.book || 1, loc?.ch || 1, loc?.v || 1, loc?.v || 1).then(([v]) => { const el = app.querySelector('.gen81'); if (el && v) el.textContent = v.t; });
  app.querySelectorAll('[data-act="bible"]').forEach((b) => b.addEventListener('click', (e) => {
    // 북마크 칩을 누르면 그 구절로 (잠깐 표시), 카드 나머지는 읽던 곳(없으면 창세기 1장)
    const chip = e.target.closest?.('[data-bm]');
    if (chip) { const [book, ch, from, to] = chip.dataset.bm.split('|').map(Number); track('home_bm_chip'); go('bible', { book, ch, verse: from, flash: { from, to } }); return; }
    go('bible');
  }));
  app.querySelector('[data-act="bible-books"]')?.addEventListener('click', () => go('bible', { books: true }));
  app.querySelectorAll('[data-oos]').forEach((b) => b.addEventListener('click', () => { track('out_of_scope'); toast(OUT_OF_SCOPE); }));
  app.querySelector('[data-act="record"]').addEventListener('click', () => go('pick'));
  app.querySelectorAll('[data-act="notes"]').forEach((b) => b.addEventListener('click', () => go('notes')));
  app.querySelector('.home-nav [data-act="home"]')?.addEventListener('click', () => {});
  app.querySelector('[data-act="settings"]').addEventListener('click', openSettings);
  app.querySelectorAll('[data-note]').forEach((b) => b.addEventListener('click', () => go('note', { noteId: b.dataset.note, from: 'home' })));
  if (highlight) {
    toast('노트가 저장됐어요');
    const t = setTimeout(() => app.querySelector('.recent-card.new')?.classList.remove('new'), 4000);
    cleanup = () => { clearTimeout(t); offResize(); };
  } else cleanup = offResize;
}


// =========================================================
// T8 노트 목록 (11/25) · 피그마 "노트 목록 (11-25, Claude)" 라이트 시안 · 정책 13
// 홈 "최근 노트 · 전체보기"와 위 탭 "노트"가 같은 화면이에요
// =========================================================
// 목록 검색 화면 (노트 · 북마크 공통, 피그마 T8.노트 검색 / T10.북마크 검색, 11/26)
// 위 줄 = 검색창 + 취소. 비어 있으면 최근 검색(모두 지우기), 입력하면 결과. 최근 검색은 이 기기에 10개까지
// =========================================================
function listSearch({ recentKey, placeholder, q, setQ, results, bindResults, onCancel }) {
  const recent = () => { try { return JSON.parse(localStorage.getItem(recentKey) || '[]'); } catch { return []; } };
  const saveRecent = (list) => { try { localStorage.setItem(recentKey, JSON.stringify(list.slice(0, 10))); } catch {} };
  let cur = q || '';
  const keep = () => { const t = cur.trim(); if (t) saveRecent([t, ...recent().filter((x) => x !== t)]); };
  app.innerHTML = `<div class="home notes searching"><div class="nl-wrap">
    <div class="ns-bar">
      <label class="nl-search">${NOTE_ICON('search')}<input type="search" placeholder="${esc(placeholder)}" value="${esc(cur)}" autocomplete="off" enterkeyhint="search"><button type="button" class="bp-search-clear" aria-label="검색어 지우기" ${cur ? '' : 'hidden'}>${icon.x}</button></label>
      <button class="ns-cancel" data-act="search-cancel">취소</button>
    </div>
    <div class="nl-list ns-list"></div>
  </div></div>`;
  const input = app.querySelector('.ns-bar input'), clear = app.querySelector('.ns-bar .bp-search-clear'), box = app.querySelector('.ns-list');
  const fill = () => {
    const t = cur.trim();
    if (!t) {
      const r = recent();
      box.innerHTML = r.length ? `<section class="ns-recent"><div class="ns-rhead"><h3>최근 검색</h3><button class="ns-clearall" data-act="recent-clear">모두 지우기</button></div>
        ${r.map((x) => `<button class="ns-ritem" data-q="${esc(x)}">${esc(x)}</button>`).join('')}</section>` : '';
      box.querySelector('[data-act="recent-clear"]')?.addEventListener('click', () => { saveRecent([]); fill(); });
      box.querySelectorAll('.ns-ritem').forEach((b) => b.addEventListener('click', () => { set(b.dataset.q); keep(); }));
      return;
    }
    box.innerHTML = results(t);
    bindResults(box, keep);
  };
  const set = (v) => { cur = v; setQ(v); input.value = v; clear.hidden = !v; fill(); };
  input.addEventListener('input', () => set(input.value));
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { keep(); input.blur(); } });
  clear.addEventListener('pointerdown', (e) => e.preventDefault());
  clear.addEventListener('click', () => { set(''); input.focus(); });
  app.querySelector('[data-act="search-cancel"]').addEventListener('click', onCancel);
  fill();
  if (!cur) input.focus();
  return fill; // 결과를 다시 그릴 때 (예: 북마크 본문을 다 불러왔을 때)
}

// =========================================================
// 위 탭 바 (홈·노트 화면 공통). 고른 탭 뒤의 알약은 하나만 있고, 탭을 옮기면 유리알처럼 미끄러져 가요 (11/25)
function tabBar(active, { write = false, search = false } = {}) {
  // 아이콘은 피그마 Icon 페이지의 outline(fill=false) / fill(fill=true) 세트 그대로. 고른 탭만 fill (11/25)
  const ico = (name, on) => `<i class="nav-ico ni-${name}${on ? '-fill' : ''}" aria-hidden="true"></i>`;
  const t = (key, name, label, attrs) => `<button class="home-tab${active === key ? ' on' : ''}" ${attrs}>${ico(name, active === key)}${label}</button>`;
  return `<nav class="home-nav">
    <div class="home-tabs"><span class="tab-pill" aria-hidden="true"></span>
      ${t('home', 'home', '홈', 'data-act="home"')}
      ${t('bible', 'book', '성경', 'data-act="bible"')}
      ${t('notes', 'note', '노트', 'data-act="notes"')}
      ${t('bookmark', 'bookmark', '북마크', 'data-act="bookmarks"')}
    </div>
    ${write ? `<button class="icon-btn gear nav-write${search ? ' with-search' : ''}" data-act="write-note" aria-label="노트 쓰기"><i class="nav-ico gear-ico ni-pen" aria-hidden="true"></i><span class="nav-tip" role="tooltip">노트 쓰기</span></button>` : ''}
    ${search ? '<button class="icon-btn gear nav-search" data-act="search" aria-label="검색"><i class="nav-ico gear-ico ni-search" aria-hidden="true"></i></button>' : ''}
    <button class="icon-btn gear" data-act="settings" aria-label="설정"><i class="nav-ico gear-ico ni-settings" aria-hidden="true"></i></button>
  </nav>`;
}
function bindWriteBtn(btn, onTap) {
  if (!btn) return;
  let t = 0, held = false;
  const hide = () => { clearTimeout(t); btn.classList.remove('tip'); };
  btn.addEventListener('pointerdown', () => { held = false; clearTimeout(t); t = setTimeout(() => { held = true; btn.classList.add('tip'); }, 450); });
  btn.addEventListener('pointerup', () => { clearTimeout(t); if (held) setTimeout(hide, 900); });
  btn.addEventListener('pointercancel', hide);
  btn.addEventListener('pointerleave', () => { if (!held) clearTimeout(t); });
  btn.addEventListener('contextmenu', (e) => e.preventDefault());
  btn.addEventListener('click', () => { if (held) { held = false; return; } onTap(); });
}
// 바텀시트를 아래로 밀면 닫혀요 (11/26 민정님). 버튼·스테퍼를 누를 땐 그대로 눌리고, 아래로 충분히(또는 빠르게) 밀면 내려가며 닫혀요
function sheetDragClose(sheet, close) {
  if (!sheet) return;
  let y0 = 0, t0 = 0, dy = 0, id = null, moved = false;
  sheet.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    id = e.pointerId; y0 = e.clientY; t0 = performance.now(); dy = 0; moved = false;
  });
  sheet.addEventListener('pointermove', (e) => {
    if (e.pointerId !== id) return;
    dy = Math.max(0, e.clientY - y0);
    if (!moved && dy > 8) { moved = true; sheet.classList.add('dragging'); try { sheet.setPointerCapture(id); } catch {} }
    if (moved) sheet.style.transform = `translateY(${dy}px)`;
  });
  const end = (e) => {
    if (e.pointerId !== id) return;
    id = null;
    if (!moved) return;
    sheet.classList.remove('dragging');
    const v = dy / Math.max(1, performance.now() - t0); // px/ms
    sheet.classList.add('settle');
    if (dy > Math.min(120, sheet.offsetHeight * 0.3) || v > 0.6) {
      sheet.style.transform = `translateY(${sheet.offsetHeight + 40}px)`;
      setTimeout(close, 200);
    } else {
      sheet.style.transform = '';
      setTimeout(() => sheet.classList.remove('settle'), 240);
    }
  };
  sheet.addEventListener('pointerup', end);
  sheet.addEventListener('pointercancel', end);
  // 밀고 난 뒤에 손을 뗀 자리의 버튼이 눌리지 않게
  sheet.addEventListener('click', (e) => { if (moved) { e.stopPropagation(); e.preventDefault(); moved = false; } }, true);
}
function slideTabPill() {
  // 유리알 미끄러짐 애니메이션은 뺐어요 (11/25 민정님: 노트 화면 버튼을 누를 때마다 알약이 움직였음 · 나중에 네이티브 진짜 유리알로)
  const bar = app.querySelector('.home-tabs'), pill = bar?.querySelector('.tab-pill'), on = bar?.querySelector('.home-tab.on');
  if (!pill || !on) return;
  pill.style.transform = `translateX(${on.offsetLeft}px)`;
  pill.style.width = on.offsetWidth + 'px';
}
const NOTE_ICON = (name) => `<i class="nl-ico nl-${name}" aria-hidden="true"></i>`;
const SORTS = {
  date: [['new', '최신순'], ['old', '오래된순']],
  passage: [['bible', '성경 순서'], ['abc', '가나다순'], ['many', '노트 많은 순']],
};
function NotesScreen() {
  const st = {
    view: S.settings.notesView === 'passage' ? 'passage' : 'date',
    sort: { date: 'new', passage: 'bible', ...(S.settings.notesSort || {}) },
    q: '', selecting: false, sel: new Set(), menu: false, searching: false,
  };
  const remember = () => { S.settings.notesView = st.view; S.settings.notesSort = st.sort; S.saveSettings(); };
  const chapName = (p) => `${B.book(p.book).name} ${p.ch}${p.book === 19 ? '편' : '장'}`;
  const matches = (n) => {
    const q = st.q.trim().toLowerCase();
    if (!q) return true;
    const hay = [n.title, n.preacher, refList(n, true), refList(n, false)].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  };
  const byDate = (a, b) => (a.date + (a.updatedAt || '')).localeCompare(b.date + (b.updatedAt || ''));

  function groups(notes) {
    if (st.view === 'date') {
      const list = notes.slice().sort(byDate);
      if (st.sort.date === 'new') list.reverse();
      const out = [];
      for (const n of list) {
        const [y, m] = n.date.split('-');
        const key = `${y}-${m}`;
        let g = out.at(-1);
        if (!g || g.key !== key) out.push(g = { key, label: `${y}년 ${Number(m)}월`, notes: [] });
        g.notes.push(n);
      }
      return out;
    }
    // 본문별: 첫 본문의 장으로 묶어요. 본문 없는 노트는 맨 아래 "본문 없음"
    const map = new Map(), none = [];
    for (const n of notes) {
      const p = n.passages[0];
      if (!p) { none.push(n); continue; }
      const key = p.book * 1000 + p.ch;
      if (!map.has(key)) map.set(key, { key, book: p.book, ch: p.ch, label: chapName(p), notes: [] });
      map.get(key).notes.push(n);
    }
    const out = [...map.values()];
    for (const g of out) g.notes.sort((a, b) => (a.passages[0].from || 0) - (b.passages[0].from || 0) || byDate(b, a));
    const bible = (a, b) => a.key - b.key;
    if (st.sort.passage === 'abc') out.sort((a, b) => a.label.localeCompare(b.label, 'ko') || bible(a, b));
    else if (st.sort.passage === 'many') out.sort((a, b) => b.notes.length - a.notes.length || bible(a, b));
    else out.sort(bible);
    if (none.length) out.push({ key: 'none', label: '본문 없음', notes: none.sort(byDate).reverse() });
    return out;
  }

  function card(n) {
    // 같은 본문 개수: 그리는 동안 노트 목록을 한 번만 받아 써요 (카드마다 전체 노트를 다시 정렬하던 것, 11/25)
    const same = st.view === 'date' && n.passages.length ? curAll.filter((m) => m.id !== n.id && m.passages.some((p) => n.passages.some((q) => B.overlaps(p, q)))).length : 0;
    const on = st.sel.has(n.id);
    const ref = n.passages.length ? esc(refList(n)) : '본문 없음';
    return `<button class="nl-card${on ? ' on' : ''}" data-id="${n.id}">
      <span class="nl-top"><span class="nl-ref">${ref}</span><span class="nl-ttl">${esc(n.title || '제목 없음')}</span></span>
      <span class="nl-meta"><span class="nl-dp"><span>${st.view === 'date' ? fmtMD(n.date) : fmtShort(n.date)}</span>${n.preacher ? `<i class="nl-dot"></i><span>${esc(n.preacher)}</span>` : ''}</span>${same ? `<span class="nl-same">같은 본문 ${same}</span>` : ''}</span>
      ${st.selecting ? `<span class="nl-check">${NOTE_ICON(on ? 'cb-on' : 'cb-off')}</span>` : ''}
    </button>`;
  }

  let curAll = [];
  // 지금 보이는(검색으로 걸러진) 노트를 다 골랐는지 — 다 골랐으면 버튼이 "선택 해제"
  const allPicked = () => { const ids = S.allNotes().filter(matches).map((x) => x.id); return ids.length > 0 && ids.every((id) => st.sel.has(id)); };
  function listHTML() {
    const all = curAll = S.allNotes();
    const gs = groups(all.filter(matches));
    const emptyMsg = all.length ? `'${esc(st.q.trim())}'에 맞는 노트가 없어요` : '설교를 기록하면 여기에 최근 노트가 보여요';
    return gs.length ? gs.map((g) => `<section class="nl-group">
        <h3 class="nl-gh">${esc(g.label)}<span>${g.notes.length}</span></h3>
        <div class="nl-grid">${g.notes.map(card).join('')}</div></section>`).join('') : `<p class="nl-empty">${emptyMsg}</p>`;
  }
  // ---------- 검색 (피그마 T8.노트 검색 · 처음 / 결과, 11/26): 공통 listSearch ----------
  function renderSearch() {
    st.refreshSearch = listSearch({
      recentKey: 'lumenib.recentSearch.notes', placeholder: '제목, 설교자, 본문으로 찾기', q: st.q,
      setQ: (q) => { st.q = q; },
      results: (q) => {
        curAll = S.allNotes();
        const hits = curAll.filter(matches).sort(byDate).reverse();
        return hits.length ? `<section class="nl-group"><h3 class="nl-gh">노트<span>${hits.length}</span></h3><div class="nl-grid">${hits.map(card).join('')}</div></section>`
          : `<p class="nl-empty">'${esc(q)}'에 맞는 노트가 없어요</p>`;
      },
      bindResults: (box, keep) => box.querySelectorAll('.nl-card').forEach((c) => c.addEventListener('click', () => { keep(); track('notes_search_open'); go('note', { noteId: c.dataset.id, from: 'notes' }); })),
      onCancel: () => { st.searching = false; st.q = ''; render(); },
    });
  }

  function render() {
    if (st.searching) { renderSearch(); return; }
    const all = S.allNotes();
    const sorts = SORTS[st.view], cur = sorts.find((x) => x[0] === st.sort[st.view]) || sorts[0];
    const n = st.sel.size;
    app.innerHTML = `<div class="home notes"><div class="nl-wrap">
      ${tabBar('notes', { write: !st.selecting, search: !st.selecting })}
      <div class="nl-head">
        ${st.selecting ? `<h1 class="nl-title">${n}개 선택됨</h1>` : `<h1 class="nl-title">노트<span class="nl-count">${all.length}</span></h1>`}
      </div>
      <div class="nl-controls">
        <div class="nl-seg${st.selecting ? ' off' : ''}" role="tablist">
          <button class="${st.view === 'date' ? 'on' : ''}" data-view="date">날짜별</button>
          <button class="${st.view === 'passage' ? 'on' : ''}" data-view="passage">본문별</button>
        </div>
        ${st.selecting ? `<div class="nl-right sel">
          <button class="nl-btn text" data-act="all">${allPicked() ? '선택 해제' : '전체 선택'}</button>
          <button class="nl-btn outline" data-act="cancel">취소</button>
          <button class="nl-btn primary" data-act="del" ${n ? '' : 'disabled'}>삭제</button>
        </div>` : `<div class="nl-right">
          <div class="nl-sort"><button class="nl-dd" data-act="sort">${cur[1]}${NOTE_ICON(st.menu ? 'up' : 'down')}</button>
          ${st.menu ? `<div class="nl-menu">${sorts.map(([k, l]) => `<button class="nl-mi${k === cur[0] ? ' on' : ''}" data-sort="${k}">${l}${k === cur[0] ? NOTE_ICON('tick') : ''}</button>`).join('')}</div>` : ''}</div>
          <button class="nl-btn outline" data-act="select" ${all.length ? '' : 'disabled'}>선택</button>
        </div>`}
      </div>
      <div class="nl-list">${listHTML()}</div>
    </div></div>`;
    bind();
    slideTabPill();
  }

  function bind() {
    app.querySelector('[data-act="home"]').addEventListener('click', () => go('home'));
    app.querySelector('.home-nav [data-act="bible"]')?.addEventListener('click', () => go('bible'));
    app.querySelector('[data-act="settings"]').addEventListener('click', openSettings);
    bindWriteBtn(app.querySelector('[data-act="write-note"]'), () => { track('notes_write_note'); go('pick', { back: 'notes' }); });
    app.querySelector('.home-nav [data-act="search"]')?.addEventListener('click', () => { track('notes_search'); st.searching = true; st.q = ''; st.menu = false; render(); });
    app.querySelectorAll('[data-oos]').forEach((b) => b.addEventListener('click', () => { track('out_of_scope'); toast(OUT_OF_SCOPE); }));
    // 검색바: 본문 고르기 화면(성경 패널) 검색바와 같은 상태 — 포커스(테두리 진하게) · 입력 중(값 + 지우기 ×) · 입력 완료
    // 입력할 때는 목록만 다시 그려서 키보드·커서가 그대로예요
    const input = app.querySelector('.nl-search input');
    if (input) {
      const clear = app.querySelector('.nl-search .bp-search-clear');
      input.addEventListener('input', () => {
        st.q = input.value; clear.hidden = !input.value;
        app.querySelector('.nl-list').innerHTML = listHTML(); bindCards();
      });
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') input.blur(); }); // 입력 완료: 키보드 닫힘
      clear.addEventListener('pointerdown', (e) => e.preventDefault()); // 키보드 포커스 유지
      clear.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
    }
    app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      if (st.selecting || st.view === b.dataset.view) return;
      st.view = b.dataset.view; st.menu = false; remember(); track('notes_view_' + st.view); render();
    }));
    app.querySelector('[data-act="sort"]')?.addEventListener('click', (e) => { e.stopPropagation(); st.menu = !st.menu; render(); });
    app.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); st.sort[st.view] = b.dataset.sort; st.menu = false; remember(); track('notes_sort_' + b.dataset.sort); render();
    }));
    app.querySelector('[data-act="select"]')?.addEventListener('click', () => { st.selecting = true; st.menu = false; st.sel.clear(); render(); });
    app.querySelector('[data-act="cancel"]')?.addEventListener('click', () => { st.selecting = false; st.sel.clear(); render(); });
    app.querySelector('[data-act="all"]')?.addEventListener('click', () => {
      const ids = S.allNotes().filter(matches).map((x) => x.id);
      const allOn = ids.every((id) => st.sel.has(id));
      st.sel = new Set(allOn ? [] : ids); render();
    });
    app.querySelector('[data-act="del"]')?.addEventListener('click', () => {
      const ids = [...st.sel];
      if (!ids.length) return;
      const snap = S.trashNotes(ids);
      track('notes_delete');
      st.selecting = false; st.sel.clear(); render();
      toastAction(`노트 ${ids.length}개를 삭제했어요`, '되돌리기', () => { S.restoreNotes(snap); track('notes_delete_undo'); if (curScreen === 'notes') render(); });
    });
    bindCards();
  }
  function bindCards() {
    app.querySelectorAll('.nl-card').forEach((c) => c.addEventListener('click', () => {
      const id = c.dataset.id;
      if (st.selecting) { if (st.sel.has(id)) st.sel.delete(id); else st.sel.add(id); render(); return; }
      go('note', { noteId: id, from: 'notes' });
    }));
  }

  // 메뉴 밖을 누르면 정렬 메뉴를 닫아요
  const outside = (e) => { if (st.menu && !e.target.closest('.nl-sort')) { st.menu = false; render(); } };
  document.addEventListener('pointerdown', outside, true);
  const off = C.on((w) => { if ((w === 'notes' || w === 'user') && curScreen === 'notes' && !st.selecting && !st.searching) render(); });
  cleanup = () => { document.removeEventListener('pointerdown', outside, true); off?.(); };
  render();
}



// =========================================================
// T10 북마크 탭 (11/26) · 피그마 "북마크 탭 (11-26, Claude)" · 정책 15
// 구성은 노트 목록(T8)과 같아요: 제목 · 검색 · [날짜별 | 본문별] · 정렬 · 선택. 카드 두 열
// =========================================================
const TR_NAME = { krv: '개역한글', nkrv: '개역개정', snb: '표준새번역' }; // 역본 이름 (지금은 개역한글만)
const BM_SORTS = {
  date: [['new', '최신순'], ['old', '오래된순']],
  passage: [['bible', '성경 순서'], ['abc', '가나다순']],
};
const bmText = new Map(); // 카드 본문 (역본·구절별로 한 번만 불러요)
const bmTextKey = (b) => `${b.tr || 'krv'}:${b.book}:${b.ch}:${b.from}-${b.to}`;
function BookmarksScreen() {
  const st = {
    view: S.settings.bmView === 'passage' ? 'passage' : 'date',
    sort: { date: 'new', passage: 'bible', ...(S.settings.bmSort || {}) },
    q: '', selecting: false, sel: new Set(), menu: false, searching: false,
  };
  const remember = () => { S.settings.bmView = st.view; S.settings.bmSort = st.sort; S.saveSettings(); };
  const keyOf = (b) => bmTextKey(b) + ':' + (b.t || 0);
  const all = () => S.bookmarks();
  // 검색: 구절(짧은·긴 이름)과 본문. 역본과 상관없이 구절 기준
  const matches = (b) => {
    const q = st.q.trim().toLowerCase();
    if (!q) return true;
    const hay = [B.refText(b, true), B.refText(b), bmText.get(bmTextKey(b)) || ''].join(' ').toLowerCase();
    return q.split(/\s+/).every((w) => hay.includes(w));
  };
  const bibleOrder = (a, b) => a.book - b.book || a.ch - b.ch || a.from - b.from || a.to - b.to || (b.t || 0) - (a.t || 0);
  const ymd = (t) => { const d = new Date(t || 0); return [d.getFullYear(), d.getMonth() + 1, d.getDate()]; };
  const pad = (n) => String(n).padStart(2, '0');

  function groups(list) {
    if (st.view === 'date') {
      const l = list.slice().sort((a, b) => (b.t || 0) - (a.t || 0));
      if (st.sort.date === 'old') l.reverse();
      const out = [];
      for (const b of l) {
        const [y, m] = ymd(b.t), key = `${y}-${m}`;
        let g = out.at(-1);
        if (!g || g.key !== key) out.push(g = { key, label: `${y}년 ${m}월`, items: [] });
        g.items.push(b);
      }
      return out;
    }
    // 본문별: 권으로 묶고, 같은 권 안에서는 장·절 순서
    const map = new Map();
    for (const b of list) {
      if (!map.has(b.book)) map.set(b.book, { key: b.book, label: B.book(b.book).name, items: [] });
      map.get(b.book).items.push(b);
    }
    const out = [...map.values()];
    out.forEach((g) => g.items.sort(bibleOrder));
    if (st.sort.passage === 'abc') out.sort((a, b) => a.label.localeCompare(b.label, 'ko') || a.key - b.key);
    else out.sort((a, b) => a.key - b.key);
    return out;
  }

  function card(b) {
    const k = keyOf(b), on = st.sel.has(k);
    const [y, m, d] = ymd(b.t);
    const date = st.view === 'date' ? `${pad(m)}.${pad(d)}` : `${String(y).slice(2)}.${pad(m)}.${pad(d)}`;
    return `<button class="bm-card${on ? ' on' : ''}" data-k="${esc(k)}">
      <span class="bm-top"><span class="bm-rt"><b>${esc(B.refText(b, true))}</b><span class="bm-tr">${esc(TR_NAME[b.tr || 'krv'] || b.tr)}</span></span>${st.selecting ? `<span class="nl-check">${NOTE_ICON(on ? 'cb-on' : 'cb-off')}</span>` : `<span class="bm-date">${date}</span>`}</span>
      <span class="bm-text">${esc(bmText.get(bmTextKey(b)) || '')}</span>
    </button>`;
  }
  const visible = () => all().filter(matches);
  const allPicked = () => { const ks = visible().map(keyOf); return ks.length > 0 && ks.every((k) => st.sel.has(k)); };
  function listHTML() {
    const list = all();
    const gs = groups(list.filter(matches));
    const emptyMsg = list.length ? `'${esc(st.q.trim())}'에 맞는 북마크가 없어요` : '성경을 읽다가 구절을 골라 북마크하면 여기에 모여요';
    return gs.length ? gs.map((g) => `<section class="nl-group">
        <h3 class="nl-gh">${esc(g.label)}<span>${g.items.length}</span></h3>
        <div class="bm-grid">${g.items.map(card).join('')}</div></section>`).join('') : `<p class="nl-empty">${emptyMsg}</p>`;
  }
  // 검색 (피그마 T10.북마크 검색 · 결과, 11/26): 노트와 같은 화면
  function renderSearch() {
    st.refreshSearch = listSearch({
      recentKey: 'lumenib.recentSearch.bookmarks', placeholder: '구절, 본문으로 찾기', q: st.q,
      setQ: (q) => { st.q = q; },
      results: (q) => {
        const hits = all().filter(matches).sort((a, b) => (b.t || 0) - (a.t || 0));
        return hits.length ? `<section class="nl-group"><h3 class="nl-gh">북마크<span>${hits.length}</span></h3><div class="bm-grid">${hits.map(card).join('')}</div></section>`
          : `<p class="nl-empty">'${esc(q)}'에 맞는 북마크가 없어요</p>`;
      },
      bindResults: (box, keep) => box.querySelectorAll('.bm-card').forEach((c) => c.addEventListener('click', () => {
        const b = all().find((x) => keyOf(x) === c.dataset.k);
        if (b) { keep(); track('bm_search_open'); go('bible', { book: b.book, ch: b.ch, verse: b.from, flash: { from: b.from, to: b.to } }); }
      })),
      onCancel: () => { st.searching = false; st.q = ''; render(); },
    });
  }
  function render() {
    if (st.searching) { renderSearch(); return; }
    const list = all();
    const sorts = BM_SORTS[st.view], cur = sorts.find((x) => x[0] === st.sort[st.view]) || sorts[0];
    const n = st.sel.size;
    app.innerHTML = `<div class="home notes bookmarks"><div class="nl-wrap">
      ${tabBar('bookmark', { search: !st.selecting })}
      <div class="nl-head">
        ${st.selecting ? `<h1 class="nl-title">${n}개 선택됨</h1>` : `<h1 class="nl-title">북마크<span class="nl-count">${list.length}</span></h1>`}
      </div>
      <div class="nl-controls">
        <div class="nl-seg${st.selecting ? ' off' : ''}" role="tablist">
          <button class="${st.view === 'date' ? 'on' : ''}" data-view="date">날짜별</button>
          <button class="${st.view === 'passage' ? 'on' : ''}" data-view="passage">본문별</button>
        </div>
        ${st.selecting ? `<div class="nl-right sel">
          <button class="nl-btn text" data-act="all">${allPicked() ? '선택 해제' : '전체 선택'}</button>
          <button class="nl-btn outline" data-act="cancel">취소</button>
          <button class="nl-btn primary" data-act="del" ${n ? '' : 'disabled'}>삭제</button>
        </div>` : `<div class="nl-right">
          <div class="nl-sort"><button class="nl-dd" data-act="sort">${cur[1]}${NOTE_ICON(st.menu ? 'up' : 'down')}</button>
          ${st.menu ? `<div class="nl-menu">${sorts.map(([k, l]) => `<button class="nl-mi${k === cur[0] ? ' on' : ''}" data-sort="${k}">${l}${k === cur[0] ? NOTE_ICON('tick') : ''}</button>`).join('')}</div>` : ''}</div>
          <button class="nl-btn outline" data-act="select" ${list.length ? '' : 'disabled'}>선택</button>
        </div>`}
      </div>
      <div class="nl-list">${listHTML()}</div>
    </div></div>`;
    bind();
    slideTabPill();
  }
  // 카드 본문 불러오기: 처음 한 번 (책 파일은 한 번 받으면 다시 안 받아요)
  async function loadTexts() {
    const need = all().filter((b) => !bmText.has(bmTextKey(b)));
    if (!need.length) return;
    await Promise.all(need.map(async (b) => {
      const vs = await B.getVerses(b.book, b.ch, b.from, b.to).catch(() => []);
      bmText.set(bmTextKey(b), vs.map((v) => v.t).join(' '));
    }));
    if (curScreen === 'bookmarks') {
      if (st.searching) { st.refreshSearch?.(); return; }
      const l = app.querySelector('.nl-list'); if (l) { l.innerHTML = listHTML(); bindCards(); }
    }
  }

  function bind() {
    app.querySelector('.home-nav [data-act="home"]').addEventListener('click', () => go('home'));
    app.querySelector('.home-nav [data-act="bible"]').addEventListener('click', () => go('bible'));
    app.querySelector('.home-nav [data-act="notes"]').addEventListener('click', () => go('notes'));
    app.querySelector('[data-act="settings"]').addEventListener('click', openSettings);
    app.querySelector('.home-nav [data-act="search"]')?.addEventListener('click', () => { track('bm_search'); st.searching = true; st.q = ''; st.menu = false; render(); });
    app.querySelectorAll('[data-view]').forEach((b) => b.addEventListener('click', () => {
      if (st.selecting || st.view === b.dataset.view) return;
      st.view = b.dataset.view; st.menu = false; remember(); track('bm_view_' + st.view); render();
    }));
    app.querySelector('[data-act="sort"]')?.addEventListener('click', (e) => { e.stopPropagation(); st.menu = !st.menu; render(); });
    app.querySelectorAll('[data-sort]').forEach((b) => b.addEventListener('click', (e) => {
      e.stopPropagation(); st.sort[st.view] = b.dataset.sort; st.menu = false; remember(); render();
    }));
    app.querySelector('[data-act="select"]')?.addEventListener('click', () => { st.selecting = true; st.menu = false; st.sel.clear(); render(); });
    app.querySelector('[data-act="cancel"]')?.addEventListener('click', () => { st.selecting = false; st.sel.clear(); render(); });
    app.querySelector('[data-act="all"]')?.addEventListener('click', () => {
      const ks = visible().map(keyOf), allOn = ks.every((k) => st.sel.has(k));
      st.sel = new Set(allOn ? [] : ks); render();
    });
    app.querySelector('[data-act="del"]')?.addEventListener('click', () => {
      const pick = all().filter((b) => st.sel.has(keyOf(b)));
      if (!pick.length) return;
      const snap = S.removeBookmarks(pick);
      track('bm_delete');
      st.selecting = false; st.sel.clear(); render();
      toastAction(`북마크 ${pick.length}개를 삭제했어요`, '되돌리기', () => { S.restoreBookmarks(snap); track('bm_delete_undo'); if (curScreen === 'bookmarks') render(); });
    });
    bindCards();
  }
  function bindCards() {
    app.querySelectorAll('.bm-card').forEach((c) => c.addEventListener('click', () => {
      const k = c.dataset.k;
      if (st.selecting) { if (st.sel.has(k)) st.sel.delete(k); else st.sel.add(k); render(); return; }
      const b = all().find((x) => keyOf(x) === k);
      if (b) { track('bm_open'); go('bible', { book: b.book, ch: b.ch, verse: b.from, flash: { from: b.from, to: b.to } }); } // 그 장을 열고 북마크한 절까지 (선택은 안 해요), 잠깐 표시
    }));
  }

  const outside = (e) => { if (st.menu && !e.target.closest('.nl-sort')) { st.menu = false; render(); } };
  document.addEventListener('pointerdown', outside, true);
  const off = C.on((w) => { if ((w === 'bible' || w === 'user') && curScreen === 'bookmarks' && !st.selecting && !st.searching) { render(); loadTexts(); } });
  cleanup = () => { document.removeEventListener('pointerdown', outside, true); off?.(); };
  render();
  loadTexts();
}

// 상단 바 "북마크" 탭: 어느 화면에서 눌러도 북마크 탭으로 (11/26)
document.addEventListener('click', (e) => { if (e.target.closest?.('.home-nav [data-act="bookmarks"]') && curScreen !== 'bookmarks') go('bookmarks'); });


// =========================================================
// 설정 (11/26) · 피그마 "설정 v3 · 컴포넌트 (11-26, Claude)"
// 왼쪽 = 계정 카드 + 메뉴(읽기 기록 · 화면과 입력 · 도움말 · 앱 정보), 오른쪽 = 고른 페이지(가운데 560)
// 2차로 미룬 것: 문의하기, 사진·이름 바꾸기, 사용한 용량, 모든 노트 PDF, (앱) 화면 켜 두기 네이티브
// =========================================================
const APP_VERSION = '1.0 (40)';
const PENCIL_TAP = [
  ['system', 'iPad 설정 따르기'],
  ['undo', '실행 취소'],
  ['switchEraser', '지우개로 바꾸기'],
  ['switchPrevious', '바로 전 도구로 바꾸기'],
  ['none', '아무것도 하지 않기'],
];
const ST_TITLE = {
  account: '계정 · 보관', 'account-info': '계정 정보',
  reading: '읽기 기록', 'reading-books': '권별로 지우기',
  display: '화면과 입력', pencil: 'Apple Pencil',
  help: '도움말 · 앱 정보', terms: '이용약관', privacy: '개인정보 처리방침', bible: '성경 본문 저작권', licenses: '오픈소스 라이선스',
};
const ST_PARENT = { 'account-info': 'account', 'reading-books': 'reading', pencil: 'display', terms: 'help', privacy: 'help', bible: 'help', licenses: 'help' };
const stTop = (p) => (ST_PARENT[p] ? stTop(ST_PARENT[p]) : p);
const ST_CHEV = '<i class="st-chev" aria-hidden="true"></i>';
const AVATAR_EMPTY = '<svg viewBox="0 0 44 44" aria-hidden="true"><circle class="av-bg" cx="22" cy="22" r="22"/><circle class="av-fg" cx="22" cy="16.72" r="7.92"/><ellipse class="av-fg" cx="22" cy="40.48" rx="15.4" ry="13.2"/></svg>';
window.AVATAR_EMPTY_HTML = AVATAR_EMPTY; // 사진을 못 불러올 때 onerror에서 써요
function avatarHTML(cls = '') {
  const u = C.currentUser();
  // 로그인 전 · 사진이 없을 때(Apple 등) · 사진을 못 불러올 때 = 기본 아바타 (피그마 Avatar type=empty, 11/26 민정님)
  const empty = `<span class="st-avatar empty ${cls}" aria-hidden="true">${AVATAR_EMPTY}</span>`;
  if (!u) return empty;
  const url = C.avatarUrl();
  return url ? `<span class="st-avatar photo ${cls}" aria-hidden="true"><img src="${esc(url)}" alt="" referrerpolicy="no-referrer" onerror="this.parentNode.className='st-avatar empty ${cls}';this.parentNode.innerHTML=AVATAR_EMPTY_HTML"></span>` : empty;
}
function syncLine() {
  const s = C.syncStatus();
  return {
    syncing: '보관하는 중…',
    ok: s.pending ? `보관할 노트 ${s.pending}개 대기 중` : `모두 보관했어요${s.lastSync ? ' · ' + relTime(s.lastSync) : ''}`,
    offline: '인터넷 연결이 없어요. 연결되면 보관해요',
    error: '보관하지 못했어요. 이 기기에는 저장돼 있어요',
    quota: '보관 용량이 다 찼어요',
    off: '',
  }[s.status] || '';
}
// 설정 행 하나: 제목 + 설명 + 오른쪽(값 ›, 토글, 버튼)
const stRow = ({ act = '', title, sub = '', value = '', chev = false, toggle = null, btn = '', btnAct = '', primary = false, cls = '' }) => `
  <${act || toggle !== null ? 'button' : 'div'} class="st-row ${cls}"${act ? ` data-act="${act}"` : ''}${toggle !== null ? ` role="switch" aria-checked="${toggle}"` : ''}>
    <span class="st-rt"><span class="st-rtt">${title}</span>${sub ? `<span class="st-rts">${sub}</span>` : ''}</span>
    <span class="st-tr">${btn ? `<span class="st-btn${primary ? ' primary' : ''}" data-act="${btnAct}">${btn}</span>` : ''}${value ? `<span class="st-val">${value}</span>` : ''}${chev ? ST_CHEV : ''}${toggle !== null ? `<span class="st-toggle${toggle ? ' on' : ''}"><i></i></span>` : ''}</span>
  </${act || toggle !== null ? 'button' : 'div'}>`;
const stGroup = (title, rows) => `<section class="st-group">${title ? `<h4>${title}</h4>` : ''}<div class="st-card">${rows.join('<i class="st-div"></i>')}</div></section>`;
// 확인 창 (피그마 확인 창: 제목 · 설명 · [취소][빨간 아닌 검정 버튼])
function stConfirm(title, desc, yes, onYes) {
  modal(`<div class="modal st-confirm" role="alertdialog"><h3>${title}</h3><p class="desc">${desc}</p>
    <div class="modal-actions"><button class="btn st-cancel" data-a="no">취소</button><button class="btn btn-primary" data-a="yes">${yes}</button></div></div>`, (d, close) => {
    d.querySelector('[data-a="no"]').addEventListener('click', close);
    d.querySelector('[data-a="yes"]').addEventListener('click', () => { close(); onYes(); });
  });
}

// 고른 사진을 가운데 정사각형으로 잘라 512px JPEG로 (용량 작게)
async function squareJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((ok, no) => { const i = new Image(); i.onload = () => ok(i); i.onerror = no; i.src = url; });
    const s = Math.min(img.naturalWidth, img.naturalHeight), n = Math.min(512, s);
    const c = document.createElement('canvas'); c.width = c.height = n;
    c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, n, n);
    return await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.85));
  } finally { URL.revokeObjectURL(url); }
}

function openSettings(page) { go('settings', { page: typeof page === 'string' ? page : undefined }); }

function SettingsScreen(arg = {}) {
  const st = { page: arg.page || 'account', pick: new Set() };
  const leftItems = [['reading', '읽기 기록'], ['display', '화면과 입력'], ['help', '도움말 · 앱 정보']];

  function leftHTML() {
    const u = C.currentUser(), top = stTop(st.page);
    return `<div class="st-ltitle">설정</div>
      <button class="st-acct${top === 'account' ? ' on' : ''}" data-go="account">${avatarHTML()}
        <span class="st-acct-t"><b>${u ? esc(C.displayName()) : '로그인하지 않았어요'}</b><span>${u ? esc(syncLine()) : '로그인하면 노트를 보관해요'}</span></span>${ST_CHEV}</button>
      <nav class="st-menu">${leftItems.map(([k, l]) => `<button class="st-mi${top === k ? ' on' : ''}" data-go="${k}">${l}</button>`).join('')}</nav>
      <div class="st-fill"></div>
      <div class="st-ver">lumenib ${APP_VERSION}</div>`;
  }
  function headHTML() {
    const back = ST_PARENT[st.page];
    return `${back ? `<button class="st-back" data-go="${back}"><i class="bt-ico bt-cl" aria-hidden="true"></i>${ST_TITLE[back]}</button>` : ''}<h2>${ST_TITLE[st.page]}</h2>`;
  }

  // ---------- 페이지 ----------
  const pages = {
    account() {
      const u = C.currentUser();
      const login = C.enabled && Object.values(C.loginOptions).some(Boolean);
      const acct = u
        ? stGroup('계정', [stRow({ act: 'go-info', title: esc(C.displayName()), sub: esc([C.providerName() && C.providerName() + ' 계정', u.email].filter(Boolean).join(' · ')), chev: true })])
        : login ? stGroup('계정', [stRow({ title: '로그인하고 노트 보관하기', sub: 'iPad를 바꾸거나 앱을 지워도 노트가 남아요.', btn: '로그인', btnAct: 'login', primary: true })]) : '';
      const keep = u ? stGroup('노트 보관', [stRow({ title: esc(syncLine().split(' · ')[0] || '모두 보관했어요'), sub: C.syncStatus().lastSync ? `마지막 보관 · ${relTime(C.syncStatus().lastSync)}` : '', btn: '지금 보관하기', btnAct: 'sync' })]) : '';
      const privacy = stGroup('개인정보', [stRow({ act: 'track', title: '앱 사용 기록 보내기', sub: '앱을 더 편하게 고치는 데 써요. 손글씨와 노트 내용은 보내지 않아요.', toggle: trackingPref() })]);
      return acct + keep + privacy;
    },
    'account-info'() {
      const u = C.currentUser();
      if (!u) { st.page = 'account'; return pages.account(); }
      const cam = !C.isNativeApp() || !!window.webkit?.messageHandlers?.lumenibCamera; // 앱은 카메라 권한이 들어간 빌드(43~)부터
      return `<section class="st-group"><div class="st-card st-profile">${avatarHTML('lg')}<span class="st-rt"><span class="st-pname">${esc(C.displayName())}</span><span class="st-rts">${esc(C.providerName() || '')} 계정으로 로그인했어요</span></span>
          <div class="st-photo"><button class="st-btn primary" data-act="photo">사진 바꾸기</button>
          ${st.photoMenu ? `<div class="nl-menu st-photo-menu force-light"><button class="nl-mi" data-act="photo-lib">사진 보관함에서 고르기</button>${cam ? '<button class="nl-mi" data-act="photo-cam">사진 찍기</button>' : ''}${C.hasCustomAvatar() ? '<button class="nl-mi" data-act="photo-reset">기본 이미지로 되돌리기</button>' : ''}</div>` : ''}</div></div>
        <input type="file" accept="image/*" data-f="lib" hidden><input type="file" accept="image/*" capture="user" data-f="cam" hidden>
</section>
        ${stGroup('계정', [stRow({ title: '이름', value: esc(C.displayName()) }), stRow({ title: '로그인 방법', value: esc(C.providerName() || '') }), stRow({ title: '이메일', value: esc(u.email || '') })])}
        ${stGroup('', [stRow({ act: 'logout', title: '로그아웃', chev: true })])}
        <button class="st-textbtn" data-act="delacct">탈퇴하기</button>`;
    },
    reading() {
      const total = B.books().reduce((a, b) => a + b.verses.length, 0);
      const read = S.readingArray(B.books()).reduce((a, r) => a + r, 0);
      return `<section class="st-group"><div class="st-card st-rsum"><div><b>${read.toLocaleString()}</b><span> / ${total.toLocaleString()}장 읽음</span></div><i class="st-bar"><i style="width:${(read / total) * 100}%"></i></i></div></section>
        ${stGroup('기록 지우기', [
          stRow({ act: 'go-books', title: '권별로 지우기', sub: '권을 골라 그 권의 읽은 표시만 지울 수 있어요.', chev: true }),
          stRow({ act: 'reset-all', title: '전체 읽기 기록 지우기', sub: '노트와 북마크는 지워지지 않아요.', value: '지우기', chev: true }),
        ])}`;
    },
    'reading-books'() {
      const rows = B.books().map((b) => ({ b, n: b.verses.length, r: S.readCount(b.id, b.verses.length) })).filter((x) => x.r > 0);
      if (!rows.length) return '<p class="st-empty">아직 읽은 장이 없어요</p>';
      const n = [...st.pick].filter((id) => rows.some((x) => x.b.id === id)).length;
      return `<section class="st-group"><div class="st-card">${rows.map(({ b, n: all, r }) => `<button class="st-row st-book" data-book="${b.id}"><span class="st-rtt">${esc(b.name)}</span>
          <span class="st-tr"><i class="st-bar sm"><i style="width:${(r / all) * 100}%"></i></i><span class="st-cnt">${r} / ${all}${unitOf(b.id)}</span>${NOTE_ICON(st.pick.has(b.id) ? 'cb-on' : 'cb-off')}</span></button>`).join('<i class="st-div"></i>')}</div></section>
        <button class="btn btn-l btn-primary st-wide" data-act="reset-books" ${n ? '' : 'disabled'}>${n ? `${n}권 읽기 기록 지우기` : '지울 권을 골라 주세요'}</button>`;
    },
    display() {
      const th = S.settings.theme;
      const card = (k, l) => `<button class="st-theme${th === k ? ' on' : ''}" data-theme="${k}"><span class="st-thumb t-${k}" aria-hidden="true"><i></i><i></i></span><span class="st-radio-l"><i class="st-radio${th === k ? ' on' : ''}"></i>${l}</span></button>`;
      const tap = PENCIL_TAP.find((x) => x[0] === (S.settings.pencilTap || 'system')) || PENCIL_TAP[0];
      return `<section class="st-group"><h4>화면 모드</h4><div class="st-card st-themes">${card('system', '시스템 설정')}${card('light', '라이트')}${card('dark', '다크')}</div><p class="st-note">시스템을 고르면 iPad 설정에 맞춰 바뀌어요.</p></section>
        ${stGroup('예배 중', [stRow({ act: 'awake', title: '노트 쓰는 동안 화면 켜 두기', sub: '설교를 듣는 동안 화면이 꺼지지 않아요.', toggle: S.settings.keepAwake !== false })])}
        ${stGroup('입력', [
          stRow({ act: 'finger', title: '손가락으로 쓰기', sub: '한 손가락으로 쓰고, 두 손가락으로 화면을 움직여요.', toggle: !!S.settings.fingerDraw }),
          stRow({ act: 'go-pencil', title: 'Apple Pencil', value: `두 번 탭 · ${tap[1]}`, chev: true }),
          stRow({ act: 'shape', title: '그리고 멈추면 도형으로', sub: '선을 그린 뒤 펜을 잠깐 멈추면 반듯한 도형이 돼요.', toggle: S.settings.autoShape !== false }),
        ])}`;
    },
    pencil() {
      const cur = S.settings.pencilTap || 'system';
      return `<section class="st-group"><h4>두 번 탭</h4><div class="st-card">${PENCIL_TAP.map(([k, l]) => `<button class="st-row" data-tap="${k}"><span class="st-rtt">${l}</span><span class="st-tr"><i class="st-radio${cur === k ? ' on' : ''}"></i></span></button>`).join('<i class="st-div"></i>')}</div>
        <p class="st-note">Apple Pencil 2세대와 Apple Pencil Pro에서 쓸 수 있어요. "iPad 설정 따르기"는 iPad 설정 → Apple Pencil에서 고른 동작을 따라요.</p></section>`;
    },
    help() {
      return `<section class="st-group"><div class="st-card st-app"><i class="st-logo" aria-hidden="true"></i><span class="st-rt"><span class="st-pname">lumenib 루메닙</span><span class="st-rts">말씀의 빛을 필기로 남기다</span><span class="st-rts">버전 ${APP_VERSION}</span></span></div></section>
        ${stGroup('도움말', [stRow({ act: 'onboarding', title: '처음 안내 다시 보기', chev: true })])}
        ${stGroup('약관 · 정보', [
          stRow({ act: 'go-terms', title: '이용약관', chev: true }),
          stRow({ act: 'go-privacy', title: '개인정보 처리방침', chev: true }),
          stRow({ act: 'go-bible', title: '성경 본문 저작권', value: '개역한글', chev: true }),
          stRow({ act: 'go-licenses', title: '오픈소스 라이선스', chev: true }),
        ])}`;
    },
    terms: () => `<article class="st-legal">${L.TERMS()}</article>`,
    privacy: () => `<article class="st-legal">${L.PRIVACY()}</article>`,
    bible: () => `<article class="st-legal">${L.BIBLE()}</article>`,
    licenses: () => `<article class="st-legal">${L.LICENSES()}</article>`,
  };

  function render() {
    const body = pages[st.page] ? pages[st.page]() : pages.account();
    app.innerHTML = `<div class="home settings">${tabBar('settings')}<div class="st-wrap">
      <aside class="st-left">${leftHTML()}</aside>
      <section class="st-right"><header class="st-head">${headHTML()}</header><div class="st-scroll"><div class="st-body">${body}</div></div></section>
    </div></div>`;
    bind();
  }
  const goPage = (p) => { st.page = p; track('settings_' + p); render(); };

  function bind() {
    app.querySelector('.home-nav [data-act="home"]').addEventListener('click', () => go('home'));
    app.querySelector('.home-nav [data-act="bible"]').addEventListener('click', () => go('bible'));
    app.querySelector('.home-nav [data-act="notes"]').addEventListener('click', () => go('notes'));
    app.querySelector('.home-nav [data-act="settings"]').addEventListener('click', () => goPage('account'));
    app.querySelectorAll('[data-go]').forEach((b) => b.addEventListener('click', () => goPage(b.dataset.go)));
    const on = (act, f) => app.querySelectorAll(`[data-act="${act}"]`).forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); f(e); }));
    on('go-info', () => goPage('account-info'));
    on('go-books', () => { st.pick.clear(); goPage('reading-books'); });
    on('go-pencil', () => goPage('pencil'));
    ['terms', 'privacy', 'bible', 'licenses'].forEach((k) => on('go-' + k, () => goPage(k)));
    on('login', () => openLogin());
    on('sync', async (e) => { const b = e.currentTarget; b.classList.add('busy'); await C.sync(); render(); });
    on('track', () => { setTrackingPref(!trackingPref()); render(); });
    on('logout', () => stConfirm('로그아웃할까요?', '이 기기에서만 노트가 빠지고, 보관한 노트는 그대로 남아요. 다시 로그인하면 돌아와요.', '로그아웃', async () => {
      if (await C.signOut()) { go('home'); toast('로그아웃했어요'); return; }
      stConfirm('아직 보관하지 못한 노트가 있어요', '지금 로그아웃하면 그 노트의 마지막 내용이 사라질 수 있어요. 인터넷 연결을 확인하고 다시 해 주세요.', '그래도 로그아웃', async () => { await C.signOut({ force: true }); go('home'); toast('로그아웃했어요'); });
    }));
    on('delacct', () => {
      const n = C.currentUser() ? S.ownedBy(C.currentUser().id).length : 0;
      stConfirm('탈퇴할까요?', `보관한 노트 ${n}개와 읽기 기록, 북마크가 모두 지워지고 되돌릴 수 없어요. 필요한 노트는 먼저 PDF로 내보내 주세요.`, '탈퇴하기', async () => {
        try { await C.deleteAccount(); go('home'); toast('탈퇴했어요. 그동안 고마웠어요'); }
        catch (err) { console.warn(err); toast('지우지 못했어요. 인터넷 연결을 확인해 주세요', 3000); }
      });
    });
    on('reset-all', () => {
      const n = S.readingArray(B.books()).reduce((a, r) => a + r, 0);
      if (!n) { toast('지울 읽기 기록이 없어요'); return; }
      stConfirm('전체 읽기 기록을 지울까요?', `읽은 장 ${n.toLocaleString()}개의 표시가 모두 지워져요. 노트와 북마크는 그대로 남아요.`, '지우기', () => {
        B.books().forEach((b) => S.resetBookReading(b.id)); track('bible_reset_all'); render(); toast('읽기 기록을 지웠어요');
      });
    });
    app.querySelectorAll('[data-book]').forEach((b) => b.addEventListener('click', () => {
      const id = +b.dataset.book; if (st.pick.has(id)) st.pick.delete(id); else st.pick.add(id); render();
    }));
    on('reset-books', () => {
      const ids = [...st.pick]; if (!ids.length) return;
      const names = ids.map((id) => B.book(id).name);
      const r = ids.reduce((a, id) => a + S.readCount(id, B.book(id).verses.length), 0);
      stConfirm(ids.length === 1 ? `${names[0]} 읽기 기록을 지울까요?` : `${ids.length}권 읽기 기록을 지울까요?`, `읽은 장 ${r}개의 표시가 지워져요. 노트와 북마크는 그대로 남아요.`, '지우기', () => {
        ids.forEach((id) => S.resetBookReading(id)); track('bible_reset_book'); st.pick.clear(); render(); toast('읽기 기록을 지웠어요');
      });
    });
    app.querySelectorAll('[data-theme]').forEach((b) => b.addEventListener('click', () => { S.settings.theme = b.dataset.theme; S.saveSettings(); applyTheme(); track('theme_' + b.dataset.theme); render(); }));
    on('awake', () => { S.settings.keepAwake = S.settings.keepAwake === false; S.saveSettings(); render(); });
    on('finger', () => { S.settings.fingerDraw = !S.settings.fingerDraw; S.saveSettings(); render(); });
    on('shape', () => { S.settings.autoShape = S.settings.autoShape === false; S.saveSettings(); render(); });
    app.querySelectorAll('[data-tap]').forEach((b) => b.addEventListener('click', () => { S.settings.pencilTap = b.dataset.tap; S.saveSettings(); track('pencil_tap_' + b.dataset.tap); render(); }));
    on('onboarding', () => go('onboarding', { again: true }));
    // 사진 바꾸기 (피그마 계정 정보 · 사진 바꾸기, 11/26)
    on('photo', () => { st.photoMenu = !st.photoMenu; render(); });
    const pick = async (inp) => {
      const f = inp.files?.[0]; inp.value = ''; st.photoMenu = false;
      if (!f) { render(); return; }
      try { toast('사진을 올리는 중이에요'); await C.setAvatar(await squareJpeg(f)); track('avatar_set'); toast('사진을 바꿨어요'); }
      catch (e) { console.warn(e); toast('사진을 바꾸지 못했어요. 인터넷 연결을 확인해 주세요', 3000); }
      render();
    };
    app.querySelectorAll('input[data-f]').forEach((inp) => inp.addEventListener('change', () => pick(inp)));
    on('photo-lib', () => app.querySelector('input[data-f="lib"]').click());
    on('photo-cam', () => app.querySelector('input[data-f="cam"]').click());
    on('photo-reset', async () => { st.photoMenu = false; try { await C.clearAvatar(); toast('기본 이미지로 되돌렸어요'); } catch (e) { console.warn(e); toast('되돌리지 못했어요', 2600); } render(); });
    if (st.page === 'help') ['ob2', 'ob3', 'ob4'].forEach(loadObArt); // 처음 안내 다시 보기 전에 미리
  }

  const off = C.on((w) => { if ((w === 'user' || w === 'status' || w === 'bible') && curScreen === 'settings') render(); });
  const outside = (e) => { if (st.photoMenu && !e.target.closest('.st-photo')) { st.photoMenu = false; render(); } };
  document.addEventListener('pointerdown', outside, true);
  cleanup = () => { off?.(); document.removeEventListener('pointerdown', outside, true); };
  render();
}

// =========================================================
// 온보딩 (11/26) · 피그마 "온보딩 (11-26, Claude)" 5장
// 1 환영 → 2 본문 옆에서 필기 → 3 인용 구절 끌어오기 → 4 같은 본문 예전 노트 → 5 노트 보관(로그인)
// =========================================================
const OB_PAGES = [
  null,
  { art: 'ob2', t: '본문을 보면서 바로 필기해요', d: '오늘 본문을 고르면 노트 맨 위에 들어가요.<br>그 위에 밑줄을 긋고, 설교를 들으며 메모하세요.' },
  { art: 'ob3', t: '설교에 나온 다른 구절도 끌어와요', d: '왼쪽 성경에서 구절을 찾아 범위를 고르고,<br>노트로 끌어 놓으면 인용으로 들어가요.' },
  { art: 'ob4', t: '같은 본문의 지난 설교도 꺼내 봐요', d: '같은 본문으로 쓴 예전 노트가 있으면 알려 드려요.<br>예배가 끝난 뒤 탭으로 열어, 다른 설교에서는 어떤 내용이었는지 보세요.' },
];
const obArt = {};
async function loadObArt(name) {
  if (!obArt[name]) obArt[name] = fetch(`icons/onboarding/${name}.svg`).then((r) => r.text()).catch(() => '');
  return obArt[name];
}
function OnboardingScreen(arg = {}) {
  ['ob2', 'ob3', 'ob4'].forEach(loadObArt); // 그림 셋을 처음에 한꺼번에 받아 둬요 (넘길 때 늦게 뜨지 않게, 11/26)
  const loginOk = C.enabled && Object.values(C.loginOptions).some(Boolean) && !C.currentUser();
  const last = loginOk ? 4 : 3; // 로그인했거나 로그인을 못 쓰면 4장까지
  let i = 0;
  const finish = () => { S.settings.onboarded = true; S.saveSettings(); track('onboarding_done_' + i); go(arg.again ? 'settings' : 'home', arg.again ? { page: 'help' } : undefined); };
  function render() {
    const dots = `<div class="ob-dots">${[0, 1, 2, 3, 4].slice(0, last + 1).map((k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>`;
    if (i === 0) {
      app.innerHTML = `<div class="ob ob-welcome"><div class="ob-mid"><i class="ob-logo" aria-hidden="true"></i><h1>말씀의 빛을 필기로 남기다</h1><p>예배 중에 성경 본문을 보면서, 바로 손글씨로 설교 노트를 써요.</p></div>
        <div class="ob-foot"><button class="btn btn-l btn-primary ob-next" data-a="next">시작하기</button></div></div>`;
    } else if (i <= 3) {
      const p = OB_PAGES[i];
      app.innerHTML = `<div class="ob"><button class="ob-skip" data-a="skip">건너뛰기</button>
        <div class="ob-mid"><div class="ob-art" data-art="${p.art}"></div><h1>${p.t}</h1><p>${p.d}</p></div>
        <div class="ob-foot">${dots}<button class="btn btn-l btn-primary ob-next" data-a="next">${i === last ? '시작하기' : '다음'}</button></div></div>`;
      loadObArt(p.art).then((svg) => { const el = app.querySelector(`.ob-art[data-art="${p.art}"]`); if (el) el.innerHTML = svg; });
    } else {
      // 5 노트 보관: 기존 로그인 창과 같은 규칙 (앱 안에선 구글 로그인이 막혀요)
      const L = C.loginOptions, native = C.isNativeApp();
      const google = L.google && (!native || C.hasNativeOAuth());
      app.innerHTML = `<div class="ob ob-login"><div class="ob-mid">
        <h1>내 노트를 안전하게 보관할까요?</h1><p>로그인하면 노트를 계정에 보관해서, iPad를 바꿔도 그대로 남아요.<br>지금 안 해도 나중에 설정에서 할 수 있어요.</p>
        <ul class="ob-points"><li>손글씨, 제목, 설교자, 본문, 날짜를 보관해요.</li><li>나만 열 수 있어요. 운영자는 노트 수와 용량만 봐요.</li><li>로그인 전에 이 기기에서 쓴 노트도 함께 옮겨요.</li></ul>
        <label class="agree"><input type="checkbox" class="cbx" data-a="agree"><span>위 내용을 확인했고 <a data-a="privacy">개인정보 처리방침</a>에 동의해요</span></label>
        <div class="ob-logins">
          ${google ? '<button class="btn btn-l ob-lg google" data-p="google" disabled><span class="lg lg-google" aria-hidden="true"></span>구글로 계속하기</button>' : ''}
          ${L.kakao ? '<button class="btn btn-l ob-lg kakao" data-p="kakao" disabled><span class="lg lg-kakao" aria-hidden="true"></span>카카오로 계속하기</button>' : ''}
          ${L.apple && C.hasNativeApple() ? '<button class="btn btn-l ob-lg apple" data-p="apple" disabled><span class="lg lg-apple" aria-hidden="true"></span>Apple로 계속하기</button>' : ''}
        </div>
        <button class="ob-later" data-a="later">나중에 할게요</button></div></div>`;
    }
    bind();
  }
  function bind() {
    app.querySelector('[data-a="next"]')?.addEventListener('click', () => { if (i >= last) finish(); else { i++; render(); } });
    app.querySelector('[data-a="skip"]')?.addEventListener('click', finish);
    app.querySelector('[data-a="later"]')?.addEventListener('click', finish);
    app.querySelector('[data-a="privacy"]')?.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); modal(`<div class="modal st-legal-modal"><h3>개인정보 처리방침</h3><article class="st-legal">${L.PRIVACY()}</article><div class="modal-actions"><button class="btn btn-primary" data-a="ok">확인</button></div></div>`, (d, close) => d.querySelector('[data-a="ok"]').addEventListener('click', close)); });
    const agree = app.querySelector('[data-a="agree"]');
    agree?.addEventListener('change', () => app.querySelectorAll('[data-p]').forEach((b) => { b.disabled = !agree.checked; }));
    app.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', async () => {
      track('login_' + b.dataset.p + '_onboarding');
      S.settings.onboarded = true; S.saveSettings();
      b.disabled = true;
      try {
        const ok = await C.signInWith(b.dataset.p);
        if (ok === false) b.disabled = false;
        else if (ok === true) finish(); // 앱 안 로그인(구글 시스템 창·Apple)은 화면이 그대로라, 끝나면 바로 넘어가요 (11/26)
      } catch (e) { console.warn(e); b.disabled = false; toast(`로그인하지 못했어요 (${e?.message || e})`, 4000); }
    }));
  }
  // 옆으로 밀어서 넘기기
  let x0 = null;
  const down = (e) => { x0 = e.clientX; };
  const up = (e) => { if (x0 == null || i === 0 || i > 3) return; const dx = e.clientX - x0; x0 = null; if (Math.abs(dx) < 60) return; if (dx < 0 && i < last) { i++; render(); } else if (dx > 0 && i > 1) { i--; render(); } };
  app.addEventListener('pointerdown', down); app.addEventListener('pointerup', up);
  const offUser = C.on((w) => { if (w === 'user' && C.currentUser() && curScreen === 'onboarding') finish(); });
  cleanup = () => { app.removeEventListener('pointerdown', down); app.removeEventListener('pointerup', up); offUser?.(); };
  render();
}

// =========================================================
// T9 성경 탭 (11/25) · 피그마 "성경 탭 (11-25, Claude)" 라이트 시안 · 정책 14
// 왼쪽 376 = 장 고르기 / 권 고르기, 오른쪽 = 장 읽기(가운데 640)
// =========================================================
const unitOf = (book) => (book === 19 ? '편' : '장');
const chLabel = (book, ch) => `${ch}${unitOf(book)}`;
function agoText(t) {
  if (!t) return '';
  const d0 = new Date(); d0.setHours(0, 0, 0, 0);
  const days = Math.round((d0 - new Date(new Date(t).setHours(0, 0, 0, 0))) / 86400000);
  return days <= 0 ? '오늘' : days === 1 ? '어제' : `${days}일 전`;
}
// 받침 있으면 "을", 없으면 "를" (숫자는 읽는 소리로)
function objJosa(text) {
  const ch = text.trim().slice(-1);
  if (/\d/.test(ch)) return '013678'.includes(ch) ? '을' : '를';
  const code = ch.charCodeAt(0) - 0xac00;
  if (code < 0 || code > 11171) return '를';
  return code % 28 ? '을' : '를';
}
const BV_SIZE = [80, 90, 100, 110, 120, 130, 140, 150, 160];
const BV_LH = [1.45, 1.55, 1.7, 1.85, 2.0];
const bibleView = () => ({ font: 'serif', size: 100, ls: 0, lh: 0, ...(S.settings.bibleView || {}) });
const bIco = (name, extra = '') => `<i class="bt-ico bt-${name}" aria-hidden="true"${extra}></i>`;
const bibleViewStyle = () => {
  const v = bibleView(), size = 16 * v.size / 100;
  return `--bv-size:${size}px;--bv-lh:${BV_LH[v.lh + 2]};--bv-ls:${(-2 + v.ls) / 100}em;--bv-font:${v.font === 'sans' ? 'var(--font-ui)' : 'var(--font-serif)'}`;
};
// 성경 보기 설정 바텀시트: 성경 탭 · 노트 쓰기 · 본문 고르기 패널이 같이 써요 (바꾸면 바로 적용, 바깥·핸들로 닫기)
function openViewSheet(onSave) {
  const close = modal(`<div class="bsheet" role="dialog" aria-label="보기 설정"><button class="bs-handle" data-a="close" aria-label="닫기"><i></i></button><div class="bs-body"></div></div>`, (d, cl) => {
    d.classList.add('bs-dim');
    const body = d.querySelector('.bs-body');
    const draw = () => {
      const v = bibleView();
      const stepper = (key, label, val, atMin, atMax) => `<div class="bs-row"><span>${label}</span><div class="stepper"><button data-k="${key}" data-d="-1" ${atMin ? 'disabled' : ''} aria-label="${label} 줄이기"><i class="minus"></i></button><b>${val}</b><button data-k="${key}" data-d="1" ${atMax ? 'disabled' : ''} aria-label="${label} 키우기">${bIco('plus')}</button></div></div>`;
      const lvl = (x) => (x === 0 ? '기본' : (x > 0 ? '+' : '') + x);
      body.innerHTML = `<div class="bs-row"><span>글꼴</span><div class="nl-seg bs-seg"><button class="${v.font === 'serif' ? 'on' : ''} serif" data-font="serif">명조체</button><button class="${v.font === 'sans' ? 'on' : ''}" data-font="sans">고딕체</button></div></div>
        <div class="bs-div"></div>
        ${stepper('size', '글자 크기', v.size + '%', v.size <= BV_SIZE[0], v.size >= BV_SIZE.at(-1))}
        ${stepper('ls', '글자 간격', lvl(v.ls), v.ls <= -2, v.ls >= 2)}
        ${stepper('lh', '줄 간격', lvl(v.lh), v.lh <= -2, v.lh >= 2)}`;
      body.querySelectorAll('[data-font]').forEach((x) => x.addEventListener('click', () => save({ font: x.dataset.font })));
      body.querySelectorAll('[data-k]').forEach((x) => x.addEventListener('click', () => {
        const k = x.dataset.k, dlt = +x.dataset.d, cur = bibleView();
        if (k === 'size') save({ size: Math.min(160, Math.max(80, cur.size + dlt * 10)) });
        else save({ [k]: Math.min(2, Math.max(-2, cur[k] + dlt)) });
      }));
    };
    const save = (patch) => { S.settings.bibleView = { ...bibleView(), ...patch }; S.saveSettings(); track('bible_view'); onSave?.(); draw(); };
    d.querySelector('[data-a="close"]').addEventListener('click', cl);
    sheetDragClose(d.querySelector('.bsheet'), cl);
    draw();
  });
  return close;
}


function BibleScreen(arg = {}) {
  const books = B.books();
  const loc0 = S.settings.bibleLoc || { book: 1, ch: 1, v: 1 }; // 처음엔 창세기 1장, 그 뒤로는 마지막 읽던 곳
  const st = {
    book: loc0.book, ch: loc0.ch, scrollTo: arg.verse || loc0.v || 1,
    left: arg.books || !S.settings.bibleLoc ? 'books' : 'chapters', sort: 'toc', query: '', // 처음 들어오면 왼쪽은 권 목록 (11/26 민정님)
    // 처음 들어왔을 땐 권 목록에 표시(테두리)를 안 해요. 권에 들어갔다 나오면 그 권에 표시 (11/26 민정님)
    bookMarked: !!S.settings.bibleLoc,
    sel: null, notesOpen: false,
    justRead: null, // 이 장에 머무는 동안 "방금 읽음" 상태(②)를 유지해요 { key, bookDone }
  };
  if (arg.book) { st.book = arg.book; st.ch = arg.ch || 1; st.scrollTo = arg.verse || 1; st.left = 'chapters'; st.bookMarked = true; } // 북마크 카드 등에서 바로 그 장으로
  st.flash = arg.flash || null; // 북마크로 왔으면 그 구절을 잠깐 표시했다 사라지게 {from, to}
  let verses = [];

  app.innerHTML = `<div class="home bible-tab">${tabBar('bible')}
    <div class="bt-wrap">
      <section class="bt-left"></section>
      <section class="bt-read"><div class="bt-head"></div><div class="bt-scroll"><div class="bt-col"></div></div></section>
    </div></div>`;
  slideTabPill();
  const leftEl = app.querySelector('.bt-left'), headEl = app.querySelector('.bt-head');
  const scrollEl = app.querySelector('.bt-scroll'), colEl = app.querySelector('.bt-col');
  app.querySelector('.home-nav [data-act="home"]').addEventListener('click', () => go('home'));
  app.querySelector('.home-nav [data-act="notes"]').addEventListener('click', () => go('notes'));
  app.querySelector('[data-act="settings"]').addEventListener('click', openSettings);
  app.querySelectorAll('.home-nav [data-oos]').forEach((b) => b.addEventListener('click', () => { track('out_of_scope'); toast(OUT_OF_SCOPE); }));

  const bookOf = (id) => B.book(id);
  const chCount = (id) => bookOf(id).verses.length;
  const ref = (p, short = false) => B.refText(p, short);
  const fullBooks = () => books.filter((b) => S.readCount(b.id, b.verses.length) === b.verses.length).length;
  // 읽기 칸 가운데 아래 토스트
  const placeToast = () => { const r = app.querySelector('.bt-read').getBoundingClientRect(); document.getElementById('toast').style.left = `${r.left + r.width / 2}px`; };
  const rtoast = (msg) => { placeToast(); toast(msg); };
  const rtoastAct = (msg, label, fn) => { placeToast(); toastAction(msg, label, fn); };
  const saveLoc = (v) => { S.settings.bibleLoc = { book: st.book, ch: st.ch, v: v || 1, t: Date.now() }; S.saveSettings(); };

  // ---------- 왼쪽: 장 고르기 ----------
  function renderChapters() {
    const b = bookOf(st.book), n = b.verses.length, read = S.readCount(st.book, n);
    leftEl.innerHTML = `<div class="bt-lhead"><button class="nl-dd bt-dd" data-act="books">${esc(b.name)}${NOTE_ICON('down')}</button></div>
      <div class="bt-sum"><span>${read === n ? '다 읽은 권이에요' : `${n}${unitOf(st.book)} 중 ${read}${unitOf(st.book)} 읽음`}</span><span class="bt-legend"><i class="sw"></i>읽음</span></div>
      <div class="bt-lscroll"><div class="bt-chips">${b.verses.map((_, i) => {
        const c = i + 1, on = S.isRead(st.book, c);
        return `<button class="bt-chip${on ? ' read' : ''}${c === st.ch ? ' cur' : ''}" data-ch="${c}">${chLabel(st.book, c)}</button>`;
      }).join('')}</div></div>`; // 읽기 기록 지우기는 설정에서만 (11/26)
    leftEl.querySelector('[data-act="books"]').addEventListener('click', () => { st.left = 'books'; st.query = ''; renderLeft(); });
    leftEl.querySelectorAll('[data-ch]').forEach((x) => x.addEventListener('click', () => openChapter(st.book, +x.dataset.ch)));
    const cur = leftEl.querySelector('.bt-chip.cur'), sc = leftEl.querySelector('.bt-lscroll');
    if (cur && sc) sc.scrollTop = Math.max(0, cur.offsetTop - sc.clientHeight / 2);
  }

  // ---------- 왼쪽: 권 고르기 (검색 · 최근 · 목차순/가나다순 · 읽은 장 비율) ----------
  function renderBooks() {
    const recent = S.recentBooks().map((id) => `<button class="bt-rchip" data-book="${id}">${esc(bookOf(id).name)}</button>`).join('');
    leftEl.innerHTML = `<div class="bt-bhead">
        <label class="nl-search bt-search">${NOTE_ICON('search')}<input type="search" enterkeyhint="search" placeholder="창세기111, ㄱㄹ413" value="${esc(st.query)}" autocomplete="off"><button type="button" class="bp-search-clear" aria-label="검색어 지우기" ${st.query ? '' : 'hidden'}>${icon.x}</button></label>
        <div class="bt-recent"><span>최근</span>${recent}</div>
      </div><div class="bt-bbody"></div>`;
    const body = leftEl.querySelector('.bt-bbody');
    const fill = () => {
      const q = st.query.trim();
      if (q) { body.innerHTML = `<div class="bt-lscroll">${BiblePanel.prototype.searchHTML.call(null, q)}</div>`; bindBooks(); return; }
      const grid = (list) => `<div class="bt-bgrid">${list.map((b) => {
        const n = b.verses.length, r = S.readCount(b.id, n);
        return `<button class="bt-book${st.bookMarked && b.id === st.book ? ' cur' : ''}" data-book="${b.id}"><span>${esc(b.name)}</span><i class="gt"><i style="width:${(r / n) * 100}%"></i></i></button>`;
      }).join('')}</div>`;
      let groups;
      if (st.sort === 'toc') groups = [['구약', books.filter((b) => b.testament === 'old')], ['신약', books.filter((b) => b.testament === 'new')]];
      else {
        const m = {};
        [...books].sort((a, b) => a.name.localeCompare(b.name, 'ko')).forEach((b) => (m[firstCho(b.name)] ||= []).push(b));
        groups = Object.entries(m);
      }
      body.innerHTML = `<div class="bt-tabs"><button class="${st.sort === 'toc' ? 'on' : ''}" data-sort="toc">목차순</button><button class="${st.sort === 'abc' ? 'on' : ''}" data-sort="abc">가나다순</button></div>
        <div class="bt-sum b"><span>66권 중 ${fullBooks()}권 다 읽음</span><span class="bt-legend"><i class="bar"></i>읽은 장 비율</span></div>
        <div class="bt-lscroll">${groups.map(([label, list]) => `<div class="bt-glabel">${esc(label)}</div>${grid(list)}`).join('')}<div style="height:16px"></div></div>`;
      bindBooks();
      const cur = body.querySelector('.bt-book.cur'), sc = body.querySelector('.bt-lscroll');
      if (cur && sc) sc.scrollTop = Math.max(0, cur.offsetTop - sc.clientHeight / 2);
    };
    const bindBooks = () => {
      leftEl.querySelectorAll('[data-book]').forEach((x) => x.addEventListener('click', () => { S.pushRecentBook(+x.dataset.book); st.left = 'chapters'; openChapter(+x.dataset.book, 1); }));
      body.querySelectorAll('[data-sort]').forEach((x) => x.addEventListener('click', () => { st.sort = x.dataset.sort; fill(); }));
      body.querySelectorAll('[data-jump]').forEach((x) => x.addEventListener('click', () => {
        const [bk, c, v] = x.dataset.jump.split('|').map((y) => +y || 0);
        S.pushRecentBook(bk); st.left = 'chapters'; st.query = '';
        openChapter(bk, c || 1, v || 1);
      }));
    };
    const input = leftEl.querySelector('input'), clear = leftEl.querySelector('.bp-search-clear');
    input.addEventListener('input', () => { st.query = input.value; clear.hidden = !input.value; fill(); });
    input.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const first = body.querySelector('[data-jump]'); // "고후 4:17" 입력 후 검색 = 그 구절로 바로
      if (first) first.click(); else input.blur();
    });
    clear.addEventListener('pointerdown', (e) => e.preventDefault());
    clear.addEventListener('click', () => { input.value = ''; input.dispatchEvent(new Event('input')); input.focus(); });
    fill();
  }
  const renderLeft = () => (st.left === 'books' ? renderBooks() : renderChapters());

  // 이 장에서 북마크된 절 번호 모두 (범위 북마크는 그 안의 절 전부)
  function bmVerses() {
    const set = new Set();
    S.bookmarks().forEach((x) => { if (x.book === st.book && x.ch === st.ch) for (let v = x.from; v <= x.to; v++) set.add(v); });
    return set;
  }
  // ---------- 오른쪽 머리줄 ----------
  function renderHead() {
    const b = bookOf(st.book);
    if (st.sel) {
      const p = { book: st.book, ch: st.ch, from: st.sel.from, to: st.sel.to };
      // 북마크는 고른 범위 그대로 묶어서 저장 (11/26 민정님 결정). 성경 탭은 추가만, 지우기는 북마크 탭에서.
      // 겹치는 범위(1-3절이 있는데 1절만)는 따로 또 저장돼요. 똑같은 범위만 이미 저장됨으로 막아요
      const saved = !!S.findBookmark(p);
      headEl.innerHTML = `<div class="bt-htitle"><b>${esc(ref(p))}</b><span>선택</span></div>
        <div class="bt-hacts"><button data-a="bm"${saved ? ' disabled aria-disabled="true" title="이미 북마크했어요"' : ''}>북마크</button><button data-a="copy">복사</button><button data-a="write">노트 쓰기</button><button class="x" data-a="x" aria-label="선택 취소">${bIco('close')}</button></div>`;
      headEl.querySelector('[data-a="x"]').addEventListener('click', () => setSel(null));
      headEl.querySelector('[data-a="copy"]').addEventListener('click', async () => {
        // 출처 먼저, 한 줄 띄우고 절마다 "1. 말씀" (11/26 민정님)
        const lines = verses.filter((v) => v.n >= p.from && v.n <= p.to).map((v) => `${v.n}. ${v.t}`).join('\n');
        const ok = await copyText(`${ref(p)}\n\n${lines}`);
        track(ok ? 'bible_copy' : 'bible_copy_fail'); setSel(null);
        const r = ref(p, true); rtoast(ok ? `${r}${objJosa(r)} 복사했어요` : '복사하지 못했어요. 다시 눌러 주세요');
      });
      headEl.querySelector('[data-a="bm"]').addEventListener('click', () => {
        if (saved) return;
        S.addBookmark(p); track('bible_bookmark'); setSel(null);
        rtoastAct('북마크에 저장했어요', '되돌리기', () => { S.removeBookmark(p); track('bible_bookmark_undo'); const sc = scrollEl.scrollTop; renderText().then(() => { scrollEl.scrollTop = sc; }); }); // 지우기는 북마크 탭에서 (탭은 아직)
      });
      headEl.querySelector('[data-a="write"]').addEventListener('click', () => { track('bible_write_note'); go('pick', { passage: p }); });
      return;
    }
    headEl.innerHTML = `<div class="bt-htitle"><b>${esc(b.name)} ${chLabel(st.book, st.ch)}</b></div><div class="bt-hacts"><button class="aa" data-a="aa">Aa</button></div>`;
    headEl.querySelector('[data-a="aa"]').addEventListener('click', openAa);
  }

  // ---------- 본문 ----------
  const viewStyle = bibleViewStyle;
  function chapterNotes() { return S.allNotes().filter((n) => n.passages.some((p) => p.book === st.book && p.ch === st.ch)); }
  async function renderText() {
    const tok = (renderText.t = (renderText.t || 0) + 1);
    verses = await B.getVerses(st.book, st.ch);
    if (tok !== renderText.t) return;
    const notes = chapterNotes();
    const noteV = new Set();
    notes.forEach((n) => n.passages.forEach((p) => { if (p.book === st.book && p.ch === st.ch) for (let v = p.from; v <= p.to; v++) noteV.add(v); }));
    const bmV = bmVerses();
    const s = st.sel;
    colEl.setAttribute('style', viewStyle());
    colEl.innerHTML = `${notes.length ? `<div class="bt-notes${st.notesOpen ? ' open' : ''}">
        <button class="bt-nbar" data-act="notes"><span>이 장에 쓴 노트 <i class="bt-badge">${notes.length}</i></span>${bIco(st.notesOpen ? 'up16' : 'down16')}</button>
        ${st.notesOpen ? `<div class="bt-nlist">${notes.map((n) => `<button class="bt-nrow" data-note="${n.id}"><span class="t"><span class="l1"><b>${esc(n.passages.map((p) => ref(p, true)).join(', '))}</b><i>·</i><em>${fmtShort(n.date)}</em></span><span class="l2"><span>${esc(n.title || '제목 없음')}</span>${n.preacher ? `<i>·</i><em>${esc(n.preacher)}</em>` : ''}</span></span>${bIco('rowchev')}</button>`).join('')}</div>` : ''}
      </div>` : ''}
      <div class="bt-verses">${verses.map((v) => {
        const inSel = s && v.n >= s.from && v.n <= s.to;
        return `<div class="verse bt-v${inSel ? ' sel' : ''}${inSel && v.n === s.from ? ' first' : ''}${inSel && v.n === s.to ? ' last' : ''}" data-n="${v.n}">${bmV.has(v.n) ? bIco('bm', ' title="북마크"') : ''}${noteV.has(v.n) ? '<i class="has-note"></i>' : ''}<span class="vn">${v.n}</span><span class="vt">${esc(v.t)}</span></div>`;
      }).join('')}</div>
      <div class="bt-end"></div>`;
    colEl.querySelector('[data-act="notes"]')?.addEventListener('click', () => { st.notesOpen = !st.notesOpen; renderText(); });
    colEl.querySelectorAll('[data-note]').forEach((x) => x.addEventListener('click', () => { saveLoc(firstVisible()); go('note', { noteId: x.dataset.note, from: 'bible' }); }));
    colEl.querySelectorAll('.bt-v').forEach((x) => x.addEventListener('click', () => tapVerse(+x.dataset.n)));
    renderEnd();
    if (st.scrollTo) {
      // 스크롤 칸 기준 위치로 재요 (offsetTop은 머리줄 높이까지 더해져 구절이 위로 가려졌어요, 11/26)
      const t = colEl.querySelector(`.bt-v[data-n="${st.scrollTo}"]`);
      scrollEl.scrollTop = t && st.scrollTo > 1 ? Math.max(0, scrollEl.scrollTop + t.getBoundingClientRect().top - scrollEl.getBoundingClientRect().top - 24) : 0;
      st.scrollTo = null;
    }
    if (st.flash) {
      const f = st.flash; st.flash = null;
      colEl.querySelectorAll('.bt-v').forEach((x) => { const n = +x.dataset.n; if (n >= f.from && n <= f.to) { x.classList.add('flash'); x.classList.toggle('first', n === f.from); x.classList.toggle('last', n === f.to); } });
      setTimeout(() => colEl.querySelectorAll('.bt-v.flash').forEach((x) => x.classList.remove('flash', 'first', 'last')), 1800);
    }
  }
  function tapVerse(n) {
    const s = st.sel;
    if (!s) setSel({ from: n, to: n });
    else if (s.from === s.to && s.from === n) setSel(null);
    else if (s.from === s.to) setSel({ from: Math.min(s.from, n), to: Math.max(s.from, n) });
    else setSel({ from: n, to: n });
  }
  function setSel(sel) {
    st.sel = sel;
    // 고른 표시만 바꿔요 (목록을 다시 만들지 않아 스크롤이 그대로)
    colEl.querySelectorAll('.bt-v').forEach((v) => {
      const n = +v.dataset.n, inS = !!sel && n >= sel.from && n <= sel.to;
      v.classList.toggle('sel', inS); v.classList.toggle('first', inS && n === sel.from); v.classList.toggle('last', inS && n === sel.to);
    });
    renderHead();
    if (!sel) { const sc = scrollEl.scrollTop; renderText().then(() => { scrollEl.scrollTop = sc; }); } // 북마크 표시 반영
  }

  // ---------- 장 끝 (읽기 전 · 방금 읽음 · 이미 읽은 장 · 권을 다 읽음) ----------
  const prevOf = () => (st.ch > 1 ? { book: st.book, ch: st.ch - 1 } : st.book > 1 ? { book: st.book - 1, ch: chCount(st.book - 1) } : null);
  const nextOf = () => (st.ch < chCount(st.book) ? { book: st.book, ch: st.ch + 1 } : st.book < books.length ? { book: st.book + 1, ch: 1 } : null);
  const navLabel = (t) => (t.book === st.book ? chLabel(t.book, t.ch) : `${bookOf(t.book).name} ${chLabel(t.book, t.ch)}`);
  function renderEnd() {
    const el = colEl.querySelector('.bt-end');
    if (!el) return;
    const key = `${st.book}:${st.ch}`, read = S.isRead(st.book, st.ch);
    const jr = st.justRead?.key === key && read ? st.justRead : null;
    const prev = prevOf(), next = nextOf();
    const nextCls = 'text'; // 읽은 뒤에도 다음 버튼은 그대로 (11/26 민정님 시안 수정)
    let mid;
    if (!read) mid = '<button class="bt-btn primary" data-a="read">다 읽었어요</button>';
    else if (jr?.bookDone) mid = `<div class="bt-done">${bIco('checks')}${esc(bookOf(st.book).name)}${objJosa(bookOf(st.book).name)} 다 읽었어요</div><button class="bt-booklink" data-a="tobooks">66권 중 ${fullBooks()}권 다 읽음 ${bIco('rowchev')}</button>`;
    else if (jr) mid = `<div class="bt-done">${bIco('checks')}다 읽은 장이에요</div>`;
    else mid = `<div class="bt-done">${bIco('checks')}다 읽은 장이에요</div><button class="bt-btn outline-s" data-a="unread">읽음 취소</button>`;
    el.innerHTML = `<div class="bt-div"></div><div class="bt-nav">
      ${prev ? `<button class="bt-btn text" data-go="${prev.book}|${prev.ch}">${bIco('cl')}${esc(navLabel(prev))}</button>` : '<span></span>'}
      <div class="bt-mid">${mid}</div>
      ${next ? `<button class="bt-btn ${nextCls}" data-go="${next.book}|${next.ch}">${esc(navLabel(next))}${bIco('cr')}</button>` : '<span></span>'}
    </div>`;
    el.querySelectorAll('[data-go]').forEach((x) => x.addEventListener('click', () => { const [bk, c] = x.dataset.go.split('|').map(Number); openChapter(bk, c); }));
    el.querySelector('[data-a="read"]')?.addEventListener('click', markRead);
    el.querySelector('[data-a="unread"]')?.addEventListener('click', () => { S.setRead(st.book, st.ch, false); track('bible_unread'); st.justRead = null; renderLeft(); renderEnd(); });
    el.querySelector('[data-a="tobooks"]')?.addEventListener('click', () => { st.left = 'books'; renderLeft(); });
  }
  function markRead() {
    const b = bookOf(st.book), n = b.verses.length;
    const wasLast = S.readCount(st.book, n) === n - 1; // 권의 마지막 안 읽은 장
    S.setRead(st.book, st.ch, true);
    track('bible_read');
    st.justRead = { key: `${st.book}:${st.ch}`, bookDone: wasLast };
    renderLeft(); renderEnd();
    const undo = () => { S.setRead(st.book, st.ch, false); st.justRead = null; renderLeft(); renderEnd(); track('bible_read_undo'); };
    if (wasLast) rtoastAct(`${b.name}${objJosa(b.name)} 다 읽었어요`, '되돌리기', undo);
    else rtoastAct(`${b.name} ${chLabel(st.book, st.ch)}${objJosa(chLabel(st.book, st.ch))} 다 읽었어요`, '되돌리기', undo);
  }

  // ---------- Aa 보기 설정: 공통 바텀시트(openViewSheet) ----------
  function openAa() { return openViewSheet(() => colEl.setAttribute('style', viewStyle())); }

  // ---------- 장 열기 · 읽던 곳 기억 ----------
  function firstVisible() {
    const top = scrollEl.getBoundingClientRect().top;
    const v = [...colEl.querySelectorAll('.bt-v')].find((x) => x.getBoundingClientRect().bottom > top + 8);
    return v ? +v.dataset.n : 1;
  }
  function openChapter(book, ch, verse = 1) {
    if (book !== st.book || ch !== st.ch) { st.justRead = null; st.notesOpen = false; }
    st.book = book; st.ch = ch; st.sel = null; st.scrollTo = verse; st.bookMarked = true;
    saveLoc(verse);
    renderLeft(); renderHead(); renderText();
  }
  let saveT = 0;
  scrollEl.addEventListener('scroll', () => { clearTimeout(saveT); saveT = setTimeout(() => saveLoc(firstVisible()), 400); }, { passive: true });
  cleanup = () => { clearTimeout(saveT); };

  saveLoc(st.scrollTo);
  renderLeft(); renderHead(); renderText();
}

// 홈은 스크롤 없이 한 화면에 맞춰요.
// 요소 크기는 시안(1194×834) 그대로 두고, 화면이 더 길면 간격을 넓히고, 짧으면 간격부터 줄인 뒤 그래도 모자라면 전체를 살짝 줄여요.
const HOME_MIN_W = 1122; // 왼쪽 숫자 320 + 간격 24 + 점 지도 730 + 좌우 여백 48
// S = 맨 위 여백. 시안의 32는 아이패드 상태바라서 그대로 두지 않고, 상태바가 없으면 16, 있으면 상태바 높이만큼 비워요.
const GAP_NAT = { S: 16, B: 4, C: 24, D: 36, E: 36, F: 24 };
const GAP_MIN = { S: 8, B: 0, C: 16, D: 24, E: 24, F: 16 };
const GAP_GROW = { S: 0, B: 0, C: 1, D: 1.5, E: 1.5, F: 1 };
function fitHome() {
  const home = app.querySelector('.home'), inner = home?.querySelector('.home-inner');
  if (!inner) return;
  // 13인치(가로 1300 이상)는 큰 화면 시안(1376×1032)으로: 카드 · 점 지도가 더 커요
  home.classList.toggle('lg', home.clientWidth >= 1300);
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;visibility:hidden;width:env(safe-area-inset-bottom,0px)';
  document.body.appendChild(probe);
  const sb = probe.offsetWidth;
  probe.remove();
  // 위쪽 상태 표시줄 자리는 CSS(.home padding-top = safe-area)가 잡아요. iPad 앱에서 32로 피그마 상태 표시줄(32)과 같아서
  // 내비게이션을 바로 그 아래에 붙여요 (iPad 화면을 찍어서 피그마 위치와 맞춤, 11/21). 상태 표시줄이 없으면(사파리) 16.
  const pt = parseFloat(getComputedStyle(home).paddingTop) || 0;
  // 맨 위 여백(S)은 이제 내비게이션이 가져가요 (줄이지 않는 칸)
  const nat = { ...GAP_NAT, S: 0, F: Math.max(GAP_NAT.F, sb + 12) };
  const min = { ...GAP_MIN, S: 0, F: Math.max(GAP_MIN.F, sb + 8) };
  const nav = home.querySelector(':scope > .home-nav');
  const navH = nav ? nav.offsetHeight + (parseFloat(getComputedStyle(nav).marginTop) || 0) : 0;
  const fixed = [...inner.children].reduce((a, el) => a + el.offsetHeight, 0);
  const W = home.clientWidth;
  // 너비가 시안보다 좁으면(아이패드 미니 등) 먼저 전체를 그 폭에 맞게 줄여요
  const portrait = matchMedia('(orientation: portrait)').matches;
  const zW = portrait ? 1 : Math.min(1, W / HOME_MIN_W);
  const H = (home.clientHeight - pt - navH) / zW;
  const sum = (o) => Object.values(o).reduce((a, b) => a + b, 0);
  let g = {}, z = 1;
  if (H >= fixed + sum(nat)) {
    const extra = H - fixed - sum(nat), w = sum(GAP_GROW);
    for (const k in nat) g[k] = nat[k] + (extra * GAP_GROW[k]) / w;
  } else if (H >= fixed + sum(min)) {
    const t = (H - fixed - sum(min)) / (sum(nat) - sum(min));
    for (const k in nat) g[k] = min[k] + t * (nat[k] - min[k]);
  } else {
    g = min;
    z = Math.max(0.6, H / (fixed + sum(min)));
  }
  z *= zW;
  for (const k in g) inner.style.setProperty('--g' + k, g[k].toFixed(2) + 'px');
  inner.style.width = z === 1 ? '' : W / z + 'px';
  inner.style.transform = z === 1 ? '' : `scale(${z})`;
}

function accountHTML() {
  if (!C.enabled || !Object.values(C.loginOptions).some(Boolean)) return '';
  const u = C.currentUser();
  if (!u) {
    return `<button class="toggle-row" data-act="login"><span>로그인하고 노트 보관하기<small class="toggle-sub">iPad를 바꾸거나 앱을 지워도 내가 쓴 노트가 남아요</small></span>${icon.chevRight}</button>`;
  }
  const st = C.syncStatus();
  const ago = st.lastSync ? relTime(st.lastSync) : '';
  const line = {
    syncing: '서버에 올리는 중…',
    ok: st.pending ? `올릴 노트 ${st.pending}편 대기 중` : `서버에 보관됨${ago ? ' · ' + ago : ''}`,
    offline: '인터넷 연결이 없어요. 이 기기에 저장해 두고 연결되면 올려요',
    error: '서버에 올리지 못했어요. 이 기기에는 저장돼 있어요',
    quota: '보관 용량(500MB)이 다 찼어요. 이 기기에만 저장돼요',
    off: '',
  }[st.status];
  return `<div class="toggle-row acct"><span>${esc(C.displayName())}<small class="toggle-sub">${C.providerName() ? C.providerName() + ' 로그인 · ' : ''}<span data-sync>${line}</span></small></span>
      <button class="btn btn-outline" data-act="sync">지금 맞추기</button></div>
    <button class="toggle-row" data-act="logout">로그아웃<small class="toggle-sub">이 기기에서만 노트가 빠지고, 서버에는 그대로 남아요</small></button>
    <button class="toggle-row" data-act="delacct" style="color:var(--accent-mid)">계정과 보관한 노트 모두 지우기</button>`;
}
function relTime(ms) {
  const m = Math.floor((Date.now() - ms) / 60000);
  if (m < 1) return '방금'; if (m < 60) return `${m}분 전`;
  const h = Math.floor(m / 60); return h < 24 ? `${h}시간 전` : `${Math.floor(h / 24)}일 전`;
}


// ---------- 로그인 · 보관 안내 ----------
// 보관 안내 문구 (로그인 전 창과 로그인 뒤 확인 창이 같이 써요)
function consentHTML(localCount) {
  return `<ul class="consent">
    <li>이 앱에서 쓴 노트(손글씨, 제목, 설교자, 본문, 날짜)와 읽기 기록, 북마크를 서버에 보관해요.</li>
    <li>보관 기간은 ${esc(C.consentInfo.KEEP_UNTIL)}</li>
    <li>노트는 내 계정으로만 열려요. 운영자는 노트 수와 용량만 확인해요.</li>
    <li>설정에서 언제든 모두 지울 수 있어요.</li>
    <li>로그인에는 이메일, 이름, 프로필 사진만 써요.</li>
    ${localCount ? `<li>이 기기에서 이미 쓴 노트 ${localCount}편도 함께 보관돼요.</li>` : ''}
  </ul>`;
}

function askConsentAfterLogin({ localCount }) {
  return new Promise((resolve) => {
    modal(`<div class="modal"><h3>노트 보관 안내</h3><p class="sub">계속 쓰려면 아래 내용에 동의해 주세요</p>${consentHTML(localCount)}
      <div class="modal-col"><button class="btn btn-l btn-primary" data-a="yes">동의하고 보관</button><button class="btn btn-l btn-text" data-a="no">동의 안 함</button></div></div>`, (d, close) => {
      d.addEventListener('click', (e) => { if (e.target === d) resolve(false); });
      d.querySelector('[data-a="no"]').addEventListener('click', () => { close(); resolve(false); });
      d.querySelector('[data-a="yes"]').addEventListener('click', () => { close(); resolve(true); });
    });
  });
}

function openLogin() {
  const L = C.loginOptions;
  const native = C.isNativeApp();
  const google = L.google && (!native || C.hasNativeOAuth()); // 앱 안 웹화면 로그인은 구글이 막아서, 시스템 로그인 창이 있는 빌드(42~)에서만
  const linkMode = C.emailMode !== 'code';
  // 링크 방식은 메일 링크가 Safari로 열려서, 아이패드 앱·홈 화면 앱 안에서는 로그인이 이어지지 않아요
  const email = L.email && !(linkMode && (native || C.isStandalone()));
  modal(`<div class="modal login">
    <h3>내 노트를 보관할까요?</h3>
    <p class="sub">로그인하면 iPad를 바꾸거나 앱을 지워도 노트가 남아요</p>
    ${consentHTML(S.unownedCount())}
    <label class="agree"><input type="checkbox" class="cbx" data-a="agree"><span>위 내용을 확인했고 동의해요</span></label>
    <div class="login-btns">
      ${google ? `<button class="btn btn-l btn-outline" data-p="google" disabled><span class="lg lg-google" aria-hidden="true"></span>구글로 계속하기</button>` : ''}
      ${L.kakao ? `<button class="btn btn-l btn-outline" data-p="kakao" disabled><span class="lg lg-kakao" aria-hidden="true"></span>카카오로 계속하기</button>` : ''}
      ${L.apple && C.hasNativeApple() ? `<button class="btn btn-l ob-lg apple" data-p="apple" disabled><span class="lg lg-apple" aria-hidden="true"></span>Apple로 계속하기</button>` : ''}
      ${email ? `<button class="btn btn-l btn-outline" data-a="email" disabled>${linkMode ? '이메일로 로그인 링크 받기' : '이메일로 코드 받기'}</button>
      <div class="email-box" hidden>
        <div class="field"><label>이메일</label><input type="email" inputmode="email" autocomplete="email" placeholder="name@example.com" data-f="email"></div>
        <div class="field" hidden><label>메일로 받은 숫자</label><input inputmode="numeric" autocomplete="one-time-code" maxlength="8" placeholder="6자리 숫자" data-f="code"></div>
        <p class="login-note" data-f="sent" hidden></p>
        <button class="btn btn-l btn-primary" data-a="send">${linkMode ? '링크 보내기' : '코드 보내기'}</button>
      </div>` : ''}
      <button class="btn btn-l btn-text" data-a="close">나중에</button>
    </div>
    ${L.google && !google ? '<p class="login-note">구글 로그인은 Safari에서 주소를 열었을 때만 돼요.</p>' : ''}
  </div>`, (d, close) => {
    const off = C.on((w) => { if (w === 'user' && C.currentUser()) { off(); close(); go('home'); } });
    const agree = d.querySelector('[data-a="agree"]');
    agree.addEventListener('change', () => d.querySelectorAll('[data-p], [data-a="email"]').forEach((b) => { b.disabled = !agree.checked; }));
    d.querySelector('[data-a="close"]').addEventListener('click', close);
    d.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', async () => {
      track('login_' + b.dataset.p);
      b.disabled = true;
      try { if ((await C.signInWith(b.dataset.p)) === false) b.disabled = false; } // 로그인 화면으로 넘어가요 (Apple 창을 닫으면 false)
      catch (e) { console.warn(e); b.disabled = false; toast(`로그인하지 못했어요 (${e?.message || e})`, 4000); }
    }));
    const box = d.querySelector('.email-box');
    d.querySelector('[data-a="email"]')?.addEventListener('click', (e) => { e.currentTarget.hidden = true; box.hidden = false; box.querySelector('[data-f="email"]').focus(); });
    let sentTo = null;
    d.querySelector('[data-a="send"]')?.addEventListener('click', async (e) => {
      const btn = e.currentTarget;
      const email = box.querySelector('[data-f="email"]').value.trim();
      const codeF = box.querySelector('[data-f="code"]');
      btn.disabled = true;
      try {
        if (!sentTo) {
          if (!/^\S+@\S+\.\S+$/.test(email)) { toast('이메일 주소를 확인해 주세요'); return; }
          await C.sendEmailCode(email);
          sentTo = email;
          if (linkMode) {
            const note = box.querySelector('[data-f="sent"]');
            note.hidden = false;
            note.textContent = `${email}로 메일을 보냈어요. 이 기기의 메일 앱에서 "Sign in" 링크를 누르면 로그인돼요. 메일이 안 보이면 스팸함도 확인해 주세요.`;
            btn.hidden = true;
            return;
          }
          codeF.parentElement.hidden = false; codeF.focus();
          btn.textContent = '로그인';
          toast('메일로 숫자를 보냈어요. 메일함을 확인해 주세요', 3000);
        } else {
          const code = codeF.value.replace(/\D/g, '');
          if (code.length < 6) { toast('메일로 받은 숫자를 넣어 주세요'); return; }
          await C.verifyEmailCode(sentTo, code);
          close();
        }
      } catch (err) {
        console.warn(err);
        const m = String(err?.message || '');
        toast(/rate|limit|seconds/i.test(m) ? '잠시 뒤에 다시 보내 주세요' : sentTo ? '숫자가 맞지 않거나 시간이 지났어요' : '메일을 보내지 못했어요', 3000);
      } finally { btn.disabled = false; }
    });
  });
}

// =========================================================
// T2 · T3 본문 고르기
// =========================================================
function Pick(arg = {}) {
  // 성경 탭 "노트 쓰기": 고른 구절을 본문으로 정해서 열어요 (정책 14)
  // 돌아갈 곳: 성경 탭 "노트 쓰기"면 성경, 노트 탭 펜 버튼이면 노트 목록, 그 밖엔 홈 (11/26)
  const backTo = arg.back || (arg.passage ? 'bible' : 'home');
  const st = { info: { date: todayISO(), title: '', preacher: '' }, infoOpen: true, passages: arg.passage ? [arg.passage] : [], paper: PAPERS.some((p) => p[0] === S.settings.lastPaper) ? S.settings.lastPaper : 'lined' }; // 마지막에 고른 종이로 시작
  app.innerHTML = `<div class="screen">
    <header class="topbar"><div class="left"><button class="pill-back" data-act="home">${bIco('cl')}${({ home: '홈', bible: '성경', notes: '노트' })[backTo]}</button></div>
      <div class="title">오늘 설교 기록하기</div><div class="right"></div></header>
    <div class="workspace">
      <section class="panel bible-panel"></section>
      <section class="panel right-panel dashed"></section>
    </div></div>`;
  const right = app.querySelector('.right-panel');
  const bp = new BiblePanel(app.querySelector('.bible-panel'), {
    mode: 'pick',
    viewStyle: bibleViewStyle,
    onAa: () => openViewSheet(() => bp.applyView()),
    start: arg.passage ? { book: arg.passage.book, ch: arg.passage.ch, verse: arg.passage.from } : null,
    marks: () => ({
      today: [...st.passages],
      noteVerses: (() => {
        const set = new Set();
        S.allNotes().forEach((n) => n.passages.forEach((p) => { if (p.book === bp.book && p.ch === bp.ch) for (let v = p.from; v <= p.to; v++) set.add(v); }));
        return set;
      })(),
      chapterHasNotes: (b, c) => S.allNotes().some((n) => n.passages.some((p) => p.book === b && p.ch === c)),
    }),
    onChange: () => { lastLocation = { book: bp.book, ch: bp.ch }; renderRight(); },
  });
  app.querySelector('[data-act="home"]').addEventListener('click', () => go(backTo)); // 온 곳으로 (성경 탭이면 읽던 성경)

  const current = () => [...st.passages, ...(bp.selection ? [bp.selection] : [])];

  // 예전 노트 탭 (T7): 첫 탭은 고르던 화면 그대로, 노트는 '노트 쓰기'를 눌러야 만들어져요
  const pt = { tabs: [], active: null, paper: null, infoOpen: false };
  function tabsHTML() {
    if (!pt.tabs.length) return '';
    const ps = current();
    const mine = `${fmtShort(st.info.date)}  ${ps.length ? ps.map((p) => B.refText(p, true)).join(', ') : '새 노트'}`;
    return `<div class="tabs"><button class="tab ${pt.active ? '' : 'on'}" data-tab=""><span class="tl">${esc(mine)}</span></button>${pt.tabs.map((id) => {
      const n = S.getNote(id);
      return `<button class="tab ${id === pt.active ? 'on' : ''}" data-tab="${id}"><span class="tl">${esc(`${fmtShort(n.date)}  ${refList(n)}`)}</span><span class="tx" data-close="${id}" aria-label="탭 닫기">×</span></button>`;
    }).join('')}</div>`;
  }
  function bindTabs() {
    right.querySelectorAll('[data-tab]').forEach((b) => b.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) { pt.tabs = pt.tabs.filter((t) => t !== c.dataset.close); if (pt.active === c.dataset.close) pt.active = null; renderRight(); return; }
      pt.active = b.dataset.tab || null; pt.infoOpen = false; renderRight();
    }));
  }
  function openOldTab(id) {
    if (!pt.tabs.includes(id)) pt.tabs.push(id);
    track('task4_open_old_note_tab');
    pt.active = id; pt.infoOpen = false; renderRight();
  }
  async function renderOld() {
    const n = S.getNote(pt.active);
    await fillTexts(n);
    if (pt.paper) { pt.paper.destroy(); pt.paper = null; }
    right.className = 'panel right-panel note';
    right.innerHTML = `${tabsHTML()}<div class="info-slot">${infoHTML(n, pt.infoOpen, true)}<div class="ro-summary">🔒 읽기 모드 · 수정은 노트 목록에서 가능해요</div></div><div class="paper-scroll"></div>`;
    bindTabs();
    bindInfo(right.querySelector('.info-slot'), n, () => {}, (open) => { pt.infoOpen = open; renderOld(); });
    pt.paper = new Paper(right.querySelector('.paper-scroll'), n, { readonly: true, fingerDraw: S.settings.fingerDraw, onChange: () => {}, onHistory: () => {} });
    await pt.paper.render();
  }

  async function renderRight() {
    if (pt.active) return renderOld();
    if (pt.paper) { pt.paper.destroy(); pt.paper = null; }
    right.className = 'panel right-panel dashed';
    const ps = current();
    const others = ps.length ? otherNotesFor(ps) : [];
    const texts = await Promise.all(ps.map(withText));
    right.innerHTML = `${tabsHTML()}${infoHTML(st.info, st.infoOpen)}
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
    bindTabs();
    bindInfo(right, st.info, () => { if (pt.tabs.length) { const t = right.querySelector('.tab.on .tl'); if (t) t.textContent = `${fmtShort(st.info.date)}  ${ps.length ? ps.map((p) => B.refText(p, true)).join(', ') : '새 노트'}`; } }, (open) => { st.infoOpen = open; renderRight(); });
    right.querySelector('[data-act="nopassage"]')?.addEventListener('click', () => start([]));
    right.querySelector('[data-act="addmore"]')?.addEventListener('click', () => { st.passages.push(bp.selection); bp.clearSel(); toast('왼쪽에서 다음 본문을 골라주세요'); });
    right.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      const i = +b.dataset.rm;
      if (i < st.passages.length) { st.passages.splice(i, 1); renderRight(); bp.render({ keepScroll: true }); } else bp.clearSel();
    }));
    right.querySelector('[data-act="start"]')?.addEventListener('click', () => start(current()));
    right.querySelectorAll('[data-old]').forEach((b) => b.addEventListener('click', () => openOldTab(b.dataset.old)));
    right.querySelector('[data-act="paper"]')?.addEventListener('click', (e) => paperMenu(e.currentTarget, st.paper, (v) => { st.paper = v; S.settings.lastPaper = v; S.saveSettings(); renderRight(); }));
  }

  async function start(passages) {
    track(passages.length ? 'task1_start_with_passage' : 'task5_start_without_passage');
    const withTexts = await Promise.all(passages.map(withText));
    const note = S.newNote({ ...st.info, passages: withTexts, paper: st.paper });
    const loc = passages[0] ? { book: passages[0].book, ch: passages[0].ch, verse: passages[0].from } : lastLocation || { book: bp.book, ch: bp.ch };
    go('note', { noteId: note.id, start: loc, from: 'pick', back: backTo === 'home' ? undefined : backTo });
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
async function NoteScreen({ noteId, start, openOld, from, back }) {
  // 예배 중 화면이 꺼지지 않게 (설정 > 화면과 입력, 11/26)
  let wake = null;
  const keepAwake = async () => { if (S.settings.keepAwake === false || document.visibilityState !== 'visible') return; try { wake = await navigator.wakeLock?.request('screen'); } catch {} };
  keepAwake();
  window.webkit?.messageHandlers?.lumenibNative?.postMessage({ action: 'keepAwake', value: S.settings.keepAwake !== false });
  const onVis = () => { if (document.visibilityState === 'visible' && !wake) keepAwake(); };
  document.addEventListener('visibilitychange', onVis);
  const releaseWake = () => { document.removeEventListener('visibilitychange', onVis); wake?.release?.().catch(() => {}); wake = null; window.webkit?.messageHandlers?.lumenibNative?.postMessage({ action: 'keepAwake', value: false }); };
  // 나갈 곳: 노트 목록·성경 탭에서 열었거나, 성경 탭 "노트 쓰기"로 새로 썼으면 그 화면으로 (11/26 민정님)
  const exitTo = back || (from === 'notes' || from === 'bible' ? from : null);
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
      <div class="left"><button class="icon-btn" data-act="back" aria-label="뒤로">${icon.back}</button><button class="icon-btn" data-act="side" aria-label="성경 패널 접기">${icon.sidebar}</button></div>
      <div class="mid"><div class="tb-slot"></div><div class="title">${mainReadonly ? esc(main.title) : from === 'home' || from === 'notes' || from === 'bible' ? '노트' : '오늘 설교 기록하기'}</div></div>
      <div class="right">${mainReadonly ? '' : '<span class="saved-label">자동 저장됨</span>'}<button class="btn btn-primary" data-act="done">${mainReadonly ? '닫기' : '완료'}</button></div>
    </header>
    <div class="workspace">
      <section class="panel bible-panel"></section>
      <section class="panel right-panel note"><div class="tabs-slot"></div><div class="info-slot"></div><div class="paper-scroll"></div></section>
    </div></div>`;
  const right = app.querySelector('.right-panel');
  const scrollEl = right.querySelector('.paper-scroll');
  const leftEl = app.querySelector('.bible-panel');

  const activeNote = () => S.getNote(ns.active);
  const isReadonly = () => ns.active !== main.id || mainReadonly;

  // ----- 왼쪽 성경 -----
  const bp = new BiblePanel(leftEl, {
    mode: 'note',
    viewStyle: bibleViewStyle,
    onAa: () => openViewSheet(() => bp.applyView()),
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
      const label = `${fmtShort(n.date)}  ${refList(n)}`;
      return `<button class="tab ${id === ns.active ? 'on' : ''}" data-tab="${id}"><span class="tl">${esc(label)}</span>${id !== main.id ? `<span class="tx" data-close="${id}" aria-label="탭 닫기">×</span>` : ''}</button>`;
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
    slot.innerHTML = infoHTML(n, ns.infoOpen, isReadonly()) + (isReadonly() ? '<div class="ro-summary">🔒 읽기 모드 · 수정은 노트 목록에서 가능해요</div>' : '');
    bindInfo(slot, n, () => { S.touch(n); flashSaved(); }, (open) => { ns.infoOpen = open; renderInfo(); });
  }

  let toolbarEl = null;
  // 노트 영역이 툴바보다 좁으면(아이패드 미니 등) 툴바를 그 폭에 맞게 살짝 줄여요
  // 툴바는 맨 위 제목줄 가운데 (굿노트처럼). 양옆 버튼과 겹치지 않게 넓이가 모자라면 살짝 줄여요
  function fitToolbar() {
    if (!toolbarEl) return;
    const bar = app.querySelector('.topbar');
    const side = Math.max(bar.querySelector('.left').offsetWidth, bar.querySelector('.right').offsetWidth);
    const room = bar.clientWidth - 32 - side * 2 - 24;
    const z = Math.min(1, room / toolbarEl.offsetWidth);
    app.querySelector('.screen').style.setProperty('--tb-z', z.toFixed(3));
  }
  const tbRO = new ResizeObserver(() => fitToolbar());
  tbRO.observe(right);
  tbRO.observe(app.querySelector('.topbar'));
  function renderToolbar() {
    // 툴바를 누르고 있는 동안에는 툴바를 다시 만들지 않고, 손을 뗀 뒤에 만들어요.
    // 누른 버튼이 손가락·펜 아래에서 사라지면 iPad가 다음 펜슬 획을 스크롤로 착각했어요.
    if (tbPressing) { tbPending = true; sendInkConfig(); return; }
    const slot = app.querySelector('.topbar .tb-slot');
    if (isReadonly()) { slot.innerHTML = ''; return; }
    const t = tool.type;
    // 한 번 더 누르면 설정 창이 열리는 도구는, 골랐을 때 아래에 작은 화살표가 스르륵 나타나요 (굿노트처럼, 11/23)
    // 굿노트처럼: 고른 도구 칸이 옆으로 넓어지며 아이콘 오른쪽에 화살표가 붙어요 (펜·형광펜)
    const HAS_PANEL = { pen: true, hl: true };
    const tb = (k, ic, label) => `<button class="tb-btn ${HAS_PANEL[k] ? 'has-panel' : ''} ${t === k ? 'on' : ''}" data-tool="${k}" aria-label="${label}">${ic}${HAS_PANEL[k] ? '<svg class="tb-more-ind" width="10" height="6" viewBox="0 0 10 6" aria-hidden="true"><path d="M1 1l4 4 4-4" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>' : ''}</button>`;
    let opts = '';
    if (t === 'pen' || t === 'hl') {
      const colors = t === 'pen' ? PEN_COLORS : HL_COLORS, sizes = t === 'pen' ? PEN_SIZES : HL_SIZES;
      const ci = t === 'pen' ? tool.penColor : tool.hlColor, si = t === 'pen' ? tool.penSize : tool.hlSize;
      opts = colors.map((c, i) => `<button class="swatch ${i === ci ? 'on' : ''}" data-color="${i}"><i style="background:${c}"></i></button>`).join('')
        + '<span class="tb-sep"></span>'
        + sizes.map((w, i) => { const [lo, hi] = SIZE_RANGE[t], d = Math.round(3 + ((w - lo) / (hi - lo)) * 11); return `<button class="size-dot ${i === si ? 'on' : ''}" data-size="${i}"><i style="width:${d}px;height:${d}px"></i></button>`; }).join('');
    } else if (t === 'eraser') {
      opts = `<div class="mode2"><button data-em="stroke" class="${tool.eraserMode === 'stroke' ? 'on' : ''}">획 전체</button><button data-em="partial" class="${tool.eraserMode === 'partial' ? 'on' : ''}">부분</button></div><span class="tb-sep"></span>` + ERASER_SIZES.map((w, i) => { const [lo, hi] = SIZE_RANGE.eraser, d = Math.round(5 + ((w - lo) / (hi - lo)) * 11); return `<button class="size-dot ${i === tool.eraserSize ? 'on' : ''}" data-size="${i}"><i style="width:${d}px;height:${d}px;background:none;border:1.5px solid #111"></i></button>`; }).join('');
    } else opts = '<span class="tb-hint">옮기거나 지울 글씨를 둘러 그려요</span>';
    const p = ns.paper;
    slot.innerHTML = `<div class="toolbar">
      ${tb('pen', icon.pen, '펜')}${tb('hl', icon.highlighter, '형광펜')}${tb('eraser', icon.eraser, '지우개')}${tb('lasso', icon.lasso, '올가미')}
      <span class="tb-sep"></span><div class="tb-opts">${opts}</div><span class="tb-sep"></span>
      <button class="tb-btn" data-act="undo" ${p?.undoStack.length ? '' : 'disabled'} aria-label="되돌리기">${icon.undo}</button>
      <button class="tb-btn" data-act="redo" ${p?.redoStack.length ? '' : 'disabled'} aria-label="다시 하기">${icon.redo}</button>
      <span class="tb-sep"></span><button class="tb-btn" data-act="more" aria-label="더 보기">${icon.more}</button></div>`;
    toolbarEl = slot.firstElementChild;
    fitToolbar();
    slot.querySelectorAll('[data-tool]').forEach((b) => b.addEventListener('pointerdown', () => { if (b.dataset.tool === 'pen' && tool.type === 'pen') return openPenStyles(); if (b.dataset.tool === 'hl' && tool.type === 'hl') return openHlSettings(); slot.querySelectorAll('[data-tool]').forEach((x) => x.classList.toggle('on', x === b)); /* 누르는 순간 표시부터 바꿔요 (툴바 전체는 손을 뗀 뒤 다시 그려요) */ setTool(b.dataset.tool); track('task2_tool_' + b.dataset.tool); }));
    slot.querySelectorAll('[data-color]').forEach((b) => b.addEventListener('pointerdown', () => {
      const key = t === 'pen' ? 'penColor' : 'hlColor';
      const i = +b.dataset.color;
      if (tool[key] === i) return openPalette(i); // 고른 색을 한 번 더 누르면 색 바꾸기
      tool[key] = i; renderToolbar();
    }));
    slot.querySelectorAll('[data-em]').forEach((b) => b.addEventListener('pointerdown', () => { tool.eraserMode = b.dataset.em; renderToolbar(); }));
    slot.querySelectorAll('[data-size]').forEach((b) => b.addEventListener('pointerdown', () => {
      const key = t === 'pen' ? 'penSize' : t === 'hl' ? 'hlSize' : 'eraserSize';
      if (tool[key] === +b.dataset.size) return openSizeSlider(t, +b.dataset.size); // 고른 굵기를 한 번 더 누르면 세밀하게 (펜 · 형광펜 · 지우개)
      tool[key] = +b.dataset.size; renderToolbar(); showSizePreview(t);
    }));
    slot.querySelector('[data-act="undo"]').addEventListener('click', () => ns.paper.undo());
    slot.querySelector('[data-act="redo"]').addEventListener('click', () => ns.paper.redo());
    slot.querySelector('[data-act="more"]').addEventListener('click', toggleMore);
  }

  // 굵기를 고르면 종이 위 실제 크기를 잠깐 보여 줘요
  let prevT;
  const sizeArr = (t) => (t === 'pen' ? PEN_SIZES : t === 'hl' ? HL_SIZES : ERASER_SIZES);

  let tbPressing = false, tbPending = false;
  const tbSlot = app.querySelector('.topbar .tb-slot');
  tbSlot.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.tb-menu')) return; // 펼친 창 안(슬라이더 등)은 그대로
    tbPressing = true;
    // 손을 뗀 신호가 가끔 안 와서(누른 버튼이 다시 그려져 사라진 경우 등) 툴바가 계속 '누르는 중'으로 멈춰
    // 다시 그려지지 않았어요(선택이 안 되는 것처럼 보임). 잠시 뒤엔 무조건 풀어요
    clearTimeout(tbTimer); tbTimer = setTimeout(tbRelease, 700);
    if (e.target.closest('[data-tool], [data-color], [data-size], [data-em]')) e.preventDefault();
  }, true);
  let tbTimer = 0;
  const tbRelease = () => {
    clearTimeout(tbTimer);
    if (!tbPressing) return;
    tbPressing = false;
    if (tbPending) { tbPending = false; requestAnimationFrame(renderToolbar); }
  };
  // 툴바 밖을 새로 누르면 툴바 누름은 끝난 거예요
  const tbOutside = (e) => { if (tbPressing && !tbSlot.contains(e.target)) tbRelease(); };
  const PC = { capture: true, passive: true }; // 화면 전체 감시는 수동으로 (스크롤이 JS를 기다리지 않게)
  document.addEventListener('pointerdown', tbOutside, PC);
  window.addEventListener('pointerup', tbRelease, PC);
  window.addEventListener('pointercancel', tbRelease, PC);

  // 툴바에서 연 창(펜 설정 · 색 · 굵기 · 더 보기)은 바깥을 누르면 닫혀요
  const closeMenusOutside = (e) => {
    const m = toolbarEl?.querySelector('.tb-menu');
    if (!m || m.contains(e.target)) return;
    // 같은 창을 여닫는 툴바 버튼은 그 버튼이 알아서 처리해요
    if (toolbarEl.contains(e.target) && e.target.closest('[data-tool], [data-color], [data-size], [data-act="more"]')) return;
    m.remove();
  };
  document.addEventListener('pointerdown', closeMenusOutside, { capture: true, passive: true });

  // 굵기 슬라이더 (굿노트처럼): 고른 칸의 굵기를 바꾸고, 종이 위에 실제 크기를 보여 줘요
  // 형광펜 설정 (형광펜을 한 번 더 누르면): 투명도 · 손떨림 보정 (11/23)
  function openHlSettings() {
    const ex = toolbarEl.querySelector('.tb-menu');
    if (ex) { const same = ex.classList.contains('hl-settings'); ex.remove(); if (same) return; }
    const m = document.createElement('div');
    m.className = 'tb-menu palette hl-settings';
    // 투명도는 색을 고를 때(색 창), 여기는 손떨림 보정만 (11/23 민정님)
    m.innerHTML = `<div class="pal-head"><b>형광펜 설정</b><button class="pal-x" data-act="close" aria-label="닫기">${icon.x}</button></div>
      <h6>손떨림 보정 <span class="pa-val" data-v="stab">${S.settings.hlStab}%</span></h6><div class="pal-alpha pal-stab">
      <input type="range" min="0" max="100" step="5" value="${S.settings.hlStab}" aria-label="형광펜 손떨림 보정" data-k="stab"></div>`; // 양끝 글자는 빼요 (11/23 민정님)
    toolbarEl.appendChild(m);
    // 형광펜 도구 바로 아래에 (펜 설정처럼 도구에 붙어서)
    const hb = toolbarEl.querySelector('[data-tool="hl"]');
    if (hb) { m.style.left = Math.max(8, hb.offsetLeft - 8) + 'px'; m.style.transform = 'none'; m.style.width = '260px'; }
    const sr = m.querySelector('[data-k="stab"]');
    sr.addEventListener('input', () => { S.settings.hlStab = +sr.value; m.querySelector('[data-v="stab"]').textContent = sr.value + '%'; });
    sr.addEventListener('change', () => { S.saveSettings(); track('hl_stab_changed'); sendInkConfig(); });
    m.querySelector('[data-act="close"]').addEventListener('click', () => m.remove());
    nativeRange(sr);
  }

  function openSizeSlider(t, idx) {
    if (nativeInk) {
      const b = toolbarEl.querySelector(`[data-size="${idx}"]`).getBoundingClientRect();
      const [lo, hi] = SIZE_RANGE[t];
      nativeInk.postMessage({ action: 'sizeSlider', tool: t, idx, value: sizeArr(t)[idx], min: lo, max: hi,
        def: SIZE_DEFAULT[t][idx], anchor: [b.left, b.top, b.width, b.height] });
      return;
    }
    const ex = toolbarEl.querySelector('.tb-menu');
    if (ex) { const same = ex.classList.contains('size-menu'); ex.remove(); if (same) return; }
    const arr = sizeArr(t), [lo, hi] = SIZE_RANGE[t];
    const def = SIZE_DEFAULT[t][idx];
    const step = t === 'pen' ? 0.1 : 1;
    const m = document.createElement('div');
    m.className = 'tb-menu size-menu';
    const fmt = (v) => (t === 'pen' ? v.toFixed(1) : String(Math.round(v)));
    m.innerHTML = `<div class="pal-head"><b>${t === 'pen' ? '펜 굵기' : t === 'hl' ? '형광펜 굵기' : '지우개 크기'}</b><button class="pal-x" data-act="close" aria-label="닫기">${icon.x}</button></div>
      <div class="sz-row"><input type="range" min="${lo}" max="${hi}" step="${step}" value="${arr[idx]}" aria-label="굵기"><span class="sz-v">${fmt(arr[idx])}</span></div>
      <button class="ps-reset" data-act="reset">기본값으로</button>`;
    toolbarEl.appendChild(m);
    const r = m.querySelector('input'), v = m.querySelector('.sz-v');
    const set = (val) => { arr[idx] = Math.round(val / step) * step; v.textContent = fmt(arr[idx]); showSizePreview(t); };
    r.addEventListener('input', () => set(+r.value));
    r.addEventListener('change', () => { S.saveSettings(); track('size_custom_' + t); renderToolbarKeepMenu(); });
    m.querySelector('[data-act="reset"]').addEventListener('click', () => { r.value = def; set(def); S.saveSettings(); renderToolbarKeepMenu(); });
    m.querySelector('[data-act="close"]').addEventListener('click', () => m.remove());
    // 툴바 점 크기만 다시 (메뉴는 그대로 둬요)
    function renderToolbarKeepMenu() {
      const dot = toolbarEl.querySelector(`[data-size="${idx}"] i`);
      const d = Math.round((t === 'eraser' ? 5 : 3) + ((arr[idx] - lo) / (hi - lo)) * 11);
      if (dot) { dot.style.width = d + 'px'; dot.style.height = d + 'px'; }
      sendInkConfig();
    }
  }

  function showSizePreview(t) {
    const host = ns.paper?.scrollEl?.parentElement;
    if (!host) return;
    let el = host.querySelector('.size-preview');
    if (!el) { el = document.createElement('div'); el.className = 'size-preview'; el.innerHTML = '<i></i><span></span>'; host.appendChild(el); }
    const k = ns.paper.scale || 1;
    const d = t === 'eraser' ? ERASER_SIZES[tool.eraserSize] * 2 * k : t === 'hl' ? HL_SIZES[tool.hlSize] * k : PEN_SIZES[tool.penSize] * 2.2 * k;
    const i = el.querySelector('i');
    i.className = t;
    i.style.width = t === 'hl' ? '72px' : Math.max(3, d) + 'px';
    i.style.height = Math.max(3, d) + 'px';
    i.style.background = t === 'eraser' ? '' : t === 'hl' ? HL_COLORS[tool.hlColor] : PEN_COLORS[tool.penColor];
    i.style.opacity = t === 'hl' ? S.settings.hlAlpha : '';
    el.querySelector('span').textContent = t === 'eraser' ? '지우개 크기' : t === 'hl' ? '형광펜 굵기' : '펜 굵기';
    el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
    clearTimeout(prevT);
    prevT = setTimeout(() => el.classList.remove('show'), 1100);
  }

  // 펜 색 팔레트: 기본 색(피그마 pen 12색) + 내 색(직접 만든 색, 최대 6개). 고른 색이 툴바의 그 칸에 들어가요.
  function openPalette(slotIdx) {
    toolbarEl.querySelector('.tb-menu')?.remove();
    ns.paper?.scrollEl?.parentElement?.querySelector('.size-preview')?.classList.remove('show');
    const isPen = tool.type === 'pen';
    const arr = isPen ? PEN_COLORS : HL_COLORS;
    const base = isPen ? PEN_PALETTE : HL_PALETTE;
    const myKey = isPen ? 'myPen' : 'myHl';
    if (!S.settings[myKey]) S.settings[myKey] = [];
    const mine = S.settings[myKey];
    const m = document.createElement('div');
    m.className = 'tb-menu palette';
    toolbarEl.appendChild(m);
    const cur = () => arr[slotIdx].toLowerCase();
    const sw = (c, extra = '') => `<button class="pal ${c.toLowerCase() === cur() ? 'on' : ''}" data-c="${c}" aria-label="${c}" ${extra}><i style="background:${c}"></i></button>`;
    const set = (c) => { arr[slotIdx] = c; S.saveSettings(); m.remove(); renderToolbar(); };

    const showList = () => {
      m.innerHTML = `<div class="pal-head"><b>${isPen ? '펜' : '형광펜'} 색</b><button class="pal-x" data-act="close" aria-label="닫기">${icon.x}</button></div>
        <h6>기본 색</h6><div class="pal-grid">${base.map((c) => sw(c)).join('')}</div>
        <h6>내 색</h6><div class="pal-grid">${mine.map((c) => sw(c, 'data-mine')).join('')}${mine.length < 6 ? `<button class="pal pal-add" data-act="add" aria-label="색 만들기"><i>${icon.plus}</i></button>` : ''}</div>
        ${mine.length ? '<p class="pal-tip">내 색을 길게 누르면 지울 수 있어요</p>' : ''}
        ${isPen ? '' : `<h6>투명도</h6><div class="pal-alpha"><span class="pa-sample"><span>형광펜</span><i></i></span>
          <input type="range" min="20" max="80" step="5" value="${Math.round(S.settings.hlAlpha * 100)}" aria-label="형광펜 투명도"></div>
          <div class="pa-ends"><span>투명하게</span><span>진하게</span></div>`}`;
      const ar = m.querySelector('.pal-alpha input');
      if (ar) {
        const paint = () => { const i = m.querySelector('.pa-sample i'); i.style.background = cur(); i.style.opacity = ar.value / 100; };
        ar.addEventListener('input', () => { S.settings.hlAlpha = ar.value / 100; paint(); });
        ar.addEventListener('change', () => { S.saveSettings(); track('hl_alpha_changed'); sendInkConfig(); });
        paint();
        nativeRange(ar);
      }
      m.querySelector('[data-act="close"]').addEventListener('click', () => m.remove());
      m.querySelectorAll('[data-c]').forEach((b) => {
        let lp;
        b.addEventListener('click', () => { if (b.dataset.lp) return; set(b.dataset.c); });
        if (b.hasAttribute('data-mine')) {
          b.addEventListener('pointerdown', () => { lp = setTimeout(() => { b.dataset.lp = 1; mine.splice(mine.indexOf(b.dataset.c), 1); S.saveSettings(); showList(); }, 550); });
          ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, () => clearTimeout(lp)));
        }
      });
      m.querySelector('[data-act="add"]')?.addEventListener('click', showPicker);
    };

    // 직접 만들기: 채도·밝기 판 + 색상 막대
    const showPicker = () => {
      let [h, sat, val] = hexToHsv(arr[slotIdx]);
      m.innerHTML = `<div class="pal-head"><button class="pal-x" data-act="back" aria-label="뒤로">${icon.arrowLeft}</button><b>색 만들기</b><span style="width:32px"></span></div>
        <div class="pk-sv"><div class="pk-knob"></div></div>
        <div class="pk-hue"><div class="pk-knob"></div></div>
        <div class="pk-foot"><span class="pk-prev"></span><span class="pk-hex"></span><button class="btn btn-primary pk-ok" data-act="ok">추가하고 쓰기</button></div>`;
      const svEl = m.querySelector('.pk-sv'), hueEl = m.querySelector('.pk-hue');
      const upd = () => {
        const hex = hsvToHex(h, sat, val);
        svEl.style.background = `linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, hsl(${h} 100% 50%))`;
        svEl.firstChild.style.cssText = `left:${sat * 100}%;top:${(1 - val) * 100}%;background:${hex}`;
        hueEl.firstChild.style.cssText = `left:${h / 360 * 100}%;background:hsl(${h} 100% 50%)`;
        m.querySelector('.pk-prev').style.background = hex;
        m.querySelector('.pk-hex').textContent = hex.toUpperCase();
      };
      const drag = (el, fn) => el.addEventListener('pointerdown', (e) => {
        el.setPointerCapture(e.pointerId);
        const mv = (ev) => { const r = el.getBoundingClientRect(); fn(Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width)), Math.min(1, Math.max(0, (ev.clientY - r.top) / r.height))); upd(); };
        mv(e);
        el.onpointermove = mv;
        el.onpointerup = el.onpointercancel = () => { el.onpointermove = null; };
      });
      drag(svEl, (x, y) => { sat = x; val = 1 - y; });
      drag(hueEl, (x) => { h = Math.round(x * 360); });
      m.querySelector('[data-act="back"]').addEventListener('click', showList);
      m.querySelector('[data-act="ok"]').addEventListener('click', () => {
        const hex = hsvToHex(h, sat, val);
        if (!mine.includes(hex)) { mine.push(hex); if (mine.length > 6) mine.shift(); }
        set(hex);
      });
      upd();
    };
    showList();
  }

  // 펜 설정 (굿노트처럼 고른 펜을 한 번 더 누르면 열려요): 펜 종류 + 팁 선명도 · 필압 민감도 · 평평함 · 손떨림 보정
  const OPT_LABEL = {
    sharp: ['팁 선명도', '획의 시작과 끝이 둥글게 ↔ 뾰족하게'],
    flat: ['평평함', '펜촉이 둥글게 ↔ 납작하게 (긋는 방향에 따라 굵기가 달라져요)'],
    pressure: ['필압 민감도', '누르는 힘에 따라 굵기가 덜 ↔ 많이 바뀜'],
    stab: ['손떨림 보정', '손 떨림을 덜 ↔ 많이 다듬어 줌'],
  };
  function openPenStyles() {
    // iPad 앱에서는 진짜 iPad 창(네이티브 슬라이더)으로 열어요
    if (nativeInk) {
      const b = toolbarEl.querySelector('[data-tool="pen"]').getBoundingClientRect();
      nativeInk.postMessage({ action: 'penSettings', style: S.settings.penStyle, opts: S.settings.penOpts, color: PEN_COLORS[tool.penColor], anchor: [b.left, b.top, b.width, b.height] });
      return;
    }
    const ex = toolbarEl.querySelector('.tb-menu');
    if (ex) { const same = ex.classList.contains('pen-styles'); ex.remove(); if (same) return; }
    const m = document.createElement('div');
    m.className = 'tb-menu pen-styles';
    const color = () => PEN_COLORS[tool.penColor];
    const preview = () => {
      const st = S.settings.penStyle;
      m.querySelector('.ps-preview path').setAttribute('d', penSamplePath(st, 240, 44, S.settings.penOpts[st]));
    };
    const draw = () => {
      const st = S.settings.penStyle, po = S.settings.penOpts[st];
      const info = PEN_STYLES.find((p) => p.id === st);
      m.innerHTML = `<div class="pal-head"><b>펜 설정</b><button class="pal-x" data-act="close" aria-label="닫기">${icon.x}</button></div>
        <div class="ps-preview" style="color:${color()}"><svg width="240" height="44" viewBox="0 0 240 44" aria-hidden="true"><path fill="currentColor"/></svg></div>
        <div class="ps-types">${PEN_STYLES.map((p) => `<button class="ps-type ${st === p.id ? 'on' : ''}" data-ps="${p.id}">
            <svg width="64" height="20" viewBox="0 0 64 20" aria-hidden="true"><path d="${penSamplePath(p.id, 64, 20, S.settings.penOpts[p.id])}" fill="currentColor"/></svg><span>${p.name}</span></button>`).join('')}</div>
        <p class="ps-desc">${info.desc}</p>
        ${PEN_OPT_FOR[st].map((k) => `<div class="ps-opt"><div class="ps-opt-head"><b>${OPT_LABEL[k][0]}</b><span data-v="${k}">${po[k]}%</span></div>
          <input type="range" min="0" max="100" step="5" value="${po[k]}" data-opt="${k}" aria-label="${OPT_LABEL[k][0]}">
          <small>${OPT_LABEL[k][1]}</small></div>`).join('')}
        <button class="ps-reset" data-act="reset">기본값으로</button>`;
      preview();
      m.querySelector('[data-act="close"]').addEventListener('click', () => m.remove());
      m.querySelectorAll('[data-ps]').forEach((b) => b.addEventListener('click', () => {
        S.settings.penStyle = b.dataset.ps; S.saveSettings(); track('pen_style_' + b.dataset.ps); draw();
      }));
      m.querySelectorAll('[data-opt]').forEach((r) => {
        r.addEventListener('input', () => { po[r.dataset.opt] = +r.value; m.querySelector(`[data-v="${r.dataset.opt}"]`).textContent = r.value + '%'; preview(); });
        r.addEventListener('change', () => { S.saveSettings(); track('pen_opt_' + r.dataset.opt); draw(); });
      });
      m.querySelector('[data-act="reset"]').addEventListener('click', () => { Object.assign(po, PEN_OPT_DEFAULT); S.saveSettings(); draw(); });
    };
    draw();
    toolbarEl.appendChild(m);
  }

  function toggleMore() {
    const ex = toolbarEl.querySelector('.tb-menu');
    if (ex) { ex.remove(); return; }
    const m = document.createElement('div');
    m.className = 'tb-menu';
    m.innerHTML = `<h6>종이 종류</h6><div class="row">${PAPERS.map(([k, l]) => `<button class="paper-opt ${k === main.paper ? 'on' : ''}" data-p="${k}"><span class="paper-thumb ${k}"></span>${l.replace(' 종이', '')}</button>`).join('')}</div>
      <button class="menu-item" data-act="pdf">${icon.download || ''}<span>PDF로 내보내기</span></button>
      ${window.webkit?.messageHandlers?.lumenibNative ? `<p class="menu-diag">글씨: ${ns.paper?.nativeCanvas ? '앱이 그림' : '웹이 그림'}${window.__lumenibBuild ? ' · 앱 ' + window.__lumenibBuild : ''}</p>` : ''}
      ${window.webkit?.messageHandlers?.lumenibNative ? '<button class="menu-item" data-act="native-ink"><span>네이티브 필기 비교</span></button>' : ''}`;
    toolbarEl.appendChild(m);
    m.querySelector('[data-act="native-ink"]')?.addEventListener('click', () => { m.remove(); track('native_ink_open'); window.webkit.messageHandlers.lumenibNative.postMessage({ action: 'openInk' }); });
    m.querySelector('[data-act="pdf"]').addEventListener('click', () => { m.remove(); exportPdf(); });
    m.querySelectorAll('[data-p]').forEach((b) => b.addEventListener('click', () => { main.paper = b.dataset.p; S.settings.lastPaper = main.paper; S.saveSettings(); if (ns.paper.note === main) ns.paper.setPaper(main.paper); else ns.paper.render(); S.touch(main); m.remove(); }));
  }

  // ---------- iPad 앱: 필기만 네이티브 엔진으로 ----------
  // 펜·형광펜을 고르면 애플펜슬 획은 네이티브(ios/App/App/LumenInk.swift)가 바로 그리고, 펜을 떼면 점들을 넘겨줘요(addExternalStroke).
  // 툴바·메뉴·지우개·올가미·스크롤은 모두 지금 웹 그대로. 네이티브가 알아야 할 것(도구·색·굵기·펜 설정·배율·종이 영역)을 보내요.
  const nativeInk = window.webkit?.messageHandlers?.lumenibNative;
  window.__nativeInk = !!nativeInk;
  function sendInkConfig() {
    if (!nativeInk) return;
    const p = ns.paper;
    const rect = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); return [r.left, r.top, r.width, r.height]; };
    const blocked = !!document.querySelector('#overlay-root .dim'); // 툴바 창이 열려 있어도 종이에 바로 쓸 수 있어요 (창 영역만 빼고, 쓰기 시작하면 창은 닫혀요)
    const on = !!p && !p.readonly && p.scrollEl?.isConnected && !blocked;
    const pen = tool.type === 'pen';
    // 펜·형광펜은 네이티브가 그리고, 지우개·올가미는 네이티브가 펜슬을 받아 웹에 그대로 넘겨요(lumenibPointer)
    const btns = [...(p?.scrollEl?.querySelectorAll('.cite-ui button, .cite-rs, .lasso-menu, .passage-block button') || [])].map(rect);
    nativeInk.postMessage({
      action: 'inkConfig', enabled: on,
      tool: tool.type,
      color: pen ? PEN_COLORS[tool.penColor] : HL_COLORS[tool.hlColor],
      width: pen ? PEN_SIZES[tool.penSize] : HL_SIZES[tool.hlSize],
      style: S.settings.penStyle, opts: S.settings.penOpts[S.settings.penStyle] || {},
      hlAlpha: S.settings.hlAlpha, hlStab: S.settings.hlStab, scale: p?.scale || 1,
      eraserR: ERASER_SIZES[tool.eraserSize], eraserMode: tool.eraserMode,
      // 종이 위 버튼·메뉴 자리: 앱이 그리는 글씨가 그 위를 덮지 않게 비워요 (보이는 것만, 둥근 정도 포함)
      ui: [...(p?.scrollEl?.querySelectorAll('.cite-ui button, .cite-rs, .lasso-menu, .passage-block button') || [])]
        .filter((el) => (el.checkVisibility ? el.checkVisibility({ visibilityProperty: true, opacityProperty: true }) : true))
        .map((el) => { const r = el.getBoundingClientRect(); return r.width && r.height ? [r.left, r.top, r.width, r.height, Math.min(parseFloat(getComputedStyle(el).borderTopLeftRadius) || 0, r.width / 2, r.height / 2)] : null; }).filter(Boolean),
      sel: (() => { const sl = p?.selection, pg = sl && p.pages[sl.page]; if (!pg?.el) return null; const r = pg.el.getBoundingClientRect(), b = sl.box, k = p.scale; return [r.left + b[0] * k, r.top + b[1] * k, (b[2] - b[0]) * k, (b[3] - b[1]) * k]; })(), // 고른 상자: 이 근처에서 시작하면 옮기기라 앱이 올가미 선을 안 그려요
      pages: [...(p?.scrollEl?.querySelectorAll('.page') || [])].map(rect), // 종이 한 장씩의 자리: 네이티브 임시 선을 종이 안으로 잘라요
      area: rect(p?.scrollEl), exclude: [rect(toolbarEl), rect(toolbarEl?.querySelector('.tb-menu')), rect(p?.lassoMenu), ...btns].filter(Boolean),
    });
  }
  // 스크롤하면 종이·버튼 자리가 바뀌니 네이티브에 다시 알려요 (한 프레임에 한 번)
  if (nativeInk) { let q = 0; scrollEl.addEventListener('scroll', () => { if (q) return; q = requestAnimationFrame(() => { q = 0; sendInkConfig(); }); }, { passive: true }); }
  // 앱이 본 펜슬 탭(종이 밖). 웹킷이 펜슬 탭을 가끔 늦게 주거나 안 줘서 툴바가 느리거나 안 눌렸어요.
  //  - 툴바 도구·색·굵기·지우개 방식: 닿는 순간(down) 앱 신호로 바로 눌러요. 웹킷이 따로 주는 펜슬 누름은 무시해요(두 번 눌림 방지)
  //  - 그 밖의 버튼: 뗄 때(up) 웹이 그 탭을 못 받았으면 대신 눌러요
  const TB_CTRL = '[data-tool], [data-color], [data-size], [data-em]';
  let lastPenDown = 0, lastClick = 0, nativeDownAt = 0, tapStart = 0;
  document.addEventListener('pointerdown', (e) => { if (e.pointerType === 'pen' && e.pointerId !== 78) lastPenDown = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('click', () => { lastClick = performance.now(); }, true);
  // 앱 신호로 이미 누른 툴바 버튼을 웹킷이 늦게 또 누르면 막아요 (펜이 한 번에 두 번 눌려 펜 설정까지 열리던 것)
  if (nativeInk) tbSlot.addEventListener('pointerdown', (e) => {
    if (e.pointerId === 78 || !e.target.closest?.(TB_CTRL)) return;
    if (e.pointerType === 'pen' || performance.now() - nativeDownAt < 800) { e.stopImmediatePropagation(); e.preventDefault(); }
  }, true);
  window.lumenibTap = (x, y, phase = 'up') => {
    const el = document.elementFromPoint(x, y);
    if (!el || !el.closest('.topbar')) return; // 맨 위 제목줄만
    const o = { clientX: x, clientY: y, bubbles: true, cancelable: true, pointerType: 'pen', pointerId: 78, isPrimary: true, button: 0 };
    const ctrl = el.closest(TB_CTRL);
    if (phase === 'down') {
      tapStart = performance.now();
      if (ctrl && tbSlot.contains(ctrl)) { nativeDownAt = performance.now(); ctrl.dispatchEvent(new PointerEvent('pointerdown', { ...o, buttons: 1 })); }
      return;
    }
    if (ctrl && tbSlot.contains(ctrl)) { window.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 })); return; }
    // 그 밖의 제목줄 버튼(되돌리기·더보기·뒤로·완료): 잠깐 기다려 웹이 그 탭을 받았는지 보고, 못 받았을 때만 대신 눌러요
    const t0 = tapStart;
    setTimeout(() => {
      if (lastPenDown >= t0 - 50 || lastClick >= t0 - 50) return;
      el.dispatchEvent(new PointerEvent('pointerdown', { ...o, buttons: 1 }));
      el.dispatchEvent(new PointerEvent('pointerup', { ...o, buttons: 0 }));
      el.dispatchEvent(new MouseEvent('click', { clientX: x, clientY: y, bubbles: true, cancelable: true }));
    }, 250);
  };
  // 펜슬로 종이에 쓰기 시작하면 열려 있던 툴바 창을 닫아요 (굿노트처럼 바로 써지게)
  window.lumenibCloseMenus = () => { toolbarEl?.querySelector('.tb-menu')?.remove(); };
  // 지우개 · 올가미: 네이티브가 받은 펜슬 움직임을 종이에 포인터 이벤트로 그대로 전해요
  let relayTarget = null, relayLast = [0, 0];
  window.lumenibPointer = (type, pts) => {
    const p = ns.paper;
    if (!p) return false;
    // 끝 신호가 점 없이 오거나(취소) 앞 동작이 안 끝난 채 새로 시작하면, 앞 동작을 꼭 끝내 줘요.
    // 안 그러면 올가미·지우개가 '하는 중'으로 남아 화면이 멈추거나 확대가 안 됐어요
    const end = (t) => { if (!relayTarget) return; relayTarget.dispatchEvent(new PointerEvent(t, { clientX: relayLast[0], clientY: relayLast[1], pointerType: 'pen', pointerId: 77, isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: 0 })); relayTarget = null; };
    if (!pts.length) { if (type === 'up' || type === 'cancel') end(type === 'up' ? 'pointerup' : 'pointercancel'); return true; }
    if (type === 'down') end('pointercancel');
    for (const [x, y, pr] of pts) {
      relayLast = [x, y];
      if (type === 'down') {
        const pageEl = document.elementFromPoint(x, y)?.closest('.page');
        relayTarget = p.pages.find((q) => q?.el === pageEl)?.base || null;
      }
      if (!relayTarget) return false;
      relayTarget.dispatchEvent(new PointerEvent(type === 'down' ? 'pointerdown' : type === 'up' ? 'pointerup' : type === 'cancel' ? 'pointercancel' : 'pointermove',
        { clientX: x, clientY: y, pressure: pr, pointerType: 'pen', pointerId: 77, isPrimary: true, bubbles: true, cancelable: true, button: 0, buttons: type === 'up' ? 0 : 1 }));
      if (type === 'up' || type === 'cancel') { relayTarget = null; break; }
    }
    return true;
  };
  // iPad 앱: 웹 창 안의 슬라이더 자리에 진짜 iOS 슬라이더를 겹쳐 놓아요. 값이 바뀌면 웹 슬라이더에 input/change를 보내요
  // 웹 슬라이더 자리에 진짜 iPad 슬라이더를 띄워요. 여러 개를 동시에 (id별로) 둘 수 있어요
  const nativeRanges = new Map();
  let nativeRangeSeq = 0;
  window.lumenibSlider = (sid, v, done) => {
    const input = nativeRanges.get(sid);
    if (!input?.isConnected) return;
    input.value = v;
    input.dispatchEvent(new Event(done ? 'change' : 'input', { bubbles: true }));
  };
  function nativeRange(input) {
    if (!nativeInk) return;
    const id = 'r' + Date.now() + '_' + (++nativeRangeSeq);
    nativeRanges.set(id, input);
    input.style.visibility = 'hidden';
    const send = () => {
      const b = input.getBoundingClientRect();
      nativeInk.postMessage({ action: 'slider', id, min: +input.min, max: +input.max, step: +input.step || 1, value: +input.value, anchor: [b.left, b.top, b.width, b.height] });
    };
    requestAnimationFrame(send);
    const watch = setInterval(() => {
      if (!input.isConnected) { clearInterval(watch); nativeRanges.delete(id); nativeInk.postMessage({ action: 'sliderRemove', id }); }
    }, 150);
  }
  // 네이티브 펜 설정 · 굵기 창에서 바꾼 값을 받아요
  window.lumenibSetPen = (style, opts) => {
    S.settings.penStyle = style;
    // 네이티브는 이 펜 종류의 값만 보내요. 그 종류 칸에 넣어야 다시 열 때 남아 있어요 (전에는 바깥에 섞여 저장돼 사라졌어요)
    S.settings.penOpts[style] = Object.assign({}, S.settings.penOpts[style], opts);
    S.saveSettings(); track('pen_style_' + style);
    renderToolbar(); sendInkConfig();
  };
  window.lumenibSetSize = (t, idx, v, done) => {
    sizeArr(t)[idx] = v;
    if (done) { S.saveSettings(); track('size_custom_' + t); renderToolbar(); } else showSizePreview(t);
    sendInkConfig();
  };
  // 네이티브 펜: 그리고 멈추면 도형으로 (굿노트처럼)
  window.lumenibSnap = (flat, scale) => snapForNative(flat, scale);
  window.lumenibInk = (pts, extra) => {
    const post = () => nativeInk?.postMessage({ action: 'inkDrawn' });
    const hl = tool.type === 'hl';
    // 형광펜: 웹 획이 서서히 나타나기 시작할 때 네이티브도 서서히 지워요 (겹쳐 진해지거나 비어 깜빡이지 않게)
    const ok = !!ns.paper?.addExternalStroke(pts, { ...(hl ? { fadeIn: post } : {}), shape: !!extra?.shape });
    if (ok) track('native_ink_stroke');
    // 펜: 웹이 새 획을 실제로 화면에 그린 다음(두 프레임 뒤)에 네이티브가 임시 선을 지워요. 바로 지우면 한 번 깜빡였어요
    if (ok && !hl) requestAnimationFrame(() => requestAnimationFrame(post));
    return ok;
  };
  if (nativeInk) {
    const mo = new MutationObserver(() => sendInkConfig());
    mo.observe(document.getElementById('overlay-root'), { childList: true });
    mo.observe(right, { childList: true, subtree: true, attributes: false });
    mo.observe(app.querySelector('.topbar'), { childList: true, subtree: true }); // 툴바(제목줄)에서 창이 열리고 닫히는 것
    window.addEventListener('resize', sendInkConfig);
    // 스크롤하면 인용 손잡이 같은 버튼 위치가 바뀌니 다시 알려 줘요
    let sRaf = 0;
    scrollEl.addEventListener('scroll', () => { cancelAnimationFrame(sRaf); sRaf = requestAnimationFrame(sendInkConfig); }, { passive: true });
    ns.offInk = () => { mo.disconnect(); window.removeEventListener('resize', sendInkConfig); nativeInk.postMessage({ action: 'inkConfig', enabled: false }); };
  }

  // ---------- PDF 내보내기 ----------
  // 지금 열린 노트를 쪽마다 그림으로 찍어(본문 · 인용 · 손글씨 그대로) A4 PDF로 만들어요. 기기 밖으로 보내지 않고 기기 안에서 만들어요.
  let pdfBusy = false;
  async function exportPdf() {
    const p = ns.paper;
    if (!p || pdfBusy) return;
    pdfBusy = true;
    // 앱이 글씨를 그리는 중이면 종이 캔버스에는 글씨가 없어요. 내보내는 동안만 웹이 직접 그려요 (11/24: PDF에 손글씨가 빠지던 것)
    const nat = p.nativeCanvas;
    if (nat) { p.nativeCanvas = false; for (const pg of p.pages) if (pg) pg.dirty = true; }
    track('note_pdf_export');
    toast('PDF 만드는 중…', 60000);
    try {
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js');
      await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js');
      p.clearSelection();
      p.flushPages(true); // 아직 안 그린 장까지 다 그린 뒤 내보내요
      const n = p.note;
      const used = (i) => i === 0 || n.pages[i]?.strokes.length || n.citations.some((c) => c.page === i);
      const pages = p.pages.filter((pg) => pg && used(pg.i));
      const doc = new window.jspdf.jsPDF({ unit: 'pt', format: 'a4', compress: true });
      const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
      for (let i = 0; i < pages.length; i++) {
        const el = pages[i].el;
        const shot = await window.html2canvas(el, {
          scale: Math.min(3, 1400 / el.offsetWidth), backgroundColor: '#ffffff', logging: false,
          ignoreElements: (x) => x.classList && (x.classList.contains('page-ui') || x.classList.contains('live') || x.classList.contains('lasso-menu')),
        });
        if (i) doc.addPage();
        doc.addImage(shot.toDataURL('image/jpeg', 0.9), 'JPEG', 0, 0, W, H);
      }
      const name = `${n.date || todayISO()} ${(n.title || (n.passages.length ? refList(n) : '설교 노트')).replace(/[\\/:*?"<>|]/g, ' ')}.pdf`;
      const file = new File([doc.output('blob')], name, { type: 'application/pdf' });
      toast('PDF가 준비됐어요', 1500);
      modal(`<div class="modal"><h3>PDF가 준비됐어요</h3><p class="desc">${esc(name)} · ${pages.length}쪽</p>
        <div class="modal-actions"><button class="btn btn-outline" data-a="no">닫기</button><button class="btn btn-primary" data-a="save">저장 · 공유</button></div></div>`, (d, close) => {
        d.querySelector('[data-a="no"]').addEventListener('click', close);
        d.querySelector('[data-a="save"]').addEventListener('click', async () => {
          // iPad는 공유 시트(파일에 저장 · 메일 · 카카오톡 등), 안 되면 내려받기
          if (navigator.canShare?.({ files: [file] })) {
            try { await navigator.share({ files: [file], title: name }); close(); return; } catch (e) { if (e.name === 'AbortError') return; }
          }
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 60000);
          close();
        });
      });
    } catch (e) {
      console.error(e);
      toast('PDF를 만들지 못했어요. 인터넷 연결을 확인해 주세요');
    } finally {
      pdfBusy = false;
      if (nat) p.restoreNativeCanvas();
    }
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
      // 글씨만 바뀐 경우엔 성경 패널을 다시 그리지 않아요 (가볍게). 노트 구조가 바뀐 경우만
      onChange: (info) => { S.touch(n); flashSaved(); if (n === main && info?.structure) bp.render({ keepScroll: true }); },
      onHistory: () => renderToolbar(),
      onLayout: () => sendInkConfig(),
    });
    if (ns.undo[n.id]) [p.undoStack, p.redoStack] = ns.undo[n.id];
    ns.paper = p;
    window.__lumenibPaper = p; // 회귀 점검(tools/regression.js)에서 씀
    await p.render();
    scrollEl.scrollTop = 0;
    renderToolbar();
  }

  // 도구 바꾸기 (펜슬 더블탭 '이전 도구로'를 위해 바로 전 도구를 기억해요)
  let prevTool = tool.type === 'pen' ? 'eraser' : 'pen';
  function setTool(t) {
    if (t !== tool.type) { prevTool = tool.type; tool.type = t; }
    ns.paper?.clearSelection();
    toolbarEl?.querySelector('.tb-menu')?.remove();
    renderToolbar();
  }

  // 아이패드 앱(Capacitor)에서 애플펜슬 더블탭·스퀴즈가 오면, iPad 설정 > Apple Pencil 에서 고른 동작을 따라가요
  // (ios/App/App/SceneDelegate.swift 가 action 을 넘겨줘요. action 없이 오면 예전 앱이라 되돌리기)
  const TOOL_NAME = { pen: '펜', hl: '형광펜', eraser: '지우개', lasso: '올가미' };
  window.lumenibPencil = (kind, action = 'undo') => {
    const p = ns.paper;
    if (!p || p.readonly || !p.scrollEl?.isConnected) return false;
    const pref = S.settings.pencilTap || 'system'; // 설정 > 화면과 입력 > Apple Pencil (11/26)
    if (pref === 'none') return true;
    if (pref !== 'system') action = pref;
    track('pencil_' + kind + '_' + action);
    if (action === 'switchEraser') {
      setTool(tool.type === 'eraser' ? (prevTool !== 'eraser' ? prevTool : 'pen') : 'eraser');
      toast(TOOL_NAME[tool.type], 900);
    } else if (action === 'switchPrevious') {
      setTool(prevTool);
      toast(TOOL_NAME[tool.type], 900);
    } else if (action === 'showColorPalette') {
      if (tool.type === 'pen' || tool.type === 'hl') openPalette(tool.type === 'pen' ? tool.penColor : tool.hlColor);
    } else if (action === 'showInkAttributes' || action === 'showContextualPalette') {
      if (tool.type === 'pen') openPenStyles();
    } else if (action === 'undo') {
      if (p.undoStack.length) { p.undo(); toast('되돌렸어요'); } else toast('되돌릴 게 없어요');
    }
    return true;
  };

  function openTab(id) {
    if (id === main.id) return switchTab(id);
    if (!ns.tabs.includes(id)) ns.tabs.push(id);
    track('task4_open_old_note_tab');
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
    track('passage_set_in_note');
    bp.sel = null; bp.render({ keepScroll: true });
    if (!silent) toast(`${B.refText(p, true)}을 오늘 본문으로 넣었어요`);
  }
  async function insertCite(sel, at) {
    await ensureMainTab();
    const c = await withText(sel);
    ns.paper.insertCitation({ book: c.book, ch: c.ch, from: c.from, to: c.to, text: c.text }, at);
    track(at ? 'task3_cite_drag' : 'task3_cite_button');
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
    const p = ns.paper;
    p?.beginResizeAnim();
    leftEl.classList.toggle('closed', !ns.leftOpen);
    clearTimeout(ns.sideT);
    ns.sideT = setTimeout(() => p?.endResizeAnim(), 300); // 패널 애니메이션(.25초)이 끝나면 종이를 한 번 다시 그려요
  });
  // 왼쪽 위 뒤로 (피그마 Top Bar 화면=노트 쓰기, 11/21): 오른쪽 위 완료와 같은 방식으로 나가요 (저장 · 본문 확인)
  app.querySelector('[data-act="back"]').addEventListener('click', () => { track('note_back'); app.querySelector('[data-act="done"]').click(); });
  app.querySelector('[data-act="done"]').addEventListener('click', () => {
    if (mainReadonly) return go(exitTo || 'home');
    if (!main.passages.length) return askPassage();
    finish();
  });

  function finish() {
    track('task_done_note_saved');
    main.done = true;
    S.touch(main);
    // 홈으로 먼저 넘어가고 저장은 바로 다음에 (노트가 클수록 나가는 순간이 늦던 것, 11/23). 앱을 닫을 땐 그때 바로 저장돼요
    // 노트 목록에서 열었으면 목록으로 돌아가요 (정책 13: 완료 → 노트 목록)
    if (exitTo) go(exitTo); else go('home', { highlight: main.id }); // 성경 탭에서 열었으면 읽던 곳으로
    setTimeout(() => S.saveNotes(true), 0);
  }

  // 본문 없이 완료하려 할 때: 본문 후보 제안
  async function askPassage() {
    track('task5_ask_passage_on_done');
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

  cleanup = () => { releaseWake(); clearInterval(timer); ns.paper?.destroy(); clearTimeout(savedT); tbRO.disconnect(); ns.offInk?.(); document.removeEventListener('pointerdown', closeMenusOutside, true); window.removeEventListener('pointerup', tbRelease, true); window.removeEventListener('pointercancel', tbRelease, true); document.removeEventListener('pointerdown', tbOutside, true); clearTimeout(tbTimer); };

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
  S.initReading(B.books()); // 읽기 기록 (성경 탭 "다 읽었어요")
  C.ui.toast = toast;
  C.ui.askConsent = askConsentAfterLogin;
  C.on((what) => {
    if ((what === 'notes' || what === 'user' || what === 'bible') && curScreen === 'home' && !overlay.querySelector('.dim')) go('home');
    if (what === 'bible' && curScreen === 'bible' && !overlay.querySelector('.dim') && !app.querySelector('.bt-v.sel')) go('bible'); // 다른 기기에서 읽은 기록이 들어오면
  });
  C.restoreOwnerFast(); // 지난번 로그인한 계정 노트를 홈에 바로 (서버 확인은 뒤에서)
  // 처음 켠 사람(쓴 노트가 없고 안내를 안 본 사람)에게만 온보딩 (11/26)
  if (!S.settings.onboarded && !S.allNotes().length && !C.currentUser()) go('onboarding'); else go('home');
  C.init().catch((e) => console.warn('[cloud] init', e)); // 로그인돼 있으면 서버 노트를 받아 와요 (홈은 먼저 보여 줘요)
  if (window.__trackMsg) setTimeout(() => toast(window.__trackMsg), 600);
  const wait = Math.max(0, 900 - (Date.now() - t0));
  setTimeout(() => document.getElementById('splash').classList.add('hide'), wait);
  if ('serviceWorker' in navigator && location.protocol === 'https:') navigator.serviceWorker.register('sw.js').catch(() => {});
}
main();

function hexToHsv(hex) {
  const n = parseInt(hex.slice(1), 16), r = (n >> 16 & 255) / 255, g = (n >> 8 & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d) h = mx === r ? ((g - b) / d) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [Math.round((h * 60 + 360) % 360), mx ? d / mx : 0, mx];
}
function hsvToHex(h, s, v) {
  const f = (n) => { const k = (n + h / 60) % 6; return v - v * s * Math.max(0, Math.min(k, 4 - k, 1)); };
  return '#' + [f(5), f(3), f(1)].map((x) => Math.round(x * 255).toString(16).padStart(2, '0')).join('');
}
