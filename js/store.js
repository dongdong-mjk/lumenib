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

export const allNotes = () => [...userNotes.filter(visible), ...SEED].sort((a, b) => (b.date + (b.updatedAt || '')).localeCompare(a.date + (a.updatedAt || '')));
export const getNote = (id) => userNotes.find((n) => n.id === id && (owner ? n.owner === owner : !n.owner)) || SEED.find((n) => n.id === id);

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
export function dropOwner(uid) { userNotes = userNotes.filter((n) => n.owner !== uid); saveNotes(true); }

// ---------- 설정 ----------
export const settings = Object.assign({ theme: 'dark', fingerDraw: false, verseSize: 16 }, read(KEY_SET, {}));
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
