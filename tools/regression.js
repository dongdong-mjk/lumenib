// 회귀 점검 (민정님 요청: 무엇을 고치든 그동안 요청한 기능이 다 되는지 확인)
// 사용: 브라우저에서 사이트를 열고(예전 파일이 남아 있지 않게 js·css를 fetch(..., {cache:'reload'})로 한 번 새로 받은 뒤 새로고침) 콘솔에서
//   const m = await import('./tools/regression.js?' + Date.now()); console.table(await m.run());
// 웹에서 확인할 수 있는 것만 자동으로 봐요. 애플펜슬·네이티브 동작은 메모리의 수동 목록으로 확인해요.
// 점검용 노트를 새로 만들고, 끝나면 지워요.

const wait = (t) => new Promise((r) => setTimeout(r, t));
// 툴바는 손을 뗀 뒤 다음 화면 갱신 때 다시 그려져요. 창이 숨겨져 있으면 갱신이 느려서 넉넉히 기다려요
const settle = () => wait(700);
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

function pixels(canvas) {
  const d = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
  let n = 0;
  for (let i = 3; i < d.length; i += 4) if (d[i]) n++;
  return n;
}
const base = (i = 0) => $$('.page')[i]?.querySelector('canvas:not(.bg):not(.ink):not(.live):not(.hllive):not(.hlfade):not(.carryhl)');
const ink = (i = 0) => $$('.page')[i]?.querySelector('canvas.ink');
function pe(target, type, x, y, id = 900) {
  target.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: y, pointerType: 'mouse', pointerId: id, bubbles: true, cancelable: true, button: 0, buttons: type === 'pointerup' ? 0 : 1, pressure: 0.5 }));
}
function stroke(pts, page = 0) {
  const c = base(page), r = c.getBoundingClientRect();
  const [x0, y0] = pts[0];
  pe(c, 'pointerdown', r.left + x0, r.top + y0);
  for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
  const [xn, yn] = pts[pts.length - 1];
  pe(c, 'pointerup', r.left + xn, r.top + yn);
}
const line = (x0, y0, x1, y1, n = 30) => Array.from({ length: n + 1 }, (_, i) => [x0 + ((x1 - x0) * i) / n, y0 + ((y1 - y0) * i) / n]);
const box = (x0, y0, x1, y1) => [...line(x0, y0, x1, y0, 8), ...line(x1, y0, x1, y1, 8), ...line(x1, y1, x0, y1, 8), ...line(x0, y1, x0, y0, 8)];
function tool(name) { $(`[data-tool="${name}"]`)?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); }
// 되돌리기 버튼은 툴바가 다시 그려져야 켜져서, 점검에선 종이에 바로 시켜요
const undo = () => window.__lumenibPaper?.undo();
const redo = () => window.__lumenibPaper?.redo();
const scroller = () => $('.paper-scroll');
function pinch(scaleOut) {
  const se = scroller(), tgt = se.querySelector('.page'), r = tgt.getBoundingClientRect();
  const T = (id, x, y) => new Touch({ identifier: id, target: tgt, clientX: x, clientY: y, touchType: 'direct' });
  const fire = (type, a, b) => { const ts = a ? [T(1, ...a), T(2, ...b)] : []; tgt.dispatchEvent(new TouchEvent(type, { touches: ts, targetTouches: ts, changedTouches: ts.length ? ts : [T(1, 0, 0), T(2, 0, 0)], bubbles: true, cancelable: true })); };
  const cx = r.left + 250, cy = r.top + 250;
  return (async () => {
    const d0 = scaleOut ? 150 : 50;
    fire('touchstart', [cx - d0, cy], [cx + d0, cy]);
    for (let i = 1; i <= 10; i++) { const d = scaleOut ? d0 - i * 10 : d0 + i * 10; fire('touchmove', [cx - d, cy], [cx + d, cy]); await wait(16); }
    fire('touchend', null, null);
    await wait(400);
  })();
}

