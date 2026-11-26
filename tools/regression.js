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
  if (window.__lumenibGo) window.__lumenibGo('home'); else $$('button').find((b) => b.textContent.trim() === '홈')?.click();
  await wait(600);
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
  await check('설정 창이 있는 도구(펜·형광펜)를 고르면 칸이 넓어지며 오른쪽 화살표 · 형광펜 한 번 더 누르면 손떨림 보정 창 · 다른 도구엔 없음', async () => {
    tool('eraser'); await settle();
    const penInd = () => { const e = $('[data-tool="pen"] .tb-more-ind'); if (e) e.style.transition = 'none'; /* 숨은 창에선 애니메이션이 멈춰 있어서 끝 상태로 봐요 */ return e; };
    if (!penInd()) return '펜 버튼에 화살표가 없어요';
    if (+getComputedStyle(penInd()).opacity > 0.05) return '펜을 안 골랐는데 화살표가 보여요';
    if ($('[data-tool="eraser"] .tb-more-ind')) return '설정 창 없는 지우개에도 화살표가 있어요';
    tool('pen'); await settle();
    if (+getComputedStyle(penInd()).opacity < 0.5) return '펜을 골라도 화살표가 안 보여요';
    const pb = $('[data-tool="pen"]'); pb.style.transition = 'none';
    if (pb.getBoundingClientRect().width < 56) return '고른 펜 칸이 옆으로 안 넓어져요';
    // 형광펜도: 고르면 화살표, 한 번 더 누르면 형광펜 설정(투명도·손떨림 보정)
    if (!$('[data-tool="hl"] .tb-more-ind')) return '형광펜에 화살표가 없어요';
    tool('hl'); await settle(); tool('hl'); await settle();
    const panel = $('.tb-menu.hl-settings'), n = panel ? panel.querySelectorAll('input[type=range]').length : 0;
    panel?.remove(); tool('pen'); await settle();
    return n === 1 || '형광펜을 한 번 더 눌러도 손떨림 보정 창이 안 열려요 ' + n;
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
  await check('글씨 많은 장: 한 획 쓰기·되돌리기가 가벼움', async () => {
    tool('pen'); await settle();
    for (let i = 0; i < 120; i++) { const y = 560 + (i % 20) * 12, x = 60 + Math.floor(i / 20) * 100; stroke(line(x, y, x + 80, y + 4, 25)); }
    await settle();
    const t0 = performance.now(); stroke(line(60, 820, 300, 830, 25)); const add = performance.now() - t0;
    await settle();
    const t1 = performance.now(); undo(); const un = performance.now() - t1;
    await settle(); redo(); await settle();
    // 쓴 획이 다시 그려도 그대로인지 (기억해 둔 모양이 맞는지)
    const before = pixels(ink());
    window.__lumenibPaper.drawPage($$('.page').length ? window.__lumenibPaper.pages[0] : null);
    const after = pixels(ink());
    for (let i = 0; i < 121; i++) undo();
    await settle();
    if (Math.abs(after - before) > before * 0.01) return '다시 그린 그림이 달라요 ' + [before, after];
    return add < 25 || '한 획 추가가 무거워요 ' + Math.round(add) + 'ms (되돌리기 ' + Math.round(un) + 'ms)';
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

  await check('두 손가락 탭 = 되돌리기 · 펜슬 직후 손바닥 탭은 무시', async () => {
    tool('pen'); await settle();
    stroke(line(80, 500, 300, 510)); await settle();
    const tgt = $$('.page')[0], r = tgt.getBoundingClientRect();
    const T = (id, x, y, type = 'direct') => new Touch({ identifier: id, target: tgt, clientX: x, clientY: y, touchType: type });
    const tap = (withPencil) => {
      const a = T(11, r.left + 200, r.top + 600), b = T(12, r.left + 260, r.top + 600);
      tgt.dispatchEvent(new TouchEvent('touchstart', { touches: [a, b], targetTouches: [a, b], changedTouches: [a, b], bubbles: true, cancelable: true }));
      if (withPencil) { const p = T(13, r.left + 300, r.top + 300, 'stylus'); tgt.dispatchEvent(new TouchEvent('touchstart', { touches: [a, b, p], targetTouches: [a, b, p], changedTouches: [p], bubbles: true, cancelable: true })); }
      tgt.dispatchEvent(new TouchEvent('touchend', { touches: [], targetTouches: [], changedTouches: [a, b], bubbles: true, cancelable: true }));
    };
    const n0 = window.__lumenibPaper.undoStack.length;
    tap(true); await wait(500);
    if (window.__lumenibPaper.undoStack.length !== n0) return '펜슬과 같이 닿은 탭에 되돌려짐';
    await wait(900);
    tap(false); await wait(500);
    if (window.__lumenibPaper.undoStack.length !== n0 - 1) return '두 손가락 탭으로 안 되돌려짐';
    redo(); await settle();
    return true;
  });
  await check('그리고 멈추면 도형 · 누른 채로 움직이면 크기 조절 (펜)', async () => {
    tool('pen'); await settle();
    const c = base(), r = c.getBoundingClientRect();
    const pts = [...line(400, 300, 520, 302, 10), ...line(520, 302, 518, 380, 8), ...line(518, 380, 402, 378, 10), ...line(402, 378, 400, 302, 8)];
    pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
    for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
    await wait(750); // 펜을 떼지 않고 멈춤
    pe(c, 'pointermove', r.left + 420, r.top + 300); // 누른 채로 움직여 크기 조절
    pe(c, 'pointerup', r.left + 420, r.top + 300); await settle();
    const P = window.__lumenibPaper, last = P.note.pages[0].strokes.at(-1);
    if (!last?.sh) return '도형으로 안 바뀜';
    const xs = last.pts.filter((_, i) => i % 3 === 0), ys = last.pts.filter((_, i) => i % 3 === 1);
    const w = Math.max(...xs) - Math.min(...xs);
    undo(); await settle();
    return w > 20 || '도형 크기가 이상해요 ' + w;
  });
  await check('도형: 그린 모양대로 · 대충 그린 네모 인식 · 덜 닫힌 원도 원(매끄럽게) · 꺾은선 끝을 시작점에 대면 붙고, 붙은 뒤엔 그 꼭짓점만 펜을 따라감', async () => {
    tool('pen'); await settle();
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    const drawHold = async (pts, after) => {
      pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
      for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
      await wait(750);
      const afters = after ? (Array.isArray(after[0]) ? after : [after]) : [];
      for (const a of afters) pe(c, 'pointermove', r.left + a[0], r.top + a[1]);
      const e = afters.at(-1) || pts.at(-1);
      pe(c, 'pointerup', r.left + e[0], r.top + e[1]); await settle();
      return P.note.pages[0].strokes.at(-1);
    };
    // 1) 비뚤어진 세모: 그린 꼭짓점 근처 그대로
    const A = [120, 330], B = [260, 300], C = [150, 200];
    const tri = await drawHold([...line(A[0], A[1], B[0], B[1], 10), ...line(B[0], B[1], C[0], C[1], 10), ...line(C[0], C[1], A[0] + 3, A[1] - 2, 10)]);
    const near = (q) => { let m = 1e9; for (let i = 0; i < tri.pts.length; i += 3) m = Math.min(m, Math.hypot(tri.pts[i] / 1 - q[0] / (r.width / 726), tri.pts[i + 1] - q[1] / (r.width / 726))); return m; };
    undo(); await settle();
    if (!tri?.sh) return '세모가 도형으로 안 바뀜';
    if ([A, B, C].some((q) => near(q) > 12)) return '세모가 그린 모양과 달라요';
    // 1-2) 손으로 대충 그린 네모 (떨림 있음) → 곧은 네 변, 닫힘
    const jit = (pts) => pts.map(([x, y], i) => [x + Math.sin(i * 1.7) * 2, y + Math.cos(i * 1.3) * 2]);
    const sq = await drawHold(jit([...line(560, 420, 680, 424, 14), ...line(680, 424, 676, 530, 14), ...line(676, 530, 562, 526, 14), ...line(562, 526, 562, 428, 14)]));
    undo(); await settle();
    if (!sq?.sh) return '네모가 도형으로 안 바뀜';
    const sqx = sq.pts.filter((_, i) => i % 3 === 0), sqy = sq.pts.filter((_, i) => i % 3 === 1);
    const corners = new Set(sq.pts.length ? [] : []);
    if (Math.hypot(sqx.at(-1) - sqx[0], sqy.at(-1) - sqy[0]) > 0.5) return '네모가 안 닫혀요';
    // 2) 4분의 3쯤만 그린 원 → 원
    const arc = Array.from({ length: 50 }, (_, i) => { const t = (i / 49) * Math.PI * 1.8; return [450 + Math.cos(t) * 60, 260 + Math.sin(t) * 60]; });
    const circ = await drawHold(arc);
    undo(); await settle();
    if (!circ?.sh) return '덜 닫힌 원이 도형으로 안 바뀜';
    if (circ.pts.length / 3 < 100) return '원이 다각형으로 나와요 (' + circ.pts.length / 3 + '점)';
    // 원은 촘촘해야 확대해도 매끄러워요 (점 사이 1 이하)
    let gap = 0; for (let i = 3; i < circ.pts.length; i += 3) gap = Math.max(gap, Math.hypot(circ.pts[i] - circ.pts[i - 3], circ.pts[i + 1] - circ.pts[i - 2]));
    if (gap > 1) return '원 점 사이가 넓어요 ' + gap.toFixed(2);
    // 3) ㄷ 모양 꺾은선 → 멈춘 뒤 끝을 시작점에 대면 붙어서 닫힘
    const S = [150, 450];
    const open = [...line(S[0], S[1], 300, 450, 10), ...line(300, 450, 300, 560, 10), ...line(300, 560, 150, 560, 10)];
    const k = r.width / 726;
    const poly = await drawHold(open, [S[0] + 4, S[1] + 4]);
    undo(); await settle();
    if (!poly?.sh) return '꺾은선이 도형으로 안 바뀜';
    const q = poly.pts, d = Math.hypot(q[q.length - 3] - q[0], q[q.length - 2] - q[1]);
    if (d >= 0.5) return '끝점이 시작점에 안 붙어요 ' + d.toFixed(1) + ' (배율 ' + k.toFixed(2) + ')';
    // 4) 붙은 다음 펜을 더 움직이면 떨어지지 않고, 붙은 꼭짓점(시작=끝)만 펜을 따라가요. 다른 꼭짓점은 그대로
    const poly2 = await drawHold(open, [[S[0] + 4, S[1] + 4], [S[0] - 60, S[1] - 50]]);
    undo(); await settle();
    const q2 = poly2.pts, d2 = Math.hypot(q2[q2.length - 3] - q2[0], q2[q2.length - 2] - q2[1]);
    if (d2 >= 0.5) return '붙은 뒤 펜을 움직이니 다시 떨어져요';
    if (Math.hypot(q2[0] * k - (S[0] - 60), q2[1] * k - (S[1] - 50)) > 3) return '붙은 꼭짓점이 펜을 안 따라가요';
    const has = (x, y) => { for (let i = 0; i < q2.length; i += 3) if (Math.hypot(q2[i] * k - x, q2[i + 1] * k - y) < 6) return true; return false; };
    return (has(300, 450) && has(300, 560)) || '다른 꼭짓점까지 움직였어요';
  });
  await check('펜슬처럼 떨리는 손으로 그은 선도 멈추면 직선 (펜·형광펜)', async () => {
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    for (const t of ['pen', 'hl']) {
      tool(t); await settle();
      // 촘촘한 점 + 미세한 떨림, 끝에서 멈춘 채로도 조금씩 흔들림 (아이패드 펜슬처럼)
      const pts = [];
      for (let i = 0; i <= 150; i++) pts.push([120 + i * 2 + Math.sin(i * 2.7) * 1.2, 620 + i * 0.15 + Math.cos(i * 3.1) * 1.2]);
      pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
      for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
      const [ex, ey] = pts.at(-1);
      for (let j = 0; j < 12; j++) { pe(c, 'pointermove', r.left + ex + Math.sin(j) * 1.5, r.top + ey + Math.cos(j) * 1.5); await wait(60); }
      await wait(600);
      pe(c, 'pointerup', r.left + ex, r.top + ey); await settle();
      const last = P.note.pages[0].strokes.at(-1);
      undo(); await settle();
      if (!last?.sh) return t + ': 직선으로 안 바뀜';
    }
    tool('pen'); await settle();
    return true;
  });
  await check('대충 그린 네모(변 중간에서 시작·끝이 지나침·약간 사다리꼴) → 반듯한 네모, 꼬리 없음', async () => {
    tool('pen'); await settle();
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    const L = (a, b, n = 14) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n + Math.sin(i * 2.1) * 1.5, a[1] + (b[1] - a[1]) * i / n + Math.cos(i * 1.7) * 1.5]);
    // 윗변 가운데에서 시작 → 오른쪽 위 → 오른쪽 아래(조금 안쪽) → 왼쪽 아래 → 왼쪽 위 → 시작점을 지나쳐서 끝
    const pts = [...L([440, 300], [560, 296]), ...L([560, 296], [552, 400]), ...L([552, 400], [330, 404]), ...L([330, 404], [322, 300]), ...L([322, 300], [470, 302])];
    pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
    for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
    await wait(750);
    pe(c, 'pointerup', r.left + pts.at(-1)[0], r.top + pts.at(-1)[1]); await settle();
    const s = P.note.pages[0].strokes.at(-1);
    undo(); await settle();
    if (!s?.sh) return '도형으로 안 바뀜';
    // 꼭짓점: 방향이 크게 바뀌는 곳 세기
    const q = []; for (let i = 0; i < s.pts.length; i += 3) q.push([s.pts[i], s.pts[i + 1]]);
    let corners = 0; const step = 6;
    for (let i = step; i < q.length - step; i += 1) {
      const a1 = Math.atan2(q[i][1] - q[i - step][1], q[i][0] - q[i - step][0]), a2 = Math.atan2(q[i + step][1] - q[i][1], q[i + step][0] - q[i][0]);
      let d = Math.abs(a1 - a2); if (d > Math.PI) d = 2 * Math.PI - d;
      if (d > 1.2) { corners++; i += step * 2; }
    }
    const xs = q.map((p) => p[0]), ys = q.map((p) => p[1]);
    // 반듯한 네모면 변이 수평·수직: 위·아래 변의 y 차이가 거의 없음
    const top = ys.filter((y) => y < Math.min(...ys) + 3).length, ok = corners >= 3 && corners <= 4;
    return ok || '꼭짓점 수가 이상해요 ' + corners;
  });
  await check('멈춘 뒤 펜을 옆으로 움직이면 네모가 가로로만 늘어남 · 반대쪽 꼭짓점 고정 (굿노트처럼)', async () => {
    tool('pen'); await settle();
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    const L = (a, b, n = 12) => Array.from({ length: n + 1 }, (_, i) => [a[0] + (b[0] - a[0]) * i / n, a[1] + (b[1] - a[1]) * i / n]);
    const pts = [...L([320, 300], [420, 300]), ...L([420, 300], [420, 380]), ...L([420, 380], [320, 380]), ...L([320, 380], [320, 302])];
    pe(c, 'pointerdown', r.left + 320, r.top + 300);
    for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
    await wait(750);
    pe(c, 'pointermove', r.left + 240, r.top + 302); // 펜(왼쪽 위 모서리)을 왼쪽으로 80
    pe(c, 'pointerup', r.left + 240, r.top + 302); await settle();
    const s = P.note.pages[0].strokes.at(-1);
    undo(); await settle();
    if (!s?.sh) return '도형으로 안 바뀜';
    const xs = s.pts.filter((_, i) => i % 3 === 0), ys = s.pts.filter((_, i) => i % 3 === 1);
    const k = r.width / 726, w = (Math.max(...xs) - Math.min(...xs)) * k, h = (Math.max(...ys) - Math.min(...ys)) * k;
    if (Math.abs(h - 80) > 8) return '세로도 바뀌었어요 ' + Math.round(h);
    const bx = Math.max(...xs) * k, by = Math.max(...ys) * k; // 반대쪽(오른쪽 아래) 꼭짓점은 그대로
    if (Math.abs(bx - 420) > 3 || Math.abs(by - 380) > 3) return '반대쪽 꼭짓점이 움직였어요 ' + Math.round(bx) + ',' + Math.round(by);
    return Math.abs(w - 180) < 10 || '가로가 펜 위치만큼 안 늘었어요 ' + Math.round(w);
  });
  await check('그리고 멈추면 직선 (형광펜)', async () => {
    tool('hl'); await settle();
    const c = base(), r = c.getBoundingClientRect();
    const pts = Array.from({ length: 30 }, (_, i) => [100 + i * 8, 700 + Math.sin(i / 2) * 3]);
    pe(c, 'pointerdown', r.left + pts[0][0], r.top + pts[0][1]);
    for (const [x, y] of pts.slice(1)) pe(c, 'pointermove', r.left + x, r.top + y);
    await wait(750);
    pe(c, 'pointerup', r.left + pts.at(-1)[0], r.top + pts.at(-1)[1]); await settle();
    const last = window.__lumenibPaper.note.pages[0].strokes.at(-1);
    // 처음과 끝을 이은 선에서 벗어난 정도 (곧은 선이면 거의 0)
    const q = last.pts, ax = q[0], ay = q[1], bx = q[q.length - 3], by = q[q.length - 2], L = Math.hypot(bx - ax, by - ay) || 1;
    let off = 0; for (let i = 0; i < q.length; i += 3) off = Math.max(off, Math.abs((q[i] - ax) * (by - ay) - (q[i + 1] - ay) * (bx - ax)) / L);
    const ys = q.filter((_, i) => i % 3 === 1);
    undo(); await settle(); tool('pen'); await settle();
    if (!last.sh) return '직선으로 안 바뀜';
    if (off >= 0.6) return '곧은 선이 아니에요 ' + off.toFixed(2);
    // 수평에서 조금 기운 선은 딱 수평으로
    return Math.max(...ys) - Math.min(...ys) < 0.01 || '수평으로 안 맞춰짐 ' + (Math.max(...ys) - Math.min(...ys)).toFixed(2);
  });
  await check('올가미: 획 일부만 둘러도 고름 · 선택 해제', async () => {
    tool('lasso'); await settle();
    stroke(box(150, 280, 230, 340)); await settle(); // 펜 선(80~300)의 가운데만
    if (!$('.lasso-menu')) return '선택 안 됨';
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    return !$('.lasso-menu') || '해제 안 됨';
  });
  await check('올가미로 옮기기 · 되돌리기 · 선택 사각형도 같이', async () => {
    const before = pixels(ink()); // 고르기 전 (고르면 고른 글씨는 선택 판으로 옮겨 그려져요)
    tool('lasso'); await settle();
    stroke(box(60, 280, 320, 340)); await settle();
    const c = base(), r = c.getBoundingClientRect(), P = window.__lumenibPaper;
    const y0 = P.selection?.box?.[1];
    if (y0 == null) return '고르기 안 됨';
    pe(c, 'pointerdown', r.left + 150, r.top + 310); pe(c, 'pointermove', r.left + 150, r.top + 360); pe(c, 'pointerup', r.left + 150, r.top + 360); await wait(250);
    if (!$('.lasso-menu')) return '옮긴 뒤 선택 유지 안 됨';
    const k = r.width / 726;
    if (Math.abs((P.selection.box[1] - y0) * k - 50) > 3) return '선택 사각형이 글씨와 같이 안 움직여요';
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    const moved = ink().getContext('2d').getImageData(0, 0, ink().width, ink().height);
    undo(); await settle();
    return Math.abs(pixels(ink()) - before) < before * 0.05 || '되돌리기 후 그림이 달라요 ' + [before, pixels(ink()), moved.width];
  });

  await check('올가미 회전: 위 손잡이를 끌면 고른 글씨가 가운데를 중심으로 돌고, 90° 근처에서 딱 맞음 · 되돌리기', async () => {
    tool('pen'); await settle();
    const P = window.__lumenibPaper, c = base(), r = c.getBoundingClientRect(), k = r.width / 726;
    stroke(line(200 * k, 600 * k, 300 * k, 600 * k)); await settle();
    const s0 = P.note.pages[0].strokes.at(-1);
    tool('lasso'); await settle();
    stroke(box(180 * k, 585 * k, 320 * k, 615 * k)); await settle();
    if (!P.selection?.set.size) { undo(); await settle(); return '안 골라짐'; }
    const b = P.selection.box, cx = (b[0] + b[2]) / 2, cy = (b[1] + b[3]) / 2, hy = b[1] - 28 / P.scale;
    // 손잡이(위)를 오른쪽으로 끌어 약 88° 돌리기 → 90°에 딱 맞음
    const R = cy - hy, ang = 88 * Math.PI / 180, tx = cx + R * Math.sin(ang), ty = cy - R * Math.cos(ang);
    pe(c, 'pointerdown', r.left + cx * k, r.top + hy * k); pe(c, 'pointermove', r.left + tx * k, r.top + ty * k); pe(c, 'pointerup', r.left + tx * k, r.top + ty * k); await settle();
    const s1 = P.note.pages[0].strokes.at(-1), xs = s1.pts.filter((_, i) => i % 3 === 0), ys = s1.pts.filter((_, i) => i % 3 === 1);
    const wdt = Math.max(...xs) - Math.min(...xs), hgt = Math.max(...ys) - Math.min(...ys);
    $$('.lasso-menu button').find((x) => x.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    undo(); await settle();
    const back = P.note.pages[0].strokes.at(-1) === s0;
    undo(); await settle();
    if (!(hgt > 90 && wdt < 3)) return '세로로 딱 안 돌아갔어요 ' + [wdt.toFixed(1), hgt.toFixed(1)];
    return back || '되돌리기가 안 돼요';
  });

  await check('구절 고르기: 9→10→11 누적', async () => {
    for (const n of [9, 10, 11]) { $(`.verse[data-n="${n}"]`)?.click(); await settle(); }
    const sel = $$('.verse.sel').map((v) => +v.dataset.n);
    return (sel.join() === '9,10,11') || '고른 절: ' + sel.join();
  });
  await check('구절 고르기·풀기가 가벼움: 목록을 다시 만들지 않고 스크롤 자리 그대로', async () => {
    const body = $('.bp-body'), v12 = $('.verse[data-n="12"]');
    body.scrollTop = 120; await wait(50);
    const st = body.scrollTop, t0 = performance.now();
    v12.click(); v12.click();
    const ms = performance.now() - t0;
    if ($('.verse[data-n="12"]') !== v12) return '고를 때마다 목록을 통째로 다시 만들어요';
    if (body.scrollTop !== st) return '스크롤 자리가 바뀌어요';
    if (v12.classList.contains('sel')) return '다시 눌러도 안 풀려요';
    return ms < 30 || '고르기가 무거워요 ' + Math.round(ms) + 'ms';
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

  await check("올가미로 인용 위 글씨를 고른 뒤 '글씨만' → 글씨만 옮겨지고 인용은 그대로 · '인용 포함'으로 되돌리기", async () => {
    se.scrollTop = 0; await wait(100);
    const P = window.__lumenibPaper, cb = $('.cite-block'), pr = $$('.page')[0].getBoundingClientRect(), top = cb.getBoundingClientRect().top - pr.top;
    tool('pen'); await settle();
    stroke(line(120, top + 30, 220, top + 30)); await settle();
    const s0 = P.note.pages[0].strokes.at(-1), y0 = s0.pts[1];
    tool('lasso'); await settle();
    stroke(box(105, top + 18, 235, top + 42)); await settle();
    const btn = () => $$('.lasso-menu button').find((b) => b.dataset.a === 'only');
    if (!P.selection?.cites?.size) { undo(); await settle(); return '인용이 같이 안 골라짐'; }
    if (!btn() || btn().textContent !== '글씨만') { undo(); await settle(); return "'글씨만' 버튼이 없어요"; }
    btn().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    if (P.selection.cites.size || !btn() || btn().textContent !== '인용 포함') { undo(); await settle(); return "'글씨만'으로 안 바뀌어요"; }
    btn().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    if (!P.selection.cites.size) { undo(); await settle(); return "'인용 포함'으로 안 돌아가요"; }
    btn().dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    const c = base(), r = c.getBoundingClientRect(), ct0 = cb.getBoundingClientRect().top;
    pe(c, 'pointerdown', r.left + 170, r.top + top + 30); pe(c, 'pointermove', r.left + 170, r.top + top + 90); pe(c, 'pointerup', r.left + 170, r.top + top + 90); await settle();
    const moved = P.note.pages[0].strokes.find((q) => q.t === s0.t && q.pts.length === s0.pts.length);
    const citeMoved = Math.abs(cb.getBoundingClientRect().top - ct0) > 1;
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    undo(); await settle(); undo(); await settle();
    if (citeMoved) return '인용도 같이 움직였어요';
    return (moved && moved.pts[1] - y0 > 20) || '글씨가 안 움직였어요';
  });

  await check('올가미로 고른 인용: 메뉴는 보이는 화면 안 · 폭 줄이면 테두리도 따라옴 · 종이 밖으로 끌면 글씨·인용·테두리가 같이 종이 안에 멈춤', async () => {
    se.scrollTop = 0; await wait(100);
    const P = window.__lumenibPaper, cb = $('.cite-block'), pr = $$('.page')[0].getBoundingClientRect(), top = cb.getBoundingClientRect().top - pr.top;
    const k = pr.width / 726;
    tool('pen'); await settle();
    stroke(line(120, top + 30, 220, top + 30)); await settle();
    const t0 = P.note.pages[0].strokes.at(-1).t;
    tool('lasso'); await settle();
    stroke(box(105, top + 18, 235, top + 42)); await settle();
    const done = async (msg) => { $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle(); P.undo(); await settle(); P.undo(); await settle(); P.undo(); await settle(); return msg; };
    if (!P.selection?.cites?.size) return done('인용이 안 골라짐');
    // 1) 선택 영역 위가 화면 밖이어도 메뉴는 화면 안
    const sv = P.scrollEl; sv.scrollTop += (cb.getBoundingClientRect().top - sv.getBoundingClientRect().top) + 40; sv.dispatchEvent(new Event('scroll')); /* 숨은 창에선 스크롤 알림이 늦게 와서 바로 보내요 */ await settle();
    const mr = $('.lasso-menu').getBoundingClientRect(), vr = sv.getBoundingClientRect();
    const menuOk = mr.top >= vr.top - 1 && mr.bottom <= vr.bottom + 1;
    sv.scrollTop = 0; se.scrollTop = 0; await settle();
    if (!menuOk) return done('메뉴가 보이는 화면 밖에 있어요 ' + [mr.top, mr.bottom, vr.top, vr.bottom].map(Math.round));
    // 2) 폭 줄이면 선택 테두리도 따라와요
    const rs = $$('.page')[0].querySelector('.cite-rs'), rr = rs.getBoundingClientRect(), right0 = P.selection.box[2];
    const ev = (t, x) => rs.dispatchEvent(new PointerEvent(t, { clientX: x, clientY: rr.top + 10, pointerId: 931, pointerType: 'mouse', bubbles: true, cancelable: true, button: 0, buttons: t === 'pointerup' ? 0 : 1 }));
    ev('pointerdown', rr.left + 10); ev('pointermove', rr.left + 10 - 120 * k); ev('pointerup', rr.left + 10 - 120 * k); await settle();
    if (Math.abs(P.selection.box[2] - (right0 - 120)) > 4) return done('폭을 줄여도 선택 테두리가 그대로예요 ' + Math.round(right0) + '→' + Math.round(P.selection.box[2]));
    // 3) 오른쪽으로 종이 밖까지 끌어도 종이 안에 멈추고, 인용과 그 안 글씨가 어긋나지 않아요
    const c = base(), r = c.getBoundingClientRect();
    const cx0 = cb.getBoundingClientRect().left, sx0 = P.note.pages[0].strokes.find((q) => q.t === t0).pts[0];
    pe(c, 'pointerdown', r.left + 170 * k, r.top + top + 30); pe(c, 'pointermove', r.left + 170 * k + 900, r.top + top + 30); pe(c, 'pointerup', r.left + 170 * k + 900, r.top + top + 30); await settle();
    const dCite = ($('.cite-block').getBoundingClientRect().left - cx0) / k /* 놓으면 인용을 다시 그려서 새로 찾아요 */, sNow = P.note.pages[0].strokes.find((q) => q.t === t0);
    const dInk = sNow ? sNow.pts[0] - sx0 : NaN, bx = P.selection?.box;
    if (Math.abs(dCite - dInk) > 2) return done('인용과 글씨가 어긋났어요 ' + Math.round(dCite) + ' / ' + Math.round(dInk));
    if (!bx || bx[2] > 726 - 20 + 1) return done('선택 테두리가 종이 밖이에요');
    return done(true);
  });

  await check('올가미로 인용 두 개 옮기기 · 되돌리기 (가볍게) · 크기 조절 손잡이도 같이', async () => {
    se.scrollTop = 0; await wait(100);
    $('.verse[data-n="20"]')?.click(); await wait(300);
    $$('.bp-action button').find((b) => /인용으로|노트에 넣기/.test(b.textContent))?.click(); await settle();
    const blocks = $$('.page')[0].querySelectorAll('.cite-block');
    if (blocks.length < 2) return '인용이 2개가 아님 ' + blocks.length;
    const [b1, b2] = [...blocks].map((b) => b.getBoundingClientRect());
    if (b1.bottom > b2.top && b2.bottom > b1.top) return '새 인용이 기존 인용과 겹쳐서 들어감';
    const pr = $$('.page')[0].getBoundingClientRect();
    const tops = () => [...$$('.page')[0].querySelectorAll('.cite-block')].map((b) => Math.round(b.getBoundingClientRect().top - pr.top));
    const t0 = tops(), y0 = Math.min(...t0) - 10, y1 = Math.max(...t0) + 40;
    tool('lasso'); await settle();
    stroke(box(480, y0, 560, y1)); await settle();
    if (!$('.lasso-menu')) return '두 인용이 안 골라짐';
    const c = base(), r = c.getBoundingClientRect();
    const t1 = performance.now();
    pe(c, 'pointerdown', r.left + 520, r.top + y0 + 20); pe(c, 'pointermove', r.left + 520, r.top + y0 + 80);
    const rsLeft = [...$$('.page')[0].querySelectorAll('.cite-rs')].some((el) => el.style.visibility !== 'hidden'); // 옮기는 동안 크기 조절 손잡이가 원래 자리에 남으면 안 돼요
    pe(c, 'pointerup', r.left + 520, r.top + y0 + 80);
    const cost = performance.now() - t1; await settle();
    if (rsLeft) return '옮기는 동안 크기 조절 손잡이가 원래 자리에 남아 있어요';
    const moved = tops();
    $$('.lasso-menu button').find((b) => b.textContent.includes('해제'))?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 })); await settle();
    undo(); await settle();
    const back = tops();
    if (moved.join() === t0.join()) return '안 움직임';
    if (back.join() !== t0.join()) return '되돌리기 후 자리 다름 ' + [t0, back];
    return cost < 60 || '손 뗄 때 처리가 무거움 ' + Math.round(cost) + 'ms';
  });
  await check('겹친 인용: 아래 인용의 아이콘이 위 인용을 뚫고 안 보임 · 마지막에 만진 인용이 위로 · 글씨는 쓴 인용과 한 묶음', async () => {
    const P = window.__lumenibPaper, pg = P.pages[0];
    const cs = P.note.citations.filter((c) => c.page === 0);
    if (cs.length < 2) return '인용이 2개가 아님';
    const [a, b] = cs, keep = cs.map((c) => [c, c.y, c.z]);
    const restore = async () => { for (const [c, y, z] of keep) { c.y = y; if (z == null) delete c.z; else c.z = z; } P.renderCitations(pg); await settle(); };
    // b(나중 것)를 a 위에 살짝 겹쳐 놓으면: b가 위, a의 오른쪽 위 아이콘은 b에 덮여 숨김
    b.y = a.y + 12; delete a.z; delete b.z; P.renderCitations(pg); await settle();
    const ui = (c) => [...pg.ui.querySelectorAll('.cite-ui')].find((u) => Math.abs(parseFloat(u.style.top) - c.y) < 1);
    const order = () => [...pg.inner.querySelectorAll('.cite-block')].map((el) => Math.round(parseFloat(el.style.top)));
    if (!ui(a)?.classList.contains('covered')) { await restore(); return '아래 인용의 아이콘이 위 인용 위로 보여요'; }
    if (ui(b)?.classList.contains('covered')) { await restore(); return '위 인용의 아이콘이 숨겨졌어요'; }
    // a를 만지면(올가미·손잡이) a가 위로 올라오고 아이콘도 다시 보여요
    // 겹친 곳에 쓴 글씨는 그때 위에 있던 b의 묶음: a를 위로 올리거나 옮겨도 a를 따라가지 않아요
    const k = pg.el.getBoundingClientRect().width / 726, bb = P.citeBox(b);
    tool('pen'); await settle();
    stroke(line(bb[0] + 400, bb[1] + 20, bb[0] + 500, bb[1] + 20).map(([x, y]) => [x * k, y * k])); await settle();
    const st = P.note.pages[0].strokes.at(-1);
    const inA0 = P.strokesInCite(0, a).has(st), inB0 = P.strokesInCite(0, b).has(st);
    P.raiseCite(pg, a); await settle();
    const top = order().at(-1);
    const ok = top === Math.round(a.y) && !ui(a).classList.contains('covered') && ui(b).classList.contains('covered');
    const inA1 = P.strokesInCite(0, a).has(st), inB1 = P.strokesInCite(0, b).has(st);
    // a가 위로 오면 b 묶음 글씨는 a 자리에서 안 보여요
    const cv = ink(), rr = cv.width / 726, alpha = (x, y) => cv.getContext('2d').getImageData(Math.round(x * rr), Math.round(y * rr), 1, 1).data[3];
    const hiddenUnderA = alpha(bb[0] + 450, bb[1] + 20) === 0 /* 앞 점검이 남긴 글씨와 안 겹치는 오른쪽 */;
    undo(); await settle();
    await restore();
    if (!inB0 || inA0) return '겹친 곳에 쓴 글씨가 위 인용 묶음이 아니에요';
    if (!inB1 || inA1) return '아래 인용을 위로 올리니 글씨 묶음이 바뀌었어요';
    if (!hiddenUnderA) return '위 인용 자리에 아래 인용의 글씨가 보여요';
    return ok || '만진 인용이 위로 안 올라와요 ' + order();
  });

  await check('지우개: 지운 자리만 다시 그려도 지운 획은 사라지고 옆 획은 그대로 · 형광펜 손떨림 보정 값이 획에 저장', async () => {
    const P = window.__lumenibPaper, pg = P.pages[0], c = base(), r = c.getBoundingClientRect(), k = r.width / 726;
    tool('pen'); await settle();
    stroke(line(80 * k, 900 * k, 180 * k, 900 * k)); await settle();
    stroke(line(80 * k, 950 * k, 180 * k, 950 * k)); await settle();
    const cv = ink(), rr = cv.width / 726, alpha = (x, y) => { let m = 0; for (let d = -2; d <= 2; d++) m = Math.max(m, cv.getContext('2d').getImageData(Math.round(x * rr), Math.round((y + d) * rr), 1, 1).data[3]); return m; };
    tool('eraser'); await settle();
    pe(c, 'pointerdown', r.left + 130 * k, r.top + 900 * k); pe(c, 'pointermove', r.left + 132 * k, r.top + 900 * k); pe(c, 'pointerup', r.left + 132 * k, r.top + 900 * k); await settle();
    const gone = alpha(100, 900) === 0, kept = alpha(100, 950) > 0;
    undo(); await settle(); undo(); await settle(); undo(); await settle();
    if (!gone) return '지운 획이 남아 있어요';
    if (!kept) return '옆 획까지 지워졌어요';
    // 형광펜 손떨림 보정: 설정 값이 새 획에 들어가요
    const S0 = (await import('../js/store.js')).settings, keep = S0.hlStab;
    S0.hlStab = 80; tool('hl'); await settle();
    stroke(line(80 * k, 1000 * k, 180 * k, 1000 * k)); await settle();
    const hs = P.note.pages[0].strokes.at(-1);
    undo(); await settle(); S0.hlStab = keep;
    if (!(hs?.tool === 'hl' && hs.st === 80)) return '형광펜 획에 보정 값이 없어요 ' + hs?.st;
    // 펜슬처럼 촘촘하고 떨리는 점: 보정 0과 100의 모양 차이가 확실해야 해요 (점마다 다듬던 땐 거의 같았어요)
    const { hlSmoothPath } = await import('../js/ink.js');
    // 1) 펜슬의 잔떨림(점마다 ±1): 0%에서도 테두리가 매끈해야 해요
    const jit = []; for (let i = 0; i < 400; i++) jit.push(100 + i * 0.5, 300 + (i % 2 ? 1 : -1), 0.5);
    const wig = (q) => { let m = 0, n = 0; for (let i = (q.length >> 2) * 2; i < q.length - 2; i += 2) { m += Math.abs(q[i + 1] - 300); n++; } return m / n; }; // 뒤쪽 절반의 평균 흔들림
    const e0 = wig(hlSmoothPath(jit, { st: 0 }));
    if (e0 > 0.3) return '보정 0%에서 형광펜 테두리가 지글거려요 ' + e0.toFixed(2);
    // 2) 손의 큰 흔들림(물결): 올릴수록 확실히 펴져요 (펜 손떨림 보정처럼)
    const wav = []; for (let i = 0; i < 400; i++) wav.push(100 + i * 0.5, 300 + Math.sin(i * 0.5 * 2 * Math.PI / 30) * 4, 0.5);
    const w0 = wig(hlSmoothPath(wav, { st: 0 })), w100 = wig(hlSmoothPath(wav, { st: 100 }));
    return (w100 < w0 * 0.4) || '형광펜 손떨림 보정을 올려도 흐름이 안 펴져요 ' + [w0.toFixed(2), w100.toFixed(2)];
  });

  await check('펜 획 끝: 멈출 때 몰린 점·살짝 되돌아온 점 정리 (세로 획 끝이 뭉치던 것)', async () => {
    const { cleanPenEndForTest: f } = await import('../js/ink.js');
    const pts = []; let y = 0;
    for (let i = 0; i < 40; i++) { y += 2; pts.push([0, y, 0.5]); }
    for (let i = 0; i < 20; i++) pts.push([0.01 * (i % 2), y + 0.01 * i, 0.5]); // 멈추며 몰린 점
    for (let i = 1; i <= 4; i++) pts.push([0.2 * i, y - 0.5 * i, 0.5 - 0.1 * i]); // 끝에서 살짝 되돌아옴 (펜을 들며 힘이 빠짐)
    const out = f(pts), last = out.at(-1);
    if (out.length > 45) return '몰린 점이 안 정리돼요 ' + out.length;
    if (last[1] < y - 0.3) return '되돌아온 끝이 남아 있어요 ' + last[1].toFixed(2);
    // 옆으로 살짝 꺾이며 뗀 끝도 빼요
    const side = pts.slice(0, 40).concat([1, 2, 3, 4].map((i) => [0.55 * i, 80 + 0.05 * i, 0.5 - 0.1 * i]));
    const o2 = f(side).at(-1);
    if (o2[0] >= 0.3) return '옆으로 꺾인 끝이 남아 있어요 ' + o2[0].toFixed(2);
    // 힘을 준 채 작게 도는 원의 끝은 자르지 않아요 (작은 원에서 끝이 버벅이던 것)
    const circ = []; for (let i = 0; i <= 60; i++) { const a = i / 20 * Math.PI * 2; circ.push([4 * Math.cos(a), 4 * Math.sin(a), 0.5]); }
    const oc = f(circ), lc = oc.at(-1), ec = circ.at(-1);
    return Math.hypot(lc[0] - ec[0], lc[1] - ec[1]) < 0.5 || '작은 원의 끝이 잘려요';
  });

  await check('형광펜이 급히 되돌아 꺾여도 안쪽에 흰 틈이 없음', async () => {
    const P = window.__lumenibPaper, pg = P.pages[0], arr = P.note.pages[0].strokes;
    // 오른쪽으로 가다 굵기보다 좁게 U턴해서 돌아오는 형광펜
    const pts = [];
    for (let i = 0; i <= 60; i++) pts.push(200 + i, 950, 0.5);
    for (let i = 0; i <= 12; i++) { const a = -Math.PI / 2 + Math.PI * i / 12; pts.push(260 + Math.cos(a) * 4, 954 + Math.sin(a) * 4, 0.5); }
    for (let i = 0; i <= 60; i++) pts.push(260 - i, 958, 0.5);
    const hs = { tool: 'hl', color: '#7ccfa0', w: 18, a: 0.42, st: 0, pts, t: Date.now() };
    arr.push(hs); P.drawPage(pg);
    const cv = pg.base, rr = cv.width / 726, ctx = cv.getContext('2d');
    let minA = 255;
    for (let x = 215; x <= 255; x += 2) for (let y = 950; y <= 958; y += 1) { const a = ctx.getImageData(Math.round(x * rr), Math.round(y * rr), 1, 1).data[3]; if (a < minA) minA = a; }
    arr.splice(arr.indexOf(hs), 1); P.drawPage(pg);
    if (minA <= 40) return '꺾인 안쪽에 흰 틈이 있어요 ' + minA;
    // 펜을 떼며 끝이 짧게 꺾인 형광펜: 그 꺾인 조각은 빼요 (끝 뭉침)
    const { hlSmoothPath } = await import('../js/ink.js');
    const hp = []; for (let i = 0; i <= 80; i++) hp.push(100 + i, 300, 0.5);
    for (let i = 1; i <= 8; i++) hp.push(180 - i * 0.3, 300 + i, 0.5); // 끝에서 아래로 8 꺾임 (굵기 18의 0.7배 안)
    const q = hlSmoothPath(hp, { st: 0, w: 18 }), ly = q[q.length - 1];
    return ly < 302 || '끝에서 꺾인 조각이 남아 있어요 ' + ly.toFixed(1);
  });

  await check('글씨 많은 장: 지우개가 가볍고 · 인용 옮기는 동안 아래 인용 글씨 가림', async () => {
    const P = window.__lumenibPaper, pg = P.pages[0], arr = P.note.pages[0].strokes, n0 = arr.length;
    // 글씨 400획을 아래쪽에 채워요
    for (let i = 0; i < 400; i++) { const x = 40 + (i % 20) * 32, y = 700 + Math.floor(i / 20) * 14, pts = []; for (let j = 0; j < 20; j++) pts.push(x + j, y + Math.sin(j) * 3, 0.5); arr.push({ tool: 'pen', color: '#111', w: 2, pts, t: 1 }); }
    P.drawPage(pg);
    tool('eraser'); await settle();
    const c = base(), r = c.getBoundingClientRect(), k = r.width / 726;
    const t0 = performance.now();
    pe(c, 'pointerdown', r.left + 300 * k, r.top + 640 * k);
    for (let i = 0; i < 30; i++) pe(c, 'pointermove', r.left + (300 + i * 4) * k, r.top + 640 * k);
    pe(c, 'pointerup', r.left + 420 * k, r.top + 640 * k);
    const eraseMs = (performance.now() - t0) / 30;
    arr.splice(n0); P.drawPage(pg); await settle();
    if (eraseMs > 8) return '글씨 많은 장에서 지우개가 무거워요 ' + eraseMs.toFixed(1) + 'ms';
    // 인용을 끄는 동안 글씨 판에 그 인용 자리만큼 구멍이 나고, 놓으면 없어져요
    const grip = pg.ui.querySelector('.cite-grip');
    if (!grip) return '인용 손잡이 없음';
    const gg = grip.getBoundingClientRect();
    pe(grip, 'pointerdown', gg.left + 5, gg.top + 5, 981); pe(window, 'pointermove', gg.left + 5, gg.top + 45, 981);
    const during = pg.ink.style.clipPath;
    pe(window, 'pointerup', gg.left + 5, gg.top + 45, 981); await settle();
    const after = pg.ink.style.clipPath;
    undo(); await settle();
    if (!during || !during.includes('evenodd')) return '끄는 동안 아래 글씨가 비쳐요';
    if (after) return '놓은 뒤에도 구멍이 남아요';
    // 겹친 인용: 끄는 인용은 원래 자리 가림에서 빠지고(따라다니는 구멍이 대신), 놓으면 다시 재요 (11/25)
    const order = [...pg.inner.querySelectorAll('.cite-block')].map((el) => P.note.citations.find((q) => q.page === 0 && P.citeBox(q) && Math.abs(P.citeBox(q)[1] - parseFloat(el.style.top)) < 1));
    if (order.length >= 2 && order[0] && order.at(-1)) {
      const a1 = order[0], b1 = order.at(-1), y0 = b1.y, x0 = b1.x; // b1 = 맨 위 인용
      b1.y = a1.y; b1.x = a1.x;
      const count = () => { pg._coverCache = null; return [...P.citeCoverBoxes(pg).values()].flat().length; };
      const full = count();
      P._coverSkip = b1; const skip = count(); P._coverSkip = null;
      b1.y = y0; b1.x = x0; P.updateCiteCover(pg); P.drawPage(pg);
      if (full && skip >= full) return '끄는 인용이 원래 자리에서 아래 글씨를 계속 가려요 ' + [full, skip];
    }
    return true;
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
  await check('인용 상자 너비 조절 · 가로로도 옮기기 · 되돌리기', async () => {
    se.scrollTop = 0; await wait(100);
    const cb = $('.cite-block'), rs = $('.cite-rs');
    if (!cb || !rs) return '손잡이 없음';
    const w0 = cb.getBoundingClientRect().width, g = rs.getBoundingClientRect();
    pe(rs, 'pointerdown', g.left + 10, g.top + 10, 970); pe(rs, 'pointermove', g.left - 150, g.top + 10, 970); pe(rs, 'pointerup', g.left - 150, g.top + 10, 970); await settle();
    const w1 = cb.getBoundingClientRect().width;
    if (w1 > w0 - 100) return '너비가 안 줄었어요 ' + [w0, w1];
    // 좁힌 상자를 손잡이로 오른쪽 아래로 옮기기 (가로로도 자유롭게)
    // 만진 인용은 맨 위로 올라가서 순서가 바뀌어요: 좁힌 상자를 너비로 찾아요
    const narrow = () => [...$$('.cite-block')].find((b) => Math.abs(b.getBoundingClientRect().width - w1) < 2);
    const grip = $('.cite-grip'), gg = grip.getBoundingClientRect(), l0 = narrow().getBoundingClientRect().left;
    pe(grip, 'pointerdown', gg.left + 5, gg.top + 5, 971); pe(window, 'pointermove', gg.left + 105, gg.top + 25, 971); pe(window, 'pointerup', gg.left + 105, gg.top + 25, 971); await settle();
    const l1 = narrow()?.getBoundingClientRect().left ?? l0;
    if (l1 < l0 + 50) return '가로로 안 움직여요 ' + [l0, l1];
    undo(); await settle();
    if (Math.abs(narrow()?.getBoundingClientRect().left - l0) > 2) return '가로 이동 되돌리기 안 됨';
    undo(); await settle();
    const w2 = narrow() ? w1 : w0;
    return Math.abs(w2 - w0) < 2 || '되돌리기 안 됨 ' + [w0, w2];
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

  await check('홈 최근 노트: 설교 날짜가 예전이어도 방금 쓴 내 노트가 보임', async () => {
    const n = S.newNote({ date: '2020-01-05', title: '점검 옛 날짜 노트', passages: [] });
    window.__lumenibGo?.('home'); await wait(800);
    return !!$(`.recent-card[data-note="${n.id}"]`) || '홈 최근 노트에 안 보여요';
  });

  await check('노트 목록: 날짜별·본문별·정렬·검색·선택 삭제와 되돌리기·노트 없음 (T8)', async () => {
    // 점검용 노트 (예시 노트는 앱에서 뺐어요): 시편 2개, 로마서 1개
    S.newNote({ date: '2026-11-15', title: '점검 시편 1', preacher: '점검', passages: [{ book: 19, ch: 118, from: 1, to: 4 }] });
    S.newNote({ date: '2025-03-02', title: '점검 시편 2', passages: [{ book: 19, ch: 118, from: 5, to: 9 }] });
    S.newNote({ date: '2026-10-25', title: '점검 로마서', passages: [{ book: 45, ch: 8, from: 35, to: 37 }] });
    window.__lumenibGo?.('notes'); await wait(500);
    $('[data-view="date"]')?.click(); await wait(150); // 마지막 보기를 기억하니 날짜별로 맞춰요
    const total = S.allNotes().length;
    if ($$('.nl-card').length !== total) return '카드 수가 노트 수와 달라요 ' + [$$('.nl-card').length, total];
    if ($('.nl-count')?.textContent !== String(total)) return '제목 옆 개수가 달라요';
    if (!/^\d{4}년 \d{1,2}월\d+$/.test($('.nl-gh')?.textContent || '')) return '날짜별 묶음 제목이 달라요 ' + $('.nl-gh')?.textContent;
    $('[data-view="passage"]').click(); await wait(200);
    if (!$$('.nl-gh').some((h) => /장|편/.test(h.textContent))) return '본문별 묶음이 안 보여요';
    $('[data-act="sort"]').click(); await wait(150);
    if ($$('.nl-mi').length !== 3) return '본문별 정렬 메뉴가 3개가 아니에요';
    $$('.nl-mi')[2].click(); await wait(150);
    const heads = $$('.nl-gh').filter((h) => !h.textContent.startsWith('본문 없음'));
    const counts = heads.map((h) => +h.querySelector('span').textContent);
    if (counts.some((c, i) => i && c > counts[i - 1])) return '노트 많은 순이 아니에요 ' + counts;
    $('[data-view="date"]').click(); await wait(150);
    // 검색 (11/26 피그마 T8.노트 검색): 위 검색 아이콘 → 검색 화면(검색창 + 취소) → 결과 · 최근 검색 → 취소하면 목록
    if ($('.nl-head .nl-search')) return '목록 머리에 예전 검색창이 남아 있어요';
    const sb = $('.home-nav [data-act="search"]'); if (!sb) return '위에 검색 아이콘이 없어요';
    const w = $('.home-nav [data-act="write-note"]').getBoundingClientRect(), g = $('.home-nav [data-act="settings"]').getBoundingClientRect(), sr = sb.getBoundingClientRect();
    if (!(w.right <= sr.left && sr.right <= g.left) || Math.round(g.left - sr.right) !== 4) return '검색 아이콘 자리가 노트 쓰기와 설정 사이가 아니에요';
    const rs0 = localStorage.getItem('lumenib.recentSearch.notes');
    localStorage.setItem('lumenib.recentSearch.notes', '[]');
    sb.click(); await wait(200);
    if (!$('.ns-bar .nl-search') || !$('[data-act="search-cancel"]')) return '검색 화면(검색창 + 취소)이 안 열려요';
    const inp = $('.ns-bar input'); inp.value = 'zzzz없는말'; inp.dispatchEvent(new Event('input')); await wait(150);
    if (!$('.nl-empty')) return '검색 결과 없음 문구가 안 보여요';
    const t0 = S.allNotes().find((x) => x.title)?.title;
    if (t0) {
      inp.value = t0; inp.dispatchEvent(new Event('input')); await wait(150);
      if (!/^노트\d+$/.test($('.ns-list .nl-gh')?.textContent || '') || !$$('.ns-list .nl-card').length) return '검색 결과 "노트 N" 묶음이 달라요';
      inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await wait(50);
      inp.value = ''; inp.dispatchEvent(new Event('input')); await wait(150);
      if (!$$('.ns-ritem').some((b) => b.textContent === t0)) return '최근 검색에 안 남아요';
      $('[data-act="recent-clear"]').click(); await wait(100);
      if ($('.ns-ritem')) return '모두 지우기가 안 돼요';
    }
    if (rs0 !== null) localStorage.setItem('lumenib.recentSearch.notes', rs0);
    $('[data-act="search-cancel"]').click(); await wait(200);
    if (!$('.nl-head') || $$('.nl-card').length !== total) return '취소하면 원래 목록으로 안 돌아가요';
    // 세그먼트 색 = 피그마 bg/segmented · 고른 칸 bg/default
    const cs = getComputedStyle(document.documentElement);
    const rgb = (v) => { const d = document.createElement('i'); d.style.color = v; document.body.appendChild(d); const c = getComputedStyle(d).color; d.remove(); return c; };
    if (getComputedStyle($('.nl-seg')).backgroundColor !== rgb(cs.getPropertyValue('--bg-segmented'))) return '세그먼트 바탕이 bg/segmented가 아니에요';
    if (getComputedStyle($('.nl-seg button.on')).backgroundColor !== rgb(cs.getPropertyValue('--bg-default'))) return '고른 칸이 bg/default가 아니에요';
    $('[data-act="select"]').click(); await wait(150);
    $$('.nl-card')[0].click(); await wait(100);
    if ($('.nl-title').textContent !== '1개 선택됨') return '선택 모드 제목이 달라요';
    if (!$('.nl-seg.off')) return '선택 중 날짜별/본문별이 흐리지 않아요';
    $('[data-act="del"]').click(); await wait(200);
    if (S.allNotes().length !== total - 1) return '삭제가 안 됐어요';
    const undoBtn = $('#toast button'); if (!undoBtn) return '되돌리기 토스트가 없어요';
    undoBtn.click(); await wait(200);
    if (S.allNotes().length !== total) return '되돌리기가 안 됐어요';
    return $$('.nl-card').length === total || '되돌린 뒤 카드 수가 달라요';
  });

  await check('성경 탭(T9): 장 열기 · 다 읽었어요/되돌리기 · 권 완독 · 이전/다음 끝 장 · 구절 선택 · 권 목록 · 읽기 기록 초기화', async () => {
    const W = wait;
    const read0 = JSON.stringify(Object.fromEntries([...Array(17)].map((_, c) => [c, S.isRead(57, c)]))); // 빌레몬서(1장)와 디도서(3장)로 점검
    const loc0 = S.settings.bibleLoc;
    S.resetBookReading(56); S.resetBookReading(57);
    window.__lumenibGo?.('bible', { book: 56, ch: 1 }); await W(800);
    if (!$('.bt-chip.cur') || $('.bt-htitle')?.textContent.trim() !== '디도서 1장') return '장이 안 열려요 ' + $('.bt-htitle')?.textContent;
    $('[data-a="read"]').click(); await W(200);
    if (!S.isRead(56, 1)) return '다 읽었어요가 저장 안 돼요';
    if (!$('.bt-chip.cur.read')) return '장 칩이 읽음으로 안 바뀌어요';
    if (!/다 읽은 장이에요/.test($('.bt-mid').textContent)) return '방금 읽은 상태가 안 보여요';
    $('#toast button')?.click(); await W(200);
    if (S.isRead(56, 1)) return '되돌리기가 안 돼요';
    // 권 완독: 빌레몬서 1장
    window.__lumenibGo?.('bible', { book: 57, ch: 1 }); await W(700);
    $('[data-a="read"]').click(); await W(200);
    if (!/빌레몬서를 다 읽었어요/.test($('.bt-mid').textContent)) return '권 완독 문구가 안 보여요 ' + $('.bt-mid').textContent;
    if ($('.bt-sum span').textContent !== '다 읽은 권이에요') return '왼쪽 문구가 다 읽은 권이 아니에요';
    if (!$$('.bt-nav > button').some((b) => /히브리서 1장/.test(b.textContent))) return '권 마지막 장의 다음 버튼이 다음 권 이름이 아니에요';
    // 끝 장: 창세기 1장엔 이전 없음, 계 22장엔 다음 없음, 시편은 편
    window.__lumenibGo?.('bible', { book: 1, ch: 1 }); await W(700);
    if ($$('.bt-nav > button').length !== 1) return '창세기 1장에 이전 장이 있어요';
    window.__lumenibGo?.('bible', { book: 19, ch: 23 }); await W(700);
    if (!/시편 23편/.test($('.bt-htitle').textContent)) return '시편이 편으로 안 보여요';
    // 구절 선택 → 머리줄
    $('.bt-v[data-n="1"]').click(); await W(80); $('.bt-v[data-n="3"]').click(); await W(80);
    if (!/시편 23:1-3/.test($('.bt-htitle').textContent) || !$('[data-a="write"]')) return '구절 선택 머리줄이 달라요 ' + $('.bt-htitle').textContent;
    $('[data-a="x"]').click(); await W(150);
    if ($('.bt-v.sel')) return '선택 취소가 안 돼요';
    // 권 목록 · 검색 바로 가기
    $('.bt-dd').click(); await W(200);
    if ($$('.bt-book').length !== 66) return '권 목록이 66권이 아니에요';
    const inp = $('.bt-search input'); inp.value = '고후 4:17'; inp.dispatchEvent(new Event('input')); await W(100);
    inp.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' })); await W(700);
    if (!/고린도후서 4장/.test($('.bt-htitle').textContent)) return '검색으로 바로 이동이 안 돼요 ' + $('.bt-htitle').textContent;
    // 읽기 기록 지우기는 설정에서만 (11/26): 장 패널엔 초기화 버튼이 없어요
    window.__lumenibGo?.('bible', { book: 57, ch: 1 }); await W(700);
    if ($('.bt-left [data-act="reset"]') || /초기화/.test($('.bt-left').textContent)) return '장 패널에 읽기 기록 초기화가 남아 있어요';
    window.__lumenibGo?.('settings', { page: 'reading' }); await W(300);
    if (!$('[data-act="reset-all"]') || !$('[data-act="go-books"]')) return '설정 > 읽기 기록에 지우기가 없어요';
    window.__lumenibGo?.('bible', { book: 57, ch: 1 }); await W(500);
    S.resetBookReading(57);
    S.settings.bibleLoc = loc0; S.saveSettings();
    window.__lumenibGo?.('home'); await W(300);
    return true;
  });

  await check('읽기 기록·북마크 계정 합치기: 더 나중에 바꾼 쪽이 이기고, 다른 기기 기록이 들어옴', async () => {
    const before = S.bibleLogSnapshot();
    const now = Date.now();
    S.setRead(64, 1, true); // 요한3서 1장: 이 기기에서 읽음
    const remote = { r: { '64:1': [0, now - 100000], '63:1': [1, now + 1000] }, b: { '63:1:1-2': [1, now + 1000] } };
    const res = S.mergeBibleLog(remote);
    const ok1 = S.isRead(64, 1) && S.isRead(63, 1) && !!S.findBookmark({ book: 63, ch: 1, from: 1, to: 2 });
    // 서버 쪽이 더 나중에 "안 읽음"으로 바꿨으면 따라가요
    S.mergeBibleLog({ r: { '64:1': [0, now + 5000] }, b: {} });
    const ok2 = !S.isRead(64, 1);
    // 되돌려 놓기
    S.setRead(63, 1, false); S.removeBookmark({ book: 63, ch: 1, from: 1, to: 2 });
    S.mergeBibleLog(before);
    if (!res.needUpload) return '기기 쪽 새 기록을 올려야 한다고 못 알아채요';
    return (ok1 && ok2) || '합치기가 달라요 ' + [ok1, ok2];
  });

  await check('성경 탭 11/26: 처음엔 왼쪽 권 목록 · 복사가 실제로 들어감 · 노트 쓰기에서 뒤로 가면 성경 · 다음 버튼 그대로 · 내비 높이 같음', async () => {
    const W = wait, loc0 = S.settings.bibleLoc;
    S.settings.bibleLoc = undefined; S.saveSettings();
    window.__lumenibGo?.('bible'); await W(700);
    if (!$('.bt-book') || !/창세기 1장/.test($('.bt-htitle')?.textContent)) return '처음 들어왔을 때 왼쪽 권 목록 + 창세기 1장이 아니에요';
    if ($('.bt-book.cur')) return '처음 들어왔는데 권 목록에 표시가 있어요';
    // 복사: 복사 순간에 넣는 글이 고른 구절이어야 해요
    window.__lumenibGo?.('bible', { book: 43, ch: 3 }); await W(700);
    // 점검에서 누르는 건 진짜 손가락이 아니라 브라우저가 복사를 안 해 줘요. 복사 명령을 브라우저처럼 흉내 내서, 넣는 글을 봐요
    let got = null; const ex = document.execCommand;
    document.execCommand = function (c, ...a) {
      if (c !== 'copy') return ex.call(document, c, ...a);
      const dt = new DataTransfer(); document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, bubbles: true, cancelable: true }));
      got = dt.getData('text/plain'); return true;
    };
    $('.bt-v[data-n="16"]').click(); await W(80); $('[data-a="copy"]').click(); await W(150);
    document.execCommand = ex;
    if (!got || !/^요한복음 3:16\n\n16\. 하나님이 세상을/.test(got)) return '복사한 글이 "출처, 빈 줄, 16. 말씀" 모양이 아니에요 ' + got;
    // 다 읽은 뒤에도 다음 버튼은 글자 버튼
    S.setRead(43, 3, false); window.__lumenibGo?.('bible', { book: 43, ch: 3 }); await W(700);
    $('[data-a="read"]').click(); await W(200);
    const nx = $$('.bt-nav > button').find((b) => /4장/.test(b.textContent));
    const nextOk = nx && nx.classList.contains('text');
    S.setRead(43, 3, false);
    if (!nextOk) return '다 읽은 뒤 다음 버튼 모양이 바뀌어요';
    // 노트 쓰기 → 본문 고르기에서 뒤로 → 성경, 노트까지 가서 뒤로 → 성경
    window.__lumenibGo?.('bible', { book: 43, ch: 3 }); await W(700);
    const bibleTop = Math.round($('.bt-left').getBoundingClientRect().top);
    $('.bt-v[data-n="16"]').click(); await W(80); $('[data-a="write"]').click(); await W(700);
    if ($('.pill-back')?.textContent.trim() !== '성경') return '성경에서 온 본문 고르기의 뒤로 버튼 이름이 "성경"이 아니에요';
    const pickTop = Math.round($('.bible-panel').getBoundingClientRect().top);
    if (pickTop !== bibleTop) return `본문 고르기 패널 위치(${pickTop})가 성경 탭(${bibleTop})과 달라요`;
    $('[data-act="home"]').click(); await W(700);
    if (!$('.bible-tab')) return '본문 고르기에서 뒤로 가면 성경으로 안 가요';
    $('.bt-v[data-n="16"]').click(); await W(80); $('[data-a="write"]').click(); await W(700);
    $('[data-act="start"]').click(); await W(1500);
    $('[data-act="back"]').click(); await W(900);
    if (!$('.bible-tab')) return '노트 쓰기에서 뒤로 가면 성경으로 안 가요';
    // 내비게이션 높이: 홈 · 성경 · 노트 같은 자리 같은 크기
    const navs = [];
    for (const sc of ['home', 'bible', 'notes']) { window.__lumenibGo?.(sc); await W(500); const r = $('.home-nav').getBoundingClientRect(); navs.push(`${Math.round(r.top)}/${Math.round(r.height)}`); }
    S.settings.bibleLoc = loc0; S.saveSettings();
    window.__lumenibGo?.('home'); await W(300);
    return new Set(navs).size === 1 || '내비게이션 높이가 화면마다 달라요 ' + navs;
  });

  await check('성경 탭 북마크(묶음): 여러 절 전부 표시 · 똑같은 범위는 흐리게 · 겹쳐도 따로 저장 · 해제 없음 · 저장 되돌리기', async () => {
    const W = wait;
    const mine = () => S.bookmarks().filter((x) => x.book === 19 && x.ch === 100);
    const clean = () => mine().forEach((x) => S.removeBookmark(x));
    clean();
    window.__lumenibGo?.('bible', { book: 19, ch: 100 }); await W(700);
    $('.bt-v[data-n="2"]').click(); await W(80); $('.bt-v[data-n="4"]').click(); await W(150);
    $('[data-a="bm"]').click(); await W(400);
    const marks = $$('.bt-v').filter((v) => v.querySelector('.bt-bm')).map((v) => +v.dataset.n).join(',');
    if (marks !== '2,3,4') { clean(); return '북마크 표시가 2,3,4절이 아니에요: ' + marks; }
    $('.bt-v[data-n="2"]').click(); await W(80); $('.bt-v[data-n="4"]').click(); await W(150);
    if (!$('[data-a="bm"]').disabled) { clean(); return '똑같은 범위인데 북마크 버튼이 흐려지지 않아요'; }
    if (/해제/.test($('.bt-hacts').textContent)) { clean(); return '성경 탭에 북마크 해제가 있어요'; }
    $('[data-a="x"]').click(); await W(150);
    $('.bt-v[data-n="3"]').click(); await W(150);
    if ($('[data-a="bm"]').disabled) { clean(); return '겹치는 다른 범위인데 북마크 버튼이 막혀요'; }
    $('[data-a="bm"]').click(); await W(400);
    const n2 = mine().length;
    $('#toast button')?.click(); await W(400);
    const n3 = mine().length;
    clean(); window.__lumenibGo?.('home'); await W(300);
    if (n2 !== 2) return '겹치는 범위가 따로 저장되지 않아요 ' + n2;
    return n3 === 1 || '저장 토스트의 되돌리기가 안 돼요 ' + n3;
  });

  await check('노트 탭 노트 쓰기(펜) 버튼: 검색 왼쪽(펜 · 검색 · 설정, 11/26) · 누르면 본문 고르기(뒤로 = 노트) · 노트 쓰고 나오면 노트 목록', async () => {
    const W = wait;
    window.__lumenibGo?.('notes'); await W(600);
    const pen = $('.home-nav [data-act="write-note"]'), gear = $('.home-nav [data-act="search"]');
    if (!pen) return '펜 버튼이 없어요';
    const pr = pen.getBoundingClientRect(), gr = gear.getBoundingClientRect();
    if (Math.round(gr.left - pr.right) !== 4 || Math.round(pr.width) !== 40) return `펜 버튼 자리·크기가 시안과 달라요 (간격 ${gr.left - pr.right}, 폭 ${pr.width})`;
    pen.click(); await W(800);
    if ($('.pill-back')?.textContent.trim() !== '노트') return '본문 고르기 뒤로 버튼 이름이 "노트"가 아니에요';
    $('[data-act="home"]').click(); await W(700);
    if (!$('.nl-wrap')) return '본문 고르기에서 뒤로 가면 노트 목록으로 안 가요';
    $('.home-nav [data-act="write-note"]').click(); await W(800);
    // 본문이 있어야 완료로 바로 나가요 (본문 없으면 본문을 물어봐요)
    $$('button').find((x) => x.textContent.trim() === '창세기')?.click(); await W(400);
    $$('button').find((x) => x.textContent.trim() === '1장')?.click(); await W(600);
    $('.verse[data-n="1"]')?.click(); await W(300);
    $('[data-act="start"]')?.click(); await W(1500);
    $('[data-act="back"]')?.click(); await W(900);
    if (!$('.nl-wrap')) return '노트를 쓰고 나오면 노트 목록으로 안 가요';
    if ($('.home-nav [data-act="home"]') && $('.home [data-act="write-note"]') && window.__lumenibGo) { window.__lumenibGo('home'); await W(400); }
    return !$('.home [data-act="write-note"]') || '홈에도 펜 버튼이 보여요';
  });

  await check('본문 고르기 처음: 권 목록에 표시(테두리) 없음 · 권을 고르면 표시', async () => {
    const W = wait;
    window.__lumenibGo?.('pick'); await W(800);
    if (!$('.book-btn')) return '처음에 권 목록이 안 보여요';
    if ($('.book-btn.cur')) return '처음인데 권에 표시가 있어요: ' + $('.book-btn.cur').textContent;
    $$('.book-btn').find((b) => b.textContent.trim() === '출애굽기')?.click(); await W(500);
    $('.bp-head [data-act="books"], .bp-book-dd, .bp-dd')?.click(); await W(400);
    const cur = $('.book-btn.cur')?.textContent.trim();
    window.__lumenibGo?.('home'); await W(300);
    return !cur || cur === '출애굽기' || '고른 권 표시가 달라요 ' + cur;
  });

  await check('북마크 탭(T10): 상단 탭으로 열림 · 카드(구절·역본·본문) · 본문별 · 검색 · 카드 누르면 성경 그 절 · 선택 삭제와 되돌리기 · 역본 다르면 따로', async () => {
    const W = wait;
    const before = S.bookmarks().map((b) => ({ ...b }));
    before.forEach((b) => S.removeBookmark(b));
    S.addBookmark({ book: 43, ch: 3, from: 16, to: 16 });
    S.addBookmark({ book: 19, ch: 23, from: 1, to: 2 });
    S.addBookmark({ book: 19, ch: 23, from: 1, to: 2, tr: 'snb' }); // 역본이 다르면 따로
    const restore = () => { S.bookmarks().forEach((b) => S.removeBookmark(b)); S.restoreBookmarks(before); };
    try {
      if (S.bookmarks().length !== 3) return '역본이 다른 같은 구절이 따로 저장되지 않아요';
      window.__lumenibGo?.('home'); await W(400);
      $('.home-nav [data-act="bookmarks"]').click(); await W(1200);
      if (!/북마크\s*3/.test($('.nl-title')?.textContent || '')) return '북마크 탭이 안 열리거나 개수가 달라요 ' + $('.nl-title')?.textContent;
      const c = $$('.bm-card').find((x) => /요 3:16/.test(x.textContent));
      if (!c || !/개역한글/.test(c.textContent) || !/독생자/.test(c.querySelector('.bm-text').textContent)) return '카드에 구절·역본·본문이 없어요';
      if (!$$('.bm-card').some((x) => /표준새번역/.test(x.textContent))) return '다른 역본 이름이 안 보여요';
      const tr = $$('.bm-tr').find((x) => /표준새번역/.test(x.textContent));
      if (tr.scrollWidth > tr.clientWidth + 1 || tr.getBoundingClientRect().height > 20) return '"표준새번역"이 한 줄에 안 들어가요';
      // 본문별: 권으로 묶고 성경 순서 (시편이 요한복음보다 먼저)
      $('[data-view="passage"]').click(); await W(300);
      const heads = $$('.nl-gh').map((h) => h.firstChild.textContent.trim());
      if (heads.join(',') !== '시편,요한복음') return '본문별 묶음이 달라요 ' + heads;
      $('[data-view="date"]').click(); await W(300);
      // 검색: 본문 글자로
      // 검색 (11/26 피그마 T10): 위 검색 아이콘(설정 왼쪽) → 검색 화면 → 결과 "북마크 N" → 취소
      if ($('.nl-head .nl-search')) return '북마크 머리에 예전 검색창이 남아 있어요';
      const sb = $('.home-nav [data-act="search"]'); if (!sb) return '북마크 탭에 검색 아이콘이 없어요';
      if (Math.round($('.home-nav [data-act="settings"]').getBoundingClientRect().left - sb.getBoundingClientRect().right) !== 4) return '검색 아이콘이 설정 바로 왼쪽이 아니에요';
      sb.click(); await W(200);
      const inp = $('.ns-bar input'); inp.value = '독생자'; inp.dispatchEvent(new Event('input')); await W(200);
      if ($$('.ns-list .bm-card').length !== 1) return '본문 검색이 안 돼요 ' + $$('.bm-card').length;
      if (!/^북마크1$/.test($('.ns-list .nl-gh')?.textContent || '')) return '검색 결과 머리가 "북마크 N"이 아니에요';
      $('[data-act="search-cancel"]').click(); await W(200);
      if (!$('.nl-head')) return '취소하면 북마크 목록으로 안 돌아가요';
      // 선택 삭제 → 되돌리기
      $('[data-act="select"]').click(); await W(200);
      if ($('.bm-card .bm-date')) return '선택 모드에서 날짜가 안 숨겨져요';
      $$('.bm-card')[0].click(); await W(150);
      if (!/1개 선택됨/.test($('.nl-title').textContent)) return '선택 표시가 달라요';
      $('[data-act="del"]').click(); await W(300);
      if (S.bookmarks().length !== 2) return '삭제가 안 돼요';
      $('#toast button')?.click(); await W(300);
      if (S.bookmarks().length !== 3) return '되돌리기가 안 돼요';
      // 카드 누르면 성경 탭 그 장 · 그 절
      $$('.bm-card').find((x) => /요 3:16/.test(x.textContent)).click(); await W(900);
      if (!/요한복음 3장/.test($('.bt-htitle')?.textContent || '')) return '카드를 누르면 성경 그 장으로 안 가요';
      if ($('.bt-v.sel')) return '카드로 열었는데 구절이 선택돼 있어요';
      const v = $('.bt-v[data-n="16"]'), sc = $('.bt-scroll');
      if (v.getBoundingClientRect().top < sc.getBoundingClientRect().top) return '북마크한 절이 위쪽 머리줄에 가려져요';
      if (!v.classList.contains('flash')) return '북마크한 절이 잠깐 표시되지 않아요';
      return true;
    } finally { restore(); window.__lumenibGo?.('home'); await W(300); }
  });

  await check('바텀시트(Aa): 화면 아래에서 12 · 아래로 밀면 닫힘', async () => {
    const W = wait;
    window.__lumenibGo?.('bible', { book: 43, ch: 3 }); await W(700);
    $('[data-a="aa"]').click(); await W(400);
    const sh = $('.bsheet');
    if (!sh) return '바텀시트가 안 열려요';
    sh.style.animation = 'none'; // 숨은 창에선 올라오는 애니메이션이 멈춰 있어서 끝 상태로 재요
    const gap = Math.round(innerHeight - sh.getBoundingClientRect().bottom);
    if (gap !== 12) return '화면 아래 간격이 12가 아니에요: ' + gap;
    const r = sh.getBoundingClientRect(), x = r.left + r.width / 2, y = r.top + 120;
    const pe = (type, yy) => sh.dispatchEvent(new PointerEvent(type, { clientX: x, clientY: yy, pointerId: 77, pointerType: 'touch', bubbles: true, button: 0, buttons: type === 'pointerup' ? 0 : 1 }));
    pe('pointerdown', y);
    for (let i = 1; i <= 10; i++) { pe('pointermove', y + i * 20); await W(16); }
    pe('pointerup', y + 200); await W(500);
    const closed = !$('.bsheet');
    window.__lumenibGo?.('home'); await W(300);
    return closed || '아래로 밀어도 안 닫혀요';
  });

  await check('홈 이어서 읽기 카드: 읽던 곳 없음 = 성경 읽기·창세기 1장부터 · 북마크 없음 문구 · 북마크 있으면 최근 칩(누르면 그 구절) · 읽던 곳 있으면 이어서 읽기', async () => {
    const W = wait;
    const loc0 = S.settings.bibleLoc, bm0 = S.bookmarks().map((b) => ({ ...b }));
    try {
      S.settings.bibleLoc = undefined; S.saveSettings(); bm0.forEach((b) => S.removeBookmark(b));
      window.__lumenibGo?.('home'); await W(800);
      const h = $('.continue-card h2').textContent.replace(/\s+/g, ' ').trim();
      if (h !== '성경 읽기 창세기 1장부터') return '읽던 곳 없을 때 제목이 달라요: ' + h;
      if (!/태초에/.test($('.gen81').textContent)) return '창 1:1 미리보기가 아니에요';
      if (!/성경에서 구절을 골라 북마크하면 여기에 모여요/.test($('.bm-row').textContent) || $('.bm-row .chip')) return '북마크 없음 문구가 달라요';
      const hh = $('.continue-card').getBoundingClientRect().height;
      S.addBookmark({ book: 45, ch: 8, from: 28, to: 28 });
      S.settings.bibleLoc = { book: 43, ch: 3, v: 16, t: Date.now() }; S.saveSettings();
      window.__lumenibGo?.('home'); await W(800);
      if (!/^이어서 읽기/.test($('.continue-card h2').textContent.trim()) || !/요한복음 3장 16절/.test($('.continue-card h2').textContent)) return '읽던 곳이 있을 때 이어서 읽기가 아니에요';
      if (Math.abs($('.continue-card').getBoundingClientRect().height - hh) > 0.5) return '빈 상태와 카드 높이가 달라요';
      const chip = $('.bm-row .chip');
      if (!chip || chip.textContent.trim() !== '롬 8:28') return '최근 북마크 칩이 안 보여요';
      chip.click(); await W(900);
      if (!/로마서 8장/.test($('.bt-htitle')?.textContent || '')) return '칩을 누르면 그 구절로 안 가요';
      return true;
    } finally {
      S.bookmarks().forEach((b) => S.removeBookmark(b)); S.restoreBookmarks(bm0);
      S.settings.bibleLoc = loc0; S.saveSettings(); window.__lumenibGo?.('home'); await W(300);
    }
  });

  await check('설정(v3): 톱니로 열림 · 메뉴 4개 페이지 · 권별 지우기 · 화면 모드 시스템/라이트/다크 · 두 번 탭 기본 iPad 설정 · 도형 끄기 · 약관 페이지', async () => {
    const W = wait;
    const th0 = S.settings.theme, tap0 = S.settings.pencilTap, sh0 = S.settings.autoShape;
    try {
      window.__lumenibGo?.('home'); await W(300);
      $('.home-nav [data-act="settings"]').click(); await W(400);
      if ($('.st-head h2')?.textContent !== '계정 · 보관') return '톱니를 누르면 설정 계정 · 보관이 아니에요';
      if (!$('[data-act="track"]')) return '앱 사용 기록 스위치가 없어요';
      for (const [k, t] of [['reading', '읽기 기록'], ['display', '화면과 입력'], ['help', '도움말 · 앱 정보']]) {
        $(`.st-mi[data-go="${k}"]`).click(); await W(200);
        if ($('.st-head h2').textContent !== t || !$(`.st-mi[data-go="${k}"]`).classList.contains('on')) return `${t} 메뉴가 안 열려요`;
      }
      // 화면 모드
      $('[data-go="display"]').click(); await W(200);
      if (S.settings.theme !== 'system' && th0 === undefined) return '화면 모드 기본이 시스템이 아니에요';
      $('[data-theme="light"]').click(); await W(150);
      if (document.documentElement.dataset.theme !== 'light') return '라이트를 골라도 안 바뀌어요';
      $('[data-theme="dark"]').click(); await W(150);
      if (document.documentElement.dataset.theme !== 'dark') return '다크를 골라도 안 바뀌어요';
      $('[data-theme="system"]').click(); await W(150);
      const sys = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
      if (document.documentElement.dataset.theme !== sys) return '시스템 설정을 따르지 않아요';
      // Apple Pencil 두 번 탭
      if (!/iPad 설정 따르기/.test($('[data-act="go-pencil"]').textContent) && !tap0) return '두 번 탭 기본이 iPad 설정이 아니에요';
      $('[data-act="go-pencil"]').click(); await W(200);
      $('[data-tap="switchEraser"]').click(); await W(150);
      if (S.settings.pencilTap !== 'switchEraser') return '두 번 탭 고르기가 저장 안 돼요';
      $('.st-back').click(); await W(150);
      if (!/지우개로 바꾸기/.test($('[data-act="go-pencil"]').textContent)) return '고른 두 번 탭이 화면과 입력에 안 보여요';
      // 도형 끄기
      $('[data-act="shape"]').click(); await W(150);
      if (S.settings.autoShape !== false) return '도형 스위치가 저장 안 돼요';
      // 약관
      $('[data-go="help"]').click(); await W(150);
      for (const k of ['terms', 'privacy', 'bible', 'licenses']) {
        $(`[data-act="go-${k}"]`).click(); await W(150);
        if (!$('.st-legal')?.textContent.trim()) return k + ' 페이지가 비어 있어요';
        $('.st-back').click(); await W(150);
      }
      return true;
    } finally {
      S.settings.theme = th0 || 'system'; S.settings.pencilTap = tap0 || 'system'; S.settings.autoShape = sh0 !== false; S.saveSettings();
      document.documentElement.dataset.theme = (S.settings.theme === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : S.settings.theme);
      window.__lumenibGo?.('home'); await W(300);
    }
  });

  await check('설정 > 읽기 기록 > 권별로 지우기: 읽은 권만 보이고, 골라서 지우면 그 권만 지워짐', async () => {
    const W = wait;
    const snap = [55, 56].map((b) => [b, [1, 2, 3, 4].map((c) => S.isRead(b, c))]);
    try {
      S.setRead(55, 1, true); S.setRead(56, 1, true);
      window.__lumenibGo?.('settings', { page: 'reading' }); await W(200);
      $('[data-act="go-books"]').click(); await W(200);
      const names = $$('.st-book .st-rtt').map((x) => x.textContent);
      if (!names.includes('디모데후서') || !names.includes('디도서')) return '읽은 권이 목록에 없어요 ' + names;
      $('.st-book[data-book="55"]').click(); await W(150);
      if (!/1권 읽기 기록 지우기/.test($('[data-act="reset-books"]').textContent)) return '버튼 문구가 달라요';
      $('[data-act="reset-books"]').click(); await W(200);
      $('.dim [data-a="yes"]').click(); await W(200);
      if (S.isRead(55, 1) || !S.isRead(56, 1)) return '고른 권만 지워지지 않아요';
      return true;
    } finally {
      snap.forEach(([b, arr]) => arr.forEach((on, i) => S.setRead(b, i + 1, on)));
      window.__lumenibGo?.('home'); await W(300);
    }
  });

  await check('온보딩: 5장(환영 · 필기 · 인용 끌어오기 · 예전 노트 · 보관) · 건너뛰기 · 동의해야 로그인 버튼', async () => {
    const W = wait;
    const ob0 = S.settings.onboarded;
    try {
      window.__lumenibGo?.('onboarding'); await W(300);
      if (!/말씀의 빛을 필기로 남기다/.test($('.ob h1').textContent)) return '환영 화면이 아니에요';
      const titles = [];
      for (let k = 0; k < 3; k++) { $('[data-a="next"]').click(); await W(600); titles.push($('.ob h1').textContent); if (!$('.ob-art svg')) return '그림이 안 나와요 ' + titles.at(-1); }
      if (titles[1] !== '설교에 나온 다른 구절도 끌어와요') return '인용구 끌어오기 장이 없어요 ' + titles;
      const loginOk = !!$('[data-a="next"]') && $('[data-a="next"]').textContent === '다음';
      if (loginOk) {
        $('[data-a="next"]').click(); await W(300);
        if (!/보관할까요/.test($('.ob h1').textContent)) return '보관 장이 아니에요';
        if ($$('[data-p]').some((b) => !b.disabled)) return '동의 전에 로그인 버튼이 눌려요';
        $('[data-a="agree"]').click(); await W(100);
        if ($$('[data-p]').some((b) => b.disabled)) return '동의해도 로그인 버튼이 안 켜져요';
        $('[data-a="later"]').click(); await W(400);
      } else { $('[data-a="next"]').click(); await W(400); }
      if (!$('.home-inner') || !S.settings.onboarded) return '끝내면 홈으로 안 가요';
      window.__lumenibGo?.('onboarding'); await W(300); $('[data-a="next"]').click(); await W(300);
      $('[data-a="skip"]').click(); await W(300);
      return !!$('.home-inner') || '건너뛰기가 안 돼요';
    } finally { S.settings.onboarded = ob0; S.saveSettings(); window.__lumenibGo?.('home'); await W(300); }
  });

  // 정리: 점검용으로 만든 노트를 지우고 처음 화면으로
  S.allNotes().filter((n) => !before.has(n.id)).forEach((n) => S.deleteNote(n.id));
  S.settings.lastPaper = lastPaper; S.saveSettings();
  S.saveNotes(true);
  location.hash = ''; setTimeout(() => location.reload(), 50);
  return out;
}
