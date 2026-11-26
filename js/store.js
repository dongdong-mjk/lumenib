// 노트 · 설정 저장. 기기 브라우저(localStorage)에 먼저 저장하고,
// 로그인하면 cloud.js 가 내 노트(owner = 내 계정)를 서버에 올리고 내려받아요.
import { uid, todayISO } from './util.js';

const KEY_NOTES = 'lumenib.v1.notes';
const KEY_SET = 'lumenib.v1.settings';
const KEY_RECENT = 'lumenib.v1.recentBooks';

const read = (k, d) => { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : d; } catch { return d; } };
const write = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch { return false; } };

// ---------- 미리 넣어 둔 예전 노트 (테스트용 예시 데이터) ----------
// ink = 손글씨 대신 손글씨 글꼴로 보여 주는 줄들. [줄 번호, html]
const h = (cls, t) => `<span class="${cls}">${t}</span>`;
const SEED = [
  {
    id: 'seed-rom835', date: '2025-11-09', title: '흔들리는 삶, 변함없는 사랑', preacher: '홍길동',
    passages: [{ book: 45, ch: 8, from: 35, to: 35 }],
    ink: [
      [0, h('hl-y', ' 말씀 묵상 ')],
      [1, '•  승리의 근거는 내 힘이 아니라'],
      [2, '    나를 사랑하시는 ' + h('hl-y', '주님') + '께 있다.'],
      [3, '•  어려움이 사라져야만 이기는 것이 아니다.'],
      [4, '    그 안에서도 ' + h('hl-y', '믿음을 지키며') + ' 걸어가는 것.'],
      [5, '          <span class="blue">→</span>  ' + h('ul', '이미 받은 사랑을 의지하기')],
      [7, h('hl-y', ' 오늘의 적용 ')],
      [8, '☐  문제보다 ' + h('hl-y', '주님의 사랑') + '을 먼저 바라보기'],
      [9, '☐  두려운 일 앞에서 ' + h('hl-y', '작은 순종') + ' 실천하기'],
      [10, '☐  오늘 붙들어 주신 ' + h('hl-y', '은혜') + ' 한 가지 기록하기'],
      [12, '오늘의 감사  ________________________'],
      [14, h('hl-b', ' 주님, 제 힘으로 버티려 하기보다 ')],
      [15, h('hl-b', ' 주님의 사랑 안에 머물게 하소서. ')],
    ],
  },
  {
    id: 'seed-rom837', date: '2025-06-15', title: '고난 한가운데서도 넉넉히', preacher: '홍길동',
    passages: [{ book: 45, ch: 8, from: 37, to: 37 }],
    ink: [
      [0, h('hl-y', ' 넉넉히 이긴다 ') + '  =  겨우 버티는 것 X'],
      [1, '                              <span class="red">넘치도록</span> 이기는 것 O'],
      [3, '•  고난이 없어서가 아니라'],
      [4, '    ' + h('hl-b', '주님이 함께 하시기 때문에') + ' 이긴다'],
      [5, '•  "모든 일에" → 예외 없음!'],
      [7, h('ul', '내 삶에 적용')],
      [8, '☐  이번 주 힘든 일을 적어 보고 기도하기'],
      [9, '☐  감사 세 가지 매일 쓰기'],
    ],
  },
  {
    id: 'seed-psa118a', date: '2026-11-15', title: '여호와께 감사하라', preacher: '김은혜',
    passages: [{ book: 19, ch: 118, from: 1, to: 4 }],
    ink: [[0, h('hl-y', ' 감사는 기억에서 시작된다 ')], [1, '•  그 인자하심이 영원함 → 오늘도 유효'], [3, '☐  한 주 동안 받은 은혜 적기']],
  },
  {
    id: 'seed-mat918', date: '2026-11-08', title: '네 믿음이 너를 구원하였다', preacher: '홍길동',
    passages: [{ book: 40, ch: 9, from: 18, to: 26 }],
    ink: [[0, h('hl-y', ' 옷자락이라도 ')], [1, '•  작은 믿음도 주님은 보신다'], [2, '•  "딸아 안심하라" → 관계의 회복']],
  },
  {
    id: 'seed-rev21', date: '2026-11-01', title: '처음 사랑을 회복하라', preacher: '이소망',
    passages: [{ book: 66, ch: 2, from: 1, to: 7 }],
    ink: [[0, h('hl-y', ' 처음 사랑 ')], [1, '•  수고와 인내가 있어도 사랑이 식을 수 있다'], [2, '☐  처음 믿을 때를 기억하기']],
  },
  {
    id: 'seed-mat914', date: '2026-10-25', title: '새 포도주는 새 부대에', preacher: '홍길동',
    passages: [{ book: 40, ch: 9, from: 14, to: 18 }],
    ink: [[0, h('hl-y', ' 새 부대 ')], [1, '•  익숙한 방식을 내려놓기']],
  },
  {
    id: 'seed-psa118b', date: '2025-03-02', title: '그 인자하심이 영원함이로다', preacher: '김은혜',
    passages: [{ book: 19, ch: 118, from: 1, to: 1 }],
    ink: [[0, h('hl-y', ' 영원한 인자하심 ')], [1, '•  상황은 변해도 하나님의 성품은 그대로']],
  },
  {
    id: 'seed-psa118c', date: '2024-09-08', title: '감사의 문으로 들어가라', preacher: '이소망',
    passages: [{ book: 19, ch: 118, from: 1, to: 4 }],
    ink: [[0, h('hl-y', ' 감사의 고백 ')], [1, '•  이스라엘 · 아론의 집 · 경외하는 자 → 모두']],
  },
].map((n) => ({ ...n, seed: true, paper: 'lined', pages: [{ strokes: [] }], citations: [] }));