export async function run() {
  const out = [];
  const check = async (name, fn) => {
    try { const r = await fn(); out.push({ 점검: name, 결과: r === true ? '통과' : '실패', 내용: r === true ? '' : String(r) }); }
    catch (e) { out.push({ 점검: name, 결과: '오류', 내용: e.message }); }
  };

  const S = await import('../js/store.js');
  const before = new Set(S.allNotes().map((n) => n.id));
  const lastPaper = S.settings.lastPaper;
  // 0. 점검용 노트 만들기: 홈 → 본문 고르기 → 본문 없이 먼저 쓰기
  location.hash = '';
  const home = $$('button').find((b) => b.textContent.trim() === '홈'); home?.click(); await wait(600);
  await check('본문 고르기 화면: 선택 취소(×) 버튼', async () => {
    $$('button').find((b) => b.textContent.includes('본문 고르기'))?.click(); await wait(800);
    $$('button').find((b) => b.textContent.trim() === '창세기')?.click(); await wait(400);
    $$('button').find((b) => b.textContent.trim() === '1장')?.click(); await wait(600);
    $('.verse[data-n="2"]')?.click(); await wait(300);
    if (!$('.bp-cancel')) return '× 버튼 없음';
    $('.bp-cancel').click(); await wait(300);
    return !$('.verse.sel') || '선택이 안 풀림';
  });
  $$('button').find((b) => b.textContent.includes('본문 없이 먼저'))?.click(); await wait(1500);
  if (!base()) { out.push({ 점검: '노트 열기', 결과: '오류', 내용: '노트 화면을 못 열었어요' }); return out; }
  const se = scroller();

  await check('뒤로 버튼(피그마 꺾쇠 아이콘)', () => ($('[data-act="back"] path')?.getAttribute('d') || '').startsWith('M14.932') || '아이콘 다름');
  await check('툴바 도구 선택(펜·형광펜·지우개·올가미)', async () => {
    const I = await import('../js/ink.js');
    for (const t of ['hl', 'eraser', 'lasso', 'pen']) { tool(t); await settle(); if (I.tool.type !== t) return t + ' 선택 안 됨'; }
    await wait(800); // 툴바 표시도 따라오는지
    return $('[data-tool].on')?.dataset.tool === 'pen' || '툴바 표시가 안 바뀜';
  });
  await check('툴바 가운데 영역 너비 고정(268)', () => Math.round($('.tb-opts').getBoundingClientRect().width) === 268 || $('.tb-opts').getBoundingClientRect().width);

  await check('펜 쓰기 · 되돌리기 · 다시 하기', async () => {
    tool('pen'); await settle();
    const p0 = pixels(ink());
    stroke(line(80, 300, 300, 320)); await settle();
    const p1 = pixels(ink()); if (p1 <= p0) return '펜 선이 안 그려짐';
    await settle(); undo(); await settle(); if (pixels(ink()) > p0 + 10) return '되돌리기 안 됨';
    redo(); await settle(); return Math.abs(pixels(ink()) - p1) < p1 * 0.05 || '다시 하기 안 됨';
  });
  await check('형광펜: 글씨 밑 캔버스에 그려짐 · 돼지꼬리 겹침 고르게', async () => {
    tool('hl'); await settle();
    const pts = Array.from({ length: 120 }, (_, i) => { const t = (i / 120) * Math.PI * 4; return [120 + i * 2 + Math.cos(t) * 30, 420 + Math.sin(t) * 30]; });
    stroke(pts); await wait(200);
    const c = base(), ctx = c.getContext('2d'), k = c.width / c.getBoundingClientRect().width;
    // 고리가 겹치는 곳과 안 겹치는 곳의 진하기가 같아야 해요
    const a = ctx.getImageData(Math.round(pts[0][0] * k), Math.round(pts[0][1] * k), 1, 1).data[3];
    if (!a) return '형광펜이 안 그려짐';
    const alphas = new Set();
    for (const [x, y] of pts.filter((_, i) => i % 10 === 5)) alphas.add(ctx.getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data[3]);
    return alphas.size <= 2 || '겹친 곳 진하기가 달라요 ' + [...alphas];
  });

  await check('올가미: 획 일부만 둘러도 고름 · 선택 해제', async () => {
    tool('lasso'); await settle();
    stroke(box(150, 280, 230, 340)); await settle(); // 펜 선(80~300)의 가운데만
    if (!$('.lasso-menu')) return '선택 안 됨';
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    return !$('.lasso-menu') || '해제 안 됨';
  });
  await check('올가미로 옮기기 · 되돌리기', async () => {
    const before = pixels(ink()); // 고르기 전 (고르면 고른 글씨는 선택 판으로 옮겨 그려져요)
    tool('lasso'); await settle();
    stroke(box(60, 280, 320, 340)); await settle();
    const c = base(), r = c.getBoundingClientRect();
    pe(c, 'pointerdown', r.left + 150, r.top + 310); pe(c, 'pointermove', r.left + 150, r.top + 360); pe(c, 'pointerup', r.left + 150, r.top + 360); await wait(250);
    if (!$('.lasso-menu')) return '옮긴 뒤 선택 유지 안 됨';
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    const moved = ink().getContext('2d').getImageData(0, 0, ink().width, ink().height);
    undo(); await settle();
    return Math.abs(pixels(ink()) - before) < before * 0.05 || '되돌리기 후 그림이 달라요 ' + [before, pixels(ink()), moved.width];
  });

  await check('구절 고르기: 9→10→11 누적', async () => {
    for (const n of [9, 10, 11]) { $(`.verse[data-n="${n}"]`)?.click(); await settle(); }
    const sel = $$('.verse.sel').map((v) => +v.dataset.n);
    return (sel.join() === '9,10,11') || '고른 절: ' + sel.join();
  });
  await check('고른 구절 위: 세로는 목록 스크롤 · 노트 화면 선택 취소(×)', async () => {
    const v = $('.verse.sel'), body = v.closest('.bp-body'), r = v.getBoundingClientRect(), st0 = body.scrollTop;
    const ev = (t, x, y, tg) => (tg || body).dispatchEvent(new PointerEvent(t, { clientX: x, clientY: y, pointerId: 901, pointerType: 'touch', bubbles: true, cancelable: true, button: 0, buttons: t === 'pointerup' ? 0 : 1 }));
    ev('pointerdown', r.left + 40, r.top + 10, v);
    for (let i = 1; i <= 8; i++) { ev('pointermove', r.left + 40, r.top + 10 - i * 15); await wait(16); }
    ev('pointerup', r.left + 40, r.top - 110); await wait(500);
    if (body.scrollTop === st0) return '세로 스크롤 안 됨';
    return !!$('.bp-cancel') || '× 버튼 없음';
  });
  await check('인용 넣기', async () => {
    $$('.bp-action button').find((b) => /인용으로|노트에 넣기/.test(b.textContent))?.click(); await wait(800);
    return $$('.cite-block').length === 1 || '인용 개수 ' + $$('.cite-block').length;
  });
  await check('인용 위에 쓴 글씨만 손잡이로 같이 움직임', async () => {
    const cb = $('.cite-block'), pr = $$('.page')[0].getBoundingClientRect(), k = pr.width / 726;
    const top = (cb.getBoundingClientRect().top - pr.top) / 1; // 화면 px
    tool('pen'); await settle();
    stroke(line(100, top + 30, 200, top + 30)); await settle();
    const grip = $('.cite-grip'), g = grip.getBoundingClientRect();
    const inkBefore = pixels(ink());
    pe(grip, 'pointerdown', g.left + 5, g.top + 5, 902); pe(window, 'pointermove', g.left + 5, g.top + 125, 902); pe(window, 'pointerup', g.left + 5, g.top + 125, 902); await wait(400);
    const moved = Math.round((cb.getBoundingClientRect().top - pr.top - top) / k);
    if (Math.abs(moved - 120 / k) > 3) return '인용이 안 움직임 ' + moved;
    if (pixels(ink()) < inkBefore * 0.9) return '글씨가 사라짐';
    // 글씨도 같이 내려갔는지: 원래 자리에 글씨가 없어야 해요
    const c = ink(), kk = c.width / c.getBoundingClientRect().width;
    const old = c.getContext('2d').getImageData(Math.round(150 * kk), Math.round((top + 30) * kk), 1, 1).data[3];
    undo(); await settle();
    return !old || '글씨가 따라오지 않았어요';
  });
  await check('인용을 다음 장으로 옮기기 · 되돌리기 · 자리 유지', async () => {
    const pages = $$('.page'); if (pages.length < 2) return '2쪽이 없음';
    se.scrollTop = 0; await wait(100);
    const grip = $('.cite-grip'), g = grip.getBoundingClientRect();
    pe(grip, 'pointerdown', g.left + 5, g.top + 5, 903);
    pages[1].scrollIntoView(); await wait(150);
    const r2 = pages[1].getBoundingClientRect();
    pe(window, 'pointermove', g.left + 5, r2.top + 120, 903); pe(window, 'pointerup', g.left + 5, r2.top + 120, 903); await wait(400);
    if (!$$('.page')[1].querySelector('.cite-block')) return '2쪽으로 안 넘어감';
    const st = se.scrollTop;
    undo(); await wait(400);
    if (!$$('.page')[0].querySelector('.cite-block')) return '되돌리기 안 됨';
    return Math.abs(se.scrollTop - st) < 2 || '되돌리기 후 스크롤이 튐 ' + [st, se.scrollTop];
  });
  await check('올가미로 인용 고르면 위의 글씨도 같이', async () => {
    se.scrollTop = 0; await wait(100);
    const cb = $('.cite-block'), pr = $$('.page')[0].getBoundingClientRect(), top = cb.getBoundingClientRect().top - pr.top;
    tool('pen'); await settle();
    stroke(line(100, top + 30, 200, top + 30)); await settle();
    tool('lasso'); await settle();
    stroke(box(500, top + 5, 560, top + 25)); await settle();
    const ok = !!$('.lasso-menu');
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    undo(); await settle();
    return ok || '인용이 안 골라짐';
  });

  await check('올가미로 인용 두 개 옮기기 · 되돌리기 (가볍게)', async () => {
    se.scrollTop = 0; await wait(100);
    $('.verse[data-n="20"]')?.click(); await wait(300);
    $$('.bp-action button').find((b) => /인용으로|노트에 넣기/.test(b.textContent))?.click(); await settle();
    const blocks = $$('.page')[0].querySelectorAll('.cite-block');
    if (blocks.length < 2) return '인용이 2개가 아님 ' + blocks.length;
    const pr = $$('.page')[0].getBoundingClientRect();
    const tops = () => [...$$('.page')[0].querySelectorAll('.cite-block')].map((b) => Math.round(b.getBoundingClientRect().top - pr.top));
    const t0 = tops(), y0 = Math.min(...t0) - 10, y1 = Math.max(...t0) + 40;
    tool('lasso'); await settle();
    stroke(box(480, y0, 560, y1)); await settle();
    if (!$('.lasso-menu')) return '두 인용이 안 골라짐';
    const c = base(), r = c.getBoundingClientRect();
    const t1 = performance.now();
    pe(c, 'pointerdown', r.left + 520, r.top + y0 + 20); pe(c, 'pointermove', r.left + 520, r.top + y0 + 80); pe(c, 'pointerup', r.left + 520, r.top + y0 + 80);
    const cost = performance.now() - t1; await settle();
    const moved = tops();
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    undo(); await settle();
    const back = tops();
    if (moved.join() === t0.join()) return '안 움직임';
    if (back.join() !== t0.join()) return '되돌리기 후 자리 다름 ' + [t0, back];
    return cost < 60 || '손 뗄 때 처리가 무거움 ' + Math.round(cost) + 'ms';
  });
  await check('올가미로 인용·글씨를 다음 장으로 옮기기 · 되돌리기', async () => {
    se.scrollTop = 0; await wait(100);
    const p0 = $$('.page')[0], pr = p0.getBoundingClientRect();
    const cb = p0.querySelector('.cite-block'); if (!cb) return '인용 없음';
    const top = cb.getBoundingClientRect().top - pr.top;
    tool('lasso'); await settle();
    stroke(box(480, top - 10, 560, top + 30)); await settle();
    if (!$('.lasso-menu')) return '안 골라짐';
    const c = base(), r = c.getBoundingClientRect();
    pe(c, 'pointerdown', r.left + 520, r.top + top + 10);
    $$('.page')[1].scrollIntoView(); await wait(200);
    const r2 = $$('.page')[1].getBoundingClientRect();
    pe(c, 'pointermove', r.left + 520, r2.top + 150); pe(c, 'pointerup', r.left + 520, r2.top + 150); await settle();
    if (!$$('.page')[1].querySelector('.cite-block')) return '2쪽으로 안 넘어감';
    undo(); await settle();
    return !!$$('.page')[0].querySelector('.cite-block') && !$$('.page')[1].querySelector('.cite-block') || '되돌리기 안 됨';
  });
  await check('종이 종류 바꿔도 확대·스크롤 유지 · 마지막 종이 기억', async () => {
    se.scrollTop = 300; await wait(100);
    const st = se.scrollTop;
    $('[data-act="more"]').click(); await wait(200);
    const opt = $$('.paper-opt').find((b) => !b.classList.contains('on'));
    const want = opt.dataset.p; opt.click(); await wait(300);
    if (Math.abs(se.scrollTop - st) > 2) return '스크롤이 튐';
    const saved = JSON.parse(localStorage.getItem('lumenib.v1.settings') || '{}').lastPaper;
    return saved === want || '마지막 종이 저장 안 됨';
  });
  await check('두 손가락 확대 · 축소 후 다시 그리기', async () => {
    const before = pixels(ink());
    await pinch(false);
    if (!se.classList.contains('zoomed')) return '확대 안 됨';
    if (!pixels(ink())) return '확대 후 글씨가 안 보임';
    await pinch(true);
    if (se.classList.contains('zoomed')) return '축소 안 됨';
    return pixels(ink()) > 0 || '축소 후 글씨 안 보임 ' + before;
  });
  await check('사이드바 접기·펴기 후 종이 정상', async () => {
    $('[data-act="side"]').click(); await wait(450);
    $('[data-act="side"]').click(); await wait(450);
    const pe2 = $('.pages');
    return (!pe2.style.transform || pe2.style.transform === 'none') && pixels(ink()) > 0 || '종이 변형이 남음 ' + pe2.style.transform;
  });

  // 정리: 점검용으로 만든 노트를 지우고 처음 화면으로
  S.allNotes().filter((n) => !before.has(n.id)).forEach((n) => S.deleteNote(n.id));
  S.settings.lastPaper = lastPaper; S.saveSettings();
  S.saveNotes(true);
  location.hash = ''; setTimeout(() => location.reload(), 50);
  return out;
}
