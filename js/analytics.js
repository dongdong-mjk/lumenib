// Microsoft Clarity (사용성 테스트용). CLARITY_ID가 비어 있으면 아무것도 하지 않아요.
// 손글씨(캔버스)는 Clarity 녹화에 보이지 않아요. 터치 위치와 화면 흐름만 남아요.
const CLARITY_ID = 'zfyadfdcs2';

// 민정님 기기는 기록에서 빼기: 주소 끝에 ?me 를 붙여 한 번 열면 이 기기는 계속 빠져요. ?me=off 로 다시 켜요.
const OPT_KEY = 'lumenib.noTrack';
let optOut = false;
try {
  const q = new URLSearchParams(location.search);
  if (q.has('me')) {
    if (q.get('me') === 'off') localStorage.removeItem(OPT_KEY); else localStorage.setItem(OPT_KEY, '1');
    history.replaceState(null, '', location.pathname);
    window.__trackMsg = q.get('me') === 'off' ? '이 기기도 사용 기록에 다시 포함돼요' : '이 기기는 사용 기록에서 빠져요';
  }
  optOut = localStorage.getItem(OPT_KEY) === '1';
} catch {}
export const isTracking = () => on;
const on = !!CLARITY_ID && !optOut && !/^(localhost|127\.)/.test(location.hostname);
if (on) {
  (function (c, l, a, r, i, t, y) {
    c[a] = c[a] || function () { (c[a].q = c[a].q || []).push(arguments); };
    t = l.createElement(r); t.async = 1; t.src = 'https://www.clarity.ms/tag/' + i;
    y = l.getElementsByTagName(r)[0]; y.parentNode.insertBefore(t, y);
  })(window, document, 'clarity', 'script', CLARITY_ID);
}
const c = (...a) => { if (on && window.clarity) window.clarity(...a); };

// 화면 이름: 녹화 · 히트맵을 화면별로 거를 때 써요 (필터의 '사용자 지정 태그 → screen')
export function screen(name) { c('set', 'screen', name); c('event', 'screen_' + name); }
// 과제 이벤트: 필터의 '사용자 지정 이벤트'에서 골라 봐요
export function track(name) { c('event', name); }
