// Microsoft Clarity (사용성 테스트용). CLARITY_ID가 비어 있으면 아무것도 하지 않아요.
// 손글씨(캔버스)는 Clarity 녹화에 보이지 않아요. 터치 위치와 화면 흐름만 남아요.
const CLARITY_ID = 'zfyadfdcs2';

const on = !!CLARITY_ID && !/^(localhost|127\.)/.test(location.hostname);
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
