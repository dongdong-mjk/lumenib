// 작은 도우미들: 아이콘, 날짜, DOM

const s = (d, extra = '') =>
  `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" ${extra}>${d}</svg>`;

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
  pen: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20H21"/><path d="M16.4567 3.04876L4.25017 15.2553C4.18078 15.3247 4.13334 15.413 4.11377 15.5092L3.2721 19.6443C3.20065 19.9954 3.51073 20.3055 3.86178 20.234L7.99694 19.3923C8.09311 19.3728 8.18138 19.3253 8.25077 19.2559L20.4574 7.04936"/></svg>', // 피그마 pen toolbar 아이콘 (11/21)
  highlighter: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 11L3 17V20H12L15 17"/><path d="M23 11.5031L18.1107 16.3923C17.7134 16.7818 17.1791 17 16.6227 17C16.0663 17 15.532 16.7818 15.1347 16.3923L9.60767 10.8653C9.21817 10.468 9 9.93373 9 9.3773C9 8.82088 9.21817 8.28663 9.60767 7.88927L14.4969 3"/></svg>', // 피그마 pen toolbar 아이콘 (11/21)
  eraser: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6.99995 20L2.69995 15.7C1.69995 14.7 1.69995 13.2 2.69995 12.3L12.3 2.69995C13.3 1.69995 14.8 1.69995 15.7 2.69995L21.2999 8.29995C22.2999 9.29995 22.2999 10.8 21.2999 11.7L13 20"/><path d="M22 20H7"/><path d="M5 10L14 19"/></svg>', // 피그마 pen toolbar 아이콘 (11/21)
  lasso: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 22C6.37902 21.5343 5.875 20.9303 5.52786 20.2361C5.18073 19.5418 5 18.7762 5 18"/><path d="M3.3 14C2.45485 12.8376 1.99974 11.4372 2 10C2 5.6 6.5 2 12 2C17.5 2 22 5.6 22 10C22 14.4 17.5 18 12 18C10.2809 18.0287 8.57578 17.6877 7 17"/><path d="M5 18C5.53043 18 6.03914 17.7893 6.41421 17.4142C6.78929 17.0391 7 16.5304 7 16C7 15.4696 6.78929 14.9609 6.41421 14.5858C6.03914 14.2107 5.53043 14 5 14C4.46957 14 3.96086 14.2107 3.58579 14.5858C3.21071 14.9609 3 15.4696 3 16C3 16.5304 3.21071 17.0391 3.58579 17.4142C3.96086 17.7893 4.46957 18 5 18Z"/></svg>', // 피그마 pen toolbar 아이콘 (11/21)
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
  el.classList.remove('leave', 'act');
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

// 동작이 있는 토스트 (피그마 Toast action=true: 메시지 | 되돌리기). 3초 뒤 사라져요
export function toastAction(msg, label, onAct, ms = 3000) {
  const el = document.getElementById('toast');
  el.innerHTML = `<span></span><i class="t-div"></i><button type="button"></button>`;
  el.querySelector('span').textContent = msg;
  const b = el.querySelector('button');
  b.textContent = label;
  b.addEventListener('click', () => { clearTimeout(toastTimer); el.classList.remove('show'); onAct?.(); }, { once: true });
  el.classList.remove('leave');
  el.classList.add('show', 'act');
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

// 클립보드에 글 넣기 (11/26: 아이패드에서 "복사했어요"만 뜨고 실제로는 안 들어가던 것)
// 누른 그 순간(같은 탭 안)에 숨은 글상자로 복사해요. 아이패드 앱·사파리에서 이 방식이 가장 확실해요. 안 되면 클립보드 API로 한 번 더.
export function copyText(text) {
  let ok = false;
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.setAttribute('readonly', '');
  ta.contentEditable = 'true';
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;font-size:16px;pointer-events:none';
  document.body.appendChild(ta);
  const sel = window.getSelection();
  const keep = sel.rangeCount ? sel.getRangeAt(0) : null;
  try {
    const r = document.createRange(); r.selectNodeContents(ta);
    sel.removeAllRanges(); sel.addRange(r);
    ta.setSelectionRange(0, text.length);
    // 복사 순간에 넣을 글을 직접 정해요 (선택이 잘 안 잡혀도 들어가요)
    const onCopy = (e) => { e.clipboardData?.setData('text/plain', text); e.preventDefault(); };
    document.addEventListener('copy', onCopy, { once: true, capture: true });
    ok = document.execCommand('copy');
    document.removeEventListener('copy', onCopy, { capture: true });
  } catch { ok = false; }
  ta.remove();
  sel.removeAllRanges(); if (keep) sel.addRange(keep);
  if (ok) return Promise.resolve(true);
  if (!navigator.clipboard?.writeText) return Promise.resolve(false);
  return navigator.clipboard.writeText(text).then(() => true, () => false);
}