let userNotes = read(KEY_NOTES, []);

// 지금 로그인한 계정 (없으면 null = 이 기기에만 저장하는 노트만 보여요)
let owner = null;
const visible = (n) => !n.deleted && (owner ? n.owner === owner : !n.owner);
export const setOwner = (uid) => { owner = uid || null; };
export const hooks = { changed: () => {} }; // cloud.js 가 채워요

// 예시 노트도 노트 목록에서 지울 수 있어요 (지운 예시는 설정에 번호만 기억, 11/25)
// 예시 노트는 앱에서 뺐어요 (11/25 민정님: 테스트로 만든 노트 없애기). 다시 보이게 하려면 true
const SHOW_EXAMPLES = false;
const seedShown = (n) => SHOW_EXAMPLES && !(settings.hiddenSeeds || []).includes(n.id);
export const allNotes = () => [...userNotes.filter(visible), ...SEED.filter(seedShown)].sort((a, b) => (b.date + (b.updatedAt || '')).localeCompare(a.date + (a.updatedAt || '')));
export const getNote = (id) => userNotes.find((n) => n.id === id && (owner ? n.owner === owner : !n.owner)) || (SHOW_EXAMPLES ? SEED.find((n) => n.id === id) : undefined);

export function newNote({ date, title, preacher, passages, paper }) {
  const n = {
    id: uid(), date: date || todayISO(), title: title || '', preacher: preacher || '',
    passages: passages || [], paper: paper || settings.lastPaper || 'lined', pages: [{ strokes: [] }], citations: [],
    createdAt: Date.now(), updatedAt: String(Date.now()), done: false,
  };
  if (owner) { n.owner = owner; n._dirty = 1; }
  userNotes.unshift(n);
  saveNotes();
  hooks.changed(n);
  return n;
}

