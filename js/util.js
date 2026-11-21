// 작은 도우미들: 아이콘, 날짜, DOM

const s = (d, extra = '') =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

// 형광펜: 펜과 헷갈리지 않게 굵은 몸통 + 납작한 펜촉 + 지금 색 띠 (11/21, 피그마 반영 전 제안)
export const hlIcon = (color) =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round" stroke-linecap="round"><path d="M14.5 3 20 8.5 12.5 16 7 10.5z"/><path d="m7 10.5-2.5 4.5 1.5 1.5 4.5-2.5"/><rect x="3" y="19" width="18" height="3.2" rx="1.6" fill="${color}" stroke="none" opacity=".75"/></svg>`;

export const icon = {
  home: s('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z" fill="currentColor" stroke="none"/>'),
  homeLine: s('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-6h-5v6H5a1 1 0 0 1-1-1z"/>'),
  book: s('<path d="M12 6.5C10.5 5.3 8.3 4.8 4 5v13c4.3-.2 6.5.3 8 1.5 1.5-1.2 3.7-1.7 8-1.5V5c-4.3-.2-6.5.3-8 1.5zM12 6.5v13"/>'),
  note: s('<rect x="5" y="3.5" width="14" height="17" rx="2"/><path d="M9 8.5h6M9 12h6M9 15.5h4"/>'),
  bookmark: s('<path d="M7 4h10v16l-5-3.5L7 20z"/>'),
  settings: s('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>'),
  sidebar: s('<rect x="3.5" y="5" width="17" height="14" rx="3"/><path d="M9.5 5v14"/>'),
  chevDown: s('<path d="m6 9 6 6 6-6"/>', 'class="chev"'),
  chevUp: s('<path d="m6 15 6-6 6 6"/>', 'class="chev"'),
  chevRight: s('<path d="m9 6 6 6-6 6"/>', 'class="chev"'),
  // 피그마 Top Bar 뒤로 아이콘 (icon thick=false) 그대로
  back: '<svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M14.932 3.30092C15.2855 3.01287 15.8077 3.03303 16.1371 3.36244C16.4665 3.69185 16.4867 4.21404 16.1986 4.56752L16.1371 4.63588L8.77383 11.9992L16.1371 19.3625L16.1986 19.4308C16.487 19.7842 16.4662 20.3063 16.1371 20.6359C15.8076 20.9654 15.2855 20.9858 14.932 20.6974L14.8637 20.6359L6.86367 12.6359C6.5122 12.2844 6.5122 11.7139 6.86367 11.3625L14.8637 3.36244L14.932 3.30092Z"/></svg>',
  arrowLeft: s('<path d="M19 12H5M11 6l-6 6 6 6"/>'),
  arrowRight: s('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  search: s('<circle cx="11" cy="11" r="6.5"/><path d="m20 20-4.2-4.2"/>'),
  calendar: s('<rect x="4" y="5" width="16" height="15" rx="3"/><path d="M4 10h16M9 3v4M15 3v4"/>'),
  x: s('<path d="M6 6l12 12M18 6 6 18"/>'),
  download: s('<path d="M12 4v11M7 10l5 5 5-5M5 20h14"/>'),
  plus: s('<path d="M12 5v14M5 12h14"/>'),
  undo: s('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>'),
  redo: s('<path d="m15 14 5-5-5-5"/><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13"/>'),
  more: s('<circle cx="5" cy="12" r="1.4" fill="currentColor"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/><circle cx="19" cy="12" r="1.4" fill="currentColor"/>'),
  pen: s('<path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19z"/><path d="m14.5 6.5 3 3"/>'),
  highlighter: s('<path d="m9 11-5 5v3h3l5-5"/><path d="m9 11 6.5-6.5a2.1 2.1 0 0 1 3 3L12 14"/><path d="M9 11l3 3"/>'),
  eraser: s('<path d="M7 21h13"/><path d="M5.5 15.5 14 7a2 2 0 0 1 2.8 0l2.7 2.7a2 2 0 0 1 0 2.8L12 20H9z"/><path d="m9.5 11.5 5 5"/>'),
  lasso: s('<path d="M7.5 18.5C4.8 17.3 3 15.2 3 12.5 3 8.4 7 5 12 5s9 3.4 9 7.5-4 7.5-9 7.5c-1 0-2-.1-2.9-.4"/><circle cx="8" cy="18.5" r="1.8"/><path d="M8 20.3c0 1.2-.6 2.2-1.6 2.7"/>'),
  backReturn: s('<path d="M9 14 4 9l5-5"/><path d="M4 9h11a5 5 0 0 1 0 10h-3"/>'), // 성경 패널 '오늘 본문으로' (같은 이름 back이 위의 피그마 뒤로 아이콘을 덮어쓰고 있었어요)
};

const WEEK = ['주일', '월', '화', '수', '목', '금', '토'];
export const pad = (n) => String(n).padStart(2, '0');
export const toISO = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const parseISO = (iso) => { const [y, m, d] = iso.split('-').map(Number); return new Date(y, m - 1, d); };
export const todayISO = () => toISO(new Date());
// 설교 날짜 입력: YYYY.MM.DD(요일)
export const fmtFull = (iso) => { const d = parseISO(iso); return `${d.getFullYear()}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}(${WEEK[d.getDay()]})`; };
// 여러 해가 섞인 목록: YY.MM.DD
export const fmtShort = (iso) => { const d = parseISO(iso); return `${String(d.getFullYear()).slice(2)}.${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
export const fmtMD = (iso) => { const d = parseISO(iso); return `${pad(d.getMonth() + 1)}.${pad(d.getDate())}`; };
export const fmtHomeTitle = (d = new Date()) => `${d.getMonth() + 1}월 ${d.getDate()}일 ${d.getDay() === 0 ? '주일' : WEEK[d.getDay()] + '요일'}`;

export const esc = (t) => String(t ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
export const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

let toastTimer;
export function toast(msg, ms = 2200) {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.classList.remove('leave');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// 한글 초성
const CHO = 'ㄱㄲㄴㄷㄸㄹㅁㅂㅃㅅㅆㅇㅈㅉㅊㅋㅌㅍㅎ';
export function chosung(str) {
  return [...str].map((ch) => {
    const c = ch.charCodeAt(0) - 0xac00;
    return c >= 0 && c < 11172 ? CHO[Math.floor(c / 588)] : ch;
  }).join('');
}
export const firstCho = (str) => {
  const c = chosung(str[0]);
  return { 'ㄲ': 'ㄱ', 'ㄸ': 'ㄷ', 'ㅃ': 'ㅂ', 'ㅆ': 'ㅅ', 'ㅉ': 'ㅈ' }[c] || c;
};