let saveTimer;
// 저장은 노트 전체를 글자로 바꿔 쓰는 무거운 일이라, 쓰는 도중에 하면 그동안 툴바 누름 등이 늦게 먹혔어요.
// 손을 대고 있지 않을 때까지 기다렸다가(마지막 터치 뒤 0.8초) 저장해요. 앱을 닫거나 화면을 떠날 땐 바로 저장해요.
let lastTouchAt = 0, savePending = false;
if (typeof document !== 'undefined') {
  // passive: 화면 전체에 붙는 감시라, 수동(passive)이 아니면 웹킷이 모든 터치마다 JS를 기다렸다가 스크롤을 시작해요
  document.addEventListener('pointerdown', () => { lastTouchAt = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('pointerup', () => { lastTouchAt = performance.now(); }, { capture: true, passive: true });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden' && savePending) saveNotes(true); });
  window.addEventListener('pagehide', () => { if (savePending) saveNotes(true); });
}
export const quietMs = () => performance.now() - lastTouchAt; // 마지막 터치 뒤 지난 시간
export function saveNotes(now = false) {
  clearTimeout(saveTimer);
  savePending = true;
  const run = () => { savePending = false; if (!write(KEY_NOTES, userNotes)) console.warn('저장 공간이 부족해요'); };
  const later = () => {
    const quiet = performance.now() - lastTouchAt;
    if (quiet < 800) saveTimer = setTimeout(later, 800 - quiet); else run();
  };
  if (now) run(); else saveTimer = setTimeout(later, 800);
}
export function touch(note) {
  if (note.seed) return;
  note.updatedAt = String(Date.now());
  if (note.owner) note._dirty = 1;
  saveNotes();
  hooks.changed(note);
}
export function deleteNote(id) {
  const n = userNotes.find((x) => x.id === id && (owner ? x.owner === owner : !x.owner));
  if (!n) return;
  if (n.owner) { // 서버에도 지웠다고 알려야 해서 표시만 남겨요
    Object.assign(n, { deleted: true, pages: [{ strokes: [] }], citations: [], updatedAt: String(Date.now()), _dirty: 1 });
    hooks.changed(n);
  } else userNotes = userNotes.filter((x) => x !== n);
  saveNotes(true);
}

// 노트 목록에서 여러 개를 지우고, 되돌리기로 살려요 (11/25). 지우기 전 모습을 돌려줘요
export function trashNotes(ids) {
  const snap = [];
  for (const id of ids) {
    if (SEED.some((x) => x.id === id)) {
      settings.hiddenSeeds = [...new Set([...(settings.hiddenSeeds || []), id])];
      snap.push({ seed: id });
      continue;
    }
    const n = userNotes.find((x) => x.id === id && visible(x));
    if (!n) continue;
    snap.push({ note: JSON.parse(JSON.stringify(n)) });
    deleteNote(id);
  }
  saveSettings();
  return snap;
}
export function restoreNotes(snap) {
  for (const it of snap || []) {
    if (it.seed) { settings.hiddenSeeds = (settings.hiddenSeeds || []).filter((x) => x !== it.seed); continue; }
    const copy = it.note;
    delete copy.deleted;
    copy.updatedAt = String(Date.now());
    if (copy.owner) copy._dirty = 1;
    const i = userNotes.findIndex((x) => x.id === copy.id && x.owner === copy.owner);
    if (i >= 0) userNotes[i] = copy; else userNotes.push(copy);
    hooks.changed(copy);
  }
  saveSettings();
  saveNotes(true);
}

// 로그인 안 한 상태의 노트만 지워요 (로그인한 계정의 노트는 서버에 있어서 그대로)
export function resetAll() {
  userNotes = userNotes.filter((n) => n.owner);
  saveNotes(true);
  localStorage.removeItem(KEY_RECENT);
}

// ---------- 서버 동기화용 (cloud.js) ----------
export const ownedBy = (uid) => userNotes.filter((n) => n.owner === uid);
export const unownedCount = () => userNotes.filter((n) => !n.owner && !n.deleted).length;
// 로그인 전에 이 기기에서 쓴 노트를 내 계정으로 옮겨요 (동의 화면에서 알려 줌)
export function adoptUnowned(uid) {
  let k = 0;
  userNotes.forEach((n) => { if (!n.owner) { n.owner = uid; n._dirty = 1; k++; } });
  if (k) saveNotes(true);
  return k;
}
// 서버에서 받은 노트로 바꾸거나 새로 넣어요
export function putRemote(uid, note) {
  note.owner = uid;
  delete note._dirty;
  const i = userNotes.findIndex((n) => n.id === note.id && n.owner === uid);
  if (i >= 0) userNotes[i] = note; else userNotes.push(note);
}
export function removeLocal(uid, id) { userNotes = userNotes.filter((n) => !(n.id === id && n.owner === uid)); }
// 로그아웃하면 그 계정 노트는 이 기기에서 빼요 (서버에 그대로 있어요)
export function dropOwner(uid) { userNotes = userNotes.filter((n) => n.owner !== uid); saveNotes(true); clearBibleLocal(); }

// ---------- 설정 ----------
export const settings = Object.assign({ theme: 'system', fingerDraw: false, verseSize: 16, pencilTap: 'system', autoShape: true, keepAwake: true }, read(KEY_SET, {}));
// 예전엔 기본이 다크라 모두 'dark'로 저장돼 있었어요. 한 번만 시스템 설정을 따르게 바꿔요 (11/26 민정님)
if (!settings.themeV2) { settings.theme = 'system'; settings.themeV2 = true; write(KEY_SET, settings); }
export const saveSettings = () => write(KEY_SET, settings);

// ---------- 최근 고른 권 ----------
export const recentBooks = () => read(KEY_RECENT, [45, 19, 43]);
export function pushRecentBook(id) {
  const r = [id, ...recentBooks().filter((x) => x !== id)].slice(0, 3);
  write(KEY_RECENT, r);
}

// ---------- 성경 읽기 현황 (예시 데이터: 1,189장 중 355장) ----------
export function readingSeed(chapterCounts) {
  // 정해진 규칙으로 만든 예시 값이라 새로고침해도 같아요.
  // 몇 권은 다 읽고, 나머지는 앞에서부터 조금씩 읽은 모양. 합계 355장.
  const full = new Set([1, 8, 32, 37, 29, 33, 41, 45, 50, 51, 52, 53, 59, 60, 62, 63, 64, 65]);
  let seed = 11;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  const prefix = chapterCounts.map((n, i) => (full.has(i + 1) ? n : rnd() < 0.45 ? Math.floor(rnd() * n * 0.6) : 0));
  let total = prefix.reduce((a, b) => a + b, 0);
  // 합계를 355에 맞추기 (다 읽은 권은 그대로)
  for (let guard = 0; total !== 355 && guard < 20000; guard++) {
    const i = Math.floor(rnd() * chapterCounts.length);
    if (full.has(i + 1)) continue;
    if (total > 355 && prefix[i] > 0) { prefix[i]--; total--; }
    else if (total < 355 && prefix[i] < chapterCounts[i] - 1) { prefix[i]++; total++; }
  }
  const out = [];
  chapterCounts.forEach((n, i) => { for (let c = 0; c < n; c++) out.push(c < prefix[i] ? 1 : 0); });
  return out;
}

// ---------- 성경 읽기 기록 (11/25: 성경 탭 "다 읽었어요"로 직접 표시) ----------
// "권:장" → 1. 예시 노트처럼, 예시 읽기 기록도 SHOW_EXAMPLES일 때만 처음에 깔아요
const KEY_READ = 'lumenib.v1.read';
let readMap = read(KEY_READ, null);
export function initReading(books) {
  if (readMap) return;
  readMap = {};
  if (SHOW_EXAMPLES) {
    const arr = readingSeed(books.map((b) => b.verses.length));
    let i = 0;
    books.forEach((b) => b.verses.forEach((_, c) => { if (arr[i++]) readMap[`${b.id}:${c + 1}`] = 1; }));
  }
  write(KEY_READ, readMap);
}
export const isRead = (book, ch) => !!readMap?.[`${book}:${ch}`];
export function setRead(book, ch, on) {
  if (!readMap) readMap = {};
  const k = `${book}:${ch}`;
  if (on) readMap[k] = 1; else delete readMap[k];
  write(KEY_READ, readMap);
  logBible('r', k, on ? 1 : 0);
}
export function resetBookReading(book) {
  for (const k of Object.keys(readMap || {})) if (k.startsWith(book + ':')) { delete readMap[k]; logBible('r', k, 0); }
  write(KEY_READ, readMap);
}
export const readCount = (book, chapters) => { let n = 0; for (let c = 1; c <= chapters; c++) if (isRead(book, c)) n++; return n; };
export const readingArray = (books) => { const out = []; books.forEach((b) => b.verses.forEach((_, c) => out.push(isRead(b.id, c + 1) ? 1 : 0))); return out; };

// ---------- 북마크 (성경 탭에서 구절 범위 하나 = 북마크 하나) ----------
const KEY_BM = 'lumenib.v1.bookmarks';
export const bookmarks = () => read(KEY_BM, []);
// 북마크 = 고른 범위 하나로 묶음 + 역본(tr). 같은 구절이라도 역본이 다르면 따로 저장해요 (11/26 민정님)
export const DEFAULT_TR = 'krv'; // 개역한글
const trOf = (p) => p.tr || DEFAULT_TR;
const sameBm = (a, b) => a.book === b.book && a.ch === b.ch && a.from === b.from && a.to === b.to && trOf(a) === trOf(b);
export const findBookmark = (p) => bookmarks().find((b) => sameBm(b, p));
export function addBookmark(p) { write(KEY_BM, [{ book: p.book, ch: p.ch, from: p.from, to: p.to, tr: trOf(p), t: Date.now() }, ...bookmarks().filter((b) => !sameBm(b, p))]); logBible('b', bmKey(p), 1); }
export function removeBookmark(p) { write(KEY_BM, bookmarks().filter((b) => !sameBm(b, p))); logBible('b', bmKey(p), 0); }
// 북마크 탭 선택 삭제 · 되돌리기 (저장 날짜 그대로 돌려놔요)
export function removeBookmarks(list) { const snap = list.map((b) => ({ ...b })); snap.forEach((b) => removeBookmark(b)); return snap; }
export function restoreBookmarks(snap) {
  const rest = bookmarks().filter((b) => !snap.some((x) => sameBm(x, b)));
  write(KEY_BM, [...snap, ...rest].sort((a, b) => (b.t || 0) - (a.t || 0)));
  snap.forEach((b) => logBible('b', bmKey(b), 1));
}
// 개역한글은 예전 키 그대로(이미 저장된 기록과 맞게), 다른 역본은 @역본을 붙여요
const bmKey = (p) => `${p.book}:${p.ch}:${p.from}-${p.to}${trOf(p) === DEFAULT_TR ? '' : '@' + trOf(p)}`;

// ---------- 읽기 기록 · 북마크를 로그인 계정에 같이 보관 (11/25 민정님) ----------
// 바꾼 것마다 [켬/끔, 바꾼 시각]을 남겨 두고, 서버 것과 합칠 때 더 나중에 바꾼 쪽을 따라요 (아이패드 두 대에서 따로 읽어도 다 모여요)
const KEY_BLOG = 'lumenib.v1.bibleLog';
let bibleLog = read(KEY_BLOG, null);
if (!bibleLog) { // 처음: 지금 기기에 있는 기록을 남겨 둬요 (로그인하면 계정으로 올라가요)
  bibleLog = { r: {}, b: {} };
  for (const k of Object.keys(read(KEY_READ, {}) || {})) bibleLog.r[k] = [1, 1];
  for (const b of read(KEY_BM, [])) bibleLog.b[bmKey(b)] = [1, b.t || 1];
  write(KEY_BLOG, bibleLog);
}
export const bibleHooks = { changed: () => {} }; // cloud.js 가 채워요
function logBible(kind, key, on) {
  bibleLog[kind][key] = [on, Date.now()];
  write(KEY_BLOG, bibleLog);
  bibleHooks.changed();
}
export const bibleLogSnapshot = () => JSON.parse(JSON.stringify(bibleLog));
// 서버 기록과 합쳐요. 돌려주는 값: { changedLocal, needUpload }
export function mergeBibleLog(remote) {
  let changedLocal = false, needUpload = false;
  for (const kind of ['r', 'b']) {
    const L = bibleLog[kind], R = remote?.[kind] || {};
    for (const [k, rv] of Object.entries(R)) {
      const lv = L[k];
      if (!lv || rv[1] > lv[1]) { L[k] = rv; changedLocal = true; }
    }
    for (const [k, lv] of Object.entries(L)) { const rv = R[k]; if (!rv || lv[1] > rv[1]) needUpload = true; }
  }
  if (changedLocal) {
    write(KEY_BLOG, bibleLog);
    readMap = {};
    for (const [k, v] of Object.entries(bibleLog.r)) if (v[0]) readMap[k] = 1;
    write(KEY_READ, readMap);
    const old = new Map(bookmarks().map((b) => [bmKey(b), b]));
    const list = [];
    for (const [k, v] of Object.entries(bibleLog.b)) {
      if (!v[0]) continue;
      const [base, tr = DEFAULT_TR] = k.split('@');
      const [book, ch, range] = base.split(':'); const [from, to] = range.split('-').map(Number);
      list.push(old.get(k) || { book: +book, ch: +ch, from, to, tr, t: v[1] });
    }
    write(KEY_BM, list.sort((a, b) => (b.t || 0) - (a.t || 0)));
  }
  return { changedLocal, needUpload };
}
// 로그아웃하면 그 계정 읽기 기록·북마크도 이 기기에서 빼요 (노트처럼, 서버에는 그대로)
export function clearBibleLocal() {
  readMap = {}; bibleLog = { r: {}, b: {} };
  write(KEY_READ, readMap); write(KEY_BLOG, bibleLog); write(KEY_BM, []);
}
